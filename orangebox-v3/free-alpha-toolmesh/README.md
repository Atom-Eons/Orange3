# Orangebox V3 Free Alpha ToolMesh

ToolMesh is the Orangebox V3 registry and promotion layer for free, local-first, open, or warrant-gated tools.

It does not replace TriLane, STRONGARM, receipts, or the V3 ghost-worktree law. It gives Orangebox a controlled way to know which outside tools exist, what they are allowed to do, how to prove them, and when they are promoted.

## Current State

- Y0 registry/control-plane is active.
- Y1-Y9 labs are scoped and doctor-gated.
- Tool execution is blocked until a lab doctor, benchmark, STRONGARM gate when risky, and receipt are present.
- Cloud tools require explicit warrant and must not store secrets in receipts.
- Heavy local tools declare VRAM/RAM, concurrency locks, and whether LLM lanes must unload.
- Binary artifacts return pointers and hashes, never raw bytes through the router.
- GUI tools default to workspace prep until headless execution is proven.

## Lab Waves

- Y1 Image Lab
- Y2 Design Lab
- Y3 Audio Lab
- Y4 Video Lab
- Y5 Coding Lab
- Y6 Automation Lab
- Y7 Analytics / MarketOps
- Y8 PublicAgent
- Y9 Observability / Security / ReleaseOps
- Alpha Watchlist

Run:

```bash
npm run toolmesh:doctor
npm run toolmesh:list
npm run toolmesh:route -- "make an image proof pack"
```
