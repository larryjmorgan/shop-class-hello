"""End to end: load -> build -> baseline -> optimize -> verify -> KPIs."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from .io import input_from_tables, load_input, now_et
from .kpi import change_rows, kpis, order_results, score_key, slot_loads
from .mcp_source import is_config, load_from_config
from .models import Issue, Schedule
from .optimizer import optimize
from .previous import Previous, latest_history, load_previous
from .problem import Problem, build_problem
from .schedule import dispatch, verify
from .staged import optimize_staged


@dataclass
class Result:
    problem: Problem
    baseline: Schedule
    optimized: Schedule
    kpi_base: dict
    kpi_opt: dict
    orders: list
    loads: list
    generated_at: datetime
    data_age_min: Optional[int]
    stale: bool
    issues: list
    snapshot: object = None      # what was pulled from MCP / SQL (None for file input)
    changes: list = None         # what changed since the previous published schedule
    candidates: list = None      # (label, kpis) of every schedule considered


def _resolve_previous(previous, out_dir, day):
    if previous is None or isinstance(previous, Previous):
        return previous
    if str(previous) == "auto":
        f = latest_history(out_dir, day) if out_dir else None
        return load_previous(f) if f else None
    return load_previous(previous)


def run(path=None, schedule_date=None, horizon_days=None, seconds=None, as_of=None, rule=None,
        log=False, workers=None, previous=None, rules_path=None, policy="optimizer", out_dir=None,
        tables=None, source="", fallback_data_as_of=None) -> Result:
    """policy: "optimizer" (default) or a dispatch rule name (edd, fifo, cr, slack, spt) to run that rule only."""
    snapshot = None
    if tables is not None:
        data = input_from_tables(tables, source or "tables", fallback_data_as_of, rules_path=rules_path)
    elif is_config(path):
        data, snapshot = load_from_config(path, rules_path)
    else:
        data = load_input(path, rules_path)
    st = data.settings
    issues_extra = []
    first_day = None
    # build once to learn the first working day, then again with the previous schedule if one was given
    prob = build_problem(data, schedule_date, horizon_days, as_of)
    prev = None
    try:
        prev = _resolve_previous(previous, out_dir, prob.days[0])
    except Exception as e:
        issues_extra.append(Issue("error", "Previous schedule", f"could not read it: {e}. Stability not applied."))
    if prev is not None:
        prob = build_problem(data, schedule_date, horizon_days, as_of, previous=prev)
    issues = list(prob.issues) + issues_extra
    if not prob.batches:
        raise ValueError("No orders to schedule after validation and the planning time fence.\n"
                         + "\n".join(map(str, issues)))

    order = st.priority_order
    base_rule = rule or (policy if policy in ("edd", "fifo", "cr", "slack", "spt") else st.baseline_rule)
    base = dispatch(prob, base_rule)
    bad = verify(prob, base)
    if bad:
        raise RuntimeError("Baseline failed verification:\n" + "\n".join(bad[:10]))
    k_base = kpis(prob, base)
    cands = [("Dispatch rule baseline", base, k_base)]

    if policy == "optimizer":
        secs = st.solve_seconds if seconds is None else float(seconds)
        attempts = [("Full model", lambda: optimize(prob, secs, workers, hint=base, log=log))]
        if len(prob.batches) > 20:
            attempts.insert(0, ("Two-step", lambda: optimize_staged(prob, secs, workers, log)))
            # the two-step method uses the whole budget (including its own polish), so no separate full run
            attempts = attempts[:1]
        for label, fn in attempts:
            try:
                s = fn()
            except RuntimeError as e:
                issues.append(Issue("error", "Optimizer", f"{label}: {e}. Showing the dispatch-rule schedule instead."))
                continue
            bad = verify(prob, s)
            if bad:
                issues.append(Issue("error", "Verifier", f"{label} schedule failed verification and was discarded: "
                                    + "; ".join(bad[:5])))
                continue
            cands.append((s.method, s, kpis(prob, s)))
    best = min(cands, key=lambda c: score_key(c[2], order))
    opt, k_opt = best[1], best[2]
    if policy == "optimizer" and opt is base:
        issues.append(Issue("warn", "Optimizer", "No optimized schedule beat the dispatch rule by the priority order "
                            "within the time limit; showing the dispatch schedule. Raise solve_seconds."))

    now = now_et()
    age = int((now - st.data_as_of).total_seconds() // 60) if st.data_as_of else None
    stale = age is not None and age > st.max_data_age_min
    if age is not None and age < -5:
        stale = True
        issues.append(Issue("error", "Data", f"The data timestamp is {-age} minutes in the future. This is almost always a "
                            "timezone mismatch (set freshness.assume_tz in the source config). Treating the data as unverified."))
    if stale and age > st.max_data_age_min:
        issues.append(Issue("error", "Data", f"Input data is {age} minutes old (limit {st.max_data_age_min}). "
                            "Do not release this schedule until the ERP extract is refreshed."))
    for oid, why in prob.excluded:
        issues.append(Issue("warn", f"Order {oid}", why))
    for n in opt.notes:
        issues.append(Issue("warn", "Optimizer", n))
    changes = change_rows(prob, opt) if prev is not None else None
    return Result(prob, base, opt, k_base, k_opt, order_results(prob, opt), slot_loads(prob, opt), now, age, stale,
                  issues, snapshot, changes, [(lbl, k) for lbl, _, k in cands])
