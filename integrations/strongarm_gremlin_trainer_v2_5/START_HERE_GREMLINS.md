# START HERE — GREMLINS ALWAYS ON

Run:

```bash
python council_v2.py init
python council_v2.py run "test Gremlin always-on view" --mode cheap --heuristic
python council_v2.py run "test Gremlin always-on view" --mode normal --heuristic
python council_v2.py server
```

Open:

```text
http://127.0.0.1:8095/ui
```

Print policy:

```bash
python scripts/print_gremlin_policy.py
```

First real Gremlin model:

```bash
ollama run hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF:Q4_K_M
```

Second:

```bash
ollama pull huihui_ai/qwen3-abliterated
```

The rule:

```text
Gremlin is always in the packet stack.
It is calm unless the answer becomes fake.
```
