"""Sequence placement, an independent schedule verifier, and dispatch-rule baselines."""
from __future__ import annotations

from collections import Counter

from .models import Op, Schedule
from .problem import Problem


def place_sequence(p: Problem, slot, batches):
    """Earliest-start placement of `batches` in order on one slot. None if it does not fit."""
    cid = slot.cell.cell_id
    ops, t, prev = [], slot.off0, None
    for b in batches:
        if cid not in b.dur or cid not in b.eligible:
            return None
        if b.not_before_day and slot.day < b.not_before_day:
            return None
        if prev is not None and not p.can_follow(prev, b):
            return None
        setup = p.first_setup(slot, b) if prev is None else p.setup_between(prev.part_number, prev.hose_type, b)
        start = max(t + setup, p.earliest_start(slot, b))
        end = start + b.dur[cid]
        if end > slot.axis:
            return None
        ops.append(Op(b, slot, setup, start - setup, start, end))
        t, prev = end, b
    return ops


def verify(p: Problem, sched: Schedule) -> list:
    """Re-check every rule from scratch. An empty list means the schedule is valid."""
    errs, seen = [], Counter()
    for sidx, ops in sched.ops.items():
        slot = p.slots[sidx]
        cid = slot.cell.cell_id
        prev = None
        for k, op in enumerate(ops):
            b = op.batch
            tag = f"{b.batch_id} on {cid} {slot.day}"
            seen[b.batch_id] += 1
            if cid not in b.eligible:
                errs.append(f"{tag}: cell not eligible")
            if b.not_before_day and slot.day < b.not_before_day:
                errs.append(f"{tag}: before earliest_day override")
            if op.end - op.start != b.dur[cid]:
                errs.append(f"{tag}: run time does not match standard")
            if op.start < slot.off0 or op.end > slot.axis:
                errs.append(f"{tag}: outside the shift window (start {op.start}, end {op.end}, axis {slot.axis})")
            if b.kit_ready is not None and slot.clock(op.start, True) < b.kit_ready:
                errs.append(f"{tag}: starts before the kit is ready")
            exp = p.first_setup(slot, b) if prev is None else p.setup_between(prev.batch.part_number, prev.batch.hose_type, b)
            if op.setup_min != exp:
                errs.append(f"{tag}: setup {op.setup_min} != expected {exp}")
            floor = slot.off0 if prev is None else prev.end
            if op.start - op.setup_min < floor:
                errs.append(f"{tag}: setup overlaps the previous job")
            if prev is not None and not p.can_follow(prev.batch, b):
                errs.append(f"{tag}: breaks the sequence_rank rule ({prev.batch.hose_type} before {b.hose_type})")
            prev = op
        want = p.frozen.get(sidx, [])
        got = [o.batch.batch_id for o in ops[:len(want)]]
        if want and got != want:
            errs.append(f"{cid} {slot.day}: frozen jobs {want} must run first in that order (got {got})")
    for sidx, want in p.frozen.items():
        if sidx not in sched.ops and want:
            errs.append(f"frozen jobs {want} are missing from slot {sidx}")
    for b in sched.carried:
        seen[b.batch_id] += 1
        if b.running or any(b.batch_id in w for w in p.frozen.values()):
            errs.append(f"{b.batch_id}: frozen or running job was carried over")
    for b in p.batches:
        if seen[b.batch_id] != 1:
            errs.append(f"{b.batch_id}: scheduled {seen[b.batch_id]} times (must be exactly once)")
    return errs


# ------------------------------------------------------------------ baselines
RULES = ("edd", "fifo", "cr", "slack", "spt")


def _sort_key(p: Problem, rule: str):
    now = min(s.base + s.off0 for s in p.slots)
    work = {}
    for b in p.batches:
        work[b.order_id] = work.get(b.order_id, 0) + min(b.dur.values())

    def key(b):
        if rule == "fifo":
            k = (b.seq,)
        elif rule == "cr":
            k = ((b.due - now) / max(1, work[b.order_id]), b.seq)
        elif rule == "slack":
            k = (b.due - now - work[b.order_id], b.seq)
        elif rule == "spt":
            k = (min(b.dur.values()), b.seq)
        else:  # edd
            k = (b.due, -b.weight, b.seq)
        return (not b.hot,) + k
    return key


def dispatch(p: Problem, rule: str = "edd") -> Schedule:
    """Forward finite-capacity loading: hot jobs first, then the chosen priority rule.
    Each batch goes to the cell/day that finishes it earliest. This is a planner-style
    rule of thumb, not the plant's actual manual schedule. Frozen jobs stay first; the
    sequence_rank rule decides where a batch may be inserted."""
    if rule not in RULES:
        raise ValueError(f"rule must be one of {RULES}")
    by_id = {b.batch_id: b for b in p.batches}
    seqs = {s.idx: [by_id[i] for i in p.frozen.get(s.idx, [])] for s in p.slots}
    nfrozen = {k: len(v) for k, v in seqs.items()}
    placed = {b.batch_id for v in seqs.values() for b in v}
    carried = []
    for b in sorted(p.batches, key=_sort_key(p, rule)):
        if b.batch_id in placed:
            continue
        best = None
        for s in p.slots:
            cur = seqs[s.idx]
            idx = max(nfrozen[s.idx], sum(1 for x in cur if p.rank(x) <= p.rank(b)))
            trial = place_sequence(p, s, cur[:idx] + [b] + cur[idx:])
            if trial is None:
                continue
            op = trial[idx]
            cand = (s.clock(op.end, False), op.setup_min, s.idx)
            if best is None or cand < best[0]:
                best = (cand, s.idx, idx)
        if best is None:
            carried.append(b)
        else:
            seqs[best[1]].insert(best[2], b)
    ops = {}
    for sidx, bs in seqs.items():
        if bs:
            ops[sidx] = place_sequence(p, p.slots[sidx], bs)
    return Schedule(ops, carried, f"Dispatch rule: {rule.upper()} (hot first)")
