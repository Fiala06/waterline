---
name: release
description: Release Waterline - turn what's under Unreleased in CHANGELOG.md into a new version, push it, and confirm the image was published. Use only when the product owner asks for a release ("release", "ship it", "cut 1.x.y", /release).
---

# Release Waterline

A release is a new `version` in `package.json` on `main` that has no `v<version>` tag yet. CI (`.github/workflows/ci.yml`) then runs the full set (every browser, the performance budgets, the Docker build, the security checks), publishes `ghcr.io/fiala06/waterline` as `:latest`, `:<version>` and `:<major>.<minor>`, tags `v<version>` and makes the GitHub release from that version's changelog section. You never tag or publish by hand.

Release only when the product owner asks. If an argument was given (`/release 1.23.0` or `/release minor`), use it as the version.

## 1. What is being released

- Read `## Unreleased` in `CHANGELOG.md`. If it is empty, look at the commits since the last `Release` commit: if they changed something people would notice, write their lines now (the rules are at the top of `CHANGELOG.md`); if there is nothing at all to release, say so and stop.
- The work must be on `main`, or on a branch that will be merged to it. Start from the latest `origin/main`.

## 2. Pick the version

- **Patch** (1.22.4 → 1.22.5): fixes and small additions. This is nearly every release.
- **Minor** (1.22.4 → 1.23.0): only when the release has a sizeable new feature.
- Never backwards and never a version that already has a tag (`git ls-remote --tags origin "v<version>"`): the update check and the Docker tags compare them.

Say which you picked and why in one line; don't stop to ask unless it is a real toss-up between patch and minor.

## 3. Make the release commit

1. `CHANGELOG.md`: put `## <version> · <YYYY-MM-DD>` (today, with the middle dot) under `## Unreleased`, so Unreleased is left empty above it and its lines now sit under the new heading. Read the lines once more as a keeper would: bold name, what it does for them, a link to where it lives, no internals.
2. `package.json`: set `version`. Then `npm install --package-lock-only` so `package-lock.json` carries the same version (it appears twice near the top), and check the diff holds nothing else.
3. If the release changes what the app does, check `README.md` and `design_handoff_waterline/DATA_MODEL.md` are in step.
4. Run `npm run check`, `npm test` (a test checks the newest changelog heading matches `package.json`) and `npm run test:e2e -- --trace off`. A failure stops the release: fix it or report it, never skip a test.
5. Commit as `Release <version>: <the release in a few plain words>`, with a short body and a `Closes #N` line for each issue it finishes that isn't closed yet.

## 4. Get it onto main

- On `main`: push.
- On a session branch (cloud sessions can push only to their own branch): push the branch, then ask the product owner to merge it, or to say that you should open and merge a pull request. A pull request needs their say-so each time. The release happens when the commit lands on `main`.

## 5. Confirm it published

Watch the CI run for the release commit on `main` (GitHub MCP `actions_list` / `actions_get`; it takes roughly 15 to 25 minutes). Done means all of:

- every job passed, including **Publish image** and **GitHub release**;
- the tag `v<version>` and the GitHub release exist.

If a job fails, read its log (`get_job_logs`), fix the cause in a new commit and push; the same version releases once the run is green, since it still has no tag. Don't bump the version to retry.

## 6. Report

Tell the product owner: the version, what is in it in two or three lines, that `:latest` and `:<version>` are published (or exactly what is still running or failed), and how to update their server:

```bash
docker compose pull && docker compose up -d
```

Mention any migration in `drizzle/` that the release adds (they apply on start) and any setting they need to switch on.
