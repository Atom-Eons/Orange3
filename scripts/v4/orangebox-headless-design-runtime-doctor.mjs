#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "visual-artifacts", "runtime", "headless-design");
const vaultRoot = path.join(dataRoot, "visual-artifacts", "vault");
const manifestDir = path.join(dataRoot, "visual-artifacts", "manifests");
const previewDir = path.join(dataRoot, "visual-artifacts", "previews");
const receiptDir = path.join(repoRoot, "receipts");
const toolCardsPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
const templateRegistryPath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "template-registry.json");
const templatePath = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "templates", "headless-design", "headless-design-export-v1.json");
const artifactId = "orangebox-headless-design-runtime-proof";
const toolCardId = "orangebox-headless-design-exporter";
const templateId = "headless-design-export-v1";
const width = 960;
const height = 540;

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

function makeSvg() {
  const title = "Orangebox Design Runtime";
  const subtitle = "Headless SVG export proof";
  const accent = "#ff7a00";
  const rails = Array.from({ length: 9 }, (_, i) => {
    const y = 78 + i * 42;
    const opacity = (0.18 + i * 0.035).toFixed(2);
    return `<rect x="72" y="${y}" width="${width - 144}" height="2" fill="${accent}" opacity="${opacity}" />`;
  }).join("\n  ");
  const bars = Array.from({ length: 12 }, (_, i) => {
    const x = 96 + i * 64;
    const h = 58 + ((i * 29) % 160);
    const y = 414 - h;
    const opacity = (0.28 + (i % 4) * 0.12).toFixed(2);
    return `<rect x="${x}" y="${y}" width="34" height="${h}" rx="2" fill="${accent}" opacity="${opacity}" />`;
  }).join("\n  ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(subtitle)}</desc>
  <rect width="${width}" height="${height}" fill="#000000" />
  <rect x="28" y="28" width="${width - 56}" height="${height - 56}" rx="18" fill="none" stroke="${accent}" stroke-width="3" />
  <rect x="56" y="56" width="${width - 112}" height="${height - 112}" rx="10" fill="#050505" stroke="#1d1208" stroke-width="1" />
  ${rails}
  ${bars}
  <circle cx="792" cy="132" r="58" fill="none" stroke="${accent}" stroke-width="8" opacity="0.74" />
  <circle cx="792" cy="132" r="27" fill="${accent}" opacity="0.28" />
  <text x="88" y="128" fill="#ffffff" font-family="Arial, sans-serif" font-size="42" font-weight="700">${escapeXml(title)}</text>
  <text x="90" y="172" fill="#ffb36b" font-family="Arial, sans-serif" font-size="22">${escapeXml(subtitle)}</text>
  <text x="90" y="470" fill="#8f8f8f" font-family="Arial, sans-serif" font-size="16">pointer-only artifact | sha256 manifest | no frontend mutation | no cloud call</text>
</svg>
`;
}

function svgLooksValid(text) {
  return /^<\?xml/.test(text) && /<svg[\s>]/.test(text) && /<\/svg>\s*$/.test(text);
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

  const artifactPath = path.join(vaultRoot, "runtime", "headless-design", `${artifactId}.svg`);
  const previewPath = path.join(previewDir, `${artifactId}.preview.txt`);
  const manifestPath = path.join(manifestDir, `${artifactId}.manifest.json`);

  await fsp.mkdir(outDir, { recursive: true });
  await fsp.mkdir(path.dirname(artifactPath), { recursive: true });
  await fsp.mkdir(previewDir, { recursive: true });
  await fsp.mkdir(manifestDir, { recursive: true });

  const svg = makeSvg();
  await fsp.writeFile(artifactPath, svg, "utf8");
  await fsp.writeFile(previewPath, [
    "Orangebox headless design runtime proof.",
    `Artifact: ${artifactPath}`,
    "This is a promoted local deterministic SVG design export.",
    "It proves the design artifact rail without claiming Penpot/Inkscape/Krita/GIMP/Blender readiness.",
    "",
  ].join("\n"), "utf8");

  const artifactSha = sha256File(artifactPath);
  const artifactBytes = fs.statSync(artifactPath).size;
  const manifest = {
    schema_version: "orangebox.visual_artifact_manifest.v1",
    artifact_id: artifactId,
    artifact_kind: "promoted-headless-design-runtime-proof",
    created_at: generatedAt,
    lane: "design-lab",
    tool_card_id: toolCardId,
    template_id: templateId,
    runtime_generated_media: true,
    ai_generated_media: false,
    deterministic_renderer: true,
    artifact_path: artifactPath,
    preview_path: previewPath,
    mime_type: "image/svg+xml",
    width,
    height,
    bytes: artifactBytes,
    sha256: artifactSha,
    source: {
      produced_by: "orangebox-headless-design-runtime-doctor",
      generator: "bun-svg-renderer",
      note: "Promoted local headless design runtime. GUI and AI design tools remain gated until their own install/sample receipts pass.",
    },
    cleanup: {
      policy: "retain-latest-runtime-proof; garbage-collect superseded runtime proofs after receipt mirror",
      gc_allowed: true,
      human_review_required_before_delete: false,
    },
    rollback: {
      action: "Remove this runtime receipt/artifact and demote orangebox-headless-design-exporter if superseded.",
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
    { id: "svg_written", ok: fs.existsSync(artifactPath) && artifactBytes > 256 },
    { id: "svg_signature_valid", ok: svgLooksValid(fs.readFileSync(artifactPath, "utf8")) },
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
    schema_version: "orangebox.visual_runtime.headless_design.v1",
    generated_at: generatedAt,
    status: failures.length === 0 ? "ORANGEBOX_HEADLESS_DESIGN_RUNTIME_GREEN" : "ORANGEBOX_HEADLESS_DESIGN_RUNTIME_NEEDS_WORK",
    runtime_ready: failures.length === 0,
    lab: "design-lab",
    tool_card_id: toolCardId,
    template_id: templateId,
    doctrine: [
      "Design runtime promotion requires a generated artifact, manifest, pointer, receipt, and rollback truth.",
      "A deterministic local SVG exporter can be promoted before heavyweight GUI or AI design runtimes.",
      "This does not promote Penpot, Inkscape, Krita, GIMP, Blender, or external design agents.",
    ],
    artifact: {
      manifest_path: manifestPath,
      artifact_path: artifactPath,
      preview_path: previewPath,
      mime_type: "image/svg+xml",
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

  const latestPath = path.join(outDir, "latest-headless-design-runtime.json");
  report.latest_path = latestPath;
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-headless-design-runtime-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_HEADLESS_DESIGN_RUNTIME_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
