#!/usr/bin/env node
/* product-language-doctor.mjs - AE See-Suite product-language proof.
 *
 * This doctor checks the language users and agent clients actually see:
 * selected source-facing files plus live API JSON string values. It treats
 * legacy route names and IDs as compatibility debt only when they are explicit
 * machine identifiers, not product copy.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

export const PRODUCT_LANGUAGE_DOCTOR_VERSION = "orangebox-product-language-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");

const PRODUCT_LANGUAGE_FILES = [
  "src/v4/index.html",
  "src/v4/see-suite.js",
  "src/v4/see-suite.css",
  "src/v4/cockpit.js",
  "src/v4/cockpit.css",
  "src/v4/onboarding/settings.html",
  "src/v4/onboarding/settings.js",
  "src/v4/marketplace/marketplace.html",
  "src/v4/marketplace/marketplace.js",
  "src/v4/receipts/receipts.html",
  "src/v4/receipts/receipts.js",
  "src/v4/x-feed/x-feed.html",
  "src/v4/voice/voice.js",
  "src/v4/terminal/terminal.js",
  "src/v4/privacy/privacy.js",
  "src/v4/shared/coming-soon.html",
  "src/v4/shared/i18n/en.json",
  "src/index.html",
  "src/first-run.html",
  "src/first-run.js",
  "src/first-run.css",
  "src/app.js",
  "src/palette.js",
  "README.md",
  "INSTALL-FIRST.txt",
  "0-START-HERE.txt",
  "docs/QUICKSTART.md",
  "docs/OPERATOR_MANUAL.md",
  "docs/VALUE_JUSTIFICATION.md",
  "docs/AE_SEE_SUITE_INTERFACE_DIRECTION.md",
  "docs/ALPHA7_READINESS_DOCTOR.md",
  "docs/AI_COMPUTER_BUYING_GUIDE.md",
  "docs/AI_BOX_NETWORK_PRIORITY.md",
  "docs/AI_BOX_WORKER_RAIL.md",
  "docs/CUSTOM_SUBDOMAIN.md",
  "docs/SURFACE_FACTORY.md",
  "scripts/obx.mjs",
  "scripts/orangebox-mcp-server.mjs",
  "scripts/codexa-command-rail-pack.mjs",
  "scripts/codexa-bridge-pack.mjs",
  "scripts/v4/v4-server-routes.README.md",
  "scripts/v4/queue/bg-agent-queue.mjs",
  "scripts/v4/cloud/README.md",
  "scripts/pack-v6-portable.mjs",
  "package.json",
];

const SOURCE_BLOCKERS = [
  />\s*Cockpit\s*</i,
  /title="Cockpit\b/i,
  /Cockpit \(Ctrl\+1\)/i,
  /Welcome to ORANGEBOX v6\.3 alpha\.7/i,
  /private AI operations cockpit/i,
  /aria-label="Codexa status"/i,
  /<span class="chip-label">codexa<\/span>/i,
  />\s*Codexa\s*</i,
  /Codexa Cloud/i,
  /Settings -> Codexa Rail/i,
  /Codexa Probe/i,
  /Could not reach the cockpit/i,
  /inside the cockpit/i,
  /Back to cockpit/i,
  /Open in cockpit/i,
  /Cockpit pin/i,
  /Run visual proof on cockpit/i,
  /Codexa Bridge/i,
  /execute on Codexa/i,
  /Codexa route needs attention/i,
  /Run a Codexa benchmark pulse/i,
  /Codexa Ethernet Repair/i,
  /No Codexa services verified/i,
  /Codexa agent teams/i,
  /Jump to Codexa/i,
  /Codexa worker rail/i,
  /Codexa Worker Rail/i,
  /Codexa jobs/i,
  /Codexa returns/i,
  /Codexa rail handoff/i,
  /Codexa worker dispatcher/i,
  /Codexa\s+=\s+"second machine/i,
  /OrangeBOX Codexa/i,
  /OrangeBOX CODEXA/i,
  /You are on Codexa/i,
  /Codexa Cloud/i,
  /The 10-lane cockpit/i,
  /The cockpit/i,
  /cockpit has/i,
  /Cockpit application/i,
  /Custom AI cockpit build/i,
  /Every comparable AI cockpit/i,
  /mission cockpit/i,
  /proof\s*&\s*receipt cockpit/i,
  /v4 cockpit/i,
  /cockpit lane/i,
  /Running build on Codexa/i,
  /"worker":\s*"codexa-lan"/i,
  /Tasks run on the Codexa rail/i,
  /real Codexa rail dispatch/i,
  /\[--worker=local\|codexa-lan\|codexa-cloud\]/i,
  /<title>ORANGEBOX[^<]*Settings<\/title>/i,
  /<h1>\s*Settings\s*<\/h1>/i,
  /Settings[^A-Za-z0-9]{0,16}Hermes Agent/i,
  /A unified Settings lane ships/i,
  /"settings":\s*"Settings"/i,
  /"title":\s*"Settings"/i,
  /Setup, model lanes, privacy, recovery, Advanced AI Box, and doctrine\./i,
  /<div class="section-label">Startup surface<\/div>/i,
  />\s*v5 \(default\)\s*<\/label>/i,
  /v2 McLaren HUD/i,
  /v1\.4 classic/i,
  /<div class="section-label">Doctrine<\/div>/i,
  /V4 Moat Doctrine/i,
  /Startup surface pinned to .*v5 default/i,
  /â|Â|Ã|�/,
  /BLUEB0X/i,
  /<CODEXA_IP>/i,
  /orangebox-codexa tools/i,
];

const API_ENDPOINTS = [
  { id: "status_fast", method: "GET", path: "/api/status?fast=1", required: true },
  { id: "see_suite_status", method: "GET", path: "/api/v4/see-suite/status", required: true },
  { id: "ai_box_network", method: "GET", path: "/api/v4/ai-box-network/doctor", required: true },
  { id: "power", method: "GET", path: "/api/power", required: true },
  { id: "cost_limits", method: "GET", path: "/api/cost-limits?project=orangebox", required: true },
  { id: "command_brief", method: "GET", path: "/api/command-brief?project=orangebox", required: true },
  { id: "hallucination_gate", method: "GET", path: "/api/hallucination-gate?project=orangebox", required: true },
  { id: "full_scope", method: "GET", path: "/api/full-scope?project=orangebox", required: true },
];

const MUTATION_SMOKE_ENDPOINTS = [
  {
    id: "chairman_plan",
    method: "POST",
    path: "/api/chairman/plan",
    body: {
      goal: "Product-language doctor fixture: verify visible planning copy uses AE See-Suite, AE Operations, and AI Box language.",
      mode: "language-smoke",
    },
    required: true,
  },
];

const API_BLOCKERS = [
  { id: "blueb0x", pattern: /\bBLUEB0X\b/i },
  { id: "codexa_visible", pattern: /\bCodexa\b/i },
  { id: "cockpit_visible", pattern: /\bcockpit\b/i },
  { id: "cockpit_ip_key", pattern: /\bcockpitIp\b/i },
  { id: "settings_surface_visible", pattern: /<title>ORANGEBOX[^<]*Settings<\/title>|<h1>\s*Settings\s*<\/h1>|Settings[^A-Za-z0-9]{0,16}Hermes Agent|A unified Settings lane ships|"settings":\s*"Settings"|"title":\s*"Settings"/i },
  { id: "blank_host_url", pattern: /\bhttps?:\/\/:\d+/i },
  { id: "mojibake_visible", pattern: /â|Â|Ã|�/ },
];

const COMPATIBILITY_VALUE_ALLOWLIST = [
  /^ae10-codexa-ops$/i,
  /^ae10-ai-box-ops$/i,
  /^codexa-command-rail$/i,
  /^\/api\/v4\/cockpit\/status$/i,
  /^\/api\/codexa\//i,
  /^ORANGEBOX_CODEXA_/i,
  /^codexa[-_]/i,
  /[-_]codexa[-_]/i,
  /codexa[-_]/i,
];

const COMPATIBILITY_PATH_ALLOWLIST = [
  /\.id$/i,
  /\.key$/i,
  /\.route$/i,
  /\.routes\[\d+\]$/i,
  /\.endpoint$/i,
  /\.endpoints\[\d+\]$/i,
  /\.url$/i,
  /\.path$/i,
  /\.command$/i,
  /\.env$/i,
  /\.env_var$/i,
  /\.legacy/i,
  /\.compatibility/i,
  /\.partyLine\.latest\[\d+\]\.message$/i,
  /\.latestParty\[\d+\]\.message$/i,
  /\.history/i,
  /\.receipt/i,
];

const SHIP_MANIFEST = path.resolve(ROOT, "..", "ship", "orangebox-v6.3.0-alpha.7-portable.zip.manifest.json");
const PACKAGE_TEXT_EXTENSIONS = new Set([
  ".md", ".txt", ".json", ".html", ".css", ".yml", ".yaml", ".toml", ".ps1", ".cmd",
]);
const PACKAGE_PRODUCT_PATHS = [
  /^README\.txt$/i,
  /^INSTALL/i,
  /^src\//i,
  /^docs\//i,
  /^tools\/ethereal-ai-link\//i,
];

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function compact(value, max = 700) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeProductLanguageReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-product-language-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

function textFileName(name) {
  const lower = String(name || "").toLowerCase();
  return PACKAGE_TEXT_EXTENSIONS.has(path.extname(lower));
}

function shouldScanPackageEntry(name) {
  const normalized = String(name || "").replace(/\\/g, "/");
  if (!textFileName(normalized)) return false;
  if (/\/receipts?\//i.test(normalized)) return false;
  if (/\/node_modules\//i.test(normalized)) return false;
  return PACKAGE_PRODUCT_PATHS.some((pattern) => pattern.test(normalized));
}

function packageEntryBlockers(name, text) {
  const blockers = [];
  const normalized = String(name || "").replace(/\\/g, "/");
  const patterns = [
    { id: "blueb0x", pattern: /\bBLUEB0X\b/i },
    { id: "codexa_cloud", pattern: /\bCodexa Cloud\b/i },
    { id: "codexa_visible", pattern: /\bCodexa Bridge\b|\bCodexa Worker Rail\b|\bYou are on Codexa\b|\bOrangeBOX Codexa\b|\bCodexa jobs\b|\bCodexa returns\b|\bCodexa rail handoff\b|\bCodexa worker dispatcher\b|\bCodexa\s+=\s+"second machine/i },
    { id: "cockpit_visible", pattern: /\bprivate AI operations cockpit\b|\bBack to cockpit\b|\bOpen in cockpit\b|\binside the cockpit\b|\bThe 10-lane cockpit\b|\bThe cockpit\b|\bcockpit has\b|\bCockpit application\b|\bCustom AI cockpit build\b|\bEvery comparable AI cockpit\b|\bmission cockpit\b|\bproof\s*&\s*receipt cockpit\b/i },
    { id: "settings_surface_visible", pattern: /<title>ORANGEBOX[^<]*Settings<\/title>|<h1>\s*Settings\s*<\/h1>|Settings[^A-Za-z0-9]{0,16}Hermes Agent|A unified Settings lane ships|"settings":\s*"Settings"|"title":\s*"Settings"/i },
    { id: "blank_host_url", pattern: /\bhttps?:\/\/:\d+/i },
    { id: "codexa_placeholder", pattern: /<CODEXA_IP>/i },
    { id: "codexa_tool_copy", pattern: /orangebox-codexa tools/i },
    { id: "stale_settings_surface", pattern: /Setup, model lanes, privacy, recovery, Advanced AI Box, and doctrine\.|Startup surface|v2 McLaren HUD|v1\.4 classic|v5 \(default\)|V4 Moat Doctrine/i },
    { id: "mojibake_visible", pattern: /â|Â|Ã|�/ },
  ];
  for (const item of patterns) {
    if (item.pattern.test(text)) blockers.push({ entry: normalized, marker: item.id });
  }
  return blockers;
}

function parseZipEntries(buffer) {
  const entries = [];
  const min = Math.max(0, buffer.length - 66000);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip EOCD not found");
  const total = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  for (let index = 0; index < total; index += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`bad central directory signature at ${offset}`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");
    entries.push({ name, method, compressedSize, uncompressedSize, localOffset });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntry(buffer, entry) {
  const local = entry.localOffset;
  if (buffer.readUInt32LE(local) !== 0x04034b50) throw new Error(`bad local header for ${entry.name}`);
  const nameLength = buffer.readUInt16LE(local + 26);
  const extraLength = buffer.readUInt16LE(local + 28);
  const dataStart = local + 30 + nameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported zip method ${entry.method} for ${entry.name}`);
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
    };
  }
}

async function sourceLanguageGate() {
  const files = [];
  const blockers = [];
  const compatibilityDebt = [];
  for (const rel of PRODUCT_LANGUAGE_FILES) {
    const file = path.join(ROOT, rel);
    if (!fsSync.existsSync(file)) {
      files.push({ path: file, exists: false });
      blockers.push({ file, marker: "missing_finish_line_file" });
      continue;
    }
    const raw = await fs.readFile(file, "utf8");
    const productBlockers = SOURCE_BLOCKERS
      .filter((pattern) => pattern.test(raw))
      .map((pattern) => pattern.source);
    for (const marker of productBlockers) blockers.push({ file, marker });
    const debt = [];
    if (/\bcockpit\b/i.test(raw)) debt.push("cockpit_internal_compatibility_name");
    if (/BLUEB0X/i.test(raw)) debt.push("BLUEB0X_legacy_reference");
    files.push({
      path: file,
      exists: true,
      product_blockers: productBlockers,
      compatibility_debt: debt,
      sha256: sha256Text(raw),
    });
    for (const item of debt) compatibilityDebt.push({ file, marker: item });
  }
  return {
    ok: blockers.length === 0,
    product_name: "AE See-Suite",
    operations_name: "AE Operations",
    files,
    blockers,
    compatibility_debt_count: compatibilityDebt.length,
    compatibility_debt: compatibilityDebt.slice(0, 80),
  };
}

function findStringValues(value, pathKey = "$", out = []) {
  if (typeof value === "string") {
    out.push({ path: pathKey, value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => findStringValues(item, `${pathKey}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) findStringValues(item, `${pathKey}.${key}`, out);
  }
  return out;
}

function findObjectKeys(value, pathKey = "$", out = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => findObjectKeys(item, `${pathKey}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push({ path: `${pathKey}.${key}.__key`, value: key });
      findObjectKeys(item, `${pathKey}.${key}`, out);
    }
  }
  return out;
}

function isCompatibilityValue(pathKey, value) {
  const text = String(value || "");
  if (COMPATIBILITY_VALUE_ALLOWLIST.some((pattern) => pattern.test(text))) return true;
  if (COMPATIBILITY_PATH_ALLOWLIST.some((pattern) => pattern.test(pathKey)) && /codexa|cockpit/i.test(text)) return true;
  return false;
}

function classifyApiLanguage(endpoint, body) {
  const strings = [
    ...findStringValues(body),
    ...findObjectKeys(body),
  ];
  const blockers = [];
  const compatibility = [];
  for (const item of strings) {
    for (const blocker of API_BLOCKERS) {
      if (!blocker.pattern.test(item.value)) continue;
      const row = {
        endpoint: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        json_path: item.path,
        marker: blocker.id,
        value: compact(item.value, 260),
      };
      if (endpoint.path === "/api/v4/cockpit/status" || isCompatibilityValue(item.path, item.value)) compatibility.push(row);
      else blockers.push(row);
    }
  }
  return { blockers, compatibility, string_count: strings.length };
}

function requestJson(baseUrl, endpoint, timeoutMs = 12000) {
  return new Promise((resolve) => {
    const url = new URL(endpoint.path, baseUrl);
    const body = endpoint.body ? JSON.stringify(endpoint.body) : null;
    const req = http.request(url, {
      method: endpoint.method,
      headers: body ? {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      } : {},
      timeout: timeoutMs,
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            body: JSON.parse(data || "{}"),
          });
        } catch (err) {
          resolve({
            ok: false,
            status: res.statusCode,
            error: `invalid JSON: ${err.message}`,
            raw: compact(data),
          });
        }
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (err) => {
      resolve({ ok: false, status: 0, error: err?.message || String(err) });
    });
    if (body) req.write(body);
    req.end();
  });
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function startTemporaryServer() {
  const port = await freePort();
  const tunnelPort = await freePort();
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-product-language-data-"));
  const child = spawn(process.execPath, [
    SERVER_SCRIPT,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--root",
    dataRoot,
    "--no-start-receipt",
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      ORANGEBOX_DATA_ROOT: dataRoot,
      ORANGEBOX_NO_START_RECEIPT: "1",
      ORANGEBOX_TUNNEL_PORT: String(tunnelPort),
      ORANGEBOX_TUNNEL_HOST: "127.0.0.1",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const probe = await requestJson(baseUrl, { id: "startup", method: "GET", path: "/api/status?fast=1" }, 2000);
    if (probe.ok) {
      return {
        baseUrl,
        dataRoot,
        port,
        tunnelPort,
        child,
        started: true,
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 500));
        },
        output: () => ({ stdout_tail: compact(stdout, 1800), stderr_tail: compact(stderr, 1800) }),
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!child.killed) child.kill();
  throw new Error(`temporary ORANGEBOX server did not become ready on ${baseUrl}: ${compact(stderr || stdout, 1200)}`);
}

async function apiLanguageGate({ baseUrl, startServer = true, includeMutationSmoke = false, forceTempServer = false } = {}) {
  const requestedBaseUrl = baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`;
  let runtime = {
    baseUrl: requestedBaseUrl,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  let firstProbe = null;
  if (forceTempServer) {
    if (!startServer) {
      return {
        ok: false,
        base_url: requestedBaseUrl,
        error: "forceTempServer requested while startServer is disabled",
        started_temporary_server: false,
      };
    }
    runtime = await startTemporaryServer();
  } else {
    firstProbe = await requestJson(requestedBaseUrl, API_ENDPOINTS[0], 3000);
  }
  if (!forceTempServer && !firstProbe.ok) {
    if (!startServer) {
      return {
        ok: false,
        base_url: requestedBaseUrl,
        error: firstProbe.error || `HTTP ${firstProbe.status}`,
        started_temporary_server: false,
      };
    }
    runtime = await startTemporaryServer();
  }

  const endpoints = includeMutationSmoke
    ? [...API_ENDPOINTS, ...MUTATION_SMOKE_ENDPOINTS]
    : API_ENDPOINTS;
  const results = [];
  const blockers = [];
  const compatibility = [];
  try {
    for (const endpoint of endpoints) {
      const response = firstProbe && endpoint.id === API_ENDPOINTS[0].id && runtime.baseUrl === requestedBaseUrl && firstProbe.ok
        ? firstProbe
        : await requestJson(runtime.baseUrl, endpoint);
      const classified = response.ok ? classifyApiLanguage(endpoint, response.body) : { blockers: [], compatibility: [], string_count: 0 };
      blockers.push(...classified.blockers);
      compatibility.push(...classified.compatibility);
      results.push({
        id: endpoint.id,
        method: endpoint.method,
        path: endpoint.path,
        required: endpoint.required,
        ok: response.ok && classified.blockers.length === 0,
        status: response.status,
        error: response.error || null,
        string_count: classified.string_count,
        blocker_count: classified.blockers.length,
        compatibility_count: classified.compatibility.length,
        response_keys: response.body && typeof response.body === "object" ? Object.keys(response.body).sort() : [],
      });
    }
  } finally {
    await runtime.stop();
  }
  return {
    ok: blockers.length === 0 && results.every((row) => row.ok || row.required === false),
    base_url: runtime.baseUrl,
    started_temporary_server: runtime.started,
    include_mutation_smoke: includeMutationSmoke,
    results,
    blockers,
    compatibility_observed: compatibility.slice(0, 80),
    compatibility_count: compatibility.length,
    runtime_output: runtime.output(),
  };
}

async function packageLanguageGate() {
  if (!fsSync.existsSync(SHIP_MANIFEST)) {
    return {
      ok: true,
      status: "skipped",
      manifest_path: SHIP_MANIFEST,
      note: "Portable package manifest not found; package gate will verify existence separately.",
    };
  }
  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(SHIP_MANIFEST, "utf8"));
  } catch (err) {
    return { ok: false, manifest_path: SHIP_MANIFEST, error: `manifest parse failed: ${err.message}` };
  }
  const zipPath = manifest.zip_path || manifest.zip || path.resolve(path.dirname(SHIP_MANIFEST), "orangebox-v6.3.0-alpha.7-portable.zip");
  if (!fsSync.existsSync(zipPath)) return { ok: false, manifest_path: SHIP_MANIFEST, zip_path: zipPath, error: "zip not found" };
  const buffer = await fs.readFile(zipPath);
  const entries = parseZipEntries(buffer);
  const scanned = [];
  const blockers = [];
  const skippedLarge = [];
  for (const entry of entries) {
    if (!shouldScanPackageEntry(entry.name)) continue;
    if (entry.uncompressedSize > 3_000_000) {
      skippedLarge.push({ entry: entry.name, uncompressed_size: entry.uncompressedSize });
      continue;
    }
    const text = readZipEntry(buffer, entry).toString("utf8");
    const entryBlockers = packageEntryBlockers(entry.name, text);
    blockers.push(...entryBlockers);
    scanned.push({
      entry: entry.name,
      uncompressed_size: entry.uncompressedSize,
      sha256: sha256Text(text),
      blocker_count: entryBlockers.length,
    });
  }
  return {
    ok: blockers.length === 0,
    manifest_path: SHIP_MANIFEST,
    zip_path: zipPath,
    zip_sha256: manifest.zip_sha256 || manifest.sha256 || manifest.hashes?.zip || null,
    entry_count: entries.length,
    scanned_count: scanned.length,
    scanned: scanned.slice(0, 120),
    blockers,
    skipped_large: skippedLarge,
    note: "Package scan is intentionally product-facing: README, src, docs, installer text, and Ethereal payload text. Internal script compatibility names are tracked separately.",
  };
}

export async function runProductLanguageDoctor({
  writeReceipt = false,
  startServer = true,
  includeMutationSmoke = false,
  baseUrl = null,
  forceTempServer = false,
} = {}) {
  const checks = [];
  checks.push(await gate("source_product_language", sourceLanguageGate));
  checks.push(await gate("api_product_language", () => apiLanguageGate({ baseUrl, startServer, includeMutationSmoke, forceTempServer })));
  checks.push(await gate("portable_package_product_language", packageLanguageGate, { required: false }));
  const failures = checks.filter((check) => check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    version: PRODUCT_LANGUAGE_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    project: "ORANGEBOX",
    product_language: {
      top_surface: "AE See-Suite",
      operations_surface: "AE Operations",
      ai_worker_surface: "optional AI Box",
      allowed_compatibility: [
        "undocumented legacy aliases such as /api/v4/cockpit/status while old clients migrate",
        "internal machine IDs such as codexa-command-rail only as hidden compatibility aliases",
        "legacy ORANGEBOX_CODEXA_* env aliases only when paired with ORANGEBOX_AI_BOX_*",
      ],
    },
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: checks.filter((check) => !check.required && !check.ok).length,
    },
    checks,
    failures,
    receipt_path: null,
  };
  if (writeReceipt) result.receipt_path = await writeProductLanguageReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runProductLanguageDoctor({
    writeReceipt: argv.includes("--receipt"),
    startServer: !argv.includes("--no-start-server"),
    includeMutationSmoke: argv.includes("--mutating") || argv.includes("--include-mutation-smoke"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || null,
    forceTempServer: argv.includes("--isolated"),
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} product-language checks`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
