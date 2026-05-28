#!/usr/bin/env node
/* hermes-doctor.mjs - Hermes readiness proof gate.
 *
 * This doctor does not install Hermes and does not mutate Codexa. It proves the
 * ORANGEBOX-side Hermes rail is ready: status probing degrades honestly, pack
 * building creates real artifacts, receipts stay under ORANGEBOX, and CLI/API
 * surfaces are wired.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const HERMES_DOCTOR_VERSION = "orangebox-hermes-readiness-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..", "..");

const REQUIRED_PACK_FILES = [
  "INSTALL_HERMES.ps1",
  "INSTALL_HERMES.sh",
  "hermes-status.mjs",
  "hermes-migrate-from-openclaw.mjs",
  "AGENTS.md",
  "README.md",
];

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function tempRoot() {
  return path.join(os.tmpdir(), `obx-hermes-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
}

function compactText(value, max = 2400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

async function gate(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const evidence = await fn();
    const ok = evidence?.ok !== false;
    return {
      name,
      required,
      ok,
      status: ok ? "pass" : (required ? "fail" : "warning"),
      duration_ms: Date.now() - started,
      evidence,
    };
  } catch (err) {
    return {
      name,
      required,
      ok: false,
      status: required ? "fail" : "warning",
      duration_ms: Date.now() - started,
      error: err?.message || String(err),
      stack: err?.stack ? compactText(err.stack, 1600) : null,
    };
  }
}

function runNode(scriptPath, args = [], { cwd = ROOT, env = {}, timeoutMs = 120000 } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        code: 1,
        ok: false,
        timed_out: timedOut,
        error: err.message,
        stdout,
        stderr,
        duration_ms: Date.now() - started,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        code,
        ok: code === 0,
        timed_out: timedOut,
        stdout,
        stderr,
        duration_ms: Date.now() - started,
      });
    });
  });
}

async function fileExists(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function listHermesPackReceipts() {
  const dir = path.join(ROOT, "receipts");
  try {
    return (await fs.readdir(dir))
      .filter((name) => /^hermes-pack-.*\.json$/i.test(name))
      .map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

async function rootAndSourceProbe() {
  const packagePath = path.join(ROOT, "package.json");
  const packPath = path.join(HERE, "hermes-pack.mjs");
  const packSource = await fs.readFile(packPath, "utf8");
  const rootName = path.basename(ROOT).toLowerCase();
  const rootNameOk = rootName === "orangebox" || rootName.startsWith("orangebox-v");
  const missing = [];
  for (const file of REQUIRED_PACK_FILES) {
    if (!(await fileExists(path.join(HERE, file)))) missing.push(file);
  }
  const hasPackage = await fileExists(packagePath);
  const badFiveUpRootInference = packSource.includes('"..", "..", "..", "..", ".."')
    || packSource.includes("'..', '..', '..', '..', '..'");
  return {
    ok: hasPackage && missing.length === 0 && !badFiveUpRootInference && rootNameOk,
    root: ROOT,
    root_name: rootName,
    root_name_ok: rootNameOk,
    package_path: packagePath,
    has_package: hasPackage,
    required_files: REQUIRED_PACK_FILES,
    missing,
    bad_five_up_root_inference: badFiveUpRootInference,
  };
}

async function statusProbe(dataRoot) {
  const statusPath = path.join(HERE, "hermes-status.mjs");
  const run = await runNode(statusPath, ["--json"], {
    env: { ORANGEBOX_DATA_ROOT: dataRoot },
    timeoutMs: 20000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout.trim());
  } catch {}
  const validStatus = ["VERIFIED", "DEGRADED", "FAILED"].includes(parsed?.status);
  const requiredShape = parsed
    && typeof parsed.mcpReady === "boolean"
    && typeof parsed.dashboardReady === "boolean"
    && ["UP", "DOWN", "SKIP"].includes(parsed.gatewayHealth)
    && typeof parsed.configPath === "string"
    && typeof parsed.configExists === "boolean"
    && typeof parsed.probeTs === "string";
  return {
    ok: validStatus && requiredShape && !run.timed_out,
    exit_code: run.code,
    accepted_nonzero_exit: run.code !== 0 && parsed?.status !== "VERIFIED",
    parsed,
    stdout_preview: compactText(run.stdout, 1000),
    stderr_preview: compactText(run.stderr, 1000),
  };
}

async function packBuilderProbe(dataRoot) {
  const packPath = path.join(HERE, "hermes-pack.mjs");
  const outputBase = path.join(dataRoot, "exports");
  const before = new Set(await listHermesPackReceipts());
  const run = await runNode(packPath, ["--build", "--output", outputBase], { timeoutMs: 120000 });
  const outDir = path.join(outputBase, "codexa-hermes-pack");
  const manifestPath = path.join(outDir, "manifest.json");
  const latestZip = path.join(outputBase, "codexa-hermes-pack-WINDOWS-NATIVE.zip");
  const expectedStaged = [];
  for (const file of REQUIRED_PACK_FILES) expectedStaged.push(path.join(outDir, file));
  const stagedMissing = [];
  for (const filePath of expectedStaged) {
    if (!(await fileExists(filePath))) stagedMissing.push(path.basename(filePath));
  }
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch {}
  const zipEntries = (await fs.readdir(outputBase).catch(() => []))
    .filter((name) => /^codexa-hermes-pack-WINDOWS-NATIVE.*\.zip$/i.test(name))
    .sort();
  const zipStats = [];
  for (const name of zipEntries) {
    const filePath = path.join(outputBase, name);
    const st = await fs.stat(filePath).catch(() => null);
    if (st) zipStats.push({ path: filePath, bytes: st.size });
  }
  const after = await listHermesPackReceipts();
  const newReceipts = after.filter((receipt) => !before.has(receipt));
  const receiptUnderRoot = newReceipts.every((receipt) => {
    const rel = path.relative(ROOT, receipt);
    return rel && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
  return {
    ok: run.code === 0
      && stagedMissing.length === 0
      && manifest?.status === "VERIFIED"
      && manifest?.files?.length >= REQUIRED_PACK_FILES.length
      && zipStats.length >= 2
      && zipStats.every((entry) => entry.bytes > 0)
      && await fileExists(latestZip)
      && newReceipts.length >= 1
      && receiptUnderRoot,
    exit_code: run.code,
    out_dir: outDir,
    output_base: outputBase,
    manifest_path: manifestPath,
    manifest_status: manifest?.status || null,
    manifest_files: manifest?.files || [],
    staged_missing: stagedMissing,
    zips: zipStats,
    latest_zip: latestZip,
    new_receipts: newReceipts,
    receipts_under_orangebox: receiptUnderRoot,
    stdout_preview: compactText(run.stdout, 1200),
    stderr_preview: compactText(run.stderr, 1200),
  };
}

async function cliApiSourceProbe() {
  const cliPath = path.join(ROOT, "scripts", "obx.mjs");
  const routesPath = path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs");
  const [cli, routes] = await Promise.all([
    fs.readFile(cliPath, "utf8"),
    fs.readFile(routesPath, "utf8"),
  ]);
  const required = {
    cli: ["async function cmdHermes", "obx hermes doctor", "case \"hermes\""],
    routes: ["/api/v4/hermes/status", "/api/v4/hermes/doctor", "hermes-doctor.mjs"],
  };
  const missing = {
    cli: required.cli.filter((needle) => !cli.includes(needle)),
    routes: required.routes.filter((needle) => !routes.includes(needle)),
  };
  const missingTotal = Object.values(missing).reduce((n, arr) => n + arr.length, 0);
  return {
    ok: missingTotal === 0,
    files: { cliPath, routesPath },
    missing,
  };
}

async function writeDoctorReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-hermes-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runHermesDoctor({ writeReceipt = false, keepTemp = false } = {}) {
  const dataRoot = tempRoot();
  const checks = [];
  await fs.mkdir(dataRoot, { recursive: true });

  checks.push(await gate("root_and_source_probe", rootAndSourceProbe));
  checks.push(await gate("status_probe_degrades_cleanly", async () => statusProbe(dataRoot)));
  checks.push(await gate("pack_builder_outputs", async () => packBuilderProbe(dataRoot)));
  checks.push(await gate("cli_api_source_probe", cliApiSourceProbe));

  const failed = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failed.length === 0,
    version: HERMES_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    data_root: dataRoot,
    hermes_installed: checks.find((check) => check.name === "status_probe_degrades_cleanly")?.evidence?.parsed?.status === "VERIFIED",
    install_attempted: false,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failed.length,
      warnings: warnings.length,
    },
    checks,
    failures: failed,
    receipt_path: null,
  };

  if (writeReceipt) result.receipt_path = await writeDoctorReceipt(result);
  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--receipt");
  const keepTemp = process.argv.includes("--keep-temp");
  const json = process.argv.includes("--json");
  runHermesDoctor({ writeReceipt: write, keepTemp }).then((out) => {
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} Hermes readiness checks`);
      console.log(`installed: ${out.hermes_installed ? "yes" : "no"}; install_attempted: no`);
      if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
      for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
    }
    process.exit(out.ok ? 0 : 4);
  }).catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}
