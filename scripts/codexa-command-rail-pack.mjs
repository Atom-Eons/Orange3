import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { execFileSync } from "node:child_process";

const orangeRoot = process.env.ORANGEBOX_ROOT
  || process.env.ORANGEBOX_DATA_ROOT
  || path.join(process.env.USERPROFILE || process.env.HOME || "C:/Users/a", "OrangeBox-Data");
const outDir = path.join(orangeRoot, "exports", "codexa-command-rail-pack");
const zipPath = path.join(orangeRoot, "exports", "codexa-command-rail-pack-WINDOWS-NATIVE-2026-05-05.zip");
const latestZipPath = path.join(orangeRoot, "exports", "codexa-command-rail-pack-WINDOWS-NATIVE.zip");
const latestAiBoxZipPath = path.join(orangeRoot, "exports", "orangebox-ai-box-command-rail-pack-WINDOWS-NATIVE.zip");
const cockpitIp = "<COCKPIT_IP>";
const codexaIp = "<AI_BOX_IP>";
const port = 8097;
const trustedIps = process.env.ORANGEBOX_AI_BOX_TRUSTED_IPS
  || process.env.ORANGEBOX_CODEXA_TRUSTED_IPS
  || [cockpitIp, "10.0.99.2", "10.0.99.0/24"].join(",");
const tokenCmdPath = path.join(outDir, "SET_CONTROLLER_COMMAND_TOKEN.cmd");
const legacyTokenCmdPath = path.join(outDir, "SET_COCKPIT_COMMAND_TOKEN.cmd");

async function existingControllerToken() {
  if (process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN) return process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN;
  if (process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN) return process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN;
  if (process.env.ORANGEBOX_ROTATE_AI_BOX_TOKEN === "1") return "";
  try {
    let text = await fs.readFile(tokenCmdPath, "utf8").catch(() => "");
    if (!text) text = await fs.readFile(legacyTokenCmdPath, "utf8");
    const match = text.match(/setx\s+(?:ORANGEBOX_AI_BOX_COMMAND_TOKEN|ORANGEBOX_CODEXA_COMMAND_TOKEN)\s+"([^"]+)"/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function commandRailServerSource() {
  return String.raw`import http from "node:http";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = parseArgs(process.argv);
const root = path.resolve(args.root || "C:/AtomEons/ai-box/orangebox-command-rail");
const receiptRoot = path.resolve(args.receiptRoot || "C:/AtomEons/ai-box/receipts");
const fileRoot = path.resolve(args.fileRoot || "C:/AtomEons/ai-box/orangebox-command-rail/files");
const host = args.host || "0.0.0.0";
const port = Number(args.port || 8097);
const cockpitIp = args.cockpitIp || "<COCKPIT_IP>";
const trustedSourcesRaw = args.trustedIps || process.env.ORANGEBOX_AI_BOX_TRUSTED_IPS || process.env.ORANGEBOX_CODEXA_TRUSTED_IPS || [cockpitIp, "10.0.99.2", "10.0.99.0/24"].join(",");
const token = args.token || process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN || process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN || "";
const maxCommandMs = Number(args.maxCommandMs || 30 * 60 * 1000);

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith("--")) out[key.slice(2)] = argv[++i] || "";
  }
  return out;
}

async function ensure() {
  for (const dir of [root, receiptRoot, fileRoot, path.join(root, "logs")]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function tokenHash(value) {
  return crypto.createHash("sha256").update(value || "").digest("hex").slice(0, 16);
}

function compact(value, limit = 16000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  const half = Math.floor(limit / 2);
  return text.slice(0, half) + "\n...[orangebox truncated " + (text.length - limit) + " chars]...\n" + text.slice(-half);
}

function redact(value) {
  return String(value || "")
    .replace(/github_pat_[A-Za-z0-9_]+/g, "github_pat_[REDACTED]")
    .replace(/vcp_[A-Za-z0-9_]+/g, "vcp_[REDACTED]")
    .replace(/vck_[A-Za-z0-9_]+/g, "vck_[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "jwt_[REDACTED]")
    .replace(/(api[_-]?key|token|password|secret)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[REDACTED]");
}

function send(res, code, body, type = "application/json") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": type + "; charset=utf-8",
    "cache-control": "no-store",
    "x-orangebox-command-rail": "ai-box"
  });
  res.end(payload);
}

async function readBody(req, max = 4 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function clientIp(req) {
  const raw = String(req.socket.remoteAddress || "");
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function trustedSources() {
  return String(trustedSourcesRaw || "")
    .split(/[,;\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function ipToNumber(ip) {
  const parts = String(ip || "").split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
}

function cidrContains(cidr, ip) {
  const [base, bitsRaw] = String(cidr || "").split("/");
  const bits = Number(bitsRaw);
  const baseNum = ipToNumber(base);
  const ipNum = ipToNumber(ip);
  if (baseNum === null || ipNum === null || !Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (baseNum & mask) === (ipNum & mask);
}

function fromCockpit(req) {
  const ip = clientIp(req);
  if (ip === "127.0.0.1" || ip === "::1") return true;
  return trustedSources().some((source) => source === ip || source === "*" || (source.includes("/") && cidrContains(source, ip)));
}

function authed(req) {
  if (!token || !fromCockpit(req)) return false;
  const got = String(req.headers["x-orangebox-token"] || req.headers["x-orangebox-command-token"] || "");
  try {
    return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(token));
  } catch {
    return false;
  }
}

async function writeReceipt(kind, data) {
  await fs.mkdir(receiptRoot, { recursive: true });
  const receiptPath = path.join(receiptRoot, "orangebox-command-rail-" + kind + "-" + stamp() + ".json");
  const receipt = { generatedAt: new Date().toISOString(), kind, receiptPath, ...data };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  return receipt;
}

async function listReceipts(limit = 100) {
  try {
    const entries = await fs.readdir(receiptRoot, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(receiptRoot, entry.name);
      const stat = await fs.stat(file);
      rows.push({ name: entry.name, path: file, size: stat.size, mtime: stat.mtime.toISOString() });
    }
    return rows.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, limit);
  } catch {
    return [];
  }
}

function machineSnapshot() {
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    totalMemGb: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
    freeMemGb: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
    uptimeSec: Math.round(os.uptime()),
    user: os.userInfo().username
  };
}

async function runCommand(body) {
  if (body.confirmFullAccess !== true) {
    return writeReceipt("command-rejected", {
      status: "FAILED",
      reason: "confirmFullAccess true is required",
      commandHash: crypto.createHash("sha256").update(String(body.command || "")).digest("hex").slice(0, 16)
    });
  }
  const command = String(body.command || "").trim();
  if (!command) {
    return writeReceipt("command-rejected", { status: "FAILED", reason: "empty command" });
  }
  const shell = String(body.shell || "powershell").toLowerCase();
  const cwd = path.resolve(String(body.cwd || "C:/AtomEons"));
  const timeoutMs = Math.min(Math.max(Number(body.timeoutMs || 120000), 1000), maxCommandMs);
  const started = Date.now();
  const commandHash = crypto.createHash("sha256").update(command).digest("hex").slice(0, 16);
  const logPath = path.join(root, "logs", "command-" + stamp() + "-" + commandHash + ".log");
  const commandPreview = redact(command).slice(0, 800);
  const file = shell === "cmd" ? "cmd.exe" : "powershell.exe";
  const execArgs = shell === "cmd"
    ? ["/d", "/s", "/c", command]
    : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command];
  let result;
  try {
    const out = await execFileAsync(file, execArgs, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true
    });
    result = {
      status: "VERIFIED",
      exitCode: 0,
      stdout: compact(redact(out.stdout)),
      stderr: compact(redact(out.stderr))
    };
  } catch (error) {
    result = {
      status: "FAILED",
      exitCode: error.code ?? null,
      stdout: compact(redact(error.stdout)),
      stderr: compact(redact(error.stderr || error.message))
    };
  }
  await fs.writeFile(logPath, [
    "commandHash=" + commandHash,
    "cwd=" + cwd,
    "shell=" + shell,
    "status=" + result.status,
    "exitCode=" + result.exitCode,
    "",
    "COMMAND:",
    commandPreview,
    "",
    "STDOUT:",
    result.stdout,
    "",
    "STDERR:",
    result.stderr
  ].join("\n"), "utf8");
  return writeReceipt("command", {
    ...result,
    commandHash,
    commandPreview,
    shell,
    cwd,
    timeoutMs,
    totalMs: Date.now() - started,
    logPath,
    machine: machineSnapshot()
  });
}

function safePath(input) {
  const target = path.resolve(String(input || ""));
  if (!target.match(/^[A-Z]:\\/i)) throw new Error("absolute Windows path required");
  return target;
}

async function putFile(body) {
  if (body.confirmFullAccess !== true) {
    return writeReceipt("put-file-rejected", { status: "FAILED", reason: "confirmFullAccess true is required" });
  }
  const target = safePath(body.path);
  const bytes = Buffer.from(String(body.base64 || ""), "base64");
  if (!bytes.length) throw new Error("empty base64 payload");
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (body.sha256 && String(body.sha256).toLowerCase() !== sha256) throw new Error("sha256 mismatch");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
  return writeReceipt("put-file", {
    status: "VERIFIED",
    target,
    bytes: bytes.length,
    sha256,
    machine: machineSnapshot()
  });
}

async function getFile(body) {
  const target = safePath(body.path);
  const stat = await fs.stat(target);
  if (!stat.isFile()) throw new Error("target is not a file");
  if (stat.size > 64 * 1024 * 1024) throw new Error("file too large for direct get-file");
  const bytes = await fs.readFile(target);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const receipt = await writeReceipt("get-file", {
    status: "VERIFIED",
    target,
    bytes: bytes.length,
    sha256,
    machine: machineSnapshot()
  });
  return { ...receipt, base64: bytes.toString("base64") };
}

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, {
      status: token ? "VERIFIED" : "CONFIGURED_MISSING_TOKEN",
      role: "orangebox-ai-box-command-rail",
      generatedAt: new Date().toISOString(),
      host,
      port,
      cockpitIp,
      trustedSources: trustedSources(),
      clientIp: clientIp(req),
      tokenConfigured: Boolean(token),
      tokenHash: tokenHash(token),
      fullAccess: "AVAILABLE_WITH_TOKEN_AND_confirmFullAccess",
      machine: machineSnapshot()
    });
  }
  if (!authed(req)) {
    return send(res, 401, {
      status: "FAILED",
      error: "missing/invalid token or untrusted controller source",
      clientIp: clientIp(req),
      cockpitIp,
      trustedSources: trustedSources()
    });
  }
  if (req.method === "GET" && url.pathname === "/receipts") return send(res, 200, await listReceipts());
  if (req.method === "POST" && url.pathname === "/command") return send(res, 200, await runCommand(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/put-file") return send(res, 200, await putFile(await readBody(req, 128 * 1024 * 1024)));
  if (req.method === "POST" && url.pathname === "/get-file") return send(res, 200, await getFile(await readBody(req)));
  return send(res, 404, { status: "FAILED", error: "not found" });
}

await ensure();
const server = http.createServer((req, res) => handle(req, res).catch(async (error) => {
  try {
    await writeReceipt("server-error", { status: "FAILED", error: error.message, stack: compact(error.stack, 3000) });
  } catch {}
  send(res, 500, { status: "FAILED", error: error.message });
}));

server.listen(port, host, async () => {
  const receipt = await writeReceipt("server-start", {
    status: "VERIFIED",
    host,
    port,
    cockpitIp,
    trustedSources: trustedSources(),
    tokenConfigured: Boolean(token),
    tokenHash: tokenHash(token),
    machine: machineSnapshot()
  });
  console.log(JSON.stringify({
    status: "VERIFIED",
    url: "http://" + host + ":" + port + "/health",
    receiptPath: receipt.receiptPath
  }, null, 2));
});`;
}

function installScriptSource(token) {
  return String.raw`# OrangeBOX AI Box Command Rail installer
param(
  [string]$Token = "__TOKEN__",
  [string]$CockpitIp = "__COCKPIT__",
  [string]$TrustedIps = "__TRUSTED_IPS__",
  [int]$Port = __PORT__,
  [switch]$SkipNodeInstall
)

$ErrorActionPreference = "Stop"
$Root = "C:\AtomEons\ai-box\orangebox-command-rail"
$ReceiptRoot = "C:\AtomEons\ai-box\receipts"
$ServerSource = Join-Path $PSScriptRoot "codexa-command-rail-server.mjs"
$ServerTarget = Join-Path $Root "codexa-command-rail-server.mjs"
$TokenPath = Join-Path $Root "ORANGEBOX_AI_BOX_COMMAND_TOKEN.txt"
$LegacyTokenPath = Join-Path $Root "ORANGEBOX_CODEXA_COMMAND_TOKEN.txt"
$TaskName = "OrangeBOX AI Box Command Rail"
$RuleName = "OrangeBOX AI Box Command Rail From Controller"

function Assert-Admin {
  $Identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $Principal = New-Object Security.Principal.WindowsPrincipal($Identity)
  if (-not $Principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this installer from an Administrator PowerShell."
  }
}

function Get-Node {
  $Cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($Cmd) { return $Cmd.Source }
  if (-not $SkipNodeInstall) {
    $Winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($Winget) {
      Write-Host "Node.js not found. Installing Node.js LTS with winget..." -ForegroundColor Yellow
      winget install OpenJS.NodeJS.LTS --silent --accept-source-agreements --accept-package-agreements
      $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
      $Cmd = Get-Command node -ErrorAction SilentlyContinue
      if ($Cmd) { return $Cmd.Source }
    }
  }
  throw "Node.js is required. Install Node LTS, then rerun this installer."
}

Assert-Admin
New-Item -ItemType Directory -Force -Path $Root,$ReceiptRoot,(Join-Path $Root "logs") | Out-Null
Copy-Item -LiteralPath $ServerSource -Destination $ServerTarget -Force
$Token | Set-Content -Path $TokenPath -Encoding UTF8
$Token | Set-Content -Path $LegacyTokenPath -Encoding UTF8

$Node = Get-Node
$TrustedIpList = $TrustedIps -split '[,; ]+' | Where-Object { $_ }
if (-not $TrustedIpList -or $TrustedIpList.Count -eq 0) { $TrustedIpList = @($CockpitIp) }
$ArgLine = '"' + $ServerTarget + '" --host 0.0.0.0 --port ' + $Port + ' --cockpitIp ' + $CockpitIp + ' --trustedIps "' + ($TrustedIpList -join ',') + '" --token "' + $Token + '"'

Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
$Action = New-ScheduledTaskAction -Execute $Node -Argument $ArgLine -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 7)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Full-access OrangeBOX AI Box command rail for controller $CockpitIp" | Out-Null

Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "codexa-command-rail-server\.mjs|orangebox-command-rail-server\.mjs" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath $Node -ArgumentList $ArgLine -WorkingDirectory $Root -WindowStyle Hidden

Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $TrustedIpList -Action Allow | Out-Null

Start-Sleep -Seconds 3
try {
  $Health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "http://127.0.0.1:$Port/health"
  $HealthStatus = "VERIFIED"
} catch {
  $HealthStatus = "FAILED: $($_.Exception.Message)"
}

$Receipt = Join-Path $ReceiptRoot ("orangebox-command-rail-install-{0}.md" -f (Get-Date -Format yyyyMMdd-HHmmss))
$TokenHash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Token))).Replace("-","").Substring(0,16).ToLowerInvariant()
@"
# OrangeBOX AI Box Command Rail Install Receipt

Generated: $((Get-Date).ToUniversalTime().ToString("o"))

## result

$HealthStatus

## evidence

- Server: $ServerTarget
- Health: http://127.0.0.1:$Port/health
- LAN health target: http://<LAN_FALLBACK_IP>:$Port/health
- Firewall rule: $RuleName from $($TrustedIpList -join ',')
- Scheduled task: $TaskName
- Node: $Node
- Token configured: true
- Token hash prefix: $TokenHash
- Full access endpoint: POST /command requires token plus confirmFullAccess=true

## rollback

Run UNINSTALL_AI_BOX_COMMAND_RAIL.ps1 as Administrator.
"@ | Set-Content -Path $Receipt -Encoding UTF8

Write-Host "OrangeBOX AI Box Command Rail installed." -ForegroundColor Green
Write-Host "Health: http://<AI_BOX_IP>:$Port/health" -ForegroundColor Green
Write-Host "Trusted controller sources: $($TrustedIpList -join ',')" -ForegroundColor Green
Write-Host "Receipt: $Receipt" -ForegroundColor Green
`.replace("__TOKEN__", token).replace("__COCKPIT__", cockpitIp).replace("__TRUSTED_IPS__", trustedIps).replace("__PORT__", String(port));
}

function uninstallScriptSource() {
  return String.raw`# OrangeBOX AI Box Command Rail uninstall
$ErrorActionPreference = "Continue"
$TaskName = "OrangeBOX AI Box Command Rail"
$RuleName = "OrangeBOX AI Box Command Rail From Controller"

Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
Get-CimInstance Win32_Process -Filter "name = 'node.exe'" |
  Where-Object { $_.CommandLine -match "codexa-command-rail-server\.mjs|orangebox-command-rail-server\.mjs" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host "OrangeBOX AI Box Command Rail stopped and unregistered." -ForegroundColor Yellow
`;
}

function orderSource(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `ORANGEBOX AI BOX APPLIANCE ORDER

You are on the AI Box. Ignore old Codex/orangebox handoff behavior. Do not ask for project context. Do not run Codex. Your only task is to install or repair the OrangeBOX AI Box Command Rail.

1. Extract this zip to:
   C:\\AtomEons\\ai-box\\orangebox-command-rail-pack

2. Right-click RUN_AS_ADMIN_ON_AI_BOX.cmd and choose "Run as administrator".

3. Wait for:
   OrangeBOX AI Box Command Rail installed.

4. Verify locally:
   http://127.0.0.1:${port}/health

5. Report only these facts back to AE See-Suite:
   - install result
   - health URL
   - receipt path
   - token hash prefix: ${hash}

Do not change projects. Do not install Codex. Do not open broad firewall access. The installer only allows trusted controller sources (${trustedIps}) to reach port ${port}.
`;
}

function readmeSource(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `# OrangeBOX AI Box Command Rail Pack

This replaces ad hoc remote shell work with a direct OrangeBOX AI Box appliance bridge.

## What it does

- Runs a token-gated full-access command rail on the AI Box at port ${port}.
- Allows only trusted controller sources (${trustedIps}) through Windows Firewall.
- Writes receipts for every command, file upload, file download, startup, and error.
- Does not install or require Codex on the AI Box.

## Install on the AI Box

Run as Administrator:

\`\`\`powershell
cd C:\\AtomEons\\ai-box\\orangebox-command-rail-pack
powershell -ExecutionPolicy Bypass -File .\\INSTALL_AI_BOX_COMMAND_RAIL.ps1
\`\`\`

Or right-click:

\`\`\`text
RUN_AS_ADMIN_ON_AI_BOX.cmd
\`\`\`

## Repair token mismatch

If AE Operations says \`TOKEN_MISMATCH\`, the controller can see the AI Box health rail but cannot execute commands yet. Run \`RUN_REPAIR_AI_BOX_COMMAND_RAIL.cmd\` on the AI Box as Administrator. It reuses this pack's controller token, restarts the rail, and keeps the firewall limited to trusted controller sources.

## Controller token

Run this on the controller machine after generating the pack:

\`\`\`text
SET_CONTROLLER_COMMAND_TOKEN.cmd
\`\`\`

Token hash prefix:

\`\`\`text
${hash}
\`\`\`

## Endpoints

- Public health: \`GET /health\`
- Token-gated receipts: \`GET /receipts\`
- Token-gated full command: \`POST /command\`
- Token-gated file write: \`POST /put-file\`
- Token-gated file read: \`POST /get-file\`

Command requests must include \`confirmFullAccess: true\`. This is intentional so accidental UI calls do not execute.

## Rollback

Run as Administrator on the AI Box:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\UNINSTALL_AI_BOX_COMMAND_RAIL.ps1
\`\`\`
`;
}

function repairSource(token) {
  const hash = crypto.createHash("sha256").update(token).digest("hex").slice(0, 16);
  return `# AI Box Command Rail Repair

AE Operations can be in a partly-live state:

- Direct AI Box health: online
- Ethereal file pipe: online
- Command execution: blocked

That usually means the running AI Box rail has an older token than the controller. This pack was generated with controller token hash prefix:

\`\`\`text
${hash}
\`\`\`

## Repair on the AI Box

Run this command from an Administrator PowerShell on the AI Box:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\INSTALL_AI_BOX_COMMAND_RAIL.ps1
\`\`\`

Or right-click:

\`\`\`text
RUN_REPAIR_AI_BOX_COMMAND_RAIL.cmd
\`\`\`

## Verify from the controller

\`\`\`powershell
node -e "fetch('http://127.0.0.1:8787/api/status?fast=1').then(r=>r.json()).then(j=>console.log(JSON.stringify(j.commandRail,null,2)))"
\`\`\`

The repair is done when \`commandRail.auth.command_execution_ready\` is \`true\`.
`;
}

function cockpitClientSource(token) {
  return String.raw`param(
  [string]$Command = "hostname; whoami; Get-Date; Get-ComputerInfo | Select-Object CsName,OsName,OsArchitecture,CsTotalPhysicalMemory",
  [string]$Cwd = "C:\AtomEons",
  [int]$TimeoutMs = 120000
)

$ErrorActionPreference = "Stop"
$Token = "__TOKEN__"
$Body = @{
  shell = "powershell"
  cwd = $Cwd
  command = $Command
  timeoutMs = $TimeoutMs
  confirmFullAccess = $true
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri "http://__CODEXA__:__PORT__/command" -Headers @{ "x-orangebox-token" = $Token } -ContentType "application/json" -Body $Body
`.replace("__TOKEN__", token).replace("__CODEXA__", codexaIp).replace("__PORT__", String(port));
}

function psSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function compressArchive(sourceDir, targetZip) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$src = ${psSingleQuote(path.join(sourceDir, "*"))}`,
    `$dst = ${psSingleQuote(targetZip)}`,
    "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
    "Compress-Archive -Path $src -DestinationPath $dst -CompressionLevel Optimal -Force"
  ].join("; ");
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { stdio: "pipe", windowsHide: true });
  }

async function main() {
  const token = await existingControllerToken() || crypto.randomBytes(32).toString("base64url");
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "codexa-command-rail-server.mjs"), commandRailServerSource(), "utf8");
  await fs.writeFile(path.join(outDir, "INSTALL_AI_BOX_COMMAND_RAIL.ps1"), installScriptSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "UNINSTALL_AI_BOX_COMMAND_RAIL.ps1"), uninstallScriptSource(), "utf8");
  await fs.writeFile(path.join(outDir, "RUN_AS_ADMIN_ON_AI_BOX.cmd"), "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_AI_BOX_COMMAND_RAIL.ps1\"\r\npause\r\n", "utf8");
  await fs.writeFile(path.join(outDir, "RUN_REPAIR_AI_BOX_COMMAND_RAIL.cmd"), "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_AI_BOX_COMMAND_RAIL.ps1\"\r\npause\r\n", "utf8");
  await fs.writeFile(path.join(outDir, "SET_CONTROLLER_COMMAND_TOKEN.cmd"), `@echo off\r\nsetx ORANGEBOX_AI_BOX_COMMAND_TOKEN "${token}"\r\nsetx ORANGEBOX_CODEXA_COMMAND_TOKEN "${token}"\r\necho Restart ORANGEBOX/terminal after setting ORANGEBOX_AI_BOX_COMMAND_TOKEN.\r\n`, "utf8");
  await fs.writeFile(path.join(outDir, "INSTALL_CODEXA_COMMAND_RAIL.ps1"), installScriptSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "UNINSTALL_CODEXA_COMMAND_RAIL.ps1"), uninstallScriptSource(), "utf8");
  await fs.writeFile(path.join(outDir, "RUN_AS_ADMIN_ON_CODEXA.cmd"), "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_AI_BOX_COMMAND_RAIL.ps1\"\r\npause\r\n", "utf8");
  await fs.writeFile(path.join(outDir, "SET_COCKPIT_COMMAND_TOKEN.cmd"), `@echo off\r\nsetx ORANGEBOX_AI_BOX_COMMAND_TOKEN "${token}"\r\nsetx ORANGEBOX_CODEXA_COMMAND_TOKEN "${token}"\r\necho Restart ORANGEBOX/terminal after setting ORANGEBOX_AI_BOX_COMMAND_TOKEN.\r\n`, "utf8");
  await fs.writeFile(path.join(outDir, "RUN_COMMAND_FROM_COCKPIT.ps1"), cockpitClientSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "ORDER_TO_AI_BOX.txt"), orderSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "ORDER_TO_CODEXA.txt"), orderSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "AI_BOX_COMMAND_RAIL_REPAIR.md"), repairSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "README.md"), readmeSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "VERIFY_FROM_COCKPIT.ps1"), `Invoke-WebRequest -UseBasicParsing http://${codexaIp}:${port}/health\r\n`, "utf8");
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    role: "orangebox-ai-box-command-rail-pack",
    aiBoxIp: codexaIp,
    codexaIp,
    cockpitIp,
    trustedIps,
    port,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex").slice(0, 16),
    noCodexRequired: true,
    fullAccess: "POST /command with token and confirmFullAccess=true",
    files: [
      "codexa-command-rail-server.mjs",
      "INSTALL_AI_BOX_COMMAND_RAIL.ps1",
      "UNINSTALL_AI_BOX_COMMAND_RAIL.ps1",
      "RUN_AS_ADMIN_ON_AI_BOX.cmd",
      "RUN_REPAIR_AI_BOX_COMMAND_RAIL.cmd",
      "SET_CONTROLLER_COMMAND_TOKEN.cmd",
      "INSTALL_CODEXA_COMMAND_RAIL.ps1",
      "UNINSTALL_CODEXA_COMMAND_RAIL.ps1",
      "RUN_AS_ADMIN_ON_CODEXA.cmd",
      "SET_COCKPIT_COMMAND_TOKEN.cmd",
      "RUN_COMMAND_FROM_COCKPIT.ps1",
      "ORDER_TO_AI_BOX.txt",
      "ORDER_TO_CODEXA.txt",
      "AI_BOX_COMMAND_RAIL_REPAIR.md",
      "VERIFY_FROM_COCKPIT.ps1",
      "README.md"
    ]
  }, null, 2), "utf8");

  await fs.rm(zipPath, { force: true });
  await fs.rm(latestZipPath, { force: true });
  await fs.rm(latestAiBoxZipPath, { force: true });
  compressArchive(outDir, zipPath);
  await fs.copyFile(zipPath, latestZipPath);
  await fs.copyFile(zipPath, latestAiBoxZipPath);
  const stat = await fs.stat(zipPath);
  const receiptDir = path.join(orangeRoot, "receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `codexa-command-rail-pack-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(receiptPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    outDir,
    zipPath,
    latestZipPath,
    latestAiBoxZipPath,
    zipBytes: stat.size,
    aiBoxIp: codexaIp,
    codexaIp,
    cockpitIp,
    trustedIps,
    port,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex").slice(0, 16),
    nextAction: "Copy/extract on the AI Box, run RUN_REPAIR_AI_BOX_COMMAND_RAIL.cmd or RUN_AS_ADMIN_ON_AI_BOX.cmd as Administrator, run SET_CONTROLLER_COMMAND_TOKEN.cmd on the controller if needed, then verify commandRail.auth.command_execution_ready from OrangeBOX."
  }, null, 2), "utf8");
  console.log(JSON.stringify({ status: "VERIFIED", outDir, zipPath, latestZipPath, latestAiBoxZipPath, zipBytes: stat.size, receiptPath }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", error: error.message }, null, 2));
  process.exit(1);
});
