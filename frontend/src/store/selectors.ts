import type { AppState, PanelId } from "../types/app";

export const selectActiveTasks = (s: AppState) =>
  s.tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status));

export const selectRunningTaskCount = (s: AppState) => selectActiveTasks(s).length;

export const selectActiveAgents = (s: AppState) =>
  s.agents.filter((agent) => ["thinking", "working", "blocked"].includes(agent.state));

export const selectPanelById = (id: PanelId) => (s: AppState) => s.panels.find((panel) => panel.id === id);

export const selectTimelineTail = (count = 8) => (s: AppState) => s.timeline.slice(-count);
