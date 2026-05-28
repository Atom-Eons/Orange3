# ORANGEBOX v4 — Alpha extracted from Anthropic docs

**Crawl date:** 2026-05-17
**Crawler operator:** Atom McCree
**Doctrine ID:** `ATOM-OBX-V4-ALPHA-2026-0517`

This doc captures the every-page-read Anthropic docs alpha sweep. Each section: what the feature is, why it matters for ORANGEBOX, exact API shape, and the v4.0.1 application plan.

---

## 1. Pre-warming the cache (P0 — applies everywhere)

**Feature:** Fire `max_tokens: 0` at server start to load the system prompt into cache before any user request. First user message hits a fully warm cache → time-to-first-token drops dramatically.

**Source:** https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pre-warming-the-cache

**API shape:**
```python
client.messages.create(
    model="claude-opus-4-7",
    max_tokens=0,
    system=[{
        "type": "text",
        "text": SYSTEM_PROMPT,
        "cache_control": {"type": "ephemeral"}
    }],
    messages=[{"role": "user", "content": "warmup"}]
)
# Returns: stop_reason "max_tokens", empty content[], cache_creation_input_tokens > 0
```

**Critical detail:** Place `cache_control` on the last SHARED block, not on the warmup message. The warmup user message must NOT carry the breakpoint or the cache won't hit.

**ORANGEBOX application:**
- New endpoint `POST /api/v4/cache/prewarm` in `v4-server-routes.mjs`
- Cockpit boot hook in `cockpit.js` calls it ONCE on first load
- Background re-fire every 4 minutes (270s, before 5-min TTL expires) for the active system prompts
- Surface cache state in right-rail "Now" pane: "cache warm · TTFT < 100ms"

---

## 2. 1-hour cache TTL (P0 — vault and skills should use this)

**Feature:** `{"type": "ephemeral", "ttl": "1h"}` extends a cache to 1 hour at 2x base write cost. Cache hit price stays at 10% of base.

**Constraint:** When mixing 1h and 5min in the same request, 1h breakpoints must come BEFORE 5min in the prompt hierarchy (tools → system → messages).

**ORANGEBOX application:**
- Vault context block → 1h TTL (vault doesn't change every 5 min)
- Skill manifest / tool definitions → 1h TTL
- Mistakes ledger → 5min TTL (changes more often)
- Per-message dynamic context → 5min TTL or none

---

## 3. Adaptive thinking + effort parameter (P0 — replaces budget_tokens)

**Feature:** On Opus 4.7, `thinking: {type: "adaptive"}` is the ONLY supported thinking mode. Manual `enabled` with `budget_tokens` is rejected with 400. Claude decides when and how much to think based on complexity. Effort parameter gives soft guidance.

**Effort levels:**
- `max` — always think, no constraint (Opus 4.7, 4.6, Sonnet 4.6, Mythos Preview)
- `xhigh` — extended exploration (Opus 4.7 only)
- `high` — default; always thinks
- `medium` — moderate; skips for very simple
- `low` — minimize; speed first

**Interleaved thinking** auto-enabled in adaptive mode on Opus 4.7/4.6/Sonnet 4.6. Critical for agentic tool-call chains.

**`thinking.display: "omitted"`** is default on Opus 4.7 → faster TTFT. Set to `"summarized"` to see thinking. Set to `"omitted"` explicitly for autocomplete to drop streaming latency further.

**ORANGEBOX application:**
- Smart-model-router maps our budget modes:
  - `strict` → effort: "low"
  - `balanced` → effort: "medium" (default)
  - `quality` → effort: "high"
- Architecture task forces effort: "xhigh" on Opus 4.7
- Autocomplete uses `display: "omitted"` for fastest token-out
- Drop our `budget_tokens` usage entirely on Opus 4.7 (will 400 otherwise)

---

## 4. Advisor tool (P0 — Sonnet executor + Opus advisor)

**Feature:** `advisor-tool-2026-03-01` beta. Pair a faster executor model with a higher-intelligence advisor model that gets called mid-generation. Server-side, single API call.

**Tool shape:**
```python
tools=[{
    "type": "advisor_20260301",
    "name": "advisor",
    "model": "claude-opus-4-7",
    "caching": {"type": "ephemeral", "ttl": "5m"},
    "max_uses": 5
}]
```

**Compatibility matrix:**
- Sonnet 4.6 executor + Opus 4.7 advisor → near-Opus quality at near-Sonnet cost
- Haiku 4.5 executor + Opus 4.7 advisor → step up in intelligence from Haiku, lower cost than switching to Sonnet+
- Opus executor + Opus advisor → for max quality on really hard problems

**Best-practice system prompt** (cited verbatim from Anthropic docs for coding tasks):
> "Call advisor BEFORE substantive work — before writing, before committing to an interpretation. Orientation is not substantive work. Writing, editing, and declaring an answer are. Also call advisor when stuck, when considering a change of approach, and before declaring done."

**Trim advisor output:** Place in user message: `"(Advisor: please keep your guidance under 80 words — I need a focused starting point, not a comprehensive plan.)"`

**Caching break-even:** Enable `caching` on the tool definition only when expecting ≥3 advisor calls per conversation. Costs more than it saves at ≤2 calls.

**ORANGEBOX application:**
- IDE composer task → Sonnet executor + Opus 4.7 advisor, advisor caching ON
- PR review task → Sonnet executor + Opus advisor, advisor caching ON
- Architecture task → keep Opus 4.7 (advisor not needed when executor is already top)
- Inline edit small → Haiku executor + Opus advisor (cheaper than full Sonnet, near-Sonnet quality)
- Add the suggested system prompt + 80-word advisor cap to our smart-router system message

---

## 5. Agent Skills (P1 — replaces our custom marketplace partially)

**Feature:** `skills-2025-10-02` + `code-execution-2025-08-25` + `files-api-2025-04-14` betas. Skills are filesystem-based modular capabilities with YAML frontmatter that load via 3-level progressive disclosure.

**Skill structure:**
```
my-skill/
├── SKILL.md                ← frontmatter + body
├── REFERENCE.md            ← loaded on demand
└── scripts/
    └── helper.py           ← runs in code-exec, output only consumes context
```

**SKILL.md format:**
```yaml
---
name: my-skill           # 64 char max, lowercase + hyphens
description: What this does and when to use it.  # 1024 char max
---

# My Skill

## Instructions
[procedural guidance]
```

**Pre-built skills:** `pptx`, `xlsx`, `docx`, `pdf` (Anthropic-provided, free to use).

**Custom skills:** Workspace-wide on API (uploaded via `/v1/skills`).

**Activation in Messages API:** Reference `skill_id` in the `container` parameter with code execution tool.

**ORANGEBOX application:**
- Our marketplace `.skill.tgz` packages translate to Anthropic-compatible skills
- `scripts/v4/marketplace/skill-installer.mjs` adds an `--upload-to-anthropic` flag
- Auto-upload skills the operator promotes from "pending" → "active" if API keys present
- Cockpit Skills lane shows: ORANGEBOX local skills + Anthropic-uploaded skills + Anthropic pre-built (pptx/xlsx/docx/pdf)
- Skills compound the moat: every operator workflow becomes a reusable skill

---

## 6. MCP Connector (P1 — ORANGEBOX as remote MCP)

**Feature:** `mcp-client-2025-11-20` beta. Anthropic Messages API can call REMOTE MCP servers directly via `mcp_servers` array — no local MCP client needed.

**Transport:** HTTP SSE or Streamable HTTP only. Local stdio servers cannot be connected directly.

**Request shape:**
```json
{
  "mcp_servers": [{
    "type": "url",
    "url": "https://mcp.orangebox.example.com/sse",
    "name": "orangebox-mcp",
    "authorization_token": "OPERATOR_TOKEN"
  }],
  "tools": [{
    "type": "mcp_toolset",
    "mcp_server_name": "orangebox-mcp",
    "default_config": {"enabled": false},
    "configs": {
      "orangebox_pull_receipts": {"enabled": true},
      "orangebox_run_agent_team": {"enabled": true}
    },
    "cache_control": {"type": "ephemeral"}
  }]
}
```

**OAuth flow:** Operator generates bearer token via `npx @modelcontextprotocol/inspector`.

**ORANGEBOX application:**
- Add an OPTIONAL remote MCP endpoint over HTTPS tunnel (Cloudflare Tunnel free tier or operator's own reverse proxy)
- Mobile companion + remote Claude.ai sessions can call into operator's local ORANGEBOX MCP via this endpoint
- Doc this as v4.1 feature — needs DNS + cert work — for now ship the local stdio MCP we have

---

## 7. Files API (P1 — upload vault once, reuse forever)

**Feature:** `files-api-2025-04-14` beta. Upload files → get `file_id` → reference in messages without re-uploading. 500MB per file, 500GB per org. Files persist until deleted.

**Pricing:** Upload/download/list/delete operations are FREE. File content priced as input tokens.

**Reference shape:**
```json
{
  "type": "document",
  "source": {"type": "file", "file_id": "file_011CNha8iCJcU1wXNR6q4V8w"},
  "citations": {"enabled": true}
}
```

**ORANGEBOX application:**
- New script `scripts/v4/files-api-sync.mjs`
  - On vault rebuild, upload changed lattice docs to Anthropic via Files API
  - Persist `file_id` mapping in `<data_root>/files-api/index.json`
  - Future `cited_query` calls reference `file_id`s instead of inlining full text
  - Massive token savings on big vaults (50MB+ lattice)
- Combined with prompt caching → first cited_query writes the cache, subsequent reads at 10% base

---

## 8. Structured outputs (P0 — kills JSON parse retries)

**Feature:** `output_config.format` with `json_schema` constrains responses to schema. Strict tool use also available. Schema cached 24h after first use.

**Shape:**
```python
output_config={
    "format": {
        "type": "json_schema",
        "schema": {
            "type": "object",
            "properties": {...},
            "required": [...],
            "additionalProperties": False
        }
    }
}
```

**Strict tool use:** `tools[].strict: true` validates tool names + inputs against schema.

**Limits:** 20 strict tools, 24 optional params, 16 union types, 180s compilation timeout. NO recursive schemas, NO numerical/string constraints (use SDK auto-transform).

**Compatible with:** batch (50% off), streaming, vision, tools. Caching: format changes invalidate cache.

**ORANGEBOX application** (per-route alpha):
- `/api/v4/ide/composer` → schema: `{plan: string, changes: [{path: string, preview: string, newContent: string}]}`
- `/api/v4/voice/intent` → schema: `{intent: enum, params: object, suggestedAction: string}`
- `/api/v4/trilane/conflicts` → schema: `{conflicts: [{axis: string, positions: [{leg: enum, position: string}], severity: enum}]}`
- `/api/v4/terminal/suggest` → schema: `{command: string, reasoning: string, danger_level: enum}`
- First call costs grammar compilation (~one-time); next 24h are fast
- Drops all our JSON-parse-fence-strip retry logic

---

## 9. Compaction (P1 — long IDE sessions)

**Feature:** `compact-2026-01-12` beta. Auto-summarize older context when input > 150k tokens. Custom `instructions` to bias what gets preserved.

**Shape:**
```python
context_management={
    "edits": [{
        "type": "compact_20260112",
        "trigger": {"type": "input_tokens", "value": 150000},
        "pause_after_compaction": True,
        "instructions": "Focus on preserving code snippets, variable names, and technical decisions."
    }]
}
```

**Response:** `compaction` block in content. Subsequent requests: pass the assistant content back; all prior blocks dropped.

**ORANGEBOX application:**
- Long-running chat / IDE Ask sessions → enable compaction at 120k threshold
- Custom instructions preserve: receipt IDs, file paths, mistakes-ledger entries, current DAG node
- Compaction event is RECEIPTED — operator can audit what was summarized

---

## 10. Memory tool (P0 — killer move for compound intelligence)

**Feature:** `memory_20250818` client-side tool. Claude auto-checks the `/memories` directory BEFORE every task and stores progress / preferences / project context for cross-conversation continuity.

**System-prompt auto-injection:**
> "IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE. MEMORY PROTOCOL: 1. Use the view command of your memory tool to check for earlier progress. 2. ... (work on the task) ... record progress in memory."

**Commands:** view, create, str_replace, insert, delete, rename. Client implements all of them locally.

**Security (operator-implemented):**
- Validate paths start with `/memories`
- Reject `../`, `..\\`, URL-encoded traversal
- Use `pathlib.Path.resolve()` and `relative_to()` equivalents

**ORANGEBOX application — this IS our compound intelligence backbone:**
- Implement client-side memory handler in `v4-server-routes.mjs`:
  - Map Claude's `/memories/*` paths to `<data_root>/memory/`
  - Strict path-traversal sandbox
  - Auto-emit receipts on every write
- Compound intelligence doctrine becomes BUILT-IN to every Claude call automatically — Anthropic's system prompt forces vault check before answer
- Memory tool pairs with compaction: compaction summarizes session, memory persists what survives the summary
- Memory pairs with our existing knowledge-v2 vault: memory is operator-writable working set; vault is compounded long-term lattice
- THIS REPLACES our hand-rolled "vault injection" logic from MOVE 1 in the dept sweep — instead of pre-prepending vault context, we expose memory tool, Claude pulls what it needs

---

## 11. Multi-breakpoint cache strategy (P1)

**Feature:** Up to 4 cache breakpoints per request. 20-block lookback window per breakpoint.

**Strategy:** When conversation depth approaches 20 blocks past the last cache write, add a second earlier breakpoint to keep the chain alive.

**ORANGEBOX application:**
- Smart-model-router exposes a `breakpoint_strategy` field:
  - `auto` (default) — top-level `cache_control` moves breakpoint automatically
  - `multi` — places breakpoints at (1) tool definitions, (2) system prompt, (3) memory tool output, (4) last user message
- Long IDE chat with many turns uses `multi` strategy

---

## 12. Batch processing (P2 — 50% off for non-realtime)

**Feature:** Submit large volumes of requests, async results in <1h typical. **50% discount.** NOT compatible with prompt caching.

**ORANGEBOX application:**
- Non-realtime: vault rebuilds, dream synthesis, weekly audit reports, mistakes ledger reprocessing
- Add `scripts/v4/batch-runner.mjs` that submits batched analyses and polls for completion
- Surface batch progress in cockpit "Now" pane

---

## 13. Token counting (P2 — predict before fire)

**Feature:** `/v1/messages/count_tokens` endpoint. Predict input token usage before sending.

**ORANGEBOX application:**
- Add `/api/v4/router/estimate` that returns `{predicted_input, predicted_output, predicted_cost_cents}` before any real fire
- IDE Ask shows estimated cost inline before user clicks send
- Composer multi-file edit shows estimate per file

---

## 14. Inference geo control (P2 — enterprise SKU enabler)

**Feature:** `inference_geo: "global" | "us"` parameter. Geographic routing of model inference.

**ORANGEBOX application:**
- Add to smart-router params; pass-through to provider
- Future ORANGEBOX Enterprise SKU sells "US-only inference" as a compliance feature

---

## 15. Citations API (P1 — vault recall accuracy)

**Feature:** Pass documents with `citations: {enabled: true}` → Claude's responses include exact source citations.

**Beta header (current):** `citations-2025-06-30,prompt-caching-2024-07-31`

**ORANGEBOX application:**
- Already wired via `/api/v4/vault/cited-query` (v4-routes fix landed)
- Verify beta headers correct
- Citations show inline in Receipt browser receipts → proof-of-citation chain

---

## Application priority for v4.0.1

| Alpha | Priority | Application target | Effort |
|---|---|---|---|
| 10. Memory tool | P0 | `v4-server-routes.mjs` add `/api/v4/memory/*` + client handler | High leverage |
| 1. Pre-warming | P0 | `v4-server-routes.mjs` + `cockpit.js` boot hook | Low effort, big win |
| 8. Structured outputs | P0 | 4 endpoints get `output_config.format` | Medium effort |
| 3. Adaptive thinking + effort | P0 | `smart-model-router.mjs` | Low effort |
| 4. Advisor tool | P0 | `smart-model-router.mjs` adds advisor for code tasks | Medium effort |
| 2. 1-hour cache TTL | P1 | `compound-intelligence.mjs` vault block | Low effort |
| 7. Files API | P1 | New `scripts/v4/files-api-sync.mjs` | Medium effort |
| 9. Compaction | P1 | `v4-server-routes.mjs` long-running chats | Low effort |
| 13. Token counting | P2 | `smart-model-router.mjs` + cockpit estimate UI | Low effort |
| 11. Multi-breakpoint | P2 | `smart-model-router.mjs` | Low effort |
| 12. Batch processing | P2 | `scripts/v4/batch-runner.mjs` new | Medium effort |
| 15. Citations | P1 | already wired | Done |
| 5. Agent Skills upload | P2 | `skill-installer.mjs --upload-to-anthropic` | Medium effort |
| 6. MCP Connector | v4.1 | Remote MCP via HTTPS tunnel | High effort (defer) |
| 14. Inference geo | P2 | router pass-through | Low effort |

---

## What we are NOT doing (and why)

- **Hand-rolled "vault injection"** — superseded by Memory tool (alpha #10). Anthropic's system prompt auto-injection is stronger than our prepended `<vault>` block.
- **Manual budget_tokens on Opus 4.7** — REJECTED by API. Must use adaptive.
- **Re-uploading vault on every cited_query** — Files API once, cache forever.
- **Custom JSON parse + fence strip** — Structured outputs eliminates this class of bug.
- **Pre-warming via batch API** — Batch + prompt caching incompatible. Pre-warming uses standard messages.create with `max_tokens: 0`.

---

## Doctrine

1. **Every Claude call goes warm.** Pre-warming on boot. Cache_control on every shared block.
2. **Every JSON response is schema-validated.** Structured outputs by default.
3. **Every long session compacts gracefully.** Compaction with custom preserve-instructions.
4. **Every operator session compounds.** Memory tool replaces hand-rolled vault inject.
5. **Every architecture decision gets advised.** Sonnet+Opus advisor on code tasks.
6. **Every vault doc is uploaded once.** Files API for big knowledge.
7. **Every cost is predictable.** Token counting before fire.
8. **Every breakpoint is intentional.** Multi-breakpoint where it matters; auto where it doesn't.

---

## Sources cited

- https://platform.claude.com/docs/en/build-with-claude/prompt-caching (deep)
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching#pre-warming-the-cache (operator-directed)
- https://platform.claude.com/docs/en/build-with-claude/overview (features overview)
- https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
- https://platform.claude.com/docs/en/build-with-claude/extended-thinking
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview
- https://platform.claude.com/docs/en/agents-and-tools/mcp-connector (v2 2025-11-20)
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
- https://platform.claude.com/docs/en/build-with-claude/batch-processing
- https://platform.claude.com/docs/en/build-with-claude/files
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- https://platform.claude.com/docs/en/build-with-claude/compaction
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool

## Resolved 2026-05-17 (operator-relayed from xAI/Hermes announcement)

The t.co link (https://x.ai/news/grok-hermes) resolved by operator paste:

> "𝕏 Premium subscriptions can now be used directly inside Hermes Agent — not just SuperGrok users. Hermes Agent can also now search 𝕏 posts directly. Many AI models still don't have native access to the real-time 𝕏 feed and live conversations…"

### Implications for ORANGEBOX v5 / v5.1

This makes the Hermes Agent integration we shipped (in `scripts/v4/hermes/`) substantially more valuable. Every ORANGEBOX operator who installs Hermes gets:

- **Native 𝕏 feed access** — read live X posts, search X conversations from inside AE See-Suite
- **𝕏 Premium subscription support** — operator's existing X Premium credentials work inside the agent
- **Real-time live-data input** that Claude Code, Cursor, and Codex DO NOT have natively

### v5.0 + v5.1 application

- **v5.0 ship:** Hermes integration already in place. Operators who install Hermes via `scripts/v4/hermes/INSTALL_HERMES.ps1` get the X feed access for free as soon as Hermes publishes the new capability.
- **v5.0.1 release notes** should mention this as a key differentiator: "Install Hermes Agent (free MIT, included in ORANGEBOX) and your cockpit reads live X. Claude Code can't do that."
- **v5.1 native lane:** add an `X Feed` lane that wraps the Hermes X tools — operator searches X from the cockpit, results land in receipts, can be cited in vault.
- **Mistakes ledger:** any X-feed claim Claude makes can be verified against the live feed and corrections logged.

### New competitive kill-shot

Add to the moat doctrine:

> **9. Live data via Hermes 𝕏 feed.** Claude Code, Cursor, and Codex have no native real-time X access. ORANGEBOX (via Hermes Agent) does. The cockpit reads what the world is saying as it's said.

Doctrine ID `ATOM-OBX-V5-X-FEED-2026-0517`.
