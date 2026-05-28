# Relevance Controller Doctor

The Relevance Controller doctor is the local proof gate for Silent Canvas scoped context. It verifies that the Creative Brain receives a bounded projection instead of raw full project state, and that missing state goes through `needs_more_context` instead of model guessing.

## Command

```powershell
node .\scripts\obx.mjs silent-canvas relevance-doctor --json --receipt
```

Optional:

```powershell
node .\scripts\obx.mjs silent-canvas relevance-doctor --keep-temp
```

## What It Proves

- Creates an isolated Surface Factory workspace under the system temp directory.
- Adds offscreen fixture nodes to create real project-state sprawl.
- Builds a Relevance Controller projection with a viewport and `max_nodes` cap.
- Confirms the Brain-facing text contains `RELEVANCE PROJECTION`.
- Confirms offscreen fixture identity does not leak into the Brain-facing prompt.
- Runs a real Silent Canvas job with injected model calls.
- Forces the first Fast Interpreter pass to emit `needs_more_context`.
- Confirms the runtime emits `relevance_projection_expanded`.
- Confirms the final mutation only happens after bounded context expansion.
- Confirms receipts are emitted for projection, context request, expansion, and final run.

## Current Passing Proof

- Relevance doctor receipt: `C:\AtomEons\orangebox\receipts\orangebox-relevance-controller-doctor-20260518T095601.json`
- Alpha.7 full doctor receipt after the controller fix: `C:\AtomEons\orangebox\receipts\orangebox-alpha7-readiness-doctor-20260518T095622.json`

The first relevance-doctor attempt intentionally stayed in receipts as evidence. It exposed a real compacted-context bug: when the context exceeded the compaction threshold, the formatter lost structured projected canvas nodes. The fix preserves bounded canvas state while still truncating noisy sections.

## Failure Meaning

If this doctor fails, do not trust Silent Canvas to run large projects unattended. A failure means at least one of these is true:

- the Brain may be seeing too much raw state,
- compacted context may be losing the projected state it claims to include,
- missing information may be guessed instead of requested,
- bounded context expansion may be broken,
- receipts may not prove the state path.

Fix the doctor before shipping additional Silent Canvas automation.
