#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function exists(p) {
  return fs.existsSync(p);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function newestDir(root) {
  if (!exists(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return dirs[0]?.full || null;
}

function newestFile(root, prefix, suffix = ".json") {
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

function main() {
  const heartbeatPath = path.join(dataRoot, "chat-mirror", "listener-heartbeat.json");
  const heartbeat = readJson(heartbeatPath);
  const lastFinished = heartbeat?.last_finished ? Date.parse(heartbeat.last_finished) : 0;
  const heartbeatFresh = Boolean(heartbeat?.ok) && Number.isFinite(lastFinished) && Date.now() - lastFinished < 10 * 60 * 1000;
  const watcherHeartbeatPath = path.join(dataRoot, "watcher", "watcher-process-heartbeat.json");
  const watcherHeartbeat = readJson(watcherHeartbeatPath);
  const watcherLastFinished = watcherHeartbeat?.last_finished ? Date.parse(watcherHeartbeat.last_finished) : 0;
  const watcherFresh = Boolean(watcherHeartbeat?.ok) && Number.isFinite(watcherLastFinished) && Date.now() - watcherLastFinished < 15 * 60 * 1000;
  const chatArchiveDir = newestDir(path.join(dataRoot, "chat-archives"));
  const atomSmasherIntakePath = path.join(dataRoot, "incoming", "atomsmasher-module-intake.json");
  const atomSmasherIntake = readJson(atomSmasherIntakePath);
  const atomSmasherDoctorPath = path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json");
  const atomSmasherDoctor = readJson(atomSmasherDoctorPath);
  const atomSmasherToolMergePath = path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json");
  const atomSmasherToolMerge = readJson(atomSmasherToolMergePath);
  const strongarmDoctorPath = path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json");
  const strongarmDoctor = readJson(strongarmDoctorPath);
  const gremlinDoctorPath = path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json");
  const gremlinDoctor = readJson(gremlinDoctorPath);
  const triLaneRouterPath = path.join(dataRoot, "trilane", "latest-trilane-model-router.json");
  const triLaneRouter = readJson(triLaneRouterPath);
  const localModelLanePath = path.join(dataRoot, "models", "latest-local-model-lane-eval.json");
  const localModelLane = readJson(localModelLanePath);
  const activeCouncilPath = path.join(dataRoot, "active-council", "latest-active-council.json");
  const activeCouncil = readJson(activeCouncilPath);
  const obox2PackPath = path.join(dataRoot, "obox2", "latest-internal-setup-pack.json");
  const obox2Pack = readJson(obox2PackPath);
  const obox2DoctorPath = path.join(dataRoot, "obox2", "latest-package-doctor.json");
  const obox2Doctor = readJson(obox2DoctorPath);
  const soulGenomePath = path.join(dataRoot, "knowledge", "soul-genome", "latest-soul-genome-doctor.json");
  const soulGenome = readJson(soulGenomePath);
  const knowledgeImprovementsPath = path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json");
  const knowledgeImprovements = readJson(knowledgeImprovementsPath);
  const openclawRetirementPath = path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json");
  const openclawRetirement = readJson(openclawRetirementPath);
  const opsServicesPath = path.join(dataRoot, "services", "latest-ops-services.json");
  const opsServices = readJson(opsServicesPath);
  const midSessionPrimerPath = path.join(dataRoot, "primers", "ORANGEBOX_MID_SESSION_PRIMER.md");
  const titleProtocolPath = path.join(dataRoot, "primers", "OB0X_ON_TITLE_PROTOCOL.json");
  const sourceLockPath = path.join(dataRoot, "orangebox-source-of-truth.json");
  const restartLockPath = path.join(dataRoot, "restart", "latest-restart-lock.json");
  const sourceLock = readJson(sourceLockPath);
  const codexaConfigPath = path.join(dataRoot, "codexa-sync", "latest-codexa-config.json");
  const codexaConfig = readJson(codexaConfigPath);
  const codexaAlertPath = path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json");
  const codexaAlert = readJson(codexaAlertPath);
  const mcpDoctorPath = path.join(dataRoot, "mcp", "latest-mcp-doctor.json");
  const mcpDoctor = readJson(mcpDoctorPath);
  const ipiDoctorPath = path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json");
  const ipiDoctor = readJson(ipiDoctorPath);
  const memoryDoctorPath = path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json");
  const memoryDoctor = readJson(memoryDoctorPath);
  const actionClassifierPath = path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json");
  const actionClassifier = readJson(actionClassifierPath);
  const skillLifecyclePath = path.join(dataRoot, "skills", "latest-skill-lifecycle.json");
  const skillLifecycle = readJson(skillLifecyclePath);
  const toolErgonomicsPath = path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json");
  const toolErgonomics = readJson(toolErgonomicsPath);
  const checkmatePath = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");
  const checkmate = readJson(checkmatePath);
  const assurancePath = path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json");
  const assurance = readJson(assurancePath);
  const signalHygienePath = path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json");
  const signalHygiene = readJson(signalHygienePath);
  const doerWatcherPath = path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json");
  const doerWatcher = readJson(doerWatcherPath);
  const featureProofPath = path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json");
  const featureProof = readJson(featureProofPath);
  const terminalProfilePath = path.join(userRoot, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
  const terminalProfileText = exists(terminalProfilePath) ? fs.readFileSync(terminalProfilePath, "utf8") : "";
  const terminalProfileReceiptPath = newestFile(path.join(dataRoot, "profile-backups"), "orangebox-powershell-profile-policy-");
  const terminalProfileReceipt = readJson(terminalProfileReceiptPath);
  const antigravityRoot = path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "SKILL.md");
  const antigravityText = exists(antigravityRoot) ? fs.readFileSync(antigravityRoot, "utf8") : "";
  const primerPaths = {
    codex: path.join(userRoot, ".codex", "skills", "orangebox-primer", "SKILL.md"),
    shared_agents: path.join(userRoot, ".agents", "skills", "orangebox-primer", "SKILL.md"),
    claude: path.join(userRoot, ".claude", "skills", "orangebox-primer", "SKILL.md"),
    claude_desktop: path.join(userRoot, "AppData", "Roaming", "Claude", "skills", "orangebox-primer", "SKILL.md"),
    claude_3p: path.join(userRoot, "AppData", "Roaming", "Claude-3p", "skills", "orangebox-primer", "SKILL.md"),
    antigravity: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md"),
    antigravity_appdata: path.join(userRoot, "AppData", "Roaming", "Antigravity", "skills", "orangebox-primer", "SKILL.md"),
    gemini_user: path.join(userRoot, ".gemini", "skills", "orangebox-primer", "SKILL.md"),
    repo: path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md"),
  };
  const primerPresence = Object.fromEntries(Object.entries(primerPaths).map(([key, value]) => [key, exists(value)]));
  const missingPrimerPaths = Object.entries(primerPaths)
    .filter(([key]) => !primerPresence[key])
    .map(([key, value]) => ({ key, path: value }));
  const chatBackupStartupPath = path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Orangebox ChatBackup Listener.lnk");

  const checks = {
    chat_primer: {
      ok: exists(path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md")),
      path: path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md"),
    },
    mid_session_primer: {
      ok: exists(midSessionPrimerPath) && exists(titleProtocolPath),
      primer_path: midSessionPrimerPath,
      title_protocol_path: titleProtocolPath,
      expected_title_suffix: "OB0X ON",
    },
    source_of_truth_restart_lock: {
      ok: sourceLock?.status === "ORANGEBOX_RESTART_LOCK_GREEN" && exists(restartLockPath),
      source_lock_path: sourceLockPath,
      restart_lock_path: restartLockPath,
      status: sourceLock?.status || null,
    },
    codexa_config_sync: {
      ok: codexaConfig?.status === "CODEXA_ORANGEBOX_CONFIG_READY" || codexaConfig?.version === "orangebox-codexa-config/v0",
      path: codexaConfigPath,
      status: codexaConfig?.status || null,
    },
    codexa_link_alert: {
      ok: Boolean(codexaAlert?.status),
      path: codexaAlertPath,
      status: codexaAlert?.status || null,
      message: codexaAlert?.message || null,
      note: "This check proves the Codexa/AI Box link has an explicit alert receipt. CODEXA_READY is not required for local Basic Install.",
    },
    mcp_quarantine_doctor: {
      ok:
        mcpDoctor?.ok === true &&
        mcpDoctor?.install_attempted === false &&
        mcpDoctor?.host_mcp_config_mutated === false &&
        mcpDoctor?.paid_api_attempted === false &&
        mcpDoctor?.summary?.failed === 0,
      path: mcpDoctorPath,
      status: mcpDoctor?.ok === true ? "MCP_QUARANTINE_GREEN" : "MCP_QUARANTINE_NOT_GREEN",
      checks: mcpDoctor?.summary?.checks || 0,
      passed: mcpDoctor?.summary?.passed || 0,
      failed: mcpDoctor?.summary?.failed ?? null,
      note: "Proves MCP registry/tool-list/code-mode safety without package installs, paid APIs, or host MCP config mutation.",
    },
    indirect_prompt_injection_doctor: {
      ok: ipiDoctor?.ok === true && ipiDoctor?.status === "ORANGEBOX_IPI_DRILLS_GREEN",
      path: ipiDoctorPath,
      status: ipiDoctor?.status || null,
      fixtures_green: ipiDoctor?.summary?.fixtures_green ?? null,
      fixtures_total: ipiDoctor?.summary?.fixtures_total ?? null,
      untrusted_fixtures: ipiDoctor?.summary?.untrusted_fixtures ?? null,
      note: "Proves untrusted emails, webpages, repos, PDFs, and chat logs are data, not executable instructions.",
    },
    memory_source_truth_doctor: {
      ok: memoryDoctor?.ok === true && memoryDoctor?.status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN",
      path: memoryDoctorPath,
      status: memoryDoctor?.status || null,
      drills_green: memoryDoctor?.summary?.drills_green ?? null,
      drills_total: memoryDoctor?.summary?.drills_total ?? null,
      stale_conflicts_detected: memoryDoctor?.summary?.stale_conflicts_detected ?? null,
      note: "Proves latest source-backed receipt truth beats stale chat memory, compressed summaries carry source pointers, and revised facts create compression debt.",
    },
    action_classifier: {
      ok: actionClassifier?.ok === true && actionClassifier?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN",
      path: actionClassifierPath,
      status: actionClassifier?.status || null,
      cases_run: actionClassifier?.cases_run || 0,
      allowed_count: actionClassifier?.allowed_count || 0,
      staged_count: actionClassifier?.staged_count || 0,
      blocked_count: actionClassifier?.blocked_count || 0,
      sequence_cases_run: actionClassifier?.sequence_cases_run || 0,
      sequence_staged_count: actionClassifier?.sequence_staged_count || 0,
      sequence_blocked_count: actionClassifier?.sequence_blocked_count || 0,
      failures: actionClassifier?.failures?.length ?? null,
      note: "Proves pre-tool command classification for safe diagnostics, staged state changes, credential hunts, exfiltration, review bypasses, and suspicious multi-action chains.",
    },
    skill_primer: {
      ok: missingPrimerPaths.length === 0,
      ...primerPaths,
      presence: primerPresence,
      missing_paths: missingPrimerPaths,
    },
    antigravity_redirect: {
      ok: antigravityText.includes("orangebox-primer") && antigravityText.includes("Backend-only"),
      path: antigravityRoot,
    },
    skill_lifecycle: {
      ok: skillLifecycle?.ok === true && skillLifecycle?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN",
      path: skillLifecyclePath,
      status: skillLifecycle?.status || null,
      command_count: skillLifecycle?.command_count || 0,
      stale_count: skillLifecycle?.stale_count ?? null,
      command_failures: skillLifecycle?.command_failures?.length ?? null,
      note: "Proves Orangebox skills are installed, non-stale, command-mapped, and receipt-visible.",
    },
    tool_ergonomics: {
      ok: toolErgonomics?.ok === true && toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN",
      path: toolErgonomicsPath,
      status: toolErgonomics?.status || null,
      command_count: toolErgonomics?.command_surface?.command_count || 0,
      failures: toolErgonomics?.failures?.length ?? null,
      note: "Proves Orangebox commands/tools are distinct, concise, bounded, receipt-backed, and backend-only before promotion.",
    },
    checkmate_eval_lane: {
      ok: checkmate?.ok === true && checkmate?.status === "CHECKMATE_EVAL_LANE_GREEN",
      path: checkmatePath,
      status: checkmate?.status || null,
      fixture_count: checkmate?.fixtures?.length || 0,
      note: "Proves prompt/model/routing/tool/score changes require CHECKMATE eval fixtures before promotion.",
    },
    research_assurance_lab: {
      ok: assurance?.ok === true && assurance?.status === "ORANGEBOX_ASSURANCE_LAB_GREEN",
      path: assurancePath,
      status: assurance?.status || null,
      source_count: assurance?.summary?.source_count || 0,
      checks_green: assurance?.summary?.checks_green ?? null,
      checks_total: assurance?.summary?.checks_total ?? null,
      note: "Proves research-derived upgrade ideas become scoped backend playbooks, gates, receipts, and rollback proof before promotion.",
    },
    operator_signal_hygiene: {
      ok: signalHygiene?.ok === true && signalHygiene?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN",
      path: signalHygienePath,
      status: signalHygiene?.status || null,
      severity: signalHygiene?.signal_hygiene?.severity || null,
      note: "Proves alert cadence, severity labels, confidence calibration, and local/full-system separation.",
    },
    doer_watcher_spine: {
      ok: doerWatcher?.ok === true && doerWatcher?.status === "ORANGEBOX_DOER_WATCHER_SPINE_GREEN",
      path: doerWatcherPath,
      status: doerWatcher?.status || null,
      failures: doerWatcher?.failures?.length ?? null,
      note: "Proves active doer surfaces, watcher freshness, and one-reality local/Codexa state.",
    },
    feature_acceptance_matrix: {
      ok: featureProof?.ok === true && featureProof?.status === "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN",
      path: featureProofPath,
      status: featureProof?.status || null,
      features_green: featureProof?.features_green ?? null,
      features_total: featureProof?.features_total ?? null,
      failures: featureProof?.failures?.length ?? null,
      note: "Proves feature claims have explicit status, evidence, proof command, and rollback or recovery truth.",
    },
    terminal_obox_profile: {
      ok:
        exists(terminalProfilePath) &&
        terminalProfileText.includes("function obox") &&
        terminalProfileText.includes("function obox-off") &&
        terminalProfileText.includes("ORANGEBOX_ACTIVE") &&
        terminalProfileReceipt?.status === "ORANGEBOX_POWERSHELL_PROFILE_ENABLED" &&
        terminalProfileReceipt?.current_user_policy_after === "RemoteSigned",
      path: terminalProfilePath,
      receipt_path: terminalProfileReceiptPath,
      status: terminalProfileReceipt?.status || null,
      current_user_policy_after: terminalProfileReceipt?.current_user_policy_after || null,
      functions_present: {
        obox: terminalProfileText.includes("function obox"),
        obox_off: terminalProfileText.includes("function obox-off"),
        orangebox_active_env: terminalProfileText.includes("ORANGEBOX_ACTIVE"),
      },
      note: "Proves the local terminal has an OB0X ON affordance so operator sessions are visually distinguishable from ordinary chat/shell work.",
    },
    chatbackup_listener: {
      ok: heartbeatFresh,
      heartbeat_path: heartbeatPath,
      heartbeat,
    },
    chatbackup_startup: {
      ok: exists(chatBackupStartupPath),
      path: chatBackupStartupPath,
      missing_paths: exists(chatBackupStartupPath) ? [] : [chatBackupStartupPath],
    },
    reality_watcher: {
      ok: watcherFresh,
      heartbeat_path: watcherHeartbeatPath,
      heartbeat: watcherHeartbeat,
    },
    ops_services: {
      ok:
        opsServices?.ok === true &&
        opsServices?.services?.command_server?.ok === true &&
        opsServices?.services?.api_server?.ok === true &&
        opsServices?.services?.local_llama_listener?.ok === true &&
        opsServices?.services?.strongarm_gate?.ok === true &&
        opsServices?.final_probes?.command_server?.ok === true &&
        opsServices?.final_probes?.api_server?.ok === true &&
        opsServices?.final_probes?.local_llama_listener?.ok === true &&
        opsServices?.final_probes?.strongarm_gate?.ok === true,
      path: opsServicesPath,
      status: opsServices?.status || null,
      command_server: opsServices?.final_probes?.command_server || null,
      api_server: opsServices?.final_probes?.api_server || null,
      local_llama_listener: opsServices?.final_probes?.local_llama_listener || null,
      strongarm_gate: opsServices?.final_probes?.strongarm_gate || null,
    },
    chat_archive_export: {
      ok: Boolean(chatArchiveDir) && exists(path.join(chatArchiveDir || "", "chat-duplicate.md")) && exists(path.join(chatArchiveDir || "", "chat-screenplay.md")),
      latest_archive_dir: chatArchiveDir,
    },
    atomsmasher_intake: {
      ok:
        atomSmasherDoctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN" ||
        atomSmasherIntake?.status === "WAITING_FOR_HEAVY_SPEC",
      path: atomSmasherIntakePath,
      status: atomSmasherIntake?.status || null,
    },
    atomsmasher_integration: {
      ok: atomSmasherDoctor?.ok === true && atomSmasherDoctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN",
      path: atomSmasherDoctorPath,
      status: atomSmasherDoctor?.summary?.status || null,
      features_registered: atomSmasherDoctor?.summary?.features_registered || 0,
      features_ok: atomSmasherDoctor?.summary?.features_ok || 0,
      schema_version: atomSmasherDoctor?.summary?.schema_version || null,
    },
    atomsmasher_tool_merge: {
      ok: atomSmasherToolMerge?.ok === true && atomSmasherToolMerge?.status === "ATOMSMASHER_TOOL_MERGE_GREEN",
      path: atomSmasherToolMergePath,
      status: atomSmasherToolMerge?.status || null,
      eligible_backend_tools: atomSmasherToolMerge?.manifest?.totals?.eligible_backend_tools || 0,
      excluded_visual_or_product_lane: atomSmasherToolMerge?.manifest?.totals?.excluded_visual_or_product_lane || 0,
    },
    strongarm_gate: {
      ok: strongarmDoctor?.ok === true && strongarmDoctor?.status === "STRONGARM_ORANGEBOX_GATE_GREEN",
      path: strongarmDoctorPath,
      status: strongarmDoctor?.status || null,
      integration_root: strongarmDoctor?.integration_root || path.join(repoRoot, "integrations", "strongarm_easy_v0_4"),
      default_mode: strongarmDoctor?.project_gate_policy?.default_mode || null,
    },
    gremlin_misfits_elite: {
      ok: gremlinDoctor?.ok === true && gremlinDoctor?.status === "GREMLIN_MISFITS_ELITE_GREEN",
      path: gremlinDoctorPath,
      status: gremlinDoctor?.status || null,
      trainer_root: gremlinDoctor?.trainer_root || path.join(repoRoot, "integrations", "strongarm_gremlin_trainer_v2_5"),
      elite_root: gremlinDoctor?.elite_root || path.join(repoRoot, "integrations", "strongarm_gremlin_elite_1000_v1_3"),
      training_status: gremlinDoctor?.training?.status || null,
      rows: gremlinDoctor?.elite_proof?.rows || null,
    },
    trilane_router: {
      ok: triLaneRouter?.ok === true && triLaneRouter?.status === "TRILANE_ROUTER_PACK_GREEN",
      path: triLaneRouterPath,
      status: triLaneRouter?.status || null,
      local_config_ready: triLaneRouter?.install_status?.local_config_ready || false,
      codexa_status_note: triLaneRouter?.codexa_status_note || null,
    },
    local_model_lane_eval: {
      ok:
        localModelLane?.ok === true &&
        localModelLane?.status === "LOCAL_MODEL_LANE_EVAL_GREEN" &&
        localModelLane?.constraints?.model_call_attempted === false &&
        localModelLane?.constraints?.ollama_pull_attempted === false &&
        localModelLane?.packet_eval?.fixtures_green === localModelLane?.packet_eval?.fixtures_total,
      path: localModelLanePath,
      status: localModelLane?.status || null,
      fixtures_green: localModelLane?.packet_eval?.fixtures_green || 0,
      fixtures_total: localModelLane?.packet_eval?.fixtures_total || 0,
      core_installed_count: localModelLane?.inventory_truth?.core_installed_count ?? null,
      core_total: localModelLane?.inventory_truth?.core_total ?? null,
      note: "Proves local model role lanes and wildcard limits without claiming Codexa models are installed.",
    },
    active_council: {
      ok:
        activeCouncil?.ok === true &&
        ["ACTIVE_COUNCIL_GREEN", "ACTIVE_COUNCIL_PULSE_GREEN"].includes(activeCouncil?.status) &&
        activeCouncil?.runtime_truth?.latest_pulse_fresh === true &&
        activeCouncil?.runtime_truth?.watcher_status === "ACTIVE_COUNCIL_WATCHER_RUNNING",
      path: activeCouncilPath,
      status: activeCouncil?.status || null,
      pulse_fresh: activeCouncil?.runtime_truth?.latest_pulse_fresh ?? null,
      watcher_status: activeCouncil?.runtime_truth?.watcher_status || null,
      warm_models: activeCouncil?.active_posture?.warm_models || [],
      event_armed_models: activeCouncil?.active_posture?.event_armed_models || [],
      warrant_only_models: activeCouncil?.active_posture?.warrant_only_models || [],
      note: "Proves the local swarm posture is active: small lanes stay warm, specialists are armed, and 70B/cloud lanes stay warrant-only.",
    },
    obox2_internal_setup_pack: {
      ok: obox2Pack?.ok === true && obox2Pack?.status === "OBOX2_INTERNAL_SETUP_PACK_GREEN" && exists(obox2Pack?.zip_path || ""),
      path: obox2PackPath,
      status: obox2Pack?.status || null,
      zip_path: obox2Pack?.zip_path || null,
      note: "Codexa model installs are operator-run on the AI Box; this check proves the setup pack exists.",
    },
    obox2_package_doctor: {
      ok: obox2Doctor?.ok === true && obox2Doctor?.status === "OBOX2_PACKAGE_VERIFIED_GREEN",
      path: obox2DoctorPath,
      status: obox2Doctor?.status || null,
      zip_path: obox2Doctor?.zip_path || null,
      note: "Validates the zip shape without installing models or services.",
    },
    soul_genome_knowledge_map: {
      ok: soulGenome?.ok === true && soulGenome?.status === "SOUL_GENOME_KNOWLEDGE_MAP_GREEN",
      path: soulGenomePath,
      status: soulGenome?.status || null,
      decision: soulGenome?.decision || null,
      layer_count: soulGenome?.layers?.length || 0,
    },
    knowledge_improvement_queue: {
      ok:
        knowledgeImprovements?.ok === true &&
        knowledgeImprovements?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" &&
        knowledgeImprovements?.not_autonomous === true,
      path: knowledgeImprovementsPath,
      status: knowledgeImprovements?.status || null,
      candidate_count: knowledgeImprovements?.candidate_count || 0,
      doctrine: knowledgeImprovements?.doctrine || null,
      note: "Knowledge Engine can queue learned improvement candidates, but cannot self-promote changes.",
    },
    openclaw_startup_retired: {
      ok: openclawRetirement?.status === "OPENCLAW_STARTUP_RETIRED",
      path: openclawRetirementPath,
      status: openclawRetirement?.status || null,
      applied: openclawRetirement?.applied || false,
      note: "OpenClaw should not start on boot after this retirement receipt.",
    },
    bookmaker_deferred: {
      ok: !exists(path.join(repoRoot, "scripts", "v4", "bookmaker-documentarian.mjs")),
      expected: "Bookmaker is deferred; no active script should exist.",
    },
  };

  const ok = Object.values(checks).every((check) => check.ok);
  const result = {
    ok,
    version: "orangebox-ops-readiness/v0",
    status: ok ? "ORANGEBOX_OPS_RAILS_GREEN" : "ORANGEBOX_OPS_RAILS_NOT_GREEN",
    checked_at: new Date().toISOString(),
    checks,
  };

  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-ops-readiness-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status);
  }
  if (!ok) process.exitCode = 1;
}

main();
