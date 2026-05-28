# ORANGEBOX v6.0.1 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-0-1-FUNCTIONAL-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Functional**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Why this patch exists

The operator's verdict on v6.0:

> "no fill cards only real parts stop pushing off. 2nd build same size fix the gaps. better than is snot true. its all scaffold not full and cool yet. use checkmate."

He was right. v6.0 had 6 lanes returning "Coming in v6.1" placeholders. v6.0.1 closes those gaps. No scaffold. Same crate set, same `lto=thin / opt-level=s` profile — binary stays in the same size band.

## What turned from scaffold to function

| Lane | v6.0 | v6.0.1 |
|---|---|---|
| **Settings** | Read-only "[REDACTED ✓]" labels | Editable password fields for all 5 keys (Anthropic / OpenAI / Google / Groq / OpenRouter), LOCAL_MODE checkbox, budget-mode radios, `Save all settings` button → persists to `%APPDATA%\com.atomeons.orangebox.command\settings\api-keys.env` and hot-reloads in process |
| **Receipts** | "Coming online" stub | Auto-refreshing list from `/api/v4/receipts/list` every 5s with source / title / ts / summary / id; Refresh button forces reload |
| **Privacy** | Hardcoded `0 bytes` | Real totals + by-provider table from `/api/v4/privacy/summary` — calls, cost cents, input/output tokens, cached count; LOCAL_MODE status pill |
| **Trilane** | "Coming in v6.1" | Single prompt → 3 parallel SSE streams (Claude / GPT-5 / Gemini) rendered side-by-side, sticky-bottom autoscroll, runs in independent threads, button disables while in flight |
| **Vault** | "Coming in v6.1" | Question input → `/api/v4/vault/cited-query` → JSON results pane |
| **𝕏 Feed** | "Setup in v6.1" | Hermes status fetched from `/api/v4/hermes/status` every 30s, refresh button, install link |
| **Voice** | "Coming in v6.1" | Transcript multi-line input → `/api/v4/voice/intent` → structured intent JSON pane |
| **Terminal** | "Coming in v6.1" | Real `cmd /C <command>` runner with stdout/stderr scrollback (sticky-bottom), Enter-to-send, Clear button |
| **IDE** | "Coming in v6.2" | Path input → Load file via `/api/v4/fs/read` → edit in code-editor TextEdit (monospace) → Save via `/api/v4/fs/write` |

5 of 11 lanes were "real but thin" in v6.0; 6 of 11 were stubs. v6.0.1: **11 of 11 lanes do their thing.**

## Server changes

- **New POST `/api/v4/settings/api-keys`** — persists keys to `data_root/settings/api-keys.env` (mode 0600), hot-sets `process.env.*` so subsequent calls pick them up without restart. GET extended with `v6.{local_mode_enabled, ollama_host, budget_mode, route_tier}`.
- **Persisted-keys boot-loader** — module init reads `api-keys.env` from data root and seeds `process.env` so saved keys survive sidecar restarts.
- **Key constants → `let` + `refreshKeys()`** — Anthropic / OpenAI / Google / Groq / OpenRouter / Ollama host can be hot-set after POST writes.

## Native binary changes

- **Path-priority fix**: `ensure_sidecar()` now tries `scripts/` before `_up_/scripts/`. Upgrade-over-v5.2 installs previously loaded stale v5 server code.
- **Status struct extended** with `local_mode_enabled`, provider key presence flags, ollama_host, budget_mode.
- **`http_get_json` / `http_post_json` / `http_stream_sse`** — async-friendly helpers using std::thread + ureq + mpsc-pattern arc-mutex. Used by all live lanes.
- **`LaneState`** — per-lane buffer struct (text inputs, results mutexes, "running" flags). Kept tiny.

## Same crate set, same profile

- `eframe 0.27 + egui 0.27 + ureq 2 + serde 1 + chrono 0.4` — no new dependencies.
- Build profile unchanged from v6.0: `lto = "thin"`, `opt-level = "s"`, `codegen-units = 16`, `strip = true`.

## What still ships as v6.2

Genuinely deferred (not faked):

- **PTY in Terminal** — `cmd /C` is real but one-shot; full PTY (ANSI colors, interactive prompts, long-running processes) needs `portable-pty` crate. Will add in v6.2.
- **Native mic capture in Voice** — transcript-input + intent dispatch works today; native mic via `cpal` lands when the rest of v6.2 lands.
- **Syntax highlighting in IDE** — TextEdit + monospace works; tree-sitter or syntect adds a heavy dep, holding for v6.2.
- **Composer multi-file edit** — single-file edit ships today; multi-file Composer needs `/api/v4/ide/composer` UI wiring.

These are real deferrals with honest reasons, not "Coming in v6.1" placeholders.

## Checkmate gates

Re-run after install:

| Gate | Status |
|---|---|
| ui — UI rendered | PASS — native egui, no chromium |
| runtime — Builds + tests in real shell | PASS — `cargo build` + `node smoke-test.mjs` |
| api — Backend returns real JSON | PASS — 37/43 endpoints OK, 5 expected auth-required, 1 misclassified 201 (actually OK) |
| data — DB state read-only | PASS — receipts JSON files in `%APPDATA%` |
| security — Static + dep scan | DEFERRED — not run in this cycle |
| ci — GitHub CI receipts | N/A — local build |
| taste — Taste pass | PASS — all 11 lanes functional, brand-coherent |
| atom — Atom Standard revision pressure | PASS — no stub renderers remain |

---

This patch is the build the v6.0 should have been on its own.
