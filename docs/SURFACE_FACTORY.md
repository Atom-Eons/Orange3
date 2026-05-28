# Surface Factory

**Status:** v0.1 implemented  
**Scope:** ORANGEBOX Silent Canvas surfaces  
**Goal:** create new working canvases from versioned templates instead of building every surface by hand.

## What A Surface Is

A surface is a standalone Silent Canvas workspace with its own project graph, manifest, README, seed template, and registry entry. It inherits the ORANGEBOX AE See-Suite doctrine:

- Vision Rail for timeline, departments, and DAG state.
- Command Center for operator intent and party-line/private strategy flow.
- Artifact Library for receipts, previews, proof, and deliverables.
- Relevance Controller before model calls.
- Visual Telemetry for mutation movement.
- Receipts Ledger for proof.

## Commands

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs surface templates
node C:\AtomEons\orangebox\scripts\obx.mjs surface list
node C:\AtomEons\orangebox\scripts\obx.mjs surface create "Launch Command"
node C:\AtomEons\orangebox\scripts\obx.mjs surface create "Launch Command" --root=C:\AtomEons\orangebox\build\tmp\launch-command
node C:\AtomEons\orangebox\scripts\obx.mjs surface doctor --json --receipt
```

When the sidecar is running, the CLI uses:

- `GET /api/v4/surfaces/templates`
- `GET /api/v4/surfaces/list`
- `GET /api/v4/surfaces/doctor`
- `POST /api/v4/surfaces/create`

The create route emits a `surface-factory` receipt.

When the sidecar is not running, the CLI can create/list directly through `scripts/v4/surface-factory.mjs`; direct local mode is useful for development but does not emit a v4 server receipt.

## Template: core-v1

`core-v1` seeds six nodes, three wires, and one region:

- `surface-vision-rail`
- `surface-command-center`
- `surface-artifact-library`
- `surface-relevance-controller`
- `surface-visual-telemetry`
- `surface-receipts-ledger`
- `wire-relevance-to-command`
- `wire-command-to-telemetry`
- `wire-artifacts-to-receipts`
- `region-silent-canvas-shell`

The seed uses the normal `project-graph.mjs` reducer, so factory-created canvases are not a separate state format.

## Files Created Per Surface

- `surface.json`: machine-readable manifest.
- `README.md`: human operating note for the surface.
- `surface-template-seed.json`: exact seed mutation payload.
- `docs/`, `data/`, `workflows/`: working directories for the surface.

## Registry

The registry lives at:

```text
<ORANGEBOX_DATA_ROOT>\surface-factory\registry.json
```

Default data root is the same local-first ORANGEBOX app data root used by the rest of the v4 stack.

## Completion Law

Surface Factory is not a mock. A successful create must prove:

- manifest written,
- registry updated,
- project graph initialized,
- seed mutations applied through the reducer,
- graph has expected node/wire/region counts,
- route/CLI can list the resulting surface.

The doctor additionally proves that a graph-backed file node can be solidified
to disk with snapshots, manifest integrity, and hash-chain evidence.
