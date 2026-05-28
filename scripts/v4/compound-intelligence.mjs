#!/usr/bin/env node
/* ============================================================================
   compound-intelligence.mjs — ORANGEBOX v5.0.1 Compound Intelligence Engine
   v5.0.1 update: vault block now carries `cache_control: {type: "ephemeral", ttl: "1h"}`
   when emitted as a system-prompt block. Vault doesn't change every 5 min; 1h TTL
   saves real money on the hot path. The bridge POSTs to /api/v4/compound/build
   (added in v5.0.1) which calls compoundSystem() here.

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot      : v4.0.1 — Compound Intelligence (highest-leverage gap plug)
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. No stubs. No coasting. No theater.

   THESIS
   ──────
   Every Claude/Opus call was going in cold. That's the gap. After this module,
   every call is augmented with:
     1. Operator vault context  — scored excerpts from the CLC lattice
     2. Past-mistakes ledger    — recent errors for the same task type, with
                                  corrections where known
   The resulting compound system prompt is what the model actually sees.
   The longer the operator uses ORANGEBOX, the smarter every call gets.
   That is the moat. "Compound or die." — V4_MOAT_DOCTRINE.md §Doctrine rule 2.

   EXPORTS
   ───────
   vaultContextFor({ task, hint, query, maxBytes })
     → { text, sources: [{path, score}], hash }

   pastMistakesFor({ task, limit })
     → { text, count }

   compoundSystem({ task, baseSystem, query, hint })
     → { system, vaultHash, mistakesCount }

   CLI
   ───
   node compound-intelligence.mjs --task=inline_edit --query="add error handling" --debug
   node compound-intelligence.mjs --task=architecture --query="should we add redis?" --debug

   Data paths (all under DATA_ROOT)
   ─────────────────────────────────
   memory/orangebox-knowledge-v2/lattice.jsonl  — NDJSON vault entries
   mistakes/mistakes.jsonl                       — mistake ledger (NDJSON)

   Zero npm dependencies. Node 18+ required.
   ============================================================================ */

import fs      from "node:fs/promises";
import fssync  from "node:fs";
import path    from "node:path";
import os      from "node:os";
import crypto  from "node:crypto";

// ── Data root (mirrors privacy-audit.mjs resolution order) ───────────────────
function resolveDataRoot() {
  return (
    process.env.ORANGEBOX_DATA_ROOT ||
    process.env.ORANGEBOX_ROOT ||
    path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command")
  );
}

const DATA_ROOT      = resolveDataRoot();
const LATTICE_PATH   = path.join(DATA_ROOT, "memory", "orangebox-knowledge-v2", "lattice.jsonl");
const MISTAKES_PATH  = path.join(DATA_ROOT, "mistakes", "mistakes.jsonl");

// ── SHA-256 helper ────────────────────────────────────────────────────────────
function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

// ── NDJSON reader — returns array of parsed objects, skips bad lines ──────────
async function readNDJSON(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return [];   // file does not exist yet — graceful fallback
  }
  const lines = raw.split("\n");
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      // skip malformed lines
    }
  }
  return out;
}

// ── Task-affinity profiles ────────────────────────────────────────────────────
// Each profile lists keywords that boost scores for that task type.
const TASK_AFFINITY = {
  inline_edit:      ["code", "function", "class", "method", "variable", "return", "import", "error", "fix", "edit"],
  multi_file_edit:  ["refactor", "rename", "move", "structure", "module", "file", "import", "export", "directory"],
  architecture:     ["design", "architecture", "pattern", "system", "service", "api", "schema", "doctrine", "moat"],
  pr_review:        ["review", "pull request", "diff", "change", "bug", "lint", "test", "approve", "comment"],
  chat:             [],   // no affinity boost — use all
  synthesis:        ["combine", "merge", "trilane", "debate", "compare", "decision", "tradeoff"],
  vault_query:      ["memory", "vault", "lattice", "knowledge", "context", "recall"],
  autocomplete:     ["complete", "snippet", "token", "inline"],
  dream:            ["idea", "concept", "future", "vision", "plan"],
};

// ── Keyword tokenizer — lowercased alphanumeric tokens ────────────────────────
function tokenize(text) {
  if (!text) return [];
  return String(text).toLowerCase().match(/[a-z0-9]+/g) || [];
}

// ── Score a single lattice entry against a query + task ──────────────────────
function scoreEntry(entry, queryTokens, taskAffinity) {
  // Extract searchable text from the entry
  const entryText = [
    entry.text || "",
    entry.content || "",
    entry.title || "",
    entry.path || "",
    (entry.tags || []).join(" "),
  ].join(" ");
  const entryTokens = tokenize(entryText);
  const entrySet = new Set(entryTokens);

  // Query overlap score: how many query tokens appear in the entry
  let score = 0;
  for (const qt of queryTokens) {
    if (entrySet.has(qt)) score += 2;
  }

  // Task-affinity boost: does the entry contain task-relevant keywords?
  for (const at of taskAffinity) {
    if (entrySet.has(at)) score += 1;
  }

  // Recency boost: entries with a ts/date get a small bonus (freshness matters)
  if (entry.ts || entry.date || entry.updated_at) score += 0.5;

  return score;
}

// ── vaultContextFor ───────────────────────────────────────────────────────────
/**
 * Reads the CLC lattice, scores entries, builds a <vault> block ≤ maxBytes.
 *
 * @param {object} opts
 * @param {string} opts.task      — task type string (matches TASK_AFFINITY keys)
 * @param {string} [opts.hint]    — free-text routing hint
 * @param {string} [opts.query]   — the user's actual query text
 * @param {number} [opts.maxBytes=6000]
 * @returns {Promise<{text: string, sources: Array<{path: string, score: number}>, hash: string}>}
 */
export async function vaultContextFor({ task = "chat", hint = "", query = "", maxBytes = 6000 } = {}) {
  const entries = await readNDJSON(LATTICE_PATH);

  if (entries.length === 0) {
    // Vault not built yet — graceful fallback
    return { text: "", sources: [], hash: sha256("") };
  }

  const queryTokens  = tokenize(query + " " + hint);
  const taskAffinity = TASK_AFFINITY[task] || [];

  // Score and sort descending
  const scored = entries
    .map((entry, idx) => ({ entry, score: scoreEntry(entry, queryTokens, taskAffinity), idx }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  // If nothing scored (no overlap at all), take first 10 entries as generic context
  const candidates = scored.length > 0 ? scored : entries.slice(0, 10).map((entry, idx) => ({ entry, score: 0, idx }));

  // Build <vault> block, staying under maxBytes
  const sources = [];
  const docParts = [];
  let used = 0;
  const openTag  = `<vault>\n`;
  const closeTag = `</vault>`;
  used += openTag.length + closeTag.length;

  for (const { entry, score } of candidates) {
    const entryPath = entry.path || entry.id || `entry-${entry.idx ?? 0}`;
    const entryText = (entry.text || entry.content || "").trim();
    if (!entryText) continue;

    const docOpen  = `<doc path="${entryPath}">\n`;
    const docClose = `\n</doc>\n`;
    const snippet  = entryText.slice(0, Math.min(entryText.length, 1200));
    const docBlock = docOpen + snippet + docClose;

    if (used + docBlock.length > maxBytes) break;

    docParts.push(docBlock);
    sources.push({ path: entryPath, score });
    used += docBlock.length;
  }

  const text = openTag + docParts.join("") + closeTag;
  const hash = sha256(text);

  return { text, sources, hash };
}

// ── pastMistakesFor ───────────────────────────────────────────────────────────
/**
 * Reads mistakes.jsonl, filters to task type, returns recent N.
 *
 * @param {object} opts
 * @param {string} opts.task
 * @param {number} [opts.limit=5]
 * @returns {Promise<{text: string, count: number}>}
 */
export async function pastMistakesFor({ task = "chat", limit = 5 } = {}) {
  const entries = await readNDJSON(MISTAKES_PATH);

  const filtered = entries
    .filter(e => !task || e.task === task)
    .slice(-limit);   // most recent N (file is append-ordered)

  if (filtered.length === 0) {
    return { text: "", count: 0 };
  }

  const errorParts = filtered.map(e => {
    const correction = e.correction ? `\n  correction: ${e.correction}` : "";
    const model      = e.model      ? ` model="${e.model}"`             : "";
    const at         = e.at || e.ts || "";
    const atAttr     = at            ? ` at="${at}"`                    : "";
    const excerpt    = (e.prompt_excerpt || "").slice(0, 300);
    return `<error task="${e.task || task}"${model}${atAttr}>\n  error: ${e.error}\n  prompt_excerpt: ${excerpt}${correction}\n</error>`;
  });

  const text = `<past_errors>\n${errorParts.join("\n")}\n</past_errors>`;
  return { text, count: filtered.length };
}

// ── compoundSystem ────────────────────────────────────────────────────────────
/**
 * Composes the full compound system prompt:
 *   <vault>...</vault>
 *   <past_errors>...</past_errors>
 *   <base>{baseSystem}</base>
 *
 * This is what the model sees. Vault + corrections + base instruction.
 * That is the WHOLE THESIS.
 *
 * @param {object} opts
 * @param {string} opts.task
 * @param {string} opts.baseSystem
 * @param {string} [opts.query]
 * @param {string} [opts.hint]
 * @returns {Promise<{system: string, vaultHash: string, mistakesCount: number}>}
 */
export async function compoundSystem({ task = "chat", baseSystem = "", query = "", hint = "" } = {}) {
  const [vault, mistakes] = await Promise.all([
    vaultContextFor({ task, hint, query }),
    pastMistakesFor({ task }),
  ]);

  const parts = [];
  if (vault.text)    parts.push(vault.text);
  if (mistakes.text) parts.push(mistakes.text);
  parts.push(`<base>\n${baseSystem}\n</base>`);

  const system = parts.join("\n");

  return {
    system,
    vaultHash:     vault.hash,
    mistakesCount: mistakes.count,
  };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace("file:///", "").replace(/\//g, path.sep))) {
  (async () => {
    const args = Object.fromEntries(
      process.argv.slice(2)
        .filter(a => a.startsWith("--"))
        .map(a => {
          const [k, ...rest] = a.slice(2).split("=");
          return [k, rest.join("=") || "true"];
        })
    );

    const task    = args.task    || "chat";
    const query   = args.query   || "";
    const hint    = args.hint    || "";
    const debug   = args.debug   === "true" || args.debug === "";
    const base    = args.base    || "(base system would go here)";

    const result = await compoundSystem({ task, baseSystem: base, query, hint });

    if (debug) {
      console.log("=== COMPOUND SYSTEM BLOCK ===");
      console.log(result.system);
      console.log("\n=== METADATA ===");
      console.log(`vaultHash:     ${result.vaultHash}`);
      console.log(`mistakesCount: ${result.mistakesCount}`);
    } else {
      console.log(result.system);
    }

    // Also show sources if vault was populated
    const vaultResult = await vaultContextFor({ task, hint, query });
    if (vaultResult.sources.length > 0 && debug) {
      console.log("\n=== VAULT SOURCES ===");
      for (const s of vaultResult.sources) {
        console.log(`  ${s.score.toFixed(1)}  ${s.path}`);
      }
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
