param(
  [Parameter(Position = 0)]
  [string]$Command = "help",
  [switch]$Json
)

$ErrorActionPreference = "Continue"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) {
  $finalRepo = "C:\AtomEons\orangebox\finals\Orangebox Delta Final"
  if (Test-Path -LiteralPath $finalRepo) { $repo = $finalRepo }
  else { $repo = "C:\AtomEons\orangebox-delta" }
}
$dataRoot = if ($env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT } else { Join-Path $env:USERPROFILE "OrangeBox-Data" }
$receiptRoot = Join-Path $dataRoot "skill-command-receipts"
$stamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")

$commands = [ordered]@{
  "help" = @{
    kind = "local"
    description = "List real Orangebox skill commands."
  }
  "badge" = @{
    kind = "powershell"
    file = "skills\orangebox-primer\scripts\orangebox_session_badge.ps1"
    args = @()
    description = "Show orange OB0X ON badge and write badge receipt."
  }
  "system-check" = @{
    kind = "powershell"
    file = "skills\orangebox-primer\scripts\orangebox_system_check.ps1"
    args = @()
    description = "Read local Orangebox proof state without refreshing."
  }
  "system-refresh" = @{
    kind = "powershell"
    file = "skills\orangebox-primer\scripts\orangebox_system_check.ps1"
    args = @("-Refresh")
    description = "Refresh lightweight Orangebox proof receipts."
  }
  "backend-proof" = @{
    kind = "npm"
    args = @("run", "backend:proof")
    description = "Run backend build/test/proof chain."
  }
  "health-report" = @{
    kind = "npm"
    args = @("run", "health:report")
    description = "Generate full dev + AI Box health report."
  }
  "project-report" = @{
    kind = "npm"
    args = @("run", "project:report")
    description = "Generate full Orangebox project scope/reality report."
  }
  "ops-readiness" = @{
    kind = "npm"
    args = @("run", "ops:readiness")
    description = "Verify Ops rails, primers, services, datasets, and package proofs."
  }
  "ops-green" = @{
    kind = "npm"
    args = @("run", "ops:green")
    description = "Refresh and prove local Orangebox Ops green without requiring Codexa/two-machine rails."
  }
  "ops-gaps" = @{
    kind = "npm"
    args = @("run", "ops:gaps")
    description = "Write the one-reality gap ledger with evidence, blockers, proof commands, and safe next actions."
  }
  "reality-watch" = @{
    kind = "npm"
    args = @("run", "reality:watch")
    description = "Report actual reachable rails and warnings."
  }
  "strongarm-doctor" = @{
    kind = "npm"
    args = @("run", "strongarm:doctor")
    description = "Verify STRONGARM pressure gate."
  }
  "gremlin-doctor" = @{
    kind = "npm"
    args = @("run", "gremlin:doctor")
    description = "Verify Misfits/Gremlin elite packet dataset and trainer handoff."
  }
  "trilane-doctor" = @{
    kind = "npm"
    args = @("run", "trilane:doctor")
    description = "Verify local model registry, role map, and routing policy."
  }
  "model-lane-eval" = @{
    kind = "npm"
    args = @("run", "model:lane-eval")
    description = "Verify local model role lanes, wildcard discipline, packet gates, and honest installed inventory."
  }
  "model-inventory" = @{
    kind = "npm"
    args = @("run", "model:inventory")
    description = "Report registered, installed, reachable, cloud, core, heavy, and wildcard model truth."
  }
  "soul-doctor" = @{
    kind = "npm"
    args = @("run", "soul:doctor")
    description = "Verify SOUL GENOME continuity map."
  }
  "knowledge-improvements" = @{
    kind = "npm"
    args = @("run", "knowledge:improvements")
    description = "Refresh Knowledge Engine learned improvement candidates without self-promotion."
  }
  "research-scout" = @{
    kind = "npm"
    args = @("run", "research:scout")
    description = "Fetch low-bandwidth public research signals and park upgrade candidates."
  }
  "research-radar" = @{
    kind = "npm"
    args = @("run", "research:radar")
    description = "Run scout, improvement queue, and assurance into one approval-ready research radar."
  }
  "assurance-doctor" = @{
    kind = "npm"
    args = @("run", "assurance:doctor")
    description = "Verify research-derived upgrades become scoped backend gates, receipts, and playbooks."
  }
  "harness-benchmark" = @{
    kind = "npm"
    args = @("run", "harness:benchmark")
    description = "Run offline oracle tasks for Orangebox tool, routing, receipt, and proof harness quality."
  }
  "tool-ergonomics" = @{
    kind = "npm"
    args = @("run", "tool:ergonomics")
    description = "Verify Orangebox commands are distinct, concise, bounded, receipt-backed, and scoped."
  }
  "checkmate-eval" = @{
    kind = "npm"
    args = @("run", "checkmate:doctor")
    description = "Verify CHECKMATE eval gates before prompt, model, routing, score, or tool changes."
  }
  "signal-hygiene" = @{
    kind = "npm"
    args = @("run", "signal:hygiene")
    description = "Verify Orangebox alert cadence, severity labels, confidence calibration, and local/full-system split."
  }
  "session-spine" = @{
    kind = "npm"
    args = @("run", "session:spine")
    description = "Verify doer surfaces, watcher freshness, and one-reality state without touching frontend."
  }
  "feature-proof" = @{
    kind = "npm"
    args = @("run", "feature:proof")
    description = "Verify every Orangebox feature claim has status, evidence, proof command, and rollback or recovery truth."
  }
  "final-verify" = @{
    kind = "npm"
    args = @("run", "final:verify")
    description = "Refresh and verify Orangebox Delta Final backend install package."
  }
  "final-zip" = @{
    kind = "npm"
    args = @("run", "final:zip")
    description = "Build and verify the Orangebox Delta Final Downloads zip."
  }
  "codexa-alert" = @{
    kind = "npm"
    args = @("run", "codexa:alert")
    description = "Probe Codexa/AI Box rails and write an explicit alert receipt."
  }
  "codexa-alert-popup" = @{
    kind = "npm"
    args = @("run", "codexa:alert:popup")
    description = "Probe Codexa/AI Box rails and show a throttled Windows popup if attention is required."
  }
  "codexa-watch" = @{
    kind = "npm"
    args = @("run", "codexa:watch")
    description = "After Codexa setup, run a bounded bring-up watch and write the ready/open-gaps receipt."
  }
  "codexa-watch-popup" = @{
    kind = "npm"
    args = @("run", "codexa:watch:popup")
    description = "Run the Codexa bring-up watch and allow the first alert popup if attention is required."
  }
  "codexa-smb-stage" = @{
    kind = "npm"
    args = @("run", "codexa:smb-stage")
    description = "Probe whether Codexa SMB can stage recovery artifacts; dry by default, no remote execution."
  }
  "codexa-handoff" = @{
    kind = "npm"
    args = @("run", "codexa:handoff")
    description = "Write the exact Codexa first-click setup handoff, current blockers, and verify order."
  }
  "mcp-doctor" = @{
    kind = "npm"
    args = @("run", "mcp:doctor")
    description = "Verify MCP quarantine/tool bridge without installs, paid APIs, or host MCP config mutation."
  }
  "ipi-doctor" = @{
    kind = "npm"
    args = @("run", "ipi:doctor")
    description = "Verify indirect prompt-injection drills and untrusted-text quarantine."
  }
  "memory-doctor" = @{
    kind = "npm"
    args = @("run", "memory:doctor")
    description = "Verify latest source-backed receipt truth beats stale chat memory and compressed summaries carry source pointers."
  }
  "action-doctor" = @{
    kind = "npm"
    args = @("run", "action:doctor")
    description = "Verify the pre-tool action classifier blocks credential hunts, exfiltration, review bypasses, and unsafe commands."
  }
  "skills-lifecycle" = @{
    kind = "npm"
    args = @("run", "skills:lifecycle")
    description = "Verify Orangebox skills are installed, non-stale, command-mapped, and receipt-visible."
  }
  "obox2-pack" = @{
    kind = "npm"
    args = @("run", "obox2:pack")
    description = "Build Orangebox V2 Internal setup zip into Downloads."
  }
  "obox2-doctor" = @{
    kind = "npm"
    args = @("run", "obox2:doctor")
    description = "Expand and verify the Orangebox V2 setup zip without installing."
  }
  "openclaw-retire-dry" = @{
    kind = "npm"
    args = @("run", "openclaw:retire:dry")
    description = "Dry-run surgical OpenClaw startup retirement."
  }
  "openclaw-retire" = @{
    kind = "npm"
    args = @("run", "openclaw:retire")
    description = "Move OpenClaw startup hooks to backup, stop OpenClaw processes, and show popup."
  }
}

function Write-Orange($Text) {
  $esc = [char]27
  if ($Host.UI.SupportsVirtualTerminal) {
    Write-Host "$esc[38;2;255;122;0m$Text$esc[0m"
  } else {
    Write-Host $Text -ForegroundColor DarkYellow
  }
}

function Emit-Help {
  Write-Orange "ORANGEBOX VERSION 1 | OB0X COMMANDS | REAL ACTIONS"
  foreach ($name in $commands.Keys) {
    $desc = $commands[$name].description
    Write-Host ("  {0,-20} {1}" -f $name, $desc)
  }
}

if (-not $commands.Contains($Command)) {
  Emit-Help
  Write-Host ""
  Write-Host "Unknown command: $Command" -ForegroundColor Red
  exit 2
}

if ($Command -eq "help") {
  Emit-Help
  exit 0
}

$spec = $commands[$Command]
$started = Get-Date
$output = @()
$exitCode = 0

Push-Location $repo
try {
  if ($spec.kind -eq "npm") {
    $output = & npm.cmd @($spec.args) 2>&1
    $exitCode = $LASTEXITCODE
  } elseif ($spec.kind -eq "powershell") {
    $file = Join-Path $repo $spec.file
    $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $file @($spec.args) 2>&1
    $exitCode = $LASTEXITCODE
  }
} finally {
  Pop-Location
}

New-Item -ItemType Directory -Force -Path $receiptRoot | Out-Null
$result = [ordered]@{
  ok = ($exitCode -eq 0)
  command = $Command
  repo = $repo
  started_at = $started.ToUniversalTime().ToString("o")
  finished_at = (Get-Date).ToUniversalTime().ToString("o")
  exit_code = $exitCode
  tail = (($output | Select-Object -Last 30) -join "`n")
}
$receiptPath = Join-Path $receiptRoot "orangebox-skill-command-$Command-$stamp.json"
$result.receipt_path = $receiptPath
$result | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8

if ($Json) {
  $result | ConvertTo-Json -Depth 8
} else {
  Write-Orange "ORANGEBOX COMMAND: $Command"
  Write-Host (($output | Select-Object -Last 80) -join "`n")
  Write-Host ""
  Write-Host "Receipt: $receiptPath" -ForegroundColor DarkGray
}

if ($exitCode -ne 0) { exit $exitCode }
