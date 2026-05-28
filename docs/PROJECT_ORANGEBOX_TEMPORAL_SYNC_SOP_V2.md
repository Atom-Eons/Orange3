# Project Orangebox Temporal Sync SOP v2

Date integrated: 2026-05-27

Source file: `C:\Users\a\Downloads\Project_Orangebox_Temporal_Sync_SOP_v2.pdf`

Source SHA-256: `215853ADD26A8C6246B3A58104177D890E03773F8ED69C535EA6730B980E51F6`

Status: accepted as the local-first temporal displacement doctrine for ORANGEBOX. Implemented as a guarded proof primitive by `scripts/v4/temporal-sync-doctor.mjs`.

## Core Doctrine

The SOP defines the time-displacement failure as asynchronous state drift between a fast local execution layer and a slower cloud macro-reasoning layer. If raw terminal history is continuously dumped into the cloud model, token order becomes the model's only clock and the model can attempt to repair old states that no longer exist.

The fix is not bigger context. The fix is context folding:

- local execution remains the physical source of truth
- raw history is folded locally into a typed current state object
- the command model receives only state snapshots
- repeated failure branches are pruned by a bounded TREE(n)-style guard
- larger/cloud command lanes wake only when the current state explicitly requires intervention

## Required State Shape

The SOP's governing state object is:

```ts
export interface OrangeboxSystemState {
  timestamp: number;
  uiHash: string;
  activeBranch: string;
  resolvedTasks: string[];
  criticalDiff: string;
  requiresCommandIntervention: boolean;
  interventionReason?: "MACRO_LOGIC_FAILURE" | "UNRESOLVED_DEPENDENCY" | "PRODUCT_LAW_VIOLATION";
}
```

ORANGEBOX implements this as `C:\Users\a\OrangeBox-Data\temporal-sync\current_state.json`.

## Current Mapping

Current local primitives used:

- `route-state.mjs` provides the current Mission Spine route.
- repo and data receipts provide the raw execution tail.
- `control-plane` provides explicit context and retry-cap doctrine.
- `context-store.mjs` provides checkpoint continuity.
- knowledge-v2 lattice/void files are related memory substrate, but not proof that CLC is production-ready.

## CLC Boundary

CLC is not marked production green. The operator correction on 2026-05-27 is controlling:

```text
CLC doesnt work yet. but we will get it to as we get smarter.
```

Therefore temporal sync uses typed context folding now. CLC is allowed to be a working local v0 research path, but it remains outside production memory until it has a real transcript corpus, semantic extraction, source-trust rules, and round-trip benchmarks.

## GlyphSpeak Boundary

GlyphSpeak is treated as the real-time inter-model packet layer, not as the stored-memory layer.

- CLC: long-running memory state, lattice plus void map.
- Temporal Sync: current execution state, context folding, cloud wake gating.
- GlyphSpeak: compact typed packet for inter-model handoff once a current state exists.

The local bridge packet is emitted by `scripts/v4/glyphspeak-doctor.mjs`.

## Operational Commands

```powershell
npm.cmd run temporal:doctor
npm.cmd run glyphspeak:doctor
```

These commands are local-only and non-visual. They do not call paid APIs, read credentials, or wake frontier lanes.
