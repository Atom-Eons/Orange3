import type { ToolDefinition } from "../types/tools.js";

export const workspaceSearchTool: ToolDefinition = {
  name: "workspace.search",
  label: "Search Workspace",
  description: "Search current workspace snapshot, panels, timeline, metrics, and recent context.",
  permissions: ["read"],
  async invoke(input) {
    const query = typeof input.args === "object" && input.args && "query" in input.args ? String((input.args as { query: unknown }).query) : "";
    const matches: string[] = [];
    const serialized = JSON.stringify(input.context.workspace).toLowerCase();
    if (query && serialized.includes(query.toLowerCase())) matches.push("Workspace snapshot contains matching signal.");
    if (query.toLowerCase().includes("latency")) {
      matches.push("Realtime Insights: latency anomaly", "Data Stream: possible gateway saturation", "System Health: resource pressure");
    }
    return { callId: input.callId, toolName: input.toolName, ok: true, result: { query, matches } };
  },
};
