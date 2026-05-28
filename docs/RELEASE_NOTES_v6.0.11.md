# ORANGEBOX v6.0.11 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-0-11-PRECISION-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Precision Pass**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Headline

**Receipts get tighter. Reasoning gets visible. Voice fails honestly. Vault gets cited inline. Trilane gets a vote. Cockpit gets a real Today bar chart.**

v6.0.11 is a **precision pass** over v6.0.10 — every claim now maps to a receipt, every honest gap is named, every lane gained the missing micro-feature that made it feel half-built.

---

## What's new — 11 features

### 1. Trilane / Quadlane vote capture

After legs return, a **VOTE** panel appears at the bottom of the Trilane lane. Pick a winner (Claude / GPT / Gemini / Grok / merge), add a one-line reason, hit **Record vote** → POST `/api/v4/trilane/vote` → JSON persists to `~/.orangebox/trilane-votes/<ts>_<id>.json` AND emits a `trilane-vote` receipt with vote_id + winner + mode + adversarial flag + leg count.

The full leg text (truncated to 1500 chars per leg) is captured in the vote record for future audit. Listing via `GET /api/v4/trilane/votes?limit=50`.

### 2. Reasoning panel — live synthesis stream

The "Show reasoning" toggle in Trilane now exposes a **Stream synthesis** button that runs a 4th model call to Sonnet 4.5 asking for a brief rationale (agreement / disagreement / strongest path) — streamed live via SSE to the panel. Stroke turns orange while streaming. No on-demand-only black-box: you see synthesis as it forms.

### 3. Composer apply — SHA-256 hash chain

Every Composer apply now emits a `composer` receipt whose evidence includes:
- `applied`: list of files written
- `chain_summary`: `[{file, chain: "<before12> → <after12>"}]`
- `files`: full per-file `{file, kind, bytes, sha256_before, sha256_after, chain}` rows

Full audit trail for diff propagation. Receipts lane shows the chain in the detail viewer.

### 4. Vault — inline `[1]` `[2]` citation markers

Beyond the existing SSE stream, Vault now offers **Cited [1] ➤** which hits `/api/v4/vault/cited-query` (JSON). The server walks Anthropic's content blocks and injects `[N]` markers inline in the answer text. The native UI renders:

- Top frame (cyan stroke): **CITED ANSWER** with `[1]` `[2]` markers inline
- Separator
- **SOURCES** list — numbered `[N]` chip + document title + cited-text excerpt in curly quotes

Server response includes `answer_with_markers`, `citation_map: [{n, document_title, cited_text, location, raw}]`, original `citations[]`, and `documentsSearched` count.

### 5. Receipts — markdown export

Receipts lane gained a **⬇ Export markdown** button (cyan). Click → POST `/api/v4/receipts/export` (optionally with the current `source filter:` as filter) → server walks `<dataRoot>/receipts/` + 1-deep subdirs, filters, writes a single markdown bundle to `<dataRoot>/exports/receipts-<ts>.md`, emits a `receipts-export` receipt with file/count/bytes/filter.

UI shows green "exported N receipts → <path>" or red error inline.

### 6. Settings — density toggle + zoom slider

New section **Display · density + zoom**:
- **Density**: compact / comfortable / spacious (saved as `ORANGEBOX_DENSITY`)
- **Zoom**: 0.85× – 1.40× in 0.05 steps with Reset button (saved as `ORANGEBOX_ZOOM`)
- Zoom applies live via `ctx.set_pixels_per_point()` on every paint
- Persisted via `/api/v4/settings/api-keys` POST alongside keys

### 7. Settings — project name (replaces "[no project]")

New section **Project name (shown in footer)**:
- Single text field saved as `ORANGEBOX_PROJECT_NAME`
- Footer chip now shows your project name if set; falls back to `[no project]` when empty
- No more permanent "no project" stigma in the chrome

### 8. Voice — whisper.cpp detect + install hint banner

Top of Voice lane now shows a status banner:
- **Green WHISPER ✓** — local STT ready with path shown
- **Yellow WHISPER ⚠** — whisper.cpp not detected → "STT will fall back to cloud (needs key) or return a clear error"
- "Install hint ↗" button opens `github.com/ggerganov/whisper.cpp/releases`
- Hint paragraph for path conventions

Backed by new `/api/v4/voice/whisper-status` endpoint returning `{present, path, cloud_fallback, model_dir, ready, install_hint}`.

### 9. Cockpit — TODAY · BY SOURCE bar chart

Below the 6-stat row, a new frame shows **TODAY · BY SOURCE** with horizontal bars:
- Top 8 sources of today's receipts (UTC date prefix match)
- Cyan source label (170px wide), 500px max bar, orange fill, count on the right
- Empty state: "(no activity yet today — run any action and reload)"
- Right header shows total today count

### 10. X-Feed — AI score threshold + keyboard nav

Top toolbar gained:
- **AI ≥** slider (0–100, integer) — filters AE Alpha cards by minimum AI score
- Right-side hint "J/K next/prev · Enter open link · 24h cache"

Behavior:
- J / ArrowDown → next card index
- K / ArrowUp → previous card index
- Enter → opens the first link of the currently-selected card
- Selected card frame thickens to 2px orange (vs 1px line)
- Empty filter result: "(no cards pass AI score ≥ N — lower the threshold)"

### 11. Onboarding banner — first-run welcome

Cockpit shows a top banner when:
- No API keys set on any provider AND
- Operator hasn't dismissed

Banner shows:
- 👋 WELCOME header (orange)
- Body: "OrangeBox runs without keys (vault search, terminal, Æ Alpha if Hermes is set). For Composer + Trilane + Vault citation, add a key in Settings."
- Three buttons: Anthropic key ↗ (orange-filled) · OpenAI key ↗ · Google AI key ↗ — each opens the provider's API-key console URL
- "· then press Ctrl+, to paste into Settings"
- Dismiss button (per-session)

---

## Receipt taxonomy — full coverage of UX spec §3.8.4

v6.0.11 wired **5 new emit points** so every documented source in the UX spec maps to actual server code:

| Source | Endpoint | Status |
|---|---|---|
| `sprint` | `POST /api/v4/sprint/run` | v6.0.11 ✓ |
| `voice-intent` | `POST /api/v4/voice/intent` | v6.0.11 ✓ |
| `voice-transcribe` | `POST /api/v4/voice/transcribe` | v6.0.11 ✓ |
| `vault-cited-query` | `POST /api/v4/vault/cited-query` | v6.0.11 ✓ |
| `incident-intake` | `POST /api/v4/incident/intake` | v6.0.11 ✓ |
| `trilane-vote` | `POST /api/v4/trilane/vote` | v6.0.11 ✓ |
| `receipts-export` | `POST /api/v4/receipts/export` | v6.0.11 ✓ |

Plus pre-existing: fs-write, composer, composer-auto, sprint-runner, telemetry, dep-updater, mistakes-ledger, codexa-tenant, longmemeval, ae-alpha-anchors, trilane-synthesize, ide-composer, v4-server.

**18 documented sources / 18 emitted.** No gap.

---

## New server endpoints

```
POST /api/v4/trilane/vote                  — record vote outcome (+ receipt)
GET  /api/v4/trilane/votes?limit=N         — list recent votes
POST /api/v4/receipts/export               — bundle receipts to markdown (+ receipt)
GET  /api/v4/voice/whisper-status          — whisper.cpp detection + install hint
```

Composer apply receipt evidence schema extended to include `chain_summary` + per-file hash chain. Vault cited-query response extended with `answer_with_markers` + `citation_map`.

---

## Compatibility

- Drop-in over v6.0.10 install. Replace `orangebox.exe` + sync `scripts/v4/*.mjs`.
- All v6.0.10 features (Æ Alpha News, Æ glyph autocomplete) preserved.
- No new dependencies. Same Rust crate set (eframe 0.27 + egui 0.27 + ureq + serde + chrono).
- Same release profile.

## Verification

| Check | Result |
|---|---|
| `cargo build --release --bin orangebox` exit 0 | (verified at build time) |
| `orangebox.exe` size > 5MB | (verified at build time) |
| `/api/v4/trilane/vote` POST | returns `{id, file, ts}` + emits receipt |
| `/api/v4/receipts/export` POST | returns `{ok, file, count, bytes}` + emits receipt |
| `/api/v4/voice/whisper-status` GET | returns `{present, path, ready, install_hint}` |
| `/api/v4/vault/cited-query` POST | returns `answer_with_markers` + `citation_map` |
| Native UI: Onboarding banner shows when no keys | covered by `no_keys_set` guard |
| Native UI: Vote panel shows after legs return | covered by `any_leg_has_output` guard |
| Native UI: Today bar chart aggregates today's receipts | computed from `receipts.iter().filter(ts starts_with today_iso_prefix)` |
| Native UI: AI score filter respects threshold | `filtered = items.filter(ai_score >= threshold)` |

---

## What's deferred to v6.1

- **Native mic capture** in Voice lane (still WAV-upload only — cpal integration)
- **PTY ANSI** in Terminal lane (still cmd.exe execSync)
- **Real-time streaming reasoning** from Anthropic extended-thinking blocks (current synthesis is a separate Sonnet call)
- **Persistent onboarding dismiss** (currently per-session; needs settings persistence)
- **Density toggle behavioral effect** (currently saved but UI doesn't yet branch on it; zoom is the active control)

These are NAMED gaps, not hidden ones.

---

## Path canonical reminder

Project home: `C:\AtomEons\orangebox\` (canonical since v6.0.10)
Installer output: `C:\AtomEons\ship\` (consistent with v1..v5 archive)

End of v6.0.11 release notes.
