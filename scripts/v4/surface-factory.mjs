/* surface-factory.mjs - ORANGEBOX Silent Canvas Surface Factory.
 *
 * A surface is a reusable Silent Canvas workspace instantiated from a
 * versioned template. This turns new product/ops canvases into a repeatable
 * creation flow instead of hand-built one-offs.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import * as graph from "./project-graph.mjs";

export const SURFACE_FACTORY_VERSION = "0.1.0";

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}

function slugify(value) {
  const slug = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "surface";
}

function stableId(prefix, value) {
  return `${prefix}-${crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 10)}`;
}

function factoryDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "surface-factory");
}

function registryPath(dataRoot = defaultDataRoot()) {
  return path.join(factoryDir(dataRoot), "registry.json");
}

function surfacesRoot(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "surfaces");
}

function safeResolveRoot(root) {
  const resolved = path.resolve(root);
  const forbidden = [path.parse(resolved).root, os.homedir()];
  if (forbidden.includes(resolved)) throw new Error(`refusing unsafe surface root: ${resolved}`);
  return resolved;
}

export const SURFACE_TEMPLATES = {
  "core-v1": {
    template_id: "core-v1",
    title: "Silent Canvas Core Surface",
    description: "Command Center, Vision Rail, Artifact Library, Relevance Controller, telemetry, and receipts ledger.",
    version: 1,
    seed_mutations: [
      {
        id: "sm-seed-vision-rail",
        milestone_id: "ms-seed",
        kind: "node_create",
        target: "surface-vision-rail",
        details: {
          element_kind: "component",
          path: "surface/vision-rail",
          label: "Vision Rail",
          role: "left timeline and department/DAG status",
          x: 40,
          y: 80,
          w: 220,
          h: 560
        },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-command-center",
        milestone_id: "ms-seed",
        kind: "node_create",
        target: "surface-command-center",
        details: {
          element_kind: "component",
          path: "surface/command-center",
          label: "Command Center",
          role: "operator prompt, party-line, private strategy lane",
          x: 300,
          y: 96,
          w: 520,
          h: 520
        },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-artifact-library",
        milestone_id: "ms-seed",
        kind: "node_create",
        target: "surface-artifact-library",
        details: {
          element_kind: "component",
          path: "surface/artifact-library",
          label: "Artifact Library",
          role: "receipts, generated assets, proof, and current deliverables",
          x: 860,
          y: 80,
          w: 420,
          h: 560
        },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-relevance-controller",
        milestone_id: "ms-seed",
        kind: "node_create",
        target: "surface-relevance-controller",
        details: {
          element_kind: "service",
          path: "surface/relevance-controller",
          label: "Relevance Controller",
          role: "bounded state projection before model calls",
          x: 338,
          y: 680,
          w: 260,
          h: 110
        },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-telemetry-layer",
        milestone_id: "ms-seed",
        kind: "node_create",
        target: "surface-visual-telemetry",
        details: {
          element_kind: "service",
          path: "surface/visual-telemetry",
          label: "Visual Telemetry",
          role: "diff pulses, smooth rect lerp, wire trace, mutation origin",
          x: 620,
          y: 680,
          w: 250,
          h: 110
        },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-receipts-ledger",
        milestone_id: "ms-seed",
        kind: "node_create",
        target: "surface-receipts-ledger",
        details: {
          element_kind: "data_store",
          path: "surface/receipts-ledger",
          label: "Receipts Ledger",
          role: "proof chain for every meaningful side effect",
          x: 900,
          y: 680,
          w: 250,
          h: 110
        },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-wire-context",
        milestone_id: "ms-seed",
        kind: "wire_create",
        target: "wire-relevance-to-command",
        details: { from: "surface-relevance-controller", to: "surface-command-center", wire_kind: "data_flow", label: "scoped context" },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-wire-telemetry",
        milestone_id: "ms-seed",
        kind: "wire_create",
        target: "wire-command-to-telemetry",
        details: { from: "surface-command-center", to: "surface-visual-telemetry", wire_kind: "active_data", label: "mutation events" },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-wire-proof",
        milestone_id: "ms-seed",
        kind: "wire_create",
        target: "wire-artifacts-to-receipts",
        details: { from: "surface-artifact-library", to: "surface-receipts-ledger", wire_kind: "dependency", label: "proof artifacts" },
        estimated_duration_ms: 0
      },
      {
        id: "sm-seed-region-shell",
        milestone_id: "ms-seed",
        kind: "region_create",
        target: "region-silent-canvas-shell",
        details: {
          label: "Silent Canvas Shell",
          contains: [
            "surface-vision-rail",
            "surface-command-center",
            "surface-artifact-library",
            "surface-relevance-controller",
            "surface-visual-telemetry",
            "surface-receipts-ledger"
          ],
          x: 20,
          y: 40,
          w: 1300,
          h: 780
        },
        estimated_duration_ms: 0
      }
    ]
  }
};

export function listTemplates() {
  return Object.values(SURFACE_TEMPLATES).map(({ seed_mutations, ...rest }) => ({
    ...rest,
    seed_mutation_count: seed_mutations.length
  }));
}

export async function loadRegistry({ dataRoot = defaultDataRoot() } = {}) {
  const file = registryPath(dataRoot);
  if (!fsSync.existsSync(file)) {
    return {
      schema_version: 1,
      factory_version: SURFACE_FACTORY_VERSION,
      updated_at: null,
      surfaces: []
    };
  }
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    if (!Array.isArray(parsed.surfaces)) parsed.surfaces = [];
    return parsed;
  } catch {
    const corrupt = `${file}.corrupt-${Date.now()}`;
    await fs.rename(file, corrupt);
    return {
      schema_version: 1,
      factory_version: SURFACE_FACTORY_VERSION,
      updated_at: null,
      surfaces: [],
      recovered_from_corrupt: corrupt
    };
  }
}

async function saveRegistry(registry, { dataRoot = defaultDataRoot() } = {}) {
  registry.updated_at = new Date().toISOString();
  registry.factory_version = SURFACE_FACTORY_VERSION;
  await fs.mkdir(path.dirname(registryPath(dataRoot)), { recursive: true });
  await fs.writeFile(registryPath(dataRoot), JSON.stringify(registry, null, 2));
  return registry;
}

function surfaceReadme({ name, template, manifest }) {
  return [
    `# ${name}`,
    "",
    "This ORANGEBOX surface was created by the Silent Canvas Surface Factory.",
    "",
    `- Surface id: \`${manifest.surface_id}\``,
    `- Template: \`${template.template_id}\``,
    `- Workspace: \`${manifest.workspace}\``,
    `- Created: \`${manifest.created_at}\``,
    "",
    "## What This Surface Contains",
    "",
    "- Vision Rail: project graph, departments, timeline, and state pulses.",
    "- Command Center: operator goal input and party-line/private strategy focus.",
    "- Artifact Library: receipts, proof artifacts, previews, and handoffs.",
    "- Relevance Controller: bounded state projection before model calls.",
    "- Visual Telemetry: smooth mutation feedback and data-flow traces.",
    "- Receipts Ledger: proof chain for every meaningful side effect.",
    "",
    "## Run Path",
    "",
    "Open this workspace in ORANGEBOX and use Silent Canvas or `obx surface list` to route work here.",
    ""
  ].join("\n");
}

export async function createSurface({
  name,
  template_id = "core-v1",
  root = null,
  description = "",
  overwrite = false,
  dataRoot = defaultDataRoot()
} = {}) {
  if (!name) throw new Error("surface name is required");
  const template = SURFACE_TEMPLATES[template_id];
  if (!template) throw new Error(`unknown surface template: ${template_id}`);

  const slug = slugify(name);
  const surfaceRoot = safeResolveRoot(root || path.join(surfacesRoot(dataRoot), slug));
  const manifestPath = path.join(surfaceRoot, "surface.json");
  if (!overwrite && fsSync.existsSync(manifestPath)) {
    throw new Error(`surface already exists: ${manifestPath}`);
  }

  await fs.mkdir(surfaceRoot, { recursive: true });
  await fs.mkdir(path.join(surfaceRoot, "docs"), { recursive: true });
  await fs.mkdir(path.join(surfaceRoot, "data"), { recursive: true });
  await fs.mkdir(path.join(surfaceRoot, "workflows"), { recursive: true });

  const surface_id = stableId("surf", `${template_id}:${surfaceRoot}`);
  const created_at = new Date().toISOString();
  const manifest = {
    schema_version: 1,
    surface_factory_version: SURFACE_FACTORY_VERSION,
    surface_id,
    name,
    slug,
    description,
    template_id,
    template_version: template.version,
    workspace: surfaceRoot,
    created_at,
    updated_at: created_at,
    doctrine: {
      engine: "silent-canvas",
      source_of_truth: "project graph",
      proof_law: "receipts for meaningful side effects",
      no_chat_scroll_fatigue: true
    }
  };

  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  await fs.writeFile(path.join(surfaceRoot, "README.md"), surfaceReadme({ name, template, manifest }));
  await fs.writeFile(path.join(surfaceRoot, "surface-template-seed.json"), JSON.stringify({
    template_id,
    template_version: template.version,
    seed_mutations: template.seed_mutations
  }, null, 2));

  const applied = [];
  for (const mutation of template.seed_mutations) {
    const result = await graph.applyMutation(surfaceRoot, `surface-factory:${surface_id}`, mutation);
    applied.push({ id: mutation.id, kind: mutation.kind, target: mutation.target, ok: result.ok, error: result.error || null });
    if (!result.ok) throw new Error(`seed mutation failed ${mutation.id}: ${result.error}`);
  }

  const registry = await loadRegistry({ dataRoot });
  registry.surfaces = registry.surfaces.filter((s) => s.surface_id !== surface_id && path.resolve(s.workspace) !== surfaceRoot);
  registry.surfaces.unshift({
    surface_id,
    name,
    slug,
    template_id,
    template_version: template.version,
    workspace: surfaceRoot,
    manifest_path: manifestPath,
    created_at,
    updated_at: created_at,
    description
  });
  await saveRegistry(registry, { dataRoot });

  const g = await graph.loadOrInit(surfaceRoot);
  return {
    ok: true,
    surface: registry.surfaces[0],
    manifest,
    template: {
      template_id: template.template_id,
      version: template.version,
      title: template.title
    },
    applied,
    graph: {
      nodes: g.nodes.length,
      wires: g.wires.length,
      regions: g.regions.length,
      annotations: g.annotations.length
    },
    registry_path: registryPath(dataRoot)
  };
}

export async function listSurfaces({ dataRoot = defaultDataRoot() } = {}) {
  const registry = await loadRegistry({ dataRoot });
  return {
    ok: true,
    registry_path: registryPath(dataRoot),
    count: registry.surfaces.length,
    surfaces: registry.surfaces
  };
}
