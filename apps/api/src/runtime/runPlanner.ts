import type { PanelId, StreamPlan, SystemMode } from "../types/events.js";
import type { AgentContext } from "./contextBuilder.js";
import { createId } from "./id.js";

export interface BuiltRunPlan {
  mode: SystemMode;
  relatedPanelIds: PanelId[];
  plan: StreamPlan;
}

export function buildRunPlan(command: string, _context: AgentContext): BuiltRunPlan {
  const lower = command.toLowerCase();
  const relatedPanelIds = inferPanels(lower);
  const mode = inferMode(lower);
  return {
    mode,
    relatedPanelIds,
    plan: {
      id: createId("plan"),
      userCommand: command,
      summary: summarizePlan(lower),
      risk: lower.includes("deploy") || lower.includes("latency") ? "medium" : "low",
      relatedPanelIds,
      steps: [
        { id: createId("step"), label: "Resolve intent", description: "Classify command and bind relevant workspace context.", status: "pending" },
        { id: createId("step"), label: "Gather context", description: "Read current panels, memory, metrics, and timeline tail.", status: "pending" },
        { id: createId("step"), label: lower.includes("latency") ? "Trace causality" : "Run agent reasoning", status: "pending" },
        { id: createId("step"), label: "Stream result", description: "Return response and update workspace state.", status: "pending" },
      ],
    },
  };
}

function inferMode(lower: string): SystemMode {
  if (lower.includes("latency") || lower.includes("alert") || lower.includes("slow")) return "alert";
  if (lower.startsWith("/generate") || lower.includes("generate") || lower.includes("create")) return "generating";
  if (lower.startsWith("/analyze")) return "analyzing";
  if (lower.startsWith("/debug") || lower.startsWith("/simulate")) return "thinking";
  if (lower.startsWith("/compare") || lower.startsWith("/timeline")) return "reviewing";
  if (lower.includes("deploy") || lower.includes("release")) return "deploying";
  return "thinking";
}

function inferPanels(lower: string): PanelId[] {
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

function summarizePlan(lower: string) {
  if (lower.includes("latency")) return "Inspect live latency signal, generate causal path, compare deployment and resource pressure, and recommend remediation.";
  if (lower.includes("deploy")) return "Prepare deployment context, inspect pipeline health, simulate risk, and produce release-safe next actions.";
  if (lower.includes("generate") || lower.includes("create")) return "Gather workspace context, generate the requested artifact, and attach it to memory/canvas.";
  return "Analyze workspace context and stream an actionable operational response.";
}
