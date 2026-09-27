# Kickoff prompt for Claude Code

*Kept for history: this is the prompt the project was started with. `CLAUDE.md` is now at the repo root, and all milestones of `BUILD_PLAN.md` are done.*

Paste this into Claude Code from the root of an empty repo (e.g. `Fiala06/waterline`) with the `design_handoff_waterline/` folder copied in. Move `design_handoff_waterline/CLAUDE.md` to the repo root first.

---

Build Waterline, the app specified in `design_handoff_waterline/`. Start by reading `CLAUDE.md`, then `design_handoff_waterline/README.md`, `DATA_MODEL.md` and `BUILD_PLAN.md`, and skim the design files in `design_handoff_waterline/designs/`.

Then:
1. Propose the project structure and confirm the stack in `CLAUDE.md`, and list any questions.
2. Implement **milestones 1–5** of `BUILD_PLAN.md` (scaffold, auth, tanks + targets, logging, dashboard) so the core flow works end to end, matching `Waterline Prototype.dc.html` and screens 01–08.
3. Add unit tests for `units.ts` and `status.ts`, plus a Playwright test for: sign in (mock Google) → setup → create tank → log water test → dashboard shows statuses → complete a task.
4. Provide the Dockerfile and a `docker-compose.yml` example with the `/data` volume.

Stop after milestone 5 and summarize what's done and what's next before continuing.
