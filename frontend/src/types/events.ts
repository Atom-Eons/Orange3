import type { AgentId, CausalPath, PanelId, SystemMode, TimelineEvent } from "./app";

export type AppEvent =
  | { type: "mode.changed"; mode: SystemMode }
  | { type: "panel.focused"; panelId?: PanelId }
  | { type: "causality.activated"; path: CausalPath }
  | { type: "timeline.added"; event: TimelineEvent }
  | { type: "agent.state"; agentId: AgentId; state: string; taskId?: string }
  | { type: "task.created"; taskId: string; agentId: AgentId }
  | { type: "llm.token"; messageId: string; token: string }
  | { type: "llm.done"; messageId: string }
  | { type: "tool.started"; toolName: string; callId: string }
  | { type: "tool.finished"; toolName: string; callId: string; result?: unknown };
