param(
  [int]$IntervalSeconds = 180,
  [switch]$Dry
)

$ErrorActionPreference = "Stop"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) {
  $repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}
if (-not (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-active-council-watcher.ps1"))) {
  $repo = "C:\AtomEons\orangebox\finals\Orangebox Delta Final"
}
if (-not (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-active-council-watcher.ps1"))) {
  $repo = "C:\AtomEons\orangebox-delta"
}

$taskName = "Orangebox Active Council"
$watcher = Join-Path $repo "scripts\v4\orangebox-active-council-watcher.ps1"
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath $watcher)) {
  throw "Missing active council watcher: $watcher"
}

function Stop-ExistingWatcher($ScriptPath) {
  $scriptName = Split-Path -Leaf $ScriptPath
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.ProcessId -ne $PID -and
      $_.CommandLine -and
      ($_.CommandLine.Contains($ScriptPath) -or $_.CommandLine.Contains($scriptName))
    } |
    ForEach-Object {
      try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
    }
}

Stop-ExistingWatcher $watcher

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$watcher`" -IntervalSeconds $IntervalSeconds"
if ($Dry) { $argument += " -Dry" }
$action = New-ScheduledTaskAction -Execute $powershell -Argument $argument -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Days 30)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$installMode = "scheduled_task"
$registerError = $null
$started = $false
$startError = $null
$shortcutPath = $null

try {
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
  try {
    Start-ScheduledTask -TaskName $taskName | Out-Null
    $started = $true
  } catch {
    $startError = $_.Exception.Message
  }
} catch {
  $registerError = $_.Exception.Message
  $installMode = "startup_shortcut"
  $startupDir = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
  New-Item -ItemType Directory -Path $startupDir -Force | Out-Null
  $shortcutPath = Join-Path $startupDir "Orangebox Active Council.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = $argument
  $shortcut.WorkingDirectory = $repo
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Orangebox active model council watcher"
  $shortcut.Save()
  try {
    Stop-ExistingWatcher $watcher
    Start-Process -FilePath $powershell -ArgumentList $argument -WorkingDirectory $repo -WindowStyle Hidden
    $started = $true
  } catch {
    $startError = $_.Exception.Message
  }
}

[ordered]@{
  ok = $true
  task_name = $taskName
  install_mode = $installMode
  started_now = $started
  start_error = if ($started) { $null } else { $startError }
  register_error = $registerError
  startup_shortcut = $shortcutPath
  interval_seconds = $IntervalSeconds
  dry = [bool]$Dry
  watcher = $watcher
  powershell = $powershell
  note = "Active Council keeps the small/pressure/judgement lanes warm through Codexa Ollama keep_alive and writes receipts. Heavy lanes remain warrant-only."
} | ConvertTo-Json -Depth 6
