import type { PanelId } from "./events.js";

export interface ChatMessageInput {
  id?: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt?: number;
}

export interface WorkspacePanelSnapshot {
  id: PanelId;
  title: string;
  kind: string;
  severity?: string;
  expanded?: boolean;
  connectedTo?: PanelId[];
}

export interface WorkspaceSnapshot {
  mode: string;
  workspaceView: string;
  focusPanelId?: PanelId;
  selectedModel: string;
  selectedMode: string;
  selectedTools: string[];
  contextPanels: PanelId[];
  metrics?: Record<string, unknown>;
  activeCausalPath?: unknown;
  panels: WorkspacePanelSnapshot[];
  agents?: unknown[];
  activeTasks?: unknown[];
  timelineTail?: unknown[];
  metricTail?: unknown[];
  conversationTail?: ChatMessageInput[];
}

export interface AgentRunRequest {
  workspaceId?: string;
  sessionId?: string;
  userId?: string;
  command: string;
  messages: ChatMessageInput[];
  workspace: WorkspaceSnapshot;
}
