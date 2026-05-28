const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const STORAGE_KEY = "ae-see-suite-workspace-id";

export async function getOrCreateWorkspaceId() {
  const existing = window.localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;

  const base = API_BASE_URL || window.location.origin;
  const response = await fetch(`${base}/api/workspaces`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Project Nexus", description: "Local AE See-Suite workspace" }),
  });
  const data = await response.json();
  if (!data.ok) throw new Error("Failed to create workspace");
  window.localStorage.setItem(STORAGE_KEY, data.workspace.id);
  return data.workspace.id as string;
}
