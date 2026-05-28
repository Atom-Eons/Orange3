#!/usr/bin/env node
/* ============================================================================
   orangebox-mcp-server-v2.mjs

   Hand-rolled MCP (Model Context Protocol) server. Zero external deps.
   Exposes ORANGEBOX's killer surfaces — knowledge vault, cited Claude
   queries, DAG, receipts, status — to ANY MCP client: Claude Code,
   Claude Desktop, MCP-compatible chat apps, agentic frameworks.

   Protocol: JSON-RPC 2.0 over stdio. MCP 2024-11-05 spec.

   Why hand-rolled: the prior MCP server imported @modelcontextprotocol/sdk
   from an operator-local node_modules path that doesn't exist on buyer
   machines. Hand-rolled is buyer-portable and the protocol is simple
   enough to implement directly.

   Tools exposed (10):
     1. orangebox_status        — project state at a glance
     2. orangebox_dag           — DAG view (nodes, statuses, dependencies)
     3. orangebox_query_vault   — hybrid RRF retrieval over v2 knowledge engine
     4. orangebox_cited_query   — Citations-enabled Claude query (grounded answer)
     5. orangebox_receipts      — recent receipts
     6. orangebox_party_line    — recent party-line messages
     7. orangebox_route         — route active node to a department (AE0-AE14)
     8. orangebox_proof         — capture visual proof of current cockpit state
     9. orangebox_rebuild_vault — rebuild the v2 knowledge vault
    10. orangebox_cache_stats   — Claude bridge pricing + cache savings
   ============================================================================ */

import process from "node:process";

const ORANGEBOX_URL = process.env.ORANGEBOX_URL || "http://127.0.0.1:8787";
const SERVER_NAME = "orangebox";
const SERVER_VERSION = "3.2.0";

// ─── JSON-RPC stdio framing ────────────────────────────────────────────────
// MCP uses JSON-RPC 2.0 messages, one per line on stdio.

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message, data = undefined) {
  send({ jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } });
}

// ─── HTTP bridge to cockpit server ─────────────────────────────────────────
async function obx(path, { method = "GET", body = null, timeoutMs = 60000 } = {}) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${ORANGEBOX_URL}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal,
    });
    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    if (!res.ok) {
      return { status: "FAILED", http: res.status, error: parsed?.error || text };
    }
    return parsed ?? { status: "VERIFIED", text };
  } catch (e) {
    return { status: e.name === "AbortError" ? "TIMEOUT" : "FAILED", error: String(e?.message || e) };
  } finally {
    clearTimeout(t);
  }
}

const METADATA_PROPERTIES = {
  receipt_id: { type: "string", description: "Optional transaction receipt ID for audit tracing." },
  route_packet_id: { type: "string", description: "Optional parent route packet ID." },
  approval_required: { type: "boolean", description: "Optional override for approval gate check." },
  approval_status: { type: "string", enum: ["pending", "approved", "rejected"], description: "Optional verification status." },
  approval_by: { type: "string", description: "Optional authority that signed off on execution." }
};

function textContentV02(value, toolName, args = {}) {
  const receipt_id = args.receipt_id || `rec_${Math.random().toString(16).slice(2)}`;
  const route_packet_id = args.route_packet_id || "default-route-packet";
  const envelope = {
    mcp_version: "0.2",
    tool: toolName,
    version: SERVER_VERSION,
    receipt_id,
    route_packet_id,
    approval_required: args.approval_required !== false,
    approval_status: args.approval_status || "approved",
    approval_by: args.approval_by || "operator",
    result: value,
  };
  const text = JSON.stringify(envelope, null, 2);
  return { content: [{ type: "text", text }] };
}

// Helper to inject metadata parameters into input schemas
function withMetadata(properties = {}) {
  return {
    type: "object",
    properties: {
      ...properties,
      ...METADATA_PROPERTIES
    }
  };
}

// ─── Tool registry ─────────────────────────────────────────────────────────
const TOOLS = {
  orangebox_status: {
    description: "Get current ORANGEBOX project status — active project, DAG progress, blockers, last receipt, health.",
    inputSchema: withMetadata({
      project: { type: "string", description: "Project slug (default: orangebox)" },
    }),
    handler: async (args) => {
      const { project = "orangebox" } = args;
      const r = await obx(`/api/status?fast=1&project=${encodeURIComponent(project)}`);
      return textContentV02(r, "orangebox_status", args);
    },
  },

  orangebox_dag: {
    description: "Get the project DAG (mission graph) — all nodes, statuses, dependencies, weights.",
    inputSchema: withMetadata({
      project: { type: "string", description: "Project slug (default: orangebox)" },
    }),
    handler: async (args) => {
      const { project = "orangebox" } = args;
      const r = await obx(`/api/project-dag?project=${encodeURIComponent(project)}`);
      return textContentV02(r, "orangebox_dag", args);
    },
  },

  orangebox_query_vault: {
    description: "Query the v2 knowledge vault — hybrid retrieval (BM25 + entity + fact + topic match with Reciprocal Rank Fusion). Returns top matching docs from the operator's local knowledge corpus.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query (required)" },
        top_k: { type: "number", description: "Number of results (default 12)" },
        ...METADATA_PROPERTIES
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, top_k = 12 } = args;
      const r = await obx(`/api/knowledge/v2/query?q=${encodeURIComponent(query)}`);
      if (r.top && top_k) r.top = r.top.slice(0, top_k);
      return textContentV02(r, "orangebox_query_vault", args);
    },
  },

  orangebox_cited_query: {
    description: "Citations-enabled Claude query grounded in the operator's local knowledge vault. Returns Claude-grade answer with sentence-level citations pointing at exact docs. Requires the operator's Anthropic API key configured in ORANGEBOX first-run.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Question (required)" },
        top_k: { type: "number", description: "How many vault docs to ground in (default 5)" },
        ...METADATA_PROPERTIES
      },
      required: ["query"],
    },
    handler: async (args) => {
      const { query, top_k = 5 } = args;
      const r = await obx("/api/claude/cited-query", {
        method: "POST",
        body: { query, top_k },
        timeoutMs: 120000,
      });
      return textContentV02(r, "orangebox_cited_query", args);
    },
  },

  orangebox_receipts: {
    description: "List recent receipts for a project. Each receipt has result/evidence/blockers/next-action shape.",
    inputSchema: withMetadata({
      project: { type: "string", description: "Project slug (default: orangebox)" },
      limit: { type: "number", description: "Max receipts (default 10)" },
    }),
    handler: async (args) => {
      const { project = "orangebox", limit = 10 } = args;
      const r = await obx(`/api/codexa/receipts?project=${encodeURIComponent(project)}`);
      if (r.receipts) r.receipts = r.receipts.slice(0, limit);
      return textContentV02(r, "orangebox_receipts", args);
    },
  },

  orangebox_party_line: {
    description: "Read the project party-line — last N messages from system / agents / operator. JSONL on disk; this surfaces the tail.",
    inputSchema: withMetadata({
      project: { type: "string", description: "Project slug (default: orangebox)" },
      limit: { type: "number", description: "Max messages (default 20)" },
    }),
    handler: async (args) => {
      const { project = "orangebox", limit = 20 } = args;
      const r = await obx(`/api/party-line?project=${encodeURIComponent(project)}`);
      if (r.messages) r.messages = r.messages.slice(-limit);
      return textContentV02(r, "orangebox_party_line", args);
    },
  },

  orangebox_route: {
    description: "Route the active DAG node to a specific department (AE0–AE14, MIRRORS, CHECKMATE, ORANGE, LIPS, MISFITS, HACK_THE_PLANET).",
    inputSchema: {
      type: "object",
      properties: {
        department: { type: "string", description: "Target department (e.g. 'AE6')" },
        project: { type: "string", description: "Project slug (default: orangebox)" },
        ...METADATA_PROPERTIES
      },
      required: ["department"],
    },
    handler: async (args) => {
      const { department, project = "orangebox" } = args;
      const r = await obx("/api/route", {
        method: "POST",
        body: { department, project },
      });
      return textContentV02(r, "orangebox_route", args);
    },
  },

  orangebox_proof: {
    description: "Capture visual proof of current cockpit state — screenshot + DOM snapshot of the cockpit at this moment. Writes to <orangeRoot>/proof/<project>/screenshots/.",
    inputSchema: withMetadata({
      project: { type: "string", description: "Project slug (default: orangebox)" },
      label:   { type: "string", description: "Proof label (default: 'manual')" },
    }),
    handler: async (args) => {
      const { project = "orangebox", label = "manual" } = args;
      const r = await obx("/api/proof/capture", {
        method: "POST",
        body: { project, label },
      });
      return textContentV02(r, "orangebox_proof", args);
    },
  },

  orangebox_rebuild_vault: {
    description: "Trigger a fresh rebuild of the v2 knowledge vault (CLC lattice + void + fidelity + critique). Takes ~5 seconds on a typical operator corpus.",
    inputSchema: withMetadata({}),
    handler: async (args) => {
      const r = await obx("/api/knowledge/v2/rebuild", { method: "POST", timeoutMs: 120000 });
      return textContentV02(r, "orangebox_rebuild_vault", args);
    },
  },

  orangebox_cache_stats: {
    description: "Get Claude bridge prompt-caching stats — pricing anchors, min-cache thresholds, savings math.",
    inputSchema: withMetadata({}),
    handler: async (args) => {
      const r = await obx("/api/claude/cache-stats");
      return textContentV02(r, "orangebox_cache_stats", args);
    },
  },

  orangebox_cache_query: {
    description: "Lookup a prompt in the local semantic vector cache. Checks exact SHA-256 first, then cosine similarity.",
    inputSchema: withMetadata({
      prompt: { type: "string", description: "The prompt text to search for (required)" },
      threshold: { type: "number", description: "Minimum cosine similarity threshold (default: 0.92)" },
    }),
    handler: async (args) => {
      const { prompt, threshold = 0.92 } = args;
      const r = await obx("/api/v4/cache/query", {
        method: "POST",
        body: { prompt, threshold },
      });
      return textContentV02(r, "orangebox_cache_query", args);
    },
  },

  orangebox_cache_set: {
    description: "Insert a prompt-completion pair into the local semantic vector cache. Calculates local vector embedding via Ollama.",
    inputSchema: withMetadata({
      prompt: { type: "string", description: "The prompt text (required)" },
      completion: { type: "string", description: "The generated completion text (required)" },
    }),
    handler: async (args) => {
      const { prompt, completion } = args;
      const r = await obx("/api/v4/cache/set", {
        method: "POST",
        body: { prompt, completion },
      });
      return textContentV02(r, "orangebox_cache_set", args);
    },
  },
};

// ─── MCP protocol handlers ─────────────────────────────────────────────────

function handleInitialize(params, id) {
  sendResult(id, {
    protocolVersion: "2024-11-05",
    capabilities: {
      tools: {},
      logging: {},
    },
    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
  });
}

function handleListTools(_params, id) {
  const tools = Object.entries(TOOLS).map(([name, def]) => ({
    name,
    description: def.description,
    inputSchema: def.inputSchema,
  }));
  sendResult(id, { tools });
}

async function handleCallTool(params, id) {
  const name = params?.name;
  const args = params?.arguments || {};
  const tool = TOOLS[name];
  if (!tool) {
    return sendError(id, -32601, `Tool not found: ${name}`);
  }
  try {
    const result = await tool.handler(args);
    sendResult(id, result);
  } catch (e) {
    sendError(id, -32000, `Tool ${name} failed: ${String(e?.message || e)}`);
  }
}

// ─── Stdio main loop ───────────────────────────────────────────────────────
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, i).trim();
    buffer = buffer.slice(i + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    handle(msg).catch((e) => {
      if (msg?.id != null) sendError(msg.id, -32603, String(e?.message || e));
    });
  }
});

process.stdin.on("end", () => process.exit(0));

async function handle(msg) {
  if (msg.jsonrpc !== "2.0") return;
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":      return handleInitialize(params, id);
    case "tools/list":      return handleListTools(params, id);
    case "tools/call":      return handleCallTool(params, id);
    case "notifications/initialized":
    case "initialized":
      return; // no response needed
    case "shutdown":
      sendResult(id, null);
      process.exit(0);
      break;
    case "ping":
      return sendResult(id, {});
    default:
      if (id != null) sendError(id, -32601, `Method not found: ${method}`);
  }
}

// Log to stderr so it doesn't pollute the stdio channel
process.stderr.write(`[orangebox-mcp-v2] ready · ${Object.keys(TOOLS).length} tools · ${ORANGEBOX_URL}\n`);
