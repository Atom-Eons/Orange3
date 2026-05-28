import type { Artifact } from "./artifacts";
import type { MetricSnapshot, SystemMetrics } from "./metrics";
import type { ToolPermission } from "./tools";

export type SystemMode =
  | "calm"
  | "listening"
  | "thinking"
  | "generating"
  | "analyzing"
  | "alert"
  | "deploying"
  | "reviewing";

export type WorkspaceView = "dashboard" | "canvas" | "code" | "reports";

export type PanelId =
  | "system-health"
  | "project-nexus"
  | "realtime-insights"
  | "model-performance"
  | "data-stream"
  | "pipeline-orchestrator"
  | "activity-feed"
  | "smart-suggestions"
  | "causality"
  | "memory-ribbon";

export type AgentId = "builder" | "watcher" | "analyst" | "memory" | "deploy";
export type AgentState = "idle" | "watching" | "thinking" | "working" | "complete" | "blocked";
export type TaskStatus = "queued" | "planning" | "running" | "waiting" | "complete" | "failed" | "cancelled";
export type Severity = "info" | "success" | "warning" | "critical";
export type DrawerId =
  | "agent-queue"
  | "memory"
  | "tool-approval"
  | "artifact-inspector"
  | "settings"
  | "notifications"
  | "performance"
  | undefined;

export type ModalId =
  | "add-widget"
  | "context-picker"
  | "model-selector"
  | "export"
  | "approval"
  | "shortcuts"
  | "compare"
  | "stop-confirm"
  | undefined;

export interface PanelAnchor {
  xPct: number;
  yPct: number;
  depth: number;
  rotateDeg: number;
  scale: number;
}

export interface SemanticPanel {
  id: PanelId;
  title: string;
  kind: string;
  anchor: PanelAnchor;
  width: number;
  height: number;
  priority: number;
  visible: boolean;
  dimmed: boolean;
  highlighted?: boolean;
  expanded: boolean;
  connectedTo: PanelId[];
  severity?: Severity;
}

export interface AmbientAgent {
  id: AgentId;
  label: string;
  state: AgentState;
  orbitRadius: number;
  orbitAngle: number;
  energy: number;
  connectedPanel?: PanelId;
  taskId?: string;
}

export interface CausalNode {
  id: string;
  label: string;
  panelId?: PanelId;
  severity: Severity;
  confidence?: number;
}

export interface CausalEdge {
  from: string;
  to: string;
  weight: number;
  label?: string;
}

export interface CausalPath {
  id: string;
  title: string;
  nodes: CausalNode[];
  edges: CausalEdge[];
  activeNodeId?: string;
  confidence: number;
}

export interface TimelineEvent {
  id: string;
  timeLabel: string;
  timestamp: number;
  title: string;
  description?: string;
  type: "system" | "chat" | "task" | "model" | "pipeline" | "alert" | "memory" | "deployment";
  severity: Severity;
  relatedPanelIds: PanelId[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: number;
  status?: "streaming" | "complete" | "error";
  relatedPanelIds?: PanelId[];
}

export interface AgentTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignedAgentId: AgentId;
  progress: number;
  startedAt?: number;
  completedAt?: number;
  relatedPanelIds: PanelId[];
}

export interface CommandPlanStep {
  id: string;
  label: string;
  description?: string;
  tool?: string;
  status: "pending" | "active" | "complete" | "failed";
}

export interface CommandPlan {
  id: string;
  userCommand: string;
  summary: string;
  steps: CommandPlanStep[];
  risk: "low" | "medium" | "high";
  relatedPanelIds: PanelId[];
}

export interface ComposerState {
  value: string;
  isFocused: boolean;
  selectedModel: string;
  selectedMode: "fast" | "deep" | "creative" | "code" | "agent";
  selectedTools: string[];
  contextPanelIds: PanelId[];
  slashMenuOpen: boolean;
  planPreview?: CommandPlan;
}

export interface PendingToolApproval {
  id: string;
  toolName: string;
  label: string;
  description?: string;
  permissions: ToolPermission[];
  args: unknown;
  createdAt: number;
  status: "pending" | "approved" | "rejected";
}

export interface EventToast {
  id: string;
  title: string;
  description?: string;
  severity: Severity;
  createdAt: number;
}

export interface AppState {
  workspaceId?: string;
  mode: SystemMode;
  workspaceView: WorkspaceView;
  energy: number;
  focusPanelId?: PanelId;
  panels: SemanticPanel[];
  agents: AmbientAgent[];
  activeCausalPath?: CausalPath;
  timeline: TimelineEvent[];
  messages: ChatMessage[];
  tasks: AgentTask[];
  composer: ComposerState;
  metrics: SystemMetrics;
  metricHistory: MetricSnapshot[];
  artifacts: Artifact[];
  activeArtifactId?: string;
  activeDrawer?: DrawerId;
  activeModal?: ModalId;
  commandPaletteOpen: boolean;
  commandPaletteQuery: string;
  pendingApprovals: PendingToolApproval[];
  eventToasts: EventToast[];
  performanceOverlayOpen: boolean;
  chatDockExpanded: boolean;
  layoutEditMode: boolean;
  activeMockupStateId?: string;
}
