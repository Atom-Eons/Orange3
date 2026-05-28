import type { ToolDefinition } from "../types/tools.js";

export const reportGenerateTool: ToolDefinition = {
  name: "report.generate",
  label: "Generate Report",
  description: "Generate a structured report from current workspace context.",
  permissions: ["read", "write"],
  async invoke(input) {
    return {
      callId: input.callId,
      toolName: input.toolName,
      ok: true,
      result: {
        title: "Workspace Report",
        sections: [
          { title: "Command", body: input.context.command },
          { title: "Current Mode", body: String(input.context.workspace.mode) },
          { title: "Context Panels", body: JSON.stringify(input.context.workspace.contextPanels ?? [], null, 2) },
        ],
      },
    };
  },
};
