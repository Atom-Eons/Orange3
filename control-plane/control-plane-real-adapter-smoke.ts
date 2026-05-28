#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ControlPlane, type Manifest } from "./engine.ts";
import { probeControlPlaneTopology } from "./topology.ts";

const ROOT = path.resolve(import.meta.dir, "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

function stamp(date = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rows(dbPath: string, orderId: string) {
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    return db.prepare(`
      SELECT step_id, state, attempts, hash, assigned_node, output_schema, context_hash, output_text, error_trace
      FROM receipt_log
      WHERE order_id = $order_id
      ORDER BY step_id
    `).all({ order_id: orderId }) as Array<Record<string, unknown>>;
  } finally {
    db.close();
  }
}

async function runManifest(manifestPath: string, dbPath: string) {
  const engine = new ControlPlane(manifestPath, { dbPath, mockMode: false });
  try {
    return await engine.ignite();
  } finally {
    engine.close();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const topology = await probeControlPlaneTopology({ probeModels: true });
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-control-plane-real-adapter-"));
  const contextDir = path.join(tempRoot, "context");
  await fs.mkdir(contextDir, { recursive: true });
  await fs.writeFile(path.join(contextDir, "order.txt"), "prove the real local adapter lane without repository mutation\n", "utf8");

  const orderId = `orgbx_real_adapter_smoke_${Date.now()}`;
  const manifest: Manifest = {
    order_id: orderId,
    status: "IN_PROGRESS",
    idempotency_key: `real-adapter-${Date.now()}`,
    dag_graph: {
      step_1: {
        task_type: "local_listener_health",
        assigned_node: "llama-cpp-local",
        explicit_context: ["context/order.txt"],
        output_schema: "TerminalTrace",
        retry_cap: 1,
        depends_on: [],
      },
      step_2: {
        task_type: "ai_box_model_probe",
        assigned_node: "ai-box-ollama-probe",
        explicit_context: ["step_1.output"],
        output_schema: "TerminalTrace",
        retry_cap: 1,
        depends_on: ["step_1"],
      },
      step_3: {
        task_type: "ai_box_runtime_command_contract",
        assigned_node: "ai-box-command-proof",
        explicit_context: ["step_2.output"],
        output_schema: "TerminalTrace",
        retry_cap: 1,
        depends_on: ["step_2"],
      },
    },
  };
  const manifestPath = path.join(tempRoot, "real-adapter.MANIFEST.json");
  const dbPath = path.join(tempRoot, "receipts.db");
  await writeJson(manifestPath, manifest);
  const run = await runManifest(manifestPath, dbPath);
  const receiptRows = rows(dbPath, orderId);
  const checks = [
    {
      name: "topology ready before real adapter smoke",
      ok: topology.ok,
      detail: topology.summary,
    },
    {
      name: "real adapter DAG completed",
      ok: run.ok && run.summary.completed === 3,
      detail: run.summary,
    },
    {
      name: "local llama adapter returned TerminalTrace",
      ok: receiptRows.some((row) => row.step_id === "step_1" && row.state === "COMPLETED" && String(row.output_text || "").includes("orangebox-n150-cpu-listener")),
    },
    {
      name: "AI Box triad adapter returned Ollama proof",
      ok: receiptRows.some((row) => row.step_id === "step_2" && row.state === "COMPLETED" && /qwen2\.5-coder:32b-instruct/i.test(String(row.output_text || ""))),
    },
    {
      name: "AI Box allowlisted command contract returned Checkmate proof",
      ok: receiptRows.some((row) => row.step_id === "step_3" && row.state === "COMPLETED" && /CHECKMATE_LIGHT_VERIFIED/i.test(String(row.output_text || ""))),
    },
  ];
  const ok = checks.every((check) => check.ok);
  const result = {
    ok,
    version: "orangebox-control-plane-real-adapter-smoke/v0.4",
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    temp_root: tempRoot,
    db_path: dbPath,
    manifest_path: manifestPath,
    checks,
    topology_summary: topology.summary,
    run_summary: run,
    receipt_rows: receiptRows.map((row) => ({
      ...row,
      output_text: String(row.output_text || "").slice(0, 1800),
      error_trace: row.error_trace ? String(row.error_trace).slice(0, 1200) : null,
    })),
    safety: {
      no_paid_api_call_made: true,
      no_model_generation_call_made_on_n150: true,
      repository_mutation: false,
      ai_box_probe: "read-only triad/model inventory proof through local sidecar",
      ai_box_command_contract: "fixed read-only sidecar command only; arbitrary manifest shell is not accepted",
    },
    rollback: {
      repo_mutation: "control-plane v0.4 source files and package scripts only",
      runtime_mutation: "temporary smoke DB under OS temp plus optional JSON receipt",
      recovery_action: "Delete the generated receipt/temp DB; disable real adapters by omitting ORANGEBOX_CONTROL_PLANE_REAL_NODES=1 for normal control-plane runs.",
    },
  };

  if (Bun.argv.includes("--receipt")) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-control-plane-real-adapter-smoke-${stamp()}.json`);
    const withReceipt = { ...result, receipt_path: receiptPath };
    await writeJson(receiptPath, withReceipt);
    console.log(JSON.stringify(withReceipt, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
