import type { ToolCallInput, ToolDefinition, ToolResult } from "../types/tools";
import { mockTools } from "./mockTools";

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor(initialTools: ToolDefinition[]) {
    for (const tool of initialTools) this.register(tool);
  }

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  list() {
    return Array.from(this.tools.values());
  }

  get(name: string) {
    return this.tools.get(name);
  }

  async invoke(input: ToolCallInput): Promise<ToolResult> {
    const tool = this.tools.get(input.toolName);
    if (!tool) {
      return { callId: input.callId, toolName: input.toolName, ok: false, error: `Tool not found: ${input.toolName}` };
    }
    return tool.invoke(input);
  }
}

export const toolRegistry = new ToolRegistry(mockTools);
