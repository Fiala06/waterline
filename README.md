# Waterline

Self-hosted, mobile-first aquarium tracker. Log water tests and water changes tank-side, spot trends on charts, and get email reminders for maintenance. Google sign-in, imperial/metric units, full data export.

Design handoff and specs live in [`design_handoff_waterline/`](design_handoff_waterline/README.md); the build order is in [`BUILD_PLAN.md`](design_handoff_waterline/BUILD_PLAN.md). Ideas for later are tracked as [GitHub issues](https://github.com/Fiala06/waterline/issues); what's changed, release by release, is in [`CHANGELOG.md`](CHANGELOG.md).

## Status

All 13 milestones of the build plan are done: sign-in, setup, tanks and targets, logging, dashboard, history, charts, photos, tasks, email (reminders, overdue alerts, digests, out-of-range alerts, one-click actions and unsubscribe), settings and server settings, export (full backup ZIP or water tests CSV), and the installable app (home-screen icon, splash, install prompt, offline logging that syncs later), tank specs (equipment, livestock with the bundled species list, plants), and public pages (opt-in read-only tank pages, photo share links, share images, sitemap, optional GA4 with a consent banner).

The admin sets up the server in **Settings › Server settings**: Google sign-in and who can sign in, the local admin login, email delivery (Mailgun or any SMTP server, with a *Send test email* button), public pages, and switches for reminder emails and the check for new versions.

Emails links (Mark done, Snooze, unsubscribe) use `ORIGIN`, so set it to the address people use to reach the server.

## Run it locally

Needs Node 22.

```bash
npm install
cp .env.example .env   # set AUTH_DEV_LOGIN=true to try it without Google
npm run dev
```

Open http://localhost:5173. With `AUTH_DEV_LOGIN=true` the sign-in page shows a test form in place of Google, so you can try the app without OAuth keys. Never turn that on for a real server. Without it, the first page asks for a setup code, as on a real server (see [First start](#first-start)).

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

Set `ORIGIN` in [`docker-compose.yml`](docker-compose.yml) first; it's the only setting the server needs to start. Everything the app stores (the SQLite database, photos, and the keys it makes for itself) lives in the `/data` volume.

### First start

1. Open your `ORIGIN` address. A new server asks for a **setup code** first: it's in the container's log (`docker compose logs waterline`, or on Unraid **Docker › Waterline › Logs**) and in `setup-code.txt` in the data folder. Only someone who can see the server has it, so a new server can't be claimed by whoever reaches it first.
2. Choose the admin's username and password. That's the local admin login, and you're signed in with it.
3. In **Settings › Server settings**, set up the rest: Google sign-in (paste the OAuth client's ID and secret; the page shows the redirect URI to give Google), the admin's Google account, who else can sign in, and email delivery.

GitHub Actions also publishes ready-built images (linux/amd64), so you don't have to build on the server. An image is only published once the checks and tests pass:

| Image | Built from |
|---|---|
| `ghcr.io/fiala06/waterline:latest` | every push to `main` (also tagged `:main`) |
| `ghcr.io/fiala06/waterline:1.1.0` | each release, for staying on a version; `:1.1` is the newest 1.1.x |
| `ghcr.io/fiala06/waterline:dev` | every push to `dev` |
| `ghcr.io/fiala06/waterline:sha-xxxxxxx` | every build, for pinning or rolling back |

**HTTPS or plain HTTP.** With an HTTPS name (`ORIGIN=https://tanks.example.com` behind a reverse proxy) everything works, including Google sign-in, offline logging and the install prompt. The name can be LAN-only (local DNS plus a DNS-challenge certificate); email links and public pages then only work on your network.

To keep it on your network without a domain, set `ORIGIN` to the plain address, e.g. `http://192.168.1.50:3000`, and sign in with the local admin login you create on first start. Google won't accept a plain-HTTP address, and browsers turn off offline logging and the install prompt; everything else works.

Everything else is set in the app. These are the environment variables left, for the few things the server needs before it starts, or that you may want outside the app:

| Variable | Needed | What it does |
|---|---|---|
| `ORIGIN` | yes | Public URL people open, e.g. `https://tanks.example.com` |
| `ADDRESS_HEADER` / `XFF_DEPTH` | behind a proxy | e.g. `X-Forwarded-For` and `1`, so failed logins are limited per visitor rather than for everyone at once |
| `DATA_DIR` | optional | Defaults to `/data` in Docker, `./data` locally |
| `BODY_SIZE_LIMIT` | optional | Largest upload. The Docker image sets `64M` so photos fit; outside Docker set it yourself, since Node defaults to 512K |
| `AUTH_SECRET` / `ENCRYPTION_KEY` | optional | Keys for sign-in sessions and for the stored email and Google passwords. The server makes its own in `/data/keys.json` (readable only by it); set these to keep them outside the data folder. If you set them before, keep them: changing them signs everyone out, and saved passwords need entering again |
| `LOCAL_ADMIN_PASSWORD_HASH` | optional | A way back in if the admin password is lost: create one with `hash-password` in the container's console (or `npm run hash-password`); it opens the local admin login alongside the password set in the app |
| `UPDATE_CHECK_URL` | optional | Where the check for new versions looks, e.g. a fork's `https://raw.githubusercontent.com/<you>/waterline/main/CHANGELOG.md` |

Servers set up before these settings moved into the app keep working: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL`, `ALLOWED_EMAILS`, `OPEN_SIGNUP` and `LOCAL_ADMIN_USERNAME` apply until the same setting is saved in Server settings, and `EMAIL_SCHEDULER=off` and `UPDATE_CHECK=off` still turn those off.

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
   - Variable: `ORIGIN`. Behind a reverse proxy, also `ADDRESS_HEADER=X-Forwarded-For` and `XFF_DEPTH=1`. Everything else is set in the app on first start.
   - WebUI (under *Show more settings*): your `ORIGIN` URL. On plain HTTP, `http://[IP]:[PORT:3000]/` follows IP and port changes, but `ORIGIN` must still match the address you open.

3. With HTTPS, point your reverse proxy (Nginx Proxy Manager, SWAG, Cloudflare Tunnel…) at `http://<unraid-ip>:<host port>`. Either way, open the `ORIGIN` URL and always use that one: any other address loads, but saving fails the cross-site check.

**Updates:** each push to `main` (or `dev`) publishes a new image, and Unraid's Docker tab shows *update ready* for the container. Applying it keeps everything in `/data`; database migrations run on start. When a new version is on `main`, admins also see *Update to 1.2 available* under Settings in the app's menu; after updating, everyone gets the release's highlights once on the dashboard, and the full list is in **Settings › What's new**.

To run `latest` and `dev` side by side, create two containers with different names, host ports, data folders and `ORIGIN` values. Never point two containers at the same data folder.

### Troubleshooting

**Settings › Server settings › Logs** shows what went wrong: emails that didn't send, imports that couldn't be read, sign-in problems, and pages that failed, each with the reference its error page showed. Choose *What the server does too* to also see sign-ins, emails sent, imports and changes to settings, or *Everything, for 24 hours* while you track something down. **Download** gives a text file to share when asking for help, with email addresses shortened. Entries are kept for 30 days, and the container's log (`docker compose logs waterline`) has the same lines.

### Security notes

- A new server can only be set up with the setup code from its log, and sign-in is closed by default: only the admin, the people or domains the admin lists, or everyone with a Google account if the admin chooses that.
- The local admin login and the setup code allow 5 failed tries per address every 15 minutes.
- The Google client secret and email passwords are stored encrypted, never sent back to the browser.
- The profile photo in the account menu is copied from Google at each Google sign-in into `/data/avatars` and shown only to its owner, so browsers never load it from Google.
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

Changes go to `dev` first, then to `main` through a pull request (`gh pr create --base main --head dev`), which runs the checks and tests before the merge. When `main` reaches a version that hasn't been released yet, the workflow ([`ci.yml`](.github/workflows/ci.yml)) tags that build `v<version>`, publishes `:<version>` and `:<major>.<minor>` images, and makes a [GitHub release](https://github.com/Fiala06/waterline/releases) with the version's changelog section as its notes. Ideas and planned work are [issues](https://github.com/Fiala06/waterline/issues), grouped into a milestone for the next release; a commit that finishes one says `Closes #N`, and the issue closes when it reaches `main`.

## Stack

SvelteKit 2 (Svelte 5, adapter-node) · TypeScript · Drizzle ORM + better-sqlite3 · Auth.js · Vitest + Playwright. Values are stored metric (L, °C, cm, dGH) and converted for display in `src/lib/units.ts`; parameter status rules are in `src/lib/status.ts`.
