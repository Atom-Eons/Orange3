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
  "assurance:doctor",
  "tool:ergonomics",
  "checkmate:doctor",
  "signal:hygiene",
  "session:spine",
  "feature:proof",
  "harness:benchmark",
  "chatbackup:restore",
  "codexa:alert",
  "codexa:smb-stage",
  "mcp:doctor",
  "ipi:doctor",
  "memory:doctor",
  "action:doctor",
  "skills:lifecycle",
  "model:lane-eval",
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
    budget: { timeout_ms: 1500, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const skillMd = readText(path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md"), trace);
      const wrapper = readText(path.join(repoRoot, "skills", "orangebox-primer", "scripts", "orangebox_command.ps1"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const lifecycle = readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json"), trace);
      const commands = ["backend-proof", "health-report", "project-report", "research-scout", "assurance-doctor", "harness-benchmark", "tool-ergonomics", "checkmate-eval", "signal-hygiene", "session-spine", "feature-proof", "codexa-alert", "codexa-smb-stage", "skills-lifecycle", "model-lane-eval", "ipi-doctor", "memory-doctor"];
      const failures = [];
      for (const command of commands) {
        if (!skillMd.includes(command)) failures.push(`SKILL.md does not list ${command}`);
        if (!wrapper.includes(`"${command}"`)) failures.push(`orangebox_command.ps1 does not wrap ${command}`);
      }
      if (!packageJson?.scripts?.["harness:benchmark"]) failures.push("Package script harness:benchmark missing");
      if (lifecycle?.compression_proof?.status !== "SKILL_COMPRESSION_GREEN") failures.push(`Skill compression proof not green: ${lifecycle?.compression_proof?.status || "missing"}`);
      if (lifecycle?.compression_proof?.wrapper_mapping_rate !== 1) failures.push(`Skill wrapper mapping rate not 1: ${lifecycle?.compression_proof?.wrapper_mapping_rate ?? "missing"}`);
      if ((lifecycle?.compression_proof?.command_count || 0) < 26) failures.push(`Skill command count too low: ${lifecycle?.compression_proof?.command_count || 0}`);
      return failures.length
        ? failTask("skill_command_roundtrip", failures, { commands_checked: commands.length, compression_status: lifecycle?.compression_proof?.status || null })
        : okTask("skill_command_roundtrip", { commands_checked: commands.length, compression_status: lifecycle?.compression_proof?.status, compression_command_count: lifecycle?.compression_proof?.command_count });
    },
  },
  {
    id: "receipt_reality_trace",
    category: "receipt_provenance",
    oracle: "Critical proof receipts exist, expose status fields, and do not rely on chat summaries.",
    budget: { timeout_ms: 2000, max_files_read: 15, max_tool_calls: 0 },
    run(trace) {
      const receiptSpecs = [
        ["mcp", path.join(dataRoot, "mcp", "latest-mcp-doctor.json"), "MCP_QUARANTINE_GREEN"],
        ["ipi", path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"), "ORANGEBOX_IPI_DRILLS_GREEN"],
        ["action", path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"), "ORANGEBOX_ACTION_CLASSIFIER_GREEN"],
        ["skills", path.join(dataRoot, "skills", "latest-skill-lifecycle.json"), "ORANGEBOX_SKILL_LIFECYCLE_GREEN"],
        ["tool_ergonomics", path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"), "ORANGEBOX_TOOL_ERGONOMICS_GREEN"],
        ["checkmate", path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"), "CHECKMATE_EVAL_LANE_GREEN"],
        ["session_spine", path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"), "ORANGEBOX_DOER_WATCHER_SPINE_GREEN"],
        ["feature_proof", path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN"],
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
    id: "indirect_prompt_injection_truth",
    category: "agent_security",
    oracle: "Untrusted text from external channels must be quarantined as data and cannot become executable tool instructions.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const ipi = readJson(path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      const drills = Array.isArray(ipi?.drills) ? ipi.drills : [];
      const untrusted = drills.filter((drill) => drill.trusted === false);
      if (ipi?.status !== "ORANGEBOX_IPI_DRILLS_GREEN") failures.push(`IPI doctor not green: ${ipi?.status || "missing"}`);
      if (ipi?.constraints?.command_executed !== false) failures.push("IPI doctor must prove command_executed=false");
      if (ipi?.constraints?.network_called !== false) failures.push("IPI doctor must prove network_called=false");
      if (ipi?.constraints?.sensitive_trace_disclosed_to_untrusted !== false) failures.push("IPI doctor must prove sensitive_trace_disclosed_to_untrusted=false");
      if ((ipi?.summary?.fixtures_green || 0) !== (ipi?.summary?.fixtures_total || -1)) failures.push("Not all IPI fixtures are green");
      if (untrusted.length < 5) failures.push(`Untrusted fixture count too low: ${untrusted.length}`);
      if (untrusted.some((drill) => drill.final_disposition !== "quarantine_untrusted_text")) failures.push("At least one untrusted drill was not quarantined");
      if (!untrusted.some((drill) => drill.classifier_observed_dispositions?.includes("allow"))) failures.push("No benign-untrusted allow case proved quarantine still wins");
      if (!untrusted.some((drill) => drill.classifier_observed_dispositions?.includes("block"))) failures.push("No blocked malicious case observed");
      if (!untrusted.some((drill) => drill.classifier_observed_dispositions?.includes("stage_for_confirmation"))) failures.push("No staged state-change case observed");
      if ((ipi?.summary?.trace_hygiene_fixtures || 0) < 1) failures.push("No tool-output trace-hygiene fixture proved");
      if (!drills.some((drill) => drill.id === "tool_output_trace_topology_smuggle" && drill.sensitive_trace_leaked === false && drill.classifier_observed_dispositions?.includes("block"))) {
        failures.push("Tool-output trace topology smuggle drill missing or not blocked/sanitized");
      }
      if (project?.evidence?.ipi_doctor?.status !== "ORANGEBOX_IPI_DRILLS_GREEN") failures.push("Project report does not mirror IPI doctor green status");
      return failures.length
        ? failTask("indirect_prompt_injection_truth", failures, {
          status: ipi?.status || null,
          fixtures_green: ipi?.summary?.fixtures_green ?? null,
          fixtures_total: ipi?.summary?.fixtures_total ?? null,
          untrusted_count: untrusted.length,
          trace_hygiene_fixtures: ipi?.summary?.trace_hygiene_fixtures ?? null,
        })
        : okTask("indirect_prompt_injection_truth", {
          status: ipi.status,
          fixtures_green: ipi.summary.fixtures_green,
          fixtures_total: ipi.summary.fixtures_total,
          untrusted_count: untrusted.length,
          trace_hygiene_fixtures: ipi.summary.trace_hygiene_fixtures,
          drill_hash: ipi.summary.drill_hash,
        });
    },
  },
  {
    id: "memory_source_truth",
    category: "memory_interference",
    oracle: "Latest source-backed receipt truth must beat stale chat memory, preserve multi-target status, dereference source pointers, and avoid raw-history flooding.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const memory = readJson(path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      const drills = Array.isArray(memory?.drills) ? memory.drills : [];
      const byId = new Map(drills.map((drill) => [drill.id, drill]));
      if (memory?.status !== "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN") failures.push(`Memory/source-truth doctor not green: ${memory?.status || "missing"}`);
      if (memory?.constraints?.raw_history_injected !== false) failures.push("Memory/source-truth doctor must prove raw_history_injected=false");
      if ((memory?.summary?.drills_green || 0) !== (memory?.summary?.drills_total || -1)) failures.push("Not all memory/source-truth drills are green");
      if (Number(memory?.summary?.stale_conflicts_detected || 0) < 1) failures.push("No stale revised-fact conflict was detected");
      if (byId.get("revised_fact_latest_wins")?.selected_value !== "DEAD") failures.push("Latest revised Codexa rail fact did not win");
      if (byId.get("multi_target_no_collapse")?.selected_status !== "CODEXA_PARTIAL_OR_WARN") failures.push("Multi-target Codexa state collapsed into the wrong status");
      if (byId.get("source_index_dereference")?.ok !== true) failures.push("Source pointer dereference drill failed");
      if (byId.get("raw_history_budget_guard")?.raw_history_included !== false) failures.push("Raw history was included in hot memory packet");
      if (project?.evidence?.memory_doctor?.status !== "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN") failures.push("Project report does not mirror memory/source-truth green status");
      return failures.length
        ? failTask("memory_source_truth", failures, {
          status: memory?.status || null,
          drills_green: memory?.summary?.drills_green ?? null,
          drills_total: memory?.summary?.drills_total ?? null,
          stale_conflicts_detected: memory?.summary?.stale_conflicts_detected ?? null,
        })
        : okTask("memory_source_truth", {
          status: memory.status,
          drills_green: memory.summary.drills_green,
          drills_total: memory.summary.drills_total,
          stale_conflicts_detected: memory.summary.stale_conflicts_detected,
          proof_hash: memory.summary.proof_hash,
        });
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
    id: "operator_signal_hygiene_receipt_truth",
    category: "operator_signal_hygiene",
    oracle: "Operator signal hygiene must have its own receipt that verifies cadence, severity labels, confidence calibration, and local/full green separation.",
    budget: { timeout_ms: 1600, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const signal = readJson(path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json"), trace);
      const failures = [];
      if (signal?.status !== "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN") failures.push(`Signal hygiene receipt not green: ${signal?.status || "missing"}`);
      if (signal?.constraints?.frontend_touched !== false) failures.push("Signal hygiene doctor must not touch frontend");
      if (signal?.constraints?.popup_created_by_this_doctor !== false) failures.push("Signal hygiene doctor must not create popups");
      if (!signal?.confidence_calibration?.local_ops) failures.push("Signal hygiene lacks confidence calibration");
      if (signal?.operator_transparency?.version !== "orangebox-operator-transparency/v1") failures.push("Signal hygiene lacks operator transparency lifecycle");
      if (!signal?.operator_transparency?.level_1_status?.current_alert) failures.push("Operator transparency lacks Level 1 status");
      if (!signal?.operator_transparency?.level_2_rationale?.full_system_blocked_reason) failures.push("Operator transparency lacks Level 2 rationale");
      if (!signal?.operator_transparency?.level_3_foresight?.next_safe_action) failures.push("Operator transparency lacks Level 3 foresight");
      if (!signal?.operator_transparency?.after_action_review?.receipts?.health) failures.push("Operator transparency lacks after-action receipt links");
      if (!Array.isArray(signal?.checks) || signal.checks.length < 6) failures.push("Signal hygiene check count too low");
      if (Array.isArray(signal?.failures) && signal.failures.length > 0) failures.push(`Signal hygiene failures: ${signal.failures.join(", ")}`);
      return failures.length
        ? failTask("operator_signal_hygiene_receipt_truth", failures, {
          status: signal?.status || null,
          constraints: signal?.constraints || null,
        })
        : okTask("operator_signal_hygiene_receipt_truth", {
          status: signal.status,
          checks: signal.checks.length,
          proof_hash: signal.proof_hash,
          confidence_calibration: signal.confidence_calibration,
          operator_transparency: {
            version: signal.operator_transparency.version,
            full_green_gate: signal.operator_transparency.level_3_foresight.full_green_gate,
          },
        });
    },
  },
  {
    id: "doer_watcher_session_spine_truth",
    category: "doer_watcher_session_spine",
    oracle: "Orangebox must prove an active doer, a fresh watcher, and one shared reality without touching frontend or hiding Codexa gaps.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const spine = readJson(path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      if (spine?.status !== "ORANGEBOX_DOER_WATCHER_SPINE_GREEN") failures.push(`Doer/watcher spine not green: ${spine?.status || "missing"}`);
      if (spine?.constraints?.frontend_touched !== false || spine?.constraints?.visual_lane_touched !== false) failures.push("Doer/watcher spine must not touch frontend or visual lane");
      if (spine?.doer?.command_server?.ok !== true) failures.push("Doer command server is not proven reachable");
      if (spine?.watcher?.watcher_process?.ok !== true) failures.push("Watcher process heartbeat is not proven");
      if (Number(spine?.watcher?.watcher_process?.age_ms || 999999999) > 15 * 60 * 1000) failures.push("Watcher process heartbeat is stale");
      if (spine?.one_reality?.codexa_status !== "CODEXA_READY" && spine?.one_reality?.full_system_green_blocked !== true) failures.push("Spine must keep full_system_green_blocked=true while Codexa is not ready");
      if (project?.evidence?.doer_watcher_spine?.status !== "ORANGEBOX_DOER_WATCHER_SPINE_GREEN") failures.push("Project report does not mirror doer/watcher spine green status");
      return failures.length
        ? failTask("doer_watcher_session_spine_truth", failures, {
          status: spine?.status || null,
          constraints: spine?.constraints || null,
          one_reality: spine?.one_reality || null,
        })
        : okTask("doer_watcher_session_spine_truth", {
          status: spine.status,
          doer_command_server_ok: spine.doer.command_server.ok,
          watcher_process_age_ms: spine.watcher.watcher_process.age_ms,
          codexa_status: spine.one_reality.codexa_status,
        });
    },
  },
  {
    id: "feature_acceptance_matrix_truth",
    category: "feature_proof",
    oracle: "Every Orangebox feature claim must have explicit status, evidence, a proof command, and rollback or recovery truth.",
    budget: { timeout_ms: 1600, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      const matrix = Array.isArray(feature?.matrix) ? feature.matrix : [];
      if (feature?.status !== "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN") failures.push(`Feature acceptance matrix not green: ${feature?.status || "missing"}`);
      if (matrix.length < 15) failures.push(`Feature matrix too small: ${matrix.length}`);
      if ((feature?.failures || []).length > 0) failures.push(`Feature matrix has ${feature.failures.length} failure(s)`);
      if (matrix.some((row) => !row.proof_command || !String(row.proof_command).includes("npm.cmd run"))) failures.push("At least one feature row lacks an npm proof command");
      if (matrix.some((row) => !row.rollback_path && !row.recovery_path)) failures.push("At least one feature row lacks rollback or recovery path");
      if (matrix.some((row) => row.lane === "backend_ops" && row.frontend_touch_allowed !== false)) failures.push("At least one backend feature allows frontend touch");
      if (!matrix.some((row) => row.id === "codexa_two_machine_runtime" && ["BLOCKED", "REAL"].includes(row.status))) failures.push("Codexa two-machine runtime row missing or invalid");
      if (!matrix.some((row) => row.id === "visual_frontend_lane" && row.status === "SEPARATE_LANE")) failures.push("Visual/frontend separate-lane row missing");
      if (!backendProofInProgress && project?.evidence?.feature_proof?.status !== "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN") failures.push("Project report does not mirror feature proof green status");
      return failures.length
        ? failTask("feature_acceptance_matrix_truth", failures, {
          status: feature?.status || null,
          features_total: feature?.features_total || 0,
          features_green: feature?.features_green || 0,
        })
        : okTask("feature_acceptance_matrix_truth", {
          status: feature.status,
          features_total: feature.features_total,
          features_green: feature.features_green,
          counts: feature.counts,
          matrix_hash: feature.matrix_hash,
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
    id: "tool_ergonomics_eval_lane_truth",
    category: "tool_ergonomics",
    oracle: "Orangebox command/tool surfaces must be distinct, concise, receipt-backed, output-bounded, and backend-only before promotion.",
    budget: { timeout_ms: 1600, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const toolErgonomics = readJson(path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"), trace);
      const failures = [];
      const commandCount = toolErgonomics?.command_surface?.command_count || 0;
      const outputContracts = toolErgonomics?.proof_contracts?.output_contracts || {};
      const constraints = toolErgonomics?.constraints || {};
      if (toolErgonomics?.status !== "ORANGEBOX_TOOL_ERGONOMICS_GREEN") failures.push(`Tool ergonomics not green: ${toolErgonomics?.status || "missing"}`);
      if (commandCount < 26) failures.push(`Tool command count too low: ${commandCount}`);
      if (Array.isArray(toolErgonomics?.failures) && toolErgonomics.failures.length > 0) failures.push(`Tool ergonomics has ${toolErgonomics.failures.length} failure(s)`);
      if (outputContracts.wrapper_writes_command_receipts !== true) failures.push("Wrapper does not prove command receipt writes");
      if (outputContracts.wrapper_tail_bounded !== true) failures.push("Wrapper does not prove bounded output tail");
      if (outputContracts.package_proofs_json_receipt !== true) failures.push("Proof scripts are not all receipt-visible");
      if (constraints.frontend_touched !== false) failures.push("Tool ergonomics doctor must prove frontend_touched=false");
      if (constraints.install_attempted !== false) failures.push("Tool ergonomics doctor must prove install_attempted=false");
      if (constraints.paid_api_attempted !== false) failures.push("Tool ergonomics doctor must prove paid_api_attempted=false");
      return failures.length
        ? failTask("tool_ergonomics_eval_lane_truth", failures, {
          status: toolErgonomics?.status || null,
          command_count: commandCount,
          constraints,
        })
        : okTask("tool_ergonomics_eval_lane_truth", {
          status: toolErgonomics.status,
          command_count: commandCount,
          command_hash: toolErgonomics?.command_surface?.command_hash || null,
          constraints,
        });
    },
  },
  {
    id: "checkmate_eval_lane_truth",
    category: "eval_integrity",
    oracle: "Prompt, model, routing, benchmark, and tool-surface changes must have CHECKMATE eval fixtures before promotion.",
    budget: { timeout_ms: 1600, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const checkmate = readJson(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"), trace);
      const failures = [];
      const constraints = checkmate?.constraints || {};
      const gates = checkmate?.gates || {};
      const changeTypes = new Set((checkmate?.fixtures || []).map((fixture) => fixture.change_type));
      const fixtures = Array.isArray(checkmate?.fixtures) ? checkmate.fixtures : [];
      const benchmarkHygiene = fixtures.find((fixture) => fixture.id === "benchmark_hygiene_integrity_gate");
      const required = ["prompt_change", "model_lane_change", "routing_policy_change", "tool_surface_change", "benchmark_or_score_change", "eval_integrity_change"];
      if (checkmate?.status !== "CHECKMATE_EVAL_LANE_GREEN") failures.push(`CHECKMATE eval lane not green: ${checkmate?.status || "missing"}`);
      if (fixtures.length < 6) failures.push(`CHECKMATE fixture count too low: ${fixtures.length}`);
      for (const type of required) {
        if (!changeTypes.has(type)) failures.push(`CHECKMATE missing fixture type ${type}`);
      }
      if (gates.deterministic_oracle_first !== true) failures.push("CHECKMATE gate deterministic_oracle_first missing");
      if (gates.receipt_required !== true) failures.push("CHECKMATE gate receipt_required missing");
      if (gates.operator_approval_required !== true) failures.push("CHECKMATE gate operator_approval_required missing");
      if (gates.source_leakage_check_required !== true) failures.push("CHECKMATE gate source_leakage_check_required missing");
      if (gates.web_trace_warning_required !== true) failures.push("CHECKMATE gate web_trace_warning_required missing");
      if (gates.adversarial_score_validation_required !== true) failures.push("CHECKMATE gate adversarial_score_validation_required missing");
      if (!benchmarkHygiene) failures.push("CHECKMATE missing benchmark_hygiene_integrity_gate fixture");
      if (benchmarkHygiene && !benchmarkHygiene.canaries?.includes("source_leakage_check")) failures.push("Benchmark hygiene fixture lacks source_leakage_check canary");
      if (benchmarkHygiene && !benchmarkHygiene.canaries?.includes("web_trace_warning")) failures.push("Benchmark hygiene fixture lacks web_trace_warning canary");
      if (benchmarkHygiene && !benchmarkHygiene.canaries?.includes("adversarial_score_validation")) failures.push("Benchmark hygiene fixture lacks adversarial_score_validation canary");
      if (benchmarkHygiene && !benchmarkHygiene.reject_if?.includes("unsupported_score_inflation")) failures.push("Benchmark hygiene fixture does not reject unsupported_score_inflation");
      if (constraints.frontend_touched !== false) failures.push("CHECKMATE must prove frontend_touched=false");
      if (constraints.prompt_model_or_routing_changed !== false) failures.push("CHECKMATE doctor must not mutate prompts/models/routing");
      return failures.length
        ? failTask("checkmate_eval_lane_truth", failures, {
          status: checkmate?.status || null,
          fixtures_total: fixtures.length,
          constraints,
        })
        : okTask("checkmate_eval_lane_truth", {
          status: checkmate.status,
          fixtures_total: fixtures.length,
          benchmark_hygiene_fixture: benchmarkHygiene.id,
          fixture_hash: checkmate.fixture_hash || null,
          constraints,
        });
    },
  },
  {
    id: "eval_integrity_benchmark_hygiene_truth",
    category: "eval_integrity",
    oracle: "Benchmark and eval claims must prove no source leakage, eval-canary miss, benchmark-key exposure, web-trace answer leakage, or unsupported score inflation.",
    budget: { timeout_ms: 1600, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const checkmate = readJson(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"), trace);
      const improvements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"), trace);
      const fixtures = Array.isArray(checkmate?.fixtures) ? checkmate.fixtures : [];
      const hygiene = fixtures.find((fixture) => fixture.id === "benchmark_hygiene_integrity_gate");
      const blocklist = Array.isArray(checkmate?.canary_blocklist) ? checkmate.canary_blocklist : [];
      const failures = [];
      if (checkmate?.status !== "CHECKMATE_EVAL_LANE_GREEN") failures.push(`CHECKMATE eval lane not green: ${checkmate?.status || "missing"}`);
      if (!hygiene) failures.push("benchmark_hygiene_integrity_gate fixture missing");
      if (hygiene && hygiene.change_type !== "eval_integrity_change") failures.push(`Benchmark hygiene change_type wrong: ${hygiene.change_type}`);
      for (const canary of ["eval_canary_blocklist", "source_leakage_check", "web_trace_warning", "adversarial_score_validation"]) {
        if (!hygiene?.canaries?.includes(canary)) failures.push(`Benchmark hygiene missing canary ${canary}`);
      }
      for (const rejected of ["benchmark_key_exposed", "fixture_answer_leaked", "web_trace_as_answer", "unsupported_score_inflation"]) {
        if (!hygiene?.reject_if?.includes(rejected)) failures.push(`Benchmark hygiene missing reject_if ${rejected}`);
      }
      for (const blocked of ["benchmark_secret", "source_label_leak", "eval_canary_miss", "web_trace_as_answer", "unsupported_score_inflation", "fixture_answer_leaked"]) {
        if (!blocklist.includes(blocked)) failures.push(`Canary blocklist missing ${blocked}`);
      }
      if (!checkmate?.research_basis?.some((item) => /eval-awareness|BrowseComp|contamination|leakage/i.test(`${item.url || ""} ${item.lesson || ""}`))) {
        failures.push("CHECKMATE research_basis lacks eval-awareness/leakage signal");
      }
      const backlog = Array.isArray(improvements?.execution_backlog) ? improvements.execution_backlog : [];
      const candidate = backlog.find((item) => item.area === "eval_integrity_and_benchmark_hygiene") || improvements?.top_execution_candidate;
      if (candidate?.area === "eval_integrity_and_benchmark_hygiene" && candidate?.frontend_touch_allowed !== false) failures.push("Eval integrity candidate must forbid frontend touch");
      return failures.length
        ? failTask("eval_integrity_benchmark_hygiene_truth", failures, {
          checkmate_status: checkmate?.status || null,
          fixture_present: Boolean(hygiene),
          blocklist_count: blocklist.length,
          candidate_status: candidate?.status || null,
        })
        : okTask("eval_integrity_benchmark_hygiene_truth", {
          checkmate_status: checkmate.status,
          fixture_id: hygiene.id,
          blocklist_count: blocklist.length,
          candidate_status: candidate?.status || null,
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
    id: "assurance_lab_truth",
    category: "knowledge_evidence",
    oracle: "Research-derived system ideas must become scoped backend playbooks, gates, and receipts before promotion.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const assurance = readJson(path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const failures = [];
      if (assurance?.status !== "ORANGEBOX_ASSURANCE_LAB_GREEN") failures.push(`Assurance Lab not green: ${assurance?.status || "missing"}`);
      if ((assurance?.summary?.source_count || 0) < 3) failures.push(`Assurance source count too low: ${assurance?.summary?.source_count || 0}`);
      if (!Array.isArray(assurance?.playbook?.gates) || assurance.playbook.gates.length < 6) failures.push("Assurance playbook gate count too low");
      if (!assurance?.playbook?.gates?.some((gate) => gate.id === "no_auto_promotion")) failures.push("Assurance playbook lacks no_auto_promotion gate");
      if (assurance?.constraints?.frontend_touched !== false) failures.push("Assurance Lab must prove frontend_touched=false");
      if (assurance?.constraints?.paid_api_attempted !== false) failures.push("Assurance Lab must prove paid_api_attempted=false");
      if (assurance?.constraints?.autonomous_promotion_attempted !== false) failures.push("Assurance Lab must prove autonomous_promotion_attempted=false");
      if (!packageJson?.scripts?.["assurance:doctor"]) failures.push("Package script assurance:doctor missing");
      if (!backendProofInProgress && project?.evidence?.assurance_lab?.status !== "ORANGEBOX_ASSURANCE_LAB_GREEN") failures.push("Project report does not mirror Assurance Lab green status");
      return failures.length
        ? failTask("assurance_lab_truth", failures, {
          status: assurance?.status || null,
          source_count: assurance?.summary?.source_count || 0,
          constraints: assurance?.constraints || null,
        })
        : okTask("assurance_lab_truth", {
          status: assurance.status,
          source_count: assurance.summary.source_count,
          gate_count: assurance.playbook.gates.length,
          proof_hash: assurance.proof_hash,
        });
    },
  },
  {
    id: "chatbackup_restore_packet_truth",
    category: "restore_continuity",
    oracle: "Cold-start restore packets must preserve Orangebox project law, active lane, proof state, and source-truth pointers without relying on hidden chat memory.",
    budget: { timeout_ms: 1600, max_files_read: 1, max_tool_calls: 0 },
    run(trace) {
      const packetPath = path.join(dataRoot, "restore-packets", "ORANGEBOX_RESTORE_PACKET.latest.md");
      const failures = [];
      if (!exists(packetPath)) {
        failures.push("Latest restore packet is missing");
        return failTask("chatbackup_restore_packet_truth", failures, { packet_path: packetPath });
      }
      const text = readText(packetPath, trace);
      const required = [
        /Orangebox Zero-Memory Chat Primer/i,
        /Orangebox Ops backend/i,
        /local files and receipts as truth/i,
        /visual\/website\/shop work is on hold for this backend lane/i,
        /ChatBackup archives to restore project continuity/i,
        /AtomSmasher/i,
      ];
      for (const pattern of required) {
        if (!pattern.test(text)) failures.push(`Restore packet missing pattern: ${pattern.source}`);
      }
      return failures.length
        ? failTask("chatbackup_restore_packet_truth", failures, { packet_path: packetPath, bytes: Buffer.byteLength(text, "utf8") })
        : okTask("chatbackup_restore_packet_truth", {
          packet_path: packetPath,
          bytes: Buffer.byteLength(text, "utf8"),
          sha256: crypto.createHash("sha256").update(text).digest("hex"),
        });
    },
  },
  {
    id: "knowledge_execution_backlog_truth",
    category: "knowledge_evidence",
    oracle: "Learned research/receipt candidates are ranked into backend-only execution work with proof commands, approval gates, and no self-promotion.",
    budget: { timeout_ms: 1600, max_files_read: 1, max_tool_calls: 0 },
    run(trace) {
      const improvements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"), trace);
      const backlog = Array.isArray(improvements?.execution_backlog) ? improvements.execution_backlog : [];
      const top = improvements?.top_execution_candidate || backlog[0] || {};
      const failures = [];
      if (improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") failures.push(`Knowledge improvement queue not ready: ${improvements?.status || "missing"}`);
      if (backlog.length < 1) failures.push("Knowledge improvement queue has no execution_backlog");
      if (!Number.isFinite(top.execution_score) || top.execution_score <= 0) failures.push(`Top execution score invalid: ${top.execution_score ?? "missing"}`);
      if (!top.area || top.area === "general_ops") failures.push(`Top execution area is not specific enough: ${top.area || "missing"}`);
      if (top.operator_approval_required !== true) failures.push("Top backlog item must require operator approval");
      if (top.auto_promote !== false) failures.push("Top backlog item must explicitly disable auto_promote");
      if (top.scope !== "backend_ops_only") failures.push(`Top backlog item scope must be backend_ops_only, got ${top.scope || "missing"}`);
      if (top.frontend_touch_allowed !== false) failures.push("Top backlog item must forbid frontend touch");
      if (!String(top.proof_command || "").includes("npm.cmd run")) failures.push("Top backlog item lacks an executable npm proof command");
      if (!top.acceptance_gate || String(top.acceptance_gate).length < 20) failures.push("Top backlog item lacks a concrete acceptance gate");
      if (backlog.some((item) => item.auto_promote !== false)) failures.push("At least one backlog item does not explicitly disable auto_promote");
      if (backlog.some((item) => item.frontend_touch_allowed !== false || item.scope !== "backend_ops_only")) failures.push("At least one backlog item violates backend-only scope");
      return failures.length
        ? failTask("knowledge_execution_backlog_truth", failures, {
          backlog_count: backlog.length,
          top_area: top.area || null,
          top_score: top.execution_score ?? null,
        })
        : okTask("knowledge_execution_backlog_truth", {
          backlog_count: backlog.length,
          top_area: top.area,
          top_score: top.execution_score,
          proof_command: top.proof_command,
        });
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
    oracle: "Tri-lane router can be policy-green while installed model counts remain explicit and local model role claims are packet-fixture proven.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const trilane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"), trace);
      const laneEval = readJson(path.join(dataRoot, "models", "latest-local-model-lane-eval.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      if (trilane?.status !== "TRILANE_ROUTER_PACK_GREEN") failures.push(`Tri-lane router not green: ${trilane?.status || "missing"}`);
      if (laneEval?.status !== "LOCAL_MODEL_LANE_EVAL_GREEN") failures.push(`Local model lane eval not green: ${laneEval?.status || "missing"}`);
      const installed = trilane?.availability?.core_installed_count;
      const total = trilane?.availability?.core_total;
      if (!Number.isInteger(installed) || !Number.isInteger(total)) failures.push("Tri-lane installed/core totals missing");
      if (installed > total) failures.push(`Installed model count ${installed} exceeds total ${total}`);
      if (laneEval?.inventory_truth?.core_installed_count !== installed) failures.push("Local model lane eval does not mirror TriLane installed count");
      if (laneEval?.inventory_truth?.core_total !== total) failures.push("Local model lane eval does not mirror TriLane core total");
      if (laneEval?.constraints?.model_call_attempted !== false) failures.push("Local model lane eval must not call models");
      if (laneEval?.constraints?.ollama_pull_attempted !== false) failures.push("Local model lane eval must not pull Ollama models");
      if (laneEval?.promotion_law?.no_model_card_promotion !== true) failures.push("Local model lane eval must forbid model-card promotion");
      if (laneEval?.promotion_law?.wildcard_never_final_authority !== true) failures.push("Wildcard authority law missing");
      if (laneEval?.packet_eval?.fixtures_green !== laneEval?.packet_eval?.fixtures_total) failures.push("Not all local model role packet fixtures are green");
      if ((installed || 0) < (total || 0) && project?.models?.installed_core_count !== installed) failures.push("Project report does not mirror installed core model count");
      return failures.length
        ? failTask("local_model_router_claims", failures, {
          installed,
          total,
          project_installed: project?.models?.installed_core_count,
          lane_eval_status: laneEval?.status || null,
        })
        : okTask("local_model_router_claims", {
          installed,
          total,
          project_installed: project?.models?.installed_core_count,
          lane_eval_status: laneEval.status,
          fixtures_green: laneEval.packet_eval.fixtures_green,
          fixtures_total: laneEval.packet_eval.fixtures_total,
        });
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
      "CHECKMATE eval lane: fixtures and canaries before prompt, model, routing, benchmark, or tool changes.",
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
