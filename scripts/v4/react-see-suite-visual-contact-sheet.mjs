#!/usr/bin/env node
/* react-see-suite-visual-contact-sheet.mjs - target-vs-proof visual contact sheet. */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { chromiumExecutable } from "./chromium-proof-runner.mjs";

export const REACT_SEE_SUITE_VISUAL_CONTACT_SHEET_VERSION = "orangebox-react-see-suite-visual-contact-sheet/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DEFAULT_TARGET = "C:\\Users\\a\\Downloads\\obalpahamockup-goal.png";

const regions = [
  { id: "full", label: "Full Surface", x: 0, y: 0, w: 100, h: 100 },
  { id: "left-rail", label: "Left Rail", x: 0, y: 0, w: 16, h: 100 },
  { id: "top-rail", label: "Top Command Rail", x: 28, y: 0, w: 52, h: 11 },
  { id: "system-core", label: "Central Core + Agents", x: 32, y: 8, w: 42, h: 52 },
  { id: "left-panels", label: "Left Semantic Panels", x: 12, y: 7, w: 24, h: 70 },
  { id: "right-panels", label: "Right Operational Panels", x: 62, y: 7, w: 36, h: 72 },
  { id: "causal-memory", label: "Causality + Memory Ribbon", x: 26, y: 54, w: 52, h: 26 },
  { id: "chat-dock", label: "Chat Command Dock", x: 15, y: 75, w: 70, h: 23 },
  { id: "assistant-brain", label: "Assistant Brain", x: 76, y: 61, w: 24, h: 37 },
];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function parseArgs(argv) {
  const args = new Map();
  for (const arg of argv) {
    const [key, ...rest] = arg.split("=");
    args.set(key, rest.length ? rest.join("=") : "1");
  }
  return args;
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

async function latestReactReceipt() {
  const entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile() && /^orangebox-react-see-suite-proof-.*\.json$/i.test(entry.name))
    .map((entry) => path.join(RECEIPTS_DIR, entry.name))
    .sort((a, b) => fsSync.statSync(b).mtimeMs - fsSync.statSync(a).mtimeMs);
  return candidates[0];
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cropSvg(imageUrl, region) {
  const viewBox = `${region.x} ${region.y} ${region.w} ${region.h}`;
  return `
    <svg class="crop-svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice" role="img">
      <image href="${imageUrl}" x="0" y="0" width="100" height="100" preserveAspectRatio="none" />
    </svg>
  `;
}

function makeHtml({ targetUrl, appUrl, targetPath, appPath, sourceReceiptPath }) {
  const rows = regions
    .map((region) => `
      <section class="region-card">
        <header>
          <strong>${escapeHtml(region.label)}</strong>
          <span>${region.id} · ${region.x}/${region.y}/${region.w}/${region.h}</span>
        </header>
        <div class="pair">
          <article>
            <b>Goal Mockup</b>
            ${cropSvg(targetUrl, region)}
          </article>
          <article>
            <b>Current React Proof</b>
            ${cropSvg(appUrl, region)}
          </article>
        </div>
      </section>
    `)
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AE See-Suite Visual Contact Sheet</title>
    <style>
      :root {
        --bg: #030713;
        --panel: rgba(8, 16, 34, 0.88);
        --line: rgba(142, 227, 255, 0.15);
        --text: #edf8ff;
        --muted: rgba(214, 231, 248, 0.62);
        --cyan: #2ffcff;
        --violet: #8b5cff;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background:
          radial-gradient(circle at 50% 0%, rgba(47, 252, 255, 0.11), transparent 26%),
          radial-gradient(circle at 100% 20%, rgba(139, 92, 255, 0.12), transparent 28%),
          var(--bg);
        color: var(--text);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      main {
        width: 1600px;
        padding: 24px;
      }
      .hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 18px;
        align-items: end;
        margin-bottom: 18px;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 30px;
        letter-spacing: -0.03em;
      }
      p {
        margin: 0;
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }
      code {
        color: var(--cyan);
        font-family: inherit;
        font-size: 12px;
      }
      .full-pair,
      .pair {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
      }
      .full-pair {
        margin-bottom: 16px;
      }
      article,
      .region-card {
        border: 1px solid var(--line);
        border-radius: 20px;
        background:
          radial-gradient(circle at 0% 0%, rgba(47, 252, 255, 0.08), transparent 32%),
          var(--panel);
        box-shadow: 0 18px 70px rgba(0, 0, 0, 0.38);
        overflow: hidden;
      }
      article b {
        display: block;
        padding: 10px 12px;
        color: var(--text);
        font-size: 12px;
        border-bottom: 1px solid var(--line);
      }
      .full-image {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        object-fit: cover;
      }
      .regions {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 14px;
      }
      .region-card {
        padding: 12px;
      }
      .region-card header {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: baseline;
        margin-bottom: 10px;
      }
      .region-card header strong {
        font-size: 14px;
      }
      .region-card header span {
        color: var(--muted);
        font-size: 10px;
      }
      .region-card article {
        border-radius: 14px;
        box-shadow: none;
      }
      .region-card article b {
        padding: 7px 9px;
        font-size: 10px;
      }
      .crop-svg {
        display: block;
        width: 100%;
        aspect-ratio: 16 / 9;
        background: #050b18;
      }
      .receipt {
        max-width: 860px;
        text-align: right;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>AE See-Suite Visual Contact Sheet</h1>
          <p>Goal mockup and latest ORANGEBOX-hosted React proof, with normalized crops for the regions that matter most.</p>
        </div>
        <p class="receipt">
          Target: <code>${escapeHtml(targetPath)}</code><br />
          React proof: <code>${escapeHtml(appPath)}</code><br />
          Source receipt: <code>${escapeHtml(sourceReceiptPath)}</code>
        </p>
      </section>

      <section class="full-pair">
        <article>
          <b>Goal Mockup</b>
          <img class="full-image" src="${targetUrl}" alt="Goal mockup" />
        </article>
        <article>
          <b>Current React Proof</b>
          <img class="full-image" src="${appUrl}" alt="Current React proof" />
        </article>
      </section>

      <section class="regions">
        ${rows}
      </section>
    </main>
  </body>
</html>`;
}

export async function runReactSeeSuiteVisualContactSheet({
  targetPath = DEFAULT_TARGET,
  appPath,
  receiptPath,
  proofDir = PROOF_DIR,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });

  const sourceReceiptPath = receiptPath || await latestReactReceipt();
  if (!sourceReceiptPath || !fsSync.existsSync(sourceReceiptPath)) {
    throw new Error("No React proof receipt found. Run npm.cmd run proof:see-suite-react first.");
  }

  const sourceReceipt = JSON.parse(await fs.readFile(sourceReceiptPath, "utf8"));
  const resolvedAppPath = appPath || sourceReceipt.screenshots?.[0]?.path;
  if (!resolvedAppPath || !fsSync.existsSync(resolvedAppPath)) {
    throw new Error(`React proof screenshot missing: ${resolvedAppPath || "(none)"}`);
  }
  if (!fsSync.existsSync(targetPath)) {
    throw new Error(`Goal mockup missing: ${targetPath}`);
  }

  const id = `${stamp()}-react-see-suite-visual-contact-sheet`;
  const htmlPath = path.join(proofDir, `${id}.html`);
  const pngPath = path.join(proofDir, `${id}.png`);
  const receiptOutPath = path.join(RECEIPTS_DIR, `${id}-receipt.json`);
  const targetUrl = pathToFileURL(path.resolve(targetPath)).href;
  const appUrl = pathToFileURL(path.resolve(resolvedAppPath)).href;

  await fs.writeFile(htmlPath, makeHtml({
    targetUrl,
    appUrl,
    targetPath,
    appPath: resolvedAppPath,
    sourceReceiptPath,
  }), "utf8");

  const executablePath = await chromiumExecutable("AE See-Suite visual contact sheet");
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 2400 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 60000 });
    await page.screenshot({ path: pngPath, fullPage: true, animations: "disabled" });
    await page.close();
  } finally {
    await browser.close().catch(() => {});
  }

  const result = {
    ok: true,
    version: REACT_SEE_SUITE_VISUAL_CONTACT_SHEET_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    source_receipt_path: sourceReceiptPath,
    target_path: targetPath,
    app_screenshot_path: resolvedAppPath,
    html_path: htmlPath,
    screenshot_path: pngPath,
    regions,
    files: {
      html: {
        exists: fsSync.existsSync(htmlPath),
        bytes: fsSync.statSync(htmlPath).size,
        sha256: sha256File(htmlPath),
      },
      screenshot: {
        exists: fsSync.existsSync(pngPath),
        bytes: fsSync.statSync(pngPath).size,
        sha256: sha256File(pngPath),
      },
    },
    rollback: "Read-only visual QA artifact; app surfaces are unchanged.",
    receipt_path: receiptOutPath,
  };

  await fs.writeFile(receiptOutPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const result = await runReactSeeSuiteVisualContactSheet({
      targetPath: args.get("--target") || DEFAULT_TARGET,
      appPath: args.get("--app"),
      receiptPath: args.get("--source-receipt"),
      proofDir: args.get("--proof-dir") || PROOF_DIR,
    });
    if (args.has("--json")) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`PASS ${REACT_SEE_SUITE_VISUAL_CONTACT_SHEET_VERSION}`);
      console.log(`contact sheet: ${result.screenshot_path}`);
      console.log(`receipt: ${result.receipt_path}`);
    }
  } catch (error) {
    const result = {
      ok: false,
      version: REACT_SEE_SUITE_VISUAL_CONTACT_SHEET_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    };
    if (args.has("--json")) console.log(JSON.stringify(result, null, 2));
    else console.error(`FAIL ${result.error}`);
    process.exit(4);
  }
}
