#!/usr/bin/env node
/*
  AE See-Suite frontend visual proof runner.

  Purpose:
  - Owns proof from inside frontend/, not from the older ORANGEBOX script lane.
  - Builds a local static server from frontend/dist.
  - Captures state URL screenshots such as /?state=01.
  - Always writes a non-empty JSON receipt, even on failure.

  Usage:
    npm run build
    node ./scripts/visual-proof.mjs --states=01,06,26,37,61 --label=anchors
    node ./scripts/visual-proof.mjs --states=all --label=72-state
*/

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, "..");
const DIST_DIR = path.join(FRONTEND_ROOT, "dist");
const PROOF_DIR = path.join(FRONTEND_ROOT, "proof");
const DEFAULT_VIEWPORT = { width: 1440, height: 1024 };
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function parseArgs(argv) {
  const out = new Map();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, ...rest] = raw.slice(2).split("=");
    out.set(key, rest.length ? rest.join("=") : "1");
  }
  return out;
}

function stateList(value) {
  const raw = String(value || "01,06,26,37,61").trim();
  if (raw === "all" || raw === "72") {
    return Array.from({ length: 72 }, (_, index) => String(index + 1).padStart(2, "0"));
  }
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.padStart(2, "0"));
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

function safeInside(root, target) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

function makeStaticServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
      let rel = decodeURIComponent(requestUrl.pathname || "/");
      if (rel === "/" || rel.endsWith("/")) rel = "/index.html";
      let file = path.join(DIST_DIR, rel.replace(/^\/+/, ""));

      if (!safeInside(DIST_DIR, file) || !fsSync.existsSync(file) || fsSync.statSync(file).isDirectory()) {
        file = path.join(DIST_DIR, "index.html");
      }

      const body = await fs.readFile(file);
      const ext = path.extname(file).toLowerCase();
      res.writeHead(200, {
        "content-type": CONTENT_TYPES.get(ext) || "application/octet-stream",
        "cache-control": "no-store",
      });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end(error.message);
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function captureState(page, baseUrl, runDir, stateId) {
  const url = `${baseUrl}/?state=${encodeURIComponent(stateId)}`;
  const screenshot = path.join(runDir, `${stateId}-react.jpg`);
  const started = Date.now();
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: screenshot, type: "jpeg", quality: 92, fullPage: true });
  const dom = await page.evaluate(() => ({
    title: document.title,
    bodyTextPreview: document.body.innerText.slice(0, 600),
    shellClass: document.querySelector(".app-shell")?.className || "",
    activeStateClass: Array.from(document.querySelector(".app-shell")?.classList || []).find((item) => item.startsWith("app-shell--state-")) || null,
    panelCount: document.querySelectorAll("[class*='panel'], .floating-panel").length,
    buttonCount: document.querySelectorAll("button").length,
    errorText: document.querySelector(".scene-fallback")?.textContent || "",
  }));
  const stat = await fs.stat(screenshot);
  return {
    state: stateId,
    url,
    screenshot: path.relative(FRONTEND_ROOT, screenshot).replace(/\\/g, "/"),
    bytes: stat.size,
    sha256: sha256File(screenshot),
    duration_ms: Date.now() - started,
    dom,
    ok: stat.size > 0 && !dom.errorText,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const states = stateList(args.get("states"));
  const label = String(args.get("label") || (states.length === 72 ? "72-state" : "anchors"));
  const viewport = {
    width: Number(args.get("width") || DEFAULT_VIEWPORT.width),
    height: Number(args.get("height") || DEFAULT_VIEWPORT.height),
  };
  const runId = `${stamp()}-${label}-frontend-visual-proof`;
  const runDir = path.join(PROOF_DIR, runId);
  const receiptPath = path.join(runDir, "visual-proof-receipt.json");
  const receipt = {
    runner: "frontend/scripts/visual-proof.mjs",
    version: "orangebox-delta-frontend-visual-proof/v1",
    status: "RUNNING",
    ok: false,
    run_id: runId,
    frontend_root: FRONTEND_ROOT,
    dist_dir: DIST_DIR,
    run_dir: runDir,
    label,
    states_requested: states,
    viewport,
    captures: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
  };

  await fs.mkdir(runDir, { recursive: true });
  await writeJson(receiptPath, receipt);

  let server;
  let browser;
  try {
    if (!fsSync.existsSync(path.join(DIST_DIR, "index.html"))) {
      throw new Error(`frontend/dist/index.html missing. Run npm run build first from ${FRONTEND_ROOT}.`);
    }

    const served = await makeStaticServer();
    server = served.server;
    receipt.base_url = served.url;

    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport });
    page.on("console", (message) => {
      if (message.type() === "error") {
        receipt.captures.push({ state: "console", ok: false, error: message.text() });
      }
    });

    for (const stateId of states) {
      const capture = await captureState(page, served.url, runDir, stateId);
      receipt.captures.push(capture);
    }

    const realCaptures = receipt.captures.filter((item) => item.state !== "console");
    const failed = realCaptures.filter((item) => !item.ok);
    receipt.status = failed.length ? "FAILED" : "GREEN";
    receipt.ok = failed.length === 0;
    receipt.summary = `${realCaptures.length}/${states.length} requested states captured`;
  } catch (error) {
    receipt.status = "FAILED";
    receipt.ok = false;
    receipt.error = error.stack || error.message;
  } finally {
    receipt.completed_at = new Date().toISOString();
    await writeJson(receiptPath, receipt);
    if (browser) await browser.close().catch(() => {});
    if (server) await new Promise((resolve) => server.close(resolve)).catch(() => {});
  }

  console.log(JSON.stringify({ status: receipt.status, ok: receipt.ok, receipt: path.relative(process.cwd(), receiptPath), run_dir: path.relative(process.cwd(), runDir), captured: receipt.captures.filter((item) => item.state !== "console").length }, null, 2));
  if (!receipt.ok) process.exit(1);
}

await main();
