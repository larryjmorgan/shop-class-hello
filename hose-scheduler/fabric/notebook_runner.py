"""TEMPLATE: run the scheduler inside a Microsoft Fabric notebook, on a schedule.

STATUS: untested. I could not run this against a real Fabric workspace. Everything it calls inside
hosesched (pipeline.run with tables=, result_tables) is covered by tests; the Spark and Lakehouse
calls below follow the usual Fabric notebook pattern and need to be checked in your tenant.

Why here: the job reads your Lakehouse tables directly (no MCP hop, typed columns, no paging problem),
writes the schedule to Delta tables that Power BI reads, and runs on a Fabric schedule (for example
2:00 PM for the next day's printed schedule).

Setup (once):
  1. In the notebook's environment, install:  ortools pandas openpyxl pyyaml  and this package
     (upload the hosesched folder to the Lakehouse Files area, or build a wheel into the environment).
  2. Edit the SOURCE and TARGET names below to match your tables.
  3. Schedule the notebook with a Fabric pipeline or notebook schedule.
"""
# ---- cell 1: settings you edit -------------------------------------------------------------
SOURCE = {   # scheduler table name -> (Lakehouse table, {fabric column: scheduler column})
    "orders": ("open_work_orders", {"WO_NUMBER": "order_id", "ITEM_NO": "part_number", "QTY_OPEN": "qty",
                                    "PROMISE_DATE": "due_date", "HOT_FLAG": "hot", "PRIORITY": "priority",
                                    "KIT_READY_TS": "kit_ready", "CUSTOMER": "customer"}),
    "parts": ("item_master", {"ITEM_NO": "part_number", "HOSE_FAMILY": "hose_type", "MIN_PER_PIECE": "run_min_per_unit",
                              "STD_BATCH": "max_batch", "SETUP_MIN": "setup_min", "WORKCENTERS": "eligible_cells"}),
    "cells": ("work_cells", {}),
    "changeover": ("hose_changeover", {}),
    "overrides": ("schedule_overrides", {}),      # team-lead overrides, one row each, reason required
}
FRESHNESS_COLUMN = ("orders", "LAST_MODIFIED_UTC")   # which source column says how fresh the data is
SETTINGS = {"horizon_days": 3, "pull_ahead_days": 2, "max_data_age_min": 60, "solve_seconds": 120}
TARGET_PREFIX = "schedule_"                           # result tables: schedule_ops, schedule_kpis, ...
PREVIOUS_RUN_TABLE = "schedule_ops"                   # used to stay stable against the last published schedule

# ---- cell 2: run ---------------------------------------------------------------------------
import pandas as pd

from hosesched import pipeline
from hosesched.mcp_source import _freshness
from hosesched.tables import result_tables

tables = {}
for name, (table, rename) in SOURCE.items():
    df = spark.read.table(table).toPandas()                       # noqa: F821  (`spark` exists in Fabric notebooks)
    tables[name] = df.rename(columns=rename)
tables["settings"] = pd.DataFrame([dict(key=k, value=v) for k, v in SETTINGS.items()])

tname, col = FRESHNESS_COLUMN
data_as_of, note = _freshness({"freshness": {"table": tname, "column": col, "assume_tz": "UTC"}},
                              {tname: spark.read.table(SOURCE[tname][0]).toPandas()})   # noqa: F821
result = pipeline.run(tables=tables, fallback_data_as_of=(data_as_of, note))

# ---- cell 3: publish -----------------------------------------------------------------------
for name, df in result_tables(result).items():
    sdf = spark.createDataFrame(df.astype(object).where(df.notna(), None))               # noqa: F821
    sdf.write.mode("append").format("delta").saveAsTable(name)    # every row carries run_id, generated_at, data_as_of

print(result.kpi_opt)
if result.stale:
    raise RuntimeError("Input data is stale: schedule published with a STALE flag; investigate the refresh.")
