# Silent Canvas Big Build Addendum

Date: 2026-05-18
Author: Codex logic pass
Input: operator-provided Grok review of Silent Canvas + ORANGEBOX v6.3 scope
Status: additive scope doctrine, not a replacement for `SILENT_CANVAS_DOCTRINE.md`

## 0. Core Correction

The target is not "fastest possible ship."

The target is the biggest durable build: a native operator OS that can compound over years without losing the working system, the receipts, the operator's authority, or the product's taste.

Speed is useful only when it protects momentum. It is not the ranking metric. The ranking metric is durable capability per unit of complexity.

New build law:

> Do not optimize ORANGEBOX for a frantic demo. Optimize it for a decade of compounding operator advantage.

## 1. Verdict on the Grok Review

The Grok review is high-signal and should be adopted as a scope-pressure input, with one correction: reducing Phase 3 from eight surfaces to three should not lower the ambition. It should change the method.

Correct synthesis:

- Finish alpha.7 first because it closes an already-open loop.
- Add the missing native-egui realization layer so PDF/CSS language does not drift from desktop reality.
- Treat prompt assets as source code, versioned and tested.
- Add HSMP schema governance before the mutation grammar spreads.
- Promote MCPs through a generic bridge + verifier, not one-off integrations.
- Build a Surface Factory so eight surfaces become factory instantiations, not eight bespoke rewrites.
- Prefer quality compounding over speed theater.

## 2. Biggest-Possible Build Frame

ORANGEBOX should become five systems in one coherent cockpit:

1. Native Operator OS
   - Rust/egui desktop cockpit.
   - No browser memory tax.
   - No webview error page as the primary experience.
   - Local-first runtime data.

2. Silent Canvas Engine
   - Progress Dashboard: Objective, Milestone Roadmap, Application Summary.
   - Visual Telemetry Engine: motion as state, not decoration.
   - HSMP: versioned mutation language.
   - Codeless compilation: graph state maps to real files, commands, tests, and receipts.

3. Department + Agent Operating System
   - AE0-AE14 as routing law.
   - LIPS, MIRRORS, CHECKMATE, ORANGE, MISFITS, HACK_THE_PLANET as review pressure.
   - Agent jobs and background queue as the execution fabric.
   - Codexa as the heavy worker rail when configured.

4. Connector + MCP Fabric
   - 70+ connector registry.
   - AES vault and OAuth/PKCE.
   - Generic MCP bridge for remote MCP servers.
   - Tool-list, health, permission, and write-risk verification before promotion.

5. Compounding Knowledge + Proof System
   - Receipts as truth and training data.
   - Benefit metrics as product telemetry.
   - Prompt versions and few-shot corpora as evolvable assets.
   - Mistakes ledger and regression checks.

## 3. Native Visual Telemetry Realization

The PDF speaks in web/CSS terms. ORANGEBOX v6.x is native Rust/egui. The doctrine needs an explicit translation layer.

Required native primitive set:

- `TelemetryPulse`: short-lived pulse on mutated nodes.
- `DiffHalo`: before/after highlight around changed elements.
- `WireTrace`: animated path from source node to target node when a mutation applies.
- `MutationOriginBadge`: small label showing which milestone or HSMP mutation caused a visual change.
- `CanvasSnapshotScrubber`: time navigation over graph snapshots.
- `ReplayController`: play, pause, step, speed, and jump-to-receipt controls.
- `ReducedMotionMap`: one mapping table from full motion to low-motion equivalent.
- `PerfBudget`: maximum nodes, wires, pulse animations, and frame-time warning thresholds.

Native realization rule:

> Every visual promise in the PDF must map to an egui primitive, a fallback state, and a receipt-backed proof path.

## 4. Prompt Assets Become Product Assets

The Creative Brain and Fast Interpreter prompts must not live as anonymous strings buried in code.

Add:

- `prompts/silent-canvas/creative-brain/v1.md`
- `prompts/silent-canvas/fast-interpreter/v1.md`
- `prompts/silent-canvas/repair-interpreter/v1.md`
- `prompts/silent-canvas/fewshots/hsmp-success.jsonl`
- `prompts/silent-canvas/fewshots/hsmp-failures.jsonl`

Each prompt version should carry:

- purpose
- input contract
- output contract
- allowed schema version
- forbidden output patterns
- eval cases
- last passing parse-success rate
- receipt path for promotion

Prompt law:

> A prompt that affects HSMP output is code. It needs versioning, evals, receipts, and rollback.

## 5. HSMP Schema Versioning

Add `schema_version` to every HSMP payload and every stored mutation.

Minimum shape:

```json
{
  "schema_version": "hsmp-1.0.0",
  "producer": {
    "creative_prompt_version": "creative-brain/v1",
    "interpreter_prompt_version": "fast-interpreter/v1",
    "model_lane": "subscription-cli"
  },
  "mutations": [],
  "compatibility": {
    "min_compiler_version": "6.3.0-alpha.7",
    "migration_required": false
  }
}
```

Required modules:

- schema registry
- migration shim
- replay compatibility check
- receipt replay test
- compiler refusal path for unknown future schemas

Do not allow unversioned HSMP past alpha.7.

## 6. Generic MCP Bridge + Verifier

The MCP scope should not become a pile of custom one-off integrations.

Add a generic MCP bridge with:

- remote URL registration
- local stdio server registration
- vault-backed auth binding
- tool-list probe
- health probe
- permission/risk classifier per tool
- read-only default mode
- write-action approval gate
- prompt-injection sandbox note for every tool result
- receipt on every tool call

Suggested endpoint family:

- `GET /api/v4/mcp/servers`
- `POST /api/v4/mcp/register`
- `POST /api/v4/mcp/probe/:server_id`
- `GET /api/v4/mcp/tools/:server_id`
- `POST /api/v4/mcp/call`
- `POST /api/v4/mcp/disable/:server_id`

Promotion states:

- `candidate`
- `verified_read`
- `verified_write_guarded`
- `disabled`
- `blocked`

MCP law:

> Official does not mean safe. Every write-capable MCP starts read-only until ORANGEBOX proves health, tool list, permissions, receipts, and rollback posture.

## 7. MCP Verification Update

Evidence checked on 2026-05-18:

- TikTok Ads MCP: official TikTok newsroom confirms TikTok Ads Model Context Protocol Server announced at TikTok World 2026.
- Google Ads MCP: official `googleads/google-ads-mcp` repository exists and provides an MCP server for Google Ads API.
- Pipeboard: live vendor site advertises Meta, Google, TikTok, Snap, and Reddit ads MCP endpoints with OAuth flow.
- Meta Ads MCP: high-confidence official signal from multiple current secondary sources naming `https://mcp.facebook.com/ads`; still probe endpoint/tool-list before any write use.
- StackGen: keep verification-required; enterprise IaC risk profile is different from lightweight ads/reporting MCPs.

Recommended posture:

| MCP | State | Action |
|---|---|---|
| Meta Ads MCP | official-high-confidence | register + probe, read-only first |
| TikTok Ads MCP | official-confirmed | register + probe, read-only first |
| Google Ads MCP | official-repo-confirmed | pin `googleads/google-ads-mcp`, install/probe |
| Pipeboard | vendor-confirmed | register/probe, evaluate business/privacy fit |
| Firecrawl MCP | install-safe with key | register, keep crawl limits |
| Claude Flow | topology candidate | compare with existing subagent model |
| Repomix MCP | install-safe | register, use for code-packaging jobs |
| StackGen MCP | verification-required | hold write paths |

## 8. Surface Factory Pattern

The Phase 3 ambition should remain large, but the method must change.

Do not build eight surfaces as eight custom apps.

Build a Surface Factory:

- surface manifest
- project graph seed
- default HSMP mutation pack
- shared chrome contract
- shared receipt taxonomy
- shared proof checklist
- shared onboarding microcopy
- shared empty state pattern
- surface-local capability flags
- surface-local risk gates

First three surfaces should prove the factory:

1. Create Surface
   - Silent Canvas for artifact creation.
   - Best proving ground for visual telemetry and HSMP compile.

2. Learn Surface
   - Compression, teaching, corpus digestion, source-ledger learning.
   - Best proving ground for memory, prompt evolution, and benefit regression.

3. Social / Growth Surface
   - Connector/MCP/ad architecture meets real workflow.
   - Best proving ground for MCP bridge, rules engine, and kill-switches.

After those three are excellent, use the factory to instantiate the remaining surfaces.

Phase 3 law:

> Eight surfaces is the ambition. Three excellent surfaces plus a proven Surface Factory is the quality gate.

## 9. Pipeline Observatory

Add an operator-openable diagnostic lane or ghost:

Creative Brain plan -> Fast Interpreter JSON -> HSMP validation -> applied diff -> receipts.

It should include:

- raw plan viewer
- extracted HSMP viewer
- schema validation result
- mutation diff
- visual replay link
- prompt versions used
- model lane used
- cost/latency/parse metrics
- repair attempts

This is not the main UX. It is the engineering truth window when Silent Canvas behavior is wrong.

## 10. Benefit Regression Loop

`benefits.mjs` should become a gate, not a passive report.

Track:

- median cost
- p95 cost
- objective render latency
- roadmap render latency
- first mutation latency
- summary latency
- HSMP parse success
- repair success
- unknown schema refusal count
- replay success count

Add warnings:

- `benefit-regression-cost`
- `benefit-regression-latency`
- `benefit-regression-parse`
- `benefit-regression-replay`

Build gate:

> A release cannot call Silent Canvas improved unless at least one benefit improves and none of the protected benefits regress beyond threshold.

## 11. Ad Rules Engine Safety

The ad architecture can stay in scope, but it needs global safety.

Add:

- global pause all rules
- simulation-only mode
- spend cap per account
- spend cap per day
- write action dry-run diff
- human approval threshold
- rollback/restore last known config when platform supports it
- policy risk note per platform
- receipt per mutation

Ad law:

> An ads MCP can spend real money faster than a model can apologize. Write paths require simulation, cap, approval, and receipts.

## 12. Big-Build Order

The order is not "fastest to market." The order is "highest compounding substrate first."

1. Close alpha.7 without widening dirty state.
2. Add native telemetry doctrine and HSMP schema versioning.
3. Add prompt asset registry and first few-shot corpus.
4. Add MCP bridge + verifier.
5. Add replay mode and Pipeline Observatory.
6. Add benefit regression gates.
7. Ship alpha.7 with receipts and ledger.
8. Start Phase 1 as Silent Canvas 1.0 GA work.
9. Start Surface Factory before attempting more than three major surfaces.

## 13. Subtractions

No major feature must be cut now.

But three behaviors must be rejected:

- New framework sprawl before the current substrate is coherent.
- Custom MCP integrations without a generic bridge.
- More surface count before Surface Factory proves reuse.

## 14. Final Recommendation

Recommendation: conditional proceed, bigger and cleaner.

Conditions:

1. Finish alpha.7.
2. Add native visual telemetry doctrine.
3. Add HSMP schema versioning.
4. Add prompt assets and few-shot harness.
5. Add MCP bridge skeleton before installing MCPs broadly.
6. Reframe Phase 3 around Surface Factory, not raw surface count.

This path keeps the enormous ambition and removes the frantic failure mode.

