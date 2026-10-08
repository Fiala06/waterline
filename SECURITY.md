# Security

## Reporting a problem

Please report a vulnerability privately, through [GitHub's private vulnerability reporting](https://github.com/Fiala06/waterline/security/advisories/new), not as a public issue. Say what you found, how to reproduce it, and which version (Settings › What's new, or the image tag). Fixes go out as a patch release.

Waterline is self-hosted: run the newest release, keep `ORIGIN` on HTTPS, and keep `/data` (the database, `keys.json` and photos) private and backed up.

## What CI checks

Every push and pull request runs these beside the tests. A failing check stops a release, because the image is only published once every job on `main` has passed.

| Check | Where | Blocks on |
|---|---|---|
| **CodeQL** (security-extended queries) for the TypeScript/Svelte code and the workflows | [`security.yml`](.github/workflows/security.yml), also weekly | Findings appear under the repository's Security › Code scanning; review them before a release |
| **Dependency review**: packages a pull request adds or changes | `security.yml`, pull requests | A new dependency with a **high** or **critical** advisory |
| **npm audit** of production dependencies (dev tools aren't in the image) | `security.yml`, also weekly | Any **high** or **critical** advisory not on the allow list |
| **Image scan** with [Grype](https://github.com/anchore/grype): the image as it ships, OS packages and Node modules | [`ci.yml`](.github/workflows/ci.yml), before publishing | Any **high** or **critical** vulnerability that has a fix |
| **SBOM** (SPDX) of the image | `ci.yml`, each release | Attached to the GitHub release; the image in ghcr.io also carries its SBOM and build provenance |
| **Dependabot**: npm, GitHub Actions and the Docker base image | [`dependabot.yml`](.github/dependabot.yml) | Weekly pull requests, security updates as soon as there's an advisory |

Moderate and low findings don't block; they're fixed with the regular updates.

The jobs run with read-only permissions, plus only what each needs (CodeQL uploads its results, dependency review comments on its pull request, publishing writes the package, the release writes the tag). Third-party actions are pinned to a commit rather than a tag that could be moved.

Turn on **secret scanning** and **push protection** in the repository's Settings › Code security; they aren't workflow steps.

## Pinned versions

What builds a release is fixed, not whatever a tag points to that day (#109):

- **GitHub Actions** are pinned to a full commit, with the release beside it: `actions/checkout@3d3c42e… # v7.0.1`.
- **The Docker base image** is pinned to a digest: `node:22-bookworm-slim@sha256:c3de60b…`, in both stages of the Dockerfile.

[Dependabot](.github/dependabot.yml) keeps them current: each week it opens a pull request when an action has a new release (the commit and the comment change together) or when `node:22-bookworm-slim` is rebuilt with fixes (a new digest). CI runs on it like any other change, the image scan included; merge it once it's green. Node's odd-numbered versions, which are short-lived, aren't offered.

To pin a new action by hand, look up the commit its release tag points to (`git ls-remote --tags https://github.com/<owner>/<action>`, the `^{}` line for an annotated tag) and write it with the version as a comment.

## When a finding can't be fixed yet

Don't lower the bar; record the exception where the check reads it, with the reason and a date to look again:

- **npm audit:** add `{ "id": "GHSA-…", "package": "…", "reason": "…", "until": "YYYY-MM-DD" }` to [`.github/security/npm-audit-allow.json`](.github/security/npm-audit-allow.json). After `until` the check fails again until it's fixed or looked at afresh. `node scripts/npm-audit.mjs` runs the same check locally.
- **Image scan:** add an `ignore` entry to [`.grype.yaml`](.grype.yaml), with a comment saying why it can't reach Waterline and when to look again.

A reason says why Waterline isn't affected (the code path is never used, the package only runs at build time), not that the fix is inconvenient.

[OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) is the baseline we measure the app against.
