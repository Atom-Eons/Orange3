import type { PanelId, SystemMode } from "./app";

export type CommandKind = "analyze" | "generate" | "debug" | "simulate" | "compare" | "timeline" | "export" | "freeform";

export interface ParsedCommand {
  raw: string;
  kind: CommandKind;
  args: string;
  target?: string;
  inferredMode: SystemMode;
  relatedPanelIds: PanelId[];
  requiresPlan: boolean;
  mayUseTools: boolean;
}
