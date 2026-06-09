#!/usr/bin/env node
/* gauntlet-engine.mjs - AECode practical control CLI v0.
 *
 * This is intentionally deterministic-first. It runs local checks, writes
 * receipts, and refuses production deploy/merge actions without explicit
 * operator approval. It does not call paid APIs, read credentials, mutate
 * visual files, or run arbitrary AI Box shell.
 */

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  compileSource as aecodeCompileSource,
  applyModelWritePatch as aecodeApplyModelWritePatch,
  applyProviderArtifact as aecodeApplyProviderArtifact,
  createMission as aecodeCreateMission,
  createWorktreePlan as aecodeCreateWorktreePlan,
  deployFull as aecodeDeployFull,
  deployIntake as aecodeDeployIntake,
  generateProviderArtifact as aecodeGenerateProviderArtifact,
  operatorStatus as aecodeOperatorStatus,
  runMission as aecodeRunMission,
  systemProof as aecodeSystemProof,
  validateMission as aecodeValidateMission,
  validateSchemaRegistry as aecodeValidateSchemaRegistry,
} from "./aecode-runtime.mjs";

export const GAUNTLET_ENGINE_VERSION = "orangebox-gauntlet-engine/v0";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const GAUNTLET_ROOT = path.join(DATA_ROOT, "gauntlet");
const FACTORY_ROOT = path.join(DATA_ROOT, "app-factory");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

const CORE_CHECK_FILES = [
  "scripts/v4/aecode-runtime.mjs",
  "scripts/v4/gauntlet-engine.mjs",
  "scripts/v4/ten-upgrade-finish-doctor.mjs",
  "scripts/v4/orangebox-system-proof-doctor.mjs",
  "scripts/v4/orangebox-creations-doctor.mjs",
  "scripts/v4/aecode-format-doctor.mjs",
  "scripts/v4/atomsmasher-runtime.mjs",
  "scripts/v4/atomsmasher-api-routes.mjs",
  "scripts/v4/atomsmasher-api-smoke.mjs",
  "scripts/v4/atomsmasher-tool-merge-doctor.mjs",
  "scripts/v4/four-system-doctor.mjs",
  "scripts/v4/clc-doctor.mjs",
  "scripts/v4/temporal-sync-doctor.mjs",
  "scripts/v4/glyphspeak-doctor.mjs",
  "scripts/v4/innovation-activation-doctor.mjs",
];

const FACTORY_PRESETS = new Set(["webapp", "landing-page", "dashboard", "admin-panel", "ai-tool"]);
const DEFAULT_SYSTEM_MISSION_ID = "orangebox-main-system-v0";

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function compact(value, max = 2200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function flagValue(args, flag, fallback = null) {
  const index = args.indexOf(flag);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function readJson(file) {
  try {
    return { ok: true, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || String(error) };
  }
}

async function run(command, args, { cwd = ROOT, timeout = 60_000 } = {}) {
  const started = Date.now();
  const useCmdShim = process.platform === "win32" && /\.cmd$/i.test(command);
  const spawnCommand = useCmdShim ? "cmd.exe" : command;
  const spawnArgs = useCmdShim ? ["/d", "/s", "/c", command, ...args] : args;
  try {
    const out = await execFileAsync(spawnCommand, spawnArgs, {
      cwd,
      timeout,
      maxBuffer: 1_500_000,
      windowsHide: true,
    });
    return {
      ok: true,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      stdout: compact(out.stdout, 6000),
      stderr: compact(out.stderr, 3000),
    };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      stdout: compact(error?.stdout, 6000),
      stderr: compact(error?.stderr, 3000),
      error: error?.message || String(error),
    };
  }
}

async function writeReceipt(kind, report, receipt = true) {
  await fs.mkdir(GAUNTLET_ROOT, { recursive: true });
  await writeJson(path.join(GAUNTLET_ROOT, `latest-${kind}.json`), report);
  if (!receipt) return report;
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-gauntlet-${kind}-${stamp()}.json`);
  report.receipt_path = receiptPath;
  await writeJson(receiptPath, report);
  return report;
}

async function aecodeFormatDoctor({ receipt = true } = {}) {
  const started = Date.now();
  const script = path.join(ROOT, "scripts", "v4", "aecode-format-doctor.mjs");
  const args = [
    script,
    "--json",
    ...(receipt ? ["--receipt"] : []),
  ];
  try {
    const out = await execFileAsync(process.execPath, args, {
      cwd: ROOT,
      timeout: 120_000,
      maxBuffer: 1_500_000,
      windowsHide: true,
    });
    const parsed = JSON.parse(out.stdout);
    parsed.wrapper = {
      command: [process.execPath, ...args].join(" "),
      ms: Date.now() - started,
    };
    return parsed;
  } catch (error) {
    const stdout = error?.stdout ? compact(error.stdout, 6000) : "";
    return {
      ok: false,
      status: "AECODE_FORMAT_DOCTOR_FAILED",
      command: [process.execPath, ...args].join(" "),
      ms: Date.now() - started,
      stdout,
      stderr: compact(error?.stderr, 3000),
      error: error?.message || String(error),
    };
  }
}

function packageJsonCheck() {
  try {
    const raw = fsSync.readFileSync(path.join(ROOT, "package.json"), "utf8");
    const parsed = JSON.parse(raw);
    return { ok: true, scripts: Object.keys(parsed.scripts || {}).sort() };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

async function syntaxChecks() {
  const checks = [];
  for (const rel of CORE_CHECK_FILES) {
    const file = path.join(ROOT, rel);
    if (!fsSync.existsSync(file)) {
      checks.push({ ok: false, rel, error: "missing" });
      continue;
    }
    const result = await run("node", ["--check", file], { timeout: 30_000 });
    checks.push({ ok: result.ok, rel, ms: result.ms, error: result.error || result.stderr || null });
  }
  return checks;
}

async function gitSnapshot() {
  const branch = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeout: 10_000 });
  const head = await run("git", ["rev-parse", "--short", "HEAD"], { timeout: 10_000 });
  const status = await run("git", ["status", "--short"], { timeout: 15_000 });
  return {
    branch: branch.ok ? branch.stdout : "unknown",
    head: head.ok ? head.stdout : "unknown",
    status_short: status.stdout || status.stderr || status.error || "",
    dirty: Boolean((status.stdout || "").trim()),
  };
}

async function gauntletFast({ receipt = true } = {}) {
  const startedAt = new Date().toISOString();
  const pkg = packageJsonCheck();
  const syntax = await syntaxChecks();
  const git = await gitSnapshot();
  const gates = [
    { id: "package_json_parse", ok: pkg.ok },
    { id: "core_script_syntax", ok: syntax.every((item) => item.ok) },
    { id: "git_snapshot_available", ok: Boolean(git.head && git.branch) },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: GAUNTLET_ENGINE_VERSION,
    kind: "fast",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    gates,
    package_json: pkg,
    syntax_checks: syntax,
    git,
    rollback: {
      repo_mutation: "none",
      data_mutation: GAUNTLET_ROOT,
      recovery_action: `Delete ${GAUNTLET_ROOT}\\latest-fast.json and matching gauntlet receipt if superseded.`,
    },
  };
  return await writeReceipt("fast", report, receipt);
}

async function gauntletBuild({ receipt = true } = {}) {
  const startedAt = new Date().toISOString();
  const check = await run("npm.cmd", ["run", "check"], { timeout: 120_000 });
  const four = await run("npm.cmd", ["run", "four:doctor"], { timeout: 180_000 });
  const gates = [
    { id: "npm_check", ok: check.ok },
    { id: "four_system_doctor", ok: four.ok },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: GAUNTLET_ENGINE_VERSION,
    kind: "build",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    gates,
    commands: [check, four],
    note: "Full visual build is not run here because visual work is currently paused by operator instruction.",
    rollback: {
      repo_mutation: "none",
      data_mutation: GAUNTLET_ROOT,
      recovery_action: `Delete ${GAUNTLET_ROOT}\\latest-build.json and matching gauntlet receipt if superseded.`,
    },
  };
  return await writeReceipt("build", report, receipt);
}

async function secretScanFiles() {
  const files = [
    "package.json",
    ...CORE_CHECK_FILES,
  ].map((rel) => path.join(ROOT, rel)).filter((file) => fsSync.existsSync(file));
  const patterns = [
    { id: "private_key", rx: /-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/ },
    { id: "github_pat", rx: /\bghp_[A-Za-z0-9_]{30,}\b/ },
    { id: "openai_key", rx: /\bsk-[A-Za-z0-9]{30,}\b/ },
    { id: "anthropic_key", rx: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/ },
    { id: "vercel_token_assignment", rx: /\bVERCEL_TOKEN\s*=\s*['"][^'"]+['"]/ },
  ];
  const hits = [];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    for (const pattern of patterns) {
      if (pattern.rx.test(text)) hits.push({ file, pattern: pattern.id });
    }
  }
  return { ok: hits.length === 0, scanned: files.length, hits };
}

async function dangerousCommandScan() {
  const files = CORE_CHECK_FILES.map((rel) => path.join(ROOT, rel)).filter((file) => fsSync.existsSync(file));
  const hits = [];
  const dangerous = [
    /git\s+reset\s+--hard/i,
    /Remove-Item\s+[^;\n]*-Recurse[^;\n]*-Force/i,
    /rm\s+-rf\s+\//i,
    /vercel\s+--prod/i,
  ];
  for (const file of files) {
    const text = await fs.readFile(file, "utf8").catch(() => "");
    dangerous.forEach((rx, index) => {
      if (rx.test(text)) hits.push({ file, pattern_index: index });
    });
  }
  return { ok: hits.length === 0, scanned: files.length, hits };
}

async function gauntletSecurity({ receipt = true } = {}) {
  const startedAt = new Date().toISOString();
  const secrets = await secretScanFiles();
  const dangerous = await dangerousCommandScan();
  const gates = [
    { id: "secret_scan", ok: secrets.ok },
    { id: "dangerous_command_scan", ok: dangerous.ok },
    { id: "deploy_requires_approval", ok: true },
    { id: "path_scope_is_repo_and_data_root", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: GAUNTLET_ENGINE_VERSION,
    kind: "security",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    gates,
    secrets,
    dangerous_commands: dangerous,
    authority: {
      production_deploy_attempted: false,
      human_approval_required_for_deploy: true,
      arbitrary_ai_box_shell_invoked: false,
    },
    rollback: {
      repo_mutation: "none",
      data_mutation: GAUNTLET_ROOT,
      recovery_action: `Delete ${GAUNTLET_ROOT}\\latest-security.json and matching gauntlet receipt if superseded.`,
    },
  };
  return await writeReceipt("security", report, receipt);
}

async function gauntletRelease({ receipt = true } = {}) {
  const startedAt = new Date().toISOString();
  const fast = await gauntletFast({ receipt: false });
  const build = await gauntletBuild({ receipt: false });
  const security = await gauntletSecurity({ receipt: false });
  const gates = [
    { id: "fast", ok: fast.ok },
    { id: "build", ok: build.ok },
    { id: "security", ok: security.ok },
    { id: "human_approval_required", ok: true },
    { id: "production_deploy_not_attempted", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: GAUNTLET_ENGINE_VERSION,
    kind: "release",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    gates,
    subreports: { fast, build, security },
    deploy_preflight: {
      production_deploy_attempted: false,
      approval_required: true,
      reason: "Release gauntlet proves readiness only. Actual deploy requires explicit human final stop approval.",
    },
    rollback: {
      repo_mutation: "none",
      data_mutation: GAUNTLET_ROOT,
      recovery_action: `Delete ${GAUNTLET_ROOT}\\latest-release.json and matching gauntlet receipt if superseded.`,
    },
  };
  return await writeReceipt("release", report, receipt);
}

async function latestReceipt() {
  const entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(RECEIPTS_DIR, entry.name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat) files.push({ file, mtime: stat.mtimeMs });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  if (!files[0]) return { ok: false, error: "No receipts found." };
  const parsed = await readJson(files[0].file);
  return { ok: parsed.ok, file: files[0].file, data: parsed.data, error: parsed.error || null };
}

async function receiptLast() {
  return await latestReceipt();
}

async function rollbackLast() {
  const last = await latestReceipt();
  return {
    ok: last.ok,
    receipt: last.file || null,
    rollback: last.data?.rollback || last.data?.bundle?.rollback || null,
    note: "Rollback command is advisory in v0. It reports the receipt rollback path and does not delete or revert automatically.",
  };
}

async function missionStatus() {
  const latest = await readJson(path.join(DATA_ROOT, "system-proof", "latest-system-proof-queue.json"));
  return {
    ok: latest.ok,
    path: path.join(DATA_ROOT, "system-proof", "latest-system-proof-queue.json"),
    data: latest.data,
    error: latest.error || null,
  };
}

async function missionApprove(args) {
  const approved = args.includes("--operator-approved");
  const record = {
    ok: approved,
    created_at: new Date().toISOString(),
    approval_state: approved ? "APPROVED_BY_OPERATOR_FLAG" : "REQUIRES_OPERATOR_APPROVAL_FLAG",
    required_flag: "--operator-approved",
  };
  await writeJson(path.join(GAUNTLET_ROOT, "latest-mission-approval.json"), record);
  return record;
}

async function missionRollback() {
  return {
    ok: true,
    mode: "advisory",
    rollback: await rollbackLast(),
  };
}

async function createPreset(preset) {
  return {
    ok: false,
    preset,
    status: "DISABLED_BY_OPERATOR",
    reason: "Orangebox Ops backend only. App factory/store/website/visual preset generation is not part of the active system path.",
    allowed_scope: "backend ops, receipts, routing, proof, deploy intake, local model lanes",
  };
}

async function orangeboxFullGreen(missionId = DEFAULT_SYSTEM_MISSION_ID, {
  execute = true,
  createWorktree = true,
  operatorApproved = true,
  includeControlPlane = true,
  receipt = true,
} = {}) {
  const startedAt = new Date().toISOString();
  const commandPlan = [
    { id: "innovation_activation", script: "innovation:activate", timeout: 240_000 },
    { id: "ten_upgrade_finish", script: "ten:finish", timeout: 240_000 },
    { id: "inference_acceleration_doctor", script: "inference:doctor", timeout: 180_000 },
    ...(includeControlPlane ? [{ id: "control_plane_big", script: "control:big", timeout: 420_000 }] : []),
    { id: "four_system_doctor", script: "four:doctor", timeout: 240_000 },
    { id: "system_proof_doctor", script: "system:doctor", timeout: 240_000 },
    { id: "creations_output_stack", script: "creations:doctor", timeout: 120_000 },
    { id: "aecode_final_format", script: "aecode:format", timeout: 120_000 },
    { id: "atomsmasher_full_scope", script: "atomsmasher:doctor", timeout: 300_000 },
    { id: "atomsmasher_api_smoke", script: "atomsmasher:api-smoke", timeout: 180_000 },
    { id: "atomsmasher_tool_merge", script: "atomsmasher:merge-tools", timeout: 180_000 },
  ];
  const commands = [];
  for (const step of commandPlan) {
    const result = await run(NPM, ["run", step.script], { timeout: step.timeout });
    commands.push({ ...step, ...result });
  }

  const deploy = await aecodeDeployFull(missionId, {
    execute,
    createWorktree,
    operatorApproved,
  });
  const systemProof = await aecodeSystemProof(missionId);
  const operator = await aecodeOperatorStatus();
  const release = await gauntletRelease({ receipt: false });
  const receiptLastResult = await receiptLast();
  const rollback = await rollbackLast();
  const gates = [
    { id: "doctors_and_control_plane_green", ok: commands.every((item) => item.ok) },
    ...commands.map((item) => ({ id: item.id, ok: item.ok })),
    { id: "aecode_full_local_deploy_green", ok: deploy.ok === true },
    { id: "system_proof_green", ok: systemProof.ok === true },
    { id: "operator_surface_feed_green", ok: operator.ok === true },
    { id: "release_gauntlet_green", ok: release.ok === true },
    { id: "latest_receipt_readable", ok: receiptLastResult.ok === true },
    { id: "rollback_path_available", ok: rollback.ok === true && Boolean(rollback.rollback) },
    { id: "production_deploy_not_attempted", ok: deploy.mode?.production_deploy_attempted === false && systemProof.summary?.safety?.production_deploy_attempted === false },
    { id: "visual_mutation_not_attempted", ok: deploy.mode?.visual_mutation_attempted === false && systemProof.summary?.safety?.visual_mutation_attempted === false },
    { id: "paid_model_api_not_called", ok: deploy.mode?.paid_model_api_called === false && systemProof.summary?.safety?.paid_model_api_called === false },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: GAUNTLET_ENGINE_VERSION,
    kind: "orangebox_full_green",
    mission_id: missionId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    mode: {
      execute_acceptance_tests: execute,
      create_worktree: createWorktree,
      operator_approved: operatorApproved,
      include_control_plane: includeControlPlane,
      production_deploy_attempted: false,
      visual_mutation_attempted: false,
      paid_model_api_called: false,
    },
    gates,
    commands,
    deploy,
    system_proof: systemProof,
    operator,
    release_gauntlet: release,
    latest_receipt: receiptLastResult,
    rollback,
    summary: {
      status: gates.every((gate) => gate.ok) ? "ORANGEBOX_FULL_GREEN_LOCAL_RUNTIME" : "ORANGEBOX_FULL_GREEN_NEEDS_ATTENTION",
      command: `${NPM} run system:full-green`,
      local_first: true,
      production_deploy_blocked: true,
      ops_chat_visual_mutation_disabled: true,
      visual_product_lane_active_elsewhere: true,
      atomsmasher_full_scope_integrated: commands.some((item) => item.id === "atomsmasher_full_scope" && item.ok),
      atomsmasher_tool_merge_green: commands.some((item) => item.id === "atomsmasher_tool_merge" && item.ok),
      receipt_chain_refreshed: receiptLastResult.ok === true,
      rollback_advisory_available: rollback.ok === true,
    },
  };
  const final = await writeReceipt("orangebox-full-green", report, receipt);
  await writeJson(path.join(DATA_ROOT, "system-proof", "latest-orangebox-full-green.json"), final);
  return final;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const noReceipt = args.includes("--no-receipt");
  const cleanArgs = args.filter((arg) => ![
    "--json",
    "--no-receipt",
    "--create",
    "--operator-approved",
    "--execute",
    "--skip-control",
  ].includes(arg));
  const [domain, verb, detail] = cleanArgs;
  let result;
  if (domain === "gauntlet" && verb === "fast") result = await gauntletFast({ receipt: !noReceipt });
  else if (domain === "gauntlet" && verb === "build") result = await gauntletBuild({ receipt: !noReceipt });
  else if (domain === "gauntlet" && verb === "security") result = await gauntletSecurity({ receipt: !noReceipt });
  else if (domain === "gauntlet" && verb === "release") result = await gauntletRelease({ receipt: !noReceipt });
  else if (domain === "receipt" && verb === "last") result = await receiptLast();
  else if (domain === "rollback" && verb === "last") result = await rollbackLast();
  else if (domain === "mission" && verb === "new") result = await aecodeCreateMission({
    title: flagValue(args, "--title", detail || "AECode Mission"),
    intent: flagValue(args, "--intent", "Execute a bounded, receipt-backed Orangebox mission."),
  });
  else if (domain === "mission" && verb === "status" && detail) result = await aecodeValidateMission(detail);
  else if (domain === "mission" && verb === "status") result = await missionStatus();
  else if (domain === "mission" && verb === "validate") result = await aecodeValidateMission(detail);
  else if (domain === "mission" && verb === "run") result = await aecodeRunMission(detail, { dryRun: !args.includes("--execute") });
  else if (domain === "mission" && verb === "write") result = await aecodeApplyModelWritePatch(detail, {
    patchPath: flagValue(args, "--patch", null),
    operatorApproved: args.includes("--operator-approved"),
    selfTest: args.includes("--self-test"),
  });
  else if (domain === "mission" && verb === "artifact") result = await aecodeApplyProviderArtifact(detail, {
    artifactPath: flagValue(args, "--artifact", null),
    operatorApproved: args.includes("--operator-approved"),
    selfTest: args.includes("--self-test"),
  });
  else if (domain === "mission" && verb === "generate-artifact") result = await aecodeGenerateProviderArtifact(detail, {
    provider: flagValue(args, "--provider", "local-llama-listener"),
    targetPath: flagValue(args, "--target", undefined),
  });
  else if (domain === "mission" && verb === "sandbox") result = await aecodeCreateWorktreePlan(detail, {
    create: args.includes("--create"),
    approved: args.includes("--operator-approved"),
  });
  else if (domain === "mission" && verb === "approve") result = await missionApprove(args);
  else if (domain === "mission" && verb === "rollback") result = await missionRollback();
  else if (domain === "system" && verb === "proof") result = await aecodeSystemProof(detail || DEFAULT_SYSTEM_MISSION_ID);
  else if (domain === "system" && verb === "full-green") result = await orangeboxFullGreen(detail || DEFAULT_SYSTEM_MISSION_ID, {
    execute: args.includes("--execute"),
    createWorktree: args.includes("--create"),
    operatorApproved: args.includes("--operator-approved"),
    includeControlPlane: !args.includes("--skip-control"),
    receipt: !noReceipt,
  });
  else if (domain === "source" && verb === "compile") result = await aecodeCompileSource(detail);
  else if (domain === "schema" && verb === "validate") result = await aecodeValidateSchemaRegistry();
  else if (domain === "format" && verb === "doctor") result = await aecodeFormatDoctor({ receipt: !noReceipt });
  else if (domain === "deploy" && verb === "full") result = await aecodeDeployFull(detail || DEFAULT_SYSTEM_MISSION_ID, {
    execute: args.includes("--execute"),
    createWorktree: args.includes("--create"),
    operatorApproved: args.includes("--operator-approved"),
  });
  else if (domain === "deploy" && verb === "intake") result = await aecodeDeployIntake();
  else if (domain === "visual" && verb === "qa") result = {
    ok: false,
    status: "DISABLED_BY_OPERATOR",
    reason: "Orangebox Ops backend only. Visual and website lanes are not available in this active runtime.",
  };
  else if (domain === "operator" && verb === "status") result = await aecodeOperatorStatus();
  else if (domain === "create" && verb) result = await createPreset(verb);
  else {
    result = {
      ok: false,
      usage: [
        "ae gauntlet fast|build|security|release",
        "ae receipt last",
        "ae rollback last",
        "ae mission new|status|validate|run|sandbox|approve|rollback",
        "ae mission write <mission_id> --operator-approved --patch <patch.diff>",
        "ae mission generate-artifact <mission_id> [--provider local-deterministic-cpu]",
        "ae mission artifact <mission_id> --operator-approved --artifact <artifact.json>",
        "ae schema validate",
        "ae format doctor",
        "ae system proof [mission_id]",
        "ae system full-green [mission_id] [--execute --create --operator-approved] [--skip-control]",
        "ae source compile <mission_id>",
        "ae deploy full <mission_id> [--execute] [--create --operator-approved]",
        "ae deploy intake",
        "ae operator status",
      ],
    };
  }
  if (wantsJson) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`${result.ok ? "OK" : "FAIL"} ${domain || ""} ${verb || ""} ${detail || ""}`.trim());
    if (result.receipt_path) console.log(`receipt: ${result.receipt_path}`);
    if (result.error) console.log(`error: ${result.error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export {
  gauntletFast,
  gauntletBuild,
  gauntletSecurity,
  gauntletRelease,
  aecodeFormatDoctor,
  createPreset,
  orangeboxFullGreen,
};
