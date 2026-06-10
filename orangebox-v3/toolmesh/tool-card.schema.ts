export const TOOL_CARD_REQUIRED_FIELDS = [
  "id",
  "name",
  "category",
  "cost",
  "local",
  "openSource",
  "cloud",
  "orangeboxRole",
  "capabilities",
  "input",
  "output",
  "canTouchRepo",
  "canPublish",
  "requiresReceipt",
  "requiresSTRONGARM",
  "doctor",
  "promotionGate",
  "privacyLevel",
  "failureModes",
  "rollback",
  "hardwareProfile",
  "artifactProtocol",
  "workflowPolicy",
  "executionMode",
  "autonomyLevel",
  "humanHandoffRequired",
  "handoffArtifactTypes",
  "artifactPolicy",
  "templatePolicy",
] as const;

export const TOOLMESH_LABS = [
  "image-lab",
  "video-lab",
  "audio-lab",
  "design-lab",
  "coding-lab",
  "automation-lab",
  "analytics-lab",
  "public-agent-lab",
  "observability-lab",
  "security-lab",
  "releaseops-lab",
  "alpha-watchlist",
] as const;

export const REQUIRED_FIRST_BATCH_TOOL_IDS = [
  "comfyui",
  "flux",
  "qwen-image",
  "qwen-image-layered",
  "sdxl",
  "wan",
  "ltx",
  "davinci-resolve",
  "kdenlive",
  "obs",
  "whisper",
  "audacity",
  "demucs",
  "uvr",
  "penpot",
  "inkscape",
  "krita",
  "gimp",
  "blender",
  "aider",
  "continue",
  "openhands",
  "goose",
  "n8n",
  "node-red",
  "windmill",
  "matomo",
  "plausible",
  "umami",
  "posthog",
  "metabase",
  "langfuse",
  "phoenix",
  "semgrep",
  "trivy",
  "gitleaks",
] as const;

export type ToolMeshLab = (typeof TOOLMESH_LABS)[number];

export type ToolExecutionMode =
  | "headless"
  | "api"
  | "cli"
  | "workspace_prep"
  | "gui_assist"
  | "human_finish"
  | "required_manual"
  | "unknown";

export type ToolAutonomyLevel =
  | "none"
  | "prepare"
  | "suggest"
  | "execute_in_ghost"
  | "execute_direct"
  | "publish";

export type ToolHardwareProfile = {
  deviceClass: "cpu" | "gpu" | "mixed" | "external" | "unknown";
  vramRequiredGB: number;
  ramRequiredGB: number;
  diskScratchGB: number;
  preferredRuntime: "ollama" | "llama.cpp" | "comfyui" | "python" | "bun" | "docker" | "native-gui" | "cli" | "unknown";
  requiresLLMUnload: boolean;
  requiresExclusiveGPU: boolean;
  maxConcurrentJobs: number;
  estimatedRuntimeClass: "instant" | "short" | "medium" | "long" | "overnight";
  oomRisk: "low" | "medium" | "high" | "unknown";
  concurrencyLock: string;
  notes?: string;
};

export type ToolArtifactProtocol = {
  returnsRawBytes: false;
  returnsFilePointer: true;
  maxInlineBytes: number;
  artifactVaultRequired: boolean;
  hashAlgorithm: "sha256";
  metadataSidecar: boolean;
  garbageCollectable: boolean;
  retentionClass: "ephemeral" | "session" | "project" | "campaign" | "permanent";
};

export type ToolWorkflowPolicy = {
  allowsDynamicWorkflowGeneration: boolean;
  requiresImmutableTemplate: boolean;
  templateRegistry: string | null;
  allowedTemplateIds: string[];
  variableInjectionOnly: boolean;
};

export type ToolCard = {
  id: string;
  name: string;
  category: string;
  lab: ToolMeshLab;
  phase: string;
  status: "registry_only" | "candidate" | "installed" | "promoted" | "blocked";
  cost: string;
  local: boolean;
  openSource: boolean;
  cloud: boolean;
  orangeboxRole: string;
  capabilities: string[];
  input: string[];
  output: string[];
  canTouchRepo: boolean;
  canPublish: boolean;
  requiresReceipt: boolean;
  requiresSTRONGARM: boolean;
  doctor: string;
  promotionGate: string[];
  privacyLevel: "local" | "local_first" | "cloud_warrant" | "blocked";
  failureModes: string[];
  rollback: string;
  hardwareProfile: ToolHardwareProfile;
  artifactProtocol: ToolArtifactProtocol;
  workflowPolicy: ToolWorkflowPolicy;
  executionMode: ToolExecutionMode;
  autonomyLevel: ToolAutonomyLevel;
  humanHandoffRequired: boolean;
  handoffArtifactTypes: string[];
  artifactPolicy: {
    returnsPointersOnly: boolean;
    maxInlineBytes: number;
    vaultRequired: boolean;
    gcEligible: boolean;
  };
  templatePolicy: {
    immutableTemplateRequired: boolean;
    allowedVariables: string[];
    templateIds: string[];
  };
  binaryNames?: string[];
  notes?: string;
};

export type ToolCardValidation = {
  ok: boolean;
  id: string;
  missingFields: string[];
  failures: string[];
};

export function validateToolCard(card: Partial<ToolCard>): ToolCardValidation {
  const missingFields = TOOL_CARD_REQUIRED_FIELDS.filter((field) => !(field in card));
  const failures: string[] = [];

  if (card.id && !/^[a-z0-9][a-z0-9-]*$/.test(card.id)) {
    failures.push("id must be lowercase kebab-case");
  }
  if (card.lab && !(TOOLMESH_LABS as readonly string[]).includes(card.lab)) {
    failures.push(`lab ${card.lab} is not registered`);
  }
  if (card.capabilities && !Array.isArray(card.capabilities)) {
    failures.push("capabilities must be an array");
  }
  if (card.input && !Array.isArray(card.input)) {
    failures.push("input must be an array");
  }
  if (card.output && !Array.isArray(card.output)) {
    failures.push("output must be an array");
  }
  if (card.promotionGate && !Array.isArray(card.promotionGate)) {
    failures.push("promotionGate must be an array");
  }
  if (card.failureModes && !Array.isArray(card.failureModes)) {
    failures.push("failureModes must be an array");
  }
  if (card.hardwareProfile) {
    const profile = card.hardwareProfile as ToolCard["hardwareProfile"];
    if (!["cpu", "gpu", "mixed", "external", "unknown"].includes(String(profile.deviceClass))) failures.push("hardwareProfile.deviceClass is invalid");
    if (typeof profile.vramRequiredGB !== "number") failures.push("hardwareProfile.vramRequiredGB must be a number");
    if (typeof profile.ramRequiredGB !== "number") failures.push("hardwareProfile.ramRequiredGB must be a number");
    if (typeof profile.diskScratchGB !== "number") failures.push("hardwareProfile.diskScratchGB must be a number");
    if (!["ollama", "llama.cpp", "comfyui", "python", "bun", "docker", "native-gui", "cli", "unknown"].includes(String(profile.preferredRuntime))) failures.push("hardwareProfile.preferredRuntime is invalid");
    if (typeof profile.requiresLLMUnload !== "boolean") failures.push("hardwareProfile.requiresLLMUnload must be boolean");
    if (typeof profile.requiresExclusiveGPU !== "boolean") failures.push("hardwareProfile.requiresExclusiveGPU must be boolean");
    if (typeof profile.maxConcurrentJobs !== "number" || profile.maxConcurrentJobs < 1) failures.push("hardwareProfile.maxConcurrentJobs must be a positive number");
    if (!["instant", "short", "medium", "long", "overnight"].includes(String(profile.estimatedRuntimeClass))) failures.push("hardwareProfile.estimatedRuntimeClass is invalid");
    if (!["low", "medium", "high", "unknown"].includes(String(profile.oomRisk))) failures.push("hardwareProfile.oomRisk is invalid");
    if (!profile.concurrencyLock) failures.push("hardwareProfile.concurrencyLock is required");
  }
  if (card.artifactProtocol) {
    const protocol = card.artifactProtocol as ToolCard["artifactProtocol"];
    if (protocol.returnsRawBytes !== false) failures.push("artifactProtocol.returnsRawBytes must be false");
    if (protocol.returnsFilePointer !== true) failures.push("artifactProtocol.returnsFilePointer must be true");
    if (typeof protocol.maxInlineBytes !== "number" || protocol.maxInlineBytes > 8192) failures.push("artifactProtocol.maxInlineBytes must be <= 8192");
    if (typeof protocol.artifactVaultRequired !== "boolean") failures.push("artifactProtocol.artifactVaultRequired must be boolean");
    if (protocol.hashAlgorithm !== "sha256") failures.push("artifactProtocol.hashAlgorithm must be sha256");
    if (typeof protocol.metadataSidecar !== "boolean") failures.push("artifactProtocol.metadataSidecar must be boolean");
    if (typeof protocol.garbageCollectable !== "boolean") failures.push("artifactProtocol.garbageCollectable must be boolean");
    if (!["ephemeral", "session", "project", "campaign", "permanent"].includes(String(protocol.retentionClass))) failures.push("artifactProtocol.retentionClass is invalid");
  }
  if (card.workflowPolicy) {
    const policy = card.workflowPolicy as ToolCard["workflowPolicy"];
    if (policy.allowsDynamicWorkflowGeneration !== false) failures.push("workflowPolicy.allowsDynamicWorkflowGeneration must be false");
    if (typeof policy.requiresImmutableTemplate !== "boolean") failures.push("workflowPolicy.requiresImmutableTemplate must be boolean");
    if (!Array.isArray(policy.allowedTemplateIds)) failures.push("workflowPolicy.allowedTemplateIds must be an array");
    if (typeof policy.variableInjectionOnly !== "boolean") failures.push("workflowPolicy.variableInjectionOnly must be boolean");
  }
  if (card.executionMode && !["headless", "api", "cli", "workspace_prep", "gui_assist", "human_finish", "required_manual", "unknown"].includes(card.executionMode)) {
    failures.push("executionMode must be a V3 physical runtime mode");
  }
  if (card.autonomyLevel && !["none", "prepare", "suggest", "execute_in_ghost", "execute_direct", "publish"].includes(card.autonomyLevel)) {
    failures.push("autonomyLevel must be none, prepare, suggest, execute_in_ghost, execute_direct, or publish");
  }
  if ("humanHandoffRequired" in card && typeof card.humanHandoffRequired !== "boolean") {
    failures.push("humanHandoffRequired must be boolean");
  }
  if (card.handoffArtifactTypes && !Array.isArray(card.handoffArtifactTypes)) {
    failures.push("handoffArtifactTypes must be an array");
  }
  if (card.artifactPolicy) {
    const policy = card.artifactPolicy as ToolCard["artifactPolicy"];
    if (policy.returnsPointersOnly !== true) failures.push("artifactPolicy.returnsPointersOnly must be true");
    if (policy.maxInlineBytes !== 0) failures.push("artifactPolicy.maxInlineBytes must be 0");
    if (typeof policy.vaultRequired !== "boolean") failures.push("artifactPolicy.vaultRequired must be boolean");
    if (typeof policy.gcEligible !== "boolean") failures.push("artifactPolicy.gcEligible must be boolean");
  }
  if (card.templatePolicy) {
    const policy = card.templatePolicy as ToolCard["templatePolicy"];
    if (typeof policy.immutableTemplateRequired !== "boolean") failures.push("templatePolicy.immutableTemplateRequired must be boolean");
    if (!Array.isArray(policy.allowedVariables)) failures.push("templatePolicy.allowedVariables must be an array");
    if (!Array.isArray(policy.templateIds)) failures.push("templatePolicy.templateIds must be an array");
  }
  if (card.id === "comfyui" && card.templatePolicy?.immutableTemplateRequired !== true) {
    failures.push("ComfyUI must require immutable templates");
  }
  if (card.id === "comfyui" && card.workflowPolicy?.requiresImmutableTemplate !== true) {
    failures.push("ComfyUI workflowPolicy must require immutable templates");
  }
  if (card.capabilities?.includes("workflow") && card.workflowPolicy?.allowsDynamicWorkflowGeneration !== false) {
    failures.push("workflow-capable tools must reject dynamic workflow generation");
  }
  if (["workspace_prep", "gui_assist", "human_finish", "required_manual"].includes(String(card.executionMode)) && card.humanHandoffRequired !== true) {
    failures.push("GUI/manual execution modes must require human handoff");
  }
  if (card.canPublish && !card.requiresReceipt) {
    failures.push("publishing tools must require receipts");
  }
  if (card.canTouchRepo && !card.requiresSTRONGARM) {
    failures.push("repo-touching tools must require STRONGARM");
  }
  if (card.cloud && card.privacyLevel !== "cloud_warrant") {
    failures.push("cloud tools must use cloud_warrant privacy");
  }

  return {
    ok: missingFields.length === 0 && failures.length === 0,
    id: card.id ?? "unknown",
    missingFields,
    failures,
  };
}

export function estimateCardRisk(card: ToolCard): number {
  let risk = 0.1;
  if (card.cloud) risk += 0.25;
  if (card.canTouchRepo) risk += 0.25;
  if (card.canPublish) risk += 0.25;
  if (card.requiresSTRONGARM) risk += 0.1;
  if (card.privacyLevel === "blocked") risk += 0.3;
  if (card.hardwareProfile.requiresLLMUnload) risk += 0.1;
  if (card.executionMode === "workspace_prep") risk += 0.05;
  return Math.min(1, Math.round(risk * 100) / 100);
}
