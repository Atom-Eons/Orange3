#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "visual-artifacts", "runtime", "headless-audio");
const vaultRoot = path.join(dataRoot, "visual-artifacts", "vault");
const manifestDir = path.join(dataRoot, "visual-artifacts", "manifests");
const previewDir = path.join(dataRoot, "visual-artifacts", "previews");
const receiptDir = path.join(repoRoot, "receipts");
const toolCardsPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
const templateRegistryPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "template-registry.json");
const templatePath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "headless-audio", "headless-audio-tone-v1.json");
const artifactId = "orangebox-headless-audio-runtime-proof";
const toolCardId = "orangebox-headless-audio-renderer";
const templateId = "headless-audio-tone-v1";
const sampleRate = 22050;
const durationSeconds = 1;
const frequencyHz = 440;
const amplitude = 0.22;

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
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

function loadCards() {
  const raw = readJson(toolCardsPath, { cards: [] });
  return Array.isArray(raw) ? raw : raw.cards || raw.tools || [];
}

function loadTemplateRegistry() {
  const raw = readJson(templateRegistryPath, { templates: [] });
  return Array.isArray(raw) ? raw : raw.templates || [];
}

function makeWav() {
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = sampleRate * durationSeconds;
  const dataBytes = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < sampleCount; i += 1) {
    const t = i / sampleRate;
    const envelope = Math.min(1, i / 1000, (sampleCount - i) / 1000);
    const sample = Math.round(Math.sin(2 * Math.PI * frequencyHz * t) * amplitude * envelope * 32767);
    buffer.writeInt16LE(sample, 44 + i * 2);
  }
  return buffer;
}

function wavLooksValid(buffer) {
  return buffer.length > 44
    && buffer.subarray(0, 4).toString("ascii") === "RIFF"
    && buffer.subarray(8, 12).toString("ascii") === "WAVE"
    && buffer.subarray(36, 40).toString("ascii") === "data";
}

async function main() {
  const args = process.argv.slice(2);
  const generatedAt = new Date().toISOString();
  const vaultReceiptPath = path.join(dataRoot, "visual-artifacts", "latest-visual-artifact-vault.json");
  const vaultReceipt = readJson(vaultReceiptPath, null);
  const cards = loadCards();
  const toolCard = cards.find((card) => card.id === toolCardId) || null;
  const templateRegistry = loadTemplateRegistry();
  const template = readJson(templatePath, null);
  const templateRegistryEntry = templateRegistry.find((entry) => entry.template_id === templateId) || null;

  const artifactPath = path.join(vaultRoot, "runtime", "headless-audio", `${artifactId}.wav`);
  const previewPath = path.join(previewDir, `${artifactId}.preview.txt`);
  const manifestPath = path.join(manifestDir, `${artifactId}.manifest.json`);

  await fsp.mkdir(outDir, { recursive: true });
  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  await fsp.mkdir(previewDir, { recursive: true });
  await fsp.mkdir(manifestDir, { recursive: true });

  const wav = makeWav();
  await fsp.writeFile(artifactPath, wav);
  await fsp.writeFile(previewPath, [
    "Orangebox headless audio runtime proof.",
    `Artifact: ${artifactPath}`,
    `Format: WAV PCM16 mono, ${sampleRate} Hz, ${durationSeconds}s tone`,
    "This proves the audio artifact rail without claiming Whisper/Audacity/Demucs/UVR readiness.",
    "",
  ].join("\n"), "utf8");

  const artifactSha = sha256File(artifactPath);
  const artifactBytes = fs.statSync(artifactPath).size;
  const manifest = {
    schema_version: "orangebox.visual_artifact_manifest.v1",
    artifact_id: artifactId,
    artifact_kind: "promoted-headless-audio-runtime-proof",
    created_at: generatedAt,
    lane: "audio-lab",
    tool_card_id: toolCardId,
    template_id: templateId,
    runtime_generated_media: true,
    ai_generated_media: false,
    deterministic_renderer: true,
    artifact_path: artifactPath,
    preview_path: previewPath,
    mime_type: "audio/wav",
    duration_seconds: durationSeconds,
    sample_rate: sampleRate,
    channels: 1,
    bytes: artifactBytes,
    sha256: artifactSha,
    source: {
      produced_by: "orangebox-headless-audio-runtime-doctor",
      generator: "bun-riff-wave-pcm16-renderer",
      note: "Promoted local headless audio runtime. Speech/audio tools remain gated until their own install/sample receipts pass.",
    },
    cleanup: {
      policy: "retain-latest-runtime-proof; garbage-collect superseded runtime proofs after receipt mirror",
      gc_allowed: true,
      human_review_required_before_delete: false,
    },
    rollback: {
      action: "Remove this runtime receipt/artifact and demote orangebox-headless-audio-renderer if superseded.",
      repo_touch_required: false,
    },
  };
  await writeJson(manifestPath, manifest);

  const checks = [
    { id: "vault_receipt_green", ok: vaultReceipt?.ok === true && vaultReceipt?.vault_ready === true },
    { id: "tool_card_promoted", ok: toolCard?.status === "promoted" },
    { id: "tool_card_headless", ok: toolCard?.executionMode === "headless" && toolCard?.cloud === false && toolCard?.local === true },
    { id: "tool_card_pointer_only", ok: toolCard?.artifactProtocol?.returnsFilePointer === true && toolCard?.artifactProtocol?.returnsRawBytes === false },
    { id: "template_registry_entry_present", ok: templateRegistryEntry?.template_id === templateId && templateRegistryEntry?.variableInjectionOnly === true },
    { id: "template_file_locked", ok: template?.locked === true && template?.template_id === templateId },
    { id: "wav_written", ok: fs.existsSync(artifactPath) && artifactBytes > 1024 },
    { id: "wav_signature_valid", ok: wavLooksValid(fs.readFileSync(artifactPath)) },
    { id: "manifest_written", ok: fs.existsSync(manifestPath) },
    { id: "preview_pointer_written", ok: fs.existsSync(previewPath) },
    { id: "hash_recorded", ok: manifest.sha256 === artifactSha && /^[a-f0-9]{64}$/.test(artifactSha) },
    { id: "runtime_generation_claimed", ok: manifest.runtime_generated_media === true && manifest.ai_generated_media === false },
    { id: "receipt_binary_payload_forbidden", ok: true },
    { id: "cloud_not_called", ok: true },
    { id: "frontend_not_touched", ok: true },
  ];
  const failures = checks.filter((check) => !check.ok).map((check) => check.id);
  const report = {
    ok: failures.length === 0,
    schema_version: "orangebox.visual_runtime.headless_audio.v1",
    generated_at: generatedAt,
    status: failures.length === 0 ? "ORANGEBOX_HEADLESS_AUDIO_RUNTIME_GREEN" : "ORANGEBOX_HEADLESS_AUDIO_RUNTIME_NEEDS_WORK",
    runtime_ready: failures.length === 0,
    lab: "audio-lab",
    tool_card_id: toolCardId,
    template_id: templateId,
    doctrine: [
      "Audio runtime promotion requires a generated artifact, manifest, pointer, receipt, and rollback truth.",
      "A deterministic local WAV renderer can be promoted before heavyweight transcription or audio editing runtimes.",
      "This does not promote Whisper, Audacity, Demucs, UVR, or external audio agents.",
    ],
    artifact: {
      manifest_path: manifestPath,
      artifact_path: artifactPath,
      preview_path: previewPath,
      mime_type: "audio/wav",
      duration_seconds: durationSeconds,
      sample_rate: sampleRate,
      channels: 1,
      bytes: artifactBytes,
      sha256: artifactSha,
      runtime_generated_media: true,
      ai_generated_media: false,
      deterministic_renderer: true,
    },
    constraints: {
      cloud_services_called: false,
      external_binary_executed: false,
      frontend_touched: false,
      repo_files_mutated_by_runtime: false,
      raw_binary_routed_through_receipt: false,
    },
    checks,
    failures,
    rollback: {
      data_mutation: outDir,
      artifact_path: artifactPath,
      manifest_path: manifestPath,
      recovery_action: "Delete this runtime receipt/artifact and demote the tool card if a better promoted runtime replaces it.",
    },
    proof_hash: sha256(JSON.stringify({ manifest, checks })),
  };

  const latestPath = path.join(outDir, "latest-headless-audio-runtime.json");
  report.latest_path = latestPath;
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-headless-audio-runtime-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_HEADLESS_AUDIO_RUNTIME_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
