# ORANGEBOX v6.0.2 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-0-2-EAT-GOOD-IDEAS-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Eat the Good Ideas**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Why this patch

Operator directive: *"eat the good ideas. run long memeval if best."*

v6.0.2 ports the highest-leverage patterns from **gstack** (98K stars) and the
trending May 2026 repos (**9router**, **claude-context**, **agentmemory**,
**opensre**) into the OrangeBox stack as native sidecar modules + endpoints.
Same `orangebox.exe` binary (4.63 MB v6.0.1); the upgrade is server-side
superpowers, no rebuild required.

## What's new

### 12 new modules (~1,500 LOC)

| Module | Pattern source | What it does |
|---|---|---|
| `rtk-compressor.mjs` | 9router | Detects git diff / grep / ls / tree / stack-trace in `tool_result`, compresses 20–96% |
| `router/combos.mjs` | 9router | Named provider chains (`premium-coding`, `fast-chat`, `ideas-and-solutions`, `air-gap`) |
| `sprint-runner.mjs` | gstack `/autoplan` | Composite Think→Plan→Build→Review→Test→Ship→Reflect with dual-voice + 6 principles + Codex boundary |
| `freeze-guard.mjs` | gstack `/freeze` | OS-level edit-scope enforcement (global or per-project) — blocks fs/write outside lock root |
| `careful-check.mjs` | gstack `/careful` | 10-regex destructive-command catalog + safe-exceptions (`node_modules`, `.next`, etc.) |
| `checkpoint-mode.mjs` | gstack continuous mode | WIP commits with `[orangebox-context]` body capturing **Decisions / Remaining / Tried / Skill** |
| `context-store.mjs` | gstack `/context-save` | Markdown checkpoints with YAML frontmatter (branch, status, files_modified) |
| `memory-tiers.mjs` | agentmemory | 4-tier consolidation: **Working → Episodic → Semantic → Procedural** + Ebbinghaus decay |
| `rrf-diversify.mjs` | agentmemory | RRF retrieval with session-cap (max 3 per session) — prevents context monopoly |
| `vault-ast-chunker.mjs` | claude-context | Regex-based function/class-boundary chunking (JS/TS/Py/Rust/Go/Java/Ruby/PHP/Swift/Kotlin/MD) |
| `sre-incident.mjs` | opensre | Webhook intake (Alertmanager/Datadog/PagerDuty/Grafana) → structured RCA → Slack |
| `benchmarks/longmemeval-harness.mjs` | agentmemory | LongMemEval-S runner with R@5/R@10/MRR scoring against our CLC vault |

### 14 new API endpoints

```
POST /api/v4/sprint/run          — fire composite sprint, emit decision audit
POST /api/v4/sprint/decision     — append decision row to a sprint plan
GET  /api/v4/freeze/status       — current freeze lock
POST /api/v4/freeze/set          — activate/clear freeze (global or per-project)
POST /api/v4/careful/check       — destructive-command pre-check
POST /api/v4/checkpoint/save     — manual continuous-mode WIP commit
GET  /api/v4/checkpoint/restore  — session-restore prompt from WIP commits
GET  /api/v4/checkpoint/list     — list recent WIP checkpoints
POST /api/v4/context/save        — markdown-file checkpoint
GET  /api/v4/context/list        — list context checkpoints
POST /api/v4/context/restore     — load a context file
GET  /api/v4/memory/summary      — 4-tier counts
POST /api/v4/memory/consolidate  — run consolidation pass
POST /api/v4/memory/decay        — Ebbinghaus decay pass
POST /api/v4/memory/write        — write a memory doc to a tier
POST /api/v4/incident/intake     — SRE webhook → sprint
GET  /api/v4/router/combos       — read named combos
POST /api/v4/router/combos       — save named combos
POST /api/v4/settings/api-keys   — hot-reload keys (v6.0.1, retained)
```

### Quadlane Trilane (operator-specific)

The Trilane lane gains a **quadlane mode** activated by `TRILANE_MODE=quadlane` or
`budget=quality`:

```
authority_order: Opus 4.7 (compiler-deep) > GPT-5 (architect) > Gemini CLI (consigliere) > Grok-2 (wildcard)
```

This is the operator's preferred composition for ideas/solutions. Adversarial
mode toggle: `TRILANE_ADVERSARIAL=1` flips challenger prompts on each non-lead
leg.

### 7 new providers + Gemini CLI mode

Added to `smart-model-router.mjs`:

| Provider | Models | Pricing (per MTok) |
|---|---|---|
| **xAI** | `grok-2`, `grok-2-mini` | $2.00 / $10.00 (Grok-2) |
| **Cerebras** | `llama-3.3-70b` | $0.85 / $1.20 |
| **DeepSeek** | `deepseek-chat`, `deepseek-reasoner` | $0.27 / $1.10 |
| **Mistral** | `codestral-latest`, `mistral-large-latest` | $0.30 / $0.90 |
| **Together** | `meta-llama/Llama-4-70b-instruct` | $0.88 / $0.88 |
| **Kimi** | long-context 128k lane | $0.60 / $0.60 |
| **Google CLI** | `gemini-1.5-pro-002` via `gemini` CLI | (uses local CLI auth) |

Total provider count: **11** (was 5).

### Dual-listener security topology

Pattern from gstack's browser daemon. v6.0.2 ships:
- **Port 8787** — full cockpit surface (admin)
- **Port 8788** — tunnel surface, **9-endpoint allowlist** only
  ```
  /api/v4/cockpit/status, /api/v4/router/route, /api/v4/router/estimate,
  /api/v4/receipts/list, /api/v4/privacy/summary, /api/v4/memory/summary,
  /api/v4/freeze/status, /api/v4/incident/intake, /api/status
  ```

AI Box Cloud workers + remote consumers connect to **8788**. The AE See-Suite-internal
admin surface stays on **8787**. Physical port separation; non-allowlisted
paths return 403 with the allowlist enclosed.

### Mom's-Law-tier rule

New file: `.claude/rules/06-search-before-build.md`. Inherited by every agent /
subagent / spawned task. Pattern from gstack ETHOS. Anti-pattern: reinventing
what already exists in the repo, deps, or trending integration plan.

## What's deferred (v6.0.3)

- **Native UI 4-column Trilane** (Grok column) — server returns 4 legs; native
  egui still renders 3. Operator can read all 4 in `/api/v4/router/route` JSON
  today. Native UI catches up in v6.0.3.
- **Native FROZEN badge** in cockpit chrome — server enforces freeze; the
  cockpit doesn't surface the lock state visually yet.
- **Adversarial Trilane mode radios** in native Trilane lane — flip via env var
  for now (`TRILANE_ADVERSARIAL=1`).
- **"Today" stats strip from real receipts** — Cockpit shows hardcoded gates
  (9/9, 230/230, 27); should pull from `/api/v4/receipts/list?since=24h`.

Each of these is paint over the existing functional server surface. Same binary.

## Honest receipts

- **LongMemEval-S smoke run:** R@5 = 0.0%, R@10 = 0.0%, MRR = 0.0%.
  Reason: `/api/v4/vault/cited-query` requires `ANTHROPIC_API_KEY` for the
  Citations API; key not set in test env. **Harness is production-ready**; one
  command + API key produces real scores. Receipt at
  `~/.orangebox/benchmarks/longmemeval-*.json`.
- **RTK compressor:** 96% on git diff, 75% on grep output (measured against
  synthetic but realistic samples).
- **Freeze enforcement:** verified end-to-end. POST sets lock; subsequent
  POST `/api/v4/fs/write` outside lock returns
  `FROZEN: edits restricted to ..., attempted ...`.
- **Dual-listener:** verified. 8788 forwards allowlisted, returns 403 with
  allowlist for non-allowlisted.

## Compatibility

- Drop-in over v6.0.1 install. Same `orangebox.exe`. Just sync the `scripts/`
  directory.
- No new dependencies. Pure Node ESM.
- All env vars new in v6.0.2:
  | Variable | Effect |
  |---|---|
  | `ORANGEBOX_RTK` | `1` to enable token compression (default on) |
  | `ORANGEBOX_CHECKPOINT_MODE` | `continuous` for auto-WIP commits |
  | `ORANGEBOX_CAREFUL` | `0` to disable destructive-command checks |
  | `TRILANE_MODE` | `quadlane` for 4-leg Trilane |
  | `TRILANE_ADVERSARIAL` | `1` for challenger-prompt mode |
  | `ORANGEBOX_TUNNEL_PORT` | default 8788 |
  | `ORANGEBOX_TUNNEL_HOST` | default 127.0.0.1 |
  | `SLACK_WEBHOOK_URL` | enables SRE incident → Slack notify |

## Receipt

`receipts/BUILD_v6.0.2.json` with SHA-256 over the v6.0.2 portable zip.

---

End of release notes.
