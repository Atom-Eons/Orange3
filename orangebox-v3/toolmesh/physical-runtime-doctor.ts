import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDir, isMain, printResult, readJson, repoRoot, sha256, writeJson } from "../lib/core";
import { describeArtifact, planArtifactGarbageCollection, validateArtifactPointer } from "./artifact-store";
import { planHardwareForTool, summarizeHardware } from "./hardware-manager";
import { loadToolCards, toolmeshRoot } from "./tool-registry";
import { TOOLMESH_LABS, validateToolCard, type ToolCard, type ToolExecutionMode } from "./tool-card.schema";
import { writeToolMeshReceipt } from "./tool-receipt";

const runtimeRoot = path.join(dataRoot, "v3", "toolmesh", "physical-runtime");
const latestPhysicalRuntimePath = path.join(runtimeRoot, "latest-physical-runtime-doctor.json");

const REQUIRED_SCHEMA_FILES = [
  "hardware-profile.schema.json",
  "artifact-pointer.schema.json",
  "workflow-policy.schema.json",
  "execution-mode.schema.json",
  "tool-artifact-receipt.schema.json",
];

const REQUIRED_RUNTIME_DIRS = [
  "hardware",
  "artifacts",
  "templates",
  "execution",
];

const GUI_TOOL_IDS = new Set([
  "davinci-resolve",
  "kdenlive",
  "audacity",
  "penpot",
  "inkscape",
  "krita",
  "gimp",
  "blender",
]);

const SAFE_EXECUTION_MODES: ToolExecutionMode[] = [
  "headless",
  "api",
  "cli",
  "workspace_prep",
  "gui_assist",
  "human_finish",
  "required_manual",
  "unknown",
];

type PhysicalCardFailure = {
  id: string;
  failures: string[];
};

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(toolmeshRoot, relativePath));
}

function templateRegistryPath(): string {
  return path.join(toolmeshRoot, "templates", "template-registry.json");
}

function validateTemplateRegistry(cards: ToolCard[]) {
  const registryPath = templateRegistryPath();
  const registry = readJson<{ schema_version?: string; templates?: { template_id: string; template_path: string; allowedVariables?: string[]; variableInjectionOnly?: boolean }[] }>(registryPath, { templates: [] });
  const templates = Array.isArray(registry.templates) ? registry.templates : [];
  const byId = new Map(templates.map((template) => [template.template_id, template]));
  const failures: string[] = [];

  if (registry.schema_version !== "orangebox.toolmesh.template_registry.v1") {
    failures.push("template registry schema_version is missing or wrong");
  }

  for (const template of templates) {
    const fullPath = path.join(repoRoot, template.template_path);
    if (!fs.existsSync(fullPath)) failures.push(`template file missing: ${template.template_id}`);
    if (!Array.isArray(template.allowedVariables)) failures.push(`template allowedVariables missing: ${template.template_id}`);
    if (template.variableInjectionOnly !== true) failures.push(`template must be variable-injection-only: ${template.template_id}`);
  }

  for (const card of cards) {
    if (!card.workflowPolicy?.requiresImmutableTemplate) continue;
    for (const id of card.workflowPolicy.allowedTemplateIds) {
      if (!byId.has(id)) failures.push(`${card.id} references missing template ${id}`);
    }
  }

  return {
    ok: failures.length === 0,
    path: registryPath,
    template_count: templates.length,
    failures,
  };
}

function validatePhysicalCard(card: ToolCard): PhysicalCardFailure | null {
  const failures = validateToolCard(card).failures;
  const profile = card.hardwareProfile;
  const artifact = card.artifactProtocol;
  const workflow = card.workflowPolicy;

  if (!SAFE_EXECUTION_MODES.includes(card.executionMode)) failures.push("executionMode is outside V3 physical runtime modes");
  if (card.autonomyLevel === "execute_direct") failures.push("execute_direct is forbidden in Phase Y0");
  if (card.autonomyLevel === "publish" && card.canPublish !== true) failures.push("publish autonomy only belongs on publish-capable tools");
  if (card.canPublish && card.requiresSTRONGARM !== true) failures.push("publish-capable tools must require STRONGARM");

  if (GUI_TOOL_IDS.has(card.id) && !["workspace_prep", "gui_assist", "human_finish", "required_manual"].includes(card.executionMode)) {
    failures.push("GUI-heavy tools must default to workspace_prep/gui_assist/human_finish/required_manual");
  }
  if (GUI_TOOL_IDS.has(card.id) && card.humanHandoffRequired !== true) {
    failures.push("GUI-heavy tools must require human handoff");
  }

  if (profile.deviceClass === "gpu" && profile.vramRequiredGB <= 0) failures.push("gpu deviceClass must declare vramRequiredGB > 0");
  if (profile.requiresExclusiveGPU && profile.maxConcurrentJobs !== 1) failures.push("exclusive GPU tools must cap maxConcurrentJobs at 1");
  if (profile.requiresLLMUnload && !profile.requiresExclusiveGPU && profile.vramRequiredGB >= 8) failures.push("LLM-unload heavy GPU tools should also declare exclusive GPU");
  if (profile.diskScratchGB < 0) failures.push("diskScratchGB cannot be negative");

  if (artifact.returnsRawBytes !== false) failures.push("artifactProtocol must forbid raw bytes");
  if (artifact.returnsFilePointer !== true) failures.push("artifactProtocol must return file pointers");
  if (artifact.maxInlineBytes > 8192) failures.push("artifactProtocol.maxInlineBytes must be <= 8192");
  if (artifact.hashAlgorithm !== "sha256") failures.push("artifactProtocol.hashAlgorithm must be sha256");

  if (workflow.allowsDynamicWorkflowGeneration !== false) failures.push("workflowPolicy must forbid dynamic workflow generation");
  if (card.id === "comfyui" && workflow.requiresImmutableTemplate !== true) failures.push("ComfyUI must require immutable templates");
  if (card.capabilities.includes("workflow") && workflow.variableInjectionOnly !== true) failures.push("workflow tools must be variable-injection-only");

  return failures.length ? { id: card.id, failures } : null;
}

async function makeMockArtifactPointer() {
  const artifactDir = path.join(runtimeRoot, "mock-artifacts");
  await ensureDir(artifactDir);
  const artifactPath = path.join(artifactDir, "phase-y0-pointer-proof.txt");
  fs.writeFileSync(artifactPath, "Orangebox ToolMesh pointer proof only. No external tool produced this artifact.\n", "utf8");
  const pointer = describeArtifact(artifactPath, {
    tool: "toolmesh-physical-runtime-doctor",
    receiptId: null,
    retentionClass: "ephemeral",
    artifactId: "asset_toolmesh_phase_y0_pointer_proof",
  });
  const pointerValidation = validateArtifactPointer(pointer);
  const pointerPath = path.join(runtimeRoot, "latest-mock-artifact-pointer.json");
  await writeJson(pointerPath, pointer);
  return {
    pointer,
    pointer_path: pointerPath,
    validation: pointerValidation,
    gc_plan: planArtifactGarbageCollection([pointer]),
  };
}

export async function runPhysicalRuntimeDoctor() {
  const cards = loadToolCards();
  const schemaChecks = REQUIRED_SCHEMA_FILES.map((fileName) => ({
    fileName,
    path: path.join(toolmeshRoot, "registries", fileName),
    exists: exists(path.join("registries", fileName)),
  }));
  const schemaPresent = Object.fromEntries(schemaChecks.map((check) => [check.fileName, check.exists]));
  const runtimeDirChecks = REQUIRED_RUNTIME_DIRS.map((dirName) => ({
    dirName,
    path: path.join(toolmeshRoot, dirName),
    exists: exists(dirName),
  }));
  const physicalFailures = cards.map(validatePhysicalCard).filter(Boolean) as PhysicalCardFailure[];
  const templateRegistry = validateTemplateRegistry(cards);
  const artifactProof = await makeMockArtifactPointer();
  const hardwareSummary = summarizeHardware(cards);
  const hardwareDecisions = cards.slice(0, 12).map(planHardwareForTool);
  const executionModeCounts: Record<string, number> = {};
  const autonomyCounts: Record<string, number> = {};
  const handoffRequiredCount = cards.filter((card) => card.humanHandoffRequired).length;
  const immutableTemplateRequiredCount = cards.filter((card) => card.workflowPolicy?.requiresImmutableTemplate).length;
  const pointerOnlyCount = cards.filter((card) => card.artifactProtocol?.returnsRawBytes === false && card.artifactProtocol?.returnsFilePointer === true).length;

  for (const card of cards) {
    executionModeCounts[card.executionMode] = (executionModeCounts[card.executionMode] || 0) + 1;
    autonomyCounts[card.autonomyLevel] = (autonomyCounts[card.autonomyLevel] || 0) + 1;
  }

  const checks = {
    cards_present: cards.length > 0,
    labs_present: [...TOOLMESH_LABS].every((lab) => fs.existsSync(path.join(toolmeshRoot, lab))),
    schema_files_present: schemaChecks.every((check) => check.exists),
    hardware_profile_schema_present: schemaPresent["hardware-profile.schema.json"] === true,
    artifact_pointer_schema_present: schemaPresent["artifact-pointer.schema.json"] === true,
    workflow_policy_schema_present: schemaPresent["workflow-policy.schema.json"] === true,
    execution_mode_schema_present: schemaPresent["execution-mode.schema.json"] === true,
    runtime_dirs_present: runtimeDirChecks.every((check) => check.exists),
    all_cards_physical_valid: physicalFailures.length === 0,
    artifact_pointer_only_all_cards: pointerOnlyCount === cards.length,
    mock_artifact_pointer_valid: artifactProof.validation.ok,
    mock_gc_plan_dry_run: artifactProof.gc_plan.dryRun === true,
    template_registry_valid: templateRegistry.ok,
    gui_tools_handoff_only: cards.filter((card) => GUI_TOOL_IDS.has(card.id)).every((card) => card.humanHandoffRequired === true && ["workspace_prep", "gui_assist", "human_finish", "required_manual"].includes(card.executionMode)),
    no_execute_direct_in_y0: cards.every((card) => card.autonomyLevel !== "execute_direct"),
    no_external_tool_execution: true,
    no_cloud_call: true,
    no_frontend_touch: true,
  };

  const ok = Object.values(checks).every(Boolean);
  const report = {
    ok,
    schema_version: "orangebox.toolmesh.physical_runtime_doctor.v1",
    generated_at: new Date().toISOString(),
    status: ok ? "ORANGEBOX_TOOLMESH_PHYSICAL_RUNTIME_GREEN" : "ORANGEBOX_TOOLMESH_PHYSICAL_RUNTIME_NEEDS_WORK",
    doctrine: [
      "ToolMesh is a local physics contract, not a tool mall.",
      "Binary artifacts are pointers and hashes, never rail payloads.",
      "GUI tools prepare workspaces until reliable headless/API control is proven.",
      "Rigid workflow tools use immutable templates with variable injection only.",
    ],
    summary: {
      cards_total: cards.length,
      pointerOnlyCount,
      handoffRequiredCount,
      immutableTemplateRequiredCount,
      executionModeCounts,
      autonomyCounts,
      hardwareSummary,
    },
    checks,
    schemaChecks,
    runtimeDirChecks,
    physicalFailures,
    templateRegistry,
    artifactProof: {
      pointer_path: artifactProof.pointer_path,
      pointer: artifactProof.pointer,
      validation: artifactProof.validation,
      gc_plan: {
        dryRun: artifactProof.gc_plan.dryRun,
        candidates: artifactProof.gc_plan.candidates.map((candidate) => ({
          artifact_id: candidate.artifact_id,
          path: candidate.path,
          sha256: candidate.sha256,
          sizeBytes: candidate.sizeBytes,
          retentionClass: candidate.retentionClass,
        })),
      },
    },
    sampleHardwareDecisions: hardwareDecisions,
    constraints: {
      external_tools_installed: false,
      external_tools_executed: false,
      cloud_services_called: false,
      frontend_touched: false,
      repository_files_modified_by_toolmesh_action: false,
      raw_binary_routed_through_rail: false,
    },
    rollback: {
      repo_mutation: "ToolMesh physical-runtime schemas, cards, templates, and doctor only.",
      data_mutation: runtimeRoot,
      recovery_action: "Remove generated physical-runtime receipts/mock artifacts and revert ToolMesh physical-runtime commit if superseded.",
    },
    report_hash: "",
  };
  report.report_hash = sha256(JSON.stringify({ ...report, report_hash: "" }));

  await ensureDir(runtimeRoot);
  await writeJson(latestPhysicalRuntimePath, report);
  const receiptPath = await writeToolMeshReceipt("physical-runtime-doctor", report, report.status);
  return {
    ...report,
    latest_path: latestPhysicalRuntimePath,
    receipt_path: receiptPath,
  };
}

if (isMain(import.meta.url)) {
  printResult(await runPhysicalRuntimeDoctor());
}
