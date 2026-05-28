import { useEffect } from "react";
import { handleSubmitCommand, cancelActiveRun } from "../engine/taskRunner";
import { useAppStore } from "../store/useAppStore";

export function useKeyboardShortcuts() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      const store = useAppStore.getState();

      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        store.setCommandPaletteOpen(!store.commandPaletteOpen);
        return;
      }

      if (meta && event.key.toLowerCase() === "l") {
        event.preventDefault();
        document.querySelector<HTMLTextAreaElement>(".composer__textarea")?.focus();
        return;
      }

      if (meta && event.key === "Enter") {
        event.preventDefault();
        handleSubmitCommand(store.composer.value || store.composer.planPreview?.userCommand || "");
        return;
      }

      if (event.key === "Escape") {
        if (store.commandPaletteOpen) {
          store.setCommandPaletteOpen(false);
          return;
        }
        if (store.activeDrawer) {
          store.setDrawerOpen(undefined);
          return;
        }
        if (store.activeModal) {
          store.setModalOpen(undefined);
          return;
        }
        if (store.layoutEditMode) {
          store.setLayoutEditMode(false);
          return;
        }
        if (store.workspaceView !== "dashboard") {
          store.setWorkspaceView("dashboard");
          return;
        }
        if (store.panels.some((panel) => panel.expanded)) {
          store.collapseAllPanels();
          return;
        }
        store.clearFocus();
        store.setSlashMenuOpen(false);
      }

      if (event.key === "Pause") cancelActiveRun();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
