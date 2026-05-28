import type { ToolDefinition } from "../types/tools";

export const mockTools: ToolDefinition[] = [
  {
    name: "workspace.search",
    label: "Search Workspace",
    description: "Search panels, memory, metrics, and activity.",
    permissions: ["read"],
    async invoke(input) {
      return {
        callId: input.callId,
        toolName: input.toolName,
        ok: true,
        result: {
          matches: ["Realtime Insights: latency anomaly", "Data Stream: elevated gateway throughput", "System Health: network pressure"],
        },
      };
    },
  },
  {
    name: "report.generate",
    label: "Generate Report",
    description: "Generate a structured workspace report.",
    permissions: ["read", "write"],
    async invoke(input) {
      return {
        callId: input.callId,
        toolName: input.toolName,
        ok: true,
        result: { title: "Workspace Report", summary: "Mock report generated from active context." },
      };
    },
  },
  {
    name: "deployment.simulate",
    label: "Simulate Deployment",
    description: "Simulate deployment effect before execution.",
    permissions: ["read", "execute"],
    async invoke(input) {
      return {
        callId: input.callId,
        toolName: input.toolName,
        ok: true,
        result: { risk: "medium", estimatedLatencyChange: "-18%", recommended: true },
      };
    },
  },
];
