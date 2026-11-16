"""Read the input workbook (or a folder of CSVs) into typed objects, with validation.

Sheets (names and column headers are case/space-insensitive):
  Orders, Parts, Cells, Changeover (optional), Overrides (optional), Settings (optional)
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import pandas as pd

from .models import Cell, Issue, Order, Override, Part, Rules, Settings

ET = ZoneInfo("America/New_York")
OVERRIDE_ACTIONS = ("pin_cell", "earliest_day", "hold", "expedite")


def now_et() -> datetime:
    return datetime.now(ET).replace(tzinfo=None, second=0, microsecond=0)


@dataclass
class InputData:
    settings: Settings
    cells: list
    parts: dict
    orders: list
    overrides: list
    changeover: dict                 # (from_hose, to_hose) -> minutes
    issues: list = field(default_factory=list)
    source: str = ""
    rules: Rules = field(default_factory=Rules)


# ---------------------------------------------------------------- helpers
def _norm(s) -> str:
    return re.sub(r"[^a-z0-9]+", "_", str(s).strip().lower()).strip("_")


def _blank(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    if v is pd.NaT:
        return True
    return isinstance(v, str) and not v.strip()


def _s(v, default: str = "") -> str:
    if _blank(v):
        return default
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return str(v).strip()


def _f(v, default=None):
    if _blank(v):
        return default
    return float(v)


def _i(v, default=None):
    if _blank(v):
        return default
    return int(round(float(v)))


def _bool(v) -> bool:
    return _s(v).lower() in ("y", "yes", "true", "1", "hot", "x")


def parse_time(v, default=None):
    if _blank(v):
        return default
    if isinstance(v, datetime):
        return v.time().replace(second=0, microsecond=0)
    if isinstance(v, time):
        return v.replace(second=0, microsecond=0)
    if isinstance(v, (int, float)):  # Excel day fraction
        mins = int(round(float(v) * 1440))
        return time(mins // 60 % 24, mins % 60)
    m = re.match(r"^\s*(\d{1,2}):(\d{2})", str(v))
    if not m:
        raise ValueError(f"cannot read time {v!r}")
    return time(int(m.group(1)), int(m.group(2)))


def parse_dt(v, cutoff: time):
    """Date-only values mean 'by the shipping cutoff that day'."""
    if _blank(v):
        return None
    ts = pd.to_datetime(v)
    dt = ts.to_pydatetime().replace(tzinfo=None)
    if dt.hour == 0 and dt.minute == 0 and dt.second == 0:
        dt = datetime.combine(dt.date(), cutoff)
    return dt


def parse_date(v):
    if _blank(v):
        return None
    return pd.to_datetime(v).date()


def read_tables(path: Path) -> dict:
    path = Path(path)
    tables = {}
    if path.is_dir():
        for f in sorted(path.glob("*.csv")):
            tables[_norm(f.stem)] = pd.read_csv(f, dtype=object)
    else:
        raw = pd.read_excel(path, sheet_name=None, dtype=object)
        tables = {_norm(k): v for k, v in raw.items()}
    for k, df in tables.items():
        df.columns = [_norm(c) for c in df.columns]
        tables[k] = df.dropna(how="all")
    return tables


def _require(tables: dict, name: str, cols: list) -> pd.DataFrame:
    if name not in tables:
        raise ValueError(f"Missing sheet '{name}'. Found: {sorted(tables)}")
    df = tables[name]
    miss = [c for c in cols if c not in df.columns]
    if miss:
        raise ValueError(f"Sheet '{name}' is missing column(s): {', '.join(miss)}")
    return df


# ---------------------------------------------------------------- settings
def parse_settings(df) -> Settings:
    st = Settings()
    if df is None:
        return st
    raw = {}
    for _, r in df.iterrows():
        k = _norm(r.get("key", ""))
        if k:
            raw[k] = r.get("value")
    ints = ["max_data_age_min", "horizon_days", "pull_ahead_days", "kit_lead_min",
            "workers", "hot_multiplier", "w_late", "w_tardy", "w_carry", "w_setup",
            "w_overload", "w_flow", "w_pref", "w_move", "freeze_minutes"]
    floats = ["setup_same_type_min", "setup_default_min", "startup_min", "solve_seconds", "setup_same_tooling_min"]
    for k in ints:
        if not _blank(raw.get(k)):
            setattr(st, k, _i(raw[k]))
    for k in floats:
        if not _blank(raw.get(k)):
            setattr(st, k, _f(raw[k]))
    if not _blank(raw.get("schedule_date")):
        st.schedule_date = parse_date(raw["schedule_date"])
    if not _blank(raw.get("as_of")):
        st.as_of = pd.to_datetime(raw["as_of"]).to_pydatetime()
    if not _blank(raw.get("data_as_of")):
        st.data_as_of = pd.to_datetime(raw["data_as_of"]).to_pydatetime()
    if not _blank(raw.get("due_cutoff")):
        st.due_cutoff = parse_time(raw["due_cutoff"])
    if not _blank(raw.get("objective_mode")):
        st.objective_mode = _s(raw["objective_mode"]).lower()
    if not _blank(raw.get("priority_order")):
        st.priority_order = tuple(x for x in re.split(r"[,;\s>]+", _s(raw["priority_order"]).lower()) if x)
    if not _blank(raw.get("rules_file")):
        st.rules_file = _s(raw["rules_file"])
    if not _blank(raw.get("baseline_rule")):
        st.baseline_rule = _s(raw["baseline_rule"]).lower()
    if not _blank(raw.get("holidays")):
        hs = [parse_date(x) for x in re.split(r"[,;\s]+", _s(raw["holidays"])) if x]
        st.holidays = tuple(h for h in hs if h)
    return st


# ---------------------------------------------------------------- main loader
def normalize_tables(tables: dict) -> dict:
    """Lower-case sheet and column names, drop blank rows."""
    out = {}
    for k, df in tables.items():
        df = df.copy()
        df.columns = [_norm(c) for c in df.columns]
        out[_norm(k)] = df.dropna(how="all")
    return out


TIERS = ("late", "tardy", "carry", "moves", "overtime", "setup", "flow")


def parse_rules(raw, parts: dict, issues: list) -> Rules:
    """rules.yaml:  sequence_rank: {PTFE: 9}   setup_overrides: [{from_part: A, to_part: B, minutes: 3}]"""
    r = Rules()
    for ht, rk in ((raw or {}).get("sequence_rank") or {}).items():
        try:
            r.sequence_rank[str(ht)] = int(rk)
        except Exception:
            issues.append(Issue("error", "Rules", f"sequence_rank for {ht} must be an integer"))
    for row in (raw or {}).get("setup_overrides") or []:
        try:
            a, b, mins = str(row["from_part"]), str(row["to_part"]), float(row["minutes"])
            for pn in (a, b):
                if pn not in parts:
                    issues.append(Issue("warn", "Rules", f"setup_overrides: part {pn} is not in the Parts sheet"))
            r.setup_overrides[(a, b)] = mins
        except Exception:
            issues.append(Issue("error", "Rules", "each setup_overrides row needs from_part, to_part, minutes"))
    return r


def load_rules_file(path, base_dir=None):
    import yaml
    p = Path(path)
    p = p if p.is_absolute() or base_dir is None else Path(base_dir) / p
    if not p.exists():
        raise ValueError(f"rules file not found: {p}")
    return yaml.safe_load(p.read_text(encoding="utf-8")) or {}


def load_input(path, rules_path=None) -> InputData:
    """Load a workbook or a folder of CSVs."""
    path = Path(path)
    tables = read_tables(path)
    fallback = None
    if path.is_file():
        fallback = (datetime.fromtimestamp(path.stat().st_mtime, ET).replace(tzinfo=None, second=0, microsecond=0),
                    "data_as_of not set; using the input file's last-modified time. Put the ERP extract "
                    "timestamp in Settings so the stale-data check is accurate.")
    base = path if path.is_dir() else path.parent
    return input_from_tables(tables, str(path), fallback, rules_path=rules_path, base_dir=base)


def input_from_tables(tables: dict, source: str = "", fallback_data_as_of=None, rules=None,
                      rules_path=None, base_dir=None) -> InputData:
    """Validate tables (from files or from MCP) and build typed input.

    fallback_data_as_of: (datetime, warning) used only if Settings has no data_as_of."""
    tables = normalize_tables(tables)
    path = source
    issues: list = []
    st = parse_settings(tables.get("settings"))
    if st.data_as_of is None:
        if fallback_data_as_of:
            st.data_as_of = fallback_data_as_of[0]
            if fallback_data_as_of[1]:
                issues.append(Issue("warn", "Settings", fallback_data_as_of[1]))
        else:
            st.data_as_of = now_et()

    # ---- cells
    cells = []
    for i, r in _require(tables, "cells", ["cell_id", "shift_start", "shift_end"]).iterrows():
        try:
            cid = _s(r["cell_id"])
            ls = parse_time(r.get("lunch_start"))
            cells.append(Cell(
                cell_id=cid, name=_s(r.get("name"), cid),
                shift_start=parse_time(r["shift_start"]), shift_end=parse_time(r["shift_end"]),
                lunch_start=ls, lunch_min=_i(r.get("lunch_min"), 0 if ls is None else 30),
                efficiency=_f(r.get("efficiency"), 1.0), utilization=_f(r.get("utilization"), 0.9),
                max_overtime_min=_i(r.get("max_overtime_min"), 0),
                current_hose_type=_s(r.get("current_hose_type")) or None,
                current_part=_s(r.get("current_part")) or None))
        except Exception as e:
            issues.append(Issue("error", f"Cells row {i + 2}", str(e)))
    ids = [c.cell_id for c in cells]
    if len(set(ids)) != len(ids):
        issues.append(Issue("error", "Cells", "duplicate cell_id values"))
    for c in cells:
        if not (0 < c.efficiency <= 2):
            issues.append(Issue("error", f"Cell {c.cell_id}", "efficiency must be between 0 and 2"))
        if not (0 < c.utilization <= 1):
            issues.append(Issue("error", f"Cell {c.cell_id}", "utilization must be between 0 and 1"))
        if c.shift_end <= c.shift_start:
            issues.append(Issue("error", f"Cell {c.cell_id}", "shift_end must be after shift_start (overnight shifts are not supported)"))

    # ---- parts
    parts = {}
    for i, r in _require(tables, "parts", ["part_number", "hose_type", "run_min_per_unit", "max_batch"]).iterrows():
        try:
            pn = _s(r["part_number"])
            elig = tuple(x.strip() for x in re.split(r"[,;]", _s(r.get("eligible_cells"))) if x.strip())
            p = Part(pn, _s(r.get("description")), _s(r["hose_type"]), float(r["run_min_per_unit"]),
                     int(float(r["max_batch"])), _f(r.get("setup_min"), 0.0), elig,
                     _s(r.get("preferred_cell")) or None, _s(r.get("tooling_group")) or None)
            if p.run_min_per_unit <= 0 or p.max_batch <= 0:
                raise ValueError("run_min_per_unit and max_batch must be positive")
            for e in elig + ((p.preferred_cell,) if p.preferred_cell else ()):
                if e not in ids:
                    raise ValueError(f"unknown cell '{e}'")
            if pn in parts:
                raise ValueError("duplicate part_number")
            parts[pn] = p
        except Exception as e:
            issues.append(Issue("error", f"Parts row {i + 2}", str(e)))

    # ---- changeover
    changeover = {}
    if "changeover" in tables:
        for i, r in tables["changeover"].iterrows():
            try:
                changeover[(_s(r["from_hose_type"]), _s(r["to_hose_type"]))] = _f(r["setup_min"], 0.0)
            except Exception as e:
                issues.append(Issue("error", f"Changeover row {i + 2}", str(e)))

    # ---- orders
    orders = []
    seen = set()
    for i, r in _require(tables, "orders", ["order_id", "part_number", "qty", "due_date"]).iterrows():
        where = f"Orders row {i + 2}"
        try:
            oid = _s(r["order_id"])
            pn = _s(r["part_number"])
            if oid in seen:
                raise ValueError(f"duplicate order_id {oid}")
            if pn not in parts:
                raise ValueError(f"part {pn} is not in the Parts sheet (order {oid} skipped)")
            qty = _i(r["qty"])
            if qty is None or qty <= 0:
                raise ValueError(f"qty must be positive (order {oid} skipped)")
            due = parse_dt(r["due_date"], st.due_cutoff)
            if due is None:
                raise ValueError(f"due_date missing (order {oid} skipped)")
            pr = _i(r.get("priority"), 3)
            if pr not in (1, 2, 3, 4, 5):
                raise ValueError("priority must be 1 (highest) to 5")
            orders.append(Order(oid, pn, qty, due, _bool(r.get("hot")), pr,
                                parse_dt(r.get("kit_ready"), time(0, 0)) if not _blank(r.get("kit_ready")) else None,
                                _s(r.get("customer"))))
            seen.add(oid)
        except Exception as e:
            issues.append(Issue("error", where, str(e)))

    # ---- overrides
    overrides = []
    for i, r in (tables.get("overrides", pd.DataFrame())).iterrows():
        where = f"Overrides row {i + 2}"
        try:
            act = _s(r.get("action")).lower()
            oid = _s(r.get("order_id"))
            reason = _s(r.get("reason"))
            if act not in OVERRIDE_ACTIONS:
                raise ValueError(f"action must be one of {', '.join(OVERRIDE_ACTIONS)}")
            if oid not in seen:
                raise ValueError(f"order {oid} is not in Orders; override ignored")
            if not reason:
                raise ValueError("a reason is required; override ignored")
            val = _s(r.get("value"))
            if act == "pin_cell" and val not in ids:
                raise ValueError(f"pin_cell value must be a cell_id ({', '.join(ids)})")
            if act == "earliest_day":
                parse_date(val)
            overrides.append(Override(oid, act, val, reason, _s(r.get("entered_by")), _s(r.get("timestamp"))))
        except Exception as e:
            issues.append(Issue("error", where, str(e)))

    if not cells:
        raise ValueError("No usable cells in the Cells sheet.\n" + "\n".join(map(str, issues)))
    if st.objective_mode not in ("lexicographic", "weighted"):
        issues.append(Issue("error", "Settings", "objective_mode must be lexicographic or weighted"))
        st.objective_mode = "lexicographic"
    po = st.priority_order
    if set(po) != set(TIERS) or len(po) != len(TIERS):
        issues.append(Issue("error", "Settings", f"priority_order must list each of {', '.join(TIERS)} exactly once; using the default"))
        st.priority_order = Settings().priority_order
    elif po.index("carry") > min(po.index("overtime"), po.index("setup")):
        issues.append(Issue("error", "Settings", "priority_order must rank `carry` above `overtime` and `setup`: otherwise "
                            "the optimizer could 'save' setups or overtime by simply not scheduling work. Using the default."))
        st.priority_order = Settings().priority_order
    try:
        raw_rules = rules if rules is not None else (
            load_rules_file(rules_path or st.rules_file, base_dir) if (rules_path or st.rules_file) else {})
    except ValueError as e:
        issues.append(Issue("error", "Rules", str(e)))
        raw_rules = {}
    return InputData(st, cells, parts, orders, overrides, changeover, issues, path,
                     parse_rules(raw_rules, parts, issues))
