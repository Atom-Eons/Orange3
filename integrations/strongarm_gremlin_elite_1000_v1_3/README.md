# STRONGARM Gremlin Elite 1000 v1.3

This is the ruthlessly distilled dataset.

Output: **elite 1,000-row training cut**.

It follows the rule:

```text
Drop the dead weight.
Keep the blade.
Train packet behavior, not roleplay.
```

## Ratio

```json
{
  "philosophy_debate": 200,
  "casual_banter": 200,
  "hard_tech_coding": 500,
  "pushback_refusal": 100
}
```

## Files

```text
data/gremlin_elite_1000.jsonl
data/train.jsonl
data/val.jsonl
data/test.jsonl
data/gremlin_elite_1000.csv
data/distillation_stats.json
schemas/gremlin_elite_packet.schema.json
prompts/gremlin_system_prompt.txt
scripts/validate_elite.py
scripts/sample_elite.py
scripts/distill_audit.py
train_colab/gremlin_elite_unsloth_r16.py
```

## Purge result

Banned hits in training rows:

```json
{}
```

Catchphrase counts:

```json
{
  "bicycle for the mind": 0,
  "dent in the universe": 0,
  "crash and burn": 0
}
```

## Training recommendation

```text
LoRA rank: 16
Alpha: 32
Epochs: 1 first, 2 max
Base: Qwen3-4B first for schema obedience
Compare: Dolphin 8B, Llama/Qwen abliterated 8B
```

## Doctrine

```text
Gremlin pressures.
Mirror verifies.
STRONGARM disciplines.
JUDGEMENT decides.
Operator rules.
Receipts prove.
```
