#!/usr/bin/env node
/*
 * apply-live-codexa-trusted-rails.mjs
 *
 * Repairs a live Codexa command rail so controller access survives a route
 * change. It uploads the current generated command-rail server and restarts the
 * live rail with multiple trusted controller sources.
 *
 * This is an operator tool, not part of first-run. It requires the existing
 * command rail token and uses the already-authenticated command rail.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";

const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || path.join(process.env.USERPROFILE || process.env.HOME || "C:/Users/a", "OrangeBox-Data");
const CODEXA_HOST = process.env.ORANGEBOX_CODEXA_IP || "10.0.0.4";
const COMMAND_PORT = Number(process.env.ORANGEBOX_CODEXA_COMMAND_PORT || 8097);
const CONTROLLER_IP = process.env.ORANGEBOX_COCKPIT_IP || "10.0.0.114";
const TRUSTED_IPS = process.env.ORANGEBOX_CODEXA_TRUSTED_IPS || `${CONTROLLER_IP},10.0.0.0/24,10.0.99.2,10.0.99.0/24`;
const SERVER_SOURCE = process.env.ORANGEBOX_COMMAND_RAIL_SERVER_SOURCE
  || path.join(DATA_ROOT, "exports", "codexa-command-rail-pack", "codexa-command-rail-server.mjs");

const TOKEN_CANDIDATES = [
  process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN || "",
  "C:/AtomEons/aeskills/orangebox/exports/codexa-non-codex-rail-repair-pack/command-rail/INSTALL_CODEXA_COMMAND_RAIL.ps1",
  path.join(DATA_ROOT, "exports", "codexa-command-rail-pack", "SET_COCKPIT_COMMAND_TOKEN.cmd"),
].filter(Boolean);

function readToken() {
  for (const candidate of TOKEN_CANDIDATES) {
    if (!candidate) continue;
    if (!candidate.includes(":") && !candidate.includes("/") && !candidate.includes("\\")) return candidate.trim();
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8");
    const match = text.match(/ORANGEBOX_CODEXA_COMMAND_TOKEN\s+"([^"]+)"/)
      || text.match(/\$Token\s*=\s*"([^"]+)"/)
      || text.match(/setx\s+ORANGEBOX_CODEXA_COMMAND_TOKEN\s+"([^"]+)"/i);
    if (match?.[1]) return match[1].trim();
  }
  throw new Error("No live ORANGEBOX_CODEXA_COMMAND_TOKEN found.");
}

async function postJson(pathname, body, token, timeoutMs = 60000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://${CODEXA_HOST}:${COMMAND_PORT}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-orangebox-token": token },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    if (!response.ok) throw new Error(`${pathname} failed ${response.status}: ${text}`);
    return parsed || { raw: text };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url, token = "") {
  const headers = token ? { "x-orangebox-token": token } : {};
  const response = await fetch(url, { headers });
  const text = await response.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  return { ok: response.ok, status: response.status, body: parsed || text };
}

function remoteApplyCommand() {
  return String.raw`
$ErrorActionPreference = 'Stop'
$TrustedIps = '__TRUSTED_IPS__'
$ApplyPath = 'C:\AtomEons\ai-box\receipts\apply-trusted-rail-sources-20260519-0514.ps1'
$Body = @'
$ErrorActionPreference = 'Stop'
$TrustedIps = '__TRUSTED_IPS__'
$TrustedIpList = $TrustedIps -split '[,; ]+' | Where-Object { $_ }
$CommandRoot = 'C:\AtomEons\ai-box\orangebox-command-rail'
$CommandServer = Join-Path $CommandRoot 'codexa-command-rail-server.mjs'
$CommandToken = (Get-Content (Join-Path $CommandRoot 'ORANGEBOX_CODEXA_COMMAND_TOKEN.txt') -Raw).Trim()
$Node = (Get-Command node -ErrorAction Stop).Source
$CommandArgLine = '"' + $CommandServer + '" --host 0.0.0.0 --port 8097 --cockpitIp __CONTROLLER_IP__ --trustedIps "' + ($TrustedIpList -join ',') + '" --token "' + $CommandToken + '"'
Get-ScheduledTask -TaskName 'OrangeBOX Codexa Command Rail' -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
$Action = New-ScheduledTaskAction -Execute $Node -Argument $CommandArgLine -WorkingDirectory $CommandRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 7)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName 'OrangeBOX Codexa Command Rail' -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Full-access OrangeBOX command rail for trusted controller sources $TrustedIps" | Out-Null
Get-NetFirewallRule -DisplayName 'OrangeBOX Codexa Command Rail From Cockpit' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'OrangeBOX Codexa Command Rail From Cockpit' -Direction Inbound -Protocol TCP -LocalPort 8097 -RemoteAddress $TrustedIpList -Action Allow | Out-Null
Get-NetFirewallRule -DisplayName 'OrangeBOX Codexa Bridge From Cockpit' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName 'OrangeBOX Codexa Bridge From Cockpit' -Direction Inbound -Protocol TCP -LocalPort 8098 -RemoteAddress $TrustedIpList -Action Allow | Out-Null
Start-Sleep -Seconds 2
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" | Where-Object { $_.CommandLine -match 'codexa-command-rail-server\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Process -FilePath $Node -ArgumentList $CommandArgLine -WorkingDirectory $CommandRoot -WindowStyle Hidden
Start-Sleep -Seconds 3
$Health = Invoke-RestMethod -UseBasicParsing -TimeoutSec 10 -Uri 'http://127.0.0.1:8097/health'
$Out = [pscustomobject]@{ generatedAt=(Get-Date).ToUniversalTime().ToString('o'); status='VERIFIED'; trustedIps=$TrustedIps; commandHealth=$Health.status; commandTokenHash=$Health.tokenHash; receipt='C:\AtomEons\ai-box\receipts\trusted-rail-sources-20260519-0514.json' }
$Out | ConvertTo-Json -Depth 6 | Set-Content -Path 'C:\AtomEons\ai-box\receipts\trusted-rail-sources-20260519-0514.json' -Encoding UTF8
'@
New-Item -ItemType Directory -Force -Path (Split-Path $ApplyPath) | Out-Null
Set-Content -Path $ApplyPath -Value $Body -Encoding UTF8
Start-Process -FilePath powershell.exe -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ApplyPath) -WindowStyle Hidden
[pscustomobject]@{ status='STARTED'; script=$ApplyPath; trustedIps=$TrustedIps } | ConvertTo-Json -Depth 4
`.replaceAll("__TRUSTED_IPS__", TRUSTED_IPS).replaceAll("__CONTROLLER_IP__", CONTROLLER_IP);
}

async function main() {
  const token = readToken();
  if (!fs.existsSync(SERVER_SOURCE)) throw new Error(`server source not found: ${SERVER_SOURCE}`);
  const source = fs.readFileSync(SERVER_SOURCE);
  const sha256 = crypto.createHash("sha256").update(source).digest("hex");
  const upload = await postJson("/put-file", {
    confirmFullAccess: true,
    path: "C:/AtomEons/ai-box/orangebox-command-rail/codexa-command-rail-server.mjs",
    base64: source.toString("base64"),
    sha256,
  }, token);
  const start = await postJson("/command", {
    confirmFullAccess: true,
    command: remoteApplyCommand(),
    timeoutMs: 30000,
    internalScope: "orangebox-live-rail-trusted-sources",
  }, token);
  await new Promise((resolve) => setTimeout(resolve, 8500));
  const routerHealth = await getJson(`http://${CODEXA_HOST}:${COMMAND_PORT}/health`);
  const directHealth = await getJson(`http://10.0.99.1:${COMMAND_PORT}/health`);
  const directCommand = await postJson("/command", {
    confirmFullAccess: true,
    command: "[pscustomobject]@{ status='VERIFIED'; source='direct-command-proof'; when=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json",
    timeoutMs: 30000,
    internalScope: "orangebox-direct-command-proof",
  }, token);
  console.log(JSON.stringify({
    status: routerHealth.ok && directHealth.ok ? "VERIFIED" : "REVIEW_REQUIRED",
    uploaded_server_sha256: sha256,
    upload_receipt: upload.receiptPath,
    start_receipt: start.receiptPath,
    trustedIps: TRUSTED_IPS,
    router_health: routerHealth,
    direct_health: directHealth,
    direct_command_receipt: directCommand.receiptPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", error: error.message }, null, 2));
  process.exit(1);
});
