import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

export function useStartupStateCleanup() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state") ?? params.get("mockupState");
    if (requestedState) return;

    const state = useAppStore.getState();
    if (state.mode === "calm" && !state.activeMockupStateId && state.activeCausalPath) {
      state.setActiveCausalPath(undefined);
    }
  }, []);
}
