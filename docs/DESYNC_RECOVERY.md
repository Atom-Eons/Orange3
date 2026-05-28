# Silent Canvas Desync Recovery

Date: 2026-05-18

Desync recovery restores the canonical project graph from a known-good snapshot. It is for canvas-state corruption, failed visual mutation state, or any moment where the operator needs the graph to walk back to a stable point.

## What It Does

1. Lists existing graph snapshots.
2. Selects the provided snapshot file or the newest available snapshot.
3. Writes a backup snapshot of the current graph before restoring.
4. Replaces `graph.json` with the selected snapshot.
5. Appends a `snapshot_restore` entry to the mutation log.
6. Emits a `silent-canvas-desync-recover` receipt through the v4 route.

It does not delete snapshots. It does not mutate the workspace files on disk. It restores the graph state only.

## API

```http
POST /api/v4/silent-canvas/desync-recover
```

Body:

```json
{
  "workspace": "C:\\path\\to\\workspace",
  "file": "C:\\Users\\a\\AppData\\Roaming\\com.atomeons.orangebox.command\\projects\\...\\snapshots\\snapshot.json",
  "reason": "operator desync recovery"
}
```

`file` is optional. If omitted, the newest available snapshot is used.

## CLI

```powershell
node scripts/obx.mjs silent-canvas desync-recover C:\path\to\workspace
node scripts/obx.mjs silent-canvas desync-recover C:\path\to\workspace --file=C:\path\to\snapshot.json
```

## Safety

The route writes a backup snapshot before restoring. Rollback is therefore:

1. Find `backup_snapshot` in the receipt or CLI output.
2. Run desync recovery again using that backup snapshot path.

This is the first concrete State Desync Resolution primitive from the Warbook. Native visual un-build animation remains a later UI layer on top of this graph restore primitive.
