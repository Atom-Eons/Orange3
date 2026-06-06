# Hugging Face Rebel Model Starters

These are starting points, not final religion.

## Rebel personality candidates

### Dolphin

Use for the Misfit/Rebel voice. Dolphin models are designed as general-purpose local models with coding, math, agentic behavior, function calling, and owner-controlled system prompting.

Candidates:

- `dphn/Dolphin3.0-Llama3.1-8B`
- `dphn/Dolphin3.0-R1-Mistral-24B`
- `dphn/Dolphin-Mistral-24B-Venice-Edition`

Run behind STRONGARM. Rebel means anti-generic and anti-PR, not illegal.

### Hermes / Nous

Use for Judgement or high-agency general assistant behavior.

Candidates:

- `NousResearch/Hermes-4.3-36B`
- `NousResearch/Hermes-4-70B`
- smaller Hermes variants when available

Hermes is the cleanest brand fit for "aligned to you" open model behavior.

## Reasoning / Judgement candidates

- `Qwen/Qwen3-30B-A3B-Thinjudgement-2507`
- `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B`
- `mistralai/Mistral-Small-3.2-24B-Instruct-2506`
- `google/gemma-3-27b-it`

## Micro judge candidates

- `Qwen/Qwen3-1.7B`
- `Qwen/Qwen3-4B`
- `HuggingFaceTB/SmolLM3-3B`
- `microsoft/Phi-4-mini-instruct`

## Recommended first stack

Thin daily:

```text
Micro: Qwen3 1.7B or SmolLM3 3B
Council: Qwen3 14B or Mistral Small 24B
Rebel: Dolphin 8B
Judgement: Qwen3 30B-A3B or Hermes 36B
Training: Colab
```

Most stable start:

```text
Qwen3 4B for all roles first.
Then swap in Dolphin for Misfit.
Then add Qwen3 14B for Forge.
Then add Qwen3 30B-A3B or Hermes 36B for Judgement.
```
