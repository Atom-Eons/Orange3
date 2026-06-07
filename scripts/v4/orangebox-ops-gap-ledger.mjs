#!/usr/bin/env node
/*
  orangebox-ops-gap-ledger.mjs

  One-reality gap ledger for Orangebox Ops. It turns every remaining partial
  into a named blocker with current evidence, proof commands, safe next action,
  and whether the gap blocks local Ops or only full two-machine green.
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
const outRoot = path.join(dataRoot, "ops-gap-ledger");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
}

function readJson(file) {
  try {
    if (!file || !exists(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeText(file, text) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, "utf8");
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

function fileSummary(file) {
  if (!file || !exists(file)) return { path: file || null, exists: false };
  const stat = fs.statSync(file);
  return {
    path: file,
    exists: true,
    bytes: stat.size,
    modified_at: stat.mtime.toISOString(),
  };
}

function statusText(value) {
  if (value === true) return "green";
  if (value === false) return "not_green";
  return "unknown";
}

function renderMarkdown(result) {
  const lines = [];
  lines.push("# Orangebox Ops Gap Ledger");
  lines.push("");
  lines.push(`Generated: ${result.generated_at}`);
  lines.push(`Status: **${result.status}**`);
  lines.push(`Local Ops green: **${result.local_ops_green}**`);
  lines.push(`Full system green claim allowed: **${result.full_system_green_claim_allowed}**`);
  lines.push(`Open gaps: **${result.gap_count}**`);
  lines.push("");
  lines.push("## Open Gaps");
  lines.push("");
  if (result.gaps.length === 0) {
    lines.push("- None. Full-system proof may proceed.");
  } else {
    for (const gap of result.gaps) {
      lines.push(`### ${gap.id}`);
      lines.push("");
      lines.push(`- severity: ${gap.severity}`);
      lines.push(`- scope: ${gap.scope}`);
      lines.push(`- current: ${gap.current_evidence}`);
      lines.push(`- blocker: ${gap.blocker}`);
      lines.push(`- blocks local Ops: ${gap.blocks_local_ops}`);
      lines.push(`- blocks full system green: ${gap.blocks_full_system_green}`);
      lines.push(`- operator action required: ${gap.operator_action_required}`);
      lines.push(`- safe next action: ${gap.safe_next_action}`);
      lines.push("- proof commands:");
      for (const command of gap.proof_commands) lines.push(`  - \`${command}\``);
      lines.push("");
    }
  }
  lines.push("## Evidence");
  lines.push("");
  for (const [name, item] of Object.entries(result.evidence)) {
    lines.push(`- ${name}: ${item.status || statusText(item.ok)}${item.path ? ` (${item.path})` : ""}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function makeGap({
  id,
  severity = "warning",
  scope = "two_machine",
  current_evidence,
  blocker,
  safe_next_action,
  proof_commands,
  operator_action_required = false,
  blocks_local_ops = false,
  blocks_full_system_green = true,
  evidence_refs = [],
}) {
  return {
    id,
    severity,
    scope,
    current_evidence,
    blocker,
    safe_next_action,
    proof_commands,
    operator_action_required,
    blocks_local_ops,
    blocks_full_system_green,
    evidence_refs,
    action_hash: sha256(`${id}\n${safe_next_action}\n${proof_commands.join("\n")}`).slice(0, 16),
  };
}

async function main() {
  const startedAt = new Date();
  const packageJson = readJson(path.join(repoRoot, "package.json"));
  const health = readJson(path.join(dataRoot, "reports", "health", "latest-health-report.json"));
  const project = readJson(path.join(dataRoot, "reports", "project", "latest-project-report.json"));
  const reality = readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json"));
  const codexaAlert = readJson(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"));
  const codexaSmbStage = readJson(path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"));
  const modelInventory = readJson(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"));
  const obox2 = readJson(path.join(dataRoot, "obox2", "latest-package-doctor.json"));
  const researchRadar = readJson(path.join(dataRoot, "research-radar", "latest-research-radar.json"));
  const localOpsGreenReceipt = readJson(latestReceipt("orangebox-local-ops-green-"));

  const localOpsGreen =
    project?.local_ops_green === true &&
    localOpsGreenReceipt?.status === "ORANGEBOX_LOCAL_OPS_GREEN";
  const codexaCommandOk =
    codexaAlert?.command_reachable === true ||
    codexaAlert?.remote_execution_available === true ||
    reality?.checks?.probes?.ai_box_command_8097?.ok === true;
  const codexaOllamaOk =
    modelInventory?.probes?.codexa_direct_ollama?.ok === true ||
    modelInventory?.probes?.codexa_lan_ollama?.ok === true;
  const codexaRemoteControlOk = codexaAlert?.remote_control_available === true;
  const codexaSmbStageOk = codexaSmbStage?.stage_ready === true || codexaSmbStage?.stage_written === true;
  const modelCoreInstalled = Number(modelInventory?.summary?.core_installed || 0);
  const modelCoreTotal = Number(modelInventory?.summary?.core_total || 0);
  const modelRequiredInstalled = Number(modelInventory?.summary?.required_installed || 0);
  const modelRequiredTotal = Number(modelInventory?.summary?.required_total || 0);
  const hermesProven =
    obox2?.operational_contracts?.checks?.some((check) => /hermes/i.test(check.id || "") && check.ok === true) &&
    project?.scope?.some((row) => /Hermes/i.test(row.area || "") && row.status === "REAL");

  const gaps = [];
  if (!localOpsGreen) {
    gaps.push(makeGap({
      id: "local_ops_not_green",
      severity: "critical",
      scope: "local_ops",
      current_evidence: `project.local_ops_green=${project?.local_ops_green}; latest local Ops receipt=${localOpsGreenReceipt?.status || "missing"}`,
      blocker: "Local Ops proof is not currently green.",
      safe_next_action: "Run local Ops proof and repair any failing backend doctor before touching Codexa or packaging.",
      proof_commands: ["npm.cmd run ops:green", "npm.cmd run health:report", "npm.cmd run project:report"],
      operator_action_required: false,
      blocks_local_ops: true,
      blocks_full_system_green: true,
      evidence_refs: [fileSummary(path.join(dataRoot, "reports", "project", "latest-project-report.json")), fileSummary(latestReceipt("orangebox-local-ops-green-"))],
    }));
  }
  if (!codexaCommandOk) {
    gaps.push(makeGap({
      id: "codexa_command_rail_8097_down",
      severity: "critical",
      scope: "two_machine",
      current_evidence: `8097=${statusText(reality?.checks?.probes?.ai_box_command_8097?.ok)}; codexa alert=${codexaAlert?.status || "missing"}`,
      blocker: "The AI Box command rail is not reachable from this cockpit.",
      safe_next_action: "On Codexa, run OBOX2 start-here or the small rail recovery pack as Administrator, then rerun Codexa alert and health proof.",
      proof_commands: ["npm.cmd run codexa:alert:popup", "npm.cmd run health:report", "npm.cmd run project:report"],
      operator_action_required: true,
      evidence_refs: [fileSummary(path.join(dataRoot, "watcher", "latest-reality-watch.json")), fileSummary(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"))],
    }));
  }
  if (!codexaOllamaOk) {
    gaps.push(makeGap({
      id: "codexa_ollama_unreachable",
      severity: "critical",
      scope: "model_runtime",
      current_evidence: `codexa Ollama direct=${statusText(modelInventory?.probes?.codexa_direct_ollama?.ok)}; lan=${statusText(modelInventory?.probes?.codexa_lan_ollama?.ok)}`,
      blocker: "No Codexa Ollama endpoint is reachable, so local heavy model routing cannot be called green.",
      safe_next_action: "Bring up Ollama on Codexa, install core models first, then rerun model inventory and tri-lane doctors.",
      proof_commands: ["npm.cmd run model:inventory", "npm.cmd run trilane:doctor", "npm.cmd run model:lane-eval", "npm.cmd run health:report"],
      operator_action_required: true,
      evidence_refs: [fileSummary(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"))],
    }));
  }
  if (!codexaRemoteControlOk) {
    gaps.push(makeGap({
      id: "codexa_remote_control_unproven",
      severity: "warning",
      scope: "two_machine",
      current_evidence: `remote_control_available=${codexaAlert?.remote_control_available ?? null}; remote_execution_available=${codexaAlert?.remote_execution_available ?? null}`,
      blocker: "RDP/WinRM/remote execution is not proven from this cockpit.",
      safe_next_action: "Use OBOX2 setup directly on Codexa or restore RDP/WinRM; do not claim remote repair capability until the alert receipt proves it.",
      proof_commands: ["npm.cmd run codexa:alert:popup", "npm.cmd run codexa:smb-stage", "npm.cmd run health:report"],
      operator_action_required: true,
      evidence_refs: [fileSummary(path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"))],
    }));
  }
  if (codexaAlert?.smb_port_visible === true && !codexaSmbStageOk) {
    gaps.push(makeGap({
      id: "codexa_smb_visible_no_share_access",
      severity: "attention",
      scope: "file_staging",
      current_evidence: `smb_visible=true; stage_ready=${codexaSmbStage?.stage_ready ?? null}; stage_written=${codexaSmbStage?.stage_written ?? null}`,
      blocker: "SMB port is visible, but no share path is proven writable/readable for staging.",
      safe_next_action: "Treat SMB as staging-only and use the OBOX2 zip directly on Codexa unless a future SMB receipt proves share access.",
      proof_commands: ["npm.cmd run codexa:smb-stage", "npm.cmd run project:report"],
      operator_action_required: false,
      evidence_refs: [fileSummary(path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"))],
    }));
  }
  if (!hermesProven) {
    gaps.push(makeGap({
      id: "hermes_outer_orchestration_unproven",
      severity: "warning",
      scope: "two_machine",
      current_evidence: "Hermes setup artifacts exist, but no current project report row proves Hermes installed/running.",
      blocker: "Hermes cannot be treated as active orchestration until Codexa setup proof or Hermes doctor receipt proves it.",
      safe_next_action: "After Codexa rail and power proof are green, run the Hermes doctor/install path from the OBOX2 pack.",
      proof_commands: ["npm.cmd run obox2:doctor", "npm.cmd run project:report"],
      operator_action_required: true,
      evidence_refs: [fileSummary(path.join(dataRoot, "obox2", "latest-package-doctor.json"))],
    }));
  }
  if (modelCoreTotal > 0 && modelCoreInstalled < modelCoreTotal) {
    gaps.push(makeGap({
      id: "core_local_models_missing",
      severity: "critical",
      scope: "model_runtime",
      current_evidence: `core=${modelCoreInstalled}/${modelCoreTotal}; required=${modelRequiredInstalled}/${modelRequiredTotal}; status=${modelInventory?.status || "missing"}`,
      blocker: "Registered core models are not observed installed/reachable.",
      safe_next_action: "Install core model tier on Codexa before heavy models; rerun inventory and routing proof.",
      proof_commands: ["npm.cmd run model:inventory", "npm.cmd run trilane:doctor", "npm.cmd run model:lane-eval", "npm.cmd run project:report"],
      operator_action_required: true,
      evidence_refs: [fileSummary(path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"))],
    }));
  }

  const ledgerOk = gaps.every((gap) =>
    gap.id &&
    gap.current_evidence &&
    gap.blocker &&
    gap.safe_next_action &&
    Array.isArray(gap.proof_commands) &&
    gap.proof_commands.length > 0
  );
  const fullSystemGreenClaimAllowed = localOpsGreen && gaps.every((gap) => gap.blocks_full_system_green !== true);
  const status = ledgerOk
    ? gaps.length === 0
      ? "ORANGEBOX_OPS_GAP_LEDGER_GREEN_NO_OPEN_GAPS"
      : "ORANGEBOX_OPS_GAP_LEDGER_REPORTED_OPEN_GAPS"
    : "ORANGEBOX_OPS_GAP_LEDGER_NEEDS_WORK";

  const result = {
    ok: ledgerOk,
    version: "orangebox-ops-gap-ledger/v1",
    status,
    generated_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Open gaps are allowed; unnamed gaps and false-green claims are not.",
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      paid_api_attempted: false,
      install_attempted: false,
      remote_codexa_mutation_attempted: false,
      production_deploy_attempted: false,
    },
    local_ops_green: localOpsGreen,
    full_system_green_claim_allowed: fullSystemGreenClaimAllowed,
    gap_count: gaps.length,
    critical_gap_count: gaps.filter((gap) => gap.severity === "critical").length,
    operator_action_required_count: gaps.filter((gap) => gap.operator_action_required).length,
    gaps,
    evidence: {
      project_report: { path: path.join(dataRoot, "reports", "project", "latest-project-report.json"), status: project?.status || null, ok: project?.report_ok === true },
      health_report: { path: path.join(dataRoot, "reports", "health", "latest-health-report.json"), status: health?.status || null, ok: Boolean(health?.ok) },
      reality_watch: { path: path.join(dataRoot, "watcher", "latest-reality-watch.json"), status: reality?.status || null, ok: Boolean(reality?.ok) },
      codexa_alert: { path: path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json"), status: codexaAlert?.status || null, ok: Boolean(codexaAlert?.status) },
      codexa_smb_stage: { path: path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"), status: codexaSmbStage?.status || null, ok: Boolean(codexaSmbStage?.status) },
      model_inventory: { path: path.join(dataRoot, "reports", "models", "latest-model-inventory-report.json"), status: modelInventory?.status || null, ok: Boolean(modelInventory?.ok) },
      obox2_package: { path: path.join(dataRoot, "obox2", "latest-package-doctor.json"), status: obox2?.status || null, ok: Boolean(obox2?.ok) },
      research_radar: { path: path.join(dataRoot, "research-radar", "latest-research-radar.json"), status: researchRadar?.status || null, ok: Boolean(researchRadar?.ok) },
      local_ops_green_receipt: { path: latestReceipt("orangebox-local-ops-green-"), status: localOpsGreenReceipt?.status || null, ok: localOpsGreenReceipt?.status === "ORANGEBOX_LOCAL_OPS_GREEN" },
    },
    package_script_present: Boolean(packageJson?.scripts?.["ops:gaps"]),
    next_action: gaps.length
      ? "Work the highest-severity gap first, then rerun npm.cmd run ops:gaps && npm.cmd run ops:green."
      : "No open Ops gaps in this ledger; run system full-green proof if Codexa is expected to be active.",
  };

  const latestJson = path.join(outRoot, "latest-ops-gap-ledger.json");
  const latestMd = path.join(outRoot, "latest-ops-gap-ledger.md");
  await writeJson(latestJson, result);
  await writeText(latestMd, renderMarkdown(result));

  if (wantsReceipt) {
    await fsp.mkdir(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-ops-gap-ledger-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestJson, result);
    await writeText(latestMd, renderMarkdown(result));
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  const out = {
    ok: false,
    version: "orangebox-ops-gap-ledger/v1",
    status: "ORANGEBOX_OPS_GAP_LEDGER_FAILED",
    error: error?.message || String(error),
  };
  console.log(wantsJson ? JSON.stringify(out, null, 2) : `${out.status}: ${out.error}`);
  process.exitCode = 1;
});
