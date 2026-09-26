# CLAUDE.md — Waterline

You are building **Waterline**, a self-hosted aquarium tank log (PWA). The design is final and lives in `design_handoff_waterline/`. Read `design_handoff_waterline/README.md`, `DATA_MODEL.md` and `BUILD_PLAN.md` before writing code.

## Ground rules
- The `designs/*.dc.html` files are **visual references**, not code to copy. Open them in a browser (keep `support.js` beside them) or read their inline styles for exact values. Dark files are canonical; `* Light.dc.html` show the light theme.
- Match the designs closely: use the exact hex values, sizes and radii from README → Design tokens. Implement tokens once as CSS custom properties on `:root[data-theme="dark"|"light"]`; default to the system theme.
- Status is never color-only: always render icon + word (`✓ OK`, `▲ Near`, `✕ High`, `– No data`).
- Phone first: min tap target 44px, numeric inputs use `inputmode="decimal"`, primary actions reachable near the bottom.
- Copy (button labels, empty states, error text) comes from the designs verbatim unless it contains sample data.

## Stack
SvelteKit (adapter-node) · TypeScript · Drizzle ORM + better-sqlite3 (`/data/waterline.db`) · Auth.js (Google + credentials for local admin) · Nodemailer (SMTP) + Mailgun HTTP API · node-cron · sharp · satori + resvg (OG images) · @vite-pwa/sveltekit · Vitest + Playwright. Single Dockerfile, volume `/data`.

## Env vars
`ORIGIN`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ADMIN_EMAIL` (becomes admin on first Google sign-in), `LOCAL_ADMIN_PASSWORD_HASH` (optional), `DATA_DIR=/data`, `ENCRYPTION_KEY` (for stored mail secrets).

## Conventions
- Store metric; convert at the edge with helpers in `src/lib/units.ts` (unit-tested).
- Status logic lives in `src/lib/status.ts` (see README → Parameter status; unit-test edge cases incl. min = 0).
- Server data via `+page.server.ts` load + form actions; progressive enhancement (forms work without JS).
- Every write that changes tank state also writes an `events` row, so History stays complete.
- Public routes (`/t/[slug]`, `/s/[id]`) are SSR, never expose private fields, and load GA4 only when configured and consented.
- Email sending goes through `src/lib/server/mail/` with `mailgun.ts` and `smtp.ts` behind one interface.

## Workflow
- Work milestone by milestone from `BUILD_PLAN.md`. After each: run `npm run check`, `npm test`, and the Playwright core-flow test once it exists, then commit.
- Compare each finished screen against its design label (e.g. `03 Dashboard`, `D5 Tasks`) at 390px and 1280px widths, in both themes.
- Ask the product owner before inventing features not in the designs. Decided: reef and other tank-type presets live in `defaultParameters()` in `src/lib/params.ts`; the bundled species list is built from Wikipedia + Wikidata (`npm run build:species`, see `src/lib/server/data/SPECIES_SOURCES.md`).
