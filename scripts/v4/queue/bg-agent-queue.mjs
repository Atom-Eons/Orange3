// =============================================================================
// ORANGEBOX v4 — Background Agent Queue
// Doctrine: ATOM-OBX-V4-MOAT-2026-0516
// Rule: Receipts everywhere. No claim without proof. Every action emits a receipt.
// Rule: Local-first by default. Cloud is opt-in.
// Rule: The operator is the chairman. Human Final Stop Authority reachable always.
// Rule: Mom's Law — full effort, no coasting, no theater.
//
// Purpose:
//   Lets the operator say "do X overnight, wake me when done."
//   Tasks run on AE See-Suite or the optional AI Box rail
//   (local | ai-box-lan | ai-box-cloud). Legacy worker names are normalized.
//   Receipts are emitted on every state transition.
//   Priority queue: 1 (highest) → 9 (lowest).
//   Zero npm deps — built-ins only.
//
// Data root: process.env.ORANGEBOX_DATA_ROOT || ~/.orangebox
//   queue/state.json          — durable queue state
//   receipts/queue/<id>.json  — one receipt per transition
//
// CLI:
//   node bg-agent-queue.mjs --enqueue --title="X" --prompt="..."
//   node bg-agent-queue.mjs --list [--status=queued]
//   node bg-agent-queue.mjs --status=<id>
//   node bg-agent-queue.mjs --cancel=<id>
//   node bg-agent-queue.mjs --stats
//   node bg-agent-queue.mjs --worker-loop [--poll-ms=2000]
// =============================================================================

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import process from "node:process";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
const QUEUE_DIR = path.join(DATA_ROOT, "queue");
const STATE_PATH = path.join(QUEUE_DIR, "state.json");
const RECEIPTS_DIR = path.join(DATA_ROOT, "receipts", "queue");

// ---------------------------------------------------------------------------
// Valid values
// ---------------------------------------------------------------------------

const VALID_STATUSES = new Set(["queued", "running", "done", "failed", "cancelled"]);
const WORKER_ALIASES = new Map([
  ["codexa-lan", "ai-box-lan"],
  ["codexa-cloud", "ai-box-cloud"],
]);
const VALID_WORKERS = new Set(["local", "ai-box-lan", "ai-box-cloud", ...WORKER_ALIASES.keys()]);

function normalizeWorker(worker) {
  const key = String(worker || "").trim().toLowerCase();
  if (!key) return null;
  return WORKER_ALIASES.get(key) || (VALID_WORKERS.has(key) ? key : null);
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

async function ensureDirs() {
  await fs.mkdir(QUEUE_DIR, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// State I/O — all mutations go through load → mutate → save
// ---------------------------------------------------------------------------

async function loadState() {
  try {
    const raw = await fs.readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.jobs)) throw new Error("corrupt state");
    return parsed;
  } catch {
    return { version: 1, jobs: [] };
  }
}

async function saveState(state) {
  await ensureDirs();
  const tmp = STATE_PATH + ".tmp." + process.pid;
  await fs.writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await fs.rename(tmp, STATE_PATH);
}

// ---------------------------------------------------------------------------
// Receipt emitter
// ---------------------------------------------------------------------------

async function emitReceipt({ id, transition, worker, summary, evidence }) {
  await ensureDirs();
  const receipt = {
    id,
    transition,
    at: new Date().toISOString(),
    worker: worker || null,
    summary: summary || "",
    evidence: evidence || {}
  };
  const receiptPath = path.join(RECEIPTS_DIR, `${id}-${transition.replace(/[^a-z]/g, "-")}.json`);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  return receiptPath;
}

// ---------------------------------------------------------------------------
// UUID v4 — pure built-in
// ---------------------------------------------------------------------------

function uuidv4() {
  const bytes = crypto.randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join("-");
}

// ---------------------------------------------------------------------------
// Smart worker router
// Auto-selects worker based on availability and env hints.
// Priority: ai-box-lan > ai-box-cloud > local (operator can override).
// ---------------------------------------------------------------------------

function routeWorker(jobHint) {
  const normalizedHint = normalizeWorker(jobHint);
  if (normalizedHint) return normalizedHint;
  if (process.env.ORANGEBOX_AI_BOX_IP || process.env.ORANGEBOX_CODEXA_IP) return "ai-box-lan";
  if (process.env.ORANGEBOX_AI_BOX_CLOUD_URL || process.env.ORANGEBOX_CODEXA_CLOUD_URL) return "ai-box-cloud";
  return "local";
}

// ---------------------------------------------------------------------------
// Core API
// ---------------------------------------------------------------------------

/**
 * enqueue(job) — add a new job to the queue.
 *
 * @param {object} job
 *   Required: title (string), prompt (string)
 *   Optional: provider (string), priority (1-9), worker ("local"|"ai-box-lan"|"ai-box-cloud")
 * @returns {object} the stored job record
 */
async function enqueue(job) {
  if (!job || typeof job.title !== "string" || !job.title.trim()) {
    throw new Error("enqueue: title is required");
  }
  if (!job || typeof job.prompt !== "string" || !job.prompt.trim()) {
    throw new Error("enqueue: prompt is required");
  }

  const priority = Number(job.priority);
  const resolvedPriority = Number.isFinite(priority) && priority >= 1 && priority <= 9
    ? priority
    : 5;

  const record = {
    id: uuidv4(),
    title: job.title.trim(),
    prompt: job.prompt.trim(),
    provider: job.provider || null,
    priority: resolvedPriority,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    status: "queued",
    worker: routeWorker(job.worker),
    receiptPath: null,
    error: null,
    result: null
  };

  const state = await loadState();
  state.jobs.push(record);
  await saveState(state);

  const rp = await emitReceipt({
    id: record.id,
    transition: "queued",
    worker: record.worker,
    summary: `Job enqueued: ${record.title}`,
    evidence: { title: record.title, priority: record.priority, worker: record.worker }
  });
  record.receiptPath = rp;

  // Persist the receiptPath on the record itself
  const state2 = await loadState();
  const idx = state2.jobs.findIndex(j => j.id === record.id);
  if (idx !== -1) {
    state2.jobs[idx].receiptPath = rp;
    await saveState(state2);
  }

  return record;
}

/**
 * dequeue() — pull the highest-priority queued job (lowest priority number).
 * Returns null if queue is empty.
 */
async function dequeue() {
  const state = await loadState();
  const queued = state.jobs
    .filter(j => j.status === "queued")
    .sort((a, b) => a.priority - b.priority || new Date(a.createdAt) - new Date(b.createdAt));
  if (!queued.length) return null;
  return queued[0];
}

/**
 * peek() — same as dequeue() but does not mutate state.
 */
async function peek() {
  return dequeue();
}

/**
 * list({ status, limit }) — list jobs, optionally filtered by status.
 */
async function list({ status, limit } = {}) {
  const state = await loadState();
  let jobs = [...state.jobs];
  if (status) {
    if (!VALID_STATUSES.has(status)) throw new Error(`list: unknown status "${status}"`);
    jobs = jobs.filter(j => j.status === status);
  }
  jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (typeof limit === "number" && limit > 0) jobs = jobs.slice(0, limit);
  return jobs;
}

/**
 * cancel(id) — cancel a queued job. Cannot cancel running/done/failed.
 */
async function cancel(id) {
  if (!id) throw new Error("cancel: id is required");
  const state = await loadState();
  const idx = state.jobs.findIndex(j => j.id === id);
  if (idx === -1) throw new Error(`cancel: job not found: ${id}`);
  const job = state.jobs[idx];
  if (job.status !== "queued") {
    throw new Error(`cancel: cannot cancel job in status "${job.status}" (only "queued" jobs may be cancelled)`);
  }

  state.jobs[idx].status = "cancelled";
  state.jobs[idx].completedAt = new Date().toISOString();
  await saveState(state);

  const rp = await emitReceipt({
    id,
    transition: "queued→cancelled",
    worker: job.worker,
    summary: `Job cancelled: ${job.title}`,
    evidence: { title: job.title }
  });

  state.jobs[idx].receiptPath = rp;
  await saveState(state);

  return state.jobs[idx];
}

/**
 * markRunning(id, worker) — transition queued → running.
 */
async function markRunning(id, worker) {
  if (!id) throw new Error("markRunning: id is required");
  const state = await loadState();
  const idx = state.jobs.findIndex(j => j.id === id);
  if (idx === -1) throw new Error(`markRunning: job not found: ${id}`);
  const job = state.jobs[idx];
  if (job.status !== "queued") {
    throw new Error(`markRunning: expected status "queued", got "${job.status}"`);
  }

  const resolvedWorker = normalizeWorker(worker) || job.worker;
  state.jobs[idx].status = "running";
  state.jobs[idx].startedAt = new Date().toISOString();
  state.jobs[idx].worker = resolvedWorker;
  await saveState(state);

  const rp = await emitReceipt({
    id,
    transition: "queued→running",
    worker: resolvedWorker,
    summary: `Job started: ${job.title}`,
    evidence: { worker: resolvedWorker, startedAt: state.jobs[idx].startedAt }
  });

  state.jobs[idx].receiptPath = rp;
  await saveState(state);

  return state.jobs[idx];
}

/**
 * markDone(id, { receiptPath, result }) — transition running → done.
 */
async function markDone(id, { receiptPath: callerReceiptPath, result } = {}) {
  if (!id) throw new Error("markDone: id is required");
  const state = await loadState();
  const idx = state.jobs.findIndex(j => j.id === id);
  if (idx === -1) throw new Error(`markDone: job not found: ${id}`);
  const job = state.jobs[idx];
  if (job.status !== "running") {
    throw new Error(`markDone: expected status "running", got "${job.status}"`);
  }

  state.jobs[idx].status = "done";
  state.jobs[idx].completedAt = new Date().toISOString();
  state.jobs[idx].result = result ?? null;
  await saveState(state);

  const rp = await emitReceipt({
    id,
    transition: "running→done",
    worker: job.worker,
    summary: `Job completed: ${job.title}`,
    evidence: {
      result: typeof result === "string" ? result.slice(0, 500) : result,
      callerReceiptPath: callerReceiptPath || null,
      completedAt: state.jobs[idx].completedAt
    }
  });

  state.jobs[idx].receiptPath = callerReceiptPath || rp;
  await saveState(state);

  return state.jobs[idx];
}

/**
 * markFailed(id, error) — transition running → failed.
 */
async function markFailed(id, error) {
  if (!id) throw new Error("markFailed: id is required");
  const state = await loadState();
  const idx = state.jobs.findIndex(j => j.id === id);
  if (idx === -1) throw new Error(`markFailed: job not found: ${id}`);
  const job = state.jobs[idx];
  if (job.status !== "running") {
    throw new Error(`markFailed: expected status "running", got "${job.status}"`);
  }

  const errorMsg = error instanceof Error ? error.message : String(error || "unknown error");
  state.jobs[idx].status = "failed";
  state.jobs[idx].completedAt = new Date().toISOString();
  state.jobs[idx].error = errorMsg;
  await saveState(state);

  const rp = await emitReceipt({
    id,
    transition: "running→failed",
    worker: job.worker,
    summary: `Job failed: ${job.title}`,
    evidence: { error: errorMsg, completedAt: state.jobs[idx].completedAt }
  });

  state.jobs[idx].receiptPath = rp;
  await saveState(state);

  return state.jobs[idx];
}

/**
 * stats() — return aggregate queue statistics.
 */
async function stats() {
  const state = await loadState();
  const counts = { queued: 0, running: 0, done: 0, failed: 0, cancelled: 0, total: state.jobs.length };
  for (const j of state.jobs) {
    if (counts[j.status] !== undefined) counts[j.status]++;
  }
  const queuedJobs = state.jobs.filter(j => j.status === "queued");
  const nextJob = queuedJobs.sort((a, b) => a.priority - b.priority)[0] || null;
  return {
    counts,
    nextJob: nextJob ? { id: nextJob.id, title: nextJob.title, priority: nextJob.priority } : null,
    dataRoot: DATA_ROOT,
    statePath: STATE_PATH,
    receiptsDir: RECEIPTS_DIR
  };
}

// ---------------------------------------------------------------------------
// Worker loop
// ---------------------------------------------------------------------------

/**
 * runWorkerLoop({ pollMs, dispatch })
 *
 * Polls for queued jobs and calls dispatch(job).
 * dispatch must be an async function that resolves with a result string/object
 * or throws on failure.
 *
 * The loop runs until process.exit() or SIGINT/SIGTERM.
 *
 * @param {object} opts
 *   pollMs  — polling interval in milliseconds (default 2000)
 *   dispatch — async (job) => result | throws
 */
async function runWorkerLoop({ pollMs = 2000, dispatch } = {}) {
  if (typeof dispatch !== "function") {
    throw new Error("runWorkerLoop: dispatch must be an async function");
  }

  console.log(`[bg-agent-queue] worker loop started — poll=${pollMs}ms — dataRoot=${DATA_ROOT}`);

  let running = true;
  const shutdown = (sig) => {
    console.log(`[bg-agent-queue] ${sig} received — draining and shutting down`);
    running = false;
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  while (running) {
    try {
      const job = await dequeue();
      if (!job) {
        await sleep(pollMs);
        continue;
      }

      console.log(`[bg-agent-queue] dispatching job ${job.id} (${job.title}) priority=${job.priority} worker=${job.worker}`);

      await markRunning(job.id, job.worker);

      try {
        const result = await dispatch(job);
        await markDone(job.id, { result });
        console.log(`[bg-agent-queue] job done: ${job.id}`);
      } catch (err) {
        await markFailed(job.id, err);
        console.error(`[bg-agent-queue] job failed: ${job.id} — ${err.message || err}`);
      }
    } catch (outerErr) {
      console.error(`[bg-agent-queue] worker loop error: ${outerErr.message || outerErr}`);
      await sleep(pollMs);
    }
  }

  console.log("[bg-agent-queue] worker loop stopped.");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseCliArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    if (arg === "--enqueue") { args.enqueue = true; continue; }
    if (arg === "--list") { args.list = true; continue; }
    if (arg === "--stats") { args.stats = true; continue; }
    if (arg === "--worker-loop") { args.workerLoop = true; continue; }
    const m = arg.match(/^--([a-z][a-z0-9-]*)(?:=(.*))?$/s);
    if (m) {
      const key = m[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      args[key] = m[2] !== undefined ? m[2] : true;
    }
  }
  return args;
}

function fmtJob(j) {
  return [
    `  id        : ${j.id}`,
    `  title     : ${j.title}`,
    `  status    : ${j.status}`,
    `  priority  : ${j.priority}`,
    `  worker    : ${j.worker}`,
    `  createdAt : ${j.createdAt}`,
    j.startedAt   ? `  startedAt : ${j.startedAt}` : null,
    j.completedAt ? `  completed : ${j.completedAt}` : null,
    j.error       ? `  error     : ${j.error}` : null,
    j.result      ? `  result    : ${String(j.result).slice(0, 120)}` : null,
    j.receiptPath ? `  receipt   : ${j.receiptPath}` : null
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const args = parseCliArgs(process.argv);

  if (args.enqueue) {
    if (!args.title) { console.error("--enqueue requires --title=<title>"); process.exit(1); }
    if (!args.prompt) { console.error("--enqueue requires --prompt=<prompt>"); process.exit(1); }
    const job = await enqueue({
      title: args.title,
      prompt: args.prompt,
      provider: args.provider || null,
      priority: args.priority ? Number(args.priority) : 5,
      worker: args.worker || null
    });
    console.log("[enqueued]");
    console.log(fmtJob(job));
    return;
  }

  if (args.list) {
    const statusFilter = args.status && VALID_STATUSES.has(args.status) ? args.status : undefined;
    const limit = args.limit ? Number(args.limit) : undefined;
    const jobs = await list({ status: statusFilter, limit });
    if (!jobs.length) {
      console.log("[queue empty" + (statusFilter ? ` — status=${statusFilter}` : "") + "]");
    } else {
      console.log(`[${jobs.length} job(s)${statusFilter ? " status=" + statusFilter : ""}]`);
      for (const j of jobs) { console.log(fmtJob(j)); console.log(""); }
    }
    return;
  }

  // --status=<id>  (single job lookup)
  if (args.status && !args.list) {
    const id = args.status;
    const state = await loadState();
    const job = state.jobs.find(j => j.id === id);
    if (!job) { console.error(`job not found: ${id}`); process.exit(1); }
    console.log(fmtJob(job));
    return;
  }

  if (args.cancel) {
    try {
      const job = await cancel(args.cancel);
      console.log("[cancelled]");
      console.log(fmtJob(job));
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
    return;
  }

  if (args.stats) {
    const s = await stats();
    console.log("[queue stats]");
    console.log(`  total     : ${s.counts.total}`);
    console.log(`  queued    : ${s.counts.queued}`);
    console.log(`  running   : ${s.counts.running}`);
    console.log(`  done      : ${s.counts.done}`);
    console.log(`  failed    : ${s.counts.failed}`);
    console.log(`  cancelled : ${s.counts.cancelled}`);
    if (s.nextJob) {
      console.log(`  next job  : [p${s.nextJob.priority}] ${s.nextJob.title} (${s.nextJob.id})`);
    }
    console.log(`  state     : ${s.statePath}`);
    console.log(`  receipts  : ${s.receiptsDir}`);
    return;
  }

  if (args.workerLoop) {
    // Demo dispatch: echoes the prompt back as result.
    // In production AE Operations replaces this with a real AI Box dispatch.
    const demoDispatch = async (job) => {
      console.log(`[demo-dispatch] executing: ${job.title}`);
      await sleep(500); // simulate work
      return `demo result for: ${job.title}`;
    };
    const pollMs = args.pollMs ? Number(args.pollMs) : 2000;
    await runWorkerLoop({ pollMs, dispatch: demoDispatch });
    return;
  }

  // Default: show help
  console.log([
    "ORANGEBOX v4 — Background Agent Queue",
    "Usage:",
    "  node bg-agent-queue.mjs --enqueue --title=\"X\" --prompt=\"...\" [--priority=1-9] [--worker=local|ai-box-lan|ai-box-cloud]",
    "  node bg-agent-queue.mjs --list [--status=queued|running|done|failed|cancelled] [--limit=N]",
    "  node bg-agent-queue.mjs --status=<id>",
    "  node bg-agent-queue.mjs --cancel=<id>",
    "  node bg-agent-queue.mjs --stats",
    "  node bg-agent-queue.mjs --worker-loop [--poll-ms=2000]",
    "",
    "Data root: " + DATA_ROOT,
    "State    : " + STATE_PATH,
    "Receipts : " + RECEIPTS_DIR
  ].join("\n"));
}

// ---------------------------------------------------------------------------
// Exports (for programmatic use)
// ---------------------------------------------------------------------------

export {
  enqueue,
  dequeue,
  peek,
  list,
  cancel,
  markRunning,
  markDone,
  markFailed,
  stats,
  runWorkerLoop,
  DATA_ROOT,
  STATE_PATH,
  RECEIPTS_DIR
};

// Run CLI only when invoked directly
// ESM-safe: compare resolved paths
import { fileURLToPath } from "node:url";
const __filename = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (isMain) {
  main().catch(err => {
    console.error("[bg-agent-queue] fatal:", err.message || err);
    process.exit(1);
  });
}
