#!/usr/bin/env node
/* obx — OrangeBox CLI (v6.2.0-alpha.3, 2026-05-18).

   The sidecar at 127.0.0.1:8787 is the backend; this is a thin client.
   GUI + CLI share the SAME agent loop, receipts, vault, and job table —
   so receipts created via `obx chat ...` appear instantly in the running
   GUI's Artifact Library, and vice versa. State is unified.

   Beats Cursor's CLI + Grok's CLI structurally: they spin up isolated
   processes; we share the running AE See-Suite brain.

   Usage:
     obx                          # launch GUI (find orangebox.exe + spawn)
     obx chat "build dark mode"   # send a chat goal, stream tool calls
     obx agent "..."              # alias for chat
     obx status                   # pretty-print AE See-Suite status
     obx receipts [--tail] [--source=NAME] [--limit=N]
     obx open <path>              # set active project (also adds to recent)
     obx vault <query>            # vault search
     obx ghost <kind>             # not-yet-wired: trigger any ghost in GUI
     obx --help                   # this
*/
import http from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PORT = process.env.ORANGEBOX_PORT || 8787;
const HOST = "127.0.0.1";

// ── HTTP helpers ────────────────────────────────────────────────────────────
function req(method, urlPath, body = null, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const opts = { host: HOST, port: PORT, path: urlPath, method,
      headers: body ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } : {} };
    const r = http.request(opts, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => resolve({ status: res.statusCode, body: data }));
    });
    r.on("error", (e) => resolve({ status: 0, error: e.message }));
    r.setTimeout(timeoutMs, () => { r.destroy(); resolve({ status: 0, error: "timeout" }); });
    if (body) r.write(body);
    r.end();
  });
}

async function reqJSON(method, urlPath, body = null, timeoutMs = 30000) {
  const r = await req(method, urlPath, body ? JSON.stringify(body) : null, timeoutMs);
  if (r.status === 0) throw new Error(`sidecar unreachable: ${r.error}`);
  try { return { status: r.status, body: JSON.parse(r.body) }; }
  catch { return { status: r.status, body: r.body }; }
}

async function ensureSidecarUp(timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await req("GET", "/api/v4/receipts/list?limit=1", null, 1500);
    if (r.status === 200) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

// ── ANSI helpers (we render TUI receipts inline) ────────────────────────────
const ANSI = {
  reset:   "\x1b[0m",
  dim:     "\x1b[2m",
  bold:    "\x1b[1m",
  italic:  "\x1b[3m",
  orange:  "\x1b[38;5;208m",
  amber:   "\x1b[38;5;215m",
  cream:   "\x1b[38;5;223m",
  cyan:    "\x1b[38;5;180m", // remapped warm (was 51)
  green:   "\x1b[38;5;108m", // warm sage
  red:     "\x1b[38;5;167m", // burnt orange
  muted:   "\x1b[38;5;138m",
};
const noColor = !process.stdout.isTTY || process.env.NO_COLOR;
function c(color, text) { return noColor ? text : `${ANSI[color] || ""}${text}${ANSI.reset}`; }

// ── Commands ────────────────────────────────────────────────────────────────
async function cmdLaunchGUI() {
  const exe = path.join(ROOT, "src-tauri", "target", "release", "orangebox.exe");
  try {
    await fs.stat(exe);
  } catch {
    console.error(c("red", "orangebox.exe not found at " + exe));
    console.error(c("muted", "Build it with: cd src-tauri && cargo build --release --bin orangebox"));
    process.exit(1);
  }
  console.log(c("orange", "▦ launching orangebox GUI"));
  const child = spawn(exe, [], { detached: true, stdio: "ignore", windowsHide: false });
  child.unref();
  process.exit(0);
}

async function cmdChat(goal, opts = {}) {
  if (!goal) { console.error(c("red", "usage: obx chat \"<goal>\"")); process.exit(2); }

  if (!(await ensureSidecarUp())) {
    console.error(c("red", "sidecar not running on " + HOST + ":" + PORT));
    console.error(c("muted", "start it with: node scripts/orangebox-command-server.mjs"));
    process.exit(3);
  }

  // Resolve workspace
  let workspace = opts.workspace || process.cwd();

  console.log(c("orange", `▸ dispatching agent run`));
  console.log(c("muted", `  workspace: ${workspace}`));
  console.log(c("muted", `  goal: ${goal.slice(0, 100)}${goal.length > 100 ? "…" : ""}`));
  console.log();

  const r = await reqJSON("POST", "/api/v4/agent/run", {
    goal, workspace, max_steps: opts.max_steps || 25,
  });
  if (r.status !== 200) {
    console.error(c("red", `error ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`));
    process.exit(4);
  }
  const id = r.body.id;
  console.log(c("amber", `▣ ${id}`));
  console.log();

  // Poll status until terminal state
  let last_log_count = 0;
  while (true) {
    await new Promise(r => setTimeout(r, 1200));
    const s = await reqJSON("GET", `/api/v4/agent/status/${id}`);
    if (s.status !== 200) {
      console.error(c("red", `status ${s.status}: ${JSON.stringify(s.body).slice(0, 200)}`));
      break;
    }
    const st = s.body;
    const tail = st.log_tail || [];
    // Print only new events
    for (let i = last_log_count; i < tail.length; i++) {
      printLogEvent(tail[i]);
    }
    last_log_count = tail.length;
    if (st.state !== "running") {
      console.log();
      const color = st.state === "finished" ? "green" : st.state === "cancelled" ? "amber" : "red";
      console.log(c(color, `  ${st.state.toUpperCase()}  ${st.last_step} steps`));
      if (st.result?.finalSummary) {
        console.log();
        console.log(c("cream", st.result.finalSummary));
      } else if (st.result?.error) {
        console.log(c("red", st.result.error));
      }
      break;
    }
  }
}

function printLogEvent(ev) {
  const kind = ev.kind || "?";
  const step = ev.step ?? "";
  switch (kind) {
    case "step_start":
      // skip — too chatty
      break;
    case "model_reply": {
      const text = (ev.text || "").trim();
      if (text) console.log(c("muted", `  step ${step}  `) + c("cream", text.slice(0, 240)));
      break;
    }
    case "tool_call": {
      const tool = ev.tool || "?";
      const input = JSON.stringify(ev.input || {});
      console.log(c("orange", `  ▸ ${tool}`) + c("muted", ` ${input.slice(0, 160)}`));
      break;
    }
    case "tool_result": {
      const ok = !!ev.ok;
      const tool = ev.tool || "?";
      const glyph = ok ? c("green", "✓") : c("red", "✗");
      console.log(`    ${glyph} ${c("muted", tool)}`);
      break;
    }
    case "finish":
      // handled at end
      break;
    case "error":
      console.log(c("red", `  ✗ ${ev.error || ev.text || "error"}`));
      break;
    default:
      console.log(c("muted", `  [${kind}] ${JSON.stringify(ev).slice(0, 160)}`));
  }
}

async function cmdStatus() {
  if (!(await ensureSidecarUp(3000))) {
    console.error(c("red", "sidecar not running"));
    process.exit(3);
  }
  const r = await reqJSON("GET", "/api/v4/see-suite/status");
  console.log(c("orange", "▣ ORANGEBOX AE See-Suite status"));
  console.log();
  const j = r.body;
  const renderState = (item) => {
    if (item?.ok === true) return c("green", "ok");
    if (item?.ok === false) return c("red", "down");
    return c("amber", String(item?.status || "setup"));
  };
  console.log(c("muted", "  vault:    ") + renderState(j.vault));
  console.log(c("muted", "  router:   ") + renderState(j.router));
  console.log(c("muted", "  privacy:  ") + renderState(j.privacy));
  console.log(c("muted", "  queue:    ") + renderState(j.queue));
  console.log(c("muted", "  AI Box:   ") + renderState(j.aiBox));
  if (j.v6) {
    console.log();
    console.log(c("muted", "  local_mode:   ") + (j.v6.local_mode_enabled ? c("amber", "ON") : c("muted", "off")));
    console.log(c("muted", "  budget:       ") + c("cream", j.v6.budget_mode || "balanced"));
    console.log(c("muted", "  density:      ") + c("cream", j.v6.density || "comfortable"));
    console.log(c("muted", "  zoom:         ") + c("cream", String(j.v6.zoom || 1.0)));
    console.log(c("muted", "  ollama_host:  ") + c("cream", j.v6.ollama_host || ""));
  }
}

async function cmdReceipts(opts = {}) {
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  const limit = opts.limit || 20;
  const source = opts.source ? `&source=${encodeURIComponent(opts.source)}` : "";
  const r = await reqJSON("GET", `/api/v4/receipts/list?limit=${limit}${source}`);
  const items = r.body.items || [];
  if (items.length === 0) {
    console.log(c("muted", "(no receipts)"));
    return;
  }
  console.log(c("orange", `▣ ${items.length} receipt(s)`));
  console.log();
  for (const it of items) {
    console.log(c("amber", `  ${it.source.padEnd(20)}`) + c("cream", it.title || "(no title)"));
    console.log(c("muted", `  ${it.id}  ${it.ts}`));
    if (it.summary) console.log(c("muted", "    ") + c("cream", it.summary.slice(0, 200)));
    console.log();
  }
  if (opts.tail) {
    console.log(c("muted", "  (tailing — press Ctrl+C to stop)"));
    let last_id = items[0]?.id;
    while (true) {
      await new Promise(r => setTimeout(r, 2000));
      const t = await reqJSON("GET", `/api/v4/receipts/list?limit=5${source}`);
      const ti = t.body.items || [];
      for (const it of ti) {
        if (it.id === last_id) break;
        console.log(c("amber", `  ${it.source.padEnd(20)}`) + c("cream", it.title || "(no title)"));
        console.log(c("muted", `  ${it.id}  ${it.ts}`));
      }
      if (ti[0]) last_id = ti[0].id;
    }
  }
}

async function cmdOpen(target) {
  if (!target) { console.error(c("red", "usage: obx open <path>")); process.exit(2); }
  const abs = path.resolve(target);
  try { await fs.stat(abs); } catch { console.error(c("red", `not found: ${abs}`)); process.exit(2); }
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  const r = await reqJSON("POST", "/api/v4/project/recent", { root: abs });
  if (r.body.ok) {
    console.log(c("green", "✓ ") + c("cream", `${r.body.added.name}`) + c("muted", `  ${r.body.added.root}`));
  } else {
    console.error(c("red", "error: " + (r.body.error || "unknown")));
    process.exit(4);
  }
}

async function cmdConnect(args) {
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  // args.positional[0] is "connect"; the real sub-args start at index 1.
  const sub = args.positional.slice(1);
  const service = sub[0];
  if (!service || service === "--list" || service === "list") {
    // List all
    const r = await reqJSON("GET", "/api/v4/connectors/list");
    const services = r.body.services || [];
    const by_cat = {};
    for (const s of services) { (by_cat[s.category] ||= []).push(s); }
    console.log(c("orange", `▣ ORANGEBOX connectors (${services.length} services)`));
    console.log();
    for (const [cat, list] of Object.entries(by_cat)) {
      console.log(c("amber", cat.toUpperCase()));
      for (const s of list) {
        const conn = s.connection;
        let glyph, status;
        if (conn) {
          if (conn.expired) { glyph = c("amber", "!"); status = c("amber", "expired"); }
          else { glyph = c("green", "✓"); status = c("green", `${conn.auth_type}, granted ${conn.granted_at?.slice(0,10) || "?"}`); }
        } else {
          glyph = c("muted", "·");
          status = c("muted", s.auth_type === "oauth2" ? "OAuth (not connected)" : s.auth_type === "apikey" ? "api key (not set)" : s.auth_type);
        }
        console.log(`  ${glyph}  ${c("cream", s.label.padEnd(28))} ${status}`);
      }
      console.log();
    }
    console.log(c("muted", "  obx connect <service>            ") + c("cream", "start OAuth flow (opens browser)"));
    console.log(c("muted", "  obx connect <service> --key K    ") + c("cream", "for apikey services"));
    console.log(c("muted", "  obx connect <service> --key K --secondary S ") + c("cream", "for apikey_pair (Twilio etc.)"));
    console.log(c("muted", "  obx connect --disconnect <svc>   ") + c("cream", "revoke a connection"));
    return;
  }
  if (service === "--disconnect" || service === "disconnect") {
    const target = sub[1];
    if (!target) { console.error(c("red", "usage: obx connect --disconnect <service>")); process.exit(2); }
    const r = await reqJSON("POST", `/api/v4/connectors/disconnect/${target}`);
    if (r.body.ok) console.log(c("green", `✓ disconnected ${target}`));
    else console.error(c("red", `error: ${r.body.error || "unknown"}`));
    return;
  }
  // Service connection
  const body = {};
  if (args.flags.key) body.key = args.flags.key;
  if (args.flags.secondary) body.secondary = args.flags.secondary;
  if (args.flags.url) body.url = args.flags.url;
  const r = await reqJSON("POST", `/api/v4/connectors/connect/${service}`, body);
  if (r.body.ok === true) {
    console.log(c("green", `✓ connected ${service}`));
    if (r.body.expires_at) console.log(c("muted", `  expires_at: ${r.body.expires_at}`));
    return;
  }
  if (r.body.authorize_url) {
    console.log(c("orange", `▸ Browser opened to authorize ${service}`));
    console.log(c("muted", `  If it didn't open, visit: ${r.body.authorize_url}`));
    console.log(c("muted", `  state: ${r.body.state}`));
    console.log(c("muted", `  Waiting for callback at http://127.0.0.1:8788/oauth/${service}/callback ...`));
    return;
  }
  if (r.body.needs_app_registration) {
    console.error(c("amber", `! ${service} needs an OAuth app registered first`));
    console.log(c("muted", `  ${r.body.hint}`));
    if (r.body.app_registration_url) console.log(c("cream", `  ${r.body.app_registration_url}`));
    process.exit(2);
  }
  console.error(c("red", `error: ${r.body.error || JSON.stringify(r.body).slice(0, 300)}`));
  process.exit(4);
}

function printSurfaceHelp() {
  console.log(c("orange", "▣ obx surface — Silent Canvas Surface Factory"));
  console.log();
  console.log(c("muted", "  obx surface templates                         ") + c("cream", "list versioned templates"));
  console.log(c("muted", "  obx surface list                              ") + c("cream", "list registered surfaces"));
  console.log(c("muted", "  obx surface create <name>                     ") + c("cream", "create a core-v1 surface"));
  console.log(c("muted", "      --template=core-v1 --root=C:\\path --description=\"...\""));
  console.log(c("muted", "  obx surface doctor [--json] [--receipt]       ") + c("cream", "prove Surface Factory + Solidify end-to-end"));
  console.log();
}

async function cmdSurface(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    printSurfaceHelp();
    return;
  }

  const sidecarUp = await ensureSidecarUp(1500);

  if (verb === "templates") {
    let templates;
    if (sidecarUp) {
      const r = await reqJSON("GET", "/api/v4/surfaces/templates");
      if (r.status === 200 && Array.isArray(r.body.templates)) templates = r.body.templates;
    }
    if (!templates) {
      const sf = await import("./v4/surface-factory.mjs");
      templates = sf.listTemplates();
    }
    for (const t of templates) {
      console.log(`${c("amber", t.template_id.padEnd(10))} ${c("cream", t.title)} ${c("muted", `seed=${t.seed_mutation_count}`)}`);
      console.log(c("muted", `  ${t.description}`));
    }
    return;
  }

  if (verb === "list") {
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", "/api/v4/surfaces/list");
      if (r.status === 200 && r.body?.ok !== false) out = r.body;
    }
    if (!out) {
      const sf = await import("./v4/surface-factory.mjs");
      out = await sf.listSurfaces();
    }
    const surfaces = out.surfaces || [];
    if (!surfaces.length) {
      console.log(c("muted", "(no surfaces yet — `obx surface create <name>`)"));
      return;
    }
    for (const s of surfaces) {
      console.log(`${c("cream", s.surface_id)}  ${c("amber", s.template_id.padEnd(8))}  ${s.name}`);
      console.log(c("muted", `  ${s.workspace}`));
    }
    return;
  }

  if (verb === "create") {
    const name = sub.slice(1).join(" ").trim();
    if (!name) {
      console.error(c("red", "usage: obx surface create <name> [--template=core-v1] [--root=C:\\path]"));
      process.exit(2);
    }
    const body = {
      name,
      template_id: args.flags.template || "core-v1",
      root: args.flags.root || null,
      description: args.flags.description || "",
    };
    let result;
    if (sidecarUp) {
      const r = await reqJSON("POST", "/api/v4/surfaces/create", body, 30000);
      if (r.status === 200 || r.status === 201) {
        result = r.body;
      } else if (r.status !== 404) {
        console.error(c("red", `error: ${r.body?.error || JSON.stringify(r.body).slice(0, 240)}`));
        process.exit(4);
      }
    }
    if (!result) {
      const sf = await import("./v4/surface-factory.mjs");
      result = await sf.createSurface(body);
      console.log(c("amber", sidecarUp ? "sidecar route not yet available; created locally without v4 receipt" : "sidecar not running; created locally without v4 receipt"));
    }
    console.log(c("green", `✓ surface created: ${result.surface.name}`));
    console.log(c("muted", `  id:        ${result.surface.surface_id}`));
    console.log(c("muted", `  workspace: ${result.surface.workspace}`));
    console.log(c("muted", `  graph:     ${result.graph.nodes} nodes / ${result.graph.wires} wires / ${result.graph.regions} regions`));
    console.log(c("muted", `  registry:  ${result.registry_path}`));
    return;
  }

  if (verb === "doctor") {
    const doctor = await import("./v4/surface-doctor.mjs");
    const out = await doctor.runSurfaceDoctor({
      writeReceipt: !!args.flags.receipt,
      keepTemp: !!args.flags["keep-temp"],
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} Surface Factory + Solidify doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }

  console.error(c("red", `unknown surface verb: ${verb}`));
  printSurfaceHelp();
  process.exit(2);
}

// ── obx ads ─ native advertising architecture (v6.3.0-alpha.6) ─────────────
// Operator scope addition: native Meta CAPI + Google Enhanced Conversions +
// UTM standardizer + DCO asset pools + Revealbot-equivalent rules engine.
function printMcpHelp() {
  console.log(c("orange", "■ obx mcp — ORANGEBOX MCP bridge"));
  console.log();
  console.log(c("muted", "  obx mcp servers                         ") + c("cream", "list built-in + custom MCP servers"));
  console.log(c("muted", "  obx mcp probe <server_id>                ") + c("cream", "probe health/tool-list without installing"));
  console.log(c("muted", "  obx mcp tools <server_id>                ") + c("cream", "show last observed tool list"));
  console.log(c("muted", "  obx mcp register <name> --url=https://... ") + c("cream", "register remote HTTP MCP"));
  console.log(c("muted", "  obx mcp disable <server_id>              ") + c("cream", "disable a server in ORANGEBOX registry"));
  console.log(c("muted", "  obx mcp doctor [--json] [--receipt]      ") + c("cream", "prove registry, tool-list probe, metadata-only stdio, disable"));
  console.log();
}

function printMcpServers(out) {
  const servers = out.servers || [];
  console.log(c("orange", `■ ORANGEBOX MCP bridge (${servers.length} servers)`));
  console.log(c("muted", `  registry: ${out.registry_path || "(builtin only)"}`));
  console.log();
  for (const s of servers) {
    const disabled = s.disabled ? c("red", "disabled") : c("green", "enabled");
    const probe = s.last_probe?.promotion_gate || "not probed";
    console.log(`${c("amber", s.id.padEnd(24))} ${c("cream", s.name || s.id)} ${c("muted", s.transport || "?")} ${disabled}`);
    console.log(c("muted", `  ${s.status || "custom"} · ${probe}`));
    if (s.url) console.log(c("muted", `  ${s.url}`));
    else if (s.command) console.log(c("muted", `  ${s.command} ${(s.args || []).join(" ")}`));
  }
}

async function cmdMcp(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    printMcpHelp();
    return;
  }
  const sidecarUp = await ensureSidecarUp(1500);

  if (verb === "servers" || verb === "list") {
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", "/api/v4/mcp/servers");
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const bridge = await import("./v4/mcp-bridge.mjs");
      out = await bridge.listServers();
    }
    return printMcpServers(out);
  }

  if (verb === "probe") {
    const id = sub[1];
    if (!id) { console.error(c("red", "usage: obx mcp probe <server_id>")); process.exit(2); }
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", `/api/v4/mcp/probe/${encodeURIComponent(id)}`, { timeout_ms: parseInt(args.flags.timeout || "7000", 10) }, 20000);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const bridge = await import("./v4/mcp-bridge.mjs");
      out = await bridge.probeServer({ id, timeoutMs: parseInt(args.flags.timeout || "7000", 10) });
    }
    console.log(c(out.ok ? "green" : "amber", `■ probe ${id}`));
    console.log(c("muted", `  gate:  ${out.promotion_gate || "unknown"}`));
    console.log(c("muted", `  tools: ${out.tools_count || 0}`));
    if (out.health?.status) console.log(c("muted", `  health: HTTP ${out.health.status}`));
    if (out.auth_likely_required) console.log(c("amber", "  auth likely required before tool-list"));
    return;
  }

  if (verb === "tools") {
    const id = sub[1];
    if (!id) { console.error(c("red", "usage: obx mcp tools <server_id>")); process.exit(2); }
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", `/api/v4/mcp/tools/${encodeURIComponent(id)}`);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const bridge = await import("./v4/mcp-bridge.mjs");
      out = await bridge.listTools({ id });
    }
    if (!out.tools?.length) {
      console.log(c("muted", "(no tools observed yet — run `obx mcp probe " + id + "`)"));
      return;
    }
    for (const tool of out.tools) {
      console.log(c("amber", tool.name || "(unnamed)"));
      if (tool.description) console.log(c("muted", "  " + tool.description.slice(0, 220)));
    }
    return;
  }

  if (verb === "register") {
    const name = sub.slice(1).join(" ").trim();
    if (!name || !args.flags.url) {
      console.error(c("red", "usage: obx mcp register <name> --url=https://..."));
      process.exit(2);
    }
    const body = {
      name,
      url: args.flags.url,
      category: args.flags.category || "custom",
      transport: "http",
      notes: args.flags.notes || "",
    };
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", "/api/v4/mcp/register", body);
      if (r.status === 200 || r.status === 201) out = r.body;
    }
    if (!out) {
      const bridge = await import("./v4/mcp-bridge.mjs");
      out = await bridge.registerServer({ body });
      console.log(c("amber", sidecarUp ? "sidecar route not yet available; registered locally without v4 receipt" : "sidecar not running; registered locally without v4 receipt"));
    }
    console.log(c("green", `✓ MCP registered: ${out.server.id}`));
    console.log(c("muted", `  ${out.server.url}`));
    return;
  }

  if (verb === "disable" || verb === "enable") {
    const id = sub[1];
    if (!id) { console.error(c("red", `usage: obx mcp ${verb} <server_id>`)); process.exit(2); }
    const disabled = verb === "disable";
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", `/api/v4/mcp/disable/${encodeURIComponent(id)}`, { disabled });
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const bridge = await import("./v4/mcp-bridge.mjs");
      out = await bridge.disableServer({ id, disabled });
    }
    console.log(c("green", `✓ ${disabled ? "disabled" : "enabled"} ${out.id}`));
    return;
  }

  if (verb === "doctor") {
    const doctor = await import("./v4/mcp-doctor.mjs");
    const out = await doctor.runMcpDoctor({
      writeReceipt: !!args.flags.receipt,
      keepTemp: !!args.flags["keep-temp"],
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} MCP bridge doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  install_attempted: ${out.install_attempted ? "yes" : "no"}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }

  console.error(c("red", `unknown mcp verb: ${verb}`));
  printMcpHelp();
  process.exit(2);
}

async function cmdIntel(args) {
  const intel = await import("./v4/intel-integration.mjs");
  const sub = args.positional.slice(1);
  const verb = sub[0] || "list";
  const opts = {
    priority: args.flags.priority || null,
    domain: args.flags.domain || null,
  };
  let out;
  if (verb === "brief" || verb === "export") {
    out = await intel.writeIntelBrief(opts);
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else console.log(c("green", `✓ wrote ${out.path} (${out.count} items)`));
    return;
  }
  if (verb === "doctor") {
    out = await intel.runIntelDoctor();
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} intel integration doctor`));
      console.log(c("muted", `  items: ${out.count}`));
      console.log(c("muted", `  brief: ${out.brief_path}`));
      for (const id of out.required_ids_missing || []) console.log(c("red", `  missing: ${id}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "surface") {
    const surface = await import("./v4/intel-surface.mjs");
    out = await surface.runIntelSurfaceDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ÆoN Intel Dashboard surface`));
      console.log(c("muted", `  workspace: ${out.result.workspace}`));
      console.log(c("muted", `  graph:     ${out.result.graph_counts.nodes} nodes / ${out.result.graph_counts.wires} wires`));
      if (out.result.receipt_path) console.log(c("muted", `  receipt:   ${out.result.receipt_path}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  out = await intel.listIntel(opts);
  if (args.flags.json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(c("orange", `■ ORANGEBOX intel backlog (${out.count} items)`));
    for (const item of out.items) {
      console.log(`${c(item.priority === "P0" ? "amber" : "muted", item.priority.padEnd(2))} ${c("cream", item.id.padEnd(38))} ${item.name}`);
    }
  }
}

async function cmdApi(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0] || "doctor";
  if (verb === "doctor") {
    const doctor = await import("./v4/api-doctor.mjs");
    const out = await doctor.runApiDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} OpenAPI contract doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  spec:     ${out.spec_path}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) console.log(c("red", `  failure: ${failure.name} ${failure.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "language-doctor") {
    const doctor = await import("./v4/product-language-doctor.mjs");
    const out = await doctor.runProductLanguageDoctor({
      writeReceipt: !!args.flags.receipt,
      startServer: !args.flags["no-start-server"],
      includeMutationSmoke: !!args.flags.mutating || !!args.flags["include-mutation-smoke"],
      baseUrl: args.flags["base-url"] || null,
      forceTempServer: !!args.flags.isolated,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} AE See-Suite product-language doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  warnings: ${out.summary.warnings}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) console.log(c("red", `  failure: ${failure.name} ${failure.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "spec") {
    const api = await import("./v4/api-doctor.mjs");
    const loaded = await api.loadOpenApiSpec();
    console.log(JSON.stringify(loaded.spec, null, 2));
    return;
  }
  console.error(c("red", `unknown api verb: ${verb}`));
  process.exit(2);
}

async function cmdAELang(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0] || "doctor";
  const aelang = await import("./v4/aelang.mjs");
  if (verb === "help" || verb === "--help") {
    console.log(c("orange", "AELang - Agentic Engine Language"));
    console.log();
    console.log(c("muted", "  obx aelang doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove spec, High->Core compile, Core validation, and Operating Spine mapping"));
    console.log(c("muted", "  obx aelang compile [--input=FILE] [--tier=auto|high|core] [--json] [--receipt]"));
    console.log(c("muted", "       compile an AELang mission or route_packet into an ORANGEBOX route packet"));
    return;
  }
  let out;
  if (verb === "doctor") {
    out = await aelang.runAELangDoctor({ writeReceipt: !!args.flags.receipt });
  } else if (verb === "compile") {
    const inputPath = args.flags.input || args.flags.file;
    const source = inputPath
      ? await fs.readFile(path.resolve(String(inputPath)), "utf8")
      : aelang.HIGH_SAMPLE;
    out = await aelang.compileAELang({
      source,
      tier: args.flags.tier || "auto",
      writeReceipt: !!args.flags.receipt,
    });
  } else {
    console.error(c("red", `unknown aelang verb: ${verb}`));
    process.exit(2);
  }
  if (args.flags.json) console.log(JSON.stringify(out, null, 2));
  else {
    const title = verb === "compile" ? "AELang compile" : "AELang doctor";
    console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ${title}`));
    if (out.summary) {
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  warnings: ${out.summary.warnings}`));
    }
    if (out.route_packet) console.log(c("muted", `  route:    ${out.route_packet.id}`));
    if (out.detected_tier) console.log(c("muted", `  tier:     ${out.detected_tier}`));
    if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
    for (const failure of out.failures || []) console.log(c("red", `  failure: ${failure.id || failure.name} ${failure.detail || failure.error || ""}`));
    for (const warning of out.warnings || []) console.log(c("amber", `  watch:   ${warning.id || warning.name} ${warning.detail || warning.error || ""}`));
  }
  if (!out.ok) process.exit(4);
}

async function cmdInstall(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0] || "doctor";
  if (verb === "help" || verb === "--help") {
    console.log(c("orange", "ORANGEBOX install"));
    console.log();
    console.log(c("muted", "  obx install doctor [--json] [--receipt] [--base-url=http://127.0.0.1:8787]"));
    console.log(c("cream", "       prove Basic Install vs Advanced AI Box clarity, recovery, and safe local fallback"));
    console.log(c("muted", "  obx install recovery-guide [--json] [--receipt]"));
    console.log(c("cream", "       print the read-only Basic/Advanced repair, rollback, process, package, and vault guide"));
    console.log(c("muted", "  obx install service-freshness [--json] [--receipt] [--base-url=http://127.0.0.1:8787]"));
    console.log(c("cream", "       prove the running sidecar has the routes AE Operations expects"));
    console.log(c("muted", "  obx install service-freshness-latest [--json]"));
    console.log(c("cream", "       show latest persisted Service Freshness proof without probing the live sidecar"));
    console.log(c("muted", "  obx install rehearsal [--json] [--receipt]"));
    console.log(c("cream", "       rehearse a clean one-machine Basic Install from a fresh data root"));
    console.log(c("muted", "  obx install rehearsal-latest [--json]"));
    console.log(c("cream", "       show latest persisted clean-install rehearsal proof without running a new one"));
    console.log(c("muted", "  obx install visual-proof [--json] [--receipt] [--base-url=http://127.0.0.1:8787]"));
    console.log(c("cream", "       screenshot the first-run AI-computer choice at desktop + compact sizes"));
    console.log(c("muted", "  obx install see-suite-proof [--json] [--receipt] [--isolated] [--base-url=http://127.0.0.1:8787]"));
    console.log(c("cream", "       screenshot AE See-Suite and prove the creation surface is present"));
    console.log(c("muted", "  obx install operations-proof [--json] [--receipt] [--base-url=http://127.0.0.1:8787]"));
    console.log(c("cream", "       screenshot AE Operations and prove product-facing Settings copy is absent"));
    console.log(c("muted", "  obx install process-doctor [--json] [--receipt]"));
    console.log(c("cream", "       read-only process hygiene check for stale proof work and duplicate ORANGEBOX helpers"));
    return;
  }
  if (verb === "recovery-guide" || verb === "recovery" || verb === "repair") {
    const recovery = await import("./v4/recovery-guide.mjs");
    const out = await recovery.runRecoveryGuide({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("green", "[ok] ORANGEBOX recovery guide"));
      console.log(c("muted", `  read-only: ${out.read_only ? "yes" : "no"}`));
      console.log(c("muted", `  receipt:   ${out.receipt_path || "not requested"}`));
      console.log(c("cream", `  ${out.headline}`));
      for (const item of out.sections) {
        console.log();
        console.log(c("orange", `  ${item.title}`));
        console.log(c("muted", `    status: ${item.status}${item.approval_required ? " / approval required for changes" : ""}`));
        console.log(c("cream", `    ${item.recovery_action}`));
        for (const command of item.commands.slice(0, 3)) console.log(c("muted", `    - ${command}`));
      }
    }
    return;
  }
  if (verb === "service-freshness-latest" || verb === "freshness-latest" || verb === "service-latest") {
    const fresh = await import("./v4/service-freshness.mjs");
    const out = await fresh.getLatestServiceFreshnessProof({
      limit: Number(args.flags.limit || 8),
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const latest = out.latest || {};
      const kind = !out.found ? "amber" : latest.service_ok ? "green" : latest.status === "restart_required" ? "amber" : "red";
      console.log(c(kind, `${out.found ? "[proof]" : "[missing]"} ORANGEBOX latest Service Freshness`));
      console.log(c("muted", `  found:    ${out.found ? "yes" : "no"}`));
      console.log(c("muted", `  status:   ${latest.status || "not available"}`));
      console.log(c("muted", `  routes:   ${latest.summary ? `${latest.summary.passed}/${latest.summary.routes}` : "not available"}`));
      console.log(c("muted", `  receipt:  ${latest.receipt_path || "not available"}`));
      console.log(c("cream", `  ${out.recovery_action}`));
      for (const failure of (latest.failures || []).slice(0, 6)) {
        console.log(c("red", `  failure: ${failure.path} HTTP ${failure.status} ${failure.diagnosis}`));
      }
    }
    if (!out.found) process.exit(4);
    return;
  }
  if (verb === "service-freshness" || verb === "freshness" || verb === "service") {
    const fresh = await import("./v4/service-freshness.mjs");
    const out = await fresh.runServiceFreshnessDoctor({
      writeReceipt: !!args.flags.receipt,
      baseUrl: args.flags["base-url"] || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const kind = out.ok ? "green" : out.status === "restart_required" ? "amber" : "red";
      console.log(c(kind, `${out.ok ? "[ok]" : "[review]"} ORANGEBOX service freshness`));
      console.log(c("muted", `  base:     ${out.base_url}`));
      console.log(c("muted", `  status:   ${out.status}`));
      console.log(c("muted", `  routes:   ${out.summary.passed}/${out.summary.routes}`));
      console.log(c("muted", `  receipt:  ${out.receipt_path || "not requested"}`));
      console.log(c("cream", `  ${out.recovery_action}`));
      for (const failure of out.failures.slice(0, 6)) {
        console.log(c("red", `  failure: ${failure.path} HTTP ${failure.status} ${failure.diagnosis}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "rehearsal" || verb === "clean-rehearsal" || verb === "fresh-rehearsal") {
    const rehearsal = await import("./v4/install-rehearsal.mjs");
    const out = await rehearsal.runInstallRehearsal({
      writeReceipt: !!args.flags.receipt,
      keepDataRoot: !args.flags["clean-temp"],
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX clean Basic Install rehearsal`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  artifact: ${out.artifact_root}`));
      console.log(c("muted", `  data:     ${out.data_root}`));
      console.log(c("muted", `  proof:    ${out.proof_dir}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of (out.failures || []).slice(0, 6)) console.log(c("red", `  failure: ${failure.id} ${failure.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "rehearsal-latest" || verb === "latest-rehearsal" || verb === "clean-rehearsal-latest") {
    const rehearsal = await import("./v4/install-rehearsal.mjs");
    const out = await rehearsal.getLatestInstallRehearsal();
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const latest = out.latest || {};
      console.log(c(out.ok ? "green" : "amber", `${out.found ? "[ok]" : "[review]"} latest ORANGEBOX clean Basic Install rehearsal`));
      console.log(c("muted", `  found:    ${out.found ? "yes" : "no"}`));
      console.log(c("muted", `  checks:   ${latest.summary ? `${latest.summary.passed}/${latest.summary.checks}` : "not available"}`));
      console.log(c("muted", `  artifact: ${latest.artifact_root || "not available"}`));
      console.log(c("muted", `  state:    ${latest.state_path || "not available"}`));
      console.log(c("muted", `  receipt:  ${latest.receipt_path || "not available"}`));
      console.log(c("cream", `  ${out.recovery_action}`));
    }
    if (!out.found) process.exit(4);
    return;
  }
  if (verb === "doctor") {
    const doctor = await import("./v4/install-clarity-doctor.mjs");
    const out = await doctor.runInstallClarityDoctor({
      writeReceipt: !!args.flags.receipt,
      startServer: !args.flags["no-start-server"],
      baseUrl: args.flags["base-url"] || null,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX install clarity doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  warnings: ${out.summary.warnings}`));
      console.log(c("muted", "  Basic:    one computer, default, no AI Box required"));
      console.log(c("muted", "  Advanced: controller + optional AI Box over Router LAN, Ethereal Ethernet, or Thunderbolt-class networking"));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) console.log(c("red", `  failure: ${failure.name} ${failure.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "visual-proof") {
    const proof = await import("./v4/first-run-visual-proof.mjs");
    const out = await proof.runFirstRunVisualProof({
      writeReceipt: !!args.flags.receipt,
      startServer: !args.flags["no-start-server"],
      forceTempServer: !!args.flags.isolated,
      keepTemp: !!args.flags["keep-temp"],
      baseUrl: args.flags["base-url"] || null,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX first-run visual proof`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  desktop:  ${out.screenshots?.find((shot) => shot.name === "desktop")?.path || ""}`));
      console.log(c("muted", `  compact:  ${out.screenshots?.find((shot) => shot.name === "compact")?.path || ""}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of (out.failures || []).slice(0, 6)) console.log(c("red", `  failure: ${failure.type} ${failure.message || failure.pattern || failure.path || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "see-suite-proof" || verb === "ae-see-suite-proof") {
    const proof = await import("./v4/ae-see-suite-visual-proof.mjs");
    const out = await proof.runAeSeeSuiteVisualProof({
      writeReceipt: !!args.flags.receipt,
      startServer: !args.flags["no-start-server"],
      keepTemp: !!args.flags["keep-temp"],
      forceTempServer: !!args.flags.isolated,
      baseUrl: args.flags["base-url"] || null,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX AE See-Suite visual proof`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  desktop:  ${out.screenshots?.find((shot) => shot.name === "desktop")?.path || ""}`));
      console.log(c("muted", `  compact:  ${out.screenshots?.find((shot) => shot.name === "compact")?.path || ""}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of (out.failures || []).slice(0, 6)) console.log(c("red", `  failure: ${failure.type} ${failure.message || failure.pattern || failure.path || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "operations-proof" || verb === "ae-operations-proof") {
    const proof = await import("./v4/ae-operations-visual-proof.mjs");
    const out = await proof.runAeOperationsVisualProof({
      writeReceipt: !!args.flags.receipt,
      startServer: !args.flags["no-start-server"],
      forceTempServer: !!args.flags.isolated,
      keepTemp: !!args.flags["keep-temp"],
      baseUrl: args.flags["base-url"] || null,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX AE Operations visual proof`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  desktop:  ${out.screenshots?.find((shot) => shot.name === "desktop")?.path || ""}`));
      console.log(c("muted", `  compact:  ${out.screenshots?.find((shot) => shot.name === "compact")?.path || ""}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of (out.failures || []).slice(0, 6)) console.log(c("red", `  failure: ${failure.type} ${failure.message || failure.pattern || failure.path || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "process-doctor" || verb === "processes" || verb === "process-hygiene") {
    const doctor = await import("./v4/process-doctor.mjs");
    const out = await doctor.runProcessDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const summary = out.summary || {};
      console.log(c(out.ok ? "green" : "amber", `${out.ok ? "[ok]" : "[review]"} ORANGEBOX process hygiene`));
      console.log(c("muted", `  processes: ${summary.process_count ?? "?"}`));
      console.log(c("muted", `  stale:     ${summary.stale_count ?? "?"}`));
      console.log(c("muted", `  warnings:  ${summary.warnings ?? 0}`));
      console.log(c("muted", `  receipt:   ${out.receipt_path || "not requested"}`));
      console.log(c("cream", `  ${out.recovery?.actions?.[0]?.title || "No process recovery action needed."}`));
      for (const warning of (out.warnings || []).slice(0, 6)) {
        console.log(c("amber", `  watch: ${warning.detail || warning.reason || warning.type || warning}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  console.error(c("red", `unknown install verb: ${verb}`));
  process.exit(2);
}

async function cmdNetwork(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0] || "doctor";
  if (verb === "help" || verb === "--help") {
    console.log(c("orange", "AI Box Network Priority"));
    console.log();
    console.log(c("muted", "  obx network doctor [--json] [--deep] [--receipt]"));
    console.log(c("muted", "       read-only route, QoS, process, and policy-pack diagnosis"));
    console.log(c("muted", "  obx network pack [--json] [--receipt]"));
    console.log(c("muted", "       generate the Administrator-applied Windows QoS/firewall policy pack"));
    console.log(c("muted", "       --include-browsers --no-game-launchers --emergency-block-launchers"));
    console.log(c("muted", "  obx network ethereal doctor [--json] [--deep] [--receipt]"));
    console.log(c("muted", "       read-only direct-cable adapter/subnet/MTU handshake diagnosis"));
    console.log(c("muted", "  obx network ethereal latest [--json]"));
    console.log(c("muted", "       show latest persisted Ethereal pack, validation command, rollback command, and receipt proof"));
    console.log(c("muted", "  obx network ethereal pack [--json] [--receipt]"));
    console.log(c("muted", "       generate the Administrator-applied direct-link installer pack"));
    console.log(c("muted", "       --adapter=\"Ethernet 2\" --subnet=10.0.99 --host-ip=10.0.99.1 --peer-ip=10.0.99.2 --tcp-datacenter"));
    console.log(c("muted", "       --storage-mode=Auto --share-path=C:\\OrangeBoxAI-Share --drive=O:"));
    return;
  }

  if (verb === "doctor") {
    const net = await import("./v4/ai-box-network.mjs");
    const out = await net.runAiBoxNetworkDoctor({
      writeReceipt: !!args.flags.receipt,
      deep: !!args.flags.deep,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "amber", `${out.ok ? "[ok]" : "[review]"} AI Box Network Priority`));
      console.log(c("muted", `  status: ${out.status}`));
      console.log(c("muted", `  route:  ${out.active_route}`));
      console.log(c("muted", `  pack:   ${out.pack?.exists ? "present" : "missing"} ${out.pack?.directory || ""}`));
      if (out.observed_background_hogs?.length) {
        console.log(c("amber", `  background hogs observed: ${out.observed_background_hogs.map((row) => row.image).join(", ")}`));
      }
      for (const blocker of out.blockers || []) console.log(c("amber", `  blocker: ${blocker}`));
      if (out.receipt_path) console.log(c("muted", `  receipt: ${out.receipt_path}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }

  if (verb === "pack") {
    const net = await import("./v4/ai-box-network.mjs");
    const out = await net.buildAiBoxNetworkPack({
      includeBrowsers: !!args.flags["include-browsers"],
      includeGameLaunchers: !args.flags["no-game-launchers"],
      emergencyBlockLaunchers: !!args.flags["emergency-block-launchers"],
      writeReceipt: !!args.flags.receipt,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("green", "[ok] AI Box Network Priority pack generated"));
      console.log(c("muted", `  pack:     ${out.pack_dir}`));
      console.log(c("muted", `  approval: ${out.approval_required ? "required" : "not required"}`));
      console.log(c("muted", `  apply:    ${out.files?.apply_cmd || ""}`));
      console.log(c("muted", `  remove:   ${out.files?.remove_cmd || ""}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
    }
    return;
  }

  if (verb === "ethereal" || verb === "direct" || verb === "link") {
    const action = sub[1] || "doctor";
    const net = await import("./v4/ai-box-network.mjs");
    const common = {
      adapterAlias: args.flags.adapter || args.flags["adapter-alias"] || "",
      subnet: args.flags.subnet || "",
      hostIp: args.flags["host-ip"] || "",
      peerIp: args.flags["peer-ip"] || "",
    };
    if (action === "doctor") {
      const out = await net.runEtherealLinkDoctor({
        ...common,
        writeReceipt: !!args.flags.receipt,
        deep: !!args.flags.deep,
      });
      if (args.flags.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(c(out.ok ? "green" : "amber", `${out.ok ? "[ok]" : "[review]"} Ethereal AI Link`));
        console.log(c("muted", `  status: ${out.status}`));
        console.log(c("muted", `  subnet: ${out.config?.subnet}.x`));
        console.log(c("muted", `  host:   ${out.config?.host_ip}`));
        console.log(c("muted", `  peer:   ${out.config?.peer_ip}`));
        console.log(c("muted", `  pack:   ${out.pack?.exists ? "present" : "missing"} ${out.pack?.directory || ""}`));
        for (const candidate of (out.candidates || []).slice(0, 4)) {
          console.log(c("muted", `  adapter candidate: ${candidate.Name} / ${candidate.LinkSpeed} / ${candidate.InterfaceDescription}`));
        }
        for (const blocker of out.blockers || []) console.log(c("amber", `  blocker: ${blocker}`));
        if (out.receipt_path) console.log(c("muted", `  receipt: ${out.receipt_path}`));
      }
      if (!out.ok) process.exit(4);
      return;
    }
    if (action === "latest" || action === "status" || action === "proof") {
      const out = await net.getLatestEtherealLinkProof();
      if (args.flags.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(c(out.ok ? "green" : "amber", `${out.ok ? "[ok]" : "[review]"} latest Ethereal AI Link proof`));
        console.log(c("muted", `  status:   ${out.status}`));
        console.log(c("muted", `  pack:     ${out.pack?.exists ? "present" : "missing"} ${out.pack?.directory || ""}`));
        console.log(c("muted", `  validate: ${out.safety?.validation_command || "not available"}`));
        console.log(c("muted", `  rollback: ${out.safety?.rollback_command || "not available"}`));
        console.log(c("muted", `  token:    ${out.pack?.token_file_present ? "present locally / not shipped" : "create before socket use"}`));
        if (out.latest_doctor?.receipt_path) console.log(c("muted", `  doctor:   ${out.latest_doctor.receipt_path}`));
        if (out.latest_pack_receipt?.receipt_path) console.log(c("muted", `  receipt:  ${out.latest_pack_receipt.receipt_path}`));
        console.log(c("cream", `  ${out.recovery_action}`));
      }
      if (!out.found) process.exit(4);
      return;
    }
    if (action === "pack") {
      const out = await net.buildEtherealLinkPack({
        ...common,
        role: args.flags.role || "both",
        tcpDatacenterMode: !!args.flags["tcp-datacenter"],
        storageMode: args.flags["storage-mode"] || "None",
        storageShareName: args.flags["share-name"] || "OrangeBoxAI",
        storageSharePath: args.flags["share-path"] || "C:\\OrangeBoxAI-Share",
        storageDriveLetter: args.flags.drive || "O:",
        writeReceipt: !!args.flags.receipt,
      });
      if (args.flags.json) console.log(JSON.stringify(out, null, 2));
      else {
        console.log(c("green", "[ok] Ethereal AI Link installer pack generated"));
        console.log(c("muted", `  pack:     ${out.pack_dir}`));
        console.log(c("muted", `  host:     ${out.config.host_ip}`));
        console.log(c("muted", `  peer:     ${out.config.peer_ip}`));
        console.log(c("muted", `  approval: ${out.approval_required ? "required" : "not required"}`));
        console.log(c("muted", `  host cmd: ${out.files?.apply_host_cmd || ""}`));
        console.log(c("muted", `  peer cmd: ${out.files?.apply_peer_cmd || ""}`));
        if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      }
      return;
    }
    console.error(c("red", `unknown ethereal network action: ${action}`));
    process.exit(2);
  }

  console.error(c("red", `unknown network verb: ${verb}`));
  process.exit(2);
}

function printRouteSummary(out) {
  console.log(c("orange", `Operating spine ${out.route_id}`));
  console.log(c("muted", `  project:       ${out.project}`));
  console.log(c("muted", `  objective:     ${out.objective}`));
  console.log(c("muted", `  macro-actions: ${out.macro_actions.map((action) => action.id).join(" -> ")}`));
  console.log(c("muted", `  lead:          ${out.coordination_profile?.lead_lane || "AE0"}`));
  console.log(c("muted", `  specialists:   ${(out.coordination_profile?.specialist_lanes || []).join(", ") || "none"}`));
  console.log(c("muted", `  dissent:       ${out.coordination_profile?.dissent_lane || "CHECKMATE"}`));
  console.log(c("muted", `  clarification: ${out.clarification_policy?.state || "unknown"}`));
  console.log(c("muted", `  model lane:    ${out.model_lane?.primary_profile || "codex-execution"}`));
  console.log(c("muted", `  proof gates:   ${out.proof_gates.map((gate) => gate.id).join(", ")}`));
  if (out.route_file) console.log(c("muted", `  route file:    ${out.route_file}`));
  if (out.receipt?.path || out.receipt?.id) console.log(c("muted", `  receipt:       ${out.receipt.path || out.receipt.id}`));
}

function printModelSwitchboardSummary(out) {
  const active = out.active_profile || out.status?.active_profile || {};
  console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} Running Brain switchboard`));
  console.log(c("muted", `  active:    ${active.label || out.active_profile_id || "unknown"}`));
  console.log(c("muted", `  provider:  ${active.provider || "unknown"}`));
  console.log(c("muted", `  model:     ${active.default_model || "unknown"}`));
  console.log(c("muted", `  mode:      ${active.route_mode || "single"}`));
  if (active.availability) {
    const avail = active.availability;
    console.log(c("muted", `  detected:  ${avail.status}${avail.binary ? ` (${avail.binary})` : ""}`));
  }
  if (active.skills) {
    console.log(c("muted", `  skills:    native=${active.skills.native_status || "unknown"} · ORANGEBOX=${active.skills.orangebox_internal?.status || "unknown"}`));
  }
  if (out.config_path) console.log(c("muted", `  config:    ${out.config_path}`));
  if (out.receipt_path) console.log(c("muted", `  receipt:   ${out.receipt_path}`));
  if (out.next_action) console.log(c("muted", `  next:      ${out.next_action}`));
}

async function cmdModel(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0] || "status";
  const model = await import("./v4/model-switchboard.mjs");
  if (verb === "help" || verb === "--help") {
    console.log(c("orange", "Running Brain switchboard"));
    console.log();
    console.log(c("muted", "  obx model status [--json] [--receipt]"));
    console.log(c("muted", "       show GPT, Opus, Grok, Gemini, and Grok Superheavy readiness"));
    console.log(c("muted", "  obx model switch <gpt|opus|grok|gemini|grok-superheavy> [--json] [--receipt]"));
    console.log(c("muted", "       select the active model lane without making a model call"));
    console.log(c("muted", "  obx model doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove switch persistence, route preference, skill reporting, and no-token probes"));
    return;
  }
  let out;
  if (verb === "status") {
    out = await model.getModelSwitchboardStatus({
      dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
      writeReceipt: !!args.flags.receipt,
    });
  } else if (verb === "switch" || verb === "select") {
    const profileId = sub[1];
    if (!profileId) {
      console.error(c("red", "usage: obx model switch <gpt|opus|grok|gemini|grok-superheavy> [--json] [--receipt]"));
      process.exit(2);
    }
    out = await model.selectModelProfile({
      profileId,
      dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
      reason: args.flags.reason || "operator selected Running Brain from CLI",
      writeReceipt: !!args.flags.receipt,
    });
  } else if (verb === "doctor") {
    out = await model.runModelSwitchboardDoctor({
      dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
      writeReceipt: !!args.flags.receipt,
    });
  } else {
    console.error(c("red", `unknown model verb: ${verb}`));
    process.exit(2);
  }
  if (args.flags.json) console.log(JSON.stringify(out, null, 2));
  else printModelSwitchboardSummary(out);
  if (!out.ok) process.exit(4);
}

async function cmdRoute(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    console.log(c("orange", "Operating Spine"));
    console.log();
    console.log(c("muted", "  obx route plan \"<objective>\" [--json] [--receipt] [--project=NAME]"));
    console.log(c("muted", "       create the macro-action + department + proof-gate route packet"));
    console.log(c("muted", "  obx route current [--json]"));
    console.log(c("muted", "       read the durable current Mission Spine route and Vision Rail projection"));
    console.log(c("muted", "  obx route history [--json] [--limit=25]"));
    console.log(c("muted", "       list Mission Spine route history with package/promotion status"));
    console.log(c("muted", "  obx route show [route_id|current] [--json]"));
    console.log(c("muted", "       inspect one route packet, package, promotion, proof, and rollback bundle"));
    console.log(c("muted", "  obx route replay [route_id|current] [--json]"));
    console.log(c("muted", "       build the Mission Spine replay timeline and scrubber cursor states"));
    console.log(c("muted", "  obx route artifact [route_id|current] [artifact_key] [--json]"));
    console.log(c("muted", "       preview one allow-listed Mission Spine artifact file"));
    console.log(c("muted", "  obx route progress [next|macro_id] [--status=done] [--proof=\"...\"] [--json] [--receipt]"));
    console.log(c("muted", "       persist a macro-action transition and advance the Vision Rail"));
    console.log(c("muted", "  obx route verify-gates [--json] [--receipt]"));
    console.log(c("muted", "       run the current route proof-gate commands and advance verify on evidence"));
    console.log(c("muted", "  obx route package [--json] [--receipt]"));
    console.log(c("muted", "       build the current route proof bundle manifest and advance package"));
    console.log(c("muted", "  obx route receipt [--json]"));
    console.log(c("muted", "       synthesize the current route closeout receipt and advance receipt"));
    console.log(c("muted", "  obx route promote [--json] [--receipt]"));
    console.log(c("muted", "       refuse or record promotion based on evidence bundle"));
    console.log(c("muted", "  obx route doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove route spine, Claude export, CLI/API/AE See-Suite wiring"));
    console.log(c("muted", "  obx route state-doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove current route persistence and rail projection"));
    return;
  }
  if (verb === "doctor") {
    const doctor = await import("./v4/operating-spine.mjs");
    const out = await doctor.runRouteDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} operating spine doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) console.log(c("red", `  failure: ${failure.name} ${failure.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "state-doctor") {
    const doctor = await import("./v4/route-state.mjs");
    const out = await doctor.runRouteStateDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} route-state doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) console.log(c("red", `  failure: ${failure.name}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "plan") {
    const objective = sub.slice(1).join(" ").trim();
    if (!objective) {
      console.error(c("red", "usage: obx route plan \"<objective>\" [--json] [--receipt]"));
      process.exit(2);
    }
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", "/api/v4/route/plan", {
        objective,
        project: args.flags.project || "orangebox",
        receipt: !!args.flags.receipt,
      }, 30000);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const spine = await import("./v4/operating-spine.mjs");
      out = await spine.planOperatingRoute({
        objective,
        project: args.flags.project || "orangebox",
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeRoute: true,
        writeReceipt: !!args.flags.receipt,
      });
      const state = await import("./v4/route-state.mjs");
      const saved = await state.saveCurrentRoute({
        route: out,
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeRepoReceipt: !!args.flags.receipt,
      });
      out.current_route_path = saved.current_route_path;
      out.current_projection = saved.projection;
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else printRouteSummary(out);
    return;
  }
  if (verb === "current") {
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", "/api/v4/route/current", null, 15000);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const state = await import("./v4/route-state.mjs");
      out = await state.loadCurrentRoute({ dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else if (!out.current) {
      console.log(c("muted", "No current Mission Spine route yet."));
      console.log(c("muted", "Plan one with: obx route plan \"<objective>\" --receipt"));
    } else {
      printRouteSummary(out.current);
      const p = out.projection || {};
      console.log(c("muted", `  current macro: ${p.current_macro?.id || "none"}`));
      console.log(c("muted", `  current file:  ${out.current_route_path || ""}`));
    }
    return;
  }
  if (verb === "history") {
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    const limit = parseInt(args.flags.limit || "25", 10);
    if (sidecarUp) {
      const r = await reqJSON("GET", `/api/v4/route/history?limit=${encodeURIComponent(limit)}`, null, 15000);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const state = await import("./v4/route-state.mjs");
      out = await state.loadRouteHistory({ dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT, limit });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("orange", `Mission route history (${out.count || 0})`));
      for (const item of out.items || []) {
        console.log(`${c(item.promotion_ok ? "green" : item.package_ok ? "amber" : "muted", (item.status || "planned").padEnd(10))} ${c("cream", item.route_id)} ${c("muted", item.ts || "")}`);
        console.log(c("muted", `  ${item.objective || ""}`));
      }
    }
    return;
  }
  if (verb === "show" || verb === "detail") {
    const routeId = sub[1] || "current";
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", `/api/v4/route/detail?id=${encodeURIComponent(routeId)}`, null, 15000);
      if (r.status === 200 || r.status === 404) out = r.body;
    }
    if (!out) {
      const state = await import("./v4/route-state.mjs");
      out = await state.loadRouteDetail({ dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT, routeId });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else if (!out.ok) {
      console.log(c("red", `Mission route not found: ${routeId}`));
      if (out.error) console.log(c("muted", `  ${out.error}`));
    } else {
      console.log(c("orange", `Mission route ${out.route_id}`));
      console.log(c("muted", `  status:     ${out.status}`));
      console.log(c("muted", `  route:      ${out.paths?.route_file || ""}`));
      console.log(c("muted", `  package:    ${out.paths?.package_manifest || ""}`));
      console.log(c("muted", `  promotion:  ${out.paths?.promotion_record || ""}`));
      console.log(c("muted", `  browser:    ${out.artifact_summary?.browser_proofs || 0} proof(s)`));
      console.log(c("muted", `  rollback:   ${out.artifact_summary?.rollback_present ? "present" : "missing"}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "replay") {
    const routeId = sub[1] || "current";
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", `/api/v4/route/replay?id=${encodeURIComponent(routeId)}`, null, 15000);
      if (r.status === 200 || r.status === 404) out = r.body;
    }
    if (!out) {
      const state = await import("./v4/route-state.mjs");
      out = await state.loadRouteReplay({ dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT, routeId });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else if (!out.ok) {
      console.log(c("red", `Mission route replay unavailable: ${routeId}`));
      if (out.error) console.log(c("muted", `  ${out.error}`));
    } else {
      console.log(c("orange", `Mission route replay ${out.route_id}`));
      console.log(c("muted", `  events:     ${out.event_count}`));
      console.log(c("muted", `  duration:   ${out.duration_ms} ms`));
      console.log(c("muted", `  first:      ${out.first_ts || ""}`));
      console.log(c("muted", `  last:       ${out.last_ts || ""}`));
      for (const event of (out.events || []).slice(0, 12)) {
        const macro = event.macro_id ? `[${event.macro_id}] ` : "";
        console.log(c("muted", `  ${String(event.index).padStart(2, "0")} ${event.ts} ${macro}${event.title}`));
      }
      if ((out.events || []).length > 12) console.log(c("muted", `  ... ${out.events.length - 12} more events`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "artifact") {
    const routeId = sub[1] || "current";
    const artifact = sub[2] || args.flags.artifact || "package";
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("GET", `/api/v4/route/artifact?id=${encodeURIComponent(routeId)}&artifact=${encodeURIComponent(artifact)}`, null, 15000);
      if (r.status === 200 || r.status === 404) out = r.body;
    }
    if (!out) {
      const state = await import("./v4/route-state.mjs");
      out = await state.loadRouteArtifact({ dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT, routeId, artifact });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else if (!out.ok) {
      console.log(c("red", `Mission route artifact unavailable: ${artifact}`));
      if (out.error) console.log(c("muted", `  ${out.error}`));
      if (out.available?.length) console.log(c("muted", `  available: ${out.available.map((item) => item.key).join(", ")}`));
    } else {
      console.log(c("orange", `Mission route artifact ${out.route_id} / ${out.artifact}`));
      console.log(c("muted", `  path:  ${out.selected?.path || ""}`));
      console.log(c("muted", `  bytes: ${out.meta?.bytes || 0}`));
      console.log(String(out.content || "").slice(0, args.flags.full ? undefined : 4000));
      if (!args.flags.full && String(out.content || "").length > 4000) console.log(c("muted", "\n[truncated; rerun with --full]"));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "progress") {
    const macroId = sub[1] || "next";
    const status = args.flags.status || "done";
    const proofNote = args.flags.proof || args.flags["proof-note"] || "";
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", "/api/v4/route/progress", {
        macro_id: macroId,
        status,
        proof_note: proofNote,
        actor: args.flags.actor || "operator",
        receipt: !!args.flags.receipt,
      }, 30000);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const state = await import("./v4/route-state.mjs");
      out = await state.updateCurrentRouteProgress({
        macroId,
        status,
        proofNote,
        actor: args.flags.actor || "operator",
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeRepoReceipt: !!args.flags.receipt,
      });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("green", `Mission Spine ${out.route_id}: ${out.macro_id} ${out.previous_status} -> ${out.status}`));
      console.log(c("muted", `  current macro: ${out.projection?.current_macro?.id || "none"}`));
      console.log(c("muted", `  current file:  ${out.current_route_path || ""}`));
      if (out.receipt?.path || out.receipt?.id) console.log(c("muted", `  receipt:       ${out.receipt.path || out.receipt.id}`));
    }
    return;
  }
  if (verb === "verify-gates") {
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", "/api/v4/route/verify-gates", {
        receipt: !!args.flags.receipt,
        timeout_ms: parseInt(args.flags.timeout || "180000", 10),
      }, parseInt(args.flags.timeout || "180000", 10) + 30000);
      if (r.status === 200 || r.status === 409) out = r.body;
    }
    if (!out) {
      const gates = await import("./v4/proof-gates.mjs");
      out = await gates.runCurrentRouteProofGates({
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeReceipt: !!args.flags.receipt,
        timeoutMs: parseInt(args.flags.timeout || "180000", 10),
      });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} route proof gates ${out.summary.passed_required}/${out.summary.required}`));
      console.log(c("muted", `  route:         ${out.route_id}`));
      console.log(c("muted", `  verify macro:  ${out.progress?.previous_status || "?"} -> ${out.progress?.status || "?"}`));
      console.log(c("muted", `  current macro: ${out.progress?.current_macro?.id || "none"}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:       ${out.receipt_path}`));
      for (const failure of (out.failures || []).slice(0, 6)) console.log(c("red", `  failure: ${failure.id}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "package" || verb === "receipt" || verb === "promote") {
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", `/api/v4/route/${verb}`, {
        receipt: !!args.flags.receipt,
      }, 120000);
      if (r.status === 200 || r.status === 409) out = r.body;
    }
    if (!out) {
      const pack = await import("./v4/route-package.mjs");
      if (verb === "package") out = await pack.packageCurrentRoute({
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeReceipt: !!args.flags.receipt,
      });
      if (verb === "receipt") out = await pack.synthesizeRouteReceipt({
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
      });
      if (verb === "promote") out = await pack.promoteCurrentRoute({
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeReceipt: !!args.flags.receipt,
      });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} route ${verb} ${out.route_id || ""}`));
      if (out.manifest_path) console.log(c("muted", `  manifest: ${out.manifest_path}`));
      if (out.package_manifest) console.log(c("muted", `  package:  ${out.package_manifest}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      if (out.promotion_path) console.log(c("muted", `  promote:  ${out.promotion_path}`));
      if (out.progress?.current_macro?.id) console.log(c("muted", `  current:  ${out.progress.current_macro.id}`));
      for (const failure of (out.failures || []).slice(0, 8)) console.log(c("red", `  failure: ${failure}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  console.error(c("red", `unknown route verb: ${verb}`));
  process.exit(2);
}

async function cmdClaude(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    console.log(c("orange", "Claude / Opus handoff"));
    console.log();
    console.log(c("muted", "  obx claude export-route \"<objective>\" [--json] [--receipt] [--project=NAME]"));
    console.log(c("muted", "       export a Claude Code packet from the ORANGEBOX operating spine"));
    return;
  }
  if (verb === "export-route") {
    const objective = sub.slice(1).join(" ").trim();
    if (!objective) {
      console.error(c("red", "usage: obx claude export-route \"<objective>\" [--json] [--receipt]"));
      process.exit(2);
    }
    const sidecarUp = await ensureSidecarUp(1500);
    let out;
    if (sidecarUp) {
      const r = await reqJSON("POST", "/api/v4/claude/export-route", {
        objective,
        project: args.flags.project || "orangebox",
        receipt: !!args.flags.receipt,
      }, 30000);
      if (r.status === 200) out = r.body;
    }
    if (!out) {
      const spine = await import("./v4/operating-spine.mjs");
      out = await spine.exportClaudeRoute({
        objective,
        project: args.flags.project || "orangebox",
        dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
        writeFile: true,
        writeReceipt: !!args.flags.receipt,
      });
    }
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("orange", `Claude route export ${out.route_id}`));
      console.log(c("muted", `  objective: ${out.objective}`));
      console.log(c("muted", `  export:    ${out.export_path || "(not written)"}`));
      console.log(c("muted", `  proof:     ${out.proof_gates.map((gate) => gate.id).join(", ")}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:   ${out.receipt_path}`));
    }
    return;
  }
  console.error(c("red", `unknown claude verb: ${verb}`));
  process.exit(2);
}

async function cmdAds(args) {
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    console.log(c("orange", "▣ obx ads — native advertising architecture"));
    console.log();
    console.log(c("amber", "DATA & SIGNAL"));
    console.log(c("muted", "  obx ads capi <pixel_id> <event_name> --email E --value V --currency USD"));
    console.log(c("muted", "       send server-side Meta Conversions API event (hashed PII)"));
    console.log(c("muted", "  obx ads google-enhanced <customer_id> <conversion_action_resource> --gclid G --value V"));
    console.log(c("muted", "       upload Google Click Conversion with enhanced identifiers"));
    console.log(c("muted", "  obx ads utm --channel meta --campaign foo --content bar [--term baz]"));
    console.log(c("muted", "       generate canonical UTM query-string for the channel"));
    console.log();
    console.log(c("amber", "DCO ASSET POOLS"));
    console.log(c("muted", "  obx ads dco create --name NAME --kind video|image|headline|primary_text"));
    console.log(c("muted", "  obx ads dco list"));
    console.log(c("muted", "  obx ads dco get <pool_id>"));
    console.log(c("muted", "  obx ads dco add <pool_id> --path P --label L"));
    console.log();
    console.log(c("amber", "AUTOMATED RULES (Revealbot-equivalent, native)"));
    console.log(c("muted", "  obx ads guard"));
    console.log(c("muted", "       show global rules guard: pause + simulation mode"));
    console.log(c("muted", "  obx ads guard --pause | --resume | --simulation=on|off | --arm-live"));
    console.log(c("muted", "       control whether automated ad rules can fire live actions"));
    console.log(c("muted", "  obx ads rules list"));
    console.log(c("muted", "  obx ads rules create --name N --platform meta-ads --metric cpa --op '>' --value 25 --action pause --target adset"));
    console.log(c("muted", "  obx ads rules toggle <rule_id> [--off]"));
    console.log(c("muted", "  obx ads rules delete <rule_id>"));
    console.log(c("muted", "  obx ads rules eval <rule_id> --observed-value 31.5 [--dry-run]"));
    console.log(c("muted", "  obx ads rules engine start [--minutes 15]"));
    return;
  }
  if (verb === "guard") {
    const body = {};
    if (args.flags.pause) body.global_pause = true;
    if (args.flags.resume) body.global_pause = false;
    if (args.flags["arm-live"]) {
      body.global_pause = false;
      body.simulation_mode = false;
      body.reason = "operator armed live automated ad rule actions";
    }
    if (Object.prototype.hasOwnProperty.call(args.flags, "simulation")) {
      const v = String(args.flags.simulation).toLowerCase();
      if (["on", "true", "1", "yes"].includes(v)) body.simulation_mode = true;
      else if (["off", "false", "0", "no"].includes(v)) body.simulation_mode = false;
      else { console.error(c("red", "usage: obx ads guard --simulation=on|off")); process.exit(2); }
    }
    if (args.flags.reason) body.reason = args.flags.reason;

    const hasUpdate = Object.keys(body).length > 0;
    const r = hasUpdate
      ? await reqJSON("POST", "/api/v4/ads/guard", body)
      : await reqJSON("GET", "/api/v4/ads/guard");
    const guard = r.body.guard || {};
    const pause = guard.global_pause ? c("red", "PAUSED") : c("green", "not paused");
    const sim = guard.simulation_mode ? c("amber", "SIMULATION") : c("green", "LIVE-ARMED");
    console.log(c("orange", "[rules] ORANGEBOX ads rules guard"));
    console.log(`  pause:      ${pause}`);
    console.log(`  mode:       ${sim}`);
    console.log(c("muted", `  scope:      ${guard.action_scope || "automated-rules"}`));
    console.log(c("muted", `  updated:    ${guard.updated_at || "(unknown)"} by ${guard.updated_by || "(unknown)"}`));
    console.log(c("muted", `  reason:     ${guard.reason || ""}`));
    return;
  }
  if (verb === "capi") {
    const pixel_id = sub[1];
    const event_name = sub[2];
    if (!pixel_id || !event_name) { console.error(c("red", "usage: obx ads capi <pixel_id> <event_name> [--email E] [--phone P] [--value V] [--currency USD]")); process.exit(2); }
    const user_data = {};
    if (args.flags.email) user_data.em = args.flags.email;
    if (args.flags.phone) user_data.ph = args.flags.phone;
    if (args.flags.fn) user_data.fn = args.flags.fn;
    if (args.flags.ln) user_data.ln = args.flags.ln;
    const custom_data = {};
    if (args.flags.value)    custom_data.value = parseFloat(args.flags.value);
    if (args.flags.currency) custom_data.currency = args.flags.currency;
    const r = await reqJSON("POST", "/api/v4/ads/capi/dispatch", { pixel_id, event_name, user_data, custom_data, action_source: args.flags.source || "website" });
    if (r.body.ok) console.log(c("green", `✓ CAPI event received: events_received=${r.body.events_received} · fbtrace_id=${r.body.fbtrace_id || "(none)"}`));
    else { console.error(c("red", `error: ${r.body.error || JSON.stringify(r.body.raw || r.body).slice(0, 240)}`)); process.exit(4); }
    return;
  }
  if (verb === "google-enhanced") {
    const customer_id = sub[1];
    const conversion_action_resource = sub[2];
    if (!customer_id || !conversion_action_resource) { console.error(c("red", "usage: obx ads google-enhanced <customer_id> <conversion_action_resource> [--gclid G] [--value V] [--email E]")); process.exit(2); }
    const user_identifiers = [];
    if (args.flags.email) user_identifiers.push({ hashed_email: args.flags.email });
    if (args.flags.phone) user_identifiers.push({ hashed_phone_number: args.flags.phone });
    const body = { customer_id, conversion_action_resource, gclid: args.flags.gclid, conversion_value: args.flags.value ? parseFloat(args.flags.value) : undefined, currency_code: args.flags.currency || "USD", user_identifiers };
    const r = await reqJSON("POST", "/api/v4/ads/google-enhanced/dispatch", body);
    if (r.body.ok) console.log(c("green", "✓ Google Enhanced conversion uploaded"));
    else { console.error(c("red", `error: ${r.body.error || JSON.stringify(r.body.raw || r.body).slice(0, 240)}`)); process.exit(4); }
    return;
  }
  if (verb === "utm") {
    const body = { channel: args.flags.channel || "direct", campaign: args.flags.campaign, content: args.flags.content, term: args.flags.term };
    const r = await reqJSON("POST", "/api/v4/ads/utm/standardize", body);
    console.log(c("cream", r.body.qs));
    return;
  }
  if (verb === "dco") {
    const action = sub[1];
    if (action === "create") {
      const r = await reqJSON("POST", "/api/v4/ads/dco/pools", { name: args.flags.name, kind: args.flags.kind });
      if (r.body.id) console.log(c("green", `✓ pool created: ${r.body.id} · kind=${r.body.kind} · name=${r.body.name}`));
      else { console.error(c("red", `error: ${r.body.error || "create failed"}`)); process.exit(4); }
      return;
    }
    if (action === "list") {
      const r = await reqJSON("GET", "/api/v4/ads/dco/pools");
      const pools = r.body.pools || [];
      if (!pools.length) { console.log(c("muted", "(no pools yet — `obx ads dco create --name N --kind K`)")); return; }
      for (const p of pools) console.log(`  ${c("cream", p.id)}  ${c("amber", p.kind.padEnd(14))}  ${c("muted", `assets=${p.count}`)}  ${p.name}`);
      return;
    }
    if (action === "get") {
      const pool_id = sub[2];
      if (!pool_id) { console.error(c("red", "usage: obx ads dco get <pool_id>")); process.exit(2); }
      const r = await reqJSON("GET", `/api/v4/ads/dco/pools/${pool_id}`);
      console.log(JSON.stringify(r.body, null, 2));
      return;
    }
    if (action === "add") {
      const pool_id = sub[2];
      if (!pool_id) { console.error(c("red", "usage: obx ads dco add <pool_id> --path P --label L")); process.exit(2); }
      const asset = { path: args.flags.path, label: args.flags.label, dimensions: args.flags.dimensions };
      const r = await reqJSON("POST", `/api/v4/ads/dco/pools/${pool_id}/assets`, { asset });
      if (r.body.ok) console.log(c("green", `✓ asset added · pool now has ${r.body.count} assets`));
      else { console.error(c("red", `error: ${r.body.error || "add failed"}`)); process.exit(4); }
      return;
    }
    console.error(c("red", `usage: obx ads dco {create|list|get|add}`)); process.exit(2);
  }
  if (verb === "rules") {
    const action = sub[1];
    if (!action || action === "list") {
      const r = await reqJSON("GET", "/api/v4/ads/rules");
      const rules = r.body.rules || [];
      if (!rules.length) { console.log(c("muted", "(no rules yet — `obx ads rules create ...`)")); return; }
      for (const x of rules) {
        const cond = `${x.condition?.metric} ${x.condition?.op} ${x.condition?.value}`;
        const act  = `${x.action?.type}${x.action?.scale_pct ? ` ${x.action.scale_pct}%` : ""} ${x.action?.target}`;
        const en   = x.enabled ? c("green", "ON ") : c("muted", "OFF");
        console.log(`  ${en}  ${c("cream", x.id)}  ${c("amber", x.platform.padEnd(14))}  ${c("muted", cond.padEnd(20))} → ${act}   ${x.name}`);
      }
      return;
    }
    if (action === "create") {
      const condition = { metric: args.flags.metric, op: args.flags.op, value: parseFloat(args.flags.value), time_window_h: parseInt(args.flags["window-h"] || "24", 10) };
      const actionObj = { type: args.flags.action, scale_pct: args.flags["scale-pct"] ? parseInt(args.flags["scale-pct"], 10) : undefined, target: args.flags.target || "adset", entity_id: args.flags["entity-id"], notify_channel: args.flags["notify-channel"] };
      const r = await reqJSON("POST", "/api/v4/ads/rules", { name: args.flags.name, platform: args.flags.platform || "meta-ads", account_id: args.flags["account-id"], condition, action: actionObj });
      if (r.body.id) console.log(c("green", `✓ rule created: ${r.body.id} · ${args.flags.name}`));
      else { console.error(c("red", `error: ${r.body.error || JSON.stringify(r.body).slice(0, 240)}`)); process.exit(4); }
      return;
    }
    if (action === "toggle") {
      const rule_id = sub[2];
      if (!rule_id) { console.error(c("red", "usage: obx ads rules toggle <rule_id> [--off]")); process.exit(2); }
      const r = await reqJSON("POST", `/api/v4/ads/rules/${rule_id}/toggle`, { enabled: !args.flags.off });
      if (r.body.ok) console.log(c("green", `✓ rule ${rule_id} enabled=${r.body.enabled}`));
      else { console.error(c("red", `error: ${r.body.error || "toggle failed"}`)); process.exit(4); }
      return;
    }
    if (action === "delete") {
      const rule_id = sub[2];
      if (!rule_id) { console.error(c("red", "usage: obx ads rules delete <rule_id>")); process.exit(2); }
      const r = await reqJSON("DELETE", `/api/v4/ads/rules/${rule_id}`);
      if (r.body.ok) console.log(c("green", `✓ rule ${rule_id} deleted`));
      else { console.error(c("red", `error: ${r.body.error || "delete failed"}`)); process.exit(4); }
      return;
    }
    if (action === "eval") {
      const rule_id = sub[2];
      if (!rule_id) { console.error(c("red", "usage: obx ads rules eval <rule_id> --observed-value V [--dry-run]")); process.exit(2); }
      const r = await reqJSON("POST", `/api/v4/ads/rules/${rule_id}/eval`, { observed_value: parseFloat(args.flags["observed-value"]), dry_run: !!args.flags["dry-run"] });
      console.log(JSON.stringify(r.body, null, 2));
      return;
    }
    if (action === "engine" && sub[2] === "start") {
      const r = await reqJSON("POST", "/api/v4/ads/rules/engine/start", { interval_minutes: parseInt(args.flags.minutes || "15", 10) });
      if (r.body.ok) console.log(c("green", `✓ rules engine running · sweep every ${r.body.interval_minutes}min`));
      else { console.error(c("red", `error: ${r.body.error || "start failed"}`)); process.exit(4); }
      return;
    }
    console.error(c("red", "usage: obx ads rules {list|create|toggle|delete|eval|engine start}")); process.exit(2);
  }
  console.error(c("red", `unknown ads verb: ${verb}`)); process.exit(2);
}

async function cmdSilentCanvas(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    console.log(c("orange", "[silent-canvas] obx silent-canvas"));
    console.log();
    console.log(c("muted", "  obx silent-canvas solidify [workspace]"));
    console.log(c("muted", "       compile the current project graph to disk and write a proof manifest"));
    console.log(c("muted", "  obx silent-canvas desync-recover [workspace] [--file=C:\\snapshot.json]"));
    console.log(c("muted", "       restore the project graph from a known-good snapshot and emit a receipt"));
    console.log(c("muted", "  obx silent-canvas workspace-state [workspace]"));
    console.log(c("muted", "       inspect workspace_version, view descriptors, and conflict markers"));
    console.log(c("muted", "  obx silent-canvas prompt-eval [--json] [--receipt]"));
    console.log(c("muted", "       validate prompt versions and few-shot HSMP examples without model calls"));
    console.log(c("muted", "  obx silent-canvas benefits-gate [--json] [--receipt] [--min-runs=N]"));
    console.log(c("muted", "       compare Silent Canvas receipts against doctrine benefit targets"));
    console.log(c("muted", "  obx silent-canvas wire-gate [workspace] [--json] [--receipt] [--tolerance-px=N] [--samples=N]"));
    console.log(c("muted", "       verify graph wires match the native visual telemetry render contract"));
    console.log(c("muted", "  obx silent-canvas active-bbox [workspace] [--json] [--selected-node=ID] [--max-nodes=N]"));
    console.log(c("muted", "       inspect the active canvas bounding box used for scoped Brain context"));
    console.log(c("muted", "  obx silent-canvas relevance-doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove scoped Relevance Controller context and bounded needs_more_context expansion"));
    console.log(c("muted", "  obx silent-canvas visual-engine-doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove AIGUI/Lumina living primitives, event protocol, and calm motion guardrails"));
    console.log(c("muted", "  obx silent-canvas alpha7-doctor [--json] [--receipt] [--full]"));
    console.log(c("muted", "       run the sidecar-free alpha.7 readiness proof bundle"));
    return;
  }
  if (verb === "prompt-eval") {
    const pe = await import("./v4/prompt-eval.mjs");
    const out = await pe.runPromptEval({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "✓" : "✗"} Silent Canvas prompt eval`));
      console.log(c("muted", `  creative:    ${out.prompts.creative.version} ${out.prompts.creative.sha256.slice(0, 12)}`));
      console.log(c("muted", `  interpreter: ${out.prompts.interpreter.version} ${out.prompts.interpreter.sha256.slice(0, 12)}`));
      console.log(c("muted", `  success:     ${out.fewshots.valid_success_cases}/${out.fewshots.success_cases}`));
      console.log(c("muted", `  repairs:     ${out.fewshots.valid_failure_repairs}/${out.fewshots.failure_cases}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:     ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) {
        console.log(c("red", `  failure: ${failure.case_id || failure.line} ${failure.reason}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "benefits-gate") {
    const benefits = await import("./v4/benefits.mjs");
    const out = await benefits.runBenefitsGate({
      writeReceipt: !!args.flags.receipt,
      limit: parseInt(args.flags.limit || "100", 10),
      dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
      minRuns: parseInt(args.flags["min-runs"] || "1", 10),
      formatTargetPct: args.flags["format-target-pct"] ? parseFloat(args.flags["format-target-pct"]) : null,
      requireLatency: !args.flags["no-latency"],
      requireFormatting: !args.flags["no-formatting"],
      requireCost: !!args.flags["require-cost"],
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      const gate = out.gate;
      const color = gate.ok ? (gate.status === "warning" ? "amber" : "green") : "red";
      console.log(c(color, `${gate.ok ? "✓" : "✗"} Silent Canvas benefits gate · ${gate.status}`));
      console.log(c("muted", `  data_root: ${out.data_root}`));
      console.log(c("muted", `  runs:      ${gate.run_count}/${gate.min_runs}`));
      console.log(c("muted", `  aliveness: ${gate.organism_health?.aliveness_score ?? "n/a"}`));
      for (const check of gate.checks.slice(0, 8)) {
        const checkColor = check.status === "pass" ? "green" : check.status === "warning" ? "amber" : "red";
        console.log(c(checkColor, `  ${check.status.padEnd(8)} ${check.metric}`) + c("muted", ` actual=${check.actual ?? "n/a"} target=${check.target ?? "n/a"}`));
      }
      for (const failure of gate.failures.slice(0, 5)) {
        console.log(c("red", `  failure: ${failure.metric} ${failure.reason || ""}`));
      }
      if (out.receipt_path) console.log(c("muted", `  receipt:   ${out.receipt_path}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "wire-gate") {
    const wg = await import("./v4/wire-path-gate.mjs");
    const out = await wg.runWirePathGate({
      workspace: sub[1] || args.flags.workspace || process.cwd(),
      tolerancePx: args.flags["tolerance-px"] ? parseFloat(args.flags["tolerance-px"]) : 1,
      samples: args.flags.samples ? parseInt(args.flags.samples, 10) : 9,
      writeReceipt: !!args.flags.receipt,
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} Silent Canvas wire path gate`));
      console.log(c("muted", `  workspace: ${out.workspace}`));
      console.log(c("muted", `  graph:     schema=${out.graph_schema_version} version=${out.workspace_version}`));
      console.log(c("muted", `  wires:     ${out.counts.checked_wires}/${out.counts.wires} checked - failures=${out.counts.failures}`));
      console.log(c("muted", `  tolerance: ${out.tolerance_px}px - samples=${out.samples}`));
      for (const failure of out.failures.slice(0, 6)) {
        console.log(c("red", `  failure: ${failure.wire_id || "(wire)"} ${failure.reason} max=${failure.max_error_px}px start=${failure.start_error_px}px end=${failure.end_error_px}px`));
      }
      if (out.receipt_path) console.log(c("muted", `  receipt:   ${out.receipt_path}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "active-bbox") {
    const pg = await import("./v4/project-graph.mjs");
    const out = await pg.getActiveBoundingBox(sub[1] || args.flags.workspace || process.cwd(), {
      selected_node: args.flags["selected-node"] || null,
      maxNodes: args.flags["max-nodes"] ? parseInt(args.flags["max-nodes"], 10) : 24,
      padding: args.flags.padding ? parseFloat(args.flags.padding) : 80,
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c("orange", "Silent Canvas active bounding box"));
      console.log(c("muted", `  workspace: ${out.workspace}`));
      console.log(c("muted", `  strategy:  ${out.strategy}`));
      console.log(c("muted", `  bbox:      x=${Math.round(out.bbox.x)} y=${Math.round(out.bbox.y)} w=${Math.round(out.bbox.w)} h=${Math.round(out.bbox.h)}`));
      console.log(c("muted", `  nodes:     ${out.totals.nodes_included}/${out.totals.nodes_total}`));
      console.log(c("muted", `  wires:     ${out.totals.wires_included}/${out.totals.wires_total}`));
    }
    return;
  }
  if (verb === "relevance-doctor") {
    const doctor = await import("./v4/relevance-doctor.mjs");
    const out = await doctor.runRelevanceDoctor({
      writeReceipt: !!args.flags.receipt,
      keepTemp: !!args.flags["keep-temp"],
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX Relevance Controller`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      if (out.workspace) console.log(c("muted", `  fixture:  ${out.workspace}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) {
        console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "visual-engine-doctor") {
    const doctor = await import("./v4/visual-engine-doctor.mjs");
    const out = await doctor.runVisualEngineDoctor({
      writeReceipt: !!args.flags.receipt,
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX AIGUI visual engine`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) {
        console.log(c("red", `  failure: ${failure.name} ${failure.recovery || ""}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "alpha7-doctor") {
    const doctor = await import("./v4/alpha7-doctor.mjs");
    const out = await doctor.runAlpha7Doctor({
      writeReceipt: !!args.flags.receipt,
      full: !!args.flags.full,
      keepTemp: !!args.flags["keep-temp"],
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX alpha.7 readiness`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  full:     ${out.full ? "yes" : "no"}`));
      if (out.workspace) console.log(c("muted", `  fixture:  ${out.workspace}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) {
        console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  if (verb === "solidify") {
    const workspace = sub[1] || args.flags.workspace || process.cwd();
    const r = await reqJSON("POST", "/api/v4/silent-canvas/solidify", { workspace }, 120000);
    const out = r.body || {};
    if (r.status === 200 && out.ok) {
      console.log(c("green", `[ok] solidified ${out.files_written} file(s)`));
    } else {
      console.log(c("amber", `! solidify completed with issues: ${out.files_failed || 0} failed`));
    }
    console.log(c("muted", `  workspace: ${out.workspace || workspace}`));
    console.log(c("muted", `  manifest:  ${out.manifest_path || "(none)"}`));
    console.log(c("muted", `  sha256:    ${out.manifest_sha256 || "(none)"}`));
    if (out.errors?.length) {
      for (const e of out.errors.slice(0, 5)) console.log(c("red", `  error: ${e.target || ""} ${e.error || ""}`));
    }
    return;
  }
  if (verb === "desync-recover") {
    const workspace = sub[1] || args.flags.workspace || process.cwd();
    const body = { workspace, file: args.flags.file || null, reason: args.flags.reason || "operator desync recovery" };
    const r = await reqJSON("POST", "/api/v4/silent-canvas/desync-recover", body, 30000);
    const out = r.body || {};
    if (r.status === 200 && out.ok) {
      console.log(c("green", `[ok] recovered graph: ${out.nodes} node(s), ${out.wires} wire(s)`));
      console.log(c("muted", `  restored from: ${out.restored_from}`));
      console.log(c("muted", `  backup:        ${out.backup_snapshot}`));
    } else {
      console.error(c("red", `desync recovery failed: ${out.error || JSON.stringify(out).slice(0, 240)}`));
      process.exit(4);
    }
    return;
  }
  if (verb === "workspace-state") {
    const workspace = sub[1] || args.flags.workspace || process.cwd();
    const r = await reqJSON("GET", `/api/v4/silent-canvas/workspace-state?workspace=${encodeURIComponent(workspace)}`, null, 30000);
    const out = r.body || {};
    if (r.status !== 200 || out.ok === false) {
      console.error(c("red", `workspace-state failed: ${out.error || JSON.stringify(out).slice(0, 240)}`));
      process.exit(4);
    }
    console.log(c("orange", "■ Silent Canvas workspace state"));
    console.log(c("muted", `  workspace: ${out.workspace}`));
    console.log(c("muted", `  version:   ${out.workspace_version}`));
    console.log(c("muted", `  hash:      ${out.state_fingerprint}`));
    console.log(c("muted", `  counts:    ${out.counts?.nodes || 0} nodes / ${out.counts?.wires || 0} wires / ${out.counts?.conflict_markers || 0} conflicts / ${out.counts?.views || 0} views`));
    if (out.conflict_markers?.length) {
      console.log();
      console.log(c("amber", "Recent conflict markers:"));
      for (const marker of out.conflict_markers.slice(-5)) {
        console.log(c("muted", `  ${marker.id} ${marker.kind} expected=${marker.expected_workspace_version} actual=${marker.actual_workspace_version} target=${marker.target}`));
      }
    }
    return;
  }
  console.error(c("red", `unknown silent-canvas verb: ${verb}`));
  process.exit(2);
}

async function cmdDept(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    console.log(c("orange", "Department OS"));
    console.log();
    console.log(c("muted", "  obx dept registry [--json]"));
    console.log(c("muted", "       list AE0-AE14, review identities, trust tiers, and routing law"));
    console.log(c("muted", "  obx dept trust [--json]"));
    console.log(c("muted", "       inspect local trust ledger; defaults to advisor-only"));
    console.log(c("muted", "  obx dept route \"<goal>\" [--json] [--receipt] [--project=NAME]"));
    console.log(c("muted", "       create a bounded department route packet and route file"));
    console.log(c("muted", "  obx dept doctor [--json] [--receipt]"));
    console.log(c("muted", "       run the model-free Department OS proof gate"));
    return;
  }

  if (verb === "registry") {
    const reg = await import("./v4/dept-registry.mjs");
    const out = reg.registrySummary();
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("orange", `Department OS registry ${out.version}`));
      console.log(c("muted", `  departments:       ${out.department_count}`));
      console.log(c("muted", `  review identities: ${out.review_identity_count}`));
      for (const dept of out.departments) console.log(c("cream", `  ${dept.id.padEnd(4)} ${dept.name.padEnd(20)} ${dept.lane}`) + c("muted", ` - ${dept.owns}`));
    }
    return;
  }

  if (verb === "trust") {
    const trust = await import("./v4/trust-ledger.mjs");
    const out = await trust.trustSummary({ dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("orange", `Department OS trust ${out.version}`));
      console.log(c("muted", `  path: ${out.path}`));
      console.log(c("muted", `  departments: ${out.department_count}`));
      for (const [tier, count] of Object.entries(out.by_tier)) console.log(c("cream", `  ${tier}: ${count}`));
    }
    return;
  }

  if (verb === "doctor") {
    const doctor = await import("./v4/dept-doctor.mjs");
    const out = await doctor.runDeptDoctor({
      writeReceipt: !!args.flags.receipt,
      keepTemp: !!args.flags["keep-temp"],
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} Department OS doctor`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }

  if (verb === "route") {
    const goal = sub.slice(1).join(" ").trim();
    if (!goal) { console.error(c("red", "usage: obx dept route \"<goal>\" [--json] [--receipt]")); process.exit(2); }
    const router = await import("./v4/dept-router.mjs");
    const out = await router.routeGoal({
      goal,
      project: args.flags.project || "orangebox",
      dataRoot: args.flags["data-root"] || process.env.ORANGEBOX_DATA_ROOT,
      maxDepartments: args.flags["max-departments"] ? parseInt(args.flags["max-departments"], 10) : 5,
      writeRoute: true,
      writeReceipt: !!args.flags.receipt,
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(c("orange", `Department route ${out.route_id}`));
      console.log(c("muted", `  project:   ${out.project}`));
      console.log(c("muted", `  primary:   ${out.primary_dept}`));
      console.log(c("muted", `  active:    ${out.departments.map((dept) => dept.id).join(", ")}`));
      console.log(c("muted", `  gates:     ${out.review_gates.map((gate) => gate.id).join(", ")}`));
      console.log(c("muted", `  risk:      ${out.risk.level}`));
      console.log(c("muted", `  approval:  ${out.approval_required ? "required" : "not required"}`));
      console.log(c("muted", `  route:     ${out.route_file}`));
      if (out.receipt?.path) console.log(c("muted", `  receipt:   ${out.receipt.path}`));
    }
    return;
  }

  console.error(c("red", `unknown dept verb: ${verb}`));
  process.exit(2);
}

function runLocalNodeScript(scriptPath, scriptArgs = [], { env = {}, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: ROOT,
      env: { ...process.env, ORANGEBOX_ROOT: ROOT, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: 1, ok: false, stdout, stderr, timedOut, error: err.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, ok: code === 0, stdout, stderr, timedOut });
    });
  });
}

function parseLastJsonObject(text) {
  const raw = String(text || "");
  const objects = [];
  let start = -1;
  let depth = 0;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (ch === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = raw.slice(start, i + 1);
        try { objects.push(JSON.parse(candidate)); } catch {}
        start = -1;
      }
    }
  }
  return objects.length ? objects[objects.length - 1] : null;
}

async function cmdHermes(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0];
  if (!verb || verb === "help" || verb === "--help") {
    console.log(c("orange", "Hermes readiness"));
    console.log();
    console.log(c("muted", "  obx hermes status [--json]"));
    console.log(c("muted", "       probe local AI Box Hermes health; no install side effects"));
    console.log(c("muted", "  obx hermes pack [--json] [--output=PATH]"));
    console.log(c("muted", "       build the AI Box Hermes install pack and receipt"));
    console.log(c("muted", "  obx hermes doctor [--json] [--receipt]"));
    console.log(c("muted", "       prove status, pack, CLI, and API readiness without installing Hermes"));
    return;
  }

  if (verb === "status") {
    const scriptPath = path.join(ROOT, "scripts", "v4", "hermes", "hermes-status.mjs");
    const run = await runLocalNodeScript(scriptPath, [args.flags.json ? "--json" : "--text"], {
      env: args.flags["data-root"] ? { ORANGEBOX_DATA_ROOT: args.flags["data-root"] } : {},
      timeoutMs: 30000,
    });
    if (args.flags.json) {
      const parsed = parseLastJsonObject(run.stdout);
      console.log(JSON.stringify(parsed || { ok: run.ok, code: run.code, stdout: run.stdout, stderr: run.stderr }, null, 2));
    } else {
      if (run.stdout.trim()) console.log(run.stdout.trim());
      if (run.stderr.trim()) console.error(run.stderr.trim());
    }
    if (!run.ok) process.exit(run.code || 1);
    return;
  }

  if (verb === "pack") {
    const scriptPath = path.join(ROOT, "scripts", "v4", "hermes", "hermes-pack.mjs");
    const packArgs = ["--build"];
    if (args.flags.output) packArgs.push("--output", args.flags.output);
    const run = await runLocalNodeScript(scriptPath, packArgs, { timeoutMs: 120000 });
    if (args.flags.json) {
      const parsed = parseLastJsonObject(run.stdout);
      console.log(JSON.stringify(parsed || { ok: run.ok, code: run.code, stdout: run.stdout, stderr: run.stderr }, null, 2));
    } else {
      if (run.stdout.trim()) console.log(run.stdout.trim());
      if (run.stderr.trim()) console.error(run.stderr.trim());
    }
    if (!run.ok) process.exit(4);
    return;
  }

  if (verb === "doctor") {
    const doctor = await import("./v4/hermes/hermes-doctor.mjs");
    const out = await doctor.runHermesDoctor({
      writeReceipt: !!args.flags.receipt,
      keepTemp: !!args.flags["keep-temp"],
    });
    if (args.flags.json) console.log(JSON.stringify(out, null, 2));
    else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} Hermes readiness doctor`));
      console.log(c("muted", `  checks:           ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  installed:        ${out.hermes_installed ? "yes" : "no"}`));
      console.log(c("muted", `  install_attempted: ${out.install_attempted ? "yes" : "no"}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:          ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }

  console.error(c("red", `unknown hermes verb: ${verb}`));
  process.exit(2);
}

async function cmdSetup() {
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  const r = await reqJSON("GET", "/api/v4/setup/wizard");
  const s = r.body;
  console.log(c("orange", "▣ ORANGEBOX setup wizard"));
  console.log();
  console.log(c(s.ready ? "green" : "amber", `Status: ${s.ready ? "READY ✓" : "NEEDS SETUP"}  ·  Primary path: ${c("cream", s.primary_path)}`));
  console.log();
  // Subscription CLIs
  console.log(c("cream", "Subscription CLIs (preferred — $0 ongoing once logged in):"));
  for (const c2 of (s.subscription_clis || [])) {
    let glyph, line;
    if (c2.status === "detected" && c2.oauth_ok === true)  { glyph = c("green", "✓"); line = `${c2.binary} v${c2.version || "?"} · ${c2.subscription_label} · ${c("green", "logged in")}`; }
    else if (c2.status === "detected" && c2.oauth_ok === false) { glyph = c("amber", "!"); line = `${c2.binary} v${c2.version || "?"} · ${c2.subscription_label} · ${c("amber", "needs login")}: ${c("cream", c2.login_cmd || "")}`; }
    else if (c2.status === "detected") { glyph = c("amber", "?"); line = `${c2.binary} v${c2.version || "?"} · ${c2.subscription_label} · ${c("muted", "auth-state unknown")}`; }
    else { glyph = c("muted", "·"); line = `${c("muted", c2.subscription_label.padEnd(28))} not installed · ${c("muted", c2.install_hint || "")}`; }
    console.log(`  ${glyph}  ${line}`);
  }
  console.log();
  // OpenRouter
  console.log(c("cream", "OpenRouter universal fallback (one key, 200+ models):"));
  const o = s.openrouter || {};
  if (o.probe_ok) console.log(`  ${c("green", "✓")}  key set · ${o.models_available || "?"} models available`);
  else if (o.key_set) console.log(`  ${c("amber", "!")}  key set but probe failed: ${o.reason}`);
  else console.log(`  ${c("muted", "·")}  ${c("muted", "not set")} · ${c("cream", "Get free key at https://openrouter.ai, then: obx setup openrouter <key>")}`);
  console.log();
  // Deprecated env vars
  if ((s.deprecated_env_vars_set || []).length) {
    console.log(c("amber", "Deprecated env vars detected (migrate to OpenRouter at v6.3.0 GA):"));
    for (const d of s.deprecated_env_vars_set) {
      console.log(`  ${c("amber", "⚠")}  ${c("muted", d.name)} → ${c("cream", d.replacement)}`);
    }
    console.log();
  }
  // Recommended next
  console.log(c("orange", "Recommended next:"));
  console.log("  " + c("cream", s.recommended_next));
  console.log();
  if (s.actions && s.actions.length) {
    console.log(c("cream", "Action checklist:"));
    for (const a of s.actions) {
      console.log(`  ${c("amber", `[${a.step}]`)} ${c("cream", a.label)}`);
      for (const opt of (a.options || [])) console.log(`        ${c("muted", "·")} ${opt.text}`);
      if (a.fallback) console.log(`        ${c("muted", "·")} ${a.fallback.text}`);
    }
  }
}

async function cmdSetupOpenRouter(key) {
  if (!key || !key.startsWith("sk-or-")) {
    console.error(c("red", "usage: obx setup openrouter <sk-or-...key>"));
    process.exit(2);
  }
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  const r = await reqJSON("POST", "/api/v4/setup/openrouter", { key });
  if (r.body.ok) {
    console.log(c("green", "✓ OpenRouter key saved (set-and-forget).") + c("muted", " " + r.body.saved_to));
  } else {
    console.error(c("red", "error: " + r.body.error));
    process.exit(4);
  }
}

async function cmdPipes(sub) {
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  if (sub === "redetect") {
    console.log(c("orange", "▸ redetecting subscription pipes…"));
    const r = await reqJSON("POST", "/api/v4/pipes/redetect", {}, 15000);
    return printPipes(r.body);
  }
  const r = await reqJSON("GET", "/api/v4/pipes/list");
  return printPipes(r.body);
}

function printPipes(reg) {
  console.log(c("orange", "▣ ORANGEBOX subscription pipes"));
  console.log(c("muted", `  detected at: ${reg.detected_at || "(unknown)"}`));
  console.log(c("muted", `  ${reg.summary?.detected_count || 0}/${Object.keys(reg.providers || {}).length} providers have a subscription CLI`));
  console.log();
  for (const [provider, info] of Object.entries(reg.providers || {})) {
    const ok = info.status === "detected";
    const glyph = ok ? c("green", "✓") : c("muted", "○");
    const label = info.subscription_label || provider;
    console.log(`  ${glyph} ${c("amber", provider.padEnd(10))}${c("cream", label)}`);
    if (ok) {
      console.log(c("muted", `       binary: ${info.binary}  path: ${info.path}`));
      if (info.version) console.log(c("muted", `       version: ${info.version}`));
    } else {
      console.log(c("muted", `       install: ${info.install_hint || "(no hint)"}`));
    }
    console.log();
  }
  console.log(c("muted", "  routing law: subscription CLI > subscription MCP > API > local"));
  console.log(c("muted", "  overrides:   ORANGEBOX_FORCE_API=1, ORANGEBOX_FORCE_PIPE=<provider>"));
}

async function cmdVault(query) {
  if (!query) { console.error(c("red", "usage: obx vault <query>")); process.exit(2); }
  if (!(await ensureSidecarUp(3000))) { console.error(c("red", "sidecar not running")); process.exit(3); }
  const r = await reqJSON("POST", "/api/v4/vault/search", { query, limit: 10 });
  const hits = r.body.hits || [];
  if (hits.length === 0) { console.log(c("muted", "(no hits)")); return; }
  for (const h of hits) {
    console.log(c("amber", `  score=${h.score}`) + c("muted", "  ") + c("cream", h.file || "?"));
    if (h.excerpt) console.log(c("muted", "    " + h.excerpt.slice(0, 200)));
    console.log();
  }
}

function printVaultRecovery(diag) {
  console.log(c("orange", "■ ORANGEBOX vault recovery"));
  console.log();
  console.log(c("muted", "  status:     ") + c(diag.ok ? "green" : "amber", diag.status || "unknown"));
  console.log(c("muted", "  key source: ") + c("cream", diag.key_source || "none"));
  console.log(c("muted", "  vault:      ") + c(diag.files?.vault?.exists ? "green" : "muted", diag.files?.vault?.path || "(unknown)"));
  console.log(c("muted", "  local key:  ") + c(diag.files?.local_key?.exists ? "green" : "muted", diag.files?.local_key?.path || "(unknown)"));
  console.log(c("muted", "  services:   ") + c("cream", String(diag.service_count || 0)));
  console.log(c("muted", "  no secrets: ") + c(diag.returns_secret_material ? "red" : "green", diag.returns_secret_material ? "false" : "true"));
  console.log(c("muted", "  mutates:    ") + c(diag.mutates_vault ? "red" : "green", diag.mutates_vault ? "yes" : "no"));
  const backups = diag.files?.corrupt_backups || [];
  if (backups.length) {
    console.log();
    console.log(c("amber", `  corrupt backups observed: ${backups.length}`));
    for (const b of backups.slice(0, 5)) console.log(c("muted", `    ${b.path} (${b.bytes} bytes)`));
  }
  if (diag.services?.length) {
    console.log();
    console.log(c("cream", "Connected services:"));
    for (const s of diag.services) {
      const exp = s.expired ? c("red", "expired") : c("green", "ok");
      console.log(`  ${c("amber", s.service.padEnd(18))}${c("muted", s.auth_type || "?")}  ${exp}`);
    }
  }
  if (diag.recommended_actions?.length) {
    console.log();
    console.log(c("cream", "Recommended actions:"));
    for (const action of diag.recommended_actions) console.log("  " + c("muted", "- ") + c("cream", action));
  }
}

async function cmdVaultRecovery(args) {
  const sidecarUp = await ensureSidecarUp(1500);
  let out;
  if (sidecarUp) {
    const r = await reqJSON("GET", "/api/v4/vault/recovery");
    if (r.status === 200) out = r.body;
  }
  if (!out) {
    const vault = await import("./v4/credentials-vault.mjs");
    out = await vault.recoveryDiagnostics();
  }
  if (args.flags.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }
  printVaultRecovery(out);
}

async function cmdFinish(args) {
  const sub = args.positional.slice(1);
  const verb = sub[0] || "green-board";
  if (verb === "help" || verb === "--help") {
    console.log(c("orange", "ORANGEBOX finish-line"));
    console.log();
    console.log(c("muted", "  obx finish green-board [--json] [--receipt] [--full] [--require-clean]"));
    console.log(c("cream", "       one board for automations, receipts, product language, doctors, package, and git state"));
    console.log(c("muted", "  obx finish process-doctor [--json] [--receipt]"));
    console.log(c("cream", "       read-only stale proof/build process hygiene check"));
    console.log(c("muted", "  obx finish feature-reality [--json] [--receipt]"));
    console.log(c("cream", "       anti-theater feature matrix: source, command, route, receipt, screenshot, package evidence"));
    console.log(c("muted", "  obx finish user-journey [--json] [--receipt] [--full]"));
    console.log(c("cream", "       simulate the box-map user journeys and report exactly where a user gets blocked"));
    console.log(c("muted", "  obx finish closeout-plan [--json] [--receipt]"));
    console.log(c("cream", "       read-only release-candidate staging, package, board, and rollback decision plan"));
    console.log(c("muted", "  obx finish decision-card [--json] [--receipt]"));
    console.log(c("cream", "       write a non-coder release decision card from the latest package, board, and closeout data"));
    console.log(c("muted", "  obx finish path-lists [--json] [--receipt]"));
    console.log(c("cream", "       write exact stage and hold/archive path lists for operator review"));
    console.log(c("muted", "  obx finish release-packet [--json] [--receipt]"));
    console.log(c("cream", "       write one synchronized decision card, closeout receipt, and exact stage/hold packet"));
    return;
  }
  if (verb === "release-packet" || verb === "packet" || verb === "stage-packet") {
    const closeout = await import("./v4/release-closeout.mjs");
    const packet = await closeout.writeReleasePacket();
    if (args.flags.json) {
      console.log(JSON.stringify(packet, null, 2));
    } else {
      console.log(c(packet.ok ? "green" : "amber", `${packet.ok ? "[ok]" : "[review]"} ORANGEBOX release packet`));
      console.log(c("muted", `  card:  ${packet.files.decision_card}`));
      console.log(c("muted", `  stage: ${packet.files.stage_paths}`));
      console.log(c("muted", `  hold:  ${packet.files.hold_paths}`));
      console.log(c("muted", `  guide: ${packet.files.guide}`));
      console.log(c("muted", `  count: ${packet.counts.stage_paths} stage-candidate / ${packet.counts.hold_paths} hold-or-archive`));
      for (const blocker of (packet.blockers || []).slice(0, 4)) console.log(c("amber", `  blocker: ${blocker.id} - ${blocker.detail || ""}`));
      console.log(c("muted", `  next:  ${packet.next_action}`));
    }
    return;
  }
  if (verb === "path-lists" || verb === "paths" || verb === "stage-lists") {
    const closeout = await import("./v4/release-closeout.mjs");
    const out = await closeout.runReleaseCloseoutPlan({ writeReceipt: !!args.flags.receipt });
    const lists = await closeout.writeReleasePathLists(out);
    if (args.flags.json) {
      console.log(JSON.stringify(lists, null, 2));
    } else {
      console.log(c(lists.ok ? "green" : "amber", `${lists.ok ? "[ok]" : "[review]"} ORANGEBOX release path lists`));
      console.log(c("muted", `  stage: ${lists.files.stage_paths}`));
      console.log(c("muted", `  hold:  ${lists.files.hold_paths}`));
      console.log(c("muted", `  guide: ${lists.files.guide}`));
      console.log(c("muted", `  count: ${lists.counts.stage_paths} stage-candidate / ${lists.counts.hold_paths} hold-or-archive`));
      for (const blocker of (lists.blockers || []).slice(0, 4)) console.log(c("amber", `  blocker: ${blocker.id} - ${blocker.detail || ""}`));
      console.log(c("muted", `  next:  ${lists.next_action}`));
    }
    return;
  }
  if (verb === "decision-card" || verb === "decision" || verb === "release-card") {
    const closeout = await import("./v4/release-closeout.mjs");
    const cardPath = closeout.plannedReleaseDecisionCardPath();
    const out = await closeout.runReleaseCloseoutPlan({ writeReceipt: !!args.flags.receipt, plannedDecisionCardPath: cardPath });
    await closeout.writeReleaseDecisionCard(out, cardPath);
    if (args.flags.json) {
      console.log(JSON.stringify({
        ok: out.ok,
        version: "orangebox-release-decision-card/v1",
        card_path: cardPath,
        closeout_receipt_path: out.receipt_path,
        summary: out.summary,
        package: {
          zip_path: out.package?.zip_path || null,
          zip_sha256: out.package?.zip_sha256 || null,
          hash_ok: out.package?.hash_ok ?? null,
        },
        blockers: out.blockers || [],
        warnings: out.warnings || [],
      }, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "amber", `${out.ok ? "[ok]" : "[review]"} ORANGEBOX release decision card`));
      console.log(c("muted", `  card:     ${cardPath}`));
      if (out.receipt_path) console.log(c("muted", `  closeout: ${out.receipt_path}`));
      console.log(c("muted", `  package:  ${out.package?.zip_sha256 || "unknown"}`));
      console.log(c("muted", `  board:    standard ${out.summary.standard_board_ok ? "green" : "not green"} / clean ${out.summary.clean_board_ok ? "green" : out.summary.clean_board_git_only ? "git-only blocker" : "needs review"}`));
      console.log(c("muted", `  curate:   ${out.summary.curation_stage_path_count} stage-candidate paths / ${out.summary.curation_hold_path_count} hold-or-archive paths`));
      for (const blocker of (out.blockers || []).slice(0, 4)) console.log(c("amber", `  blocker: ${blocker.id} - ${blocker.detail || ""}`));
      console.log(c("muted", `  next:     ${out.next_action}`));
    }
    return;
  }
  if (verb === "closeout-plan" || verb === "closeout" || verb === "promotion-plan") {
    const closeout = await import("./v4/release-closeout.mjs");
    const out = await closeout.runReleaseCloseoutPlan({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "amber", `${out.ok ? "[ok]" : "[review]"} ORANGEBOX release closeout plan`));
        console.log(c("muted", `  dirty:    ${out.summary.dirty_count} (${out.summary.modified_count} modified, ${out.summary.untracked_count} untracked)`));
        console.log(c("muted", `  package:  ${out.summary.package_ready ? "verified" : "needs review"} ${out.package?.zip_sha256 || ""}`));
        console.log(c("muted", `  board:    standard ${out.summary.standard_board_ok ? "green" : "not green"} / clean ${out.summary.clean_board_ok ? "green" : out.summary.clean_board_git_only ? "git-only blocker" : "needs review"}`));
        if (out.curation_plan) {
          console.log(c("muted", `  curate:   ${out.curation_plan.exact_stage_path_count} stage-candidate paths / ${out.curation_plan.exact_hold_or_archive_path_count} hold-or-archive paths`));
          const stageSample = (out.curation_plan.exact_stage_paths || []).slice(0, 6);
          const holdSample = (out.curation_plan.exact_hold_or_archive_paths || []).slice(0, 6);
          if (stageSample.length) {
            console.log(c("cream", "  stage path sample:"));
            for (const item of stageSample) console.log(c("muted", `    ${item}`));
          }
          if (holdSample.length) {
            console.log(c("cream", "  hold/archive sample:"));
            for (const item of holdSample) console.log(c("muted", `    ${item}`));
          }
        }
        if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
        for (const blocker of out.blockers.slice(0, 8)) {
        console.log(c("amber", `  blocker: ${blocker.id} - ${blocker.detail || ""}`));
      }
      for (const group of out.groups.slice(0, 10)) {
        console.log(c("cream", `  group: ${group.label} (${group.count})`));
        console.log(c("muted", `         ${group.action}`));
      }
      console.log(c("muted", `  next:     ${out.next_action}`));
    }
    return;
  }
  if (verb === "feature-reality" || verb === "feature-doctor" || verb === "reality") {
    const doctor = await import("./v4/feature-reality-doctor.mjs");
    const out = await doctor.runFeatureRealityDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX feature reality doctor`));
      console.log(c("muted", `  features: ${out.summary.pass}/${out.summary.features} pass, ${out.summary.watch} watch, ${out.summary.fail} fail`));
      console.log(c("muted", `  theater:  ${out.summary.critical_theater_hits} critical, ${out.summary.watch_theater_hits} watch`));
      console.log(c("muted", `  package:  ${out.summary.package_ready ? "verified" : "missing"} ${out.package?.zip_sha256 || ""}`));
      console.log(c("muted", `  release:  ${out.release_grade ? "pristine" : "not pristine yet"}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const blocker of (out.blockers || []).slice(0, 8)) console.log(c("red", `  blocker: ${blocker.id} - ${blocker.detail || ""}`));
      for (const warning of (out.warnings || []).slice(0, 8)) console.log(c("amber", `  watch: ${warning.id} - ${warning.detail || ""}`));
      console.log(c("muted", `  next:     ${out.next_action}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "user-journey" || verb === "journey" || verb === "user-doctor") {
    const doctor = await import("./v4/user-journey-doctor.mjs");
    const out = await doctor.runUserJourneyDoctor({
      writeReceipt: !!args.flags.receipt,
      full: !!args.flags.full,
      baseUrl: args.flags["base-url"] || undefined,
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX user journey doctor`));
      console.log(c("muted", `  journeys: ${out.summary.passed}/${out.summary.journeys} pass, ${out.summary.watch} watch, ${out.summary.failed} fail`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const blocker of (out.blockers || []).slice(0, 8)) console.log(c("red", `  blocker: ${blocker.id} - ${blocker.detail || ""}`));
      for (const warning of (out.warnings || []).slice(0, 8)) console.log(c("amber", `  watch: ${warning.id} - ${warning.label || ""}`));
      console.log(c("muted", `  next:     ${out.next_action}`));
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "process-doctor" || verb === "processes" || verb === "ps") {
    const doctor = await import("./v4/process-doctor.mjs");
    const out = await doctor.runProcessDoctor({ writeReceipt: !!args.flags.receipt });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      console.log(c(out.ok ? "green" : "red", `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX process hygiene doctor`));
      console.log(c("muted", `  processes: ${out.summary.process_count}`));
      console.log(c("muted", `  stale:     ${out.summary.stale_count}`));
      console.log(c("muted", `  warnings:  ${out.summary.warnings}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:   ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 6)) console.log(c("red", `  failure: ${failure.type} pid=${failure.pid || ""} ${failure.detail || ""}`));
      for (const warning of out.warnings.slice(0, 4)) console.log(c("amber", `  warning: ${warning.type} ${warning.detail || ""}`));
      for (const action of (out.recovery?.actions || []).slice(0, 4)) {
        console.log(c("cream", `  next: ${action.title}`));
        console.log(c("muted", `        review: ${action.safe_review_command}`));
        if (action.requires_operator_approval) console.log(c("muted", "        cleanup requires explicit operator approval"));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  if (verb === "green-board" || verb === "doctor" || verb === "board") {
    const board = await import("./v4/final-green-board.mjs");
    const out = await board.runFinalGreenBoard({
      writeReceipt: !!args.flags.receipt,
      full: !!args.flags.full,
      requireClean: !!args.flags["require-clean"],
    });
    if (args.flags.json) {
      console.log(JSON.stringify(out, null, 2));
    } else {
      const color = out.ok ? "green" : "red";
      console.log(c(color, `${out.ok ? "[ok]" : "[fail]"} ORANGEBOX final green board`));
      console.log(c("muted", `  checks:   ${out.summary.passed}/${out.summary.checks}`));
      console.log(c("muted", `  failures: ${out.summary.failed}`));
      console.log(c("muted", `  warnings: ${out.summary.warnings}`));
      console.log(c("muted", `  full:     ${out.full ? "yes" : "no"}`));
      if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
      for (const failure of out.failures.slice(0, 8)) {
        console.log(c("red", `  failure: ${failure.name} ${failure.error || failure.evidence?.error || ""}`));
      }
      for (const warning of out.warnings.slice(0, 5)) {
        console.log(c("amber", `  warning: ${warning.name} ${warning.error || ""}`));
      }
    }
    if (!out.ok) process.exit(4);
    return;
  }
  console.error(c("red", `unknown finish verb: ${verb}`));
  process.exit(2);
}

async function cmdAlpha(args) {
  const verb = args.positional[1] || "intake";
  if (verb !== "intake" && verb !== "doctor") {
    console.log(c("muted", "  obx alpha intake [--input=FILE] [--json] [--receipt] [--no-write-queue]"));
    process.exit(2);
  }
  const intake = await import("./v4/alpha-bookmark-intake.mjs");
  const out = await intake.runAlphaBookmarkIntake({
    inputPath: args.flags.input || args.positional[2] || null,
    writeReceipt: !!args.flags.receipt,
    writeQueue: !args.flags["no-write-queue"],
    dataRootPath: args.flags["data-root"] || undefined,
  });
  if (args.flags.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(c(out.ok ? "green" : "red", `${out.ok ? "PASS" : "FAIL"} alpha bookmark intake`));
    console.log(c("muted", `  total:    ${out.summary.total}`));
    console.log(c("muted", `  high:     ${out.summary.high}`));
    console.log(c("muted", `  medium:   ${out.summary.medium}`));
    console.log(c("muted", `  watch:    ${out.summary.watch}`));
    console.log(c("muted", `  queued:   ${out.summary.queued_for_verification}`));
    if (out.outputs.source_verification_queue_path) console.log(c("muted", `  queue:    ${out.outputs.source_verification_queue_path}`));
    if (out.receipt_path) console.log(c("muted", `  receipt:  ${out.receipt_path}`));
  }
  if (!out.ok) process.exit(4);
}

async function cmdInference(args) {
  const verb = args.positional[1] || "doctor";
  if (verb !== "doctor") {
    console.log(c("muted", "  obx inference doctor [--json] [--receipt]"));
    process.exit(2);
  }
  const doctor = await import("./v4/inference-acceleration-doctor.mjs");
  const out = await doctor.runInferenceAccelerationDoctor({
    writeReceipt: !!args.flags.receipt,
  });
  if (args.flags.json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(c(out.ok ? "green" : "red", `${out.ok ? "PASS" : "FAIL"} inference acceleration doctor`));
    console.log(c("muted", `  status:                 ${out.summary.status}`));
    console.log(c("muted", `  sglang installed:       ${out.summary.sglang_installed ? "yes" : "no"}`));
    console.log(c("muted", `  vllm installed:         ${out.summary.vllm_installed ? "yes" : "no"}`));
    console.log(c("muted", `  nvidia gpu:             ${out.summary.nvidia_gpu_detected ? "yes" : "no"}`));
    console.log(c("muted", `  accelerated endpoint:   ${out.summary.accelerated_endpoint_reachable ? "yes" : "no"}`));
    console.log(c("muted", `  blockers:               ${out.summary.blocker_count}`));
    if (out.receipt_path) console.log(c("muted", `  receipt:                ${out.receipt_path}`));
  }
  if (!out.ok) process.exit(4);
}

function help() {
  console.log(c("orange", "▣ ORANGEBOX CLI — obx v6.2.0-alpha.3"));
  console.log();
  console.log(c("muted", "  obx                           ") + c("cream", "launch GUI"));
  console.log(c("muted", "  obx chat \"<goal>\"             ") + c("cream", "dispatch agent run, stream"));
  console.log(c("muted", "  obx agent \"<goal>\"            ") + c("cream", "alias for chat"));
  console.log(c("muted", "  obx status                    ") + c("cream", "AE See-Suite status"));
  console.log(c("muted", "  obx receipts [--tail]         ") + c("cream", "list recent receipts"));
  console.log(c("muted", "             [--source=NAME]    "));
  console.log(c("muted", "             [--limit=N]        "));
  console.log(c("muted", "  obx open <path>               ") + c("cream", "set active project"));
  console.log(c("muted", "  obx vault \"<query>\"           ") + c("cream", "vault keyword search"));
  console.log(c("muted", "  obx vault-recovery [--json]   ") + c("cream", "non-mutating credential vault diagnosis"));
  console.log(c("muted", "  obx pipes [redetect]          ") + c("cream", "list subscription CLI pipes (claude/codex/gemini/grok/cursor)"));
  console.log(c("muted", "  obx setup                     ") + c("cream", "guided one-time auth setup (set-and-forget)"));
  console.log(c("muted", "  obx install doctor [--json]   ") + c("cream", "prove Basic Install vs Advanced AI Box clarity"));
  console.log(c("muted", "  obx install visual-proof [--json]") + c("cream", "screenshot the first-run Basic/Advanced choice"));
  console.log(c("muted", "  obx install see-suite-proof [--json] [--isolated]") + c("cream", "screenshot the AE See-Suite creation surface"));
  console.log(c("muted", "  obx install operations-proof [--json]") + c("cream", "screenshot AE Operations product-language proof"));
  console.log(c("muted", "  obx setup openrouter <key>    ") + c("cream", "save OpenRouter key (one key replaces 5+ provider env vars)"));
  console.log(c("muted", "  obx connect [list]            ") + c("cream", "list all 60+ connectors with status"));
  console.log(c("muted", "  obx connect <service>         ") + c("cream", "OAuth flow (opens browser) — reddit, meta, tiktok, linkedin, ..."));
  console.log(c("muted", "  obx connect <svc> --key K     ") + c("cream", "set an apikey service (openai, resend, klaviyo, etc.)"));
  console.log(c("muted", "  obx connect --disconnect <svc>") + c("cream", "revoke a connection"));
  console.log(c("muted", "  obx api doctor [--json]       ") + c("cream", "OpenAPI contract doctor"));
  console.log(c("muted", "  obx api language-doctor [--json] [--receipt] [--isolated]") + c("cream", "AE See-Suite product-language gate"));
  console.log(c("muted", "  obx api spec                  ") + c("cream", "print canonical OpenAPI contract"));
  console.log(c("muted", "  obx aelang <verb>             ") + c("cream", "AELang: doctor, compile route packets"));
  console.log(c("muted", "  obx network <verb>            ") + c("cream", "AI Box Network Priority: doctor, pack"));
  console.log(c("muted", "  obx ethereal <verb>           ") + c("cream", "Ethereal AI Link: doctor, latest, pack"));
  console.log(c("muted", "  obx model <verb>              ") + c("cream", "Running Brain: GPT, Opus, Grok, Gemini, Grok Superheavy"));
  console.log(c("muted", "  obx route <verb>              ") + c("cream", "Operating Spine: plan, doctor"));
  console.log(c("muted", "  obx claude <verb>             ") + c("cream", "Claude Code handoff: export-route"));
  console.log(c("muted", "  obx dept <verb>               ") + c("cream", "Department OS: registry, trust, route, doctor"));
  console.log(c("muted", "  obx hermes <verb>             ") + c("cream", "Hermes/AI Box rail: status, pack, doctor"));
  console.log(c("muted", "  obx alpha intake              ") + c("cream", "score X bookmark export and queue high-confidence Alpha leads"));
  console.log(c("muted", "  obx inference doctor          ") + c("cream", "prove mandatory SGLang/vLLM acceleration lane"));
  console.log(c("muted", "  obx surface <verb>            ") + c("cream", "Surface Factory: templates, list, create"));
  console.log(c("muted", "  obx silent-canvas <verb>      ") + c("cream", "Silent Canvas operations: solidify"));
  console.log(c("muted", "       prompt-eval              ") + c("cream", "local prompt/few-shot regression gate"));
  console.log(c("muted", "       benefits-gate            ") + c("cream", "local doctrine benefits regression gate"));
  console.log(c("muted", "       wire-gate                ") + c("cream", "local wire-path visual telemetry accuracy gate"));
  console.log(c("muted", "       active-bbox              ") + c("cream", "local active canvas bounding-box projection"));
  console.log(c("muted", "       relevance-doctor         ") + c("cream", "local scoped-context and needs_more_context proof gate"));
  console.log(c("muted", "       visual-engine-doctor     ") + c("cream", "local AIGUI living primitives and visual-event proof gate"));
  console.log(c("muted", "       alpha7-doctor            ") + c("cream", "sidecar-free alpha.7 readiness proof bundle"));
  console.log(c("muted", "  obx mcp <verb>                ") + c("cream", "MCP bridge: servers, probe, tools, register, disable"));
  console.log(c("muted", "  obx intel <verb>              ") + c("cream", "research integration backlog: list, brief, doctor, surface"));
  console.log(c("muted", "  obx ads <verb>                ") + c("cream", "native ads: capi · google-enhanced · utm · dco · rules (see `obx ads help`)"));
  console.log(c("muted", "  obx finish green-board        ") + c("cream", "AE See-Suite final proof board"));
  console.log(c("muted", "  obx finish process-doctor     ") + c("cream", "read-only process hygiene proof"));
  console.log(c("muted", "  obx finish feature-reality    ") + c("cream", "anti-theater feature matrix proof"));
  console.log(c("muted", "  obx finish closeout-plan      ") + c("cream", "read-only release-candidate closeout decision plan"));
  console.log(c("muted", "  obx finish decision-card      ") + c("cream", "plain-English release decision card"));
  console.log(c("muted", "  obx finish path-lists         ") + c("cream", "exact stage/hold path review files"));
  console.log(c("muted", "  obx finish release-packet     ") + c("cream", "synchronized release decision + stage/hold packet"));
  console.log();
  console.log(c("muted", "  env: ORANGEBOX_PORT (default 8787) · ORANGEBOX_FORCE_API=1 · ORANGEBOX_FORCE_PIPE=<provider>"));
}

// ── Arg parser (tiny, no deps) ──────────────────────────────────────────────
function parseArgs(argv) {
  const out = { positional: [], flags: {} };
  for (const a of argv) {
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      out.flags[k] = v ?? true;
    } else {
      out.positional.push(a);
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args.positional[0];
  const rest = args.positional.slice(1);
  if (args.flags.help || cmd === "help" || cmd === "--help" || cmd === "-h") return help();
  switch (cmd) {
    case undefined:    return cmdLaunchGUI();
    case "chat":
    case "agent":      return cmdChat(rest.join(" "), { workspace: args.flags.workspace, max_steps: parseInt(args.flags.steps || "25", 10) });
    case "status":     return cmdStatus();
    case "receipts":   return cmdReceipts({ tail: args.flags.tail, source: args.flags.source, limit: parseInt(args.flags.limit || "20", 10) });
    case "open":       return cmdOpen(rest[0]);
    case "vault":      return cmdVault(rest.join(" "));
    case "vault-recovery": return cmdVaultRecovery(args);
    case "pipes":      return cmdPipes(rest[0]);
    case "setup":      return rest[0] === "openrouter" ? cmdSetupOpenRouter(rest[1]) : cmdSetup();
    case "install":    return cmdInstall(args);
    case "connect":    return cmdConnect(args);
    case "api":        return cmdApi(args);
    case "aelang":     return cmdAELang(args);
    case "network":    return cmdNetwork(args);
    case "ethereal":   return cmdNetwork({ ...args, positional: ["network", "ethereal", ...rest] });
    case "model":      return cmdModel(args);
    case "route":      return cmdRoute(args);
    case "claude":     return cmdClaude(args);
    case "dept":       return cmdDept(args);
    case "hermes":     return cmdHermes(args);
    case "alpha":      return cmdAlpha(args);
    case "inference":  return cmdInference(args);
    case "surface":    return cmdSurface(args);
    case "silent-canvas": return cmdSilentCanvas(args);
    case "solidify":   return cmdSilentCanvas({ ...args, positional: ["silent-canvas", "solidify", ...rest] });
    case "mcp":        return cmdMcp(args);
    case "intel":      return cmdIntel(args);
    case "ads":        return cmdAds(args);
    case "finish":     return cmdFinish(args);
    default:
      console.error(c("red", `unknown command: ${cmd}`));
      help();
      process.exit(1);
  }
}

main().catch(e => { console.error(c("red", e.message || String(e))); process.exit(1); });
