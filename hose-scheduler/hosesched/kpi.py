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
        comp_min = (comp if not carried[b.order_id] else p.horizon_end + 1)
        rows.append(dict(
            weight=b.weight, completion_min=comp_min,
            order_id=b.order_id, part_number=b.part_number, hose_type=b.hose_type, qty=o.qty,
            batches=b.n_batches, hot=b.hot, priority=b.priority, customer=o.customer,
            due=b.due_dt, completion=comp_dt, tardy_min=tardy, status=status,
            cells=", ".join(sorted({e[1] for e in ends})), critical_ratio=cr))
    return rows


def batch_positions(p: Problem, sched: Schedule) -> dict:
    return {op.batch.batch_id: (sidx, op.start, op) for sidx, ops in sched.ops.items() for op in ops}


def moves(p: Problem, sched: Schedule) -> int:
    """Reshuffling versus the previous published schedule, in minutes: a batch that changed
    cell/day or fell out of the horizon counts 60, otherwise the shift in its start time.
    Frozen and running jobs are excluded (they cannot move)."""
    if not p.prev_info:
        return 0
    pos = batch_positions(p, sched)
    frozen = {i for v in p.frozen.values() for i in v}
    total = 0
    for bid, (ps, pstart) in p.prev_info.items():
        if bid in frozen:
            continue
        now = pos.get(bid)
        total += 60 if now is None or now[0] != ps else abs(now[1] - pstart)
    return total


def change_rows(p: Problem, sched: Schedule) -> list:
    """What changed since the previous published schedule, for the lead and the scheduler."""
    if p.prev_generated is None:
        return []
    pos = batch_positions(p, sched)
    rows = []
    for b in p.batches:
        now = pos.get(b.batch_id)
        old = p.prev_info.get(b.batch_id)
        if old is None:
            rows.append(dict(batch_id=b.batch_id, order_id=b.order_id, change="New or changed since last schedule",
                             detail=(f"now {now[2].slot.cell.name} {now[2].slot.day:%a} {p.dt(now[2].slot.clock(now[1], True)):%H:%M}" if now else "carried over")))
            continue
        ps, pstart = old
        pslot = p.slots[ps]
        if now is None:
            rows.append(dict(batch_id=b.batch_id, order_id=b.order_id, change="Pushed out of the horizon",
                             detail=f"was {pslot.cell.name} {pslot.day:%a} {p.dt(pslot.clock(pstart, True)):%H:%M}"))
        elif now[0] != ps:
            ns = now[2].slot
            rows.append(dict(batch_id=b.batch_id, order_id=b.order_id, change="Moved cell or day",
                             detail=f"{pslot.cell.name} {pslot.day:%a} {p.dt(pslot.clock(pstart, True)):%H:%M} -> "
                                    f"{ns.cell.name} {ns.day:%a} {p.dt(ns.clock(now[1], True)):%H:%M}"))
        elif abs(now[1] - pstart) >= 15:
            rows.append(dict(batch_id=b.batch_id, order_id=b.order_id,
                             change=f"Start {'later' if now[1] > pstart else 'earlier'} by {abs(now[1] - pstart)} min",
                             detail=f"{pslot.cell.name} {pslot.day:%a} {p.dt(pslot.clock(pstart, True)):%H:%M} -> {p.dt(now[2].slot.clock(now[1], True)):%H:%M}"))
    for bid in p.prev_removed:
        rows.append(dict(batch_id=bid, order_id=bid.split("-")[0], change="No longer open", detail="in the previous schedule, not in the current orders"))
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
        late_w=sum(o["weight"] for o in late),
        flow=sum(o["weight"] * o["completion_min"] for o in ords),
        moves=moves(p, sched),
        orders=n, late=len(late), on_time=n - len(late),
        otd_pct=100.0 * (n - len(late)) / n if n else 100.0,
        hot=len(hot), hot_on_time=len(hot_ok),
        tardy_min=sum(o["tardy_min"] for o in ords),
        weighted_tardy_min=sum(o["tardy_min"] * o["weight"] for o in ords),
        carried_batches=len(sched.carried),
        setup_count=len(setups), setup_min=sum(op.setup_min for op in setups),
        run_min=sum(r["run_min"] for r in loads),
        utilization_pct=100.0 * load / cap if cap else 0.0,
        over_cap_min=sum(r["over_cap_min"] for r in loads),
        overtime_min=sum(r["overtime_min"] for r in loads),
    )


def score_key(k: dict, order) -> tuple:
    """Lexicographic comparison of two schedules by the plant's priority order (smaller is better)."""
    m = dict(late=k["late_w"], tardy=k["weighted_tardy_min"], carry=k["carried_batches"], moves=k["moves"],
             overtime=k["over_cap_min"], setup=k["setup_min"], flow=k["flow"])
    return tuple(m[t] for t in order)
