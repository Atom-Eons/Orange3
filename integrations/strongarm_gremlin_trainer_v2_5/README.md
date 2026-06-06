# STRONGARM Gremlins Always-On V2.5 — GTi15

This is the v2 best-practice desktop architecture for a 98 GB RAM GTi15-class machine.

The rule:

**Do not run five full-context models. Run one compressed council.**

The five brains write small packets into a SQLite blackboard. Judgement reads only the packets. This gets collective intelligence without token bonfire.

## Five brains

1. **Judgement** — final synthesizer / sovereign decision.
2. **Librarian** — context, tools, files, memory, retrieval.
3. **Forge** — build, code, commands, implementation.
4. **Mirror** — truth, validation, contradictions, tests.
5. **STRONGARM / Misfit** — anti-bullshit, anti-scope-collapse, rebel pressure.

## Three voices

The 5 brains compress into 3 useful voices:

1. **Builder voice** — what to do.
2. **Truth voice** — what is false, missing, risky.
3. **Rebel voice** — what is too weak, generic, obedient-to-the-wrong-thing.

Judgement reads those compressed signals.

## Start

```bash
python council_v2.py init
python council_v2.py run "Design the next STRONGARM version for my GTi15" --mode normal --heuristic
python council_v2.py server
```

Open:

```text
http://127.0.0.1:8095/ui
```

## Real model run

Install/start Ollama, then pull one starter:

```bash
ollama pull qwen3:4b
python council_v2.py doctor
python council_v2.py run "Build the system" --mode cheap
```

Edit `council_config.json` to map model slots to what you actually have installed.

## Modes

`cheap` — 3 brain packets + Judgement. Use this constantly.

`normal` — 5 brain packets + Judgement. Default.

`deep` — 5 brain packets + bigger Judgement. Use when the answer matters.

## Token-saving principle

The council never chats with itself.

Each role outputs a compact JSON packet:

```json
{
  "role": "mirror",
  "voice": "Truth",
  "decision": "revise",
  "best_moves": ["..."],
  "objections": ["..."],
  "missing_info": ["..."],
  "handoff": "...",
  "confidence": 78
}
```

Judgement gets packets, not debate transcripts.


## V2.5 addition

This version adds a global model registry and an abliterated Rebel lane.

The new rule:

```text
Abliterated models create pressure.
Mirror checks truth.
STRONGARM enforces discipline.
Judgement decides.
```

See:

```text
docs/ABLITERATED_STACK.md
docs/GLOBAL_MODEL_ROUTER.md
docs/GLOBAL_STACK_RECOMMENDATION.md
config/global_model_registry.json
```


## V2.5 addition — MISFITS SET

This version formalizes all non-normal, not-locked-down models into one pool:

```text
MISFITS SET
```

The set includes Dolphin, Hermes/Nous, abliterated, lorablated, Heretic/creative merges, Qwen abliterated, and experimental coder/vision variants.

See:

```text
docs/MISFITS_SET.md
docs/MISFITS_RUNTIME.md
docs/MISFITS_FIRST_10.md
config/misfits_set.json
```


## V2.5 addition — GREMLINS ALWAYS ON

The Misfit view is no longer optional.

```text
Gremlin is always-on.
Calm when the answer is real.
Attack when the answer lies, pretends, refuses, shrinks, condescends, or fails to produce.
```

See:

```text
docs/GREMLINS_ALWAYS_ON.md
docs/GREMLIN_PROMPT.md
docs/GREMLIN_IN_STACK.md
docs/GREMLIN_FAILURE_DETECTOR.md
config/gremlins_always_on_policy.json
```


## V2.5 addition — GREMLIN TRAINER

The pasted pirate/persona idea is preserved, but upgraded.

Correct order:

```text
1. Train Gremlin packet behavior.
2. Validate JSON + trigger accuracy.
3. Deploy Gremlin as always-on pressure packet.
4. Later train a style responder if needed.
```

See:

```text
docs/GREMLIN_TRAINER_V2_5.md
docs/DATASET_DESIGN.md
docs/SYNTHETIC_DATA_PROMPT.md
docs/WHY_NOT_CHATBOT_FIRST.md
docs/PERSONA_INGREDIENTS.md
train_colab/gremlin_unsloth_train.py
data/gremlin_seed_sft.jsonl
```
