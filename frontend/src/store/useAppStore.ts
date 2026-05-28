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
  activeCausalPath: createLatencyCausalPath(),
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
  chatDockExpanded: false,
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
      const focusedPanel = state.panels.find((panel) => panel.id === panelId);
      const related = new Set<PanelId>(focusedPanel ? [focusedPanel.id, ...focusedPanel.connectedTo] : [panelId]);
      return {
        focusPanelId: panelId,
        panels: state.panels.map((panel) => ({
          ...panel,
          dimmed: !related.has(panel.id),
          highlighted: related.has(panel.id) && panel.id !== panelId,
        })),
        composer: {
          ...state.composer,
          contextPanelIds: Array.from(related).slice(0, 4),
        },
      };
    }),
  clearFocus: () =>
    set((state) => ({
      focusPanelId: undefined,
      panels: state.panels.map((panel) => ({ ...panel, dimmed: false, highlighted: false })),
    })),
  expandPanel: (panelId, expanded) =>
    set((state) => ({
      panels: state.panels.map((panel) => ({ ...panel, expanded: panel.id === panelId ? expanded : false })),
      focusPanelId: expanded ? panelId : state.focusPanelId,
    })),
  collapseAllPanels: () =>
    set((state) => ({
      panels: state.panels.map((panel) => ({ ...panel, expanded: false })),
    })),
  setPanelSeverity: (panelId, severity) =>
    set((state) => ({
      panels: state.panels.map((panel) => (panel.id === panelId ? { ...panel, severity } : panel)),
    })),
  setComposerValue: (value) =>
    set((state) => ({
      composer: { ...state.composer, value, slashMenuOpen: value.startsWith("/") },
      mode: state.composer.isFocused ? "listening" : state.mode,
    })),
  setComposerFocus: (isFocused) =>
    set((state) => ({
      composer: { ...state.composer, isFocused },
      mode: isFocused && state.mode === "calm" ? "listening" : !isFocused && state.mode === "listening" ? "calm" : state.mode,
    })),
  setSelectedMode: (selectedMode) => set((state) => ({ composer: { ...state.composer, selectedMode } })),
  setSelectedModel: (selectedModel) => set((state) => ({ composer: { ...state.composer, selectedModel } })),
  toggleTool: (tool) =>
    set((state) => {
      const selectedTools = state.composer.selectedTools.includes(tool)
        ? state.composer.selectedTools.filter((item) => item !== tool)
        : [...state.composer.selectedTools, tool];
      return { composer: { ...state.composer, selectedTools } };
    }),
  setContextPanels: (contextPanelIds) => set((state) => ({ composer: { ...state.composer, contextPanelIds } })),
  setSlashMenuOpen: (slashMenuOpen) => set((state) => ({ composer: { ...state.composer, slashMenuOpen } })),
  setPlanPreview: (planPreview) => set((state) => ({ composer: { ...state.composer, planPreview } })),
  addMessage: (message) => set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, patch) =>
    set((state) => ({
      messages: state.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)),
    })),
  addTimelineEvent: (event) => set((state) => ({ timeline: [...state.timeline, event].slice(-120) })),
  addTask: (task) => set((state) => ({ tasks: [...state.tasks, task].slice(-40) })),
  updateTask: (id, patch) =>
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    })),
  completeTask: (id) =>
    set((state) => {
      const completedTask = state.tasks.find((task) => task.id === id);
      return {
        tasks: state.tasks.map((task) =>
          task.id === id ? { ...task, status: "complete", progress: 100, completedAt: Date.now() } : task,
        ),
        agents: completedTask
          ? state.agents.map((agent) =>
              agent.id === completedTask.assignedAgentId ? { ...agent, state: "complete", taskId: undefined, energy: 0.68 } : agent,
            )
          : state.agents,
      };
    }),
  cancelActiveTasks: () =>
    set((state) => ({
      mode: state.activeCausalPath ? "alert" : "calm",
      energy: state.activeCausalPath ? 0.82 : 0.55,
      tasks: state.tasks.map((task) =>
        ["queued", "planning", "running", "waiting"].includes(task.status)
          ? { ...task, status: "cancelled", progress: Math.min(task.progress, 99), completedAt: Date.now() }
          : task,
      ),
      agents: state.agents.map((agent) => ({
        ...agent,
        state: agent.state === "working" || agent.state === "thinking" || agent.state === "blocked" ? "idle" : agent.state,
        taskId: undefined,
        energy: Math.max(0.42, agent.energy * 0.7),
      })),
    })),
  updateAgent: (id, patch) =>
    set((state) => ({ agents: state.agents.map((agent) => (agent.id === id ? { ...agent, ...patch } : agent)) })),
  setActiveCausalPath: (activeCausalPath) => set({ activeCausalPath, mode: activeCausalPath ? "alert" : "calm" }),
  triggerLatencyScenario: () =>
    set((state) => {
      const activeCausalPath = createLatencyCausalPath();
      const activeIds: PanelId[] = ["realtime-insights", "data-stream", "model-performance", "system-health", "activity-feed", "causality"];
      return {
        activeCausalPath,
        mode: "alert",
        energy: 1,
        composer: { ...state.composer, contextPanelIds: activeIds.slice(0, 4) },
        panels: state.panels.map((panel) => {
          if (panel.id === "realtime-insights") return { ...panel, dimmed: false, severity: "warning" };
          if (panel.id === "system-health") return { ...panel, dimmed: false, severity: "critical" };
          if (panel.id === "data-stream") return { ...panel, dimmed: false, severity: "warning" };
          return { ...panel, dimmed: !activeIds.includes(panel.id), highlighted: activeIds.includes(panel.id) };
        }),
        agents: state.agents.map((agent) => {
          if (agent.id === "watcher") return { ...agent, state: "working", energy: 1, connectedPanel: "realtime-insights" };
          if (agent.id === "analyst") return { ...agent, state: "thinking", energy: 0.92, connectedPanel: "causality" };
          return { ...agent, energy: Math.max(0.42, agent.energy * 0.76) };
        }),
        timeline: [
          ...state.timeline,
          createTimelineEvent({
            title: "Latency anomaly activated",
            description: "Causal path generated across gateway, model, resource, and user impact signals.",
            type: "alert",
            severity: "warning",
            relatedPanelIds: activeIds,
          }),
        ],
        eventToasts: [
          ...state.eventToasts.slice(-4),
          { id: createId("toast"), title: "Causal path generated", description: activeCausalPath.title, severity: "warning", createdAt: Date.now() },
        ],
      };
    }),
  clearCausality: () =>
    set((state) => ({
      activeCausalPath: undefined,
      mode: "calm",
      energy: 0.55,
      panels: state.panels.map((panel) => ({ ...panel, dimmed: false, highlighted: false, severity: undefined })),
      agents: state.agents.map((agent) => ({
        ...agent,
        state: agent.id === "watcher" || agent.id === "analyst" ? "watching" : "idle",
        energy: 0.55,
        taskId: undefined,
      })),
    })),
  tickMetrics: () =>
    set((state) => {
      const alertActive = state.mode === "alert";
      const thinkingActive = ["thinking", "analyzing", "generating"].includes(state.mode);
      const metrics: SystemMetrics = {
        cpu: jitterMetric(state.metrics.cpu + (alertActive ? 1.2 : thinkingActive ? 0.5 : 0), alertActive ? 6 : 3, 12, 98),
        memory: jitterMetric(state.metrics.memory + (thinkingActive ? 0.4 : 0), 3, 20, 96),
        gpu: jitterMetric(state.metrics.gpu + (state.mode === "generating" ? 1 : 0), 5, 10, 98),
        network: jitterMetric(state.metrics.network + (alertActive ? 1.4 : 0), 6, 18, 99),
        latencyMs: jitterMetric(state.metrics.latencyMs + (alertActive ? 8 : -1.5), alertActive ? 28 : 8, 24, alertActive ? 220 : 120),
        throughputTbs: jitterMetric(state.metrics.throughputTbs, 0.16, 1.2, 3.8),
        eventsPerSecondM: jitterMetric(state.metrics.eventsPerSecondM, 0.24, 0.8, 3.4),
        modelAccuracy: jitterMetric(state.metrics.modelAccuracy, 0.18, 88, 98),
        precision: jitterMetric(state.metrics.precision, 0.22, 86, 98),
        recall: jitterMetric(state.metrics.recall, 0.22, 86, 98),
        f1: jitterMetric(state.metrics.f1, 0.18, 86, 98),
        activeStreams: Math.round(jitterMetric(state.metrics.activeStreams, 3, 14, 42)),
        pipelineSuccess: jitterMetric(state.metrics.pipelineSuccess - (alertActive ? 0.12 : 0), 0.25, 92, 99.8),
      };
      return { metrics, metricHistory: [...state.metricHistory.slice(-48), { timestamp: Date.now(), system: metrics }] };
    }),
  ingestMetricSnapshot: (incoming) =>
    set((state) => {
      const metrics = { ...state.metrics, ...incoming };
      return { metrics, metricHistory: [...state.metricHistory.slice(-48), { timestamp: Date.now(), system: metrics }] };
    }),
  setDrawerOpen: (activeDrawer) => set({ activeDrawer }),
  setModalOpen: (activeModal) => set({ activeModal }),
  setCommandPaletteOpen: (commandPaletteOpen) =>
    set({ commandPaletteOpen, commandPaletteQuery: commandPaletteOpen ? get().commandPaletteQuery : "" }),
  setCommandPaletteQuery: (commandPaletteQuery) => set({ commandPaletteQuery }),
  addPendingApproval: (approval) =>
    set((state) => ({
      pendingApprovals: [...state.pendingApprovals.filter((item) => item.id !== approval.id), approval],
      activeDrawer: "tool-approval",
    })),
  resolveApproval: (id, status) =>
    set((state) => ({
      pendingApprovals: state.pendingApprovals.map((approval) => (approval.id === id ? { ...approval, status } : approval)),
    })),
  addEventToast: (toast) =>
    set((state) => ({ eventToasts: [...state.eventToasts.slice(-4), { ...toast, id: createId("toast"), createdAt: Date.now() }] })),
  dismissEventToast: (id) => set((state) => ({ eventToasts: state.eventToasts.filter((toast) => toast.id !== id) })),
  setPerformanceOverlayOpen: (performanceOverlayOpen) => set({ performanceOverlayOpen }),
  setChatDockExpanded: (chatDockExpanded) => set({ chatDockExpanded }),
  setLayoutEditMode: (layoutEditMode) => set({ layoutEditMode, mode: layoutEditMode ? "reviewing" : get().mode }),
  setActiveMockupState: (activeMockupStateId) => set({ activeMockupStateId }),
  resetToBaseline: () =>
    set(() => {
      const metrics = baselineMetrics();
      return {
      mode: "calm",
      workspaceView: "dashboard",
      energy: 0.78,
      focusPanelId: undefined,
      panels: baselinePanels(),
      agents: baselineAgents(),
      activeCausalPath: undefined,
      timeline: baselineTimeline(),
      messages: baselineMessages(),
      tasks: [],
      metrics,
      metricHistory: [{ timestamp: Date.now(), system: metrics }],
      composer: {
        value: "",
        isFocused: false,
        selectedModel: "GPT-5.5",
        selectedMode: "deep",
        selectedTools: defaultSelectedTools,
        contextPanelIds: ["project-nexus", "system-health"],
        slashMenuOpen: false,
        planPreview: undefined,
      },
      artifacts: [],
      activeArtifactId: undefined,
      activeDrawer: undefined,
      activeModal: undefined,
      commandPaletteOpen: false,
      commandPaletteQuery: "",
      pendingApprovals: [],
      eventToasts: [],
      performanceOverlayOpen: false,
      chatDockExpanded: false,
      layoutEditMode: false,
      activeMockupStateId: undefined,
      };
    }),
  resetToDemoBaseline: () =>
    set(() => {
      const metrics = baselineMetrics();
      return {
      workspaceView: "dashboard",
      mode: "calm",
      energy: 0.78,
      focusPanelId: undefined,
      panels: demoPanels(),
      agents: baselineAgents(),
      activeCausalPath: createLatencyCausalPath(),
      tasks: [],
      timeline: baselineTimeline(),
      messages: baselineMessages(),
      metrics,
      metricHistory: [{ timestamp: Date.now(), system: metrics }],
      composer: {
        value: "",
        isFocused: false,
        selectedModel: "GPT-5.5",
        selectedMode: "deep",
        selectedTools: defaultSelectedTools,
        contextPanelIds: ["project-nexus", "system-health"],
        slashMenuOpen: false,
        planPreview: undefined,
      },
      artifacts: [],
      activeArtifactId: undefined,
      activeDrawer: undefined,
      activeModal: undefined,
      commandPaletteOpen: false,
      commandPaletteQuery: "",
      pendingApprovals: [],
      eventToasts: [],
      performanceOverlayOpen: false,
      chatDockExpanded: false,
      layoutEditMode: false,
      activeMockupStateId: undefined,
      };
    }),
  addArtifact: (artifact) =>
    set((state) => ({
      artifacts: [
        ...state.artifacts.filter((item) => item.id !== artifact.id),
        { ...artifact, createdAt: artifact.createdAt ?? Date.now(), updatedAt: artifact.updatedAt ?? Date.now() },
      ],
      activeArtifactId: artifact.id,
      workspaceView: "canvas",
    })),
  updateArtifact: (id, patch) =>
    set((state) => ({
      artifacts: state.artifacts.map((artifact) => (artifact.id === id ? { ...artifact, ...patch, updatedAt: Date.now() } : artifact)),
    })),
  setActiveArtifact: (activeArtifactId) => set({ activeArtifactId, workspaceView: activeArtifactId ? "canvas" : "dashboard" }),
}));
