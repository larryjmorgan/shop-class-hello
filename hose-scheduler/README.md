# Hose Scheduler

Daily finite-capacity scheduling for hose assembly cells, built on Google OR-Tools (CP-SAT).
Give it the open orders, the part master and the cell calendar; it returns a printable cell-by-cell
schedule, a kitting priority list, what changed since the last schedule, and a projected on-time score
beside a simple dispatch-rule baseline. It can also replay history to test itself.

It is a stand-alone Python tool. It does not touch the StoryBox app elsewhere in this repo.

## Quick start

```bash
cd hose-scheduler
pip install -r requirements.txt
python -m hosesched sample                          # fictional example inputs -> examples/sample_inputs.xlsx
python -m hosesched run examples/sample_inputs.xlsx # -> out/schedule_<date>.xlsx / .html / .json
python -m pytest                                    # 44 tests
```

Open `out/schedule_<date>.html` (works offline, prints one sheet per cell) or the `.xlsx`.
Finished examples are in `examples/sample_output/` and `examples/sample_backtest/`.

| Command | What it does |
| --- | --- |
| `run INPUT` | Build the schedule. INPUT is a workbook, a folder of CSVs, or a source config (.yaml) |
| `override INPUT ORDER ACTION [VALUE] --reason "..."` | Log a team-lead override (a reason is required) |
| `standards HISTORY` | Compare actual run minutes with the standards, by hose type and part |
| `backtest HISTORY --start D --end D` | Replay history day by day under several policies |
| `mcp-tools` / `mcp-test CONFIG` | Explore and validate a Fabric MCP source |
| `ddl` | T-SQL for the result tables (Fabric Warehouse) |
| `sample`, `sample-history` | Write FICTIONAL example inputs / history |

`run` options: `--date`, `--days`, `--seconds`, `--as-of 2026-11-16T10:30` (re-plan mid-day),
`--previous <json>|auto` (stay stable), `--rules rules.yaml`, `--rule edd|fifo|cr|slack|spt` (baseline),
`--publish CONFIG` (write results to a database), `-v` (solver log). Exit code 2 = stale data.

## Inputs (one workbook, or a folder of CSVs with the same names)

| Sheet | Key columns |
| --- | --- |
| **Orders** | `order_id, part_number, qty, due_date, hot (Y/N), priority (1 high to 5 low), kit_ready, customer` |
| **Parts** | `part_number, hose_type, run_min_per_unit, max_batch, setup_min, eligible_cells, preferred_cell, tooling_group` |
| **Cells** | `cell_id, name, shift_start, shift_end, lunch_start, lunch_min, efficiency, utilization, max_overtime_min, current_hose_type` |
| **Changeover** | `from_hose_type, to_hose_type, setup_min` (optional) |
| **Overrides** | `order_id, action, value, reason, entered_by, timestamp` (optional) |
| **Settings** | `key, value`: dates, time fence, goals, weights, `data_as_of` (see the generated sample) |

A date-only `due_date` means "finished by `due_cutoff`" (default 3:00 PM). Bad rows are reported and
skipped; they never stop the run.

## How it decides

1. **Lot splitting.** An order larger than the part's `max_batch` becomes balanced batches.
2. **Capacity.** Each cell on each working day is a slot. Run time is standard minutes divided by the cell's
   efficiency. Planned capacity is available time (shift minus lunch) times utilization. Work past planned
   capacity counts as overtime; work past shift end is capped by `max_overtime_min`.
3. **Setups depend on sequence.** In order of precedence: an explicit part-to-part override in `rules.yaml`;
   the same part back to back (0); parts in the same `tooling_group` (`setup_same_tooling_min`); otherwise the
   hose-type Changeover matrix (else `setup_same_type_min` / `setup_default_min`), plus the part's own `setup_min`.
4. **Kitting.** A batch cannot start before its `kit_ready`. The Kitting sheet lists batches by "stage kit by".
5. **Release fence.** Only orders due within the horizon plus `pull_ahead_days` are scheduled; hot orders always are.
6. **Two-step optimization.** Step 1 picks each batch's cell and day (estimated setups, cumulative load against
   every due time). Step 2 sequences each cell-day exactly. Step 3 hands the remaining time to the full model, started
   from step 2's answer, and keeps it only if it is better. Small days (20 batches or fewer) go straight to the full model.
7. **Ordered goals.** Settings `priority_order` (default: `late, tardy, carry, moves, overtime, setup, flow`):
   weighted late orders, weighted minutes late, unscheduled batches, reshuffling, overtime, setups, finishing sooner.
   In `lexicographic` mode (default) each goal is optimized in turn and locked in before the next, so a higher
   goal is never traded away for a lower one. Hot and priority-1 orders count more (`hot_multiplier`, weights 4/3/2/1/1).
   `carry` must rank above `overtime` and `setup` (otherwise dropping work would "save" them); the loader refuses
   an order that breaks this. `objective_mode: weighted` uses the `w_*` weights instead.
8. **Safety nets.** The baseline seeds the solver. Every schedule is re-checked by an independent verifier
   (capacity, setups, kit times, eligibility, sequence rules, frozen jobs, each batch exactly once). The best
   schedule by your priority order wins; if nothing beats the baseline, the baseline is published and the report says so.

**On the CPIM material.** I used standard production-activity-control ideas (finite-capacity loading, rated capacity,
lot splitting, sequence-dependent setup, priority rules such as EDD and critical ratio, planning time fence). I did not
have the CPIM learning materials, so check vocabulary and formulas against your ASCM text before calling this CPIM-aligned.

## Staying stable (reshuffling)

Re-plans should not shuffle the whole day. Pass the schedule you already published:

```bash
python -m hosesched run inputs.xlsx --out-dir out                                   # 2:00 PM: publish
python -m hosesched run inputs.xlsx --out-dir out --previous auto --as-of 2026-11-16T10:30   # 10:30 re-plan
```

Every run is archived in `out/history/`, so `--previous auto` finds the newest run for that day. With `--as-of`:
jobs already on a cell keep running (only the remaining time is scheduled, no new setup), and jobs due to start within
`freeze_minutes` (default 120) stay first, in order. Everything else may move, at a price: the `moves` goal counts
60 minutes for a batch that changes cell or day and the start-time shift otherwise. The report lists exactly what
changed ("Changes" sheet / section). **Limit:** in-progress and frozen status come from the previous schedule only. The tool
does not yet read completed quantities from the ERP, so give it an extract with remaining quantities.

## Sequencing rules from the scheduler

`rules.yaml` (see `examples/rules.example.yaml`) holds knowledge the data cannot: `sequence_rank` (for example PTFE
always runs last in a day) and `setup_overrides` (exact part-to-part changeovers). `tooling_group` on the Parts sheet
marks parts that share dies. **The example rules are illustrative: I do not know your real ones.** Use
`docs/scheduler_rules_worksheet.md` to elicit them from the scheduler; the best source is where he overrode the
pilot's output and why.

## Test it on history before trusting it

```bash
python -m hosesched standards history.xlsx
python -m hosesched backtest history.xlsx --start 2026-11-19 --end 2026-12-02 --policies optimizer,edd,fifo --seconds 10
```

History is a normal input workbook whose Orders sheet also has `release_date`, `actual_finish` and `actual_run_min`.

* **`standards`** compares actual run minutes with `qty x run_min_per_unit`. If the standards are off, no schedule built
  on them can be right, so do this first. It flags parts more than 15% off (3+ orders) and suggests an efficiency per hose type.
* **`backtest`** replays the window one working day at a time under each policy: schedule the open orders, "execute" that
  day at standard time (times `--slowdown`), carry unfinished work and the cell's last hose type forward. It scores
  orders due in the window and shows the real outcome beside the policies. Work finished before the window starts is not
  backlog. **Check the calibration:** replaying the policy you actually used (probably `fifo` or `edd`) should land
  close to ACTUAL. If it does not, the replay or the standards are off, and the comparison is not trustworthy yet.
* **Limits:** a replay is not the plant. It assumes each published day runs as planned (scaled by `--slowdown`) with no
  breakdowns or rework, and that the same orders were known on the same days. `examples/sample_backtest/` uses FICTIONAL
  history that was itself generated by this tool's replay, so its calibration match is built in and means nothing for your plant.

## Live data from Microsoft Fabric

Three ways in, and one out. **I could not test any of them against a real Fabric tenant.**

| | Use when | Notes |
| --- | --- | --- |
| **SQL endpoint** (`transport: sql`, `examples/fabric_sql.example.yaml`) | Unattended daily job (recommended) | Read-only SELECT per table, typed columns, no paging problem. Needs pyodbc, the ODBC driver and a service principal. Tested against SQLite as a stand-in. |
| **Fabric notebook** (`fabric/notebook_runner.py`) | You want it to run inside Fabric | A template: reads Lakehouse tables, calls `pipeline.run(tables=...)`, writes Delta tables. **Untested** (the hosesched calls are tested; the Spark calls are not). |
| **MCP** (`examples/fabric.example.yaml`) | Claude or an agent needs to drive it, or no SQL access | Tool names, queries and columns come from your config (`mcp-tools` lists what the server offers). Tested against a mock MCP server (`mcp` 2.3.0). |

Common to all: secrets stay in `${ENV_VAR}`; only SELECTs or the tools you name are ever called; any table can instead be a
local file; `freshness:` names a last-modified column so the stale banner reflects the data, not the query time (SQL timestamps
are often UTC: set `assume_tz`; a timestamp in the future is treated as unverified); every run saves what it pulled to
`inputs_snapshot_<date>/`.

**Write-back.** `run --publish CONFIG` writes the schedule to seven tables (`schedule_ops`, `_orders`, `_kpis`, `_load`,
`_kitting`, `_exceptions`, `_changes`). The layout is a fixed contract (`hosesched ddl` prints the T-SQL); each row carries
`run_id`, `generated_at` and `data_as_of`, so a Power BI page or kitting screen can show how fresh it is. A rerun with the
same `run_id` replaces rather than duplicates. As I understand Fabric, a Lakehouse SQL endpoint is read-only, so write to a
Warehouse or use the notebook runner; verify that for your tenant. **Power BI reports are not built**: the tables are the contract.

Overrides can be rows in a table (`schedule_overrides`, reason required) read on every run, so a team lead's change does not need a command line.

## Outputs

* **Excel**: `Summary`, one print-ready sheet per cell for day 1, `All days`, `Kitting`, `Orders`, `Load`, `Changes`, `Exceptions`, `Overrides`.
* **HTML**: Gantt per day (colored by hose type, hot jobs outlined, setups grey), floor tables, kitting, changes, exceptions.
* **JSON**: the same data for other systems, and the input to `--previous`.

Every output carries the generation time and the data's timestamp. If the data is older than `max_data_age_min`
(default 120) a red STALE DATA banner appears.

## Fit with the pilot-to-production plan

| Plan requirement | Where it is |
| --- | --- |
| Every schedule shows its refresh time | Header on every output; stale banner driven by the data's own timestamp |
| Live data through Fabric | SQL endpoint, notebook or MCP source (above) |
| Hot jobs enter through the tool | `hot` flag or `expedite` override; weighted in the goals |
| One-click override with a reason, routed to the scheduler | `override` command or an overrides table; reason mandatory; logged and listed |
| Less reshuffling | Freeze, `moves` goal, Changes report, `moves` KPI |
| Kitting stages ahead | Kitting sheet / table ordered by "stage by" |
| Matches or beats the manual schedule | `backtest` against history, with ACTUAL shown. The baseline is a rule of thumb, not the manual schedule |
| Scheduler co-authors the rules | `rules.yaml`, `tooling_group`, worksheet |

## Assumptions and limits

* **The sample data is fictional.** Its results say nothing about your plant. Real run rates, setup times and the
  changeover matrix must come from your standards (check them with `standards`).
* One shift per cell per day; no overnight shifts. A job never splits across days or cells (a large order splits into batches).
* Operators and tooling are not modeled, only cells. Breakdowns and rework are not predicted; `utilization` is the cushion.
* Lunch is skipped in clock times, but a job can run across it. Day 2+ first-job setup is a flat estimate.
* The two-step method's setup and lateness figures in step 1 are estimates; step 2 and the verifier are exact.
  On the fictional sample (43 batches) it reached the reported result in about 15 s; on an 82-batch day it still
  returned verified results in under 30 s with large gains over the baseline, but solver status is `FEASIBLE`, not proven optimal.
  Larger days: more `--seconds`, or `--days 2`.
* Times are US Eastern. Datetime columns from Fabric (`kit_ready`, `due_date`) must already be Eastern local time.
* No shift-level actuals feed yet (see "Staying stable").
