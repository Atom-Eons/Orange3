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
  "final:zip",
  "health:report",
  "project:report",
  "ops:gaps",
  "codexa:handoff",
  "research:scout",
  "research:radar",
  "horizon:review",
  "horizon:bakeoff",
  "v3:api:bakeoff",
  "littleorange:doctor",
  "visual:artifact-vault",
  "visual:artifact-smoke",
  "visual:readiness",
  "knowledge:improvements",
  "assurance:doctor",
  "tool:ergonomics",
  "checkmate:doctor",
  "signal:hygiene",
  "session:spine",
  "feature:proof",
  "harness:benchmark",
  "toolmesh:doctor",
  "toolmesh:physical-doctor",
  "v3:doctor",
  "chatbackup:restore",
  "codexa:alert",
  "codexa:watch",
  "codexa:remote-proof",
  "codexa:smb-stage",
  "mcp:doctor",
  "ipi:doctor",
  "memory:doctor",
  "action:doctor",
  "skills:lifecycle",
  "model:lane-eval",
  "model:inventory",
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
      const commands = ["backend-proof", "health-report", "project-report", "research-scout", "research-radar", "assurance-doctor", "harness-benchmark", "tool-ergonomics", "checkmate-eval", "signal-hygiene", "session-spine", "feature-proof", "final-verify", "final-zip", "codexa-alert", "codexa-access", "codexa-remote-proof", "codexa-watch", "codexa-smb-stage", "skills-lifecycle", "model-lane-eval", "model-inventory", "ipi-doctor", "memory-doctor"];
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
    id: "action_sequence_risk_truth",
    category: "agent_security",
    oracle: "Action safety must evaluate suspicious command chains, not just isolated commands.",
    budget: { timeout_ms: 1500, max_files_read: 2, max_tool_calls: 0 },
    run(trace) {
      const action = readJson(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"), trace);
      const sequenceCases = Array.isArray(action?.sequence_cases) ? action.sequence_cases : [];
      const secretPost = sequenceCases.find((item) => item.name === "secret-search-then-localhost-post");
      const normalProof = sequenceCases.find((item) => item.name === "normal-proof-chain");
      const failures = [];
      if (action?.status !== "ORANGEBOX_ACTION_CLASSIFIER_GREEN") failures.push(`Action doctor not green: ${action?.status || "missing"}`);
      if (Number(action?.sequence_cases_run || 0) < 3) failures.push(`Sequence fixtures too low: ${action?.sequence_cases_run || 0}`);
      if (Number(action?.sequence_blocked_count || 0) < 1) failures.push("No sequence fixture blocked");
      if (!secretPost) failures.push("Missing secret-search-then-localhost-post sequence fixture");
      else {
        if (secretPost.actual?.matched !== "secret_search_then_network_write") failures.push(`Secret/network chain matched ${secretPost.actual?.matched || "missing"}`);
        if (secretPost.actual?.blocked !== true) failures.push("Secret/network chain did not block");
        const dispositions = (secretPost.individual_dispositions || []).map((item) => item.disposition);
        if (!dispositions.every((item) => item === "allow")) failures.push(`Secret/network chain members were not individually low-friction: ${dispositions.join(",")}`);
      }
      if (!normalProof || normalProof.actual?.disposition !== "allow") failures.push("Normal proof chain is not allowed");
      return failures.length
        ? failTask("action_sequence_risk_truth", failures, {
          status: action?.status || null,
          sequence_cases_run: action?.sequence_cases_run || 0,
          sequence_blocked_count: action?.sequence_blocked_count || 0,
        })
        : okTask("action_sequence_risk_truth", {
          status: action.status,
          sequence_cases_run: action.sequence_cases_run,
          sequence_blocked_count: action.sequence_blocked_count,
          secret_network_chain_matched: secretPost.actual.matched,
          normal_chain_disposition: normalProof.actual.disposition,
        });
    },
  },
  {
    id: "mcp_descriptor_integrity_truth",
    category: "agent_security",
    oracle: "MCP tools must be fingerprinted, descriptor/tool-list drift must force review, and health/project reports must surface that truth.",
    budget: { timeout_ms: 1500, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const mcp = readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const health = readJson(path.join(dataRoot, "reports", "health", "latest-health-report.json"), trace);
      const integrity = mcp?.descriptor_integrity || {};
      const failures = [];
      if (mcp?.status !== "MCP_QUARANTINE_GREEN") failures.push(`MCP doctor status not green: ${mcp?.status || "missing"}`);
      if (integrity.drift_detected !== true) failures.push("MCP descriptor drift was not detected");
      if (integrity.tool_list_rug_pull_blocked !== true) failures.push("MCP tool-list rug-pull was not blocked");
      if (integrity.auto_trust_after_drift !== false) failures.push("MCP drift must not auto-inherit trust");
      if (!/^[a-f0-9]{64}$/.test(integrity.baseline_descriptor_hash || "")) failures.push("Baseline descriptor hash missing or invalid");
      if (!/^[a-f0-9]{64}$/.test(integrity.drift_descriptor_hash || "")) failures.push("Drift descriptor hash missing or invalid");
      if (integrity.baseline_descriptor_hash === integrity.drift_descriptor_hash) failures.push("Descriptor hashes did not change across drift fixture");
      if (!Array.isArray(integrity.new_tools) || !integrity.new_tools.includes("doctor.exfiltrate_secret")) failures.push("Unexpected added tool was not captured");
      if (!Array.isArray(integrity.unapproved_tools) || !integrity.unapproved_tools.includes("doctor.exfiltrate_secret")) failures.push("Unexpected tool was not marked unapproved");
      if (project?.evidence?.mcp_doctor?.descriptor_drift_detected !== true) failures.push("Project report does not surface MCP descriptor drift truth");
      if (health?.receipts?.mcp_doctor?.descriptor_drift_detected !== true) failures.push("Health report does not surface MCP descriptor drift truth");
      return failures.length
        ? failTask("mcp_descriptor_integrity_truth", failures, {
          status: mcp?.status || null,
          drift_detected: integrity.drift_detected ?? null,
          baseline_descriptor_hash: integrity.baseline_descriptor_hash || null,
          drift_descriptor_hash: integrity.drift_descriptor_hash || null,
        })
        : okTask("mcp_descriptor_integrity_truth", {
          status: mcp.status,
          drift_detected: integrity.drift_detected,
          promotion_gate: integrity.promotion_gate,
          new_tools: integrity.new_tools,
          unapproved_tools: integrity.unapproved_tools,
          project_mirrors_descriptor_drift: project?.evidence?.mcp_doctor?.descriptor_drift_detected === true,
          health_mirrors_descriptor_drift: health?.receipts?.mcp_doctor?.descriptor_drift_detected === true,
        });
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
      const remoteProof = readJson(path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"), trace);
      const failures = [];
      const hygiene = alert?.signal_hygiene || {};
      const codexaReady = alert?.status === "CODEXA_READY"
        || alert?.remote_runtime_proof?.ok === true
        || remoteProof?.codexa_remote_runtime_green === true;
      if (hygiene.version !== "orangebox-signal-hygiene/v1") failures.push(`Signal hygiene version missing/wrong: ${hygiene.version || "missing"}`);
      if (!["attention", "warning", "green", "critical"].includes(hygiene.severity)) failures.push(`Signal hygiene severity invalid: ${hygiene.severity || "missing"}`);
      if (hygiene.local_basic_install_blocked !== false) failures.push("Signal hygiene must preserve local_basic_install_blocked=false for Codexa-only gaps");
      if (codexaReady && hygiene.full_system_green_blocked !== false) failures.push("Signal hygiene must clear full_system_green_blocked when Codexa is green through alert or remote proof");
      if (!codexaReady && hygiene.full_system_green_blocked !== true) failures.push("Signal hygiene must keep full_system_green_blocked=true while Codexa rail/Ollama are down");
      if (!hygiene.alert_fatigue_policy || !/cooldown|status change/i.test(hygiene.alert_fatigue_policy)) failures.push("Signal hygiene lacks popup cooldown/status-change policy");
      if (project?.evidence?.codexa_signal_hygiene?.summary_line !== hygiene.summary_line) failures.push("Project report does not mirror Codexa signal summary");
      return failures.length
        ? failTask("codexa_signal_hygiene_truth", failures, {
          codexa_ready: codexaReady,
          version: hygiene.version,
          severity: hygiene.severity,
          local_basic_install_blocked: hygiene.local_basic_install_blocked,
          full_system_green_blocked: hygiene.full_system_green_blocked,
        })
        : okTask("codexa_signal_hygiene_truth", {
          version: hygiene.version,
          severity: hygiene.severity,
          codexa_ready: codexaReady,
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
    id: "final_download_zip_truth",
    category: "scope_control",
    oracle: "The final backend Downloads zip must be produced by a real command, hash-verified, archive-verified, and frontend-independent.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const finalReceiptPath = latestReceipt("orangebox-delta-final-package-");
      const finalPackage = finalReceiptPath
        ? readJson(finalReceiptPath, trace)
        : readJson(path.join(repoRoot, "orangebox-delta-final-manifest.json"), trace);
      const download = readJson(path.join(dataRoot, "downloads", "latest-orangebox-delta-final-download-zip.json"), trace);
      const failures = [];
      if (!packageJson?.scripts?.["final:zip"]?.includes("orangebox-final-download-zip.mjs")) failures.push("Package script final:zip missing or not wired to verifier");
      if (finalPackage?.frontend_included !== false) failures.push("Final package receipt/manifest does not prove frontend_included=false");
      if (finalPackage?.frontend_required_for_backend !== false) failures.push("Final package receipt/manifest does not prove frontend_required_for_backend=false");
      if (download?.status !== "ORANGEBOX_DELTA_FINAL_DOWNLOAD_ZIP_GREEN") failures.push(`Download zip status wrong/missing: ${download?.status || "missing"}`);
      if (download?.archive_verified !== true) failures.push("Download zip archive_verified=true missing");
      if (!/^[a-f0-9]{64}$/.test(download?.sha256 || "")) failures.push("Download zip sha256 missing or invalid");
      if (Number(download?.entries || 0) <= 500) failures.push(`Download zip entry count too low: ${download?.entries || 0}`);
      if (download?.frontend_included !== false || download?.frontend_required_for_backend !== false) failures.push("Download zip receipt does not preserve frontend exclusion/backend independence");
      return failures.length
        ? failTask("final_download_zip_truth", failures, {
          final_zip_script: packageJson?.scripts?.["final:zip"] || null,
          status: download?.status || null,
          entries: download?.entries || null,
          zip_path: download?.zip_path || null,
        })
        : okTask("final_download_zip_truth", {
          status: download.status,
          entries: download.entries,
          zip_path: download.zip_path,
          sha256: download.sha256,
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
      const languageGuard = toolErgonomics?.command_surface?.operator_language_guard || {};
      if (toolErgonomics?.status !== "ORANGEBOX_TOOL_ERGONOMICS_GREEN") failures.push(`Tool ergonomics not green: ${toolErgonomics?.status || "missing"}`);
      if (commandCount < 26) failures.push(`Tool command count too low: ${commandCount}`);
      if (Array.isArray(toolErgonomics?.failures) && toolErgonomics.failures.length > 0) failures.push(`Tool ergonomics has ${toolErgonomics.failures.length} failure(s)`);
      if (outputContracts.wrapper_writes_command_receipts !== true) failures.push("Wrapper does not prove command receipt writes");
      if (outputContracts.wrapper_tail_bounded !== true) failures.push("Wrapper does not prove bounded output tail");
      if (outputContracts.package_proofs_json_receipt !== true) failures.push("Proof scripts are not all receipt-visible");
      if (languageGuard.ok !== true) failures.push("Operator legacy-language guard is not green");
      if (languageGuard.no_moon_wording !== true) failures.push("Active command surface still has stale moon wording");
      if (languageGuard.openclaw_retirement_only !== true) failures.push("OpenClaw appears outside retirement-only commands");
      if (constraints.frontend_touched !== false) failures.push("Tool ergonomics doctor must prove frontend_touched=false");
      if (constraints.install_attempted !== false) failures.push("Tool ergonomics doctor must prove install_attempted=false");
      if (constraints.paid_api_attempted !== false) failures.push("Tool ergonomics doctor must prove paid_api_attempted=false");
      return failures.length
        ? failTask("tool_ergonomics_eval_lane_truth", failures, {
          status: toolErgonomics?.status || null,
          command_count: commandCount,
          language_guard: languageGuard,
          constraints,
        })
        : okTask("tool_ergonomics_eval_lane_truth", {
          status: toolErgonomics.status,
          command_count: commandCount,
          command_hash: toolErgonomics?.command_surface?.command_hash || null,
          language_guard: {
            no_moon_wording: languageGuard.no_moon_wording,
            openclaw_retirement_only: languageGuard.openclaw_retirement_only,
            allowed_openclaw_commands: languageGuard.allowed_openclaw_commands || [],
          },
          constraints,
        });
    },
  },
  {
    id: "v3_toolmesh_wave_truth",
    category: "toolmesh",
    oracle: "V3 ToolMesh must preserve prior V3 waves, register free-alpha tool cards, and block execution until promotion gates are satisfied.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const toolmesh = readJson(path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json"), trace);
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const scopeText = readText(path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "TOOLMESH_SCOPE.md"), trace);
      const failures = [];
      if (toolmesh?.status !== "GREEN" || toolmesh?.ok !== true) failures.push(`ToolMesh not green: ${toolmesh?.status || "missing"}`);
      if ((toolmesh?.summary?.cards_total || 0) < 39) failures.push(`ToolMesh card count too low: ${toolmesh?.summary?.cards_total || 0}`);
      if (toolmesh?.checks?.first_batch_registered !== true) failures.push("First-batch tool ids are not fully registered");
      if (toolmesh?.checks?.execution_blocked_until_promoted !== true) failures.push("Execution is not explicitly blocked until promotion");
      if (toolmesh?.checks?.hardware_profiles_declared !== true) failures.push("Hardware profiles are not declared on every tool card");
      if (toolmesh?.checks?.artifact_pointer_policy_declared !== true) failures.push("Artifact pointer policy is not declared on every tool card");
      if (toolmesh?.checks?.execution_modes_declared !== true) failures.push("Execution mode is not declared on every tool card");
      if (toolmesh?.checks?.artifact_protocol_declared !== true) failures.push("Artifact protocol is not declared on every tool card");
      if (toolmesh?.checks?.workflow_policy_declared !== true) failures.push("Workflow policy is not declared on every tool card");
      if (toolmesh?.checks?.autonomy_levels_declared !== true) failures.push("Autonomy level is not declared on every tool card");
      if (toolmesh?.checks?.handoff_truth_declared !== true) failures.push("Human handoff truth is not declared on every tool card");
      if (toolmesh?.checks?.immutable_templates_for_workflow_tools !== true) failures.push("Workflow tools do not all require immutable templates");
      if (toolmesh?.waveValidation?.preservedV3Count !== 16) failures.push(`Preserved V3 wave count is not 16: ${toolmesh?.waveValidation?.preservedV3Count || 0}`);
      if (toolmesh?.waveValidation?.toolmeshCount !== 10) failures.push(`ToolMesh wave count is not 10: ${toolmesh?.waveValidation?.toolmeshCount || 0}`);
      if (Array.isArray(toolmesh?.missingRequiredFirstBatch) && toolmesh.missingRequiredFirstBatch.length > 0) failures.push(`Missing first-batch ids: ${toolmesh.missingRequiredFirstBatch.join(", ")}`);
      if (!packageJson?.scripts?.["toolmesh:doctor"]) failures.push("Package script toolmesh:doctor missing");
      if (!packageJson?.scripts?.["toolmesh:physical-doctor"]) failures.push("Package script toolmesh:physical-doctor missing");
      if (!packageJson?.scripts?.["v3:doctor"]) failures.push("Package script v3:doctor missing");
      if (!packageJson?.scripts?.["image-lab:doctor"]) failures.push("Package script image-lab:doctor missing");
      if (!packageJson?.scripts?.["releaseops:doctor"]) failures.push("Package script releaseops:doctor missing");
      if (!feature?.matrix?.some((row) => row.id === "v3_free_alpha_toolmesh" && row.ok === true)) failures.push("Feature matrix does not prove v3_free_alpha_toolmesh");
      if (!scopeText.includes("Tool cards are not permission to execute")) failures.push("ToolMesh scope file does not state execution boundary");
      return failures.length
        ? failTask("v3_toolmesh_wave_truth", failures, {
          status: toolmesh?.status || null,
          cards_total: toolmesh?.summary?.cards_total || 0,
          waveValidation: toolmesh?.waveValidation || null,
        })
        : okTask("v3_toolmesh_wave_truth", {
          status: toolmesh.status,
          cards_total: toolmesh.summary.cards_total,
          preserved_v3_waves: toolmesh.waveValidation.preservedV3Count,
          toolmesh_waves: toolmesh.waveValidation.toolmeshCount,
          execution_blocked_until_promoted: toolmesh.checks.execution_blocked_until_promoted,
          hardware_profiles_declared: toolmesh.checks.hardware_profiles_declared,
          artifact_pointer_policy_declared: toolmesh.checks.artifact_pointer_policy_declared,
          artifact_protocol_declared: toolmesh.checks.artifact_protocol_declared,
          workflow_policy_declared: toolmesh.checks.workflow_policy_declared,
          autonomy_levels_declared: toolmesh.checks.autonomy_levels_declared,
          handoff_truth_declared: toolmesh.checks.handoff_truth_declared,
          immutable_templates_for_workflow_tools: toolmesh.checks.immutable_templates_for_workflow_tools,
          feature_row: "v3_free_alpha_toolmesh",
        });
    },
  },
  {
    id: "toolmesh_physical_runtime_truth",
    category: "toolmesh",
    oracle: "V3 ToolMesh must prove local physics before visual/media/coding tools are considered runnable: hardware declarations, pointer-only artifacts, immutable templates, GUI handoff truth, and no Y0 execution.",
    budget: { timeout_ms: 1600, max_files_read: 5, max_tool_calls: 0 },
    run(trace) {
      const physical = readJson(path.join(dataRoot, "v3", "toolmesh", "physical-runtime", "latest-physical-runtime-doctor.json"), trace);
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const templateRegistry = readJson(path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "template-registry.json"), trace);
      const failures = [];
      if (!packageJson?.scripts?.["toolmesh:physical-doctor"]?.includes("physical-runtime-doctor.ts")) failures.push("Package script toolmesh:physical-doctor missing or wrong");
      if (physical?.status !== "ORANGEBOX_TOOLMESH_PHYSICAL_RUNTIME_GREEN" || physical?.ok !== true) failures.push(`Physical runtime doctor not green: ${physical?.status || "missing"}`);
      if ((physical?.summary?.cards_total || 0) < 39) failures.push(`Physical runtime card count too low: ${physical?.summary?.cards_total || 0}`);
      if (physical?.summary?.pointerOnlyCount !== physical?.summary?.cards_total) failures.push("Not every card is pointer-only");
      if ((physical?.summary?.handoffRequiredCount || 0) < 1) failures.push("No GUI/handoff tools declared");
      if ((physical?.summary?.immutableTemplateRequiredCount || 0) < 1) failures.push("No immutable-template tools declared");
      if (!physical?.summary?.hardwareSummary || (physical.summary.hardwareSummary.maxVramRequiredGB || 0) < 1) failures.push("Hardware summary does not expose VRAM requirements");
      if (physical?.checks?.all_cards_physical_valid !== true) failures.push("Not all cards are physical-valid");
      if (physical?.checks?.artifact_pointer_only_all_cards !== true) failures.push("Artifact pointer-only all-cards check is not green");
      if (physical?.checks?.template_registry_valid !== true) failures.push("Template registry validation is not green");
      if (physical?.checks?.gui_tools_handoff_only !== true) failures.push("GUI tools are not handoff-only");
      if (physical?.checks?.artifact_pointer_schema_present !== true) failures.push("Artifact pointer schema is missing");
      if (physical?.checks?.workflow_policy_schema_present !== true) failures.push("Workflow policy schema is missing");
      if (physical?.checks?.hardware_profile_schema_present !== true) failures.push("Hardware profile schema is missing");
      if (physical?.checks?.execution_mode_schema_present !== true) failures.push("Execution mode schema is missing");
      if (physical?.checks?.no_execute_direct_in_y0 !== true) failures.push("Y0 direct execution guard is not green");
      if (physical?.constraints?.external_tools_executed !== false) failures.push("Physical doctor must not execute external tools");
      if (physical?.constraints?.cloud_services_called !== false) failures.push("Physical doctor must not call cloud services");
      if (physical?.constraints?.frontend_touched !== false) failures.push("Physical doctor must not touch frontend");
      if (!Array.isArray(templateRegistry?.templates) || templateRegistry.templates.length < 3) failures.push("Template registry does not include expected immutable templates");
      if (!feature?.matrix?.some((row) => row.id === "toolmesh_physical_runtime_contract" && row.ok === true)) failures.push("Feature matrix does not prove toolmesh_physical_runtime_contract");
      const projectRow = project?.scope?.find((row) => row.area === "ToolMesh physical runtime contract");
      if (projectRow?.status !== "REAL") failures.push("Project report does not list ToolMesh physical runtime contract as REAL");
      if (!String(projectRow?.reality || "").includes("no external execution")) failures.push("Project report does not surface no-external-execution physical truth");
      return failures.length
        ? failTask("toolmesh_physical_runtime_truth", failures, {
          status: physical?.status || null,
          cards_total: physical?.summary?.cards_total ?? null,
          pointerOnlyCount: physical?.summary?.pointerOnlyCount ?? null,
          handoffRequiredCount: physical?.summary?.handoffRequiredCount ?? null,
        })
        : okTask("toolmesh_physical_runtime_truth", {
          status: physical.status,
          cards_total: physical.summary.cards_total,
          pointerOnlyCount: physical.summary.pointerOnlyCount,
          handoffRequiredCount: physical.summary.handoffRequiredCount,
          immutableTemplateRequiredCount: physical.summary.immutableTemplateRequiredCount,
          maxVramRequiredGB: physical.summary.hardwareSummary.maxVramRequiredGB,
          template_count: templateRegistry.templates.length,
          feature_row: "toolmesh_physical_runtime_contract",
        });
    },
  },
  {
    id: "visual_production_readiness_truth",
    category: "visual_runtime_truth",
    oracle: "Visual/media/design readiness must distinguish control-plane proof from promoted runtime power and must not touch the living frontend lane.",
    budget: { timeout_ms: 1600, max_files_read: 6, max_tool_calls: 0 },
    run(trace) {
      const visual = readJson(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), trace);
      const vault = readJson(path.join(dataRoot, "visual-artifacts", "latest-visual-artifact-vault.json"), trace);
      const smoke = readJson(path.join(dataRoot, "visual-artifacts", "latest-visual-artifact-smoke.json"), trace);
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const failures = [];
      const lanes = Array.isArray(visual?.lanes) ? visual.lanes : [];
      const visualRow = feature?.matrix?.find((row) => row.id === "visual_production_readiness");
      const visualProjectRow = project?.scope?.find((row) => row.area === "Visual production readiness");
      if (!packageJson?.scripts?.["visual:artifact-vault"]?.includes("orangebox-visual-artifact-vault-doctor.mjs")) failures.push("Package script visual:artifact-vault missing or wrong");
      if (!packageJson?.scripts?.["visual:artifact-smoke"]?.includes("orangebox-visual-artifact-smoke-doctor.mjs")) failures.push("Package script visual:artifact-smoke missing or wrong");
      if (!packageJson?.scripts?.["visual:readiness"]?.includes("orangebox-visual-production-readiness-doctor.mjs")) failures.push("Package script visual:readiness missing or wrong");
      if (vault?.status !== "ORANGEBOX_VISUAL_ARTIFACT_VAULT_GREEN" || vault?.vault_ready !== true) failures.push(`Visual artifact vault not green: ${vault?.status || "missing"}`);
      if (vault?.vault?.pointer_only !== true) failures.push("Visual artifact vault does not preserve pointer_only=true");
      if (vault?.vault?.receipt_binary_payload_allowed !== false) failures.push("Visual artifact vault does not forbid receipt binary payloads");
      if (!vault?.proof_artifact?.manifest_path) failures.push("Visual artifact vault does not expose proof manifest path");
      if (smoke?.status !== "ORANGEBOX_VISUAL_ARTIFACT_SMOKE_GREEN" || smoke?.smoke_ready !== true) failures.push(`Visual artifact smoke not green: ${smoke?.status || "missing"}`);
      if (smoke?.artifact?.mime_type !== "image/png") failures.push(`Visual artifact smoke mime wrong: ${smoke?.artifact?.mime_type || "missing"}`);
      if (smoke?.artifact?.runtime_generated_media !== false) failures.push("Visual artifact smoke incorrectly claims runtime_generated_media");
      if (smoke?.vault?.receipt_binary_payload_allowed !== false) failures.push("Visual artifact smoke does not forbid receipt binary payloads");
      if (!/^[a-f0-9]{64}$/.test(smoke?.artifact?.sha256 || "")) failures.push("Visual artifact smoke sha256 missing/invalid");
      if (visual?.status !== "ORANGEBOX_VISUAL_PRODUCTION_CONTROL_READY_RUNTIME_NOT_PROMOTED" && visual?.status !== "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY") failures.push(`Visual readiness status wrong/missing: ${visual?.status || "missing"}`);
      if (visual?.ok !== true) failures.push("Visual readiness ok=true missing");
      if (visual?.control_plane_green !== true) failures.push("Visual readiness control_plane_green=true missing");
      if (visual?.summary?.artifact_vault_ready !== true) failures.push("Visual readiness does not mirror artifact_vault_ready=true");
      if (visual?.summary?.artifact_smoke_ready !== true) failures.push("Visual readiness does not mirror artifact_smoke_ready=true");
      if (visual?.summary?.visual_artifact_pipeline_ready !== true) failures.push("Visual readiness does not mirror visual_artifact_pipeline_ready=true");
      if (!visual?.summary?.artifact_manifest_path) failures.push("Visual readiness does not mirror artifact manifest path");
      if (visual?.summary?.smoke_artifact_path !== smoke?.artifact?.artifact_path) failures.push("Visual readiness does not mirror smoke artifact path");
      if (visual?.summary?.smoke_artifact_sha256 !== smoke?.artifact?.sha256) failures.push("Visual readiness does not mirror smoke artifact hash");
      if (typeof visual?.visual_ready !== "boolean") failures.push("Visual readiness does not expose boolean visual_ready");
      if ((visual?.summary?.visual_tool_cards || 0) < 19) failures.push(`Visual tool card count too low: ${visual?.summary?.visual_tool_cards || 0}`);
      if ((visual?.summary?.control_green_lanes || 0) !== 4) failures.push(`Control-green lane count is not 4: ${visual?.summary?.control_green_lanes || 0}`);
      if (lanes.length !== 4) failures.push(`Visual lane count is not 4: ${lanes.length}`);
      for (const lab of ["image-lab", "video-lab", "audio-lab", "design-lab"]) {
        const lane = lanes.find((item) => item.lab === lab);
        if (!lane) failures.push(`Missing visual readiness lane ${lab}`);
        if (lane && lane.control_plane_green !== true) failures.push(`${lab} control plane is not green`);
        if (lane && lane.execution_blocked_until_promoted !== true) failures.push(`${lab} does not preserve execution_blocked_until_promoted`);
        if (lane && lane.artifact_pointer_policy_declared !== true) failures.push(`${lab} does not preserve artifact pointer policy`);
      }
      if (visual?.visual_ready === true && (visual?.summary?.runtime_ready_lanes || 0) < 4) failures.push("visual_ready=true without all runtime lanes ready");
      if (!visualRow?.ok) failures.push("Feature matrix does not prove visual_production_readiness");
      if (visualRow?.frontend_touch_allowed !== false) failures.push("Feature row must forbid frontend touch");
      if (visualProjectRow?.status !== "REAL") failures.push("Project report does not list visual production readiness as REAL control-plane truth");
      if (!String(visualProjectRow?.reality || "").includes("visual_ready=false") && visual?.visual_ready === false) failures.push("Project report does not surface visual_ready=false");
      return failures.length
        ? failTask("visual_production_readiness_truth", failures, {
          status: visual?.status || null,
          visual_ready: visual?.visual_ready ?? null,
          control_green_lanes: visual?.summary?.control_green_lanes ?? null,
          runtime_ready_lanes: visual?.summary?.runtime_ready_lanes ?? null,
          artifact_vault_status: vault?.status || null,
          artifact_smoke_status: smoke?.status || null,
        })
        : okTask("visual_production_readiness_truth", {
          status: visual.status,
          visual_ready: visual.visual_ready,
          control_plane_green: visual.control_plane_green,
          artifact_vault_ready: visual.summary.artifact_vault_ready,
          artifact_manifest_path: visual.summary.artifact_manifest_path,
          artifact_smoke_ready: visual.summary.artifact_smoke_ready,
          smoke_artifact_path: visual.summary.smoke_artifact_path,
          smoke_artifact_sha256: visual.summary.smoke_artifact_sha256,
          visual_artifact_pipeline_ready: visual.summary.visual_artifact_pipeline_ready,
          visual_tool_cards: visual.summary.visual_tool_cards,
          control_green_lanes: visual.summary.control_green_lanes,
          runtime_ready_lanes: visual.summary.runtime_ready_lanes,
          feature_row: "visual_production_readiness",
        });
    },
  },
  {
    id: "horizon_review_alpha_stack_truth",
    category: "alpha_review",
    oracle: "New alpha stack candidates must be reviewed with promotion blockers before adoption; TriLane stays strategy authority.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const horizon = readJson(path.join(dataRoot, "horizon-review", "latest-horizon-review.json"), trace);
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const failures = [];
      const candidates = Array.isArray(horizon?.candidates) ? horizon.candidates : [];
      const ids = new Set(candidates.map((candidate) => candidate.id));
      const required = [
        "bun_elysia_api_bridge",
        "goose_executor",
        "openjarvis_eval",
        "hermes_agent_outer_orchestration",
        "openclaw_retired_path",
        "context7_mcp_docs_lane",
        "ai_sdk_ollama_transport",
        "littleorange_cortex_surface",
        "void_editor_reference",
        "continue_ai_checks",
        "libsql_vector_memory",
        "mastra_agent_framework",
        "tilelang_tilekernels_dflash",
        "visual_runtime_toolmesh",
      ];
      const featureRow = feature?.matrix?.find((row) => row.id === "horizon_review_new_alpha_stack");
      const projectRow = project?.scope?.find((row) => row.area === "Horizon review / new alpha stack");
      if (!packageJson?.scripts?.["horizon:review"]?.includes("orangebox-horizon-review-doctor.mjs")) failures.push("Package script horizon:review missing or wrong");
      if (horizon?.status !== "ORANGEBOX_HORIZON_REVIEW_READY" || horizon?.ok !== true) failures.push(`Horizon review not green: ${horizon?.status || "missing"}`);
      if ((horizon?.summary?.candidates_reviewed || 0) < 13) failures.push(`Horizon candidate count too low: ${horizon?.summary?.candidates_reviewed || 0}`);
      for (const id of required) {
        if (!ids.has(id)) failures.push(`Horizon review missing candidate ${id}`);
      }
      const goose = candidates.find((candidate) => candidate.id === "goose_executor");
      const openJarvis = candidates.find((candidate) => candidate.id === "openjarvis_eval");
      const context7 = candidates.find((candidate) => candidate.id === "context7_mcp_docs_lane");
      const elysia = candidates.find((candidate) => candidate.id === "bun_elysia_api_bridge");
      const littleOrange = candidates.find((candidate) => candidate.id === "littleorange_cortex_surface");
      const hermes = candidates.find((candidate) => candidate.id === "hermes_agent_outer_orchestration");
      const openclaw = candidates.find((candidate) => candidate.id === "openclaw_retired_path");
      const visualRuntime = candidates.find((candidate) => candidate.id === "visual_runtime_toolmesh");
      if (!String(horizon?.doctrine || "").includes("TriLane remains strategy authority")) failures.push("Horizon doctrine does not preserve TriLane authority");
      if (horizon?.summary?.elysia_dependency_present !== true) failures.push("Horizon review does not prove Elysia dependency presence");
      if (horizon?.summary?.goose_card_present !== true) failures.push("Horizon review does not prove Goose card presence");
      if (horizon?.summary?.littleorange_doctor_present !== true) failures.push("Horizon review does not prove LittleOrange doctor presence");
      if (typeof horizon?.summary?.hermes_pack_present !== "boolean") failures.push("Horizon review does not expose Hermes pack truth");
      if (typeof horizon?.summary?.openclaw_retired !== "boolean") failures.push("Horizon review does not expose OpenClaw retirement truth");
      if (typeof horizon?.summary?.visual_artifact_pipeline_ready !== "boolean") failures.push("Horizon review does not expose visual artifact pipeline truth");
      if (!String(goose?.horizon_decision || "").includes("CANDIDATE")) failures.push("Goose is not kept as a candidate");
      if (!String(goose?.promotion_blocker || "").includes("Must not replace TriLane")) failures.push("Goose promotion blocker does not protect TriLane");
      if (!String(openJarvis?.orangebox_state || "").includes("eval_harness")) failures.push("OpenJarvis is not stated as eval harness only");
      if (openJarvis?.installed_or_present !== false) failures.push("OpenJarvis runtime is incorrectly marked installed/present");
      if (!String(hermes?.horizon_decision || "").includes("CANDIDATE")) failures.push("Hermes is not kept as a gated candidate");
      if (!String(hermes?.promotion_blocker || "").includes("must not become hidden authority")) failures.push("Hermes blocker does not reject hidden authority");
      if (!String(openclaw?.horizon_decision || "").includes("RETIRED")) failures.push("OpenClaw is not marked retired");
      if (!String(context7?.orangebox_state || "").includes("not_installed")) failures.push("Context7 is not stated as not installed");
      if (!String(elysia?.horizon_decision || "").includes("ACTIVE_CONTRACT")) failures.push("Elysia bridge is not kept as active contract");
      if (!String(littleOrange?.orangebox_state || "").includes("separate_visual_lane")) failures.push("LittleOrange/Cortex is not stated as separate visual lane");
      if (littleOrange?.installed_or_present !== true) failures.push("LittleOrange doctor is not marked present");
      if (!String(visualRuntime?.horizon_decision || "").includes("CONTROL_PLANE_GREEN")) failures.push("Visual runtime ToolMesh is not control-plane truth-gated");
      if (!featureRow?.ok) failures.push("Feature matrix does not prove horizon_review_new_alpha_stack");
      if (projectRow?.status !== "REAL") failures.push("Project report does not list horizon review as REAL");
      return failures.length
        ? failTask("horizon_review_alpha_stack_truth", failures, {
          status: horizon?.status || null,
          candidates_reviewed: horizon?.summary?.candidates_reviewed ?? null,
          ids: [...ids],
        })
        : okTask("horizon_review_alpha_stack_truth", {
          status: horizon.status,
          candidates_reviewed: horizon.summary.candidates_reviewed,
          elysia_dependency_present: horizon.summary.elysia_dependency_present,
          goose_card_present: horizon.summary.goose_card_present,
          littleorange_doctor_present: horizon.summary.littleorange_doctor_present,
          feature_row: "horizon_review_new_alpha_stack",
          candidates: required,
        });
    },
  },
  {
    id: "horizon_promotion_bakeoff_truth",
    category: "alpha_review",
    oracle: "Reviewed alpha tools must pass a promotion bakeoff matrix before they can be called active; no candidate auto-promotes.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const bakeoff = readJson(path.join(dataRoot, "horizon-bakeoff", "latest-horizon-promotion-bakeoff.json"), trace);
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const failures = [];
      const candidates = Array.isArray(bakeoff?.candidates) ? bakeoff.candidates : [];
      const ids = new Set(candidates.map((candidate) => candidate.id));
      const featureRow = feature?.matrix?.find((row) => row.id === "horizon_promotion_bakeoff");
      const projectRow = project?.scope?.find((row) => row.area === "Horizon promotion bakeoff");
      const required = [
        "bun_elysia_api_bridge",
        "goose_executor",
        "obox_jarvis_openjarvis",
        "context7_docs_hydration",
        "hermes_outer_orchestrator",
        "openclaw_retirement",
        "visual_runtime_toolmesh",
        "littleorange_void_continue_surface",
        "memory_and_agent_framework_candidates",
        "codexa_gpu_acceleration_candidates",
      ];
      if (!packageJson?.scripts?.["horizon:bakeoff"]?.includes("orangebox-horizon-promotion-bakeoff-doctor.mjs")) failures.push("Package script horizon:bakeoff missing or wrong");
      if (bakeoff?.status !== "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_READY" || bakeoff?.ok !== true) failures.push(`Horizon bakeoff not green: ${bakeoff?.status || "missing"}`);
      if ((bakeoff?.summary?.candidates_total || 0) < 10) failures.push(`Bakeoff candidate count too low: ${bakeoff?.summary?.candidates_total || 0}`);
      if ((bakeoff?.summary?.waves_total || 0) < 5) failures.push(`Bakeoff wave count too low: ${bakeoff?.summary?.waves_total || 0}`);
      if ((bakeoff?.summary?.promotable_now || 0) !== 0) failures.push(`Bakeoff auto-promoted candidates: ${bakeoff?.summary?.promotable_now || 0}`);
      if (bakeoff?.summary?.horizon_review_green !== true) failures.push("Bakeoff does not prove horizon review green");
      if (bakeoff?.summary?.toolmesh_execution_blocked_until_promoted !== true) failures.push("Bakeoff does not prove ToolMesh execution is blocked until promotion");
      if (bakeoff?.summary?.visual_artifact_pipeline_ready !== true) failures.push("Bakeoff does not prove visual artifact pipeline ready");
      if (bakeoff?.summary?.openclaw_retired !== true) failures.push("Bakeoff does not prove OpenClaw retired");
      if (!Array.isArray(bakeoff?.failures) || bakeoff.failures.length !== 0) failures.push("Bakeoff has failures");
      for (const id of required) {
        if (!ids.has(id)) failures.push(`Bakeoff missing candidate ${id}`);
      }
      const goose = candidates.find((candidate) => candidate.id === "goose_executor");
      const jarvis = candidates.find((candidate) => candidate.id === "obox_jarvis_openjarvis");
      const visual = candidates.find((candidate) => candidate.id === "visual_runtime_toolmesh");
      const hermes = candidates.find((candidate) => candidate.id === "hermes_outer_orchestrator");
      if (!String(goose?.current_role || "").includes("executor hands")) failures.push("Goose current role does not say executor hands");
      if (!String(goose?.status || "").includes("RUNTIME") && !String(goose?.status || "").includes("ENVELOPE")) failures.push("Goose bakeoff status is not envelope/runtime truth");
      if (!String(jarvis?.current_role || "").includes("not router authority")) failures.push("OBOX Jarvis current role does not reject router authority");
      if (!String(visual?.status || "").includes("RUNTIME") && !String(visual?.status || "").includes("CONTROL_READY")) failures.push("Visual runtime candidate is not status-gated");
      if (!String(hermes?.current_role || "").includes("cannot own Orangebox authority")) failures.push("Hermes candidate does not reject hidden authority");
      if (!featureRow?.ok) failures.push("Feature matrix does not prove horizon_promotion_bakeoff");
      if (projectRow?.status !== "REAL") failures.push("Project report does not list horizon promotion bakeoff as REAL");
      return failures.length
        ? failTask("horizon_promotion_bakeoff_truth", failures, {
          status: bakeoff?.status || null,
          candidates_total: bakeoff?.summary?.candidates_total ?? null,
          waves_total: bakeoff?.summary?.waves_total ?? null,
          promotable_now: bakeoff?.summary?.promotable_now ?? null,
          ids: [...ids],
        })
        : okTask("horizon_promotion_bakeoff_truth", {
          status: bakeoff.status,
          candidates_total: bakeoff.summary.candidates_total,
          waves_total: bakeoff.summary.waves_total,
          promotable_now: bakeoff.summary.promotable_now,
          goose_binary_found: bakeoff.summary.goose_binary_found,
          openjarvis_eval_receipt_green: bakeoff.summary.openjarvis_eval_receipt_green,
          hermes_pack_present: bakeoff.summary.hermes_pack_present,
          visual_ready: bakeoff.summary.visual_ready,
          feature_row: "horizon_promotion_bakeoff",
          candidates: required,
        });
    },
  },
  {
    id: "elysia_rail_latency_bakeoff_truth",
    category: "alpha_review",
    oracle: "The Bun/Elysia rail candidate must have a measured sidecar latency bakeoff before default transport promotion.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const bakeoff = readJson(path.join(dataRoot, "api-bakeoff", "latest-elysia-rail-latency-bakeoff.json"), trace);
      const horizon = readJson(path.join(dataRoot, "horizon-bakeoff", "latest-horizon-promotion-bakeoff.json"), trace);
      const feature = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"), trace);
      const packageJson = readJson(path.join(repoRoot, "package.json"), trace);
      const failures = [];
      const horizonCandidate = Array.isArray(horizon?.candidates)
        ? horizon.candidates.find((candidate) => candidate.id === "bun_elysia_api_bridge")
        : null;
      if (!packageJson?.scripts?.["v3:api:bakeoff"]?.includes("orangebox-elysia-rail-latency-bakeoff.mjs")) failures.push("Package script v3:api:bakeoff missing or wrong");
      if (bakeoff?.status !== "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN" || bakeoff?.ok !== true) failures.push(`Elysia latency bakeoff not green: ${bakeoff?.status || "missing"}`);
      if (bakeoff?.benchmark?.latency_parity_green !== true) failures.push("Elysia bakeoff does not prove latency parity");
      if (!Number.isFinite(bakeoff?.benchmark?.elysia_health_p95_ms)) failures.push("Elysia p95 metric missing");
      if (!Number.isFinite(bakeoff?.benchmark?.current_comparison_p95_ms)) failures.push("Current comparison p95 metric missing");
      if (bakeoff?.promotion?.sidecar_candidate_green !== true) failures.push("Elysia sidecar candidate is not green");
      if (bakeoff?.promotion?.default_api_replacement_approved !== false) failures.push("Elysia bakeoff must not approve default API replacement");
      if (!Array.isArray(bakeoff?.promotion?.default_api_replacement_blockers) || bakeoff.promotion.default_api_replacement_blockers.length < 3) failures.push("Elysia default replacement blockers are incomplete");
      if (bakeoff?.constraints?.frontend_touched !== false) failures.push("Elysia bakeoff must prove frontend_touched=false");
      if (bakeoff?.constraints?.default_transport_changed !== false) failures.push("Elysia bakeoff must prove default_transport_changed=false");
      if (bakeoff?.constraints?.paid_api_called !== false) failures.push("Elysia bakeoff must prove paid_api_called=false");
      if (bakeoff?.constraints?.host_mcp_config_mutated !== false) failures.push("Elysia bakeoff must prove host_mcp_config_mutated=false");
      if (!feature?.matrix?.some((row) => row.id === "elysia_rail_latency_bakeoff" && row.ok === true)) failures.push("Feature matrix does not prove elysia_rail_latency_bakeoff");
      if (!String(horizonCandidate?.status || "").includes("BENCHMARK_GREEN")) failures.push(`Horizon bakeoff does not mirror Elysia benchmark-green sidecar status: ${horizonCandidate?.status || "missing"}`);
      if (!horizonCandidate?.proofs?.some((item) => item.id === "latency_bakeoff_receipt" && item.ok === true)) failures.push("Horizon candidate does not include a green latency_bakeoff_receipt proof");
      return failures.length
        ? failTask("elysia_rail_latency_bakeoff_truth", failures, {
          status: bakeoff?.status || null,
          latency_parity_green: bakeoff?.benchmark?.latency_parity_green ?? null,
          elysia_p95_ms: bakeoff?.benchmark?.elysia_health_p95_ms ?? null,
          current_comparison_p95_ms: bakeoff?.benchmark?.current_comparison_p95_ms ?? null,
          horizon_status: horizonCandidate?.status || null,
        })
        : okTask("elysia_rail_latency_bakeoff_truth", {
          status: bakeoff.status,
          latency_parity_green: bakeoff.benchmark.latency_parity_green,
          elysia_p95_ms: bakeoff.benchmark.elysia_health_p95_ms,
          current_comparison_p95_ms: bakeoff.benchmark.current_comparison_p95_ms,
          default_api_replacement_approved: bakeoff.promotion.default_api_replacement_approved,
          feature_row: "elysia_rail_latency_bakeoff",
          horizon_status: horizonCandidate.status,
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
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    run(trace) {
      const scout = readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json"), trace);
      const improvements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"), trace);
      const radar = readJson(path.join(dataRoot, "research-radar", "latest-research-radar.json"), trace);
      const failures = [];
      if (!["EXTERNAL_RESEARCH_SCOUT_READY", "EXTERNAL_RESEARCH_SCOUT_DEGRADED"].includes(scout?.status)) failures.push(`Research scout status not usable: ${scout?.status || "missing"}`);
      if ((scout?.candidate_count || 0) < 1) failures.push("Research scout has no candidates");
      if (improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") failures.push(`Knowledge improvement queue not ready: ${improvements?.status || "missing"}`);
      if (improvements?.not_autonomous !== true && !/Do not self-promote/i.test(improvements?.doctrine || "")) failures.push("Knowledge improvements do not explicitly block autonomous self-promotion");
      if (!["ORANGEBOX_RESEARCH_RADAR_GREEN", "ORANGEBOX_RESEARCH_RADAR_REPORTED_WITH_GAPS"].includes(radar?.status)) failures.push(`Research radar status not usable: ${radar?.status || "missing"}`);
      if (radar?.constraints?.promotion_autonomous !== false) failures.push("Research radar must block autonomous promotion");
      return failures.length
        ? failTask("research_to_approval_queue", failures, { research_status: scout?.status, research_candidates: scout?.candidate_count, improvement_status: improvements?.status, radar_status: radar?.status || null })
        : okTask("research_to_approval_queue", { research_status: scout?.status, research_candidates: scout?.candidate_count, improvement_status: improvements?.status, improvement_candidates: improvements?.candidate_count || 0, radar_status: radar.status, radar_candidates: radar?.approval_candidates?.length || 0 });
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
    budget: { timeout_ms: 1600, max_files_read: 5, max_tool_calls: 0 },
    run(trace) {
      const trilane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"), trace);
      const laneEval = readJson(path.join(dataRoot, "models", "latest-local-model-lane-eval.json"), trace);
      const inventory = readJson(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      if (trilane?.status !== "TRILANE_ROUTER_PACK_GREEN") failures.push(`Tri-lane router not green: ${trilane?.status || "missing"}`);
      if (laneEval?.status !== "LOCAL_MODEL_LANE_EVAL_GREEN") failures.push(`Local model lane eval not green: ${laneEval?.status || "missing"}`);
      if (!["ORANGEBOX_MODEL_INVENTORY_GREEN", "ORANGEBOX_MODEL_INVENTORY_REPORTED_WITH_GAPS"].includes(inventory?.status)) failures.push(`Model inventory report missing or invalid: ${inventory?.status || "missing"}`);
      const installed = trilane?.availability?.core_installed_count;
      const total = trilane?.availability?.core_total;
      if (!Number.isInteger(installed) || !Number.isInteger(total)) failures.push("Tri-lane installed/core totals missing");
      if (installed > total) failures.push(`Installed model count ${installed} exceeds total ${total}`);
      if (laneEval?.inventory_truth?.core_installed_count !== installed) failures.push("Local model lane eval does not mirror TriLane installed count");
      if (laneEval?.inventory_truth?.core_total !== total) failures.push("Local model lane eval does not mirror TriLane core total");
      if (Number.isInteger(inventory?.summary?.core_installed) && inventory.summary.core_installed !== installed) failures.push("Model inventory report does not mirror TriLane installed core count");
      if (Number.isInteger(inventory?.summary?.core_total) && inventory.summary.core_total !== total) failures.push("Model inventory report does not mirror TriLane core total");
      if (inventory?.constraints?.model_pull_attempted !== false) failures.push("Model inventory report must not pull models");
      if (inventory?.constraints?.model_call_attempted !== false) failures.push("Model inventory report must not call models");
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
          inventory_status: inventory?.status || null,
          inventory_core_installed: inventory?.summary?.core_installed ?? null,
          project_installed: project?.models?.installed_core_count,
          lane_eval_status: laneEval?.status || null,
        })
        : okTask("local_model_router_claims", {
          installed,
          total,
          inventory_status: inventory.status,
          inventory_core_installed: inventory.summary.core_installed,
          inventory_full_runtime_green: inventory.full_local_model_runtime_green,
          project_installed: project?.models?.installed_core_count,
          lane_eval_status: laneEval.status,
          fixtures_green: laneEval.packet_eval.fixtures_green,
          fixtures_total: laneEval.packet_eval.fixtures_total,
        });
    },
  },
  {
    id: "ops_gap_ledger_truth",
    category: "operator_reality",
    oracle: "Open Ops gaps are acceptable only when every gap has evidence, a blocker, a safe next action, and proof commands; false full-green is forbidden.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const ledger = readJson(path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      if (!["ORANGEBOX_OPS_GAP_LEDGER_REPORTED_OPEN_GAPS", "ORANGEBOX_OPS_GAP_LEDGER_GREEN_NO_OPEN_GAPS"].includes(ledger?.status)) failures.push(`Ops gap ledger not valid: ${ledger?.status || "missing"}`);
      if (ledger?.constraints?.frontend_touched !== false) failures.push("Ops gap ledger must not touch frontend");
      if (ledger?.constraints?.remote_codexa_mutation_attempted !== false) failures.push("Ops gap ledger must not mutate Codexa");
      if (!Array.isArray(ledger?.gaps)) failures.push("Ops gap ledger gaps array missing");
      for (const gap of ledger?.gaps || []) {
        if (!gap.id) failures.push("Gap missing id");
        if (!gap.current_evidence) failures.push(`Gap ${gap.id || "unknown"} missing current evidence`);
        if (!gap.blocker) failures.push(`Gap ${gap.id || "unknown"} missing blocker`);
        if (!gap.safe_next_action) failures.push(`Gap ${gap.id || "unknown"} missing safe next action`);
        if (!Array.isArray(gap.proof_commands) || gap.proof_commands.length === 0) failures.push(`Gap ${gap.id || "unknown"} missing proof commands`);
      }
      const projectOnlyBlockedByThisHarness = project?.full_project_green === false
        && Array.isArray(project?.not_real_yet)
        && project.not_real_yet.length === 1
        && /harness benchmark/i.test(String(project.not_real_yet[0]));
      if (!backendProofInProgress
        && !projectOnlyBlockedByThisHarness
        && project?.full_project_green === false
        && ledger?.full_system_green_claim_allowed === true) {
        failures.push("Ledger allows full-system green while project report is not green");
      }
      return failures.length
        ? failTask("ops_gap_ledger_truth", failures, { status: ledger?.status || null, gap_count: ledger?.gap_count ?? null })
        : okTask("ops_gap_ledger_truth", {
          status: ledger.status,
          gap_count: ledger.gap_count,
          critical_gap_count: ledger.critical_gap_count,
          full_system_green_claim_allowed: ledger.full_system_green_claim_allowed,
          project_only_blocked_by_this_harness: projectOnlyBlockedByThisHarness,
        });
    },
  },
  {
    id: "codexa_handoff_truth",
    category: "codexa_recovery",
    oracle: "A Codexa handoff is valid only when it names the verified setup zip, first-click admin launcher, open blockers, cockpit verification commands, and forbids false full-system green while blocking gaps remain.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const handoff = readJson(path.join(dataRoot, "codexa-handoff", "latest-codexa-handoff.json"), trace);
      const ledger = readJson(path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json"), trace);
      const failures = [];
      if (!["CODEXA_HANDOFF_READY_WITH_OPEN_GAPS", "CODEXA_HANDOFF_READY_NO_OPEN_GAPS"].includes(handoff?.status)) failures.push(`Codexa handoff not ready: ${handoff?.status || "missing"}`);
      if (handoff?.constraints?.frontend_touched !== false) failures.push("Codexa handoff must not touch frontend");
      if (handoff?.constraints?.remote_codexa_mutation_attempted !== false) failures.push("Codexa handoff must not mutate Codexa");
      if (handoff?.setup_zip?.exists !== true) failures.push("Codexa handoff missing setup zip proof");
      if (handoff?.codexa_run_order?.[0]?.command !== "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd") failures.push("Codexa handoff first click is not start-here admin launcher");
      if (!handoff?.cockpit_verify_commands?.includes("npm.cmd run codexa:access")) failures.push("Codexa handoff missing codexa:access verification command");
      if (!handoff?.cockpit_verify_commands?.includes("npm.cmd run codexa:remote-proof")) failures.push("Codexa handoff missing codexa:remote-proof verification command");
      if (!handoff?.cockpit_verify_commands?.includes("npm.cmd run codexa:watch")) failures.push("Codexa handoff missing codexa:watch verification command");
      if (!handoff?.cockpit_verify_commands?.includes("npm.cmd run ops:gaps")) failures.push("Codexa handoff missing ops:gaps verification command");
      const blockingGapCount = (ledger?.gaps || []).filter((gap) => gap?.blocks_full_system_green === true || gap?.severity === "critical").length;
      if (blockingGapCount > 0 && handoff?.full_system_green_claim_allowed === true) failures.push("Codexa handoff allows full-system green while blocking gaps remain");
      return failures.length
        ? failTask("codexa_handoff_truth", failures, { status: handoff?.status || null })
        : okTask("codexa_handoff_truth", {
          status: handoff.status,
          open_gap_count: handoff.open_gap_count,
          first_click: handoff.codexa_run_order?.[0]?.command || null,
        });
    },
  },
  {
    id: "codexa_access_truth",
    category: "codexa_recovery",
    oracle: "A focused Codexa access proof must distinguish command rail, Ollama, RDP, WinRM, SMB, and receipt dashboard reachability without login, install, or remote mutation.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const access = readJson(path.join(dataRoot, "codexa-access", "latest-codexa-access.json"), trace);
      const failures = [];
      const allowedStatuses = [
        "CODEXA_ACCESS_FULL_READY",
        "CODEXA_ACCESS_COMMAND_RAIL_READY",
        "CODEXA_ACCESS_WINRM_READY",
        "CODEXA_ACCESS_RDP_READY",
        "CODEXA_ACCESS_RECEIPTS_ONLY",
        "CODEXA_ACCESS_SMB_VISIBLE_ONLY",
        "CODEXA_ACCESS_UNREACHABLE",
      ];
      if (!allowedStatuses.includes(access?.status)) failures.push(`Codexa access status invalid: ${access?.status || "missing"}`);
      if (access?.constraints?.frontend_touched !== false) failures.push("Codexa access proof must not touch frontend");
      if (access?.constraints?.remote_codexa_mutation_attempted !== false) failures.push("Codexa access proof must not mutate Codexa");
      if (access?.constraints?.remote_login_attempted !== false) failures.push("Codexa access proof must not attempt remote login");
      if (access?.constraints?.install_attempted !== false) failures.push("Codexa access proof must not install anything");
      for (const key of ["command_rail", "receipts", "ollama", "rdp", "winrm", "smb"]) {
        if (typeof access?.access?.[key] !== "boolean") failures.push(`Codexa access missing boolean ${key}`);
      }
      if (!Array.isArray(access?.next_actions) || access.next_actions.length < 1) failures.push("Codexa access proof missing next actions");
      if (access?.setup_pack?.exists !== true) failures.push("Codexa access proof missing setup pack evidence");
      return failures.length
        ? failTask("codexa_access_truth", failures, { status: access?.status || null })
        : okTask("codexa_access_truth", {
          status: access.status,
          command_rail: access.access.command_rail,
          ollama: access.access.ollama,
          rdp: access.access.rdp,
          winrm: access.access.winrm,
          smb: access.access.smb,
        });
    },
  },
  {
    id: "codexa_bringup_watch_truth",
    category: "codexa_recovery",
    oracle: "A Codexa bring-up watcher is valid only when it records a bounded status history, refuses remote mutation, and separates report success from two-machine readiness.",
    budget: { timeout_ms: 1600, max_files_read: 3, max_tool_calls: 0 },
    run(trace) {
      const watcher = readJson(path.join(dataRoot, "codexa-bringup", "latest-codexa-bringup-watch.json"), trace);
      const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"), trace);
      const failures = [];
      if (!["CODEXA_BRINGUP_READY", "CODEXA_BRINGUP_REPORTED_OPEN_GAPS", "CODEXA_BRINGUP_WATCH_REPORTED_ALERT_FAILURE"].includes(watcher?.status)) failures.push(`Codexa bring-up watcher status invalid: ${watcher?.status || "missing"}`);
      if (watcher?.constraints?.frontend_touched !== false) failures.push("Codexa bring-up watcher must not touch frontend");
      if (watcher?.constraints?.remote_codexa_mutation_attempted !== false) failures.push("Codexa bring-up watcher must not mutate Codexa");
      if (watcher?.constraints?.install_attempted !== false) failures.push("Codexa bring-up watcher must not install anything");
      if (!Array.isArray(watcher?.history) || watcher.history.length < 1) failures.push("Codexa bring-up watcher missing status history");
      if (!watcher?.false_green_guard) failures.push("Codexa bring-up watcher missing false-green guard");
      if (watcher?.codexa_ready !== true && project?.full_project_green === true) failures.push("Project report claims full green while watcher says Codexa is not ready");
      return failures.length
        ? failTask("codexa_bringup_watch_truth", failures, { status: watcher?.status || null })
        : okTask("codexa_bringup_watch_truth", {
          status: watcher.status,
          codexa_ready: watcher.codexa_ready,
          missing: watcher.verdict?.missing || [],
          status_history: watcher.verdict?.status_history || [],
        });
    },
  },
  {
    id: "codexa_setup_contract_truth",
    category: "codexa_recovery",
    oracle: "OBOX2 setup package must prove always-on power, embedded backend payload install, rail recovery, model install, wildcard discipline, and optional Hermes contracts before being handed to Codexa.",
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
        "start_here_calls_backend_installer",
        "start_here_calls_rail_starter",
        "start_here_next_action_codexa_access",
        "start_here_next_action_codexa_watch",
        "backend_installer_payload_zip",
        "backend_installer_hash_check",
        "backend_installer_approved_path",
        "backend_installer_frontend_not_required",
        "backend_installer_receipt",
        "model_installer_tiered",
        "model_installer_missing_required",
        "model_doctor_missing_core",
        "hermes_install_orangebox_control_plane_note",
        "readme_wildcard_law",
        "run_order_json_codexa_access",
        "run_order_json_codexa_watch",
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
          has_codexa_access: doctor?.json_config?.run_order?.has_codexa_access === true,
          has_codexa_watch: doctor?.json_config?.run_order?.has_codexa_watch === true,
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
