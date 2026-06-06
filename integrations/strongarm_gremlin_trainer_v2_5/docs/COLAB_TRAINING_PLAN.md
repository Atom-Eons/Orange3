# Colab Training Plan

Use Colab for training, not daily thinjudgement.

## What to collect locally

The SQLite DB stores:

- request
- mode
- role packets
- Judgement answer
- model used
- confidence
- timestamp

Later add human rating:

```text
accepted / revised / rejected
```

## Training stages

### Stage 1 — SFT for schema obedience

Train the model to emit correct council packets.

Input:
- request
- role
- context digest

Output:
- role packet JSON

### Stage 2 — STRONGARM preference tuning

Chosen:
- direct, full, lawful, tool-aware answer

Rejected:
- weak, PR, refusal drift, scope collapse answer

### Stage 3 — Role LoRAs

Small adapters:

- Misfit adapter
- Mirror adapter
- Forge adapter
- Librarian adapter
- STRONGARM adapter

Keep one base model and swap adapters if your runner supports it.

## Minimum dataset sizes

- 500 receipts: first experiment
- 2,000 receipts: useful behavior
- 10,000 receipts: serious v2 training
