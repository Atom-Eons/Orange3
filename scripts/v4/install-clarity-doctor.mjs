#!/usr/bin/env node
/* install-clarity-doctor.mjs - Basic vs Advanced setup proof.
 *
 * This doctor keeps ORANGEBOX honest for normal buyers:
 * - Basic Install is the safe one-machine default.
 * - Advanced AI Box is optional and explicitly routed through AE Operations.
 * - AI Box recovery never blocks the local product.
 * - Network/storage upgrade lanes are documented as detected capabilities,
 *   not silent actions.
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

export const INSTALL_CLARITY_DOCTOR_VERSION = "orangebox-install-clarity-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");
const SHIP_MANIFEST = path.resolve(ROOT, "..", "ship", "orangebox-v6.3.0-alpha.7-portable.zip.manifest.json");

const REQUIRED_PACKAGE_ENTRIES = [
  "INSTALL-FIRST.txt",
  "0-START-HERE.txt",
  "docs/AI_BOX_WORKER_RAIL.md",
  "docs/AI_COMPUTER_BUYING_GUIDE.md",
  "docs/AI_BOX_NETWORK_PRIORITY.md",
];

const SOURCE_EXPECTATIONS = [
  {
    id: "first_run_asks_ai_computer_question",
    file: "src/first-run.js",
    required: [
      /Do you have an AI computer to set up\?/i,
      /Most people should pick No/i,
    ],
  },
  {
    id: "first_run_basic_is_default",
    file: "src/first-run.js",
    required: [
      /No - Basic install/i,
      /one computer/i,
      /No second box, no network setup, no admin networking prompts/i,
    ],
  },
  {
    id: "first_run_advanced_is_optional",
    file: "src/first-run.js",
    required: [
      /Yes - Advanced AI Box/i,
      /controller/i,
      /second AI computer/i,
      /Thunderbolt or Ethereal Ethernet/i,
    ],
  },
  {
    id: "first_run_buying_help_exists",
    file: "src/first-run.js",
    required: [
      /What is an AI computer and where can I buy one\?/i,
      /mini PCs, creator PCs, gaming PCs, or workstations/i,
      /AE See-Suite does not require one/i,
    ],
  },
  {
    id: "install_first_names_basic_and_advanced",
    file: "INSTALL-FIRST.txt",
    required: [
      /Basic Install/i,
      /Advanced AI Box/i,
      /optional/i,
    ],
  },
  {
    id: "start_here_names_basic_and_advanced",
    file: "0-START-HERE.txt",
    required: [
      /Basic Install/i,
      /Advanced AI Box/i,
      /AI computer/i,
    ],
  },
  {
    id: "worker_rail_has_default_and_recovery",
    file: "docs/AI_BOX_WORKER_RAIL.md",
    required: [
      /Basic Install \(default - one computer\)/i,
      /Pick \*\*No - Basic install\*\*/i,
      /Pick \*\*Yes - Advanced AI Box\*\*/i,
      /Switch AE Operations back to Basic Install/i,
      /Basic Install is always the fallback/i,
    ],
  },
  {
    id: "buying_guide_answers_purchase_question",
    file: "docs/AI_COMPUTER_BUYING_GUIDE.md",
    required: [
      /What Is an AI Computer\?/i,
      /What to Buy/i,
      /You can buy one from/i,
      /If you are unsure, start with \*\*Basic Install\*\*/i,
    ],
  },
  {
    id: "network_priority_is_upgrade_ready_not_silent",
    file: "docs/AI_BOX_NETWORK_PRIORITY.md",
    required: [
      /Basic Install/i,
      /Advanced AI Box/i,
      /no default gateway/i,
      /socket\.sendfile\(\)/i,
      /RDMA\/RoCE and NVMe-oF are included as \*\*advanced capability lanes\*\*, not default actions/i,
    ],
  },
  {
    id: "cli_exposes_install_and_network_doctors",
    file: "scripts/obx.mjs",
    required: [
      /obx install doctor/i,
      /obx network doctor/i,
      /obx network ethereal doctor/i,
    ],
  },
];

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function compact(value, max = 900) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeInstallClarityReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-install-clarity-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
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
      stack: err?.stack ? compact(err.stack, 1600) : null,
    };
  }
}

async function sourceClarityGate() {
  const checks = [];
  const failures = [];
  for (const expectation of SOURCE_EXPECTATIONS) {
    const file = path.join(ROOT, expectation.file);
    if (!fsSync.existsSync(file)) {
      const row = {
        id: expectation.id,
        file,
        ok: false,
        missing_file: true,
        missing_patterns: expectation.required.map((pattern) => pattern.source),
      };
      checks.push(row);
      failures.push(row);
      continue;
    }
    const text = await fs.readFile(file, "utf8");
    const missing = expectation.required.filter((pattern) => !pattern.test(text)).map((pattern) => pattern.source);
    const row = {
      id: expectation.id,
      file,
      ok: missing.length === 0,
      sha256: sha256Text(text),
      missing_patterns: missing,
    };
    checks.push(row);
    if (!row.ok) failures.push(row);
  }
  return {
    ok: failures.length === 0,
    checked: checks.length,
    passed: checks.filter((check) => check.ok).length,
    failed: failures.length,
    checks,
    failures,
  };
}

function requestJson(baseUrl, endpoint, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.path, baseUrl);
    const body = endpoint.body ? JSON.stringify(endpoint.body) : null;
    const req = http.request(url, {
      method: endpoint.method,
      headers: body ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
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
    if (body) req.write(body);
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

async function startTemporaryServer() {
  const port = await freePort();
  const tunnelPort = await freePort();
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-install-clarity-data-"));
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
    const probe = await requestJson(baseUrl, { id: "startup", method: "GET", path: "/api/status?fast=1" }, 2000);
    if (probe.ok) {
      return {
        baseUrl,
        dataRoot,
        started: true,
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 500));
        },
        output: () => ({ stdout_tail: compact(stdout, 1600), stderr_tail: compact(stderr, 1600) }),
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!child.killed) child.kill();
  throw new Error(`temporary ORANGEBOX server did not become ready on ${baseUrl}: ${compact(stderr || stdout, 1200)}`);
}

function validateRuntimeEndpoint(endpoint, response) {
  if (!response.ok) return { ok: false, error: response.error || `HTTP ${response.status}` };
  const body = response.body || {};
  if (endpoint.id === "first_run_status") {
    return { ok: typeof body.completed === "boolean" && typeof body.status === "string" };
  }
  if (endpoint.id === "ai_box_mode") {
    return { ok: ["local", "remote"].includes(body.mode), mode: body.mode, remote_ai_box_required: body.mode === "remote" };
  }
  if (endpoint.id === "ai_box_network_doctor") {
    return {
      ok: /ai-box-network-priority/i.test(String(body.version || "")),
      doctor_ok: body.ok === true,
      status: body.status || null,
      active_route: body.active_route || null,
      note: "Remote AI Box availability is evidence, not a prerequisite for Basic Install.",
    };
  }
  if (endpoint.id === "ethereal_doctor") {
    return {
      ok: /ethereal/i.test(String(body.version || body.status || "")),
      doctor_ok: body.ok === true,
      status: body.status || null,
      active_route: body.active_route || null,
    };
  }
  if (endpoint.id === "setup_wizard") {
    return {
      ok: Array.isArray(body.actions) && typeof body.primary_path === "string",
      ready: body.ready === true,
      primary_path: body.primary_path || null,
    };
  }
  return { ok: true };
}

async function runtimeClarityGate({ baseUrl = null, startServer = true } = {}) {
  const requestedBaseUrl = baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`;
  let runtime = {
    baseUrl: requestedBaseUrl,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  const startup = await requestJson(requestedBaseUrl, { id: "startup", method: "GET", path: "/api/status?fast=1" }, 3000);
  if (!startup.ok) {
    if (!startServer) {
      return { ok: false, base_url: requestedBaseUrl, error: startup.error || `HTTP ${startup.status}` };
    }
    runtime = await startTemporaryServer();
  }

  const endpoints = [
    { id: "first_run_status", method: "GET", path: "/api/first-run/status", required: true, timeout_ms: 5000 },
    { id: "ai_box_mode", method: "GET", path: "/api/ai-box/mode", legacy_path: "/api/codexa/mode", required: true, timeout_ms: 5000 },
    { id: "ai_box_network_doctor", method: "GET", path: "/api/v4/ai-box-network/doctor", required: true, timeout_ms: 12000 },
    { id: "ethereal_doctor", method: "GET", path: "/api/v4/ai-box-network/ethereal/doctor", required: false, timeout_ms: 12000 },
    { id: "setup_wizard", method: "GET", path: "/api/v4/setup/wizard", required: false, timeout_ms: 22000 },
  ];
  const results = [];
  try {
    for (const endpoint of endpoints) {
      let response = await requestJson(runtime.baseUrl, endpoint, endpoint.timeout_ms);
      let actualPath = endpoint.path;
      if (!response.ok && endpoint.legacy_path) {
        response = await requestJson(runtime.baseUrl, { ...endpoint, path: endpoint.legacy_path }, endpoint.timeout_ms);
        actualPath = endpoint.legacy_path;
      }
      const validation = validateRuntimeEndpoint(endpoint, response);
      results.push({
        id: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        actual_path: actualPath,
        required: endpoint.required,
        ok: response.ok && validation.ok,
        status: response.status,
        error: response.error || validation.error || null,
        validation,
        response_keys: response.body && typeof response.body === "object" ? Object.keys(response.body).sort() : [],
      });
    }
  } finally {
    await runtime.stop();
  }
  const requiredFailures = results.filter((result) => result.required && !result.ok);
  return {
    ok: requiredFailures.length === 0,
    base_url: runtime.baseUrl,
    started_temporary_server: runtime.started,
    remote_ai_box_required: false,
    results,
    required_failures: requiredFailures,
    warnings: results.filter((result) => !result.required && !result.ok),
    runtime_output: runtime.output(),
  };
}

function parseZipEntries(buffer) {
  const entries = [];
  const min = Math.max(0, buffer.length - 66000);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip EOCD not found");
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < total; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`bad central directory signature at ${offset}`);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8").replace(/\\/g, "/");
    entries.push(name);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function packageClarityGate() {
  if (!fsSync.existsSync(SHIP_MANIFEST)) {
    return {
      ok: true,
      status: "skipped",
      manifest_path: SHIP_MANIFEST,
      note: "Portable package manifest not found yet; the package gate verifies the build artifact.",
    };
  }
  const manifest = JSON.parse(await fs.readFile(SHIP_MANIFEST, "utf8"));
  const zipPath = manifest.zip_path || manifest.zip || path.resolve(path.dirname(SHIP_MANIFEST), "orangebox-v6.3.0-alpha.7-portable.zip");
  if (!fsSync.existsSync(zipPath)) return { ok: false, manifest_path: SHIP_MANIFEST, zip_path: zipPath, error: "zip not found" };
  const entries = parseZipEntries(await fs.readFile(zipPath));
  const present = new Set(entries);
  const missing = REQUIRED_PACKAGE_ENTRIES.filter((entry) => !present.has(entry));
  return {
    ok: missing.length === 0,
    manifest_path: SHIP_MANIFEST,
    zip_path: zipPath,
    zip_sha256: manifest.zip_sha256 || manifest.sha256 || manifest.hashes?.zip || null,
    required_entries: REQUIRED_PACKAGE_ENTRIES,
    missing_entries: missing,
    entry_count: entries.length,
  };
}

export async function runInstallClarityDoctor({
  writeReceipt = false,
  startServer = true,
  baseUrl = null,
} = {}) {
  const checks = [];
  checks.push(await gate("source_basic_advanced_install_clarity", sourceClarityGate));
  checks.push(await gate("runtime_basic_does_not_require_ai_box", () => runtimeClarityGate({ baseUrl, startServer })));
  checks.push(await gate("portable_package_install_docs", packageClarityGate, { required: false }));
  const failures = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    version: INSTALL_CLARITY_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    project: "ORANGEBOX",
    product_language: {
      top_surface: "AE See-Suite",
      operations_surface: "AE Operations",
      basic_path: "Basic Install",
      advanced_path: "Advanced AI Box",
      ai_worker_surface: "optional AI Box",
    },
    install_contract: {
      basic_default: true,
      advanced_optional: true,
      remote_ai_box_required_for_basic: false,
      recovery_rule: "Basic Install is always the fallback; AE See-Suite must remain useful even when the AI computer is offline.",
    },
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: warnings.length,
    },
    checks,
    failures,
    warnings,
    receipt_path: null,
  };
  if (writeReceipt) result.receipt_path = await writeInstallClarityReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runInstallClarityDoctor({
    writeReceipt: argv.includes("--receipt"),
    startServer: !argv.includes("--no-start-server"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || null,
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} install-clarity checks`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
