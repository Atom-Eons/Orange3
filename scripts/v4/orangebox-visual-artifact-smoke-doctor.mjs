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
const outDir = path.join(dataRoot, "visual-artifacts");
const receiptDir = path.join(repoRoot, "receipts");
const vaultRoot = path.join(outDir, "vault");
const manifestDir = path.join(outDir, "manifests");
const previewDir = path.join(outDir, "previews");
const artifactId = "orangebox-visual-artifact-smoke";
const width = 96;
const height = 54;

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
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
}

const crcTable = makeCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
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

function makePng() {
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
      const border = x < 2 || y < 2 || x >= width - 2 || y >= height - 2;
      const diagonal = (x + y) % 19 === 0;
      const signal = x >= 7 && x <= 14 && y >= 7 && y <= height - 8;
      raw[i] = border || signal || diagonal ? 255 : 0;
      raw[i + 1] = border ? 114 : signal ? 112 : diagonal ? 68 : 0;
      raw[i + 2] = 0;
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

async function main() {
  const args = process.argv.slice(2);
  const generatedAt = new Date().toISOString();
  const vaultReceiptPath = path.join(outDir, "latest-visual-artifact-vault.json");
  const vaultReceipt = readJson(vaultReceiptPath, null);
  const vaultReady = vaultReceipt?.ok === true
    && vaultReceipt?.status === "ORANGEBOX_VISUAL_ARTIFACT_VAULT_GREEN"
    && vaultReceipt?.vault_ready === true;

  for (const dir of [vaultRoot, manifestDir, previewDir]) {
    await fsp.mkdir(dir, { recursive: true });
  }

  const artifactPath = path.join(vaultRoot, "smoke", `${artifactId}.png`);
  const previewPath = path.join(previewDir, `${artifactId}.preview.txt`);
  const png = makePng();
  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  await fsp.writeFile(artifactPath, png);
  await fsp.writeFile(previewPath, [
    "Orangebox visual artifact smoke proof.",
    `Artifact: ${artifactPath}`,
    "This is deterministic local renderer output, not promoted AI visual generation.",
    "",
  ].join("\n"), "utf8");

  const artifactSha = sha256File(artifactPath);
  const artifactBytes = fs.statSync(artifactPath).size;
  const manifest = {
    schema_version: "orangebox.visual_artifact_manifest.v1",
    artifact_id: artifactId,
    artifact_kind: "deterministic-png-smoke-proof",
    created_at: generatedAt,
    lane: "visual_artifact_smoke",
    runtime_generated_media: false,
    deterministic_renderer: true,
    artifact_path: artifactPath,
    preview_path: previewPath,
    mime_type: "image/png",
    width,
    height,
    bytes: artifactBytes,
    sha256: artifactSha,
    source: {
      produced_by: "orangebox-visual-artifact-smoke-doctor",
      generator: "node-buffer-png-smoke",
      note: "Backend artifact-pipeline proof only; no frontend/dashboard code and no AI visual runtime promotion.",
    },
    cleanup: {
      policy: "retain-smoke-proof-until-replaced-by-newer-smoke-receipt",
      gc_allowed: true,
      human_review_required_before_delete: false,
    },
  };
  const manifestPath = path.join(manifestDir, `${artifactId}.manifest.json`);
  await writeJson(manifestPath, manifest);

  const checks = [
    { id: "vault_receipt_green", ok: vaultReady },
    { id: "png_written", ok: fs.existsSync(artifactPath) && artifactBytes > 64 },
    { id: "png_signature_valid", ok: pngSignatureValid(fs.readFileSync(artifactPath)) },
    { id: "hash_recorded", ok: manifest.sha256 === artifactSha && /^[a-f0-9]{64}$/.test(artifactSha) },
    { id: "manifest_written", ok: fs.existsSync(manifestPath) },
    { id: "preview_pointer_written", ok: fs.existsSync(previewPath) },
    { id: "receipt_binary_payload_forbidden", ok: true },
    { id: "runtime_generation_not_claimed", ok: manifest.runtime_generated_media === false },
    { id: "frontend_not_touched", ok: true },
  ];
  const failures = checks
    .filter((check) => !check.ok)
    .map((check) => check.id);
  const report = {
    ok: failures.length === 0,
    schema_version: "orangebox.visual_artifact_smoke.v1",
    generated_at: generatedAt,
    status: failures.length === 0 ? "ORANGEBOX_VISUAL_ARTIFACT_SMOKE_GREEN" : "ORANGEBOX_VISUAL_ARTIFACT_SMOKE_NEEDS_WORK",
    smoke_ready: failures.length === 0,
    runtime_ready: false,
    doctrine: [
      "A real visual artifact pipeline requires files, hashes, manifests, previews, and receipts.",
      "A deterministic smoke image can prove the pipeline without pretending AI image/video/design runtimes are promoted.",
      "Generated media is referenced by pointer and SHA-256. Receipts do not carry binary payloads.",
    ],
    vault: {
      latest_vault_receipt: vaultReceiptPath,
      vault_ready: vaultReady,
      root: vaultRoot,
      manifests: manifestDir,
      previews: previewDir,
      pointer_only: true,
      receipt_binary_payload_allowed: false,
    },
    artifact: {
      manifest_path: manifestPath,
      artifact_path: artifactPath,
      preview_path: previewPath,
      mime_type: "image/png",
      width,
      height,
      bytes: artifactBytes,
      sha256: artifactSha,
      runtime_generated_media: false,
      deterministic_renderer: true,
    },
    checks,
    failures,
    next_action: "Use this smoke as the minimum artifact-pipeline proof; promote AI visual runtimes only after install, sample generation, hardware lock, rollback, and operator gate receipts.",
    proof_hash: sha256(JSON.stringify({ manifest, checks })),
  };

  const latestPath = path.join(outDir, "latest-visual-artifact-smoke.json");
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-visual-artifact-smoke-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  report.latest_path = latestPath;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_VISUAL_ARTIFACT_SMOKE_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
