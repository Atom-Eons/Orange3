#!/usr/bin/env node
/* surface-doctor.mjs - Surface Factory + Solidify proof gate.
 *
 * This doctor proves Wave 3 without model calls: a core-v1 surface is created
 * from the factory, seeded through the project graph reducer, given a real
 * graph-backed file node, then solidified to disk with snapshots, manifest,
 * hash chain, and receipt callback evidence.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import * as graph from "./project-graph.mjs";
import * as solidifier from "./solidify.mjs";
import * as surfaceFactory from "./surface-factory.mjs";

export const SURFACE_DOCTOR_VERSION = "orangebox-surface-solidify-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function tempRoot() {
  return path.join(os.tmpdir(), `obx-surface-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
}

function compactText(value, max = 2400) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}\n...[truncated]` : text;
}

async function gate(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const evidence = await fn();
    const ok = evidence?.ok !== false;
    return {
      name,
      required,
      ok,
      status: ok ? "pass" : (required ? "fail" : "warning"),
      duration_ms: Date.now() - started,
      evidence,
    };
  } catch (err) {
    return {
      name,
      required,
      ok: false,
      status: required ? "fail" : "warning",
      duration_ms: Date.now() - started,
      error: err?.message || String(err),
      stack: err?.stack ? compactText(err.stack, 1600) : null,
    };
  }
}

async function fileExists(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile();
  } catch {
    return false;
  }
}

async function templateProbe() {
  const templates = surfaceFactory.listTemplates();
  const core = templates.find((template) => template.template_id === "core-v1");
  return {
    ok: !!core && core.seed_mutation_count >= 10,
    templates_count: templates.length,
    core_v1: core || null,
  };
}

async function createSurfaceProbe(dataRoot) {
  const root = path.join(dataRoot, "surfaces", "wave3-doctor-create");
  const result = await surfaceFactory.createSurface({
    name: "Wave 3 Doctor Create",
    description: "Surface Factory proof fixture",
    root,
    dataRoot,
  });
  const manifestExists = await fileExists(path.join(root, "surface.json"));
  const readmeExists = await fileExists(path.join(root, "README.md"));
  const seedExists = await fileExists(path.join(root, "surface-template-seed.json"));
  const registry = await surfaceFactory.listSurfaces({ dataRoot });
  const g = await graph.loadOrInit(root);
  const hasCoreNodes = [
    "surface-vision-rail",
    "surface-command-center",
    "surface-artifact-library",
    "surface-relevance-controller",
    "surface-visual-telemetry",
    "surface-receipts-ledger",
  ].every((id) => g.nodes.some((node) => node.id === id));
  return {
    ok: result.ok
      && manifestExists
      && readmeExists
      && seedExists
      && registry.count === 1
      && result.graph.nodes >= 6
      && result.graph.wires >= 3
      && result.graph.regions >= 1
      && hasCoreNodes,
    surface: result.surface,
    graph: result.graph,
    manifest_exists: manifestExists,
    readme_exists: readmeExists,
    seed_exists: seedExists,
    registry_path: result.registry_path,
    registry_count: registry.count,
    has_core_nodes: hasCoreNodes,
    workspace_version: g.workspace_version,
    mutation_log_count: g.mutation_log?.length || 0,
  };
}

async function solidifyProbe(dataRoot) {
  const root = path.join(dataRoot, "surfaces", "wave3-doctor-solidify");
  await surfaceFactory.createSurface({
    name: "Wave 3 Doctor Solidify",
    description: "Solidify proof fixture",
    root,
    dataRoot,
  });
  const content = [
    "# Wave 3 Solidify Proof",
    "",
    "This file was created from an ORANGEBOX project graph node and written by Silent Canvas Solidify.",
    "",
    `Created: ${new Date().toISOString()}`,
    "",
  ].join("\n");
  const mutation = {
    id: "sd-proof-file",
    kind: "node_create",
    target: "surface-doctor-proof-file",
    details: {
      element_kind: "file",
      path: "build/surface-doctor-proof.md",
      label: "Surface Doctor Proof File",
      role: "real graph-backed file output for Solidify",
      content,
      x: 1040,
      y: 842,
      w: 260,
      h: 120,
    },
  };
  const applied = await graph.applyMutation(root, "surface-doctor", mutation);
  const receipts = [];
  const result = await solidifier.solidify({
    workspace: root,
    dataRoot,
    emitReceipt: async (receipt) => { receipts.push(receipt); },
  });
  const proofFile = path.join(root, "build", "surface-doctor-proof.md");
  const proofContent = await fs.readFile(proofFile, "utf8").catch(() => "");
  const manifestExists = await fileExists(result.manifest_path);
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(result.manifest_path, "utf8"));
  } catch {}
  return {
    ok: applied.ok
      && result.ok
      && result.files_written >= 1
      && result.files_failed === 0
      && manifestExists
      && proofContent.includes("project graph node")
      && manifest?.deployment?.attempted === false
      && result.chain?.targets?.some((target) => target.target === proofFile && target.ok),
    workspace: root,
    mutation_applied: applied,
    proof_file: proofFile,
    proof_file_exists: proofContent.length > 0,
    solidify: {
      run_id: result.run_id,
      manifest_path: result.manifest_path,
      manifest_sha256: result.manifest_sha256,
      files_written: result.files_written,
      files_skipped: result.files_skipped,
      files_failed: result.files_failed,
      errors: result.errors,
      snapshots: result.snapshots,
      chain: result.chain,
    },
    manifest_exists: manifestExists,
    deployment_attempted: manifest?.deployment?.attempted ?? null,
    receipts_emitted: receipts.length,
    receipt_sources: receipts.map((receipt) => receipt.source),
  };
}

async function cliApiSourceProbe() {
  const cliPath = path.join(ROOT, "scripts", "obx.mjs");
  const routesPath = path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs");
  const [cli, routes] = await Promise.all([
    fs.readFile(cliPath, "utf8"),
    fs.readFile(routesPath, "utf8"),
  ]);
  const required = {
    cli: ["obx surface doctor", "async function cmdSurface", "surface-doctor.mjs"],
    routes: ["/api/v4/surfaces/doctor", "surface-doctor.mjs", "/api/v4/silent-canvas/solidify"],
  };
  const missing = {
    cli: required.cli.filter((needle) => !cli.includes(needle)),
    routes: required.routes.filter((needle) => !routes.includes(needle)),
  };
  const missingTotal = Object.values(missing).reduce((n, arr) => n + arr.length, 0);
  return {
    ok: missingTotal === 0,
    files: { cliPath, routesPath },
    missing,
  };
}

async function writeDoctorReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-surface-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runSurfaceDoctor({ writeReceipt = false, keepTemp = false } = {}) {
  const dataRoot = tempRoot();
  await fs.mkdir(dataRoot, { recursive: true });
  const checks = [];
  const previousDataRoot = process.env.ORANGEBOX_DATA_ROOT;
  process.env.ORANGEBOX_DATA_ROOT = dataRoot;

  try {
    checks.push(await gate("template_registry", templateProbe));
    checks.push(await gate("surface_create_from_core_v1", async () => createSurfaceProbe(dataRoot)));
    checks.push(await gate("solidify_graph_backed_file", async () => solidifyProbe(dataRoot)));
    checks.push(await gate("cli_api_source_probe", cliApiSourceProbe));
  } finally {
    if (previousDataRoot === undefined) delete process.env.ORANGEBOX_DATA_ROOT;
    else process.env.ORANGEBOX_DATA_ROOT = previousDataRoot;
  }

  const failed = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failed.length === 0,
    version: SURFACE_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    data_root: dataRoot,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failed.length,
      warnings: warnings.length,
    },
    checks,
    failures: failed,
    receipt_path: null,
  };

  if (writeReceipt) result.receipt_path = await writeDoctorReceipt(result);
  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--receipt");
  const keepTemp = process.argv.includes("--keep-temp");
  const json = process.argv.includes("--json");
  runSurfaceDoctor({ writeReceipt: write, keepTemp }).then((out) => {
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} Surface Factory + Solidify checks`);
      if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
      for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
    }
    process.exit(out.ok ? 0 : 4);
  }).catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}
