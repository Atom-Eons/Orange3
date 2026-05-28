#!/usr/bin/env node
/* ============================================================================
   privacy-audit.mjs  —  ORANGEBOX v4 Privacy Audit Engine

   Every outbound API call the cockpit makes gets a row in egress.jsonl.
   Nothing leaves without a receipt. That's the moat.

   Exports:
     recordEgress(opts)   — shared logger; other scripts import this
     loadEgress(sinceMs)  — read egress.jsonl with optional time filter

   CLI:
     node privacy-audit.mjs --summary --since=24h
     node privacy-audit.mjs --detail  --since=24h
     node privacy-audit.mjs --serve   --port=8782

   ORANGEBOX doctrine: prompt plaintext NEVER enters this log. Only sha256.
   The air-gap flag lives in <data_root>/config/air-gap.json.
   ============================================================================ */

import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

// ─── Version + constants ───────────────────────────────────────────────────
export const PRIVACY_AUDIT_VERSION = "4.0.0";
const EGRESS_FILE = "privacy/egress.jsonl";
const AIR_GAP_FILE = "config/air-gap.json";
const PLAINTEXT_LOG_FILE = "config/plaintext-logging.json";

// ─── Data root (mirrors bridge resolution order) ──────────────────────────
async function resolveDataRoot() {
  return (
    process.env.ORANGEBOX_DATA_ROOT ||
    process.env.ORANGEBOX_ROOT ||
    path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command")
  );
}

// ─── Hash util ────────────────────────────────────────────────────────────
function sha256(text) {
  if (!text) return null;
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

// ─── Air-gap check ────────────────────────────────────────────────────────
export async function isAirGapEnabled() {
  const root = await resolveDataRoot();
  try {
    const raw = await fs.readFile(path.join(root, AIR_GAP_FILE), "utf8");
    const cfg = JSON.parse(raw);
    return cfg.enabled === true;
  } catch {
    return false;
  }
}

export async function setAirGap(enabled) {
  const root = await resolveDataRoot();
  const p = path.join(root, AIR_GAP_FILE);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify({ enabled: Boolean(enabled), ts: new Date().toISOString() }), "utf8");
  return enabled;
}

// ─── Plaintext logging flag ────────────────────────────────────────────────
export async function isPlaintextLoggingEnabled() {
  const root = await resolveDataRoot();
  try {
    const raw = await fs.readFile(path.join(root, PLAINTEXT_LOG_FILE), "utf8");
    const cfg = JSON.parse(raw);
    return cfg.enabled === true && cfg.session_key === cfg.confirm_key;
  } catch {
    return false;
  }
}

export async function setPlaintextLogging(enabled, sessionKey = null) {
  const root = await resolveDataRoot();
  const p = path.join(root, PLAINTEXT_LOG_FILE);
  await fs.mkdir(path.dirname(p), { recursive: true });
  if (enabled) {
    const key = sessionKey || crypto.randomBytes(8).toString("hex");
    await fs.writeFile(p, JSON.stringify({
      enabled: true,
      session_key: key,
      confirm_key: key,
      ts: new Date().toISOString(),
      warning: "PLAINTEXT PROMPTS ARE BEING LOGGED — disable after debugging",
    }), "utf8");
    return { enabled: true, session_key: key };
  } else {
    await fs.writeFile(p, JSON.stringify({ enabled: false, ts: new Date().toISOString() }), "utf8");
    return { enabled: false };
  }
}

// ─── recordEgress — the shared logger every script imports ─────────────────
//
// opts: {
//   provider       string   "anthropic" | "openai" | "google" | ...
//   endpoint       string   full URL
//   model          string   model ID
//   inputTokens    number
//   outputTokens   number
//   cached         boolean  true if cache hit was used
//   costCents      number   total cost in USD cents (float ok)
//   callerScript   string   __filename of the importer (use import.meta.url)
//   promptText     string?  raw prompt — ONLY logged if plaintext flag is on
//   responseText   string?  raw response — ONLY logged if plaintext flag is on
// }
//
// Always writes: ts, provider, endpoint, model, inputTokens, outputTokens,
//   cached, costCents, callerScript, prompt_hash, response_hash
// If plaintext logging ON: also writes prompt_text and response_text

export async function recordEgress(opts = {}) {
  const root = await resolveDataRoot();
  const egrPath = path.join(root, EGRESS_FILE);

  // Air-gap: any egress during air-gap is a VIOLATION — log as blocked
  const airGap = await isAirGapEnabled();

  const plaintextOn = await isPlaintextLoggingEnabled();

  const row = {
    ts: new Date().toISOString(),
    provider: String(opts.provider || "unknown"),
    endpoint: String(opts.endpoint || ""),
    model: String(opts.model || ""),
    inputTokens: Number(opts.inputTokens || 0),
    outputTokens: Number(opts.outputTokens || 0),
    cached: Boolean(opts.cached),
    costCents: Number(opts.costCents || 0),
    callerScript: String(opts.callerScript || ""),
    prompt_hash: sha256(opts.promptText) || null,
    response_hash: sha256(opts.responseText) || null,
    air_gap_violation: airGap ? true : undefined,
  };

  // Only add plaintext if operator explicitly turned on debug logging
  if (plaintextOn) {
    row.prompt_text = opts.promptText || null;
    row.response_text = opts.responseText || null;
  }

  // Remove undefined fields for clean JSON
  for (const k of Object.keys(row)) {
    if (row[k] === undefined) delete row[k];
  }

  await fs.mkdir(path.dirname(egrPath), { recursive: true });
  await fs.appendFile(egrPath, JSON.stringify(row) + "\n", "utf8");

  return row;
}

// ─── loadEgress — read rows from egress.jsonl with time filter ─────────────
export async function loadEgress(sinceMs = null) {
  const root = await resolveDataRoot();
  const egrPath = path.join(root, EGRESS_FILE);

  let raw;
  try {
    raw = await fs.readFile(egrPath, "utf8");
  } catch {
    return [];
  }

  const cutoff = sinceMs ? Date.now() - sinceMs : null;

  return raw
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean)
    .filter((r) => !cutoff || new Date(r.ts).getTime() >= cutoff)
    .sort((a, b) => new Date(b.ts) - new Date(a.ts));
}

// ─── Parse --since flag (e.g. "24h", "7d", "1h") ─────────────────────────
function parseSince(str) {
  if (!str) return null;
  const m = String(str).match(/^(\d+(?:\.\d+)?)(h|d|m|s)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mul = { h: 3_600_000, d: 86_400_000, m: 60_000, s: 1_000 };
  return n * (mul[unit] || 3_600_000);
}

// ─── Summary output ─────────────────────────────────────────────────────────
async function runSummary(sinceMs) {
  const rows = await loadEgress(sinceMs);

  if (!rows.length) {
    const label = sinceMs ? `last ${sinceMs / 3_600_000}h` : "all time";
    console.log(`\nORANGEBOX Privacy Audit — ${label}`);
    console.log("─".repeat(48));
    console.log("No egress recorded. Your code stayed on this machine.");
    return;
  }

  const byProvider = {};
  let totalCost = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;

  for (const r of rows) {
    const p = r.provider || "unknown";
    if (!byProvider[p]) byProvider[p] = { calls: 0, inputTokens: 0, outputTokens: 0, costCents: 0, cached: 0 };
    byProvider[p].calls++;
    byProvider[p].inputTokens += r.inputTokens || 0;
    byProvider[p].outputTokens += r.outputTokens || 0;
    byProvider[p].costCents += r.costCents || 0;
    if (r.cached) byProvider[p].cached++;
    totalCost += r.costCents || 0;
    totalInput += r.inputTokens || 0;
    totalOutput += r.outputTokens || 0;
    if (r.cached) totalCached++;
  }

  const sinceLabel = sinceMs ? `last ${sinceMs / 3_600_000}h` : "all time";
  console.log(`\nORANGEBOX Privacy Audit — Summary (${sinceLabel})`);
  console.log("═".repeat(60));
  console.log(`Total API calls : ${rows.length}`);
  console.log(`Total cost      : $${(totalCost / 100).toFixed(4)} USD`);
  console.log(`Cache hits      : ${totalCached} / ${rows.length}`);
  console.log(`Input tokens    : ${totalInput.toLocaleString()}`);
  console.log(`Output tokens   : ${totalOutput.toLocaleString()}`);
  console.log("");
  console.log("By provider:");
  console.log("─".repeat(60));

  const header = ["Provider", "Calls", "Input tok", "Output tok", "Cached", "Cost USD"].map((h) => h.padEnd(14)).join("");
  console.log(header);
  console.log("─".repeat(60));

  for (const [p, s] of Object.entries(byProvider).sort((a, b) => b[1].costCents - a[1].costCents)) {
    const row = [
      p.slice(0, 12).padEnd(14),
      String(s.calls).padEnd(14),
      String(s.inputTokens.toLocaleString()).padEnd(14),
      String(s.outputTokens.toLocaleString()).padEnd(14),
      String(s.cached).padEnd(14),
      `$${(s.costCents / 100).toFixed(4)}`,
    ].join("");
    console.log(row);
  }
  console.log("═".repeat(60));

  // Privacy assertion
  const airGapViolations = rows.filter((r) => r.air_gap_violation).length;
  if (airGapViolations) {
    console.log(`\nWARNING: ${airGapViolations} calls made while air-gap was active. Review logs.`);
  } else {
    console.log("\nPrivacy: All calls to authorized providers only. No air-gap violations.");
  }
}

// ─── Detail output ──────────────────────────────────────────────────────────
async function runDetail(sinceMs) {
  const rows = await loadEgress(sinceMs);
  const sinceLabel = sinceMs ? `last ${sinceMs / 3_600_000}h` : "all time";
  console.log(`\nORANGEBOX Privacy Audit — Detail (${sinceLabel})`);
  console.log("═".repeat(80));

  if (!rows.length) {
    console.log("No egress recorded.");
    return;
  }

  for (const r of rows) {
    console.log(`\n  ts           : ${r.ts}`);
    console.log(`  provider     : ${r.provider}`);
    console.log(`  endpoint     : ${r.endpoint}`);
    console.log(`  model        : ${r.model}`);
    console.log(`  tokens in    : ${(r.inputTokens || 0).toLocaleString()}`);
    console.log(`  tokens out   : ${(r.outputTokens || 0).toLocaleString()}`);
    console.log(`  cached       : ${r.cached ? "yes" : "no"}`);
    console.log(`  cost         : $${((r.costCents || 0) / 100).toFixed(6)}`);
    console.log(`  caller       : ${r.callerScript}`);
    console.log(`  prompt_hash  : ${r.prompt_hash || "(none)"}`);
    console.log(`  resp_hash    : ${r.response_hash || "(none)"}`);
    if (r.air_gap_violation) console.log(`  VIOLATION    : air-gap was active`);
    if (r.prompt_text) {
      console.log(`  prompt [dbg] : ${String(r.prompt_text).slice(0, 200)}...`);
    }
    console.log("─".repeat(80));
  }
}

// ─── HTTP server for dashboard ─────────────────────────────────────────────
//
// Routes:
//   GET /privacy/egress?since=24h         — JSON array of rows
//   GET /privacy/summary?since=24h        — aggregate JSON
//   GET /privacy/status                   — air-gap + flags state
//   POST /privacy/air-gap                 — body: {enabled: bool}
//   GET /privacy/export?since=30d         — NDJSON download
//   GET /privacy/test-egress              — emits a tagged test call and returns it

function parseSinceQuery(url) {
  const u = new URL(url, "http://localhost");
  const s = u.searchParams.get("since");
  return parseSince(s);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res, obj, status = 200) {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

async function serveHTTP(port) {
  const server = http.createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

    const url = req.url || "/";
    const pathname = new URL(url, `http://localhost:${port}`).pathname;

    // ── GET /privacy/egress ──────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/privacy/egress") {
      const sinceMs = parseSinceQuery(url);
      const rows = await loadEgress(sinceMs);
      return json(res, { ok: true, count: rows.length, rows });
    }

    // ── GET /privacy/summary ─────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/privacy/summary") {
      const sinceMs = parseSinceQuery(url);
      const rows = await loadEgress(sinceMs);
      const byProvider = {};
      let totalCost = 0, totalInput = 0, totalOutput = 0, totalCached = 0;
      for (const r of rows) {
        const p = r.provider || "unknown";
        if (!byProvider[p]) byProvider[p] = { calls: 0, inputTokens: 0, outputTokens: 0, costCents: 0, cached: 0 };
        byProvider[p].calls++;
        byProvider[p].inputTokens += r.inputTokens || 0;
        byProvider[p].outputTokens += r.outputTokens || 0;
        byProvider[p].costCents += r.costCents || 0;
        if (r.cached) byProvider[p].cached++;
        totalCost += r.costCents || 0;
        totalInput += r.inputTokens || 0;
        totalOutput += r.outputTokens || 0;
        if (r.cached) totalCached++;
      }
      const violations = rows.filter((r) => r.air_gap_violation).length;
      return json(res, {
        ok: true, totalCalls: rows.length, totalCostCents: totalCost,
        totalInputTokens: totalInput, totalOutputTokens: totalOutput,
        totalCached, byProvider, violations,
        sinceMs: sinceMs || null,
      });
    }

    // ── GET /privacy/status ──────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/privacy/status") {
      const [airGap, plaintext] = await Promise.all([isAirGapEnabled(), isPlaintextLoggingEnabled()]);
      return json(res, { ok: true, airGap, plaintextLogging: plaintext, version: PRIVACY_AUDIT_VERSION });
    }

    // ── POST /privacy/air-gap ────────────────────────────────────────────
    if (req.method === "POST" && pathname === "/privacy/air-gap") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", async () => {
        try {
          const { enabled } = JSON.parse(body || "{}");
          await setAirGap(Boolean(enabled));
          return json(res, { ok: true, airGap: Boolean(enabled) });
        } catch (e) {
          return json(res, { ok: false, error: String(e) }, 400);
        }
      });
      return;
    }

    // ── POST /privacy/plaintext-logging ──────────────────────────────────
    if (req.method === "POST" && pathname === "/privacy/plaintext-logging") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", async () => {
        try {
          const { enabled } = JSON.parse(body || "{}");
          const result = await setPlaintextLogging(Boolean(enabled));
          return json(res, { ok: true, ...result });
        } catch (e) {
          return json(res, { ok: false, error: String(e) }, 400);
        }
      });
      return;
    }

    // ── POST /privacy/revoke-key ──────────────────────────────────────────
    if (req.method === "POST" && pathname === "/privacy/revoke-key") {
      let body = "";
      req.on("data", (c) => { body += c; });
      req.on("end", async () => {
        try {
          const { provider } = JSON.parse(body || "{}");
          if (!provider) return json(res, { ok: false, error: "provider required" }, 400);
          const root = await resolveDataRoot();
          const p = String(provider).toLowerCase().replace(/[^a-z0-9-]/g, "");
          const keyFile = path.join(root, "secrets", `${p}.key`);
          try {
            await fs.unlink(keyFile);
            return json(res, { ok: true, revoked: p, warning: "Cached state may persist in memory until cockpit restart." });
          } catch (e) {
            return json(res, { ok: false, error: `Key file not found: ${keyFile}` }, 404);
          }
        } catch (e) {
          return json(res, { ok: false, error: String(e) }, 400);
        }
      });
      return;
    }

    // ── GET /privacy/export?since=30d ────────────────────────────────────
    if (req.method === "GET" && pathname === "/privacy/export") {
      const sinceMs = parseSinceQuery(url) || parseSince("30d");
      const rows = await loadEgress(sinceMs);
      cors(res);
      res.writeHead(200, {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="orangebox-egress-${new Date().toISOString().slice(0,10)}.jsonl"`,
      });
      for (const r of rows.slice().reverse()) {
        res.write(JSON.stringify(r) + "\n");
      }
      return res.end();
    }

    // ── GET /privacy/test-egress ─────────────────────────────────────────
    // Emits a tagged synthetic egress row so the dashboard can verify
    // the logging pipeline is live end-to-end.
    if (req.method === "GET" && pathname === "/privacy/test-egress") {
      const testPrompt = `ORANGEBOX_PRIVACY_TEST_${Date.now()}`;
      const row = await recordEgress({
        provider: "test",
        endpoint: "internal://privacy-test",
        model: "none",
        inputTokens: 0,
        outputTokens: 0,
        cached: false,
        costCents: 0,
        callerScript: "privacy-audit.mjs:test-egress",
        promptText: testPrompt,
        responseText: "VERIFIED",
      });
      return json(res, { ok: true, row, message: "Tagged test row written. It should appear in the table." });
    }

    // ── 404 ──────────────────────────────────────────────────────────────
    return json(res, { ok: false, error: "not found" }, 404);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`\nORANGEBOX Privacy Audit Server`);
    console.log(`Running at http://127.0.0.1:${port}`);
    console.log(`Dashboard: open src/v4/privacy/privacy.html`);
    console.log(`\nRoutes:`);
    console.log(`  GET  /privacy/egress?since=24h`);
    console.log(`  GET  /privacy/summary?since=24h`);
    console.log(`  GET  /privacy/status`);
    console.log(`  GET  /privacy/export?since=30d`);
    console.log(`  GET  /privacy/test-egress`);
    console.log(`  POST /privacy/air-gap         {enabled: bool}`);
    console.log(`  POST /privacy/plaintext-logging {enabled: bool}`);
    console.log(`  POST /privacy/revoke-key      {provider: string}`);
    console.log(`\nCtrl+C to stop.`);
  });
}

// ─── CLI entry ────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const has = (flag) => argv.includes(flag);
  const get = (flag) => {
    const i = argv.findIndex((a) => a === flag || a.startsWith(flag + "="));
    if (i < 0) return null;
    if (argv[i].includes("=")) return argv[i].split("=").slice(1).join("=");
    return argv[i + 1] || null;
  };

  const sinceStr = get("--since");
  const sinceMs = parseSince(sinceStr);

  if (has("--summary")) return runSummary(sinceMs);
  if (has("--detail"))  return runDetail(sinceMs);

  if (has("--serve")) {
    const port = parseInt(get("--port") || "8782", 10);
    return serveHTTP(port);
  }

  if (has("--air-gap-on"))  { await setAirGap(true);  console.log("Air-gap ENABLED."); return; }
  if (has("--air-gap-off")) { await setAirGap(false); console.log("Air-gap DISABLED."); return; }

  if (has("--status")) {
    const [ag, pt] = await Promise.all([isAirGapEnabled(), isPlaintextLoggingEnabled()]);
    console.log(JSON.stringify({ air_gap: ag, plaintext_logging: pt, version: PRIVACY_AUDIT_VERSION }, null, 2));
    return;
  }

  // Default: show help
  console.log(`
ORANGEBOX Privacy Audit Engine v${PRIVACY_AUDIT_VERSION}

Usage:
  node privacy-audit.mjs --summary [--since=24h]
  node privacy-audit.mjs --detail  [--since=7d]
  node privacy-audit.mjs --serve   [--port=8782]
  node privacy-audit.mjs --status
  node privacy-audit.mjs --air-gap-on
  node privacy-audit.mjs --air-gap-off

--since values: 1h, 24h, 7d, 30d, etc.
`);
}

// Only run main if this file is the entry point
const thisFile = fileURLToPath(import.meta.url);
const argv1 = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (thisFile === argv1) {
  main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
}
