"""Backtest on history, and check the standards the schedule depends on.

HISTORY FILE: the same sheets as a normal input (Orders, Parts, Cells, Changeover, Settings), where Orders
also carries what really happened:
    release_date    when the order became known to scheduling (blank = known from the start of the window)
    actual_finish   when it really finished (blank = not finished)
    actual_run_min  the real run minutes (optional, used by the standards check)

`standards`  compares actual_run_min with qty x run_min_per_unit, by hose type and part. If the standards
             are off, no schedule built on them can be right, so check this first.
`backtest`   replays the window one working day at a time. Each day it schedules the open orders with a
             policy, "executes" that day's schedule at standard time (times --slowdown), carries unfinished
             work and the cell's last hose type forward, and scores on-time delivery for orders due in the
             window. The same replay runs for each policy, and the real outcome is shown next to them.

Limits: a replay is not the plant. It assumes the published day runs as planned (scaled by --slowdown), no
breakdowns, no rework, and the same orders known on the same days. Use it to compare policies and to sanity
check the numbers, not as a promise.
"""
from __future__ import annotations

import math
import random
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from .io import _blank, now_et, normalize_tables, parse_date, parse_dt, read_tables
from .problem import is_workday, next_workday


# ------------------------------------------------------------------ standards check
def standards_report(tables: dict, flag_pct: float = 0.15, min_n: int = 3) -> dict:
    t = normalize_tables(tables)
    orders, parts = t["orders"], t["parts"].set_index("part_number")
    if "actual_run_min" not in orders.columns:
        raise ValueError("Orders needs an actual_run_min column for the standards check.")
    rows = []
    for _, r in orders.iterrows():
        pn = str(r["part_number"]).strip()
        if pn not in parts.index or _blank(r.get("actual_run_min")):
            continue
        std = float(r["qty"]) * float(parts.loc[pn, "run_min_per_unit"])
        act = float(r["actual_run_min"])
        if std > 0 and act > 0:
            rows.append(dict(part_number=pn, hose_type=parts.loc[pn, "hose_type"], std_min=std, actual_min=act, ratio=act / std))
    df = pd.DataFrame(rows)
    if df.empty:
        raise ValueError("No orders with both a known part and actual_run_min.")

    def summarize(g):
        return pd.Series(dict(
            n=int(len(g)), std_min=g["std_min"].sum(), actual_min=g["actual_min"].sum(),
            median_ratio=g["ratio"].median(), p90_ratio=g["ratio"].quantile(0.9),
            within_20pct=(g["ratio"].between(0.8, 1.2)).mean()))
    by_type = df.groupby("hose_type").apply(summarize, include_groups=False).reset_index()
    by_part = df.groupby(["hose_type", "part_number"]).apply(summarize, include_groups=False).reset_index()
    by_part["flag"] = ((by_part["n"] >= min_n) & ((by_part["median_ratio"] - 1).abs() > flag_pct)).map(
        {True: "re-time this part", False: ""})
    by_type["suggested_efficiency"] = (1 / by_type["median_ratio"]).round(2)
    overall = summarize(df)
    return dict(by_type=by_type, by_part=by_part.sort_values(["flag", "median_ratio"], ascending=[False, False]), overall=overall)


# ------------------------------------------------------------------ replay
@dataclass
class SimResult:
    policy: str
    completion: dict = field(default_factory=dict)     # order_id -> datetime finished
    setup_min: int = 0
    overtime_min: int = 0
    run_min: int = 0
    days_run: int = 0
    notes: list = field(default_factory=list)


def _workdays(start: date, n: int, holidays=()) -> list:
    out, d = [], next_workday(start, set(holidays))
    while len(out) < n:
        if is_workday(d, set(holidays)):
            out.append(d)
        d += timedelta(days=1)
    return out


def simulate(tables: dict, start: date, end: date, policy: str = "optimizer", seconds: float = 10,
             slowdown: float = 1.0, tail_days: int = 3, horizon_days: int = 3) -> SimResult:
    from . import pipeline
    t = normalize_tables(tables)
    orders = t["orders"].copy()
    st_df = t.get("settings")
    if st_df is not None:
        keep = st_df[~st_df["key"].isin(["schedule_date", "as_of", "data_as_of", "horizon_days"])]
        settings = keep
    else:
        settings = pd.DataFrame(columns=["key", "value"])
    from .io import parse_settings
    due_cut = parse_settings(settings).due_cutoff
    hol = parse_settings(settings).holidays
    orders["_due"] = [parse_dt(v, due_cut) for v in orders["due_date"]]
    rel_col = orders["release_date"] if "release_date" in orders.columns else pd.Series([None] * len(orders), index=orders.index)
    orders["_rel"] = [parse_date(v) if not _blank(v) else start for v in rel_col]
    # Start each order from its real state: work already finished before the window is not backlog.
    has_actual = "actual_finish" in orders.columns
    remaining, pre_done = {}, {}
    for _, r in orders.iterrows():
        done_before = False
        if has_actual and not _blank(r["actual_finish"]):
            done_before = parse_dt(r["actual_finish"], datetime.min.time()) < datetime.combine(start, datetime.min.time())
        elif not has_actual:
            done_before = r["_due"].date() < start        # no actuals at all: assume anything due before the window shipped
        remaining[str(r["order_id"])] = 0 if done_before else int(float(r["qty"]))
        if done_before:                                  # their real outcome counts the same for every policy
            pre_done[str(r["order_id"])] = (parse_dt(r["actual_finish"], datetime.min.time())
                                            if has_actual else r["_due"] - timedelta(minutes=1))
    cells = t["cells"].copy()
    state = {str(r["cell_id"]): (r.get("current_hose_type"), r.get("current_part")) for _, r in cells.iterrows()}
    d, days = next_workday(start, set(hol)), []
    last = end + timedelta(days=tail_days + int(tail_days * 0.5) + 2)
    while d <= last:
        if is_workday(d, set(hol)):
            days.append(d)
        d += timedelta(days=1)
    res = SimResult(policy)
    res.completion.update(pre_done)
    base_cols = [c for c in ("order_id", "part_number", "qty", "due_date", "hot", "priority", "kit_ready", "customer") if c in orders.columns]
    post_end = 0
    for D in days:
        if D > end:
            post_end += 1
            if post_end > tail_days:
                break
        open_mask = [(r["_rel"] <= D) and remaining[str(r["order_id"])] > 0 for _, r in orders.iterrows()]
        op_df = orders.loc[open_mask, base_cols].copy()
        if op_df.empty:
            continue
        op_df["qty"] = [remaining[str(o)] for o in op_df["order_id"]]
        cdf = cells.copy()
        cdf["current_hose_type"] = [state[str(c)][0] for c in cdf["cell_id"]]
        cdf["current_part"] = [state[str(c)][1] for c in cdf["cell_id"]]
        tb = {k: v for k, v in t.items() if k not in ("orders", "cells", "settings", "overrides")}
        tb.update(orders=op_df, cells=cdf, settings=settings)
        try:
            r = pipeline.run(tables=tb, schedule_date=D, horizon_days=horizon_days, seconds=seconds, policy=policy,
                             fallback_data_as_of=(now_et(), None))
        except ValueError:
            continue                                   # nothing releasable today
        res.days_run += 1
        for slot_idx, ops in r.optimized.ops.items():
            s = r.problem.slots[slot_idx]
            if s.day_index != 0:
                continue
            prev_end, done_any = s.off0, False
            for op in ops:
                dur = op.end - op.start
                start_w = op.start if slowdown == 1.0 else max(op.start, prev_end + op.setup_min)
                end_w = start_w + (dur if slowdown == 1.0 else int(math.ceil(dur * slowdown)))
                if end_w > s.axis:
                    break                              # did not finish today: stays open, replanned tomorrow
                prev_end, done_any = end_w, True
                b = op.batch
                finish = r.problem.dt(s.clock(end_w, False))
                remaining[b.order_id] -= b.size
                res.setup_min += op.setup_min
                res.run_min += end_w - start_w
                if remaining[b.order_id] <= 0:
                    res.completion[b.order_id] = max(finish, res.completion.get(b.order_id, finish))
                state[s.cell.cell_id] = (b.hose_type, b.part_number)
            if done_any:
                res.overtime_min += max(0, prev_end - s.avail)
    return res


def score(tables: dict, start: date, end: date, sim: SimResult) -> dict:
    t = normalize_tables(tables)
    orders = t["orders"]
    from .io import parse_settings
    due_cut = parse_settings(t.get("settings", pd.DataFrame(columns=["key", "value"]))).due_cutoff
    coh, late_h, on, unf = [], [], 0, 0
    for _, r in orders.iterrows():
        due = parse_dt(r["due_date"], due_cut)
        if not (start <= due.date() <= end):
            continue
        oid = str(r["order_id"])
        coh.append(oid)
        fin = sim.completion.get(oid)
        if fin is None:
            unf += 1
        elif fin <= due:
            on += 1
        else:
            late_h.append((fin - due).total_seconds() / 3600)
    n = len(coh)
    return dict(policy=sim.policy, orders=n, on_time=on, late=len(late_h), unfinished=unf,
                otd_pct=100.0 * on / n if n else 0.0, avg_hours_late=sum(late_h) / len(late_h) if late_h else 0.0,
                setup_min=sim.setup_min, overtime_min=sim.overtime_min, days_run=sim.days_run)


def actual_outcome(tables: dict, start: date, end: date) -> dict | None:
    t = normalize_tables(tables)
    o = t["orders"]
    if "actual_finish" not in o.columns:
        return None
    from .io import parse_settings
    due_cut = parse_settings(t.get("settings", pd.DataFrame(columns=["key", "value"]))).due_cutoff
    n = on = late = unf = 0
    hrs = []
    for _, r in o.iterrows():
        due = parse_dt(r["due_date"], due_cut)
        if not (start <= due.date() <= end):
            continue
        n += 1
        if _blank(r["actual_finish"]):
            unf += 1
            continue
        fin = parse_dt(r["actual_finish"], datetime.min.time())
        if fin <= due:
            on += 1
        else:
            late += 1
            hrs.append((fin - due).total_seconds() / 3600)
    return dict(policy="ACTUAL (history)", orders=n, on_time=on, late=late, unfinished=unf,
                otd_pct=100.0 * on / n if n else 0.0, avg_hours_late=sum(hrs) / len(hrs) if hrs else 0.0,
                setup_min=None, overtime_min=None, days_run=None)


def run_backtest(path, start: date, end: date, policies=("optimizer", "edd", "fifo"), seconds: float = 10,
                 slowdown: float = 1.0, tail_days: int = 3, log=print) -> dict:
    tables = read_tables(Path(path))
    rows, sims = [], {}
    act = actual_outcome(tables, start, end)
    for pol in policies:
        log(f"  replaying with policy: {pol} ...")
        sim = simulate(tables, start, end, pol, seconds, slowdown, tail_days)
        sims[pol] = sim
        rows.append(score(tables, start, end, sim))
    if act:
        rows.append(act)
    return dict(summary=pd.DataFrame(rows), sims=sims, tables=tables, start=start, end=end, slowdown=slowdown)


def write_backtest(bt: dict, path) -> Path:
    t = normalize_tables(bt["tables"])
    rows = []
    due_cut = None
    for _, r in t["orders"].iterrows():
        due = parse_dt(r["due_date"], datetime.min.time().replace(hour=15))
        if not (bt["start"] <= due.date() <= bt["end"]):
            continue
        oid = str(r["order_id"])
        row = dict(order_id=oid, part_number=r["part_number"], qty=r["qty"], due=due,
                   actual_finish=(r["actual_finish"] if "actual_finish" in t["orders"].columns else None))
        for pol, sim in bt["sims"].items():
            row[f"{pol}_finish"] = sim.completion.get(oid)
        rows.append(row)
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        bt["summary"].to_excel(xw, sheet_name="Summary", index=False)
        pd.DataFrame(rows).to_excel(xw, sheet_name="Orders", index=False)
        try:
            sr = standards_report(bt["tables"])
            sr["by_type"].to_excel(xw, sheet_name="Standards by type", index=False)
            sr["by_part"].to_excel(xw, sheet_name="Standards by part", index=False)
        except ValueError:
            pass
    return Path(path)


# ------------------------------------------------------------------ synthetic history (for trying the harness)
def make_synthetic_history(path, base: date = None, n_days: int = 15, seed: int = 21) -> Path:
    """FICTIONAL history to exercise the backtest. 'Actuals' come from a FIFO replay with run times
    that differ from the standards on purpose. Results from it say nothing about any real plant."""
    from .sample import build_sample
    rnd = random.Random(seed)
    path = Path(path)
    tmp = path.with_name(path.stem + "_base.xlsx")
    build_sample(tmp, base)
    sheets = pd.read_excel(tmp, sheet_name=None, dtype=object)
    tmp.unlink()
    parts = sheets["Parts"]
    days = _workdays(next_workday(base or now_et().date(), set()), n_days + 8)
    rows = []
    oid = 5000
    for i, d in enumerate(days[:n_days]):
        for _ in range(rnd.randint(9, 13)):
            oid += 1
            pn = rnd.choice(list(parts["part_number"]))
            lead = rnd.randint(2, 5)
            rel = days[max(0, i - lead)]
            rows.append(dict(order_id=f"H{oid}", part_number=pn, qty=rnd.choice([20, 30, 40, 60, 80, 100, 150, 200]),
                             due_date=d, hot="Y" if rnd.random() < 0.06 else "N", priority=rnd.choice([1, 2, 3, 3, 3, 4]),
                             kit_ready=None, customer=f"Customer {rnd.randint(1, 18):02d}", release_date=rel))
    orders = pd.DataFrame(rows)
    sheets["Orders"] = orders
    sheets.pop("Overrides", None)
    sheets.pop("Read me", None)
    st = sheets["Settings"]
    sheets["Settings"] = st[~st["key"].isin(["schedule_date", "data_as_of"])]
    hist = {k: v for k, v in sheets.items()}
    # actuals: FIFO replay at 8% slower, then per-order actual run minutes with type-specific bias
    tables = {k.lower(): v for k, v in hist.items()}
    sim = simulate(tables, days[0], days[n_days - 1], "fifo", seconds=1, slowdown=1.08, tail_days=3)
    bias = {"R2 Hydraulic": 1.18, "PTFE": 0.9, "Thermoplastic": 1.0, "R1 Hydraulic": 1.03, "Air-Water": 0.97}
    ptype = dict(zip(parts["part_number"], parts["hose_type"]))
    prun = dict(zip(parts["part_number"], parts["run_min_per_unit"].astype(float)))
    fin, act = [], []
    for _, r in orders.iterrows():
        std = float(r["qty"]) * prun[r["part_number"]]
        act.append(round(std * bias[ptype[r["part_number"]]] * rnd.lognormvariate(0, 0.1), 1))
        fin.append(sim.completion.get(r["order_id"]))
    orders["actual_finish"] = fin
    orders["actual_run_min"] = act
    sheets["Orders"] = orders
    path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        for k, v in sheets.items():
            v.to_excel(xw, sheet_name=k, index=False)
    return path
