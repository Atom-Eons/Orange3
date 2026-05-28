#!/usr/bin/env node
/*
  AE See-Suite frontend pixel compare runner.

  This runner is intentionally frontend-owned. It compares the latest frontend proof
  screenshots against a source mockup bank when that bank is present. It never emits
  an empty receipt: missing source bank, missing screenshots, and compare failures are
  recorded as explicit INCOMPLETE/FAILED states.

  Usage:
    npm run proof:visual -- --states=01,06,26,37,61
    npm run proof:pixel -- --states=01,06,26,37,61 --bank=C:\path\to\mockup-bank
*/

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, "..");
const PROOF_DIR = path.join(FRONTEND_ROOT, "proof");
const DEFAULT_BANK_ROOT = process.env.AE_SEE_SUITE_MOCKUP_BANK || "C:\\Users\\a\\AppData\\Local\\Temp\\ae-see-suite-mockup-bank-v2";

function parseArgs(argv) {
  const out = new Map();
  for (const raw of argv) {
    if (!raw.startsWith("--")) continue;
    const [key, ...rest] = raw.slice(2).split("=");
    out.set(key, rest.length ? rest.join("=") : "1");
  }
  return out;
}

function statesFrom(value) {
  const raw = String(value || "01,06,26,37,61").trim();
  if (raw === "all" || raw === "72") return Array.from({ length: 72 }, (_, i) => String(i + 1).padStart(2, "0"));
  return raw.split(",").map((item) => item.trim()).filter(Boolean).map((item) => item.padStart(2, "0"));
}

function stamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

async function latestVisualProofDir() {
  const entries = await fs.readdir(PROOF_DIR, { withFileTypes: true }).catch(() => []);
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith("-frontend-visual-proof")) continue;
    const dir = path.join(PROOF_DIR, entry.name);
    const stat = await fs.stat(dir);
    dirs.push({ dir, mtime: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  if (!dirs[0]) throw new Error(`No frontend visual proof run found under ${PROOF_DIR}. Run npm run proof:visual first.`);
  return dirs[0].dir;
}

async function readManifest(bankRoot) {
  const manifestFile = path.join(bankRoot, "mockup_manifest.json");
  if (!fsSync.existsSync(manifestFile)) return null;
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
  const byId = new Map();
  for (const item of manifest) {
    const id = String(item.id).padStart(2, "0");
    byId.set(id, { ...item, id, sourcePath: path.join(bankRoot, item.file || `${id}.jpg`) });
  }
  return byId;
}

function imageCandidate(bankRoot, stateId, manifest) {
  const fromManifest = manifest?.get(stateId)?.sourcePath;
  const candidates = [
    fromManifest,
    path.join(bankRoot, `${stateId}.jpg`),
    path.join(bankRoot, `${stateId}.jpeg`),
    path.join(bankRoot, `${stateId}.png`),
    path.join(bankRoot, `${stateId}.webp`),
    path.join(bankRoot, `${stateId}-source.jpg`),
  ].filter(Boolean);
  return candidates.find((file) => fsSync.existsSync(file)) || candidates[0];
}

function fileSize(file) {
  try { return fsSync.statSync(file).size; } catch { return 0; }
}

function cheapFileSimilarity(sourceFile, appFile) {
  if (!fsSync.existsSync(sourceFile) || !fsSync.existsSync(appFile)) return null;
  const source = fsSync.readFileSync(sourceFile);
  const app = fsSync.readFileSync(appFile);
  const n = Math.min(source.length, app.length, 250_000);
  if (!n) return 0;
  let same = 0;
  const stride = Math.max(1, Math.floor(n / 25_000));
  let samples = 0;
  for (let i = 0; i < n; i += stride) {
    const delta = Math.abs(source[i] - app[i]);
    same += Math.max(0, 1 - delta / 255);
    samples += 1;
  }
  const sizeRatio = Math.min(source.length, app.length) / Math.max(source.length, app.length);
  return Math.max(0, Math.min(1, (same / samples) * 0.75 + sizeRatio * 0.25));
}

function makeHtml(receipt) {
  const cards = receipt.comparisons.map((item) => `
    <article class="card ${item.status.toLowerCase()}">
      <h2>State ${item.state}</h2>
      <p><b>${item.status}</b> · score ${item.score_1000 ?? "n/a"}/1000</p>
      <p>source: ${item.source_exists ? item.source_path : "missing"}</p>
      <p>react: ${item.app_exists ? item.app_screenshot_path : "missing"}</p>
      <p>${item.note || ""}</p>
    </article>
  `).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Frontend Pixel Compare</title><style>
    body{margin:0;background:#050712;color:#f7efe2;font-family:Inter,system-ui,sans-serif;padding:28px}
    h1{margin:0 0 8px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}.card{border:1px solid #3a2a1d;border-radius:18px;padding:16px;background:#17110d}.green{border-color:#65c470}.weak{border-color:#d6a144}.incomplete,.failed{border-color:#c85b49}p{color:#cdb79c;font-size:13px;overflow-wrap:anywhere}
  </style></head><body><h1>AE See-Suite Pixel Compare</h1><p>${receipt.status} · ${receipt.summary}</p><section class="grid">${cards}</section></body></html>`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const states = statesFrom(args.get("states"));
  const bankRoot = path.resolve(String(args.get("bank") || DEFAULT_BANK_ROOT));
  const targetScore = Number(args.get("target") || 930);
  const visualDir = args.get("run") ? path.resolve(String(args.get("run"))) : await latestVisualProofDir();
  const runId = `${stamp()}-frontend-pixel-compare`;
  const runDir = path.join(PROOF_DIR, runId);
  const receiptPath = path.join(runDir, "pixel-compare-receipt.json");

  const receipt = {
    runner: "frontend/scripts/pixel-compare.mjs",
    version: "orangebox-delta-frontend-pixel-compare/v1",
    status: "RUNNING",
    ok: false,
    run_id: runId,
    bank_root: bankRoot,
    visual_run_dir: visualDir,
    run_dir: runDir,
    states_requested: states,
    target_score: targetScore,
    comparisons: [],
    started_at: new Date().toISOString(),
    completed_at: null,
    error: null,
  };

  await fs.mkdir(runDir, { recursive: true });
  await writeJson(receiptPath, receipt);

  try {
    const bankExists = fsSync.existsSync(bankRoot);
    const manifest = bankExists ? await readManifest(bankRoot) : null;

    for (const state of states) {
      const source = bankExists ? imageCandidate(bankRoot, state, manifest) : path.join(bankRoot, `${state}.jpg`);
      const app = path.join(visualDir, `${state}-react.jpg`);
      const sourceExists = fsSync.existsSync(source);
      const appExists = fsSync.existsSync(app);
      const similarity = sourceExists && appExists ? cheapFileSimilarity(source, app) : null;
      const score = similarity == null ? null : Math.round(similarity * 1000 * 10) / 10;
      const status = !bankExists || !sourceExists || !appExists
        ? "INCOMPLETE"
        : score >= targetScore
          ? "GREEN"
          : "WEAK";
      receipt.comparisons.push({
        state,
        status,
        score_1000: score,
        source_exists: sourceExists,
        app_exists: appExists,
        source_path: source,
        app_screenshot_path: app,
        source_bytes: fileSize(source),
        app_bytes: fileSize(app),
        source_sha256: sha256File(source),
        app_sha256: sha256File(app),
        note: !bankExists ? "Source mockup bank missing. Receipt is non-empty but cannot claim source-exact green." : undefined,
      });
    }

    const incomplete = receipt.comparisons.filter((item) => item.status === "INCOMPLETE");
    const weak = receipt.comparisons.filter((item) => item.status === "WEAK");
    receipt.status = incomplete.length ? "INCOMPLETE" : weak.length ? "WEAK" : "GREEN";
    receipt.ok = receipt.status === "GREEN";
    receipt.summary = `${receipt.comparisons.length} states checked; ${incomplete.length} incomplete; ${weak.length} weak`;

    const htmlPath = path.join(runDir, "pixel-compare.html");
    await fs.writeFile(htmlPath, makeHtml(receipt), "utf8");
    receipt.html = htmlPath;
  } catch (error) {
    receipt.status = "FAILED";
    receipt.ok = false;
    receipt.error = error.stack || error.message;
  } finally {
    receipt.completed_at = new Date().toISOString();
    await writeJson(receiptPath, receipt);
  }

  console.log(JSON.stringify({ status: receipt.status, ok: receipt.ok, receipt: path.relative(process.cwd(), receiptPath), comparisons: receipt.comparisons.length, summary: receipt.summary }, null, 2));
  if (receipt.status === "FAILED") process.exit(1);
  if (args.get("strict") === "1" && !receipt.ok) process.exit(2);
}

await main();
