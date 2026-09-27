# Ideas & Later

A running list of ideas and nice-to-haves that aren't in the current scope. For planned post-v1 features, see section 10 of [design-brief.md](design-brief.md).

## Delight / polish

- **Swimming fish in the logo:** every so often, a small fish swims through the logo. Keep it subtle and occasional, not constant. Respect `prefers-reduced-motion` (no animation when it's set).

## Features

- **Tooltips:** short explanations on hover/long-press for parameters, units, and less obvious controls (e.g. what KH means, why nitrite matters).
- **Expense tracking:** log what's spent on each tank (livestock, plants, equipment, consumables) with totals over time.
- **Receipt uploads:** attach a photo or PDF receipt to an expense.
- **Saved product links:** keep links to products the user buys regularly (e.g. Seachem Prime on Amazon) for quick reordering. Could tie into dosing events and expenses.
- **Backdated logs:** when adding any log, allow picking a different date/time for entries logged after the fact. The brief (5.4, 5.6) already has an editable date/time; make sure it's quick to change, e.g. shortcuts like "1 hour ago", "This morning", "Yesterday".
- **Optional AI assistant integration:** let users connect an AI agent of their choice (off by default) to help diagnose tank issues, e.g. "why is my nitrate climbing?" or "what's causing this algae?" using the tank's readings, events, and photos. Ideas:
  - Make the data AI-friendly: a clean read-only API and/or an MCP server so any agent can read tank history.
  - Per-user opt-in with a user-supplied API key (self-hosted, so no shared keys), and clear control over which tanks/data are shared.
  - Suggestions only; the agent never logs or changes data without the user confirming.
- **Parameter presets by tank type:** *(built: new tanks get their type's preset; "Reset to defaults" on the targets page applies it)* when creating a tank, pre-select a suggested parameter set for its type, which the user can adjust. Examples:
  - Freshwater: pH, ammonia, nitrite, nitrate, GH, KH, temperature.
  - Planted: freshwater set + CO2, iron, phosphate, potassium.
  - Brackish: freshwater set + salinity/specific gravity.
  - Reef/saltwater: salinity/specific gravity, alkalinity, calcium, magnesium, phosphate, nitrate, ammonia, pH, temperature.
  - Presets could also supply sensible default target ranges per type.
- **Custom tank notes, one-off reminders, custom parameters:** already in the brief (tank notes field in 5.8, one-off tasks in 5.12, custom parameters in 5.8). Possible extras:
  - Notes as a running, dated list per tank (or pinned notes), not just one text field.
  - Quick "remind me about this tank" one-off reminder straight from the tank page or dashboard.
  - Let custom parameters be saved and reused across tanks.
- **"Add to home screen" prompt on mobile:** the brief already makes the site an installable PWA; add a friendly prompt offering to install it as a phone app shortcut.
  - Android/Chrome: use the browser's install prompt (`beforeinstallprompt`) behind an "Install app" button.
  - iPhone/Safari: no automatic prompt exists, so show short instructions ("Tap Share, then Add to Home Screen").
  - Don't nag: show it after sign-in or a second visit, make it dismissible, remember "not now", and never show it once installed.
  - Also offer an "Install app" option in Settings.

- **More languages:** translate the app (and emails) beyond English, with a language choice in Settings. Units and date formats already follow user settings; this would add translated text, plus number formats such as a decimal comma.
- **Spotting trends:** go beyond the Charts screen by pointing out patterns automatically, e.g. "Nitrate has risen in each of your last 4 tests", "KH drifts down about 1 dKH a week between water changes", or "pH dips after dosing". Could appear as a note on the dashboard and in the digest email, and compare tanks side by side.

## To do later

- **In-app changelog:** a "What's new" list in the app, so people see what changed after an update.
  - A Changelog page under Settings (the footer's "Waterline v1.0 · self-hosted" could link to it), newest release first, with version, date and a few plain-language lines each.
  - After an update, show a small dismissible "What's new in 1.1" card or sheet once, then remember it was seen.
  - Bundle it with the app (e.g. from a `CHANGELOG.md` at build time) so it works offline and matches the running version.
- **Bulk import from CSV:** bring in past water changes, water tests and other entries from a spreadsheet or another app, instead of logging them one at a time.
  - Upload a CSV, match its columns to Waterline's fields (date, entry type, amount, one column per parameter), and preview the rows with any problems flagged before importing. Each row becomes a normal History entry.
  - Offer a template per entry type, and make the export's CSV import back unchanged.
  - Read units and dates the way the person's settings show them, and let the whole import be undone in one step.
- **Pet names and photos:** fish and other livestock are pets, so let people name them and keep their pictures.
  - An optional nickname on a livestock entry, shown with the species ("Captain · Betta") on the Livestock tab, the dashboard's "In the tank" and in History ("Captain moved into the tank").
  - Livestock is one entry per species with a count, so let a few animals in a group have their own names (2 of 6 corys), or split a named fish into its own entry.
  - Photos of each pet: a profile photo, plus tagging photos from entries or the Photos page with the pet, so each one has its own gallery.
  - A small page per pet: name, species, photo, date added, notes and its own history.
  - On the public page, names and pet photos only if the owner turns them on.
