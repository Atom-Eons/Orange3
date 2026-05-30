#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function exists(p) {
  return fs.existsSync(p);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function newestDir(root) {
  if (!exists(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return dirs[0]?.full || null;
}

function main() {
  const heartbeatPath = path.join(dataRoot, "chat-mirror", "listener-heartbeat.json");
  const heartbeat = readJson(heartbeatPath);
  const lastFinished = heartbeat?.last_finished ? Date.parse(heartbeat.last_finished) : 0;
  const heartbeatFresh = Boolean(heartbeat?.ok) && Number.isFinite(lastFinished) && Date.now() - lastFinished < 10 * 60 * 1000;
  const watcherHeartbeatPath = path.join(dataRoot, "watcher", "watcher-process-heartbeat.json");
  const watcherHeartbeat = readJson(watcherHeartbeatPath);
  const watcherLastFinished = watcherHeartbeat?.last_finished ? Date.parse(watcherHeartbeat.last_finished) : 0;
  const watcherFresh = Boolean(watcherHeartbeat?.ok) && Number.isFinite(watcherLastFinished) && Date.now() - watcherLastFinished < 15 * 60 * 1000;
  const chatArchiveDir = newestDir(path.join(dataRoot, "chat-archives"));
  const atomSmasherIntakePath = path.join(dataRoot, "incoming", "atomsmasher-module-intake.json");
  const atomSmasherIntake = readJson(atomSmasherIntakePath);
  const atomSmasherDoctorPath = path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json");
  const atomSmasherDoctor = readJson(atomSmasherDoctorPath);
  const atomSmasherToolMergePath = path.join(dataRoot, "atomsmasher", "tool-merge", "latest-tool-merge.json");
  const atomSmasherToolMerge = readJson(atomSmasherToolMergePath);
  const midSessionPrimerPath = path.join(dataRoot, "primers", "ORANGEBOX_MID_SESSION_PRIMER.md");
  const titleProtocolPath = path.join(dataRoot, "primers", "OB0X_ON_TITLE_PROTOCOL.json");
  const sourceLockPath = path.join(dataRoot, "orangebox-source-of-truth.json");
  const restartLockPath = path.join(dataRoot, "restart", "latest-restart-lock.json");
  const sourceLock = readJson(sourceLockPath);
  const codexaConfigPath = path.join(dataRoot, "codexa-sync", "latest-codexa-config.json");
  const codexaConfig = readJson(codexaConfigPath);
  const antigravityRoot = path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "SKILL.md");
  const antigravityText = exists(antigravityRoot) ? fs.readFileSync(antigravityRoot, "utf8") : "";

  const checks = {
    chat_primer: {
      ok: exists(path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md")),
      path: path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md"),
    },
    mid_session_primer: {
      ok: exists(midSessionPrimerPath) && exists(titleProtocolPath),
      primer_path: midSessionPrimerPath,
      title_protocol_path: titleProtocolPath,
      expected_title_suffix: "OB0X ON",
    },
    source_of_truth_restart_lock: {
      ok: sourceLock?.status === "ORANGEBOX_RESTART_LOCK_GREEN" && exists(restartLockPath),
      source_lock_path: sourceLockPath,
      restart_lock_path: restartLockPath,
      status: sourceLock?.status || null,
    },
    codexa_config_sync: {
      ok: codexaConfig?.status === "CODEXA_ORANGEBOX_CONFIG_READY" || codexaConfig?.version === "orangebox-codexa-config/v0",
      path: codexaConfigPath,
      status: codexaConfig?.status || null,
    },
    skill_primer: {
      ok:
        exists(path.join(userRoot, ".codex", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, ".agents", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, ".claude", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, "AppData", "Roaming", "Claude", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, "AppData", "Roaming", "Claude-3p", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, "AppData", "Roaming", "Antigravity", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(userRoot, ".gemini", "skills", "orangebox-primer", "SKILL.md")) &&
        exists(path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md")),
      codex: path.join(userRoot, ".codex", "skills", "orangebox-primer", "SKILL.md"),
      shared_agents: path.join(userRoot, ".agents", "skills", "orangebox-primer", "SKILL.md"),
      claude: path.join(userRoot, ".claude", "skills", "orangebox-primer", "SKILL.md"),
      claude_desktop: path.join(userRoot, "AppData", "Roaming", "Claude", "skills", "orangebox-primer", "SKILL.md"),
      claude_3p: path.join(userRoot, "AppData", "Roaming", "Claude-3p", "skills", "orangebox-primer", "SKILL.md"),
      antigravity: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md"),
      antigravity_appdata: path.join(userRoot, "AppData", "Roaming", "Antigravity", "skills", "orangebox-primer", "SKILL.md"),
      gemini_user: path.join(userRoot, ".gemini", "skills", "orangebox-primer", "SKILL.md"),
      repo: path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md"),
    },
    antigravity_redirect: {
      ok: antigravityText.includes("orangebox-primer") && antigravityText.includes("Backend-only"),
      path: antigravityRoot,
    },
    chatbackup_listener: {
      ok: heartbeatFresh,
      heartbeat_path: heartbeatPath,
      heartbeat,
    },
    chatbackup_startup: {
      ok: exists(path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Orangebox ChatBackup Listener.lnk")),
      path: path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Orangebox ChatBackup Listener.lnk"),
    },
    reality_watcher: {
      ok: watcherFresh,
      heartbeat_path: watcherHeartbeatPath,
      heartbeat: watcherHeartbeat,
    },
    chat_archive_export: {
      ok: Boolean(chatArchiveDir) && exists(path.join(chatArchiveDir || "", "chat-duplicate.md")) && exists(path.join(chatArchiveDir || "", "chat-screenplay.md")),
      latest_archive_dir: chatArchiveDir,
    },
    atomsmasher_intake: {
      ok:
        atomSmasherDoctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN" ||
        atomSmasherIntake?.status === "WAITING_FOR_HEAVY_SPEC",
      path: atomSmasherIntakePath,
      status: atomSmasherIntake?.status || null,
    },
    atomsmasher_integration: {
      ok: atomSmasherDoctor?.ok === true && atomSmasherDoctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN",
      path: atomSmasherDoctorPath,
      status: atomSmasherDoctor?.summary?.status || null,
      features_registered: atomSmasherDoctor?.summary?.features_registered || 0,
      features_ok: atomSmasherDoctor?.summary?.features_ok || 0,
      schema_version: atomSmasherDoctor?.summary?.schema_version || null,
    },
    atomsmasher_tool_merge: {
      ok: atomSmasherToolMerge?.ok === true && atomSmasherToolMerge?.status === "ATOMSMASHER_TOOL_MERGE_GREEN",
      path: atomSmasherToolMergePath,
      status: atomSmasherToolMerge?.status || null,
      eligible_backend_tools: atomSmasherToolMerge?.manifest?.totals?.eligible_backend_tools || 0,
      excluded_visual_or_product_lane: atomSmasherToolMerge?.manifest?.totals?.excluded_visual_or_product_lane || 0,
    },
    bookmaker_deferred: {
      ok: !exists(path.join(repoRoot, "scripts", "v4", "bookmaker-documentarian.mjs")),
      expected: "Bookmaker is deferred; no active script should exist.",
    },
  };

  const ok = Object.values(checks).every((check) => check.ok);
  const result = {
    ok,
    version: "orangebox-ops-readiness/v0",
    status: ok ? "ORANGEBOX_OPS_RAILS_GREEN" : "ORANGEBOX_OPS_RAILS_NOT_GREEN",
    checked_at: new Date().toISOString(),
    checks,
  };

  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-ops-readiness-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status);
  }
  if (!ok) process.exitCode = 1;
}

main();
