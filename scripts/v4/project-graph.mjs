/* project-graph.mjs — v6.3.0-alpha.1 — Project graph (canonical canvas state).
 *
 * Silent Canvas Doctrine §5.4: "The canvas is backed by a project graph
 * stored at <dataRoot>/projects/<hash>/graph.json. This graph persists
 * across sessions, is the diff target for every state mutation, compiles
 * to the actual filesystem state on `compile` or live as mutations land,
 * snapshots automatically every 60s and on milestone boundaries."
 *
 * Schema for a project graph:
 *   {
 *     version: 1,
 *     project_hash: "sha256-of-abs-path",
 *     workspace: "/abs/path",
 *     created_at: "iso8601",
 *     last_mutated_at: "iso8601",
 *     nodes:   [ { id, kind, target, x, y, w, h, details } ],
 *     wires:   [ { id, from, to, kind, details } ],
 *     regions: [ { id, label, contains: [node_ids], x, y, w, h } ],
 *     annotations: [ { id, node_id, text } ],
 *     mutation_log: [ { ts, hsmp_run_id, mutation_id, kind, target } ]
 *   }
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

export const GRAPH_MUTATION_PRIMITIVE_VERSION = "silent-canvas-primitives/v1";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function projectsDir() { return path.join(dataRoot(), "projects"); }
function projectHash(workspace) {
  return crypto.createHash("sha256").update(path.resolve(workspace)).digest("hex").slice(0, 16);
}
function projectDir(workspace)   { return path.join(projectsDir(), projectHash(workspace)); }
function graphPath(workspace)    { return path.join(projectDir(workspace), "graph.json"); }
function snapshotsDir(workspace) { return path.join(projectDir(workspace), "snapshots"); }

function graphFingerprint(g) {
  const stable = {
    nodes: g.nodes || [],
    wires: g.wires || [],
    regions: g.regions || [],
    annotations: g.annotations || [],
  };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function finiteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nodeRect(node) {
  return {
    x: finiteNumber(node.x),
    y: finiteNumber(node.y),
    w: finiteNumber(node.w, 160),
    h: finiteNumber(node.h, 80),
  };
}

function nodeDisplayLabel(node) {
  const details = node?.details && typeof node.details === "object" ? node.details : {};
  const label = details.label || details.title || details.name || node?.target_path || node?.target || node?.id || "node";
  return String(label).slice(0, 96);
}

function workspaceVisualSample(g, { maxNodes = 18, maxWires = 32 } = {}) {
  const latestTargets = new Set((g.mutation_log || []).slice(-12).map((m) => m.target).filter(Boolean));
  const active = activeBoundingBoxFromGraph(g, { padding: 120, maxNodes, includeNeighbors: true });
  const nodes = (active.nodes || []).map((node) => {
    const rect = nodeRect(node);
    return {
      id: node.id,
      kind: node.kind || "node",
      label: nodeDisplayLabel(node),
      target_path: node.target_path || null,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      active: Boolean(node.details?.active || node.details?.recently_touched || latestTargets.has(node.id) || latestTargets.has(node.target) || latestTargets.has(node.target_path)),
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const wires = (active.wires || [])
    .filter((wire) => nodeIds.has(wire.from) && nodeIds.has(wire.to))
    .slice(0, maxWires)
    .map((wire) => ({
      id: wire.id,
      from: wire.from,
      to: wire.to,
      kind: wire.kind || "wire",
    }));
  return {
    strategy: active.strategy,
    bbox: active.bbox,
    nodes,
    wires,
    totals: active.totals,
  };
}

async function surfaceSeedVisualSample(workspace, { maxNodes = 18, maxWires = 32 } = {}) {
  const seedPath = path.join(path.resolve(workspace), "surface-template-seed.json");
  if (!fsSync.existsSync(seedPath)) return null;
  try {
    const seed = JSON.parse(await fs.readFile(seedPath, "utf8"));
    const mutations = Array.isArray(seed.seed_mutations) ? seed.seed_mutations : [];
    const nodes = [];
    const wires = [];
    for (const mutation of mutations) {
      const details = mutation.details && typeof mutation.details === "object" ? mutation.details : {};
      if (mutation.kind === "node_create") {
        nodes.push({
          id: mutation.target,
          kind: details.element_kind || "node",
          label: String(details.label || mutation.target || "node").slice(0, 96),
          target_path: details.path || null,
          x: finiteNumber(details.x),
          y: finiteNumber(details.y),
          w: finiteNumber(details.w, 160),
          h: finiteNumber(details.h, 80),
          active: true,
        });
      }
      if (mutation.kind === "wire_create") {
        wires.push({
          id: mutation.target,
          from: details.from,
          to: details.to,
          kind: details.wire_kind || "wire",
        });
      }
    }
    const visibleNodes = nodes.slice(0, maxNodes);
    const visibleIds = new Set(visibleNodes.map((node) => node.id));
    const visibleWires = wires
      .filter((wire) => visibleIds.has(wire.from) && visibleIds.has(wire.to))
      .slice(0, maxWires);
    const bbox = visibleNodes.length ? padRect(rectUnion(visibleNodes.map(nodeRect)), 120) : { x: 0, y: 0, w: 1, h: 1 };
    return {
      strategy: "surface_seed_preview_pending_graph_recovery",
      source: "surface-template-seed.json",
      bbox,
      nodes: visibleNodes,
      wires: visibleWires,
      totals: {
        nodes_total: nodes.length,
        nodes_included: visibleNodes.length,
        wires_total: wires.length,
        wires_included: visibleWires.length,
        regions_total: mutations.filter((mutation) => mutation.kind === "region_create").length,
        regions_included: mutations.filter((mutation) => mutation.kind === "region_create").length,
        annotations_total: mutations.filter((mutation) => mutation.kind === "annotation_add").length,
        annotations_included: mutations.filter((mutation) => mutation.kind === "annotation_add").length,
      },
    };
  } catch (err) {
    return {
      strategy: "surface_seed_preview_failed",
      source: "surface-template-seed.json",
      error: err?.message || String(err),
      bbox: { x: 0, y: 0, w: 1, h: 1 },
      nodes: [],
      wires: [],
      totals: {
        nodes_total: 0,
        nodes_included: 0,
        wires_total: 0,
        wires_included: 0,
        regions_total: 0,
        regions_included: 0,
        annotations_total: 0,
        annotations_included: 0,
      },
    };
  }
}

const RECEIPT_PROOF_CACHE_MS = 2500;
const RECEIPT_PROOF_LIMIT = 40;
const RECEIPT_PROOF_MAX_BYTES = 350_000;
const receiptProofCache = new Map();

function receiptProofDirs() {
  return [
    path.join(dataRoot(), "receipts", "v4"),
    path.join(dataRoot(), "receipts"),
    path.join(process.cwd(), "receipts"),
  ];
}

function receiptMutationTokens(mutation) {
  return [
    mutation?.mutation_id,
    mutation?.id,
    mutation?.target,
    mutation?.target_path,
    mutation?.hsmp_run_id,
  ].filter((value) => typeof value === "string" && value.trim().length >= 4);
}

function compactReceiptTitle(receipt, file) {
  const title = receipt?.title || receipt?.source || path.basename(file);
  return String(title || "receipt").slice(0, 120);
}

async function latestReceiptCandidates() {
  const root = dataRoot();
  const cached = receiptProofCache.get(root);
  const now = Date.now();
  if (cached && now - cached.at < RECEIPT_PROOF_CACHE_MS) return cached.items;

  const byFile = new Map();
  for (const dir of receiptProofDirs()) {
    if (!fsSync.existsSync(dir)) continue;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !/\.(json|md)$/i.test(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (byFile.has(file)) continue;
      try {
        const stat = await fs.stat(file);
        if (stat.size > RECEIPT_PROOF_MAX_BYTES) continue;
        byFile.set(file, {
          file,
          mtimeMs: stat.mtimeMs,
          modified_at: stat.mtime.toISOString(),
          bytes: stat.size,
        });
      } catch {
        // Ignore transient receipt files; proof enrichment should never block state.
      }
    }
  }

  const files = Array.from(byFile.values()).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, RECEIPT_PROOF_LIMIT);
  const items = [];
  for (const meta of files) {
    try {
      const text = await fs.readFile(meta.file, "utf8");
      let parsed = null;
      if (/\.json$/i.test(meta.file)) {
        try { parsed = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { parsed = null; }
      }
      items.push({
        ...meta,
        id: parsed?.id || path.basename(meta.file, path.extname(meta.file)),
        source: parsed?.source || null,
        title: compactReceiptTitle(parsed, meta.file),
        summary: typeof parsed?.summary === "string" ? parsed.summary.slice(0, 240) : "",
        text,
      });
    } catch {
      // Missing or locked receipt files are advisory only.
    }
  }

  receiptProofCache.set(root, { at: now, items });
  return items;
}

function scoreReceiptForMutation(receipt, mutation) {
  const text = receipt.text || "";
  const tokens = receiptMutationTokens(mutation);
  let score = 0;
  const matched = [];
  for (const token of tokens) {
    if (!text.includes(token)) continue;
    score += token === mutation?.target ? 5 : token === mutation?.mutation_id || token === mutation?.id ? 4 : 2;
    matched.push(token);
  }
  if (mutation?.kind && text.includes(mutation.kind)) score += 1;
  if (receipt.source === "surface-factory" && mutation?.hsmp_run_id?.startsWith("surface-factory:")) score += 3;
  if (receipt.summary && mutation?.target && receipt.summary.includes(mutation.target)) score += 2;
  return { score, matched };
}

async function proofLinksForMutations(mutations) {
  const receipts = await latestReceiptCandidates();
  return (mutations || []).map((mutation) => {
    let best = null;
    for (const receipt of receipts) {
      const scored = scoreReceiptForMutation(receipt, mutation);
      if (scored.score <= 0) continue;
      if (!best || scored.score > best.score || (scored.score === best.score && receipt.mtimeMs > best.mtimeMs)) {
        best = { receipt, ...scored };
      }
    }
    if (!best) return null;
    return {
      kind: "receipt",
      receipt_id: best.receipt.id,
      source: best.receipt.source,
      title: best.receipt.title,
      summary: best.receipt.summary,
      path: best.receipt.file,
      modified_at: best.receipt.modified_at,
      score: best.score,
      matched: best.matched.slice(0, 5),
    };
  });
}

function padRect(rect, padding = 0) {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    w: rect.w + padding * 2,
    h: rect.h + padding * 2,
  };
}

function rectUnion(rects) {
  if (!rects.length) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const rect of rects) {
    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.w);
    maxY = Math.max(maxY, rect.y + rect.h);
  }
  return { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
}

function rectIntersects(a, b) {
  return a.x <= b.x + b.w && a.x + a.w >= b.x && a.y <= b.y + b.h && a.y + a.h >= b.y;
}

function viewportRect(viewport) {
  if (!viewport || typeof viewport !== "object") return null;
  const x = Number(viewport.x);
  const y = Number(viewport.y);
  const w = Number(viewport.w ?? viewport.width);
  const h = Number(viewport.h ?? viewport.height);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

export function activeBoundingBoxFromGraph(g, {
  viewport = null,
  selected_node = null,
  padding = 80,
  maxNodes = 24,
  includeNeighbors = true,
} = {}) {
  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  const wires = Array.isArray(g.wires) ? g.wires : [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const recentTargets = new Set((g.mutation_log || []).slice(-12).map((m) => m.target).filter(Boolean));
  let baseRect = viewportRect(viewport);
  let strategy = baseRect ? "viewport" : "auto";

  if (!baseRect && selected_node && nodeById.has(selected_node)) {
    baseRect = nodeRect(nodeById.get(selected_node));
    strategy = "selected_node";
  }

  if (!baseRect) {
    const activeNodes = nodes.filter((node) =>
      node.details?.active ||
      node.details?.recently_touched ||
      recentTargets.has(node.id) ||
      recentTargets.has(node.target) ||
      recentTargets.has(node.target_path)
    );
    if (activeNodes.length) {
      baseRect = rectUnion(activeNodes.map(nodeRect));
      strategy = "active_or_recent_nodes";
    }
  }

  if (!baseRect) {
    const tailNodes = nodes.slice(-Math.max(1, Math.min(maxNodes, nodes.length)));
    baseRect = rectUnion(tailNodes.map(nodeRect));
    strategy = "tail_nodes";
  }

  const padded = padRect(baseRect, Number.isFinite(Number(padding)) ? Number(padding) : 80);
  const selected = new Set(nodes.filter((node) => rectIntersects(nodeRect(node), padded)).map((node) => node.id));
  if (selected_node && nodeById.has(selected_node)) selected.add(selected_node);

  if (includeNeighbors) {
    for (const wire of wires) {
      if (selected.has(wire.from) || selected.has(wire.to)) {
        if (wire.from) selected.add(wire.from);
        if (wire.to) selected.add(wire.to);
      }
    }
  }

  const priority = (node) => {
    if (node.id === selected_node) return 1000;
    if (rectIntersects(nodeRect(node), padded)) return 500;
    if (recentTargets.has(node.id) || recentTargets.has(node.target) || recentTargets.has(node.target_path)) return 250;
    return 0;
  };
  const selectedNodes = nodes
    .filter((node) => selected.has(node.id))
    .sort((a, b) => priority(b) - priority(a))
    .slice(0, Math.max(1, maxNodes));
  const selectedIds = new Set(selectedNodes.map((node) => node.id));
  const selectedWires = wires.filter((wire) => selectedIds.has(wire.from) || selectedIds.has(wire.to));
  const selectedRegions = (g.regions || []).filter((region) => (region.contains || []).some((id) => selectedIds.has(id)));
  const selectedAnnotations = (g.annotations || []).filter((annotation) => selectedIds.has(annotation.node_id));

  return {
    strategy,
    bbox: padded,
    nodes: selectedNodes,
    wires: selectedWires,
    regions: selectedRegions,
    annotations: selectedAnnotations,
    totals: {
      nodes_total: nodes.length,
      nodes_included: selectedNodes.length,
      wires_total: wires.length,
      wires_included: selectedWires.length,
      regions_total: (g.regions || []).length,
      regions_included: selectedRegions.length,
      annotations_total: (g.annotations || []).length,
      annotations_included: selectedAnnotations.length,
    },
  };
}

function normalizeGraphShape(g, workspace) {
  g.version = g.version || 1;
  g.graph_schema_version = g.graph_schema_version || 2;
  g.project_hash = g.project_hash || projectHash(workspace);
  g.workspace = path.resolve(g.workspace || workspace);
  g.created_at = g.created_at || new Date().toISOString();
  g.last_mutated_at = g.last_mutated_at || g.created_at;
  g.workspace_version = Number.isFinite(Number(g.workspace_version)) ? Number(g.workspace_version) : 1;
  g.nodes = Array.isArray(g.nodes) ? g.nodes : [];
  g.wires = Array.isArray(g.wires) ? g.wires : [];
  g.regions = Array.isArray(g.regions) ? g.regions : [];
  g.annotations = Array.isArray(g.annotations) ? g.annotations : [];
  g.mutation_log = Array.isArray(g.mutation_log) ? g.mutation_log : [];
  g.conflict_markers = Array.isArray(g.conflict_markers) ? g.conflict_markers : [];
  g.views = g.views && typeof g.views === "object" && !Array.isArray(g.views) ? g.views : {};
  g.state_fingerprint = graphFingerprint(g);
  return g;
}

// ── Load / init ────────────────────────────────────────────────────────────
export async function loadOrInit(workspace) {
  await fs.mkdir(projectDir(workspace), { recursive: true });
  await fs.mkdir(snapshotsDir(workspace), { recursive: true });
  if (fsSync.existsSync(graphPath(workspace))) {
    try {
      const doc = JSON.parse(await fs.readFile(graphPath(workspace), "utf8"));
      return normalizeGraphShape(doc, workspace);
    } catch {
      // corrupt — back up + reinit
      await fs.rename(graphPath(workspace), graphPath(workspace) + ".corrupt-" + Date.now());
    }
  }
  const blank = {
    version: 1,
    graph_schema_version: 2,
    project_hash: projectHash(workspace),
    workspace: path.resolve(workspace),
    workspace_version: 1,
    created_at: new Date().toISOString(),
    last_mutated_at: new Date().toISOString(),
    nodes: [], wires: [], regions: [], annotations: [], mutation_log: [],
    conflict_markers: [],
    views: {},
    state_fingerprint: null,
  };
  await save(workspace, blank);
  return blank;
}

export async function save(workspace, graph, { incrementVersion = false } = {}) {
  normalizeGraphShape(graph, workspace);
  if (incrementVersion) graph.workspace_version = Number(graph.workspace_version || 0) + 1;
  graph.last_mutated_at = new Date().toISOString();
  graph.state_fingerprint = graphFingerprint(graph);
  await fs.mkdir(projectDir(workspace), { recursive: true });
  try {
    await fs.writeFile(graphPath(workspace), JSON.stringify(graph, null, 2));
  } catch (err) {
    if (err?.code !== "ENOENT") throw err;
    await fs.mkdir(path.dirname(graphPath(workspace)), { recursive: true });
    await fs.writeFile(graphPath(workspace), JSON.stringify(graph, null, 2));
  }
  return graph;
}

// ── Snapshot ───────────────────────────────────────────────────────────────
export async function snapshot(workspace, label = null) {
  const g = await loadOrInit(workspace);
  await fs.mkdir(snapshotsDir(workspace), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const labelPart = label ? "_" + label.replace(/[^a-z0-9-]/gi, "-").slice(0, 32) : "";
  const file = path.join(snapshotsDir(workspace), `${stamp}${labelPart}.json`);
  await fs.writeFile(file, JSON.stringify(g, null, 2));
  return { file, ts: stamp, nodes: g.nodes.length, wires: g.wires.length };
}

export async function listSnapshots(workspace, { limit = 50 } = {}) {
  if (!fsSync.existsSync(snapshotsDir(workspace))) return { items: [] };
  const entries = (await fs.readdir(snapshotsDir(workspace))).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit);
  const items = [];
  for (const f of entries) {
    try {
      const fp = path.join(snapshotsDir(workspace), f);
      const stat = await fs.stat(fp);
      items.push({ file: fp, name: f, size: stat.size, mtime: stat.mtime.toISOString() });
    } catch { /* skip */ }
  }
  return { items };
}

export async function loadSnapshotFile(workspace, file) {
  const base = path.resolve(snapshotsDir(workspace));
  const target = path.resolve(String(file || ""));
  const rel = path.relative(base, target);
  if (!target.endsWith(".json")) throw new Error("snapshot file must be .json");
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("snapshot file outside workspace snapshots");
  return JSON.parse(await fs.readFile(target, "utf8"));
}

export async function restoreSnapshot(workspace, { file = null, reason = "desync-recover" } = {}) {
  const beforeList = await listSnapshots(workspace, { limit: 20 });
  const targetFile = file || beforeList.items[0]?.file;
  if (!targetFile) return { ok: false, error: "no snapshot available" };
  const backup = await snapshot(workspace, "before-" + String(reason || "restore").replace(/[^a-z0-9-]/gi, "-").slice(0, 24));
  const restored = await loadSnapshotFile(workspace, targetFile);
  restored.last_mutated_at = new Date().toISOString();
  restored.mutation_log = Array.isArray(restored.mutation_log) ? restored.mutation_log : [];
  restored.mutation_log.push({
    ts: new Date().toISOString(),
    hsmp_run_id: "desync-recover",
    mutation_id: "restore-snapshot",
    kind: "snapshot_restore",
    target: targetFile,
    ok: true,
    error: null,
    reason,
    backup_snapshot: backup.file,
  });
  if (restored.mutation_log.length > 1000) restored.mutation_log = restored.mutation_log.slice(-1000);
  await save(workspace, restored, { incrementVersion: true });
  return {
    ok: true,
    restored_from: targetFile,
    backup_snapshot: backup.file,
    nodes: restored.nodes?.length || 0,
    wires: restored.wires?.length || 0,
    reason,
  };
}

// ── Apply a single state mutation ──────────────────────────────────────────
// Returns { ok, evidence, error }. Mutation is persisted on success.
export async function applyMutation(workspace, hsmpRunId, mutation) {
  const g = await loadOrInit(workspace);
  const { id, kind, target, details = {} } = mutation;
  const primitiveVersion = mutation.primitive_version || details.primitive_version || GRAPH_MUTATION_PRIMITIVE_VERSION;
  const beforeVersion = Number(g.workspace_version || 1);
  const expectedVersionRaw = mutation.expected_workspace_version ?? details.expected_workspace_version ?? null;
  const expectedVersion = expectedVersionRaw == null ? null : Number(expectedVersionRaw);
  const tabId = mutation.tab_id || details.tab_id || details.view_id || null;
  let conflict_marker = null;
  if (Number.isFinite(expectedVersion) && expectedVersion !== beforeVersion) {
    conflict_marker = {
      id: "conflict-" + crypto.randomBytes(6).toString("hex"),
      ts: new Date().toISOString(),
      kind: "workspace_version_mismatch",
      hsmp_run_id: hsmpRunId,
      mutation_id: id,
      target,
      expected_workspace_version: expectedVersion,
      actual_workspace_version: beforeVersion,
      tab_id: tabId,
      resolution: "last-writer-wins-marker",
    };
    g.conflict_markers.push(conflict_marker);
    if (g.conflict_markers.length > 200) g.conflict_markers = g.conflict_markers.slice(-200);
  }
  if (tabId) {
    g.views[tabId] = {
      tab_id: tabId,
      last_seen_workspace_version: Number.isFinite(expectedVersion) ? expectedVersion : beforeVersion,
      last_mutation_id: id,
      last_mutated_at: new Date().toISOString(),
    };
  }
  let evidence = null;
  let error = null;
  try {
    switch (kind) {
      case "node_create": {
        if (g.nodes.find(n => n.id === target)) { error = `node ${target} already exists`; break; }
        g.nodes.push({
          id: target, kind: details.element_kind || "file",
          target_path: details.path || null,
          x: details.x ?? 0, y: details.y ?? 0,
          w: details.w ?? 160, h: details.h ?? 80,
          details,
        });
        evidence = { added_node: target, primitive_version: primitiveVersion };
        break;
      }
      case "node_edit": {
        const n = g.nodes.find(n => n.id === target);
        if (!n) { error = `no such node ${target}`; break; }
        Object.assign(n.details, details);
        evidence = { edited_node: target, primitive_version: primitiveVersion };
        break;
      }
      case "node_delete": {
        const before = g.nodes.length;
        g.nodes = g.nodes.filter(n => n.id !== target);
        g.wires = g.wires.filter(w => w.from !== target && w.to !== target);
        evidence = { removed_node: target, before, after: g.nodes.length, primitive_version: primitiveVersion };
        break;
      }
      case "wire_create": {
        const { from, to, wire_kind = "function_call" } = details;
        if (!from || !to) { error = "wire requires details.from and details.to"; break; }
        g.wires.push({ id: target, from, to, kind: wire_kind, details });
        evidence = { added_wire: target, from, to, wire_kind, primitive_version: primitiveVersion };
        break;
      }
      case "wire_delete": {
        const before = g.wires.length;
        g.wires = g.wires.filter(w => w.id !== target);
        evidence = { removed_wire: target, before, after: g.wires.length, primitive_version: primitiveVersion };
        break;
      }
      case "region_create": {
        g.regions.push({
          id: target, label: details.label || target,
          contains: details.contains || [],
          x: details.x ?? 0, y: details.y ?? 0,
          w: details.w ?? 200, h: details.h ?? 200,
        });
        evidence = { added_region: target, primitive_version: primitiveVersion };
        break;
      }
      case "region_resize": {
        const r = g.regions.find(r => r.id === target);
        if (!r) { error = `no such region ${target}`; break; }
        if (details.x !== undefined) r.x = details.x;
        if (details.y !== undefined) r.y = details.y;
        if (details.w !== undefined) r.w = details.w;
        if (details.h !== undefined) r.h = details.h;
        evidence = { resized_region: target, primitive_version: primitiveVersion };
        break;
      }
      case "annotation_add": {
        g.annotations.push({
          id: target, node_id: details.node_id || null,
          text: details.text || "",
        });
        evidence = { added_annotation: target, primitive_version: primitiveVersion };
        break;
      }
      case "annotation_remove": {
        const before = g.annotations.length;
        g.annotations = g.annotations.filter(a => a.id !== target);
        evidence = { removed_annotation: target, before, after: g.annotations.length, primitive_version: primitiveVersion };
        break;
      }
      // file_* / component_update / run_cmd / test_run / deploy are paired
      // with real-disk operations in canvas-compiler.mjs (alpha.5). The
      // project graph just records the corresponding canvas node mutation.
      case "file_create":
      case "file_edit":
      case "file_delete":
      case "component_update":
      case "run_cmd":
      case "test_run":
      case "deploy": {
        // Project graph records these as a passthrough mutation_log entry.
        // The canvas may also have a paired node (representing the file/test/etc.)
        // that gets updated separately via a node_create/node_edit mutation.
        evidence = { kind, target, recorded: true, primitive_version: primitiveVersion };
        break;
      }
      case "needs_more_context": {
        evidence = {
          kind,
          target,
          recorded: true,
          informational: true,
          data_request: details.data_request || null,
          primitive_version: primitiveVersion
        };
        break;
      }
      default:
        error = `unknown mutation kind: ${kind}`;
    }
  } catch (e) {
    error = e.message;
  }
  // Log mutation regardless of success (for replay/audit)
  g.mutation_log.push({
    ts: new Date().toISOString(),
    hsmp_run_id: hsmpRunId,
    mutation_id: id,
    kind, target,
    primitive_version: primitiveVersion,
    workspace_version_before: beforeVersion,
    tab_id: tabId,
    conflict_marker,
    ok: !error,
    error,
  });
  // Cap mutation_log at 1000 most recent (older are in snapshots)
  if (g.mutation_log.length > 1000) g.mutation_log = g.mutation_log.slice(-1000);
  await save(workspace, g, { incrementVersion: true });
  const afterVersion = Number(g.workspace_version || beforeVersion + 1);
  g.mutation_log[g.mutation_log.length - 1].workspace_version_after = afterVersion;
  await save(workspace, g);
  return { ok: !error, evidence, error, primitive_version: primitiveVersion, workspace_version_before: beforeVersion, workspace_version_after: afterVersion, conflict_marker };
}

// ── Replay an HSMP run from the mutation_log ───────────────────────────────
export async function getMutationLog(workspace, { limit = 100, run_id = null } = {}) {
  const g = await loadOrInit(workspace);
  let log = g.mutation_log || [];
  if (run_id) log = log.filter(m => m.hsmp_run_id === run_id);
  return log.slice(-limit);
}

export async function workspaceState(workspace) {
  const g = await loadOrInit(workspace);
  const graphVisualSample = workspaceVisualSample(g);
  const seedVisualSample = g.nodes.length === 0 ? await surfaceSeedVisualSample(workspace) : null;
  const visualSample = seedVisualSample?.nodes?.length ? seedVisualSample : graphVisualSample;
  const latestMutations = (g.mutation_log || []).slice(-20);
  const proofLinks = await proofLinksForMutations(latestMutations);
  const latestMutationsWithProof = latestMutations.map((mutation, index) => ({
    ...mutation,
    proof_link: proofLinks[index] || null,
  }));
  return {
    ok: true,
    workspace: g.workspace,
    project_hash: g.project_hash,
    graph_schema_version: g.graph_schema_version,
    workspace_version: g.workspace_version,
    state_fingerprint: g.state_fingerprint || graphFingerprint(g),
    counts: {
      nodes: g.nodes.length,
      wires: g.wires.length,
      regions: g.regions.length,
      annotations: g.annotations.length,
      mutation_log: g.mutation_log.length,
      conflict_markers: g.conflict_markers.length,
      views: Object.keys(g.views || {}).length,
    },
    conflict_markers: (g.conflict_markers || []).slice(-20),
    views: Object.values(g.views || {}).sort((a, b) => String(b.last_mutated_at || "").localeCompare(String(a.last_mutated_at || ""))).slice(0, 20),
    latest_mutations: latestMutationsWithProof,
    proof_links: proofLinks.filter(Boolean),
    visual_sample: visualSample,
    recovery_state: seedVisualSample?.nodes?.length ? {
      status: "seed_preview",
      reason: "workspace graph is empty but this surface has a seed template available",
      action: "Run Surface Factory doctor or refresh workspace graph to restore the canonical project graph sample.",
      source: path.join(path.resolve(workspace), "surface-template-seed.json"),
    } : {
      status: (g.conflict_markers || []).length ? "conflict_markers_present" : "clean",
      reason: null,
      action: null,
      source: null,
    },
  };
}

// ── Auto-layout heuristic (place new nodes on a grid) ──────────────────────
export async function getActiveBoundingBox(workspace, opts = {}) {
  const g = await loadOrInit(workspace);
  return {
    ok: true,
    workspace: g.workspace,
    graph_schema_version: g.graph_schema_version,
    workspace_version: g.workspace_version,
    ...activeBoundingBoxFromGraph(g, opts),
  };
}

export async function nextAutoPos(workspace) {
  const g = await loadOrInit(workspace);
  const colW = 180, rowH = 110;
  const n = g.nodes.length;
  const cols = 6;
  return { x: 40 + (n % cols) * colW, y: 40 + Math.floor(n / cols) * rowH };
}
