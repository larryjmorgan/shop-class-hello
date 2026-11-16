"""SQL source (read) and sink (write-back), against SQLite standing in for a Fabric SQL endpoint."""
import sqlite3
import sys

import pandas as pd
import pytest
import yaml

from hosesched import pipeline
from hosesched.mcp_source import SourceError, load_config, load_from_config
from hosesched.sample import build_sample
from hosesched.sink import SCHEMA, ddl_tsql, publish
from hosesched.tables import result_tables
from datetime import datetime, timezone


@pytest.fixture()
def lake(tmp_path):
    xlsx = build_sample(tmp_path / "src.xlsx", seed=4)
    db = tmp_path / "lake.db"
    con = sqlite3.connect(db)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    orders = pd.read_excel(xlsx, sheet_name="Orders", dtype=object)
    orders["due_date"] = pd.to_datetime(orders["due_date"]).dt.strftime("%Y-%m-%d")
    orders["kit_ready"] = pd.to_datetime(orders["kit_ready"]).dt.strftime("%Y-%m-%d %H:%M:%S")
    orders["last_modified_utc"] = stamp
    orders.rename(columns={"order_id": "WO", "part_number": "ITEM"}).to_sql("open_work_orders", con, index=False)
    for sheet, tbl in (("Parts", "item_master"), ("Cells", "work_cells"), ("Changeover", "hose_changeover")):
        pd.read_excel(xlsx, sheet_name=sheet, dtype=object).to_sql(tbl, con, index=False)
    con.close()
    sched = str(pd.read_excel(xlsx, sheet_name="Settings").set_index("key").loc["schedule_date", "value"])
    cfg = dict(
        server=dict(transport="sql", driver="sqlite", path=str(db)),
        freshness=dict(table="orders", column="last_modified_utc", assume_tz="UTC"),
        tables=dict(
            orders=dict(query="SELECT * FROM open_work_orders", columns={"WO": "order_id", "ITEM": "part_number"}),
            parts=dict(query="SELECT * FROM item_master"),
            cells=dict(query="SELECT * FROM work_cells"),
            changeover=dict(query="SELECT * FROM hose_changeover")),
        settings=dict(schedule_date=sched, horizon_days=3, solve_seconds=3),
        output=dict(driver="sqlite", path=str(tmp_path / "out.db"), create_tables=True))
    p = tmp_path / "sql.yaml"
    p.write_text(yaml.safe_dump(cfg))
    return p, cfg, tmp_path


def test_reads_tables_with_sql_and_schedules(lake):
    p, _, _ = lake
    r = pipeline.run(p, seconds=4)
    assert r.kpi_opt["orders"] > 20 and not r.stale
    assert r.snapshot.meta["orders"]["source"] == "sql"


def test_non_select_queries_are_refused(lake):
    p, cfg, tmp = lake
    cfg["tables"]["orders"]["query"] = "DELETE FROM open_work_orders"
    bad = tmp / "bad.yaml"
    bad.write_text(yaml.safe_dump(cfg))
    with pytest.raises(SourceError, match="SELECT"):
        load_from_config(bad)
    cfg["tables"]["orders"]["query"] = "SELECT 1; DROP TABLE open_work_orders"
    bad.write_text(yaml.safe_dump(cfg))
    with pytest.raises(SourceError, match="one statement"):
        load_from_config(bad)


def test_publish_writes_every_table_and_a_rerun_replaces_not_duplicates(lake):
    p, cfg, tmp = lake
    r = pipeline.run(p, seconds=4)
    n1 = publish(p, r)
    n2 = publish(p, r)                                     # same run_id: must replace
    assert n1 == n2 > 40
    con = sqlite3.connect(cfg["output"]["path"])
    counts = {t: con.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in SCHEMA}
    assert counts["schedule_kpis"] == 1 and counts["schedule_ops"] > 20
    row = con.execute("SELECT run_id, generated_at, data_as_of, late, otd_pct FROM schedule_kpis").fetchone()
    assert row[0] and row[1] and row[2]                     # freshness travels with the results
    con.close()


def test_every_contract_column_is_actually_filled_in():
    """The write-back contract must not silently contain empty columns."""
    from hosesched.sample import build_sample
    import tempfile, pathlib
    with tempfile.TemporaryDirectory() as d:
        x = build_sample(pathlib.Path(d) / "s.xlsx", seed=2)
        r = pipeline.run(x, seconds=3)
        tables = result_tables(r)
        for name, cols in SCHEMA.items():
            missing = [c for c, _ in cols if c not in tables[name].columns]
            assert not missing, f"{name} is missing {missing}"


def test_ddl_covers_every_table_and_column():
    sql = ddl_tsql()
    for name, cols in SCHEMA.items():
        assert f"dbo.{name} (" in sql
        for c, _ in cols:
            assert f"    {c} " in sql


def test_tables_entry_point_for_the_fabric_notebook(lake):
    p, cfg, _ = lake
    data, got = load_from_config(p)
    tables = dict(got.tables)
    r = pipeline.run(tables=tables, seconds=3, fallback_data_as_of=(got.data_as_of, None))
    assert r.kpi_opt["orders"] > 20
