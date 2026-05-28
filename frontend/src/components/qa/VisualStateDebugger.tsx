import { useAppStore } from "../../store/useAppStore";

export function VisualStateDebugger() {
  const debug = false;
  const state = useAppStore((s) => ({
    mode: s.mode,
    focusPanelId: s.focusPanelId,
    workspaceView: s.workspaceView,
    activeDrawer: s.activeDrawer,
    tasks: s.tasks.length,
    messages: s.messages.length,
    activeCausalPath: Boolean(s.activeCausalPath),
  }));
  if (!debug) return null;
  return <pre className="visual-state-debugger">{JSON.stringify(state, null, 2)}</pre>;
}
