#!/usr/bin/env node
/* ae-operations-visual-proof.mjs - screenshot proof for AE Operations.
 *
 * This is the operations-facing visual gate. It proves the formerly generic
 * settings lane renders as AE Operations with setup, model lane, privacy,
 * recovery, Advanced AI Box, Hermes, and release-proof copy intact.
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

export const AE_OPERATIONS_VISUAL_PROOF_VERSION = "orangebox-ae-operations-visual-proof/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");

const REQUIRED_DOM_TEXT = [
  /ORANGEBOX - AE Operations/i,
  /<h1>\s*AE Operations\s*<\/h1>/i,
  /Setup, model lanes, privacy, recovery, Advanced AI Box, and release proof\./i,
  /Running Brain/i,
  /Choose what runs ORANGEBOX thinking\./i,
  /Switch GPT, Opus, Grok, Gemini, or Grok Superheavy as the active model lane\./i,
  /GPT \/ Codex/i,
  /Opus \/ Claude Code/i,
  /Grok Superheavy/i,
  /No model calls are made by this switch\.|Status and selection make no paid API\/model call\.|no model call made/i,
  /Run Model Doctor/i,
  /Default opening surface/i,
  /Operator Brief/i,
  /Use Today/i,
  /Next Safe Move/i,
  /Creation Surface/i,
  /AE See-Suite/i,
  /See-Suite Proof/i,
  /Silent Canvas Proof/i,
  /Mutation replay events must be linked to receipts/i,
  /API keys/i,
  /Privacy/i,
  /Air-gap mode/i,
  /Finish-Line Proof/i,
  /Release Decision/i,
  /Final Green Board/i,
  /Action Queue/i,
  /Safe Next Move/i,
  /Screenshots/i,
  /Release Proof Ledger/i,
  /Board status/i,
  /Service reload/i,
  /Ethereal truth/i,
  /Safe rerun/i,
  /Share State/i,
  /Required Action/i,
  /Rollback/i,
  /Run Board/i,
  /Clean Install/i,
  /Clean Install Rehearsal passed|Clean Install Rehearsal blocked|Clean Install Rehearsal not checked/i,
  /Processes/i,
  /Service Freshness/i,
  /Service freshness clear|Service restart needed|Service unavailable|Service freshness review|Service freshness not checked/i,
  /Source route proof appears here|Source route installed; live sidecar needs reload|Live sidecar and current source routes agree/i,
  /Reopen ORANGEBOX to reload routes/i,
  /No delete, no network change, no admin action/i,
  /Product Language/i,
  /Product language clean|Product language blocked|Product language not checked/i,
  /API Drift/i,
  /Repair \/ Recovery/i,
  /Safe Repair Guide/i,
  /No process kill, network mutation, uninstall, or data deletion happens from this board/i,
  /Recovery Guide/i,
  /Basic Install Repair/i,
  /Advanced AI Computer Reset/i,
  /Package, Repair, and Uninstall/i,
  /AI Computer Setup/i,
  /Do you have an AI computer to set up\?/i,
  /Basic status/i,
  /Advanced status/i,
  /This setup guide is read-only/i,
  /Ethereal (?:watch(?: ready| clear)?|needs review|doctor history only|pack ready|pack not generated)/i,
  /Advanced AI Computer Link/i,
  /Basic protected/i,
  /Fabric claims/i,
  /Direct-link doctor is usable|Direct-link doctor has no active warnings|Run Network Doctor to translate direct-link warnings|Network Doctor found \d+ blocker|Approval-gated direct-link files are present/i,
  /No live network mutation happens here|No live network changes are applied from this screen|No live network changes from this screen|generated packs must be applied explicitly|approval-gated and reversible/i,
  /Hermes Agent/i,
  /Reference Library/i,
  /Product moat reference/i,
  /Model research notes/i,
  /ORANGEBOX v6\.3\.0-alpha\.7 - AE Operations/i,
];

const FORBIDDEN_DOM_TEXT = [
  /<title>ORANGEBOX[^<]*Settings<\/title>/i,
  /<h1>\s*Settings\s*<\/h1>/i,
  /Settings[^A-Za-z0-9]{0,16}Hermes Agent/i,
  /A unified Settings lane ships/i,
  />\s*Cockpit\s*</i,
  /BLUEB0X/i,
  />\s*Codexa\s*</i,
  /v2 McLaren HUD/i,
  /v1\.4 classic/i,
  /v5 \(default\)/i,
  /Startup surface/i,
  /V4 Moat Doctrine/i,
  /â|Â|Ã|�/,
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
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-ae-operations-data-"));
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
  return resolveChromiumExecutable("AE Operations visual proof");
}

async function captureShot(browser, url, shot, profileBase, options = {}) {
  return captureChromiumShot(browser, url, shot, profileBase, { cwd: ROOT, timeoutMs: 45000, ...options });
}

async function dumpDom(browser, url, profile) {
  const dom = await dumpChromiumDom(browser, url, profile, { cwd: ROOT });
  return dom || requestTextUrl(url, 10000);
}

async function writeAeOperationsVisualReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-ae-operations-visual-proof-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runAeOperationsVisualProof({
  writeReceipt = false,
  startServer = true,
  baseUrl = null,
  forceTempServer = false,
  keepTemp = false,
  proofDir = PROOF_DIR,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  const id = `${safeStamp()}-ae-operations-lane`;
  const desktop = path.join(proofDir, `${id}-desktop.png`);
  const compactShot = path.join(proofDir, `${id}-compact.png`);
  const etherealShot = path.join(proofDir, `${id}-ethereal.png`);
  let runtime = {
    baseUrl: baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  const startedAt = new Date().toISOString();
  try {
    if (forceTempServer) {
      runtime = await startTemporaryServer();
    } else {
      const probe = await requestJson(runtime.baseUrl, "/api/status?fast=1", 3000);
      if (!probe.ok) {
        if (!startServer) throw new Error(probe.error || `ORANGEBOX server unavailable at ${runtime.baseUrl}`);
        runtime = await startTemporaryServer();
      }
    }
    const browser = await chromiumExecutable();
    const url = `${runtime.baseUrl}/v4/onboarding/settings.html`;
    const profileBase = path.join(os.tmpdir(), `orangebox-ae-operations-proof-${id}`);
    const initialDom = await dumpDom(browser, url, `${profileBase}-dom`);
    const desktopResult = await captureShot(browser, url, { name: "desktop", width: 1440, height: 1000, path: desktop }, profileBase);
    const compactResult = await captureShot(browser, url, { name: "compact", width: 390, height: 920, path: compactShot }, profileBase);
    const etherealResult = await captureShot(
      browser,
      url,
      { name: "ethereal", width: 1440, height: 3800, path: etherealShot },
      profileBase,
      { timeoutMs: 90000 },
    );
    const finalDom = await dumpDom(browser, url, `${profileBase}-dom-final`);
    const dom = `${initialDom}\n${finalDom}`;
    if (!keepTemp) {
      await fs.rm(`${profileBase}-dom`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-dom-final`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-desktop`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-compact`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-ethereal`, { recursive: true, force: true }).catch(() => {});
    }
    const missingText = REQUIRED_DOM_TEXT.filter((pattern) => !pattern.test(dom)).map((pattern) => pattern.source);
    const forbiddenTextHits = FORBIDDEN_DOM_TEXT.filter((pattern) => pattern.test(dom)).map((pattern) => pattern.source);
    const screenshots = [desktopResult, compactResult, etherealResult];
    const failures = [
      ...missingText.map((pattern) => ({ type: "missing_dom_text", pattern })),
      ...forbiddenTextHits.map((pattern) => ({ type: "forbidden_dom_text", pattern })),
      ...screenshots.filter((shot) => !shot.ok).map((shot) => ({ type: "screenshot", shot: shot.name, path: shot.path, bytes: shot.bytes })),
    ];
    const result = {
      ok: failures.length === 0,
      version: AE_OPERATIONS_VISUAL_PROOF_VERSION,
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
      },
      proof_contract: {
        operations_h1_present: !missingText.includes("<h1>\\s*AE Operations\\s*<\\/h1>"),
        settings_surface_copy_absent: forbiddenTextHits.length === 0,
        remote_ai_box_required: false,
      },
      screenshots,
      dom: {
        sha256: sha256Text(dom),
        bytes: Buffer.byteLength(dom, "utf8"),
        missing_required_text: missingText,
        forbidden_text_hits: forbiddenTextHits,
      },
      runtime_output: runtime.output(),
      failures,
      summary: {
        checks: 5,
        passed: failures.length === 0 ? 5 : Math.max(0, 5 - failures.length),
        failed: failures.length,
        warnings: 0,
      },
      receipt_path: null,
    };
    if (writeReceipt) result.receipt_path = await writeAeOperationsVisualReceipt(result);
    return result;
  } catch (err) {
    const result = {
      ok: false,
      version: AE_OPERATIONS_VISUAL_PROOF_VERSION,
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
    if (writeReceipt) result.receipt_path = await writeAeOperationsVisualReceipt(result);
    return result;
  } finally {
    await runtime.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runAeOperationsVisualProof({
    writeReceipt: argv.includes("--receipt"),
    startServer: !argv.includes("--no-start-server"),
    forceTempServer: argv.includes("--isolated") || argv.includes("--force-temp-server"),
    keepTemp: argv.includes("--keep-temp"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || null,
    proofDir: argv.find((arg) => arg.startsWith("--proof-dir="))?.slice("--proof-dir=".length) || PROOF_DIR,
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} AE Operations visual proof ${out.summary.passed}/${out.summary.checks}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures || []) console.log(`failure: ${failure.type} ${failure.message || failure.pattern || failure.path || ""}`);
  }
  if (!out.ok) process.exit(4);
}
