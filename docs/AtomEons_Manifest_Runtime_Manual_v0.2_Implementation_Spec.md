# AtomEons Manifest Runtime Manual v0.2 Implementation Spec

Date: 2026-05-27

Status: implemented as a guarded ORANGEBOX control-plane slice. v0.4 adds safe real local endpoint proof plus a read-only AI Box command contract. Real paid/frontier model execution remains off by default.

## Objective

Build the subscription-native Bun control plane without letting any LLM become the project manager.

The deterministic runtime owns:

- manifest parsing
- DAG readiness
- explicit context packing
- retry caps
- idempotency
- escalation records
- receipts
- validation gates
- adapter enablement

LLMs remain workers behind the runtime.

## Baseline vs Changes

Accepted:

- Bun is the control-plane runtime.
- SQLite is the local receipt and idempotency ledger.
- Context is explicit and zero-bleed.
- Retry caps stop loops.
- Larger models are escalation advisors, not the default executor.
- Subscription CLIs are preferred over API billing.
- Local Qwen/Bonsai style workers are the default fast/local path.

Corrected:

- Qwen-assigned synthesis is treated as `local_code`, not automatically frontier.
- Completed legacy receipt rows can receive v0.2 context and route metadata without rerunning work.
- Cyclic DAGs are rejected at manifest load, not discovered as a silent blocked run.
- AI Box command rail stays gated behind fixed read-only contracts because it is a full-access remote command surface.

Approval-needed:

- Enable local/AI Box model-generation micro-smoke with tiny prompts and strict timeout caps.
- Enable Claude Code or Codex subscription adapters.
- Decide whether AGY/Antigravity is dry-run-only or allowed to write in an isolated worktree.

## Implemented Files

- `control-plane/engine.ts`
- `control-plane/adapters.ts`
- `control-plane/context-packer.ts`
- `control-plane/model-policy.ts`
- `control-plane/doctor.ts`
- `control-plane/adapter-doctor.ts`
- `control-plane/control-plane-smoke.ts`
- `control-plane/control-plane-real-adapter-smoke.ts`
- `control-plane/local-llama-generation-smoke.ts`
- `control-plane/topology.ts`
- `control-plane/topology-doctor.ts`
- `control-plane/run-bun.mjs`
- `control-plane/MANIFEST.example.json`
- `control-plane/README.md`
- `control-plane/context/SidebarProps.ts`
- `control-plane/context/oled_tokens.json`

## Manifest Contract

```ts
interface Step {
  task_type: string;
  assigned_node: string;
  explicit_context: string[];
  output_schema: string;
  retry_cap: number;
  depends_on: string[];
  context_max_bytes?: number;
}

interface Manifest {
  order_id: string;
  status?: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  idempotency_key: string;
  dag_graph: Record<string, Step>;
}
```

Required manifest guarantees:

- `order_id` exists.
- `idempotency_key` exists.
- every dependency references an existing step.
- every step has a positive `retry_cap`.
- every step has an explicit context array.
- DAG cycles are rejected before execution.

## Explicit Context

Implemented context references:

- `path/to/file.ext`
- `step_id.output`
- `step_id.hash`
- `step_id.error`

Each context pack records:

- requested refs
- per-chunk kind
- per-chunk byte count
- per-chunk SHA-256
- total byte count
- whole-pack SHA-256
- max byte cap

Root escape is blocked. A manifest rooted at `control-plane` cannot read `../package.json`.

## Receipt Schema

SQLite table `receipt_log` now stores:

- `order_id`
- `step_id`
- `state`
- `attempts`
- `timestamp`
- `hash`
- `assigned_node`
- `output_schema`
- `context_hash`
- `context_receipt`
- `route_policy_json`
- `output_text`
- `error_trace`

SQLite table `order_events` remains append-only:

- `order_id`
- `step_id`
- `event_type`
- `timestamp`
- `detail_json`

## Route Policy

The route policy records how the runtime thinks about model/lane selection without making model calls.

Current lanes:

- `local_endpoint`
- `local_fast`
- `local_code`
- `subscription_frontier`
- `subscription_contrarian`
- `tool_execution`

Current example:

```json
{
  "step_id": "step_1",
  "task_type": "synthesis",
  "assigned_node": "qwen3-coder-32b",
  "primary_lane": "local_code",
  "subscription_first": false,
  "api_last_resort": true,
  "fallback_chain": ["local_qwen", "codex_subscription", "claude_subscription"],
  "escalation_advisor": "codex_validator_then_claude_opus"
}
```

This is the present-day answer to “how does the larger model spin up as needed?”:

1. local or assigned lane attempts the step first.
2. deterministic validator checks the output.
3. retries continue until `retry_cap`.
4. if the cap is hit, the step becomes `ESCALATED`.
5. the receipt names the larger-model advisor and fallback chain.
6. a future adapter may package the explicit context, error trace, and output hash for one targeted hint.

No automatic paid API call is made in v0.2.

## Adapter State

Adapters currently detected:

- mock deterministic adapter: ready
- local llama.cpp CPU listener: ready
- AI Box triad read-only proof adapter: ready
- AI Box allowlisted command contract: ready
- Claude Code subscription CLI: detected, planned
- Codex subscription CLI: detected, planned
- AI Box command rail: reachable, planned
- AGY / Antigravity / Gemini CLI: missing on cockpit PATH
- real node bindings: disabled guard present

The AI Box command rail has `/health`, `/receipts`, `/command`, `/put-file`, and `/get-file`. `/command` is full-access and requires token plus an explicit confirmation path. v0.4 still does not call raw `8097 /command` from the control plane. It uses the local ORANGEBOX sidecar for:

- read-only triad/Ollama model proof
- a fixed read-only runtime identity command
- one tiny local CPU llama.cpp completion smoke
- Checkmate light receipts and controller artifacts

Manifests cannot supply arbitrary shell to this adapter.

## Commands

```powershell
npm.cmd run control:doctor
npm.cmd run control:smoke
npm.cmd run control:topology
npm.cmd run control:real-smoke
npm.cmd run control:llama-gen
npm.cmd run control:adapters
npm.cmd run control:big
npm.cmd run control:run
```

## Latest Proof

- Topology doctor: `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T140957.json`
- Real adapter smoke: `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T141005.json`
- Local llama generation smoke: `C:\AtomEons\orangebox\receipts\orangebox-local-llama-generation-smoke-20260527T141011.json`
- Control-plane doctor: `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T141016.json`
- Control-plane smoke: `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T141022.json`
- Adapter doctor: `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T141002.json`
- Final green board: `C:\AtomEons\orangebox\receipts\orangebox-final-green-board-20260527T115503.json`

## Next Phase

Phase 0.4 adds the first real adapter gate plus the first read-only AI Box command contract, not a paid/frontier model call.

Required before real adapter execution:

- command allowlist
- timeout ceiling
- max output bytes
- environment scrub rules
- write/worktree policy
- local receipt for every remote command
- explicit operator/env arm flag
- deterministic output schema validator

Implemented first real adapters:

- local llama.cpp listener proof via `/health` and `/v1/models`
- AI Box model inventory proof through the ORANGEBOX sidecar triad route
- AI Box runtime command proof through a fixed read-only sidecar command
- local llama.cpp generation proof through one tiny CPU completion
- no repository writes
- no paid API calls
- no large model generation on the N150
- no raw full-access command rail call from the control plane

Next phase should add model-generation micro-smoke and schema-specific validators before Claude Code, Codex, and AGY adapters are allowed to execute work.
