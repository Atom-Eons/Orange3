/* solidify.mjs — v6.3.0-alpha.8
 *
 * Productized Silent Canvas compile path.
 *
 * Solidify turns the current project graph into a proof bundle:
 *   1. pre-solidify graph snapshot
 *   2. canvas compile to disk through canvas-compiler
 *   3. post-solidify graph snapshot
 *   4. deterministic manifest with hashes, chain, and residual risk
 *   5. single solidify receipt
 *
 * It deliberately does not deploy. Production deploys stay behind an explicit
 * operator approval gate and a later launch executor.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as compiler from "./canvas-compiler.mjs";
import * as graph from "./project-graph.mjs";

const SOLIDIFY_VERSION = "6.3.0-alpha.8";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}

function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function projectHash(workspace) {
  return crypto.createHash("sha256").update(path.resolve(workspace)).digest("hex").slice(0, 16);
}

function safeStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function chainSummary(chain = []) {
  const written = chain.filter(x => x.ok === true);
  const failed = chain.filter(x => x.ok === false);
  return {
    total: chain.length,
    ok: written.length,
    failed: failed.length,
    bytes_written: written.reduce((sum, x) => sum + Number(x.bytes || 0), 0),
    targets: chain.map(x => ({
      target: x.target,
      ok: x.ok,
      kind: x.kind,
      sha256_after: x.sha256_after || null,
      error: x.error || null,
    })),
  };
}

export async function solidify({ workspace, dataRoot = defaultDataRoot(), opts = {}, emitReceipt, freezeGuard } = {}) {
  if (!workspace) throw new Error("workspace required");
  const absWorkspace = path.resolve(workspace);
  const t0 = Date.now();
  const runId = "solidify-" + crypto.randomUUID().slice(0, 12);
  const stamp = safeStamp();
  const outDir = path.join(dataRoot, "solidify", projectHash(absWorkspace), stamp);
  await fs.mkdir(outDir, { recursive: true });

  const preSnapshot = await graph.snapshot(absWorkspace, "pre-solidify");
  const compile = await compiler.compile({
    workspace: absWorkspace,
    opts,
    emitReceipt,
    freezeGuard,
  });
  const postSnapshot = await graph.snapshot(absWorkspace, "post-solidify");

  const manifest = {
    solidify_version: SOLIDIFY_VERSION,
    run_id: runId,
    created_at: new Date().toISOString(),
    workspace: absWorkspace,
    ok: compile.ok,
    mode: "proof-bundle-no-deploy",
    deployment: {
      attempted: false,
      reason: "Production deploy requires explicit operator approval and a launch executor.",
    },
    snapshots: {
      pre: preSnapshot,
      post: postSnapshot,
    },
    compile: {
      ok: compile.ok,
      files_written: compile.files_written,
      files_skipped: compile.files_skipped,
      files_failed: compile.files_failed,
      errors: compile.errors,
      duration_ms: compile.duration_ms,
      graph_nodes_count: compile.graph_nodes_count,
      graph_wires_count: compile.graph_wires_count,
      compiler_version: compile.compiler_version,
      chain: chainSummary(compile.chain),
    },
    residual_risk: [
      "Solidify v0.1 writes a proof bundle and compile artifacts only; it does not deploy.",
      "Infrastructure generation is intentionally withheld until a reviewed launch executor exists.",
      "Generated files are only as complete as the current project graph node content.",
    ],
  };
  const manifestBody = JSON.stringify(manifest, null, 2);
  const manifestSha = sha256(manifestBody);
  manifest.integrity = {
    deterministic_body_sha256: manifestSha,
    manifest_algorithm: "sha256(json_without_integrity)",
  };
  const finalBody = JSON.stringify(manifest, null, 2);
  const manifestPath = path.join(outDir, "solidify-manifest.json");
  await fs.writeFile(manifestPath, finalBody);

  const result = {
    ok: compile.ok,
    run_id: runId,
    solidify_version: SOLIDIFY_VERSION,
    workspace: absWorkspace,
    manifest_path: manifestPath,
    manifest_sha256: sha256(finalBody),
    duration_ms: Date.now() - t0,
    files_written: compile.files_written,
    files_skipped: compile.files_skipped,
    files_failed: compile.files_failed,
    errors: compile.errors,
    snapshots: manifest.snapshots,
    chain: manifest.compile.chain,
  };

  if (emitReceipt) {
    await emitReceipt({
      source: "silent-canvas-solidify",
      title: `Solidify ${compile.ok ? "complete" : "blocked"}: ${path.basename(absWorkspace)}`,
      summary: `${compile.files_written} written / ${compile.files_skipped} skipped / ${compile.files_failed} failed · manifest=${path.basename(manifestPath)}`,
      evidence: {
        run_id: runId,
        workspace: absWorkspace,
        manifest_path: manifestPath,
        manifest_sha256: result.manifest_sha256,
        files_written: compile.files_written,
        files_skipped: compile.files_skipped,
        files_failed: compile.files_failed,
        errors_count: compile.errors.length,
        pre_snapshot: preSnapshot.file,
        post_snapshot: postSnapshot.file,
        deployment_attempted: false,
        solidify_version: SOLIDIFY_VERSION,
      },
    });
  }

  return result;
}

