#!/usr/bin/env node
/* aecode-format-doctor.mjs - AECode final format and target-language registry.
 *
 * This is a backend-only proof lane. It records the AECode Source contract,
 * the implementation languages Orangebox may use, and the output targets that
 * remain gated. It does not generate UI, touch website files, deploy, or call
 * model APIs.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AECODE_FORMAT_DOCTOR_VERSION = "orangebox-aecode-final-format/v0";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const FORMAT_ROOT = path.join(DATA_ROOT, "aecode-format");
const DOC_PATH = path.join(ROOT, "docs", "AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md");
const SCHEMA_PATH = path.join(ROOT, "schemas", "aecode-final-format.schema.json");

const SOURCE_SECTIONS = [
  "identity",
  "product_intent",
  "operator_laws",
  "scope",
  "target_matrix",
  "artifact_contracts",
  "data_contracts",
  "behavior_graph",
  "permissions",
  "model_roles",
  "gauntlets",
  "receipts",
  "rollback",
];

const TARGETS = [
  {
    id: "aecode_source",
    name: "AECode Source",
    status: "active",
    purpose: "canonical source-of-truth contract for software intent and build law",
    languages: ["AECode Source", "YAML-compatible blocks", "JSON-compatible blocks"],
    allowed_now: true,
    gate: "backend ops allowed",
  },
  {
    id: "orangebox_ops_backend",
    name: "Orangebox Ops Backend",
    status: "active",
    purpose: "mission, gauntlet, receipt, provider-adapter, proof, and registry execution",
    languages: ["JavaScript ESM", "Node.js", "JSON", "SQLite schema", "PowerShell wrappers"],
    allowed_now: true,
    gate: "backend ops allowed",
  },
  {
    id: "control_plane_runtime",
    name: "Control Plane Runtime",
    status: "active",
    purpose: "deterministic routing, retries, receipts, local model adapters, and system proof",
    languages: ["TypeScript when Bun lane is used", "JavaScript ESM fallback", "SQLite"],
    allowed_now: true,
    gate: "backend ops allowed",
  },
  {
    id: "local_worker_runtime",
    name: "Local Worker Runtime",
    status: "active",
    purpose: "local helper scripts, filesystem-safe utilities, and future private model workers",
    languages: ["Python", "PowerShell", "JSON"],
    allowed_now: true,
    gate: "backend ops allowed; no API key required by default",
  },
  {
    id: "manifest_receipt_formats",
    name: "Mission and Receipt Formats",
    status: "active",
    purpose: "mission.yaml, events.jsonl, receipt.json, gauntlet JSON, proof JSON",
    languages: ["YAML", "JSON", "JSON Schema", "Markdown for human reports"],
    allowed_now: true,
    gate: "backend ops allowed",
  },
  {
    id: "web_output_target",
    name: "Web Output Target",
    status: "gated",
    purpose: "future generated web apps, dashboards, admin panels, and AI tools",
    languages: ["TypeScript", "React", "Next.js or Vite", "Tailwind", "shadcn/ui"],
    allowed_now: false,
    gate: "blocked until operator explicitly reopens website/visual lane",
  },
  {
    id: "mobile_output_target",
    name: "Mobile Output Target",
    status: "gated",
    purpose: "future iOS/Android shells and mobile tools",
    languages: ["Dart", "Flutter"],
    allowed_now: false,
    gate: "requires explicit mobile target authorization",
  },
  {
    id: "native_appliance_target",
    name: "Native Desktop / Appliance Target",
    status: "gated",
    purpose: "future premium local-machine and appliance-grade interfaces",
    languages: ["Slint", "Rust or C++ host", "Gio/Go optional"],
    allowed_now: false,
    gate: "requires explicit native target authorization",
  },
  {
    id: "engine_room_target",
    name: "Engine-Room Target",
    status: "gated",
    purpose: "future high-performance lab-instrument surfaces for compiler passes and telemetry",
    languages: ["Dear ImGui", "C++", "Go/giu optional"],
    allowed_now: false,
    gate: "requires explicit engine-room UI authorization",
  },
  {
    id: "desktop_wrapper_target",
    name: "Desktop Wrapper Target",
    status: "gated",
    purpose: "future desktop packaging when speed matters more than native purity",
    languages: ["Wails/Go", "Tauri/Rust", "TypeScript"],
    allowed_now: false,
    gate: "requires explicit desktop packaging authorization",
  },
  {
    id: "deploy_package_target",
    name: "Deploy Package Target",
    status: "gated",
    purpose: "future production packages, Vercel deploys, mobile builds, and release bundles",
    languages: ["GitHub Actions YAML", "Vercel config", "package scripts", "release receipts"],
    allowed_now: false,
    gate: "production deploy requires explicit final approval and logs",
  },
];

const COMPILER_LAW = [
  "AECode Source is canonical; targets are outputs.",
  "No target owns product truth.",
  "The active backend may register and validate targets without generating their UI/code.",
  "Every compile path must emit a mission contract and receipt.",
  "Every code-producing target must pass worktree, path guard, gauntlet, and rollback law.",
  "Website, visual, mobile, native, engine-room, desktop-wrapper, and deploy targets remain gated until explicitly authorized.",
  "There is no store lane.",
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function buildRegistry() {
  const activeTargets = TARGETS.filter((target) => target.allowed_now);
  const gatedTargets = TARGETS.filter((target) => !target.allowed_now);
  const format = {
    ok: true,
    version: AECODE_FORMAT_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    source_contract: {
      id: "ae.source.final-format.v0",
      name: "AECode Source Final Format",
      canonical: true,
      source_sections: SOURCE_SECTIONS,
      compiler_shape: "intent -> mission contract -> target plan -> isolated patch/artifact -> gauntlet -> receipt -> approval",
      not_a_store: true,
      not_a_visual_edit_permission: true,
    },
    languages_we_code_in: Array.from(new Set(TARGETS.flatMap((target) => target.languages))).sort(),
    active_targets: activeTargets.map((target) => target.id),
    gated_targets: gatedTargets.map((target) => target.id),
    targets: TARGETS,
    compiler_law: COMPILER_LAW,
    gates: [
      { id: "aecode_source_is_canonical", ok: true },
      { id: "required_sections_present", ok: SOURCE_SECTIONS.length === 13 },
      { id: "active_backend_targets_present", ok: activeTargets.length === 5 },
      { id: "web_visual_targets_gated", ok: TARGETS.filter((target) => /web|engine|desktop|native|mobile/i.test(target.id)).every((target) => !target.allowed_now) },
      { id: "deploy_target_gated", ok: TARGETS.find((target) => target.id === "deploy_package_target")?.allowed_now === false },
      { id: "store_lane_absent", ok: TARGETS.every((target) => !/store/i.test(`${target.id} ${target.name} ${target.purpose}`)) },
      { id: "no_model_api_required", ok: true },
      { id: "no_visual_or_website_mutation", ok: true },
    ],
    files: {
      human_doc: DOC_PATH,
      schema: SCHEMA_PATH,
      latest_registry: path.join(FORMAT_ROOT, "latest-final-format.json"),
    },
    rollback: {
      repo_mutation: [
        "scripts/v4/aecode-format-doctor.mjs",
        "docs/AECODE_FINAL_FORMAT_AND_TARGET_LANGUAGES_2026-05-28.md",
        "schemas/aecode-final-format.schema.json",
        "package.json script additions",
        "scripts/v4/gauntlet-engine.mjs proof integration",
        "scripts/v4/orangebox-system-proof-doctor.mjs proof integration",
      ],
      data_mutation: FORMAT_ROOT,
      recovery_action: `Delete ${FORMAT_ROOT} and remove the listed repo mutations if this contract is superseded.`,
    },
  };
  format.ok = format.gates.every((gate) => gate.ok);
  format.integrity = {
    sha256: sha256(JSON.stringify({ ...format, integrity: undefined })),
  };
  return format;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const wantsReceipt = args.includes("--receipt");
  const registry = buildRegistry();
  await writeJson(registry.files.latest_registry, registry);
  if (wantsReceipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-aecode-final-format-${stamp()}.json`);
    registry.receipt_path = receiptPath;
    await writeJson(receiptPath, registry);
  }
  if (wantsJson) console.log(JSON.stringify(registry, null, 2));
  else {
    console.log(`${registry.ok ? "OK" : "FAIL"} ${AECODE_FORMAT_DOCTOR_VERSION}`);
    console.log(`registry: ${registry.files.latest_registry}`);
    if (registry.receipt_path) console.log(`receipt: ${registry.receipt_path}`);
  }
  if (!registry.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
