#!/usr/bin/env node
/* mcp-doctor.mjs - MCP bridge security/proof gate.
 *
 * This doctor does not install packages, mutate host MCP configs, or call paid
 * APIs. It proves ORANGEBOX's MCP registry can list candidates, register a
 * local HTTP MCP endpoint, observe tools/list, keep stdio packages metadata-only,
 * and disable a server through a persisted override.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import * as bridge from "./mcp-bridge.mjs";
import * as codeMode from "./code-mode-mcp.mjs";

export const MCP_DOCTOR_VERSION = "orangebox-mcp-bridge-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function persistentDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function tempRoot() {
  return path.join(os.tmpdir(), `obx-mcp-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
}

function compactText(value, max = 2400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

async function gate(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const evidence = await fn();
    const ok = evidence?.ok !== false;
    return {
      name,
      required,
      ok,
      status: ok ? "pass" : (required ? "fail" : "warning"),
      duration_ms: Date.now() - started,
      evidence,
    };
  } catch (err) {
    return {
      name,
      required,
      ok: false,
      status: required ? "fail" : "warning",
      duration_ms: Date.now() - started,
      error: err?.message || String(err),
      stack: err?.stack ? compactText(err.stack, 1600) : null,
    };
  }
}

function startMockMcpServer() {
  const calls = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString("utf8"); });
    req.on("end", () => {
      calls.push({ method: req.method, url: req.url, body });
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET") {
        res.end(JSON.stringify({ ok: true, name: "ORANGEBOX Doctor MCP" }));
        return;
      }
      let parsed = {};
      try { parsed = JSON.parse(body || "{}"); } catch {}
      if (parsed.method === "tools/list") {
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          id: parsed.id || "doctor",
          result: {
            tools: [
              {
                name: "doctor.read_status",
                description: "Read-only doctor status probe.",
                inputSchema: { type: "object", properties: {} },
              },
              {
                name: "doctor.write_blocked",
                description: "Write-like tool used to verify ORANGEBOX permission posture.",
                inputSchema: { type: "object", properties: { reason: { type: "string" } } },
              },
            ],
          },
        }));
        return;
      }
      res.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id || "doctor", error: { code: -32601, message: "method not found" } }));
    });
  });
  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({
        server,
        calls,
        url: `http://127.0.0.1:${address.port}/mcp`,
      });
    });
  });
}

async function registryProbe(dataRoot) {
  const out = await bridge.listServers({ dataRoot });
  const ids = new Set(out.servers.map((server) => server.id));
  const required = ["meta-ads-mcp", "tiktok-ads-mcp", "google-ads-mcp", "repomix-mcp", "stackgen-mcp"];
  const missing = required.filter((id) => !ids.has(id));
  const missingAuthSpec = out.servers.filter((server) => !server.auth_spec_version);
  const adsWriteUnsafe = out.servers.filter((server) =>
    server.category === "ads" && server.permissions?.write_requires_operator_confirmation !== true
  );
  return {
    ok: out.count >= 12 && missing.length === 0 && missingAuthSpec.length === 0 && adsWriteUnsafe.length === 0,
    count: out.count,
    registry_path: out.registry_path,
    missing,
    auth_spec_version: bridge.MCP_AUTH_SPEC_VERSION,
    missing_auth_spec: missingAuthSpec.map((server) => server.id),
    ads_write_unsafe: adsWriteUnsafe.map((server) => server.id),
  };
}

async function localHttpToolListProbe(dataRoot) {
  const mock = await startMockMcpServer();
  try {
    const registered = await bridge.registerServer({
      dataRoot,
      body: {
        name: "Doctor MCP",
        category: "doctor",
        transport: "http",
        url: mock.url,
        default_mode: "read_only",
        write_requires_operator_confirmation: true,
        allow_tools: ["doctor.read_status"],
        deny_tools: ["doctor.write_blocked"],
      },
    });
    const probe = await bridge.probeServer({ dataRoot, id: registered.server.id, timeoutMs: 5000 });
    const tools = await bridge.listTools({ dataRoot, id: registered.server.id });
    return {
      ok: registered.ok
        && probe.tools_count === 2
        && probe.mcp_jsonrpc_observed === true
        && probe.default_mode === "read_only"
        && probe.write_requires_operator_confirmation === true
        && tools.tools_count === 2
        && mock.calls.some((call) => call.method === "POST" && call.body.includes("tools/list")),
      registered_server: registered.server,
      probe,
      tools,
      mock_call_count: mock.calls.length,
    };
  } finally {
    await new Promise((resolve) => mock.server.close(resolve));
  }
}

async function stdioMetadataOnlyProbe(dataRoot) {
  const probe = await bridge.probeServer({ dataRoot, id: "repomix-mcp", timeoutMs: 3000 });
  return {
    ok: probe.ok
      && probe.metadata_only === true
      && probe.promotion_gate === "spawn_probe_requires_operator_install_approval"
      && probe.transport === "stdio",
    probe,
  };
}

async function disableOverrideProbe(dataRoot) {
  const disabled = await bridge.disableServer({ dataRoot, id: "meta-ads-mcp", disabled: true });
  const listed = await bridge.listServers({ dataRoot });
  const meta = listed.servers.find((server) => server.id === "meta-ads-mcp");
  return {
    ok: disabled.ok && disabled.disabled === true && meta?.disabled === true,
    disabled,
    meta_ads_disabled: meta?.disabled === true,
    registry_path: listed.registry_path,
  };
}

async function cliApiSourceProbe() {
  const cliPath = path.join(ROOT, "scripts", "obx.mjs");
  const routesPath = path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs");
  const mcpServerPath = path.join(ROOT, "scripts", "orangebox-mcp-server.mjs");
  const [cli, routes, mcpServer] = await Promise.all([
    fs.readFile(cliPath, "utf8"),
    fs.readFile(routesPath, "utf8"),
    fs.readFile(mcpServerPath, "utf8"),
  ]);
  const required = {
    cli: ["obx mcp doctor", "async function cmdMcp", "mcp-doctor.mjs"],
    routes: ["/api/v4/mcp/doctor", "mcp-doctor.mjs", "/api/v4/mcp/probe/", "/api/v4/mcp/code-search", "/api/v4/mcp/code-execute"],
    mcpServer: ["search_docs", "execute", "/api/v4/mcp/code-search", "/api/v4/mcp/code-execute"],
  };
  const missing = {
    cli: required.cli.filter((needle) => !cli.includes(needle)),
    routes: required.routes.filter((needle) => !routes.includes(needle)),
    mcpServer: required.mcpServer.filter((needle) => !mcpServer.includes(needle)),
  };
  const missingTotal = Object.values(missing).reduce((n, arr) => n + arr.length, 0);
  return {
    ok: missingTotal === 0,
    files: { cliPath, routesPath, mcpServerPath },
    missing,
  };
}

async function codeModeMcpProbe(dataRoot) {
  const out = await codeMode.runCodeModeDoctor({ dataRoot });
  return {
    ok: out.ok,
    version: out.version,
    summary: out.summary,
    failures: out.failures,
    data_root: out.data_root,
  };
}

async function writeDoctorReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-mcp-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

async function writeLatestDoctorReport(result) {
  const dir = path.join(persistentDataRoot(), "mcp");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "latest-mcp-doctor.json");
  const payload = {
    ...result,
    latest_report_path: file,
    note: "MCP doctor proves registry/tool-list/code-mode safety without installing MCP servers or mutating host MCP configs.",
  };
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
  return file;
}

export async function runMcpDoctor({ writeReceipt = false, keepTemp = false } = {}) {
  const dataRoot = tempRoot();
  await fs.mkdir(dataRoot, { recursive: true });
  const checks = [];

  checks.push(await gate("registry_security_shape", async () => registryProbe(dataRoot)));
  checks.push(await gate("local_http_tool_list_probe", async () => localHttpToolListProbe(dataRoot)));
  checks.push(await gate("stdio_metadata_only_no_install", async () => stdioMetadataOnlyProbe(dataRoot)));
  checks.push(await gate("disable_override_persists", async () => disableOverrideProbe(dataRoot)));
  checks.push(await gate("cli_api_source_probe", cliApiSourceProbe));
  checks.push(await gate("code_mode_mcp_probe", async () => codeModeMcpProbe(dataRoot)));

  const failed = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failed.length === 0,
    version: MCP_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    data_root: dataRoot,
    install_attempted: false,
    host_mcp_config_mutated: false,
    paid_api_attempted: false,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failed.length,
      warnings: warnings.length,
    },
    checks,
    failures: failed,
    receipt_path: null,
  };

  if (writeReceipt) result.receipt_path = await writeDoctorReceipt(result);
  result.latest_report_path = await writeLatestDoctorReport(result);
  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--receipt");
  const keepTemp = process.argv.includes("--keep-temp");
  const json = process.argv.includes("--json");
  runMcpDoctor({ writeReceipt: write, keepTemp }).then((out) => {
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} MCP bridge checks`);
      if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
      for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
    }
    process.exit(out.ok ? 0 : 4);
  }).catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}
