param(
  [switch]$Apply,
  [switch]$StopProcesses,
  [switch]$Popup
)

$ErrorActionPreference = "Continue"
$userRoot = $env:USERPROFILE
$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $userRoot "OrangeBox-Data" }
$repoRoot = if ($env:ORANGEBOX_REPO_ROOT) { $env:ORANGEBOX_REPO_ROOT } else { "C:\AtomEons\orangebox-delta" }
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$retireRoot = Join-Path $dataRoot "openclaw-retirement\$stamp"
$latestPath = Join-Path $dataRoot "openclaw-retirement\latest-openclaw-retirement.json"
$repoReceiptDir = Join-Path $repoRoot "receipts"

function Ensure-Dir($Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  }
}

function Backup-Move($Path, $Bucket) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $name = Split-Path -Leaf $Path
  $destDir = Join-Path $retireRoot $Bucket
  Ensure-Dir $destDir
  $dest = Join-Path $destDir $name
  if ($Apply) {
    Move-Item -LiteralPath $Path -Destination $dest -Force
  }
  return [ordered]@{
    source = $Path
    destination = $dest
    moved = [bool]$Apply
  }
}

function Remove-RunValue($HivePath, $Name) {
  $backupPath = Join-Path $retireRoot "registry-run-values.jsonl"
  $value = $null
  try { $value = (Get-ItemProperty -LiteralPath $HivePath -Name $Name -ErrorAction Stop).$Name } catch {}
  if ($null -eq $value) { return $null }
  Ensure-Dir (Split-Path -Parent $backupPath)
  $record = [ordered]@{ hive = $HivePath; name = $Name; value = $value; removed = [bool]$Apply }
  if ($Apply) {
    $record | ConvertTo-Json -Compress | Add-Content -LiteralPath $backupPath -Encoding UTF8
    Remove-ItemProperty -LiteralPath $HivePath -Name $Name -ErrorAction SilentlyContinue
  }
  return $record
}

Ensure-Dir $retireRoot

$startupDirs = @(
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"),
  (Join-Path $env:ProgramData "Microsoft\Windows\Start Menu\Programs\Startup")
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

$startupMatches = @()
foreach ($dir in $startupDirs) {
  $items = Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match "openclaw|open claw" -or
    ($_.FullName -match "openclaw|open claw") -or
    ((Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue) -match "openclaw|\.openclaw")
  }
  foreach ($item in $items) {
    $startupMatches += Backup-Move -Path $item.FullName -Bucket "startup-disabled"
  }
}

$runMatches = @()
foreach ($runPath in @("HKCU:\Software\Microsoft\Windows\CurrentVersion\Run", "HKLM:\Software\Microsoft\Windows\CurrentVersion\Run")) {
  if (Test-Path -LiteralPath $runPath) {
    $props = Get-ItemProperty -LiteralPath $runPath -ErrorAction SilentlyContinue
    foreach ($prop in $props.PSObject.Properties) {
      if ($prop.Name -match "^PS") { continue }
      if ($prop.Name -match "openclaw|open claw" -or [string]$prop.Value -match "openclaw|\.openclaw") {
        $runMatches += Remove-RunValue -HivePath $runPath -Name $prop.Name
      }
    }
  }
}

$taskMatches = @()
try {
  $tasks = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
    $_.TaskName -match "openclaw|open claw" -or $_.TaskPath -match "openclaw|open claw"
  }
  foreach ($task in $tasks) {
    $record = [ordered]@{
      task_name = $task.TaskName
      task_path = $task.TaskPath
      state_before = [string]$task.State
      disabled = $false
    }
    if ($Apply) {
      Disable-ScheduledTask -TaskName $task.TaskName -TaskPath $task.TaskPath -ErrorAction SilentlyContinue | Out-Null
      $record.disabled = $true
    }
    $taskMatches += $record
  }
} catch {}

$serviceMatches = @()
try {
  $services = Get-Service | Where-Object { $_.Name -match "openclaw|open claw" -or $_.DisplayName -match "openclaw|open claw" }
  foreach ($svc in $services) {
    $record = [ordered]@{
      name = $svc.Name
      display_name = $svc.DisplayName
      status_before = [string]$svc.Status
      start_type_before = [string]$svc.StartType
      stopped = $false
      disabled = $false
    }
    if ($Apply) {
      Stop-Service -Name $svc.Name -Force -ErrorAction SilentlyContinue
      Set-Service -Name $svc.Name -StartupType Disabled -ErrorAction SilentlyContinue
      $record.stopped = $true
      $record.disabled = $true
    }
    $serviceMatches += $record
  }
} catch {}

$processMatches = @()
try {
  $processes = Get-Process | Where-Object {
    $_.ProcessName -match "openclaw|open claw" -or
    ($_.Path -and $_.Path -match "openclaw|\.openclaw")
  }
  foreach ($proc in $processes) {
    $record = [ordered]@{
      id = $proc.Id
      name = $proc.ProcessName
      path = $proc.Path
      stopped = $false
    }
    if ($Apply -and $StopProcesses) {
      Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
      $record.stopped = $true
    }
    $processMatches += $record
  }
} catch {}

$rollback = [ordered]@{
  startup = @($startupMatches | Where-Object { $_ -and $_.moved } | ForEach-Object { "Move '$($_.destination)' back to '$($_.source)'." })
  registry = "Restore values from $retireRoot\registry-run-values.jsonl if any were removed."
  tasks = "Re-enable any task listed in this receipt if needed."
  services = "Set service StartupType back from Disabled if any service was changed."
}

$result = [ordered]@{
  ok = $true
  status = if ($Apply) { "OPENCLAW_STARTUP_RETIRED" } else { "OPENCLAW_STARTUP_RETIREMENT_DRY_RUN" }
  applied = [bool]$Apply
  computer = $env:COMPUTERNAME
  checked_at = (Get-Date).ToUniversalTime().ToString("o")
  retire_root = $retireRoot
  startup_matches = @($startupMatches)
  registry_run_matches = @($runMatches)
  scheduled_task_matches = @($taskMatches)
  service_matches = @($serviceMatches)
  process_matches = @($processMatches)
  stop_processes = [bool]$StopProcesses
  current_lane = "Hermes/Orangebox replaces OpenClaw as active Ops path. OpenClaw is retired from startup, not deleted from backups."
  rollback = $rollback
}

Ensure-Dir (Split-Path -Parent $latestPath)
$result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $latestPath -Encoding UTF8
if (Test-Path -LiteralPath $repoRoot) {
  Ensure-Dir $repoReceiptDir
  $repoReceipt = Join-Path $repoReceiptDir "orangebox-openclaw-retirement-$stamp.json"
  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $repoReceipt -Encoding UTF8
  $result.repo_receipt = $repoReceipt
  $result | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $latestPath -Encoding UTF8
}

if ($Popup) {
  $message = if ($Apply) {
    "OpenClaw startup has been retired on $env:COMPUTERNAME.`n`nReceipt:`n$latestPath`n`nOrangebox/Hermes path remains active."
  } else {
    "OpenClaw startup retirement dry run complete on $env:COMPUTERNAME.`n`nRun with -Apply to move startup hooks.`n`nReceipt:`n$latestPath"
  }
  try {
    $wshell = New-Object -ComObject WScript.Shell
    $wshell.Popup($message, 20, "Orangebox OpenClaw Retirement", 64) | Out-Null
  } catch {
    Write-Host $message
  }
}

$result | ConvertTo-Json -Depth 10
