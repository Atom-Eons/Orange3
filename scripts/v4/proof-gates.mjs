#!/usr/bin/env node
/* proof-gates.mjs - execute current ORANGEBOX route proof gates.
 *
 * This keeps the Mission Spine honest: proof cards are not decoration. The
 * verifier runs the allow-listed gate commands from the current route, records
 * each result into durable route state, then advances the verify macro only
 * when the route's required proof gates pass.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { loadCurrentRoute, saveCurrentRoute, updateCurrentRouteProgress } from "./route-state.mjs";

export const PROOF_GATES_VERSION = "orangebox-route-proof-gates/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function receiptDir() {
  return path.join(ROOT, "receipts");
}

function commandParts(command) {
  const text = String(command || "").trim();
  if (!/^node\s+scripts\/obx\.mjs\s+/i.test(text)) {
    throw new Error(`proof gate command is outside allow-list: ${text}`);
  }
  return text.split(/\s+/);
}

function runCommand(command, { timeoutMs = 180000 } = {}) {
  const parts = commandParts(command);
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(parts[0], parts.slice(1), {
      cwd: ROOT,
      shell: false,
      windowsHide: true,
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\nTIMEOUT after ${timeoutMs}ms`;
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(stdout.trim()); } catch {}
      resolve({
        command,
        exit_code: code,
        duration_ms: Date.now() - started,
        ok: code === 0 && parsed?.ok !== false,
        parsed,
        stdout_tail: stdout.slice(-2000),
        stderr_tail: stderr.slice(-2000),
      });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        command,
        exit_code: -1,
        duration_ms: Date.now() - started,
        ok: false,
        parsed: null,
        stdout_tail: stdout.slice(-2000),
        stderr_tail: err?.message || String(err),
      });
    });
  });
}

async function writeProofGateReceipt(result) {
  await fs.mkdir(receiptDir(), { recursive: true });
  const file = path.join(receiptDir(), `orangebox-route-proof-gates-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runCurrentRouteProofGates({
  dataRoot = defaultDataRoot(),
  writeReceipt = false,
  postPartyLine = null,
  timeoutMs = 180000,
} = {}) {
  const loaded = await loadCurrentRoute({ dataRoot });
  if (!loaded.current?.route_id) throw new Error("no current Mission Spine route to verify");
  const route = structuredClone(loaded.current);
  const gates = Array.isArray(route.proof_gates) ? route.proof_gates : [];
  const required = gates.filter((gate) => gate.required !== false);
  const results = [];
  for (const gate of gates) {
    const run = await runCommand(gate.command, { timeoutMs });
    results.push({
      id: gate.id,
      label: gate.label || gate.id,
      required: gate.required !== false,
      command: gate.command,
      status: run.ok ? "pass" : "fail",
      ok: run.ok,
      exit_code: run.exit_code,
      duration_ms: run.duration_ms,
      receipt_path: run.parsed?.receipt_path || null,
      summary: run.parsed?.summary || null,
      stderr_tail: run.stderr_tail,
    });
  }

  const requiredFailures = results.filter((item) => item.required && !item.ok);
  route.proof_gate_results = Object.fromEntries(results.map((item) => [item.id, item]));
  route.proof_gate_last_run = {
    ts: new Date().toISOString(),
    required: required.length,
    passed_required: required.length - requiredFailures.length,
    failed_required: requiredFailures.length,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify(results.map((item) => ({
      id: item.id,
      status: item.status,
      exit_code: item.exit_code,
      receipt_path: item.receipt_path,
    })))).digest("hex"),
  };

  await saveCurrentRoute({ route, dataRoot });
  const progress = await updateCurrentRouteProgress({
    macroId: "verify",
    status: requiredFailures.length ? "blocked" : "done",
    proofNote: `proof gates ${route.proof_gate_last_run.passed_required}/${route.proof_gate_last_run.required} required passed`,
    actor: "proof-gate-runner",
    dataRoot,
    postPartyLine: postPartyLine ? (text) => postPartyLine(text) : null,
  });

  const result = {
    ok: requiredFailures.length === 0,
    version: PROOF_GATES_VERSION,
    created_at: new Date().toISOString(),
    route_id: route.route_id,
    current_route_path: progress.current_route_path,
    summary: {
      gates: gates.length,
      required: required.length,
      passed_required: route.proof_gate_last_run.passed_required,
      failed_required: route.proof_gate_last_run.failed_required,
    },
    results,
    failures: requiredFailures,
    progress: {
      macro_id: progress.macro_id,
      previous_status: progress.previous_status,
      status: progress.status,
      current_macro: progress.projection?.current_macro || null,
    },
    receipt_path: null,
  };

  if (writeReceipt) result.receipt_path = await writeProofGateReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const write = process.argv.includes("--receipt");
  const out = await runCurrentRouteProofGates({ writeReceipt: write });
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed_required}/${out.summary.required} required proof gates`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.id}`);
  }
  if (!out.ok) process.exit(4);
}
