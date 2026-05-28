/* data-state.mjs - v6.3.0-alpha.8
 * Project-local data-state registry used by the Relevance Controller.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}
function projectHash(workspace) {
  return crypto.createHash("sha256").update(path.resolve(workspace || ".")).digest("hex").slice(0, 16);
}
function stateDir(workspace) {
  return path.join(dataRoot(), "projects", projectHash(workspace), "state");
}
function statePath(workspace) {
  return path.join(stateDir(workspace), "data-state.json");
}

export function defaultDataState(workspace) {
  return {
    schema_version: 1,
    workspace: path.resolve(workspace || "."),
    updated_at: new Date().toISOString(),
    tables: [],
    schemas: [],
    endpoints: [],
    bindings: [],
    notes: [
      "Data-state is sparse until connectors, forms, APIs, or table bindings register here."
    ],
  };
}

export async function loadDataState(workspace) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  if (!fsSync.existsSync(statePath(workspace))) return defaultDataState(workspace);
  try {
    return JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  } catch {
    return defaultDataState(workspace);
  }
}

export async function saveDataState(workspace, state) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  const stamped = { ...defaultDataState(workspace), ...(state || {}), updated_at: new Date().toISOString() };
  await fs.writeFile(statePath(workspace), JSON.stringify(stamped, null, 2));
  return stamped;
}

export async function registerDataBinding(workspace, binding) {
  const state = await loadDataState(workspace);
  const id = binding.id || `binding-${Date.now()}`;
  const next = { id, ...binding, updated_at: new Date().toISOString() };
  state.bindings = (state.bindings || []).filter((x) => x.id !== id).concat(next);
  await saveDataState(workspace, state);
  return next;
}
