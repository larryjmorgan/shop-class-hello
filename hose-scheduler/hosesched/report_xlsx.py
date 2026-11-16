"""Excel output: a Summary, one print-ready sheet per cell for day 1, and the detail sheets."""
from __future__ import annotations

from datetime import datetime
from pathlib import Path

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from .pipeline import Result
from .tables import exception_rows, kitting_rows, kpi_lines, op_rows, override_rows

INK, BLUE, GREY, LIGHT, RED = "1D1D1F", "0071E3", "86868B", "F5F5F7", "E30000"
HDR_FILL = PatternFill("solid", fgColor=INK)
HOT_FILL = PatternFill("solid", fgColor="FDECEC")
LATE_FONT = Font(color=RED, bold=True)
thin = Side(style="thin", color="D2D2D7")
BORDER = Border(bottom=thin)


def _stamp(r: Result) -> str:
    d = r.problem.data.settings.data_as_of
    s = f"Schedule generated {r.generated_at:%a %m/%d/%Y %I:%M %p} ET  |  Data as of {d:%a %m/%d %I:%M %p} ET" if d else \
        f"Schedule generated {r.generated_at:%a %m/%d/%Y %I:%M %p} ET"
    if r.stale:
        s += f"  |  STALE DATA ({r.data_age_min} min old): DO NOT RELEASE"
    return s


def _header(ws, row, cols):
    for i, c in enumerate(cols, 1):
        cell = ws.cell(row=row, column=i, value=c)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = HDR_FILL
        cell.alignment = Alignment(vertical="center", wrap_text=True)


def _widths(ws, widths):
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w


def _fmt(v):
    if isinstance(v, datetime):
        return v.strftime("%a %m/%d %H:%M")
    if hasattr(v, "strftime"):
        return v.strftime("%a %m/%d")
    if isinstance(v, bool):
        return "HOT" if v else ""
    return v


def _table(ws, start_row, cols, rows, widths=None, hot_key=None, late_key=None):
    _header(ws, start_row, [c[1] for c in cols])
    for ri, row in enumerate(rows, start_row + 1):
        for ci, (key, _) in enumerate(cols, 1):
            v = row[key]
            if key == "hot":
                v = "HOT" if v else ""
            elif key in ("late",):
                v = "LATE" if v else ""
            cell = ws.cell(row=ri, column=ci, value=_fmt(v) if not isinstance(v, float) else round(v, 2))
            cell.border = BORDER
            if hot_key and row.get(hot_key):
                cell.fill = HOT_FILL
            if late_key and row.get(late_key) and key in ("end", "due", "late", "status", "completion"):
                cell.font = LATE_FONT
    if widths:
        _widths(ws, widths)
    return start_row + len(rows) + 1


def _print_setup(ws, title_rows=0, landscape=True):
    ws.page_setup.orientation = "landscape" if landscape else "portrait"
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_properties.pageSetUpPr.fitToPage = True
    ws.print_options.horizontalCentered = True
    ws.page_margins.left = ws.page_margins.right = 0.4
    if title_rows:
        ws.print_title_rows = f"1:{title_rows}"


def write_xlsx(r: Result, path) -> Path:
    path = Path(path)
    p = r.problem
    wb = Workbook()
    rows = op_rows(r)
    day1 = p.days[0]

    # ------------------------------------------------ Summary
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "Assembly daily schedule"
    ws["A1"].font = Font(size=18, bold=True, color=INK)
    ws["A2"] = _stamp(r)
    ws["A2"].font = Font(bold=r.stale, color=RED if r.stale else GREY)
    ws["A3"] = f"Days loaded: {', '.join(f'{d:%a %m/%d}' for d in p.days)}  |  Method: {r.optimized.method}"
    ws["A3"].font = Font(color=GREY)
    _header(ws, 5, ["Measure", "This schedule", f"Baseline ({r.baseline.method})"])
    for i, (name, a, b) in enumerate(kpi_lines(r), 6):
        ws.cell(row=i, column=1, value=name)
        ws.cell(row=i, column=2, value=a).font = Font(bold=True, color=BLUE)
        ws.cell(row=i, column=3, value=b)
    n = 6 + len(kpi_lines(r)) + 1
    ws.cell(row=n, column=1, value="Baseline = a planner-style dispatch rule, not your manual schedule. "
                                   "Compare against the manual schedule during the parallel run.").font = Font(italic=True, color=GREY)
    ws.cell(row=n + 1, column=1, value="Run times are standard minutes divided by cell efficiency. Times are Eastern. "
                                       "Projected results assume standards hold and material arrives when stated.").font = Font(italic=True, color=GREY)
    _widths(ws, [44, 34, 40])

    # ------------------------------------------------ one printable sheet per cell, day 1
    cols = [("seq", "#"), ("order_id", "Order"), ("part_number", "Part number"), ("hose_type", "Hose type"),
            ("qty", "Qty"), ("hot", "Hot"), ("setup_min", "Setup min"), ("start", "Start"), ("end", "End"),
            ("due", "Due"), ("late", "Late?"), ("kit_by", "Kit staged by")]
    for c in p.data.cells:
        sheet = ws_name = f"{c.cell_id} {p.days[0]:%a}"[:31]
        w = wb.create_sheet(ws_name)
        w["A1"] = f"{c.name}  ({c.cell_id})  —  {day1:%A %B %d, %Y}"
        w["A1"].font = Font(size=16, bold=True, color=INK)
        w["A2"] = _stamp(r)
        w["A2"].font = Font(bold=r.stale, color=RED if r.stale else GREY)
        w["A3"] = "Hot jobs are shaded. Leads may change the sequence; log the reason in the Overrides sheet."
        w["A3"].font = Font(italic=True, color=GREY)
        mine = [x for x in rows if x["cell_id"] == c.cell_id and x["day"] == day1]
        end_row = _table(w, 5, cols, mine, [5, 12, 18, 16, 7, 7, 10, 15, 15, 15, 8, 15], hot_key="hot", late_key="late")
        if not mine:
            w.cell(row=6, column=1, value="No jobs scheduled for this cell today.")
        else:
            tot_run = sum(x["run_min"] for x in mine)
            tot_set = sum(x["setup_min"] for x in mine)
            w.cell(row=end_row + 1, column=2, value=f"Run {tot_run} min + setup {tot_set} min = {tot_run + tot_set} min "
                                                    f"of {next(s for s in p.slots if s.cell.cell_id == c.cell_id and s.day == day1).cap} planned").font = Font(bold=True)
        w.freeze_panes = "A6"
        _print_setup(w, 5)
        w.oddFooter.center.text = "Page &P of &N"

    # ------------------------------------------------ detail sheets
    ws = wb.create_sheet("All days")
    all_cols = [("day", "Day"), ("cell", "Cell"), ("seq", "#"), ("order_id", "Order"), ("batch_id", "Batch"),
                ("part_number", "Part number"), ("hose_type", "Hose type"), ("qty", "Qty"), ("hot", "Hot"),
                ("priority", "Prio"), ("setup_min", "Setup min"), ("run_min", "Run min"), ("start", "Start"),
                ("end", "End"), ("due", "Due"), ("late", "Late?")]
    _table(ws, 1, all_cols, rows, [11, 20, 5, 11, 14, 18, 16, 7, 7, 6, 10, 9, 15, 15, 15, 8], hot_key="hot", late_key="late")
    ws.freeze_panes = "A2"
    _print_setup(ws, 1)

    ws = wb.create_sheet("Kitting")
    ws["A1"] = "Kitting priority list: stage in this order"
    ws["A1"].font = Font(size=14, bold=True)
    ws["A2"] = _stamp(r)
    ws["A2"].font = Font(color=GREY)
    k_cols = [("kit_by", "Stage kit by"), ("cell", "Cell"), ("order_id", "Order"), ("batch_id", "Batch"),
              ("part_number", "Part number"), ("hose_type", "Hose type"), ("qty", "Qty"), ("hot", "Hot"),
              ("run_starts", "Run starts"), ("material_status", "Material"), ("attention", "Attention")]
    _table(ws, 4, k_cols, kitting_rows(r), [17, 20, 11, 14, 18, 16, 7, 7, 15, 34, 34], hot_key="hot")
    ws.freeze_panes = "A5"
    _print_setup(ws, 4)

    ws = wb.create_sheet("Orders")
    o_cols = [("order_id", "Order"), ("part_number", "Part number"), ("hose_type", "Hose type"), ("qty", "Qty"),
              ("batches", "Batches"), ("hot", "Hot"), ("priority", "Prio"), ("customer", "Customer"), ("due", "Due"),
              ("completion", "Projected finish"), ("tardy_min", "Min late"), ("status", "Status"), ("cells", "Cells"),
              ("critical_ratio", "Critical ratio")]
    ords = sorted(r.orders, key=lambda x: (x["due"], x["order_id"]))
    for o in ords:
        o["late"] = o["status"].startswith("Late")
    _table(ws, 1, o_cols, ords, [11, 18, 16, 7, 8, 7, 6, 13, 15, 16, 9, 30, 12, 12], hot_key="hot", late_key="late")
    ws.freeze_panes = "A2"

    ws = wb.create_sheet("Load")
    l_cols = [("day", "Day"), ("cell", "Cell"), ("batches", "Batches"), ("run_min", "Run min"), ("setup_min", "Setup min"),
              ("load_min", "Load min"), ("planned_cap_min", "Planned capacity"), ("utilization", "Utilization"),
              ("over_cap_min", "Over capacity"), ("overtime_min", "Overtime"), ("finish", "Finishes")]
    _table(ws, 1, l_cols, r.loads, [11, 22, 8, 9, 10, 9, 17, 12, 14, 10, 15])
    for row in ws.iter_rows(min_row=2, min_col=8, max_col=8):
        for c in row:
            c.number_format = "0%"

    if r.changes is not None:
        ws = wb.create_sheet("Changes")
        ws["A1"] = f"Changes since the previous schedule ({p.prev_generated:%a %m/%d %I:%M %p})"
        ws["A1"].font = Font(size=14, bold=True)
        _table(ws, 3, [("order_id", "Order"), ("batch_id", "Batch"), ("change", "Change"), ("detail", "Detail")],
               r.changes, [11, 14, 40, 70])

    ws = wb.create_sheet("Exceptions")
    _table(ws, 1, [("level", "Level"), ("item", "Item"), ("detail", "Detail")], exception_rows(r), [11, 28, 120])
    ws = wb.create_sheet("Overrides")
    _table(ws, 1, [("order_id", "Order"), ("action", "Action"), ("value", "Value"), ("reason", "Reason"),
                   ("entered_by", "Entered by"), ("timestamp", "When")], override_rows(r), [11, 14, 12, 60, 16, 18])
    path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(path)
    return path
