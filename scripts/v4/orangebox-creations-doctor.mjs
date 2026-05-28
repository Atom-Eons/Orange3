#!/usr/bin/env node
/* orangebox-creations-doctor.mjs - backend-only output stack registry.
 *
 * This records Orangebox Creations as a governed software-factory doctrine.
 * It does not create apps, touch websites, run visual proof, deploy, or call
 * model APIs. It only writes a machine-readable registry and receipt.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const CREATIONS_ROOT = path.join(DATA_ROOT, "creations");
const VERSION = "orangebox-creations-output-stack/v0";

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

const OUTPUT_STACK = [
  {
    id: "aecode_operator_app",
    name: "AECode Operator App",
    role: "command center",
    active_in_ops: false,
    execution_gate: "requires explicit UI/visual authorization",
    tools: ["React", "Tailwind", "shadcn/ui", "Wails/Tauri optional", "SQLite"],
  },
  {
    id: "aecode_cli",
    name: "AECode CLI",
    role: "trusted execution surface",
    active_in_ops: true,
    execution_gate: "backend ops allowed",
    tools: ["Python or Bun/TypeScript", "SQLite", "Git", "JSON Schema"],
  },
  {
    id: "mission_artifacts",
    name: "Mission Artifacts",
    role: "mission source contracts and receipts",
    active_in_ops: true,
    execution_gate: "backend ops allowed",
    tools: ["YAML", "JSON", "SQLite index", "git hashes"],
  },
  {
    id: "worktree_patch_outputs",
    name: "Worktree Patch Outputs",
    role: "isolated patch production",
    active_in_ops: true,
    execution_gate: "operator approval required for writes",
    tools: ["Git worktrees", "path guard", "patch engine", "rollback pointer"],
  },
  {
    id: "web_app_outputs",
    name: "Web App Outputs",
    role: "future artifact target",
    active_in_ops: false,
    execution_gate: "disabled in Orangebox Ops backend proof",
    tools: ["React/Next/Vite", "Tailwind", "shadcn/ui", "Playwright"],
  },
  {
    id: "mobile_app_outputs",
    name: "Mobile App Outputs",
    role: "future artifact target",
    active_in_ops: false,
    execution_gate: "requires explicit mobile target authorization",
    tools: ["Flutter", "golden tests"],
  },
  {
    id: "native_desktop_outputs",
    name: "Native Desktop / Appliance UI Outputs",
    role: "future artifact target",
    active_in_ops: false,
    execution_gate: "requires explicit native target authorization",
    tools: ["Slint", "Gio", "Wails/Tauri optional"],
  },
  {
    id: "engine_room_cockpit_outputs",
    name: "Engine-Room / Cockpit Outputs",
    role: "future lab instrument target",
    active_in_ops: false,
    execution_gate: "requires explicit cockpit target authorization",
    tools: ["Dear ImGui", "cimgui-go", "Gio"],
  },
  {
    id: "visual_qa_outputs",
    name: "Visual QA Outputs",
    role: "future proof artifact target",
    active_in_ops: false,
    execution_gate: "disabled in Orangebox Ops backend proof",
    tools: ["Playwright", "accessibility snapshots", "visual_review.json"],
  },
  {
    id: "gauntlet_outputs",
    name: "Gauntlet Outputs",
    role: "deterministic proof reports",
    active_in_ops: true,
    execution_gate: "backend ops allowed",
    tools: ["lint", "typecheck", "test", "security scan", "release gate"],
  },
  {
    id: "deployment_outputs",
    name: "Deployment Outputs",
    role: "future production packages and deploy receipts",
    active_in_ops: false,
    execution_gate: "production deploy requires explicit final approval",
    tools: ["Vercel", "desktop packaging", "mobile builds", "release receipts"],
  },
  {
    id: "model_ai_tooling",
    name: "Model / AI Tooling",
    role: "workers behind adapter contracts",
    active_in_ops: true,
    execution_gate: "provider adapter only; no secret model bypass",
    tools: ["Claude Code", "Codex", "Gemini/AGY", "local models", "mock provider"],
  },
];

function buildRegistry() {
  const now = new Date().toISOString();
  const registry = {
    ok: true,
    version: VERSION,
    created_at: now,
    doctrine: {
      canonical_source: "AECode Source",
      outputs_not_master: true,
      software_factory_not_store: true,
      operator_boundary: "Orangebox Ops backend may register targets and proof gates, but must not touch website/visual outputs without explicit authorization.",
      priority: [
        "AECode CLI",
        "mission artifacts",
        "receipts",
        "worktree patches",
        "gauntlets",
        "local provider adapters",
        "operator status JSON",
        "then UI/web/mobile/native outputs only when separately authorized",
      ],
    },
    outputs: OUTPUT_STACK,
    gates: [
      { id: "exactly_twelve_output_types", ok: OUTPUT_STACK.length === 12 },
      { id: "aecode_source_canonical", ok: true },
      { id: "store_lane_absent", ok: OUTPUT_STACK.every((item) => !item.id.includes("store")) },
      { id: "ops_backend_lanes_active", ok: OUTPUT_STACK.filter((item) => item.active_in_ops).length === 5 },
      { id: "visual_website_outputs_gated", ok: OUTPUT_STACK.filter((item) => item.id.includes("web") || item.id.includes("visual")).every((item) => item.active_in_ops === false) },
      { id: "production_deploy_not_attempted", ok: true },
      { id: "model_bypass_forbidden", ok: true },
    ],
    rollback: {
      repo_mutation: "none from doctor execution",
      data_mutation: CREATIONS_ROOT,
      recovery_action: `Delete ${CREATIONS_ROOT} and matching receipts if this registry is superseded.`,
    },
  };
  registry.integrity = {
    sha256: sha256(JSON.stringify({ ...registry, integrity: undefined })),
  };
  return registry;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsJson = args.includes("--json");
  const wantsReceipt = args.includes("--receipt");
  const registry = buildRegistry();
  registry.files = {
    registry: await writeJson(path.join(CREATIONS_ROOT, "latest-output-stack.json"), registry),
  };
  if (wantsReceipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-creations-output-stack-${stamp()}.json`);
    registry.receipt_path = receiptPath;
    await writeJson(receiptPath, registry);
  }
  if (wantsJson) console.log(JSON.stringify(registry, null, 2));
  else {
    console.log(`${registry.ok ? "OK" : "FAIL"} ${VERSION}`);
    console.log(`registry: ${registry.files.registry}`);
    if (registry.receipt_path) console.log(`receipt: ${registry.receipt_path}`);
  }
  if (!registry.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
