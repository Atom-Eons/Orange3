#!/usr/bin/env bun

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { runAdapterDoctor } from "./adapters.ts";
import { buildExplicitContextPack } from "./context-packer.ts";
import { ControlPlane, type Manifest, type Step } from "./engine.ts";
import { routePolicyForStep } from "./model-policy.ts";

type Check = {
  name: string;
  required: boolean;
  ok: boolean;
  status: "pass" | "fail" | "warning";
  detail?: unknown;
  error?: string;
};

const ROOT = path.resolve(import.meta.dir, "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const KNOWN_SCHEMAS = new Set(["ReactComponentStrict", "LuminanceReport", "TerminalTrace", "DeadlockHint"]);

function stamp(date = new Date()) {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function check(name: string, ok: boolean, detail?: unknown, required = true): Check {
  return {
    name,
    required,
    ok,
    status: ok ? "pass" : required ? "fail" : "warning",
    detail,
  };
}

async function gate(name: string, fn: () => Promise<unknown>, required = true): Promise<Check> {
  try {
    const detail = await fn();
    const ok = typeof detail === "object" && detail !== null && "ok" in detail ? Boolean((detail as { ok: unknown }).ok) : Boolean(detail);
    return check(name, ok, detail, required);
  } catch (error) {
    return {
      name,
      required,
      ok: false,
      status: required ? "fail" : "warning",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readManifest(manifestPath: string) {
  return JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
}

async function writeJson(file: string, value: unknown) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const manifestPathArg = Bun.argv.find((arg) => arg.endsWith(".json")) || path.join(import.meta.dir, "MANIFEST.example.json");
  const manifestPath = path.resolve(manifestPathArg);
  const manifestRoot = path.dirname(manifestPath);
  const manifest = await readManifest(manifestPath);
  const checks: Check[] = [];
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-control-plane-doctor-"));

  checks.push(await gate("manifest loads and DAG is acyclic", async () => {
    const dbPath = path.join(tempRoot, "manifest-load.db");
    const engine = new ControlPlane(manifestPath, { dbPath, mockMode: true });
    engine.close();
    return {
      ok: true,
      manifest_path: manifestPath,
      order_id: manifest.order_id,
      step_count: Object.keys(manifest.dag_graph).length,
    };
  }));

  checks.push(await gate("unknown output schemas are blocked", async () => {
    const unknown = Object.entries(manifest.dag_graph)
      .filter(([, step]) => !KNOWN_SCHEMAS.has(step.output_schema))
      .map(([stepId, step]) => ({ step_id: stepId, schema: step.output_schema }));
    return { ok: unknown.length === 0, known_schemas: [...KNOWN_SCHEMAS], unknown };
  }));

  checks.push(await gate("explicit context packs only requested refs", async () => {
    const [stepId, step] = Object.entries(manifest.dag_graph).find(([, candidate]) => candidate.explicit_context.length > 0) || [];
    if (!stepId || !step) return { ok: false, reason: "No explicit context step found." };
    const pack = await buildExplicitContextPack(stepId, step, {
      rootDir: manifestRoot,
      resolver: {
        getStepOutput: () => null,
        getStepHash: () => null,
        getStepError: () => null,
      },
    });
    const chunkRefs = pack.chunks.map((chunk) => chunk.ref);
    return {
      ok: chunkRefs.length === step.explicit_context.length && chunkRefs.every((ref, index) => ref === step.explicit_context[index]),
      step_id: stepId,
      total_bytes: pack.total_bytes,
      sha256: pack.sha256,
      refs: chunkRefs,
    };
  }));

  checks.push(await gate("context root escape is rejected", async () => {
    const step: Step = {
      task_type: "synthesis",
      assigned_node: "qwen3-coder-32b",
      explicit_context: ["../package.json"],
      output_schema: "ReactComponentStrict",
      retry_cap: 1,
      depends_on: [],
    };
    try {
      await buildExplicitContextPack("escape_step", step, {
        rootDir: manifestRoot,
        resolver: {
          getStepOutput: () => null,
          getStepHash: () => null,
          getStepError: () => null,
        },
      });
      return { ok: false, reason: "escape was allowed" };
    } catch (error) {
      return { ok: /escapes manifest root/.test(error instanceof Error ? error.message : String(error)), error: String(error) };
    }
  }));

  checks.push(await gate("cycle fixture is rejected before execution", async () => {
    const contextDir = path.join(tempRoot, "context");
    await fs.mkdir(contextDir, { recursive: true });
    await fs.writeFile(path.join(contextDir, "input.txt"), "cycle fixture\n", "utf8");
    const cycleManifest: Manifest = {
      order_id: "orgbx_cycle_guard",
      idempotency_key: "cycle-guard",
      dag_graph: {
        step_1: {
          task_type: "synthesis",
          assigned_node: "qwen3-coder-32b",
          explicit_context: ["context/input.txt"],
          output_schema: "ReactComponentStrict",
          retry_cap: 1,
          depends_on: ["step_2"],
        },
        step_2: {
          task_type: "lint_relative_luminance",
          assigned_node: "pod-alpha-swarm",
          explicit_context: ["step_1.output"],
          output_schema: "LuminanceReport",
          retry_cap: 1,
          depends_on: ["step_1"],
        },
      },
    };
    const file = path.join(tempRoot, "cycle.MANIFEST.json");
    await writeJson(file, cycleManifest);
    try {
      const engine = new ControlPlane(file, { dbPath: path.join(tempRoot, "cycle.db"), mockMode: true });
      engine.close();
      return { ok: false, reason: "cycle was allowed" };
    } catch (error) {
      return { ok: /cycle/i.test(error instanceof Error ? error.message : String(error)), error: String(error) };
    }
  }));

  checks.push(await gate("model route policy records escalation lanes", async () => {
    const policies = Object.entries(manifest.dag_graph).map(([stepId, step]) => routePolicyForStep(stepId, step));
    const missingAdvisor = policies.filter((policy) => !policy.escalation_advisor || !policy.fallback_chain.length);
    return {
      ok: missingAdvisor.length === 0 && policies.every((policy) => policy.api_last_resort === true),
      policies,
    };
  }));

  checks.push(await gate("adapter doctor remains no-token and guarded", async () => {
    const adapterDoctor = await runAdapterDoctor();
    return {
      ok: adapterDoctor.ok && adapterDoctor.no_token_calls === true && adapterDoctor.summary.disabled >= 1,
      summary: adapterDoctor.summary,
      real_execution_enabled: adapterDoctor.real_execution_enabled,
      no_token_calls: adapterDoctor.no_token_calls,
    };
  }));

  const failures = checks.filter((item) => item.required && !item.ok);
  const warnings = checks.filter((item) => !item.required && !item.ok);
  const result = {
    ok: failures.length === 0,
    version: "orangebox-control-plane-doctor/v0.2",
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    manifest_path: manifestPath,
    temp_root: tempRoot,
    summary: {
      checks: checks.length,
      passed: checks.filter((item) => item.ok).length,
      failed: failures.length,
      warnings: warnings.length,
    },
    checks,
    failures,
    warnings,
    rollback: {
      repo_mutation: "control-plane v0.2 source files and package scripts only",
      runtime_mutation: "temporary doctor files under OS temp plus optional JSON receipt",
      recovery_action: "Remove control-plane v0.2 files or revert package script additions if superseded.",
    },
  };

  if (Bun.argv.includes("--receipt")) {
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-control-plane-doctor-${stamp()}.json`);
    await writeJson(receiptPath, { ...result, receipt_path: receiptPath });
    console.log(JSON.stringify({ ...result, receipt_path: receiptPath }, null, 2));
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
  if (!result.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
