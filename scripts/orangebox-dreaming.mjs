#!/usr/bin/env node
/* ============================================================================
   orangebox-dreaming.mjs

   Dreaming agent — Anthropic Agent SDK pattern: a scheduled background
   pass that reviews recent operator sessions and consolidates memory.

   What it does (one pass, idempotent):

     1. Reads the last 24 hours of party-line entries across all projects.
     2. Reads the last 50 receipts.
     3. Extracts patterns:
        - Which departments fired most often
        - Which DAG nodes moved or got stuck
        - Which decisions were made
        - Which mistakes occurred
        - Which blockers persisted >24h
     4. Triggers a v2 knowledge vault rebuild so the new material is indexed.
     5. Writes a dream-session summary to:
            <orangeRoot>/memory/dreams/dream-<ts>.json
        and appends a single party-line message:
            from: dreaming, status: info,
            message: "Dream session complete. N receipts reviewed,
                      M patterns extracted."

   Designed to run as a nightly cron OR on-demand via:
            POST /api/dreaming/run

   No LLM calls. No spawned subprocess (except the v2 rebuild itself).
   RAM-light, streamy reads.
   ============================================================================ */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const ORANGE_ROOT = process.env.ORANGEBOX_DATA_ROOT
  || process.env.ORANGEBOX_ROOT
  || arg("--root")
  || path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command");

const HOURS = Number(arg("--hours", 24));
const MAX_RECEIPTS = Number(arg("--max-receipts", 50));

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
const iso = () => new Date().toISOString();
const stamp = () => iso().replace(/[:.]/g, "-");

async function readRecentPartyLine() {
  const root = path.join(ORANGE_ROOT, "party-line");
  if (!(await exists(root))) return [];
  const since = Date.now() - HOURS * 60 * 60 * 1000;
  const messages = [];
  let projectDirs;
  try { projectDirs = await fs.readdir(root, { withFileTypes: true }); } catch { return []; }
  for (const dir of projectDirs) {
    if (!dir.isDirectory()) continue;
    const file = path.join(root, dir.name, "messages.jsonl");
    if (!(await exists(file))) continue;
    try {
      const raw = await fs.readFile(file, "utf8");
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        try {
          const m = JSON.parse(line);
          const ts = new Date(m.ts).getTime();
          if (ts >= since) messages.push({ project: dir.name, ...m });
        } catch {}
      }
    } catch {}
  }
  return messages.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

async function readRecentReceipts() {
  const root = path.join(ORANGE_ROOT, "receipts");
  if (!(await exists(root))) return [];
  const out = [];
  async function walk(dir, depth = 0) {
    if (depth > 5) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else if (e.isFile() && /\.(json)$/i.test(e.name)) {
        try {
          const stat = await fs.stat(p);
          out.push({ path: p, mtime: stat.mtimeMs, size: stat.size });
        } catch {}
      }
    }
  }
  await walk(root);
  return out.sort((a, b) => b.mtime - a.mtime).slice(0, MAX_RECEIPTS);
}

function extractPatterns(partyLine, receipts) {
  const patterns = {
    departments_fired: {},
    dag_nodes_moved: new Set(),
    decisions: [],
    mistakes: [],
    blockers_active: [],
    receipts_by_project: {},
    voice_distribution: {},
  };
  for (const m of partyLine) {
    if (m.dag_node) patterns.dag_nodes_moved.add(`${m.project}/${m.dag_node}`);
    if (m.from) patterns.voice_distribution[m.from] = (patterns.voice_distribution[m.from] || 0) + 1;
    if (/^ae\d+$/i.test(m.from || "")) {
      const d = m.from.toUpperCase();
      patterns.departments_fired[d] = (patterns.departments_fired[d] || 0) + 1;
    }
    if ((m.status || "").toLowerCase() === "decision") patterns.decisions.push(m);
    if ((m.status || "").toLowerCase() === "mistake") patterns.mistakes.push(m);
    if (Array.isArray(m.blockers) && m.blockers.length) {
      patterns.blockers_active.push({ project: m.project, dag_node: m.dag_node, blockers: m.blockers });
    }
  }
  for (const r of receipts) {
    const parts = r.path.replace(/\\/g, "/").split("/");
    const projIdx = parts.findIndex(x => x === "receipts");
    const proj = projIdx >= 0 ? parts[projIdx + 1] : "unknown";
    patterns.receipts_by_project[proj] = (patterns.receipts_by_project[proj] || 0) + 1;
  }
  patterns.dag_nodes_moved = [...patterns.dag_nodes_moved];
  return patterns;
}

async function triggerVaultRebuild() {
  const script = path.join(APP_ROOT, "scripts", "orangebox-knowledge-v2.mjs");
  try {
    const { stdout, stderr } = await execFileAsync("node", [script, "--root", ORANGE_ROOT], { timeout: 120000 });
    return { status: "VERIFIED", stdout: String(stdout).slice(-2000), stderr: String(stderr).slice(-500) };
  } catch (e) {
    return { status: "FAILED", error: String(e?.message || e) };
  }
}

async function emitPartyLineMessage(message, project = "orangebox") {
  const dir = path.join(ORANGE_ROOT, "party-line", project);
  await fs.mkdir(dir, { recursive: true });
  const entry = {
    ts: iso(),
    project,
    from: "dreaming",
    to: "operator",
    status: "info",
    message,
    confidence: "high",
  };
  await fs.appendFile(path.join(dir, "messages.jsonl"), JSON.stringify(entry) + "\n");
}

async function run() {
  console.log(`[dreaming] window=${HOURS}h · root=${ORANGE_ROOT}`);
  const t0 = Date.now();
  const partyLine = await readRecentPartyLine();
  const receipts = await readRecentReceipts();
  const patterns = extractPatterns(partyLine, receipts);

  const dream = {
    schema: "orangebox-dream-v1",
    started_at: new Date(t0).toISOString(),
    finished_at: null,
    window_hours: HOURS,
    party_line_count: partyLine.length,
    receipts_count: receipts.length,
    patterns,
    vault_rebuild: null,
    note: "No LLM calls. Pure local pattern extraction.",
  };

  // Trigger vault rebuild to ingest any new docs
  dream.vault_rebuild = await triggerVaultRebuild();
  dream.finished_at = iso();
  dream.elapsed_ms = Date.now() - t0;

  // Persist the dream
  const dreamDir = path.join(ORANGE_ROOT, "memory", "dreams");
  await fs.mkdir(dreamDir, { recursive: true });
  const dreamPath = path.join(dreamDir, `dream-${stamp()}.json`);
  await fs.writeFile(dreamPath, JSON.stringify(dream, null, 2));

  // Emit a party-line message
  const summary = `Dream session complete. ${receipts.length} receipts reviewed, ${partyLine.length} messages scanned, ${patterns.dag_nodes_moved.length} DAG nodes touched, ${Object.keys(patterns.departments_fired).length} departments active. Vault: ${dream.vault_rebuild.status}.`;
  await emitPartyLineMessage(summary);

  console.log(`[dreaming] complete (${dream.elapsed_ms}ms) · ${dreamPath}`);
  return dream;
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  run().then(r => {
    console.log(JSON.stringify({ status: r.vault_rebuild.status === "VERIFIED" ? "VERIFIED" : "PARTIAL", elapsed_ms: r.elapsed_ms, summary: r }, null, 2));
  }).catch(e => { console.error("[dreaming] FATAL", e); process.exit(1); });
}

export { run };
