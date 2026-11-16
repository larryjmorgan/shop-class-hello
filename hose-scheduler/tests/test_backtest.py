"""Backtest and standards check, on FICTIONAL generated history."""
from datetime import date, timedelta

import pytest

from hosesched.backtest import make_synthetic_history, run_backtest, standards_report
from hosesched.io import read_tables


@pytest.fixture(scope="module")
def hist(tmp_path_factory):
    d = tmp_path_factory.mktemp("hist")
    p = make_synthetic_history(d / "h.xlsx", base=date(2026, 11, 16), n_days=9, seed=5)
    return p


def test_standards_check_recovers_the_run_time_bias_that_was_planted(hist):
    rep = standards_report(read_tables(hist))
    t = rep["by_type"].set_index("hose_type")
    assert 1.08 < t.loc["R2 Hydraulic", "median_ratio"] < 1.30       # planted at 1.18
    assert t.loc["PTFE", "median_ratio"] < 0.97                      # planted at 0.90
    assert 0.9 < t.loc["Thermoplastic", "median_ratio"] < 1.1        # planted at 1.0
    assert (rep["by_part"]["flag"] == "re-time this part").any()


def test_replay_of_the_actual_policy_reproduces_actual_and_has_no_phantom_backlog(hist):
    bt = run_backtest(hist, date(2026, 11, 19), date(2026, 11, 25), ("fifo",), seconds=1, slowdown=1.08, log=lambda *_: None)
    s = bt["summary"].set_index("policy")
    fifo, actual = s.loc["fifo"], s.loc["ACTUAL (history)"]
    assert fifo["unfinished"] == 0                                    # work finished before the window is not backlog
    assert abs(fifo["on_time"] - actual["on_time"]) <= 1              # calibration: replaying what happened matches what happened
    assert fifo["orders"] == actual["orders"] > 20


def test_optimizer_replay_runs_and_uses_fewer_setups_than_fifo(hist):
    bt = run_backtest(hist, date(2026, 11, 19), date(2026, 11, 23), ("optimizer", "fifo"), seconds=3, slowdown=1.08,
                      log=lambda *_: None)
    s = bt["summary"].set_index("policy")
    assert s.loc["optimizer", "setup_min"] <= s.loc["fifo", "setup_min"]
    assert s.loc["optimizer", "unfinished"] <= s.loc["fifo", "unfinished"]
