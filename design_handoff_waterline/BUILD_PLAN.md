# Waterline — suggested build order

All 13 milestones are done: they were the first release, 1.0.0. Later work is tracked as [GitHub issues](https://github.com/Fiala06/waterline/issues), and each release's changes are in [`CHANGELOG.md`](../CHANGELOG.md).

1. **Scaffold**: SvelteKit + Drizzle/SQLite + Dockerfile (`/data` volume) + design tokens as CSS variables (dark/light via `data-theme`, default system).
2. **Auth**: Google (Auth.js) + optional local admin (env-seeded password hash). First-login setup (02/D2).
3. **Tanks**: create/edit/archive (10/D4), parameters & targets with custom params (G7).
4. **Logging**: quick add (04/D12), water test (05/08) with live status, events (14, G2–G5, D13), date picker (G9), edit/delete (G6).
5. **Dashboard** (03/07): status cards, days since water change, due tasks, trend chart with event markers, recent activity; empty state.
6. **History, Charts, Photos** (11–13b, D6–D8, 19).
7. **Tasks** (06/15/D5): schedules, snooze (G8), mark-done → open log form.
8. **Email**: provider abstraction (Mailgun API / SMTP), templates E1–E5 (MJML or hand-built tables), cron jobs, signed action tokens, unsubscribe.
9. **Settings + Admin** (16/18/D9/D11) incl. test email.
10. **Export** (17/D10/G10): background job, ZIP (JSON + photos) and CSV.
11. **PWA**: manifest, icons, animated splash, install prompt, offline queue + sync (G11).
12. **Tank specs**: equipment, livestock, plants tabs (T1–T7).
13. **Public pages**: SSR `/t/[slug]`, photo shares `/s/[id]`, SEO tags, sitemap/robots, OG image generation, GA4 + consent (P1–P5, S1–S4).

Acceptance for the core flow: a new user can sign in → set up → create a tank → log a test (sees inline status) → see it on the dashboard → complete a task — matching `Waterline Prototype.dc.html`.
