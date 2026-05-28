# ORANGEBOX v6.1.0 — Release Notes

**Disclosure ID:** `ATOM-OBX-V6-1-0-AGENTMODE-2026-0517`
**Ship Date:** 2026-05-17
**Codename:** **Agent Mode**
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Headline

**OrangeBox enters the agentic tool-using IDE category.**

v6.1.0 is the **Agent Mode** release: a real Claude-style multi-turn tool-using loop on the operator's actual workspace, a repo indexer, Cursor-class tab autocomplete in the IDE, and a parallel job queue. This is the release that puts OrangeBox in the same conversation as Cursor, Codex, and Claude Code — with the sovereignty / receipts moat they don't have.

---

## The four big features

### 1. Agent lane — real tool-using loop (Ctrl+A)

A new **AGENT** lane in the left rail.
- **Goal box** — type a multi-line goal (e.g. "Find every TODO in scripts/v4 and add a one-line fix-by date").
- **Workspace + max-steps** controls.
- **Launch agent ➤** — POSTs to `/api/v4/agent/run`, returns a job ID immediately.
- Behind the scenes: `scripts/v4/agent-loop.mjs` opens a multi-turn conversation with Claude Sonnet 4.5 using **9 real tools**:
  - `read_file` — read up to 200KB UTF-8
  - `write_file` — create / overwrite (freeze-guarded, sha256 chain captured)
  - `edit_file` — surgical exact-substring replace with unique-substring guard
  - `grep` — recursive regex search with file-extension glob filter
  - `glob` — find files matching a pattern
  - `list_dir` — directory listing with type tags
  - `run_cmd` — shell exec inside workspace with 30s timeout (refuses destructive commands)
  - `vault_search` — local keyword index across .md/.mjs/.ts/.rs/.py
  - `finish` — terminate with one-paragraph summary
- **Background execution**: the agent runs in `scripts/v4/agent-jobs.mjs` job table; UI polls `/api/v4/agent/status/<id>` every 1.5s.
- **Live log panel**: every step renders as `[STEP] #n` / `[CALL] tool(args)` / `[RESULT] tool: ok|error` / `[MODEL]` text / `[FINISH]` summary / `[ERROR]`.
- **Cancel button** flips a cancel token mid-flight; the next loop iteration returns gracefully.
- **History list** — most recent 20 jobs with state pills (RUNNING/FINISHED/CANCELLED/FAILED). Click to re-load.
- **Receipt on finish** — `agent-run` source with evidence: `{job_id, state, step_count, in_tokens, out_tokens, final_summary, tool_calls}`. Full audit chain.

### 2. Repo indexer — Cursor's secret, made local

`scripts/v4/repo-indexer.mjs` walks the workspace and captures, per file:
- absolute path, byte size, language tag (from extension)
- top-level **symbols** (functions, classes, structs, types, traits, impls) via cheap regex extractors per language (js/ts/rust/python/go currently)
- 200-char preview, sha256 prefix

Endpoints:
- `POST /api/v4/repo/index { workspace, max_files }` → builds in-memory index, returns summary, emits `repo-index` receipt
- `GET /api/v4/repo/summary?workspace=` → `{ file_count, total_symbols, langs, took_ms }`
- `GET /api/v4/repo/find-symbol?workspace=&name=` → exact-match hits across all files
- `GET /api/v4/repo/symbol-prefix?workspace=&prefix=` → first 20 prefix matches

Live benchmark: `scripts/` workspace = **303 files / 1533 symbols / 6.7s** to index on Windows w/ NVMe. Skips `node_modules`, `target`, `.git`, binary extensions.

This is a fast keyword/symbol index — not vector embeddings (that's v6.2 with a real sqlite-vec store). But it's enough for "where is X defined" / file-relevance ranking, which is 80% of Cursor's index value.

### 3. Tab autocomplete in IDE — Cursor-killer

`scripts/v4/tab-complete.mjs` powers a real inline ghost-text completion in the IDE lane:
- **Endpoint**: `POST /api/v4/ide/complete { prefix, suffix, language, file_path }` → returns `{ completion, cached, tokens_in, tokens_out, latency_ms }`
- **Model**: Claude Haiku 4.5 by default (fast + cheap; right tier for autocomplete)
- **Cache**: 30s TTL, 200-entry cap, MD5-keyed on `(prefix tail 256, suffix head 128, language)` → repeated requests cost nothing
- **System prompt** explicitly tells the model: continuation only, no fences, no commentary, 1-3 lines max, stop at natural break
- **Native UI**: in IDE lane, toolbar shows:
  - "Tab-complete" checkbox (operator toggle)
  - State indicator: `● requesting suggestion…` / `ghost: <preview>` / `(idle · type, then Ctrl+Space to request)`
  - "Accept (Tab)" + "Reject (Esc)" buttons when a ghost is staged
- **Keyboard**: `Ctrl+Space` triggers a request based on current buffer; `Tab` appends ghost text to buffer; `Esc` dismisses
- **Cyan ghost-text preview panel** rendered below the IDE buffer showing the suggestion before it lands

This is the moat. Cursor's $20/month tab-complete is now your local + sovereign + receipted equivalent. The completion is auditable in the privacy lane.

### 4. Background job queue (Codex-parallel)

`scripts/v4/agent-jobs.mjs` is an in-process job table that:
- holds running + finished agent jobs (LRU eviction at 100)
- each job has its own cancel token, log buffer (last 500 events), and a result
- emits a receipt on finish (success / cancel / error) — every job is provable
- supports `list({limit})`, `status(id)`, `cancel(id)`, `start({...})`

This is the foundation for v6.2's parallel-task UI (Codex-style "spawn 5 agents on this PR" pattern). For v6.1.0, the AGENT lane uses it to render the recent-history list and to cancel mid-flight runs.

---

## New server endpoints (v6.1.0)

```
POST /api/v4/agent/run                         — start a tool-using agent run
GET  /api/v4/agent/status/:id                  — full status incl. log_tail[30]
POST /api/v4/agent/cancel/:id                  — flip cancel token
GET  /api/v4/agent/list?limit=N                — recent jobs (LRU)
POST /api/v4/repo/index                        — build workspace index (emits receipt)
GET  /api/v4/repo/summary?workspace=           — summary { files, symbols, langs }
GET  /api/v4/repo/find-symbol?workspace=&name= — exact symbol search
GET  /api/v4/repo/symbol-prefix?workspace=&prefix=  — prefix search (20 hits)
POST /api/v4/ide/complete                      — Haiku tab-complete request
POST /api/v4/ide/complete/clear-cache          — drop suggestion cache
GET  /api/v4/ide/complete/cache-stats          — cache size / TTL / max
```

That's 11 new endpoints. Smoke-60 covers 10 of them; #11 (`clear-cache`) is trivial.

---

## New receipt source (v6.1.0)

| Source | Endpoint | Emits when |
|---|---|---|
| `agent-run` | `POST /api/v4/agent/run` (on job finish) | every agent run finishes, fails, or is cancelled |
| `repo-index` | `POST /api/v4/repo/index` | every index build |

That's 20 documented receipt sources in v6.1.0.

---

## Why this beats incumbents

| Feature | OrangeBox v6.1.0 | Cursor | Codex | Claude Code |
|---|---|---|---|---|
| Tool-using agent loop | ✓ local + audited | ✗ (Composer is one-shot) | ✓ cloud only | ✓ terminal only |
| Tab autocomplete | ✓ Haiku, 30s cache | ✓ proprietary | ✗ | ✗ |
| Repo index | ✓ in-memory, fast | ✓ vector cloud | ✗ | partial |
| Background tasks | ✓ in-process queue | partial | ✓ | ✓ via worktrees |
| Receipts on every action | ✓ 20 source taxonomy | ✗ | partial | ✗ |
| Native binary | ✓ Rust egui 5MB | Electron | web | terminal |
| Sovereignty / no-telemetry | ✓ default-off | ✗ | ✗ | partial |
| Multi-model vote | ✓ Trilane/Quadlane | ✗ | ✗ | ✗ |
| Æ Alpha curated X feed | ✓ unique | ✗ | ✗ | ✗ |
| Vault inline citations | ✓ `[1]` markers + sources | ✗ | ✗ | partial |
| Composer SHA-256 chain | ✓ full diff audit | ✗ | ✗ | ✗ |
| Cost: full feature set | $0 + provider tokens | $20/mo | $20/mo (preview) | $20/mo (Pro) |

The honest moat: **sovereignty + receipts + multi-model**. Nothing else has all three.

---

## Build verification (live)

| Check | Result |
|---|---|
| `cargo build --release --bin orangebox` | exit 0 in 4m 10s |
| `orangebox.exe` size | 5,217,792 bytes (4.98 MB) |
| `orangebox-v6.1.0-portable.zip` | 36,756,107 bytes (35.05 MB) · sha256 `4b1c857b6c7ddf5ba95d1ab38e43503d1e6362106e53dfa5454dc9b9d07bf48e` |
| Smoke-60 audit | **60 / 60 PASS · 0 fail** (`docs/SMOKE_v6.1.0_*.md`) |
| Native UI launches and stays resident | PID 18264, 178 MB working set |
| Repo index live benchmark | 303 files · 1533 symbols · 6.7s |
| Agent run rejects no-API-key | 502 (correct) |
| Agent cancel non-existent job | `{ok:false, error:"no such job"}` (correct) |
| Tab-complete empty prefix | `{completion: "", reason: "empty prefix"}` (correct) |

---

## Compatibility

- Drop-in over v6.0.11. Same Rust crate set. No new dependencies.
- All v6.0.10 + v6.0.11 features preserved verbatim.
- Settings file format unchanged (additive ENV keys for prefs).
- AE Alpha anchors / receipts / trilane votes / freeze state all migrate untouched.

---

## What's deferred to v6.2

- **Vector embeddings repo index** (replace keyword index with sqlite-vec store + Voyage/Cohere embeddings)
- **Parallel agent tasks UI** — spawn N concurrent runs, render a grid (Codex pattern)
- **Inline editor diff preview** — show the agent's proposed file edits as +/- gutters before apply
- **MCP server mode** — turn OrangeBox itself into an MCP server other tools (Claude Code, Cursor) can call into for receipts + agent + repo index
- **Cursor-style "Composer Agent" mode** — combine agent loop with the multi-file Composer scaffold for one-shot whole-feature PRs
- **Voice live mic capture** (cpal) — still WAV-upload only
- **PTY ANSI terminal** — still cmd /C

These are NAMED, not hidden.

---

## Operator quickstart

1. Extract `orangebox-v6.1.0-portable.zip` anywhere on Windows
2. Run `orangebox.exe`
3. Press `Ctrl+,` → paste your `ANTHROPIC_API_KEY` (Haiku for tab-complete + Sonnet for agent)
4. Press `Ctrl+A` → AGENT lane → type a goal → **Launch agent ➤**
5. Watch the live log fill in as the model reads files, calls tools, edits code
6. After it finishes, check `Ctrl+8` Receipts lane — the `agent-run` receipt is right there, with every tool call as evidence

For tab-complete: `Ctrl+2` → IDE → load any file → start typing → press `Ctrl+Space` → see suggestion → `Tab` to accept, `Esc` to reject.

End of v6.1.0 release notes.
