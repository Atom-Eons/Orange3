#!/usr/bin/env node
/*
  codexa-remote-runtime-proof.mjs

  Read-only Cockpit -> Codexa proof. Direct Ollama exposure is not required:
  Codexa keeps Ollama loopback-local by design, so this asks the already
  running token-gated command rail to prove local runtime state from inside
  Codexa and writes a Cockpit-side receipt.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "codexa-remote-proof");
const directIp = process.env.ORANGEBOX_CODEXA_DIRECT_IP || process.env.ORANGEBOX_AI_BOX_DIRECT_IP || "10.0.99.1";
const lanIp = process.env.ORANGEBOX_CODEXA_IP || process.env.ORANGEBOX_AI_BOX_IP || "10.0.0.4";

const expectedModels = [
  "qwen3:4b",
  "qwen3:14b",
  "mistral-small:24b",
  "deepseek-r1:32b",
  "dolphin3:8b",
  "llama3.1:8b-abliterated",
  "qwen3:30b-a3b",
  "qwen2.5-coder:32b",
  "command-r:35b",
  "llama3.3:70b",
  "deepseek-r1:70b",
];

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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function shortHash(value) {
  return sha256(value).slice(0, 16);
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
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

async function postCommand(baseUrl, token, command, timeoutMs = 45000) {
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
        command,
        timeoutMs: Math.max(5_000, timeoutMs - 5_000),
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

function remoteProofCommand() {
  const expectedJson = JSON.stringify(expectedModels);
  return `$ErrorActionPreference = 'Continue'
$expected = '${expectedJson}' | ConvertFrom-Json
function Read-JsonSafe([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    return [ordered]@{ exists = $false; path = $Path; status = $null }
  }
  try {
    $raw = Get-Content -Raw -LiteralPath $Path
    $json = $raw | ConvertFrom-Json
    $status = $json.status
    if (-not $status -and $json.summary) { $status = $json.summary.status }
    return [ordered]@{ exists = $true; path = $Path; status = $status; ok = $json.ok; checked_at = $json.checked_at; created_at = $json.created_at; raw_status = $status }
  } catch {
    return [ordered]@{ exists = $true; path = $Path; status = 'JSON_READ_FAILED'; error = $_.Exception.Message }
  }
}
$ollamaOk = $false
$ollamaError = $null
$tags = @()
try {
  $resp = Invoke-RestMethod -UseBasicParsing -TimeoutSec 8 -Uri 'http://127.0.0.1:11434/api/tags'
  $ollamaOk = $true
  $tags = @($resp.models | ForEach-Object { $_.name })
} catch {
  $ollamaError = $_.Exception.Message
}
$missing = @($expected | Where-Object { $tags -notcontains $_ })
$extraExpectedAliases = @($tags | Where-Object { $expected -notcontains $_ })
$receipts = [ordered]@{
  post_reboot = Read-JsonSafe 'C:\\AtomEons\\ai-box\\receipts\\orangebox-post-reboot-verification-latest.json'
  boot_system = Read-JsonSafe 'C:\\AtomEons\\ai-box\\receipts\\orangebox-boot-system-latest.json'
  all_models = Read-JsonSafe 'C:\\AtomEons\\ai-box\\receipts\\obox2-all-models-verification-latest.json'
  hermes = Read-JsonSafe 'C:\\AtomEons\\ai-box\\receipts\\obox2-hermes-status-latest.json'
  power = Read-JsonSafe 'C:\\AtomEons\\ai-box\\receipts\\obox2-power-doctor-latest.json'
  comms = Read-JsonSafe 'C:\\AtomEons\\ai-box\\receipts\\orangebox-comms-latest.json'
}
$rails = [ordered]@{}
foreach ($pair in @(
  @('command_8097','http://127.0.0.1:8097/health'),
  @('bridge_8098','http://127.0.0.1:8098/health'),
  @('knowledge_8099','http://127.0.0.1:8099/')
)) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 4 -Uri $pair[1]
    $rails[$pair[0]] = [ordered]@{ ok = $true; status = [int]$r.StatusCode }
  } catch {
    $rails[$pair[0]] = [ordered]@{ ok = $false; status = 0; error = $_.Exception.Message }
  }
}
$hermes = [ordered]@{ ok = $false; version = $null; source = $null; error = $null }
foreach ($cmd in @('hermes', 'C:\\Users\\Atom\\AppData\\Local\\hermes\\hermes-agent\\venv\\Scripts\\hermes.exe')) {
  try {
    $out = & $cmd --version 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -or $out.Trim().Length -gt 0) {
      $hermes.ok = $true
      $hermes.version = $out.Trim()
      $hermes.source = $cmd
      break
    }
  } catch {
    $hermes.error = $_.Exception.Message
  }
}
$docker = [ordered]@{ ok = $false; containers = @(); error = $null }
try {
  $docker.containers = @(docker ps --format '{{.Names}}|{{.Status}}' 2>$null)
  $docker.ok = $docker.containers.Count -gt 0
} catch {
  $docker.error = $_.Exception.Message
}
$result = [ordered]@{
  ok = $true
  checked_at = (Get-Date).ToUniversalTime().ToString('o')
  host = $env:COMPUTERNAME
  user = $env:USERNAME
  ollama = [ordered]@{
    ok = $ollamaOk
    loopback_url = 'http://127.0.0.1:11434/api/tags'
    error = $ollamaError
    expected_count = $expected.Count
    installed_expected_count = ($expected.Count - $missing.Count)
    missing = $missing
    expected = $expected
    tags = $tags
    extra_tags = $extraExpectedAliases
  }
  rails = $rails
  receipts = $receipts
  hermes = $hermes
  docker = $docker
  post_reboot_green = $receipts.post_reboot.status -eq 'ORANGEBOX_POST_REBOOT_ALL_GREEN'
  boot_green = $receipts.boot_system.status -eq 'ORANGEBOX_BOOT_SYSTEM_GREEN'
  models_green = $receipts.all_models.status -eq 'OBOX2_ALL_MODELS_INSTALLED_EXACT' -and $missing.Count -eq 0
  hermes_green = $receipts.hermes.status -eq 'OBOX2_HERMES_STATUS_GREEN' -or $hermes.ok
}
$result | ConvertTo-Json -Depth 20 -Compress`;
}

function classify(remote) {
  if (!remote?.ok) return "CODEXA_REMOTE_PROOF_NOT_AVAILABLE";
  const proof = remote.proof || {};
  const rails = proof.rails || {};
  const railGreen = Boolean(rails.command_8097?.ok && rails.bridge_8098?.ok && rails.knowledge_8099?.ok);
  const runtimeGreen =
    proof.ollama?.ok === true &&
    proof.ollama?.missing?.length === 0 &&
    proof.post_reboot_green === true &&
    proof.boot_green === true &&
    proof.models_green === true &&
    proof.hermes_green === true &&
    railGreen;
  if (runtimeGreen) return "CODEXA_REMOTE_RUNTIME_GREEN";
  if (proof.ollama?.ok === true && proof.ollama?.missing?.length === 0) return "CODEXA_REMOTE_MODELS_GREEN_WITH_OPEN_GAPS";
  if (proof.ollama?.ok === true) return "CODEXA_REMOTE_OLLAMA_GREEN_WITH_MODEL_GAPS";
  return "CODEXA_REMOTE_RUNTIME_OPEN_GAPS";
}

async function main() {
  const startedAt = new Date();
  const token = readToken();
  const bases = [`http://${directIp}:8097`, `http://${lanIp}:8097`];
  const health = Object.fromEntries(await Promise.all(bases.map(async (base) => [base, await probeHealth(base)])));
  const preferredBase = bases.find((base) => health[base]?.ok) || bases[0];

  let remote = { ok: false, attempted: false, reason: token ? "command rail not reachable" : "missing command rail token" };
  if (token && health[preferredBase]?.ok) {
    const commandResult = await postCommand(preferredBase, token, remoteProofCommand(), 55_000);
    const stdout = commandResult.body?.stdout || commandResult.body?.response?.stdout || "";
    const proof = parseJsonFromText(stdout);
    remote = {
      ok: commandResult.ok && commandResult.body?.status === "VERIFIED" && Boolean(proof),
      attempted: true,
      base_url: preferredBase,
      command_status: commandResult.body?.status || null,
      exit_code: commandResult.body?.exitCode ?? null,
      ms: commandResult.ms,
      proof,
      stdout_hash: shortHash(stdout),
      stderr_tail: String(commandResult.body?.stderr || "").slice(-600),
      error: commandResult.ok ? null : commandResult.error || commandResult.body?.error || null,
    };
  }

  const status = classify(remote);
  const proof = remote.proof || {};
  const result = {
    ok: status === "CODEXA_REMOTE_RUNTIME_GREEN",
    codexa_remote_runtime_green: status === "CODEXA_REMOTE_RUNTIME_GREEN",
    version: "orangebox-codexa-remote-runtime-proof/v1",
    status,
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    hosts: { direct_ip: directIp, lan_ip: lanIp },
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      install_attempted: false,
      remote_codexa_mutation_attempted: false,
      remote_read_only_command_attempted: remote.attempted,
      remote_login_attempted: false,
      paid_api_attempted: false,
      production_deploy_attempted: false,
    },
    token: {
      present: Boolean(token),
      hash: token ? shortHash(token) : null,
      value: "redacted",
    },
    command_rail_health: health,
    remote,
    summary: {
      host: proof.host || null,
      ollama_loopback_ok: proof.ollama?.ok ?? null,
      expected_models_installed: proof.ollama?.installed_expected_count ?? null,
      expected_models_total: proof.ollama?.expected_count ?? expectedModels.length,
      missing_models: proof.ollama?.missing || expectedModels,
      post_reboot_green: proof.post_reboot_green ?? null,
      boot_green: proof.boot_green ?? null,
      models_green: proof.models_green ?? null,
      hermes_green: proof.hermes_green ?? null,
      docker_containers: proof.docker?.containers?.length ?? null,
    },
    interpretation: status === "CODEXA_REMOTE_RUNTIME_GREEN"
      ? "Codexa is green through the correct proof path: command rail -> Codexa loopback Ollama/models/receipts."
      : "Codexa remote runtime proof has open gaps; do not promote two-machine green from direct port guesses.",
    next_actions: status === "CODEXA_REMOTE_RUNTIME_GREEN"
      ? [
          "Use codexa:remote-proof, codexa:access, codexa:watch, model:inventory, trilane:doctor, and ops:green as the current proof chain.",
        ]
      : [
          token ? "Command rail token exists; inspect remote proof gaps and Codexa receipts before routing heavy work." : "Set ORANGEBOX_CODEXA_COMMAND_TOKEN or restore the controller token file, then rerun npm.cmd run codexa:remote-proof.",
          "If command rail health is down, restart the Codexa command rail from the OBOX2 setup pack.",
        ],
  };

  const latestPath = path.join(outRoot, "latest-codexa-remote-runtime-proof.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-codexa-remote-runtime-proof-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : status);
}

await main();
