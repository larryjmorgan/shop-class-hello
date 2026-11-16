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
from .pipeline import run as run_pipeline
from .report_html import write_html
from .report_xlsx import write_xlsx
from .sample import build_sample
from .tables import kitting_rows, op_rows


def _write_json(r, path: Path) -> Path:
    doc = dict(
        generated_at=r.generated_at, data_as_of=r.problem.settings.data_as_of, data_age_min=r.data_age_min,
        stale=r.stale, method=r.optimized.method, days=r.problem.days, kpis=r.kpi_opt, baseline_kpis=r.kpi_base,
        operations=op_rows(r), kitting=kitting_rows(r), orders=r.orders, load=r.loads,
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
    r = run_pipeline(a.input, d, a.days, a.seconds, as_of, a.rule, a.verbose, a.workers)
    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    tag = f"{r.problem.days[0]:%Y-%m-%d}"
    files = [write_xlsx(r, out / f"schedule_{tag}.xlsx"), write_html(r, out / f"schedule_{tag}.html"),
             _write_json(r, out / f"schedule_{tag}.json")]
    k, b = r.kpi_opt, r.kpi_base
    print(f"\nHose scheduler {__version__}   generated {r.generated_at:%a %m/%d %I:%M %p} ET   "
          f"data age {r.data_age_min} min{'   ** STALE **' if r.stale else ''}")
    print(f"Method: {r.optimized.method} {r.optimized.solver_status}   batches: {len(r.problem.batches)}   "
          f"days: {', '.join(f'{x:%a %m/%d}' for x in r.problem.days)}")
    print(f"{'':34s}{'schedule':>12s}{'baseline':>12s}")
    for label, key, fmt in [("Late orders", "late", "{:.0f}"), ("On-time %", "otd_pct", "{:.0f}"),
                            ("Minutes late", "tardy_min", "{:,.0f}"), ("Setup minutes", "setup_min", "{:,.0f}"),
                            ("Overtime minutes", "overtime_min", "{:,.0f}"), ("Batches carried over", "carried_batches", "{:.0f}")]:
        print(f"{label:34s}{fmt.format(k[key]):>12s}{fmt.format(b[key]):>12s}")
    for i in r.issues:
        if i.level == "error" or "Not released" not in str(i):
            print(i)
    print("\nWrote:\n  " + "\n  ".join(map(str, files)))
    return 2 if r.stale else 0


def cmd_override(a) -> int:
    act = a.action.lower()
    if act not in OVERRIDE_ACTIONS:
        sys.exit(f"action must be one of: {', '.join(OVERRIDE_ACTIONS)}")
    if not a.reason.strip():
        sys.exit("A reason is required for every override.")
    data = load_input(a.input)
    if a.order not in {o.order_id for o in data.orders}:
        sys.exit(f"Order {a.order} is not in the Orders sheet.")
    if act == "pin_cell" and a.value not in {c.cell_id for c in data.cells}:
        sys.exit(f"pin_cell value must be a cell id: {', '.join(c.cell_id for c in data.cells)}")
    if act == "earliest_day":
        date.fromisoformat(a.value)
    row = dict(order_id=a.order, action=act, value=a.value or "", reason=a.reason.strip(),
               entered_by=a.by or "", timestamp=now_et().strftime("%Y-%m-%d %H:%M"))
    path = Path(a.input)
    if path.is_dir():
        f = path / "overrides.csv"
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


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="hosesched", description="Daily finite-capacity scheduler for hose assembly cells.")
    ap.add_argument("--version", action="version", version=__version__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("sample", help="write a fictional example input workbook")
    s.add_argument("--out", default="examples/sample_inputs.xlsx")
    s.add_argument("--date", type=lambda v: date.fromisoformat(v), default=None, help="first working day (YYYY-MM-DD)")
    s.set_defaults(fn=cmd_sample)

    r = sub.add_parser("run", help="build the schedule")
    r.add_argument("input", help="input .xlsx, or a folder of CSV files")
    r.add_argument("--date", help="first day to schedule, YYYY-MM-DD (default: Settings, else today)")
    r.add_argument("--days", type=int, help="working days to load (default: Settings)")
    r.add_argument("--seconds", type=float, help="optimizer time limit (default: Settings)")
    r.add_argument("--as-of", help="re-plan from this date-time, e.g. 2026-11-16T10:30")
    r.add_argument("--rule", choices=["edd", "fifo", "cr", "slack", "spt"], help="baseline dispatch rule")
    r.add_argument("--workers", type=int)
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

    a = ap.parse_args(argv)
    try:
        return a.fn(a)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
