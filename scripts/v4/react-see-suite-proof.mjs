#!/usr/bin/env node
/* react-see-suite-proof.mjs - ORANGEBOX-hosted React AE See-Suite proof gate. */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { chromiumExecutable } from "./chromium-proof-runner.mjs";

export const REACT_SEE_SUITE_PROOF_VERSION = "orangebox-react-see-suite-proof/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function compact(value, max = 1400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
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
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: JSON.parse(data || "{}"),
          });
        } catch (error) {
          resolve({ ok: false, status: res.statusCode, error: error.message, raw: compact(data) });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, status: 0, error: error.message }));
    req.end();
  });
}

function requestText(baseUrl, endpoint, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, baseUrl);
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: data,
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (error) => resolve({ ok: false, status: 0, error: error.message, text: "" }));
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
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-react-see-suite-data-"));
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
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const probe = await requestJson(baseUrl, "/api/status?fast=1", 2000);
    if (probe.ok) {
      return {
        baseUrl,
        started: true,
        dataRoot,
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 450));
        },
        output: () => ({ stdout_tail: compact(stdout), stderr_tail: compact(stderr) }),
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (!child.killed) child.kill();
  throw new Error(`temporary ORANGEBOX server did not become ready at ${baseUrl}: ${compact(stderr || stdout)}`);
}

async function runPaletteCommand(page, query, labelPattern) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(160);
  await page.keyboard.press("Control+K");
  const input = page.locator(".command-palette__search input");
  await input.waitFor({ state: "visible", timeout: 8000 });
  await input.fill(query);
  const command = page.locator(".command-palette__list button").filter({ hasText: labelPattern }).first();
  await command.waitFor({ state: "visible", timeout: 8000 });
  await command.click();
}

async function writeReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-react-see-suite-proof-${stamp()}.json`);
  result.receipt_path = receiptPath;
  await fs.writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return receiptPath;
}

export async function runReactSeeSuiteProof({
  baseUrl = null,
  startServer = true,
  writeReceipt: shouldWriteReceipt = false,
  keepTemp = false,
  proofDir = PROOF_DIR,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  const id = `${stamp()}-react-see-suite`;
  const loadShot = path.join(proofDir, `${id}-orangebox-load.png`);
  const interactionShot = path.join(proofDir, `${id}-orangebox-interaction.png`);
  const stateBankShot = path.join(proofDir, `${id}-orangebox-state-bank.png`);
  const startedAt = new Date().toISOString();
  let runtime = {
    baseUrl: baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  let browser = null;
  const consoleErrors = [];
  const pageErrors = [];

  try {
    const probe = await requestJson(runtime.baseUrl, "/api/status?fast=1", 3000);
    if (!probe.ok) {
      if (!startServer) throw new Error(probe.error || `ORANGEBOX server unavailable at ${runtime.baseUrl}`);
      runtime = await startTemporaryServer();
    }

    const routeProbe = await requestText(runtime.baseUrl, "/v4/react/", 5000);
    const failures = [];
    if (!routeProbe.ok) failures.push({ type: "route", message: `/v4/react/ returned HTTP ${routeProbe.status}` });
    if (!/id="root"/i.test(routeProbe.text)) failures.push({ type: "route", message: "React root node missing from served HTML." });

    const executablePath = await chromiumExecutable("React AE See-Suite ORANGEBOX proof");
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: [
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-extensions",
      ],
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "no-preference",
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const route = `${runtime.baseUrl}/v4/react/`;
    await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".chat-dock", { state: "visible", timeout: 45000 });
    await page.waitForSelector(".floating-panel", { state: "visible", timeout: 45000 });
    await page.waitForTimeout(1800);

    const panelCount = await page.locator(".floating-panel").count();
    const chatDockVisible = await page.locator(".chat-dock").isVisible();
    const sceneVisible = await page.locator(".living-scene, .scene-fallback").first().isVisible().catch(() => false);
    await page.screenshot({ path: loadShot, fullPage: false, animations: "allow" });

    if (panelCount < 7) failures.push({ type: "load", message: `Expected at least 7 floating panels, saw ${panelCount}.` });
    if (!chatDockVisible) failures.push({ type: "load", message: "Chat dock was not visible." });
    if (!sceneVisible) failures.push({ type: "load", message: "Living scene or fallback was not visible." });

    await runPaletteCommand(page, "latency", /Simulate latency anomaly/i);
    await page.waitForSelector(".app-shell--alert", { state: "attached", timeout: 10000 });
    await page.waitForTimeout(900);
    const causalPathCount = await page.locator(".causality-layer path").count();
    const toastCountAfterLatency = await page.locator(".event-toast").count();

    await runPaletteCommand(page, "agent queue", /Open Agent Queue/i);
    const agentDrawer = page.locator(".drawer-shell").filter({ hasText: /Agent Queue/i }).first();
    await agentDrawer.waitFor({ state: "visible", timeout: 10000 });
    const agentDrawerVisible = await agentDrawer.isVisible();
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    await runPaletteCommand(page, "deployment report", /Generate deployment report/i);
    await page.waitForSelector(".run-status-overlay", { state: "visible", timeout: 8000 }).catch(() => {});
    await page.waitForSelector(".artifact-canvas", { state: "visible", timeout: 25000 });
    await page.waitForTimeout(2500);
    const artifactBranchCount = await page.locator(".artifact-branch-list button").count();
    const artifactCanvasVisible = await page.locator(".artifact-canvas").isVisible();
    await page.screenshot({ path: interactionShot, fullPage: false, animations: "allow" });

    await runPaletteCommand(page, "state 72", /State 72/i);
    const stateBanner = page.locator(".state-choreography__banner").filter({ hasText: /Saved Workspace Snapshot/i }).first();
    await stateBanner.waitFor({ state: "visible", timeout: 10000 });
    await page.waitForTimeout(700);
    const stateBankVisible = await stateBanner.isVisible();
    const stateBankLabel = await stateBanner.innerText().catch(() => "");
    await page.screenshot({ path: stateBankShot, fullPage: false, animations: "allow" });

    await page.waitForFunction(() => Boolean(window.__AE_SEE_SUITE_APPLY_STATE__ && window.__AE_SEE_SUITE_STATE_BANK__), null, { timeout: 10000 });
    const stateBankVerification = await page.evaluate(async () => {
      const applyState = window.__AE_SEE_SUITE_APPLY_STATE__;
      const states = window.__AE_SEE_SUITE_STATE_BANK__ || [];
      const verified = [];
      const failed = [];

      for (const state of states) {
        applyState(state.id);
        await new Promise((resolve) => window.setTimeout(resolve, 70));
        const banner = document.querySelector(".state-choreography__banner");
        const text = banner?.textContent || "";
        if (text.includes(state.id) && text.includes(state.title)) {
          verified.push(state.id);
        } else {
          failed.push({ id: state.id, expected: state.title, actual: text.slice(0, 180) });
        }
      }

      return {
        total: states.length,
        verified,
        failed,
      };
    });

    if (causalPathCount < 1) failures.push({ type: "interaction", message: "Latency command did not render causal paths." });
    if (toastCountAfterLatency < 1) failures.push({ type: "interaction", message: "Latency command did not emit an event toast." });
    if (!agentDrawerVisible) failures.push({ type: "interaction", message: "Agent Queue drawer did not open." });
    if (!artifactCanvasVisible) failures.push({ type: "interaction", message: "Artifact canvas did not open." });
    if (artifactBranchCount < 1) failures.push({ type: "interaction", message: "Generated artifact branch did not appear." });
    if (!stateBankVisible) failures.push({ type: "state_bank", message: "State 72 command did not render the manifest-backed state banner." });
    if (stateBankVerification.total !== 72 || stateBankVerification.failed.length) {
      failures.push({
        type: "state_bank",
        message: `72-state bank verification failed: ${stateBankVerification.verified.length}/${stateBankVerification.total}`,
        failed: stateBankVerification.failed,
      });
    }

    const screenshots = [loadShot, interactionShot, stateBankShot].map((file) => {
      const stat = fsSync.existsSync(file) ? fsSync.statSync(file) : null;
      return {
        path: file,
        exists: Boolean(stat),
        bytes: stat?.size || 0,
        sha256: sha256File(file),
        ok: Boolean(stat && stat.size > 10000),
      };
    });
    for (const shot of screenshots) {
      if (!shot.ok) failures.push({ type: "screenshot", message: `Screenshot too small or missing: ${shot.path}`, bytes: shot.bytes });
    }
    for (const error of consoleErrors) failures.push({ type: "console_error", message: compact(error, 600) });
    for (const error of pageErrors) failures.push({ type: "page_error", message: compact(error, 600) });

    const result = {
      ok: failures.length === 0,
      version: REACT_SEE_SUITE_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      route,
      base_url: runtime.baseUrl,
      runtime_started: runtime.started,
      checks: {
        route_served: routeProbe.ok,
        react_root_present: /id="root"/i.test(routeProbe.text),
        panel_count: panelCount,
        chat_dock_visible: chatDockVisible,
        living_scene_or_fallback_visible: sceneVisible,
        causal_path_count: causalPathCount,
        toast_count_after_latency: toastCountAfterLatency,
        agent_drawer_visible: agentDrawerVisible,
        artifact_canvas_visible: artifactCanvasVisible,
        artifact_branch_count: artifactBranchCount,
        state_72_banner_visible: stateBankVisible,
        state_72_banner_label: stateBankLabel,
        state_bank_total: stateBankVerification.total,
        state_bank_verified_count: stateBankVerification.verified.length,
        state_bank_failed: stateBankVerification.failed,
      },
      screenshots,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      runtime_output: runtime.output(),
      rollback: "/v4 remains the vanilla rollback surface; /v4/react/ is additive.",
      failures,
      summary: {
        checks: 13,
        passed: failures.length === 0 ? 13 : Math.max(0, 13 - failures.length),
        failed: failures.length,
      },
      receipt_path: null,
    };
    if (shouldWriteReceipt) await writeReceipt(result);
    await context.close();
    return result;
  } catch (error) {
    const result = {
      ok: false,
      version: REACT_SEE_SUITE_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      base_url: runtime.baseUrl,
      error: error?.message || String(error),
      stack: error?.stack ? compact(error.stack, 2200) : null,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      runtime_output: runtime.output(),
      rollback: "/v4 remains the vanilla rollback surface.",
      failures: [{ type: "exception", message: error?.message || String(error) }],
      summary: { checks: 1, passed: 0, failed: 1 },
      receipt_path: null,
    };
    if (shouldWriteReceipt) await writeReceipt(result);
    return result;
  } finally {
    await browser?.close().catch(() => {});
    await runtime.stop();
    if (!keepTemp) {
      // Browser contexts and temporary data roots are intentionally outside the repo.
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runReactSeeSuiteProof({
    writeReceipt: argv.includes("--receipt"),
    startServer: !argv.includes("--no-start-server"),
    keepTemp: argv.includes("--keep-temp"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || null,
    proofDir: argv.find((arg) => arg.startsWith("--proof-dir="))?.slice("--proof-dir=".length) || PROOF_DIR,
  });

  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} React AE See-Suite proof ${out.summary.passed}/${out.summary.checks}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures || []) {
      console.log(`failure: ${failure.type} ${failure.message || ""}`);
    }
  }

  if (!out.ok) process.exit(4);
}
