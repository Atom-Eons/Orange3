param(
  [int]$IntervalSeconds = 180,
  [switch]$Dry
)

$ErrorActionPreference = "Continue"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) {
  $repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
}
if (-not (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-active-council.mjs"))) {
  $repo = "C:\AtomEons\orangebox\finals\Orangebox Delta Final"
}
if (-not (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-active-council.mjs"))) {
  $repo = "C:\AtomEons\orangebox-delta"
}

$bun = (Get-Command bun.exe -ErrorAction SilentlyContinue).Source
$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
$runner = if ($bun) { $bun } else { $node }
if (-not $runner) { throw "bun.exe or node.exe not found on PATH" }

$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $env:USERPROFILE "OrangeBox-Data" }
$root = Join-Path $dataRoot "active-council"
$logDir = Join-Path $root "logs"
$heartbeat = Join-Path $root "watcher-heartbeat.json"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$cycle = 0
while ($true) {
  $cycle += 1
  $started = Get-Date
  $script = Join-Path $repo "scripts\v4\orangebox-active-council.mjs"
  $args = @($script, "pulse", "--json", "--receipt")
  if ($Dry) { $args += "--dry" }
  $logPath = Join-Path $logDir ("pulse-{0:yyyyMMddTHHmmss}.log" -f $started)
  Push-Location $repo
  try {
    $output = & $runner @args 2>&1
    $exit = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $output | Select-Object -Last 120 | Set-Content -LiteralPath $logPath -Encoding UTF8
  Get-ChildItem -LiteralPath $logDir -Filter "pulse-*.log" -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 200 |
    Remove-Item -Force
  [ordered]@{
    ok = ($exit -eq 0)
    version = "orangebox-active-council-watcher/v1"
    status = if ($exit -eq 0) { "ACTIVE_COUNCIL_WATCHER_RUNNING" } else { "ACTIVE_COUNCIL_WATCHER_OPEN_GAPS" }
    cycle = $cycle
    dry = [bool]$Dry
    last_started = $started.ToUniversalTime().ToString("o")
    last_finished = (Get-Date).ToUniversalTime().ToString("o")
    interval_seconds = $IntervalSeconds
    last_exit_code = $exit
    last_log = $logPath
    repo = $repo
  } | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $heartbeat -Encoding UTF8
  Start-Sleep -Seconds $IntervalSeconds
}
