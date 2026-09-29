# Changelog

What's new in Waterline, newest first. The app shows this list under Settings › What's new, and the first lines of a release once on the dashboard after an update, so write for the people who use it.

How to write a line:
- Start with the feature's name in bold, then say in a sentence or two what it does for the keeper and where to find it.
- Link the place it lives: `[Settings › Calendar](/settings#calendar)`, `[Charts](/charts)`. A tank's page is `/tanks/current/…` (such as `/tanks/current/spending`), which opens it for the tank you're on. The line's first link is also where its name leads from the dashboard's What's new. Links to other sites are `https://…`; any other kind is shown as plain text. GitHub's release notes show the words without the in-app links.
- Plain words, no internals: what someone sees and can do, not how it's built.

A release heading is `## <version> · <date>`, with the version in `package.json` (a test checks the newest release matches it). Anything under another heading, like `## Unreleased`, isn't shown.

## Unreleased

- **Google's own logo:** The Sign in with Google button on the sign-in page shows Google's four-color G instead of a plain letter in a circle.

## 1.8.5 · 2026-09-28

- **Server settings, easier to find your way:** [Server settings](/settings/server) now goes in the order you set a server up: sign-in, email, public pages, features, then logs and the version. On a computer its parts are listed in the Settings menu, and on a phone at the top of the page.
- **A link to every section:** Each heading in [Settings](/settings) and Server settings has its own link (#), so a shared address like [Server settings › Species photos](/settings/server#species-photos) opens right at it. Tapping # copies the link.
- **Sign out from your photo:** Sign out is no longer at the bottom of the Settings menu on a computer. It's in the menu under your photo, as it was already.

## 1.8.4 · 2026-09-28

- **Cultivars get their own photo:** A plant like Java fern 'Trident' on the [Plants tab](/tanks/current/plants) shows a photo of that cultivar from Wikimedia Commons, or none until you add your own, instead of the plain Java fern's.
- **Which version you have:** [What's new](/settings/changelog) starts with the version installed on this server and when it came out, and marks its release ✓ Installed.

## 1.8.3 · 2026-09-28

- **Species photos now come in:** In 1.8.2 no plant or animal got its species photo, because of a change in how Wikipedia links its photos. Open the [Plants tab](/tanks/current/plants) or the [Livestock tab](/tanks/current/livestock) and they arrive within a minute.
- **When species photos don't come:** [Server settings](/settings/server) now says how many species photos were found and, when this server couldn't reach Wikipedia, why. Look again now tries straight away, and the reason goes in the Logs too.
- **Google sign-in keeps your tanks:** When the admin first signs in with their Google account, it opens the same account as the local admin login, with all its tanks, instead of a new empty one. If 1.8.2 already made a second account, the next sign-in joins the two. After you save Google sign-in in [Server settings](/settings/server), it tells you to enter your own Google account as the admin's, so Google doesn't turn you away.
- **In range, closer together:** On the [dashboard](/), each reading's value sits right beside its name, instead of across a wide gap next to the next reading.

## 1.8.2 · 2026-09-28

- **Photos of your plants and livestock:** Each plant on the [Plants tab](/tanks/current/plants) and each species on the [Livestock tab](/tanks/current/livestock) now shows a photo: a photo of its species from Wikimedia Commons, with its credit, until you add your own. Add yours from the plant's card, or open one in [Photos](/photos) and choose Use as the photo for. An admin can turn species photos off in [Server settings](/settings/server).
- **In range, easier to see:** On the [dashboard](/), the readings that are fine sit in a card like Needs attention, each with its ✓ and its unit, instead of fading into the page.

## 1.8.1 · 2026-09-28

- **Add several at once:** Stocking a tank? On the tank's [Livestock](/tanks/current/livestock/several) or [Plants](/tanks/current/plants/several) tab, choose Add several, search the species list and tick everything that's going in, with a count for each fish and invert, or where each plant goes, then add them all in one go. Undo takes the whole lot back.
- **Import spending:** Bring in past purchases from a spreadsheet (date, what, amount, category and a note) on the tank's [Spending tab](/tanks/current/spending) with Import from a spreadsheet, with a template and a preview first. Undo takes the import back.
- **Fix an import's words on the page:** When a spreadsheet uses a word Waterline doesn't know, like "New" or "Struggling" for a plant's status, the preview lists each one with how many rows have it. Choose what it means and every row with it is fixed, with no need to change the file and start again. For livestock, plants and spending, from [Livestock](/tanks/current/livestock), [Plants](/tanks/current/plants) or [Spending](/tanks/current/spending).
- **Floating plants:** Water lettuce, frogbit and other plants on the surface can be Floating, with their own group at the top of the tank's [Plants tab](/tanks/current/plants). Spreadsheets can say Floating too.
- **Import, in the same place:** Import from a spreadsheet is below the list on every tab, and below the empty box when there's nothing yet.

## 1.8.0 · 2026-09-28

- **Dosing and feeding routines:** Save what you dose and feed, how much and when, like "Thrive S, 1 pump, Mon, Wed, Fri" or "Micro pellets, 2 pinches, every day". They're on the tank's [Overview](/tanks/current) under Routines, and in [Tasks](/tasks) and the dashboard's Due list; tap Done and the dose or feeding is logged in [History](/history), with Undo if you tapped too soon. Routines remind you on the day, not days ahead.
- **Tank settings from the dashboard:** A gear button at the top of the [dashboard](/) opens the tank's [settings](/tanks/current/settings), for its name, volume, photo and more.
- **Exact tank sizes:** A 2.5 gallon tank now shows as 2.5 gal on the dashboard, in Tanks and everywhere else, instead of being rounded to 3.
- **Tasks on set days:** Any task can repeat on chosen days of the week, like every Sunday, with On days when you [add a task](/tasks/new).

## 1.7.0 · 2026-09-28

- **Push notifications:** Get task reminders, overdue alerts and out-of-range alerts on your phone or computer, even with Waterline closed, with Mark done and Snooze right on the notification. Turn it on for each device in [Settings › Notifications](/settings#push), or use the [ntfy](https://ntfy.sh) app instead. Each kind of notice has its own Email and Push switches, so you can have alerts pushed and the digest by email. On iPhone, add Waterline to your Home Screen first.

## 1.6.1 · 2026-09-28

- **What's new links to each feature:** Each line in [Settings › What's new](/settings/changelog), and on the dashboard after an update, now says where the feature lives and links straight to it. A link to a tank's page opens it for the tank you're on.
- **Nothing missed after skipping updates:** If you update past a few versions at once, the dashboard's What's new card covers everything since you last looked, not just the newest release.
- **What's new, easier to scan:** [Settings › What's new](/settings/changelog) shows the newest releases in full and folds older ones away by version; tap one to read it. An admin several versions behind sees the newest three in the update note, with the rest on GitHub.

## 1.6.0 · 2026-09-28

- **A fresh dashboard:** Your tank's photo now runs across the top of the [dashboard](/), with its name on it, and the first thing you see is what needs attention: readings out of range or near a limit, each with a small line of recent readings against its target, and the water change once it's due. Everything that's fine sits below in a compact list; tap any reading for its chart. To change the photo, open one in [Photos](/photos) and choose Set as cover.

## 1.5.0 · 2026-09-28

- **Tasks in your calendar:** See your tasks in Google Calendar, Apple Calendar or Outlook, each on the day it's due, with overdue ones on today. Make a private link in [Settings › Calendar](/settings#calendar), for all your tanks or just one, and add it to your calendar app; it keeps itself up to date.

## 1.4.4 · 2026-09-28

- **Quick add, tidier:** In Quick add (the + button), the other kinds of entry and importing are one grid of matching tiles, each with its icon, and the time shows beside the tank, so you can see when an entry will be logged.

## 1.4.3 · 2026-09-27

- **Steps for each assistant:** [Settings › AI assistant](/settings/assistant) has step-by-step instructions for claude.ai (and Claude Desktop and mobile), ChatGPT, Claude Code and other apps, with the address to copy.

## 1.4.2 · 2026-09-27

- **Connect claude.ai or ChatGPT by signing in:** Add Waterline as a custom connector with your server's address; you'll sign in to Waterline and pick the tanks it can read, with nothing to copy. It then shows in [Settings › AI assistant](/settings/assistant), where you can disconnect it at any time.

## 1.4.1 · 2026-09-27

- **Chart markers, easier to tap:** On [Charts](/charts) and the dashboard, the water change and dose markers are easier to tap, always open the one you meant, and work with the keyboard and screen readers.

## 1.4.0 · 2026-09-27

- **Connect an AI assistant:** Ask Claude, ChatGPT or another assistant about your tanks. It can read the readings, History, livestock and photos of the tanks you choose, and can't change anything. Set it up in [Settings › AI assistant](/settings/assistant); Waterline stores no AI keys.
- **Spending:** See what each tank costs: this month, this year and all time, by category, and month by month. Open the tank's [Spending tab](/tanks/current/spending) and choose Add expense. Buying a saved product again? Log it in one step from [Settings › Products](/settings/products). Your currency is in [Settings › Units](/settings#units).
- **Receipts:** Attach a photo or PDF receipt when you [add an expense](/tanks/current/spending/new). Receipts are part of your [backup](/settings/export).
- **More trends:** The [dashboard](/) points out what keeps happening, like "KH drifts down about 1 dKH a week between water changes" or "pH dips about 0.2 after dosing Excel", and only when it happens most times. The daily or weekly digest email lists them under Worth a look ([Settings › Notifications](/settings#notifications)).
- **Compare tanks:** Under the chart in [Charts](/charts), see the same parameter in your other tanks over the same dates.
- **Notes on the tank's page:** The tank's [Overview](/tanks/current) shows its pinned note and the latest notes, with Add note right there.
- **Remind me:** A one-off reminder about a tank in two taps (tomorrow, in 3 days, next week, in 2 weeks, or a date), from the dashboard's Due list or [the tank's page](/tanks/current/remind).
- **Custom parameters, again:** Adding a custom parameter in the tank's [Targets](/tanks/current/targets) offers the ones you made for your other tanks, with their unit and targets.
- **Where it came from, editable:** An animal's page on the [Livestock tab](/tanks/current/livestock) has its Source (the store or breeder), to fix or fill in later.

## 1.3.0 · 2026-09-27

- **Pet names and photos:** Give any animal a name on the [Livestock tab](/tanks/current/livestock). Naming one of a group gives it its own entry ("Pepper · Corydoras") and a page for its profile photo, notes, history and every photo it's in. Tag pets in any photo in [Photos](/photos) under In this photo. Public pages show the species only, and hide photos with pets in them, unless you turn on Pet names and photos in the tank's [Public page](/tanks/current/public) settings.
- **Importing, easier:** When a spreadsheet's columns have other names, pick which is which on the preview instead of renaming them. One file can also hold several kinds of entry, with a Type column saying what each row is. Start from [History](/history) or [Settings › Import & export](/settings/export); every import can be undone in one step.
- **Your own profile photo:** Add one from your camera or photos in [Settings › Profile](/settings#profile), with a preview before it's saved. Signing in with Google doesn't replace it; Use my Google photo switches back, and Remove photo shows your initials.

## 1.2.0 · 2026-09-27

- **Works behind more proxies:** Signing in no longer ends in *502 Bad Gateway* when Waterline runs behind nginx, such as Nginx Proxy Manager, with its default settings.
- **Account menu:** Tap your profile photo or initials in the top corner for [Settings](/settings), What's new and signing out.
- **Logs for troubleshooting:** [Settings › Server settings › Logs](/settings/server/logs) shows what went wrong, like emails that didn't send, imports that couldn't be read and sign-in problems. A page that fails shows a reference to look up there, and you can download the log to share.
- **Easier-to-read charts:** [Charts](/charts) show the parameter and its unit up the side and dates along the bottom. Hover or tap the line, or use the arrow keys, to see a reading's value, status, date and time.

## 1.1.0 · 2026-09-27

- **Import History from a spreadsheet:** Bring in past water tests, water changes, doses, maintenance, observations and notes, with a template for each and a preview before anything is added. Start from [History](/history), Quick add or [Settings › Import & export](/settings/export); any import can be undone in one step.
- **Import livestock, plants and equipment:** From a spreadsheet, on the tank's [Livestock](/tanks/current/livestock), Plants and Equipment tabs.
- **Latest readings in one row:** On a computer, the [dashboard](/) shows every reading in one row, each with a small line of its recent readings. Hover a short name like NH₃ to see the full name.
- **Spotting trends:** A note under the [dashboard](/)'s chart when a reading has risen or fallen in each of your last tests, or is on course to pass its target.
- **Faster water tests:** On a [water test](/entries/test/new), Use last readings fills in your previous test, Also log a water change saves both at once, and you can add a parameter without leaving the test.
- **Quicker backdating:** The date and time picker offers 1 hour ago, This morning and Yesterday evening.
- **Saved product links:** Keep links to what you buy again in [Settings › Products](/settings/products): one tap to reorder, and a Reorder link when you dose one.
- **Tips:** An ⓘ beside each parameter, and beside a few less obvious fields, explains what it is.
- **Summary for an AI assistant:** A tank's readings, care log and stocking as text to paste into a chat, from the tank's [summary](/tanks/current/summary) or [Settings › Import & export](/settings/export).
- **Easier to set up:** A new server needs only its address. The first page asks for a setup code from the server's log; Google sign-in, who can sign in, the admin's login and a few switches are in [Settings › Server settings](/settings/server).
- **What's new:** This list, in [Settings › What's new](/settings/changelog), and a note on the dashboard after each update.
- **Smaller things:** A log entry you leave unsaved is kept for when you come back; species search finds the names people use; saving works with ad blockers turned on; new category icons, with one for plants; and now and then a small fish swims through the logo.

## 1.0.0 · 2026-09-26

- **First release:** Log water tests at the tank and see each parameter against its target at a glance on the [dashboard](/).
- **Tanks:** Each with its own parameters and targets, set up for freshwater, planted, brackish or reef, in [Tanks](/tanks).
- **History, charts and photos:** Everything logged, in [History](/history), [Charts](/charts) and [Photos](/photos): tests, water changes, dosing, maintenance, livestock, equipment, observations and notes.
- **Tasks and reminders:** Water changes and upkeep in [Tasks](/tasks), with email one at a time or in a daily or weekly digest, and alerts when a reading is out of range ([Settings › Notifications](/settings#notifications)).
- **Livestock, plants and equipment:** For each tank, on its [Livestock](/tanks/current/livestock), Plants and Equipment tabs, with a built-in species list.
- **A public page:** Share a tank from its [Public page](/tanks/current/public) settings, and share single photos from [Photos](/photos).
- **Your data and the app:** A full backup or a CSV of water tests in [Settings › Import & export](/settings/export), and an app for your home screen that logs offline and syncs later.
