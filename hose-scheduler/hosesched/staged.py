"""Two-step optimization, so larger days still solve well.

Step 1 (assignment): decide which cell and day each batch runs, using estimated setups and a
        cumulative-load test against every due time. Small model, solves fast.
Step 2 (sequencing): with the cell/day of every batch fixed, sequence each cell-day exactly
        (same model as the full optimizer, but each sequence is tiny).
Step 3 (polish): give the remaining time to the full model, started from step 2's answer, and
        keep it only if it is better by the plant's priority order.

Step 1's setup and lateness figures are estimates; step 2 and the verifier use exact ones.
"""
from __future__ import annotations

import math
import os
import time as _time
from collections import defaultdict

from ortools.sat.python import cp_model

from .io import TIERS
from .kpi import kpis, score_key
from .models import Schedule
from .optimizer import _expr, optimize, solve_lex
from .problem import Problem
from .schedule import place_sequence


def _entry_costs(p: Problem):
    st = p.settings
    types = sorted({b.hose_type for b in p.batches})
    c_same = st.setup_same_type_min
    entry = {}
    for t in types:
        others = [p.data.changeover.get((o, t), st.setup_default_min) for o in types if o != t]
        entry[t] = (sum(others) / len(others)) if others else c_same
    return entry, c_same


def assign_batches(p: Problem, seconds: float, workers: int, log: bool = False) -> dict:
    st = p.settings
    m = cp_model.CpModel()
    allv = []

    def B(n):
        v = m.NewBoolVar(n)
        allv.append(v)
        return v

    def I(lo, hi, n):
        v = m.NewIntVar(lo, hi, n)
        allv.append(v)
        return v

    entry, c_same = _entry_costs(p)
    carry_val = p.horizon_end + 1
    now = min(s.base + s.off0 for s in p.slots)
    jid = {b.batch_id: j for j, b in enumerate(p.batches)}
    frozen_ids = {i for v in p.frozen.values() for i in v}
    T = {t: [] for t in TIERS}
    const = {t: 0 for t in TIERS}
    x, carry = {}, []
    in_slot = defaultdict(list)
    for j, b in enumerate(p.batches):
        cv = B(f"c{j}")
        carry.append(cv)
        lits = [cv]
        for s in p.slots:
            cid = s.cell.cell_id
            if cid not in b.eligible or (b.not_before_day and s.day < b.not_before_day):
                continue
            d = b.dur[cid]
            if p.earliest_start(s, b) + d > s.axis:
                continue
            x[j, s.idx] = B(f"x{j}_{s.idx}")
            lits.append(x[j, s.idx])
            in_slot[s.idx].append(j)
        m.AddExactlyOne(lits)
        T["carry"].append((b.weight, cv))
        days_left = (b.due - now) // 1440
        urg = b.weight * (1 + max(0, 3 - max(0, days_left)))
        T["flow"].append((urg * carry_val, cv))
        for s in p.slots:
            if (j, s.idx) in x:
                T["flow"].append((urg * s.base, x[j, s.idx]))
        if b.batch_id in frozen_ids or b.running:
            m.Add(cv == 0)
    for sidx, ids in p.frozen.items():
        for bid in ids:
            m.Add(x[jid[bid], sidx] == 1)

    # ---- slot capacity with estimated setups
    for s in p.slots:
        js = in_slot[s.idx]
        if not js:
            continue
        run = sum(p.batches[j].dur[s.cell.cell_id] * x[j, s.idx] for j in js)
        types = sorted({p.batches[j].hose_type for j in js})
        parts = sorted({p.batches[j].part_number for j in js})
        y = {t: B(f"y{t}_{s.idx}") for t in types}
        z = {q: B(f"z{q}_{s.idx}") for q in parts}
        for t in types:
            members = [x[j, s.idx] for j in js if p.batches[j].hose_type == t]
            m.AddMaxEquality(y[t], members)
        for q in parts:
            members = [x[j, s.idx] for j in js if p.batches[j].part_number == q]
            m.AddMaxEquality(z[q], members)
        est_terms = [(max(0.0, entry[t] - c_same), y[t]) for t in types] + \
                    [(c_same + p.data.parts[q].setup_min, z[q]) for q in parts]
        est_terms = [(int(math.ceil(c)), v) for c, v in est_terms if c > 0]
        est = sum(c * v for c, v in est_terms)
        work = s.axis - s.off0
        planned = max(0, s.cap - s.off0)
        m.Add(run + est <= work)
        ol = I(0, max(0, work - planned), f"ol{s.idx}")
        m.Add(run + est - planned <= ol)
        T["overtime"].append((1, ol))
        T["setup"] += est_terms
        for j in js:
            b = p.batches[j]
            if b.preferred_cell and b.preferred_cell != s.cell.cell_id:
                T["setup"].append((10, x[j, s.idx]))

    # ---- lateness: certain-late placements and cumulative load against each due time
    by_order = defaultdict(list)
    for j, b in enumerate(p.batches):
        by_order[b.order_id].append(j)
    late = {oid: B(f"L_{oid}") for oid in by_order}
    for oid, js in by_order.items():
        b0 = p.batches[js[0]]
        T["late"].append((b0.weight, late[oid]))
        for j in js:
            if b0.due <= p.horizon_end:
                m.Add(late[oid] >= carry[j])
                T["tardy"].append((b0.weight * max(0, p.horizon_end + 1 - b0.due), carry[j]))
    share = {j: int(math.ceil(entry[p.batches[j].hose_type] / 2)) for j in range(len(p.batches))}
    for s in p.slots:
        for j in in_slot[s.idx]:
            b = p.batches[j]
            cid = s.cell.cell_id
            d = b.dur[cid]
            if b.due >= s.clock(s.axis, False):
                continue
            if s.clock(s.off0 + d, False) > b.due:                     # late even if it ran first
                T["tardy"].append((b.weight * (s.clock(s.off0 + d, False) - b.due), x[j, s.idx]))
                m.Add(late[b.order_id] >= x[j, s.idx])
                continue
            grp = [k for k in in_slot[s.idx] if p.batches[k].due <= b.due]
            allow = s.worked(b.due) - s.off0
            load = sum((p.batches[k].dur[cid] + share[k]) * x[k, s.idx] for k in grp)
            big = s.axis * 2
            viol = I(0, big, f"v{j}_{s.idx}")
            lf = B(f"lf{j}_{s.idx}")
            m.Add(load - allow <= viol).OnlyEnforceIf(x[j, s.idx])
            m.Add(viol <= big * lf)
            m.Add(late[b.order_id] >= lf)
            T["tardy"].append((b.weight, viol))

    # ---- reshuffling
    for bid, (ps, sw) in p.prev_info.items():
        j = jid.get(bid)
        if j is None or bid in frozen_ids or (j, ps) not in x:
            continue
        T["moves"].append((-60, x[j, ps]))
        const["moves"] += 60

    tiers = [(t, _expr(T[t], const[t])) for t in p.settings.priority_order]
    _, snap, vals, _ = solve_lex(m, allv, tiers, seconds, workers, log)
    assign = {}
    for j in range(len(p.batches)):
        assign[j] = next((s.idx for s in p.slots if (j, s.idx) in x and snap[x[j, s.idx].Index()]), None)
    return assign


def repair(p: Problem, sched: Schedule) -> Schedule:
    """Try to place batches the sequencing step had to drop, one by one, anywhere they still fit."""
    if not sched.carried:
        return sched
    seqs = {s.idx: [o.batch for o in sched.ops.get(s.idx, [])] for s in p.slots}
    nfrozen = {k: len(p.frozen.get(k, [])) for k in seqs}
    carried = []
    for b in sorted(sched.carried, key=lambda b: (not b.hot, b.due, b.seq)):
        best = None
        for s in p.slots:
            cur = seqs[s.idx]
            idx = max(nfrozen[s.idx], sum(1 for x in cur if p.rank(x) <= p.rank(b)))
            trial = place_sequence(p, s, cur[:idx] + [b] + cur[idx:])
            if trial is None:
                continue
            cand = (s.clock(trial[idx].end, False), trial[idx].setup_min, s.idx)
            if best is None or cand < best[0]:
                best = (cand, s.idx, idx)
        if best is None:
            carried.append(b)
        else:
            seqs[best[1]].insert(best[2], b)
    ops = {sidx: place_sequence(p, p.slots[sidx], bs) for sidx, bs in seqs.items() if bs}
    out = Schedule(ops, carried, sched.method, sched.solver_status, sched.objective, None, sched.seconds, sched.tiers)
    out.notes = list(sched.notes) + [f"{len(sched.carried) - len(carried)} dropped batch(es) re-placed by the repair pass"]
    return out


def optimize_staged(p: Problem, seconds=None, workers=None, log=False) -> Schedule:
    st = p.settings
    seconds = st.solve_seconds if seconds is None else float(seconds)
    workers = workers or min(st.workers, os.cpu_count() or 1)
    t0 = _time.time()
    assign = assign_batches(p, max(1.0, seconds * 0.25), workers, log)
    s2 = optimize(p, max(1.0, seconds * 0.35), workers, log=log, assign=assign, mode="lexicographic")
    s2 = repair(p, s2)
    best = s2
    best.method = "Two-step optimizer (assign, then sequence)"
    left = seconds - (_time.time() - t0)
    if left > 2:
        try:
            pol = optimize(p, left, workers, hint=s2, log=log)
            if score_key(kpis(p, pol), st.priority_order) < score_key(kpis(p, s2), st.priority_order):
                pol.method = "Two-step optimizer + full-model polish"
                best = pol
        except RuntimeError:
            pass
    best.seconds = _time.time() - t0
    return best
