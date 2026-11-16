"""Flat tables shared by the Excel, HTML and JSON outputs."""
from __future__ import annotations

from datetime import timedelta

from .pipeline import Result


def op_rows(r: Result) -> list:
    p, st = r.problem, r.problem.settings
    rows = []
    for sidx, ops in sorted(r.optimized.ops.items()):
        for k, op in enumerate(ops, 1):
            s, b = op.slot, op.batch
            start = p.dt(s.clock(op.start, True))
            end = p.dt(s.clock(op.end, False))
            rows.append(dict(
                day=s.day, cell_id=s.cell.cell_id, cell=s.cell.name, seq=k, order_id=b.order_id,
                batch_id=b.batch_id, part_number=b.part_number, hose_type=b.hose_type, qty=b.size,
                hot=b.hot, priority=b.priority, setup_min=op.setup_min,
                setup_start=p.dt(s.clock(op.setup_start, True)) if op.setup_min else None,
                start=start, end=end, run_min=op.end - op.start, due=b.due_dt, late=end > b.due_dt,
                kit_by=start - timedelta(minutes=st.kit_lead_min),
                kit_ready=p.dt(b.kit_ready) if b.kit_ready is not None else None,
                over_cap=op.end > s.cap, overtime=op.end > s.avail))
    return rows


def kitting_rows(r: Result) -> list:
    rows = sorted(op_rows(r), key=lambda x: (x["kit_by"], x["cell_id"]))
    out = []
    for x in rows:
        waiting = x["kit_ready"] is not None and x["kit_ready"] > x["kit_by"]
        out.append(dict(
            kit_by=x["kit_by"], day=x["day"], cell=x["cell"], order_id=x["order_id"], batch_id=x["batch_id"],
            part_number=x["part_number"], hose_type=x["hose_type"], qty=x["qty"], hot=x["hot"], run_starts=x["start"],
            material_status=("Material not ready until " + x["kit_ready"].strftime("%a %H:%M")) if x["kit_ready"] else "Ready",
            attention=("Kit cannot be staged by the target time" if waiting else "")))
    return out


def override_rows(r: Result) -> list:
    return [dict(order_id=o.order_id, action=o.action, value=o.value, reason=o.reason,
                 entered_by=o.entered_by, timestamp=o.timestamp) for o in r.problem.data.overrides]


def exception_rows(r: Result) -> list:
    rows = [dict(level=i.level.upper(), item=i.where, detail=i.message) for i in r.issues]
    for o in r.orders:
        if o["status"].startswith("Late"):
            rows.append(dict(level="LATE", item=f"Order {o['order_id']}",
                             detail=f"{o['part_number']} x{o['qty']} due {o['due']:%a %m/%d %H:%M}; "
                                    + (f"projected finish {o['completion']:%a %m/%d %H:%M} ({o['tardy_min']} min late)"
                                       if o["completion"] else "not finished inside the horizon")
                                    + (" [HOT]" if o["hot"] else "")))
        elif o["critical_ratio"] is not None and o["critical_ratio"] < 1.5 and o["status"] == "On time" and o["critical_ratio"] >= 0:
            rows.append(dict(level="AT RISK", item=f"Order {o['order_id']}",
                             detail=f"critical ratio {o['critical_ratio']:.2f} (little slack); finishes {o['completion']:%a %m/%d %H:%M}, due {o['due']:%a %m/%d %H:%M}"))
    for s in r.loads:
        if s["overtime_min"] > 0:
            rows.append(dict(level="OVERTIME", item=f"{s['cell']} {s['day']:%a %m/%d}",
                             detail=f"{s['overtime_min']} min beyond shift end"))
    order = {"ERROR": 0, "LATE": 1, "OVERTIME": 2, "AT RISK": 3, "WARN": 4}
    return sorted(rows, key=lambda x: order.get(x["level"], 9))


def kpi_lines(r: Result) -> list:
    b, o = r.kpi_base, r.kpi_opt
    spec = [
        ("Projected on-time orders", lambda k: f"{k['on_time']} of {k['orders']} ({k['otd_pct']:.0f}%)"),
        ("Late orders", lambda k: str(k["late"])),
        ("Hot orders on time", lambda k: f"{k['hot_on_time']} of {k['hot']}"),
        ("Total minutes late", lambda k: f"{k['tardy_min']:,}"),
        ("Batches not scheduled in horizon", lambda k: str(k["carried_batches"])),
        ("Setup minutes", lambda k: f"{k['setup_min']:,.0f} ({k['setup_count']} changeovers)"),
        ("Planned-capacity utilization", lambda k: f"{k['utilization_pct']:.0f}%"),
        ("Minutes beyond planned capacity", lambda k: f"{k['over_cap_min']:,}"),
        ("Overtime minutes (past shift end)", lambda k: f"{k['overtime_min']:,}"),
    ]
    return [(name, f(o), f(b)) for name, f in spec]
