#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const appData = process.env.APPDATA || path.join(userRoot, "AppData", "Roaming");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const canonical = path.join(repoRoot, "skills", "orangebox-primer");
const backupRoot = path.join(dataRoot, "skill-backups", `primer-sync-${stamp}`);
const receiptDir = path.join(repoRoot, "receipts");
const latestPath = path.join(dataRoot, "primers", "latest-primer-skill-sync.json");

const fixedTargets = [
  { id: "codex-openai-user", app: "Codex / OpenAI coding agent", dir: path.join(userRoot, ".codex", "skills", "orangebox-primer"), type: "skill" },
  { id: "agents-shared-user", app: "Shared local agent skill root", dir: path.join(userRoot, ".agents", "skills", "orangebox-primer"), type: "skill" },
  { id: "claude-user", app: "Claude Code / Claude user skill root", dir: path.join(userRoot, ".claude", "skills", "orangebox-primer"), type: "skill" },
  { id: "claude-desktop-appdata", app: "Claude Desktop app-data skill root", dir: path.join(appData, "Claude", "skills", "orangebox-primer"), type: "skill" },
  { id: "claude-3p-appdata", app: "Claude 3p app-data skill root", dir: path.join(appData, "Claude-3p", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-global-config-skill", app: "Antigravity official global skill root", dir: path.join(userRoot, ".gemini", "config", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-gemini-plugin", app: "Antigravity / Gemini plugin skill root", dir: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-cli-global-skill", app: "Antigravity CLI official global skill root", dir: path.join(userRoot, ".gemini", "antigravity-cli", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-cli-plugin-skill", app: "Antigravity CLI plugin skill root", dir: path.join(userRoot, ".gemini", "antigravity-cli", "plugins", "orangebox-plugin", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-appdata", app: "Antigravity app-data skill root", dir: path.join(appData, "Antigravity", "skills", "orangebox-primer"), type: "skill" },
  { id: "gemini-user", app: "Gemini user skill root", dir: path.join(userRoot, ".gemini", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-workspace-skill", app: "Antigravity workspace skill root", dir: path.join(repoRoot, ".agents", "skills", "orangebox-primer"), type: "skill" },
  { id: "antigravity-workspace-plugin-skill", app: "Antigravity workspace plugin skill root", dir: path.join(repoRoot, ".agents", "plugins", "orangebox-plugin", "skills", "orangebox-primer"), type: "skill" },
  { id: "orangebox-repo", app: "Orangebox repo mirror", dir: path.join(repoRoot, "skills", "orangebox-primer"), type: "skill" },
];

const legacySkillRoots = [
  path.join(userRoot, ".codex", "skills"),
  path.join(userRoot, ".agents", "skills"),
  path.join(userRoot, ".claude", "skills"),
  path.join(appData, "Claude", "skills"),
  path.join(appData, "Claude-3p", "skills"),
  path.join(appData, "Antigravity", "skills"),
  path.join(userRoot, ".gemini", "skills"),
  path.join(userRoot, ".gemini", "config", "skills"),
  path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills"),
  path.join(userRoot, ".gemini", "antigravity-cli", "skills"),
  path.join(repoRoot, ".agents", "skills"),
  path.join(repoRoot, ".agents", "plugins", "orangebox-plugin", "skills"),
];

const staleSkillPattern = /^(ae[-_ ]?0|ae0|ae[-_ ]?[1-9][0-9]?|ae[-_ ]?code|aecode|ae[-_ ]?factory|aefactory|ae[-_ ]?skill|aeskill|aeskills|old[-_ ]?orangebox|openclaw|open[-_ ]?claw)([-_ ].*)?$/i;

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(p) {
  return fs.existsSync(p);
}

function copyDir(source, destination) {
  if (path.resolve(source).toLowerCase() === path.resolve(destination).toLowerCase()) return false;
  ensureDir(path.dirname(destination));
  fs.cpSync(source, destination, { recursive: true, force: true, errorOnExist: false });
  return true;
}

function backupExisting(target) {
  if (!exists(target) || path.resolve(target).toLowerCase() === path.resolve(canonical).toLowerCase()) return null;
  const safeId = target.replace(/^[A-Za-z]:/, "").replace(/[\\/:\s]+/g, "_").replace(/^_+/, "");
  const destination = path.join(backupRoot, "existing-targets", safeId);
  ensureDir(path.dirname(destination));
  fs.cpSync(target, destination, { recursive: true, force: true, errorOnExist: false });
  return destination;
}

function moveLegacySkill(source) {
  if (!exists(source)) return null;
  const lower = path.resolve(source).toLowerCase();
  const allowedRoots = [
    path.join(userRoot, ".codex", "skills").toLowerCase(),
    path.join(userRoot, ".agents", "skills").toLowerCase(),
    path.join(userRoot, ".claude", "skills").toLowerCase(),
    path.join(appData, "Claude", "skills").toLowerCase(),
    path.join(appData, "Claude-3p", "skills").toLowerCase(),
    path.join(appData, "Antigravity", "skills").toLowerCase(),
    path.join(userRoot, ".gemini", "skills").toLowerCase(),
    path.join(userRoot, ".gemini", "config", "skills").toLowerCase(),
    path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills").toLowerCase(),
    path.join(userRoot, ".gemini", "antigravity-cli", "skills").toLowerCase(),
    path.join(repoRoot, ".agents", "skills").toLowerCase(),
    path.join(repoRoot, ".agents", "plugins", "orangebox-plugin", "skills").toLowerCase(),
  ];
  if (!allowedRoots.some((root) => lower.startsWith(root))) {
    throw new Error(`Refusing to move unexpected path: ${source}`);
  }
  const skillName = path.basename(source);
  const bucket = lower.includes("\\.claude\\") ? "claude" : lower.includes("\\.agents\\") ? "agents" : "codex";
  const destination = path.join(backupRoot, "removed-active-legacy-skills", bucket, skillName);
  ensureDir(path.dirname(destination));
  fs.renameSync(source, destination);
  return { source, destination };
}

function discoverLegacySkills() {
  const found = [];
  for (const root of legacySkillRoots) {
    if (!exists(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name === "orangebox-primer") continue;
      if (!staleSkillPattern.test(entry.name)) continue;
      found.push(path.join(root, entry.name));
    }
  }
  return [...new Set(found.map((item) => path.resolve(item)))];
}

function installedAppHints() {
  const candidates = [
    ["codex", path.join(userRoot, ".codex")],
    ["agents", path.join(userRoot, ".agents")],
    ["claude", path.join(userRoot, ".claude")],
    ["claude-desktop", path.join(appData, "Claude")],
    ["claude-3p", path.join(appData, "Claude-3p")],
    ["antigravity", path.join(appData, "Antigravity")],
    ["gemini", path.join(userRoot, ".gemini")],
    ["antigravity-cli", path.join(userRoot, ".gemini", "antigravity-cli")],
    ["cursor", path.join(userRoot, ".cursor")],
    ["cursor-appdata", path.join(appData, "Cursor")],
    ["windsurf", path.join(userRoot, ".windsurf")],
    ["continue", path.join(userRoot, ".continue")],
  ];
  return candidates.map(([id, dir]) => ({ id, dir, detected: exists(dir) }));
}

function writeAntigravityPluginFiles() {
  const pluginRoots = [
    {
      id: "antigravity-global-plugin",
      dir: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin"),
    },
    {
      id: "antigravity-cli-global-plugin",
      dir: path.join(userRoot, ".gemini", "antigravity-cli", "plugins", "orangebox-plugin"),
    },
    {
      id: "antigravity-workspace-plugin",
      dir: path.join(repoRoot, ".agents", "plugins", "orangebox-plugin"),
    },
  ];

  const written = [];
  for (const plugin of pluginRoots) {
    ensureDir(plugin.dir);
    const pluginJson = path.join(plugin.dir, "plugin.json");
    fs.writeFileSync(pluginJson, `${JSON.stringify({
      name: "orangebox-plugin",
      version: "1.0.0",
      description: "Orangebox Version 1 backend Ops primer, command deck, and receipt-proof bridge.",
      author: { name: "AtomEons Systems Laboratory" },
      license: "Commercial",
      keywords: ["orangebox", "obox", "aecode", "backend-ops", "receipts", "skills"],
    }, null, 2)}\n`, "utf8");

    const rootSkill = path.join(plugin.dir, "skills", "SKILL.md");
  ensureDir(path.dirname(rootSkill));
  let backedUp = null;
  if (exists(rootSkill)) {
    const current = fs.readFileSync(rootSkill, "utf8");
    if (!current.includes("orangebox-primer")) {
      backedUp = path.join(backupRoot, "antigravity-root-SKILL.md");
      ensureDir(path.dirname(backedUp));
      fs.copyFileSync(rootSkill, backedUp);
    }
  }
  const body = `---
name: orangebox
description: Backend-only Orangebox primer redirect. Use before any Orangebox, AECode, AtomEons, OBox, or system-proof work in Antigravity/Gemini.
---

# Orangebox Antigravity Entry

Load and follow \`$orangebox-primer\` first.

Active lane: Orangebox Ops backend. Orangebox is one governed local-first software factory, not one app, website, store, or visual build.

Default action:
1. Run the Orangebox system check from the primer.
2. Confirm whether the task is backend Ops, primer, ChatBackup, AECode contract, gauntlet, receipt, model routing, worktree, deploy intake, or incoming module intake.
3. Do not start visual, store, website, deployment, or broad app generation without explicit operator approval.

For Antigravity itself, prefer the CWD-safe launcher:

\`\`\`powershell
cd C:\\AtomEons\\orangebox-delta
npm.cmd run antigravity:launch
\`\`\`

AECode is the middle voice for writing final output contracts. React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, and deployments are output targets, not the master.
`;
  fs.writeFileSync(rootSkill, body, "utf8");
    written.push({ ...plugin, plugin_json: pluginJson, rootSkill, backedUp });
  }
  return written;
}

function writeRuleAdapters() {
  const adapters = [];
  const antigravityGlobalRule = path.join(userRoot, ".gemini", "GEMINI.md");
  ensureDir(path.dirname(antigravityGlobalRule));
  const antigravityGlobalBody = `# Orangebox Global Rule

When the user says Orangebox, OBox, OB0X, AECode, AtomEons, system proof, gauntlet, receipt, Codexa, STRONGARM, Misfits, AtomSmasher, or backend Ops, treat the request as Orangebox Version 1 backend operations work.

Load the Orangebox primer skill before acting:

- C:\\Users\\a\\.gemini\\config\\skills\\orangebox-primer\\SKILL.md
- C:\\AtomEons\\orangebox-delta\\skills\\orangebox-primer\\SKILL.md

First move: run or summarize the Orangebox system check. Default lane is backend Ops. Do not edit frontend, website, store, or visual/product lanes unless the operator explicitly authorizes that lane in the current chat.
`;
  let globalRuleBackup = null;
  if (exists(antigravityGlobalRule)) {
    const current = fs.readFileSync(antigravityGlobalRule, "utf8");
    if (!current.includes("# Orangebox Global Rule")) {
      globalRuleBackup = path.join(backupRoot, "gemini-GEMINI.md");
      ensureDir(path.dirname(globalRuleBackup));
      fs.copyFileSync(antigravityGlobalRule, globalRuleBackup);
    }
  }
  fs.writeFileSync(antigravityGlobalRule, antigravityGlobalBody, "utf8");
  adapters.push({ id: "antigravity-global-gemini-rule", file: antigravityGlobalRule, backed_up_to: globalRuleBackup });

  const antigravityRuleDirs = [
    path.join(repoRoot, ".agents", "rules"),
    path.join(repoRoot, ".agent", "rules"),
  ];
  for (const rulesDir of antigravityRuleDirs) {
    ensureDir(rulesDir);
    const file = path.join(rulesDir, "orangebox-primer.md");
    const body = `---
description: Always apply for Orangebox/OBox/AECode/backend Ops requests.
alwaysApply: true
---

# Orangebox Version 1 Backend Ops

When the user says Orangebox, OBox, OB0X, AECode, AtomEons, system proof, gauntlet, receipt, Codexa, STRONGARM, Misfits, AtomSmasher, or backend Ops:

1. Load \`../skills/orangebox-primer/SKILL.md\`.
2. Run or summarize the Orangebox system check.
3. Keep the active lane as Orangebox Ops backend.
4. Do not edit frontend, website, store, or visual/product lanes unless the operator explicitly authorizes that lane.
5. Proof before report. Receipts over vibes.
6. When opening Antigravity for Orangebox work, launch from the repo root with \`npm.cmd run antigravity:launch\` so workspace paths, rules, skills, and MCP configs resolve from Orangebox instead of the user home directory.
`;
    fs.writeFileSync(file, body, "utf8");
    adapters.push({ id: `antigravity-workspace-rule-${path.basename(path.dirname(rulesDir))}`, file });
  }

  const cursorDir = path.join(userRoot, ".cursor");
  if (exists(cursorDir)) {
    const rulesDir = path.join(cursorDir, "rules");
    ensureDir(rulesDir);
    const file = path.join(rulesDir, "orangebox-primer.mdc");
    const body = `---
description: Orangebox Ops primer for Cursor-style rule agents.
alwaysApply: false
---

When the user says Orangebox, OBox, AECode, AtomEons, system proof, gauntlet, receipt, or backend Ops, read:

- C:\\AtomEons\\orangebox-delta\\skills\\orangebox-primer\\SKILL.md
- C:\\AtomEons\\orangebox-delta\\references\\session-primer.md

Default to Orangebox Ops backend. Do not edit frontend/ or visual/product lanes unless the operator explicitly authorizes that lane.
Run backend proof with:

\`\`\`powershell
cd C:\\AtomEons\\orangebox-delta
npm.cmd run backend:proof
\`\`\`
`;
    fs.writeFileSync(file, body, "utf8");
    adapters.push({ id: "cursor-rule", file });
  }
  const windsurfDir = path.join(userRoot, ".windsurf");
  if (exists(windsurfDir)) {
    const rulesDir = path.join(windsurfDir, "rules");
    ensureDir(rulesDir);
    const file = path.join(rulesDir, "orangebox-primer.md");
    fs.writeFileSync(file, "Read C:\\AtomEons\\orangebox-delta\\skills\\orangebox-primer\\SKILL.md before Orangebox work. Default lane: backend Ops. Visual lane requires explicit operator authorization.\n", "utf8");
    adapters.push({ id: "windsurf-rule", file });
  }
  return adapters;
}

function mirrorChatPrimer() {
  const source = path.join(repoRoot, "docs", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER_2026-05-28.md");
  if (!exists(source)) return null;
  const destination = path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md");
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  return { source, destination };
}

function main() {
  if (!exists(path.join(canonical, "SKILL.md"))) {
    throw new Error(`Missing canonical repo orangebox-primer skill: ${canonical}`);
  }

  const legacyActiveSkills = discoverLegacySkills();
  const movedLegacy = legacyActiveSkills.map(moveLegacySkill).filter(Boolean);
  const synced = [];
  for (const target of fixedTargets) {
    const backedUp = backupExisting(target.dir);
    const copied = copyDir(canonical, target.dir);
    synced.push({ ...target, destination: target.dir, backed_up_to: backedUp, copied });
  }

  const antigravityPlugins = writeAntigravityPluginFiles();
  const ruleAdapters = writeRuleAdapters();
  const chatPrimer = mirrorChatPrimer();

  const result = {
    ok: true,
    kind: "orangebox-primer-skill-sync",
    version: "orangebox-primer-skill-sync/v1",
    timestamp: new Date().toISOString(),
    canonical,
    installed_app_hints: installedAppHints(),
    synced,
    rule_adapters: ruleAdapters,
    moved_legacy: movedLegacy,
    antigravity_plugins: antigravityPlugins,
    chat_primer: chatPrimer,
    backup_root: backupRoot,
    note: "Orangebox primer installed into Codex/OpenAI, shared agents, Claude, Claude Desktop app data, Antigravity/Gemini, and repo mirrors. Cursor/Windsurf get rule adapters when present because they do not use SKILL.md the same way.",
  };

  ensureDir(path.dirname(latestPath));
  fs.writeFileSync(latestPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-primer-skill-sync-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Orangebox primer synced to ${synced.length} skill targets.`);
    console.log(`Rule adapters written: ${ruleAdapters.length}`);
    console.log(`Legacy active skills moved: ${movedLegacy.length}`);
  }
}

main();
