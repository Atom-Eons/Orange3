# Workspace State Isolation

Silent Canvas uses a workspace-scoped project graph. Tabs and surfaces are views over that graph; they do not own separate competing graph copies.

## Core Rule

The workspace graph is the source of truth:

- `workspace_version` increments on every mutation attempt.
- `state_fingerprint` hashes the visible graph state (`nodes`, `wires`, `regions`, `annotations`).
- `views` records lightweight tab/view descriptors.
- `conflict_markers` record stale writers without blocking the operator flow.

This gives OrangeBox optimistic updates with visible conflict evidence instead of silent tab desync.

## Mutation Contract

HSMP mutations may include:

```json
{
  "expected_workspace_version": 12,
  "tab_id": "canvas-tab-main"
}
```

The reducer also accepts those fields under `details`.

If `expected_workspace_version` differs from the graph's current `workspace_version`, OrangeBox applies last-writer-wins for v1 and appends a conflict marker:

```json
{
  "kind": "workspace_version_mismatch",
  "expected_workspace_version": 12,
  "actual_workspace_version": 13,
  "resolution": "last-writer-wins-marker"
}
```

The mutation log records `workspace_version_before`, `workspace_version_after`, `tab_id`, and the conflict marker when present.

## API

```http
GET /api/v4/silent-canvas/workspace-state?workspace=C:\path\to\project
```

Returns:

- graph schema version
- workspace version
- state fingerprint
- node/wire/region/annotation counts
- recent conflict markers
- recent view descriptors
- latest mutations

## CLI

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs silent-canvas workspace-state C:\path\to\project
```

## Recovery Relationship

This complements `desync-recover`:

- `workspace-state` tells the operator whether tabs are stale or conflicting.
- `desync-recover` restores a known-good snapshot when graph state is bad.

## Current Limitation

The v1 resolver records conflicts and uses last-writer-wins. A future resolver can add manual merge or field-level CRDT semantics, but the current system already prevents silent loss by preserving version/conflict evidence.

