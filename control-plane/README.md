# ORANGEBOX Bun Control Plane

This is the first runnable slice of the subscription-native ORANGEBOX control plane.

The control plane treats LLMs as non-deterministic workers behind deterministic state:

- Bun owns execution.
- SQLite owns receipts and idempotency.
- DAG dependencies decide readiness.
- Each step gets explicit zero-bleed context.
- Deterministic validators decide pass/fail.
- Retry caps trigger an out-of-band escalation state instead of loops.

## v0.2 Additions

- Explicit context is packed through `context-packer.ts` with root-escape protection, per-chunk SHA-256 hashes, total byte caps, and `step.output` / `step.hash` / `step.error` references.
- Manifest loading rejects cyclic DAGs before execution.
- Each dispatched step records a route policy with its primary lane, fallback chain, and larger-model escalation advisor.
- `doctor.ts` proves the manifest, context packer, cycle guard, model route policy, and adapter guard without calling a model or spending API tokens.

## v0.3 Additions

- `topology.ts` and `topology-doctor.ts` prove the real two-device topology: command N150, local `llama.cpp` listener, AI Box command rail, party-line rail, and AI Box Ollama model inventory.
- `adapters.ts` now has two safe real adapters behind the existing real-node gate:
  - `local-llama-cpp-listener` probes `llama.cpp` `/health` and `/v1/models` and returns `TerminalTrace`.
  - `ai-box-triad-readonly` asks the local ORANGEBOX sidecar for the AI Box triad/model proof and returns `TerminalTrace`.
- `control-plane-real-adapter-smoke.ts` runs a real, no-repo-write, no-paid-token DAG with mock mode off.
- `model-policy.ts` now has a `local_endpoint` lane so listener/rail proof steps are not mislabeled as generic fast workers.

## v0.4 Additions

- `adapters.ts` now includes `ai-box-allowlisted-command`, a fixed read-only command contract routed through the local ORANGEBOX sidecar `/api/codexa/command` path.
- The command contract proves the AI Box command rail can execute a diagnostic command, while preserving Checkmate light receipts and refusing arbitrary manifest-controlled shell.
- `control-plane-real-adapter-smoke.ts` now runs a three-step real DAG: local llama listener proof, AI Box Ollama inventory proof, and AI Box read-only command proof.
- `local-llama-generation-smoke.ts` proves the N150 `llama.cpp` listener can answer a tiny local completion request with token accounting.

## Current Boundary

This slice is mock-bound by default. It proves routing, receipts, retries, and escalation without calling Claude, Codex, AGY, Qwen, or Bonsai.

Real node bindings are intentionally disabled unless `ORANGEBOX_CONTROL_PLANE_REAL_NODES=1` is set. The v0.4 real adapters are deliberately narrow: they prove local listener state, AI Box model-lane state, and one read-only AI Box command contract. They do not apply patches, run arbitrary manifest shell, or call paid APIs. The separate llama generation smoke performs one tiny local CPU completion against the N150 listener.

## Run

```powershell
npm.cmd run control:run
```

Smoke test:

```powershell
npm.cmd run control:smoke
```

No-token adapter readiness doctor:

```powershell
npm.cmd run control:adapters
```

v0.2 manifest/control-plane doctor:

```powershell
npm.cmd run control:doctor
```

Two-device topology doctor:

```powershell
npm.cmd run control:topology
```

Real adapter smoke:

```powershell
npm.cmd run control:real-smoke
```

Local llama generation smoke:

```powershell
npm.cmd run control:llama-gen
```

Combined control-plane proof:

```powershell
npm.cmd run control:big
```

The npm scripts use `control-plane\run-bun.mjs`, which resolves the user-local Bun executable even when the current shell was open before Bun was installed. You can still call Bun directly:

```powershell
C:\Users\a\.bun\bin\bun.exe run .\control-plane\control-plane-smoke.ts
```

## Receipt Model

The SQLite database stores:

- `receipt_log`: durable step state, attempts, output hash, context hash, context receipt, route policy, output text, and error trace.
- `order_events`: append-only execution events.

The default CLI database path is `<ORANGEBOX_DATA_ROOT>\control-plane\receipts.db`, falling back to `%USERPROFILE%\OrangeBox-Data\control-plane\receipts.db`.

The smoke test uses an OS temp database and writes a JSON receipt under `C:\AtomEons\orangebox\receipts`.

## Adapter Roadmap

Next implementation steps:

1. Add schema-specific validator modules for code, terminal traces, screenshots, and route receipts.
2. Add local/AI Box model-generation micro-smoke with tiny prompts and strict timeout caps.
3. Add CLI wrappers for Claude Code, Codex, AGY, AI Box Ollama, and Bonsai workers.
4. Keep validation deterministic: JSON schema, syntax checks, AST checks, lint, build, tests, screenshots, and receipt hashes.
