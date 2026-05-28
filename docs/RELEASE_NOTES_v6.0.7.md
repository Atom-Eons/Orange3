# ORANGEBOX v6.0.7 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-0-7-PHASE-7-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Phase 7 — Stop Pretending**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
**Mom's Law:** Real parts. Real numbers. Real lanes. No theater.

---

## Why this build

Operator verdict on v6.0.3:

> "stop fucking pretending it works and make it excellent. setup a 5 hour build to get it best it can be."

v6.0.7 kills every fake number, wires every stub, and surfaces real data. Same crate set, same `lto=thin` profile.

## The "theater audit" — what got killed

| Was theater in v6.0.3 | Real in v6.0.7 |
|---|---|
| Cockpit `GATES 9/9`, `TESTS 230/230`, `GUARDRAILS 27` (hardcoded) | Live `RECEIPTS`, `TODAY`, `SPRINTS`, `COMPOSER`, `PROVIDERS x/5`, `UPTIME` |
| PARTY_LINE row: `"lane=strategy · model=opus · estimated 12 receipts"` | Latest real receipt: source badge + title + ts |
| No FROZEN badge despite freeze enforcement live | `🔒 FROZEN` badge in cockpit chrome + restriction-root line below stats |
| No cost meter | Live `$X.XXXX / 24H` in chrome (pulls `/api/v4/privacy/summary`) |
| Trilane 3-col silently drops 4th Grok leg when quadlane fires | Native mode radios (Trilane / Quadlane), 4-column grid with Opus + GPT-5 + Gemini CLI + **Grok-2 wildcard** |
| No adversarial mode UI despite server support | Checkbox in Trilane lane; per-leg "argue against consensus" prompt wrapping |
| Skils lane = static Skil.Ski MCP paste block | Full skill catalog: enumerates `.claude/{skills,agents,rules}` + 12 internal endpoints; searchable filter |
| IDE = single-file only | Single-file PLUS Composer block (instruction + N files → scaffold prompt) |
| Terminal ran destructive `rm -rf /` without check | Calls `/api/v4/careful/check` first; BLOCKED prefix when destructive; safe-exceptions still pass |

## New native UI

- **Composer in IDE** — instruction + multi-file list → POSTs to `/api/v4/composer/scaffold` → returns LLM-ready prompt → caller pastes into Claude/GPT/Grok → response goes through `/api/v4/composer/plan` → `/apply` writes accepted hunks.
- **Skills lane** — kind badge (`INTERNAL` orange / `SKILL` cyan / `AGENT` green / `RULE` yellow) + filter + scrollable list.
- **Trilane / Quadlane mode** — operator preference: Opus 4.7 + GPT-5 + Gemini CLI + Grok-2 wildcard on quality budget.
- **Cost meter** — live $/24h in cockpit chrome.
- **FROZEN badge** — visible the second freeze activates.
- **Real stats** — 6-cell bottom strip pulls from receipts list + privacy summary.

## New server endpoints

```
GET  /api/v4/skills/list           — enumerate .claude/{skills,agents,rules} + internal
POST /api/v4/skills/fire           — resolve skill into suggested API call
POST /api/v4/composer/scaffold     — build LLM prompt + file blocks
POST /api/v4/composer/plan         — parse LLM JSON → structured per-file plan with diffs
POST /api/v4/composer/apply        — write accepted hunks (freeze-guarded, emits receipt)
GET  /api/v4/cost/today            — rollup cost across last 24h (used by chrome meter)
```

## Carried forward from v6.0.2

All prior endpoints + modules retained:
- `/sprint/run` composite dual-voice
- `/freeze` + `/careful` enforcement
- `/checkpoint` continuous WIP commits with `[orangebox-context]`
- `/context/{save,list,restore}` markdown checkpoints
- 4-tier memory + Ebbinghaus decay + RRF diversification
- RTK token compression
- AST vault chunker
- SRE incident webhook → /sprint
- `/handoff/compose`, `/zoom-out`, `/caveman` (v6.0.3)
- Dual-listener 8787/8788

## Doctrine carried

11 rules in `.claude/rules/`:
- 00-moms-law
- 00-core, 01-teams-and-authority, 02-product-and-room-doctrine, 03-build-and-receipts, 04-game-dev-doctrine, 05-misfit-frontier
- 06-search-before-build (Mom's-Law tier)
- 07-karpathy-four (Mom's-Law tier)
- 08-doubt-driven
- 09-source-driven
- 10-incremental
- 11-interview-mode

## Compatibility

- Drop-in over any v6 install. Sync `scripts/` + drop in new `orangebox.exe`.
- No new deps. Same `eframe + egui + ureq + serde + chrono` set.
- Same release profile: `lto = "thin"`, `opt-level = "s"`, `codegen-units = 16`, `strip = true`.

## Honest receipts

- **Cockpit stats**: every number pulled from real `receipts/list` or `privacy/summary`. No hardcoded mocks remaining.
- **Skills list** verified live: enumerated 1 skill + 0 agents (.claude/agents empty in test env) + 11 rules + 12 internal endpoints.
- **Composer scaffold** verified live: produced 4,392-char LLM prompt with embedded file content for a 1-file edit request.
- **Careful Terminal block** verified live in v6.0.2; carried forward unchanged.
- **Cargo check**: 7 warnings (all dead-code from older helpers), 0 errors.

## Pricing

Unchanged: $49 perpetual.

---

End of release notes.
