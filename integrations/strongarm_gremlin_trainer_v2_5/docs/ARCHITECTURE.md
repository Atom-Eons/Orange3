# STRONGARM Council V2 Architecture

## Problem

Five models thinjudgement together can become a token bonfire.

The wrong design:

```text
Model A reads full context.
Model B reads full context + A.
Model C reads full context + A + B.
Model D reads full context + A + B + C.
Judgement reads everything.
```

That is expensive and slow.

## Correct design

```text
User request
  ↓
Digest
  ↓
Small role packets
  ↓
SQLite blackboard
  ↓
Judgement synthesis
  ↓
STRONGARM gate / receipt
```

## Token budget

For 98 GB RAM / 50–60 GB practical model ceiling:

- Keep only one large model loaded at a time.
- Prefer 1.7B–4B for micro judges.
- Prefer 14B–32B for local council.
- Prefer 24B–36B for local Judgement when needed.
- Do not run 70B continuously unless it is the only large active model and context is short.

## Three ways brains share thought without wasting tokens

### 1. Packet bus

Every brain emits fixed JSON. No essays.

### 2. Shared blackboard

SQLite stores tasks, packets, receipts, decisions, and evals.

### 3. Digest context

Each role sees:

- user request
- compressed context digest
- role mission
- strict output schema

It does not see every prior chat unless needed.

## Escalation

Only escalate when:

- confidence below threshold
- packets disagree
- legal/financial/current facts matter
- tool evidence is missing
- code must be tested
- user asks for major artifact/build

Colab handles training and large experiments. Desktop handles daily orchestration.
