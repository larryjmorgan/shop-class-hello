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
            prev = op
    for b in sched.carried:
        seen[b.batch_id] += 1
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
    rule of thumb, not the plant's actual manual schedule."""
    if rule not in RULES:
        raise ValueError(f"rule must be one of {RULES}")
    seqs = {s.idx: [] for s in p.slots}
    carried = []
    for b in sorted(p.batches, key=_sort_key(p, rule)):
        best = None
        for s in p.slots:
            trial = place_sequence(p, s, seqs[s.idx] + [b])
            if trial is None:
                continue
            op = trial[-1]
            cand = (s.clock(op.end, False), op.setup_min, s.idx)
            if best is None or cand < best[0]:
                best = (cand, s.idx)
        if best is None:
            carried.append(b)
        else:
            seqs[best[1]].append(b)
    ops = {}
    for sidx, bs in seqs.items():
        if bs:
            ops[sidx] = place_sequence(p, p.slots[sidx], bs)
    return Schedule(ops, carried, f"Dispatch rule: {rule.upper()} (hot first)")
