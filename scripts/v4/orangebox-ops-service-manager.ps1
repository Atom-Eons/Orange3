param(
  [int]$CommandPort = 8787,
  [int]$ApiPort = 8797,
  [int]$LlamaPort = 8080,
  [int]$StrongarmPort = 8094,
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) {
  $repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}
$dataRoot = $env:ORANGEBOX_DATA_ROOT
if (-not $dataRoot) {
  $dataRoot = Join-Path $env:USERPROFILE "OrangeBox-Data"
}
$serviceRoot = Join-Path $dataRoot "services"
$startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$toolBin = "C:\AtomEons\tools\bin"
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
New-Item -ItemType Directory -Force -Path $serviceRoot, $startupDir | Out-Null

function Test-Http($Url, [int]$TimeoutSec = 3) {
  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec $TimeoutSec
    $sw.Stop()
    return [ordered]@{ ok = $true; status = [int]$response.StatusCode; ms = [int]$sw.ElapsedMilliseconds; url = $Url }
  } catch {
    $sw.Stop()
    return [ordered]@{ ok = $false; status = 0; ms = [int]$sw.ElapsedMilliseconds; url = $Url; error = $_.Exception.Message }
  }
}

function Stop-MatchingProcesses($Needle) {
  $stopped = @()
  if (-not $Needle) { return $stopped }
  $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -and
      $_.CommandLine.Contains($Needle)
    }
  foreach ($proc in $processes) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      $stopped += [ordered]@{ pid = [int]$proc.ProcessId; name = $proc.Name; command_line = $proc.CommandLine }
    } catch {
      $stopped += [ordered]@{ pid = [int]$proc.ProcessId; name = $proc.Name; stop_error = $_.Exception.Message }
    }
  }
  return $stopped
}

function Ensure-Shortcut($Name, $TargetPath, $Arguments, $WorkingDirectory) {
  $shortcutPath = Join-Path $startupDir $Name
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $TargetPath
  $shortcut.Arguments = $Arguments
  $shortcut.WorkingDirectory = $WorkingDirectory
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Orangebox Ops always-on service"
  $shortcut.Save()
  return $shortcutPath
}

function Start-Hidden($Arguments, $WorkingDirectory) {
  if ($NoStart) { return $null }
  $proc = Start-Process -FilePath $powershell -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory -WindowStyle Hidden -PassThru
  return [int]$proc.Id
}

function Wait-ForUrl($Url, [int]$TimeoutSec = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  $latest = $null
  while ((Get-Date) -lt $deadline) {
    $latest = Test-Http $Url 2
    if ($latest.ok) { return $latest }
    Start-Sleep -Milliseconds 800
  }
  return $latest
}

function Ensure-LoopService($Id, $ScriptPath, $Arguments, $ShortcutName) {
  $fullArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" $Arguments"
  $shortcut = Ensure-Shortcut $ShortcutName $powershell $fullArgs $repo
  $stopped = Stop-MatchingProcesses (Split-Path -Leaf $ScriptPath)
  $startedPid = Start-Hidden $fullArgs $repo
  return [ordered]@{
    ok = (-not $NoStart) -and ($startedPid -ne $null)
    id = $Id
    startup_shortcut = $shortcut
    pid = $startedPid
    stopped_existing = $stopped
  }
}

function Ensure-PortService($Id, $Url, $ScriptPath, $Arguments, $ShortcutName, [int]$TimeoutSec = 60) {
  $fullArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$ScriptPath`" $Arguments"
  $shortcut = Ensure-Shortcut $ShortcutName $powershell $fullArgs $repo
  $before = Test-Http $Url 2
  if ($before.ok) {
    return [ordered]@{ ok = $true; id = $Id; already_running = $true; probe = $before; startup_shortcut = $shortcut; pid = $null; stopped_existing = @() }
  }
  $stopped = Stop-MatchingProcesses $ScriptPath
  $startedPid = Start-Hidden $fullArgs $repo
  $after = if ($NoStart) { $before } else { Wait-ForUrl $Url $TimeoutSec }
  return [ordered]@{
    ok = [bool]$after.ok
    id = $Id
    already_running = $false
    probe = $after
    startup_shortcut = $shortcut
    pid = $startedPid
    stopped_existing = $stopped
  }
}

$chatScript = Join-Path $repo "scripts\v4\chat-backup-listener.ps1"
$watchScript = Join-Path $repo "scripts\v4\orangebox-reality-watcher.ps1"
$backendScript = Join-Path $toolBin "orangebox-delta-backend.ps1"
$apiScript = Join-Path $toolBin "orangebox-delta-api.ps1"
$llamaScript = Join-Path $toolBin "orangebox-llama-listener.ps1"
$strongarmScript = Join-Path $toolBin "orangebox-strongarm.ps1"

$strongarmLauncher = @"
param(
  [int]`$Port = 8094
)
`$ErrorActionPreference = "Stop"
`$repo = `$env:ORANGEBOX_REPO_ROOT
if (-not `$repo) { `$repo = "$repo" }
`$root = Join-Path `$repo "integrations\strongarm_easy_v0_4"
Set-Location -LiteralPath `$root
python .\strongarm.py server --host 127.0.0.1 --port `$Port
"@
New-Item -ItemType Directory -Force -Path $toolBin | Out-Null
Set-Content -LiteralPath $strongarmScript -Value $strongarmLauncher -Encoding UTF8

$services = [ordered]@{}
$services.chatbackup_listener = Ensure-LoopService `
  "chatbackup_listener" `
  $chatScript `
  "-IntervalSeconds 90 -MaxBytesPerCycle 8388608 -MaxBytesPerFile 1048576 -ReceiptEveryCycles 20" `
  "Orangebox ChatBackup Listener.lnk"

$services.reality_watcher = Ensure-LoopService `
  "reality_watcher" `
  $watchScript `
  "-IntervalSeconds 120 -ReceiptEveryCycles 30" `
  "Orangebox Reality Watcher.lnk"

$services.command_server = Ensure-PortService `
  "command_server" `
  "http://127.0.0.1:$CommandPort/api/status?fast=1" `
  $backendScript `
  "-Port $CommandPort -HostName 127.0.0.1" `
  "Orangebox Backend Command Server.lnk" `
  90

$services.api_server = Ensure-PortService `
  "api_server" `
  "http://127.0.0.1:$ApiPort/api/health" `
  $apiScript `
  "-Port $ApiPort" `
  "Orangebox Backend API Server.lnk" `
  90

if (Test-Path -LiteralPath $llamaScript) {
  $services.local_llama_listener = Ensure-PortService `
    "local_llama_listener" `
    "http://127.0.0.1:$LlamaPort/health" `
    $llamaScript `
    "" `
    "Orangebox Local Llama Listener.lnk" `
    240
} else {
  $services.local_llama_listener = [ordered]@{
    ok = $false
    id = "local_llama_listener"
    error = "Missing launcher: $llamaScript"
  }
}

if (Test-Path -LiteralPath (Join-Path $repo "integrations\strongarm_easy_v0_4\strongarm.py")) {
  $services.strongarm_gate = Ensure-PortService `
    "strongarm_gate" `
    "http://127.0.0.1:$StrongarmPort/health" `
    $strongarmScript `
    "-Port $StrongarmPort" `
    "Orangebox STRONGARM Gate.lnk" `
    60
} else {
  $services.strongarm_gate = [ordered]@{
    ok = $false
    id = "strongarm_gate"
    error = "Missing integration: $(Join-Path $repo "integrations\strongarm_easy_v0_4\strongarm.py")"
  }
}

Start-Sleep -Seconds 2
$finalProbes = [ordered]@{
  command_server = Test-Http "http://127.0.0.1:$CommandPort/api/status?fast=1" 3
  api_server = Test-Http "http://127.0.0.1:$ApiPort/api/health" 3
  local_llama_listener = Test-Http "http://127.0.0.1:$LlamaPort/health" 3
  strongarm_gate = Test-Http "http://127.0.0.1:$StrongarmPort/health" 3
}

$ok = $true
foreach ($key in $services.Keys) {
  if (-not $services[$key].ok) { $ok = $false }
}
foreach ($key in $finalProbes.Keys) {
  if (-not $finalProbes[$key].ok) { $ok = $false }
}

$result = [ordered]@{
  ok = $ok
  version = "orangebox-ops-service-manager/v0"
  status = if ($ok) { "ORANGEBOX_OPS_SERVICES_RUNNING" } else { "ORANGEBOX_OPS_SERVICES_NEED_ATTENTION" }
  checked_at = (Get-Date).ToUniversalTime().ToString("o")
  repo_root = $repo
  data_root = $dataRoot
  no_start = [bool]$NoStart
  services = $services
  final_probes = $finalProbes
}

$latestPath = Join-Path $serviceRoot "latest-ops-services.json"
$receiptPath = Join-Path $serviceRoot ("orangebox-ops-services-{0}.json" -f (Get-Date -Format "yyyyMMddTHHmmss"))
$json = $result | ConvertTo-Json -Depth 10
Set-Content -LiteralPath $latestPath -Value $json -Encoding UTF8
Set-Content -LiteralPath $receiptPath -Value $json -Encoding UTF8
$result.receipt_path = $receiptPath
$result | ConvertTo-Json -Depth 10

if (-not $ok) { exit 1 }
