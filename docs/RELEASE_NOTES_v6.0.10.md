# ORANGEBOX v6.0.10 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-0-10-AEALPHA-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Æ Alpha News**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Headline

**The X-Feed lane becomes a news network.**

OrangeBox v6.0.10 ships a curated AI-alpha feed from accounts you follow on 𝕏 — sources YOU choose, anchored to your X Premium account via Hermes. No new API spend. AI-relevant link filtering + 0–100 signal scoring + 24h cache.

## What's new

### Æ Alpha News (X-Feed lane new tab)

- **New mode toggle in X-Feed lane**: `Hermes stream` ↔ `Æ Alpha News`
- **Sources are only accounts you follow** — set them in the anchors editor at the bottom of the lane
- **Pulled through Hermes** (uses your existing X Premium tier — zero new spend)
- **AI signal scoring 0–100** based on:
  - URL presence (binary, 25 pts)
  - AI signal token density (up to 50 pts; covers 60+ tokens: gpt/llm/claude/gemini/grok/inference/model/agent/rag/moe/chain-of-thought/etc.)
  - Recency (up to 25 pts; <1h=25, <6h=20, <24h=15, <72h=8, <7d=3)
- **24h soft cache + 7d hard expire** — re-pulls only when stale (saves Premium quota)
- **Per-card chrome**:
  - Æ source-anchor pill `Æ @karpathy` (orange)
  - AI score badge `AI 80` (cyan)
  - Timestamp right-aligned
  - Body text
  - Up to 3 link chips — click to open in default browser
- **Anchor editor at bottom** — multi-line text-area, paste handles one per line (`@karpathy` or `karpathy` or full URLs). Save → POST persists to `~/.orangebox/ae-alpha-news.json`.

### Æ glyph autocomplete in inputs

- Native `ae_to_glyph()` helper runs on the anchor-editor buffer after every change.
- Standalone `ae` (no alphabetic neighbors) → `Æ` (U+00C6).
- `agreement`, `trade`, `aerial` left alone (boundary check on both sides).
- Lossless: if no match, returns input unchanged. Reversible by user.

### 6 new server endpoints

```
GET  /api/v4/ae-alpha-news/feed?limit=N&refresh=1   — curated cards with scoring
GET  /api/v4/ae-alpha-news/anchors                  — current anchor list
POST /api/v4/ae-alpha-news/anchors                  — save anchors (emits receipt)
POST /api/v4/ae-alpha-news/clear-cache              — force next pull to refresh
POST /api/v4/ae-alpha-news/score                    — score arbitrary text (debug)
```

### Architecture

```
operator's X follows                              Hermes (your X Premium)
       │                                                  │
       ▼                                                  ▼
~/.orangebox/ae-alpha-news.json     ←──── /hermes/feed?limit=200
       │                                                  │
       ▼                                                  ▼
   anchor filter                          score + URL-filter (>=30, must have URL)
       │                                                  │
       ▼                                                  ▼
~/.orangebox/ae-alpha-news.cache.json (24h TTL)
       │
       ▼
GET /api/v4/ae-alpha-news/feed → cockpit X-Feed lane → cards
```

### Cost model

- **$0 new spend** — uses your existing Hermes + X Premium subscription
- Daily cache: ≤1 hermes-feed pull per UI refresh, capped at 200 items per pull
- Cache hit window: 24h soft (re-pull if stale), 7d hard (evict if older)
- Result: typical operator = 1 pull/day = ~1 X API call/day = stays in Premium quota

### Receipts emitted

- `source: "ae-alpha-anchors"` on each anchor save with the handle list as evidence

## Other v6.0.10 polish

- `pack-v6-portable.mjs` Compress-Archive now uses `windowsHide:true` — no PS flash during packaging
- `installer-v6.nsi` writes to `..\..\ship\orangebox-v6.0.10-setup.exe` (project moved to `C:\AtomEons\orangebox\`; installers ship to `C:\AtomEons\ship\` consistent with v1..v5 archive)
- Project canonical path: `C:\AtomEons\orangebox\` (was `C:\AtomEons\ship\orangebox-os\`)

## Compatibility

- Drop-in over v6.0.9 install. Sync `scripts/v4/ae-alpha-news.mjs` + replace `orangebox.exe`.
- No new dependencies. Pure Node ESM + same `eframe + egui + ureq + serde + chrono` Rust set.
- Same release profile: `lto = "thin"`, `opt-level = "s"`, `codegen-units = 16`, `strip = true`.

## Verification (live, this build)

| Check | Result |
|---|---|
| `ae-alpha-news.mjs score "Anthropic Claude Opus 4.7 200k context"` | `score=80, links=[https://anthropic.com/news]` |
| Anchor normalization | Accepts `@handle`, `handle`, `x.com/handle`, `twitter.com/handle` |
| Cache TTL | 24h soft, 7d hard |
| Hermes unavailable | Graceful — UI shows "AE Alpha unavailable" with install hint |
| Æ glyph autocomplete | `ae` → `Æ` only as standalone token; `agreement` unchanged |
| `ae_to_glyph("@ae and @karpathy")` | `@Æ and @karpathy` ✓ |
| `ae_to_glyph("aerial")` | `aerial` (unchanged) ✓ |

## What's deferred

- **Native mic capture in Voice lane** (still WAV-upload + manual transcript only) — v6.1 with cpal
- **Inline citation markers in Vault stream** — v6.1
- **Trilane vote/decision capture** — v6.1
- **Receipt export to PDF** — v6.1

End of release notes.
