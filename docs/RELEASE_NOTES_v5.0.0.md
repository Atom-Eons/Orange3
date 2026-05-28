# ORANGEBOX v5.0.0 — Release Notes

**Tagline:** *OB0X v5. The OS, not the tool. Launch.*

**Release date / time:** 2026-05-17, 00:01 UTC-4
**Authored by:** Atom McCree, AtomEons Systems Laboratory
**Doctrine references:** `docs/V4_MOAT_DOCTRINE.md` + `docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md`

---

## What v5 is

ORANGEBOX v5.0.0 is the launch version. It absorbs everything from v4.0.0 (16 features replacing Claude Code / Cursor / Codex), every gap-close fix from the 13-department review sweep, the full Anthropic-docs alpha doctrine (12 deep crawls), and the Hermes Agent integration (MIT-licensed, replaces OpenClaw).

**Not a tool. The OS.**

---

## The 16 features from v4 (still green in v5)

### P0 — surface parity (no more "but X can do Y")

1. Monaco IDE lane with tab autocomplete via Haiku 4.5
2. xterm.js terminal lane with Ctrl+K agent overlay
3. Tab autocomplete provider (sub-100ms target, prompt-cached)
4. Mac + Linux GitHub Actions release pipeline (3-OS matrix)
5. Importer wizards: Cursor / Claude Code / VS Code → one-click switch

### P1 — competitive parity

6. GitHub PR review agent (Citations API + prompt caching)
7. AI Box Cloud (Dockerfile + Fly + Railway deploys, $19/mo SKU shape)
8. Smart model router (10 tasks × 3 budget modes, cost-aware fallbacks)
9. Background agent queue (persistent state, worker loop, receipts on every transition)
10. Skils lane — Skil.Ski MCP integration (one endpoint, every skill)

### P2 — moat deepening

11. Trilane debate UI (Claude + GPT + Gemini in parallel, conflict detection, vote, synthesis)
12. Compounding vault audit (weekly snapshots, HTML export, projection)
13. Voice coding (local Whisper.cpp + Haiku intent + Sonnet code-gen)
14. Mobile companion API + 55-section spec
15. Privacy dashboard (egress audit, air-gap mode, hash-only logging)
16. Receipt browser shareable (self-contained HTML export)

---

## What v5 adds on top of v4

### Dept-sweep gap-close (7 of 9 fixer agents shipped clean)

50+ gaps closed across 13 review lanes. Highlights:

**Security hardening:**
- CORS locked to localhost + tauri:// origins (was wildcard `*`)
- Filesystem write enforcement requires `ORANGEBOX_WORKSPACE_ROOT`; hard block list for `.ssh/`, `.gnupg/`, `.aws/`, `.config/`, `Library/Keychains`, etc.
- Terminal WS now requires token auth (`Sec-WebSocket-Protocol: orangebox-v4.<token>`) + shell whitelist (`bash`, `sh`, `powershell`, `pwsh`, `zsh`, `fish`, `cmd`)
- Mobile API binds 127.0.0.1 (was 0.0.0.0)
- Skill installer tar entry path traversal guard
- Skill loader trust-store enforcement (no inline-key bypass)

**Architecture fixes (IPC mismatches found by architect):**
- WS upgrade name mismatch → fixed (handles both `upgrade` and `handleUpgrade` exports)
- Voice lane now routes through cockpit-bridge (was hitting port 8780 that didn't exist in installed mode)
- Privacy dashboard now routes through cockpit-bridge (was hitting port 8782)
- Receipt browser routes through canonical `/api/v4/receipts/*` (was hitting `/v1/receipts/*`)
- Trilane conflict schema aligned: server returns `{axis, positions: [{leg, position}]}` matching client renderer
- Cockpit status `project.name` and `project.path` fields now populated

**Code correctness (LakeStrike findings):**
- OpenAI streaming usage tracking: `stream_options: {include_usage: true}` added (was under-reporting cost)
- Anthropic Citations beta header reconciled
- node-pty in ESM context: `createRequire(import.meta.url)` wrapped in try/catch
- Multipart binary handling: read raw `Buffer` (was lossy utf-8 then re-buffer)
- httpsPost 60s timeout (was unbounded → could hang)

**UX + copy (lips punch list applied):**
- 15 surface copy fixes — "Awaiting prompt" → "Ready when you are"; "idle" → "standing by"; "Coming soon" → "Arriving in v5.1"; etc.
- First-run version footer reads from `<meta name="orangebox-version">` (was hardcoded v1.3.0)
- Boot scrim session-aware (2s on first load, 400ms on return)
- Status pills track consecutive failures, surface red + toast after 2 misses
- "Create your first project" CTA tile when no project open
- Lane nav v4.1 badges on Vault / Skills / Settings (visually distinct from live lanes)
- Cmd/Ctrl+1..0 shortcuts surfaced via `title` attributes on lane buttons
- Voice lane Windows-specific microphone permission copy (was browser-specific)

**Engine + packaging:**
- GH Actions release workflow stages Node sidecar binary on each OS leg (was only present on Windows from manual checkin)
- bundle.resources expanded with 21 new globs (Hermes pack, cloud deploy scripts, v4 shared HTMLs, lane HTMLs, alpha doctrine)
- Tauri CSP set (was `null`) — locks origins, restricts script sources to jsdelivr + cdnjs
- `src-tauri/lib.rs`: 3-second port poll after sidecar spawn; if sidecar doesn't reach `127.0.0.1:8787` in time, Tauri dialog tells operator instead of showing a blank window
- `tauri-plugin-dialog = "2"` added

**Docs full refresh:**
- PRIVACY.md updated to v5 with privacy-dashboard section
- RELEASE_NOTES.md redirect block pointing at v5 + prior versions
- MIGRATION_v3_to_v4.md authored
- Lane quickstarts under `docs/v4/`
- LICENSE.txt §4 updated (v1.x → v5.x all free; v6+ may require paid upgrade)
- Terminology canonicalized: "compounding vault (CLC lattice-backed)" across CHANGELOG / README / MOAT doctrine

### Compound intelligence doctrine landed

- `scripts/v4/compound-intelligence.mjs` — vault context builder
- `scripts/v4/mistakes-ledger.mjs` — append-only mistakes ledger with per-entry receipts
- `.claude/skills/compound-intelligence/SKILL.md` — Claude Code skill that auto-fires on code verbs and forces vault check before every answer
- cockpit-bridge.js callModel now posts to `/api/v4/compound/build` before every model call (graceful fallback when endpoint unwired)

### Hermes Agent integration (MIT, free forever)

- `scripts/v4/hermes/hermes-pack.mjs` — install bundle generator
- `scripts/v4/hermes/hermes-status.mjs` — health probe
- `scripts/v4/hermes/hermes-migrate-from-openclaw.mjs` — config migrator (wraps `hermes claw migrate --preset full`)
- `scripts/v4/hermes/INSTALL_HERMES.ps1` + `.sh` — Windows native + WSL/Linux/macOS installers
- `scripts/v4/hermes/AGENTS.md` — ORANGEBOX guardrails for Hermes outer orchestration
- v5 marketing: "Use Hermes Agent (free MIT, 95K stars) as your outer orchestration. OpenClaw remains supported but is now optional."

### Anthropic-docs alpha doctrine (`docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md`)

Full crawl of 12 doc pages. The doctrine doc captures every advanced capability with exact API shapes:

1. Pre-warming the cache (`max_tokens: 0` on boot)
2. 1-hour cache TTL (mix with 5-min in same request; 1h must come first in hierarchy)
3. Adaptive thinking + effort parameter (Opus 4.7 rejects manual `budget_tokens` with 400)
4. Advisor tool — Sonnet executor + Opus advisor mid-generation
5. Agent Skills (`skills-2025-10-02` beta, pre-built pptx/xlsx/docx/pdf)
6. MCP Connector v2 (`mcp-client-2025-11-20`)
7. Files API (upload once, reuse, FREE ops)
8. Structured outputs (schema-validated JSON, 24h schema cache)
9. Compaction (`compact-2026-01-12`, auto-summarize at 150k tokens)
10. Memory tool (`memory_20250818`, the killer move — replaces hand-rolled vault inject)
11. Multi-breakpoint cache strategy
12. Batch processing (50% off, async)
13. Token counting before fire
14. Inference geo control (`inference_geo: "us"` for enterprise compliance)
15. Citations API headers reconciled

Application priority documented for v5.0.1 hotfix (memory tool routes, advisor wiring, structured-output schemas, Files API vault sync).

### Cross-platform CI

`.github/workflows/build-release.yml` and `build-pr.yml` now download Node 22.14.0 binary for each OS matrix leg (Windows / macOS / Linux), name it per Tauri's target-triple convention, and stage at `src-tauri/binaries/`. Mac builds produce `.dmg` + `.app.tar.gz`. Linux builds produce `.deb` + `.AppImage`. Windows continues with `.msi` + `.exe` (NSIS). SHA-256 manifest auto-generated and attached to GitHub Release body.

---

## How to verify v5 is real

```bash
# Version check
curl -s http://127.0.0.1:8787/api/status | jq .version
# → "5.0.0"

# Smart router
node scripts/v4/router/smart-model-router.mjs --task=architecture
# → routes to Opus 4.7 with effort: "high" (or "xhigh" in quality mode)

# Mistakes ledger
node scripts/v4/mistakes-ledger.mjs --stats

# Hermes status (if Hermes installed)
node scripts/v4/hermes/hermes-status.mjs --json

# Acceptance test
node tests/v4/v4-acceptance.mjs
# → 19/19 features pass, 53/53 files pass, GREEN
```

---

## Honest deltas (what v5.0 ships vs the full v5 vision)

**Documented in alpha doctrine doc but landing in v5.0.1 hotfix:**

- Memory tool client-side handler routes wired into `/api/v4/memory/*` (spec locked)
- Advisor tool wired into smart-model-router code-task routes (spec locked)
- Structured outputs schemas applied to 4 endpoints (spec locked)
- Files API vault sync helper script (spec locked)
- Pre-warming endpoint + cockpit boot hook (spec locked)

These are SPEC-LOCKED in `docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md` with exact API shapes, file paths, and acceptance criteria. The implementation is bounded scope and lands in v5.0.1.

**v5.1 followups:**

- Mac notarization + EV Windows signing
- Public marketplace registry (local dev registry shipped)
- Per-tenant AI Box Cloud Ed25519 tokens
- Native PTY (node-pty compiled binary per platform)
- Mobile companion native app (RN + Expo)

---

## Upgrade

- **From v1.x / v2.x / v3.x / v4.x:** Free. Run the v5.0.0 MSI/EXE. WiX `upgradeCode` handles in-place. Your `OrangeBox-Data/` is preserved.
- **Cockpit pin preserved:** v4 default; `/v2` (McLaren HUD) and `/classic` (v1.4) remain via `localStorage.orangebox-cockpit-pin`.
- **API keys preserved.** No re-pairing needed.

---

## Pricing

| SKU | Price | What it is |
|---|---|---|
| ORANGEBOX Command | **$49 perpetual** | All features, single user, BYO keys |
| AI Box Cloud | $19/mo | Hosted worker rail (optional) |
| ORANGEBOX Pooled Keys | $99/mo | Provider tokens at pooled rate (optional) |
| ORANGEBOX Team | $499/yr | 5 seats, shared vault + receipts |

Zero markup on tokens. Privacy dashboard audits every provider call.

---

## Sources cited

- 13 dept-sweep review agents (mirrors, architect, security-reviewer, test-engineer, builder, docs-curator, ux-product-reviewer, engine-platform, ae0-factory:ae14-verification-steward, ae0-factory:ae7-lakestrike-reviewer, orange-judge, lips, hack-the-planet, misfits-rebels, release-steward)
- 12 Anthropic doc deep crawls (prompt caching, features overview, adaptive thinking, extended thinking, agent skills, MCP connector v2, advisor tool, batch processing, files API, structured outputs, compaction, memory tool)
- Hermes Agent docs (Nous Research, 95K GitHub stars, MIT)

---

**Doctrine ID:** `ATOM-OBX-V5-LAUNCH-2026-0517`
**Mom's Law:** applied
**Pizza:** max capacity
**OpenMind:** default-on
**Ship status:** READY
**Launch time:** 2026-05-17 00:01

---

*The cockpit was built through the cockpit it replaces. The doctrine the cockpit ships under is the doctrine the cockpit operates by.*

**OB0X v5. Launch.**
