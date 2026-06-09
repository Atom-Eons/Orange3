#!/usr/bin/env node
/*
  orangebox-antigravity-doctor.mjs

  Verifies the Antigravity/Gemini side of Orangebox Version 1 without touching
  frontend code. This checks official skill/plugin/rule locations, the local
  launcher that pins CWD to the Orangebox repo, and the permission/profile shape
  expected by the current operator setup.
*/

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
const appData = process.env.APPDATA || path.join(userRoot, "AppData", "Roaming");
const localAppData = process.env.LOCALAPPDATA || path.join(userRoot, "AppData", "Local");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const reportDir = path.join(dataRoot, "antigravity");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function fileProof(id, file, required = true) {
  return { id, file, required, exists: exists(file), ok: !required || exists(file) };
}

function arrayIncludes(items, value) {
  return Array.isArray(items) && items.includes(value);
}

async function main() {
  const packageJson = readJson(path.join(repoRoot, "package.json")) || {};
  const configPath = path.join(userRoot, ".gemini", "config", "config.json");
  const config = readJson(configPath) || {};
  const grants = config.userSettings?.globalPermissionGrants?.allow || [];
  const globalRulePath = path.join(userRoot, ".gemini", "GEMINI.md");
  const workspaceRulePath = path.join(repoRoot, ".agents", "rules", "orangebox-primer.md");
  const legacyWorkspaceRulePath = path.join(repoRoot, ".agent", "rules", "orangebox-primer.md");
  const launcherPath = path.join(repoRoot, "scripts", "v4", "start-antigravity-orangebox.ps1");

  const pathChecks = [
    fileProof("antigravity_exe", path.join(localAppData, "Programs", "antigravity", "Antigravity.exe")),
    fileProof("antigravity_cli_node", path.join(appData, "Antigravity", "bin", "agy-node.cmd")),
    fileProof("global_config_skill", path.join(userRoot, ".gemini", "config", "skills", "orangebox-primer", "SKILL.md")),
    fileProof("cli_global_skill", path.join(userRoot, ".gemini", "antigravity-cli", "skills", "orangebox-primer", "SKILL.md")),
    fileProof("workspace_skill", path.join(repoRoot, ".agents", "skills", "orangebox-primer", "SKILL.md")),
    fileProof("global_plugin_manifest", path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "plugin.json")),
    fileProof("global_plugin_skill", path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md")),
    fileProof("cli_plugin_manifest", path.join(userRoot, ".gemini", "antigravity-cli", "plugins", "orangebox-plugin", "plugin.json")),
    fileProof("cli_plugin_skill", path.join(userRoot, ".gemini", "antigravity-cli", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md")),
    fileProof("workspace_plugin_manifest", path.join(repoRoot, ".agents", "plugins", "orangebox-plugin", "plugin.json")),
    fileProof("workspace_plugin_skill", path.join(repoRoot, ".agents", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md")),
    fileProof("global_rule", globalRulePath),
    fileProof("workspace_rule", workspaceRulePath),
    fileProof("legacy_workspace_rule", legacyWorkspaceRulePath),
    fileProof("cwd_safe_launcher", launcherPath),
  ];

  const globalRule = readText(globalRulePath);
  const workspaceRule = readText(workspaceRulePath);
  const packageScripts = {
    primer_sync: Boolean(packageJson.scripts?.["primer:sync"]),
    skills_lifecycle: Boolean(packageJson.scripts?.["skills:lifecycle"]),
    health_report: Boolean(packageJson.scripts?.["health:report"]),
    project_report: Boolean(packageJson.scripts?.["project:report"]),
    antigravity_doctor: Boolean(packageJson.scripts?.["antigravity:doctor"]),
    antigravity_launch: Boolean(packageJson.scripts?.["antigravity:launch"]),
    antigravity_launch_dry: Boolean(packageJson.scripts?.["antigravity:launch:dry"]),
  };
  const packageScriptsOk = Object.values(packageScripts).every(Boolean);

  const permissionProfile = {
    config_path: configPath,
    exists: exists(configPath),
    browser_js_execution_policy: config.userSettings?.browserJsExecutionPolicy || null,
    theme_mode: config.userSettings?.themeMode || null,
    orange_foreground: config.userSettings?.customThemeSeedsLight?.foregroundOverride || null,
    dark_background: config.userSettings?.customThemeSeedsLight?.background || null,
    command_star_allowed: arrayIncludes(grants, "command(*)"),
    mcp_star_allowed: arrayIncludes(grants, "mcp(*)"),
    read_url_star_allowed: arrayIncludes(grants, "read_url(*)"),
    unsandboxed_star_allowed: arrayIncludes(grants, "unsandboxed(*)"),
    grant_count: Array.isArray(grants) ? grants.length : 0,
  };
  permissionProfile.ok =
    permissionProfile.exists &&
    permissionProfile.browser_js_execution_policy === "BROWSER_JS_EXECUTION_POLICY_TURBO" &&
    permissionProfile.command_star_allowed &&
    permissionProfile.mcp_star_allowed &&
    permissionProfile.unsandboxed_star_allowed;

  const ruleProof = {
    global_mentions_orangebox: /Orangebox|OB0X|AECode/i.test(globalRule),
    global_blocks_unapproved_visual_lane: /visual|frontend|website|store/i.test(globalRule),
    workspace_mentions_primer: /orangebox-primer/i.test(workspaceRule),
    workspace_always_apply: /alwaysApply:\s*true/i.test(workspaceRule),
  };
  ruleProof.ok = Object.values(ruleProof).every(Boolean);

  const cwdFix = {
    implemented: exists(launcherPath),
    why: "Community reports indicate Antigravity can start from the user home directory, causing relative skill/rule/MCP paths to misfire. The Orangebox launcher pins cwd and environment to the repo root before opening Antigravity.",
    command: "npm.cmd run antigravity:launch",
    dry_command: "npm.cmd run antigravity:launch:dry",
    launcher_path: launcherPath,
  };
  cwdFix.ok = cwdFix.implemented;

  const missing = [
    ...pathChecks.filter((check) => !check.ok).map((check) => check.id),
    ...Object.entries(packageScripts).filter(([, ok]) => !ok).map(([name]) => `script:${name}`),
    ...(permissionProfile.ok ? [] : ["permission_profile"]),
    ...(ruleProof.ok ? [] : ["rule_proof"]),
    ...(cwdFix.ok ? [] : ["cwd_fix"]),
  ];

  const result = {
    ok: missing.length === 0,
    version: "orangebox-antigravity-doctor/v1",
    status: missing.length === 0 ? "ORANGEBOX_ANTIGRAVITY_GREEN" : "ORANGEBOX_ANTIGRAVITY_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    path_checks: pathChecks,
    package_scripts: packageScripts,
    permission_profile: permissionProfile,
    rule_proof: ruleProof,
    cwd_fix: cwdFix,
    optimization_posture: {
      official_paths: "Use official Antigravity skills, plugins, rules, and CLI roots; do not rely only on legacy .agent paths.",
      skills_vs_workflows: "Keep Orangebox as an always-available skill/rule; use commands/workflows for specific proof sequences.",
      mcp_policy: "Use audited MCPs through Orangebox quarantine. Avoid always-on MCP bloat for tasks that a skill can handle.",
      visual_tools: "Visual architecture/diagram MCPs may be useful, but stay in candidate/quarantine unless the operator opens the visual lane.",
      full_access_note: "Full access is present by operator preference; Orangebox constrains behavior with primer, receipts, path/lane law, and proof doctors.",
    },
    missing,
  };

  await writeJson(path.join(reportDir, "latest-antigravity-doctor.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-antigravity-doctor-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(reportDir, "latest-antigravity-doctor.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
