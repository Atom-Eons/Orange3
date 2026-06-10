#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "visual-artifacts");
const receiptDir = path.join(repoRoot, "receipts");
const vaultRoot = path.join(outDir, "vault");
const manifestDir = path.join(outDir, "manifests");
const previewDir = path.join(outDir, "previews");
const quarantineDir = path.join(outDir, "quarantine");
const trashDir = path.join(outDir, "trash");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeTextIfChanged(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  let old = null;
  try {
    old = await fsp.readFile(file, "utf8");
  } catch {
    old = null;
  }
  if (old !== value) await fsp.writeFile(file, value, "utf8");
}

async function main() {
  const args = process.argv.slice(2);
  const generatedAt = new Date().toISOString();
  for (const dir of [vaultRoot, manifestDir, previewDir, quarantineDir, trashDir]) {
    await fsp.mkdir(dir, { recursive: true });
  }

  const proofArtifactPath = path.join(vaultRoot, "proof", "visual-artifact-vault-proof.txt");
  const proofPreviewPath = path.join(previewDir, "visual-artifact-vault-proof.preview.txt");
  const proofText = [
    "Orangebox visual artifact vault proof.",
    "This is a small pointer-manifest fixture, not generated visual media.",
    "Runtime visual generators remain blocked until promoted by install, sample artifact, hardware lock, and rollback receipts.",
    "",
  ].join("\n");
  await writeTextIfChanged(proofArtifactPath, proofText);
  await writeTextIfChanged(proofPreviewPath, proofText);

  const proofBytes = fs.statSync(proofArtifactPath).size;
  const proofSha = sha256File(proofArtifactPath);
  const manifest = {
    schema_version: "orangebox.visual_artifact_manifest.v1",
    artifact_id: "visual-artifact-vault-proof",
    artifact_kind: "vault-proof-placeholder",
    created_at: generatedAt,
    lane: "visual_artifact_vault",
    runtime_generated_media: false,
    artifact_path: proofArtifactPath,
    preview_path: proofPreviewPath,
    mime_type: "text/plain",
    bytes: proofBytes,
    sha256: proofSha,
    source: {
      produced_by: "orangebox-visual-artifact-vault-doctor",
      generator: "none",
      note: "Control-plane proof only; this does not promote image/video/audio/design runtime generation.",
    },
    cleanup: {
      policy: "retain-proof-fixture",
      gc_allowed: false,
      human_review_required_before_delete: true,
    },
  };
  const manifestPath = path.join(manifestDir, `${manifest.artifact_id}.manifest.json`);
  await writeJson(manifestPath, manifest);

  const checks = [
    {
      id: "directories_created",
      ok: [vaultRoot, manifestDir, previewDir, quarantineDir, trashDir].every((dir) => fs.existsSync(dir)),
    },
    { id: "pointer_manifest_written", ok: fs.existsSync(manifestPath) },
    { id: "artifact_hash_recorded", ok: manifest.sha256 === proofSha && manifest.sha256.length === 64 },
    { id: "receipt_has_no_binary_payload", ok: proofText.length < 1024 && manifest.bytes < 4096 },
    { id: "preview_pointer_declared", ok: fs.existsSync(proofPreviewPath) && manifest.preview_path === proofPreviewPath },
    { id: "quarantine_directory_declared", ok: fs.existsSync(quarantineDir) },
    { id: "cleanup_policy_declared", ok: manifest.cleanup.human_review_required_before_delete === true },
    { id: "runtime_generation_not_claimed", ok: manifest.runtime_generated_media === false },
  ];
  const failures = checks.filter((check) => !check.ok).map((check) => check.id);
  const report = {
    ok: failures.length === 0,
    schema_version: "orangebox.visual_artifact_vault.v1",
    generated_at: generatedAt,
    status: failures.length === 0 ? "ORANGEBOX_VISUAL_ARTIFACT_VAULT_GREEN" : "ORANGEBOX_VISUAL_ARTIFACT_VAULT_NEEDS_WORK",
    vault_ready: failures.length === 0,
    runtime_ready: false,
    doctrine: [
      "Visual artifacts are stored by pointer and hash, not by stuffing binary data into chat or receipts.",
      "The vault can be green before visual generators are promoted.",
      "A generator is not promoted until install proof, sample artifact receipt, hardware lock, rollback path, and human/operator gate are green.",
    ],
    vault: {
      root: vaultRoot,
      manifests: manifestDir,
      previews: previewDir,
      quarantine: quarantineDir,
      trash: trashDir,
      pointer_only: true,
      receipt_binary_payload_allowed: false,
      max_embedded_receipt_bytes: 4096,
      cleanup_policy: "human-reviewed pointer cleanup; generated media must have SHA-256 manifests before promotion",
    },
    proof_artifact: {
      manifest_path: manifestPath,
      artifact_path: proofArtifactPath,
      preview_path: proofPreviewPath,
      bytes: proofBytes,
      sha256: proofSha,
      runtime_generated_media: false,
    },
    checks,
    failures,
    next_action: "Use this vault for first promoted visual sample receipts; do not call visual runtime ready until a real generator produces a hashed sample artifact.",
    proof_hash: sha256(JSON.stringify({ manifest, checks })),
  };

  const latestPath = path.join(outDir, "latest-visual-artifact-vault.json");
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-visual-artifact-vault-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  report.latest_path = latestPath;
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_VISUAL_ARTIFACT_VAULT_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
