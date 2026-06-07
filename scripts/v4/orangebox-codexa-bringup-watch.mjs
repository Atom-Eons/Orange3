#!/usr/bin/env node
/*
  orangebox-codexa-bringup-watch.mjs

  Bounded post-install watcher for Codexa / AI Box bring-up. This is the
  cockpit-side companion to the OBOX2 setup pack: after the operator runs the
  first-click launcher on Codexa, this script watches the real rails and writes
  a receipt-backed verdict. It does not mutate Codexa, install models, touch the
  frontend, or claim full-system green.
*/

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const wantsPopup = args.has("--popup");

function argNumber(name, fallback) {
  const prefix = `${name}=`;
  const found = rawArgs.find((arg) => arg.startsWith(prefix));
  if (!found) return fallback;
  const value = Number(found.slice(prefix.length));
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

const iterations = Math.max(1, Math.min(60, Math.trunc(argNumber("--iterations", 4))));
const intervalMs = Math.max(0, Math.min(60_000, Math.trunc(argNumber("--interval-ms", 3_000))));
const alertTimeoutMs = Math.max(5_000, Math.min(60_000, Math.trunc(argNumber("--alert-timeout-ms", 25_000))));

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "codexa-bringup");
const alertScript = path.join(repoRoot, "scripts", "v4", "orangebox-codexa-alert-doctor.mjs");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fileSummary(file) {
  try {
    const stat = fs.statSync(file);
    return { path: file, exists: true, bytes: stat.size, modified_at: stat.mtime.toISOString() };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function runAlert(iteration) {
  const alertArgs = [alertScript, "--json", "--receipt"];
  if (wantsPopup && iteration === 1) alertArgs.push("--popup");
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, alertArgs, {
      cwd: repoRoot,
      timeout: alertTimeoutMs,
      windowsHide: true,
      maxBuffer: 2_000_000,
      env: { ...process.env, ORANGEBOX_REPO_ROOT: repoRoot, ORANGEBOX_DATA_ROOT: dataRoot },
    });
    const parsed = parseJsonFromStdout(stdout);
    return {
      ok: Boolean(parsed?.status),
      iteration,
      duration_ms: Date.now() - started,
      exit_code: 0,
      status: parsed?.status || null,
      command_rail_reachable: parsed?.command_rail_reachable ?? null,
      ollama_reachable: parsed?.ollama_reachable ?? null,
      receipts_reachable: parsed?.receipts_reachable ?? null,
      remote_execution_available: parsed?.remote_execution_available ?? null,
      smb_port_visible: parsed?.smb_port_visible ?? null,
      signal_summary: parsed?.signal_hygiene?.summary_line || null,
      next_actions: parsed?.next_actions || [],
      receipt_path: parsed?.receipt_path || null,
      stdout_tail: stdout.slice(-1000),
      stderr_tail: stderr.slice(-1000),
    };
  } catch (error) {
    return {
      ok: false,
      iteration,
      duration_ms: Date.now() - started,
      exit_code: typeof error.code === "number" ? error.code : 1,
      status: "CODEXA_ALERT_DOCTOR_FAILED",
      error: error.message,
      stdout_tail: String(error.stdout || "").slice(-1000),
      stderr_tail: String(error.stderr || "").slice(-1000),
    };
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function classify(history) {
  const last = history.at(-1) || {};
  const statusHistory = history.map((item) => item.status).filter(Boolean);
  const ready = last.status === "CODEXA_READY";
  const commandReady = last.command_rail_reachable === true;
  const ollamaReady = last.ollama_reachable === true;
  const receiptsReady = last.receipts_reachable === true;
  const alertFailed = history.some((item) => item.status === "CODEXA_ALERT_DOCTOR_FAILED");
  const improved =
    history.length > 1 &&
    history[0].status !== last.status &&
    last.status !== "CODEXA_UNREACHABLE" &&
    last.status !== "CODEXA_ALERT_DOCTOR_FAILED";
  const status = ready
    ? "CODEXA_BRINGUP_READY"
    : alertFailed
      ? "CODEXA_BRINGUP_WATCH_REPORTED_ALERT_FAILURE"
      : "CODEXA_BRINGUP_REPORTED_OPEN_GAPS";
  const missing = [];
  if (!commandReady) missing.push("command_rail_8097");
  if (!ollamaReady) missing.push("ollama_11434");
  if (!receiptsReady) missing.push("receipt_dashboard_8099");
  if (last.remote_execution_available !== true) missing.push("remote_execution_path");
  return {
    status,
    ready,
    improved,
    commandReady,
    ollamaReady,
    receiptsReady,
    missing,
    statusHistory,
  };
}

async function main() {
  const startedAt = new Date();
  const history = [];
  for (let i = 1; i <= iterations; i += 1) {
    history.push(await runAlert(i));
    const last = history.at(-1);
    if (last?.status === "CODEXA_READY") break;
    if (i < iterations && intervalMs > 0) await sleep(intervalMs);
  }

  const verdict = classify(history);
  const projectReport = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"));
  const modelInventory = readJson(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"));
  const handoff = readJson(path.join(dataRoot, "codexa-handoff", "latest-codexa-handoff.json"));
  const setupZip = fileSummary(path.join(userRoot, "Downloads", "Orangebox_V2_Internal_Setup_Pack.zip"));
  const runOrder = fileSummary(path.join(dataRoot, "exports", "obox2-internal-setup-pack", "CODEXA_RUN_ORDER.json"));

  const lastActions = history.at(-1)?.next_actions || [];
  const nextActions = verdict.ready
    ? [
        "Run npm.cmd run model:inventory, npm.cmd run trilane:doctor, and npm.cmd run model:lane-eval before routing heavy work.",
        "Run npm.cmd run ops:gaps && npm.cmd run ops:green to refresh one-reality proof after Codexa is reachable.",
      ]
    : unique([
        ...lastActions,
        "Keep local Ops green separate from two-machine green; do not route heavy work to Codexa until this watcher reports CODEXA_BRINGUP_READY.",
        setupZip.exists ? `Use setup zip: ${setupZip.path}` : "Run npm.cmd run obox2:pack to rebuild the Codexa setup zip.",
      ]);

  const result = {
    ok: true,
    codexa_ready: verdict.ready,
    version: "orangebox-codexa-bringup-watch/v1",
    status: verdict.status,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      install_attempted: false,
      remote_codexa_mutation_attempted: false,
      paid_api_attempted: false,
      production_deploy_attempted: false,
    },
    watch_config: {
      iterations,
      interval_ms: intervalMs,
      alert_timeout_ms: alertTimeoutMs,
      popup_requested: wantsPopup,
    },
    verdict: {
      ready: verdict.ready,
      improved_during_watch: verdict.improved,
      command_rail_ready: verdict.commandReady,
      ollama_ready: verdict.ollamaReady,
      receipts_ready: verdict.receiptsReady,
      missing: verdict.missing,
      status_history: verdict.statusHistory,
    },
    evidence: {
      setup_zip: setupZip,
      run_order_export: runOrder,
      codexa_handoff_status: handoff?.status || null,
      first_click: handoff?.codexa_run_order?.[0]?.command || "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd",
      model_inventory_status: modelInventory?.status || null,
      required_models_observed: modelInventory?.summary?.required_installed ?? null,
      required_models_total: modelInventory?.summary?.required_total ?? null,
      project_report_status: projectReport?.status || null,
      full_project_green: projectReport?.full_project_green ?? null,
      full_system_green_claim_allowed: projectReport?.full_project_green === true && verdict.ready === true,
    },
    history,
    next_actions: nextActions,
    false_green_guard: "This watcher proving open gaps is success as a report, not success as full two-machine readiness.",
    watch_hash: sha256(JSON.stringify(history.map((item) => ({
      status: item.status,
      command: item.command_rail_reachable,
      ollama: item.ollama_reachable,
      receipts: item.receipts_reachable,
    })))),
  };

  const latestPath = path.join(outRoot, "latest-codexa-bringup-watch.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-codexa-bringup-watch-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
}

await main();
