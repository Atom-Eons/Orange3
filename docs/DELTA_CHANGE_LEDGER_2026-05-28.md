# Orangebox Delta Change Ledger — 2026-05-28

This ledger tracks direct GitHub changes made by GPT-5.5 Thinking during the Orangebox Delta audit pass.

## Operator Orders

- Scan/understand before modifying.
- Fix only what is clearly wrong.
- Do not mutate frontend visual taste unless the point is understood.
- Track all changes in git.
- Keep the whole project green/functional, not iterative theater.
- After the frontend visual chat was linked, stay clear of additional frontend visual/code edits unless explicitly reopened.

## Current Project Understanding

Orangebox Delta is now the clean canonical target repo. The older `orangebox-os` repo is reference/upstream, not the preferred modern target.

Delta contains:

- Root backend Ops command/control package.
- `apps/api` AE See-Suite API workspace.
- `frontend` AE See-Suite React visual/product workspace.
- `scripts/v4` operations, proof, AtomSmasher, gauntlet, ChatBackup, Codexa/AI Box lanes.
- `control-plane` Bun/TypeScript deterministic execution lane.
- `integrations` for incoming module lanes.

## Direct Changes Made

### 69d9a13 — `frontend/scripts/visual-proof.mjs`

Added a frontend-owned visual proof runner.

Why:

The handoff said `frontend` had the React app, but not self-contained visual proof tooling. Visual proof should run from `frontend/` and emit non-empty receipts.

What it does:

- Serves `frontend/dist` from a local static server.
- Captures requested state URLs such as `/?state=01`.
- Writes screenshots to `frontend/proof/<run>/`.
- Writes `visual-proof-receipt.json` immediately and updates it on completion/failure.
- Fails honestly if `dist/index.html` is missing.

### 57f58f6 — `frontend/scripts/pixel-compare.mjs`

Added a frontend-owned pixel compare receipt runner.

Why:

The handoff said the latest pixel compare was interrupted/empty. Empty proof is worse than weak proof. The new runner always writes a receipt.

What it does:

- Reads latest frontend visual proof screenshots.
- Looks for the source mockup bank.
- Emits `GREEN`, `WEAK`, `INCOMPLETE`, or `FAILED`.
- Emits non-empty JSON even when source mockups are missing.
- Produces a small HTML summary.

Important:

This does not claim pixel-perfect. It makes pixel-perfect measurable.

### 43cfee3 — `frontend/scripts/proof-summary.mjs`

Added a small summary utility for latest frontend proof receipts.

Why:

Operators and CI need a compact readout of the latest visual/pixel proof state.

### 87361f0 — `frontend/package.json`

Added frontend-local proof scripts:

- `proof:visual`
- `proof:visual:72`
- `proof:pixel`
- `proof:summary`

Why:

The app previously had only `dev`, `build`, and `preview`. The frontend must own its proof lane.

### 0711f9e — `.github/workflows/frontend-proof.yml`

Added a GitHub Actions workflow for frontend proof artifacts.

Why:

The handoff explicitly said Delta lacked CI, visual proof scripts, and visual regression artifact output.

What it does:

- Installs dependencies.
- Builds the frontend workspace.
- Installs Playwright Chromium.
- Captures anchor state screenshots.
- Produces a non-strict pixel receipt.
- Uploads `frontend/proof/` as an artifact.

### 7c822f6 — `frontend/README.md`

Documented the frontend proof workflow, receipt locations, source mockup bank behavior, and current known status.

Why:

Frontend handoff needs to be self-explanatory to another chat/agent.

### 9b39d15 — root `package.json`

Added root aliases for frontend-owned proof:

- `frontend:proof:visual`
- `frontend:proof:visual:72`
- `frontend:proof:pixel`
- `frontend:proof:summary`
- `frontend:proof`
- `check:all`

Why:

Ops should be able to invoke frontend proof without knowing workspace internals.

### 2465ce7 — `.github/workflows/frontend-proof.yml`

Fixed the workflow install step from `npm ci` to `npm install`.

Why:

The repo currently has no `package-lock.json`. `npm ci` would fail before proof ran. This was an unambiguous CI correctness bug.

### 933f449 — `.github/workflows/project-green.yml`

Added a cross-platform Project Green CI workflow.

Why:

Many local root scripts intentionally use `npm.cmd` because the operator machine is Windows. GitHub Actions runners are Linux by default. Project Green avoids mutating the Windows-first scripts while still proving syntax and workspace builds on GitHub.

What it does:

- Installs dependencies with `npm install`.
- Runs Node syntax checks on command server, MCP server, and legacy app surface.
- Generates Prisma client for `apps/api`.
- Builds the API workspace.
- Builds the frontend workspace.
- Syntax-checks AtomSmasher runtime/API route files.

### cac8707 — `apps/api/package.json`

Added Prisma client generation before API build/test.

Why:

`apps/api` imports `@prisma/client`, but its build script only ran `tsc`. On a fresh checkout/CI run, Prisma Client may not exist unless generated first. `prebuild` and `pretest` now run `prisma generate` so local and CI behavior match.

### 7eb8f0f — `scripts/v4/frontend-dist-bridge.mjs`

Added a backend/Ops bridge from `frontend/dist` to `apps/web/dist`.

Why:

The canonical frontend workspace builds to `frontend/dist`, but the existing Ops command server serves `/v4/react` from `apps/web/dist`. This bridge copies the built frontend into the server's expected static path without changing frontend visuals.

Important:

This script is backend serving glue. It does not alter React source, visual design, or state behavior.

### a748a7c — `scripts/v4/package-script-doctor.mjs`

Added a non-mutating package script reference doctor.

Why:

Delta has many root/workspace scripts. The doctor checks obvious local file references inside `package.json` scripts and reports missing files before operators discover failures mid-run.

What it does:

- Reads root and workspace package files.
- Extracts local `.mjs`, `.js`, `.ts`, `.json`, `.ps1`, `.sh`, and `.prisma` references.
- Reports missing local files.
- Writes an optional receipt.
- Does not run scripts or mutate the repo.

### f695dd3 — `.github/workflows/ops-script-doctor.yml`

Added CI for the package script doctor.

Why:

Broken local script references should surface as proof in GitHub, not remain hidden until a local operator run.

### 18ccdac / cbe4c1b / this file

Updated this ledger as new backend/Ops commits landed.

Why:

The operator ordered every change tracked in git.

## Blocked Writes / Not Forced

Two attempted writes were blocked by the connector safety layer:

- Rewriting root `package.json` again to wire `frontend-dist-bridge.mjs` directly into `build:web`.
- Updating `project-green.yml` to call the bridge script.

Decision:

Do not fight the connector. The bridge script is committed and can be wired locally or by the frontend lane after visual work stabilizes.

## Non-Delta Change Made Earlier

### f1fc691 — `AtomEons/orangebox-os/src-tauri/tauri.conf.json`

Updated stale package metadata/CSP/resources in the old upstream/reference repo.

Important:

This was made before the operator clarified that `orangebox-delta` is now the canonical handoff target. It was not ported into Delta because Delta has a different current shape and should not inherit old Tauri config blindly.

## Current Known Status

Functional progress:

- Delta repo is active.
- Frontend workspace exists.
- Frontend build script exists.
- Backend Ops package exists.
- API workspace exists.
- AtomSmasher scripts are wired at root and imported into the command server.
- Frontend proof tooling now exists in `frontend/`.
- Frontend proof CI now exists.
- Project Green CI now exists.
- API build/test now generates Prisma Client first.
- Backend bridge script exists for serving `frontend/dist` through the command server's current `apps/web/dist` expectation.
- Package script doctor exists and has CI.

Still not proven green locally from this chat:

- `npm run check`
- `npm run build:web`
- `npm run build:api`
- `npm run frontend:proof`
- `npm run atomsmasher:doctor`
- `npm run ops:readiness`
- `npm run system:full-green`

Reason:

GitHub connector can edit/read repository files but does not execute npm builds/tests in the repo runtime. GitHub workflow runs were not visible through the connector after the commits at the time of this pass.

## Next Required Proof Run On Local Machine Or CI

Run from repo root:

```powershell
npm install
npm run check
npm run build:web
node ./scripts/v4/frontend-dist-bridge.mjs
npm run build:api
npm run atomsmasher:doctor
npm run ops:readiness
```

Frontend visual lane should run visual proof separately unless the operator reopens frontend work here.

## Current Visual Truth

Do not call it pixel-perfect yet.

The frontend has proof tooling. The visual masterpiece work belongs to the dedicated frontend chat until the operator reopens that lane here.

## Rule For Future Agents

Do not perform subjective visual edits unless the mockup target, state ID, and failure region are known.

Allowed without further clarification:

- Fix broken backend/Ops scripts.
- Fix empty receipts.
- Fix CI errors.
- Fix missing proof outputs.
- Fix broken imports.
- Fix route/file path mismatches.
- Improve diagnostics without changing behavior.

Not allowed without understanding:

- Changing visual taste.
- Replacing the dashboard metaphor.
- Flattening animation/living-system language.
- Removing overlays/panels because they look complex.
- Demoting AtomSmasher, AECode, Order Spine, or proof/receipt doctrine.
