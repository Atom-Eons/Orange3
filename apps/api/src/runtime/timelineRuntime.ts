import type { PanelId, Severity } from "../types/events.js";
import { createId } from "./id.js";

export function createTimelineEvent(input: {
  title: string;
  description?: string;
  type: string;
  severity?: Severity;
  relatedPanelIds?: PanelId[];
}) {
  return {
    id: createId("timeline"),
    timestamp: Date.now(),
    timeLabel: "Now",
    title: input.title,
    description: input.description,
    type: input.type,
    severity: input.severity ?? "info",
    relatedPanelIds: input.relatedPanelIds ?? [],
  };
}
