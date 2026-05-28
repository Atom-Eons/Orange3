#!/usr/bin/env node
/* process-doctor.mjs - read-only ORANGEBOX process hygiene proof.
 *
 * This doctor exists because long proof/build loops must leave the operator's
 * machine calm. It identifies stale green-board/proof browser processes and
 * distinguishes them from expected MCP/background helpers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const PROCESS_DOCTOR_VERSION = "orangebox-process-hygiene-doctor/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function compact(value, max = 1600) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function normalizeList(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function classifyProcess(proc) {
  const commandLine = String(proc.CommandLine || proc.commandLine || "");
  const name = String(proc.Name || proc.name || "");
  const lower = commandLine.toLowerCase();
  const lowerName = name.toLowerCase();
  if (lower.includes("finish:green") || /\bfinish\s+green-board\b/.test(lower)) return "finish_green_board";
  if (lower.includes("orangebox-first-run-proof") || lower.includes("orangebox-ae-operations-proof")) return "visual_proof_browser";
  if (lower.includes("orangebox-command-server.mjs")) {
    if (lowerName === "powershell.exe" || lowerName === "pwsh.exe") return "orangebox_command_launcher";
    return "orangebox_command_server";
  }
  if (lower.includes("orangebox-mcp-server.mjs")) return "orangebox_mcp_server";
  if (lower.includes("orangebox-monitor.mjs")) return "orangebox_monitor";
  if (lower.includes("chrome-devtools-mcp")) return "browser_mcp";
  if (lower.includes("@playwright\\mcp") || lower.includes("@playwright/mcp")) return "playwright_mcp";
  if (lower.includes("@modelcontextprotocol") || lower.includes("context7-mcp")) return "agent_stack_mcp";
  if (lower.includes("orangebox")) return "orangebox_other";
  return name.toLowerCase().includes("node") ? "node_other" : "other";
}

function powershellPidList(processes) {
  return processes.map((proc) => proc.pid).filter(Boolean).join(",");
}

function buildRecoveryPlan({ warnings, failures, counts, stale, activeClassified }) {
  const actions = [];
  const stalePids = powershellPidList(stale);
  if (stale.length) {
    actions.push({
      id: "stale-proof-processes",
      severity: "high",
      title: "Clear stale proof/build processes",
      reason: "A proof or finish-line process remained after its command should have exited.",
      requires_operator_approval: true,
      safe_review_command: "obx install process-doctor --json",
      approval_command: `Stop-Process -Id ${stalePids} -Confirm`,
    });
  }

  const commandServers = activeClassified.filter((proc) => proc.kind === "orangebox_command_server");
  if ((counts.orangebox_command_server || 0) > 1) {
    actions.push({
      id: "multiple-command-servers",
      severity: "medium",
      title: "Choose one AE See-Suite command server",
      reason: "More than one command server can confuse local URLs and make recovery harder.",
      requires_operator_approval: true,
      safe_review_command: `Get-CimInstance Win32_Process | Where-Object { @(${powershellPidList(commandServers)}) -contains $_.ProcessId } | Select-Object ProcessId,CommandLine`,
      approval_command: `Stop-Process -Id ${powershellPidList(commandServers.slice(1))} -Confirm`,
    });
  }

  const mcpServers = activeClassified.filter((proc) => proc.kind === "orangebox_mcp_server");
  if ((counts.orangebox_mcp_server || 0) > 3) {
    actions.push({
      id: "many-orangebox-mcp-servers",
      severity: "watch",
      title: "Reduce duplicate ORANGEBOX MCP servers if the machine feels slow",
      reason: "Several ORANGEBOX MCP servers are active. This can be normal after multiple agent surfaces start, but it is worth reviewing during slowdown.",
      requires_operator_approval: true,
      safe_review_command: `Get-CimInstance Win32_Process | Where-Object { @(${powershellPidList(mcpServers)}) -contains $_.ProcessId } | Select-Object ProcessId,CommandLine`,
      approval_command: `Stop-Process -Id ${powershellPidList(mcpServers)} -Confirm`,
    });
  }

  return {
    status: failures.length ? "action_required" : warnings.length ? "watch" : "clear",
    read_only: true,
    no_processes_killed: true,
    operator_approval_required_for_cleanup: true,
    actions,
  };
}

async function windowsProcessSnapshot() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$names = @('node.exe','msedge.exe','chrome.exe','powershell.exe','pwsh.exe')",
    "$items = Get-CimInstance Win32_Process | Where-Object { $names -contains $_.Name } | Select-Object ProcessId,Name,CommandLine,CreationDate",
    "$items | ConvertTo-Json -Depth 4"
  ].join("; ");
  const out = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    cwd: ROOT,
    timeout: 30000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = String(out.stdout || "").trim();
  if (!stdout) return [];
  return normalizeList(JSON.parse(stdout));
}

async function windowsTasklistSnapshot() {
  const out = await execFileAsync("tasklist.exe", ["/fo", "csv", "/nh"], {
    cwd: ROOT,
    timeout: 15000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
  });
  return String(out.stdout || "")
    .split(/\r?\n/)
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
        } else {
          cur += ch;
        }
      }
      cells.push(cur);
      return {
        ProcessId: cells[1],
        Name: cells[0],
        CommandLine: cells[0],
        CreationDate: null,
        snapshot_source: "tasklist",
      };
    })
    .filter((proc) => ["node.exe", "msedge.exe", "chrome.exe", "powershell.exe", "pwsh.exe"].includes(String(proc.Name || "").toLowerCase()));
}

async function windowsGetProcessSnapshot() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$names = @('node','msedge','chrome','powershell','pwsh')",
    "$items = Get-Process -Name $names -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime",
    "$items | ConvertTo-Json -Depth 4"
  ].join("; ");
  const out = await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    cwd: ROOT,
    timeout: 20000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });
  const stdout = String(out.stdout || "").trim();
  if (!stdout) return [];
  return normalizeList(JSON.parse(stdout)).map((proc) => ({
    ProcessId: proc.Id,
    Name: `${proc.ProcessName}.exe`,
    CommandLine: `${proc.ProcessName}.exe`,
    CreationDate: proc.StartTime || null,
    snapshot_source: "get-process-limited",
  }));
}

async function processSnapshot() {
  if (process.platform === "win32") {
    try {
      return await windowsProcessSnapshot();
    } catch (cimError) {
      try {
        return await windowsTasklistSnapshot();
      } catch (tasklistError) {
        try {
          return await windowsGetProcessSnapshot();
        } catch (getProcessError) {
          throw new Error(`CIM failed: ${cimError?.message || cimError}; tasklist failed: ${tasklistError?.message || tasklistError}; Get-Process failed: ${getProcessError?.message || getProcessError}`);
        }
      }
    }
  }
  return [];
}

async function writeProcessReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-process-doctor-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runProcessDoctor({ writeReceipt = false, ignorePids = [] } = {}) {
  const startedAt = new Date().toISOString();
  const failures = [];
  const warnings = [];
  const ignoredPids = new Set(ignorePids.map((pid) => Number(pid)).filter(Boolean));
  let processes = [];
  let snapshotError = null;
  try {
    processes = await processSnapshot();
  } catch (error) {
    snapshotError = error?.message || String(error);
  }

  const classified = processes.map((proc) => ({
    pid: Number(proc.ProcessId || proc.pid || 0),
    name: String(proc.Name || proc.name || ""),
    kind: classifyProcess(proc),
    creation_date: proc.CreationDate || proc.creationDate || null,
    command_line: compact(proc.CommandLine || proc.commandLine || "", 600),
    snapshot_source: proc.snapshot_source || "cim",
  })).filter((proc) => proc.pid);
  const ignored_processes = classified.filter((proc) => ignoredPids.has(proc.pid));
  const activeClassified = classified.filter((proc) => !ignoredPids.has(proc.pid));

  const counts = {};
  for (const proc of activeClassified) counts[proc.kind] = (counts[proc.kind] || 0) + 1;

  const staleKinds = new Set(["finish_green_board", "visual_proof_browser"]);
  const stale = activeClassified.filter((proc) => staleKinds.has(proc.kind));
  const ignored_stale = ignored_processes.filter((proc) => staleKinds.has(proc.kind));
  for (const proc of stale) {
    failures.push({
      type: "stale_process",
      pid: proc.pid,
      kind: proc.kind,
      command_line: proc.command_line,
      detail: "This should not remain after a proof/build command exits. Stop it manually or rerun with an explicit cleanup command."
    });
  }

  if ((counts.orangebox_command_server || 0) > 1) {
    warnings.push({
      type: "multiple_command_servers",
      count: counts.orangebox_command_server,
      detail: "More than one ORANGEBOX command server is running. This can be intentional during isolated doctors, but should settle after proof runs."
    });
  }
  if ((counts.orangebox_mcp_server || 0) > 3) {
    warnings.push({
      type: "many_orangebox_mcp_servers",
      count: counts.orangebox_mcp_server,
      detail: "Several ORANGEBOX MCP servers are active. Keep an eye on this if the machine feels slow."
    });
  }
  if (activeClassified.some((proc) => proc.snapshot_source === "get-process-limited")) {
    warnings.push({
      type: "limited_process_snapshot",
      detail: "Windows blocked the full command-line process snapshot, so AE Operations fell back to Get-Process. This proves process count but cannot classify stale command lines."
    });
  }
  if (snapshotError) {
    failures.push({
      type: "snapshot_error",
      detail: snapshotError
    });
  }

  const recovery = buildRecoveryPlan({ warnings, failures, counts, stale, activeClassified });

  const result = {
    ok: failures.length === 0,
    version: PROCESS_DOCTOR_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    started_at: startedAt,
    root: ROOT,
    platform: process.platform,
    summary: {
      process_count: activeClassified.length,
      ignored_count: ignored_processes.length,
      stale_count: stale.length,
      warnings: warnings.length,
      failures: failures.length
    },
    counts,
    ignored_processes,
    stale,
    ignored_stale,
    notable: activeClassified.filter((proc) => proc.kind !== "other" && proc.kind !== "node_other"),
    failures,
    warnings,
    recovery,
    safety: {
      read_only: true,
      no_processes_killed: true,
      cleanup_requires_explicit_future_command: true
    }
  };
  if (writeReceipt) await writeProcessReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const writeReceiptFlag = process.argv.includes("--receipt");
  runProcessDoctor({ writeReceipt: writeReceiptFlag }).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(4);
  }).catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
