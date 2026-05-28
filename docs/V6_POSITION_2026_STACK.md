# ORANGEBOX v6.0 — 2026 STACK POSITION MEMO

**Disclosure ID:** `ATOM-OBX-V6-POSITION-2026-0517`
**Date:** 2026-05-17
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
**Mom's Law:** Full effort. No stubs. No hand-waving.

---

## Why this memo exists

v6.0 is the **native rewrite** of ORANGEBOX. Tauri webview replaced with `eframe + egui` immediate-mode Rust UI. Single `orangebox.exe` produced from `src-tauri/src/bin/native.rs`. No HTML in the chrome. No webview error pages. Ever.

This memo names what 2026-stack moves are wired now, what is banked for v6.1+, and what is rejected.

---

## ADOPT (wired in v6.0)

### 1. Groq LPUs — sub-300ms first token
- **Where:** `scripts/v4/router/smart-model-router.mjs`
- **Models:** `llama-3.3-70b-versatile` (chat), `gemma2-9b-it` (pre-classifier)
- **Pricing:** $0.59 / $0.79 per MTok in/out (Llama); $0.20 / $0.20 (Gemma)
- **Tasks:** `quick_reply` (Groq default, all budget tiers); fallback to Haiku 4.5
- **Win:** kills the "is the app dead?" perception that nuked v5.0. The cockpit feels alive.

### 2. Ollama local — air-gap Privacy lane
- **Where:** same router
- **Models:** `qwen2.5:7b` (balanced/quality), `llama3.2:3b` (strict / low-VRAM)
- **Tasks:** `offline_chat`; plus runtime swap via `ORANGEBOX_LOCAL_MODE=1`
- **Exclusions:** `synthesis`, `architecture`, `pr_review` stay remote (no local equivalents that pay back the latency/quality cost)
- **Win:** zero egress, zero cost, brand-honest Privacy lane.

### 3. Gemma-4 pre-classifier (opt-in)
- **Where:** new task `route_dispatch` in router
- **Activation:** `ORANGEBOX_ROUTE_TIER=gemma`
- **Default:** OFF — deterministic heuristic router is the cold path
- **Win:** cheap, fast task classification when needed; preserves zero-cost default.

### 4. Anthropic prompt caching + adaptive thinking + advisor + memory + multi-breakpoint
- **Status:** ALREADY LIVE — locked in v5 doctrine (`V4_ALPHA_FROM_ANTHROPIC_DOCS.md`)
- **No code change in v6.0; carried forward as-is.**

### 5. Claude 4.6 Agent Teams (advisory)
- **Where:** `route()` decision now includes `agent_teams` field when synthesis + Claude executor
- **Beta header:** `agent-teams-2026-04-01`
- **Caller contract:** when present, fire Anthropic legs via `anthropic.beta.agent_teams.create()`; non-Anthropic legs (GPT-5, Gemini) stay in our local trilane wrapper.
- **Win:** parallel Claude orchestration without rewriting our cross-vendor fan-out.

### 6. Native single-exe binary
- **Where:** `src-tauri/src/bin/native.rs` (~907 LOC, egui 0.27)
- **Deliverable:** `orangebox.exe` — pure Rust. No HTML. No chromium fallback.
- **Sidecar:** Node still runs in the background for `/api/v4/*` until v6.1 ports endpoints to Rust commands.

---

## BANK (v6.1 / v6.2)

### A. OpenAI prompt caching (transparent)
- Anthropic cache is explicit (breakpoints). OpenAI 5.4 native caching is automatic and lacks a stable breakpoint API.
- Wait for SDK exposure; no code today.

### B. Computer Use APIs (Anthropic / OpenAI)
- New `OpsAgent` lane already enumerated; will require kill-switch, per-action confirm-by-default, audit ledger.
- Operator doctrine: "Human Final Stop Authority reachable from any autonomous-action path." This is the highest-risk surface in the stack — guardrails first.

### C. Llama 4 Scout 10M context
- Retrieval-first (Files API + RAPTOR + RRF) already in v5; functionally larger and cheaper than 10M raw context.
- Add Scout as a `task=bulk_summarize` provider behind `ORANGEBOX_LONGCTX=scout` only when the use case demands a single-doc 10M pass.

---

## REJECT (for v6.0)

### WebRTC multimodal streaming
- Wrong layer for a private desktop cockpit. We are not a browser-mediated peer media network. SSE/Websocket already handle streaming tokens.
- Revisit only if Voice lane lands a multi-party real-time use case. Even then, OS-native audio + WS is simpler.

---

## Verification

```bash
node scripts/v4/router/smart-model-router.mjs --task=quick_reply       # → groq:llama-3.3-70b-versatile
ORANGEBOX_LOCAL_MODE=1 node scripts/v4/router/smart-model-router.mjs --task=chat
                                                                       # → ollama:qwen2.5:7b
node scripts/v4/router/smart-model-router.mjs --task=route_dispatch    # → groq:gemma2-9b-it
node scripts/v4/router/smart-model-router.mjs --task=synthesis --budget=quality
                                                                       # → agent_teams: enabled
node scripts/v4/router/smart-model-router.mjs --task=architecture --budget=quality
                                                                       # → opus-4-7 xhigh effort
cargo check --bin orangebox                                            # → clean (3 dead-code warnings only)
```

All paths verified 2026-05-17.

---

## Inheritance contract

Every v6 component continues to honor:
- 27 constitutional guardrails
- Gate 0 `LatticeIntegrityGate` (LBCE)
- `FOUNDER_SALARY_PER_INSTALL_CENTS` enforced
- `runtime/node.py` sole authoritative cognitive center
- `ATOMEONS_IDENTITY_SECRET` env-only, never hardcoded
- Human Final Stop Authority reachable from any autonomous-action path

End of memo.
