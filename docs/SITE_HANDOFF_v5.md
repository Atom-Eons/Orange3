# ORANGEBOX v5 — site feature drop

**For:** atomeons.com / orangebox product page
**From:** ORANGEBOX v5.0.0 (launching 2026-05-17 00:01 ET)
**Audience:** buyers landing on the product page or scrolling the feature grid
**Use:** copy/paste sections into the existing site; voice should match the current atomeons.com tone (anti-saas, terse, premium, instrument-panel)

---

## Hero claims (pick one or rotate)

> **The cockpit replaces Claude Code, Cursor, and Codex. $49 once. Yours forever.**

> **The OS, not the tool.** Local-first AI command cockpit. Multi-model. Multi-machine. Receipts on every action.

> **One $49 cockpit replaces three subscriptions.** Claude Code, Cursor, Codex — all in one panel you own.

> **The cockpit was built through the cockpit.** v5.0 ships everything we used to build it.

---

## Sub-headline (under H1)

> 11 lanes. 60+ MCP tools. 15 departments. Claude · GPT · Gemini · OpenRouter (200+ models) · Hermes 𝕏 feed. Local-first. Zero telemetry. No subscription, ever.

---

## Feature grid (the headline 16, organized buyer-side)

### ⌖ Cockpit
Premium dark instrument panel. 11 lanes. Ctrl+1..0 + Ctrl+Shift+X shortcuts. Cinematic boot. Right-rail party-line + Now panel + latest receipt.

### { } IDE — replaces Cursor
Monaco editor. Tab autocomplete (sub-100ms, Haiku 4.5, cached). AI inline edit with diff preview. Multi-file Composer. Ask · Edit · Composer · Explain panes.

### ›_ Terminal — replaces Claude Code's terminal
xterm.js + real PTY. Ctrl+K agent overlay translates intent → command. Output streamed to receipts. PowerShell · cmd · bash · zsh · fish.

### △ Trilane — debate
Claude + GPT + Gemini answer your prompt in parallel. Conflicts surfaced. You vote. Receipt sealed. GPT > Gemini > Claude authority on unresolved conflict.

### ◉ Voice
Local Whisper.cpp transcribes. Haiku 4.5 classifies intent. Sonnet 4.6 streams code. Audio never leaves your machine.

### 𝕏 𝕏 Feed — powered by Hermes
Live X search and conversation read, inside AE See-Suite. 𝕏 Premium support. Hermes Agent does the heavy lifting. *No incumbent has this.*

### ⬡ Vault — compounding lattice
CLC lattice + void + RAPTOR + hybrid RRF retrieval. Every commit, every receipt, every chat compounds. Weekly +N% density audit with HTML export.

### ▤ Receipts
Every meaningful action emits a receipt. Browse virtualized. Search fuzzy. Share as self-contained HTML artifact. *Proof-of-work as portfolio.*

### ◆ Privacy
Every API call audited. Hashed by default. Air-gap mode disables all egress. Per-provider cost breakdown. Buyers see exactly what their tokens are buying.

### ✦ Skils — Skil.Ski via MCP
One MCP endpoint connects ORANGEBOX to the entire Skil.Ski marketplace. Default URL: `https://skil.ski/api/mcp`. Paste-snippet · Copy · Add to cockpit · Learn more.

### ⚙ Settings
Cockpit pin (v5 default · v2 McLaren · v1.4 classic). Per-provider key state. Air-gap toggle. Hermes status. Language picker (i18n framework — operator-translatable).

---

## Compound moats (the 9 kill-shots — Claude Code, Cursor, Codex can't copy)

| # | Moat | Why incumbents can't copy |
|---|---|---|
| 1 | **Local-first by default** | Cursor and Codex monetize cloud indexing; can't go local without breaking their business model |
| 2 | **Multi-model first-class** | Anthropic won't ship Claude+GPT+Gemini in Claude Code |
| 3 | **BYO keys, zero markup** | Sub-shaped competitors have to charge for tokens or die |
| 4 | **Operator OS doctrine** | They're sold as tools; we're sold as the chair |
| 5 | **Receipts on every action** | None ship proof; once buyers expect it, vapor output looks naked |
| 6 | **Department doctrine** (AE0-AE14 + 15 AEoNs skills) | Roleplay subagents aren't the same as separation of powers |
| 7 | **Compounding lattice memory** | Every interaction feeds the lattice; the longer you use it, the smarter |
| 8 | **Multi-machine worker rail** | Codexa: laptop pilots workstation pilots cloud — no one has this |
| 9 | **Native 𝕏 feed via Hermes** | Claude Code / Cursor / Codex have zero real-time X access |

---

## Engineering moves shipped in v5

Operator-facing detail (could go in a "Built right" or "What's actually in the box" expander):

- **Adaptive thinking + effort parameter** — Opus 4.7 uses `effort: xhigh` on architecture, `low` on tight-budget; no more `budget_tokens` 400s.
- **Advisor tool** — Sonnet executor + Opus advisor mid-generation. Near-Opus quality at near-Sonnet cost on code tasks.
- **Anthropic Memory tool** — Claude auto-checks your local memory dir before every task. Memory survives sessions.
- **Anthropic Files API** — upload vault docs once, reuse forever. Massive token savings.
- **Citations API** — vault-grounded answers cite their sources inline.
- **Prompt caching with pre-warming** — cockpit boots warm; first response is sub-300ms.
- **1-hour cache TTL on vault** — saves money on hot paths.
- **Compaction** — auto-summarize long sessions at 150k tokens, preserves what matters.
- **Structured outputs** — JSON-schema-validated responses on 4 endpoints. Zero parse retries.
- **Multi-breakpoint cache strategy** — auto for short chats, multi for >10 turns.
- **Smart model router** — 10 task types × 3 budget modes, cost-aware fallbacks.
- **Background agent queue** — "do X overnight, wake me when done" with receipts.

---

## Security + privacy (for the trust block)

- CORS locked to `http://localhost` + `tauri://localhost`
- Filesystem writes require `ORANGEBOX_WORKSPACE_ROOT`; hard block list for `~/.ssh/`, `~/.gnupg/`, `~/.aws/`, `Library/Keychains`, etc.
- Terminal WebSocket requires session token + shell whitelist (bash, sh, pwsh, powershell, zsh, fish, cmd)
- Mobile companion API binds 127.0.0.1 only (no LAN exposure by default)
- Skill loader: Ed25519 signature verify, trust-store enforced
- AI Box Cloud: per-tenant Ed25519 tokens (issue/revoke/list, admin-token-gated)
- Tauri CSP locked (origins + script sources + connect-src whitelisted)
- All API egress audited locally; prompts hashed by default; air-gap toggle
- Telemetry OFF by default; opt-in is local-only (no upload in v5.0.0)

---

## Pricing block (replaces current pricing card)

| SKU | Price | What you get |
|---|---|---|
| **ORANGEBOX Command** | **$49 perpetual** · one-time | Full cockpit. BYO keys. v1.x–v5.x updates free. |
| AI Box Cloud | $19/mo (optional) | Hosted worker rail. Skip the second computer. |
| Pooled Keys | $99/mo (optional) | We supply provider tokens at pooled rate. Zero key management. |
| Team | $499/yr · 5 seats | Shared vault + receipts + DAG. $99.80/user/yr. |

**Zero markup on tokens.** Privacy dashboard surfaces every provider charge. Your money, your keys.

---

## What ORANGEBOX is NOT (anti-saas posture)

- Not a chatbox.
- Not a subscription. (Buy once; updates free for v1.x through v5.x.)
- Not a SaaS dashboard.
- Not a model. (Uses every major model; locked to none.)
- Not a startup pitch. (One operator. No team. No roadmap theater.)
- Not a chargeable add-on per feature. (16 features ship in v5.0.0 base.)

---

## Tweet-ready taglines

```
v5. live.
$49 once.
claude / gpt / gemini / openrouter / hermes from one cockpit you actually own.
local-first. zero telemetry.
→ atomeons.com/orangebox
```

```
new in v5:
• 𝕏 feed inside AE See-Suite (via hermes)
• memory tool auto-checks your local memory before every claude call
• advisor tool: sonnet+opus combo on code tasks
• 11 lanes. one cockpit. $49 once.
```

```
the cockpit was built through the cockpit.
v5 ships everything we used to build it.
```

```
no subscription, ever.
v1.x → v5.x updates: free.
the $49 you paid in 2026 still works in 2030.
```

---

## Programmatic feature list (JSON for site builder)

```json
{
  "version": "5.0.0",
  "marketing_label": "OB0X v5",
  "tagline": "The OS, not the tool.",
  "launched_at": "2026-05-17T04:01:00Z",
  "price_perpetual_usd": 49,
  "lanes": [
    { "id": "cockpit",     "name": "Cockpit",   "glyph": "⌖",  "shortcut": "Ctrl+1",       "tagline": "Home, DAG, party-line, Now panel." },
    { "id": "ide",         "name": "IDE",       "glyph": "{ }","shortcut": "Ctrl+2",       "tagline": "Monaco + tab autocomplete + multi-file Composer." },
    { "id": "terminal",    "name": "Terminal",  "glyph": "›_", "shortcut": "Ctrl+3",       "tagline": "Real shell + Ctrl+K agent overlay + streamed receipts." },
    { "id": "trilane",     "name": "Trilane",   "glyph": "△",  "shortcut": "Ctrl+4",       "tagline": "Claude + GPT + Gemini debate. You vote." },
    { "id": "voice",       "name": "Voice",     "glyph": "◉",  "shortcut": "Ctrl+5",       "tagline": "Local Whisper. Speak intent, get code." },
    { "id": "xfeed",       "name": "𝕏 Feed",   "glyph": "𝕏",  "shortcut": "Ctrl+Shift+X", "tagline": "Live X via Hermes. No incumbent has this." },
    { "id": "vault",       "name": "Vault",     "glyph": "⬡",  "shortcut": "Ctrl+6",       "tagline": "Compounding lattice. Smarter every session." },
    { "id": "receipts",    "name": "Receipts",  "glyph": "▤",  "shortcut": "Ctrl+7",       "tagline": "Proof of work. Shareable as artifact." },
    { "id": "privacy",     "name": "Privacy",   "glyph": "◆",  "shortcut": "Ctrl+8",       "tagline": "Every API call audited. Air-gap on demand." },
    { "id": "skils",       "name": "Skils",     "glyph": "✦",  "shortcut": "Ctrl+9",       "tagline": "Skil.Ski marketplace via one MCP endpoint." },
    { "id": "settings",    "name": "Settings",  "glyph": "⚙",  "shortcut": "Ctrl+0",       "tagline": "Cockpit pin · keys · privacy · language · a11y." }
  ],
  "providers_supported": [
    "Anthropic Claude (Opus 4.7, Sonnet 4.6, Haiku 4.5)",
    "OpenAI GPT-5",
    "Google Gemini",
    "OpenRouter (200+ models)",
    "Hermes Agent (MIT, free)",
    "Local Whisper.cpp"
  ],
  "anthropic_alpha_wired": [
    "Adaptive thinking + effort parameter",
    "Advisor tool (Sonnet+Opus)",
    "Memory tool auto-attached",
    "Files API vault sync",
    "Citations API on vault queries",
    "Prompt caching with pre-warm-on-boot",
    "1-hour cache TTL on vault",
    "Compaction for long sessions",
    "Structured outputs (JSON schema validated)",
    "Multi-breakpoint cache strategy",
    "Token counting before fire"
  ],
  "moats": [
    { "name": "Local-first by default",         "vs": "Cursor / Codex cloud-only" },
    { "name": "Multi-model orchestration",      "vs": "Claude Code is Anthropic-only" },
    { "name": "BYO keys zero markup",           "vs": "Subscription tools mark up tokens" },
    { "name": "Operator OS doctrine",           "vs": "They are tools; we are the chair" },
    { "name": "Receipts on every action",       "vs": "Nobody ships proof" },
    { "name": "Department doctrine",            "vs": "Roleplay subagents" },
    { "name": "Compounding lattice memory",     "vs": "Stateless sessions" },
    { "name": "Multi-machine worker rail",      "vs": "Single-machine tools" },
    { "name": "Native 𝕏 feed via Hermes",      "vs": "Zero native X access in any incumbent" }
  ],
  "skus": [
    { "id": "command",     "price_usd": 49,    "term": "perpetual",  "label": "ORANGEBOX Command",  "default": true,  "description": "Full cockpit. BYO keys. v1.x–v5.x free." },
    { "id": "ai_box_cloud","price_usd": 19,    "term": "month",      "label": "AI Box Cloud",        "default": false, "description": "Hosted worker rail. Skip the second computer." },
    { "id": "pooled_keys", "price_usd": 99,    "term": "month",      "label": "Pooled Keys",          "default": false, "description": "We supply provider tokens at pooled rate." },
    { "id": "team",        "price_usd": 499,   "term": "year",       "label": "Team",                 "default": false, "description": "5 seats. Shared vault + receipts + DAG." }
  ],
  "security_features": [
    "CORS locked to localhost + tauri://",
    "Workspace path enforcement",
    "Terminal WebSocket session-token auth + shell whitelist",
    "Mobile API binds 127.0.0.1 only",
    "Skill loader Ed25519 verify + trust store",
    "AI Box Cloud per-tenant Ed25519 tokens",
    "Tauri CSP locked",
    "All API egress hashed-logged by default",
    "Air-gap mode (one-toggle disable all outbound)",
    "Telemetry OFF by default; opt-in is local-only"
  ],
  "doctrine_doc": "docs/V4_MOAT_DOCTRINE.md",
  "alpha_doc": "docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md",
  "release_notes": "docs/RELEASE_NOTES_v5.0.0.md",
  "changelog": "CHANGELOG.md",
  "site_handoff": "docs/SITE_HANDOFF_v5.md"
}
```

---

## Suggested site sections (in order, top to bottom)

1. **Hero** — pick one of the H1 options above. Sub-headline. Buy button ($49 once).
2. **What's in the box** — 11-lane grid (use the JSON `lanes` array + each lane's glyph + tagline).
3. **The 9 moats** — table (use the `moats` array). Heading: *"Things Claude Code, Cursor, and Codex can't copy."*
4. **Anthropic alpha shipped** — bulleted list (use `anthropic_alpha_wired`). Heading: *"Every advanced Anthropic capability — already wired."*
5. **Security + privacy** — bulleted block (use `security_features`). Heading: *"Your code never leaves your machine unless you say so."*
6. **Pricing** — SKU table (use `skus` array). Reinforce: zero token markup.
7. **What ORANGEBOX is not** — the anti-saas posture block.
8. **The receipts** — link to a real shareable receipt artifact (operator picks the best one from their session).
9. **Buy** — final $49 Stripe block. SHA-256 of MSI displayed as proof of binary integrity.

---

## Download links (after build green)

| File | SHA-256 |
|---|---|
| `ORANGEBOX_5.0.0_x64_en-US.msi` | *to be filled in by site builder from `receipts/BUILD_v5.0.0.json`* |
| `ORANGEBOX_5.0.0_x64-setup.exe` | *to be filled in* |
| `orangebox-v5.0.0-aio.zip` | *to be filled in* |

The `receipts/BUILD_v5.0.0.json` file in the AIO zip contains the canonical SHA-256 values for every artifact.

---

## Doctrine bottom-strip (above footer)

> ORANGEBOX is the cockpit. Skil.Ski is the marketplace. Hermes Agent is the outer orchestration.
> Three sibling products from AtomEons. They click together over MCP.
> One operator. No team. No roadmap theater. The cockpit was built through the cockpit.

---

*Doctrine ID:* `ATOM-OBX-V5-SITE-HANDOFF-2026-0517`
