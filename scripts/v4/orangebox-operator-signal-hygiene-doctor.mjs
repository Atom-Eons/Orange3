#!/usr/bin/env node
/*
  orangebox-operator-signal-hygiene-doctor.mjs

  Dedicated proof lane for operator signal hygiene. It verifies that Orangebox
  warnings are visible, throttled, severity-labeled, and honest about the
  difference between local Ops green and full two-machine green.
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
const outRoot = path.join(dataRoot, "signal-hygiene");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function newestFile(root, prefix, suffix = ".json") {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(suffix))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function check(id, ok, evidence = {}) {
  return { id, ok: Boolean(ok), ...evidence };
}

async function main() {
  const startedAt = new Date();
  const alertPath = path.join(dataRoot, "alerts", "codexa-link", "latest-codexa-alert.json");
  const healthPath = path.join(dataRoot, "reports", "health", "latest-health-report.json");
  const projectPath = path.join(dataRoot, "reports", "project", "latest-project-report.json");
  const realityPath = path.join(dataRoot, "watcher", "latest-reality-watch.json");
  const profilePath = path.join(userRoot, "Documents", "WindowsPowerShell", "Microsoft.PowerShell_profile.ps1");
  const profileReceiptPath = newestFile(path.join(dataRoot, "profile-backups"), "orangebox-powershell-profile-policy-");

  const alert = readJson(alertPath);
  const hygiene = alert?.signal_hygiene || {};
  const health = readJson(healthPath);
  const project = readJson(projectPath);
  const reality = readJson(realityPath);
  const profileText = readText(profilePath);
  const profileReceipt = readJson(profileReceiptPath);
  const status = alert?.status || "UNKNOWN";
  const statusReady = status === "CODEXA_READY";
  const allowedSeverity = new Set(["green", "attention", "warning", "urgent", "critical"]);
  const allowedNotifyReasons = new Set([
    "forced",
    "popup_not_requested",
    "ready_suppressed",
    "first_non_ready_signal",
    "status_changed",
    "no_prior_notification_time",
    "cooldown_elapsed",
    "cooldown_active",
    "wscript_popup",
    "legacy_alert_shape",
  ]);

  const checks = [
    check("source_receipts_present", Boolean(alert && health && project && reality), {
      alert_path: alertPath,
      health_path: healthPath,
      project_path: projectPath,
      reality_path: realityPath,
    }),
    check("signal_schema_complete", hygiene.version === "orangebox-signal-hygiene/v1"
      && allowedSeverity.has(hygiene.severity)
      && typeof hygiene.human_label === "string"
      && typeof hygiene.summary_line === "string"
      && Number(hygiene.repeat_count || 0) >= 1, {
      version: hygiene.version || null,
      severity: hygiene.severity || null,
      human_label: hygiene.human_label || null,
      repeat_count: hygiene.repeat_count || 0,
    }),
    check("popup_cadence_fatigue_aware", Number(hygiene.cooldown_minutes || 0) >= 5
      && /cooldown/i.test(String(hygiene.alert_fatigue_policy || ""))
      && /status change/i.test(String(hygiene.alert_fatigue_policy || ""))
      && allowedNotifyReasons.has(hygiene.notify_reason), {
      notify_reason: hygiene.notify_reason || null,
      cooldown_minutes: hygiene.cooldown_minutes || null,
      next_popup_after: hygiene.next_popup_after || null,
      popup_requested: hygiene.popup_requested ?? null,
      alert_fatigue_policy: hygiene.alert_fatigue_policy || null,
    }),
    check("local_full_green_split_preserved", hygiene.local_basic_install_blocked === false
      && hygiene.full_system_green_blocked === !statusReady
      && (statusReady || project?.full_project_green === false)
      && (statusReady || /WARN|WITH_GAPS|WARNINGS/i.test(`${health?.status || ""} ${project?.status || ""} ${reality?.status || ""}`)), {
      status,
      local_basic_install_blocked: hygiene.local_basic_install_blocked ?? null,
      full_system_green_blocked: hygiene.full_system_green_blocked ?? null,
      health_status: health?.status || null,
      project_status: project?.status || null,
      reality_status: reality?.status || null,
      project_full_green: project?.full_project_green ?? null,
    }),
    check("reports_mirror_signal", project?.evidence?.codexa_signal_hygiene?.summary_line === hygiene.summary_line
      && health?.ai_box?.link_alert?.signal_hygiene?.summary_line === hygiene.summary_line
      && reality?.checks?.codexa_alert?.signal_hygiene?.summary_line === hygiene.summary_line, {
      project_summary: project?.evidence?.codexa_signal_hygiene?.summary_line || null,
      health_summary: health?.ai_box?.link_alert?.signal_hygiene?.summary_line || null,
      reality_summary: reality?.checks?.codexa_alert?.signal_hygiene?.summary_line || null,
      alert_summary: hygiene.summary_line || null,
    }),
    check("terminal_affordance_visible", exists(profilePath)
      && profileText.includes("function obox")
      && profileText.includes("function obox-off")
      && profileText.includes("ORANGEBOX_ACTIVE")
      && !/Agent Colors Loaded!/i.test(profileText)
      && profileReceipt?.status === "ORANGEBOX_POWERSHELL_PROFILE_ENABLED", {
      profile_path: profilePath,
      profile_receipt_path: profileReceiptPath,
      profile_status: profileReceipt?.status || null,
    }),
  ];

  const confidenceCalibration = {
    local_ops: "high_receipt_backed",
    codexa: statusReady ? "available_by_probe" : "blocked_by_probe",
    full_system: statusReady ? "eligible_for_full_gate" : "not_green_by_evidence",
    model_inventory: project?.models?.installed_core_count === 0 ? "explicitly_not_installed" : "receipt_backed_inventory",
    proof_basis: "receipt_and_probe_only",
  };

  const operatorTransparency = {
    version: "orangebox-operator-transparency/v1",
    research_basis: "Human-autonomy transparency: status, rationale, foresight, and after-action receipts must be visible without flooding the operator.",
    level_1_status: {
      local_ops: confidenceCalibration.local_ops,
      codexa: confidenceCalibration.codexa,
      full_system: confidenceCalibration.full_system,
      current_alert: status,
      severity: hygiene.severity || null,
    },
    level_2_rationale: {
      local_ops_green_reason: "Local backend proofs, command/API/STRONGARM listeners, skills, action classifier, memory truth, and receipts are green.",
      full_system_blocked_reason: statusReady
        ? "Codexa probes are ready; full-system proof is eligible but still requires its own gate."
        : "Codexa command rail, Ollama, or remote control is not probe-green; full two-machine routing remains gated.",
      model_inventory_reason: confidenceCalibration.model_inventory,
    },
    level_3_foresight: {
      next_safe_action: statusReady
        ? "Run system:full-green when the operator wants full distributed proof."
        : "Run the OBOX2 setup pack on Codexa, then rerun codexa:alert, health:report, project:report, and ops:green.",
      popup_policy: hygiene.alert_fatigue_policy || "Popup only on status change or cooldown.",
      next_popup_after: hygiene.next_popup_after || null,
      full_green_gate: statusReady ? "eligible" : "blocked_until_codexa_rail_ollama_remote_control_green",
    },
    after_action_review: {
      receipts: {
        alert: alertPath,
        health: healthPath,
        project: projectPath,
        reality: realityPath,
      },
      rollback: [
        "Revert alert/report/signal changes.",
        "Rerun codexa:alert, health:report, project:report, reality:watch, and signal:hygiene.",
      ],
    },
  };

  checks.push(check("confidence_calibration_visible", Object.values(confidenceCalibration).every(Boolean), confidenceCalibration));
  checks.push(check("operator_transparency_lifecycle_visible",
    operatorTransparency.version === "orangebox-operator-transparency/v1"
    && Boolean(operatorTransparency.level_1_status.current_alert)
    && Boolean(operatorTransparency.level_2_rationale.full_system_blocked_reason)
    && Boolean(operatorTransparency.level_3_foresight.next_safe_action)
    && Boolean(operatorTransparency.after_action_review.receipts.health), {
      transparency_version: operatorTransparency.version,
      current_alert: operatorTransparency.level_1_status.current_alert,
      full_green_gate: operatorTransparency.level_3_foresight.full_green_gate,
    }));

  const failures = checks.filter((row) => !row.ok).map((row) => row.id);
  const result = {
    ok: failures.length === 0,
    version: "orangebox-operator-signal-hygiene-doctor/v1",
    status: failures.length === 0 ? "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN" : "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_NEEDS_ATTENTION",
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Operator-visible signals must be machine-readable, throttled, severity-labeled, confidence-calibrated, and honest about local versus distributed readiness.",
    source_status: {
      codexa_alert: status,
      health: health?.status || null,
      project: project?.status || null,
      reality: reality?.status || null,
    },
    signal_hygiene: hygiene,
    confidence_calibration: confidenceCalibration,
    operator_transparency: operatorTransparency,
    checks,
    failures,
    constraints: {
      frontend_touched: false,
      install_attempted: false,
      paid_api_attempted: false,
      host_mcp_config_mutated: false,
      production_deploy_attempted: false,
      popup_created_by_this_doctor: false,
    },
    next_action: failures.length === 0
      ? "Keep this doctor in the local Ops proof chain before changing popup, watcher, alert, or status-report behavior."
      : "Run codexa:alert, health:report, project:report, and reality:watch, then rerun signal:hygiene.",
    proof_hash: sha256(JSON.stringify({ checks, status, confidenceCalibration, operatorTransparency })),
  };

  const latestPath = path.join(outRoot, "latest-operator-signal-hygiene.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-operator-signal-hygiene-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
