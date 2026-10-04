# Handoff: Waterline — self-hosted aquarium tank log

## Overview
Waterline is a self-hosted, mobile-first web app (installable PWA) for aquarium keepers. Users sign in with Google (plus an optional local admin login), then log water tests, water changes and other events per tank, see status against their own target ranges, view trend charts with event markers, manage maintenance tasks with email reminders, track equipment/livestock/plants, and optionally publish a read-only, SEO-friendly public page per tank.

Primary context: standing at the tank with a phone, logging in under 30 seconds. Secondary: reviewing charts/history on desktop.

## About the design files
The files in `designs/` are **design references built in HTML** — they show intended look, layout, copy and behavior. They are **not production code**. Recreate them in the target stack (recommended below). Open any `*.dc.html` file directly in a browser (keep `support.js` beside them). Most files are "canvas" boards: pan/zoom to see every screen, each labelled (e.g. `03 Dashboard`, `D5 Tasks`, `G6 Edit entry`).

## Fidelity
**High-fidelity.** Colors, type sizes, spacing, radii, copy and states are final. Recreate pixel-accurately. Imagery is placeholder (striped boxes labelled "tank cover photo" etc.) — real user photos go there.

## Recommended stack (no codebase exists yet)
*As built, the app follows this with a few changes: its own 5-minute scheduler instead of `node-cron`, a hand-written service worker instead of `@vite-pwa/sveltekit`, full photos at 2048px and thumbnails at 400px as planned, and hand-rolled SVG charts. Most configuration moved from env vars into Settings › Server settings; see the repo's README.*

- **SvelteKit** (Node adapter) — pages + server + form actions in one app; SSR is required for public pages (SEO).
- **SQLite** via Drizzle ORM (single file in `/data`).
- **Auth.js** (`@auth/sveltekit`) with Google provider + credentials provider for the optional local admin.
- **Nodemailer** for Custom SMTP, **Mailgun HTTP API** for Mailgun (provider chosen in admin settings).
- **Cron** (`node-cron`) for reminders, overdue alerts, digests.
- **Photos** on disk in `/data/photos` (resize to 2048px + 400px thumb with `sharp`).
- **OG images** rendered server-side with `satori` + `@resvg/resvg-js` (1200×630 PNG).
- **Charts**: lightweight SVG (e.g. LayerChart or hand-rolled SVG — designs are simple polylines + bands).
- **PWA**: `@vite-pwa/sveltekit`; offline queue in IndexedDB for new entries.
- **Deploy**: one Docker image, one volume `/data`. Config via env vars (Google client ID/secret, base URL, admin password hash).

See `DATA_MODEL.md` and `BUILD_PLAN.md` in this folder.

---

## Design tokens

### Color — dark (default) / light
| Token | Dark | Light | Use |
|---|---|---|---|
| page | `#081317` | `#e9eeed` | canvas behind app (desktop gutters) |
| bg | `#0c1a1f` | `#f4f7f6` | app background |
| surface-2 | `#0f2126` | `#eef3f2` | sidebar, tab bar, recessed inputs |
| surface | `#13262c` | `#ffffff` | cards, sheets, inputs |
| surface-hi | `#1a3138` | `#eaf0ef` | chips, secondary tiles |
| selected | `#17363a` | `#dcefed` | selected nav item, icon tiles |
| border | `#24414a` | `#d5e0df` | card borders, dividers |
| border-strong | `#2f525c` | `#bccccb` | inputs, secondary buttons, dashed empty states |
| divider-soft | `#1c353c` | `#e1e9e8` | list row dividers |
| text | `#e6f0f0` | `#0f2126` | primary text |
| text-2 | `#b8cacd` | `#3f5559` | secondary text |
| text-muted | `#9fb4b8` | `#4f666b` | labels, meta |
| text-faint | `#7d9397` | `#627a7e` | hints, footnotes |
| placeholder | `#4a6a72` | `#9fb0b3` | empty values "—" |
| accent | `#4fc4bd` | `#1a7a7a` | primary buttons, active states, chart line |
| on-accent | `#06201f` | `#ffffff` | text on accent |
| ok | `#6fd39a` | `#1d7a47` | ✓ in range |
| ok-bg / ok-text | `#143a2c` / `#9fe5bb` | `#e3f3ea` / `#1d6a3f` | success banners |
| warn | `#e8c060` | `#8a6300` | ▲ near limit / due soon |
| warn-bg / border / text | `#3a3218` / `#5e5020` / `#ecd699` | `#fbf2d9` / `#e8d49a` / `#6e5000` | near-limit cards |
| bad | `#f08a78` | `#b8412c` | ✕ out of range / overdue |
| bad-bg / border / text | `#3f201c` / `#6b3129` / `#f5b6aa` | `#fbe9e5` / `#efc3b9` / `#8f2f1f` | out-of-range cards |
| scrim | `rgba(3,10,12,0.7)` | `rgba(15,33,38,0.4)` | behind sheets/modals |

Rule: **status is never color-only** — always icon + word (`✓ OK`, `▲ Near`, `✕ High`, `– No data`). Category icons are neutral (accent on `selected`), so red/amber/green only ever mean status.

### Typography
Font: `"Helvetica Neue", Helvetica, Arial, sans-serif` (single family). Monospace for URLs/IDs: `ui-monospace, Menlo, monospace`. Use `font-variant-numeric: tabular-nums` for readings.
| Role | Size / weight |
|---|---|
| Splash / sign-in title | 38px / 600, letter-spacing −0.02em (desktop 48px) |
| Screen title | 28px / 600 (desktop header 22px / 600) |
| Reading value | 26px / 600 (desktop 28px) |
| Section header | 17px / 600 |
| Body / inputs | 15–17px / 400 |
| Meta / labels | 13–14px, text-muted |
| Small caps labels | 12–13px, letter-spacing 0.06–0.1em, uppercase |
| Minimum | 12px |

### Spacing, radius, elevation
- Spacing scale (px): 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32. Phone side padding 20px; desktop content padding 28px.
- Radius: 6 (small chips/tags), 8–10 (desktop inputs/buttons), 12 (inputs, buttons), 14 (cards, reading cards), 16–18 (large cards), 20 (modals), 28 top corners (bottom sheets), 44 (phone frame only).
- Heights: primary button 56px (phone), 44–48px (desktop); inputs 48–52px; min tap target 44px; FAB 64px; bottom tab bar 88px; desktop header 68–72px; desktop sidebar 232px.
- Shadows: FAB `0 8px 24px rgba(0,0,0,.45)`; modal `0 24px 64px rgba(0,0,0,.5)`; toast `0 10px 30px rgba(0,0,0,.4)` (light theme: use `rgba(15,33,38,.18–.2)`).

---

## Brand
- Name: **Waterline**. Mark **2c** ("inset water"): circle stroke r=24.5 in a 56 viewBox, water = circle r=19 clipped below y=31, filled accent. Below 24px use **2a** (solid: circle r=24 stroke, fill below y=32). SVG source in `designs/Waterline Brand.dc.html`.
- Wordmark: Helvetica Neue Medium (600), −2% tracking. Mark-to-word gap 0.27× mark height; clear space ½ mark width.
- App icons: iOS 180 (radius 40), Android maskable 192/512 (mark inside 66% safe zone), favicon 32/16 (2a). Manifest: `background_color`/`theme_color` `#0c1a1f`, `display: standalone`.
- **Splash**: mark 112px + wordmark 34px centered. The water level animates from resting (y=31) to full (y=8.5) tied to real load progress, cubic ease-out between steps; app opens when full. Respect `prefers-reduced-motion` (static).

---

## Navigation
- **Phone**: bottom tab bar — Dashboard, Tanks, Tasks, Settings; floating “+” (64px, right 20, bottom 104) opens Quick add. History, Charts, Photos open from the dashboard with a back link.
- **Desktop**: left sidebar (232px): Dashboard, Tanks, Tasks (badge "1 overdue"), History, Charts, Photos; tank list with status label ("2 alerts" pill in bad colors / "All good" in ok text; current tank = filled `surface-hi` background); Settings pinned bottom. Header has tank switcher and “+ Quick add”.
- **Tank switcher**: phone bottom sheet (G1); desktop dropdown with search, ⌘K, number keys (G12).
- List screens on desktop use a right detail pane (History, Tasks) rather than navigating away.

## Screens (file → labels)
| File | Screens |
|---|---|
| `Core Screens(.Light).dc.html` | 01 Sign in · 02 Setup · 03 Dashboard · 04 Quick add sheet · 05 Log water test · 06 Tasks · 07 Desktop dashboard · 08 Desktop log water test modal |
| `More Screens(.Light).dc.html` | 09 Tanks list · 10 Tank detail/edit · 11 History · 12 Charts · 13 Photos · 13b Photo viewer · 14 Log event (water change) · 15 Task edit · 16 Settings · 17 Export (building) · 18 Admin server settings · 19 Desktop charts |
| `Desktop Screens(.Light).dc.html` | D1 Sign in (with local admin) · D2 Setup · D3 Tanks · D4 Tank detail + targets table · D5 Tasks + edit pane · D6 History + detail pane · D7 Photos · D8 Photo viewer + share link · D9 Settings/Notifications · D10 Export ready · D11 Admin (Mailgun / Custom SMTP, public share links) · D12 Quick add modal · D13 Log event modal (dosing) |
| `Gap Screens(.Light).dc.html` | G1 Tank switcher sheet · G2–G5 Log event: Maintenance, Livestock/plants, Equipment, Observation · G6 Edit entry · G7 Custom parameter · G8 Snooze · G9 Date/time picker · G10 Export ready (phone) · G11 Install prompt + offline · G12 Desktop tank switcher |
| `Tank Specs(.Light).dc.html` | T1 Overview (specs) · T2 Equipment · T3 Add equipment · T4 Livestock (count change) · T5 Add livestock · T6 Desktop livestock + equipment · T7 Plants |
| `Public Tank Page(.Light).dc.html` | S1–S4 OG share images · P1 Public page settings · P2 Public page phone · P3 Public page desktop · P4 Search & sharing (SEO) · P5 Admin public pages & analytics |
| `Component Library(.Light).dc.html` | Tokens, parameter card (4 states), event card, task row, numeric input states, chart, photo upload states, category icons, buttons/chips/toggles, empty states, loading/success/error, confirm dialogs |
| `Email Templates.dc.html` | E1 Task reminder · E2 Overdue · E3 Daily digest · E4 Out-of-range · E5 Test email |
| `Waterline Brand.dc.html` | Mark refinements, lockups, app icons, splash (animated) |
| `Waterline Prototype.dc.html` | **Clickable** core flow: sign in → setup → create tank → log test → dashboard → complete task; entry detail; parameters & targets editor |
| `Brand Explorations.dc.html` | Name/logo exploration (history only) |
| `Desktop Sidebar(.Light).dc.html` | Shared desktop sidebar component (`active` prop) |
| `Waterline Refresh.dc.html` | Dashboard refresh, direction 1c (built in 1.6): 1c, 2a desktop dark, 2b phone light; notes in [`REFRESH_1C.md`](REFRESH_1C.md) |

Treat the dark files as canonical; Light files are the same layouts with the light token column.

---

## Key behavior

### Parameter status
For a reading `v` with target `[min, max]` (per tank, user-editable):
- `✕ out of range` if `v < min` or `v > max` (label `✕ High` / `✕ Low`; form: `✕ Above target 5–20 ppm`).
- `▲ near limit` if in range and within 10% of `(max − min)` of a bound when `min > 0`. When `min = 0` (ammonia/nitrite, shown as `≤ 0.25 ppm`) any reading above 0 is `▲ Near high`: they should read 0.
- `✓ in range` otherwise; `– No data` if never tested (dashed card, "Not tested").
Default targets (imperial/dGH): pH 6.0–7.8 (freshwater and planted) · Ammonia 0–0.25 ppm · Nitrite 0–0.25 ppm · Nitrate 5–20 ppm · GH 4–8 dGH (70–140 ppm) · KH 2–5 dKH (35–90 ppm) · Temp 74–80 °F (23–27 °C). Reef defaults should add salinity/alk/Ca/Mg/PO₄ (define with product owner).

### Units
Store metric (L, °C, cm; hardness in dGH internally). Display per user: unit system (imperial/metric) and hardness (dGH/dKH or ppm, independent). Every measurement shows its unit label. 1 dGH = 17.848 ppm.

### Logging
- Quick add (sheet on phone, modal on desktop; keys T/W/N): Log water test, Log water change, Add note/photo; More → Dosing, Maintenance, Livestock/plants, Equipment, Observation. Defaults to current tank + now; both changeable (G9 picker: backdating allowed, future disabled).
- Water test: every field optional; numeric keypad (`inputmode="decimal"`); previous reading shown faintly ("Last 7.0 · Sep 18"); inline status as you type; border turns bad/warn color; Save button label counts filled fields ("Save 3 readings").
- Event categories and fields: see G2–G5, 14, D13. Water change: amount % or volume (shows "≈ 8.5 gal of 34 gal actual"), source Tap/RODI/Mix. Dosing: product (recent first), amount, unit.
- Saving a matching event can complete the linked task (checkbox "Also complete task …").
- Success toast: `✓ Saved 7 readings · 1 out of range` (+ View). Auto-hide 2.8s.
- Entries are tappable everywhere → detail (readings with status, note, photos) → Edit / Delete (confirm dialog). Edited entries show "edited" timestamp and "was X" hints.
- Livestock count decrease prompts: Loss / Rehomed / Recount → writes a history event.

### Tasks
Sections Overdue / Due soon (≤3 days) / Later, across tanks or filtered. Row shows name, tank, due, interval; actions Mark done, Snooze, Edit. Schedule mode: **from completion** or **fixed calendar**. Snooze (G8) moves only the current occurrence. Mark done on a "water change"/"test" task opens the matching log form.

### Offline / PWA
New entries save to IndexedDB when offline and sync later; banner "Offline · N entries waiting"; per-entry "▲ Waiting to sync". Install prompt after 2nd visit (iOS: Share › Add to Home Screen instructions).

### Email (server-side)
Provider set by admin: **Mailgun** (API key, sending domain, region US/EU, sender) or **Custom SMTP** (host, port, TLS, user, password, sender). "Send test email" shows inline success/error (e.g. `✕ Mailgun rejected the request. (401 Unauthorized)`). Templates E1–E5; 600px single column, light theme. Mark done / Snooze buttons use signed single-use tokens (no sign-in). Every email: notification settings link + one-click unsubscribe (`List-Unsubscribe` + `List-Unsubscribe-Post`). User prefs: per-type on/off, individual vs daily/weekly digest, lead time, send time, time zone.

### Public pages, SEO, analytics
- Per tank opt-in (P1): toggles for readings, charts, photos, activity (no notes), livestock & plants (no sources/prices), equipment (no notes), description; display name. Never public: tasks, private notes, exact times, email.
- Server-rendered at `/t/<slug>`; indexable toggle (robots meta + sitemap.xml inclusion); editable title (≤60) and description (≤160); canonical, Open Graph, Twitter `summary_large_image`, schema.org.
- Photo share links `/s/<id>` (D8), revocable; server-wide toggle in admin.
- OG images (S1–S3): 1200×630, keep key content in centered 630×630 safe area; regenerated on new test/cover change; cache-busted URL `?v=`; generated alt text.
- Admin (P5): allow public pages, public home listing, sitemap/robots, public base URL, **GA4 measurement ID** (loaded on public pages only), cookie-consent banner (analytics only after accept), Search Console verification tag.

### Motion
Keep minimal: skeleton pulse 1.4s ease-in-out (opacity 1 → .45), splash water fill, sheet slide-up ~250ms ease-out. All disabled under reduced motion.

## State (client)
Current tank id, theme (light/dark/system), units prefs, quick-add draft, offline queue, toast. Everything else is server data loaded per route.

## Assets
No external images. Logo/mark are simple SVG (copy from `Waterline Brand.dc.html`). Category icons are CSS/SVG primitives (ring = test, double line = water change, pill = dosing, diamond = maintenance, two dots = livestock/plant, filled square = equipment, ring+dot = observation, rounded square = note/photo) — may swap for an icon set with the same shapes. Species list for autocomplete must be sourced (bundled JSON).

## Files
All design references are in `designs/`. Open in a browser; `support.js` must sit alongside.
