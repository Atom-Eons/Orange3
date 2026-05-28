# ORANGEBOX Four-System Integration

Date: 2026-05-27

Status: local v0 working path. Not production memory and not model-native GlyphSpeak.

## The Four

The four systems are now wired as one local path:

1. **CLC**
   Encodes local ORANGEBOX context into lattice, void map, delta, minimal injection, and decoded continuation.

2. **Temporal Sync**
   Folds current execution reality into `OrangeboxSystemState`, preventing cloud/time-smear from raw receipt history.

3. **GlyphSpeak**
   Converts folded current state into a compact typed handoff packet.

4. **Control/Inference Lane**
   Proves which local/two-device model lane is allowed to act, while keeping paid/frontier lanes gated.

## Active Flow

```text
recent receipts + route state + local docs
  -> CLC v0 memory packet
  -> temporal current_state.json
  -> GlyphSpeak packet
  -> control/inference readiness gate
  -> deterministic escalation/no-escalation decision
```

## Outputs

```text
C:\Users\a\OrangeBox-Data\four-system\latest-four-system-bundle.json
C:\Users\a\OrangeBox-Data\four-system\latest-four-system-doctor.json
C:\Users\a\OrangeBox-Data\temporal-sync\current_state.json
C:\Users\a\OrangeBox-Data\glyphspeak\latest-glyph-packet.json
```

## Command

```powershell
npm.cmd run four:doctor
```

`machine:test-drive` now runs:

```text
innovation:activate
control:big
inference:doctor
four:doctor
```

The four-system doctor internally runs CLC, Temporal Sync, and GlyphSpeak before validating the integrated path.

## Latest Green Criteria

The integrated proof requires:

- CLC is working v0 research, not production memory.
- Temporal current state exists and hashes correctly.
- GlyphSpeak packet exists and decodes back to current-state hash.
- Control/inference lane has fresh green receipts.
- Local llama listener and control sidecar are reachable.
- Five deterministic continuation/new-topic round-trip fixtures pass.
- Source-trust check blocks unverified model facts.
- No raw history, raw assistant prose, or credential names leak into the handoff packet.
- Drift monitor sees no blocking drift.
- Fail-pattern scan has no repeated blocker cluster.

## Latest Local Metrics

From `orangebox-four-system-doctor-20260527T165346.json`:

```text
gates: 11/11 passed
round-trip fixtures: 5/5 passed
raw-to-temporal reduction: 97.88%
temporal-to-glyph reduction: 89.19%
drift risk: low
failpattern blocking: false
```

## Boundaries

- CLC is not production memory yet.
- GlyphSpeak is a deterministic bridge packet, not model-native yet.
- No paid API calls are made.
- No credentials are read.
- No visual files are touched.
- No arbitrary AI Box shell is invoked.
- GPU acceleration is deferred on the N150.
