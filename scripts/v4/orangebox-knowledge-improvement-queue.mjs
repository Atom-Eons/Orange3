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

function proofForArea(area) {
  if (area === "skill_lifecycle_compression") {
    const file = path.join(dataRoot, "skills", "latest-skill-lifecycle.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_SKILL_LIFECYCLE_GREEN"
      && proof?.compression_proof?.status === "SKILL_COMPRESSION_GREEN"
      && proof?.compression_proof?.wrapper_mapping_rate === 1
      && Number(proof?.compression_proof?.command_count || 0) >= 1;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: proof.compression_proof.status,
      }
      : null;
  }
  if (area === "action_classifier_permission_gate") {
    const file = path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN"
      && Number(proof?.cases_run || 0) >= 10
      && Number(proof?.blocked_count || 0) >= 1
      && Number(proof?.staged_count || 0) >= 1
      && Number(proof?.sequence_cases_run || 0) >= 3
      && Number(proof?.sequence_blocked_count || 0) >= 1;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.blocked_count} blocked / ${proof.staged_count} staged / ${proof.cases_run} single-action fixtures; ${proof.sequence_blocked_count} blocked / ${proof.sequence_cases_run} sequence fixtures`,
      }
      : null;
  }
  if (area === "mcp_quarantine_gateway" || area === "mcp_supply_chain_security") {
    const file = path.join(dataRoot, "mcp", "latest-mcp-doctor.json");
    const proof = readJson(file);
    const ok = proof?.ok === true
      && proof?.host_mcp_config_mutated === false
      && Number(proof?.summary?.failed || 0) === 0
      && Number(proof?.summary?.passed || 0) >= 1;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status || "MCP_QUARANTINE_GREEN",
        proof_detail: `${proof.summary.passed}/${proof.summary.checks} MCP checks passed; host config mutation false`,
      }
      : null;
  }
  if (area === "indirect_prompt_injection_drills") {
    const file = path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json");
    const proof = readJson(file);
    const drills = Array.isArray(proof?.drills) ? proof.drills : [];
    const untrusted = drills.filter((drill) => drill.trusted === false);
    const ok = proof?.status === "ORANGEBOX_IPI_DRILLS_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.network_called === false
      && proof?.constraints?.command_executed === false
      && Number(proof?.summary?.fixtures_green || 0) === Number(proof?.summary?.fixtures_total || -1)
      && untrusted.length >= 5
      && untrusted.every((drill) => drill.final_disposition === "quarantine_untrusted_text");
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.summary.fixtures_green}/${proof.summary.fixtures_total} IPI drills; untrusted=${untrusted.length}; command_executed=${proof.constraints.command_executed}`,
      }
      : null;
  }
  if (area === "memory_interference_eval") {
    const file = path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.raw_history_injected === false
      && Number(proof?.summary?.drills_green || 0) === Number(proof?.summary?.drills_total || -1)
      && Number(proof?.summary?.stale_conflicts_detected || 0) >= 1;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.summary.drills_green}/${proof.summary.drills_total} memory/source drills; stale_conflicts=${proof.summary.stale_conflicts_detected}; raw_history_injected=${proof.constraints.raw_history_injected}`,
      }
      : null;
  }
  if (area === "tool_ergonomics_eval_lane") {
    const file = path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.install_attempted === false
      && proof?.constraints?.paid_api_attempted === false
      && Number(proof?.command_surface?.command_count || 0) >= 1
      && Array.isArray(proof?.failures)
      && proof.failures.length === 0;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.command_surface.command_count} commands checked; no frontend/install/API mutation`,
      }
      : null;
  }
  if (area === "checkmate_eval_lane" || area === "eval_integrity_and_benchmark_hygiene") {
    const file = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");
    const proof = readJson(file);
    const fixtures = Array.isArray(proof?.fixtures) ? proof.fixtures : [];
    const hygieneFixture = fixtures.find((fixture) => fixture.id === "benchmark_hygiene_integrity_gate");
    const ok = proof?.status === "CHECKMATE_EVAL_LANE_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.prompt_model_or_routing_changed === false
      && Number(fixtures.length || 0) >= (area === "eval_integrity_and_benchmark_hygiene" ? 6 : 5)
      && Array.isArray(proof?.failures)
      && proof.failures.length === 0
      && (area !== "eval_integrity_and_benchmark_hygiene"
        || (Boolean(hygieneFixture)
          && hygieneFixture.canaries?.includes("source_leakage_check")
          && hygieneFixture.canaries?.includes("web_trace_warning")
          && hygieneFixture.canaries?.includes("adversarial_score_validation")
          && hygieneFixture.reject_if?.includes("unsupported_score_inflation")));
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: area === "eval_integrity_and_benchmark_hygiene"
          ? `${fixtures.length} eval fixtures include benchmark hygiene, leakage canaries, web-trace warning, and score-inflation rejection`
          : `${fixtures.length} eval fixtures gate prompt/model/routing/tool/score changes`,
      }
      : null;
  }
  if (area === "operator_signal_hygiene") {
    const file = path.join(dataRoot, "signal-hygiene", "latest-operator-signal-hygiene.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_OPERATOR_SIGNAL_HYGIENE_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.popup_created_by_this_doctor === false
      && proof?.signal_hygiene?.version === "orangebox-signal-hygiene/v1"
      && proof?.confidence_calibration?.local_ops
      && Array.isArray(proof?.failures)
      && proof.failures.length === 0;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `severity=${proof.signal_hygiene.severity}; confidence=${proof.confidence_calibration.local_ops}; checks=${proof.checks.length}`,
      }
      : null;
  }
  if (area === "operator_situation_awareness") {
    const healthFile = path.join(dataRoot, "reports", "health", "latest-health-report.json");
    const projectFile = path.join(dataRoot, "reports", "project", "latest-project-report.json");
    const realityFile = path.join(dataRoot, "watcher", "latest-reality-watch.json");
    const health = readJson(healthFile);
    const project = readJson(projectFile);
    const reality = readJson(realityFile);
    const ok = health?.status === "ORANGEBOX_HEALTH_DEV_GREEN_AIBOX_WARN"
      && project?.status === "ORANGEBOX_PROJECT_SCOPE_REPORTED_WITH_GAPS"
      && project?.local_ops_green === true
      && project?.full_project_green === false
      && reality?.status === "ONE_REALITY_WITH_WARNINGS";
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: projectFile,
        proof_status: project.status,
        proof_detail: `health=${health.status}; reality=${reality.status}; gaps=${project.gap_count}`,
      }
      : null;
  }
  if (area === "doer_watcher_session_spine") {
    const file = path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_DOER_WATCHER_SPINE_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.visual_lane_touched === false
      && proof?.doer?.command_server?.ok === true
      && proof?.watcher?.watcher_process?.ok === true
      && proof?.one_reality?.local_ops_green === true
      && Array.isArray(proof?.failures)
      && proof.failures.length === 0;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `doer=${proof.doer.command_server.ok}; watcher_age_ms=${proof.watcher.watcher_process.age_ms}; codexa=${proof.one_reality.codexa_status}`,
      }
      : null;
  }
  if (area === "long_horizon_feature_proof") {
    const file = path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN"
      && Number(proof?.features_total || 0) >= 15
      && Number(proof?.features_green || 0) === Number(proof?.features_total || -1)
      && proof?.constraints?.frontend_touched === false
      && Array.isArray(proof?.failures)
      && proof.failures.length === 0;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.features_green}/${proof.features_total} feature claims have evidence, proof commands, and rollback/recovery truth`,
      }
      : null;
  }
  if (area === "codex_harness_and_compaction") {
    const packetFile = path.join(dataRoot, "restore-packets", "ORANGEBOX_RESTORE_PACKET.latest.md");
    const harnessFile = path.join(dataRoot, "harness", "latest-harness-benchmark.json");
    const harness = readJson(harnessFile);
    let packetText = "";
    try {
      packetText = fs.readFileSync(packetFile, "utf8").replace(/^\uFEFF/, "");
    } catch {
      packetText = "";
    }
    const restoreTask = Array.isArray(harness?.tasks)
      ? harness.tasks.find((task) => task.id === "chatbackup_restore_packet_truth")
      : null;
    const packetOk = /Orangebox Zero-Memory Chat Primer/i.test(packetText)
      && /Orangebox Ops backend/i.test(packetText)
      && /local files and receipts as truth/i.test(packetText)
      && /ChatBackup archives to restore project continuity/i.test(packetText);
    const ok = packetOk
      && harness?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN"
      && harness?.ok === true
      && restoreTask?.ok === true
      && restoreTask?.budget_ok === true;
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: harnessFile,
        proof_status: harness.status,
        proof_detail: `restore_packet=${packetFile}; task=${restoreTask.id}; packet_bytes=${Buffer.byteLength(packetText, "utf8")}`,
      }
      : null;
  }
  if (area === "research_assurance_lab") {
    const file = path.join(dataRoot, "assurance-lab", "latest-assurance-lab.json");
    const proof = readJson(file);
    const ok = proof?.status === "ORANGEBOX_ASSURANCE_LAB_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.paid_api_attempted === false
      && proof?.constraints?.autonomous_promotion_attempted === false
      && Number(proof?.summary?.source_count || 0) >= 3
      && Number(proof?.summary?.checks_green || 0) === Number(proof?.summary?.checks_total || -1);
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.summary.source_count} assurance sources; ${proof.summary.checks_green}/${proof.summary.checks_total} checks; proof=${proof.proof_hash}`,
      }
      : null;
  }
  if (area === "local_model_lane_eval") {
    const file = path.join(dataRoot, "models", "latest-local-model-lane-eval.json");
    const proof = readJson(file);
    const ok = proof?.status === "LOCAL_MODEL_LANE_EVAL_GREEN"
      && proof?.constraints?.frontend_touched === false
      && proof?.constraints?.paid_api_attempted === false
      && proof?.constraints?.ollama_pull_attempted === false
      && proof?.constraints?.model_call_attempted === false
      && proof?.promotion_law?.no_model_card_promotion === true
      && proof?.promotion_law?.wildcard_never_final_authority === true
      && Number(proof?.packet_eval?.fixtures_green || 0) === Number(proof?.packet_eval?.fixtures_total || -1);
    return ok
      ? {
        ok: true,
        status: "proven_receipt_green",
        proof_path: file,
        proof_status: proof.status,
        proof_detail: `${proof.packet_eval.fixtures_green}/${proof.packet_eval.fixtures_total} packet role fixtures; core installed ${proof.inventory_truth.core_installed_count}/${proof.inventory_truth.core_total}`,
      }
      : null;
  }
  return null;
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

function shouldSkipHistoricalReceipt(file) {
  const name = path.basename(file);
  if ([
    "orangebox-external-research-scout-",
    "orangebox-project-report-",
    "orangebox-health-report-",
    "orangebox-knowledge-improvement-queue-",
    "orangebox-reality-watch-",
    "orangebox-tool-ergonomics-",
  ].some((prefix) => name.startsWith(prefix))) {
    return true;
  }
  return latestProofAlreadyGreenForReceipt(name);
}

function latestProofAlreadyGreenForReceipt(name) {
  const checks = [
    {
      prefix: "orangebox-harness-benchmark-",
      file: path.join(dataRoot, "harness", "latest-harness-benchmark.json"),
      status: "ORANGEBOX_HARNESS_BENCHMARK_GREEN",
    },
    {
      prefix: "orangebox-feature-acceptance-matrix-",
      file: path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json"),
      status: "ORANGEBOX_FEATURE_ACCEPTANCE_MATRIX_GREEN",
    },
    {
      prefix: "orangebox-doer-watcher-spine-",
      file: path.join(dataRoot, "doer-watcher", "latest-doer-watcher-spine.json"),
      status: "ORANGEBOX_DOER_WATCHER_SPINE_GREEN",
    },
    {
      prefix: "orangebox-delta-final-package-",
      file: path.join(dataRoot, "downloads", "latest-orangebox-delta-final-download-zip.json"),
      status: "ORANGEBOX_DOWNLOAD_ZIP_VERIFIED_GREEN",
    },
  ];
  const check = checks.find((item) => name.startsWith(item.prefix));
  if (!check) return false;
  const latest = readJson(check.file);
  return latest?.status === check.status;
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
  if (/operator_signal_hygiene|alert fatigue|alarm fatigue|notification fatigue|popup throttling|severity labels|visible confidence|calibrated trust|human-ai teaming|human ai teaming/.test(text)) return { area: "operator_signal_hygiene", action: "Promote as signal-hygiene rule only: popup throttling, severity labels, alert fatigue limits, and visible confidence calibration." };
  if (/operator_situation_awareness|automation bias|automation complacency|over-reliance|overreliance|vigilance|situation awareness|human factors|calibrated trust|project report|project:report|full project completion/.test(text)) return { area: "operator_situation_awareness", action: "Promote as watcher/health-report rule only: visible status, failure drills, calibrated trust, and no silent automation." };
  if (/action_classifier_permission_gate|auto mode|action classifier|permission prompt|approval fatigue|overeager|credential exploration|review bypass|transcript classifier|deny-and-continue/.test(text)) return { area: "action_classifier_permission_gate", action: "Review an Orangebox command-action classifier candidate: block overeager scope expansion, credential hunting, review bypass, and exfiltration before tool execution." };
  if (/indirect[-_ ]prompt[-_ ]injection|untrusted (?:text|content|tool output|observation|metadata)|retrieved memory|repository_readme|repo readme|command smuggling|injected command|tool-result taint|external content.*(?:tool|command)|email.*(?:tool|command)|pdf.*(?:tool|command)|webpage.*(?:tool|command)|tool output.*(?:instruction|command)/i.test(text)) return { area: "indirect_prompt_injection_drills", action: "Promote as IPI drill receipt only: untrusted text is quarantined as data, extracted commands are classifier-evidenced, and no command executes from external content." };
  if (/tool_ergonomics_eval_lane|tool ergonomics|tool names|tool descriptions|response_format|output caps|bad tool descriptions|writing effective tools/.test(text)) return { area: "tool_ergonomics_eval_lane", action: "Review tool-ergonomics candidate; promote only as command/tool fixtures with transcript repair proof and output caps." };
  if (/eval_integrity_and_benchmark_hygiene|eval awareness|benchmark leakage|contamination|canary|string|ai-resistant|ai resistant|benchmark hygiene|browsecomp|answer key/.test(text)) return { area: "eval_integrity_and_benchmark_hygiene", action: "Promote only as CHECKMATE benchmark hygiene: source leakage checks, eval-canary blocklists, web-trace warnings, and adversarial score validation." };
  if (/memory_interference_eval|memory interference|multi-target|revised facts|revised information|intervening updates|memory construction|indexed experience|dereference|experience database/.test(text)) return { area: "memory_interference_eval", action: "Review memory-interference probes for Orangebox/AtomSmasher: revised-fact recall, multi-target aggregation, source-index dereference, and stale-memory receipts." };
  if (/mcp_supply_chain_security|\brce\b|remote code execution|\bstdio\b|supply chain|prompt injection|command execution|localhost|dns rebinding|\bcors\b/.test(text)) return { area: "mcp_supply_chain_security", action: "Promote as MCP quarantine fixture only: metadata-only STDIO, fixed command templates, localhost proof, output caps, approval gate." };
  if (/judge_reliability_and_strongarm|llm judge|judge reliability|evidence verification|reflect|cannot overrule failed checks/.test(text)) return { area: "judge_reliability_and_strongarm", action: "Add STRONGARM/Mirror evals requiring receipt citations; deterministic gates remain sovereign." };
  if (/skill_lifecycle_compression|skill lifecycle|agent skills|procedural skill|experience compression|compression spectrum|declarative rules|microskill/i.test(text)) return { area: "skill_lifecycle_compression", action: "Review skill compression candidate; promote only if it reduces repeated work and passes stale-skill/vendor gates." };
  if (/mcp|model context protocol|tool output|tool search|resources|prompt injection/i.test(text)) return { area: "mcp_quarantine_gateway", action: "Review MCP/source-scope candidate; promote only through quarantine gateway fixture and receipt." };
  if (/brain|hands|session|durable|event log|harness|wake|time-to-first-token|ttft/i.test(text)) return { area: "doer_watcher_session_spine", action: "Review durable session/harness candidate; promote as resumability, rail recovery, or watcher proof only." };
  if (/long_horizon_feature_proof|roadmapbench|featurebench|long-horizon|version upgrade|multi-target|acceptance matrices/.test(text)) return { area: "long_horizon_feature_proof", action: "Promote as project proof upgrade: feature contract, tests, rollback, and receipt-based completion claims." };
  if (/codex_harness_and_compaction|codex|agent loop|responses api|computer environment|shell-action receipts|compaction restore/.test(text)) return { area: "codex_harness_and_compaction", action: "Review Codex harness candidate; promote only as primer, restore packet, shell receipt, or cross-agent handoff check." };
  if (/ai box|aibox|codexa|8097|8098|ollama|rail|two[-_ ]machine|full[-_ ]system|full[-_ ]green|DEV_GREEN_AIBOX_WARN|ONE_REALITY_WITH_WARNINGS|full_project_green|Project report has .*gap/i.test(text)) return { area: "codexa_ai_box", action: "Run power optimizer, rail starter, and model doctor on Codexa." };
  if (/pubmed|nih|biomedical|bioinformatics|clinical|healthcare|health care|assurance/i.test(text)) return { area: "research_assurance_lab", action: "Review assurance-lab candidate; translate only into playbook, benchmark, or proof-receipt work." };
  if (/local_model_lane_eval|model-card claims|model card|dolphin|qwen|hermes|abliterated|misfits|strongarm|judgement|mirror/i.test(text)) return { area: "local_model_lane_eval", action: "Review local model lane eval candidate; promote only through STRONGARM/Misfits/Mirror/Judgement packet tests and receipts." };
  if (/codexa_model_serving|vllm|llm serving|model serving|model-routing|model routing|throughput|quantization/i.test(text)) return { area: "codexa_model_serving", action: "Review Codexa model-serving candidate only after core Ollama proof is green; add model doctor checks before serving-stack changes." };
  if (/hermes/i.test(text)) return { area: "hermes_orchestration", action: "Run Hermes install/doctor from OBOX2 pack after Codexa is stable." };
  if (/arxiv|agent memory|context compression|memory control|retrieval|compaction|context bloat/i.test(text)) return { area: "knowledge_engine_atomsmasher", action: "Review memory/control candidate; promote only as eval, benchmark, or AtomSmasher/Knowledge proof." };
  if (/sandbox|filesystem isolation|network isolation|credential|exfiltrat|permission boundary|tool permission|network permission|filesystem permission|file permission/i.test(text)) return { area: "sandbox_and_permission_law", action: "Convert into path/network policy fixtures for MCP servers, Codexa rails, and installer proof." };
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

const executionProfiles = {
  action_classifier_permission_gate: {
    priority: 98,
    proof_command: "npm.cmd run action:doctor && npm.cmd run harness:benchmark",
    acceptance_gate: "New command-action classifier fixtures pass, dangerous scope expansion is blocked before tool execution, and the harness receipt stays green.",
  },
  mcp_supply_chain_security: {
    priority: 97,
    proof_command: "npm.cmd run mcp:doctor && npm.cmd run harness:benchmark",
    acceptance_gate: "MCP candidate stays quarantined, metadata/tool schemas are bounded, output caps hold, no host config mutation occurs, and receipts prove the gate.",
  },
  mcp_quarantine_gateway: {
    priority: 96,
    proof_command: "npm.cmd run mcp:doctor && npm.cmd run harness:benchmark",
    acceptance_gate: "MCP source-scope, localhost, stdio, command-template, and receipt checks pass without enabling a new external server by default.",
  },
  indirect_prompt_injection_drills: {
    priority: 97,
    proof_command: "npm.cmd run ipi:doctor && npm.cmd run action:doctor && npm.cmd run feature:proof && npm.cmd run harness:benchmark",
    acceptance_gate: "External text from email, web, repos, PDFs, chat logs, tool outputs, and memory is treated as data; any embedded command is classified only as evidence and never executed.",
  },
  tool_ergonomics_eval_lane: {
    priority: 93,
    proof_command: "npm.cmd run tool:ergonomics && npm.cmd run harness:benchmark",
    acceptance_gate: "Tool-name, output-shape, transcript-repair, and budget fixtures pass before any tool description or command surface is promoted.",
  },
  eval_integrity_and_benchmark_hygiene: {
    priority: 92,
    proof_command: "npm.cmd run harness:benchmark",
    acceptance_gate: "CHECKMATE/eval hygiene fixtures prove no source leakage, canary misses, benchmark-key exposure, or unsupported score inflation.",
  },
  checkmate_eval_lane: {
    priority: 90,
    proof_command: "npm.cmd run harness:benchmark",
    acceptance_gate: "Local eval fixture proves the proposed routing/model change before the model lane changes.",
  },
  judge_reliability_and_strongarm: {
    priority: 89,
    proof_command: "npm.cmd run strongarm:doctor && npm.cmd run gremlin:doctor && npm.cmd run harness:benchmark",
    acceptance_gate: "STRONGARM/Misfits packets cite evidence, cannot override failed deterministic gates, and keep training claims honest.",
  },
  memory_interference_eval: {
    priority: 87,
    proof_command: "npm.cmd run memory:doctor && npm.cmd run harness:benchmark",
    acceptance_gate: "Memory-interference fixture proves revised facts, stale recall, source dereference, and repeated hydration behavior without raw-history flooding.",
  },
  knowledge_engine_atomsmasher: {
    priority: 86,
    proof_command: "npm.cmd run atomsmasher:doctor && npm.cmd run knowledge:improvements && npm.cmd run harness:benchmark",
    acceptance_gate: "AtomSmasher/Knowledge changes emit receipts, preserve source truth, and improve sparse work without autonomous self-promotion.",
  },
  operator_signal_hygiene: {
    priority: 85,
    proof_command: "npm.cmd run health:report && npm.cmd run harness:benchmark",
    acceptance_gate: "Warnings remain machine-readable, popup cadence is fatigue-aware, severity labels are calibrated, and local/full-system green stays distinct.",
  },
  operator_situation_awareness: {
    priority: 84,
    proof_command: "npm.cmd run health:report && npm.cmd run project:report && npm.cmd run harness:benchmark",
    acceptance_gate: "Reports keep the operator and local watcher in one reality: reachable, unreachable, partial, and blocked states are explicit.",
  },
  skill_lifecycle_compression: {
    priority: 82,
    proof_command: "npm.cmd run skills:lifecycle && npm.cmd run harness:benchmark",
    acceptance_gate: "Skill candidates reduce repeated work, stale skills stay out of active roots, and every skill command maps to a real package proof.",
  },
  doer_watcher_session_spine: {
    priority: 81,
    proof_command: "npm.cmd run session:spine && npm.cmd run project:report && npm.cmd run harness:benchmark",
    acceptance_gate: "Doer/watcher receipts prove process truth, stale service detection, and resume context without burning paid model calls.",
  },
  long_horizon_feature_proof: {
    priority: 80,
    proof_command: "npm.cmd run feature:proof && npm.cmd run project:report && npm.cmd run harness:benchmark",
    acceptance_gate: "Feature claims include acceptance matrix, receipt, tests, rollback path, and honest unfinished/not-real state.",
  },
  codex_harness_and_compaction: {
    priority: 79,
    proof_command: "npm.cmd run chatbackup:restore && npm.cmd run harness:benchmark",
    acceptance_gate: "Cold-start/restore packets preserve project law, scope, and proof state without requiring hidden chat memory.",
  },
  sandbox_and_permission_law: {
    priority: 78,
    proof_command: "npm.cmd run action:doctor && npm.cmd run mcp:doctor && npm.cmd run harness:benchmark",
    acceptance_gate: "Path, network, credential, and command boundaries are fixture-tested before new execution surfaces are allowed.",
  },
  codexa_power: {
    priority: 77,
    proof_command: "npm.cmd run obox2:doctor && npm.cmd run health:report",
    acceptance_gate: "OBOX2 package proves always-on AC power, startup tasks, rail restart policy, and operator-visible Codexa status before AI Box work is claimed.",
    blocked_by: ["Codexa setup must be run on the AI Box or through a proven remote execution rail."],
  },
  codexa_ai_box: {
    priority: 76,
    proof_command: "npm.cmd run obox2:doctor && npm.cmd run codexa:alert && npm.cmd run health:report",
    acceptance_gate: "Codexa command rail, Ollama, receipts, and recovery artifacts are probed; local Ops remains green but full two-machine green stays gated until reachable.",
    blocked_by: ["Codexa command rail/Ollama are not reachable from this cockpit yet."],
  },
  local_model_lane_eval: {
    priority: 88,
    proof_command: "npm.cmd run trilane:doctor && npm.cmd run model:lane-eval && npm.cmd run harness:benchmark",
    acceptance_gate: "Local model lane claims are based on registry policy, packet role fixtures, STRONGARM/Misfits receipts, and honest installed inventory, not model-card claims.",
  },
  codexa_model_serving: {
    priority: 72,
    proof_command: "npm.cmd run trilane:doctor && npm.cmd run health:report",
    acceptance_gate: "Serving-stack changes wait until core Ollama proof is green and model doctor records throughput/availability truth.",
    blocked_by: ["Codexa core Ollama proof must be green before serving-stack upgrades."],
  },
  hermes_orchestration: {
    priority: 70,
    proof_command: "npm.cmd run obox2:doctor && npm.cmd run project:report",
    acceptance_gate: "Hermes is installed/verified through OBOX2 contracts before it is treated as a live orchestration layer.",
    blocked_by: ["Hermes is setup-contract ready but not proven installed/running on Codexa."],
  },
  research_assurance_lab: {
    priority: 68,
    proof_command: "npm.cmd run assurance:doctor && npm.cmd run feature:proof && npm.cmd run harness:benchmark",
    acceptance_gate: "Research source becomes a scoped assurance playbook, benchmark gate, receipt-backed proof task, and no-auto-promotion record, not broad unsourced architecture drift.",
  },
  knowledge_engine: {
    priority: 66,
    proof_command: "npm.cmd run knowledge:improvements && npm.cmd run harness:benchmark",
    acceptance_gate: "Knowledge candidates stay queued for operator approval and receive execution-ranked proof metadata.",
  },
  windows_process_lock: {
    priority: 65,
    proof_command: "npm.cmd run restart:lock && npm.cmd run final:verify",
    acceptance_gate: "Windows process-lock handling proves scoped stop/retry/rollback behavior without killing unrelated processes.",
  },
  legacy_cleanup: {
    priority: 64,
    proof_command: "npm.cmd run openclaw:retire && npm.cmd run health:report",
    acceptance_gate: "Legacy startup hooks are removed with backup receipt and are not restored without operator approval.",
  },
  general_ops: {
    priority: 45,
    proof_command: "npm.cmd run project:report && npm.cmd run harness:benchmark",
    acceptance_gate: "General Ops evidence is restated as a scoped task contract before any code change.",
  },
};

function executionProfile(area) {
  return executionProfiles[area] || executionProfiles.general_ops;
}

function clampScore(value) {
  return Math.max(1, Math.min(100, Math.round(value)));
}

function executionBacklogFromCandidates(candidates) {
  const items = candidates.map((candidate) => {
    const profile = executionProfile(candidate.area);
    const completion_proof = proofForArea(candidate.area);
    const proven = Boolean(completion_proof?.ok);
    const learnedFrom = Array.isArray(candidate.learned_from) ? candidate.learned_from : [];
    const evidenceCount = learnedFrom.length;
    const researchSignals = learnedFrom.filter((item) => /research-scout|external-research/i.test(String(item.source || ""))).length;
    const score = clampScore(
      profile.priority
      + Number(candidate.confidence || 0) * 8
      + Math.min(6, evidenceCount)
      + Math.min(5, researchSignals * 2)
      - Math.min(12, (profile.blocked_by || []).length * 6),
    );
    return {
      id: `${candidate.id}_exec`,
      area: candidate.area,
      title: candidate.title,
      status: proven
        ? "proven_receipt_green"
        : ((profile.blocked_by || []).length ? "approval_ready_but_blocked" : "approval_ready"),
      execution_score: score,
      confidence: candidate.confidence,
      evidence_count: evidenceCount,
      research_signal_count: researchSignals,
      why_now: `Evidence cluster ${candidate.id} has confidence ${candidate.confidence} and ${evidenceCount} source signal(s); ranked by backend Ops impact, proofability, and current blockers.`,
      implementation_candidate: candidate.proposed_next_action,
      proof_command: profile.proof_command,
      acceptance_gate: profile.acceptance_gate,
      blocked_by: profile.blocked_by || [],
      scope: "backend_ops_only",
      frontend_touch_allowed: false,
      operator_approval_required: true,
      auto_promote: false,
      proven,
      completion_proof,
      rollback_path: "Revert the scoped patch/receipt-producing change and rerun the same proof command before promotion.",
      promotion_gate: candidate.promotion_gate,
    };
  });
  return items
    .sort((a, b) => Number(a.proven) - Number(b.proven) || b.execution_score - a.execution_score || b.confidence - a.confidence)
    .map((item, index) => ({ rank: index + 1, ...item }));
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
    path.join(dataRoot, "prompt-injection", "latest-ipi-doctor.json"),
    path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"),
  ];
  for (const file of reportFiles) {
    const data = readJson(file);
    if (data) collectFromObject(findings, file, data);
  }
  const receiptFilesScanned = listRecentJsonFiles(receiptDir, 80)
    .filter((file) => !shouldSkipHistoricalReceipt(file));
  for (const file of receiptFilesScanned) {
    if (shouldSkipHistoricalReceipt(file)) continue;
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
  const executionBacklog = executionBacklogFromCandidates(candidates).slice(0, 12);
  const provenExecutionItems = executionBacklog.filter((item) => item.proven);

  const result = {
    ok: true,
    version: "orangebox-knowledge-improvement-queue/v1",
    status: "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Observe, dedupe, score, and queue. Do not self-promote. Operator approval and receipts are required.",
    source_count: reportFiles.length + receiptFilesScanned.length,
    finding_count: findings.length,
    candidate_count: candidates.length,
    candidates,
    execution_backlog_count: executionBacklog.length,
    proven_execution_count: provenExecutionItems.length,
    proven_execution_items: provenExecutionItems,
    execution_backlog: executionBacklog,
    top_execution_candidate: executionBacklog[0] || null,
    next_backend_action: executionBacklog[0]
      ? `${executionBacklog[0].title} -> ${executionBacklog[0].proof_command}`
      : "No backend execution candidate is currently ranked.",
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
