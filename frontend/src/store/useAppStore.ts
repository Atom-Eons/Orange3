import { create } from "zustand";
import { initialMetrics, jitterMetric } from "../data/mockMetrics";
import { seedAgents, seedMessages, seedPanels, seedTimeline } from "../data/seed";
import { createLatencyCausalPath } from "../engine/causalityEngine";
import { createId } from "../engine/id";
import { createTimelineEvent } from "../engine/timelineEngine";
import { loadPersistedSession } from "./persistence";
import type {
  AgentId,
  AgentTask,
  AmbientAgent,
  AppState,
  CausalPath,
  ChatMessage,
  CommandPlan,
  DrawerId,
  EventToast,
  ModalId,
  PanelId,
  PendingToolApproval,
  Severity,
  SystemMode,
  WorkspaceView,
} from "../types/app";
import type { Artifact } from "../types/artifacts";
import type { SystemMetrics } from "../types/metrics";

interface AppActions {
  setWorkspaceId: (workspaceId: string) => void;
  setMode: (mode: SystemMode) => void;
  setWorkspaceView: (workspaceView: WorkspaceView) => void;
  setEnergy: (energy: number) => void;
  focusPanel: (panelId?: PanelId) => void;
  clearFocus: () => void;
  expandPanel: (panelId: PanelId, expanded: boolean) => void;
  collapseAllPanels: () => void;
  setPanelSeverity: (panelId: PanelId, severity?: Severity) => void;
  setComposerValue: (value: string) => void;
  setComposerFocus: (isFocused: boolean) => void;
  setSelectedMode: (selectedMode: AppState["composer"]["selectedMode"]) => void;
  setSelectedModel: (selectedModel: string) => void;
  toggleTool: (tool: string) => void;
  setContextPanels: (contextPanelIds: PanelId[]) => void;
  setSlashMenuOpen: (slashMenuOpen: boolean) => void;
  setPlanPreview: (planPreview?: CommandPlan) => void;
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, patch: Partial<ChatMessage>) => void;
  addTimelineEvent: (event: AppState["timeline"][number]) => void;
  addTask: (task: AgentTask) => void;
  updateTask: (id: string, patch: Partial<AgentTask>) => void;
  completeTask: (id: string) => void;
  cancelActiveTasks: () => void;
  updateAgent: (id: AgentId, patch: Partial<AmbientAgent>) => void;
  setActiveCausalPath: (path?: CausalPath) => void;
  triggerLatencyScenario: () => void;
  clearCausality: () => void;
  tickMetrics: () => void;
  ingestMetricSnapshot: (metrics: Partial<SystemMetrics>) => void;
  setDrawerOpen: (drawer?: DrawerId) => void;
  setModalOpen: (modal?: ModalId) => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setCommandPaletteQuery: (query: string) => void;
  addPendingApproval: (approval: PendingToolApproval) => void;
  resolveApproval: (id: string, status: "approved" | "rejected") => void;
  addEventToast: (toast: Omit<EventToast, "id" | "createdAt">) => void;
  dismissEventToast: (id: string) => void;
  setPerformanceOverlayOpen: (open: boolean) => void;
  setChatDockExpanded: (expanded: boolean) => void;
  setLayoutEditMode: (enabled: boolean) => void;
  setActiveMockupState: (id?: string) => void;
  resetToBaseline: () => void;
  resetToDemoBaseline: () => void;
  addArtifact: (artifact: Artifact) => void;
  updateArtifact: (id: string, patch: Partial<Artifact>) => void;
  setActiveArtifact: (id?: string) => void;
}

const persisted = typeof window !== "undefined" ? loadPersistedSession() : undefined;
const defaultSelectedTools = ["tools", "files", "memory", "context"];

function baselinePanels() {
  return seedPanels.map((panel) => ({
    ...panel,
    connectedTo: [...panel.connectedTo],
    dimmed: false,
    highlighted: false,
    expanded: false,
    severity: undefined,
  }));
}

function demoPanels() {
  return seedPanels.map((panel) => ({ ...panel, connectedTo: [...panel.connectedTo] }));
}

function baselineAgents() {
  return seedAgents.map((agent) => ({ ...agent, taskId: undefined }));
}

function baselineTimeline() {
  return seedTimeline.map((event) => ({ ...event, relatedPanelIds: [...event.relatedPanelIds] }));
}

function baselineMessages() {
  return seedMessages.map((message) => ({
    ...message,
    relatedPanelIds: message.relatedPanelIds ? [...message.relatedPanelIds] : undefined,
  }));
}

function baselineMetrics() {
  return { ...initialMetrics };
}

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  workspaceId: persisted?.workspaceId,
  mode: "calm",
  workspaceView: persisted?.workspaceView ?? "dashboard",
  energy: 0.78,
  focusPanelId: undefined,
  panels: seedPanels,
  agents: seedAgents,
  activeCausalPath: undefined,
  timeline: persisted?.timeline ?? seedTimeline,
  messages: persisted?.messages ?? seedMessages,
  tasks: [],
  composer: {
    value: "",
    isFocused: false,
    selectedModel: persisted?.composer?.selectedModel ?? "GPT-5.5",
    selectedMode: persisted?.composer?.selectedMode ?? "deep",
    selectedTools: persisted?.composer?.selectedTools ?? defaultSelectedTools,
    contextPanelIds: ["project-nexus", "system-health"],
    slashMenuOpen: false,
    planPreview: undefined,
  },
  metrics: initialMetrics,
  metricHistory: [{ timestamp: Date.now(), system: initialMetrics }],
  artifacts: persisted?.artifacts ?? [],
  activeArtifactId: persisted?.activeArtifactId,
  activeDrawer: undefined,
  activeModal: undefined,
  commandPaletteOpen: false,
  commandPaletteQuery: "",
  pendingApprovals: [],
  eventToasts: [],
  performanceOverlayOpen: false,
  chatDockExpanded: true,
  layoutEditMode: false,
  activeMockupStateId: undefined,
  setWorkspaceId: (workspaceId) => set({ workspaceId }),
  setMode: (mode) => set({ mode }),
  setWorkspaceView: (workspaceView) => set({ workspaceView }),
  setEnergy: (energy) => set({ energy }),
  focusPanel: (panelId) =>
    set((state) => {
      if (!panelId) {
        return {
          focusPanelId: undefined,
          panels: state.panels.map((panel) => ({ ...panel, dimmed: false, highlighted: false })),
        };
      }
      const focused = state.panels.find((panel) => panel.id === panelId);
      const related = new Set<PanelId>(focused ? [focused.id, ...focused.connectedTo] : [panelId]);
      return {
        focusPanelId: panelId,
        panels: state.panels.map((panel) => ({
          ...panel,
          dimmed: !related.has(panel.id),
          highlighted: related.has(panel.id) && panel.id !== panelId,
        })),
        composer: { ...state.composer, contextPanelIds: Array.from(related).slice(0, 4) },
      };
    }),
  clearFocus: () =>
    set((state) => ({
      focusPanelId: undefined,
      panels: state.panels.map((panel) => ({ ...panel, dimmed: false, highlighted: false })),
    })),
  expandPanel: (panelId, expanded) =>
    set((state) => ({
      panels: state.panels.map((panel) => (panel.id === panelId ? { ...panel, expanded } : panel)),
      focusPanelId: expanded ? panelId : state.focusPanelId,
    })),
  collapseAllPanels: () => set((state) => ({ panels: state.panels.map((panel) => ({ ...panel, expanded: false })) })),
  setPanelSeverity: (panelId, severity) => set((state) => ({ panels: state.panels.map((panel) => (panel.id === panelId ? { ...panel, severity } : panel)) })),
  setComposerValue: (value) => set((state) => ({ composer: { ...state.composer, value, slashMenuOpen: value.startsWith("/") } })),
  setComposerFocus: (isFocused) => set((state) => ({ composer: { ...state.composer, isFocused }, mode: isFocused ? "listening" : state.mode })),
  setSelectedMode: (selectedMode) => set((state) => ({ composer: { ...state.composer, selectedMode } })),
  setSelectedModel: (selectedModel) => set((state) => ({ composer: { ...state.composer, selectedModel } })),
  toggleTool: (tool) =>
    set((state) => ({
      composer: {
        ...state.composer,
        selectedTools: state.composer.selectedTools.includes(tool)
          ? state.composer.selectedTools.filter((item) => item !== tool)
          : [...state.composer.selectedTools, tool],
      },
    })),
  setContextPanels: (contextPanelIds) => set((state) => ({ composer: { ...state.composer, contextPanelIds } })),
  setSlashMenuOpen: (slashMenuOpen) => set((state) => ({ composer: { ...state.composer, slashMenuOpen } })),
  setPlanPreview: (planPreview) => set((state) => ({ composer: { ...state.composer, planPreview } })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message].slice(-100) })),
  updateMessage: (id, patch) => set((state) => ({ messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) })),
  addTimelineEvent: (event) => set((state) => ({ timeline: [...state.timeline, event].slice(-120) })),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task].slice(-80) })),
  updateTask: (id, patch) => set((state) => ({ tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)) })),
  completeTask: (id) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, status: "complete", progress: 100, completedAt: Date.now() } : task)),
      agents: state.agents.map((agent) => (agent.taskId === id ? { ...agent, state: "complete", taskId: undefined, energy: 0.68 } : agent)),
    })),
  cancelActiveTasks: () =>
    set((state) => ({
      mode: "calm",
      energy: 0.55,
      tasks: state.tasks.map((task) =>
        ["queued", "planning", "running", "waiting"].includes(task.status)
          ? { ...task, status: "cancelled", completedAt: Date.now() }
          : task,
      ),
      agents: state.agents.map((agent) => ({ ...agent, state: agent.state === "blocked" ? "blocked" : "idle", taskId: undefined, energy: 0.48 })),
    })),
  updateAgent: (id, patch) => set((state) => ({ agents: state.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)) })),
  setActiveCausalPath: (activeCausalPath) => set({ activeCausalPath, mode: activeCausalPath ? "alert" : "calm" }),
  triggerLatencyScenario: () =>
    set((state) => {
      const path = createLatencyCausalPath();
      return {
        mode: "alert",
        energy: 1,
        activeCausalPath: path,
        panels: state.panels.map((panel) => {
          if (["realtime-insights", "data-stream", "system-health"].includes(panel.id)) return { ...panel, severity: "warning", dimmed: false };
          if (panel.id === "causality") return { ...panel, severity: "critical", dimmed: false };
          return { ...panel, dimmed: !["model-performance", "activity-feed", "smart-suggestions"].includes(panel.id) };
        }),
        agents: state.agents.map((agent) =>
          agent.id === "watcher" || agent.id === "analyst" ? { ...agent, state: "working", energy: 1, connectedPanel: "causality" } : { ...agent, energy: 0.48 },
        ),
        timeline: [
          ...state.timeline,
          createTimelineEvent({ title: "Latency anomaly traced", description: path.title, type: "alert", severity: "warning", relatedPanelIds: ["causality", "data-stream", "system-health"] }),
        ].slice(-120),
      };
    }),
  clearCausality: () =>
    set((state) => ({
      mode: "calm",
      energy: 0.55,
      activeCausalPath: undefined,
      panels: state.panels.map((panel) => ({ ...panel, dimmed: false, highlighted: false, severity: undefined })),
      agents: state.agents.map((agent) => ({ ...agent, state: agent.id === "watcher" ? "watching" : "idle", taskId: undefined, energy: 0.55 })),
    })),
  tickMetrics: () =>
    set((state) => {
      const metrics = {
        ...state.metrics,
        cpu: jitterMetric(state.metrics.cpu + (state.mode === "alert" ? 1.2 : 0), 5, 12, 98),
        memory: jitterMetric(state.metrics.memory, 3, 20, 96),
        gpu: jitterMetric(state.metrics.gpu + (state.mode === "generating" ? 1.3 : 0), 5, 10, 99),
        network: jitterMetric(state.metrics.network + (state.mode === "alert" ? 1.8 : 0), 5, 18, 99),
        latencyMs: Math.round(jitterMetric(state.metrics.latencyMs + (state.mode === "alert" ? 3.8 : -0.6), state.mode === "alert" ? 18 : 5, 28, state.mode === "alert" ? 260 : 90)),
      };
      return { metrics, metricHistory: [...state.metricHistory.slice(-40), { timestamp: Date.now(), system: metrics }] };
    }),
  ingestMetricSnapshot: (incoming) => set((state) => {
    const metrics = { ...state.metrics, ...incoming };
    return { metrics, metricHistory: [...state.metricHistory.slice(-40), { timestamp: Date.now(), system: metrics }] };
  }),
  setDrawerOpen: (activeDrawer) => set({ activeDrawer }),
  setModalOpen: (activeModal) => set({ activeModal }),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen, commandPaletteQuery: commandPaletteOpen ? get().commandPaletteQuery : "" }),
  setCommandPaletteQuery: (commandPaletteQuery) => set({ commandPaletteQuery }),
  addPendingApproval: (approval) => set((state) => ({ pendingApprovals: [...state.pendingApprovals.filter((item) => item.id !== approval.id), approval], activeDrawer: "tool-approval" })),
  resolveApproval: (id, status) => set((state) => ({ pendingApprovals: state.pendingApprovals.map((approval) => (approval.id === id ? { ...approval, status } : approval)) })),
  addEventToast: (toast) => set((state) => ({ eventToasts: [...state.eventToasts.slice(-4), { ...toast, id: createId("toast"), createdAt: Date.now() }] })),
  dismissEventToast: (id) => set((state) => ({ eventToasts: state.eventToasts.filter((toast) => toast.id !== id) })),
  setPerformanceOverlayOpen: (performanceOverlayOpen) => set({ performanceOverlayOpen }),
  setChatDockExpanded: (chatDockExpanded) => set({ chatDockExpanded }),
  setLayoutEditMode: (layoutEditMode) => set({ layoutEditMode }),
  setActiveMockupState: (activeMockupStateId) => set({ activeMockupStateId }),
  resetToBaseline: () => set({
    mode: "calm",
    workspaceView: "dashboard",
    energy: 0.55,
    focusPanelId: undefined,
    panels: baselinePanels(),
    agents: baselineAgents(),
    activeCausalPath: undefined,
    tasks: [],
    metrics: baselineMetrics(),
    metricHistory: [{ timestamp: Date.now(), system: baselineMetrics() }],
    activeDrawer: undefined,
    activeModal: undefined,
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    pendingApprovals: [],
    eventToasts: [],
    performanceOverlayOpen: false,
    layoutEditMode: false,
    activeMockupStateId: undefined,
  }),
  resetToDemoBaseline: () => set({
    mode: "calm",
    workspaceView: "dashboard",
    energy: 0.72,
    panels: demoPanels(),
    agents: baselineAgents(),
    timeline: baselineTimeline(),
    messages: baselineMessages(),
    tasks: [],
    metrics: baselineMetrics(),
    metricHistory: [{ timestamp: Date.now(), system: baselineMetrics() }],
    activeCausalPath: undefined,
    activeDrawer: undefined,
    activeModal: undefined,
    commandPaletteOpen: false,
    commandPaletteQuery: "",
    pendingApprovals: [],
    eventToasts: [],
    performanceOverlayOpen: false,
    layoutEditMode: false,
  }),
  addArtifact: (artifact) => set((state) => ({
    artifacts: [...state.artifacts.filter((item) => item.id !== artifact.id), artifact],
    activeArtifactId: artifact.id,
    workspaceView: "canvas",
  })),
  updateArtifact: (id, patch) => set((state) => ({ artifacts: state.artifacts.map((artifact) => (artifact.id === id ? { ...artifact, ...patch, updatedAt: Date.now() } : artifact)) })),
  setActiveArtifact: (activeArtifactId) => set({ activeArtifactId, workspaceView: activeArtifactId ? "canvas" : "dashboard" }),
}));
