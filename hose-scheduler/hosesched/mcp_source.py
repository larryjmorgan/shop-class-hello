"""Pull the scheduler's input tables from an MCP server (for example Microsoft Fabric's).

The tool names, queries and column names are YOUR configuration, not assumptions made here:
run `hosesched mcp-tools <config>` to see what the server offers, then point each table at a tool.
Each table can also stay in a local file, so you can move to live data one table at a time.
See examples/fabric.example.yaml.

Read-only by design: only the tools named in the config are ever called. Use a read-only identity.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import subprocess
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime
from io import StringIO
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd
import yaml

from .io import ET, _norm, input_from_tables, now_et

CONFIG_SUFFIXES = (".yaml", ".yml", ".json")
TABLES = ("orders", "parts", "cells", "changeover", "overrides", "settings")
_ENV = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


class SourceError(RuntimeError):
    pass


def is_config(path) -> bool:
    return Path(path).suffix.lower() in CONFIG_SUFFIXES and Path(path).is_file()


# ---------------------------------------------------------------- config
def _expand(v, missing: list):
    if isinstance(v, str):
        def sub(m):
            val = os.environ.get(m.group(1))
            if val is None:
                missing.append(m.group(1))
                return ""
            return val
        return _ENV.sub(sub, v)
    if isinstance(v, list):
        return [_expand(x, missing) for x in v]
    if isinstance(v, dict):
        return {k: _expand(x, missing) for k, x in v.items()}
    return v


def load_config(path) -> dict:
    path = Path(path)
    cfg = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(cfg, dict) or "server" not in cfg:
        raise SourceError(f"{path}: config needs a 'server:' section (see examples/fabric.example.yaml)")
    missing: list = []
    cfg["server"] = _expand(cfg["server"], missing)      # secrets live in env vars, never in the file
    if missing:
        raise SourceError("Environment variable(s) not set: " + ", ".join(sorted(set(missing))))
    cfg["_dir"] = str(path.parent.resolve())
    for name in (cfg.get("tables") or {}):
        if name not in TABLES:
            raise SourceError(f"Unknown table '{name}'. Use: {', '.join(TABLES)}")
    return cfg


# ---------------------------------------------------------------- MCP plumbing
def _g(obj, *names, default=None):
    """Read an attribute that is snake_case in newer SDKs and camelCase in older ones."""
    for n in names:
        if isinstance(obj, dict) and n in obj:
            return obj[n]
        if hasattr(obj, n):
            return getattr(obj, n)
    return default


def _http_transport(url: str, headers: dict):
    try:  # mcp 2.x
        from mcp.client.streamable_http import streamable_http_client
        from mcp.shared._httpx_utils import create_mcp_http_client
        return streamable_http_client(url, http_client=create_mcp_http_client(headers=headers or None))
    except ImportError:  # mcp 1.x
        from mcp.client.streamable_http import streamablehttp_client
        return streamablehttp_client(url, headers=headers or None)


def _auth_headers(server: dict) -> dict:
    headers = dict(server.get("headers") or {})
    cmd = server.get("token_command")
    if cmd:
        if not isinstance(cmd, list) or not all(isinstance(c, str) for c in cmd):
            raise SourceError("server.token_command must be a list of strings (no shell), e.g. [az, account, ...]")
        try:
            tok = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=True).stdout.strip()
        except Exception as e:
            raise SourceError(f"token_command failed: {type(e).__name__}") from None
        if not tok:
            raise SourceError("token_command printed nothing")
        headers["Authorization"] = f"Bearer {tok}"
    return headers


@asynccontextmanager
async def open_session(server: dict):
    from mcp import ClientSession
    transport = (server.get("transport") or "http").lower()
    if transport == "stdio":
        from mcp.client.stdio import StdioServerParameters, stdio_client
        if not server.get("command"):
            raise SourceError("server.command is required for transport: stdio")
        cm = stdio_client(StdioServerParameters(command=server["command"], args=server.get("args") or [],
                                                env=server.get("env") or None, cwd=server.get("cwd")))
    elif transport in ("http", "streamable_http"):
        if not server.get("url"):
            raise SourceError("server.url is required for transport: http")
        cm = _http_transport(server["url"], _auth_headers(server))
    else:
        raise SourceError("server.transport must be 'http' or 'stdio'")
    async with cm as streams:
        async with ClientSession(streams[0], streams[1]) as session:
            await session.initialize()
            yield session


def _text_of(result) -> str:
    return "\n".join(_g(c, "text", default="") or "" for c in (_g(result, "content", default=[]) or []))


def _csv(text: str, where: str) -> pd.DataFrame:
    try:
        df = pd.read_csv(StringIO(text), dtype=object)
    except Exception:
        df = None
    if df is None or df.shape[1] < 2:
        raise SourceError(f"{where}: result is neither JSON nor CSV. Starts with: {text[:200]!r}")
    return df


def parse_tool_result(result, rows_path: str = "", table: str = "") -> pd.DataFrame:
    """Turn an MCP tool result into a DataFrame. Accepts JSON (list of objects, or
    {columns, rows}, optionally nested under rows_path) or CSV text."""
    where = f"table '{table}'" if table else "tool result"
    if _g(result, "is_error", "isError", default=False):
        raise SourceError(f"{where}: the tool returned an error: {_text_of(result)[:300]}")
    data = _g(result, "structured_content", "structuredContent")
    if data is None:
        text = _text_of(result).strip()
        try:
            data = json.loads(text)
        except ValueError:
            return _csv(text, where)
    def unwrap(d):
        """Servers often wrap plain-text results as {"result": "<json text>"}; JSON may also arrive as a string."""
        if isinstance(d, dict) and set(d) == {"result"}:
            d = d["result"]
        if isinstance(d, str):
            try:
                d = json.loads(d)
            except ValueError:
                return _csv(d, where)
        return d

    data = unwrap(data)
    if isinstance(data, pd.DataFrame):
        return data
    for key in [k for k in (rows_path or "").split(".") if k]:
        if not isinstance(data, dict) or key not in data:
            raise SourceError(f"{where}: rows_path '{rows_path}' not found in the result "
                              f"(top-level keys: {list(data) if isinstance(data, dict) else type(data).__name__})")
        data = unwrap(data[key])
        if isinstance(data, pd.DataFrame):
            return data
    if isinstance(data, dict) and "columns" in data and "rows" in data:
        cols = [c["name"] if isinstance(c, dict) else c for c in data["columns"]]
        return pd.DataFrame(data["rows"], columns=cols)
    if isinstance(data, list) and all(isinstance(r, dict) for r in data):
        return pd.DataFrame(data)
    raise SourceError(f"{where}: could not find a list of rows. Set rows_path to where they are "
                      f"(got {type(data).__name__}{' keys ' + str(list(data)[:8]) if isinstance(data, dict) else ''}).")


# ---------------------------------------------------------------- fetch
@dataclass
class Fetched:
    tables: dict
    meta: dict
    fetched_at: datetime
    data_as_of: datetime | None = None
    notes: list = field(default_factory=list)


def _read_local(spec: dict, base: str) -> pd.DataFrame:
    p = Path(spec["file"])
    p = p if p.is_absolute() else Path(base) / p
    if not p.exists():
        if spec.get("_optional"):
            return pd.DataFrame(columns=["order_id", "action", "value", "reason", "entered_by", "timestamp"])
        raise SourceError(f"file not found: {p}")
    if p.suffix.lower() in (".xlsx", ".xlsm", ".xls"):
        return pd.read_excel(p, sheet_name=spec.get("sheet", 0), dtype=object)
    return pd.read_csv(p, dtype=object)


def _rename(df: pd.DataFrame, mapping: dict | None) -> pd.DataFrame:
    if not mapping:
        return df
    m = {_norm(k): _norm(v) for k, v in mapping.items()}
    return df.rename(columns={c: m[_norm(c)] for c in df.columns if _norm(c) in m})


def _freshness(cfg: dict, tables: dict):
    fr = cfg.get("freshness")
    if not fr:
        return None, "No `freshness:` configured, so data age is the time of the query, not of the data. " \
                     "Point it at a last-modified column so the stale-data check means something."
    tname, col = fr.get("table", "orders"), _norm(fr.get("column", ""))
    df = tables.get(tname)
    if df is None or col not in [_norm(c) for c in df.columns]:
        return None, f"freshness column '{fr.get('column')}' not found in table '{tname}'"
    s = pd.to_datetime(df[[c for c in df.columns if _norm(c) == col][0]], errors="coerce")
    if s.notna().sum() == 0:
        return None, f"freshness column '{fr.get('column')}' has no readable timestamps"
    assume = ZoneInfo(fr.get("assume_tz", "UTC"))        # SQL timestamps are usually UTC
    s = s.dt.tz_localize(assume) if s.dt.tz is None else s.dt.tz_convert(ET)
    ts = s.max().tz_convert(ET).tz_localize(None).to_pydatetime().replace(second=0, microsecond=0)
    return ts, None


async def _fetch(cfg: dict) -> Fetched:
    tables, meta, notes = {}, {}, []
    specs = cfg.get("tables") or {}
    async with open_session(cfg["server"]) as session:
        for name, spec in specs.items():
            if "tool" in spec:
                res = await session.call_tool(spec["tool"], spec.get("arguments") or {})
                df = parse_tool_result(res, spec.get("rows_path", ""), name)
                meta[name] = dict(source="mcp", tool=spec["tool"], rows=len(df))
            elif "file" in spec:
                df = _read_local({**spec, "_optional": name == "overrides"}, cfg["_dir"])
                meta[name] = dict(source="file", file=str(spec["file"]), rows=len(df))
            else:
                raise SourceError(f"table '{name}' needs either `tool:` or `file:`")
            tables[name] = _rename(df, spec.get("columns"))
    return Fetched(tables, meta, now_et())


def _leaves(e: BaseException) -> list:
    """Flatten anyio/asyncio ExceptionGroups so the real cause is what gets reported."""
    if isinstance(e, BaseExceptionGroup):
        return [x for sub in e.exceptions for x in _leaves(sub)]
    return [e]


def fetch_tables(cfg: dict) -> Fetched:
    retries = int(cfg.get("retries", 2))
    timeout = float(cfg["server"].get("timeout_seconds", 120))
    last = None
    for attempt in range(retries + 1):
        try:
            out = asyncio.run(asyncio.wait_for(_fetch(cfg), timeout))
            break
        except Exception as e:
            leaves = _leaves(e)
            for x in leaves:
                if isinstance(x, SourceError):
                    raise x from None               # configuration/tool errors will not fix themselves
            last = leaves[0]                        # connection trouble: retry
            if attempt < retries:
                import time
                time.sleep(2 * (attempt + 1))
    else:
        raise SourceError(f"Could not read from the MCP server after {retries + 1} tries: "
                          f"{type(last).__name__}: {str(last)[:300]}") from None
    out.data_as_of, note = _freshness(cfg, out.tables)
    if note:
        out.notes.append(note)
    if cfg.get("settings"):
        out.tables["settings"] = pd.DataFrame([dict(key=k, value=v) for k, v in cfg["settings"].items()])
    return out


def list_tools(cfg: dict) -> list:
    async def go():
        async with open_session(cfg["server"]) as s:
            res = await s.list_tools()
            return [(t.name, (_g(t, "description", default="") or "").strip(),
                     _g(t, "input_schema", "inputSchema", default={}) or {}) for t in res.tools]
    try:
        return asyncio.run(asyncio.wait_for(go(), float(cfg["server"].get("timeout_seconds", 120))))
    except Exception as e:
        leaves = _leaves(e)
        raise (leaves[0] if isinstance(leaves[0], SourceError) else
               SourceError(f"{type(leaves[0]).__name__}: {str(leaves[0])[:300]}")) from None


def load_from_config(path):
    """-> (InputData, Fetched). Same validation as file input."""
    cfg = load_config(path)
    got = fetch_tables(cfg)
    fallback = (got.data_as_of or got.fetched_at, None)
    data = input_from_tables(got.tables, f"MCP: {Path(path).name}", fallback)
    from .models import Issue
    for n in got.notes:
        data.issues.append(Issue("warn", "Data freshness", n))
    return data, got


def save_snapshot(got: Fetched, folder) -> Path:
    """Write exactly what was pulled, so any schedule can be audited or re-run later."""
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    for name, df in got.tables.items():
        df.to_csv(folder / f"{name}.csv", index=False)
    (folder / "snapshot.json").write_text(json.dumps(dict(
        fetched_at=str(got.fetched_at), data_as_of=str(got.data_as_of), tables=got.meta), indent=2), encoding="utf-8")
    return folder
