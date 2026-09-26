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
- **Parameter presets by tank type:** when creating a tank, pre-select a suggested parameter set for its type, which the user can adjust. Examples:
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

## To do later

-
