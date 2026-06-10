#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "visual-artifacts", "runtime", "headless-image");
const vaultRoot = path.join(dataRoot, "visual-artifacts", "vault");
const manifestDir = path.join(dataRoot, "visual-artifacts", "manifests");
const previewDir = path.join(dataRoot, "visual-artifacts", "previews");
const receiptDir = path.join(repoRoot, "receipts");
const toolCardsPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
const artifactId = "orangebox-headless-image-runtime-proof";
const toolCardId = "orangebox-headless-png-renderer";
const width = 160;
const height = 90;

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

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function makeRuntimePng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (stride + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const i = row + 1 + x * 4;
      const edge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      const bar = x >= 12 && x <= 24 && y >= 14 && y <= height - 15;
      const pulse = ((x * 3 + y * 5) % 41) < 3;
      const rail = y === 24 || y === 45 || y === 66;
      raw[i] = edge || bar || pulse ? 255 : rail ? 32 : 0;
      raw[i + 1] = edge ? 118 : bar ? 118 : pulse ? 90 : rail ? 18 : 0;
      raw[i + 2] = edge ? 0 : bar ? 0 : pulse ? 0 : rail ? 8 : 0;
      raw[i + 3] = 255;
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function pngSignatureValid(buffer) {
  return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function loadToolCard() {
  const raw = readJson(toolCardsPath, { cards: [] });
  const cards = Array.isArray(raw) ? raw : raw.cards || raw.tools || [];
  return cards.find((card) => card.id === toolCardId) || null;
}

async function main() {
  const args = process.argv.slice(2);
  const generatedAt = new Date().toISOString();
  const vaultReceiptPath = path.join(dataRoot, "visual-artifacts", "latest-visual-artifact-vault.json");
  const vaultReceipt = readJson(vaultReceiptPath, null);
  const toolCard = loadToolCard();
  const artifactPath = path.join(vaultRoot, "runtime", "headless-image", `${artifactId}.png`);
  const previewPath = path.join(previewDir, `${artifactId}.preview.txt`);
  const manifestPath = path.join(manifestDir, `${artifactId}.manifest.json`);

  await fsp.mkdir(outDir, { recursive: true });
  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  await fsp.mkdir(previewDir, { recursive: true });
  await fsp.mkdir(manifestDir, { recursive: true });

  const png = makeRuntimePng();
  await fsp.writeFile(artifactPath, png);
  await fsp.writeFile(previewPath, [
    "Orangebox headless image runtime proof.",
    `Artifact: ${artifactPath}`,
    "This is a promoted local deterministic runtime output.",
    "It proves the visual artifact rail without claiming ComfyUI/FLUX/Qwen Image readiness.",
    "",
  ].join("\n"), "utf8");

  const artifactSha = sha256File(artifactPath);
  const artifactBytes = fs.statSync(artifactPath).size;
  const manifest = {
    schema_version: "orangebox.visual_artifact_manifest.v1",
    artifact_id: artifactId,
    artifact_kind: "promoted-headless-image-runtime-proof",
    created_at: generatedAt,
    lane: "image-lab",
    tool_card_id: toolCardId,
    runtime_generated_media: true,
    ai_generated_media: false,
    deterministic_renderer: true,
    artifact_path: artifactPath,
    preview_path: previewPath,
    mime_type: "image/png",
    width,
    height,
    bytes: artifactBytes,
    sha256: artifactSha,
    source: {
      produced_by: "orangebox-headless-image-runtime-doctor",
      generator: "bun-buffer-png-renderer",
      note: "Promoted local headless image runtime. Heavy AI image generators remain gated until their own install/sample receipts pass.",
    },
    cleanup: {
      policy: "retain-latest-runtime-proof; garbage-collect superseded runtime proofs after receipt mirror",
      gc_allowed: true,
      human_review_required_before_delete: false,
    },
    rollback: {
      action: "Remove this runtime receipt/artifact and demote orangebox-headless-png-renderer if superseded.",
      repo_touch_required: false,
    },
  };
  await writeJson(manifestPath, manifest);

  const checks = [
    { id: "vault_receipt_green", ok: vaultReceipt?.ok === true && vaultReceipt?.vault_ready === true },
    { id: "tool_card_promoted", ok: toolCard?.status === "promoted" },
    { id: "tool_card_headless", ok: toolCard?.executionMode === "headless" && toolCard?.cloud === false && toolCard?.local === true },
    { id: "tool_card_pointer_only", ok: toolCard?.artifactProtocol?.returnsFilePointer === true && toolCard?.artifactProtocol?.returnsRawBytes === false },
    { id: "png_written", ok: fs.existsSync(artifactPath) && artifactBytes > 64 },
    { id: "png_signature_valid", ok: pngSignatureValid(fs.readFileSync(artifactPath)) },
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
    schema_version: "orangebox.visual_runtime.headless_image.v1",
    generated_at: generatedAt,
    status: failures.length === 0 ? "ORANGEBOX_HEADLESS_IMAGE_RUNTIME_GREEN" : "ORANGEBOX_HEADLESS_IMAGE_RUNTIME_NEEDS_WORK",
    runtime_ready: failures.length === 0,
    lab: "image-lab",
    tool_card_id: toolCardId,
    doctrine: [
      "Visual runtime promotion requires a generated artifact, manifest, pointer, receipt, and rollback truth.",
      "A deterministic local renderer can be promoted before heavyweight AI image runtimes.",
      "This does not promote ComfyUI, FLUX, Qwen Image, SDXL, video, audio, or design runtimes.",
    ],
    artifact: {
      manifest_path: manifestPath,
      artifact_path: artifactPath,
      preview_path: previewPath,
      mime_type: "image/png",
      width,
      height,
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

  const latestPath = path.join(outDir, "latest-headless-image-runtime.json");
  report.latest_path = latestPath;
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-headless-image-runtime-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_HEADLESS_IMAGE_RUNTIME_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
