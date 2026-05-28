# Relevance Controller Doctrine

**Status:** v6.3.0-alpha.8 implemented spine  
**Scope:** ORANGEBOX Silent Canvas only  
**Rule:** the LLM does not own source of truth.

## Purpose

The Relevance Controller prevents Silent Canvas from becoming a chat app that shoves the entire project into the model every turn. It produces a bounded, auditable context package from seven state sources, then the Brain reasons over that projection.

## Binding Pipeline

1. Operator goal enters Silent Canvas.
2. `intent-classifier.mjs` classifies goal shape, risk, departments, and focus terms.
3. `relevance-controller.mjs` projects the seven state sources into a scoped package.
4. Creative Brain receives the package, not raw full state.
5. Fast Interpreter converts the Brain plan into HSMP.
6. `canvas-validator.mjs` checks component, layout, workflow, action, and permission schemas.
7. If HSMP asks for `needs_more_context`, `silent-canvas.mjs` expands the scoped package and reruns the Brain/Interpreter loop up to the configured bounded limit.
8. `project-graph.mjs` reducer applies allowed mutations and records the mutation log.
9. Native Visual Telemetry shows state changes.

## Seven State Sources

- `canvas_state`: project graph nodes, wires, regions, annotations, mutation tail.
- `data_state`: project-local schemas, endpoints, tables, bindings.
- `workflow_state`: routes, workflows, triggers, required params.
- `design_state`: Silent Canvas visual doctrine, tokens, components, constraints.
- `runtime_state`: receipts, recent anomalies, proof signals.
- `history_state`: mutation log tail and recent project movement.
- `permission_state`: operation catalog, trust tiers, confirmation and restricted rules.

## The Six Nevers

1. Never give the LLM the entire project state on every turn.
2. Never let the LLM directly overwrite the canvas JSON.
3. Never use chat as the primary explanation layer for visual changes.
4. Never ask the reasoning model to produce thousands of lines of final UI state.
5. Never use memory as a substitute for state.
6. Never let the model guess missing data; emit `needs_more_context`.

## Implemented Files

- `scripts/v4/intent-classifier.mjs`
- `scripts/v4/relevance-controller.mjs`
- `scripts/v4/data-state.mjs`
- `scripts/v4/workflow-state.mjs`
- `scripts/v4/design-state.mjs`
- `scripts/v4/permission-state.mjs`
- `scripts/v4/canvas-validator.mjs`
- `scripts/v4/hsmp-schema.mjs`
- `scripts/v4/silent-canvas.mjs`
- `scripts/v4/v4-server-routes.mjs`

## API

- `POST /api/v4/relevance/project`
- `GET /api/v4/relevance/project`
- `POST /api/v4/relevance/classify`

Every `POST /api/v4/relevance/project` emits a `relevance-projection` receipt with projection id, intent, source breakdown, and omitted state counts.

## Bounded Context Expansion

Silent Canvas treats `needs_more_context` as a first-class control signal, not as a normal mutation to apply blindly.

- The default limit is 2 expansion rounds, clamped at 4.
- Each round records `silent-canvas-needs-more-context` and `relevance-projection-expansion` receipts.
- The expanded projection increases node and receipt budget while keeping the Brain inside a bounded package.
- If the expanded projection still cannot satisfy the request, the run fails with an explicit missing-context receipt.
- The final executable HSMP must not contain unresolved `needs_more_context` mutations.

The local execution seam `opts.model_call` exists for deterministic offline verification and future local/vLLM pairing. HTTP routes cannot pass this function; production calls continue through the normal subscription/API fallback chain.

## Current Limits

This alpha.8 spine is deterministic and local-first. It now has bounded `needs_more_context` retry orchestration. It does not yet perform LLM-based semantic deduplication or vector search; those come after the deterministic path is stable and measured.
