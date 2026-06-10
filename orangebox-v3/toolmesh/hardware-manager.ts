import type { ToolCard } from "./tool-card.schema";

export type HardwareDecision = {
  toolId: string;
  allowed: boolean;
  concurrencyLock: string;
  requiresLLMUnload: boolean;
  reason: string;
};

export function planHardwareForTool(card: ToolCard): HardwareDecision {
  const profile = card.hardwareProfile;
  const heavy = profile.vramRequiredGB >= 8 || profile.requiresLLMUnload;
  return {
    toolId: card.id,
    allowed: true,
    concurrencyLock: profile.concurrencyLock,
    requiresLLMUnload: profile.requiresLLMUnload,
    reason: heavy
      ? "Heavy tool must acquire its concurrency lock and unload local LLM lanes before execution."
      : "Light tool can run under normal ToolMesh gating.",
  };
}

export function summarizeHardware(cards: ToolCard[]) {
  const lockCounts: Record<string, number> = {};
  let llmUnloadCount = 0;
  let maxVramRequiredGB = 0;
  for (const card of cards) {
    lockCounts[card.hardwareProfile.concurrencyLock] = (lockCounts[card.hardwareProfile.concurrencyLock] || 0) + 1;
    if (card.hardwareProfile.requiresLLMUnload) llmUnloadCount += 1;
    maxVramRequiredGB = Math.max(maxVramRequiredGB, card.hardwareProfile.vramRequiredGB);
  }
  return { lockCounts, llmUnloadCount, maxVramRequiredGB };
}
