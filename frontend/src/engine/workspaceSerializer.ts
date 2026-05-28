import type { AppState } from "../types/app";

export function serializeWorkspaceForLLM(state: AppState) {
  return {
    mode: state.mode,
    workspaceView: state.workspaceView,
    focusPanelId: state.focusPanelId,
    selectedModel: state.composer.selectedModel,
    selectedMode: state.composer.selectedMode,
    selectedTools: state.composer.selectedTools,
    contextPanels: state.composer.contextPanelIds,
    metrics: state.metrics,
    activeCausalPath: state.activeCausalPath,
    panels: state.panels.map((panel) => ({
      id: panel.id,
      title: panel.title,
      kind: panel.kind,
      severity: panel.severity,
      expanded: panel.expanded,
      connectedTo: panel.connectedTo,
    })),
    agents: state.agents.map((agent) => ({
      id: agent.id,
      label: agent.label,
      state: agent.state,
      connectedPanel: agent.connectedPanel,
      taskId: agent.taskId,
    })),
    activeTasks: state.tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status)),
    timelineTail: state.timeline.slice(-12),
    metricTail: state.metricHistory.slice(-12),
    conversationTail: state.messages.slice(-10),
  };
}
