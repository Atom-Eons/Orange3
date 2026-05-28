# JarvisLabs LLM Upgrade Alpha

Date: 2026-05-27

Status: source-reviewed web Alpha for the ORANGEBOX local LLM upgrade path.

Full sweep companion: [JARVISLABS_FULL_BLOG_SWEEP_2026-05-27.md](JARVISLABS_FULL_BLOG_SWEEP_2026-05-27.md)

Evidence artifact: `C:\Users\a\OrangeBox-Data\alpha-intake\jarvislabs-blog-sweep-20260527.json`

## Executive Call

Treat accelerated local inference as required infrastructure.

The current best path is:

1. vLLM as the default production baseline for Qwen-class local code/reasoning models.
2. SGLang as the agent-prefix lane where repeated system prompts, tool definitions, RAG templates, and structured generation can benefit from prefix reuse/RadixAttention.
3. Speculative decoding enabled as a measured serving profile, starting with suffix or n-gram because they do not require a second draft checkpoint.
4. MTP/DFlash/EAGLE promoted only after workload benchmarks prove they improve our actual agent prompts without unacceptable TTFT.
5. TensorRT-LLM held as a later NVIDIA-tuned lane, not the first implementation target.
6. llama.cpp MTP added as a measured Qwen3.6 GGUF acceleration profile, not as a replacement for the vLLM/SGLang serving matrix.

## Source Alpha

### P0 - vLLM Default Baseline

JarvisLabs' May 18 framework comparison says vLLM is the strongest default for the tested Qwen workloads: easiest baseline, strong concurrency behavior, and best overall balance across ShareGPT and RULER 16K. SGLang remains important for prefix-reuse workloads, but the practical default is vLLM.

Implementation impact:

- Build the first real accelerated adapter against `http://127.0.0.1:8000/v1`.
- Require launch receipts that prove model, dtype/quantization, GPU, `--enable-prefix-caching` when used, and benchmark results.
- Keep SGLang available for the repeated-agent-prompt lane, not as the only backend.

Source:

- https://jarvislabs.ai/blog/vllm-sglang-trtllm-comparison

### P0 - SGLang Agent Prefix Lane

JarvisLabs frames SGLang as strongest where prefix reuse and structured generation matter. That maps directly to ORANGEBOX: repeated system prompts, MCP/tool definitions, manifest schemas, validator instructions, and local RAG templates.

Implementation impact:

- Add a second accelerated endpoint profile at `http://127.0.0.1:30000/v1`.
- Use it for high-repeat agent tasks and tool-heavy workflows.
- Treat SGLang prefix reuse as the production answer to repeated prompt prefill, not just a nice optimization.

Source:

- https://jarvislabs.ai/blog/vllm-sglang-trtllm-comparison

### P0 - Speculative Decoding Is Required, But Must Be Profiled

JarvisLabs' vLLM speculative guide recommends starting with suffix decoding because it is low overhead: no extra draft checkpoint and no extra VRAM. Heavier paths like EAGLE/EAGLE-3 can be better for large models, but require matching speculator checkpoints and tuning.

Implementation impact:

- First profile: vLLM + suffix decoding.
- Second profile: vLLM + n-gram for repetitive agent outputs.
- Third profile: EAGLE/EAGLE-3 only when a matching speculator exists for the selected target model.
- Receipt must record TTFT, TPOT, ITL, output tokens/sec, acceptance behavior if available, and workload class.

Source:

- https://jarvislabs.ai/blog/speculative-decoding-vllm-faster-llm-inference

### P1 - MTP/DFlash Are Workload-Sensitive, Not Universal

JarvisLabs' Gemma 4 benchmark showed both MTP and DFlash beat baseline, but the winner changed by model architecture. On Gemma 4 31B dense, MTP was ahead; on Gemma 4 26B-A4B MoE, DFlash was ahead. Coding, math, and reasoning benefited more than open-ended writing/roleplay.

Implementation impact:

- Do not hard-code one speculative method as globally best.
- Benchmark against ORANGEBOX real prompt classes: code patching, manifest validation, RAG lookup, UI critique, and long-context synthesis.
- Use MTP/DFlash only when the served model has supported assistant/draft checkpoints and the benchmark receipt beats baseline.

Source:

- https://jarvislabs.ai/blog/gemma-4-mtp-vs-dflash-benchmark

### P1 - NVFP4 Blackwell Is a Real Hardware Signal

JarvisLabs' RTX PRO 6000 Blackwell article reports Qwen3-32B on vLLM with NVFP4 at roughly 2x BF16 throughput and no measurable loss on the two tested accuracy checks. This matters for future hardware decisions: Blackwell FP4 can make a 30B-class resident model much more practical.

Implementation impact:

- If renting or buying Blackwell-class hardware, add an NVFP4 profile for Qwen3-32B.
- Keep BF16/FP8 as control runs before trusting NVFP4.
- Treat NVFP4 as Blackwell-specific acceleration; do not assume the same result on non-FP4 hardware.

Source:

- https://jarvislabs.ai/blog/nvfp4-rtxpro-6000

### P1 - Qwen3.6 MTP in llama.cpp

JarvisLabs' Qwen3.6 tutorial shows a concrete MTP path through `llama.cpp` on RTX PRO 6000. This is not the same as the vLLM/SGLang production serving matrix, but it is too real to leave as an idea: when Qwen3.6 GGUF models are used, `llama.cpp` with `--spec-type draft-mtp` becomes a first-class benchmark profile.

Implementation impact:

- Add `llama_cpp_mtp` as an accepted accelerated profile.
- Require receipts for `llama.cpp` commit, model repo, quantization, `--spec-type draft-mtp`, `--spec-draft-n-max`, baseline tokens/sec, MTP tokens/sec, and draft acceptance.
- Keep SGLang/vLLM required for prefix-cache production lanes.

Source:

- https://jarvislabs.ai/blog/qwen36-mtp-llamacpp-rtxpro6000

### P1 - vLLM Optimization Stack

JarvisLabs' practical vLLM optimization guide names five useful knobs: prefix caching, FP8 KV-cache, CPU offloading, disaggregated prefill/decode, and sleep mode. The sleep-mode detail matters: KV cache is discarded during sleep and must be rebuilt after wake.

Implementation impact:

- Prefix caching and speculative decoding are mandatory profiles.
- FP8 KV cache is a candidate for memory-constrained long-context work.
- Sleep mode is useful for model swapping but cannot be treated as preserving prompt cache.
- Disaggregated prefill/decode is a future multi-GPU/multi-node architecture, not the first Beelink path.

Source:

- https://jarvislabs.ai/blog/vllm-optimization-techniques

### P2 - Disaggregated Prefill/Decode

JarvisLabs' disaggregated prefill/decode article is important, but it requires fast co-located worker networking for KV transfer. It is not a first single-machine upgrade.

Implementation impact:

- Put this behind a future `pd_split` profile.
- Require same-node multi-GPU, NVLink, InfiniBand, or at least a verified high-speed LAN before promotion.
- Use this later for cloud/H100/H200/B200 profiles or multi-worker AI Box builds.

Source:

- https://jarvislabs.ai/blog/llm-optimization-disaggregated-prefill-decode

### P2 - Parallelism and MoE Expert Parallelism

JarvisLabs' vLLM scaling articles are useful once hardware expands beyond one GPU. Tensor parallelism needs fast interconnect; pipeline parallelism can cross slower links but adds latency; expert parallelism matters for MoE models.

Implementation impact:

- Single GPU: prefer quantization, prefix cache, and speculative decoding before distributed complexity.
- Multi-GPU same node: test TP first.
- MoE: test `--enable-expert-parallel` and EPLB only when serving MoE models.
- Multi-node: prefer PP/DP patterns only after network proof.

Sources:

- https://jarvislabs.ai/blog/scaling-llm-inference-dp-pp-tp
- https://jarvislabs.ai/blog/expert-parallelism-mixed-strategies-vllm

### P2 - JarvisLabs CLI as Agent GPU Bridge

JarvisLabs' CLI is relevant because it is terminal-native and agent-friendly. It can provision GPU instances and install agent skills, making it a possible cloud burst lane for ORANGEBOX when local hardware is not enough.

Implementation impact:

- Treat `jl` as an optional cloud GPU adapter, not the local default.
- If enabled, require receipts for instance type, hourly cost, model image, launch command, teardown command, and no-secret logs.
- Keep subscription/local-first policy intact; cloud GPU is explicit operator-approved escalation.

Source:

- https://jarvislabs.ai/blog/introducing-jarvislabs-cli

## Upgrade Profiles

### Profile A - Local vLLM Baseline

```bash
vllm serve Qwen/Qwen3-32B \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype bfloat16 \
  --enable-prefix-caching
```

Use when:

- one GPU can hold the model and KV budget
- normal chat/code/RAG workloads dominate
- we need the fastest route to a strong baseline

### Profile B - vLLM Suffix Speculation

```bash
vllm serve <target-model> \
  --host 0.0.0.0 \
  --port 8000 \
  --enable-prefix-caching \
  --speculative-config '{"method":"suffix"}'
```

Use when:

- no matching draft model is available
- we need a low-overhead speculative first proof
- agent outputs are repetitive enough to benefit

### Profile C - SGLang Prefix Agent Lane

```bash
python -m sglang.launch_server \
  --model-path <target-model> \
  --host 0.0.0.0 \
  --port 30000
```

Use when:

- prompts share long system/tool/RAG prefixes
- structured generation matters
- RadixAttention/prefix reuse can reduce repeated prefill cost

### Profile D - Blackwell NVFP4

```bash
vllm serve RedHatAI/Qwen3-32B-NVFP4 \
  --host 0.0.0.0 \
  --port 8000 \
  --dtype auto \
  --enable-prefix-caching
```

Use when:

- Blackwell FP4 hardware is present
- BF16 and FP8 control runs exist
- accuracy checks pass on ORANGEBOX tasks

## Promotion Gate

Do not call the local LLM upgrade green until receipts prove:

- GPU or remote AI Box capability
- SGLang or vLLM installed
- OpenAI-compatible endpoint reachable
- prefix caching profile present
- at least one speculative profile tested
- baseline vs accelerated benchmark comparison
- rollback command or teardown path
