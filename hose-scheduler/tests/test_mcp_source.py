"""The MCP connector, tested against a mock Fabric-style MCP server over stdio."""
import sys
from pathlib import Path

import pandas as pd
import pytest
import yaml

from hosesched import pipeline
from hosesched.mcp_source import SourceError, list_tools, load_config, load_from_config, parse_tool_result, save_snapshot
from hosesched.sample import build_sample

HERE = Path(__file__).parent


@pytest.fixture()
def fabric(tmp_path, monkeypatch):
    xlsx = build_sample(tmp_path / "src.xlsx", seed=3)
    # cells / changeover stay local files, to prove a mixed source works
    pd.read_excel(xlsx, sheet_name="Cells", dtype=object).to_csv(tmp_path / "cells.csv", index=False)
    pd.read_excel(xlsx, sheet_name="Changeover", dtype=object).to_csv(tmp_path / "changeover.csv", index=False)
    monkeypatch.setenv("MOCK_FABRIC_XLSX", str(xlsx))
    monkeypatch.setenv("MOCK_AGE_MIN", "5")

    def write(**over):
        cfg = yaml.safe_load((HERE.parent / "examples" / "fabric.example.yaml").read_text())
        cfg["server"] = dict(transport="stdio", command=sys.executable, args=[str(HERE / "mock_fabric_server.py")],
                             env={"MOCK_FABRIC_XLSX": "${MOCK_FABRIC_XLSX}", "MOCK_AGE_MIN": "${MOCK_AGE_MIN}"},
                             timeout_seconds=60)
        cfg["retries"] = 0
        cfg["settings"].update(solve_seconds=3, schedule_date=None)
        cfg["settings"]["schedule_date"] = str(pd.read_excel(xlsx, sheet_name="Settings").set_index("key").loc["schedule_date", "value"])
        cfg["tables"]["overrides"] = {"file": "overrides.csv"}
        cfg.update(over)
        p = tmp_path / "fabric.yaml"
        p.write_text(yaml.safe_dump(cfg))
        return p
    write.dir = tmp_path
    return write


def test_lists_tools(fabric):
    names = {n for n, _, _ in list_tools(load_config(fabric()))}
    assert {"run_sql", "get_cells"} <= names


def test_fetch_maps_columns_and_validates(fabric):
    data, got = load_from_config(fabric())
    assert got.meta["orders"]["source"] == "mcp" and got.meta["cells"]["source"] == "file"
    assert len(data.orders) > 20 and len(data.parts) > 15
    assert not [i for i in data.issues if i.level == "error"], data.issues
    assert any(o.hot for o in data.orders)                      # HOT_FLAG 1/0 became hot
    assert got.data_as_of is not None


def test_end_to_end_schedule_from_mcp_with_snapshot(fabric):
    r = pipeline.run(fabric(), seconds=5)
    assert not r.stale and r.snapshot is not None
    assert r.kpi_opt["orders"] > 20
    folder = save_snapshot(r.snapshot, fabric.dir / "snap")
    assert (folder / "orders.csv").exists() and (folder / "snapshot.json").exists()


def test_data_freshness_comes_from_the_data_not_the_query_time(fabric, monkeypatch):
    monkeypatch.setenv("MOCK_AGE_MIN", "400")                   # Fabric says the data is ~6.7 hours old
    r = pipeline.run(fabric(), seconds=3)
    assert r.stale and r.data_age_min >= 390


def test_unverifiable_freshness_is_called_out(fabric):
    cfg = yaml.safe_load(fabric().read_text())
    cfg.pop("freshness")
    p = fabric.dir / "nofresh.yaml"
    p.write_text(yaml.safe_dump(cfg))
    data, _ = load_from_config(p)
    assert any("freshness" in i.message.lower() for i in data.issues)


def test_timezone_aware_timestamps_ignore_assume_tz(fabric):
    cfg = yaml.safe_load(fabric().read_text())
    cfg["freshness"]["assume_tz"] = "Pacific/Auckland"            # the mock sends a Z-suffixed (aware) stamp
    p = fabric.dir / "tz.yaml"
    p.write_text(yaml.safe_dump(cfg))
    assert not pipeline.run(p, seconds=3).stale


def test_naive_timestamps_use_assume_tz():
    from datetime import datetime, timezone
    from hosesched.io import now_et
    from hosesched.mcp_source import _freshness
    utc_naive = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")      # no tz marker, as SQL often returns
    tables = {"orders": pd.DataFrame({"ts": [utc_naive]})}
    ok, _ = _freshness({"freshness": {"table": "orders", "column": "ts", "assume_tz": "UTC"}}, tables)
    wrong, _ = _freshness({"freshness": {"table": "orders", "column": "ts", "assume_tz": "America/New_York"}}, tables)
    assert abs((now_et() - ok).total_seconds()) < 180
    assert (wrong - now_et()).total_seconds() > 3600            # wrong assumption lands hours in the future


def test_future_data_timestamp_is_not_trusted(tmp_path):
    from datetime import timedelta
    from test_core import make_inputs, order
    from hosesched.io import now_et
    fut = (now_et() + timedelta(hours=4)).strftime("%Y-%m-%d %H:%M")
    d = make_inputs(tmp_path, [order("W1", "A1", 30)], settings={"data_as_of": fut})
    r = pipeline.run(d, seconds=2)
    assert r.stale and any("timezone" in i.message for i in r.issues)


def test_missing_env_var_is_a_clear_error(fabric, monkeypatch):
    monkeypatch.delenv("MOCK_AGE_MIN")
    with pytest.raises(SourceError, match="MOCK_AGE_MIN"):
        load_config(fabric())


def test_tool_error_is_reported_not_retried_forever(fabric):
    cfg = yaml.safe_load(fabric().read_text())
    cfg["tables"]["orders"]["arguments"]["query"] = "DELETE FROM open_work_orders"
    p = fabric.dir / "bad.yaml"
    p.write_text(yaml.safe_dump(cfg))
    with pytest.raises(SourceError, match="error"):
        load_from_config(p)


def test_wrong_rows_path_lists_what_is_there():
    class R:
        is_error = False
        structured_content = {"data": {"items": [{"a": 1}]}}
        content = []
    assert len(parse_tool_result(R(), "data.items")) == 1
    with pytest.raises(SourceError, match="top-level keys"):
        parse_tool_result(R(), "rows")


def test_result_shapes():
    class T:
        def __init__(self, text):
            self.text = text

    class R:
        is_error = False
        structured_content = None
        def __init__(self, text):
            self.content = [T(text)]
    assert len(parse_tool_result(R('[{"a":1},{"a":2}]'))) == 2
    assert list(parse_tool_result(R('{"columns":["x","y"],"rows":[[1,2]]}')).columns) == ["x", "y"]
    assert len(parse_tool_result(R("a,b\n1,2\n3,4"))) == 2
    with pytest.raises(SourceError):
        parse_tool_result(R("<html>nope</html>"))
