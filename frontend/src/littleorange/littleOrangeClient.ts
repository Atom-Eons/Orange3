import type { ChatMessage } from "../types/app";

export type RailState = "online" | "offline" | "checking";

export interface RailProbe {
  id: string;
  label: string;
  state: RailState;
  detail: string;
  url: string;
  latencyMs?: number;
}

export interface LittleOrangeProject {
  id: string;
  name: string;
  detail: string;
  status: "active" | "recent" | "offline";
}

export interface LittleOrangeStreamInput {
  command: string;
  project: LittleOrangeProject;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  onMeta?: (label: string) => void;
  signal?: AbortSignal;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "/littleorange-api" : "http://127.0.0.1:8797");
const COMMAND_BASE_URL = import.meta.env.VITE_ORANGEBOX_COMMAND_URL || (import.meta.env.DEV ? "/littleorange-command" : "http://127.0.0.1:8787");

export const littleOrangeEndpoints = {
  apiBase: API_BASE_URL,
  commandBase: COMMAND_BASE_URL,
  agentRun: `${API_BASE_URL}/api/agent/run`,
  apiHealth: `${API_BASE_URL}/api/health`,
  commandHealth: `${COMMAND_BASE_URL}/api/realtime/health`,
  status: `${COMMAND_BASE_URL}/api/status?fast=1`,
  projects: `${COMMAND_BASE_URL}/api/projects`,
  projectThread: (projectId: string) => `${COMMAND_BASE_URL}/api/project-thread?project=${encodeURIComponent(projectId)}&lite=1`,
};

const fallbackProjects: LittleOrangeProject[] = [
  { id: "orangebox", name: "Orangebox Ops", detail: "Backend rails, receipts, Codexa", status: "active" },
  { id: "orangebox-main-system-v0", name: "AECode System", detail: "Mission source and factory contracts", status: "recent" },
  { id: "atomsmasher", name: "AtomSmasher", detail: "Compression and work compiler", status: "recent" },
  { id: "frontend", name: "Frontend Lane", detail: "Separate visual organism", status: "recent" },
];

function summarizeJson(data: unknown) {
  if (!data || typeof data !== "object") return "responded";
  const record = data as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : undefined;
  const ok = typeof record.ok === "boolean" ? `ok=${record.ok}` : undefined;
  const service = typeof record.service === "string" ? record.service : undefined;
  return [status, service, ok].filter(Boolean).join(" / ") || "responded";
}

export async function probeRail(id: string, label: string, url: string): Promise<RailProbe> {
  const started = performance.now();
  try {
    const response = await fetch(url, { cache: "no-store" });
    const latencyMs = Math.round(performance.now() - started);
    let data: unknown = undefined;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    return {
      id,
      label,
      state: response.ok ? "online" : "offline",
      detail: response.ok ? summarizeJson(data) : `HTTP ${response.status}`,
      url,
      latencyMs,
    };
  } catch (error) {
    return {
      id,
      label,
      state: "offline",
      detail: error instanceof Error ? error.message : "unreachable",
      url,
    };
  }
}

export async function probeOrangeboxRails() {
  const [api, command, status] = await Promise.all([
    probeRail("api", "API", littleOrangeEndpoints.apiHealth),
    probeRail("command", "Command", littleOrangeEndpoints.commandHealth),
    probeRail("ops", "Ops", littleOrangeEndpoints.status),
  ]);
  return [api, command, status];
}

export async function loadProjects(): Promise<LittleOrangeProject[]> {
  try {
    const response = await fetch(littleOrangeEndpoints.projects, { cache: "no-store" });
    if (!response.ok) return fallbackProjects;
    const data = await response.json() as { projects?: Array<{ id?: string; name?: string; title?: string; status?: string }> };
    const projects = (data.projects ?? [])
      .map((project, index) => ({
        id: project.id || project.name || `project-${index}`,
        name: project.name || project.title || project.id || `Project ${index + 1}`,
        detail: project.status || "Orangebox project",
        status: index === 0 ? "active" as const : "recent" as const,
      }))
      .slice(0, 8);
    return projects.length ? projects : fallbackProjects;
  } catch {
    return fallbackProjects;
  }
}

export async function loadProjectThread(projectId: string) {
  try {
    const response = await fetch(littleOrangeEndpoints.projectThread(projectId), { cache: "no-store" });
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function eventPayloads(buffer: string) {
  const parts = buffer.split("\n\n");
  const remainder = parts.pop() ?? "";
  const payloads = parts
    .map((part) => part.split("\n").find((line) => line.startsWith("data:")))
    .filter((line): line is string => Boolean(line))
    .map((line) => line.replace(/^data:\s*/, ""));
  return { payloads, remainder };
}

export async function streamLittleOrangeRun(input: LittleOrangeStreamInput) {
  const response = await fetch(littleOrangeEndpoints.agentRun, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId: input.project.id,
      sessionId: "littleorange-local",
      command: input.command,
      messages: input.messages,
      workspace: {
        surface: "LittleOrange",
        project: input.project,
        doctrine: "simple code chat connected to Orangebox backend rails",
      },
    }),
    signal: input.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(text || `Agent run failed: HTTP ${response.status}`);
  }

  if (!response.body) {
    const data = await response.json().catch(() => undefined);
    input.onToken(JSON.stringify(data ?? { ok: true }, null, 2));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parsed = eventPayloads(buffer);
    buffer = parsed.remainder;

    for (const payload of parsed.payloads) {
      const event = JSON.parse(payload) as { type?: string; token?: string; error?: string; plan?: { summary?: string }; task?: { title?: string }; artifact?: { title?: string } };
      if (event.type === "token" && event.token) input.onToken(event.token);
      if (event.type === "plan" && event.plan?.summary) input.onMeta?.(event.plan.summary);
      if (event.type === "task" && event.task?.title) input.onMeta?.(event.task.title);
      if (event.type === "artifact" && event.artifact?.title) input.onMeta?.(`Artifact: ${event.artifact.title}`);
      if (event.type === "error") throw new Error(event.error || "Agent run failed");
    }
  }
}
