param(
  [int]$IntervalSeconds = 120,
  [int]$ReceiptEveryCycles = 30,
  [int]$ResearchEveryCycles = 720
)

$ErrorActionPreference = "Continue"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) {
  $repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}
if (-not (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-reality-watch.mjs"))) {
  $repo = "C:\AtomEons\orangebox-delta"
}
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "node.exe not found on PATH"
}

$watchScript = Join-Path $repo "scripts\v4\orangebox-reality-watch.mjs"
$alertScript = Join-Path $repo "scripts\v4\orangebox-codexa-alert-doctor.mjs"
$researchScript = Join-Path $repo "scripts\v4\orangebox-external-research-scout.mjs"
$knowledgeScript = Join-Path $repo "scripts\v4\orangebox-knowledge-improvement-queue.mjs"
$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $env:USERPROFILE "OrangeBox-Data" }
$watchRoot = Join-Path $dataRoot "watcher"
$logDir = Join-Path $watchRoot "listener-logs"
$heartbeat = Join-Path $watchRoot "watcher-process-heartbeat.json"
$notificationStatePath = Join-Path $watchRoot "codexa-link-notification-state.json"
$notificationReceiptDir = Join-Path $dataRoot "notifications"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
New-Item -ItemType Directory -Path $notificationReceiptDir -Force | Out-Null

function Read-JsonFile($Path) {
  try {
    if (Test-Path -LiteralPath $Path) {
      return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    }
  } catch {}
  return $null
}

function Write-JsonFile($Path, $Value) {
  $Value | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Show-OrangeboxPopup($Title, $Message) {
  try {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    Add-Type -AssemblyName System.Drawing | Out-Null
    $notify = New-Object System.Windows.Forms.NotifyIcon
    $notify.Icon = [System.Drawing.SystemIcons]::Warning
    $notify.BalloonTipTitle = $Title
    $notify.BalloonTipText = $Message
    $notify.Visible = $true
    $notify.ShowBalloonTip(12000)
    Start-Sleep -Milliseconds 700
    $notify.Dispose()
    return "notify_icon"
  } catch {
    try {
      Add-Type -AssemblyName PresentationFramework | Out-Null
      [System.Windows.MessageBox]::Show($Message, $Title, "OK", "Warning") | Out-Null
      return "message_box"
    } catch {
      return "unavailable"
    }
  }
}

function Maybe-NotifyCodexaLink($Reality) {
  if (-not $Reality) { return }
  $commandOk = $Reality.checks.probes.ai_box_command_8097.ok
  $wikiOk = $Reality.checks.probes.ai_box_wiki_8098.ok
  $codexaReachable = [bool]($commandOk -and $wikiOk)
  $state = Read-JsonFile $notificationStatePath
  $now = Get-Date
  $lastStatus = if ($state) { [string]$state.status } else { "" }
  $lastNotifiedAt = if ($state -and $state.last_notified_at) { [datetime]$state.last_notified_at } else { [datetime]"1970-01-01T00:00:00Z" }
  $cooldownMinutes = 30
  $shouldNotifyDown = (-not $codexaReachable) -and (($lastStatus -ne "DOWN") -or (($now.ToUniversalTime() - $lastNotifiedAt.ToUniversalTime()).TotalMinutes -ge $cooldownMinutes))
  $shouldNotifyRecovered = $codexaReachable -and ($lastStatus -eq "DOWN")

  $status = if ($codexaReachable) { "UP" } else { "DOWN" }
  $message = if ($codexaReachable) {
    "Codexa/AI Box is reachable again. Command rail 8097 and receipt rail 8098 answered."
  } else {
    "Orangebox cannot talk to Codexa/AI Box. Command rail 8097 or receipt rail 8098 is unreachable. Basic Install still works locally; heavy AI Box work should not be routed until the rail is green."
  }

  $popupMode = $null
  $notified = $false
  if ($shouldNotifyDown -or $shouldNotifyRecovered) {
    $popupMode = Show-OrangeboxPopup "Orangebox Codexa Link $status" $message
    $notified = $true
  }

  $record = [ordered]@{
    ok = $codexaReachable
    version = "orangebox-codexa-link-notifier/v0"
    status = $status
    checked_at = $now.ToUniversalTime().ToString("o")
    notified = $notified
    popup_mode = $popupMode
    cooldown_minutes = $cooldownMinutes
    command_rail = $Reality.checks.probes.ai_box_command_8097
    receipt_rail = $Reality.checks.probes.ai_box_wiki_8098
    message = $message
  }
  if ($notified) {
    $record.last_notified_at = $now.ToUniversalTime().ToString("o")
    $receiptPath = Join-Path $notificationReceiptDir ("codexa-link-{0:yyyyMMddTHHmmss}.json" -f $now)
    Write-JsonFile $receiptPath $record
    $record.receipt_path = $receiptPath
  } elseif ($state -and $state.last_notified_at) {
    $record.last_notified_at = $state.last_notified_at
  }
  Write-JsonFile $notificationStatePath $record
}

$cycle = 0
while ($true) {
  $cycle += 1
  $started = Get-Date
  $args = @($watchScript, "--json")
  if (($ReceiptEveryCycles -gt 0) -and (($cycle % $ReceiptEveryCycles) -eq 0)) {
    $args += "--receipt"
  }
  $logPath = Join-Path $logDir ("cycle-{0:yyyyMMddTHHmmss}.log" -f $started)
  Push-Location $repo
  try {
    $output = & $node @args 2>&1
    $exit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  try {
    if (Test-Path -LiteralPath $alertScript) {
      $alertOutput = & $node $alertScript --json --popup 2>&1
      $alertText = ($alertOutput | Out-String).Trim()
      try {
        $codexaAlert = $alertText | ConvertFrom-Json
      } catch {
        $codexaAlert = $null
      }
    }
  } catch {}
  $codexaAlertSummary = $null
  if ($codexaAlert) {
    $codexaAlertSummary = [ordered]@{
      status = $codexaAlert.status
      message = $codexaAlert.message
      command_rail_reachable = $codexaAlert.command_rail_reachable
      wiki_bridge_reachable = $codexaAlert.wiki_bridge_reachable
      receipts_reachable = $codexaAlert.receipts_reachable
      ollama_reachable = $codexaAlert.ollama_reachable
      remote_control_available = $codexaAlert.remote_control_available
      remote_execution_available = $codexaAlert.remote_execution_available
      smb_port_visible = $codexaAlert.smb_port_visible
      popup_notified = $codexaAlert.popup.notified
      alert_hash = $codexaAlert.alert_hash
      receipt_path = $codexaAlert.receipt_path
    }
  }
  try {
    if (($ResearchEveryCycles -gt 0) -and (($cycle % $ResearchEveryCycles) -eq 0) -and (Test-Path -LiteralPath $researchScript)) {
      & $node $researchScript --json --receipt 2>&1 | Out-Null
      if (Test-Path -LiteralPath $knowledgeScript) {
        & $node $knowledgeScript --json --receipt 2>&1 | Out-Null
      }
    }
  } catch {}
  $output | Select-Object -Last 80 | Set-Content -LiteralPath $logPath -Encoding UTF8
  Get-ChildItem -LiteralPath $logDir -Filter "cycle-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 200 |
    Remove-Item -Force
  [ordered]@{
    ok = ($exit -eq 0)
    version = "orangebox-reality-watcher/v0"
    cycle = $cycle
    last_started = $started.ToUniversalTime().ToString("o")
    last_finished = (Get-Date).ToUniversalTime().ToString("o")
    interval_seconds = $IntervalSeconds
    receipt_every_cycles = $ReceiptEveryCycles
    research_every_cycles = $ResearchEveryCycles
    last_exit_code = $exit
    last_log = $logPath
    repo = $repo
    watch_root = $watchRoot
    codexa_alert = $codexaAlertSummary
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $heartbeat -Encoding UTF8
  Start-Sleep -Seconds $IntervalSeconds
}
