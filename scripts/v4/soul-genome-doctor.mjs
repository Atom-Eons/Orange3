#!/usr/bin/env node
/*
  soul-genome-doctor.mjs

  Audits the SOUL GENOME idea as an Orangebox Knowledge Engine continuity
  object. This does not train a model, call an API, or mutate frontend code.
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
const genomePath = path.join(repoRoot, "config", "soul_genome.json");

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

function sha256File(file) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

function latestReceipt(prefix) {
  if (!exists(receiptDir)) return null;
  const files = fs.readdirSync(receiptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(receiptDir, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function countReceipts(prefix) {
  if (!exists(receiptDir)) return 0;
  return fs.readdirSync(receiptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .length;
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function layer(status, evidence, missing = [], next = null) {
  return {
    status,
    ok: status === "exists" || status === "partial",
    evidence,
    missing,
    next,
  };
}

function mainLayerMap(genome) {
  const zeroPrimer = path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md");
  const midPrimer = path.join(dataRoot, "primers", "ORANGEBOX_MID_SESSION_PRIMER.md");
  const skillPrimer = path.join(repoRoot, "skills", "orangebox-primer", "SKILL.md");
  const chatBackup = path.join(dataRoot, "chat-mirror", "listener-heartbeat.json");
  const atomSmasher = path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json");
  const strongarm = path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json");
  const misfits = path.join(dataRoot, "misfits", "latest-gremlin-misfits-doctor.json");
  const triLane = path.join(dataRoot, "trilane", "latest-trilane-model-router.json");
  const reality = path.join(dataRoot, "watcher", "latest-reality-watch.json");
  const obox2Pack = path.join(dataRoot, "obox2", "latest-internal-setup-pack.json");
  const sourceLock = path.join(dataRoot, "orangebox-source-of-truth.json");

  const receipts = {
    strongarm: countReceipts("orangebox-strongarm-doctor-"),
    gremlin: countReceipts("orangebox-gremlin-misfits-doctor-"),
    trilane: countReceipts("orangebox-trilane-model-router-"),
    backend: countReceipts("orangebox-backend-install-"),
    final: countReceipts("orangebox-delta-final-package-"),
  };

  return {
    activation_layer: layer(
      exists(zeroPrimer) && exists(midPrimer) && exists(skillPrimer) ? "exists" : "partial",
      { zero_primer: zeroPrimer, mid_primer: midPrimer, skill_primer: skillPrimer },
      [!exists(zeroPrimer) && "zero-memory primer missing", !exists(midPrimer) && "mid-session primer missing", !exists(skillPrimer) && "repo primer skill missing"].filter(Boolean),
      "Keep SOUL GENOME as a small activation object referenced by primers, not a giant prompt.",
    ),
    memory_layer: layer(
      exists(chatBackup) && exists(atomSmasher) ? "exists" : "partial",
      { chatbackup_heartbeat: chatBackup, atomsmasher_doctor: atomSmasher, memory_classes: genome?.memory_classes || null },
      [!exists(chatBackup) && "ChatBackup listener heartbeat missing", !exists(atomSmasher) && "AtomSmasher proof missing"].filter(Boolean),
      "Add explicit memory-class tags when compiling future receipt datasets.",
    ),
    behavior_receipt_ledger: layer(
      receipts.backend > 0 && receipts.strongarm > 0 ? "exists" : "partial",
      { receipt_dir: receiptDir, counts: receipts, latest_backend: latestReceipt("orangebox-backend-install-"), latest_strongarm: latestReceipt("orangebox-strongarm-doctor-") },
      receipts.backend === 0 || receipts.strongarm === 0 ? ["Need backend + STRONGARM behavior receipts"] : [],
      "Extend model output receipts with operator rating and chosen/rejected linkage.",
    ),
    preference_data: layer(
      exists(misfits) ? "partial" : "missing",
      { gremlin_misfits_doctor: misfits, elite_dataset_rows: readJson(misfits)?.elite_proof?.rows || null },
      ["DPO pair compiler is not active yet", "Operator preference-pair UI is not active yet"],
      "Compile STRONGARM accepted/rejected drafts into SFT/DPO-ready rows after enough real receipts accumulate.",
    ),
    eval_probe_battery: layer(
      exists(strongarm) && exists(misfits) ? "partial" : "missing",
      { strongarm_doctor: strongarm, gremlin_misfits_doctor: misfits, reality_watch: reality },
      ["Continuity probe battery is mapped, not fully implemented", "No promoted model candidate probe gate yet"],
      "Create continuity probes for scope collapse, fake limitation, tool avoidance, authority-chain drift, and artifact failure.",
    ),
    model_router: layer(
      exists(triLane) ? "exists" : "missing",
      { trilane_router: triLane, model_registry: path.join(repoRoot, "config", "model_registry.json"), role_map: path.join(repoRoot, "config", "role_map.json") },
      exists(triLane) ? [] : ["Tri-lane router proof missing"],
      "After Codexa models are installed, feed model success receipts into routing scores.",
    ),
    adapter_compiler: layer(
      exists(path.join(repoRoot, "integrations", "strongarm_gremlin_elite_1000_v1_3", "train_colab", "gremlin_elite_unsloth_r16.py")) ? "partial" : "missing",
      {
        elite_train_script: path.join(repoRoot, "integrations", "strongarm_gremlin_elite_1000_v1_3", "train_colab", "gremlin_elite_unsloth_r16.py"),
        obox2_setup_pack: obox2Pack,
      },
      ["No trained adapter manifest yet", "No model promotion receipt yet"],
      "Run LoRA training only after Codexa/Colab runtime is chosen; then store adapter manifest, base model, dataset hash, and eval score.",
    ),
    drift_monitor: layer(
      exists(reality) && exists(strongarm) ? "partial" : "missing",
      { reality_watch: reality, strongarm_gate: strongarm },
      ["No full SOUL baseline-vs-candidate drift diff yet"],
      "Add baseline probe snapshots and compare candidates against SOUL GENOME trait thresholds.",
    ),
    lineage_and_versioning: layer(
      exists(sourceLock) && exists(genomePath) ? "partial" : "missing",
      { source_lock: sourceLock, genome: genomePath, genome_hash: sha256File(genomePath), final_manifest: path.join("C:", "AtomEons", "orangebox", "finals", "Orangebox Delta Final", "orangebox-delta-final-manifest.json") },
      ["No SOUL.01.0001 lineage table yet", "No rejected-candidate model ledger yet"],
      "Create lineage records only when candidate models/adapters are evaluated.",
    ),
    operator_approval: layer(
      exists(sourceLock) ? "partial" : "missing",
      { source_lock: sourceLock, approval_law: "Operator remains above genome, router, council packets, and Judgement." },
      ["No dedicated promote/reject/re-soul command yet"],
      "Add explicit approve/reject/promote/re-soul commands after candidate model workflow exists.",
    ),
  };
}

async function main() {
  const genome = readJson(genomePath);
  const layerMap = mainLayerMap(genome);
  const missingCritical = [];
  if (!genome) missingCritical.push("Missing config/soul_genome.json");
  if (genome?.status !== "INTERNAL_KNOWLEDGE_ENGINE_SPEC") missingCritical.push("SOUL GENOME status must remain internal knowledge-engine spec");
  if (!genome?.non_goals?.includes("Do not make SOUL GENOME the hidden leader.")) missingCritical.push("Hidden-leader non-goal missing");

  const result = {
    ok: missingCritical.length === 0,
    version: "orangebox-soul-genome-doctor/v1",
    status: missingCritical.length === 0 ? "SOUL_GENOME_KNOWLEDGE_MAP_GREEN" : "SOUL_GENOME_KNOWLEDGE_MAP_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    decision: "Accepted as an Orangebox Knowledge Engine continuity map. Not accepted as a system rename, model body, hidden ruler, or training claim.",
    genome: {
      path: genomePath,
      sha256: sha256File(genomePath),
      name: genome?.name || null,
      runtime: genome?.runtime || null,
      status: genome?.status || null,
    },
    layer_map: layerMap,
    next_five_build_steps: [
      "Add behavior receipt fields for chosen/rejected linkage and operator rating.",
      "Create continuity probe fixtures from STRONGARM/Misfits failure modes.",
      "Build a preference compiler that emits SFT rows, DPO pairs, anti-exemplars, and eval probes.",
      "After Codexa model install, run candidate wildcard and judgement models through the continuity probes.",
      "Create adapter/model lineage manifests only after real LoRA or candidate-model eval receipts exist.",
    ],
    missing_critical: missingCritical,
  };

  const outRoot = path.join(dataRoot, "knowledge", "soul-genome");
  await writeJson(path.join(outRoot, "latest-soul-genome-doctor.json"), result);
  await writeJson(path.join(outRoot, "soul-genome.json"), genome || {});
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-soul-genome-doctor-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(outRoot, "latest-soul-genome-doctor.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
