param(
  [switch]$Refresh
)

$ErrorActionPreference = "Continue"
$repo = $env:ORANGEBOX_REPO_ROOT
if (-not $repo) {
  $finalRepo = "C:\AtomEons\orangebox\finals\Orangebox Delta Final"
  if (Test-Path -LiteralPath $finalRepo) { $repo = $finalRepo }
  else { $repo = "C:\AtomEons\orangebox-delta" }
}
$data = Join-Path $env:USERPROFILE "OrangeBox-Data"
$result = [ordered]@{
  ok = $true
  generated_at = (Get-Date).ToUniversalTime().ToString("o")
  repo = $repo
  data_root = $data
  checks = @()
  latest = [ordered]@{}
  commands_run = @()
  guidance = @(
    "Public-facing product name is Orangebox Version 1.",
    "Active lane is Orangebox Ops backend.",
    "AECode is the middle voice/compiler contract.",
    "AtomSmasher is a received backend compression capability pack; verify it from the latest doctor receipt.",
    "Do not touch visual, website, store, deploy, or paid model lanes without explicit authorization."
  )
}

function Add-Check($id, $ok, $detail) {
  $script:result.checks += [ordered]@{ id = $id; ok = [bool]$ok; detail = $detail }
  if (-not $ok) { $script:result.ok = $false }
}

Add-Check "repo_present" (Test-Path -LiteralPath $repo) $repo
Add-Check "package_json_present" (Test-Path -LiteralPath (Join-Path $repo "package.json")) "package.json"
Add-Check "gauntlet_engine_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\gauntlet-engine.mjs")) "scripts/v4/gauntlet-engine.mjs"
Add-Check "aecode_format_doctor_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\aecode-format-doctor.mjs")) "scripts/v4/aecode-format-doctor.mjs"
Add-Check "atomsmasher_runtime_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\atomsmasher-runtime.mjs")) "scripts/v4/atomsmasher-runtime.mjs"
Add-Check "atomsmasher_tool_merge_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\atomsmasher-tool-merge-doctor.mjs")) "scripts/v4/atomsmasher-tool-merge-doctor.mjs"
Add-Check "mid_session_primer_script_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-mid-session-primer.mjs")) "scripts/v4/orangebox-mid-session-primer.mjs"
Add-Check "restart_lock_script_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-restart-lock-doctor.mjs")) "scripts/v4/orangebox-restart-lock-doctor.mjs"
Add-Check "codexa_sync_script_present" (Test-Path -LiteralPath (Join-Path $repo "scripts\v4\orangebox-codexa-config-sync-doctor.mjs")) "scripts/v4/orangebox-codexa-config-sync-doctor.mjs"
Add-Check "final_format_registry_present" (Test-Path -LiteralPath (Join-Path $data "aecode-format\latest-final-format.json")) "latest-final-format.json"
Add-Check "atomsmasher_doctor_present" (Test-Path -LiteralPath (Join-Path $data "atomsmasher\latest-atomsmasher-doctor.json")) "latest-atomsmasher-doctor.json"
Add-Check "atomsmasher_tool_merge_present_data" (Test-Path -LiteralPath (Join-Path $data "atomsmasher\tool-merge\latest-tool-merge.json")) "latest-tool-merge.json"
Add-Check "latest_health_report_present" (Test-Path -LiteralPath (Join-Path $data "reports\health\latest-health-report.json")) "latest-health-report.json"
Add-Check "latest_project_report_present" (Test-Path -LiteralPath (Join-Path $data "reports\project\latest-project-report.json")) "latest-project-report.json"
Add-Check "latest_harness_benchmark_present" (Test-Path -LiteralPath (Join-Path $data "harness\latest-harness-benchmark.json")) "latest-harness-benchmark.json"
Add-Check "latest_tool_ergonomics_present" (Test-Path -LiteralPath (Join-Path $data "tool-ergonomics\latest-tool-ergonomics.json")) "latest-tool-ergonomics.json"
Add-Check "latest_checkmate_eval_present" (Test-Path -LiteralPath (Join-Path $data "checkmate\latest-checkmate-eval-lane.json")) "latest-checkmate-eval-lane.json"
Add-Check "source_of_truth_lock_present" (Test-Path -LiteralPath (Join-Path $data "orangebox-source-of-truth.json")) "orangebox-source-of-truth.json"
Add-Check "mid_session_primer_present" (Test-Path -LiteralPath (Join-Path $data "primers\ORANGEBOX_MID_SESSION_PRIMER.md")) "ORANGEBOX_MID_SESSION_PRIMER.md"
Add-Check "codexa_config_present" (Test-Path -LiteralPath (Join-Path $data "codexa-sync\latest-codexa-config.json")) "latest-codexa-config.json"

if (Test-Path -LiteralPath (Join-Path $data "gauntlet\latest-orangebox-full-green.json")) {
  try {
    $fg = Get-Content -LiteralPath (Join-Path $data "gauntlet\latest-orangebox-full-green.json") -Raw | ConvertFrom-Json
    $result.latest.full_green_ok = [bool]$fg.ok
    $result.latest.full_green_status = $fg.summary.status
    $result.latest.full_green_finished_at = $fg.finished_at
    $result.latest.full_green_note = "Broad two-machine/system gate. Local Ops may be green while this is red due Codexa/Ollama/Hermes or release gates."
  } catch {
    Add-Check "latest_full_green_readable" $false $_.Exception.Message
  }
}

if (Test-Path -LiteralPath (Join-Path $data "reports\project\latest-project-report.json")) {
  try {
    $project = Get-Content -LiteralPath (Join-Path $data "reports\project\latest-project-report.json") -Raw | ConvertFrom-Json
    $result.latest.local_ops_green = [bool]$project.local_ops_green
    $result.latest.full_project_green = [bool]$project.full_project_green
    $result.latest.project_status = $project.status
    Add-Check "local_ops_green" ([bool]$project.local_ops_green) $project.status
  } catch {
    Add-Check "latest_project_report_readable" $false $_.Exception.Message
  }
}

if (Test-Path -LiteralPath (Join-Path $data "harness\latest-harness-benchmark.json")) {
  try {
    $harness = Get-Content -LiteralPath (Join-Path $data "harness\latest-harness-benchmark.json") -Raw | ConvertFrom-Json
    $result.latest.harness_status = $harness.status
    $result.latest.harness_tasks_ok = $harness.tasks_ok
    $result.latest.harness_tasks_total = $harness.tasks_total
    Add-Check "harness_benchmark_green" (([bool]$harness.ok) -and ($harness.status -eq "ORANGEBOX_HARNESS_BENCHMARK_GREEN")) $harness.status
  } catch {
    Add-Check "latest_harness_benchmark_readable" $false $_.Exception.Message
  }
}

if (Test-Path -LiteralPath (Join-Path $data "tool-ergonomics\latest-tool-ergonomics.json")) {
  try {
    $tool = Get-Content -LiteralPath (Join-Path $data "tool-ergonomics\latest-tool-ergonomics.json") -Raw | ConvertFrom-Json
    $result.latest.tool_ergonomics_status = $tool.status
    $result.latest.tool_ergonomics_command_count = $tool.command_surface.command_count
    Add-Check "tool_ergonomics_green" (([bool]$tool.ok) -and ($tool.status -eq "ORANGEBOX_TOOL_ERGONOMICS_GREEN")) $tool.status
  } catch {
    Add-Check "latest_tool_ergonomics_readable" $false $_.Exception.Message
  }
}

if (Test-Path -LiteralPath (Join-Path $data "checkmate\latest-checkmate-eval-lane.json")) {
  try {
    $checkmate = Get-Content -LiteralPath (Join-Path $data "checkmate\latest-checkmate-eval-lane.json") -Raw | ConvertFrom-Json
    $result.latest.checkmate_eval_status = $checkmate.status
    $result.latest.checkmate_eval_fixtures = $checkmate.fixtures.Count
    Add-Check "checkmate_eval_green" (([bool]$checkmate.ok) -and ($checkmate.status -eq "CHECKMATE_EVAL_LANE_GREEN")) $checkmate.status
  } catch {
    Add-Check "latest_checkmate_eval_readable" $false $_.Exception.Message
  }
}

if (Test-Path -LiteralPath (Join-Path $data "atomsmasher\tool-merge\latest-tool-merge.json")) {
  try {
    $tm = Get-Content -LiteralPath (Join-Path $data "atomsmasher\tool-merge\latest-tool-merge.json") -Raw | ConvertFrom-Json
    $result.latest.atomsmasher_tool_merge_ok = [bool]$tm.ok
    $result.latest.atomsmasher_tool_merge_status = $tm.status
    $result.latest.atomsmasher_tool_merge_eligible_backend_tools = $tm.manifest.totals.eligible_backend_tools
    Add-Check "atomsmasher_tool_merge_green" (([bool]$tm.ok) -and ($tm.status -eq "ATOMSMASHER_TOOL_MERGE_GREEN")) $tm.status
  } catch {
    Add-Check "atomsmasher_tool_merge_readable" $false $_.Exception.Message
  }
}

if (Test-Path -LiteralPath (Join-Path $data "atomsmasher\latest-atomsmasher-doctor.json")) {
  try {
    $as = Get-Content -LiteralPath (Join-Path $data "atomsmasher\latest-atomsmasher-doctor.json") -Raw | ConvertFrom-Json
    $result.latest.atomsmasher_ok = [bool]$as.ok
    $result.latest.atomsmasher_status = $as.summary.status
    $result.latest.atomsmasher_features_ok = $as.summary.features_ok
    $result.latest.atomsmasher_schema_version = $as.summary.schema_version
    Add-Check "atomsmasher_integration_green" (([bool]$as.ok) -and ($as.summary.status -eq "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN")) $as.summary.status
  } catch {
    Add-Check "atomsmasher_doctor_readable" $false $_.Exception.Message
  }
}

if ($Refresh -and (Test-Path -LiteralPath $repo)) {
  Push-Location $repo
  try {
    foreach ($cmd in @("restart:lock", "primer:mid", "codexa:sync-config -- --no-deploy", "aecode:format", "atomsmasher:proof", "atomsmasher:merge-tools", "system:doctor")) {
      $started = Get-Date
      $parts = $cmd -split " "
      $scriptName = $parts[0]
      $scriptArgs = @()
      if ($parts.Count -gt 1) { $scriptArgs = $parts[1..($parts.Count - 1)] }
      $output = & npm.cmd run $scriptName @scriptArgs 2>&1
      $exit = $LASTEXITCODE
      $result.commands_run += [ordered]@{
        command = "npm.cmd run $cmd"
        exit_code = $exit
        duration_ms = [int]((Get-Date) - $started).TotalMilliseconds
        tail = (($output | Select-Object -Last 8) -join "`n")
      }
      Add-Check "refresh_$($cmd -replace ':','_')" ($exit -eq 0) "npm.cmd run $cmd"
    }
  } finally {
    Pop-Location
  }
}

$json = $result | ConvertTo-Json -Depth 8
$json
if (-not $result.ok) { exit 1 }
