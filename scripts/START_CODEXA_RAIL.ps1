param(
  [string]$AiBoxRoot = "C:\AtomEons\ai-box",
  [string]$ControllerIp = "10.0.99.2",
  [string]$TrustedIps = "10.0.99.2,10.0.99.0/24,10.0.0.114",
  [int]$CommandPort = 8097,
  [int]$BridgePort = 8098,
  [switch]$EnableRdp,
  [switch]$PullModels,
  [switch]$SkipAdminCheck
)

$ErrorActionPreference = "Stop"

$CommandRoot = Join-Path $AiBoxRoot "orangebox-command-rail"
$BridgeRoot = Join-Path $AiBoxRoot "orangebox-bridge"
$ReceiptRoot = Join-Path $AiBoxRoot "receipts"
$LogsRoot = Join-Path $AiBoxRoot "logs"
$TokenExport = Join-Path $AiBoxRoot "SET_CONTROLLER_ORANGEBOX_TOKENS.cmd"
$StatePath = Join-Path $ReceiptRoot "start-codexa-rail-latest.json"

function Assert-Admin {
  if ($SkipAdminCheck) { return }
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run START_CODEXA_RAIL.ps1 as Administrator on Codexa/AI Box."
  }
}

function New-Dirs {
  New-Item -ItemType Directory -Force -Path $CommandRoot,$BridgeRoot,$ReceiptRoot,$LogsRoot | Out-Null
}

function Get-NodePath {
  $cmd = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $cmd = Get-Command node -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  throw "Node.js is required on Codexa. Install Node.js LTS, then rerun this script."
}

function New-Token {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  return [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+","-").Replace("/","_")
}

function Get-OrCreate-Token($EnvNames, $FilePaths) {
  foreach ($name in $EnvNames) {
    $value = [Environment]::GetEnvironmentVariable($name, "Machine")
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($name, "User") }
    if (-not $value) { $value = [Environment]::GetEnvironmentVariable($name, "Process") }
    if ($value) { return $value.Trim() }
  }
  foreach ($file in $FilePaths) {
    if (Test-Path -LiteralPath $file) {
      $value = (Get-Content -LiteralPath $file -Raw).Trim()
      if ($value) { return $value }
    }
  }
  return New-Token
}

function Find-Server($TargetPath, $Candidates, $MissingHint) {
  if (Test-Path -LiteralPath $TargetPath) { return $TargetPath }
  foreach ($candidate in $Candidates) {
    if (Test-Path -LiteralPath $candidate) {
      Copy-Item -LiteralPath $candidate -Destination $TargetPath -Force
      return $TargetPath
    }
  }
  throw $MissingHint
}

function Stop-NodeForScript($Pattern) {
  Get-CimInstance Win32_Process -Filter "name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match $Pattern } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Set-PortFirewall($Name, $Port) {
  Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue | Remove-NetFirewallRule
  $trusted = $TrustedIps -split "[,; ]+" | Where-Object { $_ }
  New-NetFirewallRule -DisplayName $Name -Direction Inbound -Protocol TCP -LocalPort $Port -RemoteAddress $trusted -Action Allow | Out-Null
}

function Register-NodeTask($TaskName, $Node, $ArgLine, $WorkingDirectory) {
  Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$false
  $action = New-ScheduledTaskAction -Execute $Node -Argument $ArgLine -WorkingDirectory $WorkingDirectory
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Days 30)
  $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $TaskName | Out-Null
}

function Probe($Url) {
  try {
    $started = Get-Date
    $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri $Url
    return [ordered]@{
      ok = $true
      url = $Url
      status = [int]$response.StatusCode
      ms = [math]::Round(((Get-Date) - $started).TotalMilliseconds)
    }
  } catch {
    return [ordered]@{ ok = $false; url = $Url; status = 0; error = $_.Exception.Message }
  }
}

function Start-ModelPulls($AiBoxRoot) {
  $ollama = Get-Command ollama -ErrorAction SilentlyContinue
  if (-not $ollama) {
    return [ordered]@{ started = $false; reason = "Ollama CLI is not installed on Codexa." }
  }
  $models = @(
    "qwen2.5-coder:32b-instruct-q8_0",
    "llama3.3:70b-instruct-q4_0",
    "deepseek-r1:32b",
    "command-r:35b-08-2024-q8_0"
  )
  $script = Join-Path $AiBoxRoot "pull-orangebox-models.ps1"
  $log = Join-Path $LogsRoot ("ollama-pulls-{0:yyyyMMdd-HHmmss}.log" -f (Get-Date))
  @"
`$ErrorActionPreference = 'Continue'
`$models = @(
$(($models | ForEach-Object { "  `"$_`"" }) -join ",`r`n")
)
foreach (`$model in `$models) {
  "`$(Get-Date -Format o) pulling `$model" | Add-Content -LiteralPath '$log'
  ollama pull `$model *>> '$log'
}
ollama list *>> '$log'
"@ | Set-Content -LiteralPath $script -Encoding UTF8
  Start-Process -FilePath "powershell.exe" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $script) -WindowStyle Hidden
  return [ordered]@{ started = $true; script = $script; log = $log; models = $models }
}

Assert-Admin
New-Dirs
$node = Get-NodePath
$trustedList = ($TrustedIps -split "[,; ]+" | Where-Object { $_ }) -join ","

if ($EnableRdp) {
  try {
    Enable-NetFirewallRule -DisplayGroup "Remote Desktop" | Out-Null
    Set-ItemProperty -LiteralPath "HKLM:\System\CurrentControlSet\Control\Terminal Server" -Name "fDenyTSConnections" -Value 0
  } catch {
    Write-Warning "Could not enable RDP firewall/settings: $($_.Exception.Message)"
  }
}

$commandServer = Find-Server `
  -TargetPath (Join-Path $CommandRoot "codexa-command-rail-server.mjs") `
  -Candidates @(
    (Join-Path $PSScriptRoot "codexa-command-rail-server.mjs"),
    (Join-Path $AiBoxRoot "orangebox-command-rail-pack\codexa-command-rail-server.mjs"),
    (Join-Path $env:USERPROFILE "OrangeBox-Data\exports\codexa-command-rail-pack\codexa-command-rail-server.mjs")
  ) `
  -MissingHint "Missing codexa-command-rail-server.mjs. On the controller, generate/copy the codexa-command-rail-pack, then rerun this script on Codexa."

$bridgeServer = $null
$bridgeMissing = $null
try {
  $bridgeServer = Find-Server `
    -TargetPath (Join-Path $BridgeRoot "codexa-bridge-server.mjs") `
    -Candidates @(
      (Join-Path $PSScriptRoot "codexa-bridge-server.mjs"),
      (Join-Path $AiBoxRoot "codexa-bridge-pack\codexa-bridge-server.mjs"),
      (Join-Path $env:USERPROFILE "OrangeBox-Data\exports\codexa-bridge-pack\codexa-bridge-server.mjs")
    ) `
    -MissingHint "Missing codexa-bridge-server.mjs. Copy the codexa-bridge-pack to Codexa if 8098 is required."
} catch {
  $bridgeMissing = $_.Exception.Message
}

$commandTokenPath = Join-Path $CommandRoot "ORANGEBOX_AI_BOX_COMMAND_TOKEN.txt"
$legacyCommandTokenPath = Join-Path $CommandRoot "ORANGEBOX_CODEXA_COMMAND_TOKEN.txt"
$bridgeTokenPath = Join-Path $BridgeRoot "ORANGEBOX_BRIDGE_TOKEN.txt"
$commandToken = Get-OrCreate-Token @("ORANGEBOX_AI_BOX_COMMAND_TOKEN","ORANGEBOX_CODEXA_COMMAND_TOKEN") @($commandTokenPath,$legacyCommandTokenPath)
$bridgeToken = Get-OrCreate-Token @("ORANGEBOX_BRIDGE_TOKEN") @($bridgeTokenPath)
$commandToken | Set-Content -LiteralPath $commandTokenPath -Encoding UTF8
$commandToken | Set-Content -LiteralPath $legacyCommandTokenPath -Encoding UTF8
$bridgeToken | Set-Content -LiteralPath $bridgeTokenPath -Encoding UTF8

@"
@echo off
setx ORANGEBOX_AI_BOX_COMMAND_TOKEN "$commandToken"
setx ORANGEBOX_CODEXA_COMMAND_TOKEN "$commandToken"
setx ORANGEBOX_BRIDGE_TOKEN "$bridgeToken"
echo Restart your terminal/apps after setting Orangebox Codexa tokens.
"@ | Set-Content -LiteralPath $TokenExport -Encoding ASCII

$commandArgs = "`"$commandServer`" --host 0.0.0.0 --port $CommandPort --cockpitIp $ControllerIp --trustedIps `"$trustedList`" --token `"$commandToken`""
Stop-NodeForScript "codexa-command-rail-server\.mjs|orangebox-command-rail-server\.mjs"
Register-NodeTask "OrangeBOX AI Box Command Rail" $node $commandArgs $CommandRoot
Start-Process -FilePath $node -ArgumentList $commandArgs -WorkingDirectory $CommandRoot -WindowStyle Hidden
Set-PortFirewall "OrangeBOX AI Box Command Rail From Controller" $CommandPort

$bridgeStarted = $false
if ($bridgeServer) {
  $bridgeArgs = "`"$bridgeServer`" --host 0.0.0.0 --port $BridgePort --token `"$bridgeToken`""
  Stop-NodeForScript "codexa-bridge-server\.mjs"
  Register-NodeTask "OrangeBOX AI Box Bridge" $node $bridgeArgs $BridgeRoot
  Start-Process -FilePath $node -ArgumentList $bridgeArgs -WorkingDirectory $BridgeRoot -WindowStyle Hidden
  Set-PortFirewall "OrangeBOX AI Box Bridge From Controller" $BridgePort
  $bridgeStarted = $true
}

$modelPull = if ($PullModels) { Start-ModelPulls $AiBoxRoot } else { [ordered]@{ started = $false; reason = "PullModels switch not set." } }

Start-Sleep -Seconds 4
$checks = [ordered]@{
  command_local = Probe "http://127.0.0.1:$CommandPort/health"
  bridge_local = Probe "http://127.0.0.1:$BridgePort/health"
  knowledge_local = Probe "http://127.0.0.1:8099/"
}

$ok = [bool]$checks.command_local.ok
$status = if ($ok) { "READY" } else { "NOT_READY" }
$receipt = [ordered]@{
  ok = $ok
  status = $status
  version = "orangebox-start-codexa-rail/v1"
  created_at = (Get-Date).ToUniversalTime().ToString("o")
  host = $env:COMPUTERNAME
  ai_box_root = $AiBoxRoot
  controller_ip = $ControllerIp
  trusted_ips = $trustedList
  command = [ordered]@{ port = $CommandPort; server = $commandServer; started = $true }
  bridge = [ordered]@{ port = $BridgePort; server = $bridgeServer; started = $bridgeStarted; missing = $bridgeMissing }
  rdp_firewall_requested = [bool]$EnableRdp
  model_pull = $modelPull
  token_export = $TokenExport
  checks = $checks
  next_action = if ($ok) { "Run the token export cmd on the controller if tokens were newly generated, then probe http://10.0.99.1:$CommandPort/health from Cockpit." } else { "Inspect command rail server path and latest logs, then rerun START_CODEXA_RAIL.ps1 as Administrator." }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$receiptPath = Join-Path $ReceiptRoot "start-codexa-rail-$stamp.json"
$receipt.receipt_path = $receiptPath
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $receiptPath -Encoding UTF8
$receipt | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $StatePath -Encoding UTF8

if ($ok) {
  Write-Host "READY" -ForegroundColor Green
  Write-Host "Command rail: http://10.0.99.1:$CommandPort/health" -ForegroundColor Green
  if ($bridgeStarted) { Write-Host "Bridge rail:  http://10.0.99.1:$BridgePort/health" -ForegroundColor Green }
  Write-Host "Token export for controller: $TokenExport" -ForegroundColor Yellow
  Write-Host "Receipt: $receiptPath" -ForegroundColor Green
  exit 0
}

Write-Host "NOT_READY" -ForegroundColor Red
Write-Host "Receipt: $receiptPath" -ForegroundColor Yellow
exit 1
