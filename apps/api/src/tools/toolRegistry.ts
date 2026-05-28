import type { ToolCallInput, ToolDefinition, ToolResult } from "../types/tools.js";
import { workspaceSearchTool } from "./workspaceSearchTool.js";
import { reportGenerateTool } from "./reportGenerateTool.js";
import { deploymentSimulateTool } from "./deploymentSimulateTool.js";
import { artifactWriteTool } from "./artifactWriteTool.js";
import { memorySearchTool } from "./memorySearchTool.js";
import { metricsQueryTool } from "./metricsQueryTool.js";
import { auditToolCall } from "../security/audit.js";

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor(tools: ToolDefinition[]) {
    for (const tool of tools) this.register(tool);
  }

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({ name: tool.name, label: tool.label, description: tool.description, permissions: tool.permissions }));
  }

  async invoke(input: ToolCallInput): Promise<ToolResult> {
    const tool = this.tools.get(input.toolName);
    let result: ToolResult;
    if (!tool) {
      result = { callId: input.callId, toolName: input.toolName, ok: false, error: `Tool not found: ${input.toolName}` };
    } else {
      try {
        result = await tool.invoke(input);
      } catch (error) {
        result = { callId: input.callId, toolName: input.toolName, ok: false, error: error instanceof Error ? error.message : "Tool execution failed" };
      }
    }
    await auditToolCall({ workspaceId: input.context.workspaceId, sessionId: input.context.sessionId, toolName: input.toolName, args: input.args, ok: result.ok, result: result.result, error: result.error }).catch(() => undefined);
    return result;
  }
}

export const toolRegistry = new ToolRegistry([workspaceSearchTool, reportGenerateTool, deploymentSimulateTool, artifactWriteTool, memorySearchTool, metricsQueryTool]);
