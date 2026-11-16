# Hose Scheduler

Daily finite-capacity scheduling for hose assembly cells, built on Google OR-Tools (CP-SAT).
Give it the open orders, the part master and the cell calendar; it returns a printable
cell-by-cell schedule, a kitting priority list, and a projected on-time-delivery score,
side by side with a simple dispatch-rule baseline.

It is a stand-alone Python tool. It does not touch the StoryBox app elsewhere in this repo.

## Quick start

```bash
cd hose-scheduler
pip install -r requirements.txt
python -m hosesched sample                          # writes examples/sample_inputs.xlsx (fictional data)
python -m hosesched run examples/sample_inputs.xlsx # writes out/schedule_<date>.xlsx / .html / .json
python -m pytest                                    # 25 tests (includes a mock Fabric MCP server)
```

Open `out/schedule_<date>.html` (works offline, prints one sheet per cell) or the `.xlsx`.
A finished example is in `examples/sample_output/`.

Useful options: `--date 2026-11-17`, `--days 2`, `--seconds 60`, `--as-of 2026-11-16T10:30`
(re-plan mid-day), `--rule edd|fifo|cr|slack|spt` (baseline), `-v` (solver log).
Exit code 2 means the data was stale.

## What you give it (one workbook, or a folder of CSVs with the same names)

| Sheet | Key columns |
| --- | --- |
| **Orders** | `order_id, part_number, qty, due_date, hot (Y/N), priority (1 high to 5 low), kit_ready, customer` |
| **Parts** | `part_number, hose_type, run_min_per_unit, max_batch, setup_min, eligible_cells, preferred_cell` |
| **Cells** | `cell_id, name, shift_start, shift_end, lunch_start, lunch_min, efficiency, utilization, max_overtime_min, current_hose_type` |
| **Changeover** | `from_hose_type, to_hose_type, setup_min` (optional) |
| **Overrides** | `order_id, action, value, reason, entered_by, timestamp` (optional) |
| **Settings** | `key, value`: dates, time fence, weights, `data_as_of` (see the generated sample) |

A date-only `due_date` means "finished by `due_cutoff`" (default 3:00 PM). Bad rows are reported
and skipped; they never stop the run.

## How it decides

1. **Lot splitting.** An order larger than the part's `max_batch` becomes balanced batches
   (250 with max 100 gives 83 + 83 + 84).
2. **Capacity.** Each cell on each working day is a slot. Run time is standard minutes divided by the
   cell's efficiency. Planned capacity is available time (shift minus lunch) times utilization.
   Work past planned capacity is penalized; work past shift end is capped by `max_overtime_min`.
3. **Setups depend on sequence.** Same part back to back: 0. Same hose type, new part: `setup_same_type_min`.
   Different hose type: the Changeover matrix (else `setup_default_min`). Plus the part's own `setup_min`.
   The first job of day 1 is set up from what the cell is running now; later days use `startup_min`.
4. **Kitting.** A batch cannot start before its `kit_ready` time. The Kitting sheet lists each batch by
   "stage kit by" (start time minus `kit_lead_min`) and flags kits that cannot be staged in time.
5. **Release fence.** Only orders due within the horizon plus `pull_ahead_days` are scheduled. Hot orders
   always are. The rest are listed as "not released".
6. **Optimization.** CP-SAT chooses the cell, the day and the sequence for every batch. It minimizes,
   in order of weight: late orders, minutes late, unscheduled batches, overtime, setups, and (lightly)
   finishing sooner, most strongly for orders due soon. Hot and priority-1 orders count several times
   more (`hot_multiplier`, priority weights 4/3/2/1/1). Weights are in Settings.
7. **Safety nets.** The dispatch baseline seeds the solver, so it never starts from nothing. Every
   schedule is re-checked by an independent verifier (capacity, setups, kit times, eligibility, overrides,
   each batch scheduled exactly once). If the optimizer ever loses to the baseline on lateness, or fails
   verification, the baseline is published and the report says so.

**On the CPIM material.** I built this from standard production-activity-control ideas (finite-capacity
loading, rated capacity, lot sizing/splitting, sequence-dependent setup, priority rules such as EDD and critical
ratio, planning time fence, order release). I did not have the CPIM learning materials in front of me, so check
the vocabulary and any formulas against your ASCM text before quoting this tool as "CPIM-compliant".

## Outputs

* **Excel**: `Summary` (KPIs vs baseline), one print-ready sheet per cell for day 1, `All days`, `Kitting`,
  `Orders`, `Load` (utilization by cell and day), `Exceptions`, `Overrides`.
* **HTML**: Gantt timeline per day (colored by hose type, hot jobs outlined red, setups grey), floor tables, kitting, exceptions.
* **JSON**: the same data for other systems (Fabric, a floor screen).

Every output carries the generation time and the data's timestamp. If the data is older than
`max_data_age_min` (default 120) a red STALE DATA banner appears and the command exits with code 2.

## Live data from Microsoft Fabric (MCP)

Instead of a workbook, point `run` at a source config. The tool connects to your MCP server, calls the
tools you name, and feeds the results through the same validation as a workbook.

```bash
cp examples/fabric.example.yaml my_fabric.yaml        # fill in your server, tools and queries
python -m hosesched mcp-tools my_fabric.yaml          # 1. what tools does the server offer?
python -m hosesched mcp-test  my_fabric.yaml          # 2. fetch every table, show columns and rows, validate
python -m hosesched run       my_fabric.yaml          # 3. build the schedule from live data
```

**Nothing about your Fabric setup is assumed.** Tool names, SQL, and column names are all yours to put in the
config. `mcp-tools` lists what the server offers; `columns:` maps your Fabric column names to the scheduler's.
The example file uses placeholder names, not real ones.

* **Transports:** streamable HTTP (URL + headers) or a local stdio process.
* **Auth:** secrets stay out of the file. Use `${ENV_VAR}` in `server:`, or `token_command` (a command, run
  without a shell, that prints a token), for example one that asks your Azure CLI for a token for the resource your
  tenant requires. Interactive browser sign-in is not supported.
* **Read only:** only the tools named in the config are ever called, and the tool never writes to Fabric.
  Give it a read-only identity anyway.
* **Mixed sources:** any table can be a local file instead (`cells: {file: cells.csv}`), so you can move table by
  table. `hosesched override` appends to the config's local overrides file; overrides are not written back to Fabric.
* **Freshness:** `freshness:` names a last-modified column. The newest value becomes "data as of", so the
  stale banner reflects the data, not when the query ran. Without it the tool warns that freshness is unverified.
  SQL timestamps are often UTC with no marker; set `assume_tz`. A timestamp that lands in the future is treated as
  unverified (it almost always means a timezone mix-up).
* **Result shapes accepted:** JSON (a list of objects, or `{columns, rows}`), JSON wrapped as `{"result": "<json>"}`,
  or CSV text. Use `rows_path: a.b` if the rows are nested. Paging is not built: make the query return the whole
  open-order set, and check the row count in `mcp-test`.
* **Audit trail:** every MCP run saves exactly what it pulled to `inputs_snapshot_<date>/` next to the outputs, so a
  schedule can be explained or reproduced later. During the parallel run this is your evidence.
* **Tested against a mock server** (`tests/mock_fabric_server.py`) over stdio with the `mcp` 2.3.0 SDK. It has not been run against a real Fabric endpoint. Expect to adjust the config on first contact. An HTTP path for `mcp` 1.x is included but untested.

## Team-lead overrides (reason required)

```bash
python -m hosesched override my_inputs.xlsx WO4112 pin_cell C2 --reason "Fixture only on Crimp 2" --by "Assembly lead"
```

Actions: `pin_cell <cell>`, `earliest_day <YYYY-MM-DD>`, `hold`, `expedite` (makes it hot). A row without a
reason is refused. Overrides are applied on the next run and listed in the Overrides sheet, so the
scheduler can review them and fold repeat patterns back into the rules.

## Fit with the pilot-to-production plan

| Plan requirement | Where it is in the tool |
| --- | --- |
| Every schedule shows its refresh time | Header on every sheet, the HTML and the JSON; stale-data banner, driven by the Fabric data's own timestamp |
| Live data through Fabric instead of an hourly Excel refresh | MCP source config (above) |
| Hot jobs enter through the tool | `hot` flag or `expedite` override; weighted in the objective |
| One-click override with a reason, routed to the scheduler | `override` command; reason mandatory; logged |
| Kitting stages ahead, live priority screen | Kitting sheet / HTML section ordered by "stage by" time |
| Printed schedule per cell | Per-cell sheets and print-ready HTML |
| Matches or beats the manual schedule during the parallel run | Baseline comparison on every run. The baseline is a rule of thumb, not your manual schedule: feed the planner's actual sequence in as a second input before claiming a win |
| Wrong orders kitted, overtime, past-due orders | Overtime, late orders and minutes late are reported; wrong-kit tracking needs ERP data |

## Assumptions and limits

* **The sample data is fictional** (invented part numbers, times and customers). The sample's results say nothing
  about your plant. Real run rates, setup times and the changeover matrix must come from your standards.
* One shift per cell per day; no overnight shifts. A job never splits across days or cells (a large order splits into batches).
* Operators and tooling are not modeled, only cells. Machine breakdowns and rework are not predicted;
  `utilization` is the cushion for them.
* Lunch is skipped in clock times, but a job can run across it. Day 2+ first-job setup is a flat estimate.
* `--as-of` re-plans from a given time, but it does not know what already ran. Use a fresh ERP extract with remaining quantities.
* Solve time grows quickly with size. About 40 batches over 3 days solves well in 30 s. At about 80 batches
  the result is still valid and verified, but gains over the baseline get smaller; use `--days 2`, more
  `--seconds`, or a larger machine. The reported solver status is `FEASIBLE`, not proven optimal.
* Times are US Eastern. Datetime columns coming from Fabric (`kit_ready`, `due_date`) must already be Eastern local time; convert them in the query.
