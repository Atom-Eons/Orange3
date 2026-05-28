# Crystal Lattice Compression With Void Map

Status: operator-supplied canonical implementation contract.

Implementation status update, 2026-05-27: CLC is a working local v0 research path in this Orangebox workspace, not a production memory engine. The current `clc:doctor` proves deterministic scaffolding, schema shape, source-trust boundaries, local encode/inject/decode output, and local fidelity fixtures. It must not be reported as production memory until a real transcript corpus, semantic extraction, source trust gates, and continuation round-trip benchmarks pass.

Canonical name: Crystal Lattice Compression with Void Map.

Short name: CLC.

Identifier: ATOM-CLC-2026-0331.

Disclosure date: 2026-03-31.

Operator-supplied disclosure hash: `21d2f40df17631089365363ebae3dc6797be710ad8fcdcd8b8e86c31b8e2dbf7`.

Important verification boundary: the hash above is recorded as an operator-supplied canonical disclosure hash. This local implementation computes fresh SHA-256 integrity hashes over each generated CLC object. It does not claim to have independently reconstructed the original 2026-03-31 canonical serialized benchmark object.

## Doctrine

Save the semantic crystal, not the conversational water.

CLC compresses long conversation memory into a reconstructable semantic state object. It is not ordinary summarization and it is not quote preservation. The output is designed for runtime continuation, model handoff, hallucination containment, and local memory.

CLC has three coupled layers:

- Crystal Lattice: positive semantic structure, including entities, facts, decisions, and relationships.
- Void Map: negative/apophatic structure, including rejections, boundaries, tonal parameters, and depth markers.
- Delta: unresolved novelty, conflicts, and low-confidence material that should not be over-compressed yet.

## Required Schema Families

The full CLC object must include:

- `clc_version`
- `identifier`
- `source_window`
- `lattice.entities`
- `lattice.facts`
- `lattice.decisions`
- `lattice.relationships`
- `void_map.rejections`
- `void_map.boundaries`
- `void_map.tonal_parameters`
- `void_map.depth_markers`
- `delta.unmerged_novel_items`
- `delta.conflicts_pending_resolution`
- `delta.low_confidence_items`
- `integrity.deterministic_key_ordering`
- `integrity.sha256`
- `integrity.source_hash`

The minimal injection object may include:

- entities
- facts
- decisions
- void.rejected_topics
- void.established_boundaries
- void.tone

## Source Trust Rules

- User-sourced facts may be retained.
- Retrieval-sourced facts may be retained when verified.
- Model-generated facts must not be injected as true unless explicitly confirmed.
- Low-confidence entities must be marked unverified.
- Conflicting facts are resolved by source authority, confidence, recency, and supersession.

## Runtime Gate

Continuation classification must happen before injection:

- `NEW_TOPIC`: do not inject prior assistant prose or CLC.
- `CONTINUATION`: inject the CLC lattice and Void Map.
- `AMBIGUOUS`: fail safe to `NEW_TOPIC`.

If CLC is unavailable, Hallucination Reduction Engine behavior must degrade to `NEW_TOPIC`.

## Fidelity Report

Every CLC encode/decode run must emit a fidelity report with:

- entity recall
- fact recall
- decision recall
- rejection recall
- boundary recall
- tone recall
- semantic similarity
- contradiction rate
- unsupported-claim rate
- compression ratio
- hash verification
- round-trip reconstruction score

## Current ORANGEBOX Implementation Boundary

The first ORANGEBOX implementation is a deterministic, no-model CLC doctor. It extracts from local docs, receipts, activation reports, and operator-supplied CLC doctrine. It proves schema, Void Map, Delta, canonical ordering, SHA-256 integrity, continuation gate fixtures, decode contract, and fidelity metrics.

Semantic deduplication is currently deterministic lexical/structural deduplication. LLM-assisted extraction, embedding similarity, LLMLingua, Mem0, LanceDB, Graphiti, and Loro integration remain gated future upgrades.
