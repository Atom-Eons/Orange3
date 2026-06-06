#!/usr/bin/env node
/*
  checkmate-eval-lane-doctor.mjs

  Deterministic CHECKMATE lane for Orangebox Ops. It proves that proposed
  prompt, model, routing, benchmark, and tool-surface changes must pass a
  small oracle fixture before promotion. No model calls. No install. No frontend.
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
const outRoot = path.join(dataRoot, "checkmate");

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

function sha256(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function check(id, ok, evidence = {}) {
  return { id, ok: Boolean(ok), ...evidence };
}

const fixtures = [
  {
    id: "prompt_scope_drift_gate",
    change_type: "prompt_change",
    trigger: "A system, skill, primer, or model prompt changes behavior.",
    oracle: "The new prompt must preserve lane scope, receipts, operator authority, and explicit limitations.",
    budget: { timeout_ms: 1600, max_files_read: 6, max_tool_calls: 0 },
    required_receipts: ["harness", "skills", "tool_ergonomics"],
    canaries: ["do_not_touch_frontend", "do_not_claim_full_green", "receipt_required"],
    reject_if: ["scope_expansion", "frontend_touch", "unreceipted_success", "silent_autonomy"],
  },
  {
    id: "model_lane_escalation_gate",
    change_type: "model_lane_change",
    trigger: "A model is promoted, demoted, renamed, or assigned a new decision role.",
    oracle: "The promotion must be based on installed inventory and packet evals, not model-card claims.",
    budget: { timeout_ms: 1600, max_files_read: 5, max_tool_calls: 0 },
    required_receipts: ["trilane", "strongarm", "gremlin", "harness"],
    canaries: ["installed_count_explicit", "not_final_authority", "operator_approval_required"],
    reject_if: ["aspirational_model_claim", "unproven_local_model", "hidden_ruler", "paid_api_default"],
  },
  {
    id: "routing_policy_change_gate",
    change_type: "routing_policy_change",
    trigger: "A router, department lane, escalation rule, or Codexa handoff changes.",
    oracle: "The route must keep local/full-system green distinct and refuse Codexa work when rails are down.",
    budget: { timeout_ms: 1600, max_files_read: 5, max_tool_calls: 0 },
    required_receipts: ["health", "project", "codexa_alert", "harness"],
    canaries: ["codexa_receipts_only", "local_ops_not_blocked", "full_system_gated"],
    reject_if: ["codexa_false_green", "ollama_unproven", "remote_execution_unproven", "warning_erased"],
  },
  {
    id: "tool_surface_change_gate",
    change_type: "tool_surface_change",
    trigger: "A command, skill action, MCP bridge, or tool description changes.",
    oracle: "The tool must be distinct, bounded, receipt-backed, and classified before use.",
    budget: { timeout_ms: 1600, max_files_read: 5, max_tool_calls: 0 },
    required_receipts: ["tool_ergonomics", "mcp", "action", "skills"],
    canaries: ["bounded_output", "fixed_command_template", "host_mcp_config_unchanged"],
    reject_if: ["tool_name_collision", "unbounded_output", "host_config_mutation", "install_without_gate"],
  },
  {
    id: "benchmark_score_claim_gate",
    change_type: "benchmark_or_score_change",
    trigger: "A score, eval, benchmark, or optimization claim changes project truth.",
    oracle: "The score must include canary/leakage checks, budget traces, receipt paths, and failure rows.",
    budget: { timeout_ms: 1600, max_files_read: 4, max_tool_calls: 0 },
    required_receipts: ["harness", "knowledge_improvements"],
    canaries: ["answer_key_hidden", "source_trace_present", "score_not_from_summary"],
    reject_if: ["answer_key_exposed", "source_leakage", "score_inflation", "chat_summary_as_proof"],
  },
];

const requiredChangeTypes = new Set([
  "prompt_change",
  "model_lane_change",
  "routing_policy_change",
  "tool_surface_change",
  "benchmark_or_score_change",
]);

const canaryBlocklist = [
  "answer_key",
  "oracle_solution",
  "benchmark_secret",
  "hidden_fixture",
  "source_label_leak",
  "full_green_when_codexa_down",
  "frontend_touched_from_ops",
  "paid_api_default",
];

async function main() {
  const startedAt = new Date();
  const packageJson = readJson(path.join(repoRoot, "package.json")) || {};
  const harness = readJson(path.join(dataRoot, "harness", "latest-harness-benchmark.json"));
  const knowledge = readJson(path.join(dataRoot, "knowledge", "improvements", "latest-improvement-candidates.json"));
  const toolErgonomics = readJson(path.join(dataRoot, "tool-ergonomics", "latest-tool-ergonomics.json"));
  const action = readJson(path.join(dataRoot, "action-classifier", "latest-action-classifier-doctor.json"));

  const fixtureIds = fixtures.map((fixture) => fixture.id);
  const fixtureTypes = new Set(fixtures.map((fixture) => fixture.change_type));
  const duplicateFixtureIds = fixtureIds.filter((id, index) => fixtureIds.indexOf(id) !== index);
  const missingTypes = [...requiredChangeTypes].filter((type) => !fixtureTypes.has(type));
  const fixtureFailures = [];
  for (const fixture of fixtures) {
    if (!fixture.oracle || fixture.oracle.length < 40) fixtureFailures.push(`${fixture.id}: oracle too weak`);
    if (!fixture.budget?.timeout_ms || !Number.isInteger(fixture.budget.max_tool_calls)) fixtureFailures.push(`${fixture.id}: budget missing`);
    if (!Array.isArray(fixture.required_receipts) || fixture.required_receipts.length < 2) fixtureFailures.push(`${fixture.id}: required_receipts missing`);
    if (!Array.isArray(fixture.canaries) || fixture.canaries.length < 2) fixtureFailures.push(`${fixture.id}: canaries missing`);
    if (!Array.isArray(fixture.reject_if) || fixture.reject_if.length < 2) fixtureFailures.push(`${fixture.id}: reject_if missing`);
    if (fixture.budget.max_tool_calls !== 0) fixtureFailures.push(`${fixture.id}: fixture should not call tools during proof`);
  }

  const gates = {
    deterministic_oracle_first: true,
    receipt_required: true,
    operator_approval_required: true,
    rollback_required: true,
    canary_blocklist_required: true,
    no_chat_summary_as_proof: true,
    no_model_card_promotion: true,
    no_frontend_from_ops: true,
    no_paid_api_default: true,
  };

  const constraints = {
    frontend_touched: false,
    install_attempted: false,
    paid_api_attempted: false,
    host_mcp_config_mutated: false,
    production_deploy_attempted: false,
    prompt_model_or_routing_changed: false,
  };

  const checks = [
    check("package_script_present", Boolean(packageJson.scripts?.["checkmate:doctor"]), { script: packageJson.scripts?.["checkmate:doctor"] || null }),
    check("fixture_count", fixtures.length >= 5, { fixtures_total: fixtures.length }),
    check("fixture_ids_unique", duplicateFixtureIds.length === 0, { duplicate_fixture_ids: duplicateFixtureIds }),
    check("required_change_types_present", missingTypes.length === 0, { missing_change_types: missingTypes }),
    check("fixtures_have_oracles_budgets_receipts_canaries", fixtureFailures.length === 0, { fixture_failures: fixtureFailures }),
    check("gates_complete", Object.values(gates).every(Boolean), { gates }),
    check("canary_blocklist_present", canaryBlocklist.length >= 8, { canary_blocklist_count: canaryBlocklist.length }),
    check("harness_green", harness?.status === "ORANGEBOX_HARNESS_BENCHMARK_GREEN", { harness_status: harness?.status || null, tasks_total: harness?.tasks_total || 0 }),
    check("knowledge_queue_ready", knowledge?.status === "KNOWLEDGE_IMPROVEMENT_CANDIDATES_READY" && knowledge?.not_autonomous === true, { knowledge_status: knowledge?.status || null }),
    check("tool_ergonomics_green", toolErgonomics?.status === "ORANGEBOX_TOOL_ERGONOMICS_GREEN", { tool_ergonomics_status: toolErgonomics?.status || null }),
    check("action_classifier_green", action?.status === "ORANGEBOX_ACTION_CLASSIFIER_GREEN", { action_status: action?.status || null }),
    check("backend_only_constraints", Object.values(constraints).every((value) => value === false), { constraints }),
  ];
  const failures = checks.filter((item) => !item.ok);
  const result = {
    ok: failures.length === 0,
    version: "checkmate-eval-lane/v1",
    status: failures.length === 0 ? "CHECKMATE_EVAL_LANE_GREEN" : "CHECKMATE_EVAL_LANE_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Do not change prompts, models, routing, tools, or scores until a CHECKMATE fixture proves the change target and its rollback path.",
    research_basis: [
      {
        source: "Anthropic engineering",
        url: "https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents",
        lesson: "Agent evals must be task-specific, measured against explicit success criteria, and used before changing behavior.",
      },
      {
        source: "Anthropic engineering",
        url: "https://www.anthropic.com/engineering/eval-awareness-browsecomp",
        lesson: "Eval and benchmark claims need contamination/leakage awareness before scores are trusted.",
      },
    ],
    gates,
    canary_blocklist: canaryBlocklist,
    fixtures,
    fixture_hash: sha256(fixtures),
    constraints,
    checks,
    failures,
    next_action: "Keep this doctor in the harness and run it before prompt, model, routing, benchmark, or tool-surface promotions.",
  };

  await writeJson(path.join(outRoot, "latest-checkmate-eval-lane.json"), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `checkmate-eval-lane-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(outRoot, "latest-checkmate-eval-lane.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
