# ORANGEBOX Innovation Queue - 2026-05-27

Status: non-visual Alpha/research synthesis.

Scope:

- Local Alpha bookmark intake.
- JarvisLabs LLM upgrade sweep.
- XDK and Claude Code reliability intake.
- Anthropic Alpha docs.
- Memory, knowledge, AELang, Department OS, warbook, and V6 research docs.
- Current two-device reality: command N150 plus Codexa AI Box, no local GPU on the controller.

Boundary:

- No visual work.
- No X API credential use.
- No XDK install.
- No XMCP host registration.
- No paid/frontier API call.
- No uncontrolled AI Box command rail call.

## Executive Read

The next real innovation is not another model picker. The system needs a research-to-runtime loop:

```text
source alpha -> accepted/corrected/held decision -> implementation ticket
-> deterministic doctor -> receipt -> memory update -> next synthesis
```

The strongest innovations all converge on the same spine:

- fresher context
- governed memory
- checked tool/session health
- Department OS routing
- quarantined MCPs
- local/AI Box inference proof
- agent benchmarks that punish shallow optimization

## P0 Innovations

### 1. Delta Context Ledger

Problem:
The knowledge engine can rebuild a large corpus, but the Alpha points to stale context and full-rebuild waste as core failure modes.

Innovation:
Add a content-hash ledger and incremental rebuild planner for `knowledge-v2`.

What changes:

- Every source doc gets `path`, `bytes`, `sha256`, `mtime`, and `source_kind`.
- Rebuild computes changed, deleted, and unchanged sets before extraction.
- Receipts record skipped unchanged files and changed-doc deltas.
- Context packs can declare freshness age and refuse stale packs for critical tasks.

Proof gate:

- First run indexes all docs.
- Second run after no file changes skips unchanged docs.
- A one-file mutation produces a one-file delta receipt.

Source signals:

- `ALPHA_BOOKMARK_REVIEW`: CocoIndex and stale-data prevention.
- `V6_TRENDING_INTEGRATION_PLAN`: Merkle-tree incremental indexing.
- `memory/orangebox-knowledge-v2/ENGINE.md`: v2.1 residuals.

### 2. Four-Tier Memory Governor

Problem:
ORANGEBOX has memory layers, but agent memory needs lifecycle verbs: extract, update, retrieve, delete, contradict, and expire.

Innovation:
Create a governed memory pipeline:

```text
working -> episodic -> semantic -> procedural
```

What changes:

- Working memory stores raw recent receipts and tool outputs.
- Episodic memory stores session summaries.
- Semantic memory stores facts and decisions with provenance.
- Procedural memory stores reusable workflows and operator patterns.
- Contradictions create correction entries instead of silently overwriting.
- Old low-use memories decay unless cited or used.

Proof gate:

- Synthetic receipts consolidate into all four tiers.
- Contradictory facts produce a contradiction receipt.
- Retrieval explains which tier supplied each result.

Source signals:

- `4-MEMORY-AND-KNOWLEDGE.md`: Layer 1 truth, Layer 2 index.
- `ALPHA_BOOKMARK_REVIEW`: MemFactory and delta-mem.
- `V6_TRENDING_INTEGRATION_PLAN`: agentmemory, four-tier memory, Ebbinghaus decay.

### 3. Claude/Codex Session Health Governor

Problem:
Claude Code reliability has improved, but ORANGEBOX still needs local proof that sessions, tool calls, compaction, media, and MCP outputs are healthy.

Innovation:
Add a local session transcript validator and context-health doctor.

What changes:

- Detect mismatched `tool_use` / `tool_result` pairs.
- Detect oversized MCP outputs before they poison context.
- Detect binary/media objects that should be file artifacts.
- Track compaction pressure and preserve receipt IDs, paths, current DAG node, and rollback instructions.
- Emit a `session-health` receipt before handoff or escalation.

Proof gate:

- A fixture with an unmatched tool result fails.
- A large mock MCP output is capped and routed to artifact storage.
- A compacted handoff packet preserves receipt IDs and rollback path.

Source signals:

- `ALPHA_XDK_CLAUDE_CODE_INTAKE`: compaction, MCP reliability, self-healing sessions, tool-result mismatch.
- `V4_ALPHA_FROM_ANTHROPIC_DOCS`: compaction instructions and memory tool.
- `AELANG_RESILIENCY_MODULE`: heartbeat, stall, and resume receipts.

### 4. Department Router Dry Run

Problem:
The Department OS architecture is strong, but full autonomous dispatch is premature.

Innovation:
Ship a route-only Department Router that never mutates files or spends money.

What changes:

- Canonical AE1-AE14 registry.
- Model lane metadata and budget class per department.
- Trust tier fields: advisor, conditional, autonomous.
- Route receipts show selected primary and secondary departments.
- Operator can override routing before any future dispatch.

Proof gate:

- "Code change with tests" routes to AE6 Code, AE14 Bench, AE7 Review.
- "Source verification" routes to AE2 Research and AE7 Review.
- No command execution occurs.

Source signals:

- `DEPT_LLM_ARCHITECTURE_2026-05-18.md`: AE1-AE14, trust gradient, budget caps.
- `AELANG_SPEC.md`: route packets and department lanes.
- `AtomEons_Manifest_Runtime_Manual_v0.2_Implementation_Spec.md`: deterministic control plane owns routing.

### 5. MCP Quarantine Gateway

Problem:
Official MCPs and SDK-generated servers are useful, but a write-capable MCP can leak credentials, mutate accounts, or spend money.

Innovation:
Create a generic MCP promotion firewall.

What changes:

- Candidate MCP registry.
- Health probe.
- Tool-list probe.
- OAuth/scope inventory.
- Per-tool risk classifier.
- Read-only default.
- Output cap and timeout cap.
- Prompt-injection wrapper around tool results.
- Write paths require explicit simulation, approval, and receipt.

Proof gate:

- Mock MCP server registers as `candidate`.
- Tool list classifies read and write tools.
- Write tool cannot run until promoted to `verified_write_guarded`.

Source signals:

- `SILENT_CANVAS_BIG_BUILD_ADDENDUM`: generic MCP bridge and verifier.
- `ALPHA_XDK_CLAUDE_CODE_INTAKE`: XMCP must go through verifier.
- `SCOPE_4100_DAYS`: MCP mux, not host Claude Code config.

### 6. Agent Bench Arena

Problem:
Agent systems can look busy while doing shallow hyperparameter churn. We need tests that reward algorithmic progress and long-horizon coherence.

Innovation:
Create a local benchmark lane inspired by NanoGPT-Bench, YC-Bench, and LongMemEval, but small enough to run on this machine.

What changes:

- Deterministic long-horizon tasks.
- Scratchpad required.
- Penalize repeated trivial parameter tweaks.
- Score useful structural improvements, memory retrieval, and receipt discipline.
- Keep no-model fixtures for baseline doctor runs.

Proof gate:

- Local fixture produces score JSON.
- A shallow "change one knob repeatedly" run scores lower than a structural solution.
- Receipt records benchmark family, protected metrics, and promotion verdict.

Source signals:

- `ALPHA_BOOKMARK_REVIEW`: NanoGPT-Bench and YC-Bench.
- `V6_TRENDING_INTEGRATION_PLAN`: LongMemEval-S honesty work.
- `$bench` and `$failpattern` workflow requirements.

### 7. Hardware-Aware Inference Matrix

Problem:
The system must be smart for the current two-device setup, not pretend the N150 has a GPU.

Innovation:
Turn inference acceleration into a profile matrix with explicit hardware gates.

What changes:

- Current lane: N150 CPU llama.cpp listener plus AI Box Ollama proof.
- Future GPU lane: vLLM baseline.
- Agent-prefix lane: SGLang/RadixAttention.
- Speculative lanes: vLLM suffix/ngram, llama.cpp MTP, EAGLE only when supported.
- Each profile requires endpoint, model, benchmark, quality check, and rollback.

Proof gate:

- On no-GPU controller, vLLM/SGLang remain deferred, not blockers.
- AI Box model inventory and local listener generation remain required.
- Future GPU profile cannot turn green without benchmark receipts.

Source signals:

- `JARVISLABS_FULL_BLOG_SWEEP`: vLLM, SGLang, speculative decoding, MTP, quantization.
- `ORANGEBOX_PROCESS_BOOK_2026-05-27`: two-device truth.
- `inference-acceleration-doctor.mjs`: current adaptive lane.

## P1 Innovations

### 8. X Alpha Feed Typed Lane

Innovation:
Build a credential-free X API mock/playground smoke around the official TypeScript XDK contract.

First proof:

- Parse mock paginated timelines.
- Prove typed post, author, media, and link extraction.
- Record rate-limit and retry policy.
- Keep credentials out until `alpha-xdk-credential-policy` passes.

### 9. Receipt Intelligence Miner

Innovation:
Mine receipts for repeated failure patterns and automatically propose regression guards.

First proof:

- Fixture receipts with repeated MCP timeout, context overflow, and tool mismatch produce named clusters.
- Each cluster includes likely cause and suggested guard.

### 10. AELang Resilience Kernel

Innovation:
Implement the first runtime slice of checkpointed missions.

First proof:

- Simulated heartbeat.
- Simulated stall.
- Resume ticket with last green receipt and recovery command.

### 11. Research Provenance Graph

Innovation:
Create a local graph connecting:

```text
source -> claim -> decision -> ticket -> touched file -> receipt
```

First proof:

- XDK Alpha and JarvisLabs Alpha each appear as source nodes.
- Each accepted/corrected/held decision has evidence and promotion state.

### 12. Night Watch Spore Queue

Innovation:
Background proposal engine that reads receipts and Alpha queues, then creates dormant suggestions only.

First proof:

- No model calls by default.
- No mutations by default.
- Suggestions carry cost cap, source evidence, and proof gate.
- Operator approval required before any ticket becomes implementation work.

## Hold Or Defer

- Full X API integration: hold until credential policy and playground smoke exist.
- XMCP registration: hold until MCP Quarantine Gateway exists.
- vLLM/SGLang install on N150: defer because controller has no GPU.
- Visual rewind, pulse ring, and canvas organism UI: paused because operator explicitly stopped visual work.
- Autonomous Department dispatch: hold until dry-run router and trust ledger prove stable.

## First Build Order

1. `innovation:synthesis` doctor.
   Keeps this queue reproducible.

2. Delta Context Ledger.
   Attacks the stale-context problem and improves every model lane.

3. Session Health Governor.
   Converts Claude/Codex reliability Alpha into local proof and fewer broken handoffs.

4. Department Router Dry Run.
   Gives the organism its routing skeleton without opening mutation risk.

5. MCP Quarantine Gateway.
   Required before XMCP or external MCPs become operational.

6. Agent Bench Arena.
   Prevents "optimization" theater and gives every later improvement a score.

## Done Evidence

This synthesis is done when:

- `docs/ORANGEBOX_INNOVATION_QUEUE_2026-05-27.md` exists.
- `scripts/v4/innovation-synthesis-doctor.mjs` exists.
- `npm.cmd run innovation:synthesis` passes.
- A receipt exists under `C:\AtomEons\orangebox\receipts`.
- No visual files, X credentials, API calls, or MCP host config are touched.

Latest proof:

- Command: `npm.cmd run innovation:synthesis`
- Result: 19 source docs read, 12 innovation candidates, 7 P0, 5 P1, 0 failures.
- Queue: `C:\Users\a\OrangeBox-Data\innovation\latest-innovation-queue.json`
- Stamped queue: `C:\Users\a\OrangeBox-Data\innovation\innovation-queue-20260527T154105.json`
- Receipt: `C:\AtomEons\orangebox\receipts\orangebox-innovation-synthesis-20260527T154105.json`

The first attempted proof correctly failed because the MCP Quarantine Gateway candidate cited `docs/SCOPE_4100_DAYS.md` before the doctor included that file in the source set. The source set was corrected and the second run passed.
