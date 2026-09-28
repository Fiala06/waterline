# CLAUDE.md — Waterline

You are building **Waterline**, a self-hosted aquarium tank log (PWA). The design is final and lives in `design_handoff_waterline/`. Read `design_handoff_waterline/README.md` and `DATA_MODEL.md` before writing code. Version 1 (`BUILD_PLAN.md`) is done; new work comes from GitHub issues.

## Ground rules
- The `designs/*.dc.html` files are **visual references**, not code to copy. Open them in a browser (keep `support.js` beside them) or read their inline styles for exact values. Dark files are canonical; `* Light.dc.html` show the light theme.
- Match the designs closely: use the exact hex values, sizes and radii from README → Design tokens. Implement tokens once as CSS custom properties on `:root[data-theme="dark"|"light"]`; default to the system theme.
- Status is never color-only: always render icon + word (`✓ OK`, `▲ Near`, `✕ High`, `– No data`).
- Phone first: min tap target 44px, numeric inputs use `inputmode="decimal"`, primary actions reachable near the bottom.
- Copy (button labels, empty states, error text) comes from the designs verbatim unless it contains sample data.

## Stack
SvelteKit (adapter-node) · TypeScript · Drizzle ORM + better-sqlite3 (`/data/waterline.db`, migrations in `drizzle/` via `npm run db:generate`) · Auth.js (Google + credentials for local admin) · Nodemailer (SMTP) + Mailgun HTTP API · web-push (Web Push) + ntfy · a 5-minute scheduler (`src/lib/server/scheduler.ts`) · sharp · satori + resvg (OG images) · yazl (backup ZIPs) · a hand-written service worker (`src/service-worker.ts`) · Vitest + Playwright. Single Dockerfile, volume `/data`.

## Env vars
Only `ORIGIN` is required. Google sign-in, the admin, who can sign in, the local admin login and email are set in the app (Settings › Server settings, stored in `server_settings`, secrets encrypted). Optional: `DATA_DIR` (`/data`), `AUTH_SECRET` / `ENCRYPTION_KEY` (otherwise generated into `/data/keys.json`), `LOCAL_ADMIN_PASSWORD_HASH`, `BODY_SIZE_LIMIT`, `ADDRESS_HEADER` / `XFF_DEPTH`, `UPDATE_CHECK_URL`. The older `AUTH_GOOGLE_*`, `ADMIN_EMAIL`, `ALLOWED_EMAILS`, `OPEN_SIGNUP` still apply until saved in the app. Tests use `AUTH_DEV_LOGIN=true` and `EMAIL_TRANSPORT=outbox` (never in production).

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
- Compare each finished screen against its design label (e.g. `03 Dashboard`, `D5 Tasks`) at 390px and 1280px widths, in both themes.
- Ask the product owner before inventing features not in the designs. Decided: reef and other tank-type presets live in `defaultParameters()` in `src/lib/params.ts`; the bundled species list is built from Wikipedia + Wikidata (`npm run build:species`, see `src/lib/server/data/SPECIES_SOURCES.md`).
