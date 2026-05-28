import { createLatencyCausalPath } from "./causalityEngine";
import { createId } from "./id";
import { getMockupStateSpec, type MockupTheme } from "./mockupStateBank";
import { useAppStore } from "../store/useAppStore";
import { seedAgents } from "../data/seed";
import type { PanelId, PendingToolApproval, SystemMode } from "../types/app";
import type { ArtifactKind } from "../types/artifacts";

const themeMode: Record<MockupTheme, SystemMode> = {
  calm: "calm",
  listening: "listening",
  thinking: "thinking",
  analyzing: "analyzing",
  generating: "generating",
  alert: "alert",
  deploying: "deploying",
  reviewing: "reviewing",
  lowlight: "reviewing",
  highcontrast: "analyzing",
  offline: "reviewing",
  red: "alert",
  magenta: "generating",
  gold: "reviewing",
  green: "reviewing",
};

const focusPanel: Record<string, PanelId> = {
  system: "system-health",
  project: "project-nexus",
  insights: "realtime-insights",
  model: "model-performance",
  stream: "data-stream",
  pipeline: "pipeline-orchestrator",
  activity: "activity-feed",
  suggestions: "smart-suggestions",
  causality: "causality",
  timeline: "memory-ribbon",
};

const expandedPanelByState: Record<string, PanelId> = {
  "13": "system-health",
  "14": "project-nexus",
  "15": "realtime-insights",
  "16": "model-performance",
  "17": "data-stream",
  "18": "pipeline-orchestrator",
  "19": "activity-feed",
  "20": "smart-suggestions",
  "21": "causality",
  "22": "memory-ribbon",
  "24": "system-health",
};

function createStateArtifact(id: string, kind: ArtifactKind | string, title: string) {
  const now = Date.now();
  return {
    id: `artifact-state-${id}`,
    kind,
    title,
    createdAt: now,
    updatedAt: now,
    relatedPanelIds: ["pipeline-orchestrator", "model-performance", "smart-suggestions"] as PanelId[],
    content: [
      `# ${title}`,
      "",
      "Generated from AE See-Suite workspace state.",
      "",
      "- Current pipeline: v2.4 canary pending",
      "- Primary risk: gateway pressure",
      "- Recommended action: staged rollout with rollback gate",
      "- Evidence: causality, memory, model comparison, activity timeline",
    ].join("\n"),
  };
}

function createCanvasArtifactBranch(id: string, title: string, content: string[]) {
  const now = Date.now();
  return {
    id: `artifact-state-61-${id}`,
    kind: "report" as const,
    title,
    createdAt: now,
    updatedAt: now,
    relatedPanelIds: ["pipeline-orchestrator", "model-performance", "smart-suggestions"] as PanelId[],
    content: content.join("\n"),
  };
}

function seedLivingCanvasArtifactView() {
  const state = useAppStore.getState();
  const branches = [
    createCanvasArtifactBranch("draft-a", "Draft A", [
      "Executive summary of current workspace state",
      "Causal evidence and risk posture",
      "Recommended remediation sequence",
      "Next actions and task owners",
    ]),
    createCanvasArtifactBranch("draft-b", "Draft B", [
      "Alternate rollout narrative",
      "Gateway saturation evidence",
      "Canary constraints and guardrails",
      "Follow-up tasks for deploy agent",
    ]),
    createCanvasArtifactBranch("review", "Review", [
      "Critic notes and risk edits",
      "Latency threshold missing",
      "Rollback owner required",
      "Ready after revision",
    ]),
    createCanvasArtifactBranch("export", "Export", [
      "Final report package",
      "Workspace snapshot attached",
      "Timeline and causal trail embedded",
      "Export target: operator review",
    ]),
  ];

  branches.forEach((artifact) => state.addArtifact(artifact));
  useAppStore.getState().setActiveArtifact("artifact-state-61-draft-a");
}

function seedActiveTask(id: string) {
  const state = useAppStore.getState();
  const taskId = `state-task-${id}`;
  state.addTask({
    id: taskId,
    title: `State ${id} agent run`,
    description: "Mockup-bank state task seeded for visual choreography.",
    status: "running",
    assignedAgentId: id === "70" ? "deploy" : id === "23" || id === "37" ? "analyst" : "builder",
    progress: id === "27" ? 18 : id === "28" ? 64 : 42,
    startedAt: Date.now(),
    relatedPanelIds: ["pipeline-orchestrator", "causality", "smart-suggestions"],
  });
}

function seedToolMessage(id: string, ok: boolean) {
  const state = useAppStore.getState();
  state.addMessage({
    id: `state-tool-${id}-${Date.now()}`,
    role: "tool",
    content: ok ? "deployment.simulate completed. Timeline updated." : "deployment.simulate running...",
    createdAt: Date.now(),
    status: ok ? "complete" : "streaming",
    relatedPanelIds: ["pipeline-orchestrator"],
  });
}

function seedPendingToolApprovals() {
  const state = useAppStore.getState();
  const createdAt = Date.now();

  const approvals: PendingToolApproval[] = [
    {
      id: "state-approval-deploy-simulate",
      toolName: "deployment.simulate",
      label: "deployment.simulate",
      description: "Run canary impact simulation against live pipeline context.",
      permissions: ["read", "execute"],
      args: { target: "model-v2.4", canary: "5%", region: "us-east-1" },
      createdAt,
      status: "pending" as const,
    },
    {
      id: "state-approval-artifact-write",
      toolName: "artifact.write",
      label: "artifact.write",
      description: "Write deployment report branch into the living canvas.",
      permissions: ["read", "write"],
      args: { artifactKind: "deployment-plan", branch: "review" },
      createdAt,
      status: "pending" as const,
    },
    {
      id: "state-approval-metrics-query",
      toolName: "metrics.query",
      label: "metrics.query",
      description: "Query p95 gateway latency and stream health for approval context.",
      permissions: ["read"],
      args: { metric: "gateway.p95", window: "30m" },
      createdAt,
      status: "pending" as const,
    },
  ];

  approvals.forEach((approval) => state.addPendingApproval(approval));
}

function resetMockupTransientState() {
  useAppStore.setState((current) => ({
    activeCausalPath: undefined,
    activeArtifactId: undefined,
    eventToasts: [],
    pendingApprovals: [],
    tasks: [],
    agents: seedAgents.map((agent) => ({ ...agent, taskId: undefined })),
    artifacts: current.artifacts.filter((artifact) => !artifact.id.startsWith("artifact-state-")),
    messages: current.messages.filter(
      (message) => !message.id.startsWith("state-tool-") && !message.id.startsWith("error-message-"),
    ),
    composer: {
      ...current.composer,
      value: "",
      isFocused: false,
      slashMenuOpen: false,
      planPreview: undefined,
    },
  }));
}

function activateMockupLatencyScenario() {
  const activeCausalPath = createLatencyCausalPath();
  const activeIds: PanelId[] = ["realtime-insights", "data-stream", "model-performance", "system-health", "activity-feed", "causality"];

  useAppStore.setState((current) => ({
    activeCausalPath,
    mode: "alert",
    energy: 1,
    composer: { ...current.composer, contextPanelIds: activeIds.slice(0, 4) },
    panels: current.panels.map((panel) => {
      const active = activeIds.includes(panel.id);
      return {
        ...panel,
        dimmed: !active,
        highlighted: active,
        severity: active ? ("critical" as const) : panel.severity,
      };
    }),
    agents: current.agents.map((agent) => {
      if (agent.id === "watcher" || agent.id === "analyst") return { ...agent, state: "working" as const, energy: 1 };
      return { ...agent, energy: Math.min(agent.energy, 0.55) };
    }),
  }));
}

function activateMockupCausalMemory() {
  useAppStore.setState((current) => ({
    activeCausalPath: createLatencyCausalPath(),
    panels: current.panels.map((panel) =>
      panel.id === "causality"
        ? { ...panel, highlighted: true, severity: "info" as const }
        : panel,
    ),
  }));
}

export function applyMockupState(id: string | number) {
  const spec = getMockupStateSpec(id);

  useAppStore.getState().resetToBaseline();
  resetMockupTransientState();
  const state = useAppStore.getState();
  state.setActiveMockupState(spec.id);
  state.setMode(themeMode[spec.theme]);
  state.setEnergy(["alert", "red", "magenta", "generating"].includes(spec.theme) ? 1 : 0.72);
  state.setCommandPaletteOpen(false);
  state.setDrawerOpen(undefined);
  state.setModalOpen(undefined);
  state.setPerformanceOverlayOpen(false);
  state.setLayoutEditMode(false);
  state.collapseAllPanels();
  state.clearFocus();

  if (spec.id !== "12") {
    activateMockupCausalMemory();
  }

  if (!["40", "61", "62", "63", "64", "65", "69"].includes(spec.id)) {
    state.setWorkspaceView("dashboard");
  }

  const primaryPanel = spec.focus.map((focus) => focusPanel[focus]).find(Boolean);
  if (primaryPanel && primaryPanel !== "memory-ribbon") state.focusPanel(primaryPanel);

  const expandedPanelId = expandedPanelByState[spec.id];
  if (expandedPanelId) state.expandPanel(expandedPanelId, true);

  if (["06", "15", "21", "24", "49", "53", "55", "58", "59"].includes(spec.id)) {
    activateMockupLatencyScenario();
    useAppStore.getState().setActiveMockupState(spec.id);
  }

  if (["23", "27", "28", "29", "37", "54", "70"].includes(spec.id)) {
    seedActiveTask(spec.id);
  }

  if (spec.id === "25") {
    state.setComposerFocus(true);
    state.setComposerValue("/generate");
    state.setSlashMenuOpen(true);
  }

  if (spec.id === "26") {
    state.setCommandPaletteOpen(true);
    state.setCommandPaletteQuery("latency / deploy / canvas");
  }
  if (spec.id === "29") seedToolMessage(spec.id, false);
  if (spec.id === "30") seedToolMessage(spec.id, true);

  if (spec.id === "32") {
    state.setComposerFocus(true);
    state.setComposerValue("Describe the architectural dependencies for Phase 4...");
  }

  if (spec.id === "33") state.setModalOpen("context-picker");
  if (spec.id === "34") state.setModalOpen("model-selector");
  if (spec.id === "35") state.setModalOpen("stop-confirm");
  if (spec.id === "36") {
    state.addMessage({
      id: createId("error-message"),
      role: "assistant",
      content: "Tool stream failed. Retry with mock backend or continue from cached workspace state.",
      createdAt: Date.now(),
      status: "error",
      relatedPanelIds: ["pipeline-orchestrator"],
    });
  }

  if (spec.id === "37") state.setDrawerOpen("agent-queue");
  if (["38", "67"].includes(spec.id)) state.setDrawerOpen("memory");
  if (spec.id === "39") {
    seedPendingToolApprovals();
    useAppStore.getState().setActiveMockupState(spec.id);
  }
  if (spec.id === "40") state.setDrawerOpen("artifact-inspector");
  if (spec.id === "41") state.setDrawerOpen("settings");
  if (spec.id === "42") state.setDrawerOpen("notifications");
  if (spec.id === "43") state.setModalOpen("add-widget");
  if (spec.id === "44") state.setLayoutEditMode(true);
  if (spec.id === "45") state.setModalOpen("shortcuts");
  if (spec.id === "46") state.setModalOpen("export");
  if (spec.id === "47") state.setModalOpen("approval");
  if (spec.id === "48") state.setPerformanceOverlayOpen(true);

  if (["40", "62", "63", "64", "65", "69"].includes(spec.id)) {
    const kind = spec.id === "64" ? "code" : spec.id === "65" ? "image" : spec.id === "69" ? "analysis" : "report";
    state.addArtifact(createStateArtifact(spec.id, kind, spec.title));
    useAppStore.getState().setActiveMockupState(spec.id);
  }

  if (spec.id === "61") {
    seedLivingCanvasArtifactView();
    useAppStore.getState().setActiveMockupState(spec.id);
  }

  if (spec.id === "40") {
    useAppStore.getState().setWorkspaceView("dashboard");
  }

  if (spec.id === "62") state.setModalOpen("compare");
  if (spec.id === "66") {
    state.setComposerValue("Compare prompt version history for deployment report.");
    state.setDrawerOpen("memory");
  }
  if (spec.id === "68") state.setActiveCausalPath(createLatencyCausalPath());
  if (spec.id === "71") state.setModalOpen("add-widget");
  if (spec.id === "72") {
    state.addEventToast({
      title: "Workspace snapshot saved",
      description: "Restore point created from current layout, memory and artifacts.",
      severity: "success",
    });
  }
}
