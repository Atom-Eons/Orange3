param(
  [int]$IntervalSeconds = 120,
  [int]$ReceiptEveryCycles = 30
)

$ErrorActionPreference = "Continue"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) { $repo = "C:\AtomEons\orangebox-delta" }
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "node.exe not found on PATH"
}

$watchScript = Join-Path $repo "scripts\v4\orangebox-reality-watch.mjs"
$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $env:USERPROFILE "OrangeBox-Data" }
$watchRoot = Join-Path $dataRoot "watcher"
$logDir = Join-Path $watchRoot "listener-logs"
$heartbeat = Join-Path $watchRoot "watcher-process-heartbeat.json"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

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
    last_exit_code = $exit
    last_log = $logPath
    repo = $repo
    watch_root = $watchRoot
  } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $heartbeat -Encoding UTF8
  Start-Sleep -Seconds $IntervalSeconds
}
