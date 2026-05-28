# ÆoNs Skill Suite V1.4 — Manifest

The 15 skills that formalize AtomEons runtime doctrine into executable behavioral contracts.

Disclosure ID: `ATOM-AESUITE-2026-0419` (V1 topology) + `ATOM-AESUITE-TEST-2026-0420` (peer-review)
Test state: 230/230 passing (pytest 9.0.3, Python 3.12.3)
Registry SHA-256: `2629d5afca81c103005b0c678a649b151a6348167474d24adf762173647f356a`
Corpus SHA-256: `e0c829e7a36ea75e2460e8bcd8c04a9ae7c9c02ec82f62df6647107684bcd944`

## T1 — Session (open + close)

### atomeons-prime
Session boot. Emits a Deploy Grid (time, location, recent context, uploads, skills, memory invariants) before any substantive turn. Kills the C8 "cold-boot" failure mode.

### atomeons-verifier
12-gate top-of-model health check. Asserts session is operating at peak — not drifting, not cold-booting, not producing unverified claims. Run before/after major deliverables.

## T2 — Execution (how we work)

### pizza
Max-capacity mode flag. Auto-fires on build/ship/deliver verbs. Flips the model from "RLHF reasonable length" to full scope, full tools, full depth.

### octolane
8-engine parallel audit sweep. Concurrent specialist agents, single synthesis, returns control to main flow. Hard cap at 8 — the project-safe concurrency limit.

### atomeons-generator
N-generator orchestrator. Doctrine: always 10. When generating options, drafts, or candidates — always 10, never 3-5.

### atomeons-openmind
Cross-disciplinary synthesis. Default-on, parallel-pass preservation. Audits output against a 12-discipline panel before emission.

## T3 — Quality gates (pre-ship)

### atomeons-hre
Hallucination Reduction Engine. 5-stage gate: Context Isolation → Lattice Inject → Entropy Decode → Fact-Lock → Adversarial Self-Audit. Blocks emission on RED verdict.

### atomeons-security-audit
Deterministic grep suite. Pre-ship audit for path traversal, hardcoded secrets, CORS wildcards, bearer tokens in query strings, raw eval(), missing env-var gates, missing FOUNDER_SALARY enforcement, hardcoded crypto/middleware secrets.

### atomeons-drift
Invariant enforcement. Codebase guards: `runtime/node.py` sole authority, FOUNDER_SALARY enforced, 27 guardrails preserved, Gate 0 = LBCE, Human Final Stop reachable.

### atomeons-bench
Honest performance measurement. Corpus + N≥30 + CI + p-value. Refuses "vibes benchmarks." Outputs HONEST | INDETERMINATE | DISPUTED verdicts.

## T4 — Compression (data physics)

### atomeons-clc
Crystal Lattice Compression. Up to 282× compression on dense conversational source by storing the *equation* of data — lattice of entities/facts/decisions/relationships + void map of rejections/boundaries/corrections.

Disclosure: `ATOM-CLC-2026-0331`

### atomeons-glyphspeak
EODO (Encode-Once-Decode-Once) cross-model encoding. Two encoders: Sigil (BPE-aware glyph substitution) and TB/Telegraphic Bytecode (drop-set with single-token opcodes). Honest measured ceiling: ~1.2× token, ~1.2× char.

Disclosure: `ATOM-GS-2026-0406`

## T5 — Emission (ship)

### atomeons-ledger
Package delivery law. Every non-trivial deliverable ships as zip + SHA-256 + ledger row + present_files to outputs. Refuses to close delivery missing any component. The universal terminal.

### atomeons-paper
ÆoNs Research paper emission pipeline. Enforces template (title/abstract/preregistration/formal claims/falsifiable predictions/experiments/co-author block), HRE gate before emission, SHA-256 stamp, ledger row.

### atomeons-trilane
Claude/GPT/Gemini handoff bundler. Emits three-file bundle: claude_pass.md / gpt_handoff.md (Architect) / gemini_critique.md (Consigliere). GPT wins on conflict.

## Canonical chains

```
A_boot     : atomeons-prime
B_build    : prime → pizza → openmind → generator → security-audit + drift + hre → ledger → verifier
C_paper    : prime → pizza → openmind → hre → bench → paper → ledger → verifier
D_handoff  : prime → openmind → glyphspeak → trilane → ledger
E_archive  : atomeons-clc
F_close    : atomeons-verifier
```

## How ORANGEBOX uses the suite

The cockpit fires skills automatically based on detected triggers in operator input:

| Trigger          | Skill that fires           |
| ---------------- | -------------------------- |
| Session open     | atomeons-prime             |
| Build verb       | pizza (max capacity)       |
| Ship verb        | atomeons-ledger gate       |
| Claim verb       | atomeons-hre gate          |
| Code edit        | atomeons-security-audit    |
| Cross-model      | atomeons-trilane           |
| Session close    | atomeons-verifier          |

## Installation

The skills ship in this bundle as text manifests. To activate them inside Claude Code or Claude Desktop:

```powershell
# Copy skill folders into your Claude skills directory:
Copy-Item -Recurse "$env:USERPROFILE\AppData\Local\OrangeBox\skills\*" "$env:USERPROFILE\.claude\skills\"
```

Then restart Claude. The skills will appear in the available-skills list. ORANGEBOX cockpit auto-fires them via the MCP server.

## Doctrine source

See [doctrine/27_GUARDRAILS.md](../doctrine/27_GUARDRAILS.md) for the constitutional guardrails the suite enforces.
See [doctrine/GATE_CHAINS.md](../doctrine/GATE_CHAINS.md) for the gate chain that LBCE (Gate 0) seeds.
