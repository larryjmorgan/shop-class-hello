"""Write results back to a database so Power BI, a kitting screen or another system can read them.

The table layout below is a fixed contract (see `hosesched ddl`). Every table carries run_id,
generated_at and data_as_of, so a screen can always show how fresh it is, and each run can be kept
or replaced as a unit.

Note: as I understand Fabric, a Lakehouse SQL analytics endpoint is read-only; to write you need a
Warehouse (T-SQL) or a notebook writing Delta tables (see fabric/notebook_runner.py). Not yet run
against a real Fabric Warehouse.
"""
from __future__ import annotations

import math
import re
from datetime import date, datetime

import pandas as pd

from .mcp_source import SourceError, load_config
from .sql_source import SqlError, check_name, connect

S, I, F, BO, DT, D = "str", "int", "float", "bool", "datetime", "date"
STAMP = [("run_id", S), ("generated_at", DT), ("data_as_of", DT)]
SCHEMA = {
    "schedule_ops": STAMP + [("day", D), ("cell_id", S), ("cell", S), ("seq", I), ("order_id", S), ("batch_id", S),
                             ("part_number", S), ("hose_type", S), ("qty", I), ("hot", BO), ("priority", I),
                             ("setup_min", I), ("setup_start", DT), ("start", DT), ("end", DT), ("run_min", I),
                             ("due", DT), ("late", BO), ("kit_by", DT), ("kit_ready", DT), ("over_cap", BO),
                             ("overtime", BO)],
    "schedule_orders": STAMP + [("order_id", S), ("part_number", S), ("hose_type", S), ("qty", I), ("batches", I),
                                ("hot", BO), ("priority", I), ("customer", S), ("due", DT), ("completion", DT),
                                ("tardy_min", I), ("status", S), ("cells", S), ("critical_ratio", F)],
    "schedule_kpis": STAMP + [("data_age_min", I), ("stale", BO), ("method", S), ("first_day", D), ("orders", I),
                              ("on_time", I), ("late", I), ("late_w", I), ("otd_pct", F), ("hot", I), ("hot_on_time", I),
                              ("tardy_min", I), ("weighted_tardy_min", I), ("carried_batches", I), ("setup_count", I),
                              ("setup_min", F), ("run_min", I), ("utilization_pct", F), ("over_cap_min", I),
                              ("overtime_min", I), ("moves", I), ("baseline_late", I), ("baseline_setup_min", F)],
    "schedule_load": STAMP + [("cell_id", S), ("cell", S), ("day", D), ("batches", I), ("run_min", I), ("setup_min", I),
                              ("load_min", I), ("planned_cap_min", I), ("utilization", F), ("over_cap_min", I),
                              ("overtime_min", I), ("finish", DT)],
    "schedule_kitting": STAMP + [("kit_by", DT), ("day", D), ("cell", S), ("order_id", S), ("batch_id", S),
                                 ("part_number", S), ("hose_type", S), ("qty", I), ("hot", BO), ("run_starts", DT),
                                 ("material_status", S), ("attention", S)],
    "schedule_exceptions": STAMP + [("level", S), ("item", S), ("detail", S)],
    "schedule_changes": STAMP + [("batch_id", S), ("order_id", S), ("change", S), ("detail", S)],
}
TSQL = {S: "VARCHAR(4000)", I: "BIGINT", F: "FLOAT", BO: "BIT", DT: "DATETIME2(0)", D: "DATE"}


def conform(tables: dict) -> dict:
    """Select and order columns exactly as the contract says; anything missing becomes NULL."""
    out = {}
    for name, cols in SCHEMA.items():
        df = tables[name]
        out[name] = pd.DataFrame({c: (df[c] if c in df.columns else None) for c, _ in cols})
    return out


def ddl_tsql(schema: str = "dbo") -> str:
    lines = ["-- Result tables written by hosesched. T-SQL, written for a Fabric Warehouse; not yet run against one.", ""]
    for name, cols in SCHEMA.items():
        body = ",\n".join(f"    {c} {TSQL[t]} NULL" for c, t in cols)
        lines.append(f"IF OBJECT_ID('{schema}.{name}') IS NULL\nCREATE TABLE {schema}.{name} (\n{body}\n);\n")
    lines.append("-- Latest run only, for Power BI and the kitting screen:")
    for name in SCHEMA:
        if name != "schedule_kpis":
            lines.append(f"CREATE VIEW {schema}.{name}_latest AS SELECT * FROM {schema}.{name} "
                         f"WHERE run_id = (SELECT MAX(run_id) FROM {schema}.schedule_kpis);")
    return "\n".join(lines) + "\n"


def _py(v, sqlite: bool):
    if v is None or (isinstance(v, float) and math.isnan(v)) or v is pd.NaT:
        return None
    if hasattr(v, "item") and not isinstance(v, (datetime, date)):
        v = v.item()
    if isinstance(v, pd.Timestamp):
        v = v.to_pydatetime()
    if isinstance(v, (datetime, date)):
        return v.isoformat(sep=" ") if (sqlite and isinstance(v, datetime)) else (v.isoformat() if sqlite else v)
    if isinstance(v, bool):
        return int(v)
    return v


def _create_sql(name: str) -> str:
    ty = {S: "TEXT", I: "INTEGER", F: "REAL", BO: "INTEGER", DT: "TEXT", D: "TEXT"}
    return f"CREATE TABLE IF NOT EXISTS {name} (" + ", ".join(f"{c} {ty[t]}" for c, t in SCHEMA[name.split('.')[-1].strip('[]')]) + ")"


def write_tables(output_cfg: dict, tables: dict) -> int:
    """Replace this run's rows (same run_id) in every result table. Returns the number of rows written."""
    tables = conform(tables)
    names = output_cfg.get("tables") or {}
    sqlite = (output_cfg.get("driver") or "").lower() == "sqlite"
    conn = connect(output_cfg, read_only=False)
    total = 0
    try:
        cur = conn.cursor()
        for key, df in tables.items():
            target = check_name(names.get(key, key))
            if output_cfg.get("create_tables") and sqlite:
                cur.execute(_create_sql(target))
            cols = [c for c, _ in SCHEMA[key]]
            run_ids = sorted({r for r in df["run_id"].tolist() if r})
            for rid in run_ids:
                cur.execute(f"DELETE FROM {target} WHERE run_id = ?", (rid,))
            if len(df):
                rows = [tuple(_py(v, sqlite) for v in rec) for rec in df.itertuples(index=False, name=None)]
                cur.executemany(f"INSERT INTO {target} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", rows)
                total += len(rows)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return total


def publish(config_path, result) -> int:
    from .tables import result_tables
    cfg = load_config(config_path)
    if "output" not in cfg:
        raise SourceError("the config has no `output:` section")
    return write_tables(cfg["output"], result_tables(result))
