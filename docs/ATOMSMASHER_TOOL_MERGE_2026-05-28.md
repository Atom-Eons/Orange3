# AtomSmasher Tool Merge

Date: 2026-05-28

Status: `ATOMSMASHER_TOOL_MERGE_GREEN`

This is an Orangebox Operations backend merge lane. AtomSmasher is allowed to upgrade backend tools by adding proof, routing, compression, source-ingest, saved-work, and receipt coverage. It is not allowed to mutate the separate visual/frontend/dashboard project from this chat.

## What Was Merged

- AtomSmasher doctor proof is now a required backend proof lane.
- AtomSmasher API smoke is part of full-green.
- AtomSmasher tool merge now scans package scripts, excludes visual/product lanes, and produces a deterministic backend upgrade map.
- The reality watcher and Ops readiness can tell whether AtomSmasher is actually green.

## Tool Surface

- Package scripts scanned: 219
- Eligible backend tools: 151
- Excluded visual/product tools: 27
- Sleeping other tools: 41

## Top Eligible Tools

- `backend:install` -> proof_receipt, coverage_receipt, immune_scan, source_order_fence
- `backend:proof` -> proof_receipt, coverage_receipt, immune_scan, source_order_fence
- `mcp:doctor` -> proof_receipt, coverage_receipt
- `ipi:doctor` -> proof_receipt, coverage_receipt
- `memory:doctor` -> proof_receipt, coverage_receipt
- `action:doctor` -> proof_receipt, coverage_receipt
- `knowledge` -> commitment_atom
- `knowledge:v1` -> commitment_atom
- `knowledge:v2` -> commitment_atom
- `knowledge:repo` -> commitment_atom
- `knowledge:improvements` -> commitment_atom
- `research:scout` -> commitment_atom
- `research:radar` -> commitment_atom
- `horizon:review` -> proof_receipt, coverage_receipt
- `horizon:bakeoff` -> proof_receipt, coverage_receipt
- `v3:api:bakeoff` -> commitment_atom
- `assurance:doctor` -> proof_receipt, coverage_receipt
- `tool:ergonomics` -> proof_receipt, coverage_receipt
- `checkmate:doctor` -> proof_receipt, coverage_receipt
- `signal:hygiene` -> proof_receipt, coverage_receipt

## AtomSmasher Proof

- Feature registry: 620
- Schema version: 10
- Compile route: cache_answer
- Saved tokens proxy: 1904
- Security scan: clean

## Outputs

- Merge proof: `C:\Users\a\OrangeBox-Data\atomsmasher\tool-merge\latest-tool-merge.json`
- Receipt: `receipt disabled`

## Rollback

This merge lane writes proof artifacts only. To roll back this lane, remove the generated tool-merge JSON, matching receipt, and this document. Do not delete the vendored AtomSmasher package unless superseding the integration.
