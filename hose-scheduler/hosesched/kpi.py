"""Order-level results and plant KPIs computed from a schedule (the same code scores the
optimizer and the baseline, so the comparison is like for like)."""
from __future__ import annotations

from collections import defaultdict

from .models import Schedule
from .problem import Problem


def order_results(p: Problem, sched: Schedule) -> list:
    now = min(s.base + s.off0 for s in p.slots)
    done = defaultdict(list)          # order -> [(clock_end, cell, day)]
    for sidx, ops in sched.ops.items():
        for op in ops:
            done[op.batch.order_id].append((op.slot.clock(op.end, False), op.slot.cell.cell_id, op.slot.day))
    carried = defaultdict(int)
    for b in sched.carried:
        carried[b.order_id] += 1
    orders = p.orders
    rows, seen = [], set()
    for b in p.batches:
        if b.order_id in seen:
            continue
        seen.add(b.order_id)
        o = orders[b.order_id]
        sibs = [x for x in p.batches if x.order_id == b.order_id]
        work = sum(min(x.dur.values()) for x in sibs)
        cr = (b.due - now) / work if work else None
        ends = done.get(b.order_id, [])
        if carried[b.order_id]:
            comp, comp_dt, tardy = None, None, max(0, p.horizon_end + 1 - b.due)
            status = "Late (not finished in horizon)" if b.due <= p.horizon_end else "Carried over (not yet due)"
        else:
            comp = max(e[0] for e in ends)
            comp_dt = p.dt(comp)
            tardy = max(0, comp - b.due)
            status = "Late" if tardy > 0 else "On time"
        rows.append(dict(
            order_id=b.order_id, part_number=b.part_number, hose_type=b.hose_type, qty=o.qty,
            batches=b.n_batches, hot=b.hot, priority=b.priority, customer=o.customer,
            due=b.due_dt, completion=comp_dt, tardy_min=tardy, status=status,
            cells=", ".join(sorted({e[1] for e in ends})), critical_ratio=cr))
    return rows


def slot_loads(p: Problem, sched: Schedule) -> list:
    rows = []
    for s in p.slots:
        ops = sched.ops.get(s.idx, [])
        run = sum(o.end - o.start for o in ops)
        setup = sum(o.setup_min for o in ops)
        finish = ops[-1].end if ops else 0
        rows.append(dict(
            cell_id=s.cell.cell_id, cell=s.cell.name, day=s.day, batches=len(ops), run_min=run,
            setup_min=setup, load_min=run + setup, planned_cap_min=s.cap,
            utilization=(run + setup) / s.cap if s.cap else 0.0,
            over_cap_min=max(0, finish - s.cap), overtime_min=max(0, finish - s.avail),
            finish=p.dt(s.clock(finish, False)) if ops else None))
    return rows


def kpis(p: Problem, sched: Schedule) -> dict:
    ords = order_results(p, sched)
    loads = slot_loads(p, sched)
    n = len(ords)
    late = [o for o in ords if o["status"].startswith("Late")]
    hot = [o for o in ords if o["hot"]]
    hot_ok = [o for o in hot if not o["status"].startswith("Late")]
    setups = [op for ops in sched.ops.values() for op in ops if op.setup_min > 0]
    cap = sum(r["planned_cap_min"] for r in loads)
    load = sum(r["load_min"] for r in loads)
    return dict(
        orders=n, late=len(late), on_time=n - len(late),
        otd_pct=100.0 * (n - len(late)) / n if n else 100.0,
        hot=len(hot), hot_on_time=len(hot_ok),
        tardy_min=sum(o["tardy_min"] for o in ords),
        weighted_tardy_min=sum(o["tardy_min"] * (p.settings.hot_multiplier if o["hot"] else 1) for o in ords),
        carried_batches=len(sched.carried),
        setup_count=len(setups), setup_min=sum(op.setup_min for op in setups),
        run_min=sum(r["run_min"] for r in loads),
        utilization_pct=100.0 * load / cap if cap else 0.0,
        over_cap_min=sum(r["over_cap_min"] for r in loads),
        overtime_min=sum(r["overtime_min"] for r in loads),
    )
