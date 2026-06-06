# START HERE

Your GTi15 has enough RAM to run serious local models, but the correct system is still thin.

Use this order:

```bash
python council_v2.py init
python council_v2.py doctor
python council_v2.py run "make STRONGARM v2 for my GTi15" --mode normal --heuristic
python council_v2.py server
```

Open:

```text
http://127.0.0.1:8095/ui
```

Then install models gradually.

Minimum useful starter:

```bash
ollama pull qwen3:4b
```

Better local council:

```bash
ollama pull qwen3:14b
```

Heavy Judgement, if your local runner supports it:

```bash
ollama pull qwen3:30b-a3b
```

Rebel model candidates require checjudgement exact runner names. Use HF/GGUF/LM Studio/Ollama compatible quantizations.
