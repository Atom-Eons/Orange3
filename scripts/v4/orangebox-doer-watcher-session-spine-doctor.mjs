#!/usr/bin/env node
/*
  orangebox-doer-watcher-session-spine-doctor.mjs

  Dedicated proof lane for the "doer + watcher" operating spine. It proves
  the local doer surfaces are reachable, the watcher receipts are fresh, and
  Codexa gaps remain visible instead of being confused with local Ops green.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "doer-watcher");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function ageMs(value) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
}

function check(id, ok, evidence = {}) {
  return { id, ok: Boolean(ok), ...evidence };
}

async function main() {
  const startedAt = new Date();
  const healthPath = path.join(dataRoot, "reports", "health", "latest-health-report.json");
  const projectPath = path.join(dataRoot, "reports", "project", "latest-project-report.json");
  const realityPath = path.join(dataRoot, "watcher", "latest-reality-watch.json");
  const watcherHeartbeatPath = path.join(dataRoot, "watcher", "watcher-process-heartbeat.json");
  const signalPath = path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json");
  const alertPath = path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json");

  const health = readJson(healthPath);
  const project = readJson(projectPath);
  const reality = readJson(realityPath);
  const watcherHeartbeat = readJson(watcherHeartbeatPath);
  const signal = readJson(signalPath);
  const alert = readJson(alertPath);

  const watcherAge = ageMs(watcherHeartbeat?.last_finished);
  const realityAge = ageMs(reality?.checked_at || reality?.generated_at || reality?.finished_at);
  const watcherFresh = watcherHeartbeat?.ok === true && watcherAge !== null && watcherAge < 15 * 60 * 1000;
  const realityFresh = reality?.ok === false || reality?.ok === true
    ? realityAge === null || realityAge < 20 * 60 * 1000
    : false;
  const codexaReady = alert?.status === "CODEXA_READY";

  const doer = {
    command_server: health?.dev?.probes?.command_server || null,
    api_server: health?.dev?.probes?.api_server || null,
    local_llama_listener: health?.dev?.probes?.local_llama_health || null,
    strongarm_gate: health?.dev?.probes?.strongarm_gate || null,
  };
  const watcher = {
    reality_watch: {
      status: reality?.status || null,
      ok: reality?.ok ?? null,
      warnings: reality?.warnings || [],
      path: realityPath,
    },
    watcher_process: {
      ok: watcherHeartbeat?.ok ?? null,
      last_finished: watcherHeartbeat?.last_finished || null,
      age_ms: watcherAge,
      path: watcherHeartbeatPath,
    },
    signal_hygiene: {
      status: signal?.status || null,
      severity: signal?.signal_hygiene?.severity || null,
      path: signalPath,
    },
    codexa_alert: {
      status: alert?.status || null,
      command_rail_reachable: alert?.command_rail_reachable ?? null,
      ollama_reachable: alert?.ollama_reachable ?? null,
      path: alertPath,
    },
  };

  const checks = [
    check("source_receipts_present", Boolean(health && reality && watcherHeartbeat && signal && alert), {
      health_path: healthPath,
      project_path: projectPath,
      reality_path: realityPath,
      watcher_heartbeat_path: watcherHeartbeatPath,
      signal_path: signalPath,
      alert_path: alertPath,
    }),
    check("doer_command_server_reachable", doer.command_server?.ok === true, doer.command_server || {}),
    check("doer_api_server_reachable", doer.api_server?.ok === true, doer.api_server || {}),
    check("doer_local_listener_or_strongarm_reachable", doer.local_llama_listener?.ok === true || doer.strongarm_gate?.ok === true, {
      local_llama_ok: doer.local_llama_listener?.ok ?? null,
      strongarm_ok: doer.strongarm_gate?.ok ?? null,
    }),
    check("watcher_process_fresh", watcherFresh, watcher.watcher_process),
    check("watcher_reality_receipt_fresh", realityFresh && /WARNINGS|GREEN|WARN/i.test(String(reality?.status || "")), {
      status: reality?.status || null,
      age_ms: realityAge,
      path: realityPath,
    }),
    check("watcher_signal_hygiene_green", signal?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN", watcher.signal_hygiene),
    check("local_vs_full_truth_preserved", signal?.confidence_calibration?.local_ops === "high_receipt_backed"
      && (codexaReady || signal?.confidence_calibration?.full_system === "not_green_by_evidence"), {
      project_status: project?.status || null,
      local_ops_green: project?.local_ops_green ?? null,
      full_project_green: project?.full_project_green ?? null,
      codexa_status: alert?.status || null,
      signal_full_system_confidence: signal?.confidence_calibration?.full_system || null,
    }),
    check("codexa_gap_not_silenced", codexaReady || (
      Array.isArray(health?.warnings)
      && health.warnings.some((warning) => /AI Box|Codexa|Ollama/i.test(warning))
      && Array.isArray(reality?.warnings)
      && reality.warnings.some((warning) => /AI Box|Codexa|two-machine|full-green/i.test(warning))
    ), {
      codexa_status: alert?.status || null,
      health_warning_count: health?.warnings?.length || 0,
      reality_warning_count: reality?.warnings?.length || 0,
    }),
  ];

  const failures = checks.filter((row) => !row.ok).map((row) => row.id);
  const result = {
    ok: failures.length === 0,
    version: "orangebox-doer-watcher-session-spine/v1",
    status: failures.length === 0 ? "ORANGEBOX_DOER_WATCHER_SPINE_GREEN" : "ORANGEBOX_DOER_WATCHER_SPINE_NEEDS_ATTENTION",
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "One doer executes; one watcher preserves reality. Local Ops may be green while distributed Codexa remains gated.",
    doer,
    watcher,
    one_reality: {
      local_ops_green: project?.local_ops_green ?? null,
      full_project_green: project?.full_project_green ?? null,
      codexa_status: alert?.status || null,
      full_system_green_blocked: signal?.signal_hygiene?.full_system_green_blocked ?? null,
      summary_line: alert?.signal_hygiene?.summary_line || null,
    },
    checks,
    failures,
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      install_attempted: false,
      paid_api_attempted: false,
      host_mcp_config_mutated: false,
      production_deploy_attempted: false,
      remote_codexa_mutation_attempted: false,
    },
    next_action: failures.length === 0
      ? "Keep session:spine in the local Ops proof chain before changing watcher, rail, command-server, or Codexa readiness behavior."
      : "Run health:report, project:report, reality:watch, signal:hygiene, then rerun session:spine.",
    proof_hash: sha256(JSON.stringify({ doer, watcher, checks })),
  };

  const latestPath = path.join(outRoot, "latest-doer-watcher-spine.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-doer-watcher-spine-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
