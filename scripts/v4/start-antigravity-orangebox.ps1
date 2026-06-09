param(
  [string]$ProjectRoot = "",
  [switch]$NoStart
)

$ErrorActionPreference = "Stop"

if (-not $ProjectRoot) {
  if ($env:ORANGEBOX_REPO_ROOT -and (Test-Path -LiteralPath $env:ORANGEBOX_REPO_ROOT)) {
    $ProjectRoot = $env:ORANGEBOX_REPO_ROOT
  } elseif ((Test-Path -LiteralPath (Join-Path (Get-Location).Path "package.json")) -and (Test-Path -LiteralPath (Join-Path (Get-Location).Path "skills\orangebox-primer\SKILL.md"))) {
    $ProjectRoot = (Get-Location).Path
  } elseif (Test-Path -LiteralPath "C:\AtomEons\orangebox\finals\Orangebox Delta Final") {
    $ProjectRoot = "C:\AtomEons\orangebox\finals\Orangebox Delta Final"
  } else {
    $ProjectRoot = "C:\AtomEons\orangebox-delta"
  }
}

if (-not (Test-Path -LiteralPath $ProjectRoot)) {
  throw "Orangebox project root not found: $ProjectRoot"
}

$resolvedProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $env:USERPROFILE "OrangeBox-Data" }
$receiptRoot = Join-Path $dataRoot "antigravity"
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$receiptPath = Join-Path $receiptRoot "orangebox-antigravity-launch-$stamp.json"

New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null

$env:ORANGEBOX_REPO_ROOT = $resolvedProjectRoot
$env:OB0X_ON = "1"
$env:OB0X_LANE = "backend_ops"
$env:VSCODE_CWD = $resolvedProjectRoot
$env:WORKSPACE_DIRS = $resolvedProjectRoot
$env:PWD = $resolvedProjectRoot
Set-Location -LiteralPath $resolvedProjectRoot

$antigravityExe = Join-Path $env:LOCALAPPDATA "Programs\antigravity\Antigravity.exe"
$launcher = $null
if (Test-Path -LiteralPath $antigravityExe) {
  $launcher = $antigravityExe
} else {
  $cmd = Get-Command antigravity -CommandType Application,ExternalScript -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($cmd) { $launcher = $cmd.Path }
}

$result = [ordered]@{
  ok = $false
  status = "ANTIGRAVITY_NOT_STARTED"
  checked_at = (Get-Date).ToUniversalTime().ToString("o")
  project_root = $resolvedProjectRoot
  cwd = (Get-Location).Path
  launcher = $launcher
  no_start = [bool]$NoStart
  env = [ordered]@{
    ORANGEBOX_REPO_ROOT = $env:ORANGEBOX_REPO_ROOT
    OB0X_ON = $env:OB0X_ON
    OB0X_LANE = $env:OB0X_LANE
    VSCODE_CWD = $env:VSCODE_CWD
    WORKSPACE_DIRS = $env:WORKSPACE_DIRS
  }
  note = "Launches Antigravity from the Orangebox repo root to avoid home-directory CWD drift breaking workspace rules, skills, or MCP paths."
}

if (-not $launcher) {
  $result.status = "ANTIGRAVITY_EXECUTABLE_NOT_FOUND"
} elseif ($NoStart) {
  $result.ok = $true
  $result.status = "ANTIGRAVITY_LAUNCH_DRY_GREEN"
} else {
  Start-Process -FilePath $launcher -ArgumentList @(".") -WorkingDirectory $resolvedProjectRoot
  $result.ok = $true
  $result.status = "ANTIGRAVITY_LAUNCHED_OB0X_ON"
}

$result.receipt_path = $receiptPath
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8

$esc = [char]27
Write-Host "$esc[38;2;255;122;0m$($result.status) | OB0X ON | $resolvedProjectRoot$esc[0m"
Write-Host "Receipt: $receiptPath" -ForegroundColor DarkGray

if (-not $result.ok) { exit 1 }
