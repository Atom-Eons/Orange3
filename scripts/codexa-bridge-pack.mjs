import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import { execFileSync } from "node:child_process";

const orangeRoot = process.env.ORANGEBOX_ROOT
  || process.env.ORANGEBOX_DATA_ROOT
  || path.join(process.env.USERPROFILE || process.env.HOME || "C:/Users/a", "OrangeBox-Data");
const outDir = path.join(orangeRoot, "exports", "codexa-bridge-pack");
const zipPath = path.join(orangeRoot, "exports", "codexa-bridge-pack-WINDOWS-NATIVE-2026-05-05.zip");
const latestZipPath = path.join(orangeRoot, "exports", "codexa-bridge-pack-WINDOWS-NATIVE.zip");
const cockpitIp = "<COCKPIT_IP>";
const codexaIp = "<AI_BOX_IP>";
const port = 8098;
const trustedIps = process.env.ORANGEBOX_CODEXA_TRUSTED_IPS || [cockpitIp, "10.0.99.2", "10.0.99.0/24"].join(",");

function bridgeServerSource() {
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
const root = path.resolve(args.root || "C:/AtomEons/ai-box/orangebox-bridge");
const wikiRoot = path.resolve(args.wikiRoot || "C:/AtomEons/ai-box/orangebox-wiki/public");
const receiptRoot = path.resolve(args.receiptRoot || "C:/AtomEons/ai-box/receipts");
const uploadRoot = path.resolve(args.uploadRoot || "C:/AtomEons/ai-box/orangebox-bridge/uploads");
const jobRoot = path.resolve(args.jobRoot || "C:/AtomEons/ai-box/orangebox-bridge/jobs");
const host = args.host || "0.0.0.0";
const port = Number(args.port || 8098);
const token = args.token || process.env.ORANGEBOX_BRIDGE_TOKEN || "";

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith("--")) out[key.slice(2)] = argv[++i] || "";
  }
  return out;
}

async function ensure() {
  for (const dir of [root, receiptRoot, uploadRoot, jobRoot]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

function send(res, code, body, type = "application/json") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": type + "; charset=utf-8",
    "cache-control": "no-store",
    "x-orangebox-bridge": "codexa"
  });
  res.end(payload);
}

async function readBody(req, max = 260 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function tokenHash(value) {
  return crypto.createHash("sha256").update(value || "").digest("hex").slice(0, 16);
}

function authed(req) {
  if (!token) return false;
  const got = req.headers["x-orangebox-token"] || "";
  try {
    return crypto.timingSafeEqual(Buffer.from(String(got)), Buffer.from(String(token)));
  } catch {
    return false;
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeReceipt(kind, data) {
  await fs.mkdir(receiptRoot, { recursive: true });
  const receiptPath = path.join(receiptRoot, "orangebox-bridge-" + kind + "-" + stamp() + ".json");
  const receipt = { generatedAt: new Date().toISOString(), kind, receiptPath, ...data };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  return receipt;
}

async function listReceipts(limit = 60) {
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

async function probe(url) {
  const started = Date.now();
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 5000);
    const res = await fetch(url, { signal: ac.signal });
    const text = await res.text();
    clearTimeout(timer);
    return { url, status: res.ok ? "VERIFIED" : "FAILED", code: res.status, ms: Date.now() - started, bytes: text.length };
  } catch (error) {
    return { url, status: error.name === "AbortError" ? "TIMEOUT" : "FAILED", ms: Date.now() - started, error: error.message };
  }
}

async function runAllowedBenchmark(body) {
  const label = String(body?.label || "codexa-bridge-benchmark").replace(/[^a-z0-9_.-]+/gi, "-").slice(0, 80);
  const id = stamp() + "-" + label;
  const started = Date.now();
  const commands = [
    { name: "node-version", file: process.execPath, args: ["--version"], cwd: root },
    { name: "wiki-local", probe: "http://127.0.0.1:8099/" },
    { name: "wiki-lan", probe: "http://<AI_BOX_IP>:8099/" }
  ];
  const results = [];
  for (const command of commands) {
    const t0 = Date.now();
    if (command.probe) {
      results.push({ name: command.name, ...(await probe(command.probe)) });
      continue;
    }
    try {
      const out = await execFileAsync(command.file, command.args, {
        cwd: command.cwd,
        timeout: 60000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true
      });
      results.push({ name: command.name, status: "VERIFIED", ms: Date.now() - t0, stdout: out.stdout.trim().slice(-1200), stderr: out.stderr.trim().slice(-1200) });
    } catch (error) {
      results.push({ name: command.name, status: "FAILED", ms: Date.now() - t0, code: error.code, stdout: String(error.stdout || "").slice(-1200), stderr: String(error.stderr || error.message).slice(-1200) });
    }
  }
  const receipt = await writeReceipt("benchmark", {
    status: results.every((row) => row.status === "VERIFIED") ? "VERIFIED" : "FAILED",
    id,
    label,
    totalMs: Date.now() - started,
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemGb: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
      freeMemGb: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10
    },
    results
  });
  return receipt;
}

function compact(value, limit = 12000) {
  const text = String(value || "");
  if (text.length <= limit) return text;
  return text.slice(0, Math.floor(limit / 2)) + "\n...[orangebox truncated " + (text.length - limit) + " chars]...\n" + text.slice(-Math.floor(limit / 2));
}

function allowedJobs() {
  return {
    "codexa-self-check": {
      description: "Read-only AI Box worker baseline: Node, memory, wiki probes, receipt count.",
      timeoutMs: 90000,
      steps: [
        { name: "system-snapshot", kind: "system" },
        { name: "node-version", kind: "exec", file: process.execPath, args: ["--version"], timeoutMs: 30000 },
        { name: "wiki-local", kind: "probe", url: "http://127.0.0.1:8099/" },
        { name: "wiki-lan", kind: "probe", url: "http://<AI_BOX_IP>:8099/" },
        { name: "receipt-count", kind: "receipts" }
      ]
    },
    "codexa-docker-status": {
      description: "Read-only Docker status for the AI Box.",
      timeoutMs: 90000,
      steps: [
        { name: "docker-version", kind: "exec", file: "docker", args: ["version", "--format", "{{.Server.Version}}"], timeoutMs: 45000 },
        { name: "docker-containers", kind: "exec", file: "docker", args: ["ps", "--format", "{{.Names}}\t{{.Status}}"], timeoutMs: 45000 }
      ]
    },
    "codexa-ollama-status": {
      description: "Read-only Ollama model inventory if Ollama is installed.",
      timeoutMs: 90000,
      steps: [
        { name: "ollama-list", kind: "exec", file: "ollama", args: ["list"], timeoutMs: 60000 }
      ]
    },
    "codexa-openclaw-status": {
      description: "Read-only OpenClaw detection on the AI Box.",
      timeoutMs: 60000,
      steps: [
        { name: "openclaw-paths", kind: "openclaw" },
        { name: "openclaw-canvas", kind: "probe", url: "http://127.0.0.1:18789/__openclaw__/canvas/" }
      ]
    }
  };
}

async function runStep(step) {
  const started = Date.now();
  if (step.kind === "probe") {
    return { name: step.name, ...(await probe(step.url)) };
  }
  if (step.kind === "system") {
    return {
      name: step.name,
      status: "VERIFIED",
      ms: Date.now() - started,
      machine: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemGb: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 10) / 10,
        freeMemGb: Math.round(os.freemem() / 1024 / 1024 / 1024 * 10) / 10,
        uptimeSec: Math.round(os.uptime())
      }
    };
  }
  if (step.kind === "receipts") {
    const rows = await listReceipts(5000);
    return { name: step.name, status: "VERIFIED", ms: Date.now() - started, count: rows.length, latest: rows[0]?.name || "" };
  }
  if (step.kind === "openclaw") {
    const roots = [
      "C:/AtomEons/agent-stack/npm-tools/node_modules/openclaw",
      "C:/Users/a/.openclaw-atomeons",
      "C:/Users/a/.openclaw-atomeons/openclaw.json"
    ];
    const paths = [];
    for (const target of roots) {
      try {
        const stat = await fs.stat(target);
        paths.push({ target, exists: true, directory: stat.isDirectory(), size: stat.size, mtime: stat.mtime.toISOString() });
      } catch {
        paths.push({ target, exists: false });
      }
    }
    const configured = paths.some((row) => row.exists);
    return { name: step.name, status: configured ? "CONFIGURED" : "MISSING_RUNTIME", ms: Date.now() - started, paths };
  }
  if (step.kind === "exec") {
    try {
      const out = await execFileAsync(step.file, step.args || [], {
        cwd: root,
        timeout: step.timeoutMs || 60000,
        maxBuffer: 4 * 1024 * 1024,
        windowsHide: true
      });
      return { name: step.name, status: "VERIFIED", ms: Date.now() - started, stdout: compact(out.stdout), stderr: compact(out.stderr) };
    } catch (error) {
      return {
        name: step.name,
        status: "FAILED",
        ms: Date.now() - started,
        code: error.code || null,
        stdout: compact(error.stdout),
        stderr: compact(error.stderr || error.message)
      };
    }
  }
  return { name: step.name || "unknown", status: "FAILED", ms: Date.now() - started, error: "unknown step kind" };
}

async function runAllowedJob(body) {
  const jobId = String(body?.jobId || "");
  const jobs = allowedJobs();
  const job = jobs[jobId];
  if (!job) {
    return writeReceipt("job-rejected", {
      status: "FAILED",
      jobId,
      error: "unknown jobId",
      allowedJobIds: Object.keys(jobs)
    });
  }
  const started = Date.now();
  const label = String(body?.label || jobId).replace(/[^a-z0-9_.-]+/gi, "-").slice(0, 80);
  const results = [];
  for (const step of job.steps) {
    results.push(await runStep(step));
  }
  const hardFailed = results.some((row) => row.status === "FAILED");
  return writeReceipt("job", {
    status: hardFailed ? "FAILED" : "VERIFIED",
    jobId,
    label,
    description: job.description,
    totalMs: Date.now() - started,
    allowedOnly: true,
    destructive: false,
    results
  });
}

async function applyWiki(req) {
  const body = await readBody(req);
  const id = stamp() + "-wiki-upload";
  const upload = path.join(uploadRoot, id + ".zip");
  const staging = path.join(uploadRoot, id);
  await fs.writeFile(upload, body);
  await fs.mkdir(staging, { recursive: true });
  await execFileAsync("tar.exe", ["-xf", upload, "-C", staging], { timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
  const publicCandidate = fssync.existsSync(path.join(staging, "wiki-public")) ? path.join(staging, "wiki-public") : staging;
  await fs.mkdir(wikiRoot, { recursive: true });
  await execFileAsync("robocopy.exe", [publicCandidate, wikiRoot, "/MIR", "/XD", ".git", "node_modules"], { timeout: 180000, maxBuffer: 2 * 1024 * 1024, windowsHide: true }).catch((error) => {
    const code = Number(error.code || 0);
    if (code > 7) throw error;
  });
  return writeReceipt("apply-wiki", {
    status: "VERIFIED",
    upload,
    staging,
    wikiRoot,
    bytes: body.length
  });
}

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/health") {
    return send(res, 200, {
      status: "VERIFIED",
      role: "codexa-orangebox-bridge",
      generatedAt: new Date().toISOString(),
      host,
      port,
      tokenConfigured: Boolean(token),
      tokenHash: tokenHash(token),
      wikiRoot,
      receiptRoot
    });
  }
  if (!authed(req)) return send(res, 401, { status: "FAILED", error: "missing or invalid x-orangebox-token" });
  if (req.method === "GET" && url.pathname === "/jobs") return send(res, 200, Object.entries(allowedJobs()).map(([id, job]) => ({ id, description: job.description, timeoutMs: job.timeoutMs })));
  if (req.method === "GET" && url.pathname === "/receipts") return send(res, 200, await listReceipts());
  if (req.method === "POST" && url.pathname === "/run-benchmark") {
    const raw = await readBody(req, 1024 * 1024);
    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    return send(res, 200, await runAllowedBenchmark(body));
  }
  if (req.method === "POST" && url.pathname === "/run-job") {
    const raw = await readBody(req, 1024 * 1024);
    const body = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    return send(res, 200, await runAllowedJob(body));
  }
  if (req.method === "POST" && url.pathname === "/apply-wiki") return send(res, 200, await applyWiki(req));
  return send(res, 404, { status: "FAILED", error: "not found" });
}

await ensure();
const server = http.createServer((req, res) => handle(req, res).catch((error) => send(res, 500, { status: "FAILED", error: error.message })));
server.listen(port, host, async () => {
  const receipt = await writeReceipt("server-start", { status: "VERIFIED", host, port, tokenConfigured: Boolean(token), tokenHash: tokenHash(token) });
  console.log(JSON.stringify({ status: "VERIFIED", url: "http://" + host + ":" + port + "/health", receiptPath: receipt.receiptPath }, null, 2));
});`;
}

function installScriptSource(token) {
  return String.raw`# OrangeBOX AI Box Bridge installer
param(
  [string]$Token = "__TOKEN__",
  [string]$CockpitIp = "__COCKPIT__",
  [string]$TrustedIps = "__TRUSTED_IPS__",
  [int]$Port = __PORT__
)

$ErrorActionPreference = "Stop"
$Root = "C:\AtomEons\ai-box\orangebox-bridge"
$ReceiptRoot = "C:\AtomEons\ai-box\receipts"
$ServerSource = Join-Path $PSScriptRoot "codexa-bridge-server.mjs"
$ServerTarget = Join-Path $Root "codexa-bridge-server.mjs"
$TokenPath = Join-Path $Root "ORANGEBOX_BRIDGE_TOKEN.txt"
$TaskName = "OrangeBOX AI Box Bridge"
$RuleName = "OrangeBOX AI Box Bridge From Controller"

New-Item -ItemType Directory -Force -Path $Root,$ReceiptRoot | Out-Null
Copy-Item -LiteralPath $ServerSource -Destination $ServerTarget -Force
$Token | Set-Content -Path $TokenPath -Encoding UTF8

$Node = (Get-Command node -ErrorAction Stop).Source
$ArgLine = '"' + $ServerTarget + '" --host 0.0.0.0 --port ' + $Port + ' --token "' + $Token + '"'
$TrustedIpList = $TrustedIps -split '[,; ]+' | Where-Object { $_ }
if (-not $TrustedIpList -or $TrustedIpList.Count -eq 0) { $TrustedIpList = @($CockpitIp) }

Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
$Action = New-ScheduledTaskAction -Execute $Node -Argument $ArgLine -WorkingDirectory $Root
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Days 7)
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Description "Token-gated OrangeBOX bridge for controller $CockpitIp" | Out-Null

Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $Node } |
  Where-Object { (Get-CimInstance Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "codexa-bridge-server\.mjs" } |
  Stop-Process -Force -ErrorAction SilentlyContinue

Start-Process -FilePath $Node -ArgumentList $ArgLine -WorkingDirectory $Root -WindowStyle Hidden

Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule
New-NetFirewallRule -DisplayName $RuleName -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $TrustedIpList -Action Allow | Out-Null

Start-Sleep -Seconds 3
$Health = $null
try {
  $Health = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri "http://127.0.0.1:$Port/health"
  $HealthStatus = "VERIFIED"
} catch {
  $HealthStatus = "FAILED: $($_.Exception.Message)"
}

$Receipt = Join-Path $ReceiptRoot ("orangebox-bridge-install-{0}.md" -f (Get-Date -Format yyyyMMdd-HHmmss))
$TokenHash = [System.BitConverter]::ToString([System.Security.Cryptography.SHA256]::Create().ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Token))).Replace("-","").Substring(0,16).ToLowerInvariant()
@"
# OrangeBOX AI Box Bridge Install Receipt

Generated: $((Get-Date).ToUniversalTime().ToString("o"))

## result

$HealthStatus

## evidence

- Server: $ServerTarget
- Health: http://127.0.0.1:$Port/health
- LAN health target: http://<AI_BOX_IP>:$Port/health
- Firewall rule: $RuleName from $($TrustedIpList -join ',')
- Scheduled task: $TaskName
- Token configured: true
- Token hash prefix: $TokenHash

## rollback

Unregister-ScheduledTask -TaskName "$TaskName" -Confirm:$false
Remove-NetFirewallRule -DisplayName "$RuleName"
Stop node process running codexa-bridge-server.mjs
"@ | Set-Content -Path $Receipt -Encoding UTF8

Write-Host "OrangeBOX bridge installed." -ForegroundColor Green
Write-Host "Health: http://<AI_BOX_IP>:$Port/health" -ForegroundColor Green
Write-Host "Trusted controller sources: $($TrustedIpList -join ',')" -ForegroundColor Green
Write-Host "Receipt: $Receipt" -ForegroundColor Green
`.replace("__TOKEN__", token).replace("__COCKPIT__", cockpitIp).replace("__TRUSTED_IPS__", trustedIps).replace("__PORT__", String(port));
}

function readmeSource(token) {
  return `# OrangeBOX AI Box Bridge Pack

Run on the AI Box.

## Install

Right-click PowerShell and run as Administrator, then:

\`\`\`powershell
cd C:\\AtomEons\\ai-box\\codexa-bridge-pack
powershell -ExecutionPolicy Bypass -File .\\INSTALL_CODEXA_BRIDGE.ps1
\`\`\`

## Verify from AE See-Suite

\`\`\`powershell
Invoke-WebRequest -UseBasicParsing http://${codexaIp}:${port}/health
\`\`\`

Protected calls require the bridge token. The controller token command is included in \`SET_COCKPIT_TOKEN.cmd\`.

## Scope

- Public health: \`GET /health\`
- Token-gated: \`GET /receipts\`, \`POST /run-benchmark\`, \`POST /apply-wiki\`
- No arbitrary shell endpoint.
- Firewall is restricted to trusted controller sources (${trustedIps}).

Token hash prefix:

\`\`\`text
${crypto.createHash("sha256").update(token).digest("hex").slice(0, 16)}
\`\`\`
`;
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
  const token = process.env.ORANGEBOX_BRIDGE_TOKEN || crypto.randomBytes(32).toString("base64url");
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "codexa-bridge-server.mjs"), bridgeServerSource(), "utf8");
  await fs.writeFile(path.join(outDir, "INSTALL_CODEXA_BRIDGE.ps1"), installScriptSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "RUN_AS_ADMIN_ON_CODEXA.cmd"), "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_CODEXA_BRIDGE.ps1\"\r\npause\r\n", "utf8");
  await fs.writeFile(path.join(outDir, "SET_COCKPIT_TOKEN.cmd"), `@echo off\r\nsetx ORANGEBOX_BRIDGE_TOKEN "${token}"\r\necho Restart your terminal/app after setting ORANGEBOX_BRIDGE_TOKEN.\r\n`, "utf8");
  await fs.writeFile(path.join(outDir, "README.md"), readmeSource(token), "utf8");
  await fs.writeFile(path.join(outDir, "VERIFY_FROM_COCKPIT.ps1"), `Invoke-WebRequest -UseBasicParsing http://${codexaIp}:${port}/health\r\n`, "utf8");
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    codexaIp,
    cockpitIp,
    trustedIps,
    port,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex").slice(0, 16),
    files: [
      "codexa-bridge-server.mjs",
      "INSTALL_CODEXA_BRIDGE.ps1",
      "RUN_AS_ADMIN_ON_CODEXA.cmd",
      "SET_COCKPIT_TOKEN.cmd",
      "VERIFY_FROM_COCKPIT.ps1",
      "README.md"
    ]
  }, null, 2), "utf8");

  await fs.rm(zipPath, { force: true });
  await fs.rm(latestZipPath, { force: true });
  compressArchive(outDir, zipPath);
  await fs.copyFile(zipPath, latestZipPath);
  const stat = await fs.stat(zipPath);
  const receiptDir = path.join(orangeRoot, "receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptPath = path.join(receiptDir, `codexa-bridge-pack-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  await fs.writeFile(receiptPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    outDir,
    zipPath,
    latestZipPath,
    zipBytes: stat.size,
    codexaIp,
    cockpitIp,
    trustedIps,
    port,
    tokenHash: crypto.createHash("sha256").update(token).digest("hex").slice(0, 16),
    nextAction: "Copy zip to the AI Box, extract to C:\\AtomEons\\ai-box\\codexa-bridge-pack, run INSTALL_CODEXA_BRIDGE.ps1 as Administrator, then run SET_COCKPIT_TOKEN.cmd on the controller."
  }, null, 2), "utf8");
  console.log(JSON.stringify({ status: "VERIFIED", outDir, zipPath, latestZipPath, zipBytes: stat.size, receiptPath }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", error: error.message }, null, 2));
  process.exit(1);
});
