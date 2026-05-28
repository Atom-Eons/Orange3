# AGENTS.md

Keep this file short. Detailed workflows live in skills and references.

## Required Workflow

- Prime cold starts and resumed sessions with `references/session-primer.md`.
- Start non-trivial work by restating the objective and active lane.
- Default to `Orangebox Ops backend` unless the operator explicitly opens another lane.
- Do not present work as complete until commands, receipts, or probes provide evidence.
- Use `npm.cmd run check`, `npm.cmd run ops:readiness`, `npm.cmd run reality:watch`, and `npm.cmd run system:full-green` before calling the system green.

## Lane Law

- Backend/Ops work may touch scripts, control plane, schemas, docs, skills, integrations, and API.
- Visual/frontend/product work lives only under `frontend/`.
- This Ops chat does not mutate `frontend/` unless the operator explicitly redirects it.
- Production deploy, destructive changes, paid model calls, broad dependency changes, and external permission changes require explicit operator approval.

## Done Means

- objective restated
- active lane named
- touched files identified
- commands actually run listed
- receipts/proof paths cited
- assumptions and residual risk called out
- rollback path named
