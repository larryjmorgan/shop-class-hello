"""Command line: sample | run | override."""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

from . import __version__
from .io import OVERRIDE_ACTIONS, load_input, now_et
from .mcp_source import SourceError, fetch_tables, is_config, list_tools, load_config, load_from_config, save_snapshot
from .pipeline import run as run_pipeline
from .report_html import write_html
from .report_xlsx import write_xlsx
from .sample import build_sample
from .tables import kitting_rows, op_rows


def _write_json(r, path: Path) -> Path:
    doc = dict(
        generated_at=r.generated_at, data_as_of=r.problem.settings.data_as_of, data_age_min=r.data_age_min,
        stale=r.stale, method=r.optimized.method, days=r.problem.days, kpis=r.kpi_opt, baseline_kpis=r.kpi_base,
        operations=op_rows(r), kitting=kitting_rows(r), orders=r.orders, load=r.loads, changes=r.changes,
        priority_order=r.problem.settings.priority_order,
        issues=[str(i) for i in r.issues])
    path.write_text(json.dumps(doc, indent=2, default=str), encoding="utf-8")
    return path


def cmd_sample(a) -> int:
    out = build_sample(a.out, a.date)
    print(f"Wrote sample input workbook: {out}")
    return 0


def cmd_run(a) -> int:
    d = date.fromisoformat(a.date) if a.date else None
    as_of = datetime.fromisoformat(a.as_of) if a.as_of else None
    out = Path(a.out_dir)
    r = run_pipeline(a.input, d, a.days, a.seconds, as_of, a.rule, a.verbose, a.workers, previous=a.previous,
                     rules_path=a.rules, out_dir=out)
    out.mkdir(parents=True, exist_ok=True)
    tag = f"{r.problem.days[0]:%Y-%m-%d}"
    if r.snapshot is not None and hasattr(r.snapshot, "tables"):
        save_snapshot(r.snapshot, out / f"inputs_snapshot_{tag}")
    files = [write_xlsx(r, out / f"schedule_{tag}.xlsx"), write_html(r, out / f"schedule_{tag}.html"),
             _write_json(r, out / f"schedule_{tag}.json")]
    hist = out / "history"                       # every run is kept: the next run can compare against it
    hist.mkdir(parents=True, exist_ok=True)
    _write_json(r, hist / f"schedule_{tag}_{r.generated_at:%H%M}.json")
    if a.publish:
        from .sink import publish
        n = publish(a.publish, r)
        print(f"Published {n} rows to the output database.")
    k, b = r.kpi_opt, r.kpi_base
    print(f"\nHose scheduler {__version__}   generated {r.generated_at:%a %m/%d %I:%M %p} ET   "
          f"data age {r.data_age_min} min{'   ** STALE **' if r.stale else ''}")
    print(f"Method: {r.optimized.method} {r.optimized.solver_status}   batches: {len(r.problem.batches)}   "
          f"days: {', '.join(f'{x:%a %m/%d}' for x in r.problem.days)}")
    print(f"{'':34s}{'schedule':>12s}{'baseline':>12s}")
    if r.changes is not None:
        print(f"Compared with the previous schedule ({r.problem.prev_generated:%a %m/%d %I:%M %p}): "
              f"{len(r.changes)} change(s), {k['moves']} reshuffled minutes")
    for label, key, fmt in [("Late orders", "late", "{:.0f}"), ("On-time %", "otd_pct", "{:.0f}"),
                            ("Minutes late", "tardy_min", "{:,.0f}"), ("Setup minutes", "setup_min", "{:,.0f}"),
                            ("Overtime minutes", "overtime_min", "{:,.0f}"), ("Batches carried over", "carried_batches", "{:.0f}")]:
        print(f"{label:34s}{fmt.format(k[key]):>12s}{fmt.format(b[key]):>12s}")
    for i in r.issues:
        if i.level == "error" or "Not released" not in str(i):
            print(i)
    print("\nWrote:\n  " + "\n  ".join(map(str, files)))
    return 2 if r.stale else 0


def _overrides_target(path: str) -> Path:
    """Where override rows are written: the workbook/folder itself, or the config's local overrides file."""
    if not is_config(path):
        return Path(path)
    cfg = load_config(path)
    spec = (cfg.get("tables") or {}).get("overrides") or {}
    if "file" not in spec:
        sys.exit("This source has no local overrides file. Add `overrides: {file: overrides.csv}` to the config "
                 "(overrides are not written back to Fabric).")
    f = Path(spec["file"])
    return f if f.is_absolute() else Path(cfg["_dir"]) / f


def cmd_override(a) -> int:
    act = a.action.lower()
    if act not in OVERRIDE_ACTIONS:
        sys.exit(f"action must be one of: {', '.join(OVERRIDE_ACTIONS)}")
    if not a.reason.strip():
        sys.exit("A reason is required for every override.")
    data = load_from_config(a.input)[0] if is_config(a.input) else load_input(a.input)
    if a.order not in {o.order_id for o in data.orders}:
        sys.exit(f"Order {a.order} is not in the Orders data.")
    if act == "pin_cell" and a.value not in {c.cell_id for c in data.cells}:
        sys.exit(f"pin_cell value must be a cell id: {', '.join(c.cell_id for c in data.cells)}")
    if act == "earliest_day":
        date.fromisoformat(a.value)
    row = dict(order_id=a.order, action=act, value=a.value or "", reason=a.reason.strip(),
               entered_by=a.by or "", timestamp=now_et().strftime("%Y-%m-%d %H:%M"))
    path = _overrides_target(a.input)
    if path.suffix.lower() == ".csv" or path.is_dir():
        f = path / "overrides.csv" if path.is_dir() else path
        df = pd.read_csv(f, dtype=object) if f.exists() else pd.DataFrame(columns=list(row))
        pd.concat([df, pd.DataFrame([row])]).to_csv(f, index=False)
    else:
        wb = load_workbook(path)
        name = next((n for n in wb.sheetnames if n.strip().lower() == "overrides"), None)
        ws = wb[name] if name else wb.create_sheet("Overrides")
        if ws.max_row == 1 and ws["A1"].value is None:
            ws.append(list(row))
        ws.append(list(row.values()))
        wb.save(path)
    print(f"Logged override: {act} {a.order} {a.value}  reason: {a.reason}")
    return 0


def cmd_sample_history(a) -> int:
    from .backtest import make_synthetic_history
    p = make_synthetic_history(a.out, a.date)
    print(f"Wrote FICTIONAL history: {p}\nIt exists to try the backtest. Its results say nothing about any real plant.")
    return 0


def cmd_standards(a) -> int:
    from .backtest import standards_report
    from .io import read_tables
    rep = standards_report(read_tables(Path(a.history)))
    o = rep["overall"]
    pd.set_option("display.width", 200)
    print(f"Orders compared: {int(o['n'])}   actual vs standard minutes: {o['actual_min'] / o['std_min']:.2f}x   "
          f"within +/-20%: {o['within_20pct']:.0%}\n")
    print("By hose type (ratio > 1 means the work takes longer than the standard says):")
    print(rep["by_type"].round(2).to_string(index=False))
    flagged = rep["by_part"][rep["by_part"]["flag"] != ""]
    print(f"\n{len(flagged)} part(s) more than 15% off (3+ orders each):")
    if len(flagged):
        print(flagged.round(2).to_string(index=False))
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rep["by_type"].to_csv(out / "standards_by_type.csv", index=False)
    rep["by_part"].to_csv(out / "standards_by_part.csv", index=False)
    print(f"\nWrote {out}/standards_by_type.csv and standards_by_part.csv")
    return 0


def cmd_backtest(a) -> int:
    from .backtest import run_backtest, write_backtest
    start, end = date.fromisoformat(a.start), date.fromisoformat(a.end)
    bt = run_backtest(a.history, start, end, tuple(a.policies.split(",")), a.seconds, a.slowdown, a.tail_days, print)
    pd.set_option("display.width", 200)
    cols = ["policy", "orders", "on_time", "late", "unfinished", "otd_pct", "avg_hours_late", "setup_min", "overtime_min"]
    print(f"\nOrders due {start} to {end}   (replay at {a.slowdown:.2f}x standard time)\n")
    print(bt["summary"][cols].round(1).to_string(index=False))
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    f = write_backtest(bt, out / f"backtest_{start}_{end}.xlsx")
    print(f"\nWrote {f}\nA replay is not the plant: it assumes each published day runs as planned (times the slowdown). "
          "Use it to compare policies and sanity-check, not as a promise.")
    return 0


def cmd_ddl(a) -> int:
    from .sink import ddl_tsql
    print(ddl_tsql(a.schema))
    return 0


def cmd_mcp_tools(a) -> int:
    for name, desc, schema in list_tools(load_config(a.config)):
        props = (schema or {}).get("properties", {})
        req = set((schema or {}).get("required", []))
        args = ", ".join(f"{k}{'*' if k in req else ''}: {v.get('type', '?')}" for k, v in props.items())
        print(f"{name}({args})")
        if desc:
            print("    " + desc.splitlines()[0][:160])
    print("\n* = required argument. Put the tool you want in `tables.<name>.tool` and its arguments in `arguments`.")
    return 0


def cmd_mcp_test(a) -> int:
    cfg = load_config(a.config)
    got = fetch_tables(cfg)
    print(f"Fetched {len(got.tables)} table(s) at {got.fetched_at:%a %m/%d %I:%M %p} ET")
    for name, df in got.tables.items():
        m = got.meta.get(name, {})
        src = f"tool {m['tool']}" if m.get("source") == "mcp" else (f"file {m.get('file')}" if m else "settings")
        print(f"\n[{name}]  {len(df)} rows   ({src})\n  columns: {', '.join(map(str, df.columns))}")
        if len(df):
            print("  first row: " + json.dumps(df.iloc[0].to_dict(), default=str)[:300])
    if got.data_as_of:
        age = int((now_et() - got.data_as_of).total_seconds() // 60)
        print(f"\nData as of {got.data_as_of:%a %m/%d %I:%M %p} ET ({age} min old)")
    code = 0
    try:
        data, _ = load_from_config(a.config)
        print(f"\nValidation: {len(data.orders)} orders, {len(data.parts)} parts, {len(data.cells)} cells accepted.")
        for i in data.issues:
            print("  " + str(i))
            code = 1 if i.level == "error" else code
    except ValueError as e:
        print(f"\nValidation failed:\n{e}")
        code = 1
    return code


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="hosesched", description="Daily finite-capacity scheduler for hose assembly cells.")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sample", help="write a fictional example input workbook")
    s.add_argument("--out", default="examples/sample_inputs.xlsx")
    s.add_argument("--date", type=lambda v: date.fromisoformat(v), default=None, help="first working day (YYYY-MM-DD)")
    s.set_defaults(fn=cmd_sample)

    r = sub.add_parser("run", help="build the schedule")
    r.add_argument("input", help="input .xlsx, a folder of CSV files, or a Fabric/MCP source config (.yaml)")
    r.add_argument("--date", help="first day to schedule, YYYY-MM-DD (default: Settings, else today)")
    r.add_argument("--days", type=int, help="working days to load (default: Settings)")
    r.add_argument("--seconds", type=float, help="optimizer time limit (default: Settings)")
    r.add_argument("--as-of", help="re-plan from this date-time, e.g. 2026-11-16T10:30")
    r.add_argument("--rule", choices=["edd", "fifo", "cr", "slack", "spt"], help="baseline dispatch rule")
    r.add_argument("--workers", type=int)
    r.add_argument("--previous", help="previous schedule .json to stay stable against, or 'auto' (newest run for the same day in --out-dir)")
    r.add_argument("--rules", help="rules.yaml with the scheduler's sequencing rules")
    r.add_argument("--publish", metavar="CONFIG", help="also write the results to the database named in this config (`output:` section)")
    r.add_argument("--out-dir", default="out")
    r.add_argument("-v", "--verbose", action="store_true", help="show solver log")
    r.set_defaults(fn=cmd_run)

    o = sub.add_parser("override", help="log a team-lead override (a reason is required)")
    o.add_argument("input")
    o.add_argument("order")
    o.add_argument("action", help=" | ".join(OVERRIDE_ACTIONS))
    o.add_argument("value", nargs="?", default="", help="cell id for pin_cell, YYYY-MM-DD for earliest_day")
    o.add_argument("--reason", required=True)
    o.add_argument("--by", default="")
    o.set_defaults(fn=cmd_override)

    t = sub.add_parser("sample-history", help="write FICTIONAL order history to try the backtest")
    t.add_argument("--out", default="examples/sample_history.xlsx")
    t.add_argument("--date", type=lambda v: date.fromisoformat(v), default=None)
    t.set_defaults(fn=cmd_sample_history)

    t = sub.add_parser("standards", help="compare actual run minutes with the standards, by hose type and part")
    t.add_argument("history")
    t.add_argument("--out-dir", default="out")
    t.set_defaults(fn=cmd_standards)

    t = sub.add_parser("backtest", help="replay history day by day under each policy and compare on-time delivery")
    t.add_argument("history")
    t.add_argument("--start", required=True, help="first due date to score, YYYY-MM-DD")
    t.add_argument("--end", required=True, help="last due date to score, YYYY-MM-DD")
    t.add_argument("--policies", default="optimizer,edd,fifo", help="comma list: optimizer, edd, fifo, cr, slack, spt")
    t.add_argument("--seconds", type=float, default=10, help="optimizer seconds per simulated day")
    t.add_argument("--slowdown", type=float, default=1.0, help="run every job this many times slower than standard")
    t.add_argument("--tail-days", type=int, default=3, help="working days after --end to let work finish")
    t.add_argument("--out-dir", default="out")
    t.set_defaults(fn=cmd_backtest)

    t = sub.add_parser("ddl", help="print the T-SQL for the result tables (for a Fabric Warehouse)")
    t.add_argument("--schema", default="dbo")
    t.set_defaults(fn=cmd_ddl)

    t = sub.add_parser("mcp-tools", help="list the tools an MCP server offers (to fill in the source config)")
    t.add_argument("config")
    t.set_defaults(fn=cmd_mcp_tools)

    t = sub.add_parser("mcp-test", help="fetch every table from the source config and validate it")
    t.add_argument("config")
    t.set_defaults(fn=cmd_mcp_test)

    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except SourceError as e:
        print(f"Source error: {e}", file=sys.stderr)
        return 1
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
