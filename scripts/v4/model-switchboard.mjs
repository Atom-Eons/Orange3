#!/usr/bin/env node
/* model-switchboard.mjs - ORANGEBOX Running Brain switch.
 *
 * This module is intentionally no-token by default. It detects local command
 * lanes with version probes only, records the active operator-selected brain,
 * and exposes a route preference that the router/model lane can consume later.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PROVIDER_REGISTRY } from "./subscription-pipes.mjs";

const execFileP = promisify(execFile);

export const MODEL_SWITCHBOARD_VERSION = "orangebox-model-switchboard/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

export const MODEL_SWITCH_PROFILES = [
  {
    id: "gpt",
    label: "GPT / Codex",
    provider: "openai",
    provider_family: "gpt",
    default_model: "gpt-5",
    binary_candidates: ["codex"],
    route_mode: "single",
    role: "Precise execution, coding, command synthesis, and fast product iteration.",
    skills_note: "Uses ORANGEBOX internal skills and Codex workspace skills. Native provider skill folders are not required.",
    env_hint: "OPENAI_API_KEY or Codex subscription CLI",
  },
  {
    id: "opus",
    label: "Opus / Claude Code",
    provider: "anthropic",
    provider_family: "opus",
    default_model: "claude-opus-4-7-20250930",
    binary_candidates: ["claude"],
    route_mode: "single",
    role: "Deep synthesis, architecture, long-context review, and route handoff compression.",
    skills_note: "Reads .claude skills/agents/rules when present; ORANGEBOX route packets remain the shared handoff.",
    env_hint: "ANTHROPIC_API_KEY or Claude Code subscription CLI",
  },
  {
    id: "grok",
    label: "Grok",
    provider: "xai",
    provider_family: "grok",
    default_model: "grok-2",
    binary_candidates: ["grok"],
    route_mode: "single",
    role: "Wildcard, adversarial, realtime-leaning, non-consensus critique lane.",
    skills_note: "Uses ORANGEBOX route packets and internal skills unless a native Grok skill system is detected later.",
    env_hint: "XAI_API_KEY or Grok CLI when installed",
    install_hint: "Inspect https://x.ai/cli/install.sh, then install with: curl -fsSL https://x.ai/cli/install.sh | bash",
    safe_install_command: "curl -fsSL https://x.ai/cli/install.sh | bash",
  },
  {
    id: "gemini",
    label: "Gemini",
    provider: "google",
    provider_family: "gemini",
    default_model: "gemini-1.5-pro-002",
    binary_candidates: ["gemini"],
    route_mode: "single",
    role: "Large-context research, alternate reasoning, comparison, and media-aware planning.",
    skills_note: "Uses ORANGEBOX internal skills; native Gemini skill folders are not required.",
    env_hint: "GOOGLE_API_KEY or Gemini CLI",
  },
  {
    id: "antigravity",
    label: "Antigravity",
    provider: "google",
    provider_family: "gemini",
    default_model: "antigravity-active-agent",
    binary_candidates: ["antigravity", "gemini"],
    route_mode: "single",
    role: "High-agency code curation, green-board diagnostics, local semantic cache intercepts, and autonomous workspace sync.",
    skills_note: "Uses ORANGEBOX internal skills and binds natively to Antigravity plugin and skill structures.",
    env_hint: "Natively authenticated inside the active Antigravity agent shell",
  },
  {
    id: "antigravity-consensus",
    label: "Antigravity Consensus",
    provider: "google",
    provider_family: "gemini",
    default_model: "antigravity-active-agent",
    binary_candidates: ["antigravity", "gemini"],
    route_mode: "trilane",
    role: "Consensus-driven engineering: Antigravity agent leading with Claude/Opus and GPT/Codex as sovereign review lanes.",
    skills_note: "Enforces multi-model consensus verification over code changes prior to final green-board promotion.",
    env_hint: "Active Antigravity shell paired with Anthropic/OpenAI keys or CLIs",
    legs: [
      { id: "antigravity", provider: "google", model: "antigravity-active-agent", role: "lead agent" },
      { id: "opus", provider: "anthropic", model: "claude-opus-4-7-20250930", role: "architecture review" },
      { id: "gpt", provider: "openai", model: "gpt-5", role: "execution review" },
    ],
  },
  {
    id: "grok-superheavy",
    label: "Grok Superheavy",
    provider: "xai",
    provider_family: "grok",
    default_model: "grok-2",
    binary_candidates: ["grok"],
    route_mode: "quadlane",
    role: "Heavy adversarial pass: Grok lead with Opus, GPT, and Gemini as review lanes.",
    skills_note: "Uses ORANGEBOX internal skills plus provider-native skills when each lane exposes them.",
    env_hint: "Best with Grok, Claude, Codex, and Gemini CLIs or matching API keys",
    install_hint: "Grok Superheavy needs Grok plus review lanes. Inspect https://x.ai/cli/install.sh, then install with: curl -fsSL https://x.ai/cli/install.sh | bash",
    safe_install_command: "curl -fsSL https://x.ai/cli/install.sh | bash",
    legs: [
      { id: "grok", provider: "xai", model: "grok-2", role: "lead wildcard" },
      { id: "opus", provider: "anthropic", model: "claude-opus-4-7-20250930", role: "architecture review" },
      { id: "gpt", provider: "openai", model: "gpt-5", role: "execution review" },
      { id: "gemini", provider: "google", model: "gemini-1.5-pro-002", role: "context review" },
    ],
  },
];

const PROFILE_BY_ID = new Map(MODEL_SWITCH_PROFILES.map((profile) => [profile.id, profile]));

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function switchDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "model-switchboard");
}

function switchFile(dataRoot = defaultDataRoot()) {
  return path.join(switchDir(dataRoot), "active-brain.json");
}

function persistedKeyPresence(dataRoot = defaultDataRoot()) {
  const file = path.join(dataRoot, "settings", "api-keys.env");
  const out = {};
  try {
    const text = fsSync.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^([A-Z_]+)=(.*)$/);
      if (match && match[2]) out[match[1]] = true;
    }
  } catch { /* no saved key file */ }
  return out;
}

function sanitizeReason(value) {
  return String(value || "operator selected running brain").replace(/\s+/g, " ").trim().slice(0, 400);
}

function commandForWhich() {
  return process.platform === "win32" ? "where" : "which";
}

async function which(binary) {
  try {
    const { stdout } = await execFileP(commandForWhich(), [binary], { windowsHide: true, timeout: 2500 });
    const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (process.platform === "win32") {
      const runnable = lines.find((line) => /\.(exe|cmd|bat)$/i.test(line));
      if (runnable) return runnable;
      for (const line of lines) {
        for (const ext of [".cmd", ".exe", ".bat"]) {
          const candidate = `${line}${ext}`;
          if (fsSync.existsSync(candidate)) return candidate;
        }
      }
    }
    return lines[0] || null;
  } catch {
    return null;
  }
}

async function probeVersion(binary, args = ["--version"]) {
  try {
    const runner = process.platform === "win32" && /\.(cmd|bat)$/i.test(binary)
      ? {
          file: "powershell.exe",
          args: [
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            `& '${binary.replace(/'/g, "''")}' ${args.map((arg) => `'${String(arg).replace(/'/g, "''")}'`).join(" ")}`,
          ],
        }
      : { file: binary, args };
    const { stdout, stderr } = await execFileP(runner.file, runner.args, { windowsHide: true, timeout: 3500 });
    const first = String(stdout || stderr || "").trim().split(/\r?\n/)[0] || "";
    return { ok: true, version: first || "version-probe-ok" };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

function providerSpec(profile) {
  return PROVIDER_REGISTRY[profile.provider] || null;
}

async function detectProfile(profile) {
  const spec = providerSpec(profile);
  const candidates = profile.binary_candidates?.length ? profile.binary_candidates : (spec?.binaries || []);
  const versionArgs = spec?.version_args || ["--version"];
  for (const binary of candidates) {
    const resolved = await which(binary);
    if (!resolved) continue;
    const version = await probeVersion(resolved, versionArgs);
    return {
      status: version.ok ? "detected" : "detected_but_unhealthy",
      binary,
      path: resolved,
      version: version.version || null,
      version_probe_error: version.ok ? null : version.error,
      probe_kind: "version-only-no-model-call",
    };
  }
  return {
    status: "missing",
    binary: null,
    path: null,
    version: null,
    install_hint: profile.install_hint || spec?.install_hint || `Install ${profile.label} command-line access or configure ${profile.env_hint}.`,
    candidate_binaries: candidates,
    probe_kind: "version-only-no-model-call",
  };
}

async function scanClaudeNativeSkills(workspaceRoot) {
  const dotClaude = path.join(workspaceRoot, ".claude");
  const kinds = [
    ["skills", "skill"],
    ["agents", "agent"],
    ["rules", "rule"],
  ];
  const counts = { skills: 0, agents: 0, rules: 0 };
  const samples = [];
  for (const [dirName, kind] of kinds) {
    const dir = path.join(dotClaude, dirName);
    if (!fsSync.existsSync(dir)) continue;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name.startsWith("_")) continue;
      counts[dirName] += 1;
      if (samples.length < 8) samples.push({ kind, name: entry.name });
    }
  }
  return {
    ok: counts.skills + counts.agents + counts.rules > 0,
    workspace: workspaceRoot,
    dot_claude: dotClaude,
    counts,
    samples,
  };
}

async function skillStatus(profile, workspaceRoot = process.env.ORANGEBOX_WORKSPACE_ROOT || ROOT) {
  const internal = {
    ok: true,
    status: "available",
    count: 12,
    examples: ["sprint", "freeze", "memory", "trilane", "composer", "handoff"],
    note: "ORANGEBOX internal skills are provider-neutral and route through receipts.",
  };
  if (profile.id === "opus") {
    const claude = await scanClaudeNativeSkills(workspaceRoot);
    return {
      native_status: claude.ok ? "observed" : "not_observed",
      native_provider: "claude-code",
      native: claude,
      orangebox_internal: internal,
      note: claude.ok
        ? "Claude-native skills are present and ORANGEBOX internal skills remain available."
        : "No .claude skills were observed in this workspace; ORANGEBOX internal skills still work.",
    };
  }
  return {
    native_status: "not_observed",
    native_provider: profile.provider_family,
    native: {
      ok: false,
      workspace: workspaceRoot,
      counts: {},
      samples: [],
    },
    orangebox_internal: internal,
    note: profile.skills_note,
  };
}

async function readConfig(dataRoot = defaultDataRoot()) {
  const file = switchFile(dataRoot);
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (!PROFILE_BY_ID.has(parsed.active_profile_id)) {
      return { found: true, invalid: true, path: file, active_profile_id: "opus", raw_active_profile_id: parsed.active_profile_id };
    }
    return { found: true, invalid: false, path: file, ...parsed };
  } catch {
    return {
      found: false,
      invalid: false,
      path: file,
      version: MODEL_SWITCHBOARD_VERSION,
      active_profile_id: "opus",
      selected_at: null,
      selected_by: "default",
      reason: "Default ORANGEBOX deep-work lane; no saved Running Brain selection yet.",
    };
  }
}

async function writeRepoReceipt(result, prefix = "orangebox-model-switchboard") {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `${prefix}-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

async function persistConfig(profileId, { dataRoot = defaultDataRoot(), reason = null, selectedBy = "operator" } = {}) {
  const profile = PROFILE_BY_ID.get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: `Unknown model profile: ${profileId}`,
      valid_profiles: MODEL_SWITCH_PROFILES.map((item) => item.id),
    };
  }
  await fs.mkdir(switchDir(dataRoot), { recursive: true });
  const doc = {
    version: MODEL_SWITCHBOARD_VERSION,
    active_profile_id: profile.id,
    active_provider: profile.provider,
    active_model: profile.default_model,
    route_mode: profile.route_mode,
    selected_at: new Date().toISOString(),
    selected_by: selectedBy,
    reason: sanitizeReason(reason),
    no_model_call_made: true,
  };
  const file = switchFile(dataRoot);
  await fs.writeFile(file, JSON.stringify(doc, null, 2) + "\n", "utf8");
  return { ok: true, config: doc, path: file, profile };
}

export async function getModelSwitchboardStatus({
  dataRoot = defaultDataRoot(),
  workspaceRoot = process.env.ORANGEBOX_WORKSPACE_ROOT || ROOT,
  writeReceipt = false,
} = {}) {
  const config = await readConfig(dataRoot);
  const activeProfile = PROFILE_BY_ID.get(config.active_profile_id) || PROFILE_BY_ID.get("opus");
  const savedKeys = persistedKeyPresence(dataRoot);
  const profiles = [];
  for (const profile of MODEL_SWITCH_PROFILES) {
    const [availability, skills] = await Promise.all([
      detectProfile(profile),
      skillStatus(profile, workspaceRoot),
    ]);
    profiles.push({
      ...profile,
      active: profile.id === activeProfile.id,
      availability,
      skills,
      runnable_now: availability.status === "detected" || Boolean(envKeyForProvider(profile.provider, savedKeys)),
      run_note: availability.status === "detected"
        ? "Subscription CLI detected. Execution remains gated by the caller."
        : envKeyForProvider(profile.provider, savedKeys)
          ? `${profile.env_hint} is configured through environment or saved settings.`
          : "Selectable for routing, but live execution needs a CLI or API key.",
    });
  }
  const active = profiles.find((profile) => profile.id === activeProfile.id) || profiles[0];
  const result = {
    ok: true,
    version: MODEL_SWITCHBOARD_VERSION,
    generated_at: new Date().toISOString(),
    config_path: config.path,
    config_found: config.found,
    config_invalid: config.invalid,
    active_profile_id: activeProfile.id,
    active_profile: active,
    profiles,
    safety: {
      no_model_call_made: true,
      no_paid_api_call_made: true,
      detection_kind: "PATH and --version probes only",
      writes_only_when_selecting: true,
    },
    route_preference: routePreferenceForProfile(activeProfile),
    next_action: active?.runnable_now
      ? `${active.label} is selectable and has an observed execution path.`
      : `${active.label} is selected but needs ${active.env_hint} before live execution.`,
  };
  if (writeReceipt) result.receipt_path = await writeReceiptSafe(result, "orangebox-model-switchboard-status");
  return result;
}

function envKeyForProvider(provider, savedKeys = {}) {
  if (provider === "anthropic") return Boolean(process.env.ANTHROPIC_API_KEY || savedKeys.ANTHROPIC_API_KEY);
  if (provider === "openai") return Boolean(process.env.OPENAI_API_KEY || savedKeys.OPENAI_API_KEY);
  if (provider === "google") return Boolean(process.env.GOOGLE_API_KEY || savedKeys.GOOGLE_API_KEY || process.env.ANTIGRAVITY_ACTIVE === "true" || process.env.GEMINI_API_KEY);
  if (provider === "xai") return Boolean(process.env.XAI_API_KEY || savedKeys.XAI_API_KEY);
  return false;
}

async function writeReceiptSafe(result, prefix) {
  try {
    return await writeRepoReceipt(result, prefix);
  } catch {
    return null;
  }
}

export function routePreferenceForProfile(profileOrId) {
  const profile = typeof profileOrId === "string" ? PROFILE_BY_ID.get(profileOrId) : profileOrId;
  if (!profile) return null;
  const base = {
    provider: profile.provider,
    model: profile.default_model,
    running_brain: {
      id: profile.id,
      label: profile.label,
      route_mode: profile.route_mode,
      source: "orangebox-model-switchboard",
    },
  };
  if (profile.id === "antigravity-consensus") {
    return {
      ...base,
      trilane: {
        mode: "trilane",
        legs: profile.legs,
        lead: "antigravity",
      },
      fallbacks: profile.legs.slice(1).map((leg) => ({
        provider: leg.provider,
        model: leg.model,
        note: leg.role,
      })),
      reasoning: "Running Brain override: Antigravity Consensus trilane review.",
    };
  }
  if (profile.id === "grok-superheavy") {
    return {
      ...base,
      trilane: {
        mode: "quadlane",
        legs: profile.legs,
        lead: "grok",
      },
      fallbacks: profile.legs.slice(1).map((leg) => ({
        provider: leg.provider,
        model: leg.model,
        note: leg.role,
      })),
      reasoning: "Running Brain override: Grok Superheavy quadlane review.",
    };
  }
  return {
    ...base,
    reasoning: `Running Brain override: ${profile.label}.`,
  };
}

export async function getActiveRoutePreference({ dataRoot = defaultDataRoot() } = {}) {
  const config = await readConfig(dataRoot);
  return routePreferenceForProfile(config.active_profile_id);
}

export async function selectModelProfile({
  profileId,
  dataRoot = defaultDataRoot(),
  workspaceRoot = process.env.ORANGEBOX_WORKSPACE_ROOT || ROOT,
  reason = null,
  writeReceipt = false,
} = {}) {
  const persisted = await persistConfig(profileId, { dataRoot, reason });
  if (!persisted.ok) return persisted;
  const status = await getModelSwitchboardStatus({ dataRoot, workspaceRoot, writeReceipt: false });
  const result = {
    ok: true,
    version: MODEL_SWITCHBOARD_VERSION,
    selected_at: persisted.config.selected_at,
    config_path: persisted.path,
    active_profile_id: persisted.profile.id,
    active_profile: status.active_profile,
    route_preference: status.route_preference,
    safety: status.safety,
    next_action: status.next_action,
  };
  if (writeReceipt) result.receipt_path = await writeRepoReceipt(result, "orangebox-model-switchboard-select");
  return result;
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
    };
  }
}

export async function runModelSwitchboardDoctor({
  dataRoot = defaultDataRoot(),
  workspaceRoot = process.env.ORANGEBOX_WORKSPACE_ROOT || ROOT,
  writeReceipt = false,
} = {}) {
  const checks = [];
  let status = null;

  checks.push(await gate("profiles_cover_requested_brains", async () => {
    const ids = new Set(MODEL_SWITCH_PROFILES.map((profile) => profile.id));
    const required = ["gpt", "opus", "grok", "gemini", "grok-superheavy"];
    const missing = required.filter((id) => !ids.has(id));
    return {
      ok: missing.length === 0,
      required,
      observed: [...ids],
      missing,
    };
  }));

  checks.push(await gate("status_is_no_token_probe", async () => {
    status = await getModelSwitchboardStatus({ dataRoot, workspaceRoot, writeReceipt: false });
    const unsafe = status.profiles.filter((profile) => profile.availability?.probe_kind !== "version-only-no-model-call");
    return {
      ok: status.ok && unsafe.length === 0 && status.safety?.no_paid_api_call_made === true,
      active_profile_id: status.active_profile_id,
      profile_count: status.profiles.length,
      unsafe_profiles: unsafe.map((profile) => profile.id),
      no_paid_api_call_made: status.safety?.no_paid_api_call_made === true,
    };
  }));

  checks.push(await gate("route_preference_available", async () => {
    const preference = await getActiveRoutePreference({ dataRoot });
    return {
      ok: Boolean(preference?.provider && preference?.model && preference?.running_brain?.id),
      preference,
    };
  }));

  checks.push(await gate("selection_roundtrip_in_temp_root", async () => {
    const tempRoot = path.join(os.tmpdir(), `obx-model-switch-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
    const selected = await selectModelProfile({
      profileId: "grok-superheavy",
      dataRoot: tempRoot,
      workspaceRoot,
      reason: "doctor roundtrip in temp root",
      writeReceipt: false,
    });
    const reread = await getModelSwitchboardStatus({ dataRoot: tempRoot, workspaceRoot, writeReceipt: false });
    return {
      ok: selected.ok && reread.active_profile_id === "grok-superheavy",
      temp_root: tempRoot,
      selected: selected.active_profile_id,
      reread: reread.active_profile_id,
      no_paid_api_call_made: reread.safety?.no_paid_api_call_made === true,
    };
  }));

  checks.push(await gate("skill_reporting_present", async () => {
    if (!status) status = await getModelSwitchboardStatus({ dataRoot, workspaceRoot, writeReceipt: false });
    const missing = status.profiles.filter((profile) => !profile.skills?.orangebox_internal?.ok);
    return {
      ok: missing.length === 0,
      workspace: workspaceRoot,
      missing: missing.map((profile) => profile.id),
      summary: Object.fromEntries(status.profiles.map((profile) => [
        profile.id,
        {
          native_status: profile.skills?.native_status,
          internal_status: profile.skills?.orangebox_internal?.status,
        },
      ])),
    };
  }));

  const failures = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    version: MODEL_SWITCHBOARD_VERSION,
    generated_at: new Date().toISOString(),
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: warnings.length,
    },
    checks,
    failures,
    warnings,
    status: status || await getModelSwitchboardStatus({ dataRoot, workspaceRoot, writeReceipt: false }),
    rollback: {
      config_path: switchFile(dataRoot),
      action: "Delete active-brain.json or switch back with `obx model switch opus --receipt`.",
    },
  };
  if (writeReceipt) result.receipt_path = await writeRepoReceipt(result, "orangebox-model-switchboard-doctor");
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const verb = process.argv[2] || "status";
  const json = process.argv.includes("--json");
  const receipt = process.argv.includes("--receipt");
  const run = verb === "doctor"
    ? await runModelSwitchboardDoctor({ writeReceipt: receipt })
    : verb === "switch"
      ? await selectModelProfile({ profileId: process.argv[3], writeReceipt: receipt })
      : await getModelSwitchboardStatus({ writeReceipt: receipt });
  if (json) console.log(JSON.stringify(run, null, 2));
  else console.log(`${run.ok ? "ok" : "fail"} ${run.active_profile_id || run.status?.active_profile_id || ""}`);
  if (!run.ok) process.exit(4);
}
