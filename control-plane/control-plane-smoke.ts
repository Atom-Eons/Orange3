#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAdapterDoctor } from "./adapters.ts";
import { ControlPlane, type Manifest } from "./engine.ts";

type Check = { name: string; pass: boolean; detail?: string };

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

function row(dbPath: string, orderId: string, stepId: string) {
  const db = new Database(dbPath, { readonly: true, strict: true });
  try {
    return db.prepare("SELECT state, attempts, hash, context_hash, route_policy_json FROM receipt_log WHERE order_id = $order_id AND step_id = $step_id")
      .get({ order_id: orderId, step_id: stepId }) as { state: string; attempts: number; hash: string; context_hash?: string; route_policy_json?: string } | null;
  } finally {
    db.close();
  }
}

async function runManifest(manifestPath: string, dbPath: string, mockMode = true) {
  const engine = new ControlPlane(manifestPath, { dbPath, mockMode });
  try {
    return await engine.ignite();
  } finally {
    engine.close();
  }
}

async function main() {
  const startedAt = new Date().toISOString();
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-control-plane-"));
  const contextDir = path.join(tempRoot, "context");
  await fs.mkdir(contextDir, { recursive: true });
  await fs.writeFile(path.join(contextDir, "input.txt"), "mission=prove deterministic control plane\n", "utf8");
  await fs.writeFile(path.join(contextDir, "tokens.json"), "{\"surface\":\"#070809\",\"accent\":\"#ff8a2a\"}\n", "utf8");

  const dbPath = path.join(tempRoot, "receipts.db");
  const successOrder = `orgbx_ui_094_smoke_${Date.now()}`;
  const successManifest: Manifest = {
    order_id: successOrder,
    status: "IN_PROGRESS",
    idempotency_key: "smoke-idempotency-key",
    dag_graph: {
      step_1: {
        task_type: "synthesis",
        assigned_node: "qwen3-coder-32b",
        explicit_context: ["context/input.txt", "context/tokens.json"],
        output_schema: "ReactComponentStrict",
        retry_cap: 3,
        depends_on: [],
      },
      step_2: {
        task_type: "lint_relative_luminance",
        assigned_node: "pod-alpha-swarm",
        explicit_context: ["step_1.output"],
        output_schema: "LuminanceReport",
        retry_cap: 3,
        depends_on: ["step_1"],
        mock: { fail_validation_attempts: 1 },
      },
      step_3: {
        task_type: "os_execution",
        assigned_node: "agy-cli",
        explicit_context: ["step_1.output", "step_2.output"],
        output_schema: "TerminalTrace",
        retry_cap: 1,
        depends_on: ["step_1", "step_2"],
      },
    },
  };
  const successPath = path.join(tempRoot, "success.MANIFEST.json");
  await writeJson(successPath, successManifest);

  const first = await runManifest(successPath, dbPath);
  const second = await runManifest(successPath, dbPath);
  const stepOneRow = row(dbPath, successOrder, "step_1");
  const retryRow = row(dbPath, successOrder, "step_2");

  const deadlockOrder = `orgbx_deadlock_smoke_${Date.now()}`;
  const deadlockManifest: Manifest = {
    order_id: deadlockOrder,
    status: "IN_PROGRESS",
    idempotency_key: "deadlock-idempotency-key",
    dag_graph: {
      step_1: {
        task_type: "synthesis",
        assigned_node: "qwen3-coder-32b",
        explicit_context: ["context/input.txt"],
        output_schema: "ReactComponentStrict",
        retry_cap: 2,
        depends_on: [],
        mock: { always_fail_validation: true },
      },
    },
  };
  const deadlockPath = path.join(tempRoot, "deadlock.MANIFEST.json");
  await writeJson(deadlockPath, deadlockManifest);
  const deadlock = await runManifest(deadlockPath, dbPath);
  const deadlockRow = row(dbPath, deadlockOrder, "step_1");

  const realDisabledOrder = `orgbx_real_disabled_smoke_${Date.now()}`;
  const realDisabledManifest: Manifest = {
    order_id: realDisabledOrder,
    status: "IN_PROGRESS",
    idempotency_key: "real-disabled-idempotency-key",
    dag_graph: {
      step_1: {
        task_type: "synthesis",
        assigned_node: "qwen3-coder-32b",
        explicit_context: ["context/input.txt"],
        output_schema: "ReactComponentStrict",
        retry_cap: 1,
        depends_on: [],
      },
    },
  };
  const realDisabledPath = path.join(tempRoot, "real-disabled.MANIFEST.json");
  await writeJson(realDisabledPath, realDisabledManifest);
  const realDisabled = await runManifest(realDisabledPath, dbPath, false);
  const realDisabledRow = row(dbPath, realDisabledOrder, "step_1");
  const adapterDoctor = await runAdapterDoctor();

  const checks: Check[] = [
    { name: "Bun SQLite receipt DB created", pass: await Bun.file(dbPath).exists(), detail: dbPath },
    { name: "DAG success order completed", pass: first.ok && first.summary.completed === 3, detail: JSON.stringify(first.summary) },
    { name: "Explicit context hash is recorded", pass: Boolean(stepOneRow?.context_hash), detail: JSON.stringify(stepOneRow) },
    { name: "Route policy records escalation advisor", pass: Boolean(stepOneRow?.route_policy_json && JSON.parse(stepOneRow.route_policy_json).escalation_advisor), detail: stepOneRow?.route_policy_json },
    { name: "Retry cap allows recovery before escalation", pass: retryRow?.state === "COMPLETED" && retryRow.attempts === 2, detail: JSON.stringify(retryRow) },
    { name: "Second run is idempotent", pass: second.ok && second.dispatched_count === 0, detail: `dispatched=${second.dispatched_count}` },
    { name: "Deadlock escalates instead of looping", pass: deadlock.status === "ESCALATED" && deadlockRow?.state === "ESCALATED" && deadlockRow.attempts === 2, detail: JSON.stringify(deadlock.summary) },
    { name: "Adapter doctor is no-token and has disabled guard", pass: adapterDoctor.ok && adapterDoctor.no_token_calls && adapterDoctor.summary.disabled >= 1, detail: JSON.stringify(adapterDoctor.summary) },
    { name: "Real node execution is still pre-wire disabled", pass: realDisabled.status === "ESCALATED" && realDisabledRow?.state === "ESCALATED", detail: JSON.stringify(realDisabled.summary) },
  ];

  const ok = checks.every((check) => check.pass);
  const receipt = {
    ok,
    version: "orangebox-bun-control-plane-smoke/v0.1",
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    temp_root: tempRoot,
    db_path: dbPath,
    checks,
    first_summary: first,
    second_summary: second,
    deadlock_summary: deadlock,
    real_disabled_summary: realDisabled,
    adapter_doctor: adapterDoctor,
    rollback: {
      repo_mutation: "control-plane source files only",
      runtime_mutation: "temporary smoke DB under OS temp plus this receipt",
      recovery_action: "Delete control-plane files or discard the smoke receipt if the slice is superseded.",
    },
  };
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const receiptPath = path.join(RECEIPTS_DIR, `orangebox-bun-control-plane-smoke-${stamp()}.json`);
  await writeJson(receiptPath, { ...receipt, receipt_path: receiptPath });
  console.log(JSON.stringify({ ok, checks, receipt_path: receiptPath }, null, 2));
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
