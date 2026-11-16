"""Load a previously published schedule (the JSON this tool writes) for stability comparison."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import pandas as pd


@dataclass
class Previous:
    generated_at: object
    ops: list          # dicts: batch_id, order_id, cell_id, day (date), seq, qty, start, end (datetime)
    source: str = ""


def _dt(v):
    return pd.to_datetime(v).to_pydatetime().replace(tzinfo=None)


def load_previous(path) -> Previous:
    path = Path(path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    ops = []
    for r in doc["operations"]:
        ops.append(dict(batch_id=r["batch_id"], order_id=r["order_id"], cell_id=r["cell_id"],
                        day=pd.to_datetime(r["day"]).date(), seq=int(r["seq"]), qty=int(r["qty"]),
                        start=_dt(r["start"]), end=_dt(r["end"])))
    return Previous(_dt(doc["generated_at"]), ops, str(path))


def latest_history(folder, day) -> Path | None:
    """Newest archived run for the same first day, e.g. <out>/history/schedule_2026-11-16_0914.json."""
    files = sorted(Path(folder, "history").glob(f"schedule_{day:%Y-%m-%d}_*.json"))
    return files[-1] if files else None
