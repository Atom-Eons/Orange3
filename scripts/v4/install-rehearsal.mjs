#!/usr/bin/env node
/* install-rehearsal.mjs - clean Basic Install rehearsal.
 *
 * This proves the buyer-default path with a brand-new data root:
 * start ORANGEBOX, confirm first-run is incomplete, force Basic Install,
 * save a minimal operator profile, complete first-run, verify AE See-Suite
 * remains local-useful, and capture the Basic/Advanced first-run proof.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runFirstRunVisualProof } from "./first-run-visual-proof.mjs";
import { runInstallClarityDoctor } from "./install-clarity-doctor.mjs";

export const INSTALL_REHEARSAL_VERSION = "orangebox-install-rehearsal/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const ARTIFACTS_DIR = path.join(ROOT, "artifacts", "install-rehearsals");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function compact(value, max = 1400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeInstallRehearsalReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-install-rehearsal-${stampForFile()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function fileMeta(file) {
  try {
    const stat = fsSync.statSync(file);
    return {
      path: file,
      exists: true,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
}

function summarizeRehearsal(result, source = {}) {
  if (!result || typeof result !== "object") return null;
  const screenshots = [];
  for (const check of Array.isArray(result.checks) ? result.checks : []) {
    if (check.id === "first_run_visual_proof_passes_on_clean_runtime" && Array.isArray(check.screenshots)) {
      screenshots.push(...check.screenshots.map((shot) => ({
        name: shot.name || null,
        path: shot.path || null,
        exists: shot.exists !== false,
        bytes: shot.bytes || 0,
      })));
    }
  }
  return {
    ok: result.ok === true,
    version: result.version || INSTALL_REHEARSAL_VERSION,
    project: result.project || "ORANGEBOX",
    created_at: result.created_at || null,
    started_at: result.started_at || null,
    id: result.id || null,
    artifact_root: result.artifact_root || null,
    data_root: result.data_root || null,
    proof_dir: result.proof_dir || null,
    state_path: result.state_path || source.state_path || null,
    receipt_path: result.receipt_path || source.receipt_path || null,
    summary: result.summary || { checks: 0, passed: 0, failed: result.ok ? 0 : 1, warnings: 0 },
    product_language: result.product_language || {
      top_surface: "AE See-Suite",
      operations_surface: "AE Operations",
      install_path: "Basic Install",
      advanced_path: "Advanced AI Box",
    },
    rehearsal_contract: result.rehearsal_contract || {
      brand_new_data_root: true,
      api_key_required: false,
      remote_ai_box_required: false,
      admin_networking_required: false,
    },
    screenshots,
    failures: Array.isArray(result.failures) ? result.failures : [],
    source,
  };
}

async function latestArtifactRehearsals(limit = 12) {
  const rows = [];
  let entries = [];
  try {
    entries = await fs.readdir(ARTIFACTS_DIR, { withFileTypes: true });
  } catch {
    return rows;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const artifactRoot = path.join(ARTIFACTS_DIR, entry.name);
    const statePath = path.join(artifactRoot, "state.json");
    if (!fsSync.existsSync(statePath)) continue;
    const meta = fileMeta(statePath);
    const state = await readJsonFile(statePath);
    const summary = summarizeRehearsal(state, {
      kind: "artifact_state",
      artifact_root: artifactRoot,
      state_path: statePath,
      modified_at: meta.modified_at,
      bytes: meta.bytes,
    });
    if (summary) rows.push({ ...summary, sort_time: Date.parse(meta.modified_at || summary.created_at || summary.started_at || 0) || 0 });
  }
  rows.sort((a, b) => b.sort_time - a.sort_time);
  return rows.slice(0, limit).map(({ sort_time, ...row }) => row);
}

async function latestReceiptRehearsals(limit = 12) {
  const rows = [];
  let entries = [];
  try {
    entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true });
  } catch {
    return rows;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/^orangebox-install-rehearsal-.*\.json$/i.test(entry.name)) continue;
    const receiptPath = path.join(RECEIPTS_DIR, entry.name);
    const meta = fileMeta(receiptPath);
    const receipt = await readJsonFile(receiptPath);
    const summary = summarizeRehearsal(receipt, {
      kind: "receipt",
      receipt_path: receiptPath,
      modified_at: meta.modified_at,
      bytes: meta.bytes,
    });
    if (summary) rows.push({ ...summary, sort_time: Date.parse(meta.modified_at || summary.created_at || summary.started_at || 0) || 0 });
  }
  rows.sort((a, b) => b.sort_time - a.sort_time);
  return rows.slice(0, limit).map(({ sort_time, ...row }) => row);
}

export async function getLatestInstallRehearsal({ limit = 6 } = {}) {
  const artifactRuns = await latestArtifactRehearsals(limit);
  const receiptRuns = await latestReceiptRehearsals(limit);
  const all = [...artifactRuns, ...receiptRuns]
    .sort((a, b) => Date.parse(b.source?.modified_at || b.created_at || b.started_at || 0) - Date.parse(a.source?.modified_at || a.created_at || a.started_at || 0));
  const latest = all[0] || null;
  return {
    ok: latest ? latest.ok : false,
    version: `${INSTALL_REHEARSAL_VERSION}.latest`,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    found: !!latest,
    latest,
    artifact_runs: artifactRuns,
    receipt_runs: receiptRuns,
    summary: latest?.summary || { checks: 0, passed: 0, failed: latest ? 1 : 0, warnings: latest ? 0 : 1 },
    recovery_action: latest
      ? latest.ok
        ? "Latest persisted clean Basic Install rehearsal is available. Run Rehearsal only when you need fresh proof."
        : "Latest clean Basic Install rehearsal needs review. Rerun Rehearsal with receipt after fixing the failed check."
      : "No persisted clean Basic Install rehearsal was found. Run obx install rehearsal --receipt.",
  };
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

function requestJson(baseUrl, endpoint, { method = "GET", body = null, timeoutMs = 10000 } = {}) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, baseUrl);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(url, {
      method,
      headers: payload ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      } : {},
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: JSON.parse(data || "{}"),
          });
        } catch (err) {
          resolve({
            ok: false,
            status: res.statusCode,
            error: `invalid JSON: ${err.message}`,
            raw: compact(data),
          });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err?.message || String(err) }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function startRehearsalServer({ id, artifactRoot, dataRoot }) {
  const port = await freePort();
  const tunnelPort = await freePort();
  await fs.mkdir(dataRoot, { recursive: true });
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
      ORANGEBOX_AI_BOX_IP: "",
      ORANGEBOX_AI_BOX_CLOUD_URL: "",
      ORANGEBOX_CODEXA_IP: "",
      ORANGEBOX_CODEXA_CLOUD_URL: "",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    const probe = await requestJson(baseUrl, "/api/status?fast=1", { timeoutMs: 2000 });
    if (probe.ok) {
      return {
        id,
        artifactRoot,
        dataRoot,
        baseUrl,
        port,
        tunnelPort,
        pid: child.pid,
        output: () => ({ stdout_tail: compact(stdout, 1800), stderr_tail: compact(stderr, 1800) }),
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 450));
        },
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!child.killed) child.kill();
  throw new Error(`clean install rehearsal server did not start on ${baseUrl}: ${compact(stderr || stdout)}`);
}

function pass(id, evidence = {}) {
  return { id, ok: true, ...evidence };
}

function fail(id, evidence = {}) {
  return { id, ok: false, ...evidence };
}

async function writeArtifactState(artifactRoot, state) {
  await fs.mkdir(artifactRoot, { recursive: true });
  const file = path.join(artifactRoot, "state.json");
  await fs.writeFile(file, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return file;
}

export async function runInstallRehearsal({
  writeReceipt = false,
  keepDataRoot = true,
} = {}) {
  const startedAt = new Date().toISOString();
  const id = `${safeStamp()}-basic-install-rehearsal`;
  const artifactRoot = path.join(ARTIFACTS_DIR, id);
  const dataRoot = path.join(artifactRoot, "data-root");
  const proofDir = path.join(artifactRoot, "proof");
  const checks = [];
  let runtime = null;
  try {
    await fs.mkdir(proofDir, { recursive: true });
    runtime = await startRehearsalServer({ id, artifactRoot, dataRoot });

    const initialFirstRun = await requestJson(runtime.baseUrl, "/api/first-run/status");
    checks.push(initialFirstRun.ok && initialFirstRun.body?.completed === false && initialFirstRun.body?.hasProfile === false
      ? pass("fresh_data_root_starts_uncompleted", { status: initialFirstRun.status, body: initialFirstRun.body })
      : fail("fresh_data_root_starts_uncompleted", { status: initialFirstRun.status, body: initialFirstRun.body, error: initialFirstRun.error }));

    const initialMode = await requestJson(runtime.baseUrl, "/api/ai-box/mode");
    checks.push(initialMode.ok && initialMode.body?.mode === "local"
      ? pass("basic_install_is_default_mode", { status: initialMode.status, body: initialMode.body })
      : fail("basic_install_is_default_mode", { status: initialMode.status, body: initialMode.body, error: initialMode.error }));

    const setMode = await requestJson(runtime.baseUrl, "/api/ai-box/mode", { method: "POST", body: { mode: "local" } });
    const modeAfterSet = await requestJson(runtime.baseUrl, "/api/ai-box/mode");
    checks.push(setMode.ok && setMode.body?.status === "VERIFIED" && modeAfterSet.ok && modeAfterSet.body?.mode === "local"
      ? pass("basic_mode_save_and_readback", { set_status: setMode.status, readback_status: modeAfterSet.status, body: modeAfterSet.body })
      : fail("basic_mode_save_and_readback", { set_response: setMode, readback_response: modeAfterSet }));

    const profileBody = {
      craft: "builder",
      projectName: "orangebox-basic-rehearsal",
      goal: "Verify Basic Install works on one computer without an AI Box.",
    };
    const profile = await requestJson(runtime.baseUrl, "/api/first-run/profile", { method: "POST", body: profileBody });
    checks.push(profile.ok && profile.body?.status === "VERIFIED"
      ? pass("operator_profile_saves", { status: profile.status, body: profile.body })
      : fail("operator_profile_saves", { status: profile.status, body: profile.body, error: profile.error }));

    const complete = await requestJson(runtime.baseUrl, "/api/first-run/complete", { method: "POST" });
    const finalFirstRun = await requestJson(runtime.baseUrl, "/api/first-run/status");
    checks.push(complete.ok && complete.body?.status === "VERIFIED" && finalFirstRun.ok && finalFirstRun.body?.completed === true && finalFirstRun.body?.hasProfile === true
      ? pass("first_run_completes_without_api_key_or_ai_box", { complete_status: complete.status, final_status: finalFirstRun.status, body: finalFirstRun.body })
      : fail("first_run_completes_without_api_key_or_ai_box", { complete_response: complete, final_response: finalFirstRun }));

    const seeSuite = await requestJson(runtime.baseUrl, "/api/v4/see-suite/status");
    const aiBox = seeSuite.body?.aiBox || {};
    checks.push(seeSuite.ok && (aiBox.optional === true || aiBox.recoverable === true || aiBox.ok === null) && /basic/i.test(String(aiBox.label || aiBox.status || ""))
      ? pass("ae_see_suite_reports_basic_recoverable_ai_box_state", { status: seeSuite.status, aiBox })
      : fail("ae_see_suite_reports_basic_recoverable_ai_box_state", { status: seeSuite.status, body: seeSuite.body, error: seeSuite.error }));

    const installDoctor = await runInstallClarityDoctor({
      writeReceipt: false,
      startServer: false,
      baseUrl: runtime.baseUrl,
    });
    checks.push(installDoctor.ok
      ? pass("install_clarity_doctor_passes_on_clean_runtime", { summary: installDoctor.summary })
      : fail("install_clarity_doctor_passes_on_clean_runtime", { summary: installDoctor.summary, failures: installDoctor.failures }));

    const visualProof = await runFirstRunVisualProof({
      writeReceipt: false,
      startServer: false,
      baseUrl: runtime.baseUrl,
      proofDir,
    });
    checks.push(visualProof.ok
      ? pass("first_run_visual_proof_passes_on_clean_runtime", { summary: visualProof.summary, screenshots: visualProof.screenshots })
      : fail("first_run_visual_proof_passes_on_clean_runtime", { summary: visualProof.summary, failures: visualProof.failures }));

    const files = [
      path.join(dataRoot, "operator-profile.json"),
      path.join(dataRoot, "first-run-complete"),
      path.join(dataRoot, "codexa-mode.json"),
    ].map((file) => ({
      path: file,
      exists: fsSync.existsSync(file),
      bytes: fsSync.existsSync(file) ? fsSync.statSync(file).size : 0,
    }));
    checks.push(files.every((item) => item.exists)
      ? pass("basic_rehearsal_writes_expected_local_state", { files })
      : fail("basic_rehearsal_writes_expected_local_state", { files }));

    const failures = checks.filter((check) => !check.ok);
    const stateForHash = {
      id,
      dataRoot,
      checks: checks.map((check) => ({ id: check.id, ok: check.ok })),
    };
    const result = {
      ok: failures.length === 0,
      version: INSTALL_REHEARSAL_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      id,
      artifact_root: artifactRoot,
      data_root: dataRoot,
      proof_dir: proofDir,
      keep_data_root: keepDataRoot,
      base_url: runtime.baseUrl,
      product_language: {
        top_surface: "AE See-Suite",
        operations_surface: "AE Operations",
        install_path: "Basic Install",
        advanced_path: "Advanced AI Box",
      },
      rehearsal_contract: {
        brand_new_data_root: true,
        api_key_required: false,
        remote_ai_box_required: false,
        admin_networking_required: false,
      },
      checks,
      failures,
      summary: {
        checks: checks.length,
        passed: checks.filter((check) => check.ok).length,
        failed: failures.length,
        warnings: 0,
      },
      runtime_output: runtime.output(),
      state_sha256: sha256Text(JSON.stringify(stateForHash)),
      state_path: null,
      receipt_path: null,
    };
    result.state_path = await writeArtifactState(artifactRoot, result);
    if (writeReceipt) result.receipt_path = await writeInstallRehearsalReceipt(result);
    return result;
  } catch (err) {
    const result = {
      ok: false,
      version: INSTALL_REHEARSAL_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      id,
      artifact_root: artifactRoot,
      data_root: dataRoot,
      proof_dir: proofDir,
      error: err?.message || String(err),
      stack: err?.stack ? compact(err.stack, 2400) : null,
      checks,
      failures: [{ id: "exception", ok: false, error: err?.message || String(err) }],
      summary: { checks: Math.max(1, checks.length), passed: checks.filter((check) => check.ok).length, failed: 1, warnings: 0 },
      runtime_output: runtime?.output?.() || {},
      state_path: null,
      receipt_path: null,
    };
    result.state_path = await writeArtifactState(artifactRoot, result).catch(() => null);
    if (writeReceipt) result.receipt_path = await writeInstallRehearsalReceipt(result);
    return result;
  } finally {
    if (runtime) await runtime.stop();
    if (!keepDataRoot) await fs.rm(dataRoot, { recursive: true, force: true }).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runInstallRehearsal({
    writeReceipt: argv.includes("--receipt"),
    keepDataRoot: !argv.includes("--clean-temp"),
  });
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ORANGEBOX clean Basic Install rehearsal ${out.summary.passed}/${out.summary.checks}`);
    console.log(`artifact: ${out.artifact_root}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures || []) console.log(`failure: ${failure.id} ${failure.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
