/* silent-canvas.mjs — v6.3.0-alpha.1 — Silent Canvas orchestrator (server-side).
 *
 * Implements the Dual-Model Split Pipeline per Silent Canvas Doctrine §6.0:
 *
 *   Step 1 — Creative Brain (unconstrained, high-tier model)
 *     • role: design workflows, map data routing, evaluate product logic
 *     • output: natural-language engineering plan + structural layout guidelines
 *     • transport: subscription-first per §8 (CLI headless preferred)
 *
 *   Step 2 — Fast Interpreter (targeted parsing model)
 *     • role: extract structural requirements → clean HSMP JSON
 *     • output: HSMP per hsmp-schema.mjs
 *
 *   Step 3 — Frontend State Execution
 *     • role: apply HSMP to project graph + emit events to native UI
 *     • emits events for: objective, roadmap, milestone_start/done/fail,
 *       state_mutation, summary, done, error
 *
 * Each phase emits its own receipt. The composite run emits a final
 * `silent-canvas-run` receipt with full chain (creative output ref,
 * interpreter output ref, all milestones, all mutations, both pipe
 * transports, dollar cost, latency metrics, parse-success rate).
 */

import crypto from "node:crypto";
import https from "node:https";
import * as pipes from "./subscription-pipes.mjs";
import * as openrouter from "./openrouter-fallback.mjs";
import * as graph from "./project-graph.mjs";
import { HSMP_COMPAT_VERSION, HSMP_PRIMITIVE_VERSION, HSMP_SCHEMA_VERSION, validateHSMP, extractHSMP, stampHSMPProvenance } from "./hsmp-schema.mjs";
import { buildScopedContext, formatScopedContextForBrain } from "./relevance-controller.mjs";
import { validatePatch } from "./canvas-validator.mjs";
import { loadSilentCanvasPrompts, promptEvidence } from "./prompt-registry.mjs";

// ── API fallback (Anthropic) — used when subscription-cli is absent or
//    unauthenticated. Per Silent Canvas Doctrine §5.0 routing order. ────────
async function callAnthropicApi({ model, system, prompt, max_tokens = 2000, temperature = undefined }) {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";
  if (!apiKey) return { ok: false, error: "ANTHROPIC_API_KEY not set; subscription CLI also unavailable", pipe: "api", needs_auth: true };
  const payload = {
    model,
    max_tokens,
    system,
    messages: [{ role: "user", content: prompt }],
  };
  if (typeof temperature === "number") payload.temperature = temperature;
  return new Promise((resolve) => {
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: "api.anthropic.com", port: 443, path: "/v1/messages", method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => { buf += c; });
      res.on("end", () => {
        try {
          const data = JSON.parse(buf);
          if (data.error) return resolve({ ok: false, error: data.error.message || "api error", pipe: "api" });
          const text = data.content?.find(c => c.type === "text")?.text || "";
          const usage = data.usage || {};
          // Rough cost estimate (Sonnet 4.5: $3/MTok in, $15/MTok out)
          const px = model.includes("opus") ? { in: 15.0, out: 75.0 }
                  : model.includes("haiku") ? { in: 0.8, out: 4.0 }
                  : { in: 3.0, out: 15.0 };
          const dollar_cost = ((usage.input_tokens || 0) * px.in + (usage.output_tokens || 0) * px.out) / 1_000_000;
          resolve({
            ok: true, text,
            tokens_in: usage.input_tokens || 0, tokens_out: usage.output_tokens || 0,
            dollar_cost,
            pipe: "api", binary: null, model,
          });
        } catch (e) { resolve({ ok: false, error: `parse: ${e.message}`, pipe: "api" }); }
      });
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message, pipe: "api" }));
    req.setTimeout(120000, () => { req.destroy(new Error("timeout")); resolve({ ok: false, error: "timeout", pipe: "api" }); });
    req.write(body);
    req.end();
  });
}

// Unified call with FULL fallback chain per Silent Canvas Doctrine §8.4.5:
//   1. Subscription CLI (preferred, $0 incremental)
//   2. OpenRouter universal API (one key, 200+ models, ~$0.04/run)
//   3. Direct provider API (DEPRECATED but supported — provider-specific env)
//   4. (Local Ollama fallback would go here; not yet wired in this function)
async function callWithFallback({ provider, model, system, prompt, max_tokens, temperature = undefined }) {
  // Step 1: Subscription CLI
  const r = await pipes.call({ provider, model, system, prompt, max_tokens, temperature });
  if (r.ok) return { ...r, fallback_reason: null };
  const sub_reason = r.fallback_reason || r.error || "subscription unavailable";

  // Step 2: OpenRouter universal fallback (works for ALL providers via one key)
  if (openrouter.hasOpenRouterKey()) {
    const or = await openrouter.call({ model, system, prompt, max_tokens, temperature });
    if (or.ok) return { ...or, fallback_reason: sub_reason, fallback_path: "subscription-cli → openrouter" };
    // OpenRouter also failed — fall through
    var or_reason = or.error || "openrouter failed";
  }

  // Step 3: Direct provider API (DEPRECATED — for legacy operators only)
  if (provider === "anthropic") {
    const api = await callAnthropicApi({ model, system, prompt, max_tokens, temperature });
    return { ...api, fallback_reason: sub_reason, fallback_path: "subscription-cli → " + (typeof or_reason === "string" ? "openrouter-failed(" + or_reason + ") → " : "") + "direct-anthropic-api" };
  }
  // Other providers — no direct API wired yet; surface a clear setup hint
  return {
    ok: false,
    pipe: "no-pipe-available",
    error: typeof or_reason === "string" ? or_reason : sub_reason,
    setup_hint: "Run `claude login` (for Anthropic Max) OR set ORANGEBOX_OPENROUTER_KEY in Settings (one key, 200+ models).",
    provider, model,
  };
}

async function callModel(opts, request) {
  if (typeof opts.model_call === "function") {
    const result = await opts.model_call(request);
    return {
      ok: !!result?.ok,
      text: result?.text || "",
      tokens_in: result?.tokens_in || 0,
      tokens_out: result?.tokens_out || 0,
      dollar_cost: result?.dollar_cost ?? 0,
      pipe: result?.pipe || "injected-model-call",
      model: result?.model || request.model || "injected",
      fallback_reason: result?.fallback_reason || null,
      error: result?.error || null,
    };
  }
  return callWithFallback(request);
}

// ── In-memory run table ────────────────────────────────────────────────────
const RUNS = new Map();   // id -> { run state }
const MAX_RUNS = 200;
function newId() { return "sc-" + crypto.randomUUID().slice(0, 12); }

function evictOldFinished() {
  if (RUNS.size <= MAX_RUNS) return;
  const finished = Array.from(RUNS.values())
    .filter(r => r.state !== "running")
    .sort((a, b) => (a.finish_ts || a.start_ts) - (b.finish_ts || b.start_ts));
  for (const r of finished) {
    if (RUNS.size <= MAX_RUNS) break;
    RUNS.delete(r.id);
  }
}

// ── Creative Brain prompt scaffolding (Doctrine §6.1) ──────────────────────
function buildCreativeBrainPrompt({ goal, workspace, graphSnapshot, recentReceipts, scopedContext, promptAsset }) {
  const sysParts = [
    promptAsset?.text?.trim() || "",
    "",
    "RUNTIME BINDINGS:",
    "You are the Creative Brain of OrangeBox Silent Canvas.",
    "Per doctrine: you have ABSOLUTE FREEDOM to design workflows, map data routing,",
    "and evaluate product logic. NO formatting restrictions on your output.",
    "",
    "Produce TWO clearly-delimited artifacts in your response:",
    "",
    "## ENGINEERING PLAN",
    "Natural-language description of WHAT will be built and WHY.",
    "Discuss tradeoffs, design choices, dependencies, sequencing.",
    "Prose. Markdown allowed. Code blocks allowed.",
    "",
    "## STRUCTURAL LAYOUT GUIDELINES",
    "Natural-language description of HOW the result will appear on the visual canvas:",
    "  - which nodes (file, function, component, service, route, data store, dep, test, config)",
    "  - which wires (function call, data flow, dependency, active data, error fallback) between nodes",
    "  - which regions/groups bundle related nodes",
    "  - any annotations or notes for the operator",
    "Tell the Fast Interpreter (next step) how to draw it.",
    "",
    "Hard constraints:",
    "  - Refuse to run destructive shell commands (rm -rf, format, drop database)",
    "  - All paths under workspace: " + workspace,
    "  - Freeze-guarded paths are not editable",
    "  - You see a relevance-scoped projection, not the full source of truth",
    "  - If the projection is missing required state, ask for needs_more_context; do not guess",
    "",
    "Length: keep under 2000 tokens output total.",
  ];
  const userParts = [
    `OPERATOR GOAL: ${goal}`,
    "",
    `WORKSPACE: ${workspace}`,
  ];
  if (graphSnapshot) {
    userParts.push("");
    userParts.push("CURRENT PROJECT GRAPH TOTALS:");
    userParts.push(`  ${graphSnapshot.nodes?.length || 0} nodes, ${graphSnapshot.wires?.length || 0} wires, ${graphSnapshot.regions?.length || 0} regions, ${graphSnapshot.annotations?.length || 0} annotations`);
    userParts.push(`  Last mutated: ${graphSnapshot.last_mutated_at || "(never)"}`);
  }
  if (scopedContext) {
    userParts.push("");
    userParts.push("SCOPED CONTEXT PACKAGE (Relevance Controller output):");
    userParts.push(formatScopedContextForBrain(scopedContext));
  }
  if (recentReceipts?.length) {
    userParts.push("");
    userParts.push(`RECENT RECEIPTS (last ${recentReceipts.length}):`);
    for (const r of recentReceipts) {
      userParts.push(`  - ${r.source}: ${r.title}`);
    }
  }
  return {
    system:  sysParts.join("\n"),
    user:    userParts.join("\n"),
    max_tokens: 2000,
  };
}

// ── Fast Interpreter prompt scaffolding (Doctrine §6.2) ────────────────────
function buildFastInterpreterPrompt(creativeOutput, { promptAsset, producer } = {}) {
  const sys = [
    promptAsset?.text?.trim() || "",
    "",
    "RUNTIME BINDINGS:",
    "You are the Fast Interpreter of OrangeBox Silent Canvas.",
    "Your SOLE task: parse the Creative Brain's free-form output into a strict HSMP JSON.",
    "Do NOT add creativity. Do NOT add steps the Creative Brain didn't propose. Just extract.",
    "",
    "Output a SINGLE JSON object matching this schema:",
    "{",
    `  "schema_version": "${HSMP_SCHEMA_VERSION}",`,
    '  "producer": {',
    `    "creative_prompt_version": "${producer?.creative_prompt_version || "creative-brain/v1"}",`,
    `    "interpreter_prompt_version": "${producer?.interpreter_prompt_version || "fast-interpreter/v1"}",`,
    '    "model_lane": "subscription-cli-or-fallback"',
    "  },",
    '  "objective":       "<one sentence confirming the requested operation>",',
    '  "milestones": [',
    '    { "id": "ms-1", "text": "<short description>", "state": "planned" }',
    "  ],",
    '  "state_mutations": [',
    "    {",
    '      "id":           "sm-1",',
    '      "milestone_id": "ms-1",',
    '      "kind":         "node_create | node_edit | node_delete | wire_create | wire_delete | region_create | region_resize | component_update | file_create | file_edit | file_delete | run_cmd | test_run | deploy | annotation_add | annotation_remove | needs_more_context",',
    '      "target":       "<path-or-node-id>",',
    '      "details":      { "kind-specific": "fields" },',
    '      "estimated_duration_ms": 800',
    "    }",
    "  ],",
    '  "summary_template":   "<one-line completion blurb>",',
    '  "summary_checklist":  [ "Customer-facing achievement 1", "Achievement 2", ... ]',
    "}",
    "",
    "Rules:",
    "  - milestone IDs match ^ms-[a-z0-9-]+$ — start with 'ms-' then index",
    "  - state_mutation IDs match ^sm-[a-z0-9-]+$",
    "  - Each state_mutation MUST reference an existing milestone_id",
    "  - All milestones start in state='planned'",
    "  - 3-7 milestones is ideal; max 10",
    "  - 1-20 state_mutations per milestone is typical; max 50 total",
    "  - summary_checklist is customer-facing (NOT a file list); 3-8 items",
    "  - If required state is absent, use kind='needs_more_context' with details.data_request = { type, reason, required_fields }",
    "  - Output ONLY the JSON object — no commentary, no markdown fences",
  ].join("\n");
  return {
    system: sys,
    user:   `Parse this Creative Brain output into HSMP JSON:\n\n${creativeOutput}\n\nReturn ONLY the JSON.`,
    max_tokens: 1500,
  };
}

// ── Emit helpers ───────────────────────────────────────────────────────────
function pushEvent(run, ev) {
  run.events.push({ ts: Date.now(), ...ev });
  if (run.events.length > 1000) run.events.splice(0, run.events.length - 1000);
  if (run.on_event) {
    try { run.on_event(ev); } catch { /* swallow */ }
  }
}

function collectDataRequests(hsmp) {
  return (hsmp?.state_mutations || [])
    .filter((sm) => sm.kind === "needs_more_context")
    .map((sm) => {
      const req = sm.details?.data_request || sm.data_request || {};
      return {
        type: String(req.type || "unknown").slice(0, 80),
        reason: String(req.reason || sm.target || "missing context").slice(0, 320),
        required_fields: Array.isArray(req.required_fields) ? req.required_fields.map(String).slice(0, 20) : [],
      };
    });
}

function recordSchemaCompatibility(run, hsmp) {
  const migration = hsmp?.compatibility?.schema_migration;
  if (!migration) return;
  run.metrics.schema.migrations ||= [];
  const key = `${migration.from || "none"}->${migration.to}:${migration.reason}`;
  if (!run.metrics.schema.migrations.some((m) => m.key === key)) {
    run.metrics.schema.migrations.push({ key, ...migration });
  }
  if (migration.applied) {
    pushEvent(run, { phase: "hsmp_schema_migration", migration });
  }
  if (!migration.supported) {
    pushEvent(run, { phase: "hsmp_schema_unsupported", migration });
  }
}

function describeDataRequests(requests) {
  return (requests || [])
    .map((req, idx) => {
      const fields = req.required_fields?.length ? ` fields=${req.required_fields.join(",")}` : "";
      return `${idx + 1}. ${req.type}: ${req.reason}${fields}`;
    })
    .join("\n");
}

async function emitReceiptIfFn(emitReceipt, payload) {
  if (typeof emitReceipt === "function") {
    try { return await emitReceipt(payload); } catch { /* swallow */ }
  }
  return null;
}

// ── THE RUN ────────────────────────────────────────────────────────────────
/**
 * start({ goal, workspace, opts, on_event, emitReceipt })
 *   Kicks off a Silent Canvas run in the background. Returns { id } immediately.
 */
export function start({ goal, workspace, opts = {}, on_event, emitReceipt }) {
  if (!goal || !workspace) throw new Error("goal + workspace required");
  const id = newId();
  const run = {
    id, goal, workspace,
    state: "running",
    start_ts: Date.now(),
    finish_ts: null,
    events: [],
    cancelToken: { cancelled: false },
    dashboard: { objective: null, milestones: [], summary_checklist: [], summary_template: null },
    on_event,
    prompt_bundle: null,
    metrics: {
      latency_ms_first_event: null,
      latency_ms_objective:    null,
      latency_ms_roadmap:      null,
      latency_ms_first_mutation: null,
      latency_ms_summary:      null,
      latency_ms_total:        null,
      schema: { hsmp_schema_version: HSMP_SCHEMA_VERSION, hsmp_compat_version: HSMP_COMPAT_VERSION, migrations: [] },
      prompt_versions: null,
      relevance_controller: { projection_id: null, estimated_chars: 0, omitted: null, latency_ms: 0, context_expansions: [] },
      creative_brain:   { pipe: null, tokens_in: 0, tokens_out: 0, dollar_cost: 0, model: null },
      fast_interpreter: { pipe: null, tokens_in: 0, tokens_out: 0, dollar_cost: 0, model: null, parse_attempt: 0, parse_success: false, schema_valid: false, temp_zero_retries: 0 },
    },
    result: null,
    error: null,
  };
  RUNS.set(id, run);
  evictOldFinished();

  // Background runner
  (async () => {
    try {
      await execute(run, opts, emitReceipt);
    } catch (e) {
      run.state = "error";
      run.error = e.message || String(e);
      run.finish_ts = Date.now();
      pushEvent(run, { phase: "error", error: run.error });
      await emitReceiptIfFn(emitReceipt, {
        source: "silent-canvas-run",
        title:  `Silent Canvas error: ${String(goal).slice(0, 60)}`,
        summary: run.error,
        evidence: { run_id: id, error: run.error, metrics: run.metrics },
      });
    }
  })();

  return { id, state: "running" };
}

async function execute(run, opts, emitReceipt) {
  const t0 = run.start_ts;
  const promptBundle = opts.prompt_bundle || await loadSilentCanvasPrompts();
  const promptMeta = promptEvidence(promptBundle);
  const producer = {
    ...promptBundle.producer,
    model_lane: "subscription-cli-or-fallback",
    hsmp_schema_version: HSMP_SCHEMA_VERSION,
    hsmp_compat_version: HSMP_COMPAT_VERSION,
  };
  run.prompt_bundle = promptMeta;
  run.metrics.prompt_versions = promptMeta;

  // ─── PHASE 1: Snapshot the project graph + load recent receipts ─────────
  const graphSnapshot = await graph.loadOrInit(run.workspace);
  await graph.snapshot(run.workspace, "pre-run").catch(() => null);
  const relevanceStart = Date.now();
  let scopedContext = await buildScopedContext({
    goal: run.goal,
    workspace: run.workspace,
    actor: opts.actor || { id: "silent-canvas", trust_tier: "T-Conditional" },
    selected_node: opts.selected_node || null,
    viewport: opts.viewport || null,
    max_nodes: opts.max_nodes || 16,
    max_receipts: opts.max_receipts || 10,
    dataRoot: opts.data_root || process.env.ORANGEBOX_DATA_ROOT,
    appRoot: opts.app_root || process.cwd(),
  });
  run.metrics.relevance_controller = {
    projection_id: scopedContext.projection_id,
    estimated_chars: scopedContext.estimated_chars,
    omitted: scopedContext.omitted,
    latency_ms: Date.now() - relevanceStart,
    context_expansions: [],
  };
  pushEvent(run, { phase: "relevance_projection", projection_id: scopedContext.projection_id, intent: scopedContext.intent, omitted: scopedContext.omitted });
  await emitReceiptIfFn(emitReceipt, {
    source: "relevance-projection",
    title: `Relevance projection: ${scopedContext.intent.intent_type}`,
    summary: `${scopedContext.sources.canvas_state.nodes_included}/${scopedContext.sources.canvas_state.nodes_total} nodes included; ${scopedContext.estimated_chars} chars`,
    evidence: {
      run_id: run.id,
      projection_id: scopedContext.projection_id,
      intent: scopedContext.intent,
      sources: scopedContext.sources,
      omitted: scopedContext.omitted,
      latency_ms: run.metrics.relevance_controller.latency_ms,
    },
  });
  await emitReceiptIfFn(emitReceipt, {
    source: "silent-canvas-prompt-version",
    title: "Silent Canvas prompt bundle loaded",
    summary: `${producer.creative_prompt_version} + ${producer.interpreter_prompt_version} | hsmp=${HSMP_SCHEMA_VERSION}`,
    evidence: {
      run_id: run.id,
      prompts: promptMeta,
      producer,
    },
  });

  // ─── PHASE 2: Creative Brain ────────────────────────────────────────────
  const cbPrompt = buildCreativeBrainPrompt({
    goal: run.goal, workspace: run.workspace, graphSnapshot, scopedContext,
    recentReceipts: opts.recent_receipts || [],
    promptAsset: promptBundle.creative,
  });
  pushEvent(run, { phase: "creative_brain_start" });
  if (run.cancelToken.cancelled) return finishCancelled(run, emitReceipt);
  const cbStart = Date.now();
  const cbResult = await callModel(opts, {
    provider: opts.creative_provider || "anthropic",
    model:    opts.creative_model    || "claude-sonnet-4-5",
    prompt:   cbPrompt.user,
    system:   cbPrompt.system,
    max_tokens: cbPrompt.max_tokens,
  });
  run.metrics.creative_brain = {
    pipe: cbResult.pipe || "unknown",
    tokens_in: cbResult.tokens_in || 0,
    tokens_out: cbResult.tokens_out || 0,
    dollar_cost: cbResult.dollar_cost ?? 0,
    model: cbResult.model || opts.creative_model || "unknown",
    latency_ms: Date.now() - cbStart,
  };
  if (!cbResult.ok) {
    pushEvent(run, { phase: "creative_brain_error", error: cbResult.error || cbResult.fallback_reason });
    run.state = "failed"; run.error = cbResult.error || cbResult.fallback_reason; run.finish_ts = Date.now();
    await emitReceiptIfFn(emitReceipt, {
      source: "silent-canvas-run",
      title:  `Silent Canvas failed (Creative Brain): ${String(run.goal).slice(0, 60)}`,
      summary: run.error,
      evidence: { run_id: run.id, phase: "creative_brain", metrics: run.metrics, error: run.error },
    });
    return;
  }
  let activeCreativeText = cbResult.text || "";
  pushEvent(run, { phase: "creative_brain_done", text_len: activeCreativeText.length, pipe: cbResult.pipe });

  // ─── PHASE 3: Fast Interpreter ──────────────────────────────────────────
  if (run.cancelToken.cancelled) return finishCancelled(run, emitReceipt);
  pushEvent(run, { phase: "fast_interpreter_start" });
  const fiPrompt = buildFastInterpreterPrompt(activeCreativeText, { promptAsset: promptBundle.interpreter, producer });
  const fiStart = Date.now();
  let parseAttempt = 0;
  let hsmp = null;
  let parseError = null;
  let fiResult = null;
  for (parseAttempt = 1; parseAttempt <= 2; parseAttempt++) {
    if (parseAttempt > 1) {
      run.metrics.fast_interpreter.temp_zero_retries += 1;
      pushEvent(run, { phase: "fast_interpreter_retry_at_temp_zero", parse_attempt: parseAttempt, previous_error: parseError });
    }
    fiResult = await callModel(opts, {
      provider: opts.interpreter_provider || "anthropic",
      model:    opts.interpreter_model    || "claude-haiku-4-5",
      prompt:   fiPrompt.user + (parseAttempt > 1 ? "\n\nNOTE: previous attempt produced invalid JSON. Output ONLY the JSON object, no fences, no commentary." : ""),
      system:   fiPrompt.system,
      max_tokens: fiPrompt.max_tokens,
      temperature: parseAttempt > 1 ? 0.0 : opts.interpreter_temperature,
    });
    run.metrics.fast_interpreter.pipe = fiResult.pipe || "unknown";
    run.metrics.fast_interpreter.tokens_in  += fiResult.tokens_in  || 0;
    run.metrics.fast_interpreter.tokens_out += fiResult.tokens_out || 0;
    run.metrics.fast_interpreter.dollar_cost += fiResult.dollar_cost ?? 0;
    run.metrics.fast_interpreter.model = fiResult.model || opts.interpreter_model || "unknown";
    if (!fiResult.ok) {
      parseError = fiResult.error || fiResult.fallback_reason;
      break;
    }
    const ex = extractHSMP(fiResult.text || "");
    if (ex.error) { parseError = ex.error; continue; }
    const stampedHsmp = stampHSMPProvenance(ex.hsmp, producer);
    recordSchemaCompatibility(run, stampedHsmp);
    const v = validateHSMP(stampedHsmp);
    if (!v.valid) {
      parseError = "schema invalid: " + (v.errors.slice(0, 3).map(e => `${e.path}: ${e.reason}`).join("; "));
      hsmp = stampedHsmp;
      continue;
    }
    const semantic = await validatePatch({
      patch: stampedHsmp,
      workspace: run.workspace,
      contextPackage: scopedContext,
      actor: opts.actor || { id: "silent-canvas", trust_tier: "T-Conditional" },
    });
    if (!semantic.ok) {
      parseError = "semantic invalid: " + (semantic.errors.slice(0, 3).map(e => `${e.schema || "schema"} ${e.path}: ${e.reason}`).join("; "));
      hsmp = stampedHsmp;
      continue;
    }
    hsmp = stampedHsmp;
    parseError = null;
    break;
  }
  const parseAttemptsUsed = Math.min(parseAttempt, 2);
  run.metrics.fast_interpreter.parse_attempt = parseAttemptsUsed;
  run.metrics.fast_interpreter.parse_success = !!hsmp && !parseError;
  run.metrics.fast_interpreter.schema_valid  = !!hsmp && !parseError;
  run.metrics.fast_interpreter.latency_ms = Date.now() - fiStart;
  if (parseError) {
    pushEvent(run, { phase: "fast_interpreter_error", error: parseError, parse_attempt: parseAttemptsUsed });
    await emitReceiptIfFn(emitReceipt, {
      source: "silent-canvas-parse-error",
      title:  `Silent Canvas Fast Interpreter failed (${parseAttemptsUsed} attempts)`,
      summary: parseError,
      evidence: { run_id: run.id, parse_attempt: parseAttemptsUsed, temp_zero_retries: run.metrics.fast_interpreter.temp_zero_retries, raw_output_preview: (fiResult?.text || "").slice(0, 600), creative_output_preview: activeCreativeText.slice(0, 600), producer, prompts: promptMeta, schema: run.metrics.schema, hsmp_compatibility: hsmp?.compatibility || null },
    });
    run.state = "failed"; run.error = parseError; run.finish_ts = Date.now();
    return;
  }
  pushEvent(run, { phase: "fast_interpreter_done" });

  let dataRequests = collectDataRequests(hsmp);
  const maxContextExpansionRounds = Math.max(0, Math.min(Number(opts.context_expansion_rounds ?? 2) || 0, 4));
  for (let contextRound = 1; dataRequests.length > 0 && contextRound <= maxContextExpansionRounds; contextRound++) {
    if (run.cancelToken.cancelled) return finishCancelled(run, emitReceipt);
    const requestSummary = describeDataRequests(dataRequests);
    pushEvent(run, {
      phase: "needs_more_context",
      round: contextRound,
      request_count: dataRequests.length,
      requests: dataRequests,
    });
    await emitReceiptIfFn(emitReceipt, {
      source: "silent-canvas-needs-more-context",
      title: `Silent Canvas requested more context (${dataRequests.length})`,
      summary: requestSummary,
      evidence: { run_id: run.id, round: contextRound, data_requests: dataRequests, projection_id: scopedContext.projection_id },
    });

    const expansionGoal = [
      run.goal,
      "",
      "RELEVANCE CONTROLLER EXPANSION REQUEST:",
      requestSummary,
      "",
      "Use the expanded projection to perform the requested work. If the required state is still absent, emit needs_more_context again instead of guessing.",
    ].join("\n");
    const expansionStart = Date.now();
    scopedContext = await buildScopedContext({
      goal: expansionGoal,
      workspace: run.workspace,
      route: dataRequests.map((req) => req.type).join(" "),
      actor: opts.actor || { id: "silent-canvas", trust_tier: "T-Conditional" },
      max_nodes: Math.min(56, Number(opts.max_nodes || 16) + contextRound * 14),
      max_receipts: Math.min(28, Number(opts.max_receipts || 10) + contextRound * 6),
      dataRoot: opts.data_root || process.env.ORANGEBOX_DATA_ROOT,
      appRoot: opts.app_root || process.cwd(),
    });
    const expansionLatency = Date.now() - expansionStart;
    run.metrics.relevance_controller.projection_id = scopedContext.projection_id;
    run.metrics.relevance_controller.estimated_chars = scopedContext.estimated_chars;
    run.metrics.relevance_controller.omitted = scopedContext.omitted;
    run.metrics.relevance_controller.latency_ms = (run.metrics.relevance_controller.latency_ms || 0) + expansionLatency;
    run.metrics.relevance_controller.context_expansions ||= [];
    run.metrics.relevance_controller.context_expansions.push({
      round: contextRound,
      projection_id: scopedContext.projection_id,
      estimated_chars: scopedContext.estimated_chars,
      omitted: scopedContext.omitted,
      latency_ms: expansionLatency,
      data_requests: dataRequests,
    });
    pushEvent(run, {
      phase: "relevance_projection_expanded",
      round: contextRound,
      projection_id: scopedContext.projection_id,
      intent: scopedContext.intent,
      omitted: scopedContext.omitted,
    });
    await emitReceiptIfFn(emitReceipt, {
      source: "relevance-projection-expansion",
      title: `Relevance projection expanded: round ${contextRound}`,
      summary: `${scopedContext.sources.canvas_state.nodes_included}/${scopedContext.sources.canvas_state.nodes_total} nodes included; ${scopedContext.estimated_chars} chars`,
      evidence: {
        run_id: run.id,
        round: contextRound,
        projection_id: scopedContext.projection_id,
        intent: scopedContext.intent,
        sources: scopedContext.sources,
        omitted: scopedContext.omitted,
        data_requests: dataRequests,
        latency_ms: expansionLatency,
      },
    });

    const retryCbPrompt = buildCreativeBrainPrompt({
      goal: expansionGoal,
      workspace: run.workspace,
      graphSnapshot,
      scopedContext,
      recentReceipts: opts.recent_receipts || [],
      promptAsset: promptBundle.creative,
    });
    pushEvent(run, { phase: "creative_brain_context_retry_start", round: contextRound });
    const retryCbStart = Date.now();
    const retryCbResult = await callModel(opts, {
      provider: opts.creative_provider || "anthropic",
      model: opts.creative_model || "claude-sonnet-4-5",
      prompt: retryCbPrompt.user,
      system: retryCbPrompt.system,
      max_tokens: retryCbPrompt.max_tokens,
    });
    run.metrics.creative_brain.pipe = retryCbResult.pipe || run.metrics.creative_brain.pipe || "unknown";
    run.metrics.creative_brain.tokens_in += retryCbResult.tokens_in || 0;
    run.metrics.creative_brain.tokens_out += retryCbResult.tokens_out || 0;
    run.metrics.creative_brain.dollar_cost += retryCbResult.dollar_cost ?? 0;
    run.metrics.creative_brain.model = retryCbResult.model || opts.creative_model || run.metrics.creative_brain.model || "unknown";
    run.metrics.creative_brain.latency_ms = (run.metrics.creative_brain.latency_ms || 0) + (Date.now() - retryCbStart);
    if (!retryCbResult.ok) {
      const error = retryCbResult.error || retryCbResult.fallback_reason || "creative brain context retry failed";
      pushEvent(run, { phase: "creative_brain_context_retry_error", round: contextRound, error });
      run.state = "failed"; run.error = error; run.finish_ts = Date.now();
      await emitReceiptIfFn(emitReceipt, {
        source: "silent-canvas-run",
        title: `Silent Canvas failed (context expansion Creative Brain): ${String(run.goal).slice(0, 60)}`,
        summary: error,
        evidence: { run_id: run.id, round: contextRound, metrics: run.metrics, data_requests: dataRequests },
      });
      return;
    }
    activeCreativeText = retryCbResult.text || "";
    pushEvent(run, { phase: "creative_brain_context_retry_done", round: contextRound, text_len: activeCreativeText.length, pipe: retryCbResult.pipe });

    const retryFiPrompt = buildFastInterpreterPrompt(activeCreativeText, { promptAsset: promptBundle.interpreter, producer });
    const retryFiStart = Date.now();
    let retryHsmp = null;
    let retryError = null;
    let retryFiResult = null;
    let retryParseAttempt = 0;
    for (retryParseAttempt = 1; retryParseAttempt <= 2; retryParseAttempt++) {
      if (retryParseAttempt > 1) {
        run.metrics.fast_interpreter.temp_zero_retries += 1;
        pushEvent(run, { phase: "fast_interpreter_context_retry_at_temp_zero", round: contextRound, parse_attempt: retryParseAttempt, previous_error: retryError });
      }
      retryFiResult = await callModel(opts, {
        provider: opts.interpreter_provider || "anthropic",
        model: opts.interpreter_model || "claude-haiku-4-5",
        prompt: retryFiPrompt.user + (retryParseAttempt > 1 ? "\n\nNOTE: previous attempt produced invalid JSON. Output ONLY the JSON object, no fences, no commentary." : ""),
        system: retryFiPrompt.system,
        max_tokens: retryFiPrompt.max_tokens,
        temperature: retryParseAttempt > 1 ? 0.0 : opts.interpreter_temperature,
      });
      run.metrics.fast_interpreter.pipe = retryFiResult.pipe || run.metrics.fast_interpreter.pipe || "unknown";
      run.metrics.fast_interpreter.tokens_in += retryFiResult.tokens_in || 0;
      run.metrics.fast_interpreter.tokens_out += retryFiResult.tokens_out || 0;
      run.metrics.fast_interpreter.dollar_cost += retryFiResult.dollar_cost ?? 0;
      run.metrics.fast_interpreter.model = retryFiResult.model || opts.interpreter_model || run.metrics.fast_interpreter.model || "unknown";
      if (!retryFiResult.ok) {
        retryError = retryFiResult.error || retryFiResult.fallback_reason || "fast interpreter context retry failed";
        break;
      }
      const ex = extractHSMP(retryFiResult.text || "");
      if (ex.error) { retryError = ex.error; continue; }
      const stampedRetryHsmp = stampHSMPProvenance(ex.hsmp, producer);
      recordSchemaCompatibility(run, stampedRetryHsmp);
      const v = validateHSMP(stampedRetryHsmp);
      if (!v.valid) {
        retryError = "schema invalid: " + (v.errors.slice(0, 3).map(e => `${e.path}: ${e.reason}`).join("; "));
        retryHsmp = stampedRetryHsmp;
        continue;
      }
      const semantic = await validatePatch({
        patch: stampedRetryHsmp,
        workspace: run.workspace,
        contextPackage: scopedContext,
        actor: opts.actor || { id: "silent-canvas", trust_tier: "T-Conditional" },
      });
      if (!semantic.ok) {
        retryError = "semantic invalid: " + (semantic.errors.slice(0, 3).map(e => `${e.schema || "schema"} ${e.path}: ${e.reason}`).join("; "));
        retryHsmp = stampedRetryHsmp;
        continue;
      }
      retryHsmp = stampedRetryHsmp;
      retryError = null;
      break;
    }
    const retryAttemptsUsed = Math.min(retryParseAttempt, 2);
    run.metrics.fast_interpreter.parse_attempt += retryAttemptsUsed;
    run.metrics.fast_interpreter.latency_ms = (run.metrics.fast_interpreter.latency_ms || 0) + (Date.now() - retryFiStart);
    run.metrics.fast_interpreter.parse_success = !!retryHsmp && !retryError;
    run.metrics.fast_interpreter.schema_valid = !!retryHsmp && !retryError;
    if (retryError) {
      pushEvent(run, { phase: "fast_interpreter_context_retry_error", round: contextRound, error: retryError, parse_attempt: retryAttemptsUsed });
      await emitReceiptIfFn(emitReceipt, {
        source: "silent-canvas-parse-error",
        title: `Silent Canvas Fast Interpreter retry failed (${retryAttemptsUsed} attempts)`,
        summary: retryError,
        evidence: {
          run_id: run.id,
          round: contextRound,
          parse_attempt: retryAttemptsUsed,
          temp_zero_retries: run.metrics.fast_interpreter.temp_zero_retries,
          raw_output_preview: (retryFiResult?.text || "").slice(0, 600),
          creative_output_preview: activeCreativeText.slice(0, 600),
          data_requests: dataRequests,
          producer,
          prompts: promptMeta,
          schema: run.metrics.schema,
          hsmp_compatibility: retryHsmp?.compatibility || null,
        },
      });
      run.state = "failed"; run.error = retryError; run.finish_ts = Date.now();
      return;
    }
    hsmp = retryHsmp;
    dataRequests = collectDataRequests(hsmp);
    pushEvent(run, {
      phase: "fast_interpreter_context_retry_done",
      round: contextRound,
      parse_attempt: retryAttemptsUsed,
      remaining_request_count: dataRequests.length,
    });
  }

  if (dataRequests.length > 0) {
    const error = `needs_more_context unresolved after ${maxContextExpansionRounds} relevance expansion rounds`;
    pushEvent(run, { phase: "needs_more_context_unresolved", error, requests: dataRequests });
    await emitReceiptIfFn(emitReceipt, {
      source: "silent-canvas-needs-more-context",
      title: "Silent Canvas stopped for missing context",
      summary: `${error}: ${describeDataRequests(dataRequests)}`,
      evidence: { run_id: run.id, max_rounds: maxContextExpansionRounds, data_requests: dataRequests, metrics: run.metrics },
    });
    run.state = "failed"; run.error = error; run.finish_ts = Date.now();
    return;
  }

  // ─── PHASE 4: Render Objective + Roadmap on dashboard ───────────────────
  run.dashboard.objective = hsmp.objective;
  run.dashboard.milestones = hsmp.milestones.map(m => ({ ...m }));
  run.dashboard.summary_template = hsmp.summary_template;
  run.dashboard.summary_checklist = []; // fills as we go
  run.metrics.latency_ms_objective = Date.now() - t0;
  run.metrics.latency_ms_roadmap   = Date.now() - t0;
  pushEvent(run, { phase: "objective", text: hsmp.objective });
  pushEvent(run, { phase: "roadmap",   milestones: run.dashboard.milestones });
  await emitReceiptIfFn(emitReceipt, {
    source: "silent-canvas-objective",
    title:  `Silent Canvas objective: ${String(hsmp.objective).slice(0, 80)}`,
    summary: hsmp.objective,
    evidence: { run_id: run.id, objective: hsmp.objective },
  });
  await emitReceiptIfFn(emitReceipt, {
    source: "silent-canvas-roadmap",
    title:  `Silent Canvas roadmap: ${hsmp.milestones.length} milestones`,
    summary: hsmp.milestones.map(m => m.text).join(" · "),
    evidence: { run_id: run.id, milestones: hsmp.milestones },
  });

  // ─── PHASE 5: Execute state mutations, mutating dashboard + graph ───────
  for (const milestone of hsmp.milestones) {
    if (run.cancelToken.cancelled) return finishCancelled(run, emitReceipt);
    milestone.state = "in_progress";
    pushEvent(run, { phase: "milestone_start", id: milestone.id, text: milestone.text });
    await emitReceiptIfFn(emitReceipt, {
      source: "silent-canvas-milestone",
      title:  `Milestone start: ${milestone.text}`,
      summary: `id=${milestone.id} state=in_progress`,
      evidence: { run_id: run.id, milestone_id: milestone.id },
    });
    const mutations = hsmp.state_mutations.filter(sm => sm.milestone_id === milestone.id);
    let milestoneOk = true;
    for (const sm of mutations) {
      if (run.cancelToken.cancelled) return finishCancelled(run, emitReceipt);
      if (run.metrics.latency_ms_first_mutation === null) {
        run.metrics.latency_ms_first_mutation = Date.now() - t0;
      }
      const applyResult = await graph.applyMutation(run.workspace, run.id, sm);
      pushEvent(run, {
        phase: "state_mutation",
        milestone_id: milestone.id, mutation_id: sm.id,
        kind: sm.kind, target: sm.target,
        primitive_version: applyResult.primitive_version || sm.primitive_version || HSMP_PRIMITIVE_VERSION,
        workspace_version_before: applyResult.workspace_version_before,
        workspace_version_after: applyResult.workspace_version_after,
        conflict_marker: applyResult.conflict_marker || null,
        ok: applyResult.ok, evidence: applyResult.evidence, error: applyResult.error,
      });
      if (!applyResult.ok) milestoneOk = false;
    }
    milestone.state = milestoneOk ? "complete" : "failed";
    pushEvent(run, { phase: milestoneOk ? "milestone_done" : "milestone_fail", id: milestone.id });
    await emitReceiptIfFn(emitReceipt, {
      source: "silent-canvas-milestone",
      title:  `Milestone ${milestone.state}: ${milestone.text}`,
      summary: `id=${milestone.id} state=${milestone.state}`,
      evidence: { run_id: run.id, milestone_id: milestone.id, mutation_count: mutations.length },
    });
  }

  // ─── PHASE 6: Application Summary ───────────────────────────────────────
  run.dashboard.summary_checklist = (hsmp.summary_checklist || []).slice(0, 12);
  run.metrics.latency_ms_summary = Date.now() - t0;
  pushEvent(run, {
    phase: "summary",
    text: hsmp.summary_template,
    checklist: run.dashboard.summary_checklist,
  });
  await emitReceiptIfFn(emitReceipt, {
    source: "silent-canvas-summary",
    title:  `Silent Canvas summary: ${String(hsmp.summary_template || "").slice(0, 80)}`,
    summary: run.dashboard.summary_checklist.join(" · "),
    evidence: { run_id: run.id, summary_template: hsmp.summary_template, checklist: run.dashboard.summary_checklist },
  });

  // ─── PHASE 7: Post-run snapshot + composite receipt ─────────────────────
  await graph.snapshot(run.workspace, `post-${run.id}`).catch(() => null);
  run.state = "finished";
  run.finish_ts = Date.now();
  run.metrics.latency_ms_total = run.finish_ts - t0;
  run.result = { hsmp, dashboard: run.dashboard };

  const totalCost = (run.metrics.creative_brain.dollar_cost || 0) + (run.metrics.fast_interpreter.dollar_cost || 0);
  const baselineOpusUsd = 0.42; // doctrine §12 single-Opus baseline reference
  await emitReceiptIfFn(emitReceipt, {
    source: "silent-canvas-run",
    title:  `Silent Canvas finished: ${String(run.goal).slice(0, 60)}`,
    summary: `${hsmp.milestones.length} milestones · ${hsmp.state_mutations.length} mutations · $${totalCost.toFixed(4)}`,
    evidence: {
      run_id: run.id,
      goal_excerpt: String(run.goal).slice(0, 200),
      workspace: run.workspace,
      hsmp_schema_version: hsmp.schema_version || HSMP_SCHEMA_VERSION,
      hsmp_compat_version: hsmp.hsmp_compat_version || HSMP_COMPAT_VERSION,
      hsmp_compatibility: hsmp.compatibility || null,
      hsmp_primitive_version: hsmp.primitive_version || HSMP_PRIMITIVE_VERSION,
      primitive_versions: [...new Set((hsmp.state_mutations || []).map((sm) => sm.primitive_version || HSMP_PRIMITIVE_VERSION))],
      producer,
      prompt_bundle: promptMeta,
      objective: hsmp.objective,
      milestones: hsmp.milestones,
      mutation_count: hsmp.state_mutations.length,
      summary_template: hsmp.summary_template,
      summary_checklist: run.dashboard.summary_checklist,
      metrics: run.metrics,
      relevance_projection: {
        projection_id: scopedContext.projection_id,
        intent: scopedContext.intent,
        omitted: scopedContext.omitted,
        sources: scopedContext.sources,
      },
      benefit_reduced_api_expenses: {
        total_cost_usd: totalCost,
        creative_brain_cost_usd: run.metrics.creative_brain.dollar_cost,
        fast_interpreter_cost_usd: run.metrics.fast_interpreter.dollar_cost,
        baseline_opus_single_model_usd: baselineOpusUsd,
        savings_pct_vs_baseline: totalCost === 0 ? 100 : Math.max(0, Math.round((1 - totalCost / baselineOpusUsd) * 100)),
      },
      benefit_lower_latency: {
        latency_ms_objective: run.metrics.latency_ms_objective,
        latency_ms_roadmap:   run.metrics.latency_ms_roadmap,
        latency_ms_first_mutation: run.metrics.latency_ms_first_mutation,
        latency_ms_summary:   run.metrics.latency_ms_summary,
        latency_ms_total:     run.metrics.latency_ms_total,
      },
      benefit_consistent_formatting: {
        parse_attempt: run.metrics.fast_interpreter.parse_attempt,
        temp_zero_retries: run.metrics.fast_interpreter.temp_zero_retries,
        parse_success: run.metrics.fast_interpreter.parse_success,
        schema_valid: run.metrics.fast_interpreter.schema_valid,
      },
    },
  });
  pushEvent(run, { phase: "done", run_id: run.id });
}

async function finishCancelled(run, emitReceipt) {
  run.state = "cancelled";
  run.finish_ts = Date.now();
  pushEvent(run, { phase: "cancelled" });
  await emitReceiptIfFn(emitReceipt, {
    source: "silent-canvas-run",
    title:  `Silent Canvas cancelled: ${String(run.goal).slice(0, 60)}`,
    summary: "operator-cancelled mid-run",
    evidence: { run_id: run.id, metrics: run.metrics },
  });
}

// ── PUBLIC API ─────────────────────────────────────────────────────────────
export function status(id) {
  const r = RUNS.get(id);
  if (!r) return null;
  return {
    id: r.id, goal: r.goal, workspace: r.workspace,
    state: r.state,
    start_ts: r.start_ts, finish_ts: r.finish_ts,
    dashboard: r.dashboard,
    metrics: r.metrics,
    events_count: r.events.length,
    events_tail: r.events.slice(-40),
    result: r.result, error: r.error,
  };
}

export function cancel(id) {
  const r = RUNS.get(id);
  if (!r) return { ok: false, error: "no such run" };
  if (r.state !== "running") return { ok: false, error: `run is ${r.state}` };
  r.cancelToken.cancelled = true;
  return { ok: true, id };
}

export function cancelAll(reason = "operator") {
  const cancelled = [];
  for (const r of RUNS.values()) {
    if (r.state !== "running") continue;
    r.cancelToken.cancelled = true;
    pushEvent(r, { phase: "cancel_requested", reason });
    cancelled.push(r.id);
  }
  return { ok: true, cancelled_count: cancelled.length, cancelled };
}

export function list({ limit = 20 } = {}) {
  const items = Array.from(RUNS.values())
    .sort((a, b) => b.start_ts - a.start_ts)
    .slice(0, limit)
    .map(r => ({
      id: r.id, goal: String(r.goal).slice(0, 120), state: r.state,
      start_ts: r.start_ts, finish_ts: r.finish_ts,
      objective: r.dashboard?.objective || null,
      milestone_count: r.dashboard?.milestones?.length || 0,
    }));
  return { items, total_in_memory: RUNS.size };
}

export function replayEvents(id) {
  const r = RUNS.get(id);
  if (!r) return null;
  return { id, events: r.events };
}
