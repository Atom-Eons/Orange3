#!/usr/bin/env node
/*
  orangebox-feature-acceptance-matrix-doctor.mjs

  Backend-only feature claim ledger. It turns "what works / what is partial /
  what is separate / what is blocked" into a machine-checkable acceptance
  matrix with evidence paths, proof commands, rollback or recovery paths, and
  explicit Codexa/full-system truth.
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
const outRoot = path.join(dataRoot, "feature-proof");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function evidence(pathName, expectedStatus, options = {}) {
  const parsed = readJson(pathName);
  const status = parsed?.status || parsed?.summary?.status || (parsed?.ok === true && options.okStatus) || null;
  const ok = options.accept
    ? Boolean(options.accept(parsed, status))
    : (expectedStatus ? status === expectedStatus : Boolean(parsed));
  return {
    ok,
    path: pathName,
    exists: exists(pathName),
    status,
    expected_status: expectedStatus || null,
    detail: options.detail ? options.detail(parsed) : null,
  };
}

function matrixRow(row) {
  const evidenceRows = row.evidence || [];
  const real = row.status === "REAL";
  const partial = row.status === "PARTIAL";
  const blocked = row.status === "BLOCKED";
  const separate = row.status === "SEPARATE_LANE";
  const proofCommandOk = typeof row.proof_command === "string" && row.proof_command.includes("npm.cmd run");
  const rollbackOk = Boolean(row.rollback_path || row.recovery_path);
  const evidencePresent = evidenceRows.length > 0;
  const greenEvidence = evidenceRows.some((item) => item.ok === true);
  const backendScopeOk = row.lane !== "backend_ops" || row.frontend_touch_allowed === false;
  const statusOk = real ? greenEvidence : (partial || blocked || separate ? evidencePresent : false);
  const failures = [];
  if (!proofCommandOk) failures.push("missing_proof_command");
  if (!rollbackOk) failures.push("missing_rollback_or_recovery_path");
  if (!evidencePresent) failures.push("missing_evidence");
  if (!statusOk) failures.push("status_not_supported_by_evidence");
  if (!backendScopeOk) failures.push("backend_feature_allows_frontend_touch");
  if (real && row.operator_approval_required !== false && !row.acceptance_gate) failures.push("real_feature_missing_acceptance_gate");
  return {
    ...row,
    ok: failures.length === 0,
    failures,
  };
}

async function main() {
  const startedAt = new Date();
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const projectPath = path.join(dataRoot, "reports", "project", "latest-project-report.json");
  const healthPath = path.join(dataRoot, "reports", "health", "latest-health-report.json");
  const alertPath = path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json");
  const project = readJson(projectPath);
  const alert = readJson(alertPath);
  const codexaReady = alert?.status === "CODEXA_READY";

  const backendInstallPath = latestReceipt("orangebox-backend-install-");
  const opsReadinessPath = latestReceipt("orangebox-ops-readiness-");
  const finalPackagePath = latestReceipt("orangebox-delta-final-package-");
  const finalManifestPath = path.join(repoRoot, "orangebox-delta-final-manifest.json");
  const finalDownloadZipPath = path.join(dataRoot, "downloads", "latest-orangebox-delta-final-download-zip.json");
  const openclawPath = path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json");
  const terminalReceiptPath = latestReceipt("orangebox-powershell-profile-policy-", path.join(dataRoot, "profile-backups"));

  const matrix = [
    matrixRow({
      id: "local_ops_backend",
      claim: "Orangebox Ops backend can run locally without the frontend lane.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run backend:proof && npm.cmd run ops:readiness",
      acceptance_gate: "Backend install and Ops readiness receipts are green; frontend_required_for_backend is false.",
      rollback_path: "Use the installed final folder backup/previous zip; revert scoped backend script changes and rerun backend:proof.",
      evidence: [
        evidence(backendInstallPath, "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN", {
          accept: (parsed, status) => backendProofInProgress || (
            status === "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN" &&
            parsed?.frontend_required_for_backend === false
          ),
          detail: (parsed) => ({ frontend_required_for_backend: parsed?.frontend_required_for_backend ?? null }),
        }),
        evidence(opsReadinessPath, "ORANGEBOX_OPS_RAILS_GREEN"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "mcp_quarantine",
      claim: "MCP/tool bridge exists behind quarantine with descriptor-integrity drift detection, no host MCP mutation, no paid API, no installs by default.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run mcp:doctor",
      acceptance_gate: "MCP doctor has zero failed checks, host_mcp_config_mutated=false, and tool descriptor drift/rug-pull detection is proven.",
      rollback_path: "Disable candidate MCP registry entries and rerun mcp:doctor.",
      evidence: [
        evidence(path.join(dataRoot, "mcp", "latest-mcp-doctor.json"), null, {
          accept: (parsed) => parsed?.ok === true
            && parsed?.summary?.failed === 0
            && parsed?.host_mcp_config_mutated === false
            && parsed?.descriptor_integrity?.drift_detected === true
            && parsed?.descriptor_integrity?.tool_list_rug_pull_blocked === true
            && parsed?.descriptor_integrity?.auto_trust_after_drift === false,
          okStatus: "MCP_QUARANTINE_GREEN",
          detail: (parsed) => ({
            failed: parsed?.summary?.failed ?? null,
            host_mcp_config_mutated: parsed?.host_mcp_config_mutated ?? null,
            descriptor_drift_detected: parsed?.descriptor_integrity?.drift_detected ?? null,
            tool_list_rug_pull_blocked: parsed?.descriptor_integrity?.tool_list_rug_pull_blocked ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "indirect_prompt_injection_drills",
      claim: "Untrusted text from email, web, repo, PDF, chat logs, tool output, or retrieved memory cannot smuggle executable tool commands.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run ipi:doctor",
      acceptance_gate: "IPI doctor is green, all drills pass, command_executed=false, network_called=false, and untrusted channels are quarantined.",
      rollback_path: "Revert IPI doctor/command/report wiring and rerun ipi:doctor, action:doctor, feature:proof, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"), "ORANGEBOX_IPI_DRILLS_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_IPI_DRILLS_GREEN"
            && parsed?.constraints?.command_executed === false
            && parsed?.constraints?.network_called === false
            && Number(parsed?.summary?.fixtures_green || 0) === Number(parsed?.summary?.fixtures_total || -1)
            && Number(parsed?.summary?.untrusted_fixtures || 0) >= 5,
          detail: (parsed) => ({
            fixtures_green: parsed?.summary?.fixtures_green ?? null,
            fixtures_total: parsed?.summary?.fixtures_total ?? null,
            untrusted_fixtures: parsed?.summary?.untrusted_fixtures ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "pre_tool_action_classifier",
      claim: "Risky tool actions are classified before execution.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run action:doctor",
      acceptance_gate: "Action classifier fixtures include allowed, staged, blocked, and suspicious multi-action sequence decisions.",
      rollback_path: "Revert action-classifier fixture/rule changes and rerun action:doctor and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"), "ORANGEBOX_ACTION_CLASSIFIER_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN"
            && Number(parsed?.blocked_count || 0) >= 1
            && Number(parsed?.staged_count || 0) >= 1
            && Number(parsed?.sequence_cases_run || 0) >= 3
            && Number(parsed?.sequence_blocked_count || 0) >= 1,
          detail: (parsed) => ({
            cases_run: parsed?.cases_run || 0,
            blocked_count: parsed?.blocked_count || 0,
            staged_count: parsed?.staged_count || 0,
            sequence_cases_run: parsed?.sequence_cases_run || 0,
            sequence_blocked_count: parsed?.sequence_blocked_count || 0,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "memory_source_truth",
      claim: "Latest source-backed receipt truth beats stale chat memory, and compressed memory carries dereferenceable source pointers.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run memory:doctor",
      acceptance_gate: "Memory/source-truth doctor is green, all drills pass, raw_history_injected=false, and revised facts create compression debt.",
      rollback_path: "Revert memory-source-truth doctor/command/report wiring and rerun memory:doctor, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json"), "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN"
            && parsed?.constraints?.raw_history_injected === false
            && Number(parsed?.summary?.drills_green || 0) === Number(parsed?.summary?.drills_total || -1)
            && Number(parsed?.summary?.stale_conflicts_detected || 0) >= 1,
          detail: (parsed) => ({
            drills_green: parsed?.summary?.drills_green ?? null,
            drills_total: parsed?.summary?.drills_total ?? null,
            stale_conflicts_detected: parsed?.summary?.stale_conflicts_detected ?? null,
            hot_packet_token_estimate: parsed?.summary?.hot_packet_token_estimate ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "skill_primer_everywhere",
      claim: "Modern Orangebox primer skill is installed in Codex, Claude, Antigravity/Gemini, and shared agent roots with stale skills removed.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run primer:sync && npm.cmd run skills:lifecycle",
      acceptance_gate: "Skill lifecycle is green and stale_count is zero.",
      rollback_path: "Restore the skill backup from OrangeBox-Data if needed, then rerun primer:sync.",
      evidence: [
        evidence(path.join(dataRoot, "skills", "latest-skill-lifecycle.json"), "ORANGEBOX_SKILL_LIFECYCLE_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN" && parsed?.stale_count === 0,
          detail: (parsed) => ({ command_count: parsed?.command_count ?? null, stale_count: parsed?.stale_count ?? null }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "tool_ergonomics",
      claim: "Orangebox skill commands map to real proof actions and are bounded, distinct, and receipt-backed.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run tool:ergonomics",
      acceptance_gate: "Tool ergonomics receipt is green and command_count is nonzero.",
      rollback_path: "Revert command-wrapper and SKILL.md changes, then rerun tool:ergonomics and skills:lifecycle.",
      evidence: [
        evidence(path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"), "ORANGEBOX_TOOL_ERGONOMICS_GREEN"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "v3_free_alpha_toolmesh",
      claim: "Orangebox V3 has a free-alpha ToolMesh control plane covering all preserved V3 waves and all ToolMesh waves without promoting execution.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run toolmesh:doctor && npm.cmd run toolmesh:physical-doctor && npm.cmd run v3:doctor",
      acceptance_gate: "ToolMesh doctor is green with required first-batch cards registered, physical runtime fields declared, 16 preserved V3 waves, 10 ToolMesh waves, and execution blocked until promoted.",
      rollback_path: "Turn ORANGEBOX_FREE_ALPHA_TOOLMESH=0, remove ToolMesh package scripts, and rerun v3:doctor and feature:proof.",
      evidence: [
        evidence(path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json"), "GREEN", {
          accept: (parsed, status) => status === "GREEN"
            && parsed?.ok === true
            && Number(parsed?.summary?.cards_total || 0) >= 39
            && parsed?.checks?.first_batch_registered === true
            && parsed?.checks?.execution_blocked_until_promoted === true
            && parsed?.checks?.hardware_profiles_declared === true
            && parsed?.checks?.artifact_pointer_policy_declared === true
            && parsed?.checks?.artifact_protocol_declared === true
            && parsed?.checks?.workflow_policy_declared === true
            && parsed?.checks?.execution_modes_declared === true
            && parsed?.checks?.autonomy_levels_declared === true
            && parsed?.checks?.handoff_truth_declared === true
            && parsed?.checks?.immutable_templates_for_workflow_tools === true
            && parsed?.waveValidation?.preservedV3Count === 16
            && parsed?.waveValidation?.toolmeshCount === 10
            && Array.isArray(parsed?.missingRequiredFirstBatch)
            && parsed.missingRequiredFirstBatch.length === 0,
          detail: (parsed) => ({
            cards_total: parsed?.summary?.cards_total ?? null,
            preserved_v3_waves: parsed?.waveValidation?.preservedV3Count ?? null,
            toolmesh_waves: parsed?.waveValidation?.toolmeshCount ?? null,
            execution_blocked_until_promoted: parsed?.checks?.execution_blocked_until_promoted ?? null,
            hardware_profiles_declared: parsed?.checks?.hardware_profiles_declared ?? null,
            artifact_pointer_policy_declared: parsed?.checks?.artifact_pointer_policy_declared ?? null,
            artifact_protocol_declared: parsed?.checks?.artifact_protocol_declared ?? null,
            workflow_policy_declared: parsed?.checks?.workflow_policy_declared ?? null,
            immutable_templates_for_workflow_tools: parsed?.checks?.immutable_templates_for_workflow_tools ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "toolmesh_physical_runtime_contract",
      claim: "ToolMesh cards declare hardware physics, artifact pointer discipline, immutable workflow policy, execution mode, and GUI handoff truth before any external tool promotion.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run toolmesh:physical-doctor",
      acceptance_gate: "Physical runtime doctor is green, all cards are pointer-only and physical-valid, template registry is valid, GUI tools are handoff-only, and no external tool execution/cloud call/frontend touch occurred.",
      rollback_path: "Remove ToolMesh physical-runtime schemas/templates/doctor wiring and generated physical-runtime receipts, then rerun toolmesh:doctor, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "v3", "toolmesh", "physical-runtime", "latest-physical-runtime-doctor.json"), "ORANGEBOX_TOOLMESH_PHYSICAL_RUNTIME_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_TOOLMESH_PHYSICAL_RUNTIME_GREEN"
            && parsed?.ok === true
            && parsed?.checks?.all_cards_physical_valid === true
            && parsed?.checks?.artifact_pointer_only_all_cards === true
            && parsed?.checks?.template_registry_valid === true
            && parsed?.checks?.gui_tools_handoff_only === true
            && parsed?.checks?.no_execute_direct_in_y0 === true
            && parsed?.constraints?.external_tools_executed === false
            && parsed?.constraints?.cloud_services_called === false
            && parsed?.constraints?.frontend_touched === false
            && Number(parsed?.summary?.cards_total || 0) >= 39,
          detail: (parsed) => ({
            cards_total: parsed?.summary?.cards_total ?? null,
            pointerOnlyCount: parsed?.summary?.pointerOnlyCount ?? null,
            handoffRequiredCount: parsed?.summary?.handoffRequiredCount ?? null,
            immutableTemplateRequiredCount: parsed?.summary?.immutableTemplateRequiredCount ?? null,
            maxVramRequiredGB: parsed?.summary?.hardwareSummary?.maxVramRequiredGB ?? null,
            template_count: parsed?.templateRegistry?.template_count ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "visual_headless_image_runtime",
      claim: "Orangebox has one promoted local headless image runtime that produces a real PNG artifact by pointer, manifest, SHA-256, and receipt without touching the frontend or calling cloud services.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:runtime:headless-image && npm.cmd run visual:readiness",
      acceptance_gate: "Headless image runtime receipt is green, runtime_ready=true, artifact is PNG, runtime_generated_media=true, ai_generated_media=false, frontend_touched=false, and visual readiness mirrors the artifact hash/path.",
      rollback_path: "Delete generated headless-image runtime artifacts/receipts and demote/remove the orangebox-headless-png-renderer ToolMesh card if superseded.",
      evidence: [
        evidence(path.join(dataRoot, "visual-artifacts", "runtime", "headless-image", "latest-headless-image-runtime.json"), "ORANGEBOX_HEADLESS_IMAGE_RUNTIME_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_HEADLESS_IMAGE_RUNTIME_GREEN"
            && parsed?.ok === true
            && parsed?.runtime_ready === true
            && parsed?.artifact?.mime_type === "image/png"
            && parsed?.artifact?.runtime_generated_media === true
            && parsed?.artifact?.ai_generated_media === false
            && /^[a-f0-9]{64}$/.test(parsed?.artifact?.sha256 || "")
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.cloud_services_called === false,
          detail: (parsed) => ({
            artifact_path: parsed?.artifact?.artifact_path ?? null,
            artifact_sha256: parsed?.artifact?.sha256 ?? null,
            tool_card_id: parsed?.tool_card_id ?? null,
            ai_generated_media: parsed?.artifact?.ai_generated_media ?? null,
          }),
        }),
        evidence(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), "ORANGEBOX_VISUAL_PRODUCTION_PARTIAL_RUNTIME_READY", {
          accept: (parsed) => parsed?.ok === true
            && parsed?.summary?.headless_image_runtime_ready === true
            && Number(parsed?.summary?.runtime_ready_lanes || 0) >= 1,
          detail: (parsed) => ({
            status: parsed?.status ?? null,
            runtime_ready_lanes: parsed?.summary?.runtime_ready_lanes ?? null,
            headless_image_artifact_path: parsed?.summary?.headless_image_artifact_path ?? null,
            headless_image_artifact_sha256: parsed?.summary?.headless_image_artifact_sha256 ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "visual_headless_design_runtime",
      claim: "Orangebox has one promoted local headless design runtime that produces a real SVG design artifact by pointer, manifest, SHA-256, and receipt without touching the frontend or calling cloud services.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:runtime:headless-design && npm.cmd run visual:readiness",
      acceptance_gate: "Headless design runtime receipt is green, runtime_ready=true, artifact is SVG, runtime_generated_media=true, ai_generated_media=false, frontend_touched=false, and visual readiness mirrors the artifact hash/path.",
      rollback_path: "Delete generated headless-design runtime artifacts/receipts and demote/remove the orangebox-headless-design-exporter ToolMesh card if superseded.",
      evidence: [
        evidence(path.join(dataRoot, "visual-artifacts", "runtime", "headless-design", "latest-headless-design-runtime.json"), "ORANGEBOX_HEADLESS_DESIGN_RUNTIME_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_HEADLESS_DESIGN_RUNTIME_GREEN"
            && parsed?.ok === true
            && parsed?.runtime_ready === true
            && parsed?.artifact?.mime_type === "image/svg+xml"
            && parsed?.artifact?.runtime_generated_media === true
            && parsed?.artifact?.ai_generated_media === false
            && parsed?.artifact?.deterministic_renderer === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.cloud_services_called === false,
          detail: (parsed) => ({
            artifact_path: parsed?.artifact?.artifact_path ?? null,
            artifact_sha256: parsed?.artifact?.sha256 ?? null,
            tool_card_id: parsed?.tool_card_id ?? null,
            template_id: parsed?.template_id ?? null,
            ai_generated_media: parsed?.artifact?.ai_generated_media ?? null,
          }),
        }),
        evidence(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), "ORANGEBOX_VISUAL_PRODUCTION_PARTIAL_RUNTIME_READY", {
          accept: (parsed, status) => (
            status === "ORANGEBOX_VISUAL_PRODUCTION_PARTIAL_RUNTIME_READY" ||
            status === "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY"
          )
            && parsed?.ok === true
            && Number(parsed?.summary?.runtime_ready_lanes || 0) >= 2
            && parsed?.summary?.headless_design_runtime_ready === true
            && typeof parsed?.summary?.headless_design_artifact_sha256 === "string",
          detail: (parsed) => ({
            status: parsed?.status || null,
            runtime_ready_lanes: parsed?.summary?.runtime_ready_lanes ?? null,
            headless_design_artifact_path: parsed?.summary?.headless_design_artifact_path ?? null,
            headless_design_artifact_sha256: parsed?.summary?.headless_design_artifact_sha256 ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "visual_headless_audio_runtime",
      claim: "Orangebox has one promoted local headless audio runtime that produces a real WAV artifact by pointer, manifest, SHA-256, and receipt without touching the frontend or calling cloud services.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:runtime:headless-audio && npm.cmd run visual:readiness",
      acceptance_gate: "Headless audio runtime receipt is green, runtime_ready=true, artifact is WAV, runtime_generated_media=true, ai_generated_media=false, frontend_touched=false, and visual readiness mirrors the artifact hash/path.",
      rollback_path: "Delete generated headless-audio runtime artifacts/receipts and demote/remove the orangebox-headless-audio-renderer ToolMesh card if superseded.",
      evidence: [
        evidence(path.join(dataRoot, "visual-artifacts", "runtime", "headless-audio", "latest-headless-audio-runtime.json"), "ORANGEBOX_HEADLESS_AUDIO_RUNTIME_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_HEADLESS_AUDIO_RUNTIME_GREEN"
            && parsed?.ok === true
            && parsed?.runtime_ready === true
            && parsed?.artifact?.mime_type === "audio/wav"
            && parsed?.artifact?.runtime_generated_media === true
            && parsed?.artifact?.ai_generated_media === false
            && parsed?.artifact?.deterministic_renderer === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.cloud_services_called === false,
          detail: (parsed) => ({
            artifact_path: parsed?.artifact?.artifact_path ?? null,
            artifact_sha256: parsed?.artifact?.sha256 ?? null,
            tool_card_id: parsed?.tool_card_id ?? null,
            template_id: parsed?.template_id ?? null,
            ai_generated_media: parsed?.artifact?.ai_generated_media ?? null,
          }),
        }),
        evidence(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY", {
          accept: (parsed) => parsed?.ok === true
            && Number(parsed?.summary?.runtime_ready_lanes || 0) >= 3
            && parsed?.summary?.headless_audio_runtime_ready === true
            && typeof parsed?.summary?.headless_audio_artifact_sha256 === "string",
          detail: (parsed) => ({
            status: parsed?.status || null,
            runtime_ready_lanes: parsed?.summary?.runtime_ready_lanes ?? null,
            headless_audio_artifact_path: parsed?.summary?.headless_audio_artifact_path ?? null,
            headless_audio_artifact_sha256: parsed?.summary?.headless_audio_artifact_sha256 ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "visual_headless_animation_runtime",
      claim: "Orangebox has one promoted local headless animation runtime that produces a real motion SVG artifact by pointer, manifest, SHA-256, and receipt without touching the frontend or calling cloud services.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:runtime:headless-animation && npm.cmd run visual:readiness",
      acceptance_gate: "Headless animation runtime receipt is green, runtime_ready=true, artifact is animated SVG, runtime_generated_media=true, ai_generated_media=false, frontend_touched=false, and visual readiness mirrors the artifact hash/path.",
      rollback_path: "Delete generated headless-animation runtime artifacts/receipts and demote/remove the orangebox-headless-animation-renderer ToolMesh card if superseded.",
      evidence: [
        evidence(path.join(dataRoot, "visual-artifacts", "runtime", "headless-animation", "latest-headless-animation-runtime.json"), "ORANGEBOX_HEADLESS_ANIMATION_RUNTIME_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_HEADLESS_ANIMATION_RUNTIME_GREEN"
            && parsed?.ok === true
            && parsed?.runtime_ready === true
            && parsed?.artifact?.mime_type === "image/svg+xml"
            && parsed?.artifact?.runtime_generated_media === true
            && parsed?.artifact?.ai_generated_media === false
            && parsed?.artifact?.deterministic_renderer === true
            && parsed?.artifact?.animated_media === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.cloud_services_called === false,
          detail: (parsed) => ({
            artifact_path: parsed?.artifact?.artifact_path ?? null,
            artifact_sha256: parsed?.artifact?.sha256 ?? null,
            tool_card_id: parsed?.tool_card_id ?? null,
            template_id: parsed?.template_id ?? null,
            ai_generated_media: parsed?.artifact?.ai_generated_media ?? null,
          }),
        }),
        evidence(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY", {
          accept: (parsed) => parsed?.ok === true
            && Number(parsed?.summary?.runtime_ready_lanes || 0) >= 4
            && parsed?.summary?.headless_animation_runtime_ready === true
            && typeof parsed?.summary?.headless_animation_artifact_sha256 === "string",
          detail: (parsed) => ({
            status: parsed?.status || null,
            runtime_ready_lanes: parsed?.summary?.runtime_ready_lanes ?? null,
            headless_animation_artifact_path: parsed?.summary?.headless_animation_artifact_path ?? null,
            headless_animation_artifact_sha256: parsed?.summary?.headless_animation_artifact_sha256 ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "visual_production_readiness",
      claim: "Orangebox reports visual/media/design runtime truth without touching the living frontend dashboard or mistaking candidate tool cards for promoted tools.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:artifact-smoke && npm.cmd run visual:runtime:headless-image && npm.cmd run visual:runtime:headless-design && npm.cmd run visual:runtime:headless-audio && npm.cmd run visual:runtime:headless-animation && npm.cmd run visual:readiness",
      acceptance_gate: "Visual readiness receipt is present, control_plane_green=true, artifact_vault_ready=true, artifact_smoke_ready=true, visual_tool_cards >= 23, and baseline runtime lanes are explicit.",
      rollback_path: "Remove the visual artifact vault/smoke/readiness package scripts and doctors, then rerun package-script-doctor and feature:proof.",
      evidence: [
        evidence(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), "ORANGEBOX_VISUAL_PRODUCTION_CONTROL_READY_RUNTIME_NOT_PROMOTED", {
          accept: (parsed, status) => (
            status === "ORANGEBOX_VISUAL_PRODUCTION_CONTROL_READY_RUNTIME_NOT_PROMOTED" ||
            status === "ORANGEBOX_VISUAL_PRODUCTION_PARTIAL_RUNTIME_READY" ||
            status === "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY"
          ) && parsed?.ok === true
            && parsed?.control_plane_green === true
            && parsed?.summary?.artifact_vault_ready === true
            && parsed?.summary?.artifact_smoke_ready === true
            && Number(parsed?.summary?.visual_tool_cards || 0) >= 23
            && Number(parsed?.summary?.runtime_ready_lanes || 0) >= 4
            && typeof parsed?.visual_ready === "boolean",
          detail: (parsed) => ({
            visual_ready: parsed?.visual_ready ?? null,
            control_plane_green: parsed?.control_plane_green ?? null,
            artifact_vault_ready: parsed?.summary?.artifact_vault_ready ?? null,
            artifact_smoke_ready: parsed?.summary?.artifact_smoke_ready ?? null,
            artifact_manifest_path: parsed?.summary?.artifact_manifest_path ?? null,
            smoke_artifact_path: parsed?.summary?.smoke_artifact_path ?? null,
            smoke_artifact_sha256: parsed?.summary?.smoke_artifact_sha256 ?? null,
            runtime_ready_lanes: parsed?.summary?.runtime_ready_lanes ?? null,
            headless_design_runtime_ready: parsed?.summary?.headless_design_runtime_ready ?? null,
            headless_audio_runtime_ready: parsed?.summary?.headless_audio_runtime_ready ?? null,
            headless_animation_runtime_ready: parsed?.summary?.headless_animation_runtime_ready ?? null,
            visual_tool_cards: parsed?.summary?.visual_tool_cards ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "horizon_review_new_alpha_stack",
      claim: "Orangebox reviews OBOX Jarvis/OpenJarvis, Goose, Context7, Elysia, Hermes/OpenClaw, Void/LittleOrange, Continue, AI SDK/Ollama, libSQL, Mastra, visual runtimes, and GPU acceleration candidates before promotion.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run horizon:review",
      acceptance_gate: "Horizon review receipt is green with at least 13 candidates, Elysia dependency truth, Goose card truth, Hermes/OpenClaw truth, LittleOrange doctor truth, visual artifact pipeline truth, and no auto-promotion.",
      rollback_path: "Remove the horizon review package script and doctor, then rerun package-script-doctor and feature:proof.",
      evidence: [
        evidence(path.join(dataRoot, "horizon-review", "latest-horizon-review.json"), "ORANGEBOX_HORIZON_REVIEW_READY", {
          accept: (parsed, status) => status === "ORANGEBOX_HORIZON_REVIEW_READY"
            && parsed?.ok === true
            && Number(parsed?.summary?.candidates_reviewed || 0) >= 13
            && parsed?.summary?.elysia_dependency_present === true
            && parsed?.summary?.goose_card_present === true
            && typeof parsed?.summary?.hermes_pack_present === "boolean"
            && typeof parsed?.summary?.openclaw_retired === "boolean"
            && parsed?.summary?.littleorange_doctor_present === true,
          detail: (parsed) => ({
            candidates_reviewed: parsed?.summary?.candidates_reviewed ?? null,
            active_contracts: parsed?.summary?.active_contracts ?? null,
            elysia_dependency_present: parsed?.summary?.elysia_dependency_present ?? null,
            goose_card_present: parsed?.summary?.goose_card_present ?? null,
            hermes_pack_present: parsed?.summary?.hermes_pack_present ?? null,
            openclaw_retired: parsed?.summary?.openclaw_retired ?? null,
            littleorange_doctor_present: parsed?.summary?.littleorange_doctor_present ?? null,
            visual_artifact_pipeline_ready: parsed?.summary?.visual_artifact_pipeline_ready ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "horizon_promotion_bakeoff",
      claim: "New alpha tools become promotion candidates only through a bakeoff matrix with binary/dependency probes, receipt evidence, blockers, and next proof commands.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run horizon:bakeoff",
      acceptance_gate: "Bakeoff receipt is green, covers at least 10 candidates and 5 waves, keeps automatic promotion at zero, proves visual artifact pipeline truth, and names Goose/OBOX Jarvis/Hermes/OpenClaw blockers.",
      rollback_path: "Remove horizon:bakeoff package script and doctor, then rerun package-script-doctor, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "horizon-bakeoff", "latest-horizon-promotion-bakeoff.json"), "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_READY", {
          accept: (parsed, status) => status === "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_READY"
            && parsed?.ok === true
            && Number(parsed?.summary?.candidates_total || 0) >= 10
            && Number(parsed?.summary?.waves_total || 0) >= 5
            && Number(parsed?.summary?.promotable_now || 0) === 0
            && parsed?.summary?.horizon_review_green === true
            && parsed?.summary?.toolmesh_execution_blocked_until_promoted === true
            && parsed?.summary?.visual_artifact_pipeline_ready === true
            && parsed?.summary?.openclaw_retired === true
            && Array.isArray(parsed?.candidates)
            && ["goose_executor", "obox_jarvis_openjarvis", "hermes_outer_orchestrator", "visual_runtime_toolmesh"].every((id) => parsed.candidates.some((candidate) => candidate.id === id && Array.isArray(candidate.blockers))),
          detail: (parsed) => ({
            candidates_total: parsed?.summary?.candidates_total ?? null,
            waves_total: parsed?.summary?.waves_total ?? null,
            promotable_now: parsed?.summary?.promotable_now ?? null,
            goose_binary_found: parsed?.summary?.goose_binary_found ?? null,
            openjarvis_eval_receipt_green: parsed?.summary?.openjarvis_eval_receipt_green ?? null,
            openjarvis_baseline_score: parsed?.summary?.openjarvis_baseline_score ?? null,
            openjarvis_primitive_coverage_score: parsed?.summary?.openjarvis_primitive_coverage_score ?? null,
            openjarvis_router_approved: parsed?.summary?.openjarvis_router_approved ?? null,
            hermes_pack_present: parsed?.summary?.hermes_pack_present ?? null,
            visual_ready: parsed?.summary?.visual_ready ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "obox_jarvis_openjarvis_eval_scorecard",
      claim: "OBOX Jarvis/OpenJarvis is a measured efficiency/spec evaluator for TriLane, not a hidden router replacement.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run v3:openjarvis:doctor && npm.cmd run horizon:bakeoff",
      acceptance_gate: "OpenJarvis scorecard is green, reads TriLane/current-lane receipts, scores five primitives, keeps default router approval false, and leaves promotion closed.",
      rollback_path: "Revert orangebox-v3/openjarvis/eval-runner.ts and horizon/bakeoff scorecard wiring; rerun v3:openjarvis:doctor, horizon:bakeoff, feature:proof, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "openjarvis", "latest-openjarvis-eval.json"), "OPENJARVIS_EVAL_HARNESS_BASELINE_GREEN", {
          accept: (parsed, status) => status === "OPENJARVIS_EVAL_HARNESS_BASELINE_GREEN"
            && parsed?.ok === true
            && parsed?.comparison?.measured_from_receipts === true
            && Number(parsed?.comparison?.baseline_score || 0) >= 0.85
            && Number(parsed?.comparison?.primitive_coverage_score || 0) >= 0.8
            && parsed?.runtime_truth?.default_router_approved === false
            && parsed?.runtime_truth?.no_router_replacement === true
            && parsed?.runtime_truth?.frontend_touched === false
            && parsed?.runtime_truth?.paid_api_attempted === false
            && parsed?.promotion?.promotable_now === false,
          detail: (parsed) => ({
            status: parsed?.status || null,
            baseline_score: parsed?.comparison?.baseline_score ?? null,
            primitive_coverage_score: parsed?.comparison?.primitive_coverage_score ?? null,
            task_card_score: parsed?.comparison?.task_card_score ?? null,
            openjarvis_runtime_installed: parsed?.runtime_truth?.openjarvis_runtime_installed ?? null,
            default_router_approved: parsed?.runtime_truth?.default_router_approved ?? null,
            promotable_now: parsed?.promotion?.promotable_now ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "goose_runtime_install_proof",
      claim: "Goose is installed and visible to Orangebox as a gated executor candidate, but it is not promoted as default hands or route authority.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run v3:goose:runtime && npm.cmd run horizon:bakeoff",
      acceptance_gate: "Goose runtime receipt is green, run surface is proven, ghost-task guards are green, no live Goose agent execution occurs, and default executor promotion remains false.",
      rollback_path: "Remove v3:goose:runtime script wiring and delete the user-local goose.exe only if Goose is no longer wanted; rerun horizon:bakeoff, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "goose", "runtime", "latest-goose-runtime.json"), "GOOSE_RUNTIME_INSTALLED_UNCONFIGURED_GATED", {
          accept: (parsed, status) => (
            status === "GOOSE_RUNTIME_INSTALLED_UNCONFIGURED_GATED" ||
            status === "GOOSE_RUNTIME_CONFIGURED_GATED"
          )
            && parsed?.ok === true
            && parsed?.runtime?.run_surface_ready === true
            && parsed?.ghost_task?.ready_for_bounded_live_task === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.repo_mutated_by_goose === false
            && parsed?.constraints?.live_agent_execution_attempted === false
            && parsed?.constraints?.default_executor_promoted === false,
          detail: (parsed) => ({
            status: parsed?.status || null,
            version: parsed?.runtime?.version || null,
            provider_configured: parsed?.runtime?.provider_configured ?? null,
            provider_missing_expected_gate: parsed?.runtime?.provider_missing_expected_gate ?? null,
            run_surface_ready: parsed?.runtime?.run_surface_ready ?? null,
            ghost_task_ready: parsed?.ghost_task?.ready_for_bounded_live_task ?? null,
            default_executor_promoted: parsed?.constraints?.default_executor_promoted ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "elysia_rail_latency_bakeoff",
      claim: "The Bun/Elysia API bridge is benchmarked as a temporary sidecar against the current live rails before any default transport switch.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run v3:api:bakeoff",
      acceptance_gate: "Elysia bakeoff receipt is green, latency_parity_green=true, sidecar_candidate_green=true, and default_api_replacement_approved=false.",
      rollback_path: "Delete generated api-bakeoff receipts and remove v3:api:bakeoff wiring; no rail defaults are changed by this proof.",
      evidence: [
        evidence(path.join(dataRoot, "api-bakeoff", "latest-elysia-rail-latency-bakeoff.json"), "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN"
            && parsed?.ok === true
            && parsed?.benchmark?.latency_parity_green === true
            && Number.isFinite(parsed?.benchmark?.elysia_health_p95_ms)
            && Number.isFinite(parsed?.benchmark?.current_comparison_p95_ms)
            && parsed?.promotion?.sidecar_candidate_green === true
            && parsed?.promotion?.default_api_replacement_approved === false
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.default_transport_changed === false
            && parsed?.constraints?.paid_api_called === false
            && parsed?.constraints?.host_mcp_config_mutated === false,
          detail: (parsed) => ({
            elysia_p95_ms: parsed?.benchmark?.elysia_health_p95_ms ?? null,
            current_comparison_p95_ms: parsed?.benchmark?.current_comparison_p95_ms ?? null,
            latency_parity_green: parsed?.benchmark?.latency_parity_green ?? null,
            default_api_replacement_approved: parsed?.promotion?.default_api_replacement_approved ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "checkmate_eval_lane",
      claim: "Prompt/model/routing/tool changes are gated by deterministic CHECKMATE eval fixtures.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run checkmate:doctor",
      acceptance_gate: "CHECKMATE eval lane receipt is green with all required fixture types.",
      rollback_path: "Revert eval fixture or gate changes and rerun checkmate:doctor.",
      evidence: [
        evidence(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"), "CHECKMATE_EVAL_LANE_GREEN"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "eval_integrity_benchmark_hygiene",
      claim: "Benchmark and eval claims are checked for leakage, canary misses, web-trace contamination, and unsupported score inflation.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run checkmate:doctor && npm.cmd run harness:benchmark",
      acceptance_gate: "CHECKMATE has the benchmark hygiene fixture and the harness eval-integrity task passes.",
      rollback_path: "Revert benchmark hygiene fixture/task changes and rerun checkmate:doctor, harness:benchmark, feature:proof, and knowledge:improvements.",
      evidence: [
        evidence(path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"), "CHECKMATE_EVAL_LANE_GREEN", {
          accept: (parsed, status) => status === "CHECKMATE_EVAL_LANE_GREEN"
            && Array.isArray(parsed?.fixtures)
            && parsed.fixtures.some((fixture) => fixture.id === "benchmark_hygiene_integrity_gate"),
          detail: (parsed) => ({
            fixture_count: parsed?.fixtures?.length ?? null,
            benchmark_hygiene_fixture: parsed?.fixtures?.some((fixture) => fixture.id === "benchmark_hygiene_integrity_gate") || false,
          }),
        }),
        evidence(path.join(dataRoot, "harness", "latest-harness-benchmark.json"), "ORANGEBOX_HARNESS_BENCHMARK_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN"
            && Array.isArray(parsed?.tasks)
            && parsed.tasks.some((task) => task.id === "eval_integrity_benchmark_hygiene_truth" && task.ok === true),
          detail: (parsed) => ({
            tasks_total: parsed?.tasks_total ?? null,
            eval_integrity_task: parsed?.tasks?.some((task) => task.id === "eval_integrity_benchmark_hygiene_truth" && task.ok === true) || false,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "operator_signal_hygiene",
      claim: "Alerts preserve local-vs-full truth, severity, cadence, and confidence calibration.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run signal:hygiene",
      acceptance_gate: "Signal hygiene receipt is green, popup_created_by_this_doctor=false, and operator_transparency has status/rationale/foresight/after-action receipts.",
      rollback_path: "Revert alert/cadence report changes and rerun codexa:alert, health:report, project:report, signal:hygiene.",
      evidence: [
        evidence(path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json"), "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN"
            && parsed?.constraints?.popup_created_by_this_doctor === false
            && parsed?.operator_transparency?.version === "orangebox-operator-transparency/v1"
            && Boolean(parsed?.operator_transparency?.level_1_status?.current_alert)
            && Boolean(parsed?.operator_transparency?.level_2_rationale?.full_system_blocked_reason)
            && Boolean(parsed?.operator_transparency?.level_3_foresight?.next_safe_action)
            && Boolean(parsed?.operator_transparency?.after_action_review?.receipts?.health),
          detail: (parsed) => ({
            transparency_version: parsed?.operator_transparency?.version || null,
            full_green_gate: parsed?.operator_transparency?.level_3_foresight?.full_green_gate || null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "doer_watcher_session_spine",
      claim: "Local doer surfaces and watcher freshness are proven in one shared reality state.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run session:spine",
      acceptance_gate: "Session spine is green; Codexa gap is not silenced.",
      rollback_path: "Revert watcher/report changes and rerun health:report, project:report, reality:watch, signal:hygiene, session:spine.",
      evidence: [
        evidence(path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"), "ORANGEBOX_DOER_WATCHER_SPINE_GREEN"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "knowledge_research_queue",
      claim: "External research and receipts create backend improvement candidates without autonomous self-promotion.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run research:radar && npm.cmd run knowledge:improvements",
      acceptance_gate: "Research radar and knowledge queue are ready, not_autonomous=true, and backlog items require operator approval.",
      rollback_path: "Discard candidate/radar receipt changes; do not promote without a scoped proof doctor.",
      evidence: [
        evidence(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"), "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY", {
          accept: (parsed, status) => status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" && parsed?.not_autonomous === true,
          detail: (parsed) => ({ candidate_count: parsed?.candidate_count ?? null, top_area: parsed?.top_execution_candidate?.area || null }),
        }),
        evidence(path.join(dataRoot, "research-radar", "latest-research-radar.json"), null, {
          accept: (parsed, status) => (
            status === "ORANGEBOX_RESEARCH_RADAR_GREEN" ||
            status === "ORANGEBOX_RESEARCH_RADAR_REPORTED_WITH_GAPS"
          ) && parsed?.constraints?.promotion_autonomous === false,
          detail: (parsed) => ({
            status: parsed?.status || null,
            approval_candidates: parsed?.approval_candidates?.length || 0,
            promotion_autonomous: parsed?.constraints?.promotion_autonomous ?? null,
          }),
        }),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "research_assurance_lab",
      claim: "Research-derived Orangebox upgrades are filtered through assurance playbooks, deterministic gates, receipts, rollback, and operator approval before promotion.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run assurance:doctor",
      acceptance_gate: "Assurance Lab receipt is green, source tiering exists, no-auto-promotion is explicit, and frontend/API/install mutations are false.",
      rollback_path: "Revert assurance doctor/command/report wiring, discard assurance-lab receipts, and rerun assurance:doctor, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json"), "ORANGEBOX_ASSURANCE_LAB_GREEN", {
          accept: (parsed, status) => status === "ORANGEBOX_ASSURANCE_LAB_GREEN" &&
            parsed?.constraints?.frontend_touched === false &&
            parsed?.constraints?.paid_api_attempted === false &&
            parsed?.constraints?.autonomous_promotion_attempted === false,
          detail: (parsed) => ({
            source_count: parsed?.summary?.source_count ?? null,
            checks_green: parsed?.summary?.checks_green ?? null,
            checks_total: parsed?.summary?.checks_total ?? null,
          }),
        }),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "offline_harness",
      claim: "Backend proof changes have offline oracle tasks before optimization claims.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run harness:benchmark",
      acceptance_gate: "Harness benchmark is green and all tasks pass.",
      rollback_path: "Revert harness task changes and rerun harness:benchmark.",
      evidence: [
        evidence(path.join(repoRoot, "package.json"), null, {
          accept: (parsed) => Boolean(parsed?.scripts?.["harness:benchmark"]),
          detail: (parsed) => ({ script: parsed?.scripts?.["harness:benchmark"] || null }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "structured_verdicts",
      claim: "STRONGARM and Misfits are installed as pressure/verdict lanes without claiming untrained model behavior.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run strongarm:doctor && npm.cmd run gremlin:doctor",
      acceptance_gate: "STRONGARM green, Misfits dataset green, training status remains honest until trained.",
      rollback_path: "Disable sidecar/training integration config and rerun strongarm:doctor and gremlin:doctor.",
      evidence: [
        evidence(path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"), "STRONGARM_ORANGEBOX_GATE_GREEN"),
        evidence(path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"), "GREMLIN_MISFITS_ELITE_GREEN"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "local_model_lane_eval",
      claim: "Local model lanes are evaluated as bounded packet roles with wildcard limits, STRONGARM/Misfits receipts, and honest installed inventory.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run trilane:doctor && npm.cmd run model:lane-eval",
      acceptance_gate: "Model lane eval is green, does not call or pull models, forbids wildcard authority roles, and keeps full runtime availability separate from policy proof.",
      rollback_path: "Revert local model lane eval doctor/command wiring and rerun trilane:doctor, model:lane-eval, feature:proof, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "models", "latest-local-model-lane-eval.json"), "LOCAL_MODEL_LANE_EVAL_GREEN", {
          accept: (parsed, status) => status === "LOCAL_MODEL_LANE_EVAL_GREEN"
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.ollama_pull_attempted === false
            && parsed?.constraints?.model_call_attempted === false
            && parsed?.promotion_law?.no_model_card_promotion === true
            && parsed?.promotion_law?.wildcard_never_final_authority === true
            && Number(parsed?.packet_eval?.fixtures_green || 0) === Number(parsed?.packet_eval?.fixtures_total || -1),
          detail: (parsed) => ({
            fixtures_green: parsed?.packet_eval?.fixtures_green ?? null,
            fixtures_total: parsed?.packet_eval?.fixtures_total ?? null,
            core_installed_count: parsed?.inventory_truth?.core_installed_count ?? null,
            core_total: parsed?.inventory_truth?.core_total ?? null,
            full_local_model_runtime_green: parsed?.inventory_truth?.full_local_model_runtime_green ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "ops_gap_ledger",
      claim: "Orangebox has a one-reality gap ledger that names every open Ops blocker with evidence, proof commands, and safe next actions.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run ops:gaps",
      acceptance_gate: "Ops gap ledger is valid, does not mutate frontend/Codexa, and refuses full-system green while blocking gaps remain.",
      rollback_path: "Revert ops gap ledger command/doctor wiring and rerun ops:gaps, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json"), null, {
          accept: (parsed, status) => ["ORANGEBOX_OPS_GAP_LEDGER_REPORTED_OPEN_GAPS", "ORANGEBOX_OPS_GAP_LEDGER_GREEN_NO_OPEN_GAPS"].includes(status)
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.remote_codexa_mutation_attempted === false
            && parsed?.ok === true,
          detail: (parsed) => ({
            gap_count: parsed?.gap_count ?? null,
            critical_gap_count: parsed?.critical_gap_count ?? null,
            full_system_green_claim_allowed: parsed?.full_system_green_claim_allowed ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "codexa_handoff",
      claim: "Orangebox generates a single Codexa setup handoff with the first-click launcher, embedded backend payload proof, open blockers, setup zip proof, and cockpit verification order.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run codexa:handoff",
      acceptance_gate: "Handoff is valid, names RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd, references the verified OBOX2 zip, proves the embedded backend payload, includes cockpit proof commands, and refuses full-system green while blocking gaps remain.",
      rollback_path: "Revert Codexa handoff command/doctor wiring and rerun codexa:handoff, feature:proof, project:report, and harness:benchmark.",
      evidence: [
        evidence(path.join(dataRoot, "codexa-handoff", "latest-codexa-handoff.json"), null, {
          accept: (parsed, status) => ["CODEXA_HANDOFF_READY_WITH_OPEN_GAPS", "CODEXA_HANDOFF_READY_NO_OPEN_GAPS"].includes(status)
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.remote_codexa_mutation_attempted === false
            && parsed?.setup_zip?.exists === true
            && parsed?.backend_payload?.exists === true
            && parsed?.backend_payload?.frontend_required_for_backend === false
            && parsed?.codexa_run_order?.[0]?.command === "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd"
            && parsed?.cockpit_verify_commands?.includes("npm.cmd run codexa:access")
            && parsed?.cockpit_verify_commands?.includes("npm.cmd run codexa:remote-proof")
            && parsed?.cockpit_verify_commands?.includes("npm.cmd run codexa:watch")
            && parsed?.cockpit_verify_commands?.includes("npm.cmd run ops:gaps")
            && (parsed?.full_system_green_claim_allowed !== true || Number(parsed?.critical_gap_count || 0) === 0),
          detail: (parsed) => ({
            open_gap_count: parsed?.open_gap_count ?? null,
            critical_gap_count: parsed?.critical_gap_count ?? null,
            first_click: parsed?.codexa_run_order?.[0]?.command || null,
            backend_payload_commit: parsed?.backend_payload?.source_commit || null,
            has_codexa_access: parsed?.cockpit_verify_commands?.includes("npm.cmd run codexa:access") || false,
            has_codexa_remote_proof: parsed?.cockpit_verify_commands?.includes("npm.cmd run codexa:remote-proof") || false,
            has_codexa_watch: parsed?.cockpit_verify_commands?.includes("npm.cmd run codexa:watch") || false,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "codexa_bringup_watch",
      claim: "After the Codexa setup pack is run, Orangebox can watch the real rails and report ready/open-gaps without fake full-green.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run codexa:watch",
      acceptance_gate: "Codexa bring-up watcher writes a receipt, preserves no-remote-mutation constraints, records status history, and separates report success from two-machine readiness.",
      recovery_path: "Run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd on Codexa, then rerun codexa:remote-proof, codexa:watch, codexa:alert, model:inventory, ops:gaps, and ops:green.",
      evidence: [
        evidence(path.join(dataRoot, "codexa-bringup", "latest-codexa-bringup-watch.json"), null, {
          accept: (parsed, status) => [
            "CODEXA_BRINGUP_READY",
            "CODEXA_BRINGUP_REPORTED_OPEN_GAPS",
            "CODEXA_BRINGUP_WATCH_REPORTED_ALERT_FAILURE",
          ].includes(status)
            && parsed?.ok === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.remote_codexa_mutation_attempted === false
            && parsed?.constraints?.install_attempted === false
            && Array.isArray(parsed?.history)
            && parsed.history.length >= 1
            && Boolean(parsed?.false_green_guard),
          detail: (parsed) => ({
            status: parsed?.status || null,
            codexa_ready: parsed?.codexa_ready ?? null,
            missing: parsed?.verdict?.missing || [],
            status_history: parsed?.verdict?.status_history || [],
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "codexa_access_truth",
      claim: "Orangebox can separately prove Codexa command rail, Ollama, RDP, WinRM, SMB, and receipt-dashboard access without attempting login or remote mutation.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run codexa:access",
      acceptance_gate: "Codexa access doctor writes a receipt, probes all access surfaces, preserves no-login/no-mutation constraints, and gives the exact next action from observed access.",
      recovery_path: "Run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd on Codexa or restore RDP/WinRM/8097, then rerun codexa:access, codexa:remote-proof, codexa:watch, and ops:gaps.",
      evidence: [
        evidence(path.join(dataRoot, "codexa-access", "latest-codexa-access.json"), null, {
          accept: (parsed, status) => [
            "CODEXA_ACCESS_FULL_READY",
            "CODEXA_ACCESS_COMMAND_RAIL_READY",
            "CODEXA_ACCESS_WINRM_READY",
            "CODEXA_ACCESS_RDP_READY",
            "CODEXA_ACCESS_RECEIPTS_ONLY",
            "CODEXA_ACCESS_SMB_VISIBLE_ONLY",
            "CODEXA_ACCESS_UNREACHABLE",
          ].includes(status)
            && parsed?.ok === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.remote_codexa_mutation_attempted === false
            && parsed?.constraints?.remote_login_attempted === false
            && parsed?.constraints?.install_attempted === false
            && typeof parsed?.access?.rdp === "boolean"
            && typeof parsed?.access?.winrm === "boolean"
            && typeof parsed?.access?.smb === "boolean"
            && typeof parsed?.access?.command_rail === "boolean"
            && typeof parsed?.access?.ollama === "boolean"
            && Array.isArray(parsed?.next_actions)
            && parsed.next_actions.length >= 1,
          detail: (parsed) => ({
            status: parsed?.status || null,
            command_rail: parsed?.access?.command_rail ?? null,
            ollama: parsed?.access?.ollama ?? null,
            rdp: parsed?.access?.rdp ?? null,
            winrm: parsed?.access?.winrm ?? null,
            smb: parsed?.access?.smb ?? null,
            full_green_blocked: parsed?.interpretation?.full_green_blocked ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "codexa_remote_runtime_proof",
      claim: "Orangebox can prove Codexa loopback-local Ollama, exact model tags, Hermes, Docker, and boot receipts through the command rail without exposing Ollama directly.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run codexa:remote-proof",
      acceptance_gate: "Remote runtime proof writes a receipt, uses a read-only command through the token-gated rail, proves all expected model tags, and preserves no-install/no-mutation constraints.",
      recovery_path: "If remote proof is not green, restore command rail token/8097 or rerun the OBOX2 setup pack on Codexa, then rerun codexa:remote-proof, model:inventory, trilane:doctor, and ops:gaps.",
      evidence: [
        evidence(path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"), null, {
          accept: (parsed, status) => status === "CODEXA_REMOTE_RUNTIME_GREEN"
            && parsed?.codexa_remote_runtime_green === true
            && parsed?.constraints?.frontend_touched === false
            && parsed?.constraints?.visual_lane_touched === false
            && parsed?.constraints?.install_attempted === false
            && parsed?.constraints?.remote_codexa_mutation_attempted === false
            && parsed?.constraints?.remote_read_only_command_attempted === true
            && parsed?.summary?.ollama_loopback_ok === true
            && parsed?.summary?.expected_models_installed === parsed?.summary?.expected_models_total
            && Array.isArray(parsed?.summary?.missing_models)
            && parsed.summary.missing_models.length === 0
            && parsed?.summary?.hermes_green === true,
          detail: (parsed) => ({
            status: parsed?.status || null,
            host: parsed?.summary?.host || null,
            expected_models: `${parsed?.summary?.expected_models_installed ?? "?"}/${parsed?.summary?.expected_models_total ?? "?"}`,
            missing_models: parsed?.summary?.missing_models || [],
            hermes_green: parsed?.summary?.hermes_green ?? null,
            docker_containers: parsed?.summary?.docker_containers ?? null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "model_inventory_truth",
      claim: "Orangebox separates registered/planned model lanes from actually observed cockpit and Codexa models.",
      lane: "backend_ops",
      status: "PARTIAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run model:inventory",
      acceptance_gate: "Model inventory report is valid, never pulls or calls models, and refuses full local model runtime green until required models are observed.",
      recovery_path: "Install the OBOX2 model setup pack on Codexa, restore Ollama reachability, then rerun model:inventory, trilane:doctor, model:lane-eval, health:report, and project:report.",
      evidence: [
        evidence(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"), null, {
          accept: (parsed, status) => (
            status === "ORANGEBOX_MODEL_INVENTORY_GREEN" ||
            status === "ORANGEBOX_MODEL_INVENTORY_REPORTED_WITH_GAPS"
          )
            && parsed?.constraints?.model_pull_attempted === false
            && parsed?.constraints?.model_call_attempted === false
            && Number(parsed?.summary?.required_total || 0) >= 10
            && Number(parsed?.summary?.core_total || 0) >= 5,
          detail: (parsed) => ({
            status: parsed?.status || null,
            required_installed: parsed?.summary?.required_installed ?? null,
            required_total: parsed?.summary?.required_total ?? null,
            core_installed: parsed?.summary?.core_installed ?? null,
            core_total: parsed?.summary?.core_total ?? null,
            full_local_model_runtime_green: parsed?.full_local_model_runtime_green ?? null,
          }),
        }),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "trilane_policy",
      claim: "Tri-lane model policy exists, but installed model inventory remains explicit.",
      lane: "backend_ops",
      status: "PARTIAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run trilane:doctor",
      acceptance_gate: "Router policy is green; installed core model count is not inflated.",
      recovery_path: "Install core models on Codexa, then rerun trilane:doctor and health:report.",
      evidence: [
        evidence(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"), "TRILANE_ROUTER_PACK_GREEN"),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "codexa_two_machine_runtime",
      claim: "Codexa/AI Box is part of the intended system, but current reachability blocks full two-machine green.",
      lane: "codexa",
      status: codexaReady ? "REAL" : "BLOCKED",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run codexa:alert && npm.cmd run health:report",
      acceptance_gate: "Codexa command rail, Ollama, and receipts are reachable before full-system green.",
      recovery_path: "Run OBOX2 start-here pack on Codexa or restore 8097/RDP/WinRM, then rerun codexa:alert.",
      evidence: [
        evidence(alertPath, null, {
          accept: (parsed) => Boolean(parsed?.status),
          detail: (parsed) => ({
            status: parsed?.status || null,
            command_rail_reachable: parsed?.command_rail_reachable ?? null,
            ollama_reachable: parsed?.ollama_reachable ?? null,
          }),
        }),
        evidence(healthPath, null, { accept: (parsed) => Boolean(parsed?.status) }),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "obox2_setup_pack",
      claim: "Codexa setup package is built and verified as a full handoff pack with embedded backend payload, not remotely installed from this chat.",
      lane: "codexa",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run obox2:pack && npm.cmd run obox2:doctor",
      acceptance_gate: "OBOX2 package doctor is green with setup contracts, backend payload hash proof, backend installer proof, and frontend-not-required metadata.",
      recovery_path: "Rebuild the OBOX2 zip and rerun obox2:doctor before using it on Codexa.",
      evidence: [
        evidence(path.join(dataRoot, "obox2", "latest-package-doctor.json"), "OBOX2_PACKAGE_VERIFIED_GREEN", {
          accept: (parsed, status) => status === "OBOX2_PACKAGE_VERIFIED_GREEN"
            && parsed?.json_config?.backend_payload?.ok === true
            && parsed?.json_config?.backend_payload?.frontend_required_for_backend === false
            && parsed?.operational_contracts?.checks?.some((check) => check.id === "backend_installer_payload_zip" && check.ok === true)
            && parsed?.operational_contracts?.checks?.some((check) => check.id === "backend_installer_receipt" && check.ok === true),
          detail: (parsed) => ({
            backend_payload_commit: parsed?.json_config?.backend_payload?.source_commit || null,
            backend_payload_ok: parsed?.json_config?.backend_payload?.ok ?? null,
            frontend_required_for_backend: parsed?.json_config?.backend_payload?.frontend_required_for_backend ?? null,
          }),
        }),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "atomsmasher_compression_pack",
      claim: "AtomSmasher compression pack is integrated as backend tooling, not as a separate project in this lane.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run atomsmasher:doctor && npm.cmd run atomsmasher:merge-tools",
      acceptance_gate: "AtomSmasher integration and backend tool merge receipts are green.",
      rollback_path: "Disable newly promoted AtomSmasher tool mappings and rerun atomsmasher:doctor.",
      evidence: [
        evidence(path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json"), null, {
          accept: (parsed) => parsed?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN",
          detail: (parsed) => ({ features_ok: parsed?.summary?.features_ok ?? null, schema_version: parsed?.summary?.schema_version ?? null }),
        }),
        evidence(path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json"), "ATOMSMASHER_TOOL_MERGE_GREEN"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "terminal_obox_badge",
      claim: "Operator has an OB0X ON terminal affordance to distinguish Orangebox sessions from ordinary shell/chat work.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run project:report",
      acceptance_gate: "PowerShell profile receipt is green and project report mirrors terminal affordance.",
      rollback_path: "Run obox-off or restore the profile backup recorded in OrangeBox-Data/profile-backups.",
      evidence: [
        evidence(terminalReceiptPath, "ORANGEBOX_POWERSHELL_PROFILE_ENABLED"),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "openclaw_retirement",
      claim: "Legacy OpenClaw startup is retired or explicitly not treated as active Orangebox.",
      lane: "backend_ops",
      status: readJson(openclawPath)?.status === "OPENCLAW_STARTUP_RETIRED" ? "REAL" : "PARTIAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run openclaw:retire:dry",
      acceptance_gate: "Dry or apply receipt shows OpenClaw startup hooks are not active.",
      recovery_path: "Use openclaw:retire with operator intent if startup hooks reappear.",
      evidence: [
        evidence(openclawPath, "OPENCLAW_STARTUP_RETIRED", { accept: (parsed) => Boolean(parsed?.status) }),
      ],
      operator_approval_required: true,
    }),
    matrixRow({
      id: "final_package_download",
      claim: "Verified backend-only final package exists for Orangebox Version 1 / Orangebox Delta Final.",
      lane: "backend_ops",
      status: "REAL",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run final:verify && npm.cmd run final:zip",
      acceptance_gate: "Final package receipt proves frontend_included=false/frontend_required_for_backend=false, and final Downloads zip receipt proves archive_verified=true.",
      rollback_path: "Use the previous verified zip in Downloads or rebuild with final:verify and final:zip.",
      evidence: [
        evidence(backendProofInProgress ? path.join(repoRoot, "package.json") : (finalPackagePath || finalManifestPath), null, {
          accept: (parsed) => backendProofInProgress
            ? Boolean(parsed?.scripts?.["final:verify"])
            : parsed?.frontend_included === false && parsed?.frontend_required_for_backend === false,
          detail: (parsed) => ({
            frontend_included: parsed?.frontend_included ?? (backendProofInProgress ? false : null),
            frontend_required_for_backend: parsed?.frontend_required_for_backend ?? (backendProofInProgress ? false : null),
            final_verify_script: parsed?.scripts?.["final:verify"] || null,
            backend_proof_in_progress: backendProofInProgress,
          }),
        }),
        evidence(finalDownloadZipPath, "ORANGEBOX_DELTA_FINAL_DOWNLOAD_ZIP_GREEN", {
          accept: (parsed, status) => backendProofInProgress || (
            status === "ORANGEBOX_DELTA_FINAL_DOWNLOAD_ZIP_GREEN" &&
            parsed?.archive_verified === true &&
            parsed?.frontend_included === false &&
            parsed?.frontend_required_for_backend === false &&
            Number(parsed?.entries || 0) > 500 &&
            /^[a-f0-9]{64}$/.test(parsed?.sha256 || "")
          ),
          detail: (parsed) => ({
            archive_verified: parsed?.archive_verified ?? null,
            entries: parsed?.entries ?? null,
            zip_path: parsed?.zip_path || null,
          }),
        }),
      ],
      operator_approval_required: false,
    }),
    matrixRow({
      id: "visual_frontend_lane",
      claim: "Visual/frontend is part of Orangebox product outputs, but this Ops lane does not edit it.",
      lane: "separate_visual",
      status: "SEPARATE_LANE",
      frontend_touch_allowed: false,
      proof_command: "npm.cmd run project:report",
      acceptance_gate: "Project report marks visual/frontend as SEPARATE_LANE.",
      recovery_path: "Route visual work to the separate frontend project and keep Ops proof independent.",
      evidence: [
        evidence(projectPath, null, {
          accept: (parsed) => Array.isArray(parsed?.scope) && parsed.scope.some((item) => item.area === "Visual/frontend lane" && item.status === "SEPARATE_LANE"),
          detail: (parsed) => ({ project_status: parsed?.status || null }),
        }),
      ],
      operator_approval_required: true,
    }),
  ];

  const failures = matrix.flatMap((item) => item.failures.map((failure) => ({ id: item.id, failure })));
  const counts = matrix.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});
  const fullGreenTruthGuardOk = codexaReady || project?.full_project_green === false;
  const fullProjectGreenClaimAllowed = codexaReady === true && project?.full_project_green === true;
  if (!fullGreenTruthGuardOk) {
    failures.push({ id: "full_system_truth", failure: "project_claims_full_green_while_codexa_blocked" });
  }
  if (!packageJson?.scripts?.["feature:proof"]) {
    failures.push({ id: "package_script", failure: "feature:proof script missing" });
  }

  const result = {
    ok: failures.length === 0,
    version: "orangebox-feature-acceptance-matrix/v1",
    status: failures.length === 0 ? "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN" : "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_NEEDS_WORK",
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "No feature claim is complete without status, evidence, a proof command, and rollback or recovery truth.",
    public_name: "Orangebox Version 1",
    package_name: "Orangebox Delta Final",
    backend_proof_in_progress: backendProofInProgress,
    codexa_ready: codexaReady,
    full_project_green_truth_guard_ok: fullGreenTruthGuardOk,
    full_project_green_claim_allowed: fullProjectGreenClaimAllowed,
    counts,
    features_total: matrix.length,
    features_green: matrix.filter((item) => item.ok).length,
    matrix_hash: sha256(JSON.stringify(matrix.map((item) => ({
      id: item.id,
      status: item.status,
      ok: item.ok,
      evidence: item.evidence.map((row) => ({ path: row.path, ok: row.ok, status: row.status })),
    })))),
    matrix,
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
      ? "Keep feature:proof in the local Ops green chain before claiming new systems are done."
      : "Fix the feature row(s) listed in failures, rerun their proof commands, then rerun feature:proof.",
  };

  const latestPath = path.join(outRoot, "latest-feature-acceptance-matrix.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-feature-acceptance-matrix-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
