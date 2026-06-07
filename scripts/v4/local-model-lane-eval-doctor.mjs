#!/usr/bin/env node
/*
  local-model-lane-eval-doctor.mjs

  Backend-only proof that Orangebox local model lanes are evaluated as roles
  with receipts and boundaries, not promoted by model-card claims or wishful
  inventory. This does not call Ollama, pull models, touch frontend, or invoke
  paid APIs.
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
const outRoot = path.join(dataRoot, "models");

const registryPath = path.join(repoRoot, "config", "model_registry.json");
const policyPath = path.join(repoRoot, "config", "routing_policy.json");
const roleMapPath = path.join(repoRoot, "config", "role_map.json");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
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

function hashObject(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function modelById(registry, id) {
  return (registry?.local_models || []).find((model) => model.id === id);
}

function includesAll(items, required) {
  const set = new Set(items || []);
  return required.every((item) => set.has(item));
}

function fixture(id, role, modelId, verdict, checks) {
  const failures = checks.filter((check) => check.ok !== true);
  return {
    id,
    role,
    model_id: modelId,
    verdict: failures.length === 0 ? verdict : "fail",
    ok: failures.length === 0,
    checks,
    failures: failures.map((check) => check.id),
  };
}

function policyFixture(registry, policy, roleMap, triLane, strongarm, gremlin) {
  const qwen4 = modelById(registry, "qwen3:4b");
  const qwen14 = modelById(registry, "qwen3:14b");
  const forge = modelById(registry, "mistral-small:24b");
  const mirror = modelById(registry, "deepseek-r1:32b");
  const dolphin = modelById(registry, "dolphin3:8b");
  const abliterated = modelById(registry, "llama3.1:8b-abliterated");
  const localJudgement = modelById(registry, "qwen3:30b-a3b");

  const normalRoles = policy?.budget_modes?.normal?.roles || {};
  const deepRoles = policy?.budget_modes?.deep?.roles || {};
  const wildcardLaw = policy?.wildcard_law || [];

  const installed = triLane?.availability?.core_installed_count;
  const total = triLane?.availability?.core_total;

  return [
    fixture("strongarm_micro_json_lane", "strongarm", "qwen3:4b", "pass", [
      { id: "model_registered", ok: Boolean(qwen4) },
      { id: "role_allowed", ok: qwen4?.allowed_roles?.includes("strongarm") },
      { id: "json_reliability_floor", ok: Number(qwen4?.json_reliability || 0) >= 80 },
      { id: "not_high_risk_final_judgement", ok: qwen4?.forbidden_roles?.includes("final_judgement_for_high_risk") },
      { id: "strongarm_receipt_green", ok: strongarm?.status === "STRONGARM_ORANGEBOX_GATE_GREEN" },
    ]),
    fixture("gremlin_dolphin_pressure_lane", "gremlin", "dolphin3:8b", "pass", [
      { id: "model_registered", ok: Boolean(dolphin) },
      { id: "role_allowed", ok: includesAll(dolphin?.allowed_roles, ["gremlin", "misfit", "anti_fog"]) },
      { id: "forbids_authority_roles", ok: includesAll(dolphin?.forbidden_roles, ["judgement", "mirror", "final_answer"]) },
      { id: "pressure_score_high", ok: Number(dolphin?.rebel_pressure || 0) >= 85 },
      { id: "misfits_dataset_receipt_green", ok: gremlin?.status === "GREMLIN_MISFITS_ELITE_GREEN" },
      { id: "misfits_training_honest", ok: gremlin?.training?.status === "NOT_TRAINED_YET" },
    ]),
    fixture("wildcard_abliterated_containment_lane", "wildcard_gremlin", "llama3.1:8b-abliterated", "pass", [
      { id: "model_registered", ok: Boolean(abliterated) },
      { id: "optional_not_core", ok: abliterated?.optional === true && abliterated?.required_tier === "wildcard" },
      { id: "forbids_authority_roles", ok: includesAll(abliterated?.forbidden_roles, ["judgement", "mirror", "final_answer", "policy_decision"]) },
      { id: "wildcard_law_names_lane", ok: wildcardLaw.some((line) => /Dolphin/i.test(line) && /abliterated/i.test(line)) },
      { id: "strongarm_must_audit_wildcard", ok: wildcardLaw.some((line) => /STRONGARM/i.test(line) && /audits wildcard/i.test(line)) },
    ]),
    fixture("mirror_truth_lane", "mirror", "deepseek-r1:32b", "pass", [
      { id: "model_registered", ok: Boolean(mirror) },
      { id: "role_allowed", ok: includesAll(mirror?.allowed_roles, ["mirror", "truth", "logic", "validation"]) },
      { id: "truth_score_floor", ok: Number(mirror?.truth_score || 0) >= 80 },
      { id: "normal_policy_uses_mirror", ok: normalRoles.mirror === "deepseek-r1:32b" },
      { id: "not_gremlin_lane", ok: mirror?.forbidden_roles?.includes("gremlin") },
    ]),
    fixture("local_judgement_lane", "judgement", "qwen3:30b-a3b", "pass", [
      { id: "model_registered", ok: Boolean(localJudgement) },
      { id: "role_allowed", ok: includesAll(localJudgement?.allowed_roles, ["judgement", "local_ruler", "final_synthesis_normal"]) },
      { id: "operator_approval_forbidden", ok: localJudgement?.forbidden_roles?.includes("operator_approval") },
      { id: "not_default_cloud_ruler", ok: normalRoles.judgement === "qwen3:30b-a3b" },
      { id: "cloud_lanes_not_default", ok: registry?.cloud_lanes?.top_architect?.default === false && registry?.cloud_lanes?.ruler_decision?.default === false },
    ]),
    fixture("forge_builder_lane", "forge", "mistral-small:24b", "pass", [
      { id: "model_registered", ok: Boolean(forge) },
      { id: "role_allowed", ok: includesAll(forge?.allowed_roles, ["forge", "builder", "implementation"]) },
      { id: "normal_policy_uses_forge", ok: normalRoles.forge === "mistral-small:24b" },
      { id: "needs_review_for_final", ok: forge?.forbidden_roles?.includes("final_judgement_for_high_risk") },
    ]),
    fixture("cheap_budget_does_not_wake_large_models", "budget", "qwen3:4b/qwen3:14b", "pass", [
      { id: "cheap_librarian_small", ok: policy?.budget_modes?.cheap?.roles?.librarian === "qwen3:4b" },
      { id: "cheap_strongarm_small", ok: policy?.budget_modes?.cheap?.roles?.strongarm === "qwen3:4b" },
      { id: "cheap_judgement_medium", ok: policy?.budget_modes?.cheap?.roles?.judgement === "qwen3:14b" },
      { id: "qwen14_registered", ok: Boolean(qwen14) },
    ]),
    fixture("deep_budget_cloud_escalation_explicit", "budget", "heavy local + explicit cloud", "pass", [
      { id: "deep_gremlin_wildcard", ok: deepRoles.gremlin === "llama3.1:8b-abliterated" },
      { id: "deep_mirror_heavy", ok: deepRoles.mirror === "deepseek-r1:70b" },
      { id: "deep_cloud_escalation_explicit", ok: includesAll(policy?.budget_modes?.deep?.cloud_escalation_when_local_confidence_low, ["claude-opus-4.7-max-1m", "gpt-5.5"]) },
      { id: "cloud_approval_required", ok: registry?.cloud_lanes?.top_architect?.approval_required === true && registry?.cloud_lanes?.ruler_decision?.approval_required === true },
    ]),
    fixture("inventory_honesty_gate", "availability", "live Ollama inventory", "pass", [
      { id: "trilane_receipt_green", ok: triLane?.status === "TRILANE_ROUTER_PACK_GREEN" },
      { id: "installed_count_numeric", ok: Number.isInteger(installed) && Number.isInteger(total) },
      { id: "installed_not_inflated", ok: Number.isInteger(installed) && Number.isInteger(total) && installed <= total },
      { id: "codexa_warning_preserved_when_unreachable", ok: /not reachable/i.test(String(triLane?.codexa_status_note || "")) ? installed < total : true },
    ]),
    fixture("role_map_authority_alignment", "policy", "role_map/routing_policy", "pass", [
      { id: "role_map_version", ok: roleMap?.version === "orangebox-role-map/v2" },
      { id: "routing_policy_version", ok: policy?.version === "orangebox-routing-policy/v2" },
      { id: "selection_score_penalizes_forbidden_roles", ok: /forbidden_role_penalty/.test(String(policy?.selection_score || "")) },
      { id: "receipt_learning_min_runs", ok: Number(policy?.receipt_learning?.minimum_runs_before_weighting || 0) >= 50 },
    ]),
  ];
}

async function main() {
  const startedAt = new Date();
  const registry = readJson(registryPath);
  const policy = readJson(policyPath);
  const roleMap = readJson(roleMapPath);
  const triLane = readJson(path.join(dataRoot, "trilane", "latest-trilane-model-router.json"));
  const strongarm = readJson(path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"));
  const gremlin = readJson(path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"));

  const fixtures = policyFixture(registry, policy, roleMap, triLane, strongarm, gremlin);
  const failures = fixtures.flatMap((item) => item.failures.map((failure) => ({ fixture: item.id, failure })));
  const installed = triLane?.availability?.core_installed_count ?? 0;
  const total = triLane?.availability?.core_total ?? 0;

  const result = {
    ok: failures.length === 0,
    version: "orangebox-local-model-lane-eval/v1",
    status: failures.length === 0 ? "LOCAL_MODEL_LANE_EVAL_GREEN" : "LOCAL_MODEL_LANE_EVAL_NOT_GREEN",
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Models are role-bound packet producers. Wildcards pressure. Mirror verifies. STRONGARM disciplines. Judgement synthesizes. Operator rules. Receipts prove.",
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      paid_api_attempted: false,
      ollama_pull_attempted: false,
      model_call_attempted: false,
      remote_codexa_mutation_attempted: false,
    },
    inventory_truth: {
      core_installed_count: installed,
      core_total: total,
      full_local_model_runtime_green: total > 0 && installed === total,
      policy_green_without_runtime_claim: true,
      codexa_status_note: triLane?.codexa_status_note || null,
    },
    packet_eval: {
      fixtures_total: fixtures.length,
      fixtures_green: fixtures.filter((item) => item.ok).length,
      suite_hash: hashObject(fixtures.map((item) => ({ id: item.id, ok: item.ok, checks: item.checks }))),
      fixtures,
    },
    promotion_law: {
      no_model_card_promotion: true,
      wildcard_never_final_authority: true,
      deterministic_gates_sovereign: true,
      minimum_receipt_runs_before_weighting: policy?.receipt_learning?.minimum_runs_before_weighting || null,
      next_runtime_gate: "After Codexa/Ollama is reachable, run trilane:doctor and model packet evals with real latency/json-validity receipts before changing weights.",
    },
    files_checked: [registryPath, policyPath, roleMapPath],
    receipts_checked: {
      trilane: path.join(dataRoot, "trilane", "latest-trilane-model-router.json"),
      strongarm: path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json"),
      gremlin: path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json"),
    },
    failures,
  };

  const latestPath = path.join(outRoot, "latest-local-model-lane-eval.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-local-model-lane-eval-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
