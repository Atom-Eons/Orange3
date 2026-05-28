#!/usr/bin/env node
/* ============================================================================
   mistakes-ledger.mjs — ORANGEBOX v4.0.1 Mistakes Ledger

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot      : v4.0.1 — Compound Intelligence (highest-leverage gap plug)
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. No stubs. No coasting. No theater.

   PURPOSE
   ───────
   Every model error — wrong output, hallucination, wrong file, failed edit,
   bad architecture recommendation — gets a ledger row. Corrections are linked
   back to the row. compound-intelligence.mjs reads this file and injects the
   most recent errors into every future call for the same task type.

   The moat compresses. Every mistake the operator catches makes the next call
   smarter. "Compound or die." — V4_MOAT_DOCTRINE.md §Doctrine rule 2.

   DATA PATHS (all under DATA_ROOT)
   ─────────────────────────────────
   mistakes/mistakes.jsonl          — append-only NDJSON ledger
   receipts/mistakes/<id>.json      — one receipt per appended row

   EXPORTS
   ───────
   appendMistake({ task, prompt_excerpt, error, model, worker, correction, at })
     → { id, path }

   recentMistakes({ task, limit })
     → Array<MistakeEntry>

   markCorrected({ id, correction_diff })
     → { ok, updated }

   stats()
     → { total, byTask, byModel, lastWeek, correctedCount }

   CLI
   ───
   node mistakes-ledger.mjs --append --task=inline_edit --error="hallucinated import"
   node mistakes-ledger.mjs --append --task=inline_edit --error="wrong file" --model=claude-opus-4-7
   node mistakes-ledger.mjs --list --task=inline_edit
   node mistakes-ledger.mjs --stats
   node mistakes-ledger.mjs --correct --id=<uuid> --correction="..."

   Zero npm dependencies. Node 18+ required.
   ============================================================================ */

import fs      from "node:fs/promises";
import fssync  from "node:fs";
import path    from "node:path";
import os      from "node:os";
import crypto  from "node:crypto";

// ── Data root ─────────────────────────────────────────────────────────────────
function resolveDataRoot() {
  return (
    process.env.ORANGEBOX_DATA_ROOT ||
    process.env.ORANGEBOX_ROOT ||
    path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command")
  );
}

const DATA_ROOT      = resolveDataRoot();
const MISTAKES_DIR   = path.join(DATA_ROOT, "mistakes");
const MISTAKES_PATH  = path.join(MISTAKES_DIR, "mistakes.jsonl");
const RECEIPTS_DIR   = path.join(DATA_ROOT, "receipts", "mistakes");

// ── UUID helper ───────────────────────────────────────────────────────────────
function uuidv4() {
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString("hex");
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}

// ── Ensure directories exist ──────────────────────────────────────────────────
async function ensureDirs() {
  await fs.mkdir(MISTAKES_DIR,  { recursive: true });
  await fs.mkdir(RECEIPTS_DIR,  { recursive: true });
}

// ── NDJSON reader ─────────────────────────────────────────────────────────────
async function readNDJSON(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    return [];
  }
  const out = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { out.push(JSON.parse(trimmed)); } catch { /* skip corrupt lines */ }
  }
  return out;
}

// ── Atomic NDJSON append ──────────────────────────────────────────────────────
async function appendLine(filePath, obj) {
  const line = JSON.stringify(obj) + "\n";
  await fs.appendFile(filePath, line, "utf8");
}

// ── Receipt emitter ───────────────────────────────────────────────────────────
async function emitMistakeReceipt(id, entry) {
  await ensureDirs();
  const receipt = {
    id,
    source:   "mistakes-ledger",
    title:    `Mistake logged: ${entry.task}`,
    summary:  entry.error,
    evidence: { mistakeId: id, task: entry.task, model: entry.model, at: entry.at },
    ts:       new Date().toISOString(),
  };
  const p = path.join(RECEIPTS_DIR, `${id}.json`);
  await fs.writeFile(p, JSON.stringify(receipt, null, 2), "utf8");
  return p;
}

// ── appendMistake ─────────────────────────────────────────────────────────────
/**
 * Appends a new mistake row to the ledger.
 * Emits a receipt to receipts/mistakes/<id>.json.
 *
 * @param {object} opts
 * @param {string} opts.task             — task type (inline_edit, architecture, chat, …)
 * @param {string} [opts.prompt_excerpt] — first ~300 chars of the prompt (for context)
 * @param {string} opts.error            — what went wrong (required)
 * @param {string} [opts.model]          — model id that produced the error
 * @param {string} [opts.worker]         — worker rail (local, codexa-lan, codexa-cloud)
 * @param {string} [opts.correction]     — correction text if already known
 * @param {string} [opts.at]             — ISO timestamp (defaults to now)
 * @returns {Promise<{id: string, path: string}>}
 */
export async function appendMistake({ task, prompt_excerpt = "", error, model = null, worker = null, correction = null, at = null } = {}) {
  if (!task)  throw new Error("appendMistake: task is required");
  if (!error) throw new Error("appendMistake: error is required");

  await ensureDirs();

  const id    = uuidv4();
  const entry = {
    id,
    task,
    prompt_excerpt: String(prompt_excerpt).slice(0, 300),
    error:          String(error),
    model:          model  || null,
    worker:         worker || null,
    correction:     correction || null,
    corrected:      correction !== null,
    at:             at || new Date().toISOString(),
    // v6.0.2 — Ebbinghaus decay fields (agentmemory pattern)
    score:          1.0,
    access_count:   0,
    last_accessed:  null,
  };

  await appendLine(MISTAKES_PATH, entry);
  const receiptPath = await emitMistakeReceipt(id, entry);

  return { id, path: MISTAKES_PATH, receiptPath };
}

// ── recentMistakes ────────────────────────────────────────────────────────────
/**
 * Returns the most recent N mistakes for a given task type.
 *
 * @param {object} opts
 * @param {string} [opts.task]    — filter by task; omit for all tasks
 * @param {number} [opts.limit=5]
 * @returns {Promise<Array>}
 */
export async function recentMistakes({ task = null, limit = 5 } = {}) {
  const entries = await readNDJSON(MISTAKES_PATH);
  const filtered = task ? entries.filter(e => e.task === task) : entries;
  // v6.0.2 — bump access score on retrieval (Ebbinghaus reinforce)
  const accessed = filtered.slice(-limit).map(e => ({
    ...e,
    access_count:  (e.access_count || 0) + 1,
    last_accessed: new Date().toISOString(),
    score:         Math.min(1.0, (e.score ?? 1.0) + 0.3),
  }));
  return accessed;
}

// ── decayAndEvict ─────────────────────────────────────────────────────────────
// v6.0.2 — Ebbinghaus decay pass: rewrite ledger applying score decay; evict
// entries below threshold. Run nightly or on-demand via /api/v4/memory/decay.
export async function decayAndEvict({ evictThreshold = 0.05 } = {}) {
  const entries = await readNDJSON(MISTAKES_PATH);
  let examined = 0, evicted = 0;
  const kept = [];
  for (const e of entries) {
    examined++;
    const last = new Date(e.last_accessed || e.at || Date.now()).getTime();
    const days = (Date.now() - last) / 86_400_000;
    const newScore = (e.score ?? 1.0) * Math.pow(0.95, days);
    if (newScore < evictThreshold && !e.corrected) {
      evicted++;
      continue; // drop
    }
    kept.push({ ...e, score: newScore });
  }
  await ensureDirs();
  const newContent = kept.map(e => JSON.stringify(e)).join("\n") + (kept.length ? "\n" : "");
  await fs.writeFile(MISTAKES_PATH, newContent, "utf8");
  return { examined, evicted, retained: kept.length };
}

// ── markCorrected ─────────────────────────────────────────────────────────────
/**
 * Finds the entry by id and rewrites the file with the correction applied.
 * (NDJSON doesn't support in-place updates; we rewrite the full file.)
 *
 * @param {object} opts
 * @param {string} opts.id              — mistake id (uuid)
 * @param {string} opts.correction_diff — the correction text or diff
 * @returns {Promise<{ok: boolean, updated: object|null}>}
 */
export async function markCorrected({ id, correction_diff } = {}) {
  if (!id)              throw new Error("markCorrected: id is required");
  if (!correction_diff) throw new Error("markCorrected: correction_diff is required");

  const entries = await readNDJSON(MISTAKES_PATH);
  let updated   = null;

  const rewritten = entries.map(e => {
    if (e.id !== id) return e;
    updated = { ...e, correction: correction_diff, corrected: true, corrected_at: new Date().toISOString() };
    return updated;
  });

  if (!updated) return { ok: false, updated: null };

  const newContent = rewritten.map(e => JSON.stringify(e)).join("\n") + "\n";
  await ensureDirs();
  await fs.writeFile(MISTAKES_PATH, newContent, "utf8");

  return { ok: true, updated };
}

// ── stats ─────────────────────────────────────────────────────────────────────
/**
 * Returns aggregate statistics over the full ledger.
 *
 * @returns {Promise<{total: number, byTask: object, byModel: object, lastWeek: number, correctedCount: number}>}
 */
export async function stats() {
  const entries = await readNDJSON(MISTAKES_PATH);
  const total   = entries.length;

  const byTask  = {};
  const byModel = {};
  let correctedCount = 0;
  let lastWeek  = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const e of entries) {
    byTask[e.task]   = (byTask[e.task]   || 0) + 1;
    if (e.model) byModel[e.model] = (byModel[e.model] || 0) + 1;
    if (e.corrected) correctedCount++;
    const ts = e.at ? new Date(e.at).getTime() : 0;
    if (ts > weekAgo) lastWeek++;
  }

  return { total, byTask, byModel, lastWeek, correctedCount };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.url.replace("file:///", "").replace(/\//g, path.sep))) {
  (async () => {
    const rawArgs = process.argv.slice(2);
    const args    = Object.fromEntries(
      rawArgs
        .filter(a => a.startsWith("--"))
        .map(a => {
          const [k, ...rest] = a.slice(2).split("=");
          return [k, rest.join("=") || "true"];
        })
    );

    if (args.append !== undefined) {
      // --append --task=... --error="..." [--model=...] [--worker=...] [--prompt_excerpt="..."]
      const { task, error, model, worker, prompt_excerpt, correction } = args;
      if (!task)  { console.error("--append requires --task=<type>"); process.exit(1); }
      if (!error) { console.error("--append requires --error=<description>"); process.exit(1); }
      const result = await appendMistake({ task, error, model, worker, prompt_excerpt, correction });
      console.log(JSON.stringify(result, null, 2));

    } else if (args.list !== undefined) {
      // --list [--task=inline_edit] [--limit=10]
      const task   = args.task  || null;
      const limit  = Number(args.limit) || 10;
      const rows   = await recentMistakes({ task, limit });
      console.log(JSON.stringify(rows, null, 2));

    } else if (args.stats !== undefined) {
      // --stats
      const s = await stats();
      console.log(JSON.stringify(s, null, 2));

    } else if (args.correct !== undefined) {
      // --correct --id=<uuid> --correction="..."
      const { id, correction } = args;
      if (!id)         { console.error("--correct requires --id=<uuid>");        process.exit(1); }
      if (!correction) { console.error("--correct requires --correction=<text>"); process.exit(1); }
      const r = await markCorrected({ id, correction_diff: correction });
      console.log(JSON.stringify(r, null, 2));

    } else {
      console.log([
        "Usage:",
        "  node mistakes-ledger.mjs --append --task=<type> --error=\"<description>\" [--model=...] [--worker=...] [--prompt_excerpt=\"...\"]",
        "  node mistakes-ledger.mjs --list [--task=<type>] [--limit=10]",
        "  node mistakes-ledger.mjs --stats",
        "  node mistakes-ledger.mjs --correct --id=<uuid> --correction=\"<diff or explanation>\"",
      ].join("\n"));
    }
  })().catch(e => { console.error(e); process.exit(1); });
}
