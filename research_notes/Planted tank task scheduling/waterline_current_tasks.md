# Waterline's current task system: code audit and live usage (as of 2026-10-16)

Sources are repo files at `/home/user/waterline` (cited as `path:line`, read at HEAD on 2026-10-16) and the keeper's live data, read only through the Waterline_LIve MCP tools on 2026-10-16. The live data covers 2 tanks: "Betta Tank", a 14 gal planted tank set up on 2026-08-23, and "Shrimp Bowl", a 2.5 gal planted tank. Times are America/Los_Angeles.

## 1. Data model: what a task stores

### Takeaway
A task is a single row holding one "next due" date and one optional snooze. There is no anchor or start date, no stored "last done" and no record of each occurrence. Completions go in a separate `task_completions` table, which exists mainly so that Undo can work. Tasks support three repeat modes (from completion, fixed calendar, set weekdays), plus one-off tasks and an optional end date.

### Cited Findings
- `tasks` columns:
  - `id` and `tank_id`: each task belongs to exactly one tank.
  - `name`.
  - `kind`: one of water_change, test, maintenance, other, dosing, feeding or review.
  - `recurring`: a boolean, default true.
  - `interval_days`: nullable.
  - `schedule_mode`: completion, fixed or weekdays; default `completion`.
  - `weekdays`: a string such as "1,3,5", with 0 meaning Sunday.
  - `next_due`: a YYYY-MM-DD date that becomes null once a one-off task is done.
  - `ends_on`: "a treatment course or any routine with an end: no more occurrences after this day".
  - `snoozed_until`.
  - `equipment_id`.
  - `open_form_on_done`.
  - `product`, `amount` and `amount_unit`, used by dosing and feeding routines.
  - `created_at`.
  - Index on `next_due`.
  - — [schema.ts:316-346](src/lib/server/db/schema.ts)
- `TASK_KINDS = ['water_change','test','maintenance','other','dosing','feeding','review']` — [types.ts:37](src/lib/types.ts)
- `task_completions` columns:
  - `task_id`, `completed_at`.
  - `event_id`: optional link to the History entry.
  - `prev_next_due` and `prev_snoozed_until`: the schedule before this completion ("so Mark done can be undone").
  - `skipped`: added in #71 ("passed over, not done; its eventId is the 'Skipped' note").
  - — [schema.ts:348-360](src/lib/server/db/schema.ts)
- `action_tokens` holds signed single-use email or push links with an action of done or snooze, plus the `due` occurrence they refer to. `email_log` keys such as `reminder:<task>:<due>` and `daily-digest:<date>` stop the same notice going out twice. — [schema.ts:440-465](src/lib/server/db/schema.ts)
- DATA_MODEL.md describes the same tasks/task_completions shape. It notes that review tasks are "every 30/91/182 days or none when off; done on its page, not by Mark done", and that `equipment_id` is "the item's service reminder: the equipment form sets its cadence, and a logged service completes it". — [DATA_MODEL.md:92-105](design_handoff_waterline/DATA_MODEL.md)
- Notification preferences are per user, not per task or tank:
  - `task_reminders`, `overdue_alerts`.
  - `delivery`: individual, daily or weekly.
  - `lead_days`: default 1.
  - `send_time`: default 08:00.
  - Push switches for task reminders and overdue alerts.
  - — [schema.ts:70-90](src/lib/server/db/schema.ts)
- "Maintenance routines" (#92) are a different feature: a named sequence of log steps ("Sunday maintenance: 40% water change, dose 6 mL, trim, test") that the keeper runs by hand with Skip. They have no schedule, due date or link to tasks. — [routines.ts:1-5](src/lib/routines.ts); the [server routines.ts](src/lib/server/routines.ts) file has no reference to tasks, schedules or due dates (grep).

### Inferences
- Only one "current occurrence" exists per task. Nothing can represent two pending occurrences, a missed-occurrence backlog, or a plan of future dated items such as a 14-day treatment calendar.
- "Last done" can only be derived from `task_completions`. No UI reads that table (see §5).

### Gaps
- The drizzle migration files were not read one by one. The schema in `schema.ts` is taken as authoritative.

## 2. Recurrence and how the next due date is computed (early, late, snooze, skip)

### Takeaway
The next due date after Done depends on the mode:
- **From completion** (the default): the day it was done plus the interval. Doing it early therefore pulls every later occurrence earlier.
- **Fixed**: the old due date plus the interval, stepped forward until it is after today.
- **Weekdays**: the next chosen weekday after the later of the due date and the done date.

Snooze can only push the current occurrence later. It can never pull it earlier. Skip jumps to the next occurrence after today. Plain Mark done always uses "now", so there is no "done yesterday" on the Tasks page.

### Cited Findings
- `nextOccurrence` code:
  - Weekdays: `from = nextDue > doneOn ? nextDue : doneOn`, then the next chosen day after `from`, "so doing Wednesday's dose early on Monday doesn't bring Wednesday back".
  - Completion, or no `nextDue`: `addDays(doneOn, intervalDays)`.
  - Fixed: `next = nextDue + interval; while (next <= today) next += interval`.
  - — [tasks.ts:54-81](src/lib/tasks.ts)
- `ends_on` caps the schedule. If the next occurrence would fall after `endsOn`, the result is null and the task closes. — [tasks.ts:62-66](src/lib/tasks.ts)
- One-off tasks (`!recurring`) close on completion, because the next due date becomes null. — [tasks.ts:76](src/lib/tasks.ts)
- Supported shapes, from the form parser:
  - Repeat `every` N days or weeks (at most 3650 days).
  - Repeat on chosen `days` of the week.
  - Repeat `no` (one-off).
  - Ends `never`, `on` a date, or after N `times` (1–365). "Times" is converted to an `endsOn` date by `endsAfterTimes`.
  - — [task-form.ts:18-21, 123-151](src/lib/server/task-form.ts); [tasks.ts:114-122](src/lib/tasks.ts)
- The schedule-mode radio choices are "When I complete it" ("Next due counts from the day it's done") and "Fixed calendar" ("Stays on the same schedule"). Each shows an example such as "Done late on Sep 26 → next due Oct 3". — [TaskForm.svelte:268-273](src/lib/components/TaskForm.svelte); [tasks.ts:207-218](src/lib/tasks.ts)
- New tasks default to `scheduleMode: 'completion'`, every 1 week for a plain task or every 1 day for a routine, with next due today. — [task-form.ts:44-58](src/lib/server/task-form.ts)
- Mark done on the Tasks page calls `completeTask(user.id, taskId, { timeZone })` with no `at`, so the done date is always "now". — [tasks/+page.server.ts:57](src/routes/(app)/tasks/+page.server.ts); [server/tasks.ts:56-57](src/lib/server/tasks.ts)
- The only route to a backdated completion is through a linked log form. A test or event saved with an earlier `takenAt` or `occurredAt` completes the task "at" that time. — [logs.ts:71-73, 270-275](src/lib/server/logs.ts)
- Snooze moves only this occurrence and sets `snoozed_until`. `effectiveDue` uses `snoozedUntil` only when it is later than `nextDue`. — [tasks.ts:48-52](src/lib/tasks.ts); [server/tasks.ts:164-170](src/lib/server/tasks.ts)
- The server rejects any snooze date on or before the due date (or on or before today when overdue): "Pick a date after …". — [tasks/+page.server.ts:68-72](src/routes/(app)/tasks/+page.server.ts)
- Snooze menu options:
  - Overdue or due today: Tomorrow, In 3 days, Next weekend.
  - Not due yet: A day later, 3 days later, A week later. The code comment says "a date before it would do nothing".
  - Pick a date…, then Skip this one ("Next one <date>").
  - — [tasks.ts:186-205](src/lib/tasks.ts); [SnoozeSheet.svelte:116-123](src/lib/components/SnoozeSheet.svelte)
- Skip (#71) moves a repeating task to its next occurrence after today. It writes a History note "Skipped: <name>" and a `skipped` completion so Undo works. It fails with "This task has no next one to skip to" for a one-off task or the last occurrence of a course. — [server/tasks.ts:129-162](src/lib/server/tasks.ts); [tasks.ts:83-97](src/lib/tasks.ts)
- Undo restores `prevNextDue` and `prevSnoozedUntil`, and only the latest completion can be undone ("Only the latest completion can be undone"). — [server/tasks.ts:86-127](src/lib/server/tasks.ts)
- Editing a task: if "Next due" is left as shown (the snoozed date), the schedule and snooze stay. A new date replaces both. — [server/tasks.ts:186-195](src/lib/server/tasks.ts)
- Changelog: "Snooze any task: … one that isn't due yet moves back from its due date." — [CHANGELOG.md:209](CHANGELOG.md)
- Changelog: "Skip a task: … moves a repeating task straight to its next date without marking it done, notes 'Skipped' in History." — [CHANGELOG.md:135](CHANGELOG.md)

### Inferences
- **Done early in "completion" mode moves the whole schedule earlier.** Take a weekly water change due Saturday that is done Thursday: the next one is due the following Thursday. To keep Saturdays, the keeper must pick "Fixed calendar" or "On days" when creating the task, or edit Next due afterwards.
- **Done late in completion mode drifts.** Due Saturday, done Monday: the next one is the following Monday.
- **Done early in fixed mode leaves a long gap.** A 7-day fixed task due Saturday and done Thursday gives next Saturday, 9 days after the work was done.
- **Done late in fixed mode leaves a short gap.** Due Saturday, done the next Wednesday: the code steps Saturday+7 = next Saturday, which is after today, so it is due again 3 days after the work. Fixed mode does not skip an occurrence that falls very soon after a late completion.
- **Nothing can pull a task earlier except editing it.** Snooze only goes later. "I'll do it today instead of Saturday, but it isn't done yet" has no action. The keeper can only Done early (which records it as done now) or edit the Next due date.
- **Plain tasks have no "done yesterday".** Forgetting to tap Done means either tapping it today, which shifts a completion-mode schedule by a day, or going through a backdated log form, which only exists for water-change and test tasks.
- Snooze is a single slot. Snoozing twice overwrites. A snooze survives an edit that leaves Next due unchanged.
- **Recurrence shapes that are missing:**
  - every N days on a specific weekday (e.g. "every other Sunday" works only as fixed 14 days),
  - day of month,
  - several times per day,
  - "daily for 14 days, then every 3 days" (phased regimens),
  - a start date in the future that differs from the first due date,
  - "pause until X" or "pause until condition".

### Gaps
- I did not run the unit tests in `src/lib/tasks.test.ts` to confirm the edge cases. The behaviour above comes from reading the code.

## 3. Actions and UI: Tasks page, Overview (dashboard), ⌘K, Quick add, Remind me

### Takeaway
- **Tasks page:** lists every open task across all tanks in three sections (Overdue / Due soon / Later, where "soon" means within 3 days), with a tank filter. Each row has Mark done (or Done early) and Snooze ▾ (which also holds Pick a date and Skip). Clicking a row opens a side edit pane on desktop.
- **Dashboard:** "Due" shows only the first 3 open tasks; overdue tasks also appear in "Needs attention" with Done.
- **⌘K** only links to the Tasks page. Quick add does not create tasks; it only shows the water-change due state. There is no bulk action.

### Cited Findings
- `listTasks` returns open tasks (those with a `next_due`) across the user's non-archived tanks. Each gets `due = effectiveDue`, sorted by due date and then name. — [server/tasks.ts:10-27](src/lib/server/tasks.ts)
- `dueInfo` sections:
  - `days < 0`: overdue ("✕ Overdue N days").
  - `0`: "▲ Due today".
  - `≤ 3` (`DUE_SOON_DAYS = 3`): "▲ Due in N days · <date>".
  - Otherwise: later, shown as a plain date.
  - — [tasks.ts:132-159](src/lib/tasks.ts)
- The Tasks page renders the sections "✕ Overdue · n", "▲ Due soon · n" and "Later · n". Phones fold the Later section behind "Show all". There is a tank filter row and a New task button. — [tasks/+page.svelte:26-33, 74-76, 86-119](src/routes/(app)/tasks/+page.svelte)
- On phones Snooze shows only on overdue rows ("rows keep to one action"). — [tasks/+page.svelte:382-383](src/routes/(app)/tasks/+page.svelte)
- The desktop edit pane opens via `?edit=<id>` and defaults to the first task in the list. — [tasks/+page.server.ts:17-26](src/routes/(app)/tasks/+page.server.ts)
- Tasks page actions: `done`, `snooze`, `skip` and `undo`.
  - Done on the review task redirects to the review page.
  - Done on a water_change or test task with `openFormOnDone` redirects to the log form with `?task=`.
  - Otherwise Done completes the task and flashes "✓ <name> done · next <date>" with Undo.
  - — [tasks/+page.server.ts:38-95](src/routes/(app)/tasks/+page.server.ts)
- Edit and delete happen on the task form (`/tasks/[id]`, `/tasks/new`). Saving flashes "✓ Task saved" or "✓ <name> added"; deleting flashes "<name> deleted". — [task-form.ts:214-231](src/lib/server/task-form.ts)
- `TaskList` (the dashboard's Due list):
  - The "when" text reads "✕ N days over", "▲ Today", "Tomorrow", "In N days" or a date, followed by the cadence.
  - Only the most urgent row gets the primary button. A task that isn't due yet gets a muted "Done early" button.
  - — [TaskList.svelte:33-65](src/lib/components/TaskList.svelte)
- The dashboard shows `dueTasks.slice(0, 3)`, with links to "Remind me" and "All tasks ›". Overdue tasks are also listed in Needs attention with Done; when the water change has its own row there, it is not repeated. — [(app)/+page.svelte:95-106, 258-270](src/routes/(app)/+page.svelte)
- ⌘K palette entries: "Tasks · Every tank" (navigate) and "Alerts · Out-of-range readings and overdue tasks". There is no action to create, complete or snooze a task. — [CommandPalette.svelte:100-101](src/lib/components/CommandPalette.svelte)
- Quick add only receives `wcDue` and shows "✕ N days overdue" under the Water change option. It has no task creation. — [QuickAdd.svelte:30-39, 203-205](src/lib/components/QuickAdd.svelte)
- "Remind me" creates a one-off task: Tomorrow / In 3 days / Next week / In 2 weeks / On a date. — [tasks.ts:220-234](src/lib/tasks.ts); [remind/+page.server.ts](src/routes/(app)/tanks/[id]/remind/+page.server.ts)
- A health entry can start a treatment course via `courseHref`: a dosing routine, every 2 days, ending today+10. — [task-form.ts:207-212](src/lib/server/task-form.ts); [health/+page.server.ts:46](src/routes/(app)/tanks/[id]/health/+page.server.ts)
- A course shows "N doses left · ends <date>". When the last occurrence is done, History gets a note "Finished: <product> course". — [tasks.ts:124-130](src/lib/tasks.ts); [server/tasks.ts:58-64](src/lib/server/tasks.ts)
- Tasks are also published as an ICS calendar feed ("each on the day it's due, with overdue ones on today"). — [CHANGELOG.md:327](CHANGELOG.md)
- Algae logging (#86) records the kind, amount and where, with photos. Nothing connects it to tasks. (The algae route files contain no task or course references; grep.) — [algae/+page.svelte:1-3](src/routes/(app)/tanks/[id]/algae/+page.svelte)

### Inferences
- With many recurring tasks, the dashboard shows only 3. A tank with daily dosing, a water change and several maintenance items will hide most of them behind "All tasks ›".
- There is no bulk "done" for several tasks, no grouping by day ("this Saturday's maintenance"), and no grouping by kind. Maintenance routines group *log steps*, but they have no schedule and don't complete tasks.
- A treatment course can only be started from a plant or livestock health entry. Algae entries have no "start a treatment course" link (inferred from the absence of course references in the algae route).
- Courses are built around dosing routines. There is no built-in shape for a multi-day non-dosing regimen such as "blackout for 3 days" (lights off, no dose, then a water change) or "spot treat daily for 14 days". A plain task can be given an end date, which approximates the second.

### Gaps
- I did not visually check the dashboard or Tasks page at 390/1280 px. The descriptions come from code and comments.

## 4. Linkage: what completing writes, and whether logs complete tasks

### Takeaway
Plain tasks (maintenance, other, and water_change or test completed directly) write **no History entry** when marked done. They write only a `task_completions` row. The exceptions:
- Dosing and feeding routines log their dose or feeding.
- Skip writes a "Skipped" note.
- A finished course writes a "Finished" note.
- The review writes its own entry.

Water-change and test logs can complete the matching task through an "Also mark the reminder … done" checkbox. That box is ticked automatically only when the task is due or overdue, and it is only offered when the task is due within 3 days.

### Cited Findings
- `completeTask`:
  - Inserts an events row only for a routine (`category: dosing | feeding`, data including `task_id`) or a finished course (note "Finished: …").
  - Otherwise inserts only `task_completions`, with an optional `eventId` passed in by the log form.
  - — [server/tasks.ts:47-84](src/lib/server/tasks.ts)
- Project rule: "Every write that changes tank state also writes an `events` row, so History stays complete." — [CLAUDE.md](CLAUDE.md)
- `completableTask` (log forms):
  - Uses the task requested with `?task=`; otherwise `taskOfKind(kind)`, but only when that task is not in the "later" section (it must be due within 3 days).
  - Label: "Also mark the reminder “<name>” done".
  - Status line: "N days overdue" / "Due today" / "Not due until <date>", plus "next <date>" or "next would be <date>".
  - `checked: fromRequest || d.days <= 0`.
  - The "next" preview is computed from *today*, not from the entry's date.
  - — [log-forms.ts:100-133](src/lib/server/log-forms.ts)
- Changelog: "It's ticked by itself when the reminder is due or you came from Mark done, and left for you to tick when you're doing it early." — [CHANGELOG.md:174](CHANGELOG.md)
- `taskOfKind` returns the *first* open task of that kind for the tank, so only one water-change task can be auto-linked. — [server/tasks.ts:172-176](src/lib/server/tasks.ts)
- Logging an equipment service completes that equipment's maintenance task. — [specs.ts:290-310](src/lib/server/specs.ts); [CHANGELOG.md:222](CHANGELOG.md)
- Logging a dose or feeding by hand does **not** complete a dosing task. Only `logs.ts` (tests and events, when `completeTaskId` is set), `review.ts` and `specs.ts` call `completeTask`. — grep of `completeTask(` across `src/`
- A task's completion history (`taskCompletions`) is read only in `server/tasks.ts`, `notifications.ts` (the overdue push's "last done" text), `export.ts` and `seed.ts`. No page shows a task's past completions. — grep of `taskCompletions`
- The assistant's `get_tasks` columns are tank, task, kind, due, days_until_due, status, recurring, every_days and snoozed_until. They exclude schedule mode, ends_on, weekdays and last done. — [table-tools.ts:176-218](src/lib/server/assistant/table-tools.ts)

### Inferences
- **Water changes done early are not auto-linked.** If a 3-day water change is due tomorrow and the keeper changes water today, the reminder box is shown but unticked. If they don't tick it, the task stays due tomorrow and they must Skip it or Done it again.
- **A water change done ≥4 days early is not offered at all**, because `completableTask` drops tasks in the "later" section.
- **Two water changes on one day** (as the keeper did on 10/13, see §7) complete the task twice. In completion mode the second is harmless; in fixed mode the code steps the date forward again.
- **Mark done on a plain task leaves no History trace.** A "Clean canister" or "Brush hair algae" task completed with Done never appears in History, on Charts' marks or in the summary's care log, unless the keeper also logs a Maintenance entry. The canister task has an `equipment_id` link path through Log service, but Done on the Tasks page doesn't write the service entry. (Inference: Done takes the plain `completeTask` path.)

### Gaps
- I did not check whether the Maintenance event form offers "Also mark the reminder done" for maintenance-kind tasks. `completableTask` accepts `'maintenance'`, but I didn't trace which form passes it.

## 5. Notifications and reminders for tasks

### Takeaway
The scheduler runs every 5 minutes. Once each day after the user's `send_time`, it sends per-task reminders `lead_days` ahead (routines only on the day) and overdue alerts, by email (individually, or in a daily or weekly digest) and/or push (web push or ntfy) with Mark done and Snooze actions. There are no quiet hours, no per-task lead time and no time-of-day for a task: a "due" date has no time.

### Cited Findings
- The scheduler calls `runNotifications()` each run when scheduled emails are on. — [scheduler.ts:19-40](src/lib/server/scheduler.ts)
- Nothing is sent before the user's local `sendTime` (`if (!force && local.time < prefs.sendTime) return`). — [notifications.ts:167-170](src/lib/server/notifications.ts)
- `leadFor = isRoutine(kind) ? 0 : prefs.leadDays`. Routines remind only on the day. — [notifications.ts:186](src/lib/server/notifications.ts)
- Push goes "each task on its own, the same days as the emails", deduplicated by the key `reminder|overdue:<task>:<due>`. — [notifications.ts:188-200](src/lib/server/notifications.ts)
- The overdue push includes the last non-skipped completion ("lastDone"). — [notifications.ts:106-113, 140-155](src/lib/server/notifications.ts)
- The digest groups tasks by tank, with a horizon of 7 days (weekly) or `leadDays` (daily); routines appear only on their due day. — [notifications.ts:238-290](src/lib/server/notifications.ts)
- Shared tanks: reminders go to everyone who can log, or to the owner only. — [notifications.ts:173-181](src/lib/server/notifications.ts); [redesign README:220](design_handoff_waterline_redesign/README.md)
- Notification settings are per user: delivery individual/daily/weekly, lead_days, send_time, and separate email and push switches for reminders and overdue alerts. — [schema.ts:70-90](src/lib/server/db/schema.ts)

### Inferences
- An overdue task re-alerts under a new key only when its due date changes, so a long-overdue task gets one overdue alert per due date rather than daily nagging. This is inferred from the key using `t.due`; I did not verify whether a new "overdue" day re-sends.
- A treatment regimen with several actions on the same day (e.g. "lights off" and "dose") produces one push per task. Daily treatment tasks remind at `send_time` only; the keeper can't time one at the lights-off hour.

### Gaps
- Quiet hours: none found in the schema or in `notifications.ts`.

## 6. What the design handoff says about tasks

### Takeaway
The redesign specifies:
- the app-wide Tasks screen (Overdue / Due soon / Later, Done and Snooze ▾, a side edit pane),
- the dashboard "Due" column and overdue tasks in Needs attention,
- an "N overdue" tag on the sidebar Tasks link,
- Snooze and skip as undoable actions.

The design's snooze menu differs from what was built. It says nothing about treatment regimens, pause, or done-on-another-day.

### Cited Findings
- §10 Tasks: "Sections Overdue / Due soon / Later, across all tanks. Each row has its name, tank and cadence, the when (✕/▲), **Done**, and **Snooze ▾** (on tasks due within 1 day)." — [redesign README:176-177](design_handoff_waterline_redesign/README.md)
- "Snooze menu (260px): Later today (Tonight, 6 PM), Tomorrow, In 2 days, This weekend, Next week (each shows its date), and Pick a date (date input, min tomorrow)." — [redesign README:178](design_handoff_waterline_redesign/README.md)
- "Snooze and skip both move the task and are undoable. Selecting a task opens a side pane for editing." — [redesign README:180-181](design_handoff_waterline_redesign/README.md)
- Undo toast: "Every destructive action (… snooze, skip …) shows '… · Undo'." — [redesign README:104](design_handoff_waterline_redesign/README.md)
- Overview: "Overdue tasks also appear here [Needs attention], with **Done**" and "**Due** (column 3): the next tasks, with Mark done." — [redesign README:115-116](design_handoff_waterline_redesign/README.md)
- Sidebar: "Tasks (with an 'N overdue' accent tag only when > 0)". Tank cards have "a next-task tag". — [redesign README:71, 111](design_handoff_waterline_redesign/README.md)
- Water change dialog: "If a water-change task is overdue, the dialog says 'Saving this completes the overdue task …'." — [redesign README:186](design_handoff_waterline_redesign/README.md)
- Setup: "Reminders: per-task cadence." — [redesign README:168](design_handoff_waterline_redesign/README.md)
- The prototype's state includes "Task `snoozedUntil` / skip". — [redesign README:315](design_handoff_waterline_redesign/README.md)
- Screenshots for tasks: `desktop-02-overview.png`, `desktop-14-tasks-snooze.png`, `phone-01-overview.png`, `phone-05-tasks-snooze.png`. — [screenshots/](design_handoff_waterline_redesign/screenshots)
- The implemented snooze differs from the design:
  - Built: Tomorrow / In 3 days / Next weekend (or A day / 3 days / A week later when not due), plus Pick a date and Skip this one.
  - Missing: "Later today" and "In 2 days".
  - Snooze is on every task (desktop), not only "due within 1 day".
  - — [tasks.ts:186-205](src/lib/tasks.ts); [CHANGELOG.md:209](CHANGELOG.md)

### Inferences
- The designs cover only the single-occurrence, cadence-based model. Any regimen, pause or reschedule-earlier feature is outside them and, per CLAUDE.md, needs product-owner sign-off ("Ask the product owner before inventing features not in the designs").

### Gaps
- I did not open the `.dc.html` prototypes' data class to read the `tasks` object shapes, nor view the screenshots.

## 7. Live usage: how the keeper actually uses tasks (Waterline_LIve, 2026-10-16)

### Takeaway
The keeper has only 6 open tasks across 2 tanks, all simple cadences. Their real care in the Betta Tank is far denser and more reactive:
- water changes every 2–3 days, sometimes twice a day,
- ad hoc fertilizer doses several times a day,
- a temporary daily Prime regimen "while ammonia persists",
- hair-algae brushing "every other day",
- a fertilizer pause, a light swap.

None of that is captured by tasks. The task names have drifted from practice: "Water change 25%" against 36–50% actual, and "3 mL Thrive" against pumps logged by hand.

### Cited Findings
- Open tasks today — [get_tasks](mcp://Waterline_LIve/get_tasks):

  | Tank | Task | Kind | Cadence | Due |
  | --- | --- | --- | --- | --- |
  | Betta Tank | "3 mL Thrive" | other | every 2 days | today |
  | Betta Tank | "Water change 25%" | water_change | every 3 days | today |
  | Betta Tank | "Clean UNS Delta 60 canister" | maintenance | every 28 days | 2026-10-24 |
  | Betta Tank | "Review tank setup" | review | every 91 days | 2027-01-02 |
  | Shrimp Bowl | "Water change 20%" | water_change | every 7 days | today |
  | Shrimp Bowl | "Review tank setup" | review | every 91 days | 2027-01-02 |

  None is snoozed.
- Betta Tank water-change dates: 9/9, 9/17, 9/22, 9/25, 9/30, 10/3, 10/6, 10/9, 10/11, and 10/13 twice (16:38 and 19:42, "Changed again due to high ammonia."). The gaps run 8, 5, 3, 5, 3, 3, 3, 2, 2, 0 days. Sizes are 36–50%, never 25%. — [get_water_changes](mcp://Waterline_LIve/get_water_changes)
- History has one "Skipped: Water change 25%" on 2026-10-04 07:40. The day before, 2026-10-03 13:22, a 36% water change had been logged. — [get_history Betta Tank](mcp://Waterline_LIve/get_history)
- Thrive dosing is logged by hand as dosing entries in "pumps", reactive to nitrate readings of 0:
  - 2026-10-03: four 1-pump doses in one afternoon, with notes such as "Was still at 0 nitrate so adding another one".
  - 2026-10-04: 3 pumps.
  - 2026-10-05: 2 pumps.
  - 2026-10-06: 2 pumps twice.
  - Nothing appears in History for the "3 mL Thrive" task's completions.
  - — [get_history Betta Tank](mcp://Waterline_LIve/get_history)
- Temporary regimens found only in notes:
  - 9/21: "Started daily dosing [Prime] while ammonia persists".
  - 9/21: "Paused Thrive S until ammonia reads 0".
  - 9/21: "Algae regrowing fast · Despite brushing every other day".
  - 9/26: "Before daily prime dose for leeching aquasoil".
  - 9/22 and 9/25 Maintenance: "Brushed hair algae".
  - 10/11: "Removed the wood as I think it was the cause of the hair algae".
  - 10/13: light replaced and intensity 36% → 45%, "Took out a lot more hair algae with a toothbrush".
  - — [get_history Betta Tank](mcp://Waterline_LIve/get_history); [get_tank_summary Betta Tank](mcp://Waterline_LIve/get_tank_summary)
- Water tests were near daily in October (21 tests in 30 days) with no test task. — [get_tank_summary Betta Tank](mcp://Waterline_LIve/get_tank_summary)
- The Betta Tank summary's "Maintenance schedule" lists the 4 tasks with cadence and due date only. — [get_tank_summary Betta Tank](mcp://Waterline_LIve/get_tank_summary)
- Shrimp Bowl water changes were 10/2 (30%) and 10/9 (20%), on its weekly cadence. The next is due 10/16 (today). — [get_history Shrimp Bowl](mcp://Waterline_LIve/get_history)

### Inferences
- **The 10/4 skip looks like the early water-change friction in action.** A 36% water change was logged on 10/3, but the reminder was still due the next morning. That fits a 10/3 log that didn't tick "Also mark the reminder done", which is unticked by default when the task isn't due yet. The keeper then cleared it with Skip, which writes "Skipped" in History even though the water was in fact changed. This is an inference; I can't see the task's due date on 10/3.
- **"3 mL Thrive" was created as a plain task, kind "other", not as a dosing routine.** So Done logs nothing, while the keeper doses by hand in pumps at varying amounts. A fixed-amount, fixed-cadence routine doesn't fit responsive dosing ("dose when nitrate reads 0", or "pause until ammonia is 0").
- **The 3-day water-change cadence appears to be an emergency regimen** (ammonia and hair algae since mid-September), not a long-term schedule. Nothing in the app marks it as temporary or reverts it to weekly afterwards. The keeper will have to edit the interval by hand later.
- **Algae treatment is the main ad hoc maintenance.** Brushing every other day, spot removal, removing the wood, raising the light and extra water changes all appear only as Maintenance, Observation or Note entries.
- **Data-quality signals of friction:**
  - Task names hold the amount ("25%", "3 mL"), which then contradicts what is logged.
  - The keeper writes their schedule into notes ("normally no dosing on WC day", "front-loaded before trip").
- The trip (9/9–9/14, "Before 5-day trip") had no snooze recorded (no tasks were snoozed). The tasks likely didn't exist yet, since the tank was re-created 2026-09-26, per the "Tank created · Freshwater" note.

### Gaps
- The MCP tools don't expose task completion history, schedule mode, or when a task was created or edited. So I couldn't measure early or late completion rates directly, or confirm whether the water-change task uses "completion" or "fixed" mode. The 10/16 due date (10/13 + 3) is consistent with completion mode and a linked 10/13 log.
- Only 2 tanks and about 2 months of data, so these patterns come from a single keeper.

## 8. Friction points for a planted-tank keeper (synthesis)

### Takeaway
The current model is "one cadence, one next date per task". It works for steady weekly upkeep. It fits poorly with:
- doing maintenance on a different day than planned,
- temporary multi-step treatment regimens,
- reactive dosing,
- many overlapping recurring tasks.

### Cited Findings
(Each point is grounded in the code citations in §§2–5 and the live data in §7.)
- Done early in completion mode shifts the whole series earlier. There is no "keep my Saturday", unless the task was made Fixed or On days up front. — [tasks.ts:77](src/lib/tasks.ts)
- Snooze can't pull a task earlier. The server rejects dates on or before the due date. — [tasks/+page.server.ts:70-72](src/routes/(app)/tasks/+page.server.ts)
- Mark done has no "done on <date>" for plain tasks. — [tasks/+page.server.ts:57](src/routes/(app)/tasks/+page.server.ts)
- An early water-change log isn't auto-linked: the box is unchecked when not due, and the task isn't offered at all when due in more than 3 days. — [log-forms.ts:116-132](src/lib/server/log-forms.ts)
- A plain task's Done writes nothing to History. — [server/tasks.ts:60-80](src/lib/server/tasks.ts)
- A hand-logged dose doesn't complete a dosing routine. — grep of `completeTask(`
- Courses (an end date or N times) exist, but only as a single cadence. They start only from health entries (every 2 days, for 10 days), not from algae entries. — [task-form.ts:207-212](src/lib/server/task-form.ts)
- Maintenance routines (step sequences) have no schedule and don't complete tasks. — [routines.ts](src/lib/routines.ts)
- The dashboard shows only 3 due tasks; there is no bulk complete and no grouping by day. — [(app)/+page.svelte:262](src/routes/(app)/+page.svelte)
- Reminders are per user, once a day at `send_time`, with no per-task time or quiet hours. — [notifications.ts:167-186](src/lib/server/notifications.ts)

### Inferences
Concrete scenarios:
1. **Early water change.** "Water change 25%" runs every 3 days and is due Friday. The keeper does it Thursday from Log water change and doesn't tick the box. The task stays due Friday. They then Skip, which writes "Skipped" although the water was changed, or tap Done on Friday, which moves the next one to Monday instead of Sunday. If they do tick the box, next due = Thursday + 3 = Sunday (completion mode).
2. **Weekly Saturday maintenance done on Thursday because of a weekend away.** Completion mode moves every future Saturday to Thursday. Fixed mode keeps Saturday, giving a 9-day gap. Snooze can't express "this week only, Thursday".
3. **Algae regimen, "spot-treat daily for 14 days".** This needs a new task: every 1 day, Ends after 14 times. It isn't linked to the algae entry. Each Done leaves no History trace unless the task is a dosing routine. After 14 days it closes with a "Finished" note only if it is a recurring task with ends_on.
4. **"3-day blackout".**
   - Lights off, no fertilizer, and a water change at the end: there's no regimen object.
   - The keeper must create a one-off "Lights back on" reminder and a separate water-change task.
   - The light's equipment schedule isn't paused.
   - Regular dosing tasks aren't paused; they must be skipped or snoozed one by one.
   - No "pause all of this tank's tasks until …".
5. **Extra water changes during an outbreak.** Changing the cadence of "Water change" from 7 to 3 days is a manual edit, and so is reverting it. Nothing records that it was temporary or reminds the keeper to revert. Two water changes in a day both complete the same task.
6. **Many recurring tasks.**
   - Each one notifies separately (push), and the dashboard shows 3.
   - The sections are only Overdue / Due soon (≤3 days) / Later.
   - There is no view of "everything for this Sunday" and no bulk Done.
   - Maintenance routines bundle steps but are not scheduled.
7. **Reactive dosing.** "Dose when nitrate reads 0", or "pause Thrive until ammonia reads 0": tasks can't be conditional on readings, and pausing isn't supported except via a far snooze or by deleting the task.

### Gaps
- Product-owner intent about regimens, pauses or a "done on date" picker isn't documented anywhere I found. No open GitHub issues about tasks: of the 100 most recent issues, the task-related ones (#69, #71, #72, #86, #92, #135, #139) are all closed.
