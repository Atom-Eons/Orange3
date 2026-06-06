#!/usr/bin/env node
/*
  obox2-internal-setup-pack.mjs

  Builds an operator-run package for Codexa / AI Box. The pack carries the
  tri-lane registry, LLM pull scripts, STRONGARM + Misfits proof commands,
  and backend setup notes. It does not require Codexa to be reachable.
*/

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
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
const exportsRoot = path.join(dataRoot, "exports");
const outDir = path.join(exportsRoot, "obox2-internal-setup-pack");
const downloads = path.join(userRoot, "Downloads");
const zipPath = path.join(downloads, "Orangebox_V2_Internal_Setup_Pack.zip");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function writeFile(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function psSingle(value) {
  return String(value).replace(/'/g, "''");
}

function installScript() {
  return `param(
  [ValidateSet('core','extended','heavy','wildcard','all')]
  [string]$Tier = 'all',
  [switch]$SkipPulls
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$registryPath = Join-Path $root 'MODEL_REGISTRY.json'
$receiptRoot = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null

function Write-Orange($Text) { Write-Host $Text -ForegroundColor DarkYellow }
function Write-Green($Text) { Write-Host $Text -ForegroundColor Green }
function Write-Muted($Text) { Write-Host $Text -ForegroundColor DarkGray }

Write-Orange '============================================================'
Write-Orange '  ORANGEBOX V2 INTERNAL - CODEXA MODEL SETUP'
Write-Orange '============================================================'
Write-Muted  'This installs/pulls local Ollama models for tri-lane routing.'
Write-Muted  'Dolphin and abliterated models are wildcard Gremlin lanes only.'

$registry = Get-Content -LiteralPath $registryPath -Raw | ConvertFrom-Json
$wanted = @()
foreach ($model in $registry.local_models) {
  if ($Tier -eq 'all' -or $model.required_tier -eq $Tier) { $wanted += $model }
  elseif ($Tier -eq 'extended' -and $model.required_tier -eq 'core') { $wanted += $model }
  elseif ($Tier -eq 'heavy' -and ($model.required_tier -eq 'core' -or $model.required_tier -eq 'extended')) { $wanted += $model }
}

$ollama = Get-Command ollama -ErrorAction SilentlyContinue
if (-not $ollama) {
  $result = [ordered]@{
    ok = $false
    status = 'OLLAMA_NOT_FOUND'
    note = 'Install Ollama on Codexa first, then rerun this pack.'
    checked_at = (Get-Date).ToString('o')
  }
  $path = Join-Path $receiptRoot 'obox2-model-install-latest.json'
  $result | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $path
  Write-Host 'OLLAMA_NOT_FOUND'
  exit 1
}

try {
  Invoke-RestMethod -TimeoutSec 2 -Uri 'http://127.0.0.1:11434/api/tags' | Out-Null
} catch {
  Write-Muted 'Starting ollama serve in the background...'
  Start-Process -WindowStyle Hidden ollama -ArgumentList 'serve'
  Start-Sleep -Seconds 4
}

$pulls = @()
if (-not $SkipPulls) {
  foreach ($model in $wanted) {
    $id = [string]$model.id
    Write-Orange ("Pulling " + $id)
    $started = Get-Date
    $output = & ollama pull $id 2>&1
    $exit = $LASTEXITCODE
    $pulls += [ordered]@{
      id = $id
      tier = $model.required_tier
      optional = [bool]$model.optional
      ok = ($exit -eq 0)
      exit_code = $exit
      seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
      output_tail = (($output | Out-String).Trim())
    }
  }
}

try {
  $tags = (Invoke-RestMethod -TimeoutSec 10 -Uri 'http://127.0.0.1:11434/api/tags').models.name
} catch {
  $tags = @()
}
$required = $wanted | Where-Object { -not [bool]$_.optional }
$missingRequired = @()
foreach ($model in $required) {
  if ($tags -notcontains $model.id) { $missingRequired += $model.id }
}

$result = [ordered]@{
  ok = ($missingRequired.Count -eq 0)
  status = $(if ($missingRequired.Count -eq 0) { 'OBOX2_CODEXA_MODELS_GREEN' } else { 'OBOX2_CODEXA_MODELS_NOT_GREEN' })
  tier = $Tier
  checked_at = (Get-Date).ToString('o')
  registry = $registryPath
  wanted = @($wanted | ForEach-Object { $_.id })
  installed = @($tags)
  missing_required = @($missingRequired)
  pulls = @($pulls)
  wildcard_note = 'Abliterated/custom wildcard tags may require manual import. Missing optional wildcard tags do not block core routing.'
}
$path = Join-Path $receiptRoot 'obox2-model-install-latest.json'
$result | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $path
if ($result.ok) { Write-Green 'OBOX2_CODEXA_MODELS_GREEN' } else { Write-Host 'OBOX2_CODEXA_MODELS_NOT_GREEN' -ForegroundColor Red }
Write-Muted ("Receipt: " + $path)
if (-not $result.ok) { exit 1 }
`;
}

function doctorScript() {
  return `param()
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$registry = Get-Content -LiteralPath (Join-Path $root 'MODEL_REGISTRY.json') -Raw | ConvertFrom-Json
$receiptRoot = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null
try {
  $tags = (Invoke-RestMethod -TimeoutSec 5 -Uri 'http://127.0.0.1:11434/api/tags').models.name
  $ollamaOk = $true
} catch {
  $tags = @()
  $ollamaOk = $false
}
$core = @($registry.local_models | Where-Object { $_.required_tier -eq 'core' -and -not [bool]$_.optional })
$missingCore = @()
foreach ($model in $core) {
  if ($tags -notcontains $model.id) { $missingCore += $model.id }
}
$wildcards = @($registry.local_models | Where-Object { $_.lane -like '*gremlin*' -or $_.id -like '*dolphin*' -or $_.id -like '*abliterated*' })
$result = [ordered]@{
  ok = ($ollamaOk -and $missingCore.Count -eq 0)
  status = $(if ($ollamaOk -and $missingCore.Count -eq 0) { 'OBOX2_CODEXA_MODEL_DOCTOR_GREEN' } else { 'OBOX2_CODEXA_MODEL_DOCTOR_NOT_GREEN' })
  checked_at = (Get-Date).ToString('o')
  ollama_ok = $ollamaOk
  installed = @($tags)
  missing_core = @($missingCore)
  wildcard_candidates = @($wildcards | ForEach-Object { $_.id })
  doctrine = 'Wildcard models pressure. Mirror verifies. STRONGARM disciplines. Judgement decides. Operator rules.'
}
$path = Join-Path $receiptRoot 'obox2-model-doctor-latest.json'
$result | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $path
$result.status
if (-not $result.ok) { exit 1 }
`;
}

function powerOptimizerScript() {
  return `param(
  [switch]$Apply,
  [switch]$EnableRdp,
  [switch]$DisableHibernate
)
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$receiptRoot = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null

function Is-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Run-Step($Name, $Exe, $Args) {
  $started = Get-Date
  if (-not $Apply) {
    return [ordered]@{ name = $Name; ok = $true; skipped = $true; exe = $Exe; args = @($Args) }
  }
  try {
    $output = & $Exe @Args 2>&1
    $exit = $LASTEXITCODE
    return [ordered]@{
      name = $Name
      ok = ($exit -eq 0)
      exit_code = $exit
      seconds = [math]::Round(((Get-Date) - $started).TotalSeconds, 2)
      output_tail = (($output | Select-Object -Last 12) -join [Environment]::NewLine)
    }
  } catch {
    return [ordered]@{ name = $Name; ok = $false; error = $_.Exception.Message }
  }
}

$admin = Is-Admin
$steps = @()
if ($Apply -and -not $admin) {
  $result = [ordered]@{
    ok = $false
    status = 'OBOX2_CODEXA_POWER_OPTIMIZER_NEEDS_ADMIN'
    checked_at = (Get-Date).ToUniversalTime().ToString('o')
    applied = $false
    admin = $admin
    note = 'Run RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd as Administrator on Codexa.'
  }
  $path = Join-Path $receiptRoot 'obox2-power-optimizer-latest.json'
  $result | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $path
  Write-Host $result.status -ForegroundColor Red
  Write-Host ("Receipt: " + $path)
  exit 1
}

$steps += Run-Step 'active_scheme_high_performance' 'powercfg.exe' @('/setactive','SCHEME_MIN')
$steps += Run-Step 'ac_sleep_never' 'powercfg.exe' @('/change','standby-timeout-ac','0')
$steps += Run-Step 'ac_hibernate_never' 'powercfg.exe' @('/change','hibernate-timeout-ac','0')
$steps += Run-Step 'ac_disk_never' 'powercfg.exe' @('/change','disk-timeout-ac','0')
$steps += Run-Step 'ac_hybrid_sleep_off' 'powercfg.exe' @('/setacvalueindex','SCHEME_CURRENT','SUB_SLEEP','HYBRIDSLEEP','0')
$steps += Run-Step 'ac_wake_timers_enabled' 'powercfg.exe' @('/setacvalueindex','SCHEME_CURRENT','SUB_SLEEP','RTCWAKE','1')
$steps += Run-Step 'apply_current_scheme' 'powercfg.exe' @('/setactive','SCHEME_CURRENT')
if ($DisableHibernate) {
  $steps += Run-Step 'hibernate_file_off' 'powercfg.exe' @('/hibernate','off')
}
if ($EnableRdp -and $Apply) {
  try {
    Enable-NetFirewallRule -DisplayGroup 'Remote Desktop' | Out-Null
    Set-ItemProperty -LiteralPath 'HKLM:\\System\\CurrentControlSet\\Control\\Terminal Server' -Name 'fDenyTSConnections' -Value 0
    $steps += [ordered]@{ name = 'rdp_enabled'; ok = $true }
  } catch {
    $steps += [ordered]@{ name = 'rdp_enabled'; ok = $false; error = $_.Exception.Message }
  }
}

$railScript = Join-Path $root 'START_CODEXA_RAIL.ps1'
$railScriptPresent = Test-Path -LiteralPath $railScript
$activeScheme = (& powercfg.exe /getactivescheme 2>&1 | Out-String).Trim()
$requests = (& powercfg.exe /requests 2>&1 | Out-String).Trim()
$availableSleep = (& powercfg.exe /a 2>&1 | Out-String).Trim()
$ok = (-not $Apply) -or (($steps | Where-Object { -not $_.ok }).Count -eq 0)
$result = [ordered]@{
  ok = $ok
  status = $(if ($ok) { 'OBOX2_CODEXA_POWER_OPTIMIZER_READY' } else { 'OBOX2_CODEXA_POWER_OPTIMIZER_NOT_GREEN' })
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  applied = [bool]$Apply
  admin = $admin
  rail_script_present = $railScriptPresent
  enable_rdp_requested = [bool]$EnableRdp
  disable_hibernate_requested = [bool]$DisableHibernate
  steps = @($steps)
  active_scheme = $activeScheme
  power_requests = $requests
  sleep_capabilities = $availableSleep
  note = 'AC sleep/hibernate/disk idle are set to never when Apply is used. This is for Codexa / AI Box, not the cockpit.'
}
$path = Join-Path $receiptRoot 'obox2-power-optimizer-latest.json'
$result | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $path
if ($ok) { Write-Host $result.status -ForegroundColor Green } else { Write-Host $result.status -ForegroundColor Red }
Write-Host ("Receipt: " + $path)
if (-not $ok) { exit 1 }
`;
}

function powerDoctorScript() {
  return `param()
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$receiptRoot = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null

function Read-AcIndex($Subgroup, $Setting) {
  try {
    $text = (& powercfg.exe /q SCHEME_CURRENT $Subgroup $Setting 2>&1 | Out-String)
    $line = ($text -split "\\r?\\n" | Where-Object { $_ -match 'Current AC Power Setting Index:' } | Select-Object -First 1)
    if ($line -match '0x([0-9a-fA-F]+)') { return [Convert]::ToInt64($matches[1], 16) }
  } catch {}
  return $null
}

$standbyAc = Read-AcIndex 'SUB_SLEEP' 'STANDBYIDLE'
$hibernateAc = Read-AcIndex 'SUB_SLEEP' 'HIBERNATEIDLE'
$diskAc = Read-AcIndex 'SUB_DISK' 'DISKIDLE'
$hybridAc = Read-AcIndex 'SUB_SLEEP' 'HYBRIDSLEEP'
$railTask = Get-ScheduledTask -TaskName 'OrangeBOX AI Box Command Rail' -ErrorAction SilentlyContinue
$bridgeTask = Get-ScheduledTask -TaskName 'OrangeBOX AI Box Bridge' -ErrorAction SilentlyContinue
$activeScheme = (& powercfg.exe /getactivescheme 2>&1 | Out-String).Trim()
$requests = (& powercfg.exe /requests 2>&1 | Out-String).Trim()
$railScriptPresent = Test-Path -LiteralPath (Join-Path $root 'START_CODEXA_RAIL.ps1')
$ok = ($standbyAc -eq 0 -and $hibernateAc -eq 0 -and $diskAc -eq 0)
$warnings = @()
if ($hybridAc -ne $null -and $hybridAc -ne 0) { $warnings += 'Hybrid sleep is not proven off.' }
if (-not $railTask) { $warnings += 'Command rail scheduled task is not registered yet; run START_CODEXA_RAIL after power optimizer.' }
if (-not $railScriptPresent) { $warnings += 'START_CODEXA_RAIL.ps1 missing from this pack.' }

$result = [ordered]@{
  ok = $ok
  status = $(if ($ok) { 'OBOX2_CODEXA_POWER_DOCTOR_GREEN' } else { 'OBOX2_CODEXA_POWER_DOCTOR_NOT_GREEN' })
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  ac_settings = [ordered]@{
    standby_idle_seconds = $standbyAc
    hibernate_idle_seconds = $hibernateAc
    disk_idle_seconds = $diskAc
    hybrid_sleep = $hybridAc
  }
  scheduled_tasks = [ordered]@{
    command_rail_registered = [bool]$railTask
    bridge_registered = [bool]$bridgeTask
  }
  rail_script_present = $railScriptPresent
  active_scheme = $activeScheme
  power_requests = $requests
  warnings = @($warnings)
  note = 'Green means AC sleep, hibernate idle, and disk idle are disabled. It does not prove network rails are reachable from the cockpit.'
}
$path = Join-Path $receiptRoot 'obox2-power-doctor-latest.json'
$result | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -Path $path
if ($ok) { Write-Host $result.status -ForegroundColor Green } else { Write-Host $result.status -ForegroundColor Red }
Write-Host ("Receipt: " + $path)
if (-not $ok) { exit 1 }
`;
}

function hermesInstallScript() {
  return `param(
  [switch]$SkipInstall
)
$ErrorActionPreference = 'Continue'
$receiptRoot = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null

function Write-Orange($Text) { Write-Host $Text -ForegroundColor DarkYellow }
function Write-Green($Text) { Write-Host $Text -ForegroundColor Green }
function Write-RedLine($Text) { Write-Host $Text -ForegroundColor Red }

Write-Orange '============================================================'
Write-Orange '  ORANGEBOX V2 INTERNAL - HERMES AGENT SETUP'
Write-Orange '============================================================'
Write-Host 'Hermes is the optional outer orchestration rail. Orangebox remains source of truth.'

$existing = Get-Command hermes -ErrorAction SilentlyContinue
$beforeVersion = $null
if ($existing) {
  try { $beforeVersion = (& hermes --version 2>&1 | Select-Object -First 1) } catch {}
}

$nodeOk = $false
$nodeVersion = $null
try {
  $nodeVersion = (& node --version 2>$null)
  $parts = $nodeVersion.TrimStart('v').Split('.')
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  $nodeOk = ($major -gt 22) -or ($major -eq 22 -and $minor -ge 14)
} catch {}

$installAttempted = $false
$installExit = $null
$installOutput = @()
if (-not $existing -and -not $SkipInstall -and $nodeOk) {
  $installAttempted = $true
  $installerUrl = 'https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1'
  $installerPath = Join-Path $env:TEMP 'orangebox-hermes-install.ps1'
  try {
    Invoke-WebRequest -UseBasicParsing -Uri $installerUrl -OutFile $installerPath
    $installOutput = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $installerPath 2>&1
    $installExit = $LASTEXITCODE
  } catch {
    $installOutput = @($_.Exception.Message)
    $installExit = 1
  }
}

$after = Get-Command hermes -ErrorAction SilentlyContinue
$afterVersion = $null
if ($after) {
  try { $afterVersion = (& hermes --version 2>&1 | Select-Object -First 1) } catch {}
}

$ok = [bool]$after
$result = [ordered]@{
  ok = $ok
  status = $(if ($ok) { 'OBOX2_HERMES_READY' } else { 'OBOX2_HERMES_NOT_READY' })
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  node_ok = $nodeOk
  node_version = $nodeVersion
  hermes_before = $beforeVersion
  hermes_after = $afterVersion
  install_attempted = $installAttempted
  install_exit_code = $installExit
  skip_install = [bool]$SkipInstall
  note = 'Orangebox remains the control plane. Hermes is optional outer orchestration and must stay loopback/operator-controlled.'
  install_output_tail = @($installOutput | Select-Object -Last 20)
}
$path = Join-Path $receiptRoot 'obox2-hermes-install-latest.json'
$result | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $path
if ($ok) { Write-Green 'OBOX2_HERMES_READY' } else { Write-RedLine 'OBOX2_HERMES_NOT_READY' }
Write-Host ("Receipt: " + $path)
if (-not $ok) { exit 1 }
`;
}

function hermesDoctorScript() {
  return `param()
$ErrorActionPreference = 'Continue'
$receiptRoot = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null

$version = $null
$statusText = $null
$hermes = Get-Command hermes -ErrorAction SilentlyContinue
if ($hermes) {
  try { $version = (& hermes --version 2>&1 | Select-Object -First 1) } catch {}
  try { $statusText = (& hermes status 2>&1 | Select-Object -First 40) } catch { $statusText = @($_.Exception.Message) }
}

$ok = [bool]$hermes
$result = [ordered]@{
  ok = $ok
  status = $(if ($ok) { 'OBOX2_HERMES_STATUS_GREEN' } else { 'OBOX2_HERMES_NOT_INSTALLED' })
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  hermes_on_path = [bool]$hermes
  hermes_version = $version
  status_tail = @($statusText)
  note = 'This doctor does not install or expose gateways. Use INSTALL_HERMES_AGENT.ps1 when ready.'
}
$path = Join-Path $receiptRoot 'obox2-hermes-status-latest.json'
$result | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 -Path $path
if ($ok) { Write-Host 'OBOX2_HERMES_STATUS_GREEN' -ForegroundColor Green } else { Write-Host 'OBOX2_HERMES_NOT_INSTALLED' -ForegroundColor Yellow }
Write-Host ("Receipt: " + $path)
if (-not $ok) { exit 1 }
`;
}

async function main() {
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.mkdir(outDir, { recursive: true });
  await fsp.mkdir(downloads, { recursive: true });

  const registry = readJson(path.join(repoRoot, "config", "model_registry.json"));
  const roleMap = readJson(path.join(repoRoot, "config", "role_map.json"));
  const routingPolicy = readJson(path.join(repoRoot, "config", "routing_policy.json"));
  const soulGenome = readJson(path.join(repoRoot, "config", "soul_genome.json"));

  await writeJson(path.join(outDir, "MODEL_REGISTRY.json"), registry);
  await writeJson(path.join(outDir, "ROLE_MAP.json"), roleMap);
  await writeJson(path.join(outDir, "ROUTING_POLICY.json"), routingPolicy);
  await writeJson(path.join(outDir, "SOUL_GENOME.json"), soulGenome);
  const railStarter = path.join(repoRoot, "scripts", "START_CODEXA_RAIL.ps1");
  if (fs.existsSync(railStarter)) {
    await fsp.copyFile(railStarter, path.join(outDir, "START_CODEXA_RAIL.ps1"));
    await writeFile(path.join(outDir, "RUN_START_CODEXA_RAIL_AS_ADMIN.cmd"), [
      "@echo off",
      "cd /d %~dp0",
      "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0START_CODEXA_RAIL.ps1\" -EnableRdp",
      "pause",
      "",
    ].join("\r\n"));
  }
  await writeFile(path.join(outDir, "INSTALL_CODEXA_OBOX2_MODELS.ps1"), installScript());
  await writeFile(path.join(outDir, "CODEXA_MODEL_DOCTOR.ps1"), doctorScript());
  await writeFile(path.join(outDir, "CODEXA_POWER_OPTIMIZER.ps1"), powerOptimizerScript());
  await writeFile(path.join(outDir, "CODEXA_POWER_DOCTOR.ps1"), powerDoctorScript());
  await writeFile(path.join(outDir, "INSTALL_HERMES_AGENT.ps1"), hermesInstallScript());
  await writeFile(path.join(outDir, "HERMES_AGENT_DOCTOR.ps1"), hermesDoctorScript());
  await writeFile(path.join(outDir, "RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0CODEXA_POWER_OPTIMIZER.ps1\" -Apply -EnableRdp",
    "pause",
    "",
  ].join("\r\n"));
  await writeFile(path.join(outDir, "RUN_CODEXA_POWER_DOCTOR.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0CODEXA_POWER_DOCTOR.ps1\"",
    "pause",
    "",
  ].join("\r\n"));
  await writeFile(path.join(outDir, "RUN_INSTALL_ALL_LLMS_ON_CODEXA.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_CODEXA_OBOX2_MODELS.ps1\" -Tier all",
    "pause",
    "",
  ].join("\r\n"));
  await writeFile(path.join(outDir, "RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_CODEXA_OBOX2_MODELS.ps1\" -Tier core",
    "pause",
    "",
  ].join("\r\n"));
  await writeFile(path.join(outDir, "RUN_MODEL_DOCTOR_ON_CODEXA.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0CODEXA_MODEL_DOCTOR.ps1\"",
    "pause",
    "",
  ].join("\r\n"));
  await writeFile(path.join(outDir, "RUN_INSTALL_HERMES_AGENT_ON_CODEXA.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0INSTALL_HERMES_AGENT.ps1\"",
    "pause",
    "",
  ].join("\r\n"));
  await writeFile(path.join(outDir, "RUN_HERMES_DOCTOR_ON_CODEXA.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0HERMES_AGENT_DOCTOR.ps1\"",
    "pause",
    "",
  ].join("\r\n"));

  await writeFile(path.join(outDir, "README_OBOX2_INTERNAL_SETUP.md"), `# Orangebox V2 Internal Setup Pack

Run this pack on Codexa / AI Box.

## Purpose

This pack updates the local model side of Orangebox:

- visible tri-lane model registry
- role map for Librarian / Forge / Mirror / Gremlin / STRONGARM / Judgement
- routing policy with cheap / normal / deep modes
- Dolphin and abliterated wildcard lanes
- SOUL GENOME continuity map for zero-memory chats and model handoffs
- Hermes Agent setup and doctor scripts for the outer orchestration rail
- Ollama pull script for core, extended, heavy, and wildcard model tiers
- model doctor receipts under \`C:\\AtomEons\\ai-box\\receipts\`

## Fast path

\`\`\`cmd
RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd
RUN_CODEXA_POWER_DOCTOR.cmd
RUN_START_CODEXA_RAIL_AS_ADMIN.cmd
RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd
RUN_MODEL_DOCTOR_ON_CODEXA.cmd
RUN_HERMES_DOCTOR_ON_CODEXA.cmd
\`\`\`

## Full path

\`\`\`cmd
RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd
RUN_CODEXA_POWER_DOCTOR.cmd
RUN_START_CODEXA_RAIL_AS_ADMIN.cmd
RUN_INSTALL_ALL_LLMS_ON_CODEXA.cmd
RUN_MODEL_DOCTOR_ON_CODEXA.cmd
RUN_INSTALL_HERMES_AGENT_ON_CODEXA.cmd
RUN_HERMES_DOCTOR_ON_CODEXA.cmd
\`\`\`

The full path is large. It can take a long time and a lot of disk space.

## AI Box always-on power law

Codexa / AI Box must not quietly sleep, hibernate, or drop rails while Orangebox expects it to work.

Run the power optimizer as Administrator before rail/model setup:

\`\`\`cmd
RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd
RUN_CODEXA_POWER_DOCTOR.cmd
\`\`\`

The optimizer sets AC sleep, hibernate idle, and disk idle to never, optionally enables RDP firewall/settings, and writes receipts under:

\`\`\`text
C:\\AtomEons\\ai-box\\receipts\\obox2-power-optimizer-latest.json
C:\\AtomEons\\ai-box\\receipts\\obox2-power-doctor-latest.json
\`\`\`

This is for Codexa / AI Box only. Do not apply it to a battery laptop unless the operator explicitly wants always-on behavior.

The rail starter registers the command and bridge rails as Windows Scheduled Tasks using startup + logon triggers so Codexa can recover after reboot without waiting for a manual interactive login.

## Wildcard law

Dolphin and abliterated models are pressure lanes only.

They can expose fog, weak refusals, fake productivity, and scope collapse.
They cannot be Judgement, Mirror truth, final answer, policy decision, or operator approval.

Doctrine:

\`\`\`text
Gremlin pressures.
Mirror verifies.
STRONGARM disciplines.
JUDGEMENT decides.
Operator rules.
Receipts prove.
\`\`\`

## SOUL GENOME law

SOUL GENOME is a portable continuity map for Orangebox behavior and project identity.
It is not a model body, hidden ruler, system rename, or training claim. It tells future chats what continuity must preserve.
`);

  const triLaneText = fs.existsSync(path.join(userRoot, ".codex", "attachments", "9e811b32-160c-4514-9f6e-13b4640e0fcd", "pasted-text.txt"))
    ? fs.readFileSync(path.join(userRoot, ".codex", "attachments", "9e811b32-160c-4514-9f6e-13b4640e0fcd", "pasted-text.txt"), "utf8")
    : "Tri-lane concept source was not present; use MODEL_REGISTRY.json, ROLE_MAP.json, and ROUTING_POLICY.json.";
  await writeFile(path.join(outDir, "TRILANE_CONCEPT_SOURCE.txt"), triLaneText);

  const soulSourcePath = path.join(userRoot, ".codex", "attachments", "81c8d728-c5e5-4dc1-a4f0-dd5964ed6606", "pasted-text.txt");
  const soulSource = fs.existsSync(soulSourcePath)
    ? fs.readFileSync(soulSourcePath, "utf8")
    : "SOUL GENOME concept source was not present; use SOUL_GENOME.json and the Orangebox Knowledge Engine doctor.";
  await writeFile(path.join(outDir, "SOUL_GENOME_CONCEPT_SOURCE.txt"), soulSource);

  await fsp.rm(zipPath, { force: true });
  await execFileAsync("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${psSingle(outDir)}\\*' -DestinationPath '${psSingle(zipPath)}' -Force`,
  ], { timeout: 180_000, windowsHide: true });

  const files = [];
  for (const name of fs.readdirSync(outDir)) {
    const file = path.join(outDir, name);
    const stat = fs.statSync(file);
    if (stat.isFile()) files.push({ name, bytes: stat.size, sha256: sha256File(file) });
  }
  const result = {
    ok: fs.existsSync(zipPath),
    version: "orangebox-v2-internal-setup-pack/v1",
    status: fs.existsSync(zipPath) ? "OBOX2_INTERNAL_SETUP_PACK_GREEN" : "OBOX2_INTERNAL_SETUP_PACK_NOT_GREEN",
    created_at: new Date().toISOString(),
    out_dir: outDir,
    zip_path: zipPath,
    zip_bytes: fs.existsSync(zipPath) ? fs.statSync(zipPath).size : 0,
    files,
    note: "Run this pack on Codexa / AI Box. Local generation of the pack does not prove models are installed on Codexa.",
  };

  await writeJson(path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-obox2-internal-setup-pack-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
