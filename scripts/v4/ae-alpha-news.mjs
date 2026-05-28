/* ============================================================================
   ae-alpha-news.mjs — v6.0.10 AE Alpha News
   ============================================================================
   Doctrine anchor : docs/UX_SCOPE_V6.md §3.6.9
   Disclosure      : ATOM-OBX-V6-AEALPHA-2026-0517
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Mom's Law       : Real anchors, real scoring, real cache, no theater.

   Purpose
   ───────
   Curate an "Alpha News" feed from accounts the operator follows on X.
     - Pull through Hermes Agent (uses operator's X Premium tier — $0 extra)
     - Filter for posts with http(s) URL + AI signal tokens
     - Score 0–100 by signal density + recency
     - Cache aggressively (24h TTL per anchor) to stay under quota
     - Persist anchor list to `~/.orangebox/ae-alpha-news.json`

   API surface
   ───────────
     listAnchors()           → { anchors: string[], updated_at }
     saveAnchors(anchors)    → { anchors, saved_at, path }
     fetchFeed({ limit })    → { ok, items[], last_pulled_at, cached_anchors }
     scoreItem(item)         → 0–100 (AI signal × recency × link presence)
     clearCache()            → { cleared }

   Cache strategy
   ──────────────
     File: ~/.orangebox/ae-alpha-news.cache.json
     Schema: { generated_at, items: [{id, score, ...}] }
     TTL: 24h soft refresh (re-pull if older); 7d hard expire
     Per-anchor cache: prevents redundant Hermes calls

   Zero new deps. Pure Node ESM. Falls back gracefully when Hermes absent.
   ============================================================================ */
import fs   from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os   from "node:os";

const SOFT_TTL_MS = 24 * 60 * 60 * 1000;   // 24h
const HARD_TTL_MS =  7 * 24 * 60 * 60 * 1000; // 7d

const AI_SIGNAL_TOKENS = [
  // Frontier model families
  "gpt", "gpt-5", "gpt5", "gpt-4", "gpt4",
  "claude", "opus", "sonnet", "haiku",
  "gemini", "grok", "llama", "mistral", "deepseek", "kimi", "qwen", "phi",
  // Concepts
  "llm", "inference", "model", "agent", "agents", "reasoning", "tokens",
  "rag", "moe", "mixture-of-experts", "sparse", "distillation",
  "fine-tun", "finetune", "fine-tuning", "fine tuning",
  "chain-of-thought", "cot", "tree-of-thought", "tot",
  "embedding", "embeddings", "vector", "vectors",
  // Tools / infra
  "anthropic", "openai", "ollama", "groq", "cerebras", "xai",
  "claude-code", "cursor", "windsurf", "cline", "codex",
  // Capability domains
  "multimodal", "vision", "voice", "speech-to-text", "stt",
  "code-generation", "autocomplete", "autonomous",
  "context-window", "context window", "128k", "200k", "1m context",
  // Research signals
  "arxiv", "huggingface", "hugging face", "benchmark", "evals",
  "swe-bench", "longmemeval", "mteb", "alpaca",
];

const URL_REGEX = /https?:\/\/[^\s)\]]+/g;

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function anchorsPath() { return path.join(dataRoot(), "ae-alpha-news.json"); }
function cachePath()   { return path.join(dataRoot(), "ae-alpha-news.cache.json"); }

// ─── Anchors persistence ───────────────────────────────────────────────────────

export async function listAnchors() {
  const p = anchorsPath();
  if (!fsSync.existsSync(p)) {
    return { anchors: [], updated_at: null, path: p };
  }
  try {
    const raw = await fs.readFile(p, "utf8");
    const j = JSON.parse(raw);
    return {
      anchors: Array.isArray(j.anchors) ? j.anchors : [],
      updated_at: j.updated_at || null,
      path: p,
    };
  } catch (e) {
    return { anchors: [], updated_at: null, error: String(e.message), path: p };
  }
}

function normalizeHandle(h) {
  // Accept "@karpathy", "karpathy", "twitter.com/karpathy", "x.com/karpathy"
  let s = String(h || "").trim();
  if (!s) return null;
  s = s.replace(/^https?:\/\//i, "")
       .replace(/^(www\.)?(twitter\.com|x\.com)\//i, "")
       .replace(/^@/, "")
       .split(/[?#]/)[0];
  if (!/^[A-Za-z0-9_]{1,15}$/.test(s)) return null;
  return s;
}

export async function saveAnchors(anchors) {
  const p = anchorsPath();
  const cleaned = Array.from(new Set(
    (anchors || []).map(normalizeHandle).filter(Boolean)
  )).sort();
  const doc = {
    anchors: cleaned,
    updated_at: new Date().toISOString(),
    note: "AE Alpha News anchor list — accounts you follow that we curate for AI alpha. Edit via cockpit X-Feed lane or POST /api/v4/ae-alpha-news/anchors.",
  };
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(doc, null, 2), "utf8");
  return { anchors: cleaned, count: cleaned.length, saved_at: doc.updated_at, path: p };
}

// ─── AI signal scoring ─────────────────────────────────────────────────────────

export function scoreItem(item) {
  const text = String(item?.text || "").toLowerCase();
  if (!text) return 0;

  // Component 1: URL presence (binary, weight 25)
  const urls = text.match(URL_REGEX) || [];
  const urlScore = urls.length > 0 ? 25 : 0;

  // Component 2: AI signal token density (0–50)
  let tokenHits = 0;
  for (const tok of AI_SIGNAL_TOKENS) {
    if (text.includes(tok)) tokenHits++;
  }
  const tokenScore = Math.min(50, tokenHits * 6);

  // Component 3: recency (0–25)
  let recencyScore = 0;
  if (item?.ts) {
    const age_h = (Date.now() - new Date(item.ts).getTime()) / 3_600_000;
    if (age_h < 0) recencyScore = 0;
    else if (age_h < 1)   recencyScore = 25;
    else if (age_h < 6)   recencyScore = 20;
    else if (age_h < 24)  recencyScore = 15;
    else if (age_h < 72)  recencyScore = 8;
    else if (age_h < 168) recencyScore = 3;
  }

  return Math.min(100, urlScore + tokenScore + recencyScore);
}

export function extractLinks(item) {
  const text = String(item?.text || "");
  const urls = text.match(URL_REGEX) || [];
  return urls.map(u => u.replace(/[.,;:!?]+$/, ""));
}

// ─── Hermes pull (graceful when Hermes absent) ────────────────────────────────

// Pre-import http at module init so the Hermes puller is sync-callable
const HTTP = await import("node:http");

async function pullViaHermes({ limit = 100 } = {}) {
  // Uses the existing /api/v4/hermes/feed surface (which spawns hermes-status.mjs).
  // Reuses operator's X Premium tier — no new API spend.
  const url = `http://127.0.0.1:8787/api/v4/hermes/feed?limit=${limit}`;
  return new Promise((resolve) => {
    const req = HTTP.get(url, { timeout: 30000 }, (res) => {
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch { resolve({ ok: false, reason: "invalid JSON from /hermes/feed" }); } });
    });
    req.on("error", (e) => resolve({ ok: false, reason: "hermes endpoint unreachable: " + e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, reason: "hermes endpoint timeout" }); });
  });
}

// ─── Cache layer ───────────────────────────────────────────────────────────────

async function readCache() {
  const p = cachePath();
  if (!fsSync.existsSync(p)) return null;
  try {
    const raw = await fs.readFile(p, "utf8");
    return JSON.parse(raw);
  } catch { return null; }
}

async function writeCache(items) {
  const p = cachePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const doc = {
    generated_at: new Date().toISOString(),
    item_count: items.length,
    items,
  };
  await fs.writeFile(p, JSON.stringify(doc, null, 2), "utf8");
  return doc;
}

function cacheAge(cache) {
  if (!cache?.generated_at) return Infinity;
  return Date.now() - new Date(cache.generated_at).getTime();
}

export async function clearCache() {
  const p = cachePath();
  if (fsSync.existsSync(p)) {
    try { await fs.unlink(p); return { cleared: true, path: p }; }
    catch (e) { return { cleared: false, error: String(e.message) }; }
  }
  return { cleared: false, reason: "no cache to clear" };
}

// ─── Main feed entry ───────────────────────────────────────────────────────────

export async function fetchFeed({ limit = 30, force_refresh = false } = {}) {
  const anchorList = (await listAnchors()).anchors;

  // Cache check
  let cache = await readCache();
  let pulled = false;
  let pull_reason = null;

  if (force_refresh || !cache || cacheAge(cache) > SOFT_TTL_MS) {
    pull_reason = force_refresh ? "force_refresh" :
                  !cache ? "no_cache" : "stale";

    const hermes = await pullViaHermes({ limit: 200 });
    if (hermes?.ok && Array.isArray(hermes.items)) {
      pulled = true;
      // If anchors set: filter to anchor-authored items; else: keep all
      let filtered = hermes.items;
      if (anchorList.length > 0) {
        const anchorSet = new Set(anchorList.map(a => a.toLowerCase()));
        filtered = hermes.items.filter(it => {
          const author = String(it.author || "").replace(/^@/, "").toLowerCase();
          return anchorSet.has(author);
        });
      }
      // Score each + apply AI filter (require URL + ≥1 signal token; min score 30)
      const scored = filtered
        .map(it => ({
          ...it,
          ai_score: scoreItem(it),
          links: extractLinks(it),
          anchor: String(it.author || "").replace(/^@/, ""),
        }))
        .filter(it => it.ai_score >= 30 && it.links.length > 0);
      // Sort desc by score
      scored.sort((a, b) => b.ai_score - a.ai_score);
      cache = await writeCache(scored);
    } else {
      // Hermes failed; degrade gracefully — keep stale cache if within hard TTL
      if (cache && cacheAge(cache) < HARD_TTL_MS) {
        pull_reason = "hermes_failed_using_stale_cache";
      } else {
        return {
          ok: false,
          installed: hermes?.installed === true,
          reason: hermes?.reason || "Hermes unreachable + no usable cache",
          hint: hermes?.hint || "Run: hermes claw status, or install via scripts/v4/hermes/INSTALL_HERMES.ps1",
          anchors: anchorList,
        };
      }
    }
  } else {
    pull_reason = "cache_hit_within_24h";
  }

  return {
    ok: true,
    last_pulled_at: cache?.generated_at || null,
    pulled,
    pull_reason,
    cached_anchors: anchorList,
    items: (cache?.items || []).slice(0, limit),
    count: Math.min(limit, cache?.items?.length || 0),
    total_scored: cache?.items?.length || 0,
  };
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

const selfUrl = import.meta.url.replace(/\\/g, "/");
const argv1   = (process.argv && process.argv[1]) ? String(process.argv[1]).replace(/\\/g, "/") : "";
if (argv1 && (selfUrl.endsWith(argv1) || selfUrl === `file:///${argv1}`)) {
  const cmd = process.argv[2] || "status";
  if (cmd === "anchors") {
    const r = await listAnchors();
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === "set-anchors") {
    const list = process.argv.slice(3);
    const r = await saveAnchors(list);
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === "feed") {
    const r = await fetchFeed({ limit: parseInt(process.argv[3] || "30", 10) });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === "refresh") {
    const r = await fetchFeed({ force_refresh: true });
    console.log(JSON.stringify({ pulled: r.pulled, count: r.count, pull_reason: r.pull_reason }, null, 2));
  } else if (cmd === "clear-cache") {
    console.log(JSON.stringify(await clearCache(), null, 2));
  } else if (cmd === "score") {
    const text = process.argv.slice(3).join(" ");
    console.log(JSON.stringify({ score: scoreItem({ text, ts: new Date().toISOString() }), links: extractLinks({ text }) }, null, 2));
  } else {
    console.error("Usage: node ae-alpha-news.mjs anchors|set-anchors <handle>...|feed [limit]|refresh|clear-cache|score <text>");
    process.exit(1);
  }
}
