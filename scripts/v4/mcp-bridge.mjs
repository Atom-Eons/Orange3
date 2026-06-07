/* mcp-bridge.mjs - ORANGEBOX generic MCP registry + verifier.
 *
 * This bridge does not install third-party servers and does not mutate host MCP
 * configs. It keeps ORANGEBOX's own MCP registry under dataRoot, probes health
 * and tool-list availability, and records enough evidence for promotion gates.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export const MCP_AUTH_SPEC_VERSION = "mcp-auth-spec/v1";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}

function bridgeDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "mcp");
}

function registryPath(dataRoot = defaultDataRoot()) {
  return path.join(bridgeDir(dataRoot), "bridge-servers.json");
}

function probeDir(dataRoot = defaultDataRoot()) {
  return path.join(bridgeDir(dataRoot), "probes");
}

function probePath(dataRoot, id) {
  return path.join(probeDir(dataRoot), `${id}.json`);
}

function nowIso() {
  return new Date().toISOString();
}

function idFromName(name) {
  return String(name || "mcp")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || `mcp-${crypto.randomUUID().slice(0, 8)}`;
}

function assertHttpUrl(url) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("remote MCP URL must be http(s)");
  return u.toString();
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, stableJsonValue(value[key])])
    );
  }
  return value;
}

function sha256Json(value) {
  return crypto.createHash("sha256").update(JSON.stringify(stableJsonValue(value))).digest("hex");
}

export function canonicalToolDescriptors(tools = []) {
  return (Array.isArray(tools) ? tools : [])
    .map(stableJsonValue)
    .sort((a, b) => {
      const byName = String(a?.name || "").localeCompare(String(b?.name || ""));
      if (byName !== 0) return byName;
      return sha256Json(a).localeCompare(sha256Json(b));
    });
}

export function hashToolDescriptors(tools = []) {
  return sha256Json(canonicalToolDescriptors(tools));
}

export const BUILT_IN_MCP_SERVERS = [
  {
    id: "meta-ads-mcp",
    name: "Meta Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://mcp.facebook.com/ads",
    status: "official_high_confidence_probe_required",
    source_urls: [
      "https://mcp.facebook.com/ads"
    ],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Register and probe before use. Keep native Meta CAPI path as primary until tool-list and auth behavior are observed."
  },
  {
    id: "tiktok-ads-mcp",
    name: "TikTok Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://business-api.tiktok.com/mcp",
    status: "official_confirmed_probe_required",
    source_urls: [
      "https://newsroom.tiktok.com/tiktok-world-26-turning-discovery-into-business-growth-with-ai-powered-innovations-vertical-experiences-and-high-impact-brand-solutions"
    ],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "TikTok newsroom confirmed the TikTok Ads MCP Server at TikTok World 2026. Probe endpoint before enabling write workflows."
  },
  {
    id: "google-ads-mcp",
    name: "Google Ads MCP",
    category: "ads",
    transport: "stdio",
    command: "pipx",
    args: ["run", "--spec", "git+https://github.com/googleads/google-ads-mcp.git", "google-ads-mcp"],
    status: "official_repo_confirmed_install_safe",
    source_urls: [
      "https://github.com/googleads/google-ads-mcp"
    ],
    auth: {
      mode: "google_ads_credentials",
      env_required: ["GOOGLE_PROJECT_ID", "GOOGLE_ADS_DEVELOPER_TOKEN"]
    },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Registered as metadata by default. Do not spawn/install from ORANGEBOX until operator approves dependency installation."
  },
  {
    id: "pipeboard-meta-ads",
    name: "Pipeboard Meta Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://meta-ads.mcp.pipeboard.co/",
    status: "vendor_confirmed_probe_required",
    source_urls: ["https://pipeboard.co/"],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Third-party aggregator. Evaluate privacy and business fit before writes."
  },
  {
    id: "pipeboard-google-ads",
    name: "Pipeboard Google Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://google-ads.mcp.pipeboard.co/",
    status: "vendor_confirmed_probe_required",
    source_urls: ["https://pipeboard.co/"],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Third-party aggregator. Evaluate privacy and business fit before writes."
  },
  {
    id: "pipeboard-tiktok-ads",
    name: "Pipeboard TikTok Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://tiktok-ads.mcp.pipeboard.co/",
    status: "vendor_confirmed_probe_required",
    source_urls: ["https://pipeboard.co/"],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Third-party aggregator. Evaluate privacy and business fit before writes."
  },
  {
    id: "pipeboard-snap-ads",
    name: "Pipeboard Snap Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://snap-ads.mcp.pipeboard.co/",
    status: "vendor_confirmed_probe_required",
    source_urls: ["https://pipeboard.co/"],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Third-party aggregator. Evaluate privacy and business fit before writes."
  },
  {
    id: "pipeboard-reddit-ads",
    name: "Pipeboard Reddit Ads MCP",
    category: "ads",
    transport: "http",
    url: "https://reddit-ads.mcp.pipeboard.co/",
    status: "vendor_confirmed_probe_required",
    source_urls: ["https://pipeboard.co/"],
    auth: { mode: "oauth_remote", vault_required: true },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Third-party aggregator. Evaluate privacy and business fit before writes."
  },
  {
    id: "firecrawl-mcp",
    name: "Firecrawl MCP",
    category: "research",
    transport: "stdio",
    command: "npx",
    args: ["-y", "firecrawl-mcp"],
    status: "install_safe_key_required",
    auth: { mode: "api_key", env_required: ["FIRECRAWL_API_KEY"] },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: false },
    notes: "Use low-bandwidth crawl policy. No broad unaudited scraping."
  },
  {
    id: "claude-flow",
    name: "Claude Flow",
    category: "orchestration",
    transport: "stdio",
    command: "npx",
    args: ["-y", "claude-flow"],
    status: "topology_candidate",
    auth: { mode: "local" },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: true },
    notes: "Candidate swarm topology. Must beat existing department router before promotion."
  },
  {
    id: "repomix-mcp",
    name: "Repomix MCP",
    category: "code-packaging",
    transport: "stdio",
    command: "npx",
    args: ["-y", "repomix", "--mcp"],
    status: "install_safe",
    auth: { mode: "local" },
    permissions: { default_mode: "read_only", write_requires_operator_confirmation: false },
    notes: "Complements repo-indexer and handoff packaging."
  },
  {
    id: "stackgen-mcp",
    name: "StackGen MCP",
    category: "infra",
    transport: "unknown",
    status: "verification_required",
    auth: { mode: "unknown" },
    permissions: { default_mode: "disabled", write_requires_operator_confirmation: true },
    notes: "Hold. Enterprise IaC write surface is too risky without primary endpoint/tool contract."
  }
];

async function readCustomServers(dataRoot = defaultDataRoot()) {
  const file = registryPath(dataRoot);
  try {
    const doc = JSON.parse(await fs.readFile(file, "utf8"));
    return Array.isArray(doc.servers) ? doc.servers : [];
  } catch {
    return [];
  }
}

async function writeCustomServers(dataRoot, servers) {
  await fs.mkdir(bridgeDir(dataRoot), { recursive: true });
  const doc = {
    schema_version: 1,
    updated_at: nowIso(),
    servers,
  };
  await fs.writeFile(registryPath(dataRoot), JSON.stringify(doc, null, 2), "utf8");
  return doc;
}

async function readLastProbe(dataRoot, id) {
  try {
    return JSON.parse(await fs.readFile(probePath(dataRoot, id), "utf8"));
  } catch {
    return null;
  }
}

async function writeProbe(dataRoot, id, probe) {
  await fs.mkdir(probeDir(dataRoot), { recursive: true });
  await fs.writeFile(probePath(dataRoot, id), JSON.stringify(probe, null, 2), "utf8");
}

function sanitizeServer(server, last_probe = null) {
  const clean = {
    ...server,
    auth_spec_version: server.auth_spec_version || MCP_AUTH_SPEC_VERSION,
    auth: server.auth || { mode: "unknown" },
    permissions: {
      default_mode: server.permissions?.default_mode || "read_only",
      write_requires_operator_confirmation: server.permissions?.write_requires_operator_confirmation !== false,
      allow_tools: Array.isArray(server.permissions?.allow_tools) ? server.permissions.allow_tools : [],
      deny_tools: Array.isArray(server.permissions?.deny_tools) ? server.permissions.deny_tools : [],
    },
  };
  delete clean.secret;
  delete clean.token;
  delete clean.api_key;
  return {
    ...clean,
    last_probe,
  };
}

export async function listServers({ dataRoot = defaultDataRoot(), includeProbes = true } = {}) {
  const custom = await readCustomServers(dataRoot);
  const byId = new Map();
  for (const server of BUILT_IN_MCP_SERVERS) byId.set(server.id, { ...server, origin: "builtin" });
  for (const server of custom) byId.set(server.id, { ...server, origin: "custom" });
  const servers = [];
  for (const server of byId.values()) {
    const last_probe = includeProbes ? await readLastProbe(dataRoot, server.id) : null;
    servers.push(sanitizeServer(server, last_probe));
  }
  servers.sort((a, b) => String(a.category || "").localeCompare(String(b.category || "")) || String(a.id).localeCompare(String(b.id)));
  return {
    ok: true,
    registry_path: registryPath(dataRoot),
    count: servers.length,
    servers,
  };
}

export async function getServer(dataRoot, id) {
  const all = await listServers({ dataRoot, includeProbes: false });
  return all.servers.find((server) => server.id === id) || null;
}

export async function registerServer({ dataRoot = defaultDataRoot(), body = {} } = {}) {
  const id = idFromName(body.id || body.name || body.url);
  const transport = body.transport || (body.url ? "http" : "stdio");
  const entry = {
    id,
    name: body.name || id,
    category: body.category || "custom",
    transport,
    url: body.url ? assertHttpUrl(body.url) : undefined,
    command: body.command || undefined,
    args: Array.isArray(body.args) ? body.args.map(String) : undefined,
    status: body.status || "custom_registered_probe_required",
    source_urls: Array.isArray(body.source_urls) ? body.source_urls.map(String) : [],
    auth_spec_version: body.auth_spec_version || MCP_AUTH_SPEC_VERSION,
    auth: body.auth || { mode: "operator_supplied" },
    permissions: {
      default_mode: body.default_mode || "read_only",
      write_requires_operator_confirmation: body.write_requires_operator_confirmation !== false,
      allow_tools: Array.isArray(body.allow_tools) ? body.allow_tools.map(String) : [],
      deny_tools: Array.isArray(body.deny_tools) ? body.deny_tools.map(String) : [],
    },
    disabled: !!body.disabled,
    notes: body.notes || "",
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  if (entry.transport === "http" && !entry.url) throw new Error("http MCP server requires url");
  if (entry.transport === "stdio" && !entry.command) throw new Error("stdio MCP server requires command");
  const custom = (await readCustomServers(dataRoot)).filter((server) => server.id !== id);
  custom.push(entry);
  await writeCustomServers(dataRoot, custom);
  return { ok: true, server: sanitizeServer(entry), registry_path: registryPath(dataRoot) };
}

async function fetchLimited(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetch(url, { ...options, signal: controller.signal, redirect: "manual" });
    const contentType = res.headers.get("content-type") || "";
    const text = (await res.text()).slice(0, 4096);
    return {
      ok: true,
      status: res.status,
      content_type: contentType,
      duration_ms: Date.now() - started,
      body_preview: text.slice(0, 500),
      json: contentType.includes("json") ? tryParseJson(text) : null,
    };
  } catch (err) {
    return {
      ok: false,
      error: err?.name === "AbortError" ? "timeout" : err?.message || String(err),
      duration_ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

function tryParseJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function summarizeProbe(server, health, toolsList) {
  const tools = Array.isArray(toolsList?.json?.result?.tools) ? toolsList.json.result.tools : [];
  const toolDescriptorHash = tools.length ? hashToolDescriptors(tools) : null;
  const authLikely = [401, 403].includes(health?.status) || [401, 403].includes(toolsList?.status);
  const jsonRpcOk = !!toolsList?.json?.result || !!toolsList?.json?.error;
  return {
    ok: !!(health?.ok || toolsList?.ok),
    id: server.id,
    probed_at: nowIso(),
    transport: server.transport,
    url: server.url || null,
    health: health || null,
    tools_list: toolsList || null,
    tools_count: tools.length,
    tool_descriptor_hash: toolDescriptorHash,
    tools: tools.slice(0, 100).map((tool) => ({
      name: tool.name,
      description: tool.description || "",
      input_schema_present: !!tool.inputSchema,
      descriptor_hash: hashToolDescriptors([tool]),
    })),
    auth_likely_required: authLikely,
    auth_spec_version: server.auth_spec_version || MCP_AUTH_SPEC_VERSION,
    mcp_jsonrpc_observed: jsonRpcOk,
    default_mode: server.permissions?.default_mode || "read_only",
    write_requires_operator_confirmation: server.permissions?.write_requires_operator_confirmation !== false,
    promotion_gate: tools.length > 0 ? "tool_list_observed_review_required" : authLikely ? "auth_required_before_tool_list" : "endpoint_reachable_tool_list_not_observed",
  };
}

export async function probeServer({ dataRoot = defaultDataRoot(), id, timeoutMs = 7000 } = {}) {
  if (!id) throw new Error("server id required");
  const server = await getServer(dataRoot, id);
  if (!server) throw new Error(`unknown MCP server: ${id}`);
  const previousProbe = await readLastProbe(dataRoot, id);
  if (server.disabled) {
    const probe = { ok: false, id, probed_at: nowIso(), disabled: true, promotion_gate: "disabled" };
    await writeProbe(dataRoot, id, probe);
    return probe;
  }
  if (server.transport !== "http") {
    const probe = {
      ok: true,
      id,
      probed_at: nowIso(),
      transport: server.transport,
      metadata_only: true,
      command: server.command || null,
      args_count: Array.isArray(server.args) ? server.args.length : 0,
      promotion_gate: "spawn_probe_requires_operator_install_approval",
      auth_spec_version: server.auth_spec_version || MCP_AUTH_SPEC_VERSION,
      default_mode: server.permissions?.default_mode || "read_only",
      write_requires_operator_confirmation: server.permissions?.write_requires_operator_confirmation !== false,
    };
    await writeProbe(dataRoot, id, probe);
    return probe;
  }

  const health = await fetchLimited(server.url, { method: "GET", headers: { "Accept": "application/json, text/event-stream, */*" } }, timeoutMs);
  const toolsList = await fetchLimited(server.url, {
    method: "POST",
    headers: {
      "Accept": "application/json, text/event-stream",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: `obx-${Date.now()}`, method: "tools/list", params: {} }),
  }, timeoutMs);
  const probe = summarizeProbe(server, health, toolsList);
  const previousHash = previousProbe?.tool_descriptor_hash || null;
  const currentHash = probe.tool_descriptor_hash || null;
  probe.previous_tool_descriptor_hash = previousHash;
  probe.tool_descriptor_drift = Boolean(previousHash && currentHash && previousHash !== currentHash);
  if (probe.tool_descriptor_drift) {
    const previousNames = new Set((previousProbe?.tools || []).map((tool) => String(tool.name || "")));
    const currentNames = new Set((probe.tools || []).map((tool) => String(tool.name || "")));
    probe.tool_descriptor_drift_summary = {
      previous_tools_count: previousProbe?.tools_count || previousNames.size,
      current_tools_count: probe.tools_count,
      added_tools: [...currentNames].filter((name) => name && !previousNames.has(name)).sort(),
      removed_tools: [...previousNames].filter((name) => name && !currentNames.has(name)).sort(),
    };
    probe.promotion_gate = "tool_descriptor_drift_requires_operator_review";
  } else {
    probe.tool_descriptor_drift_summary = null;
  }
  await writeProbe(dataRoot, id, probe);
  return probe;
}

export async function listTools({ dataRoot = defaultDataRoot(), id } = {}) {
  if (!id) throw new Error("server id required");
  const probe = await readLastProbe(dataRoot, id);
  return {
    ok: !!probe,
    id,
    tools: probe?.tools || [],
    tools_count: probe?.tools_count || 0,
    probe: probe || null,
  };
}

export async function disableServer({ dataRoot = defaultDataRoot(), id, disabled = true } = {}) {
  if (!id) throw new Error("server id required");
  const custom = await readCustomServers(dataRoot);
  const index = custom.findIndex((server) => server.id === id);
  if (index >= 0) {
    custom[index] = { ...custom[index], disabled: !!disabled, updated_at: nowIso() };
    await writeCustomServers(dataRoot, custom);
    return { ok: true, id, disabled: !!disabled, persisted: true };
  }
  const builtin = BUILT_IN_MCP_SERVERS.find((server) => server.id === id);
  if (!builtin) throw new Error(`unknown MCP server: ${id}`);
  const override = { ...builtin, disabled: !!disabled, updated_at: nowIso(), origin: "builtin-override" };
  await writeCustomServers(dataRoot, [...custom.filter((server) => server.id !== id), override]);
  return { ok: true, id, disabled: !!disabled, persisted: true };
}
