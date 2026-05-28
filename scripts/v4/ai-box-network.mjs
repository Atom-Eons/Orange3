#!/usr/bin/env node
/* ai-box-network.mjs - ORANGEBOX AI Box Network Priority module.
 *
 * This module is deliberately split into:
 *   1. read-only doctor/status
 *   2. generated, operator-applied Windows policy pack
 *
 * It does not silently mutate QoS, firewall, adapter, or router settings.
 */

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import net from "node:net";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

export const AI_BOX_NETWORK_VERSION = "orangebox-ai-box-network-priority/v1";
export const ETHEREAL_LINK_VERSION = "orangebox-ethereal-ai-link/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DEFAULT_DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const COMMAND_RAIL_PORT = 8097;
const BRIDGE_PORT = 8098;
const KNOWLEDGE_PORT = 8099;
const DEFAULT_AI_BOX_PORTS = [8097, 8098, 8099, 8080, 5678, 18789];
const POLICY_PREFIX = "ORANGEBOX-AIBox";
const ETHEREAL_POLICY_PREFIX = "ORANGEBOX-EtherealLink";
const ETHEREAL_SOCKET_VERSION = "orangebox-ethereal-socket/v1";
const ETHEREAL_DEFAULT_SUBNET = "10.0.99";
const ETHEREAL_DEFAULT_PREFIX = 24;
const ETHEREAL_DEFAULT_JUMBO_BYTES = 9014;
const ETHEREAL_DEFAULT_PING_PAYLOAD = 8900;
const ETHEREAL_SOCKET_PORT = 9999;

const BACKGROUND_LAUNCHERS = [
  { name: "Epic Games Launcher", process: "EpicGamesLauncher.exe", throttle_mbps: 1 },
  { name: "Epic Web Helper", process: "EpicWebHelper.exe", throttle_mbps: 1 },
  { name: "Steam", process: "steam.exe", throttle_mbps: 2 },
  { name: "Steam Web Helper", process: "steamwebhelper.exe", throttle_mbps: 2 },
  { name: "EA App", process: "EADesktop.exe", throttle_mbps: 1 },
  { name: "Battle.net", process: "Battle.net.exe", throttle_mbps: 1 },
  { name: "Ubisoft Connect", process: "upc.exe", throttle_mbps: 1 },
];

const BROWSER_GUARD = [
  { name: "Chrome", process: "chrome.exe", throttle_mbps: 8 },
  { name: "Edge", process: "msedge.exe", throttle_mbps: 8 },
  { name: "Firefox", process: "firefox.exe", throttle_mbps: 8 },
  { name: "Brave", process: "brave.exe", throttle_mbps: 8 },
];

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function readJsonIfPresent(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function fileMeta(file) {
  try {
    const stat = fssync.statSync(file);
    return {
      path: file,
      exists: true,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
}

function hashFileIfPresent(file) {
  try {
    return crypto.createHash("sha256").update(fssync.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function configuredHosts() {
  const extra = String(process.env.ORANGEBOX_AI_BOX_IPS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const etherealSubnet = process.env.ORANGEBOX_ETHEREAL_SUBNET || ETHEREAL_DEFAULT_SUBNET;
  const etherealHostIp = process.env.ORANGEBOX_ETHEREAL_HOST_IP || `${etherealSubnet}.1`;
  const etherealPeerIp = process.env.ORANGEBOX_ETHEREAL_PEER_IP || `${etherealSubnet}.2`;
  const localIps = new Set(networkAddresses().map((row) => row.address));
  const inferredDirectIp = localIps.has(etherealPeerIp)
    ? etherealHostIp
    : localIps.has(etherealHostIp)
      ? etherealPeerIp
      : "";
  return {
    see_suite_ip: process.env.ORANGEBOX_SEE_SUITE_IP || process.env.ORANGEBOX_COCKPIT_IP || "127.0.0.1",
    ai_box_direct_ip: process.env.ORANGEBOX_AI_BOX_DIRECT_IP || process.env.ORANGEBOX_CODEXA_DIRECT_IP || inferredDirectIp,
    ai_box_lan_ip: process.env.ORANGEBOX_AI_BOX_IP || process.env.ORANGEBOX_CODEXA_IP || "",
    ai_box_legacy_ip: process.env.ORANGEBOX_AI_BOX_LEGACY_IP || process.env.ORANGEBOX_CODEXA_LEGACY_IP || "",
    extra_ai_box_ips: extra,
    inferred_direct_ip: inferredDirectIp || null,
  };
}

function networkAddresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, rows]) => (
    rows || []
  ).filter((row) => row.family === "IPv4" && !row.internal).map((row) => ({
    name,
    address: row.address,
    netmask: row.netmask,
    mac: row.mac,
  })));
}

function endpointRows(hosts) {
  const rows = [];
  const add = (route, host, port, label) => {
    if (!host) return;
    rows.push({
      route,
      host,
      port,
      label,
      url: `http://${host}:${port}${port === KNOWLEDGE_PORT ? "/" : "/health"}`,
    });
  };
  for (const [route, host] of [
    ["DIRECT_LINK", hosts.ai_box_direct_ip],
    ["ROUTER_LAN", hosts.ai_box_lan_ip],
    ["LEGACY_WIFI", hosts.ai_box_legacy_ip],
  ]) {
    add(route, host, COMMAND_RAIL_PORT, "command rail");
    add(route, host, BRIDGE_PORT, "bridge");
    add(route, host, KNOWLEDGE_PORT, "knowledge");
  }
  for (const host of hosts.extra_ai_box_ips || []) {
    add("AI_BOX_EXTRA", host, COMMAND_RAIL_PORT, "command rail");
    add("AI_BOX_EXTRA", host, BRIDGE_PORT, "bridge");
    add("AI_BOX_EXTRA", host, KNOWLEDGE_PORT, "knowledge");
  }
  return rows;
}

async function probe(url, timeoutMs = 850) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      url,
      status: response.ok ? "VERIFIED" : "FAILED",
      code: response.status,
      ms: Date.now() - started,
    };
  } catch (err) {
    return {
      url,
      status: "FAILED",
      error: err?.name === "AbortError" ? "timeout" : (err?.message || String(err)),
      ms: Date.now() - started,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function tasklistProcesses() {
  if (process.platform !== "win32") return [];
  try {
    const { stdout } = await execFileAsync("tasklist.exe", ["/fo", "csv", "/nh"], {
      windowsHide: true,
      timeout: 4000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return stdout.split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const cells = [];
        let cur = "";
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
          const ch = line[i];
          if (ch === "\"") quoted = !quoted;
          else if (ch === "," && !quoted) {
            cells.push(cur);
            cur = "";
          } else cur += ch;
        }
        cells.push(cur);
        return { image: cells[0], pid: cells[1] };
      });
  } catch {
    return [];
  }
}

async function readQosPolicies() {
  if (process.platform !== "win32") return { status: "UNSUPPORTED_PLATFORM", policies: [] };
  try {
    const script = [
      "$ErrorActionPreference = [System.Management.Automation.ActionPreference]::Stop;",
      "Get-NetQosPolicy -PolicyStore ActiveStore |",
      "Where-Object { $_.Name -like 'ORANGEBOX-AIBox*' } |",
      "Select-Object Name,Owner,NetworkProfile,IPProtocolMatchCondition,IPDstPrefixMatchCondition,IPPortMatchCondition,AppPathNameMatchCondition,DSCPAction,ThrottleRateActionBitsPerSecond |",
      "ConvertTo-Json -Depth 4",
    ].join(" ");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = stdout.trim() ? JSON.parse(stdout) : [];
    return { status: "READ", policies: Array.isArray(parsed) ? parsed : [parsed] };
  } catch (err) {
    return { status: "UNREADABLE", error: err?.message || String(err), policies: [] };
  }
}

function etherealConfig(overrides = {}) {
  const subnet = overrides.subnet || process.env.ORANGEBOX_ETHEREAL_SUBNET || ETHEREAL_DEFAULT_SUBNET;
  const hostIp = overrides.hostIp || process.env.ORANGEBOX_ETHEREAL_HOST_IP || `${subnet}.1`;
  const peerIp = overrides.peerIp || process.env.ORANGEBOX_ETHEREAL_PEER_IP || `${subnet}.2`;
  return {
    version: ETHEREAL_LINK_VERSION,
    adapter_alias: overrides.adapterAlias || process.env.ORANGEBOX_ETHEREAL_ADAPTER || "",
    subnet,
    prefix_length: Number(overrides.prefixLength || process.env.ORANGEBOX_ETHEREAL_PREFIX || ETHEREAL_DEFAULT_PREFIX),
    host_ip: hostIp,
    peer_ip: peerIp,
    mtu_bytes: Number(overrides.mtuBytes || process.env.ORANGEBOX_ETHEREAL_MTU || ETHEREAL_DEFAULT_JUMBO_BYTES),
    ping_payload_bytes: Number(overrides.pingPayloadBytes || process.env.ORANGEBOX_ETHEREAL_PING_PAYLOAD || ETHEREAL_DEFAULT_PING_PAYLOAD),
    tcp_datacenter_mode: !!overrides.tcpDatacenterMode || truthy(process.env.ORANGEBOX_ETHEREAL_TCP_DATACENTER),
  };
}

function parseLinkSpeedBits(speed) {
  const raw = String(speed || "").trim();
  const match = raw.match(/([\d.]+)\s*([GMK]?bps)/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit === "gbps") return value * 1_000_000_000;
  if (unit === "mbps") return value * 1_000_000;
  if (unit === "kbps") return value * 1_000;
  return value;
}

function nonEmptyObjects(value) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.filter((row) => row && typeof row === "object" && Object.values(row).some((cell) => cell !== null && cell !== undefined && String(cell) !== ""));
}

function fallbackNetworkAdapters() {
  const nets = os.networkInterfaces();
  return Object.entries(nets).map(([name, rows]) => {
    const ipv4 = (rows || [])
      .filter((row) => row && row.family === "IPv4" && !row.internal)
      .map((row) => ({
        InterfaceAlias: name,
        InterfaceIndex: null,
        IPAddress: row.address,
        PrefixLength: row.cidr?.includes("/") ? Number(row.cidr.split("/").pop()) : null,
      }));
    const first = (rows || []).find((row) => row && !row.internal);
    return {
      Name: name,
      InterfaceDescription: name.toLowerCase().includes("ethereal")
        ? "Ethereal direct-link interface"
        : "OS network interface fallback",
      Status: ipv4.length ? "Up" : "Unknown",
      LinkSpeed: "unknown",
      LinkSpeedBits: 0,
      MacAddress: first?.mac || "",
      ifIndex: null,
      ipv4,
      inventory_source: "node_os_networkInterfaces",
    };
  }).filter((adapter) => adapter.ipv4.length);
}

async function readEthernetAdapters() {
  if (process.platform !== "win32") return { status: "UNSUPPORTED_PLATFORM", adapters: [] };
  try {
    const script = [
      "$ErrorActionPreference = 'Stop';",
      "$adapters = Get-NetAdapter -Physical | Select-Object Name,InterfaceDescription,Status,LinkSpeed,MacAddress,ifIndex;",
      "$ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object InterfaceAlias,InterfaceIndex,IPAddress,PrefixLength;",
      "[pscustomobject]@{ adapters=$adapters; ipv4=$ips } | ConvertTo-Json -Depth 5",
    ].join(" ");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = stdout.trim() ? JSON.parse(stdout) : { adapters: [], ipv4: [] };
    const adapters = Array.isArray(parsed.adapters) ? parsed.adapters : parsed.adapters ? [parsed.adapters] : [];
    const ipv4 = Array.isArray(parsed.ipv4) ? parsed.ipv4 : parsed.ipv4 ? [parsed.ipv4] : [];
    return {
      status: "READ",
      adapters: adapters.map((adapter) => ({
        ...adapter,
        LinkSpeedBits: parseLinkSpeedBits(adapter.LinkSpeed),
        ipv4: ipv4.filter((ip) => Number(ip.InterfaceIndex) === Number(adapter.ifIndex)),
      })),
    };
  } catch (err) {
    const fallback = fallbackNetworkAdapters();
    return {
      status: fallback.length ? "FALLBACK_OS_INTERFACES" : "UNREADABLE",
      error: err?.message || String(err),
      adapters: fallback,
      fallback_note: fallback.length
        ? "PowerShell adapter inventory failed; using Node OS network interface inventory for non-mutating diagnosis."
        : null,
    };
  }
}

async function readAdvancedFabricCapabilities() {
  if (process.platform !== "win32") {
    return {
      status: "UNSUPPORTED_PLATFORM",
      rdma: { status: "UNSUPPORTED_PLATFORM", adapters: [] },
      nvmeof: { status: "UNSUPPORTED_PLATFORM", commands: [], services: [] },
    };
  }
  try {
    const script = [
      "$rdma = try { Get-NetAdapterRdma -ErrorAction Stop | Select-Object Name,Enabled,Operational,InterfaceDescription } catch { @() };",
      "$nvmeCommands = try { Get-Command nvme*,*nvmeof* -ErrorAction Stop | Select-Object Name,Source,CommandType } catch { @() };",
      "$nvmeServices = try { Get-Service -ErrorAction Stop | Where-Object { $_.Name -match 'nvme|nvmeof' -or $_.DisplayName -match 'NVMe|NVMe-oF|NVMe over Fabrics' } | Select-Object Name,DisplayName,Status,StartType } catch { @() };",
      "$smbClient = try { Get-SmbClientConfiguration -ErrorAction Stop | Select-Object EnableMultiChannel,ConnectionCountPerRssNetworkInterface,DirectoryCacheLifetime,FileInfoCacheLifetime,FileNotFoundCacheLifetime } catch { $null };",
      "$smbServer = try { Get-SmbServerConfiguration -ErrorAction Stop | Select-Object EnableMultiChannel,EnableSMB2Protocol,EnableLeasing,EnableOplocks } catch { $null };",
      "$smbChannels = try { Get-SmbMultichannelConnection -ErrorAction Stop | Select-Object ServerName,ClientInterfaceIndex,ServerInterfaceIndex,ClientRSSCapable,ClientRDMAcapable,ServerRSSCapable,ServerRDMAcapable,CurrentChannels } catch { @() };",
      "[pscustomobject]@{ rdma=$rdma; nvme_commands=$nvmeCommands; nvme_services=$nvmeServices; smb_client=$smbClient; smb_server=$smbServer; smb_channels=$smbChannels } | ConvertTo-Json -Depth 5",
    ].join(" ");
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    });
    const parsed = stdout.trim() ? JSON.parse(stdout) : {};
    const rdmaAdapters = nonEmptyObjects(parsed.rdma);
    const nvmeCommands = nonEmptyObjects(parsed.nvme_commands);
    const nvmeServices = nonEmptyObjects(parsed.nvme_services);
    const smbChannels = nonEmptyObjects(parsed.smb_channels);
    return {
      status: "READ",
      rdma: {
        status: rdmaAdapters.length ? "OBSERVED" : "NOT_OBSERVED",
        adapters: rdmaAdapters,
        enabled_count: rdmaAdapters.filter((row) => row.Enabled === true || String(row.Enabled).toLowerCase() === "true").length,
        operational_count: rdmaAdapters.filter((row) => row.Operational === true || String(row.Operational).toLowerCase() === "true").length,
      },
      nvmeof: {
        status: nvmeCommands.length || nvmeServices.length ? "TOOLS_OR_SERVICES_OBSERVED" : "NOT_OBSERVED",
        commands: nvmeCommands,
        services: nvmeServices,
      },
      smb_multichannel: {
        status: parsed.smb_client || parsed.smb_server ? "OBSERVED" : "NOT_OBSERVED",
        client: parsed.smb_client || null,
        server: parsed.smb_server || null,
        active_channels: smbChannels,
      },
    };
  } catch (err) {
    return {
      status: "UNREADABLE",
      error: err?.message || String(err),
      rdma: { status: "UNREADABLE", adapters: [] },
      nvmeof: { status: "UNREADABLE", commands: [], services: [] },
      smb_multichannel: { status: "UNREADABLE", client: null, server: null, active_channels: [] },
    };
  }
}

async function readPythonStatus() {
  const candidates = process.platform === "win32" ? [["py.exe", ["-3", "--version"]], ["python.exe", ["--version"]], ["python", ["--version"]]] : [["python3", ["--version"]], ["python", ["--version"]]];
  for (const [bin, args] of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(bin, args, {
        windowsHide: true,
        timeout: 3000,
        maxBuffer: 128 * 1024,
      });
      return {
        status: "FOUND",
        command: [bin, ...args].join(" "),
        version: (stdout || stderr || "").trim(),
      };
    } catch {}
  }
  return {
    status: "NOT_FOUND",
    command: null,
    version: null,
  };
}

function isLikelyWiredAdapter(adapter) {
  const haystack = `${adapter.Name || ""} ${adapter.InterfaceDescription || ""}`.toLowerCase();
  if (adapter.Status && String(adapter.Status).toLowerCase() !== "up") return false;
  if (/(wi-?fi|wireless|bluetooth|virtual|hyper-v|vethernet|loopback|tap|vpn|wan miniport)/i.test(haystack)) return false;
  return parseLinkSpeedBits(adapter.LinkSpeed) >= 1_000_000_000 || /ethernet|ethereal|gbe|2\.5g|5g|10g|realtek|intel/i.test(haystack);
}

function etherealLocalAddresses(config) {
  return networkAddresses().filter((row) => row.address === config.host_ip || row.address === config.peer_ip || row.address.startsWith(`${config.subnet}.`));
}

async function pingIp(ip, { payload = 32, dontFragment = false, timeoutMs = 2500 } = {}) {
  if (!ip) return { ip, ok: false, status: "SKIPPED", error: "missing ip" };
  const started = Date.now();
  const args = process.platform === "win32"
    ? ["-n", "1", ...(dontFragment ? ["-f"] : []), "-l", String(payload), ip]
    : ["-c", "1", ip];
  try {
    const { stdout, stderr } = await execFileAsync("ping", args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
    });
    return {
      ip,
      ok: true,
      status: "VERIFIED",
      payload,
      dont_fragment: !!dontFragment,
      ms: Date.now() - started,
      stdout: stdout.slice(0, 1200),
      stderr: stderr.slice(0, 1200),
    };
  } catch (err) {
    return {
      ip,
      ok: false,
      status: "FAILED",
      payload,
      dont_fragment: !!dontFragment,
      ms: Date.now() - started,
      error: err?.message || String(err),
      stdout: err?.stdout ? String(err.stdout).slice(0, 1200) : "",
      stderr: err?.stderr ? String(err.stderr).slice(0, 1200) : "",
    };
  }
}

async function runEtherealHandshake(config, deep = false) {
  const local = etherealLocalAddresses(config);
  const localRole = local.some((row) => row.address === config.host_ip)
    ? "host"
    : local.some((row) => row.address === config.peer_ip)
      ? "peer"
      : "unknown";
  const remoteIp = localRole === "host" ? config.peer_ip : localRole === "peer" ? config.host_ip : config.peer_ip;
  const normal = local.length ? await pingIp(remoteIp, { payload: 32, dontFragment: false }) : { ip: remoteIp, ok: false, status: "SKIPPED", error: "No local Ethereal subnet address assigned." };
  const jumbo = local.length && deep ? await pingIp(remoteIp, { payload: config.ping_payload_bytes, dontFragment: true, timeoutMs: 4000 }) : { ip: remoteIp, ok: false, status: deep ? "SKIPPED" : "SKIPPED_FAST_DOCTOR" };
  return { local_role: localRole, local_addresses: local, remote_ip: remoteIp, normal_ping: normal, jumbo_ping: jumbo };
}

function socketJsonRequest({ host, port, token, payload, timeoutMs = 2500 }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let expected = null;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ ...result, ms: Date.now() - started });
    };
    const timer = setTimeout(() => finish({ ok: false, status: "FAILED", error: "timeout" }), timeoutMs);
    socket.on("connect", () => {
      const body = Buffer.from(JSON.stringify({ ...payload, token }), "utf8");
      const header = Buffer.alloc(4);
      header.writeUInt32BE(body.length, 0);
      socket.write(Buffer.concat([header, body]));
    });
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      if (expected === null && buffer.length >= 4) expected = buffer.readUInt32BE(0);
      if (expected !== null && buffer.length >= 4 + expected) {
        const raw = buffer.subarray(4, 4 + expected).toString("utf8");
        try {
          const parsed = JSON.parse(raw);
          finish({ ok: parsed.ok === true, status: parsed.ok === true ? "VERIFIED" : "FAILED", response: parsed });
        } catch (err) {
          finish({ ok: false, status: "FAILED", error: err?.message || String(err), raw: raw.slice(0, 1000) });
        }
      }
    });
    socket.on("error", (err) => finish({ ok: false, status: "FAILED", error: err?.message || String(err) }));
    socket.on("close", () => {
      if (!settled) finish({ ok: false, status: "FAILED", error: "connection closed before response" });
    });
  });
}

async function probeEtherealSocket({ config, handshake, packDir, deep = false }) {
  const remoteIp = handshake.remote_ip;
  const daemonPath = path.join(packDir, "ETHEREAL_SOCKET.py");
  const tokenFile = path.join(packDir, "ETHEREAL_SOCKET_TOKEN.txt");
  const tokenConfigured = fssync.existsSync(tokenFile);
  if (!handshake.local_addresses.length) {
    return { status: "SKIPPED", ok: false, reason: "No local Ethereal subnet address assigned.", remote_ip: remoteIp, port: ETHEREAL_SOCKET_PORT };
  }
  if (!tokenConfigured) {
    return { status: "SKIPPED", ok: false, reason: "ETHEREAL_SOCKET_TOKEN.txt not found in the generated pack.", remote_ip: remoteIp, port: ETHEREAL_SOCKET_PORT, token_configured: false };
  }
  const token = fssync.readFileSync(tokenFile, "utf8").trim();
  const ping = await socketJsonRequest({
    host: remoteIp,
    port: ETHEREAL_SOCKET_PORT,
    token,
    payload: { op: "ping" },
  });
  let list = { status: deep ? "SKIPPED_PING_FAILED" : "SKIPPED_FAST_DOCTOR", ok: false };
  if (deep && ping.ok) {
    list = await socketJsonRequest({
      host: remoteIp,
      port: ETHEREAL_SOCKET_PORT,
      token,
      payload: { op: "list", path: "", limit: 20 },
    });
  }
  return {
    status: ping.ok ? "VERIFIED" : "FAILED",
    ok: ping.ok,
    remote_ip: remoteIp,
    port: ETHEREAL_SOCKET_PORT,
    daemon_path: daemonPath,
    daemon_present: fssync.existsSync(daemonPath),
    token_file: tokenFile,
    token_configured: Boolean(token),
    ping,
    list,
  };
}

function summarizeEtherealReceipt(file, parsed, meta) {
  const evidence = parsed?.evidence || parsed;
  if (!evidence || evidence.version !== ETHEREAL_LINK_VERSION) return null;
  const kind = evidence.pack_dir ? "pack" : "doctor";
  return {
    kind,
    path: file,
    modified_at: meta.modified_at,
    bytes: meta.bytes,
    result: parsed?.result || (evidence.ok ? "VERIFIED" : "REVIEW_REQUIRED"),
    ok: evidence.ok === true,
    status: evidence.status || (evidence.ok ? "VERIFIED" : "REVIEW"),
    created_at: evidence.created_at || null,
    receipt_path: evidence.receipt_path || file,
    pack_dir: evidence.pack_dir || evidence.pack?.directory || null,
    warnings: Array.isArray(evidence.warnings) ? evidence.warnings.length : 0,
    blockers: Array.isArray(evidence.blockers) ? evidence.blockers.length : 0,
    next_action: evidence.next_action || parsed?.next_action || null,
  };
}

async function latestEtherealReceipts(limit = 10) {
  const dir = path.join(ROOT, "receipts");
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rows = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^orangebox-ai-box-network-.*\.json$/i.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    const meta = fileMeta(file);
    const parsed = await readJsonIfPresent(file);
    const row = summarizeEtherealReceipt(file, parsed, meta);
    if (row) rows.push(row);
  }
  rows.sort((a, b) => Date.parse(b.modified_at || b.created_at || 0) - Date.parse(a.modified_at || a.created_at || 0));
  return rows.slice(0, limit);
}

function summarizeEtherealPack(packDir, manifest, meta) {
  const file = (name) => path.join(packDir, name);
  const files = {
    manifest: file("ethereal-ai-link-policy.json"),
    powershell: file("ETHEREAL_AI_LINK.ps1"),
    readme: file("README.md"),
    validate_cmd: file("RUN_VALIDATION.cmd"),
    dry_run_cmd: file("RUN_AS_ADMIN_DRY_RUN.cmd"),
    apply_host_cmd: file("RUN_AS_ADMIN_APPLY_HOST.cmd"),
    apply_peer_cmd: file("RUN_AS_ADMIN_APPLY_PEER.cmd"),
    remove_cmd: file("RUN_AS_ADMIN_REMOVE_ETHEREAL_LINK.cmd"),
    socket_daemon: file("ETHEREAL_SOCKET.py"),
    socket_token: file("ETHEREAL_SOCKET_TOKEN.txt"),
    socket_server_host_cmd: file("RUN_SOCKET_SERVER_HOST.cmd"),
    socket_server_peer_cmd: file("RUN_SOCKET_SERVER_PEER.cmd"),
    socket_ping_host_cmd: file("RUN_SOCKET_PING_HOST.cmd"),
    create_token_cmd: file("RUN_CREATE_SOCKET_TOKEN.cmd"),
  };
  const file_status = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, {
    ...fileMeta(value),
    sha256: key === "socket_token" ? null : hashFileIfPresent(value),
  }]));
  const missing = Object.entries(file_status)
    .filter(([key, value]) => !value.exists && key !== "socket_token")
    .map(([key]) => key);
  const tokenPresent = file_status.socket_token.exists;
  return {
    exists: true,
    directory: packDir,
    manifest_path: files.manifest,
    manifest_modified_at: meta.modified_at,
    manifest_sha256: hashFileIfPresent(files.manifest),
    version: manifest?.version || null,
    created_at: manifest?.created_at || null,
    role: manifest?.role || null,
    config: manifest?.config || null,
    topology: manifest?.topology || null,
    storage_transport_strategy: manifest?.storage_transport_strategy || null,
    socket_daemon: manifest?.socket_daemon || null,
    advanced_capability_lanes: manifest?.advanced_capability_lanes || null,
    approval_required: manifest?.approval_required !== false,
    token_file_present: tokenPresent,
    token_file_shipped: false,
    file_status,
    missing,
    safe_commands: {
      dry_run: files.dry_run_cmd,
      validate: files.validate_cmd,
      apply_host: files.apply_host_cmd,
      apply_peer: files.apply_peer_cmd,
      rollback: files.remove_cmd,
      create_socket_token: files.create_token_cmd,
      socket_ping_host: files.socket_ping_host_cmd,
    },
  };
}

export async function getLatestEtherealLinkProof({ limit = 8 } = {}) {
  const packDir = path.join(DEFAULT_DATA_ROOT, "exports", "ethereal-ai-link");
  const manifestPath = path.join(packDir, "ethereal-ai-link-policy.json");
  const manifestMeta = fileMeta(manifestPath);
  const manifest = manifestMeta.exists ? await readJsonIfPresent(manifestPath) : null;
  const pack = manifest ? summarizeEtherealPack(packDir, manifest, manifestMeta) : {
    exists: false,
    directory: packDir,
    manifest_path: manifestPath,
    manifest_modified_at: null,
    missing: ["manifest"],
    approval_required: true,
    safe_commands: {},
  };
  const receipts = await latestEtherealReceipts(limit);
  const latestDoctor = receipts.find((row) => row.kind === "doctor") || null;
  const latestPackReceipt = receipts.find((row) => row.kind === "pack") || null;
  const status = pack.exists
    ? pack.missing.length
      ? "PACK_INCOMPLETE"
      : latestDoctor?.ok
        ? "PACK_READY_WITH_VERIFIED_DOCTOR"
        : "PACK_READY_VALIDATE_BEFORE_APPLY"
    : latestDoctor
      ? "DOCTOR_ONLY_NO_PACK"
      : "NO_ETHEREAL_PACK";
  return {
    ok: pack.exists && pack.missing.length === 0,
    version: `${ETHEREAL_LINK_VERSION}.latest`,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    status,
    found: pack.exists || receipts.length > 0,
    pack,
    latest_doctor: latestDoctor,
    latest_pack_receipt: latestPackReceipt,
    receipts,
    safety: {
      mutates_live_network: false,
      apply_requires_admin_script: true,
      token_file_shipped_in_portable: false,
      rollback_command: pack.safe_commands?.rollback || null,
      validation_command: pack.safe_commands?.validate || null,
      basic_install_independent: true,
    },
    recovery_action: pack.exists
      ? pack.missing.length
        ? `Regenerate the Ethereal AI Link pack; missing files: ${pack.missing.join(", ")}.`
        : "Run dry run and validation first. Apply Host/Peer scripts only on the intended machines as Administrator; use rollback command to remove ORANGEBOX network changes."
      : "Generate the Ethereal AI Link pack before attempting Advanced AI Computer direct-link setup.",
  };
}

export async function runEtherealLinkDoctor({
  writeReceipt: shouldWriteReceipt = false,
  deep = false,
  adapterAlias = "",
  subnet = "",
  hostIp = "",
  peerIp = "",
} = {}) {
  const config = etherealConfig({ adapterAlias, subnet, hostIp, peerIp });
  const adapterRead = await readEthernetAdapters();
  const advanced = await readAdvancedFabricCapabilities();
  const python = await readPythonStatus();
  const candidates = (adapterRead.adapters || []).filter(isLikelyWiredAdapter)
    .sort((a, b) => (b.LinkSpeedBits || 0) - (a.LinkSpeedBits || 0));
  const handshake = await runEtherealHandshake(config, deep);
  const packDir = path.join(DEFAULT_DATA_ROOT, "exports", "ethereal-ai-link");
  const packManifest = path.join(packDir, "ethereal-ai-link-policy.json");
  const packExists = fssync.existsSync(packManifest);
  const socketProbe = await probeEtherealSocket({ config, handshake, packDir, deep });
  const blockers = [];
  const warnings = [];
  if (adapterRead.status !== "READ" && adapterRead.status !== "FALLBACK_OS_INTERFACES") blockers.push("Could not read Windows Ethernet adapter inventory.");
  if (adapterRead.status === "FALLBACK_OS_INTERFACES") warnings.push("PowerShell adapter inventory failed; using OS interface fallback for read-only diagnosis.");
  if (!candidates.length && process.platform === "win32") blockers.push("No active physical wired Ethernet adapter candidates found.");
  if (candidates.length > 1 && !config.adapter_alias) blockers.push("Multiple wired adapters found; set ORANGEBOX_ETHEREAL_ADAPTER or pass --adapter=<alias> before applying.");
  if (!handshake.local_addresses.length) blockers.push(`No local adapter has an Ethereal subnet address (${config.subnet}.x) yet.`);
  if (handshake.local_addresses.length && !handshake.normal_ping.ok && !socketProbe.ok) blockers.push(`Peer ${handshake.remote_ip} did not answer normal ping or Ethereal socket.`);
  if (handshake.local_addresses.length && !handshake.normal_ping.ok && socketProbe.ok) warnings.push(`Peer ${handshake.remote_ip} blocks or ignores ICMP ping, but Ethereal socket is verified.`);
  if (deep && handshake.normal_ping.ok && !handshake.jumbo_ping.ok) warnings.push(`Peer ${handshake.remote_ip} did not answer jumbo no-fragment ping; MTU/offload path is not fully verified.`);
  if (deep && handshake.jumbo_ping?.stdout && /Packet needs to be fragmented/i.test(handshake.jumbo_ping.stdout)) warnings.push("Current MTU path is still 1500-class; jumbo frames are not active end-to-end.");
  const fastestCandidate = candidates[0];
  if (fastestCandidate?.LinkSpeedBits && fastestCandidate.LinkSpeedBits < 2_500_000_000) warnings.push(`Current Ethereal adapter link speed is ${fastestCandidate.LinkSpeed}; upgrade both sides/NIC negotiation for 2.5Gbps+.`);
  const status = handshake.jumbo_ping.ok
    ? "ETHEREAL_JUMBO_VERIFIED"
    : socketProbe.ok
      ? "ETHEREAL_SOCKET_VERIFIED"
    : handshake.normal_ping.ok
      ? "ETHEREAL_DIRECT_READY"
      : handshake.local_addresses.length
        ? "ETHEREAL_CONFIGURED_UNVERIFIED"
        : "ETHEREAL_UNCONFIGURED";
  const result = {
    ok: status === "ETHEREAL_JUMBO_VERIFIED" || status === "ETHEREAL_SOCKET_VERIFIED" || status === "ETHEREAL_DIRECT_READY" || packExists,
    version: ETHEREAL_LINK_VERSION,
    created_at: new Date().toISOString(),
    status,
    config,
    adapter_inventory: adapterRead,
    advanced_fabric_capabilities: advanced,
    ethereal_socket: {
      version: ETHEREAL_SOCKET_VERSION,
      port: ETHEREAL_SOCKET_PORT,
      python,
      purpose: "Authenticated raw TCP file pipe for AI-box file movement without SMB/File Explorer mounts.",
      probe: socketProbe,
    },
    candidates,
    handshake,
    pack: {
      directory: packDir,
      manifest: packManifest,
      exists: packExists,
    },
    safety: {
      mutates_live_network: false,
      apply_requires_admin_script: true,
      fail_safe_adapter_rule: "Generated installer refuses ambiguous adapters unless an adapter alias is provided.",
      no_default_gateway: true,
      nvmeof_default: "disabled_future_lab_only",
      rdma_default: "detect_and_report_only_consumer_nics_expected_unsupported",
    },
    blockers,
    warnings,
    next_action: packExists
      ? socketProbe.ok
        ? "Use the Ethereal socket for AI-box file movement; fix jumbo MTU only if large-transfer benchmarks justify it."
        : "Run the generated host/peer validation scripts, then apply only on the intended Ethernet adapters as Administrator."
      : "Generate the Ethereal AI Link direct-cable installer pack.",
  };
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result, "Ethereal AI Link doctor");
  return result;
}

function classifyActiveRoute(probes, hosts) {
  const verified = probes.filter((row) => row.status === "VERIFIED");
  if (hosts.ai_box_direct_ip && verified.some((row) => row.url.includes(hosts.ai_box_direct_ip))) {
    return "DIRECT_LINK_VERIFIED";
  }
  if (hosts.ai_box_lan_ip && verified.some((row) => row.url.includes(hosts.ai_box_lan_ip))) {
    return "ROUTER_LAN_VERIFIED";
  }
  if (hosts.ai_box_legacy_ip && verified.some((row) => row.url.includes(hosts.ai_box_legacy_ip))) {
    return "LEGACY_WIFI_VERIFIED";
  }
  if ((hosts.extra_ai_box_ips || []).some((ip) => verified.some((row) => row.url.includes(ip)))) {
    return "AI_BOX_EXTRA_VERIFIED";
  }
  return "AI_BOX_OFFLINE_OR_UNCONFIGURED";
}

function policySummary({ includeBrowsers = false, includeGameLaunchers = true, emergencyBlockLaunchers = false } = {}) {
  return {
    local_qos: [
      "Mark AI-box command/bridge/knowledge traffic with high DSCP priority where Windows and the router honor it.",
      "Optionally throttle known background launchers so they stop fighting the AI rail for outbound bandwidth.",
      "Optional browser guard exists, but should be used carefully because browser proof/research may need bandwidth.",
    ],
    limitations: [
      "Windows policy-based QoS is strongest for outbound/local app traffic. It does not perfectly police every inbound download on its own.",
      "Router-level QoS or DSCP honoring is required for strongest whole-network priority.",
      "Emergency firewall block mode can stop selected launchers, but it is deliberately opt-in and reversible.",
    ],
    generated_profiles: {
      ai_box_priority: true,
      throttle_game_launchers: !!includeGameLaunchers,
      throttle_browsers: !!includeBrowsers,
      emergency_block_launchers: !!emergencyBlockLaunchers,
    },
  };
}

async function writeReceipt(result, title = "AI Box Network Priority") {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-ai-box-network-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify({
    result: result.ok ? "VERIFIED" : "REVIEW_REQUIRED",
    evidence: result,
    blockers: result.blockers || [],
    next_action: result.next_action || "Review AI Box Network Priority status.",
  }, null, 2) + "\n", "utf8");
  return file;
}

export async function runAiBoxNetworkDoctor({
  writeReceipt: shouldWriteReceipt = false,
  deep = false,
} = {}) {
  const hosts = configuredHosts();
  const endpoints = endpointRows(hosts);
  const probes = await Promise.all(endpoints.map((row) => probe(row.url).then((result) => ({ ...row, ...result }))));
  const activeRoute = classifyActiveRoute(probes, hosts);
  const processes = deep ? await tasklistProcesses() : [];
  const qos = deep ? await readQosPolicies() : { status: "SKIPPED_FAST_DOCTOR", policies: [] };
  const hogNames = new Set([...BACKGROUND_LAUNCHERS, ...BROWSER_GUARD].map((row) => row.process.toLowerCase()));
  const observedHogs = processes
    .filter((row) => hogNames.has(String(row.image || "").toLowerCase()))
    .map((row) => ({ image: row.image, pid: row.pid }));
  const configured = Boolean(hosts.ai_box_direct_ip || hosts.ai_box_lan_ip || hosts.ai_box_legacy_ip || (hosts.extra_ai_box_ips || []).length);
  const aiBoxVerified = activeRoute !== "AI_BOX_OFFLINE_OR_UNCONFIGURED";
  const packDir = path.join(DEFAULT_DATA_ROOT, "exports", "ai-box-network-priority");
  const packManifest = path.join(packDir, "ai-box-network-policy.json");
  const packExists = fssync.existsSync(packManifest);
  let packPolicy = null;
  if (packExists) {
    try {
      packPolicy = JSON.parse(await fs.readFile(packManifest, "utf8"));
    } catch {}
  }
  const blockers = [];
  if (!configured) blockers.push("No ORANGEBOX_AI_BOX_DIRECT_IP, ORANGEBOX_AI_BOX_IP, or ORANGEBOX_AI_BOX_LEGACY_IP is configured.");
  if (configured && !aiBoxVerified) blockers.push("AI box endpoints are configured but no command/bridge/knowledge endpoint verified.");
  if (!packExists) blockers.push("AI Box Network Priority pack has not been generated yet.");
  const result = {
    ok: configured && (aiBoxVerified || packExists),
    version: AI_BOX_NETWORK_VERSION,
    created_at: new Date().toISOString(),
    status: aiBoxVerified ? "AI_BOX_PRIORITY_ROUTE_VERIFIED" : configured ? "AI_BOX_CONFIGURED_UNVERIFIED" : "AI_BOX_UNCONFIGURED",
    active_route: activeRoute,
    hosts,
    see_suite_addresses: networkAddresses(),
    endpoints,
    probes,
    qos_policy_store: qos,
    observed_background_hogs: observedHogs,
    pack: {
      directory: packDir,
      manifest: packManifest,
      exists: packExists,
    },
    policy: packPolicy?.summary || policySummary(),
    blockers,
    next_action: aiBoxVerified
      ? "Generate/apply the policy pack if background traffic is still stealing bandwidth."
      : configured
        ? "Generate the pack, apply on the right machine as Administrator, then rerun doctor with --deep."
        : "Set AI Box direct/LAN IPs, then generate the AI Box Network Priority pack.",
  };
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result);
  return result;
}

function psArray(values) {
  return "@(" + values.map((value) => `"${String(value).replace(/"/g, "`\"")}"`).join(", ") + ")";
}

function policyScript({
  hosts,
  ports = DEFAULT_AI_BOX_PORTS,
  includeBrowsers = false,
  includeGameLaunchers = true,
  emergencyBlockLaunchers = false,
}) {
  const targetIps = uniq([hosts.ai_box_direct_ip, hosts.ai_box_lan_ip, hosts.ai_box_legacy_ip, ...(hosts.extra_ai_box_ips || [])]);
  const throttleApps = [
    ...(includeGameLaunchers ? BACKGROUND_LAUNCHERS : []),
    ...(includeBrowsers ? BROWSER_GUARD : []),
  ];
  const blockApps = emergencyBlockLaunchers ? BACKGROUND_LAUNCHERS : [];
  return String.raw`# ORANGEBOX AI Box Network Priority
# Generated ${new Date().toISOString()}
# This script is idempotent and reversible. It only applies when -Apply or -Remove is provided.

[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Remove,
  [switch]$ThrottleBrowsers,
  [switch]$ThrottleGameLaunchers,
  [switch]$EmergencyBlockLaunchers,
  [int]$BrowserThrottleMbps = 8,
  [int]$LauncherThrottleMbps = 1
)

$ErrorActionPreference = "Stop"
$PolicyPrefix = "${POLICY_PREFIX}"
$TargetIps = ${psArray(targetIps)}
$AiBoxPorts = @(${ports.map((port) => Number(port)).join(", ")})
$ThrottleApps = @(
${throttleApps.map((app) => `  @{ Name = "${app.name}"; Process = "${app.process}"; Mbps = ${app.throttle_mbps} }`).join("\n")}
)
$EmergencyBlockApps = @(
${blockApps.map((app) => `  @{ Name = "${app.name}"; Process = "${app.process}" }`).join("\n")}
)

function Assert-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script as Administrator."
  }
}

function Remove-OrangeBoxPolicies {
  Get-NetQosPolicy -PolicyStore ActiveStore -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "$PolicyPrefix*" } |
    ForEach-Object {
      Write-Host "Removing QoS policy $($_.Name)"
      Remove-NetQosPolicy -Name $_.Name -Confirm:$false -ErrorAction SilentlyContinue
    }
  Get-NetFirewallRule -ErrorAction SilentlyContinue |
    Where-Object { $_.DisplayName -like "$PolicyPrefix*" } |
    ForEach-Object {
      Write-Host "Removing firewall rule $($_.DisplayName)"
      Remove-NetFirewallRule -Name $_.Name -ErrorAction SilentlyContinue
    }
}

function Add-AiBoxPriority {
  foreach ($ip in $TargetIps) {
    if ([string]::IsNullOrWhiteSpace($ip)) { continue }
    foreach ($port in $AiBoxPorts) {
      $name = "$PolicyPrefix-Priority-$($ip.Replace('.', '-'))-$port"
      Write-Host "Adding priority QoS $name -> $($ip):$port"
      New-NetQosPolicy -Name $name -PolicyStore ActiveStore -IPDstPrefixMatchCondition "$ip/32" -IPProtocolMatchCondition TCP -IPPortMatchCondition $port -DSCPAction 46 -NetworkProfile All -ErrorAction SilentlyContinue | Out-Null
    }
  }
}

function Add-AppThrottle {
  param([object[]]$Apps)
  foreach ($app in $Apps) {
    if (-not $app.Process) { continue }
    $bps = [UInt64]($app.Mbps * 1000 * 1000)
    $name = "$PolicyPrefix-Throttle-$($app.Process.Replace('.', '-'))"
    Write-Host "Adding throttle QoS $name -> $($app.Process) at $($app.Mbps) Mbps"
    New-NetQosPolicy -Name $name -PolicyStore ActiveStore -AppPathNameMatchCondition $app.Process -ThrottleRateActionBitsPerSecond $bps -NetworkProfile All -ErrorAction SilentlyContinue | Out-Null
  }
}

function Find-AppPath {
  param([string]$ProcessName)
  $programFilesX86 = [Environment]::GetFolderPath("ProgramFilesX86")
  $candidates = @(
    "$env:ProgramFiles\*\$ProcessName",
    "$programFilesX86\*\$ProcessName",
    "$env:LOCALAPPDATA\Programs\*\$ProcessName",
    "$env:LOCALAPPDATA\*\$ProcessName"
  )
  foreach ($candidate in $candidates) {
    $found = Get-ChildItem -Path $candidate -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) { return $found.FullName }
  }
  return $null
}

function Add-EmergencyBlocks {
  foreach ($app in $EmergencyBlockApps) {
    $program = Find-AppPath -ProcessName $app.Process
    if (-not $program) {
      Write-Host "No program path found for $($app.Process); skipping firewall block"
      continue
    }
    $name = "$PolicyPrefix-Block-$($app.Process.Replace('.', '-'))"
    Write-Host "Adding reversible firewall block $name -> $program"
    New-NetFirewallRule -DisplayName $name -Direction Outbound -Action Block -Program $program -Profile Any -ErrorAction SilentlyContinue | Out-Null
  }
}

if (-not $Apply -and -not $Remove) {
  Write-Host "Dry run only. Use -Apply to apply or -Remove to remove ORANGEBOX AI Box policies."
  Write-Host "Targets: $($TargetIps -join ', ')"
  Write-Host "Ports: $($AiBoxPorts -join ', ')"
  Write-Host "Throttle apps staged: $($ThrottleApps.Count)"
  Write-Host "Emergency block apps staged: $($EmergencyBlockApps.Count)"
  exit 0
}

Assert-Admin

if ($Remove) {
  Remove-OrangeBoxPolicies
  Write-Host "ORANGEBOX AI Box network policies removed."
  exit 0
}

Remove-OrangeBoxPolicies
Add-AiBoxPriority
if ($ThrottleGameLaunchers -or ${includeGameLaunchers ? "$true" : "$false"}) { Add-AppThrottle -Apps ($ThrottleApps | Where-Object { $_.Name -notmatch "Chrome|Edge|Firefox|Brave" }) }
if ($ThrottleBrowsers -or ${includeBrowsers ? "$true" : "$false"}) { Add-AppThrottle -Apps ($ThrottleApps | Where-Object { $_.Name -match "Chrome|Edge|Firefox|Brave" }) }
if ($EmergencyBlockLaunchers -or ${emergencyBlockLaunchers ? "$true" : "$false"}) { Add-EmergencyBlocks }
Write-Host "ORANGEBOX AI Box network priority applied. Rerun: obx network doctor --deep"
`;
}

function etherealPsBool(value) {
  return value ? "$true" : "$false";
}

function etherealInstallerScript({ config }) {
  return String.raw`# ORANGEBOX Ethereal AI Link
# Generated ${new Date().toISOString()}
# Direct-cable AI highway installer. Idempotent, explicit, and reversible.

[CmdletBinding()]
param(
  [switch]$Apply,
  [switch]$Remove,
  [switch]$Validate,
  [ValidateSet("Host","Peer")]
  [string]$Role = "Host",
  [string]$AdapterAlias = "${config.adapter_alias}",
  [string]$LinkName = "Ethereal-Link",
  [string]$HostIp = "${config.host_ip}",
  [string]$PeerIp = "${config.peer_ip}",
  [int]$PrefixLength = ${config.prefix_length},
  [int]$MtuBytes = ${config.mtu_bytes},
  [int]$PingPayloadBytes = ${config.ping_payload_bytes},
  [ValidateSet("None","Auto","NVMeTCP","SMB","TCP")]
  [string]$StorageMode = "None",
  [string]$StorageShareName = "OrangeBoxAI",
  [string]$StorageSharePath = "C:\OrangeBoxAI-Share",
  [string]$StorageDriveLetter = "O:",
  [string]$NvmeTargetAddress = "",
  [string]$NvmeTargetNqn = "",
  [string]$NvmeHostNqn = "",
  [switch]$OpenSocketPort,
  [switch]$SkipRename,
  [switch]$EnableTcpDatacenter
)

$ErrorActionPreference = "Stop"
$PolicyPrefix = "${ETHEREAL_POLICY_PREFIX}"

function Assert-Admin {
  $current = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($current)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script as Administrator for Apply/Remove."
  }
}

function Get-LinkSpeedBits {
  param([string]$Speed)
  if (-not $Speed) { return 0 }
  if ($Speed -match '([\d.]+)\s*Gbps') { return [double]$Matches[1] * 1000000000 }
  if ($Speed -match '([\d.]+)\s*Mbps') { return [double]$Matches[1] * 1000000 }
  if ($Speed -match '([\d.]+)\s*Kbps') { return [double]$Matches[1] * 1000 }
  return 0
}

function Get-EtherealAdapter {
  if ($AdapterAlias) {
    $adapter = Get-NetAdapter -Name $AdapterAlias -ErrorAction Stop
    if ($adapter.Status -ne "Up") { throw "Adapter '$AdapterAlias' is not Up." }
    return $adapter
  }
  $candidates = Get-NetAdapter -Physical | Where-Object {
    $_.Status -eq "Up" -and
    $_.InterfaceDescription -notmatch "Wi-?Fi|Wireless|Bluetooth|Virtual|Hyper-V|TAP|VPN|WAN Miniport" -and
    $_.Name -notmatch "Wi-?Fi|Wireless|Bluetooth|Virtual|Hyper-V|TAP|VPN|WAN Miniport"
  } | Sort-Object @{ Expression = { Get-LinkSpeedBits $_.LinkSpeed }; Descending = $true }
  if ($candidates.Count -eq 0) { throw "No active physical wired adapter candidates found." }
  if ($candidates.Count -gt 1) {
    $list = ($candidates | ForEach-Object { "$($_.Name) [$($_.InterfaceDescription)] $($_.LinkSpeed)" }) -join "; "
    throw "Multiple wired adapters found. Re-run with -AdapterAlias '<exact adapter name>'. Candidates: $list"
  }
  return $candidates[0]
}

function Try-SetAdvancedProperty {
  param([string]$Name, [string[]]$DisplayNames, [string[]]$DisplayValues)
  foreach ($displayName in $DisplayNames) {
    $prop = Get-NetAdapterAdvancedProperty -Name $Name -DisplayName $displayName -ErrorAction SilentlyContinue
    if (-not $prop) { continue }
    foreach ($value in $DisplayValues) {
      try {
        Set-NetAdapterAdvancedProperty -Name $Name -DisplayName $displayName -DisplayValue $value -NoRestart -ErrorAction Stop
        Write-Host "Set $displayName = $value"
        return $true
      } catch { }
    }
  }
  Write-Host "Advanced property unavailable or unsupported: $($DisplayNames -join ', ')"
  return $false
}

function Apply-EtherealLink {
  Assert-Admin
  $adapter = Get-EtherealAdapter
  $targetName = if ($SkipRename) { $adapter.Name } else { $LinkName }
  if (-not $SkipRename -and $adapter.Name -ne $LinkName) {
    Write-Host "Renaming adapter '$($adapter.Name)' to '$LinkName'"
    Rename-NetAdapter -Name $adapter.Name -NewName $LinkName -ErrorAction Stop
  }
  $ip = if ($Role -eq "Host") { $HostIp } else { $PeerIp }
  $remote = if ($Role -eq "Host") { $PeerIp } else { $HostIp }
  Get-NetIPAddress -InterfaceAlias $targetName -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $ip -or $_.IPAddress -like "${config.subnet}.*" } |
    Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Assigning $ip/$PrefixLength to $targetName with no gateway"
  New-NetIPAddress -InterfaceAlias $targetName -IPAddress $ip -PrefixLength $PrefixLength -ErrorAction Stop | Out-Null
  Set-DnsClient -InterfaceAlias $targetName -RegisterThisConnectionsAddress $false -ErrorAction SilentlyContinue

  Write-Host "Setting MTU to $MtuBytes"
  try { Set-NetIPInterface -InterfaceAlias $targetName -NlMtuBytes $MtuBytes -ErrorAction Stop | Out-Null } catch { Write-Host "Set-NetIPInterface MTU failed: $($_.Exception.Message)" }
  Try-SetAdvancedProperty -Name $targetName -DisplayNames @("Jumbo Packet","Jumbo Frame","Jumbo Frames") -DisplayValues @("$MtuBytes Bytes","9KB MTU","9014 Bytes","9000 Bytes","Enabled") | Out-Null
  Try-SetAdvancedProperty -Name $targetName -DisplayNames @("Large Send Offload V2 (IPv4)","Large Send Offload (IPv4)","Large Send Offload v2 IPv4") -DisplayValues @("Enabled","On") | Out-Null
  Try-SetAdvancedProperty -Name $targetName -DisplayNames @("Large Send Offload V2 (IPv6)","Large Send Offload (IPv6)","Large Send Offload v2 IPv6") -DisplayValues @("Enabled","On") | Out-Null
  Try-SetAdvancedProperty -Name $targetName -DisplayNames @("TCP Checksum Offload (IPv4)","IPv4 Checksum Offload","Checksum Offload") -DisplayValues @("Rx & Tx Enabled","Enabled","On") | Out-Null
  Try-SetAdvancedProperty -Name $targetName -DisplayNames @("TCP Checksum Offload (IPv6)","IPv6 Checksum Offload") -DisplayValues @("Rx & Tx Enabled","Enabled","On") | Out-Null
  try { Enable-NetAdapterRss -Name $targetName -ErrorAction Stop | Out-Null; Write-Host "RSS enabled" } catch { Write-Host "RSS unavailable: $($_.Exception.Message)" }
  if ($EnableTcpDatacenter -or ${etherealPsBool(config.tcp_datacenter_mode)}) {
    try {
      Set-NetTCPSetting -SettingName DatacenterCustom -AutoTuningLevelLocal Experimental -ErrorAction Stop | Out-Null
      Write-Host "DatacenterCustom TCP autotuning set to Experimental"
    } catch { Write-Host "TCP DatacenterCustom tuning unavailable: $($_.Exception.Message)" }
  }
  if ($OpenSocketPort) {
    $ruleName = "$PolicyPrefix-Socket-9999"
    if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
      New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -LocalPort ${ETHEREAL_SOCKET_PORT} -Protocol TCP -Action Allow -Profile Any | Out-Null
      Write-Host "Opened inbound Ethereal Socket port ${ETHEREAL_SOCKET_PORT}"
    }
  }
  Write-Host "Ethereal Link apply complete. Validate peer: $remote"
}

function Show-StorageTransportCapabilities {
  $nvme = Get-Command nvmeofutil.exe -ErrorAction SilentlyContinue
  $client = Get-SmbClientConfiguration -ErrorAction SilentlyContinue
  $server = Get-SmbServerConfiguration -ErrorAction SilentlyContinue
  $channels = Get-SmbMultichannelConnection -ErrorAction SilentlyContinue
  [pscustomobject]@{
    nvmeofutil = if ($nvme) { $nvme.Source } else { $null }
    smb_client_multichannel = if ($client) { $client.EnableMultiChannel } else { $null }
    smb_server_multichannel = if ($server) { $server.EnableMultiChannel } else { $null }
    active_smb_channels = if ($channels) { @($channels).Count } else { 0 }
    selected_storage_mode = $StorageMode
  } | Format-List
}

function Enable-SmbMultichannelSafe {
  try { Set-SmbClientConfiguration -EnableMultiChannel $true -Confirm:$false -ErrorAction Stop | Out-Null; Write-Host "SMB client multichannel enabled" } catch { Write-Host "SMB client multichannel not changed: $($_.Exception.Message)" }
  try { Set-SmbServerConfiguration -EnableMultiChannel $true -Force -ErrorAction Stop | Out-Null; Write-Host "SMB server multichannel enabled" } catch { Write-Host "SMB server multichannel not changed: $($_.Exception.Message)" }
}

function Prepare-SmbHostShare {
  Assert-Admin
  Enable-SmbMultichannelSafe
  if (-not (Test-Path -LiteralPath $StorageSharePath)) {
    New-Item -ItemType Directory -Path $StorageSharePath -Force | Out-Null
    Write-Host "Created AI storage share path: $StorageSharePath"
  }
  $existing = Get-SmbShare -Name $StorageShareName -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "SMB share already exists: \\$env:COMPUTERNAME\$StorageShareName"
  } else {
    New-SmbShare -Name $StorageShareName -Path $StorageSharePath -ChangeAccess $env:USERNAME -CachingMode None -ErrorAction Stop | Out-Null
    Write-Host "Created SMB share: \\$env:COMPUTERNAME\$StorageShareName"
  }
}

function Connect-SmbPeerMapping {
  Assert-Admin
  Enable-SmbMultichannelSafe
  $remote = if ($Role -eq "Host") { $PeerIp } else { $HostIp }
  $remotePath = "\\$remote\$StorageShareName"
  $existing = Get-SmbMapping -LocalPath $StorageDriveLetter -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Host "SMB mapping already exists at $StorageDriveLetter"
    return
  }
  Write-Host "Creating SMB mapping $StorageDriveLetter -> $remotePath"
  New-SmbMapping -LocalPath $StorageDriveLetter -RemotePath $remotePath -Persistent $true -ErrorAction Stop | Out-Null
}

function Try-NvmeTcpHandshake {
  $nvme = Get-Command nvmeofutil.exe -ErrorAction SilentlyContinue
  if (-not $nvme) {
    Write-Host "Tier 1 NVMe/TCP unavailable: nvmeofutil.exe not found."
    return $false
  }
  Write-Host "Tier 1 NVMe/TCP tool observed: $($nvme.Source)"
  if (-not $NvmeTargetAddress -or -not $NvmeTargetNqn) {
    Write-Host "NVMe/TCP target address/NQN not provided. Falling back without attempting block-device attach."
    return $false
  }
  Write-Host "NVMe/TCP explicit target provided. This pack does not guess vendor-specific namespace/controller arguments."
  Write-Host "Run nvmeofutil.exe help on this build and bind target: $NvmeTargetAddress / $NvmeTargetNqn after storage proof."
  return $false
}

function Apply-StorageFallback {
  if ($StorageMode -eq "None") { return }
  Show-StorageTransportCapabilities
  if ($StorageMode -eq "NVMeTCP") {
    if (-not (Try-NvmeTcpHandshake)) { throw "NVMeTCP requested but not connected. Use Auto for fallback." }
    return
  }
  if ($StorageMode -eq "SMB") {
    if ($Role -eq "Host") { Prepare-SmbHostShare } else { Connect-SmbPeerMapping }
    return
  }
  if ($StorageMode -eq "TCP") {
    Write-Host "Raw TCP safety net selected: direct-link IP/MTU/offload settings are the storage transport base."
    return
  }
  if ($StorageMode -eq "Auto") {
    if (Try-NvmeTcpHandshake) { return }
    try {
      if ($Role -eq "Host") { Prepare-SmbHostShare } else { Connect-SmbPeerMapping }
      Write-Host "Tier 2 SMB Multichannel path prepared."
      return
    } catch {
      Write-Host "Tier 2 SMB fallback failed: $($_.Exception.Message)"
    }
    Write-Host "Tier 3 raw TCP safety net remains active."
  }
}

function Remove-EtherealLink {
  Assert-Admin
  $name = if ($AdapterAlias) { $AdapterAlias } else { $LinkName }
  $adapter = Get-NetAdapter -Name $name -ErrorAction SilentlyContinue
  if (-not $adapter) { Write-Host "Adapter '$name' not found; nothing to remove."; return }
  Get-NetIPAddress -InterfaceAlias $name -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -eq $HostIp -or $_.IPAddress -eq $PeerIp -or $_.IPAddress -like "${config.subnet}.*" } |
    Remove-NetIPAddress -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed Ethereal subnet addresses from $name. Advanced NIC properties were not blindly reverted."
}

function Validate-EtherealLink {
  $localIps = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -eq $HostIp -or $_.IPAddress -eq $PeerIp -or $_.IPAddress -like "${config.subnet}.*" }
  $roleNow = if ($localIps.IPAddress -contains $HostIp) { "Host" } elseif ($localIps.IPAddress -contains $PeerIp) { "Peer" } else { "Unknown" }
  $remote = if ($roleNow -eq "Host") { $PeerIp } elseif ($roleNow -eq "Peer") { $HostIp } else { if ($Role -eq "Host") { $PeerIp } else { $HostIp } }
  Write-Host "Local role: $roleNow"
  Write-Host "Remote peer: $remote"
  Write-Host "Normal ping:"
  ping $remote -n 1
  Write-Host "Jumbo no-fragment ping:"
  ping $remote -n 1 -f -l $PingPayloadBytes
  Write-Host "Adapter snapshot:"
  Get-NetAdapter | Where-Object { $_.Name -eq $LinkName -or $_.Name -eq $AdapterAlias } | Format-List Name,InterfaceDescription,Status,LinkSpeed,MacAddress
  Write-Host "Storage transport capabilities:"
  Show-StorageTransportCapabilities
}

if (-not $Apply -and -not $Remove -and -not $Validate) {
  Write-Host "Dry run only. Use -Apply, -Validate, or -Remove."
  Write-Host "Role: $Role"
  Write-Host "AdapterAlias: $AdapterAlias"
  Write-Host "HostIp: $HostIp"
  Write-Host "PeerIp: $PeerIp"
  Write-Host "MTU: $MtuBytes"
  Write-Host "Candidates:"
  Get-NetAdapter -Physical | Sort-Object LinkSpeed -Descending | Format-Table Name,InterfaceDescription,Status,LinkSpeed,MacAddress -AutoSize
  exit 0
}

if ($Apply) { Apply-EtherealLink; Apply-StorageFallback }
if ($Validate) { Validate-EtherealLink }
if ($Remove) { Remove-EtherealLink }
`;
}

function etherealReadme({ config }) {
  return `# ORANGEBOX Ethereal AI Link

Ethereal AI Link is the direct-cable setup pack for networked AI boxes.

It turns a Cat 8/Ethernet cable into a dedicated AI highway by configuring the two specific wired adapters with:

- isolated static subnet
- no default gateway on the direct link
- jumbo MTU target
- Receive Side Scaling when available
- Large Send Offload / checksum offload when the NIC exposes those properties
- peer validation with normal ping and jumbo no-fragment ping

## Default roles

- Host / larger AI box: ${config.host_ip}/${config.prefix_length}
- Peer / operator box: ${config.peer_ip}/${config.prefix_length}
- Subnet: ${config.subnet}.x
- MTU target: ${config.mtu_bytes}
- Jumbo ping payload: ${config.ping_payload_bytes}

## Apply

Run the matching command as Administrator on each machine:

\`\`\`powershell
RUN_AS_ADMIN_APPLY_HOST.cmd
RUN_AS_ADMIN_APPLY_PEER.cmd
\`\`\`

If there is more than one wired adapter, the script refuses to guess. Re-run manually with:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\ETHEREAL_AI_LINK.ps1 -Apply -Role Host -AdapterAlias "Exact Ethernet Name"
\`\`\`

## Validate

\`\`\`powershell
RUN_VALIDATION.cmd
\`\`\`

## Remove

\`\`\`powershell
RUN_AS_ADMIN_REMOVE_ETHEREAL_LINK.cmd
\`\`\`

Remove only clears Ethereal subnet addresses. It does not blindly revert advanced NIC properties because vendors expose different names and prior values.

## Storage transport cascade

The pack also includes storage-aware apply commands:

\`\`\`powershell
RUN_AS_ADMIN_APPLY_HOST_WITH_STORAGE_AUTO.cmd
RUN_AS_ADMIN_APPLY_PEER_WITH_STORAGE_AUTO.cmd
\`\`\`

Auto mode attempts the best available transport in this order:

1. **NVMe/TCP**: requires nvmeofutil.exe and explicit target address/NQN. The script detects support and refuses to invent block-device parameters.
2. **SMB Multichannel**: enables SMB Multichannel, creates/maps the OrangeBoxAI share, and uses the direct-link IP.
3. **Raw TCP**: keeps the isolated jumbo/offload direct link as the safe baseline.

SMB host default path: C:\\OrangeBoxAI-Share
SMB peer default drive: O:

## Ethereal Socket Daemon

The pack includes a standard-library Python daemon for selling this as an OS-independent data plane:

- raw TCP on port ${ETHEREAL_SOCKET_PORT}
- token-authenticated control messages
- allow-listed root folder only
- GET, PUT, LIST, STAT, PING protocol
- socket.sendfile() when the OS supports it
- buffered fallback everywhere
- SHA-256 transfer receipts

Create the socket token once, then copy ETHEREAL_SOCKET_TOKEN.txt to the other machine:

\`\`\`powershell
RUN_CREATE_SOCKET_TOKEN.cmd
copy ETHEREAL_SOCKET_TOKEN.txt \\OTHER-MACHINE\path\to\ethereal-ai-link\
\`\`\`

Start a server on the host:

\`\`\`powershell
RUN_SOCKET_SERVER_HOST.cmd
\`\`\`

Start a server on the peer:

\`\`\`powershell
RUN_SOCKET_SERVER_PEER.cmd
\`\`\`

From another machine, use:

\`\`\`powershell
python ETHEREAL_SOCKET.py get --host 10.0.99.1 --token-file ETHEREAL_SOCKET_TOKEN.txt models\\file.bin C:\\Local\\file.bin
python ETHEREAL_SOCKET.py put --host 10.0.99.1 --token-file ETHEREAL_SOCKET_TOKEN.txt C:\\Local\\file.bin inbound\\file.bin
\`\`\`

This avoids Windows drive mounting entirely. It is not a replacement for every filesystem workflow; it is the narrow high-speed pipe for large AI artifacts.

## Future capability lanes

These are intentionally not enabled by default:

- RDMA / RoCE: enterprise-grade direct-memory networking. Report/detect only unless NICs prove support.
- NVMe-oF / NVMe over TCP: useful when a true shared storage target is intentionally built. Not part of the default path because it changes the storage trust and failure model.

The direct-link baseline is the product path: stable topology first, exotic fabrics only after hardware proof.
`;
}

export async function buildEtherealLinkPack({
  role = "both",
  adapterAlias = "",
  subnet = "",
  hostIp = "",
  peerIp = "",
  tcpDatacenterMode = false,
  storageMode = "None",
  storageShareName = "OrangeBoxAI",
  storageSharePath = "C:\\OrangeBoxAI-Share",
  storageDriveLetter = "O:",
  writeReceipt: shouldWriteReceipt = false,
} = {}) {
  const config = etherealConfig({ adapterAlias, subnet, hostIp, peerIp, tcpDatacenterMode });
  const packDir = path.join(DEFAULT_DATA_ROOT, "exports", "ethereal-ai-link");
  await fs.mkdir(packDir, { recursive: true });
  const socketSource = path.join(ROOT, "scripts", "v4", "ethereal-socket.py");
  const socketTokenFile = path.join(packDir, "ETHEREAL_SOCKET_TOKEN.txt");
  let socketToken = "";
  try {
    socketToken = (await fs.readFile(socketTokenFile, "utf8")).trim();
  } catch {
    socketToken = crypto.randomBytes(32).toString("base64url");
    await fs.writeFile(socketTokenFile, socketToken + "\n", "utf8");
  }
  const policy = {
    version: ETHEREAL_LINK_VERSION,
    created_at: new Date().toISOString(),
    policy_prefix: ETHEREAL_POLICY_PREFIX,
    role,
    config,
    topology: {
      recommended: "GTi15 port 1 to router for internet; GTi15 port 2 direct Cat 8 to N150 Ethernet for AI traffic.",
      no_default_gateway_on_direct_link: true,
      router_bypass: true,
      expected_ceiling: "limited by the slower NIC and adapter settings; N150 2.5GbE makes the direct pipe at most 2.5Gbps even if the GTi15 port is 10GbE",
    },
    storage_transport_strategy: {
      selected_default: storageMode,
      cascade: [
        {
          tier: 1,
          name: "NVMe/TCP",
          check: "nvmeofutil.exe exists and explicit target address/NQN are provided",
          action: "detect and require explicit target proof before block-device attach",
        },
        {
          tier: 2,
          name: "SMB Multichannel",
          check: "SMB client/server multichannel commands exist",
          action: "host can create OrangeBoxAI share; peer can map it over the direct-link IP",
        },
        {
          tier: 3,
          name: "Raw TCP with jumbo/offload tuning",
          check: "direct-link ping works",
          action: "use the isolated direct cable as the safe baseline transport",
        },
      ],
      smb_defaults: {
        share_name: storageShareName,
        share_path: storageSharePath,
        drive_letter: storageDriveLetter,
      },
    },
    socket_daemon: {
      version: ETHEREAL_SOCKET_VERSION,
      port: ETHEREAL_SOCKET_PORT,
      default_host_root: "%USERPROFILE%\\OrangeBox-Ethereal-Share",
      default_peer_root: "%USERPROFILE%\\OrangeBox-Ethereal-Inbox",
      token_file: "ETHEREAL_SOCKET_TOKEN.txt",
      token_value_not_in_manifest: true,
      protocol: ["ping", "list", "stat", "get", "put"],
      send_path: "socket.sendfile when available, buffered fallback otherwise",
    },
    advanced_capability_lanes: {
      rdma_roce: {
        default: "detect_only",
        why_not_default: "consumer Realtek/Intel NICs usually do not expose reliable RDMA/RoCE support",
        future_use: "enable only on proven RDMA-capable NICs/switching with lossless Ethernet configuration",
      },
      nvme_over_tcp: {
        default: "disabled_lab_lane",
        why_not_default: "storage fabric changes trust, corruption, lock, and recovery behavior; not vital for AI-box command traffic",
        future_use: "optional shared model/dataset storage target after backup and failure-mode tests",
      },
    },
    approval_required: true,
    approval_reason: "Applies Windows adapter/IP/MTU/offload settings and must be run explicitly as Administrator on each machine.",
  };
  const files = {
    manifest: path.join(packDir, "ethereal-ai-link-policy.json"),
    powershell: path.join(packDir, "ETHEREAL_AI_LINK.ps1"),
    socket_daemon: path.join(packDir, "ETHEREAL_SOCKET.py"),
    socket_token: socketTokenFile,
    dry_run_cmd: path.join(packDir, "RUN_AS_ADMIN_DRY_RUN.cmd"),
    apply_host_cmd: path.join(packDir, "RUN_AS_ADMIN_APPLY_HOST.cmd"),
    apply_peer_cmd: path.join(packDir, "RUN_AS_ADMIN_APPLY_PEER.cmd"),
    apply_host_storage_auto_cmd: path.join(packDir, "RUN_AS_ADMIN_APPLY_HOST_WITH_STORAGE_AUTO.cmd"),
    apply_peer_storage_auto_cmd: path.join(packDir, "RUN_AS_ADMIN_APPLY_PEER_WITH_STORAGE_AUTO.cmd"),
    validate_cmd: path.join(packDir, "RUN_VALIDATION.cmd"),
    remove_cmd: path.join(packDir, "RUN_AS_ADMIN_REMOVE_ETHEREAL_LINK.cmd"),
    socket_server_host_cmd: path.join(packDir, "RUN_SOCKET_SERVER_HOST.cmd"),
    socket_server_peer_cmd: path.join(packDir, "RUN_SOCKET_SERVER_PEER.cmd"),
    socket_ping_host_cmd: path.join(packDir, "RUN_SOCKET_PING_HOST.cmd"),
    socket_help_cmd: path.join(packDir, "RUN_SOCKET_HELP.cmd"),
    socket_create_token_cmd: path.join(packDir, "RUN_CREATE_SOCKET_TOKEN.cmd"),
    readme: path.join(packDir, "README.md"),
  };
  await fs.writeFile(files.manifest, JSON.stringify(policy, null, 2) + "\n", "utf8");
  await fs.writeFile(files.powershell, etherealInstallerScript({ config }), "utf8");
  await fs.copyFile(socketSource, files.socket_daemon);
  await fs.writeFile(files.dry_run_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0ETHEREAL_AI_LINK.ps1\"\r\npause\r\n", "utf8");
  await fs.writeFile(files.apply_host_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0ETHEREAL_AI_LINK.ps1\" -Apply -Role Host -OpenSocketPort\r\npause\r\n", "utf8");
  await fs.writeFile(files.apply_peer_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0ETHEREAL_AI_LINK.ps1\" -Apply -Role Peer -OpenSocketPort\r\npause\r\n", "utf8");
  await fs.writeFile(files.apply_host_storage_auto_cmd, `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ETHEREAL_AI_LINK.ps1" -Apply -Role Host -OpenSocketPort -StorageMode Auto -StorageShareName "${storageShareName}" -StorageSharePath "${storageSharePath}" -StorageDriveLetter "${storageDriveLetter}"\r\npause\r\n`, "utf8");
  await fs.writeFile(files.apply_peer_storage_auto_cmd, `@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ETHEREAL_AI_LINK.ps1" -Apply -Role Peer -OpenSocketPort -StorageMode Auto -StorageShareName "${storageShareName}" -StorageSharePath "${storageSharePath}" -StorageDriveLetter "${storageDriveLetter}"\r\npause\r\n`, "utf8");
  await fs.writeFile(files.validate_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0ETHEREAL_AI_LINK.ps1\" -Validate\r\npause\r\n", "utf8");
  await fs.writeFile(files.remove_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0ETHEREAL_AI_LINK.ps1\" -Remove\r\npause\r\n", "utf8");
  await fs.writeFile(files.socket_server_host_cmd, `@echo off\r\nif not exist "%USERPROFILE%\\OrangeBox-Ethereal-Share" mkdir "%USERPROFILE%\\OrangeBox-Ethereal-Share"\r\npython "%~dp0ETHEREAL_SOCKET.py" serve --host ${config.host_ip} --port ${ETHEREAL_SOCKET_PORT} --root "%USERPROFILE%\\OrangeBox-Ethereal-Share" --token-file "%~dp0ETHEREAL_SOCKET_TOKEN.txt" --allow-put\r\npause\r\n`, "utf8");
  await fs.writeFile(files.socket_server_peer_cmd, `@echo off\r\nif not exist "%USERPROFILE%\\OrangeBox-Ethereal-Inbox" mkdir "%USERPROFILE%\\OrangeBox-Ethereal-Inbox"\r\npython "%~dp0ETHEREAL_SOCKET.py" serve --host ${config.peer_ip} --port ${ETHEREAL_SOCKET_PORT} --root "%USERPROFILE%\\OrangeBox-Ethereal-Inbox" --token-file "%~dp0ETHEREAL_SOCKET_TOKEN.txt" --allow-put\r\npause\r\n`, "utf8");
  await fs.writeFile(files.socket_ping_host_cmd, `@echo off\r\npython "%~dp0ETHEREAL_SOCKET.py" ping --host ${config.host_ip} --port ${ETHEREAL_SOCKET_PORT} --token-file "%~dp0ETHEREAL_SOCKET_TOKEN.txt"\r\npause\r\n`, "utf8");
  await fs.writeFile(files.socket_help_cmd, "@echo off\r\npython \"%~dp0ETHEREAL_SOCKET.py\" --help\r\npause\r\n", "utf8");
  await fs.writeFile(files.socket_create_token_cmd, "@echo off\r\npython \"%~dp0ETHEREAL_SOCKET.py\" token --token-file \"%~dp0ETHEREAL_SOCKET_TOKEN.txt\"\r\npause\r\n", "utf8");
  await fs.writeFile(files.readme, etherealReadme({ config }), "utf8");
  const hashes = {};
  for (const [key, file] of Object.entries(files)) {
    const raw = await fs.readFile(file);
    hashes[key] = crypto.createHash("sha256").update(raw).digest("hex");
  }
  const result = {
    ok: true,
    version: ETHEREAL_LINK_VERSION,
    created_at: new Date().toISOString(),
    pack_dir: packDir,
    config,
    files,
    hashes,
    approval_required: true,
    next_action: "Run dry run, then apply Host on the AI box and Peer on the operator box as Administrator.",
  };
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result, "Ethereal AI Link pack");
  return result;
}

function readme({ hosts, includeBrowsers, includeGameLaunchers, emergencyBlockLaunchers }) {
  return `# ORANGEBOX AI Box Network Priority Pack

This pack makes AI-box traffic the preferred lane and keeps noisy background apps from stealing the work pipe.

## What it does

- Marks AI-box traffic to the configured AI Box IPs and ports with high DSCP priority.
- Can throttle known game launchers/update helpers.
- Can optionally throttle browsers.
- Can optionally add reversible firewall blocks for game launchers in emergency focus mode.

## What it does not pretend

Windows local QoS cannot perfectly govern every inbound download by itself. The strongest version is:

1. Direct Cat 8 or Ethernet AI-box route.
2. Windows AI-box priority policies.
3. Router QoS/DSCP honoring when available.
4. Optional emergency blocks during important builds.

## Configured targets

- Direct: ${hosts.ai_box_direct_ip || "(unset)"}
- LAN: ${hosts.ai_box_lan_ip || "(unset)"}
- Legacy Wi-Fi: ${hosts.ai_box_legacy_ip || "(unset)"}
- Extra AI boxes: ${(hosts.extra_ai_box_ips || []).join(", ") || "(none)"}

## Commands

Dry run:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\AI_BOX_NETWORK_PRIORITY.ps1
\`\`\`

Apply priority + staged throttles:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\AI_BOX_NETWORK_PRIORITY.ps1 -Apply
\`\`\`

Apply with browser throttling:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\AI_BOX_NETWORK_PRIORITY.ps1 -Apply -ThrottleBrowsers
\`\`\`

Emergency block game launchers:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\AI_BOX_NETWORK_PRIORITY.ps1 -Apply -EmergencyBlockLaunchers
\`\`\`

Remove everything this pack created:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\AI_BOX_NETWORK_PRIORITY.ps1 -Remove
\`\`\`

## Generated profile

- throttle browsers: ${includeBrowsers ? "yes" : "no"}
- throttle game launchers: ${includeGameLaunchers ? "yes" : "no"}
- emergency block launchers: ${emergencyBlockLaunchers ? "yes" : "no"}
`;
}

export async function buildAiBoxNetworkPack({
  includeBrowsers = false,
  includeGameLaunchers = true,
  emergencyBlockLaunchers = false,
  writeReceipt: shouldWriteReceipt = false,
} = {}) {
  const hosts = configuredHosts();
  const packDir = path.join(DEFAULT_DATA_ROOT, "exports", "ai-box-network-priority");
  await fs.mkdir(packDir, { recursive: true });
  const policy = {
    version: AI_BOX_NETWORK_VERSION,
    created_at: new Date().toISOString(),
    policy_prefix: POLICY_PREFIX,
    hosts,
    ai_box_ports: DEFAULT_AI_BOX_PORTS,
    background_launchers: includeGameLaunchers ? BACKGROUND_LAUNCHERS : [],
    browser_guard: includeBrowsers ? BROWSER_GUARD : [],
    emergency_block_launchers: emergencyBlockLaunchers ? BACKGROUND_LAUNCHERS : [],
    summary: policySummary({ includeBrowsers, includeGameLaunchers, emergencyBlockLaunchers }),
    approval_required: true,
    approval_reason: "Applies Windows QoS/firewall policy and must be run explicitly as Administrator by the operator.",
  };
  const script = policyScript({ hosts, includeBrowsers, includeGameLaunchers, emergencyBlockLaunchers });
  const files = {
    manifest: path.join(packDir, "ai-box-network-policy.json"),
    powershell: path.join(packDir, "AI_BOX_NETWORK_PRIORITY.ps1"),
    dry_run_cmd: path.join(packDir, "RUN_AS_ADMIN_DRY_RUN.cmd"),
    apply_cmd: path.join(packDir, "RUN_AS_ADMIN_APPLY_AI_PRIORITY.cmd"),
    apply_browser_cmd: path.join(packDir, "RUN_AS_ADMIN_APPLY_WITH_BROWSER_GUARD.cmd"),
    remove_cmd: path.join(packDir, "RUN_AS_ADMIN_REMOVE_AI_PRIORITY.cmd"),
    readme: path.join(packDir, "README.md"),
  };
  await fs.writeFile(files.manifest, JSON.stringify(policy, null, 2) + "\n", "utf8");
  await fs.writeFile(files.powershell, script, "utf8");
  await fs.writeFile(files.dry_run_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0AI_BOX_NETWORK_PRIORITY.ps1\"\r\npause\r\n", "utf8");
  await fs.writeFile(files.apply_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0AI_BOX_NETWORK_PRIORITY.ps1\" -Apply -ThrottleGameLaunchers\r\npause\r\n", "utf8");
  await fs.writeFile(files.apply_browser_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0AI_BOX_NETWORK_PRIORITY.ps1\" -Apply -ThrottleGameLaunchers -ThrottleBrowsers\r\npause\r\n", "utf8");
  await fs.writeFile(files.remove_cmd, "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0AI_BOX_NETWORK_PRIORITY.ps1\" -Remove\r\npause\r\n", "utf8");
  await fs.writeFile(files.readme, readme({ hosts, includeBrowsers, includeGameLaunchers, emergencyBlockLaunchers }), "utf8");
  const hashes = {};
  for (const [key, file] of Object.entries(files)) {
    const raw = await fs.readFile(file);
    hashes[key] = crypto.createHash("sha256").update(raw).digest("hex");
  }
  const result = {
    ok: true,
    version: AI_BOX_NETWORK_VERSION,
    created_at: new Date().toISOString(),
    pack_dir: packDir,
    files,
    hashes,
    approval_required: true,
    next_action: "Review README.md, run dry-run as Administrator, then apply the chosen profile explicitly.",
  };
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result, "AI Box Network Priority pack");
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const receipt = process.argv.includes("--receipt");
  const deep = process.argv.includes("--deep");
  const pack = process.argv.includes("--pack");
  const includeBrowsers = process.argv.includes("--include-browsers");
  const noLaunchers = process.argv.includes("--no-game-launchers");
  const emergencyBlockLaunchers = process.argv.includes("--emergency-block-launchers");
  const out = pack
    ? await buildAiBoxNetworkPack({
      includeBrowsers,
      includeGameLaunchers: !noLaunchers,
      emergencyBlockLaunchers,
      writeReceipt: receipt,
    })
    : await runAiBoxNetworkDoctor({ writeReceipt: receipt, deep });
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "REVIEW"} ${out.status || "AI Box Network Priority"}`);
    if (out.active_route) console.log(`route: ${out.active_route}`);
    if (out.pack_dir) console.log(`pack: ${out.pack_dir}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const blocker of out.blockers || []) console.log(`blocker: ${blocker}`);
  }
  if (!out.ok && !pack) process.exit(4);
}
