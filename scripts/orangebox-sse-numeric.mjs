#!/usr/bin/env node
/* ============================================================================
   orangebox-sse-numeric.mjs — SSE (Symbolic Slope Encoding) numeric encoder

   Reads time-series data from structured sources under ORANGEBOX_ROOT,
   compresses to parametric SSE statements, writes to
     memory/orangebox-knowledge-v2/sse-numeric.jsonl

   CLI:
     node scripts/orangebox-sse-numeric.mjs --source receipts   [--project orangebox]
     node scripts/orangebox-sse-numeric.mjs --source party-line [--project orangebox]
     node scripts/orangebox-sse-numeric.mjs --source build-timings [--project orangebox]
     node scripts/orangebox-sse-numeric.mjs --root <path>

   Constraints:
     - Pure Node ESM. No external deps. No LLM calls. No spawned children.
     - RAM-light: streaming directory listing, one file at a time.
     - Writes atomic JSONL — appends to existing file, does not overwrite corpus.

   Disclosure: ATOM-ORANGEBOX-SSE-NUMERIC-2026-0516
   ============================================================================ */

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── CLI args ────────────────────────────────────────────────────────────────
function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const ORANGE_ROOT = process.env.ORANGEBOX_DATA_ROOT
  || process.env.ORANGEBOX_ROOT
  || arg("--root")
  || path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command");

const SOURCE  = arg("--source", "receipts");
const PROJECT = arg("--project", "orangebox");

const OUT_DIR  = path.join(ORANGE_ROOT, "memory", "orangebox-knowledge-v2");
const OUT_FILE = path.join(OUT_DIR, "sse-numeric.jsonl");

// ─── Math helpers (pure, no libs) ────────────────────────────────────────────

function r4(n) { return Math.round(n * 10000) / 10000; }

/** Linear regression over [{t, v}] points. Returns {slope, intercept, r2, sigma, n} */
function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0, sumYY = 0;
  for (const { t, v } of points) {
    sumX += t; sumY += v; sumXX += t * t; sumXY += t * v; sumYY += v * v;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-12) return null;
  const slope     = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  // R²
  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (const { t, v } of points) {
    ssTot += (v - yMean) ** 2;
    ssRes += (v - (slope * t + intercept)) ** 2;
  }
  const r2 = ssTot < 1e-12 ? 1 : 1 - ssRes / ssTot;
  // σ (residual standard deviation)
  const sigma = n > 2 ? Math.sqrt(ssRes / (n - 2)) : 0;
  return { slope: r4(slope), intercept: r4(intercept), r2: r4(r2), sigma: r4(sigma), n };
}

/**
 * Autocorrelation up to maxLag.
 * Returns the lag (in days) with maximum |r| (above threshold), or null.
 */
function dominantPeriod(values, maxLag = 30, threshold = 0.35) {
  const n = values.length;
  if (n < 10) return null;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  if (variance < 1e-12) return null;
  let bestLag = null, bestR = 0;
  for (let lag = 2; lag <= Math.min(maxLag, Math.floor(n / 2)); lag++) {
    let cov = 0;
    for (let i = 0; i < n - lag; i++) {
      cov += (values[i] - mean) * (values[i + lag] - mean);
    }
    cov /= (n - lag);
    const r = cov / variance;
    if (Math.abs(r) > threshold && Math.abs(r) > Math.abs(bestR)) {
      bestR = r;
      bestLag = lag;
    }
  }
  return bestLag !== null ? { lag: bestLag, r: r4(bestR) } : null;
}

/**
 * Simple amplitude estimate for a periodic series.
 */
function periodicAmplitude(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return r4((sorted[sorted.length - 1] - sorted[0]) / 2);
}

/**
 * CUSUM-based regime change detector.
 * Splits the series into windows; detects a jump in σ.
 * Returns array of {t0, t1, mean, sigma} regime blocks, or null if only one regime.
 */
function detectRegimes(points, minWindowDays = 7) {
  if (points.length < minWindowDays * 2) return null;
  const n = points.length;
  // Try splitting at every 1/3 and 2/3 point; pick the split where
  // within-group σ-sum is minimized (simplest variance-minimization).
  let bestSplit = null, bestScore = Infinity;
  const lo = Math.floor(n * 0.2);
  const hi = Math.ceil(n * 0.8);
  for (let s = lo; s <= hi; s++) {
    const a = points.slice(0, s);
    const b = points.slice(s);
    if (a.length < 3 || b.length < 3) continue;
    const sigA = stddev(a.map(p => p.v));
    const sigB = stddev(b.map(p => p.v));
    const score = sigA * a.length + sigB * b.length;
    if (score < bestScore) {
      bestScore = score;
      bestSplit = s;
    }
  }
  if (bestSplit === null) return null;
  const segA = points.slice(0, bestSplit);
  const segB = points.slice(bestSplit);
  const mA   = mean(segA.map(p => p.v));
  const mB   = mean(segB.map(p => p.v));
  const sA   = stddev(segA.map(p => p.v));
  const sB   = stddev(segB.map(p => p.v));
  // Only report a regime change if the means differ by at least 1 σ of the smaller segment
  if (Math.abs(mA - mB) < Math.max(sA, sB) * 0.8) return null;
  return [
    { mean: r4(mA), sigma: r4(sA), t0: isoDay(segA[0].t), t1: isoDay(segA[segA.length - 1].t), n: segA.length },
    { mean: r4(mB), sigma: r4(sB), t0: isoDay(segB[0].t), t1: isoDay(segB[segB.length - 1].t), n: segB.length },
  ];
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / (arr.length || 1); }
function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length || 1));
}

/** Returns ISO date string (YYYY-MM-DD) from a numeric day-offset or ISO string */
function isoDay(t) {
  if (typeof t === "number") {
    const d = new Date(t * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return String(t).slice(0, 10);
}

/** Convert ISO date string to integer day-offset from 2020-01-01 (for regression stability) */
const EPOCH_DAY = Math.floor(new Date("2020-01-01T00:00:00Z").getTime() / 86400000);
function dayOffset(isoStr) {
  const d = new Date(String(isoStr).slice(0, 10) + "T00:00:00Z");
  return Math.floor(d.getTime() / 86400000) - EPOCH_DAY;
}

// ─── Source readers ───────────────────────────────────────────────────────────

/**
 * receipts source:
 *   scan <root>/receipts/<project>/<date-dir>/<file>.json
 *   extract timestamp + verified(1) / blocked(0) from result field
 *   group by day, produce [{t, v}] where v = fraction of verified receipts that day
 */
async function* walkDir(dir, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkDir(p, maxDepth, depth + 1);
    else if (e.isFile()) yield p;
  }
}

async function loadReceiptsPoints(project) {
  const dir = path.join(ORANGE_ROOT, "receipts", project);
  const byDay = new Map(); // day-offset → {verified, total}
  for await (const file of walkDir(dir, 5)) {
    if (!file.endsWith(".json")) continue;
    let obj;
    try { obj = JSON.parse(await fs.readFile(file, "utf8")); } catch { continue; }
    const ts = obj.timestamp || obj.generatedAt || obj.created_at || obj.date || null;
    if (!ts) continue;
    const day = dayOffset(ts);
    if (isNaN(day)) continue;
    const statusVal = () => {
      const s = String(obj.status || obj.result || "").toUpperCase();
      if (s === "VERIFIED" || s === "PASS" || s === "OK" || s === "GREEN") return 1;
      if (s === "BLOCKED" || s === "FAIL" || s === "RED" || s === "ERROR") return 0;
      return 0.5; // neutral
    };
    const cur = byDay.get(day) || { sum: 0, total: 0 };
    cur.sum += statusVal();
    cur.total += 1;
    byDay.set(day, cur);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, { sum, total }]) => ({ t, v: r4(sum / total) }));
}

/**
 * party-line source:
 *   scan <root>/party-line/<project>/messages.jsonl
 *   count messages per day → [{t, v}] where v = message count
 */
async function loadPartyLinePoints(project) {
  const logPath = path.join(ORANGE_ROOT, "party-line", project, "messages.jsonl");
  const byDay = new Map();
  try { await fs.access(logPath); } catch { return []; }
  const rl = createInterface({ input: createReadStream(logPath), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const ts = obj.generatedAt || obj.timestamp || null;
    if (!ts) continue;
    const day = dayOffset(ts);
    if (isNaN(day)) continue;
    byDay.set(day, (byDay.get(day) || 0) + 1);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([t, v]) => ({ t, v }));
}

// build-timings source:
//   scan <root>/receipts/<project>/**\/BUILD_*.json (recursive)
//   extract build_durations.rust_compile_seconds -> [{t, v}]
async function loadBuildTimingsPoints(project) {
  const dir = path.join(ORANGE_ROOT, "receipts", project);
  const points = [];
  for await (const file of walkDir(dir, 6)) {
    if (!/BUILD_.*\.json$/i.test(path.basename(file))) continue;
    let obj;
    try { obj = JSON.parse(await fs.readFile(file, "utf8")); } catch { continue; }
    const secs = obj?.build_durations?.rust_compile_seconds;
    if (typeof secs !== "number") continue;
    const ts = obj.timestamp || obj.generatedAt || null;
    if (!ts) continue;
    const day = dayOffset(ts);
    if (isNaN(day)) continue;
    points.push({ t: day, v: r4(secs) });
  }
  return points.sort((a, b) => a.t - b.t);
}

// ─── SSE encode ───────────────────────────────────────────────────────────────

function encodeSSE(seriesLabel, points) {
  if (points.length < 4) {
    return {
      series: seriesLabel,
      status: "INSUFFICIENT_DATA",
      n: points.length,
      note: "Fewer than 4 data points; skipping SSE encoding."
    };
  }

  const tStart = isoDay(points[0].t);
  const tEnd   = isoDay(points[points.length - 1].t);
  const values = points.map(p => p.v);

  // 1. Trend (linear regression)
  const reg = linearRegression(points);
  const trend = reg
    ? `TS{slope=${reg.slope}, intercept=${reg.intercept}, R²=${reg.r2}, σ=${reg.sigma}, n=${reg.n}, t=[${tStart}..${tEnd}]}`
    : null;

  // 2. Periodicity
  const period = dominantPeriod(values);
  const periodicStr = period
    ? `PERIODIC{f=${r4(1 / period.lag)}/d, lag=${period.lag}d, autocorr=${period.r}, amp=${periodicAmplitude(values)}, t=[${tStart}..${tEnd}]}`
    : null;

  // 3. Regime change
  const regimes = detectRegimes(points);
  const regimeStr = regimes
    ? regimes.map(r => `REGIME{mean=${r.mean}, σ=${r.sigma}, t=[${r.t0}..${r.t1}], n=${r.n}}`).join(" → ")
    : null;

  return {
    series: seriesLabel,
    source: SOURCE,
    project: PROJECT,
    n: points.length,
    tStart,
    tEnd,
    trend,
    periodic: periodicStr,
    regimes: regimeStr,
    encodedAt: new Date().toISOString(),
  };
}

// ─── Entry ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sse-numeric] root=${ORANGE_ROOT} source=${SOURCE} project=${PROJECT}`);

  // Load points based on source
  let points = [];
  if (SOURCE === "receipts") {
    points = await loadReceiptsPoints(PROJECT);
  } else if (SOURCE === "party-line") {
    points = await loadPartyLinePoints(PROJECT);
  } else if (SOURCE === "build-timings") {
    points = await loadBuildTimingsPoints(PROJECT);
  } else {
    console.error(`[sse-numeric] Unknown --source "${SOURCE}". Use: receipts | party-line | build-timings`);
    process.exit(1);
  }

  console.log(`[sse-numeric] loaded ${points.length} data points`);

  const seriesLabel = `${SOURCE}/${PROJECT}`;
  const encoded = encodeSSE(seriesLabel, points);

  // Ensure output dir exists
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Append to JSONL (one line per run, preserves history)
  await fs.appendFile(OUT_FILE, JSON.stringify(encoded) + "\n", "utf8");

  console.log(`[sse-numeric] wrote → ${OUT_FILE}`);
  console.log(`[sse-numeric] trend    : ${encoded.trend || "(none)"}`);
  console.log(`[sse-numeric] periodic : ${encoded.periodic || "(none)"}`);
  console.log(`[sse-numeric] regimes  : ${encoded.regimes || "(none)"}`);

  return encoded;
}

main().catch((e) => { console.error("[sse-numeric] FATAL", e); process.exit(1); });

export { encodeSSE, linearRegression, detectRegimes, dominantPeriod };
