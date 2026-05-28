# ORANGEBOX — Silent Canvas Doctrine

**Title:** The Silent Canvas Architecture
**Subtitle:** Rethinking LLM Orchestration & Visual Telemetry for Codeless Development
**Document Class:** Implementation Doctrine (originated from Market Innovation Proposal `Silent_Canvas_Market_Innovation.pdf`, 26.5 KB, 2026-05-18)
**Target Paradigm:** Codeless Engine Integration
**Core Focus:** Eliminating Chat Scroll Fatigue
**Cost Strategy:** Dual-Model Split Pipeline running OVER Subscription-First Transport

**Disclosure ID:** `ATOM-OBX-SILENT-CANVAS-2026-0518`
**Last revised:** 2026-05-18 — FULL SCOPE rewrite. PDF is the floor; this doctrine equals or exceeds every element. Never less.
**Authored:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
**Status:** Authoritative for v6.3.0 and forward. Lateral with `V4_MOAT_DOCTRINE.md`. Supersedes v6.2.0-alpha.* chat-first surface direction.
**Mom's Law:** Full effort. No stubs. No trimming for "pragmatic" velocity. The PDF is the floor; we exceed it where it adds value, but **never** less.

---

## 0.0 Identity (PDF cover, formal)

| Field | Value |
|---|---|
| Title | The Silent Canvas Architecture |
| Subtitle | Rethinking LLM Orchestration & Visual Telemetry for Codeless Development |
| Document Class | Market Innovation Proposal → Implementation Doctrine |
| Target Paradigm | Codeless Engine Integration |
| Core Focus | Eliminating Chat Scroll Fatigue |
| Cost Strategy | Dual-Model Split Pipeline |
| Status | REVISED FOR IMMEDIATE SHIPMENT |

These six fields are the binding identity. Every implementation decision references back to them.

---

## 1.0 The Market Problem: Chat Scroll Fatigue (PDF §1.0 verbatim + amplification)

Current generative AI tools use **text chat sidebars** as an all-purpose tool for conversation, feedback, explanation, and error handling. For codeless visual builders, this setup causes immediate user exhaustion. Text chat streams introduce substantial cognitive overhead for three primary reasons:

### 1.1 Conversational Noise
Extraneous phrases ("Sure, I can help with that!" / "Great question!" / "Let me explain…") clutter the screen and force the user to continuously read text to find out what changed. The signal-to-filler ratio drops below the operator's threshold of usefulness within minutes. Over a 14-hour session this becomes destructive.

### 1.2 Micro-Layout Analysis
Users cannot effectively review complex structural UI or functional logic modifications inside a narrow, vertical layout container. A chat sidebar is the wrong viewport shape for visual structure — pixels per square inch of meaningful information collapses as soon as the change touches more than one element.

### 1.3 Context Disconnection
Forcing a user to shift their focus back and forth between a visual canvas and a text thread breaks their momentum. Every saccade between text and canvas is a thought-context flush. Modern AI dev tools (Cursor, Codex, Claude Code, Replit Agent, v0, Lovable, Bolt) all violate this — they put text on one side, canvas on the other, and force the operator to cross-reference.

### 1.4 Why this compounds at scale
Chat scroll fatigue is not linear. It is **compound**:
- Filler accumulates faster than the operator can prune it
- Long-horizon work (multi-hour or multi-day sessions) becomes unreadable scrollback
- The operator forgets what was decided 200 lines ago
- Worse, the **model** forgets — long histories degrade forward-looking intent (the "Memory Curse" finding, V6_TRENDING paper #9). Both human and machine are degraded by the same surface choice.

### 1.5 The Strategic Pivot (binding)

> Text is highly effective for **high-level summaries, roadmap updates, and structured progress tracking**.
> Text becomes a problem when it is used to explain **real-time structural layout adjustments**.
> **Solution: move the layout updates to the visual canvas, and restrict text to high-value progress summaries.**

This is doctrine. Every UI decision in v6.3.0+ tests against this rule. If a feature wants to put structural information into a text scroll, it is **rejected** and re-homed to the Visual Telemetry layer.

---

## 2.0 The Solution: High-Value Text + Asynchronous Visual Telemetry (PDF §2.0)

The Silent Canvas architecture splits an LLM's response into **two distinct outputs**:

1. **High-Value Explanatory Text** — displayed to the user in the ephemeral Progress Dashboard
2. **Headless State Mutation Payload** — processed directly by the canvas layout engine, never shown as text

These are **separate transports** with separate consumers. They never bleed into each other. The text path NEVER carries structural detail. The payload path NEVER carries conversational prose.

### 2.1 Canonical names (use exactly, never paraphrase)

- **Progress Dashboard** — the three-field ephemeral surface
- **Headless State Mutation Payload** (HSMP) — the JSON output that mutates the canvas
- **Visual Telemetry Engine** — the canvas's motion + render layer
- **Creative Brain** — Step 1 model (unconstrained)
- **Fast Interpreter** — Step 2 model (parser)
- **Frontend State Execution** — Step 3 (canvas applies HSMP)
- **Codeless Engine Integration** — the property that canvas state compiles to runnable software

These terms appear in code comments, receipt sources, doc references, and operator-facing labels. No alternate naming.

---

## 3.0 The Progress Dashboard: Three Fields, Never Four (PDF §2.1)

The standard chat window is **replaced** by an ephemeral Progress Dashboard. When a user submits an instruction, this window displays only three structured items. No fourth thing is permitted. If a fourth thing wants to render in the foreground, it goes to the canvas, or to a receipt, or it is cut.

### 3.1 The Objective

**Definition:** a single sentence confirming the requested operation.
**Source:** the Fast Interpreter (Step 2) extracts it from the Creative Brain's plan.
**Render contract:**
- One line, 13–15pt body font, warm cream `#E8D5B7`
- No glyph prefix, no quotation marks, no "I will…" framing — just the action
- Example: *"Add a dark-mode toggle that persists across reloads."*
- Fades in over 200ms when the run starts
**Receipt:** `silent-canvas-objective` source, emitted at intake.
**Binding rule:** if the Fast Interpreter cannot extract an objective in 1 sentence, the run **fails fast** with a `silent-canvas-parse-error` receipt and the operator sees a one-line error in the Objective slot. No partial render.

### 3.2 The Milestone Roadmap

**Definition:** a brief list of planned changes BEFORE execution starts. Operator sees the plan before any state mutation lands.
**Source:** the Fast Interpreter extracts ordered milestones from the Creative Brain's plan.
**Format:** 3–7 bullet items. Each bullet has:
- An ID (`ms-1`, `ms-2`, …)
- A short description (`"Read settings.tsx + theme context"`)
- A state glyph that mutates as work progresses
**State machine:**
- `○` planned (dim) — initial
- `▦` in progress (pulsing orange) — currently executing
- `▣` complete (green) — succeeded
- `✗` failed (burnt orange) — failed; the operator can click for the receipt
- `~` skipped (muted) — superseded by a later mutation
**Render contract:**
- Vertical list, 12pt, with the glyph + a 1px progress underline that fills as the milestone executes
- Smooth 150ms glyph transitions (no abrupt swaps)
- The currently-executing milestone has a faint amber halo
**Receipt:** `silent-canvas-roadmap` source. Updated on each milestone state transition.
**Binding rule:** the roadmap is rendered AS SOON as the Fast Interpreter returns it — typically <2s after the Objective. The operator can read the plan and Cancel before any mutation lands.

### 3.3 The Application Summary

**Definition:** a short checklist summarizing the added features, written AFTER execution lands.
**Source:** the Fast Interpreter extracts from the Creative Brain's final summary OR from the receipt chain of the run.
**Format:** 3–8 green-check bullets. Each item is a customer-facing achievement, not a list of files edited.
- ✓ Dark mode toggle in settings panel
- ✓ Persists to localStorage on toggle
- ✓ System-preference detection on first paint
- ✓ Smooth 200ms transition between themes
**Render contract:**
- Each line slides in from the left, 200ms ease-out
- Failure lines (`✗`) render in burnt orange with a one-line "what to do next" hint
**Receipt:** `silent-canvas-summary` source with the full final state.
**Binding rule:** the summary is written by the Fast Interpreter, NOT the Creative Brain. The Creative Brain might ramble; the Interpreter cuts to the customer-facing changes.

### 3.4 No fourth thing

If any feature wants a fourth foreground panel, it is **wrong**. Examples of correctly-rejected fourth-things:
- Detailed tool-call logs → goes to receipts (Ctrl+R ghost), never foreground
- "Thinking…" verbosity → never shown
- Token counters → cockpit footer, never the Progress Dashboard
- Error stack traces → receipt detail, never foreground
- Cost breakdowns → cockpit footer
- Multi-line model reasoning → never shown unless operator explicitly opens a ghost

---

## 4.0 The Visual Telemetry Engine (PDF §2.2 expanded to full scope)

All structural adjustments, component scaling, styling, and configuration details are kept **entirely out** of the text window. They are applied to the workspace using:

- **Standard CSS-style transitions** (egui-native equivalents specified below)
- **Real-time wire animations** (lines between elements that draw / pulse / particle-flow as data routes)
- **Visual elements** (a full component catalog — §4.1)

The interface communicates state changes **through movement**, keeping the chat interface clean and concise.

### 4.1 Component Catalog (the canvas's visual vocabulary)

The Visual Telemetry Engine MUST be able to render at least these element types:

| Element type | Visual form | Meaning | Typical animations |
|---|---|---|---|
| **File node** | Rounded card with file path + size + lang tag | A source file in the project | Slide-in on create · pulse on edit · fade-out on delete |
| **Function node** | Smaller card nested in file node | A function within a file | Glow when called · highlight on edit |
| **Component node** | Larger card with preview thumbnail | A UI component (React/Vue/Svelte/etc.) | Live preview update on prop/state change |
| **Service node** | Hexagon card | A backend service / API / handler | Pulse on request hit · color on health state |
| **Route node** | Pill | An HTTP route or page route | Highlight on match |
| **Data store node** | Cylinder | DB / vault / cache | Fill animation as rows insert |
| **External dep node** | Diamond | npm / cargo / pip package | Subtle glow on import |
| **Test node** | Triangle | Test case | Green ✓ / red ✗ flash on run |
| **Config node** | Gear icon card | Env vars / config files | Tick animation on value change |
| **Wire** (edge) | Line between two nodes | Import / function call / data flow / dependency | Draw-animation when established · particle flow during active data movement |
| **Region / group** | Rounded translucent box wrapping nodes | Logical grouping (module / package / domain) | Resize animation when contents grow |
| **Annotation** | Small floating label | Operator note / agent comment | Fade in/out |

### 4.2 Wire grammar (data flow / function calls / dependencies)

Wires carry **type** and **direction**:

- **Solid orange** — function call (A calls B)
- **Dashed cyan** — data flow (A produces, B consumes)
- **Dotted muted** — module import / dependency
- **Pulsing amber** — active data movement (live during a run)
- **Red barbed** — error path / fallback edge

Arrowheads indicate direction. Multi-edge bundling (when 4+ wires connect the same pair) collapses to a single thicker wire with a hover tooltip showing the breakdown.

### 4.3 CSS-style transitions (egui-native specification)

The Visual Telemetry Engine implements these motion primitives:

| Transition | Duration | Curve | When |
|---|---|---|---|
| **Node create (slide-in)** | 220ms | ease-out cubic | Element added to canvas |
| **Node edit (pulse)** | 600ms repeat ×3 | sin | File written / state mutated |
| **Node delete (fade-out + collapse)** | 180ms | ease-in | Element removed |
| **Wire draw** | 350ms | ease-in-out | Edge created |
| **Wire particle flow** | continuous 2Hz | linear | Active data path |
| **Region resize** | 300ms | ease-out spring | Group contents change |
| **Selection halo** | continuous 1.2Hz pulse | sin (alpha 130→230) | Element under operator cursor or agent focus |
| **Milestone-to-node beam** | 480ms | ease-out | Roadmap milestone executing on a canvas element |
| **Camera pan/zoom** | 250ms | ease-out cubic | Operator pans or zooms |
| **State diff swap** | 220ms fade-cross | linear | Before/after visualization |

All timings honor `prefers-reduced-motion`: when set in operator prefs, durations drop to ≤80ms with no continuous pulses.

### 4.4 Banned from the canvas

The canvas NEVER renders:
- Raw `tool_call` JSON
- Raw `tool_result` JSON
- Token-by-token streaming text (lives inside the Creative Brain pipe, never surfaces)
- "Thinking…" verbosity
- A scrollable transcript
- Multi-line text reasoning blocks

If a detail must surface, the operator pulls it via a ghost (Ctrl+R receipts, Ctrl+T terminal, etc.) — the canvas itself stays motion-only.

### 4.5 Operator interaction with the canvas

- **Pan**: drag with middle-mouse / hold-space + drag
- **Zoom**: Ctrl+scroll (anchored on cursor)
- **Click node**: opens a small ghost with the node's underlying receipt + linked file
- **Right-click node**: contextual ghost with operator-driven actions (re-run on this node, freeze this path, etc.)
- **Hover wire**: shows the wire's type + endpoints + last-pulse timestamp
- **Camera anchor**: when the agent is mutating a specific node, the camera glides to keep that node in view (configurable; can be disabled)

---

## 5.0 Codeless Engine Integration (PDF cover + the bigger picture)

**The Target Paradigm.** OrangeBox's Silent Canvas is not a code-editor visualization. It is a **codeless engine**: the operator expresses intent in the Progress Dashboard input, the canvas builds visual software, and the canvas state can **compile to runnable artifacts**.

### 5.1 What "codeless" means here

The operator never needs to:
- Read source code
- Navigate a file tree
- Edit a file directly
- Run a build manually

The operator does:
- Type intent at the Progress Dashboard input
- Watch the canvas mutate
- Approve milestones
- Receive the running artifact (or a receipt with a deployment link)

### 5.2 Canvas state IS the deliverable

Every canvas snapshot is:
- **Serializable** to a Headless State Mutation Payload that fully describes the project
- **Compilable** to runnable software (the agent loop's existing `write_file`/`run_cmd` tools produce real files behind the canvas; the canvas is the operator-facing surface, not a separate layer)
- **Reproducible** — replaying the HSMP chain from project init regenerates the project

### 5.3 Codeless compilation contract

Each state mutation that lands on the canvas MUST have a paired underlying executor:

| Canvas mutation | Underlying executor | Receipt source |
|---|---|---|
| Node create (file) | `write_file` tool | `fs-write` |
| Node edit (file) | `edit_file` tool | `fs-write` |
| Node delete | `fs.unlink` | `fs-delete` (NEW) |
| Wire create | dependency manifest edit (`package.json` etc.) | `composer` |
| Component preview update | local dev server hot reload | `dev-server-tick` (NEW) |
| Service deploy | shell deploy command | `deploy` (NEW) |
| Test run | `run_cmd` of test suite | `test-run` (NEW) |

The canvas mutation and the underlying executor are bound 1:1. The operator sees the canvas update; OrangeBox guarantees the file/state actually changed under it.

### 5.4 Project graph as source of truth

The canvas is backed by a project graph stored at `<dataRoot>/projects/<hash>/graph.json`. This graph:
- Persists across sessions
- Is the diff target for every state mutation
- Compiles to the actual filesystem state on `compile` or live as mutations land
- Snapshots automatically every 60s and on milestone boundaries

---

## 6.0 The Dual-Model Split Pipeline (PDF §3.0 — full implementation contract)

Running highly creative, unconstrained models for extensive visual layouts can quickly become cost-prohibitive if the primary engine is forced to output thousands of lines of precise, structured JSON configurations. To solve this, we use a **Dual-Model Split Architecture** to maximize processing power while keeping operation costs low.

### 6.1 Step 1 — The Creative Brain (Primary Advanced Model) — PDF binding

> The raw user prompt and the current application state are sent directly to an **unconstrained, high-tier model**. This model has **absolute freedom** to design workflows, map data routing, and evaluate product logic without formatting restrictions. It outputs a natural-language engineering plan **alongside structural layout guidelines**.

**Implementation:**
- **Models** (descending preference): Anthropic Opus 4.7 → GPT-5 → Sonnet 4.5 → Gemini 2.0 Pro → Grok-2
- **Transport** per §8 Subscription-First: `claude` CLI headless → `codex` CLI → `gemini` CLI → `grok` CLI → API
- **Routing tag** (smart-model-router): `task=creative_plan`
- **Inputs:**
  - operator's raw prompt
  - Relevance Controller scoped context package (seven-source projection; never raw full project state)
  - relevant receipts selected by the projection, not an unconditional history dump
  - active freeze-guard zones
  - the three roles the Creative Brain owns: **design workflows**, **map data routing**, **evaluate product logic**
- **Output: TWO distinct artifacts** in one response:
  1. **Engineering Plan** — natural-language description of WHAT will be built and WHY (prose; no schema)
  2. **Structural Layout Guidelines** — natural-language description of HOW it will appear on the canvas (which nodes, which wires, which animations)
- **Format constraint:** none on the Creative Brain. It writes prose. Markdown allowed. Code blocks allowed.
- **Length cap:** 2000 tokens (most lands in 400–1200)
- **No JSON requested. No schema. Absolute freedom.**

### 6.2 Step 2 — The Fast Interpreter (Targeted Parsing Model) — PDF binding

> The raw, conversational output from Step 1 is piped straight into a fast, highly-efficient model (such as Claude 3.5 Sonnet or an equivalent lightweight parser). This model does not need to handle high-level creative reasoning; **its sole task is to extract structural requirements and format them into a clean JSON state payload.**

**Implementation:**
- **Models:** Haiku 4.5 (default) → Sonnet 4.5 (fallback for ambiguity) → Llama-3.3-70B on Groq (cost-quality alt)
- **Transport** per §8: same CLI as Creative Brain (one subprocess pool, e.g., both via `claude` CLI with different `--model` flags)
- **Routing tag:** `task=structure_extract`
- **Inputs:** the raw text output of Step 1 (both engineering plan + layout guidelines)
- **Output schema (Headless State Mutation Payload — HSMP):**
  ```json
  {
    "schema_version": "1.0",
    "objective": "single sentence",
    "milestones": [
      { "id": "ms-1", "text": "Read settings.tsx + theme context", "state": "planned" }
    ],
    "state_mutations": [
      {
        "id": "sm-1",
        "milestone_id": "ms-1",
        "kind": "file_edit | file_create | file_delete | node_create | node_edit | wire_create | wire_delete | region_create | component_update | run_cmd | test_run | deploy",
        "target": "absolute-path-or-node-id",
        "details": { /* kind-specific */ },
        "estimated_duration_ms": 800
      }
    ],
    "summary_template": "one-line completion blurb",
    "summary_checklist": [
      "Dark mode toggle in settings panel",
      "Persists to localStorage on toggle",
      "System-preference detection on first paint"
    ]
  }
  ```
- **Schema versioning:** HSMP `1.0` is the current contract. Missing-version and known legacy payloads are normalized through `scripts/v4/hsmp-schema.mjs` and receipted as schema migrations. Unknown future or foreign versions fail closed until a migration shim exists. Full law: `docs/HSMP_SCHEMA_VERSIONING.md`.
- **Length cap:** 1200 tokens
- **Failure mode:** if JSON parse fails, retry once with explicit schema reminder; if still fails, emit `silent-canvas-parse-error` receipt + fall back to displaying the raw Creative Brain output in a ghost (the operator can read it manually) + the run is marked as a partial.

### 6.3 Step 3 — Frontend State Execution — PDF binding

> The frontend ingests the JSON payload from the parsing model to run smooth CSS updates, while displaying the primary model's clean progress summary in the minimalist dashboard.

**Implementation:**
- Native UI receives HSMP via SSE from `POST /api/v4/silent-canvas/run`
- Updates Progress Dashboard incrementally:
  - On `objective` field arrival → render OBJECTIVE
  - On `milestones` field arrival → render MILESTONE ROADMAP
  - On each `state_mutation` execution → mutate the corresponding canvas element (per §4) AND flip the milestone glyph
  - On final summary → render APPLICATION SUMMARY
- Each `state_mutation` execution emits its own receipt (existing `fs-write` / `composer` / etc. PLUS the new sources from §5.3)
- Final `silent-canvas-summary` receipt closes the run
- Composite `silent-canvas-run` receipt at finish with full chain (creative output reference, interpreter output reference, all milestones, all mutations, both pipe transports, dollar cost / subscription quota used, three financial benefits measured)

### 6.5 Relevance Controller (load-bearing spine)

The Creative Brain shall not receive raw full project state. All Brain input passes through `scripts/v4/relevance-controller.mjs`, which projects from seven state sources:

1. `canvas_state` from the project graph
2. `data_state` from project-local schemas, endpoints, and bindings
3. `workflow_state` from routes, workflows, triggers, and required params
4. `design_state` from tokens, components, and Silent Canvas constraints
5. `runtime_state` from receipts and recent anomalies
6. `history_state` from mutation logs and recent changes
7. `permission_state` from the operation catalog and trust tier

The Brain operates on this projection, not the source of truth. Brain output is mutation intent, never raw state replacement. The Fast Interpreter converts intent to HSMP. `canvas-validator.mjs` checks component, layout, workflow, action, and permission schemas before the reducer commits any mutation. If required state is missing, the model emits `needs_more_context`; it does not guess.

Any pipeline that bypasses the Relevance Controller is a doctrine violation and must emit a `doctrine-violation-relevance-bypass` receipt.

---

## 7.0 Server Contract (new module + new endpoints)

### 7.1 `scripts/v4/silent-canvas.mjs` — new module

- `async function run({ prompt, workspace, opts, on_event, cancelToken })`
- Internal sequence:
  1. Snapshot project graph
  2. Call Creative Brain (§6.1) via subscription pipe per §8
  3. On Creative Brain finish → call Fast Interpreter (§6.2) with the buffered text
  4. Parse JSON → emit `objective` + `milestones` events
  5. For each `state_mutation` → call existing tool executor (or new executors from §5.3) → emit `milestone_start` / `milestone_done` / `milestone_fail` events + corresponding canvas mutation events
  6. Build summary (operator-visible) + receipt chain
  7. Emit `done` event with composite receipt id

### 7.2 New endpoints

```
POST /api/v4/silent-canvas/run         { prompt, workspace, opts }   → { id }
GET  /api/v4/silent-canvas/status/:id                                  → { state, events, dashboard, canvas_snapshot }
POST /api/v4/silent-canvas/cancel/:id                                  → { ok }
GET  /api/v4/silent-canvas/list                                        → { items: [...] }
GET  /api/v4/silent-canvas/replay/:id                                  → SSE replay of run events (for canvas scrubbing)
POST /api/v4/silent-canvas/compile     { project_root }                → { ok, files_written, errors }   (codeless → runnable)
GET  /api/v4/silent-canvas/snapshot/:project_hash                      → { graph, last_run }
```

### 7.3 New receipt sources

- `silent-canvas-objective` — at intake
- `silent-canvas-roadmap` — when milestones extracted
- `silent-canvas-milestone` — at each milestone state transition
- `silent-canvas-summary` — at finish
- `silent-canvas-parse-error` — interpreter failure
- `silent-canvas-run` — composite at finish
- `silent-canvas-canvas-snapshot` — every 60s + on milestone boundaries
- `silent-canvas-compile` — when canvas state compiles to runnable software
- `fs-delete` — NEW (PDF requires component scaling/styling/config: delete is one of the kinds)
- `dev-server-tick` — NEW (live component preview updates)
- `deploy` — NEW (service deploy mutations)
- `test-run` — NEW (test executor mutations)

### 7.4 New router task tags
Add to `scripts/v4/router/smart-model-router.mjs`:
- `creative_plan` → Opus 4.7 (quality) / Sonnet 4.5 (balanced) / Sonnet 4.5 (strict) — UNCONSTRAINED
- `structure_extract` → Haiku 4.5 across all budget tiers — STRICT JSON

---

## 8.0 Subscription-First Transport (binding doctrine — kept from amend, refined)

Every model call in OrangeBox follows this routing order, **strictly**, before any pipeline logic:

### 8.1 Routing order
1. **Subscription CLI** (headless — operator's preferred path; no host app needed)
2. **Direct provider API** (per-token billing — fallback only when CLI absent)
3. **Local Ollama** (free; LOCAL_MODE)
4. **Subscription MCP from host app** (B-path only — for operators who happen to run Claude Desktop / Cursor for other reasons)

**Critical clarification (revised 2026-05-18):** CLI is PRIMARY. MCP-from-host is B-PATH. The operator's goal is to be OFF host apps — CLI is headless and OAuth-token-on-disk, so it satisfies that goal. MCP-from-host requires the host app to be running and is therefore a degraded mode used only as opportunistic backup.

### 8.2 CLI registry (detected at sidecar startup, cached in `<dataRoot>/pipes.json`)

| Provider | CLI binary | Subscription source | OAuth model | Headless? |
|---|---|---|---|---|
| anthropic | `claude` (Claude Code) | Anthropic Pro / Max | `claude login` once | yes — no host app required |
| openai | `codex` | ChatGPT Pro / Team | `codex login` once | yes |
| google | `gemini` | Gemini Advanced | `gemini login` once | yes |
| xai | `grok` | X Premium+ | `grok login` once | yes |
| cursor | `cursor agent` | Cursor Pro/Team | Cursor login once | yes |

### 8.3 Receipt-level cost transparency

Every model-call receipt records:
```json
{
  "pipe": "subscription-cli | api | local | subscription-mcp-host-bpath",
  "provider": "anthropic",
  "binary_or_endpoint": "claude",
  "tokens_in": 8432,
  "tokens_out": 1124,
  "dollar_cost": 0.00,
  "subscription_quota_used_pct": 2.4,
  "fallback_reason": null,
  "latency_ms_first_token": 412,
  "latency_ms_total": 8127
}
```

### 8.4 Cockpit cost-bar (dual display)

- **SUB · 12% used** — gentle warning ≥70%, hard alarm ≥90% of monthly cap
- **API $0.0000 today** — only displays nonzero when subscription pipes were unavailable

The mere presence of a nonzero API number signals operator's setup degraded; the receipt names which step fell back and why.

### 8.4.5 Set-and-Forget Auth Model (amendment 2026-05-18b)

The operator-facing goal: **never manage env tokens or per-provider keys again**. The architecture meets it with two layers:

#### Layer A — Subscription CLI logins (preferred, $0 incremental)
Each CLI auths once via OAuth. Tokens persist on disk; OAuth auto-refreshes. **No env var needed for that provider.**

```
claude login    →  Anthropic Pro / Max  ($0 ongoing)
codex login     →  ChatGPT Pro / Team   ($0 ongoing)
gemini login    →  Gemini Advanced      ($0 ongoing)
grok login      →  X Premium+           ($0 ongoing)
cursor agent    →  Cursor Pro / Team    ($0 ongoing)
```

One terminal command, one time, never touched again.

#### Layer B — OpenRouter as the ONE universal fallback key
For providers without an installed CLI (or when the operator has zero subscriptions), OpenRouter provides a single key that routes to **200+ models** across Anthropic, OpenAI, Google, Meta, Mistral, Cohere, etc.

```
ORANGEBOX_OPENROUTER_KEY=sk-or-v1-xxx   ←  one env var, one bill, all providers
```

**OpenRouter replaces** these now-deprecated env vars at v6.3.0 GA:
- `ANTHROPIC_API_KEY` → deprecated; covered by OpenRouter or `claude login`
- `OPENAI_API_KEY` → deprecated; OpenRouter or `codex login`
- `GOOGLE_API_KEY` → deprecated; OpenRouter or `gemini login`
- `GROQ_API_KEY` → deprecated; OpenRouter (Llama/Mixtral are on OpenRouter)
- `XAI_API_KEY` → deprecated; OpenRouter or `grok login`

The 5+ env vars collapse to ONE (`ORANGEBOX_OPENROUTER_KEY`) — and even that's optional if any CLI is logged in.

#### Rejected alternatives (with reasons)

**Make.com / Zapier** — rejected as a routing layer because:
1. **Latency**: every call adds 300-1500ms (EU/US hop through their servers)
2. **Privacy**: every prompt + response passes through a third-party's infrastructure
3. **Cost**: $9-$50/mo subscription stacked on top of the operator's existing model costs
4. **Lock-in**: if Make/Zapier is down, OrangeBox is down
5. **Wrong problem-solver**: Make/Zapier are designed for SaaS-to-SaaS workflow automation (Slack→Sheets→Email). They are not designed for AI model routing — they don't beat direct provider APIs at it.

They could still serve as **operator-facing integrations** (e.g. "post a receipt to Slack via Make webhook") — and OrangeBox can support that — but they have no role in the model-call hot path.

**Per-provider API keys** — operationally messy. v6.3.0 GA migrates everyone to OpenRouter + CLI subscriptions.

#### Routing decision (updated)

```
For each model call:
  1. Try subscription CLI for the requested provider     (preferred, $0)
  2. If CLI absent OR oauth_ok=false:
     try OpenRouter with the requested model             ($, one key)
  3. If OpenRouter key absent:
     try direct provider API for that provider           (DEPRECATED, last resort)
  4. If all of the above fail:
     try local Ollama via LOCAL_MODE                     (free, quality-bounded)
  5. Else: return graceful failure with one clear hint of how to fix it
```

#### Onboarding wizard

A one-time setup ghost (`Ctrl+Shift+W` or `obx setup` from CLI) walks the operator through:
1. Detect which subscription CLIs are installed → list them with login command if not authed
2. Ask "want a universal fallback? paste your OpenRouter key" (1 input, optional)
3. Verify everything works with one test call
4. Done — operator never touches auth again

### 8.5 Override knobs

- `ORANGEBOX_FORCE_API=1` — skip subscription pipes
- `ORANGEBOX_FORCE_PIPE=claude` — pin specific pipe
- `ORANGEBOX_PIPE_ORDER=claude,codex,gemini,grok` — explicit preference
- `ORANGEBOX_ENABLE_MCP_HOST=1` — opt in to B-path MCP-from-host scanning (off by default per §8.1)

### 8.6 Verification: no host app required

The doctrine's binding test: **OrangeBox runs a full Silent Canvas cycle with no host app open**. If `claude` CLI is installed + logged in, Claude Desktop is uninstalled, OrangeBox runs the pipeline end-to-end. This is the §13 verification gate's central check.

---

## 9.0 Financial & Performance Benefits (PDF §4.0 — all three measured)

This dual-model configuration provides three direct advantages. Each is measured live + reported as a receipt artifact at v6.3.0 GA.

### 9.1 Reduced API Expenses

> High-tier reasoning models are billed at premium rates. By offloading thousands of structural tokens to a faster, low-cost parsing model, total production expenses drop significantly.

**Target:** dual via subscription path = **$0 incremental** per run. Dual via API fallback = ≤$0.05 per run (90% savings vs single-Opus baseline of $0.42/run).

**Measurement:** every `silent-canvas-run` receipt records:
- Creative Brain pipe + tokens + dollar cost
- Fast Interpreter pipe + tokens + dollar cost
- Total dollar cost
- "Would-have-cost" vs single-Opus API baseline (synthetic comparison)
- "Would-have-cost" vs single-Sonnet API baseline

**Published number:** at v6.3.0 GA, publish median + p95 dollar cost across 100 real runs as a receipt artifact.

### 9.2 Lower Latency

> Specialized parsing models process structured data faster than general-purpose reasoning models, delivering real-time UI canvas modifications without performance lags.

**Target:**
- p50 first-token (Objective on screen): **< 1.5s**
- p50 ROADMAP on screen: **< 5s**
- p50 first canvas mutation: **< 7s**
- p50 SUMMARY on screen (5-mutation run): **< 30s**

**Measurement:** every run receipt records:
- `latency_ms_objective` — prompt sent → Objective rendered
- `latency_ms_roadmap` — prompt sent → Roadmap rendered
- `latency_ms_first_mutation` — prompt sent → first canvas element mutates
- `latency_ms_summary` — prompt sent → Summary rendered
- `latency_ms_total`

**Published number:** at v6.3.0 GA, publish p50/p95 across 100 real runs.

### 9.3 Consistent Formatting

> Separating the creative design phase from the structural generation phase ensures the output code remains clean, stable, and easy to parse.

**Target:**
- JSON parse success rate on first try (Fast Interpreter output): **≥ 99%**
- Schema validation success rate (HSMP shape conformance): **≥ 99%**

**Measurement:** every Fast Interpreter call records:
- `parse_attempt` (1 or 2)
- `parse_success`
- `schema_valid`
- if not valid, `schema_errors` array

**Published number:** at v6.3.0 GA, publish parse-success-rate + schema-valid-rate across 100 real runs.

---

## 10.0 Beyond Full Scope (additions on top of PDF — never less, sometimes more)

### 10.1 Multi-Canvas Mode

Operator can switch between specialized canvases via `Ctrl+1..5`:
- **Architecture** — services, routes, deps, data flow
- **UI** — components, screens, navigation, themes
- **Data Flow** — pipelines, transforms, stores, queries
- **Deploy** — environments, hosts, networks, certs
- **History** — replay timeline of all canvas snapshots

Each canvas is a filtered view of the same project graph.

### 10.2 Canvas Snapshots + Replay

- Every 60s + on milestone boundaries, the canvas state is snapshotted to `<dataRoot>/projects/<hash>/snapshots/<ts>.json`
- Operator can scrub a timeline at the bottom of the canvas (the LIVE TICKER strip becomes a scrub bar in History view)
- Replaying re-animates the canvas with original transition timings (or fast-forward / slow-mo)
- Each replay frame is also a re-loadable canvas state

### 10.3 Visual Diff (state mutation before / after)

When the operator hovers a milestone in the Roadmap, the canvas can show a **diff overlay**:
- Faded "before" state + the "after" state with the mutation highlighted
- Side-by-side toggle (split view)
- Operator can roll back any mutation from this view (emits `silent-canvas-rollback` receipt)

### 10.4 Voice → Canvas Commands

Operator can hold the chat input's mic button and dictate:
- Voice → Whisper local STT → text in chat input
- Hit Enter (or release-to-send) → normal Silent Canvas run

Future: real-time dictation overlay where the canvas starts reacting WHILE the operator speaks (Creative Brain runs as soon as a complete sentence lands).

### 10.5 Generative Component Library

When the Creative Brain proposes a visual element that doesn't fit the existing component catalog (§4.1), it can request a **new component type**:
- The proposal lands in a "Pending Components" tray
- Operator approves once → the new type enters the catalog and the canvas renders it
- All future runs can use it without re-approval

### 10.6 AI Box Worker Rail canvas sync

When the operator has the AI Box worker rail running on a second machine:
- The remote machine's mutations stream to the operator's canvas in real time
- A small avatar pulses on the affected node showing which machine is mutating
- Two operators on two machines can co-edit the same canvas (their actions interleave)

### 10.7 Living Documentation Export

At any time, the operator can `obx canvas export` (or click "Export living doc"):
- Generates a static HTML + animated SVG document
- Captures the current canvas state + the receipt chain that built it
- Sharable as proof-of-work / customer-facing artifact / pitch deck input

### 10.8 Cross-Conversation Vault Search

The Silent Canvas adds receipts to the vault, but the vault now indexes the **HSMP chains** themselves:
- Operator can search across past runs ("show me every time I added a dark-mode toggle")
- Past HSMP chains can be **replayed against the current project** (one-click "apply this pattern here")

### 10.9 Receipt-driven canvas annotation

Every canvas element shows a small `▤ N` chip when N receipts have touched it:
- Click the chip → ghost opens with the receipts list scoped to that element
- Hover → mini-tooltip with last-receipt summary

### 10.10 The Long Game: agent-to-agent canvas

In v6.4+, multiple agents (Trilane debate, AE0–AE14 departments) can each leave canvas annotations during their reasoning:
- Department badges on nodes ("ENG-REVIEWED · QA-PENDING · SEC-CLEARED")
- The operator sees inter-agent reasoning as canvas overlays, never text scroll

---

## 11.0 Native UI Contract (v6.3.0)

### 11.1 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│ TopBar:  ORANGEBOX · project · branch · 🛡 trust · SUB% · ●●●●●     │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  PROGRESS DASHBOARD (3 fields only, ephemeral per-run, ~22% height) │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ OBJECTIVE   <one sentence>                                     │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ MILESTONES  ▣ 1.  ▣ 2.  ▦ 3.  ○ 4.  ○ 5.                       │ │
│  ├────────────────────────────────────────────────────────────────┤ │
│  │ SUMMARY     (fills on finish)                                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  VISUAL TELEMETRY ENGINE (canvas, ~68% height)                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ◆ data ───wire→ ▢ component ───wire→ ◇ service ───wire→ ▷    │ │
│  │      pulse              edit-glow              live-flow       │ │
│  │  [region: auth-module]    [region: ui]    [region: deploy]    │ │
│  │  smooth CSS-style transitions, never raw JSON                  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│ SLIM INPUT:  + Tell me what to build…  Sonnet ⌄ 🎤  [➤➤ SEND]       │
└──────────────────────────────────────────────────────────────────────┘
```

### 11.2 What gets retired from v6.2.0-alpha.4
- The big chat box centered → replaced by ephemeral Progress Dashboard
- The chat history scroll → DELETED (live thread); past prompts live in receipts only
- The 6 PM-dashboard tiles (NOW BUILDING / CURRENT STEP / MODEL / FILES / TESTS / DEPLOY) → folded into Progress Dashboard's 3 fields + canvas
- The TIMELINE 6-phase A→Z strip → KEPT but moves into the History canvas view (Ctrl+5)
- The LIVE TICKER → moves to bottom of canvas as ambient receipt-pulse strip

### 11.3 What stays
- Lava-glow chat input bar (the input is still text input)
- Warm 14h-comfort palette
- 20Hz repaint scheduling for smooth motion
- Ghost overlay system (Ctrl+R receipts, Ctrl+, settings, Ctrl+T terminal, etc.)
- Trust chip + status dots
- Onboarding banner — adapted to detect missing CLI pipes per §8.2

### 11.4 Canvas implementation (egui-native, then upgrade path)

**v6.3.0-alpha.3 (initial):**
- Custom egui node-graph using `egui::Shape` + custom `Stroke` paths
- Pan via drag, zoom via Ctrl+scroll
- Node primitives: rounded rect / hexagon / pill / cylinder / diamond / triangle / gear (per §4.1)
- Wire primitives: solid / dashed / dotted / particle-flow / barbed (per §4.2)
- Transitions via per-frame interpolation with curve LUTs (per §4.3)

**v6.4.0 upgrade path:**
- Evaluate `egui_graphs` crate for richer node-graph behaviors
- Optionally adopt a small embedded canvas widget if egui's draw primitives prove insufficient for complex animations

---

## 12.0 Phased Implementation Plan (honest at full scope)

| Phase | Build | Estimated days |
|---|---|---|
| **v6.3.0-alpha.0** | Subscription pipe transport (per §8). CLI detector for all 5 providers + subprocess wrappers + router upgrade + 2 endpoints + receipt fields + `obx pipes` CLI subcommand | 2.0 |
| **v6.3.0-alpha.1** | Silent Canvas server pipeline (per §7). `silent-canvas.mjs` + 7 endpoints + 4 new task tags + 12 new receipt sources + project graph + snapshot system | 1.5 |
| **v6.3.0-alpha.2** | Progress Dashboard (per §3). 3 fields only, ephemeral, SSE-wired, all PDF binding rules | 1.0 |
| **v6.3.0-alpha.3** | Visual Telemetry Engine — component catalog (§4.1) | 2.0 |
| **v6.3.0-alpha.4** | Visual Telemetry Engine — wire grammar (§4.2) + CSS-style transitions (§4.3) | 2.0 |
| **v6.3.0-alpha.5** | Codeless Engine Integration (§5). State mutation ↔ executor binding + compilation contract | 2.0 |
| **v6.3.0-alpha.6** | Three benefits measurement (§9.1, §9.2, §9.3) + receipts + cockpit cost-bar dual display | 1.0 |
| **v6.3.0-alpha.7** | Beyond-full-scope subset (§10.1 multi-canvas + §10.2 snapshots/replay + §10.3 visual diff) | 2.0 |
| **v6.3.0-alpha.8** | Polish (motion curves, empty states, missing-pipe banner, accessibility prefers-reduced-motion, all error paths) | 1.0 |
| **v6.3.0 GA** | Smoke audit (40+ endpoint checks), reality report, LEDGER, RELEASE_NOTES_v6.3.0.md | 0.5 |

**Total: ~15 focused days to v6.3.0 GA at FULL PDF scope.** No 3.5-day fake-fast number. The PDF deserves the days.

§10.4–§10.10 beyond-full-scope items defer to v6.4.0+ unless operator requests inclusion. They are NAMED here so they don't get lost.

---

## 13.0 Verification Gate (binary — expanded to 22 checks)

v6.3.0 ships only when ALL are green.

**Progress Dashboard (PDF §2.1)**
1. ✓ Operator types a goal → OBJECTIVE renders within p50 < 1.5s.
2. ✓ MILESTONE ROADMAP renders within p50 < 5s of submission.
3. ✓ Each milestone glyph mutates `○ → ▦ → ▣` (or `✗`) in real time.
4. ✓ APPLICATION SUMMARY renders within ≤2s of last milestone completing.
5. ✓ NO fourth foreground item ever appears (operator can audit a session and confirm).

**Visual Telemetry Engine (PDF §2.2 + §4)**
6. ✓ For each state mutation, the corresponding canvas element animates (CSS-style transition per §4.3).
7. ✓ Wire grammar (§4.2) renders solid/dashed/dotted/particle/barbed correctly per wire type.
8. ✓ All 12 element types from §4.1 render correctly.
9. ✓ Pan + zoom + click + right-click interactions per §4.5 all work.
10. ✓ Canvas never renders raw JSON, "Thinking…", or scrollable transcript (banned per §4.4).
11. ✓ `prefers-reduced-motion` accommodation works (durations ≤80ms).

**Codeless Engine Integration (PDF cover + §5)**
12. ✓ Canvas state IS a serializable HSMP (round-trip serialization preserves all elements/wires).
13. ✓ `silent-canvas/compile` endpoint takes the canvas state → produces runnable software on disk.
14. ✓ Replay an HSMP chain from project init → regenerates the project bit-exact.

**Dual-Model Split Pipeline (PDF §3 + §6)**
15. ✓ Creative Brain runs unconstrained (no JSON schema imposed; output prose only).
16. ✓ Creative Brain produces TWO artifacts per call (engineering plan + structural layout guidelines).
17. ✓ Fast Interpreter JSON parse success rate ≥ 99% (per §9.3).
18. ✓ Failed-parse path emits `silent-canvas-parse-error` receipt + falls back gracefully.

**Subscription-First Transport (§8)**
19. ✓ With `claude` CLI installed + no host app open → run completes via subscription path, receipt shows `pipe=subscription-cli`, dollar_cost=$0.00.
20. ✓ With no CLI installed → run falls back to API with `fallback_reason` named in receipt.
21. ✓ Onboarding banner correctly detects missing CLIs and shows install hints per provider.

**Operator Control (V4_MOAT §27 guardrails + Human Final Stop)**
22. ✓ Operator can cancel mid-run; cancellation receipts emit; canvas freezes in current state.

**Three Financial & Performance Benefits (PDF §4 + §9)**
23. ✓ Reduced API Expenses: per-run cost receipt published; subscription path = $0; API fallback ≤ $0.05 (≥85% savings).
24. ✓ Lower Latency: p50 first-canvas-mutation < 7s; p50 SUMMARY < 30s on a 5-mutation run.
25. ✓ Consistent Formatting: JSON parse success ≥ 99% across 100 measured runs.

**Smoke**
26. ✓ Smoke test: 40+ endpoint audit including all 7 new `/silent-canvas/*` routes + 2 `/pipes/*` routes + new receipt sources GETs.

If any of 1–26 fails, ship is blocked. v6.3.0 stays at alpha.

---

## 14.0 Mom's Law applied to this doctrine

- Full effort: read the PDF in full, re-read all orangebox doctrine, wrote this at full scope, did not trim.
- No theater: 15 days of honest work, not 3.5 of fake-fast.
- Every claim verifiable: §13 has 26 binary checks, each measurable.
- Receipts everywhere: 12 new receipt sources, plus existing taxonomy preserved.
- Operator authority preserved: Human Final Stop reachable via Cancel + Esc; freeze-guard applies to all state mutations; trust chip gates destructive ops.
- No shortening: this doctrine equals or exceeds every PDF element, by line and by spirit.

---

## 15.0 Naming, files, IDs

- The release: **OrangeBox v6.3.0 — Silent Canvas**
- Disclosure ID: `ATOM-OBX-V6-3-SILENT-CANVAS-2026-0518`
- Doctrine ID: `ATOM-OBX-SILENT-CANVAS-2026-0518`
- PDF source: `C:/Users/a/Downloads/Silent_Canvas_Market_Innovation.pdf` (26.5 KB) — preserved at `docs/refs/Silent_Canvas_Market_Innovation.pdf` on next pack
- Doctrine file: `docs/SILENT_CANVAS_DOCTRINE.md` (this document)
- Build receipt: `receipts/BUILD_v6.3.0-PLAN.json` (regenerate v3 to match this scope)

---

## 16.0 Sign-off

This doctrine is at FULL PDF scope. The phased plan is honest. The verification gate is binary. No code is touched until operator confirms direction is right.

(a) Approve → I bump `BUILD_v6.3.0-PLAN.json` to v3 (matching this doctrine), emit a `silent-canvas-doctrine-full-scope` receipt, and start v6.3.0-alpha.0 (CLI transport for all 5 providers, 2 days).

(b) Approve with edits → tell me which §sections change.

(c) Reject → tell me what you actually want.

(d) Expand further → say which §10 beyond-full-scope items move into v6.3.0 from v6.4.0.

End of doctrine.
