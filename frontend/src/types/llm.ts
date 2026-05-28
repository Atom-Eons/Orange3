import type { AgentId, CausalPath, ChatMessage, CommandPlan, PanelId, SystemMode, TimelineEvent } from "./app";
import type { Artifact } from "./artifacts";

export interface LLMContext {
  selectedModel: string;
  selectedMode: "fast" | "deep" | "creative" | "code" | "agent";
  selectedTools: string[];
  contextPanelIds: PanelId[];
  visiblePanelData: Record<string, unknown>;
  activeCausalPath?: unknown;
  timelineTail: unknown[];
  metricTail: unknown[];
  activeTasks: unknown[];
}

export type LLMStreamEvent =
  | { type: "token"; token: string }
  | { type: "plan"; plan: CommandPlan }
  | { type: "tool-call"; callId: string; toolName: string; args: unknown }
  | { type: "tool-result"; callId: string; toolName: string; ok?: boolean; result?: unknown; error?: string }
  | { type: "state"; mode?: SystemMode; focusPanelIds?: PanelId[]; contextPanelIds?: PanelId[]; energy?: number }
  | { type: "causality"; path: CausalPath }
  | {
      type: "task";
      action: "created" | "updated" | "completed" | "failed" | "cancelled";
      task: { id: string; title: string; status: string; assignedAgentId: AgentId; progress: number; relatedPanelIds: PanelId[] };
    }
  | { type: "agent"; agentId: string; state: string; taskId?: string; energy?: number; connectedPanel?: PanelId }
  | { type: "timeline"; event: TimelineEvent }
  | { type: "artifact"; artifact: Artifact }
  | { type: "done" }
  | { type: "error"; error: string };

export interface LLMRunInput {
  messages: ChatMessage[];
  context: LLMContext;
  abortSignal?: AbortSignal;
}

export interface LLMAdapter {
  run(input: LLMRunInput): AsyncIterable<LLMStreamEvent>;
}
