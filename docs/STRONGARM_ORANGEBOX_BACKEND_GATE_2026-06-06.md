# STRONGARM Orangebox Backend Gate

Date: 2026-06-06

STRONGARM is the local pressure gate for Orangebox project work.

It audits drafts before Orangebox treats them as final. It is meant to keep every lane on the full productive path:

```text
draft -> STRONGARM audit -> PASS / REWRITE / ESCALATE / BLOCK -> receipt
```

## Role

STRONGARM is not the top brain and not a replacement for gauntlets.

It is a cheap, local, receipt-backed critic that catches:

- scope collapse
- tool laziness
- fake caution
- PR fog
- hallucinated certainty
- missing receipts
- weak completion claims

## Default Mode

Default mode is deterministic heuristic judging:

```powershell
npm.cmd run strongarm:doctor
```

This mode requires no API key, no GPU, no Codexa, and no Ollama.

Ollama model judging can be enabled later from the installed STRONGARM package, but training and model pulls are not required for the backend proof.

## Project-Wide Placement

STRONGARM should touch Orangebox work as a quality gate, especially:

- AECode mission contracts
- backend/Ops handoffs
- doctor summaries
- model/advisor verdict cards
- non-trivial final answer drafts
- future visual/product lanes through their own project chats

This Ops lane still does not edit visual/frontend/website/shop code.

## Brain-Lane Clarification

Operator preference currently keeps Claude Opus 4.7 Max / 1M context as the deepest architect/top-brain lane when that level is warranted.

STRONGARM sits below that as a local pressure gate. It can force a rewrite locally before expensive or high-context advisor work is invoked.

## Acceptance

STRONGARM is considered active only when:

- the installed integration exists under `integrations/strongarm_easy_v0_4`
- `python -m py_compile` passes
- heuristic demo passes
- bad-answer judgment returns `REWRITE`
- local HTTP sidecar smoke passes
- `C:\Users\a\OrangeBox-Data\strongarm\latest-strongarm-doctor.json` reports `STRONGARM_ORANGEBOX_GATE_GREEN`

