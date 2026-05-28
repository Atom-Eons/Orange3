#!/usr/bin/env node
/* final-green-board.mjs - ORANGEBOX finish-line proof board.
 *
 * This is the single "show me the whole loop" gate. It runs the existing
 * doctors, reads the receipts ledger, proves the finish-line automations are
 * present, checks product-facing naming drift, and records one closeout board.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runApiDoctor } from "./api-doctor.mjs";
import { runRouteDoctor } from "./operating-spine.mjs";
import { runRouteStateDoctor } from "./route-state.mjs";
import { runDeptDoctor } from "./dept-doctor.mjs";
import { runSurfaceDoctor } from "./surface-doctor.mjs";
import { runMcpDoctor } from "./mcp-doctor.mjs";
import { runAlpha7Doctor } from "./alpha7-doctor.mjs";
import { runAiBoxNetworkDoctor, runEtherealLinkDoctor } from "./ai-box-network.mjs";
import { runProductLanguageDoctor } from "./product-language-doctor.mjs";
import { runInstallClarityDoctor } from "./install-clarity-doctor.mjs";
import { runInstallRehearsal } from "./install-rehearsal.mjs";
import { runFirstRunVisualProof } from "./first-run-visual-proof.mjs";
import { runAeSeeSuiteVisualProof } from "./ae-see-suite-visual-proof.mjs";
import { runAeOperationsVisualProof } from "./ae-operations-visual-proof.mjs";
import { runProcessDoctor } from "./process-doctor.mjs";
import { runServiceFreshnessDoctor } from "./service-freshness.mjs";

export const FINAL_GREEN_BOARD_VERSION = "orangebox-final-green-board/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SHIP_MANIFEST = path.resolve(ROOT, "..", "ship", "orangebox-v6.3.0-alpha.7-portable.zip.manifest.json");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");

const AUTOMATION_FILES = [
  path.join(os.homedir(), ".codex", "automations", "orangebox-iteration-heartbeat-11m", "automation.toml"),
];

const PRODUCT_LANGUAGE_FILES = [
  "src/v4/index.html",
  "src/v4/cockpit.js",
  "src/v4/cockpit.css",
  "src/v4/onboarding/settings.html",
  "src/v4/onboarding/settings.js",
  "src/v4/marketplace/marketplace.html",
  "src/v4/marketplace/marketplace.js",
  "src/v4/receipts/receipts.html",
  "src/v4/receipts/receipts.js",
  "src/v4/x-feed/x-feed.html",
  "src/v4/voice/voice.js",
  "src/v4/terminal/terminal.js",
  "src/v4/privacy/privacy.js",
  "src/v4/shared/coming-soon.html",
  "src/v4/shared/i18n/en.json",
  "src/index.html",
  "src/first-run.html",
  "src/first-run.js",
  "src/first-run.css",
  "README.md",
  "INSTALL-FIRST.txt",
  "0-START-HERE.txt",
  "docs/AI_COMPUTER_BUYING_GUIDE.md",
  "docs/AI_BOX_NETWORK_PRIORITY.md",
  "docs/AI_BOX_WORKER_RAIL.md",
  "scripts/orangebox-mcp-server.mjs",
  "scripts/pack-v6-portable.mjs",
  "package.json",
];

const PRODUCT_BLOCKERS = [
  />\s*Cockpit\s*</i,
  /title="Cockpit\b/i,
  /Cockpit \(Ctrl\+1\)/i,
  /Welcome to ORANGEBOX v6\.3 alpha\.7/i,
  /private AI operations cockpit/i,
  /aria-label="Codexa status"/i,
  /<span class="chip-label">codexa<\/span>/i,
  />\s*Codexa\s*</i,
  /Codexa Cloud/i,
  /Settings -> Codexa Rail/i,
  /Codexa Probe/i,
  /Could not reach the cockpit/i,
  /inside the cockpit/i,
  /Back to cockpit/i,
  /Open in cockpit/i,
  /Cockpit pin/i,
  /BLUEB0X/i,
];

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function compactText(value, max = 3600) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function readText(file) {
  return fs.readFile(file, "utf8");
}

async function fileMeta(file) {
  const stat = await fs.stat(file);
  return {
    path: file,
    bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
  };
}

async function latestJsonReceipt(prefix, {
  maxAgeMs = 2 * 60 * 60 * 1000,
} = {}) {
  if (!fsSync.existsSync(RECEIPTS_DIR)) return null;
  const entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith(".json")) continue;
    const file = path.join(RECEIPTS_DIR, entry.name);
    const stat = await fs.stat(file);
    candidates.push({ file, stat });
  }
  candidates.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  for (const candidate of candidates) {
    if (Date.now() - candidate.stat.mtimeMs > maxAgeMs) continue;
    try {
      const json = JSON.parse((await fs.readFile(candidate.file, "utf8")).replace(/^\uFEFF/, ""));
      return {
        json,
        file: candidate.file,
        stat: candidate.stat,
      };
    } catch {}
  }
  return null;
}

function screenshotProofOk(receipt) {
  const shots = Array.isArray(receipt?.screenshots) ? receipt.screenshots : [];
  return shots.length > 0 && shots.every((shot) => shot?.ok === true && Number(shot.bytes || 0) > 10000);
}

function replayReceiptProofOk(receipt) {
  const latest = receipt?.seeded_silent_canvas?.workspace_state_after_seed?.latest_mutations || {};
  const total = Number(latest.count || 0);
  const linked = Number(latest.with_receipt_proof || 0);
  return receipt?.proof_contract?.silent_canvas_receipt_coupling_present === true &&
    total > 0 &&
    linked === total;
}

async function reuseFreshVisualReceipt(prefix, {
  label,
  requireReplayProof = false,
} = {}) {
  const latest = await latestJsonReceipt(prefix);
  const receipt = latest?.json || null;
  if (!receipt || receipt.ok !== true || !screenshotProofOk(receipt)) return null;
  if (requireReplayProof && !replayReceiptProofOk(receipt)) return null;
  return {
    ...receipt,
    ok: true,
    receipt_path: latest.file,
    reused_from_receipt: latest.file,
    reused_receipt_modified_at: latest.stat.mtime.toISOString(),
    evidence_mode: "fresh-visual-receipt",
    label: label || prefix,
  };
}

async function safeGate(name, fn, { required = true } = {}) {
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
      stack: err?.stack ? compactText(err.stack, 1800) : null,
    };
  }
}

function runCommand(command, args = [], { cwd = ROOT, timeoutMs = 180000 } = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timer = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({
        ...result,
        command: [command, ...args].join(" "),
        cwd,
        duration_ms: Date.now() - started,
        stdout_tail: compactText(stdout, 2600),
        stderr_tail: compactText(stderr, 2600),
      });
    };
    let child;
    try {
      let spawnCommand = command;
      let spawnArgs = args;
      if (process.platform === "win32" && /\.cmd$/i.test(command)) {
        const escapeCmd = (value) => String(value).replace(/([&|<>^])/g, "^$1");
        spawnCommand = "cmd.exe";
        spawnArgs = ["/d", "/c", ["call", escapeCmd(command), ...args.map(escapeCmd)].join(" ")];
      }
      child = spawn(spawnCommand, spawnArgs, {
        cwd,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        shell: false,
      });
    } catch (err) {
      finish({
        ok: false,
        exit_code: null,
        error: err?.message || String(err),
      });
      return;
    }
    timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, exit_code: null, error: "timeout" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => finish({ ok: false, exit_code: null, error: err.message }));
    child.on("close", (code) => finish({ ok: code === 0, exit_code: code, error: code === 0 ? null : `exit ${code}` }));
  });
}

function requestJson(baseUrl, endpoint, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, baseUrl);
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(data || "{}") });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `invalid JSON: ${err.message}`, raw: compactText(data, 900) });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err?.message || String(err) }));
    req.end();
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function startCleanTemporaryServer() {
  const port = await freePort();
  const tunnelPort = await freePort();
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-final-green-board-data-"));
  const child = spawn(process.execPath, [
    SERVER_SCRIPT,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--root",
    dataRoot,
    "--no-start-receipt",
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      ORANGEBOX_DATA_ROOT: dataRoot,
      ORANGEBOX_NO_START_RECEIPT: "1",
      ORANGEBOX_TUNNEL_PORT: String(tunnelPort),
      ORANGEBOX_TUNNEL_HOST: "127.0.0.1",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const probe = await requestJson(baseUrl, "/api/status?fast=1", 2000);
    if (probe.ok) {
      return {
        baseUrl,
        dataRoot,
        port,
        tunnelPort,
        started: true,
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 500));
        },
        output: () => ({ stdout_tail: compactText(stdout, 1800), stderr_tail: compactText(stderr, 1800) }),
        pid: child.pid,
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!child.killed) child.kill();
  throw new Error(`temporary clean ORANGEBOX server did not become ready on ${baseUrl}: ${compactText(stderr || stdout, 1200)}`);
}

function normalizeDoctor(name, out) {
  const summary = out?.summary || {};
  const failed = Number(summary.failed || out?.failures?.length || 0);
  const checks = Number(summary.checks || (Array.isArray(out?.checks) ? out.checks.length : 0));
  const passed = Number(summary.passed || (Array.isArray(out?.checks) ? out.checks.filter((check) => check.ok).length : 0));
  const warnings = Array.isArray(out?.warnings) ? out.warnings.slice(0, 8) : [];
  return {
    ok: out?.ok === true,
    doctor: name,
    checks,
    passed,
    failed,
    warnings: Number(summary.warnings || warnings.length || 0),
    warning_details: warnings.map((warning) => {
      if (typeof warning === "string") return warning;
      return warning?.detail || warning?.reason || warning?.message || JSON.stringify(warning);
    }).filter(Boolean),
    next_action: out?.next_action || out?.recovery_action || out?.recovery?.actions?.[0]?.title || null,
    recovery: out?.recovery || null,
    receipt_path: out?.receipt_path || null,
    version: out?.version || out?.doctor_version || null,
    failures: (out?.failures || []).slice(0, 8).map((failure) => ({
      name: failure.name || failure.id || "failure",
      error: failure.error || failure.evidence?.error || null,
      status: failure.status || null,
    })),
  };
}

function warningCount(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function collectAdvisories(checks) {
  const advisories = [];
  for (const check of checks) {
    const evidence = check.evidence || {};
    const directWarnings = Array.isArray(evidence.warnings) ? evidence.warnings : [];
    const directCount = directWarnings.length || warningCount(evidence.summary?.warnings);
    if (directCount) {
      advisories.push({
        check: check.name,
        type: "doctor_warning",
        status: check.status || (check.ok ? "pass" : "fail"),
        warning_count: directCount,
        message: directWarnings[0]?.detail || directWarnings[0]?.reason || "Non-failing doctor warning present.",
      });
    }

    const recovery = evidence.recovery || null;
    if (recovery?.status && recovery.status !== "clear") {
      const recoveryMessage = recovery.actions?.[0]?.title
        || recovery.action
        || evidence.recovery_action
        || check.recovery_action
        || "Recovery plan requires operator review.";
      advisories.push({
        check: check.name,
        type: "recovery_watch",
        status: recovery.status,
        warning_count: Math.max(1, warningCount(recovery.actions?.length)),
        message: recoveryMessage,
        recovery_action: evidence.recovery_action || check.recovery_action || recovery.action || null,
        read_only: recovery.read_only !== false,
        no_data_deletion_required: recovery.no_data_deletion_required === true,
        restart_is_operator_action: recovery.restart_is_operator_action === true,
      });
    }

    const doctors = Array.isArray(evidence.doctors) ? evidence.doctors : [];
    for (const doctor of doctors) {
      const count = warningCount(doctor.warnings);
      if (!count) continue;
      const detail = Array.isArray(doctor.warning_details) && doctor.warning_details.length
        ? doctor.warning_details[0]
        : null;
      advisories.push({
        check: check.name,
        doctor: doctor.doctor,
        type: "nested_doctor_warning",
        status: doctor.ok ? "pass" : "fail",
        warning_count: count,
        message: detail || `${doctor.doctor} reported ${count} non-failing warning${count === 1 ? "" : "s"}.`,
        warning_details: Array.isArray(doctor.warning_details) ? doctor.warning_details : [],
        recovery_action: doctor.next_action || null,
        read_only: doctor.recovery?.read_only !== false,
      });
    }
  }
  return advisories;
}

async function silentCanvasReplayReceiptGate(seeSuiteCheck) {
  const evidence = seeSuiteCheck?.evidence || {};
  const contract = evidence.proof_contract || {};
  const seeded = evidence.seeded_silent_canvas || {};
  const workspaceState = seeded.workspace_state_after_seed || {};
  const mutationProof = workspaceState.latest_mutations || {};
  const linked = Number(mutationProof.with_receipt_proof || 0);
  const total = Number(mutationProof.count || 0);
  const proofPath = (Array.isArray(evidence.screenshots)
    ? evidence.screenshots.find((shot) => shot.name === "silent-canvas")?.path
    : null) || null;
  const receiptPath = evidence.receipt_path || null;
  const ok = seeSuiteCheck?.ok === true &&
    contract.silent_canvas_receipt_coupling_present === true &&
    total > 0 &&
    linked === total;

  return {
    ok,
    version: "orangebox-silent-canvas-replay-receipt-proof/v1",
    summary: {
      checks: 1,
      passed: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      warnings: 0,
    },
    state: ok ? "receipt-linked" : "review",
    message: ok
      ? `Silent Canvas replay events are receipt-linked (${linked}/${total}).`
      : `Silent Canvas replay receipt proof needs review (${linked}/${total || "?"}).`,
    evidence: {
      see_suite_check_ok: seeSuiteCheck?.ok === true,
      silent_canvas_receipt_coupling_present: contract.silent_canvas_receipt_coupling_present === true,
      replay_events: total,
      replay_events_with_receipt_proof: linked,
      latest_proof_title: mutationProof.latest_proof_title || null,
      proof_links: Number(mutationProof.proof_links || 0),
      see_suite_visual_receipt: receiptPath,
      silent_canvas_screenshot: proofPath,
      workspace: seeded.workspace || null,
      graph: seeded.graph || null,
    },
  };
}

async function listFilesRecursive(root, predicate = () => true) {
  if (!fsSync.existsSync(root)) return [];
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(file);
      else if (entry.isFile() && predicate(file)) out.push(file);
    }
  }
  return out.sort();
}

async function receiptLedgerGate() {
  const files = await listFilesRecursive(RECEIPTS_DIR, (file) => file.toLowerCase().endsWith(".json"));
  const parseFailures = [];
  const parsed = [];
  for (const file of files) {
    try {
      const raw = (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "");
      const json = JSON.parse(raw);
      const stat = await fs.stat(file);
      parsed.push({
        path: file,
        bytes: stat.size,
        modified_at_ms: stat.mtimeMs,
        modified_at: stat.mtime.toISOString(),
        ok: json.ok ?? json.result?.ok ?? json.result?.result?.ok ?? null,
        source: json.source || json.project || json.receipt_id || json.result?.doctor || path.basename(file, ".json"),
        title: json.title || json.scope || json.summary || json.result?.summary || null,
      });
    } catch (err) {
      parseFailures.push({ path: file, error: err?.message || String(err) });
    }
  }
  parsed.sort((a, b) => b.modified_at_ms - a.modified_at_ms);
  const sourceFamilies = {};
  for (const row of parsed) {
    const family = String(row.source || "unknown").replace(/-\d{8}T.*$/, "").slice(0, 80);
    sourceFamilies[family] = (sourceFamilies[family] || 0) + 1;
  }
  return {
    ok: files.length > 0 && parseFailures.length === 0,
    receipts_dir: RECEIPTS_DIR,
    receipt_count: files.length,
    parsed_count: parsed.length,
    parse_failures: parseFailures.slice(0, 20),
    latest: parsed.slice(0, 12).map(({ path: file, bytes, modified_at, ok, source, title }) => ({ path: file, bytes, modified_at, ok, source, title })),
    source_family_count: Object.keys(sourceFamilies).length,
    top_source_families: Object.entries(sourceFamilies).sort((a, b) => b[1] - a[1]).slice(0, 16).map(([source, count]) => ({ source, count })),
  };
}

async function automationsGate() {
  const observed = [];
  for (const file of AUTOMATION_FILES) {
    if (!fsSync.existsSync(file)) {
      observed.push({ path: file, exists: false, active: false });
      continue;
    }
    const raw = await readText(file);
    observed.push({
      ...(await fileMeta(file)),
      exists: true,
      active: /status\s*=\s*"ACTIVE"/.test(raw),
      id: raw.match(/^id\s*=\s*"([^"]+)"/m)?.[1] || null,
      kind: raw.match(/^kind\s*=\s*"([^"]+)"/m)?.[1] || null,
      rrule: raw.match(/^rrule\s*=\s*"([^"]+)"/m)?.[1] || null,
      prompt_sha256: sha256Text(raw.match(/^prompt\s*=\s*"([\s\S]*?)"\s*$/m)?.[1] || raw),
      cwd_mentions_orangebox: raw.includes("C:\\\\AtomEons\\\\orangebox") || raw.includes("C:\\AtomEons\\orangebox"),
    });
  }
  const missing = observed.filter((item) => !item.exists || !item.active);
  return {
    ok: missing.length === 0,
    automation_count: observed.length,
    active_count: observed.filter((item) => item.active).length,
    observed,
    missing_or_inactive: missing.map((item) => item.path),
    write_guard: {
      status: "COVERED_BY_HEARTBEAT_PROMPT_AND_DOCTORS",
      note: "Codex app allows one heartbeat automation per thread. The active heartbeat carries the finish-line scope; write safety is enforced by final doctors, receipts, and rollback gates instead of a second thread heartbeat."
    },
  };
}

async function productLanguageGate({ baseUrl = null, startServer = true, forceTempServer = true } = {}) {
  return runProductLanguageDoctor({
    writeReceipt: false,
    startServer,
    includeMutationSmoke: false,
    baseUrl,
    forceTempServer,
  });
}

async function installClarityGate({ baseUrl = null, startServer = true } = {}) {
  return runInstallClarityDoctor({
    writeReceipt: false,
    startServer,
    baseUrl,
  });
}

async function cleanInstallRehearsalGate() {
  return runInstallRehearsal({
    writeReceipt: false,
    keepDataRoot: true,
  });
}

async function firstRunVisualGate({ proofDir = null, baseUrl = null, startServer = true } = {}) {
  if (!proofDir && !baseUrl) {
    const reused = await reuseFreshVisualReceipt("orangebox-first-run-visual-proof-", {
      label: "first-run Basic vs Advanced visual proof",
    });
    if (reused) return reused;
  }
  return runFirstRunVisualProof({
    writeReceipt: false,
    startServer,
    baseUrl,
    ...(proofDir ? { proofDir } : {}),
  });
}

async function aeSeeSuiteVisualGate({ proofDir = null, baseUrl = null, startServer = true } = {}) {
  if (!proofDir && !baseUrl) {
    const reused = await reuseFreshVisualReceipt("orangebox-ae-see-suite-visual-proof-", {
      label: "AE See-Suite visual proof",
      requireReplayProof: true,
    });
    if (reused) return reused;
  }
  return runAeSeeSuiteVisualProof({
    writeReceipt: false,
    startServer,
    baseUrl,
    forceTempServer: !baseUrl,
    seedFixture: Boolean(baseUrl && !startServer),
    ...(proofDir ? { proofDir } : {}),
  });
}

async function aeOperationsVisualGate({ proofDir = null, baseUrl = null, startServer = true } = {}) {
  if (!proofDir && !baseUrl) {
    const reused = await reuseFreshVisualReceipt("orangebox-ae-operations-visual-proof-", {
      label: "AE Operations visual proof",
    });
    if (reused) return reused;
  }
  return runAeOperationsVisualProof({
    writeReceipt: false,
    startServer,
    baseUrl,
    forceTempServer: !baseUrl,
    ...(proofDir ? { proofDir } : {}),
  });
}

async function serviceFreshnessGate({ baseUrl = null } = {}) {
  return runServiceFreshnessDoctor({
    writeReceipt: false,
    baseUrl: baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
  });
}

async function packageGate() {
  if (!fsSync.existsSync(SHIP_MANIFEST)) {
    return {
      ok: false,
      manifest_path: SHIP_MANIFEST,
      error: "portable package manifest not found",
    };
  }
  const raw = await readText(SHIP_MANIFEST);
  let manifest = {};
  try { manifest = JSON.parse(raw); } catch (err) {
    return { ok: false, manifest_path: SHIP_MANIFEST, error: err?.message || String(err) };
  }
  const zipPath = manifest.zip || manifest.zip_path || path.resolve(path.dirname(SHIP_MANIFEST), "orangebox-v6.3.0-alpha.7-portable.zip");
  const zipExists = fsSync.existsSync(zipPath);
  return {
    ok: zipExists && !!(manifest.sha256 || manifest.zip_sha256 || manifest.hashes?.zip),
    manifest_path: SHIP_MANIFEST,
    manifest_sha256: sha256Text(raw),
    zip_path: zipPath,
    zip_exists: zipExists,
    zip_sha256: manifest.sha256 || manifest.zip_sha256 || manifest.hashes?.zip || null,
    version: manifest.version || manifest.package_version || null,
  };
}

async function gitGate({ requireClean = false } = {}) {
  const out = await runCommand("git", ["status", "--short"], { cwd: ROOT, timeoutMs: 60000 });
  const lines = out.stdout_tail.split(/\r?\n/).filter(Boolean);
  return {
    ok: requireClean ? out.ok && lines.length === 0 : out.ok,
    clean: lines.length === 0,
    require_clean: requireClean,
    status_count: lines.length,
    status_sample: lines.slice(0, 120),
    command: out.command,
    error: out.error || null,
    note: lines.length
      ? "Repo is not clean. The board records this as a finish-line warning unless --require-clean is used; no unrelated changes were reverted."
      : "Repo is clean.",
  };
}

async function syntaxGate() {
  const checks = [
    [process.execPath, ["--check", path.join(ROOT, "scripts", "obx.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "final-green-board.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "install-clarity-doctor.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "install-rehearsal.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "first-run-visual-proof.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "ae-see-suite-visual-proof.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "ae-operations-visual-proof.mjs")]],
    [process.execPath, ["--check", path.join(ROOT, "scripts", "v4", "process-doctor.mjs")]],
    ["npm.cmd", ["run", "check"]],
  ];
  const runs = [];
  for (const [command, args] of checks) {
    runs.push(await runCommand(command, args, { cwd: ROOT, timeoutMs: 180000 }));
  }
  return {
    ok: runs.every((run) => run.ok),
    runs,
  };
}

async function doctorsGate({ full = false } = {}) {
  const doctors = [];
  const run = async (name, fn) => {
    const out = await fn();
    doctors.push(normalizeDoctor(name, out));
  };
  await run("api", () => runApiDoctor({ writeReceipt: false }));
  await run("route", () => runRouteDoctor({ writeReceipt: false }));
  await run("route-state", () => runRouteStateDoctor({ writeReceipt: false }));
  await run("dept", () => runDeptDoctor({ writeReceipt: false }));
  await run("surface", () => runSurfaceDoctor({ writeReceipt: false }));
  await run("mcp", () => runMcpDoctor({ writeReceipt: false }));
  await run("ai-box-network", () => runAiBoxNetworkDoctor({ writeReceipt: false, deep: full }));
  await run("ethereal-link", () => runEtherealLinkDoctor({ writeReceipt: false, deep: full }));
  await run("silent-canvas-alpha7", () => runAlpha7Doctor({ writeReceipt: false, full, keepTemp: false }));
  return {
    ok: doctors.every((doctor) => doctor.ok),
    full,
    doctors,
    failed_doctors: doctors.filter((doctor) => !doctor.ok),
  };
}

async function writeBoardReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-final-green-board-${stampForFile()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runFinalGreenBoard({
  writeReceipt = false,
  full = false,
  requireClean = false,
} = {}) {
  const startedAt = new Date().toISOString();
  const checks = [];
  const cleanProofDir = requireClean
    ? await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-final-green-board-proof-"))
    : null;
  let cleanRuntime = null;

  try {
    if (requireClean) cleanRuntime = await startCleanTemporaryServer();
    const runtimeOptions = cleanRuntime
      ? { baseUrl: cleanRuntime.baseUrl, startServer: false }
      : {};

    checks.push(await safeGate("finish_line_automations_active", automationsGate));
    checks.push(await safeGate("receipts_ledger_parses_all_json", receiptLedgerGate));
    checks.push(await safeGate("product_language_ae_see_suite", () => productLanguageGate({
      ...runtimeOptions,
      forceTempServer: !cleanRuntime,
    })));
    checks.push(await safeGate("install_clarity_basic_advanced", () => installClarityGate(runtimeOptions)));
    checks.push(await safeGate("clean_basic_install_rehearsal", cleanInstallRehearsalGate));
    checks.push(await safeGate("first_run_basic_advanced_visual_proof", () => firstRunVisualGate({ ...runtimeOptions, proofDir: cleanProofDir })));
    const seeSuiteVisualCheck = await safeGate("ae_see_suite_visual_proof", () => aeSeeSuiteVisualGate({ ...runtimeOptions, proofDir: cleanProofDir }));
    checks.push(seeSuiteVisualCheck);
    checks.push(await safeGate("silent_canvas_replay_receipt_proof", () => silentCanvasReplayReceiptGate(seeSuiteVisualCheck)));
    checks.push(await safeGate("ae_operations_visual_proof", () => aeOperationsVisualGate({ ...runtimeOptions, proofDir: cleanProofDir })));
    checks.push(await safeGate("service_freshness", () => serviceFreshnessGate(runtimeOptions), { required: false }));
    checks.push(await safeGate("syntax_and_npm_check", syntaxGate));
    checks.push(await safeGate("all_doctors_board", async () => doctorsGate({ full })));
    checks.push(await safeGate("process_hygiene", () => runProcessDoctor({
      writeReceipt: false,
      ignorePids: [process.pid, process.ppid, cleanRuntime?.pid],
    })));
    checks.push(await safeGate("portable_package_manifest", packageGate));
    checks.push(await safeGate("git_state", async () => gitGate({ requireClean }), { required: requireClean }));
  } finally {
    if (cleanRuntime) await cleanRuntime.stop();
  }

  const failures = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const advisories = collectAdvisories(checks);
  const advisoryWarnings = advisories.reduce((sum, advisory) => sum + warningCount(advisory.warning_count), 0);
  const result = {
    ok: failures.length === 0,
    version: FINAL_GREEN_BOARD_VERSION,
    project: "ORANGEBOX",
    product_language: {
      top_surface: "AE See-Suite",
      operations_surface: "AE Operations",
      legacy_surface_language: "internal compatibility only until route/class migration",
    },
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    root: ROOT,
    full,
    require_clean: requireClean,
    proof_output: {
      mode: requireClean ? "temp-proof-dir-for-clean-git" : "repo-proof-dir",
      proof_dir: cleanProofDir,
      data_root: cleanRuntime?.dataRoot || null,
      note: requireClean
        ? "Runtime and visual proof were written outside the repo so the board can verify a clean git state."
        : "Visual screenshot proof was written to the repo proof directory.",
    },
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: warnings.length,
      advisory_count: advisories.length,
      advisory_warnings: advisoryWarnings,
    },
    checks,
    failures,
    warnings,
    advisories,
    rollback: {
      no_destructive_actions: true,
      no_unrelated_reverts: true,
      package_manifest: SHIP_MANIFEST,
      receipts_dir: RECEIPTS_DIR,
      automation_files: AUTOMATION_FILES,
    },
    receipt_path: null,
  };
  if (writeReceipt) result.receipt_path = await writeBoardReceipt(result);
  return result;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runFinalGreenBoard({
    writeReceipt: argv.includes("--receipt"),
    full: argv.includes("--full"),
    requireClean: argv.includes("--require-clean"),
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ORANGEBOX final green board ${out.summary.passed}/${out.summary.checks}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
