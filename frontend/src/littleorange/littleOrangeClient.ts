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
  root?: string;
}

export interface LittleOrangeStreamInput {
  command: string;
  project: LittleOrangeProject;
  messages: ChatMessage[];
  onToken: (token: string) => void;
  onMeta?: (label: string) => void;
  signal?: AbortSignal;
}

export interface LittleOrangeTreeItem {
  name: string;
  type: "dir" | "file";
  ext?: string;
  rel_path: string;
}

export interface LittleOrangeReceipt {
  id?: string;
  title?: string;
  summary?: string;
  source?: string;
  ts?: string;
  path?: string;
}

export interface LittleOrangeSnapshot {
  rails: RailProbe[];
  projects: LittleOrangeProject[];
  git?: Record<string, unknown>;
  route?: Record<string, unknown>;
  routeHistory?: Record<string, unknown>;
  tree?: { ok?: boolean; items?: LittleOrangeTreeItem[]; root?: string; dir?: string; error?: string };
  receipts?: { items?: LittleOrangeReceipt[]; error?: string };
  agents?: { items?: unknown[]; total_in_memory?: number; error?: string };
  modelSwitch?: Record<string, unknown>;
  skills?: { internal?: Array<{ name: string; title: string; description: string; path: string; slash: string }>; counts?: Record<string, number> };
  deps?: Record<string, unknown>;
}

export interface LittleOrangeToolResult {
  ok: boolean;
  title: string;
  detail: string;
  data?: unknown;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (import.meta.env.DEV ? "/littleorange-api" : "http://127.0.0.1:8797");
const COMMAND_BASE_URL = import.meta.env.VITE_ORANGEBOX_COMMAND_URL || (import.meta.env.DEV ? "/littleorange-command" : "http://127.0.0.1:8787");
export const LITTLEORANGE_REPO_ROOT = import.meta.env.VITE_LITTLEORANGE_REPO_ROOT || "C:\\AtomEons\\orangebox-delta";

export const littleOrangeEndpoints = {
  apiBase: API_BASE_URL,
  commandBase: COMMAND_BASE_URL,
  repoRoot: LITTLEORANGE_REPO_ROOT,
  agentRun: `${API_BASE_URL}/api/agent/run`,
  apiHealth: `${API_BASE_URL}/api/health`,
  commandHealth: `${COMMAND_BASE_URL}/api/realtime/health`,
  status: `${COMMAND_BASE_URL}/api/status?fast=1`,
  projects: `${COMMAND_BASE_URL}/api/projects`,
  projectThread: (projectId: string) => `${COMMAND_BASE_URL}/api/project-thread?project=${encodeURIComponent(projectId)}&lite=1`,
  v4RecentProjects: `${COMMAND_BASE_URL}/api/v4/project/recent?limit=8`,
  v4ProjectTree: (root: string, dir = "") => `${COMMAND_BASE_URL}/api/v4/project/tree?root=${encodeURIComponent(root)}&dir=${encodeURIComponent(dir)}`,
  v4ProjectGit: (root: string) => `${COMMAND_BASE_URL}/api/v4/project/git?root=${encodeURIComponent(root)}`,
  v4Receipts: `${COMMAND_BASE_URL}/api/v4/receipts/list?limit=6`,
  v4RouteCurrent: `${COMMAND_BASE_URL}/api/v4/route/current`,
  v4RouteHistory: `${COMMAND_BASE_URL}/api/v4/route/history?limit=4`,
  v4AgentList: `${COMMAND_BASE_URL}/api/v4/agent/list?limit=8`,
  v4ModelSwitch: `${COMMAND_BASE_URL}/api/v4/model-switch/status`,
  v4Skills: `${COMMAND_BASE_URL}/api/v4/skills/list`,
  v4Deps: `${COMMAND_BASE_URL}/api/v4/deps/status`,
  v4RepoIndex: `${COMMAND_BASE_URL}/api/v4/repo/index`,
};

const fallbackProjects: LittleOrangeProject[] = [
  { id: "orangebox", name: "Orangebox Ops", detail: "Backend rails, receipts, Codexa", status: "active", root: LITTLEORANGE_REPO_ROOT },
  { id: "orangebox-main-system-v0", name: "AECode System", detail: "Mission source and factory contracts", status: "recent", root: LITTLEORANGE_REPO_ROOT },
  { id: "atomsmasher", name: "AtomSmasher", detail: "Compression and work compiler", status: "recent", root: LITTLEORANGE_REPO_ROOT },
  { id: "frontend", name: "Frontend Lane", detail: "Separate visual organism", status: "recent", root: LITTLEORANGE_REPO_ROOT },
];

function summarizeJson(data: unknown) {
  if (!data || typeof data !== "object") return "responded";
  const record = data as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : undefined;
  const ok = typeof record.ok === "boolean" ? `ok=${record.ok}` : undefined;
  const service = typeof record.service === "string" ? record.service : undefined;
  const version = typeof record.version === "string" ? record.version : undefined;
  return [status, service, version, ok].filter(Boolean).join(" / ") || "responded";
}

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ms);
  return { controller, timeout };
}

async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 5500): Promise<T> {
  const { controller, timeout } = withTimeout(timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: init?.signal ?? controller.signal, cache: init?.cache ?? "no-store" });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const maybeError = data && typeof data === "object" ? (data as { error?: unknown }).error : undefined;
      throw new Error(typeof maybeError === "string" ? maybeError : `HTTP ${response.status}`);
    }
    return data as T;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchJsonSoft<T>(url: string, fallback: T, timeoutMs = 5500): Promise<T> {
  try {
    return await fetchJson<T>(url, undefined, timeoutMs);
  } catch (error) {
    return { ...(fallback as object), error: error instanceof Error ? error.message : "unreachable" } as T;
  }
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
  const [legacy, recent] = await Promise.all([
    fetchJsonSoft<{ projects?: Array<{ id?: string; name?: string; title?: string; status?: string }> }>(littleOrangeEndpoints.projects, { projects: [] }),
    fetchJsonSoft<{ items?: Array<{ root?: string; name?: string; id?: string; last_opened_at?: string }> }>(littleOrangeEndpoints.v4RecentProjects, { items: [] }),
  ]);

  const legacyProjects = (legacy.projects ?? []).map((project, index) => ({
    id: project.id || project.name || `project-${index}`,
    name: project.name || project.title || project.id || `Project ${index + 1}`,
    detail: project.status || "Orangebox project",
    status: index === 0 ? "active" as const : "recent" as const,
    root: LITTLEORANGE_REPO_ROOT,
  }));

  const recentProjects = (recent.items ?? []).map((project, index) => ({
    id: project.id || project.name || project.root || `recent-${index}`,
    name: project.name || project.id || `Recent ${index + 1}`,
    detail: project.root || project.last_opened_at || "Recent workspace",
    status: "recent" as const,
    root: project.root || LITTLEORANGE_REPO_ROOT,
  }));

  const seen = new Set<string>();
  const merged = [...legacyProjects, ...recentProjects, ...fallbackProjects].filter((project) => {
    const key = project.id.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);

  return merged.length ? merged : fallbackProjects;
}

export async function loadProjectThread(projectId: string) {
  try {
    return await fetchJson<unknown>(littleOrangeEndpoints.projectThread(projectId), undefined, 4500);
  } catch {
    return undefined;
  }
}

export async function loadLittleOrangeSnapshot(activeProject?: LittleOrangeProject): Promise<LittleOrangeSnapshot> {
  const root = activeProject?.root || LITTLEORANGE_REPO_ROOT;
  const [rails, projects, git, tree, receipts, route, routeHistory, agents, modelSwitch, skills, deps] = await Promise.all([
    probeOrangeboxRails(),
    loadProjects(),
    fetchJsonSoft<Record<string, unknown>>(littleOrangeEndpoints.v4ProjectGit(root), {}),
    fetchJsonSoft<{ ok?: boolean; items?: LittleOrangeTreeItem[]; root?: string; dir?: string; error?: string }>(littleOrangeEndpoints.v4ProjectTree(root), { items: [] }),
    fetchJsonSoft<{ items?: LittleOrangeReceipt[]; error?: string }>(littleOrangeEndpoints.v4Receipts, { items: [] }),
    fetchJsonSoft<Record<string, unknown>>(littleOrangeEndpoints.v4RouteCurrent, {}),
    fetchJsonSoft<Record<string, unknown>>(littleOrangeEndpoints.v4RouteHistory, {}),
    fetchJsonSoft<{ items?: unknown[]; total_in_memory?: number; error?: string }>(littleOrangeEndpoints.v4AgentList, { items: [] }),
    fetchJsonSoft<Record<string, unknown>>(littleOrangeEndpoints.v4ModelSwitch, {}, 12_000),
    fetchJsonSoft<{ internal?: Array<{ name: string; title: string; description: string; path: string; slash: string }>; counts?: Record<string, number> }>(littleOrangeEndpoints.v4Skills, { internal: [] }),
    fetchJsonSoft<Record<string, unknown>>(littleOrangeEndpoints.v4Deps, {}, 12_000),
  ]);
  return { rails, projects, git, tree, receipts, route, routeHistory, agents, modelSwitch, skills, deps };
}

export async function runRepoIndex(root = LITTLEORANGE_REPO_ROOT): Promise<LittleOrangeToolResult> {
  try {
    const data = await fetchJson<Record<string, unknown>>(littleOrangeEndpoints.v4RepoIndex, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: root, max_files: 3500 }),
    }, 30_000);
    const totalSymbols = typeof data.total_symbols === "number" ? `${data.total_symbols} symbols` : "repo summary returned";
    return { ok: true, title: "Repo index built", detail: totalSymbols, data };
  } catch (error) {
    return { ok: false, title: "Repo index failed", detail: error instanceof Error ? error.message : "Unknown failure" };
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
        repoRoot: input.project.root || LITTLEORANGE_REPO_ROOT,
        doctrine: "custom code chat connected to Orangebox backend rails, route spine, receipts, git, skills, and project tree",
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
      const event = JSON.parse(payload) as {
        type?: string;
        token?: string;
        error?: string;
        plan?: { summary?: string };
        task?: { title?: string };
        artifact?: { title?: string };
      };
      if (event.type === "token" && event.token) input.onToken(event.token);
      if (event.type === "plan" && event.plan?.summary) input.onMeta?.(event.plan.summary);
      if (event.type === "task" && event.task?.title) input.onMeta?.(event.task.title);
      if (event.type === "artifact" && event.artifact?.title) input.onMeta?.(`Artifact: ${event.artifact.title}`);
      if (event.type === "error") throw new Error(event.error || "Agent run failed");
    }
  }
}
