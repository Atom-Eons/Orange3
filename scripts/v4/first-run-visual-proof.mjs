#!/usr/bin/env node
/* first-run-visual-proof.mjs - screenshot proof for Basic vs Advanced setup.
 *
 * This is the installer-facing visual gate. It proves the first-run flow can
 * render the "Do you have an AI computer to set up?" choice without requiring
 * a second machine, Playwright, or any live AI-box connection.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  captureChromiumShot,
  chromiumExecutable as resolveChromiumExecutable,
  dumpChromiumDom,
} from "./chromium-proof-runner.mjs";

export const FIRST_RUN_VISUAL_PROOF_VERSION = "orangebox-first-run-visual-proof/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");

const REQUIRED_DOM_TEXT = [
  /Do you have an AI computer to set up\?/i,
  /Most people should pick No/i,
  /No - Basic install/i,
  /Run AE See-Suite on this one computer/i,
  /No second box, no network setup, no admin networking prompts/i,
  /Yes - Advanced AI Box/i,
  /controller and connect a second AI computer/i,
  /Thunderbolt or Ethereal Ethernet/i,
  /What is an AI computer and where can I buy one\?/i,
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function compact(value, max = 1200) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
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
          resolve({ ok: false, status: res.statusCode, error: `invalid JSON: ${err.message}`, raw: compact(data) });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err?.message || String(err) }));
    req.end();
  });
}

function requestTextUrl(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(url), { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode} while fetching ${url}: ${compact(data, 600)}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
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
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-first-run-data-"));
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
        started: true,
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 350));
        },
        output: () => ({ stdout_tail: compact(stdout, 1800), stderr_tail: compact(stderr, 1800) }),
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!child.killed) child.kill();
  throw new Error(`temporary ORANGEBOX server did not become ready on ${baseUrl}: ${compact(stderr || stdout)}`);
}

async function chromiumExecutable() {
  return resolveChromiumExecutable("first-run visual proof");
}

async function captureShot(browser, url, shot, profileBase) {
  const first = await captureChromiumShot(browser, url, shot, profileBase, { cwd: ROOT });
  if (first.ok) return first;
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const second = await captureChromiumShot(browser, url, shot, `${profileBase}-retry`, {
    cwd: ROOT,
    timeoutMs: 9000,
  });
  return {
    ...second,
    retry_attempted: true,
    first_attempt: {
      exists: first.exists,
      bytes: first.bytes,
      browser_exit_ok: first.browser_exit_ok,
      browser_error: first.browser_error,
    },
  };
}

async function dumpDom(browser, url, profile) {
  const dom = await dumpChromiumDom(browser, url, profile, { cwd: ROOT });
  return dom || requestTextUrl(url, 10000);
}

async function writeFirstRunVisualReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-first-run-visual-proof-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runFirstRunVisualProof({
  writeReceipt = false,
  startServer = true,
  baseUrl = null,
  keepTemp = false,
  proofDir = PROOF_DIR,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  const id = `${safeStamp()}-first-run-ai-box-choice`;
  const desktop = path.join(proofDir, `${id}-desktop.png`);
  const compactShot = path.join(proofDir, `${id}-compact.png`);
  let runtime = {
    baseUrl: baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  const startedAt = new Date().toISOString();
  try {
    const probe = await requestJson(runtime.baseUrl, "/api/status?fast=1", 3000);
    if (!probe.ok) {
      if (!startServer) throw new Error(probe.error || `ORANGEBOX server unavailable at ${runtime.baseUrl}`);
      runtime = await startTemporaryServer();
    }
    const browser = await chromiumExecutable();
    const url = `${runtime.baseUrl}/src/first-run.html?proofStep=ai-box-choice`;
    const profileBase = path.join(os.tmpdir(), `orangebox-first-run-proof-${id}`);
    const dom = await dumpDom(browser, url, `${profileBase}-dom`);
    const desktopResult = await captureShot(browser, url, { name: "desktop", width: 1440, height: 1000, path: desktop }, profileBase);
    const compactResult = await captureShot(browser, url, { name: "compact", width: 390, height: 920, path: compactShot }, profileBase);
    if (!keepTemp) {
      await fs.rm(`${profileBase}-dom`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-desktop`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-compact`, { recursive: true, force: true }).catch(() => {});
    }
    const missingText = REQUIRED_DOM_TEXT.filter((pattern) => !pattern.test(dom)).map((pattern) => pattern.source);
    const defaultBasicChecked = /name="aiBoxMode"[^>]+value="local"[^>]+checked/i.test(dom)
      || /value="local"[^>]+checked[^>]+name="aiBoxMode"/i.test(dom);
    const advancedUnchecked = /name="aiBoxMode"[^>]+value="remote"/i.test(dom)
      || /value="remote"[^>]+name="aiBoxMode"/i.test(dom);
    const screenshots = [desktopResult, compactResult];
    const failures = [
      ...missingText.map((pattern) => ({ type: "missing_dom_text", pattern })),
      ...(defaultBasicChecked ? [] : [{ type: "default_selection", message: "Basic Install radio is not checked by default in proof DOM." }]),
      ...(advancedUnchecked ? [] : [{ type: "advanced_option", message: "Advanced AI Box radio is not present in proof DOM." }]),
      ...screenshots.filter((shot) => !shot.ok).map((shot) => ({ type: "screenshot", shot: shot.name, path: shot.path, bytes: shot.bytes })),
    ];
    const result = {
      ok: failures.length === 0,
      version: FIRST_RUN_VISUAL_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      id,
      proof_dir: proofDir,
      base_url: runtime.baseUrl,
      url,
      browser,
      product_language: {
        top_surface: "AE See-Suite",
        operations_surface: "AE Operations",
        basic_path: "Basic Install",
        advanced_path: "Advanced AI Box",
      },
      proof_contract: {
        local_only_url_hook: true,
        basic_default_checked: defaultBasicChecked,
        advanced_present: advancedUnchecked,
        remote_ai_box_required: false,
      },
      screenshots,
      dom: {
        sha256: sha256Text(dom),
        bytes: Buffer.byteLength(dom, "utf8"),
        missing_required_text: missingText,
      },
      runtime_output: runtime.output(),
      failures,
      summary: {
        checks: 4,
        passed: failures.length === 0 ? 4 : Math.max(0, 4 - failures.length),
        failed: failures.length,
        warnings: 0,
      },
      receipt_path: null,
    };
    if (writeReceipt) result.receipt_path = await writeFirstRunVisualReceipt(result);
    return result;
  } catch (err) {
    const result = {
      ok: false,
      version: FIRST_RUN_VISUAL_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      proof_dir: proofDir,
      base_url: runtime.baseUrl,
      error: err?.message || String(err),
      stack: err?.stack ? compact(err.stack, 2000) : null,
      runtime_output: runtime.output(),
      failures: [{ type: "exception", message: err?.message || String(err) }],
      summary: { checks: 1, passed: 0, failed: 1, warnings: 0 },
      receipt_path: null,
    };
    if (writeReceipt) result.receipt_path = await writeFirstRunVisualReceipt(result);
    return result;
  } finally {
    await runtime.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runFirstRunVisualProof({
    writeReceipt: argv.includes("--receipt"),
    startServer: !argv.includes("--no-start-server"),
    keepTemp: argv.includes("--keep-temp"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || null,
    proofDir: argv.find((arg) => arg.startsWith("--proof-dir="))?.slice("--proof-dir=".length) || PROOF_DIR,
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} first-run visual proof ${out.summary.passed}/${out.summary.checks}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures || []) console.log(`failure: ${failure.type} ${failure.message || failure.pattern || failure.path || ""}`);
  }
  if (!out.ok) process.exit(4);
}
