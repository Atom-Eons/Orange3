import { useEffect } from "react";
import { getOrCreateWorkspaceId } from "../engine/workspaceClient";
import { useAppStore } from "../store/useAppStore";

export function useWorkspaceBootstrap() {
  const setWorkspaceId = useAppStore((s) => s.setWorkspaceId);
  useEffect(() => {
    if (import.meta.env.VITE_AGENT_BACKEND !== "remote") return;
    void getOrCreateWorkspaceId().then(setWorkspaceId).catch((error) => console.error(error));
  }, [setWorkspaceId]);
}
