param(
  [string]$Project = "orangebox",
  [string]$Root = "C:\AtomEons\ai-box",
  [string]$StatePath = "C:\AtomEons\ai-box\receipts\blueb0x-big-model-install-state.json",
  [string]$ReceiptRoot = "C:\AtomEons\ai-box\receipts",
  [switch]$Help
)

$ErrorActionPreference = "Continue"
$ProgressPreference = "SilentlyContinue"

if ($Help) {
  Write-Host "BLUEB0X Codexa big-model installer. Run on Codexa through the command rail; do not run on the N150 cockpit."
  Write-Host "Example: powershell -File codexa-big-model-install.ps1 -Project orangebox"
  exit 0
}

$Models = @(
  [ordered]@{
    Id = "STRATEGIST"
    Tag = "llama3.3:70b-instruct-q4_0"
    Family = "Strategist"
    Departments = "AE0,AE1,AE3,AE4,AE5,LIPS"
    TargetRamGB = 40
  },
  [ordered]@{
    Id = "ENGINEER"
    Tag = "qwen2.5-coder:32b-instruct-q8_0"
    Family = "Engineer"
    Departments = "AE6,AE8,AE11,AE12,AE13"
    TargetRamGB = 35
  },
  [ordered]@{
    Id = "LIBRARIAN"
    Tag = "command-r:35b-08-2024-q8_0"
    Family = "Librarian"
    Departments = "AE2,AE9,AE10"
    TargetRamGB = 34
  },
  [ordered]@{
    Id = "AUDITOR"
    Tag = "deepseek-r1:70b-llama-distill-q4_K_M"
    Family = "Auditor"
    Departments = "AE7,AE14,MIRRORS,CHECKMATE"
    TargetRamGB = 43
  }
)

function New-Dirs {
  New-Item -ItemType Directory -Force -Path $ReceiptRoot,(Join-Path $Root "logs"),(Join-Path $Root "model-install") | Out-Null
}

function Get-MemorySnapshot {
  $os = Get-CimInstance Win32_OperatingSystem
  [ordered]@{
    totalGB = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    freeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    usedPercent = [math]::Round((1 - ($os.FreePhysicalMemory / $os.TotalVisibleMemorySize)) * 100, 1)
  }
}

function Write-State($State) {
  $State.updatedAt = (Get-Date).ToUniversalTime().ToString("o")
  $State | ConvertTo-Json -Depth 12 | Set-Content -Path $StatePath -Encoding UTF8
}

function Add-Event($State, [string]$Kind, [string]$Message, [string]$Status = "INFO") {
  $State.events += [ordered]@{
    at = (Get-Date).ToUniversalTime().ToString("o")
    kind = $Kind
    status = $Status
    message = $Message
  }
  Write-State $State
}

function Invoke-Logged([string]$Name, [string]$Command, [int]$TimeoutMinutes = 240) {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $log = Join-Path $Root "logs\big-model-$stamp-$Name.log"
  $started = Get-Date
  $wrapped = "$Command *> '$log'; exit `$LASTEXITCODE"
  $proc = Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $wrapped) -WindowStyle Hidden -Wait -PassThru
  $status = if ($proc.ExitCode -eq 0) { "VERIFIED" } else { "FAILED" }
  [ordered]@{ status = $status; exitCode = $proc.ExitCode; logPath = $log; totalSec = [math]::Round(((Get-Date) - $started).TotalSeconds, 1) }
}

function Ensure-Ollama($State) {
  [Environment]::SetEnvironmentVariable("OLLAMA_MAX_LOADED_MODELS", "1", "User")
  [Environment]::SetEnvironmentVariable("OLLAMA_NUM_PARALLEL", "1", "User")
  [Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "5m", "User")
  $env:OLLAMA_MAX_LOADED_MODELS = "1"
  $env:OLLAMA_NUM_PARALLEL = "1"
  $env:OLLAMA_KEEP_ALIVE = "5m"

  $cmd = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Add-Event $State "ollama-install" "Ollama CLI missing; attempting winget install." "RUNNING"
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
      winget install --id Ollama.Ollama --silent --accept-source-agreements --accept-package-agreements
      $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
      $cmd = Get-Command ollama -ErrorAction SilentlyContinue
    }
  }
  if (-not $cmd) { throw "Ollama CLI is not installed and winget could not install it." }

  try {
    Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/tags" -TimeoutSec 5 | Out-Null
  } catch {
    Add-Event $State "ollama-serve" "Ollama API not responding; starting ollama serve hidden." "RUNNING"
    Start-Process -FilePath $cmd.Source -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep -Seconds 8
  }
  $version = (& ollama --version) -join "`n"
  $State.ollama = [ordered]@{
    status = "VERIFIED"
    command = $cmd.Source
    version = $version
    env = [ordered]@{
      OLLAMA_MAX_LOADED_MODELS = $env:OLLAMA_MAX_LOADED_MODELS
      OLLAMA_NUM_PARALLEL = $env:OLLAMA_NUM_PARALLEL
      OLLAMA_KEEP_ALIVE = $env:OLLAMA_KEEP_ALIVE
    }
  }
  Write-State $State
}

function Smoke-Model($Tag, $TimeoutSec = 900) {
  $payload = @{
    model = $Tag
    prompt = "Reply READY only."
    stream = $false
    keep_alive = "5m"
    options = @{ num_predict = 3 }
  } | ConvertTo-Json -Depth 5
  Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec $TimeoutSec
}

function Release-Model($Tag) {
  $payload = @{
    model = $Tag
    prompt = ""
    stream = $false
    keep_alive = 0
    options = @{ num_predict = 1 }
  } | ConvertTo-Json -Depth 5
  try { Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 120 | Out-Null } catch {}
}

New-Dirs
$state = [ordered]@{
  status = "RUNNING"
  project = $Project
  startedAt = (Get-Date).ToUniversalTime().ToString("o")
  updatedAt = $null
  host = $env:COMPUTERNAME
  policy = [ordered]@{
    OLLAMA_MAX_LOADED_MODELS = "1"
    OLLAMA_NUM_PARALLEL = "1"
    OLLAMA_KEEP_ALIVE = "5m"
    hotSwap = "wake one department model, smoke it, release it unless active DAG queue still needs it"
  }
  memoryStart = Get-MemorySnapshot
  ollama = [ordered]@{ status = "PENDING" }
  models = @()
  events = @()
  receiptPath = $null
}
Write-State $state

try {
  Ensure-Ollama $state
  foreach ($model in $Models) {
    $row = [ordered]@{
      id = $model.Id
      tag = $model.Tag
      family = $model.Family
      departments = $model.Departments
      targetRamGB = $model.TargetRamGB
      status = "RUNNING"
      startedAt = (Get-Date).ToUniversalTime().ToString("o")
      memoryBefore = Get-MemorySnapshot
      pull = $null
      smoke = $null
      release = $null
      memoryAfter = $null
    }
    $state.models += $row
    Add-Event $state "model-pull" "Pulling $($model.Tag)" "RUNNING"
    $pullCommand = "ollama pull `"$($model.Tag)`""
    $row.pull = Invoke-Logged -Name ($model.Id.ToLower()) -Command $pullCommand -TimeoutMinutes 360
    if ($row.pull.status -ne "VERIFIED") {
      $row.status = "FAILED_PULL"
      Add-Event $state "model-pull" "$($model.Tag) failed: $($row.pull.status)" "FAILED"
      Write-State $state
      continue
    }
    Add-Event $state "model-smoke" "Smoking $($model.Tag)" "RUNNING"
    try {
      $smokeStart = Get-Date
      $smoke = Smoke-Model $model.Tag
      $row.smoke = [ordered]@{
        status = "VERIFIED"
        response = [string]$smoke.response
        done = [bool]$smoke.done
        loadDurationNs = $smoke.load_duration
        totalDurationNs = $smoke.total_duration
        elapsedSec = [math]::Round(((Get-Date) - $smokeStart).TotalSeconds, 1)
      }
      $row.status = "VERIFIED"
    } catch {
      $row.smoke = [ordered]@{ status = "FAILED"; error = $_.Exception.Message }
      $row.status = "FAILED_SMOKE"
    }
    Release-Model $model.Tag
    $row.release = [ordered]@{ status = "REQUESTED"; keep_alive = 0; at = (Get-Date).ToUniversalTime().ToString("o") }
    $row.memoryAfter = Get-MemorySnapshot
    $row.finishedAt = (Get-Date).ToUniversalTime().ToString("o")
    Write-State $state
  }
  $state.memoryEnd = Get-MemorySnapshot
  $state.ollamaList = try { (& ollama list) -join "`n" } catch { $_.Exception.Message }
  $state.ollamaPs = try { (& ollama ps) -join "`n" } catch { $_.Exception.Message }
  $failed = @($state.models | Where-Object { $_.status -ne "VERIFIED" })
  $state.status = if ($failed.Count) { "CONFIGURED_WITH_GAPS" } else { "VERIFIED" }
} catch {
  $state.status = "FAILED"
  $state.error = $_.Exception.Message
  Add-Event $state "fatal" $_.Exception.Message "FAILED"
}

$state.finishedAt = (Get-Date).ToUniversalTime().ToString("o")
$receiptPath = Join-Path $ReceiptRoot ("blueb0x-big-model-install-{0}.json" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$state.receiptPath = $receiptPath
Write-State $state
$state | ConvertTo-Json -Depth 12 | Set-Content -Path $receiptPath -Encoding UTF8
