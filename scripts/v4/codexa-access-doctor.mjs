#!/usr/bin/env node
/*
  codexa-access-doctor.mjs

  Focused, non-mutating access proof for Codexa / AI Box. This answers one
  question before deeper repair attempts: which access surfaces are actually
  reachable from the cockpit right now?
*/

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "codexa-access");
const downloadsRoot = path.join(userRoot, "Downloads");
const directIp = process.env.ORANGEBOX_CODEXA_DIRECT_IP || process.env.ORANGEBOX_AI_BOX_DIRECT_IP || "10.0.99.1";
const lanIp = process.env.ORANGEBOX_CODEXA_IP || process.env.ORANGEBOX_AI_BOX_IP || "10.0.0.4";
const remoteProofScript = path.join(repoRoot, "scripts", "v4", "codexa-remote-runtime-proof.mjs");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function fileSummary(file) {
  try {
    const stat = fs.statSync(file);
    return { path: file, exists: true, bytes: stat.size, modified_at: stat.mtime.toISOString() };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function probeHttp(id, url, timeoutMs = 1200) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = text.slice(0, 300);
    try { body = JSON.parse(text); } catch {}
    return { id, ok: response.ok, status: response.status, ms: Date.now() - started, url, body };
  } catch (error) {
    return { id, ok: false, status: 0, ms: Date.now() - started, url, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function probeTcp(id, host, port, timeoutMs = 900) {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;
    const done = (ok, error = null) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ id, ok, host, port, ms: Date.now() - started, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error) => done(false, error.message));
    socket.connect(port, host);
  });
}

function pickStatus(access) {
  if (access.command_rail && access.ollama) return "CODEXA_ACCESS_FULL_READY";
  if (access.command_rail) return "CODEXA_ACCESS_COMMAND_RAIL_READY";
  if (access.winrm) return "CODEXA_ACCESS_WINRM_READY";
  if (access.rdp) return "CODEXA_ACCESS_RDP_READY";
  if (access.receipts) return "CODEXA_ACCESS_RECEIPTS_ONLY";
  if (access.smb) return "CODEXA_ACCESS_SMB_VISIBLE_ONLY";
  return "CODEXA_ACCESS_UNREACHABLE";
}

function parseJsonFromStdout(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {}
  }
  return null;
}

async function runRemoteRuntimeProof(commandRailReachable) {
  if (!commandRailReachable) return { attempted: false, ok: false, reason: "command rail not reachable" };
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [remoteProofScript, "--json", "--receipt"], {
      cwd: repoRoot,
      timeout: 70_000,
      windowsHide: true,
      maxBuffer: 2_000_000,
      env: { ...process.env, ORANGEBOX_REPO_ROOT: repoRoot, ORANGEBOX_DATA_ROOT: dataRoot },
    });
    const parsed = parseJsonFromStdout(stdout);
    return {
      attempted: true,
      ok: parsed?.codexa_remote_runtime_green === true,
      status: parsed?.status || null,
      duration_ms: Date.now() - started,
      receipt_path: parsed?.receipt_path || null,
      summary: parsed?.summary || null,
      stderr_tail: String(stderr || "").slice(-600),
    };
  } catch (error) {
    const parsed = parseJsonFromStdout(error.stdout);
    return {
      attempted: true,
      ok: parsed?.codexa_remote_runtime_green === true,
      status: parsed?.status || "CODEXA_REMOTE_PROOF_FAILED",
      duration_ms: Date.now() - started,
      receipt_path: parsed?.receipt_path || null,
      summary: parsed?.summary || null,
      error: error.message,
      stderr_tail: String(error.stderr || "").slice(-600),
    };
  }
}

function nextActions(status, access, setupPack) {
  const actions = [];
  if (status === "CODEXA_ACCESS_FULL_READY") {
    actions.push("Run npm.cmd run model:inventory, npm.cmd run trilane:doctor, and npm.cmd run ops:green before routing heavy work.");
    return actions;
  }
  if (access.rdp && !access.command_rail) {
    actions.push("RDP port is reachable. Open Remote Desktop to Codexa, run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd, then return here and run npm.cmd run codexa:watch.");
  }
  if (access.winrm && !access.command_rail) {
    actions.push("WinRM is reachable. Remote execution may be possible, but do not claim repair until a command receipt proves it.");
  }
  if (access.receipts && !access.command_rail) {
    actions.push("Receipt dashboard is reachable. Focus on starting the 8097 command rail before model pulls.");
  }
  if (access.smb && !access.winrm && !access.command_rail) {
    actions.push("SMB port is visible, but file visibility is not execution. Run npm.cmd run codexa:smb-stage if you intend file staging.");
  }
  if (!access.rdp && !access.winrm && !access.command_rail) {
    actions.push("No interactive or command execution path is proven from this cockpit. Use the setup pack directly on Codexa.");
  }
  if (setupPack.exists) {
    actions.push(`Setup pack to use on Codexa: ${setupPack.path}`);
  } else {
    actions.push("Rebuild the setup pack with npm.cmd run obox2:pack before trying Codexa setup.");
  }
  actions.push("After Codexa setup, run npm.cmd run codexa:alert:popup, npm.cmd run codexa:watch, npm.cmd run model:inventory, and npm.cmd run ops:green.");
  return [...new Set(actions)];
}

async function main() {
  const startedAt = new Date();
  const httpEntries = [
    ["direct_command_8097", `http://${directIp}:8097/health`],
    ["direct_receipts_8099", `http://${directIp}:8099/`],
    ["direct_ollama_11434", `http://${directIp}:11434/api/tags`],
    ["lan_command_8097", `http://${lanIp}:8097/health`],
    ["lan_receipts_8099", `http://${lanIp}:8099/`],
    ["lan_ollama_11434", `http://${lanIp}:11434/api/tags`],
  ];
  const tcpEntries = [
    ["direct_rdp_3389", directIp, 3389],
    ["direct_winrm_5985", directIp, 5985],
    ["direct_smb_445", directIp, 445],
    ["lan_rdp_3389", lanIp, 3389],
    ["lan_winrm_5985", lanIp, 5985],
    ["lan_smb_445", lanIp, 445],
  ];

  const http = Object.fromEntries(await Promise.all(httpEntries.map(async ([id, url]) => [id, await probeHttp(id, url)])));
  const tcp = Object.fromEntries(await Promise.all(tcpEntries.map(async ([id, host, port]) => [id, await probeTcp(id, host, port)])));
  const directOllama = http.direct_ollama_11434.ok || http.lan_ollama_11434.ok;
  const commandRail = http.direct_command_8097.ok || http.lan_command_8097.ok;
  const remoteRuntimeProof = directOllama ? { attempted: false, ok: false, reason: "direct Ollama already reachable" } : await runRemoteRuntimeProof(commandRail);
  const access = {
    command_rail: commandRail,
    receipts: http.direct_receipts_8099.ok || http.lan_receipts_8099.ok,
    ollama: directOllama || remoteRuntimeProof.ok,
    direct_ollama: directOllama,
    remote_ollama: remoteRuntimeProof.ok,
    rdp: tcp.direct_rdp_3389.ok || tcp.lan_rdp_3389.ok,
    winrm: tcp.direct_winrm_5985.ok || tcp.lan_winrm_5985.ok,
    smb: tcp.direct_smb_445.ok || tcp.lan_smb_445.ok,
  };
  const setupPack = fileSummary(path.join(downloadsRoot, "Orangebox_V2_Internal_Setup_Pack.zip"));
  const status = pickStatus(access);
  const result = {
    ok: true,
    codexa_access_ready: status === "CODEXA_ACCESS_FULL_READY",
    version: "orangebox-codexa-access-doctor/v1",
    status,
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    hosts: { direct_ip: directIp, lan_ip: lanIp },
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      install_attempted: false,
      remote_codexa_mutation_attempted: false,
      remote_login_attempted: false,
      paid_api_attempted: false,
      production_deploy_attempted: false,
    },
    access,
    remote_runtime_proof: remoteRuntimeProof,
    probes: { http, tcp },
    setup_pack: setupPack,
    interpretation: {
      remote_control_available: access.rdp || access.winrm,
      remote_execution_available: access.winrm || access.command_rail,
      rdp_note: access.rdp
        ? "RDP TCP port is reachable; login/session success still requires operator credentials."
        : "RDP TCP port is not reachable from this cockpit.",
      winrm_note: access.winrm
        ? "WinRM TCP port is reachable; command execution still needs explicit operator approval and credentials."
        : "WinRM TCP port is not reachable from this cockpit.",
      full_green_blocked: status !== "CODEXA_ACCESS_FULL_READY",
    },
    next_actions: nextActions(status, access, setupPack),
  };
  result.access_hash = sha256(JSON.stringify({
    status,
    access,
    hosts: result.hosts,
    setup_pack_exists: setupPack.exists,
  }));

  const latestPath = path.join(outRoot, "latest-codexa-access.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-codexa-access-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : status);
}

await main();
