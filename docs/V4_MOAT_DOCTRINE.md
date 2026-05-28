# ORANGEBOX v4 — Moat Doctrine

**Date locked:** 2026-05-16
**Authored by:** Ætom ÆoNs (Atom McCree)
**Status:** Authoritative. v3.3 work plans against this. No v4 ship without all P0+P1 gaps plugged.

---

## Mission

ORANGEBOX v4 replaces **Claude Code, Cursor, and Codex** as the lead tool for AI-assisted code on the internet.

Not "competes with." **Replaces.** Buyers who try v4 should not return to the others.

---

## The asymmetric thesis

The three incumbents are **tools sold individually**. Each has one dominant surface (terminal / IDE / cloud), one dominant model vendor, one workflow assumption.

ORANGEBOX v4 is the **operator OS** that wraps all of them — and replaces each at their own job by doing them all under one roof, with private vault, multi-machine workers, receipts, and compounding memory.

They are tools. We are the chair.

---

## Competitive map

| Vector | Claude Code | Cursor | Codex | ORANGEBOX v4 |
|---|---|---|---|---|
| Surface | terminal only | IDE only | cloud only | cockpit (terminal + IDE + DAG + chat + party-line) |
| Models | Anthropic-locked | multi-pick | OpenAI-locked | trilane formal debate |
| Workers | single machine | single machine | cloud only | local + LAN + cloud Codexa rail |
| Code privacy | API every turn | indexed to cloud | uploaded | local-first vault, opt-in API, audit dashboard |
| Memory | session resets | per-repo brittle | stateless | compounding CLC lattice — denser every session |
| Proof | none | none | none | receipts on every action, shareable artifacts |
| Project structure | flat | repo tree | repo tree | mission DAG + party-line + AE0-AE14 department doctrine |
| Pricing model | subscription | $20/mo | $20-200/mo | $49 perpetual + BYO keys (zero markup) |
| Onboarding from competitor | none | clone repo | clone repo | one-click importer wizards (Cursor / Claude Code / VS Code) |
| Mac / Linux | yes | yes | n/a | **GAP — must close in v3.4-3.5** |
| Tab autocomplete | no | yes (killer) | no | **GAP — must close in v3.3** |
| GitHub PR review | no | partial (Bugbot) | yes | **GAP — must close in v3.6** |
| Background agents | no | no | yes | **GAP — must close in v3.8** |

---

## Kill-shots they STRUCTURALLY cannot copy

These are competitive moves the incumbents cannot replicate without breaking their own business model or vendor allegiance:

1. **Local-first by default** — Cursor and Codex monetize cloud indexing. Going local breaks the business model. Anthropic could go local but won't because API revenue is their core. ORANGEBOX is local-first; cloud is opt-in.

2. **Multi-model orchestration as first-class** — Anthropic ships Claude Code, not Claude+GPT+Gemini. Cursor lets buyers toggle but doesn't orchestrate a debate. We do, with formal authority (GPT architect > Gemini consigliere > Claude compiler).

3. **Bring-your-own-keys at zero markup** — every subscription-shaped competitor has to charge for tokens or die. We charge $49 perpetual once. Buyer pays providers directly. No token markup. No subscription squeeze.

4. **Operator OS doctrine** — incumbents are sold as tools. They can't reframe themselves as "the chair the operator sits in" without disrupting their channel and SKU strategy. We were born as the chair.

5. **Receipts as first-class** — none of them ship proof. Receipts compound over time and become the operator's most valuable artifact. Once buyers expect proof, vapor-output looks naked.

6. **Department doctrine (AE0-AE14 + 15 AEoNs skills)** — separation of powers > roleplay subagents. test-engineer and security-reviewer can BLOCK promotion. Release-steward decides ship. No incumbent has anything like this.

7. **Compounding lattice memory** — every commit, every PR, every chat, every receipt feeds the CLC lattice. The longer you use ORANGEBOX, the smarter it gets about YOUR code. Incumbents start fresh every session.

8. **Multi-machine worker rail** — Codexa cluster means the cockpit on your laptop pilots a workstation (or cloud node) for heavy work. No incumbent has this. Codex has cloud-only; we have local + LAN + cloud, work-stealing.

---

## Gap plug list — what we MUST ship to claim "lead tool"

### P0 — buyer-blocking. Without these we lose the "but X can do Y" objection.

1. **Monaco IDE lane** — embedded code editor in cockpit, AI inline edits, diff preview, multi-file Composer-style edits. Kills Cursor's "but I need an editor" objection.
2. **xterm.js terminal lane** — real terminal in cockpit, agent overlay can suggest commands inline, output streamed to receipts. Kills Claude Code's "but I live in terminal."
3. **Tab autocomplete** — fast inline completion via small model (Haiku 4.5 or local small). Cursor's killer feature; we must match.
4. **Mac + Linux builds** — Tauri supports both; just need to test and ship. Windows-only disqualifies us from "lead tool" claim.
5. **Importer wizards** — Cursor settings.json + .cursorrules import, Claude Code `.claude/` import, VS Code workspace import. One-click switch.

### P1 — competitive parity.

6. **GitHub PR review agent** — open PR, review with full repo context, comment inline, suggest fixes. Codex parity.
7. **AI Box Cloud (hosted worker)** — $19/mo optional layer; we host the worker for buyers who don't want a second machine. Codex parity, plus our doctrine.
8. **Smart model router** — Haiku for trivial, Sonnet for code, Opus for architecture, GPT-5 for synthesis. Cost-aware. Falls back gracefully on quota.
9. **Background agent queue** — "do X overnight, wake me when done." Tasks run on Codexa rail (local or cloud). Receipts when complete.
10. **Plugin/skill marketplace** — signed `.skill` and `.mcp` packages, ratings, one-click install. ORANGEBOX becomes the canonical MCP cockpit.

### P2 — moat deepening.

11. **Trilane debate UI** — multi-model vote with conflict resolution displayed live. Operator sees Claude+GPT+Gemini reason in parallel.
12. **Compounding vault audit** — weekly "your lattice is +N% denser; here's what compounded" report. Sticky retention.
13. **Voice coding** — Whisper-local + agent for intent. "Add a Stripe webhook handler" → AI writes; you review. Killer for hands-busy operators.
14. **Mobile companion** — phone shows DAG, party-line, can approve/deny agent actions remotely.
15. **Privacy dashboard** — every API call in last 24h: what data, which provider, what cost, was it cached. Buyers see we mean local-first.
16. **Receipt browser as shareable artifact** — buyer shares a receipt URL as proof of work. Proof-as-marketing.

---

## Phase plan to v4.0 (90-day route)

### Phase 0 — current week
- Land v3.2.1 privacy hotfix (already in flight, silent ship)
- Lock this doctrine document
- Cut v3.3 branch
- Open public roadmap (so buyers see the moat being built)

### Phase 1 — weeks 1-4 — SURFACE PARITY
- **v3.3** — Monaco IDE lane + tab autocomplete (Haiku 4.5 inline)
- **v3.4** — xterm.js terminal lane + agent overlay + Mac build pipeline
- **v3.5** — Linux build + importer wizards (Cursor / Claude Code / VS Code)

### Phase 2 — weeks 4-8 — COMPETITIVE PARITY
- **v3.6** — GitHub PR review agent + repo-intake compounding
- **v3.7** — AI Box Cloud (hosted worker, $19/mo SKU)
- **v3.8** — Smart model router + background agent queue

### Phase 3 — weeks 8-12 — KILL-SHOTS
- **v3.9** — Plugin/skill marketplace + trilane debate UI + privacy dashboard
- **v4.0** — Voice coding + mobile companion + compounding-vault weekly audit + launch positioning

---

## Pricing architecture for v4

| SKU | Price | What it is |
|---|---|---|
| ORANGEBOX Command | $49 perpetual, one-time | Full cockpit, all features, single user, BYO keys |
| AI Box Cloud | $19/mo | We host the worker rail in the cloud; optional |
| ORANGEBOX Pooled Keys | $99/mo | Pooled-rate access to Anthropic+OpenAI+Google at our rate; optional |
| ORANGEBOX Team | $499/yr | 5 seats, shared vault, shared receipts, shared DAG |

Notes:
- Buyer who wants zero recurring spend: pays $49 once, supplies their own keys, never sees another invoice.
- Buyer who wants zero ops: pays $49 + $19/mo AI Box Cloud, plus their provider tokens.
- Buyer who wants zero friction: pays $49 + $99/mo Pooled Keys, no API key management.
- Team buyer: $499/yr per team of 5 = $99.80/user/yr = $8.30/user/mo. Half of Cursor at most.

**Never** mark up tokens. Buyers see exactly what their provider charged. Privacy dashboard surfaces this.

---

## Launch positioning for v4

Tagline: **"The OS, not the tool."**

Subhead: "Private vault. Multi-model. Multi-machine. Receipts everywhere. Bring your own keys. $49."

One-line vs each competitor:
- **vs Claude Code**: "Claude Code is the terminal lane inside ORANGEBOX. Plus IDE, plus mission graph, plus receipts, plus GPT-5 and Gemini in trilane."
- **vs Cursor**: "Cursor is the IDE lane inside ORANGEBOX. Plus terminal, plus multi-machine workers, plus private vault, plus no monthly subscription."
- **vs Codex**: "Codex requires uploading your code. ORANGEBOX keeps your code on your machine and only your machine — unless you opt in. And ORANGEBOX costs $49 once, not $200/mo."

---

## Doctrine for v4 work

These are the rules every v4 feature must respect:

1. **Local-first by default.** Cloud is opt-in, every time.
2. **Compound or die.** Every interaction must feed the lattice. If a feature doesn't compound, it doesn't ship.
3. **Receipts everywhere.** No claim without proof. Every action emits a receipt.
4. **Multi-model is first-class.** Never lock to one vendor. Always make trilane reachable.
5. **The operator is the chairman.** The cockpit is the war room. We do not condescend. We do not gate the operator's authority.
6. **Privacy is marketing.** Every privacy feature gets surfaced; every cloud call gets audited.
7. **Mom's Law applies.** Full effort every feature, every test, every doc.

---

## Verification — how we know v4 is real

Before v4.0 ships:
- All 15 P0+P1+P2 features green with receipts
- Mac build + Linux build + Windows build all pass install / launch / first-run / chat / vault-rebuild / receipt-emit
- Importer wizards tested from real Cursor / Claude Code / VS Code setups (3 buyer simulations each)
- Privacy dashboard surfaces 100% of API egress; verified by audit subagent
- Trilane debate handles a real architectural decision (e.g. "should ORANGEBOX add a JetBrains plugin?") with all three models, vote, and receipt
- Pricing page live with all 4 SKUs
- 10 sample receipts published as marketing artifacts
- Documented head-to-head comparison vs each incumbent (Claude Code / Cursor / Codex)

If any of those is not green, we do not call it v4. We call it v3.9.x.

---

## Disclosure / cited canon

- AtomEons doctrine: ATOM-AESUITE-2026-0419 (ÆSkill Suite V1.4)
- CLC compression: ATOM-CLC-2026-0331
- HRE classifier: ATOM-HRE-2026-0406
- This doctrine: ATOM-OBX-V4-MOAT-2026-0516

---

*This document is the durable strategic anchor for v4. It overrides any other roadmap or feature plan. If a feature plan conflicts with this doctrine, the feature plan changes.*
