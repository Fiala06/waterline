# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary:** aquarium hobbyists who keep one to a few tanks (planted, reef, shrimp, brackish, freshwater) and test water regularly. They self-host Waterline on their own server (Docker, often Unraid behind a reverse proxy). Confirmed 2026-10-07: future work assumes strangers install it, not only the maintainer.
- **Main situation:** standing at the tank with a phone, often with wet hands, logging a test or water change in under 30 seconds. Test-kit timers run while the other readings are entered.
- **Secondary situation:** at a desk reviewing charts, history, photos, spending and setup on a larger screen, where each tank is a workspace with tabs.
- **People a tank is shared with:** a household member or helper invited by email, with a role of "can log care" or "can view". They log tests, water changes, dosing, notes, photos and task completions on someone else's tank; only the owner changes setup, targets, expenses or archives.
- **Server admin:** the person hosting it. Sets up sign-in, email, push, public pages and people once, reads logs when something fails, and sees update notices.
- **Public visitors:** people who open a shared tank page, a timeline or a photo link. Not signed in; may arrive from search.
- **Machines:** AI assistants (claude.ai, ChatGPT, Claude Code) reading a person's tanks over MCP or the JSON API, and sensors or controllers (ESPHome, Home Assistant, Node-RED) posting readings with a sensor token.

## Product Purpose

Waterline replaces a hand-written aquarium log with structured records, trend charts and reminders. Each tank has its own parameters and target ranges; every reading is judged against them so the Overview answers "is anything wrong, and what is due?" in one look, and says what to do about it.

Success for a keeper: a reading is logged before the test strip dries, drift is noticed before livestock suffer, maintenance happens on time without remembering it, and years of tank history stay theirs. Success for the project: a hobbyist installs it from one Docker image with one setting and never needs a vendor account.

## Positioning

Three claims, held together rather than ranked (confirmed 2026-10-07):

1. **Your data on your server.** One container, one data folder, full backup ZIP and CSV export, spreadsheet import that undoes in one step, and read-only access for an AI assistant that the person connects and can revoke. Waterline stores no AI keys and calls no AI service.
2. **Fastest tank-side logging.** Every field optional, status shown as you type, numeric keypad by default, the form leads with what a starter kit covers, "Use last readings" fills the previous test, and entries logged offline sync later.
3. **The tank's own public page.** Opt-in, read-only, SEO-friendly page per tank at `/t/<slug>` with share images, an optional timeline, and revocable photo share links.

## Operating Context

- Installed from `ghcr.io/fiala06/waterline` (`latest`, `<version>`, `<major>.<minor>`, `sha-*`). Images are published for releases only. `ORIGIN` is the only required setting; first start asks for a setup code from the container log, then everything is configured in Settings › Server settings. Live reference instance: https://waterline.fiala06.com.
- Runs on HTTPS behind a reverse proxy, or on plain LAN HTTP with the local admin login (then no Google sign-in, offline logging, install prompt or Web Push; ntfy still works).
- Installed to the phone home screen as a PWA. Dark rooms at night are a real viewing condition; the theme is Light, Dark or System per person, and print output is always light.
- Notifications: task reminders, overdue, out-of-range and update alerts by email (single or daily/weekly digest), Web Push, or ntfy, each with its own switch. Mark done and Snooze work from the email or notification without signing in. A private calendar link feeds Google, Apple or Outlook calendars. An in-app Alerts panel collects the same.
- Data arrives by typing at the tank, by spreadsheet import, from sensors over the API, or from demo seed data (`npm run seed`, sign in as demo@example.com, four tanks with six months of history, a public page at `/t/riverbed-40-demo`).
- Third-party data the server fetches, never the browser: species photos from Wikimedia Commons (`/data/stock`, with credit) and FishBase care ranges (`/data/species-care.json`, CC BY-NC, so never in the repo). Both switchable off.
- Development: `npm run dev` on port 5173 (`.claude/launch.json`, config `waterline-dev`), Node 22. One branch, `main`; a push is checked, tested and built but not published; a release is a version bump plus a `## <version> · <date>` changelog section, written for keepers, that the app shows under Settings › What's new. Ideas and planned work are GitHub issues on Fiala06/waterline.

## Capabilities and Constraints

Shipped as of version 1.12.13 (2026-10-07):

- **Sign-in and people:** Google or local admin login; admin decides who may sign in (admin only, a list of emails or domains, or anyone with Google); invitations by email or link; Server settings › People with Make admin, Sign out everywhere, Remove. Each person sees their own tanks and the tanks shared with them.
- **Tanks:** types freshwater, planted, brackish, reef with parameter presets; nominal and actual volume, dimensions, start date, substrate, water source, photoperiod, cover photo; archive with restore. Per-tank targets, custom parameters, TDS, conductivity and ORP; a cycling flag for new tanks; "no heater, on purpose".
- **Logging:** water tests (with per-kit step timers that keep the screen awake and chime), water changes (% or volume, source, conditioner, what went in), dosing from saved products, feeding, maintenance with equipment picker, livestock and plant changes, equipment changes, observations, fish health and treatment courses, notes and photos. Defaults to the current tank and now; backdating allowed, future disabled. Drafts kept. Saving can complete a linked task.
- **Overview per tank:** Needs attention (out of range or near limit, each with what to do next, and overdue water change), In range, Due, Recent, trend notes (rising, heading past target, drift between water changes, change after a dose), what's new after an update.
- **Charts:** target band with good/high/low zones named, water changes and doses marked, hover and keyboard readout, 30/90/365-day ranges, sensor readings as a thin line, stats and a written insight; compare tanks.
- **History, Photos, Timeline:** grouped history with categories and a detail pane, who logged each entry on shared tanks; photo gallery with lightbox, set as cover, EXIF dates; a timeline of photos with day since setup, stock and nearest readings, and a before-and-after slider.
- **Tasks:** recurring every N days/weeks from completion or fixed, on set weekdays, or one-time; snooze (presets and a date) and skip with a History note; dosing and feeding routines; equipment service reminders; a periodic Setup review task with "Still right" and "Edit" per part.
- **What's in the tank:** livestock with counts, loss/sold/moved reasons, quarantine, named pets with pages and photo tags, species list (Wikipedia + Wikidata, CC BY-SA 4.0) with "add several" by ticking or pasting, species care ranges and conflict notes; plants with trim and melt status; equipment with specs, photos, service history and run schedules drawn as a day timeline (lights with siesta and ramp, CO₂, pumps; PAR map for reef); spending by category and month with receipts; a wish list that moves items into the tank.
- **Calculators:** tank volume, water change to lower a reading, dose in ppm and dose for a target, heater size, substrate, CO₂ from pH and KH, remineralizing RO water. All in the person's units, prefilled from the tank.
- **Sharing:** per-tank sharing with roles; routing of reminders and alerts to everyone who can log or only the owner; public pages with per-section toggles, slug, title, description, indexable toggle, sitemap, robots, Open Graph images, optional GA4 behind a consent banner; photo share links.
- **Export and access:** full backup ZIP, CSV of water tests, a tank summary in Markdown or plain text "to paste into a forum post, a message to a friend or your fish store, or an AI chat"; MCP server at `/mcp` with OAuth (PKCE, dynamic registration) or pasted tokens; JSON API at `/api/v1`; sensor tokens that may only add readings.
- **Server:** Mailgun or SMTP email with a test send; Web Push key and ntfy; public pages and analytics; feature switches (reminders, update check, species photos, species care, AI access); logs with levels, reference lookup and download; backups; update notice with Update now.
- **PWA:** install prompt, offline queue that syncs later, hand-written service worker, no stale pages after an update.

Technical constraints that shape design:

- Stack: SvelteKit 2 (Svelte 5, adapter-node), TypeScript, Drizzle + better-sqlite3 with migrations in `drizzle/`, Auth.js, Nodemailer and Mailgun, web-push and ntfy, a 5-minute scheduler, sharp, satori + resvg, yazl, hand-written service worker, Vitest + Playwright. Single Dockerfile, volume `/data`. MIT licence for the code.
- Pages render inside the app shell (`src/routes/(app)/+layout.svelte`), which owns the sidebar, tank header and tabs, phone header and bottom bar, and the overlays (⌘K palette, keyboard shortcuts, alerts, Quick add, toast). Desktop has a `min-width` of 900px; narrow and extra-narrow layouts key off the main area width, not the window.
- Server data through `+page.server.ts` loads and form actions; forms work without JavaScript. Every write that changes tank state also writes an events row so History stays complete.
- Values stored metric (L, °C, cm, dGH) and converted at the edge in `src/lib/units.ts`; every measurement shows its unit label. Status rules in `src/lib/status.ts`: ✕ outside the target; ▲ Near within 10% of the span of a bound when min > 0, and any reading above 0 when min = 0 (ammonia, nitrite); ✓ otherwise; – No data.
- Public routes are SSR and never expose private fields. Never public: tasks, private notes, exact times, email, sources and prices, pet photos unless enabled. AI and API access is read-only, token-only, limited to the tanks granted.
- No external images or fonts at runtime; Archivo (and IBM Plex Mono, used for values in the 1.6 refresh) are self-hosted in `static/fonts/`. Motion is minimal and off under `prefers-reduced-motion`.
- Every destructive action is undoable from a toast for about six seconds rather than confirmed up front.

Terminology: tank, workspace, tab, parameter, target, reading, water test, water change, dose, feeding, routine, maintenance, livestock, pet, plant, equipment, service, observation, note, task, snooze, skip, setup review, quick add / Log, public page, share link, invite, role (can log / can view), alert, sensor, test kit, wish list, spending, receipt, summary, assistant.

Designed in the redesign handoff but not built (ask the product owner before starting): the print or PDF tank report, chat alerts to Discord and Slack webhooks, scheduled server backups in the admin UI. Undecided: whether the name and mark survive another redesign; which open GitHub issues get built next.

## Brand Commitments

- Name **Waterline**. Mark: a ring with a water level inside it ("inset water", variant 2c; solid variant 2a below 24px), water filled in the accent colour; implemented in `Logo.svelte`, SVG source in `design_handoff_waterline/designs/Waterline Brand.dc.html`, README lockups in `docs/logo-*.svg`. Now and then a small fish swims through the water, never under reduced motion. The 1.6 "living waterline" (a decorative gradient rule under the tank hero) was reduced to a still line in 1.9.
- Voice: plain, friendly, second person, no internals. Changelog, README and UI copy are written for keepers. Status is always glyph plus word (`✓ OK`, `▲ Near`, `✕ High`, `– No data`, `●` on, `○` off); red, amber and green mean status and nothing else. Humour is allowed in small doses (the fish, "Good news, out loud").
- The original brief asked for "aquatic but not cartoonish".
- **Design authority, confirmed 2026-10-07:** the current look is the "Modernist" redesign in `design_handoff_waterline_redesign/` (Archivo, radius 0, one red accent, 2px ink rules, tank workspace with sidebar and tabs, bottom bar with Log on phones), shipped in 1.9.0. The owner treats it as provisional, not a contract, and is open to another replacement visual world in a later pass. Until that pass runs, refinements preserve the Modernist look. A redesign keeps the product truth in this file, the status rule, the phone-first logging constraints, the undo-toast model, the workspace information architecture unless the owner changes it, and the accessibility requirements, and treats both handoffs only as evidence. Original teal handoff: `design_handoff_waterline/` (behaviour and data model still authoritative where the redesign is silent).

## Evidence on Hand

- A working app at 1.12.13 with demo data (`npm run seed`), screenshots in `docs/screenshots/` (dashboard, log test, charts; phone and desktop; both themes), and the live instance at https://waterline.fiala06.com.
- A changelog of 40 releases written for keepers (`CHANGELOG.md`), each line linking the page the feature lives on.
- Two high-fidelity design handoffs: the original teal system with every v1 screen, components, emails, brand and a clickable prototype (`design_handoff_waterline/designs/`, plus the 1.6 dashboard refresh notes in `REFRESH_1C.md`), and the Modernist redesign with a clickable desktop prototype, seven phone screens and 29 screenshots (`design_handoff_waterline_redesign/`). The original brief is `design-brief.md`.
- Bundled species list with licensed sources (`src/lib/server/data/SPECIES_SOURCES.md`); FishBase care data and Wikimedia photos fetched per server with credit.
- Tests: unit (units, status, trends, time zones, imports, money, email, MCP), Playwright core flow and per-feature tests at phone and desktop viewports, and an opt-in audit sweep recording axe violations, tap targets and overflow at three widths in both themes (`e2e/audit.test.ts`). CI runs CodeQL, dependency review, `npm audit` and an image vulnerability scan before a release (`SECURITY.md`).
- Absent, do not fabricate: testimonials, install or user counts, press, comparisons with other aquarium apps, pricing, real user photos beyond the demo seed.

## Product Principles

1. **Logging beats everything.** A reading entered in seconds with wet hands is the product. Any screen between the keeper and Save is a cost; one keystroke or tap reaches Log from anywhere.
2. **Status is literal and actionable.** OK, near or out, with a glyph and a word, judged against the tank's own targets, followed by what to do next. Never colour alone, never a guess.
3. **The keeper owns the record.** Every change becomes a History event with who did it, every destructive action undoes, every import reverses, everything exports. Archive, don't delete.
4. **Install with one setting, run with none.** One URL gets a working server; everything else lives in the app, explains itself, and is seen rarely. Third-party data comes to the server, never to the browser.
5. **Private by default, shared by choice.** Sharing a tank, a page, a photo, a calendar or assistant access is opt-in, scoped and revocable; roles limit what a helper can change.

## Accessibility & Inclusion

- WCAG AA contrast in both themes (red text uses accent-700, which flips in dark mode); status never colour-only.
- Minimum 44px tap targets; numeric inputs use `inputmode="decimal"`; primary actions near the bottom on phones; list rows 52 to 72px.
- Forms work without JavaScript. Motion is minimal and off under `prefers-reduced-motion`. Hover-only behaviour only with a mouse.
- Full keyboard model on desktop: ⌘K palette, `?` shortcuts sheet, G-then-letter navigation, T/W/D/N logging, ⌘↵ save, Esc closes the top overlay; chart readout steps with arrow keys.
- The audit sweep in `e2e/audit.test.ts` runs axe on every screen at phone, tablet and desktop in both themes.
- Dark theme is a first-class need: tanks are viewed in dim rooms at night.
