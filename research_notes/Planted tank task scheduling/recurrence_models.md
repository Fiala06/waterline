# Recurrence models for flexible recurring tasks (SvelteKit + SQLite/Drizzle, date-only, 5-minute scheduler)

Research method note: in this session, general web fetching (WebFetch, curl to rfc-editor.org, todoist.com and others) was blocked by the egress proxy. Findings come from (a) web search result summaries, (b) **primary source code** of open-source task/chore apps cloned via git (Grocy @ `41206cb`, 2026-09-16; Donetick @ `f12c056`, 2026-10-13; tasks.org @ `2017922`, 2026-10-16), (c) the npm registry (package metadata + READMEs), and (d) Waterline's own current code for context. Claims taken from search summaries rather than a page I read in full are marked "(search summary)". Where I relied on training knowledge that I could not verify this session, it is in Gaps, not Findings.

Waterline's current state (context for the report writer): `tasks` already has `schedule_mode` ∈ {`completion`, `fixed`, `weekdays`}, `interval_days`, `weekdays` ("1,3,5"), materialised `next_due` (YYYY-MM-DD), `ends_on` (treatment courses), `snoozed_until`, and `task_completions` stores `completed_at`, `event_id`, `skipped`, plus `prev_next_due` / `prev_snoozed_until` for undo — [schema.ts](/home/user/waterline/src/lib/server/db/schema.ts) lines 316–373. `src/lib/tasks.ts` implements `nextDueAfterCompletion` (fixed mode: "step the current due date forward by the interval until it is after today"), `skipTo`, `occurrencesUntil`, `endsAfterTimes`, `DUE_SOON_DAYS = 3` — [tasks.ts](/home/user/waterline/src/lib/tasks.ts). Digests are de-duplicated by keys like `daily-digest:${today}` computed in the user's `timeZone` — [notifications.ts](/home/user/waterline/src/lib/server/notifications.ts). So Waterline is already on the "materialised next_due + completion log" model; the questions below are mostly about extending it (overrides, windows, linked tasks, plans, auto-completion).

## Fixed-schedule vs completion-relative ("floating") recurrence: definitions, how apps compute next due, edge cases

### Takeaway
Every app studied offers exactly two bases — "from the scheduled date" and "from the completion date" — but they differ sharply on catch-up: Todoist and Waterline jump a missed fixed series to the next *future* date, while Donetick and tasks.org advance a fixed series by exactly one step (so a long-overdue task can stay overdue after completion), and Grocy is effectively completion-based for every period type. Missed occurrences are always collapsed into one open item; no app studied queues a backlog of missed instances.

### Cited Findings
- Todoist: `every` computes the next date from the schedule; `every!` from the completion date, e.g. "every! 2 months" = "every 2 months from the day on which the task is completed"; the custom scheduler lets you choose "repeats based on the scheduled date (every) or the completed date (every!)" (search summary) — [Todoist help: Introduction to recurring dates](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV)
- Todoist: when an overdue recurring task is completed, "Todoist will schedule the next occurrence on the next future recurring date"; example given: a task every 3 months from 15 Jan 2023 completed 19 Sep 2023 moves to 15 Oct 2023 because 15 Apr and 15 Jul have passed (search summary; the summary attributed this example to `every!`, but the arithmetic matches the fixed `every` behaviour — treat attribution as uncertain) — [Todoist help](https://www.todoist.com/help/articles/introduction-to-recurring-dates-YUYVJJAV)
- Todoist: a single instance can be rescheduled without breaking the recurrence via the task menu (third-party blog, search summary) — [tomtalks.blog](https://tomtalks.blog/changing-due-date-todoist-reoccurring-task-without-breaking-reoccurrence/)
- Things 3.23 (Aug 2026): two patterns, "after completion" and "regular". Rescheduling an after-completion to-do just moves it with no prompt; for regular repeats the app prompts "Make Exception" or "Update Rule". Repeating to-dos got a normal checkbox so they can be completed early, and the next copy is scheduled "based on its existing rule". If finished late, "the interval is kept" (weekly task completed late on Saturday → next copy the following Saturday) (search summary) — [Cultured Code blog: Repeating To-Dos, Refined](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/); [MacRumors](https://macrumors.com/2026/08/19/things-3-23-brings-long-requested-overhaul-of-repeating-to-dos)
- TickTick: recurring tasks repeat from due date or completion date; completion-based is chosen via the "N days/weeks/months" setting plus "Repeat from completion date" — [TickTick blog (2013)](https://blog.ticktick.com/2013/10/29/repeat-your-tasks-upon-completion-date/). TickTick's overdue/catch-up behaviour was not documented in anything found.
- Toodledo's founder: whether overdue occurrences are skipped is controlled by "repeat from due-date" vs "repeat from completion date"; choose due-date to keep overdue occurrences in sequence (search summary) — [Toodledo forum](https://www.toodledo.com/forums/2/12334/-59898/read.html)
- tasks.org (open source, Android/desktop): each task row holds an RRULE string and a `repeatFrom` enum (`DUE_DATE` / `COMPLETION_DATE`). On completion the *same row* is mutated: completion date cleared, due date moved, `COUNT` decremented (`if (count == 1) return` ends the series), reminders reset. From-completion: start = completion date (keeping the original due time-of-day); from-due-date: start = the old due date and `recur.nextOccurrence(original)` — a single step, no "skip to after today" loop. Undo increments COUNT back and restores the old due date — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- tasks.org special-cases weekly-with-BYDAY + from-completion (`handleWeeklyRepeatAfterComplete`: walk forward to the next listed weekday after completion) and MONTHLY without BYDAY (`handleMonthlyRepeat`, month-end clamping) — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- Donetick: `chores` stores `frequency_type` (once, daily, weekly, monthly, yearly, adaptive, interval, days_of_the_week, day_of_the_month, trigger, no_repeat, always), `frequency`, JSON `frequency_meta_v2` (days, months, unit, time, timezone, weekPattern, occurrences e.g. 1st/3rd/last weekday), a materialised indexed `next_due_date`, and `is_rolling` — [model.go](https://github.com/donetick/donetick/blob/develop/internal/chore/model/model.go)
- Donetick next-due: `baseDate = NextDueDate` (fixed) or `completedDate` when `IsRolling`; then adds exactly one period (`AddDate(0,0,1)`, `+7`, `+1 month`, etc.) — no loop to bring the date past "now". For rolling day-of-month chores completed *before* the due date, the base is bumped to one second after the old due date so completing early doesn't reschedule back onto the same date (code comment: "if task due every 15 of jan, and you completed it on the 13 of jan…") — [scheduler.go](https://github.com/donetick/donetick/blob/develop/internal/chore/scheduler.go)
- Donetick evaluates schedules in the chore's own time zone because "doing the arithmetic in UTC pins every recurrence to a fixed UTC hour, so the local time of a chore shifts by an hour on daylight saving transitions"; day-of-month > month length is clamped to the last day — [scheduler.go](https://github.com/donetick/donetick/blob/develop/internal/chore/scheduler.go)
- Donetick "adaptive" type: next due = completion + average delay over history — [scheduler.go](https://github.com/donetick/donetick/blob/develop/internal/chore/scheduler.go)
- Grocy: next due is a SQL **view** (`chores_current`) computed from `MAX(chores_log.tracked_time)` (excluding undone) plus the period: `daily` = last execution + N days at the start_date's time of day; `weekly` = the earliest listed weekday after last execution + (N−1) weeks; `monthly` = start of last execution's month + N months + (period_days−1); `yearly`; `adaptive` = last + average frequency hours; `manually` = NULL. Before the first execution the due date is `start_date`. A `rescheduled_date` column overrides the computed date — [Grocy migrations/0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- Grocy `rollover` flag: if set and the due time has passed, the displayed due date becomes *today* (so an overdue chore rolls forward daily rather than showing as N days overdue); `track_date_only` makes due = that date at 23:59:59 — [Grocy migrations/0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- Grocy history: v3.2.0 removed the "Dynamic regular" period type ("the same as Daily", converted on migration) and added "Adaptive" (based on past average execution frequency); v3.3.0 changed Daily to "schedule at the same time of day, based on the start date, every n days", where the old behaviour was "n days after the last execution" (search summary of release notes) — [docker-grocy v3.2.0 notes](https://newreleases.io/project/github/linuxserver/docker-grocy/release/v3.2.0-ls142); [v3.3.0 notes](https://newreleases.io/project/github/linuxserver/docker-grocy/release/v3.3.0-ls147). Note: the current view (0185.sql) still adds the interval to `MAX(tracked_time)` and only takes the *time of day* from start_date, i.e. the date is still completion-relative.
- Other apps (user reports, search summary): Quire completing an overdue recurring task "assumes the due date of the task was when it was completed and skips to the next occurrence"; Asana weekly tasks skip past dates to the next upcoming one — [Quire feedback #3500](https://quire.io/w/Quire_Feedback/3500); [Asana forum](https://forum.asana.com/t/repeating-task-go-to-date-when-completed-and-overdue/146982)

### Inferences
- Define precisely (for the report):
  - **Fixed / calendar-anchored**: occurrences are a pure function of (anchor date, rule). Completion only marks an occurrence done; it never moves the series. Completing *early* satisfies the current occurrence; next due = first rule date strictly after the satisfied occurrence (not after today). Completing *late* must choose a catch-up policy: (a) **collapse/skip-to-future** (Todoist, Asana, Waterline today) — next due = first rule date > today; (b) **one step** (Donetick, tasks.org) — next due = next rule date after the satisfied occurrence, possibly still in the past; (c) **backlog** — every missed occurrence remains open (no task app studied does this; it suits medication-style logs, not chores).
  - **Completion-relative / floating**: next due = completion date + interval. Early completion pulls the series earlier; late completion pushes it later; missed occurrences cannot accumulate by construction.
  - **Weekday-set from completion** (Grocy weekly, tasks.org weekly+BYDAY+from-completion, Waterline `weekdays`): next due = first listed weekday strictly after completion date.
- For an aquarium log, collapse-to-future (a) is the right default for fixed tasks: nobody wants three overdue "dose micros" items after a holiday. Policy (b) is a footgun for anything with a short interval. Waterline's existing loop `while (daysBetween(today, next) <= 0) next += interval` already implements (a).
- Early-completion edge case worth a unit test: fixed weekly task due Sat, done Thu. Correct: next due = following Sat (rule date after the *occurrence*), not Thu+7. Donetick's "second after due date" bump is the same fix for its rolling day-of-month mode.
- Count-limited series (tasks.org decrements COUNT in place) is fragile under undo/redo and edits; storing `ends_on` (date) or `remaining` computed from the completion log is simpler. Waterline's `ends_on` + `endsAfterTimes()` (convert "N times" to an end date once) is the robust variant.

### Gaps
- Todoist's exact rule for completing a fixed (`every`) task *early* (does it jump to the occurrence after the current one, or after today?) was not confirmed from the primary page (fetch blocked).
- TickTick's catch-up behaviour for overdue tasks: no documentation found.
- Things' handling of multiple missed "regular" occurrences: not documented in the sources found.

## RFC 5545 iCalendar concepts and VTODO semantics; JS/TS libraries in 2025–2026

### Takeaway
RFC 5545 defines a recurrence *set* (DTSTART + RRULE + RDATE − EXDATE, with RECURRENCE-ID overrides) that is excellent for fixed calendar schedules but says almost nothing about completing a recurring VTODO, so CalDAV clients each improvise (mutate-in-place, split into a new UID, or THISANDFUTURE override) and interoperability bugs (duplicates) are common. For Waterline's date-only, single-user-ish domain, full RRULE is overkill; if adopted, `rrule-temporal` (actively released, Temporal-based) is the 2026 choice over the stagnant `rrule` (rrule.js).

### Cited Findings
- The recurrence set "is generated by considering the initial DTSTART property along with the RRULE, RDATE, and EXDATE properties"; EXDATE values "take precedence over those specified by inclusion properties"; duplicates from RRULE and RDATE count once; RDATE may appear in VEVENT, VTODO and VJOURNAL (search summary of RFC text) — [icalendar.org RFC 5545 §3.8.5.2 RDATE](https://icalendar.org/iCalendar-RFC-5545/3-8-5-2-recurrence-date-times.html); [§3.8.5.1 EXDATE](https://icalendar.org/iCalendar-RFC-5545/3-8-5-1-exception-date-times.html)
- A recurrence set whose DTSTART doesn't match the rule's pattern is "undefined" (search summary) — [icalendar.org §3.8.5.3 RRULE](https://icalendar.org/iCalendar-RFC-5545/3-8-5-3-recurrence-rule.html)
- RECURRENCE-ID identifies a specific instance of a recurring component, used to override it — [kanzaki iCalendar spec: Recurrence ID](https://www.kanzaki.com/docs/ical/recurrenceId.html)
- UNTIL typing: if DTSTART is DATE-TIME with TZID or UTC, UNTIL must be UTC DATE-TIME; if DTSTART is `VALUE=DATE`, UNTIL must be a DATE — [rrule-temporal README (npm)](https://www.npmjs.com/package/rrule-temporal). UNTIL is inclusive and mis-converting it produces an extra or missing instance (search summary) — [itime.day RRULE/RDATE/EXDATE guide](https://itime.day/articles/rrule-rdate-exdate-guide)
- RFC 7529 adds `RSCALE` and `SKIP=OMIT|BACKWARD|FORWARD` to control invalid dates (e.g. Feb 29 in a non-leap year); SKIP is only allowed with RSCALE and defaults to OMIT — [rrule-temporal README](https://www.npmjs.com/package/rrule-temporal)
- Recurring VTODO completion: "The RFC says very little on how to complete recurring TODOs" and doesn't assign the work to client or server, so it falls to clients — [python-caldav issue #127](https://github.com/python-caldav/caldav/issues/127)
- Two client strategies (python-caldav): `safe` mode copies the task into a completed standalone object with a new UID and moves the master's DTSTART forward (two objects); `this_and_future` adds a `RECURRENCE-ID;RANGE=THISANDFUTURE` override for the next occurrence (one object). Proposal also notes: RRULE with BY* parts ⇒ fixed deadlines; otherwise next due counted from completion (search summary) — [recurring-ical-events issue #292](https://github.com/niccokunzmann/python-recurring-ical-events/issues/292); `Todo.complete(handle_rrule=False)` by default — [caldav docs](https://caldav.readthedocs.io/stable/caldav/calendarobjectresource.html)
- SabreDAV discussion: store the exception in the same resource with RECURRENCE-ID; one commenter says an EXDATE may also be needed (search summary) — [sabredav-discuss](https://groups.google.com/g/sabredav-discuss/c/M82DQRJTr4A)
- Real-world interop bug: completing one instance from Outlook via CalDAV Synchronizer created an extra open instance that synced to tasks.org as a duplicate — [tasks/tasks issue #1261](https://github.com/tasks/tasks/issues/1261)
- tasks.org itself completes a recurring task by mutating the single row (moving DUE, decrementing COUNT) rather than writing RECURRENCE-ID overrides — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- **rrule (rrule.js)**: latest 2.8.1 published 2023-11-10 (40 versions since 2012) — [npm registry](https://www.npmjs.com/package/rrule). README: it deals in "floating" times or UTC and "Returned 'UTC' dates are always meant to be interpreted as dates in your local timezone"; recommends `new Date(Date.UTC(...))`; TZID support exists; EXRULE is deprecated; supports RRuleSet with rdate/exdate — [rrule README (npm)](https://www.npmjs.com/package/rrule)
- rrule.js "Completely Freezes" on a pathological SECONDLY rule in a cross-library benchmark — [Phabricator commit](https://secure.phabricator.com/rPHU103f13c03f3861685e936af7d6eaa1f382b5baf0)
- **rrule-temporal**: created 2025-04-21, latest 2.2.8 on 2026-10-01, 68 versions — [npm registry](https://www.npmjs.com/package/rrule-temporal). Self-described "fully compliant" RFC 5545 library built on Temporal, returns `Temporal.ZonedDateTime`, accepts DTSTART separately from RRULE ("Storing recurrence patterns separately from start dates in databases"), supports rDate/exDate, `between()`, `occursOn(PlainDate)`, RFC 7529; created at the suggestion of rrule.js contributors — [rrule-temporal README](https://www.npmjs.com/package/rrule-temporal)
- Temporal polyfills: `temporal-polyfill` 1.0.6 (2026-10-13); `@js-temporal/polyfill` 0.5.1 (2025-03-31) — [npm registry](https://www.npmjs.com/package/temporal-polyfill)
- Temporal status: Stage 4 in March 2026; Node.js 26.0.0 (May 2026) enables Temporal by default (Current, LTS slated Oct 2026); Chrome 144 (Jan 2026) and Firefox 139 (May 2025) ship it; stable Safari did not yet (search summary; dates vary slightly between sources) — [Help Net Security](https://www.helpnetsecurity.com/?p=369696); [NodeSource](https://nodesource.com/blog/javascript-temporal-history-nodejs-26)

### Inferences
- Borrow RFC 5545 *concepts* without storing iCalendar: anchor (≈DTSTART), rule (≈RRULE subset: interval days or weekday set), `ends_on` (≈UNTIL, a DATE since tasks are date-only), and an overrides table keyed by original occurrence date (≈RECURRENCE-ID + EXDATE). This captures "move/skip one occurrence without breaking the series" for fixed schedules.
- RECURRENCE-ID only makes sense for *fixed* series (an occurrence has a stable identity = its rule date). For completion-relative series there is no future occurrence identity; moving "the next one" is just editing `next_due` (Things 3.23 does exactly this: after-completion to-dos move with no prompt; regular ones ask Exception vs Update Rule).
- If Waterline ever needs RRULE (monthly "first Saturday", etc.), use `rrule-temporal` with `VALUE=DATE` DTSTART and `occursOn`/`between` over `Temporal.PlainDate`; avoid rrule.js's floating-UTC `Date` semantics. Node 26 ships Temporal natively but the Docker image's Node version would need checking; `temporal-polyfill` is the maintained fallback.
- An iCal *export* feed (read-only VTODO/VEVENT for upcoming due dates) is cheap and sidesteps the VTODO-completion interop mess; two-way CalDAV sync of completions is not worth it given the bugs above.

### Gaps
- Could not read RFC 5545 text directly (rfc-editor.org and datatracker blocked). Not verified this session: the RFC 5545 §3.3.10 rule that invalid generated dates (e.g. Feb 30) are ignored and not counted; whether a VTODO with RRULE requires DTSTART; exact DUE/COMPLETED semantics for recurring VTODO.
- Nextcloud Tasks and Thunderbird's specific completion strategies were not found.
- No independent audit of rrule-temporal's "fully compliant" claim was found.

## Simpler alternatives: interval + anchor + last_done + materialised next_due, override tables, snooze, time zones and date-only tasks

### Takeaway
All three open-source chore/task apps studied use a "rule + small state" model rather than RRULE sets: Donetick and tasks.org store a materialised next due on the row, Grocy computes it in a SQL view from the completion log plus a single `rescheduled_date` override. Due dates should be stored as local calendar dates (`YYYY-MM-DD`), evaluated in the user's/tank's time zone, never as UTC instants.

### Cited Findings
- Donetick stores `next_due_date` (indexed) on the chore row, recomputed on completion — [model.go](https://github.com/donetick/donetick/blob/develop/internal/chore/model/model.go); [repository.go](https://github.com/donetick/donetick/blob/develop/internal/chore/repo/repository.go)
- Grocy computes due dates on read in a view from `chores_log` and lets a single `chores.rescheduled_date` override the computed date; `TrackChore` clears `rescheduled_date` after an execution is tracked; `chores_log` has `undone` and `skipped` flags, and the "last tracked" queries exclude both (`undone = 0 AND skipped = 0`); skipping is refused for chores without a schedule — [ChoresService.php](https://github.com/grocy/grocy/blob/master/services/ChoresService.php); [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- Note on Grocy skip: the view's `MAX(l.tracked_time)` filters only `undone = 0`, so a skipped log row *does* advance the schedule, while "last tracked time" shown in details excludes skips — [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql); [ChoresService.php](https://github.com/grocy/grocy/blob/master/services/ChoresService.php)
- Grocy `track_date_only` = date-only chore (due at 23:59:59 local) — [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- tasks.org distinguishes "specific day" vs "specific day+time" due values (`URGENCY_SPECIFIC_DAY` vs `URGENCY_SPECIFIC_DAY_TIME`) and has a "hide until" (start) date adjusted alongside due — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- Donetick evaluates recurrence in the chore's IANA time zone and converts to UTC only for storage, to avoid DST drift — [scheduler.go](https://github.com/donetick/donetick/blob/develop/internal/chore/scheduler.go)
- rrule.js warns that JS `Date` time-zone offsets "tend to just get in the way" — [rrule README](https://www.npmjs.com/package/rrule)

### Inferences
- Recommended model (fits Waterline's current tables; additive):
  ```ts
  // tasks (exists): schedule_mode 'completion'|'fixed'|'weekdays', interval_days, weekdays,
  //   next_due TEXT 'YYYY-MM-DD' (materialised, indexed), ends_on, snoozed_until
  // add:
  anchorDate: text('anchor_date'),         // fixed/weekdays series origin (≈DTSTART); never moved by completion
  windowBefore: integer('window_before').notNull().default(0), // days early that still "counts"
  windowAfter:  integer('window_after').notNull().default(0),  // grace days before "overdue"
  pausedUntil:  text('paused_until'),      // or paused_by_plan_id (see plans)
  planId:       text('plan_id'),           // set when generated by a treatment plan
  triggerEventKind: text('trigger_event_kind'), // auto-complete matching (see below)

  // task_overrides: per-occurrence exceptions for FIXED series (≈RECURRENCE-ID/EXDATE)
  export const taskOverrides = sqliteTable('task_overrides', {
    taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
    occursOn: text('occurs_on').notNull(),   // the rule date being overridden (identity)
    action: text('action', { enum: ['skip', 'move'] }).notNull(),
    movedTo: text('moved_to'),               // for 'move'
    createdAt: createdAt()
  }, (t) => [primaryKey({ columns: [t.taskId, t.occursOn] })]);
  ```
  `next_due` stays the single query/index target for "what's due"; it is recomputed by one pure function `computeNextDue(task, completions, overrides, today)` on every write (complete, skip, snooze, edit, plan start/stop) and nightly as a self-heal. Grocy's compute-on-read view is elegant but makes indexing and notification queries harder; Donetick/Waterline's materialisation is cheaper for a 5-minute scheduler.
- **Snooze vs move vs skip** are three different things and should stay separate: *snooze* hides/suppresses notifications until a date but keeps the occurrence's identity and (for fixed) doesn't shift the series (`snoozed_until`, Waterline's `effectiveDue = max(next_due, snoozed_until)`); *move* is a per-occurrence override (fixed) or a `next_due` edit (completion-relative); *skip* writes a completion row with `skipped=1` (Grocy/Waterline) and advances like a completion — but should *not* count as "last done" for urgency/auto-complete statistics (Grocy excludes skips from last-tracked).
- Date-only rules: store `YYYY-MM-DD` text, do date arithmetic on calendar dates (`Temporal.PlainDate.add({days})` or epoch-day integers), compute "today" with `Intl.DateTimeFormat(..., { timeZone })` per user/tank. Never derive a due date from a UTC timestamp without converting to the local zone first (a 23:30 water change in UTC−7 is the next UTC day). Store completion `completed_at` as an instant but also derive `completed_on` (local date) at write time so schedule math doesn't depend on later time-zone changes.

### Gaps
- No primary source found for Vikunja's or Home Assistant chore integrations' schemas (not fetched due to tool limits).

## Flexible windows/tolerance, grace periods, soft vs hard due, urgency ratio for sorting

### Takeaway
Explicit windows exist but are rare: Donetick has a `completion_window` (seconds before due when completion is allowed) and Grocy/Waterline have a global "due soon" horizon; Tody-style "need" indicators that resets on completion are a sorting/visual device rather than a schedule. A per-task window (before/after) plus an elapsed/interval ratio for ordering is the simplest coherent design.

### Cited Findings
- Donetick: `CompletionWindow *int` — "Number seconds before the chore is due that it can be completed" — [model.go](https://github.com/donetick/donetick/blob/develop/internal/chore/model/model.go)
- Grocy: per-user "due soon" days setting, default 5, for chores, tasks, batteries, stock — [config-dist.php](https://github.com/grocy/grocy/blob/master/config-dist.php)
- Grocy `rollover`: overdue chores display as due today rather than accumulating overdue days — [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- Tody: tasks are driven "by indicators of actual need rather than arbitrary dates", visualising dirtiness; users set per-task frequency; completing resets the timer; reviews describe red/yellow/green states (search summary; exact algorithm undocumented) — [App Store listing](https://apps.apple.com/us/app/-/id595339588); [Root Simple review](https://www.rootsimple.com/2016/12/tody-an-app-that-helps-you-clean/)
- Waterline has a global `DUE_SOON_DAYS = 3` — [tasks.ts](/home/user/waterline/src/lib/tasks.ts)

### Inferences
- Model a window per task as two small integers relative to the due date: `window_before` (early completion still satisfies *this* occurrence — key for fixed schedules so a Friday water change satisfies a Saturday one rather than leaving Saturday's open) and `window_after` (grace: shown as "due" not "overdue", no overdue alert). Status ladder for a date-only task, `d = today − due`: `d < −window_before` → upcoming; `−window_before ≤ d < 0` → "due soon/open"; `0 ≤ d ≤ window_after` → due; `d > window_after` → overdue. Hard vs soft is then just `window_after = 0` vs > 0 (and whether overdue notifications fire).
- Urgency for sorting (Tody-like, works for both modes): `ratio = (today − last_done_on) / interval_days` for completion-relative; for fixed, `ratio = 1 + (today − due) / interval_days` (≈1 on the due day). Sort descending; ratio > 1 is overdue proportionally to the cadence, so a daily dose 1 day late (ratio 2) outranks a 30-day filter clean 3 days late (ratio 1.1). Weekday schedules: use the gap between consecutive listed days as the interval.
- Early-completion window resolves the main fixed-schedule ambiguity: if completion falls inside `[due − window_before, due + window_after]` it satisfies that occurrence; outside the window *before* due, either ask ("Done early — counts for Sat?") or treat as an ad-hoc extra that doesn't move the series. Collapsing many missed occurrences remains the rule after the window.

### Gaps
- No published formula from Tody or similar apps was found; the ratio above is a design inference.
- No source found on Things/Todoist offering explicit per-task tolerance windows.

## Weekday-pattern schedules and dependent/offset tasks (event-triggered recurrence, chains)

### Takeaway
Weekday sets (EI dosing Mon/Wed/Fri + Tue/Thu/Sat) are a first-class schedule type in Grocy (`weekly` + `period_config` day list), Donetick (`days_of_the_week` with week-of-month patterns), tasks.org (WEEKLY + BYDAY) and Waterline (`weekdays`). Dependencies are rarer: Donetick's `trigger` frequency activates a chore when a linked "thing" changes state — the closest prior art to "N days after event X".

### Cited Findings
- Grocy weekly: next due = earliest weekday in `period_config` after the last execution plus (interval−1) weeks — [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- Donetick `days_of_the_week` with `weekPattern` `every_week` / `week_of_month` / `week_of_quarter` and `occurrences` (e.g. 1st, 3rd, last) — [model.go](https://github.com/donetick/donetick/blob/develop/internal/chore/model/model.go); `findNextDueDateForOccurrencePattern` walks forward day by day from base+1 — [scheduler.go](https://github.com/donetick/donetick/blob/develop/internal/chore/scheduler.go)
- tasks.org weekly+BYDAY from completion: walk forward from completion to the next listed weekday (`handleWeeklyRepeatAfterComplete`) — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- Donetick `trigger` chores: `ThingChore {thing_id, chore_id, trigger_state, condition}`; `EvaluateThingChore(tchore, newState)` decides whether a state change activates the chore; trigger chores get no next due date and are archived (`is_active=false`) on completion until triggered again; notifications are not planned for trigger chores — [thing/model.go](https://github.com/donetick/donetick/blob/develop/internal/thing/model/model.go); [thing/helper.go](https://github.com/donetick/donetick/blob/develop/internal/thing/helper.go); [repository.go](https://github.com/donetick/donetick/blob/develop/internal/chore/repo/repository.go); [notifier/service/planner.go](https://github.com/donetick/donetick/blob/develop/internal/notifier/service/planner.go)
- Waterline: `onOrAfterWeekday(date, days)` and `parseWeekdays("1,3,5")` (0 = Sunday) — [tasks.ts](/home/user/waterline/src/lib/tasks.ts)

### Inferences
- EI dosing is best modelled as **two tasks** (macros: Mon/Wed/Fri; micros: Tue/Thu/Sat), each `schedule_mode='weekdays'`, plus the weekly water change as a third task — not as one task with alternating payloads. Each keeps its own product/amount (Waterline already has `product`, `amount`, `amount_unit`). Weekday schedules are inherently fixed-calendar: completion marks today's slot; catch-up collapses to the next listed weekday ≥ today (or > today if today's slot was just done).
- Event-triggered/offset tasks: add `trigger_event_kind` (e.g. `water_change`) + `trigger_offset_days` (e.g. 2) and `schedule_mode='after_event'`. When an `events` row of that kind is written for the tank, set `next_due = event_local_date + offset` (and re-activate if dormant). This is Donetick's "trigger" generalised to Waterline's existing `events` stream, and it covers "2 days after water change" and "the day after spot treatment do a water change" (trigger = `treatment` event). Because Waterline already writes an `events` row for every tank-state change, the hook point exists.
- Chains inside a plan (step B N days after step A *completed*) can reuse the same mechanism scoped to the plan (trigger = completion of plan task A) — keep it to a single predecessor to avoid DAG complexity; note in UI that a chained task has no date until its predecessor is done.
- Guard against loops (task A completion logs an event that triggers B, whose completion logs an event that triggers A): only trigger from user-logged event kinds, and/or ignore events whose `data.source_task_id` is itself a triggered task.

### Gaps
- No open-source app found that implements general "N days after event" offsets with editing semantics (what happens if the triggering event is deleted or back-dated); behaviour must be designed.

## Templated multi-day regimens ("treatment plans"): template vs generator, pausing/ending early, suppressing routine tasks

### Takeaway
No studied open-source app has a first-class "plan" object; the closest primitives are bounded series (COUNT/UNTIL, Waterline `ends_on`, tasks.org COUNT decrement) and activation flags (Grocy/Donetick `active`/`is_active`). A plan template that instantiates ordinary (bounded) tasks tagged with a `plan_run_id`, plus a suppression list for routine tasks, keeps every downstream feature (due list, notifications, history, auto-complete) unchanged.

### Cited Findings
- tasks.org ends a series when `COUNT == 1` and decrements COUNT on each completion; undo increments it — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- Grocy filters chores by `active = 1` in the due view; Donetick has `is_active` and archives one-off/trigger chores on completion — [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql); [repository.go](https://github.com/donetick/donetick/blob/develop/internal/chore/repo/repository.go)
- Waterline already supports a bounded "treatment course": `ends_on` ("a treatment course or any routine with an end: no more occurrences after this day"), `endsAfterTimes`, `occurrencesUntil`, `courseText` — [schema.ts](/home/user/waterline/src/lib/server/db/schema.ts); [tasks.ts](/home/user/waterline/src/lib/tasks.ts)
- Things 3.23 supports repeating *projects* (a repeat applies to a group of to-dos) (search summary) — [Cultured Code blog](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/)

### Inferences
- Schema sketch:
  ```ts
  plan_templates(id, name, duration_days, description, builtin bool)          // e.g. "14-day algae plan"
  plan_template_items(id, template_id, name, kind, product, amount, amount_unit,
     start_day int,            // 1-based offset from plan start
     end_day int,              // inclusive; null = until plan end
     every_days int,           // 1 = daily, 3 = every 3 days; or weekdays text
     schedule_mode,            // usually 'fixed' within a plan
     trigger_item_id, trigger_offset_days)  // optional chain inside plan
  plan_template_suppressions(template_id, task_kind | task_tag)  // e.g. suppress 'fertilise' during blackout
  plan_template_settings(template_id, key, value)  // e.g. photoperiod_hours = 6 (informational / device hook)

  plan_runs(id, tank_id, template_id, name, started_on, ends_on, status 'active'|'paused'|'ended'|'completed',
            paused_on, ended_on, ended_reason)
  // instantiated work = ordinary tasks rows with plan_run_id, anchor_date = started_on + start_day − 1,
  // ends_on = started_on + end_day − 1, interval_days = every_days
  task_suppressions(task_id, plan_run_id, from_on, until_on)   // routine tasks paused by a plan
  ```
- **Instantiate, don't generate on the fly**: creating N ordinary bounded recurring tasks (one per template item) at plan start is better than (a) materialising every dated occurrence (14×3 rows, painful to shift when paused) and (b) a virtual generator (every query must understand plans). Each instantiated task is a normal fixed series with an `ends_on`, so the due list, History events, notifications and auto-complete all work unchanged. Copying template fields (not referencing them) means later template edits don't rewrite a running plan.
- **Pause**: set `plan_runs.status='paused', paused_on=today`; the due computation treats tasks with an active-paused plan as not due. **Resume**: shift each plan task's `anchor_date`, `next_due` and `ends_on` by `(resume_date − paused_on)` days so "day 7 of 14" stays day 7. **End early**: set `ended_on`, set each plan task's `ends_on = min(ends_on, today)` (or deactivate), lift suppressions, write an `events` row ("Algae plan ended early on day 9").
- **Suppressing routines during a plan** (e.g. no ferts during a blackout): a separate `task_suppressions` row per affected routine with `from_on`/`until_on` = plan dates (copied from `plan_template_suppressions` matching by task `kind`). The due computation skips suppressed dates; for fixed schedules, occurrences falling inside the window are treated as skipped (not overdue) and the series resumes on the first rule date after `until_on`; for completion-relative, set `next_due = max(next_due, until_on + 1)`. Ending a plan early sets `until_on = today` and recomputes. Store suppressions rather than mutating the routine's schedule so the routine is restored exactly.
- Every plan start/pause/resume/end should write an `events` row (Waterline rule: "Every write that changes tank state also writes an events row").

### Gaps
- No prior art found for plan templates in task apps (aquarium-specific or general); the design above is inference.
- Photoperiod changes are device/settings changes, not tasks; whether they belong in a plan is a product decision.

## Auto-completing tasks from logged events: matching rules and pitfalls

### Takeaway
Waterline already links completions to events (`task_completions.event_id`, `open_form_on_done`), and Donetick links chores to "things" via trigger state; the reverse direction (an event satisfies a due task) needs explicit, conservative matching: same tank, same event kind (+ optional product), event local date inside the task's window, at most one task occurrence per event, and reversible.

### Cited Findings
- Waterline `task_completions` has `event_id` (the logged entry) and keeps `prev_next_due`/`prev_snoozed_until` "so Mark done can be undone" — [schema.ts](/home/user/waterline/src/lib/server/db/schema.ts)
- Grocy supports undo of executions (`UndoChoreExecution`, `chores_log.undone`) and excludes undone rows from the schedule — [ChoresService.php](https://github.com/grocy/grocy/blob/master/services/ChoresService.php); [0185.sql](https://github.com/grocy/grocy/blob/master/migrations/0185.sql)
- Donetick `ThingChore` matches on `trigger_state` + `condition` evaluated against the new state — [thing/model.go](https://github.com/donetick/donetick/blob/develop/internal/thing/model/model.go)
- CalDAV experience shows that implicit cross-system completion creates duplicates when the two sides disagree on occurrence identity — [tasks/tasks #1261](https://github.com/tasks/tasks/issues/1261)

### Inferences
- Matching rule (proposal): an event E auto-completes task T iff `T.tank_id = E.tank_id`, `T.kind` maps to `E.category` (and if T has a `product`, `E.data.product` matches), T is active and not suppressed, and `E.local_date ∈ [T.due − window_before − slack, T.due + window_after]` or T is overdue. Pick the single most-urgent matching task; record a `task_completions` row with `event_id = E.id`, `source = 'auto'`.
- Pitfalls to design for: (1) **back-dated events** — compute completion date from the event's `occurred_at` local date, and only move the schedule forward (if the back-dated event is older than the last completion, record it but don't change `next_due`); (2) **edited/deleted events** — `ON DELETE SET NULL` loses the link; instead, on event delete, if an auto completion references it, undo using `prev_next_due` (only if it's still the latest completion); (3) **double counting** — the "Mark done" path that *creates* an event must not then also trigger the auto-matcher (pass a flag or check `task_completions.event_id` uniqueness); (4) **partial matches** — a 10% water change logged when the task says 30%: complete anyway (keepers value low friction) but show the logged amount; (5) **imports** — bulk history imports should not fire auto-completion or notifications; (6) **multiple tasks of same kind** (two dosing tasks) — require product match or skip auto-completion when ambiguous; (7) completion-relative tasks re-anchor on the event date, fixed tasks only satisfy the occurrence.
- Surface it ("✓ Done — matched your water change on Sat") with an Undo, rather than silently.

### Gaps
- No published matching rules from consumer apps (e.g. fitness/habit apps that auto-complete from health data) were found in this session.

## Notification batching: daily digest, quiet hours, not re-notifying snoozed items; computing "due today" from a 5-minute scheduler

### Takeaway
With a 5-minute tick, compute "today" per user time zone each tick, select tasks by the materialised `next_due`/`snoozed_until` index, and make every send idempotent with a deterministic key (`kind:task:date`), which Waterline already does for digests. Snooze, pause and suppression should be folded into the single "effective due" date so no notification path needs special cases.

### Cited Findings
- Waterline digest keys `${weekly ? 'weekly' : 'daily'}-digest:${today}` with `today` computed in the user's `timeZone`; task reminder/overdue/digest kinds exist; out-of-range alerts compute `today`/`loggedDay` via `todayInZone`/`dateInZone` — [notifications.ts](/home/user/waterline/src/lib/server/notifications.ts)
- Donetick has notification metadata flags `dueDate`, `predue`, `nagging`, `completion`, and skips planning notifications for trigger chores — [model.go](https://github.com/donetick/donetick/blob/develop/internal/chore/model/model.go); [planner.go](https://github.com/donetick/donetick/blob/develop/internal/notifier/service/planner.go)
- tasks.org resets `reminderLast` and `reminderDismissed` when a recurring task advances, and reschedules alarms relative to the new due date — [RepeatTaskHelper.kt](https://github.com/tasks/tasks/blob/main/kmp/src/commonMain/kotlin/com/todoroo/astrid/repeats/RepeatTaskHelper.kt)
- Waterline `effectiveDue(task)` already combines `next_due` and `snoozed_until` — [tasks.ts](/home/user/waterline/src/lib/tasks.ts)

### Inferences
- Tick algorithm (each 5 min): for each user, `now` in their zone → `today`, `hh:mm`. If `hh:mm` ≥ digest time and no `daily-digest:{today}` row in the send log → build digest from `WHERE effective_due <= today + horizon` and send. Per-task push reminders: key `remind:{task_id}:{effective_due}`; because the key includes the effective due date, snoozing (which changes effective due) naturally prevents re-notification until the new date, and completing (which changes `next_due`) naturally arms the next one. Overdue nags: key `overdue:{task_id}:{effective_due}:{n}` with a cap.
- Quiet hours: compute in the user's zone; if inside quiet hours, *don't* write the dedupe key — the next tick after quiet hours ends will send. Missed ticks (server down) are harmless for the same reason (send-if-not-sent, not send-at-exact-minute).
- Index: `tasks(next_due)` exists; add a generated/stored `effective_due` (or keep the `max(next_due, snoozed_until)` in SQL) to avoid scanning all tasks. Suppressed/paused tasks should have effective due pushed past the suppression end so they never enter the digest query.
- Digest should group by tank and list overdue first, then due today, then "due soon" within the window; treat tasks inside `window_after` as "due" not "overdue" in copy.

### Gaps
- No external source consulted on digest/quiet-hour best practice; recommendations are engineering inference from the code studied.

## Testing strategies: property-based tests for recurrence, DST edge cases

### Takeaway
Keep recurrence pure (`(task, completions, overrides, suppressions, today) → next_due`) over calendar dates so it can be property-tested with fast-check; DST bugs mostly disappear if date-only schedules never touch instants, but "today in zone" and time-of-day reminders still need explicit DST-transition tests.

### Cited Findings
- fast-check latest 4.10.2 (2026-09-19) — [npm registry](https://www.npmjs.com/package/fast-check)
- The Rust `rrule` crate's docs acknowledge test coverage still lacks "edge cases in stuff like DST, time zone and rfc_string parsing" (search summary) — [docs.rs rrule](https://docs.rs/crate/rrule/^0.5.7)
- Donetick's comment on DST: arithmetic in UTC shifts local times by an hour across transitions; in-zone arithmetic with `time.Date` normalises nonexistent/repeated local hours to a neighbouring instant — [scheduler.go](https://github.com/donetick/donetick/blob/develop/internal/chore/scheduler.go)
- rrule.js freezes on pathological rules (relevant to generated-input testing; bound iteration) — [Phabricator](https://secure.phabricator.com/rPHU103f13c03f3861685e936af7d6eaa1f382b5baf0)
- Donetick ships dedicated scheduler tests (`scheduler_test.go`, `scheduler_adaptive_test.go`); tasks.org has `RepeatTaskHelperTests.kt` (COUNT decrement, last instance, completion-when-no-due) — [donetick internal/chore](https://github.com/donetick/donetick/tree/develop/internal/chore); [tasks.org tests](https://github.com/tasks/tasks/blob/main/app/src/test/java/com/todoroo/astrid/repeats/RepeatTaskHelperTests.kt)

### Inferences
- Properties worth encoding (fast-check, arbitrary task configs × completion sequences × `today` values):
  1. `next_due` is always ≥ today after a completion for fixed/weekdays (collapse policy) and = done_on + interval for completion mode.
  2. Fixed series invariance: completing/skipping never changes the set of rule dates after the next one (anchor unchanged); only overrides do.
  3. Weekday mode: `next_due`'s weekday ∈ weekdays set; no listed weekday is skipped between done date and next due.
  4. Monotonicity: later completion date ⇒ next due not earlier (completion mode).
  5. Undo round-trip: complete then undo restores `next_due`, `snoozed_until` exactly.
  6. `ends_on`: no `next_due` > `ends_on`; `endsAfterTimes(n)` then n completions ⇒ series finished.
  7. Pause/resume of a plan preserves remaining-occurrence count.
  8. Suppression windows: no due date inside `[from_on, until_on]`.
  9. Termination: any generator loop is bounded (max iterations) — mirrors Waterline's `occurrencesUntil(…, max = 1000)`.
- DST/zone example tests: `todayInZone` at 23:59 and 00:01 local on spring-forward and fall-back days in America/Los_Angeles, Europe/London, Australia/Lord_Howe (30-min DST), and a zone without DST; a user changing time zone between completion and next tick; a daily digest at 02:30 local on a spring-forward day (nonexistent time — must still send once); fall-back 01:30 (occurs twice — must send once, which the date-keyed dedupe guarantees). Use Vitest fake timers with `process.env.TZ` irrelevant (all zone math via `Intl`/Temporal with explicit zone).
- Month-end/leap tests if monthly rules are ever added: anchor Jan 31 monthly; Feb 29 yearly (Donetick clamps to last day; RFC 7529 SKIP offers OMIT/BACKWARD/FORWARD — pick one deliberately).

### Gaps
- No source found for fast-check-specific recurrence test suites or a catalogue of rrule.js DST bugs (rrule.js issue tracker could not be fetched).
