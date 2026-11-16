"""CP-SAT model: choose a cell/day for each batch and sequence the batches in every cell-day.

Per (cell, day) slot the sequence is an AddCircuit over the batches that could run there, with a
depot node for "start of shift". Optional nodes use self-loops, so a batch only takes part in the
slots it is actually assigned to.

Goals, in the plant's priority order (Settings.priority_order):
    late      weighted count of late orders        tardy     weighted minutes late
    carry     batches not scheduled in the horizon moves     reshuffling vs the previous schedule
    overtime  minutes beyond planned capacity      setup     changeover minutes (and off-preferred-cell runs)
    flow      finish sooner, most of all urgent orders

objective_mode "lexicographic" (default) solves one goal at a time and never gives up an earlier goal
to improve a later one. "weighted" adds them up with the w_* weights from Settings.

`assign` (batch index -> slot index or None) fixes the cell/day of each batch, which turns this into
the sequencing step of the two-step method in staged.py.
"""
from __future__ import annotations

import os
import time as _time
from collections import defaultdict

from ortools.sat.python import cp_model

from .io import TIERS
from .models import Schedule
from .problem import Problem
from .schedule import place_sequence


class _Vars:
    """Everything created for one model, so a solution can be read back and used as a hint."""

    def __init__(self):
        self.all = []
        self.x, self.S, self.lo, self.al, self.dev = {}, {}, {}, {}, {}
        self.carry, self.comp, self.ol, self.order = [], [], {}, {}
        self.first, self.last, self.arc, self.empty = {}, {}, {}, {}
        self.terms = {t: [] for t in TIERS}
        self.const = {t: 0 for t in TIERS}
        self.pref = []


def _expr(terms, const):
    if not terms:
        return None
    vs, cs = zip(*[(v, c) for c, v in terms])
    return cp_model.LinearExpr.weighted_sum(list(vs), list(cs)) + const


def build_model(p: Problem, assign=None):
    st = p.settings
    m = cp_model.CpModel()
    V = _Vars()

    def B(name):
        v = m.NewBoolVar(name)
        V.all.append(v)
        return v

    def I(lo, hi, name):
        v = m.NewIntVar(lo, hi, name)
        V.all.append(v)
        return v

    carry_val = p.horizon_end + 1
    now = min(s.base + s.off0 for s in p.slots)
    jid = {b.batch_id: j for j, b in enumerate(p.batches)}
    frozen_ids = {bid for v in p.frozen.values() for bid in v}
    slot_jobs = defaultdict(list)

    for j, b in enumerate(p.batches):
        cv = B(f"carry{j}")
        cj = I(0, carry_val, f"comp{j}")
        V.carry.append(cv)
        V.comp.append(cj)
        m.Add(cj == carry_val).OnlyEnforceIf(cv)
        lits = [cv]
        V.terms["carry"].append((b.weight, cv))
        for s in p.slots:
            cid = s.cell.cell_id
            if cid not in b.eligible or (b.not_before_day and s.day < b.not_before_day):
                continue
            if assign is not None and assign.get(j) != s.idx:
                continue
            d = b.dur[cid]
            lo, hi = p.earliest_start(s, b), s.axis - d
            if lo > hi:
                continue
            xv, sv = B(f"x{j}_{s.idx}"), I(lo, hi, f"s{j}_{s.idx}")
            V.x[j, s.idx], V.S[j, s.idx], V.lo[j, s.idx] = xv, sv, lo
            slot_jobs[s.idx].append(j)
            lits.append(xv)
            if s.lunch_min:
                al = B(f"al{j}_{s.idx}")
                V.al[j, s.idx] = al
                m.Add(sv + d > s.lunch_off).OnlyEnforceIf(al)
                m.Add(sv + d <= s.lunch_off).OnlyEnforceIf(al.Not())
                m.Add(cj == s.base + sv + d + s.lunch_min).OnlyEnforceIf([xv, al])
                m.Add(cj == s.base + sv + d).OnlyEnforceIf([xv, al.Not()])
            else:
                m.Add(cj == s.base + sv + d).OnlyEnforceIf(xv)
            if b.preferred_cell and b.preferred_cell != cid:
                V.pref.append(xv)
        m.AddExactlyOne(lits)
        days_left = (b.due - now) // 1440
        V.terms["flow"].append((b.weight * (1 + max(0, 3 - max(0, days_left))), cj))
        if b.batch_id in frozen_ids or b.running:
            m.Add(cv == 0)

    for sidx, ids in p.frozen.items():
        for bid in ids:
            if (jid[bid], sidx) not in V.x:
                raise RuntimeError(f"frozen job {bid} cannot be placed in its previous slot")
            m.Add(V.x[jid[bid], sidx] == 1)

    # ---- order level: completion, tardiness, late flag
    by_order = defaultdict(list)
    for j, b in enumerate(p.batches):
        by_order[b.order_id].append(j)
    for oid, js in by_order.items():
        b0 = p.batches[js[0]]
        co = I(0, carry_val, f"C_{oid}")
        tard = I(0, carry_val + max(0, -b0.due) + 1, f"T_{oid}")
        late = B(f"L_{oid}")
        V.order[oid] = (co, tard, late, js)
        for j in js:
            m.Add(co >= V.comp[j])
        m.Add(tard >= co - b0.due)
        m.Add(tard == 0).OnlyEnforceIf(late.Not())
        V.terms["late"].append((b0.weight, late))
        V.terms["tardy"].append((b0.weight, tard))
        for a, c in zip(js, js[1:]):          # identical sibling batches: break symmetry
            if p.batches[a].size == p.batches[c].size and not (p.batches[a].running or p.batches[c].running):
                m.Add(V.comp[a] <= V.comp[c])

    # ---- reshuffling versus the previous schedule
    for bid, (ps, sw) in p.prev_info.items():
        j = jid.get(bid)
        if j is None or bid in frozen_ids or (j, ps) not in V.x:
            continue
        xv, sv = V.x[j, ps], V.S[j, ps]
        dev = I(0, p.slots[ps].axis, f"dev{j}")
        V.dev[j] = dev
        m.Add(dev >= sv - sw).OnlyEnforceIf(xv)
        m.Add(dev >= sw - sv).OnlyEnforceIf(xv)
        V.terms["moves"] += [(1, dev), (-60, xv)]
        V.const["moves"] += 60

    # ---- sequencing per slot
    for s in p.slots:
        js = slot_jobs[s.idx]
        if not js:
            continue
        node = {j: i + 1 for i, j in enumerate(js)}
        arcs = []
        empty = B(f"empty{s.idx}")
        V.empty[s.idx] = empty
        arcs.append((0, 0, empty))
        ol = I(0, max(0, s.axis - s.cap), f"ol{s.idx}")
        V.ol[s.idx] = ol
        V.terms["overtime"].append((1, ol))
        for j in js:
            b, n = p.batches[j], node[j]
            d = b.dur[s.cell.cell_id]
            f, l = B(f"f{j}_{s.idx}"), B(f"l{j}_{s.idx}")
            V.first[j, s.idx], V.last[j, s.idx] = f, l
            arcs += [(0, n, f), (n, 0, l), (n, n, V.x[j, s.idx].Not())]
            su0 = p.first_setup(s, b)
            m.Add(V.S[j, s.idx] >= s.off0 + su0).OnlyEnforceIf(f)
            if su0:
                V.terms["setup"].append((su0, f))
            m.Add(ol >= V.S[j, s.idx] + d - s.cap).OnlyEnforceIf(l)
        for i in js:
            bi = p.batches[i]
            di = bi.dur[s.cell.cell_id]
            for j in js:
                if i == j:
                    continue
                bj = p.batches[j]
                if not p.can_follow(bi, bj):
                    continue
                su = p.setup_between(bi.part_number, bi.hose_type, bj)
                if V.lo[i, s.idx] + di + su > s.axis - bj.dur[s.cell.cell_id]:
                    continue
                a = B(f"a{i}_{j}_{s.idx}")
                V.arc[i, j, s.idx] = a
                arcs.append((node[i], node[j], a))
                m.Add(V.S[j, s.idx] >= V.S[i, s.idx] + di + su).OnlyEnforceIf(a)
                if su:
                    V.terms["setup"].append((su, a))
        m.AddCircuit(arcs)
        chain = [jid[bid] for bid in p.frozen.get(s.idx, [])]
        if chain:
            m.Add(V.first[chain[0], s.idx] == 1)
            for a, c in zip(chain, chain[1:]):
                if (a, c, s.idx) not in V.arc:
                    raise RuntimeError("frozen jobs cannot keep their previous order (rules or timing forbid it)")
                m.Add(V.arc[a, c, s.idx] == 1)
    return m, V, carry_val, jid


def _add_hint(p, m, V, hint, carry_val, jid):
    """Hint EVERY variable from a complete schedule so the solver starts from a real solution."""
    pos = {}
    for sidx, ops in hint.ops.items():
        for op in ops:
            pos[op.batch.batch_id] = (sidx, op)
    # identical-size sibling batches are interchangeable: hand them out in completion order
    groups = defaultdict(list)
    for b in p.batches:
        groups[b.order_id, b.size].append(b.batch_id)
    for ids in groups.values():
        taken = sorted((pos[i] for i in ids if i in pos), key=lambda t: t[1].slot.clock(t[1].end, False))
        for bid in ids:
            pos.pop(bid, None)
        for bid, t in zip(ids, taken):
            pos[bid] = t
    chosen = {jid[bid]: v for bid, v in pos.items()}
    seqs = defaultdict(list)
    for j, (sidx, op) in chosen.items():
        seqs[sidx].append((op.start, j))
    for sidx in seqs:
        seqs[sidx] = [j for _, j in sorted(seqs[sidx])]
    comp_val = {}
    for j, b in enumerate(p.batches):
        comp_val[j] = chosen[j][1].slot.clock(chosen[j][1].end, False) if j in chosen else carry_val
        m.AddHint(V.comp[j], comp_val[j])
        m.AddHint(V.carry[j], int(j not in chosen))
    for (j, sidx), xv in V.x.items():
        on = j in chosen and chosen[j][0] == sidx
        s, b = p.slots[sidx], p.batches[j]
        sv = chosen[j][1].start if on else V.lo[j, sidx]
        m.AddHint(xv, int(on))
        m.AddHint(V.S[j, sidx], sv)
        if (j, sidx) in V.al:
            m.AddHint(V.al[j, sidx], int(sv + b.dur[s.cell.cell_id] > s.lunch_off))
    for j, dev in V.dev.items():
        ps, sw = p.prev_info[p.batches[j].batch_id]
        m.AddHint(dev, abs(chosen[j][1].start - sw) if j in chosen and chosen[j][0] == ps else 0)
    for oid, (co, tard, late, js) in V.order.items():
        c = max(comp_val[j] for j in js)
        t = max(0, c - p.batches[js[0]].due)
        m.AddHint(co, c)
        m.AddHint(tard, t)
        m.AddHint(late, int(t > 0))
    for sidx, ol in V.ol.items():
        s = p.slots[sidx]
        seq = seqs.get(sidx, [])
        last_end = chosen[seq[-1]][1].end if seq else 0
        m.AddHint(ol, min(max(0, last_end - s.cap), max(0, s.axis - s.cap)))
        m.AddHint(V.empty[sidx], int(not seq))
        on = set()
        if seq:
            on |= {("f", seq[0]), ("l", seq[-1])} | {("a", a, c) for a, c in zip(seq, seq[1:])}
        for (j, si), v in V.first.items():
            if si == sidx:
                m.AddHint(v, int(("f", j) in on))
        for (j, si), v in V.last.items():
            if si == sidx:
                m.AddHint(v, int(("l", j) in on))
        for (i, j, si), v in V.arc.items():
            if si == sidx:
                m.AddHint(v, int(("a", i, j) in on))


def solve_lex(m, allvars, tiers, seconds, workers, log=False):
    """Minimize each goal in turn, locking in the best value found before moving to the next, so a
    higher-priority goal is never traded away. Returns (solver, {var index: value}, {goal: value}, all_optimal)."""
    solver = cp_model.CpSolver()
    solver.parameters.num_workers = int(workers)
    solver.parameters.random_seed = 7
    solver.parameters.log_search_progress = bool(log)
    tiers = [(n, e) for n, e in tiers if e is not None]
    snap, vals, all_opt, remaining = None, {}, True, float(seconds)
    if not tiers:
        tiers = [("none", cp_model.LinearExpr.constant(0))]
    for i, (name, expr) in enumerate(tiers):
        m.Minimize(expr)
        solver.parameters.max_time_in_seconds = max(0.5, remaining / (len(tiers) - i))
        t1 = _time.time()
        status = solver.Solve(m)
        remaining -= _time.time() - t1
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            if snap is None:
                raise RuntimeError(f"CP-SAT found no schedule (status {solver.StatusName(status)})")
            return solver, snap, vals, False
        all_opt &= status == cp_model.OPTIMAL
        snap = {v.Index(): solver.Value(v) for v in allvars}
        val = int(round(solver.ObjectiveValue()))
        vals[name] = val
        m.Add(expr <= val)                     # never give up an earlier goal for a later one
        m.ClearHints()
        for v in allvars:
            m.AddHint(v, snap[v.Index()])
    return solver, snap, vals, all_opt


def optimize(p: Problem, seconds=None, workers=None, hint: Schedule = None, log: bool = False,
             assign=None, mode=None) -> Schedule:
    st = p.settings
    seconds = st.solve_seconds if seconds is None else float(seconds)
    workers = workers or min(st.workers, os.cpu_count() or 1)
    mode = mode or st.objective_mode
    m, V, carry_val, jid = build_model(p, assign)
    if hint is not None:
        _add_hint(p, m, V, hint, carry_val, jid)

    mult = dict(late=st.w_late, tardy=st.w_tardy, carry=st.w_carry, moves=st.w_move,
                overtime=st.w_overload, setup=st.w_setup, flow=st.w_flow)
    t0 = _time.time()
    tiers_val, snap, all_optimal = {}, None, True

    if mode == "weighted":
        solver = cp_model.CpSolver()
        solver.parameters.num_workers = int(workers)
        solver.parameters.random_seed = 7
        solver.parameters.log_search_progress = bool(log)
        total = []
        for t in TIERS:
            e = _expr(V.terms[t], V.const[t])
            if e is not None:
                total.append(mult[t] * e)
        if V.pref:
            total.append(st.w_pref * sum(V.pref))
        m.Minimize(sum(total) if total else 0)
        solver.parameters.max_time_in_seconds = seconds
        status = solver.Solve(m)
        if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
            raise RuntimeError(f"CP-SAT found no schedule (status {solver.StatusName(status)})")
        snap, all_optimal = {v.Index(): solver.Value(v) for v in V.all}, status == cp_model.OPTIMAL
        obj = solver.ObjectiveValue()
    else:
        terms = {t: list(V.terms[t]) for t in TIERS}
        terms["setup"] += [(10, v) for v in V.pref]        # off-preferred-cell runs rank with setups
        tiers = [(t, _expr(terms[t], V.const[t])) for t in st.priority_order]
        solver, snap, tiers_val, all_optimal = solve_lex(m, V.all, tiers, seconds, workers, log)
        obj = float(sum(tiers_val.values())) if tiers_val else 0.0

    chosen, carried = defaultdict(list), []
    for (j, sidx), xv in V.x.items():
        if snap[xv.Index()]:
            chosen[sidx].append(j)
    for j, cv in enumerate(V.carry):
        if snap[cv.Index()]:
            carried.append(p.batches[j])
    ops = {}
    for sidx, js in chosen.items():
        js.sort(key=lambda j: snap[V.S[j, sidx].Index()])
        placed = place_sequence(p, p.slots[sidx], [p.batches[j] for j in js])
        if placed is None:
            raise RuntimeError("internal error: solver sequence does not fit when re-placed")
        ops[sidx] = placed
    name = "OPTIMAL" if all_optimal else "FEASIBLE"
    label = "OR-Tools CP-SAT optimizer" if assign is None else "OR-Tools CP-SAT sequencing"
    return Schedule(ops, carried, label, name, obj, None, _time.time() - t0, tiers_val)
