# Waterline

Self-hosted, mobile-first aquarium tracker. Log water tests and water changes tank-side, spot trends on charts, and get email reminders for maintenance. Google sign-in, imperial/metric units, full data export.

Design handoff and specs live in [`design_handoff_waterline/`](design_handoff_waterline/README.md); the build order is in [`BUILD_PLAN.md`](design_handoff_waterline/BUILD_PLAN.md). Ideas for later are in [`IDEAS.md`](IDEAS.md); what's changed, release by release, is in [`CHANGELOG.md`](CHANGELOG.md).

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

GitHub Actions also publishes ready-built images (linux/amd64), so you don't have to build on the server:

| Image | Built from |
|---|---|
| `ghcr.io/fiala06/waterline:latest` | every push to `main` (also tagged `:main`) |
| `ghcr.io/fiala06/waterline:dev` | every push to `dev` |
| `ghcr.io/fiala06/waterline:sha-xxxxxxx` | every build, for pinning or rolling back |

**HTTPS or plain HTTP.** With an HTTPS name (`ORIGIN=https://tanks.example.com` behind a reverse proxy) everything works, including Google sign-in, offline logging and the install prompt. The name can be LAN-only (local DNS plus a DNS-challenge certificate); email links and public pages then only work on your network.

To keep it on your network without a domain, set `ORIGIN` to the plain address, e.g. `http://192.168.1.50:3000`, and sign in with the local admin login (`LOCAL_ADMIN_PASSWORD_HASH`). Google won't accept a plain-HTTP address, and browsers turn off offline logging and the install prompt; everything else works.

| Variable | Needed | What it does |
|---|---|---|
| `ORIGIN` | yes | Public URL people open, e.g. `https://tanks.example.com` |
| `AUTH_SECRET` | yes | Session secret: `openssl rand -base64 32` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | yes | Google OAuth client. Redirect URI: `<ORIGIN>/auth/callback/google` |
| `ADMIN_EMAIL` | recommended | This Google account becomes the admin |
| `ALLOWED_EMAILS` | optional | Who else may sign in: emails and `@domains`, comma-separated. Unset = only the admin. Removing someone signs them out on their next visit |
| `OPEN_SIGNUP` | optional | `true` lets anyone with a Google account sign up. Off by default |
| `LOCAL_ADMIN_PASSWORD_HASH` | optional | Enables the local admin fallback login. Create with `hash-password` in the container's console, or `npm run hash-password` in the repo |
| `LOCAL_ADMIN_USERNAME` | optional | Defaults to `admin` |
| `ENCRYPTION_KEY` | recommended | Encrypts the stored mail password/API key. Falls back to a key derived from `AUTH_SECRET` |
| `EMAIL_SCHEDULER` | optional | `off` stops reminder and digest emails |
| `UPDATE_CHECK` | optional | `off` stops the check for new versions. Otherwise the server reads `CHANGELOG.md` on GitHub's `main` at most every 12 hours, and admins see *Update to 1.2 available* when it's newer |
| `UPDATE_CHECK_URL` | optional | Where that check looks instead, e.g. a fork's `https://raw.githubusercontent.com/<you>/waterline/main/CHANGELOG.md` |
| `DATA_DIR` | optional | Defaults to `/data` in Docker, `./data` locally |
| `BODY_SIZE_LIMIT` | optional | Largest upload. The Docker image sets `64M` so photos fit; outside Docker set it yourself, since Node defaults to 512K |
| `ADDRESS_HEADER` / `XFF_DEPTH` | behind a proxy | e.g. `X-Forwarded-For` and `1`, so failed local admin logins are limited per visitor rather than for everyone at once |

### Unraid

1. In the Unraid terminal, create the data folder. The container runs as uid 1000, so it needs to own it:

   ```bash
   mkdir -p /mnt/cache/appdata/waterline/data && chown 1000:1000 /mnt/cache/appdata/waterline/data
   ```

   Use your pool's path (`/mnt/cache/...`) rather than `/mnt/user/...`: SQLite's WAL mode doesn't get along with Unraid's FUSE share layer.

2. **Docker › Add Container**:
   - Repository: `ghcr.io/fiala06/waterline:latest` (or `:dev`)
   - Port: container `3000` → any free host port
   - Path: container `/data` → `/mnt/cache/appdata/waterline/data`
   - Variables: `ORIGIN`, `AUTH_SECRET`, `ENCRYPTION_KEY`, `ADMIN_EMAIL`, then `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` for Google sign-in and/or `LOCAL_ADMIN_PASSWORD_HASH` for the local admin login, plus any optional ones from the table above. Behind a reverse proxy, also `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`.
   - WebUI (under *Show more settings*): your `ORIGIN` URL. On plain HTTP, `http://[IP]:[PORT:3000]/` follows IP and port changes, but `ORIGIN` must still match the address you open.

3. With HTTPS, point your reverse proxy (Nginx Proxy Manager, SWAG, Cloudflare Tunnel…) at `http://<unraid-ip>:<host port>`. Either way, open the `ORIGIN` URL and always use that one: any other address loads, but saving fails the cross-site check.

**Updates:** each push to `main` (or `dev`) publishes a new image, and Unraid's Docker tab shows *update ready* for the container. Applying it keeps everything in `/data`; database migrations run on start. When a new version is on `main`, admins also see *Update to 1.2 available* under Settings in the app's menu; after updating, everyone gets the release's highlights once on the dashboard, and the full list is in **Settings › What's new**.

To run `latest` and `dev` side by side, create two containers with different names, host ports, data folders and `ORIGIN` values. Never point two containers at the same data folder.

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

## Releases

Each release is a section of [`CHANGELOG.md`](CHANGELOG.md), written for the people who use the app: the app shows it under **Settings › What's new**, and its first lines once on the dashboard after an update. To release, bump `version` in `package.json` and add a `## <version> · <date>` section with a few lines, each starting with its name in bold; a unit test fails if the two don't match. The *update available* note admins see comes from the changelog on `main`.

## Stack

SvelteKit 2 (Svelte 5, adapter-node) · TypeScript · Drizzle ORM + better-sqlite3 · Auth.js · Vitest + Playwright. Values are stored metric (L, °C, cm, dGH) and converted for display in `src/lib/units.ts`; parameter status rules are in `src/lib/status.ts`.
