# ORANGEBOX Process Book

Date: 2026-05-27

This book is the documentarian trail for the current ORANGEBOX recovery and upgrade path. It records what was actually proven, what was changed, and what remains only a future benchmark target.

## Chapter 1 - Current Hardware Truth

The working topology is two devices, not three:

- `command-n150`: this controller machine, no NVIDIA GPU detected.
- `codexa-ai-box`: remote AI Box on the direct/Ethernet rail, with Ollama and large local models.

This means "full green" cannot require local CUDA, vLLM, or SGLang on the N150. Those remain upgrade profiles for future GPU-capable hardware. The current green gate is:

- CPU-safe local listener on the N150.
- Verified AI Box rail over direct/Ethernet.
- Verified AI Box Ollama model inventory.
- Receipt-backed doctors with no blockers.

## Chapter 2 - Listening Layer

`llama.cpp` CPU build is installed on the command N150:

- Release: `ggml-org/llama.cpp` `b9360`
- Install path: `C:\AtomEons\tools\llama.cpp\b9360`
- Wrapper bin: `C:\AtomEons\tools\bin`
- Server wrapper: `C:\AtomEons\tools\bin\llama-server.cmd`
- CLI wrapper: `C:\AtomEons\tools\bin\llama-cli.cmd`
- Listener launcher: `C:\AtomEons\tools\bin\orangebox-llama-listener.ps1`
- Stop script: `C:\AtomEons\tools\bin\orangebox-llama-stop.ps1`

The local listener is live:

- URL: `http://127.0.0.1:8080`
- Health: `/health` returns `{"status":"ok"}`
- Model alias: `orangebox-n150-cpu-listener`
- Backing model: `ggml-org/gemma-3-270m-it-GGUF:Q8_0`
- Mode: CPU-safe, no GPU required

This listener is for controller-side smoke, local tool compatibility, and a guaranteed OpenAI-compatible endpoint. It is not the heavy reasoning lane.

## Chapter 3 - Heavy Model Lane

The AI Box model lane is verified through the triad probe. Current proved inventory includes:

- `deepseek-r1:70b-llama-distill-q4_K_M`
- `command-r:35b-08-2024-q8_0`
- `qwen2.5-coder:32b-instruct-q8_0`
- `llama3.3:70b-instruct-q4_0`
- `qwen2.5-coder:7b`
- `ae-orangebox-local:latest`

The direct AI Box route is verified at:

- Direct IP: `10.0.99.1`
- Ethernet/Wi-Fi LAN IP: `10.0.0.4`
- Command rail health: `8097`
- Party-line/wiki rail health: `8098`

Port `8099` is reachable as a service port in earlier network checks, but `/health` currently returns `404`; do not claim that specific health route green until its endpoint contract is defined.

## Chapter 4 - Acceleration Policy

The JarvisLabs alpha sweep remains accepted as the future acceleration direction:

- vLLM for accelerated serving baselines.
- SGLang for repeated-prefix/RadixAttention agent workloads.
- llama.cpp MTP and speculative decoding for benchmark-capable local model profiles.

But the N150 has no GPU. The current doctor therefore treats vLLM/SGLang/speculative GPU lanes as deferred, not blockers. This is deliberate. The green condition follows the real machine instead of pretending the machine has CUDA.

## Chapter 5 - Evidence Receipts

Latest receipts for this chapter:

- `C:\AtomEons\orangebox\receipts\orangebox-llama-cpp-install-20260527T114255.json`
- `C:\AtomEons\orangebox\receipts\orangebox-inference-acceleration-doctor-20260527T114209.json`
- `C:\AtomEons\orangebox\receipts\orangebox-inference-acceleration-doctor-20260527T114357.json`
- `C:\AtomEons\orangebox\receipts\orangebox-final-green-board-20260527T115503.json`
- `C:\AtomEons\orangebox\receipts\orangebox-process-doctor-20260527T115519.json`
- `C:\AtomEons\orangebox\receipts\orangebox-jarvislabs-blog-sweep-20260527T112258.json`
- `C:\AtomEons\orangebox\receipts\orangebox-alpha-bookmark-intake-20260527T112258.json`

The latest inference doctor result is:

```text
TWO_DEVICE_ADAPTIVE_LANE_GREEN
blockers: 0
llama.cpp installed: true
llama.cpp listener reachable: true
AI Box rail reachable: true
AI Box Ollama proven: true
GPU acceleration deferred: true
```

The final green board after the llama install is:

```text
checks: 15
passed: 15
failed: 0
warnings: 0
advisory: Ethereal adapter link speed is 1 Gbps
receipt: C:\AtomEons\orangebox\receipts\orangebox-final-green-board-20260527T115503.json
```

## Chapter 6 - Operating Commands

Start or confirm the local listener:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\AtomEons\tools\bin\orangebox-llama-listener.ps1
```

Stop it:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\AtomEons\tools\bin\orangebox-llama-stop.ps1
```

Run the adaptive inference doctor:

```powershell
npm.cmd run inference:doctor
```

Probe the local listener:

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health
Invoke-RestMethod http://127.0.0.1:8080/v1/models
```

## Chapter 7 - Next Book Entry

The next entry should cover the Bun control plane becoming the router of record:

- manifest DAG execution
- zero-bleed context packets
- SQLite receipt state
- subscription-first provider adapters
- local/remote model lane selection
- escalation to larger models only when deterministic gates fail

No future chapter should mark a new LLM acceleration path green without receipts for hardware, endpoint, launch flags, model inventory, and rollback.

## Chapter 8 - Control Plane v0.3 Real Adapter Gate

The big-build slice added the first real control-plane adapters without opening arbitrary execution:

- `local-llama-cpp-listener`: proves the N150 listener through `/health` and `/v1/models`.
- `ai-box-triad-readonly`: proves the AI Box model lane through the local ORANGEBOX sidecar triad route.
- `local_endpoint` lane: route policy now distinguishes endpoint proof from generic local-fast worker routing.

The real adapter smoke ran with mock mode off and completed a two-step DAG:

```text
step_1 -> llama-cpp-local -> TerminalTrace
step_2 -> ai-box-ollama-probe -> TerminalTrace
completed: 2
failed: 0
escalated: 0
repository mutation: false
paid API calls: false
N150 model generation: false
```

Receipts:

- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T133504.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T133431.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T133540.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T133604.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T133604.json`

Latest combined `control:big` receipts:

- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T133719.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T133727.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T133731.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T133739.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T133747.json`

## Chapter 9 - Control Plane v0.4 AI Box Command Contract

After the visual work was explicitly paused, the build continued on the non-visual LLM/control-plane path.

v0.4 adds `ai-box-allowlisted-command`, a fixed read-only command contract that routes through the local ORANGEBOX sidecar `/api/codexa/command` path. The manifest cannot provide arbitrary shell. The adapter chooses one of the built-in read-only contracts and requires Checkmate light evidence.

v0.4 also adds a local llama.cpp generation smoke. It sends one tiny CPU completion request to `http://127.0.0.1:8080/v1/completions` and accepts the endpoint as green only when completion text and token accounting return.

The real adapter smoke now completes a three-step DAG:

```text
step_1 -> llama-cpp-local -> TerminalTrace
step_2 -> ai-box-ollama-probe -> TerminalTrace
step_3 -> ai-box-command-proof -> TerminalTrace
completed: 3
failed: 0
escalated: 0
repository mutation: false
paid API calls: false
N150 model generation: false
arbitrary manifest shell: false
```

Latest v0.4 receipts:

- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T140545.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T140543.json`
- `C:\AtomEons\orangebox\receipts\orangebox-local-llama-generation-smoke-20260527T140925.json`

Latest combined non-visual control-plane proof:

- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T140957.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T141002.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T141005.json`
- `C:\AtomEons\orangebox\receipts\orangebox-local-llama-generation-smoke-20260527T141011.json`
- `C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T141016.json`
- `C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T141022.json`

## Chapter 10 - Alpha Source Intake: XDK and Claude Code Reliability

The operator supplied a live Alpha lead for X's Python and TypeScript XDKs plus ClaudeDevs screenshots covering Claude Code compaction, MCP reliability, self-healing sessions, full-screen renderer, streamed thinking/tool calls, and clearer tool-result mismatch errors.

The X forum page itself was treated as an operator-supplied lead because automated fetch was blocked. The substance was verified against X official docs and repositories:

- `https://docs.x.com/tools-and-libraries`
- `https://docs.x.com/xdks/typescript/overview`
- `https://docs.x.com/xdks/python/overview`
- `https://docs.x.com/tools/llms-txt`
- `https://github.com/xdevplatform/xdk-typescript`
- `https://github.com/xdevplatform/xdk-python`
- `https://github.com/xdevplatform/xmcp`

Decision:

- Accept TypeScript XDK as the future preferred ORANGEBOX X API integration lane.
- Hold package installation until a playground-backed smoke and credential policy exist.
- Keep XMCP behind the ORANGEBOX MCP verifier, read-only first.
- Treat Claude Code reliability improvements as operator workflow improvements, not a replacement for ORANGEBOX receipts.

Safety boundary:

- no production X API calls
- no X credentials read
- no XDK install
- no XMCP host registration
- no visual work

Proof command:

```powershell
npm.cmd run alpha:sources
```

## Chapter 11 - Innovation Synthesis Queue

The Alpha and research corpus was consolidated into a repeatable innovation queue. This pass stayed non-visual and did not install XDKs, read credentials, register XMCP, call paid APIs, mutate MCP host config, or touch the live visual system.

Added:

- `C:\AtomEons\orangebox\docs\ORANGEBOX_INNOVATION_QUEUE_2026-05-27.md`
- `C:\AtomEons\orangebox\scripts\v4\innovation-synthesis-doctor.mjs`
- package script: `innovation:synthesis`

The synthesis reads 19 source documents, including:

- Alpha bookmark review
- XDK / Claude Code reliability intake
- JarvisLabs LLM upgrade sweep
- Manifest runtime manual
- Anthropic Alpha docs
- V6 trending integration plan
- Department LLM architecture
- AELang and resiliency docs
- ORANGEBOX memory and knowledge docs

Latest result:

```text
source docs read: 19
innovation candidates: 12
P0 candidates: 7
P1 candidates: 5
failures: 0
queue: C:\Users\a\OrangeBox-Data\innovation\latest-innovation-queue.json
receipt: C:\AtomEons\orangebox\receipts\orangebox-innovation-synthesis-20260527T154105.json
```

Top build order:

1. Delta Context Ledger
2. Four-Tier Memory Governor
3. Claude/Codex Session Health Governor
4. Department Router Dry Run
5. MCP Quarantine Gateway
6. Agent Bench Arena

Boundary:

- visual organism ideas remain held while visual work is paused
- X API/XDK work remains mock/playground-only until credential policy exists
- XMCP remains held until the MCP quarantine gate exists
- vLLM/SGLang remain future GPU/AI Box profiles, not N150 blockers

## Chapter 12 - Ten-Lane Activation and CLC

The ten planned non-visual innovation lanes have first runnable local implementations behind proof gates:

- Delta Context Ledger
- Four-Tier Memory Governor
- Claude/Codex Session Health Governor
- Department Router Dry Run
- MCP Quarantine Gateway
- Agent Bench Arena
- Hardware-Aware Inference Matrix
- X Alpha Feed Typed Lane
- Receipt Intelligence Miner
- AELang Resilience Kernel

Added:

- `C:\AtomEons\orangebox\scripts\v4\innovation-activation-doctor.mjs`
- `C:\AtomEons\orangebox\scripts\v4\clc-doctor.mjs`
- `C:\AtomEons\orangebox\docs\CRYSTAL_LATTICE_COMPRESSION_WITH_VOID_MAP_2026-05-27.md`
- `C:\AtomEons\orangebox\docs\ORANGEBOX_TEN_LANE_ACTIVATION_2026-05-27.md`
- package scripts: `innovation:activate`, `clc:doctor`, `machine:test-drive`

Activation proof:

```text
command: npm.cmd run innovation:activate
lanes total: 10
activated: 10
blocked: 0
receipt: C:\AtomEons\orangebox\receipts\orangebox-innovation-activation-20260527T161607.json
```

CLC proof:

```text
command: npm.cmd run clc:doctor
gates: 8
passed: 8
source docs read: 5
observed local compression: 2.866x
receipt: C:\AtomEons\orangebox\receipts\orangebox-clc-doctor-20260527T161609.json
```

CLC boundary:

- Canonical name is Crystal Lattice Compression with Void Map.
- Identifier is `ATOM-CLC-2026-0331`.
- Operator-supplied disclosure hash is recorded.
- The local doctor computes fresh SHA-256 over generated local CLC objects.
- The local doctor does not claim to reproduce the operator-supplied 282x benchmark on this smaller local input.

Machine test-drive command:

```powershell
npm.cmd run machine:test-drive
```

This command runs:

1. `innovation:activate`
2. `clc:doctor`
3. `control:big`
4. `inference:doctor`

Latest full machine test-drive:

```text
command: npm.cmd run machine:test-drive
status: passed
activation: C:\AtomEons\orangebox\receipts\orangebox-innovation-activation-20260527T161607.json
clc: C:\AtomEons\orangebox\receipts\orangebox-clc-doctor-20260527T161609.json
topology: C:\AtomEons\orangebox\receipts\orangebox-control-plane-topology-doctor-20260527T161612.json
adapter doctor: C:\AtomEons\orangebox\receipts\orangebox-control-plane-adapter-doctor-20260527T161618.json
real adapter smoke: C:\AtomEons\orangebox\receipts\orangebox-control-plane-real-adapter-smoke-20260527T161620.json
local llama generation: C:\AtomEons\orangebox\receipts\orangebox-local-llama-generation-smoke-20260527T161622.json
control doctor: C:\AtomEons\orangebox\receipts\orangebox-control-plane-doctor-20260527T161625.json
control smoke: C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T161631.json
inference doctor: C:\AtomEons\orangebox\receipts\orangebox-inference-acceleration-doctor-20260527T161645.json
```

Safety boundary:

- no visual work
- no X credentials
- no XDK install
- no XMCP registration
- no MCP host mutation
- no paid API calls
- no arbitrary AI Box shell

## Chapter 13 - Temporal Sync And GlyphSpeak Bridge

Operator correction:

```text
CLC doesnt work yet. but we will get it to as we get smarter. also glyphspeak?
```

I accepted that correction. CLC remains research/not-production in the receipts. The active production-adjacent primitive is now temporal context folding from `Project_Orangebox_Temporal_Sync_SOP_v2.pdf`.

Source PDF:

```text
C:\Users\a\Downloads\Project_Orangebox_Temporal_Sync_SOP_v2.pdf
SHA-256: 215853ADD26A8C6246B3A58104177D890E03773F8ED69C535EA6730B980E51F6
```

Added:

- `C:\AtomEons\orangebox\scripts\v4\temporal-sync-doctor.mjs`
- `C:\AtomEons\orangebox\scripts\v4\glyphspeak-doctor.mjs`
- `C:\AtomEons\orangebox\docs\PROJECT_ORANGEBOX_TEMPORAL_SYNC_SOP_V2.md`
- `C:\AtomEons\orangebox\docs\GLYPHSPEAK_CONTEXT_FOLDING_BRIDGE_2026-05-27.md`
- package scripts: `temporal:doctor`, `glyphspeak:doctor`

Temporal sync proof:

```text
command: npm.cmd run temporal:doctor
gates: 8/8 passed
state: C:\Users\a\OrangeBox-Data\temporal-sync\current_state.json
observed local receipt-tail fold: 98.34%
receipt: C:\AtomEons\orangebox\receipts\orangebox-temporal-sync-doctor-20260527T164252.json
```

GlyphSpeak bridge proof:

```text
command: npm.cmd run glyphspeak:doctor
gates: 6/6 passed
packet: C:\Users\a\OrangeBox-Data\glyphspeak\latest-glyph-packet.json
packet/state ratio: 0.1073
receipt: C:\AtomEons\orangebox\receipts\orangebox-glyphspeak-doctor-20260527T164253.json
```

Latest non-visual machine test-drive now includes:

1. `innovation:activate`
2. `clc:doctor`
3. `temporal:doctor`
4. `glyphspeak:doctor`
5. `control:big`
6. `inference:doctor`

Latest receipts:

```text
activation: C:\AtomEons\orangebox\receipts\orangebox-innovation-activation-20260527T164247.json
clc: C:\AtomEons\orangebox\receipts\orangebox-clc-doctor-20260527T164250.json
temporal: C:\AtomEons\orangebox\receipts\orangebox-temporal-sync-doctor-20260527T164252.json
glyphspeak: C:\AtomEons\orangebox\receipts\orangebox-glyphspeak-doctor-20260527T164253.json
control smoke: C:\AtomEons\orangebox\receipts\orangebox-bun-control-plane-smoke-20260527T164342.json
inference: C:\AtomEons\orangebox\receipts\orangebox-inference-acceleration-doctor-20260527T164346.json
```

Boundary:

- Temporal folding is active as a local state primitive.
- GlyphSpeak is a deterministic bridge packet, not model-native yet.
- CLC is scaffolding/research, not production memory.
- Visual remains paused.

## Chapter 14 - Four-System Working Path

User directive:

```text
get all four figured out and working for real
```

Interpretation:

The four are CLC, Temporal Sync, GlyphSpeak, and the control/inference lane. They are now wired through one local proof path instead of separate demos.

Added:

- `C:\AtomEons\orangebox\scripts\v4\four-system-doctor.mjs`
- `C:\AtomEons\orangebox\docs\ORANGEBOX_FOUR_SYSTEM_INTEGRATION_2026-05-27.md`
- package script: `four:doctor`
- `machine:test-drive` now includes `four:doctor`

Latest integrated proof:

```text
command: npm.cmd run four:doctor
gates: 11/11 passed
round-trip fixtures: 5/5 passed
raw-to-temporal reduction: 97.88%
temporal-to-glyph reduction: 89.19%
drift risk: low
failpattern blocking: false
bundle: C:\Users\a\OrangeBox-Data\four-system\latest-four-system-bundle.json
receipt: C:\AtomEons\orangebox\receipts\orangebox-four-system-doctor-20260527T165346.json
```

Maturity language:

- CLC is now `WORKING_V0_RESEARCH_NOT_PRODUCTION`.
- Temporal Sync is the working current-state fold.
- GlyphSpeak is the working deterministic bridge packet.
- Control/inference is the working local/two-device readiness gate.

Still not claimed:

- production CLC memory
- model-native GlyphSpeak
- paid/frontier escalation execution
- GPU acceleration on the N150

## Chapter 15 - Orangebox Ops System Proof

User directive:

```text
add these 3 to do unless you prove why not 10 original feature adds . all now
```

Decision:

All three new directives are accepted and folded into the original ten-feature practical build queue. AECode Source is not treated as a forced visual redesign. It becomes the governance/source layer over the current visual output.

Added:

- `C:\AtomEons\orangebox\scripts\v4\aecode-runtime.mjs`
- `C:\AtomEons\orangebox\scripts\v4\gauntlet-engine.mjs`
- `C:\AtomEons\orangebox\scripts\v4\orangebox-system-proof-doctor.mjs`
- `C:\AtomEons\orangebox\docs\ORANGEBOX_SYSTEM_PROOF_QUEUE_2026-05-27.md`
- `C:\AtomEons\orangebox\.missions\orangebox-main-system-v0\mission.yaml`
- package scripts: `ae`, `gauntlet:*`, `system:doctor`, `system:proof`, `system:full-green`, `aecode:*`

The ten accepted adds are:

1. Mission Manifest v0.
2. Worktree Sandbox Law.
3. Governed Inference Main Nerve.
4. Gauntlet Engine v0.
5. ReceiptChain / Provenance v0.
6. Deploy Repair Rail.
7. Screenshot QA Gate.
8. App Factory v0.
9. One Operator Surface Contract v0.
10. AECode Source IR v0.

Runtime commands now exist for:

- `ae mission validate <mission_id>`
- `ae mission run <mission_id>`
- `ae mission write <mission_id> --operator-approved --patch <patch.diff>`
- `ae mission generate-artifact <mission_id> [--provider local-deterministic-cpu]`
- `ae mission artifact <mission_id> --operator-approved --artifact <artifact.json>`
- `ae mission sandbox <mission_id>`
- `ae schema validate`
- `ae system proof <mission_id>`
- `ae source compile <mission_id>`
- `ae deploy full <mission_id> --execute`
- `ae deploy intake`
- `ae visual qa <mission_id>`
- `ae operator status`
- `ae create webapp|landing-page|dashboard|admin-panel|ai-tool`

Operator correction:

The original ten upgrades are the phase-one finish line. The three AECode system ideas run after them, not instead of them.

Added phase-one finish proof:

- `C:\AtomEons\orangebox\scripts\v4\ten-upgrade-finish-doctor.mjs`
- package script: `ten:finish`
- status registry: `C:\Users\a\OrangeBox-Data\ten-upgrades\latest-ten-upgrade-status.json`

Machine test-drive order is now:

```text
innovation:activate
ten:finish
control:big
inference:doctor
four:doctor
system:doctor
aecode:schemas
aecode:compile
aecode:mission-run
aecode:artifact-generate
aecode:operator
system:proof
```

`aecode:deploy-full` stays a separate top-level proof command. It intentionally runs mission acceptance tests, so embedding it inside `machine:test-drive` would recurse back into the machine test-drive.
`system:proof` is the capstone receipt check after full deploy. It does not mutate the repo.

AECode full local deploy now aggregates:

- mission validation
- deterministic AECode Source compile
- worktree sandbox create/reuse
- model-authored patch application inside approved worktree only
- local llama listener or deterministic fallback provider artifact generation from mission/source
- schema-valid provider artifact application inside approved worktree only
- governed mission execution with deterministic acceptance checks
- visual QA gate without visual mutation
- deploy failure intake/preflight
- app factory preset contracts
- release gauntlet
- operator status feed
- one full-local-deploy receipt

Model-write lane:

- operator approval is required
- patches are model-authored but Orangebox-applied
- writes are confined to `.worktrees/<mission_id>`
- changed paths must pass mission allowed/forbidden scope
- `git apply --check` must pass before file mutation
- receipts record patch hash, changed paths, worktree status, diff stats, and rollback

Provider artifact lane:

- `aecode:artifact-generate` creates a schema-valid provider artifact from mission and source hashes
- it uses the local llama listener when available and records listener health, timing, text hash, and fallback state
- provider artifacts must declare `ae.provider_artifact.v0`
- `file_patch` artifacts write only under `.worktrees/<mission_id>`
- `unified_diff` artifacts delegate to the existing model-write gate
- receipts record artifact hash, schema result, changed paths, write hashes, and rollback
- the main working tree remains protected

Deploy evidence:

Gmail notifications show repeated `AtomEons/atomeons-com` `Deploy production to Vercel` failures. Sampled commits include `1915378`, `77ec5ea`, `5c8ba07`, `b8c1dde`, and `6ea8b23`. The emails do not include the root-cause action logs, and `C:\AtomEons\atomeons-com` is not present locally, so the deploy repair rail is in intake mode until logs or the repo are available.

Boundary:

- Visual mutation remains paused.
- AECode does not require visual redesign.
- No production deploy was attempted.
- No paid API or frontier model call was attempted.
- No destructive rollback was automated.
