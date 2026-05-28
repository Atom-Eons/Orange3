import { McpServer } from "file:///C:/AtomEons/agent-stack/npm-tools/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js";
import { StdioServerTransport } from "file:///C:/AtomEons/agent-stack/npm-tools/node_modules/@modelcontextprotocol/sdk/dist/esm/server/stdio.js";
import { z } from "file:///C:/AtomEons/agent-stack/npm-tools/node_modules/zod/index.js";

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
      return {
        status: "FAILED",
        code: res.status,
        error: json?.error || text || res.statusText
      };
    }
    return json ?? text;
  } catch (error) {
    return {
      status: error.name === "AbortError" ? "TIMEOUT" : "FAILED",
      error: error.message,
      orangeboxUrl,
      path
    };
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
      body: {
        source: "claude-code-mcp",
        ...event
      },
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
    await postWorkEvent({
      id,
      tool,
      phase: "start",
      status: "Running",
      summary: summarize(args)
    });
    try {
      const result = await handler(args);
      await postWorkEvent({
        id,
        tool,
        phase: "end",
        status: "VERIFIED",
        resultStatus: resultStatus(result),
        durationMs: Date.now() - started,
        summary: summarize(args, 500)
      });
      return result;
    } catch (error) {
      await postWorkEvent({
        id,
        tool,
        phase: "error",
        status: "FAILED",
        durationMs: Date.now() - started,
        summary: summarize(args, 500),
        error: error.message
      });
      throw error;
    }
  };
}

const server = new McpServer({
  name: "orangebox-ai-box",
  version: "0.1.0"
});

server.registerTool(
  "orangebox_help",
  {
    title: "OrangeBOX Help",
    description: "Show how Claude Code should use ORANGEBOX, AE See-Suite, and the optional AI Box rail.",
    inputSchema: {}
  },
  trackedTool("orangebox_help", async () => textContent({
    status: "VERIFIED",
    route: "Claude Code -> ORANGEBOX MCP -> AE See-Suite / AE Operations -> optional AI Box rail",
    orangeboxUrl,
    policy: [
      "Use Claude for reasoning and the optional AI Box for mechanical execution only when that rail is verified.",
      "Prefer orangebox_run_agent_team before raw commands.",
      "Use codexa_command only as a legacy-compatible tool name for explicit operator-approved AI Box shell work.",
      "Destructive actions, deploys, pushes, database writes, payments, and permission changes still require approval.",
      "No fake success: tools return receipts and VERIFIED/FAILED statuses."
    ],
    common: {
      status: "orangebox_status",
      docs: "search_docs",
      execute: "execute",
      agents: "orangebox_run_agent_team",
      sync: "orangebox_sync_app",
      proof: "orangebox_visual_proof",
      receipts: "orangebox_pull_receipts",
      power: "orangebox_power_status",
      command: "codexa_command"
    }
  }))
);

server.registerTool(
  "search_docs",
  {
    title: "Search OrangeBOX Docs",
    description: "Search the ORANGEBOX OpenAPI contract, docs, scripts, receipts, route examples, and command references without flooding the model context.",
    inputSchema: {
      query: z.string().describe("Search phrase, endpoint, command, subsystem, or receipt term."),
      limit: z.number().optional().describe("Maximum number of hits. Default 8.")
    }
  },
  trackedTool("search_docs", async ({ query, limit = 8 }) => textContent(await orangebox("/api/v4/mcp/code-search", {
    method: "POST",
    body: { query, limit },
    timeoutMs: 30000
  })))
);

server.registerTool(
  "execute",
  {
    title: "Execute Approved OrangeBOX Command",
    description: "Run an approved read/doctor/package ORANGEBOX CLI snippet through the constrained code-mode MCP executor. Write-like actions stay behind ORANGEBOX approval gates and every execution is receipted.",
    inputSchema: {
      command: z.string().describe("Approved ORANGEBOX command, for example: obx route doctor --json"),
      timeoutMs: z.number().optional().describe("Timeout in milliseconds. Default 120000.")
    }
  },
  trackedTool("execute", async ({ command, timeoutMs = 120000 }) => textContent(await orangebox("/api/v4/mcp/code-execute", {
    method: "POST",
    body: { command, timeoutMs, receipt: true },
    timeoutMs: Math.min(Math.max(Number(timeoutMs || 120000), 10000), 30 * 60 * 1000)
  })))
);

server.registerTool(
  "orangebox_status",
  {
    title: "OrangeBOX Status",
    description: "Read ORANGEBOX, optional AI Box, wiki, n8n, Open WebUI, and Claude Code lane status.",
    inputSchema: {}
  },
  trackedTool("orangebox_status", async () => textContent(await orangebox("/api/status", { timeoutMs: 30000 })))
);

server.registerTool(
  "orangebox_claude_status",
  {
    title: "Claude Code Lane Status",
    description: "Check whether OrangeBOX can call Claude Code print mode from the command app.",
    inputSchema: {}
  },
  trackedTool("orangebox_claude_status", async () => textContent(await orangebox("/api/claude-code/status", { timeoutMs: 30000 })))
);

server.registerTool(
  "orangebox_chairman_plan",
  {
    title: "Chairman Plan",
    description: "Create a planning-only Chairman plan that compares available model/agent lanes without faking execution.",
    inputSchema: {
      goal: z.string().describe("The task or project goal."),
      mode: z.string().optional().describe("code-build, ui-product, security-network, or research-memory.")
    }
  },
  trackedTool("orangebox_chairman_plan", async ({ goal, mode = "code-build" }) => textContent(await orangebox("/api/chairman/plan", {
    method: "POST",
    body: { goal, mode },
    timeoutMs: 45000
  })))
);

server.registerTool(
  "orangebox_run_agent_team",
  {
    title: "Run AI Box Agent Team",
    description: "Run the smallest useful ORANGEBOX/AI Box agent team for a goal. This can sync first, then run read-only build/security/ops/visual/OpenClaw checks with receipts.",
    inputSchema: {
      goal: z.string().describe("Goal for the agent team."),
      mode: z.string().optional().describe("code-build, ui-product, security-network, or research-memory."),
      syncFirst: z.boolean().optional().describe("Whether to sync ORANGEBOX app to the AI Box rail before running checks.")
    }
  },
  trackedTool("orangebox_run_agent_team", async ({ goal, mode = "code-build", syncFirst = true }) => textContent(await orangebox("/api/agent/team", {
    method: "POST",
    body: { goal, mode, syncFirst },
    timeoutMs: 360000
  })))
);

server.registerTool(
  "orangebox_run_agent_profile",
  {
    title: "Run AI Box Agent Profile",
    description: "Run one specific agent profile. Preferred ids include ae10-ai-box-ops, ae6-command-build, ae11-security-scan, ae13-automation-check, ae3-visual-ready, or openclaw-guard. The legacy ae10-codexa-ops id is still accepted as a compatibility alias.",
    inputSchema: {
      profileId: z.string().describe("Agent profile id.")
    }
  },
  trackedTool("orangebox_run_agent_profile", async ({ profileId }) => textContent(await orangebox("/api/agent/run", {
    method: "POST",
    body: { profileId },
    timeoutMs: 240000
  })))
);

server.registerTool(
  "orangebox_sync_app",
  {
    title: "Sync ORANGEBOX To AI Box",
    description: "Upload the ORANGEBOX command app to the optional AI Box rail and run remote syntax/check verification.",
    inputSchema: {}
  },
  trackedTool("orangebox_sync_app", async () => textContent(await orangebox("/api/codexa/sync-command-app", {
    method: "POST",
    body: {},
    timeoutMs: 240000
  })))
);

server.registerTool(
  "orangebox_visual_proof",
  {
    title: "Visual Proof",
    description: "Run OrangeBOX visual proof at desktop and compact viewport, returning screenshot paths and pass/fail metrics.",
    inputSchema: {
      label: z.string().optional().describe("Proof label.")
    }
  },
  trackedTool("orangebox_visual_proof", async ({ label = "claude-code-orangebox-proof" }) => textContent(await orangebox("/api/proof/visual", {
    method: "POST",
    body: { label },
    timeoutMs: 150000
  })))
);

server.registerTool(
  "orangebox_pull_receipts",
  {
    title: "Pull AI Box Receipts",
    description: "Pull latest AI Box command rail receipts into Claude Code.",
    inputSchema: {}
  },
  trackedTool("orangebox_pull_receipts", async () => textContent(await orangebox("/api/codexa/command-rail/receipts", { timeoutMs: 45000 })))
);

server.registerTool(
  "orangebox_openclaw_status",
  {
    title: "OpenClaw Guard Status",
    description: "Check guarded OpenClaw status through the optional AI Box command rail.",
    inputSchema: {}
  },
  trackedTool("orangebox_openclaw_status", async () => textContent(await orangebox("/api/openclaw/status", { timeoutMs: 120000 })))
);

server.registerTool(
  "orangebox_power_status",
  {
    title: "OrangeBOX Power Status",
    description: "Read local ORANGEBOX and optional AI Box CPU/RAM pressure plus the increase/hold recommendation.",
    inputSchema: {
      force: z.boolean().optional().describe("Force a fresh AI Box load sample instead of using the short cache.")
    }
  },
  trackedTool("orangebox_power_status", async ({ force = false }) => textContent(await orangebox(`/api/power${force ? "?force=1" : ""}`, {
    timeoutMs: 60000
  })))
);

server.registerTool(
  "codexa_command",
  {
    title: "Run Command On AI Box",
    description: "Run an explicit command on the optional AI Box through the token-gated ORANGEBOX command rail. Requires confirmFullAccess=true. Avoid destructive actions unless the user has approved them.",
    inputSchema: {
      command: z.string().describe("Command to run on the AI Box rail."),
      cwd: z.string().optional().describe("AI Box working directory. Default C:\\AtomEons."),
      shell: z.string().optional().describe("powershell or cmd. Default powershell."),
      timeoutMs: z.number().optional().describe("Timeout in milliseconds."),
      confirmFullAccess: z.boolean().describe("Must be true to acknowledge full-access execution on the AI Box rail.")
    }
  },
  trackedTool("codexa_command", async ({ command, cwd = "C:\\AtomEons", shell = "powershell", timeoutMs = 120000, confirmFullAccess }) => {
    if (confirmFullAccess !== true) {
      return textContent({
        status: "NEEDS_CONFIRMATION",
        error: "Set confirmFullAccess=true only after the operator-approved task is clear.",
        policy: "Prefer orangebox_run_agent_team for normal work. Use codexa_command only as the legacy-compatible explicit AI Box command tool."
      });
    }
    return textContent(await orangebox("/api/codexa/command", {
      method: "POST",
      body: { command, cwd, shell, timeoutMs },
      timeoutMs: Math.min(Math.max(Number(timeoutMs || 120000), 10000), 30 * 60 * 1000)
    }));
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
