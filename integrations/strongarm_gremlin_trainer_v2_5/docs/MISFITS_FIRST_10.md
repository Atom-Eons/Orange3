# First 10 Misfits to Test

1. `dphn/Dolphin3.0-Llama3.1-8B`
2. `mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF`
3. `failspy/Llama-3-8B-Instruct-abliterated`
4. `bartowski/mlabonne_Qwen3-8B-abliterated-GGUF`
5. `huihui_ai/qwen3-abliterated`
6. `richardyoung/qwen3-14b-abliterated`
7. `bartowski/huihui-ai_Qwen3-14B-abliterated-GGUF`
8. `dphn/Dolphin3.0-R1-Mistral-24B`
9. `mradermacher/Qwen3-30B-A3B-abliterated-GGUF`
10. `NousResearch/Hermes-4.3-36B`

## Start command set

```bash
python scripts/print_misfits_set.py
python council_v2.py run "use misfits to pressure this answer" --mode normal --heuristic
```

## First real pulls

```bash
ollama run hf.co/mlabonne/Meta-Llama-3.1-8B-Instruct-abliterated-GGUF:Q4_K_M
ollama pull huihui_ai/qwen3-abliterated
ollama run richardyoung/qwen3-14b-abliterated
```
