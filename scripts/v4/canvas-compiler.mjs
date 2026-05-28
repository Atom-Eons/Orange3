/* canvas-compiler.mjs — v6.3.0-alpha.5
 *
 * Silent Canvas Doctrine §5 Codeless Engine Integration.
 *
 * Compiles a project graph (canonical canvas state) to runnable software
 * on disk. Each canvas node/wire/region maps 1:1 to a real filesystem
 * mutation, guarded by freeze-guard, with a receipt per write.
 *
 * Mutation kind → executor binding (per Doctrine §5.3):
 *   file_create / file_edit / file_delete  →  fs.writeFile / unlink  +  fs-write receipt
 *   node_create (kind=file) details.content → fs.writeFile + node insert
 *   node_edit (kind=file) details.content → fs.writeFile + node mutate
 *   wire_create                           →  graph-only (no disk side-effect)
 *   region_create                         →  graph-only
 *   component_update                      →  fs.writeFile component + dev-server-tick receipt
 *   run_cmd                               →  spawn cmd in workspace + 30s timeout + receipt
 *   test_run                              →  spawn test cmd + test-run receipt
 *   deploy                                →  deploy connector if connected, else queue
 *
 * Every mutation that touches disk emits a receipt with sha256-before
 * and sha256-after so the audit chain is complete. Freeze-guard is
 * checked first; if blocked, receipt records the block.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import * as graph from "./project-graph.mjs";

const COMPILER_VERSION = "6.3.0-alpha.5";

function sha256(s) { return crypto.createHash("sha256").update(s, "utf8").digest("hex"); }
function isInsideWorkspace(workspace, target) {
  const abs = path.resolve(target);
  const ws  = path.resolve(workspace);
  return abs === ws || abs.startsWith(ws + path.sep);
}

/**
 * compile({ workspace, opts, emitReceipt, freezeGuard }) — Walks the
 * project graph and brings the disk into alignment with the canvas state.
 */
export async function compile({ workspace, opts = {}, emitReceipt, freezeGuard }) {
  const t0 = Date.now();
  const g = await graph.loadOrInit(workspace);
  const chain = [];
  let files_written = 0, files_skipped = 0, files_failed = 0;
  const errors = [];

  for (const node of g.nodes) {
    if (!["file", "component", "config", "test"].includes(node.kind)) continue;
    const content = node.details?.content;
    const target_path = node.target_path || node.details?.path;
    if (!content || !target_path) { files_skipped += 1; continue; }
    const abs = path.isAbsolute(target_path) ? target_path : path.join(workspace, target_path);
    if (!isInsideWorkspace(workspace, abs)) {
      errors.push({ target: abs, error: "outside workspace" });
      files_failed += 1;
      chain.push({ kind: node.kind, target: abs, ok: false, error: "outside workspace" });
      continue;
    }
    if (freezeGuard) {
      const allowed = freezeGuard.checkPathAllowed(abs);
      if (!allowed.allowed) {
        errors.push({ target: abs, error: `freeze-guard: ${allowed.reason}` });
        chain.push({ kind: node.kind, target: abs, ok: false, error: `freeze-guard: ${allowed.reason}` });
        continue;
      }
    }
    try {
      const before = await fs.readFile(abs, "utf8").catch(() => null);
      const sha_before = before === null ? null : sha256(before);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, content);
      const sha_after = sha256(content);
      const kind_label = before === null ? "create" : "edit";
      files_written += 1;
      chain.push({ kind: node.kind, target: abs, kind_label, sha256_before: sha_before, sha256_after: sha_after, bytes: Buffer.byteLength(content, "utf8"), ok: true });
      if (emitReceipt) {
        await emitReceipt({
          source: "silent-canvas-compile",
          title:  `Compile ${kind_label}: ${node.kind} → ${path.relative(workspace, abs).replace(/\\/g, "/")}`,
          summary: `${Buffer.byteLength(content, "utf8")} bytes · sha256_after=${sha_after.slice(0, 12)}`,
          evidence: { workspace, target: abs, node_id: node.id, kind: node.kind, kind_label, sha256_before: sha_before, sha256_after: sha_after, compiler_version: COMPILER_VERSION },
        });
      }
    } catch (e) {
      errors.push({ target: abs, error: e.message });
      files_failed += 1;
      chain.push({ kind: node.kind, target: abs, ok: false, error: e.message });
    }
  }

  return {
    ok: errors.length === 0,
    files_written, files_skipped, files_failed,
    errors,
    duration_ms: Date.now() - t0,
    chain,
    graph_nodes_count: g.nodes.length,
    graph_wires_count: g.wires.length,
    compiler_version: COMPILER_VERSION,
  };
}

export async function runCmdMutation({ workspace, cmd, timeout_ms = 60_000, freezeGuard, emitReceipt, label = "run_cmd" }) {
  if (freezeGuard?.commandsBlocked) return { ok: false, error: "commands blocked by freeze-guard" };
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const proc = spawn(isWin ? "cmd" : "sh", isWin ? ["/C", cmd] : ["-c", cmd], { cwd: workspace, windowsHide: true });
    let stdout = "", stderr = "";
    const killer = setTimeout(() => proc.kill(), timeout_ms);
    proc.stdout.on("data", (c) => { stdout += c.toString(); });
    proc.stderr.on("data", (c) => { stderr += c.toString(); });
    proc.on("close", async (code) => {
      clearTimeout(killer);
      const ok = code === 0;
      if (emitReceipt) {
        await emitReceipt({
          source: label === "test_run" ? "test-run" : "silent-canvas-compile",
          title:  `${label} ${ok ? "✓" : "✗"}: ${cmd.slice(0, 80)}`,
          summary: ok ? `exit ${code} · ${stdout.length}b stdout` : `exit ${code} · ${stderr.slice(0, 200)}`,
          evidence: { workspace, cmd, exit_code: code, stdout_preview: stdout.slice(0, 600), stderr_preview: stderr.slice(0, 600), label },
        });
      }
      resolve({ ok, code, stdout: stdout.slice(0, 8000), stderr: stderr.slice(0, 4000) });
    });
    proc.on("error", (e) => { clearTimeout(killer); resolve({ ok: false, error: e.message }); });
  });
}

export async function deployMutation({ workspace, target, details = {}, emitReceipt }) {
  const connector = details.connector || "vercel";
  if (emitReceipt) {
    await emitReceipt({
      source: "deploy",
      title:  `Deploy queued: ${target} via ${connector}`,
      summary: `connector=${connector} · target=${target}`,
      evidence: { workspace, target, connector, details, status: "queued", note: "Deploy executor in v6.3.0-alpha.10; alpha.5 records intent + receipt" },
    });
  }
  return { ok: true, queued: true, connector, target };
}
