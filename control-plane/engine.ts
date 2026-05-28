#!/usr/bin/env bun

import { Database } from "bun:sqlite";
import { EventEmitter } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createDefaultAdapterRegistry, type AdapterRegistry } from "./adapters.ts";
import { buildExplicitContextPack, summarizeContextPack, type ContextPack, type ContextResolver } from "./context-packer.ts";
import { escalationAdvisorForStep, routePolicyForStep } from "./model-policy.ts";

export type StepState = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "ESCALATED";
export type OrderStatus = "COMPLETED" | "ESCALATED" | "BLOCKED";

export interface Step {
  task_type: string;
  assigned_node: string;
  explicit_context: string[];
  output_schema: string;
  retry_cap: number;
  depends_on: string[];
  context_max_bytes?: number;
  mock?: {
    response?: unknown;
    fail_validation_attempts?: number;
    always_fail_validation?: boolean;
  };
}

export interface Manifest {
  order_id: string;
  status?: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  idempotency_key: string;
  dag_graph: Record<string, Step>;
}

export interface ControlPlaneOptions {
  dbPath?: string;
  rootDir?: string;
  mockMode?: boolean;
  adapterRegistry?: AdapterRegistry;
}

interface ReceiptRow {
  state: StepState;
  attempts: number;
  hash?: string | null;
  context_hash?: string | null;
  route_policy_json?: string | null;
  output_text?: string | null;
  error_trace?: string | null;
}

function defaultDbPath() {
  const dataRoot = Bun.env.ORANGEBOX_DATA_ROOT || Bun.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
  return path.join(dataRoot, "control-plane", "receipts.db");
}

export class ControlPlane extends EventEmitter {
  private manifest: Manifest;
  private manifestPath: string;
  private rootDir: string;
  private db: Database;
  private pendingSteps: Set<string>;
  private activeTasks = new Map<string, Promise<void>>();
  private dispatchedCount = 0;
  private mockMode: boolean;
  private adapterRegistry: AdapterRegistry;

  constructor(manifestPath: string, options: ControlPlaneOptions = {}) {
    super();
    this.manifestPath = path.resolve(manifestPath);
    this.rootDir = path.resolve(options.rootDir || path.dirname(this.manifestPath));
    this.mockMode = options.mockMode ?? Bun.env.ORANGEBOX_CONTROL_PLANE_REAL_NODES !== "1";
    this.adapterRegistry = options.adapterRegistry || createDefaultAdapterRegistry();
    this.manifest = JSON.parse(readFileSync(this.manifestPath, "utf8")) as Manifest;
    this.assertManifest();

    const dbPath = path.resolve(options.dbPath || defaultDbPath());
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true, strict: true });
    this.installSchema();
    this.pendingSteps = new Set(Object.keys(this.manifest.dag_graph));

    this.on("step:ready", (stepId: string, step: Step) => this.queueTask(stepId, step));
  }

  public async ignite() {
    await this.recordEvent(null, "order:ignite", { mock_mode: this.mockMode });

    while (this.pendingSteps.size > 0) {
      const dispatched = await this.scanGraph();
      if (this.activeTasks.size === 0 && dispatched === 0) break;
      if (this.activeTasks.size > 0) await Promise.race([...this.activeTasks.values()]);
    }

    if (this.activeTasks.size > 0) await Promise.allSettled([...this.activeTasks.values()]);
    const summary = this.buildSummary();
    await this.recordEvent(null, "order:summary", summary);
    return summary;
  }

  public close() {
    this.db.close();
  }

  private assertManifest() {
    if (!this.manifest.order_id) throw new Error("Manifest requires order_id.");
    if (!this.manifest.idempotency_key) throw new Error("Manifest requires idempotency_key.");
    if (!this.manifest.dag_graph || typeof this.manifest.dag_graph !== "object") {
      throw new Error("Manifest requires dag_graph.");
    }
    for (const [stepId, step] of Object.entries(this.manifest.dag_graph)) {
      if (!step.assigned_node) throw new Error(`${stepId} requires assigned_node.`);
      if (!step.output_schema) throw new Error(`${stepId} requires output_schema.`);
      if (!Number.isInteger(step.retry_cap) || step.retry_cap < 1) throw new Error(`${stepId} requires retry_cap >= 1.`);
      if (!Array.isArray(step.depends_on)) throw new Error(`${stepId} requires depends_on array.`);
      if (!Array.isArray(step.explicit_context)) throw new Error(`${stepId} requires explicit_context array.`);
      if (step.context_max_bytes !== undefined && (!Number.isInteger(step.context_max_bytes) || step.context_max_bytes < 1)) {
        throw new Error(`${stepId} context_max_bytes must be a positive integer when provided.`);
      }
      for (const depId of step.depends_on) {
        if (!this.manifest.dag_graph[depId]) throw new Error(`${stepId} depends on unknown step ${depId}.`);
      }
    }
    this.assertAcyclicDag();
  }

  private assertAcyclicDag() {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (stepId: string, stack: string[]) => {
      if (visited.has(stepId)) return;
      if (visiting.has(stepId)) {
        const cycleStart = stack.indexOf(stepId);
        const cycle = stack.slice(cycleStart).join(" -> ");
        throw new Error(`Manifest DAG contains a cycle: ${cycle}`);
      }
      visiting.add(stepId);
      for (const depId of this.manifest.dag_graph[stepId].depends_on) visit(depId, [...stack, depId]);
      visiting.delete(stepId);
      visited.add(stepId);
    };
    for (const stepId of Object.keys(this.manifest.dag_graph)) visit(stepId, [stepId]);
  }

  private installSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS receipt_log (
        order_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        state TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL,
        hash TEXT NOT NULL,
        assigned_node TEXT,
        output_schema TEXT,
        context_hash TEXT,
        context_receipt TEXT,
        route_policy_json TEXT,
        output_text TEXT,
        error_trace TEXT,
        PRIMARY KEY (order_id, step_id)
      )
    `);
    this.ensureColumn("receipt_log", "context_hash", "TEXT");
    this.ensureColumn("receipt_log", "context_receipt", "TEXT");
    this.ensureColumn("receipt_log", "route_policy_json", "TEXT");
    this.db.run(`
      CREATE TABLE IF NOT EXISTS order_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        step_id TEXT,
        event_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        detail_json TEXT NOT NULL
      )
    `);
  }

  private ensureColumn(tableName: string, columnName: string, ddl: string) {
    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    if (!rows.some((row) => row.name === columnName)) {
      this.db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${ddl}`);
    }
  }

  private async scanGraph() {
    let dispatched = 0;
    for (const stepId of [...this.pendingSteps]) {
      const step = this.manifest.dag_graph[stepId];
      const record = this.getState(stepId);

      if (record?.state === "COMPLETED" || record?.state === "ESCALATED") {
        await this.maybeBackfillDispatchMetadata(stepId, step, record);
        this.pendingSteps.delete(stepId);
        continue;
      }

      if (!this.dependenciesMet(step)) continue;
      if (record?.state === "IN_PROGRESS" || this.activeTasks.has(stepId)) continue;

      const attempts = (record?.attempts || 0) + 1;
      this.upsertState(stepId, "IN_PROGRESS", attempts, "pending", null, null);
      this.emit("step:ready", stepId, step);
      dispatched += 1;
    }
    return dispatched;
  }

  private queueTask(stepId: string, step: Step) {
    this.dispatchedCount += 1;
    const task = this.dispatchTask(stepId, step)
      .catch((error) => this.handleFailure(stepId, step, error))
      .finally(() => this.activeTasks.delete(stepId));
    this.activeTasks.set(stepId, task);
  }

  private async dispatchTask(stepId: string, step: Step) {
    const attempt = this.getState(stepId)?.attempts || 1;
    const routePolicy = routePolicyForStep(stepId, step);
    await this.recordEvent(stepId, "step:ready", { assigned_node: step.assigned_node, attempt, route_policy: routePolicy });
    const explicitContext = await this.buildExplicitContext(stepId, step);
    this.updateDispatchMetadata(stepId, explicitContext, routePolicy);
    await this.recordEvent(stepId, "step:context_packed", summarizeContextPack(explicitContext));
    const output = await this.executeNode(stepId, step, explicitContext.text, attempt);
    const valid = this.validateOutput(output, step.output_schema);
    if (!valid) throw new Error(`Deterministic validation failed for schema ${step.output_schema}.`);
    this.handleSuccess(stepId, output);
  }

  private handleSuccess(stepId: string, output: string) {
    const attempts = this.getState(stepId)?.attempts || 1;
    this.upsertState(stepId, "COMPLETED", attempts, this.hash(output), output, null);
    this.pendingSteps.delete(stepId);
    void this.recordEvent(stepId, "step:completed", { attempts, hash: this.hash(output) });
  }

  private handleFailure(stepId: string, step: Step, error: unknown) {
    const record = this.getState(stepId);
    const attempts = record?.attempts || 1;
    const trace = error instanceof Error ? error.message : String(error);

    if (attempts >= step.retry_cap) {
      this.upsertState(stepId, "ESCALATED", attempts, "error_trace", null, trace);
      const escalation = escalationAdvisorForStep(stepId, step);
      this.pendingSteps.delete(stepId);
      void this.recordEvent(stepId, "step:escalated", {
        attempts,
        retry_cap: step.retry_cap,
        ...escalation,
        trace,
      });
      return;
    }

    this.upsertState(stepId, "FAILED", attempts, "error_trace", null, trace);
    void this.recordEvent(stepId, "step:failed", { attempts, retry_cap: step.retry_cap, trace });
  }

  private dependenciesMet(step: Step) {
    return step.depends_on.every((depId) => this.getState(depId)?.state === "COMPLETED");
  }

  private async buildExplicitContext(stepId: string, step: Step): Promise<ContextPack> {
    const resolver: ContextResolver = {
      getStepOutput: (id) => this.getOutput(id) || null,
      getStepHash: (id) => this.getState(id)?.hash || null,
      getStepError: (id) => this.getState(id)?.error_trace || null,
    };
    return buildExplicitContextPack(stepId, step, { rootDir: this.rootDir, resolver });
  }

  private async maybeBackfillDispatchMetadata(stepId: string, step: Step, record: ReceiptRow) {
    if (record.context_hash && record.route_policy_json) return;
    try {
      const explicitContext = await this.buildExplicitContext(stepId, step);
      const routePolicy = routePolicyForStep(stepId, step);
      this.updateDispatchMetadata(stepId, explicitContext, routePolicy);
      await this.recordEvent(stepId, "step:metadata_backfilled", {
        context: summarizeContextPack(explicitContext),
        route_policy: routePolicy,
      });
    } catch (error) {
      await this.recordEvent(stepId, "step:metadata_backfill_failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async executeNode(stepId: string, step: Step, context: string, attempt: number) {
    if (step.mock?.always_fail_validation || attempt <= (step.mock?.fail_validation_attempts || 0)) {
      return `invalid ${step.output_schema} from ${step.assigned_node} attempt ${attempt}`;
    }
    if (step.mock?.response !== undefined) return JSON.stringify(step.mock.response);

    const adapter = this.adapterRegistry.resolve(step.assigned_node, this.mockMode);
    const result = await adapter.execute({
      orderId: this.manifest.order_id,
      stepId,
      step,
      explicitContext: context,
      attempt,
      mockMode: this.mockMode,
    });
    if (!result.ok || !result.output) {
      throw new Error(result.error || `Adapter ${result.adapter_id} returned no output.`);
    }
    return result.output;
  }

  private validateOutput(output: string, schemaType: string) {
    let parsed: any;
    try {
      parsed = JSON.parse(output);
    } catch {
      return false;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    if (schemaType === "ReactComponentStrict") {
      return typeof parsed.componentName === "string"
        && typeof parsed.tsx === "string"
        && /\bexport\s+function\b/.test(parsed.tsx);
    }
    if (schemaType === "LuminanceReport") {
      return typeof parsed.passed === "boolean" && typeof parsed.validation_hash === "string";
    }
    if (schemaType === "TerminalTrace") {
      return Number.isInteger(parsed.exit_code) && typeof parsed.stdout === "string";
    }
    if (schemaType === "DeadlockHint") {
      return typeof parsed.hint === "string" && parsed.hint.length > 0;
    }
    return true;
  }

  private getState(stepId: string): ReceiptRow | null {
    return this.db.prepare(`
      SELECT state, attempts, hash, context_hash, route_policy_json, output_text, error_trace
      FROM receipt_log
      WHERE order_id = $order_id AND step_id = $step_id
    `).get({ order_id: this.manifest.order_id, step_id: stepId }) as ReceiptRow | null;
  }

  private getOutput(stepId: string) {
    return (this.getState(stepId)?.output_text || "").trim();
  }

  private upsertState(stepId: string, state: StepState, attempts: number, hash: string, outputText: string | null, errorTrace: string | null) {
    const step = this.manifest.dag_graph[stepId];
    this.db.prepare(`
      INSERT INTO receipt_log (order_id, step_id, state, attempts, timestamp, hash, assigned_node, output_schema, context_hash, context_receipt, route_policy_json, output_text, error_trace)
      VALUES ($order_id, $step_id, $state, $attempts, $timestamp, $hash, $assigned_node, $output_schema, $context_hash, $context_receipt, $route_policy_json, $output_text, $error_trace)
      ON CONFLICT(order_id, step_id) DO UPDATE SET
        state = excluded.state,
        attempts = excluded.attempts,
        timestamp = excluded.timestamp,
        hash = excluded.hash,
        assigned_node = excluded.assigned_node,
        output_schema = excluded.output_schema,
        context_hash = COALESCE(receipt_log.context_hash, excluded.context_hash),
        context_receipt = COALESCE(receipt_log.context_receipt, excluded.context_receipt),
        route_policy_json = COALESCE(receipt_log.route_policy_json, excluded.route_policy_json),
        output_text = excluded.output_text,
        error_trace = excluded.error_trace
    `).run({
      order_id: this.manifest.order_id,
      step_id: stepId,
      state: state,
      attempts: attempts,
      timestamp: new Date().toISOString(),
      hash: hash,
      assigned_node: step.assigned_node,
      output_schema: step.output_schema,
      context_hash: null,
      context_receipt: null,
      route_policy_json: null,
      output_text: outputText,
      error_trace: errorTrace,
    });
  }

  private updateDispatchMetadata(stepId: string, pack: ContextPack, routePolicy: unknown) {
    this.db.prepare(`
      UPDATE receipt_log
      SET context_hash = $context_hash,
          context_receipt = $context_receipt,
          route_policy_json = $route_policy_json
      WHERE order_id = $order_id AND step_id = $step_id
    `).run({
      order_id: this.manifest.order_id,
      step_id: stepId,
      context_hash: pack.sha256,
      context_receipt: JSON.stringify(summarizeContextPack(pack)),
      route_policy_json: JSON.stringify(routePolicy),
    });
  }

  private async recordEvent(stepId: string | null, eventType: string, detail: unknown) {
    this.db.prepare(`
      INSERT INTO order_events (order_id, step_id, event_type, timestamp, detail_json)
      VALUES ($order_id, $step_id, $event_type, $timestamp, $detail_json)
    `).run({
      order_id: this.manifest.order_id,
      step_id: stepId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      detail_json: JSON.stringify(detail),
    });
  }

  private buildSummary() {
    const rows = this.db.prepare(`
      SELECT step_id, state, attempts, hash, assigned_node, output_schema, context_hash, route_policy_json, timestamp
      FROM receipt_log
      WHERE order_id = $order_id
      ORDER BY step_id
    `).all({ order_id: this.manifest.order_id }) as Array<Record<string, unknown>>;
    const states = new Map(rows.map((row) => [String(row.step_id), String(row.state)]));
    const completed = rows.filter((row) => row.state === "COMPLETED").length;
    const escalated = rows.filter((row) => row.state === "ESCALATED").length;
    const failed = rows.filter((row) => row.state === "FAILED").length;
    const pending = Object.keys(this.manifest.dag_graph).filter((stepId) => !states.has(stepId)).length;
    const blocked = Object.entries(this.manifest.dag_graph).filter(([stepId, step]) => {
      if (states.has(stepId)) return false;
      return !this.dependenciesMet(step);
    }).length;
    const ok = completed === Object.keys(this.manifest.dag_graph).length && escalated === 0 && failed === 0 && pending === 0 && blocked === 0;
    const status: OrderStatus = ok ? "COMPLETED" : escalated > 0 ? "ESCALATED" : "BLOCKED";
    return {
      ok,
      status,
      order_id: this.manifest.order_id,
      idempotency_key: this.manifest.idempotency_key,
      mock_mode: this.mockMode,
      dispatched_count: this.dispatchedCount,
      summary: {
        steps: Object.keys(this.manifest.dag_graph).length,
        completed,
        failed,
        escalated,
        pending,
        blocked,
      },
      steps: rows,
    };
  }

  private hash(value: string) {
    return String(Bun.hash(value));
  }
}

export async function runControlPlane(manifestPath: string, options: ControlPlaneOptions = {}) {
  const engine = new ControlPlane(manifestPath, options);
  try {
    return await engine.ignite();
  } finally {
    engine.close();
  }
}

function argValue(name: string) {
  const index = Bun.argv.indexOf(name);
  if (index === -1) return null;
  return Bun.argv[index + 1] || null;
}

if (import.meta.main) {
  const manifestArg = Bun.argv.slice(2).find((arg) => !arg.startsWith("--")) || path.join(import.meta.dir, "MANIFEST.example.json");
  const dbPath = argValue("--db") || undefined;
  const result = await runControlPlane(manifestArg, { dbPath });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(result.status === "ESCALATED" ? 5 : 4);
}
