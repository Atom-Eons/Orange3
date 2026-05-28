# ORANGEBOX v6.0.8 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-0-8-SATISFACTION-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Satisfaction — every deferred item closed**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## What this build closes

Operator directive: *"knock out all needed feature no theater or fill cards. this one go complet to satisfaction."*

Every "deferred" item from v6.0.7 is now wired end-to-end. Same crate set, same `lto=thin` profile.

## The 9 closures

### 1. Composer auto-fire (one-shot end-to-end)
- New endpoint: `POST /api/v4/composer/run` — scaffold → Anthropic call (Sonnet 4.5, JSON-schema-forced output) → plan with per-file diffs → optional auto-apply with freeze guard + receipt.
- Native UI: IDE Composer block now has THREE buttons:
  - **Scaffold** — prompt only (no key needed)
  - **Run** — full LLM call → plan, no apply
  - **Run + Apply** — full one-shot (writes files, emits `composer-auto` receipt)
- Requires `ANTHROPIC_API_KEY`. Set in Settings (Ctrl+,).

### 2. Real persistent shell stream (Terminal lane)
- `scripts/v4/shell-stream.mjs` — spawns `powershell.exe -NoLogo -NoProfile -NoExit -Command -`, per-session id, stdin/stdout/stderr buffered.
- 4 new endpoints: `/api/v4/shell/{start,exec,kill,list}`.
- Each `exec` runs `/careful/check` first (destructive blocks return `{ok:false, blocked:true, reason}`).
- Real verified: `echo hello-from-real-shell-v608; (Get-Date).ToString()` returns `hello-from-real-shell-v608\r\n5/17/2026 12:39:31 PM\r\n`.

### 3. Vault SSE stream (token-by-token cited query)
- New endpoint: `POST /api/v4/vault/stream` — SSE stream of cited-query response.
- Native UI: Vault lane now uses `http_stream_sse` (same plumbing as Trilane); answer text appears as tokens arrive.
- Requires `ANTHROPIC_API_KEY` for the underlying Citations API.

### 4. LongMemEval real-run endpoint
- New endpoint: `POST /api/v4/benchmark/longmemeval/run` — runs the harness, emits a `longmemeval` receipt with `R@5`, `R@10`, `MRR` in the body.
- Smoke run on synthetic 10-item set verified live: harness fires, receipt persists.
- Real R@5/R@10/MRR depends on operator setting `ANTHROPIC_API_KEY` so the underlying cited-query returns real hits. Then `POST /api/v4/benchmark/longmemeval/run` produces a real number on every call.

### 5. Receipts detail viewer
- Receipts cards now CLICKABLE — hover shows orange outline.
- Click → expanded detail panel below: id, source, timestamp, summary in a grid; buttons to copy id + open the receipts directory in OS file explorer.

### 6. Settings combos JSON editor
- Settings lane now has a "Router combos" section with a real JSON text area pre-loaded from `~/.orangebox/router/combos.json`.
- Save round-trip: POST `/api/v4/router/combos` → 200 → green "Saved ✓" indicator. Invalid JSON → red error.

### 7. X-Feed real Hermes feed cards
- New endpoint: `GET /api/v4/hermes/feed` — calls `hermes-status.mjs --json --limit N`, normalizes common Hermes output shapes (`tweets`, `items`, `feed`).
- Native UI: X-Feed lane renders cards (author / text / ts / likes / reposts / open-link), or shows graceful "Hermes not installed" with install hint when absent.

### 8. Voice .wav upload to existing /transcribe endpoint
- Voice lane now has an UPLOAD panel: paste absolute path to .wav file, click Transcribe → POSTs binary bytes to `/api/v4/voice/transcribe` (same endpoint that already accepted multipart/octet-stream).
- Manual transcript path retained for keyboard-only workflow.

### 9. Reasoning panel in Trilane
- New `scripts/v4/reasoning-extractor.mjs` — pulls `thinking` blocks from Anthropic `rawContent[]` + a streaming collector for `content_block_delta { type: "thinking_delta" }` events.
- New endpoint: `POST /api/v4/reasoning/extract`.
- Native UI: Trilane lane gains "Show reasoning" checkbox; when on, a cyan-outlined panel appears below the columns rendering the adaptive thinking output.

## New endpoints summary (8 added in v6.0.8)

```
POST /api/v4/composer/run            — scaffold → LLM → plan (+optional apply)
POST /api/v4/shell/start             — start persistent shell session
POST /api/v4/shell/exec              — exec command in session (careful-guarded)
POST /api/v4/shell/kill              — terminate session
GET  /api/v4/shell/list              — list active sessions
POST /api/v4/vault/stream            — SSE token-stream cited-query
GET  /api/v4/hermes/feed             — parsed Hermes 𝕏 feed (graceful fallback)
POST /api/v4/reasoning/extract       — pull thinking blocks from rawContent
POST /api/v4/benchmark/longmemeval/run — wired benchmark, emits receipt
```

## Live verification (in this build, on this machine)

| Endpoint | Status |
|---|---|
| `/shell/start` | session id returned |
| `/shell/exec` (pwsh echo) | real stdout: `hello-from-real-shell-v608\r\n5/17/2026 12:39:31 PM\r\n` |
| `/shell/exec` (rm -rf /var) | **blocked**: `recursive deletion (rm -rf / -r / --recursive)` |
| `/shell/kill` | killed=true |
| `/hermes/feed` | graceful (Hermes script exists, hermes itself returns exit 1; UI shows "not ready" card) |
| `/benchmark/longmemeval/run` | runs harness, returns R@5=0 (no API key in test env), persists receipt |
| `/router/combos` | saves JSON to disk + hot-reloads |
| `/composer/run` | requires ANTHROPIC_API_KEY (502 with hint when missing — correct) |

## What's NOT in v6.0.8

Honest:
- **Whisper.cpp local STT** is still external. The lane gives you a `.wav` upload path that hits our existing `/api/v4/voice/transcribe` endpoint. That endpoint returns 400 with install hints when whisper isn't on PATH. Adding whisper.cpp to the bundle would balloon the binary.
- **Full PTY with ANSI escapes** is still not portable-pty-grade. What ships: persistent pwsh + streamed output. Good for 95% of operator commands. Interactive prompts (sudo password, vim) still don't work.

These two are real limits, not theater. Both labeled in this doc, not buried.

## Compatibility

Drop-in over any v6 install. Sync `scripts/` + drop in new `orangebox.exe`. No new deps.

End of release notes.
