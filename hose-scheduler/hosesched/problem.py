"""Turn validated input into a scheduling problem: working-day slots, batches, setup rules.

Planning concepts used here (standard production-activity-control practice):
  * Lot splitting: an order larger than the part's max batch becomes balanced batches.
  * Rated capacity: available time x planned utilization; run time = standard / efficiency.
  * Sequence-dependent setup: same part = 0, same hose type = small, other = matrix.
  * Planning time fence: only orders due inside horizon + pull-ahead days are released.
  * Order weights: hot and high-priority orders count more in the objective.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from typing import Optional

from .io import InputData, now_et, parse_date
from .models import Batch, Issue, Slot

PRIORITY_WEIGHT = {1: 4, 2: 3, 3: 2, 4: 1, 5: 1}


def _mins(dt: datetime, origin: datetime) -> int:
    return int((dt - origin).total_seconds() // 60)


def is_workday(d: date, holidays) -> bool:
    return d.weekday() < 5 and d not in holidays


def next_workday(d: date, holidays) -> date:
    while not is_workday(d, holidays):
        d += timedelta(days=1)
    return d


def _tmin(t: time) -> int:
    return t.hour * 60 + t.minute


@dataclass
class Problem:
    data: InputData
    origin: datetime
    slots: list
    batches: list
    days: list
    excluded: list = field(default_factory=list)      # (order_id, reason)
    issues: list = field(default_factory=list)
    horizon_end: int = 0                              # minutes from origin
    as_of: Optional[datetime] = None

    @property
    def settings(self):
        return self.data.settings

    @property
    def orders(self):
        return {o.order_id: o for o in self.data.orders}

    def dt(self, minutes: int) -> datetime:
        return self.origin + timedelta(minutes=minutes)

    # ---- setup rules
    def setup_between(self, prev_part: Optional[str], prev_hose: Optional[str], b: Batch) -> int:
        st = self.settings
        if prev_part is not None and prev_part == b.part_number:
            return 0
        base = self.data.changeover.get((prev_hose, b.hose_type))
        if base is None:
            base = st.setup_same_type_min if prev_hose == b.hose_type else st.setup_default_min
        return int(math.ceil(base + self.data.parts[b.part_number].setup_min))

    def first_setup(self, slot: Slot, b: Batch) -> int:
        c = slot.cell
        if slot.day_index == 0 and c.current_hose_type:
            return self.setup_between(c.current_part, c.current_hose_type, b)
        return int(math.ceil(self.settings.startup_min + self.data.parts[b.part_number].setup_min))

    def earliest_start(self, slot: Slot, b: Batch) -> int:
        lo = slot.off0
        if b.kit_ready is not None:
            lo = max(lo, b.kit_ready - slot.base)   # conservative: ignores lunch shift
        return lo


def build_problem(data: InputData, schedule_date: Optional[date] = None,
                  horizon_days: Optional[int] = None, as_of: Optional[datetime] = None) -> Problem:
    st = data.settings
    issues = list(data.issues)
    hol = set(st.holidays)
    start_day = schedule_date or st.schedule_date or now_et().date()
    first = next_workday(start_day, hol)
    if first != start_day:
        issues.append(Issue("warn", "Calendar", f"{start_day} is not a working day; scheduling from {first}."))
    n_days = horizon_days or st.horizon_days
    days = []
    d = first
    while len(days) < n_days:
        if is_workday(d, hol):
            days.append(d)
        d += timedelta(days=1)
    origin = datetime.combine(days[0], time(0, 0))
    as_of = as_of or st.as_of

    # ---- slots
    slots = []
    for di, day in enumerate(days):
        for c in data.cells:
            length = _tmin(c.shift_end) - _tmin(c.shift_start)
            lunch = c.lunch_min if c.lunch_start else 0
            avail = length - lunch
            cap = int(math.floor(avail * c.utilization))
            axis = avail + c.max_overtime_min
            lunch_off = (_tmin(c.lunch_start) - _tmin(c.shift_start)) if c.lunch_start else 10 ** 9
            off0 = 0
            if di == 0 and as_of is not None and as_of.date() == day:
                elapsed = _tmin(as_of.time()) - _tmin(c.shift_start)
                if elapsed > 0:
                    off0 = elapsed - (lunch if elapsed > lunch_off else 0)
            base = _mins(datetime.combine(day, c.shift_start), origin)
            slots.append(Slot(len(slots), c, day, di, base, avail, cap, axis, min(off0, axis), lunch_off, lunch))
    horizon_end = max(s.base + s.avail + s.lunch_min for s in slots)

    prob = Problem(data, origin, slots, [], days, [], issues, horizon_end, as_of)

    # ---- overrides
    pins, holds, expedite, earliest = {}, {}, set(), {}
    for ov in data.overrides:
        if ov.action == "pin_cell":
            pins[ov.order_id] = ov.value
        elif ov.action == "hold":
            holds[ov.order_id] = ov.reason
        elif ov.action == "expedite":
            expedite.add(ov.order_id)
        elif ov.action == "earliest_day":
            earliest[ov.order_id] = parse_date(ov.value)

    fence = days[-1] + timedelta(days=st.pull_ahead_days)
    cell_ids = [c.cell_id for c in data.cells]
    seq = 0
    for o in data.orders:
        part = data.parts[o.part_number]
        hot = o.hot or o.order_id in expedite
        if o.order_id in holds:
            prob.excluded.append((o.order_id, f"On hold: {holds[o.order_id]}"))
            continue
        if not hot and o.due.date() > fence:
            prob.excluded.append((o.order_id, f"Not released: due {o.due:%m/%d}, after planning fence {fence:%m/%d}"))
            continue
        elig = tuple(part.eligible_cells) or tuple(cell_ids)
        if o.order_id in pins:
            elig = (pins[o.order_id],)
        n = math.ceil(o.qty / part.max_batch)
        base_sz, extra = divmod(o.qty, n)
        weight = PRIORITY_WEIGHT[o.priority] * (st.hot_multiplier if hot else 1)
        for k in range(n):
            size = base_sz + (1 if k < extra else 0)
            dur = {}
            for c in data.cells:
                dur[c.cell_id] = max(1, int(math.ceil(size * part.run_min_per_unit / c.efficiency)))
            bid = o.order_id if n == 1 else f"{o.order_id}-{k + 1}/{n}"
            prob.batches.append(Batch(
                bid, o.order_id, o.part_number, part.hose_type, size, hot, o.priority,
                _mins(o.due, origin), o.due, _mins(o.kit_ready, origin) if o.kit_ready else None,
                weight, elig, dur, part.preferred_cell, earliest.get(o.order_id), seq, n))
        seq += 1
    return prob
