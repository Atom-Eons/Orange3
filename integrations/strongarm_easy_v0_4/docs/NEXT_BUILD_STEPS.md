# STRONGARM Next Build Steps

## Stage 0 — one-file judge

Run:

```bash
python strongarm.py demo --heuristic
python strongarm.py pull
python strongarm.py demo
python strongarm.py server
```

Success condition:
STRONGARM returns JSON verdicts and rewrite prompts.

## Stage 1 — sidecar integration

Every agent in the five-stack sends draft answers to:

```text
POST http://127.0.0.1:8094/rewrite_prompt
```

If verdict is PASS, ship.
If verdict is REWRITE, feed rewrite_prompt back to the drafting model.
If verdict is ESCALATE, route to tools or stronger model.
If verdict is BLOCK, produce the strongest lawful alternative.

## Stage 2 — receipt mining

Every audit writes to:

```text
receipts/
```

Keep:
- original request
- draft answer
- verdict
- rewrite prompt
- final answer if available
- whether human accepted it

## Stage 3 — dataset builder

Convert receipts into:

```text
data/sft.jsonl
data/preferences.jsonl
```

SFT teaches STRONGARM to emit verdict JSON.
Preference tuning teaches it to hate weak answers and prefer strong lawful answers.

## Stage 4 — LoRA

Train small adapter.

Start with:
- Qwen3 0.6B if CPU-only and tiny
- Qwen3 1.7B if laptop has enough RAM
- Qwen3 4B if you want sharper criticism
- SmolLM3 3B if long-context matters

## Stage 5 — deterministic control plane

Bun/Node owns routing.
SQLite owns state.
Git owns rollback.
STRONGARM owns answer pressure.
No LLM directly owns the build.
