"""Rules, stability (freeze / reshuffle), ordered goals, two-step optimizer."""
from datetime import datetime

import pytest
import yaml

from hosesched import pipeline
from hosesched.cli import _write_json
from hosesched.io import load_input
from hosesched.kpi import kpis
from hosesched.previous import load_previous
from hosesched.problem import build_problem
from hosesched.schedule import dispatch, verify
from test_core import DAY, make_inputs, order


def with_rules(tmp_path, orders, rules, **kw):
    kw.setdefault("settings", {})["rules_file"] = "rules.yaml"
    d = make_inputs(tmp_path, orders, **kw)
    (d / "rules.yaml").write_text(yaml.safe_dump(rules))
    return d


# ------------------------------------------------------------------ rules
def test_sequence_rank_keeps_ptfe_style_work_last(tmp_path):
    orders = [order("W1", "B1", 30), order("W2", "A1", 30), order("W3", "B2", 30), order("W4", "A2", 30)]
    d = with_rules(tmp_path, orders, {"sequence_rank": {"B": 9}})
    r = pipeline.run(d, seconds=5)
    types = [op.batch.hose_type for op in r.optimized.ops[0]]
    assert types == sorted(types), types                         # all A before any B
    assert verify(r.problem, r.optimized) == []


def test_sequence_rank_is_enforced_by_the_baseline_too(tmp_path):
    orders = [order("W1", "B1", 30, due_hour=8), order("W2", "A1", 30, due_hour=14)]
    d = with_rules(tmp_path, orders, {"sequence_rank": {"B": 9}})
    p = build_problem(load_input(d))
    s = dispatch(p, "edd")
    assert [o.batch.hose_type for o in s.ops[0]] == ["A", "B"]   # B is due first but must run last
    assert verify(p, s) == []


def test_setup_precedence_override_then_tooling_group_then_matrix(tmp_path):
    parts = [dict(part_number=n, hose_type=t, run_min_per_unit=1.0, max_batch=100, setup_min=0, tooling_group=g)
             for n, t, g in (("A1", "A", "die1"), ("A2", "A", "die1"), ("A3", "A", ""), ("B1", "B", "die1"))]
    d = with_rules(tmp_path, [order("W1", "A1", 10), order("W2", "A2", 10), order("W3", "A3", 10), order("W4", "B1", 10)],
                   {"setup_overrides": [{"from_part": "A1", "to_part": "A3", "minutes": 2}]}, parts=parts,
                   settings={"setup_same_tooling_min": 4})
    p = build_problem(load_input(d))
    b = {x.order_id: x for x in p.batches}
    assert p.setup_between("A1", "A", b["W3"]) == 2      # explicit override beats same-type default (10)
    assert p.setup_between("A1", "A", b["W2"]) == 4      # same tooling group
    assert p.setup_between("A2", "A", b["W3"]) == 10     # same hose type, different tooling
    assert p.setup_between("A1", "A", b["W4"]) == 4      # same tooling group beats the 30-minute type change


def test_bad_rules_are_reported(tmp_path):
    d = with_rules(tmp_path, [order("W1", "A1", 10)], {"sequence_rank": {"B": "high"}})
    assert any(i.where == "Rules" for i in load_input(d).issues)


# ------------------------------------------------------------------ ordered goals
def _tradeoff(tmp_path, priority):
    # Cell starts on hose type A. B1 is urgent (due 08:00, 60 min); the A jobs are not.
    # Running B first saves lateness but costs an extra changeover.
    orders = [order("W1", "A1", 30, due_hour=14), order("W2", "A2", 30, due_hour=14), order("W3", "B1", 60, due_hour=8)]
    return make_inputs(tmp_path, orders, settings={"priority_order": priority})


def test_priority_order_decides_the_tradeoff(tmp_path):
    p1 = tmp_path / "a"
    p1.mkdir()
    r = pipeline.run(_tradeoff(p1, "late,tardy,carry,moves,overtime,setup,flow"), seconds=5)
    assert r.optimized.ops[0][0].batch.order_id == "W3"          # lateness first: B goes first despite the setup
    assert r.kpi_opt["late"] == 0

    p2 = tmp_path / "b"
    p2.mkdir()
    r = pipeline.run(_tradeoff(p2, "carry,setup,late,tardy,moves,overtime,flow"), seconds=5)
    assert r.optimized.ops[0][0].batch.order_id != "W3"          # setups first: B waits, and is late
    assert r.kpi_opt["late"] == 1


def test_priority_order_that_would_let_work_be_dropped_is_rejected(tmp_path):
    d = make_inputs(tmp_path, [order("W1", "A1", 10)], settings={"priority_order": "setup,late,tardy,carry,moves,overtime,flow"})
    data = load_input(d)
    assert any("carry" in i.message for i in data.issues)
    assert data.settings.priority_order[0] == "late"


def test_bad_priority_order_falls_back_with_an_error(tmp_path):
    d = make_inputs(tmp_path, [order("W1", "A1", 10)], settings={"priority_order": "late,setup"})
    data = load_input(d)
    assert any("priority_order" in i.message for i in data.issues)
    assert len(data.settings.priority_order) == 7


# ------------------------------------------------------------------ stability
def _day_orders():
    return [order(f"W{i}", ("A1", "A2", "B1", "B2")[i % 4], 40 + 10 * (i % 3), due_hour=14) for i in range(1, 9)]


def test_frozen_and_running_jobs_do_not_move_and_changes_are_reported(tmp_path):
    d = make_inputs(tmp_path, _day_orders())
    r1 = pipeline.run(d, seconds=5)
    f = _write_json(r1, tmp_path / "prev.json")
    prev = load_previous(f)
    ops1 = [(o.batch.batch_id, o.start, o.end) for o in r1.optimized.ops[0]]
    assert len(ops1) >= 6

    # 09:00 re-plan with one new hot order
    d2 = tmp_path / "second"
    d2.mkdir()
    orders = _day_orders() + [order("HOT1", "B1", 30, due_hour=12, hot="Y")]
    d2 = make_inputs(d2, orders)
    r2 = pipeline.run(d2, seconds=5, as_of=datetime(DAY.year, DAY.month, DAY.day, 9, 0), previous=prev)
    p2 = r2.problem
    assert verify(p2, r2.optimized) == []
    frozen = p2.frozen.get(0, [])
    assert frozen, "something should be running or about to start at 09:00"
    got = [o.batch.batch_id for o in r2.optimized.ops[0][:len(frozen)]]
    assert got == frozen
    running = [b for b in p2.batches if b.running]
    for b in running:
        assert p2.first_setup(p2.slots[0], b) == 0
    assert any(c["order_id"] == "HOT1" for c in r2.changes)
    assert "moves" in r2.kpi_opt


def test_reshuffling_is_penalised(tmp_path):
    d = make_inputs(tmp_path, _day_orders())
    r1 = pipeline.run(d, seconds=5)
    prev = load_previous(_write_json(r1, tmp_path / "prev.json"))
    # identical data, rerun with the previous schedule: nothing should need to move
    r2 = pipeline.run(d, seconds=5, previous=prev)
    assert r2.kpi_opt["moves"] <= 15, r2.kpi_opt["moves"]
    assert r2.kpi_opt["late"] <= r1.kpi_opt["late"]


# ------------------------------------------------------------------ two-step optimizer
def test_two_step_optimizer_beats_the_baseline_on_the_sample(tmp_path):
    from hosesched.sample import build_sample
    xlsx = build_sample(tmp_path / "s.xlsx", seed=11)
    r = pipeline.run(xlsx, seconds=12)
    assert r.optimized.method.startswith("Two-step"), r.optimized.method
    assert verify(r.problem, r.optimized) == []
    kb, ko = r.kpi_base, r.kpi_opt
    assert (ko["late_w"], ko["weighted_tardy_min"], ko["carried_batches"], ko["over_cap_min"], ko["setup_min"]) <= \
           (kb["late_w"], kb["weighted_tardy_min"], kb["carried_batches"], kb["over_cap_min"], kb["setup_min"])
