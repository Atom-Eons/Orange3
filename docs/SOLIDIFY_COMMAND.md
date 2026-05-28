# Silent Canvas Solidify

Date: 2026-05-18

`Solidify` is the productized Silent Canvas compile path. It turns the current project graph into a receipt-backed proof bundle.

## What It Does Now

1. Takes a pre-solidify project graph snapshot.
2. Runs `canvas-compiler.mjs` against graph-backed file/component/config/test nodes.
3. Writes graph-backed content to disk with SHA-256 before/after receipts.
4. Takes a post-solidify snapshot.
5. Writes a deterministic manifest under:

```text
<dataRoot>/solidify/<project_hash>/<timestamp>/solidify-manifest.json
```

6. Emits a `silent-canvas-solidify` receipt with manifest path, manifest hash, compile counts, and snapshot paths.

## What It Does Not Do Yet

It does not deploy. It does not invent Docker/Kubernetes infrastructure. Deployment and infrastructure generation stay behind a later Launch executor with explicit operator confirmation, because wrong infrastructure is worse than no infrastructure.

## API

```http
POST /api/v4/silent-canvas/solidify
```

Body:

```json
{
  "workspace": "C:\\path\\to\\workspace",
  "opts": {}
}
```

## CLI

```powershell
node scripts/obx.mjs silent-canvas solidify C:\path\to\workspace
node scripts/obx.mjs solidify C:\path\to\workspace
node scripts/obx.mjs surface doctor --json --receipt
```

The sidecar must be running so the run can emit v4 receipts.

`surface doctor` is sidecar-free and creates an isolated surface fixture, adds a
real file node to its graph, runs Solidify, verifies the written file and
manifest, and emits a local doctor receipt.

## Manifest Contract

The manifest includes:

- `solidify_version`
- `run_id`
- `workspace`
- `mode: proof-bundle-no-deploy`
- `deployment.attempted: false`
- pre/post snapshot paths
- compile counts
- per-target hash chain
- residual risks
- manifest SHA-256 integrity

This is the first real shape of the Warbook launch metaphor: freeze the canvas into an auditable build artifact before any production launch step.
