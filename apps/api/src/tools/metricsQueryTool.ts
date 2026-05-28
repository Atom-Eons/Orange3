import type { ToolDefinition } from "../types/tools.js";
import { prisma } from "../db/client.js";

export const metricsQueryTool: ToolDefinition = {
  name: "metrics.query",
  label: "Query Metrics",
  description: "Query recent metric snapshots for the active workspace.",
  permissions: ["read"],
  async invoke(input) {
    if (!input.context.workspaceId) return { callId: input.callId, toolName: input.toolName, ok: true, result: { snapshots: [] } };
    const snapshots = await prisma.metricSnapshot.findMany({ where: { workspaceId: input.context.workspaceId }, orderBy: { timestamp: "desc" }, take: 30 }).catch(() => []);
    return { callId: input.callId, toolName: input.toolName, ok: true, result: { snapshots } };
  },
};
