#!/usr/bin/env node
/*
  orangebox-assurance-lab-doctor.mjs

  Turns external research signals into an Orangebox assurance lane. This is a
  backend-only proof doctor: it reads existing scout/knowledge/receipt artifacts,
  checks that assurance ideas are converted into playbooks, benchmarks, gates,
  and receipts, and refuses auto-promotion or frontend mutation.
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
const backendProofInProgress = process.env.ORANGEBOX_BACKEND_PROOF_IN_PROGRESS === "1";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "assurance-lab");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function hashObject(value) {
  return sha256(JSON.stringify(value));
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

function statusOf(value) {
  return value?.status || value?.summary?.status || (value?.ok === true ? "OK" : null);
}

function candidateText(candidate) {
  return [
    candidate?.area,
    candidate?.title,
    candidate?.proposed_next_action,
    candidate?.implementation_candidate,
    candidate?.acceptance_gate,
    ...(Array.isArray(candidate?.learned_from) ? candidate.learned_from.map((item) => item?.text) : []),
  ].filter(Boolean).join("\n");
}

function check(id, ok, evidence = {}) {
  return { id, ok: Boolean(ok), ...evidence };
}

function receiptCheck(id, file, expectedStatus, options = {}) {
  const parsed = readJson(file);
  const status = statusOf(parsed);
  const ok = options.accept
    ? Boolean(options.accept(parsed, status))
    : status === expectedStatus;
  return check(id, ok, {
    path: file,
    exists: exists(file),
    status,
    expected_status: expectedStatus || null,
    detail: options.detail ? options.detail(parsed) : null,
  });
}

function scoreSource(source) {
  const tier = String(source?.tier || "");
  const family = String(source?.source_family || "");
  let score = 0;
  if (tier.startsWith("T0")) score += 35;
  else if (tier.startsWith("T1")) score += 25;
  else if (tier.startsWith("T2")) score += 14;
  else score += 4;
  if (/nih|pubmed|biomed/i.test(family)) score += 20;
  if (/arxiv|research|benchmark/i.test(family)) score += 14;
  if (/anthropic|openai|mcp|nist|owasp/i.test(family)) score += 12;
  if (/reddit|social/i.test(family)) score -= 12;
  return Math.max(1, Math.min(100, score + Math.round(Number(source?.orangebox_score || 0) / 4)));
}

function buildAssurancePlaybook(scout, improvements, receipts) {
  const scoutCandidates = Array.isArray(scout?.candidates) ? scout.candidates : [];
  const focused = Array.isArray(scout?.focused_synthesis) ? scout.focused_synthesis : [];
  const knowledgeCandidates = Array.isArray(improvements?.candidates) ? improvements.candidates : [];
  const executionBacklog = Array.isArray(improvements?.execution_backlog) ? improvements.execution_backlog : [];

  const sources = scoutCandidates
    .filter((item) => /assurance|nih|pubmed|clinical|biomedical|benchmark|playbook|validation|real-world/i.test(candidateText(item)))
    .map((item) => ({
      id: item.id || item.source_id || sha256(candidateText(item)).slice(0, 16),
      source_id: item.source_id || null,
      tier: item.tier || null,
      family: item.source_family || null,
      url: item.url || null,
      title: item.title || null,
      area: item.area || null,
      proposed_action: item.proposed_action || null,
      score: scoreSource(item),
    }))
    .sort((a, b) => b.score - a.score);

  const assuranceSynthesis = focused
    .filter((item) => /assurance|nih|pubmed|clinical|biomedical|real-world/i.test(candidateText(item)))
    .map((item) => ({
      area: item.area || null,
      synthesis: item.synthesis || null,
      source_count: item.source_count || 0,
      source_families: item.source_families || [],
      evidence_tiers: item.evidence_tiers || [],
      score: item.score || 0,
    }));

  const knowledgeAssurance = [...knowledgeCandidates, ...executionBacklog]
    .filter((item) => item?.area === "research_assurance_lab" || /assurance_lab|research_assurance_lab/i.test(candidateText(item)))
    .map((item) => ({
      id: item.id || null,
      status: item.status || null,
      area: item.area || null,
      title: item.title || null,
      confidence: item.confidence ?? null,
      execution_score: item.execution_score ?? null,
      proof_command: item.proof_command || null,
      acceptance_gate: item.acceptance_gate || null,
      blocked_by: item.blocked_by || [],
      scope: item.scope || null,
      frontend_touch_allowed: item.frontend_touch_allowed ?? null,
      operator_approval_required: item.operator_approval_required ?? null,
      auto_promote: item.auto_promote ?? null,
      proven: item.proven ?? false,
    }));

  const playbook = {
    id: "orangebox-assurance-lab-playbook-v1",
    purpose: "Convert outside research into Orangebox backend improvements only when the idea survives source tiering, real-use-case fit, deterministic validation, receipts, rollback, and operator approval.",
    source_policy: {
      public_sources_only: true,
      credentials_used: false,
      paid_model_calls: false,
      social_signal_is_weak: true,
      source_tiers_required: ["T0_RESEARCH", "T0_BIOMED_RESEARCH", "T0_VENDOR_ENGINEERING", "T0_STANDARD"],
    },
    gates: [
      {
        id: "source_tiering",
        rule: "Tier the source before action; weak social signals can suggest questions but cannot promote system changes.",
        receipt: receipts.research_scout,
      },
      {
        id: "scope_fit",
        rule: "Translate only into backend Ops playbooks, benchmark methods, proof receipts, gates, or recovery paths.",
        forbidden: ["frontend mutation", "production deploy", "host MCP mutation", "paid API call", "remote Codexa mutation"],
      },
      {
        id: "real_world_use_case",
        rule: "Each candidate needs a concrete Orangebox failure mode or operational gain: hallucination control, tool reliability, rollback, model routing, watcher truth, or receipt validation.",
      },
      {
        id: "deterministic_validation_first",
        rule: "A deterministic doctor, harness task, CHECKMATE fixture, or feature-proof row must exist before a model judgement lane can endorse it.",
        receipts: [receipts.harness, receipts.checkmate, receipts.feature_proof, receipts.ipi, receipts.memory],
      },
      {
        id: "receipt_and_rollback",
        rule: "No promotion without receipt path, proof command, rollback or recovery path, and explicit operator approval.",
        receipts: [receipts.knowledge, receipts.project],
      },
      {
        id: "no_auto_promotion",
        rule: "Knowledge Engine may queue and score; it must not mutate Orangebox from research alone.",
        receipt: receipts.knowledge,
      },
    ],
    direct_applications: [
      "MCP quarantine and tool-output scope checks",
      "Indirect prompt-injection drills for email, web, repo, PDF, chat-log, tool-output, and memory ingestion",
      "Memory/source-truth drills for revised facts, multi-target aggregation, source dereference, stale conflict debt, and hot-context budget",
      "Agent skill lifecycle scoring",
      "CHECKMATE eval fixtures before prompt/model/router changes",
      "Feature acceptance matrix for long-horizon upgrades",
      "Doer/watcher truth and Codexa gap warnings",
      "STRONGARM/Misfits structured verdict packets after local model proof",
      "Recovery playbooks for Codexa rails, Ollama, and installer drift",
    ],
    rejected_applications: [
      "Auto-rewriting architecture from a paper or Reddit thread",
      "Claiming a model lane from model-card promises",
      "Adding frontend/dashboard work from this Ops lane",
      "Installing third-party MCP/tools without quarantine proof",
      "Treating broad web research as verified system truth",
    ],
    sources,
    assurance_synthesis: assuranceSynthesis,
    knowledge_candidates: knowledgeAssurance,
  };
  return playbook;
}

async function main() {
  const startedAt = new Date();
  const packageJson = readJson(path.join(repoRoot, "package.json")) || {};
  const paths = {
    research_scout: path.join(dataRoot, "research-scout", "latest-external-research-scout.json"),
    knowledge: path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"),
    harness: path.join(dataRoot, "harness", "latest-harness-benchmark.json"),
    checkmate: path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json"),
    feature_proof: path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"),
    tool_ergonomics: path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"),
    mcp: path.join(dataRoot, "mcp", "latest-mcp-doctor.json"),
    action: path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"),
    ipi: path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"),
    memory: path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json"),
    project: path.join(dataRoot, "reports", "project", "latest-project-report.json"),
  };

  const scout = readJson(paths.research_scout);
  const improvements = readJson(paths.knowledge);
  const harness = readJson(paths.harness);
  const checkmate = readJson(paths.checkmate);
  const featureProof = readJson(paths.feature_proof);
  const toolErgonomics = readJson(paths.tool_ergonomics);
  const mcp = readJson(paths.mcp);
  const action = readJson(paths.action);
  const project = readJson(paths.project);

  const receipts = {
    research_scout: paths.research_scout,
    knowledge: paths.knowledge,
    harness: paths.harness,
    checkmate: paths.checkmate,
    feature_proof: paths.feature_proof,
    tool_ergonomics: paths.tool_ergonomics,
    mcp: paths.mcp,
    action: paths.action,
    ipi: paths.ipi,
    memory: paths.memory,
    project: paths.project,
  };
  const playbook = buildAssurancePlaybook(scout, improvements, receipts);
  const knowledgeAssurance = playbook.knowledge_candidates;
  const unblockedKnowledge = knowledgeAssurance.find((item) => item.status === "approval_ready" && Array.isArray(item.blocked_by) && item.blocked_by.length === 0);
  const provenKnowledge = knowledgeAssurance.find((item) => item.status === "proven_receipt_green" || item.proven === true);
  const sourceFamilies = new Set(playbook.sources.map((item) => item.family).filter(Boolean));
  const sourceTiers = new Set(playbook.sources.map((item) => item.tier).filter(Boolean));
  const sourceUrls = new Set(playbook.sources.map((item) => item.url).filter(Boolean));
  const checks = [
    receiptCheck("research_scout_ready", paths.research_scout, "EXTERNAL_RESEARCH_SCOUT_READY", {
      accept: (parsed, status) => ["EXTERNAL_RESEARCH_SCOUT_READY", "EXTERNAL_RESEARCH_SCOUT_DEGRADED"].includes(status) && parsed?.network_policy?.credentials_used === false && parsed?.network_policy?.paid_model_calls === false,
      detail: (parsed) => ({ candidate_count: parsed?.candidate_count || 0, public_sources_only: parsed?.network_policy?.credentials_used === false }),
    }),
    receiptCheck("knowledge_queue_ready", paths.knowledge, "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY", {
      accept: (parsed, status) => status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" && parsed?.not_autonomous === true,
      detail: (parsed) => ({ candidate_count: parsed?.candidate_count || 0, not_autonomous: parsed?.not_autonomous ?? null }),
    }),
    check("assurance_sources_present", playbook.sources.length >= 3, { count: playbook.sources.length }),
    check("nih_or_pubmed_present", [...sourceFamilies].some((family) => /nih|pubmed|biomed/i.test(family)), { source_families: [...sourceFamilies].sort() }),
    check("research_or_benchmark_present", [...sourceFamilies].some((family) => /arxiv|research|benchmark/i.test(family)) || [...sourceTiers].some((tier) => /RESEARCH/i.test(tier)), { source_tiers: [...sourceTiers].sort() }),
    check("public_urls_present", sourceUrls.size >= 3, { unique_url_count: sourceUrls.size }),
    check("knowledge_assurance_candidate_present", knowledgeAssurance.length >= 1, { candidate_count: knowledgeAssurance.length, unblocked_status: unblockedKnowledge?.status || null, proven_status: provenKnowledge?.status || null }),
    receiptCheck("harness_reference_present", paths.harness, null, {
      accept: (parsed) => exists(paths.harness) && Number(parsed?.tasks_total || 0) >= 20,
      detail: (parsed) => ({ status: parsed?.status || null, tasks_ok: parsed?.tasks_ok ?? null, tasks_total: parsed?.tasks_total ?? null }),
    }),
    receiptCheck("checkmate_green", paths.checkmate, "CHECKMATE_EVAL_LANE_GREEN", {
      accept: (parsed, status) => status === "CHECKMATE_EVAL_LANE_GREEN" && parsed?.constraints?.frontend_touched === false,
      detail: (parsed) => ({ fixture_count: parsed?.fixtures?.length || 0 }),
    }),
    receiptCheck("feature_proof_reference_present", paths.feature_proof, null, {
      accept: (parsed) => exists(paths.feature_proof)
        && parsed?.constraints?.frontend_touched === false
        && Number(parsed?.features_total || 0) >= 20,
      detail: (parsed) => ({ status: parsed?.status || null, features_green: parsed?.features_green ?? null, features_total: parsed?.features_total ?? null }),
    }),
    receiptCheck("tool_ergonomics_green", paths.tool_ergonomics, "ORANGEBOX_TOOL_ERGONOMICS_GREEN", {
      accept: (parsed, status) => status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN" && parsed?.constraints?.frontend_touched === false && parsed?.constraints?.paid_api_attempted === false,
      detail: (parsed) => ({ command_count: parsed?.command_surface?.command_count || 0 }),
    }),
    receiptCheck("mcp_quarantine_green", paths.mcp, null, {
      accept: (parsed) => parsed?.ok === true && parsed?.summary?.failed === 0 && parsed?.host_mcp_config_mutated === false && parsed?.paid_api_attempted === false,
      detail: (parsed) => ({ failed: parsed?.summary?.failed ?? null, host_mcp_config_mutated: parsed?.host_mcp_config_mutated ?? null }),
    }),
    receiptCheck("action_classifier_green", paths.action, "ORANGEBOX_ACTION_CLASSIFIER_GREEN", {
      accept: (parsed, status) => status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN" && Number(parsed?.blocked_count || 0) >= 1,
      detail: (parsed) => ({ cases_run: parsed?.cases_run || 0, blocked_count: parsed?.blocked_count || 0 }),
    }),
    receiptCheck("indirect_prompt_injection_green", paths.ipi, "ORANGEBOX_IPI_DRILLS_GREEN", {
      accept: (parsed, status) => {
        const drills = Array.isArray(parsed?.drills) ? parsed.drills : [];
        const untrusted = drills.filter((drill) => drill.trusted === false);
        return status === "ORANGEBOX_IPI_DRILLS_GREEN"
          && parsed?.constraints?.frontend_touched === false
          && parsed?.constraints?.network_called === false
          && parsed?.constraints?.command_executed === false
          && Number(parsed?.summary?.fixtures_green || 0) === Number(parsed?.summary?.fixtures_total || -1)
          && untrusted.length >= 5
          && untrusted.every((drill) => drill.final_disposition === "quarantine_untrusted_text");
      },
      detail: (parsed) => ({ fixtures_green: parsed?.summary?.fixtures_green ?? null, fixtures_total: parsed?.summary?.fixtures_total ?? null, command_executed: parsed?.constraints?.command_executed ?? null }),
    }),
    receiptCheck("memory_source_truth_green", paths.memory, "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN", {
      accept: (parsed, status) => status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN"
        && parsed?.constraints?.frontend_touched === false
        && parsed?.constraints?.raw_history_injected === false
        && Number(parsed?.summary?.drills_green || 0) === Number(parsed?.summary?.drills_total || -1)
        && Number(parsed?.summary?.stale_conflicts_detected || 0) >= 1,
      detail: (parsed) => ({ drills_green: parsed?.summary?.drills_green ?? null, drills_total: parsed?.summary?.drills_total ?? null, stale_conflicts_detected: parsed?.summary?.stale_conflicts_detected ?? null }),
    }),
    check("package_script_present", Boolean(packageJson.scripts?.["assurance:doctor"]), { script: packageJson.scripts?.["assurance:doctor"] || null }),
    check("playbook_has_required_gates", playbook.gates.length >= 6 && playbook.gates.some((gate) => gate.id === "no_auto_promotion") && playbook.gates.some((gate) => gate.id === "deterministic_validation_first"), { gate_ids: playbook.gates.map((gate) => gate.id) }),
    check("project_preserves_backend_scope", backendProofInProgress || (
      Boolean(project?.evidence?.feature_proof?.path) &&
      project?.scope?.some((row) => row?.area === "Orangebox Ops backend" && ["REAL", "PARTIAL", "NONBLOCKING_ATTENTION"].includes(row?.status)) &&
      project?.scope?.some((row) => row?.area === "Visual/frontend lane" && row?.status === "SEPARATE_LANE")
    ), {
      local_ops_green: project?.local_ops_green ?? null,
      full_project_green: project?.full_project_green ?? null,
      feature_proof_path: project?.evidence?.feature_proof?.path || null,
      backend_lane_status: project?.scope?.find((row) => row?.area === "Orangebox Ops backend")?.status || null,
      visual_lane_status: project?.scope?.find((row) => row?.area === "Visual/frontend lane")?.status || null,
      backend_proof_in_progress: backendProofInProgress,
    }),
  ];

  const constraints = {
    frontend_touched: false,
    visual_lane_touched: false,
    install_attempted: false,
    paid_api_attempted: false,
    host_mcp_config_mutated: false,
    production_deploy_attempted: false,
    remote_codexa_mutation_attempted: false,
    autonomous_promotion_attempted: false,
  };
  const failed = checks.filter((item) => !item.ok);
  const proofSubject = {
    checks: checks.map((item) => ({ id: item.id, ok: item.ok, status: item.status || null })),
    constraints,
    playbook: {
      gate_ids: playbook.gates.map((gate) => gate.id),
      source_ids: playbook.sources.map((source) => source.id),
      synthesis: playbook.assurance_synthesis.map((item) => item.synthesis),
    },
  };
  const result = {
    ok: failed.length === 0,
    version: "orangebox-assurance-lab-doctor/v1",
    status: failed.length === 0 ? "ORANGEBOX_ASSURANCE_LAB_GREEN" : "ORANGEBOX_ASSURANCE_LAB_NEEDS_WORK",
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "External knowledge becomes Orangebox capability only after source tiering, backend scope fit, deterministic validation, receipt proof, rollback, and operator approval.",
    summary: {
      source_count: playbook.sources.length,
      synthesis_count: playbook.assurance_synthesis.length,
      knowledge_candidate_count: playbook.knowledge_candidates.length,
      checks_total: checks.length,
      checks_green: checks.length - failed.length,
      failures: failed.length,
    },
    playbook,
    checks,
    failures: failed.map((item) => ({ id: item.id, status: item.status || null, path: item.path || null })),
    constraints,
    proof_hash: hashObject(proofSubject),
    rollback_path: "Revert the assurance doctor/command/report wiring, discard assurance-lab receipts, and rerun package-script-doctor, feature:proof, project:report, and harness:benchmark.",
    next_action: failed.length === 0
      ? "Keep assurance:doctor in backend proof before promoting research-derived system changes."
      : "Fix the failed assurance check(s), refresh the source receipt(s), then rerun npm.cmd run assurance:doctor.",
  };

  const latestPath = path.join(outRoot, "latest-assurance-lab.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-assurance-lab-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
