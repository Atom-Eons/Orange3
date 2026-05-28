export type ToolPermission = "read" | "write" | "execute" | "deploy";

export interface ToolCallInput {
  callId: string;
  toolName: string;
  args: unknown;
}

export interface ToolResult {
  callId: string;
  toolName: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  permissions: ToolPermission[];
  invoke: (input: ToolCallInput) => Promise<ToolResult>;
}
