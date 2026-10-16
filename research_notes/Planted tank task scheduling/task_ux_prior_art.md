# Recurring maintenance/care task UX: prior art (aquarium, plant-care, chore, to-do apps)

Method note: research done 2026-10-16. Direct page fetching was blocked in this environment (egress proxy refused todoist.com, culturedcode.com, apps.apple.com), so every finding below comes from web-search result summaries of the cited pages, not from reading the full pages myself. Exact button wording quoted here is as reported in those summaries; verify against the live app before copying any of it into the UI. Several sources are third-party guides or single user reviews; this is flagged where relevant.

## Aquarium/reef apps: how do they handle maintenance reminders, and what do users say?

### Takeaway
The one aquarium app with documented recurring-task behaviour (Aquarimate) offers the two standard anchors, "dynamic" (N days after the last logged activity) and "fixed" (calendar dates). It shows days-until-due or days-past-due per task, with a per-tank badge counting tasks that are overdue or due today, and lets you "perform or skip" from the watch. Most other aquarium apps advertise only "recurring reminders" without documenting early/late, snooze or skip. I found no public detail on treatment courses in any aquarium app.

### Cited Findings
- Aquarimate has two schedule types. **Dynamic** schedules repeat a set number of days after the last activity date, so the due date moves with when you last logged the task. **Fixed** schedules repeat on set dates regardless of the last activity. — [Aquarimate: Features, Tasks & Activities](https://www.aquarimate.com/features/tasks-activities/)
- Aquarimate's dashboard icon beside each task shows "how many days before the task is due (or how many days a task is past due)". The tank's badge counts tasks that are overdue or due today. — [Aquarimate: Tasks & Activities](https://www.aquarimate.com/features/tasks-activities/)
- Aquarimate tasks are linked to "activities" (the log entries). Completing a task records an activity, which is what drives dynamic schedules. Tasks are added to the calendar, and reminders show when a task is due. — [Aquarimate: Tasks & Activities](https://www.aquarimate.com/features/tasks-activities/); [Aquarimate home](https://www.aquarimate.com/)
- On Apple Watch, Aquarimate lets you "perform or skip tasks right from your watch". Skip is a first-class action beside complete. — [Aquarimate App Store listing](https://apps.apple.com/my/app/aquarimate/id587215055)
- One reported complaint: adding a daily task "shows due by a week", which the reviewer called a bug. Single review; may be dated. — [worldsapps.com Aquarimate reviews](https://worldsapps.com/reviews-aquarimate)
- A reef2reef thread asks "Is anyone using Aquarimate???". The search summary reported that an older forum post there said the app had no scheduled tasks or reminders, which the current feature set contradicts. — [reef2reef thread](https://www.reef2reef.com/threads/is-anyone-using-aquarimate.694271/)
- AquaticLog (13+ years on the App Store, by its own claim) advertises recurring reminders for measurements, dosing and maintenance. Its free tier includes reminders and water changes. — [AquaticLog App Store listing](https://apps.apple.com/app/id583895470)
- Newer 2025–2026 aquarium apps advertise reminders, but their listings don't describe how the reminders behave:
  - TankSync makes reminders a Pro feature and offers trend analysis linking water changes to parameter shifts. — [TankSync](https://apps.apple.com/app/id6758121614)
  - Reef Guard offers reminders for water changes and equipment cleaning. — [Reef Guard](https://apps.apple.com/mx/app/reef-guard/id6755100588)
  - ReefToolkit has a "Water Change Tracker". — [ReefToolkit](https://apps.apple.com/us/app/reeftoolkit/id6753037682)
  - Aquarium Manager offers "planning reminders". — [Aquarium Manager](https://apps.apple.com/app/id614505498)
  - AquariumMemo and FishJoy offer water-change and maintenance reminders. — [AquariumMemo](https://apps.apple.com/us/app/-/id6756537019); [FishJoy](https://apps.apple.com/us/app/-/id6741951758)
- A 2011 review of the older aquaPlanner app noted a limit of four custom tasks. This is historical only. — [AquaNerd aquaPlanner review](https://aquanerd.com/2011/02/the-aquaplanner-aquarium-reminder-app-review.html)
- A 2026 reminder-app blog notes that calendar apps "fall apart" for aquarium cadences like twice-weekly water changes. It lists flexible recurrence ("every 3 days", "every 2 weeks") as a key feature. — [YouGot: aquarium maintenance reminder app](https://www.yougot.ai/blog/reminders/pet-reminders/aquarium-maintenance-reminder-app)
- LoopCare, a general task-reminder app, reschedules from the time you actually finished, not from the original deadline. — [LoopCare listing](https://apps.apple.com/app/id6757657981)

### Inferences
- Aquarimate's dynamic/fixed split matches Todoist's every!/every and Things' after-completion/fixed. It is the established vocabulary in this niche too. For water changes and filter cleaning, "N days after last done" (dynamic) is the natural default, because the keeper's log of the actual water change resets the clock.
- Showing "days until / days overdue" plus a per-tank due-today/overdue count is the baseline aquarium users already know.
- Skip sitting beside Perform on the watch suggests skip is expected as a cheap action, not buried in an edit screen.

### Gaps
- No primary information found for Aquarium Note, AquaHome, Fishkeeper, Red Sea ReefBeat, Tank Journal or Aquarist Journal on snooze, skip or early-completion behaviour.
- No aquarium app found with documented treatment/medication "courses" (e.g. dose daily for 7 days, then stop).
- No Reddit (r/Aquariums, r/PlantedTank) threads surfaced comparing these apps' reminder UX. Searches returned only store listings. Aquarimate's App Store version notes looked very old in the search result, so its listing may be stale.

## Plant-care apps (Planta, Greg, Blossom, Vera): adaptive schedules, snooze, "already did it", today/upcoming/late

### Takeaway
Plant apps lean on adaptive, completion-anchored schedules: logging the care, not the reminder, moves the next date. Planta offers snooze ("not ready yet"; reportedly a re-remind in 2 days, with a few duration options), and Greg learns from "I watered early". The main complaint is that snoozing doesn't teach the schedule anything, and that once reality drifts from the plan there's no easy way to say "already done".

### Cited Findings
- Planta: if a plant doesn't need water yet, you can snooze its reminder and Planta reminds you again in 2 days. Source is an older university blog, so it may be dated. — [UW–Madison Media Fluency blog](https://mediafluency.sjmc.wisc.edu/?p=4810)
- A user review describes Planta's snooze as "snooze the notification for however long (you get a few options for this)". It is meant for when you check the soil and it's not ready yet. — [Planet Houseplant: Reviewing Planta](https://planethouseplant.com/reviewing-planta-do-house-plant-apps-work/)
- Planta's developer, replying on the App Store, says the next reminder adapts to when you last logged a watering. — [Planta App Store](https://apps.apple.com/us/app/planta-plant-garden-care/id1410126781)
- Planta lets users set a custom schedule if they disagree with the suggested one. Its listings say reminders "always adapt the schedule" per plant. Fertilizing, misting and repotting are also scheduled. — [Planta App Store](https://apps.apple.com/us/app/planta-plant-garden-care/id1410126781); [getplanta.com](https://getplanta.com/)
- Complaint from a premium subscriber: the app "doesn't seem to update watering schedule based on the amount of times you snooze the action". Their plants needed watering less often than suggested. The developer reply didn't address it. This is a single review. — [Planta App Store reviews](https://apps.apple.com/us/app/planta-plant-garden-care/id1410126781?see-all=reviews); [JustUseApp Planta reviews](https://justuseapp.com/en/app/1410126781/planta-keep-your-plants-alive/reviews)
- Other Planta complaints:
  - Watering reminders can't be turned off completely (per a developer reply).
  - One user said there was "no way to mark plants as watered (if you happen to deter from their schedule)".
  
  — [Planta App Store reviews](https://apps.apple.com/us/app/planta-plant-garden-care/id1410126781?see-all=reviews)
- Greg: telling it you watered early makes it adjust ("it'll learn and grow"), and your own observations can overrule it. Its schedule factors in species, pot size and material, and distance from a window. Watering reminders and seasonal updates are paid features. (TechCrunch, 2023.) — [TechCrunch](https://techcrunch.com/?p=2234094); [TechCrunch gift guide 2023](https://techcrunch.com/2023/11/16/the-best-techy-plant-gifts-for-green-thumbs-in-2023)

### Inferences
- Snooze that silently does nothing to the cadence frustrates people. If a keeper repeatedly snoozes or completes late, the app could offer "Change to every N days?" rather than adapting silently. (This is a design suggestion, not observed in a source.)
- "Already did it" needs to be reachable from the reminder or due row, and it should accept a past date. Complaints show users drift from the plan and need to re-sync.

### Gaps
- Blossom and Vera: no sources found on their snooze, skip or late displays.
- No documented "consistently early/late → auto-adjust" algorithm from any plant app beyond Greg's marketing language.
- Planta's current snooze options and their effect on the next date are unconfirmed for the 2026 app.
- No source showed how plant apps lay out Today / Upcoming / Late screens.

## Chore/home apps (Tody, Sweepy, OurHome, Centriq/HomeZada): need indicators instead of due dates

### Takeaway
Tody replaces deadlines with a per-task "dirtiness" gauge that fills over time and resets when you clean, with no deadlines and optional notifications. Sweepy uses a similar room-health model with a daily plan that re-prioritizes missed tasks, plus a vacation mode and a "Reset all to clean" escape hatch. A user report says leaving holiday mode mis-set last-done dates.

### Cited Findings
- Tody schedules by "indicators of actual need rather than arbitrary dates". A visual "dirtiness" gauge per area shows how dirty it is and the effect of cleaning. The listing promises "no deadlines", with alarms and notifications optional. Tasks are grouped by room. Household members can check in to claim credit. Rated about 4.8 from about 11k ratings, per an aggregator. — [Tody App Store](https://apps.apple.com/us/app/-/id595339588); [MWM.ai Tody](https://mwm.ai/apps/tody/595339588)
- Sweepy: tasks turn red only when overdue. Each task is worth up to 3 points by effort. A daily schedule "re-prioritizes missed tasks for tomorrow or next week based on the room's overall health". Points and the leaderboard are paid features. (Third-party blog.) — [Tidied: Sweepy vs Tody](https://www.tidied.app/blog/sweepy-vs-tody); [Tidied: Sweepy review](https://www.tidied.app/blog/sweepy-app-review)
- Sweepy has a vacation (holiday) mode. One user review says that after turning holiday mode off, the last occurrence of tasks was set to a date during the vacation. A blog recommends "Reset all to clean" after a break instead of catching up. (Third-party, single report.) — [Superclean: best cleaning schedule apps 2026](https://superclean.sg/blog/best-free-cleaning-schedule-apps/); [Tidied: Sweepy review](https://www.tidied.app/blog/sweepy-app-review)

### Inferences
- A "need bar" (fraction of interval elapsed) suits soft tasks like glass cleaning, pruning or filter rinses, where a day late doesn't matter. A hard due date suits fixed-dose treatments. Waterline could show both: a progress bar against the interval, plus the word status (OK / Due / Overdue) to satisfy the "never color-only" rule.
- "Pause / away" needs a defined resume rule. Sweepy's reported bug shows resuming must shift last-done dates (or offer "start fresh") rather than leave a pile of overdue tasks.
- "Reset all to clean" is a bulk "mark all done now" action. It's useful after a big maintenance day.

### Gaps
- No sources found on OurHome, Centriq or HomeZada maintenance-task behaviour.
- No official Tody or Sweepy help text found on streaks, the exact vacation-mode rule, or how far the bar extends past "due".

## To-do apps: schedule-based vs completion-based, postpone, skip, one occurrence vs series

### Takeaway
Every major to-do app has converged on two anchors, fixed calendar and "after completion", and on separating "move this one" from "change the rule". Things 3.23 (August 2026) is the current best articulation:
- a normal checkbox completes a repeat early, keeping the schedule
- fixed repeats ask "Make Exception" vs "Update Rule" when moved
- after-completion repeats just move, with no prompt
- "Create Next Copy" starts the next one early
- bulk pause, resume and stop

Todoist uses `every` vs `every!`, and moving one occurrence in the date picker differs from editing the pattern. TickTick has an explicit "Skip the recurrence".

### Cited Findings
- **Todoist**:
  - `every!` schedules the next date from the completion day. Example: created Jan 10, completed Jan 15, "every month" gives Feb 10, while `every! month` gives Feb 15. — [Todoist help: recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV); [darekkay.com Todoist tips](https://darekkay.com/blog/todoist-tips/)
  - Completing a recurring task late puts the next occurrence on the next *future* date, so missed occurrences don't stack. — [Todoist help: recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV)
  - Picking a single date in the scheduler reschedules only the next occurrence. Editing the date text changes the whole pattern. — [Todoist help: recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV)
  - Rescheduling manually and then completing skips any occurrences between the original and the new date. Todoist warns this can push yearly tasks back a whole year. — [Todoist help: complete a recurring task](https://www.todoist.com/help/todoist/features/complete-a-task-with-a-recurring-date-dmI6SVqdP)
  - Ending a series is "Complete forever" in the ⋯ menu. — [2sync: Todoist recurring tasks](https://2sync.com/blog/todoist-recurring-tasks)
  - A 2026 third-party guide describes a "Skip" option in the due-date menu that advances without completing. It is not confirmed in the official help. — [usecarly.com Todoist guide](https://www.usecarly.com/blog/how-to-set-recurring-tasks-in-todoist/)
- **Things 3.23** (released 2026-08-19):
  - Repeating to-dos now have an ordinary checkbox, so you can complete early, and the next copy follows the existing rule. Example: a Friday task done on Wednesday leaves later Fridays unchanged. — [Cultured Code blog: Repeating To-Dos, Refined](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/); [9to5Mac](https://9to5mac.com/2026/08/19/things-3-23-update-now-available-with-major-repeating-to-do-improvements/); [iPhonote](https://www.iphonote.com/actu/387048/things-3-23-taches-recurrentes)
  - Rescheduling a fixed-schedule repeat asks **"Make Exception"** (this copy only) or **"Update Rule"** (all future copies). Example: a weekly Monday task moved to Tuesday. After-completion repeats simply move to the new date with no prompt. — [MacRumors](https://www.macrumors.com/2026/08/19/things-3-23-brings-long-requested-overhaul-of-repeating-to-dos/); [AlternativeTo news](https://alternativeto.net/news/2026/8/things-3-23-adds-early-completion-and-flexible-rescheduling-for-repeating-to-dos/)
  - Also new in 3.23:
    - a **"Create Next Copy"** command, to start the next one early
    - grey repeat icons marking generated copies
    - a refreshed repeat setup dialog
    - **pause, resume or stop multiple** repeating to-dos at once
    
    — [9to5Mac](https://9to5mac.com/2026/08/19/things-3-23-update-now-available-with-major-repeating-to-do-improvements/); [AlternativeTo news](https://alternativeto.net/news/2026/8/things-3-23-adds-early-completion-and-flexible-rescheduling-for-repeating-to-dos/)
  - Before 3.23, Things' repeating model separated "after completion" from fixed schedules. Users long asked for early completion and per-occurrence moves, as the press called 3.23 a "long-requested overhaul". — [Things support: Using Repeating To-Dos](https://culturedcode.com/things/support/articles/2803564/); [MacRumors](https://www.macrumors.com/2026/08/19/things-3-23-brings-long-requested-overhaul-of-repeating-to-dos/)
- **TickTick**:
  - On mobile, swipe left on a recurring task, then choose "Skip the recurrence" in the date pop-up. On desktop, right-click and use the "Skip the recurrence" icon.
  - You can't modify future occurrences until the current one is done. In the calendar List or Month view, you swipe right, then "Skip this Recurrence".
  - The FAQ may be dated.
  
  — [TickTick Help FAQ](https://help.ticktick.com/articles/7055792921664028672)
- **Habitica**:
  - Dailies can repeat on chosen weekdays or every X days, weeks, months or years.
  - A due Daily not checked by day start costs health and resets that Daily's streak to 0. A Daily that isn't due that day causes no damage and no streak loss.
  - A Mage skill (as described by one reviewer) "freezes" dailies so you aren't penalized.
  
  — [Habitica wiki: Dailies](https://habitica.fandom.com/wiki/Dailies); [Smart Bitches review](https://smartbitchestrashybooks.com/reviews/tech-review-habitica/)
- Habitica GitHub issue #5510: an every-2-days Daily that wasn't due still reset its streak, which shows how fragile "due on" logic is with intervals. It is an old issue. — [GitHub HabitRPG/habitica #5510](https://github.com/HabitRPG/habitica/issues/5510)

### Inferences
- The clean model for Waterline: each task has an anchor, "after last done" (default for maintenance) or "fixed schedule" (e.g. dosing every Mon/Thu). Actions per occurrence:
  - **Done** (date defaults to today, editable to a past date)
  - **Skip** (advances without logging)
  - **Move** (this one only)
  - **Edit rule** (series)
- Only fixed-anchor tasks need the "this one / all future" question. Things shows that after-completion tasks shouldn't ask.
- Late completion should never stack missed occurrences (Todoist rule). The list shows one row per task with "3 days overdue", not three rows.
- Moving one occurrence of a fixed task needs a clear rule for what happens after: Todoist's skip-the-in-betweens caveat shows the risk with long intervals.

### Gaps
- Microsoft To Do, Apple Reminders, Google Tasks and Streaks: searches returned no usable sources on skip or single-occurrence editing. Unconfirmed from training data, so omitted.
- Todoist's drag-to-reschedule in Upcoming and its current "Skip" item aren't confirmed by official docs in what I could reach.

## Temporary intensification: programs, courses, plans (medication, fitness, pest treatment)

### Takeaway
Medication apps model a "course" as a normal schedule with a duration: ongoing vs a number of days (Medisafe's "Days limit"), set under "more options". Tapers are usually entered as consecutive schedules, one per dose step, rather than a built-in taper template. I found no plant or aquarium app with a documented treatment-course feature or "Day 3 of 14" progress display.

### Cited Findings
- Medisafe:
  - Lets you limit treatment duration (described as a "Days limit" for meds taken for a limited time). The schedule is either ongoing or a number of days.
  - Advanced scheduling sits behind "more options" at the bottom of the add-medication screen.
  
  — [Minimalist Journeys: Medisafe review](https://www.minimalistjourneys.com/medisafe-app-review/); [Medisafe tip: adding your medication](https://app.medisafe.com/tips/adding-your-medication-is-easy/)
- No built-in Medisafe taper template was found. A clinical charting tool (not Medisafe) has you enter a taper as sequential schedules, each starting after the previous one. — [NextGen: Create medication taper schedules](https://docs.nextgen.com/en-US/nextgen-behavioral-health-suite-help-5-6-3272291/create-medication-taper-schedules-231619); [ALIS: entering a tapering dose](https://support.alisonline.com/hc/en-us/articles/4402758493197-How-to-Enter-a-Tapering-Dose-Medication)
- Things 3.23's bulk pause, resume and stop of repeating to-dos is the closest to-do-app analogue for starting or ending a temporary regime. — [9to5Mac](https://9to5mac.com/2026/08/19/things-3-23-update-now-available-with-major-repeating-to-do-improvements/)
- Habitica's "freeze" (Mage skill) is a temporary suspension that avoids penalties. — [Smart Bitches review](https://smartbitchestrashybooks.com/reviews/tech-review-habitica/)

### Inferences
- For aquarium treatments (e.g. "dose Seachem ParaGuard daily for 7 days, 25% water change every other day during treatment"), the Medisafe pattern maps onto a task with an end condition: "for N days" or "until date". A temporary interval override on an existing task (water change every 7 days → every 2 days until a date, then back) would cover "temporarily intensify" without creating new tasks. Showing "Day 3 of 7" with an "End early" action is the obvious display. These are design suggestions; I found no source showing an app that does exactly this.
- Tapers (e.g. stepping lights back up, or reducing dosing) are rare enough that sequential steps would do.

### Gaps
- No source found for Medisafe's exact labels, "Day X of Y" display, pause or end-early flow.
- No fitness-program or plant pest-treatment plan UX found.

## Batching: today's routine, complete many at once, quick-complete from notification, week strip, agenda

### Takeaway
Evidence is thin. The documented batch actions are:
- Aquarimate's perform/skip from the watch
- Things' multi-select pause, resume and stop
- Sweepy's "Reset all to clean" and its daily plan that pushes missed tasks to tomorrow or next week

I found no documented "do all due" button in the apps searched.

### Cited Findings
- Aquarimate's dashboard and badges group overdue plus due-today tasks per tank, and the Apple Watch offers perform or skip per task. — [Aquarimate: Tasks & Activities](https://www.aquarimate.com/features/tasks-activities/); [Aquarimate App Store](https://apps.apple.com/my/app/aquarimate/id587215055)
- Sweepy's daily schedule re-prioritizes missed tasks for tomorrow or next week. "Reset all to clean" marks everything done at once. — [Tidied: Sweepy vs Tody](https://www.tidied.app/blog/sweepy-vs-tody); [Tidied: Sweepy review](https://www.tidied.app/blog/sweepy-app-review)
- Things 3.23 can pause, resume or stop multiple repeating to-dos at once. — [AlternativeTo news](https://alternativeto.net/news/2026/8/things-3-23-adds-early-completion-and-flexible-rescheduling-for-repeating-to-dos/)
- Fixed-mode overdue instances should "stack and stay visible", and a separate skip action keeps skips from counting as completions. This comes from a vendor blog, offered as opinion. — [Specivo: Recurring tasks done right](https://specivo.io/recurring-tasks-project-management/)

### Inferences
- A maintenance session often covers several tasks: water change, filter rinse, glass, trim. A multi-select on the due list with "Done today" (one event per task, or one grouped event) fits the "every write writes an events row" rule and the water-change log. Linking "Water change" task completion to the water-change log form (prefilled) mirrors Aquarimate's task→activity link.

### Gaps
- No sources on quick-complete actions in notifications for these apps. Web Push action buttons would be the mechanism, but I found no app documentation.
- No sources on week-strip or agenda layouts specifically for recurring care.

## Research and design writing on recurring-task UX

### Takeaway
I found no Nielsen Norman Group or similar rigorous research on recurring-task UX. The best design rationale available is vendor writing:
- Cultured Code's Things 3.23 post (one occurrence vs the rule, early completion)
- Todoist's help docs (every vs every!)
- vendor blogs (Specivo, Asana guides): keep skip separate from complete, make the anchor explicit in plain language, keep overdue visible

### Cited Findings
- Cultured Code, "Repeating To-Dos, Refined" (Aug 2026): rationale for early completion and the Make Exception / Update Rule fork. — [Cultured Code blog](https://culturedcode.com/things/blog/2026/08/repeating-to-dos-refined/)
- Specivo argues three things:
  - The "sequential" model (next instance created only on completion) hides overdue work and distorts completion metrics.
  - A real **skip** action separate from complete fixes this.
  - Explicit **"Fixed" and "Flexible"** modes are better than an inferred anchor.
  
  — [Specivo](https://specivo.io/recurring-tasks-project-management/)
- A Todoist-focused guide frames `every` for date-bound commitments (rent, standups) and `every!` for chores tied to last-done. — [usecarly.com Todoist guide](https://www.usecarly.com/blog/how-to-set-recurring-tasks-in-todoist/)
- A long-running Zoho community thread shows users of a general to-do app asking for completion-based recurrence ("Recurring Task Based on Completion Date Instead of Due Date"). — [Zoho community](https://help.zoho.com/portal/en/community/topic/recurring-task-based-on-completion-date-instead-of-due-date?page=5)

### Inferences
- The industry consensus to borrow:
  1. two named anchors, explained in plain words
  2. complete early or late without breaking the schedule
  3. skip is distinct from done and visible in history
  4. move-one vs change-rule only where it matters
  5. no stacking of missed occurrences
  6. bulk pause and resume

### Gaps
- No NN/g or academic study found on recurring-task UX. No "consistently early or late → suggest a new interval" pattern was found documented anywhere; it is a possible differentiator but unvalidated.
