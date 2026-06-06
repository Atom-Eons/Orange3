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

- Package scripts scanned: 127
- Eligible backend tools: 94
- Excluded visual/product tools: 20
- Sleeping other tools: 13

## Top Eligible Tools

- `backend:install` -> proof_receipt, coverage_receipt, immune_scan, source_order_fence
- `backend:proof` -> proof_receipt, coverage_receipt, immune_scan, source_order_fence
- `knowledge` -> commitment_atom
- `knowledge:v1` -> commitment_atom
- `knowledge:v2` -> commitment_atom
- `knowledge:repo` -> commitment_atom
- `knowledge:improvements` -> commitment_atom
- `research:scout` -> commitment_atom
- `provider-watch` -> routing_engine, runtime_profile, agent_lease
- `provider-watch:repo` -> routing_engine, runtime_profile, agent_lease
- `awareness:update` -> routing_engine, runtime_profile, agent_lease
- `alpha:intake` -> commitment_atom
- `alpha:sources` -> proof_receipt, coverage_receipt
- `innovation:synthesis` -> proof_receipt, coverage_receipt
- `innovation:activate` -> proof_receipt, coverage_receipt
- `ten:finish` -> proof_receipt, coverage_receipt
- `clc:doctor` -> proof_receipt, coverage_receipt
- `temporal:doctor` -> proof_receipt, coverage_receipt
- `glyphspeak:doctor` -> proof_receipt, coverage_receipt
- `four:doctor` -> proof_receipt, coverage_receipt

## AtomSmasher Proof

- Feature registry: 620
- Schema version: 10
- Compile route: cache_answer
- Saved tokens proxy: 11438
- Security scan: clean

## Outputs

- Merge proof: `C:\Users\a\OrangeBox-Data\atomsmasher\tool-merge\latest-tool-merge.json`
- Receipt: `receipt disabled`

## Rollback

This merge lane writes proof artifacts only. To roll back this lane, remove the generated tool-merge JSON, matching receipt, and this document. Do not delete the vendored AtomSmasher package unless superseding the integration.
