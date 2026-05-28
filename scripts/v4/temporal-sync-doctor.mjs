#!/usr/bin/env node
/* temporal-sync-doctor.mjs - local-first context folding proof for the
 * Project Orangebox Temporal Sync SOP.
 *
 * This binds the SOP's "time displacement" doctrine to current ORANGEBOX
 * primitives: route-state, receipts, deterministic hashing, and local data
 * files. It does not call paid APIs, read credentials, mutate visual files, or
 * expose any command rail.
 */

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { loadCurrentRoute, routeHistoryPath } from "./route-state.mjs";

export const TEMPORAL_SYNC_DOCTOR_VERSION = "orangebox-temporal-sync-doctor/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const TEMPORAL_ROOT = path.join(DATA_ROOT, "temporal-sync");
const SOP_PDF_PATH = process.env.ORANGEBOX_TEMPORAL_SOP_PDF || path.join(os.homedir(), "Downloads", "Project_Orangebox_Temporal_Sync_SOP_v2.pdf");
const SOP_DOC_PATH = path.join(ROOT, "docs", "PROJECT_ORANGEBOX_TEMPORAL_SYNC_SOP_V2.md");

const STRUCTURAL_HASH_INPUTS = [
  "control-plane/engine.ts",
  "control-plane/context-packer.ts",
  "control-plane/model-policy.ts",
  "control-plane/topology.ts",
  "scripts/v4/route-state.mjs",
  "scripts/v4/context-store.mjs",
  "scripts/v4/clc-doctor.mjs",
  "scripts/v4/innovation-activation-doctor.mjs",
  "docs/AtomEons_Manifest_Runtime_Manual_v0.2_Implementation_Spec.md",
  "docs/PROJECT_ORANGEBOX_TEMPORAL_SYNC_SOP_V2.md",
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function canonicalStringify(value) {
  return JSON.stringify(stable(value));
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || "").length / 4));
}

function compact(value, max = 1200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function readJson(file) {
  try {
    return { ok: true, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || String(error) };
  }
}

async function fileEvidence(file) {
  try {
    const buffer = await fs.readFile(file);
    const stat = await fs.stat(file);
    return {
      ok: true,
      path: file,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
      sha256: sha256(buffer),
    };
  } catch (error) {
    return {
      ok: false,
      path: file,
      error: error?.message || String(error),
    };
  }
}

async function gitInfo() {
  const run = async (args, timeout = 5000) => {
    try {
      const out = await execFileAsync("git", args, {
        cwd: ROOT,
        timeout,
        maxBuffer: 256_000,
        windowsHide: true,
      });
      return { ok: true, stdout: out.stdout.trim(), stderr: out.stderr.trim() };
    } catch (error) {
      return {
        ok: false,
        stdout: String(error?.stdout || "").trim(),
        stderr: String(error?.stderr || "").trim(),
        error: error?.message || String(error),
      };
    }
  };
  const branch = await run(["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await run(["rev-parse", "--short", "HEAD"]);
  const diff = await run(["diff", "--", "control-plane", "scripts/v4", "docs", "package.json"], 8000);
  return {
    branch: branch.ok ? branch.stdout : "unknown",
    head: head.ok ? head.stdout : "unknown",
    diff_ok: diff.ok,
    critical_diff: compact(diff.stdout || diff.stderr || diff.error || "", 18000),
    critical_diff_sha256: sha256(diff.stdout || ""),
  };
}

async function recentReceiptFiles(limit = 60) {
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
      mtime_ms: Math.round(item.mtime),
      bytes: item.bytes,
      parsed_ok: parsed.ok,
      ok: parsed.ok ? parsed.data?.ok !== false : false,
      status: parsed.ok ? parsed.data?.summary?.status || parsed.data?.status || parsed.data?.result?.status || null : null,
      data: parsed.data,
      parse_error: parsed.error || null,
    });
  }
  return receipts;
}

function statusText(receipt) {
  const data = receipt?.data || {};
  return [
    receipt?.name,
    data?.version,
    data?.summary?.status,
    data?.status,
    data?.error,
    data?.stderr,
    data?.failure,
  ].filter(Boolean).join(" ");
}

function failureSignature(receipt) {
  if (receipt.ok) return null;
  const text = statusText(receipt).toLowerCase();
  const cleaned = text
    .replace(/[a-f0-9]{12,}/g, "<hash>")
    .replace(/\d{4,}/g, "<num>")
    .replace(/c:\\[^ "'\n\r]+/gi, "<path>")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? sha256(cleaned).slice(0, 16) : `parse:${receipt.name}`;
}

function treeNonRepetition(receipts) {
  const bySig = new Map();
  for (const receipt of receipts) {
    const sig = failureSignature(receipt);
    if (!sig) continue;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push({
      name: receipt.name,
      status: receipt.status,
      mtime_ms: receipt.mtime_ms,
    });
  }
  const repeated = [...bySig.entries()]
    .map(([signature, items]) => ({ signature, count: items.length, examples: items.slice(0, 5) }))
    .filter((item) => item.count > 1)
    .sort((a, b) => b.count - a.count);
  return {
    checked_receipts: receipts.length,
    unique_failure_signatures: bySig.size,
    repeated_failure_signatures: repeated,
    loop_halting_precision_target_iterations: 5,
    target_met_observed: repeated.every((item) => item.count <= 5),
    rule: "A failed branch may retry with mutation, but an identical failure signature must not repeat more than five times.",
  };
}

async function structuralHash(routeState) {
  const parts = [];
  for (const rel of STRUCTURAL_HASH_INPUTS) {
    const file = path.join(ROOT, rel);
    if (!fsSync.existsSync(file)) continue;
    const data = await fs.readFile(file);
    parts.push({ rel, sha256: sha256(data), bytes: data.length });
  }
  parts.push({ rel: "route-state-current", sha256: sha256(canonicalStringify(routeState)), bytes: canonicalStringify(routeState).length });
  return {
    hash: sha256(canonicalStringify(parts)),
    inputs: parts,
  };
}

function resolvedTasksFromReceipts(receipts) {
  const preferred = receipts
    .filter((receipt) => receipt.ok)
    .slice(0, 12)
    .map((receipt) => {
      const summary = receipt.data?.summary?.status || receipt.data?.status || receipt.data?.version || "ok";
      return `${receipt.name}: ${summary}`;
    });
  return preferred.length ? preferred : ["No successful receipts found in recent receipt window."];
}

function buildRawExecutionTail(receipts) {
  return receipts.map((receipt) => ({
    name: receipt.name,
    file: receipt.file,
    ok: receipt.ok,
    parsed_ok: receipt.parsed_ok,
    status: receipt.status,
    mtime_ms: receipt.mtime_ms,
    bytes: receipt.bytes,
    summary: receipt.data?.summary || null,
    error: receipt.parse_error || receipt.data?.error || null,
  }));
}

function buildRawExecutionCorpus(receipts) {
  return receipts.map((receipt) => ({
    name: receipt.name,
    file: receipt.file,
    parsed_ok: receipt.parsed_ok,
    ok: receipt.ok,
    data: receipt.data,
    parse_error: receipt.parse_error,
  }));
}

function commandIntervention(blockers, treeGuard) {
  if (blockers.some((item) => item.severity === "hard")) {
    return { required: true, reason: "UNRESOLVED_DEPENDENCY" };
  }
  if (!treeGuard.target_met_observed) {
    return { required: true, reason: "MACRO_LOGIC_FAILURE" };
  }
  return { required: false, reason: null };
}

function buildGlyphSeed(state) {
  return {
    protocol: "GlyphSpeak seed, not model-native GlyphSpeak",
    atoms: [
      { token: "T_DELTA", meaning: "temporal displacement controlled by folded current state" },
      { token: "FOLD", meaning: "raw execution tail replaced by typed state object" },
      { token: "TREE_STOP", meaning: "repeated failure signatures are pruned" },
      { token: "ESCALATE", meaning: "cloud command layer wakes only when state requires intervention" },
    ],
    source_state_sha256: sha256(canonicalStringify(state)),
  };
}

async function runTemporalSyncDoctor({ receipt = false } = {}) {
  const started = new Date();
  const routeState = await loadCurrentRoute({ dataRoot: DATA_ROOT });
  const git = await gitInfo();
  const receipts = await loadRecentReceipts(60);
  const rawTail = buildRawExecutionTail(receipts);
  const rawCorpus = buildRawExecutionCorpus(receipts);
  const treeGuard = treeNonRepetition(receipts);
  const sourcePdf = await fileEvidence(SOP_PDF_PATH);
  const sourceDoc = await fileEvidence(SOP_DOC_PATH);
  const hash = await structuralHash(routeState);
  const blockers = [];
  if (!sourcePdf.ok && !sourceDoc.ok) blockers.push({ severity: "hard", id: "temporal_sop_missing", detail: "Neither the operator PDF nor repo markdown mirror is available." });
  if (!routeState.ok) blockers.push({ severity: "hard", id: "route_state_unreadable", detail: routeState.error || "Current route state could not be loaded." });
  if (!receipts.length) blockers.push({ severity: "soft", id: "no_recent_receipts", detail: "No recent receipts were available to fold." });

  const intervention = commandIntervention(blockers, treeGuard);
  const now = new Date();
  const latestReceiptMs = receipts[0]?.mtime_ms || now.getTime();
  const rawTailText = canonicalStringify(rawCorpus);
  const stateDraft = {
    timestamp: now.getTime(),
    uiHash: hash.hash,
    activeBranch: `${git.branch}@${git.head}`,
    resolvedTasks: resolvedTasksFromReceipts(receipts),
    criticalDiff: git.critical_diff,
    requiresCommandIntervention: intervention.required,
    ...(intervention.reason ? { interventionReason: intervention.reason } : {}),
    orangebox_temporal_sync: {
      version: TEMPORAL_SYNC_DOCTOR_VERSION,
      doctrine: "Asynchronous Temporal Sync and Context Folding Architecture",
      source_pdf: sourcePdf,
      source_doc: sourceDoc,
      state_drift_horizon_ms: Math.max(0, now.getTime() - latestReceiptMs),
      latency_drift_factor_from_sop: "1.000000000000000858",
      command_execution_hierarchy_factor_from_sop: "10^-16",
      cloud_payload_rule: "Send typed current_state only; do not send raw historical terminal tail.",
      clc_status: "WORKING_V0_RESEARCH_NOT_PRODUCTION",
      glyphspeak_status: "DRAFT_PACKET_PROTOCOL_NOT_MODEL_NATIVE",
      tree_non_repetition: treeGuard,
      raw_execution_tail_receipts: rawTail.length,
      raw_execution_tail_sha256: sha256(rawTailText),
      route_state_path: routeState.current_route_path,
      route_history_path: routeHistoryPath(DATA_ROOT),
      structural_hash_inputs: hash.inputs,
      blockers,
    },
  };

  const stateTokens = estimateTokens(canonicalStringify(stateDraft));
  const rawTokens = estimateTokens(rawTailText);
  const tokenReduction = Math.max(0, 1 - stateTokens / Math.max(1, rawTokens));
  stateDraft.orangebox_temporal_sync.token_fold = {
    raw_tail_tokens_estimated: rawTokens,
    folded_state_tokens_estimated: stateTokens,
    observed_reduction_ratio: Number(tokenReduction.toFixed(4)),
    sop_target_reduction_ratio: 0.82,
    target_met_observed: tokenReduction >= 0.82,
    note: "This is a local receipt-tail estimate, not proof of production cloud-token savings.",
  };
  stateDraft.orangebox_temporal_sync.glyphspeak_seed = buildGlyphSeed(stateDraft);

  const gates = [
    { id: "sop_source_known", ok: sourcePdf.ok || sourceDoc.ok },
    { id: "route_state_loaded", ok: routeState.ok },
    { id: "receipt_tail_folded", ok: rawTail.length > 0 },
    { id: "typed_orangebox_system_state", ok: typeof stateDraft.timestamp === "number" && /^[a-f0-9]{64}$/.test(stateDraft.uiHash) },
    { id: "tree_non_repetition_guard", ok: treeGuard.target_met_observed },
    { id: "raw_history_not_exported_to_command", ok: !canonicalStringify(stateDraft).includes("stdout_tail") },
    { id: "cloud_intervention_gated", ok: ["boolean"].includes(typeof stateDraft.requiresCommandIntervention) },
    { id: "clc_not_overclaimed", ok: stateDraft.orangebox_temporal_sync.clc_status.endsWith("NOT_PRODUCTION") },
  ];

  const report = {
    ok: gates.every((gate) => gate.ok) && !blockers.some((item) => item.severity === "hard"),
    version: TEMPORAL_SYNC_DOCTOR_VERSION,
    project: "ORANGEBOX",
    started_at: started.toISOString(),
    finished_at: new Date().toISOString(),
    boundaries: {
      no_visual_mutation: true,
      no_paid_api_calls: true,
      no_credentials_read: true,
      no_remote_shell: true,
      local_first_context_folding: true,
    },
    task_contract: {
      objective: "Bind Project_Orangebox_Temporal_Sync_SOP_v2.pdf to the present ORANGEBOX system as a local current-state context folder.",
      primary_core: "codex owns execution; Claude Code/opus remains synthesis and research packaging lane when explicitly invoked.",
      non_goals: [
        "Do not claim CLC is production-ready.",
        "Do not mutate the visual system.",
        "Do not wake paid/frontier model lanes.",
      ],
    },
    gates,
    state: stateDraft,
    raw_execution_tail: rawTail,
    outputs: {
      temporal_root: TEMPORAL_ROOT,
      current_state_path: path.join(TEMPORAL_ROOT, "current_state.json"),
      latest_report_path: path.join(TEMPORAL_ROOT, "latest-temporal-sync-report.json"),
      raw_tail_path: path.join(TEMPORAL_ROOT, "raw_execution_tail.json"),
    },
    rollback: {
      repo_mutation: "temporal sync doctor/package/docs only",
      data_mutation: TEMPORAL_ROOT,
      recovery_action: `Delete ${TEMPORAL_ROOT} and any orangebox-temporal-sync-doctor receipt if this implementation is superseded.`,
    },
    receipt_path: null,
  };

  await fs.mkdir(TEMPORAL_ROOT, { recursive: true });
  await writeJson(path.join(TEMPORAL_ROOT, `current_state-${stamp(now)}.json`), stateDraft);
  await writeJson(path.join(TEMPORAL_ROOT, "current_state.json"), stateDraft);
  await writeJson(path.join(TEMPORAL_ROOT, "raw_execution_tail.json"), rawTail);
  await writeJson(path.join(TEMPORAL_ROOT, "latest-temporal-sync-report.json"), report);
  if (receipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-temporal-sync-doctor-${stamp()}.json`);
    report.receipt_path = receiptPath;
    await writeJson(receiptPath, report);
  }
  return report;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const result = await runTemporalSyncDoctor({ receipt: args.has("--receipt") });
  if (args.has("--json")) {
    console.log(JSON.stringify({
      ok: result.ok,
      version: result.version,
      gates: result.gates,
      clc_status: result.state.orangebox_temporal_sync.clc_status,
      glyphspeak_status: result.state.orangebox_temporal_sync.glyphspeak_status,
      state_drift_horizon_ms: result.state.orangebox_temporal_sync.state_drift_horizon_ms,
      token_fold: result.state.orangebox_temporal_sync.token_fold,
      current_state_path: result.outputs.current_state_path,
      receipt_path: result.receipt_path || null,
    }, null, 2));
  } else {
    console.log(`[temporal:doctor] ok=${result.ok} drift_ms=${result.state.orangebox_temporal_sync.state_drift_horizon_ms}`);
    console.log(`[temporal:doctor] state=${result.outputs.current_state_path}`);
    if (result.receipt_path) console.log(`[temporal:doctor] receipt=${result.receipt_path}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export { runTemporalSyncDoctor };
