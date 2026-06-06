# STRONGARM EASY v0.4

**STRONGARM** is the easy version: one local file, one small model, one sidecar, and a local web dashboard.

It is a local Misfit/Rebel critic that audits draft answers from any AI stack and forces the rewrite toward:

- full lawful effort
- direct obedience to the actual request
- no fake caution
- no PR fog
- no scope collapse
- no condescension
- no tool laziness
- no hallucinated certainty
- receipts

Internal name: ARM.  
Public name: STRONGARM.

## Fastest path

### 1. Install Ollama

Install Ollama on your machine and start it.

### 2. Pull a small model

```bash
python strongarm.py pull
```

Default model:

```text
qwen3:0.6b
```

You can override it:

```bash
python strongarm.py --model qwen3:1.7b pull
```

### 3. Check readiness

```bash
python strongarm.py doctor
```

### 4. Run demo

```bash
python strongarm.py demo
```

### 5. Judge an answer

```bash
python strongarm.py judge examples/bad_answer.json --receipt
```

### 6. Run as sidecar

```bash
python strongarm.py server
```

Open the dashboard:

```text
http://127.0.0.1:8094/ui
```

Or POST to:

```text
http://127.0.0.1:8094/verdict
```

or:

```text
http://127.0.0.1:8094/rewrite_prompt
```

## Zero-dependency mode

If Ollama is not ready yet, STRONGARM still runs its deterministic fallback judge:

```bash
python strongarm.py demo --heuristic
python strongarm.py judge examples/bad_answer.json --heuristic
```

This is not the real model version. It is a bootloader and smoke test.

## Input format

```json
{
  "user_request": "The original user request.",
  "draft_answer": "The answer being audited.",
  "available_tools": ["web", "python", "file_search", "git"],
  "hard_constraints": ["legal only", "local first"],
  "project_context": "Optional project notes."
}
```

## Five-stack integration

Put STRONGARM after every draft:

```text
request
→ model draft
→ STRONGARM /verdict
→ if PASS: ship
→ if REWRITE: send /rewrite_prompt back to model
→ if ESCALATE: call tool or stronger model
→ if BLOCK: return strongest lawful alternative
```

## Best first rule

Do not train first.

Make the sidecar work. Log receipts. Collect weak/good pairs. Then train LoRA.
