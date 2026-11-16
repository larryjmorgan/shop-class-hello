"""Generate a realistic *fictional* input workbook so the tool can be tried end to end.
Replace it with a real ERP / Fabric export that has the same columns."""
from __future__ import annotations

import random
from datetime import date, datetime, time, timedelta
from pathlib import Path

import pandas as pd
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from .io import now_et
from .problem import is_workday, next_workday

HOSE = {
    # type: (part count, run min/unit range, max batch choices, eligible cells)
    "R1 Hydraulic": (5, (0.8, 1.2), (60, 100, 150), "C1,C2"),
    "R2 Hydraulic": (5, (1.2, 1.8), (50, 80, 120), "C1,C2,C3"),
    "Thermoplastic": (5, (0.7, 1.0), (80, 120, 200), "C3,C4"),
    "Air-Water": (5, (0.5, 0.8), (100, 150, 250), "C2,C4"),
    "PTFE": (4, (1.8, 2.6), (30, 50, 80), "C4"),
}
CODE = {"R1 Hydraulic": "R1", "R2 Hydraulic": "R2", "Thermoplastic": "TP", "Air-Water": "AW", "PTFE": "PT"}


def build_sample(path, base: date = None, seed: int = 11) -> Path:
    rnd = random.Random(seed)
    base = next_workday(base or now_et().date(), set())

    parts = []
    for ht, (n, rr, mb, elig) in HOSE.items():
        for k in range(n):
            size = rnd.choice(["04", "06", "08", "10", "12"])
            parts.append(dict(
                part_number=f"{CODE[ht]}-{size}-{rnd.randint(2, 30) * 50:04d}",
                description=f"{ht} hose assembly, -{size}", hose_type=ht,
                run_min_per_unit=round(rnd.uniform(*rr), 2), max_batch=rnd.choice(mb),
                setup_min=rnd.choice([0, 0, 5, 5, 10]), eligible_cells=elig,
                preferred_cell=elig.split(",")[0] if rnd.random() < 0.3 else None))
    cells = pd.DataFrame([
        dict(cell_id="C1", name="Crimp 1", shift_start="06:00", shift_end="14:30", lunch_start="10:00", lunch_min=30,
             efficiency=0.95, utilization=0.90, max_overtime_min=60, current_hose_type="R1 Hydraulic", current_part=None),
        dict(cell_id="C2", name="Crimp 2", shift_start="06:00", shift_end="14:30", lunch_start="10:30", lunch_min=30,
             efficiency=1.00, utilization=0.90, max_overtime_min=60, current_hose_type="R2 Hydraulic", current_part=None),
        dict(cell_id="C3", name="Crimp 3 (large bore)", shift_start="06:00", shift_end="14:30", lunch_start="11:00",
             lunch_min=30, efficiency=0.90, utilization=0.85, max_overtime_min=60, current_hose_type="Thermoplastic", current_part=None),
        dict(cell_id="C4", name="Assembly 4", shift_start="06:00", shift_end="14:30", lunch_start="10:00", lunch_min=30,
             efficiency=1.00, utilization=0.90, max_overtime_min=60, current_hose_type="Air-Water", current_part=None),
    ])
    types = list(HOSE)
    rows = []
    for a in types:
        for b in types:
            if a == b:
                v = 10
            elif {a, b} == {"R1 Hydraulic", "R2 Hydraulic"}:
                v = 15
            elif {a, b} == {"Thermoplastic", "Air-Water"}:
                v = 20
            elif "PTFE" in (a, b):
                v = 45
            else:
                v = 30
            rows.append(dict(from_hose_type=a, to_hose_type=b, setup_min=v))

    # orders: due dates spread over ~6 working days, with some already past due
    wd, d = [], base
    while len(wd) < 7:
        if is_workday(d, set()):
            wd.append(d)
        d += timedelta(days=1)
    orders = []
    due_pool = [-1, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 3, 3, 4, 4, 5, 5, 6]
    for i in range(1, 37):
        p = rnd.choice(parts)
        qty = rnd.choice([20, 30, 40, 50, 60, 80, 100, 120, 150, 200])
        off = rnd.choice(due_pool)
        due = (base - timedelta(days=1)) if off < 0 else wd[min(off, len(wd) - 1)]
        orders.append(dict(
            order_id=f"WO{4100 + i}", part_number=p["part_number"], qty=qty, due_date=due, hot="N",
            priority=rnd.choice([1, 2, 3, 3, 3, 4]), kit_ready=None, customer=f"Customer {rnd.randint(1, 18):02d}"))
    for i in (4, 17, 25):
        orders[i]["hot"] = "Y"
        orders[i]["due_date"] = wd[0] if i != 25 else wd[1]
        orders[i]["priority"] = 1
    for i, hh in ((7, 9), (21, 12), (27, 7)):
        orders[i]["kit_ready"] = datetime.combine(wd[0], time(hh, 30))
    orders[28]["kit_ready"] = datetime.combine(wd[1], time(6, 0))

    overrides = pd.DataFrame([dict(
        order_id=orders[12]["order_id"], action="expedite", value="",
        reason="Customer Service request approved by Assembly team lead", entered_by="Team lead",
        timestamp=now_et().strftime("%Y-%m-%d %H:%M"))])
    settings = pd.DataFrame([
        ("schedule_date", base.isoformat(), "First working day to schedule (blank = today)."),
        ("as_of", "", "Re-plan mid-day: only schedule from this date-time (blank = start of shift)."),
        ("data_as_of", now_et().strftime("%Y-%m-%d %H:%M"), "When the ERP extract was taken. Drives the stale-data banner."),
        ("max_data_age_min", 120, "Banner turns red if the data is older than this."),
        ("horizon_days", 3, "Working days to load (day 1 is the printed schedule)."),
        ("pull_ahead_days", 2, "Planning time fence: orders due later than horizon + this are not released."),
        ("due_cutoff", "15:00", "A date-only due date means 'finished by this time that day'."),
        ("setup_same_type_min", 10, "Default changeover between parts of the same hose type."),
        ("setup_default_min", 30, "Default changeover between hose types missing from the Changeover sheet."),
        ("startup_min", 10, "Start-of-shift setup when the previous job is unknown (days 2+)."),
        ("kit_lead_min", 60, "Kit must be staged this long before the cell starts the job."),
        ("solve_seconds", 30, "Optimizer time limit."),
        ("baseline_rule", "edd", "Comparison rule: edd, fifo, cr, slack or spt."),
        ("hot_multiplier", 3, "Weight multiplier for hot jobs."),
        ("w_late", 20000, "Penalty per late order (x order weight). Drives on-time delivery."),
        ("w_tardy", 40, "Penalty per minute late (x order weight)."),
        ("w_carry", 5000, "Penalty per batch not scheduled inside the horizon."),
        ("w_setup", 20, "Penalty per setup minute."),
        ("w_overload", 30, "Penalty per minute beyond planned capacity (overtime)."),
        ("w_flow", 1, "Penalty per minute of completion time (finish sooner)."),
        ("w_pref", 50, "Penalty for running a batch outside its preferred cell (weighted mode)."),
        ("objective_mode", "lexicographic", "lexicographic = goals in strict priority order; weighted = add up the w_* weights."),
        ("priority_order", "late,tardy,carry,moves,overtime,setup,flow", "Goals, most important first. `carry` must rank above overtime and setup."),
        ("freeze_minutes", 120, "On a re-plan (--as-of) with --previous, jobs starting within this long are frozen."),
        ("w_move", 30, "Weighted mode: penalty per reshuffled minute versus the previous schedule."),
        ("setup_same_tooling_min", 5, "Changeover between different parts that share a tooling_group (Parts sheet)."),
        ("rules_file", "", "Path to rules.yaml (sequence_rank, setup_overrides). Relative to this workbook."),
    ], columns=["key", "value", "notes"])
    guide = pd.DataFrame({"sheet": ["Orders", "Parts", "Cells", "Changeover", "Overrides", "Settings"], "what it holds": [
        "One row per open order: order_id, part_number, qty, due_date, hot (Y/N), priority (1 high - 5 low), kit_ready (blank = ready), customer.",
        "Part master: hose_type, run_min_per_unit (standard minutes each), max_batch (orders larger than this are split), setup_min (part add-on), eligible_cells (blank = any), preferred_cell.",
        "One row per cell: shift, lunch, efficiency (run-rate factor), utilization (planned load limit), max_overtime_min, current_hose_type (what is on the cell now).",
        "Setup minutes between hose types (from_hose_type, to_hose_type, setup_min). Same part back to back = 0.",
        "Team-lead changes: action = pin_cell | earliest_day | hold | expedite. A reason is REQUIRED or the row is ignored.",
        "Run controls, weights and data timestamp. See notes column."]})
    sheets = {"Read me": guide, "Orders": pd.DataFrame(orders), "Parts": pd.DataFrame(parts), "Cells": cells,
              "Changeover": pd.DataFrame(rows), "Overrides": overrides, "Settings": settings}
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        for name, df in sheets.items():
            df.to_excel(xw, sheet_name=name, index=False)
            ws = xw.sheets[name]
            for c in ws[1]:
                c.font = Font(bold=True, color="FFFFFF")
                c.fill = PatternFill("solid", fgColor="1D1D1F")
            for i, col in enumerate(df.columns, 1):
                w = max([len(str(col))] + [len(str(v)) for v in df[col].head(60)]) + 2
                ws.column_dimensions[get_column_letter(i)].width = min(w, 70)
            ws.freeze_panes = "A2"
    return path
