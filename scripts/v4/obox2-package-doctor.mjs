#!/usr/bin/env node
/*
  obox2-package-doctor.mjs

  Verifies the Orangebox V2 Internal Setup Pack as a release candidate.
  This tests the zip contents without installing models or mutating Codexa.
*/

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const keepTemp = args.has("--keep-temp");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const latestPackPath = path.join(dataRoot, "obox2", "latest-internal-setup-pack.json");
const defaultZip = path.join(userRoot, "Downloads", "Orangebox_V2_Internal_Setup_Pack.zip");

const requiredFiles = [
  "FINAL_BACKEND_PACKAGE.json",
  "Orangebox_Delta_Final_BACKEND_PACKAGE.zip",
  "INSTALL_ORANGEBOX_BACKEND_ON_CODEXA.ps1",
  "MODEL_REGISTRY.json",
  "ROLE_MAP.json",
  "ROUTING_POLICY.json",
  "SOUL_GENOME.json",
  "CODEXA_POWER_OPTIMIZER.ps1",
  "CODEXA_POWER_DOCTOR.ps1",
  "START_HERE_OBOX2_INTERNAL.ps1",
  "INSTALL_CODEXA_OBOX2_MODELS.ps1",
  "CODEXA_MODEL_DOCTOR.ps1",
  "INSTALL_HERMES_AGENT.ps1",
  "HERMES_AGENT_DOCTOR.ps1",
  "START_CODEXA_RAIL.ps1",
  "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd",
  "RUN_INSTALL_ORANGEBOX_BACKEND_ON_CODEXA_AS_ADMIN.cmd",
  "RUN_START_CODEXA_RAIL_AS_ADMIN.cmd",
  "RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd",
  "RUN_CODEXA_POWER_DOCTOR.cmd",
  "RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd",
  "RUN_INSTALL_ALL_LLMS_ON_CODEXA.cmd",
  "RUN_MODEL_DOCTOR_ON_CODEXA.cmd",
  "RUN_INSTALL_HERMES_AGENT_ON_CODEXA.cmd",
  "RUN_HERMES_DOCTOR_ON_CODEXA.cmd",
  "RUN_THIS_FIRST_ON_CODEXA.txt",
  "CODEXA_RUN_ORDER.json",
  "README_OBOX2_INTERNAL_SETUP.md",
  "TRILANE_CONCEPT_SOURCE.txt",
  "SOUL_GENOME_CONCEPT_SOURCE.txt",
];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function psSingle(value) {
  return String(value).replace(/'/g, "''");
}

async function parsePowerShellScripts(extractDir) {
  const ps1 = fs.readdirSync(extractDir)
    .filter((name) => name.toLowerCase().endsWith(".ps1"))
    .map((name) => path.join(extractDir, name));
  if (ps1.length === 0) return { ok: false, scripts: [], errors: ["No PowerShell scripts found."] };

  const command = [
    "$ErrorActionPreference='Stop'",
    `$files = @(${ps1.map((file) => `'${psSingle(file)}'`).join(",")})`,
    "$out = @()",
    "foreach ($f in $files) {",
    "  $tokens = $null",
    "  $errors = $null",
    "  $text = Get-Content -LiteralPath $f -Raw",
    "  [System.Management.Automation.Language.Parser]::ParseInput($text, [ref]$tokens, [ref]$errors) | Out-Null",
    "  $out += [ordered]@{ file = $f; ok = ($errors.Count -eq 0); error_count = $errors.Count; errors = @($errors | ForEach-Object { $_.Message }) }",
    "}",
    "$out | ConvertTo-Json -Depth 8",
  ].join("; ");
  const run = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    windowsHide: true,
    timeout: 120_000,
  });
  const parsed = JSON.parse(run.stdout);
  const scripts = Array.isArray(parsed) ? parsed : [parsed];
  return {
    ok: scripts.every((script) => script.ok === true),
    scripts,
    errors: scripts.flatMap((script) => script.ok ? [] : [`${script.file}: ${(script.errors || []).join("; ")}`]),
  };
}

function validateJsonConfig(extractDir) {
  const modelRegistry = readJson(path.join(extractDir, "MODEL_REGISTRY.json"));
  const roleMap = readJson(path.join(extractDir, "ROLE_MAP.json"));
  const routingPolicy = readJson(path.join(extractDir, "ROUTING_POLICY.json"));
  const soulGenome = readJson(path.join(extractDir, "SOUL_GENOME.json"));
  const backendPackage = readJson(path.join(extractDir, "FINAL_BACKEND_PACKAGE.json"));
  const runOrder = readJson(path.join(extractDir, "CODEXA_RUN_ORDER.json"));
  const backendPayload = path.join(extractDir, "Orangebox_Delta_Final_BACKEND_PACKAGE.zip");
  const backendHash = fs.existsSync(backendPayload) ? sha256File(backendPayload) : null;
  const localModels = modelRegistry?.local_models || [];
  const modelIds = new Set(localModels.map((model) => model.id));
  const roleDefaults = Object.values(roleMap?.roles || {}).map((role) => role.default_model).filter(Boolean);
  const missingDefaults = roleDefaults.filter((id) => !modelIds.has(id));
  const wildcardLaw = routingPolicy?.wildcard_law || [];
  return {
    ok:
      modelRegistry?.version === "orangebox-model-registry/v2" &&
      roleMap?.version === "orangebox-role-map/v2" &&
      routingPolicy?.version === "orangebox-routing-policy/v2" &&
      soulGenome?.status === "INTERNAL_KNOWLEDGE_ENGINE_SPEC" &&
      backendPackage?.version === "orangebox-final-backend-payload/v1" &&
      backendPackage?.archive_verified === true &&
      backendPackage?.frontend_included === false &&
      backendPackage?.frontend_required_for_backend === false &&
      backendPackage?.sha256 === backendHash &&
      runOrder?.version === "orangebox-codexa-run-order/v1" &&
      runOrder?.first_click === "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd" &&
      runOrder?.backend_payload?.sha256 === backendHash &&
      runOrder?.backend_payload?.frontend_required_for_backend === false &&
      (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run codexa:access") &&
      (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run codexa:alert:popup") &&
      (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run codexa:watch") &&
      (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run ops:green") &&
      localModels.length >= 10 &&
      missingDefaults.length === 0 &&
      wildcardLaw.some((line) => /Wildcard models may not be final/i.test(line)),
    model_count: localModels.length,
    model_ids: [...modelIds],
    missing_role_default_models: missingDefaults,
    soul_status: soulGenome?.status || null,
    backend_payload: {
      ok: backendPackage?.sha256 === backendHash,
      name: "Orangebox_Delta_Final_BACKEND_PACKAGE.zip",
      bytes: fs.existsSync(backendPayload) ? fs.statSync(backendPayload).size : 0,
      sha256: backendHash,
      expected_sha256: backendPackage?.sha256 || null,
      source_commit: backendPackage?.source_commit || null,
      frontend_included: backendPackage?.frontend_included ?? null,
      frontend_required_for_backend: backendPackage?.frontend_required_for_backend ?? null,
    },
    run_order: {
      ok: runOrder?.first_click === "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd",
      version: runOrder?.version || null,
      first_click: runOrder?.first_click || null,
      steps: Array.isArray(runOrder?.run_order) ? runOrder.run_order.length : 0,
      cockpit_verify_commands: Array.isArray(runOrder?.cockpit_verify_commands) ? runOrder.cockpit_verify_commands.length : 0,
      has_codexa_access: (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run codexa:access"),
      has_codexa_alert_popup: (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run codexa:alert:popup"),
      has_codexa_watch: (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run codexa:watch"),
      has_ops_green: (runOrder?.cockpit_verify_commands || []).includes("npm.cmd run ops:green"),
    },
    wildcard_law_count: wildcardLaw.length,
  };
}

function validateCmdLaunchers(extractDir) {
  const cmdFiles = fs.readdirSync(extractDir).filter((name) => name.toLowerCase().endsWith(".cmd"));
  const checks = cmdFiles.map((name) => {
    const text = fs.readFileSync(path.join(extractDir, name), "utf8");
    const matches = [...text.matchAll(/%~dp0([^"\r\n]+\.ps1)/gi)].map((match) => match[1]);
    const missing = matches.filter((ps1) => !fs.existsSync(path.join(extractDir, ps1)));
    return { name, referenced_ps1: matches, missing, ok: missing.length === 0 && matches.length > 0 };
  });
  return {
    ok: checks.length > 0 && checks.every((check) => check.ok),
    checks,
  };
}

function scanForbiddenText(extractDir) {
  const findings = [];
  const textLike = new Set([".cmd", ".json", ".md", ".ps1", ".txt"]);
  for (const name of fs.readdirSync(extractDir)) {
    const file = path.join(extractDir, name);
    if (!fs.statSync(file).isFile()) continue;
    if (!textLike.has(path.extname(name).toLowerCase())) continue;
    const text = fs.readFileSync(file, "utf8");
    if (/openclaw|open claw/i.test(name) || /openclaw|open claw/i.test(text)) {
      findings.push({ file: name, issue: "OpenClaw text found in OBOX2 setup pack." });
    }
  }
  return { ok: findings.length === 0, findings };
}

function requirePattern(checks, file, id, pattern, description) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const ok = pattern.test(text);
  checks.push({
    id,
    file: path.basename(file),
    ok,
    description,
  });
}

function validateOperationalContracts(extractDir) {
  const checks = [];
  const file = (name) => path.join(extractDir, name);

  const powerOptimizer = file("CODEXA_POWER_OPTIMIZER.ps1");
  requirePattern(checks, powerOptimizer, "power_disables_ac_sleep", /standby-timeout-ac['"]?\s*,\s*['"]0/i, "Power optimizer disables AC sleep.");
  requirePattern(checks, powerOptimizer, "power_disables_ac_hibernate", /hibernate-timeout-ac['"]?\s*,\s*['"]0/i, "Power optimizer disables AC hibernate timeout.");
  requirePattern(checks, powerOptimizer, "power_disables_ac_disk_idle", /disk-timeout-ac['"]?\s*,\s*['"]0/i, "Power optimizer disables AC disk idle timeout.");
  requirePattern(checks, powerOptimizer, "power_disables_hybrid_sleep", /HYBRIDSLEEP['"]?\s*,\s*['"]0/i, "Power optimizer disables hybrid sleep.");
  requirePattern(checks, powerOptimizer, "power_enables_wake_timers", /RTCWAKE['"]?\s*,\s*['"]1/i, "Power optimizer enables wake timers on AC.");
  requirePattern(checks, powerOptimizer, "power_can_enable_rdp", /Enable-NetFirewallRule\s+-DisplayGroup\s+['"]Remote Desktop['"][\s\S]*fDenyTSConnections/i, "Power optimizer can enable RDP firewall and terminal-server access when requested.");
  requirePattern(checks, powerOptimizer, "power_receipt_written", /obox2-power-optimizer-latest\.json/i, "Power optimizer writes a stable receipt.");

  const powerDoctor = file("CODEXA_POWER_DOCTOR.ps1");
  requirePattern(checks, powerDoctor, "power_doctor_checks_sleep", /STANDBYIDLE[\s\S]*HIBERNATEIDLE[\s\S]*DISKIDLE/i, "Power doctor inspects AC sleep, hibernate, and disk idle settings.");
  requirePattern(checks, powerDoctor, "power_doctor_green_status", /OBOX2_CODEXA_POWER_DOCTOR_GREEN/i, "Power doctor has a green status contract.");
  requirePattern(checks, powerDoctor, "power_doctor_warns_rail_task", /Command rail scheduled task is not registered yet/i, "Power doctor warns when the command rail scheduled task is missing.");

  const railStarter = file("START_CODEXA_RAIL.ps1");
  requirePattern(checks, railStarter, "rail_uses_command_port_8097", /CommandPort\s*=\s*8097/i, "Rail starter defaults the command rail to port 8097.");
  requirePattern(checks, railStarter, "rail_uses_bridge_port_8098", /BridgePort\s*=\s*8098/i, "Rail starter defaults the bridge rail to port 8098.");
  requirePattern(checks, railStarter, "rail_registers_startup_logon_tasks", /New-ScheduledTaskTrigger\s+-AtStartup[\s\S]*New-ScheduledTaskTrigger\s+-AtLogOn/i, "Rail starter registers startup and logon recovery triggers.");
  requirePattern(checks, railStarter, "rail_runs_as_system_highest", /New-ScheduledTaskPrincipal[\s\S]*SYSTEM[\s\S]*RunLevel\s+Highest/i, "Rail starter registers always-on tasks as SYSTEM at highest run level.");
  requirePattern(checks, railStarter, "rail_has_restart_policy", /RestartCount\s+3[\s\S]*RestartInterval\s+\(New-TimeSpan\s+-Minutes\s+1\)/i, "Rail starter sets restart policy for recovery.");
  requirePattern(checks, railStarter, "rail_firewall_trusted_ips", /New-NetFirewallRule[\s\S]*RemoteAddress\s+\$trusted/i, "Rail starter restricts inbound firewall rules to trusted controller IPs.");
  requirePattern(checks, railStarter, "rail_exports_controller_tokens", /SET_CONTROLLER_ORANGEBOX_TOKENS\.cmd[\s\S]*ORANGEBOX_AI_BOX_COMMAND_TOKEN/i, "Rail starter writes controller token export instructions.");
  requirePattern(checks, railStarter, "rail_local_health_probe", /Probe\s+["']http:\/\/127\.0\.0\.1:\$CommandPort\/health["']/i, "Rail starter probes local command rail health before claiming ready.");

  const startHere = file("START_HERE_OBOX2_INTERNAL.ps1");
  requirePattern(checks, startHere, "start_here_requires_admin", /OBOX2_START_HERE_NEEDS_ADMIN/i, "Start-here launcher refuses non-admin installs.");
  requirePattern(checks, startHere, "start_here_calls_power_optimizer", /CODEXA_POWER_OPTIMIZER\.ps1/i, "Start-here launcher runs the power optimizer.");
  requirePattern(checks, startHere, "start_here_calls_power_doctor", /CODEXA_POWER_DOCTOR\.ps1/i, "Start-here launcher runs the power doctor.");
  requirePattern(checks, startHere, "start_here_calls_backend_installer", /INSTALL_ORANGEBOX_BACKEND_ON_CODEXA\.ps1/i, "Start-here launcher installs/verifies the backend payload.");
  requirePattern(checks, startHere, "start_here_calls_rail_starter", /START_CODEXA_RAIL\.ps1/i, "Start-here launcher starts the rail.");
  requirePattern(checks, startHere, "start_here_calls_model_doctor", /CODEXA_MODEL_DOCTOR\.ps1/i, "Start-here launcher runs model doctor.");
  requirePattern(checks, startHere, "start_here_hermes_optional", /HERMES_AGENT_DOCTOR\.ps1' @\(\) \$false/i, "Start-here launcher treats Hermes doctor as optional.");
  requirePattern(checks, startHere, "start_here_receipt_written", /obox2-start-here-latest\.json/i, "Start-here launcher writes a stable receipt.");
  requirePattern(checks, startHere, "start_here_next_action_codexa_access", /npm\.cmd run codexa:access/i, "Start-here launcher tells cockpit to prove Codexa access surfaces.");
  requirePattern(checks, startHere, "start_here_next_action_codexa_watch", /npm\.cmd run codexa:watch/i, "Start-here launcher tells cockpit to run Codexa bring-up watch.");

  const modelInstaller = file("INSTALL_CODEXA_OBOX2_MODELS.ps1");
  requirePattern(checks, modelInstaller, "model_installer_tiered", /ValidateSet\('core','extended','heavy','wildcard','all'\)/i, "Model installer supports tiered installs.");
  requirePattern(checks, modelInstaller, "model_installer_ollama_pull", /ollama\s+pull\s+\$id/i, "Model installer pulls models through Ollama.");
  requirePattern(checks, modelInstaller, "model_installer_missing_required", /missingRequired/i, "Model installer separates required model misses from optional wildcard misses.");
  requirePattern(checks, modelInstaller, "model_installer_wildcard_note", /Abliterated\/custom wildcard tags may require manual import/i, "Model installer documents optional wildcard/manual import reality.");

  const modelDoctor = file("CODEXA_MODEL_DOCTOR.ps1");
  requirePattern(checks, modelDoctor, "model_doctor_ollama_tags", /127\.0\.0\.1:11434\/api\/tags/i, "Model doctor probes local Ollama tags.");
  requirePattern(checks, modelDoctor, "model_doctor_missing_core", /missingCore/i, "Model doctor reports missing core models.");
  requirePattern(checks, modelDoctor, "model_doctor_green_status", /OBOX2_CODEXA_MODEL_DOCTOR_GREEN/i, "Model doctor has a green status contract.");

  const backendInstaller = file("INSTALL_ORANGEBOX_BACKEND_ON_CODEXA.ps1");
  requirePattern(checks, backendInstaller, "backend_installer_payload_zip", /Orangebox_Delta_Final_BACKEND_PACKAGE\.zip/i, "Backend installer uses the embedded final backend payload.");
  requirePattern(checks, backendInstaller, "backend_installer_metadata", /FINAL_BACKEND_PACKAGE\.json/i, "Backend installer verifies payload metadata.");
  requirePattern(checks, backendInstaller, "backend_installer_hash_check", /Get-FileHash[\s\S]*SHA256[\s\S]*hashOk/i, "Backend installer checks SHA-256 before install.");
  requirePattern(checks, backendInstaller, "backend_installer_approved_path", /C:\\AtomEons\\orangebox\\finals\\Orangebox Delta Final/i, "Backend installer restricts target to the approved final path.");
  requirePattern(checks, backendInstaller, "backend_installer_frontend_not_required", /frontend_required_for_backend/i, "Backend installer refuses payloads that require frontend for backend.");
  requirePattern(checks, backendInstaller, "backend_installer_preserves_previous", /previous-\s*'\s*\+\s*\$stamp|previous-' \+ \$stamp|backup_path/i, "Backend installer preserves previous install as a sibling backup.");
  requirePattern(checks, backendInstaller, "backend_installer_package_doctor", /package-script-doctor/i, "Backend installer runs package-script-doctor when npm proof is enabled.");
  requirePattern(checks, backendInstaller, "backend_installer_backend_proof", /backend:proof/i, "Backend installer runs backend proof when npm proof is enabled.");
  requirePattern(checks, backendInstaller, "backend_installer_receipt", /obox2-backend-install-latest\.json/i, "Backend installer writes a stable receipt.");

  const hermesInstall = file("INSTALL_HERMES_AGENT.ps1");
  requirePattern(checks, hermesInstall, "hermes_install_checks_node", /node\s+--version[\s\S]*major/i, "Hermes installer checks Node before install.");
  requirePattern(checks, hermesInstall, "hermes_install_optional_skip", /SkipInstall/i, "Hermes installer supports no-install doctor behavior.");
  requirePattern(checks, hermesInstall, "hermes_install_orangebox_control_plane_note", /Orangebox remains the control plane/i, "Hermes installer preserves Orangebox authority.");

  const readme = file("README_OBOX2_INTERNAL_SETUP.md");
  requirePattern(checks, readme, "readme_names_start_here", /RUN_START_HERE_ON_CODEXA_AS_ADMIN\.cmd/i, "README points operator to the start-here launcher.");
  requirePattern(checks, readme, "readme_names_run_this_first", /RUN_THIS_FIRST_ON_CODEXA\.txt/i, "README points operator to the no-memory first-run note.");
  requirePattern(checks, readme, "readme_names_backend_installer", /RUN_INSTALL_ORANGEBOX_BACKEND_ON_CODEXA_AS_ADMIN\.cmd/i, "README names the backend payload installer.");
  requirePattern(checks, readme, "readme_backend_payload_law", /Backend payload law/i, "README explains the backend payload law.");
  requirePattern(checks, readme, "readme_warns_battery_laptop", /Do not apply it to a battery laptop/i, "README warns not to apply always-on behavior to battery laptops.");
  requirePattern(checks, readme, "readme_wildcard_law", /Dolphin and abliterated models are pressure lanes only/i, "README preserves wildcard model authority limits.");

  const runThisFirst = file("RUN_THIS_FIRST_ON_CODEXA.txt");
  requirePattern(checks, runThisFirst, "run_this_first_names_start_here", /RUN_START_HERE_ON_CODEXA_AS_ADMIN\.cmd/i, "Top-level text note names the first-click launcher.");
  requirePattern(checks, runThisFirst, "run_this_first_warns_markdown_not_runnable", /DO NOT RUN THE MARKDOWN FILE/i, "Top-level text note warns the handoff markdown is not runnable.");
  requirePattern(checks, runThisFirst, "run_this_first_receipts_truth", /Codexa is green only after cockpit probes and Codexa receipts prove it/i, "Top-level text note preserves receipt/probe truth.");

  const runOrder = file("CODEXA_RUN_ORDER.json");
  requirePattern(checks, runOrder, "run_order_json_first_click", /"first_click"\s*:\s*"RUN_START_HERE_ON_CODEXA_AS_ADMIN\.cmd"/i, "Run-order JSON names the first-click launcher.");
  requirePattern(checks, runOrder, "run_order_json_cockpit_verify", /npm\.cmd run ops:green/i, "Run-order JSON includes cockpit verification commands.");
  requirePattern(checks, runOrder, "run_order_json_codexa_access", /npm\.cmd run codexa:access/i, "Run-order JSON includes focused Codexa access verification.");
  requirePattern(checks, runOrder, "run_order_json_codexa_watch", /npm\.cmd run codexa:watch/i, "Run-order JSON includes bounded Codexa bring-up watch verification.");
  requirePattern(checks, runOrder, "run_order_json_false_green_guard", /false_green_guard/i, "Run-order JSON preserves false-green guard.");

  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    checks,
    failures,
  };
}

async function main() {
  const latestPack = readJson(latestPackPath);
  const zipPath = latestPack?.zip_path || defaultZip;
  const tempRoot = path.join(dataRoot, "package-tests", `obox2-package-doctor-${stamp()}`);
  const extractDir = path.join(tempRoot, "expanded");
  await fsp.rm(tempRoot, { recursive: true, force: true });
  await fsp.mkdir(extractDir, { recursive: true });

  const failures = [];
  const zipExists = fs.existsSync(zipPath);
  if (!zipExists) failures.push(`Zip missing: ${zipPath}`);

  if (zipExists) {
    await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath '${psSingle(zipPath)}' -DestinationPath '${psSingle(extractDir)}' -Force`,
    ], { windowsHide: true, timeout: 120_000 });
  }

  const present = zipExists ? fs.readdirSync(extractDir).filter((name) => fs.statSync(path.join(extractDir, name)).isFile()).sort() : [];
  const missingFiles = requiredFiles.filter((name) => !fs.existsSync(path.join(extractDir, name)));
  if (missingFiles.length > 0) failures.push(`Missing files: ${missingFiles.join(", ")}`);

  const jsonConfig = missingFiles.length === 0 ? validateJsonConfig(extractDir) : { ok: false };
  if (!jsonConfig.ok) failures.push("JSON config validation failed.");

  const cmdLaunchers = missingFiles.length === 0 ? validateCmdLaunchers(extractDir) : { ok: false, checks: [] };
  if (!cmdLaunchers.ok) failures.push("CMD launcher validation failed.");

  const psParse = missingFiles.length === 0 ? await parsePowerShellScripts(extractDir) : { ok: false, scripts: [], errors: [] };
  if (!psParse.ok) failures.push(`PowerShell parse failed: ${psParse.errors.join(" | ")}`);

  const forbidden = zipExists ? scanForbiddenText(extractDir) : { ok: false, findings: [] };
  if (!forbidden.ok) failures.push("Forbidden OpenClaw reference found in OBOX2 setup pack.");

  const operationalContracts = missingFiles.length === 0 ? validateOperationalContracts(extractDir) : { ok: false, checks: [], failures: [] };
  if (!operationalContracts.ok) failures.push("Operational contract validation failed.");

  const fileManifest = present.map((name) => {
    const file = path.join(extractDir, name);
    return { name, bytes: fs.statSync(file).size, sha256: sha256File(file) };
  });

  const result = {
    ok: failures.length === 0,
    version: "orangebox-obox2-package-doctor/v1",
    status: failures.length === 0 ? "OBOX2_PACKAGE_VERIFIED_GREEN" : "OBOX2_PACKAGE_VERIFIED_NOT_GREEN",
    checked_at: new Date().toISOString(),
    zip_path: zipPath,
    zip_exists: zipExists,
    zip_bytes: zipExists ? fs.statSync(zipPath).size : 0,
    extract_dir: keepTemp ? extractDir : null,
    required_files: requiredFiles,
    present_files: present,
    missing_files: missingFiles,
    file_manifest: fileManifest,
    json_config: jsonConfig,
    cmd_launchers: cmdLaunchers,
    powershell_parse: psParse,
    forbidden_text_scan: forbidden,
    operational_contracts: operationalContracts,
    failures,
    note: "This validates the package shape. It does not install Ollama models, Hermes, or Codexa services.",
  };

  await writeJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-obox2-package-doctor-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"), result);
  }
  if (!keepTemp) await fsp.rm(tempRoot, { recursive: true, force: true });

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
