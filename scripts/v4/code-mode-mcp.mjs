#!/usr/bin/env node
/* code-mode-mcp.mjs - compact docs+execute lane for ORANGEBOX MCP.
 *
 * Inspired by code-mode MCP patterns: agents search the contract/docs, then
 * execute a tiny allow-listed ORANGEBOX CLI subset instead of flooding context
 * with one tool per endpoint. No arbitrary shell. No writes unless the command
 * is explicitly allow-listed and receipts are visible.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const CODE_MODE_MCP_VERSION = "orangebox-code-mode-mcp/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const SEARCH_ROOTS = [
  "docs",
  "prompts",
  "scripts",
  "src/v4",
  "receipts",
].map((part) => path.join(ROOT, part));

const ALLOW_PATTERNS = [
  /^obx api doctor(?: --json)?(?: --receipt)?$/,
  /^obx route doctor(?: --json)?(?: --receipt)?$/,
  /^obx route state-doctor(?: --json)?(?: --receipt)?$/,
  /^obx route current(?: --json)?$/,
  /^obx route history(?: --json)?(?: --limit=\d+)?$/,
  /^obx route (?:show|detail)(?: [a-zA-Z0-9_.:-]+)?(?: --json)?$/,
  /^obx route replay(?: [a-zA-Z0-9_.:-]+)?(?: --json)?$/,
  /^obx route artifact(?: [a-zA-Z0-9_.:-]+)?(?: [a-zA-Z0-9_.:-]+)?(?: --json)?$/,
  /^obx route progress(?: [a-z0-9_-]+| next)?(?: --status=(?:ready|pending|active|done|blocked|skipped))?(?: --json)?(?: --receipt)?$/,
  /^obx route verify-gates(?: --json)?(?: --receipt)?$/,
  /^obx route package(?: --json)?(?: --receipt)?$/,
  /^obx route receipt(?: --json)?$/,
  /^obx route promote(?: --json)?(?: --receipt)?$/,
  /^obx route plan .+(?: --json)?(?: --receipt)?$/,
  /^obx claude export-route .+(?: --json)?(?: --receipt)?$/,
  /^obx aelang doctor(?: --json)?(?: --receipt)?$/,
  /^obx aelang compile(?: --tier=(?:auto|high|core))?(?: --json)?(?: --receipt)?$/,
  /^obx aelang compile --input=[a-zA-Z0-9_.:\\/-]+(?: --tier=(?:auto|high|core))?(?: --json)?(?: --receipt)?$/,
  /^obx dept doctor(?: --json)?(?: --receipt)?$/,
  /^obx surface doctor(?: --json)?(?: --receipt)?$/,
  /^obx mcp doctor(?: --json)?(?: --receipt)?$/,
  /^obx intel doctor(?: --json)?$/,
  /^obx silent-canvas alpha7-doctor(?: --json)?(?: --receipt)?(?: --full)?$/,
];

const DENY_TOKENS = [
  /[;&|`]/,
  /\b(rm|del|erase|remove-item|rmdir|rd)\b/i,
  /\b(git\s+reset|git\s+checkout|git\s+clean)\b/i,
  /\b(powershell|pwsh|cmd|bash|sh)\b/i,
  />/,
  /<\s*/,
];

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function normalizeQuery(value) {
  return String(value || "").toLowerCase().split(/[^a-z0-9_.:/-]+/).filter((part) => part.length >= 2);
}

async function walkFiles(root, out = [], limit = 1200) {
  if (out.length >= limit) return out;
  let entries = [];
  try { entries = await fs.readdir(root, { withFileTypes: true }); } catch { return out; }
  for (const entry of entries) {
    if (out.length >= limit) break;
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "target", ".git", "build", "installer-output"].includes(entry.name)) continue;
      await walkFiles(file, out, limit);
    } else if (/\.(md|json|yaml|yml|mjs|js|html|css|txt)$/i.test(entry.name)) {
      out.push(file);
    }
  }
  return out;
}

function excerpt(text, terms) {
  const lower = text.toLowerCase();
  let idx = -1;
  for (const term of terms) {
    idx = lower.indexOf(term);
    if (idx >= 0) break;
  }
  if (idx < 0) idx = 0;
  const start = Math.max(0, idx - 180);
  const end = Math.min(text.length, idx + 420);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

export async function searchDocs({ query, limit = 8 } = {}) {
  const terms = normalizeQuery(query);
  if (!terms.length) throw new Error("query is required");
  const files = [];
  for (const root of SEARCH_ROOTS) await walkFiles(root, files, 1400);
  const hits = [];
  for (const file of files) {
    let text = "";
    try {
      const st = await fs.stat(file);
      if (st.size > 1_000_000) continue;
      text = await fs.readFile(file, "utf8");
    } catch { continue; }
    const lower = text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (lower.includes(term)) score += term.length;
      if (path.basename(file).toLowerCase().includes(term)) score += term.length * 2;
    }
    if (score > 0) {
      hits.push({
        file,
        relative_file: path.relative(ROOT, file),
        score,
        excerpt: excerpt(text, terms),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.relative_file.localeCompare(b.relative_file));
  return {
    ok: true,
    version: CODE_MODE_MCP_VERSION,
    query,
    count: Math.min(hits.length, Number(limit || 8)),
    hits: hits.slice(0, Math.min(Number(limit || 8), 20)),
  };
}

function normalizeCommand(command) {
  return String(command || "").replace(/\s+/g, " ").trim();
}

function toNodeArgs(command) {
  const normalized = normalizeCommand(command);
  const parts = normalized.split(" ");
  if (parts[0] !== "obx") throw new Error("only obx commands are allowed");
  return ["scripts/obx.mjs", ...parts.slice(1)];
}

export function checkCommandAllowed(command) {
  const normalized = normalizeCommand(command);
  const deny = DENY_TOKENS.find((pattern) => pattern.test(normalized));
  if (deny) return { ok: false, allowed: false, command: normalized, reason: `denied token: ${deny}` };
  const allowed = ALLOW_PATTERNS.some((pattern) => pattern.test(normalized));
  return {
    ok: allowed,
    allowed,
    command: normalized,
    reason: allowed ? "allow-listed ORANGEBOX command" : "command is outside code-mode MCP allow-list",
    allow_list: ALLOW_PATTERNS.map((pattern) => pattern.toString()),
  };
}

async function writeExecuteReceipt(dataRoot, payload) {
  const dir = path.join(dataRoot, "receipts", "v4");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-code-mode-mcp-execute-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}.json`);
  await fs.writeFile(file, JSON.stringify({
    id: path.basename(file, ".json"),
    source: "code-mode-mcp",
    title: `Code-mode MCP execute: ${payload.allowed ? "allowed" : "blocked"}`,
    summary: payload.command,
    evidence: payload,
    ts: new Date().toISOString(),
  }, null, 2) + "\n", "utf8");
  return file;
}

export async function executeSnippet({
  command,
  timeoutMs = 120000,
  dataRoot = defaultDataRoot(),
  writeReceipt = true,
} = {}) {
  const gate = checkCommandAllowed(command);
  if (!gate.allowed) {
    const blocked = {
      ok: false,
      allowed: false,
      blocked: true,
      command: gate.command,
      reason: gate.reason,
      stdout: "",
      stderr: "",
      exit_code: null,
    };
    if (writeReceipt) blocked.receipt_path = await writeExecuteReceipt(dataRoot, blocked);
    return blocked;
  }
  const args = toNodeArgs(gate.command);
  const started = Date.now();
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ORANGEBOX_ROOT: ROOT, ORANGEBOX_DATA_ROOT: dataRoot },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, exit_code: null, timed_out: true, error: "timeout" });
    }, Math.min(Math.max(Number(timeoutMs || 120000), 1000), 180000));
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => finish({ ok: false, exit_code: null, error: err.message, stdout, stderr }));
    child.on("close", (code) => finish({ ok: code === 0, exit_code: code, error: code === 0 ? null : `exit ${code}`, stdout, stderr }));
  });
  const payload = {
    ...result,
    allowed: true,
    blocked: false,
    version: CODE_MODE_MCP_VERSION,
    command: gate.command,
    argv: args,
    cwd: ROOT,
    duration_ms: Date.now() - started,
    stdout: String(result.stdout || ""),
    stderr: String(result.stderr || ""),
  };
  if (writeReceipt) payload.receipt_path = await writeExecuteReceipt(dataRoot, payload);
  return payload;
}

async function gate(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const evidence = await fn();
    const ok = evidence?.ok !== false;
    return {
      name,
      required,
      ok,
      status: ok ? "pass" : (required ? "fail" : "warning"),
      duration_ms: Date.now() - started,
      evidence,
    };
  } catch (err) {
    return {
      name,
      required,
      ok: false,
      status: required ? "fail" : "warning",
      duration_ms: Date.now() - started,
      error: err?.message || String(err),
    };
  }
}

export async function runCodeModeDoctor({ dataRoot = null } = {}) {
  const root = dataRoot || path.join(os.tmpdir(), `obx-code-mode-mcp-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
  await fs.mkdir(root, { recursive: true });
  const checks = [];
  checks.push(await gate("search_docs_finds_openapi", async () => {
    const out = await searchDocs({ query: "OpenAPI route plan", limit: 8 });
    return {
      ok: out.hits.some((hit) => hit.relative_file.replace(/\\/g, "/").includes("docs/api/orangebox-openapi.yaml")),
      count: out.count,
      hits: out.hits.map((hit) => hit.relative_file),
    };
  }));
  checks.push(await gate("execute_allows_read_only_doctor", async () => {
    const out = await executeSnippet({
      command: "obx route doctor --json",
      dataRoot: root,
      writeReceipt: true,
      timeoutMs: 120000,
    });
    return {
      ok: out.ok && out.allowed && fsSync.existsSync(out.receipt_path),
      command: out.command,
      exit_code: out.exit_code,
      receipt_path: out.receipt_path,
    };
  }));
  checks.push(await gate("execute_blocks_shell_escape", async () => {
    const out = await executeSnippet({
      command: "obx route doctor --json ; del C:\\AtomEons",
      dataRoot: root,
      writeReceipt: true,
    });
    return {
      ok: out.blocked === true && out.allowed === false && fsSync.existsSync(out.receipt_path),
      reason: out.reason,
      receipt_path: out.receipt_path,
    };
  }));
  const failures = checks.filter((check) => check.required && !check.ok);
  return {
    ok: failures.length === 0,
    version: CODE_MODE_MCP_VERSION,
    data_root: root,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
    },
    checks,
    failures,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const out = await runCodeModeDoctor();
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} code-mode MCP checks`);
    for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
