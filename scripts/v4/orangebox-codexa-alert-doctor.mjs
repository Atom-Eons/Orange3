#!/usr/bin/env node
/*
  orangebox-codexa-alert-doctor.mjs

  First-class AI Box/Codexa link alert. This turns the current "AI Box is down"
  health warning into an explicit, receipt-backed operator signal. It never
  routes work and never mutates Codexa; it only probes, records, and optionally
  raises a throttled Windows popup on the cockpit machine.
*/

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");
const wantsPopup = args.has("--popup");
const forcePopup = args.has("--force-popup");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const alertRoot = path.join(dataRoot, "alerts", "codexa-link");
const statePath = path.join(alertRoot, "codexa-alert-state.json");
const downloadsRoot = path.join(userRoot, "Downloads");
const directIp = process.env.ORANGEBOX_CODEXA_DIRECT_IP || process.env.ORANGEBOX_AI_BOX_DIRECT_IP || "10.0.99.1";
const lanIp = process.env.ORANGEBOX_CODEXA_IP || process.env.ORANGEBOX_AI_BOX_IP || "10.0.0.4";
const cooldownMinutes = Number(process.env.ORANGEBOX_CODEXA_ALERT_COOLDOWN_MINUTES || 30);

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

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function shortHash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
}

function fileSummary(file) {
  try {
    const stat = fs.statSync(file);
    return { path: file, exists: true, bytes: stat.size, modified_at: stat.mtime.toISOString() };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
}

async function probe(url, timeoutMs = 1400) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let body = text.slice(0, 400);
    try {
      body = JSON.parse(text);
    } catch {}
    return { ok: response.ok, status: response.status, ms: Date.now() - started, url, body };
  } catch (error) {
    return { ok: false, status: 0, ms: Date.now() - started, url, error: error.message };
  } finally {
    clearTimeout(timer);
  }
}

function probeTcp(host, port, timeoutMs = 900) {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let finished = false;
    const done = (ok, error = null) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      resolve({ ok, host, port, ms: Date.now() - started, error });
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false, "timeout"));
    socket.once("error", (error) => done(false, error.message));
    socket.connect(port, host);
  });
}

function buildMessage(status, probes) {
  if (status === "CODEXA_READY") {
    return "Codexa/AI Box is reachable. Command rail and Ollama responded; heavy-lane routing can be considered after the model doctor is green.";
  }
  if (status === "CODEXA_RECEIPTS_ONLY") {
    return "Codexa/AI Box receipt dashboard is reachable, but command rail or Ollama is down. Do not route heavy work to Codexa yet.";
  }
  if (status === "CODEXA_COMMAND_ONLY") {
    return "Codexa/AI Box command rail is reachable, but Ollama is down. Rail tasks may work; local model tasks need model setup.";
  }
  return "Orangebox cannot talk to Codexa/AI Box command/model rails. Local Basic Install still works; run the OBOX2 power, rail, and model setup pack on Codexa.";
}

async function showPopup(title, message) {
  if (process.platform !== "win32") return { ok: false, mode: "not_windows" };
  const command = [
    "$ErrorActionPreference='SilentlyContinue';",
    "$shell=New-Object -ComObject WScript.Shell;",
    `$null=$shell.Popup(${JSON.stringify(message)}, 12, ${JSON.stringify(title)}, 48);`,
  ].join(" ");
  try {
    await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      timeout: 16_000,
      windowsHide: true,
      maxBuffer: 64_000,
    });
    return { ok: true, mode: "wscript_popup" };
  } catch (error) {
    return { ok: false, mode: "wscript_popup_failed", error: error.message };
  }
}

function shouldNotify(previous, status, now) {
  if (forcePopup) return true;
  if (!wantsPopup) return false;
  if (!previous?.status) return status !== "CODEXA_READY";
  if (previous.status !== status) return true;
  if (status === "CODEXA_READY") return false;
  const last = previous.last_notified_at ? Date.parse(previous.last_notified_at) : 0;
  if (!Number.isFinite(last) || last <= 0) return true;
  return now.getTime() - last >= cooldownMinutes * 60 * 1000;
}

function notificationReason(previous, status, now) {
  if (forcePopup) return "forced";
  if (!wantsPopup) return "popup_not_requested";
  if (status === "CODEXA_READY") return "ready_suppressed";
  if (!previous?.status) return "first_non_ready_signal";
  if (previous.status !== status) return "status_changed";
  const last = previous.last_notified_at ? Date.parse(previous.last_notified_at) : 0;
  if (!Number.isFinite(last) || last <= 0) return "no_prior_notification_time";
  if (now.getTime() - last >= cooldownMinutes * 60 * 1000) return "cooldown_elapsed";
  return "cooldown_active";
}

function nextPopupAfter(previous, status, now) {
  if (!wantsPopup || forcePopup || status === "CODEXA_READY") return null;
  const last = previous?.last_notified_at ? Date.parse(previous.last_notified_at) : 0;
  if (!Number.isFinite(last) || last <= 0) return now.toISOString();
  return new Date(last + cooldownMinutes * 60 * 1000).toISOString();
}

function signalSeverity(status, facts) {
  if (status === "CODEXA_READY") return "green";
  if (status === "CODEXA_COMMAND_ONLY") return "warning";
  if (status === "CODEXA_RECEIPTS_ONLY") return facts.remoteControlAvailable ? "warning" : "attention";
  return facts.receiptsOk || facts.smbPortOpen ? "attention" : "urgent";
}

function buildSignalHygiene(previous, status, alertHash, facts, now) {
  const sameSignal = previous?.status === status && previous?.alert_hash === alertHash;
  const previousSignal = previous?.signal_hygiene || {};
  const repeatCount = sameSignal ? Number(previousSignal.repeat_count || 1) + 1 : 1;
  const stableSince = sameSignal
    ? previousSignal.stable_since || previous.checked_at || now.toISOString()
    : now.toISOString();
  const severity = signalSeverity(status, facts);
  const humanLabel = status === "CODEXA_READY"
    ? "Codexa ready"
    : status === "CODEXA_RECEIPTS_ONLY"
      ? "Codexa receipts only"
      : status === "CODEXA_COMMAND_ONLY"
        ? "Codexa command rail only"
        : "Codexa unreachable";
  return {
    version: "orangebox-signal-hygiene/v1",
    severity,
    human_label: humanLabel,
    repeat_count: repeatCount,
    stable_since: stableSince,
    notify_reason: notificationReason(previous, status, now),
    next_popup_after: nextPopupAfter(previous, status, now),
    cooldown_minutes: cooldownMinutes,
    popup_requested: wantsPopup,
    alert_fatigue_policy: "Popup only on status change or cooldown. Health/reality receipts keep logging every run.",
    operator_action_required: status !== "CODEXA_READY" && !facts.remoteExecutionAvailable,
    local_basic_install_blocked: false,
    full_system_green_blocked: status !== "CODEXA_READY",
    summary_line: `${humanLabel}; local Ops can continue; full two-machine routing remains gated.`,
  };
}

async function main() {
  const startedAt = new Date();
  const probeEntries = [
    ["direct_command_rail_8097", `http://${directIp}:8097/health`],
    ["direct_wiki_bridge_8098", `http://${directIp}:8098/health`],
    ["direct_receipts_8099", `http://${directIp}:8099/`],
    ["direct_ollama_11434", `http://${directIp}:11434/api/tags`],
    ["lan_command_rail_8097", `http://${lanIp}:8097/health`],
    ["lan_receipts_8099", `http://${lanIp}:8099/`],
    ["lan_ollama_11434", `http://${lanIp}:11434/api/tags`],
  ];
  const probes = Object.fromEntries(
    await Promise.all(probeEntries.map(async ([id, url]) => [id, await probe(url)])),
  );
  const remoteControlEntries = [
    ["direct_rdp_3389", directIp, 3389],
    ["direct_winrm_5985", directIp, 5985],
    ["direct_smb_445", directIp, 445],
    ["lan_rdp_3389", lanIp, 3389],
    ["lan_winrm_5985", lanIp, 5985],
    ["lan_smb_445", lanIp, 445],
  ];
  const remote_control = Object.fromEntries(
    await Promise.all(remoteControlEntries.map(async ([id, host, port]) => [id, await probeTcp(host, port)])),
  );

  const commandOk = probes.direct_command_rail_8097.ok || probes.lan_command_rail_8097.ok;
  const receiptsOk = probes.direct_receipts_8099.ok || probes.lan_receipts_8099.ok;
  const ollamaOk = probes.direct_ollama_11434.ok || probes.lan_ollama_11434.ok;
  const wikiOk = probes.direct_wiki_bridge_8098.ok;
  const rdpOk = remote_control.direct_rdp_3389.ok || remote_control.lan_rdp_3389.ok;
  const winrmOk = remote_control.direct_winrm_5985.ok || remote_control.lan_winrm_5985.ok;
  const smbPortOpen = remote_control.direct_smb_445.ok || remote_control.lan_smb_445.ok;
  const recoveryArtifacts = {
    obox2_setup_pack: fileSummary(path.join(downloadsRoot, "Orangebox_V2_Internal_Setup_Pack.zip")),
    rail_recovery_pack: fileSummary(path.join(dataRoot, "exports", "codexa-rail-recovery-pack-WINDOWS-NATIVE.zip")),
    rail_recovery_dir: fileSummary(path.join(dataRoot, "exports", "codexa-rail-recovery-pack", "RUN_ON_CODEXA_AS_ADMIN.cmd")),
  };
  const smbStageLatest = readJson(path.join(dataRoot, "codexa-smb-stage", "latest-codexa-smb-stage.json"));
  const status = commandOk && ollamaOk
    ? "CODEXA_READY"
    : receiptsOk
      ? "CODEXA_RECEIPTS_ONLY"
      : commandOk
        ? "CODEXA_COMMAND_ONLY"
        : "CODEXA_UNREACHABLE";
  const ok = status === "CODEXA_READY";
  const message = buildMessage(status, probes);
  const previous = readJson(statePath);

  const nextActions = [];
  if (!commandOk) nextActions.push("On Codexa/AI Box, unzip the OBOX2 setup pack and run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd as Administrator. It applies always-on power, installs/verifies the embedded backend payload, starts the rail, runs doctors, and writes C:\\AtomEons\\ai-box\\receipts\\obox2-start-here-latest.json plus obox2-backend-install-latest.json.");
  if (!commandOk && !recoveryArtifacts.rail_recovery_pack.exists) nextActions.push("Run npm.cmd run codexa:rail-pack on this cockpit to generate the small Windows-native rail recovery zip.");
  if (!commandOk && recoveryArtifacts.rail_recovery_pack.exists) nextActions.push(`Rail recovery zip is ready at ${recoveryArtifacts.rail_recovery_pack.path}; copy it to Codexa and run RUN_ON_CODEXA_AS_ADMIN.cmd as Administrator if the larger OBOX2 pack is inconvenient.`);
  if (!commandOk && recoveryArtifacts.obox2_setup_pack.exists) nextActions.push(`Full OBOX2 setup pack is ready at ${recoveryArtifacts.obox2_setup_pack.path}. Manual fallback: RUN_CODEXA_POWER_OPTIMIZER_AS_ADMIN.cmd, RUN_CODEXA_POWER_DOCTOR.cmd, RUN_INSTALL_ORANGEBOX_BACKEND_ON_CODEXA_AS_ADMIN.cmd, then RUN_START_CODEXA_RAIL_AS_ADMIN.cmd.`);
  if (!ollamaOk) nextActions.push("After rail proof is green, run RUN_INSTALL_CORE_LLMS_ON_CODEXA.cmd and RUN_MODEL_DOCTOR_ON_CODEXA.cmd, or rerun START_HERE_OBOX2_INTERNAL.ps1 with -Mode core.");
  if (receiptsOk && !commandOk) nextActions.push("Receipts/dashboard rail is alive; focus on the 8097 command rail service before model pulls.");
  if (!commandOk && !rdpOk && !winrmOk) nextActions.push("RDP and WinRM are not reachable from this cockpit; Codexa cannot be repaired remotely from here until one access path is opened.");
  if (!commandOk && smbPortOpen && !winrmOk) nextActions.push("SMB port is visible on the LAN, but no remote execution path is proven. Do not call a repair complete until the 8097 rail answers.");
  if (!commandOk && smbPortOpen && !smbStageLatest?.status) nextActions.push("Run npm.cmd run codexa:smb-stage to prove whether SMB can stage recovery artifacts before relying on file-copy repair.");
  if (!commandOk && smbStageLatest?.status === "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS") nextActions.push("SMB share access is denied/unavailable from this cockpit; use OBOX2 directly on Codexa or restore RDP/WinRM/8097.");
  if (!commandOk && smbStageLatest?.stage_ready) nextActions.push("SMB staging has an accessible target, but it is file delivery only. It still requires operator-approved staging and local execution on Codexa.");
  if (ok) nextActions.push("Run npm.cmd run trilane:doctor and the Codexa model doctor before promoting heavy-lane routing.");
  const alertHash = shortHash(`${status}\n${message}\n${JSON.stringify(nextActions)}`);
  const signalHygiene = buildSignalHygiene(previous, status, alertHash, {
    receiptsOk,
    remoteControlAvailable: rdpOk || winrmOk,
    remoteExecutionAvailable: winrmOk,
    smbPortOpen,
  }, startedAt);
  const notify = shouldNotify(previous, status, startedAt);
  const popup = notify ? await showPopup(`Orangebox Codexa Alert: ${status}`, message) : { ok: false, mode: signalHygiene.notify_reason };

  const result = {
    ok,
    version: "orangebox-codexa-alert-doctor/v2",
    status,
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    hosts: { direct_ip: directIp, lan_ip: lanIp },
    probes,
    remote_control,
    command_rail_reachable: commandOk,
    wiki_bridge_reachable: wikiOk,
    receipts_reachable: receiptsOk,
    ollama_reachable: ollamaOk,
    remote_control_available: rdpOk || winrmOk,
    remote_execution_available: winrmOk,
    smb_port_visible: smbPortOpen,
    smb_stage: smbStageLatest ? {
      status: smbStageLatest.status || null,
      stage_ready: smbStageLatest.stage_ready ?? null,
      stage_written: smbStageLatest.stage_written ?? null,
      preferred_target: smbStageLatest.preferred_target?.path || null,
    } : null,
    recovery_artifacts: recoveryArtifacts,
    popup: {
      requested: wantsPopup,
      forced: forcePopup,
      notified: notify && popup.ok,
      result: popup,
      cooldown_minutes: cooldownMinutes,
    },
    message,
    next_actions: nextActions,
    alert_hash: alertHash,
    signal_hygiene: signalHygiene,
    not_a_failure_of_local_basic_install: !ok,
  };

  if (notify) result.last_notified_at = startedAt.toISOString();
  else if (previous?.last_notified_at) result.last_notified_at = previous.last_notified_at;

  const latestPath = path.join(alertRoot, "latest-codexa-alert.json");
  await writeJson(latestPath, result);
  await writeJson(statePath, result);
  if (wantsReceipt || notify) {
    const receiptPath = path.join(receiptDir, `orangebox-codexa-alert-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
    await writeJson(statePath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : status);
}

await main();
