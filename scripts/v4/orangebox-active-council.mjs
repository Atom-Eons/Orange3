#!/usr/bin/env node
/*
  orangebox-active-council.mjs

  Turns the model stack from "configured" into "awake enough to feel alive".
  The pulse path uses Codexa's existing token-gated command rail to keep small
  local lanes warm through Ollama keep_alive. No paid APIs, no frontend edits.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const command = rawArgs.find((arg) => !arg.startsWith("--")) || "doctor";
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const wantsPulse = command === "pulse" || args.has("--pulse");
const dryRun = args.has("--dry");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "active-council");
const configPath = path.join(repoRoot, "config", "active_council.json");
const directIp = process.env.ORANGEBOX_CODEXA_DIRECT_IP || process.env.ORANGEBOX_AI_BOX_DIRECT_IP || "10.0.99.1";
const lanIp = process.env.ORANGEBOX_CODEXA_IP || process.env.ORANGEBOX_AI_BOX_IP || "10.0.0.4";

const tokenCandidates = [
  process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN || "",
  process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN || "",
  path.join(dataRoot, "exports", "codexa-command-rail-pack", "SET_CONTROLLER_COMMAND_TOKEN.cmd"),
  path.join(dataRoot, "exports", "codexa-command-rail-pack", "SET_COCKPIT_COMMAND_TOKEN.cmd"),
  path.join(dataRoot, "exports", "codexa-rail-recovery-pack", "SET_CONTROLLER_COMMAND_TOKEN.cmd"),
  "C:/AtomEons/aeskills/orangebox/exports/codexa-non-codex-rail-repair-pack/command-rail/INSTALL_CODEXA_COMMAND_RAIL.ps1",
].filter(Boolean);

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function shortHash(value) {
  return sha256(value).slice(0, 16);
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readToken() {
  for (const candidate of tokenCandidates) {
    if (!candidate) continue;
    if (!candidate.includes(":") && !candidate.includes("/") && !candidate.includes("\\")) return candidate.trim();
    const text = readText(candidate);
    if (!text) continue;
    const match =
      text.match(/ORANGEBOX_CODEXA_COMMAND_TOKEN\s+"([^"]+)"/) ||
      text.match(/ORANGEBOX_AI_BOX_COMMAND_TOKEN\s+"([^"]+)"/) ||
      text.match(/\$Token\s*=\s*"([^"]+)"/) ||
      text.match(/setx\s+ORANGEBOX_CODEXA_COMMAND_TOKEN\s+"([^"]+)"/i) ||
      text.match(/setx\s+ORANGEBOX_AI_BOX_COMMAND_TOKEN\s+"([^"]+)"/i);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

async function probeHealth(baseUrl, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    const text = await response.text();
    let body = text.slice(0, 1200);
    try { body = JSON.parse(text); } catch {}
    return { ok: response.ok, status: response.status, ms: Date.now() - started, base_url: baseUrl, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, base_url: baseUrl, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function postCommand(baseUrl, token, remoteCommand, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}/command`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-orangebox-token": token },
      body: JSON.stringify({
        confirmFullAccess: true,
        shell: "powershell",
        cwd: "C:/AtomEons/ai-box",
        command: remoteCommand,
        timeoutMs: Math.max(10_000, timeoutMs - 5_000),
      }),
      signal: controller.signal,
    });
    const text = await response.text();
    let body = text;
    try { body = JSON.parse(text); } catch {}
    return { ok: response.ok, status: response.status, ms: Date.now() - started, base_url: baseUrl, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, base_url: baseUrl, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonFromText(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {}
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(value.slice(start, end + 1));
    } catch {}
  }
  return null;
}

function activeLanes(config) {
  const seenModels = new Set();
  return (config?.lanes || [])
    .filter((lane) =>
      lane?.warm_on_pulse === true &&
      ["always_hot", "warm"].includes(String(lane.state || "")),
    )
    .filter((lane) => {
      const model = String(lane.model || "");
      if (seenModels.has(model)) return false;
      seenModels.add(model);
      return true;
    })
    .sort((a, b) => warmRank(a.model) - warmRank(b.model));
}

function warmRank(model) {
  const value = String(model || "").toLowerCase();
  if (value.includes("70b")) return 0;
  if (value.includes("30b")) return 1;
  if (value.includes("24b") || value.includes("32b")) return 2;
  if (value.includes("14b")) return 3;
  if (value.includes("8b")) return 4;
  if (value.includes("4b")) return 5;
  return 9;
}

function validateConfig(config) {
  const failures = [];
  if (config?.version !== "orangebox-active-council/v1") failures.push("version mismatch");
  if (!Array.isArray(config?.lanes) || config.lanes.length < 6) failures.push("not enough lanes");
  const ids = new Set((config?.lanes || []).map((lane) => lane.id));
  for (const required of ["sentinel", "strongarm", "gremlin", "judgement", "forge", "mirror"]) {
    if (!ids.has(required)) failures.push(`missing lane: ${required}`);
  }
  const heavy = (config?.lanes || []).filter((lane) => /70b|heavy|large/i.test(`${lane.id} ${lane.model} ${lane.state}`));
  if (!heavy.every((lane) => lane.state === "warrant_only" && lane.warm_on_pulse === false)) {
    failures.push("heavy lanes must be warrant_only by default");
  }
  return { ok: failures.length === 0, failures };
}

function remotePulseCommand(config, warm) {
  const lanes = activeLanes(config).map((lane) => ({
    id: lane.id,
    role: lane.role,
    model: lane.model,
    keep_alive: lane.keep_alive || "10m",
    state: lane.state,
  }));
  const lanesJson = JSON.stringify(lanes).replace(/'/g, "''");
  const warmFlag = warm ? "$true" : "$false";
  const minFreeGb = Number(config?.warm_policy?.memory_guard_free_gb_min || 22);
  return `$ErrorActionPreference = 'Continue'
$lanes = '${lanesJson}' | ConvertFrom-Json
$warm = ${warmFlag}
$minFreeGb = ${minFreeGb}
function Invoke-Json($Method, $Uri, $Body = $null) {
  try {
    if ($Body -ne $null) {
      return Invoke-RestMethod -UseBasicParsing -TimeoutSec 90 -Method $Method -Uri $Uri -ContentType 'application/json' -Body (($Body | ConvertTo-Json -Depth 12 -Compress))
    }
    return Invoke-RestMethod -UseBasicParsing -TimeoutSec 8 -Method $Method -Uri $Uri
  } catch {
    return [ordered]@{ error = $_.Exception.Message }
  }
}
$tagsResp = Invoke-Json GET 'http://127.0.0.1:11434/api/tags'
$installed = @($tagsResp.models | ForEach-Object { $_.name })
$freeGb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 2)
$psBefore = try { ollama ps 2>$null | Out-String } catch { '' }
$attempts = @()
foreach ($lane in $lanes) {
  $installedOk = $installed -contains $lane.model
  $attempt = [ordered]@{
    lane = $lane.id
    role = $lane.role
    model = $lane.model
    state = $lane.state
    keep_alive = $lane.keep_alive
    installed = $installedOk
    attempted = $false
    ok = $false
    skipped_reason = $null
    response_preview = $null
  }
  if (-not $installedOk) {
    $attempt.skipped_reason = 'model_not_installed'
  } elseif (-not $warm) {
    $attempt.skipped_reason = 'dry_pulse'
    $attempt.ok = $true
  } elseif ($freeGb -lt $minFreeGb) {
    $attempt.skipped_reason = 'memory_guard'
  } else {
    $body = [ordered]@{
      model = $lane.model
      prompt = 'OB0X active council keepalive. Reply OK.'
      stream = $false
      keep_alive = $lane.keep_alive
      options = [ordered]@{ num_predict = 1 }
    }
    $resp = Invoke-Json POST 'http://127.0.0.1:11434/api/generate' $body
    $attempt.attempted = $true
    $attempt.ok = -not [bool]$resp.error
    $attempt.response_preview = if ($resp.error) { $resp.error } else { 'keepalive_ok' }
  }
  $attempts += [pscustomobject]$attempt
}
$psAfter = try { ollama ps 2>$null | Out-String } catch { '' }
$receiptDir = 'C:\\AtomEons\\ai-box\\receipts'
New-Item -ItemType Directory -Force -Path $receiptDir | Out-Null
$result = [ordered]@{
  ok = (($attempts | Where-Object { -not $_.ok }).Count -eq 0)
  status = if (($attempts | Where-Object { -not $_.ok }).Count -eq 0) { 'ACTIVE_COUNCIL_PULSE_GREEN' } else { 'ACTIVE_COUNCIL_PULSE_OPEN_GAPS' }
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  host = $env:COMPUTERNAME
  user = $env:USERNAME
  warm = $warm
  free_memory_gb = $freeGb
  min_free_memory_gb = $minFreeGb
  installed_models = $installed
  lanes = $attempts
  ollama_ps_before = $psBefore.Trim()
  ollama_ps_after = $psAfter.Trim()
  doctrine = 'small lanes hot, specialists armed, heavies warrant-only'
}
$latest = Join-Path $receiptDir 'orangebox-active-council-latest.json'
$result | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $latest -Encoding UTF8
$result.remote_receipt_path = $latest
$result | ConvertTo-Json -Depth 20 -Compress`;
}

async function runPulse(config, warm) {
  const token = readToken();
  const bases = [`http://${directIp}:8097`, `http://${lanIp}:8097`];
  const health = Object.fromEntries(await Promise.all(bases.map(async (base) => [base, await probeHealth(base)])));
  const preferredBase = bases.find((base) => health[base]?.ok) || bases[0];
  if (!token || !health[preferredBase]?.ok) {
    return {
      ok: false,
      attempted: false,
      status: "ACTIVE_COUNCIL_NO_CODEXA_RAIL",
      token_present: Boolean(token),
      command_rail_health: health,
      next_action: "Run npm.cmd run codexa:remote-proof or restore Codexa rail before active model warming.",
    };
  }
  const remote = await postCommand(preferredBase, token, remotePulseCommand(config, warm));
  const stdout = remote.body?.stdout || remote.body?.response?.stdout || "";
  const proof = parseJsonFromText(stdout);
  return {
    ok: remote.ok && remote.body?.status === "VERIFIED" && proof?.ok === true,
    attempted: true,
    status: proof?.status || "ACTIVE_COUNCIL_REMOTE_PARSE_OPEN_GAPS",
    base_url: preferredBase,
    command_status: remote.body?.status || null,
    exit_code: remote.body?.exitCode ?? null,
    duration_ms: remote.ms,
    stdout_hash: shortHash(stdout),
    stderr_tail: String(remote.body?.stderr || "").slice(-600),
    proof,
    command_rail_health: health,
  };
}

function ageMs(iso) {
  const parsed = Date.parse(iso || "");
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
}

async function main() {
  const config = readJson(configPath);
  const validation = validateConfig(config);
  const latestPulsePath = path.join(outRoot, "latest-active-council-pulse.json");
  const latestPulse = readJson(latestPulsePath);
  const heartbeatPath = path.join(outRoot, "watcher-heartbeat.json");
  const heartbeat = readJson(heartbeatPath);
  const modelInventory = readJson(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"));
  const codexaProof = readJson(path.join(dataRoot, "codexa-remote-proof", "latest-codexa-remote-runtime-proof.json"));
  const pulseAge = ageMs(latestPulse?.checked_at);
  const staleAfterMs = Number(config?.stale_after_seconds || 600) * 1000;
  const pulseFresh = pulseAge !== null && pulseAge <= staleAfterMs && latestPulse?.pulse?.ok === true;
  let pulse = null;
  if (wantsPulse) {
    pulse = await runPulse(config, config?.warm_policy?.enabled === true && !dryRun);
  }

  const status = !validation.ok
    ? "ACTIVE_COUNCIL_CONFIG_NOT_GREEN"
    : pulse
      ? (pulse.ok ? "ACTIVE_COUNCIL_PULSE_GREEN" : "ACTIVE_COUNCIL_PULSE_OPEN_GAPS")
      : pulseFresh
        ? "ACTIVE_COUNCIL_GREEN"
        : "ACTIVE_COUNCIL_READY_STALE_OR_NOT_STARTED";

  const result = {
    ok: ["ACTIVE_COUNCIL_PULSE_GREEN", "ACTIVE_COUNCIL_GREEN"].includes(status),
    version: "orangebox-active-council/v1",
    status,
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    config_path: configPath,
    validation,
    active_posture: {
      current: config?.posture || null,
      pulse_interval_seconds: config?.pulse_interval_seconds || null,
      stale_after_seconds: config?.stale_after_seconds || null,
      warm_models: activeLanes(config).map((lane) => lane.model),
      event_armed_models: (config?.lanes || []).filter((lane) => lane.state === "event_armed").map((lane) => lane.model),
      warrant_only_models: (config?.lanes || []).filter((lane) => lane.state === "warrant_only").map((lane) => lane.model),
    },
    runtime_truth: {
      model_inventory_status: modelInventory?.status || null,
      full_local_model_runtime_green: modelInventory?.full_local_model_runtime_green ?? null,
      codexa_remote_runtime_status: codexaProof?.status || null,
      codexa_remote_runtime_green: codexaProof?.codexa_remote_runtime_green ?? null,
      latest_pulse_path: latestPulsePath,
      latest_pulse_age_ms: pulseAge,
      latest_pulse_fresh: pulseFresh,
      watcher_heartbeat_path: heartbeatPath,
      watcher_status: heartbeat?.status || null,
      watcher_age_ms: ageMs(heartbeat?.last_finished),
    },
    pulse,
    law: [
      "Always-hot does not mean every heavy model burns constantly.",
      "Sentinel, STRONGARM, Gremlin, and Judgement stay warm enough for fast council response.",
      "Forge and Mirror wake on real work/proof events.",
      "70B and cloud lanes require warrant.",
      "Every pulse writes local and Codexa-side receipts.",
    ],
  };

  await writeJson(path.join(outRoot, "latest-active-council.json"), result);
  if (pulse) {
    await writeJson(latestPulsePath, result);
  }
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-active-council-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(outRoot, "latest-active-council.json"), result);
    if (pulse) await writeJson(latestPulsePath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : status);
  if (!result.ok && wantsPulse) process.exitCode = 1;
}

await main();
