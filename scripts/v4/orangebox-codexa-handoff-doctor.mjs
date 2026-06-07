#!/usr/bin/env node
/*
  orangebox-codexa-handoff-doctor.mjs

  Builds a single operator handoff for Codexa / AI Box setup from current
  receipts. This does not install, remote-execute, mutate Codexa, touch
  frontend, or claim full green. It turns the current gap ledger and OBOX2
  package proof into one click-order and verification receipt.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "codexa-handoff");
const downloadsRoot = path.join(userRoot, "Downloads");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
}

function readJson(file) {
  try {
    if (!exists(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function fileSummary(file) {
  if (!exists(file)) return { path: file || null, exists: false };
  const stat = fs.statSync(file);
  return {
    path: file,
    exists: true,
    bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
    sha256: stat.isFile() ? sha256File(file) : null,
  };
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${String(value).trimEnd()}\n`, "utf8");
}

function latestReceipt(prefix, root = receiptDir) {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function compactGap(gap) {
  return {
    id: gap.id,
    severity: gap.severity,
    scope: gap.scope,
    blocker: gap.blocker,
    safe_next_action: gap.safe_next_action,
    proof_commands: gap.proof_commands || [],
    operator_action_required: Boolean(gap.operator_action_required),
    blocks_full_system_green: Boolean(gap.blocks_full_system_green),
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Codexa / AI Box Handoff");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Status: **${result.status}**`);
  lines.push(`Local Ops green: **${result.local_ops_green}**`);
  lines.push(`Full two-machine green allowed: **${result.full_system_green_claim_allowed}**`);
  lines.push("");
  lines.push("## Current Truth");
  lines.push("");
  lines.push(`- OBOX2 setup zip: \`${result.setup_zip.path}\``);
  lines.push(`- zip exists: ${result.setup_zip.exists}`);
  lines.push(`- zip sha256: \`${result.setup_zip.sha256 || "missing"}\``);
  lines.push(`- package doctor: ${result.evidence.obox2_package.status || "missing"}`);
  lines.push(`- gap ledger: ${result.evidence.ops_gap_ledger.status || "missing"} (${result.open_gap_count} open, ${result.critical_gap_count} critical)`);
  lines.push("");
  lines.push("## First Click On Codexa");
  lines.push("");
  lines.push("1. Put the zip on Codexa if it is not already there.");
  lines.push("2. Unzip it.");
  lines.push("3. Right-click `RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd` and run as Administrator.");
  lines.push("4. Wait for it to print/write receipts under `C:\\AtomEons\\ai-box\\receipts`.");
  lines.push("");
  lines.push("## Codexa Run Order");
  lines.push("");
  for (const step of result.codexa_run_order) {
    lines.push(`${step.order}. \`${step.command}\` - ${step.why}`);
  }
  lines.push("");
  lines.push("## Back On This Cockpit");
  lines.push("");
  for (const command of result.cockpit_verify_commands) lines.push(`- \`${command}\``);
  lines.push("");
  lines.push("## Open Gaps");
  lines.push("");
  for (const gap of result.open_gaps) {
    lines.push(`### ${gap.id}`);
    lines.push(`- severity: ${gap.severity}`);
    lines.push(`- blocker: ${gap.blocker}`);
    lines.push(`- next: ${gap.safe_next_action}`);
    lines.push("");
  }
  lines.push("## Guardrail");
  lines.push("");
  lines.push("This handoff is proof of what to run, not proof that Codexa is fixed. Full two-machine green requires fresh Codexa rail, Ollama, model inventory, and Ops gap receipts.");
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const now = new Date();
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const gapLedger = readJson(path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json"));
  const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"));
  const health = readJson(path.join(dataRoot, "reports", "health", "latest-health-report.json"));
  const alert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"));
  const modelInventory = readJson(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"));
  const obox2Pack = readJson(path.join(dataRoot, "obox2", "latest-internal-setup-pack.json"));
  const obox2Doctor = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"));
  const finalPackage = readJson(latestReceipt("orangebox-delta-final-package-") || "");

  const setupZipPath = obox2Pack?.zip_path || obox2Doctor?.zip_path || path.join(downloadsRoot, "Orangebox_V2_Internal_Setup_Pack.zip");
  const openGaps = (gapLedger?.gaps || []).map(compactGap);
  const criticalGaps = openGaps.filter((gap) => gap.severity === "critical");
  const localOpsGreen = project?.local_ops_green === true || finalPackage?.status === "ORANGEBOX_DELTA_FINAL_VERIFIED_GREEN";
  const setupZip = fileSummary(setupZipPath);
  const requiredLaunchers = [
    "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd",
    "RUN_CODEXA_POWER_DOCTOR.cmd",
    "RUN_START_CODEXA_RAIL_AS_ADMIN.cmd",
    "RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd",
    "RUN_MODEL_DOCTOR_ON_CODEXA.cmd",
  ];
  const presentFiles = new Set(obox2Doctor?.present_files || []);
  const missingLaunchers = requiredLaunchers.filter((name) => !presentFiles.has(name));
  const cockpitVerifyCommands = [
    "npm.cmd run codexa:alert:popup",
    "npm.cmd run model:inventory",
    "npm.cmd run trilane:doctor",
    "npm.cmd run model:lane-eval",
    "npm.cmd run ops:gaps",
    "npm.cmd run ops:green",
  ];

  const codexaRunOrder = [
    {
      order: 1,
      command: "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd",
      why: "One-click power optimizer, power doctor, rail starter, and model/Hermes doctors.",
      blocks_until_green: ["codexa_command_rail_8097_down", "codexa_remote_control_unproven"],
    },
    {
      order: 2,
      command: "RUN_CODEXA_POWER_DOCTOR.cmd",
      why: "Verify Codexa is not sleeping/hibernating away from the operator.",
      blocks_until_green: ["codexa_remote_control_unproven"],
    },
    {
      order: 3,
      command: "RUN_START_CODEXA_RAIL_AS_ADMIN.cmd",
      why: "Recover command rail 8097 and bridge rail 8098 if start-here did not leave them reachable.",
      blocks_until_green: ["codexa_command_rail_8097_down"],
    },
    {
      order: 4,
      command: "RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd",
      why: "Install core local models before heavy/all tiers.",
      blocks_until_green: ["codexa_ollama_unreachable", "core_local_models_missing"],
    },
    {
      order: 5,
      command: "RUN_MODEL_DOCTOR_ON_CODEXA.cmd",
      why: "Write Codexa model receipt and show missing core models explicitly.",
      blocks_until_green: ["core_local_models_missing"],
    },
    {
      order: 6,
      command: "RUN_INSTALL_HERMES_AGENT_ON_CODEXA.cmd",
      why: "Optional after rail/core model proof; Hermes is not authority and must be doctor-proven.",
      blocks_until_green: ["hermes_outer_orchestration_unproven"],
      optional: true,
    },
    {
      order: 7,
      command: "RUN_HERMES_DOCTOR_ON_CODEXA.cmd",
      why: "Verify optional Hermes outer orchestration only after core setup is stable.",
      blocks_until_green: ["hermes_outer_orchestration_unproven"],
      optional: true,
    },
  ];

  const checks = [
    { id: "package_script_present", ok: Boolean(packageJson?.scripts?.["codexa:handoff"]) },
    { id: "setup_zip_exists", ok: setupZip.exists, detail: setupZip },
    { id: "obox2_package_green", ok: obox2Doctor?.status === "OBOX2_PACKAGE_VERIFIED_GREEN" && obox2Doctor?.ok === true },
    { id: "required_launchers_present", ok: missingLaunchers.length === 0, missing: missingLaunchers },
    { id: "gap_ledger_valid", ok: ["ORANGEBOX_OPS_GAP_LEDGER_REPORTED_OPEN_GAPS", "ORANGEBOX_OPS_GAP_LEDGER_GREEN_NO_OPEN_GAPS"].includes(gapLedger?.status) },
    { id: "first_click_named", ok: codexaRunOrder[0].command === "RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd" },
    { id: "cockpit_verify_commands_present", ok: cockpitVerifyCommands.length >= 5 && cockpitVerifyCommands.includes("npm.cmd run ops:gaps") },
    { id: "no_false_full_green", ok: gapLedger?.full_system_green_claim_allowed !== true || openGaps.length === 0 },
  ];
  const failures = checks.filter((check) => !check.ok);
  const status = failures.length === 0
    ? openGaps.length > 0
      ? "CODEXA_HANDOFF_READY_WITH_OPEN_GAPS"
      : "CODEXA_HANDOFF_READY_NO_OPEN_GAPS"
    : "CODEXA_HANDOFF_NOT_READY";

  const result = {
    ok: status !== "CODEXA_HANDOFF_NOT_READY",
    version: "orangebox-codexa-handoff/v1",
    status,
    generated_at: now.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    public_name: "Orangebox Version 1",
    doctrine: "Handoffs are receipts, not vibes. The setup pack is a runnable path; Codexa is green only after probes prove it.",
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      install_attempted: false,
      paid_api_attempted: false,
      remote_codexa_mutation_attempted: false,
      production_deploy_attempted: false,
    },
    local_ops_green: Boolean(localOpsGreen),
    full_system_green_claim_allowed: openGaps.length === 0 && gapLedger?.full_system_green_claim_allowed === true,
    open_gap_count: openGaps.length,
    critical_gap_count: criticalGaps.length,
    setup_zip: setupZip,
    codexa_run_order: codexaRunOrder,
    cockpit_verify_commands: cockpitVerifyCommands,
    expected_codexa_receipts: [
      "C:\\AtomEons\\ai-box\\receipts\\obox2-start-here-latest.json",
      "C:\\AtomEons\\ai-box\\receipts\\obox2-power-doctor-latest.json",
      "C:\\AtomEons\\ai-box\\receipts\\orangebox-command-rail-latest.json",
      "C:\\AtomEons\\ai-box\\receipts\\obox2-model-doctor-latest.json",
      "C:\\AtomEons\\ai-box\\receipts\\hermes-agent-doctor-latest.json",
    ],
    open_gaps: openGaps,
    checks,
    failures,
    evidence: {
      ops_gap_ledger: { path: path.join(dataRoot, "ops-gap-ledger", "latest-ops-gap-ledger.json"), status: gapLedger?.status || null },
      project_report: { path: path.join(dataRoot, "reports", "project", "latest-project-report.json"), status: project?.status || null },
      health_report: { path: path.join(dataRoot, "reports", "health", "latest-health-report.json"), status: health?.status || null },
      codexa_alert: { path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"), status: alert?.status || null },
      model_inventory: { path: path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"), status: modelInventory?.status || null },
      obox2_package: { path: path.join(dataRoot, "obox2", "latest-package-doctor.json"), status: obox2Doctor?.status || null },
    },
    handoff_hash: sha256(`${setupZip.path}\n${setupZip.sha256}\n${JSON.stringify(openGaps)}\n${JSON.stringify(codexaRunOrder)}`),
    next_action: "Use this handoff on Codexa, then rerun the cockpit verification commands in order.",
  };

  const latestJson = path.join(outRoot, "latest-codexa-handoff.json");
  const latestMd = path.join(outRoot, "latest-codexa-handoff.md");
  const downloadMd = path.join(downloadsRoot, "ORANGEBOX_CODEXA_HANDOFF.md");
  await writeJson(latestJson, result);
  await writeText(latestMd, renderMarkdown(result));
  await writeText(downloadMd, renderMarkdown(result));

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-codexa-handoff-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestJson, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : status);
  if (!result.ok) process.exitCode = 1;
}

await main();
