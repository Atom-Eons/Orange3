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
const reportRoot = path.join(dataRoot, "reports", "project");

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

function latestDataFile(root, prefix, suffix = ".json") {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
}

function status(ok, partial = false) {
  if (ok) return "REAL";
  return partial ? "PARTIAL" : "NOT_REAL_YET";
}

function mdList(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Full Project Report");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Project status: **${result.status}**`);
  lines.push(`Report OK: **${result.report_ok}**`);
  lines.push(`Full project green: **${result.full_project_green}**`);
  lines.push(`Local Ops green: **${result.local_ops_green}**`);
  lines.push(`Two-machine green: **${result.two_machine_green}**`);
  lines.push(`Gap count: **${result.gap_count}**`);
  lines.push(`Repo: \`${result.repo_root}\``);
  lines.push("");
  lines.push("## System Definition");
  lines.push("");
  lines.push(result.definition);
  lines.push("");
  lines.push("## Scope Table");
  lines.push("");
  lines.push("| Area | Status | Reality | Next Work |");
  lines.push("| --- | --- | --- | --- |");
  for (const item of result.scope) {
    lines.push(`| ${item.area} | ${item.status} | ${item.reality.replace(/\|/g, "/")} | ${item.next.replace(/\|/g, "/")} |`);
  }
  lines.push("");
  lines.push("## Model Plan");
  lines.push("");
  for (const model of result.models.registered_local_models) {
    lines.push(`- ${model.id}: ${model.lane}, tier ${model.required_tier}, roles ${model.allowed_roles.join(", ")}`);
  }
  lines.push("");
  lines.push("## What Is Not Real Yet");
  lines.push("");
  lines.push(mdList(result.not_real_yet));
  lines.push("");
  lines.push("## Recommended Next Actions");
  lines.push("");
  lines.push(mdList(result.recommended_next_actions));
  lines.push("");
  lines.push("## Reports And Receipts");
  lines.push("");
  for (const [name, value] of Object.entries(result.evidence)) {
    const details = [];
    if (value.contract_ok !== undefined) details.push(`contracts=${value.contract_ok ? "GREEN" : "NOT GREEN"}`);
    if (value.contract_checks !== undefined) details.push(`contract_checks=${value.contract_checks}`);
    if (value.contract_failed !== undefined) details.push(`contract_failed=${value.contract_failed}`);
    if (value.execution_backlog_count !== undefined) details.push(`execution_backlog=${value.execution_backlog_count}`);
    if (value.top_execution_area) details.push(`top=${value.top_execution_area}`);
    if (value.top_execution_score !== undefined) details.push(`score=${value.top_execution_score}`);
    lines.push(`- ${name}: ${value.status || "unknown"}${details.length ? ` [${details.join(", ")}]` : ""} ${value.path ? `(${value.path})` : ""}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function packageScript(name, packageJson) {
  return packageJson?.scripts?.[name] || null;
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

async function main() {
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const modelRegistry = readJson(path.join(repoRoot, "config", "model_registry.json"));
  const roleMap = readJson(path.join(repoRoot, "config", "role_map.json"));
  const routingPolicy = readJson(path.join(repoRoot, "config", "routing_policy.json"));
  const soulGenome = readJson(path.join(repoRoot, "config", "soul_genome.json"));
  const atomSmasher = readJson(path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json"));
  const atomTools = readJson(path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json"));
  const strongarm = readJson(path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"));
  const gremlin = readJson(path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"));
  const triLane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"));
  const localModelLane = readJson(path.join(dataRoot, "models", "latest-local-model-lane-eval.json"));
  const modelInventory = readJson(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"));
  const obox2Pack = readJson(path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"));
  const obox2Doctor = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"));
  const soulDoctor = readJson(path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json"));
  const knowledgeImprovements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"));
  const researchScout = readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json"));
  const researchRadar = readJson(path.join(dataRoot, "research-radar", "latest-research-radar.json"));
  const assuranceLab = readJson(path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json"));
  const harnessBenchmark = readJson(path.join(dataRoot, "harness", "latest-harness-benchmark.json"));
  const codexaAlert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"));
  const codexaAccess = readJson(path.join(dataRoot, "codexa-access", "latest-codexa-access.json"));
  const codexaRemoteProof = readJson(path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"));
  const codexaBringup = readJson(path.join(dataRoot, "codexa-bringup", "latest-codexa-bringup-watch.json"));
  const codexaSmbStage = readJson(path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"));
  const mcpDoctor = readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json")) || readJson(latestReceipt("orangebox-mcp-doctor-"));
  const ipiDoctor = readJson(path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json")) || readJson(latestReceipt("orangebox-ipi-doctor-"));
  const memoryDoctor = readJson(path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json")) || readJson(latestReceipt("orangebox-memory-source-truth-"));
  const actionClassifier = readJson(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json")) || readJson(latestReceipt("orangebox-action-classifier-"));
  const skillLifecycle = readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json")) || readJson(latestReceipt("orangebox-skill-lifecycle-doctor-"));
  const toolErgonomics = readJson(path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json")) || readJson(latestReceipt("orangebox-tool-ergonomics-"));
  const toolmesh = readJson(path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json"));
  const horizonReview = readJson(path.join(dataRoot, "horizon-review", "latest-horizon-review.json")) || readJson(latestReceipt("orangebox-horizon-review-"));
  const visualReadiness = readJson(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json")) || readJson(latestReceipt("orangebox-visual-production-readiness-"));
  const checkmateEval = readJson(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json")) || readJson(latestReceipt("checkmate-eval-lane-"));
  const signalHygiene = readJson(path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json")) || readJson(latestReceipt("orangebox-operator-signal-hygiene-"));
  const doerWatcherSpine = readJson(path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json")) || readJson(latestReceipt("orangebox-doer-watcher-spine-"));
  const featureProof = readJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json")) || readJson(latestReceipt("orangebox-feature-acceptance-matrix-"));
  const opsGapLedger = readJson(path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json")) || readJson(latestReceipt("orangebox-ops-gap-ledger-"));
  const codexaHandoff = readJson(path.join(dataRoot, "codexa-handoff", "latest-codexa-handoff.json")) || readJson(latestReceipt("orangebox-codexa-handoff-"));
  const reality = readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json"));
  const openclawRetire = readJson(path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"));
  const fullGreen = readJson(path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json"));
  const backendInstallPath = latestReceipt("orangebox-backend-install-");
  const opsReadinessPath = latestReceipt("orangebox-ops-readiness-");
  const backendInstall = readJson(backendInstallPath);
  const opsReadiness = readJson(opsReadinessPath);
  const aecodeFormat = readJson(path.join(dataRoot, "aecode-format", "latest-final-format.json"));
  const terminalProfilePath = path.join(userRoot, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
  const terminalProfileText = exists(terminalProfilePath) ? fs.readFileSync(terminalProfilePath, "utf8") : "";
  const terminalProfileReceiptPath = latestDataFile(path.join(dataRoot, "profile-backups"), "orangebox-powershell-profile-policy-");
  const terminalProfileReceipt = readJson(terminalProfileReceiptPath);

  const mcpReal = exists(path.join(repoRoot, "scripts", "orangebox-mcp-server.mjs"))
    && exists(path.join(repoRoot, "scripts", "orangebox-command-server.mjs"));
  const aiBoxRailReachable =
    reality?.checks?.probes?.ai_box_command_8097?.ok === true ||
    codexaAlert?.command_rail_reachable === true ||
    codexaAccess?.access?.command_rail === true ||
    codexaRemoteProof?.summary?.command_rail_health === true ||
    codexaRemoteProof?.rails?.command_rail?.ok === true;
  const codexaRemoteRuntimeGreen = codexaRemoteProof?.codexa_remote_runtime_green === true;
  const codexaRemoteOllamaGreen = codexaRemoteProof?.summary?.ollama_loopback_ok === true;
  const codexaRemoteMissingModels = Array.isArray(codexaRemoteProof?.summary?.missing_expected_models)
    ? codexaRemoteProof.summary.missing_expected_models
    : Array.isArray(codexaRemoteProof?.summary?.missing_models)
      ? codexaRemoteProof.summary.missing_models
      : [];
  const codexaRemoteModelsGreen = codexaRemoteRuntimeGreen
    && Number(codexaRemoteProof?.summary?.expected_models_installed || 0) >= Number(codexaRemoteProof?.summary?.expected_models_total || 1)
    && codexaRemoteMissingModels.length === 0;
  const codexaRemoteHermesGreen = codexaRemoteProof?.summary?.hermes_green === true;
  const codexaRuntimeReady = codexaRemoteRuntimeGreen && codexaRemoteOllamaGreen && codexaRemoteModelsGreen;
  const codexaReceiptsReachable = codexaAlert?.receipts_reachable === true;
  const codexaRemoteControlAvailable = codexaAlert?.remote_control_available === true;
  const codexaRemoteExecutionAvailable = codexaAlert?.remote_execution_available === true;
  const codexaSmbVisible = codexaAlert?.smb_port_visible === true;
  const codexaRailRecoveryPack = codexaAlert?.recovery_artifacts?.rail_recovery_pack || null;
  const codexaObox2Pack = codexaAlert?.recovery_artifacts?.obox2_setup_pack || null;
  const codexaAccessReported = [
    "CODEXA_ACCESS_FULL_READY",
    "CODEXA_ACCESS_COMMAND_RAIL_READY",
    "CODEXA_ACCESS_WINRM_READY",
    "CODEXA_ACCESS_RDP_READY",
    "CODEXA_ACCESS_RECEIPTS_ONLY",
    "CODEXA_ACCESS_SMB_VISIBLE_ONLY",
    "CODEXA_ACCESS_UNREACHABLE",
  ].includes(codexaAccess?.status);
  const codexaAccessGreen = codexaAccess?.status === "CODEXA_ACCESS_FULL_READY";
  const openclawRetired = openclawRetire?.status === "OPENCLAW_STARTUP_RETIRED";
  const packageGreen = obox2Doctor?.status === "OBOX2_PACKAGE_VERIFIED_GREEN";
  const obox2Contracts = operationalContractSummary(obox2Doctor);
  const obox2ContractGreen = packageGreen && obox2Contracts.ok && obox2Contracts.check_count >= 30;
  const knowledgeImprovementsReady =
    knowledgeImprovements?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" &&
    knowledgeImprovements?.not_autonomous === true;
  const knowledgeExecutionBacklog = Array.isArray(knowledgeImprovements?.execution_backlog)
    ? knowledgeImprovements.execution_backlog
    : [];
  const topKnowledgeExecution = knowledgeImprovements?.top_execution_candidate || knowledgeExecutionBacklog[0] || null;
  const knowledgeBacklogReady =
    knowledgeImprovementsReady &&
    knowledgeExecutionBacklog.length > 0 &&
    topKnowledgeExecution?.operator_approval_required === true &&
    topKnowledgeExecution?.auto_promote === false &&
    topKnowledgeExecution?.scope === "backend_ops_only" &&
    topKnowledgeExecution?.frontend_touch_allowed === false;
  const researchScoutReady =
    researchScout?.status === "EXTERNAL_RESEARCH_SCOUT_READY" ||
    researchScout?.status === "EXTERNAL_RESEARCH_SCOUT_DEGRADED";
  const researchRadarReady =
    researchRadar?.status === "ORANGEBOX_RESEARCH_RADAR_GREEN" ||
    researchRadar?.status === "ORANGEBOX_RESEARCH_RADAR_REPORTED_WITH_GAPS";
  const assuranceLabGreen = assuranceLab?.status === "ORANGEBOX_ASSURANCE_LAB_GREEN";
  const harnessBenchmarkGreen = harnessBenchmark?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN";
  const mcpQuarantineGreen =
    mcpDoctor?.ok === true &&
    mcpDoctor?.summary?.failed === 0 &&
    mcpDoctor?.install_attempted === false &&
    mcpDoctor?.host_mcp_config_mutated === false &&
    mcpDoctor?.paid_api_attempted === false &&
    mcpDoctor?.descriptor_integrity?.drift_detected === true &&
    mcpDoctor?.descriptor_integrity?.tool_list_rug_pull_blocked === true &&
    mcpDoctor?.descriptor_integrity?.auto_trust_after_drift === false;
  const ipiDoctorGreen =
    ipiDoctor?.status === "ORANGEBOX_IPI_DRILLS_GREEN" &&
    ipiDoctor?.constraints?.command_executed === false &&
    ipiDoctor?.constraints?.network_called === false &&
    ipiDoctor?.summary?.fixtures_green === ipiDoctor?.summary?.fixtures_total;
  const memoryDoctorGreen =
    memoryDoctor?.status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN" &&
    memoryDoctor?.constraints?.raw_history_injected === false &&
    memoryDoctor?.summary?.drills_green === memoryDoctor?.summary?.drills_total &&
    Number(memoryDoctor?.summary?.stale_conflicts_detected || 0) >= 1;
  const actionClassifierGreen = actionClassifier?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN";
  const skillLifecycleGreen = skillLifecycle?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN";
  const toolErgonomicsGreen = toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN";
  const toolmeshGreen =
    toolmesh?.status === "GREEN" &&
    toolmesh?.ok === true &&
    Number(toolmesh?.summary?.cards_total || 0) >= 39 &&
    toolmesh?.checks?.first_batch_registered === true &&
    toolmesh?.checks?.execution_blocked_until_promoted === true &&
    toolmesh?.checks?.hardware_profiles_declared === true &&
    toolmesh?.checks?.artifact_pointer_policy_declared === true &&
    toolmesh?.checks?.execution_modes_declared === true &&
    toolmesh?.checks?.immutable_templates_for_workflow_tools === true &&
    toolmesh?.waveValidation?.preservedV3Count === 16 &&
    toolmesh?.waveValidation?.toolmeshCount === 10;
  const horizonReviewReady = horizonReview?.status === "ORANGEBOX_HORIZON_REVIEW_READY" && horizonReview?.ok === true;
  const visualReadinessReported =
    visualReadiness?.status === "ORANGEBOX_VISUAL_PRODUCTION_CONTROL_READY_RUNTIME_NOT_PROMOTED" ||
    visualReadiness?.status === "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY";
  const visualReadinessDoctorGreen = visualReadinessReported && visualReadiness?.ok === true && visualReadiness?.control_plane_green === true;
  const checkmateEvalGreen = checkmateEval?.status === "CHECKMATE_EVAL_LANE_GREEN";
  const evalIntegrityGreen = checkmateEvalGreen
    && Array.isArray(checkmateEval?.fixtures)
    && checkmateEval.fixtures.some((fixture) => fixture.id === "benchmark_hygiene_integrity_gate")
    && Array.isArray(harnessBenchmark?.tasks)
    && harnessBenchmark.tasks.some((task) => task.id === "eval_integrity_benchmark_hygiene_truth" && task.ok === true);
  const localModelLaneGreen =
    localModelLane?.status === "LOCAL_MODEL_LANE_EVAL_GREEN" &&
    localModelLane?.constraints?.frontend_touched === false &&
    localModelLane?.constraints?.model_call_attempted === false &&
    localModelLane?.constraints?.ollama_pull_attempted === false &&
    localModelLane?.promotion_law?.no_model_card_promotion === true &&
    localModelLane?.promotion_law?.wildcard_never_final_authority === true &&
    localModelLane?.packet_eval?.fixtures_green === localModelLane?.packet_eval?.fixtures_total;
  const modelInventoryReported =
    modelInventory?.status === "ORANGEBOX_MODEL_INVENTORY_GREEN" ||
    modelInventory?.status === "ORANGEBOX_MODEL_INVENTORY_REPORTED_WITH_GAPS";
  const modelInventoryGreen =
    modelInventory?.status === "ORANGEBOX_MODEL_INVENTORY_GREEN" &&
    modelInventory?.full_local_model_runtime_green === true;
  const signalHygieneGreen = signalHygiene?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN";
  const doerWatcherSpineGreen = doerWatcherSpine?.status === "ORANGEBOX_DOER_WATCHER_SPINE_GREEN";
  const featureProofGreen = featureProof?.status === "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN";
  const opsGapLedgerReady =
    opsGapLedger?.status === "ORANGEBOX_OPS_GAP_LEDGER_REPORTED_OPEN_GAPS" ||
    opsGapLedger?.status === "ORANGEBOX_OPS_GAP_LEDGER_GREEN_NO_OPEN_GAPS";
  const codexaHandoffReady =
    codexaHandoff?.status === "CODEXA_HANDOFF_READY_WITH_OPEN_GAPS" ||
    codexaHandoff?.status === "CODEXA_HANDOFF_READY_NO_OPEN_GAPS";
  const codexaBringupReported =
    codexaBringup?.status === "CODEXA_BRINGUP_READY" ||
    codexaBringup?.status === "CODEXA_BRINGUP_REPORTED_OPEN_GAPS" ||
    codexaBringup?.status === "CODEXA_BRINGUP_WATCH_REPORTED_ALERT_FAILURE";
  const localOpsBackendGreen =
    backendInstall?.status === "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN" &&
    opsReadiness?.status === "ORANGEBOX_OPS_RAILS_GREEN";
  const terminalProfileGreen =
    exists(terminalProfilePath) &&
    terminalProfileText.includes("function obox") &&
    terminalProfileText.includes("function obox-off") &&
    terminalProfileText.includes("ORANGEBOX_ACTIVE") &&
    terminalProfileReceipt?.status === "ORANGEBOX_POWERSHELL_PROFILE_ENABLED" &&
    terminalProfileReceipt?.current_user_policy_after === "RemoteSigned";

  const scope = [
    {
      area: "Orangebox Ops backend",
      status: status(localOpsBackendGreen, Boolean(backendInstall || opsReadiness)),
      reality: localOpsBackendGreen
        ? "Local backend proof and ops readiness are green; command server, API server, local listener, and STRONGARM are startup-managed."
        : "Local backend has some proof receipts, but backend install and ops readiness are not both green.",
      next: localOpsBackendGreen
        ? "Keep backend proof in every release gate. Treat two-device full-green as a separate Codexa readiness gate."
        : "Run npm.cmd run backend:proof and npm.cmd run ops:readiness.",
    },
    {
      area: "MCP quarantine/tool bridge",
      status: status(mcpQuarantineGreen, exists(path.join(repoRoot, "scripts", "v4", "mcp-doctor.mjs"))),
      reality: mcpQuarantineGreen
        ? `MCP registry, local HTTP tool-list probe, descriptor drift/rug-pull detection, metadata-only stdio probe, disable override, CLI/API source probe, and code-mode execute guard are green (${mcpDoctor?.summary?.passed || 0}/${mcpDoctor?.summary?.checks || 0}).`
        : "MCP bridge source exists, but the quarantine doctor is not green yet.",
      next: mcpQuarantineGreen
        ? "Keep all new MCPs as candidates until health, tools, scopes, output caps, receipts, and operator-confirmed write mode are proven."
        : "Run npm.cmd run mcp:doctor and fix the exact failed gate.",
    },
    {
      area: "Indirect prompt-injection drills",
      status: status(ipiDoctorGreen, exists(path.join(repoRoot, "scripts", "v4", "indirect-prompt-injection-doctor.mjs"))),
      reality: ipiDoctorGreen
        ? `IPI drills are green: ${ipiDoctor?.summary?.fixtures_green || 0}/${ipiDoctor?.summary?.fixtures_total || 0} fixtures, ${ipiDoctor?.summary?.untrusted_fixtures || 0} untrusted channels quarantined, no commands executed.`
        : "IPI drill source exists or is planned, but the current receipt is not green yet.",
      next: ipiDoctorGreen
        ? "Run ipi:doctor before promoting MCP, retrieval, email, browser, repo, PDF, or memory-ingestion changes."
        : "Run npm.cmd run ipi:doctor and fix the exact failed drill.",
    },
    {
      area: "Memory/source truth",
      status: status(memoryDoctorGreen, exists(path.join(repoRoot, "scripts", "v4", "memory-source-truth-doctor.mjs"))),
      reality: memoryDoctorGreen
        ? `Memory/source truth drills are green: ${memoryDoctor?.summary?.drills_green || 0}/${memoryDoctor?.summary?.drills_total || 0} drills, ${memoryDoctor?.summary?.stale_conflicts_detected || 0} stale conflict(s), hot packet ${memoryDoctor?.summary?.hot_packet_token_estimate || 0} token proxy.`
        : "Memory/source-truth drill source exists or is planned, but the current receipt is not green yet.",
      next: memoryDoctorGreen
        ? "Run memory:doctor before promoting chatbackup, AtomSmasher compression, retrieval, or Knowledge Engine upgrades."
        : "Run npm.cmd run memory:doctor and fix the exact failed stale-memory/source-pointer drill.",
    },
    {
      area: "Action classifier permission gate",
      status: status(actionClassifierGreen, exists(path.join(repoRoot, "scripts", "v4", "action-classifier.mjs"))),
      reality: actionClassifierGreen
        ? `Pre-tool command classifier is green: ${actionClassifier?.allowed_count || 0} allowed, ${actionClassifier?.staged_count || 0} staged, ${actionClassifier?.blocked_count || 0} blocked, ${actionClassifier?.cases_run || 0} single-action fixtures; ${actionClassifier?.sequence_blocked_count || 0}/${actionClassifier?.sequence_cases_run || 0} suspicious action-sequence fixture(s) blocked. Command server imports the same classifier.`
        : "Action classifier source exists, but its doctor is not green yet.",
      next: actionClassifierGreen
        ? "Keep expanding fixtures before new tool surfaces are allowed."
        : "Run npm.cmd run action:doctor and fix any exact fixture mismatch.",
    },
    {
      area: "Skill lifecycle compression",
      status: status(skillLifecycleGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-skill-lifecycle-doctor.mjs"))),
      reality: skillLifecycleGreen
        ? `Orangebox primer skill is installed across app roots, stale skills are absent, and ${skillLifecycle?.command_count || 0} real skill commands map to existing proof scripts.`
        : "Skill lifecycle source exists, but install roots or command mappings are not proven green.",
      next: skillLifecycleGreen
        ? "Promote new skills only when they reduce repeated work, have command/proof mappings, and pass stale-skill gates."
        : "Run npm.cmd run skills:lifecycle and fix the exact failed root or command mapping.",
    },
    {
      area: "Tool ergonomics eval lane",
      status: status(toolErgonomicsGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-tool-ergonomics-doctor.mjs"))),
      reality: toolErgonomicsGreen
        ? `Tool ergonomics is green: ${toolErgonomics?.command_surface?.command_count || 0} commands checked for distinct names, concise descriptions, receipt-backed proofs, bounded outputs, and backend-only constraints.`
        : "Tool ergonomics doctor source exists or is planned, but the current receipt is not green yet.",
      next: toolErgonomicsGreen
        ? "Run this doctor before adding, renaming, or promoting Orangebox commands/tools."
        : "Run npm.cmd run tool:ergonomics and fix the exact failed command/tool surface check.",
    },
    {
      area: "V3 free-alpha ToolMesh",
      status: status(toolmeshGreen, exists(path.join(repoRoot, "orangebox-v3", "toolmesh", "toolmesh-cli.ts"))),
      reality: toolmeshGreen
        ? `ToolMesh registry is green: ${toolmesh?.summary?.cards_total || 0} cards, ${toolmesh?.waveValidation?.preservedV3Count || 0} preserved V3 waves, ${toolmesh?.waveValidation?.toolmeshCount || 0} ToolMesh waves, execution blocked until promotion, hardware profiles and artifact-pointer policy declared.`
        : "ToolMesh source exists or is planned, but the current doctor receipt is not green yet.",
      next: toolmeshGreen
        ? "Use lab doctors and benchmark gates before installing, executing, or promoting candidate tools."
        : "Run npm.cmd run toolmesh:doctor and fix the exact registry/card/wave failure.",
    },
    {
      area: "Visual production readiness",
      status: status(visualReadinessDoctorGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-visual-production-readiness-doctor.mjs"))),
      reality: visualReadinessDoctorGreen
        ? `Visual production control plane is reported: ${visualReadiness?.summary?.visual_tool_cards || 0} visual/media/design cards, ${visualReadiness?.summary?.control_green_lanes || 0}/4 lanes control-green, ${visualReadiness?.summary?.runtime_ready_lanes || 0}/4 runtime-ready, artifact_vault_ready=${Boolean(visualReadiness?.summary?.artifact_vault_ready)}, visual_ready=${Boolean(visualReadiness?.visual_ready)}.`
        : "Visual production readiness doctor source exists or is planned, but no current readiness receipt is available yet.",
      next: visualReadinessDoctorGreen
        ? "Do not call visual runtime ready until sample generation receipts, hardware locks, and promotion gates are green."
        : "Run npm.cmd run visual:readiness so visual/media/design runtime truth is visible in Ops reports.",
    },
    {
      area: "Horizon review / new alpha stack",
      status: status(horizonReviewReady, exists(path.join(repoRoot, "scripts", "v4", "orangebox-horizon-review-doctor.mjs"))),
      reality: horizonReviewReady
        ? `Horizon review is current: ${horizonReview?.summary?.candidates_reviewed || 0} candidates reviewed, Elysia dependency=${Boolean(horizonReview?.summary?.elysia_dependency_present)}, Goose card=${Boolean(horizonReview?.summary?.goose_card_present)}; no candidate auto-promoted.`
        : "Horizon review source exists or is planned, but no current review receipt is green yet.",
      next: horizonReviewReady
        ? "Use horizon:review before adopting OpenJarvis/OBOX Jarvis, Goose, Context7, AI SDK/Ollama, libSQL, Mastra, or GPU acceleration candidates."
        : "Run npm.cmd run horizon:review and fix missing candidate evidence.",
    },
    {
      area: "CHECKMATE eval lane",
      status: status(checkmateEvalGreen, exists(path.join(repoRoot, "scripts", "v4", "checkmate-eval-lane-doctor.mjs"))),
      reality: checkmateEvalGreen
        ? `CHECKMATE is green: ${checkmateEval?.fixtures?.length || 0} fixtures gate prompt, model, routing, benchmark, and tool changes before promotion.`
        : "CHECKMATE eval lane source exists or is planned, but the current receipt is not green yet.",
      next: checkmateEvalGreen
        ? "Run this doctor before prompt, model, routing, benchmark, or tool-surface promotions."
        : "Run npm.cmd run checkmate:doctor and fix the exact failed eval gate.",
    },
    {
      area: "Eval integrity / benchmark hygiene",
      status: status(evalIntegrityGreen, exists(path.join(repoRoot, "scripts", "v4", "checkmate-eval-lane-doctor.mjs"))),
      reality: evalIntegrityGreen
        ? "Benchmark hygiene is green: CHECKMATE has leakage/canary/web-trace/score-inflation fixtures and the harness eval-integrity task passes."
        : "Benchmark hygiene is planned or partially present, but the current CHECKMATE/harness receipts are not both green yet.",
      next: evalIntegrityGreen
        ? "Run checkmate:doctor and harness:benchmark before trusting any benchmark, score, model, or routing optimization claim."
        : "Run npm.cmd run checkmate:doctor && npm.cmd run harness:benchmark, then fix the exact eval-integrity failure.",
    },
    {
      area: "Operator signal hygiene",
      status: status(signalHygieneGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-operator-signal-hygiene-doctor.mjs"))),
      reality: signalHygieneGreen
        ? `Operator signal hygiene is green: severity=${signalHygiene?.signal_hygiene?.severity || "unknown"}, confidence=${signalHygiene?.confidence_calibration?.local_ops || "unknown"}, checks=${signalHygiene?.checks?.length || 0}, transparency=${signalHygiene?.operator_transparency?.version || "missing"}, full_green_gate=${signalHygiene?.operator_transparency?.level_3_foresight?.full_green_gate || "unknown"}.`
        : "Operator signal hygiene source exists or is planned, but the current receipt is not green yet.",
      next: signalHygieneGreen
        ? "Run this doctor before changing alert, watcher, popup, or status-report behavior."
        : "Run npm.cmd run signal:hygiene and fix the exact failed signal/cadence check.",
    },
    {
      area: "Doer/watcher session spine",
      status: status(doerWatcherSpineGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-doer-watcher-session-spine-doctor.mjs"))),
      reality: doerWatcherSpineGreen
        ? `Doer/watcher spine is green: doer command=${doerWatcherSpine?.doer?.command_server?.ok === true}, watcher age=${doerWatcherSpine?.watcher?.watcher_process?.age_ms ?? "unknown"}ms, Codexa=${doerWatcherSpine?.one_reality?.codexa_status || "unknown"}.`
        : "Doer/watcher session spine source exists or is planned, but the current receipt is not green yet.",
      next: doerWatcherSpineGreen
        ? "Keep this doctor in the local Ops proof chain before changing watcher, rail, command-server, or Codexa readiness behavior."
        : "Run npm.cmd run session:spine and fix the exact failed doer/watcher check.",
    },
    {
      area: "Feature acceptance matrix",
      status: status(featureProofGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-feature-acceptance-matrix-doctor.mjs"))),
      reality: featureProofGreen
        ? `${featureProof?.features_green || 0}/${featureProof?.features_total || 0} feature claims have status, evidence, proof commands, and rollback or recovery truth.`
        : "Feature acceptance matrix source exists or is planned, but the current receipt is not green yet.",
      next: featureProofGreen
        ? "Keep feature:proof in the local Ops green chain before claiming new systems are done."
        : "Run npm.cmd run feature:proof and fix the exact failed feature row.",
    },
    {
      area: "Ops gap ledger",
      status: status(opsGapLedgerReady, exists(path.join(repoRoot, "scripts", "v4", "orangebox-ops-gap-ledger.mjs"))),
      reality: opsGapLedgerReady
        ? `Ops gap ledger is current with ${opsGapLedger?.gap_count ?? 0} named gap(s), ${opsGapLedger?.critical_gap_count ?? 0} critical, and full-system green allowed=${Boolean(opsGapLedger?.full_system_green_claim_allowed)}.`
        : "Ops gap ledger source exists or is planned, but no current gap ledger receipt is green yet.",
      next: opsGapLedgerReady
        ? "Work the highest-severity gap first and rerun ops:gaps before making full-system claims."
        : "Run npm.cmd run ops:gaps, then rerun project/readiness proof.",
    },
    {
      area: "Codexa setup handoff",
      status: status(codexaHandoffReady, exists(path.join(repoRoot, "scripts", "v4", "orangebox-codexa-handoff-doctor.mjs"))),
      reality: codexaHandoffReady
        ? `Codexa handoff is current: first click=${codexaHandoff?.codexa_run_order?.[0]?.command || "unknown"}, setup zip exists=${Boolean(codexaHandoff?.setup_zip?.exists)}, open gaps=${codexaHandoff?.open_gap_count ?? 0}.`
        : "Codexa handoff source exists or is planned, but no current handoff receipt is green yet.",
      next: codexaHandoffReady
        ? "Use codexa:handoff before operator setup on Codexa, then rerun the listed cockpit verification commands."
        : "Run npm.cmd run codexa:handoff so Codexa setup has one current receipt and first-click order.",
    },
    {
      area: "N150 to AI Box MCP/command bridge",
      status: status(mcpReal && aiBoxRailReachable, mcpReal),
      reality: mcpReal
        ? [
          "MCP server and command-server AI Box routes exist.",
          aiBoxRailReachable ? "AI Box command rail 8097 is reachable." : "AI Box command rail 8097 is not reachable.",
          codexaReceiptsReachable ? "Receipt dashboard 8099 is reachable." : "Receipt dashboard 8099 is not reachable.",
          codexaRemoteControlAvailable ? "RDP/WinRM remote control is reachable." : "RDP/WinRM remote control is not reachable.",
          codexaSmbVisible ? "SMB port is visible, but staging is not execution." : "SMB staging is not visible.",
        ].join(" ")
        : "No MCP/command bridge source found.",
      next: codexaRailRecoveryPack?.exists
        ? `Start Codexa rail 8097 on AI Box using OBOX2 or the rail recovery zip at ${codexaRailRecoveryPack.path}, then rerun health report.`
        : "Generate npm.cmd run codexa:rail-pack, start Codexa rail 8097 on AI Box, then rerun health report.",
    },
    {
      area: "Codexa visible alerting",
      status: status(Boolean(codexaAlert?.status), exists(path.join(repoRoot, "scripts", "v4", "orangebox-codexa-alert-doctor.mjs"))),
      reality: codexaAlert?.status
        ? `Codexa alert doctor is real. Current status: ${codexaAlert.status}. Signal hygiene: ${codexaAlert.signal_hygiene?.summary_line || "legacy/unknown"}. It writes receipts and can show throttled Windows popups.`
        : "Codexa alert script exists or is planned, but no alert receipt is current yet.",
      next: codexaAlert?.status
        ? "Keep alerting explicit until Codexa rails and Ollama are green."
        : "Run npm.cmd run codexa:alert:popup, then rerun project/readiness proof.",
    },
    {
      area: "Codexa access surfaces",
      status: status(codexaAccessGreen, codexaAccessReported || exists(path.join(repoRoot, "scripts", "v4", "codexa-access-doctor.mjs"))),
      reality: codexaAccessReported
        ? `Codexa access doctor is current: ${codexaAccess.status}. Command rail=${Boolean(codexaAccess.access?.command_rail)}, Ollama=${Boolean(codexaAccess.access?.ollama)}, RDP=${Boolean(codexaAccess.access?.rdp)}, WinRM=${Boolean(codexaAccess.access?.winrm)}, SMB=${Boolean(codexaAccess.access?.smb)}, receipts=${Boolean(codexaAccess.access?.receipts)}.`
        : "Codexa access doctor source exists or is planned, but no current access receipt has separated RDP/WinRM/SMB/rail/Ollama truth yet.",
      next: codexaAccessGreen
        ? "Run model inventory and local model eval before routing heavy work to Codexa."
        : codexaAccessReported
          ? "Use codexa:access before codexa:watch when remote access claims are uncertain."
          : "Run npm.cmd run codexa:access, then rerun project:report.",
    },
    {
      area: "Codexa remote runtime proof",
      status: status(codexaRemoteRuntimeGreen, exists(path.join(repoRoot, "scripts", "v4", "codexa-remote-runtime-proof.mjs"))),
      reality: codexaRemoteProof?.status
        ? `Codexa remote runtime proof is current: ${codexaRemoteProof.status}. Loopback Ollama=${Boolean(codexaRemoteProof.summary?.ollama_loopback_ok)}, expected models=${codexaRemoteProof.summary?.expected_models_installed ?? "unknown"}/${codexaRemoteProof.summary?.expected_models_total ?? "unknown"}, Hermes=${Boolean(codexaRemoteProof.summary?.hermes_green)}.`
        : "Codexa remote runtime proof source exists or is planned, but no receipt has proven loopback-local Ollama/model truth yet.",
      next: codexaRemoteRuntimeGreen
        ? "Use remote runtime proof when direct Codexa Ollama is intentionally closed."
        : "Run npm.cmd run codexa:remote-proof before claiming Codexa models are installed.",
    },
    {
      area: "Codexa bring-up watcher",
      status: status(codexaBringupReported, exists(path.join(repoRoot, "scripts", "v4", "orangebox-codexa-bringup-watch.mjs"))),
      reality: codexaBringupReported
        ? `Codexa bring-up watcher is real. Current status: ${codexaBringup.status}. Ready=${Boolean(codexaBringup.codexa_ready)}. Missing: ${(codexaBringup.verdict?.missing || []).join(", ") || "none"}.`
        : "Codexa bring-up watcher source exists or is planned, but no current watcher receipt is green yet.",
      next: codexaBringupReported
        ? "After running the setup pack on Codexa, use codexa:watch to wait for the command rail, Ollama, and receipt rails before claiming two-machine readiness."
        : "Run npm.cmd run codexa:watch after the OBOX2 setup pack is attempted on Codexa.",
    },
    {
      area: "OB0X terminal affordance",
      status: status(terminalProfileGreen, exists(terminalProfilePath)),
      reality: terminalProfileGreen
        ? "PowerShell profile has obox/obox-off, ORANGEBOX_ACTIVE env state, RemoteSigned CurrentUser policy proof, and no startup spam."
        : "Terminal profile exists or is planned, but OB0X ON affordance is not fully proven by receipt.",
      next: terminalProfileGreen
        ? "Use `obox` to enter Orangebox Ops mode in a fresh shell; use `obox-off` when leaving."
        : "Run the terminal profile doctor/fix path, then rerun project:report and ops:readiness.",
    },
    {
      area: "Codexa SMB staging",
      status: codexaSmbStage?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS" && codexaRuntimeReady ? "NONBLOCKING_ATTENTION" : status(Boolean(codexaSmbStage?.stage_ready || codexaSmbStage?.stage_written), Boolean(codexaSmbStage?.status)),
      reality: codexaSmbStage?.status
        ? [
          `SMB stage doctor status: ${codexaSmbStage.status}.`,
          `Stage ready: ${Boolean(codexaSmbStage.stage_ready)}.`,
          `Stage written: ${Boolean(codexaSmbStage.stage_written)}.`,
          codexaSmbStage.preferred_target?.path ? `Preferred target: ${codexaSmbStage.preferred_target.path}.` : "No accessible staging target.",
          "SMB is file delivery only, not remote execution or Codexa green proof.",
        ].join(" ")
        : "SMB stage doctor has not been run yet; SMB visibility is not enough to claim file staging or execution.",
      next: codexaSmbStage?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS"
        ? "Share access is denied/unavailable; use the OBOX2 setup zip directly on Codexa or restore RDP/WinRM/8097."
        : codexaSmbStage?.stage_ready
          ? "If operator intentionally approves file delivery, rerun codexa-smb-stage with --stage --operator-approved; still run setup on Codexa."
          : "Run npm.cmd run codexa:smb-stage before relying on SMB staging.",
    },
    {
      area: "Hermes outer orchestration",
      status: status(codexaRemoteHermesGreen, exists(path.join(repoRoot, "scripts", "v4", "hermes", "hermes-doctor.mjs")) || codexaRemoteProof?.summary?.hermes_green !== undefined),
      reality: codexaRemoteHermesGreen
        ? "Hermes orchestration is proven by Codexa remote runtime proof."
        : "Hermes readiness scripts and setup path exist. Hermes is not proven installed or running in this report.",
      next: codexaRemoteHermesGreen
        ? "Keep Hermes in the Codexa remote proof and model-lane proof chain."
        : "Run the OBOX2 Hermes doctor/install on Codexa when ready.",
    },
    {
      area: "OpenClaw retirement",
      status: status(openclawRetired),
      reality: openclawRetired ? "OpenClaw startup retired with backup receipt." : "OpenClaw startup still needs retirement or proof receipt.",
      next: openclawRetired ? "Do not reintroduce OpenClaw startup hooks." : "Run npm.cmd run openclaw:retire.",
    },
    {
      area: "Knowledge Engine",
      status: status(knowledgeBacklogReady, knowledgeImprovementsReady || exists(path.join(repoRoot, "scripts", "orangebox-knowledge-v2.mjs"))),
      reality: knowledgeImprovementsReady
        ? `Knowledge storage/search, receipts, primers, ${knowledgeImprovements?.candidate_count || 0} learned improvement candidates, and ${knowledgeExecutionBacklog.length} execution-ranked backend backlog item(s) are real. Top item: ${topKnowledgeExecution?.area || "none"}. Autonomous self-promotion is intentionally not real.`
        : "Knowledge storage, receipts, primers, and search exist. Learned improvement candidates are not proven yet, and autonomous self-promotion is intentionally not real.",
      next: knowledgeBacklogReady
        ? `Promote only with operator approval, then prove with: ${topKnowledgeExecution.proof_command}`
        : knowledgeImprovementsReady
          ? "Refresh execution backlog proof; candidates must include proof commands, backend-only scope, and no self-promotion."
        : "Run npm.cmd run knowledge:improvements, then rerun project/readiness proof.",
    },
    {
      area: "External research scout",
      status: status(researchRadarReady, researchScoutReady || exists(path.join(repoRoot, "scripts", "v4", "orangebox-external-research-scout.mjs"))),
      reality: researchRadarReady
        ? `Research radar is real with ${researchRadar?.approval_candidates?.length || 0} approval candidate(s); scout has ${researchScout?.candidate_count || 0} candidates. It promotes nothing automatically.`
        : researchScoutReady
          ? `Research scout is real with ${researchScout?.candidate_count || 0} candidates, but the combined radar has not been refreshed yet.`
          : "Research scout/radar source exists or is planned, but no current scout/radar receipt is green yet.",
      next: researchRadarReady
        ? "Run npm.cmd run research:radar on cadence, then approve only scoped backend candidates."
        : "Run npm.cmd run research:radar, then rerun project/readiness proof.",
    },
    {
      area: "Research Assurance Lab",
      status: status(assuranceLabGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-assurance-lab-doctor.mjs"))),
      reality: assuranceLabGreen
        ? `Assurance Lab is green: ${assuranceLab?.summary?.source_count || 0} sources, ${assuranceLab?.summary?.checks_green || 0}/${assuranceLab?.summary?.checks_total || 0} checks, no auto-promotion, backend-only constraints held.`
        : "Assurance Lab source exists or is planned, but the current receipt is not green yet.",
      next: assuranceLabGreen
        ? "Run assurance:doctor before promoting research-derived Orangebox upgrades."
        : "Run npm.cmd run assurance:doctor, then rerun feature:proof, project:report, and harness:benchmark.",
    },
    {
      area: "Offline harness benchmark",
      status: status(harnessBenchmarkGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-harness-benchmark-doctor.mjs"))),
      reality: harnessBenchmarkGreen
        ? `${harnessBenchmark.tasks_ok}/${harnessBenchmark.tasks_total} offline oracle tasks pass with budget and trace capture. Score ${harnessBenchmark.score}.`
        : "Harness benchmark source exists or is planned, but current oracle receipt is not green.",
      next: harnessBenchmarkGreen
        ? "Use this as the baseline before claiming model, tool, routing, or proof-harness improvements."
        : "Run npm.cmd run harness:benchmark and fix the exact failed oracle task.",
    },
    {
      area: "AtomSmasher compression pack",
      status: status(atomSmasher?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN"),
      reality: `${atomSmasher?.summary?.features_ok || 0}/${atomSmasher?.summary?.features_registered || 0} features green; schema ${atomSmasher?.summary?.schema_version || "unknown"}.`,
      next: "Wire learned improvement candidates into Knowledge Engine receipts.",
    },
    {
      area: "AtomSmasher backend tool merge",
      status: status(atomTools?.status === "ATOMSMASHER_TOOL_MERGE_GREEN"),
      reality: `${atomTools?.manifest?.totals?.eligible_backend_tools || 0} backend tools eligible; visual/product lane excluded.`,
      next: "Promote only backend tools that pass proof receipts.",
    },
    {
      area: "STRONGARM",
      status: status(strongarm?.status === "STRONGARM_ORANGEBOX_GATE_GREEN"),
      reality: "Local pressure gate is installed and green in heuristic/sidecar form.",
      next: "Move from heuristic-only toward local model structured-output mode after Ollama is proven.",
    },
    {
      area: "Misfits / Gremlin",
      status: status(gremlin?.status === "GREMLIN_MISFITS_ELITE_GREEN"),
      reality: `${gremlin?.elite_proof?.rows || 0} elite packet rows verified; training status ${gremlin?.training?.status || "unknown"}.`,
      next: "Train/evaluate LoRA only after Codexa/Colab runtime is chosen.",
    },
    {
      area: "Tri-lane local model router",
      status: status(triLane?.status === "TRILANE_ROUTER_PACK_GREEN"),
      reality: `Registry and policy green; installed core models ${triLane?.availability?.core_installed_count || 0}/${triLane?.availability?.core_total || 0}.`,
      next: "Install core Ollama models on Codexa and rerun model doctor.",
    },
    {
      area: "Local model lane eval",
      status: status(localModelLaneGreen, Boolean(localModelLane)),
      reality: localModelLaneGreen
        ? `Packet-role eval is green: ${localModelLane?.packet_eval?.fixtures_green || 0}/${localModelLane?.packet_eval?.fixtures_total || 0} role fixtures pass; no model calls or Ollama pulls; installed core models remain ${localModelLane?.inventory_truth?.core_installed_count || 0}/${localModelLane?.inventory_truth?.core_total || 0}.`
        : "Local model lane eval is missing or not green, so model routing claims are limited to TriLane config truth.",
      next: localModelLaneGreen
        ? "Use model:lane-eval before promoting STRONGARM, Misfits, Mirror, Judgement, wildcard, or local model routing changes."
        : "Run npm.cmd run model:lane-eval and fix the exact failed role fixture.",
    },
    {
      area: "Model inventory truth report",
      status: status(modelInventoryGreen, modelInventoryReported),
      reality: modelInventoryReported
        ? `Model inventory report is current: required models observed ${modelInventory?.summary?.required_installed ?? 0}/${modelInventory?.summary?.required_total ?? 0}; core models observed ${modelInventory?.summary?.core_installed ?? 0}/${modelInventory?.summary?.core_total ?? 0}; full runtime green=${Boolean(modelInventory?.full_local_model_runtime_green)}.`
        : "Model inventory report is missing, so installed/planned model claims are scattered across TriLane and local lane receipts.",
      next: modelInventoryGreen
        ? "Run model packet latency/json-validity evals before changing router weights."
        : modelInventoryReported
          ? "Install missing Codexa models, rerun trilane:doctor, model:lane-eval, and model:inventory, then rerun project:report."
          : "Run npm.cmd run model:inventory and rerun project:report.",
    },
    {
      area: "OBOX2 setup package",
      status: status(obox2ContractGreen, packageGreen || obox2Pack?.status === "OBOX2_INTERNAL_SETUP_PACK_GREEN"),
      reality: obox2ContractGreen
        ? `Zip was expanded and verified by package doctor with ${obox2Contracts.check_count} green setup-contract checks; includes start-here launcher, Codexa always-on power optimizer, rail starter, model installer, and Hermes doctor.`
        : packageGreen
          ? `Zip status is green, but setup-contract proof is incomplete (${obox2Contracts.check_count} checks, ${obox2Contracts.failed_count} failed).`
          : "Zip exists or is planned, but package doctor is not green.",
      next: obox2ContractGreen
        ? "Run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd on Codexa first. It now installs/verifies the embedded backend payload before rail/model proof. Then use core/all model installers only after the rail and power proof are green."
        : "Run npm.cmd run obox2:doctor and fix any failed setup-contract checks before touching Codexa.",
    },
    {
      area: "SOUL GENOME continuity map",
      status: status(soulDoctor?.status === "SOUL_GENOME_KNOWLEDGE_MAP_GREEN"),
      reality: soulDoctor?.decision || "Continuity map not proven.",
      next: "Build continuity probes and candidate-model promotion receipts.",
    },
    {
      area: "AECode final format",
      status: status(Boolean(aecodeFormat?.ok || aecodeFormat?.status)),
      reality: "AECode remains the middle voice for output contracts, not a frontend rewrite mandate.",
      next: "Use AECode for project contracts and artifact specs.",
    },
    {
      area: "Visual/frontend lane",
      status: "SEPARATE_LANE",
      reality: "Visual is part of Orangebox outputs, but this Ops chat does not touch frontend/.",
      next: "Keep frontend work in the separate visual project lane.",
    },
  ];

  const notRealYet = scope
    .filter((item) => item.status === "PARTIAL" || item.status === "NOT_REAL_YET")
    .map((item) => `${item.area}: ${item.reality} Next: ${item.next}`);
  const statusCounts = scope.reduce((counts, item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return counts;
  }, {});
  const fullProjectGreen = notRealYet.length === 0;
  const twoMachineGreen = Boolean(aiBoxRailReachable && (codexaBringup?.codexa_ready === true || codexaRemoteRuntimeGreen));
  const reportStatus = fullProjectGreen
    ? "ORANGEBOX_PROJECT_SCOPE_GREEN"
    : "ORANGEBOX_PROJECT_SCOPE_REPORTED_WITH_GAPS";

  const result = {
    ok: fullProjectGreen,
    report_ok: true,
    full_project_green: fullProjectGreen,
    local_ops_green: localOpsBackendGreen,
    two_machine_green: twoMachineGreen,
    gap_count: notRealYet.length,
    partial_count: statusCounts.PARTIAL || 0,
    not_real_count: statusCounts.NOT_REAL_YET || 0,
    status_counts: statusCounts,
    version: "orangebox-project-report/v1",
    status: reportStatus,
    generated_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    definition: "Orangebox Version 1 is a local-first governed software factory and operations backend. AECode writes buildable source contracts; AtomSmasher compresses context/work; STRONGARM/Misfits/Mirror/Judgement keep outputs honest; receipts prove reality; the operator remains final authority.",
    package: {
      name: packageJson?.name || null,
      version: packageJson?.version || null,
      scripts: {
        health_report: packageScript("health:report", packageJson),
        project_report: packageScript("project:report", packageJson),
        obox2_pack: packageScript("obox2:pack", packageJson),
        obox2_doctor: packageScript("obox2:doctor", packageJson),
        research_radar: packageScript("research:radar", packageJson),
        horizon_review: packageScript("horizon:review", packageJson),
        visual_readiness: packageScript("visual:readiness", packageJson),
        assurance_doctor: packageScript("assurance:doctor", packageJson),
        harness_benchmark: packageScript("harness:benchmark", packageJson),
        tool_ergonomics: packageScript("tool:ergonomics", packageJson),
        checkmate_doctor: packageScript("checkmate:doctor", packageJson),
        signal_hygiene: packageScript("signal:hygiene", packageJson),
        session_spine: packageScript("session:spine", packageJson),
        feature_proof: packageScript("feature:proof", packageJson),
        ops_green: packageScript("ops:green", packageJson),
        ops_gaps: packageScript("ops:gaps", packageJson),
        codexa_handoff: packageScript("codexa:handoff", packageJson),
        codexa_access: packageScript("codexa:access", packageJson),
        codexa_remote_proof: packageScript("codexa:remote-proof", packageJson),
        codexa_watch: packageScript("codexa:watch", packageJson),
        codexa_smb_stage: packageScript("codexa:smb-stage", packageJson),
        mcp_doctor: packageScript("mcp:doctor", packageJson),
        ipi_doctor: packageScript("ipi:doctor", packageJson),
        memory_doctor: packageScript("memory:doctor", packageJson),
        action_doctor: packageScript("action:doctor", packageJson),
        skills_lifecycle: packageScript("skills:lifecycle", packageJson),
        model_lane_eval: packageScript("model:lane-eval", packageJson),
        model_inventory: packageScript("model:inventory", packageJson),
      },
    },
    models: {
      registered_local_models: modelRegistry?.local_models || [],
      cloud_lanes: modelRegistry?.cloud_lanes || {},
      role_map: roleMap?.roles || {},
      routing_policy_version: routingPolicy?.version || null,
      installed_core_count: triLane?.availability?.core_installed_count || 0,
      installed_core_total: triLane?.availability?.core_total || 0,
      local_model_lane_eval_status: localModelLane?.status || null,
      model_inventory_status: modelInventory?.status || null,
      model_inventory_full_runtime_green: modelInventory?.full_local_model_runtime_green ?? null,
      model_inventory_required_installed: modelInventory?.summary?.required_installed ?? null,
      model_inventory_required_total: modelInventory?.summary?.required_total ?? null,
      local_model_lane_eval_fixtures: {
        green: localModelLane?.packet_eval?.fixtures_green || 0,
        total: localModelLane?.packet_eval?.fixtures_total || 0,
      },
    },
    soul_genome: {
      status: soulGenome?.status || null,
      doctor_status: soulDoctor?.status || null,
      non_goals: soulGenome?.non_goals || [],
    },
    scope,
    not_real_yet: notRealYet,
    recommended_next_actions: [
      openclawRetired
        ? "OpenClaw startup retirement is proven; keep it retired and do not reintroduce startup hooks."
        : "Retire OpenClaw startup if not already retired.",
      obox2ContractGreen
        ? `OBOX2 setup package contract proof is green (${obox2Contracts.check_count} checks); run it on Codexa as admin when operator time is available.`
        : "Verify OBOX2 package with npm.cmd run obox2:doctor before touching Codexa.",
      codexaRuntimeReady
        ? "Codexa runtime is already proven by remote proof; use the OBOX2 setup pack only for repair or reinstall."
        : "On Codexa, run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd from the OBOX2 setup pack so power, backend install, rail, and doctors all produce one receipt-backed truth path.",
      codexaRailRecoveryPack?.exists
        ? `Use the small rail recovery zip when needed: ${codexaRailRecoveryPack.path}.`
        : "Run npm.cmd run codexa:rail-pack so the small Codexa rail recovery zip exists.",
      codexaObox2Pack?.exists
        ? `Full OBOX2 setup pack is ready: ${codexaObox2Pack.path}. Preferred first click: RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd.`
        : "Run npm.cmd run obox2:pack and npm.cmd run obox2:doctor so the full OBOX2 setup zip exists.",
      codexaAccessReported
        ? "Use npm.cmd run codexa:access whenever RDP/WinRM/SMB/rail/Ollama claims need a focused proof."
        : "Run npm.cmd run codexa:access so RDP/WinRM/SMB/rail/Ollama access is separated from broad health warnings.",
      codexaSmbVisible && !codexaRemoteExecutionAvailable
        ? "Treat SMB as staging-only; do not claim remote repair until RDP, WinRM, or 8097 command rail is reachable."
        : "Use the proven remote execution path when it appears in health:report.",
      codexaSmbStage?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS"
        ? "SMB is visible but no share path is accessible from this cockpit; keep OBOX2/start-here as the Codexa repair path."
        : "Run npm.cmd run codexa:smb-stage whenever SMB staging is proposed, then trust only its receipt.",
      codexaRuntimeReady
        ? "Codexa command rail, loopback Ollama, expected models, and Hermes are proven through codexa:remote-proof; rerun health:report only after runtime changes."
        : "Bring up AI Box command rail 8097 and Ollama, then rerun health:report.",
      codexaRemoteModelsGreen
        ? "Codexa expected model inventory is verified through remote proof; no model install is needed right now."
        : "Install core Codexa models first; hold heavy models until core proof is green.",
      modelInventoryReported
        ? "Use npm.cmd run model:inventory as the operator-facing source of truth for planned vs installed models."
        : "Run npm.cmd run model:inventory before answering model inventory questions.",
      researchRadarReady
        ? "Run npm.cmd run research:radar periodically; approve only candidates that fit Orangebox Ops scope and have proof gates."
        : "Run npm.cmd run research:radar to refresh current public research, learned candidates, and assurance gates in one report.",
      assuranceLabGreen
        ? "Assurance Lab proof is green; use npm.cmd run assurance:doctor before promoting research-derived upgrades."
        : "Run npm.cmd run assurance:doctor so research-derived upgrade ideas are converted into scoped gates, receipts, and rollback proof.",
      opsGapLedgerReady
        ? "Use npm.cmd run ops:gaps before status answers so every remaining blocker has evidence, proof commands, and safe next action."
        : "Run npm.cmd run ops:gaps so remaining partials become named blockers with proof commands.",
      codexaHandoffReady
        ? "Use npm.cmd run codexa:handoff before Codexa setup so the operator has one first-click and verification receipt."
        : "Run npm.cmd run codexa:handoff so the AI Box setup handoff is current.",
      codexaBringupReported
        ? "Use npm.cmd run codexa:watch after the Codexa setup pack runs so ready/open-gap truth is observed over time, not guessed from a single probe."
        : "Run npm.cmd run codexa:watch once the OBOX2 setup pack is attempted on Codexa.",
      "Run npm.cmd run harness:benchmark before promoting any tool, model, or routing optimization.",
      topKnowledgeExecution
        ? `Top Knowledge Engine backend candidate: ${topKnowledgeExecution.area} (${topKnowledgeExecution.execution_score}) -> ${topKnowledgeExecution.proof_command}`
        : "Use npm.cmd run knowledge:improvements to refresh receipt-learning candidates before deciding backend upgrades.",
    ],
    evidence: {
      full_green: { path: path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json"), status: fullGreen?.summary?.status || fullGreen?.status || null },
      backend_install: { path: backendInstallPath, status: backendInstall?.status || null },
      ops_readiness: { path: opsReadinessPath, status: opsReadiness?.status || null },
      atom_smasher: { path: path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json"), status: atomSmasher?.summary?.status || null },
      atom_tools: { path: path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json"), status: atomTools?.status || null },
      strongarm: { path: path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"), status: strongarm?.status || null },
      gremlin: { path: path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"), status: gremlin?.status || null },
      trilane: { path: path.join(dataRoot, "trilane", "latest-trilane-model-router.json"), status: triLane?.status || null },
      local_model_lane_eval: {
        path: path.join(dataRoot, "models", "latest-local-model-lane-eval.json"),
        status: localModelLane?.status || null,
        fixtures_green: localModelLane?.packet_eval?.fixtures_green || 0,
        fixtures_total: localModelLane?.packet_eval?.fixtures_total || 0,
        full_local_model_runtime_green: localModelLane?.inventory_truth?.full_local_model_runtime_green ?? null,
        core_installed_count: localModelLane?.inventory_truth?.core_installed_count ?? null,
        core_total: localModelLane?.inventory_truth?.core_total ?? null,
      },
      model_inventory: {
        path: path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"),
        status: modelInventory?.status || null,
        required_installed: modelInventory?.summary?.required_installed ?? null,
        required_total: modelInventory?.summary?.required_total ?? null,
        core_installed: modelInventory?.summary?.core_installed ?? null,
        core_total: modelInventory?.summary?.core_total ?? null,
        full_local_model_runtime_green: modelInventory?.full_local_model_runtime_green ?? null,
      },
      obox2_pack: { path: path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"), status: obox2Pack?.status || null },
      obox2_doctor: {
        path: path.join(dataRoot, "obox2", "latest-package-doctor.json"),
        status: obox2Doctor?.status || null,
        contract_ok: obox2Contracts.ok,
        contract_checks: obox2Contracts.check_count,
        contract_failed: obox2Contracts.failed_count,
        contract_failed_ids: obox2Contracts.failed_ids,
      },
      soul: { path: path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json"), status: soulDoctor?.status || null },
      knowledge_improvements: {
        path: path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"),
        status: knowledgeImprovements?.status || null,
        candidate_count: knowledgeImprovements?.candidate_count || 0,
        execution_backlog_count: knowledgeExecutionBacklog.length,
        top_execution_area: topKnowledgeExecution?.area || null,
        top_execution_score: topKnowledgeExecution?.execution_score ?? null,
      },
      research_scout: { path: path.join(dataRoot, "research-scout", "latest-external-research-scout.json"), status: researchScout?.status || null },
      research_radar: {
        path: path.join(dataRoot, "research-radar", "latest-research-radar.json"),
        status: researchRadar?.status || null,
        approval_candidates: researchRadar?.approval_candidates?.length || 0,
        promotion_autonomous: researchRadar?.constraints?.promotion_autonomous ?? null,
      },
      assurance_lab: {
        path: path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json"),
        status: assuranceLab?.status || null,
        source_count: assuranceLab?.summary?.source_count || 0,
        checks_green: assuranceLab?.summary?.checks_green ?? null,
        checks_total: assuranceLab?.summary?.checks_total ?? null,
        proof_hash: assuranceLab?.proof_hash || null,
      },
      harness_benchmark: {
        path: path.join(dataRoot, "harness", "latest-harness-benchmark.json"),
        status: harnessBenchmark?.status || null,
        tasks_total: harnessBenchmark?.tasks_total || 0,
        tasks_ok: harnessBenchmark?.tasks_ok || 0,
        score: harnessBenchmark?.score ?? null,
      },
      local_ops_green: {
        path: path.join(dataRoot, "ops-green", "latest-local-ops-green.json"),
        status: readJson(path.join(dataRoot, "ops-green", "latest-local-ops-green.json"))?.status || null,
      },
      codexa_alert: { path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"), status: codexaAlert?.status || null },
      codexa_access: {
        path: path.join(dataRoot, "codexa-access", "latest-codexa-access.json"),
        status: codexaAccess?.status || null,
        codexa_access_ready: codexaAccess?.codexa_access_ready ?? null,
        command_rail: codexaAccess?.access?.command_rail ?? null,
        receipts: codexaAccess?.access?.receipts ?? null,
        ollama: codexaAccess?.access?.ollama ?? null,
        rdp: codexaAccess?.access?.rdp ?? null,
        winrm: codexaAccess?.access?.winrm ?? null,
        smb: codexaAccess?.access?.smb ?? null,
      },
      codexa_remote_proof: {
        path: path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"),
        status: codexaRemoteProof?.status || null,
        green: codexaRemoteProof?.codexa_remote_runtime_green ?? null,
        summary: codexaRemoteProof?.summary || null,
      },
      codexa_bringup_watch: {
        path: path.join(dataRoot, "codexa-bringup", "latest-codexa-bringup-watch.json"),
        status: codexaBringup?.status || null,
        codexa_ready: codexaBringup?.codexa_ready ?? null,
        missing: codexaBringup?.verdict?.missing || null,
        status_history: codexaBringup?.verdict?.status_history || null,
      },
      codexa_signal_hygiene: {
        path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"),
        status: codexaAlert?.signal_hygiene?.severity || null,
        summary_line: codexaAlert?.signal_hygiene?.summary_line || null,
        local_basic_install_blocked: codexaAlert?.signal_hygiene?.local_basic_install_blocked ?? null,
        full_system_green_blocked: codexaAlert?.signal_hygiene?.full_system_green_blocked ?? null,
      },
      terminal_obox_profile: {
        path: terminalProfilePath,
        receipt_path: terminalProfileReceiptPath,
        status: terminalProfileGreen ? "ORANGEBOX_TERMINAL_AFFORDANCE_GREEN" : "ORANGEBOX_TERMINAL_AFFORDANCE_NOT_GREEN",
        current_user_policy_after: terminalProfileReceipt?.current_user_policy_after || null,
      },
      codexa_recovery: {
        path: codexaRailRecoveryPack?.path || null,
        status: codexaRailRecoveryPack?.exists ? "CODEXA_RAIL_RECOVERY_PACK_READY" : "CODEXA_RAIL_RECOVERY_PACK_MISSING",
      },
      codexa_smb_stage: {
        path: path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"),
        status: codexaSmbStage?.status || null,
        stage_ready: codexaSmbStage?.stage_ready ?? null,
        stage_written: codexaSmbStage?.stage_written ?? null,
        preferred_target: codexaSmbStage?.preferred_target?.path || null,
      },
      mcp_doctor: {
        path: path.join(dataRoot, "mcp", "latest-mcp-doctor.json"),
        status: mcpQuarantineGreen ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN",
        descriptor_drift_detected: mcpDoctor?.descriptor_integrity?.drift_detected ?? null,
        tool_list_rug_pull_blocked: mcpDoctor?.descriptor_integrity?.tool_list_rug_pull_blocked ?? null,
        auto_trust_after_drift: mcpDoctor?.descriptor_integrity?.auto_trust_after_drift ?? null,
        promotion_gate: mcpDoctor?.descriptor_integrity?.promotion_gate || null,
      },
      ipi_doctor: {
        path: path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"),
        status: ipiDoctor?.status || null,
        fixtures_green: ipiDoctor?.summary?.fixtures_green ?? null,
        fixtures_total: ipiDoctor?.summary?.fixtures_total ?? null,
        untrusted_fixtures: ipiDoctor?.summary?.untrusted_fixtures ?? null,
      },
      memory_doctor: {
        path: path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json"),
        status: memoryDoctor?.status || null,
        drills_green: memoryDoctor?.summary?.drills_green ?? null,
        drills_total: memoryDoctor?.summary?.drills_total ?? null,
        stale_conflicts_detected: memoryDoctor?.summary?.stale_conflicts_detected ?? null,
        hot_packet_token_estimate: memoryDoctor?.summary?.hot_packet_token_estimate ?? null,
      },
      action_classifier: {
        path: path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"),
        status: actionClassifier?.status || null,
      },
      skill_lifecycle: {
        path: path.join(dataRoot, "skills", "latest-skill-lifecycle.json"),
        status: skillLifecycle?.status || null,
      },
      tool_ergonomics: {
        path: path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"),
        status: toolErgonomics?.status || null,
        command_count: toolErgonomics?.command_surface?.command_count || 0,
        failures: toolErgonomics?.failures?.length ?? null,
      },
      toolmesh: {
        path: path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json"),
        status: toolmesh?.status || null,
        cards_total: toolmesh?.summary?.cards_total ?? null,
        preserved_v3_waves: toolmesh?.waveValidation?.preservedV3Count ?? null,
        toolmesh_waves: toolmesh?.waveValidation?.toolmeshCount ?? null,
        execution_blocked_until_promoted: toolmesh?.checks?.execution_blocked_until_promoted ?? null,
        hardware_profiles_declared: toolmesh?.checks?.hardware_profiles_declared ?? null,
        artifact_pointer_policy_declared: toolmesh?.checks?.artifact_pointer_policy_declared ?? null,
        immutable_templates_for_workflow_tools: toolmesh?.checks?.immutable_templates_for_workflow_tools ?? null,
      },
      checkmate_eval_lane: {
        path: path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"),
        status: checkmateEval?.status || null,
        fixture_count: checkmateEval?.fixtures?.length || 0,
        failures: checkmateEval?.failures?.length ?? null,
      },
      eval_integrity_benchmark_hygiene: {
        path: path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"),
        status: evalIntegrityGreen ? "EVAL_INTEGRITY_BENCHMARK_HYGIENE_GREEN" : "EVAL_INTEGRITY_BENCHMARK_HYGIENE_NOT_GREEN",
        fixture_present: Array.isArray(checkmateEval?.fixtures)
          && checkmateEval.fixtures.some((fixture) => fixture.id === "benchmark_hygiene_integrity_gate"),
        harness_task_present: Array.isArray(harnessBenchmark?.tasks)
          && harnessBenchmark.tasks.some((task) => task.id === "eval_integrity_benchmark_hygiene_truth" && task.ok === true),
      },
      signal_hygiene: {
        path: path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json"),
        status: signalHygiene?.status || null,
        severity: signalHygiene?.signal_hygiene?.severity || null,
        confidence_calibration: signalHygiene?.confidence_calibration || null,
        failures: signalHygiene?.failures?.length ?? null,
      },
      doer_watcher_spine: {
        path: path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"),
        status: doerWatcherSpine?.status || null,
        failures: doerWatcherSpine?.failures?.length ?? null,
        doer_command_server_ok: doerWatcherSpine?.doer?.command_server?.ok ?? null,
        watcher_process_age_ms: doerWatcherSpine?.watcher?.watcher_process?.age_ms ?? null,
        codexa_status: doerWatcherSpine?.one_reality?.codexa_status || null,
      },
      feature_proof: {
        path: path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"),
        status: featureProof?.status || null,
        features_green: featureProof?.features_green ?? null,
        features_total: featureProof?.features_total ?? null,
        failures: featureProof?.failures?.length ?? null,
      },
      ops_gap_ledger: {
        path: path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json"),
        status: opsGapLedger?.status || null,
        gap_count: opsGapLedger?.gap_count ?? null,
        critical_gap_count: opsGapLedger?.critical_gap_count ?? null,
        full_system_green_claim_allowed: opsGapLedger?.full_system_green_claim_allowed ?? null,
      },
      codexa_handoff: {
        path: path.join(dataRoot, "codexa-handoff", "latest-codexa-handoff.json"),
        status: codexaHandoff?.status || null,
        open_gap_count: codexaHandoff?.open_gap_count ?? null,
        first_click: codexaHandoff?.codexa_run_order?.[0]?.command || null,
        setup_zip: codexaHandoff?.setup_zip?.path || null,
      },
      reality: { path: path.join(dataRoot, "watcher", "latest-reality-watch.json"), status: reality?.status || null },
      openclaw_retirement: { path: path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"), status: openclawRetire?.status || null },
    },
  };

  const base = `orangebox-project-report-${stamp()}`;
  const jsonPath = path.join(reportRoot, `${base}.json`);
  const mdPath = path.join(reportRoot, `${base}.md`);
  await writeJson(jsonPath, result);
  await writeText(mdPath, renderMarkdown(result));
  await writeJson(path.join(reportRoot, "latest-project-report.json"), { ...result, report_json: jsonPath, report_markdown: mdPath });
  await writeText(path.join(reportRoot, "latest-project-report.md"), renderMarkdown({ ...result, report_json: jsonPath, report_markdown: mdPath }));
  result.report_json = jsonPath;
  result.report_markdown = mdPath;

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `${base}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
}

await main();
