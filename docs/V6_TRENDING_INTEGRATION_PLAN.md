# OrangeBox v6 — GitHub Trending Integration Plan (May 2026)

**Disclosure ID:** `ATOM-OBX-V6-TRENDING-2026-0517`
**Source:** github.com/trending?since=monthly (top 25, May 2026)
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
**Mom's Law:** Real parts. No scaffold. Adopt by leverage, not novelty.

---

## Scanned (all 5 high-relevance repos, deep-fetched)

| Rank | Repo | This-month stars | Why it matters |
|---|---|---|---|
| 1 | **decolua/9router** | +8,431 | Local proxy, 40+ providers, token compression, 3-tier failover |
| 2 | **anthropics/financial-services** | +16,163 | Domain-specific Claude apps — not relevant to our infra |
| 3 | **zilliztech/claude-context** | +5,285 | MCP code search, AST chunking, Merkle-tree incremental indexing |
| 4 | **Tracer-Cloud/opensre** | +4,294 | AI SRE incident-response agent, 60+ observability integrations |
| 5 | **rohitg00/agentmemory** | +8,330 | **R@5=95.2% on LongMemEval-S**, 4-tier memory, Ebbinghaus decay, 12 hooks |
| 6 | **heygen-com/hyperframes** | +18,580 | "HTML → video for agents" — not relevant |
| 7 | **thunderbird/thunderbolt** | +4,595 | Tauri+React enterprise "AI you control" — **confirms our native moat** |

---

## ADOPT NOW (v6.0.2)

### 1. RTK token compression (from 9router)
**ROI:** 20–40% token savings on every multi-file edit / vault query / tool_result fan-out. Pays for itself immediately on every Anthropic call.

9router's "RTK Token Saver" auto-detects `git diff`, `grep`, `ls`, `tree` output in `tool_result` blocks and compresses them. Safe by design: errors silently keep original text.

**Our impl (`scripts/v4/rtk-compressor.mjs`, ~150 LOC):**
- Middleware in `anthropicCall()` + `anthropicStream()` + `openaiStream()`: scans outbound `tool_result` content
- Patterns:
  - `git diff` output → keep `+`/`-`/header lines, drop unchanged context lines
  - `grep` output → collapse run-of-similar lines
  - `ls -la` / `tree` → keep depth-2, summarize deeper as `... N more`
  - Stack traces → keep top + bottom frames, summarize middle
- Reversible — original always kept in `--debug` mode
- Receipt emits `tokens_saved` field per call

### 2. Named combos in smart-model-router (from 9router)
**ROI:** Operator-defined task→model chains. Replaces hardcoded budget tiers.

9router's "combos" example:
```
Combo: "premium-coding"
  1. cc/claude-opus-4-7  (Subscription primary)
  2. glm/glm-5.1         (Cheap backup, $0.6/1M)
  3. minimax/MiniMax-M2.7 (Cheapest fallback, $0.20/1M)
```

**Our impl (`scripts/v4/router/combos.mjs`, ~80 LOC):**
- New file `~/.orangebox/router/combos.json`:
  ```json
  {
    "premium-coding":  ["anthropic:opus-4-7", "groq:llama-3.3-70b", "ollama:qwen2.5:7b"],
    "fast-chat":       ["groq:llama-3.3-70b", "anthropic:haiku-4-5", "ollama:qwen2.5:7b"],
    "air-gap":         ["ollama:qwen2.5:7b", "ollama:llama3.2:3b"]
  }
  ```
- `route()` accepts `combo: "premium-coding"` and walks the list on failure
- Settings lane: combos editor (text-area JSON), one-click presets

### 3. Five new providers (from 9router's 40+ list)
**ROI:** More fallback breadth + cheaper alternatives + cross-vendor adversarial Trilane options.

Add to `smart-model-router.mjs` MODELS + PRICING tables:
- **Cerebras** (`cerebras:llama3.3-70b`) — 18× LPU-class inference, OpenAI-compatible
- **DeepSeek** (`deepseek:deepseek-chat`) — cheapest frontier-tier ($0.27/$1.10 per MTok)
- **Mistral** (`mistral:codestral-latest`) — best non-Anthropic for code
- **Together AI** (`together:meta-llama/Llama-4-...`) — many open-weights, cheap
- **Kimi** (long-context 128k lane) — strong long-context cheap

**LOC: ~200** across MODELS, PRICING, fallbacks tables.

### 4. AST-based vault chunking (from claude-context)
**ROI:** Better retrieval relevance — chunks are functions/classes, not arbitrary line splits.

claude-context uses an AST splitter for TypeScript / JavaScript / Python / Java / C++ / C# / Go / Rust / PHP / Ruby / Swift / Kotlin / Scala / Markdown, with a LangChain character-based fallback. We currently chunk on line offsets, which can split a function mid-body.

**Our impl (`scripts/v4/vault-ast-chunker.mjs`, ~120 LOC):**
- Use `tree-sitter` WASM bindings (no native build needed) for major languages
- Each chunk = one function / class / top-level binding
- Falls back to 800-char windows for unknown languages
- Stored chunk metadata: `{ file, lang, kind: 'function'|'class', name, start_line, end_line }`

### 5. Session diversification in RRF retrieval (from agentmemory)
**ROI:** Prevents one chatty session from monopolizing the top-k. Tiny fix, big quality win.

agentmemory enforces: **max 3 results per session** in the RRF output. Our current vault retrieval could return 10 chunks all from the same recent file.

**Our impl (~30 LOC in `vault-cited-query` handler):**
```js
function diversifyBySession(ranked, perSessionCap = 3) {
  const counts = new Map();
  const out = [];
  for (const item of ranked) {
    const key = item.session_id || item.file_path;
    const n = counts.get(key) || 0;
    if (n >= perSessionCap) continue;
    counts.set(key, n + 1);
    out.push(item);
  }
  return out;
}
```

### 6. 4-tier memory consolidation pipeline (from agentmemory)
**ROI:** Our biggest missing piece. agentmemory's tiered model (Working → Episodic → Semantic → Procedural) is the architecture our compound-intelligence has been gesturing at. Their benchmark: R@5 = 95.2% on LongMemEval-S vs BM25-only 86.2%.

**Our impl (`scripts/v4/memory-tiers.mjs`, ~200 LOC):**
- New dirs under data_root:
  ```
  memory/
    working/      ← raw tool_result snapshots (last 24h)
    episodic/     ← session summaries (auto-distilled from working)
    semantic/     ← extracted facts: "we use Anthropic Sonnet 4.5 for chat"
    procedural/   ← workflow patterns: "/sprint = CEO→Eng→QA→Ship"
  ```
- Nightly consolidator (`POST /api/v4/memory/consolidate` + cron-like 24h timer):
  - Working → Episodic: summarize sessions older than 24h, drop raw
  - Episodic → Semantic: extract recurring facts, store with provenance
  - Episodic → Procedural: extract workflow patterns from receipts
- Vault retrieval gets a new field `memory_tier` for explainability
- Settings lane: "Run consolidation now" button

---

## ADOPT v6.1

### 7. Expose our CLC vault as MCP server (from claude-context)
**ROI:** Other agents (Cursor, Claude Desktop, Cline, Windsurf) can query our vault. Distribution beyond the cockpit.

**Our impl:** extend `orangebox-mcp-server-v2.mjs` with 4 new tools:
- `obx_index_codebase(path)`
- `obx_search_vault(query, top_k)`
- `obx_clear_index(scope)`
- `obx_get_indexing_status()`

Plus `Get-Started` doc explaining how to wire in any MCP client. ~150 LOC. **This is how we sell vault depth to the rest of the ecosystem.**

### 8. Merkle-tree incremental indexing (from claude-context)
**ROI:** Re-indexes touch only changed files. Big win for monorepos.

**Our impl (`scripts/v4/vault-merkle.mjs`, ~120 LOC):**
- Each file's content hash → Merkle node
- Directory hashes = hash(sorted child hashes)
- Re-index only when directory hash changes
- Persist tree to `~/.orangebox/vault/merkle.json`

### 9. Ebbinghaus decay on mistakes-ledger (from agentmemory)
**ROI:** Old entries auto-evict; frequently-referenced strengthen. Keeps the ledger sharp without manual pruning.

**Our impl (~100 LOC in `mistakes-ledger.mjs`):**
- Each entry gains `score`, `last_accessed`, `access_count`
- Score decay: `score *= 0.95 ^ days_since_access`
- Bumps on retrieval: `score += 0.3` (capped at 1.0)
- Auto-evict below 0.05

### 10. Graph-traversal retrieval layer (from agentmemory)
**ROI:** Beyond BM25 + vector — entity edges (file paths, function names, agent names, doctrine IDs) form a graph; one query can walk neighbors.

**Our impl (`scripts/v4/vault-graph.mjs`, ~250 LOC):**
- During indexing, extract entities: `path::file::function`, `agent::aeons-lead`, `doctrine::ATOM-...`
- Each entity = node; co-occurrence = edge with weight
- On query: BM25 hit → walk graph 2 hops → add neighbors to candidate set → re-rank
- Persisted as adjacency-list JSON

### 11. SRE / Incident lane (from opensre)
**ROI:** New lane that turns alerts into structured RCAs. Big enterprise sell.

**Our impl (new lane #12 in native UI, ~400 LOC):**
- HTTP webhook: `POST /api/v4/incident/intake` accepts Grafana / Datadog / PagerDuty alert payloads
- Fires `/sprint` with the alert as input
- Outputs structured RCA: probable root cause, evidence (log/metric/trace excerpts), recommended next steps
- Posts to Slack via incoming-webhook if configured
- Receipt emitted with full audit trail
- Settings lane: webhook URL display + Slack webhook input

### 12. PowerSync-style cross-device sync (from thunderbolt)
**ROI:** Operator has multi-machine workflow; receipts/vault should sync.

**Our impl:** v6.1 lane "Sync" using PowerSync's OSS sync engine (Apache-2.0). ~300 LOC. **Defer if AI Box Cloud already covers this.**

---

## BENCHMARKING (must-do honesty work)

### 13. Run LongMemEval-S (ICLR 2025) against our vault
**ROI:** Real number for our R@5, MRR, R@10 — replaces marketing claims.

agentmemory publishes 95.2% / 88.2% / 98.6%. We should publish ours. ~1 day work: download benchmark, wire to our `/api/v4/vault/cited-query`, score with their judge.

If we beat 95.2% → claim it. If not → fix retrieval until we do. **Either way, ship the receipt.**

---

## REJECT (with reasons)

| Repo | Why we reject |
|---|---|
| **anthropics/financial-services** | Domain-specific apps; not infra |
| **heygen-com/hyperframes** | HTML → video for agents; orthogonal to our stack |
| **Thunderbolt's Tauri+React stack** | Confirms our native moat — they're going where we already are |
| **9router's cloud sync** | Conflicts with Privacy lane integrity |
| **opensre's "runbook fetching"** | We handle via Files API + vault; their wrapper is thinner |
| **claude-context's Zilliz Cloud dependency** | Our vault is local-only by doctrine |

---

## v6.0.2 ship list (concrete, with LOC)

| # | Adopt | Source | Files | LOC |
|---|---|---|---|---|
| 1 | RTK token compression middleware | 9router | `scripts/v4/rtk-compressor.mjs` + hooks in 3 stream paths | 150 |
| 2 | Named combos + Settings JSON editor | 9router | `scripts/v4/router/combos.mjs` + native.rs Settings extension | 80 |
| 3 | 5 new providers (Cerebras / DeepSeek / Mistral / Together / Kimi) | 9router | `smart-model-router.mjs` + new provider stream handlers | 200 |
| 4 | AST-based vault chunker | claude-context | `scripts/v4/vault-ast-chunker.mjs` | 120 |
| 5 | Session-diversification in RRF | agentmemory | `vault-cited-query` patch | 30 |
| 6 | 4-tier memory consolidation pipeline | agentmemory | `scripts/v4/memory-tiers.mjs` + consolidator timer | 200 |

**Subtotal: ~780 LOC**

Combined with v6.0.2 gstack ship list (~1,050 LOC) → **~1,830 LOC total v6.0.2**, still under the binary-size budget.

---

## v6.1 ship list (after v6.0.2 lands)

| # | Adopt | Source | LOC |
|---|---|---|---|
| 7 | Vault → MCP server (4 tools) | claude-context | 150 |
| 8 | Merkle-tree incremental indexing | claude-context | 120 |
| 9 | Ebbinghaus decay on mistakes-ledger | agentmemory | 100 |
| 10 | Graph-traversal retrieval (3rd RRF lane) | agentmemory | 250 |
| 11 | SRE / Incident lane (#12) + Slack webhook out | opensre | 400 |
| 12 | PowerSync cross-device (if not covered by AI Box Cloud) | thunderbolt | 300 |
| 13 | LongMemEval-S benchmark + published receipt | agentmemory | 200 |

**Subtotal v6.1: ~1,520 LOC**

---

## Single sharpest insight from the scan

**agentmemory's `R@5 = 95.2%` on LongMemEval-S beats every claim in our docs.** We need to either match it or honestly publish our number lower. The 4-tier consolidation pipeline is how they get there. **Adopt the architecture, benchmark our version, publish the receipt.**

If we run LongMemEval-S and score 92% → fine, that's a real number. If we publish 95.2% without running it → we're scaffold. **Build the receipt before we ever say a number.**

---

## What stays our moat

| Capability | OrangeBox | Closest trending alternative |
|---|---|---|
| Native single-exe, no webview | **✓ 4.63 MB egui** | Thunderbolt = Tauri webview |
| Multi-provider router with adaptive thinking + Agent Teams | **✓** | 9router = proxy only, no Anthropic alpha |
| Air-gap mode (LOCAL_MODE=1 Ollama swap) | **✓** | None of the 5 ship this |
| Live privacy/egress audit per provider | **✓** | None |
| Receipt-backed proof on every action | **✓** | None |
| Citations API for grounded answers | **✓** | claude-context = unsourced |
| 11 functional native lanes | **✓** | All others = CLI or webview |

We integrate the trending repos' patterns. They don't integrate ours. **That's the moat.**

End of plan.
