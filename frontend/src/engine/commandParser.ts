import type { ParsedCommand } from "../types/commands";
import type { PanelId, SystemMode } from "../types/app";

function inferKind(raw: string): ParsedCommand["kind"] {
  const lower = raw.toLowerCase().trim();
  if (lower.startsWith("/analyze")) return "analyze";
  if (lower.startsWith("/generate")) return "generate";
  if (lower.startsWith("/debug")) return "debug";
  if (lower.startsWith("/simulate")) return "simulate";
  if (lower.startsWith("/compare")) return "compare";
  if (lower.startsWith("/timeline")) return "timeline";
  if (lower.startsWith("/export")) return "export";
  return "freeform";
}

function inferMode(kind: ParsedCommand["kind"], raw: string): SystemMode {
  const lower = raw.toLowerCase();
  if (lower.includes("latency") || lower.includes("alert") || lower.includes("slow")) return "alert";
  if (kind === "generate" || kind === "export") return "generating";
  if (kind === "analyze") return "analyzing";
  if (kind === "debug" || kind === "simulate") return "thinking";
  if (kind === "compare" || kind === "timeline") return "reviewing";
  if (lower.includes("deploy") || lower.includes("release")) return "deploying";
  return "thinking";
}

function inferPanels(raw: string): PanelId[] {
  const lower = raw.toLowerCase();
  if (lower.includes("latency") || lower.includes("gateway") || lower.includes("slow")) {
    return ["realtime-insights", "data-stream", "model-performance", "system-health", "causality", "smart-suggestions"];
  }
  if (lower.includes("pipeline") || lower.includes("deploy") || lower.includes("release")) {
    return ["pipeline-orchestrator", "activity-feed", "model-performance", "memory-ribbon"];
  }
  if (lower.includes("model") || lower.includes("accuracy") || lower.includes("drift")) {
    return ["model-performance", "data-stream", "realtime-insights", "smart-suggestions"];
  }
  if (lower.includes("memory") || lower.includes("timeline") || lower.includes("history")) {
    return ["memory-ribbon", "activity-feed", "causality"];
  }
  return ["project-nexus", "system-health", "realtime-insights"];
}

export function parseCommand(raw: string): ParsedCommand {
  const trimmed = raw.trim();
  const kind = inferKind(trimmed);
  return {
    raw: trimmed,
    kind,
    args: trimmed.replace(/^\/[a-zA-Z-]+\s*/, ""),
    inferredMode: inferMode(kind, trimmed),
    relatedPanelIds: inferPanels(trimmed),
    requiresPlan: kind !== "freeform" || trimmed.length > 20,
    mayUseTools: kind !== "freeform" || /file|web|deploy|export|simulate|analyze/i.test(trimmed),
  };
}
