# ORANGEBOX LLM System Status - 2026-05-27

## Purpose

This note records the present-day ORANGEBOX system state after the 2026-05-27 unblock and proof pass. It is the handoff baseline before any Bun/GTi15 subscription-native control-plane upgrade.

Status: functionally green with receipt-backed proof. The stale cockpit learner prompt has been removed, the department-learning payload has been regenerated with ORANGEBOX language, the AI Box direct link is verified, and the command rail, bridge, Ethereal socket, local Ollama models, knowledge engine, API, MCP, model switchboard, visual proofs, and final board are working.

Remaining watch items are not software blockers:

- Ethereal adapter is negotiated at 1 Gbps, not 2.5 Gbps+. This is physical link/NIC/cable negotiation, not an ORANGEBOX service failure.
- Repo is dirty because this machine has active work and generated proof artifacts. A clean release still needs a stage/hold decision.

Latest core receipts:

- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T133719.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T133731.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T133727.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T133739.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T133747.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T140957.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T141005.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T141002.json`
- `C:\AtomEons\orangebox\receipts\orangebox-local-llama-generation-smoke-20260527T141011.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T141016.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T141022.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T133504.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T133540.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T133431.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T133604.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T133604.json`
- `C:\AtomEons\orangebox\receipts\orangebox-final-green-board-20260527T115503.json`
- `C:\AtomEons\orangebox\receipts\orangebox-process-doctor-20260527T115519.json`
- `C:\AtomEons\orangebox\receipts\orangebox-inference-acceleration-doctor-20260527T114357.json`
- `C:\AtomEons\orangebox\receipts\orangebox-llama-cpp-install-20260527T114255.json`
- `C:\AtomEons\orangebox\receipts\orangebox-final-green-board-20260527T100642.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T095718.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T095718.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T095731.json`
- `C:\AtomEons\orangebox\receipts\orangebox-process-doctor-20260527T100654.json`
- `C:\AtomEons\orangebox\receipts\orangebox-feature-reality-doctor-20260527T030923.json`
- `C:\AtomEons\orangebox\receipts\orangebox-ae-see-suite-visual-proof-20260527T030225.json`
- `C:\AtomEons\orangebox\receipts\orangebox-ae-operations-visual-proof-20260527T093013.json`
- `C:\AtomEons\orangebox\receipts\orangebox-product-language-doctor-20260527T030000.json`
- `C:\AtomEons\orangebox\receipts\orangebox-ai-box-network-20260527T025237.json`
- `C:\AtomEons\orangebox\receipts\orangebox-ai-box-network-20260527T025251.json`

## Active Split

- Codex owns execution, local mutation, installation, automation control, proof, receipts, and rollback notes.
- Claude Code / Opus owns deep reasoning, contract shaping, repo understanding, long-context synthesis, compression, and research packaging.
- GPT/GPT-5 is a peer frontier lane for architecture and execution review, not a universal default.
- Gemini / AGY is the intended future contrarian lane, but no local AGY or Antigravity CLI path was verified on this cockpit.
- Grok is deprecated and remains legacy metadata/advisory only.

## Current Running Brain

The model switchboard currently defaults to the Opus / Claude Code lane because no explicit active-brain override file is present.

Detected runnable subscription CLIs on the cockpit:

- Codex CLI: detected.
- Claude Code CLI: detected.

Not detected locally on the cockpit:

- Gemini CLI / AGY / Antigravity CLI.
- Grok CLI.
- Cockpit-side Ollama.

Verified on the AI Box:

- Ollama is running.
- `qwen2.5-coder:7b` generated the expected smoke token.
- `qwen2.5-coder:32b-instruct-q8_0` generated the expected smoke token.

The switchboard doctor is no-token by default. It uses version/path probes and temp-root roundtrips, not paid model calls.

## Smart Router Behavior

The current router selects task-specific lanes. Running Brain metadata is applied only where a deep-lane override makes sense.

Deep-lane Running Brain override applies to:

- `architecture`
- `pr_review`
- `synthesis`

Fast/local lanes remain task-routed:

- `autocomplete` -> Anthropic Haiku metadata lane.
- `quick_reply` -> Groq metadata lane.
- `offline_chat` -> local/Ollama metadata lane.

Provider metadata does not mean the provider is executable. A lane is executable only when its CLI, subscription auth, API key, or local endpoint is configured and verified.

## Current Model Catalog

Anthropic metadata:

- `claude-haiku-4-5-20251001`
- `claude-sonnet-4-5-20251015`
- `claude-opus-4-7-20250930`

OpenAI metadata:

- `gpt-5`

Google metadata:

- `gemini-1.5-pro-002`
- Gemini CLI-mode metadata

Groq metadata:

- `llama-3.3-70b-versatile`
- `gemma2-9b-it`

Local/Ollama route metadata:

- `qwen2.5:7b`
- `llama3.2:3b`

AI Box verified local models:

- `qwen2.5-coder:7b`
- `qwen2.5-coder:32b-instruct-q8_0`

Additional legacy/provider-router entries:

- `grok-2`
- `grok-2-mini`
- Cerebras `llama-3.3-70b`
- DeepSeek Chat / Reasoner
- Codestral
- Mistral Large
- `meta-llama/Llama-4-70b-instruct`
- Moonshot 128k

## Agent System

ORANGEBOX currently has two overlapping agent layers:

1. Internal ORANGEBOX skills and routes.

   These are provider-neutral. Examples reported by the switchboard doctor include `sprint`, `freeze`, `memory`, `trilane`, `composer`, and `handoff`.

2. Provider-native skill surfaces.

   Claude Code has repo context and native rule/skill surfaces. Codex owns local tool execution and proof in this run.

The current agent posture is not a free-running swarm. It is a receipt-backed command surface with explicit route decisions, temp-root doctors, and read-only probes unless mutation is requested.

## Knowledge Engine

Knowledge v2 is local, streaming, no-LLM extraction.

Latest rebuilds:

- Repo root: 2050 docs compiled, 2050 fidelity docs, 0 skipped, 459,588,844 bytes in.
- User data root: 347 docs compiled, 0 skipped.

Department learning:

- Generated at `C:\Users\a\OrangeBox-Data\knowledge\department-learning\department-learning.json`.
- API status is `VERIFIED`.
- Current payload has 6 trends and 15 sources.
- Stale cockpit wording such as "run the learner" and "run department-learning" is not present in the live UI smoke checks.

## Compression And Cache

RTK compression works for compressible tool-output classes:

- Synthetic grep-like output: 23,071 bytes to 7,860 bytes, 65.9 percent savings, original preserved.
- Synthetic diff-like output correctly skipped compression when it would not save bytes.

Caveman compression works on verbose prose-like output:

- Medium/tight profile saved 11.6 percent on the tested verbose bullet sample.

CLC/context compression is useful but not universal:

- Best observed source was `LESSONS_LEARNED.md`: 8261 source tokens to 1707 packed tokens, 4.84x.
- Smaller active/current sources did not meet the same threshold.
- Treat CLC as verified for archived/completed context packaging, not as a blanket guarantee for active chat.

Semantic cache:

- Exact cache works.
- Vector entries remain 0 on the cockpit because cockpit-side Ollama is not installed/listening.

## AI Box / Ethereal Status

Cockpit:

- Adapter: `Ethereal-Link`
- IP: `10.0.99.2`
- MTU: 9000
- Link speed: 1 Gbps
- Route to `10.0.99.0/24` exists on the Ethereal adapter.

AI Box:

- Direct IP: `10.0.99.1`
- Direct ping succeeds over `Ethereal-Link`.
- Network doctor status: `AI_BOX_PRIORITY_ROUTE_VERIFIED`.
- Direct app ports verified: `8097`, `8098`, `8099`.
- Ethereal socket daemon on `9999` verified.
- Authenticated 64 MiB socket PUT/GET checksum matched.
- AI Box Docker services are up for Open WebUI, n8n, wiki, Qdrant, Postgres, and Redis.

Measured direct-link throughput:

- AI Box to cockpit TCP stream: about 956 Mbps over 256 MiB.
- Cockpit to AI Box TCP stream: about 858 Mbps over 256 MiB.
- Authenticated Ethereal socket PUT: about 643 Mbps over 64 MiB.
- Authenticated Ethereal socket GET: about 863 Mbps over 64 MiB.

## Runtime Install State

Bun is installed on both systems:

- Cockpit Bun: `C:\Users\a\.bun\bin\bun.exe`, version `1.3.14`.
- AI Box Bun: `C:\Users\Atom\.bun\bin\bun.exe`, version `1.3.14`.
- Bun SQLite smoke passed locally and remotely.

The current PowerShell session may not have Bun on `PATH` until a new shell is opened, but the executable path is available.

llama.cpp is installed on the command N150:

- Version: `9360 (6b4e4bd58)`.
- Install path: `C:\AtomEons\tools\llama.cpp\b9360`.
- Wrapper bin: `C:\AtomEons\tools\bin`.
- Local listener: `http://127.0.0.1:8080`.
- Health: `/health` returns `{"status":"ok"}`.
- Model alias: `orangebox-n150-cpu-listener`.
- Backing model: `ggml-org/gemma-3-270m-it-GGUF:Q8_0`.
- Install receipt: `C:\AtomEons\orangebox\receipts\orangebox-llama-cpp-install-20260527T114255.json`.

The latest inference acceleration doctor is now hardware-aware. Because the current N150 has no NVIDIA GPU, it marks GPU-only vLLM/SGLang/speculative lanes as deferred instead of blockers, while requiring the CPU listener and the verified AI Box model rail.

## Bun Control Plane Slice

The first Bun TypeScript control-plane slice is now present under `C:\AtomEons\orangebox\control-plane`.

Files:

- `C:\AtomEons\orangebox\control-plane\engine.ts`
- `C:\AtomEons\orangebox\control-plane\adapters.ts`
- `C:\AtomEons\orangebox\control-plane\context-packer.ts`
- `C:\AtomEons\orangebox\control-plane\model-policy.ts`
- `C:\AtomEons\orangebox\control-plane\doctor.ts`
- `C:\AtomEons\orangebox\control-plane\adapter-doctor.ts`
- `C:\AtomEons\orangebox\control-plane\control-plane-smoke.ts`
- `C:\AtomEons\orangebox\control-plane\control-plane-real-adapter-smoke.ts`
- `C:\AtomEons\orangebox\control-plane\topology.ts`
- `C:\AtomEons\orangebox\control-plane\topology-doctor.ts`
- `C:\AtomEons\orangebox\control-plane\run-bun.mjs`
- `C:\AtomEons\orangebox\control-plane\MANIFEST.example.json`
- `C:\AtomEons\orangebox\control-plane\README.md`
- `C:\AtomEons\orangebox\control-plane\context\SidebarProps.ts`
- `C:\AtomEons\orangebox\control-plane\context\oled_tokens.json`
- `C:\AtomEons\orangebox\docs\AtomEons_Manifest_Runtime_Manual_v0.2_Implementation_Spec.md`

Current boundary:

- Mock-bound by default.
- Provider adapter contract and no-token adapter doctor are present.
- v0.4 adds three narrow real adapters: local llama.cpp listener proof, AI Box triad read-only proof, and AI Box allowlisted read-only command proof.
- Local llama.cpp generation smoke proves the N150 listener returns completion text and token accounting from `http://127.0.0.1:8080/v1/completions`.
- SQLite receipt DB is real.
- Default DB path is under the ORANGEBOX data root, not the source folder.
- DAG dependency readiness is real.
- Cyclic DAGs are rejected before execution.
- Explicit context packing is real and root-escape guarded.
- Context chunks and whole packs are SHA-256 hashed.
- Completed legacy receipt rows can backfill context hash and route policy without re-dispatching work.
- Retry counters are real.
- Idempotent rerun skip is real.
- Deadlock escalation state is real.
- Route policy records the current lane, fallback chain, and larger-model escalation advisor.
- Real Claude/Codex/AGY/Qwen/Bonsai work adapters are intentionally not wired yet.

Verified smoke:

- Bun SQLite receipt DB created.
- Three-step DAG completed.
- Context hash recorded.
- Route policy recorded.
- Validation failure recovered on attempt 2.
- Second run dispatched 0 steps from the same receipt DB.
- Deadlock fixture escalated after retry cap instead of looping.
- Adapter doctor is no-token and has a disabled real-execution guard.
- Real node execution is still pre-wire disabled.
- Real adapter smoke with mock mode off completed a three-step no-write DAG:
  - `llama-cpp-local` proved `http://127.0.0.1:8080`.
  - `ai-box-ollama-probe` proved the AI Box Ollama inventory through the sidecar triad route.
  - `ai-box-command-proof` proved a fixed read-only AI Box command through the sidecar command path and Checkmate light receipt.
  - Paid API calls: none.
  - N150 model generation: none.
- Local llama generation smoke separately proved one tiny CPU completion:
  - model alias: `orangebox-n150-cpu-listener`
  - endpoint: `http://127.0.0.1:8080`
  - completion request: 8 output tokens
  - measured generation: about 8 tokens/sec on the N150 CPU listener in the latest combined run

Control-plane v0.2 doctor:

- Manifest loads and DAG is acyclic.
- Unknown output schemas are blocked.
- Explicit context packs only the requested refs.
- Context root escapes are rejected.
- Cycle fixture is rejected before execution.
- Model route policy records escalation lanes.
- Adapter doctor remains no-token and guarded.

Adapter doctor:

- Mock deterministic adapter is ready.
- AI Box allowlisted command contract is ready.
- Claude Code subscription CLI is detected and planned.
- Codex subscription CLI is detected and planned.
- AI Box command rail is reachable and planned.
- AGY / Antigravity / Gemini CLI is missing on the cockpit PATH.
- Real node bindings remain disabled until validators, worktree isolation, and write gates are installed.

Run:

```powershell
npm.cmd run control:smoke
```

The package scripts resolve the user-local Bun executable through `control-plane\run-bun.mjs`, so they work even when the current shell was open before Bun was installed:

```powershell
npm.cmd run control:smoke
npm.cmd run control:adapters
npm.cmd run control:topology
npm.cmd run control:real-smoke
npm.cmd run control:big
npm.cmd run control:run
npm.cmd run control:doctor
```

## Current Green Evidence

Final green board:

- 15 checks, 15 passed, 0 failed, 0 warnings.
- 1 advisory: Ethereal link speed is 1 Gbps and should be upgraded only if 2.5 Gbps+ is required.

Feature reality:

- 16 features checked.
- 14 pass, 2 watch, 0 fail.
- Watch items are Ethereal physical link quality and release/staging cleanliness.

Process hygiene:

- 1 command launcher and 1 command server are running, which is the expected hidden PowerShell launcher plus child Node server shape.
- 0 stale processes.
- 0 warnings.

Visual proof:

- AE See-Suite visual proof passed 7/7.
- AE Operations visual proof passed 5/5.
- Screenshots were generated under `C:\AtomEons\orangebox\proof`.

## Next Architecture Intake

The proposed next system should be a subscription-native deterministic control plane:

- Default: signed-in subscription tools.
- Fallback: local models.
- Last resort: metered APIs only by explicit operator choice.

The Bun TypeScript engine is now started as an isolated, mock-bound implementation track:

- Bun owns routing, state, retries, rollback, validation, and receipts.
- SQLite is the durable receipt/idempotency layer.
- LLMs are non-deterministic workers, not project managers.
- Each task receives explicit zero-bleed context.
- Local workers claim ready DAG tasks from a queue.
- Opus, Gemini/AGY, Codex, Qwen, and Bonsai become advisor or execution lanes behind deterministic state.

## XDK Alpha Lane

The operator supplied the X Developer Community XDK announcement lead plus ClaudeDevs reliability screenshots. The source note is:

- `C:\AtomEons\orangebox\docs\ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md`

Accepted but not installed:

- X official docs confirm Python and TypeScript XDKs for the X API v2.
- TypeScript XDK is the preferred future ORANGEBOX integration surface because the control plane is TypeScript/Bun.
- Python XDK stays a research/data-script lane.
- X `llms.txt` is the preferred docs entry point for future X API coding tasks.
- XMCP is real but remains behind the ORANGEBOX MCP verifier, read-only first.

Boundary:

- no production X API calls
- no X API credential reads
- no XDK package installation
- no XMCP host registration
- no visual work

Proof command:

```powershell
npm.cmd run alpha:sources
```

## Claude Code Reliability Alpha

The screenshots and Anthropic changelog themes are now treated as operator-policy inputs:

- Keep auto-compaction enabled where possible.
- Use `/context` to find large context consumers.
- Disable unused MCP servers before subagents or long-running sessions.
- Cap noisy MCP output and route large binary/media artifacts to files instead of chat context.
- Treat streamed thinking/tool-call visibility as a responsiveness signal, not a receipt substitute.
- Add a future deterministic validator for tool-use/tool-result pairing before handoff.
