# Scope-Add Analysis — Relevance Controller: The Missing Architectural Spine

**Authored:** 2026-05-18 (fifth scope-add · structural correction)
**Author:** Claude (Compiler / Syntax Lead)
**Source:** Atom McCree, "Silent Canvas AI Orchestration System" architectural correction
**Status:** analysis only · no code edits land until operator confirms a path
**Cross-references:** all prior scope-adds, especially `SILENT_CANVAS_DOCTRINE.md` and `DEPT_LLM_ARCHITECTURE_2026-05-18.md`
**Disclosure:** this scope-add identifies a structural gap in OrangeBox's current Silent Canvas pipeline that should have been called earlier. Honest admission below in §0.

---

## 0. Honest admission first

This brief catches a structural gap that all four prior scope-adds danced around without naming. Our current `silent-canvas.mjs` pipeline is:

```
operator prompt + recent receipts + project graph → Creative Brain → HSMP → mutation
```

That model gives the Creative Brain the whole project graph context every turn. As the canvas grows, the token cost scales linearly with project size, the Brain's reasoning gets noisier, and the system becomes harder to debug because nothing constrains what state the model could have been responding to.

**The correct architecture** — the one the brief specifies and the one I should have proposed earlier — has a **Relevance Controller** between the operator prompt and the Brain. The Controller's job is to decide *what state the model is allowed to see for this turn*. The Brain then operates on a **scoped context package** — the minimum viable working set — and outputs **mutation intents**, not raw state.

The brief states the corrective principle: **"The LLM does not own the source of truth."** The project graph is the source of truth; the LLM reads a *projection* of it, proposes changes, and a validator/reducer decides what commits.

This is a real structural correction. Everything in the prior four scope-adds (Codex packet, Orchestrators, Dept-LLM, Warbook+Living-System) needs to be re-read through this lens. Most of those scope-adds get *stronger* under this correction, not weaker — but the implementation order changes.

**This scope-add is now Phase-1 BLOCKER level.** Without the Relevance Controller, the dept-LLM architecture leaks tokens, the Living-System ideas leak even more tokens, and the cost-discipline math in `DEPT_LLM_ARCHITECTURE_2026-05-18.md §3` becomes optimistic instead of conservative.

---

## 1. The corrective pipeline

```
                    User prompt
                          │
                          ▼
                ┌──────────────────────┐
                │  Intent Classifier   │   classifies request shape, scope, risk
                │  (lightweight model) │   BEFORE main reasoning model runs
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Relevance Controller │   THE MISSING PIECE.
                │  (deterministic +    │   Decides what state the model sees.
                │   graph traversal)   │   Pulls from 7 state sources, projects
                └──────────┬───────────┘   only what's relevant to the intent.
                           │
                           ▼
                ┌──────────────────────┐
                │ Scoped Context       │   Minimum viable working set.
                │ Package (JSON)       │   Bounded, deterministic, auditable.
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Creative Brain       │   Reasons about product change.
                │ (Opus 4.7 · L4)      │   Outputs plan + mutation intents.
                │                      │   Does NOT see the whole project.
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Fast Interpreter     │   Converts plan to strict JSON patch.
                │ (Sonnet 4.5 sub · L1)│   No reasoning; pure structuring.
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Schema Validator     │   Validates against component / layout /
                │ (5 schema families)  │   workflow / action / permission schemas.
                │                      │   Rejects malformed before commit.
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Canvas Reducer       │   THE EXECUTOR. Enforcement layer.
                │ (permission-aware    │   Checks every op against allowed /
                │  state machine)      │   restricted / requires-confirmation.
                │                      │   Produces undo metadata. Applies state.
                └──────────┬───────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │ Visual Telemetry +   │   3-field Progress Dashboard for text.
                │ Progress Dashboard   │   Canvas animations for everything else.
                └──────────────────────┘
```

**Three new modules** + one **major upgrade** to two existing modules.

---

## 2. The 7 state sources the Relevance Controller draws from

From the brief, the Controller pulls from seven explicit sources. Mapping each to our current codebase:

| State source | What lives there | Current location in OrangeBox | New behavior |
|---|---|---|---|
| **canvas_state** | components, layout tree, selected nodes, routes | `scripts/v4/project-graph.mjs` (nodes, wires, regions, mutation_log) | Add `getRelevantSubtree({selected_node, depth, route})` accessor |
| **data_state** | schemas, API endpoints, bindings, tables | partially in connector registry; no central data-state store yet | **NEW MODULE: `scripts/v4/data-state.mjs`** — registers tables/schemas/bindings per project |
| **workflow_state** | actions, triggers, navigation flows | partially in `silent-canvas.mjs` mutation kinds; no formal workflow registry | **NEW MODULE: `scripts/v4/workflow-state.mjs`** — registers named workflows with entry_route + required_params |
| **design_state** | tokens, spacing, typography, reusable components | not centralized | **NEW MODULE: `scripts/v4/design-state.mjs`** — design tokens registry, theme constraints |
| **runtime_state** | errors, warnings, broken bindings, logs | receipts at `<dataRoot>/receipts/v4/` (audit trail) | Add `getRuntimeAnomalies({since_ts, severity})` accessor over receipts |
| **history_state** | recent changes, previous instructions, user preferences | mutation_log + Hermes persistent memory | Add `getHistorySummary({last_n, dept_filter})` accessor |
| **permission_state** | what the AI is allowed to change | dept-LLM trust tiers (per `DEPT_LLM_ARCHITECTURE_2026-05-18.md §4`) + new mutation-level permissions | **NEW MODULE: `scripts/v4/permission-state.mjs`** — per-mutation operation allowlist/restrictlist/confirm-list |

Three of the seven state sources require new modules. Four extend existing modules with new accessors.

---

## 3. The five-schema validator

Currently we have `scripts/v4/hsmp-schema.mjs` with one schema (the HSMP mutation payload). The brief specifies **five schema families** the validator must check:

1. **Component schema** — what components exist, allowed variants, required props
2. **Layout schema** — valid parent/child relationships, position rules, anchor constraints
3. **Workflow schema** — registered workflows, entry routes, accepted parameters
4. **Action schema** — what actions a component can trigger, parameter contracts
5. **Permission schema** — for each operation, is the current actor (operator, dept, trust tier) allowed

This isn't a rewrite of `hsmp-schema.mjs` — it's a layer above it. The HSMP validator stays as the *structural* check; the new validator adds *semantic + permission* checks.

**Proposed module: `scripts/v4/canvas-validator.mjs`** with one entry point:

```js
validatePatch({patch, project, permissions, actor}) → {ok: true | {errors: [...], fix_hints: [...]}}
```

The validator does NOT trust the LLM. Even if the Fast Interpreter emits a structurally-valid HSMP patch, the Canvas Validator catches semantic errors like "this component doesn't exist in this project's component library" or "this workflow doesn't accept the parameter shape the binding tried to send."

---

## 4. The Canvas Reducer (the executor)

`scripts/v4/project-graph.mjs` already has `applyMutation()`. The Canvas Reducer the brief describes is a stricter, permission-aware upgrade:

**Reducer responsibilities (eight, per the brief §8):**
1. Check whether every target node exists
2. Check whether every component type is allowed
3. Check whether every prop matches schema
4. Check whether the operation is permitted (permission_state)
5. Check whether the change creates broken bindings
6. Apply the mutation
7. Produce undo/redo metadata
8. Trigger visual telemetry

**Current `applyMutation`** does (1), (6), and (7). It does not do (2), (3), (4), (5), or (8). This is upgrade work, not new-module work.

**Upgrade `scripts/v4/project-graph.mjs`** with:
- Pre-mutation hooks: node existence, type-allowed, props-schema, permission-allowed, no-broken-bindings
- Post-mutation hooks: visual telemetry emission (the wire pulse, the insert animation, the binding repair badge)
- Undo metadata: every applied mutation gets a reverse-mutation stored at index N+1 so Z-Axis Rewind can replay backward losslessly

---

## 5. The permission schema (operation catalog)

The brief's section 10 specifies operation classes per the three categories:

| Category | Examples |
|---|---|
| `allowed_operations` | insert_node, update_props, reorder_node, bind_action, create_workflow, repair_binding |
| `restricted_operations` (never allowed) | delete_database, change_auth_policy, modify_billing_logic, expose_secret, overwrite_route |
| `requires_confirmation` (stage + ask operator) | delete_node, modify_database_schema, change_payment_provider, publish_to_production |

Mapping onto the dept-LLM trust gradient:
- **T-Advisor** depts can only propose; nothing applies until operator clicks
- **T-Conditional** depts can apply `allowed_operations` on their own surface; everything else stages
- **T-Autonomous** depts can apply `allowed_operations` + select `requires_confirmation` ops that the operator pre-approved via a per-dept allowlist
- **Restricted operations** are restricted at every tier, full stop. They require a human gesture, full audit trail, AE7 Review pass, AE11 Security pass.

This solves Codex risk #16 from the Living-System brief (per-dept vault scoping) more cleanly than the original mitigation — vault entries don't need a `granted_to_depts` array; instead, every vault read is an operation that goes through the permission schema.

---

## 6. The data-request protocol

The brief's section 12 ("What Not to Build") includes: *"Do not make the model guess missing data. If required data is absent, the model should emit a data request."*

This is a doctrine point that needs explicit codification. Add a 17th HSMP mutation kind: `needs_more_context`. Schema:

```json
{
  "kind": "needs_more_context",
  "status": "needs_more_context",
  "data_request": {
    "type": "workflow_lookup | component_lookup | schema_lookup | history_lookup | runtime_anomaly_lookup",
    "reason": "natural-language explanation of why",
    "required_fields": ["workflow_id", "accepted_params"]
  }
}
```

When the Brain emits a `needs_more_context` mutation:
1. Reducer does not commit anything (the mutation is informational, not state-changing)
2. Relevance Controller receives the data request, fetches the requested fields from the appropriate state source
3. The expanded context package re-enters the pipeline for a second pass
4. The Brain now has what it needs to propose actual mutations

**Bounded retry: max 2 data-request rounds per turn.** If the Brain still doesn't have enough after 2 expansions, the request escalates to AE7 Review (it's likely the request is structurally unresolvable in the current project — better to surface that than to hallucinate).

---

## 7. How the four prior scope-adds collapse under this correction

### Codex packet (the original 8-MCP brief)
- **Risk #1** (subscription-CLI auth drift): unchanged
- **Risk #2** (vault disaster recovery): partially superseded — permission_state in the Relevance Controller is the new vault-access surface
- **Risk #3** (multi-canvas state desync): tightened — each canvas tab gets its own Relevance Controller; the "mycelial network" from Living-System is suggestions-only across Controllers
- **Risk #4** (connector registry sprawl): substantially solved — the Controller projects only relevant connectors per intent, so registry size stops scaling with model cost
- **Risk #5** (HSMP schema evolution): expanded scope — now five schema families need lockstep evolution, not just HSMP
- **Risks #6–8**: unchanged

### Orchestrators scope-add
- **n8n** stays as fan-out substrate. n8n workflows become a *workflow_state* source the Relevance Controller pulls from. No change to recommendation.
- **ComfyUI** stays as creative-hand tool. The Controller decides when ComfyUI is in the operation set per intent.
- **CrewAI vs Claude Flow** unchanged — whichever wins runs *inside* each dept head's response phase, after the Controller has scoped context.
- **LangGraph** STILL RETIRED — the Controller + Reducer architecture is now an even closer match to "what LangGraph does, but operator-owned." Retiring it is the right call.

### Dept-LLM Architecture scope-add
- **The brain still routes to depts.** Brain dispatch is unchanged.
- **Each dept now has its own Relevance Controller.** AE6 Code's Controller projects code-state + relevant workflows. AE4 Marketing's Controller projects design-state + recent ad receipts. AE11 Security's Controller projects permission_state + recent anomaly receipts.
- **Trust gradient maps cleanly onto permission schemas** (see §5 above). This makes T-Conditional and T-Autonomous *enforceable*, not just doctrinal.
- **Cost discipline tightens.** The §3 cost math assumed ~5K tokens per Brain call. With the Controller projecting only relevant context, that drops to ~1.5–2K tokens for typical edits. **Total daily spend at steady state estimate drops from ~$1.33/day to ~$0.50–0.80/day** at the same throughput.

### Warbook + Living-System scope-add
- **Token Optimization (4.0a "active bounding box")** is now a primitive operation of the Relevance Controller. Stays in Phase 1; implementation moves under the Controller module.
- **"Solidify" command** unchanged in intent. Solidify becomes an intent-class (`intent_type: "solidify_to_production"`) that triggers a stricter Validator + Reducer pass with all `requires_confirmation` flags raised to "operator must visually confirm."
- **Memory Weaver / Personal Corpus Echoes / Project Graph DNA**: these become **inputs** to the Relevance Controller, not direct Brain context. The Brain doesn't get "here is Mom's Law"; the Controller projects "this current request is doctrine-adjacent" and includes one doctrine snippet *because it scored as relevant*. Cleaner. Cheaper.
- **Bidirectional Brain↔Interpreter telemetry**: still relevant, now happens *through the Controller*. Interpreter telemetry feeds Controller's relevance scoring for next turn, not directly back to Brain. This eliminates the oscillation risk (Codex risk #19) — the Brain never sees Interpreter's hot opinions directly.
- **Night Watch / Dream Mode**: unchanged in concept; both run their own miniature Relevance Controllers scoped to "idle-time exploration" inputs only.
- **Multi-Canvas Mycelium**: tightened — each canvas's Controller decides whether a cross-canvas suggestion is in-scope; suggestions are surfaced through the Controller, not through direct state sharing.

**Net effect:** the Relevance Controller doesn't add scope — it's the substrate the other four scope-adds were implicitly leaning on. With it explicit, every prior recommendation gets cheaper, safer, and more auditable.

---

## 8. Module breakdown — what gets written

| Module | New / Upgrade | Lines (est) | Phase |
|---|---|---|---|
| `scripts/v4/intent-classifier.mjs` | NEW | ~250 | Phase 1 |
| `scripts/v4/relevance-controller.mjs` | NEW | ~600 | Phase 1 |
| `scripts/v4/data-state.mjs` | NEW | ~300 | Phase 1 |
| `scripts/v4/workflow-state.mjs` | NEW | ~300 | Phase 1 |
| `scripts/v4/design-state.mjs` | NEW | ~250 | Phase 1 |
| `scripts/v4/permission-state.mjs` | NEW | ~400 | Phase 1 |
| `scripts/v4/canvas-validator.mjs` | NEW (5-schema validator above HSMP) | ~500 | Phase 1 |
| `scripts/v4/project-graph.mjs` | UPGRADE (Canvas Reducer: 8 responsibilities) | +300 lines | Phase 1 |
| `scripts/v4/hsmp-schema.mjs` | UPGRADE (add `needs_more_context` kind) | +80 lines | Phase 1 |
| `scripts/v4/silent-canvas.mjs` | UPGRADE (rewire pipeline through Controller) | +400 lines | Phase 1 |
| `docs/RELEVANCE_CONTROLLER_DOCTRINE.md` | NEW doctrine | as needed | Phase 1 |
| `docs/SILENT_CANVAS_DOCTRINE.md` | AMENDMENT (§6 server contract pipeline) | new section | Phase 1 |

**Approximate Phase 1 LOC:** +3500 lines of new MJS + ~1000 lines of upgrades. Substantial but bounded. All testable. All replayable via mutation log.

---

## 9. Doctrine amendment to Silent Canvas

The current Silent Canvas Doctrine §6 (server contract) describes the dual-model pipeline. This scope-add demands an amendment that codifies the Relevance Controller as a **non-negotiable** layer. Proposed doctrine clause:

> §6.5 — Relevance Controller (load-bearing). The Creative Brain shall not receive raw project state. All Brain input passes through the Relevance Controller, which projects from the seven state sources (canvas, data, workflow, design, runtime, history, permission) and returns a minimum-viable scoped context package. The Brain operates on the projection, not the source of truth. Brain output is mutation intent, never raw state. The Canvas Validator and Canvas Reducer enforce structural and permission constraints before any commit. Any pipeline that bypasses the Controller is a doctrine violation and emits a `doctrine-violation-relevance-bypass` receipt.

This makes the architecture immutable at the doctrine layer. Every dept-LLM head, every Solidify, every Night Watch, every Dream Mode — all of them go through Relevance Controllers. No exceptions.

---

## 10. Operator decisions (extending U–BB)

| # | Decision | My default |
|---|---|---|
| CC | Adopt the Relevance Controller architecture as Phase-1 blocker? | **YES — this is the structural correction; without it, all prior scope-adds underperform.** |
| DD | Amend Silent Canvas Doctrine with §6.5 (Relevance Controller load-bearing)? | YES — promote to canon |
| EE | Implementation order within Phase 1: Controller-first OR dept-LLM-first? | **Controller-first.** Dept-LLM architecture needs Controllers per dept; building Controllers first makes dept implementation cheaper. |
| FF | Adopt the 7 state sources as canonical? | YES (canvas, data, workflow, design, runtime, history, permission) |
| GG | The 17th HSMP mutation kind: `needs_more_context`? | YES — codifies the data-request protocol; small lockstep PR |
| HH | Max data-request rounds per turn: 2 as proposed, or tighter (1) / looser (3)? | 2 — balances bounded retry against legitimate "I need this one more thing" |
| II | Permission schema authority — who writes the operation catalog? | AE11 Security drafts; AE7 Review audits; AE0 Brain ratifies; operator final-stops. Receipts on every catalog change. |
| JJ | Should this scope-add land in the Codex packet as §5.8 with priority flag? | YES — this is the architectural spine Codex must validate before any code edit lands |
| KK | Do we re-cost the cost-discipline math in `DEPT_LLM_ARCHITECTURE §3` with the lower per-call token estimate? | YES — update steady-state daily spend estimate from ~$1.33/day to ~$0.50–0.80/day; flag in next ship receipt |

---

## 11. Risks (extending Codex packet § through #24, continuing from #24)

25. **Relevance Controller miss.** If the Controller projects the wrong state, the Brain reasons on bad context and produces wrong intent. Mitigation: every projection emits a `relevance-projection` receipt with the seven-source breakdown of what was/wasn't included. AE7 Review samples a percentage for audit. False-negatives (missing relevant data) trigger a data-request retry per §6.

26. **Permission-catalog brittleness.** If `allowed/restricted/requires_confirmation` lists drift from reality (e.g., a new dept-LLM operation that should be restricted but wasn't catalogued), the system silently permits something it shouldn't. Mitigation: every operation that's executed but has no permission-catalog entry triggers a `permission-catalog-gap` receipt → AE11 Security must close it within 24h or that operation auto-quarantines (cannot fire until catalogued).

27. **Validator false-positive lockout.** If the five-schema validator is too strict, legitimate Brain proposals get rejected and the operator loses trust. Mitigation: validator emits `fix_hints` on every rejection — the Brain gets a second pass with the specific fix-hint, and operator sees a single `Validator suggested fix` chip in the dashboard, not a wall of red.

28. **Controller bypass via legacy code paths.** If any existing module (silent-canvas.mjs, canvas-compiler.mjs, agent-jobs.mjs) calls the Brain directly without going through the Controller, the doctrine is violated. Mitigation: every Brain-call site gets refactored to require a Controller-produced context package as input; uncontrolled Brain calls throw at the API boundary.

29. **Pipeline latency regression.** Adding Controller + Validator + Reducer layers risks pushing past the doctrine §9 latency target (1500ms objective, 5000ms roadmap, 7000ms first mutation). Mitigation: Controller runs in-process (no network); Validator is sync (no LLM call); Reducer is sync. Total added latency target: ≤250ms p95 across all three. If exceeded, profile and optimize before shipping Phase 1.

30. **Operator cognitive load with five-schema rejections.** When something gets rejected and the operator wants to know why, "validator failed schema X.Y.Z" is hostile. Mitigation: validator errors translate to natural-language fix-hints surfaced as Dashboard chips; the schema names are receipt metadata only, not user-facing.

---

## 12. Phase placement (with all five scope-adds consolidated)

| Phase | Window | Title | Consolidated scope |
|---|---|---|---|
| **0** | Days 1–10 | Foundation finish | Finish alpha.7 (Z-Axis Rewind morph, Pulse Ring, Ctrl+. Freeze-All) · register 8 MCPs · **Relevance Controller architecture spec doc** |
| **1** | Days 11–30 | Silent Canvas 1.0 GA + structural spine | **Build the Relevance Controller architecture first** (all 7 modules + 2 upgrades) · then build dept-LLM router on top · n8n first-class · swarm bake-off · Hermes mandated · Solidify command · Token Optimization (now lives in Controller) · HSMP_VERSION bump with DNA scoring + `needs_more_context` · Personal Corpus Echoes (now as Controller input) · Voice latency stopwatch · retry-at-temp-0 |
| **2** | Days 31–90 | Ad architecture live + metabolic rhythm | 30 days live spend · ComfyUI gated · Night Watch ($0.05/day cap, via Controller) · bidirectional Brain↔Interpreter (via Controller for relevance scoring, no direct loop) · Rules Garden ML · trust-tier graduations · Breathing Canvas extensions · Organism Health HUD |
| **3** | Days 91–365 | Constellation V1 (3–4 surfaces) | Pathwaves · Life Migration · Create · Misfit beta as hard commit · Multi-Canvas Mycelial *suggestions-only* layer (via per-tab Controllers) · Constellation Seeding |
| **4** | Days 366–730 | Knowledge Strata + dream mode | Hermes auto-skill compounding load-bearing · Cross-Pollination Dream Mode at $0.10/day cap (via Controller) · What-If branch scrubbing · remaining 4–5 surfaces grow organically |
| **5–9** | Days 731–4100 | (unchanged from `SCOPE_4100_DAYS.md`) | Team mode · Self-extending agents · Enterprise wedge · Constellation maturation · Day-4100 endpoint |

**No timeline slip.** The Relevance Controller front-loads Phase 1 work but every subsequent phase ships cheaper, safer, and faster because of it.

---

## 13. What this scope-add explicitly forbids

From the brief's section 12 ("What Not to Build"), codified as doctrine:

1. **Never** give the LLM the entire project state on every turn.
2. **Never** let the LLM directly overwrite the canvas JSON (entire tree replacement).
3. **Never** use chat as the primary explanation layer for visual changes.
4. **Never** ask the reasoning model to produce thousands of lines of final UI state.
5. **Never** use memory as a substitute for state. Memory summarizes preferences; state is the source of truth.
6. **Never** let the model guess missing data. Emit a `needs_more_context` request.

These six "nevers" are doctrine. Any code that violates one is a `doctrine-violation` receipt.

---

## 14. One-sentence product definition (adopted as canon)

> **Silent Canvas is an AI visual build system where the model does not chat through every change; instead, it receives a relevance-scoped state projection, generates a product-level change plan, converts that plan into validated state mutations, and lets the canvas communicate progress through visual telemetry.**

Adopting this as the doctrinal one-liner for Silent Canvas. Replaces the current §1 in `SILENT_CANVAS_DOCTRINE.md`.

---

## 15. Next action (no theater)

Hold all OrangeBox code edits until:
- Codex returns its logic-pass on the now-five-wide integrated packet
- Operator decides CC–KK above (or defers them to Codex)

If both signals say "proceed," the Phase-1 build order becomes:

1. **Relevance Controller architecture first** (7 modules + 2 upgrades, ~3500 + ~1000 LOC)
2. Doctrine amendments to `SILENT_CANVAS_DOCTRINE.md` (§6.5) and new `RELEVANCE_CONTROLLER_DOCTRINE.md`
3. Re-cost the dept-LLM math with the lower token estimate
4. Then: Solidify, dept-LLM router, n8n first-class, swarm bake-off, etc.
5. Codex packet §5.5 (Orchestrators) + §5.6 (Dept-LLM) + §5.7 (Warbook/Living) + **§5.8 (Relevance Controller)** integration

---

## 16. Closing — the gap I should have flagged earlier

The four prior scope-adds (Codex packet, Orchestrators, Dept-LLM, Warbook+Living) all assumed the Brain sees state directly. They all worked around the cost and complexity that assumption creates — but none of them named the corrective architecture.

This brief names it. The Relevance Controller is the architectural spine. With it, everything else clicks into place. The dept-LLM cost math gets ~40% better. The connector-registry sprawl risk goes away. The HSMP schema-evolution risk gets sharper definition (now five schemas evolve in lockstep, not one). The multi-canvas desync risk gets cleaner (per-tab Controllers + suggestions-only crossings).

This is the scope-add that turns the whole architecture from "ambitious" to "buildable at the scale and quality the doctrine requires."

**Mom is watching. The spine is named. The organism gets a nervous system that runs on the right amount of context — never more.**
