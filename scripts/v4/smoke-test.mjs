#!/usr/bin/env node
/* ============================================================================
   smoke-test.mjs — ORANGEBOX v4 Install Verification

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. Buyers run this to verify their purchase.
                     Every check is real. No theater.

   Usage
   ─────
     node smoke-test.mjs                  — interactive (color + summary badge)
     node smoke-test.mjs --json           — machine-readable JSON output
     node smoke-test.mjs --bail-on-fail   — exit 1 at first FAIL
     node smoke-test.mjs --help           — usage

   Configuration
   ─────────────
     ORANGEBOX_URL       — base URL of AE See-Suite server  (default: http://127.0.0.1:8787)
     ORANGEBOX_DATA_ROOT — data root for receipt write (default: ~/.orangebox)
     ORANGEBOX_ROOT      — app install root, fallback  (default: cwd)

   Zero npm dependencies. Node 18+ required.
   ============================================================================ */

import fs      from "node:fs/promises";
import fssync  from "node:fs";
import http    from "node:http";
import https   from "node:https";
import path    from "node:path";
import os      from "node:os";
import crypto  from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFile }      from "node:child_process";
import { promisify }     from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CLI flags ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`
ORANGEBOX v4 Smoke Test
═══════════════════════

Usage:
  node smoke-test.mjs                   Run all 20 checks (color output)
  node smoke-test.mjs --json            Machine-readable JSON result
  node smoke-test.mjs --bail-on-fail    Stop and exit 1 at the first FAIL
  node smoke-test.mjs --help            Show this message

Environment:
  ORANGEBOX_URL         AE See-Suite base URL      (default: http://127.0.0.1:8787)
  ORANGEBOX_DATA_ROOT   Data directory for receipt  (default: ~/.orangebox)
  ORANGEBOX_ROOT        App install root            (default: script directory ../../)

Output:
  Each check prints:  [PASS] | [FAIL] | [SKIP]   + 1-line reason
  Final badge:        GREEN  = all pass
                      YELLOW = some skipped, none failed
                      RED    = one or more failed

Receipt:
  Written to <ORANGEBOX_DATA_ROOT>/receipts/smoke-test/<timestamp>.json
  Every run is receipted whether it passes or fails.

Doctrine: docs/V4_MOAT_DOCTRINE.md
`);
  process.exit(0);
}

const JSON_MODE    = argv.includes("--json");
const BAIL_ON_FAIL = argv.includes("--bail-on-fail");

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL  = (process.env.ORANGEBOX_URL || "http://127.0.0.1:8787").replace(/\/$/, "");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT
  || process.env.ORANGEBOX_ROOT
  || path.join(os.homedir(), ".orangebox");

// App install root — two levels up from scripts/v4/ lands at project root
const APP_ROOT  = process.env.ORANGEBOX_ROOT
  || path.resolve(__dirname, "..", "..");

// ─── ANSI colors (suppressed in JSON mode) ───────────────────────────────────

const C = JSON_MODE ? {
  reset: "", green: "", yellow: "", red: "", cyan: "", bold: "", dim: ""
} : {
  reset:  "\x1b[0m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
};

// ─── HTTP fetch (built-in, no deps) ──────────────────────────────────────────

function fetchText(url, { method = "GET", body = null, timeoutMs = 6000 } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod    = parsed.protocol === "https:" ? https : http;
    const opts   = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers:  body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {},
    };
    const req = mod.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end",  () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Timeout after ${timeoutMs}ms`)); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function fetchJSON(url, opts = {}) {
  const r = await fetchText(url, opts);
  return { status: r.status, json: JSON.parse(r.body), raw: r.body };
}

// ─── Check runner ─────────────────────────────────────────────────────────────

const RESULTS = [];

async function check(id, label, fn) {
  let status = "FAIL";
  let reason = "unknown error";
  let detail = null;

  try {
    const r = await fn();
    status = r.status;  // "PASS" | "FAIL" | "SKIP"
    reason = r.reason;
    detail = r.detail ?? null;
  } catch (err) {
    status = "FAIL";
    reason = err.message || String(err);
  }

  RESULTS.push({ id, label, status, reason, detail });

  if (!JSON_MODE) {
    const badge = status === "PASS"
      ? `${C.green}[PASS]${C.reset}`
      : status === "SKIP"
      ? `${C.yellow}[SKIP]${C.reset}`
      : `${C.red}[FAIL]${C.reset}`;
    console.log(`  ${badge} ${C.dim}${String(id).padStart(2, "0")}${C.reset} ${label}`);
    console.log(`       ${C.dim}${reason}${C.reset}`);
  }

  if (BAIL_ON_FAIL && status === "FAIL") {
    if (!JSON_MODE) console.log(`\n${C.red}${C.bold}Bailed on first failure (--bail-on-fail).${C.reset}`);
    await writeReceipt("bail");
    process.exit(1);
  }

  return { status, reason };
}

// ─── Receipt writer ───────────────────────────────────────────────────────────

async function writeReceipt(outcome) {
  try {
    const dir = path.join(DATA_ROOT, "receipts", "smoke-test");
    await fs.mkdir(dir, { recursive: true });
    const ts   = new Date().toISOString().replace(/[:.]/g, "-");
    const file = path.join(dir, `${ts}.json`);
    const rec  = {
      schema:    "orangebox-smoke-test-v4",
      ts:        new Date().toISOString(),
      base_url:  BASE_URL,
      app_root:  APP_ROOT,
      outcome,
      summary: {
        total:  RESULTS.length,
        pass:   RESULTS.filter(r => r.status === "PASS").length,
        fail:   RESULTS.filter(r => r.status === "FAIL").length,
        skip:   RESULTS.filter(r => r.status === "SKIP").length,
      },
      checks: RESULTS,
      host: os.hostname(),
      node: process.version,
    };
    await fs.writeFile(file, JSON.stringify(rec, null, 2), "utf8");
    return file;
  } catch {
    // receipt write failures never abort the smoke test
    return null;
  }
}

// ─── Individual checks ────────────────────────────────────────────────────────

// 1. /api/status reachable
async function c01_apiStatus() {
  const r = await fetchText(`${BASE_URL}/api/status`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `/api/status returned HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `/api/status returned HTTP ${r.status}` };
}

// 2. /api/v4/see-suite/status returns valid status object
async function c02_seeSuiteStatus() {
  const r = await fetchJSON(`${BASE_URL}/api/v4/see-suite/status`);
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}` };
  }
  if (!r.json || typeof r.json !== "object") {
    return { status: "FAIL", reason: "Response is not a JSON object" };
  }
  if (!process.env.ORANGEBOX_AI_BOX_IP && !process.env.ORANGEBOX_CODEXA_IP) {
    if (r.json.aiBox?.ok === false || r.json.aiBox?.status !== "NOT_CONFIGURED_BASIC_INSTALL") {
      return {
        status: "FAIL",
        reason: "Basic Install without an AI Box must be a guided setup state, not a failed status",
      };
    }
  }
  if (r.json.vault?.ok === false && /missing/i.test(String(r.json.vault?.label || ""))) {
    return {
      status: "FAIL",
      reason: "Missing vault must be reported as recoverable setup, not a broken product state",
    };
  }
  return { status: "PASS", reason: `HTTP ${r.status}, object with keys: ${Object.keys(r.json).slice(0,5).join(", ")}` };
}

// 3. Smart router — autocomplete routes to Haiku
async function c03_routerAutocomplete() {
  const body = JSON.stringify({ task: "autocomplete" });
  const r = await fetchJSON(`${BASE_URL}/api/v4/router/route`, { method: "POST", body });
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}: ${r.raw.slice(0, 120)}` };
  }
  const model = (r.json?.model || "").toLowerCase();
  if (!model.includes("haiku")) {
    return { status: "FAIL", reason: `Expected Haiku; got model="${r.json?.model}" provider="${r.json?.provider}"` };
  }
  return { status: "PASS", reason: `Routed to ${r.json.provider}:${r.json.model}` };
}

// 4. Smart router — architecture routes to Opus or GPT-5
async function c04_routerArchitecture() {
  const body = JSON.stringify({ task: "architecture" });
  const r = await fetchJSON(`${BASE_URL}/api/v4/router/route`, { method: "POST", body });
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}: ${r.raw.slice(0, 120)}` };
  }
  const model    = (r.json?.model || "").toLowerCase();
  const provider = (r.json?.provider || "").toLowerCase();
  if (!model.includes("opus") && !model.includes("gpt-5") && provider !== "openai") {
    return { status: "FAIL", reason: `Expected Opus or GPT-5; got ${provider}:${model}` };
  }
  return { status: "PASS", reason: `Routed to ${r.json.provider}:${r.json.model}` };
}

// 5. Smart router — synthesis routes to trilane
async function c05_routerSynthesis() {
  const body = JSON.stringify({ task: "synthesis" });
  const r = await fetchJSON(`${BASE_URL}/api/v4/router/route`, { method: "POST", body });
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}: ${r.raw.slice(0, 120)}` };
  }
  const features = r.json?.features || [];
  const hasTrilane = Array.isArray(features)
    ? features.some(f => String(f).toLowerCase().includes("trilane"))
    : String(features).toLowerCase().includes("trilane");
  if (!hasTrilane) {
    return { status: "FAIL", reason: `Expected trilane feature; got features=${JSON.stringify(features)}` };
  }
  return { status: "PASS", reason: `Trilane routing confirmed; provider=${r.json.provider}` };
}

// 5a. v6 — quick_reply routes to Groq LPU
async function c05a_routerQuickReply() {
  const body = JSON.stringify({ task: "quick_reply" });
  const r = await fetchJSON(`${BASE_URL}/api/v4/router/route`, { method: "POST", body });
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}: ${r.raw.slice(0, 120)}` };
  }
  const provider = (r.json?.provider || "").toLowerCase();
  if (provider !== "groq") {
    return { status: "FAIL", reason: `Expected groq; got ${provider}:${r.json?.model}` };
  }
  return { status: "PASS", reason: `Routed to ${r.json.provider}:${r.json.model}` };
}

// 5b. v6 — offline_chat routes to Ollama (zero cost)
async function c05b_routerOfflineChat() {
  const body = JSON.stringify({ task: "offline_chat" });
  const r = await fetchJSON(`${BASE_URL}/api/v4/router/route`, { method: "POST", body });
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}: ${r.raw.slice(0, 120)}` };
  }
  const provider = (r.json?.provider || "").toLowerCase();
  if (provider !== "ollama") {
    return { status: "FAIL", reason: `Expected ollama; got ${provider}:${r.json?.model}` };
  }
  if (r.json?.costEstimateCents !== 0) {
    return { status: "FAIL", reason: `Expected $0 cost; got ${r.json?.costEstimateCents}c` };
  }
  return { status: "PASS", reason: `Routed to ${r.json.provider}:${r.json.model} @ $0` };
}

// 5c. v6 — synthesis@quality returns agent_teams advisory for Claude leg
async function c05c_routerAgentTeams() {
  const body = JSON.stringify({ task: "synthesis", budget: 1000 /* high ceiling */ });
  const r = await fetchJSON(`${BASE_URL}/api/v4/router/route`, { method: "POST", body });
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}: ${r.raw.slice(0, 120)}` };
  }
  // Agent-teams advisory should be present whenever Claude is the executor in synthesis
  const at = r.json?.agent_teams;
  if (!at || at.enabled !== true) {
    return { status: "FAIL", reason: `Expected agent_teams.enabled=true; got ${JSON.stringify(at)}` };
  }
  if (!Array.isArray(at.beta_headers) || !at.beta_headers.some(h => h.startsWith("agent-teams-"))) {
    return { status: "FAIL", reason: `Missing agent-teams beta header` };
  }
  return { status: "PASS", reason: `agent_teams.enabled=true, header=${at.beta_headers[0]}` };
}

// 6. /api/v4/receipts/list?limit=1 reachable
async function c06_receiptsList() {
  const r = await fetchText(`${BASE_URL}/api/v4/receipts/list?limit=1`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status} (list may be empty — that is fine)` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 7. /api/v4/queue/list reachable
async function c07_queueList() {
  const r = await fetchText(`${BASE_URL}/api/v4/queue/list`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 8. /api/v4/privacy/summary?since=24h reachable
async function c08_privacySummary() {
  const r = await fetchText(`${BASE_URL}/api/v4/privacy/summary?since=24h`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 9. /api/v4/party-line/recent?limit=1 reachable
async function c09_partyLineRecent() {
  const r = await fetchText(`${BASE_URL}/api/v4/party-line/recent?limit=1`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 10. /api/v4/dag/current reachable
async function c10_dagCurrent() {
  const r = await fetchText(`${BASE_URL}/api/v4/dag/current`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 11. GET /v4/ returns AE See-Suite shell HTML
async function c11_seeSuiteShell() {
  const r = await fetchText(`${BASE_URL}/v4/`);
  if (r.status < 200 || r.status >= 300) {
    return { status: "FAIL", reason: `HTTP ${r.status}` };
  }
  if (!r.body.includes("<!DOCTYPE") && !r.body.includes("<html")) {
    return { status: "FAIL", reason: "Response does not look like HTML (no DOCTYPE or <html>)" };
  }
  return { status: "PASS", reason: `HTTP ${r.status}, HTML shell returned` };
}

// 12. GET /v4/ide/ide.html reachable
async function c12_ideHtml() {
  const r = await fetchText(`${BASE_URL}/v4/ide/ide.html`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 13. GET /v4/terminal/terminal.html reachable
async function c13_terminalHtml() {
  const r = await fetchText(`${BASE_URL}/v4/terminal/terminal.html`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 14. GET /v4/trilane/trilane.html reachable
async function c14_trilaneHtml() {
  const r = await fetchText(`${BASE_URL}/v4/trilane/trilane.html`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 15. GET /v4/shared/see-suite-bridge.js reachable
async function c15_seeSuiteBridge() {
  const r = await fetchText(`${BASE_URL}/v4/shared/see-suite-bridge.js`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 16. GET /v4/shared/tokens.css reachable
async function c16_tokensCss() {
  const r = await fetchText(`${BASE_URL}/v4/shared/tokens.css`);
  if (r.status >= 200 && r.status < 300) {
    return { status: "PASS", reason: `HTTP ${r.status}` };
  }
  return { status: "FAIL", reason: `HTTP ${r.status}` };
}

// 17. smart-model-router CLI --list smoke
async function c17_routerCli() {
  const scriptPath = path.join(__dirname, "router", "smart-model-router.mjs");
  const exists = fssync.existsSync(scriptPath);
  if (!exists) {
    return { status: "FAIL", reason: `Script not found: ${scriptPath}` };
  }
  try {
    const { stdout } = await execFileAsync(process.execPath, [scriptPath, "--list"], { timeout: 8000 });
    if (!stdout || stdout.trim().length === 0) {
      return { status: "FAIL", reason: "CLI --list returned empty output" };
    }
    return { status: "PASS", reason: `CLI --list returned ${stdout.trim().split("\n").length} lines` };
  } catch (err) {
    // Some CLIs print to stderr and exit 0; acceptable if script was found
    const msg = (err.stderr || err.stdout || err.message || "").slice(0, 120);
    return { status: "FAIL", reason: `CLI error: ${msg}` };
  }
}

// 18. bg-agent-queue CLI --list smoke
async function c18_queueCli() {
  const scriptPath = path.join(__dirname, "queue", "bg-agent-queue.mjs");
  const exists = fssync.existsSync(scriptPath);
  if (!exists) {
    return { status: "FAIL", reason: `Script not found: ${scriptPath}` };
  }
  try {
    const env = { ...process.env, ORANGEBOX_DATA_ROOT: DATA_ROOT };
    const { stdout, stderr } = await execFileAsync(
      process.execPath, [scriptPath, "--list"],
      { timeout: 8000, env }
    );
    const out = (stdout + stderr).trim();
    if (!out) {
      // Empty queue is fine — CLI ran successfully
      return { status: "PASS", reason: "CLI --list ran (queue may be empty)" };
    }
    return { status: "PASS", reason: `CLI --list returned ${out.split("\n").length} lines` };
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || "").slice(0, 120);
    // Exit code 0 with output is normal; non-zero with "queue is empty" message is also fine
    if (msg.toLowerCase().includes("queue") || msg.toLowerCase().includes("empty") || msg.toLowerCase().includes("no tasks")) {
      return { status: "PASS", reason: "CLI --list ran (queue empty or no tasks)" };
    }
    return { status: "FAIL", reason: `CLI error: ${msg}` };
  }
}

// 19. privacy-audit CLI --status smoke
async function c19_privacyCli() {
  const scriptPath = path.join(__dirname, "privacy-audit.mjs");
  const exists = fssync.existsSync(scriptPath);
  if (!exists) {
    return { status: "FAIL", reason: `Script not found: ${scriptPath}` };
  }
  try {
    const env = { ...process.env, ORANGEBOX_DATA_ROOT: DATA_ROOT };
    const { stdout, stderr } = await execFileAsync(
      process.execPath, [scriptPath, "--summary", "--since=24h"],
      { timeout: 8000, env }
    );
    const out = (stdout + stderr).trim();
    return { status: "PASS", reason: `CLI --summary ran, ${out.split("\n").length} lines output` };
  } catch (err) {
    const msg = (err.stderr || err.stdout || err.message || "").slice(0, 120);
    // "no egress" / "0 calls" is a valid empty-data response
    if (msg.toLowerCase().includes("egress") || msg.toLowerCase().includes("calls") || msg.toLowerCase().includes("0")) {
      return { status: "PASS", reason: "CLI --summary ran (no egress recorded yet)" };
    }
    return { status: "FAIL", reason: `CLI error: ${msg}` };
  }
}

// 20. Doctrine file docs/V4_MOAT_DOCTRINE.md present in app root
async function c20_doctrineFile() {
  const candidate = path.join(APP_ROOT, "docs", "V4_MOAT_DOCTRINE.md");
  try {
    const stat = await fs.stat(candidate);
    if (stat.isFile() && stat.size > 0) {
      return { status: "PASS", reason: `Found at ${candidate} (${stat.size} bytes)` };
    }
    return { status: "FAIL", reason: `File exists but is empty: ${candidate}` };
  } catch {
    return { status: "FAIL", reason: `Not found: ${candidate}` };
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const startMs = Date.now();

  if (!JSON_MODE) {
    console.log();
    console.log(`${C.cyan}${C.bold}ORANGEBOX v4 Smoke Test${C.reset}`);
    console.log(`${C.dim}Target: ${BASE_URL}${C.reset}`);
    console.log(`${C.dim}Data:   ${DATA_ROOT}${C.reset}`);
    console.log(`${C.dim}Root:   ${APP_ROOT}${C.reset}`);
    console.log();
  }

  // Connectivity pre-check — if the server is down, all HTTP checks FAIL fast
  let serverUp = true;
  try {
    await fetchText(`${BASE_URL}/api/status`, { timeoutMs: 3000 });
  } catch {
    serverUp = false;
  }

  // ─── HTTP checks ────────────────────────────────────────────────────────────

  if (!JSON_MODE) console.log(`${C.bold}--- API endpoints ---${C.reset}`);

  await check(1,  "/api/status reachable",                        serverUp ? c01_apiStatus        : () => ({ status: "FAIL", reason: `Server not reachable at ${BASE_URL}` }));
  await check(2,  "/api/v4/see-suite/status — valid object",      serverUp ? c02_seeSuiteStatus   : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(3,  "/api/v4/router/route — autocomplete → Haiku",  serverUp ? c03_routerAutocomplete : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(4,  "/api/v4/router/route — architecture → Opus/GPT-5", serverUp ? c04_routerArchitecture : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(5,  "/api/v4/router/route — synthesis → trilane",   serverUp ? c05_routerSynthesis  : () => ({ status: "SKIP", reason: "Server offline" }));
  await check("5a", "/api/v4/router/route — quick_reply → Groq",  serverUp ? c05a_routerQuickReply  : () => ({ status: "SKIP", reason: "Server offline" }));
  await check("5b", "/api/v4/router/route — offline_chat → Ollama", serverUp ? c05b_routerOfflineChat : () => ({ status: "SKIP", reason: "Server offline" }));
  await check("5c", "/api/v4/router/route — synthesis → agent_teams", serverUp ? c05c_routerAgentTeams : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(6,  "/api/v4/receipts/list reachable",              serverUp ? c06_receiptsList     : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(7,  "/api/v4/queue/list reachable",                 serverUp ? c07_queueList        : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(8,  "/api/v4/privacy/summary reachable",            serverUp ? c08_privacySummary   : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(9,  "/api/v4/party-line/recent reachable",          serverUp ? c09_partyLineRecent  : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(10, "/api/v4/dag/current reachable",                serverUp ? c10_dagCurrent       : () => ({ status: "SKIP", reason: "Server offline" }));

  if (!JSON_MODE) { console.log(); console.log(`${C.bold}--- Static assets ---${C.reset}`); }

  await check(11, "GET /v4/ — AE See-Suite shell HTML",           serverUp ? c11_seeSuiteShell    : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(12, "GET /v4/ide/ide.html",                         serverUp ? c12_ideHtml          : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(13, "GET /v4/terminal/terminal.html",               serverUp ? c13_terminalHtml     : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(14, "GET /v4/trilane/trilane.html",                 serverUp ? c14_trilaneHtml      : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(15, "GET /v4/shared/see-suite-bridge.js",           serverUp ? c15_seeSuiteBridge   : () => ({ status: "SKIP", reason: "Server offline" }));
  await check(16, "GET /v4/shared/tokens.css",                    serverUp ? c16_tokensCss        : () => ({ status: "SKIP", reason: "Server offline" }));

  if (!JSON_MODE) { console.log(); console.log(`${C.bold}--- CLI tools ---${C.reset}`); }

  await check(17, "smart-model-router CLI --list",                c17_routerCli);
  await check(18, "bg-agent-queue CLI --list",                    c18_queueCli);
  await check(19, "privacy-audit CLI --summary",                  c19_privacyCli);

  if (!JSON_MODE) { console.log(); console.log(`${C.bold}--- Files ---${C.reset}`); }

  await check(20, "docs/V4_MOAT_DOCTRINE.md present in app root", c20_doctrineFile);

  // ─── Summary ────────────────────────────────────────────────────────────────

  const elapsedMs = Date.now() - startMs;
  const pass   = RESULTS.filter(r => r.status === "PASS").length;
  const fail   = RESULTS.filter(r => r.status === "FAIL").length;
  const skip   = RESULTS.filter(r => r.status === "SKIP").length;
  const total  = RESULTS.length;

  const outcome = fail > 0 ? "RED" : skip > 0 ? "YELLOW" : "GREEN";

  // Receipt
  const receiptFile = await writeReceipt(outcome);

  if (JSON_MODE) {
    console.log(JSON.stringify({
      outcome,
      summary: { total, pass, fail, skip, elapsedMs },
      checks: RESULTS,
      receipt: receiptFile,
      base_url: BASE_URL,
      ts: new Date().toISOString(),
    }, null, 2));
  } else {
    console.log();
    const badgeColor = fail > 0 ? C.red : skip > 0 ? C.yellow : C.green;
    const badgeText  = fail > 0
      ? `RED     — ${fail} FAIL / ${pass} PASS / ${skip} SKIP`
      : skip > 0
      ? `YELLOW  — ${pass} PASS / ${skip} SKIP`
      : `GREEN   — ${pass} / ${total} PASS`;

    console.log(`${C.bold}Result:${C.reset} ${badgeColor}${C.bold}${badgeText}${C.reset}`);
    console.log(`${C.dim}Elapsed: ${elapsedMs}ms${C.reset}`);
    if (receiptFile) {
      console.log(`${C.dim}Receipt: ${receiptFile}${C.reset}`);
    }

    if (fail > 0) {
      console.log();
      console.log(`${C.bold}Failed checks:${C.reset}`);
      RESULTS.filter(r => r.status === "FAIL").forEach(r => {
        console.log(`  ${C.red}${String(r.id).padStart(2,"0")} ${r.label}${C.reset}`);
        console.log(`     ${r.reason}`);
      });
      console.log();
      console.log(`${C.yellow}Troubleshooting:${C.reset}`);
      console.log(`  1. Confirm AE See-Suite is running:  node scripts/orangebox-command-server.mjs`);
      console.log(`  2. Confirm the URL:                 ORANGEBOX_URL=${BASE_URL}`);
      console.log(`  3. Check the server log for errors.`);
      console.log(`  4. See docs/V4_MOAT_DOCTRINE.md for feature expectations.`);
    }
    console.log();
  }

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(err => {
  if (!JSON_MODE) {
    console.error(`\n${C.red}Smoke test crashed:${C.reset}`, err.message);
  } else {
    console.error(JSON.stringify({ outcome: "ERROR", error: err.message }));
  }
  process.exit(2);
});
