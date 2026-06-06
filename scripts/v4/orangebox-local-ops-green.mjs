#!/usr/bin/env node
/*
  orangebox-local-ops-green.mjs

  Local Orangebox Ops proof gate. This intentionally separates the backend
  cockpit/N150 proof from the broader two-machine Codexa/Hermes/Ollama gate.
*/

import { spawn } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const noRefresh = args.has("--no-refresh");
const deep = args.has("--deep");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "ops-green");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function latestReceipt(prefix, root = receiptDir) {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function ageMs(value) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
}

function tail(text, limit = 2800) {
  const value = String(text || "");
  return value.length > limit ? value.slice(-limit) : value;
}

function childEnv(extra = {}) {
  const clean = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key || key.startsWith("=") || value === undefined || value === null) continue;
    clean[key] = String(value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (!key || key.startsWith("=") || value === undefined || value === null) continue;
    clean[key] = String(value);
  }
  return clean;
}

function runNpm(script, timeoutMs = 90_000) {
  const started = Date.now();
  return new Promise((resolve) => {
    let child;
    let stdout = "";
    let stderr = "";
    let settled = false;
    const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : npmBin;
    const commandArgs = process.platform === "win32"
      ? ["/d", "/s", "/c", `${npmBin} run ${script}`]
      : ["run", script];
    try {
      child = spawn(command, commandArgs, {
        cwd: repoRoot,
        env: childEnv({ ORANGEBOX_LOCAL_OPS_GREEN_IN_PROGRESS: "1" }),
        windowsHide: true,
      });
    } catch (error) {
      resolve({
        script,
        command: `${npmBin} run ${script}`,
        ok: false,
        exit_code: null,
        duration_ms: Date.now() - started,
        error: error.message,
        stdout_tail: "",
        stderr_tail: "",
      });
      return;
    }
    const timer = setTimeout(() => {
      if (!settled) {
        try { child.kill(); } catch {}
      }
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("close", (code) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        script,
        command: `${npmBin} run ${script}`,
        ok: code === 0,
        exit_code: code,
        duration_ms: Date.now() - started,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
      });
    });
    child.on("error", (error) => {
      settled = true;
      clearTimeout(timer);
      resolve({
        script,
        command: `${npmBin} run ${script}`,
        ok: false,
        exit_code: null,
        duration_ms: Date.now() - started,
        error: error.message,
        stdout_tail: tail(stdout),
        stderr_tail: tail(stderr),
      });
    });
  });
}

function gate(id, ok, evidence = {}) {
  return { id, ok: Boolean(ok), ...evidence };
}

async function main() {
  const startedAt = new Date().toISOString();
  const refreshPlan = [
    ...(deep ? [{ script: "backend:proof", timeout: 180_000 }] : []),
    { script: "mcp:doctor", timeout: 60_000 },
    { script: "action:doctor", timeout: 60_000 },
    { script: "skills:lifecycle", timeout: 90_000 },
    { script: "tool:ergonomics", timeout: 60_000 },
    { script: "checkmate:doctor", timeout: 60_000 },
    { script: "signal:hygiene", timeout: 60_000 },
    { script: "session:spine", timeout: 60_000 },
    { script: "feature:proof", timeout: 90_000 },
    { script: "ops:readiness", timeout: 180_000 },
    { script: "health:report", timeout: 90_000 },
    { script: "project:report", timeout: 90_000 },
    { script: "reality:watch", timeout: 90_000 },
    { script: "harness:benchmark", timeout: 90_000 },
  ];
  const commands = [];
  if (!noRefresh) {
    for (const item of refreshPlan) {
      commands.push(await runNpm(item.script, item.timeout));
    }
  }

  const healthPath = path.join(dataRoot, "reports", "health", "latest-health-report.json");
  const projectPath = path.join(dataRoot, "reports", "project", "latest-project-report.json");
  const realityPath = path.join(dataRoot, "watcher", "latest-reality-watch.json");
  const watcherHeartbeatPath = path.join(dataRoot, "watcher", "watcher-process-heartbeat.json");
  const harnessPath = path.join(dataRoot, "harness", "latest-harness-benchmark.json");
  const mcpPath = path.join(dataRoot, "mcp", "latest-mcp-doctor.json");
  const actionPath = path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json");
  const skillsPath = path.join(dataRoot, "skills", "latest-skill-lifecycle.json");
  const toolErgonomicsPath = path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json");
  const checkmatePath = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");
  const signalHygienePath = path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json");
  const sessionSpinePath = path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json");
  const featureProofPath = path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json");
  const openclawPath = path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json");
  const backendPath = latestReceipt("orangebox-backend-install-");
  const opsReadinessPath = latestReceipt("orangebox-ops-readiness-");
  const finalVerifyPath = latestReceipt("orangebox-delta-final-package-");
  const finalManifestPath = path.join(repoRoot, "orangebox-delta-final-manifest.json");

  const health = readJson(healthPath);
  const project = readJson(projectPath);
  const reality = readJson(realityPath);
  const watcherHeartbeat = readJson(watcherHeartbeatPath);
  const harness = readJson(harnessPath);
  const mcp = readJson(mcpPath);
  const action = readJson(actionPath);
  const skills = readJson(skillsPath);
  const toolErgonomics = readJson(toolErgonomicsPath);
  const checkmate = readJson(checkmatePath);
  const signalHygiene = readJson(signalHygienePath);
  const sessionSpine = readJson(sessionSpinePath);
  const featureProof = readJson(featureProofPath);
  const openclaw = readJson(openclawPath);
  const backend = readJson(backendPath || "");
  const opsReadiness = readJson(opsReadinessPath || "");
  const finalVerify = readJson(finalVerifyPath || "");
  const finalManifest = readJson(finalManifestPath);

  const watcherFresh = watcherHeartbeat?.ok === true && ageMs(watcherHeartbeat.last_finished) !== null && ageMs(watcherHeartbeat.last_finished) < 15 * 60 * 1000;
  const finalPackageGreen =
    finalVerify?.status === "ORANGEBOX_DELTA_FINAL_VERIFIED_GREEN" ||
    finalManifest?.status === "ORANGEBOX_DELTA_FINAL_VERIFIED_GREEN" ||
    (finalManifest?.ok === true && finalManifest?.verification?.ok === true);
  const gates = [
    gate("refresh_commands_green", noRefresh || commands.every((item) => item.ok), { commands_run: commands.length }),
    gate("command_server_reachable", health?.dev?.probes?.command_server?.ok === true, health?.dev?.probes?.command_server || {}),
    gate("api_server_reachable", health?.dev?.probes?.api_server?.ok === true, health?.dev?.probes?.api_server || {}),
    gate("local_llama_listener_reachable", health?.dev?.probes?.local_llama_health?.ok === true, health?.dev?.probes?.local_llama_health || {}),
    gate("strongarm_gate_reachable", health?.dev?.probes?.strongarm_gate?.ok === true, health?.dev?.probes?.strongarm_gate || {}),
    gate("local_ops_project_green", project?.local_ops_green === true, { status: project?.status || null, gap_count: project?.gap_count ?? null }),
    gate("backend_install_green", backend?.ok === true && backend?.status === "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN", { path: backendPath, status: backend?.status || null }),
    gate("ops_readiness_green", opsReadiness?.ok === true && opsReadiness?.status === "ORANGEBOX_OPS_RAILS_GREEN", { path: opsReadinessPath, status: opsReadiness?.status || null }),
    gate("final_package_verified", finalPackageGreen, {
      receipt_path: finalVerifyPath,
      manifest_path: exists(finalManifestPath) ? finalManifestPath : null,
      status: finalVerify?.status || finalManifest?.status || null,
    }),
    gate("mcp_quarantine_green", mcp?.ok === true && mcp?.summary?.failed === 0, { status: mcp?.ok === true ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN" }),
    gate("action_classifier_green", action?.ok === true && action?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN", { status: action?.status || null }),
    gate("skill_lifecycle_green", skills?.ok === true && skills?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN", { status: skills?.status || null, command_count: skills?.command_count ?? null }),
    gate("tool_ergonomics_green", toolErgonomics?.ok === true && toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN", { status: toolErgonomics?.status || null, command_count: toolErgonomics?.command_surface?.command_count ?? null }),
    gate("checkmate_eval_lane_green", checkmate?.ok === true && checkmate?.status === "CHECKMATE_EVAL_LANE_GREEN", { status: checkmate?.status || null, fixtures_total: checkmate?.fixtures?.length ?? null }),
    gate("operator_signal_hygiene_green", signalHygiene?.ok === true && signalHygiene?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN", { status: signalHygiene?.status || null, severity: signalHygiene?.signal_hygiene?.severity || null }),
    gate("doer_watcher_spine_green", sessionSpine?.ok === true && sessionSpine?.status === "ORANGEBOX_DOER_WATCHER_SPINE_GREEN", { status: sessionSpine?.status || null, failures: sessionSpine?.failures?.length ?? null }),
    gate("feature_acceptance_matrix_green", featureProof?.ok === true && featureProof?.status === "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN", { status: featureProof?.status || null, features_green: featureProof?.features_green ?? null, features_total: featureProof?.features_total ?? null }),
    gate("harness_benchmark_green", harness?.ok === true && harness?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN", { status: harness?.status || null, tasks_ok: harness?.tasks_ok ?? null, tasks_total: harness?.tasks_total ?? null }),
    gate("reality_watch_local_ops_truth", reality?.checks?.project_report?.local_ops_green === true || reality?.checks?.project_report?.ok === true, { status: reality?.status || null }),
    gate("reality_watcher_process_fresh", watcherFresh, { path: watcherHeartbeatPath, last_finished: watcherHeartbeat?.last_finished || null }),
    gate("openclaw_startup_retired", openclaw?.status === "OPENCLAW_STARTUP_RETIRED", { status: openclaw?.status || null }),
  ];
  const codexaWarnings = [
    ...(health?.warnings || []).filter((warning) => /AI Box|Codexa|Ollama|SMB|full Orangebox/i.test(warning)),
    ...(reality?.warnings || []).filter((warning) => /AI Box|Codexa|Ollama|full-green|two-machine/i.test(warning)),
  ];
  const result = {
    ok: gates.every((item) => item.ok),
    version: "orangebox-local-ops-green/v1",
    status: gates.every((item) => item.ok) ? "ORANGEBOX_LOCAL_OPS_GREEN" : "ORANGEBOX_LOCAL_OPS_NEEDS_ATTENTION",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Local Ops green proves backend/runtime/receipts/watchers on this machine. It records Codexa/two-machine gaps as warnings instead of pretending distributed readiness.",
    mode: {
      refreshed: !noRefresh,
      deep,
      frontend_touched: false,
      codexa_required: false,
      production_deploy_attempted: false,
    },
    gates,
    commands,
    codexa_warnings: [...new Set(codexaWarnings)],
    evidence: {
      health_report: healthPath,
      project_report: projectPath,
      reality_watch: realityPath,
      harness_benchmark: harnessPath,
      tool_ergonomics: toolErgonomicsPath,
      checkmate_eval_lane: checkmatePath,
      signal_hygiene: signalHygienePath,
      doer_watcher_spine: sessionSpinePath,
      backend_install: backendPath,
      ops_readiness: opsReadinessPath,
      final_verify: finalVerifyPath || (exists(finalManifestPath) ? finalManifestPath : null),
    },
    next_action: gates.every((item) => item.ok)
      ? "Use system:full-green only when Codexa/Ollama/Hermes/two-machine readiness is being proven."
      : "Fix the failed local gate(s) above, rerun npm.cmd run ops:green, then rerun final:verify if package files changed.",
  };

  const latestPath = path.join(outRoot, "latest-local-ops-green.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-local-ops-green-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
