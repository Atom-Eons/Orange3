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
  const obox2Pack = readJson(path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"));
  const obox2Doctor = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"));
  const soulDoctor = readJson(path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json"));
  const knowledgeImprovements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"));
  const researchScout = readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json"));
  const harnessBenchmark = readJson(path.join(dataRoot, "harness", "latest-harness-benchmark.json"));
  const codexaAlert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"));
  const codexaSmbStage = readJson(path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"));
  const mcpDoctor = readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json")) || readJson(latestReceipt("orangebox-mcp-doctor-"));
  const actionClassifier = readJson(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json")) || readJson(latestReceipt("orangebox-action-classifier-"));
  const skillLifecycle = readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json")) || readJson(latestReceipt("orangebox-skill-lifecycle-doctor-"));
  const toolErgonomics = readJson(path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json")) || readJson(latestReceipt("orangebox-tool-ergonomics-"));
  const checkmateEval = readJson(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json")) || readJson(latestReceipt("checkmate-eval-lane-"));
  const signalHygiene = readJson(path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json")) || readJson(latestReceipt("orangebox-operator-signal-hygiene-"));
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
  const aiBoxRailReachable = reality?.checks?.probes?.ai_box_command_8097?.ok === true;
  const codexaReceiptsReachable = codexaAlert?.receipts_reachable === true;
  const codexaRemoteControlAvailable = codexaAlert?.remote_control_available === true;
  const codexaRemoteExecutionAvailable = codexaAlert?.remote_execution_available === true;
  const codexaSmbVisible = codexaAlert?.smb_port_visible === true;
  const codexaRailRecoveryPack = codexaAlert?.recovery_artifacts?.rail_recovery_pack || null;
  const codexaObox2Pack = codexaAlert?.recovery_artifacts?.obox2_setup_pack || null;
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
  const harnessBenchmarkGreen = harnessBenchmark?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN";
  const mcpQuarantineGreen =
    mcpDoctor?.ok === true &&
    mcpDoctor?.summary?.failed === 0 &&
    mcpDoctor?.install_attempted === false &&
    mcpDoctor?.host_mcp_config_mutated === false &&
    mcpDoctor?.paid_api_attempted === false;
  const actionClassifierGreen = actionClassifier?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN";
  const skillLifecycleGreen = skillLifecycle?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN";
  const toolErgonomicsGreen = toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN";
  const checkmateEvalGreen = checkmateEval?.status === "CHECKMATE_EVAL_LANE_GREEN";
  const signalHygieneGreen = signalHygiene?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN";
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
        ? `MCP registry, local HTTP tool-list probe, metadata-only stdio probe, disable override, CLI/API source probe, and code-mode execute guard are green (${mcpDoctor?.summary?.passed || 0}/${mcpDoctor?.summary?.checks || 0}).`
        : "MCP bridge source exists, but the quarantine doctor is not green yet.",
      next: mcpQuarantineGreen
        ? "Keep all new MCPs as candidates until health, tools, scopes, output caps, receipts, and operator-confirmed write mode are proven."
        : "Run npm.cmd run mcp:doctor and fix the exact failed gate.",
    },
    {
      area: "Action classifier permission gate",
      status: status(actionClassifierGreen, exists(path.join(repoRoot, "scripts", "v4", "action-classifier.mjs"))),
      reality: actionClassifierGreen
        ? `Pre-tool command classifier is green: ${actionClassifier?.allowed_count || 0} allowed, ${actionClassifier?.staged_count || 0} staged, ${actionClassifier?.blocked_count || 0} blocked, ${actionClassifier?.cases_run || 0} fixtures. Command server imports the same classifier.`
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
      area: "Operator signal hygiene",
      status: status(signalHygieneGreen, exists(path.join(repoRoot, "scripts", "v4", "orangebox-operator-signal-hygiene-doctor.mjs"))),
      reality: signalHygieneGreen
        ? `Operator signal hygiene is green: severity=${signalHygiene?.signal_hygiene?.severity || "unknown"}, confidence=${signalHygiene?.confidence_calibration?.local_ops || "unknown"}, checks=${signalHygiene?.checks?.length || 0}.`
        : "Operator signal hygiene source exists or is planned, but the current receipt is not green yet.",
      next: signalHygieneGreen
        ? "Run this doctor before changing alert, watcher, popup, or status-report behavior."
        : "Run npm.cmd run signal:hygiene and fix the exact failed signal/cadence check.",
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
      status: status(Boolean(codexaSmbStage?.stage_ready || codexaSmbStage?.stage_written), Boolean(codexaSmbStage?.status)),
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
      status: status(false, exists(path.join(repoRoot, "scripts", "v4", "hermes", "hermes-doctor.mjs"))),
      reality: "Hermes readiness scripts and setup path exist. Hermes is not proven installed or running in this report.",
      next: "Run the OBOX2 Hermes doctor/install on Codexa when ready.",
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
      status: status(researchScoutReady, exists(path.join(repoRoot, "scripts", "v4", "orangebox-external-research-scout.mjs"))),
      reality: researchScoutReady
        ? `Low-bandwidth public research scout is real with ${researchScout?.candidate_count || 0} candidates. It uses evidence tiers and promotes nothing automatically.`
        : "Research scout script exists or is planned, but no current scout receipt is green yet.",
      next: researchScoutReady
        ? "Run npm.cmd run research:scout on cadence, then npm.cmd run knowledge:improvements to queue approved-fit upgrade candidates."
        : "Run npm.cmd run research:scout, then rerun project/readiness proof.",
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
      area: "OBOX2 setup package",
      status: status(obox2ContractGreen, packageGreen || obox2Pack?.status === "OBOX2_INTERNAL_SETUP_PACK_GREEN"),
      reality: obox2ContractGreen
        ? `Zip was expanded and verified by package doctor with ${obox2Contracts.check_count} green setup-contract checks; includes start-here launcher, Codexa always-on power optimizer, rail starter, model installer, and Hermes doctor.`
        : packageGreen
          ? `Zip status is green, but setup-contract proof is incomplete (${obox2Contracts.check_count} checks, ${obox2Contracts.failed_count} failed).`
          : "Zip exists or is planned, but package doctor is not green.",
      next: obox2ContractGreen
        ? "Run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd on Codexa first. Then use core/all model installers only after the rail and power proof are green."
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
  const twoMachineGreen = Boolean(aiBoxRailReachable);
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
        harness_benchmark: packageScript("harness:benchmark", packageJson),
        tool_ergonomics: packageScript("tool:ergonomics", packageJson),
        checkmate_doctor: packageScript("checkmate:doctor", packageJson),
        signal_hygiene: packageScript("signal:hygiene", packageJson),
        ops_green: packageScript("ops:green", packageJson),
        codexa_smb_stage: packageScript("codexa:smb-stage", packageJson),
        mcp_doctor: packageScript("mcp:doctor", packageJson),
        action_doctor: packageScript("action:doctor", packageJson),
        skills_lifecycle: packageScript("skills:lifecycle", packageJson),
      },
    },
    models: {
      registered_local_models: modelRegistry?.local_models || [],
      cloud_lanes: modelRegistry?.cloud_lanes || {},
      role_map: roleMap?.roles || {},
      routing_policy_version: routingPolicy?.version || null,
      installed_core_count: triLane?.availability?.core_installed_count || 0,
      installed_core_total: triLane?.availability?.core_total || 0,
    },
    soul_genome: {
      status: soulGenome?.status || null,
      doctor_status: soulDoctor?.status || null,
      non_goals: soulGenome?.non_goals || [],
    },
    scope,
    not_real_yet: notRealYet,
    recommended_next_actions: [
      "Retire OpenClaw startup if not already retired.",
      obox2ContractGreen
        ? `OBOX2 setup package contract proof is green (${obox2Contracts.check_count} checks); run it on Codexa as admin when operator time is available.`
        : "Verify OBOX2 package with npm.cmd run obox2:doctor before touching Codexa.",
      "On Codexa, run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd from the OBOX2 setup pack so power, rail, and doctors all produce one receipt-backed truth path.",
      codexaRailRecoveryPack?.exists
        ? `Use the small rail recovery zip when needed: ${codexaRailRecoveryPack.path}.`
        : "Run npm.cmd run codexa:rail-pack so the small Codexa rail recovery zip exists.",
      codexaObox2Pack?.exists
        ? `Full OBOX2 setup pack is ready: ${codexaObox2Pack.path}. Preferred first click: RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd.`
        : "Run npm.cmd run obox2:pack and npm.cmd run obox2:doctor so the full OBOX2 setup zip exists.",
      codexaSmbVisible && !codexaRemoteExecutionAvailable
        ? "Treat SMB as staging-only; do not claim remote repair until RDP, WinRM, or 8097 command rail is reachable."
        : "Use the proven remote execution path when it appears in health:report.",
      codexaSmbStage?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS"
        ? "SMB is visible but no share path is accessible from this cockpit; keep OBOX2/start-here as the Codexa repair path."
        : "Run npm.cmd run codexa:smb-stage whenever SMB staging is proposed, then trust only its receipt.",
      "Bring up AI Box command rail 8097 and Ollama, then rerun health:report.",
      "Install core Codexa models first; hold heavy models until core proof is green.",
      "Run npm.cmd run research:scout periodically, then approve only candidates that fit Orangebox Ops scope.",
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
      checkmate_eval_lane: {
        path: path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"),
        status: checkmateEval?.status || null,
        fixture_count: checkmateEval?.fixtures?.length || 0,
        failures: checkmateEval?.failures?.length ?? null,
      },
      signal_hygiene: {
        path: path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json"),
        status: signalHygiene?.status || null,
        severity: signalHygiene?.signal_hygiene?.severity || null,
        confidence_calibration: signalHygiene?.confidence_calibration || null,
        failures: signalHygiene?.failures?.length ?? null,
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
