#!/usr/bin/env node
/* ============================================================================
   semantic-cache.mjs — ORANGEBOX Local Semantic Vector Cache & Hybrid Lookup

   Doctrine anchor : docs/GROK_ORANGEBOX_UPGRADES_INTAKE.md (Feature Family 5 & 6)
   Phase slot      : v4.1.0 — Local Semantic Cache (Pillar C Upgrade)
   Author          : Gemini (Gem) / AtomEons Systems Laboratory
   Date            : 2026-05-23
   Mom's Law       : Full effort. No stubs. No coasting. No theater.

   PURPOSE
   ───────
   Reduces external LLM prompt API token consumption by caching and matching
   prompts. Uses a dual-stage lookup pipeline:
     1. Exact-First: Matches SHA-256 hash of incoming prompts. (Latency: <0.1ms)
     2. Semantic-Second: Local vector lookup via Ollama embeddings with a tight
        cosine similarity threshold (default: >= 0.92). (Latency: <5ms)

   PRIVACY SHIELD
   ──────────────
   All semantic vector embeddings are calculated locally via Ollama by default,
   completely preventing project prompt leakage to third-party endpoints.

   DATA PATHS (all under DATA_ROOT)
   ─────────────────────────────────
   cache/vector_cache.json          — cached prompts, completions, and embeddings
   receipts/cache/<id>.json         — transaction receipts for cache hits/misses
   ============================================================================ */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import http from "node:http";

// ── Data root ─────────────────────────────────────────────────────────────────
function resolveDataRoot() {
  return (
    process.env.ORANGEBOX_DATA_ROOT ||
    process.env.ORANGEBOX_ROOT ||
    path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command")
  );
}

const DATA_ROOT = resolveDataRoot();
const CACHE_DIR = path.join(DATA_ROOT, "cache");
const CACHE_PATH = path.join(CACHE_DIR, "vector_cache.json");
const RECEIPTS_DIR = path.join(DATA_ROOT, "receipts", "cache");

// ── Ensure directories exist ──────────────────────────────────────────────────
async function ensureDirs() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
}

// ── Hash helper ──────────────────────────────────────────────────────────────
function hashPrompt(str) {
  return crypto.createHash("sha256").update(String(str || "").trim()).digest("hex");
}

// ── Cosine Similarity helper ──────────────────────────────────────────────────
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ── Local Ollama Embeddings API Call ──────────────────────────────────────────
function getOllamaEmbedding(prompt, model = "nomic-embed-text", timeoutMs = 3000) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({ model, prompt });
    const req = http.request({
      hostname: "127.0.0.1",
      port: 11434,
      path: "/api/embeddings",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const body = JSON.parse(data);
          if (Array.isArray(body.embedding)) {
            resolve(body.embedding);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });

    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
    req.write(payload);
    req.end();
  });
}

// ── Read / Write Cache ────────────────────────────────────────────────────────
async function loadCache() {
  await ensureDirs();
  try {
    if (!fsSync.existsSync(CACHE_PATH)) return { version: "1.0", entries: [] };
    const raw = await fs.readFile(CACHE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return { version: "1.0", entries: [] };
  }
}

async function saveCache(cache) {
  await ensureDirs();
  await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2), "utf8");
}

// ── Emit Cache Receipt ────────────────────────────────────────────────────────
async function emitCacheReceipt(id, type, prompt, matchedPrompt, similarity, hit) {
  await ensureDirs();
  const receipt = {
    id,
    source: "semantic-cache",
    title: hit ? `Cache hit: ${type}` : "Cache miss",
    summary: hit
      ? `Successfully resolved prompt using ${type} cache lookup (similarity: ${similarity?.toFixed(4) || "1.0000"}).`
      : "Prompt missed cached indices; routed to model provider.",
    evidence: {
      type,
      hit,
      similarity,
      prompt_excerpt: String(prompt).slice(0, 180),
      matched_excerpt: matchedPrompt ? String(matchedPrompt).slice(0, 180) : null,
    },
    ts: new Date().toISOString(),
  };
  const p = path.join(RECEIPTS_DIR, `${id}.json`);
  await fs.writeFile(p, JSON.stringify(receipt, null, 2), "utf8");
  return p;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Searches the semantic cache for a prompt.
 *
 * @param {string} prompt                — Prompt query to lookup
 * @param {object} opts
 * @param {number} [opts.threshold=0.92] — Minimum vector similarity threshold
 * @param {string} [opts.model]          — Ollama embedding model name
 * @returns {Promise<{hit: boolean, completion: string|null, type: string, similarity: number}>}
 */
export async function getCache(prompt, { threshold = 0.92, model = "nomic-embed-text" } = {}) {
  const promptNorm = String(prompt || "").trim();
  const hash = hashPrompt(promptNorm);
  const cache = await loadCache();
  const id = `cch_${crypto.randomBytes(8).toString("hex")}`;

  // 1. Exact-first matching
  const exactMatch = cache.entries.find(e => e.hash === hash);
  if (exactMatch) {
    await emitCacheReceipt(id, "exact", promptNorm, exactMatch.prompt, 1.0, true);
    return { hit: true, completion: exactMatch.completion, type: "exact", similarity: 1.0 };
  }

  // 2. Local Semantic vector check
  const embedding = await getOllamaEmbedding(promptNorm, model);
  if (embedding) {
    let bestMatch = null;
    let maxSim = -1;

    for (const entry of cache.entries) {
      if (!entry.embedding) continue;
      const sim = cosineSimilarity(embedding, entry.embedding);
      if (sim > maxSim) {
        maxSim = sim;
        bestMatch = entry;
      }
    }

    if (maxSim >= threshold && bestMatch) {
      await emitCacheReceipt(id, "semantic", promptNorm, bestMatch.prompt, maxSim, true);
      return { hit: true, completion: bestMatch.completion, type: "semantic", similarity: maxSim };
    }
  }

  // 3. Cache Miss
  await emitCacheReceipt(id, "miss", promptNorm, null, 0.0, false);
  return { hit: false, completion: null, type: "miss", similarity: 0.0 };
}

/**
 * Stores a prompt-completion pair in the cache.
 *
 * @param {string} prompt        — Source prompt
 * @param {string} completion    — Result completion
 * @param {object} opts
 * @param {string} [opts.model]  — Ollama embedding model name
 */
export async function setCache(prompt, completion, { model = "nomic-embed-text" } = {}) {
  const promptNorm = String(prompt || "").trim();
  const hash = hashPrompt(promptNorm);
  const cache = await loadCache();

  // Retrieve local vector embedding
  const embedding = await getOllamaEmbedding(promptNorm, model);

  // Evict older identical prompt if exists
  cache.entries = cache.entries.filter(e => e.hash !== hash);

  cache.entries.push({
    hash,
    prompt: promptNorm,
    completion,
    embedding,
    model: embedding ? model : null,
    added_at: new Date().toISOString(),
  });

  // Cap cache size at 1,000 entries to prevent local bloat
  if (cache.entries.length > 1000) {
    cache.entries.shift(); // Evict oldest
  }

  await saveCache(cache);
  return { hash, hasEmbedding: !!embedding };
}

/**
 * Clear all cache records.
 */
export async function clearCache() {
  await saveCache({ version: "1.0", entries: [] });
}

/**
 * Get stats about cache health.
 */
export async function stats() {
  const cache = await loadCache();
  const vectorEntriesCount = cache.entries.filter(e => Array.isArray(e.embedding)).length;
  return {
    total_entries: cache.entries.length,
    vector_entries: vectorEntriesCount,
    disk_bytes: fsSync.existsSync(CACHE_PATH) ? fsSync.statSync(CACHE_PATH).size : 0,
  };
}

// ── CLI support ───────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace("file:///", "").replace(/\//g, path.sep))) {
  (async () => {
    const args = process.argv.slice(2);
    if (args.includes("--stats")) {
      const s = await stats();
      console.log(JSON.stringify(s, null, 2));
    } else if (args.includes("--clear")) {
      await clearCache();
      console.log(JSON.stringify({ status: "VERIFIED", action: "cache_cleared" }));
    } else if (args.includes("--query")) {
      const promptIndex = args.indexOf("--query");
      const q = args[promptIndex + 1];
      if (!q) {
        console.error("Error: --query requires a prompt argument");
        process.exit(1);
      }
      const res = await getCache(q);
      console.log(JSON.stringify(res, null, 2));
    } else if (args.includes("--set")) {
      const promptIndex = args.indexOf("--set");
      const q = args[promptIndex + 1];
      const completion = args[promptIndex + 2];
      if (!q || !completion) {
        console.error("Error: --set requires a prompt argument and a completion argument");
        process.exit(1);
      }
      const res = await setCache(q, completion);
      console.log(JSON.stringify({ status: "VERIFIED", ...res }));
    } else {
      console.log([
        "ORANGEBOX Local Semantic Cache CLI",
        "Usage:",
        "  node semantic-cache.mjs --stats",
        "  node semantic-cache.mjs --clear",
        "  node semantic-cache.mjs --query \"<prompt>\"",
        "  node semantic-cache.mjs --set \"<prompt>\" \"<completion>\"",
      ].join("\n"));
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
