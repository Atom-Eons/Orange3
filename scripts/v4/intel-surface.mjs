#!/usr/bin/env node
/* intel-surface.mjs - Create/update the ÆoN Intel Dashboard surface.
 *
 * This is the first real Wave 5 surface built from the Surface Factory: a
 * graph-backed dashboard for research/integration candidates that turns chat
 * intel into visible cards, proof gates, and exportable workflows.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { loadIntelCatalog, writeIntelBrief } from "./intel-integration.mjs";
import { createSurface, listSurfaces } from "./surface-factory.mjs";
import { applyMutation, loadOrInit, snapshot, workspaceState } from "./project-graph.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const INTEL_SURFACE_VERSION = "orangebox-intel-surface/v1";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function nodeIdForItem(item) {
  return `intel-${String(item.id || "item").replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`;
}

async function upsertNode(workspace, runId, mutation) {
  const g = await loadOrInit(workspace);
  if (g.nodes.some((node) => node.id === mutation.target)) {
    return await applyMutation(workspace, runId, {
      ...mutation,
      kind: "node_edit",
      id: `${mutation.id}-edit`,
    });
  }
  return await applyMutation(workspace, runId, mutation);
}

async function ensureWire(workspace, runId, mutation) {
  const g = await loadOrInit(workspace);
  if (g.wires.some((wire) => wire.id === mutation.target)) return { ok: true, skipped: true, target: mutation.target };
  return await applyMutation(workspace, runId, mutation);
}

async function ensureAnnotation(workspace, runId, mutation) {
  const g = await loadOrInit(workspace);
  if (g.annotations.some((annotation) => annotation.id === mutation.target)) {
    await applyMutation(workspace, runId, { id: `${mutation.id}-remove`, kind: "annotation_remove", target: mutation.target, details: {} });
  }
  return await applyMutation(workspace, runId, mutation);
}

function itemCard(item, index) {
  const p0 = item.priority === "P0";
  const column = p0 ? 0 : 1;
  const row = p0 ? index : index % 6;
  return {
    id: nodeIdForItem(item),
    x: 80 + column * 520,
    y: 980 + row * 122,
    w: p0 ? 460 : 420,
    h: 96,
    label: `${item.priority} ${item.name}`,
    item_id: item.id,
    priority: item.priority,
    status: item.status,
    domains: item.domains || [],
    summary: item.summary,
    proof_needed: item.proof_needed || [],
    orangebox_integration: item.orangebox_integration || [],
  };
}

function dashboardReadme(catalog, items) {
  const p0 = items.filter((item) => item.priority === "P0");
  return [
    "# ÆoN Intel Dashboard",
    "",
    "This Surface Factory workspace turns the operator's high-signal research drops into a persistent ORANGEBOX graph.",
    "",
    "It is not a claim that every paper/vendor signal is verified. It is a routing surface: candidate ideas enter the inbox, move through proof gates, and only graduate after primary-source verification and local receipts.",
    "",
    `Catalog: \`${catalog.catalog_id}\``,
    `Items: ${items.length}`,
    `P0 items: ${p0.length}`,
    "",
    "## P0 Build Themes",
    "",
    ...p0.map((item) => `- \`${item.id}\`: ${item.name}`),
    "",
    "## Operating Rule",
    "",
    "Every promotion from this surface needs: primary source check, local prototype or fixture, doctor/eval gate, receipt, rollback.",
    ""
  ].join("\n");
}

function workflowPlan(items) {
  return {
    workflow_id: "aeon-intel-dashboard-top-p0",
    created_at: new Date().toISOString(),
    macro_actions: [
      {
        id: "verify-primary-sources",
        label: "Verify primary sources",
        applies_to: items.filter((item) => item.priority === "P0").map((item) => item.id),
        exit_criteria: ["source URL confirmed", "license/runtime risk noted", "claim restated without hype"]
      },
      {
        id: "prototype-locally",
        label: "Prototype locally",
        applies_to: ["delta-mem", "grep-primary-agentic-search", "clarification-timing-policy", "coordination-as-architecture"],
        exit_criteria: ["fixture exists", "baseline exists", "doctor or test command passes"]
      },
      {
        id: "promote-with-receipt",
        label: "Promote with receipt",
        applies_to: items.filter((item) => item.priority === "P0").map((item) => item.id),
        exit_criteria: ["improvement measured", "rollback named", "always-on activation explicitly approved"]
      }
    ]
  };
}

export async function createIntelSurface({
  dataRoot = defaultDataRoot(),
  writeReceipt = false,
} = {}) {
  const catalog = await loadIntelCatalog();
  const items = catalog.items || [];
  const existing = await listSurfaces({ dataRoot });
  let surface = existing.surfaces.find((s) =>
    s.slug === "aeon-intel-dashboard" ||
    s.slug === "on-intel-dashboard" ||
    String(s.name || "").toLowerCase().includes("intel dashboard")
  );
  let created = false;
  if (!surface) {
    const result = await createSurface({
      name: "ÆoN Intel Dashboard",
      description: "Research/intelligence integration surface for ORANGEBOX, Mesh, Claude-native profiles, memory, coordination, and agent evolution.",
      dataRoot,
    });
    surface = result.surface;
    created = true;
  }

  const workspace = surface.workspace;
  const runId = `intel-surface:${stampForFile()}`;
  const mutations = [];
  const add = async (mutation) => {
    const result = await upsertNode(workspace, runId, mutation);
    mutations.push({ id: mutation.id, target: mutation.target, kind: mutation.kind, ok: result.ok, skipped: result.skipped || false });
    return result;
  };

  await add({
    id: "intel-source-inbox",
    kind: "node_create",
    target: "intel-source-inbox",
    details: {
      element_kind: "source_lane",
      path: "intel/source-inbox",
      label: "Operator Intel Inbox",
      role: "manual high-signal drops; no claim promoted without primary-source verification",
      x: 80,
      y: 820,
      w: 360,
      h: 110,
      active: true
    }
  });
  await add({
    id: "intel-proof-gates",
    kind: "node_create",
    target: "intel-proof-gates",
    details: {
      element_kind: "gate_lane",
      path: "intel/proof-gates",
      label: "Proof Gates",
      role: "primary-source check, local prototype, doctor/eval, receipt, rollback",
      x: 520,
      y: 820,
      w: 380,
      h: 110,
      active: true
    }
  });
  await add({
    id: "intel-roadmap-export",
    kind: "node_create",
    target: "intel-roadmap-export",
    details: {
      element_kind: "export_lane",
      path: "intel/roadmap-export",
      label: "Roadmap Export",
      role: "exports integration notes for Claude/Code/GPT lanes",
      x: 980,
      y: 820,
      w: 360,
      h: 110,
      active: true
    }
  });

  const cards = items.map(itemCard);
  for (const card of cards) {
    await add({
      id: `${card.id}-card`,
      kind: "node_create",
      target: card.id,
      details: {
        element_kind: "intel_card",
        path: `intel/items/${card.item_id}`,
        label: card.label,
        role: card.summary,
        x: card.x,
        y: card.y,
        w: card.w,
        h: card.h,
        priority: card.priority,
        status: card.status,
        domains: card.domains,
        proof_needed: card.proof_needed,
        orangebox_integration: card.orangebox_integration,
        active: card.priority === "P0"
      }
    });
    await ensureWire(workspace, runId, {
      id: `wire-source-${card.id}`,
      kind: "wire_create",
      target: `wire-source-${card.id}`,
      details: {
        from: "intel-source-inbox",
        to: card.id,
        wire_kind: "candidate_intake",
        label: "candidate"
      }
    });
    await ensureWire(workspace, runId, {
      id: `wire-proof-${card.id}`,
      kind: "wire_create",
      target: `wire-proof-${card.id}`,
      details: {
        from: card.id,
        to: "intel-proof-gates",
        wire_kind: "promotion_gate",
        label: "verify before promote"
      }
    });
  }

  await ensureWire(workspace, runId, {
    id: "wire-proof-to-export",
    kind: "wire_create",
    target: "wire-proof-to-export",
    details: {
      from: "intel-proof-gates",
      to: "intel-roadmap-export",
      wire_kind: "approved_export",
      label: "receipt-backed integration notes"
    }
  });

  await ensureAnnotation(workspace, runId, {
    id: "intel-dashboard-law",
    kind: "annotation_add",
    target: "intel-dashboard-law",
    details: {
      node_id: "intel-proof-gates",
      text: "Candidate intel is not production truth. Promotion requires primary-source verification, local proof, doctor/eval receipt, and rollback."
    }
  });

  await fs.mkdir(path.join(workspace, "docs"), { recursive: true });
  await fs.mkdir(path.join(workspace, "data"), { recursive: true });
  await fs.mkdir(path.join(workspace, "workflows"), { recursive: true });
  await fs.writeFile(path.join(workspace, "README.md"), dashboardReadme(catalog, items), "utf8");
  await fs.writeFile(path.join(workspace, "data", "intel-catalog.snapshot.json"), JSON.stringify(catalog, null, 2) + "\n", "utf8");
  await fs.writeFile(path.join(workspace, "workflows", "top-p0-integration-plan.json"), JSON.stringify(workflowPlan(items), null, 2) + "\n", "utf8");
  const brief = await writeIntelBrief({ outPath: path.join(workspace, "docs", "INTEGRATION_BRIEF.md") });
  const snap = await snapshot(workspace, "intel-dashboard");
  const state = await workspaceState(workspace);

  let receiptPath = null;
  if (writeReceipt) {
    const dir = path.join(ROOT, "receipts");
    await fs.mkdir(dir, { recursive: true });
    receiptPath = path.join(dir, `orangebox-intel-surface-${stampForFile()}.json`);
    await fs.writeFile(receiptPath, JSON.stringify({
      receipt_id: `orangebox-intel-surface-${stampForFile()}`,
      project: "ORANGEBOX",
      surface_id: surface.surface_id,
      title: "ÆoN Intel Dashboard surface",
      created_at: new Date().toISOString(),
      created_new_surface: created,
      workspace,
      catalog_id: catalog.catalog_id,
      items: items.length,
      p0_items: items.filter((item) => item.priority === "P0").length,
      graph_counts: state.counts,
      snapshot: snap.file,
      files: [
        path.join(workspace, "README.md"),
        path.join(workspace, "data", "intel-catalog.snapshot.json"),
        path.join(workspace, "workflows", "top-p0-integration-plan.json"),
        brief.path
      ],
      law: "Candidate intel requires primary-source verification before production promotion."
    }, null, 2) + "\n", "utf8");
  }

  return {
    ok: true,
    version: INTEL_SURFACE_VERSION,
    created_new_surface: created,
    surface,
    workspace,
    catalog_id: catalog.catalog_id,
    items: items.length,
    p0_items: items.filter((item) => item.priority === "P0").length,
    graph_counts: state.counts,
    snapshot: snap,
    brief_path: brief.path,
    receipt_path: receiptPath
  };
}

export async function runIntelSurfaceDoctor({ dataRoot = defaultDataRoot(), writeReceipt = false } = {}) {
  const result = await createIntelSurface({ dataRoot, writeReceipt });
  const requiredFiles = [
    path.join(result.workspace, "README.md"),
    path.join(result.workspace, "data", "intel-catalog.snapshot.json"),
    path.join(result.workspace, "workflows", "top-p0-integration-plan.json"),
    path.join(result.workspace, "docs", "INTEGRATION_BRIEF.md")
  ];
  const missing = [];
  for (const file of requiredFiles) {
    try { await fs.access(file); } catch { missing.push(file); }
  }
  return {
    ok: result.ok
      && result.items >= 12
      && result.p0_items >= 7
      && result.graph_counts.nodes >= 21
      && result.graph_counts.wires >= 28
      && missing.length === 0,
    doctor: "orangebox-intel-surface-doctor/v1",
    result,
    required_files: requiredFiles,
    missing
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const receipt = process.argv.includes("--receipt");
  const doctor = process.argv.includes("doctor");
  const out = doctor ? await runIntelSurfaceDoctor({ writeReceipt: receipt }) : await createIntelSurface({ writeReceipt: receipt });
  if (json) console.log(JSON.stringify(out, null, 2));
  else console.log(`${out.ok ? "PASS" : "FAIL"} ÆoN Intel Dashboard ${out.result?.workspace || out.workspace}`);
  process.exit(out.ok ? 0 : 4);
}
