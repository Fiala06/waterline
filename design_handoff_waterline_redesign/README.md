# Handoff: Waterline redesign (desktop workspace + phone)

Repo: `Fiala06/waterline` (SvelteKit), branch `main`. Live: https://waterline.fiala06.com

## Overview
A restructure of Waterline's layout and flow. The desktop app becomes a **tank workspace**: a left sidebar of tanks plus app-wide destinations, and per-tank tabs (Overview, Charts, History, Photos, Livestock, Plants, Equipment, Spending, Setup). Logging is one keystroke or click away from anywhere. Settings and the admin Server area are reorganised into clear sections. A phone layout maps the same model onto a bottom tab bar and bottom sheets.

## About the design files
The files in this bundle are **design references built in HTML**: prototypes showing the intended look and behaviour. They are **not production code to copy**. Recreate them in the existing SvelteKit codebase, using its routes, components (`src/lib/components/*`), stores and server code. Where this README and the prototype disagree with real data rules in the repo (validation, permissions, units), the repo wins. Flag the conflict instead of copying the mock.

Open the `.dc.html` files directly in a browser; they need `support.js` and `_ds/…/styles.css` next to them, as bundled. All demo data is hard-coded in the logic class at the bottom of `Waterline App.dc.html`. Its object shapes (`TANKS`, `params`, `tasks`, `livestock`, `equip`, history entries) are a useful spec for each screen's view model.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and interactions are final. Match them closely, using the codebase's existing primitives where they exist (TrendChart, Sparkline, TaskList, QuickAdd, etc.). Restyle those components to this spec rather than replacing them.

---

## Design tokens
Source: `_ds/modernist-…/styles.css` (the "Modernist" system). It has sharp corners everywhere, hard 2px rules, red used sparingly as the one accent, and Archivo throughout.

### Colours (light)
| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#f3f2f2` | page, panels |
| `--color-surface` | `#eae9e9` | selected rows, insets, sidebars of detail panes |
| `--color-text` | `#201e1d` | ink, 2px section rules, primary dark fills |
| `--color-accent` | `#ec3013` | primary buttons, active tab underline, ✕ states, focus |
| `--color-accent-700` | `#ae1800` | red **text** (passes 4.5:1 on bg) |
| `--color-divider` | `#201e1d` @ 40% | 1px row dividers, 2px column rules |
| neutral 100–900 | `#f8f4f4 #eae7e7 #d7d3d3 #bab6b6 #9b9797 #7d7979 #605d5d #444141 #2d2b2b` | 300 = chart target bands, 700 = secondary text, 800 = tertiary emphasis |
| accent 100–900 | `#fff2ef #ffe0d9 #ffc4b8 #ff9783 #ff563c #dd2b0f #ae1800 #7c1405 #4d170e` | |

### Colours (dark): override set applied to `:root`
`--color-bg #161514`, `--color-surface #22201f`, `--color-text #f0eeed`, `--color-divider` = `#f0eeed` @ 32%.
Neutrals 100→900: `#2a2827 #33302f #3d3a39 #57534f #7d7979 #9b9797 #bab6b6 #d7d3d3 #0b0a0a`.
Accent 100/200/300/600/700/800/900: `#3a140d #4d170e #7c1405 #ff563c #ff9783 #ffc4b8 #ffe0d9` (700 flips light so red text stays readable).
Shadows: `sm 0 1px 2px rgba(0,0,0,.5)`, `md 0 3px 10px rgba(0,0,0,.55)`, `lg 0 12px 32px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.06)`.
The theme choice is Light / Dark / System (follows `prefers-color-scheme`), stored per user. Print output is always light.

### Type
- Family: **Archivo** (heading weight 800, body 400/600/700/800). Use `font-variant-numeric: tabular-nums` app-wide.
- Scale used: page title 42/800 (tank name), section h3 ≈ 22/800, card titles 17–20/800, body 14–15, secondary 13, meta 12.
- Kicker/label: 11px, uppercase, letter-spacing 0.08em, neutral-700.
- Big readings: 22–28/800 with a 11px unit in neutral-700.

### Spacing, radius, elevation
- Spacing: 4 / 8 / 12 / 16 / 24 / 32. Page gutters are 32px desktop and 20px phone.
- Radius: **0 everywhere** (`--radius-*: 0`).
- Shadows: `sm 0 1px 2px #2d2b2b@14%`, `md 0 3px 10px @16%`, `lg 0 12px 32px @22%`. `lg` is used for popovers, dialogs, and the sidebar when it floats over content.
- Section pattern: a heading, then a **2px `--color-text` rule**, then rows separated by **1px divider**. Columns are separated by a 2px divider-coloured rule, not cards.

### Status language (used everywhere: never colour alone)
- `✕` = out of range / overdue / error, shown in accent-700 text or an accent tag.
- `▲` = near a limit / due soon / warning, shown in neutral-800 bold.
- `✓` = in range / done. `●` = on / live. `○` = off.
- "Near" = within 10% of the target span from either edge (low edge only when `lo > 0`).

---

## App shell (desktop)
`min-width: 900px` (below that the page scrolls sideways). The shell is a flex row: sidebar, then main.

### Sidebar
- Width **248px** when pinned, **64px** rail when auto-hidden. Width transitions over 160ms. When auto-hidden, hovering expands it to 248px **over** the content with `shadow-lg` (the content doesn't move).
- Pinned state is stored per user. It defaults to auto-hide when the window is < 1200px and the user hasn't chosen. The `[` key toggles it. The toggle button sits at the top; its title is "Auto-hide menu [" or "Keep menu open [".
- Contents, top to bottom:
  1. Logo.
  2. Search button (opens ⌘K).
  3. **Tanks list**, each row 48px with a thumbnail, name and a status glyph. The active row has a surface background and a 3px accent left bar. The list always shows at least 3 rows (min-height); beyond that the list scrolls, and a "+N more · scroll or see all" link appears until it's scrolled to the end.
  4. "+ Add tank".
  5. App-wide links (44px rows): Tanks, Tasks (with an "N overdue" accent tag only when > 0), Alerts (bell with an unread count), Settings.
  6. Footer: an avatar and name, with "Waterline vX" beneath. When an update is available, the avatar gets a 16px red "↑" badge at the top right, visible even in rail mode. The line under the name becomes the link **"↑ Update to 1.9.2"**, which opens Settings › What's new.
- In rail mode, labels fade to opacity 0 over 120ms (`white-space: nowrap`, overflow hidden).

### Tank header (inside main)
- Padding 28px 32px 0, `flex-wrap: wrap`.
- Left: a kicker meta line, then the tank name at 42/800 with ellipsis. The meta line is built from parts joined with " · ": type, "{vol} gal" (omitted if blank), "Day {n}", last test. It is never shown as "? gal".
- Right actions, in order:
  - **Get help** (ghost, accent text).
  - **Log water test**, a primary split button: the main part logs a test (hint key "T"); the ▾ part lists the other log types.
  - **More ▾** (secondary, menu icon).
- The **More menu** is 280px wide with a 2px ink border and `shadow-lg`. Each item has a 14/700 title and a 12px subtitle:
  - Get help: copy a summary
  - Print or save as PDF
  - Share with someone
  - Export this tank
  - Public page
  - divider
  - Review tank setup
  - divider
  - **Archive tank** (accent-700, undoable)
- At narrow widths the actions wrap below the title; the cover thumbnail sits left of the title.
- **Tabs**: margin 24px 32px 0, a 2px divider bottom border, 14px labels with counts (Photos 34, Livestock n, …). The active tab has a 2px accent underline, accent colour and weight 800. The gap is 28px, then 22px when the main area is < 1000px, then 18px below 780px. Tabs scroll horizontally with a 48px fade mask when the main area is < 900px.

### Global overlays
- **⌘K / `/` command palette**: tanks, tabs, and actions such as Log test, Water change, Print, Share, Add several livestock, Get help, Theme, Alerts, Review setup and Keyboard shortcuts, each with its shortcut shown.
- **`?` Keyboard shortcuts** sheet:
  - Anywhere: ⌘K, /, ?, [, Alt↑/↓ (previous/next tank).
  - Go to: G then O/C/H/P/L/E/S.
  - Log: T test, W water change, D dose, N note.
  - ⌘↵ saves any open form; ⌘P opens the report; Esc closes the top overlay.
  - Shortcuts are ignored while typing in a field.
- **Alerts panel** (from the bell): out-of-range readings, overdue tasks and update notices, each clickable to its target, with Mark all read.
- **Undo toast**: bottom-centre, ink background, about 6s. Every destructive action (delete entry, delete photo, archive, remove person, snooze, skip, bulk add, set count to 0) shows "… · Undo". Esc dismisses.

---

## Screens

### 1. Tanks (all tanks)
A grid of tank cards, `repeat(auto-fill, minmax(260px,1fr))`, gap 24. Each card has a cover photo, name 22/800, a spec kicker, a status tag ("✕ N need attention", accent; or "✓ All in range", neutral), a next-task tag and a meta line. An Archived section follows, with Restore. The Add tank wizard has the steps type, size, water and targets preset.

### 2. Overview (tank)
Grid of 3 equal columns, with rules between them.
- **Needs attention** (span 2): rows of `minmax(0,1fr) 150px 120px` holding the name with status, a sparkline, and the big value. Clicking a row opens Charts for that parameter. Overdue tasks also appear here, with **Done**. When there are no tests yet: "No tests yet". When there are tests but nothing is wrong: "All clear".
- **Due** (column 3): the next tasks, with Mark done.
- **In range** (span 2): a 4-column grid of ✓ readings (3 columns when narrow). Its header reads "✓ 8 of 11", or "No readings yet" if there are none.
- **Recent** (column 3): the last history entries; each is clickable.
- Below 780px of main width, the layout collapses to one column; the side sections get a top rule instead of a left rule.

### 3. Charts
Columns of `168px | 1fr | 260px`.
- **Left**: the parameter list, each with its status glyph.
- **Centre**: the chart.
  - Labelled **Y axis** ("Nitrate (ppm)", rotated), Y tick values, and a labelled **X axis** ("Date") with date ticks.
  - The target band is a neutral-300 rect, with the target lines labelled.
  - Out-of-range points are filled accent. The line is ink, 2px.
  - Hovering or dragging shows a crosshair and a tooltip (value, date, "✕ 15 over target"). Clicking a point opens that test in History.
  - Range control: 30 days / 90 days / 1 year.
- **Right**: stats (Average, Range, In target, Change), a written insight, and links to related entries.
- Below 1000px main width, the layout becomes `150px | 1fr`, and the stats move under the chart as a 2-column grid.

### 4. History
Columns of `160px categories | minmax(352px,1fr) list | 300px detail`.
- **Categories**: All, Tests, Water changes, Dosing, Maintenance, Livestock, Plants, Notes, each with a count.
- **List**: grouped by day, with a 40px icon tile, title 15/700, subtitle 12 (out-of-range in accent-700 bold) and an optional photo thumbnail.
- **Detail pane**: a surface background with the rows, note, photos, and Edit / Delete (Delete is undoable).
- The empty state reads "Nothing logged here yet" and explains what will show up, with a **Log water test** button. With a category filter on, it suggests switching to All. Edit and Delete are hidden in the empty state.
- When narrow, the categories become a `<select>` in the toolbar.

### 5. Photos
A month-grouped grid. Hovering a photo shows a larger preview. Clicking opens a lightbox with prev/next (arrow keys), date and angle, **Set as cover** and **Delete** (undoable). Upload can be done by dropping files or using the button.

### 6. Livestock / Plants
- **Livestock** table: `minmax(0,1fr) 60px 72px 160px 120px`, holding name/scientific name, count, type, added date and status (✓ In tank / ▲ Quarantine with "Move to tank").
  - Count changes are made inline with − / +. The edit is shown as "Not saved yet", with a question about why (Loss / Sold / Moved / Added). **Loss is a choice, not a confirmation**: the explicit Save button records it.
  - Setting a count to 0 moves the species to **Past livestock**, with Restore.
  - The right column (240px) has totals and recent changes.
- **Add several** dialog (760px):
  - Modes: "One per row" or "Paste a list".
  - Rows: species name with datalist autocomplete (shows the scientific name, or "Your own name · no care ranges"), a − n + stepper, a Fish/Invert/Coral type select, and remove. The dialog opens with 3 empty rows; "+ Add row" adds more.
  - Paste parsing accepts `6 Neon tetra`, `Otocinclus x 5` and `Amano shrimp, 3`, and shows a "Read as" preview with "Edit as rows ›".
  - Shared fields: Where (In tank / Quarantine) and From (optional).
  - If a species is already in the tank, a ▲ warning says it'll be added to the existing count.
  - The save button reads "Add 4 species · 15 animals" (⌘↵). Saving creates one History entry and is undoable.
- **Plants** columns: `1fr 100px 120px 90px 170px 110px`. Trim and melt status are shown in each row.

### 7. Equipment
Cards showing type, name, specs tags, meta, and **Log service**. A user-uploaded photo is used as the card's cover (`background-size: cover`). The detail page has its specs, service history, an attached task, and photo upload/replace.

### 8. Spending
Entries by category with receipts, totals by month and category, and CSV import.

### 9. Setup (tank)
Left nav (200px), then content (max-width 880).
- **Details**: cover, type, volume (nominal and actual water), dimensions, brand/model, substrate, water source, photoperiod.
- **Parameter targets**: each parameter has on/off, lo/hi and a unit. Presets come from the tank type.
- **Reminders**: per-task cadence.
  - Repeat (every N days/weeks, specific weekdays) or **One time** (date only; the repeat controls hide).
  - Cadence allows "every 1 day", "every 2 days", and so on.
- **Public page**: on/off, slug, which sections show, searchable, preview as visitor.
- **Sharing**: see screen 13.
- **Setup review**: a checklist that walks details, equipment (with "serviced"), targets and livestock. Completing it updates "Last reviewed", shows a toast, and returns.
- **Archive**.

### 10. Tasks (app-wide)
Sections Overdue / Due soon / Later, across all tanks. Each row has its name, tank and cadence, the when (✕/▲), **Done**, and **Snooze ▾** (on tasks due within 1 day).
- **Snooze menu** (260px): Later today (Tonight, 6 PM), Tomorrow, In 2 days, This weekend, Next week (each shows its date), and Pick a date (date input, min tomorrow).
- Below a divider: **Skip this one**, with the subtitle "Next one {date}" (computed from the cadence).
- Snooze and skip both move the task and are undoable.
- Selecting a task opens a side pane for editing.

### 11. Log dialogs (T / W / D / N / More)
A dialog with the type segmented at the top, then "When" (defaults to now, editable).
- **Test**: one row per tracked parameter. Each value is flagged as you type (✓ / ▲ / ✕), and a warning summary is shown before Save. The button reads "Save · N readings".
- **Water change**: percent or gallons (they convert into each other) and a "Conditioner dosed" checkbox. If a water-change task is overdue, the dialog says "Saving this completes the overdue task …".
- **Dose**, **Note** (with photos), and **Maintenance** (equipment picker).
- After saving, a toast shows a link to the entry.
- The dialog uses `max-height: calc(100vh - 32px)` and scrolls inside.

### 12. Tank report (print / PDF): ⌘P, ⋯ menu, palette
A full-screen overlay: a 300px options column, then the preview.
- **Options**:
  - Covering: 30 days / 90 days / 1 year.
  - Include checkboxes, each with a count: Needs attention, Water parameters, Care log, Livestock & plants, Equipment, Maintenance schedule.
  - An optional note.
  - "Print or save as PDF", and a page estimate.
- **Page**: 816px wide (Letter), padding 56/60, always light colours.
  - Header: tank name 34/800, meta kicker, logo, and range ("Last 90 days · printed …").
  - Note callout, styled with a 3px accent left border.
  - 4-up stats: In range, Needs attention, Water tests, Water changes.
  - Parameter table `1fr 92px 70px 112px 74px 130px`: name, target, latest, status, low–high, and a sparkline with the target band.
  - Care log `86px 110px 1fr`.
  - Two columns: Livestock & plants, and Equipment.
  - Schedule, then a footer.
- The preview scales with `zoom` to fit narrow windows.
- **Print CSS**: `@page { size: letter; margin: .5in }`. Hide everything except `[data-print-root]`, and use `break-inside: avoid` on rows.

### 13. Sharing (Setup › Sharing)
- Intro: "Let someone help look after {tank}… Only you can change setup and targets, or archive the tank."
- **Invite** box (2px ink border):
  - Email, role (Can log care / Can view), and Send invite. Send invite is disabled for an invalid or duplicate email.
  - Role help text: "Can log" = tests, water changes, dosing, notes, photos and task done. "Can view" = read-only and no email.
  - "Copy invite link". Anyone with the link can ask to join and the owner approves them; links expire in 7 days.
- **People with access · N** (rows `36px 1fr 170px 90px`):
  - Owner first.
  - Each member shows a role select and Remove (undoable).
  - Pending invites show "Invited today · hasn't joined yet", Resend and Cancel.
- **Reminders & alerts**:
  - Task reminders go to: Everyone who can log / Only me. Whoever marks a task done clears it for everyone.
  - Out-of-range alerts go to: Everyone / Only me.
- Once a tank is shared, History shows who logged each entry.
- The Setup nav shows the member count.

### 14. Get help: tank summary (header button, ⋯ menu, Settings › Export "Summary to share")
- The dialog is 820px wide. Its copy is deliberately **not AI-only**: "…into a forum post, a message to a friend or your fish store, or an AI chat. … Waterline doesn't send it anywhere."
- **Format**: Forum / AI (Markdown: headings and tables) or Plain text (UPPERCASE section titles, bullet rows).
- **Covering**: 30 days / 90 days / 1 year. From Export, a tank picker is also shown.
- Lines and characters count, **Download** (.md/.txt), and **Copy summary**. Copying gives "✓ Copied" and the toast "Copied. Paste it with your question."
- **Content** (see `aiSummaryText()` in the prototype; mirror `src/lib/server/summary.ts`): Tank facts; Water parameters table (target, latest, status, last 4/8/12 readings); Trends; Care log; Livestock; Plants; Equipment; Maintenance schedule.

### 15. Settings
Left nav (200px), then content.
- **Profile**, **Units**, **Notifications** (email/push per kind, digest time).
- **Calendar** feed.
- **Appearance**: theme Light/Dark/System.
- **Products**.
- **Import & export**: scope (one tank / whole account); format (Full backup .zip, CSV, Summary to share); a build progress bar with steps; then download. Import is a CSV mapping preview with skip-row toggles.
- **AI assistant** (MCP).
- **Server** (admin only).
- **What's new**: the changelog, with Update now.
- **Account**.

### 16. Settings › Server (admin)
Header "Server" with an **ADMIN** tag and "Self-hosted at … · v1.9.1".
Sections are a **grid of buttons** (`repeat(auto-fill, minmax(150px,1fr))`, 44px min-height, 1px divider grid). The active section is filled accent with white text. Badges: Features "↑ 1.9.2", Users count, Logs "✕ N" errors.
- **Sign-in**:
  - **Google sign-in**: status (● On / ○ Off with a reason); Client ID, validated as `*.apps.googleusercontent.com`; Client secret (password field, "Saved · paste a new secret to replace it"); Authorized redirect URI `https://{host}/auth/callback/google`, shown read-only with Copy; Save.
  - **Who can sign in** (radio list): Only the admin / People on a list (textarea, one email or `@domain` per line) / Anyone with a Google account. Plus the admin's Google account.
  - **Local admin login**: username, new password and repeat, with "✕ The passwords don't match."
- **Email**:
  - A status box with **Send test email**.
  - Send with: Mailgun / SMTP.
  - Mailgun: API key, sending domain, region US/EU.
  - SMTP: server, port, username, password, Use TLS toggle ("Port 465 connects with TLS; other ports require STARTTLS").
  - Sender.
- **Chat alerts** (new):
  - Discord, Slack and ntfy webhook URLs, each validated (`discord.com/api/webhooks/…`, `hooks.slack.com/…`, `https://host/topic`). Each has a status (Not set up / ✕ Check the address / ● On / ✓ Test delivered) and Send test.
  - "What to send" toggles: Errors, New sign-ups (off by default), Backup failed, Update available, Email delivery problems.
- **Public & analytics**:
  - Toggles: Public tank pages / Let search engines index them / Sitemap & robots.txt.
  - Public site URL.
  - **Google Analytics 4 measurement ID**, validated `^G-[A-Z0-9]{4,16}$`; empty turns it off. It counts public pages only.
  - Cookie consent banner toggle (analytics loads only after consent).
- **Features**:
  - Toggles: Send reminders and digests / Check for new versions / Species photos (Wikimedia Commons) / AI assistant access.
  - An update box with an accent border while an update is pending, plus Update now and What's new ›.
- **Users**: the list with roles, plus a link to Sign-in for sign-up rules.
- **Backups**: the schedule, a list, and Back up now with progress.
- **Logs** (mirror `settings/server/logs`):
  - Intro: "kept for 30 days".
  - **What to keep** radio: Errors and warnings / What the server does too / Everything, for 24 hours (debug, auto-expires).
  - Level filter chips with counts.
  - Reference lookup, which filters to the entry whose ref matches the code on an error page and highlights it.
  - Download .txt.
  - Rows: level (✕ Error / ▲ Warning / ⓘ Info / ⋯ Debug), area, time, message, user · ref, and expandable **Details** (stack/response, monospace).
  - Empty states for "no match" and "no errors".

### 17. First run
Welcome, then a 4-step checklist: add a tank, set targets, log the first test, set a reminder. Each step is clickable and marks itself done. Completing all four shows a completion state and drops into the tank Overview.

---

## Responsive (desktop widths)
Breakpoints are based on the **main area width** (window minus the sidebar slot):
- **≥ 1000px**: full layouts as above.
- **< 1000px** ("narrow"): Charts stats move below the chart; History becomes `150px | 1fr | 270px`; Public page and Sharing columns stack; tables tighten (see the `lay` object in the prototype logic for exact column templates).
- **< 780px** ("extra narrow"): Overview and Livestock go to one column; History's category list becomes a select and the detail pane is 260px; the Settings nav is 168px.
- Header actions wrap under the title. Tabs scroll with a fade.

## Phone (`Waterline Phone.dc.html`, 402×874)
- **Header**: padding 58px 20px 12px. A kicker plus the **tank name 28/800 with ▾**; tapping it opens the Switch tank sheet. A 44px bell with an unread badge.
- **Bottom bar**: 5 columns with a 2px ink top border and 30px home-indicator padding. Tabs: Overview, Charts, **Log** (60px accent square raised 18px, "+" with the label "Log"), History, More. The active tab has a 3px accent top bar and weight 800.
- Dialogs become **bottom sheets**: a 2px ink top border, a 44×4 grabber, and a 45% scrim.
- Every target is ≥ 44px; list rows are 52–72px.
- **Screens**:
  - Overview.
  - Log water test (sheet, 86% height, 44px value boxes flagged live, "Save · N readings").
  - Charts (swipeable chips, a full-width range segmented control, labelled axes, a tooltip on the latest point, a 2×2 stats grid).
  - History (chips, day groups, thumbnails).
  - Tasks with a Snooze sheet.
  - More: the rest of this tank ("Print, share or get help" is one row), then Tasks / Alerts / Settings, with the update notice on Settings.
  - Switch tank.

---

## State (per screen, beyond server data)
- **UI, persisted per user**: `navPinned`, `theme`.
- **Tank view**: `tankId`, `tab`, `param` (Charts selection), `histCat`, `histSel`, `setupSec`, `photo` (lightbox index).
- **Overlays** (one at a time; Esc closes the top one): `log {type}`, `pal`, `keysOpen`, `alOpen`, `report {days, off{}, note}`, `bulk {mode, rows[], paste, where, source}`, `aiSum {tankId, days, plain}`, `snoozeOpen`, `tmOpen`.
- **Undo**: keep the last destructive action's inverse for about 6s, and apply it on Undo.
- **Data the backend needs that may be new**:
  - Tank members `{userId|email, role: 'log'|'view', pending, invitedAt}` and invite links with expiry.
  - Per-tank reminder and alert routing: `all | owner`.
  - Task `snoozedUntil` / skip.
  - `entry.loggedBy`.
  - One-time reminders.
  - Admin settings: Google OAuth client, sign-in mode and allowlist, local admin credentials, Mailgun or SMTP, webhooks and event toggles, GA4 ID and consent, log retention level.
  - The update-available flag.

## Assets
- No raster assets are bundled. All images are placeholders: grey diagonal stripes. Use real tank, equipment and species photos from the app (species from Wikimedia Commons, as the app does today).
- Icons are simple 24px stroke icons (1.8 stroke, square caps), drawn inline in the prototype. Use the repo's existing icon set (`CategoryIcon.svelte`, etc.) and match the stroke weight.
- Logo: the existing `Logo.svelte` (red water level inside a ring).

## Files
- `Waterline App.dc.html`: the full clickable desktop prototype (every screen above, light and dark, narrow layouts). The markup is in the template; behaviour and demo data are in the `class Component` script at the bottom.
- `Waterline Phone.dc.html`: the seven phone screens.
- `reference/Waterline Current Dashboard.dc.html`: a recreation of today's UI, for comparison.
- `reference/Waterline Desktop Redesign.dc.html`: the original layout directions. **1a** (tank workspace) was chosen.
- `ios-frame.jsx`, `support.js`, `_ds/…/styles.css`: needed to open the files above.
- `screenshots/`: a still of each key state: `desktop-01…22-*.png` (Tanks, Overview, Charts, History, Photos, Livestock, Add several, Equipment, Setup, Sharing, Log test, Print report, Get help, Tasks snooze, Alerts, ⌘K, Shortcuts, Import & export, Server Sign-in, Email, Chat alerts, Logs) and `phone-01…07-*.png`. They were taken at a ~924px-wide window, so the desktop shots show the narrow layout with the sidebar pinned; open the live file at ≥1280px to see the full-width layout. Use them for quick reference; the live files are the source of truth for behaviour.

### Screen → repo routes
| Screen | Route / files |
|---|---|
| Shell, sidebar | `src/routes/(app)/+layout.svelte`, `AccountMenu.svelte`, `Logo.svelte`, `TankThumb.svelte` |
| Tank header and tabs | `src/routes/(app)/tanks/[id]/(tabs)/+layout.svelte`, `QuickAdd.svelte` |
| Overview | `(app)/+page.svelte`, `TankHero`, `AttentionList`, `InRangeList`, `TaskList`, `Sparkline` |
| Charts | `(app)/charts/+page.svelte`, `TrendChart.svelte` |
| History / Photos / Tasks | `(app)/history`, `(app)/photos`, `(app)/tasks` |
| Livestock / Equipment / Spending / Setup | `tanks/[id]/(tabs)/livestock`, `equipment`, `spending`, `settings`; `tanks/[id]/targets`, `review`, `public` |
| Get help summary | `tanks/[id]/summary/+page.svelte`, `src/lib/server/summary.ts` |
| Settings | `(app)/settings/+page.svelte`, `settings/export`, `settings/assistant` |
| Server and Logs | `settings/server/+page.svelte`, `settings/server/logs/+page.svelte` |
| Report, Sharing, Chat alerts, Snooze | **new**: no existing route |
