#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "visual-production-readiness");
const receiptDir = path.join(repoRoot, "receipts");
const visualLabs = ["image-lab", "video-lab", "audio-lab", "design-lab"];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function loadToolCards() {
  const file = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
  const raw = readJson(file, []);
  const cards = Array.isArray(raw) ? raw : raw.tools || raw.cards || [];
  return { file, cards };
}

function latestLabDoctor(lab) {
  const file = path.join(dataRoot, "v3", "toolmesh", `latest-${lab}-doctor.json`);
  return { file, report: readJson(file, null) };
}

function latestArtifactVault() {
  const file = path.join(dataRoot, "visual-artifacts", "latest-visual-artifact-vault.json");
  return { file, report: readJson(file, null) };
}

function latestArtifactSmoke() {
  const file = path.join(dataRoot, "visual-artifacts", "latest-visual-artifact-smoke.json");
  return { file, report: readJson(file, null) };
}

function latestHeadlessImageRuntime() {
  const file = path.join(dataRoot, "visual-artifacts", "runtime", "headless-image", "latest-headless-image-runtime.json");
  return { file, report: readJson(file, null) };
}

function latestHeadlessDesignRuntime() {
  const file = path.join(dataRoot, "visual-artifacts", "runtime", "headless-design", "latest-headless-design-runtime.json");
  return { file, report: readJson(file, null) };
}

function latestHeadlessAudioRuntime() {
  const file = path.join(dataRoot, "visual-artifacts", "runtime", "headless-audio", "latest-headless-audio-runtime.json");
  return { file, report: readJson(file, null) };
}

function latestHeadlessAnimationRuntime() {
  const file = path.join(dataRoot, "visual-artifacts", "runtime", "headless-animation", "latest-headless-animation-runtime.json");
  return { file, report: readJson(file, null) };
}

function summarizeLane(lab, cards, doctor, runtimeReceipt = null) {
  const laneCards = cards.filter((card) => card.lab === lab);
  const installedProbes = doctor?.summary?.installed_probe_count ?? 0;
  const promoted = laneCards.filter((card) => card.status === "promoted" || card.status === "installed").length;
  const candidates = laneCards.filter((card) => card.status === "candidate").length;
  const maxVram = doctor?.summary?.hardwareSummary?.maxVramRequiredGB ?? Math.max(0, ...laneCards.map((card) => card.hardwareProfile?.vramRequiredGB || 0));
  const llmUnloadCount = doctor?.summary?.hardwareSummary?.llmUnloadCount ?? laneCards.filter((card) => card.hardwareProfile?.requiresLLMUnload).length;
  const binaries = doctor?.binaryProbes || [];
  const controlPlaneGreen = doctor?.ok === true && doctor?.status === "GREEN";
  const runtimeReceiptGreen = runtimeReceipt?.ok === true && runtimeReceipt?.runtime_ready === true;
  const runtimeReady = controlPlaneGreen && promoted > 0 && runtimeReceiptGreen;
  return {
    lab,
    control_plane_green: controlPlaneGreen,
    runtime_ready: runtimeReady,
    cards: laneCards.length,
    candidates,
    promoted_or_installed_cards: promoted,
    installed_probe_count: installedProbes,
    binary_probe_note: doctor?.summary?.installed_probe_note || "No lab doctor receipt found.",
    max_vram_required_gb: maxVram,
    llm_unload_required_count: llmUnloadCount,
    execution_blocked_until_promoted: doctor?.checks?.execution_blocked_until_promoted === true,
    artifact_pointer_policy_declared: doctor?.checks?.artifact_pointer_policy_declared === true,
    immutable_template_gate: doctor?.checks?.immutable_templates_for_workflow_tools === true,
    not_runtime_ready_because: runtimeReady ? [] : [
      promoted === 0 ? "No visual tool card is promoted or installed." : null,
      installedProbes === 0 ? "No useful runtime binary/model install is proven by the latest lab doctor." : null,
      runtimeReceiptGreen ? null : "No promoted lab-specific generation/edit/render artifact receipt is present at this runtime layer yet.",
    ].filter(Boolean),
    runtime_receipt: runtimeReceipt ? {
      status: runtimeReceipt.status || null,
      path: runtimeReceipt.latest_path || null,
      artifact_path: runtimeReceipt.artifact?.artifact_path || null,
      sha256: runtimeReceipt.artifact?.sha256 || null,
      ai_generated_media: runtimeReceipt.artifact?.ai_generated_media ?? null,
      deterministic_renderer: runtimeReceipt.artifact?.deterministic_renderer ?? null,
    } : null,
    cards_by_id: laneCards.map((card) => ({
      id: card.id,
      name: card.name,
      status: card.status,
      phase: card.phase,
      role: card.orangeboxRole,
      execution_mode: card.executionMode,
      concurrency_lock: card.hardwareProfile?.concurrencyLock,
      rollback: card.rollback,
    })),
    binary_probes: binaries,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const { file: cardsFile, cards } = loadToolCards();
  const doctors = Object.fromEntries(visualLabs.map((lab) => {
    const latest = latestLabDoctor(lab);
    return [lab, latest];
  }));
  const artifactVault = latestArtifactVault();
  const artifactSmoke = latestArtifactSmoke();
  const headlessImageRuntime = latestHeadlessImageRuntime();
  const headlessDesignRuntime = latestHeadlessDesignRuntime();
  const headlessAudioRuntime = latestHeadlessAudioRuntime();
  const headlessAnimationRuntime = latestHeadlessAnimationRuntime();
  const artifactVaultReady = artifactVault.report?.ok === true
    && artifactVault.report?.status === "ORANGEBOX_VISUAL_ARTIFACT_VAULT_GREEN"
    && artifactVault.report?.vault_ready === true;
  const artifactSmokeReady = artifactSmoke.report?.ok === true
    && artifactSmoke.report?.status === "ORANGEBOX_VISUAL_ARTIFACT_SMOKE_GREEN"
    && artifactSmoke.report?.smoke_ready === true
    && artifactSmoke.report?.artifact?.mime_type === "image/png"
    && artifactSmoke.report?.artifact?.runtime_generated_media === false;
  const promotedRuntimeReceipts = {
    "image-lab": headlessImageRuntime.report,
    "video-lab": headlessAnimationRuntime.report,
    "audio-lab": headlessAudioRuntime.report,
    "design-lab": headlessDesignRuntime.report,
  };
  const lanes = visualLabs.map((lab) => summarizeLane(lab, cards, doctors[lab].report, promotedRuntimeReceipts[lab]));
  const allControlGreen = lanes.every((lane) => lane.control_plane_green);
  const anyRuntimeReady = lanes.some((lane) => lane.runtime_ready);
  const allRuntimeReady = lanes.every((lane) => lane.runtime_ready);
  const visualCards = cards.filter((card) => visualLabs.includes(card.lab));
  const generatedAt = new Date().toISOString();
  const report = {
    ok: true,
    schema_version: "orangebox.visual_production_readiness.v1",
    generated_at: generatedAt,
    status: allRuntimeReady
      ? "ORANGEBOX_VISUAL_PRODUCTION_RUNTIME_READY"
      : anyRuntimeReady
        ? "ORANGEBOX_VISUAL_PRODUCTION_PARTIAL_RUNTIME_READY"
        : "ORANGEBOX_VISUAL_PRODUCTION_CONTROL_READY_RUNTIME_NOT_PROMOTED",
    visual_ready: allRuntimeReady,
    control_plane_green: allControlGreen,
    runtime_ready: allRuntimeReady,
    doctrine: [
      "Visual, media, design, and artifact generation are Orangebox product lanes.",
      "This Ops lane may prove visual production readiness without editing the living frontend/dashboard.",
      "Tool cards are not execution permission.",
      "A visual tool is real only after install proof, sample artifact receipt, hardware lock, rollback path, and promotion gate.",
      "Visual-ready in Ops means routes, artifact vaults, locks, receipts, rollback, and truth reporting are ready; it does not mean the separate living frontend has been edited here.",
    ],
    source_files: {
      tool_cards: cardsFile,
      lab_doctors: Object.fromEntries(Object.entries(doctors).map(([lab, value]) => [lab, value.file])),
      artifact_vault: artifactVault.file,
      artifact_smoke: artifactSmoke.file,
      headless_image_runtime: headlessImageRuntime.file,
      headless_design_runtime: headlessDesignRuntime.file,
      headless_audio_runtime: headlessAudioRuntime.file,
      headless_animation_runtime: headlessAnimationRuntime.file,
    },
    summary: {
      visual_labs: visualLabs.length,
      visual_tool_cards: visualCards.length,
      control_green_lanes: lanes.filter((lane) => lane.control_plane_green).length,
      runtime_ready_lanes: lanes.filter((lane) => lane.runtime_ready).length,
      installed_probe_count: lanes.reduce((sum, lane) => sum + lane.installed_probe_count, 0),
      promoted_or_installed_cards: lanes.reduce((sum, lane) => sum + lane.promoted_or_installed_cards, 0),
      any_runtime_ready: anyRuntimeReady,
      artifact_vault_ready: artifactVaultReady,
      artifact_vault_status: artifactVault.report?.status || "missing",
      artifact_manifest_path: artifactVault.report?.proof_artifact?.manifest_path || null,
      artifact_pointer_only: artifactVault.report?.vault?.pointer_only === true,
      artifact_cleanup_policy_declared: Boolean(artifactVault.report?.vault?.cleanup_policy),
      artifact_smoke_ready: artifactSmokeReady,
      artifact_smoke_status: artifactSmoke.report?.status || "missing",
      smoke_artifact_path: artifactSmoke.report?.artifact?.artifact_path || null,
      smoke_artifact_sha256: artifactSmoke.report?.artifact?.sha256 || null,
      smoke_artifact_mime_type: artifactSmoke.report?.artifact?.mime_type || null,
      visual_artifact_pipeline_ready: artifactVaultReady && artifactSmokeReady,
      headless_image_runtime_ready: headlessImageRuntime.report?.ok === true && headlessImageRuntime.report?.runtime_ready === true,
      headless_image_runtime_status: headlessImageRuntime.report?.status || "missing",
      headless_image_artifact_path: headlessImageRuntime.report?.artifact?.artifact_path || null,
      headless_image_artifact_sha256: headlessImageRuntime.report?.artifact?.sha256 || null,
      headless_design_runtime_ready: headlessDesignRuntime.report?.ok === true && headlessDesignRuntime.report?.runtime_ready === true,
      headless_design_runtime_status: headlessDesignRuntime.report?.status || "missing",
      headless_design_artifact_path: headlessDesignRuntime.report?.artifact?.artifact_path || null,
      headless_design_artifact_sha256: headlessDesignRuntime.report?.artifact?.sha256 || null,
      headless_audio_runtime_ready: headlessAudioRuntime.report?.ok === true && headlessAudioRuntime.report?.runtime_ready === true,
      headless_audio_runtime_status: headlessAudioRuntime.report?.status || "missing",
      headless_audio_artifact_path: headlessAudioRuntime.report?.artifact?.artifact_path || null,
      headless_audio_artifact_sha256: headlessAudioRuntime.report?.artifact?.sha256 || null,
      headless_animation_runtime_ready: headlessAnimationRuntime.report?.ok === true && headlessAnimationRuntime.report?.runtime_ready === true,
      headless_animation_runtime_status: headlessAnimationRuntime.report?.status || "missing",
      headless_animation_artifact_path: headlessAnimationRuntime.report?.artifact?.artifact_path || null,
      headless_animation_artifact_sha256: headlessAnimationRuntime.report?.artifact?.sha256 || null,
      promoted_runtime_receipts: lanes.filter((lane) => lane.runtime_ready).map((lane) => ({
        lab: lane.lab,
        status: lane.runtime_receipt?.status || null,
        artifact_path: lane.runtime_receipt?.artifact_path || null,
        sha256: lane.runtime_receipt?.sha256 || null,
      })),
      cards_hash: sha256(JSON.stringify(visualCards)),
    },
    lanes,
    blockers: [
      anyRuntimeReady ? "ComfyUI/FLUX/Qwen Image/SDXL remain registered AI image candidates; the promoted image runtime is the local deterministic headless renderer." : "ComfyUI/FLUX/Qwen Image/SDXL are registered candidates, not promoted image runtimes.",
      headlessAnimationRuntime.report?.ok === true && headlessAnimationRuntime.report?.runtime_ready === true
        ? "Wan/LTX/DaVinci Resolve/Kdenlive/OBS remain registered video candidates; the promoted video-lab baseline is the local deterministic headless animation renderer."
        : "Wan/LTX/DaVinci Resolve/Kdenlive/OBS are registered candidates, not promoted video runtimes.",
      headlessAudioRuntime.report?.ok === true && headlessAudioRuntime.report?.runtime_ready === true
        ? "Whisper/Audacity/Demucs/UVR remain registered audio candidates; the promoted audio-lab baseline is the local deterministic headless WAV renderer."
        : "Whisper/Audacity/Demucs/UVR are registered candidates, not promoted audio runtimes.",
      headlessDesignRuntime.report?.ok === true && headlessDesignRuntime.report?.runtime_ready === true
        ? "Penpot/Inkscape/Krita/GIMP/Blender remain registered GUI/AI design candidates; the promoted design runtime is the local deterministic headless SVG exporter."
        : "Penpot/Inkscape/Krita/GIMP/Blender are registered candidates, not promoted design runtimes.",
      artifactVaultReady ? null : "No visual artifact vault promotion receipt is present in this doctor.",
      artifactSmokeReady ? null : "No deterministic visual artifact smoke receipt is present in this doctor.",
      anyRuntimeReady ? "No promoted AI generator sample receipt proves ComfyUI/FLUX/Qwen Image/SDXL/video/audio/design generation yet." : "No promoted AI generator sample receipt proves a real generated image/video/design/audio artifact yet.",
    ].filter(Boolean),
    readiness_levels: {
      control_plane: allControlGreen,
      artifact_pipeline: artifactVaultReady && artifactSmokeReady,
      headless_image_runtime: headlessImageRuntime.report?.ok === true && headlessImageRuntime.report?.runtime_ready === true,
      headless_design_runtime: headlessDesignRuntime.report?.ok === true && headlessDesignRuntime.report?.runtime_ready === true,
      headless_audio_runtime: headlessAudioRuntime.report?.ok === true && headlessAudioRuntime.report?.runtime_ready === true,
      headless_animation_runtime: headlessAnimationRuntime.report?.ok === true && headlessAnimationRuntime.report?.runtime_ready === true,
      ai_runtime_promoted: false,
      all_runtime_lanes_promoted: allRuntimeReady,
      separate_frontend_release: "separate_visual_lane",
    },
    recommended_promotion_order: [
      {
        rank: 1,
        lane: "image-lab",
        first_runtime: "ComfyUI + one baseline local model",
        why: "Lowest blast radius for proving prompt -> artifact pointer -> hash -> preview -> rollback.",
        pass_gate: "Install proof, immutable template, one sample image artifact receipt, GPU lock, timeout, cleanup policy.",
      },
      {
        rank: 2,
        lane: "design-lab",
        first_runtime: "Inkscape or Blender headless/export path before GUI automation",
        why: "Design/export can prove deterministic files without relying on fragile GUI control.",
        pass_gate: "Install proof, sample export receipt, artifact pointer, rollback, no repo mutation.",
      },
      {
        rank: 3,
        lane: "audio-lab",
        first_runtime: "Headless WAV proof, then Whisper transcription",
        why: "The baseline WAV renderer proves artifact rails; Whisper adds real transcription once installed and gated.",
        pass_gate: "Install proof, sample transcript receipt, output hash, privacy boundary.",
      },
      {
        rank: 4,
        lane: "video-lab",
        first_runtime: "Headless animation proof, then OBS/Kdenlive/ffmpeg export before generative video",
        why: "The baseline animation renderer proves motion artifact rails; video generation is heavier, so promote export/capture before Wan/LTX.",
        pass_gate: "Install proof, short clip artifact receipt, GPU/media lock, LLM unload policy, timeout, cleanup.",
      },
    ],
    next_waves: [
      {
        wave: "V0 truth hardening",
        action: "Keep this readiness doctor in the proof path so candidate tools cannot be mistaken for live visual power.",
        proof: "npm.cmd run visual:readiness",
      },
      {
        wave: "V1 artifact pipeline",
        action: artifactVaultReady && artifactSmokeReady
          ? "Artifact vault and deterministic PNG smoke are green; use this path for first promoted visual runtime sample receipts."
          : "Promote pointer-only artifact vault, deterministic smoke artifact, SHA-256 manifests, cleanup policy, and human-preview links before any generator runs.",
        proof: "npm.cmd run visual:artifact-vault && npm.cmd run visual:artifact-smoke",
      },
      {
        wave: "V2 image runtime",
        action: anyRuntimeReady
          ? "Headless image/design/audio/animation baseline runtimes may be promoted; next image step is ComfyUI or another AI generator with install proof, immutable template, sample render receipt, hardware lock, and rollback."
          : "Install or promote one local image path first, preferably the headless renderer before ComfyUI, with immutable templates and one sample render receipt.",
        proof: "npm.cmd run visual:runtime:headless-image && npm.cmd run visual:runtime:headless-design && npm.cmd run visual:runtime:headless-audio && npm.cmd run visual:runtime:headless-animation && npm.cmd run visual:readiness",
      },
      {
        wave: "V3 design workspace",
        action: "Promote Inkscape/Krita/GIMP/Blender only after workspace prep receipts and artifact pointer output.",
        proof: "design-lab doctor + sample export receipt",
      },
      {
        wave: "V4 video/audio runtime",
        action: "Promote video/audio after GPU lock, LLM unload policy, sample artifact receipt, and timeout guard.",
        proof: "video/audio lab doctors + artifact receipts",
      },
    ],
    result_line: allRuntimeReady
      ? "Baseline visual/media runtime is promoted across image, design, audio, and animation; AI generators, external codecs, GUI tools, and the separate frontend lane remain gated."
      : anyRuntimeReady
        ? "Visual production has promoted headless image/design runtimes, artifact vault, and deterministic smoke proof; AI visual generators plus video/audio runtime lanes are still gated."
      : artifactVaultReady && artifactSmokeReady
        ? "Visual production control plane, artifact vault, and deterministic artifact smoke are green, but AI runtime tools are not promoted yet."
        : artifactVaultReady
          ? "Visual production control plane and artifact vault are green, but runtime tools are not promoted yet."
        : "Visual production control plane is green, but runtime tools are not promoted yet.",
  };

  const latestPath = path.join(outDir, "latest-visual-production-readiness.json");
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-visual-production-readiness-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  report.latest_path = latestPath;
  if (args.includes("--json") || true) console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_VISUAL_READINESS_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
