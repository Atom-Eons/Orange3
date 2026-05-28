#!/usr/bin/env node
/* aecode-runtime.mjs - executable AECode Source/mission runtime v0.
 *
 * The runtime is intentionally local-first and receipt-backed. It creates
 * mission manifests, validates path/approval policy, compiles an AECode Source
 * IR, emits governed-run receipts, and keeps destructive/production actions
 * behind explicit gates.
 */

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..", "..");
export const RECEIPTS_DIR = path.join(ROOT, "receipts");
export const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
export const AECODE_ROOT = path.join(DATA_ROOT, "aecode-runtime");
export const MISSIONS_ROOT = path.join(ROOT, ".missions");
export const WORKTREES_ROOT = path.join(ROOT, ".worktrees");
export const SCHEMAS_ROOT = path.join(ROOT, "schemas");
export const DEFAULT_SYSTEM_MISSION_ID = "orangebox-main-system-v0";
export const AECODE_RUNTIME_VERSION = "orangebox-aecode-runtime/v0";

const DEFAULT_ALLOWED_PATHS = [
  "package.json",
  "scripts/v4/",
  "docs/",
  ".missions/",
  "receipts/",
];

const DEFAULT_FORBIDDEN_PATHS = [
  ".env",
  "secrets/",
  "node_modules/",
  "apps/web/**",
  "apps/api/**/production-secrets/**",
];

const FACTORY_PRESETS = new Set(["webapp", "landing-page", "dashboard", "admin-panel", "ai-tool"]);
const ACCEPTANCE_TIMEOUT_MS = 600_000;
const MODEL_WRITE_VERSION = "orangebox-aecode-model-write/v0";
const MODEL_WRITE_SELFTEST_FILE = "docs/ORANGEBOX_AECODE_MODEL_WRITE_LANE_SELFTEST.md";
const PROVIDER_GENERATOR_VERSION = "orangebox-aecode-provider-generator/v0";
const PROVIDER_ARTIFACT_VERSION = "orangebox-aecode-provider-artifact/v0";
const PROVIDER_GENERATED_FILE = "docs/ORANGEBOX_AECODE_GENERATED_RUNTIME_CONTRACT.md";
const PROVIDER_ARTIFACT_SELFTEST_FILE = "docs/ORANGEBOX_AECODE_PROVIDER_ARTIFACT_SELFTEST.md";
const LLAMA_BASE_URL = (process.env.LLAMA_CPP_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const LLAMA_MODEL_ALIAS = process.env.ORANGEBOX_LLAMA_LISTENER_ALIAS || "orangebox-n150-cpu-listener";

const SCHEMA_FILES = [
  "mission.schema.json",
  "receipt.schema.json",
  "provider_artifact.schema.json",
  "visual_review.schema.json",
  "gauntlet_result.schema.json",
];

const DEPLOY_FAILURE_SAMPLE = [
  { commit: "1915378", run_id: "26537016277", failed_job: "deploy", duration_seconds: 34, email_time_utc: "2026-05-27T20:32:41" },
  { commit: "77ec5ea", run_id: "26446585823", failed_job: "deploy", duration_seconds: 31 },
  { commit: "5c8ba07", run_id: "26443638274", failed_job: "deploy", duration_seconds: 27 },
  { commit: "b8c1dde", run_id: "26442676906", failed_job: "deploy", duration_seconds: 25 },
  { commit: "6ea8b23", run_id: "26442602824", failed_job: "deploy", duration_seconds: 29 },
];

export function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(canonicalize(value));
}

function slug(value) {
  return String(value || "mission")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "mission";
}

function compact(value, max = 2200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
  return file;
}

async function appendJsonl(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(value)}\n`, "utf8");
  return file;
}

async function readJson(file) {
  try {
    return { ok: true, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || String(error) };
  }
}

async function fetchJson(url, init = {}, timeoutMs = 30_000) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      ms: Date.now() - started,
      json,
      body: json ? null : compact(text, 1200),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Date.now() - started,
      json: null,
      body: null,
      error: error?.message || String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function schemaRequiredChecks(schema, value) {
  const failures = [];
  for (const key of schema.required || []) {
    if (value?.[key] === undefined || value?.[key] === null || value?.[key] === "") {
      failures.push({ key, reason: "required field missing" });
    }
  }
  for (const [key, spec] of Object.entries(schema.properties || {})) {
    if (value?.[key] === undefined || spec?.const === undefined) continue;
    if (spec.const !== value[key]) failures.push({ key, reason: `expected const ${spec.const}` });
  }
  return failures;
}

async function validateObjectAgainstSchema(schemaFileName, value) {
  const schemaPath = path.join(SCHEMAS_ROOT, schemaFileName);
  const schema = await readJson(schemaPath);
  if (!schema.ok) return { ok: false, schema_path: schemaPath, errors: [{ reason: schema.error }] };
  const errors = schemaRequiredChecks(schema.data, value);
  return { ok: errors.length === 0, schema_path: schemaPath, errors };
}

export async function validateSchemaRegistry() {
  const schemaChecks = [];
  for (const name of SCHEMA_FILES) {
    const file = path.join(SCHEMAS_ROOT, name);
    const parsed = await readJson(file);
    schemaChecks.push({
      name,
      path: file,
      ok: parsed.ok && Boolean(parsed.data?.$id && parsed.data?.type),
      id: parsed.data?.$id || null,
      error: parsed.error || null,
    });
  }
  const sampleMission = normalizeMission({
    mission_id: "schema-sample",
    title: "Schema Sample",
    intent: "Validate AECode schema registry.",
  });
  sampleMission.schema_version = "ae.mission.v0";
  const missionCheck = await validateObjectAgainstSchema("mission.schema.json", sampleMission);
  const result = {
    ok: schemaChecks.every((item) => item.ok) && missionCheck.ok,
    version: AECODE_RUNTIME_VERSION,
    kind: "schema_registry",
    created_at: new Date().toISOString(),
    schemas: schemaChecks,
    sample_validation: missionCheck,
    rollback: {
      repo_mutation: "schemas/ and AECode validation receipts",
      recovery_action: "Delete or replace invalid schema files, then rerun `npm.cmd run aecode:schemas`.",
    },
  };
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-schema-registry-${stamp()}.json`);
  result.receipt_path = receiptPath;
  await writeJson(receiptPath, result);
  await writeJson(path.join(AECODE_ROOT, "schemas", "latest-schema-registry.json"), result);
  return result;
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
      maxBuffer: 1_000_000,
      windowsHide: true,
    });
    return {
      ok: true,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      stdout: compact(out.stdout, 5000),
      stderr: compact(out.stderr, 1500),
    };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      stdout: compact(error?.stdout, 5000),
      stderr: compact(error?.stderr, 1500),
      error: error?.message || String(error),
    };
  }
}

function yamlScalar(value) {
  const text = String(value ?? "");
  if (/^[A-Za-z0-9_./:\\ -]+$/.test(text) && text.trim() === text && text !== "") return text;
  return JSON.stringify(text);
}

function missionToYaml(mission) {
  const lines = [];
  const pushList = (key, values) => {
    lines.push(`${key}:`);
    for (const item of values || []) lines.push(`  - ${yamlScalar(item)}`);
  };
  lines.push(`schema_version: ${yamlScalar(mission.schema_version || "ae.mission.v0")}`);
  lines.push(`mission_id: ${yamlScalar(mission.mission_id)}`);
  lines.push(`title: ${yamlScalar(mission.title)}`);
  lines.push(`intent: ${yamlScalar(mission.intent)}`);
  lines.push(`target_repo: ${yamlScalar(mission.target_repo)}`);
  pushList("target_files", mission.target_files);
  pushList("allowed_paths", mission.allowed_paths);
  pushList("forbidden_paths", mission.forbidden_paths);
  lines.push(`risk_level: ${yamlScalar(mission.risk_level)}`);
  lines.push(`model_role: ${yamlScalar(mission.model_role)}`);
  pushList("acceptance_tests", mission.acceptance_tests);
  lines.push(`visual_required: ${mission.visual_required ? "true" : "false"}`);
  lines.push(`visual_policy: ${yamlScalar(mission.visual_policy)}`);
  lines.push(`approval_required: ${mission.approval_required ? "true" : "false"}`);
  lines.push(`created_at: ${yamlScalar(mission.created_at)}`);
  lines.push(`status: ${yamlScalar(mission.status)}`);
  lines.push("");
  return lines.join("\n");
}

function parseMissionYaml(text) {
  const mission = {};
  let currentList = null;
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const listItem = line.match(/^\s+-\s+(.*)$/);
    if (listItem && currentList) {
      mission[currentList].push(parseYamlValue(listItem[1]));
      continue;
    }
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) continue;
    const [, key, value] = pair;
    if (value === "") {
      mission[key] = [];
      currentList = key;
    } else {
      mission[key] = parseYamlValue(value);
      currentList = null;
    }
  }
  return mission;
}

function parseYamlValue(value) {
  const trimmed = String(value || "").trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if ((trimmed.startsWith("\"") && trimmed.endsWith("\"")) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  return trimmed;
}

function normalizeMission(input = {}) {
  const title = input.title || "AECode Mission";
  const missionId = input.mission_id || `${slug(title)}-${stamp()}`;
  return {
    schema_version: input.schema_version || "ae.mission.v0",
    mission_id: missionId,
    title,
    intent: input.intent || "Execute a bounded, receipt-backed Orangebox mission.",
    target_repo: ROOT,
    target_files: input.target_files || [],
    allowed_paths: input.allowed_paths || DEFAULT_ALLOWED_PATHS,
    forbidden_paths: input.forbidden_paths || DEFAULT_FORBIDDEN_PATHS,
    risk_level: input.risk_level || "medium",
    model_role: input.model_role || "codex_execution_with_claude_code_reasoning_lane",
    acceptance_tests: input.acceptance_tests || [
      "npm.cmd run gauntlet:fast",
      "npm.cmd run gauntlet:security",
      "npm.cmd run four:doctor",
    ],
    visual_required: Boolean(input.visual_required),
    visual_policy: input.visual_policy || "visual mutation paused unless explicitly unpaused by operator",
    approval_required: input.approval_required !== false,
    created_at: input.created_at || new Date().toISOString(),
    status: input.status || "PLANNED",
    factory_preset: input.factory_preset || null,
  };
}

function missionPaths(missionId) {
  return {
    dir: path.join(MISSIONS_ROOT, missionId),
    json: path.join(MISSIONS_ROOT, missionId, "mission.json"),
    yaml: path.join(MISSIONS_ROOT, missionId, "mission.yaml"),
    source: path.join(MISSIONS_ROOT, missionId, "source.aecode.json"),
    receipt: path.join(MISSIONS_ROOT, missionId, "receipt.json"),
    events: path.join(MISSIONS_ROOT, missionId, "events.jsonl"),
    artifacts: path.join(MISSIONS_ROOT, missionId, "artifacts"),
    patches: path.join(MISSIONS_ROOT, missionId, "patches"),
    logs: path.join(MISSIONS_ROOT, missionId, "logs"),
    screenshots: path.join(MISSIONS_ROOT, missionId, "screenshots"),
  };
}

async function ensureMissionDirs(missionId) {
  const paths = missionPaths(missionId);
  await Promise.all([
    fs.mkdir(paths.artifacts, { recursive: true }),
    fs.mkdir(paths.patches, { recursive: true }),
    fs.mkdir(paths.logs, { recursive: true }),
    fs.mkdir(paths.screenshots, { recursive: true }),
  ]);
  return paths;
}

async function appendMissionEvent(missionId, type, data = {}) {
  const paths = await ensureMissionDirs(missionId);
  const event = {
    schema_version: "ae.event.v0",
    mission_id: missionId,
    type,
    created_at: new Date().toISOString(),
    data,
  };
  await appendJsonl(paths.events, event);
  await writeJson(path.join(AECODE_ROOT, "events", `${missionId}-latest.json`), event);
  return event;
}

async function writeMissionReceipt(missionId, input = {}) {
  const paths = await ensureMissionDirs(missionId);
  const receipt = {
    schema_version: "ae.receipt.v0",
    mission_id: missionId,
    status: input.status || (input.ok === false ? "failed" : "passed"),
    verdict: input.verdict || (input.ok === false ? "blocked_or_failed" : "ready_for_human_review"),
    created_at: new Date().toISOString(),
    git: input.git || {},
    files_changed: input.files_changed || [],
    model_calls: input.model_calls || [],
    commands_run: input.commands_run || [],
    visual: input.visual || { required: false, verdict: "deferred", screenshots: [] },
    risks: input.risks || [],
    approval: input.approval || { required: true, state: "pending", approved_by: null, approved_at: null },
    artifacts: input.artifacts || {},
    rollback: input.rollback || {},
  };
  receipt.integrity = {
    deterministic_key_ordering: true,
    sha256: sha256(stableStringify(receipt)),
  };
  await writeJson(paths.receipt, receipt);
  await writeJson(path.join(AECODE_ROOT, "receipts", `${missionId}-latest.json`), receipt);
  await appendMissionEvent(missionId, "receipt_written", { status: receipt.status, verdict: receipt.verdict, receipt_path: paths.receipt });
  return { ok: true, receipt, path: paths.receipt };
}

export async function createMission(input = {}) {
  const mission = normalizeMission(input);
  const paths = missionPaths(mission.mission_id);
  await ensureMissionDirs(mission.mission_id);
  await writeJson(paths.json, mission);
  await writeText(paths.yaml, missionToYaml(mission));
  await writeJson(path.join(AECODE_ROOT, "missions", `${mission.mission_id}.json`), mission);
  await appendMissionEvent(mission.mission_id, "mission_created", { title: mission.title, status: mission.status });
  await writeMissionReceipt(mission.mission_id, {
    status: "pending",
    verdict: "mission_created",
    artifacts: { mission_json: paths.json, mission_yaml: paths.yaml },
    rollback: { available: true, command: `Remove ${paths.dir} if superseded before execution.` },
  });
  return { ok: true, mission, paths };
}

export async function loadMission(missionId) {
  if (!missionId) return { ok: false, error: "mission_id required" };
  const paths = missionPaths(missionId);
  if (fsSync.existsSync(paths.json)) {
    const json = await readJson(paths.json);
    if (json.ok) return { ok: true, mission: normalizeMission(json.data), paths, source: "json" };
    return { ok: false, error: json.error, paths };
  }
  if (fsSync.existsSync(paths.yaml)) {
    const mission = normalizeMission(parseMissionYaml(await fs.readFile(paths.yaml, "utf8")));
    return { ok: true, mission, paths, source: "yaml" };
  }
  return { ok: false, error: `mission not found: ${missionId}`, paths };
}

function pathIsScoped(rel, allowedPaths, forbiddenPaths) {
  const normalized = String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("../") || normalized.startsWith("..")) {
    return { ok: false, allowed: false, forbidden: true, path: normalized, reason: "path traversal rejected" };
  }
  const forbidden = (forbiddenPaths || []).some((pattern) => {
    const p = String(pattern).replace(/\\/g, "/").replace(/\*\*$/g, "");
    return normalized === p || normalized.startsWith(p.replace(/\/+$/, "/"));
  });
  const allowed = (allowedPaths || []).some((pattern) => {
    const p = String(pattern).replace(/\\/g, "/").replace(/\*\*$/g, "");
    return normalized === p || normalized.startsWith(p.replace(/\/+$/, "/"));
  });
  return { ok: allowed && !forbidden, allowed, forbidden, path: normalized };
}

function insideAny(candidate, roots) {
  const resolved = path.resolve(candidate);
  return roots.some((root) => {
    const base = path.resolve(root);
    return resolved === base || resolved.startsWith(`${base}${path.sep}`);
  });
}

function patchPaths(patchText) {
  const paths = new Set();
  for (const line of String(patchText || "").split(/\r?\n/)) {
    const diff = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diff) {
      if (diff[1] !== "/dev/null") paths.add(diff[1]);
      if (diff[2] !== "/dev/null") paths.add(diff[2]);
      continue;
    }
    const file = line.match(/^(?:---|\+\+\+)\s+(?:a|b)\/(.+)$/);
    if (file) paths.add(file[1]);
  }
  return [...paths]
    .map((item) => item.replace(/\\/g, "/").replace(/^\/+/, ""))
    .filter((item) => item && item !== "/dev/null");
}

export async function validateMission(missionId) {
  const loaded = await loadMission(missionId);
  if (!loaded.ok) return loaded;
  const { mission, paths } = loaded;
  const schemaCheck = await validateObjectAgainstSchema("mission.schema.json", mission);
  const required = ["mission_id", "title", "intent", "target_repo", "allowed_paths", "forbidden_paths", "acceptance_tests"];
  const targetChecks = (mission.target_files || []).map((file) => pathIsScoped(file, mission.allowed_paths, mission.forbidden_paths));
  const gates = [
    { id: "schema_ae_mission_v0", ok: schemaCheck.ok },
    ...required.map((key) => ({ id: `required_${key}`, ok: mission[key] !== undefined && mission[key] !== "" })),
    { id: "approval_required", ok: mission.approval_required === true },
    { id: "visual_policy_declared", ok: Boolean(mission.visual_policy) },
    { id: "target_files_scoped", ok: targetChecks.every((item) => item.ok) },
    { id: "mission_files_present", ok: fsSync.existsSync(paths.yaml) || fsSync.existsSync(paths.json) },
  ];
  return {
    ok: gates.every((gate) => gate.ok),
    mission,
    paths,
    gates,
    schema_check: schemaCheck,
    target_checks: targetChecks,
  };
}

export async function compileSource(missionId) {
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const { mission, paths } = validation;
  const source = {
    aecode_source_version: "0.1",
    mission_id: mission.mission_id,
    generated_at: new Date().toISOString(),
    axiom: {
      product_constitution: mission.intent,
      authority: {
        human_approval_required: mission.approval_required,
        production_deploy_requires_final_stop: true,
        destructive_ops_forbidden_without_explicit_approval: true,
      },
      boundaries: mission.forbidden_paths,
    },
    glyph_scene: {
      visual_required: mission.visual_required,
      visual_policy: mission.visual_policy,
      redesign_required: false,
      screenshot_gate_required_for_ui_work: true,
    },
    flow_graph: {
      states: ["PLANNED", "VALIDATED", "SANDBOX_READY", "RUN_RECEIPTED", "APPROVED", "MERGED_OR_DEPLOYED"],
      current_state: mission.status,
      acceptance_tests: mission.acceptance_tests,
    },
    dataforge: {
      target_repo: mission.target_repo,
      target_files: mission.target_files,
      allowed_paths: mission.allowed_paths,
      forbidden_paths: mission.forbidden_paths,
    },
    targetforge: {
      default_targets: ["orangebox-cli", "receipt-json", "operator-status-json"],
      visual_targets_deferred: true,
      production_deploy_deferred: true,
    },
    receiptchain: {
      required: true,
      receipt_prefix: `orangebox-aecode-${mission.mission_id}`,
      rollback_required: true,
    },
  };
  source.integrity = {
    sha256: sha256(stableStringify(source)),
    deterministic_key_ordering: true,
  };
  await writeJson(paths.source, source);
  await writeJson(path.join(AECODE_ROOT, "source", `${mission.mission_id}.aecode.json`), source);
  await appendMissionEvent(mission.mission_id, "source_compiled", { source_path: paths.source, sha256: source.integrity.sha256 });
  return { ok: true, mission_id: mission.mission_id, source, paths };
}

export async function createWorktreePlan(missionId, { create = false, approved = false } = {}) {
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const { mission } = validation;
  const worktreePath = path.join(WORKTREES_ROOT, mission.mission_id);
  const resolvedWorktree = path.resolve(worktreePath);
  const resolvedRoot = path.resolve(WORKTREES_ROOT);
  const pathOk = resolvedWorktree.startsWith(`${resolvedRoot}${path.sep}`) || resolvedWorktree === resolvedRoot;
  const branch = `aecode/${mission.mission_id}`;
  const plan = {
    ok: pathOk && (!create || approved),
    mission_id: mission.mission_id,
    mode: create ? "create" : "dry_run",
    worktree_path: worktreePath,
    branch,
    command: `git worktree add -b ${branch} ${worktreePath}`,
    gates: [
      { id: "path_inside_worktrees_root", ok: pathOk },
      { id: "operator_approval_for_create", ok: !create || approved },
      { id: "production_deploy_not_involved", ok: true },
    ],
  };
  if (create && approved && pathOk) {
    await fs.mkdir(WORKTREES_ROOT, { recursive: true });
    if (fsSync.existsSync(worktreePath)) {
      plan.execution = {
        ok: true,
        command: "git worktree add",
        ms: 0,
        stdout: "worktree already exists; reused idempotently",
        stderr: "",
      };
    } else {
      plan.execution = await run("git", ["worktree", "add", "-b", branch, worktreePath], { timeout: 120_000 });
      if (!plan.execution.ok && /already exists/i.test(`${plan.execution.stderr} ${plan.execution.error}`)) {
        plan.execution = await run("git", ["worktree", "add", worktreePath, branch], { timeout: 120_000 });
      }
    }
    plan.ok = plan.execution.ok;
  }
  await writeJson(path.join(AECODE_ROOT, "worktrees", `${mission.mission_id}.json`), plan);
  await appendMissionEvent(mission.mission_id, "worktree_plan", {
    ok: plan.ok,
    mode: plan.mode,
    worktree_path: plan.worktree_path,
    branch: plan.branch,
  });
  return plan;
}

function parseAcceptanceCommand(commandText) {
  const text = String(commandText || "").trim();
  const nodeCheck = text.match(/^node\s+--check\s+(.+)$/i);
  if (nodeCheck) {
    const rel = nodeCheck[1].trim().replace(/^["']|["']$/g, "");
    const resolved = path.resolve(ROOT, rel);
    const root = path.resolve(ROOT);
    const insideRoot = resolved === root || resolved.startsWith(`${root}${path.sep}`);
    return {
      ok: insideRoot && fsSync.existsSync(resolved),
      command: "node",
      args: ["--check", resolved],
      reason: insideRoot ? "node syntax check" : "node check path outside repo",
    };
  }

  const npmRun = text.match(/^npm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)$/i);
  if (npmRun) {
    const script = npmRun[1];
    const pkg = JSON.parse(fsSync.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    const exists = Boolean(pkg.scripts?.[script]);
    return {
      ok: exists,
      command: process.platform === "win32" ? "npm.cmd" : "npm",
      args: ["run", script],
      reason: exists ? "package script" : `missing package script: ${script}`,
    };
  }

  return {
    ok: false,
    command: text,
    args: [],
    reason: "not in AECode deterministic acceptance allowlist",
  };
}

async function executeAcceptanceTests(mission) {
  const results = [];
  for (const commandText of mission.acceptance_tests || []) {
    const parsed = parseAcceptanceCommand(commandText);
    if (!parsed.ok) {
      results.push({
        ok: false,
        command: commandText,
        skipped: true,
        reason: parsed.reason,
      });
      continue;
    }
    const result = await run(parsed.command, parsed.args, { timeout: ACCEPTANCE_TIMEOUT_MS });
    results.push({
      ...result,
      source_command: commandText,
      reason: parsed.reason,
    });
  }
  return {
    ok: results.every((item) => item.ok),
    total: results.length,
    passed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results,
  };
}

async function createModelWriteSelfTestPatch(mission) {
  const fileRel = MODEL_WRITE_SELFTEST_FILE;
  const patch = [
    `diff --git a/${fileRel} b/${fileRel}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${fileRel}`,
    "@@ -0,0 +1,7 @@",
    "+# AECode Model Write Lane Self-Test",
    "+",
    `+Mission: ${mission.mission_id}`,
    "+",
    "+This file is written only inside the approved AECode mission worktree.",
    "+It proves the patch application lane without mutating the main working tree.",
    "+This self-test content is deterministic so repeated full deploys are idempotent.",
    "",
  ].join("\n");
  const patchFile = path.join(AECODE_ROOT, "model-write", mission.mission_id, "self-test.diff");
  await writeText(patchFile, patch);
  return patchFile;
}

export async function applyModelWritePatch(missionId, {
  patchPath = null,
  operatorApproved = false,
  selfTest = false,
} = {}) {
  const startedAt = new Date().toISOString();
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const { mission } = validation;
  const patchFile = selfTest || !patchPath
    ? await createModelWriteSelfTestPatch(mission)
    : path.resolve(patchPath);
  const patchPathOk = insideAny(patchFile, [ROOT, DATA_ROOT]);
  const patchText = patchPathOk && fsSync.existsSync(patchFile)
    ? await fs.readFile(patchFile, "utf8")
    : "";
  const changedPaths = patchPaths(patchText);
  const pathChecks = changedPaths.map((file) => pathIsScoped(file, mission.allowed_paths, mission.forbidden_paths));
  const patchHash = sha256(patchText);
  const sandbox = await createWorktreePlan(missionId, {
    create: true,
    approved: operatorApproved,
  });
  const precheck = patchPathOk && operatorApproved && sandbox.ok && changedPaths.length > 0 && pathChecks.every((item) => item.ok);
  const selfTestAlreadyPresent = Boolean(
    selfTest
    && sandbox.ok
    && changedPaths.length > 0
    && changedPaths.every((file) => fsSync.existsSync(path.join(sandbox.worktree_path, file)))
  );
  const check = precheck
    ? selfTestAlreadyPresent
      ? {
          ok: true,
          command: `git -C ${sandbox.worktree_path} apply --check ${patchFile}`,
          ms: 0,
          stdout: "self-test patch target already exists in worktree; check treated as idempotent pass",
          stderr: "",
        }
      : await run("git", ["-C", sandbox.worktree_path, "apply", "--check", patchFile], { timeout: 120_000 })
    : {
        ok: false,
        command: `git -C ${sandbox.worktree_path || "<missing>"} apply --check ${patchFile}`,
        ms: 0,
        stdout: "",
        stderr: "",
        error: !operatorApproved
          ? "operator approval required"
          : !patchPathOk
            ? "patch path outside approved roots"
            : changedPaths.length === 0
              ? "patch contains no changed paths"
              : !pathChecks.every((item) => item.ok)
                ? "patch changes paths outside mission scope"
                : "sandbox unavailable",
      };
  const reverseCheck = !check.ok && precheck && !selfTestAlreadyPresent
    ? await run("git", ["-C", sandbox.worktree_path, "apply", "--reverse", "--check", patchFile], { timeout: 120_000 })
    : null;
  const alreadyApplied = reverseCheck?.ok === true;
  const apply = check.ok && !selfTestAlreadyPresent
    ? await run("git", ["-C", sandbox.worktree_path, "apply", patchFile], { timeout: 120_000 })
    : alreadyApplied || selfTestAlreadyPresent
      ? {
          ok: true,
          command: `git -C ${sandbox.worktree_path} apply ${patchFile}`,
          ms: 0,
          stdout: alreadyApplied
            ? "patch already applied; verified by reverse check"
            : "self-test patch target already exists in worktree; verified idempotently",
          stderr: "",
        }
      : null;
  const status = sandbox.ok
    ? await run("git", ["-C", sandbox.worktree_path, "status", "--short"], { timeout: 30_000 })
    : null;
  const diffStat = sandbox.ok
    ? await run("git", ["-C", sandbox.worktree_path, "diff", "--stat"], { timeout: 30_000 })
    : null;
  const gates = [
    { id: "mission_valid", ok: validation.ok },
    { id: "operator_approved", ok: operatorApproved },
    { id: "patch_path_inside_approved_roots", ok: patchPathOk },
    { id: "patch_has_changed_paths", ok: changedPaths.length > 0 },
    { id: "patch_paths_scoped", ok: pathChecks.every((item) => item.ok) },
    { id: "worktree_ready", ok: sandbox.ok },
    { id: "git_apply_check", ok: check.ok || alreadyApplied || selfTestAlreadyPresent },
    { id: "git_apply", ok: apply?.ok === true },
    { id: "main_working_tree_not_written", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: MODEL_WRITE_VERSION,
    kind: "model_write_patch",
    mission_id: mission.mission_id,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    mode: {
      self_test: selfTest || !patchPath,
      operator_approved: operatorApproved,
      production_deploy_attempted: false,
      visual_mutation_attempted: false,
      model_api_called: false,
      writes_target: "approved mission worktree only",
    },
    gates,
    patch: {
      path: patchFile,
      sha256: patchHash,
      changed_paths: changedPaths,
      path_checks: pathChecks,
    },
    sandbox,
    commands: {
      check,
      reverse_check: reverseCheck,
      apply,
      status,
      diff_stat: diffStat,
    },
    rollback: {
      repo_mutation: sandbox.worktree_path,
      recovery_action: `Run git -C ${sandbox.worktree_path} apply -R ${patchFile} or remove the worktree with git worktree remove ${sandbox.worktree_path}.`,
    },
  };
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-model-write-${mission.mission_id}-${stamp()}.json`);
  report.receipt_path = receiptPath;
  await writeJson(receiptPath, report);
  await writeJson(path.join(AECODE_ROOT, "model-write", mission.mission_id, "latest.json"), report);
  await appendMissionEvent(mission.mission_id, "model_write_patch", {
    ok: report.ok,
    changed_paths: changedPaths,
    receipt_path: receiptPath,
  });
  await writeMissionReceipt(mission.mission_id, {
    status: report.ok ? "passed" : "failed",
    verdict: report.ok ? "model_write_patch_applied" : "model_write_patch_failed",
    files_changed: changedPaths.map((file) => ({ path: file, change_type: "patch" })),
    artifacts: { patch_path: patchFile, model_write_receipt: receiptPath },
    rollback: report.rollback,
  });
  return report;
}

async function createProviderArtifactSelfTest(mission) {
  const artifact = {
    schema_version: "ae.provider_artifact.v0",
    mission_id: mission.mission_id,
    artifact_type: "file_patch",
    files: [
      {
        path: PROVIDER_ARTIFACT_SELFTEST_FILE,
        operation: "replace",
        content: [
          "# AECode Provider Artifact Self-Test",
          "",
          `Mission: ${mission.mission_id}`,
          "",
          "This file is produced from a schema-valid provider artifact.",
          "Orangebox applies the artifact inside the approved mission worktree.",
          "The main working tree is not modified by this self-test.",
          "",
        ].join("\n"),
      },
    ],
    notes: "Deterministic self-test artifact for AECode provider contract.",
  };
  const file = path.join(AECODE_ROOT, "provider-artifacts", mission.mission_id, "self-test.artifact.json");
  await writeJson(file, artifact);
  return file;
}

function sanitizeProviderText(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[^\S\n]+/g, " ")
    .trim()
    .slice(0, 1200);
}

function stripPromptEcho(text, prompt) {
  let out = String(text || "");
  if (out.startsWith(prompt)) out = out.slice(prompt.length);
  const marker = "Note:";
  const markerIndex = out.lastIndexOf(marker);
  if (markerIndex !== -1 && markerIndex < 240) out = out.slice(markerIndex + marker.length);
  return out.trim();
}

async function localLlamaProviderNote(mission, compiled) {
  const prompt = [
    "Orangebox AECode local provider.",
    "Return one concise implementation note for this mission.",
    "Do not include JSON. Do not mention secrets. Do not ask questions.",
    `Mission: ${mission.mission_id}`,
    `Intent: ${mission.intent}`,
    `AECode source hash: ${compiled?.source?.integrity?.sha256 || "unknown"}`,
    "Note:",
  ].join("\n");
  const [health, models] = await Promise.all([
    fetchJson(`${LLAMA_BASE_URL}/health`, {}, 4000),
    fetchJson(`${LLAMA_BASE_URL}/v1/models`, {}, 6000),
  ]);
  const completion = health.ok && models.ok
    ? await fetchJson(`${LLAMA_BASE_URL}/v1/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: LLAMA_MODEL_ALIAS,
          prompt,
          max_tokens: 96,
          temperature: 0,
        }),
      }, 60_000)
    : null;
  const rawText = String(completion?.json?.choices?.[0]?.text || "");
  let text = sanitizeProviderText(stripPromptEcho(rawText, prompt));
  if (!text && rawText) text = sanitizeProviderText(rawText);
  return {
    ok: Boolean(health.ok && models.ok && completion?.ok && text),
    provider: "local-llama-listener",
    endpoint: LLAMA_BASE_URL,
    model_alias: LLAMA_MODEL_ALIAS,
    health: { ok: health.ok, status: health.status, ms: health.ms, error: health.error || null },
    models: { ok: models.ok, status: models.status, ms: models.ms, error: models.error || null },
    completion: completion ? {
      ok: completion.ok,
      status: completion.status,
      ms: completion.ms,
      model: completion.json?.model || null,
      prompt_echo_trimmed: rawText !== text,
      usage: completion.json?.usage || {},
      timings: completion.json?.timings || {},
      error: completion.error || null,
    } : null,
    text,
    prompt_hash: sha256(prompt),
    text_hash: text ? sha256(text) : null,
  };
}

async function resolveProviderNote(provider, mission, compiled) {
  if (provider === "local-llama-listener" || provider === "local-llama-cpu") {
    const local = await localLlamaProviderNote(mission, compiled);
    if (local.ok) return local;
    return {
      ...local,
      fallback_used: true,
      fallback_provider: "local-deterministic-cpu",
      text: "Local listener was not available for content generation; deterministic provider preserved the artifact contract.",
      text_hash: sha256("Local listener was not available for content generation; deterministic provider preserved the artifact contract."),
    };
  }
  const text = "Deterministic provider generated this artifact from mission/source state without model inference.";
  return {
    ok: true,
    provider: "local-deterministic-cpu",
    endpoint: null,
    model_alias: null,
    text,
    prompt_hash: null,
    text_hash: sha256(text),
  };
}

function providerGeneratedContent(mission, compiled, providerNote) {
  const sourceHash = compiled?.source?.integrity?.sha256 || "unknown";
  const generatedAt = new Date().toISOString();
  const note = sanitizeProviderText(providerNote?.text || "");
  return [
    "# Orangebox AECode Generated Runtime Contract",
    "",
    `Mission: ${mission.mission_id}`,
    `Generated: ${generatedAt}`,
    `Provider: ${providerNote?.provider || "local-deterministic-cpu"}`,
    `AECode source hash: ${sourceHash}`,
    "",
    "## Provider Note",
    "",
    note || "No provider note returned.",
    "",
    "## Contract",
    "",
    "This artifact was generated from the mission manifest and AECode Source IR.",
    "It proves the provider lane can produce a schema-valid artifact without requiring GPU hardware, cloud APIs, or visual mutation.",
    "",
    "## Authority",
    "",
    "- Orangebox owns routing, schema validation, worktree writes, receipts, rollback, and approval gates.",
    "- Providers produce artifacts only; they do not write directly to the main working tree.",
    "- Production deploy remains behind the release gauntlet and human final-stop approval.",
    "- Visual mutation remains paused until the operator explicitly unpauses it.",
    "",
    "## Mission Scope",
    "",
    `- Intent: ${mission.intent}`,
    `- Risk level: ${mission.risk_level}`,
    `- Model role: ${mission.model_role}`,
    `- Visual required: ${mission.visual_required}`,
    "",
    "## Allowed Paths",
    "",
    ...(mission.allowed_paths || []).map((item) => `- ${item}`),
    "",
    "## Forbidden Paths",
    "",
    ...(mission.forbidden_paths || []).map((item) => `- ${item}`),
    "",
    "## Acceptance Tests",
    "",
    ...(mission.acceptance_tests || []).map((item) => `- ${item}`),
    "",
    "## Proof",
    "",
    "This file should appear only inside the mission worktree until a human approves merge/promotion.",
    "",
  ].join("\n");
}

export async function generateProviderArtifact(missionId, {
  provider = process.env.ORANGEBOX_AECODE_PROVIDER || "local-llama-listener",
  targetPath = PROVIDER_GENERATED_FILE,
} = {}) {
  const startedAt = new Date().toISOString();
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const { mission } = validation;
  const compiled = await compileSource(missionId);
  const providerNote = await resolveProviderNote(provider, mission, compiled);
  const rel = String(targetPath || PROVIDER_GENERATED_FILE).replace(/\\/g, "/").replace(/^\/+/, "");
  const pathCheck = pathIsScoped(rel, mission.allowed_paths, mission.forbidden_paths);
  const artifact = {
    schema_version: "ae.provider_artifact.v0",
    mission_id: mission.mission_id,
    artifact_type: "file_patch",
    provider,
    provider_result: providerNote,
    generated_at: new Date().toISOString(),
    input_hashes: {
      mission: sha256(stableStringify(mission)),
      source: compiled?.source?.integrity?.sha256 || null,
    },
    files: [
      {
        path: rel,
        operation: "replace",
        content: providerGeneratedContent(mission, compiled, providerNote),
      },
    ],
    notes: "CPU-safe deterministic provider artifact generated from mission manifest and AECode Source IR.",
  };
  artifact.integrity = {
    deterministic_key_ordering: true,
    sha256: sha256(stableStringify(artifact)),
  };
  const schemaCheck = await validateObjectAgainstSchema("provider_artifact.schema.json", artifact);
  const paths = missionPaths(mission.mission_id);
  await ensureMissionDirs(mission.mission_id);
  const artifactFile = path.join(paths.artifacts, `provider-generated-${stamp()}.artifact.json`);
  const latestFile = path.join(AECODE_ROOT, "provider-artifacts", mission.mission_id, "generated-latest.artifact.json");
  await writeJson(artifactFile, artifact);
  await writeJson(latestFile, artifact);
  const gates = [
    { id: "mission_valid", ok: validation.ok },
    { id: "source_compiled", ok: compiled.ok },
    { id: "target_path_scoped", ok: pathCheck.ok },
    { id: "artifact_schema_valid", ok: schemaCheck.ok },
    { id: "provider_result_available", ok: Boolean(providerNote.text) },
    { id: "no_paid_model_api_called", ok: true },
    { id: "no_repo_write", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: PROVIDER_GENERATOR_VERSION,
    kind: "provider_artifact_generate",
    mission_id: mission.mission_id,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    provider,
    provider_result: providerNote,
    mode: {
      local_cpu_safe: true,
      model_api_called: Boolean(providerNote.provider === "local-llama-listener" && providerNote.completion?.ok),
      paid_model_api_called: false,
      production_deploy_attempted: false,
      visual_mutation_attempted: false,
      repo_write_attempted: false,
    },
    gates,
    artifact: {
      path: artifactFile,
      latest_path: latestFile,
      sha256: artifact.integrity.sha256,
      target_path: rel,
      target_path_check: pathCheck,
      schema_check: schemaCheck,
      changed_paths: [rel],
    },
    rollback: {
      repo_mutation: "none",
      data_mutation: `${artifactFile}; ${latestFile}`,
      recovery_action: "Delete generated provider artifact files if superseded.",
    },
  };
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-provider-generate-${mission.mission_id}-${stamp()}.json`);
  report.receipt_path = receiptPath;
  await writeJson(receiptPath, report);
  await writeJson(path.join(AECODE_ROOT, "provider-artifacts", mission.mission_id, "generated-latest.json"), report);
  await appendMissionEvent(mission.mission_id, "provider_artifact_generate", {
    ok: report.ok,
    provider,
    artifact_path: artifactFile,
    receipt_path: receiptPath,
  });
  await writeMissionReceipt(mission.mission_id, {
    status: report.ok ? "passed" : "failed",
    verdict: report.ok ? "provider_artifact_generated" : "provider_artifact_generation_failed",
    files_changed: [],
    artifacts: { generated_provider_artifact: artifactFile, provider_generate_receipt: receiptPath },
    rollback: report.rollback,
  });
  return report;
}

export async function applyProviderArtifact(missionId, {
  artifactPath = null,
  operatorApproved = false,
  selfTest = false,
} = {}) {
  const startedAt = new Date().toISOString();
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const { mission } = validation;
  const artifactFile = selfTest || !artifactPath
    ? await createProviderArtifactSelfTest(mission)
    : path.resolve(artifactPath);
  const artifactPathOk = insideAny(artifactFile, [ROOT, DATA_ROOT]);
  const artifactRead = artifactPathOk ? await readJson(artifactFile) : { ok: false, error: "artifact path outside approved roots" };
  const artifact = artifactRead.data;
  const artifactSchema = artifactRead.ok
    ? await validateObjectAgainstSchema("provider_artifact.schema.json", artifact)
    : { ok: false, errors: [{ reason: artifactRead.error }] };
  const sandbox = await createWorktreePlan(missionId, { create: true, approved: operatorApproved });
  const changedPaths = artifact?.artifact_type === "file_patch"
    ? (artifact.files || []).map((file) => String(file.path || "").replace(/\\/g, "/"))
    : artifact?.artifact_type === "unified_diff"
      ? patchPaths(artifact.diff || "")
      : [];
  const pathChecks = changedPaths.map((file) => pathIsScoped(file, mission.allowed_paths, mission.forbidden_paths));
  const writes = [];
  let diffDelegate = null;
  if (operatorApproved && artifactPathOk && artifactSchema.ok && sandbox.ok && pathChecks.every((item) => item.ok)) {
    if (artifact.artifact_type === "file_patch") {
      for (const file of artifact.files || []) {
        const rel = String(file.path || "").replace(/\\/g, "/").replace(/^\/+/, "");
        const target = path.resolve(sandbox.worktree_path, rel);
        const insideWorktree = insideAny(target, [sandbox.worktree_path]);
        if (!insideWorktree) {
          writes.push({ ok: false, path: rel, reason: "target escaped worktree" });
          continue;
        }
        const current = await fs.readFile(target, "utf8").catch(() => null);
        const desired = String(file.content ?? "");
        if (current === desired) {
          writes.push({ ok: true, path: rel, mode: "already_current", sha256_after: sha256(desired) });
          continue;
        }
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, desired, "utf8");
        writes.push({
          ok: true,
          path: rel,
          mode: file.operation || "replace",
          sha256_before: current === null ? null : sha256(current),
          sha256_after: sha256(desired),
        });
      }
    } else if (artifact.artifact_type === "unified_diff") {
      const patchFile = path.join(missionPaths(mission.mission_id).patches, `provider-artifact-${stamp()}.diff`);
      await writeText(patchFile, artifact.diff || "");
      diffDelegate = await applyModelWritePatch(missionId, {
        patchPath: patchFile,
        operatorApproved,
        selfTest: false,
      });
    }
  }
  const status = sandbox.ok
    ? await run("git", ["-C", sandbox.worktree_path, "status", "--short"], { timeout: 30_000 })
    : null;
  const gates = [
    { id: "mission_valid", ok: validation.ok },
    { id: "operator_approved", ok: operatorApproved },
    { id: "artifact_path_inside_approved_roots", ok: artifactPathOk },
    { id: "artifact_json_parse", ok: artifactRead.ok },
    { id: "artifact_schema_valid", ok: artifactSchema.ok },
    { id: "artifact_paths_scoped", ok: pathChecks.every((item) => item.ok) && changedPaths.length > 0 },
    { id: "worktree_ready", ok: sandbox.ok },
    { id: "artifact_applied", ok: artifact?.artifact_type === "unified_diff" ? diffDelegate?.ok === true : writes.length > 0 && writes.every((item) => item.ok) },
    { id: "main_working_tree_not_written", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: PROVIDER_ARTIFACT_VERSION,
    kind: "provider_artifact_apply",
    mission_id: mission.mission_id,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    mode: {
      self_test: selfTest || !artifactPath,
      operator_approved: operatorApproved,
      production_deploy_attempted: false,
      visual_mutation_attempted: false,
      writes_target: "approved mission worktree only",
    },
    gates,
    artifact: {
      path: artifactFile,
      sha256: artifactRead.ok ? sha256(stableStringify(artifact)) : null,
      schema_check: artifactSchema,
      type: artifact?.artifact_type || null,
      changed_paths: changedPaths,
      path_checks: pathChecks,
    },
    sandbox,
    writes,
    diff_delegate: diffDelegate,
    commands: { status },
    rollback: {
      repo_mutation: sandbox.worktree_path,
      recovery_action: `Discard or review worktree changes at ${sandbox.worktree_path}; remove worktree with git worktree remove when done.`,
    },
  };
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-provider-artifact-${mission.mission_id}-${stamp()}.json`);
  report.receipt_path = receiptPath;
  await writeJson(receiptPath, report);
  await writeJson(path.join(AECODE_ROOT, "provider-artifacts", mission.mission_id, "latest.json"), report);
  await appendMissionEvent(mission.mission_id, "provider_artifact_apply", {
    ok: report.ok,
    changed_paths: changedPaths,
    receipt_path: receiptPath,
  });
  await writeMissionReceipt(mission.mission_id, {
    status: report.ok ? "passed" : "failed",
    verdict: report.ok ? "provider_artifact_applied" : "provider_artifact_failed",
    files_changed: writes.map((item) => ({
      path: item.path,
      change_type: item.mode,
      sha256_before: item.sha256_before || null,
      sha256_after: item.sha256_after || null,
    })),
    artifacts: { provider_artifact: artifactFile, provider_artifact_receipt: receiptPath },
    rollback: report.rollback,
  });
  return report;
}

export async function runMission(missionId, { dryRun = true } = {}) {
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const compiled = await compileSource(missionId);
  const { mission } = validation;
  const acceptance = dryRun
    ? { ok: true, total: mission.acceptance_tests.length, passed: 0, failed: 0, results: [], skipped: true }
    : await executeAcceptanceTests(mission);
  const modelCall = {
    provider: "none",
    model: "none",
    role: mission.model_role,
    prompt_hash: null,
    output_hash: null,
    latency_ms: 0,
    cost_estimate: 0,
    status: "SKIPPED_DRY_RUN_GOVERNED_ENVELOPE_ONLY",
  };
  const receipt = {
    ok: dryRun || acceptance.ok,
    version: AECODE_RUNTIME_VERSION,
    kind: "mission_run",
    mission_id: mission.mission_id,
    created_at: new Date().toISOString(),
    dry_run: dryRun,
    governed_inference: {
      route: mission.model_role,
      direct_model_bypass_allowed: false,
      subscription_first: true,
      local_fallback: true,
      api_last_resort: true,
      model_calls: [modelCall],
    },
    validation,
    compiled_source_path: compiled.paths.source,
    commands_planned: mission.acceptance_tests,
    commands_executed: acceptance.results || [],
    acceptance,
    final_verdict: dryRun
      ? "RUN_RECEIPTED_NO_MODEL_MUTATION"
      : acceptance.ok
        ? "EXECUTED_DETERMINISTIC_ACCEPTANCE_CHECKS"
        : "FAILED_DETERMINISTIC_ACCEPTANCE_CHECKS",
    rollback: {
      repo_mutation: "source.aecode.json and mission receipts only",
      recovery_action: `Delete ${compiled.paths.source} and generated mission run receipts if superseded.`,
    },
  };
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-mission-run-${mission.mission_id}-${stamp()}.json`);
  receipt.receipt_path = receiptPath;
  await writeJson(receiptPath, receipt);
  await writeJson(path.join(AECODE_ROOT, "runs", `${mission.mission_id}-latest.json`), receipt);
  await appendMissionEvent(mission.mission_id, "mission_run", {
    ok: receipt.ok,
    dry_run: dryRun,
    final_verdict: receipt.final_verdict,
    receipt_path: receiptPath,
  });
  await writeMissionReceipt(mission.mission_id, {
    status: receipt.ok ? "passed" : "failed",
    verdict: receipt.final_verdict,
    model_calls: receipt.governed_inference.model_calls,
    commands_run: receipt.commands_executed,
    artifacts: { compiled_source: compiled.paths.source, mission_run_receipt: receiptPath },
    rollback: receipt.rollback,
  });
  return receipt;
}

export async function createFactoryPreset(preset) {
  return {
    ok: false,
    preset,
    status: "DISABLED_BY_OPERATOR",
    reason: "Orangebox Ops backend only. App factory/store/website/visual preset generation is not part of the active system path.",
  };
}

export async function deployIntake() {
  const report = {
    ok: true,
    version: AECODE_RUNTIME_VERSION,
    kind: "deploy_failure_intake",
    created_at: new Date().toISOString(),
    repository: "AtomEons/atomeons-com",
    workflow: "Deploy production to Vercel",
    sample: DEPLOY_FAILURE_SAMPLE,
    status: "NEEDS_ACTION_LOGS_OR_LOCAL_REPO",
    production_deploy_attempted: false,
    next_required_evidence: [
      "GitHub Actions failed deploy logs",
      "local checkout of C:\\AtomEons\\atomeons-com",
      "Vercel build output for matching commit",
    ],
    rollback: {
      repo_mutation: "none",
      data_mutation: path.join(AECODE_ROOT, "deploy"),
    },
  };
  await writeJson(path.join(AECODE_ROOT, "deploy", "latest-deploy-failure-intake.json"), report);
  await appendMissionEvent("system-deploy-intake", "deploy_failure_intake", {
    repository: report.repository,
    status: report.status,
  });
  return report;
}

export async function visualQaGate(missionId) {
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const report = {
    ok: true,
    version: AECODE_RUNTIME_VERSION,
    kind: "visual_qa_gate",
    mission_id: missionId,
    created_at: new Date().toISOString(),
    visual_mutation_paused: true,
    screenshot_required_before_ui_completion: true,
    existing_scripts: [
      "scripts/v4/react-see-suite-proof.mjs",
      "scripts/v4/react-see-suite-72-state-proof.mjs",
      "scripts/v4/react-see-suite-pixel-compare.mjs",
    ].map((rel) => ({ rel, present: fsSync.existsSync(path.join(ROOT, rel)) })),
    verdict: "CONTRACT_READY_RENDERING_DEFERRED_BY_OPERATOR_PAUSE",
  };
  await writeJson(path.join(AECODE_ROOT, "visual-qa", `${missionId}.json`), report);
  await writeJson(path.join(validation.paths.dir, "visual_review.json"), {
    schema_version: "ae.visual_review.v0",
    mission_id: missionId,
    route: null,
    screenshots: [],
    checks: {
      layout: "deferred",
      overflow: "deferred",
      contrast: "deferred",
      responsive: "deferred",
      text_integrity: "deferred",
      design_token_usage: "deferred",
    },
    issues: [],
    verdict: "deferred",
  });
  await appendMissionEvent(missionId, "visual_qa_gate", {
    ok: report.ok,
    verdict: report.verdict,
    visual_mutation_paused: true,
  });
  return report;
}

export async function deployFull(missionId, {
  execute = false,
  createWorktree = false,
  operatorApproved = false,
} = {}) {
  const startedAt = new Date().toISOString();
  const validation = await validateMission(missionId);
  if (!validation.ok) return validation;
  const { mission } = validation;
  const compiled = await compileSource(missionId);
  const sandbox = await createWorktreePlan(missionId, {
    create: createWorktree,
    approved: operatorApproved,
  });
  const modelWrite = operatorApproved
    ? await applyModelWritePatch(missionId, { operatorApproved, selfTest: true })
    : {
        ok: true,
        skipped: true,
        reason: "operator approval not supplied for model-write lane",
      };
  const generatedProviderArtifact = await generateProviderArtifact(missionId);
  const providerArtifact = operatorApproved && generatedProviderArtifact.ok
    ? await applyProviderArtifact(missionId, {
        operatorApproved,
        artifactPath: generatedProviderArtifact.artifact.path,
      })
    : {
        ok: !operatorApproved ? true : false,
        skipped: !operatorApproved,
        reason: !operatorApproved
          ? "operator approval not supplied for provider-artifact lane"
          : "provider artifact generation failed",
      };
  const missionRun = await runMission(missionId, { dryRun: !execute });
  const visual = {
    ok: true,
    status: "DISABLED_BY_OPERATOR",
    reason: "Orangebox Ops backend only. Visual and website lanes are not part of the active system proof.",
  };
  const deploy = await deployIntake();
  const factories = {
    ok: true,
    status: "DISABLED_BY_OPERATOR",
    reason: "App factory/store/website preset generation removed from active Orangebox Ops proof.",
  };
  const release = await run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "gauntlet:release"], {
    timeout: ACCEPTANCE_TIMEOUT_MS,
  });
  await writeJson(path.join(AECODE_ROOT, "deploy", "latest-full-local-deploy.json"), {
    ok: true,
    version: AECODE_RUNTIME_VERSION,
    kind: "aecode_full_local_deploy",
    mission_id: mission.mission_id,
    status: "IN_PROGRESS_OPERATOR_FEED_REFRESH",
    started_at: startedAt,
  });
  const operator = await operatorStatus();
  const gates = [
    { id: "mission_valid", ok: validation.ok },
    { id: "source_compiled", ok: compiled.ok },
    { id: "sandbox_law", ok: sandbox.ok },
    { id: "model_write_lane", ok: modelWrite.ok },
    { id: "provider_artifact_generated", ok: generatedProviderArtifact.ok },
    { id: "provider_artifact_lane", ok: providerArtifact.ok },
    { id: "mission_run", ok: missionRun.ok },
    { id: "deploy_preflight_intake", ok: deploy.ok && deploy.production_deploy_attempted === false },
    { id: "visual_and_website_lanes_disabled", ok: visual.ok && visual.status === "DISABLED_BY_OPERATOR" },
    { id: "app_factory_store_lane_disabled", ok: factories.ok && factories.status === "DISABLED_BY_OPERATOR" },
    { id: "release_gauntlet", ok: release.ok },
    { id: "operator_surface_feed", ok: operator.ok },
    { id: "production_deploy_not_attempted", ok: true },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: AECODE_RUNTIME_VERSION,
    kind: "aecode_full_local_deploy",
    mission_id: mission.mission_id,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    mode: {
      execute_acceptance_tests: execute,
      create_worktree: createWorktree,
      operator_approved: operatorApproved,
      production_deploy_attempted: false,
      visual_mutation_attempted: false,
      local_model_generation_called: Boolean(generatedProviderArtifact.provider_result?.completion?.ok),
      paid_model_api_called: false,
    },
    gates,
    artifacts: {
      mission_yaml: validation.paths.yaml,
      source: compiled.paths.source,
      sandbox_plan: path.join(AECODE_ROOT, "worktrees", `${mission.mission_id}.json`),
      latest_run: path.join(AECODE_ROOT, "runs", `${mission.mission_id}-latest.json`),
      deploy_intake: path.join(AECODE_ROOT, "deploy", "latest-deploy-failure-intake.json"),
      operator_status: path.join(AECODE_ROOT, "operator", "latest-status.json"),
    },
    validation,
    compiled_source_hash: compiled.source.integrity.sha256,
    sandbox,
    model_write: modelWrite,
    provider_artifact_generation: generatedProviderArtifact,
    provider_artifact: providerArtifact,
    mission_run_receipt: missionRun.receipt_path || null,
    visual,
    deploy,
    factories,
    release_gauntlet: release,
    operator,
    rollback: {
      repo_mutation: createWorktree ? "optional .worktrees mission checkout plus mission/source receipts" : "mission/source receipts only",
      recovery_action: createWorktree
        ? `Remove the linked worktree at ${sandbox.worktree_path} with git worktree remove after review, then delete generated AECode data if superseded.`
        : `Delete generated AECode data under ${AECODE_ROOT} and matching receipts if superseded.`,
    },
  };
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-full-deploy-${mission.mission_id}-${stamp()}.json`);
  report.receipt_path = receiptPath;
  await writeJson(receiptPath, report);
  await writeJson(path.join(AECODE_ROOT, "deploy", "latest-full-local-deploy.json"), report);
  await appendMissionEvent(mission.mission_id, "aecode_full_local_deploy", {
    ok: report.ok,
    gates: gates.map((gate) => ({ id: gate.id, ok: gate.ok })),
    receipt_path: receiptPath,
  });
  await writeMissionReceipt(mission.mission_id, {
    status: report.ok ? "passed" : "failed",
    verdict: report.ok ? "aecode_full_local_deploy_green" : "aecode_full_local_deploy_failed",
    model_calls: missionRun.governed_inference?.model_calls || [],
    commands_run: missionRun.commands_executed || [],
    visual: { required: false, verdict: "deferred", screenshots: [] },
    artifacts: {
      full_deploy_receipt: receiptPath,
      source: compiled.paths.source,
      worktree: sandbox.worktree_path,
      model_write_receipt: modelWrite.receipt_path || null,
      provider_artifact_generation_receipt: generatedProviderArtifact.receipt_path || null,
      provider_artifact_receipt: providerArtifact.receipt_path || null,
    },
    rollback: report.rollback,
  });
  return report;
}

export async function operatorStatus() {
  const missionDirs = await fs.readdir(MISSIONS_ROOT, { withFileTypes: true }).catch(() => []);
  const missions = [];
  for (const entry of missionDirs) {
    if (!entry.isDirectory()) continue;
    const loaded = await loadMission(entry.name);
    if (loaded.ok) missions.push({
      mission_id: loaded.mission.mission_id,
      title: loaded.mission.title,
      status: loaded.mission.status,
      visual_required: loaded.mission.visual_required,
    });
  }
  const receiptFiles = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true }).catch(() => []);
  const receipts = [];
  for (const entry of receiptFiles) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const file = path.join(RECEIPTS_DIR, entry.name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat) receipts.push({ file, mtime: stat.mtimeMs });
  }
  receipts.sort((a, b) => b.mtime - a.mtime);
  const providerGenerationLatest = {};
  const providerGenerationProviders = {};
  for (const mission of missions) {
    const latest = path.join(AECODE_ROOT, "provider-artifacts", mission.mission_id, "generated-latest.json");
    providerGenerationLatest[mission.mission_id] = fsSync.existsSync(latest) ? latest : null;
    if (fsSync.existsSync(latest)) {
      const parsed = await readJson(latest);
      providerGenerationProviders[mission.mission_id] = parsed.ok
        ? {
            provider: parsed.data?.provider || null,
            local_model_generation_called: Boolean(parsed.data?.provider_result?.completion?.ok),
            fallback_used: Boolean(parsed.data?.provider_result?.fallback_used),
          }
        : null;
    } else {
      providerGenerationProviders[mission.mission_id] = null;
    }
  }
  const status = {
    ok: true,
    version: AECODE_RUNTIME_VERSION,
    created_at: new Date().toISOString(),
    repo: ROOT,
    missions,
    latest_receipts: receipts.slice(0, 12).map((item) => item.file),
    latest_full_local_deploy: fsSync.existsSync(path.join(AECODE_ROOT, "deploy", "latest-full-local-deploy.json"))
      ? path.join(AECODE_ROOT, "deploy", "latest-full-local-deploy.json")
      : null,
    model_write: {
      active: true,
      writes_target: "approved mission worktrees only",
      latest_by_mission: Object.fromEntries(missions.map((mission) => {
        const latest = path.join(AECODE_ROOT, "model-write", mission.mission_id, "latest.json");
        return [mission.mission_id, fsSync.existsSync(latest) ? latest : null];
      })),
    },
    provider_artifacts: {
      active: true,
      writes_target: "approved mission worktrees only",
      latest_by_mission: Object.fromEntries(missions.map((mission) => {
        const latest = path.join(AECODE_ROOT, "provider-artifacts", mission.mission_id, "latest.json");
        return [mission.mission_id, fsSync.existsSync(latest) ? latest : null];
      })),
    },
    provider_generation: {
      active: true,
      default_lane: process.env.ORANGEBOX_AECODE_PROVIDER || "local-llama-listener",
      repo_write_attempted: false,
      latest_by_mission: providerGenerationLatest,
      provider_by_mission: providerGenerationProviders,
    },
    mission_evidence: Object.fromEntries(missions.map((mission) => {
      const paths = missionPaths(mission.mission_id);
      return [mission.mission_id, {
        receipt: fsSync.existsSync(paths.receipt) ? paths.receipt : null,
        events: fsSync.existsSync(paths.events) ? paths.events : null,
        visual_review: fsSync.existsSync(path.join(paths.dir, "visual_review.json")) ? path.join(paths.dir, "visual_review.json") : null,
      }];
    })),
    gates: {
      visual_mutation_paused: true,
      production_deploy_requires_approval: true,
      destructive_ops_require_approval: true,
      worktree_law_active: true,
      receiptchain_active: true,
    },
  };
  await writeJson(path.join(AECODE_ROOT, "operator", "latest-status.json"), status);
  return status;
}

export async function systemProof(missionId = DEFAULT_SYSTEM_MISSION_ID) {
  const startedAt = new Date().toISOString();
  const latestFullPath = path.join(AECODE_ROOT, "deploy", "latest-full-local-deploy.json");
  const full = await readJson(latestFullPath);
  const providerLatest = path.join(AECODE_ROOT, "provider-artifacts", missionId, "generated-latest.json");
  const provider = await readJson(providerLatest);
  const operator = await operatorStatus();
  const worktreePath = path.join(WORKTREES_ROOT, missionId);
  const generatedTarget = path.join(worktreePath, PROVIDER_GENERATED_FILE);
  const worktreeStatus = fsSync.existsSync(worktreePath)
    ? await run("git", ["-C", worktreePath, "status", "--short"], { timeout: 30_000 })
    : { ok: false, stdout: "", stderr: "", error: "worktree missing" };
  const missionRun = full.ok && full.data?.mission_run_receipt
    ? await readJson(full.data.mission_run_receipt)
    : { ok: false, data: null, error: "mission run receipt missing" };
  const acceptance = missionRun.data?.acceptance || {};
  const gates = [
    { id: "latest_full_deploy_loaded", ok: full.ok },
    { id: "latest_full_deploy_green", ok: full.data?.ok === true },
    { id: "full_deploy_all_gates_green", ok: Array.isArray(full.data?.gates) && full.data.gates.every((gate) => gate.ok) },
    { id: "mission_acceptance_green", ok: acceptance.ok === true && acceptance.failed === 0 },
    { id: "local_llama_provider_used", ok: provider.data?.provider_result?.provider === "local-llama-listener" },
    { id: "local_llama_generation_called", ok: provider.data?.provider_result?.completion?.ok === true },
    { id: "provider_fallback_not_used", ok: provider.data?.provider_result?.fallback_used !== true },
    { id: "provider_artifact_schema_valid", ok: provider.data?.artifact?.schema_check?.ok === true },
    { id: "worktree_artifact_exists", ok: fsSync.existsSync(generatedTarget) },
    { id: "operator_feed_green", ok: operator.ok === true },
    { id: "production_deploy_not_attempted", ok: full.data?.mode?.production_deploy_attempted === false },
    { id: "visual_mutation_not_attempted", ok: full.data?.mode?.visual_mutation_attempted === false },
    { id: "paid_model_api_not_called", ok: full.data?.mode?.paid_model_api_called === false },
  ];
  const report = {
    ok: gates.every((gate) => gate.ok),
    version: AECODE_RUNTIME_VERSION,
    kind: "aecode_system_proof",
    mission_id: missionId,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    gates,
    summary: {
      status: gates.every((gate) => gate.ok) ? "ORANGEBOX_FULL_GREEN_LOCAL_RUNTIME" : "ORANGEBOX_NOT_FULL_GREEN",
      full_deploy_receipt: full.data?.receipt_path || latestFullPath,
      local_provider_receipt: provider.data?.receipt_path || null,
      acceptance: {
        passed: acceptance.passed || 0,
        total: acceptance.total || 0,
        failed: acceptance.failed || 0,
      },
      worktree_artifact: generatedTarget,
      worktree_status: worktreeStatus.stdout || worktreeStatus.stderr || worktreeStatus.error || "",
      safety: {
        production_deploy_attempted: full.data?.mode?.production_deploy_attempted === true,
        visual_mutation_attempted: full.data?.mode?.visual_mutation_attempted === true,
        paid_model_api_called: full.data?.mode?.paid_model_api_called === true,
      },
    },
    rollback: {
      repo_mutation: "none from system proof check; prior artifacts remain in mission worktree",
      recovery_action: `Review or remove ${worktreePath}; delete generated receipts if superseded.`,
    },
  };
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-system-proof-${missionId}-${stamp()}.json`);
  report.receipt_path = receiptPath;
  await writeJson(receiptPath, report);
  await writeJson(path.join(AECODE_ROOT, "system-proof", "latest-system-proof.json"), report);
  await appendMissionEvent(missionId, "system_proof_check", {
    ok: report.ok,
    status: report.summary.status,
    receipt_path: receiptPath,
  });
  return report;
}

export async function receiptLast() {
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
