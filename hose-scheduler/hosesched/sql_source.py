"""Read input tables straight from a SQL endpoint (for example a Fabric SQL analytics endpoint or
Warehouse) with a read-only query per table. Preferred over MCP for a scheduled, unattended job:
typed columns, no result-shape guessing, no paging problem.

Config: `server: {transport: sql, driver: pyodbc, connection_string: "${FABRIC_SQL_CONN}"}` and, per table,
`query: "SELECT ..."`. Drivers: pyodbc (needs the ODBC driver installed) and sqlite (development and tests).
"""
from __future__ import annotations

import re
import sqlite3

import pandas as pd

from .io import now_et


class SqlError(RuntimeError):
    pass


_NAME = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*){0,2}$|^\[[^\]]+\](\.\[[^\]]+\]){0,2}$")


def check_name(name: str) -> str:
    if not _NAME.match(name):
        raise SqlError(f"unsafe table name {name!r}")
    return name


def connect(cfg: dict, read_only: bool = True):
    drv = (cfg.get("driver") or "pyodbc").lower()
    if drv == "sqlite":
        path = cfg.get("path")
        if not path:
            raise SqlError("sqlite needs `path:`")
        return sqlite3.connect(f"file:{path}?mode={'ro' if read_only else 'rwc'}", uri=True)
    if drv == "pyodbc":
        try:
            import pyodbc
        except ImportError:
            raise SqlError("pyodbc is not installed (pip install pyodbc, plus the Microsoft ODBC driver)") from None
        if not cfg.get("connection_string"):
            raise SqlError("pyodbc needs `connection_string:`")
        return pyodbc.connect(cfg["connection_string"], timeout=int(cfg.get("timeout_seconds", 60)))
    raise SqlError("driver must be pyodbc or sqlite")


def check_read_only(query: str) -> str:
    q = query.strip().rstrip(";").strip()
    if ";" in q:
        raise SqlError("one statement per query")
    if not re.match(r"^(select|with)\b", q, re.I):
        raise SqlError("only SELECT queries are allowed (the scheduler never writes to its source)")
    return q


def run_query(conn, query: str) -> pd.DataFrame:
    cur = conn.cursor()
    cur.execute(check_read_only(query))
    cols = [d[0] for d in cur.description]
    return pd.DataFrame.from_records([tuple(r) for r in cur.fetchall()], columns=cols)


def fetch_sql(cfg: dict):
    """Returns (tables, meta) like the MCP fetcher. Imported lazily by mcp_source.fetch_tables."""
    from .mcp_source import _read_local, _rename
    tables, meta = {}, {}
    conn = connect(cfg["server"])
    try:
        for name, spec in (cfg.get("tables") or {}).items():
            if "query" in spec:
                df = run_query(conn, spec["query"])
                meta[name] = dict(source="sql", rows=len(df))
            elif "file" in spec:
                df = _read_local({**spec, "_optional": name == "overrides"}, cfg["_dir"])
                meta[name] = dict(source="file", file=str(spec["file"]), rows=len(df))
            else:
                raise SqlError(f"table '{name}' needs either `query:` or `file:`")
            tables[name] = _rename(df, spec.get("columns"))
    finally:
        conn.close()
    return tables, meta
