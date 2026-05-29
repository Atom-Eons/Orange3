import type { DrawerId, ModalId, PanelId, SystemMode } from "../types/app";
import { handleSubmitCommand } from "./taskRunner";
import { useAppStore } from "../store/useAppStore";
import { mockupStateBank } from "./mockupStateBank";
import { applyMockupState } from "./mockupStateRuntime";

export type CommandPaletteActionKind = "panel" | "mode" | "workspace" | "agent" | "memory" | "tool" | "debug" | "run";

export interface CommandPaletteAction {
  id: string;
  kind: CommandPaletteActionKind;
  title: string;
  subtitle?: string;
  keywords: string[];
  shortcut?: string;
  run: () => void;
}

function focusPanelAction(panelId: PanelId, title: string): CommandPaletteAction {
  return {
    id: `focus-${panelId}`,
    kind: "panel",
    title: `Focus ${title}`,
    subtitle: "Bring panel into context",
    keywords: [panelId, title, "panel", "focus"],
    run: () => {
      const store = useAppStore.getState();
      store.focusPanel(panelId);
      store.setCommandPaletteOpen(false);
    },
  };
}

function setModeAction(mode: SystemMode, title: string): CommandPaletteAction {
  return {
    id: `mode-${mode}`,
    kind: "mode",
    title,
    subtitle: `Switch system mode to ${mode}`,
    keywords: [mode, title, "mode"],
    run: () => {
      const store = useAppStore.getState();
      store.setMode(mode);
      store.setCommandPaletteOpen(false);
    },
  };
}

function openDrawerAction(id: DrawerId, title: string, subtitle: string, keywords: string[], kind: CommandPaletteActionKind = "workspace"): CommandPaletteAction {
  return {
    id: `open-drawer-${id}`,
    kind,
    title,
    subtitle,
    keywords: ["drawer", "open", title, ...(keywords ?? [])],
    run: () => {
      const store = useAppStore.getState();
      store.setDrawerOpen(id);
      store.setCommandPaletteOpen(false);
    },
  };
}

function openModalAction(id: ModalId, title: string, subtitle: string, keywords: string[], kind: CommandPaletteActionKind = "workspace"): CommandPaletteAction {
  return {
    id: `open-modal-${id}`,
    kind,
    title,
    subtitle,
    keywords: ["modal", "open", title, ...(keywords ?? [])],
    run: () => {
      const store = useAppStore.getState();
      store.setModalOpen(id);
      store.setCommandPaletteOpen(false);
    },
  };
}

export function getCommandPaletteActions(): CommandPaletteAction[] {
  const store = useAppStore.getState();
  return [
    {
      id: "run-current",
      kind: "run",
      title: "Run current command",
      subtitle: "Execute composer or active plan",
      keywords: ["run", "execute", "submit", "command"],
      shortcut: "Cmd Enter",
      run: () => {
        const command = store.composer.value.trim() || store.composer.planPreview?.userCommand || "Analyze current workspace state";
        handleSubmitCommand(command);
        store.setCommandPaletteOpen(false);
      },
    },
    {
      id: "simulate-latency",
      kind: "debug",
      title: "Simulate latency anomaly",
      subtitle: "Activate alert mode and causal path",
      keywords: ["latency", "alert", "simulate", "causality", "debug"],
      run: () => {
        useAppStore.getState().triggerLatencyScenario();
        useAppStore.getState().setCommandPaletteOpen(false);
      },
    },
    {
      id: "clear-causality",
      kind: "debug",
      title: "Clear causality",
      subtitle: "Return workspace to calm state",
      keywords: ["clear", "reset", "causality", "calm"],
      run: () => {
        useAppStore.getState().clearCausality();
        useAppStore.getState().setCommandPaletteOpen(false);
      },
    },
    {
      id: "open-canvas",
      kind: "workspace",
      title: "Open Living Canvas",
      subtitle: "View artifacts and generated branches",
      keywords: ["canvas", "artifact", "output", "generation"],
      run: () => {
        const s = useAppStore.getState();
        s.setWorkspaceView("canvas");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "open-dashboard",
      kind: "workspace",
      title: "Return to Dashboard",
      subtitle: "Bring floating panels back to the front",
      keywords: ["dashboard", "return", "panels", "system"],
      run: () => {
        const s = useAppStore.getState();
        s.setWorkspaceView("dashboard");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "open-agent-queue",
      kind: "agent",
      title: "Open Agent Queue",
      subtitle: "Inspect active and completed agent tasks",
      keywords: ["agent", "queue", "task", "jobs"],
      run: () => {
        const s = useAppStore.getState();
        s.setDrawerOpen("agent-queue");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "open-memory-browser",
      kind: "memory",
      title: "Open Memory Browser",
      subtitle: "Inspect timeline and saved memory",
      keywords: ["memory", "timeline", "history", "recall"],
      run: () => {
        const s = useAppStore.getState();
        s.setDrawerOpen("memory");
        s.setCommandPaletteOpen(false);
      },
    },
    openDrawerAction("settings", "Open Settings", "Motion, memory, backend, and operator preferences", ["settings", "preferences", "motion", "backend"], "workspace"),
    openDrawerAction("notifications", "Open Notifications", "Alerts, tool results, task completions, and workspace events", ["notifications", "alerts", "events", "toast"], "debug"),
    openDrawerAction("artifact-inspector", "Open Artifact Inspector", "Inspect generated work and source context", ["artifact", "inspector", "export", "canvas"], "workspace"),
    openModalAction("add-widget", "Add Widget", "Create a semantic panel from a metric, memory, or command", ["widget", "panel", "create", "add"], "workspace"),
    openModalAction("context-picker", "Open Context Picker", "Attach panels and memory to the next command", ["context", "picker", "attach", "panels"], "run"),
    openModalAction("model-selector", "Open Model Selector", "Choose model and reasoning mode", ["model", "selector", "mode", "router"], "run"),
    openModalAction("export", "Export Workspace", "Package artifacts, timeline, and current state", ["export", "download", "bundle"], "workspace"),
    openModalAction("approval", "Open Deployment Approval", "Review rollout risk and approval gates", ["approval", "deploy", "canary", "risk"], "tool"),
    openModalAction("shortcuts", "Open Keyboard Shortcuts", "Show fast control commands", ["keyboard", "shortcuts", "hotkeys"], "workspace"),
    openModalAction("compare", "Open Branch Compare", "Compare generated artifact branches", ["compare", "branch", "artifact", "diff"], "workspace"),
    openModalAction("stop-confirm", "Confirm Stop Active Run", "Cancel active agent work with a clear checkpoint", ["stop", "cancel", "run", "task"], "debug"),
    {
      id: "expand-temporal-memory",
      kind: "memory",
      title: "Expand Temporal Memory",
      subtitle: "Open the large timeline scrub and replay surface",
      keywords: ["temporal", "memory", "timeline", "state", "22", "expand"],
      run: () => {
        const s = useAppStore.getState();
        s.expandPanel("memory-ribbon", true);
        s.setMode("reviewing");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "toggle-performance",
      kind: "debug",
      title: "Toggle Performance Overlay",
      subtitle: "Show FPS and memory stats",
      keywords: ["performance", "fps", "debug"],
      run: () => {
        const s = useAppStore.getState();
        s.setPerformanceOverlayOpen(!s.performanceOverlayOpen);
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "state-layout-edit",
      kind: "workspace",
      title: "State 44: Layout Edit Mode",
      subtitle: "Show resize handles and spatial editor overlays",
      keywords: ["layout", "edit", "customization", "state", "44"],
      run: () => {
        const s = useAppStore.getState();
        s.setLayoutEditMode(true);
        s.setWorkspaceView("dashboard");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "state-agent-swarm",
      kind: "agent",
      title: "State 37: Agent Swarm Queue",
      subtitle: "Open the active agent queue drawer",
      keywords: ["agent", "swarm", "queue", "state", "37"],
      run: () => {
        const s = useAppStore.getState();
        s.setDrawerOpen("agent-queue");
        s.setMode("thinking");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "state-memory-explorer",
      kind: "memory",
      title: "State 38: Memory Explorer",
      subtitle: "Open memory browser connected to timeline",
      keywords: ["memory", "explorer", "drawer", "state", "38"],
      run: () => {
        const s = useAppStore.getState();
        s.setDrawerOpen("memory");
        s.setMode("reviewing");
        s.setCommandPaletteOpen(false);
      },
    },
    {
      id: "state-tool-approval",
      kind: "tool",
      title: "State 39: Tool Approval",
      subtitle: "Open permission approval surface",
      keywords: ["tool", "approval", "permission", "state", "39"],
      run: () => {
        const s = useAppStore.getState();
        s.setDrawerOpen("tool-approval");
        s.setMode("deploying");
        s.setCommandPaletteOpen(false);
      },
    },
    ...mockupStateBank.map((state): CommandPaletteAction => ({
      id: `mockup-state-${state.id}`,
      kind: state.focus.includes("agents") ? "agent" : state.focus.includes("timeline") ? "memory" : state.focus.includes("chat") ? "run" : "workspace",
      title: `State ${state.id}: ${state.title}`,
      subtitle: state.subtitle,
      keywords: [
        "state",
        "mockup",
        state.id,
        state.theme,
        state.title,
        state.subtitle,
        ...state.focus,
      ],
      run: () => applyMockupState(state.id),
    })),
    setModeAction("calm", "Mode: Observe"),
    setModeAction("analyzing", "Mode: Understand"),
    setModeAction("generating", "Mode: Build"),
    setModeAction("deploying", "Mode: Deploy"),
    setModeAction("thinking", "Mode: Evolve"),
    focusPanelAction("system-health", "System Health"),
    focusPanelAction("project-nexus", "Project Nexus"),
    focusPanelAction("realtime-insights", "Real-time Insights"),
    focusPanelAction("model-performance", "Model Performance"),
    focusPanelAction("data-stream", "Data Stream"),
    focusPanelAction("pipeline-orchestrator", "Pipeline Orchestrator"),
    focusPanelAction("activity-feed", "Activity Feed"),
    focusPanelAction("smart-suggestions", "Smart Suggestions"),
    focusPanelAction("causality", "Causal Insights"),
    {
      id: "generate-deployment-report",
      kind: "run",
      title: "Generate deployment report",
      subtitle: "Create a report artifact on the canvas",
      keywords: ["generate", "deployment", "report", "artifact"],
      run: () => {
        handleSubmitCommand("/generate deployment report");
        useAppStore.getState().setCommandPaletteOpen(false);
      },
    },
  ];
}

export function searchCommandPaletteActions(query: string) {
  const actions = getCommandPaletteActions();
  const normalized = query.trim().toLowerCase();
  if (!normalized) return actions.slice(0, 14);
  const tokens = normalized.split(/[\s/]+/).filter(Boolean);
  const stateQuery = tokens.includes("state") || tokens.includes("mockup") || tokens.some((token) => /^\d{1,2}$/.test(token));

  return actions
    .map((action) => {
      const haystack = [action.title, action.subtitle, action.kind, ...action.keywords].filter(Boolean).join(" ").toLowerCase();
      let score = 0;
      if (action.title.toLowerCase().includes(normalized)) score += 10;
      if (haystack.includes(normalized)) score += 4;
      for (const token of tokens) if (haystack.includes(token)) score += 1;
      if (action.id.startsWith("mockup-state-") && !stateQuery) score -= 3;
      return { action, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.action)
    .slice(0, 14);
}
