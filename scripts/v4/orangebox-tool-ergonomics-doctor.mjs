#!/usr/bin/env node
/*
  orangebox-tool-ergonomics-doctor.mjs

  Proves the Orangebox command/tool surface is usable by agents and humans:
  distinct names, concise descriptions, receipt-backed proof scripts, bounded
  outputs, and no hidden install/API/frontend behavior. This is backend/Ops only.
*/

import crypto from "node:crypto";
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
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "tool-ergonomics");

const requiredProofScripts = [
  "mcp:doctor",
  "action:doctor",
  "skills:lifecycle",
  "tool:ergonomics",
  "checkmate:doctor",
  "signal:hygiene",
  "session:spine",
  "feature:proof",
  "harness:benchmark",
  "assurance:doctor",
  "health:report",
  "project:report",
  "ops:readiness",
  "ops:green",
  "model:lane-eval",
];

const requiredSkillCommands = [
  "backend-proof",
  "health-report",
  "project-report",
  "ops-readiness",
  "ops-green",
  "reality-watch",
  "research-scout",
  "assurance-doctor",
  "harness-benchmark",
  "tool-ergonomics",
  "checkmate-eval",
  "signal-hygiene",
  "session-spine",
  "feature-proof",
  "mcp-doctor",
  "action-doctor",
  "skills-lifecycle",
  "model-lane-eval",
  "codexa-alert",
  "codexa-smb-stage",
  "obox2-pack",
  "obox2-doctor",
];

const theaterPatterns = [
  /\bmagic\b/i,
  /\bmoon\b/i,
  /\bultimate\b/i,
  /\bdo everything\b/i,
  /\bvibe\b/i,
  /\btheater\b/i,
  /\btrust me\b/i,
];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return "";
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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

function extractDescription(block) {
  const match = String(block || "").match(/description\s*=\s*"([^"]+)"/i);
  return match?.[1] || "";
}

function extractNpmScript(block) {
  const match = String(block || "").match(/args\s*=\s*@\("run",\s*"([^"]+)"\)/i);
  return match?.[1] || null;
}

function normalizeCommandName(name) {
  return String(name || "").trim().toLowerCase();
}

function latestReceipt(prefix, root = receiptDir) {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function check(id, ok, evidence = {}) {
  return { id, ok: Boolean(ok), ...evidence };
}

function receiptSummary(name, file, statusExtractor) {
  const parsed = readJson(file || "");
  const status = parsed ? statusExtractor(parsed) : null;
  return {
    name,
    path: file || null,
    exists: Boolean(file && exists(file)),
    status,
    ok: Boolean(parsed && status),
  };
}

async function main() {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const skillMdPath = path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md");
  const commandPath = path.join(repoRoot, "skills", "orangebox-primer", "scripts", "orangebox_command.ps1");
  const packageJson = readJson(packageJsonPath) || {};
  const skillMd = readText(skillMdPath);
  const wrapper = readText(commandPath);
  const blocks = commandBlocks(wrapper);
  const commands = [...blocks.entries()]
    .filter(([name]) => name !== "help")
    .map(([name, block]) => {
      const description = extractDescription(block);
      const npmScript = extractNpmScript(block);
      return {
        name,
        description,
        npm_script: npmScript,
        package_script: npmScript ? packageJson.scripts?.[npmScript] || null : null,
        description_chars: description.length,
      };
    });

  const names = commands.map((command) => command.name);
  const duplicateNames = names.filter((name, index) => names.indexOf(name) !== index);
  const invalidNames = names.filter((name) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name));
  const missingDescriptions = commands.filter((command) => !command.description);
  const longDescriptions = commands.filter((command) => command.description_chars > 150);
  const missingPackageScripts = commands.filter((command) => command.npm_script && !command.package_script);
  const theaterHits = commands
    .map((command) => ({
      name: command.name,
      hits: theaterPatterns.filter((pattern) => pattern.test(`${command.name} ${command.description}`)).map(String),
    }))
    .filter((row) => row.hits.length > 0);
  const confusingPairs = [];
  for (let i = 0; i < commands.length; i += 1) {
    for (let j = i + 1; j < commands.length; j += 1) {
      const a = commands[i];
      const b = commands[j];
      const samePackageScript = a.npm_script && a.npm_script === b.npm_script;
      const sameDescription = normalizeCommandName(a.description) === normalizeCommandName(b.description);
      if (samePackageScript || sameDescription) {
        confusingPairs.push({
          a: a.name,
          b: b.name,
          same_package_script: Boolean(samePackageScript),
          same_description: Boolean(sameDescription),
        });
      }
    }
  }

  const receiptScripts = requiredProofScripts.map((script) => ({
    script,
    command: packageJson.scripts?.[script] || null,
    has_receipt_flag: /\s--receipt\b/.test(packageJson.scripts?.[script] || ""),
    has_json_flag: /\s--json\b/.test(packageJson.scripts?.[script] || "") || script === "package-script-doctor",
  }));
  const receiptScriptFailures = receiptScripts.filter((script) => !script.command || !script.has_receipt_flag);
  const skillCommandPresence = requiredSkillCommands.map((name) => ({
    name,
    in_skill_md: skillMd.includes(name),
    in_wrapper: blocks.has(name),
  }));
  const missingSkillCommands = skillCommandPresence.filter((row) => !row.in_skill_md || !row.in_wrapper);

  const receiptSurfaces = [
    receiptSummary("mcp", path.join(dataRoot, "mcp", "latest-mcp-doctor.json"), (value) => value?.ok === true && value?.summary?.failed === 0 ? "MCP_QUARANTINE_GREEN" : null),
    receiptSummary("action", path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"), (value) => value?.status || null),
    receiptSummary("skills", path.join(dataRoot, "skills", "latest-skill-lifecycle.json"), (value) => value?.status || null),
    receiptSummary("checkmate", path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"), (value) => value?.status || null),
    receiptSummary("signal_hygiene", path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json"), (value) => value?.status || null),
    receiptSummary("session_spine", path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"), (value) => value?.status || null),
    receiptSummary("harness", path.join(dataRoot, "harness", "latest-harness-benchmark.json"), (value) => value?.status || null),
  ];
  const latestHarness = readJson(path.join(dataRoot, "harness", "latest-harness-benchmark.json"));
  const latestLifecycle = readJson(path.join(dataRoot, "skills", "latest-skill-lifecycle.json"));
  const latestMcp = readJson(path.join(dataRoot, "mcp", "latest-mcp-doctor.json"));
  const latestAction = readJson(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"));

  const outputContracts = {
    wrapper_writes_command_receipts: /orangebox-skill-command-\$Command-\$stamp\.json/.test(wrapper),
    wrapper_tail_bounded: /Select-Object -Last 80/.test(wrapper) && /Select-Object -Last 30/.test(wrapper),
    wrapper_json_switch: /\[switch\]\$Json/.test(wrapper),
    package_proofs_json_receipt: receiptScripts.every((script) => script.has_receipt_flag),
    harness_has_budget_summary: Boolean(latestHarness?.budget_summary),
    lifecycle_has_compression_proof: latestLifecycle?.compression_proof?.status === "SKILL_COMPRESSION_GREEN",
  };

  const checks = [
    check("package_script_present", Boolean(packageJson.scripts?.["tool:ergonomics"]), { script: packageJson.scripts?.["tool:ergonomics"] || null }),
    check("tool_doctor_file_present", exists(path.join(repoRoot, "scripts", "v4", "orangebox-tool-ergonomics-doctor.mjs"))),
    check("skill_command_present", missingSkillCommands.length === 0, { missing: missingSkillCommands }),
    check("command_names_unique", duplicateNames.length === 0 && invalidNames.length === 0, { duplicate_names: duplicateNames, invalid_names: invalidNames }),
    check("command_names_distinct", confusingPairs.length === 0, { confusing_pairs: confusingPairs }),
    check("descriptions_concise", missingDescriptions.length === 0 && longDescriptions.length === 0, { missing_descriptions: missingDescriptions.map((item) => item.name), long_descriptions: longDescriptions.map((item) => ({ name: item.name, chars: item.description_chars })) }),
    check("no_theater_commands", theaterHits.length === 0, { theater_hits: theaterHits }),
    check("wrapper_maps_to_package_scripts", missingPackageScripts.length === 0, { missing_package_scripts: missingPackageScripts.map((item) => ({ name: item.name, npm_script: item.npm_script })) }),
    check("proof_scripts_receipt_visible", receiptScriptFailures.length === 0, { proof_scripts: receiptScripts, failures: receiptScriptFailures }),
    check("receipt_surfaces_present", receiptSurfaces.filter((item) => item.ok).length >= 3, { receipt_surfaces: receiptSurfaces }),
    check("output_contracts_present", Object.values(outputContracts).every(Boolean), outputContracts),
    check("mcp_stays_quarantined", latestMcp?.host_mcp_config_mutated === false && latestMcp?.install_attempted === false && latestMcp?.paid_api_attempted === false, {
      host_mcp_config_mutated: latestMcp?.host_mcp_config_mutated ?? null,
      install_attempted: latestMcp?.install_attempted ?? null,
      paid_api_attempted: latestMcp?.paid_api_attempted ?? null,
    }),
    check("action_classifier_covers_proof_script", latestAction?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN" && Number(latestAction?.cases_run || 0) >= 12, {
      status: latestAction?.status || null,
      cases_run: latestAction?.cases_run || 0,
    }),
  ];
  const failures = checks.filter((item) => !item.ok);
  const result = {
    ok: failures.length === 0,
    version: "orangebox-tool-ergonomics-doctor/v0",
    status: failures.length === 0 ? "ORANGEBOX_TOOL_ERGONOMICS_GREEN" : "ORANGEBOX_TOOL_ERGONOMICS_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "A real Orangebox tool is distinct, bounded, receipt-backed, eval-visible, and scoped to the operator's lane.",
    research_basis: [
      {
        source: "Anthropic engineering",
        url: "https://www.anthropic.com/engineering/writing-tools-for-agents",
        lesson: "Agent tools need clear boundaries, namespacing, concise outputs, output caps, and eval-driven repair.",
      },
      {
        source: "Anthropic engineering",
        url: "https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills",
        lesson: "Skills should be durable procedures, not chat memory or loose prompts.",
      },
      {
        source: "Reddit/local agent field signal",
        url: "https://www.reddit.com/r/ClaudeAI/comments/1ssmmmv/claude_codedesktop_skills/",
        lesson: "Cross-client reuse works best when real workflows live in portable docs/tools and each client keeps a wrapper.",
      },
    ],
    constraints: {
      frontend_touched: false,
      install_attempted: false,
      paid_api_attempted: false,
      host_mcp_config_mutated: false,
      production_deploy_attempted: false,
    },
    command_surface: {
      command_count: commands.length,
      command_hash: sha256(commands.map((command) => `${command.name}:${command.description}:${command.npm_script || ""}`).join("\n")),
      required_skill_commands: skillCommandPresence,
      wrapper_path: commandPath,
      skill_path: skillMdPath,
      package_path: packageJsonPath,
    },
    proof_contracts: {
      required_proof_scripts: receiptScripts,
      output_contracts: outputContracts,
      receipt_surfaces: receiptSurfaces,
    },
    checks,
    failures,
    next_action: failures.length === 0
      ? "Keep this doctor in the local Ops proof chain and use it before adding or renaming Orangebox commands/tools."
      : "Fix the failed tool ergonomics check(s), rerun npm.cmd run tool:ergonomics, then rerun skills:lifecycle and harness:benchmark.",
  };

  const latestPath = path.join(outRoot, "latest-tool-ergonomics.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-tool-ergonomics-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
