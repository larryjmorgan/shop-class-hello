"""A stand-in for a Fabric MCP server, for tests and for trying the connector offline.

It serves tables from a workbook, but with Fabric-style column names, so the config's
`columns:` mapping is genuinely exercised. Tools:
  run_sql(query)  -> JSON text   {"rows": [...]}     (picks the table from the query text)
  get_cells()     -> structured  {"data": {"items": [...]}}
Environment: MOCK_FABRIC_XLSX (workbook), MOCK_AGE_MIN (minutes old the data claims to be).
"""
import json
import os
from datetime import datetime, timedelta, timezone

import pandas as pd
from mcp.server.mcpserver import MCPServer

server = MCPServer("mock-fabric")
XLSX = os.environ["MOCK_FABRIC_XLSX"]
AGE = int(os.environ.get("MOCK_AGE_MIN", "5"))


def _sheet(name):
    return pd.read_excel(XLSX, sheet_name=name, dtype=object)


def _records(df):
    out = []
    for r in df.to_dict("records"):
        out.append({k: (None if pd.isna(v) else (v.isoformat() if hasattr(v, "isoformat") else v)) for k, v in r.items()})
    return out


@server.tool()
def run_sql(query: str) -> str:
    """Run a read-only SQL query against the lakehouse SQL endpoint."""
    q = query.lower()
    if not q.strip().startswith("select"):
        raise ValueError("read-only: only SELECT is allowed")
    stamp = (datetime.now(timezone.utc) - timedelta(minutes=AGE)).strftime("%Y-%m-%dT%H:%M:%SZ")
    if "open_work_orders" in q:
        df = _sheet("Orders").rename(columns={
            "order_id": "WO_NUMBER", "part_number": "ITEM_NO", "qty": "QTY_OPEN", "due_date": "PROMISE_DATE",
            "hot": "HOT_FLAG", "priority": "PRIORITY", "kit_ready": "KIT_READY_TS", "customer": "CUSTOMER"})
        df["HOT_FLAG"] = df["HOT_FLAG"].map(lambda v: 1 if str(v).upper() == "Y" else 0)
        rows = _records(df)
        for r in rows:
            r["LAST_MODIFIED_UTC"] = stamp
        return json.dumps({"rows": rows})
    if "item_master" in q:
        df = _sheet("Parts").rename(columns={
            "part_number": "ITEM_NO", "description": "DESCR", "hose_type": "HOSE_FAMILY",
            "run_min_per_unit": "MIN_PER_PIECE", "max_batch": "STD_BATCH", "setup_min": "SETUP_MIN",
            "eligible_cells": "WORKCENTERS", "preferred_cell": "PREF_WC"})
        return json.dumps({"rows": _records(df)})
    if "changeover" in q:
        return json.dumps({"rows": _records(_sheet("Changeover"))})
    raise ValueError("unknown table in query")


@server.tool()
def get_cells() -> dict:
    """List work cells and their calendars."""
    return {"data": {"items": _records(_sheet("Cells"))}}


if __name__ == "__main__":
    server.run("stdio")
