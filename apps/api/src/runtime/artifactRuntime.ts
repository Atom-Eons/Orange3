import type { PanelId } from "../types/events.js";
import { createId } from "./id.js";

export function maybeCreateArtifact(command: string, response: string, relatedPanelIds: PanelId[]) {
  const lower = command.toLowerCase();
  if (!lower.includes("generate") && !lower.includes("report") && !lower.includes("export")) return undefined;
  const kind = lower.includes("deploy") ? "deployment-plan" : lower.includes("report") ? "report" : "analysis";
  const cleaned = command.replace(/^\/[a-zA-Z-]+\s*/, "").trim();
  return {
    id: createId("artifact"),
    kind,
    title: cleaned ? (cleaned.length > 72 ? `${cleaned.slice(0, 72)}...` : cleaned) : "Generated Artifact",
    content: response,
    relatedPanelIds,
  };
}
