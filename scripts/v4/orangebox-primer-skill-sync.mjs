#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const canonical = path.join(userRoot, ".codex", "skills", "orangebox-primer");
const backupRoot = path.join(dataRoot, "skill-backups", `primer-sync-${stamp}`);
const receiptDir = path.join(repoRoot, "receipts");

const targets = [
  { id: "claude-desktop", dir: path.join(userRoot, ".claude", "skills", "orangebox-primer") },
  {
    id: "antigravity-plugin",
    dir: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer"),
  },
  { id: "orangebox-repo", dir: path.join(repoRoot, "skills", "orangebox-primer") },
];

const legacyActiveSkills = [
  path.join(userRoot, ".codex", "skills", "ae-factory"),
  path.join(userRoot, ".agents", "skills", "ae-factory"),
  path.join(userRoot, ".agents", "skills", "orangebox-primer"),
  path.join(userRoot, ".claude", "skills", "ae-code"),
  path.join(userRoot, ".claude", "skills", "ae-design"),
  path.join(userRoot, ".claude", "skills", "ae-factory"),
  path.join(userRoot, ".claude", "skills", "ae-launch"),
  path.join(userRoot, ".claude", "skills", "ae-legal"),
  path.join(userRoot, ".claude", "skills", "ae-marketing"),
  path.join(userRoot, ".claude", "skills", "ae-ops"),
  path.join(userRoot, ".claude", "skills", "ae-product"),
  path.join(userRoot, ".claude", "skills", "ae-researcher"),
  path.join(userRoot, ".claude", "skills", "ae-review-panel"),
  path.join(userRoot, ".claude", "skills", "ae-sales"),
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyDir(source, destination) {
  ensureDir(path.dirname(destination));
  fs.cpSync(source, destination, { recursive: true, force: true, errorOnExist: false });
}

function moveLegacySkill(source) {
  if (!fs.existsSync(source)) return null;
  const lower = path.resolve(source).toLowerCase();
  const allowedRoots = [
    path.join(userRoot, ".codex", "skills").toLowerCase(),
    path.join(userRoot, ".agents", "skills").toLowerCase(),
    path.join(userRoot, ".claude", "skills").toLowerCase(),
  ];
  if (!allowedRoots.some((root) => lower.startsWith(root))) {
    throw new Error(`Refusing to move unexpected path: ${source}`);
  }
  const skillName = path.basename(source);
  const bucket = lower.includes("\\.claude\\") ? "claude" : lower.includes("\\.agents\\") ? "agents-codex-root" : "codex";
  const destination = path.join(backupRoot, "removed-active-legacy-skills", bucket, skillName);
  ensureDir(path.dirname(destination));
  fs.renameSync(source, destination);
  return { source, destination };
}

function writeAntigravityRootSkill() {
  const rootSkill = path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "SKILL.md");
  ensureDir(path.dirname(rootSkill));
  let backedUp = null;
  if (fs.existsSync(rootSkill)) {
    const current = fs.readFileSync(rootSkill, "utf8");
    if (!current.includes("orangebox-primer")) {
      backedUp = path.join(backupRoot, "antigravity-root-SKILL.md");
      ensureDir(path.dirname(backedUp));
      fs.copyFileSync(rootSkill, backedUp);
    }
  }
  const body = `---
name: orangebox
description: Backend-only Orangebox primer redirect. Use this before any Orangebox/AECode work in Antigravity.
---

# Orangebox Antigravity Entry

Load and follow \`$orangebox-primer\` first.

Active lane: Orangebox Ops backend. Orangebox is one governed local-first software factory, not one app, website, store, or visual build.

Default action:
1. Run the Orangebox system check from the primer.
2. Confirm the task is backend Ops, primer, ChatBackup, AECode contract, gauntlet, receipt, model routing, or incoming module intake.
3. Refuse old AE Factory behavior that starts visual, store, website, deployment, or broad app generation without explicit operator approval.

AECode is the middle voice for writing final output contracts. React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, and deployments are output targets, not the master.
`;
  fs.writeFileSync(rootSkill, body, "utf8");
  return { rootSkill, backedUp };
}

function mirrorChatPrimer() {
  const source = path.join(repoRoot, "docs", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER_2026-05-28.md");
  if (!fs.existsSync(source)) return null;
  const destination = path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md");
  ensureDir(path.dirname(destination));
  fs.copyFileSync(source, destination);
  return { source, destination };
}

function main() {
  if (!fs.existsSync(path.join(canonical, "SKILL.md"))) {
    throw new Error(`Missing canonical orangebox-primer skill: ${canonical}`);
  }

  const movedLegacy = legacyActiveSkills.map(moveLegacySkill).filter(Boolean);
  const synced = [];
  for (const target of targets) {
    copyDir(canonical, target.dir);
    synced.push({ id: target.id, destination: target.dir });
  }

  const antigravityRoot = writeAntigravityRootSkill();
  const chatPrimer = mirrorChatPrimer();

  const result = {
    ok: true,
    kind: "orangebox-primer-skill-sync",
    timestamp: new Date().toISOString(),
    canonical,
    synced,
    moved_legacy: movedLegacy,
    antigravity_root: antigravityRoot,
    chat_primer: chatPrimer,
    backup_root: backupRoot,
    note: "Codex canonical primer mirrored to Claude, Antigravity, and repo. Shared .agents copy is kept out to avoid duplicate Codex skill discovery.",
  };

  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-primer-skill-sync-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Orangebox primer synced to ${synced.length} targets.`);
    console.log(`Legacy active skills moved: ${movedLegacy.length}`);
  }
}

main();
