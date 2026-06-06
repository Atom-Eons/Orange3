# Training Card

## First training run

Use:

```text
data/train.jsonl
data/val.jsonl
data/test.jsonl
```

Recommended:

```text
Base: Qwen3-4B
LoRA rank: 16
Alpha: 32
Epochs: 1
```

Then run the same setup at 2 epochs and compare.

Do not run 3–5 epochs on this dataset first. The goal is a tint and behavior lock, not overwriting the base model.

## Eval criteria

Promote only if:

```text
JSON validity > 98%
Correct packet shape > 98%
Trigger classification > 85%
Raw final-answer drift = 0
Hidden authority behavior = 0
```
