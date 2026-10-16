# Make Waterline's tasks bend to real tanks

Waterline's tasks work for a tank kept on a steady weekly routine. They work against a keeper who does the work on a different day or runs a short-term regimen, and that is most of how an experienced planted-tank keeper actually works. Each task holds one cadence and one next-due date. **Mark done always means "now"**, **snooze can only push a task later**, **plain Done writes nothing to History**, and a water change logged a day early **does not tick its reminder by default**. Temporary regimens like "water change every 3 days while ammonia persists" or "brush hair algae every other day for two weeks" have no home in the app, so the keeper writes them into notes. The live data shows the gap. The Betta Tank had **eleven water changes in five weeks, at 36–50%**, against a task called "Water change 25%". It had reactive fertilizer doses, a daily dechlorinator regimen and an algae fight, none of them in its six open tasks. One "Skipped" entry in History most likely records a water change that was in fact done. Three quick fixes, all inside the current model and the project's own rules, remove most of the day-to-day friction: **a "Done on…" date**, **log forms that complete the matching reminder by default**, and **a History entry for every Done**. The next step adds a **temporary cadence that reverts on its own** and **pausing a task or a tank's tasks**, which covers the keeper's real outbreak pattern. The largest step is **treatment plans**: a regimen template that creates bounded tasks and pauses routine ones. No aquarium app I found offers this, and it lies outside the current designs, so it needs a product decision before anyone builds it.

## Six open tasks shadow a tank cared for every other day

The live data (read 2026-10-16 through the Waterline MCP tools) covers two planted tanks and about two months. The task list is sparse and simple: **six open tasks, all plain cadences, none snoozed**. The Betta Tank has a 3 mL Thrive dose every 2 days, a 25% water change every 3 days, a canister clean every 28 days, and the quarterly review. The Shrimp Bowl has a 20% water change every 7 days and the review ([get_tasks](mcp://Waterline_LIve/get_tasks)). The Shrimp Bowl's two logged water changes fall on its weekly cadence ([get_history](mcp://Waterline_LIve/get_history)). That is the case the current model was built for, and it works.

The Betta Tank tells a different story. Since early September its water changes came at gaps of **8, 5, 3, 5, 3, 3, 3, 2, 2 and 0 days**, the last pair on one day because ammonia was high. Every one was **36–50%, never the 25% the task name promises** ([get_water_changes](mcp://Waterline_LIve/get_water_changes)). Fertilizer is dosed by hand in pumps, sometimes several times in one afternoon, in response to nitrate reading zero. The "3 mL Thrive" task is kind *other*, not a dosing routine, so marking it done logs nothing. The tank had **21 water tests in 30 days with no test task at all** ([get_tank_summary](mcp://Waterline_LIve/get_tank_summary)). The regimens that actually ran appear only as notes and maintenance entries:

- a daily dechlorinator dose started "while ammonia persists"
- fertilizer paused until ammonia read zero
- hair algae brushed every other day
- wood removed as the suspected algae source
- a light replaced and its intensity raised ([get_history](mcp://Waterline_LIve/get_history))

One History entry stands out: **"Skipped: Water change 25%" the morning after a 36% water change was logged**. That fits the log form's reminder checkbox being unticked because the task wasn't due yet. The keeper then cleared the reminder with Skip, so History now says the opposite of what happened. This is an inference: the tools don't expose a task's due date at that moment, its completion history or its schedule mode.

Three things follow from this, all from one keeper over a short period. The 3-day water-change cadence is a **temporary emergency regimen sitting in a permanent task**, and nothing will prompt the keeper to set it back to weekly. Task names have taken on amounts ("25%", "3 mL") that the logs contradict. And the keeper's reactive, problem-driven care is invisible to the task system, which therefore can't help with it.

## Four code paths punish doing the work on the wrong day

The code confirms that the friction is structural. A task row stores `next_due`, an optional `snoozed_until`, an `ends_on` and a `schedule_mode` of completion, fixed or weekdays ([schema.ts:316-346](../src/lib/server/db/schema.ts)). There is no anchor date and no stored "last done". `task_completions` exists mainly so Undo works ([schema.ts:348-360](../src/lib/server/db/schema.ts)). The recurrence maths is sound. Fixed mode keeps a Saturday task on Saturdays when it is done early. Weekday mode explicitly stops "Wednesday's dose done early on Monday" from coming back. A late fixed task jumps to the next future date instead of piling up ([tasks.ts:54-81](../src/lib/tasks.ts)). Four paths around that maths cause the problems.

**First, the default anchor drifts and nothing shows which anchor a task uses.** New tasks default to "When I complete it" ([task-form.ts:44-58](../src/lib/server/task-form.ts)), so doing Saturday's maintenance on Thursday moves every later Saturday to Thursday. The row's cadence text reads "every 3 days" whatever the mode ([TaskList.svelte:33-65](../src/lib/components/TaskList.svelte)). The keeper can't see whether a task will drift until it does.

**Second, a task can only move one way.** The server rejects any snooze date on or before the due date ([tasks/+page.server.ts:68-72](../src/routes/(app)/tasks/+page.server.ts)). "I'll do it today instead of Saturday" has no action except editing the task. On phones, Snooze appears only on overdue rows ([tasks/+page.svelte:382-383](../src/routes/(app)/tasks/+page.svelte)).

**Third, Done has no date.** The Tasks page calls `completeTask` with no `at` ([tasks/+page.server.ts:57](../src/routes/(app)/tasks/+page.server.ts)), even though `completeTask` already accepts one ([server/tasks.ts:47-56](../src/lib/server/tasks.ts)). Only the water-change and test log forms backdate a completion ([logs.ts:71-73, 270-275](../src/lib/server/logs.ts)). "Did it last night, forgot to tap" shifts a completion-mode schedule by a day.

**Fourth, logs and tasks only half connect.** The log form offers "Also mark the reminder done" only for a task due within 3 days. It ticks the box only when the task is due or overdue, and its "next" preview counts from today, not from the entry's date ([log-forms.ts:100-133](../src/lib/server/log-forms.ts)). It links only the *first* open task of that kind ([server/tasks.ts:172-176](../src/lib/server/tasks.ts)). The water-change and Maintenance forms both use this path: Maintenance maps to `maintenance` tasks ([events.ts:251-255](../src/lib/events.ts)), so a tank with several maintenance tasks gets one offered at most. A hand-logged dose never completes a dosing routine. The reverse also fails: **marking a plain task done writes no events row** ([server/tasks.ts:47-84](../src/lib/server/tasks.ts)). That breaks the project's own rule that "every write that changes tank state also writes an `events` row" ([CLAUDE.md](../CLAUDE.md)). A canister clean done from the Tasks page never reaches History or the chart marks.

The surrounding surfaces add volume problems:

- The Overview's Due column shows `dueTasks.slice(0, 3)` ([(app)/+page.svelte:262](../src/routes/(app)/+page.svelte)).
- Nothing can be marked done in bulk.
- ⌘K only links to Tasks ([CommandPalette.svelte:100-101](../src/lib/components/CommandPalette.svelte)).
- Reminders go out once a day per user at `send_time`, with no time of day per task ([notifications.ts:167-186](../src/lib/server/notifications.ts)).

Treatment courses exist, but they are dosing routines started from a plant or livestock health entry: every 2 days, ending in 10 days ([task-form.ts:207-212](../src/lib/server/task-form.ts)). Algae entries (#86) have no link to them. Maintenance routines (#92) bundle log steps but have no schedule ([routines.ts:1-5](../src/lib/routines.ts)).

| Off-day situation | What Waterline does today |
| --- | --- |
| Weekly Saturday maintenance done Thursday before a weekend away | Completion mode moves every later Saturday to Thursday. Fixed mode keeps Saturday, but the mode was chosen at creation and isn't shown |
| Water change done a day early from Log water change | Reminder offered but unticked; it stays due tomorrow and gets Skipped (History says "Skipped") or marked done again (schedule shifts) |
| Water change done 4+ days early | Reminder not offered at all |
| Forgot to tap Done yesterday | Only "now" is possible; completion-mode schedules slip a day |
| "Do it today instead" without doing it yet | No action; snooze refuses earlier dates |
| Outbreak: water change every 3 days for a few weeks | Edit the interval by hand, then remember to edit it back |
| 3-day blackout: no ferts, no feeding, then a water change | No regimen object; each routine skipped or snoozed one at a time |

The redesign itself diverges from what was built in one place. It specifies a snooze menu of Later today, Tomorrow, In 2 days, This weekend and Next week, each showing its date, on tasks due within a day ([redesign README:176-178](../design_handoff_waterline_redesign/README.md)). The built menu is different ([tasks.ts:186-205](../src/lib/tasks.ts)). The designs cover only the single-occurrence, cadence model. Regimens, pausing, moving a task earlier and done-on-a-date are all outside them.

## Planted-tank care runs on weekday rhythms and timed regimens

Planted-tank practice produces four scheduling shapes, and the current model handles only the first cleanly.

**The first shape is a weekday rhythm anchored on water-change day.** Estimative Index dosing puts macros on Monday, Wednesday and Friday, micros on the alternate days, and a 50% water change on the rest day that "resets" build-up ([Practical Fishkeeping](https://www.practicalfishkeeping.co.uk/features/what-you-need-to-know-about-ei-plant-feeding/); [gensou.sg](https://gensou.sg/?p=40746)). PPS-Pro doses daily, usually before lights-on, alongside a weekly 50% change ([PPS dosing](https://sites.google.com/site/aquaticplantfertilizer/home/chemicals)). Waterline's `weekdays` mode fits a single dosing task. What it lacks is the link to the water change: when the keeper moves the water change from Sunday to Monday, the EI week should move with it.

**The second shape is staggered work that keeps its distance from the water change.** Guides consistently say to clean the filter on a different day from a large water change, every 2–4 weeks or "when flow drops", and to change one major variable at a time ([fishlore](https://www.fishlore.com/aquariumfishforum/threads/water-changes-and-filter-maintenance-on-the-same-day.235005/); [fishbazaarr](https://fishbazaarr.in/blogs/aquarium-filters/how-often-clean-aquarium-filter); [islandfishandreef](https://www.islandfishandreef.com/blog/why-your-fish-tank-maintenance-schedule-is-wrong/)). Consumables run on long, usage-dependent cycles: root tabs every 2–3 months ([forfishlovers](https://forfishlovers.com/planted-tank-guide/)), and a 5 lb CO2 cylinder lasts roughly 2–4 months on a 40-gallon tank ([2Hr Aquarist](https://www.2hraquarist.com/blogs/choosing-co2-why/co2-system-101)). For these, a soft "due around" date fits better than a hard deadline.

**The third shape is a bounded regimen that adds tasks and pauses others.** Algae treatments come in recognizable forms:

- **Blackout:** 3–5 days, about 7 at most. CO2, fertilizer and feeding are paused during it, and a 4–5 hour photoperiod follows for 1–2 weeks. It is "almost totally inefficient" against red algae ([Aquasabi](https://aquasabi.com/aquascaping-wiki/algae/black-out-treatment); [Green Aqua](https://greenaqua.hu/en/blog/post/blackout-fight-against-algae-without-chemicals)).
- **Spot treatment:** liquid carbon or 3% peroxide applied with flow off for roughly 5–30 minutes, repeated daily, alongside water changes ([Green Aqua](https://greenaqua.hu/en/blog/post/fighting-algae-seachem-flourish-excel); [aquascapeguide](https://www.aquascapeguide.com/post/battling-the-green-menace-using-hydrogen-peroxide-for-hair-algae-control)).
- **UV for green water:** typically clears it in 3–5 days ([Buce Plant](https://buceplant.com/blogs/aquascaping-guides-and-tips/how-to-get-rid-of-green-water-in-aquariums)).

Medication labels are day-indexed courses. Maracyn is dosed on days 1–5 with a 25% water change on day 6 ([Fritz](https://fritzaquatics.com/products/mardel-maracyn)). API E.M. needs a water change *before* each of its four daily doses ([furrycritter](https://www.furrycritter.com/pages/pharma/fish/api_em_erythromycin.htm)). A new planted tank gets 3–4 water changes in its first week, tapering by about two months ([Aquarium Gardens](https://www.aquariumgardens.co.uk/the-fight-against-algae-38-w.asp)). Vacation prep counts back from the departure date: a water change about 3 days before, then a larger change and a last fertilizer dose the day before ([theaquariumhome](https://theaquariumhome.com/2024/11/26/how-to-prep-your-aquarium-for-vacation/)).

**The fourth shape ends on a condition, not a date.** Examples: clean the filter when flow drops; consider raising phosphate when green spot algae appears and PO4 reads below 0.1 ppm ([aquariumbreeder](https://aquariumbreeder.com/how-to-remove-green-spot-algae-in-aquariums/)); a fishless cycle is done when 2 ppm ammonia clears to zero in 24 hours ([Aquarium Co-Op forum](https://forum.aquariumcoop.com/topic/36491-how-to-know-when-cycle-is-done-completely)). The keeper's own "pause Thrive until ammonia reads 0" is this shape exactly, and Waterline already stores the readings that would end it.

Two cautions apply. The sources are hobby blogs, retailer guides and forums, read through search summaries, and they conflict. PPS-Pro water-change advice varies from weekly 50% to "only if TDS rises". Overdosing Excel has anecdotal success and documented risks to plants and shrimp ([plantedtank.net](https://www.plantedtank.net/threads/flourish-excel-as-algacide-please-advise.1281189/)). **Any built-in regimen must be an editable starting point, never a prescription.** Also, no source measures how often keepers really shift days. The live data and the product owner's own experience are the best evidence available on that.

## Prior art agrees on six rules, and Waterline follows four

To-do, chore and aquarium apps have converged on six rules for recurring tasks:

1. Two named anchors explained in plain words: Todoist's `every` versus `every!` ([Todoist help](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV)), and Aquarimate's "dynamic" versus "fixed" schedules ([Aquarimate](https://www.aquarimate.com/features/tasks-activities/)).
2. Completing early or late without breaking the rule.
3. Skip as a separate action from done, and visible as such.
4. No stacking of missed occurrences.
5. "Move this one" kept separate from "change the rule", asked only where it matters.
6. Bulk pause and resume.

Waterline already follows the first four: its schedule form explains each mode with an example ([TaskForm.svelte:268-273](../src/lib/components/TaskForm.svelte)), Skip shipped in #71, and the fixed-mode loop collapses missed occurrences. **The two it lacks, move-one-vs-change-rule and pause, are exactly what a keeper juggling an outbreak needs.**

Things 3.23 (August 2026) is the clearest current model for both. A repeating to-do can be checked off early, and the next copy follows the existing rule. Rescheduling a fixed repeat asks **"Make Exception"** or **"Update Rule"**. After-completion repeats simply move, with no prompt. Several repeats can be paused, resumed or stopped at once ([Cultured Code](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/); [MacRumors](https://www.macrumors.com/2026/08/19/things-3-23-brings-long-requested-overhaul-of-repeating-to-dos/); [9to5Mac](https://9to5mac.com/2026/08/19/things-3-23-update-now-available-with-major-repeating-to-do-improvements/)). The press called it a "long-requested overhaul", which shows how much users wanted per-occurrence moves.

Complaints about plant-care apps mirror Waterline's gaps. A Planta user reported "no way to mark plants as watered" when off schedule. Another found that repeated snoozing never taught the schedule anything ([Planta reviews](https://apps.apple.com/us/app/planta-plant-garden-care/id1410126781?see-all=reviews)). Sweepy's holiday mode shows what goes wrong when pause has no clear resume rule: a user reported last-done dates set inside the vacation after it ended ([Tidied](https://www.tidied.app/blog/sweepy-app-review)). Grocy keeps skips out of "last tracked" ([Grocy ChoresService.php](https://github.com/grocy/grocy/blob/master/services/ChoresService.php)). Donetick has "trigger" chores that activate when a linked thing changes state, the nearest prior art to "N days after a water change" ([Donetick thing model](https://github.com/donetick/donetick/blob/develop/internal/thing/model/model.go)). Medication apps model a course as an ordinary schedule with a days limit ([Minimalist Journeys on Medisafe](https://www.minimalistjourneys.com/medisafe-app-review/)).

The research found **no aquarium or plant app with a documented treatment-course or regimen feature**. That makes regimens Waterline's clearest chance to stand out, but it also means there is no tested pattern to copy.

## Recommendations run from one-week fixes to treatment plans

The tiers below are in build order. "In design" means the redesign already specifies the change. "Confirm" means a small addition consistent with existing behaviour, worth one line from the product owner. "Decision" means it goes beyond the designs and, under CLAUDE.md, needs sign-off before work starts.

### Quick fixes inside the current model

| # | Change | Grounding | Status |
| --- | --- | --- | --- |
| Q1 | **Write a History entry for every Done.** A maintenance task logs a Maintenance entry ("Done: Clean canister"); water-change or test tasks done without a form log a note; the entry links to the completion so Undo removes both | Plain Done writes only `task_completions` ([server/tasks.ts:47-84](../src/lib/server/tasks.ts)), against the events rule in [CLAUDE.md](../CLAUDE.md) | Confirm (enforces an existing rule) |
| Q2 | **"Done on…" date.** Mark done gets Today / Yesterday / Pick a date (no future dates) and passes `at` through, so a completion-mode schedule counts from the real day | `completeTask` already takes `at` ([server/tasks.ts:53-56](../src/lib/server/tasks.ts)); the page never sends it ([tasks/+page.server.ts:57](../src/routes/(app)/tasks/+page.server.ts)); Planta "already watered" complaint | Confirm |
| Q3 | **Logs complete their reminder by default.** Tick "Also mark the reminder done" whenever the entry falls on or before the next due date (not only when due). Offer the task even when it is more than 3 days out, compute "next" from the entry's date, and when Skip is pressed on a task with a matching log in the last few days, offer "Count the water change on <date>" instead | [log-forms.ts:116-132](../src/lib/server/log-forms.ts); the "Skipped" note the day after a logged change ([get_history](mcp://Waterline_LIve/get_history)) | Partly in design ([README:186](../design_handoff_waterline_redesign/README.md)); confirm the new default |
| Q4 | **Show the anchor and last done.** Cadence text says "every 3 days after last done · last Oct 13" or "every Sat". The edit pane lists the last few completions, including skips. Pre-pick the mode by kind (completion for water changes and filter, weekdays for dosing). Add schedule mode, ends_on and last done to the assistant's `get_tasks` | `task_completions` is read by no page; [table-tools.ts:176-218](../src/lib/server/assistant/table-tools.ts); default mode in [task-form.ts:44-58](../src/lib/server/task-form.ts) | Confirm copy |
| Q5 | **Match the designed snooze menu and add "Move to today".** Show In 2 days / This weekend / Next week with dates. For a task not yet due, add "Do it today" (moves `next_due` earlier; it is not a snooze) | [README:178](../design_handoff_waterline_redesign/README.md) vs [tasks.ts:186-205](../src/lib/tasks.ts); server rejects earlier dates ([tasks/+page.server.ts:68-72](../src/routes/(app)/tasks/+page.server.ts)) | Menu in design; "Later today" is a decision (tasks have no time of day); "Move earlier" is confirm |
| Q6 | **Overview shows everything due today or overdue.** Keep 3 rows only for upcoming tasks, with "+N more" | [(app)/+page.svelte:262](../src/routes/(app)/+page.svelte) | Confirm (design says "the next tasks") |
| Q7 | **A hand-logged dose completes its dosing routine** when product and tank match, the same way a logged equipment service completes its maintenance task. Show the last logged amount on the row, so task names stop holding amounts | [specs.ts:290-310](../src/lib/server/specs.ts); the "3 mL Thrive" task against doses logged in pumps | Confirm |

Q1–Q3 come first. Together they fix the data-integrity gap and the friction behind the "Skipped" entry, and they need only small changes to existing actions with Undo already in place.

### Medium features that extend the schedule model

| # | Change | Grounding | Status |
| --- | --- | --- | --- |
| M1 | **Temporary cadence.** In the task form: "Every 3 days until <date>, then back to every 7". The row shows "Outbreak cadence · back to weekly Oct 30"; start and revert each write a History entry | The Betta Tank's 3-day emergency cadence has nothing to revert it; Medisafe-style bounded schedules | Decision |
| M2 | **Pause.** Pause one task or all of a tank's tasks until a date (vacation, blackout, "Thrive paused"). On resume, completion-mode due dates shift forward by the pause length and fixed-mode due dates jump to the next rule date, never a pile of overdue tasks. History notes the start and end of the pause | The fertilizer pause recorded only as a note; Things bulk pause; Sweepy's resume bug | Decision |
| M3 | **Move this one vs change the schedule** for fixed and weekday tasks. Store an `anchor_date`, so moving one occurrence (Saturday's water change to Thursday) leaves later Saturdays alone; completion-mode tasks just move. Ask "Just this one / From now on" only for fixed tasks | Fixed mode derives the next date from `next_due` ([tasks.ts:78-80](../src/lib/tasks.ts)), so editing it today moves the whole series; Things "Make Exception / Update Rule" | Decision |
| M4 | **Courses from algae entries, and courses of any kind.** Reuse the health entry's course link on algae entries, and allow maintenance-kind courses ("Brush hair algae every 2 days, 7 times"). Show "Day 3 of 7 · End early / Extend" | [task-form.ts:207-212](../src/lib/server/task-form.ts); [algae/+page.svelte](../src/routes/(app)/tanks/[id]/algae/+page.svelte) has no course link; brushing logged only as notes | Confirm (extends an existing feature) |
| M5 | **Grace window per task.** For example, ±1 day for water changes: early work inside the window satisfies this occurrence, and inside the late grace the row reads "▲ Due" rather than "✕ Overdue", with no overdue alert. Fixed-mode completions inside the window keep the series on its days | Donetick `completion_window`; soft "due around" consumables | Decision (changes status words) |
| M6 | **Batch Done.** Multi-select on the Tasks page with "Done today", one History entry per task. On the Overview, group "Today" when several tasks are due | Weekly WC, glass and trim are done together ([planted-box](https://planted-box.com/en/blog/startup-maintenance/aquarium-maintenance/)); no bulk action today | Decision |

M1 and M2 directly match the keeper's live outbreak and fall naturally out of a pause and override field. M3 and M5 matter most to EI keepers on fixed weekdays, and they share the `anchor_date` change.

### Larger features that need a product decision

**L1, treatment plans, is the feature that would differentiate Waterline.** A plan is a regimen template (name, length in days, items with start day, end day and cadence, plus the routine task kinds it pauses). Starting it on a tank creates ordinary bounded tasks tagged with a plan run. It pauses matching routines for its dates, shows "Day 3 of 14" with End early, Pause and Extend, and writes History entries at start, pause and end. Creating real tasks keeps the due list, notifications, History and auto-complete unchanged; generating occurrences on the fly would require every query to understand plans. Copying template fields at start means later template edits never rewrite a running plan.

Starter templates would cover the shapes in the evidence above: a 3-day blackout with a water change on day 4 and a short photoperiod reminder afterwards, daily spot treatment, a liquid-carbon escalation, a label-style medication course with "remove carbon" and "replace carbon" steps, a new-tank water-change taper, and vacation prep and return. All are editable, and they come with the sources' caveats. The decisions needed are:

- whether plans belong in v1.x at all
- whether templates ship built-in or are only user-made
- whether a plan can change device settings such as photoperiod, or only remind

**L2: after-event schedules.** A schedule mode of "N days after a water change", with an option of "not on water-change day". It covers EI macros the day after the reset, a filter clean kept off water-change day, and "water change the day after spot treatment". Waterline already writes an events row for every change, so the hook point exists. Two edge cases need explicit rules: back-dated or deleted trigger events, and loops where one task's completion triggers another.

**L3: reading-driven prompts.** When a test crosses a target (ammonia above zero in a cycled tank, nitrate at zero in a dosed tank), offer a suggested action or plan, or end a "paused until ammonia reads 0" condition. Prompts suggest; they never create tasks silently. The sources conflict too often for automatic prescriptions.

**L4: notification shape.** One grouped push per tank per day instead of one per task, an optional time-of-day hint per task (doses before lights-on), and quiet hours. Every send uses a key that includes the effective due date, so snooze and pause suppress notifications without special cases ([notifications.ts:188-200](../src/lib/server/notifications.ts)).

The schema changes these need are all additive:

- columns on `tasks`: `anchor_date`, `window_before`/`window_after`, `paused_until`, `plan_run_id`, and the temporary-cadence fields
- a small `task_overrides` table keyed by occurrence date
- `plan_runs` and `task_suppressions` tables
- updates to `DATA_MODEL.md` to match

Keeping one pure `computeNextDue(task, completions, overrides, suppressions, today)` function makes the new rules testable with property tests, for example "completing never moves a fixed series' later dates" and "pause then resume keeps the remaining count", using fast-check, which is current at 4.10.2 ([npm](https://www.npmjs.com/package/fast-check)).

Three things are **not recommended**:

- **full RRULE storage or two-way CalDAV sync**: date-only tasks don't need it, and completing recurring VTODOs is a known source of duplicate tasks between clients ([tasks.org #1261](https://github.com/tasks/tasks/issues/1261))
- **a backlog of missed occurrences**: nobody wants three overdue "dose micros" after a weekend away
- **silently adaptive intervals**: if a task is consistently done every ~3 days against a 7-day cadence, *offer* "Change to every 3 days?" rather than drifting on its own, so the keeper stays in control

## Conclusion

The core finding is that Waterline's recurrence maths is already right. The friction comes from the edges: how a task is completed, moved and linked to logs. That is why the cheapest fixes give the most relief. With a dated Done, log-driven completion and History for every Done, the keeper's real behaviour would flow into the task system instead of around it, and the "Skipped" entry that records a completed water change would not happen again. Q1 in particular is not a new feature: it brings tasks in line with a rule the project already states.

The bigger insight concerns what the task list is for. For an experienced planted-tank keeper, the steady weekly routine barely needs reminding. The hard part is the two-to-six-week stretch of an outbreak, when cadences tighten, routines pause and a dozen small actions have to happen in order. Right now Waterline shows that stretch only as free-text notes. A temporary cadence and pause would capture it cheaply. Treatment plans would turn it into something no aquarium app I found offers, but only if the product owner decides that Waterline should move from logging what happened to planning a recovery.
