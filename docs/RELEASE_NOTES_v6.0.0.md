# ORANGEBOX v6.0.0 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-RELEASE-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Native**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Headline

**No webview. No HTML. No chromium error page. Ever.**

v6.0 is the native rewrite. Single Rust binary, immediate-mode UI, native widgets, brand-perfect dark theme. The Tauri webview that broke v5.0 with `can't reach this page` is gone.

## What changed at the architecture level

| Layer | v5.2 | v6.0 |
|---|---|---|
| UI runtime | Tauri WebView2 + HTML/CSS/JS | `eframe + egui` (Rust, native) |
| Binary count | Tauri shell + sidecar | Native `orangebox.exe` + sidecar |
| Boot dependency | WebView2 chromium runtime | None — pure win32 |
| Error surface on boot fail | Edge `can't reach this page` | Win32 MessageBox via direct user32.dll FFI |
| Theme system | CSS tokens → DOM | Brand tokens compiled into egui visuals |
| Status pull | fetch + DOM diff | `ureq` HTTP + arc-mutex shared state |
| Project name binding | DOM id collision risk | Owned struct field |

## The 11 lanes

| # | Lane | v6.0 status |
|---|---|---|
| 1 | Cockpit | Native — home, status, doctrine strip |
| 2 | IDE | Native shell — "Coming in v6.1" with code editor port |
| 3 | Terminal | Native shell — Ctrl+K agent overlay landing in v6.1 |
| 4 | Trilane | Native shell — Agent Teams advisory now in router |
| 5 | Voice | Native shell — Whisper-local wires in v6.1 |
| 6 | 𝕏 Feed | Native shell — Hermes pack already in scripts/v4/hermes/ |
| 7 | Vault | Native shell — CLC lattice + retrieval wired server-side |
| 8 | Receipts | Native — proof-of-work tile grid |
| 9 | Privacy | Native — egress audit, LOCAL_MODE air-gap toggle live |
| 10 | Skils | Native — single MCP endpoint paste-block + open-link |
| 11 | Settings | Native — keys, language, a11y, cockpit pin |

## 2026 stack — what's wired

See `docs/V6_POSITION_2026_STACK.md` for full evaluation.

### ADOPT
- **Groq LPUs** — `quick_reply` task → `llama-3.3-70b-versatile` (sub-300ms first token)
- **Ollama local** — `offline_chat` task + `ORANGEBOX_LOCAL_MODE=1` runtime swap (Qwen 2.5-7B / Llama 3.2-3B)
- **Gemma-4 pre-classifier** — `route_dispatch` task, opt-in via `ORANGEBOX_ROUTE_TIER=gemma`
- **Agent Teams advisory** — synthesis tasks with Claude executor return `agent_teams.enabled = true` with `agent-teams-2026-04-01` beta header

### Carried forward from v5
- Anthropic prompt caching (multi-breakpoint, 1h TTL)
- Adaptive thinking + effort parameter
- Advisor tool wiring (Sonnet executor → Opus advisor)
- Memory tool (`memory_20250818`)
- Files API integration
- Structured outputs (`output_config.format`)
- Compaction
- MCP Connector v2

### BANK (v6.1+)
- OpenAI prompt caching (waiting on SDK breakpoint surface)
- Computer Use APIs (kill-switch + audit ledger first)
- Llama 4 Scout 10M context (retrieval-first remains better cost/quality for our case)

### REJECT (for now)
- WebRTC streaming (wrong layer for desktop cockpit)

## Compatibility

- Windows 10/11 x86_64 — primary target
- No WebView2 runtime required
- No admin rights required (NSIS `installMode: currentUser`)
- Existing v5.2 install can sit alongside v6.0; uninstall v5.2 first for clean state

## Environment toggles

| Variable | Purpose |
|---|---|
| `ORANGEBOX_BUDGET_MODE` | `strict` / `balanced` / `quality` |
| `ORANGEBOX_LOCAL_MODE` | `1` to force Ollama swap (Privacy lane air-gap) |
| `ORANGEBOX_ROUTE_TIER` | `gemma` to enable Groq Gemma pre-classifier |
| `ORANGEBOX_DATA_ROOT` | override `%APPDATA%\com.atomeons.orangebox.command` |

## Receipts

- Build receipt: `receipts/BUILD_v6.0.0.json`
- All shipped binaries SHA-256-signed
- Position memo: `docs/V6_POSITION_2026_STACK.md`

## Pricing & License

- Perpetual: $49 USD
- Replaces Claude Code / Cursor / Codex subscriptions
- Owned, not rented

End of release notes.
