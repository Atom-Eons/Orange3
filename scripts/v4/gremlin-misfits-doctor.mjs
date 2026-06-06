#!/usr/bin/env node
/*
  gremlin-misfits-doctor.mjs

  Proves the STRONGARM Misfits packet-training lane is installed and ready.
  This is a backend/Ops doctor only: no paid API calls, no model training,
  no GPU requirement, and no frontend/visual mutation.
*/

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const pythonBin = process.env.PYTHON || "python";

const trainerRoot = path.join(repoRoot, "integrations", "strongarm_gremlin_trainer_v2_5");
const eliteRoot = path.join(repoRoot, "integrations", "strongarm_gremlin_elite_1000_v1_3");
const trainerZip = path.join(repoRoot, "Addons", "STRONGARM_GREMLIN_TRAINER_V2_5.zip");
const eliteZip = path.join(repoRoot, "Addons", "STRONGARM_GREMLIN_ELITE_1000_V1_3.zip");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function tail(text, max = 5000) {
  const value = String(text || "");
  return value.length > max ? value.slice(-max) : value;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function parseJsonFromStdout(text) {
  const value = String(text || "").trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(value.slice(start, end + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function runStep(name, command, commandArgs, options = {}) {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(command, commandArgs, {
      cwd: options.cwd || repoRoot,
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 120_000,
      maxBuffer: options.maxBuffer || 20_000_000,
      windowsHide: true,
    });
    return {
      name,
      ok: true,
      command: [command, ...commandArgs].join(" "),
      cwd: options.cwd || repoRoot,
      duration_ms: Date.now() - started,
      stdout_tail: tail(stdout),
      stderr_tail: tail(stderr, 1600),
      json: parseJsonFromStdout(stdout),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...commandArgs].join(" "),
      cwd: options.cwd || repoRoot,
      duration_ms: Date.now() - started,
      exit_code: error.code ?? null,
      stdout_tail: tail(error.stdout),
      stderr_tail: tail(error.stderr || error.message, 3000),
      json: parseJsonFromStdout(error.stdout),
    };
  }
}

function elitePolicy(stats) {
  return {
    version: "orangebox-gremlin-misfits-policy/v1",
    status: "ACTIVE_PACKET_TRAINING_LANE",
    doctrine: [
      "Gremlin pressures.",
      "Mirror verifies.",
      "STRONGARM disciplines.",
      "JUDGEMENT decides.",
      "Operator rules.",
      "Receipts prove.",
    ],
    role: "Misfits/Gremlin is a pressure packet lane, not a final-answer chatbot and not the system ruler.",
    canonical_dataset: {
      name: "STRONGARM_GREMLIN_ELITE_1000_V1_3",
      path: eliteRoot,
      zip_path: eliteZip,
      rows: stats?.elite_rows || stats?.stats?.rows || 1000,
      split: stats?.splits || { train: 850, val: 75, test: 75 },
      ratio_target: stats?.ratio_target || {
        hard_tech_coding: 500,
        philosophy_debate: 200,
        casual_banter: 200,
        pushback_refusal: 100,
      },
      banned_hits: stats?.stats?.banned_hits || {},
    },
    backup_or_augmentation_datasets: [
      "STRONGARM_GREMLIN_QA_DATASET_V1_2_5000.zip",
      "STRONGARM_GREMLIN_QA_DATASET_V1_1_2000.zip",
    ],
    training_status: "NOT_TRAINED_YET",
    training_gate:
      "Train only after operator chooses the box/runtime. First recommended base: Qwen3-4B for schema obedience; compare Dolphin 8B and an abliterated 8B after the packet judge works.",
    runtime_integration: {
      strongarm_gate: "STRONGARM EASY remains the live local pressure gate on 127.0.0.1:8094.",
      misfits_lane: "Elite dataset and council trainer are proofed locally and ready for a LoRA run.",
      no_frontend_dependency: true,
      no_paid_api_required: true,
      no_gpu_required_for_doctor: true,
    },
  };
}

function validateEliteStats(stats, validateJson, auditJson) {
  const expected = {
    hard_tech_coding: 500,
    philosophy_debate: 200,
    casual_banter: 200,
    pushback_refusal: 100,
  };
  const categories = validateJson?.stats?.categories || auditJson?.category_counts || stats?.stats?.categories || {};
  const bannedHits = validateJson?.stats?.banned_hits || stats?.stats?.banned_hits || {};
  const catchphrases = auditJson?.catchphrase_counts || stats?.stats?.catchphrases || {};
  const rows = validateJson?.stats?.rows || auditJson?.rows || stats?.elite_rows;
  const categoryOk = Object.entries(expected).every(([key, value]) => categories?.[key] === value);
  const bannedOk = Object.values(bannedHits).every((count) => Number(count) === 0)
    && Object.values(catchphrases).every((count) => Number(count) === 0);
  const errorsOk = Array.isArray(validateJson?.errors) && validateJson.errors.length === 0;
  return {
    ok: rows === 1000 && categoryOk && bannedOk && errorsOk,
    rows,
    categories,
    banned_hits: bannedHits,
    catchphrase_counts: catchphrases,
    validator_errors: validateJson?.errors || null,
  };
}

async function main() {
  const stats = readJson(path.join(eliteRoot, "data", "distillation_stats.json"));
  const checks = {
    trainer_root: { ok: exists(trainerRoot), path: trainerRoot },
    trainer_main: { ok: exists(path.join(trainerRoot, "council_v2.py")), path: path.join(trainerRoot, "council_v2.py") },
    trainer_zip: { ok: exists(trainerZip), path: trainerZip, sha256: sha256File(trainerZip) },
    elite_root: { ok: exists(eliteRoot), path: eliteRoot },
    elite_dataset: { ok: exists(path.join(eliteRoot, "data", "gremlin_elite_1000.jsonl")), path: path.join(eliteRoot, "data", "gremlin_elite_1000.jsonl") },
    elite_zip: { ok: exists(eliteZip), path: eliteZip, sha256: sha256File(eliteZip) },
    stats_file: { ok: Boolean(stats), path: path.join(eliteRoot, "data", "distillation_stats.json"), stats },
  };

  const commands = [];
  if (Object.values(checks).every((check) => check.ok)) {
    commands.push(await runStep("trainer_py_compile", pythonBin, [
      "-m",
      "py_compile",
      "council_v2.py",
      path.join("scripts", "validate_gremlin_dataset.py"),
      path.join("evals", "eval_gremlin_packets.py"),
    ], { cwd: trainerRoot }));
    commands.push(await runStep("elite_py_compile", pythonBin, [
      "-m",
      "py_compile",
      path.join("scripts", "validate_elite.py"),
      path.join("scripts", "sample_elite.py"),
      path.join("scripts", "distill_audit.py"),
    ], { cwd: eliteRoot }));
    commands.push(await runStep("trainer_seed_validate", pythonBin, [path.join("scripts", "validate_gremlin_dataset.py")], { cwd: trainerRoot }));
    commands.push(await runStep("trainer_eval_stub", pythonBin, [path.join("evals", "eval_gremlin_packets.py")], { cwd: trainerRoot }));
    commands.push(await runStep("trainer_council_heuristic", pythonBin, [
      "council_v2.py",
      "run",
      "Keep Orangebox work on the full productive path with STRONGARM and the elite Misfits pressure packet dataset",
      "--mode",
      "normal",
      "--heuristic",
    ], { cwd: trainerRoot }));
    commands.push(await runStep("elite_validate", pythonBin, [path.join("scripts", "validate_elite.py")], { cwd: eliteRoot }));
    commands.push(await runStep("elite_distill_audit", pythonBin, [path.join("scripts", "distill_audit.py")], { cwd: eliteRoot }));
    commands.push(await runStep("elite_sample", pythonBin, [path.join("scripts", "sample_elite.py"), path.join("data", "gremlin_elite_1000.jsonl"), "3"], { cwd: eliteRoot }));
  }

  const eliteValidate = commands.find((step) => step.name === "elite_validate")?.json;
  const eliteAudit = commands.find((step) => step.name === "elite_distill_audit")?.json;
  const eliteProof = validateEliteStats(stats, eliteValidate, eliteAudit);
  const council = commands.find((step) => step.name === "trainer_council_heuristic")?.json;
  const policy = elitePolicy(stats);
  const commandsOk = commands.length > 0 && commands.every((step) => step.ok);
  const checksOk = Object.values(checks).every((check) => check.ok);
  const councilOk = council?.version === "2.5.0" && council?.judgement?.escalation_needed === false;

  const result = {
    ok: checksOk && commandsOk && eliteProof.ok && councilOk,
    version: "orangebox-gremlin-misfits-doctor/v1",
    checked_at: new Date().toISOString(),
    status: "RUNNING",
    repo_root: repoRoot,
    data_root: dataRoot,
    trainer_root: trainerRoot,
    elite_root: eliteRoot,
    checks,
    commands,
    elite_proof: eliteProof,
    council_proof: {
      ok: councilOk,
      version: council?.version || null,
      mode: council?.mode || null,
      confidence: council?.judgement?.confidence || null,
      escalation_needed: council?.judgement?.escalation_needed ?? null,
      final_answer: council?.judgement?.final_answer || null,
    },
    training: {
      status: "NOT_TRAINED_YET",
      reason: "Doctor proves dataset/trainer readiness only. LoRA training needs an explicit runtime choice and operator action on Codexa/Colab/local GPU.",
      first_base_recommendation: stats?.training_recommendation?.first_base || "Qwen3-4B for schema obedience; compare Dolphin 8B and an abliterated 8B after.",
      lora_rank: stats?.training_recommendation?.lora_rank || 16,
      lora_alpha: stats?.training_recommendation?.lora_alpha || 32,
    },
    project_gate_policy: policy,
  };
  result.status = result.ok ? "GREMLIN_MISFITS_ELITE_GREEN" : "GREMLIN_MISFITS_ELITE_NOT_GREEN";
  result.completed_at = new Date().toISOString();

  const misfitsRoot = path.join(dataRoot, "misfits");
  await writeJson(path.join(misfitsRoot, "latest-gremlin-misfits-doctor.json"), result);
  await writeJson(path.join(misfitsRoot, "gremlin-elite-training-policy.json"), policy);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-gremlin-misfits-doctor-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(misfitsRoot, "latest-gremlin-misfits-doctor.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
