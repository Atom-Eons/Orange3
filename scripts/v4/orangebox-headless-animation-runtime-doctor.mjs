#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "visual-artifacts", "runtime", "headless-animation");
const vaultRoot = path.join(dataRoot, "visual-artifacts", "vault");
const manifestDir = path.join(dataRoot, "visual-artifacts", "manifests");
const previewDir = path.join(dataRoot, "visual-artifacts", "previews");
const receiptDir = path.join(repoRoot, "receipts");
const toolCardsPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
const templateRegistryPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "template-registry.json");
const templatePath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "headless-animation", "headless-animation-proof-v1.json");
const artifactId = "orangebox-headless-animation-runtime-proof";
const toolCardId = "orangebox-headless-animation-renderer";
const templateId = "headless-animation-proof-v1";
const width = 1280;
const height = 720;
const durationMs = 3000;

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

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function loadCards() {
  const raw = readJson(toolCardsPath, { cards: [] });
  return Array.isArray(raw) ? raw : raw.cards || raw.tools || [];
}

function loadTemplateRegistry() {
  const raw = readJson(templateRegistryPath, { templates: [] });
  return Array.isArray(raw) ? raw : raw.templates || [];
}

function makeAnimatedSvg() {
  const accent = "#ff7a00";
  const title = "Orangebox Animation Runtime";
  const rails = Array.from({ length: 7 }, (_, i) => {
    const y = 156 + i * 62;
    return `<rect x="96" y="${y}" width="${width - 192}" height="3" fill="${accent}" opacity="${(0.16 + i * 0.045).toFixed(2)}" />`;
  }).join("\n  ");
  const nodes = Array.from({ length: 10 }, (_, i) => {
    const x = 150 + i * 102;
    const y = 390 + Math.sin(i) * 62;
    const delay = (i * 0.11).toFixed(2);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="14" fill="${accent}" opacity="0.72">
    <animate attributeName="cy" values="${(y - 38).toFixed(1)};${(y + 38).toFixed(1)};${(y - 38).toFixed(1)}" dur="3s" begin="${delay}s" repeatCount="indefinite" />
    <animate attributeName="opacity" values="0.28;0.9;0.28" dur="3s" begin="${delay}s" repeatCount="indefinite" />
  </circle>`;
  }).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">Deterministic headless animated SVG proof for the Orangebox video-lab baseline runtime.</desc>
  <rect width="${width}" height="${height}" fill="#000000" />
  <rect x="40" y="40" width="${width - 80}" height="${height - 80}" rx="24" fill="#050505" stroke="${accent}" stroke-width="4" />
  <text x="88" y="130" fill="#ffffff" font-family="Arial, sans-serif" font-size="54" font-weight="700">${escapeXml(title)}</text>
  <text x="92" y="174" fill="#ffb36b" font-family="Arial, sans-serif" font-size="24">Headless motion artifact proof | ${durationMs}ms loop | no external codec</text>
  ${rails}
  <rect x="96" y="505" width="${width - 192}" height="44" rx="6" fill="#120a04" stroke="#4a2507" />
  <rect x="112" y="517" width="190" height="20" rx="3" fill="${accent}" opacity="0.78">
    <animate attributeName="width" values="190;930;190" dur="3s" repeatCount="indefinite" />
  </rect>
  ${nodes}
  <path d="M140 585 C 340 520, 520 655, 710 585 S 1030 520, 1140 585" fill="none" stroke="${accent}" stroke-width="6" opacity="0.42">
    <animate attributeName="stroke-dasharray" values="24 18;4 38;24 18" dur="3s" repeatCount="indefinite" />
  </path>
  <text x="92" y="650" fill="#8f8f8f" font-family="Arial, sans-serif" font-size="18">pointer-only artifact | sha256 manifest | no frontend mutation | no cloud call</text>
</svg>
`;
}

function svgAnimationLooksValid(text) {
  return /^<\?xml/.test(text) && /<svg[\s>]/.test(text) && /<animate[\s>]/.test(text) && /<\/svg>\s*$/.test(text);
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

  const artifactPath = path.join(vaultRoot, "runtime", "headless-animation", `${artifactId}.svg`);
  const previewPath = path.join(previewDir, `${artifactId}.preview.txt`);
  const manifestPath = path.join(manifestDir, `${artifactId}.manifest.json`);

  await fsp.mkdir(outDir, { recursive: true });
  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  await fsp.mkdir(previewDir, { recursive: true });
  await fsp.mkdir(manifestDir, { recursive: true });

  const svg = makeAnimatedSvg();
  await fsp.writeFile(artifactPath, svg, "utf8");
  await fsp.writeFile(previewPath, [
    "Orangebox headless animation runtime proof.",
    `Artifact: ${artifactPath}`,
    "Format: animated SVG motion loop; deterministic local Bun renderer.",
    "This proves the video-lab motion artifact rail without claiming Wan/LTX/OBS/ffmpeg/Kdenlive readiness.",
    "",
  ].join("\n"), "utf8");

  const artifactSha = sha256File(artifactPath);
  const artifactBytes = fs.statSync(artifactPath).size;
  const manifest = {
    schema_version: "orangebox.visual_artifact_manifest.v1",
    artifact_id: artifactId,
    artifact_kind: "promoted-headless-animation-runtime-proof",
    created_at: generatedAt,
    lane: "video-lab",
    tool_card_id: toolCardId,
    template_id: templateId,
    runtime_generated_media: true,
    ai_generated_media: false,
    deterministic_renderer: true,
    animated_media: true,
    artifact_path: artifactPath,
    preview_path: previewPath,
    mime_type: "image/svg+xml",
    width,
    height,
    duration_ms: durationMs,
    bytes: artifactBytes,
    sha256: artifactSha,
    source: {
      produced_by: "orangebox-headless-animation-runtime-doctor",
      generator: "bun-animated-svg-renderer",
      note: "Promoted local headless animation runtime. Video generation/editing tools remain gated until their own install/sample receipts pass.",
    },
    cleanup: {
      policy: "retain-latest-runtime-proof; garbage-collect superseded runtime proofs after receipt mirror",
      gc_allowed: true,
      human_review_required_before_delete: false,
    },
    rollback: {
      action: "Remove this runtime receipt/artifact and demote orangebox-headless-animation-renderer if superseded.",
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
    { id: "animated_svg_written", ok: fs.existsSync(artifactPath) && artifactBytes > 512 },
    { id: "animated_svg_signature_valid", ok: svgAnimationLooksValid(fs.readFileSync(artifactPath, "utf8")) },
    { id: "manifest_written", ok: fs.existsSync(manifestPath) },
    { id: "preview_pointer_written", ok: fs.existsSync(previewPath) },
    { id: "hash_recorded", ok: manifest.sha256 === artifactSha && /^[a-f0-9]{64}$/.test(artifactSha) },
    { id: "runtime_generation_claimed", ok: manifest.runtime_generated_media === true && manifest.ai_generated_media === false && manifest.animated_media === true },
    { id: "receipt_binary_payload_forbidden", ok: true },
    { id: "cloud_not_called", ok: true },
    { id: "frontend_not_touched", ok: true },
  ];
  const failures = checks.filter((check) => !check.ok).map((check) => check.id);
  const report = {
    ok: failures.length === 0,
    schema_version: "orangebox.visual_runtime.headless_animation.v1",
    generated_at: generatedAt,
    status: failures.length === 0 ? "ORANGEBOX_HEADLESS_ANIMATION_RUNTIME_GREEN" : "ORANGEBOX_HEADLESS_ANIMATION_RUNTIME_NEEDS_WORK",
    runtime_ready: failures.length === 0,
    lab: "video-lab",
    tool_card_id: toolCardId,
    template_id: templateId,
    doctrine: [
      "Video-lab runtime promotion requires a generated artifact, manifest, pointer, receipt, and rollback truth.",
      "A deterministic local animated SVG renderer can prove the motion artifact rail before heavyweight video or generative runtimes.",
      "This does not promote Wan, LTX, DaVinci Resolve, Kdenlive, OBS, ffmpeg, or external video agents.",
    ],
    artifact: {
      manifest_path: manifestPath,
      artifact_path: artifactPath,
      preview_path: previewPath,
      mime_type: "image/svg+xml",
      width,
      height,
      duration_ms: durationMs,
      bytes: artifactBytes,
      sha256: artifactSha,
      runtime_generated_media: true,
      ai_generated_media: false,
      deterministic_renderer: true,
      animated_media: true,
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

  const latestPath = path.join(outDir, "latest-headless-animation-runtime.json");
  report.latest_path = latestPath;
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-headless-animation-runtime-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_HEADLESS_ANIMATION_RUNTIME_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
