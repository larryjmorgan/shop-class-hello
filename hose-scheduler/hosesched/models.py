"""Plain data classes shared by every module. All datetimes are naive US Eastern."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime, time
from typing import Optional


@dataclass(frozen=True)
class Part:
    part_number: str
    description: str
    hose_type: str
    run_min_per_unit: float          # standard minutes per assembly
    max_batch: int                   # largest batch (container / kit / lot) size
    setup_min: float = 0.0           # part-specific add-on (die, fitting, fixture)
    eligible_cells: tuple = ()       # empty = any cell
    preferred_cell: Optional[str] = None


@dataclass(frozen=True)
class Cell:
    cell_id: str
    name: str
    shift_start: time
    shift_end: time
    lunch_start: Optional[time]
    lunch_min: int
    efficiency: float                # run-rate factor, 1.0 = standard
    utilization: float               # planned load limit as a share of available time
    max_overtime_min: int
    current_hose_type: Optional[str] = None
    current_part: Optional[str] = None


@dataclass
class Order:
    order_id: str
    part_number: str
    qty: int
    due: datetime
    hot: bool = False
    priority: int = 3                # 1 = highest .. 5 = lowest
    kit_ready: Optional[datetime] = None
    customer: str = ""


@dataclass
class Override:
    order_id: str
    action: str                      # pin_cell | earliest_day | hold | expedite
    value: str
    reason: str
    entered_by: str = ""
    timestamp: str = ""


@dataclass
class Settings:
    schedule_date: Optional[date] = None
    as_of: Optional[datetime] = None
    data_as_of: Optional[datetime] = None
    max_data_age_min: int = 120
    horizon_days: int = 3
    pull_ahead_days: int = 2
    due_cutoff: time = time(15, 0)
    holidays: tuple = ()
    setup_same_type_min: float = 10
    setup_default_min: float = 30
    startup_min: float = 10
    kit_lead_min: int = 60
    solve_seconds: float = 30
    workers: int = 8
    baseline_rule: str = "edd"
    hot_multiplier: int = 3
    w_late: int = 20000
    w_tardy: int = 40
    w_carry: int = 5000
    w_setup: int = 20
    w_overload: int = 30
    w_flow: int = 1
    w_pref: int = 50


@dataclass
class Issue:
    level: str       # "error" | "warn"
    where: str
    message: str

    def __str__(self) -> str:
        return f"[{self.level.upper()}] {self.where}: {self.message}"


@dataclass
class Batch:
    batch_id: str
    order_id: str
    part_number: str
    hose_type: str
    size: int
    hot: bool
    priority: int
    due: int                         # minutes from problem origin
    due_dt: datetime
    kit_ready: Optional[int]         # minutes from origin or None
    weight: int
    eligible: tuple
    dur: dict = field(default_factory=dict)   # cell_id -> run minutes
    preferred_cell: Optional[str] = None
    not_before_day: Optional[date] = None
    seq: int = 0                     # original order-entry position (FIFO)
    n_batches: int = 1


@dataclass
class Slot:
    """One cell on one working day. Its own time axis is worked minutes 0..axis."""
    idx: int
    cell: Cell
    day: date
    day_index: int
    base: int            # minutes from origin to shift start
    avail: int           # worked minutes in the shift (shift length minus lunch)
    cap: int             # planned capacity = avail * utilization
    axis: int            # latest allowed end = avail + max overtime
    off0: int            # earliest start (as_of on day one)
    lunch_off: int       # worked minute at which lunch begins (axis units)
    lunch_min: int

    def clock(self, w: int, is_start: bool) -> int:
        """Worked minute -> minutes from origin, skipping the lunch break."""
        add = 0
        if self.lunch_min and (w >= self.lunch_off if is_start else w > self.lunch_off):
            add = self.lunch_min
        return self.base + w + add


@dataclass
class Op:
    batch: Batch
    slot: Slot
    setup_min: int
    setup_start: int     # worked minutes
    start: int
    end: int


@dataclass
class Schedule:
    ops: dict            # slot idx -> list[Op] in run order
    carried: list        # batches not scheduled inside the horizon
    method: str
    solver_status: str = ""
    objective: Optional[float] = None
    best_bound: Optional[float] = None
    seconds: float = 0.0
