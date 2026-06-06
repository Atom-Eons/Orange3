# Global Model Router

## Goal

Use all models globally without letting the stack become expensive chaos.

The router does not ask "what model is coolest?"

It asks:

```text
What is the cheapest model that can produce the required packet with enough confidence?
```

## Lanes

### 1. Micro lane

For routing, classification, scorecards, packet validation.

Use:
- Qwen3 1.7B
- Qwen3 4B
- SmolLM3 3B
- Phi-4-mini

### 2. Forge lane

For code, files, commands, implementation.

Use:
- Mistral Small 3.2 24B
- Qwen3 14B / 30B
- DeepSeek distills
- cloud frontier only when local fails

### 3. Mirror lane

For verification, contradiction, tests.

Use:
- Qwen3 4B/14B
- Phi-4-mini
- DeepSeek-R1-Distill-Qwen-32B

### 4. Rebel lane

For anti-generic pressure.

Use:
- Dolphin
- Hermes
- Abliterated/Lorablated variants

### 5. Judgement lane

For final synthesis.

Use:
- Qwen3-30B-A3B Thinjudgement
- Hermes 36B
- DeepSeek-R1-Distill-Qwen-32B
- GPT-5.5 / Claude / Gemini / Grok only when value justifies it

## Routing ladder

```text
1. Cheap local micro packet.
2. Normal local council.
3. Local Judgement.
4. Abliterated Rebel pressure if answer is weak or over-refusing.
5. Mirror validation.
6. Cloud Judgement only if confidence stays low.
7. Colab only for training / eval sweeps / heavy experiments.
```

## Global model rule

Do not chase every model.

Keep a living registry with:
- role
- local/cloud
- memory cost
- context length
- license
- tool support
- structured JSON reliability
- refusal tendency
- hallucination tendency
- speed
- confidence score from your own receipts
