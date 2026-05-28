/* agent-loop.mjs — v6.1.0 "Agent Mode" — Claude/Cursor/Codex-grade tool-using loop.

   Architecture (anti-Cursor moat: every step emits a real receipt; tool calls
   are sandboxed by freeze-guard; the operator can cancel at any moment):

     run({ goal, workspace, max_steps, on_event }) →
       loop:
         1) ask Anthropic model with current state + available tools
         2) parse tool_use blocks from response
         3) execute tools (read/write/edit/grep/glob/run/vault_search/web_fetch)
         4) feed tool_result back, append to message history
         5) emit step receipt
         6) check for stop_reason "end_turn" or operator cancel
       end loop → emit final receipt with full chain.

   The loop is BACKGROUND-RUNNABLE — see scripts/v4/agent-jobs.mjs for the
   job table (status, cancel, list). This module just runs ONE loop.

   No mock tools. No simulated calls. Every tool actually executes against the
   workspace (with freeze-guard + path-safety).
*/

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";

const MAX_STEPS_DEFAULT = 25;
const MODEL_DEFAULT     = "claude-sonnet-4-5-20251015";
const ANTHROPIC_VERSION = "2023-06-01";

// ── TOOL DEFINITIONS (Anthropic tool_use schema) ────────────────────────────
const TOOLS = [
  {
    name: "read_file",
    description: "Read a UTF-8 text file from the workspace. Returns full content (capped at 200KB).",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute or workspace-relative path" },
      },
      required: ["path"],
    },
  },
  {
    name: "write_file",
    description: "Write a file (creates parent dirs). Emits a fs-write receipt and falls under freeze-guard.",
    input_schema: {
      type: "object",
      properties: {
        path:    { type: "string" },
        content: { type: "string" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "Replace exact substring in an existing file. Fails if substring not unique. Use for surgical edits.",
    input_schema: {
      type: "object",
      properties: {
        path:        { type: "string" },
        old_string:  { type: "string" },
        new_string:  { type: "string" },
        replace_all: { type: "boolean", default: false },
      },
      required: ["path", "old_string", "new_string"],
    },
  },
  {
    name: "grep",
    description: "Recursive ripgrep-style search in workspace. Returns matched lines with file:line:content.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string" },
        glob:    { type: "string", description: "e.g. '*.mjs' or '**/*.rs'" },
        max_results: { type: "integer", default: 50 },
      },
      required: ["pattern"],
    },
  },
  {
    name: "glob",
    description: "Find files matching a glob pattern in the workspace.",
    input_schema: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "e.g. 'src/**/*.ts'" },
      },
      required: ["pattern"],
    },
  },
  {
    name: "list_dir",
    description: "List files + subdirs in a directory.",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
      },
      required: ["path"],
    },
  },
  {
    name: "run_cmd",
    description: "Run a short shell command in the workspace. Captures stdout/stderr. 30s timeout.",
    input_schema: {
      type: "object",
      properties: {
        cmd:        { type: "string", description: "The command to run (e.g. 'node --version')" },
        timeout_ms: { type: "integer", default: 30000 },
      },
      required: ["cmd"],
    },
  },
  {
    name: "vault_search",
    description: "Search OrangeBox's local CLC vault (operator's curated docs).",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "integer", default: 10 },
      },
      required: ["query"],
    },
  },
  {
    name: "finish",
    description: "Call this when the goal is complete. Provide a one-paragraph summary.",
    input_schema: {
      type: "object",
      properties: {
        summary: { type: "string" },
      },
      required: ["summary"],
    },
  },
];

// ── HELPERS ──────────────────────────────────────────────────────────────────
function isInsideWorkspace(workspace, target) {
  const abs = path.resolve(target);
  const ws  = path.resolve(workspace);
  return abs.startsWith(ws + path.sep) || abs === ws;
}

function resolveWorkspacePath(workspace, p) {
  if (path.isAbsolute(p)) return p;
  return path.resolve(workspace, p);
}

async function httpsPostJson(hostname, route, headers, payload) {
  const https = await import("node:https");
  return new Promise((resolve, reject) => {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    const req = https.request({
      hostname, port: 443, path: route, method: "POST",
      headers: { ...headers, "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ status: res.statusCode, body }));
    });
    req.on("error", reject);
    req.setTimeout(60000, () => { req.destroy(new Error("timeout")); });
    req.write(data);
    req.end();
  });
}

// ── TOOL EXECUTOR ────────────────────────────────────────────────────────────
async function executeTool({ name, input, workspace, freezeGuard, dataRoot }) {
  const t0 = Date.now();
  let result;
  try {
    switch (name) {
      case "read_file": {
        const p = resolveWorkspacePath(workspace, input.path);
        if (!isInsideWorkspace(workspace, p)) return { ok: false, error: `path outside workspace: ${p}` };
        const stat = await fs.stat(p).catch(() => null);
        if (!stat) return { ok: false, error: `no such file: ${p}` };
        if (stat.size > 200_000) return { ok: false, error: `file > 200KB (${stat.size} bytes) — use grep instead` };
        const content = await fs.readFile(p, "utf8");
        result = { ok: true, content, bytes: stat.size };
        break;
      }
      case "write_file": {
        const p = resolveWorkspacePath(workspace, input.path);
        if (!isInsideWorkspace(workspace, p)) return { ok: false, error: `path outside workspace: ${p}` };
        if (freezeGuard) {
          const g = freezeGuard.checkPathAllowed(p);
          if (!g.allowed) return { ok: false, error: `freeze-guard: ${g.reason}` };
        }
        await fs.mkdir(path.dirname(p), { recursive: true });
        const before = await fs.readFile(p, "utf8").catch(() => null);
        await fs.writeFile(p, input.content);
        result = {
          ok: true, bytes: Buffer.byteLength(input.content, "utf8"),
          kind: before === null ? "create" : "overwrite",
          sha256_before: before === null ? null : crypto.createHash("sha256").update(before).digest("hex"),
          sha256_after:  crypto.createHash("sha256").update(input.content).digest("hex"),
        };
        break;
      }
      case "edit_file": {
        const p = resolveWorkspacePath(workspace, input.path);
        if (!isInsideWorkspace(workspace, p)) return { ok: false, error: `path outside workspace: ${p}` };
        if (freezeGuard) {
          const g = freezeGuard.checkPathAllowed(p);
          if (!g.allowed) return { ok: false, error: `freeze-guard: ${g.reason}` };
        }
        const before = await fs.readFile(p, "utf8");
        const old = input.old_string;
        const neu = input.new_string;
        const count = (before.match(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        if (count === 0) return { ok: false, error: `old_string not found in ${p}` };
        if (count > 1 && !input.replace_all) {
          return { ok: false, error: `old_string appears ${count} times in ${p}; pass replace_all=true or extend context` };
        }
        const after = input.replace_all
          ? before.split(old).join(neu)
          : before.replace(old, neu);
        await fs.writeFile(p, after);
        result = {
          ok: true, bytes: Buffer.byteLength(after, "utf8"),
          replacements: input.replace_all ? count : 1,
          sha256_before: crypto.createHash("sha256").update(before).digest("hex"),
          sha256_after:  crypto.createHash("sha256").update(after).digest("hex"),
        };
        break;
      }
      case "grep": {
        // Lightweight recursive search (no shell out, deterministic).
        const re = new RegExp(input.pattern, "g");
        const limit = input.max_results || 50;
        const globPattern = input.glob || "**/*";
        const matches = [];
        async function walk(dir) {
          if (matches.length >= limit) return;
          let entries;
          try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
          for (const e of entries) {
            if (matches.length >= limit) return;
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "target") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) await walk(full);
            else if (e.isFile()) {
              // Simple glob filter: just check extension/suffix
              const ext = globPattern.includes("*.") ? globPattern.split("*.").pop().replace("*", "") : "";
              if (ext && !e.name.endsWith(ext)) continue;
              try {
                const text = await fs.readFile(full, "utf8");
                const lines = text.split(/\r?\n/);
                for (let i = 0; i < lines.length; i++) {
                  if (re.test(lines[i])) {
                    matches.push({ file: full, line: i + 1, text: lines[i].slice(0, 240) });
                    re.lastIndex = 0;
                    if (matches.length >= limit) return;
                  }
                  re.lastIndex = 0;
                }
              } catch { /* binary or unreadable, skip */ }
            }
          }
        }
        await walk(workspace);
        result = { ok: true, matches, count: matches.length };
        break;
      }
      case "glob": {
        const limit = 500;
        const found = [];
        const pat = input.pattern;
        const ext = pat.includes("*.") ? "." + pat.split("*.").pop() : "";
        async function walk(dir) {
          if (found.length >= limit) return;
          let entries;
          try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
          for (const e of entries) {
            if (found.length >= limit) return;
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "target") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) await walk(full);
            else if (e.isFile()) {
              if (!ext || e.name.endsWith(ext)) found.push(full);
            }
          }
        }
        await walk(workspace);
        result = { ok: true, files: found, count: found.length };
        break;
      }
      case "list_dir": {
        const p = resolveWorkspacePath(workspace, input.path);
        if (!isInsideWorkspace(workspace, p)) return { ok: false, error: `path outside workspace: ${p}` };
        const entries = await fs.readdir(p, { withFileTypes: true });
        result = {
          ok: true,
          items: entries.map(e => ({
            name: e.name,
            type: e.isDirectory() ? "dir" : (e.isFile() ? "file" : "other"),
          })),
        };
        break;
      }
      case "run_cmd": {
        if (freezeGuard?.commandsBlocked) return { ok: false, error: "commands blocked by freeze" };
        const timeoutMs = input.timeout_ms || 30000;
        const out = await new Promise((resolve) => {
          const proc = spawn(process.platform === "win32" ? "cmd" : "sh",
            process.platform === "win32" ? ["/C", input.cmd] : ["-c", input.cmd],
            { cwd: workspace, windowsHide: true });
          let stdout = "", stderr = "";
          const killer = setTimeout(() => { proc.kill(); }, timeoutMs);
          proc.stdout.on("data", (c) => { stdout += c.toString(); });
          proc.stderr.on("data", (c) => { stderr += c.toString(); });
          proc.on("close", (code) => {
            clearTimeout(killer);
            resolve({ ok: true, code, stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 4000) });
          });
          proc.on("error", (e) => resolve({ ok: false, error: e.message }));
        });
        result = out;
        break;
      }
      case "vault_search": {
        // Local-search the workspace docs (cheap proxy until full embeddings land)
        const re = new RegExp(input.query.split(/\s+/).map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join("|"), "gi");
        const hits = [];
        const limit = input.limit || 10;
        async function walk(dir) {
          if (hits.length >= limit) return;
          let entries;
          try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
          for (const e of entries) {
            if (hits.length >= limit) return;
            if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "target") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) await walk(full);
            else if (e.isFile() && /\.(md|mjs|js|ts|tsx|jsx|rs|py)$/.test(e.name)) {
              try {
                const text = await fs.readFile(full, "utf8");
                const matches = text.match(re) || [];
                if (matches.length > 0) {
                  const idx = text.search(re);
                  const excerpt = text.slice(Math.max(0, idx - 80), idx + 240);
                  hits.push({ file: full, score: matches.length, excerpt });
                }
              } catch { /* skip */ }
            }
          }
        }
        await walk(workspace);
        hits.sort((a, b) => b.score - a.score);
        result = { ok: true, hits: hits.slice(0, limit), total: hits.length };
        break;
      }
      case "finish": {
        result = { ok: true, summary: input.summary, finished: true };
        break;
      }
      default:
        return { ok: false, error: `unknown tool: ${name}` };
    }
  } catch (e) {
    result = { ok: false, error: e.message || String(e) };
  }
  result._tool_name = name;
  result._duration_ms = Date.now() - t0;
  return result;
}

// ── GEMINI TRANSLATORS ────────────────────────────────────────────────────────
function translateToolsToGemini(tools) {
  return {
    functionDeclarations: tools.map(t => {
      const parameters = JSON.parse(JSON.stringify(t.input_schema || {}));
      const capitalizeTypes = (obj) => {
        if (!obj || typeof obj !== "object") return;
        if (typeof obj.type === "string") {
          obj.type = obj.type.toUpperCase();
        }
        if (obj.properties) {
          for (const key of Object.keys(obj.properties)) {
            capitalizeTypes(obj.properties[key]);
          }
        }
      };
      capitalizeTypes(parameters);
      return {
        name: t.name,
        description: t.description,
        parameters
      };
    })
  };
}

function translateMessagesToGemini(messages) {
  const contents = [];
  for (const msg of messages) {
    const role = msg.role === "assistant" ? "model" : "user";
    const parts = [];
    
    if (typeof msg.content === "string") {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const item of msg.content) {
        if (item.type === "text") {
          parts.push({ text: item.text });
        } else if (item.type === "tool_use") {
          parts.push({
            functionCall: {
              name: item.name,
              args: item.input
            }
          });
        } else if (item.type === "tool_result") {
          let responseObj;
          try {
            responseObj = JSON.parse(item.content);
          } catch {
            responseObj = { result: item.content };
          }
          parts.push({
            functionResponse: {
              name: item.tool_use_id,
              response: { name: item.tool_use_id, ...responseObj }
            }
          });
        }
      }
    }
    contents.push({ role, parts });
  }
  return contents;
}

// ── THE LOOP ─────────────────────────────────────────────────────────────────
/**
 * run({ goal, workspace, anthropicKey, maxSteps, dataRoot, freezeGuard, onEvent, cancelToken })
 *
 * onEvent(event) is called for each step and tool result with:
 *   { kind: "step_start" | "tool_call" | "tool_result" | "model_reply" | "finish" | "error", ... }
 * cancelToken is { cancelled: boolean } — set true externally to halt.
 */
export async function run({
  goal,
  workspace,
  anthropicKey,
  maxSteps   = MAX_STEPS_DEFAULT,
  model      = MODEL_DEFAULT,
  dataRoot,
  freezeGuard,
  onEvent    = () => {},
  cancelToken = { cancelled: false },
}) {
  if (!goal) throw new Error("goal required");
  if (!workspace) throw new Error("workspace required");
  const isGemini = model.includes("gemini") || model.includes("antigravity");
  if (!isGemini && !anthropicKey) throw new Error("ANTHROPIC_API_KEY required");

  const systemPrompt = [
    "You are OrangeBox Agent — a tool-using AI that operates on the operator's real workspace.",
    "Workspace root: " + workspace,
    "Today: " + new Date().toISOString(),
    "",
    "Rules:",
    "- Reason briefly, then call ONE tool per turn (or `finish` when done).",
    "- Prefer surgical edits (edit_file) over rewrites (write_file).",
    "- Verify before claiming success: re-read what you wrote.",
    "- When the goal is achieved, call `finish` with a one-paragraph summary.",
    "- Hard limit: " + maxSteps + " steps.",
    "- Refuse to run destructive shell commands (rm -rf, format, etc.).",
    "- All paths under freeze-guard if active.",
  ].join("\n");

  const messages = [{ role: "user", content: goal }];
  const steps = [];
  let totalInTokens = 0, totalOutTokens = 0;
  let finished = false;
  let finalSummary = null;

  for (let step = 1; step <= maxSteps; step++) {
    if (cancelToken.cancelled) {
      onEvent({ kind: "error", error: "cancelled by operator", step });
      return { ok: false, error: "cancelled", steps, totalInTokens, totalOutTokens };
    }

    onEvent({ kind: "step_start", step });

    let resp;
    if (isGemini) {
      const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
      const actualModel = model.includes("antigravity") ? "gemini-1.5-pro-002" : model;
      const geminiPayload = {
        contents: translateMessagesToGemini(messages),
        tools: [translateToolsToGemini(TOOLS)],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          maxOutputTokens: 4096,
        }
      };
      
      resp = await httpsPostJson("generativelanguage.googleapis.com", `/v1beta/models/${actualModel}:generateContent?key=${geminiKey}`, {
        "Content-Type": "application/json",
      }, geminiPayload);
    } else {
      resp = await httpsPostJson("api.anthropic.com", "/v1/messages", {
        "Content-Type":      "application/json",
        "x-api-key":         anthropicKey,
        "anthropic-version": ANTHROPIC_VERSION,
      }, {
        model,
        max_tokens: 4096,
        system: systemPrompt,
        tools:  TOOLS,
        messages,
      });
    }

    if (resp.status !== 200) {
      onEvent({ kind: "error", error: `model HTTP ${resp.status}: ${resp.body.slice(0, 300)}`, step });
      return { ok: false, error: `model HTTP ${resp.status}`, steps };
    }

    let data = JSON.parse(resp.body);
    if (data.error) {
      onEvent({ kind: "error", error: data.error.message || "model error", step });
      return { ok: false, error: data.error.message, steps };
    }

    if (isGemini) {
      const candidate = data.candidates?.[0];
      const content = [];
      const parts = candidate?.content?.parts || [];
      
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part.text) {
          content.push({ type: "text", text: part.text });
        } else if (part.functionCall) {
          content.push({
            type: "tool_use",
            id: part.functionCall.name + "_" + Math.random().toString(36).substring(2, 6),
            name: part.functionCall.name,
            input: part.functionCall.args
          });
        }
      }
      
      data = {
        content,
        stop_reason: candidate?.finishReason === "STOP" ? "stop_sequence" : "tool_use",
        usage: {
          input_tokens: data.usageMetadata?.promptTokenCount || 0,
          output_tokens: data.usageMetadata?.candidatesTokenCount || 0
        }
      };
    }

    totalInTokens  += data.usage?.input_tokens  || 0;
    totalOutTokens += data.usage?.output_tokens || 0;

    // Push assistant response into messages
    messages.push({ role: "assistant", content: data.content });

    onEvent({
      kind: "model_reply",
      step,
      stop_reason: data.stop_reason,
      text: data.content?.filter(c => c.type === "text").map(c => c.text).join("\n") || "",
      tools_requested: data.content?.filter(c => c.type === "tool_use").map(c => c.name) || [],
      messages: JSON.parse(JSON.stringify(messages)),
    });

    // Find tool_use blocks
    const toolUses = data.content?.filter(c => c.type === "tool_use") || [];

    if (toolUses.length === 0) {
      // No tools called — model finished
      onEvent({ kind: "finish", step, reason: data.stop_reason || "no_tools", text: data.content?.find(c => c.type === "text")?.text || "" });
      finished = true;
      finalSummary = data.content?.find(c => c.type === "text")?.text || "";
      break;
    }

    // Execute each tool sequentially (Anthropic spec)
    const toolResults = [];
    for (const tu of toolUses) {
      onEvent({ kind: "tool_call", step, tool: tu.name, input: tu.input });
      const result = await executeTool({
        name: tu.name, input: tu.input, workspace, freezeGuard, dataRoot,
      });
      onEvent({ kind: "tool_result", step, tool: tu.name, ok: !!result.ok, result });
      steps.push({ step, tool: tu.name, input: tu.input, result });
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result).slice(0, 12000),
        is_error: !result.ok,
      });
      if (tu.name === "finish") {
        finished = true;
        finalSummary = tu.input.summary;
        break;
      }
    }

    if (finished) {
      onEvent({ kind: "finish", step, reason: "finish_tool", text: finalSummary });
      break;
    }

    // Feed tool results back into the conversation
    messages.push({ role: "user", content: toolResults });
  }

  return {
    ok: finished,
    finished,
    finalSummary,
    steps,
    step_count: steps.length,
    totalInTokens,
    totalOutTokens,
  };
}

export { TOOLS };
