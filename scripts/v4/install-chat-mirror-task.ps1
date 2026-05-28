param(
  [int]$IntervalSeconds = 90,
  [int64]$MaxBytesPerCycle = 8388608,
  [int64]$MaxBytesPerFile = 1048576,
  [int]$ReceiptEveryCycles = 20
)

$ErrorActionPreference = "Stop"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) { $repo = "C:\AtomEons\orangebox-delta" }
$taskName = "Orangebox ChatBackup Listener"
$listener = Join-Path $repo "scripts\v4\chat-backup-listener.ps1"
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source

if (-not (Test-Path -LiteralPath $listener)) {
  throw "Missing ChatBackup listener script: $listener"
}

$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$listener`" -IntervalSeconds $IntervalSeconds -MaxBytesPerCycle $MaxBytesPerCycle -MaxBytesPerFile $MaxBytesPerFile -ReceiptEveryCycles $ReceiptEveryCycles"
$action = New-ScheduledTaskAction -Execute $powershell -Argument $argument -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Days 30)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$installMode = "scheduled_task"
$shortcutPath = $null
$registerError = $null
$started = $false
$startError = $null

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
  $shortcutPath = Join-Path $startupDir "Orangebox ChatBackup Listener.lnk"
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($shortcutPath)
  $shortcut.TargetPath = $powershell
  $shortcut.Arguments = $argument
  $shortcut.WorkingDirectory = $repo
  $shortcut.WindowStyle = 7
  $shortcut.Description = "Orangebox local incremental ChatBackup listener"
  $shortcut.Save()

  try {
    Start-Process -FilePath $powershell -ArgumentList $argument -WorkingDirectory $repo -WindowStyle Hidden
    $started = $true
  } catch {
    $started = $false
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
  max_bytes_per_cycle = $MaxBytesPerCycle
  max_bytes_per_file = $MaxBytesPerFile
  receipt_every_cycles = $ReceiptEveryCycles
  listener = $listener
  powershell = $powershell
  note = "Always-on local incremental ChatBackup listener. It copies appended bytes only and keeps each cycle byte-capped."
} | ConvertTo-Json -Depth 5
