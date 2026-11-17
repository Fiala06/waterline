#!/bin/bash
# Installs the project's packages at the start of a Claude Code cloud session,
# so npm run check, npm test and the Playwright tests work straight away.
set -euo pipefail

# Cloud sessions only: a local checkout keeps its own node_modules
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# Install only if a file that decides what gets installed has changed since the
# install last succeeded
hashes=node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  # Delete the old hashes first, so a failed install runs again next time
  rm -f "$hashes"

  # npm ci, not npm install: install rewrites package-lock.json, which would
  # leave every session with a change it didn't make. The browser is already in
  # the container (PLAYWRIGHT_BROWSERS_PATH)
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund

  sha256sum .claude/hooks/session-start.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
fi

# The container's Chromium is not the build this project's Playwright asks for,
# so point playwright.config.ts at it (PW_CHROMIUM) for the rest of the session
if [ -n "${CLAUDE_ENV_FILE:-}" ] && [ -x /opt/pw-browsers/chromium ] && [ -z "${PW_CHROMIUM:-}" ]; then
  echo 'export PW_CHROMIUM=/opt/pw-browsers/chromium' >> "$CLAUDE_ENV_FILE"
fi
