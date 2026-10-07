# Waterline Comprehensive Code Review — 2026-10-06

## 1. Executive Summary

Waterline is a comparatively healthy, well-tested SvelteKit application with deliberate authorization boundaries, strong progressive-enhancement conventions, thoughtful mobile/offline UX, and generally good use of transactions and database indexes. The most serious defect is a **P0 data-loss path in the legacy local-admin/Google-admin account merge**, where omitted `user_id` relationships can cascade-delete saved test kits and accepted shared-tank memberships. The dominant performance pattern to address is **unbounded historical reads**: sensor data, manual water-test history, and timeline construction often load far more rows than the UI needs, so otherwise-correct features get slower as a tank ages. Security fundamentals are strong—dedicated hashed bearer tokens, role checks, PKCE/exact OAuth redirects, CSP/security headers, rate-limited local auth—but concurrency/state invariants and long-term regression coverage should be tightened. UI/feature logic is coherent and user-centered overall; the main maintainability concern is that several core forms/charts have grown into 600–1,100-line components that mix orchestration, validation, derived state, and presentation.

## 2. Prioritised Action Items

### P0 — Will cause data loss, security breach, or production crash

#### P0.1 — Prevent data loss during local-admin/Google-admin account merge
**GitHub:** https://github.com/Fiala06/waterline/issues/112

**Affected files / functions**
- `src/lib/server/users.ts` — `joinAccounts()`, `upsertUser()`
- `src/lib/server/db/schema.ts` — all tables that reference `users.id`
- `src/lib/server/users.test.ts`
- `src/lib/server/members.ts`

**Problem**

`joinAccounts()` reassigns only a hand-maintained subset of user-owned rows before deleting the duplicate Google user. Tables omitted from that list but configured with `ON DELETE CASCADE` are silently destroyed. Confirmed user-visible losses include `testKits` and accepted `tankMembers`; the latter can remove access to tanks shared by other keepers. Other user-linked tables need an explicit retain/merge/invalidate policy rather than relying on cascade behavior.

**Fix prompt**

> Review `src/lib/server/users.ts` (`joinAccounts`, `upsertUser`), `src/lib/server/db/schema.ts`, `src/lib/server/users.test.ts`, and membership helpers in `src/lib/server/members.ts`. The legacy pre-1.8.3 migration merges a duplicate Google admin into the local-admin account, then deletes the duplicate user. Make that merge exhaustive and transactional for every user-linked table. At minimum preserve saved `testKits` and accepted `tankMembers`, resolve duplicate memberships safely, and define explicit policies for notification preferences, email dedupe rows, OAuth codes, tokens, exports/imports, push subscriptions, calendar feeds, and future tables. Add a regression test that seeds every relevant relationship and fails if a newly added `user_id` relationship lacks an explicit merge policy. Preserve current account identity and sign-in UX.

---

### P1 — Likely to cause bugs or meaningfully degrade UX / performance under real conditions

#### P1.1 — Make OAuth refresh-token rotation atomic and replay-safe
**GitHub:** https://github.com/Fiala06/waterline/issues/100

**Affected files / functions**
- `src/lib/server/assistant/oauth.ts` — refresh-token lookup/rotation
- `src/routes/oauth/token/+server.ts`
- OAuth unit/integration tests

**Problem**

Refresh rotation currently follows a select-validate-update sequence. Two concurrent refreshes can validate the same token before either write wins, issuing multiple credential sets and potentially immediately invalidating one caller's new refresh token. This weakens replay guarantees at an authentication boundary.

**Fix prompt**

> Update `src/lib/server/assistant/oauth.ts` and `src/routes/oauth/token/+server.ts` so a refresh token succeeds at most once. Replace select-then-update rotation with an atomic compare-and-swap using the expected current refresh hash in the UPDATE predicate and require exactly one changed row. Return OAuth `invalid_grant` on reuse/race, optionally revoke the connection on detected replay, never log token material, and add concurrent/replay regression tests. Preserve normal OAuth 2.1/PKCE behavior and existing access-token expiry semantics.

#### P1.2 — Optimize newest sensor-reading lookup
**GitHub:** https://github.com/Fiala06/waterline/issues/99

**Affected files / functions**
- `src/lib/server/sensors.ts` — `latestSamples()`
- Dashboard and assistant callers
- `src/lib/server/db/schema.ts` sensor index

**Problem**

`latestSamples()` reads every sensor row for a tank, sorts newest-first, then keeps the first row per parameter in Node. With minute-level readings retained for a year, a handful of probes can create millions of rows, making the dashboard cost proportional to history size.

**Fix prompt**

> Rewrite `src/lib/server/sensors.ts::latestSamples()` so SQLite returns only the newest sensor row per parameter for one tank. Use a window function, grouped MAX joined back to the indexed table, or another query proven efficient with SQLite. Preserve the returned Map shape and current dashboard/API behavior. Verify `sensor_readings_tank_param_at` with `EXPLAIN QUERY PLAN`, add a large synthetic-data regression/performance test, and ensure work scales with parameter count instead of historical row count.

#### P1.3 — Make sensor ingestion atomic and batch-efficient
**GitHub:** https://github.com/Fiala06/waterline/issues/113

**Affected files / functions**
- `src/lib/server/sensors.ts` — `recordSamples()`
- `src/routes/api/v1/[...path]/+server.ts` — sensor POST
- `src/lib/server/sensors.test.ts`
- `e2e/sensors.test.ts`

**Problem**

The “one sample within a rolling 60-second gap” rule is implemented as a per-reading SELECT followed by INSERT with no transaction. Concurrent sensor requests can both observe no nearby row and both insert, violating the feature contract. A 100-reading batch also performs many database round trips.

**Fix prompt**

> Update `recordSamples()` and the sensor POST path so the whole validated batch is processed atomically. Enforce `MIN_GAP_MS` against existing rows and earlier accepted readings in the same payload, and prevent concurrent requests from inserting two readings inside the gap for one tank/parameter. Preserve the current per-reading `stored: true/false` results, partial 207 behavior, unit conversion, timestamp validation, and token scope. Add concurrency and 100-reading batch tests and document query-count/performance improvement.

#### P1.4 — Version authenticated page/data caches across releases
**GitHub:** https://github.com/Fiala06/waterline/issues/114

**Affected files / functions**
- `src/service-worker.ts` — `PAGES`, activate handler, `networkFirst()`
- `e2e/offline.test.ts`

**Problem**

The app shell is versioned with the SvelteKit service-worker version, but authenticated HTML/`__data.json` remains in a permanent `pages-v1` cache. After an upgrade, new client code can receive stale response shapes or HTML while offline, and old HTML may reference obsolete hashed assets.

**Fix prompt**

> Review `src/service-worker.ts` and `e2e/offline.test.ts`. Make authenticated page/data caches release-aware, delete stale page-cache versions during service-worker activation, and keep media retention as a separately explicit choice. Preserve sign-out/forget-device clearing and offline queued logging. Add an upgrade regression test that seeds an old cache, activates a new worker, goes offline, and proves the new application never consumes old page/data responses.

#### P1.5 — Bound timeline queries to the displayed window
**GitHub:** https://github.com/Fiala06/waterline/issues/115

**Affected files / functions**
- `src/lib/server/timeline.ts` — `timelineEntries()`
- Public/private timeline callers
- Timeline tests

**Problem**

Even with `opts.limit`, the function loads all timeline photos before slicing, then all tests/readings/events for the tank, and repeatedly scans livestock/plants for every displayed photo. Runtime grows with total tank history rather than the timeline being rendered.

**Fix prompt**

> Optimize `src/lib/server/timeline.ts::timelineEntries()`. First fetch only the newest requested timeline photos in SQL and reverse them for oldest-first display. Bound test/readings queries to only what is required to find nearest tests around that photo window, bound events to the first/last displayed photo, and replace per-photo full livestock/plant scans with a linear sweep or equivalent precomputed change structure. Preserve nearest-test behavior, gap summaries, privacy switches, public-page behavior, and ordering. Add large-history boundary/performance tests.

#### P1.6 — Eliminate unbounded manual water-test history scans
**GitHub:** https://github.com/Fiala06/waterline/issues/116

**Affected files / functions**
- `src/lib/server/logs.ts` — `latestReadings()`, `testsSince()`
- `src/lib/server/notifications.ts` — `alertOutOfRange()`
- Dashboard/app shell, summaries, trends, assistant tooling

**Problem**

Newest/previous-reading queries routinely materialize whole histories. `latestReadings()` reads every tank reading then de-duplicates in Node; out-of-range notification logic loads every historical reading for a parameter then finds the previous one; `testsSince()` repeatedly filters a shared reading array for every test.

**Fix prompt**

> Optimize manual water-test access in `src/lib/server/logs.ts` and `src/lib/server/notifications.ts`. Make `latestReadings()` return only one newest row per parameter from SQLite; make the previous-reading alert query apply `takenAt < current` in SQL and fetch one row; group `testsSince()` child readings into a Map in one pass rather than filtering all rows for every test. Preserve status/ordering semantics and all caller output. Verify relevant indexes/query plans and add large-history regression/performance tests.

#### P1.7 — Strengthen the local-admin password policy
**GitHub:** https://github.com/Fiala06/waterline/issues/102

**Affected files / functions**
- `src/routes/first-run/+page.server.ts`
- Server-settings password change path
- `src/lib/server/password.ts`
- Local-auth tests

**Problem**

The administrative recovery login accepts an 8-character minimum password. Hashing, timing-conscious verification, and rate limiting are good, but this path has no second factor and deserves a stronger passphrase-oriented minimum plus compromised-password protection.

**Fix prompt**

> Modernize local-admin password creation/change while preserving existing installations. Raise the minimum to a passphrase-friendly value, avoid composition rules, continue supporting long/Unicode passwords, and reject common/known-compromised passwords using a privacy-preserving or local method. Apply the same validator to first-run and password changes, keep existing rate limiting/constant-work verification, and add tests for weak, compromised, long, and Unicode inputs. Do not lock out an existing server solely because its current password predates the new policy.

---

### P2 — Technical debt that compounds if left; refactors and pattern inconsistencies

#### P2.1 — Downsample sensor chart data inside SQLite
**GitHub:** https://github.com/Fiala06/waterline/issues/103

**Affected files / functions**
- `src/lib/server/sensors.ts` — `sampleSeries()`
- Chart/public-page callers
- Sensor retention/pruning

**Problem**

Charts need a few hundred points, but `sampleSeries()` loads every raw sample in the selected period and averages it in Node. One year at one sample/minute is roughly 525,600 rows per parameter.

**Fix prompt**

> Move `sampleSeries()` time bucketing/aggregation into SQLite so only a bounded set of chart points leaves the database. Preserve visible trend shape and do not unintentionally hide spikes; consider min/max alongside average if needed. Benchmark 30/90/365-day histories, validate query plans/index use, and keep retention/rollup complexity no greater than necessary. Add tests comparing SQL-downsampled output to known raw input.

#### P2.2 — Batch global app-shell tank/alert queries
**GitHub:** https://github.com/Fiala06/waterline/issues/105

**Affected files / functions**
- `src/routes/(app)/+layout.server.ts`
- Tank/parameter/latest-reading/task helpers it calls

**Problem**

The authenticated layout runs on nearly every navigation and performs per-tank data gathering. With many tanks, global shell cost grows N-per-tank and can dominate unrelated page loads.

**Fix prompt**

> Profile `src/routes/(app)/+layout.server.ts` with 1, 10, 25, and 50 owned/shared tanks, then consolidate repeated per-tank reads into bulk queries for latest readings, parameters, task/alert counts, and other shell-only summaries. Preserve role visibility and current shell payload semantics. Add multi-tank regression tests and record before/after query count/latency; do not introduce a caching layer unless batching alone is insufficient.

#### P2.3 — Enforce one active tank membership per person/tank
**GitHub:** https://github.com/Fiala06/waterline/issues/117

**Affected files / functions**
- `src/lib/server/members.ts` — `resendMember()`, `restoreMember()`, `tankRole()`
- `src/routes/(app)/tanks/[id]/sharing/+page.server.ts`
- `tank_members` schema/indexes

**Problem**

Resending an accepted member or restoring an older removed row after a re-invite can create multiple active accepted rows for one person/tank. `tankRole()` then uses an unordered `.get()`, so conflicting roles become ambiguous.

**Fix prompt**

> Add a one-active-membership invariant across `src/lib/server/members.ts`, the Sharing server actions, and the `tank_members` schema. Resend must only operate on pending/expired invites; restore must not reactivate a second active membership. Add a migration/repair strategy for legacy duplicates and make role resolution deterministic. Preserve historical removed/expired rows and normal invite/remove/Undo UX. Add tests for accepted-resend, remove/reinvite/restore, and conflicting-role sequences.

#### P2.4 — Replace synchronous filesystem I/O in live request paths
**GitHub:** https://github.com/Fiala06/waterline/issues/118

**Affected files / functions**
- `src/lib/server/photos.ts`
- `src/lib/server/expenses.ts`
- `src/lib/server/avatar.ts`
- `src/lib/server/people.ts`
- `src/lib/server/stock-photos.ts`
- `src/routes/(app)/stock/[file]/+server.ts`

**Problem**

Multi-megabyte uploads, receipt moves, avatar writes, account deletion, and stock-photo serving use synchronous fs APIs. In Waterline's single Node process, slow disk I/O blocks unrelated requests.

**Fix prompt**

> Convert synchronous live-request filesystem work in the listed modules to `node:fs/promises` or streams and propagate async signatures cleanly. Define file/DB ordering so failures do not leave orphaned rows/files or lose data, preserve image size/type/metadata stripping and current authorization/error behavior, and add focused failure-path tests. Do not add background queues unless async fs alone proves insufficient.

#### P2.5 — Add indexes for high-frequency photo queries
**GitHub:** https://github.com/Fiala06/waterline/issues/119

**Affected files / functions**
- `src/lib/server/db/schema.ts` — `photos`
- `src/lib/server/photos.ts`
- `src/lib/server/timeline.ts`
- `src/lib/server/public.ts`
- `src/lib/server/assistant/tools.ts`

**Problem**

The photo table has no secondary indexes despite frequent tank/date, tank/timeline/date, event, and test lookups. Photo-heavy tanks therefore accumulate table scans and sorts.

**Fix prompt**

> Analyze real photo query shapes and add the minimum useful Drizzle/SQLite indexes—likely `(tank_id, taken_at)`, `(tank_id, in_timeline, taken_at)`, `event_id`, and `test_id`. Generate the migration, use `EXPLAIN QUERY PLAN` against a large photo fixture, remove redundant indexes if one composite covers another path, and preserve write performance/order/privacy semantics.

#### P2.6 — Decompose monolithic forms/charts without atomizing the UI
**GitHub:** https://github.com/Fiala06/waterline/issues/120

**Affected files / functions**
- `src/lib/components/EventForm.svelte` (~1,080 lines)
- `src/lib/components/TestForm.svelte` (~1,030)
- `src/lib/components/TaskForm.svelte` (~750)
- `src/lib/components/AddSeveral.svelte` (~720)
- `src/lib/components/TrendChart.svelte` (~650)
- `src/lib/components/EquipmentForm.svelte` (~600)

**Problem**

These components mix state machines, validation, timers/fetching, derived calculations, and large presentation trees. They are still functional, but changes increasingly require reasoning across an entire feature in one file and increase regression/re-render risk.

**Fix prompt**

> Refactor the listed Svelte components so each retains a clear orchestration layer while cohesive business/state logic moves to testable colocated modules and genuinely meaningful/reused UI sections become subcomponents. Preserve progressive enhancement, DOM/accessibility semantics, copy, phone/desktop behavior, and current routes/actions. Avoid “component-per-div” fragmentation. Add unit tests for extracted pure logic and keep Playwright flows green in both viewport classes/themes.

#### P2.7 — Harden/document offline private-data lifecycle
**GitHub:** https://github.com/Fiala06/waterline/issues/108

**Affected files / functions**
- `src/service-worker.ts`
- `src/lib/offline.ts`
- Sign-out/session-revocation paths
- Offline settings UI

**Problem**

Offline support intentionally stores authenticated pages/media and queued writes locally. Explicit sign-out clears data, but account switching/revocation and user expectations around locally retained private data need a stronger lifecycle contract.

**Fix prompt**

> Make Waterline's private offline-data lifecycle explicit. Add a visible “Forget this device / Remove offline data” control, clear prior-user caches/queues on identity change or revoked session once connectivity returns, ensure queued writes remain permanently bound to the user who created them, and document the unavoidable inability to remotely erase an already-offline device until it reconnects. Preserve useful offline logging and add E2E tests for sign-out, account switch, and revocation.

#### P2.8 — Add explicit authorization/token-boundary regression coverage
**GitHub:** https://github.com/Fiala06/waterline/issues/106

**Affected files / functions**
- Major object routes/actions
- Shared-tank roles
- `/mcp`, `/api/v1`, sensor/assistant tokens
- Public/share links
- CSRF/origin hook

**Problem**

Authorization implementation is generally strong, but the number of object types and role/token modes is now large enough that a dedicated boundary suite is warranted. Broad feature E2E tests are not a substitute for intentional IDOR/role/scope regression tests.

**Fix prompt**

> Add a security-focused test group that attempts cross-user object ID access across tanks, tests/events/photos/tasks/exports, verifies `view`/`log`/`owner` boundaries, verifies assistant versus sensor token scope/kind, revoked/expired/replayed credentials, public/share revocation, and cookie-backed cross-origin mutation refusal. Reuse production helpers rather than test-only authorization logic and make failure names clearly identify the violated boundary.

---

### P3 — Polish, consistency, minor DX improvements

#### P3.1 — Batch low-risk code-review quick wins
**GitHub:** https://github.com/Fiala06/waterline/issues/121

**Affected files / functions**
- `src/hooks.server.ts`
- `src/lib/server/people.ts::personFootprint()`
- `.dockerignore`
- Clearly equivalent in-memory parent/child grouping touched by the batch

**Problem**

A few low-risk inefficiencies are safe to clean up together: duplicate `publicSettings()` lookup in one request path, an admin-only per-tank photo-count query, and the current redesign handoff unnecessarily remaining in Docker build context.

**Fix prompt**

> Make a no-user-visible-change cleanup batch: cache `publicSettings()` once in the signed-out-root hook branch; aggregate account-removal photo counts without one query per tank; add `design_handoff_waterline_redesign/` to `.dockerignore`; and only where obviously equivalent and covered, replace repeated child-array `.filter()` association loops with a pre-indexed Map. Run check/unit/E2E and do not mix feature changes into this batch.

#### P3.2 — Add browser performance budgets and regression reporting
**GitHub:** https://github.com/Fiala06/waterline/issues/110

**Affected files / functions**
- CI workflow
- Production build
- Representative dashboard/charts/history/photos/public routes

**Problem**

The project has strong correctness testing but no browser-facing performance budget, so bundle weight and Core Web Vitals can regress incrementally without a clear signal.

**Fix prompt**

> Add stable production-build performance reporting for a small set of realistic seeded routes. Track bundle/JS growth and representative LCP/CLS/INP or equivalent synthetic metrics, use warning/failure thresholds tolerant of CI noise, and report large regressions on PRs. Keep this lightweight: do not turn noisy single-run Lighthouse numbers into brittle gates.

#### P3.3 — Pin CI actions and Docker bases to immutable revisions
**GitHub:** https://github.com/Fiala06/waterline/issues/109

**Affected files / functions**
- `.github/workflows/ci.yml`
- `Dockerfile`
- Dependency update automation

**Problem**

Major-version action tags and mutable base-image tags reduce build reproducibility and add avoidable supply-chain drift.

**Fix prompt**

> Pin third-party GitHub Actions to full commit SHAs with readable version comments and pin Node Docker bases by digest. Configure Dependabot/Renovate or equivalent to propose controlled updates, retain least-privilege workflow permissions, and confirm CI/release output is otherwise unchanged.

## 3. Quick Wins

The safe cleanup batch is tracked in **#121** and should be handled separately from behavior-changing work.

**Batch prompt**

> In Waterline, perform only these low-risk cleanup changes: (1) in `src/hooks.server.ts`, call `publicSettings()` once and reuse the result in the signed-out root redirect decision; (2) in `src/lib/server/people.ts::personFootprint()`, count photos across owned tank IDs with one aggregate query rather than one query per tank; (3) add `design_handoff_waterline_redesign/` to `.dockerignore` because it is a repository visual reference, not build context; and (4) in code already touched by this batch, replace only obviously equivalent repeated child-array filtering with one-pass Map grouping. No copy, UI, API, database schema, authorization, or feature behavior changes. Run `npm run check`, `npm test`, and Playwright tests.

Other small improvements are intentionally folded into their parent issues rather than opened separately:
- Add the SQL time predicate + `LIMIT 1` to the previous-reading alert lookup as part of #116.
- Pre-index batched test readings as part of #116.
- Validate/repair duplicate memberships as part of #117 rather than adding defensive branches throughout callers.
- Keep photo-index work in #119 so schema and migration stay together.

## 4. Redundancy Removal Log

- **No production source file, route, helper, import, or feature flag was identified with enough confidence to recommend outright deletion.** The repository's design-handoff trees are intentionally referenced by `README.md` and `CLAUDE.md`; they should remain in source control.
- **`design_handoff_waterline_redesign/` should be removed from Docker build context, not from the repository.** This is tracked in #121.
- **Legacy environment-variable compatibility is intentionally documented and still supported.** It should not be deleted as “dead configuration” without a separate deprecation/migration decision.
- **No speculative dead-code deletion tickets were created.** Waterline's current TypeScript/Svelte checks and broad E2E suite make unsupported “looks unused” deletion riskier than the small maintenance benefit; deletions should be based on a module/reference graph or a proven unreachable feature path.

---

### Review disposition

New issues created by this review: **#112–#121**. Existing issues reused instead of duplicated: **#99, #100, #102, #103, #105, #106, #108, #109, #110**.
