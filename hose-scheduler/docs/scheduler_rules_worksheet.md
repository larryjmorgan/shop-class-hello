# Scheduler rules worksheet

Your plan says the scheduler co-authors the rules. The tool can only be as good as the rules it starts
from, and today it starts from generic ones. Use this as an interview guide (about an hour), then turn
the answers into `rules.yaml` and the Parts / Changeover / Cells sheets.

Best single source: **the last 5–10 daily schedules he built by hand, and where he deviated from the tool's
pilot output and why.** Every deviation is a missing rule.

| # | Question | Where it goes |
| - | --- | --- |
| 1 | Which parts share dies, fixtures or crimp settings, so changing between them is quick? | `tooling_group` on Parts; `setup_same_tooling_min` |
| 2 | Which part-to-part changes are much cheaper or costlier than the hose-type default? | `setup_overrides` in rules.yaml, or the Changeover sheet |
| 3 | Are there hose types that must run first or last in a day (residue, cleanliness, pressure testing)? | `sequence_rank` in rules.yaml |
| 4 | Which cells can or cannot run which parts? Which cell is preferred, and why? | `eligible_cells`, `preferred_cell` on Parts |
| 5 | Are the standard run times believed? Which parts always run long or short? | Run `hosesched standards` on real history; fix `run_min_per_unit` or cell `efficiency` |
| 6 | What are the real batch sizes (container, kit, die capacity)? Can an order split across cells? | `max_batch` on Parts |
| 7 | How does he trade a hot job against a due date and against a changeover? | `priority_order` and `hot_multiplier` in Settings |
| 8 | What does he do when a cell is down, a kit is late, or a hot job lands mid-shift? | Overrides; `--as-of` re-plan; `freeze_minutes` |
| 9 | What does he never do, and what does he always do? | Candidate new rules: write them down verbatim |
| 10 | Which numbers do the team leads trust on the printed schedule, and which do they ignore? | Report layout; exceptions list |

Agree the priority order in the room. The default is: late orders, then minutes late, then unscheduled
work, then reshuffling, then overtime, then setups, then finishing sooner. A plant that would take a
late order to save a changeover will want a different order. `carry` must stay above `overtime` and
`setup`, or the optimizer could "save" setups by not scheduling the work.
