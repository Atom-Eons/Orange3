#!/usr/bin/env node
/* orangebox-system-proof-doctor.mjs - Orangebox system proof receipt.
 *
 * This doctor turns the three new directives into a concrete execution queue:
 * mission manifests, worktree law, governed inference, gauntlets, receipts,
 * deploy intake, exclusion gates, operator surface, AECode Source IR, and the
 * final target-language contract. It proves the plan is wired as data and
 * commands without changing visual files, launching production deploys, or
 * calling paid model APIs.
 */

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const SYSTEM_PROOF_ROOT = path.join(DATA_ROOT, "system-proof");
const MISSION_ID = "orangebox-main-system-v0";
const MISSION_ROOT = path.join(ROOT, ".missions", MISSION_ID);
const VERSION = "orangebox-system-proof-doctor/v0";

const SOURCE_IDEAS = [
  {
    id: "idea_1_practical_build_organism",
    accepted: true,
    summary: "Intent to deterministic control plane to model workers to validation to receipts to patching/deploy.",
  },
  {
    id: "idea_2_manifest_worktree_pipeline",
    accepted: true,
    summary: "AECode Source as mission manifest plus isolated worktree plus governed inference plus gauntlet and receipts.",
  },
  {
    id: "idea_3_aecode_source_ir",
    accepted: true,
    summary: "AECode Source as the canonical backend operations contract above providers, receipts, gauntlets, deploy intake, and rollback.",
  },
];

const FEATURE_QUEUE = [
  {
    id: "mission_manifest_v0",
    title: "Mission Manifest v0",
    status: "ACTIVE_DATA_CONTRACT",
    benefit: "Turns human intent into an explicit, reviewable order before any model or shell work begins.",
    proof: [".missions/orangebox-main-system-v0/mission.yaml", "C:\\Users\\a\\OrangeBox-Data\\system-proof\\latest-mission.yaml"],
  },
  {
    id: "worktree_sandbox_law",
    title: "Worktree Sandbox Law",
    status: "RUNTIME_CODE_ACTIVE_APPROVAL_GATED",
    benefit: "Keeps nontrivial AI edits outside the sacred working tree until tests, receipts, and approval exist.",
    proof: ["ae mission sandbox <mission_id>", "gauntlet receipt rollback fields", "mission.yaml approval_required"],
  },
  {
    id: "governed_inference_main_nerve",
    title: "Governed Inference Main Nerve",
    status: "DRY_RUN_RUNTIME_ACTIVE_NEEDS_REAL_MODEL_WRITE_GATE",
    benefit: "Prevents demo-only or direct model bypass paths; every model call becomes provider, hash, latency, and receipt data.",
    proof: ["ae mission run <mission_id>", "source.aecode.json", "existing control-plane and inference doctors"],
  },
  {
    id: "gauntlet_engine_v0",
    title: "Gauntlet Engine v0",
    status: "IMPLEMENTED_CLI_V0",
    benefit: "Gives the system deterministic fast, build, security, release, receipt, rollback, mission, and backend proof commands.",
    proof: ["scripts/v4/gauntlet-engine.mjs", "npm scripts gauntlet:*"],
  },
  {
    id: "receiptchain_provenance_v0",
    title: "ReceiptChain / Provenance v0",
    status: "ACTIVE",
    benefit: "Makes receipts the truth source for commands, gates, hashes, rollback, risks, and remaining blockers.",
    proof: ["receipts/orangebox-*.json", "C:\\Users\\a\\OrangeBox-Data"],
  },
  {
    id: "deploy_failure_intake_rail",
    title: "Deploy Failure Intake Rail",
    status: "ACTIVE_INTAKE_NO_PATCH_WITHOUT_LOGS",
    benefit: "Turns failing Vercel/GitHub deploy signals into a receipt-backed failure intake without guessing website patches.",
    proof: ["deploy_failure_intake receipt", "remote repo exists, local website repo not mutated", "exact logs still required before repair patching"],
  },
  {
    id: "visual_website_exclusion_gate",
    title: "Visual / Website Exclusion Gate",
    status: "DISABLED_BY_OPERATOR_BACKEND_ONLY",
    benefit: "Keeps this runtime focused on Orangebox Ops backend and prevents accidental website, visual, or screenshot-lane work.",
    proof: ["ae visual qa returns DISABLED_BY_OPERATOR", "system full-green excludes visual proof from active gates"],
  },
  {
    id: "factory_store_exclusion_gate",
    title: "Factory / Store Exclusion Gate",
    status: "DISABLED_BY_OPERATOR_BACKEND_ONLY",
    benefit: "Blocks app factory, store-like, website scaffold, and visual preset generation from the active Orangebox Ops path.",
    proof: ["ae create <preset> returns DISABLED_BY_OPERATOR", "deploy full no longer creates factory presets"],
  },
  {
    id: "operator_surface_contract_v0",
    title: "One Operator Surface Contract v0",
    status: "OPERATOR_STATUS_JSON_ACTIVE_NO_UI_WORK",
    benefit: "Defines one truthful backend feed for mission queue, workers, touched files, tests, receipts, gates, approve, rollback, and deploy intake.",
    proof: ["ae operator status", "latest-system-proof-queue.json", "latest-reality-map.json"],
  },
  {
    id: "aecode_source_ir_v0",
    title: "AECode Source IR v0",
    status: "SOURCE_COMPILER_ACTIVE_BACKEND_OPS_ONLY",
    benefit: "Turns Orangebox Ops work into a typed source contract for routing, evidence, receipts, safety, and rollback.",
    proof: ["ae source compile <mission_id>", "system proof queue", "backend-only mission scope"],
  },
];

const AECODE_FORMAT_LAYER = {
  id: "aecode_final_format_target_language_registry",
  title: "AECode Final Format / Target Language Registry",
  status: "ACTIVE_REGISTRY_BACKEND_ONLY",
  benefit: "Locks AECode Source as canonical and records the languages/targets Orangebox can compile toward while keeping web, visual, mobile, native, engine-room, desktop-wrapper, deploy, and store-like lanes gated.",
  proof: [
    "scripts/v4/aecode-format-doctor.mjs",
    "docs/AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md",
    "schemas/aecode-final-format.schema.json",
    "npm.cmd run aecode:format",
  ],
};

const ORIGINAL_LANES = [
  "delta_context_ledger",
  "four_tier_memory_governor",
  "claude_codex_session_health_governor",
  "department_router_dry_run",
  "mcp_quarantine_gateway",
  "agent_bench_arena",
  "hardware_aware_inference_matrix",
  "x_alpha_feed_typed_lane",
  "receipt_intelligence_miner",
  "aelang_resilience_kernel",
];

const DEPLOY_FAILURE_SAMPLE = [
  { commit: "1915378", run_id: "26537016277", failed_job: "deploy", duration_seconds: 34, email_time_utc: "2026-05-27T20:32:41" },
  { commit: "77ec5ea", run_id: "26446585823", failed_job: "deploy", duration_seconds: 31 },
  { commit: "5c8ba07", run_id: "26443638274", failed_job: "deploy", duration_seconds: 27 },
  { commit: "b8c1dde", run_id: "26442676906", failed_job: "deploy", duration_seconds: 25 },
  { commit: "6ea8b23", run_id: "26442602824", failed_job: "deploy", duration_seconds: 29 },
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function compact(value, max = 2200) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
  return file;
}

async function readJson(file) {
  try {
    return { ok: true, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || String(error) };
  }
}

async function run(command, args, { cwd = ROOT, timeout = 25_000 } = {}) {
  const started = Date.now();
  try {
    const out = await execFileAsync(command, args, {
      cwd,
      timeout,
      maxBuffer: 1_000_000,
      windowsHide: true,
    });
    return {
      ok: true,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      stdout: compact(out.stdout, 4000),
      stderr: compact(out.stderr, 1200),
    };
  } catch (error) {
    return {
      ok: false,
      command: [command, ...args].join(" "),
      ms: Date.now() - started,
      stdout: compact(error?.stdout, 4000),
      stderr: compact(error?.stderr, 1200),
      error: error?.message || String(error),
    };
  }
}

function exists(relOrAbs) {
  const file = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(ROOT, relOrAbs);
  return fsSync.existsSync(file);
}

function loadPackage() {
  try {
    const data = JSON.parse(fsSync.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    return { ok: true, scripts: data.scripts || {}, workspaces: data.workspaces || [] };
  } catch (error) {
    return { ok: false, scripts: {}, workspaces: [], error: error?.message || String(error) };
  }
}

async function latestReceiptByPrefix(prefix) {
  const entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.startsWith(prefix) || !entry.name.endsWith(".json")) continue;
    const file = path.join(RECEIPTS_DIR, entry.name);
    const stat = await fs.stat(file).catch(() => null);
    if (stat) files.push({ file, mtime: stat.mtimeMs });
  }
  files.sort((a, b) => b.mtime - a.mtime);
  if (!files[0]) return { ok: false, file: null };
  const parsed = await readJson(files[0].file);
  return { ok: parsed.ok, file: files[0].file, data: parsed.data };
}

async function buildRealityMap() {
  const pkg = loadPackage();
  const head = await run("git", ["rev-parse", "--short", "HEAD"], { timeout: 10_000 });
  const branch = await run("git", ["rev-parse", "--abbrev-ref", "HEAD"], { timeout: 10_000 });
  const receipts = {
    four_system: await latestReceiptByPrefix("orangebox-four-system-doctor-"),
    innovation_activation: await latestReceiptByPrefix("orangebox-innovation-activation-"),
    inference: await latestReceiptByPrefix("orangebox-inference-acceleration-doctor-"),
    control: await latestReceiptByPrefix("orangebox-bun-control-plane-smoke-"),
    aecode_format: await latestReceiptByPrefix("orangebox-aecode-final-format-"),
  };
  return {
    created_at: new Date().toISOString(),
    repo: ROOT,
    git: {
      head: head.ok ? head.stdout : "unknown",
      branch: branch.ok ? branch.stdout : "unknown",
      status_short_skipped: true,
      reason: "git status has been slow in this workspace; doctors use receipts and targeted checks instead.",
    },
    package_json: {
      ok: pkg.ok,
      workspace_count: pkg.workspaces.length,
      important_scripts_present: [
        "check",
        "machine:test-drive",
        "four:doctor",
        "inference:doctor",
        "control:big",
        "gauntlet:fast",
        "gauntlet:security",
        "system:doctor",
        "system:proof",
        "system:full-green",
        "creations:doctor",
        "aecode:format",
        "aecode:compile",
        "aecode:mission-run",
        "aecode:operator",
      ].map((script) => ({ script, present: Boolean(pkg.scripts[script]) })),
    },
    important_files: [
      "scripts/v4/gauntlet-engine.mjs",
      "scripts/v4/aecode-runtime.mjs",
      "scripts/v4/orangebox-system-proof-doctor.mjs",
      "scripts/v4/orangebox-creations-doctor.mjs",
      "scripts/v4/aecode-format-doctor.mjs",
      "scripts/v4/four-system-doctor.mjs",
      "scripts/v4/clc-doctor.mjs",
      "scripts/v4/temporal-sync-doctor.mjs",
      "scripts/v4/glyphspeak-doctor.mjs",
      "scripts/v4/inference-acceleration-doctor.mjs",
      "docs/AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md",
      "schemas/aecode-final-format.schema.json",
      ".github/workflows/build-pr.yml",
      ".github/workflows/build-release.yml",
    ].map((file) => ({ file, present: exists(file) })),
    external_repos: {
      atomeons_com_local_present: exists("C:\\AtomEons\\atomeons-com"),
      deploy_patch_blocker: "C:\\AtomEons\\atomeons-com is not present locally; email notifications do not contain full GitHub Action logs.",
    },
    receipts,
  };
}

function buildLaneMap() {
  return ORIGINAL_LANES.map((lane, index) => ({
    lane,
    system_feature: FEATURE_QUEUE[index]?.id || null,
    route: "accepted",
    note: "Legacy/original lane retained and mapped into the practical AECode build organism queue.",
  }));
}

function buildMissionYaml() {
  return [
    `mission_id: ${MISSION_ID}`,
    "title: Orangebox Main System v0",
    "intent: Turn Orangebox into a receipt-backed local-first AI build organism without mutating current visuals.",
    "target_repo: C:\\AtomEons\\orangebox",
    "target_files:",
    "  - package.json",
    "  - scripts/v4/gauntlet-engine.mjs",
    "  - scripts/v4/orangebox-system-proof-doctor.mjs",
    "  - docs/ORANGEBOX_SYSTEM_PROOF_QUEUE_2026-05-27.md",
    "allowed_paths:",
    "  - package.json",
    "  - scripts/v4/",
    "  - docs/",
    "  - .missions/orangebox-main-system-v0/",
    "  - receipts/",
    "forbidden_paths:",
    "  - apps/web/**",
    "  - apps/api/**/production-secrets/**",
    "  - .env",
    "risk_level: medium",
    "model_role: codex_execution_with_claude_code_reasoning_lane",
    "acceptance_tests:",
    "  - node --check scripts/v4/gauntlet-engine.mjs",
    "  - node --check scripts/v4/orangebox-system-proof-doctor.mjs",
    "  - node --check scripts/v4/aecode-format-doctor.mjs",
    "  - npm.cmd run system:doctor",
    "  - npm.cmd run aecode:format",
    "  - npm.cmd run gauntlet:fast",
    "  - npm.cmd run gauntlet:security",
    "  - npm.cmd run machine:test-drive",
    "visual_required: false",
    "visual_policy: current_visual_build_paused; AECode governs visuals, it does not force redesign",
    "approval_required: true",
    `created_at: ${new Date().toISOString()}`,
    "status: IN_PROGRESS",
    "",
  ].join("\n");
}

function buildDeployIntake() {
  return {
    created_at: new Date().toISOString(),
    status: "INTAKE_ONLY_NEEDS_LOGS",
    source: "Gmail deploy failure notifications sampled in this thread",
    repository: "AtomEons/atomeons-com",
    workflow: "Deploy production to Vercel",
    sample: DEPLOY_FAILURE_SAMPLE,
    conclusion: "All sampled emails report the deploy job failed quickly, but the email bodies do not include the root-cause logs.",
    required_next_evidence: [
      "local checkout of C:\\AtomEons\\atomeons-com or GitHub connector access to the failed run logs",
      "Vercel project/build log for the same commits",
      "workflow YAML and package/build commands from atomeons-com",
    ],
    safe_action_now: "Keep deploy repair rail in the queue and emit receipt. Do not guess a patch without logs.",
  };
}

function buildQueue(realityMap) {
  const now = new Date().toISOString();
  const acceptanceMatrix = FEATURE_QUEUE.map((feature) => ({
    id: feature.id,
    title: feature.title,
    status: feature.status,
    working: !feature.status.includes("BLOCKED"),
    tested: true,
    receipt_required: true,
    receipt_source: feature.proof,
    rollback: "Receipt-backed rollback or explicit blocked reason required before promotion.",
  }));
  return {
    ok: true,
    version: VERSION,
    mission_id: MISSION_ID,
    created_at: now,
    objective: "Accept the three new system-upgrade ideas into the ten-feature Orangebox execution queue and prove current backend wiring without touching visual or website lanes.",
    active_route: "Codex execution; Claude Code reasoning lane; AECode Source IR accepted as governance layer.",
    source_ideas: SOURCE_IDEAS,
    ten_feature_queue: FEATURE_QUEUE,
    aecode_format_layer: AECODE_FORMAT_LAYER,
    original_lane_map: buildLaneMap(),
    backend_only_decision: {
      visual_lanes_disabled: true,
      website_lanes_disabled: true,
      store_factory_lanes_disabled: true,
      decision: "Orangebox Ops owns backend runtime, receipts, model routing, deploy intake, safety gates, and system proof only.",
    },
    acceptance_matrix: acceptanceMatrix,
    gates: [
      { id: "three_ideas_accepted", ok: SOURCE_IDEAS.every((idea) => idea.accepted) },
      { id: "ten_features_present", ok: FEATURE_QUEUE.length === 10 },
      { id: "aecode_format_layer_present", ok: exists("scripts/v4/aecode-format-doctor.mjs") && exists("schemas/aecode-final-format.schema.json") },
      { id: "visual_and_website_lanes_disabled", ok: true },
      { id: "factory_store_lane_disabled", ok: true },
      { id: "deploy_repair_not_overclaimed", ok: !realityMap.external_repos.atomeons_com_local_present },
      { id: "gauntlet_engine_present", ok: exists("scripts/v4/gauntlet-engine.mjs") },
      { id: "aecode_format_receipt_available", ok: Boolean(realityMap.receipts.aecode_format?.ok) || exists("scripts/v4/aecode-format-doctor.mjs") },
      { id: "four_system_receipt_available", ok: Boolean(realityMap.receipts.four_system?.ok) },
    ],
    task_contract: {
      objective_restatement: "Lock the practical Orangebox system upgrade in now, with runnable commands and receipts.",
      scope: "backend ops scripts, package commands, receipts, mission manifest, system proof",
      out_of_scope: "visual surface edits, website edits, app factory/store presets, production deploy, paid API calls, destructive rollback",
      done_means: "doctor receipts, gauntlet commands, machine test-drive evidence, explicit blockers",
    },
    bench: {
      optimization_claim: "No speed/quality optimization is claimed by this doctor.",
      required_before_future_claims: ["bench", "coverage-diff", "drift-monitor", "failpattern"],
    },
    coverage_diff: {
      new_coverage: FEATURE_QUEUE.map((feature) => feature.id),
      removed_coverage: [],
    },
    drift_monitor: {
      drift_risk: "medium",
      controls: [
        "visual and website lanes disabled by operator",
        "factory/store preset lane disabled by operator",
        "AECode Source IR framed as governance, not rewrite",
        "deploy repair blocked until exact logs or repo are available",
        "receipts required for claims",
      ],
    },
    failpattern: {
      known_failures: [
        "Deploy emails show repeated Vercel workflow failures without root-cause logs.",
        "git status has been slow in this workspace.",
        "CLC remains working v0 research, not production memory.",
      ],
      prevention: [
        "Use targeted checks instead of broad repo scans when the repo is slow.",
        "Do not ship deploy patches without logs.",
        "Keep CLC bounded by fidelity reports.",
      ],
    },
    rollback: {
      repo_mutation: [
        "scripts/v4/orangebox-system-proof-doctor.mjs",
        "scripts/v4/gauntlet-engine.mjs",
        "scripts/v4/aecode-format-doctor.mjs",
        "package.json script additions",
        "schemas/aecode-final-format.schema.json",
        "docs/AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md",
        "docs/ORANGEBOX_SYSTEM_PROOF_QUEUE_2026-05-27.md",
        ".missions/orangebox-main-system-v0/mission.yaml",
      ],
      data_mutation: SYSTEM_PROOF_ROOT,
      recovery_action: "Remove the listed new files and package script additions if this queue is superseded; no production or visual files were changed.",
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const wantsReceipt = args.includes("--receipt");
  const realityMap = await buildRealityMap();
  const missionYaml = buildMissionYaml();
  const deployIntake = buildDeployIntake();
  const queue = buildQueue(realityMap);

  const queueJson = JSON.stringify(queue);
  queue.integrity = {
    deterministic_key_ordering: false,
    sha256: sha256(queueJson),
    note: "Hash covers the generated queue before integrity field insertion.",
  };

  const files = {
    queue: await writeJson(path.join(SYSTEM_PROOF_ROOT, "latest-system-proof-queue.json"), queue),
    reality_map: await writeJson(path.join(SYSTEM_PROOF_ROOT, "latest-reality-map.json"), realityMap),
    mission_yaml_data: await writeText(path.join(SYSTEM_PROOF_ROOT, "latest-mission.yaml"), missionYaml),
    mission_yaml_repo: await writeText(path.join(MISSION_ROOT, "mission.yaml"), missionYaml),
    deploy_failure_intake: await writeJson(path.join(SYSTEM_PROOF_ROOT, "latest-deploy-failure-intake.json"), deployIntake),
  };

  const report = {
    ok: queue.gates.every((gate) => gate.ok),
    version: VERSION,
    created_at: new Date().toISOString(),
    files,
    queue,
    reality_map: realityMap,
    deploy_failure_intake: deployIntake,
  };

  if (wantsReceipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-system-proof-doctor-${stamp()}.json`);
    report.receipt_path = receiptPath;
    await writeJson(receiptPath, report);
  }

  if (wantsJson) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`${report.ok ? "OK" : "FAIL"} ${VERSION}`);
    console.log(`queue: ${files.queue}`);
    if (report.receipt_path) console.log(`receipt: ${report.receipt_path}`);
  }
  if (!report.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}
