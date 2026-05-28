#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const repoRoot = "C:\\AtomEons\\orangebox";
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const docPath = path.join(repoRoot, "docs", "ATOMSMASHER_MODULE_INTAKE_2026-05-28.md");
const intakeDir = path.join(dataRoot, "incoming");
const intakePath = path.join(intakeDir, "atomsmasher-module-intake.json");
const doctorPath = path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  const docExists = fs.existsSync(docPath);
  const doctor = fs.existsSync(doctorPath) ? JSON.parse(fs.readFileSync(doctorPath, "utf8").replace(/^\uFEFF/, "")) : null;
  const integrated = doctor?.ok === true && doctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN";
  const state = {
    ok: docExists,
    version: "orangebox-atomsmasher-intake/v0",
    status: integrated ? "INTEGRATED_GREEN" : "WAITING_FOR_HEAVY_SPEC",
    lane: "orangebox-backend-module-intake",
    active_scope: [
      "intake",
      "contract shaping",
      "backend-only implementation planning",
      "test/proof/receipt definition",
    ],
    not_this_ops_lane: [
      "visual build",
      "website/store work",
      "media generation",
      "deployment",
      "paid model API calls",
      "GPU dependency",
      "module implementation from partial fragments",
    ],
    lane_clarification:
      "Visual, website, shop, media, mobile, native, and dashboard outputs remain Orangebox product lanes. This intake lane only refuses to handle them inside the current Ops/backend chat.",
    expected_baseline: {
      default_runtime: "Python + SQLite if standalone; Orangebox Node scripts for Ops proof",
      network_required: false,
      api_keys_required: false,
      gpu_required: false,
      proof_required: true,
      receipt_required: true,
      rollback_required: true,
    },
    next_action_when_spec_arrives:
      "Convert the heavy AtomSmasher spec into an Orangebox mission contract with allowed paths, schemas, tests, receipts, and rollback before implementation.",
    doc_path: docPath,
    doctor_path: doctorPath,
    integration_status: doctor?.summary?.status || null,
    integration_features_registered: doctor?.summary?.features_registered || 0,
    integration_features_ok: doctor?.summary?.features_ok || 0,
    doc_exists: docExists,
    updated_at: new Date().toISOString(),
  };

  ensureDir(intakeDir);
  fs.writeFileSync(intakePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  state.intake_path = intakePath;

  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-atomsmasher-intake-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    state.receipt_path = receiptPath;
  }

  if (json) {
    console.log(JSON.stringify(state, null, 2));
  } else {
    console.log(`AtomSmasher intake status: ${state.status}`);
    console.log(`Intake state: ${intakePath}`);
  }

  if (!state.ok) process.exitCode = 1;
}

main();
