# ORANGEBOX Intel Integration Brief

Catalog: orangebox-intel-integration-backlog-2026-05-18

This is an operator-supplied research integration backlog. Items are candidates, not verified production claims. Promotion requires primary-source verification, local proof, and receipts.

Items: 12

## P0 - delta-rule online memory for LLMs

ID: `delta-mem`
Status: `candidate_prototype`
Domains: `memory`, `local_agents`, `mesh`

Tiny fixed-size external associative memory updated online with gated delta-rule learning, intended to augment frozen LLMs without context growth or backbone fine-tuning.

Why it matters:
Fills the long-running local-agent memory gap without KV cache explosion. Strong fit for sovereign Beelink/local setups and shared memory across persistent ORANGEBOX agents.

ORANGEBOX integration:
- Build a local delta-mem lab prototype that can replay agent traces into a small state matrix.
- Expose memory snapshots in the cockpit as inspectable matrices and before/after task deltas.
- Use as a sidecar first; only attempt attention-wrapper integration after a controlled local benchmark.

Proof needed:
- Primary paper verification.
- Local toy benchmark against receipt/query recall.
- Regression gate proving it helps memory-heavy tasks without hurting baseline agent behavior.

Risk: Early paper. Direct attention injection into GGUF/llama.cpp may require non-trivial runtime work; sidecar memory is safer first.

## P0 - AEvo-style proposer plus meta-editor self-improvement

ID: `aevo-agentic-evolution`
Status: `candidate_design`
Domains: `self_improvement`, `receipts`, `mesh`

Two-role loop where a proposer agent attempts work and a meta-agent studies traces, failures, and receipts to improve the proposer procedure.

Why it matters:
ORANGEBOX already emits receipts and traces. This turns the proof trail into a learning substrate instead of dead logs.

ORANGEBOX integration:
- Add a Meta-Editor review lane that reads failed and successful receipts.
- Emit procedure patches as proposed prompt/version diffs, never silent auto-promotions.
- Gate promotion through prompt eval, benefits gate, and regression receipts.

Proof needed:
- Replay one fixed task suite with baseline vs evolved procedure.
- Require measurable improvement before promotion.
- Rollback path for every promoted procedure.

Risk: Self-improvement can overfit to local traces; keep candidate workspaces and baseline comparisons.

## P1 - TRELLIS.2 / O-Voxel 3D asset lane

ID: `trellis2-o-voxel`
Status: `watch_and_verify`
Domains: `3d`, `creative_tools`, `visualization`

Open-source image-to-3D and sparse voxel/mesh representation direction, useful for 3D concept assets and theoretical visualization.

Why it matters:
Extends ORANGEBOX from text/2D cockpit into 3D asset and concept-map generation. Could support future visual surfaces and SoT-style spatial explainers.

ORANGEBOX integration:
- Add as optional creative module only after hardware/runtime requirements are known.
- Use output as assets in a Surface Factory-created 3D surface.
- Keep model downloads and GPU execution explicit/operator-approved.

Proof needed:
- Verify repository/license/model weights.
- Local smoke test on approved GPU machine.
- Asset provenance and export manifest.

Risk: Likely heavy runtime/model download; keep out of default portable.

## P0 - NanoResearch-style skill bank and policy learning

ID: `nanoresearch-skill-bank`
Status: `candidate_design`
Domains: `research_agents`, `skills`, `memory`

Long-lived research agent pattern with a skill bank, project memory module, and feedback-driven planner updates.

Why it matters:
Directly maps to ORANGEBOX departments, skills, receipts, and research/coding assistants.

ORANGEBOX integration:
- Create a structured skill distillation pass from repeated successful receipts.
- Store project-specific memory separate from reusable procedural skill.
- Add a planner update proposal artifact with explicit before/after eval.

Proof needed:
- Skill extraction schema.
- Receipt replay showing extracted skill reduces steps or failures.
- Promotion gate to avoid always-on junk skills.

Risk: Skill bloat and stale procedures; require versioning and retirement.

## P1 - Expert research workbench pattern

ID: `deepmind-co-mathematician-pattern`
Status: `candidate_design`
Domains: `research_agents`, `theoretical_workbench`, `async_state`

Asynchronous, stateful expert-domain workbench pattern with ideation, literature discovery, computational checks, theorem verification, uncertainty tracking, and failed-attempt recording.

Why it matters:
ORANGEBOX should support serious research work as a stateful cockpit, not only chat output.

ORANGEBOX integration:
- Add a Theoretical Forge surface template.
- Record failed attempts as first-class artifacts.
- Separate conjecture, evidence, counterexample, citation, and proof-state lanes.

Proof needed:
- Surface Factory template spec.
- One local domain fixture with failed-attempt replay.
- Citation/proof-state receipt.

Risk: Can become a generic notes app unless proof/citation states are enforced.

## P0 - Multi-agent sovereignty and disagreement safeguards

ID: `multi-agent-sovereignty-gap`
Status: `candidate_feature`
Domains: `coordination`, `safety`, `mesh`

Multi-agent systems can suppress correct answers to agree with the group; agent ordering may matter more than agent count.

Why it matters:
ORANGEBOX departments must not become a consensus theater. Disagreement and independent judgment need explicit preservation.

ORANGEBOX integration:
- Add a sovereignty check to department route receipts.
- Require at least one independent dissent/reality-contact lane on high-impact decisions.
- Track agent order and compare alternate orderings in eval fixtures.

Proof needed:
- Synthetic disagreement fixture.
- Receipt field for independent answer before party-line merge.
- Checkmate gate that flags consensus without independent evidence.

Risk: Too much disagreement can slow work; use only where impact/risk warrants it.

## P1 - Grep-primary retrieval harness

ID: `grep-primary-agentic-search`
Status: `candidate_prototype`
Domains: `search`, `local_agents`, `cost`

Agentic harnesses around plain text search can match or beat embedding retrieval on some coding-agent tasks.

Why it matters:
ORANGEBOX can stay faster, cheaper, and more inspectable by defaulting to grep/rg-first retrieval before heavier vector infrastructure.

ORANGEBOX integration:
- Add retrieval policy: rg/keyword first, vector second, primary-source citations always.
- Benchmark on ORANGEBOX code navigation tasks.
- Expose search path used in receipts.

Proof needed:
- A/B local retrieval benchmark.
- Latency and correctness metrics.
- Failure cases where embeddings still win.

Risk: Pure grep misses semantic matches; use hybrid fallback.

## P0 - Horizon generalization through macro-actions

ID: `horizon-generalization-macro-actions`
Status: `candidate_architecture`
Domains: `long_horizon_agents`, `planning`, `orchestration`

Re-parameterize long tasks with higher-level macro actions to reduce training/execution horizon and improve long-horizon stability.

Why it matters:
ORANGEBOX jobs should not be thousands of tiny brittle steps. Macro-actions give agents durable action chunks with better credit assignment.

ORANGEBOX integration:
- Define macro-action primitives for build waves: inspect, patch, verify, package, receipt, promote.
- Add macro-action IDs to job traces and receipts.
- Use macro-actions in planner prompts and Surface Factory workflows.

Proof needed:
- Long task replay with micro-step vs macro-action traces.
- Reduced failure/retry count.
- Clear rollback for each macro-action.

Risk: Macros can hide unsafe details; each macro needs internal evidence and rollback.

## P0 - Coordination as a separate architecture layer

ID: `coordination-as-architecture`
Status: `candidate_architecture`
Domains: `coordination`, `mesh`, `departments`

Treat coordination policy separately from agent logic and information access; many multi-agent failures are coordination defects, not model defects.

Why it matters:
ORANGEBOX must route departments through explicit coordination laws rather than assuming more agents equals better work.

ORANGEBOX integration:
- Add a coordination profile to every department route.
- Track topology, order, arbitration rule, and escalation policy in receipts.
- Create controlled evals with same context but different coordination policy.

Proof needed:
- Coordination schema.
- At least two route policies evaluated on the same fixture.
- Failure taxonomy for coordination defects.

Risk: Coordination layer can become bureaucracy; keep it configurable and measured.

## P0 - Clarification timing policy for long-horizon agents

ID: `clarification-timing-policy`
Status: `candidate_feature`
Domains: `agent_ux`, `planning`, `oversight`

Clarification value decays over task progress; goal clarification is mostly useful early, while input clarification remains useful longer.

Why it matters:
Stops agents from wasting operator attention late in a run and prevents silent wrong assumptions at the start.

ORANGEBOX integration:
- Add early goal-clarification gate before execution starts.
- Allow mid-run input clarification only when evidence shows blocked state.
- Log clarification timing and whether it changed outcome.

Proof needed:
- Policy document and route schema field.
- Long-run fixture with early/late clarification comparison.
- UI affordance for non-blocking operator input.

Risk: Too rigid a policy can prevent necessary late correction; permit safety exceptions.

## P0 - Skill text to structured executable skill

ID: `structured-skill-distillation`
Status: `candidate_feature`
Domains: `skills`, `agent_harness`, `reuse`

Distill unstructured skill text and repeated successful procedures into structured, composable, executable skill definitions.

Why it matters:
ORANGEBOX already has many skills; the next jump is turning skill prose into versioned procedures with inputs, outputs, proofs, and promotion gates.

ORANGEBOX integration:
- Define skill structure schema: trigger, inputs, actions, forbidden actions, proof, rollback.
- Build a skill distillation command over selected receipts.
- Use vendor-import/promotion gates before always-on activation.

Proof needed:
- Schema validator.
- One distilled skill from a known ORANGEBOX receipt series.
- Regression against baseline manual workflow.

Risk: Over-automation and stale recipes; keep skills opt-in until proven.

## P0 - Claude-native optimizer cockpit lane

ID: `claude-native-optimizer`
Status: `candidate_feature`
Domains: `model_lanes`, `claude_code`, `agent_ux`

Make ORANGEBOX understand Claude-native operation: extended thinking effort profiles, literal prompt templates, worktree isolation, sub-agent delegation, autonomy sliders, and oversight rules.

Why it matters:
Claude Code/Opus is a major reasoning and coding lane. ORANGEBOX should present it as a first-class orchestration profile, not generic chat.

ORANGEBOX integration:
- Add model profiles for Claude-style effort and role choices.
- Create Claude-native prompt templates for gather/act/verify, sub-agent delegation, and plan mode.
- Expose autonomy/oversight modes in the cockpit and receipts.

Proof needed:
- Prompt template registry.
- One Claude-native route packet exported for Claude Code.
- Comparison against generic prompt on the same ORANGEBOX task.

Risk: Vendor behavior changes; keep profiles versioned and source-dated.

