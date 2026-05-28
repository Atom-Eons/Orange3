import type { AppState } from "../types/app";

const STORAGE_KEY = "ae-see-suite-session-v1";

export interface PersistedSession {
  messages: AppState["messages"];
  timeline: AppState["timeline"];
  composer: Pick<AppState["composer"], "selectedModel" | "selectedMode" | "selectedTools">;
  workspaceView: AppState["workspaceView"];
  artifacts: AppState["artifacts"];
  activeArtifactId?: string;
  workspaceId?: string;
}

export function loadPersistedSession(): Partial<PersistedSession> | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as PersistedSession;
  } catch {
    return undefined;
  }
}

export function savePersistedSession(state: AppState) {
  try {
    const payload: PersistedSession = {
      messages: state.messages.slice(-60),
      timeline: state.timeline.slice(-80),
      composer: {
        selectedModel: state.composer.selectedModel,
        selectedMode: state.composer.selectedMode,
        selectedTools: state.composer.selectedTools,
      },
      workspaceView: state.workspaceView,
      artifacts: state.artifacts.slice(-30),
      activeArtifactId: state.activeArtifactId,
      workspaceId: state.workspaceId,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage can be unavailable in privacy contexts.
  }
}
