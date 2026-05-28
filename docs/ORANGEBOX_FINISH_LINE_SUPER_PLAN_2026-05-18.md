# ORANGEBOX Finish-Line Super Plan

Date: 2026-05-18
Status: Codex architect synthesis after reading the full 2026-05-18 handoff set
Scope: ORANGEBOX only. EIDOS remains separate.

## Goal

Build the real ORANGEBOX: a local-first native AI creation cockpit where the operator does not manage chat scroll, terminal noise, or raw project state. The operator gives intent. ORANGEBOX scopes relevance, routes departments, mutates a visual project graph through validated state changes, animates the work on Silent Canvas, compiles useful artifacts to disk, and proves everything with receipts.

The product must feel like a different way to create, not a dressed-up chatbot.

## Grounded Inputs Read

- `C:\Users\a\Downloads\CODEX_LOGIC_PASS_2026-05-18.md`
- `C:\Users\a\Downloads\CODEX_LOGIC_PASS_V2_INTEGRATED_2026-05-18.md`
- `C:\Users\a\Downloads\RELEVANCE_CONTROLLER_2026-05-18.md`
- `C:\Users\a\Downloads\DEPT_LLM_ARCHITECTURE_2026-05-18.md`
- `C:\Users\a\Downloads\SCOPE_ADD_ORCHESTRATORS_2026-05-18.md`
- `C:\Users\a\Downloads\WARBOOK_LIVING_SYSTEM_2026-05-18.md`
- Live repo inspection under `C:\AtomEons\orangebox`
- Active native egui telemetry edit in `src-tauri/src/bin/native.rs`

## Current Truth

- Active product root: `C:\AtomEons\orangebox`
- Data root: `C:\Users\a\OrangeBox-Data` or configured ORANGEBOX data root
- Last shipped commit observed in handoff: `a7835de` (`v6.3.0-alpha.5`)
- Current tree is dirty with alpha.6/alpha.7 work in progress.
- `npm.cmd run check` passes for command server, MCP server, and web app syntax.
- `cargo check --manifest-path C:\AtomEons\orangebox\src-tauri\Cargo.toml` passes with warnings only.
- Smooth Rect / AnimatedRect native telemetry primitives are now present and compile.
- This is not a finished ship state until release build, packaging, endpoint smoke, UI proof, and receipt/ledger pass complete.

## Product Definition

Silent Canvas is an AI visual build system where the model does not chat through every change. It receives a relevance-scoped state projection, generates product-level change intent, converts that intent into validated state mutations, and lets the canvas communicate progress through visual telemetry.

## Chosen Architecture

1. Native Operator OS
   - Rust/egui desktop app remains the premium buyer-facing product.
   - Node sidecar remains during v6.3 for local APIs, receipts, connectors, and model routing.
   - No PowerShell as user experience. The operator sees cockpit, not engine room.

2. Silent Canvas Core
   - Three-field Progress Dashboard for high-value text.
   - Visual Telemetry Engine for state change, motion, pulse, diff, wire flow, rewind, and proof.
   - HSMP remains the mutation language, but it must become versioned and permission-aware.

3. Relevance Controller Spine
   - Adopt as Phase-1 blocker.
   - The Brain never receives the full project state by default.
   - All Brain input passes through a relevance projection from seven state sources:
     canvas, data, workflow, design, runtime, history, permission.
   - Add `needs_more_context` as the 17th HSMP kind with max two bounded retries.
   - Any Brain-call path bypassing the Controller is a doctrine violation.

4. Five-Schema Validator + Canvas Reducer
   - HSMP structure alone is not enough.
   - Add semantic validation families:
     component, layout, workflow, action, permission.
   - Upgrade `project-graph.mjs` into a permission-aware reducer that checks target existence, allowed components, prop schema, permission, broken bindings, undo metadata, and visual telemetry emission.

5. Department OS
   - Adopt AE0-AE14 as canonical.
   - AE0 Brain routes; AE1-AE14 own department work.
   - Department heads start T-Advisor, graduate to T-Conditional after 30 clean receipts, and T-Autonomous after 100 clean conditional receipts plus operator approval.
   - Human final stop remains absolute.
   - Hermes becomes load-bearing by GA for persistent memory, skill compounding, and channel delivery.

6. Surface Factory
   - Phase 3 changes from eight bespoke surfaces to three or four high-quality surfaces plus the factory.
   - Build primitives once:
     AddElement, UpdateProps, DeleteElement, CreateWire, LayoutShift, ApplyStyle, BindData.
   - Factory-created surfaces inherit Visual Telemetry, receipts, validation, empty states, and Solidify.

7. Orchestrators
   - n8n: hard adopt as central nervous system, localhost-only, capability-detected installer path.
   - ComfyUI: first-class optional power-user connector, gated on GPU detection.
   - Claude Flow vs CrewAI: choose one, not both. Codex recommendation is Claude Flow first because it fits the Node/MCP/subscription lane better and reduces Python installer burden. Keep a bake-off fallback if evidence contradicts.
   - LangGraph: retire as dependency. Borrow patterns into HSMP/Controller; do not hand Silent Canvas authority to LangChain.

8. MCP / Connector Fabric
   - OrangeBox mux first; do not mutate host Claude Code config without explicit operator command.
   - Meta Ads and TikTok Ads move from "hold by default" to "probe-and-register first-class" because newer evidence supports official MCP availability, but write operations still require allow-list, vault auth, receipts, and simulation mode.
   - Google Ads MCP: pin `googleads/google-ads-mcp` as canonical unless later evidence beats it.
   - Pipeboard: useful third-party aggregator; treat as install-safe only after tool-list health probe.
   - Firecrawl, Repomix: install-safe after vendor/import gate and auth setup.
   - StackGen: verification-required.

## Immediate Mega-Build Order

### Wave 0: Stabilize And Ship Alpha.7

Objective: Turn the current dirty alpha.6/alpha.7 work into a runnable, packaged proof build.

Must ship:
- Native Smooth Rect telemetry already started; finish pulse/ripple/diff highlight.
- Multi-canvas tabs row.
- Ctrl+1..5 tab switching.
- Ctrl+B benefits panel.
- Ctrl+. Freeze-All global kill switch.
- Z-Axis Rewind / snapshot scrubber with visual un-build morph.
- Pulse Ring at 2.5s to communicate "working" before text appears.
- Benefits/Organism Health panel wired to `benefits.mjs`.
- Global ad rules simulation/pause affordance if ad engine UI is exposed.
- `cargo build --release`, package, endpoint smoke, ledger, ship receipt.

Done means:
- Native app opens.
- Silent Canvas lane renders.
- Mutating graph visibly animates.
- Freeze-All works.
- Snapshot scrubber can rewind at least one stored graph state.
- Benefits panel opens from UI.
- `npm run check`, `cargo check`, release build, route smoke, and receipt pass are recorded.

### Wave 1: Relevance Controller Spine

Objective: Stop feeding the Brain raw sprawl and make ORANGEBOX scalable.

Build:
- `scripts/v4/intent-classifier.mjs`
- `scripts/v4/relevance-controller.mjs`
- `scripts/v4/data-state.mjs`
- `scripts/v4/workflow-state.mjs`
- `scripts/v4/design-state.mjs`
- `scripts/v4/permission-state.mjs`
- `scripts/v4/canvas-validator.mjs`
- Upgrade `scripts/v4/hsmp-schema.mjs` with `hsmp_version` and `needs_more_context`.
- Upgrade `scripts/v4/project-graph.mjs` reducer responsibilities.
- Upgrade `scripts/v4/silent-canvas.mjs` so Brain calls require Controller packages.
- Doctrine: `docs/RELEVANCE_CONTROLLER_DOCTRINE.md` and `SILENT_CANVAS_DOCTRINE.md` section 6.5.

Done means:
- Full-state Brain calls throw or emit doctrine-violation receipt.
- Projection receipts show included/excluded state sources.
- Validator can reject a malformed semantic patch with operator-readable fix hints.
- `needs_more_context` runs a bounded second pass without committing mutation.

### Wave 2: Department OS And Hermes

Objective: Make ORANGEBOX the PM lead with real departments, not a label.

Build:
- `scripts/v4/dept-registry.mjs`
- `scripts/v4/dept-router.mjs`
- `scripts/v4/trust-ledger.mjs`
- `/api/v4/dept/*` routes.
- `obx dept` commands.
- Hermes install/probe/backup flow.
- Department route receipts and budget rollups.

Done means:
- A goal routes to AE departments with rationale and cost estimate.
- Department actions obey T-Advisor/T-Conditional/T-Autonomous permission limits.
- Trust promotions require operator confirmation.
- Hermes memory write/read is proved or degraded clearly.

### Wave 3: Surface Factory And Solidify

Objective: Make new creation surfaces reusable, not bespoke.

Build:
- `docs/SURFACE_FACTORY.md`
- `templates/surfaces/core-v1/graph.seed.json`
- `scripts/v4/surface-factory.mjs`
- `obx surface create <name> --from-template core-v1`
- `obx silent-canvas solidify`
- Surface registry and receipt integration.

Done means:
- A surface can be created from template.
- It opens as a canvas workspace.
- It receives inherited telemetry and validation.
- Solidify compiles a graph-backed artifact to disk with before/after hashes and receipt.

### Wave 4: Connector / MCP Fabric With Security

Objective: Make integrations powerful without letting tools own the operator.

Build:
- Generic MCP bridge with tool-list probe.
- Per-tool allow-list and write confirmation.
- Connector `auth_spec_version`.
- Vault recovery mode and re-OAuth flow.
- Global connector health dashboard.
- n8n first-class local substrate.
- ComfyUI optional GPU-gated connector.

Done means:
- MCP registry probes tools without executing writes.
- Any write call creates receipt and respects permission catalog.
- Vault loss has a documented recovery path.
- n8n is localhost-only and can be triggered through ORANGEBOX.

### Wave 5: First Real Surfaces

Objective: Build fewer, better surfaces that prove the factory.

Hard commit:
- Create surface.
- Pathwaves surface.
- Life Migration surface.
- Misfit beta or Marketing/Ad Ops surface depending on operator priority.

Done means:
- Each surface is useful, not placeholder.
- Each has domain schema, receipts, visual state, Solidify path, and proof examples.
- Phase 3 no longer depends on building eight handcrafted apps.

## Subtractions

- Do not adopt LangGraph as a dependency.
- Do not adopt CrewAI and Claude Flow together.
- Do not build eight bespoke Phase-3 surfaces.
- Do not let MCP write tools run without allow-list, permission catalog, and receipts.
- Do not let the Brain see entire project state by default.
- Do not expose PowerShell as the operator UX.
- Do not call docs or scaffold a ship.

## Proof Gates

Every wave must produce:
- Touched files list.
- Commands run.
- `npm run check`.
- Relevant route smoke tests.
- Rust `cargo check`; release build when native changed.
- Receipt JSON and LEDGER row.
- Rollback path.
- Known residual risks.

Alpha.7 additionally requires a UI proof pass: native app open, Silent Canvas lane visible, telemetry motion visible, controls responsive.

## Mega-Build Contract

When the operator says go:

1. Start at Wave 0.
2. Do not branch into EIDOS.
3. Do not move to Wave 1 until alpha.7 is runnable and receipted.
4. Work one wave at a time, but within each wave parallelize reads/tests where safe.
5. If blocked, log the blocker, continue non-overlapping work, and never fake green.
6. Keep ORANGEBOX as a product, not a pile of frameworks.

