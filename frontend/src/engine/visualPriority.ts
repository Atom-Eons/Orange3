import type { PanelId, SystemMode } from "../types/app";

export type VisualPriority = "primary" | "secondary" | "ambient" | "muted";

export function getPanelVisualPriority(input: {
  panelId: PanelId;
  mode: SystemMode;
  focusPanelId?: PanelId;
  activeCausalPanelIds: PanelId[];
  contextPanelIds: PanelId[];
  connectedPanelIds: PanelId[];
}): VisualPriority {
  if (input.focusPanelId === input.panelId) return "primary";
  if (input.mode === "alert" && input.activeCausalPanelIds.includes(input.panelId)) return "primary";
  if (input.contextPanelIds.includes(input.panelId)) return "secondary";
  if (input.connectedPanelIds.includes(input.panelId)) return "secondary";
  if (input.focusPanelId || input.mode === "alert") return "muted";
  return "ambient";
}

export function priorityOpacity(priority: VisualPriority) {
  if (priority === "primary") return 1;
  if (priority === "secondary") return 0.78;
  if (priority === "ambient") return 0.62;
  return 0.28;
}
