#!/usr/bin/env node
/*
  codexa-smb-stage-doctor.mjs

  Verifies whether the cockpit can stage Orangebox recovery artifacts to Codexa
  over SMB. Default mode is read/probe only: no remote writes, no credential
  prompts, and no claim of execution. Use --stage --operator-approved to copy
  artifacts into an already accessible share.
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
const wantsStage = args.has("--stage");
const operatorApproved = args.has("--operator-approved");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const reportRoot = path.join(dataRoot, "codexa-smb-stage");
const downloadsRoot = path.join(userRoot, "Downloads");
const directIp = process.env.ORANGEBOX_CODEXA_DIRECT_IP || process.env.ORANGEBOX_AI_BOX_DIRECT_IP || "10.0.99.1";
const lanIp = process.env.ORANGEBOX_CODEXA_IP || process.env.ORANGEBOX_AI_BOX_IP || "10.0.0.4";

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function psSingle(value) {
  return String(value).replace(/'/g, "''");
}

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function fileSummary(file) {
  try {
    const stat = fs.statSync(file);
    return {
      path: file,
      exists: true,
      bytes: stat.size,
      sha256: sha256File(file),
      modified_at: stat.mtime.toISOString(),
    };
  } catch {
    return { path: file, exists: false, bytes: 0, sha256: null, modified_at: null };
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function probeTcp(host, port, timeoutMs = 1000) {
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

async function netView(host) {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync("net.exe", ["view", `\\\\${host}`], {
      timeout: 12_000,
      windowsHide: true,
      maxBuffer: 256_000,
    });
    const text = `${stdout}\n${stderr}`.trim();
    const shares = [];
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([^\s]+)\s+Disk\s+/i);
      if (match) shares.push(match[1]);
    }
    return {
      ok: true,
      host,
      ms: Date.now() - started,
      shares,
      stdout_tail: stdout.slice(-2000),
      stderr_tail: stderr.slice(-1000),
    };
  } catch (error) {
    return {
      ok: false,
      host,
      ms: Date.now() - started,
      exit_code: error.code ?? null,
      stdout_tail: String(error.stdout || "").slice(-2000),
      stderr_tail: String(error.stderr || error.message || "").slice(-2000),
    };
  }
}

async function testPath(uncPath) {
  const started = Date.now();
  const command = `$ErrorActionPreference='SilentlyContinue'; if (Test-Path -LiteralPath '${psSingle(uncPath)}') { 'TRUE' } else { 'FALSE' }`;
  try {
    const { stdout, stderr } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
      timeout: 8_000,
      windowsHide: true,
      maxBuffer: 64_000,
    });
    return {
      path: uncPath,
      exists: String(stdout || "").trim().toUpperCase() === "TRUE",
      ms: Date.now() - started,
      stderr_tail: String(stderr || "").slice(-500),
    };
  } catch (error) {
    return {
      path: uncPath,
      exists: false,
      ms: Date.now() - started,
      error: error.message,
      stderr_tail: String(error.stderr || "").slice(-500),
    };
  }
}

function candidatePaths(host) {
  return [
    { host, role: "public_users", path: `\\\\${host}\\Users\\Public`, preferred: true },
    { host, role: "public_desktop", path: `\\\\${host}\\Users\\Public\\Desktop`, preferred: true },
    { host, role: "ai_box_root_share", path: `\\\\${host}\\AtomEons\\ai-box`, preferred: true },
    { host, role: "atomeons_share", path: `\\\\${host}\\AtomEons`, preferred: false },
    { host, role: "admin_public", path: `\\\\${host}\\C$\\Users\\Public`, preferred: false },
    { host, role: "admin_ai_box", path: `\\\\${host}\\C$\\AtomEons\\ai-box`, preferred: false },
  ];
}

async function stageArtifacts(targetPath, artifacts) {
  const stageId = `orangebox-recovery-${stamp()}`;
  const targetDir = path.join(targetPath, "Orangebox-Incoming", stageId);
  await fsp.mkdir(targetDir, { recursive: true });
  const copied = [];
  for (const artifact of artifacts) {
    if (!artifact.exists) continue;
    const dest = path.join(targetDir, path.basename(artifact.path));
    await fsp.copyFile(artifact.path, dest);
    copied.push({
      source: artifact.path,
      dest,
      bytes: fs.statSync(dest).size,
      sha256: sha256File(dest),
    });
  }
  const manifest = {
    version: "orangebox-codexa-smb-stage-manifest/v1",
    staged_at: new Date().toISOString(),
    target_dir: targetDir,
    copied,
    next_action: "On Codexa, open this staged folder and run RUN_START_HERE_ON_CODEXA_AS_ADMIN.cmd from the expanded OBOX2 setup pack, or use the rail recovery zip if only rail repair is needed.",
    doctrine: "SMB staging is file delivery only. It is not remote execution and it is not proof that Codexa is repaired.",
  };
  const manifestPath = path.join(targetDir, "ORANGEBOX_STAGE_MANIFEST.json");
  await writeJson(manifestPath, manifest);
  return { ok: copied.length > 0, target_dir: targetDir, copied, manifest_path: manifestPath };
}

async function main() {
  const startedAt = new Date();
  const artifacts = [
    fileSummary(path.join(downloadsRoot, "Orangebox_V2_Internal_Setup_Pack.zip")),
    fileSummary(path.join(dataRoot, "exports", "codexa-rail-recovery-pack-WINDOWS-NATIVE.zip")),
  ];
  const localArtifactsOk = artifacts.every((artifact) => artifact.exists && artifact.bytes > 0);
  const hosts = [...new Set([directIp, lanIp].filter(Boolean))];
  const smbPorts = Object.fromEntries(await Promise.all(hosts.map(async (host) => [host, await probeTcp(host, 445)])));
  const netViews = Object.fromEntries(await Promise.all(hosts.map(async (host) => [host, await netView(host)])));
  const candidateRows = (await Promise.all(
    hosts.flatMap((host) => candidatePaths(host)).map(async (candidate) => ({
      ...candidate,
      ...(await testPath(candidate.path)),
    })),
  )).sort((a, b) => Number(b.exists) - Number(a.exists) || Number(b.preferred) - Number(a.preferred));
  const accessible = candidateRows.filter((row) => row.exists);
  const preferredTarget = accessible.find((row) => row.preferred) || accessible[0] || null;
  let stageResult = null;
  const stageDenied = wantsStage && !operatorApproved;
  if (wantsStage && operatorApproved && preferredTarget) {
    try {
      stageResult = await stageArtifacts(preferredTarget.path, artifacts);
    } catch (error) {
      stageResult = { ok: false, error: error.message, target_path: preferredTarget.path };
    }
  }

  const smbVisible = Object.values(smbPorts).some((probe) => probe.ok);
  const status = stageResult?.ok
    ? "CODEXA_SMB_STAGE_WRITTEN"
    : accessible.length > 0
      ? "CODEXA_SMB_STAGE_TARGET_READY"
      : smbVisible
        ? "CODEXA_SMB_VISIBLE_NO_SHARE_ACCESS"
        : "CODEXA_SMB_NOT_VISIBLE";
  const nextActions = [];
  if (!localArtifactsOk) nextActions.push("Run npm.cmd run obox2:pack and npm.cmd run codexa:rail-pack so local recovery artifacts exist.");
  if (stageDenied) nextActions.push("Staging was requested but not approved; rerun with --stage --operator-approved if remote copy is intentionally allowed.");
  if (stageResult?.ok) nextActions.push(`Artifacts staged to ${stageResult.target_dir}. This still requires opening Codexa and running the staged launcher; SMB is not execution.`);
  if (!stageResult?.ok && preferredTarget) nextActions.push(`A readable SMB target exists at ${preferredTarget.path}. To stage files, run node ./scripts/v4/codexa-smb-stage-doctor.mjs --json --receipt --stage --operator-approved.`);
  if (!preferredTarget && smbVisible) nextActions.push("SMB port is visible but share access is denied or unavailable; use the OBOX2 zip locally on Codexa, open RDP/WinRM, or bring up command rail 8097.");
  if (!smbVisible) nextActions.push("SMB is not visible; use the OBOX2 setup pack physically/remotely on Codexa or restore RDP/WinRM/8097 rail.");

  const result = {
    ok: localArtifactsOk,
    stage_ready: accessible.length > 0,
    stage_written: Boolean(stageResult?.ok),
    version: "orangebox-codexa-smb-stage-doctor/v1",
    status,
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    write_mode_requested: wantsStage,
    operator_approved: operatorApproved,
    doctrine: "SMB staging can deliver files only. It does not execute repair, does not prove Codexa green, and must not replace the 8097 rail proof.",
    artifacts,
    hosts,
    smb_ports: smbPorts,
    net_view: netViews,
    candidates: candidateRows,
    preferred_target: preferredTarget,
    stage: stageResult,
    next_actions: nextActions,
  };
  const latestPath = path.join(reportRoot, "latest-codexa-smb-stage.json");
  await writeJson(latestPath, result);
  if (wantsReceipt || stageResult?.ok) {
    const receiptPath = path.join(receiptDir, `orangebox-codexa-smb-stage-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : status);
  if (!localArtifactsOk) process.exitCode = 1;
}

await main();
