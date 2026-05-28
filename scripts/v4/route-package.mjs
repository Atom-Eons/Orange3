#!/usr/bin/env node
/* route-package.mjs - package, receipt, and promote current Mission Spine route.
 *
 * Package means evidence manifest, not a pretty claim. Promotion refuses green
 * unless the current route has passing proof gates, browser proof, route
 * receipts, rollback data, and a package manifest.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { completeCurrentRoute, loadCurrentRoute, updateCurrentRouteProgress } from "./route-state.mjs";

export const ROUTE_PACKAGE_VERSION = "orangebox-route-package/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(file));
  return hash.digest("hex");
}

async function fileRecord(file, kind) {
  if (!file || !fsSync.existsSync(file)) return null;
  const stat = await fs.stat(file);
  return {
    kind,
    path: file,
    bytes: stat.size,
    sha256: await sha256File(file),
    modified_at: stat.mtime.toISOString(),
  };
}

async function readJsonIf(file) {
  if (!file || !fsSync.existsSync(file)) return null;
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; }
}

function browserProofScreenshotPaths(data = {}) {
  const candidates = [
    data.screenshot,
    data.screenshot_path,
    data.desktop_screenshot,
    data.compact_screenshot,
    data.desktopPath,
    data.compactPath,
  ].filter(Boolean);
  return [...new Set(candidates)].filter((file) => fsSync.existsSync(file));
}

async function latestBrowserProofs(limit = 4) {
  const proofDir = path.join(ROOT, "proof");
  if (!fsSync.existsSync(proofDir)) return [];
  const entries = await fs.readdir(proofDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(proofDir, entry.name));
  const proofs = [];
  for (const file of jsonFiles) {
    const data = await readJsonIf(file);
    if (data?.ok !== true) continue;
    const screenshots = browserProofScreenshotPaths(data);
    const stat = await fs.stat(file);
    proofs.push({
      file,
      screenshot: screenshots[0] || null,
      screenshots,
      checked_at: data.checked_at || stat.mtime.toISOString(),
      report: data,
    });
  }
  return proofs
    .sort((a, b) => String(b.checked_at).localeCompare(String(a.checked_at)))
    .slice(0, limit);
}

function proofGateSummary(route) {
  const gates = Array.isArray(route?.proof_gates) ? route.proof_gates : [];
  const results = route?.proof_gate_results || {};
  const rows = gates.map((gate) => ({
    id: gate.id,
    required: gate.required !== false,
    status: results[gate.id]?.status || "pending",
    receipt_path: results[gate.id]?.receipt_path || null,
    command: gate.command || "",
  }));
  const required = rows.filter((row) => row.required);
  const failed = required.filter((row) => row.status !== "pass");
  return {
    rows,
    required: required.length,
    passed_required: required.length - failed.length,
    failed_required: failed.length,
    ok: failed.length === 0 && required.length > 0,
  };
}

function packageDir(dataRoot, routeId, stamp = stampForFile()) {
  return path.join(dataRoot, "operating-spine", "packages", `${routeId}-${stamp}`);
}

async function writeSummaryMarkdown(file, manifest) {
  const lines = [
    `# ORANGEBOX Route Package`,
    ``,
    `- Route: ${manifest.route_id}`,
    `- Objective: ${manifest.objective}`,
    `- Created: ${manifest.created_at}`,
    `- Status: ${manifest.ok ? "PASS" : "BLOCKED"}`,
    `- Current macro after package: ${manifest.progress?.current_macro?.id || "unknown"}`,
    ``,
    `## Evidence`,
    `- Proof gates: ${manifest.proof_gates.passed_required}/${manifest.proof_gates.required} required passed`,
    `- Browser proofs: ${manifest.browser_proofs.length}`,
    `- Evidence files: ${manifest.files.length}`,
    `- Rollback present: ${manifest.rollback_present}`,
    ``,
    `## Failures`,
    ...(manifest.failures.length ? manifest.failures.map((item) => `- ${item}`) : ["- none"]),
    ``,
  ];
  await fs.writeFile(file, lines.join("\n"), "utf8");
}

export async function packageCurrentRoute({
  dataRoot = defaultDataRoot(),
  writeReceipt = false,
  postPartyLine = null,
} = {}) {
  const loaded = await loadCurrentRoute({ dataRoot });
  const route = loaded.current;
  if (!route?.route_id) throw new Error("no current Mission Spine route to package");

  const gateSummary = proofGateSummary(route);
  const browserProofs = await latestBrowserProofs(4);
  const files = [];
  for (const [file, kind] of [
    [loaded.current_route_path, "current_route_state"],
    [route.route_file, "route_packet"],
    [route.receipt?.path, "route_receipt"],
  ]) {
    const rec = await fileRecord(file, kind);
    if (rec) files.push(rec);
  }
  for (const gate of gateSummary.rows) {
    const rec = await fileRecord(gate.receipt_path, `proof_gate:${gate.id}`);
    if (rec) files.push(rec);
  }
  for (const proof of browserProofs) {
    const report = await fileRecord(proof.file, "browser_proof_report");
    if (report) files.push(report);
    for (const screenshotPath of proof.screenshots || []) {
      const screenshot = await fileRecord(screenshotPath, "browser_proof_screenshot");
      if (screenshot) files.push(screenshot);
    }
  }

  const failures = [];
  if (!gateSummary.ok) failures.push(`required proof gates incomplete: ${gateSummary.passed_required}/${gateSummary.required}`);
  if (!browserProofs.length) failures.push("no passing browser proof JSON found in C:\\AtomEons\\orangebox\\proof");
  if (!route.rollback_path) failures.push("rollback_path missing from current route");
  if (!route.route_file || !fsSync.existsSync(route.route_file)) failures.push("route packet file missing");
  if (!route.receipt?.path || !fsSync.existsSync(route.receipt.path)) failures.push("route receipt missing");

  const dir = packageDir(dataRoot, route.route_id);
  await fs.mkdir(dir, { recursive: true });
  const manifestPath = path.join(dir, "route-package-manifest.json");
  const summaryPath = path.join(dir, "README.md");
  const manifest = {
    ok: failures.length === 0,
    version: ROUTE_PACKAGE_VERSION,
    created_at: new Date().toISOString(),
    route_id: route.route_id,
    project: route.project || "orangebox",
    objective: route.objective || "",
    current_route_path: loaded.current_route_path,
    package_dir: dir,
    manifest_path: manifestPath,
    summary_path: summaryPath,
    proof_gates: gateSummary,
    browser_proofs: browserProofs.map((proof) => ({
      report_path: proof.file,
      screenshot_path: proof.screenshot,
      screenshot_paths: proof.screenshots || [],
      checked_at: proof.checked_at,
    })),
    rollback_present: !!route.rollback_path,
    rollback_path: route.rollback_path || null,
    files,
    failures,
    progress: null,
    receipt_path: null,
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeSummaryMarkdown(summaryPath, manifest);

  if (manifest.ok) {
    const progress = await updateCurrentRouteProgress({
      macroId: "package",
      status: "done",
      proofNote: `route package manifest ${manifestPath}`,
      actor: "route-package",
      dataRoot,
      postPartyLine: postPartyLine ? (text) => postPartyLine(text) : null,
    });
    manifest.progress = {
      macro_id: progress.macro_id,
      previous_status: progress.previous_status,
      status: progress.status,
      current_macro: progress.projection?.current_macro || null,
    };
  }

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await writeSummaryMarkdown(summaryPath, manifest);

  if (writeReceipt) {
    await fs.mkdir(path.join(ROOT, "receipts"), { recursive: true });
    manifest.receipt_path = path.join(ROOT, "receipts", `orangebox-route-package-${stampForFile()}.json`);
    await fs.writeFile(manifest.receipt_path, JSON.stringify({
      ok: manifest.ok,
      source: "orangebox-route-package",
      title: `Route package ${manifest.ok ? "ready" : "blocked"}: ${route.route_id}`,
      created_at: new Date().toISOString(),
      summary: `${gateSummary.passed_required}/${gateSummary.required} gates, ${browserProofs.length} browser proofs, ${failures.length} failures`,
      evidence: {
        manifest_path: manifestPath,
        summary_path: summaryPath,
        failures,
      },
    }, null, 2) + "\n", "utf8");
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  }

  return manifest;
}

export async function synthesizeRouteReceipt({
  dataRoot = defaultDataRoot(),
  postPartyLine = null,
} = {}) {
  const loaded = await loadCurrentRoute({ dataRoot });
  const route = loaded.current;
  if (!route?.route_id) throw new Error("no current Mission Spine route to receipt");
  const packagesRoot = path.join(dataRoot, "operating-spine", "packages");
  const packages = fsSync.existsSync(packagesRoot)
    ? (await fs.readdir(packagesRoot, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(route.route_id))
      .map((entry) => path.join(packagesRoot, entry.name, "route-package-manifest.json"))
      .filter((file) => fsSync.existsSync(file))
    : [];
  const manifests = [];
  for (const file of packages) {
    const data = await readJsonIf(file);
    if (data) manifests.push(data);
  }
  manifests.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const manifest = manifests[0] || null;
  const failures = [];
  if (!manifest?.ok) failures.push("latest package manifest is missing or blocked");
  if (!route.rollback_path) failures.push("rollback path missing");
  if (!route.proof_gate_last_run || route.proof_gate_last_run.failed_required !== 0) failures.push("proof gate last run is missing or failed");

  await fs.mkdir(path.join(ROOT, "receipts"), { recursive: true });
  const receiptPath = path.join(ROOT, "receipts", `orangebox-route-closeout-${stampForFile()}.json`);
  const receipt = {
    ok: failures.length === 0,
    source: "orangebox-route-closeout",
    title: `Route closeout ${failures.length ? "blocked" : "ready"}: ${route.route_id}`,
    created_at: new Date().toISOString(),
    route_id: route.route_id,
    objective: route.objective,
    current_route_path: loaded.current_route_path,
    package_manifest: manifest?.manifest_path || null,
    proof_gate_last_run: route.proof_gate_last_run || null,
    progress_events: route.progress_events || [],
    rollback_path: route.rollback_path || null,
    failures,
  };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");

  let progress = null;
  if (receipt.ok) {
    progress = await updateCurrentRouteProgress({
      macroId: "receipt",
      status: "done",
      proofNote: `route closeout receipt ${receiptPath}`,
      actor: "route-closeout",
      dataRoot,
      postPartyLine: postPartyLine ? (text) => postPartyLine(text) : null,
    });
  }

  return {
    ok: receipt.ok,
    version: "orangebox-route-closeout/v1",
    route_id: route.route_id,
    receipt_path: receiptPath,
    package_manifest: manifest?.manifest_path || null,
    failures,
    progress: progress ? {
      macro_id: progress.macro_id,
      previous_status: progress.previous_status,
      status: progress.status,
      current_macro: progress.projection?.current_macro || null,
    } : null,
  };
}

export async function promoteCurrentRoute({
  dataRoot = defaultDataRoot(),
  writeReceipt = false,
  postPartyLine = null,
} = {}) {
  const loaded = await loadCurrentRoute({ dataRoot });
  const route = loaded.current;
  if (!route?.route_id) throw new Error("no current Mission Spine route to promote");
  const failures = [];
  if (!route.proof_gate_last_run || route.proof_gate_last_run.failed_required !== 0) failures.push("proof gates are not passing");
  if (!route.rollback_path) failures.push("rollback path missing");
  const packageResult = await packageCurrentRoute({ dataRoot, writeReceipt: false });
  if (!packageResult.ok) failures.push(...packageResult.failures.map((item) => `package: ${item}`));
  const closeout = await synthesizeRouteReceipt({ dataRoot });
  if (!closeout.ok) failures.push(...closeout.failures.map((item) => `receipt: ${item}`));

  const promotionDir = path.join(dataRoot, "operating-spine", "promotions");
  await fs.mkdir(promotionDir, { recursive: true });
  const promotionPath = path.join(promotionDir, `${route.route_id}-${stampForFile()}.json`);
  let progress = null;
  if (!failures.length) {
    progress = await updateCurrentRouteProgress({
      macroId: "promote",
      status: "done",
      proofNote: `promotion record ${promotionPath}`,
      actor: "route-promote",
      dataRoot,
      postPartyLine: postPartyLine ? (text) => postPartyLine(text) : null,
    });
    await completeCurrentRoute({
      dataRoot,
      proofNote: `promotion completed at ${promotionPath}`,
      actor: "route-promote",
      postPartyLine: postPartyLine ? (text) => postPartyLine(text) : null,
    });
  }
  const result = {
    ok: failures.length === 0,
    version: "orangebox-route-promotion/v1",
    created_at: new Date().toISOString(),
    route_id: route.route_id,
    promotion_path: promotionPath,
    package_manifest: packageResult.manifest_path,
    closeout_receipt: closeout.receipt_path,
    failures,
    progress: progress ? {
      macro_id: progress.macro_id,
      previous_status: progress.previous_status,
      status: progress.status,
      current_macro: progress.projection?.current_macro || null,
    } : null,
    receipt_path: null,
  };
  await fs.writeFile(promotionPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  if (writeReceipt) {
    await fs.mkdir(path.join(ROOT, "receipts"), { recursive: true });
    result.receipt_path = path.join(ROOT, "receipts", `orangebox-route-promotion-${stampForFile()}.json`);
    await fs.writeFile(result.receipt_path, JSON.stringify(result, null, 2) + "\n", "utf8");
    await fs.writeFile(promotionPath, JSON.stringify(result, null, 2) + "\n", "utf8");
  }
  return result;
}

async function main() {
  const cmd = process.argv[2] || "package";
  const json = process.argv.includes("--json");
  const receipt = process.argv.includes("--receipt");
  let out;
  if (cmd === "package") out = await packageCurrentRoute({ writeReceipt: receipt });
  else if (cmd === "receipt") out = await synthesizeRouteReceipt();
  else if (cmd === "promote") out = await promoteCurrentRoute({ writeReceipt: receipt });
  else throw new Error(`unknown route-package command: ${cmd}`);
  if (json) console.log(JSON.stringify(out, null, 2));
  else console.log(`${out.ok ? "PASS" : "FAIL"} ${cmd} ${out.route_id || ""}`);
  if (!out.ok) process.exit(4);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}
