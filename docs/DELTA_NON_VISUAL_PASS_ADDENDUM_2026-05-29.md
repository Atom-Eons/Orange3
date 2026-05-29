# Orangebox Delta Non-Visual Pass Addendum — 2026-05-29

This addendum records backend/Ops/API/CI-only changes made after the operator explicitly routed frontend visual work to a separate chat.

## Active Boundary

Frontend visual work is out of scope in this lane.

Do not touch:

- `frontend/src/**`
- frontend CSS/design files
- mockup state tuning
- pixel-perfect visual changes
- living dashboard taste/animation changes

Allowed here:

- backend/Ops scripts
- API build/test correctness
- AtomSmasher route/API health
- GitHub Actions / CI proof
- non-mutating doctors
- receipt/log/proof infrastructure
- docs that track backend/Ops changes

## Commits In This Non-Visual Pass

### 8021fe1 — `.github/workflows/project-green.yml`

Added CI `DATABASE_URL` environment variable.

Reason:

Prisma generation can fail in a clean GitHub runner if `DATABASE_URL` is absent. The workflow now provides a harmless dummy Postgres URL so `prisma generate` can run without connecting to a live database.

### 22d2a5b — `apps/api/src/runtime/id.test.ts`

Added a minimal API runtime Vitest test.

Reason:

`apps/api` had a `test` script but no obvious test file. `vitest run` commonly fails when no tests are found. This gives the API workspace a real backend test target without changing production logic.

### f7ad9ec — `.github/workflows/project-green.yml`

Added `workflow_dispatch` and API test execution to Project Green.

Reason:

The workflow is now manually triggerable from GitHub and proves API tests in addition to syntax and builds.

### d1c65b8 — `.github/workflows/ops-script-doctor.yml`

Added `workflow_dispatch` to Ops Script Doctor.

Reason:

The package script doctor can now be run manually from GitHub Actions, even if push workflows do not appear through the connector.

## Existing Issue For Codex / Dev Mode

Issue:

https://github.com/AtomEons/orangebox-delta/issues/2

Purpose:

Backend/Ops Project Green Test Pass. Codex/dev mode should run the commands, capture logs, fix only small unambiguous backend/Ops failures, and comment with pass/fail evidence.

## Current Proof Commands

Run from repo root:

```powershell
npm install
npm run check
npm run build:web
node ./scripts/v4/frontend-dist-bridge.mjs
npm run build:api
npm run test:api
node ./scripts/v4/package-script-doctor.mjs --json
npm run atomsmasher:api-smoke
npm run atomsmasher:doctor
npm run ops:readiness
```

## Current Known Connector Limitation

GitHub MCP here can read/write/commit and inspect issues/workflows, but it does not execute local commands. Workflow runs were not visible through the connector after recent commits, so execution proof must come from GitHub Actions UI, Codex/dev mode, or local terminal logs.

## Current Status

Non-visual backend/Ops infrastructure is stronger than before:

- Project Green exists and is manually triggerable.
- Ops Script Doctor exists and is manually triggerable.
- API has at least one Vitest target.
- API build/test generates Prisma Client first.
- AtomSmasher API smoke script already exists.
- Package script doctor exists.
- Backend bridge exists for serving the built frontend through the legacy Ops server static path without visual edits.

Do not claim full green until the commands above pass with logs/receipts.
