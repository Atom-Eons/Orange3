# ORANGEBOX Bluebird Gap Feature Ledger

Status: feature intake and planning ledger, not a completion claim.
Source intake date: 2026-05-23
Primary source: `C:\Users\a\Downloads\Orangeb0x_Gap_Analysis.pdf`
Source SHA-256: `DBBC1BBB21C60CAC230703D7CC7132E28F9AFE367634AAF9F529096EF016846A`

## Purpose

This ledger converts the Gap Analysis PDF and the Grok share discussion into ORANGEBOX feature work without letting advisory material become fake green. Each item is tracked as one of:

- `implemented`: there is code, command/API/UI evidence, and doctor or receipt proof.
- `partial`: a real foundation exists, but the feature is not product-complete.
- `planned`: accepted as product scope, but not yet implemented.

The product direction stays the same: ORANGEBOX is the internal engine; AE See-Suite is the premium creation surface; AE Operations is the proof/install/recovery surface; Ethereal AI Link is the Advanced AI Computer path; EIDOS remains paused and separate.

## Executive Evaluation

The Gap Analysis is directionally correct. It identifies the right daily-driver gaps: deep indexing, background agents, model routing, cost control, Git/PR workflows, testing, extension ecosystem, collaboration, durable rules/memory, analytics, marketplace, clustering, offline sync, and full AELang.

The analysis understates a few things that already exist in the repo:

- Background agents already have an in-process job queue and receipts.
- Repo indexing already exists as a local symbol/keyword index.
- Cost estimation and cost rollups already exist in the API.
- Model switching/routing scaffolding exists through the Running Brain switchboard.
- AELang v0.1 already compiles High/Core route language into ORANGEBOX route packets and Operating Spine handoff objects.

But those foundations are not enough to call the whole gap closed. The next build push should convert partial foundations into user-obvious, recoverable product features.

## Tier 1: Critical Daily-Driver Gaps

### 1. Deep Codebase Indexing + Semantic Search

Current status: `partial`

Existing evidence:

- `scripts/v4/repo-indexer.mjs`
- `/api/v4/repo/index`
- `/api/v4/repo/summary`
- `/api/v4/repo/find-symbol`
- `/api/v4/repo/symbol-prefix`

Gap:

- Current index is useful but not yet Cursor-class deep semantic context.
- Needs persistent index storage, hybrid grep/symbol/vector ranking, stale index detection, file-change invalidation, and route-aware context packs.

Feature target:

- Local-first repo brain that can answer "where is this behavior implemented?", rank relevant files for a mission, and feed AELang/Route Packets without dumping whole repos into prompts.

Acceptance proof:

- `obx repo doctor --semantic --receipt`
- UI: AE Operations "Codebase Index" status
- API: search endpoint with ranked results and freshness metadata
- Receipt includes indexed files, symbols, search examples, stale files, and rebuild command

### 2. Background / Async Agents

Current status: `partial`

Existing evidence:

- `scripts/v4/agent-jobs.mjs`
- `/api/v4/agent/run`
- `/api/v4/agent/status/:id`
- `/api/v4/agent/cancel/:id`
- `/api/v4/agent/list`

Gap:

- Current queue is in-process and useful, but not yet full "leave it running overnight and resume after crash" continuity.
- Needs durable checkpointing, stall detection, resume tickets, cross-session restoration, and visible AE Operations controls.

Feature target:

- Receipt-driven agent continuity: every running mission has heartbeat receipts, checkpoint receipts, stall receipts, and resume tickets.

Acceptance proof:

- `obx agent doctor --continuity --receipt`
- Simulated stalled agent creates a stalled receipt and resume ticket
- Restart rehearsal proves unfinished jobs rehydrate as paused/resumable, not lost

### 3. Model Routing Intelligence

Current status: `partial`

Existing evidence:

- `scripts/v4/model-switchboard.mjs`
- `obx model status`
- `obx model switch`
- `obx model doctor`
- `/api/v4/model-switch/status`
- `/api/v4/model-switch/select`
- `/api/v4/model-switch/doctor`

Gap:

- Current Running Brain switching is real, but auto-routing, health-based failover, circuit breakers, and cost/rate-limit policies are not complete.

Feature target:

- Routing engine chooses the right lane for each task based on mission type, provider health, cost budget, latency, privacy, and operator preference.

Acceptance proof:

- `obx model route-doctor --receipt`
- Provider stall simulation triggers fallback without losing route state
- AE Operations shows health, selected lane, fallback reason, and latest receipt

### 4. Cost Tracking Dashboard

Current status: `partial`

Existing evidence:

- API cost estimation code in `scripts/v4/v4-server-routes.mjs`
- `/api/v4/router/cost`
- `/api/v4/cost/today`
- UI cost meter references in prior v6 docs

Gap:

- Needs per-mission, per-department, per-provider cost budgets and budget enforcement.
- Needs subscription-cli vs direct-API distinction so "already paid subscription" is separated from incremental token spend.

Feature target:

- Cost board in AE Operations with daily budget, mission budget, route forecast, live spend, saved-by-cache/subscription, and hard stop thresholds.

Acceptance proof:

- `obx cost doctor --receipt`
- Budget breach simulation blocks direct API calls and records a receipt
- UI proof shows budget, spend, forecast, and recovery

### 5. Git / PR Workflows

Current status: `planned`

Existing evidence:

- Release closeout includes git-state review and stage/hold lists.
- Final Green Board reports dirty repo state.

Gap:

- No full native branch/commit/PR workflow in AE See-Suite or AE Operations yet.

Feature target:

- Branch view, staged/held path review, commit packet, PR packet, review comments, rollback links, and receipt proof.

Acceptance proof:

- `obx git doctor --receipt`
- Safe dry-run PR packet generated locally
- No push/PR creation without explicit operator approval

## Tier 2: Competitive Edge Features

### 6. Plugin / Extension System + SDK

Current status: `partial`

Existing evidence:

- MCP bridge
- Skills ecosystem
- OpenAPI contract
- Code-mode MCP lane

Gap:

- Needs signed extension package format, install validator, compatibility metadata, permissions, rollback, and extension marketplace surface.

Acceptance proof:

- `obx extension doctor --receipt`
- Install a local sample extension into an isolated candidate workspace
- Permission manifest visible in AE Operations

### 7. Built-In Testing Framework

Current status: `partial`

Existing evidence:

- Doctors, proof gates, package manifest validation, visual proofs, user journey doctor.

Gap:

- Needs automatic test generation and failure-driven repair loops tied to route packets.

Acceptance proof:

- `obx test doctor --receipt`
- Route packet can request tests, run tests, capture failures, and attach repair plan

### 8. Real-Time Multi-User Collaboration

Current status: `planned`

Gap:

- Current product is operator-first and mostly single-user.

Feature target:

- Presence, comments, shared route packets, review approvals, conflict display, and receipt-backed collaboration state.

Acceptance proof:

- `obx collab doctor --receipt`
- Two simulated local sessions update separate route comments without corrupting state

### 9. Rules / Memories System

Current status: `partial`

Existing evidence:

- Prompt registry
- Knowledge v2
- Receipts and project docs
- Route packets and Department OS

Gap:

- Needs a user-facing project rules/memories control surface equivalent to `.cursorrules`, but proof-backed and model-agnostic.

Acceptance proof:

- `obx memory doctor --receipt`
- AE Operations shows active rules, source, freshness, and override controls
- Route planner uses project rules in output with citations

### 10. Advanced Analytics

Current status: `partial`

Existing evidence:

- Feature reality doctor
- User journey doctor
- Final Green Board
- Service freshness doctor
- Provider watch receipts

Gap:

- Needs bottleneck detection, department throughput, agent stall metrics, model performance, and proof freshness scoring.

Acceptance proof:

- `obx analytics doctor --receipt`
- AE Operations analytics page shows bottlenecks, stale proofs, and exact next action

## Tier 3: Long-Term Moat Features

### 11. Marketplace

Current status: `planned`

Feature target:

- Route Packet templates, doctors, plugins, visual widgets, department packs, and AELang examples.

Acceptance proof:

- Local dev marketplace registry with signed sample package
- No remote marketplace publishing without explicit approval

### 12. Distributed AI Box Clustering

Current status: `partial`

Existing evidence:

- Ethereal AI Link
- AI Box worker rail docs and packages
- Network doctors

Gap:

- Needs multi-node discovery, capability inventory, job placement, load balancing, health, and failover.

Acceptance proof:

- `obx cluster doctor --receipt`
- Single-node and missing-node modes both behave cleanly
- Multi-node proof waits for actual hardware availability

### 13. Offline-First + Sync

Current status: `planned`

Feature target:

- Local-first work, local receipt ledger, mutation logs, version vectors, sync receipts, and visual conflict resolution.

Acceptance proof:

- `obx sync doctor --offline-simulation --receipt`
- Conflicting route packet edits produce a visual conflict packet and no data loss

### 14. AELang Full Implementation

Current status: `partial`

Existing evidence:

- `docs/AELANG_SPEC.md`
- `scripts/v4/aelang.mjs`
- `obx aelang doctor`
- `obx aelang compile`
- `/api/v4/aelang/doctor`
- `/api/v4/aelang/compile`

Current functional scope:

- Detects AELang-High vs AELang-Core.
- Parses the v0.1 grammar subset.
- Validates Department OS lanes AE0-AE14.
- Normalizes legacy product spelling.
- Compiles AELang-High into route packet shape.
- Maps route packet into Operating Spine shape.
- Writes compile and doctor receipts.
- Does not execute shell commands, mutate files, call models, or perform rollback.

Needed for full implementation:

- Formal tokenizer/AST.
- Strict JSON Schema for route packets and receipts.
- AELang-Core parser that can support nested structured values beyond the current subset.
- Transpiler target for JS/Hermes/ORANGEBOX runtime actions.
- Permission model for write actions.
- Resiliency syntax: checkpointed missions, API fallback, stall recovery, offline sync, conflict resolution.
- Visual event protocol binding to Silent Canvas.

Acceptance proof:

- `obx aelang doctor --full --receipt`
- Fixture suite with valid/invalid High/Core/resiliency/offline examples
- Compile result drives a route packet through route doctor without manual conversion

## Grok Share Additions

The Grok share exposed one extremely useful product failure: Grok claimed a PDF existed at `/home/workdir/artifacts/Orangeb0x_Resiliency_Module.pdf`, but the operator could not access it. ORANGEBOX should treat this as a design requirement.

### 15. Artifact Delivery Contract

Current status: `planned`

Feature target:

- Any generated artifact must exist on the operator machine or in an explicitly reachable download/share location.
- Every artifact claim must include path, existence, byte size, hash, preview/open action, package inclusion status, and rollback/delete action.

Acceptance proof:

- `obx artifact doctor --receipt`
- A deliberately missing artifact claim fails with a clear recovery action
- AE Operations Artifact Library never shows a claimed artifact as "done" unless the file exists and hashes

### 16. API Resilience + Agent Continuity

Current status: `planned`

Feature target:

- Provider health monitor, retry/backoff queue, fallback lanes, circuit breakers, heartbeat receipts, stall receipts, pause/resume tickets, and route-level recovery.

Acceptance proof:

- `obx resilience doctor --receipt`
- API timeout simulation creates a stalled receipt and does not lose route state

### 17. Formal Receipt Schema

Current status: `partial`

Existing evidence:

- The project already writes many receipt types.

Gap:

- Needs canonical JSON Schema, required fields, action/status taxonomy, proof field rules, rollback linkage, before/after state conventions, and Silent Canvas metadata conventions.

Acceptance proof:

- `obx receipts schema-doctor --receipt`
- Latest receipts validate or are explicitly legacy-laned

## Build Order

1. AELang Resiliency Module spec and fixture suite.
2. Artifact Delivery Contract and doctor.
3. Receipt schema doctor.
4. Agent continuity and stall recovery.
5. Model routing intelligence and provider circuit breakers.
6. Cost budgets and dashboard.
7. Deep repo index persistence and hybrid search.
8. Git/PR workflows.
9. Testing framework.
10. Rules/memories surface.
11. Analytics surface.
12. Extensions SDK.
13. Collaboration.
14. Marketplace.
15. AI Box clustering.
16. Offline sync.

This order solves the user's biggest live pain first: APIs stall, agents freeze, artifacts disappear, and the system loses track. The visual and strategic moat only matters if continuity is bulletproof.
