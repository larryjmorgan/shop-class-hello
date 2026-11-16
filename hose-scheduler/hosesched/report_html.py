"""Self-contained, print-friendly HTML report with an SVG Gantt chart per day.
No external scripts, fonts or network access, so it opens on any floor PC."""
from __future__ import annotations

from datetime import datetime, timedelta
from html import escape
from pathlib import Path

from .pipeline import Result
from .tables import exception_rows, kitting_rows, kpi_lines, op_rows

# Hose-type colors: each is dark enough for white text (WCAG AA) on the bar.
PALETTE = ["#0071E3", "#6A3FB5", "#00796B", "#9A5B00", "#5F6368", "#B3261E", "#2E6F40", "#8A4B8F"]

CSS = """
:root{--ink:#1D1D1F;--mute:#6E6E73;--line:#D2D2D7;--bg:#fff;--soft:#F5F5F7;--blue:#0071E3;--red:#E30000;--redbg:#FDECEC}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 Arial,Helvetica,sans-serif;color:var(--ink);background:var(--bg)}
.wrap{max-width:1180px;margin:0 auto;padding:24px 20px 60px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:18px;margin:34px 0 10px;border-bottom:2px solid var(--ink);padding-bottom:4px}
h3{font-size:15px;margin:20px 0 6px}.mute{color:var(--mute)}
.stamp{font-size:13px;color:var(--mute);margin-bottom:12px}
.banner{background:var(--redbg);border:2px solid var(--red);color:#8A0000;padding:10px 14px;font-weight:700;margin:10px 0;border-radius:6px}
.note{background:var(--soft);padding:8px 12px;border-radius:6px;margin:8px 0;font-size:13px}
.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}@media(max-width:760px){.kpis{grid-template-columns:1fr 1fr}}
.kpi{border:1px solid var(--line);border-radius:8px;padding:10px 12px}.kpi b{display:block;font-size:20px;color:var(--blue)}
.kpi span{font-size:12px;color:var(--mute)}.kpi i{font-style:normal;font-size:12px;color:var(--mute)}
table{border-collapse:collapse;width:100%;font-size:13px;margin:6px 0 14px}
th{background:var(--ink);color:#fff;text-align:left;padding:6px 8px;font-weight:600}
td{padding:5px 8px;border-bottom:1px solid var(--line);vertical-align:top}tr.hot td{background:var(--redbg)}
.late{color:var(--red);font-weight:700}.tag{display:inline-block;background:var(--red);color:#fff;border-radius:3px;padding:0 5px;font-size:11px;font-weight:700}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:8px 0;font-size:12px}.sw{display:inline-block;width:12px;height:12px;border-radius:2px;margin-right:5px;vertical-align:-1px}
svg{width:100%;height:auto;display:block;border:1px solid var(--line);border-radius:6px;background:#fff}
svg text{font-family:Arial,Helvetica,sans-serif}
.cellblock{break-inside:avoid;page-break-inside:avoid}
@media print{.wrap{max-width:none;padding:0}h2{break-after:avoid}.cellblock{break-before:page}.noprint{display:none}body{font-size:12px}}
"""


def _t(dt):
    return dt.strftime("%H:%M")


def _hose_colors(r: Result) -> dict:
    types = sorted({b.hose_type for b in r.problem.batches})
    return {t: PALETTE[i % len(PALETTE)] for i, t in enumerate(types)}


def _gantt(r: Result, day, rows, colors) -> str:
    p = r.problem
    cells = p.data.cells
    day_rows = [x for x in rows if x["day"] == day]
    starts = [datetime.combine(day, c.shift_start) for c in cells]
    t0 = min(starts)
    t1 = max([x["end"] for x in day_rows] + [datetime.combine(day, c.shift_end) for c in cells])
    span = max(1, (t1 - t0).total_seconds() / 60)
    L, W, ROW, TOP = 150, 1100, 54, 34
    plot = W - L - 10
    H = TOP + ROW * len(cells) + 8

    def X(dt):
        return L + (dt - t0).total_seconds() / 60 / span * plot

    out = [f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="Gantt chart for {day:%A %m/%d}">']
    hour = t0.replace(minute=0, second=0)
    while hour <= t1:
        if hour >= t0:
            x = X(hour)
            out.append(f'<line x1="{x:.1f}" y1="{TOP - 6}" x2="{x:.1f}" y2="{H - 4}" stroke="#E5E5EA"/>'
                       f'<text x="{x:.1f}" y="{TOP - 12}" font-size="11" fill="#6E6E73" text-anchor="middle">{hour:%H:%M}</text>')
        hour += timedelta(hours=1)
    for i, c in enumerate(cells):
        y = TOP + i * ROW
        out.append(f'<text x="8" y="{y + 30}" font-size="13" font-weight="700" fill="#1D1D1F">{escape(c.name)}</text>')
        # shift window
        s_dt, e_dt = datetime.combine(day, c.shift_start), datetime.combine(day, c.shift_end)
        out.append(f'<rect x="{X(s_dt):.1f}" y="{y + 6}" width="{X(e_dt) - X(s_dt):.1f}" height="{ROW - 12}" fill="#F5F5F7" stroke="#D2D2D7"/>')
        if c.lunch_start:
            ls = datetime.combine(day, c.lunch_start)
            le = ls + timedelta(minutes=c.lunch_min)
            out.append(f'<rect x="{X(ls):.1f}" y="{y + 6}" width="{X(le) - X(ls):.1f}" height="{ROW - 12}" fill="#E5E5EA"/>')
        for x in (q for q in day_rows if q["cell_id"] == c.cell_id):
            if x["setup_start"] and x["setup_min"]:
                xs, xe = X(x["setup_start"]), X(x["start"])
                out.append(f'<rect x="{xs:.1f}" y="{y + 12}" width="{max(xe - xs, 1):.1f}" height="{ROW - 24}" fill="#A1A1A6">'
                           f'<title>Setup {x["setup_min"]} min before {escape(x["order_id"])}</title></rect>')
            xs, xe = X(x["start"]), X(x["end"])
            w = max(xe - xs, 1)
            stroke = ' stroke="#E30000" stroke-width="3"' if x["hot"] else (' stroke="#E30000" stroke-width="2" stroke-dasharray="4 2"' if x["late"] else "")
            tip = (f'{x["order_id"]} ({x["batch_id"]})  {x["part_number"]}  qty {x["qty"]}\n'
                   f'{_t(x["start"])}-{_t(x["end"])}  due {x["due"]:%a %m/%d %H:%M}'
                   + ("  HOT" if x["hot"] else "") + ("  LATE" if x["late"] else ""))
            out.append(f'<rect x="{xs:.1f}" y="{y + 8}" width="{w:.1f}" height="{ROW - 16}" rx="3" fill="{colors[x["hose_type"]]}"{stroke}>'
                       f'<title>{escape(tip)}</title></rect>')
            label = f'{x["batch_id"]}' + (" HOT" if x["hot"] else "")
            if w > 62:
                out.append(f'<text x="{xs + 5:.1f}" y="{y + 25}" font-size="11" font-weight="700" fill="#fff">{escape(label)}</text>'
                           f'<text x="{xs + 5:.1f}" y="{y + 38}" font-size="10" fill="#fff">x{x["qty"]}</text>')
            elif w > 30:
                out.append(f'<text x="{xs + 3:.1f}" y="{y + 31}" font-size="10" font-weight="700" fill="#fff">{x["order_id"][-4:]}</text>')
    out.append("</svg>")
    return "".join(out)


def _table(head, rows, classes=None):
    h = "".join(f"<th>{escape(c)}</th>" for c in head)
    body = []
    for i, row in enumerate(rows):
        cls = f' class="{classes[i]}"' if classes and classes[i] else ""
        body.append(f"<tr{cls}>" + "".join(f"<td>{c}</td>" for c in row) + "</tr>")
    return f"<table><thead><tr>{h}</tr></thead><tbody>{''.join(body)}</tbody></table>"


def write_html(r: Result, path) -> Path:
    p, st = r.problem, r.problem.settings
    rows = op_rows(r)
    colors = _hose_colors(r)
    d = st.data_as_of
    stamp = f"Schedule generated {r.generated_at:%A %m/%d/%Y %I:%M %p} ET"
    if d:
        stamp += f" &middot; Data as of {d:%a %m/%d %I:%M %p} ET ({r.data_age_min} min old)"
    parts = [f"<!doctype html><html lang='en'><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
             f"<title>Assembly schedule {p.days[0]:%m/%d}</title><style>{CSS}</style></head><body><div class='wrap'>",
             f"<h1>Assembly daily schedule: {p.days[0]:%A %B %d, %Y}</h1><div class='stamp'>{stamp}</div>"]
    if r.stale:
        parts.append(f"<div class='banner'>STALE DATA: the input is {r.data_age_min} minutes old (limit {st.max_data_age_min}). "
                     "Do not release this schedule until the ERP extract is refreshed.</div>")
    errs = [i for i in r.issues if i.level == "error" and i.where != "Data"]
    for e in errs:
        parts.append(f"<div class='banner'>{escape(e.where)}: {escape(e.message)}</div>")

    # KPIs
    parts.append("<div class='kpis'>")
    for name, a, b in kpi_lines(r)[:6]:
        parts.append(f"<div class='kpi'><span>{escape(name)}</span><b>{escape(a)}</b><i>baseline: {escape(b)}</i></div>")
    parts.append("</div>")
    parts.append(f"<div class='note'><b>Baseline</b> = {escape(r.baseline.method.lower())}, a planner-style rule of thumb, not the plant's "
                 "manual schedule. Projections assume standard run times and that material arrives when stated.</div>")

    # Gantt per day
    parts.append("<h2>Timeline</h2><div class='legend'>" +
                 "".join(f"<span><span class='sw' style='background:{c}'></span>{escape(t)}</span>" for t, c in colors.items()) +
                 "<span><span class='sw' style='background:#A1A1A6'></span>Setup</span>"
                 "<span><span class='sw' style='background:#fff;border:3px solid #E30000'></span>Hot job</span>"
                 "<span><span class='sw' style='background:#fff;border:2px dashed #E30000'></span>Finishes after its due time</span></div>")
    for day in p.days:
        parts.append(f"<h3>{day:%A %m/%d}</h3>{_gantt(r, day, rows, colors)}")

    # Day-1 per-cell tables (the print-out)
    parts.append("<h2>Floor schedule: day 1</h2><p class='mute noprint'>Print this page: each cell starts on its own sheet.</p>")
    for c in p.data.cells:
        mine = [x for x in rows if x["cell_id"] == c.cell_id and x["day"] == p.days[0]]
        parts.append(f"<div class='cellblock'><h3>{escape(c.name)} &mdash; {p.days[0]:%A %m/%d}</h3>"
                     f"<div class='stamp'>{stamp}</div>")
        if not mine:
            parts.append("<p>No jobs scheduled.</p></div>")
            continue
        body = [[x["seq"], escape(x["order_id"]) + (" <span class='tag'>HOT</span>" if x["hot"] else ""),
                 escape(x["part_number"]), escape(x["hose_type"]), x["qty"], x["setup_min"] or "",
                 _t(x["start"]), _t(x["end"]),
                 f"<span class='{'late' if x['late'] else ''}'>{x['due']:%a %m/%d %H:%M}</span>", _t(x["kit_by"])] for x in mine]
        parts.append(_table(["#", "Order", "Part number", "Hose type", "Qty", "Setup min", "Start", "End", "Due", "Kit by"],
                            body, ["hot" if x["hot"] else "" for x in mine]) + "</div>")

    # Kitting
    kit = kitting_rows(r)
    kit1 = [k for k in kit if k["day"] == p.days[0]]
    parts.append("<h2>Kitting priority: day 1</h2>")
    parts.append(_table(["Stage by", "Cell", "Order", "Part number", "Qty", "Run starts", "Material", "Attention"],
                        [[_t(k["kit_by"]), escape(k["cell"]), escape(k["order_id"]) + (" <span class='tag'>HOT</span>" if k["hot"] else ""),
                          escape(k["part_number"]), k["qty"], _t(k["run_starts"]), escape(k["material_status"]),
                          f"<span class='late'>{escape(k['attention'])}</span>"] for k in kit1],
                        ["hot" if k["hot"] else "" for k in kit1]))

    if r.changes is not None:
        parts.append(f"<h2>What changed since the last schedule</h2><p class='mute'>Previous schedule: {p.prev_generated:%a %m/%d %I:%M %p} ET. "
                     "Jobs about to start or already running were kept in place.</p>")
        parts.append(_table(["Order", "Batch", "Change", "Detail"],
                            [[escape(c["order_id"]), escape(c["batch_id"]), escape(c["change"]), escape(c["detail"])] for c in r.changes])
                     if r.changes else "<p>No changes.</p>")

    # Exceptions
    ex = exception_rows(r)
    parts.append("<h2>Exceptions and risks</h2>")
    parts.append(_table(["Level", "Item", "Detail"],
                        [[f"<b class='{'late' if e['level'] in ('ERROR', 'LATE') else ''}'>{e['level']}</b>", escape(e["item"]), escape(e["detail"])] for e in ex])
                 if ex else "<p>None.</p>")

    # Orders
    parts.append("<h2>All orders</h2>")
    ords = sorted(r.orders, key=lambda o: (o["due"], o["order_id"]))
    parts.append(_table(["Order", "Part number", "Qty", "Due", "Projected finish", "Status", "Cells"],
                        [[escape(o["order_id"]) + (" <span class='tag'>HOT</span>" if o["hot"] else ""), escape(o["part_number"]), o["qty"],
                          f"{o['due']:%a %m/%d %H:%M}", f"{o['completion']:%a %m/%d %H:%M}" if o["completion"] else "&mdash;",
                          f"<span class='{'late' if o['status'].startswith('Late') else ''}'>{escape(o['status'])}</span>", escape(o["cells"])]
                         for o in ords], ["hot" if o["hot"] else "" for o in ords]))
    parts.append("</div></body></html>")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(parts), encoding="utf-8")
    return path
