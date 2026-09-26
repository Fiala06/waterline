# Waterline

Self-hosted, mobile-first aquarium tracker. Log water tests and water changes tank-side, spot trends on charts, and get email reminders for maintenance. Google sign-in, imperial/metric units, full data export.

Design handoff and specs live in [`design_handoff_waterline/`](design_handoff_waterline/README.md); the build order is in [`BUILD_PLAN.md`](design_handoff_waterline/BUILD_PLAN.md). Ideas for later are in [`IDEAS.md`](IDEAS.md).

## Status

All 13 milestones of the build plan are done: sign-in, setup, tanks and targets, logging, dashboard, history, charts, photos, tasks, email (reminders, overdue alerts, digests, out-of-range alerts, one-click actions and unsubscribe), settings and server settings, export (full backup ZIP or water tests CSV), and the installable app (home-screen icon, splash, install prompt, offline logging that syncs later), tank specs (equipment, livestock with the bundled species list, plants), and public pages (opt-in read-only tank pages, photo share links, share images, sitemap, optional GA4 with a consent banner).

The admin (the `ADMIN_EMAIL` Google account, or the local admin login) sets up email delivery in **Settings › Server settings**: Mailgun or any SMTP server, with a *Send test email* button.

Emails links (Mark done, Snooze, unsubscribe) use `ORIGIN`, so set it to the address people use to reach the server.

## Run it locally

Needs Node 22.

```bash
npm install
cp .env.example .env   # then set AUTH_SECRET and either Google keys or AUTH_DEV_LOGIN=true
npm run dev
```

Open http://localhost:5173. With `AUTH_DEV_LOGIN=true` the sign-in page shows a test form in place of Google, so you can try the app without OAuth keys. Never turn that on for a real server.

### Demo data

With the dev server running (and `AUTH_DEV_LOGIN=true`):

```bash
npm run seed
```

Then sign in with the test form as **demo@example.com**. You get four tanks (planted, reef, a shrimp tank and an archived one) with six months of tests, water changes, dosing, maintenance, photos, livestock, plants, equipment, tasks in every state, a published public page at `/t/riverbed-40-demo`, and a photo share link. Running it again replaces the demo account; your other accounts aren't touched.

## Deploy with Docker

```bash
docker compose up -d
```

Edit the environment in [`docker-compose.yml`](docker-compose.yml) first. Everything the app stores (SQLite database, later photos) lives in the `/data` volume.

| Variable | Needed | What it does |
|---|---|---|
| `ORIGIN` | yes | Public URL people open, e.g. `https://tanks.example.home` |
| `AUTH_SECRET` | yes | Session secret: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth client. Redirect URI: `<ORIGIN>/auth/callback/google` |
| `ADMIN_EMAIL` | recommended | This Google account becomes the admin |
| `ALLOWED_EMAILS` | optional | Who else may sign in: emails and `@domains`, comma-separated. Unset = only the admin. Removing someone signs them out on their next visit |
| `OPEN_SIGNUP` | optional | `true` lets anyone with a Google account sign up. Off by default |
| `LOCAL_ADMIN_PASSWORD_HASH` | optional | Enables the local admin fallback login. Create with `npm run hash-password -- 'your password'` |
| `LOCAL_ADMIN_USERNAME` | optional | Defaults to `admin` |
| `ENCRYPTION_KEY` | recommended | Encrypts the stored mail password/API key. Falls back to a key derived from `AUTH_SECRET` |
| `EMAIL_SCHEDULER` | optional | `off` stops reminder and digest emails |
| `DATA_DIR` | optional | Defaults to `/data` in Docker, `./data` locally |
| `BODY_SIZE_LIMIT` | optional | Largest upload. The Docker image sets `64M` so photos fit; outside Docker set it yourself, since Node defaults to 512K |
| `ADDRESS_HEADER` / `XFF_DEPTH` | behind a proxy | e.g. `X-Forwarded-For` and `1`, so failed local admin logins are limited per visitor rather than for everyone at once |

### Security notes

- Sign-in is closed by default: only the admin, `ALLOWED_EMAILS`, or everyone with `OPEN_SIGNUP=true`.
- The local admin login allows 5 failed tries per address every 15 minutes.
- `AUTH_DEV_LOGIN=true` is for tests only. The server refuses to start with it when `NODE_ENV=production` (as in the Docker image).
- Every response sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy: same-origin`, plus HSTS when `ORIGIN` is https. Only this site may post forms to it.
- Signing out clears the app's cached pages and photos on that device (browsers that support `Clear-Site-Data`).

## Tests

```bash
npm run check      # types + Svelte
npm test           # unit tests (units, status, time zones, passwords, sign-in limits)
npm run test:e2e   # Playwright: sign in → setup → create tank → log test → dashboard → complete task
```

The first time, install the Playwright browser with `npx playwright install chromium`.

## Stack

SvelteKit 2 (Svelte 5, adapter-node) · TypeScript · Drizzle ORM + better-sqlite3 · Auth.js · Vitest + Playwright. Values are stored metric (L, °C, cm, dGH) and converted for display in `src/lib/units.ts`; parameter status rules are in `src/lib/status.ts`.
