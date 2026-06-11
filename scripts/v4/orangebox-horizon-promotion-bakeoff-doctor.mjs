#!/usr/bin/env bun
/*
  orangebox-horizon-promotion-bakeoff-doctor.mjs

  Turns horizon-review candidates into a promotion/bakeoff matrix. This is not
  an installer and it never promotes a tool. It checks local binaries,
  dependencies, receipts, and Orangebox boundaries so new alpha tools cannot be
  called active just because they sounded useful in chat.
*/

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "horizon-bakeoff");
const receiptDir = path.join(repoRoot, "receipts");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function latestByPrefix(root, prefix) {
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

function latestV3Receipt(fragment) {
  const root = path.join(dataRoot, "v3", "receipts");
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.includes(fragment) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function commandProbe(binary) {
  try {
    const stdout = execFileSync("where.exe", [binary], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 3000,
      windowsHide: true,
    });
    const paths = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    return { binary, found: paths.length > 0, paths, first: paths[0] || null };
  } catch (error) {
    return { binary, found: false, paths: [], first: null, error: String(error?.message || error) };
  }
}

function anyProbe(binaries) {
  const probes = binaries.map(commandProbe);
  return {
    found: probes.some((probe) => probe.found),
    first_found: probes.find((probe) => probe.found)?.first || null,
    probes,
  };
}

function toolCards() {
  const file = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
  const raw = readJson(file, []);
  const cards = Array.isArray(raw) ? raw : raw.tools || raw.cards || [];
  return { file, cards };
}

function card(cards, id) {
  return cards.find((item) => item.id === id) || null;
}

function pkgFacts() {
  const file = path.join(repoRoot, "package.json");
  const pkg = readJson(file, {});
  return {
    file,
    scripts: pkg.scripts || {},
    deps: { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) },
  };
}

function receiptEvidence(file) {
  const parsed = readJson(file, null);
  return {
    path: file,
    exists: exists(file),
    ok: parsed?.ok === true,
    status: parsed?.status || parsed?.summary?.status || null,
  };
}

function candidate(row) {
  const blockers = row.blockers.filter(Boolean);
  const proofs = row.proofs || [];
  const requiredProofsGreen = proofs.filter((proof) => proof.required !== false).every((proof) => proof.ok === true);
  const promotable = row.intentional_non_promotion === true ? false : blockers.length === 0 && requiredProofsGreen;
  return {
    ...row,
    blockers,
    required_proofs_green: requiredProofsGreen,
    promotable_now: promotable,
    status: promotable ? "PROMOTABLE_AFTER_OPERATOR_APPROVAL" : row.status,
  };
}

async function main() {
  const startedAt = new Date();
  const pkg = pkgFacts();
  const { file: cardsFile, cards } = toolCards();

  const horizonPath = path.join(dataRoot, "horizon-review", "latest-horizon-review.json");
  const elysiaLatencyPath = path.join(dataRoot, "api-bakeoff", "latest-elysia-rail-latency-bakeoff.json");
  const visualPath = path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json");
  const headlessImagePath = path.join(dataRoot, "visual-artifacts", "runtime", "headless-image", "latest-headless-image-runtime.json");
  const headlessDesignPath = path.join(dataRoot, "visual-artifacts", "runtime", "headless-design", "latest-headless-design-runtime.json");
  const headlessAudioPath = path.join(dataRoot, "visual-artifacts", "runtime", "headless-audio", "latest-headless-audio-runtime.json");
  const headlessAnimationPath = path.join(dataRoot, "visual-artifacts", "runtime", "headless-animation", "latest-headless-animation-runtime.json");
  const gooseRuntimePath = path.join(dataRoot, "goose", "runtime", "latest-goose-runtime.json");
  const gooseGhostTaskPath = path.join(dataRoot, "goose", "ghost-task", "latest-goose-ghost-task.json");
  const openJarvisEvalPath = path.join(dataRoot, "openjarvis", "latest-openjarvis-eval.json");
  const openJarvisRuntimePath = path.join(dataRoot, "openjarvis", "runtime", "latest-openjarvis-runtime.json");
  const toolmeshPath = path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json");
  const projectPath = path.join(dataRoot, "reports", "project", "latest-project-report.json");
  const openclawPath = path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json");

  const horizon = readJson(horizonPath, null);
  const visual = readJson(visualPath, null);
  const headlessImage = readJson(headlessImagePath, null);
  const headlessDesign = readJson(headlessDesignPath, null);
  const headlessAudio = readJson(headlessAudioPath, null);
  const headlessAnimation = readJson(headlessAnimationPath, null);
  const gooseRuntime = readJson(gooseRuntimePath, null);
  const gooseGhostTask = readJson(gooseGhostTaskPath, null);
  const openJarvisEval = readJson(openJarvisEvalPath, null);
  const openJarvisRuntime = readJson(openJarvisRuntimePath, null);
  const toolmesh = readJson(toolmeshPath, null);
  const project = readJson(projectPath, null);
  const openclaw = readJson(openclawPath, null);

  const receipts = {
    elysia: receiptEvidence(latestV3Receipt("api-bridge-doctor")),
    elysiaLatency: receiptEvidence(elysiaLatencyPath),
    goose: receiptEvidence(latestV3Receipt("goose-envelope")),
    gooseRuntime: receiptEvidence(latestV3Receipt("goose-runtime-doctor")),
    gooseGhostTask: receiptEvidence(gooseGhostTaskPath),
    openjarvis: receiptEvidence(latestV3Receipt("openjarvis-eval-doctor")),
    openjarvisLatest: receiptEvidence(openJarvisEvalPath),
    openjarvisRuntime: receiptEvidence(openJarvisRuntimePath),
    context7: receiptEvidence(latestV3Receipt("mcp-context7-docs-lane")),
    visual: receiptEvidence(visualPath),
    headlessImage: receiptEvidence(headlessImagePath),
    headlessDesign: receiptEvidence(headlessDesignPath),
    headlessAudio: receiptEvidence(headlessAudioPath),
    headlessAnimation: receiptEvidence(headlessAnimationPath),
    toolmesh: receiptEvidence(toolmeshPath),
    openclaw: receiptEvidence(openclawPath),
    codexaRemote: receiptEvidence(latestByPrefix(receiptDir, "orangebox-codexa-remote-runtime-proof-")),
    inference: receiptEvidence(latestByPrefix(receiptDir, "orangebox-inference-acceleration-doctor-")),
  };

  const binaries = {
    bun: anyProbe(["bun"]),
    node: anyProbe(["node"]),
    git: anyProbe(["git"]),
    python: anyProbe(["python", "py"]),
    ollama: anyProbe(["ollama"]),
    goose: anyProbe(["goose"]),
    continue: anyProbe(["continue"]),
    context7: anyProbe(["context7"]),
    hermes: anyProbe(["hermes"]),
    ffmpeg: anyProbe(["ffmpeg"]),
    blender: anyProbe(["blender"]),
    inkscape: anyProbe(["inkscape"]),
    gimp: anyProbe(["gimp", "gimp-console"]),
    obs: anyProbe(["obs64", "obs64.exe", "obs"]),
    kdenlive: anyProbe(["kdenlive"]),
    audacity: anyProbe(["audacity"]),
  };

  const hermesPackPresent = exists(path.join(repoRoot, "scripts", "v4", "hermes", "hermes-doctor.mjs"));
  const elysiaLatency = readJson(elysiaLatencyPath, null);
  const elysiaLatencyGreen = elysiaLatency?.status === "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN"
    && elysiaLatency?.ok === true
    && elysiaLatency?.benchmark?.latency_parity_green === true
    && elysiaLatency?.promotion?.default_api_replacement_approved === false;
  const visualArtifactPipelineReady = visual?.summary?.visual_artifact_pipeline_ready === true;
  const headlessImageRuntimeReady = headlessImage?.ok === true && headlessImage?.runtime_ready === true && headlessImage?.status === "ORANGEBOX_HEADLESS_IMAGE_RUNTIME_GREEN";
  const headlessDesignRuntimeReady = headlessDesign?.ok === true && headlessDesign?.runtime_ready === true && headlessDesign?.status === "ORANGEBOX_HEADLESS_DESIGN_RUNTIME_GREEN";
  const headlessAudioRuntimeReady = headlessAudio?.ok === true && headlessAudio?.runtime_ready === true && headlessAudio?.status === "ORANGEBOX_HEADLESS_AUDIO_RUNTIME_GREEN";
  const headlessAnimationRuntimeReady = headlessAnimation?.ok === true && headlessAnimation?.runtime_ready === true && headlessAnimation?.status === "ORANGEBOX_HEADLESS_ANIMATION_RUNTIME_GREEN";
  const visualRuntimeReadyLanes = Number(visual?.summary?.runtime_ready_lanes || 0);
  const horizonReady = horizon?.ok === true && horizon?.status === "ORANGEBOX_HORIZON_REVIEW_READY";
  const toolmeshReady = toolmesh?.ok === true && toolmesh?.checks?.execution_blocked_until_promoted === true;

  const candidates = [
    candidate({
      id: "bun_elysia_api_bridge",
      wave: "wave_0_active_backend_speed",
      status: elysiaLatencyGreen ? "BENCHMARK_GREEN_SIDECAR_NOT_DEFAULT" : "BENCHMARK_READY_NOT_DEFAULT",
      current_role: "Low-latency Bun/Elysia sidecar API bridge.",
      next_proof_command: "npm.cmd run v3:api:doctor && npm.cmd run v3:api:bakeoff",
      proofs: [
        { id: "bun_binary", ok: binaries.bun.found, detail: binaries.bun.first_found },
        { id: "elysia_dependency", ok: Boolean(pkg.deps.elysia), detail: pkg.deps.elysia || null },
        { id: "api_bridge_receipt", ok: receipts.elysia.ok, detail: receipts.elysia.status },
        { id: "latency_bakeoff_receipt", ok: elysiaLatencyGreen, detail: receipts.elysiaLatency.status },
      ],
      blockers: [
        receipts.elysia.ok ? null : "Run v3:api:doctor and capture the receipt.",
        elysiaLatencyGreen ? null : "Needs apples-to-apples latency parity benchmark before replacing existing rails.",
        "Default replacement still needs route parity, rollback, and operator approval.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "goose_executor",
      wave: "wave_1_hands_executor_bakeoff",
      status: gooseGhostTask?.status === "GOOSE_GHOST_TASK_BOUNDED_PROOF_GREEN"
        ? "RUNTIME_FOUND_BOUNDED_GHOST_TASK_GREEN_PROVIDER_GATED"
        : binaries.goose.found
          ? "RUNTIME_FOUND_ENVELOPE_READY_NEEDS_GHOST_TASK"
          : "ENVELOPE_READY_RUNTIME_MISSING",
      current_role: "Possible executor hands behind ghost worktree/path/command/receipt envelope.",
      next_proof_command: "npm.cmd run v3:goose:envelope && npm.cmd run v3:goose:runtime && npm.cmd run v3:goose:ghost-task",
      proofs: [
        { id: "toolmesh_card", ok: Boolean(card(cards, "goose")), detail: card(cards, "goose")?.lab || null },
        { id: "goose_envelope_receipt", ok: receipts.goose.ok, detail: receipts.goose.status },
        { id: "goose_binary", ok: binaries.goose.found, detail: binaries.goose.first_found },
        { id: "goose_runtime_receipt", ok: receipts.gooseRuntime.ok, detail: receipts.gooseRuntime.status },
        { id: "goose_run_surface", ok: gooseRuntime?.runtime?.run_surface_ready === true, detail: gooseRuntime?.runtime?.version || null },
        { id: "goose_ghost_guards", ok: gooseRuntime?.ghost_task?.ready_for_bounded_live_task === true, detail: gooseRuntime?.ghost_task?.path || null },
        { id: "goose_bounded_ghost_task", ok: gooseGhostTask?.status === "GOOSE_GHOST_TASK_BOUNDED_PROOF_GREEN", detail: gooseGhostTask?.ghost_task?.task_path || null },
        { id: "goose_strongarm_checkmate_evidence", ok: gooseGhostTask?.evidence?.strongarm?.ok === true && gooseGhostTask?.evidence?.checkmate?.ok === true, detail: gooseGhostTask?.status || null },
      ],
      blockers: [
        binaries.goose.found ? null : "Goose binary is not proven on this machine.",
        receipts.goose.ok ? null : "Goose envelope receipt is missing.",
        receipts.gooseRuntime.ok ? null : "Goose runtime doctor receipt is missing.",
        gooseRuntime?.runtime?.provider_configured === true ? null : "Goose provider/model is not configured through an Orangebox-approved rail.",
        gooseGhostTask?.status === "GOOSE_GHOST_TASK_BOUNDED_PROOF_GREEN" ? null : "Needs one bounded ghost-worktree task with STRONGARM/Checkmate receipts before execution promotion.",
        "Needs one true live Goose task after approved provider/model configuration before execution promotion.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "obox_jarvis_openjarvis",
      wave: "wave_1_routing_efficiency_bakeoff",
      status: "EVAL_READY_RUNTIME_NOT_PROMOTED",
      current_role: "OBOX Jarvis/OpenJarvis-style efficiency/spec harness plus runtime-reality gate for TriLane, not router authority.",
      next_proof_command: "npm.cmd run v3:openjarvis:doctor && npm.cmd run v3:openjarvis:runtime",
      proofs: [
        { id: "openjarvis_eval_receipt", ok: receipts.openjarvis.ok, detail: receipts.openjarvis.status },
        { id: "openjarvis_latest_scorecard", ok: receipts.openjarvisLatest.ok, detail: receipts.openjarvisLatest.status },
        { id: "openjarvis_runtime_reality_receipt", ok: openJarvisRuntime?.ok === true && /OBOX_JARVIS_RUNTIME_/.test(openJarvisRuntime?.status || ""), detail: openJarvisRuntime?.status || null },
        { id: "openjarvis_same_task_manifest_ready", ok: openJarvisRuntime?.same_task_bakeoff?.manifest_ready === true && exists(openJarvisRuntime?.same_task_bakeoff?.manifest_path), detail: openJarvisRuntime?.same_task_bakeoff?.manifest_path || null },
        { id: "trilane_baseline_comparison", ok: openJarvisEval?.comparison?.baseline_score >= 0.85, detail: openJarvisEval?.comparison?.status || null },
        { id: "five_primitive_coverage", ok: openJarvisEval?.comparison?.primitive_coverage_score >= 0.8, detail: openJarvisEval?.comparison?.primitive_coverage_score ?? null },
        { id: "router_not_promoted", ok: openJarvisEval?.runtime_truth?.default_router_approved === false && openJarvisEval?.promotion?.promotable_now === false, detail: "promotion remains gated" },
        { id: "runtime_not_promoted", ok: openJarvisRuntime?.constraints?.default_router_promoted === false && openJarvisRuntime?.constraints?.live_runtime_execution_attempted === false, detail: openJarvisRuntime?.promotion?.reason || null },
        { id: "five_primitive_mapping_present", ok: horizon?.candidates?.some((item) => item.id === "openjarvis_eval" && item.orangebox_mapping), detail: "horizon candidate mapping" },
      ],
      blockers: [
        receipts.openjarvis.ok ? null : "Run v3:openjarvis:doctor.",
        receipts.openjarvisLatest.ok ? null : "OpenJarvis latest scorecard is missing.",
        openJarvisRuntime?.ok === true ? null : "Run v3:openjarvis:runtime so runtime truth is explicit.",
        openJarvisRuntime?.same_task_bakeoff?.manifest_ready === true ? null : "OpenJarvis same-task bakeoff manifest is missing.",
        openJarvisEval?.comparison?.baseline_score >= 0.85 ? null : "Current TriLane baseline score is not strong enough for a useful OpenJarvis comparison.",
        openJarvisRuntime?.runtime_truth?.runtime_found === true ? null : "OpenJarvis runtime itself is not installed/configured; current runtime proof is a gated reality check plus bakeoff manifest.",
        "Needs one direct same-task runtime bakeoff before any routing promotion.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "context7_docs_hydration",
      wave: "wave_1_readonly_context_bakeoff",
      status: "CONTRACT_READY_NOT_INSTALLED",
      current_role: "Read-only docs hydration lane after MCP quarantine.",
      next_proof_command: "npm.cmd run v3:mcp:doctor && npm.cmd run mcp:doctor",
      proofs: [
        { id: "context7_contract_receipt", ok: receipts.context7.ok, detail: receipts.context7.status },
        { id: "mcp_quarantine_green", ok: project?.evidence?.mcp_doctor?.status === "MCP_QUARANTINE_GREEN", detail: project?.evidence?.mcp_doctor?.status || null },
        { id: "context7_binary_optional", ok: binaries.context7.found, detail: binaries.context7.first_found, required: false },
      ],
      blockers: [
        receipts.context7.ok ? null : "Run v3:mcp:doctor.",
        "Needs quarantined read-only install proof and output cap before always-on docs hydration.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "hermes_outer_orchestrator",
      wave: "wave_1_personal_agent_shell_bakeoff",
      status: hermesPackPresent ? "PACK_PRESENT_NOT_INSTALLED_OR_AUTHORIZED" : "PACK_MISSING",
      current_role: "Optional outer personal-agent shell candidate; cannot own Orangebox authority.",
      next_proof_command: "future hermes doctor/status receipt",
      proofs: [
        { id: "hermes_pack_present", ok: hermesPackPresent, detail: path.join(repoRoot, "scripts", "v4", "hermes") },
        { id: "hermes_binary", ok: binaries.hermes.found, detail: binaries.hermes.first_found, required: false },
      ],
      blockers: [
        hermesPackPresent ? null : "Hermes pack is missing.",
        "Needs local install proof, sandbox proof, no-hidden-startup proof, and authority-boundary receipt.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "openclaw_retirement",
      wave: "wave_0_retirement_guard",
      status: openclaw?.status === "OPENCLAW_STARTUP_RETIRED" ? "RETIRED_GUARD_GREEN" : "RETIREMENT_NOT_PROVEN",
      current_role: "Legacy recovery/retirement only.",
      next_proof_command: "npm.cmd run openclaw:retire:dry",
      proofs: [
        { id: "startup_retired_receipt", ok: openclaw?.status === "OPENCLAW_STARTUP_RETIRED", detail: openclaw?.status || null },
      ],
      blockers: [
        openclaw?.status === "OPENCLAW_STARTUP_RETIRED" ? null : "OpenClaw retirement receipt is not green.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "visual_runtime_toolmesh",
      wave: "wave_2_codexa_visual_runtime_promotion",
      status: visual?.visual_ready === true ? "BASELINE_VISUAL_RUNTIME_READY" : (headlessImageRuntimeReady || headlessDesignRuntimeReady || headlessAudioRuntimeReady || headlessAnimationRuntimeReady) ? "PARTIAL_RUNTIME_READY_BASELINE_LABS" : "CONTROL_READY_RUNTIME_NOT_PROMOTED",
      current_role: "Image/video/audio/design runtime lane with artifact vault and sample receipts.",
      next_proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:artifact-smoke && npm.cmd run visual:runtime:headless-image && npm.cmd run visual:runtime:headless-design && npm.cmd run visual:runtime:headless-audio && npm.cmd run visual:runtime:headless-animation && npm.cmd run visual:readiness",
      proofs: [
        { id: "visual_readiness_receipt", ok: receipts.visual.ok, detail: receipts.visual.status },
        { id: "artifact_pipeline_ready", ok: visualArtifactPipelineReady, detail: visual?.summary?.smoke_artifact_path || null },
        { id: "headless_image_runtime_ready", ok: headlessImageRuntimeReady, detail: headlessImage?.artifact?.artifact_path || null },
        { id: "headless_design_runtime_ready", ok: headlessDesignRuntimeReady, detail: headlessDesign?.artifact?.artifact_path || null },
        { id: "headless_audio_runtime_ready", ok: headlessAudioRuntimeReady, detail: headlessAudio?.artifact?.artifact_path || null },
        { id: "headless_animation_runtime_ready", ok: headlessAnimationRuntimeReady, detail: headlessAnimation?.artifact?.artifact_path || null },
        { id: "visual_cards_present", ok: Number(visual?.summary?.visual_tool_cards || 0) >= 23, detail: visual?.summary?.visual_tool_cards || null },
        { id: "ffmpeg_binary", ok: binaries.ffmpeg.found, detail: binaries.ffmpeg.first_found, required: false },
        { id: "blender_binary", ok: binaries.blender.found, detail: binaries.blender.first_found, required: false },
        { id: "inkscape_binary", ok: binaries.inkscape.found, detail: binaries.inkscape.first_found, required: false },
      ],
      blockers: [
        visualArtifactPipelineReady ? null : "Visual artifact pipeline is not green.",
        (headlessImageRuntimeReady || headlessDesignRuntimeReady || headlessAudioRuntimeReady || headlessAnimationRuntimeReady) ? null : "No promoted visual runtime has install proof plus generated/edited artifact receipt.",
        visual?.visual_ready === true ? "Baseline four-lane runtime is ready; AI image generators, external codecs, GUI design tools, and transcription/editing tools still need their own promotion receipts before default use." : `Only ${visualRuntimeReadyLanes}/4 visual runtime lanes are promoted; baseline proof does not promote AI image/design generators, external codecs, transcription engines, or GUI tools.`,
        "Next: promote an AI image generator, audio transcription lane, or video/export lane after install proof, sample artifact receipt, hardware lock, and rollback.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "littleorange_void_continue_surface",
      wave: "wave_2_visual_surface_reference_only",
      status: "REFERENCE_AND_DOCTOR_READY_NOT_FRONTEND_RELEASE",
      current_role: "LittleOrange/Void/Continue ideas for the separate visual code chat surface.",
      next_proof_command: "npm.cmd run littleorange:doctor && npm.cmd run coding-lab:doctor",
      proofs: [
        { id: "littleorange_doctor_script", ok: Boolean(pkg.scripts["littleorange:doctor"]), detail: pkg.scripts["littleorange:doctor"] || null },
        { id: "continue_card", ok: Boolean(card(cards, "continue")), detail: card(cards, "continue")?.lab || null },
        { id: "continue_binary", ok: binaries.continue.found, detail: binaries.continue.first_found, required: false },
      ],
      blockers: [
        "Frontend release proof belongs to the separate visual lane.",
        "Continue must beat Checkmate/STRONGARM on one ghost-worktree AI-check bakeoff before adoption.",
        "Void is a reference architecture, not a base fork decision in Ops.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "memory_and_agent_framework_candidates",
      wave: "wave_3_optional_architecture_bakeoff",
      status: "WATCHLIST_NOT_INSTALLED",
      current_role: "libSQL vectors and Mastra are optional acceleration/framework candidates.",
      next_proof_command: "future k3 vector benchmark and agent-framework bakeoff doctors",
      proofs: [
        { id: "libsql_dependency", ok: Boolean(pkg.deps["@libsql/client"] || pkg.deps.libsql), detail: pkg.deps["@libsql/client"] || pkg.deps.libsql || null, required: false },
        { id: "mastra_dependency", ok: Boolean(pkg.deps["@mastra/core"] || pkg.deps.mastra), detail: pkg.deps["@mastra/core"] || pkg.deps.mastra || null, required: false },
      ],
      blockers: [
        "libSQL vectors need recall-quality benchmark and raw-ledger pointer preservation.",
        "Mastra must beat current TriLane complexity and eval scores before dependency adoption.",
      ],
      intentional_non_promotion: true,
    }),
    candidate({
      id: "codexa_gpu_acceleration_candidates",
      wave: "wave_4_codexa_gpu_only",
      status: "CODEXA_GPU_ALPHA_NOT_N150",
      current_role: "TileLang, TileKernels, DFlash, vLLM/SGLang acceleration candidates for Codexa only.",
      next_proof_command: "npm.cmd run inference:doctor",
      proofs: [
        { id: "codexa_remote_receipt", ok: receipts.codexaRemote.ok, detail: receipts.codexaRemote.status },
        { id: "inference_receipt", ok: receipts.inference.ok, detail: receipts.inference.status },
      ],
      blockers: [
        "Requires Codexa GPU/CUDA/runtime benchmark and correctness receipt.",
        "Not a command-host/N150 install lane.",
      ],
      intentional_non_promotion: true,
    }),
  ];

  const waves = [...new Set(candidates.map((item) => item.wave))].map((wave) => {
    const rows = candidates.filter((item) => item.wave === wave);
    return {
      id: wave,
      candidates: rows.map((item) => item.id),
      promotable_now: rows.filter((item) => item.promotable_now).length,
      blockers: rows.flatMap((item) => item.blockers.map((blocker) => ({ candidate: item.id, blocker }))),
    };
  });

  const failures = [];
  if (!horizonReady) failures.push("horizon_review_not_green");
  if (!toolmeshReady) failures.push("toolmesh_execution_blocking_not_green");
  if (!visualArtifactPipelineReady) failures.push("visual_artifact_pipeline_not_green");
  if (candidates.length < 10) failures.push("candidate_matrix_too_small");
  if (candidates.some((item) => !item.next_proof_command)) failures.push("candidate_missing_next_proof_command");
  if (candidates.some((item) => !Array.isArray(item.blockers))) failures.push("candidate_missing_blockers");
  if (candidates.some((item) => item.id !== "openclaw_retirement" && item.promotable_now)) failures.push("candidate_auto_promoted_without_operator_gate");

  const report = {
    ok: failures.length === 0,
    schema_version: "orangebox.horizon_promotion_bakeoff.v1",
    generated_at: new Date().toISOString(),
    status: failures.length === 0 ? "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_READY" : "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_NEEDS_WORK",
    doctrine: [
      "Reviewed is not promoted.",
      "Installed is not trusted.",
      "Trusted is not default.",
      "Default requires benchmark, receipt, rollback, and operator approval.",
      "Visual runtime truth must be artifact-backed.",
      "Goose can be hands; OBOX Jarvis can be eval/spec brain; TriLane and receipts remain authority.",
    ],
    source_files: {
      package_json: pkg.file,
      tool_cards: cardsFile,
      horizon_review: horizonPath,
      elysia_latency_bakeoff: elysiaLatencyPath,
      goose_runtime: gooseRuntimePath,
      goose_ghost_task: gooseGhostTaskPath,
      openjarvis_eval: openJarvisEvalPath,
      openjarvis_runtime: openJarvisRuntimePath,
      headless_design_runtime: headlessDesignPath,
      headless_audio_runtime: headlessAudioPath,
      headless_animation_runtime: headlessAnimationPath,
      visual_readiness: visualPath,
      toolmesh_doctor: toolmeshPath,
    },
    summary: {
      candidates_total: candidates.length,
      waves_total: waves.length,
      promotable_now: candidates.filter((item) => item.promotable_now).length,
      intentional_non_promotions: candidates.filter((item) => item.intentional_non_promotion === true).length,
      runtime_missing: candidates.filter((item) => /MISSING|NOT_INSTALLED|NOT_PROMOTED|NOT_N150/.test(item.status)).length,
      elysia_latency_bakeoff_green: elysiaLatencyGreen,
      elysia_p95_ms: elysiaLatency?.benchmark?.elysia_health_p95_ms ?? null,
      current_api_comparison_p95_ms: elysiaLatency?.benchmark?.current_comparison_p95_ms ?? null,
      horizon_review_green: horizonReady,
      toolmesh_execution_blocked_until_promoted: toolmeshReady,
      visual_artifact_pipeline_ready: visualArtifactPipelineReady,
      visual_ready: visual?.visual_ready === true,
      visual_runtime_ready_lanes: visualRuntimeReadyLanes,
      headless_image_runtime_ready: headlessImageRuntimeReady,
      headless_design_runtime_ready: headlessDesignRuntimeReady,
      headless_audio_runtime_ready: headlessAudioRuntimeReady,
      headless_animation_runtime_ready: headlessAnimationRuntimeReady,
      goose_binary_found: binaries.goose.found,
      goose_runtime_status: gooseRuntime?.status || null,
      goose_provider_configured: gooseRuntime?.runtime?.provider_configured ?? null,
      goose_ghost_task_ready: gooseRuntime?.ghost_task?.ready_for_bounded_live_task ?? null,
      goose_bounded_ghost_task_green: gooseGhostTask?.status === "GOOSE_GHOST_TASK_BOUNDED_PROOF_GREEN",
      goose_live_agent_execution_attempted: gooseGhostTask?.constraints?.live_agent_execution_attempted ?? null,
      openjarvis_baseline_score: openJarvisEval?.comparison?.baseline_score ?? null,
      openjarvis_primitive_coverage_score: openJarvisEval?.comparison?.primitive_coverage_score ?? null,
      openjarvis_runtime_installed: openJarvisEval?.runtime_truth?.openjarvis_runtime_installed ?? null,
      openjarvis_runtime_status: openJarvisRuntime?.status || null,
      openjarvis_runtime_found: openJarvisRuntime?.runtime_truth?.runtime_found ?? null,
      openjarvis_same_task_manifest_ready: openJarvisRuntime?.same_task_bakeoff?.manifest_ready ?? null,
      openjarvis_runtime_promoted: openJarvisRuntime?.constraints?.default_router_promoted ?? null,
      openjarvis_router_approved: openJarvisEval?.runtime_truth?.default_router_approved ?? null,
      openjarvis_eval_receipt_green: receipts.openjarvis.ok,
      hermes_pack_present: hermesPackPresent,
      openclaw_retired: openclaw?.status === "OPENCLAW_STARTUP_RETIRED",
      report_hash: sha256(JSON.stringify({ candidates, waves })),
    },
    receipts,
    binaries,
    waves,
    candidates,
    failures,
    next_actions_ranked: [
      "Run horizon:bakeoff after horizon:review whenever new alpha tools are proposed.",
      "Do Elysia rail latency benchmark before default transport changes.",
      "Install/prove Goose only inside a ghost-worktree execution bakeoff.",
      "Use OBOX Jarvis/OpenJarvis as a TriLane efficiency/spec evaluator first.",
      "Promote one visual runtime on the correct hardware only after sample artifact receipts.",
      "Keep OpenClaw retired; Hermes remains optional until local install and no-hidden-authority receipts exist.",
    ],
    rollback: {
      repo_mutation: "horizon bakeoff doctor/package/gate wiring only",
      data_mutation: outDir,
      recovery_action: "Remove horizon:bakeoff script wiring and generated horizon-bakeoff receipts if superseded.",
    },
    duration_ms: Date.now() - startedAt.getTime(),
  };

  const latestPath = path.join(outDir, "latest-horizon-promotion-bakeoff.json");
  await writeJson(latestPath, report);
  report.latest_path = latestPath;

  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-horizon-promotion-bakeoff-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath });
    report.receipt_path = receiptPath;
  }

  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_HORIZON_PROMOTION_BAKEOFF_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
