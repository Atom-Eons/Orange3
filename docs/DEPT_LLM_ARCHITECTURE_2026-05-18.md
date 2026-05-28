# Scope-Add Analysis — Department-LLM Architecture (Opus Brain → Dept Heads → Crews → Hermes)

**Authored:** 2026-05-18 (third scope-add of the day)
**Author:** Claude (Compiler / Syntax Lead)
**Source:** Atom McCree, "department llm + agentic system + deploying hermes"
**Status:** analysis only · no code edits land until operator confirms a path
**Cross-references:** `docs/SCOPE_4100_DAYS.md` · `docs/CODEX_LOGIC_PASS_2026-05-18.md` · `docs/SCOPE_ADD_ORCHESTRATORS_2026-05-18.md` · `docs/SILENT_CANVAS_DOCTRINE.md` · `scripts/v4/hermes/README.md` · `.claude/CLAUDE.md`

---

## 0. TL;DR verdict

**STRONG YES on this architecture.** It's the AtomEons "one organism with many lenses" doctrine finally taking executable shape. It's coherent with everything we've shipped, it's cost-disciplined by design, and it answers the orchestrator-stack scope-add cleanly: the swarm framework runs *under* each department head, not as the master.

The architecture in one sentence:

> **Opus 4.7 brain decides what to do → routes to one of N department LLM heads → each head runs its own agentic crew with its own model + tool palette + autonomy budget → outputs flow through Hermes for persistent memory + multi-channel delivery.**

This is the biggest single architectural addition since Silent Canvas. It unifies: AE0 Factory departments, AtomEons project lanes, ÆSkill Suite, the orchestrator stack (n8n / ComfyUI / chosen swarm), and Hermes — all into one layered organism.

---

## 1. The layered architecture

```
                                  ┌─────────────────────────────┐
                                  │      OPUS 4.7 — BRAIN       │
                                  │   master router · top calls │
                                  │   1 call per session-turn   │
                                  └──────────────┬──────────────┘
                                                 │
                                                 │ (routing decision)
                                                 │
        ┌──────────┬──────────┬──────────┬──────┴───┬──────────┬──────────┬─────...
        │          │          │          │          │          │          │
     ┌──┴──┐    ┌──┴──┐    ┌──┴──┐    ┌──┴──┐    ┌──┴──┐    ┌──┴──┐    ┌──┴──┐
     │ AE1 │    │ AE2 │    │ AE3 │    │ AE4 │    │ AE5 │    │ AE6 │    │ AE7 │  ...
     │ Prod│    │Resrh│    │Desgn│    │Mktg │    │Sales│    │Code │    │Revw │
     │     │    │     │    │     │    │     │    │     │    │     │    │     │
     │Snnt │    │Perp │    │Snnt │    │Snnt │    │Snnt │    │Snnt │    │Opus │
     │ 4.5 │    │/Gem │    │ 4.5 │    │ 4.5 │    │ 4.5 │    │ 4.5 │    │ 4.7 │  ← Department LLM heads
     │ sub │    │ sub │    │ sub │    │ sub │    │ sub │    │ sub │    │ sub │     (model + tool palette
     │     │    │     │    │     │    │     │    │     │    │     │    │     │      + autonomy budget)
     └──┬──┘    └──┬──┘    └──┬──┘    └──┬──┘    └──┬──┘    └──┬──┘    └──┬──┘
        │          │          │          │          │          │          │
        │     ┌────┴────┐     │          │          │          │          │
        │     │ Agentic │     │          │          │          │          │
        │     │  crew   │     │          │          │          │          │      ← Per-department agent
        │     │ (chosen │     │          │          │          │          │        crews via CrewAI or
        │     │  swarm) │     │          │          │          │          │        Claude Flow (whichever
        │     └────┬────┘     │          │          │          │          │        wins the Phase-1 bake)
        │          │          │          │          │          │          │
        │          │ tools: connectors registry · MCPs · n8n · ComfyUI · vault · receipts
        │          │
        │          ▼
        │   ┌──────────────────────────────────────────────────────────────────┐
        └──▶│                          HERMES (substrate)                       │◀──┐
            │ MCP host on :18790 · persistent memory · auto-skill compounding   │   │ all
            │ multi-LLM routing (Nous/OpenRouter/Anthropic/OpenAI)               │   │ flows
            │ gateway pairings: Telegram · Discord · Slack · WhatsApp · Signal  │   │ return
            └──────────────────────────────────────────────────────────────────┘   │ here
                                                                                   │
                                                                                   ◀──┘
```

**Three concrete responsibilities Hermes carries:**
1. **Persistent operator-owned memory** — every department head writes to and reads from Hermes' state, so memory compounds across runs and sessions (this is what makes the 4100-day plan's "Knowledge Strata" Phase 4 economically real on Day 1, not Day 366)
2. **Auto-skill generation** — Hermes builds reusable skills from past sessions; over time, frequent department workflows graduate into named skills the brain can fire directly
3. **Multi-channel delivery** — gateway pairings let the organism reach the operator wherever they are (Telegram for high-urgency, Discord for community, Slack for team, Signal for private)

---

## 2. Department list (canonical)

The AE0 Factory already names 14 numbered departments. I propose adopting these **as the canonical department roster** — they're explicit, they already have a routing skill (`ae0-factory:ae0`), and the operator already invokes them via `/ae*` slash commands.

| # | Dept | Role | Existing assets |
|---|---|---|---|
| AE1 | Product | turn ideas into buildable specs with acceptance criteria | `ae0-factory:ae1-product` |
| AE2 | Research | current docs, Context7 lookups, technical/market research | `ae0-factory:ae2-research` |
| AE3 | Design | UX, UI, design systems, Figma/v0/shadcn, accessibility | `ae0-factory:ae3-design` |
| AE4 | Marketing | copy, SEO, landing pages, social content, brand voice | `ae0-factory:ae4-marketing` |
| AE5 | Sales | pricing, Stripe, checkout flows, conversion | `ae0-factory:ae5-sales` |
| AE6 | Code | build, test, review, secure (worktree-isolated parallel builds) | `ae0-factory:ae6-code` |
| AE7 | Review | adversarial review, LakeStrike, PR review, completeness | `ae0-factory:ae7-review` · `ae7-lakestrike-reviewer` |
| AE8 | Launch | deploy to Vercel, smoke test, DNS, monitoring, receipts | `ae0-factory:ae8-launch` |
| AE9 | Legal | terms, privacy, licenses, compliance | `ae0-factory:ae9-legal` |
| AE10 | Ops | memory bus, cost control, routing, session persistence | `ae0-factory:ae10-ops` |
| AE11 | Security | secrets, permissions, trust boundaries | `ae0-factory:ae11-security` |
| AE12 | Data | analytics, instrumentation, lakehouse, ETL | `ae0-factory:ae12-data` |
| AE13 | Automation | OpenClaw lane, scheduled tasks, autonomous candidates | `ae0-factory:ae13-automation` |
| AE14 | Bench | real capability verification, benchmarks, plugin receipts | `ae0-factory:ae14-bench` · `ae14-verification-steward` |

**AtomEons project lanes** (`aeons-lead`, `builder`, `test-engineer`, `security-reviewer`, `release-steward`, `orange-judge`, `mirrors`, `lips`, `misfits-rebels`, `hack-the-planet`) stay in place as **role-functions within departments**, not as their own departments. Mapping:
- `aeons-lead` → AE0 (the brain layer itself; lives above the 14)
- `builder` → AE6 Code
- `test-engineer` → AE14 Bench
- `security-reviewer` → AE11 Security
- `release-steward` → AE8 Launch
- `orange-judge` → AE1 Product (sharpness / subtraction)
- `mirrors` → AE7 Review (anti-theater)
- `lips` → AE3 Design / AE4 Marketing (phrasing / surface)
- `misfits-rebels` → AE13 Automation (frontier)
- `hack-the-planet` → AE10 Ops (unblock)

Codex's logic-pass question: is the AE1–AE14 list correct as canonical, or do we need to split/merge any?

---

## 3. Model assignment per department (cost-disciplined)

The operator's principle: *"not cash based forward but runs low as possible in spend always."* This is the operationalization.

Model tiers from cheapest to most expensive (per-million-tokens, approximate):

| Tier | Model | Cost class | Primary use |
|---|---|---|---|
| **L0** | Local Ollama (Llama 3.1, Mistral, Qwen) | $0 | batch / non-critical / volume work |
| **L1** | Sonnet 4.5 via Claude CLI subscription | $0 marginal (subscription) | most department-head calls |
| **L1** | Codex CLI subscription | $0 marginal (subscription) | code work (AE6) |
| **L1** | Gemini CLI subscription | $0 marginal (subscription) | research (AE2) |
| **L2** | Haiku 4.5 via API | low | sub-agent calls, parallelism |
| **L2** | OpenRouter cheapest fits | low | fallback when all subs unavailable |
| **L3** | Sonnet 4.5 via direct API | medium | when subscription rate-limited |
| **L4** | Opus 4.7 | high | brain layer only · top routing decisions · one call per session-turn |
| **L4** | GPT-5-class via API | high | trilane Architect tiebreak (rare) |

**Assignment table:**

| Dept | Default model | Sub-agent model | Notes |
|---|---|---|---|
| AE0 BRAIN | **Opus 4.7** (L4) | n/a | one call per turn; routes only |
| AE1 Product | Sonnet 4.5 sub (L1) | Haiku 4.5 (L2) | spec writing; cheap |
| AE2 Research | Perplexity / Gemini sub (L1) | Sonnet sub (L1) | web-grounded; Perplexity for citations |
| AE3 Design | Sonnet 4.5 sub (L1) + v0/Figma MCP | Haiku 4.5 (L2) | visual work delegated to MCP tools |
| AE4 Marketing | Sonnet 4.5 sub (L1) | Haiku 4.5 (L2) | copy, social, brand voice |
| AE5 Sales | Sonnet 4.5 sub (L1) | Haiku 4.5 (L2) | pricing logic; objections handling |
| AE6 Code | **Codex CLI sub (L1)** primary · Sonnet sub fallback | Haiku 4.5 (L2) for tests | code-specialized |
| AE7 Review | **Opus 4.7 (L4)** for adversarial gate, Sonnet sub for routine | Sonnet sub (L1) | quality gate; Opus only when ship is on the line |
| AE8 Launch | Sonnet 4.5 sub (L1) | n8n workflow (no model) | deploy + smoke test orchestration |
| AE9 Legal | Sonnet 4.5 sub (L1) | n/a | terms, privacy, compliance |
| AE10 Ops | Sonnet 4.5 sub (L1) | Local L0 for batch | cost control, routing, persistence |
| AE11 Security | **Opus 4.7 (L4) on gate, Sonnet sub for sweep** | Haiku 4.5 (L2) | security review; high stakes |
| AE12 Data | Sonnet 4.5 sub (L1) | Local L0 (Llama) | SQL, analytics, ETL |
| AE13 Automation | Sonnet 4.5 sub (L1) | Haiku 4.5 (L2) | n8n workflow author + scheduler |
| AE14 Bench | Sonnet 4.5 sub (L1) | Local L0 | verification harness; volume work |

**Cost math at steady state (10 sessions/day, 20 dept dispatches per session):**
- Brain (AE0 Opus): 10 calls/day · avg 5K tokens · $0.020/call = **$0.20/day**
- Department heads (mostly L1 subscription): 200 calls/day · $0 marginal = **$0.00/day** (just the monthly subscription)
- Sub-agents (mostly L2 Haiku): ~500 calls/day · avg 2K tokens · $0.002/call = **$1.00/day**
- Adversarial gates (AE7/AE11 Opus): ~5 calls/day · $0.025/call = **$0.125/day**
- Local L0 batch: ~unlimited at $0
- **Total daily spend at steady state: ~$1.33/day = ~$40/month** in addition to whatever subscriptions are already paid

Compare to "all Opus all the time": ~200 × $0.020 = $4/day per session · 10 sessions = **$40/day = $1,200/month**. This architecture is ~30x cheaper at steady state without sacrificing top-of-stack quality.

---

## 4. Trust gradient (advisory → autonomous)

The operator's note: *"we will get to a point of an trust in the dept heads where they can run their own agentic systems."* This formalizes that.

Three trust tiers per department, graduated by receipt evidence:

| Tier | What dept head can do without explicit human approval | Promotion criterion |
|---|---|---|
| **T-Advisor** (day 1) | Recommend, summarize, draft. Cannot mutate state, deploy, or spend. | (starting state) |
| **T-Conditional** | Can mutate state inside its own surface (e.g., AE6 can write to scratch branch). Cannot deploy to production. Cannot spend > $0.50/run. Cannot delete. | 30 consecutive runs with `silent-canvas-verify-pass` receipt + zero rollbacks · OR explicit operator promotion |
| **T-Autonomous** | Can deploy to production (within its surface), spend up to per-dept budget cap, fire-and-forget for routine tasks. Still cannot delete, still cannot bypass AE7 Review gate, still cannot bypass AE11 Security gate. Human Final Stop Authority preserved. | 100 consecutive T-Conditional runs with zero AE7/AE11 blocks · OR explicit operator promotion · per-dept budget cap stays binding |

**Hard invariants preserved at every tier** (from `.claude/CLAUDE.md` + ÆSkill Suite drift-audit):
- Human Final Stop Authority reachable from any autonomous-action path
- Gate 0 (`LatticeIntegrityGate`) in every gate chain
- `runtime/node.py` sole authoritative cognitive center
- 27 constitutional guardrails

**Trust is per-department, not per-organism.** AE2 Research could be at T-Autonomous (low-risk: producing summaries) while AE6 Code is still at T-Conditional (high-risk: code mutations) and AE11 Security can never go past T-Conditional by doctrine.

**Promotion is reversible.** A single AE7 Review block or AE11 Security block drops the offending dept back one tier. The receipt-driven evidence has to rebuild from there.

**Receipts per promotion:** every tier change emits a `dept-trust-promotion` or `dept-trust-demotion` receipt with reason, evidence pointer (which 30 / 100 receipts qualified), and timestamp.

---

## 5. Hermes integration spec

Hermes already exists as a substrate (`scripts/v4/hermes/`). What this scope-add does is **make Hermes load-bearing** instead of optional.

**Hermes carries three things in this architecture:**

### 5.1 Persistent operator-owned memory
Every dept head's session ends with a Hermes memory write:
```json
{
  "dept": "AE6_Code",
  "session_id": "...",
  "task_summary": "...",
  "decisions_made": [...],
  "tools_used": [...],
  "receipts_emitted": [...],
  "trust_tier_at_time": "T-Conditional",
  "next_session_pickup_hints": [...]
}
```

Next session, the brain's first action is to read Hermes memory and surface the relevant context. The mutation log we already keep in `project-graph.mjs` is preserved; Hermes adds cross-session, cross-department memory on top.

### 5.2 Auto-skill compounding
Hermes auto-generates skills from past sessions. Operationalization:
- When AE13 Automation runs the same workflow ≥ 3 times, Hermes promotes it to a named skill in `~/.hermes/skills-pending/`
- Operator reviews + accepts → moves to `~/.hermes/skills-active/`
- Active skills become directly callable by the brain (AE0 can dispatch "do skill X" without re-explaining the workflow)
- This is how the 4100-day plan's Phase-6 "self-extending agents" graduation happens organically

### 5.3 Multi-channel delivery via gateways
Hermes' gateway pairings (Telegram/Discord/Slack/WhatsApp/Signal/CLI) become the **output channels** of the organism:
- AE4 Marketing publishes a Twitter thread → Hermes-Discord posts the post-mortem in the team channel
- AE11 Security flags a vuln → Hermes-Signal pings the operator privately
- AE8 Launch ships a deploy → Hermes-Telegram broadcasts to the alpha-testers channel

**Important guardrail (already in Hermes README):** gateway pairings are OFF by default. Each one is operator-paired explicitly. Loopback-only until paired. This is consistent with operator privacy doctrine.

### 5.4 Hermes as model-router fallback
Hermes natively routes between Nous Portal / OpenRouter / OpenAI / Anthropic. This becomes the **second-tier fallback** after our subscription-pipes:

```
1. Try CLI subscription (claude / codex / gemini / grok / cursor)  → $0 marginal
2. Try OpenRouter via OrangeBox's own openrouter-fallback.mjs       → cheap
3. Try Hermes' multi-LLM router (Nous Portal etc.)                  → cheap-medium
4. Direct API (Anthropic / OpenAI / Google)                         → expensive · last resort
```

Codex packet §8 risk #1 (subscription-CLI auth drift) gets a partial mitigation here: even if all 5 CLI subscriptions go down simultaneously, Hermes provides a model-routing layer that survives.

---

## 6. Routing logic (how the brain picks a department)

The brain's job is **one decision per turn: which dept(s) get the work?** This is operationalizable as a single Opus 4.7 call with a structured output:

```json
{
  "primary_dept": "AE6_Code",
  "secondary_depts": ["AE14_Bench"],
  "tertiary_depts": ["AE7_Review"],
  "rationale": "User wants a code change with tests; AE6 implements, AE14 verifies, AE7 reviews before promotion.",
  "parallel": false,
  "expected_total_tokens": 12000,
  "expected_total_cost_usd": 0.04,
  "blocking_gates": ["AE7", "AE11"]
}
```

Then the brain hands off. Each named dept's head receives the goal + a slice of the global context + its tool palette + its trust tier + its budget allowance.

**The brain only re-enters when:**
- A gate (AE7 Review or AE11 Security) blocks promotion
- The cumulative cost crosses 80% of the session budget cap
- A dept head explicitly escalates ("need brain decision")
- All dispatched depts have returned

This minimizes Opus 4.7 calls. **One call to dispatch. One call to synthesize. That's it for top-of-stack.**

---

## 7. How this interacts with the orchestrator stack

Yesterday's scope-add (CrewAI / n8n / ComfyUI / LangGraph) collapses neatly under this:

| Orchestrator | Where it lives in dept architecture |
|---|---|
| **CrewAI or Claude Flow** (one or the other) | Runs *inside* each department as the agentic-crew framework. AE4 Marketing's swarm is a Crew. AE6 Code's swarm is a Crew. The brain doesn't see Crew internals; it just sees the dept head's output. |
| **n8n** | Cross-department workflow substrate. When AE4 Marketing dispatches a "publish to 5 channels" task, n8n is the workflow that fans out. AE13 Automation owns n8n workflow authorship. |
| **ComfyUI** | Tool that AE3 Design and AE4 Marketing can use (when GPU present) for unlimited creative generation. Sits in the connector registry, called by dept heads on demand. |
| **LangGraph** | Still retired per yesterday's analysis. The brain's routing decision + dept-head's crew already implement the stateful-graph pattern. |

**The orchestrator stack scope-add and the dept-LLM scope-add are complementary, not competing.** They name two different layers of the same architecture.

---

## 8. Decisions for the operator (extending F–K)

| # | Decision | My default |
|---|---|---|
| L | Adopt AE1–AE14 as canonical department roster? | YES (already explicit in AE0 Factory) |
| M | Brain = Opus 4.7. Lock this, or open to GPT-5/Gemini Ultra alternatives? | Lock Opus 4.7 as brain by default; Gemini-Ultra-class as Architect tiebreak on conflict (matches trilane doctrine) |
| N | Model assignment table in §3: adopt as-is, or operator wants to override specific depts? | Adopt as-is; operator can hot-edit per-session via `obx dept set <dept> --model <m>` |
| O | Trust-gradient promotion thresholds (30 / 100): tune higher (more conservative) or lower? | Adopt 30 / 100 as starting calibration; reset after first 30 days of data |
| P | Hermes load-bearing: keep current optional install OR mandate it as v6.3.0-GA prerequisite? | **Mandate at v6.3.0-GA.** This architecture doesn't work without persistent memory + skill compounding. |
| Q | Per-department budget caps: operator-set per-session, or auto-set based on dept tier? | Operator sets master daily cap (default: $5/day). Auto-allocator divides across depts based on historical usage. Hard ceiling per dept = 30% of daily cap. |
| R | Trust-promotion authority: fully automatic on receipt threshold, OR requires operator confirmation? | **Requires operator confirmation.** Receipts surface the candidate; operator clicks "promote" or "deny." Preserves Human Final Stop. |
| S | Cross-department escalation path: any dept can escalate to brain, OR only through AE7 Review? | Any dept can escalate; AE7 Review is for *adversarial* review, not the general-purpose escalation lane |
| T | Should this scope-add land in the Codex packet as `§5.6 Department-LLM Architecture`? | YES — Codex needs to weigh this against the other proposed structure |

---

## 9. Phase placement in the 4100-day map

This is a major addition. Phases get richer, not slower.

| Phase | Existing scope | + From this brief |
|---|---|---|
| 0 (Days 1–10) | Finish alpha.7 + register 8 MCPs | + Define the **dept-LLM router** stub (single `routeToDept()` function in a new `scripts/v4/dept-router.mjs`) · no actual dispatch yet, just the routing decision + receipts |
| 1 (Days 11–30) | Silent Canvas 1.0 GA + n8n + swarm bake-off | + Department heads go live in **T-Advisor mode** for all 14 depts · Hermes mandated as install prereq · brain dispatch wired |
| 2 (Days 31–90) | Ad architecture goes live + ComfyUI | + Trust-tier graduation begins; first 30-receipt promotions to T-Conditional likely happen for AE2 / AE4 / AE13 (lowest-risk surfaces) · ad architecture lives under AE4 Marketing + AE13 Automation |
| 3 (Days 91–365) | AtomEons Constellation V1 (8 surfaces) | + Each Constellation surface gets primary owner-dept · most depts reach T-Conditional · some reach T-Autonomous (AE2 Research first, likely) |
| 4 (Days 366–730) | Knowledge Strata as runtime memory | + Hermes auto-skill compounding becomes the primary capability-growth mechanism · skill-active count is the leading indicator of organism maturity |
| 5 (Days 731–1095) | Team / multi-operator mode | + Per-operator dept-trust state · each team member's brain may dispatch to depts at different trust tiers |
| 6 (Days 1096–1825) | Self-extending agents | + Dept heads themselves can spec, build, and propose new sub-agents · still gated by AE7 Review + AE11 Security · 50% of new connectors ship without operator-hand-written code |
| 7+ | (unchanged scope) | (unchanged scope) |

No timeline slip. The architecture gets richer and load-bearing earlier.

---

## 10. Risk additions (continuing from Codex packet §8 numbering)

13. **Brain-routing brittleness.** If Opus 4.7 makes the wrong dept routing call, the wrong dept does the wrong work. Mitigation: every brain dispatch emits a `dept-route` receipt with rationale. The operator (or AE7 Review on T-Conditional+) can audit routing decisions retroactively. Operator can also override the routing decision before dispatch lands.

14. **Department capture.** A dept head that's been at T-Autonomous for 6 months may drift from its declared role (mission creep). Mitigation: quarterly `dept-charter-review` receipt — AE7 Review audits each dept's actual outputs vs its declared role, recommends scope tightening or charter amendment.

15. **Hermes single-substrate risk.** If Hermes is mandated and Hermes goes down (corrupt state, port conflict, MIT-license future change), the entire organism stalls. Mitigation: Hermes state is operator-owned at `~/.hermes/`; daily backup of `state.json` to OrangeBox's own data root. If Hermes dies, OrangeBox can re-bootstrap with the backed-up state via a fresh Hermes install.

16. **Per-department vault scoping.** If AE4 Marketing has full vault access including AE11 Security's credentials, that's a privilege-escalation surface. Mitigation: vault entries get a `granted_to_depts: [...]` array; default scope is `["AE0_BRAIN"]` and depts request scope expansion explicitly via operator approval (receipts emitted).

17. **Trust-tier rollback storm.** A single bad AE11 Security finding could demote multiple depts simultaneously if the same root cause touched many. Mitigation: demotion is per-dept-per-finding; cascading demotions require explicit AE7 Review chain audit before they propagate.

18. **Cost-cap circumvention via sub-agent escalation.** A dept head at L1 (subscription, $0 marginal) could spawn sub-agents that hit L3 (direct API) and blow the budget. Mitigation: per-dept budget cap counts ALL downstream LLM spend, not just the head's own spend. Sub-agent spend rolls up to the parent dept.

---

## 11. The bigger picture (what changes once this ships)

Before this architecture: OrangeBox is a codeless cockpit with a chat input and a 70-service connector fabric. The operator gives instructions; agents do work.

After this architecture: **OrangeBox is an organism with 14 named departments, each with its own brain, each running its own crew, all coordinated by a top-of-stack brain that costs ~$0.025 per session-turn.**

This is the AtomEons "one organism with many lenses" doctrine — finally implementable in code, not just in slogan.

The operator wakes up. The brain checks Hermes memory. The brain notices yesterday's AE4 Marketing ad creative is underperforming (AE12 Data dropped a receipt overnight at 03:00 UTC). The brain dispatches AE4 + AE3 Design (creative refresh) + AE2 Research (competitor look) + AE14 Bench (verify hypothesis) in parallel. 11 minutes later, three new ad variants land in the DCO pool, AE13 Automation rotates them into Meta Advantage+, AE12 Data starts the 24-hour observation window. AE11 Security has been watching the whole flow; no anomalies. Total cost: $0.31. Operator opens the cockpit, sees three Progress Dashboard cards: Marketing (✓), Design (✓), Bench (✓ — observation underway). They click in on Bench, see the live receipt stream. They go make coffee.

That's the organism the operator is describing. The architecture in this doc is how we build it.

---

## 12. Next action (no theater)

Hold all OrangeBox code edits until:
- Codex returns its logic-pass on the first packet, AND
- Codex receives this addendum as §5.6 and weighs in, AND
- Operator decides L–T above (or defers them to Codex)

If all three signals say "proceed," I:
1. Write `scripts/v4/dept-router.mjs` — pure routing logic, no dispatch yet, receipts only
2. Write `scripts/v4/dept-registry.mjs` — the 14-dept canonical table with model assignments, tool palettes, trust tiers
3. Write `scripts/v4/trust-ledger.mjs` — per-dept receipt count, promotion-eligibility tracker, demotion engine
4. Add `/api/v4/dept/{route,dispatch,trust,promote,demote,override}` routes
5. Add `obx dept` CLI subcommand: `obx dept list` · `obx dept route "<goal>"` · `obx dept trust` · `obx dept budget`
6. Wire Hermes from optional to mandatory in `obx setup` wizard
7. Add daily Hermes-state backup to `<dataRoot>/hermes-backup/state-<date>.json`
8. Doctrine writeup: `docs/DEPT_LLM_DOCTRINE.md` formalizing what this scope-add becomes once shipped
9. Update LEDGER + ship receipt
10. Commit + push

**Mom is watching.** Receipts on every step. The organism is real.
