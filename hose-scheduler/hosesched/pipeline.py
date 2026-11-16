"""End to end: load -> build -> baseline -> optimize -> verify -> KPIs."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Optional

from .io import load_input, now_et
from .mcp_source import is_config, load_from_config
from .kpi import kpis, order_results, slot_loads
from .models import Issue, Schedule
from .optimizer import optimize
from .problem import Problem, build_problem
from .schedule import dispatch, verify


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
    snapshot: object = None      # what was pulled from MCP (None for file input)


def run(path, schedule_date=None, horizon_days=None, seconds=None, as_of=None, rule=None,
        log=False, workers=None) -> Result:
    snapshot = None
    if is_config(path):
        data, snapshot = load_from_config(path)
    else:
        data = load_input(path)
    st = data.settings
    prob = build_problem(data, schedule_date, horizon_days, as_of)
    issues = list(prob.issues)
    if not prob.batches:
        raise ValueError("No orders to schedule after validation and the planning time fence.\n"
                         + "\n".join(map(str, issues)))

    base = dispatch(prob, rule or st.baseline_rule)
    bad = verify(prob, base)
    if bad:
        raise RuntimeError("Baseline failed verification:\n" + "\n".join(bad[:10]))

    try:
        opt = optimize(prob, seconds, workers, hint=base, log=log)
    except RuntimeError as e:
        issues.append(Issue("error", "Optimizer", f"{e}. Showing the dispatch-rule schedule instead."))
        opt = base
    bad = verify(prob, opt)
    if bad:
        issues.append(Issue("error", "Verifier", "Optimized schedule failed verification; showing the dispatch "
                            "schedule instead. " + "; ".join(bad[:5])))
        opt = base

    k_base, k_opt = kpis(prob, base), kpis(prob, opt)
    # Never publish something worse than the simple rule: keep the better of the two.
    if opt is not base and (k_opt["late"], k_opt["weighted_tardy_min"]) > (k_base["late"], k_base["weighted_tardy_min"]):
        issues.append(Issue("warn", "Optimizer", "The dispatch rule beat the optimizer on lateness within the time "
                            "limit; showing the dispatch schedule. Raise solve_seconds."))
        opt, k_opt = base, k_base

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
    return Result(prob, base, opt, k_base, k_opt, order_results(prob, opt), slot_loads(prob, opt), now, age, stale, issues, snapshot)
