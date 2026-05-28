#!/usr/bin/env node
/* react-see-suite-72-state-proof.mjs - walks every source-bank state and receipts screenshots. */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { chromiumExecutable } from "./chromium-proof-runner.mjs";

export const REACT_SEE_SUITE_72_STATE_PROOF_VERSION = "orangebox-react-see-suite-72-state-proof/v3";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DEFAULT_BANK_ROOT = "C:\\Users\\a\\AppData\\Local\\Temp\\ae-see-suite-mockup-bank-v2";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function compact(value, max = 1400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    const [key, ...rest] = arg.split("=");
    args.set(key, rest.length ? rest.join("=") : "1");
  }
  return args;
}

function parseStateIds(value) {
  if (!value) return null;
  const ids = String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.padStart(2, "0"));
  return ids.length ? new Set(ids) : null;
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

function readJpegDimensions(file) {
  const buffer = fsSync.readFileSync(file);
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    const isStartOfFrame = [
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf,
    ].includes(marker);

    if (isStartOfFrame && offset + 7 <= buffer.length) {
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      };
    }

    offset += length;
  }

  return null;
}

function requestJson(baseUrl, endpoint, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, baseUrl);
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
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
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-react-see-suite-72-state-data-"));
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
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const probe = await requestJson(baseUrl, "/api/status?fast=1", 2000);
    if (probe.ok) {
      return {
        baseUrl,
        started: true,
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

async function readManifest(bankRoot) {
  const manifestPath = path.join(bankRoot, "mockup_manifest.json");
  if (!fsSync.existsSync(manifestPath)) {
    throw new Error(`72-state mockup manifest missing: ${manifestPath}`);
  }

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  return manifest.map((state) => ({
    ...state,
    idText: String(state.id).padStart(2, "0"),
    sourcePath: path.join(bankRoot, state.file),
  }));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeContactSheet({ states, runDir, route, bankRoot, imageAspect }) {
  const cards = states
    .map((state) => {
      const sourceUrl = pathToFileURL(state.sourcePath).href;
      const appUrl = pathToFileURL(state.appShotPath).href;
      return `
        <article class="state-card state-card--${escapeHtml(state.theme)}">
          <header>
            <span>${escapeHtml(state.idText)}</span>
            <div>
              <strong>${escapeHtml(state.title)}</strong>
              <em>${escapeHtml(state.subtitle)}</em>
            </div>
          </header>
          <div class="pair">
            <figure>
              <figcaption>Source mockup</figcaption>
              <img src="${sourceUrl}" alt="${escapeHtml(state.title)} source" />
            </figure>
            <figure>
              <figcaption>React state proof</figcaption>
              <img src="${appUrl}" alt="${escapeHtml(state.title)} proof" />
            </figure>
          </div>
          <footer>
            <code>${escapeHtml(state.file)}</code>
            <span>${escapeHtml((state.focus || []).join(" / ") || "global")}</span>
          </footer>
        </article>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AE See-Suite 72-State Proof</title>
    <style>
      :root {
        --bg: #030713;
        --panel: rgba(5, 12, 28, 0.92);
        --line: rgba(142, 227, 255, 0.14);
        --text: #edf8ff;
        --muted: rgba(218, 232, 255, 0.66);
        --cyan: #2ffcff;
        --violet: #8b5cff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at 50% 0%, rgba(47, 252, 255, 0.12), transparent 24%),
          radial-gradient(circle at 100% 12%, rgba(139, 92, 255, 0.12), transparent 30%),
          var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: 2200px;
        padding: 28px;
      }
      .hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 24px;
        align-items: end;
        margin-bottom: 24px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 36px;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.5;
      }
      code {
        color: var(--cyan);
        font-family: inherit;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 18px;
      }
      .state-card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background:
          radial-gradient(circle at 0% 0%, rgba(47, 252, 255, 0.08), transparent 32%),
          var(--panel);
        box-shadow: 0 18px 70px rgba(0, 0, 0, 0.42);
        overflow: hidden;
      }
      .state-card header {
        height: 72px;
        display: grid;
        grid-template-columns: 44px 1fr;
        gap: 12px;
        align-items: center;
        border-bottom: 1px solid var(--line);
        padding: 0 14px;
      }
      .state-card header span {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border-radius: 999px;
        border: 1px solid var(--cyan);
        color: white;
        background: rgba(47, 252, 255, 0.08);
        font-weight: 800;
      }
      .state-card strong,
      .state-card em {
        display: block;
      }
      .state-card strong {
        font-size: 15px;
      }
      .state-card em {
        margin-top: 4px;
        color: var(--muted);
        font-size: 12px;
        font-style: normal;
      }
      .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 1px;
        background: rgba(142, 227, 255, 0.1);
      }
      figure {
        margin: 0;
        background: #050b18;
      }
      figcaption {
        padding: 7px 10px;
        color: var(--muted);
        font-size: 10px;
        border-bottom: 1px solid rgba(142, 227, 255, 0.1);
      }
      img {
        display: block;
        width: 100%;
        aspect-ratio: ${imageAspect.width} / ${imageAspect.height};
        object-fit: cover;
      }
      footer {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 9px 12px;
        color: var(--muted);
        font-size: 10px;
      }
      footer span {
        color: rgba(255, 255, 255, 0.7);
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>AE See-Suite 72-State Proof</h1>
          <p>Every GPT-5.5 source mockup is paired with a reachable ORANGEBOX-hosted React state. This is proof coverage, not a claim of final visual fidelity.</p>
        </div>
        <p>
          Route: <code>${escapeHtml(route)}</code><br />
          Source bank: <code>${escapeHtml(bankRoot)}</code><br />
          Run dir: <code>${escapeHtml(runDir)}</code>
        </p>
      </section>
      <section class="grid">
        ${cards}
      </section>
    </main>
  </body>
</html>`;
}

export async function runReactSeeSuite72StateProof({
  baseUrl = null,
  bankRoot = DEFAULT_BANK_ROOT,
  proofDir = PROOF_DIR,
  states = null,
  viewportWidth = null,
  viewportHeight = null,
  cssOverridePath = null,
  stateSettleMs = 520,
  writeReceipt = true,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });

  const stateFilter = Array.isArray(states) ? new Set(states.map((item) => String(item).padStart(2, "0"))) : states;
  const manifest = (await readManifest(bankRoot)).filter((state) => !stateFilter || stateFilter.has(state.idText));
  if (manifest.length === 0) {
    throw new Error("No source-bank states matched the requested --states filter.");
  }
  const sourceDimensions = readJpegDimensions(manifest[0].sourcePath);
  if (!sourceDimensions) {
    throw new Error(`Unable to read source mockup dimensions: ${manifest[0].sourcePath}`);
  }
  const viewport = {
    width: viewportWidth ? Number(viewportWidth) : sourceDimensions.width,
    height: viewportHeight ? Number(viewportHeight) : sourceDimensions.height,
  };
  const id = `${stamp()}-react-see-suite-72-state`;
  const runDir = path.join(proofDir, id);
  await fs.mkdir(runDir, { recursive: true });

  let runtime = {
    baseUrl: baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  let browser = null;
  const consoleErrors = [];
  const pageErrors = [];
  const failures = [];
  const startedAt = new Date().toISOString();
  const cssOverride = cssOverridePath ? await fs.readFile(cssOverridePath, "utf8") : null;

  try {
    const probe = await requestJson(runtime.baseUrl, "/api/status?fast=1", 3000);
    if (!probe.ok) runtime = await startTemporaryServer();

    const executablePath = await chromiumExecutable("React AE See-Suite 72-state proof");
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-background-networking"],
    });

    const context = await browser.newContext({
      viewport,
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    });
    await context.addInitScript(() => {
      const fixedNow = Date.parse("2026-05-27T00:00:00.000Z");
      const NativeDate = Date;
      let seed = 0x0aeeee37;

      Math.random = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
      };

      class ProofDate extends NativeDate {
        constructor(...args) {
          super(...(args.length ? args : [fixedNow]));
        }

        static now() {
          return fixedNow;
        }
      }

      ProofDate.UTC = NativeDate.UTC;
      ProofDate.parse = NativeDate.parse;
      Object.setPrototypeOf(ProofDate, NativeDate);
      globalThis.Date = ProofDate;
      globalThis.__AE_SEE_SUITE_PROOF_MODE__ = true;
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const route = `${runtime.baseUrl}/v4/react/`;
    await page.goto(`${route}?state=01`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector(".chat-dock", { state: "visible", timeout: 45000 });
    await page.waitForSelector(".state-choreography__banner", { state: "visible", timeout: 45000 });
    await page.waitForFunction(() => Boolean(window.__AE_SEE_SUITE_APPLY_STATE__ && window.__AE_SEE_SUITE_STATE_BANK__), null, { timeout: 10000 });
    if (cssOverride) {
      await page.addStyleTag({ content: cssOverride });
    }

    const stateResults = [];
    for (const state of manifest) {
      await page.evaluate((stateId) => {
        window.__AE_SEE_SUITE_APPLY_STATE__?.(stateId);
      }, state.idText);
      await page.waitForFunction(
        ({ idText, title }) => {
          const bannerText = document.querySelector(".state-choreography__banner")?.textContent || "";
          return bannerText.includes(idText) && bannerText.includes(title);
        },
        { idText: state.idText, title: state.title },
        { timeout: 10000 },
      ).catch((error) => {
        failures.push({ type: "state_banner", state: state.idText, message: error.message });
      });

      await page.waitForTimeout(Number(stateSettleMs) || 520);
      const appShotPath = path.join(runDir, `${state.idText}-react.jpg`);
      await page.screenshot({ path: appShotPath, type: "jpeg", quality: 78, fullPage: false, animations: "disabled" });
      const bannerText = await page.locator(".state-choreography__banner").innerText().catch(() => "");
      const sourceExists = fsSync.existsSync(state.sourcePath);
      const appExists = fsSync.existsSync(appShotPath);
      if (!sourceExists) failures.push({ type: "source_missing", state: state.idText, message: state.sourcePath });
      if (!appExists) failures.push({ type: "screenshot_missing", state: state.idText, message: appShotPath });
      stateResults.push({
        ...state,
        appShotPath,
        bannerText,
        sourceExists,
        appExists,
        sourceSha256: sha256File(state.sourcePath),
        appSha256: sha256File(appShotPath),
      });
    }

    const htmlPath = path.join(runDir, "72-state-contact-sheet.html");
    const contactPngPath = path.join(runDir, "72-state-contact-sheet.jpg");
    await fs.writeFile(htmlPath, makeContactSheet({ states: stateResults, runDir, route, bankRoot, imageAspect: sourceDimensions }), "utf8");

    const sheetPage = await context.newPage();
    await sheetPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 60000 });
    await sheetPage.setViewportSize({ width: 2200, height: 5200 });
    await sheetPage.screenshot({ path: contactPngPath, type: "jpeg", quality: 82, fullPage: true, animations: "disabled" });
    await sheetPage.close();
    await context.close();

    for (const error of consoleErrors) failures.push({ type: "console_error", message: compact(error, 600) });
    for (const error of pageErrors) failures.push({ type: "page_error", message: compact(error, 600) });

    const receiptPath = path.join(RECEIPTS_DIR, `${id}-receipt.json`);
    const result = {
      ok: failures.length === 0,
      version: REACT_SEE_SUITE_72_STATE_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      route,
      base_url: runtime.baseUrl,
      runtime_started: runtime.started,
      bank_root: bankRoot,
      source_dimensions: sourceDimensions,
      viewport,
      requested_states: stateFilter ? Array.from(stateFilter).sort() : null,
      css_override_path: cssOverridePath,
      css_override_sha256: cssOverridePath ? sha256File(cssOverridePath) : null,
      state_settle_ms: Number(stateSettleMs) || 520,
      state_count: stateResults.length,
      verified_state_count: stateResults.filter((state) => state.sourceExists && state.appExists && state.bannerText.includes(state.title)).length,
      run_dir: runDir,
      contact_sheet_html: htmlPath,
      contact_sheet_screenshot: contactPngPath,
      contact_sheet_sha256: sha256File(contactPngPath),
      states: stateResults.map((state) => ({
        id: state.idText,
        title: state.title,
        theme: state.theme,
        focus: state.focus,
        source_path: state.sourcePath,
        app_screenshot_path: state.appShotPath,
        banner_text: state.bannerText,
        source_sha256: state.sourceSha256,
        app_sha256: state.appSha256,
      })),
      failures,
      console_errors: consoleErrors,
      page_errors: pageErrors,
      runtime_output: runtime.output(),
      rollback: "/v4 remains the vanilla rollback surface; /v4/react/ is additive.",
      receipt_path: receiptPath,
    };

    if (writeReceipt) {
      await fs.writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }

    return result;
  } catch (error) {
    const receiptPath = path.join(RECEIPTS_DIR, `${id}-receipt.json`);
    const result = {
      ok: false,
      version: REACT_SEE_SUITE_72_STATE_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      base_url: runtime.baseUrl,
      error: error instanceof Error ? error.message : String(error),
      stack: error?.stack ? compact(error.stack, 2200) : null,
      failures: [{ type: "exception", message: error instanceof Error ? error.message : String(error) }, ...failures],
      runtime_output: runtime.output(),
      rollback: "/v4 remains the vanilla rollback surface.",
      receipt_path: receiptPath,
    };
    if (writeReceipt) {
      await fs.writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  } finally {
    await browser?.close().catch(() => {});
    await runtime.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = await runReactSeeSuite72StateProof({
    baseUrl: args.get("--base-url") || null,
    bankRoot: args.get("--bank-root") || DEFAULT_BANK_ROOT,
    proofDir: args.get("--proof-dir") || PROOF_DIR,
    states: parseStateIds(args.get("--states")),
    viewportWidth: args.get("--width") || null,
    viewportHeight: args.get("--height") || null,
    cssOverridePath: args.get("--css-override") || null,
    stateSettleMs: args.get("--settle-ms") || 520,
    writeReceipt: !args.has("--no-receipt"),
  });

  if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${REACT_SEE_SUITE_72_STATE_PROOF_VERSION} ${result.verified_state_count || 0}/${result.state_count || 72}`);
    console.log(`contact sheet: ${result.contact_sheet_screenshot || "(none)"}`);
    console.log(`receipt: ${result.receipt_path}`);
    for (const failure of result.failures || []) {
      console.log(`failure: ${failure.type} ${failure.state || ""} ${failure.message || ""}`);
    }
  }

  if (!result.ok) process.exit(4);
}
