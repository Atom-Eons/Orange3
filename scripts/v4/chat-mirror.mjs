#!/usr/bin/env node
/* chat-mirror.mjs - lightweight local chat mirror for account resilience.
 *
 * Mirrors Codex and Claude local JSONL chat/session files into OrangeBox-Data
 * incrementally. It copies only appended bytes by default, so huge sessions are
 * mirrored over time instead of being recopied on every run.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHAT_MIRROR_VERSION = "orangebox-chat-mirror/v0";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const MIRROR_ROOT = path.join(DATA_ROOT, "chat-mirror");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DEFAULT_MAX_BYTES_PER_FILE = 8 * 1024 * 1024;
const DEFAULT_MAX_BYTES_TOTAL = 64 * 1024 * 1024;

const SOURCE_ROOTS = [
  {
    id: "codex_sessions",
    account: "codex",
    root: path.join(os.homedir(), ".codex", "sessions"),
    pattern: ".jsonl",
  },
  {
    id: "codex_archived_sessions",
    account: "codex",
    root: path.join(os.homedir(), ".codex", "archived_sessions"),
    pattern: ".jsonl",
  },
  {
    id: "claude_projects",
    account: "claude",
    root: path.join(os.homedir(), ".claude", "projects"),
    pattern: ".jsonl",
  },
  {
    id: "claude_history",
    account: "claude",
    root: path.join(os.homedir(), ".claude"),
    pattern: "history.jsonl",
    maxDepth: 0,
  },
];

function flagValue(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function numberFlag(args, flag, fallback) {
  const raw = flagValue(args, flag, null);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function safeRel(value) {
  return String(value || "")
    .replace(/^[A-Za-z]:[\\/]/, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/[\\/]+/g, path.sep);
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function walkJsonl(root, pattern, { maxDepth = 8 } = {}) {
  const out = [];
  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", ".git", "Cache", "cache"].includes(entry.name)) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (pattern === "history.jsonl" ? entry.name === pattern : entry.name.endsWith(pattern)) out.push(full);
    }
  }
  if (fsSync.existsSync(root)) await walk(root, 0);
  return out;
}

function mirrorPathFor(sourceRoot, sourceFile, account) {
  const relative = path.relative(sourceRoot, sourceFile);
  return path.join(MIRROR_ROOT, account, sourceRoot.replace(/[<>:"|?*]/g, "_").replace(/[\\/]+/g, "_"), safeRel(relative));
}

async function appendRange(source, target, start, maxBytes) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const sourceHandle = await fs.open(source, "r");
  const targetHandle = await fs.open(target, "a");
  let copied = 0;
  try {
    const buffer = Buffer.allocUnsafe(Math.min(1024 * 1024, Math.max(1, maxBytes)));
    while (copied < maxBytes) {
      const toRead = Math.min(buffer.length, maxBytes - copied);
      const read = await sourceHandle.read(buffer, 0, toRead, start + copied);
      if (read.bytesRead <= 0) break;
      await targetHandle.write(buffer.subarray(0, read.bytesRead));
      copied += read.bytesRead;
      if (read.bytesRead < toRead) break;
    }
  } finally {
    await sourceHandle.close();
    await targetHandle.close();
  }
  return copied;
}

async function mirrorOne(sourceInfo, file, budgets, previous) {
  const stat = await fs.stat(file);
  const target = mirrorPathFor(sourceInfo.root, file, sourceInfo.account);
  const targetExists = fsSync.existsSync(target);
  const targetStat = targetExists ? await fs.stat(target) : null;
  const currentSize = targetStat?.size || 0;
  const item = {
    source: file,
    source_root: sourceInfo.root,
    source_group: sourceInfo.id,
    account: sourceInfo.account,
    mirror: target,
    source_size: stat.size,
    mirrored_size_before: currentSize,
    mirrored_size_after: currentSize,
    copied_bytes: 0,
    status: "unchanged",
    mtime: stat.mtime.toISOString(),
  };

  if (currentSize > stat.size) {
    const revision = `${target}.superseded-${stamp()}`;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(target, revision).catch(async () => {
      await fs.copyFile(target, revision);
      await fs.rm(target, { force: true });
    });
    item.status = "source_shrank_restart";
    item.superseded_mirror = revision;
    item.mirrored_size_before = 0;
  }

  const start = item.status === "source_shrank_restart" ? 0 : currentSize;
  if (start < stat.size && budgets.remainingTotal > 0) {
    const allowed = Math.min(stat.size - start, budgets.maxBytesPerFile, budgets.remainingTotal);
    const copied = await appendRange(file, target, start, allowed);
    budgets.remainingTotal -= copied;
    item.copied_bytes = copied;
    item.mirrored_size_after = start + copied;
    item.status = item.mirrored_size_after >= stat.size ? "complete" : "partial";
  } else if (currentSize === stat.size) {
    item.status = "complete";
  } else if (budgets.remainingTotal <= 0) {
    item.status = "budget_deferred";
  }

  item.identity_hash = sha256(`${file}|${stat.size}|${stat.mtimeMs}`);
  item.previous_mirror = previous?.files?.[file]?.mirror || null;
  return item;
}

async function runMirror({
  receipt = false,
  maxBytesPerFile = DEFAULT_MAX_BYTES_PER_FILE,
  maxBytesTotal = DEFAULT_MAX_BYTES_TOTAL,
} = {}) {
  await fs.mkdir(MIRROR_ROOT, { recursive: true });
  const statePath = path.join(MIRROR_ROOT, "mirror-state.json");
  const previous = await readJson(statePath, { files: {} });
  const budgets = { maxBytesPerFile, remainingTotal: maxBytesTotal };
  const startedAt = new Date().toISOString();
  const discovered = [];

  for (const root of SOURCE_ROOTS) {
    const files = await walkJsonl(root.root, root.pattern, { maxDepth: root.maxDepth ?? 8 });
    for (const file of files) discovered.push({ root, file });
  }

  discovered.sort((a, b) => {
    const as = fsSync.statSync(a.file);
    const bs = fsSync.statSync(b.file);
    return bs.mtimeMs - as.mtimeMs;
  });

  const mirrored = [];
  for (const item of discovered) {
    mirrored.push(await mirrorOne(item.root, item.file, budgets, previous));
  }

  const filesBySource = {};
  for (const item of mirrored) filesBySource[item.source] = item;
  const report = {
    ok: true,
    version: CHAT_MIRROR_VERSION,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    mode: {
      incremental_append_only: true,
      max_bytes_per_file: maxBytesPerFile,
      max_bytes_total: maxBytesTotal,
      network_used: false,
      heavy_data_strategy: "append only new bytes; defer remainder when budget is exhausted",
    },
    roots: SOURCE_ROOTS.map((root) => ({ id: root.id, account: root.account, root: root.root, exists: fsSync.existsSync(root.root) })),
    summary: {
      discovered: discovered.length,
      copied_bytes: mirrored.reduce((sum, item) => sum + item.copied_bytes, 0),
      complete: mirrored.filter((item) => item.status === "complete").length,
      partial: mirrored.filter((item) => item.status === "partial").length,
      deferred: mirrored.filter((item) => item.status === "budget_deferred").length,
      restarted: mirrored.filter((item) => item.status === "source_shrank_restart").length,
    },
    files: mirrored,
    outputs: {
      mirror_root: MIRROR_ROOT,
      state: statePath,
      latest_report: path.join(MIRROR_ROOT, "latest-chat-mirror.json"),
      latest_index: path.join(MIRROR_ROOT, "latest-index.md"),
    },
    restore_note: "Raw JSONL mirrors can be copied back or parsed into Markdown/screenplay archives. Large active sessions may be partial until subsequent scheduled runs finish appending them.",
  };

  await writeJson(report.outputs.latest_report, report);
  await writeJson(statePath, { updated_at: report.finished_at, files: filesBySource });
  const indexLines = [
    "# Orangebox Chat Mirror Index",
    "",
    `Generated: ${report.finished_at}`,
    `Version: ${CHAT_MIRROR_VERSION}`,
    "",
    "## Summary",
    "",
    `- Discovered: ${report.summary.discovered}`,
    `- Complete: ${report.summary.complete}`,
    `- Partial: ${report.summary.partial}`,
    `- Deferred: ${report.summary.deferred}`,
    `- Copied bytes this run: ${report.summary.copied_bytes}`,
    "",
    "## Recent Files",
    "",
    ...mirrored.slice(0, 50).map((item) => `- ${item.account} / ${item.status} / ${item.source_size} bytes: \`${item.mirror}\``),
    "",
  ];
  await fs.writeFile(report.outputs.latest_index, `${indexLines.join("\n")}\n`, "utf8");

  if (receipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-chat-mirror-${stamp()}.json`);
    report.receipt_path = receiptPath;
    await writeJson(receiptPath, report);
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const receipt = args.includes("--receipt");
  const maxBytesPerFile = numberFlag(args, "--max-bytes-per-file", DEFAULT_MAX_BYTES_PER_FILE);
  const maxBytesTotal = numberFlag(args, "--max-bytes-total", DEFAULT_MAX_BYTES_TOTAL);
  const result = await runMirror({ receipt, maxBytesPerFile, maxBytesTotal });
  if (wantsJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.ok ? "OK" : "FAIL"} ${CHAT_MIRROR_VERSION}`);
    console.log(`mirror: ${result.outputs.mirror_root}`);
    console.log(`copied: ${result.summary.copied_bytes} bytes`);
    console.log(`complete: ${result.summary.complete} partial: ${result.summary.partial} deferred: ${result.summary.deferred}`);
    if (result.receipt_path) console.log(`receipt: ${result.receipt_path}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});

export { runMirror };
