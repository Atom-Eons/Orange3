#!/usr/bin/env node
/*
  orangebox-local-ops-green.mjs

  Local Orangebox Ops proof gate. This intentionally separates the backend
  cockpit/N150 proof from the broader two-machine Codexa/Hermes/Ollama gate.
*/

import { execFileSync, spawn } from "node:child_process";
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

function readProcessRuntimeProof() {
  if (process.platform !== "win32") {
    return { ok: true, skipped: true, reason: "Windows process command-line proof only." };
  }
  try {
    const script = [
      "$items = Get-CimInstance Win32_Process |",
      "Where-Object { $_.CommandLine -match 'orangebox-command-server\\.mjs|dist\\\\server\\.js|orangebox-delta-backend\\.ps1|orangebox-delta-api\\.ps1' } |",
      "Select-Object ProcessId,Name,CommandLine;",
      "$items | ConvertTo-Json -Depth 4",
    ].join(" ");
    const out = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true,
      timeout: 20_000,
      maxBuffer: 2_000_000,
    }).trim();
    const parsed = out ? JSON.parse(out) : [];
    const processes = Array.isArray(parsed) ? parsed : [parsed];
    const commandServer = processes.find((item) => /orangebox-command-server\.mjs/i.test(item.CommandLine || ""));
    const apiServer = processes.find((item) => /dist\\server\.js/i.test(item.CommandLine || ""));
    const nodeServers = processes.filter((item) =>
      /node\.exe/i.test(item.Name || "") &&
      /orangebox-command-server\.mjs|dist\\server\.js/i.test(item.CommandLine || "")
    );
    return {
      ok: Boolean(commandServer && apiServer && /bun\.exe/i.test(commandServer.Name || "") && /bun\.exe/i.test(apiServer.Name || "") && nodeServers.length === 0),
      command_server_runtime: commandServer ? { pid: commandServer.ProcessId, name: commandServer.Name, command_line: commandServer.CommandLine } : null,
      api_server_runtime: apiServer ? { pid: apiServer.ProcessId, name: apiServer.Name, command_line: apiServer.CommandLine } : null,
      node_server_processes: nodeServers.map((item) => ({ pid: item.ProcessId, name: item.Name, command_line: item.CommandLine })),
    };
  } catch (error) {
    return { ok: false, error: error.message };
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
        env: childEnv({
          ORANGEBOX_LOCAL_OPS_GREEN_IN_PROGRESS: "1",
          ORANGEBOX_BACKEND_PROOF_IN_PROGRESS: "1",
        }),
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

function refreshCommandOk(command) {
  if (command.ok) return true;
  // These commands intentionally return non-zero when they are reporting open
  // warnings instead of hard local Ops failure. Their receipt content is checked
  // by explicit gates below, so the refresh gate should not double-count them.
  const warningOnlyScripts = new Set(["health:report", "project:report", "ops:gaps", "codexa:handoff", "reality:watch"]);
  return warningOnlyScripts.has(command.script) && command.exit_code === 1;
}

async function main() {
  const startedAt = new Date().toISOString();
  const refreshPlan = [
    ...(deep ? [{ script: "backend:proof", timeout: 180_000 }] : []),
    { script: "strongarm:start", timeout: 120_000 },
    { script: "ops:services", timeout: 360_000 },
    { script: "control:doctor", timeout: 180_000 },
    { script: "control:smoke", timeout: 180_000 },
    { script: "mcp:doctor", timeout: 60_000 },
    { script: "ipi:doctor", timeout: 60_000 },
    { script: "memory:doctor", timeout: 60_000 },
    { script: "action:doctor", timeout: 60_000 },
    { script: "skills:lifecycle", timeout: 90_000 },
    { script: "model:lane-eval", timeout: 60_000 },
    { script: "council:doctor", timeout: 90_000 },
    { script: "tool:ergonomics", timeout: 60_000 },
    { script: "checkmate:doctor", timeout: 60_000 },
    { script: "assurance:doctor", timeout: 60_000 },
    { script: "toolmesh:doctor", timeout: 90_000 },
    { script: "toolmesh:physical-doctor", timeout: 90_000 },
    { script: "v3:api:doctor", timeout: 90_000 },
    { script: "v3:goose:envelope", timeout: 90_000 },
    { script: "v3:openjarvis:doctor", timeout: 90_000 },
    { script: "v3:mcp:doctor", timeout: 90_000 },
    { script: "v3:api:bakeoff", timeout: 90_000 },
    { script: "visual:artifact-vault", timeout: 90_000 },
    { script: "visual:artifact-smoke", timeout: 90_000 },
    { script: "visual:readiness", timeout: 90_000 },
    { script: "horizon:review", timeout: 90_000 },
    { script: "horizon:bakeoff", timeout: 90_000 },
    { script: "signal:hygiene", timeout: 60_000 },
    { script: "session:spine", timeout: 60_000 },
    { script: "feature:proof", timeout: 90_000 },
    // Readiness must happen after the source doctors and feature matrix.
    // Reports, gap ledgers, and handoffs are mirrors; running them too early
    // creates false red receipts that cascade through the final proof.
    { script: "ops:readiness", timeout: 180_000 },
    { script: "project:report", timeout: 90_000 },
    { script: "ops:gaps", timeout: 60_000 },
    { script: "codexa:handoff", timeout: 60_000 },
    { script: "harness:benchmark", timeout: 90_000 },
    { script: "project:report", timeout: 90_000 },
    { script: "health:report", timeout: 90_000 },
    { script: "reality:watch", timeout: 90_000 },
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
  const ipiPath = path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json");
  const memoryPath = path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json");
  const actionPath = path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json");
  const skillsPath = path.join(dataRoot, "skills", "latest-skill-lifecycle.json");
  const localModelLanePath = path.join(dataRoot, "models", "latest-local-model-lane-eval.json");
  const activeCouncilPath = path.join(dataRoot, "active-council", "latest-active-council.json");
  const toolErgonomicsPath = path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json");
  const checkmatePath = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");
  const assurancePath = path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json");
  const horizonReviewPath = path.join(dataRoot, "horizon-review", "latest-horizon-review.json");
  const horizonBakeoffPath = path.join(dataRoot, "horizon-bakeoff", "latest-horizon-promotion-bakeoff.json");
  const toolmeshPhysicalPath = path.join(dataRoot, "v3", "toolmesh", "physical-runtime", "latest-physical-runtime-doctor.json");
  const elysiaLatencyPath = path.join(dataRoot, "api-bakeoff", "latest-elysia-rail-latency-bakeoff.json");
  const visualReadinessPath = path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json");
  const signalHygienePath = path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json");
  const sessionSpinePath = path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json");
  const opsGapLedgerPath = path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json");
  const codexaHandoffPath = path.join(dataRoot, "codexa-handoff", "latest-codexa-handoff.json");
  const featureProofPath = path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json");
  const openclawPath = path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json");
  const servicesPath = path.join(dataRoot, "services", "latest-ops-services.json");
  const backendPath = latestReceipt("orangebox-backend-install-");
  const opsReadinessPath = latestReceipt("orangebox-ops-readiness-");
  const controlDoctorPath = latestReceipt("orangebox-control-plane-doctor-");
  const controlSmokePath = latestReceipt("orangebox-bun-control-plane-smoke-");
  const finalVerifyPath = latestReceipt("orangebox-delta-final-package-");
  const finalManifestPath = path.join(repoRoot, "orangebox-delta-final-manifest.json");

  const health = readJson(healthPath);
  const project = readJson(projectPath);
  const reality = readJson(realityPath);
  const watcherHeartbeat = readJson(watcherHeartbeatPath);
  const harness = readJson(harnessPath);
  const mcp = readJson(mcpPath);
  const ipi = readJson(ipiPath);
  const memory = readJson(memoryPath);
  const action = readJson(actionPath);
  const skills = readJson(skillsPath);
  const localModelLane = readJson(localModelLanePath);
  const activeCouncil = readJson(activeCouncilPath);
  const toolErgonomics = readJson(toolErgonomicsPath);
  const checkmate = readJson(checkmatePath);
  const assurance = readJson(assurancePath);
  const horizonReview = readJson(horizonReviewPath);
  const horizonBakeoff = readJson(horizonBakeoffPath);
  const toolmeshPhysical = readJson(toolmeshPhysicalPath);
  const elysiaLatency = readJson(elysiaLatencyPath);
  const visualReadiness = readJson(visualReadinessPath);
  const signalHygiene = readJson(signalHygienePath);
  const sessionSpine = readJson(sessionSpinePath);
  const opsGapLedger = readJson(opsGapLedgerPath);
  const codexaHandoff = readJson(codexaHandoffPath);
  const featureProof = readJson(featureProofPath);
  const openclaw = readJson(openclawPath);
  const services = readJson(servicesPath);
  const backend = readJson(backendPath || "");
  const opsReadiness = readJson(opsReadinessPath || "");
  const controlDoctor = readJson(controlDoctorPath || "");
  const controlSmoke = readJson(controlSmokePath || "");
  const finalVerify = readJson(finalVerifyPath || "");
  const finalManifest = readJson(finalManifestPath);
  const runtimeProof = readProcessRuntimeProof();

  const watcherFresh = watcherHeartbeat?.ok === true && ageMs(watcherHeartbeat.last_finished) !== null && ageMs(watcherHeartbeat.last_finished) < 15 * 60 * 1000;
  const finalPackageGreen =
    finalVerify?.status === "ORANGEBOX_DELTA_FINAL_VERIFIED_GREEN" ||
    finalManifest?.status === "ORANGEBOX_DELTA_FINAL_VERIFIED_GREEN" ||
    (finalManifest?.ok === true && finalManifest?.verification?.ok === true);
  const gates = [
    gate("refresh_commands_green", noRefresh || commands.every(refreshCommandOk), {
      commands_run: commands.length,
      warning_only_failures: commands.filter((item) => !item.ok && refreshCommandOk(item)).map((item) => item.script),
      hard_failures: commands.filter((item) => !refreshCommandOk(item)).map((item) => item.script),
    }),
    gate("command_server_reachable", health?.dev?.probes?.command_server?.ok === true || services?.final_probes?.command_server?.ok === true, {
      ...(health?.dev?.probes?.command_server || {}),
      service_probe: services?.final_probes?.command_server || null,
    }),
    gate("api_server_reachable", health?.dev?.probes?.api_server?.ok === true || services?.final_probes?.api_server?.ok === true, {
      ...(health?.dev?.probes?.api_server || {}),
      service_probe: services?.final_probes?.api_server || null,
    }),
    gate("local_llama_listener_reachable", health?.dev?.probes?.local_llama_health?.ok === true || services?.final_probes?.local_llama_listener?.ok === true, {
      ...(health?.dev?.probes?.local_llama_health || {}),
      service_probe: services?.final_probes?.local_llama_listener || null,
    }),
    gate("strongarm_gate_reachable", health?.dev?.probes?.strongarm_gate?.ok === true || services?.final_probes?.strongarm_gate?.ok === true, {
      ...(health?.dev?.probes?.strongarm_gate || {}),
      service_probe: services?.final_probes?.strongarm_gate || null,
    }),
    gate("local_ops_project_green", project?.local_ops_green === true, { status: project?.status || null, gap_count: project?.gap_count ?? null }),
    gate("backend_install_green", backend?.ok === true && backend?.status === "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN", { path: backendPath, status: backend?.status || null }),
    gate("ops_readiness_green", opsReadiness?.ok === true && opsReadiness?.status === "ORANGEBOX_OPS_RAILS_GREEN", { path: opsReadinessPath, status: opsReadiness?.status || null }),
    gate("bun_control_plane_doctor_green", controlDoctor?.ok === true && controlDoctor?.summary?.failed === 0, {
      path: controlDoctorPath,
      status: controlDoctor?.ok === true ? "ORANGEBOX_BUN_CONTROL_PLANE_DOCTOR_GREEN" : null,
      checks: controlDoctor?.summary?.checks ?? null,
      passed: controlDoctor?.summary?.passed ?? null,
      failed: controlDoctor?.summary?.failed ?? null,
    }),
    gate("bun_control_plane_smoke_green", controlSmoke?.ok === true && (controlSmoke?.checks || []).every((item) => item.pass === true), {
      path: controlSmokePath,
      status: controlSmoke?.ok === true ? "ORANGEBOX_BUN_CONTROL_PLANE_SMOKE_GREEN" : null,
      checks: controlSmoke?.checks?.length ?? null,
    }),
    gate("bun_live_backend_runtime_green", runtimeProof.ok === true, runtimeProof),
    gate("final_package_verified", finalPackageGreen, {
      receipt_path: finalVerifyPath,
      manifest_path: exists(finalManifestPath) ? finalManifestPath : null,
      status: finalVerify?.status || finalManifest?.status || null,
    }),
    gate("mcp_quarantine_green", mcp?.ok === true && mcp?.summary?.failed === 0, { status: mcp?.ok === true ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN" }),
    gate("indirect_prompt_injection_green", ipi?.ok === true && ipi?.status === "ORANGEBOX_IPI_DRILLS_GREEN", {
      status: ipi?.status || null,
      fixtures_green: ipi?.summary?.fixtures_green ?? null,
      fixtures_total: ipi?.summary?.fixtures_total ?? null,
      untrusted_fixtures: ipi?.summary?.untrusted_fixtures ?? null,
    }),
    gate("memory_source_truth_green", memory?.ok === true && memory?.status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN", {
      status: memory?.status || null,
      drills_green: memory?.summary?.drills_green ?? null,
      drills_total: memory?.summary?.drills_total ?? null,
      stale_conflicts_detected: memory?.summary?.stale_conflicts_detected ?? null,
    }),
    gate("action_classifier_green", action?.ok === true && action?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN", { status: action?.status || null }),
    gate("skill_lifecycle_green", skills?.ok === true && skills?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN", { status: skills?.status || null, command_count: skills?.command_count ?? null }),
    gate("local_model_lane_eval_green", localModelLane?.ok === true && localModelLane?.status === "LOCAL_MODEL_LANE_EVAL_GREEN", {
      status: localModelLane?.status || null,
      fixtures_green: localModelLane?.packet_eval?.fixtures_green ?? null,
      fixtures_total: localModelLane?.packet_eval?.fixtures_total ?? null,
      core_installed_count: localModelLane?.inventory_truth?.core_installed_count ?? null,
      core_total: localModelLane?.inventory_truth?.core_total ?? null,
      full_local_model_runtime_green: localModelLane?.inventory_truth?.full_local_model_runtime_green ?? null,
    }),
    gate("active_council_green", ["ACTIVE_COUNCIL_GREEN", "ACTIVE_COUNCIL_PULSE_GREEN"].includes(activeCouncil?.status) && activeCouncil?.runtime_truth?.latest_pulse_fresh === true && activeCouncil?.runtime_truth?.watcher_status === "ACTIVE_COUNCIL_WATCHER_RUNNING", {
      status: activeCouncil?.status || null,
      pulse_fresh: activeCouncil?.runtime_truth?.latest_pulse_fresh ?? null,
      watcher_status: activeCouncil?.runtime_truth?.watcher_status || null,
      warm_models: activeCouncil?.active_posture?.warm_models || [],
      event_armed_models: activeCouncil?.active_posture?.event_armed_models || [],
      warrant_only_models: activeCouncil?.active_posture?.warrant_only_models || [],
    }),
    gate("tool_ergonomics_green", toolErgonomics?.ok === true && toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN", { status: toolErgonomics?.status || null, command_count: toolErgonomics?.command_surface?.command_count ?? null }),
    gate("checkmate_eval_lane_green", checkmate?.ok === true && checkmate?.status === "CHECKMATE_EVAL_LANE_GREEN", { status: checkmate?.status || null, fixtures_total: checkmate?.fixtures?.length ?? null }),
    gate("assurance_lab_green", assurance?.ok === true && assurance?.status === "ORANGEBOX_ASSURANCE_LAB_GREEN", { status: assurance?.status || null, source_count: assurance?.summary?.source_count ?? null }),
    gate("visual_production_readiness_green", visualReadiness?.ok === true && visualReadiness?.control_plane_green === true && visualReadiness?.summary?.visual_artifact_pipeline_ready === true, {
      status: visualReadiness?.status || null,
      visual_ready: visualReadiness?.visual_ready ?? null,
      visual_tool_cards: visualReadiness?.summary?.visual_tool_cards ?? null,
      runtime_ready_lanes: visualReadiness?.summary?.runtime_ready_lanes ?? null,
      smoke_artifact_path: visualReadiness?.summary?.smoke_artifact_path ?? null,
    }),
    gate("horizon_review_green", horizonReview?.ok === true && horizonReview?.status === "ORANGEBOX_HORIZON_REVIEW_READY", {
      status: horizonReview?.status || null,
      candidates_reviewed: horizonReview?.summary?.candidates_reviewed ?? null,
      hermes_pack_present: horizonReview?.summary?.hermes_pack_present ?? null,
      openclaw_retired: horizonReview?.summary?.openclaw_retired ?? null,
      visual_artifact_pipeline_ready: horizonReview?.summary?.visual_artifact_pipeline_ready ?? null,
    }),
    gate("horizon_promotion_bakeoff_green", horizonBakeoff?.ok === true && horizonBakeoff?.status === "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_READY", {
      status: horizonBakeoff?.status || null,
      candidates_total: horizonBakeoff?.summary?.candidates_total ?? null,
      waves_total: horizonBakeoff?.summary?.waves_total ?? null,
      promotable_now: horizonBakeoff?.summary?.promotable_now ?? null,
      goose_binary_found: horizonBakeoff?.summary?.goose_binary_found ?? null,
      openjarvis_eval_receipt_green: horizonBakeoff?.summary?.openjarvis_eval_receipt_green ?? null,
      visual_ready: horizonBakeoff?.summary?.visual_ready ?? null,
    }),
    gate("toolmesh_physical_runtime_green", toolmeshPhysical?.ok === true && toolmeshPhysical?.status === "ORANGEBOX_TOOLMESH_PHYSICAL_RUNTIME_GREEN" && toolmeshPhysical?.checks?.all_cards_physical_valid === true && toolmeshPhysical?.checks?.artifact_pointer_only_all_cards === true && toolmeshPhysical?.checks?.gui_tools_handoff_only === true, {
      status: toolmeshPhysical?.status || null,
      cards_total: toolmeshPhysical?.summary?.cards_total ?? null,
      pointerOnlyCount: toolmeshPhysical?.summary?.pointerOnlyCount ?? null,
      handoffRequiredCount: toolmeshPhysical?.summary?.handoffRequiredCount ?? null,
      maxVramRequiredGB: toolmeshPhysical?.summary?.hardwareSummary?.maxVramRequiredGB ?? null,
    }),
    gate("elysia_rail_latency_bakeoff_green", elysiaLatency?.ok === true && elysiaLatency?.status === "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN" && elysiaLatency?.benchmark?.latency_parity_green === true && elysiaLatency?.promotion?.default_api_replacement_approved === false, {
      status: elysiaLatency?.status || null,
      latency_parity_green: elysiaLatency?.benchmark?.latency_parity_green ?? null,
      elysia_p95_ms: elysiaLatency?.benchmark?.elysia_health_p95_ms ?? null,
      current_comparison_p95_ms: elysiaLatency?.benchmark?.current_comparison_p95_ms ?? null,
      default_api_replacement_approved: elysiaLatency?.promotion?.default_api_replacement_approved ?? null,
    }),
    gate("operator_signal_hygiene_green", signalHygiene?.ok === true && signalHygiene?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN", { status: signalHygiene?.status || null, severity: signalHygiene?.signal_hygiene?.severity || null }),
    gate("doer_watcher_spine_green", sessionSpine?.ok === true && sessionSpine?.status === "ORANGEBOX_DOER_WATCHER_SPINE_GREEN", { status: sessionSpine?.status || null, failures: sessionSpine?.failures?.length ?? null }),
    gate("ops_gap_ledger_current", opsGapLedger?.ok === true && ["ORANGEBOX_OPS_GAP_LEDGER_REPORTED_OPEN_GAPS", "ORANGEBOX_OPS_GAP_LEDGER_GREEN_NO_OPEN_GAPS"].includes(opsGapLedger?.status), {
      status: opsGapLedger?.status || null,
      gap_count: opsGapLedger?.gap_count ?? null,
      critical_gap_count: opsGapLedger?.critical_gap_count ?? null,
      full_system_green_claim_allowed: opsGapLedger?.full_system_green_claim_allowed ?? null,
    }),
    gate("codexa_handoff_current", codexaHandoff?.ok === true && ["CODEXA_HANDOFF_READY_WITH_OPEN_GAPS", "CODEXA_HANDOFF_READY_NO_OPEN_GAPS"].includes(codexaHandoff?.status), {
      status: codexaHandoff?.status || null,
      open_gap_count: codexaHandoff?.open_gap_count ?? null,
      first_click: codexaHandoff?.codexa_run_order?.[0]?.command || null,
    }),
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
      indirect_prompt_injection: ipiPath,
      memory_source_truth: memoryPath,
      local_model_lane_eval: localModelLanePath,
      active_council: activeCouncilPath,
      tool_ergonomics: toolErgonomicsPath,
    checkmate_eval_lane: checkmatePath,
    assurance_lab: assurancePath,
    visual_readiness: visualReadinessPath,
    horizon_review: horizonReviewPath,
    horizon_bakeoff: horizonBakeoffPath,
    toolmesh_physical_runtime: toolmeshPhysicalPath,
    elysia_latency_bakeoff: elysiaLatencyPath,
    signal_hygiene: signalHygienePath,
      doer_watcher_spine: sessionSpinePath,
      ops_gap_ledger: opsGapLedgerPath,
      codexa_handoff: codexaHandoffPath,
      ops_services: servicesPath,
      backend_install: backendPath,
      ops_readiness: opsReadinessPath,
      bun_control_plane_doctor: controlDoctorPath,
      bun_control_plane_smoke: controlSmokePath,
      bun_live_backend_runtime: runtimeProof,
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
