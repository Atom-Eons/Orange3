#!/usr/bin/env node
/*
  orangebox-knowledge-improvement-queue.mjs

  Builds a candidate queue from recent receipts and reports. This is the
  safe form of "the Knowledge Engine learned an upgrade": candidates are
  observed, deduped, scored, and parked for operator approval. Nothing is
  promoted or mutated automatically.
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
const outRoot = path.join(dataRoot, "knowledge", "improvements");

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

function hashText(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex").slice(0, 16);
}

function listRecentJsonFiles(root, limit = 80) {
  if (!exists(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit)
    .map((entry) => entry.full);
}

function pushFinding(findings, source, kind, text, severity = 0.5, evidence = {}) {
  const normalized = typeof text === "string"
    ? text.trim()
    : JSON.stringify(text || {}).slice(0, 900);
  if (!normalized) return;
  findings.push({
    source,
    kind,
    text: normalized,
    severity,
    evidence,
  });
}

function collectFromObject(findings, source, object, prefix = "") {
  if (!object || typeof object !== "object") return;
  if (Array.isArray(object)) {
    for (const item of object) collectFromObject(findings, source, item, prefix);
    return;
  }
  if (Array.isArray(object.warnings)) {
    for (const warning of object.warnings) pushFinding(findings, source, "warning", warning, 0.62);
  }
  if (Array.isArray(object.next_actions)) {
    for (const action of object.next_actions) pushFinding(findings, source, "next_action", action, 0.58);
  }
  if (Array.isArray(object.not_real_yet)) {
    for (const item of object.not_real_yet) pushFinding(findings, source, "not_real_yet", item, 0.72);
  }
  if (Array.isArray(object.candidates) && String(object.version || "").includes("external-research-scout")) {
    for (const candidate of object.candidates.slice(0, 24)) {
      const text = [
        candidate.tier,
        candidate.source_family,
        candidate.title,
        candidate.area,
        candidate.proposed_action,
        candidate.url,
      ].filter(Boolean).join(" | ");
      const severity = Math.min(0.95, 0.55 + Number(candidate.orangebox_score || 0) / 250 + (String(candidate.tier || "").startsWith("T0") ? 0.12 : 0));
      pushFinding(findings, source, "research_candidate", text, severity, {
        tier: candidate.tier || null,
        source_family: candidate.source_family || null,
        url: candidate.url || null,
        area: candidate.area || null,
      });
    }
  }
  if (Array.isArray(object.focused_synthesis) && String(object.version || "").includes("external-research-scout")) {
    for (const card of object.focused_synthesis.slice(0, 12)) {
      const text = [
        card.approval_status,
        card.area,
        card.synthesis,
        card.strongest_signal?.title,
        card.strongest_signal?.url,
      ].filter(Boolean).join(" | ");
      const severity = card.approval_status === "APPROVAL_CANDIDATE" ? 0.86 : 0.62;
      pushFinding(findings, source, "research_synthesis", text, severity, {
        area: card.area || null,
        approval_status: card.approval_status || null,
        url: card.strongest_signal?.url || null,
      });
    }
  }
  if (Array.isArray(object.failures)) {
    for (const failure of object.failures) pushFinding(findings, source, "failure", failure, 0.84);
  }
  if (object.status && /NOT_GREEN|FAILED|WARN|NOT_READY|NOT_REAL/i.test(String(object.status))) {
    pushFinding(findings, source, "status", `${prefix}${object.status}`, 0.7, { status: object.status });
  }
  for (const [key, value] of Object.entries(object)) {
    if (key === "warnings" || key === "next_actions" || key === "not_real_yet" || key === "failures") continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value.ok === false) {
        const detail = [
          `${prefix}${key}`,
          value.status,
          value.error,
          value.summary,
          value.message,
        ].filter(Boolean).join(": ");
        pushFinding(findings, source, "failed_check", detail || value, 0.76, { check: key, status: value.status || null, error: value.error || null });
      }
    }
  }
}

function classify(text) {
  if (/operator_situation_awareness|automation bias|automation complacency|over-reliance|overreliance|vigilance|situation awareness|human factors|calibrated trust/.test(text)) return { area: "operator_situation_awareness", action: "Promote as watcher/health-report rule only: visible status, failure drills, calibrated trust, and no silent automation." };
  if (/mcp_supply_chain_security|rce|remote code execution|stdio|supply chain|prompt injection|command execution|localhost|dns rebinding|cors/.test(text)) return { area: "mcp_supply_chain_security", action: "Promote as MCP quarantine fixture only: metadata-only STDIO, fixed command templates, localhost proof, output caps, approval gate." };
  if (/codex_harness_and_compaction|codex|agent loop|responses api|computer environment|shell-action receipts|compaction restore/.test(text)) return { area: "codex_harness_and_compaction", action: "Review Codex harness candidate; promote only as primer, restore packet, shell receipt, or cross-agent handoff check." };
  if (/judge_reliability_and_strongarm|llm judge|judge reliability|evidence verification|reflect|cannot overrule failed checks/.test(text)) return { area: "judge_reliability_and_strongarm", action: "Add STRONGARM/Mirror evals requiring receipt citations; deterministic gates remain sovereign." };
  if (/long_horizon_feature_proof|roadmapbench|featurebench|long-horizon|version upgrade|multi-target|acceptance matrices/.test(text)) return { area: "long_horizon_feature_proof", action: "Promote as project proof upgrade: feature contract, tests, rollback, and receipt-based completion claims." };
  if (/sandbox|filesystem isolation|network isolation|credential|exfiltrat|permission boundary/i.test(text)) return { area: "sandbox_and_permission_law", action: "Convert into path/network policy fixtures for MCP servers, Codexa rails, and installer proof." };
  if (/brain|hands|session|durable|event log|harness|wake|time-to-first-token|ttft/i.test(text)) return { area: "doer_watcher_session_spine", action: "Review durable session/harness candidate; promote as resumability, rail recovery, or watcher proof only." };
  if (/skill lifecycle|agent skills|procedural skill|experience compression|compression spectrum|declarative rules/i.test(text)) return { area: "skill_lifecycle_compression", action: "Review skill compression candidate; promote only if it reduces repeated work and passes stale-skill/vendor gates." };
  if (/mcp|model context protocol|tool output|tool search|resources|prompt injection/i.test(text)) return { area: "mcp_quarantine_gateway", action: "Review MCP/source-scope candidate; promote only through quarantine gateway fixture and receipt." };
  if (/ai box|codexa|8097|8098|ollama|rail/i.test(text)) return { area: "codexa_ai_box", action: "Run power optimizer, rail starter, and model doctor on Codexa." };
  if (/pubmed|nih|biomedical|bioinformatics|clinical|healthcare|assurance|scientific/i.test(text)) return { area: "research_assurance_lab", action: "Review assurance-lab candidate; translate only into playbook, benchmark, or proof-receipt work." };
  if (/hermes/i.test(text)) return { area: "hermes_orchestration", action: "Run Hermes install/doctor from OBOX2 pack after Codexa is stable." };
  if (/arxiv|agent memory|context compression|memory control|retrieval|compaction|context bloat/i.test(text)) return { area: "knowledge_engine_atomsmasher", action: "Review memory/control candidate; promote only as eval, benchmark, or AtomSmasher/Knowledge proof." };
  if (/checkmate|benchmarking local models|custom workflow|model eval|local model|model route|model routing/i.test(text)) return { area: "checkmate_eval_lane", action: "Convert into a CHECKMATE eval fixture before changing prompts, models, or routing." };
  if (/knowledge|learned|candidate|self-upgrade/i.test(text)) return { area: "knowledge_engine", action: "Keep candidate queued; require operator promotion receipt." };
  if (/prisma|dll|eperm|lock/i.test(text)) return { area: "windows_process_lock", action: "Stop scoped Orangebox final API/node processes before Prisma generate or final verify." };
  if (/sleep|hibernate|power/i.test(text)) return { area: "codexa_power", action: "Apply Codexa always-on AC power profile before rail/model setup." };
  if (/openclaw/i.test(text)) return { area: "legacy_cleanup", action: "Keep OpenClaw startup retired; do not restore without operator approval." };
  return { area: "general_ops", action: "Review evidence and decide whether to promote into a task." };
}

function candidateFromGroup(area, items) {
  const top = items.sort((a, b) => b.severity - a.severity)[0];
  const allText = items.map((item) => item.text).join("\n");
  const classified = classify(allText);
  const score = Math.min(1, Math.round((items.reduce((sum, item) => sum + item.severity, 0) / Math.max(1, items.length) + Math.min(0.25, items.length * 0.03)) * 100) / 100);
  const title = /^verification$/i.test(top.text)
    ? `Evidence cluster for ${area}: verify latest receipts before promotion`
    : top.text.slice(0, 140);
  return {
    id: `obx_improve_${hashText(area + allText)}`,
    status: "candidate",
    area,
    title,
    learned_from: items.map((item) => ({ source: item.source, kind: item.kind, text: item.text.slice(0, 240) })).slice(0, 12),
    confidence: score,
    proposed_next_action: classified.action,
    promotion_gate: {
      required: true,
      reason: "Knowledge Engine candidates do not mutate Orangebox automatically.",
      required_proof: ["task contract", "operator approval", "doctor receipt", "rollback path"],
    },
  };
}

async function main() {
  const findings = [];
  const reportFiles = [
    path.join(dataRoot, "reports", "health", "latest-health-report.json"),
    path.join(dataRoot, "reports", "project", "latest-project-report.json"),
    path.join(dataRoot, "watcher", "latest-reality-watch.json"),
    path.join(dataRoot, "services", "latest-ops-services.json"),
    path.join(dataRoot, "obox2", "latest-package-doctor.json"),
    path.join(dataRoot, "trilane", "latest-trilane-model-router.json"),
    path.join(dataRoot, "research-scout", "latest-external-research-scout.json"),
  ];
  for (const file of reportFiles) {
    const data = readJson(file);
    if (data) collectFromObject(findings, file, data);
  }
  for (const file of listRecentJsonFiles(receiptDir, 80)) {
    const data = readJson(file);
    if (data) collectFromObject(findings, file, data);
  }

  const groups = new Map();
  for (const finding of findings) {
    const area = classify(finding.text).area;
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(finding);
  }
  const candidates = [...groups.entries()]
    .map(([area, items]) => candidateFromGroup(area, items))
    .sort((a, b) => b.confidence - a.confidence);

  const result = {
    ok: true,
    version: "orangebox-knowledge-improvement-queue/v1",
    status: "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Observe, dedupe, score, and queue. Do not self-promote. Operator approval and receipts are required.",
    source_count: reportFiles.length + listRecentJsonFiles(receiptDir, 80).length,
    finding_count: findings.length,
    candidate_count: candidates.length,
    candidates,
    not_autonomous: true,
  };

  const latestPath = path.join(outRoot, "latest-improvement-candidates.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-knowledge-improvement-queue-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
}

await main();
