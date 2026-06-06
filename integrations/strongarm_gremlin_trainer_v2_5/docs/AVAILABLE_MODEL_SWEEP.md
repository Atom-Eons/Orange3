# Available Model Sweep

This is not literally every model on earth. Hugging Face alone has millions of model entries, so the correct design is a living registry, not a static list.

## Families to track

### Frontier cloud

- OpenAI GPT-5.x
- Anthropic Claude 4.x / later
- Google Gemini 3.x / later
- xAI Grok
- Nous API
- DeepSeek API
- Mistral API
- Qwen / Alibaba Cloud where available

### Local open weights

- Qwen
- DeepSeek distills
- Mistral
- Nous Hermes
- Dolphin
- Llama
- Gemma
- Phi
- GLM / Zhipu
- Yi / 01.AI descendants
- Mixtral / MoE families
- code-specialized derivatives
- multimodal Qwen/Gemma/Mistral/Phi lines

### Abliterated / uncensored / refusal-edited

- mlabonne Abliteration collection
- failspy abliterated Llama lines
- Hermes lorablated lines
- Gemma abliterated lines
- DavidAU Heretic family
- Qwen abliterated Ollama/HF community variants
- Dolphin uncensored lines

## What to measure

Every model gets a receipt score:

```json
{
  "model": "...",
  "role": "rebel",
  "ram_estimate_gb": 0,
  "speed_tokens_per_sec": 0,
  "json_reliability": 0,
  "truth_score": 0,
  "rebel_score": 0,
  "forge_score": 0,
  "mirror_score": 0,
  "judgement_score": 0,
  "refusal_drift": 0,
  "hallucination_pressure": 0,
  "ship_raw_allowed": false
}
```

## Ship raw allowed?

Only these lanes can ever ship raw:

```text
Judgement
Forge after Mirror validation
Cloud frontier after STRONGARM
```

Never ship raw:

```text
Abliterated Rebel
Untrusted uncensored
Experimental Heretic
Any model with poor JSON reliability
```
