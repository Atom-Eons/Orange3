import type { ToolCard } from "./tool-card.schema";

export type HardwareDecision = {
  toolId: string;
  allowed: boolean;
  concurrencyLock: string;
  requiresLLMUnload: boolean;
  requiresExclusiveGPU: boolean;
  vramRequiredGB: number;
  ramRequiredGB: number;
  diskScratchGB: number;
  preferredRuntime: string;
  estimatedRuntimeClass: string;
  oomRisk: string;
  reason: string;
  preflightSteps: string[];
};

export function planHardwareForTool(card: ToolCard): HardwareDecision {
  const profile = card.hardwareProfile;
  const heavy = profile.vramRequiredGB >= 8 || profile.requiresLLMUnload || profile.requiresExclusiveGPU;
  const preflightSteps = [
    `acquire:${profile.concurrencyLock}`,
    profile.requiresLLMUnload ? "pause-or-unload-local-llm-lanes" : "keep-local-llm-lanes",
    profile.requiresExclusiveGPU ? "claim-exclusive-gpu-window" : "allow-shared-runtime-window",
    "write-pre-execution-receipt",
    "return-artifact-pointers-only",
  ];
  return {
    toolId: card.id,
    allowed: true,
    concurrencyLock: profile.concurrencyLock,
    requiresLLMUnload: profile.requiresLLMUnload,
    requiresExclusiveGPU: profile.requiresExclusiveGPU,
    vramRequiredGB: profile.vramRequiredGB,
    ramRequiredGB: profile.ramRequiredGB,
    diskScratchGB: profile.diskScratchGB,
    preferredRuntime: profile.preferredRuntime,
    estimatedRuntimeClass: profile.estimatedRuntimeClass,
    oomRisk: profile.oomRisk,
    reason: heavy
      ? "Heavy tool must acquire its lock, protect model residency, and return artifact pointers only before execution can be promoted."
      : "Light tool can run under normal ToolMesh gating.",
    preflightSteps,
  };
}

export function summarizeHardware(cards: ToolCard[]) {
  const lockCounts: Record<string, number> = {};
  let llmUnloadCount = 0;
  let exclusiveGpuCount = 0;
  let maxVramRequiredGB = 0;
  let maxRamRequiredGB = 0;
  let totalScratchGB = 0;
  const runtimeCounts: Record<string, number> = {};
  const oomRiskCounts: Record<string, number> = {};
  for (const card of cards) {
    lockCounts[card.hardwareProfile.concurrencyLock] = (lockCounts[card.hardwareProfile.concurrencyLock] || 0) + 1;
    if (card.hardwareProfile.requiresLLMUnload) llmUnloadCount += 1;
    if (card.hardwareProfile.requiresExclusiveGPU) exclusiveGpuCount += 1;
    maxVramRequiredGB = Math.max(maxVramRequiredGB, card.hardwareProfile.vramRequiredGB);
    maxRamRequiredGB = Math.max(maxRamRequiredGB, card.hardwareProfile.ramRequiredGB);
    totalScratchGB += card.hardwareProfile.diskScratchGB;
    runtimeCounts[card.hardwareProfile.preferredRuntime] = (runtimeCounts[card.hardwareProfile.preferredRuntime] || 0) + 1;
    oomRiskCounts[card.hardwareProfile.oomRisk] = (oomRiskCounts[card.hardwareProfile.oomRisk] || 0) + 1;
  }
  return {
    lockCounts,
    llmUnloadCount,
    exclusiveGpuCount,
    maxVramRequiredGB,
    maxRamRequiredGB,
    totalDeclaredScratchGB: totalScratchGB,
    runtimeCounts,
    oomRiskCounts,
  };
}
