/* relevance-controller.mjs - v6.3.0-alpha.8
 * Deterministic projection layer: the Brain sees a bounded state projection,
 * not raw project state. This is the first real Relevance Controller spine.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as graph from "./project-graph.mjs";
import { classifyIntent, tokenize } from "./intent-classifier.mjs";
import { loadDataState } from "./data-state.mjs";
import { loadWorkflowState } from "./workflow-state.mjs";
import { loadDesignState } from "./design-state.mjs";
import { loadPermissionState } from "./permission-state.mjs";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);
}

function textOf(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function scoreText(text, terms) {
  const lower = String(text || "").toLowerCase();
  let score = 0;
  for (const term of terms || []) {
    if (!term) continue;
    if (lower.includes(String(term).toLowerCase())) score += 2;
  }
  return score;
}

function scoreNode(node, terms, selectedNode) {
  let score = 0;
  const haystack = [node.id, node.kind, node.target, node.target_path, textOf(node.details)].join(" ");
  score += scoreText(haystack, terms);
  if (selectedNode && node.id === selectedNode) score += 100;
  if (node.details?.recently_touched || node.details?.active) score += 5;
  return score;
}

function selectCanvasSubgraph(g, intent, { maxNodes = 16, viewport = null } = {}) {
  const nodes = g.nodes || [];
  const activeBox = graph.activeBoundingBoxFromGraph(g, {
    viewport,
    selected_node: intent.selected_node,
    maxNodes,
    padding: 80,
    includeNeighbors: true,
  });
  const activeIds = new Set((activeBox.nodes || []).map((node) => node.id));
  const scored = nodes
    .map((node) => ({
      node,
      score: scoreNode(node, intent.focus_terms, intent.selected_node) + (activeIds.has(node.id) ? 25 : 0),
    }))
    .sort((a, b) => b.score - a.score);
  const picked = scored.some((x) => x.score > 0)
    ? scored.slice(0, maxNodes).map((x) => x.node)
    : (activeBox.nodes || nodes.slice(-maxNodes)).slice(0, maxNodes);
  const pickedIds = new Set(picked.map((n) => n.id));
  for (const node of activeBox.nodes || []) {
    if (pickedIds.size < maxNodes && node.id) pickedIds.add(node.id);
  }
  const wires = (g.wires || []).filter((w) => pickedIds.has(w.from) || pickedIds.has(w.to)).slice(-30);
  for (const w of wires) {
    if (w.from) pickedIds.add(w.from);
    if (w.to) pickedIds.add(w.to);
  }
  const expandedNodes = nodes.filter((n) => pickedIds.has(n.id)).slice(0, maxNodes + 8);
  const regions = (g.regions || []).filter((r) => (r.contains || []).some((id) => pickedIds.has(id))).slice(0, 10);
  return {
    nodes: expandedNodes,
    wires,
    regions,
    annotations: (g.annotations || []).filter((a) => pickedIds.has(a.node_id)).slice(-20),
    mutation_log_tail: (g.mutation_log || []).slice(-20),
    totals: {
      active_bbox_strategy: activeBox.strategy,
      active_bbox: activeBox.bbox,
      nodes_total: nodes.length,
      nodes_included: expandedNodes.length,
      wires_total: (g.wires || []).length,
      wires_included: wires.length,
      regions_total: (g.regions || []).length,
      regions_included: regions.length,
    },
  };
}

async function readRecentRuntime({ dataRoot, appRoot, limit = 10 } = {}) {
  const roots = [
    path.join(dataRoot || defaultDataRoot(), "receipts"),
    path.join(dataRoot || defaultDataRoot(), "receipts", "v4"),
    appRoot ? path.join(appRoot, "receipts") : null,
  ].filter(Boolean);
  const items = [];
  for (const root of roots) {
    if (!fsSync.existsSync(root)) continue;
    const files = (await fs.readdir(root).catch(() => []))
      .filter((f) => f.endsWith(".json") || f.endsWith(".md"))
      .sort()
      .reverse()
      .slice(0, limit);
    for (const f of files) {
      const full = path.join(root, f);
      try {
        const stat = await fs.stat(full);
        let summary = f;
        if (f.endsWith(".json")) {
          const obj = JSON.parse(await fs.readFile(full, "utf8"));
          summary = obj.title || obj.scope || obj.summary || f;
        } else {
          summary = (await fs.readFile(full, "utf8")).split(/\r?\n/).find((line) => line.trim().startsWith("#")) || f;
        }
        items.push({ file: full, mtime: stat.mtime.toISOString(), summary: String(summary).slice(0, 240) });
      } catch { /* skip unreadable receipt */ }
    }
  }
  return items.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, limit);
}

function compact(value, maxChars = 18000) {
  const raw = JSON.stringify(value);
  if (raw.length <= maxChars) return value;
  return {
    truncated: true,
    original_chars: raw.length,
    preview: raw.slice(0, maxChars),
  };
}

function sliceArray(value, max) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function compactContext(context, maxChars = 18000) {
  const raw = JSON.stringify(context);
  if (raw.length <= maxChars) return context;
  const c = context || {};
  return {
    truncated: true,
    original_chars: raw.length,
    canvas_state: {
      ...(c.canvas_state || {}),
      nodes: sliceArray(c.canvas_state?.nodes, 16),
      wires: sliceArray(c.canvas_state?.wires, 30),
      regions: sliceArray(c.canvas_state?.regions, 10),
      annotations: sliceArray(c.canvas_state?.annotations, 20),
      mutation_log_tail: sliceArray(c.canvas_state?.mutation_log_tail, 8),
    },
    data_state: {
      ...(c.data_state || {}),
      tables: sliceArray(c.data_state?.tables, 8),
      schemas: sliceArray(c.data_state?.schemas, 8),
      endpoints: sliceArray(c.data_state?.endpoints, 12),
      bindings: sliceArray(c.data_state?.bindings, 12),
    },
    workflow_state: {
      ...(c.workflow_state || {}),
      workflows: sliceArray(c.workflow_state?.workflows, 8),
    },
    design_state: {
      ...(c.design_state || {}),
      components: sliceArray(c.design_state?.components, 20),
    },
    runtime_state: sliceArray(c.runtime_state, 8),
    history_state: {
      ...(c.history_state || {}),
      recent_mutations: sliceArray(c.history_state?.recent_mutations, 12),
    },
    permission_state: c.permission_state || {},
  };
}

export async function buildScopedContext({
  goal,
  workspace,
  selected_node = null,
  viewport = null,
  route = null,
  actor = { id: "silent-canvas", trust_tier: "T-Conditional" },
  max_nodes = 16,
  max_receipts = 10,
  dataRoot = defaultDataRoot(),
  appRoot = path.resolve("."),
} = {}) {
  if (!workspace) throw new Error("workspace required");
  const intent = classifyIntent({ goal, selected_node, route });
  const g = await graph.loadOrInit(workspace);
  const canvas_state = selectCanvasSubgraph(g, intent, { maxNodes: max_nodes, viewport });
  const [data_state, workflow_state, design_state, permission_state, runtime_state] = await Promise.all([
    loadDataState(workspace),
    loadWorkflowState(workspace),
    loadDesignState(workspace),
    loadPermissionState(workspace),
    readRecentRuntime({ dataRoot, appRoot, limit: max_receipts }),
  ]);
  const history_state = {
    recent_mutations: (g.mutation_log || []).slice(-30),
    last_mutated_at: g.last_mutated_at || null,
  };
  const sources = {
    canvas_state: { status: "projected", ...canvas_state.totals },
    data_state: { status: "loaded", tables: data_state.tables?.length || 0, bindings: data_state.bindings?.length || 0 },
    workflow_state: { status: "loaded", workflows: workflow_state.workflows?.length || 0 },
    design_state: { status: "loaded", components: design_state.components?.length || 0 },
    runtime_state: { status: "loaded", receipts: runtime_state.length },
    history_state: { status: "loaded", recent_mutations: history_state.recent_mutations.length },
    permission_state: { status: "loaded", catalog: permission_state.operation_catalog },
  };
  const context = {
    canvas_state,
    data_state,
    workflow_state,
    design_state,
    runtime_state,
    history_state,
    permission_state,
  };
  const packageBody = {
    schema_version: 1,
    controller: "orangebox-relevance-controller",
    generated_at: new Date().toISOString(),
    workspace: path.resolve(workspace),
    actor,
    intent,
    sources,
    context: compactContext(context),
    doctrine: {
      source_of_truth: "project graph and state stores, not the LLM",
      nevers: [
        "never give raw full project state to the Brain",
        "never let the Brain overwrite the canvas JSON",
        "never let chat carry primary visual change explanation",
        "never let the model guess missing state; emit needs_more_context",
      ],
    },
  };
  return {
    ...packageBody,
    projection_id: stableHash(packageBody),
    estimated_chars: JSON.stringify(packageBody).length,
    omitted: {
      canvas_nodes: Math.max(0, (g.nodes || []).length - canvas_state.nodes.length),
      canvas_wires: Math.max(0, (g.wires || []).length - canvas_state.wires.length),
    },
  };
}

export function formatScopedContextForBrain(pkg) {
  const c = pkg.context || {};
  const lines = [
    `RELEVANCE PROJECTION: ${pkg.projection_id}`,
    `INTENT: ${pkg.intent?.intent_type} / risk=${pkg.intent?.risk} / confidence=${pkg.intent?.confidence}`,
    `FOCUS TERMS: ${(pkg.intent?.focus_terms || []).join(", ")}`,
    `WORKSPACE: ${pkg.workspace}`,
    "",
    "CANVAS STATE:",
    `  included ${c.canvas_state?.nodes?.length || 0}/${pkg.sources?.canvas_state?.nodes_total || 0} nodes`,
    `  included ${c.canvas_state?.wires?.length || 0}/${pkg.sources?.canvas_state?.wires_total || 0} wires`,
    `  active_bbox=${pkg.sources?.canvas_state?.active_bbox_strategy || "unknown"}`,
    `  last mutations: ${(c.canvas_state?.mutation_log_tail || []).map((m) => `${m.kind}:${m.target}`).slice(-8).join(" | ") || "none"}`,
    "",
    "DATA STATE:",
    `  tables=${c.data_state?.tables?.length || 0} schemas=${c.data_state?.schemas?.length || 0} endpoints=${c.data_state?.endpoints?.length || 0} bindings=${c.data_state?.bindings?.length || 0}`,
    "",
    "WORKFLOW STATE:",
    ...(c.workflow_state?.workflows || []).slice(0, 8).map((w) => `  - ${w.id}: ${w.entry_route || "no route"}`),
    "",
    "DESIGN STATE:",
    `  doctrine=${c.design_state?.doctrine || "none"}`,
    `  components=${(c.design_state?.components || []).join(", ")}`,
    "",
    "PERMISSION STATE:",
    `  allowed=${(c.permission_state?.operation_catalog?.allowed_operations || []).join(", ")}`,
    `  requires_confirmation=${(c.permission_state?.operation_catalog?.requires_confirmation || []).join(", ")}`,
    `  restricted=${(c.permission_state?.operation_catalog?.restricted_operations || []).join(", ")}`,
    "",
    "RUNTIME STATE:",
    ...(c.runtime_state || []).slice(0, 8).map((r) => `  - ${r.summary} (${r.file})`),
    "",
    "PROJECTED NODES:",
    ...(c.canvas_state?.nodes || []).map((n) => `  - ${n.id} [${n.kind}] ${n.target_path || n.target || ""}`),
    "",
    "DOCTRINE:",
    "  If required data is absent, emit a needs_more_context mutation. Do not guess.",
  ];
  return lines.join("\n").slice(0, 24000);
}
