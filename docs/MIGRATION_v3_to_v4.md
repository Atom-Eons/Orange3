# ORANGEBOX migration guide — v3.x → v4.x → v5.0

This guide is for operators upgrading from v1.x, v2.x, v3.x, or v4.x to **v5.0.0** (OB0X v5, launched 2026-05-17).

## Quick summary

v5.0.0 is a **free upgrade** for every prior license holder (per `LICENSE.txt` §4). Run the v5.0.0 MSI or NSIS installer — the WiX `upgradeCode` GUID handles the in-place upgrade. Your data is preserved.

---

## What's preserved during upgrade

- **Knowledge vault** (`OrangeBox-Data/memory/orangebox-knowledge-v2/`) — untouched
- **Receipts** (`OrangeBox-Data/receipts/`) — untouched
- **Party-line history** — untouched
- **DAG state** — untouched
- **API keys** (stored in env vars or system keychain) — untouched
- **Cockpit pin** (`localStorage.orangebox-cockpit-pin`) — honored

---

## What's new in v5 you should know

- **Default cockpit is now v5** (`/v4/` route). v2 McLaren HUD and classic v1.4 remain accessible via Settings → Cockpit pin.
- **New lanes**: IDE (Monaco editor), Terminal (xterm.js + agent overlay), Trilane (multi-model debate), Voice, Privacy, Receipts. See `docs/RELEASE_NOTES_v5.0.0.md`.
- **Compound intelligence doctrine**: every Claude call is augmented with vault context + mistakes ledger. Doctrine at `docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md`.
- **Hermes Agent integration** (MIT-licensed, replaces OpenClaw — OpenClaw remains supported but is now optional). Migration: `node scripts/v4/hermes/hermes-migrate-from-openclaw.mjs --dry-run` first, then `--apply`.

---

## New environment variables in v5

These are all OPTIONAL — v5 works without setting any of them. Set them to harden or customize.

| Var | Purpose | Default |
|---|---|---|
| `ORANGEBOX_DATA_ROOT` | Where vault, receipts, memory live | `<home>/OrangeBox-Data` |
| `ORANGEBOX_WORKSPACE_ROOT` | Required for `/api/v4/fs/write` to function (security) | unset → fs writes refused |
| `ORANGEBOX_TERMINAL_TOKEN` | Token for terminal WS auth | generated at server boot |
| `ORANGEBOX_BUDGET_MODE` | `strict` / `balanced` / `quality` | `balanced` |
| `ORANGEBOX_COCKPIT_IP` | Cockpit machine IP (for Codexa rail) | `127.0.0.1` |
| `ORANGEBOX_CODEXA_IP` | Codexa worker machine IP (LAN) | unset |
| `ORANGEBOX_CODEXA_DIRECT_IP` | Cat-8 direct link (optional) | unset |
| `ORANGEBOX_CODEXA_LEGACY_IP` | Wi-Fi fallback (deprecated) | unset |
| `HERMES_HOME` | Override Hermes config dir | `~/.hermes` |
| `ANTHROPIC_API_KEY` | Anthropic provider | unset → Anthropic calls fail |
| `OPENAI_API_KEY` | OpenAI provider | unset → OpenAI calls fail |
| `GOOGLE_API_KEY` | Google Gemini provider | unset → Gemini calls fail |
| `OPENROUTER_API_KEY` | OpenRouter (200+ models) | unset → OpenRouter calls fail |
| `CODEXA_CLOUD_TOKEN` | AI Box Cloud bearer token legacy alias | unset |
| `ORANGEBOX_VOICE_PORT` | Local voice server port | `8780` |
| `ORANGEBOX_MOBILE_PORT` | Mobile companion API port | `8781` |

---

## Cockpit pin migration

v5 default is the new cockpit shell at `/v4/`. To keep your previous cockpit:

```js
// Open browser DevTools on the cockpit window and run:
localStorage.setItem("orangebox-cockpit-pin", "v2");      // McLaren HUD
// OR
localStorage.setItem("orangebox-cockpit-pin", "classic"); // v1.4
// OR remove to return to v5 default:
localStorage.removeItem("orangebox-cockpit-pin");
```

Or set via Settings lane (Ctrl+0).

---

## Deprecated routes (still work in v5)

- `/v2/` — McLaren HUD cockpit (v3.x era)
- `/classic` — v1.4 amber-LED cockpit
- `/src/*` — direct static asset access

These remain available for operators who pinned them. They will be removed in v6.

---

## OpenClaw → Hermes Agent migration

v5 keeps OpenClaw working for in-flight operators. To migrate to Hermes (MIT, free):

```bash
# Check current OpenClaw status
node scripts/v4/hermes/hermes-status.mjs --json

# Dry-run the migration
node scripts/v4/hermes/hermes-migrate-from-openclaw.mjs --dry-run

# Apply (creates backup of OpenClaw config first)
node scripts/v4/hermes/hermes-migrate-from-openclaw.mjs --apply
```

The migration script tries `hermes claw migrate --preset full` first (native Hermes path) and falls back to a hand-rolled config translator if Hermes CLI isn't installed.

---

## Rollback to v4 or earlier

If v5 introduces a regression in your workflow:

1. Uninstall v5 from Windows Settings → Apps.
2. Download the prior MSI from the GitHub release archive (v4.0.0 or v3.2.1).
3. Reinstall.
4. Data root is preserved across versions.

**Note:** Once v5 is installed, WiX may reject downgrade installs. Email a.mccree@gmail.com with subject "ORANGEBOX rollback" for assistance.

---

## New lanes — what they do

Open with Ctrl+1..0:

| Shortcut | Lane | Doctrine |
|---|---|---|
| Ctrl+1 | Cockpit (home) | tiles + party-line + Now panel |
| Ctrl+2 | IDE | Monaco + AI inline edit + multi-file Composer |
| Ctrl+3 | Terminal | xterm.js + Ctrl+K agent overlay |
| Ctrl+4 | Trilane | Claude + GPT + Gemini parallel debate |
| Ctrl+5 | Voice | Whisper.cpp local transcribe → agent code-gen |
| Ctrl+6 | Vault | knowledge graph (v5.1 interactive) |
| Ctrl+7 | Receipts | virtualized browser, shareable HTML export |
| Ctrl+8 | Privacy | egress audit + air-gap mode |
| Ctrl+9 | Skills | marketplace (v5.1 public registry) |
| Ctrl+0 | Settings | cockpit pin + keys + privacy |

---

## Doctrine references

- `docs/V4_MOAT_DOCTRINE.md` — strategic anchor
- `docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md` — full Anthropic-docs alpha doctrine
- `docs/RELEASE_NOTES_v5.0.0.md` — v5 launch notes
- `docs/RELEASE_NOTES_v4.0.0.md` — v4 (still in v5 bundle)
- `docs/CODEXA_WORKER_RAIL.md` — worker rail wire-up
- `docs/REFUND_RUNBOOK.md` — operator-internal refund procedure

---

*v5 was built through v4. v4 was built through v3. Every version compounds.*
