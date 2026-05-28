# GlyphSpeak Context Folding Bridge

Date: 2026-05-27

Status: draft packet bridge, not model-native GlyphSpeak.

## Position

GlyphSpeak should not be confused with CLC.

CLC compresses stored conversational memory into a lattice, void map, and delta buffer. It is allowed to be a working v0 research path, but it is not production-ready yet.

GlyphSpeak compresses live inter-model communication. In ORANGEBOX, it should sit after temporal context folding:

```text
raw execution receipts
  -> temporal current_state.json
  -> GlyphSpeak packet
  -> model handoff or escalation advisor
```

This prevents the larger model from receiving raw historical tail while still giving it enough semantic state to act.

## First Local Packet

The current deterministic bridge uses ASCII tokens:

- `T_DELTA`: temporal displacement horizon and recency contract
- `FOLD`: raw execution tail replaced by typed state
- `VOID`: boundaries that must survive handoff
- `TREE_STOP`: repeated failure branches are pruned
- `ESCALATE`: wake larger command model only when intervention is required

The bridge output lives at:

```text
C:\Users\a\OrangeBox-Data\glyphspeak\latest-glyph-packet.json
```

## Acceptance Criteria Before Promotion

GlyphSpeak can be considered operational only when it passes:

- deterministic encode/decode tests
- packet schema validation
- side-by-side model handoff benchmark
- no raw assistant prose injection
- no loss of hard boundaries
- measured improvement over plain JSON handoff

Until then it is a useful typed bridge, not a claimed breakthrough.

## Command

```powershell
npm.cmd run glyphspeak:doctor
```
