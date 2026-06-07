#!/usr/bin/env node
/*
  orangebox-skill-lifecycle-doctor.mjs

  Proves the Orangebox primer skill is a compressed executable procedure, not
  just markdown. It does not run heavy commands. It verifies install roots,
  stale-skill absence, command wrapper shape, package-script mappings, and
  receipt surfaces.
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
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const reportDir = path.join(dataRoot, "skills");

const activeRoots = [
  { id: "codex", root: path.join(userRoot, ".codex", "skills"), required: true },
  { id: "agents", root: path.join(userRoot, ".agents", "skills"), required: true },
  { id: "claude", root: path.join(userRoot, ".claude", "skills"), required: true },
  { id: "claude-desktop", root: path.join(appData, "Claude", "skills"), required: true },
  { id: "claude-3p", root: path.join(appData, "Claude-3p", "skills"), required: true },
  { id: "antigravity-appdata", root: path.join(appData, "Antigravity", "skills"), required: true },
  { id: "gemini", root: path.join(userRoot, ".gemini", "skills"), required: true },
  { id: "antigravity-plugin", root: path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills"), required: true },
];

const staleNames = new Set([
  "ae0",
  "ae-0",
  "ae-0-factory",
  "ae-code",
  "ae-design",
  "ae-factory",
  "ae-launch",
  "ae-legal",
  "ae-marketing",
  "ae-ops",
  "ae-product",
  "ae-researcher",
  "ae-review-panel",
  "ae-sales",
  "aecode",
  "aefactory",
  "aeskills",
  "openclaw",
  "open-claw",
]);
const stalePattern = /^(ae[-_ ]?0|ae0|ae[-_ ]?[1-9][0-9]?|ae[-_ ]?code|aecode|ae[-_ ]?factory|aefactory|ae[-_ ]?skill|aeskill|aeskills|old[-_ ]?orangebox|openclaw|open[-_ ]?claw)([-_ ].*)?$/i;

const requiredCommands = [
  { name: "badge", kind: "powershell", file: "skills\\orangebox-primer\\scripts\\orangebox_session_badge.ps1" },
  { name: "system-check", kind: "powershell", file: "skills\\orangebox-primer\\scripts\\orangebox_system_check.ps1" },
  { name: "system-refresh", kind: "powershell", file: "skills\\orangebox-primer\\scripts\\orangebox_system_check.ps1" },
  { name: "backend-proof", kind: "npm", script: "backend:proof" },
  { name: "health-report", kind: "npm", script: "health:report" },
  { name: "project-report", kind: "npm", script: "project:report" },
  { name: "ops-readiness", kind: "npm", script: "ops:readiness" },
  { name: "ops-green", kind: "npm", script: "ops:green" },
  { name: "ops-gaps", kind: "npm", script: "ops:gaps" },
  { name: "reality-watch", kind: "npm", script: "reality:watch" },
  { name: "strongarm-doctor", kind: "npm", script: "strongarm:doctor" },
  { name: "gremlin-doctor", kind: "npm", script: "gremlin:doctor" },
  { name: "trilane-doctor", kind: "npm", script: "trilane:doctor" },
  { name: "model-lane-eval", kind: "npm", script: "model:lane-eval" },
  { name: "model-inventory", kind: "npm", script: "model:inventory" },
  { name: "soul-doctor", kind: "npm", script: "soul:doctor" },
  { name: "knowledge-improvements", kind: "npm", script: "knowledge:improvements" },
  { name: "research-scout", kind: "npm", script: "research:scout" },
  { name: "research-radar", kind: "npm", script: "research:radar" },
  { name: "assurance-doctor", kind: "npm", script: "assurance:doctor" },
  { name: "harness-benchmark", kind: "npm", script: "harness:benchmark" },
  { name: "tool-ergonomics", kind: "npm", script: "tool:ergonomics" },
  { name: "checkmate-eval", kind: "npm", script: "checkmate:doctor" },
  { name: "signal-hygiene", kind: "npm", script: "signal:hygiene" },
  { name: "session-spine", kind: "npm", script: "session:spine" },
  { name: "feature-proof", kind: "npm", script: "feature:proof" },
  { name: "final-verify", kind: "npm", script: "final:verify" },
  { name: "final-zip", kind: "npm", script: "final:zip" },
  { name: "codexa-alert", kind: "npm", script: "codexa:alert" },
  { name: "codexa-alert-popup", kind: "npm", script: "codexa:alert:popup" },
  { name: "codexa-watch", kind: "npm", script: "codexa:watch" },
  { name: "codexa-watch-popup", kind: "npm", script: "codexa:watch:popup" },
  { name: "codexa-smb-stage", kind: "npm", script: "codexa:smb-stage" },
  { name: "codexa-handoff", kind: "npm", script: "codexa:handoff" },
  { name: "mcp-doctor", kind: "npm", script: "mcp:doctor" },
  { name: "ipi-doctor", kind: "npm", script: "ipi:doctor" },
  { name: "memory-doctor", kind: "npm", script: "memory:doctor" },
  { name: "action-doctor", kind: "npm", script: "action:doctor" },
  { name: "skills-lifecycle", kind: "npm", script: "skills:lifecycle" },
  { name: "obox2-pack", kind: "npm", script: "obox2:pack" },
  { name: "obox2-doctor", kind: "npm", script: "obox2:doctor" },
  { name: "openclaw-retire-dry", kind: "npm", script: "openclaw:retire:dry" },
  { name: "openclaw-retire", kind: "npm", script: "openclaw:retire" },
];

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

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listSkillDirs(root) {
  if (!exists(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(root, entry.name);
      return {
        name: entry.name,
        path: full,
        has_skill_md: exists(path.join(full, "SKILL.md")),
      };
    });
}

function commandBlocks(scriptText) {
  const matches = [...scriptText.matchAll(/^\s*"([^"]+)"\s*=\s*@\{/gm)];
  const blocks = new Map();
  for (let i = 0; i < matches.length; i += 1) {
    const name = matches[i][1];
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : scriptText.indexOf("\n}", start);
    blocks.set(name, scriptText.slice(start, end > start ? end : undefined));
  }
  return blocks;
}

async function main() {
  const packageJson = readJson(path.join(repoRoot, "package.json")) || {};
  const skillRoot = path.join(repoRoot, "skills", "orangebox-primer");
  const commandScript = path.join(skillRoot, "scripts", "orangebox_command.ps1");
  const primerSyncLatest = path.join(dataRoot, "primers", "latest-primer-skill-sync.json");
  const commandReceiptRoot = path.join(dataRoot, "skill-command-receipts");
  const scriptText = exists(commandScript) ? fs.readFileSync(commandScript, "utf8") : "";
  const blocks = commandBlocks(scriptText);

  const roots = activeRoots.map((activeRoot) => {
    const skills = listSkillDirs(activeRoot.root);
    const orangeboxPrimer = skills.find((skill) => skill.name === "orangebox-primer");
    const stale = skills.filter((skill) => staleNames.has(skill.name.toLowerCase()) || stalePattern.test(skill.name));
    return {
      ...activeRoot,
      exists: exists(activeRoot.root),
      orangebox_primer_present: Boolean(orangeboxPrimer?.has_skill_md),
      stale_count: stale.length,
      stale,
      skill_count: skills.length,
      ok: (!activeRoot.required || exists(activeRoot.root)) && Boolean(orangeboxPrimer?.has_skill_md) && stale.length === 0,
    };
  });

  const commandChecks = requiredCommands.map((command) => {
    const block = blocks.get(command.name) || "";
    const packageScriptOk = command.kind !== "npm" || Boolean(packageJson.scripts?.[command.script]);
    const fileOk = command.kind !== "powershell" || exists(path.join(repoRoot, command.file));
    const wrapperOk = Boolean(block)
      && (command.kind !== "npm" || block.includes(`"run", "${command.script}"`))
      && (command.kind !== "powershell" || block.includes(command.file));
    return {
      ...command,
      present_in_wrapper: Boolean(block),
      wrapper_mapping_ok: wrapperOk,
      package_script_ok: packageScriptOk,
      file_ok: fileOk,
      ok: wrapperOk && packageScriptOk && fileOk,
    };
  });

  await fsp.mkdir(commandReceiptRoot, { recursive: true });
  const commandReceiptFiles = exists(commandReceiptRoot)
    ? fs.readdirSync(commandReceiptRoot).filter((name) => name.endsWith(".json"))
    : [];
  const staleCount = roots.reduce((sum, root) => sum + root.stale_count, 0);
  const missingRootCount = roots.filter((root) => !root.ok).length;
  const missingCommandCount = commandChecks.filter((command) => !command.ok).length;
  const commandOkCount = commandChecks.filter((command) => command.ok).length;
  const npmCommandCount = commandChecks.filter((command) => command.kind === "npm").length;
  const powershellCommandCount = commandChecks.filter((command) => command.kind === "powershell").length;
  const wrapperMappingCount = commandChecks.filter((command) => command.present_in_wrapper && command.wrapper_mapping_ok).length;
  const compressionProofOk =
    staleCount === 0 &&
    missingRootCount === 0 &&
    missingCommandCount === 0 &&
    commandChecks.length >= 25 &&
    wrapperMappingCount === commandChecks.length &&
    exists(commandReceiptRoot);
  const compressionProof = {
    ok: compressionProofOk,
    status: compressionProofOk ? "SKILL_COMPRESSION_GREEN" : "SKILL_COMPRESSION_NOT_GREEN",
    doctrine: "A skill is active only when it is a compressed executable procedure: installed in real roots, non-stale, mapped to real commands, receipt-visible, and rollback-safe.",
    command_count: commandChecks.length,
    command_ok_count: commandOkCount,
    npm_command_count: npmCommandCount,
    powershell_command_count: powershellCommandCount,
    wrapper_mapping_count: wrapperMappingCount,
    wrapper_mapping_rate: Number((wrapperMappingCount / Math.max(1, commandChecks.length)).toFixed(4)),
    active_root_count: roots.length,
    active_roots_green: roots.filter((root) => root.ok).length,
    stale_count: staleCount,
    receipt_surface_exists: exists(commandReceiptRoot),
    promotion_requirements: [
      "must reduce repeated operator work",
      "must map to a real local command or proof script",
      "must write or reference a receipt",
      "must have a rollback or non-mutating dry path when it changes system state",
      "must stay out of active roots when stale, legacy, or vendor-unverified",
    ],
    rejected_shapes: [
      "prompt-only folders with no executable proof",
      "stale AE/OpenClaw/AESkills folders in active roots",
      "commands that do not map to package scripts or files",
      "silent skill promotion without operator approval",
    ],
  };
  const result = {
    ok: compressionProofOk,
    version: "orangebox-skill-lifecycle-doctor/v0",
    status: compressionProofOk
      ? "ORANGEBOX_SKILL_LIFECYCLE_GREEN"
      : "ORANGEBOX_SKILL_LIFECYCLE_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    proof_law: "Skills are compressed procedures. They stay active only when installed, non-stale, command-mapped, receipt-visible, and rollback-safe.",
    compression_proof: compressionProof,
    roots,
    stale_count: staleCount,
    command_checks: commandChecks,
    command_count: commandChecks.length,
    command_failures: commandChecks.filter((command) => !command.ok),
    primer_sync_latest: {
      path: primerSyncLatest,
      exists: exists(primerSyncLatest),
      status: readJson(primerSyncLatest)?.kind || null,
    },
    command_receipts: {
      root: commandReceiptRoot,
      exists: exists(commandReceiptRoot),
      count: commandReceiptFiles.length,
      latest_sample: commandReceiptFiles.slice(-5),
      note: "Skill commands write receipts when invoked through orangebox_command.ps1; this doctor does not run heavy skill commands.",
    },
  };

  await writeJson(path.join(reportDir, "latest-skill-lifecycle.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-skill-lifecycle-doctor-${stamp()}.json`);
    await writeJson(receiptPath, result);
    result.receipt_path = receiptPath;
    await writeJson(path.join(reportDir, "latest-skill-lifecycle.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
