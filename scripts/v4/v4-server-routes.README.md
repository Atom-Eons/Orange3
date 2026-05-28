# v4-server-routes.mjs — ORANGEBOX v4 API Route Module

Doctrine anchor: `docs/V4_MOAT_DOCTRINE.md` (ATOM-OBX-V4-MOAT-2026-0516)
Date: 2026-05-16

---

## Purpose

Single module that exposes every `/api/v4/*` endpoint for the ORANGEBOX v4 AE See-Suite.
The main server registers it in two lines and then every AE See-Suite lane has a working backend.

---

## Integration

```js
import { attachV4Routes } from "./v4/v4-server-routes.mjs";

const v4 = attachV4Routes({ getDataRoot: () => DATA_ROOT });

// In main http.createServer router:
if (req.url.startsWith("/api/v4/")) return v4(req, res);

// WebSocket terminal (on the same server):
server.on("upgrade", v4.handleUpgrade);
```

---

## Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `ANTHROPIC_API_KEY` | Anthropic provider | (none — graceful error if missing) |
| `OPENAI_API_KEY` | OpenAI provider | (none) |
| `GOOGLE_API_KEY` | Google Gemini provider | (none) |
| `ORANGEBOX_DATA_ROOT` | Data root path | `~/.orangebox` |
| `ORANGEBOX_WORKSPACE_ROOT` | FS sandbox root | user home dir |
| `ORANGEBOX_AI_BOX_IP` | Optional Advanced AI Box IP | (none) |
| `ORANGEBOX_CODEXA_IP` | Legacy compatibility alias for Advanced AI Box IP | (none) |

---

## Endpoints

### AE See-Suite

#### GET /api/v4/see-suite/status

Returns readiness of each AE See-Suite subsystem. Recoverable Basic Install
states use `ok: null` so the UI can show setup guidance instead of a red
failure.

**Response:**
```json
{
  "project":  { "ok": true,  "label": "data root reachable" },
  "vault":    { "ok": null,  "status": "SETUP_PENDING", "label": "vault setup pending - local workspace is usable" },
  "router":   { "ok": true,  "label": "smart-model-router loaded" },
  "privacy":  { "ok": true,  "label": "privacy-audit loaded" },
  "queue":    { "ok": true,  "label": "bg-agent-queue loaded" },
  "aiBox":    { "ok": null,  "status": "NOT_CONFIGURED_BASIC_INSTALL", "label": "Basic Install active - Advanced AI Box not configured" }
}
```

```bash
curl http://localhost:8877/api/v4/see-suite/status
```

---

### Router

#### POST /api/v4/router/route

Ask the smart model router which model should handle a task.

**Request:**
```json
{ "task": "autocomplete", "hint": "typescript code", "budget": "balanced" }
```

**Response:**
```json
{
  "provider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "reasoning": "Autocomplete requires sub-100ms latency...",
  "costEstimateCents": 0.0001,
  "fallbacks": [...],
  "features": ["streaming"]
}
```

```bash
curl -X POST http://localhost:8877/api/v4/router/route \
  -H "Content-Type: application/json" \
  -d '{"task":"multi_file_edit","budget":"quality"}'
```

---

### Model

#### POST /api/v4/model/call

Non-streaming model call. Returns full text when complete.

**Request:**
```json
{
  "routed": { "model": "claude-sonnet-4-5-20251015" },
  "system": "You are a coding assistant.",
  "messages": [{ "role": "user", "content": "Explain async/await in JS." }]
}
```

**Response:**
```json
{
  "ok": true,
  "text": "Async/await is syntactic sugar over Promises...",
  "costCents": 0.042,
  "model": "claude-sonnet-4-5-20251015",
  "cached": false,
  "inputTokens": 120,
  "outputTokens": 210
}
```

#### POST /api/v4/model/stream

SSE streaming call. Streams `{ delta }` chunks, then `{ cost_cents }`, then `data: [DONE]`.

**Request:**
```json
{
  "routed": { "provider": "anthropic", "model": "claude-sonnet-4-5-20251015" },
  "system": "Be concise.",
  "messages": [{ "role": "user", "content": "Write a haiku about code." }]
}
```

Supported providers via `routed.provider`: `anthropic` (default), `openai`, `google`.

```bash
curl -N -X POST http://localhost:8877/api/v4/model/stream \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
```

---

### Vault

#### POST /api/v4/vault/cited-query

RAG query against local vault markdown files using Anthropic Citations API.

**Request:**
```json
{ "question": "What is the Pathwaves routing doctrine?", "vault": "vault" }
```

**Response:**
```json
{
  "answer": "Pathwaves is a real routing doctrine...",
  "citations": [],
  "documentsSearched": 12
}
```

---

### Receipts

#### POST /api/v4/receipts/emit

Emit a receipt for any meaningful event.

**Request:**
```json
{
  "source": "terminal-agent",
  "title": "Build completed",
  "summary": "npm run build exited 0",
  "evidence": { "exitCode": 0, "durationMs": 3200 }
}
```

**Response:**
```json
{ "id": "uuid-here", "path": "/Users/atom/.orangebox/receipts/v4/uuid-here.json" }
```

#### GET /api/v4/receipts/list?since=&source=&limit=

**Query params:** `since` (ISO date), `source` (string filter), `limit` (max 500, default 50).

**Response:**
```json
{ "items": [ { "id": "...", "source": "...", "title": "...", "ts": "..." } ] }
```

#### GET /api/v4/receipts/:id

**Response:**
```json
{ "receipt": { "id": "...", "source": "...", "title": "...", "summary": "...", "evidence": {}, "ts": "..." } }
```

```bash
curl http://localhost:8877/api/v4/receipts/list?limit=10
curl http://localhost:8877/api/v4/receipts/abc-123
```

---

### Party-Line

#### POST /api/v4/party-line/send

Post a message to the party-line channel.

**Request:**
```json
{ "from": "operator", "text": "Running build through AE Operations...", "channel": "builds" }
```

**Response:**
```json
{ "id": "uuid", "ts": "2026-05-16T..." }
```

#### GET /api/v4/party-line/recent?limit=

**Query params:** `limit` (1–200, default 50).

**Response:**
```json
{
  "messages": [
    { "id": "uuid", "ts": "...", "from": "operator", "channel": "general", "text": "..." }
  ]
}
```

```bash
curl http://localhost:8877/api/v4/party-line/recent?limit=20
```

---

### DAG

#### GET /api/v4/dag/current

Read the current mission DAG from `<data_root>/dag/current.json`.

**Response:**
```json
{
  "current": { "id": "build-skill-factory", "status": "active" },
  "nodes": [ { "id": "node-1", "title": "Research", "status": "done" } ]
}
```

Returns `{ "current": null, "nodes": [] }` if the file does not exist.

#### POST /api/v4/dag/update

Patch or add a node in the DAG.

**Request:**
```json
{ "nodeId": "node-1", "patch": { "status": "done", "completedAt": "2026-05-16T..." } }
```

**Response:**
```json
{ "ok": true }
```

---

### Queue

#### POST /api/v4/queue/enqueue

Add a background job to the agent queue.

**Request:**
```json
{
  "title": "Nightly skill-factory sweep",
  "prompt": "Run the skill-factory pipeline on the full candidate list.",
  "priority": 3,
  "worker": "ai-box-lan"
}
```

**Response:**
```json
{ "id": "uuid-job-id" }
```

#### GET /api/v4/queue/list?status=

**Query params:** `status` — one of `queued`, `running`, `done`, `failed`, `cancelled`.

**Response:**
```json
{ "jobs": [ { "id": "...", "title": "...", "status": "queued", "priority": 3, ... } ] }
```

#### POST /api/v4/queue/cancel

Cancel a queued (not yet running) job.

**Request:**
```json
{ "id": "uuid-job-id" }
```

**Response:**
```json
{ "ok": true }
```

---

### Privacy

#### POST /api/v4/privacy/record-egress

Manually record an egress event.

**Request:** any JSON object matching the `recordEgress(opts)` schema in `privacy-audit.mjs`.

**Response:**
```json
{ "ok": true }
```

#### GET /api/v4/privacy/summary?since=

**Query params:** `since` — e.g. `24h`, `7d`, `30d`.

**Response:**
```json
{
  "totals": { "calls": 48, "costCents": 12.4, "inputTokens": 80000, "outputTokens": 20000, "cached": 8 },
  "byProvider": {
    "anthropic": { "calls": 40, "costCents": 10.2 },
    "openai":    { "calls": 8,  "costCents": 2.2  }
  }
}
```

```bash
curl "http://localhost:8877/api/v4/privacy/summary?since=24h"
```

---

### Voice

#### POST /api/v4/voice/transcribe

Transcribe audio. Accepts multipart/form-data (field `audio`) or application/octet-stream (raw audio bytes).

**Response:**
```json
{
  "text": "Add a Stripe webhook handler to the billing module.",
  "durationMs": 3200,
  "model": "base.en",
  "local": true
}
```

Audio stays on-machine when `whisper.cpp` is installed. Falls back to OpenAI Whisper API only when the local binary is absent and `OPENAI_API_KEY` is set.

```bash
curl -X POST http://localhost:8877/api/v4/voice/transcribe \
  -F "audio=@/tmp/clip.wav"
```

---

### Filesystem

All FS routes are sandboxed to `ORANGEBOX_WORKSPACE_ROOT` (or user home if not set).
Access is denied to any path containing `.git/HEAD`, `.ssh/`, `.env`, or `.env.*`.

#### POST /api/v4/fs/tree

**Request:**
```json
{ "path": "/Users/atom/AtomEons/project", "depth": 3 }
```

**Response:** recursive tree node `{ name, type, children?, size?, truncated? }`. Max depth 6. Max 200 entries per directory.

#### POST /api/v4/fs/read

**Request:**
```json
{ "path": "/Users/atom/AtomEons/project/src/index.ts" }
```

**Response:**
```json
{ "content": "import ...", "encoding": "utf8" }
```

#### POST /api/v4/fs/write

**Request:**
```json
{ "path": "/Users/atom/AtomEons/project/notes.md", "content": "# Notes\n..." }
```

**Response:**
```json
{ "ok": true, "bytes": 1024 }
```

Emits a receipt on every successful write.

---

### IDE

#### POST /api/v4/ide/autocomplete

Fast tab-completion (Haiku 4.5).

**Request:**
```json
{
  "before": "function calculateTotal(items) {\n  return items.reduce(",
  "after": "\n}",
  "lang": "typescript",
  "path": "src/billing.ts",
  "maxChars": 400
}
```

**Response:**
```json
{
  "suggestion": "(sum, item) => sum + item.price, 0)",
  "model": "claude-haiku-4-5-20251001",
  "costCents": 0.0002
}
```

#### POST /api/v4/ide/composer

Multi-file Composer-style edit (Sonnet).

**Request:**
```json
{
  "files": ["src/billing.ts", "src/types.ts"],
  "instruction": "Add a calculateDiscount function and update the types to include a discount field."
}
```

**Response:**
```json
{
  "plan": "1. Add discount field to Item type. 2. Implement calculateDiscount...",
  "changes": [
    {
      "path": "src/types.ts",
      "preview": "Add discount?: number to Item interface",
      "newContent": "export interface Item { price: number; discount?: number; }"
    }
  ]
}
```

Emits a receipt on completion.

---

### Terminal

#### POST /api/v4/terminal/suggest

AI-assisted shell command suggestion.

**Request:**
```json
{
  "shell": "powershell",
  "cwd": "C:/AtomEons/orangebox-os",
  "intent": "run tests and show only failures",
  "history": ["npm install", "npm run build"],
  "platform": "win32"
}
```

**Response:**
```json
{
  "command": "npm test 2>&1 | Select-String -Pattern 'FAIL|Error'",
  "reasoning": "Pipes test output through Select-String to filter failure lines."
}
```

#### WS /api/v4/terminal/ws?shell=

Bidirectional PTY proxy. Upgrades to WebSocket (RFC 6455).

- If `node-pty` is installed: full PTY (proper terminal emulation, resize events).
- If `node-pty` is absent: falls back to `child_process.spawn` stdin/stdout pipe.
- Query param `shell`: override shell binary (default: `powershell` on Windows, `bash` elsewhere).

Attach the `handleUpgrade` listener to your HTTP server:
```js
server.on("upgrade", v4.handleUpgrade);
```

Client sends raw keystrokes as text WebSocket frames; server streams shell output back.

---

### Trilane

The trilane debate system. Authority order: GPT-5 (Architect) > Gemini 1.5 Pro (Consigliere) > Claude Sonnet (Compiler).

#### POST /api/v4/trilane/stream

Stream one model leg. SSE stream: `{ delta }` chunks, `{ cost_cents }`, then `[DONE]`.

**Request:**
```json
{
  "leg": "claude",
  "system": "You are the Claude compiler leg of a trilane debate.",
  "messages": [{ "role": "user", "content": "Should ORANGEBOX add a JetBrains plugin?" }]
}
```

`leg` values: `claude` / `anthropic`, `gpt` / `openai`, `gemini` / `google`.

If a provider key is missing, yields a single `{ delta: "[PROVIDER_API_KEY missing...]" }` then `[DONE]`.

```bash
curl -N -X POST http://localhost:8877/api/v4/trilane/stream \
  -H "Content-Type: application/json" \
  -d '{"leg":"gpt","messages":[{"role":"user","content":"Rate local-first vs cloud-first."}]}'
```

#### POST /api/v4/trilane/conflicts

Detect conflicts between model responses.

**Request:**
```json
{
  "prompt": "Should ORANGEBOX ship a JetBrains plugin?",
  "responses": [
    "Yes — JetBrains has 10M+ developers. High ROI.",
    "No — maintaining three IDEs (VS Code, JetBrains, Monaco) will fragment the team. Ship Monaco first."
  ]
}
```

**Response:**
```json
{
  "conflicts": [
    {
      "topic": "JetBrains plugin",
      "positions": ["Yes — high ROI", "No — team fragmentation"],
      "severity": "high"
    }
  ]
}
```

#### POST /api/v4/trilane/synthesize

Synthesize a final verdict respecting the authority order.

**Request:**
```json
{
  "prompt": "Should ORANGEBOX ship a JetBrains plugin?",
  "legs": [
    { "label": "GPT-5 (Architect)", "text": "No — focus Monaco first." },
    { "label": "Gemini (Consigliere)", "text": "Yes, but treat as P2." },
    { "label": "Claude (Compiler)", "text": "Defer until Mac/Linux builds are done." }
  ],
  "votedFor": "GPT-5"
}
```

**Response:**
```json
{
  "verdict": "Defer JetBrains plugin to P2. Monaco IDE is P0; shipping a second IDE surface now splits implementation focus.",
  "detail": "GPT-5 Architect ruling takes precedence...",
  "authority_note": "Authority order: GPT-5 (Architect) > Gemini 1.5 Pro (Consigliere) > Claude Sonnet (Compiler)"
}
```

Emits a receipt on every synthesis.

---

## Security notes

- FS routes are sandboxed. Paths outside home (or `ORANGEBOX_WORKSPACE_ROOT`) are rejected with 403.
- `.git/HEAD`, `.ssh/*`, `.env`, `.env.*` are blocked regardless of root.
- API keys are read from env only — never from request body.
- Privacy egress is recorded for every outbound model call. Prompt plaintext is never logged unless the operator explicitly enables debug mode via privacy-audit.
- All routes return graceful JSON errors; no stack traces in production responses.

---

## Receipt guarantee

The following routes emit a receipt automatically:

- `POST /api/v4/fs/write`
- `POST /api/v4/ide/composer`
- `POST /api/v4/trilane/synthesize`

All others can be tracked via `POST /api/v4/receipts/emit` from the caller.

---

## Acceptance checklist

- [x] File exists at `scripts/v4/v4-server-routes.mjs`
- [x] `node --check` passes (zero syntax errors)
- [x] Exports `attachV4Routes({ getDataRoot })` returning `handle(req, res)` with `handle.handleUpgrade`
- [x] Wired to `smart-model-router.mjs`, `bg-agent-queue.mjs`, `privacy-audit.mjs`, `whisper-runner.mjs`
- [x] Every model call records egress via privacy-audit
- [x] File write, composer, trilane synthesize each emit a receipt
- [x] FS sandbox enforced; blocked patterns enumerated
- [x] WebSocket terminal with inline RFC 6455 parser; node-pty optional, spawn fallback
- [x] Trilane: all three providers stream; missing key yields graceful `[provider key missing]` message
- [x] Prompt caching (`cache_control: ephemeral`) on every Anthropic system prompt
- [x] Zero npm dependencies (Node built-ins only)
