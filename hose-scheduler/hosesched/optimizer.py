"""CP-SAT model: assign batches to cell/day slots and sequence them to minimize weighted
lateness, setups and overtime.

Per (cell, day) slot the sequence is an AddCircuit over the batches that could run there,
with a depot node standing for "start of shift". Optional nodes use self-loops, so a batch
only takes part in the slots it is actually assigned to.
"""
from __future__ import annotations

import os
import time as _time
from collections import defaultdict

from ortools.sat.python import cp_model

from .models import Schedule
from .problem import Problem
from .schedule import place_sequence


def optimize(p: Problem, seconds=None, workers=None, hint: Schedule = None, log: bool = False) -> Schedule:
    st = p.settings
    seconds = st.solve_seconds if seconds is None else seconds
    workers = workers or min(st.workers, os.cpu_count() or 1)
    m = cp_model.CpModel()
    carry_val = p.horizon_end + 1
    now = min(s.base + s.off0 for s in p.slots)
    obj = []

    x, S, lo_of, al_l, ol_v, ord_v = {}, {}, {}, {}, {}, {}
    slot_jobs = defaultdict(list)
    carry, comp = [], []

    for j, b in enumerate(p.batches):
        cv = m.NewBoolVar(f"carry{j}")
        cj = m.NewIntVar(0, carry_val, f"comp{j}")
        carry.append(cv)
        comp.append(cj)
        m.Add(cj == carry_val).OnlyEnforceIf(cv)
        lits = [cv]
        obj.append(st.w_carry * b.weight * cv)
        for s in p.slots:
            cid = s.cell.cell_id
            if cid not in b.eligible or (b.not_before_day and s.day < b.not_before_day):
                continue
            d = b.dur[cid]
            lo, hi = p.earliest_start(s, b), s.axis - d
            if lo > hi:
                continue
            xv = m.NewBoolVar(f"x{j}_{s.idx}")
            sv = m.NewIntVar(lo, hi, f"s{j}_{s.idx}")
            x[j, s.idx], S[j, s.idx], lo_of[j, s.idx] = xv, sv, lo
            slot_jobs[s.idx].append(j)
            lits.append(xv)
            if s.lunch_min:
                al = m.NewBoolVar(f"al{j}_{s.idx}")
                al_l[j, s.idx] = al
                m.Add(sv + d > s.lunch_off).OnlyEnforceIf(al)
                m.Add(sv + d <= s.lunch_off).OnlyEnforceIf(al.Not())
                m.Add(cj == s.base + sv + d + s.lunch_min).OnlyEnforceIf([xv, al])
                m.Add(cj == s.base + sv + d).OnlyEnforceIf([xv, al.Not()])
            else:
                m.Add(cj == s.base + sv + d).OnlyEnforceIf(xv)
            if b.preferred_cell and b.preferred_cell != cid:
                obj.append(st.w_pref * xv)
        m.AddExactlyOne(lits)
        # Finish sooner, most of all when the due date is near: protects slack on urgent orders.
        days_left = (b.due - now) // 1440
        urgency = 1 + max(0, 3 - max(0, days_left))
        obj.append(st.w_flow * b.weight * urgency * cj)

    # ---- order level: completion, tardiness, late flag
    by_order = defaultdict(list)
    for j, b in enumerate(p.batches):
        by_order[b.order_id].append(j)
    for oid, js in by_order.items():
        b0 = p.batches[js[0]]
        co = m.NewIntVar(0, carry_val, f"C_{oid}")
        tard = m.NewIntVar(0, carry_val + max(0, -b0.due) + 1, f"T_{oid}")
        late = m.NewBoolVar(f"L_{oid}")
        ord_v[oid] = (co, tard, late)
        for j in js:
            m.Add(co >= comp[j])
        m.Add(tard >= co - b0.due)
        m.Add(tard == 0).OnlyEnforceIf(late.Not())
        obj.append(st.w_late * b0.weight * late)
        obj.append(st.w_tardy * b0.weight * tard)
        for a, c in zip(js, js[1:]):          # identical sibling batches: break symmetry
            if p.batches[a].size == p.batches[c].size:
                m.Add(comp[a] <= comp[c])

    # ---- sequencing per slot
    first_l, last_l, arc_l, empty_l = {}, {}, {}, {}
    for s in p.slots:
        js = slot_jobs[s.idx]
        if not js:
            continue
        node = {j: i + 1 for i, j in enumerate(js)}
        arcs = []
        empty = m.NewBoolVar(f"empty{s.idx}")
        empty_l[s.idx] = empty
        arcs.append((0, 0, empty))
        ol = m.NewIntVar(0, max(0, s.axis - s.cap), f"ol{s.idx}")
        ol_v[s.idx] = ol
        obj.append(st.w_overload * ol)
        for j in js:
            b, n = p.batches[j], node[j]
            d = b.dur[s.cell.cell_id]
            f, l = m.NewBoolVar(f"f{j}_{s.idx}"), m.NewBoolVar(f"l{j}_{s.idx}")
            first_l[j, s.idx], last_l[j, s.idx] = f, l
            arcs += [(0, n, f), (n, 0, l), (n, n, x[j, s.idx].Not())]
            su0 = p.first_setup(s, b)
            m.Add(S[j, s.idx] >= s.off0 + su0).OnlyEnforceIf(f)
            obj.append(st.w_setup * su0 * f)
            m.Add(ol >= S[j, s.idx] + d - s.cap).OnlyEnforceIf(l)
        for i in js:
            bi = p.batches[i]
            di = bi.dur[s.cell.cell_id]
            for j in js:
                if i == j:
                    continue
                bj = p.batches[j]
                su = p.setup_between(bi.part_number, bi.hose_type, bj)
                hi_j = s.axis - bj.dur[s.cell.cell_id]
                if lo_of[i, s.idx] + di + su > hi_j:
                    continue
                a = m.NewBoolVar(f"a{i}_{j}_{s.idx}")
                arc_l[i, j, s.idx] = a
                arcs.append((node[i], node[j], a))
                m.Add(S[j, s.idx] >= S[i, s.idx] + di + su).OnlyEnforceIf(a)
                if su:
                    obj.append(st.w_setup * su * a)
        m.AddCircuit(arcs)

    m.Minimize(sum(obj))

    # ---- warm start from the dispatch baseline (every variable is hinted so it is a full solution)
    if hint is not None:
        _add_hint(p, m, hint, x, S, lo_of, al_l, ol_v, ord_v, comp, carry, first_l, last_l, arc_l, empty_l, carry_val)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(seconds)
    solver.parameters.num_workers = int(workers)
    solver.parameters.random_seed = 7
    solver.parameters.log_search_progress = bool(log)
    t0 = _time.time()
    status = solver.Solve(m)
    secs = _time.time() - t0
    name = solver.StatusName(status)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        raise RuntimeError(f"CP-SAT found no schedule (status {name})")

    ops, carried = {}, []
    chosen = defaultdict(list)
    for (j, sidx), xv in x.items():
        if solver.Value(xv):
            chosen[sidx].append(j)
    for j, cv in enumerate(carry):
        if solver.Value(cv):
            carried.append(p.batches[j])
    for sidx, js in chosen.items():
        js.sort(key=lambda j: solver.Value(S[j, sidx]))
        placed = place_sequence(p, p.slots[sidx], [p.batches[j] for j in js])
        if placed is None:
            raise RuntimeError("internal error: solver sequence does not fit when re-placed")
        ops[sidx] = placed
    return Schedule(ops, carried, "OR-Tools CP-SAT optimizer", name, solver.ObjectiveValue(),
                    solver.BestObjectiveBound(), secs)


def _add_hint(p, m, hint, x, S, lo_of, al_l, ol_v, ord_v, comp, carry, first_l, last_l, arc_l, empty_l, carry_val):
    jid = {b.batch_id: j for j, b in enumerate(p.batches)}
    # Identical-size sibling batches are interchangeable: hand them out in completion order
    # so the hint respects the symmetry-breaking constraint.
    pos = {}
    for sidx, ops in hint.ops.items():
        for op in ops:
            pos[op.batch.batch_id] = (sidx, op)
    groups = {}
    for b in p.batches:
        groups.setdefault((b.order_id, b.size), []).append(b)
    for grp in groups.values():
        placed = [g for g in grp if g.batch_id in pos]
        placed.sort(key=lambda g: pos[g.batch_id][1].slot.clock(pos[g.batch_id][1].end, False))
        grp_sorted = sorted(grp, key=lambda g: g.batch_id)
        ids_sorted = [g.batch_id for g in sorted(grp, key=lambda g: p.batches.index(g))]
        taken = [pos[g.batch_id] for g in placed]
        for bid, t in zip(ids_sorted[: len(taken)], taken):
            pos[bid] = t
        for bid in ids_sorted[len(taken):]:
            pos.pop(bid, None)
    chosen = {}
    for bid, (sidx, op) in pos.items():
        chosen[jid[bid]] = (sidx, op)

    # per-slot sequences using the (possibly relabelled) assignment
    seqs = {}
    for j, (sidx, op) in chosen.items():
        seqs.setdefault(sidx, []).append((op.start, j))
    for sidx in seqs:
        seqs[sidx] = [j for _, j in sorted(seqs[sidx])]

    comp_val = {}
    for j, b in enumerate(p.batches):
        if j in chosen:
            sidx, op = chosen[j]
            comp_val[j] = op.slot.clock(op.end, False)
        else:
            comp_val[j] = carry_val
        m.AddHint(comp[j], comp_val[j])
        m.AddHint(carry[j], int(j not in chosen))
    for (j, sidx), xv in x.items():
        on = j in chosen and chosen[j][0] == sidx
        m.AddHint(xv, int(on))
        s = p.slots[sidx]
        d = p.batches[j].dur[s.cell.cell_id]
        sv = chosen[j][1].start if on else lo_of[j, sidx]
        m.AddHint(S[j, sidx], sv)
        if (j, sidx) in al_l:
            m.AddHint(al_l[j, sidx], int(sv + d > s.lunch_off))
    for oid, (co, tard, late) in ord_v.items():
        js = [j for j, b in enumerate(p.batches) if b.order_id == oid]
        c = max(comp_val[j] for j in js)
        t = max(0, c - p.batches[js[0]].due)
        m.AddHint(co, c)
        m.AddHint(tard, t)
        m.AddHint(late, int(t > 0))
    for sidx, ol in ol_v.items():
        s = p.slots[sidx]
        seq = seqs.get(sidx, [])
        last_end = chosen[seq[-1]][1].end if seq else 0
        m.AddHint(ol, min(max(0, last_end - s.cap), max(0, s.axis - s.cap)))
        m.AddHint(empty_l[sidx], int(not seq))
        on = set()
        if seq:
            on.add(("f", seq[0]))
            on.add(("l", seq[-1]))
            on |= {("a", a, c) for a, c in zip(seq, seq[1:])}
        for (j, si), v in first_l.items():
            if si == sidx:
                m.AddHint(v, int(("f", j) in on))
        for (j, si), v in last_l.items():
            if si == sidx:
                m.AddHint(v, int(("l", j) in on))
        for (i, j, si), v in arc_l.items():
            if si == sidx:
                m.AddHint(v, int(("a", i, j) in on))
