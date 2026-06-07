#!/usr/bin/env node
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
const reportRoot = path.join(dataRoot, "reports", "health");
const downloadsRoot = path.join(userRoot, "Downloads");

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

function fileSummary(file) {
  try {
    const stat = fs.statSync(file);
    return { path: file, exists: true, bytes: stat.size, modified_at: stat.mtime.toISOString() };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
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

async function probe(url, timeoutMs = 2400) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = text.slice(0, 500);
    try { body = JSON.parse(text); } catch {}
    return { ok: response.ok, status: response.status, ms: Date.now() - started, url, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, url, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
}

function startupPath(name) {
  return path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", name);
}

function skillRootStatus() {
  const roots = [
    path.join(userRoot, ".codex", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".agents", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".claude", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, "AppData", "Roaming", "Claude", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, "AppData", "Roaming", "Claude-3p", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, "AppData", "Roaming", "Antigravity", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".gemini", "skills", "orangebox-primer", "SKILL.md"),
    path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md"),
  ];
  return roots.map((file) => ({ file, ok: exists(file) }));
}

function codexaSignalHygiene(alert) {
  if (!alert?.status) return null;
  if (alert.signal_hygiene) return alert.signal_hygiene;
  const status = alert.status;
  const severity = status === "CODEXA_READY"
    ? "green"
    : status === "CODEXA_COMMAND_ONLY"
      ? "warning"
      : status === "CODEXA_RECEIPTS_ONLY"
        ? (alert.remote_control_available ? "warning" : "attention")
        : (alert.receipts_reachable || alert.smb_port_visible ? "attention" : "urgent");
  const humanLabel = status === "CODEXA_READY"
    ? "Codexa ready"
    : status === "CODEXA_RECEIPTS_ONLY"
      ? "Codexa receipts only"
      : status === "CODEXA_COMMAND_ONLY"
        ? "Codexa command rail only"
        : "Codexa unreachable";
  return {
    version: "orangebox-signal-hygiene/v1-fallback",
    severity,
    human_label: humanLabel,
    repeat_count: null,
    stable_since: alert.checked_at || null,
    notify_reason: alert.popup?.result?.mode || "legacy_alert_shape",
    next_popup_after: null,
    cooldown_minutes: alert.popup?.cooldown_minutes ?? null,
    popup_requested: alert.popup?.requested ?? null,
    alert_fatigue_policy: "Derived by health report because the upstream alert receipt did not include signal_hygiene.",
    operator_action_required: status !== "CODEXA_READY" && alert.remote_execution_available !== true,
    local_basic_install_blocked: false,
    full_system_green_blocked: status !== "CODEXA_READY",
    summary_line: `${humanLabel}; local Ops can continue; full two-machine routing remains gated.`,
  };
}

function mdBool(ok) {
  return ok ? "GREEN" : "NOT GREEN";
}

function mdYesNo(value) {
  return value ? "yes" : "no";
}

function operationalContractSummary(doctor) {
  const contracts = doctor?.operational_contracts || null;
  const checks = Array.isArray(contracts?.checks) ? contracts.checks : [];
  const failures = checks.filter((check) => check?.ok !== true);
  return {
    ok: Boolean(contracts?.ok === true && checks.length > 0 && failures.length === 0),
    check_count: checks.length,
    failed_count: failures.length,
    failed_ids: failures.map((check) => check?.id).filter(Boolean),
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Health Report");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Status: **${result.status}**`);
  lines.push(`Machine: \`${result.machine.name}\``);
  lines.push("");
  lines.push("## Dev / N150");
  for (const [name, probe] of Object.entries(result.dev.probes)) {
    lines.push(`- ${name}: ${mdBool(probe.ok)} (${probe.url})`);
  }
  if (result.dev.terminal_profile) {
    lines.push(`- PowerShell OB0X profile: ${mdBool(result.dev.terminal_profile.ok)}`);
    lines.push(`- PowerShell policy: ${result.dev.terminal_profile.current_user_policy || "unknown"}`);
    lines.push(`- OB0X commands: ${result.dev.terminal_profile.functions_present.join(", ") || "none"}`);
  }
  lines.push(`- OpenClaw startup retired: ${mdBool(result.dev.openclaw_startup_retired.ok)}`);
  lines.push(`- Skill primer installs: ${result.dev.skill_primers.filter((item) => item.ok).length}/${result.dev.skill_primers.length}`);
  lines.push("");
  lines.push("## AI Box / Codexa");
  for (const [name, probe] of Object.entries(result.ai_box.probes)) {
    lines.push(`- ${name}: ${mdBool(probe.ok)} (${probe.url})`);
  }
  if (result.ai_box.link_alert?.status) {
    lines.push("");
    lines.push("## AI Box Access / Recovery");
    lines.push(`- Link alert: ${result.ai_box.link_alert.status}`);
    if (result.ai_box.link_alert.signal_hygiene) {
      const signal = result.ai_box.link_alert.signal_hygiene;
      lines.push(`- Signal severity: ${signal.severity}`);
      lines.push(`- Repeat count: ${signal.repeat_count}`);
      lines.push(`- Popup reason: ${signal.notify_reason}`);
      if (signal.next_popup_after) lines.push(`- Next popup after: ${signal.next_popup_after}`);
      lines.push(`- Local install blocked: ${mdYesNo(signal.local_basic_install_blocked)}`);
      lines.push(`- Full two-machine green blocked: ${mdYesNo(signal.full_system_green_blocked)}`);
    }
    lines.push(`- Remote control available: ${mdBool(result.ai_box.link_alert.remote_control_available)}`);
    lines.push(`- Remote execution available: ${mdBool(result.ai_box.link_alert.remote_execution_available)}`);
    lines.push(`- SMB port visible: ${mdBool(result.ai_box.link_alert.smb_port_visible)}`);
    for (const [name, artifact] of Object.entries(result.ai_box.recovery_artifacts || {})) {
      lines.push(`- ${name}: ${mdBool(artifact.exists)} (${artifact.path})`);
    }
    if (result.ai_box.setup_contracts) {
      const contracts = result.ai_box.setup_contracts;
      lines.push(`- OBOX2 setup contracts: ${mdBool(contracts.ok)} (${contracts.check_count} checks, ${contracts.failed_count} failed)`);
    }
  }
  lines.push("");
  lines.push("## Current Proof Receipts");
  for (const [name, item] of Object.entries(result.receipts)) {
    const details = [];
    if (item.contract_ok !== undefined) details.push(`contracts=${mdBool(item.contract_ok)}`);
    if (item.contract_checks !== undefined) details.push(`contract_checks=${item.contract_checks}`);
    if (item.contract_failed !== undefined) details.push(`contract_failed=${item.contract_failed}`);
    if (item.execution_backlog_count !== undefined) details.push(`execution_backlog=${item.execution_backlog_count}`);
    if (item.top_execution_area) details.push(`top=${item.top_execution_area}`);
    if (item.top_execution_score !== undefined) details.push(`score=${item.top_execution_score}`);
    lines.push(`- ${name}: ${item.status || "unknown"}${details.length ? ` [${details.join(", ")}]` : ""} ${item.path ? `(${item.path})` : ""}`);
  }
  lines.push("");
  lines.push("## Warnings");
  if (result.warnings.length === 0) lines.push("- None.");
  else for (const warning of result.warnings) lines.push(`- ${warning}`);
  lines.push("");
  lines.push("## Next Actions");
  if (result.next_actions.length === 0) lines.push("- None.");
  else for (const action of result.next_actions) lines.push(`- ${action}`);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const profileBackupRoot = path.join(dataRoot, "profile-backups");
  const powershellProfilePath = path.join(userRoot, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
  const profilePolicyReceiptPath = latestReceipt("orangebox-powershell-profile-policy-", profileBackupRoot);
  const profilePolicyReceipt = readJson(profilePolicyReceiptPath || "");
  const profileText = exists(powershellProfilePath) ? fs.readFileSync(powershellProfilePath, "utf8") : "";
  const functionsPresent = ["obox", "orangebox", "obox-off", "codex", "claude", "antigravity"]
    .filter((name) => new RegExp(`function\\s+${name}\\b`, "i").test(profileText));
  const receiptPaths = {
    ops_readiness: latestReceipt("orangebox-ops-readiness-") || latestReceipt("orangebox-ops-readiness-", path.join(repoRoot, "receipts")),
    backend_install: latestReceipt("orangebox-backend-install-"),
    project_report: latestReceipt("orangebox-project-report-"),
    reality_watch: latestReceipt("orangebox-reality-watch-"),
    obox2_package: latestReceipt("orangebox-obox2-package-doctor-"),
    research_scout: latestReceipt("orangebox-external-research-scout-"),
    assurance_lab: latestReceipt("orangebox-assurance-lab-"),
    harness_benchmark: latestReceipt("orangebox-harness-benchmark-"),
    knowledge_improvements: latestReceipt("orangebox-knowledge-improvement-queue-"),
    codexa_alert: latestReceipt("orangebox-codexa-alert-"),
    codexa_smb_stage: latestReceipt("orangebox-codexa-smb-stage-"),
    mcp_doctor: latestReceipt("orangebox-mcp-doctor-"),
    ipi_doctor: latestReceipt("orangebox-ipi-doctor-"),
    memory_doctor: latestReceipt("orangebox-memory-source-truth-"),
    action_classifier: latestReceipt("orangebox-action-classifier-"),
    skill_lifecycle: latestReceipt("orangebox-skill-lifecycle-doctor-"),
    tool_ergonomics: latestReceipt("orangebox-tool-ergonomics-"),
    checkmate_eval_lane: latestReceipt("checkmate-eval-lane-"),
    signal_hygiene: latestReceipt("orangebox-operator-signal-hygiene-"),
    doer_watcher_spine: latestReceipt("orangebox-doer-watcher-spine-"),
    feature_proof: latestReceipt("orangebox-feature-acceptance-matrix-"),
    openclaw_retirement: latestReceipt("orangebox-openclaw-retirement-"),
  };
  const latest = {
    ops_readiness: readJson(receiptPaths.ops_readiness || path.join(dataRoot, "watcher", "latest-reality-watch.json")),
    backend_install: readJson(receiptPaths.backend_install || ""),
    project_report: readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json")) || readJson(receiptPaths.project_report || ""),
    reality_watch: readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json")) || readJson(receiptPaths.reality_watch || ""),
    obox2_package: readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json")) || readJson(receiptPaths.obox2_package || ""),
    research_scout: readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json")) || readJson(receiptPaths.research_scout || ""),
    assurance_lab: readJson(path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json")) || readJson(receiptPaths.assurance_lab || ""),
    harness_benchmark: readJson(path.join(dataRoot, "harness", "latest-harness-benchmark.json")) || readJson(receiptPaths.harness_benchmark || ""),
    knowledge_improvements: readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json")) || readJson(receiptPaths.knowledge_improvements || ""),
    codexa_alert: readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json")) || readJson(receiptPaths.codexa_alert || ""),
    codexa_smb_stage: readJson(path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json")) || readJson(receiptPaths.codexa_smb_stage || ""),
    mcp_doctor: readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json")) || readJson(receiptPaths.mcp_doctor || ""),
    ipi_doctor: readJson(path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json")) || readJson(receiptPaths.ipi_doctor || ""),
    memory_doctor: readJson(path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json")) || readJson(receiptPaths.memory_doctor || ""),
    action_classifier: readJson(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json")) || readJson(receiptPaths.action_classifier || ""),
    skill_lifecycle: readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json")) || readJson(receiptPaths.skill_lifecycle || ""),
    tool_ergonomics: readJson(path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json")) || readJson(receiptPaths.tool_ergonomics || ""),
    checkmate_eval_lane: readJson(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json")) || readJson(receiptPaths.checkmate_eval_lane || ""),
    signal_hygiene: readJson(path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json")) || readJson(receiptPaths.signal_hygiene || ""),
    doer_watcher_spine: readJson(path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json")) || readJson(receiptPaths.doer_watcher_spine || ""),
    feature_proof: readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json")) || readJson(receiptPaths.feature_proof || ""),
    openclaw_retirement: readJson(path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json")) || readJson(receiptPaths.openclaw_retirement || ""),
  };

  const devProbes = {
    command_server: await probe("http://127.0.0.1:8787/api/realtime/health", 3000),
    api_server: await probe("http://127.0.0.1:8797/api/health", 5000),
    local_llama_health: await probe("http://127.0.0.1:8080/health", 3000),
    local_llama_models: await probe("http://127.0.0.1:8080/v1/models", 3000),
    local_ollama: await probe("http://127.0.0.1:11434/api/tags", 1000),
    strongarm_gate: await probe("http://127.0.0.1:8094/health", 3000),
  };
  const aiBoxProbes = {
    direct_command_rail_8097: await probe("http://10.0.99.1:8097/health", 1200),
    direct_wiki_bridge_8098: await probe("http://10.0.99.1:8098/health", 1200),
    direct_receipts_8099: await probe("http://10.0.99.1:8099/", 1200),
    direct_ollama_11434: await probe("http://10.0.99.1:11434/api/tags", 1200),
    lan_command_rail_8097: await probe("http://10.0.0.4:8097/health", 1200),
    lan_ollama_11434: await probe("http://10.0.0.4:11434/api/tags", 1200),
  };
  const recoveryArtifacts = latest.codexa_alert?.recovery_artifacts || {
    obox2_setup_pack: fileSummary(path.join(downloadsRoot, "Orangebox_V2_Internal_Setup_Pack.zip")),
    rail_recovery_pack: fileSummary(path.join(dataRoot, "exports", "codexa-rail-recovery-pack-WINDOWS-NATIVE.zip")),
    rail_recovery_dir: fileSummary(path.join(dataRoot, "exports", "codexa-rail-recovery-pack", "RUN_ON_CODEXA_AS_ADMIN.cmd")),
  };
  const obox2Contracts = operationalContractSummary(latest.obox2_package);
  const knowledgeExecutionBacklog = Array.isArray(latest.knowledge_improvements?.execution_backlog)
    ? latest.knowledge_improvements.execution_backlog
    : [];
  const topKnowledgeExecution = latest.knowledge_improvements?.top_execution_candidate || knowledgeExecutionBacklog[0] || null;
  const knowledgeBacklogReady =
    latest.knowledge_improvements?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" &&
    knowledgeExecutionBacklog.length > 0 &&
    topKnowledgeExecution?.operator_approval_required === true &&
    topKnowledgeExecution?.auto_promote === false &&
    topKnowledgeExecution?.scope === "backend_ops_only" &&
    topKnowledgeExecution?.frontend_touch_allowed === false;

  const startupOpenClaw = startupPath("OpenClaw Gateway (atomeons).cmd");
  const openclawStartupMoved = Array.isArray(latest.openclaw_retirement?.startup_matches)
    ? latest.openclaw_retirement.startup_matches.find((match) => match?.source === startupOpenClaw && match?.moved === true)
    : null;
  const openclawRetired = !exists(startupOpenClaw) && latest.openclaw_retirement?.status === "OPENCLAW_STARTUP_RETIRED";
  const terminalProfileOk =
    exists(powershellProfilePath) &&
    profilePolicyReceipt?.status === "ORANGEBOX_POWERSHELL_PROFILE_ENABLED" &&
    profilePolicyReceipt?.current_user_policy_after === "RemoteSigned" &&
    functionsPresent.includes("obox") &&
    functionsPresent.includes("obox-off");
  const warnings = [];
  if (!devProbes.command_server.ok) warnings.push("Dev command server is not reachable.");
  if (!devProbes.api_server.ok) warnings.push("Dev API server is not reachable.");
  if (!devProbes.local_llama_health.ok) warnings.push("Local llama listener is not reachable.");
  if (!devProbes.strongarm_gate.ok) warnings.push("STRONGARM gate is not reachable.");
  if (!openclawRetired) warnings.push("OpenClaw startup hook is still present or no retirement receipt exists.");
  if (!terminalProfileOk) warnings.push("PowerShell OB0X terminal profile is missing, blocked, or has no receipt.");
  if (latest.mcp_doctor?.ok !== true || latest.mcp_doctor?.summary?.failed !== 0) warnings.push("MCP quarantine/tool bridge doctor is not green.");
  const mcpDescriptorIntegrityGreen =
    latest.mcp_doctor?.descriptor_integrity?.drift_detected === true &&
    latest.mcp_doctor?.descriptor_integrity?.tool_list_rug_pull_blocked === true &&
    latest.mcp_doctor?.descriptor_integrity?.auto_trust_after_drift === false;
  if (latest.mcp_doctor?.ok === true && latest.mcp_doctor?.summary?.failed === 0 && !mcpDescriptorIntegrityGreen) warnings.push("MCP descriptor-integrity drift proof is not green.");
  if (latest.ipi_doctor?.status !== "ORANGEBOX_IPI_DRILLS_GREEN") warnings.push("Indirect prompt-injection drills are not green.");
  if (latest.memory_doctor?.status !== "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN") warnings.push("Memory/source-truth doctor is not green.");
  if (latest.action_classifier?.status !== "ORANGEBOX_ACTION_CLASSIFIER_GREEN") warnings.push("Action classifier doctor is not green.");
  if (latest.skill_lifecycle?.status !== "ORANGEBOX_SKILL_LIFECYCLE_GREEN") warnings.push("Orangebox skill lifecycle doctor is not green.");
  if (latest.tool_ergonomics?.status !== "ORANGEBOX_TOOL_ERGONOMICS_GREEN") warnings.push("Orangebox tool ergonomics doctor is not green.");
  if (latest.checkmate_eval_lane?.status !== "CHECKMATE_EVAL_LANE_GREEN") warnings.push("CHECKMATE eval lane doctor is not green.");
  if (latest.signal_hygiene?.status !== "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN") warnings.push("Operator signal hygiene doctor is not green.");
  if (latest.doer_watcher_spine?.status !== "ORANGEBOX_DOER_WATCHER_SPINE_GREEN") warnings.push("Doer/watcher session spine doctor is not green.");
  if (latest.feature_proof?.status !== "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN") warnings.push("Feature acceptance matrix doctor is not green.");
  if (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok) warnings.push("AI Box command rail 8097 is not reachable.");
  if (!aiBoxProbes.direct_ollama_11434.ok && !aiBoxProbes.lan_ollama_11434.ok) warnings.push("AI Box Ollama is not reachable.");
  if (latest.codexa_alert?.remote_control_available === false) warnings.push("AI Box remote control is not reachable from this cockpit.");
  if (latest.codexa_alert?.smb_port_visible === true && latest.codexa_alert?.remote_execution_available === false) warnings.push("AI Box SMB port is visible, but no remote execution path is proven.");
  if (latest.codexa_smb_stage?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS") warnings.push("AI Box SMB port is visible, but share access is denied/unavailable for staging.");
  if (latest.obox2_package?.status !== "OBOX2_PACKAGE_VERIFIED_GREEN") warnings.push("OBOX2 package doctor is not green yet.");
  if (!obox2Contracts.ok || obox2Contracts.check_count < 30) warnings.push(`OBOX2 setup contract proof is not green enough (${obox2Contracts.check_count} checks, ${obox2Contracts.failed_count} failed).`);
  if (!recoveryArtifacts.rail_recovery_pack?.exists && (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok)) warnings.push("Codexa rail recovery zip is not generated.");
  if (latest.research_scout?.status === "EXTERNAL_RESEARCH_SCOUT_OFFLINE") warnings.push("External research scout could not reach any source.");
  if (latest.assurance_lab?.status !== "ORANGEBOX_ASSURANCE_LAB_GREEN") warnings.push("Research Assurance Lab doctor is not green.");
  if (latest.harness_benchmark?.status !== "ORANGEBOX_HARNESS_BENCHMARK_GREEN") warnings.push("Orangebox offline harness benchmark is not green.");
  if (latest.knowledge_improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") warnings.push("Knowledge Engine improvement candidates are not refreshed.");
  else if (!knowledgeBacklogReady) warnings.push("Knowledge Engine improvement candidates are refreshed, but execution-ranked backend backlog proof is not green.");
  if (latest.project_report?.full_project_green === false) warnings.push(`Project report has ${latest.project_report?.gap_count || 0} open gap(s); do not call full Orangebox green.`);

  const nextActions = [];
  if (!openclawRetired) nextActions.push("Run npm.cmd run openclaw:retire from the Orangebox repo.");
  if (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok) nextActions.push("On AI Box/Codexa, unzip the OBOX2 setup pack and run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd as Administrator. Manual fallback: RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd, RUN_CODEXA_POWER_DOCTOR.cmd, then RUN_START_CODEXA_RAIL_AS_ADMIN.cmd.");
  if (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok && !recoveryArtifacts.rail_recovery_pack?.exists) nextActions.push("Run npm.cmd run codexa:rail-pack to generate a small Windows-native rail recovery zip.");
  if (!aiBoxProbes.direct_command_rail_8097.ok && !aiBoxProbes.lan_command_rail_8097.ok && recoveryArtifacts.rail_recovery_pack?.exists) nextActions.push(`Use the rail recovery zip at ${recoveryArtifacts.rail_recovery_pack.path} when the full OBOX2 pack is too heavy.`);
  if (latest.codexa_alert?.smb_port_visible === true && latest.codexa_alert?.remote_execution_available === false) nextActions.push("Treat SMB as staging-only until RDP, WinRM, or the 8097 command rail is reachable.");
  if (latest.codexa_smb_stage?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS") nextActions.push("SMB staging is not available from this cockpit without credentials/share access; use the OBOX2 setup zip directly on Codexa or restore RDP/WinRM/8097.");
  if (!latest.codexa_smb_stage?.status) nextActions.push("Run npm.cmd run codexa:smb-stage to prove whether SMB staging is available before relying on it.");
  if (!aiBoxProbes.direct_ollama_11434.ok && !aiBoxProbes.lan_ollama_11434.ok) nextActions.push("After the AI Box power/rail proof is green, run RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd, then RUN_MODEL_DOCTOR_ON_CODEXA.cmd, or rerun START_HERE_OBOX2_INTERNAL.ps1 with -Mode core.");
  if (latest.obox2_package?.status !== "OBOX2_PACKAGE_VERIFIED_GREEN" || !obox2Contracts.ok || obox2Contracts.check_count < 30) nextActions.push("Run npm.cmd run obox2:pack and npm.cmd run obox2:doctor; do not treat the Codexa setup pack as proven until setup contracts are green.");
  if (!latest.research_scout?.status) nextActions.push("Run npm.cmd run research:scout to refresh external public research candidates.");
  if (latest.assurance_lab?.status !== "ORANGEBOX_ASSURANCE_LAB_GREEN") nextActions.push("Run npm.cmd run assurance:doctor so research-derived upgrades become scoped playbooks, gates, receipts, and rollback proof.");
  if (latest.harness_benchmark?.status !== "ORANGEBOX_HARNESS_BENCHMARK_GREEN") nextActions.push("Run npm.cmd run harness:benchmark to prove offline oracle tasks before claiming tool/routing optimization.");
  if (latest.knowledge_improvements?.status !== "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY") nextActions.push("Run npm.cmd run knowledge:improvements before promoting any learned system upgrade.");
  else if (!knowledgeBacklogReady) nextActions.push("Rerun npm.cmd run knowledge:improvements after the queue script upgrade so learned candidates include backend-only execution proof.");
  else if (topKnowledgeExecution) nextActions.push(`Top learned backend candidate: ${topKnowledgeExecution.area} (${topKnowledgeExecution.execution_score}); prove with ${topKnowledgeExecution.proof_command}.`);
  if (latest.project_report?.full_project_green === false) nextActions.push("Review npm.cmd run project:report output before claiming full project completion.");
  if (!latest.codexa_alert?.status) nextActions.push("Run npm.cmd run codexa:alert:popup once so AI Box disconnects become visible operator alerts.");
  if (latest.mcp_doctor?.ok !== true || latest.mcp_doctor?.summary?.failed !== 0) nextActions.push("Run npm.cmd run mcp:doctor to verify the MCP quarantine/tool bridge.");
  else if (!mcpDescriptorIntegrityGreen) nextActions.push("Run npm.cmd run mcp:doctor to refresh MCP descriptor-integrity drift proof.");
  if (latest.ipi_doctor?.status !== "ORANGEBOX_IPI_DRILLS_GREEN") nextActions.push("Run npm.cmd run ipi:doctor to verify untrusted text cannot smuggle tool commands.");
  if (latest.memory_doctor?.status !== "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN") nextActions.push("Run npm.cmd run memory:doctor to verify latest source-backed truth beats stale chat memory.");
  if (latest.action_classifier?.status !== "ORANGEBOX_ACTION_CLASSIFIER_GREEN") nextActions.push("Run npm.cmd run action:doctor to verify the pre-tool action classifier.");
  if (latest.skill_lifecycle?.status !== "ORANGEBOX_SKILL_LIFECYCLE_GREEN") nextActions.push("Run npm.cmd run skills:lifecycle to verify Orangebox skill install and command mappings.");
  if (latest.tool_ergonomics?.status !== "ORANGEBOX_TOOL_ERGONOMICS_GREEN") nextActions.push("Run npm.cmd run tool:ergonomics to verify command/tool names, bounded outputs, and receipt-backed proof scripts.");
  if (latest.checkmate_eval_lane?.status !== "CHECKMATE_EVAL_LANE_GREEN") nextActions.push("Run npm.cmd run checkmate:doctor to verify eval gates before prompt/model/routing/tool changes.");
  if (latest.signal_hygiene?.status !== "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN") nextActions.push("Run npm.cmd run signal:hygiene to verify alert cadence, severity labels, and confidence calibration.");
  if (latest.doer_watcher_spine?.status !== "ORANGEBOX_DOER_WATCHER_SPINE_GREEN") nextActions.push("Run npm.cmd run session:spine to verify doer surfaces, watcher freshness, and one-reality state.");
  if (latest.feature_proof?.status !== "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN") nextActions.push("Run npm.cmd run feature:proof to verify all feature claims have evidence, proof commands, and rollback or recovery truth.");

  const mcpDoctorOk = latest.mcp_doctor?.ok === true && latest.mcp_doctor?.summary?.failed === 0 && mcpDescriptorIntegrityGreen;
  const ipiDoctorOk = latest.ipi_doctor?.status === "ORANGEBOX_IPI_DRILLS_GREEN";
  const memoryDoctorOk = latest.memory_doctor?.status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN";
  const actionClassifierOk = latest.action_classifier?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN";
  const skillLifecycleOk = latest.skill_lifecycle?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN";
  const toolErgonomicsOk = latest.tool_ergonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN";
  const checkmateEvalOk = latest.checkmate_eval_lane?.status === "CHECKMATE_EVAL_LANE_GREEN";
  const signalHygieneOk = latest.signal_hygiene?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN";
  const doerWatcherSpineOk = latest.doer_watcher_spine?.status === "ORANGEBOX_DOER_WATCHER_SPINE_GREEN";
  const featureProofOk = latest.feature_proof?.status === "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN";
  const assuranceLabOk = latest.assurance_lab?.status === "ORANGEBOX_ASSURANCE_LAB_GREEN";
  const harnessBenchmarkOk = latest.harness_benchmark?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN";
  const localCoreOk = devProbes.command_server.ok && devProbes.api_server.ok && devProbes.local_llama_health.ok && devProbes.strongarm_gate.ok && openclawRetired && mcpDoctorOk && ipiDoctorOk && memoryDoctorOk && actionClassifierOk && skillLifecycleOk && toolErgonomicsOk && checkmateEvalOk && signalHygieneOk && doerWatcherSpineOk && featureProofOk && assuranceLabOk;
  const aiBoxOk = (aiBoxProbes.direct_command_rail_8097.ok || aiBoxProbes.lan_command_rail_8097.ok)
    && (aiBoxProbes.direct_ollama_11434.ok || aiBoxProbes.lan_ollama_11434.ok);
  const status = localCoreOk && aiBoxOk && warnings.length === 0
    ? "ORANGEBOX_HEALTH_GREEN"
    : localCoreOk
      ? "ORANGEBOX_HEALTH_DEV_GREEN_AIBOX_WARN"
      : "ORANGEBOX_HEALTH_NOT_GREEN";

  const result = {
    ok: status === "ORANGEBOX_HEALTH_GREEN",
    version: "orangebox-health-report/v1",
    status,
    generated_at: new Date().toISOString(),
    machine: {
      name: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      memory_gb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
    },
    repo_root: repoRoot,
    data_root: dataRoot,
    dev: {
      probes: devProbes,
      openclaw_startup_retired: {
        ok: openclawRetired,
        startup_hook_path: startupOpenClaw,
        startup_hook_present: exists(startupOpenClaw),
        retired_source_path: openclawStartupMoved?.source || null,
        disabled_backup_path: openclawStartupMoved?.destination || null,
        retirement_status: latest.openclaw_retirement?.status || null,
      },
      terminal_profile: {
        ok: terminalProfileOk,
        profile_path: powershellProfilePath,
        receipt_path: profilePolicyReceiptPath,
        current_user_policy: profilePolicyReceipt?.current_user_policy_after || null,
        functions_present: functionsPresent,
        rollback: profilePolicyReceipt?.rollback || [],
      },
      skill_primers: skillRootStatus(),
    },
    ai_box: {
      expected: {
        direct_ip: "10.0.99.1",
        lan_ip: "10.0.0.4",
        command_rail: 8097,
        wiki_bridge: 8098,
        receipts: 8099,
        ollama: 11434,
      },
      probes: aiBoxProbes,
      link_alert: latest.codexa_alert ? {
        status: latest.codexa_alert.status || null,
        message: latest.codexa_alert.message || null,
        command_rail_reachable: latest.codexa_alert.command_rail_reachable ?? null,
        wiki_bridge_reachable: latest.codexa_alert.wiki_bridge_reachable ?? null,
        receipts_reachable: latest.codexa_alert.receipts_reachable ?? null,
        ollama_reachable: latest.codexa_alert.ollama_reachable ?? null,
        remote_control_available: latest.codexa_alert.remote_control_available ?? null,
        remote_execution_available: latest.codexa_alert.remote_execution_available ?? null,
        smb_port_visible: latest.codexa_alert.smb_port_visible ?? null,
        alert_hash: latest.codexa_alert.alert_hash || null,
        last_notified_at: latest.codexa_alert.last_notified_at || null,
        signal_hygiene: codexaSignalHygiene(latest.codexa_alert),
      } : null,
      recovery_artifacts: recoveryArtifacts,
      setup_contracts: obox2Contracts,
    },
    receipts: {
      ops_readiness: { path: receiptPaths.ops_readiness, status: latest.ops_readiness?.status || latest.ops_readiness?.checks?.ops_readiness?.status || null },
      backend_install: { path: receiptPaths.backend_install, status: latest.backend_install?.status || null },
      project_report: {
        path: path.join(dataRoot, "reports", "project", "latest-project-report.json"),
        status: latest.project_report?.status || null,
        full_project_green: latest.project_report?.full_project_green ?? null,
        gap_count: latest.project_report?.gap_count ?? null,
      },
      reality_watch: { path: path.join(dataRoot, "watcher", "latest-reality-watch.json"), status: latest.reality_watch?.status || null },
      obox2_package: {
        path: path.join(dataRoot, "obox2", "latest-package-doctor.json"),
        status: latest.obox2_package?.status || null,
        contract_ok: obox2Contracts.ok,
        contract_checks: obox2Contracts.check_count,
        contract_failed: obox2Contracts.failed_count,
        contract_failed_ids: obox2Contracts.failed_ids,
      },
      research_scout: {
        path: path.join(dataRoot, "research-scout", "latest-external-research-scout.json"),
        status: latest.research_scout?.status || null,
        candidate_count: latest.research_scout?.candidate_count || 0,
      },
      assurance_lab: {
        path: path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json"),
        status: latest.assurance_lab?.status || null,
        source_count: latest.assurance_lab?.summary?.source_count || 0,
        checks_green: latest.assurance_lab?.summary?.checks_green ?? null,
        checks_total: latest.assurance_lab?.summary?.checks_total ?? null,
        proof_hash: latest.assurance_lab?.proof_hash || null,
      },
      harness_benchmark: {
        path: path.join(dataRoot, "harness", "latest-harness-benchmark.json"),
        status: latest.harness_benchmark?.status || null,
        tasks_total: latest.harness_benchmark?.tasks_total || 0,
        tasks_ok: latest.harness_benchmark?.tasks_ok || 0,
        score: latest.harness_benchmark?.score ?? null,
      },
      knowledge_improvements: {
        path: path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"),
        status: latest.knowledge_improvements?.status || null,
        candidate_count: latest.knowledge_improvements?.candidate_count || 0,
        execution_backlog_count: knowledgeExecutionBacklog.length,
        top_execution_area: topKnowledgeExecution?.area || null,
        top_execution_score: topKnowledgeExecution?.execution_score ?? null,
      },
    codexa_alert: {
      path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"),
        status: latest.codexa_alert?.status || null,
        popup_notified: latest.codexa_alert?.popup?.notified || false,
        remote_control_available: latest.codexa_alert?.remote_control_available ?? null,
        remote_execution_available: latest.codexa_alert?.remote_execution_available ?? null,
        smb_port_visible: latest.codexa_alert?.smb_port_visible ?? null,
        signal_hygiene: codexaSignalHygiene(latest.codexa_alert),
      message: latest.codexa_alert?.message || null,
    },
    codexa_smb_stage: {
      path: path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"),
      status: latest.codexa_smb_stage?.status || null,
      stage_ready: latest.codexa_smb_stage?.stage_ready ?? null,
      stage_written: latest.codexa_smb_stage?.stage_written ?? null,
      preferred_target: latest.codexa_smb_stage?.preferred_target?.path || null,
    },
    mcp_doctor: {
        path: path.join(dataRoot, "mcp", "latest-mcp-doctor.json"),
        status: latest.mcp_doctor?.ok === true ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN",
        checks: latest.mcp_doctor?.summary?.checks || 0,
        passed: latest.mcp_doctor?.summary?.passed || 0,
        failed: latest.mcp_doctor?.summary?.failed ?? null,
        host_mcp_config_mutated: latest.mcp_doctor?.host_mcp_config_mutated ?? null,
        descriptor_drift_detected: latest.mcp_doctor?.descriptor_integrity?.drift_detected ?? null,
        tool_list_rug_pull_blocked: latest.mcp_doctor?.descriptor_integrity?.tool_list_rug_pull_blocked ?? null,
        auto_trust_after_drift: latest.mcp_doctor?.descriptor_integrity?.auto_trust_after_drift ?? null,
        promotion_gate: latest.mcp_doctor?.descriptor_integrity?.promotion_gate || null,
      },
      ipi_doctor: {
        path: path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"),
        status: latest.ipi_doctor?.status || null,
        fixtures_green: latest.ipi_doctor?.summary?.fixtures_green ?? null,
        fixtures_total: latest.ipi_doctor?.summary?.fixtures_total ?? null,
        untrusted_fixtures: latest.ipi_doctor?.summary?.untrusted_fixtures ?? null,
      },
      memory_doctor: {
        path: path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json"),
        status: latest.memory_doctor?.status || null,
        drills_green: latest.memory_doctor?.summary?.drills_green ?? null,
        drills_total: latest.memory_doctor?.summary?.drills_total ?? null,
        stale_conflicts_detected: latest.memory_doctor?.summary?.stale_conflicts_detected ?? null,
        hot_packet_token_estimate: latest.memory_doctor?.summary?.hot_packet_token_estimate ?? null,
      },
      action_classifier: {
        path: path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"),
        status: latest.action_classifier?.status || null,
        cases_run: latest.action_classifier?.cases_run || 0,
        allowed_count: latest.action_classifier?.allowed_count || 0,
        staged_count: latest.action_classifier?.staged_count || 0,
        blocked_count: latest.action_classifier?.blocked_count || 0,
        sequence_cases_run: latest.action_classifier?.sequence_cases_run || 0,
        sequence_staged_count: latest.action_classifier?.sequence_staged_count || 0,
        sequence_blocked_count: latest.action_classifier?.sequence_blocked_count || 0,
      },
      skill_lifecycle: {
        path: path.join(dataRoot, "skills", "latest-skill-lifecycle.json"),
        status: latest.skill_lifecycle?.status || null,
        command_count: latest.skill_lifecycle?.command_count || 0,
        stale_count: latest.skill_lifecycle?.stale_count ?? null,
      },
      tool_ergonomics: {
        path: path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"),
        status: latest.tool_ergonomics?.status || null,
        command_count: latest.tool_ergonomics?.command_surface?.command_count || 0,
        failures: latest.tool_ergonomics?.failures?.length ?? null,
      },
      checkmate_eval_lane: {
        path: path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"),
        status: latest.checkmate_eval_lane?.status || null,
        fixture_count: latest.checkmate_eval_lane?.fixtures?.length || 0,
        failures: latest.checkmate_eval_lane?.failures?.length ?? null,
      },
      signal_hygiene: {
        path: path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json"),
        status: latest.signal_hygiene?.status || null,
        severity: latest.signal_hygiene?.signal_hygiene?.severity || null,
        confidence_calibration: latest.signal_hygiene?.confidence_calibration || null,
        operator_transparency: latest.signal_hygiene?.operator_transparency
          ? {
            version: latest.signal_hygiene.operator_transparency.version || null,
            current_alert: latest.signal_hygiene.operator_transparency.level_1_status?.current_alert || null,
            full_green_gate: latest.signal_hygiene.operator_transparency.level_3_foresight?.full_green_gate || null,
            next_safe_action: latest.signal_hygiene.operator_transparency.level_3_foresight?.next_safe_action || null,
          }
          : null,
        failures: latest.signal_hygiene?.failures?.length ?? null,
      },
      doer_watcher_spine: {
        path: path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"),
        status: latest.doer_watcher_spine?.status || null,
        failures: latest.doer_watcher_spine?.failures?.length ?? null,
        doer_command_server_ok: latest.doer_watcher_spine?.doer?.command_server?.ok ?? null,
        watcher_process_age_ms: latest.doer_watcher_spine?.watcher?.watcher_process?.age_ms ?? null,
      },
      feature_proof: {
        path: path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"),
        status: latest.feature_proof?.status || null,
        features_green: latest.feature_proof?.features_green ?? null,
        features_total: latest.feature_proof?.features_total ?? null,
        failures: latest.feature_proof?.failures?.length ?? null,
      },
      openclaw_retirement: { path: path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"), status: latest.openclaw_retirement?.status || null },
    },
    warnings,
    next_actions: nextActions,
  };

  const base = `orangebox-health-report-${stamp()}`;
  const jsonPath = path.join(reportRoot, `${base}.json`);
  const mdPath = path.join(reportRoot, `${base}.md`);
  await writeJson(jsonPath, result);
  await writeText(mdPath, renderMarkdown(result));
  await writeJson(path.join(reportRoot, "latest-health-report.json"), { ...result, report_json: jsonPath, report_markdown: mdPath });
  await writeText(path.join(reportRoot, "latest-health-report.md"), renderMarkdown({ ...result, report_json: jsonPath, report_markdown: mdPath }));
  result.report_json = jsonPath;
  result.report_markdown = mdPath;

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `${base}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (status === "ORANGEBOX_HEALTH_NOT_GREEN") process.exitCode = 1;
}

await main();
