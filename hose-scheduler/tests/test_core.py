"""Hand-checkable scenarios. Times are Eastern, one 8-hour shift, no lunch unless stated."""
from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from hosesched import pipeline
from hosesched.io import load_input, now_et
from hosesched.kpi import kpis
from hosesched.problem import build_problem
from hosesched.schedule import dispatch, place_sequence, verify

DAY = date(2026, 11, 16)  # a Monday


def make_inputs(tmp_path, orders, parts=None, cells=None, overrides=None, settings=None, changeover=None):
    parts = parts or [
        dict(part_number="A1", hose_type="A", run_min_per_unit=1.0, max_batch=100, setup_min=0),
        dict(part_number="A2", hose_type="A", run_min_per_unit=1.0, max_batch=100, setup_min=0),
        dict(part_number="B1", hose_type="B", run_min_per_unit=1.0, max_batch=100, setup_min=0),
        dict(part_number="B2", hose_type="B", run_min_per_unit=1.0, max_batch=100, setup_min=0),
    ]
    cells = cells or [dict(cell_id="C1", name="Cell 1", shift_start="06:00", shift_end="14:00", lunch_start="",
                           lunch_min=0, efficiency=1.0, utilization=1.0, max_overtime_min=0, current_hose_type="A")]
    st = {"schedule_date": DAY.isoformat(), "data_as_of": now_et().strftime("%Y-%m-%d %H:%M"),
          "horizon_days": 1, "solve_seconds": 5, "workers": 4, "setup_same_type_min": 10, "setup_default_min": 30,
          "startup_min": 10, "kit_lead_min": 60, "pull_ahead_days": 5}
    st.update(settings or {})
    d = tmp_path / "in"
    d.mkdir()
    pd.DataFrame(orders).to_csv(d / "orders.csv", index=False)
    pd.DataFrame(parts).to_csv(d / "parts.csv", index=False)
    pd.DataFrame(cells).to_csv(d / "cells.csv", index=False)
    pd.DataFrame([dict(key=k, value=v) for k, v in st.items()]).to_csv(d / "settings.csv", index=False)
    if changeover:
        pd.DataFrame(changeover).to_csv(d / "changeover.csv", index=False)
    if overrides:
        pd.DataFrame(overrides).to_csv(d / "overrides.csv", index=False)
    return d


def order(oid, part, qty, due_hour=14, hot="N", day=DAY, **kw):
    return dict(order_id=oid, part_number=part, qty=qty, due_date=f"{day.isoformat()} {due_hour:02d}:00",
                hot=hot, priority=3, **kw)


def test_batches_are_balanced_and_sum_to_qty(tmp_path):
    d = make_inputs(tmp_path, [order("W1", "A1", 250)])
    p = build_problem(load_input(d))
    sizes = sorted(b.size for b in p.batches)
    assert sizes == [83, 83, 84] and sum(sizes) == 250
    assert [b.batch_id for b in p.batches] == ["W1-1/3", "W1-2/3", "W1-3/3"]


def test_setup_rules(tmp_path):
    d = make_inputs(tmp_path, [order("W1", "A1", 10), order("W2", "A2", 10), order("W3", "B1", 10)],
                    changeover=[dict(from_hose_type="A", to_hose_type="B", setup_min=45)])
    p = build_problem(load_input(d))
    b = {x.order_id: x for x in p.batches}
    assert p.setup_between("A1", "A", b["W1"]) == 0          # same part: continue the run
    assert p.setup_between("A1", "A", b["W2"]) == 10         # same hose type, new part
    assert p.setup_between("A1", "A", b["W3"]) == 45         # matrix value
    assert p.setup_between("B1", "B", b["W1"]) == 30         # default for pairs not in the matrix
    assert p.first_setup(p.slots[0], b["W1"]) == 10          # cell currently runs hose type A -> same type


def test_clustering_hose_types_minimizes_changeovers(tmp_path):
    orders = [order("W1", "A1", 20), order("W2", "B1", 20), order("W3", "A2", 20), order("W4", "B2", 20)]
    d = make_inputs(tmp_path, orders)
    r = pipeline.run(d, seconds=5)
    seq = [op.batch.hose_type for op in r.optimized.ops[0]]
    changes = sum(1 for a, b in zip(seq, seq[1:]) if a != b)
    assert changes == 1, seq                                  # A A B B, not A B A B
    assert r.kpi_opt["setup_min"] <= r.kpi_base["setup_min"]
    assert verify(r.problem, r.optimized) == []


def test_hot_job_goes_first_when_it_is_the_only_way_to_be_on_time(tmp_path):
    # Three 150-min jobs in one cell, 8h shift. Only the first two can finish by 11:30... hot job has 11:00 due.
    orders = [order("W1", "A1", 150, due_hour=14), order("W2", "A1", 150, due_hour=14),
              order("HOT", "B1", 90, due_hour=9, hot="Y")]
    d = make_inputs(tmp_path, orders)
    r = pipeline.run(d, seconds=5)
    o = {x["order_id"]: x for x in r.orders}
    assert o["HOT"]["status"] == "On time"
    assert r.optimized.ops[0][0].batch.order_id == "HOT"


def test_kit_ready_time_is_respected(tmp_path):
    orders = [order("W1", "A1", 60, kit_ready=f"{DAY.isoformat()} 10:00"), order("W2", "A1", 60)]
    d = make_inputs(tmp_path, orders)
    r = pipeline.run(d, seconds=5)
    for op in r.optimized.ops[0]:
        if op.batch.order_id == "W1":
            assert op.slot.clock(op.start, True) >= op.batch.kit_ready
    assert verify(r.problem, r.optimized) == []


def test_overload_carries_work_instead_of_breaking_capacity(tmp_path):
    orders = [order("W1", "A1", 400, due_hour=14), order("W2", "A1", 400, due_hour=14)]  # 800 min vs 480 available
    d = make_inputs(tmp_path, orders, settings={"pull_ahead_days": 0})
    r = pipeline.run(d, seconds=5)
    assert r.kpi_opt["carried_batches"] > 0
    assert verify(r.problem, r.optimized) == []
    for sidx, ops in r.optimized.ops.items():
        assert ops[-1].end <= r.problem.slots[sidx].axis


def test_pin_hold_and_expedite_overrides(tmp_path):
    cells = [dict(cell_id=c, name=c, shift_start="06:00", shift_end="14:00", lunch_start="", lunch_min=0,
                  efficiency=1.0, utilization=1.0, max_overtime_min=0, current_hose_type="A") for c in ("C1", "C2")]
    orders = [order("W1", "A1", 30), order("W2", "A1", 30), order("W3", "A1", 30)]
    ov = [dict(order_id="W1", action="pin_cell", value="C2", reason="Only C2 has the right fixture"),
          dict(order_id="W2", action="hold", value="", reason="Engineering hold"),
          dict(order_id="W3", action="expedite", value="", reason="Customer escalation")]
    d = make_inputs(tmp_path, orders, cells=cells, overrides=ov)
    r = pipeline.run(d, seconds=5)
    placed = {op.batch.order_id: op.slot.cell.cell_id for ops in r.optimized.ops.values() for op in ops}
    assert placed["W1"] == "C2"
    assert "W2" not in placed and any(e[0] == "W2" for e in r.problem.excluded)
    assert [b for b in r.problem.batches if b.order_id == "W3"][0].hot


def test_override_without_reason_is_rejected(tmp_path):
    ov = [dict(order_id="W1", action="hold", value="", reason="")]
    d = make_inputs(tmp_path, [order("W1", "A1", 30)], overrides=ov)
    data = load_input(d)
    assert data.overrides == []
    assert any("reason is required" in i.message for i in data.issues)


def test_stale_data_is_flagged(tmp_path):
    old = (now_et() - timedelta(hours=6)).strftime("%Y-%m-%d %H:%M")
    d = make_inputs(tmp_path, [order("W1", "A1", 30)], settings={"data_as_of": old})
    r = pipeline.run(d, seconds=2)
    assert r.stale and any(i.where == "Data" for i in r.issues)


def test_bad_rows_are_reported_not_fatal(tmp_path):
    orders = [order("W1", "A1", 30), order("W2", "ZZZ", 30), order("W3", "A1", -5)]
    d = make_inputs(tmp_path, orders)
    data = load_input(d)
    assert [o.order_id for o in data.orders] == ["W1"]
    assert len([i for i in data.issues if i.level == "error"]) == 2


def test_verifier_catches_tampering(tmp_path):
    d = make_inputs(tmp_path, [order("W1", "A1", 30), order("W2", "B1", 30)])
    p = build_problem(load_input(d))
    sched = dispatch(p)
    assert verify(p, sched) == []
    sched.ops[0][1].start -= 20          # overlap the previous job / its setup
    sched.ops[0][1].end -= 20
    assert verify(p, sched) != []
    sched = dispatch(p)
    sched.carried.append(sched.ops[0][0].batch)   # same batch scheduled twice
    assert any("exactly once" in e for e in verify(p, sched))


def test_lunch_is_skipped_in_clock_time(tmp_path):
    cells = [dict(cell_id="C1", name="C1", shift_start="06:00", shift_end="14:30", lunch_start="10:00", lunch_min=30,
                  efficiency=1.0, utilization=1.0, max_overtime_min=0, current_hose_type="A")]
    d = make_inputs(tmp_path, [order("W1", "A1", 300)], cells=cells, parts=[
        dict(part_number="A1", hose_type="A", run_min_per_unit=1.0, max_batch=300, setup_min=0)])
    r = pipeline.run(d, seconds=3)
    op = r.optimized.ops[0][0]
    s = op.slot
    # 300 min of work starting 06:10 (10 min startup is same-hose, continuing part unknown -> 10) ends 11:10 + 30 lunch = 11:40
    end = r.problem.dt(s.clock(op.end, False))
    assert end.time().strftime("%H:%M") == "11:40"


def test_optimizer_never_worse_than_baseline_on_lateness(tmp_path):
    import random
    rnd = random.Random(3)
    orders = [order(f"W{i}", rnd.choice(["A1", "A2", "B1", "B2"]), rnd.choice([20, 40, 60, 80]),
                    due_hour=rnd.choice([9, 11, 14])) for i in range(12)]
    d = make_inputs(tmp_path, orders)
    r = pipeline.run(d, seconds=8)
    assert (r.kpi_opt["late"], r.kpi_opt["weighted_tardy_min"]) <= (r.kpi_base["late"], r.kpi_base["weighted_tardy_min"])
    assert verify(r.problem, r.optimized) == []
