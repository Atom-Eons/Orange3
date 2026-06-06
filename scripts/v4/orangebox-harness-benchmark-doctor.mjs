#!/usr/bin/env node
/*
  orangebox-harness-benchmark-doctor.mjs

  Offline, deterministic harness tasks for Orangebox Ops. This is not a model
  benchmark and it does not call APIs. It verifies that the harness around the
  agents has oracle-checkable tasks, budget capture, traces, and receipts before
  routing/tool changes are promoted.
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
const backendProofInProgress = process.env.ORANGEBOX_BACKEND_PROOF_IN_PROGRESS === "1";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const reportRoot = path.join(dataRoot, "harness");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function readText(file, trace) {
  trace.files_read.push(file);
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}

function readJson(file, trace = null) {
  try {
    if (trace) trace.files_read.push(file);
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

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeSlash(file) {
  return String(file || "").replace(/\\/g, "/");
}

function scriptTargetExists(script) {
  const text = String(script || "");
  const refs = [...text.matchAll(/(?:node|tsx|prisma)\s+([^&|;\n]+?\.(?:mjs|js|ts|json|prisma))(?:\s|$)/gi)]
    .map((match) => match[1].trim().replace(/^['"]|['"]$/g, ""));
  const psRefs = [...text.matchAll(/(?:-File|--file)\s+([^&|;\n]+?\.ps1)(?:\s|$)/gi)]
    .map((match) => match[1].trim().replace(/^['"]|['"]$/g, ""));
  const allRefs = [...new Set([...refs, ...psRefs])]
    .filter((ref) => ref.includes("/") || ref.includes("\\") || ref.startsWith("."));
  return allRefs.map((ref) => {
    const clean = ref.replace(/^\.?[\\/]/, "").replace(/\\/g, path.sep).replace(/\//g, path.sep);
    const absolute = path.resolve(repoRoot, clean);
    return { ref, target: absolute, exists: exists(absolute) };
  });
}

function okTask(id, evidence = {}, score = 1) {
  return { id, ok: true, score, failures: [], evidence };
}

function failTask(id, failures, evidence = {}, score = 0) {
  return { id, ok: false, score, failures: Array.isArray(failures) ? failures : [failures], evidence };
}

async function runTask(task) {
  const started = Date.now();
  const trace = { files_read: [], receipts_read: [], tool_calls: [], notes: [] };
  try {
    const result = await task.run(trace);
    const durationMs = Date.now() - started;
    return {
      ...result,
      category: task.category,
      oracle: task.oracle,
      budget: task.budget,
      duration_ms: durationMs,
      budget_ok: durationMs <= task.budget.timeout_ms && trace.files_read.length <= task.budget.max_files_read,
      trace: {
        ...trace,
        files_read_count: trace.files_read.length,
        files_read: trace.files_read.map(normalizeSlash),
      },
    };
  } catch (error) {
    return {
      id: task.id,
      ok: false,
      score: 0,
      category: task.category,
      oracle: task.oracle,
      budget: task.budget,
      duration_ms: Date.now() - started,
      budget_ok: false,
      failures: [error.message],
      evidence: {},
      trace: {
        ...trace,
        files_read_count: trace.files_read.length,
        files_read: trace.files_read.map(normalizeSlash),
      },
    };
  }
}

const requiredOpsScripts = [
  "backend:proof",
  "final:verify",
  "health:report",
  "project:report",
  "research:scout",
  "knowledge:improvements",
  "harness:benchmark",
  "codexa:alert",
  "codexa:smb-stage",
  "mcp:doctor",
  "action:doctor",
  "skills:lifecycle",
];

const tasks = [
  {
    id: "ops_script_reference_integrity",
    category: "workspace_tooling",
    oracle: "Required Ops scripts exist and every obvious local file reference resolves inside the repo.",
    budget: { timeout_ms: 1500, max_files_read: 1, max_tool_calls: 0 },
    run(trace) {
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const failures = [];
      for (const scriptName of requiredOpsScripts) {
        if (!packageJson?.scripts?.[scriptName]) failures.push(`Missing package script ${scriptName}`);
      }
      const refRows = Object.entries(packageJson?.scripts || {})
        .filter(([name]) => requiredOpsScripts.includes(name))
        .flatMap(([name, script]) => scriptTargetExists(script).map((row) => ({ script: name, ...row })));
      for (const row of refRows) {
        if (!row.exists) failures.push(`Script ${row.script} references missing file ${row.ref}`);
      }
      return failures.length
        ? failTask("ops_script_reference_integrity", failures, { refs_checked: refRows.length })
        : okTask("ops_script_reference_integrity", { scripts_checked: requiredOpsScripts.length, refs_checked: refRows.length });
    },
  },
  {
    id: "skill_command_roundtrip",
    category: "skill_lifecycle",
    oracle: "Primer skill advertises real commands and the wrapper routes them to package scripts.",
    budget: { timeout_ms: 1500, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const skillMd = readText(path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md"), trace);
      const wrapper = readText(path.join(repoRoot, "skills", "orangebox-primer", "scripts", "orangebox_command.ps1"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const commands = ["backend-proof", "health-report", "project-report", "research-scout", "harness-benchmark", "codexa-alert", "codexa-smb-stage"];
      const failures = [];
      for (const command of commands) {
        if (!skillMd.includes(command)) failures.push(`SKILL.md does not list ${command}`);
        if (!wrapper.includes(`"${command}"`)) failures.push(`orangebox_command.ps1 does not wrap ${command}`);
      }
      if (!packageJson?.scripts?.["harness:benchmark"]) failures.push("Package script harness:benchmark missing");
      return failures.length
        ? failTask("skill_command_roundtrip", failures, { commands_checked: commands.length })
        : okTask("skill_command_roundtrip", { commands_checked: commands.length });
    },
  },
  {
    id: "receipt_reality_trace",
    category: "receipt_provenance",
    oracle: "Critical proof receipts exist, expose status fields, and do not rely on chat summaries.",
    budget: { timeout_ms: 2000, max_files_read: 14, max_tool_calls: 0 },
    run(trace) {
      const receiptSpecs = [
        ["mcp", path.join(dataRoot, "mcp", "latest-mcp-doctor.json"), "MCP_QUARANTINE_GREEN"],
        ["action", path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"), "ORANGEBOX_ACTION_CLASSIFIER_GREEN"],
        ["skills", path.join(dataRoot, "skills", "latest-skill-lifecycle.json"), "ORANGEBOX_SKILL_LIFECYCLE_GREEN"],
      ];
      if (!backendProofInProgress) {
        receiptSpecs.unshift(
          ["backend_install", latestReceipt("orangebox-backend-install-"), "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN"],
          ["ops_readiness", latestReceipt("orangebox-ops-readiness-"), "ORANGEBOX_OPS_RAILS_GREEN"],
        );
      } else {
        trace.notes.push("backend_install and ops_readiness receipts are checked after backend proof completes; this harness run is inside backend proof.");
      }
      const failures = [];
      const statuses = {};
      for (const [name, file, expected] of receiptSpecs) {
        if (!file || !exists(file)) {
          failures.push(`Missing receipt ${name}`);
          continue;
        }
        trace.receipts_read.push(file);
        const parsed = readJson(file, trace);
        const status = parsed?.status || parsed?.summary?.status || (parsed?.ok && name === "mcp" ? "MCP_QUARANTINE_GREEN" : null);
        statuses[name] = status;
        if (status !== expected) failures.push(`Receipt ${name} status ${status || "missing"} != ${expected}`);
      }
      return failures.length
        ? failTask("receipt_reality_trace", failures, { statuses })
        : okTask("receipt_reality_trace", { statuses });
    },
  },
  {
    id: "codexa_gap_truth_guard",
    category: "state_adaptation",
    oracle: "If Codexa rails or Ollama are down, reports must preserve warning state and refuse full-project green.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const health = readJson(path.join(dataRoot, "reports", "health", "latest-health-report.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const alert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"), trace);
      const failures = [];
      const commandRailUp = alert?.command_rail_reachable === true;
      const ollamaUp = alert?.ollama_reachable === true;
      if (!commandRailUp || !ollamaUp) {
        if (health?.status !== "ORANGEBOX_HEALTH_DEV_GREEN_AIBOX_WARN") failures.push(`Health status should warn while Codexa is down, got ${health?.status}`);
        if (project?.full_project_green !== false) failures.push("Project report must not claim full_project_green while Codexa is down");
        if (!Array.isArray(health?.warnings) || !health.warnings.some((warning) => /AI Box|Codexa/i.test(warning))) failures.push("Health report lacks AI Box/Codexa warning");
      }
      return failures.length
        ? failTask("codexa_gap_truth_guard", failures, { command_rail_reachable: commandRailUp, ollama_reachable: ollamaUp, health_status: health?.status, full_project_green: project?.full_project_green })
        : okTask("codexa_gap_truth_guard", { command_rail_reachable: commandRailUp, ollama_reachable: ollamaUp, health_status: health?.status, full_project_green: project?.full_project_green });
    },
  },
  {
    id: "codexa_signal_hygiene_truth",
    category: "operator_signal_hygiene",
    oracle: "Codexa warnings must be machine-readable, fatigue-aware, and explicit that local install is not blocked while full two-machine green is gated.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const alert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      const hygiene = alert?.signal_hygiene || {};
      if (hygiene.version !== "orangebox-signal-hygiene/v1") failures.push(`Signal hygiene version missing/wrong: ${hygiene.version || "missing"}`);
      if (!["attention", "warning", "green", "critical"].includes(hygiene.severity)) failures.push(`Signal hygiene severity invalid: ${hygiene.severity || "missing"}`);
      if (hygiene.local_basic_install_blocked !== false) failures.push("Signal hygiene must preserve local_basic_install_blocked=false for Codexa-only gaps");
      if (hygiene.full_system_green_blocked !== true) failures.push("Signal hygiene must keep full_system_green_blocked=true while Codexa rail/Ollama are down");
      if (!hygiene.alert_fatigue_policy || !/cooldown|status change/i.test(hygiene.alert_fatigue_policy)) failures.push("Signal hygiene lacks popup cooldown/status-change policy");
      if (project?.evidence?.codexa_signal_hygiene?.summary_line !== hygiene.summary_line) failures.push("Project report does not mirror Codexa signal summary");
      return failures.length
        ? failTask("codexa_signal_hygiene_truth", failures, {
          version: hygiene.version,
          severity: hygiene.severity,
          local_basic_install_blocked: hygiene.local_basic_install_blocked,
          full_system_green_blocked: hygiene.full_system_green_blocked,
        })
        : okTask("codexa_signal_hygiene_truth", {
          version: hygiene.version,
          severity: hygiene.severity,
          repeat_count: hygiene.repeat_count || 0,
          local_basic_install_blocked: hygiene.local_basic_install_blocked,
          full_system_green_blocked: hygiene.full_system_green_blocked,
        });
    },
  },
  {
    id: "terminal_obox_affordance_truth",
    category: "operator_signal_hygiene",
    oracle: "A fresh terminal must have a visible OB0X ON path without startup spam, and reports must preserve the proof receipt.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const profilePath = path.join(userRoot, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
      const profile = exists(profilePath) ? readText(profilePath, trace) : "";
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const latestProfileReceipt = latestReceipt("orangebox-powershell-profile-policy-", path.join(dataRoot, "profile-backups"));
      const receipt = latestProfileReceipt ? readJson(latestProfileReceipt, trace) : null;
      const failures = [];
      if (!profile.includes("function obox")) failures.push("PowerShell profile missing obox function");
      if (!profile.includes("function obox-off")) failures.push("PowerShell profile missing obox-off function");
      if (!profile.includes("ORANGEBOX_ACTIVE")) failures.push("PowerShell profile missing ORANGEBOX_ACTIVE state");
      if (/Agent Colors Loaded!/i.test(profile)) failures.push("PowerShell profile still contains startup spam text");
      if (receipt?.status !== "ORANGEBOX_POWERSHELL_PROFILE_ENABLED") failures.push(`Profile receipt status wrong/missing: ${receipt?.status || "missing"}`);
      if (receipt?.current_user_policy_after !== "RemoteSigned") failures.push(`Profile execution policy proof wrong/missing: ${receipt?.current_user_policy_after || "missing"}`);
      if (project?.evidence?.terminal_obox_profile?.status !== "ORANGEBOX_TERMINAL_AFFORDANCE_GREEN") failures.push("Project report does not mark terminal affordance green");
      return failures.length
        ? failTask("terminal_obox_affordance_truth", failures, {
          profile_path: profilePath,
          receipt_path: latestProfileReceipt,
          project_status: project?.evidence?.terminal_obox_profile?.status || null,
        })
        : okTask("terminal_obox_affordance_truth", {
          profile_path: profilePath,
          receipt_path: latestProfileReceipt,
          current_user_policy_after: receipt?.current_user_policy_after,
          project_status: project?.evidence?.terminal_obox_profile?.status,
        });
    },
  },
  {
    id: "frontend_quarantine_backend_lane",
    category: "scope_control",
    oracle: "Backend proof and final package stay independent from frontend build/proof lanes.",
    budget: { timeout_ms: 1600, max_files_read: 5, max_tool_calls: 0 },
    run(trace) {
      const backendInstall = readJson(latestReceipt("orangebox-backend-install-") || "", trace);
      const finalPackage = readJson(latestReceipt("orangebox-delta-final-package-") || "", trace)
        || readJson(path.join(repoRoot, "orangebox-delta-final-manifest.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const backendScripts = [
        packageJson?.scripts?.["backend:proof"],
        packageJson?.scripts?.["health:report"],
        packageJson?.scripts?.["project:report"],
        packageJson?.scripts?.["harness:benchmark"],
      ].join("\n");
      const failures = [];
      if (/\b(build:web|frontend:proof|frontend\/scripts|@ae-see-suite\/web)\b/.test(backendScripts)) failures.push("Backend Ops scripts reference frontend proof/build lanes");
      const frontendDirExists = exists(path.join(repoRoot, "frontend"));
      const backendInstallProved = backendProofInProgress || backendInstall?.frontend_required_for_backend === false;
      const finalPackageProved = finalPackage
        ? finalPackage.frontend_included === false && finalPackage.frontend_required_for_backend === false
        : !frontendDirExists;
      if (!backendInstallProved) failures.push("Backend install receipt does not prove frontend_required_for_backend=false");
      if (!finalPackageProved) failures.push("Final package receipt/manifest does not prove frontend exclusion/backend independence");
      return failures.length
        ? failTask("frontend_quarantine_backend_lane", failures, {
          backend_frontend_required: backendInstall?.frontend_required_for_backend ?? (backendProofInProgress ? false : null),
          final_frontend_included: finalPackage?.frontend_included ?? frontendDirExists,
          final_evidence: finalPackage ? "receipt_or_manifest" : "frontend_dir_absence",
        })
        : okTask("frontend_quarantine_backend_lane", {
          backend_frontend_required: backendInstall?.frontend_required_for_backend ?? (backendProofInProgress ? false : null),
          final_frontend_included: finalPackage?.frontend_included ?? frontendDirExists,
          final_evidence: finalPackage ? "receipt_or_manifest" : "frontend_dir_absence",
        });
    },
  },
  {
    id: "research_to_approval_queue",
    category: "knowledge_evidence",
    oracle: "External research can create candidates, but Knowledge Engine keeps them in an approval queue instead of self-promoting.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const scout = readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json"), trace);
      const improvements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"), trace);
      const failures = [];
      if (!["EXTERNAL_RESEARCH_SCOUT_READY", "EXTERNAL_RESEARCH_SCOUT_DEGRADED"].includes(scout?.status)) failures.push(`Research scout status not usable: ${scout?.status || "missing"}`);
      if ((scout?.candidate_count || 0) < 1) failures.push("Research scout has no candidates");
      if (improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") failures.push(`Knowledge improvement queue not ready: ${improvements?.status || "missing"}`);
      if (improvements?.not_autonomous !== true && !/Do not self-promote/i.test(improvements?.doctrine || "")) failures.push("Knowledge improvements do not explicitly block autonomous self-promotion");
      return failures.length
        ? failTask("research_to_approval_queue", failures, { research_status: scout?.status, research_candidates: scout?.candidate_count, improvement_status: improvements?.status })
        : okTask("research_to_approval_queue", { research_status: scout?.status, research_candidates: scout?.candidate_count, improvement_status: improvements?.status, improvement_candidates: improvements?.candidate_count || 0 });
    },
  },
  {
    id: "structured_verdict_lane_truth",
    category: "structured_verdicts",
    oracle: "STRONGARM and Misfits are proven as local pressure gates/datasets, without claiming unperformed model training.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const strongarm = readJson(path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"), trace);
      const gremlin = readJson(path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"), trace);
      const failures = [];
      if (strongarm?.status !== "STRONGARM_ORANGEBOX_GATE_GREEN") failures.push(`STRONGARM not green: ${strongarm?.status || "missing"}`);
      if (gremlin?.status !== "GREMLIN_MISFITS_ELITE_GREEN") failures.push(`Gremlin/Misfits not green: ${gremlin?.status || "missing"}`);
      if ((gremlin?.elite_proof?.rows || 0) !== 1000) failures.push(`Elite Gremlin row count expected 1000, got ${gremlin?.elite_proof?.rows || 0}`);
      if (gremlin?.training?.status !== "NOT_TRAINED_YET") failures.push(`Gremlin training status should remain honest NOT_TRAINED_YET, got ${gremlin?.training?.status || "missing"}`);
      return failures.length
        ? failTask("structured_verdict_lane_truth", failures, { strongarm_status: strongarm?.status, gremlin_status: gremlin?.status, rows: gremlin?.elite_proof?.rows, training_status: gremlin?.training?.status })
        : okTask("structured_verdict_lane_truth", { strongarm_status: strongarm?.status, gremlin_status: gremlin?.status, rows: gremlin?.elite_proof?.rows, training_status: gremlin?.training?.status });
    },
  },
  {
    id: "local_model_router_claims",
    category: "model_routing",
    oracle: "Tri-lane router can be policy-green while installed model counts remain explicit and uninflated.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const trilane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      if (trilane?.status !== "TRILANE_ROUTER_PACK_GREEN") failures.push(`Tri-lane router not green: ${trilane?.status || "missing"}`);
      const installed = trilane?.availability?.core_installed_count;
      const total = trilane?.availability?.core_total;
      if (!Number.isInteger(installed) || !Number.isInteger(total)) failures.push("Tri-lane installed/core totals missing");
      if (installed > total) failures.push(`Installed model count ${installed} exceeds total ${total}`);
      if ((installed || 0) < (total || 0) && project?.models?.installed_core_count !== installed) failures.push("Project report does not mirror installed core model count");
      return failures.length
        ? failTask("local_model_router_claims", failures, { installed, total, project_installed: project?.models?.installed_core_count })
        : okTask("local_model_router_claims", { installed, total, project_installed: project?.models?.installed_core_count });
    },
  },
  {
    id: "codexa_setup_contract_truth",
    category: "codexa_recovery",
    oracle: "OBOX2 setup package must prove always-on power, rail recovery, model install, wildcard discipline, and optional Hermes contracts before being handed to Codexa.",
    budget: { timeout_ms: 1600, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const doctor = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"), trace);
      const failures = [];
      const contracts = doctor?.operational_contracts || {};
      const checks = Array.isArray(contracts.checks) ? contracts.checks : [];
      const ids = new Set(checks.map((check) => check.id));
      const required = [
        "power_disables_ac_sleep",
        "power_disables_ac_hibernate",
        "power_disables_ac_disk_idle",
        "rail_registers_startup_logon_tasks",
        "rail_runs_as_system_highest",
        "rail_has_restart_policy",
        "rail_firewall_trusted_ips",
        "rail_local_health_probe",
        "start_here_calls_power_optimizer",
        "start_here_calls_rail_starter",
        "model_installer_tiered",
        "model_installer_missing_required",
        "model_doctor_missing_core",
        "hermes_install_orangebox_control_plane_note",
        "readme_wildcard_law",
      ];
      if (doctor?.status !== "OBOX2_PACKAGE_VERIFIED_GREEN") failures.push(`OBOX2 doctor status not green: ${doctor?.status || "missing"}`);
      if (contracts.ok !== true) failures.push("OBOX2 operational contracts are not green");
      if (checks.length < 30) failures.push(`OBOX2 operational contract check count too low: ${checks.length}`);
      const missing = required.filter((id) => !ids.has(id));
      if (missing.length > 0) failures.push(`OBOX2 operational contracts missing required ids: ${missing.join(", ")}`);
      return failures.length
        ? failTask("codexa_setup_contract_truth", failures, {
          status: doctor?.status || null,
          contract_ok: contracts.ok === true,
          check_count: checks.length,
        })
        : okTask("codexa_setup_contract_truth", {
          status: doctor.status,
          contract_ok: contracts.ok,
          check_count: checks.length,
          zip_path: doctor.zip_path,
        });
    },
  },
];

async function main() {
  const startedAt = new Date();
  const results = [];
  for (const task of tasks) {
    results.push(await runTask(task));
  }
  const okCount = results.filter((task) => task.ok && task.budget_ok).length;
  const failures = results.flatMap((task) => {
    const rows = [];
    if (!task.ok) rows.push(...task.failures.map((failure) => ({ task_id: task.id, failure })));
    if (!task.budget_ok) rows.push({ task_id: task.id, failure: "budget exceeded" });
    return rows;
  });
  const categories = [...new Set(results.map((task) => task.category))];
  const budgetSummary = {
    total_duration_ms: results.reduce((sum, task) => sum + task.duration_ms, 0),
    max_task_duration_ms: Math.max(...results.map((task) => task.duration_ms)),
    files_read_total: results.reduce((sum, task) => sum + task.trace.files_read_count, 0),
    tool_calls_total: results.reduce((sum, task) => sum + task.trace.tool_calls.length, 0),
  };
  const result = {
    ok: failures.length === 0,
    version: "orangebox-harness-benchmark-doctor/v1",
    status: failures.length === 0 ? "ORANGEBOX_HARNESS_BENCHMARK_GREEN" : "ORANGEBOX_HARNESS_BENCHMARK_NOT_GREEN",
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    backend_proof_in_progress: backendProofInProgress,
    doctrine: "Offline tasks, deterministic oracle graders, shared budgets, tool traces, and receipts before claiming model, routing, or tool-harness improvements.",
    research_basis: [
      "Harness Bench style: sandboxed offline agent tasks, traces, budgets, artifact/oracle grading.",
      "Tool ergonomics: namespaced commands, concise tool outputs, and eval-driven tool repair.",
      "Context engineering: preserve project state outside chat and hydrate only what a task needs.",
      "Operator signal hygiene: visible status, popup throttling, and confidence calibration protect human-machine shared reality.",
    ],
    tasks_total: results.length,
    tasks_ok: okCount,
    categories,
    score: Number((okCount / results.length).toFixed(4)),
    budget_summary: budgetSummary,
    suite_hash: hashObject(results.map((task) => ({ id: task.id, ok: task.ok, score: task.score, evidence: task.evidence }))),
    tasks: results,
    failures,
  };

  await writeJson(path.join(reportRoot, "latest-harness-benchmark.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-harness-benchmark-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(reportRoot, "latest-harness-benchmark.json"), result);
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
