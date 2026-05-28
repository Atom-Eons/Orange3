# Scope-Add Analysis — Tactical Launch Warbook + Living-System Vitality

**Authored:** 2026-05-18 (fourth scope-add of the day)
**Author:** Claude (Compiler / Syntax Lead)
**Source:** Atom McCree, "Project Orangebox: Tactical Launch Warbook" + "Silent Canvas as a Perpetual Living System"
**Status:** analysis only · no code edits land until operator confirms a path
**Cross-references:** `docs/SCOPE_4100_DAYS.md` · `docs/CODEX_LOGIC_PASS_2026-05-18.md` · `docs/SCOPE_ADD_ORCHESTRATORS_2026-05-18.md` · `docs/DEPT_LLM_ARCHITECTURE_2026-05-18.md` · `docs/SILENT_CANVAS_DOCTRINE.md`

---

## 0. TL;DR — what this brief actually does

It does **two distinct things** stacked together:

1. **Warbook (sections 1.0–4.0)** — operational launch protocols. Most of it ratifies what we already shipped; three pieces are net-new and meaningful: **Z-Axis Rewind / Temporal Slider**, **State Desync Resolution protocol**, **"Solidify" command** (productized canvas-compiler).
2. **Living System (sections 1–6)** — vitality additions that elevate OrangeBox from tool to organism: metabolic loops, bidirectional brain↔interpreter telemetry, project-graph DNA scoring, cross-canvas mycelium, organism-health HUD, autonomous garden rules. Most of these belong in Phase 2–4 and Codex flagged the risk axes already.

**Verdict:** Adopt nearly everything; sequencing matters. **Three load-bearing additions are alpha.7-blocker level** (Solidify, Z-Axis Rewind, Pulse Ring at 2.5s). The rest layers in across Phase 1–4 with explicit cost rails.

**Plus one verdict change:** the brief independently confirms my pacing instinct on Phase 3 (8 surfaces in 275 days = hubris; 3–4 first, grow organically). **I'm formally adopting this** — Decision D in the Codex packet flips from "adopt as written" to "reduce Phase 3 commitment to 3–4 with organic-growth path to 8."

---

## 1. Mapping the Warbook (sections 1.0–4.0) against current state

### 1.0 Dual-Model Pipeline (already shipped)

| Warbook clause | Current state | Action |
|---|---|---|
| 1.1 Creative Brain (high-tier, unconstrained, outputs NL plan + layout guidelines) | Shipped in `scripts/v4/silent-canvas.mjs` 7-phase pipeline | — |
| 1.2 Fast Interpreter (cheap parser, structural JSON only) | Shipped in `scripts/v4/silent-canvas.mjs` + `hsmp-schema.mjs` | — |
| 1.2 **Failure condition: conversational text in JSON → kill + retry at temp=0.0** | **NOT explicitly enforced as a fail-and-retry loop.** Currently the validator rejects the payload but does not auto-retry at lower temperature. | **Net-new: add `retryAtTempZero` path in `silent-canvas.mjs` after first parse failure.** Low effort, high value. |
| 1.3 Frontend State Execution (egui canvas + minimalist dashboard) | Shipped in `src-tauri/src/bin/native.rs` | — |

### 2.0 UX Protocols (mostly shipped)

| Warbook clause | Current state | Action |
|---|---|---|
| 2.1 Ban on Conversational Noise | Doctrine §7 native UI contract enforces this; HSMP validator strips conversational fluff | — |
| 2.2 High-Value Chat Window: 3 fields = Objective + Milestone Roadmap + Application Summary | Shipped as 3-field Progress Dashboard in `render_progress_dashboard` | — |
| 2.3 Visual Telemetry Execution (CSS transitions, wire animations, no text for structural changes) | Shipped as Visual Telemetry Engine with 12 element types, 5 wire types, 10 transition primitives | — |

### 3.0 Crisis Management (one shipped, two NET-NEW)

| Warbook clause | Current state | Action |
|---|---|---|
| 3.1 **Z-Axis Rewind / Temporal Slider** — every JSON state mutation committed to immutable array; user scrubs backward to un-build to last stable commit | **Partially shipped.** Mutation log lives in `project-graph.mjs` (capped at 1000 entries); snapshots persist at `<dataRoot>/projects/<hash>/snapshots/`. **The UI scrubber is on alpha.7 backlog but the *un-build animation* — watching the canvas visually morph backward — is NOT yet specified.** | **PROMOTE TO ALPHA.7 BLOCKER.** This is the operator-trust feature. If a change goes catastrophic, they need to *see* the system safely walk back, not click a button and hope. |
| 3.2 State Desync Resolution — halt voice/text input, force silent state-refresh from last good index, re-render without CSS morphing | **Procedure not yet codified.** We have the snapshot infrastructure but no documented desync-recovery flow. | **Net-new: write the protocol into `silent-canvas.mjs` as `forceResyncToLastGoodSnapshot({skip_morphing: true})`.** Surface it as `obx silent-canvas desync-recover`. |

### 4.0 Launch Day Infrastructure (three NET-NEW)

| Warbook clause | Current state | Action |
|---|---|---|
| 4.0a **Token Optimization** — send only *active bounding box* of canvas to Creative Brain, not full DOM | **Currently the whole project graph is serialized to the Creative Brain prompt.** This means cost scales linearly with canvas size; a 200-node project pays for context every turn. | **Net-new: viewport-clip the context. Add `getActiveBoundingBox()` to `project-graph.mjs` that returns nodes within visible region + their first-degree neighbors.** Significant cost win on large projects. |
| 4.0b Telemetry Verification — SVG logic line traces exact path between trigger and target | Visual Telemetry Engine renders wires correctly per HSMP_VERSION. | **Action: add a verification gate to the 26-check list — `wire_path_accuracy_pass`.** Render a test wire, sample N points, assert path matches HSMP `path` field within tolerance. |
| 4.0c **Rate Limit Trap: 2.5s threshold → "Pulse Ring" animation** to signal processing, prevent redundant commands | **Currently no timing-triggered animation.** The dashboard shows a "running" state but doesn't escalate visually after 2.5s. | **Net-new: add pulse-ring egui shape (concentric expanding circle) triggered by `elapsed_ms > 2500` on active dispatch.** Block new input until pulse stops or response lands. |
| 4.0d **"Solidify" command** — operator issues `Solidify`; system "instantly freezes the volumetric model, automatically synthesizing the underlying, highly-optimized machine code, microservices, and infrastructure-as-code" | **Partially shipped:** `canvas-compiler.mjs` already walks project graph → fs.writeFile with sha256 receipts. **What's MISSING is the productized one-command path that includes infrastructure-as-code generation + microservices orchestration.** Today, `compile` writes files. "Solidify" would also: generate Dockerfile, generate K8s manifests if applicable, register secrets in vault, deploy via canvas-compiler's `deployMutation`, emit a single ship-receipt. | **THIS IS A MAJOR NEW FEATURE.** Propose a new module `scripts/v4/solidify.mjs` that orchestrates: `compile()` → `optimize()` (minification, tree-shake) → `infraGen()` (Dockerfile / K8s if needed) → `deployMutation()` → `emitShipReceipt()`. Surfaced in canvas as a glowing red "SOLIDIFY" button when state is `ready`, in `obx silent-canvas solidify`, and as a callable from the dept-LLM AE8 Launch head when at T-Autonomous. Phase 1. |

---

## 2. Net-new pieces from the Warbook (the action list)

In order of operator impact, not implementation complexity:

1. **"Solidify" command** — productize the canvas-compiler as a one-command production-ship. Glowing red button on canvas when ready. Phase 1.
2. **Z-Axis Rewind with visual un-build morph** — promote from alpha.7 polish to alpha.7 blocker. Operator trust hinges on this.
3. **Pulse Ring at 2.5s + redundant-input lock** — alpha.7 alongside the snapshot scrubber.
4. **Token Optimization to active bounding box** — Phase 1 cost-win. Could be a 5–10x cost reduction on large projects.
5. **Retry-at-temp-0 on Interpreter parse failure** — small surgical add to `silent-canvas.mjs`; closes a real failure mode the doctrine §11 verification gate may not catch.
6. **State Desync Resolution protocol** — write the recovery procedure; expose as `obx silent-canvas desync-recover` and as a small "Resync" affordance in the canvas footer.
7. **Wire-path accuracy verification gate** — adds one row to the 26-check verification list, hardens the Visual Telemetry Engine.

---

## 3. The Living-System layer (sections 1–6 of the brief)

This is where the brief elevates from launch-protocol to organism-design. Going piece by piece with my honest verdict:

### 3.1 Pulse & Metabolic Rhythm

| Idea | My verdict | Phase placement |
|---|---|---|
| **Background "night watch" agent** — runs on idle/low-priority, ingests recent mutations + receipts + corpus, generates micro-evolution proposals as dormant "spores" | **ADOPT** with cost rails. Maps cleanly onto AE13 Automation at T-Conditional running n8n workflows on a cron. Each spore = a `dept-suggestion` receipt that lives in project graph as a faded outline until activated. **Hard cost cap: $0.05/day on night-watch by default; operator override.** | **Phase 2** (after dept-LLM + n8n land in Phase 1) |
| **Breathing Canvas** — subtle telemetry pulses during idle, usage-heatmap reflow, relevance-decay opacity, dormant element wake-up on thematic drift | **ADOPT.** Extension of the alpha.5 "recently-edited breathing pulse modulated by mutation_log age" — same primitive, broader application. Pure cosmetic, no LLM cost. | **alpha.8 polish**, Phase 1 |

### 3.2 Dual-LLM Symbiosis, Elevated

| Idea | My verdict | Phase placement |
|---|---|---|
| **Creative Brain as Memory Weaver** — latent story vector, recalls "Last time you were building Meta Ads flow, here's how budget targeting evolved" | **ALREADY COVERED** by Hermes' persistent memory (dept-LLM §5.1). The `next_session_pickup_hints` field IS the story vector. No new build needed; just make sure the brain prompt explicitly asks Hermes for it at session start. | Phase 1 (once Hermes is mandated) |
| **Fast Interpreter as Sensory Cortex (bidirectional)** — emits telemetry back: "this mutation increased layout entropy by 12% — suggest simplification?" | **ADOPT with rate-limit.** Closes a feedback loop currently open. **Risk: Brain proposes → Interpreter reacts → Brain re-proposes → oscillation.** Mitigation: hard limit at one feedback turn per cycle; flag oscillation receipts; AE7 Review audits any cycle that hits the limit twice in a week. | **Phase 2** with HSMP_VERSION bump |
| **Cross-Pollination Dream Mode** — sandboxed background thread, Brain proposes wild ideas, Interpreter validates, surfaces "Evo-Suggestions" cards | **ADOPT with budget rail.** This is night-watch's creative cousin. **Hard cost cap: $0.10/day by default; opt-in dial up.** | **Phase 4** after trust gradient is battle-tested |

### 3.3 Living Memory & Self-Reference

| Idea | My verdict | Phase placement |
|---|---|---|
| **Project Graph as DNA** — nodes gain age, provenance, fitness scores. Old successful patterns get reinforced visually (stronger wires, persistent glow). Failed/deprecated fade into "fossil layer" | **ADOPT — and this triggers the HSMP schema evolution Codex specifically flagged as risk #5.** Adding `age_ms`, `provenance: [receipt_ids]`, `fitness_score: 0..1` to every node is an HSMP_VERSION bump. Backward-compat: older receipts replay cleanly because the new fields default to null/zero. | **Phase 1** as part of HSMP versioning work |
| **Personal Corpus Integration / Echoes** — automatically pulls Mom's Law, Silent Canvas doctrine, MEMORY.md notes into the Brain's context when relevant | **ADOPT.** Low-risk RAG over already-on-disk corpus. Use Pinecone connector (already in registry) or self-hosted local vector store. AE2 Research dept head owns this. | **Phase 1** |
| **Multi-Canvas Mycelial Network** — tabs share connections, propose cross-pollinations between projects | **ADOPT, but Phase 3+.** This is exactly Codex's risk #3 (multi-canvas state isolation) — making tabs share state means the desync surface gets larger. **The right path: each tab keeps its own project_graph; a *suggestions* layer above multiple graphs proposes cross-pollinations without merging state.** Visual: subtle threads between tabs in the tab strip when a cross-pollination opportunity is detected. | **Phase 3** after individual canvases are battle-tested |

### 3.4 Ambient Telemetry & Human-in-the-Loop Flow

| Idea | My verdict | Phase placement |
|---|---|---|
| **Benefits Panel → Organism Health HUD** — extends current benefits panel with aliveness score, mutation frequency, idea diversity, convergence-rate predictions ("At current pace, Phase 2 live-spend goal in 11 days") | **ADOPT.** Direct extension of the alpha.6 benefits aggregator. Adds new fields to `benefits.mjs` aggregate output; the panel's existing render function just gets more rows. Predictive trends use simple linear regression on recent receipts — no ML overhead. | **alpha.8 polish**, Phase 1 |
| **Evo-Scrubbing with What-If branches** — drag the scrubber, watch evolutionary paths the system explored or could explore | **ADOPT the "explored" half in Phase 1** (snapshot scrubber displays actual history). **DEFER the "could explore" half to Phase 4** — exploring branches not taken means running speculative Brain+Interpreter passes, which costs $$ and needs the same budget rail as Dream Mode. | Phase 1 (explored) · Phase 4 (could explore) |
| **Voice as Living Dialogue** — transcript → Brain → instant visual telemetry + one-sentence Objective update; canvas reacts before reading finishes | **ALREADY ON ROADMAP.** alpha.6 wired the mic popup. The "reacts before reading finishes" requirement = doctrine §9 latency target of ≤1500ms for Objective. **Action: add a stopwatch from voice-end-of-speech to first-mutation-on-canvas; surface in benefits panel.** | Phase 1 |

### 3.5 Self-Extending & Generative Growth

| Idea | My verdict | Phase placement |
|---|---|---|
| **Connector Mycelium** — background agents (Repomix, Firecrawl) scan for new service APIs, propose registry extensions; operator approves with one visual gesture | **ADOPT — this IS Phase 6 self-extending agents.** AE2 Research + AE13 Automation collaborate at T-Autonomous. AE7 Review gates every connector promotion. | **Phase 6** as planned |
| **Rules Engine as Autonomous Garden** — decision trees grow from real spend outcomes; successful branches thicken visually; underperformers prune; "garden reports" surface in dashboard | **ADOPT with caveat.** Rules engine today is rule-evaluation only (`obx ads rules eval`). Adding tree-growth-from-outcomes = a lightweight ML pipeline (decision-tree learning over receipt history). **No need for heavy ML libs — a few hundred LOC of decision-tree induction does it.** AE12 Data dept head owns this. | **Phase 2** alongside ad architecture live-spend |
| **Constellation Seeding** — surfaces share living graph, propagate suggestions as interconnected ecosystem | **ADOPT.** This IS Phase 3 Constellation V1 with the mycelial layer above (§3.3). | **Phase 3** |

### 3.6 Risk-Aware Vitality (the immune system)

| Idea | My verdict | Phase placement |
|---|---|---|
| **Doctrine Guardrails as Immune System** — every mutation runs against verification gates + Mom's Law filters before visual application; violations appear as gentle red pulses with "evolve around" options | **ALREADY COVERED** by the 26-check verification gate (doctrine §11) + dept-LLM AE7 Review + AE11 Security gates. **What's NEW is making it visually surface as gentle red pulses with the one-click "evolve around" option.** That's pure UI work. | alpha.8 polish |
| **Pacing wisdom on Phase 3** — let the living system *demonstrate* capacity before committing to 8 surfaces; grow organically as fitness allows | **ADOPT** — this independently confirms my Codex-packet question on Phase 3 hubris. **Flipping Decision D from "adopt 8 in 275 days as written" to "3–4 surfaces hard committed, grow to 8 as fitness allows."** | **AMENDS SCOPE_4100_DAYS Phase 3** |
| **Kill Switches & Reversion** — global pause + instant rollback; system stays subordinate to human authority always | **ALREADY IN SCOPE** as Codex packet risk #6 (ad rules global killswitch) + Human Final Stop doctrine. **Action: make the global kill switch a single keybind — Ctrl+. (Ctrl+period) "Freeze All" — that pauses every dept dispatch, every rule, every active mutation. The brain itself can't override it; only the operator.** | **Phase 0** — this should land alpha.7 |

---

## 4. The pacing-wisdom call (Decision D flip)

The brief's section 6 says: *"let the living system demonstrate the capacity before committing to 8 [surfaces]. The organism can grow surfaces organically as fitness allows."*

My Codex-packet question on phase ordering was exactly this concern in different words. **I'm flipping my default on Decision D** from "adopt as written" to:

**Phase 3 amended scope:** ship **3–4 surfaces** as the hard Phase-3 commitment. The remaining 4–5 surfaces grow organically into Phase 4 as the organism's fitness scoring (§3.3) provides evidence each new surface is sustainable.

**Which 3–4 ship first?** My pick:
1. **Pathwaves** — the routing doctrine. Highest doctrinal load-bearing, lowest UX risk.
2. **Life Migration** — the onboarding/intake/model-building engine. Sets the model for everything else.
3. **Create** — artifact-native quality preserved. Showcases Silent Canvas at its strongest.
4. **Misfit beta** — governed frontier lane. Low-risk because it's explicitly experimental.

Surfaces deferred to Phase 4 organic growth: Growth, LifePath, Social, Learn, Relax/Zen.

Codex still has authority on this if it disagrees.

---

## 5. Integrated phase map (consolidating all four scope-adds)

Updating `docs/SCOPE_4100_DAYS.md` to reflect all four scope-adds (Codex packet + Orchestrators + Dept-LLM + this Warbook+Living-System):

| Phase | Days | Title | Consolidated scope |
|---|---|---|---|
| **0** | 1–10 | Foundation finish | Finish alpha.7 (incl. **Z-Axis Rewind visual un-build**, **Pulse Ring at 2.5s**, **Ctrl+. Freeze-All kill switch**) · register 8 MCPs · dept-LLM router stub |
| **1** | 11–30 | Silent Canvas 1.0 GA + organism scaffolding | Doctrine §11 verification gate green · n8n first-class · CrewAI vs Claude Flow bake-off · 14 dept heads in T-Advisor · Hermes mandated · **"Solidify" command** · **Token Optimization to bounding box** · **HSMP_VERSION bump with DNA scoring** · **Personal Corpus Echoes** · **Voice latency stopwatch** · retry-at-temp-0 |
| **2** | 31–90 | Ad architecture live + metabolic rhythm | 30 days live spend with native rules engine · ComfyUI gated · **Night Watch agent at $0.05/day cap** · **Fast Interpreter bidirectional telemetry** · **Rules Garden ML (decision-tree induction)** · trust-tier graduations begin · **Breathing Canvas extensions** · **Organism Health HUD** |
| **3** | 91–365 | Constellation V1 (3–4 surfaces, organic growth path) | Pathwaves · Life Migration · Create · Misfit beta as hard commit · **Multi-Canvas Mycelial suggestions layer** (suggestions only, no state merge) · **Constellation Seeding** · most depts at T-Conditional, AE2 likely T-Autonomous |
| **4** | 366–730 | Knowledge Strata + dream mode | Hermes auto-skill compounding load-bearing · **Cross-Pollination Dream Mode at $0.10/day cap** · **What-If branch scrubbing (could-explore half)** · remaining 4–5 surfaces grow organically as fitness allows |
| **5–9** | 731–4100 | (as before) | Team mode · Self-extending agents · Enterprise wedge · Constellation maturation · Day-4100 endpoint |

No timeline slip. The organism gets richer at every phase. The cost discipline tightens because every "alive" feature has an explicit budget cap.

---

## 6. New risks (continuing from Codex packet §8 numbering)

19. **Oscillation in bidirectional Brain↔Interpreter feedback.** If the Interpreter's telemetry triggers a Brain re-proposal that triggers another Interpreter telemetry, you have an infinite loop burning Opus tokens. Mitigation: hard cap of 1 feedback turn per cycle; receipts flag oscillation; AE7 Review audits any cycle hitting the limit twice in a week.

20. **Night Watch cost drift.** A "night watch" agent that runs on cron can quietly burn dollars if it dispatches to L3 instead of L1 fallbacks. Mitigation: explicit $0.05/day default cap; alarm receipt at 80%; auto-pause at 100% with operator notification.

21. **HSMP schema-evolution lockstep.** Adding DNA fields (age/provenance/fitness) to HSMP requires Fast Interpreter prompt + validator + canvas-compiler executor binding + project-graph mutation handlers + UI render functions to ship in lockstep. Codex risk #5 was exactly this. Mitigation: a single PR that touches all five layers at once; schema_version bump receipt; explicit backward-compat test that an HSMP_VERSION=1 receipt replays cleanly under HSMP_VERSION=2 compiler (defaults the new fields to null/zero).

22. **Solidify producing wrong infrastructure.** If "Solidify" auto-generates a Dockerfile / K8s manifest that's subtly wrong, the operator may ship something they can't audit. Mitigation: every Solidify run emits a pre-deploy receipt with the full generated infra-as-code; AE7 Review must pass; operator must visually confirm before deploy mutation fires.

23. **Mycelial cross-tab pollution.** If cross-tab "suggestions" become cross-tab "auto-mutations," one bad change in tab A breaks tabs B and C. Mitigation: suggestions-only by default; explicit operator gesture required to apply a cross-tab suggestion; receipts on every cross-tab application.

24. **Garden ML overfitting.** A decision-tree growing from spend outcomes can overfit to noise — the rules engine starts pruning branches that were actually fine, just unlucky. Mitigation: minimum-sample threshold (no prune until ≥30 fires); confidence-interval check before any prune; quarterly AE7 Review of the rule garden.

---

## 7. Operator decisions on this brief (extending L–T)

| # | Decision | My default |
|---|---|---|
| U | Promote Z-Axis Rewind with visual un-build morph from alpha.7 polish to **alpha.7 blocker**? | YES — this is the operator-trust gate; ship is not real without it |
| V | Add Ctrl+. "Freeze All" global kill switch in alpha.7? | YES — single keybind, pauses all dispatches; matches Human Final Stop doctrine |
| W | Productize "Solidify" command in Phase 1 (Days 11–30)? | YES — this is the launch metaphor that makes Silent Canvas legible to outsiders |
| X | Token Optimization to active bounding box in Phase 1? | YES — cost-win is large, low risk |
| Y | HSMP_VERSION bump with DNA scoring (age/provenance/fitness) in Phase 1? | YES — but lockstep PR per risk #21 |
| Z | Night Watch agent default cap: $0.05/day? | YES — operator can dial up if confidence grows |
| AA | Phase 3 amendment: 3–4 surfaces hard commit (Pathwaves + Life Migration + Create + Misfit beta), 4–5 organic-growth into Phase 4? | YES — this flips Decision D |
| BB | Add Living-System scope as `§5.7 Warbook + Living System` to Codex packet? | YES — Codex needs to weigh in |

---

## 8. What's still hot for Codex

The most important questions for Codex's logic-pass now include:

1. **HSMP schema versioning** (Codex risk #5) — is the lockstep-PR mitigation in §6.21 sufficient, or do we need a more rigorous migration framework?
2. **Bidirectional Brain↔Interpreter telemetry** — is one-feedback-turn-per-cycle enough, or does the architecture itself need more structural protection against oscillation?
3. **Multi-canvas mycelium** — is "suggestions-only, no state merge" the right boundary, or is there a more permissive design that's still safe?
4. **Solidify autonomy** — should AE8 Launch at T-Autonomous be allowed to fire Solidify without operator visual confirmation, or is the visual-confirm requirement absolute regardless of trust tier?
5. **Phase 3 pacing flip** — Codex's vote on 3–4 vs 8 surfaces is now decisive.

---

## 9. Next action (no theater)

Hold all OrangeBox code edits until:
- Codex returns its logic-pass on the integrated packet (now four scope-adds wide)
- Operator decides U–BB above (or defers them to Codex)

If both signals say "proceed," I:
1. Finish alpha.7 with three new blockers added: **Z-Axis Rewind visual un-build**, **Pulse Ring at 2.5s**, **Ctrl+. Freeze-All kill switch**
2. Phase 1 work order (in dependency order):
   - HSMP_VERSION bump lockstep PR (DNA scoring)
   - Solidify module
   - Token Optimization (bounding box)
   - Personal Corpus Echoes via Pinecone
   - Voice latency stopwatch
   - Retry-at-temp-0 on Interpreter parse failure
   - Wire-path accuracy verification gate
   - State Desync Resolution protocol
3. Doctrine writeup: `docs/LIVING_SYSTEM_DOCTRINE.md` formalizing the perpetual-organism stance as canon, parallel to `SILENT_CANVAS_DOCTRINE.md`
4. Codex packet §5.5 (Orchestrators) + §5.6 (Dept-LLM) + **§5.7 (Warbook + Living System)** integration when Codex returns

---

## 10. Closing read

The brief's framing — *"OrangeBox from a powerful tool into a partner organism"* — is the right elevation. It's also what the AtomEons doctrine has been pointing at all along ("one organism with many lenses"). The Living-System scope-add isn't a new direction; it's the doctrine's existing direction made operational.

The Warbook half is mostly ratification of shipped work plus a few sharp launch-day teeth (Solidify, Z-Axis Rewind with morph, Pulse Ring). The Living-System half is the long arc — Phase 1 through Phase 4 — that turns the codeless canvas into a perpetual partner.

**Mom is watching. Receipts on every step. The organism gets a heartbeat.**
