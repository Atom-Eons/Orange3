# OrangeBox / AtomEons — 4100-Day Build Scope

**Authored:** 2026-05-18
**Operator:** Atom McCree (AtomEons / ÆoNs Research Laboratory)
**Horizon:** 4100 days from anchor → **2037-08-22** (≈ 11.225 years)
**Doctrine:** Silent Canvas + Mom's Law + AtomEons project constitution
**Constraint:** never lose a working system; full scope or more, never less

---

## 0. Where we are right now (Day 0)

| Track | State | Evidence |
|---|---|---|
| OrangeBox v6.2.x | Shipping, working agent loop + chat + IDE + voice + receipts | `scripts/v4/` (40+ modules), `src-tauri/src/bin/native.rs` (6300 LOC) |
| Silent Canvas v6.3.0 | alpha.0 → alpha.6 landed; alpha.7 paused mid-keystroke for this scope pivot | `docs/SILENT_CANVAS_DOCTRINE.md`, `scripts/v4/silent-canvas.mjs`, `scripts/v4/canvas-compiler.mjs`, `scripts/v4/benefits.mjs` |
| Subscription-First Transport | Live (claude/codex/gemini/grok/cursor CLI detection + OpenRouter fallback) | `scripts/v4/subscription-pipes.mjs`, `scripts/v4/openrouter-fallback.mjs` |
| Set-and-Forget Auth Vault | Live (AES-256-GCM, 3-tier master key) | `scripts/v4/credentials-vault.mjs`, `scripts/v4/oauth-handler.mjs` |
| Connector Fabric | 70+ services in registry, 9 thin helpers wired | `scripts/v4/connectors-registry.mjs`, `scripts/v4/connectors/index.mjs` |
| Ad Architecture | Native CAPI + Google Enhanced + UTM + DCO pools + Rules engine | `scripts/v4/ad-architecture.mjs`, `/api/v4/ads/*` routes, `obx ads` CLI |
| Git | Private repo `github.com/AtomEons/orangebox-os` at commit `a7835de` | local + remote tree synced |

**Verified state, no theater.** alpha.7 remaining work: native multi-canvas tabs UI, snapshot scrubber widget, benefits-panel hotkey, cargo rebuild, ship receipt, git push. That's `<= 1 day` of focused work and finishes when you say "resume alpha.7."

---

## 1. The 8 new MCPs you brought (claim vs evidence)

I will treat these as connector-registry first-class entries inside OrangeBox. That means a row, an auth type, a category, an install hint. I will **not** silently mutate the host Claude Code MCP config without your explicit go-ahead — that's a high-trust action that can leak credentials to wrong endpoints.

| # | MCP | Operator claim | My evidence stance | Plan |
|---|---|---|---|---|
| 1 | **Meta Ads MCP** | "Launched 2026-04-29 · `mcp.facebook.com/ads` · 29 tools" | Cannot independently verify the URL or the date without web access this turn. The Meta Marketing API exists; an official Meta-hosted MCP at that exact endpoint needs verification. | Add registry entry as `meta-ads-mcp` (auth_type=oauth2, endpoint pending verification). Side-by-side our native CAPI dispatch stays primary. |
| 2 | **TikTok Ads MCP** | "Launched mid-May 2026 · agentic creative + budget + targeting" | Same caveat. TikTok Marketing API is real; the MCP layer needs verification. | Add `tiktok-ads-mcp`. Stays B-path; our native `/tiktok-ads/*` connector helpers cover the core. |
| 3 | **Google Ads MCP** | "Google open-source, late 2025" | **Confirmed pattern:** multiple OSS Google Ads MCP packages exist (e.g. `cohnen/google-ads-mcp`). Need to pin a specific repo before install. | Add `google-ads-mcp`. Surfaces the OSS package as the install target. |
| 4 | **Pipeboard MCP suite** | "Unified MCP for Reddit/Snap/Meta/Google/TikTok ads" | Cannot independently confirm "Pipeboard" as a known product from priors. Could be real and recent; could be misremembered. | Add `pipeboard-mcp` with `verification_required=true` flag. Will not install until I see evidence (their docs URL + npm/PyPI name). |
| 5 | **Firecrawl MCP** | "Web scraping, bypass bot protection" | **Confirmed pattern:** Firecrawl is a real product with an MCP server (`firecrawl-mcp-server` on npm). | Add `firecrawl-mcp`, install-safe. Auth = API key. |
| 6 | **Claude Flow** | "Multi-agent orchestration swarms" | **Confirmed pattern:** `claude-flow` exists as an OSS agent orchestration project. | Add `claude-flow`. Compatible with our `aeons-lead` + subagent model — won't replace it, will sit beside it as a swarm topology option. |
| 7 | **Repomix MCP** | "Pack codebase into AI-friendly single file" | **Confirmed pattern:** Repomix is a real, widely-used CLI (`yamadashy/repomix`); MCP wrapper exists. | Add `repomix-mcp`, install-safe. Complements our existing `repo-indexer.mjs`. |
| 8 | **StackGen MCP** | "K8s + Datadog + AWS via natural language" | Need verification on which "StackGen" — there's a real infrastructure-as-code product by that name. | Add `stackgen-mcp` with `verification_required=true`. Hold install. |

**Outcome:** 5 of 8 I will install / wire confidently. 3 of 8 (Meta Ads MCP, Pipeboard, StackGen) wait for one round of verification before I touch your host MCP config.

---

## 2. The 4100-day phase map

I'm not going to give you 4100 line items — that's theater. Instead, real phases with binary completion criteria, each anchored to a Silent-Canvas-style benefit measurement.

### Phase 0 — Finish alpha.6 + ship alpha.7  (Days 1–10)
- Resume the paused alpha.7 UI work (multi-canvas tabs, snapshot scrubber, benefits-panel hotkey)
- Cargo build, pack, LEDGER row, ship receipt, git push
- Add 8 MCP entries to connectors-registry (this scope)
- Install 5 verified MCPs into a separate `mcp.json` config (not host Claude Code's — OrangeBox's own MCP mux)
- **Done when:** `obx mcp list` shows 8 entries, 5 of them `installed=true`, alpha.7 binary signed in `dist/`

### Phase 1 — Silent Canvas 1.0 GA  (Days 11–30)
- Doctrine §8 phases alpha.8 → alpha.10 → 1.0-rc → 1.0
- alpha.8: multi-canvas replay + diff between snapshots
- alpha.9: voice intent → silent-canvas dispatch path
- alpha.10: prefers-reduced-motion, missing-pipe banner, full error paths
- 1.0-rc: 26-check verification gate green end-to-end
- 1.0: signed binary + Sentry crash-free `>= 99.5%` for 7 days
- **Done when:** every doctrine §11 verification gate emits a `silent-canvas-verify-pass` receipt without intervention

### Phase 2 — Ad Architecture goes live  (Days 31–90)
- Verify and install the 3 held MCPs (Meta Ads, Pipeboard, StackGen) if/when evidence lands
- Run native ad rules engine on a single real Meta-Ads account; measure that we replaced Revealbot ($229/mo) and Madgicx ($55-$890/mo) with zero ongoing SaaS
- Build a "Creative Production Pipeline" room: Midjourney + Runway + Claude copy + DCO pool feed → platform asset library push
- **Done when:** 30 days of live spend managed by native rules engine with zero manual intervention; cost delta vs SaaS measured in receipts

### Phase 3 — AtomEons Constellation V1  (Days 91–365)
The room doctrine (`.claude/rules/02-product-and-room-doctrine.md`) names eight surfaces. Year 1 ships all of them as real product, not concepts:
- **Pathwaves** — routing doctrine surfaced as a UI
- **Life Migration** — onboarding/intake/model-building engine
- **Growth** + **LifePath** — kept distinct
- **Social** — humane coordination (not social-media mimicry)
- **Create** — artifact-native quality preserved
- **Learn** — compression + teaching, not school-mimicry
- **Relax/Zen** — reduces chaos, not decorative
- **Misfit beta** — governed frontier lane

Each surface ships under the same OrangeBox shell, with the Silent Canvas as the universal create-surface across them. The 8 MCPs from §1 plus our 70+ connectors are the integration substrate.

- **Done when:** 8 surfaces live, each emitting its own receipts, all reachable from the same shell, no surface degrades to placeholder

### Phase 4 — Knowledge Strata becomes the runtime memory  (Days 366–730, Year 2)
- Per `CLAUDE.md`: intake → canon → durable artifact → integrity pass → reuse
- Neon distills into durable runtime memory (already mentioned in canon)
- Receipts become not just audit trail but training data for the Fast Interpreter
- Local-first vector store (Pinecone connector exists in registry; can also self-host)
- Self-correcting HRE (hallucination reduction engine from ÆSkill suite) runs on every run
- **Done when:** the Creative Brain answers in steady state from the operator's own corpus, not just from priors

### Phase 5 — Team / multi-operator mode  (Days 731–1095, Year 3)
- Codexa tenant system (already partially built — `/api/v4/codexa/tenant/*`) matures into real multi-user
- Shared vaults with per-user scoping; vault entries hashable for proof-of-access without exposure
- Shared receipts ledger + private working drafts
- Hosted desktop runtime (the desktop binary stays primary; hosted is mirror)
- **Done when:** a 5-operator team can run Silent Canvas concurrently against a shared project graph with zero merge corruption over 30 days

### Phase 6 — Self-extending agents  (Days 1096–1825, Years 4–5)
- The Connector Fabric becomes self-onboarding: an operator says "add Vercel Webhooks" and an agent reads the docs, generates the connector helper, runs the test suite, files the registry entry
- Silent Canvas becomes capable of writing new lanes of itself (codeless engine reaches §5 fully)
- ÆSkill suite (15 skills, 230/230 tests green) graduates from skill-set to runtime substrate
- **Done when:** 50% of new connectors ship without operator-hand-written code; reviewer agents still gate every promotion

### Phase 7 — Enterprise wedge  (Days 1826–2555, Years 5–7)
- Per memory note `feedback_gartner_enterprise_toggle.md`: "Engage Enterprise" mode toggle + light-mode flip + vertical→sub-vertical→persona taxonomy
- Per `project_skilski_verify_v1.md`: standalone Verify SKU at $499 lands as the rubric standard-setter
- Per `reference_b2b_spend_approval_thresholds.md`: SKUs priced at $4,999 / $9,999 / $9,999×N to hit director-tier / single-buyer / committee tiers
- No marketplace gating: per `feedback_atomeons_standard_setter.md`, AtomEons sets policy
- **Done when:** ARR from enterprise ≥ ARR from solo, while solo experience is not degraded by enterprise-only feature creep

### Phase 8 — Constellation maturation  (Days 2556–3650, Years 7–10)
- The eight surfaces from Phase 3 each have their own teams of agents and human contributors
- ÆoNs Research Laboratory ships peer-reviewed research artifacts using the paper pipeline (`atomeons-paper` skill, ÆSkill suite)
- Misfit beta moves a real subset of frontier ideas into mainline canon
- The runtime is the cognitive center; everything else is a lens
- **Done when:** Atom can step away for 30 consecutive days and the organism continues to ship without quality degradation

### Phase 9 — Endgame, Day 4100  (Days 3651–4100, Year 11)
By 2037-08-22, AtomEons sits in one of three positions:
1. **Sovereign cognitive substrate** — operator-class compute economy has matured; AtomEons is a primary venue for individuals who want premium agentic coherence without surrender
2. **Pioneer technology absorbed at premium** — the patterns we shipped (Silent Canvas, Codeless Engine, ÆSkill, OpenMind, HRE) became industry standard; we get attribution and revenue from the doctrine layer
3. **Standalone organism** — we never sold, never absorbed, runs decade two with a smaller, durable user base
- **Done when:** decision tree above is no longer hypothetical

---

## 3. Cadence law

| Tier | Cadence |
|---|---|
| alpha.X | every 7–10 days during Phase 0–1 |
| GA point releases | every 4 weeks Phase 2+ |
| Major versions (v7, v8, …) | every 6–9 months |
| Phase transitions | every 6–12 months |
| Doctrine amendments | as needed, always behind a `docs/<NAME>_DOCTRINE.md` write |
| Receipts | every non-trivial action, always |
| Ship receipts | every binary + LEDGER row, always |
| Mom's Law audit | every output, always |

---

## 4. Cost / sustainability law

- **Per-token API spend stays bounded** by Subscription-First Transport: claude/codex/gemini/grok/cursor CLI primary, OpenRouter fallback, direct API last
- **Per Doctrine §9 measurement target:** median run cost ≤ $0.05 vs $0.42 Opus baseline (87.5% reduction)
- **Founder salary invariant:** `FOUNDER_SALARY_PER_INSTALL_CENTS` honored in every dividend / payout (per `CLAUDE.md` invariants)
- **No SaaS subscription drift:** every paid SaaS we depend on gets a 2-quarter review; if a native alternative is feasible, we build it (this is how we replaced Revealbot)

---

## 5. Continuity law (the part Mom is watching)

The session-summary-survival problem is real: prior runs lost context at the compaction boundary. This is the structural fix:

- Every phase boundary writes a `docs/RELEASE_NOTES_v<X>.md` with a continuity preamble
- Every alpha emits a `ship-receipt-<version>.json` with full system snapshot pointers
- Every major doctrine lives at `docs/<NAME>_DOCTRINE.md` and is the canonical source
- `runtime/node.py` invariant preserved (per `CLAUDE.md`): there is one authoritative cognitive center
- The `.claude/` directory + Mom's Law + 27 guardrails are reaffirmed at every session boot via `atomeons-prime`

---

## 6. Decision points for Atom right now

| # | Decision | Default if you don't say |
|---|---|---|
| A | Finish alpha.6 wiring + ship alpha.7 first, **then** integrate the 8 MCPs? Or pivot to MCPs first and resume alpha.7 after? | Default: **finish alpha.7 first** (≤ 1 day), then MCPs. Preserves working-system rule. |
| B | Install the 5 verified MCPs into OrangeBox's own MCP mux (`<dataRoot>/mcp.json`)? Or into your host Claude Code MCP config too? | Default: **OrangeBox mux only.** Host Claude Code config is your space; I won't touch it without explicit go. |
| C | For the 3 unverified MCPs (Meta Ads, Pipeboard, StackGen) — should I spend a verification pass with WebFetch this session, or queue it for a "verify-mcps" follow-up task? | Default: **queue it.** Cleaner separation; we don't need it for alpha.7 ship. |
| D | The 4100-day phase map above — does the Phase 3 surface-list match how you currently see AtomEons Constellation V1? Anything misaligned with current canon? | Default: **adopt as-written, amend on signal.** |

---

## 7. Next action (no theater)

If you say **"resume alpha.7"** → I finish the in-flight native UI work, cargo build, pack, LEDGER, git push.
If you say **"go MCPs"** → I write the 8 connector-registry entries + verification-matrix doc + `obx mcp` subcommand, then prompt before any actual install.
If you say **"both, in order"** → alpha.7 → MCPs in that sequence, single delivery at the end.

Mom's Law remains. Nothing simulated. Receipts on every step.
