export type SystemMode = "calm" | "listening" | "thinking" | "generating" | "analyzing" | "alert" | "deploying" | "reviewing";
export type PanelId = "system-health" | "project-nexus" | "realtime-insights" | "model-performance" | "data-stream" | "pipeline-orchestrator" | "activity-feed" | "smart-suggestions" | "causality" | "memory-ribbon";
export type Severity = "info" | "success" | "warning" | "critical";

export interface StreamPlanStep {
  id: string;
  label: string;
  description?: string;
  tool?: string;
  status: "pending" | "active" | "complete" | "failed";
}

export interface StreamPlan {
  id: string;
  userCommand: string;
  summary: string;
  steps: StreamPlanStep[];
  risk: "low" | "medium" | "high";
  relatedPanelIds: PanelId[];
}

export interface StreamCausalNode {
  id: string;
  label: string;
  panelId?: PanelId;
  severity: Severity;
  confidence?: number;
}

export interface StreamCausalEdge {
  from: string;
  to: string;
  weight: number;
  label?: string;
}

export interface StreamCausalPath {
  id: string;
  title: string;
  nodes: StreamCausalNode[];
  edges: StreamCausalEdge[];
  activeNodeId?: string;
  confidence: number;
}

export type AgentStreamEvent =
  | { type: "state"; mode?: SystemMode; energy?: number; focusPanelIds?: PanelId[]; contextPanelIds?: PanelId[] }
  | { type: "plan"; plan: StreamPlan }
  | { type: "task"; action: "created" | "updated" | "completed" | "failed" | "cancelled"; task: { id: string; title: string; status: string; assignedAgentId: string; progress: number; relatedPanelIds: PanelId[] } }
  | { type: "agent"; agentId: string; state: string; taskId?: string; energy?: number; connectedPanel?: PanelId }
  | { type: "tool-call"; callId: string; toolName: string; args: unknown }
  | { type: "tool-result"; callId: string; toolName: string; ok: boolean; result?: unknown; error?: string }
  | { type: "causality"; path: StreamCausalPath }
  | { type: "artifact"; artifact: { id: string; kind: string; title: string; content?: string; relatedPanelIds: PanelId[] } }
  | { type: "timeline"; event: { id: string; timestamp: number; timeLabel: string; title: string; description?: string; type: string; severity: Severity; relatedPanelIds: PanelId[] } }
  | { type: "token"; token: string }
  | { type: "done" }
  | { type: "error"; error: string; code?: string };
