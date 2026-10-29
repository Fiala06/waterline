# CLAUDE.md — Waterline

You are building **Waterline**, a self-hosted aquarium tank log (PWA). The look is the **redesign** in `design_handoff_waterline_redesign/` (the "Modernist" system: Archivo, square corners, one red accent, a sidebar of tanks beside a tank workspace with tabs on desktop, a bottom bar with Log on phones). Read `design_handoff_waterline_redesign/README.md` first; the original `design_handoff_waterline/` still holds `DATA_MODEL.md` and the screens' behaviour where the redesign doesn't say otherwise. Version 1 (`BUILD_PLAN.md`) is done; new work comes from GitHub issues.

## Ground rules
- The `*.dc.html` files are **visual references**, not code to copy. Open them in a browser (keep `support.js` and `_ds/` beside them) or read their inline styles for exact values. `screenshots/` has a still of each key state.
- Match the designs closely: the tokens live once in `src/app.css` as CSS custom properties (light on `:root`, dark on `:root[data-theme="dark"]` and under `prefers-color-scheme: dark` when no theme is chosen); default to the system theme. Radius is 0 everywhere; sections are a heading, a 2px ink rule, then rows with 1px dividers; columns are separated by 2px rules, not cards. Archivo is self-hosted in `static/fonts/`.
- Pages render inside the shell (`src/routes/(app)/+layout.svelte`): it draws the sidebar, the tank header with its tabs and the desktop page titles, the phone header and bottom bar, and the overlays (⌘K palette, ? shortcuts, alerts, Quick add, toast). Pages keep only their phone heads (`.hide-desk`).
- Status is never color-only: always render icon + word (`✓ OK`, `▲ Near`, `✕ High`, `– No data`).
- Phone first: min tap target 44px, numeric inputs use `inputmode="decimal"`, primary actions reachable near the bottom.
- Copy (button labels, empty states, error text) comes from the designs verbatim unless it contains sample data.

## How to work
These guidelines bias toward caution over speed; for trivial tasks, use judgment.

**Think before coding.** Don't assume, don't hide confusion, surface tradeoffs.
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them; don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

**Simplicity first.** Minimum code that solves the problem, nothing speculative.
- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it. Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

**Surgical changes.** Touch only what you must; clean up only your own mess.
- Don't "improve" adjacent code, comments or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it; don't delete it.
- Remove imports, variables and functions that *your* changes made unused. Don't remove pre-existing dead code unless asked.
- The test: every changed line should trace directly to the request.

**Goal-driven execution.** Define success criteria, then loop until verified.
- Turn tasks into verifiable goals: "Add validation" → write tests for invalid inputs, then make them pass. "Fix the bug" → write a test that reproduces it, then make it pass. "Refactor X" → ensure tests pass before and after.
- For multi-step tasks, state a brief plan first, one line per step with how you'll verify it.

## Stack
SvelteKit (adapter-node) · TypeScript · Drizzle ORM + better-sqlite3 (`/data/waterline.db`, migrations in `drizzle/` via `npm run db:generate`) · Auth.js (Google + credentials for local admin) · Nodemailer (SMTP) + Mailgun HTTP API · web-push (Web Push) + ntfy · a 5-minute scheduler (`src/lib/server/scheduler.ts`) · sharp · satori + resvg (OG images) · yazl (backup ZIPs) · a hand-written service worker (`src/service-worker.ts`) · Vitest + Playwright. Single Dockerfile, volume `/data`.

## Env vars
Only `ORIGIN` is required. Google sign-in, the admin, who can sign in, the local admin login and email are set in the app (Settings › Server settings, stored in `server_settings`, secrets encrypted). Optional: `DATA_DIR` (`/data`), `AUTH_SECRET` / `ENCRYPTION_KEY` (otherwise generated into `/data/keys.json`), `LOCAL_ADMIN_PASSWORD_HASH`, `BODY_SIZE_LIMIT`, `ADDRESS_HEADER` / `XFF_DEPTH`, `UPDATE_CHECK_URL`, `STOCK_PHOTOS=off`, `SPECIES_CARE=off` / `SPECIES_CARE_URL` (FishBase care data, downloaded per server into `/data/species-care.json`, never in the repo: CC BY-NC), `BARCODE_LOOKUP=off` (no lookups of scanned barcodes on Open Products Facts and UPCitemdb; `BARCODE_OPF_URL` / `BARCODE_UPCITEMDB_URL` point them at stand-ins in tests), `DEVICE_POLLING=off` (no reading of ESPHome devices from their own web page by the scheduler; tests point Read a device at the stand-in under `/dev/esphome`). The older `AUTH_GOOGLE_*`, `ADMIN_EMAIL`, `ALLOWED_EMAILS`, `OPEN_SIGNUP` still apply until saved in the app. Tests use `AUTH_DEV_LOGIN=true` and `EMAIL_TRANSPORT=outbox` (never in production).

## Conventions
- Store metric; convert at the edge with helpers in `src/lib/units.ts` (unit-tested).
- Status logic lives in `src/lib/status.ts` (see README → Parameter status; unit-test edge cases incl. min = 0).
- Server data via `+page.server.ts` load + form actions; progressive enhancement (forms work without JS).
- Every write that changes tank state also writes an `events` row, so History stays complete.
- Public routes (`/t/[slug]`, `/s/[id]`) are SSR, never expose private fields, and load GA4 only when configured and consented.
- Email sending goes through `src/lib/server/mail/` with `mailgun.ts` and `smtp.ts` behind one interface. Push goes through `src/lib/server/push/` (`webpush.ts`, `ntfy.ts`), with its own switch per kind beside email's; the scheduler and alerts in `notifications.ts` decide what goes where.
- AI assistant access (`/mcp`, `/api/v1`, `src/lib/server/assistant/`) is read-only, limited to a token's tanks, and signed in by the token alone, never the session cookie. Tokens are pasted from Settings or issued by the OAuth sign-in (`/oauth/*`, `/.well-known/oauth-*`, `assistant/oauth.ts`: PKCE always, exact redirect addresses).
- Server problems go to the log (`logger` in `src/lib/server/log.ts`), which admins read in Settings › Server settings › Logs.

## Workflow
- Work one GitHub issue at a time, on `main` (the only branch). A push is checked, tested and built but not published; a release (a new `version` in `package.json` with its `## <version> · <date>` changelog section) publishes `:latest`. After each change: run `npm run check`, `npm test` and the Playwright tests (`npm run test:e2e`), add a line for people who use the app under `## Unreleased` in `CHANGELOG.md` (its bold name, what it does for them and where to find it, with a link to the page: see the top of `CHANGELOG.md`), then commit with `Closes #N`.
- Release only when the product owner asks, with what's under Unreleased. The app is young, so version numbers move slowly: the patch (1.8.1) for fixes and small additions, the minor (1.9.0) only for a release with a sizeable new feature, and never backwards (the update check and Docker tags compare them).
- Keep `design_handoff_waterline/DATA_MODEL.md` in step with the schema, and the README with what the app does.
- Screens the redesign describes that need data the app doesn't have yet (sharing a tank with someone, chat alerts to Discord/Slack, the print report) are not built; ask the product owner before starting one.
- Compare each finished screen against its design screenshot (e.g. `desktop-04-history.png`, `phone-03-charts.png`) at 390px and 1280px widths, in both themes.
- Ask the product owner before inventing features not in the designs. Decided: reef and other tank-type presets live in `defaultParameters()` in `src/lib/params.ts`; the bundled species list is built from Wikipedia + Wikidata (`npm run build:species`, see `src/lib/server/data/SPECIES_SOURCES.md`).
