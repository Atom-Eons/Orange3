#!/usr/bin/env node
/*
  orangebox-research-radar.mjs

  Runs the Orangebox public research intake loop and writes a compact approval
  report. This is the safe form of "continually learn upgrades": fetch public
  signals, synthesize them, park candidates, and require operator promotion.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const outRoot = path.join(dataRoot, "research-radar");
const receiptDir = path.join(repoRoot, "receipts");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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

async function writeText(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${String(value).trimEnd()}\n`, "utf8");
}

function runNpm(script) {
  const started = Date.now();
  const isWindows = process.platform === "win32";
  const executable = isWindows ? "cmd.exe" : "npm";
  const childArgs = isWindows ? ["/d", "/s", "/c", `npm.cmd run ${script}`] : ["run", script];
  const child = spawnSync(executable, childArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  });
  const stdout = child.stdout || "";
  const stderr = child.stderr || "";
  return {
    script,
    command: `npm run ${script}`,
    exit_code: typeof child.status === "number" ? child.status : 1,
    duration_ms: Date.now() - started,
    error: child.error?.message || null,
    stdout_tail: stdout.slice(-2000),
    stderr_tail: stderr.slice(-2000),
    output_hash: sha256(`${stdout}\n${stderr}`),
  };
}

function topByArea(items, limit = 8) {
  const seen = new Set();
  const out = [];
  for (const item of items || []) {
    const area = item.area || item.id || "general";
    if (seen.has(area)) continue;
    seen.add(area);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

function renderMarkdown(result) {
  const lines = [
    "# Orangebox Research Radar",
    "",
    `status: ${result.status}`,
    `checked_at: ${result.checked_at}`,
    `network_used: ${result.constraints.network_used}`,
    `promotion_autonomous: ${result.constraints.promotion_autonomous}`,
    "",
    "## Best Approval Candidates",
  ];
  for (const card of result.approval_candidates) {
    lines.push("");
    lines.push(`### ${card.area || "general"}`);
    lines.push(`- approval_status: ${card.approval_status || "candidate"}`);
    lines.push(`- synthesis: ${card.synthesis || card.proposed_next_action || "Review candidate."}`);
    if (card.strongest_signal?.title) lines.push(`- strongest_signal: ${card.strongest_signal.title}`);
    if (card.strongest_signal?.url) lines.push(`- source: ${card.strongest_signal.url}`);
    if (card.proof_command) lines.push(`- proof_command: ${card.proof_command}`);
  }
  lines.push("");
  lines.push("## Commands");
  for (const command of result.commands_run) {
    lines.push(`- ${command.command}: exit=${command.exit_code}, duration_ms=${command.duration_ms}`);
  }
  lines.push("");
  lines.push("## Guardrail");
  lines.push("Research creates approval candidates only. Promotion still requires task contract, proof command, receipt, rollback, and operator approval.");
  return lines.join("\n");
}

async function main() {
  const startedAt = new Date();
  const commands = [
    runNpm("research:scout"),
    runNpm("knowledge:improvements"),
    runNpm("assurance:doctor"),
  ];

  const scout = readJson(path.join(dataRoot, "research-scout", "latest-external-research-scout.json"));
  const improvements = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"));
  const assurance = readJson(path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json"));

  const focused = topByArea(scout?.focused_synthesis || [], 8);
  const queued = topByArea(improvements?.candidates || [], 8);
  const approvalCandidates = focused.length ? focused : queued;
  const allCommandsGreen = commands.every((command) => command.exit_code === 0);
  const scoutUsable = scout?.status === "EXTERNAL_RESEARCH_SCOUT_READY" || scout?.status === "EXTERNAL_RESEARCH_SCOUT_DEGRADED";
  const queueReady = improvements?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY";
  const assuranceGreen = assurance?.status === "ORANGEBOX_ASSURANCE_LAB_GREEN";

  const status = allCommandsGreen && scoutUsable && queueReady && assuranceGreen
    ? "ORANGEBOX_RESEARCH_RADAR_GREEN"
    : scoutUsable && queueReady
      ? "ORANGEBOX_RESEARCH_RADAR_REPORTED_WITH_GAPS"
      : "ORANGEBOX_RESEARCH_RADAR_NOT_GREEN";

  const result = {
    ok: status !== "ORANGEBOX_RESEARCH_RADAR_NOT_GREEN",
    version: "orangebox-research-radar/v1",
    status,
    started_at: startedAt.toISOString(),
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Public research becomes approval candidates, never automatic Orangebox mutation.",
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      paid_api_attempted: false,
      install_attempted: false,
      model_call_attempted: false,
      promotion_autonomous: false,
      network_used: true,
      reddit_is_weak_signal: true,
    },
    source_counts: {
      static_public_pages: scout?.source_targets?.static_public_pages ?? null,
      arxiv_queries: scout?.source_targets?.arxiv_queries ?? null,
      pubmed_queries: scout?.source_targets?.pubmed_queries ?? null,
      reddit_targets: scout?.source_targets?.reddit_targets ?? null,
      candidate_count: scout?.candidate_count ?? null,
      primary_candidate_count: scout?.primary_candidate_count ?? null,
    },
    receipts: {
      scout: scout?.receipt_path || null,
      improvements: improvements?.receipt_path || null,
      assurance: assurance?.receipt_path || null,
    },
    commands_run: commands,
    approval_candidates: approvalCandidates,
    required_promotion_gate: ["task contract", "operator approval", "doctor receipt", "rollback path", "feature proof"],
    next_action: "Review approval_candidates, pick one, then implement as a scoped backend Ops doctor or gate.",
  };

  const latestJson = path.join(outRoot, "latest-research-radar.json");
  const latestMd = path.join(outRoot, "latest-research-radar.md");
  await writeJson(latestJson, result);
  await writeText(latestMd, renderMarkdown(result));
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-research-radar-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestJson, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (status === "ORANGEBOX_RESEARCH_RADAR_NOT_GREEN") process.exitCode = 1;
}

await main();
