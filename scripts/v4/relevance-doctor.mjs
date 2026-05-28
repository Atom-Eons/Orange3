#!/usr/bin/env node
/* relevance-doctor.mjs - ORANGEBOX Silent Canvas Relevance Controller doctor.
 *
 * Sidecar-free proof that Silent Canvas does not hand raw project sprawl to the
 * Creative Brain. It builds an isolated Surface Factory workspace, proves the
 * scoped projection omits offscreen data, then runs a real Silent Canvas job
 * with an injected model pair that must request bounded context before mutating.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { createSurface } from "./surface-factory.mjs";
import { applyMutation, loadOrInit } from "./project-graph.mjs";
import { buildScopedContext, formatScopedContextForBrain } from "./relevance-controller.mjs";
import * as silentCanvas from "./silent-canvas.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const RELEVANCE_DOCTOR_VERSION = "orangebox-relevance-controller/v1";

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function tempRoot() {
  return path.join(os.tmpdir(), `obx-relevance-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
}

function restoreDataRoot(value) {
  if (value === undefined) delete process.env.ORANGEBOX_DATA_ROOT;
  else process.env.ORANGEBOX_DATA_ROOT = value;
}

function compactText(value, max = 2400) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function addProjectionFixtures(workspace, count = 28) {
  const applied = [];
  for (let i = 0; i < count; i++) {
    const target = `relevance-far-offscreen-${i}`;
    const result = await applyMutation(workspace, "relevance-doctor:offscreen-fixtures", {
      id: `sm-relevance-far-${i}`,
      kind: "node_create",
      target,
      details: {
        element_kind: "fixture",
        path: `far/offscreen-${i}`,
        label: `Far Offscreen Context Fixture ${i}`,
        x: 2600 + (i % 7) * 220,
        y: 1800 + Math.floor(i / 7) * 150,
        w: 170,
        h: 88,
      },
      estimated_duration_ms: 0,
    });
    applied.push({ id: target, ok: result.ok, error: result.error || null });
    if (!result.ok) throw new Error(`fixture mutation failed ${target}: ${result.error}`);
  }
  return applied;
}

function needsMoreContextHsmp() {
  return JSON.stringify({
    schema_version: "1.0",
    objective: "Request bounded design context before mutating the Silent Canvas.",
    milestones: [
      { id: "ms-1", text: "Request missing design state", state: "planned" },
    ],
    state_mutations: [
      {
        id: "sm-request-design-state",
        milestone_id: "ms-1",
        kind: "needs_more_context",
        target: "operator-context",
        details: {
          data_request: {
            type: "design_state",
            reason: "Need the existing design component contract before creating a proof component.",
            required_fields: ["components", "doctrine"],
          },
        },
        estimated_duration_ms: 0,
      },
    ],
    summary_template: "Bounded context was requested instead of guessing.",
    summary_checklist: ["Missing design state was surfaced as a bounded request."],
  });
}

function finalMutationHsmp() {
  return JSON.stringify({
    schema_version: "1.0",
    objective: "Create a Relevance Controller proof node after bounded expansion.",
    milestones: [
      { id: "ms-1", text: "Add proof node", state: "planned" },
    ],
    state_mutations: [
      {
        id: "sm-create-relevance-proof-node",
        milestone_id: "ms-1",
        kind: "node_create",
        target: "relevance-proof-node",
        details: {
          element_kind: "component",
          path: "surface/relevance-proof-node",
          label: "Relevance Proof Node",
          role: "Proof that mutation happens only after scoped context expansion",
          x: 420,
          y: 220,
          w: 220,
          h: 112,
        },
        estimated_duration_ms: 0,
      },
    ],
    summary_template: "Relevance Controller proof node was created after scoped expansion.",
    summary_checklist: [
      "Initial prompt used a bounded projection.",
      "Missing context used needs_more_context.",
      "Final mutation applied after expansion.",
    ],
  });
}

function createInjectedModel({ observations }) {
  let creativeCalls = 0;
  let interpreterCalls = 0;

  return async function injectedModelCall(request) {
    const system = String(request.system || "");
    const prompt = String(request.prompt || "");
    const isInterpreter = prompt.startsWith("Parse this Creative Brain output");
    if (isInterpreter) {
      interpreterCalls += 1;
      observations.interpreter_prompts.push({
        call: interpreterCalls,
        prompt_has_relevance_projection: prompt.includes("RELEVANCE PROJECTION"),
        prompt_has_expansion_request: prompt.includes("RELEVANCE CONTROLLER EXPANSION REQUEST"),
        prompt_preview: compactText(prompt, 900),
      });
      return {
        ok: true,
        text: interpreterCalls === 1 ? needsMoreContextHsmp() : finalMutationHsmp(),
        tokens_in: Math.ceil(prompt.length / 4),
        tokens_out: interpreterCalls === 1 ? 220 : 260,
        dollar_cost: 0,
        pipe: "injected-relevance-doctor",
        model: "relevance-doctor-fast-interpreter",
      };
    }

    creativeCalls += 1;
    observations.creative_prompts.push({
      call: creativeCalls,
      has_relevance_projection: prompt.includes("RELEVANCE PROJECTION"),
      has_expansion_request: prompt.includes("RELEVANCE CONTROLLER EXPANSION REQUEST"),
      has_far_offscreen_27: prompt.includes("far/offscreen-27") || prompt.includes("relevance-far-offscreen-27"),
      projection_line: (prompt.match(/RELEVANCE PROJECTION: .+/) || [null])[0],
      prompt_length: prompt.length,
      prompt_preview: compactText(prompt, 900),
    });
    const text = creativeCalls === 1
      ? [
          "## ENGINEERING PLAN",
          "The scoped projection is intentionally incomplete for the requested proof component.",
          "Do not guess. Ask the Fast Interpreter to emit needs_more_context for design_state.",
          "",
          "## STRUCTURAL LAYOUT GUIDELINES",
          "No canvas mutation yet. Request design_state components and doctrine first.",
        ].join("\n")
      : [
          "## ENGINEERING PLAN",
          "The expanded relevance projection is enough to add one small proof component.",
          "",
          "## STRUCTURAL LAYOUT GUIDELINES",
          "Create a component node named Relevance Proof Node near the Command Center.",
        ].join("\n");
    return {
      ok: true,
      text,
      tokens_in: Math.ceil(prompt.length / 4),
      tokens_out: Math.ceil(text.length / 4),
      dollar_cost: 0,
      pipe: "injected-relevance-doctor",
      model: "relevance-doctor-creative-brain",
    };
  };
}

async function waitForRun(id, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = silentCanvas.status(id);
    if (last && last.state !== "running") return last;
    await sleep(50);
  }
  return last || silentCanvas.status(id);
}

async function directProjectionProbe(workspace, dataRoot) {
  const scoped = await buildScopedContext({
    goal: "Create a relevance proof node near the command center without loading offscreen fixtures.",
    workspace,
    viewport: { x: 0, y: 0, w: 980, h: 620 },
    max_nodes: 8,
    max_receipts: 4,
    dataRoot,
    appRoot: ROOT,
  });
  const formatted = formatScopedContextForBrain(scoped);
  const canvasSource = scoped.sources?.canvas_state || {};
  const included = Number(canvasSource.nodes_included || 0);
  const total = Number(canvasSource.nodes_total || 0);
  const omitted = Number(scoped.omitted?.canvas_nodes || 0);
  const hasProjectionHeader = formatted.includes("RELEVANCE PROJECTION");
  const leaksFarNode = formatted.includes("far/offscreen-27") || formatted.includes("relevance-far-offscreen-27");
  return {
    ok: !!scoped.projection_id
      && Number.isFinite(Number(scoped.estimated_chars))
      && scoped.estimated_chars < 24000
      && included > 0
      && total > included
      && omitted > 0
      && hasProjectionHeader
      && !leaksFarNode,
    projection_id: scoped.projection_id,
    estimated_chars: scoped.estimated_chars,
    canvas_source: canvasSource,
    omitted: scoped.omitted,
    formatted_has_projection_header: hasProjectionHeader,
    formatted_leaks_far_offscreen_27: leaksFarNode,
    formatted_preview: compactText(formatted, 1000),
  };
}

async function runtimeProbe(workspace, dataRoot) {
  const observations = {
    creative_prompts: [],
    interpreter_prompts: [],
    events: [],
    receipts: [],
  };
  const start = silentCanvas.start({
    goal: "Create the Relevance Proof Node only after asking for bounded missing design_state.",
    workspace,
    opts: {
      data_root: dataRoot,
      app_root: ROOT,
      viewport: { x: 0, y: 0, w: 980, h: 620 },
      max_nodes: 8,
      max_receipts: 4,
      context_expansion_rounds: 2,
      model_call: createInjectedModel({ observations }),
      actor: { id: "relevance-doctor", trust_tier: "T-Conditional" },
    },
    on_event: (ev) => observations.events.push(ev),
    emitReceipt: async (payload) => {
      observations.receipts.push(payload);
      return { receiptPath: null };
    },
  });
  const final = await waitForRun(start.id);
  const graphState = await loadOrInit(workspace);
  const proofNode = (graphState.nodes || []).find((node) => node.id === "relevance-proof-node") || null;
  const phases = (final?.events_tail || observations.events || []).map((ev) => ev.phase);
  const receiptSources = observations.receipts.map((receipt) => receipt.source);
  const firstCreative = observations.creative_prompts[0] || {};
  const retryCreative = observations.creative_prompts[1] || {};
  const contextExpansions = final?.metrics?.relevance_controller?.context_expansions || [];
  return {
    ok: final?.state === "finished"
      && !!proofNode
      && observations.creative_prompts.length === 2
      && observations.interpreter_prompts.length === 2
      && firstCreative.has_relevance_projection === true
      && firstCreative.has_far_offscreen_27 === false
      && retryCreative.has_expansion_request === true
      && phases.includes("needs_more_context")
      && phases.includes("relevance_projection_expanded")
      && phases.includes("state_mutation")
      && phases.includes("done")
      && receiptSources.includes("relevance-projection")
      && receiptSources.includes("silent-canvas-needs-more-context")
      && receiptSources.includes("relevance-projection-expansion")
      && receiptSources.includes("silent-canvas-run")
      && contextExpansions.length === 1,
    run_id: start.id,
    final_state: final?.state || null,
    error: final?.error || null,
    proof_node: proofNode ? { id: proofNode.id, kind: proofNode.kind, target_path: proofNode.target_path, details: proofNode.details } : null,
    prompt_observations: observations.creative_prompts.map((item) => ({
      call: item.call,
      has_relevance_projection: item.has_relevance_projection,
      has_expansion_request: item.has_expansion_request,
      has_far_offscreen_27: item.has_far_offscreen_27,
      prompt_length: item.prompt_length,
      projection_line: item.projection_line,
    })),
    interpreter_observations: observations.interpreter_prompts.map((item) => ({
      call: item.call,
      prompt_has_relevance_projection: item.prompt_has_relevance_projection,
      prompt_has_expansion_request: item.prompt_has_expansion_request,
    })),
    phases,
    receipt_sources: receiptSources,
    relevance_metrics: final?.metrics?.relevance_controller || null,
  };
}

export async function runRelevanceDoctor({
  writeReceipt = false,
  keepTemp = false,
} = {}) {
  const dataRoot = tempRoot();
  const startedAt = new Date().toISOString();
  const previousDataRoot = process.env.ORANGEBOX_DATA_ROOT;
  const checks = [];
  let surfaceResult = null;
  let workspace = null;

  await fs.mkdir(dataRoot, { recursive: true });
  process.env.ORANGEBOX_DATA_ROOT = dataRoot;

  try {
    checks.push(await gate("surface_factory_fixture", async () => {
      surfaceResult = await createSurface({
        name: "relevance doctor fixture",
        description: "Isolated ORANGEBOX Relevance Controller doctor fixture",
        dataRoot,
      });
      workspace = surfaceResult.surface.workspace;
      const fixtures = await addProjectionFixtures(workspace, 28);
      const g = await loadOrInit(workspace);
      return {
        ok: surfaceResult.ok && fixtures.every((item) => item.ok) && g.nodes.length >= 34,
        surface_id: surfaceResult.surface.surface_id,
        workspace,
        fixtures_added: fixtures.length,
        graph: {
          nodes: g.nodes.length,
          wires: g.wires.length,
          regions: g.regions.length,
          annotations: g.annotations.length,
        },
      };
    }));

    checks.push(await gate("direct_projection_bounds", async () => {
      if (!workspace) throw new Error("surface fixture not available");
      return await directProjectionProbe(workspace, dataRoot);
    }));

    checks.push(await gate("silent_canvas_runtime_needs_more_context", async () => {
      if (!workspace) throw new Error("surface fixture not available");
      return await runtimeProbe(workspace, dataRoot);
    }));
  } finally {
    restoreDataRoot(previousDataRoot);
  }

  const failures = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    doctor: "relevance-controller",
    doctor_version: RELEVANCE_DOCTOR_VERSION,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    root: ROOT,
    isolated_data_root: dataRoot,
    temp_retained: keepTemp,
    surface: surfaceResult?.surface || null,
    workspace,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: warnings.length,
    },
    checks,
    failures,
    warnings,
  };

  if (writeReceipt) {
    const receiptDir = path.join(ROOT, "receipts");
    await fs.mkdir(receiptDir, { recursive: true });
    const stamp = stampForFile();
    const receiptPath = path.join(receiptDir, `orangebox-relevance-controller-doctor-${stamp}.json`);
    await fs.writeFile(receiptPath, JSON.stringify({
      receipt_id: `orangebox-relevance-controller-doctor-${stamp}`,
      project: "ORANGEBOX",
      scope: "Silent Canvas Relevance Controller doctor",
      timestamp: new Date().toISOString(),
      summary: result.ok
        ? `Relevance Controller passed ${result.summary.passed}/${result.summary.checks} proof checks.`
        : `Relevance Controller failed ${result.summary.failed} required check(s).`,
      result,
    }, null, 2));
    result.receipt_path = receiptPath;
  }

  if (!keepTemp) {
    const resolved = path.resolve(dataRoot);
    const tmp = path.resolve(os.tmpdir());
    if (resolved.startsWith(tmp) && fsSync.existsSync(resolved)) {
      try { await fs.rm(resolved, { recursive: true, force: true }); } catch {}
    }
  }

  return result;
}

function readFlag(argv, name, fallback = null) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return argv.includes(`--${name}`) ? true : fallback;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runRelevanceDoctor({
    writeReceipt: argv.includes("--receipt"),
    keepTemp: argv.includes("--keep-temp"),
  });
  if (readFlag(argv, "json", false) || argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "[ok]" : "[fail]"} ORANGEBOX Relevance Controller`);
    console.log(`  checks:   ${result.summary.passed}/${result.summary.checks}`);
    console.log(`  failures: ${result.summary.failed}`);
    if (result.workspace) console.log(`  fixture:  ${result.workspace}`);
    if (result.receipt_path) console.log(`  receipt:  ${result.receipt_path}`);
    for (const failure of result.failures.slice(0, 8)) {
      console.log(`  failure:  ${failure.name} ${failure.error || failure.evidence?.error || ""}`);
    }
  }
  if (!result.ok) process.exit(1);
}
