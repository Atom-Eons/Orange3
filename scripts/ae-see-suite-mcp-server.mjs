import { McpServer } from "file:///C:/AtomEons/agent-stack/npm-tools/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import { StdioServerTransport } from "file:///C:/AtomEons/agent-stack/npm-tools/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
import { z } from "file:///C:/AtomEons/agent-stack/npm-tools/node_modules/zod/index.js";
import { registerAeSeeSuiteTools } from "./ae-see-suite-mcp-tools.mjs";

const orangeboxUrl = process.env.ORANGEBOX_URL || "http://127.0.0.1:8787";

function textContent(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

async function orangebox(path, { method = "GET", body = null, timeoutMs = 120000 } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${orangeboxUrl}${path}`, {
      method,
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) {
      return { status: "FAILED", code: res.status, error: json?.error || text || res.statusText };
    }
    return json ?? text;
  } catch (error) {
    return { status: error.name === "AbortError" ? "TIMEOUT" : "FAILED", error: error.message, orangeboxUrl, path };
  } finally {
    clearTimeout(timer);
  }
}

function summarize(value, limit = 900) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {}, null, 2);
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]` : text;
}

async function postWorkEvent(event) {
  try {
    await orangebox("/api/mcp/event", {
      method: "POST",
      body: { source: "ae-see-suite-mcp", ...event },
      timeoutMs: 3000
    });
  } catch {}
}

function resultStatus(result) {
  try {
    const text = result?.content?.[0]?.text || "";
    const parsed = JSON.parse(text);
    return parsed.status || parsed.recommendation?.status || parsed.event?.status || "VERIFIED";
  } catch {
    return "VERIFIED";
  }
}

function trackedTool(tool, handler) {
  return async (args = {}) => {
    const id = `${Date.now()}-${tool}-${Math.random().toString(16).slice(2)}`;
    const started = Date.now();
    await postWorkEvent({ id, tool, phase: "start", status: "Running", summary: summarize(args) });
    try {
      const result = await handler(args);
      await postWorkEvent({ id, tool, phase: "end", status: "VERIFIED", resultStatus: resultStatus(result), durationMs: Date.now() - started, summary: summarize(args, 500) });
      return result;
    } catch (error) {
      await postWorkEvent({ id, tool, phase: "error", status: "FAILED", durationMs: Date.now() - started, summary: summarize(args, 500), error: error.message });
      throw error;
    }
  };
}

const server = new McpServer({ name: "ae-see-suite", version: "0.1.0" });

registerAeSeeSuiteTools({ server, z, textContent, orangebox, trackedTool });

const transport = new StdioServerTransport();
await server.connect(transport);
