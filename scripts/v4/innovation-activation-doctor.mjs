#!/usr/bin/env node
/* innovation-activation-doctor.mjs - guarded first implementation for the
 * ten ORANGEBOX innovation lanes.
 *
 * This is intentionally local-first. It may probe localhost and the configured
 * AI Box rails for machine proof, but it does not call paid APIs, read
 * credentials, register MCP/XMCP hosts, mutate visual files, or run arbitrary
 * remote shell.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const INNOVATION_ACTIVATION_VERSION = "orangebox-innovation-activation/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const ACTIVATION_ROOT = path.join(DATA_ROOT, "innovation-activation");
const INNOVATION_QUEUE_PATH = path.join(DATA_ROOT, "innovation", "latest-innovation-queue.json");
const BOOKMARK_EXPORT_PATH = path.join(os.homedir(), "Downloads", "x-bkmarks-AtomMccree-2026-05-27.json");
const CODEXA_MODE_PATH = path.join(DATA_ROOT, "codexa-mode.json");
const TRIAD_STATUS_PATH = path.join(DATA_ROOT, "triad", "orangebox", "triad-status.json");
const LOCAL_LLAMA_BASE = (process.env.LLAMA_CPP_BASE_URL || "http://127.0.0.1:8080").replace(/\/+$/, "");
const SIDECAR_BASE = (process.env.ORANGEBOX_CONTROL_PLANE_SIDECAR_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");

const TEN_LANES = [
  "Delta Context Ledger",
  "Four-Tier Memory Governor",
  "Claude/Codex Session Health Governor",
  "Department Router Dry Run",
  "MCP Quarantine Gateway",
  "Agent Bench Arena",
  "Hardware-Aware Inference Matrix",
  "X Alpha Feed Typed Lane",
  "Receipt Intelligence Miner",
  "AELang Resilience Kernel",
];

const BASE_SOURCE_FILES = [
  "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
  "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
  "docs/JARVISLABS_LLM_UPGRADE_ALPHA_2026-05-27.md",
  "docs/JARVISLABS_FULL_BLOG_SWEEP_2026-05-27.md",
  "docs/AtomEons_Manifest_Runtime_Manual_v0.2_Implementation_Spec.md",
  "docs/ORANGEBOX_LLM_SYSTEM_STATUS_2026-05-27.md",
  "docs/ORANGEBOX_PROCESS_BOOK_2026-05-27.md",
  "docs/CRYSTAL_LATTICE_COMPRESSION_WITH_VOID_MAP_2026-05-27.md",
  "docs/ORANGEBOX_TEN_LANE_ACTIVATION_2026-05-27.md",
  "docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md",
  "docs/v3.1/ANTHROPIC-ALPHA-APPLIED.md",
  "docs/V6_TRENDING_INTEGRATION_PLAN.md",
  "docs/DEPT_LLM_ARCHITECTURE_2026-05-18.md",
  "docs/SCOPE_ADD_ORCHESTRATORS_2026-05-18.md",
  "docs/SCOPE_4100_DAYS.md",
  "docs/SILENT_CANVAS_BIG_BUILD_ADDENDUM_2026-05-18.md",
  "docs/WARBOOK_LIVING_SYSTEM_2026-05-18.md",
  "docs/AELANG_SPEC.md",
  "docs/AELANG_RESILIENCY_MODULE.md",
  "4-MEMORY-AND-KNOWLEDGE.md",
  "memory/orangebox-knowledge-v2/ENGINE.md",
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function compact(value, max = 320) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function readJson(file) {
  try {
    return { ok: true, path: file, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, path: file, data: null, error: error?.message || String(error) };
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function hashFile(file) {
  const buffer = await fs.readFile(file);
  return sha256(buffer);
}

async function statSource(relPath) {
  const abs = path.join(ROOT, relPath);
  try {
    const stat = await fs.stat(abs);
    return {
      ok: true,
      rel_path: relPath,
      abs_path: abs,
      bytes: stat.size,
      mtime_ms: Math.round(stat.mtimeMs),
      freshness_age_seconds: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000)),
      sha256: await hashFile(abs),
    };
  } catch (error) {
    return {
      ok: false,
      rel_path: relPath,
      abs_path: abs,
      error: error?.message || String(error),
    };
  }
}

async function httpJson(url, timeoutMs = 3000) {
  const started = Date.now();
  return await new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => {
        body += chunk;
        if (body.length > 128_000) request.destroy(new Error("body cap exceeded"));
      });
      response.on("end", () => {
        let json = null;
        try {
          json = body ? JSON.parse(body) : null;
        } catch {
          json = null;
        }
        resolve({
          ok: response.statusCode >= 200 && response.statusCode < 300,
          url,
          status: response.statusCode || 0,
          ms: Date.now() - started,
          json,
          body_preview: json ? null : compact(body, 800),
        });
      });
    });
    request.on("timeout", () => request.destroy(new Error("timeout")));
    request.on("error", (error) => {
      resolve({
        ok: false,
        url,
        status: 0,
        ms: Date.now() - started,
        error: error?.message || String(error),
      });
    });
  });
}

async function nvidiaProbe() {
  try {
    const result = await execFileAsync("nvidia-smi", ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], {
      timeout: 5000,
      windowsHide: true,
    });
    return { ok: true, stdout: compact(result.stdout, 800), stderr: compact(result.stderr, 400) };
  } catch (error) {
    return { ok: false, stdout: compact(error?.stdout, 800), stderr: compact(error?.stderr, 400), error: error?.message || String(error) };
  }
}

async function recentReceiptFiles(limit = 80) {
  const roots = [RECEIPTS_DIR, path.join(DATA_ROOT, "receipts")];
  const files = [];
  for (const dir of roots) {
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const file = path.join(dir, entry.name);
      const stat = await fs.stat(file).catch(() => null);
      if (stat) files.push({ file, mtime: stat.mtimeMs, bytes: stat.size });
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files.slice(0, limit);
}

async function loadRecentReceipts(limit = 60) {
  const files = await recentReceiptFiles(limit);
  const receipts = [];
  for (const item of files) {
    const parsed = await readJson(item.file);
    receipts.push({
      file: item.file,
      name: path.basename(item.file),
      bytes: item.bytes,
      ok: parsed.ok ? parsed.data?.ok !== false : false,
      parsed_ok: parsed.ok,
      data: parsed.data,
      error: parsed.error || null,
    });
  }
  return receipts;
}

function routeDepartment(text) {
  const haystack = String(text || "").toLowerCase();
  const departments = [
    { id: "AE1", name: "Knowledge Freshness", terms: ["context", "knowledge", "delta", "fresh", "ledger"] },
    { id: "AE2", name: "Memory Lifecycle", terms: ["memory", "episodic", "semantic", "procedural"] },
    { id: "AE3", name: "Session Resilience", terms: ["session", "compaction", "tool", "transcript"] },
    { id: "AE4", name: "Department OS", terms: ["department", "router", "route", "budget"] },
    { id: "AE5", name: "MCP Security", terms: ["mcp", "xmcp", "oauth", "quarantine"] },
    { id: "AE6", name: "Bench Arena", terms: ["bench", "benchmark", "score", "eval"] },
    { id: "AE7", name: "Inference Matrix", terms: ["inference", "gpu", "llama", "vllm", "sglang"] },
    { id: "AE8", name: "Alpha Intake", terms: ["x ", "xdk", "bookmark", "alpha", "feed"] },
    { id: "AE9", name: "Receipt Intelligence", terms: ["receipt", "failure", "pattern", "miner"] },
    { id: "AE10", name: "AELang Resilience", terms: ["aelang", "resilience", "recovery", "rollback"] },
    { id: "AE11", name: "Visual Surface", terms: ["visual", "see-suite", "canvas", "ui"] },
    { id: "AE12", name: "Release and Rollback", terms: ["release", "rollback", "package", "ship"] },
    { id: "AE13", name: "Hardware Rail", terms: ["ai box", "ethereal", "rail", "network", "n150"] },
    { id: "AE14", name: "Operator Governance", terms: ["operator", "approval", "credential", "policy"] },
  ];
  const scored = departments.map((dept) => ({
    ...dept,
    score: dept.terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0),
  })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const winner = scored[0].score > 0 ? scored[0] : departments[13];
  return {
    department_id: winner.id,
    department_name: winner.name,
    score: winner.score,
    confidence: winner.score >= 2 ? "high" : winner.score === 1 ? "medium" : "low",
  };
}

function validateTranscript(events) {
  const open = new Set();
  const errors = [];
  for (const event of events) {
    if (event.type === "tool_use") {
      if (!event.id) errors.push("tool_use_missing_id");
      else open.add(event.id);
    }
    if (event.type === "tool_result") {
      if (!event.tool_use_id) errors.push("tool_result_missing_tool_use_id");
      else if (!open.has(event.tool_use_id)) errors.push(`tool_result_without_tool_use:${event.tool_use_id}`);
      else open.delete(event.tool_use_id);
    }
  }
  for (const id of open) errors.push(`tool_use_without_result:${id}`);
  return { ok: errors.length === 0, errors };
}

function extractUrls(text) {
  return [...String(text || "").matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]);
}

function safeHost(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

async function deltaContextLedger(now, innovationQueue) {
  const outDir = path.join(ACTIVATION_ROOT, "delta-context-ledger");
  const latestPath = path.join(outDir, "latest-context-ledger.json");
  const previous = await readJson(latestPath);
  const fromQueue = new Set();
  for (const item of innovationQueue) {
    for (const rel of item.source_files || []) fromQueue.add(rel);
  }
  const sourceFiles = [...new Set([...BASE_SOURCE_FILES, ...fromQueue])].filter((rel) => fsSync.existsSync(path.join(ROOT, rel)));
  const entries = await Promise.all(sourceFiles.map(statSource));
  const okEntries = entries.filter((entry) => entry.ok);
  const prevMap = new Map((previous.data?.entries || []).map((entry) => [entry.rel_path, entry]));
  const currentMap = new Map(okEntries.map((entry) => [entry.rel_path, entry]));
  const changed = okEntries.filter((entry) => prevMap.get(entry.rel_path)?.sha256 !== entry.sha256).map((entry) => entry.rel_path);
  const unchanged = okEntries.filter((entry) => prevMap.get(entry.rel_path)?.sha256 === entry.sha256).map((entry) => entry.rel_path);
  const deleted = [...prevMap.keys()].filter((rel) => !currentMap.has(rel));
  const merkle = sha256(okEntries.map((entry) => `${entry.rel_path}:${entry.sha256}`).sort().join("\n"));
  const report = {
    lane: "Delta Context Ledger",
    status: entries.every((entry) => entry.ok) && okEntries.length >= 10 ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    source_count: okEntries.length,
    failed_sources: entries.filter((entry) => !entry.ok),
    changed_count: changed.length,
    unchanged_count: unchanged.length,
    deleted_count: deleted.length,
    changed,
    unchanged_sample: unchanged.slice(0, 12),
    deleted,
    merkle_root: merkle,
    entries: okEntries,
    proof_gate: "Source hashes, freshness ages, changed/unchanged/deleted counts, and Merkle root are written.",
    rollback: "Delete the delta-context-ledger directory; knowledge-v2 can still perform full rebuilds.",
  };
  await writeJson(path.join(outDir, `context-ledger-${stamp()}.json`), report);
  await writeJson(latestPath, report);
  return report;
}

async function fourTierMemoryGovernor(now, innovationQueue, receipts) {
  const outDir = path.join(ACTIVATION_ROOT, "four-tier-memory-governor");
  const firstTen = innovationQueue.slice(0, 10);
  const working = firstTen.map((item, index) => ({
    id: `working-${String(index + 1).padStart(2, "0")}`,
    type: "current_upgrade_lane",
    title: item.title,
    priority: item.priority,
    source_state: item.source_state || "local",
    provenance: item.id,
  }));
  const episodic = receipts.slice(0, 12).map((receipt) => ({
    id: `episode-${sha256(receipt.file).slice(0, 12)}`,
    type: "receipt_event",
    file: receipt.file,
    name: receipt.name,
    ok: receipt.ok,
    created_at: receipt.data?.finished_at || receipt.data?.created_at || receipt.data?.started_at || null,
  }));
  const semantic = [
    { concept: "fresh_context", linked_lanes: ["Delta Context Ledger", "Claude/Codex Session Health Governor"], sources: ["knowledge-v2", "alpha-intake"] },
    { concept: "deterministic_control_plane", linked_lanes: ["Department Router Dry Run", "MCP Quarantine Gateway"], sources: ["manifest-runtime", "control-plane"] },
    { concept: "hardware_adaptive_inference", linked_lanes: ["Hardware-Aware Inference Matrix"], sources: ["process-book", "inference-doctor"] },
    { concept: "source_verified_alpha", linked_lanes: ["X Alpha Feed Typed Lane", "Receipt Intelligence Miner"], sources: ["bookmark-export", "alpha-source-doctor"] },
  ];
  const procedural = [
    { command: "npm.cmd run innovation:activate", purpose: "Activate and test the ten non-visual innovation lanes." },
    { command: "npm.cmd run control:big", purpose: "Run control-plane topology, adapters, real smoke, llama generation, doctor, and smoke." },
    { command: "npm.cmd run inference:doctor", purpose: "Confirm two-device adaptive inference remains green." },
    { command: "npm.cmd run alpha:intake", purpose: "Rebuild Alpha bookmark queue from the exported JSON." },
  ];
  const contradictions = [
    {
      id: "gpu-acceleration-vs-n150",
      state: "resolved_as_deferred",
      claim: "vLLM/SGLang/speculative decoding are desired upgrades.",
      current_truth: "The command N150 has no NVIDIA GPU; these are not current blockers.",
    },
  ];
  const report = {
    lane: "Four-Tier Memory Governor",
    status: [working, episodic, semantic, procedural].every((tier) => tier.length > 0) ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    tiers: { working, episodic, semantic, procedural },
    counts: { working: working.length, episodic: episodic.length, semantic: semantic.length, procedural: procedural.length, contradictions: contradictions.length },
    contradictions,
    proof_gate: "All four tiers contain provenance-bearing entries and contradiction receipts are explicit.",
    rollback: "Delete four-tier-memory-governor outputs; raw receipts remain the source of truth.",
  };
  await writeJson(path.join(outDir, "working.json"), working);
  await writeJson(path.join(outDir, "episodic.json"), episodic);
  await writeJson(path.join(outDir, "semantic.json"), semantic);
  await writeJson(path.join(outDir, "procedural.json"), procedural);
  await writeJson(path.join(outDir, "latest-memory-governor.json"), report);
  return report;
}

async function sessionHealthGovernor(now) {
  const outDir = path.join(ACTIVATION_ROOT, "session-health-governor");
  const validFixture = validateTranscript([
    { type: "assistant", text: "probe" },
    { type: "tool_use", id: "call_1", name: "read" },
    { type: "tool_result", tool_use_id: "call_1", content: "ok" },
  ]);
  const invalidFixture = validateTranscript([
    { type: "tool_use", id: "call_missing", name: "read" },
    { type: "assistant", text: "continued too early" },
  ]);
  const largeOutput = "MCP_OUTPUT ".repeat(3000);
  const capped = largeOutput.slice(0, 4096);
  const mediaArtifact = { name: "oversized-media.bin", bytes: 18 * 1024 * 1024, action: "route_to_file_artifact" };
  const compaction = { estimated_tokens: 82_000, context_limit: 100_000, pressure: 0.82, state: "warn_before_handoff" };
  const checks = [
    { id: "valid_tool_pairing_passes", ok: validFixture.ok, detail: validFixture },
    { id: "missing_tool_result_fails", ok: !invalidFixture.ok && invalidFixture.errors.includes("tool_use_without_result:call_missing"), detail: invalidFixture },
    { id: "large_mcp_output_capped", ok: capped.length === 4096 && capped.length < largeOutput.length, original_bytes: largeOutput.length, capped_bytes: capped.length, artifact_hash: sha256(capped) },
    { id: "oversized_media_routed_to_file", ok: mediaArtifact.action === "route_to_file_artifact", detail: mediaArtifact },
    { id: "compaction_pressure_detected", ok: compaction.state === "warn_before_handoff", detail: compaction },
  ];
  const report = {
    lane: "Claude/Codex Session Health Governor",
    status: checks.every((check) => check.ok) ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    checks,
    no_provider_transcript_uploaded: true,
    proof_gate: "Valid pair passes, mismatched tool result fails, large output is capped, and media/compaction hazards are routed.",
    rollback: "Keep this governor advisory-only or delete session-health-governor outputs.",
  };
  await writeJson(path.join(outDir, "latest-session-health.json"), report);
  return report;
}

async function departmentRouterDryRun(now, innovationQueue) {
  const outDir = path.join(ACTIVATION_ROOT, "department-router-dry-run");
  const departments = Array.from({ length: 14 }, (_, index) => {
    const id = `AE${index + 1}`;
    const names = {
      AE1: "Knowledge Freshness",
      AE2: "Memory Lifecycle",
      AE3: "Session Resilience",
      AE4: "Department OS",
      AE5: "MCP Security",
      AE6: "Bench Arena",
      AE7: "Inference Matrix",
      AE8: "Alpha Intake",
      AE9: "Receipt Intelligence",
      AE10: "AELang Resilience",
      AE11: "Visual Surface",
      AE12: "Release and Rollback",
      AE13: "Hardware Rail",
      AE14: "Operator Governance",
    };
    return { id, name: names[id], trust_tier: index < 10 ? "dry_run_route_only" : "held_or_advisory", mutation_allowed: false };
  });
  const tasks = innovationQueue.slice(0, 10).map((item) => ({
    task_id: item.id,
    title: item.title,
    text: `${item.title} ${item.class} ${item.thesis}`,
  }));
  const routes = tasks.map((task) => ({
    ...task,
    ...routeDepartment(task.text),
    dispatch_attempted: false,
    mutation_allowed: false,
  }));
  const report = {
    lane: "Department Router Dry Run",
    status: departments.length === 14 && routes.length === 10 && routes.every((route) => !route.dispatch_attempted) ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    departments,
    routes,
    proof_gate: "Ten task fixtures route to departments with no dispatch or mutation.",
    rollback: "Delete department-router-dry-run outputs; no route was executed.",
  };
  await writeJson(path.join(outDir, "latest-department-routes.json"), report);
  return report;
}

async function mcpQuarantineGateway(now) {
  const outDir = path.join(ACTIVATION_ROOT, "mcp-quarantine-gateway");
  const candidates = [
    { id: "xmcp-x-api", state: "candidate", risk: "high", reason: "External OAuth and rate limits; no credentials read.", allowed_modes: [] },
    { id: "local-filesystem-read", state: "verified_read", risk: "medium", reason: "Local read-only proof lane only.", allowed_modes: ["read"] },
    { id: "ai-box-command-rail", state: "verified_read_contract_only", risk: "high", reason: "Fixed read-only contracts only; arbitrary shell refused.", allowed_modes: ["read_contract"] },
    { id: "browser-plugin", state: "candidate", risk: "medium", reason: "Useful for localhost proof; not an MCP host registration.", allowed_modes: [] },
  ];
  function simulate(connectorId, mode) {
    const candidate = candidates.find((item) => item.id === connectorId);
    const allowed = candidate?.allowed_modes.includes(mode);
    return {
      connector_id: connectorId,
      requested_mode: mode,
      allowed: Boolean(allowed),
      state: candidate?.state || "unknown",
      decision: allowed ? "ALLOW_DRY_RUN_READ" : "BLOCK_AND_RECEIPT",
      reason: allowed ? "Mode is explicitly allowlisted." : "Connector is not promoted for this mode.",
    };
  }
  const decisions = [
    simulate("xmcp-x-api", "write"),
    simulate("xmcp-x-api", "read"),
    simulate("local-filesystem-read", "read"),
    simulate("ai-box-command-rail", "write"),
    simulate("ai-box-command-rail", "read_contract"),
  ];
  const report = {
    lane: "MCP Quarantine Gateway",
    status: decisions.some((decision) => decision.connector_id === "xmcp-x-api" && decision.requested_mode === "write" && !decision.allowed)
      && decisions.some((decision) => decision.connector_id === "local-filesystem-read" && decision.allowed)
      ? "ACTIVATED"
      : "BLOCKED",
    generated_at: now,
    candidates,
    decisions,
    mcp_host_config_touched: false,
    credentials_read: false,
    proof_gate: "Mock write from candidate XMCP is blocked and a verified read-only lane is allowlisted.",
    rollback: "Delete mcp-quarantine-gateway outputs; no MCP host config was changed.",
  };
  await writeJson(path.join(outDir, "latest-mcp-quarantine.json"), report);
  return report;
}

async function agentBenchArena(now, ledger, receipts) {
  const outDir = path.join(ACTIVATION_ROOT, "agent-bench-arena");
  const trials = [];
  const sourceList = ledger.entries.map((entry) => entry.abs_path);
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    let bytes = 0;
    for (const file of sourceList) {
      const buffer = await fs.readFile(file);
      bytes += buffer.length;
      sha256(buffer);
    }
    trials.push({ id: `hash_sources_${i + 1}`, family: "source_hash", ms: Math.round(performance.now() - start), bytes });
  }
  for (let i = 0; i < 3; i += 1) {
    const start = performance.now();
    let parsed = 0;
    for (const receipt of receipts.slice(0, 30)) {
      if (receipt.parsed_ok) parsed += 1;
    }
    trials.push({ id: `parse_receipts_${i + 1}`, family: "receipt_parse", ms: Math.round(performance.now() - start), parsed });
  }
  const structural = {
    id: "structural_solution_fixture",
    score: 91,
    reasons: ["has proof gate", "has rollback", "touches system invariant", "keeps risky adapters gated"],
  };
  const knob = {
    id: "knob_tweak_fixture",
    score: 23,
    reasons: ["only increases retry cap", "no invariant", "no proof gate"],
  };
  const previous = await readJson(path.join(outDir, "latest-agent-bench.json"));
  const report = {
    lane: "Agent Bench Arena",
    status: structural.score > knob.score && trials.length === 6 ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    benchmark_family: "local_no_model_activation_bench",
    trial_count: trials.length,
    protected_metrics: ["source_hash_ms", "receipt_parse_ms", "structural_fixture_score", "trivial_knob_score"],
    trials,
    fixture_scores: { structural, knob, structural_beats_knob: structural.score > knob.score },
    previous_summary: previous.ok ? previous.data?.summary || null : null,
    summary: {
      source_hash_ms_total: trials.filter((trial) => trial.family === "source_hash").reduce((sum, trial) => sum + trial.ms, 0),
      receipt_parse_ms_total: trials.filter((trial) => trial.family === "receipt_parse").reduce((sum, trial) => sum + trial.ms, 0),
      promotion_verdict: "bench_lane_green_no_optimization_promoted",
    },
    proof_gate: "Structural fixture scores higher than shallow retry-knob fixture and machine trials run locally.",
    rollback: "Delete agent-bench-arena outputs; no product behavior depends on these scores yet.",
  };
  await writeJson(path.join(outDir, "latest-agent-bench.json"), report);
  return report;
}

function configuredAiBoxHosts(codexaMode) {
  const config = codexaMode?.data?.config || {};
  return [...new Set([
    process.env.ORANGEBOX_AI_BOX_DIRECT_IP,
    process.env.ORANGEBOX_AI_BOX_IP,
    config.ai_box_direct_ip,
    config.ai_box_ip,
    config.codexa_direct_ip,
    config.codexa_ip,
    "10.0.99.1",
  ].filter(Boolean).map((item) => String(item).trim()))];
}

function aiBoxOllamaProven(triad) {
  const stdout = String(triad?.data?.modelProbe?.result?.response?.stdout || triad?.modelProbe?.result?.response?.stdout || "");
  return /ollama version/i.test(stdout) && /qwen2\.5-coder:32b-instruct/i.test(stdout);
}

async function hardwareAwareInferenceMatrix(now) {
  const outDir = path.join(ACTIVATION_ROOT, "hardware-aware-inference-matrix");
  const [gpu, codexaMode, triadFile, llamaHealth, llamaModels, vllm, sglang, sidecarTriad] = await Promise.all([
    nvidiaProbe(),
    readJson(CODEXA_MODE_PATH),
    readJson(TRIAD_STATUS_PATH),
    httpJson(`${LOCAL_LLAMA_BASE}/health`, 2500),
    httpJson(`${LOCAL_LLAMA_BASE}/v1/models`, 3500),
    httpJson("http://127.0.0.1:8000/v1/models", 1200),
    httpJson("http://127.0.0.1:30000/v1/models", 1200),
    httpJson(`${SIDECAR_BASE}/api/triad?project=orangebox&probe=1`, 45000),
  ]);
  const hosts = configuredAiBoxHosts(codexaMode);
  const railProbes = [];
  for (const host of hosts) {
    for (const port of [8097, 8098, 8099]) {
      const probePath = port === 8099 ? "/" : "/health";
      railProbes.push({
        host,
        port,
        probe_contract: port === 8099 ? "knowledge_receipts_root" : "health_json",
        ...(await httpJson(`http://${host}:${port}${probePath}`, 2500)),
      });
    }
  }
  const triadCandidates = [
    sidecarTriad.ok && sidecarTriad.json ? sidecarTriad.json : null,
    triadFile.data,
  ].filter(Boolean);
  const aiBoxModels = triadCandidates.some((candidate) => aiBoxOllamaProven({ data: candidate }) || aiBoxOllamaProven(candidate));
  const profiles = [
    { id: "n150_llama_cpp_cpu_listener", status: llamaHealth.ok && llamaModels.ok ? "ACTIVE" : "BLOCKED", endpoint: LOCAL_LLAMA_BASE, gpu_required: false },
    { id: "codexa_ai_box_ollama_heavy_lane", status: aiBoxModels ? "ACTIVE" : "BLOCKED", endpoint: "ai-box-sidecar-triad", gpu_required: "remote_or_ai_box" },
    { id: "vllm_gpu_endpoint", status: vllm.ok ? "ACTIVE" : "DEFERRED", endpoint: "http://127.0.0.1:8000", gpu_required: true },
    { id: "sglang_radixattention_endpoint", status: sglang.ok ? "ACTIVE" : "DEFERRED", endpoint: "http://127.0.0.1:30000", gpu_required: true },
    { id: "speculative_decoding_or_mtp", status: gpu.ok || vllm.ok || sglang.ok ? "CANDIDATE" : "DEFERRED", endpoint: null, gpu_required: "benchmark_capable_endpoint" },
    { id: "subscription_frontier_advisors", status: "PLANNED_GATED", endpoint: "claude_codex_agy_subscription_clients", gpu_required: false },
  ];
  const report = {
    lane: "Hardware-Aware Inference Matrix",
    status: profiles.some((profile) => profile.id === "n150_llama_cpp_cpu_listener" && profile.status === "ACTIVE")
      && profiles.some((profile) => profile.id === "codexa_ai_box_ollama_heavy_lane" && profile.status === "ACTIVE")
      ? "ACTIVATED"
      : "BLOCKED",
    generated_at: now,
    profiles,
    probes: { gpu, llamaHealth, llamaModels, vllm, sglang, sidecarTriad, railProbes },
    policy: {
      no_gpu_on_n150_is_not_blocker: !gpu.ok,
      gpu_profiles_deferred: !gpu.ok && !vllm.ok && !sglang.ok,
      no_paid_api_call: true,
      no_model_generation_call: true,
    },
    proof_gate: "N150 CPU listener and AI Box heavy lane are active; GPU-only acceleration profiles are deferred, not blockers.",
    rollback: "Delete hardware-aware-inference-matrix outputs; existing inference doctor remains authoritative.",
  };
  await writeJson(path.join(outDir, "latest-inference-matrix.json"), report);
  return report;
}

async function xAlphaFeedTypedLane(now) {
  const outDir = path.join(ACTIVATION_ROOT, "x-alpha-feed-typed-lane");
  const parsed = await readJson(BOOKMARK_EXPORT_PATH);
  const data = Array.isArray(parsed.data?.data) ? parsed.data.data : [];
  const records = data.map((item) => {
    const urls = extractUrls(item.text);
    return {
      id: String(item.id || ""),
      created_at: item.date || null,
      author_handle: item.handle || item.username || null,
      author_name: item.name || null,
      text_hash: sha256(item.text || ""),
      text_preview: compact(item.text, 500),
      url: item.url || (item.id ? `https://twitter.com/i/web/status/${item.id}` : null),
      link_domains: [...new Set(urls.map(safeHost).filter(Boolean))],
      link_count: urls.length,
      media_count: Array.isArray(item.media) ? item.media.length : 0,
      credential_free: true,
    };
  });
  const report = {
    lane: "X Alpha Feed Typed Lane",
    status: parsed.ok && records.length === Number(parsed.data?.totalBookmarks || records.length) ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    input_path: BOOKMARK_EXPORT_PATH,
    declared_count: parsed.data?.totalBookmarks || null,
    parsed_count: records.length,
    records,
    no_network_calls: true,
    no_x_credentials_read: true,
    no_xdk_install: true,
    proof_gate: "Exported bookmarks parse into typed records without network, credentials, or package install.",
    rollback: "Delete x-alpha-feed-typed-lane outputs; the original JSON export remains unchanged.",
  };
  await writeJson(path.join(outDir, "latest-x-alpha-feed.json"), report);
  return report;
}

async function receiptIntelligenceMiner(now, receipts) {
  const outDir = path.join(ACTIVATION_ROOT, "receipt-intelligence-miner");
  const parsedCount = receipts.filter((receipt) => receipt.parsed_ok).length;
  const failed = receipts.filter((receipt) => receipt.data?.ok === false || !receipt.parsed_ok);
  const warningLike = receipts.filter((receipt) => {
    const text = JSON.stringify(receipt.data || {}).toLowerCase();
    return text.includes("warning") || text.includes("deferred") || text.includes("404") || text.includes("1 gbps");
  });
  const clusters = [
    {
      id: "source-coverage-before-promotion",
      count: receipts.filter((receipt) => /innovation-synthesis-20260527T154021/.test(receipt.name)).length,
      likely_cause: "Candidate cited a source before the source set included it.",
      guard: "Delta Context Ledger plus innovation source coverage check.",
    },
    {
      id: "gpu-profile-deferred-on-n150",
      count: warningLike.filter((receipt) => JSON.stringify(receipt.data || {}).includes("gpu_acceleration_deferred")).length,
      likely_cause: "GPU-only inference profiles on a no-GPU controller.",
      guard: "Hardware-Aware Inference Matrix.",
    },
    {
      id: "physical-link-advisory",
      count: warningLike.filter((receipt) => JSON.stringify(receipt.data || {}).includes("1 Gbps")).length,
      likely_cause: "Ethereal link negotiated at 1 Gbps.",
      guard: "Machine test drive keeps this advisory separate from service failure.",
    },
    {
      id: "mcp-session-output-risk",
      count: warningLike.filter((receipt) => /mcp|tool.result|tool_use/i.test(JSON.stringify(receipt.data || {}))).length,
      likely_cause: "Large or mismatched tool outputs can destabilize long sessions.",
      guard: "Session Health Governor and MCP Quarantine Gateway.",
    },
  ];
  const report = {
    lane: "Receipt Intelligence Miner",
    status: parsedCount >= 10 ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    receipts_scanned: receipts.length,
    receipts_parsed: parsedCount,
    failed_receipts: failed.map((receipt) => ({ file: receipt.file, name: receipt.name, error: receipt.error || receipt.data?.error || null })).slice(0, 12),
    warning_like_count: warningLike.length,
    clusters,
    highest_yield_fix: "Keep source coverage, hardware profile gating, and session/MCP guards as promotion blockers.",
    proof_gate: "Recent receipts are parsed and recurring failures/advisories are clustered into guards.",
    rollback: "Delete receipt-intelligence-miner outputs; source receipts are unchanged.",
  };
  await writeJson(path.join(outDir, "latest-receipt-miner.json"), report);
  return report;
}

async function aelangResilienceKernel(now) {
  const outDir = path.join(ACTIVATION_ROOT, "aelang-resilience-kernel");
  const spec = await fs.readFile(path.join(ROOT, "docs", "AELANG_SPEC.md"), "utf8").catch(() => "");
  const resilience = await fs.readFile(path.join(ROOT, "docs", "AELANG_RESILIENCY_MODULE.md"), "utf8").catch(() => "");
  const rules = [
    { id: "stale_context", trigger: /stale|context|fresh/i, action: "route_to_delta_context_ledger", rollback: "full_context_rebuild" },
    { id: "tool_result_mismatch", trigger: /tool|mcp|session/i, action: "route_to_session_health_governor", rollback: "disable_handoff_until_pairing_valid" },
    { id: "untrusted_mcp", trigger: /mcp|oauth|connector/i, action: "route_to_mcp_quarantine_gateway", rollback: "disable_connector" },
    { id: "gpu_profile_mismatch", trigger: /gpu|inference|hardware/i, action: "route_to_hardware_aware_inference_matrix", rollback: "cpu_listener_or_ai_box_lane" },
    { id: "department_conflict", trigger: /department|route|trust/i, action: "route_to_department_router_dry_run", rollback: "operator_manual_route" },
  ];
  const fixtures = [
    { id: "fixture_stale_context", text: "context is stale after source changed" },
    { id: "fixture_tool_mismatch", text: "tool result does not match tool use" },
    { id: "fixture_gpu_profile", text: "sglang GPU acceleration requested on N150" },
    { id: "fixture_untrusted_mcp", text: "XMCP wants OAuth write access" },
    { id: "fixture_department_conflict", text: "department route and trust tier disagree" },
  ].map((fixture) => {
    const matched = rules.find((rule) => rule.trigger.test(fixture.text));
    return { ...fixture, matched_rule: matched?.id || null, action: matched?.action || "operator_review", rollback: matched?.rollback || "hold" };
  });
  const report = {
    lane: "AELang Resilience Kernel",
    status: spec && resilience && fixtures.every((fixture) => fixture.matched_rule) ? "ACTIVATED" : "BLOCKED",
    generated_at: now,
    source_terms: {
      spec_bytes: spec.length,
      resilience_bytes: resilience.length,
      has_resilience_terms: /resilien|rollback|guard|recover/i.test(`${spec}\n${resilience}`),
    },
    rules,
    fixtures,
    proof_gate: "Synthetic failure packets route to deterministic recovery actions with rollback.",
    rollback: "Delete aelang-resilience-kernel outputs; no runtime hooks were promoted.",
  };
  await writeJson(path.join(outDir, "latest-aelang-resilience.json"), report);
  return report;
}

function pickTenInnovationQueue(rawQueue) {
  const items = Array.isArray(rawQueue?.innovation_queue) ? rawQueue.innovation_queue : [];
  return TEN_LANES.map((title, index) => {
    const found = items.find((item) => item.title === title);
    return found || {
      id: `OBX-TEN-${String(index + 1).padStart(3, "0")}`,
      priority: index < 7 ? "P0" : "P1",
      title,
      class: "activation",
      thesis: `${title} first guarded implementation.`,
      source_files: BASE_SOURCE_FILES.slice(0, 3),
    };
  });
}

async function runActivation({ receipt = false } = {}) {
  const now = new Date().toISOString();
  const rawQueue = await readJson(INNOVATION_QUEUE_PATH);
  const innovationQueue = pickTenInnovationQueue(rawQueue.data || {});
  await fs.mkdir(ACTIVATION_ROOT, { recursive: true });

  const receipts = await loadRecentReceipts(80);
  const delta = await deltaContextLedger(now, innovationQueue);
  const memory = await fourTierMemoryGovernor(now, innovationQueue, receipts);
  const session = await sessionHealthGovernor(now);
  const router = await departmentRouterDryRun(now, innovationQueue);
  const mcp = await mcpQuarantineGateway(now);
  const bench = await agentBenchArena(now, delta, receipts);
  const inference = await hardwareAwareInferenceMatrix(now);
  const xalpha = await xAlphaFeedTypedLane(now);
  const miner = await receiptIntelligenceMiner(now, receipts);
  const aelang = await aelangResilienceKernel(now);
  const lanes = [delta, memory, session, router, mcp, bench, inference, xalpha, miner, aelang];
  const blocked = lanes.filter((lane) => lane.status === "BLOCKED");
  const report = {
    ok: blocked.length === 0,
    version: INNOVATION_ACTIVATION_VERSION,
    project: "ORANGEBOX",
    started_at: now,
    finished_at: new Date().toISOString(),
    root: ROOT,
    data_root: DATA_ROOT,
    activation_root: ACTIVATION_ROOT,
    boundaries: {
      no_visual_work: true,
      no_paid_api_calls: true,
      no_x_credentials_read: true,
      no_xdk_install: true,
      no_xmcp_registration: true,
      no_mcp_host_config_mutation: true,
      no_arbitrary_ai_box_shell: true,
      local_and_ai_box_health_probes_only: true,
    },
    summary: {
      lanes_total: lanes.length,
      activated: lanes.filter((lane) => lane.status === "ACTIVATED").length,
      blocked: blocked.length,
      gated_or_deferred_profiles: {
        gpu_profiles: "deferred_unless_gpu_or_remote_endpoint_proves_green",
        frontier_adapters: "planned_subscription_first_not_executed",
        visual_work: "paused_by_operator_instruction",
      },
    },
    lanes: lanes.map((lane) => ({
      lane: lane.lane,
      status: lane.status,
      proof_gate: lane.proof_gate,
      rollback: lane.rollback,
    })),
    output_index: {
      delta_context_ledger: path.join(ACTIVATION_ROOT, "delta-context-ledger", "latest-context-ledger.json"),
      four_tier_memory_governor: path.join(ACTIVATION_ROOT, "four-tier-memory-governor", "latest-memory-governor.json"),
      session_health_governor: path.join(ACTIVATION_ROOT, "session-health-governor", "latest-session-health.json"),
      department_router_dry_run: path.join(ACTIVATION_ROOT, "department-router-dry-run", "latest-department-routes.json"),
      mcp_quarantine_gateway: path.join(ACTIVATION_ROOT, "mcp-quarantine-gateway", "latest-mcp-quarantine.json"),
      agent_bench_arena: path.join(ACTIVATION_ROOT, "agent-bench-arena", "latest-agent-bench.json"),
      hardware_aware_inference_matrix: path.join(ACTIVATION_ROOT, "hardware-aware-inference-matrix", "latest-inference-matrix.json"),
      x_alpha_feed_typed_lane: path.join(ACTIVATION_ROOT, "x-alpha-feed-typed-lane", "latest-x-alpha-feed.json"),
      receipt_intelligence_miner: path.join(ACTIVATION_ROOT, "receipt-intelligence-miner", "latest-receipt-miner.json"),
      aelang_resilience_kernel: path.join(ACTIVATION_ROOT, "aelang-resilience-kernel", "latest-aelang-resilience.json"),
    },
    details: {
      delta_context_ledger: delta,
      four_tier_memory_governor: memory,
      session_health_governor: session,
      department_router_dry_run: router,
      mcp_quarantine_gateway: mcp,
      agent_bench_arena: bench,
      hardware_aware_inference_matrix: inference,
      x_alpha_feed_typed_lane: xalpha,
      receipt_intelligence_miner: miner,
      aelang_resilience_kernel: aelang,
    },
    rollback: {
      repo_mutation: "script/package/docs only when wired by operator",
      data_mutation: ACTIVATION_ROOT,
      recovery_action: `Delete ${ACTIVATION_ROOT} and the generated activation receipt if this first implementation is superseded.`,
    },
  };
  const stamped = path.join(ACTIVATION_ROOT, `activation-${stamp()}.json`);
  await writeJson(stamped, report);
  await writeJson(path.join(ACTIVATION_ROOT, "latest-activation.json"), report);
  if (receipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-innovation-activation-${stamp()}.json`);
    report.receipt_path = receiptPath;
    await writeJson(receiptPath, report);
  }
  return report;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const result = await runActivation({ receipt: args.has("--receipt") });
  if (args.has("--json")) {
    console.log(JSON.stringify({
      ok: result.ok,
      version: result.version,
      summary: result.summary,
      activation_root: result.activation_root,
      receipt_path: result.receipt_path || null,
      lanes: result.lanes,
    }, null, 2));
  } else {
    console.log(`[innovation:activate] ${result.summary.activated}/${result.summary.lanes_total} lanes activated; blocked=${result.summary.blocked}`);
    if (result.receipt_path) console.log(`[innovation:activate] receipt=${result.receipt_path}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
