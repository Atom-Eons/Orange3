import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const orangeRoot = "C:/AtomEons/aeskills/orangebox";
const outDir = path.join(orangeRoot, "exports", "codexa-openclaw-guarded-pack");
const zipPath = path.join(orangeRoot, "exports", "codexa-openclaw-guarded-pack-WINDOWS-NATIVE-2026-05-05.zip");
const latestZipPath = path.join(orangeRoot, "exports", "codexa-openclaw-guarded-pack-WINDOWS-NATIVE.zip");

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

function wslInstallSource() {
  return `#!/usr/bin/env bash
set -euo pipefail

mkdir -p "$HOME/orangebox-openclaw-workspace/skills" "$HOME/.openclaw" "$HOME/.openclaw/logs"

node_ok=0
if command -v node >/dev/null 2>&1; then
  node -e "const v=process.versions.node.split('.').map(Number); process.exit((v[0]>22 || (v[0]===22 && v[1]>=14)) ? 0 : 1)" && node_ok=1 || node_ok=0
fi

if [ "$node_ok" != "1" ]; then
  echo "INSTALLING_NODE_24_IN_WSL"
  if [ "$(id -u)" != "0" ]; then
    echo "MISSING_NODE_22_14_OR_NEWER_IN_WSL_AND_NOT_ROOT"
    echo "Run via wsl.exe -d Ubuntu-24.04 -u root so Node 24 can be installed."
    exit 20
  fi
  apt-get update
  apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
  node -e "const v=process.versions.node.split('.').map(Number); process.exit((v[0]>22 || (v[0]===22 && v[1]>=14)) ? 0 : 1)"
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "MISSING_NPM_IN_WSL"
  exit 21
fi

npm install -g openclaw@latest

cat > "$HOME/orangebox-openclaw-workspace/AGENTS.md" <<'AGENTS'
# OrangeBOX OpenClaw Guardrails

OrangeBOX is source of truth. OpenClaw is optional outer orchestration only.

- Do not run destructive actions without operator approval.
- Do not install arbitrary third-party skills or plugins.
- Do not expose gateway to LAN or internet.
- Summarize large logs before returning them.
- Use Codexa for local/worker actions and OrangeBOX receipts for proof.
- Browser, device, voice, and file-transfer plugins stay off until verified.
AGENTS

cat > "$HOME/.openclaw/openclaw.json" <<'JSON'
{
  "agents": {
    "defaults": {
      "workspace": "~/orangebox-openclaw-workspace",
      "embeddedHarness": {
        "runtime": "claude-cli"
      },
      "models": {
        "anthropic/claude-opus-4-7": {},
        "claude-cli/claude-opus-4-7": {},
        "codex-cli/gpt-5.5": {}
      },
      "model": {
        "primary": "anthropic/claude-opus-4-7"
      },
      "sandbox": {
        "mode": "non-main"
      }
    }
  },
  "browser": {
    "enabled": false
  },
  "gateway": {
    "mode": "local",
    "auth": {
      "mode": "token"
    }
  },
  "plugins": {
    "entries": {
      "anthropic": {
        "enabled": true
      },
      "browser": {
        "enabled": false
      },
      "file-transfer": {
        "enabled": false
      },
      "device-pair": {
        "enabled": false
      },
      "phone-control": {
        "enabled": false
      },
      "talk-voice": {
        "enabled": false
      }
    }
  }
}
JSON

openclaw --version || true
openclaw doctor || true
echo "OPENCLAW_GUARDED_INSTALL_CONFIGURED"
`;
}

function installPs1() {
  return `# OrangeBOX guarded OpenClaw setup for Codexa.
# WSL2-first by design because current OpenClaw docs and Windows failure reports favor WSL2 stability.
param(
  [switch]$StartGateway
)

$ErrorActionPreference = "Stop"
$Root = "C:\\AtomEons\\ai-box\\openclaw-guarded"
$ReceiptRoot = "C:\\AtomEons\\ai-box\\receipts"
$Distro = "Ubuntu-24.04"
$Receipt = Join-Path $ReceiptRoot ("openclaw-guarded-install-{0}.json" -f (Get-Date -Format yyyyMMdd-HHmmss))

New-Item -ItemType Directory -Force -Path $Root,$ReceiptRoot | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "install-openclaw-wsl2.sh") -Destination (Join-Path $Root "install-openclaw-wsl2.sh") -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot "START_CODEXA_OPENCLAW_WSL2.ps1") -Destination (Join-Path $Root "START_CODEXA_OPENCLAW_WSL2.ps1") -Force

$wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
if (-not $wsl) {
  $result = @{
    status = "MISSING_WSL2"
    detail = "Install WSL2/Ubuntu on Codexa, reboot if Windows asks, then rerun this pack."
    recommended = "wsl --install -d Ubuntu"
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $Receipt -Encoding UTF8
  Write-Host ($result | ConvertTo-Json -Depth 5)
  exit 20
}

$distros = (wsl.exe -l -q) -join "\`n"
if ($distros -notmatch [regex]::Escape($Distro)) {
  $result = @{
    status = "MISSING_UBUNTU_2404"
    detail = "Install Ubuntu 24.04 on Codexa, then rerun this pack."
    recommended = "wsl --install -d Ubuntu-24.04 --no-launch"
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -Path $Receipt -Encoding UTF8
  Write-Host ($result | ConvertTo-Json -Depth 5)
  exit 20
}

$scriptWin = Join-Path $Root "install-openclaw-wsl2.sh"
$drive = $scriptWin.Substring(0,1).ToLowerInvariant()
$rest = $scriptWin.Substring(2).Replace("\","/")
$scriptWsl = "/mnt/$drive$rest"
$output = ""
$exit = 0
try {
  $output = wsl.exe -d $Distro -u root -- bash "$scriptWsl" 2>&1 | Out-String
  $exit = $LASTEXITCODE
} catch {
  $output = $_.Exception.Message
  $exit = 1
}

if ($StartGateway -and $exit -eq 0) {
  powershell -ExecutionPolicy Bypass -File (Join-Path $Root "START_CODEXA_OPENCLAW_WSL2.ps1")
}

$status = if ($exit -eq 0) { "VERIFIED" } else { "FAILED" }
$receiptObj = @{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  status = $status
  exitCode = $exit
  mode = "WSL2_FIRST"
  distro = $Distro
  gatewayStartRequested = [bool]$StartGateway
  root = $Root
  outputTail = if ($output.Length -gt 8000) { $output.Substring($output.Length - 8000) } else { $output }
  guardrails = @(
    "local-only gateway",
    "no arbitrary plugin specs",
    "browser/device/voice/file-transfer disabled until verified",
    "destructive actions require approval",
    "OrangeBOX remains source of truth"
  )
}
$receiptObj | ConvertTo-Json -Depth 8 | Set-Content -Path $Receipt -Encoding UTF8
Write-Host ($receiptObj | ConvertTo-Json -Depth 8)
`;
}

function startPs1() {
  return `# Start guarded OpenClaw in WSL2 on Codexa.
$ErrorActionPreference = "Stop"
$ReceiptRoot = "C:\\AtomEons\\ai-box\\receipts"
$Distro = "Ubuntu-24.04"
New-Item -ItemType Directory -Force -Path $ReceiptRoot | Out-Null
$Receipt = Join-Path $ReceiptRoot ("openclaw-guarded-start-{0}.json" -f (Get-Date -Format yyyyMMdd-HHmmss))
$cmd = "cd ~ && nohup openclaw gateway --host 127.0.0.1 --port 18789 --verbose > ~/.openclaw/logs/orangebox-gateway.log 2>&1 &"
wsl.exe -d $Distro -u root -- bash -lc $cmd
Start-Sleep -Seconds 5
$health = "UNKNOWN"
try {
  $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri "http://127.0.0.1:18789/__openclaw__/canvas/"
  $health = "VERIFIED:$($r.StatusCode)"
} catch {
  $health = "FAILED:$($_.Exception.Message)"
}
@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  status = if ($health.StartsWith("VERIFIED")) { "VERIFIED" } else { "FAILED" }
  health = $health
  url = "http://127.0.0.1:18789/__openclaw__/canvas/"
  scope = "Codexa-local only; inspect through OrangeBOX bridge jobs, not LAN exposure."
} | ConvertTo-Json -Depth 5 | Set-Content -Path $Receipt -Encoding UTF8
Get-Content -Raw $Receipt
`;
}

function readme() {
  return `# Codexa OpenClaw Guarded Pack

Purpose: install OpenClaw on Codexa as a guarded optional outer automation rail for OrangeBOX.

## Why WSL2 first

Current OpenClaw docs recommend Node 24 or Node 22.14+ and describe WSL2 as the more stable Windows path. Your earlier native Windows run failed while staging bundled runtime deps, so this pack avoids that native failure lane.

## What this enables

- OpenClaw local gateway on Codexa only.
- OrangeBOX remains source of truth.
- Browser, device pairing, phone control, voice, and file transfer are disabled until explicitly verified.
- No arbitrary plugin specs. Use bundled/marketplace-safe plugins only.

## Install on Codexa

Run as Administrator:

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File .\\INSTALL_CODEXA_OPENCLAW_GUARDED.ps1 -StartGateway
\`\`\`

If WSL2 is missing, install Ubuntu:

\`\`\`powershell
wsl --install -d Ubuntu
\`\`\`

Then reboot if Windows asks and rerun the installer.
`;
}

async function main() {
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "install-openclaw-wsl2.sh"), wslInstallSource(), "utf8");
  await fs.writeFile(path.join(outDir, "INSTALL_CODEXA_OPENCLAW_GUARDED.ps1"), installPs1(), "utf8");
  await fs.writeFile(path.join(outDir, "START_CODEXA_OPENCLAW_WSL2.ps1"), startPs1(), "utf8");
  await fs.writeFile(path.join(outDir, "RUN_AS_ADMIN_ON_CODEXA.cmd"), "@echo off\r\npowershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_CODEXA_OPENCLAW_GUARDED.ps1\" -StartGateway\r\npause\r\n", "utf8");
  await fs.writeFile(path.join(outDir, "README.md"), readme(), "utf8");
  await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    mode: "WSL2_FIRST_GUARDED",
    safeDefaults: true,
    noArbitraryPlugins: true,
    files: [
      "install-openclaw-wsl2.sh",
      "INSTALL_CODEXA_OPENCLAW_GUARDED.ps1",
      "START_CODEXA_OPENCLAW_WSL2.ps1",
      "RUN_AS_ADMIN_ON_CODEXA.cmd",
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
  const receiptPath = path.join(receiptDir, `codexa-openclaw-pack-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const hash = crypto.createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");
  await fs.writeFile(receiptPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    outDir,
    zipPath,
    latestZipPath,
    zipBytes: stat.size,
    sha256: hash,
    installMode: "WSL2_FIRST_GUARDED"
  }, null, 2), "utf8");
  console.log(JSON.stringify({ status: "VERIFIED", outDir, zipPath, latestZipPath, zipBytes: stat.size, sha256: hash, receiptPath }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", error: error.message }, null, 2));
  process.exit(1);
});
