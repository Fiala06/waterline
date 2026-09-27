# Ideas & Later

A running list of ideas and nice-to-haves that aren't in the current scope. For planned post-v1 features, see section 10 of [design-brief.md](design-brief.md). When an idea is built it moves to [Done](#done); when part of one is built, that part moves there and the rest stays here.

## Features

- **Expense tracking:** log what's spent on each tank (livestock, plants, equipment, consumables) with totals over time. Buying a saved product again could log its cost.
- **Receipt uploads:** attach a photo or PDF receipt to an expense.
- **Optional AI assistant integration:** beyond copying a tank's summary into a chat, let users connect an AI agent of their choice (off by default) to help diagnose tank issues, e.g. "why is my nitrate climbing?" or "what's causing this algae?" using the tank's readings, events, and photos. Ideas:
  - Make the data AI-friendly: a clean read-only API and/or an MCP server so any agent can read tank history.
  - Per-user opt-in with a user-supplied API key (self-hosted, so no shared keys), and clear control over which tanks/data are shared.
  - Suggestions only; the agent never logs or changes data without the user confirming.
- **More from notes, reminders and custom parameters:** tank notes, one-off tasks and custom parameters exist. Possible extras:
  - Notes as a running, dated list per tank (or pinned notes), not just one text field.
  - Quick "remind me about this tank" one-off reminder straight from the tank page or dashboard.
  - Let custom parameters be saved and reused across tanks.
- **More languages:** translate the app (and emails) beyond English, with a language choice in Settings. Units and date formats already follow user settings; this would add translated text, plus number formats such as a decimal comma.
- **More trends:** beyond runs of rising or falling tests and when a limit would be crossed, point out patterns like "KH drifts down about 1 dKH a week between water changes" or "pH dips after dosing". Could also appear in the digest email, and compare tanks side by side.

## To do later

- **Easier-to-read charts:** the charts are hard to read. Hovering over a line does nothing, and there are no axes saying what's shown.
  - Hover (or tap, on a phone) to see a reading: its value, unit, date and time.
  - Axes that say what's plotted: the parameter and its unit up the side, dates along the bottom.
  - On the dashboard's chart and on Charts alike.
- **Account menu:** a circle with your profile photo in the upper left of the app. Tapping it opens a menu to update your account, sign out and so on.
  - The photo from your Google account, or your initials when there isn't one (as with the local admin login).
- **More from importing History:** columns are matched by their names today. Possible extras:
  - Pick which column is which when a file's names aren't recognized, instead of renaming them in the spreadsheet.
  - One file with several kinds of entry, read from an entry type column, instead of a file per kind.
- **Pet names and photos:** fish and other livestock are pets, so let people name them and keep their pictures.
  - An optional nickname on a livestock entry, shown with the species ("Captain · Betta") on the Livestock tab, the dashboard's "In the tank" and in History ("Captain moved into the tank").
  - Livestock is one entry per species with a count, so let a few animals in a group have their own names (2 of 6 corys), or split a named fish into its own entry.
  - Photos of each pet: a profile photo, plus tagging photos from entries or the Photos page with the pet, so each one has its own gallery.
  - A small page per pet: name, species, photo, date added, notes and its own history.
  - On the public page, names and pet photos only if the owner turns them on.

## Done

- [x] **Parameter presets by tank type** (Sep 25, 2026): new tanks start with their type's parameters and target ranges (freshwater, planted, brackish, reef), and "Reset to defaults" on Parameters & targets applies them again.
- [x] **"Add to home screen" prompt** (Sep 25, 2026): offered on phones from the second visit, dismissible and remembered, never once installed; the browser's install button on Android, Share › Add to Home Screen steps on iPhone, and Install app in Settings.
- [x] **Backdated logs** (Sep 25–26, 2026): every log's date and time can be set to earlier with the date and time picker, or in one tap with 1 hour ago, This morning and Yesterday evening.
- [x] **Import livestock, plants and equipment from CSV** (Sep 26, 2026): "Import from a spreadsheet" on each list, with a template to download and a preview before anything is added.
- [x] **Summary for an AI assistant** (Sep 26, 2026): a tank's readings, care log and stocking as text to copy into any assistant, from its Overview or Export data. Connecting an assistant directly is still an idea above.
- [x] **Saved product links** (Sep 26, 2026): Settings → Products, one tap to reorder, and Reorder when dosing a saved product.
- [x] **Tooltips** (Sep 26, 2026): an ⓘ beside each parameter in the water test and on Parameters & targets, and on tank volume and source water.
- [x] **Spotting trends** (Sep 26, 2026): a note under the dashboard's Trends chart when a parameter has risen or fallen in each of the last 3 or more tests, or its pace since the last water change would cross a target within two weeks ("Nitrate has risen in each of your last 3 tests (8 → 14 ppm) and is on course to pass 20 ppm in about 9 days"); also in the summary for an AI assistant. More kinds of trend are still an idea above.
- [x] **Swimming fish in the logo** (Sep 26, 2026): every minute or two a small fish swims through the water in the sidebar and sign-in logos; never with reduced motion or in a background tab.
- [x] **Importing History from CSV** (Sep 26, 2026): water tests, water changes, dosing, maintenance, observations and notes from a spreadsheet, with a template for each and a preview that flags rows to fix before anything is added. Each row becomes a normal History entry at its own date and time. Columns are found by name (and common other names), units and dates are read the way Settings shows them or as a column names them ("Temperature (°C)"), and the export's water-tests.csv reads back as it is. Any import, the list imports too, can be undone in one step from its toast or its import page. Matching columns by hand is still an idea above.
- [x] **In-app changelog** (Sep 27, 2026): Settings › What's new lists every release, newest first, from `CHANGELOG.md` bundled into the app, so it works offline and matches the running version (now 1.1). After an update the dashboard shows "What's new in 1.1" once, until Got it or See what's new; new accounts don't see it. The Settings footer shows the running version and links there.
