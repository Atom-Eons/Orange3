/* workflow-state.mjs - v6.3.0-alpha.8
 * Named workflow registry projected by the Relevance Controller.
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
  return path.join(stateDir(workspace), "workflow-state.json");
}

export function defaultWorkflowState(workspace) {
  return {
    schema_version: 1,
    workspace: path.resolve(workspace || "."),
    updated_at: new Date().toISOString(),
    workflows: [
      {
        id: "silent-canvas-run",
        title: "Silent Canvas run",
        entry_route: "/api/v4/silent-canvas/run",
        required_params: ["goal", "workspace"],
        allowed_mutations: ["node_create", "node_edit", "wire_create", "region_create", "annotation_add", "needs_more_context"],
      },
      {
        id: "silent-canvas-compile",
        title: "Compile graph to disk",
        entry_route: "/api/v4/silent-canvas/compile",
        required_params: ["workspace"],
        requires_confirmation: true,
      },
    ],
    triggers: [],
  };
}

export async function loadWorkflowState(workspace) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  if (!fsSync.existsSync(statePath(workspace))) return defaultWorkflowState(workspace);
  try {
    return JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  } catch {
    return defaultWorkflowState(workspace);
  }
}

export async function saveWorkflowState(workspace, state) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  const stamped = { ...defaultWorkflowState(workspace), ...(state || {}), updated_at: new Date().toISOString() };
  await fs.writeFile(statePath(workspace), JSON.stringify(stamped, null, 2));
  return stamped;
}
