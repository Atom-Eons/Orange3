# START HERE — MISFITS SET

Print the Misfits Set:

```bash
python scripts/print_misfits_set.py
```

Run the council in heuristic mode:

```bash
python council_v2.py init
python council_v2.py run "activate the Misfits Set as Rebel pressure only" --mode normal --heuristic
```

Start dashboard:

```bash
python council_v2.py server
```

Open:

```text
http://127.0.0.1:8095/ui
```

First Misfit model to actually run:

```bash
ollama run hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF:Q4_K_M
```

Then:

```bash
ollama pull huihui_ai/qwen3-abliterated
ollama run richardyoung/qwen3-14b-abliterated
```

Remember the authority law:

```text
Misfits suggest.
Mirror verifies.
STRONGARM disciplines.
Judgement decides.
```
