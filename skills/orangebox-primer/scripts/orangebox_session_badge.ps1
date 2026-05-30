param(
  [switch]$Refresh
)

$ErrorActionPreference = "Continue"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$checkScript = Join-Path $scriptDir "orangebox_system_check.ps1"
$data = Join-Path $env:USERPROFILE "OrangeBox-Data"
$badgePath = Join-Path $data "primers\orangebox-session-badge-latest.json"

function Write-OrangeLine($Text) {
  $esc = [char]27
  $orange = "$esc[38;2;255;122;0m"
  $reset = "$esc[0m"
  if ($Host.UI.SupportsVirtualTerminal) {
    Write-Host "$orange$Text$reset"
  } else {
    Write-Host $Text -ForegroundColor DarkYellow
  }
}

function Write-GreenLine($Text) {
  if ($Host.UI.SupportsVirtualTerminal) {
    $esc = [char]27
    Write-Host "$esc[38;2;0;210;120m$Text$esc[0m"
  } else {
    Write-Host $Text -ForegroundColor Green
  }
}

function Write-MutedLine($Text) {
  Write-Host $Text -ForegroundColor DarkGray
}

$check = $null
$checkOk = $false
$checkText = ""
if (Test-Path -LiteralPath $checkScript) {
  try {
    if ($Refresh) { $checkText = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkScript -Refresh 2>&1) -join "`n" }
    else { $checkText = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $checkScript 2>&1) -join "`n" }
    $check = $checkText | ConvertFrom-Json
    $checkOk = [bool]$check.ok
  } catch {
    $checkOk = $false
  }
}

$status = if ($checkOk) { "VERIFIED" } else { "NEEDS PROOF" }
$repo = if ($check -and $check.repo) { $check.repo } elseif ($env:ORANGEBOX_REPO_ROOT) { $env:ORANGEBOX_REPO_ROOT } else { "unknown" }
$line = "ORANGEBOX VERSION 1 | OB0X ON | OPS BACKEND $status"

Write-OrangeLine "============================================================"
Write-OrangeLine "  $line"
Write-OrangeLine "============================================================"
if ($checkOk) { Write-GreenLine "  Reality check: local receipts and backend rails are present." }
else { Write-Host "  Reality check: run the primer system check before trusting this chat." -ForegroundColor Yellow }
Write-MutedLine "  Repo: $repo"
Write-MutedLine "  Lane: Orangebox Ops backend. Visual/frontend lane is separate unless explicitly authorized."
Write-MutedLine "  Proof before report. Receipts over vibes."

$record = [ordered]@{
  ok = $checkOk
  public_name = "Orangebox Version 1"
  badge = $line
  repo = $repo
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  note = "Use this badge at the top of primed chats or terminals so the operator can tell Orangebox is active."
}

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $badgePath) | Out-Null
$record | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $badgePath -Encoding UTF8

if (-not $checkOk) { exit 1 }
