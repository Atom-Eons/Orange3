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
  "MODEL_REGISTRY.json",
  "ROLE_MAP.json",
  "ROUTING_POLICY.json",
  "SOUL_GENOME.json",
  "CODEXA_POWER_OPTIMIZER.ps1",
  "CODEXA_POWER_DOCTOR.ps1",
  "INSTALL_CODEXA_OBOX2_MODELS.ps1",
  "CODEXA_MODEL_DOCTOR.ps1",
  "INSTALL_HERMES_AGENT.ps1",
  "HERMES_AGENT_DOCTOR.ps1",
  "START_CODEXA_RAIL.ps1",
  "RUN_START_CODEXA_RAIL_AS_ADMIN.cmd",
  "RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd",
  "RUN_CODEXA_POWER_DOCTOR.cmd",
  "RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd",
  "RUN_INSTALL_ALL_LLMS_ON_CODEXA.cmd",
  "RUN_MODEL_DOCTOR_ON_CODEXA.cmd",
  "RUN_INSTALL_HERMES_AGENT_ON_CODEXA.cmd",
  "RUN_HERMES_DOCTOR_ON_CODEXA.cmd",
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
      localModels.length >= 10 &&
      missingDefaults.length === 0 &&
      wildcardLaw.some((line) => /Wildcard models may not be final/i.test(line)),
    model_count: localModels.length,
    model_ids: [...modelIds],
    missing_role_default_models: missingDefaults,
    soul_status: soulGenome?.status || null,
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
  for (const name of fs.readdirSync(extractDir)) {
    const file = path.join(extractDir, name);
    if (!fs.statSync(file).isFile()) continue;
    const text = fs.readFileSync(file, "utf8");
    if (/openclaw|open claw/i.test(name) || /openclaw|open claw/i.test(text)) {
      findings.push({ file: name, issue: "OpenClaw text found in OBOX2 setup pack." });
    }
  }
  return { ok: findings.length === 0, findings };
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
