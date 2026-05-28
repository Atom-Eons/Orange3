#Requires -Version 5.1
<#
.SYNOPSIS
    ORANGEBOX Codexa — Hermes Agent Installer (Windows Native)

.DESCRIPTION
    Installs Hermes Agent (Nous Research, MIT-licensed, free forever) on Windows
    native — no WSL required. Hermes replaces OpenClaw as the outer-orchestration
    agent on the Codexa rail starting in ORANGEBOX v4.0.1.

    Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
    Source          : https://github.com/nousresearch/hermes-agent

    What this script does:
      1. Detects an existing Hermes install and exits early if found.
      2. Verifies Node 22.14+ is present.
      3. Downloads the upstream Hermes PowerShell installer from Nous Research
         but does NOT execute it until the operator types Y to confirm.
      4. Writes the ORANGEBOX AGENTS.md guardrails to ~/.hermes/AGENTS.md.
      5. Prints next-step instructions.

    Mom's Law: Full effort. Every path is real. No stubs.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\INSTALL_HERMES.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ─── Helpers ──────────────────────────────────────────────────────────────────

function Write-Step {
    param([string]$Msg)
    Write-Host ""
    Write-Host "[HERMES] $Msg"
}

function Write-Ok {
    param([string]$Msg)
    Write-Host "  OK  $Msg"
}

function Write-Warn {
    param([string]$Msg)
    Write-Host "  WARN  $Msg"
}

function Exit-Clean {
    param([int]$Code = 0, [string]$Msg = "")
    if ($Msg) { Write-Host $Msg }
    exit $Code
}

# ─── 1. Detect existing Hermes install ────────────────────────────────────────

Write-Step "Checking for existing Hermes install..."

$existingHermes = Get-Command hermes -ErrorAction SilentlyContinue
if ($existingHermes) {
    try {
        $ver = & hermes --version 2>&1 | Select-Object -First 1
    } catch {
        $ver = "(version unknown)"
    }
    Write-Ok "Hermes is already installed: $ver"
    Write-Host ""
    Write-Host "  If you need to update: hermes update"
    Write-Host "  Next steps:  hermes model  |  hermes mcp serve  |  hermes status"
    Write-Host ""
    Exit-Clean -Code 0
}

Write-Host "  Hermes not found on PATH. Proceeding with install."

# ─── 2. Verify Node 22.14+ ────────────────────────────────────────────────────

Write-Step "Checking Node.js version..."

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host ""
    Write-Host "  ERROR: node is not on PATH."
    Write-Host "  Install Node 22.14+ from https://nodejs.org/ then rerun this script."
    Exit-Clean -Code 10
}

$nodeVersionRaw = (& node --version 2>&1).Trim()  # e.g. "v22.14.0"
$nodeVersionStr = $nodeVersionRaw.TrimStart('v')
$nodeParts      = $nodeVersionStr -split '\.'

try {
    $nodeMajor = [int]$nodeParts[0]
    $nodeMinor = [int]$nodeParts[1]
} catch {
    Write-Host "  ERROR: Could not parse Node version: $nodeVersionRaw"
    Exit-Clean -Code 11
}

$nodeOk = ($nodeMajor -gt 22) -or ($nodeMajor -eq 22 -and $nodeMinor -ge 14)
if (-not $nodeOk) {
    Write-Host ""
    Write-Host "  ERROR: Node $nodeVersionStr is too old. Hermes requires Node 22.14+."
    Write-Host "  Download from https://nodejs.org/ and rerun this script."
    Exit-Clean -Code 12
}

Write-Ok "Node $nodeVersionStr (required: 22.14+)"

# ─── 3. Download upstream installer (operator must confirm before execution) ──

Write-Step "Downloading Hermes installer from Nous Research..."

$installerUrl  = "https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1"
$installerTemp = Join-Path $env:TEMP "hermes-install.ps1"

try {
    Invoke-WebRequest -Uri $installerUrl `
                      -OutFile $installerTemp `
                      -UseBasicParsing `
                      -TimeoutSec 30
} catch {
    Write-Host ""
    Write-Host "  ERROR: Could not download Hermes installer from:"
    Write-Host "  $installerUrl"
    Write-Host "  Check your internet connection and try again."
    Write-Host "  Error detail: $($_.Exception.Message)"
    Exit-Clean -Code 20
}

Write-Ok "Installer downloaded to: $installerTemp"

# ─── Operator confirmation ────────────────────────────────────────────────────

Write-Host ""
Write-Host "  SECURITY CONFIRMATION REQUIRED"
Write-Host ""
Write-Host "  About to run the Hermes installer from Nous Research:"
Write-Host "    $installerUrl"
Write-Host ""
Write-Host "  The installer will:"
Write-Host "    - Install Hermes Agent into ~/.hermes/"
Write-Host "    - Add ~/.hermes/bin/ to your PATH"
Write-Host "    - No data leaves your machine unless you route through Nous Portal"
Write-Host ""
Write-Host "  Review the downloaded script at: $installerTemp"
Write-Host ""

$confirm = Read-Host "  Type Y to proceed with installation, or anything else to cancel"
if ($confirm -ne "Y" -and $confirm -ne "y") {
    Write-Host ""
    Write-Host "  Installation cancelled by operator."
    Write-Host "  The downloaded installer is at: $installerTemp"
    Write-Host "  You can inspect and run it manually when ready."
    Exit-Clean -Code 0
}

# ─── Execute installer ────────────────────────────────────────────────────────

Write-Step "Running Hermes installer..."

try {
    & powershell.exe -ExecutionPolicy Bypass -File $installerTemp
    $installExitCode = $LASTEXITCODE
} catch {
    Write-Host ""
    Write-Host "  ERROR: Installer threw an exception: $($_.Exception.Message)"
    Exit-Clean -Code 30
}

if ($installExitCode -ne 0) {
    Write-Host ""
    Write-Host "  ERROR: Hermes installer exited with code $installExitCode."
    Write-Host "  Check the output above for details."
    Exit-Clean -Code $installExitCode
}

Write-Ok "Hermes installer completed."

# ─── 4. Write ORANGEBOX AGENTS.md guardrails ──────────────────────────────────

Write-Step "Writing ORANGEBOX guardrails to ~/.hermes/AGENTS.md..."

$hermesHome = Join-Path $HOME ".hermes"
if (-not (Test-Path -LiteralPath $hermesHome)) {
    New-Item -ItemType Directory -Path $hermesHome -Force | Out-Null
}

$agentsMdSrc = Join-Path $PSScriptRoot "AGENTS.md"
$agentsMdDst = Join-Path $hermesHome "AGENTS.md"

if (Test-Path -LiteralPath $agentsMdSrc) {
    Copy-Item -LiteralPath $agentsMdSrc -Destination $agentsMdDst -Force
    Write-Ok "Guardrails written from pack: $agentsMdDst"
} else {
    # Write inline fallback if AGENTS.md is not next to this script
    $agentsContent = @'
# ORANGEBOX Hermes Guardrails

ORANGEBOX is source of truth. Hermes is optional outer orchestration only.

- Do not run destructive actions without operator approval.
- Do not auto-install skills from public registries — operator approves each skill explicitly.
- Do not expose the Hermes gateway to LAN or internet by default. Loopback only.
- Summarize large logs before returning them.
- Use Codexa for local/worker actions and ORANGEBOX receipts for proof.
- Messaging gateway (Telegram/Discord/Signal) stays OFF until operator pairs it explicitly.
- Auto-generated skills go to ~/.hermes/skills-pending/ and require operator promotion to ~/.hermes/skills-active/.
- Persistent memory is operator-owned and never egresses unless explicitly cited.
- Trilane authority order (GPT > Gemini > Claude) applies in Hermes multi-model debates.
'@
    Set-Content -Path $agentsMdDst -Value $agentsContent -Encoding UTF8
    Write-Ok "Guardrails written (inline fallback): $agentsMdDst"
}

# ─── 5. Verify install + next steps ──────────────────────────────────────────

Write-Step "Verifying Hermes install..."

# Refresh PATH for this session so hermes is discoverable if just installed
$hermessBin = Join-Path $HOME ".hermes\bin"
if (Test-Path -LiteralPath $hermessBin) {
    $env:PATH = "$hermessBin;$env:PATH"
}

$hermesNow = Get-Command hermes -ErrorAction SilentlyContinue
if ($hermesNow) {
    try {
        $installedVer = & hermes --version 2>&1 | Select-Object -First 1
    } catch {
        $installedVer = "(unknown)"
    }
    Write-Ok "hermes $installedVer is on PATH."
} else {
    Write-Warn "hermes binary not found on PATH after install."
    Write-Host "  Add ~/.hermes/bin to your PATH:"
    Write-Host "    `$env:PATH += `";`$HOME\.hermes\bin`""
    Write-Host "  Or restart your terminal — the installer may have updated the system PATH."
}

Write-Host ""
Write-Host "============================================================"
Write-Host "  HERMES AGENT INSTALLED — NEXT STEPS"
Write-Host "============================================================"
Write-Host ""
Write-Host "  1. Set your active model:"
Write-Host "       hermes model"
Write-Host "       hermes model anthropic/claude-sonnet-4-5"
Write-Host "       hermes model openai/gpt-4o"
Write-Host "       hermes model openrouter/meta-llama/llama-3.1-405b-instruct"
Write-Host ""
Write-Host "  2. Run initial setup:"
Write-Host "       hermes setup"
Write-Host ""
Write-Host "  3. Start the MCP server (ORANGEBOX connects here):"
Write-Host "       hermes mcp serve"
Write-Host "       # Default: http://127.0.0.1:18790/mcp/"
Write-Host ""
Write-Host "  4. Optional — start the dashboard:"
Write-Host "       hermes dashboard --port 9119"
Write-Host ""
Write-Host "  5. Health check from ORANGEBOX:"
Write-Host "       node scripts\v4\hermes\hermes-status.mjs --text"
Write-Host ""
Write-Host "  Docs: https://github.com/nousresearch/hermes-agent"
Write-Host "============================================================"
Write-Host ""

exit 0
