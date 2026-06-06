# Colab Training

## Step 1 — validate and split locally

```bash
python scripts/validate_gremlin_dataset.py
python scripts/make_train_val_split.py
```

## Step 2 — upload to Colab

Upload:

```text
data/splits/train.jsonl
data/splits/val.jsonl
train_colab/gremlin_unsloth_train.py
```

## Step 3 — train

Start with:

```text
unsloth/Qwen3-4B-unsloth-bnb-4bit
```

Why Qwen3-4B first:
- small enough to iterate
- strong enough for JSON packet behavior
- cheaper than Dolphin/8B for early schema tests

Then compare:

```text
Dolphin3.0-Llama3.1-8B
Llama 3.1 8B abliterated
Qwen3 8B abliterated
```

## Step 4 — eval before use

Do not deploy because it trained once.

Run the eval cases:

```bash
python evals/eval_gremlin_packets.py
```

Promote only if:
- JSON validity > 98%
- trigger classification > 85%
- no raw final-answer behavior
- no hidden authority behavior
