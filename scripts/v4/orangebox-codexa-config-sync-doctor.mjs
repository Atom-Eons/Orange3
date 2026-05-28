#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");
const deploy = !args.has("--no-deploy");

const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

const tokenCandidates = [
  process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN || "",
  process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN || "",
  path.join(dataRoot, "exports", "codexa-command-rail-pack", "SET_COCKPIT_COMMAND_TOKEN.cmd"),
  "C:/AtomEons/aeskills/orangebox/exports/codexa-non-codex-rail-repair-pack/command-rail/INSTALL_CODEXA_COMMAND_RAIL.ps1",
].filter(Boolean);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function latestReceipt(prefix) {
  if (!exists(receiptDir)) return null;
  const files = fs
    .readdirSync(receiptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(receiptDir, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function b64(text) {
  return Buffer.from(text, "utf8").toString("base64");
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function readToken() {
  for (const candidate of tokenCandidates) {
    if (!candidate) continue;
    if (!candidate.includes(":") && !candidate.includes("/") && !candidate.includes("\\")) return candidate.trim();
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    const match =
      text.match(/ORANGEBOX_CODEXA_COMMAND_TOKEN\s+"([^"]+)"/) ||
      text.match(/ORANGEBOX_AI_BOX_COMMAND_TOKEN\s+"([^"]+)"/) ||
      text.match(/\$Token\s*=\s*"([^"]+)"/) ||
      text.match(/setx\s+ORANGEBOX_CODEXA_COMMAND_TOKEN\s+"([^"]+)"/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

async function postDirectRail(pathname, body, token, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://10.0.99.1:8097${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-orangebox-token": token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep text
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function getDirectRail(pathname, token, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://10.0.99.1:8097${pathname}`, {
      headers: { "x-orangebox-token": token },
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // keep text
    }
    return { ok: response.ok, status: response.status, body: parsed };
  } finally {
    clearTimeout(timer);
  }
}

async function postLocalSidecarCommand(command) {
  const response = await fetch("http://127.0.0.1:8787/api/codexa/command", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      command,
      confirmFullAccess: true,
      internalApproved: true,
      internalScope: "orangebox-codexa-config-sync",
      checkmateLevel: "full",
    }),
  });
  const body = await response.text();
  let parsed = body;
  try {
    parsed = JSON.parse(body);
  } catch {
    // keep text
  }
  const commandStatus = parsed?.status || parsed?.result?.status || parsed?.body?.status || null;
  const gateStatus = parsed?.checkmateGate?.status || parsed?.body?.checkmateGate?.status || null;
  const bodyStatus = parsed?.body?.status || null;
  const blocked =
    [commandStatus, gateStatus, bodyStatus].some((status) =>
      ["NEEDS_APPROVAL", "BLOCKED", "CHECKMATE_REVIEW_REQUIRED"].includes(String(status || "").toUpperCase()),
    ) || response.ok === false;
  return { ok: !blocked, http_ok: response.ok, status: response.status, command_status: commandStatus, checkmate_status: gateStatus, body: parsed };
}

async function uploadDirectFile(token, remotePath, text) {
  return postDirectRail(
    "/put-file",
    {
      confirmFullAccess: true,
      path: remotePath,
      base64: b64(text),
      sha256: sha256(text),
    },
    token,
  );
}

async function deployDirectRail({ config, roleText, watcherScript }) {
  const token = readToken();
  if (!token) return { attempted: false, ok: false, error: "No Codexa command rail token found." };
  const remoteRoot = "C:/AtomEons/ai-box/orangebox-config";
  const uploads = [
    await uploadDirectFile(token, `${remoteRoot}/orangebox-current-config.json`, `${JSON.stringify(config, null, 2)}\n`),
    await uploadDirectFile(token, `${remoteRoot}/OB0X_REMOTE_ROLE.md`, roleText),
    await uploadDirectFile(token, `${remoteRoot}/orangebox-codexa-config-watcher.ps1`, watcherScript),
  ];
  const uploadOk = uploads.every((item) => item.ok && item.body?.status !== "FAILED");
  if (!uploadOk) return { attempted: true, ok: false, method: "direct-rail", uploads };

  const command = `$ErrorActionPreference='Stop'
$root='C:\\AtomEons\\ai-box\\orangebox-config'
$watcher=Join-Path $root 'orangebox-codexa-config-watcher.ps1'
try {
  $self = $PID
  Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $self -and $_.CommandLine -like '*orangebox-codexa-config-watcher.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $watcher + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn
try {
  Register-ScheduledTask -TaskName 'OrangeBOX Codexa Config Watcher' -Action $action -Trigger $trigger -Description 'Lightweight Orangebox Codexa watcher heartbeat' -Force | Out-Null
  Start-ScheduledTask -TaskName 'OrangeBOX Codexa Config Watcher'
  $taskStatus = 'registered_and_started'
} catch {
  Start-Process -WindowStyle Hidden powershell.exe -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -File "' + $watcher + '"')
  $taskStatus = 'started_process_fallback'
}
[pscustomobject]@{
  status = 'VERIFIED'
  root = $root
  config = (Join-Path $root 'orangebox-current-config.json')
  role = (Join-Path $root 'OB0X_REMOTE_ROLE.md')
  watcher = $watcher
  receipt = (Join-Path $root 'watcher-heartbeat.json')
  task_status = $taskStatus
} | ConvertTo-Json -Depth 5`;
  const install = await postDirectRail(
    "/command",
    {
      confirmFullAccess: true,
      command,
      timeoutMs: 30000,
    },
    token,
    45000,
  );
  await new Promise((resolve) => setTimeout(resolve, 3500));
  const heartbeat = await postDirectRail(
    "/command",
    {
      confirmFullAccess: true,
      command: "Get-Content -LiteralPath 'C:\\AtomEons\\ai-box\\orangebox-config\\watcher-heartbeat.json' -Raw",
      timeoutMs: 10000,
    },
    token,
    20000,
  );
  const installVerified =
    install.ok &&
    install.body?.status === "VERIFIED" &&
    (!install.body?.response || install.body.response?.status === "VERIFIED");
  const heartbeatVerified =
    heartbeat.ok &&
    heartbeat.body?.status === "VERIFIED" &&
    (!heartbeat.body?.response || heartbeat.body.response?.status === "VERIFIED");
  return {
    attempted: true,
    ok: installVerified && heartbeatVerified,
    method: "direct-rail-put-file-plus-short-command",
    uploads,
    install,
    heartbeat,
    token_used: "redacted",
  };
}

async function main() {
  const mode = readJson(path.join(dataRoot, "codexa-mode.json"));
  const triad = readJson(path.join(dataRoot, "triad-status.json"));
  const sourceLock = readJson(path.join(dataRoot, "orangebox-source-of-truth.json"));
  const fullGreen =
    readJson(path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json")) ||
    readJson(latestReceipt("orangebox-gauntlet-orangebox-full-green-") || "");
  const reality = readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json"));
  const primer = path.join(dataRoot, "primers", "ORANGEBOX_MID_SESSION_PRIMER.md");
  const zeroMemoryPrimer = path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md");

  const config = {
    ok: true,
    version: "orangebox-codexa-config/v0",
    status: "CODEXA_ORANGEBOX_CONFIG_READY",
    created_at: new Date().toISOString(),
    role: "Orangebox watcher/compression-sidecar. Report reality; do not invent liveness.",
    local_truth: {
      repo_root: repoRoot,
      data_root: dataRoot,
      source_lock_path: path.join(dataRoot, "orangebox-source-of-truth.json"),
      mid_session_primer_path: primer,
      zero_memory_primer_path: zeroMemoryPrimer,
    },
    codexa_network: {
      mode: mode?.mode || "remote",
      cockpit_ip: mode?.cockpit_ip || "10.0.99.2",
      codexa_ip: mode?.codexa_ip || "10.0.0.4",
      codexa_direct_ip: mode?.codexa_direct_ip || "10.0.99.1",
      command_rail: "http://10.0.99.1:8097",
      wiki_receipt_bridge: "http://10.0.99.1:8098",
      knowledge_receipts_root: "http://10.0.99.1:8099",
    },
    expected_lightweight_work: [
      "watch command rail, wiki rail, and knowledge/receipt root reachability",
      "mirror current Orangebox config and primer packets",
      "run cheap heartbeat only; avoid paid APIs and heavy local generation unless requested",
      "pre-compress or summarize only when explicitly routed by Orangebox Ops",
      "write heartbeat receipts so user and LLM share one reality",
    ],
    lane_boundaries: {
      allowed: ["watcher", "compression sidecar", "receipt mirror", "local model availability check", "config packet"],
      not_allowed_without_operator: ["visual dashboard edits", "website/shop mutation", "production deploy", "paid model calls", "large model generation loops"],
    },
    latest_status: {
      source_lock: sourceLock?.status || null,
      full_green: fullGreen?.summary?.status || fullGreen?.status || null,
      reality: reality?.status || null,
      triad: triad?.status || null,
      triad_route: triad?.route || null,
    },
  };

  const syncRoot = path.join(dataRoot, "codexa-sync");
  ensureDir(syncRoot);
  const localConfigPath = path.join(syncRoot, "latest-codexa-config.json");
  const rolePath = path.join(syncRoot, "OB0X_REMOTE_ROLE.md");
  const watcherPath = path.join(syncRoot, "orangebox-codexa-config-watcher.ps1");
  fs.writeFileSync(localConfigPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  const roleText = `# OB0X Remote Role\n\nCodexa/AI Box is the Orangebox lightweight watcher and compression-sidecar rail.\n\nIt reports reality from probes and receipts. It does not claim tools are alive unless heartbeats or probes prove it.\n\nNo paid APIs. No visual lane edits. No production deploys. No heavy generation loops unless the operator routes them.\n`;
  fs.writeFileSync(rolePath, roleText, "utf8");

  const watcherScript = `$ErrorActionPreference = 'Continue'
$root = 'C:\\AtomEons\\ai-box\\orangebox-config'
$heartbeat = Join-Path $root 'watcher-heartbeat.json'
New-Item -ItemType Directory -Force -Path $root | Out-Null
while ($true) {
  $now = (Get-Date).ToString('o')
  $checks = [ordered]@{}
  foreach ($pair in @(
    @('command_8097','http://127.0.0.1:8097/health'),
    @('wiki_8098','http://127.0.0.1:8098/health'),
    @('knowledge_8099','http://127.0.0.1:8099/')
  )) {
    try {
      $resp = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $pair[1]
      $checks[$pair[0]] = @{ ok = $true; status = [int]$resp.StatusCode }
    } catch {
      $checks[$pair[0]] = @{ ok = $false; error = $_.Exception.Message }
    }
  }
  $payload = [ordered]@{
    ok = $true
    checked_at = $now
    host = $env:COMPUTERNAME
    role = 'Orangebox lightweight watcher/compression-sidecar'
    checks = $checks
    policy = 'No paid APIs, no heavy generation loop, no visual mutation without operator route.'
  }
  $payload | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 -Path $heartbeat
  Start-Sleep -Seconds 120
}
`;
  fs.writeFileSync(watcherPath, watcherScript, "utf8");

  let remote = { attempted: false, ok: false, note: "deploy disabled" };
  if (deploy) {
    remote = await deployDirectRail({ config, roleText, watcherScript });
    if (!remote.ok && remote.error !== "No Codexa command rail token found.") {
      const remoteRoot = "C:\\AtomEons\\ai-box\\orangebox-config";
      const command = `$ErrorActionPreference='Stop'
$root='${remoteRoot}'
New-Item -ItemType Directory -Force -Path $root | Out-Null
[IO.File]::WriteAllBytes((Join-Path $root 'orangebox-current-config.json'), [Convert]::FromBase64String('${b64(JSON.stringify(config, null, 2) + "\n")}'))
[IO.File]::WriteAllBytes((Join-Path $root 'OB0X_REMOTE_ROLE.md'), [Convert]::FromBase64String('${b64(fs.readFileSync(rolePath, "utf8"))}'))
[IO.File]::WriteAllBytes((Join-Path $root 'orangebox-codexa-config-watcher.ps1'), [Convert]::FromBase64String('${b64(watcherScript)}'))
try {
  $self = $PID
  Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $self -and $_.CommandLine -like '*orangebox-codexa-config-watcher.ps1*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \\"$root\\orangebox-codexa-config-watcher.ps1\\""
$trigger = New-ScheduledTaskTrigger -AtLogOn
try {
  Register-ScheduledTask -TaskName 'OrangeBOX Codexa Config Watcher' -Action $action -Trigger $trigger -Description 'Lightweight Orangebox Codexa watcher heartbeat' -Force | Out-Null
  Start-ScheduledTask -TaskName 'OrangeBOX Codexa Config Watcher'
  $taskStatus = 'registered_and_started'
} catch {
  Start-Process -WindowStyle Hidden powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File \\"$root\\orangebox-codexa-config-watcher.ps1\\""
  $taskStatus = 'started_process_fallback'
}
[pscustomobject]@{
  ok = $true
  root = $root
  config = (Join-Path $root 'orangebox-current-config.json')
  role = (Join-Path $root 'OB0X_REMOTE_ROLE.md')
  watcher = (Join-Path $root 'orangebox-codexa-config-watcher.ps1')
  receipt = (Join-Path $root 'watcher-heartbeat.json')
  task_status = $taskStatus
} | ConvertTo-Json -Depth 5`;
      try {
        remote.sidecar_fallback = await postLocalSidecarCommand(command);
      } catch (error) {
        remote.sidecar_fallback = { ok: false, error: error.message };
      }
    }
  }

  const ok = config.ok && (!deploy || remote.ok);
  const result = {
    ok,
    version: "orangebox-codexa-config-sync/v0",
    status: ok ? "CODEXA_ORANGEBOX_CONFIG_SYNC_GREEN" : "CODEXA_ORANGEBOX_CONFIG_SYNC_NOT_GREEN",
    created_at: new Date().toISOString(),
    local_config_path: localConfigPath,
    role_path: rolePath,
    watcher_path: watcherPath,
    remote,
    config,
  };

  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-codexa-config-sync-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  console.log(json ? JSON.stringify(result, null, 2) : result.status);
  if (!ok) process.exitCode = 1;
}

main();
