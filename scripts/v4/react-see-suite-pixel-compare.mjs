#!/usr/bin/env node
/* react-see-suite-pixel-compare.mjs - compares source mockups against React proof screenshots. */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { chromiumExecutable } from "./chromium-proof-runner.mjs";

export const REACT_SEE_SUITE_PIXEL_COMPARE_VERSION = "orangebox-react-see-suite-pixel-compare/v5";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
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

function mimeForFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

function imageDataUrl(file) {
  const data = fsSync.readFileSync(file).toString("base64");
  return `data:${mimeForFile(file)};base64,${data}`;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function findLatest72StateRun(proofDir = PROOF_DIR) {
  const entries = await fs.readdir(proofDir, { withFileTypes: true }).catch(() => []);
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith("-react-see-suite-72-state")) continue;
    const runDir = path.join(proofDir, entry.name);
    const firstShot = path.join(runDir, "01-react.jpg");
    if (!fsSync.existsSync(firstShot)) continue;
    const stat = await fs.stat(runDir);
    candidates.push({ runDir, mtimeMs: stat.mtimeMs });
  }

  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (!candidates[0]) {
    throw new Error(`No 72-state proof run found under ${proofDir}`);
  }

  return candidates[0].runDir;
}

async function readManifest(bankRoot) {
  const manifestPath = path.join(bankRoot, "mockup_manifest.json");
  if (!fsSync.existsSync(manifestPath)) {
    throw new Error(`72-state mockup manifest missing: ${manifestPath}`);
  }

  const manifest = await readJson(manifestPath);
  return manifest.map((state) => ({
    ...state,
    idText: String(state.id).padStart(2, "0"),
    sourcePath: path.join(bankRoot, state.file),
  }));
}

function makeCompareSheet({ comparisons, runDir, bankRoot, targetScore, imageAspect }) {
  const cards = comparisons
    .map((item) => {
      const sourceUrl = pathToFileURL(item.source_path).href;
      const appUrl = pathToFileURL(item.app_screenshot_path).href;
      const diffUrl = pathToFileURL(item.diff_path).href;
      const exactClass = item.source_exact ? "is-exact" : "not-exact";
      const hotspots = (item.hotspots || [])
        .slice(0, 4)
        .map((hotspot, index) => {
          const x = (hotspot.x / item.analysis_size.width) * 100;
          const y = (hotspot.y / item.analysis_size.height) * 100;
          const width = (hotspot.width / item.analysis_size.width) * 100;
          const height = (hotspot.height / item.analysis_size.height) * 100;
          return `<i style="left:${x.toFixed(2)}%;top:${y.toFixed(2)}%;width:${width.toFixed(2)}%;height:${height.toFixed(2)}%" title="H${index + 1}"></i>`;
        })
        .join("");
      const hotspotText = (item.hotspots || [])
        .slice(0, 3)
        .map((hotspot, index) => {
          const luma = hotspot.signedLumaDelta == null ? "" : ` luma ${hotspot.signedLumaDelta > 0 ? "+" : ""}${hotspot.signedLumaDelta.toFixed(1)}`;
          return `H${index + 1} ${hotspot.areaPx}px${luma}`;
        })
        .join(" | ");

      return `
        <article class="compare-card compare-card--${escapeHtml(item.theme)} ${exactClass}">
          <header>
            <span>${escapeHtml(item.id)}</span>
            <div>
              <strong>${escapeHtml(item.title)}</strong>
              <em>score ${item.score_1000.toFixed(1)} / 1000 · MAE ${(item.mae * 100).toFixed(2)}% · edge ${(item.edge_mae * 100).toFixed(2)}%</em>
            </div>
          </header>
          <div class="triplet">
            <figure>
              <figcaption>source</figcaption>
              <img src="${sourceUrl}" alt="${escapeHtml(item.title)} source" />
            </figure>
            <figure>
              <figcaption>react</figcaption>
              <div class="hotspot-frame">
                <img src="${appUrl}" alt="${escapeHtml(item.title)} react" />
                ${hotspots}
              </div>
            </figure>
            <figure>
              <figcaption>delta heatmap</figcaption>
              <img src="${diffUrl}" alt="${escapeHtml(item.title)} pixel delta" />
            </figure>
          </div>
          <footer>
            <span>${escapeHtml((item.focus || []).join(" / ") || "global")}</span>
            <b>${item.source_exact ? "source-exact threshold passed" : `below ${targetScore}`}</b>
          </footer>
          ${hotspotText ? `<p class="hotspots">Largest deltas: ${escapeHtml(hotspotText)}</p>` : ""}
        </article>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AE See-Suite Pixel Compare</title>
    <style>
      :root {
        --bg: #030713;
        --panel: rgba(5, 12, 28, 0.92);
        --line: rgba(142, 227, 255, 0.14);
        --text: #edf8ff;
        --muted: rgba(218, 232, 255, 0.66);
        --cyan: #2ffcff;
        --red: #ff3b5f;
        --green: #38ffb3;
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
      main { width: 2500px; padding: 28px; }
      .hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 24px;
        align-items: end;
        margin-bottom: 24px;
      }
      h1 { margin: 0 0 8px; font-size: 36px; letter-spacing: 0; }
      p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
      code { color: var(--cyan); font-family: inherit; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
      .compare-card {
        border: 1px solid var(--line);
        border-radius: 22px;
        background:
          radial-gradient(circle at 0% 0%, rgba(47, 252, 255, 0.08), transparent 32%),
          var(--panel);
        box-shadow: 0 18px 70px rgba(0, 0, 0, 0.42);
        overflow: hidden;
      }
      .compare-card.not-exact { border-color: rgba(255, 59, 95, 0.22); }
      .compare-card.is-exact { border-color: rgba(56, 255, 179, 0.34); }
      .compare-card header {
        height: 72px;
        display: grid;
        grid-template-columns: 44px 1fr;
        gap: 12px;
        align-items: center;
        border-bottom: 1px solid var(--line);
        padding: 0 14px;
      }
      .compare-card header span {
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
      .compare-card strong,
      .compare-card em { display: block; }
      .compare-card strong { font-size: 15px; }
      .compare-card em { margin-top: 4px; color: var(--muted); font-size: 12px; font-style: normal; }
      .triplet {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1px;
        background: rgba(142, 227, 255, 0.1);
      }
      figure { min-width: 0; margin: 0; overflow: hidden; background: #050b18; }
      figcaption {
        padding: 7px 10px;
        color: var(--muted);
        font-size: 10px;
        border-bottom: 1px solid rgba(142, 227, 255, 0.1);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      img { display: block; width: 100%; aspect-ratio: ${imageAspect.width} / ${imageAspect.height}; object-fit: cover; }
      .hotspot-frame { position: relative; }
      .hotspot-frame i {
        position: absolute;
        border: 2px solid rgba(255, 191, 72, 0.92);
        border-radius: 6px;
        box-shadow:
          0 0 0 1px rgba(0,0,0,0.5),
          0 0 18px rgba(255, 191, 72, 0.44);
        pointer-events: none;
      }
      footer {
        display: flex;
        justify-content: space-between;
        gap: 14px;
        padding: 9px 12px;
        color: var(--muted);
        font-size: 10px;
      }
      footer b { color: var(--red); font-weight: 700; }
      .is-exact footer b { color: var(--green); }
      .hotspots {
        border-top: 1px solid rgba(142, 227, 255, 0.08);
        padding: 9px 12px 11px;
        color: rgba(255, 221, 152, 0.78);
        font-size: 11px;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>AE See-Suite Pixel Compare</h1>
          <p>Source/app/delta triplets for the 72-state bank. This is a visual contract lane; source-exact is only true above the configured score.</p>
        </div>
        <p>
          Target score: <code>${targetScore}</code><br />
          Source bank: <code>${escapeHtml(bankRoot)}</code><br />
          Proof run: <code>${escapeHtml(runDir)}</code>
        </p>
      </section>
      <section class="grid">
        ${cards}
      </section>
    </main>
  </body>
</html>`;
}

function makeHotspotCropSheet({ comparisons, runDir, bankRoot, targetScore, analysisSize }) {
  const cropRows = comparisons
    .flatMap((item) =>
      (item.hotspots || []).slice(0, 5).map((hotspot, index) => ({
        item,
        hotspot,
        label: `H${index + 1}`,
      })),
    )
    .map(({ item, hotspot, label }) => {
      const sourceUrl = pathToFileURL(item.source_path).href;
      const appUrl = pathToFileURL(item.app_screenshot_path).href;
      const diffUrl = pathToFileURL(item.diff_path).href;
      const padding = 16;
      const cropX = Math.max(0, hotspot.x - padding);
      const cropY = Math.max(0, hotspot.y - padding);
      const cropW = Math.min(analysisSize.width - cropX, hotspot.width + padding * 2);
      const cropH = Math.min(analysisSize.height - cropY, hotspot.height + padding * 2);
      const zoom = Math.max(1.8, Math.min(4, 260 / Math.max(cropW, cropH)));
      const frameStyle = [
        `--crop-x:${cropX}`,
        `--crop-y:${cropY}`,
        `--crop-w:${cropW}`,
        `--crop-h:${cropH}`,
        `--zoom:${zoom.toFixed(3)}`,
        `--analysis-w:${analysisSize.width}`,
        `--analysis-h:${analysisSize.height}`,
      ].join(";");

      return `
        <article class="crop-card">
          <header>
            <span>${escapeHtml(item.id)}</span>
            <div>
              <strong>${escapeHtml(item.title)} ${escapeHtml(label)}</strong>
              <em>${hotspot.x},${hotspot.y} ${hotspot.width}x${hotspot.height} | area ${hotspot.areaPx}px | mean delta ${hotspot.meanDelta.toFixed(4)} | signed luma ${hotspot.signedLumaDelta > 0 ? "+" : ""}${hotspot.signedLumaDelta.toFixed(1)} | RGB ${hotspot.signedRgbDelta.map((value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}`).join(", ")} | score ${item.score_1000.toFixed(1)} / ${targetScore}</em>
            </div>
          </header>
          <div class="crop-triplet" style="${frameStyle}">
            <figure>
              <figcaption>source crop</figcaption>
              <div class="crop-frame"><img src="${sourceUrl}" alt="${escapeHtml(item.title)} source crop" /></div>
            </figure>
            <figure>
              <figcaption>react crop</figcaption>
              <div class="crop-frame"><img src="${appUrl}" alt="${escapeHtml(item.title)} react crop" /></div>
            </figure>
            <figure>
              <figcaption>delta crop</figcaption>
              <div class="crop-frame"><img src="${diffUrl}" alt="${escapeHtml(item.title)} delta crop" /></div>
            </figure>
          </div>
        </article>
      `;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AE See-Suite Hotspot Crops</title>
    <style>
      :root {
        --bg: #030713;
        --panel: rgba(5, 12, 28, 0.94);
        --line: rgba(142, 227, 255, 0.14);
        --text: #edf8ff;
        --muted: rgba(218, 232, 255, 0.66);
        --cyan: #2ffcff;
        --gold: #ffbf48;
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
      main { width: 2200px; padding: 28px; }
      .hero {
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 24px;
        align-items: end;
        margin-bottom: 18px;
      }
      h1 { margin: 0 0 8px; font-size: 34px; letter-spacing: 0; }
      p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
      code { color: var(--cyan); font-family: inherit; }
      .crop-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .crop-card {
        border: 1px solid var(--line);
        border-radius: 20px;
        background: var(--panel);
        overflow: hidden;
        box-shadow: 0 18px 70px rgba(0, 0, 0, 0.42);
      }
      .crop-card header {
        min-height: 64px;
        display: grid;
        grid-template-columns: 42px 1fr;
        align-items: center;
        gap: 12px;
        border-bottom: 1px solid var(--line);
        padding: 10px 14px;
      }
      .crop-card header span {
        width: 34px;
        height: 34px;
        display: grid;
        place-items: center;
        border: 1px solid var(--cyan);
        border-radius: 999px;
        color: white;
        font-weight: 800;
        background: rgba(47, 252, 255, 0.08);
      }
      strong, em { display: block; }
      strong { font-size: 15px; }
      em { margin-top: 4px; color: var(--muted); font-size: 12px; font-style: normal; }
      .crop-triplet {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1px;
        background: rgba(142, 227, 255, 0.1);
      }
      figure { min-width: 0; margin: 0; overflow: hidden; background: #050b18; }
      figcaption {
        padding: 7px 10px;
        color: var(--muted);
        font-size: 10px;
        border-bottom: 1px solid rgba(142, 227, 255, 0.1);
        text-transform: uppercase;
        letter-spacing: 0.08em;
      }
      .crop-frame {
        position: relative;
        width: 100%;
        height: 245px;
        overflow: hidden;
        background:
          linear-gradient(45deg, rgba(255,255,255,0.04) 25%, transparent 25% 50%, rgba(255,255,255,0.04) 50% 75%, transparent 75%),
          #020713;
        background-size: 18px 18px;
      }
      .crop-frame::after {
        content: "";
        position: absolute;
        left: calc(16px * var(--zoom));
        top: calc(16px * var(--zoom));
        width: calc(var(--crop-w) * 1px * var(--zoom) - 32px * var(--zoom));
        height: calc(var(--crop-h) * 1px * var(--zoom) - 32px * var(--zoom));
        border: 2px solid rgba(255, 191, 72, 0.94);
        border-radius: 8px;
        box-shadow: 0 0 18px rgba(255, 191, 72, 0.38);
        pointer-events: none;
      }
      .crop-frame img {
        display: block;
        width: calc(var(--analysis-w) * 1px * var(--zoom));
        height: calc(var(--analysis-h) * 1px * var(--zoom));
        transform: translate(calc(var(--crop-x) * -1px * var(--zoom)), calc(var(--crop-y) * -1px * var(--zoom)));
        transform-origin: 0 0;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <div>
          <h1>AE See-Suite Hotspot Crops</h1>
          <p>Zoomed source/react/delta crops for the largest measured pixel deltas. Use this sheet to tune exact regions before claiming visual green.</p>
        </div>
        <p>
          Source bank: <code>${escapeHtml(bankRoot)}</code><br />
          Proof run: <code>${escapeHtml(runDir)}</code>
        </p>
      </section>
      <section class="crop-grid">
        ${cropRows}
      </section>
    </main>
  </body>
</html>`;
}

async function compareInBrowser(page, sourcePath, appPath, options) {
  const sourceUrl = imageDataUrl(sourcePath);
  const appUrl = imageDataUrl(appPath);

  return page.evaluate(
    async ({ sourceUrl, appUrl, width, height }) => {
      function loadImage(url) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Image failed to load: ${url}`));
          image.src = url;
        });
      }

      function getImageData(image) {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(image, 0, 0, width, height);
        return ctx.getImageData(0, 0, width, height);
      }

      const [sourceImage, appImage] = await Promise.all([loadImage(sourceUrl), loadImage(appUrl)]);
      const source = getImageData(sourceImage);
      const app = getImageData(appImage);
      const sourceData = source.data;
      const appData = app.data;
      const count = width * height;
      const sourceLuma = new Float32Array(count);
      const appLuma = new Float32Array(count);
      const quadrantTotals = [0, 0, 0, 0];
      const quadrantCounts = [0, 0, 0, 0];
      const deltaMask = new Uint8Array(count);
      const deltaValues = new Float32Array(count);

      let absTotal = 0;
      let squareTotal = 0;
      let lumaAbsTotal = 0;
      let maxDelta = 0;
      let matchedWithin10 = 0;
      let matchedWithin24 = 0;

      const diffCanvas = document.createElement("canvas");
      diffCanvas.width = width;
      diffCanvas.height = height;
      const diffCtx = diffCanvas.getContext("2d");
      const diff = diffCtx.createImageData(width, height);
      const diffData = diff.data;

      for (let i = 0, pixel = 0; i < sourceData.length; i += 4, pixel += 1) {
        const sr = sourceData[i];
        const sg = sourceData[i + 1];
        const sb = sourceData[i + 2];
        const ar = appData[i];
        const ag = appData[i + 1];
        const ab = appData[i + 2];
        const dr = Math.abs(sr - ar);
        const dg = Math.abs(sg - ag);
        const db = Math.abs(sb - ab);
        const delta = (dr + dg + db) / 3;
        const normalized = delta / 255;
        deltaValues[pixel] = normalized;
        if (normalized >= 0.18) deltaMask[pixel] = 1;
        const x = pixel % width;
        const y = Math.floor(pixel / width);
        const quadrant = (x >= width / 2 ? 1 : 0) + (y >= height / 2 ? 2 : 0);
        quadrantTotals[quadrant] += normalized;
        quadrantCounts[quadrant] += 1;

        absTotal += dr + dg + db;
        squareTotal += dr * dr + dg * dg + db * db;
        maxDelta = Math.max(maxDelta, delta);
        if (delta <= 10) matchedWithin10 += 1;
        if (delta <= 24) matchedWithin24 += 1;

        const sl = 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
        const al = 0.2126 * ar + 0.7152 * ag + 0.0722 * ab;
        sourceLuma[pixel] = sl;
        appLuma[pixel] = al;
        lumaAbsTotal += Math.abs(sl - al);

        const heat = Math.min(1, normalized * 3.6);
        diffData[i] = Math.round(24 + heat * 231);
        diffData[i + 1] = Math.round(Math.max(0, 210 - heat * 170));
        diffData[i + 2] = Math.round(Math.max(18, 255 - heat * 210));
        diffData[i + 3] = 255;
      }

      let edgeTotal = 0;
      let edgeCount = 0;
      for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
          const idx = y * width + x;
          const sEdge = Math.abs(sourceLuma[idx] - sourceLuma[idx - 1]) + Math.abs(sourceLuma[idx] - sourceLuma[idx - width]);
          const aEdge = Math.abs(appLuma[idx] - appLuma[idx - 1]) + Math.abs(appLuma[idx] - appLuma[idx - width]);
          edgeTotal += Math.abs(sEdge - aEdge);
          edgeCount += 1;
        }
      }

      diffCtx.putImageData(diff, 0, 0);

      const mae = absTotal / (count * 3 * 255);
      const rmse = Math.sqrt(squareTotal / (count * 3)) / 255;
      const lumaMae = lumaAbsTotal / (count * 255);
      const edgeMae = edgeTotal / Math.max(1, edgeCount * 510);
      const quadrantMae = quadrantTotals.map((total, index) => total / Math.max(1, quadrantCounts[index]));
      const exact10 = matchedWithin10 / count;
      const exact24 = matchedWithin24 / count;
      const visited = new Uint8Array(count);
      const hotspots = [];
      const stack = [];

      for (let start = 0; start < count; start += 1) {
        if (!deltaMask[start] || visited[start]) continue;

        visited[start] = 1;
        stack.length = 0;
        stack.push(start);

        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;
        let area = 0;
        let deltaSum = 0;
        let sourceRedSum = 0;
        let sourceGreenSum = 0;
        let sourceBlueSum = 0;
        let appRedSum = 0;
        let appGreenSum = 0;
        let appBlueSum = 0;
        let sourceLumaSum = 0;
        let appLumaSum = 0;

        while (stack.length) {
          const pixel = stack.pop();
          const x = pixel % width;
          const y = Math.floor(pixel / width);
          const dataIndex = pixel * 4;

          area += 1;
          deltaSum += deltaValues[pixel];
          sourceRedSum += sourceData[dataIndex];
          sourceGreenSum += sourceData[dataIndex + 1];
          sourceBlueSum += sourceData[dataIndex + 2];
          appRedSum += appData[dataIndex];
          appGreenSum += appData[dataIndex + 1];
          appBlueSum += appData[dataIndex + 2];
          sourceLumaSum += sourceLuma[pixel];
          appLumaSum += appLuma[pixel];
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;

          const neighbors = [pixel - 1, pixel + 1, pixel - width, pixel + width];
          for (const next of neighbors) {
            if (next < 0 || next >= count || visited[next] || !deltaMask[next]) continue;
            const nx = next % width;
            if ((next === pixel - 1 || next === pixel + 1) && Math.abs(nx - x) !== 1) continue;
            visited[next] = 1;
            stack.push(next);
          }
        }

        if (area >= 42) {
          const sourceMeanRgb = [sourceRedSum / area, sourceGreenSum / area, sourceBlueSum / area];
          const appMeanRgb = [appRedSum / area, appGreenSum / area, appBlueSum / area];
          const signedRgbDelta = appMeanRgb.map((value, index) => value - sourceMeanRgb[index]);
          const sourceMeanLuma = sourceLumaSum / area;
          const appMeanLuma = appLumaSum / area;
          hotspots.push({
            x: minX,
            y: minY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
            areaPx: area,
            meanDelta: deltaSum / Math.max(1, area),
            sourceMeanRgb,
            appMeanRgb,
            signedRgbDelta,
            sourceMeanLuma,
            appMeanLuma,
            signedLumaDelta: appMeanLuma - sourceMeanLuma,
          });
        }
      }

      hotspots.sort((a, b) => b.areaPx - a.areaPx);

      return {
        mae,
        rmse,
        lumaMae,
        edgeMae,
        maxDelta: maxDelta / 255,
        exact10,
        exact24,
        quadrantMae,
        hotspots: hotspots.slice(0, 8),
        diffPng: diffCanvas.toDataURL("image/png"),
      };
    },
    {
      sourceUrl,
      appUrl,
      width: options.width,
      height: options.height,
    },
  );
}

function scoreMetrics(metrics) {
  const weighted =
    metrics.mae * 0.42 +
    metrics.rmse * 0.22 +
    metrics.lumaMae * 0.16 +
    metrics.edgeMae * 0.12 +
    (1 - metrics.exact24) * 0.08;

  return Math.max(0, Math.min(1000, 1000 * (1 - weighted * 2.2)));
}

export async function runReactSeeSuitePixelCompare({
  runDir = null,
  bankRoot = DEFAULT_BANK_ROOT,
  proofDir = PROOF_DIR,
  states = null,
  targetScore = 950,
  width = 640,
  height = null,
  writeReceipt = true,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });

  const startedAt = new Date().toISOString();
  const sourceRunDir = runDir || (await findLatest72StateRun(proofDir));
  const id = `${stamp()}-react-see-suite-pixel-compare`;
  const outDir = path.join(proofDir, id);
  const diffDir = path.join(outDir, "diffs");
  await fs.mkdir(diffDir, { recursive: true });

  const failures = [];
  const stateFilter = Array.isArray(states) ? new Set(states.map((item) => String(item).padStart(2, "0"))) : states;
  const manifest = (await readManifest(bankRoot)).filter((state) => !stateFilter || stateFilter.has(state.idText));
  if (manifest.length === 0) {
    throw new Error("No source-bank states matched the requested --states filter.");
  }
  const sourceDimensions = readJpegDimensions(manifest[0].sourcePath);
  if (!sourceDimensions) {
    throw new Error(`Unable to read source mockup dimensions: ${manifest[0].sourcePath}`);
  }
  const analysisSize = {
    width: Number(width),
    height: height ? Number(height) : Math.round(Number(width) * sourceDimensions.height / sourceDimensions.width),
  };
  let browser = null;

  try {
    const executablePath = await chromiumExecutable("React AE See-Suite pixel compare");
    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--disable-gpu", "--disable-dev-shm-usage", "--no-sandbox", "--disable-background-networking", "--allow-file-access-from-files"],
    });
    const page = await browser.newPage({ viewport: analysisSize });

    const comparisons = [];
    for (const state of manifest) {
      const appPath = path.join(sourceRunDir, `${state.idText}-react.jpg`);
      const diffPath = path.join(diffDir, `${state.idText}-diff.png`);

      if (!fsSync.existsSync(state.sourcePath)) {
        failures.push({ type: "source_missing", state: state.idText, message: state.sourcePath });
        continue;
      }
      if (!fsSync.existsSync(appPath)) {
        failures.push({ type: "app_missing", state: state.idText, message: appPath });
        continue;
      }

      const metrics = await compareInBrowser(page, state.sourcePath, appPath, analysisSize);
      const score = scoreMetrics(metrics);
      const sourceExact = score >= targetScore;
      const pngBase64 = metrics.diffPng.replace(/^data:image\/png;base64,/, "");
      await fs.writeFile(diffPath, Buffer.from(pngBase64, "base64"));

      comparisons.push({
        id: state.idText,
        title: state.title,
        subtitle: state.subtitle,
        theme: state.theme,
        focus: state.focus,
        source_path: state.sourcePath,
        app_screenshot_path: appPath,
        diff_path: diffPath,
        source_sha256: sha256File(state.sourcePath),
        app_sha256: sha256File(appPath),
        diff_sha256: sha256File(diffPath),
        score_1000: score,
        source_exact: sourceExact,
        mae: metrics.mae,
        rmse: metrics.rmse,
        luma_mae: metrics.lumaMae,
        edge_mae: metrics.edgeMae,
        max_delta: metrics.maxDelta,
        exact10: metrics.exact10,
        exact24: metrics.exact24,
        quadrant_mae: metrics.quadrantMae,
        hotspots: metrics.hotspots,
        analysis_size: analysisSize,
      });
    }

    await page.close();

    const sorted = [...comparisons].sort((a, b) => a.score_1000 - b.score_1000);
    const averageScore = comparisons.reduce((sum, item) => sum + item.score_1000, 0) / Math.max(1, comparisons.length);
    const exactCount = comparisons.filter((item) => item.source_exact).length;
    const htmlPath = path.join(outDir, "pixel-compare.html");
    const sheetPath = path.join(outDir, "pixel-compare.jpg");
    const hotspotHtmlPath = path.join(outDir, "pixel-hotspots.html");
    const hotspotSheetPath = path.join(outDir, "pixel-hotspots.jpg");
    await fs.writeFile(
      htmlPath,
      makeCompareSheet({
        comparisons,
        runDir: sourceRunDir,
        bankRoot,
        targetScore,
        imageAspect: sourceDimensions,
      }),
      "utf8",
    );
    await fs.writeFile(
      hotspotHtmlPath,
      makeHotspotCropSheet({
        comparisons,
        runDir: sourceRunDir,
        bankRoot,
        targetScore,
        analysisSize,
      }),
      "utf8",
    );

    const sheetPage = await browser.newPage({ viewport: { width: 2500, height: 5200 } });
    await sheetPage.goto(pathToFileURL(htmlPath).href, { waitUntil: "load", timeout: 60000 });
    await sheetPage.screenshot({ path: sheetPath, type: "jpeg", quality: 82, fullPage: true, animations: "disabled" });
    await sheetPage.close();

    const hotspotPage = await browser.newPage({ viewport: { width: 2200, height: 7200 } });
    await hotspotPage.goto(pathToFileURL(hotspotHtmlPath).href, { waitUntil: "load", timeout: 60000 });
    await hotspotPage.screenshot({ path: hotspotSheetPath, type: "jpeg", quality: 84, fullPage: true, animations: "disabled" });
    await hotspotPage.close();

    const receiptPath = path.join(RECEIPTS_DIR, `${id}-receipt.json`);
    const result = {
      ok: failures.length === 0,
      source_exact: exactCount === comparisons.length && comparisons.length === manifest.length,
      version: REACT_SEE_SUITE_PIXEL_COMPARE_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      bank_root: bankRoot,
      source_run_dir: sourceRunDir,
      source_dimensions: sourceDimensions,
      requested_states: stateFilter ? Array.from(stateFilter).sort() : null,
      out_dir: outDir,
      diff_dir: diffDir,
      contact_sheet_html: htmlPath,
      contact_sheet_screenshot: sheetPath,
      contact_sheet_sha256: sha256File(sheetPath),
      hotspot_sheet_html: hotspotHtmlPath,
      hotspot_sheet_screenshot: hotspotSheetPath,
      hotspot_sheet_sha256: sha256File(hotspotSheetPath),
      analysis_size: analysisSize,
      target_score_1000: targetScore,
      state_count: comparisons.length,
      source_exact_count: exactCount,
      average_score_1000: Number(averageScore.toFixed(2)),
      worst_score_1000: sorted[0] ? Number(sorted[0].score_1000.toFixed(2)) : null,
      best_score_1000: sorted[sorted.length - 1] ? Number(sorted[sorted.length - 1].score_1000.toFixed(2)) : null,
      worst_states: sorted.slice(0, 12).map((item) => ({
        id: item.id,
        title: item.title,
        theme: item.theme,
        score_1000: Number(item.score_1000.toFixed(2)),
        mae: Number(item.mae.toFixed(5)),
        edge_mae: Number(item.edge_mae.toFixed(5)),
        app_screenshot_path: item.app_screenshot_path,
        diff_path: item.diff_path,
        hotspots: (item.hotspots || []).slice(0, 5).map((hotspot, index) => ({
          label: `H${index + 1} @ ${hotspot.x},${hotspot.y} ${hotspot.width}x${hotspot.height}`,
          x: hotspot.x,
          y: hotspot.y,
          width: hotspot.width,
          height: hotspot.height,
          area_px: hotspot.areaPx,
          mean_delta: Number(hotspot.meanDelta.toFixed(4)),
          source_mean_rgb: hotspot.sourceMeanRgb.map((value) => Number(value.toFixed(2))),
          app_mean_rgb: hotspot.appMeanRgb.map((value) => Number(value.toFixed(2))),
          signed_delta_rgb: hotspot.signedRgbDelta.map((value) => Number(value.toFixed(2))),
          source_luma: Number(hotspot.sourceMeanLuma.toFixed(2)),
          app_luma: Number(hotspot.appMeanLuma.toFixed(2)),
          signed_delta_luma: Number(hotspot.signedLumaDelta.toFixed(2)),
        })),
      })),
      states: comparisons.map((item) => ({
        id: item.id,
        title: item.title,
        theme: item.theme,
        focus: item.focus,
        score_1000: Number(item.score_1000.toFixed(2)),
        source_exact: item.source_exact,
        mae: Number(item.mae.toFixed(5)),
        rmse: Number(item.rmse.toFixed(5)),
        luma_mae: Number(item.luma_mae.toFixed(5)),
        edge_mae: Number(item.edge_mae.toFixed(5)),
        max_delta: Number(item.max_delta.toFixed(5)),
        exact10: Number(item.exact10.toFixed(5)),
        exact24: Number(item.exact24.toFixed(5)),
        quadrant_mae: item.quadrant_mae.map((value) => Number(value.toFixed(5))),
        hotspots: (item.hotspots || []).slice(0, 8).map((hotspot, index) => ({
          label: `H${index + 1}`,
          x: hotspot.x,
          y: hotspot.y,
        width: hotspot.width,
        height: hotspot.height,
        area_px: hotspot.areaPx,
        mean_delta: Number(hotspot.meanDelta.toFixed(4)),
        source_mean_rgb: hotspot.sourceMeanRgb.map((value) => Number(value.toFixed(2))),
        app_mean_rgb: hotspot.appMeanRgb.map((value) => Number(value.toFixed(2))),
        signed_delta_rgb: hotspot.signedRgbDelta.map((value) => Number(value.toFixed(2))),
        source_luma: Number(hotspot.sourceMeanLuma.toFixed(2)),
        app_luma: Number(hotspot.appMeanLuma.toFixed(2)),
        signed_delta_luma: Number(hotspot.signedLumaDelta.toFixed(2)),
      })),
        source_path: item.source_path,
        app_screenshot_path: item.app_screenshot_path,
        diff_path: item.diff_path,
        source_sha256: item.source_sha256,
        app_sha256: item.app_sha256,
        diff_sha256: item.diff_sha256,
      })),
      failures,
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
      source_exact: false,
      version: REACT_SEE_SUITE_PIXEL_COMPARE_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      bank_root: bankRoot,
      source_run_dir: sourceRunDir,
      out_dir: outDir,
      error: error instanceof Error ? error.message : String(error),
      stack: error?.stack ? compact(error.stack, 2200) : null,
      failures: [{ type: "exception", message: error instanceof Error ? error.message : String(error) }, ...failures],
      rollback: "/v4 remains the vanilla rollback surface; /v4/react/ is additive.",
      receipt_path: receiptPath,
    };
    if (writeReceipt) {
      await fs.writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    return result;
  } finally {
    await browser?.close().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = await runReactSeeSuitePixelCompare({
    runDir: args.get("--run-dir") || null,
    bankRoot: args.get("--bank-root") || DEFAULT_BANK_ROOT,
    proofDir: args.get("--proof-dir") || PROOF_DIR,
    states: parseStateIds(args.get("--states")),
    targetScore: Number(args.get("--target-score") || 950),
    width: Number(args.get("--width") || 640),
    height: args.has("--height") ? Number(args.get("--height")) : null,
    writeReceipt: !args.has("--no-receipt"),
  });

  if (args.has("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${REACT_SEE_SUITE_PIXEL_COMPARE_VERSION}`);
    console.log(`source exact: ${result.source_exact ? "YES" : "NO"} ${result.source_exact_count || 0}/${result.state_count || 72}`);
    console.log(`average score: ${result.average_score_1000 ?? "n/a"} / 1000`);
    console.log(`worst score: ${result.worst_score_1000 ?? "n/a"} / 1000`);
    console.log(`contact sheet: ${result.contact_sheet_screenshot || "(none)"}`);
    console.log(`receipt: ${result.receipt_path}`);
    for (const state of result.worst_states || []) {
      console.log(`worst: ${state.id} ${state.score_1000} ${state.title}`);
    }
    for (const failure of result.failures || []) {
      console.log(`failure: ${failure.type} ${failure.state || ""} ${failure.message || ""}`);
    }
  }

  if (!result.ok || (args.has("--enforce") && !result.source_exact)) process.exit(4);
}
