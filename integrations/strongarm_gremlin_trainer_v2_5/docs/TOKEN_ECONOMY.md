# Token Economy

## Core law

Never spend tokens on model conversation when a structured packet is enough.

## Approximate local memory planning

Very rough GGUF-style estimates before KV cache and runtime overhead:

| Model size | Q4 rough | Q5 rough | Q8 rough |
|---:|---:|---:|---:|
| 3B | 2–3 GB | 3 GB | 4–5 GB |
| 8B | 5–6 GB | 6–7 GB | 9–10 GB |
| 14B | 9–11 GB | 11–13 GB | 16–18 GB |
| 24B | 15–18 GB | 18–22 GB | 28–32 GB |
| 32B | 20–24 GB | 24–30 GB | 38–42 GB |
| 36B | 23–28 GB | 28–34 GB | 43–48 GB |
| 70B | 42–50 GB | 50–60+ GB | 80+ GB |

For your box, the sweet spot is not one giant 70B all day. The sweet spot is:

- 1.7B–4B judges
- 14B council
- 24B/30B/32B/36B Judgement when needed
- Colab for training and larger experiments

## Budget modes

Cheap:

```text
Librarian + Misfit + STRONGARM → Judgement
```

Normal:

```text
Librarian + Forge + Mirror + Misfit + STRONGARM → Judgement
```

Deep:

```text
All packets + stronger local Judgement
```

## Compression rule

A role packet should be smaller than the user's prompt.

If the packet is longer than the prompt, it is probably failing.
