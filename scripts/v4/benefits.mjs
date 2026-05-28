/* benefits.mjs — v6.3.0-alpha.6
 * Aggregates the three PDF benefits from silent-canvas-run receipts. */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const BENEFITS_GATE_VERSION = "silent-canvas-benefits-gate/v1";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function receiptsDir(root = defaultDataRoot()) { return path.join(root, "receipts", "v4"); }

function pct(n, d) { return d ? Math.round((n / d) * 10000) / 100 : null; }
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m-1] + s[m]) / 2); }
function p95(a)    { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length-1, Math.floor(s.length * 0.95))]; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function parseTime(doc, stat = null) {
  const raw = doc.ts || doc.created_at || doc.createdAt || doc.evidence?.created_at || null;
  const t = raw ? Date.parse(raw) : NaN;
  if (Number.isFinite(t)) return t;
  return stat?.mtimeMs || 0;
}
function sourceFamily(source = "") {
  const s = String(source);
  if (s.includes("silent-canvas") || s.includes("surface") || s.includes("canvas")) return "canvas";
  if (s.includes("mcp") || s.includes("connector") || s.includes("ads")) return "connector";
  if (s.includes("relevance") || s.includes("dept") || s.includes("router")) return "reasoning";
  if (s.includes("receipt") || s.includes("proof") || s.includes("ship")) return "proof";
  return s.split("-")[0] || "unknown";
}
function linearEtaHours(current, target, recentCount, windowHours) {
  if (current >= target) return 0;
  if (!recentCount || !windowHours) return null;
  const rate = recentCount / windowHours;
  if (rate <= 0) return null;
  return Math.round(((target - current) / rate) * 10) / 10;
}
function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}
function numericOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function pushThresholdCheck({ failures, warnings, checks, metric, actual, target, comparator, severity = "failure" }) {
  const value = numericOrNull(actual);
  const threshold = numericOrNull(target);
  if (value === null || threshold === null) {
    const item = { metric, status: "missing", actual: value, target: threshold };
    warnings.push(item);
    checks.push(item);
    return;
  }
  const pass = comparator === "gte" ? value >= threshold : value <= threshold;
  const item = { metric, status: pass ? "pass" : severity, actual: value, target: threshold, comparator };
  checks.push(item);
  if (!pass && severity === "failure") failures.push(item);
  if (!pass && severity === "warning") warnings.push(item);
}

async function loadReceipts({ root, limit }) {
  const dir = receiptsDir(root);
  if (!fsSync.existsSync(dir)) return { dir, receipts: [] };
  const files = (await fs.readdir(dir)).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit * 6);
  const receipts = [];
  for (const f of files) {
    try {
      const fp = path.join(dir, f);
      const stat = await fs.stat(fp);
      const text = (await fs.readFile(fp, "utf8")).replace(/^\uFEFF/, "");
      const doc = JSON.parse(text);
      receipts.push({ ...doc, __file: fp, __mtimeMs: stat.mtimeMs, __timeMs: parseTime(doc, stat) });
      if (receipts.length >= limit) break;
    } catch { /* skip */ }
  }
  return { dir, receipts };
}

export async function aggregate({ limit = 100, dataRoot = defaultDataRoot() } = {}) {
  const { dir, receipts } = await loadReceipts({ root: dataRoot, limit });
  if (!fsSync.existsSync(dir)) return { ok: false, error: "no receipts dir yet", data_root: dataRoot };
  const runs = receipts.filter(doc => doc.source === "silent-canvas-run").slice(0, limit);

  const costs = runs.map(r => r.evidence?.benefit_reduced_api_expenses?.total_cost_usd ?? null).filter(v => v !== null);
  const baseline = 0.42;
  const savings = costs.map(c => c === 0 ? 100 : Math.max(0, Math.round((1 - c / baseline) * 100)));
  const lObj    = runs.map(r => r.evidence?.benefit_lower_latency?.latency_ms_objective).filter(v => v);
  const lRoad   = runs.map(r => r.evidence?.benefit_lower_latency?.latency_ms_roadmap).filter(v => v);
  const lFirst  = runs.map(r => r.evidence?.benefit_lower_latency?.latency_ms_first_mutation).filter(v => v);
  const lSum    = runs.map(r => r.evidence?.benefit_lower_latency?.latency_ms_summary).filter(v => v);
  const lTotal  = runs.map(r => r.evidence?.benefit_lower_latency?.latency_ms_total).filter(v => v);
  const parseOk = runs.filter(r => r.evidence?.benefit_consistent_formatting?.parse_success === true).length;
  const parseT  = runs.filter(r => r.evidence?.benefit_consistent_formatting != null).length;
  const schOk   = runs.filter(r => r.evidence?.benefit_consistent_formatting?.schema_valid === true).length;
  const firstOk = runs.filter(r => r.evidence?.benefit_consistent_formatting?.parse_attempt === 1).length;
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const recent24 = receipts.filter(r => r.__timeMs && now - r.__timeMs <= dayMs);
  const recent6 = receipts.filter(r => r.__timeMs && now - r.__timeMs <= 6 * 60 * 60 * 1000);
  const sources = receipts.map(r => r.source || "unknown");
  const uniqueSources = [...new Set(sources)];
  const familyCounts = new Map();
  for (const r of receipts) {
    const fam = sourceFamily(r.source);
    familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
  }
  const sourceCounts = new Map();
  for (const s of sources) sourceCounts.set(s, (sourceCounts.get(s) || 0) + 1);
  const topSources = [...sourceCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([source, count]) => ({ source, count }));
  const mutationSources = receipts.filter(r => /silent-canvas|surface|canvas-compiler|project-graph|ad-rule|mcp-bridge|relevance/i.test(r.source || ""));
  const receiptVelocityScore = clamp(recent24.length * 4, 0, 35);
  const diversityScore = clamp(uniqueSources.length * 4, 0, 25);
  const mutationScore = clamp(mutationSources.length * 2, 0, 20);
  const formatScore = parseT ? clamp(pct(schOk, parseT) / 5, 0, 20) : 5;
  const alivenessScore = Math.round(receiptVelocityScore + diversityScore + mutationScore + formatScore);
  const targetReceipts = 50;

  return {
    ok: true, run_count: runs.length,
    note: runs.length ? null : "no silent-canvas-run receipts yet; organism health is based on all v4 receipts",
    organism_health: {
      aliveness_score: alivenessScore,
      score_basis: {
        receipt_velocity: receiptVelocityScore,
        source_diversity: diversityScore,
        mutation_activity: mutationScore,
        formatting_health: Math.round(formatScore),
      },
      recent_receipts_24h: recent24.length,
      recent_receipts_6h: recent6.length,
      mutation_receipts_count: mutationSources.length,
      mutation_frequency_per_hour_24h: Math.round((recent24.length / 24) * 100) / 100,
      idea_diversity_sources: uniqueSources.length,
      source_families: Object.fromEntries([...familyCounts.entries()].sort((a, b) => b[1] - a[1])),
      top_sources: topSources,
      latest_receipt_at: receipts[0]?.ts || receipts[0]?.created_at || null,
      convergence: {
        target: `alpha proof density (${targetReceipts} recent receipts)`,
        current: receipts.length,
        eta_hours_at_24h_rate: linearEtaHours(receipts.length, targetReceipts, recent24.length, 24),
        confidence: recent24.length >= 5 ? "working" : "thin-data",
      },
    },
    reduced_api_expenses: {
      median_usd_per_run: median(costs), p95_usd_per_run: p95(costs),
      median_savings_pct_vs_opus_baseline: median(savings),
      runs_at_zero_cost: costs.filter(c => c === 0).length,
      baseline_opus_per_run_usd: baseline,
    },
    lower_latency: {
      objective_p50_ms: median(lObj),      objective_p95_ms: p95(lObj),
      roadmap_p50_ms: median(lRoad),       roadmap_p95_ms: p95(lRoad),
      first_mutation_p50_ms: median(lFirst), first_mutation_p95_ms: p95(lFirst),
      summary_p50_ms: median(lSum), total_p50_ms: median(lTotal),
      target_objective_ms: 1500, target_roadmap_ms: 5000, target_first_mutation_ms: 7000,
    },
    consistent_formatting: {
      parse_success_pct: pct(parseOk, parseT),
      schema_valid_pct: pct(schOk, parseT),
      first_try_pct: pct(firstOk, parseT),
      target_pct: 99,
    },
  };
}

export function evaluateBenefitsGate(report, {
  minRuns = 1,
  formatTargetPct = null,
  requireLatency = true,
  requireFormatting = true,
  requireCost = false,
} = {}) {
  const failures = [];
  const warnings = [];
  const checks = [];
  const runCount = report?.run_count || 0;
  const targetPct = formatTargetPct ?? report?.consistent_formatting?.target_pct ?? 99;

  if (!report?.ok) {
    failures.push({ metric: "aggregate", status: "failure", reason: report?.error || "benefits aggregate failed" });
  }

  if (runCount < minRuns) {
    failures.push({
      metric: "run_count",
      status: "thin-data",
      actual: runCount,
      target: minRuns,
      reason: "not enough silent-canvas-run receipts to prove doctrine benefits",
    });
  }

  if (runCount > 0 || minRuns === 0) {
    if (requireFormatting) {
      pushThresholdCheck({
        failures,
        warnings,
        checks,
        metric: "consistent_formatting.parse_success_pct",
        actual: report?.consistent_formatting?.parse_success_pct,
        target: targetPct,
        comparator: "gte",
      });
      pushThresholdCheck({
        failures,
        warnings,
        checks,
        metric: "consistent_formatting.schema_valid_pct",
        actual: report?.consistent_formatting?.schema_valid_pct,
        target: targetPct,
        comparator: "gte",
      });
      pushThresholdCheck({
        failures,
        warnings,
        checks,
        metric: "consistent_formatting.first_try_pct",
        actual: report?.consistent_formatting?.first_try_pct,
        target: targetPct,
        comparator: "gte",
        severity: "warning",
      });
    }

    if (requireLatency) {
      pushThresholdCheck({
        failures,
        warnings,
        checks,
        metric: "lower_latency.objective_p50_ms",
        actual: report?.lower_latency?.objective_p50_ms,
        target: report?.lower_latency?.target_objective_ms,
        comparator: "lte",
      });
      pushThresholdCheck({
        failures,
        warnings,
        checks,
        metric: "lower_latency.roadmap_p50_ms",
        actual: report?.lower_latency?.roadmap_p50_ms,
        target: report?.lower_latency?.target_roadmap_ms,
        comparator: "lte",
      });
      pushThresholdCheck({
        failures,
        warnings,
        checks,
        metric: "lower_latency.first_mutation_p50_ms",
        actual: report?.lower_latency?.first_mutation_p50_ms,
        target: report?.lower_latency?.target_first_mutation_ms,
        comparator: "lte",
      });
    }

    const costSeverity = requireCost ? "failure" : "warning";
    pushThresholdCheck({
      failures,
      warnings,
      checks,
      metric: "reduced_api_expenses.median_savings_pct_vs_opus_baseline",
      actual: report?.reduced_api_expenses?.median_savings_pct_vs_opus_baseline,
      target: 0,
      comparator: "gte",
      severity: costSeverity,
    });
  }

  const hasThinDataFailure = failures.some((x) => x.status === "thin-data");
  const status = failures.length
    ? (hasThinDataFailure && failures.length === 1 ? "thin-data" : "fail")
    : (warnings.length ? "warning" : "pass");

  return {
    ok: failures.length === 0,
    gate: "silent-canvas-benefits-gate",
    gate_version: BENEFITS_GATE_VERSION,
    status,
    min_runs: minRuns,
    run_count: runCount,
    checks,
    warnings,
    failures,
    target_summary: {
      format_target_pct: targetPct,
      objective_p50_ms: report?.lower_latency?.target_objective_ms ?? null,
      roadmap_p50_ms: report?.lower_latency?.target_roadmap_ms ?? null,
      first_mutation_p50_ms: report?.lower_latency?.target_first_mutation_ms ?? null,
      savings_floor_pct: 0,
    },
    organism_health: report?.organism_health || null,
  };
}

export async function runBenefitsGate({
  limit = 100,
  dataRoot = defaultDataRoot(),
  minRuns = 1,
  writeReceipt = false,
  formatTargetPct = null,
  requireLatency = true,
  requireFormatting = true,
  requireCost = false,
} = {}) {
  const aggregateResult = await aggregate({ limit, dataRoot });
  const gate = evaluateBenefitsGate(aggregateResult, {
    minRuns,
    formatTargetPct,
    requireLatency,
    requireFormatting,
    requireCost,
  });
  const result = {
    ok: gate.ok,
    data_root: dataRoot,
    limit,
    aggregate: aggregateResult,
    gate,
  };

  if (writeReceipt) {
    const receiptDir = path.join(ROOT, "receipts");
    await fs.mkdir(receiptDir, { recursive: true });
    const stamp = stampForFile();
    const receiptPath = path.join(receiptDir, `orangebox-silent-canvas-benefits-gate-${stamp}.json`);
    await fs.writeFile(receiptPath, JSON.stringify({
      receipt_id: `orangebox-silent-canvas-benefits-gate-${stamp}`,
      project: "ORANGEBOX",
      scope: "Silent Canvas closed-loop benefits gate",
      timestamp: new Date().toISOString(),
      summary: gate.ok
        ? "Silent Canvas benefits metrics passed the local doctrine gate."
        : `Silent Canvas benefits gate status: ${gate.status}.`,
      result,
    }, null, 2));
    result.receipt_path = receiptPath;
  }

  return result;
}

function readFlag(argv, name, fallback = null) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return argv.includes(`--${name}`) ? true : fallback;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runBenefitsGate({
    writeReceipt: argv.includes("--receipt"),
    limit: parseInt(readFlag(argv, "limit", "100"), 10),
    dataRoot: readFlag(argv, "data-root", defaultDataRoot()),
    minRuns: parseInt(readFlag(argv, "min-runs", "1"), 10),
    formatTargetPct: readFlag(argv, "format-target-pct", null) === null ? null : parseFloat(readFlag(argv, "format-target-pct")),
    requireLatency: !argv.includes("--no-latency"),
    requireFormatting: !argv.includes("--no-formatting"),
    requireCost: argv.includes("--require-cost"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
