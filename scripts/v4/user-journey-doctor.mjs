#!/usr/bin/env node
/* user-journey-doctor.mjs - ORANGEBOX box-map user simulation gate.
 *
 * This doctor is intentionally user-shaped: it checks whether the named
 * product journeys are visible, actionable, and backed by proof instead of
 * merely checking that files exist.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const USER_JOURNEY_DOCTOR_VERSION = "orangebox-user-journey-doctor/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function compact(value, max = 1600) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function statusFrom(ok, warnings = []) {
  if (!ok) return "fail";
  return warnings.length ? "watch" : "pass";
}

function requestRaw(baseUrl, endpoint, { method = "GET", body = null, timeoutMs = 12000 } = {}) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, baseUrl);
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(url, {
      method,
      timeout: timeoutMs,
      headers: payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {},
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, text: data }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err?.message || String(err), text: "" }));
    if (payload) req.write(payload);
    req.end();
  });
}

async function requestJson(baseUrl, endpoint, options = {}) {
  const raw = await requestRaw(baseUrl, endpoint, options);
  if (!raw.ok) return { ...raw, json: null };
  try {
    return { ...raw, json: JSON.parse(raw.text || "{}") };
  } catch (err) {
    return { ...raw, ok: false, error: `invalid JSON: ${err.message}`, json: null };
  }
}

async function runNode(args, timeoutMs = 120000) {
  try {
    const res = await execFileAsync(process.execPath, args, {
      cwd: ROOT,
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    let json = null;
    try { json = JSON.parse(res.stdout || "{}"); } catch {}
    return { ok: true, stdout: compact(res.stdout), stderr: compact(res.stderr), json };
  } catch (err) {
    let json = null;
    try { json = JSON.parse(err.stdout || "{}"); } catch {}
    return {
      ok: false,
      error: err?.message || String(err),
      stdout: compact(err.stdout),
      stderr: compact(err.stderr),
      json,
    };
  }
}

async function latestReceipt(pattern) {
  const files = fsSync.existsSync(RECEIPTS_DIR)
    ? fsSync.readdirSync(RECEIPTS_DIR).filter((name) => pattern.test(name)).map((name) => path.join(RECEIPTS_DIR, name))
    : [];
  files.sort((a, b) => fsSync.statSync(b).mtimeMs - fsSync.statSync(a).mtimeMs);
  const file = files[0] || null;
  if (!file) return null;
  try {
    const json = JSON.parse(await fs.readFile(file, "utf8"));
    return { file, ok: json.ok === true, summary: json.summary || null, created_at: json.created_at || json.generated_at || null, json };
  } catch (err) {
    return { file, ok: false, error: err.message, summary: null, created_at: null };
  }
}

function domJourney({ id, label, raw, required }) {
  const missing = required.filter((pattern) => !pattern.test(raw.text || "")).map((pattern) => pattern.source);
  const ok = raw.ok && missing.length === 0;
  return {
    id,
    label,
    status: statusFrom(ok),
    ok,
    evidence: {
      http_ok: raw.ok,
      status: raw.status,
      bytes: raw.text?.length || 0,
      sha256: sha256Text(raw.text || ""),
      missing_required_text: missing,
    },
    user_blocker: ok ? null : `User cannot complete ${label}: page missing ${missing.join(", ") || raw.error || raw.status}.`,
    recovery: ok ? "No recovery needed." : "Open the page locally, restore the missing product section, then rerun visual proof.",
  };
}

function commandJourney({ id, label, result, proofKey = "ok" }) {
  const body = result.json || {};
  const ok = result.ok && body?.[proofKey] === true;
  const warnings = ok && Number(body.summary?.warnings || body.warnings?.length || 0) > 0 ? ["warnings present"] : [];
  return {
    id,
    label,
    status: statusFrom(ok, warnings),
    ok,
    evidence: {
      command_ok: result.ok,
      json_ok: body?.[proofKey] ?? null,
      summary: body.summary || null,
      receipt_path: body.receipt_path || null,
      stdout_tail: result.ok ? null : result.stdout,
      stderr_tail: result.ok ? null : result.stderr,
      error: result.error || null,
    },
    user_blocker: ok ? null : `User cannot trust ${label}: command proof failed or did not return ok=true.`,
    recovery: ok ? "No recovery needed." : "Open the command receipt/stdout, fix the failing doctor, then rerun this journey doctor.",
  };
}

function receiptJourney({ id, label, receipt }) {
  const ok = receipt?.ok === true;
  return {
    id,
    label,
    status: statusFrom(ok),
    ok,
    evidence: {
      receipt_path: receipt?.file || null,
      created_at: receipt?.created_at || null,
      summary: receipt?.summary || null,
      error: receipt?.error || null,
    },
    user_blocker: ok ? null : `User lacks current proof for ${label}.`,
    recovery: ok ? "No recovery needed." : "Run the matching visual proof with --receipt so the user journey has screenshot evidence.",
  };
}

export async function runUserJourneyDoctor({
  writeReceipt = false,
  baseUrl = `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
  full = false,
} = {}) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const started = new Date().toISOString();
  const journeys = [];

  const [status, seeSuite, operations, firstRun] = await Promise.all([
    requestJson(baseUrl, "/api/status?fast=1", { timeoutMs: 10000 }),
    requestRaw(baseUrl, "/v4/index.html", { timeoutMs: 10000 }),
    requestRaw(baseUrl, "/v4/onboarding/settings.html", { timeoutMs: 10000 }),
    requestRaw(baseUrl, "/first-run.html", { timeoutMs: 10000 }),
  ]);

  journeys.push({
    id: "live_orangebox",
    label: "Open live ORANGEBOX",
    status: statusFrom(status.ok),
    ok: status.ok,
    evidence: {
      http_ok: status.ok,
      commandRailStatus: status.json?.commandRailStatus || null,
      aiBoxReady: status.json?.aiBoxReady ?? null,
      version: status.json?.version || null,
      error: status.error || null,
    },
    user_blocker: status.ok ? null : "User cannot open live ORANGEBOX.",
    recovery: status.ok ? "No recovery needed." : "Start ORANGEBOX with `npm start` or `node scripts/orangebox-command-server.mjs --host 127.0.0.1 --port 8787`.",
  });

  journeys.push(domJourney({
    id: "ae_see_suite_creation",
    label: "Use AE See-Suite creation surface",
    raw: seeSuite,
    required: [/AE See-Suite/i, /What are we building\?/i, /Build App/i, /Silent Canvas/i, /Artifact Library/i],
  }));

  journeys.push(domJourney({
    id: "ae_operations_control",
    label: "Use AE Operations control surface",
    raw: operations,
    required: [/AE Operations/i, /Running Brain/i, /Final Green Board/i, /Ethereal AI Link/i, /Recovery Guide/i],
  }));

  journeys.push(domJourney({
    id: "basic_vs_advanced_install",
    label: "Choose Basic or Advanced install",
    raw: firstRun,
    required: [/Do you have an AI computer to set up\?/i, /Basic/i, /Advanced/i, /What is an AI computer/i],
  }));

  const route = await requestJson(baseUrl, "/api/v4/router/route", {
    method: "POST",
    body: { task: "architecture" },
    timeoutMs: 12000,
  });
  journeys.push({
    id: "running_brain_routes_work",
    label: "Route work through selected Running Brain",
    status: statusFrom(route.ok && route.json?.running_brain_applied === true),
    ok: route.ok && route.json?.running_brain_applied === true,
    evidence: {
      provider: route.json?.provider || null,
      model: route.json?.model || null,
      running_brain: route.json?.running_brain || null,
      running_brain_applied: route.json?.running_brain_applied ?? null,
      error: route.error || route.json?.error || null,
    },
    user_blocker: route.ok && route.json?.running_brain_applied === true ? null : "User can see the switch but routing did not apply it.",
    recovery: "Rerun `obx model doctor --receipt`, check `/api/v4/model-switch/status`, and restart the sidecar if routes are stale.",
  });

  const commandJobs = [
    ["model_switchboard", "Switch GPT / Opus / Grok / Gemini Running Brain", ["scripts/obx.mjs", "model", "doctor", "--json", "--receipt"], 140000],
    ["aelang_route_language", "Compile AELang into an ORANGEBOX route packet", ["scripts/obx.mjs", "aelang", "doctor", "--json", "--receipt"], 140000],
    ["api_contract", "Use API/OpenAPI contract", ["scripts/obx.mjs", "api", "doctor", "--json", "--receipt"], 140000],
    ["install_clarity", "Run Basic/Advanced install doctor", ["scripts/obx.mjs", "install", "doctor", "--json", "--receipt"], 140000],
    ["route_spine", "Plan and inspect Operating Spine routes", ["scripts/obx.mjs", "route", "doctor", "--json", "--receipt"], 140000],
    ["department_os", "Use Department OS routing", ["scripts/obx.mjs", "dept", "doctor", "--json", "--receipt"], 140000],
    ["surface_factory", "Use Surface Factory doctor", ["scripts/obx.mjs", "surface", "doctor", "--json", "--receipt"], 140000],
    ["mcp_bridge", "Use MCP bridge doctor", ["scripts/obx.mjs", "mcp", "doctor", "--json", "--receipt"], 140000],
    ["silent_canvas", "Use Silent Canvas alpha7 proof", ["scripts/obx.mjs", "silent-canvas", "alpha7-doctor", "--json", "--receipt", "--full"], 180000],
  ];
  if (full) {
    commandJobs.push(
      ["ethereal_ai_link", "Diagnose Ethereal AI Link / AI computer setup", ["scripts/obx.mjs", "ethereal", "doctor", "--json", "--receipt"], 180000],
      ["feature_reality", "Prove anti-theater feature reality", ["scripts/obx.mjs", "finish", "feature-reality", "--json", "--receipt"], 180000],
    );
  }

  for (const [id, label, args, timeoutMs] of commandJobs) {
    journeys.push(commandJourney({ id, label, result: await runNode(args, timeoutMs) }));
  }

  const visualReceipts = await Promise.all([
    latestReceipt(/^orangebox-ae-see-suite-visual-proof-.*\.json$/),
    latestReceipt(/^orangebox-ae-operations-visual-proof-.*\.json$/),
    latestReceipt(/^orangebox-first-run-visual-proof-.*\.json$/),
  ]);
  journeys.push(receiptJourney({ id: "see_suite_visual_proof", label: "See AE See-Suite screenshot proof", receipt: visualReceipts[0] }));
  journeys.push(receiptJourney({ id: "operations_visual_proof", label: "See AE Operations screenshot proof", receipt: visualReceipts[1] }));
  journeys.push(receiptJourney({ id: "first_run_visual_proof", label: "See Basic/Advanced first-run screenshot proof", receipt: visualReceipts[2] }));

  const blockers = journeys.filter((item) => item.status === "fail");
  const warnings = journeys.filter((item) => item.status === "watch");
  const result = {
    ok: blockers.length === 0,
    version: USER_JOURNEY_DOCTOR_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    started_at: started,
    base_url: baseUrl,
    full,
    summary: {
      journeys: journeys.length,
      passed: journeys.filter((item) => item.status === "pass").length,
      watch: warnings.length,
      failed: blockers.length,
    },
    journeys,
    blockers: blockers.map((item) => ({ id: item.id, label: item.label, detail: item.user_blocker, recovery: item.recovery })),
    warnings: warnings.map((item) => ({ id: item.id, label: item.label, recovery: item.recovery })),
    next_action: blockers.length
      ? "Fix the failed user journey, rerun its doctor/proof, then rerun `obx finish user-journey --full --receipt`."
      : warnings.length
        ? "Journeys are usable with watch items. Review warning receipts before release promotion."
        : "All simulated user journeys passed. Keep package/git release gates separate.",
    receipt_path: null,
  };
  if (writeReceipt) {
    const file = path.join(RECEIPTS_DIR, `orangebox-user-journey-doctor-${stamp()}.json`);
    result.receipt_path = file;
    await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runUserJourneyDoctor({
    writeReceipt: argv.includes("--receipt"),
    full: argv.includes("--full"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length),
  });
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ORANGEBOX user journey doctor ${out.summary.passed}/${out.summary.journeys}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const blocker of out.blockers) console.log(`blocker: ${blocker.id} - ${blocker.detail}`);
    for (const warning of out.warnings) console.log(`watch: ${warning.id}`);
  }
  if (!out.ok) process.exit(4);
}
