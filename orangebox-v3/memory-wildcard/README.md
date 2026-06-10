# K3 Cold Truth Finder

K3 is the Orangebox V3 semantic pointer index. It is a card catalog, not the library.

Rules:

- Cold Truth remains on disk.
- Receipts remain authoritative.
- SOUL GENOME remains constitutional.
- AtomSmasher remains the compression/work compiler.
- K3 returns paths, hashes, scores, and authority levels.
- Cold Truth Gate opens the physical file before anything enters context.
- No chat archive indexing in W1.
- No cloud calls.
- One shared data root may see multiple repo copies; K3 prefers the active repo root and collapses duplicate same-hash cards.
- If Ollama embeddings are unavailable, K3 remains green in lexical/alias fallback mode and reports degraded recall honestly.

Commands:

```powershell
bun orangebox-v3/memory-wildcard/k3-cli.ts init
bun orangebox-v3/memory-wildcard/k3-cli.ts doctor
bun orangebox-v3/memory-wildcard/k3-cli.ts index receipts
bun orangebox-v3/memory-wildcard/k3-cli.ts index primers
bun orangebox-v3/memory-wildcard/k3-cli.ts index chat
bun orangebox-v3/memory-wildcard/k3-cli.ts query "heavy memory compiler"
bun orangebox-v3/memory-wildcard/k3-cli.ts bench
```

`index chat` is intentionally a no-op in W1. It emits proof that chat archive indexing did not happen.
