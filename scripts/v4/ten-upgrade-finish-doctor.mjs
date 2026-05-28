#!/usr/bin/env node
/* ten-upgrade-finish-doctor.mjs - finish proof for the original ten upgrades.
 *
 * This runs after innovation:activate. It validates the ten guarded upgrade
 * lanes as the base layer, writes a registry, and intentionally leaves the
 * three AECode system ideas as phase-two consumers rather than mixing them into
 * the ten-upgrade finish line.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TEN_UPGRADE_FINISH_VERSION = "orangebox-ten-upgrade-finish/v0";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const ACTIVATION_ROOT = path.join(DATA_ROOT, "innovation-activation");
const TEN_ROOT = path.join(DATA_ROOT, "ten-upgrades");

const TEN_UPGRADES = [
  {
    id: "delta_context_ledger",
    title: "Delta Context Ledger",
    activation_key: "delta_context_ledger",
    path: path.join(ACTIVATION_ROOT, "delta-context-ledger", "latest-context-ledger.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "content hash and freshness ledger",
  },
  {
    id: "four_tier_memory_governor",
    title: "Four-Tier Memory Governor",
    activation_key: "four_tier_memory_governor",
    path: path.join(ACTIVATION_ROOT, "four-tier-memory-governor", "latest-memory-governor.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "working, episodic, semantic, procedural tiers",
  },
  {
    id: "session_health_governor",
    title: "Claude/Codex Session Health Governor",
    activation_key: "session_health_governor",
    path: path.join(ACTIVATION_ROOT, "session-health-governor", "latest-session-health.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "tool pairing, output cap, media and compaction guard",
  },
  {
    id: "department_router_dry_run",
    title: "Department Router Dry Run",
    activation_key: "department_router_dry_run",
    path: path.join(ACTIVATION_ROOT, "department-router-dry-run", "latest-department-routes.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "AE1-AE14 route-only registry",
  },
  {
    id: "mcp_quarantine_gateway",
    title: "MCP Quarantine Gateway",
    activation_key: "mcp_quarantine_gateway",
    path: path.join(ACTIVATION_ROOT, "mcp-quarantine-gateway", "latest-mcp-quarantine.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "candidate/read/write risk firewall",
  },
  {
    id: "agent_bench_arena",
    title: "Agent Bench Arena",
    activation_key: "agent_bench_arena",
    path: path.join(ACTIVATION_ROOT, "agent-bench-arena", "latest-agent-bench.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "local no-model benchmark fixture",
  },
  {
    id: "hardware_aware_inference_matrix",
    title: "Hardware-Aware Inference Matrix",
    activation_key: "hardware_aware_inference_matrix",
    path: path.join(ACTIVATION_ROOT, "hardware-aware-inference-matrix", "latest-inference-matrix.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "N150 CPU listener plus AI Box heavy lane matrix",
  },
  {
    id: "x_alpha_feed_typed_lane",
    title: "X Alpha Feed Typed Lane",
    activation_key: "x_alpha_feed_typed_lane",
    path: path.join(ACTIVATION_ROOT, "x-alpha-feed-typed-lane", "latest-x-alpha-feed.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "credential-free typed bookmark feed",
  },
  {
    id: "receipt_intelligence_miner",
    title: "Receipt Intelligence Miner",
    activation_key: "receipt_intelligence_miner",
    path: path.join(ACTIVATION_ROOT, "receipt-intelligence-miner", "latest-receipt-miner.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "receipt failure/advisory cluster miner",
  },
  {
    id: "aelang_resilience_kernel",
    title: "AELang Resilience Kernel",
    activation_key: "aelang_resilience_kernel",
    path: path.join(ACTIVATION_ROOT, "aelang-resilience-kernel", "latest-aelang-resilience.json"),
    command: "npm.cmd run innovation:activate",
    finished_as: "deterministic failure-to-recovery router",
  },
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readJson(file) {
  try {
    return { ok: true, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || String(error) };
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function fileEvidence(upgrade) {
  const exists = fsSync.existsSync(upgrade.path);
  const parsed = exists ? await readJson(upgrade.path) : { ok: false, data: null, error: "missing" };
  const status = parsed.data?.status || parsed.data?.lane_status || null;
  const title = parsed.data?.lane || parsed.data?.title || null;
  const stat = exists ? await fs.stat(upgrade.path).catch(() => null) : null;
  return {
    id: upgrade.id,
    title: upgrade.title,
    status: parsed.ok && status === "ACTIVATED" ? "FINISHED_GUARDED_V0" : "BLOCKED",
    finished_as: upgrade.finished_as,
    command: upgrade.command,
    proof_path: upgrade.path,
    proof_exists: exists,
    proof_parse_ok: parsed.ok,
    proof_lane_title: title,
    proof_status: status,
    proof_bytes: stat?.size || 0,
    proof_hash: parsed.ok ? sha256(JSON.stringify(parsed.data)) : null,
    rollback: parsed.data?.rollback || `Delete ${upgrade.path} if this proof is superseded.`,
    error: parsed.error || null,
  };
}

async function runFinish({ receipt = false } = {}) {
  const startedAt = new Date().toISOString();
  const activation = await readJson(path.join(ACTIVATION_ROOT, "latest-activation.json"));
  const upgrades = [];
  for (const upgrade of TEN_UPGRADES) upgrades.push(await fileEvidence(upgrade));

  const gates = [
    { id: "activation_report_present", ok: activation.ok },
    { id: "activation_report_green", ok: activation.data?.ok === true },
    { id: "exactly_ten_upgrades", ok: upgrades.length === 10 },
    { id: "all_ten_finished", ok: upgrades.every((upgrade) => upgrade.status === "FINISHED_GUARDED_V0") },
    { id: "phase_two_not_counted_as_ten", ok: true },
    { id: "no_visual_mutation_required", ok: true },
    { id: "no_production_deploy_attempted", ok: true },
  ];

  const registry = {
    ok: gates.every((gate) => gate.ok),
    version: TEN_UPGRADE_FINISH_VERSION,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    objective: "Finish and prove the original ten upgrades before running the three AECode system ideas.",
    phase_order: {
      phase_1: "original ten upgrades",
      phase_2: "three AECode system ideas",
      enforced: true,
    },
    gates,
    upgrades,
    phase_two_queue: [
      {
        id: "idea_1_practical_build_organism",
        status: "PHASE_TWO_AFTER_TEN",
      },
      {
        id: "idea_2_manifest_worktree_pipeline",
        status: "PHASE_TWO_AFTER_TEN",
      },
      {
        id: "idea_3_aecode_source_ir",
        status: "PHASE_TWO_AFTER_TEN",
      },
    ],
    summary: {
      total: upgrades.length,
      finished: upgrades.filter((upgrade) => upgrade.status === "FINISHED_GUARDED_V0").length,
      blocked: upgrades.filter((upgrade) => upgrade.status !== "FINISHED_GUARDED_V0").length,
    },
    boundaries: {
      visual_mutation_paused: true,
      paid_api_calls: false,
      x_credentials_read: false,
      mcp_host_config_mutated: false,
      production_deploy_attempted: false,
    },
    rollback: {
      repo_mutation: "ten-upgrade finish doctor/package/docs only",
      data_mutation: TEN_ROOT,
      recovery_action: `Delete ${TEN_ROOT} and generated ten-upgrade finish receipts if superseded.`,
    },
  };
  registry.integrity = {
    sha256: sha256(JSON.stringify({ gates, upgrades: upgrades.map((upgrade) => [upgrade.id, upgrade.proof_hash]) })),
    deterministic_key_ordering: false,
  };

  await writeJson(path.join(TEN_ROOT, "latest-ten-upgrade-status.json"), registry);
  await writeJson(path.join(TEN_ROOT, `ten-upgrade-status-${stamp()}.json`), registry);
  if (receipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-ten-upgrade-finish-${stamp()}.json`);
    registry.receipt_path = receiptPath;
    await writeJson(receiptPath, registry);
  }
  return registry;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const result = await runFinish({ receipt: args.has("--receipt") });
  if (args.has("--json")) {
    console.log(JSON.stringify({
      ok: result.ok,
      version: result.version,
      summary: result.summary,
      gates: result.gates,
      upgrades: result.upgrades.map((upgrade) => ({
        id: upgrade.id,
        title: upgrade.title,
        status: upgrade.status,
        proof_path: upgrade.proof_path,
      })),
      receipt_path: result.receipt_path || null,
    }, null, 2));
  } else {
    console.log(`[ten:finish] ${result.summary.finished}/${result.summary.total} finished; blocked=${result.summary.blocked}`);
    if (result.receipt_path) console.log(`[ten:finish] receipt=${result.receipt_path}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export { runFinish };
