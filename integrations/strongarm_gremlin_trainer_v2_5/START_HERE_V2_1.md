# START HERE — V2.1 Global Abliterated

Run the council:

```bash
python council_v2.py init
python council_v2.py run "redo STRONGARM with abliterated models in the global stack" --mode normal --heuristic
python council_v2.py server
```

Open:

```text
http://127.0.0.1:8095/ui
```

Print global registry:

```bash
python scripts/print_global_registry.py
```

First real local tests:

```bash
ollama run hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF:Q4_K_M
ollama pull qwen3:4b
```

Then edit:

```text
council_config.json
```

Set the `rebel_abliterated` slot to the exact local model name that works on your runner.
