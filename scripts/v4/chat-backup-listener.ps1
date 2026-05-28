param(
  [int]$IntervalSeconds = 90,
  [int64]$MaxBytesPerCycle = 8388608,
  [int64]$MaxBytesPerFile = 1048576,
  [int]$ReceiptEveryCycles = 20
)

$ErrorActionPreference = "Continue"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) { $repo = "C:\AtomEons\orangebox-delta" }
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  throw "node.exe not found on PATH"
}

$mirrorScript = Join-Path $repo "scripts\v4\chat-mirror.mjs"
$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $env:USERPROFILE "OrangeBox-Data" }
$mirrorRoot = Join-Path $dataRoot "chat-mirror"
$logDir = Join-Path $mirrorRoot "listener-logs"
$heartbeat = Join-Path $mirrorRoot "listener-heartbeat.json"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$cycle = 0
while ($true) {
  $cycle += 1
  $started = Get-Date
  $receiptFlag = if (($ReceiptEveryCycles -gt 0) -and (($cycle % $ReceiptEveryCycles) -eq 0)) { "--receipt" } else { "" }
  $args = @($mirrorScript, "--max-bytes-total", "$MaxBytesPerCycle", "--max-bytes-per-file", "$MaxBytesPerFile")
  if ($receiptFlag) { $args += $receiptFlag }
  $logPath = Join-Path $logDir ("cycle-{0:yyyyMMddTHHmmss}.log" -f $started)
  Push-Location $repo
  try {
    $output = & $node @args 2>&1
    $exit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $output | Select-Object -Last 40 | Set-Content -LiteralPath $logPath -Encoding UTF8
  Get-ChildItem -LiteralPath $logDir -Filter "cycle-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 200 |
    Remove-Item -Force
  $hb = [ordered]@{
    ok = ($exit -eq 0)
    version = "orangebox-chatbackup-listener/v0"
    cycle = $cycle
    last_started = $started.ToUniversalTime().ToString("o")
    last_finished = (Get-Date).ToUniversalTime().ToString("o")
    interval_seconds = $IntervalSeconds
    max_bytes_per_cycle = $MaxBytesPerCycle
    max_bytes_per_file = $MaxBytesPerFile
    receipt_every_cycles = $ReceiptEveryCycles
    last_exit_code = $exit
    last_log = $logPath
    repo = $repo
    mirror_root = $mirrorRoot
  }
  $hb | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $heartbeat -Encoding UTF8
  Start-Sleep -Seconds $IntervalSeconds
}
