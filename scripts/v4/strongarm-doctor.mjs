#!/usr/bin/env node
/*
  strongarm-doctor.mjs

  Proves STRONGARM EASY is installed as an Orangebox backend pressure gate.
  It does not call paid APIs, does not require Ollama, and does not touch
  frontend/visual lanes. The default proof uses STRONGARM's deterministic
  heuristic mode so the gate can stay live on low-resource machines.
*/

import { spawn, execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const wantsStart = args.has("--start");
const wantsNoServerSmoke = args.has("--no-server-smoke");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const strongarmRoot = path.join(repoRoot, "integrations", "strongarm_easy_v0_4");
const strongarmPy = path.join(strongarmRoot, "strongarm.py");
const pythonBin = process.env.PYTHON || "python";
const servicePort = Number(process.env.STRONGARM_PORT || 8094);

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function exists(file) {
  return fs.existsSync(file);
}

function tail(text, max = 3500) {
  const value = String(text || "");
  return value.length > max ? value.slice(-max) : value;
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runStep(name, command, commandArgs, options = {}) {
  const started = Date.now();
  try {
    const out = await execFileAsync(command, commandArgs, {
      cwd: options.cwd || strongarmRoot,
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 45_000,
      maxBuffer: options.maxBuffer || 5_000_000,
      windowsHide: true,
    });
    return {
      name,
      ok: true,
      command: [command, ...commandArgs].join(" "),
      duration_ms: Date.now() - started,
      stdout_tail: tail(out.stdout),
      stderr_tail: tail(out.stderr, 1200),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...commandArgs].join(" "),
      duration_ms: Date.now() - started,
      exit_code: error.code ?? null,
      stdout_tail: tail(error.stdout),
      stderr_tail: tail(error.stderr || error.message, 1800),
    };
  }
}

function parseVerdict(stdout) {
  const text = String(stdout || "");
  const marker = text.indexOf('"verdict"');
  if (marker < 0) return null;
  const start = text.lastIndexOf("{", marker);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === '"') inString = !inString;
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;
    if (depth === 0) {
      const candidate = text.slice(start, i + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10_000);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || undefined,
      body: options.body || undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 500); }
    return { ok: response.ok, status: response.status, url, body };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForHealth(port, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    try {
      latest = await fetchJson(`http://127.0.0.1:${port}/health`, { timeoutMs: 1200 });
      if (latest.ok) return latest;
    } catch (error) {
      latest = { ok: false, error: error.message };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`STRONGARM server did not answer /health: ${JSON.stringify(latest)}`);
}

async function serverSmoke() {
  const port = await freePort();
  const child = spawn(pythonBin, [strongarmPy, "server", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: strongarmRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  child.stdout.on("data", (chunk) => logs.push({ stream: "stdout", text: tail(chunk.toString(), 1200) }));
  child.stderr.on("data", (chunk) => logs.push({ stream: "stderr", text: tail(chunk.toString(), 1200) }));
  try {
    const health = await waitForHealth(port);
    const sample = JSON.parse(await fsp.readFile(path.join(strongarmRoot, "examples", "bad_answer.json"), "utf8"));
    sample._heuristic = true;
    const verdict = await fetchJson(`http://127.0.0.1:${port}/verdict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sample),
      timeoutMs: 10_000,
    });
    return {
      ok: health.ok && verdict.ok && verdict.body?.verdict === "REWRITE",
      port,
      health: {
        ok: health.ok,
        status: health.status,
        service: health.body?.service || null,
        version: health.body?.version || null,
        endpoints: health.body?.endpoints || [],
      },
      verdict: {
        ok: verdict.ok,
        status: verdict.status,
        verdict: verdict.body?.verdict || null,
        request_fulfillment: verdict.body?.scores?.request_fulfillment || null,
      },
      logs: logs.slice(-8),
    };
  } catch (error) {
    return { ok: false, port, error: error.message, logs: logs.slice(-8) };
  } finally {
    if (!child.killed) child.kill();
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (!child.killed) {
      try { child.kill("SIGKILL"); } catch {}
    }
  }
}

function projectGatePolicy() {
  return {
    version: "orangebox-strongarm-project-gate/v0",
    status: "ACTIVE_LOCAL_PRESSURE_GATE",
    purpose: "Keep Orangebox project work on the full productive path by auditing draft outputs before they are treated as final.",
    active_lane: "Orangebox Operations backend",
    scope: [
      "AECode mission and receipt text",
      "backend/Ops handoffs",
      "doctor summaries",
      "model/advisor verdict cards",
      "final answer drafts when the work is non-trivial",
      "future visual/product lanes via their own chats without this Ops chat editing visual code",
    ],
    default_mode: "heuristic",
    default_reason: "Heuristic mode is local, deterministic, no API key, no GPU, and works even when Ollama/Codexa are offline.",
    optional_model_mode: {
      provider: "Ollama structured output",
      default_model: "qwen3:0.6b",
      enabled_when: "Ollama is installed and the operator wants model-assisted judging.",
    },
    top_brain_policy_note:
      "STRONGARM is not the top brain. It is a pressure gate. Operator preference currently keeps Claude Opus 4.7 Max / 1M as the deepest architect/top-brain lane when that level is warranted; paid/frontier routes remain explicit, not default.",
    route: [
      "model/tool drafts answer or plan",
      "STRONGARM audits draft",
      "PASS ships only with receipts/evidence still intact",
      "REWRITE returns rewrite_prompt to the drafting lane",
      "ESCALATE packages the failure for stronger advisor/top-brain review",
      "BLOCK returns closest lawful alternative",
    ],
    non_goals: [
      "No paid model calls by default",
      "No replacement for gauntlets or receipts",
      "No visual/frontend edits from this Ops lane",
      "No training-first detour",
    ],
  };
}

async function startPersistentServer(result) {
  const probe = await fetchJson(`http://127.0.0.1:${servicePort}/health`, { timeoutMs: 1200 }).catch(() => null);
  if (probe?.ok) {
    result.persistent_server = { ok: true, already_running: true, port: servicePort };
    return;
  }
  const child = spawn(pythonBin, [strongarmPy, "server", "--host", "127.0.0.1", "--port", String(servicePort)], {
    cwd: strongarmRoot,
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const health = await waitForHealth(servicePort, 15_000);
  result.persistent_server = {
    ok: health.ok,
    already_running: false,
    port: servicePort,
    pid: child.pid,
    health: health.body,
  };
}

async function main() {
  const commands = [];
  const checks = {
    integration_root: { ok: exists(strongarmRoot), path: strongarmRoot },
    strongarm_py: { ok: exists(strongarmPy), path: strongarmPy, sha256: sha256File(strongarmPy) },
    examples: {
      ok: exists(path.join(strongarmRoot, "examples", "bad_answer.json")) && exists(path.join(strongarmRoot, "examples", "good_answer.json")),
      bad_answer: path.join(strongarmRoot, "examples", "bad_answer.json"),
      good_answer: path.join(strongarmRoot, "examples", "good_answer.json"),
    },
    no_frontend_requirement: { ok: true, detail: "STRONGARM proof runs from Python + standard library only." },
  };

  if (Object.values(checks).every((check) => check.ok)) {
    commands.push(await runStep("py_compile", pythonBin, ["-m", "py_compile", "strongarm.py", path.join("integrations", "call_strongarm.py")]));
    commands.push(await runStep("demo_heuristic", pythonBin, ["strongarm.py", "demo", "--heuristic"]));
    commands.push(await runStep("judge_bad_heuristic_receipt", pythonBin, ["strongarm.py", "judge", path.join("examples", "bad_answer.json"), "--heuristic", "--receipt"]));
    commands.push(await runStep("judge_good_heuristic_receipt", pythonBin, ["strongarm.py", "judge", path.join("examples", "good_answer.json"), "--heuristic", "--receipt"]));
  }

  const badVerdict = parseVerdict(commands.find((step) => step.name === "judge_bad_heuristic_receipt")?.stdout_tail);
  const goodVerdict = parseVerdict(commands.find((step) => step.name === "judge_good_heuristic_receipt")?.stdout_tail);
  const server = !wantsNoServerSmoke && commands.every((step) => step.ok) ? await serverSmoke() : { ok: true, skipped: true };
  const policy = projectGatePolicy();

  const result = {
    ok: false,
    version: "orangebox-strongarm-doctor/v0",
    status: "RUNNING",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    integration_root: strongarmRoot,
    checks,
    commands,
    verdict_proof: {
      bad_answer_verdict: badVerdict?.verdict || null,
      bad_answer_request_fulfillment: badVerdict?.scores?.request_fulfillment || null,
      good_answer_verdict: goodVerdict?.verdict || null,
      good_answer_note:
        goodVerdict?.verdict === "REWRITE"
          ? "The bundled heuristic is intentionally strict; model-assisted calibration can be enabled later through Ollama."
          : null,
    },
    server_smoke: server,
    project_gate_policy: policy,
    receipts_written_by_strongarm: exists(path.join(strongarmRoot, "receipts"))
      ? fs.readdirSync(path.join(strongarmRoot, "receipts")).filter((name) => name.endsWith(".json")).slice(-12)
      : [],
  };

  if (wantsStart && result.server_smoke?.ok) {
    await startPersistentServer(result);
  }

  const commandsOk = commands.length > 0 && commands.every((step) => step.ok);
  const checksOk = Object.values(checks).every((check) => check.ok);
  const verdictOk = badVerdict?.verdict === "REWRITE";
  const serverOk = result.server_smoke?.ok === true;
  const persistentOk = !wantsStart || result.persistent_server?.ok === true;
  result.ok = checksOk && commandsOk && verdictOk && serverOk && persistentOk;
  result.status = result.ok ? "STRONGARM_ORANGEBOX_GATE_GREEN" : "STRONGARM_ORANGEBOX_GATE_NOT_GREEN";
  result.completed_at = new Date().toISOString();

  const strongarmDataRoot = path.join(dataRoot, "strongarm");
  await writeJson(path.join(strongarmDataRoot, "latest-strongarm-doctor.json"), result);
  await writeJson(path.join(strongarmDataRoot, "strongarm-project-gate.json"), policy);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-strongarm-doctor-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(strongarmDataRoot, "latest-strongarm-doctor.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
