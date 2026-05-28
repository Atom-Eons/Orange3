import type { StreamCausalPath } from "../types/events.js";
import type { AgentContext } from "./contextBuilder.js";

export function maybeBuildCausalPath(command: string, _context: AgentContext): StreamCausalPath | undefined {
  const lower = command.toLowerCase();
  if (!lower.includes("latency") && !lower.includes("gateway") && !lower.includes("slow")) return undefined;
  return {
    id: `latency-path-${Date.now()}`,
    title: "High latency in us-east-1",
    confidence: 0.89,
    activeNodeId: "api-gateway",
    nodes: [
      { id: "high-latency", label: "High Latency Detected", panelId: "realtime-insights", severity: "warning", confidence: 0.93 },
      { id: "api-gateway", label: "API Gateway Saturation", panelId: "data-stream", severity: "warning", confidence: 0.88 },
      { id: "model-v24", label: "Model v2.4 Pressure", panelId: "model-performance", severity: "info", confidence: 0.81 },
      { id: "resource-spike", label: "Resource Spike", panelId: "system-health", severity: "critical", confidence: 0.86 },
      { id: "user-impact", label: "Slow Responses", panelId: "activity-feed", severity: "critical", confidence: 0.9 },
    ],
    edges: [
      { from: "high-latency", to: "api-gateway", weight: 0.9 },
      { from: "api-gateway", to: "model-v24", weight: 0.7 },
      { from: "model-v24", to: "resource-spike", weight: 0.76 },
      { from: "resource-spike", to: "user-impact", weight: 0.92 },
    ],
  };
}
