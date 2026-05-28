/* permission-state.mjs - v6.3.0-alpha.8
 * Mutation-level permission catalog. The model never owns this authority.
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
  return path.join(stateDir(workspace), "permission-state.json");
}

export const DEFAULT_OPERATION_CATALOG = {
  allowed_operations: [
    "node_create", "node_edit", "wire_create", "wire_delete", "region_create", "region_resize",
    "annotation_add", "annotation_remove", "component_update", "file_create", "file_edit",
    "test_run", "needs_more_context"
  ],
  requires_confirmation: [
    "node_delete", "file_delete", "run_cmd", "deploy"
  ],
  restricted_operations: [
    "delete_database", "change_auth_policy", "modify_billing_logic", "expose_secret",
    "overwrite_route", "publish_to_production", "modify_payment_provider"
  ],
};

export function defaultPermissionState(workspace) {
  return {
    schema_version: 1,
    workspace: path.resolve(workspace || "."),
    updated_at: new Date().toISOString(),
    authority: {
      draft: "AE11 Security",
      audit: "AE7 Review",
      ratify: "AE0 Brain",
      final_stop: "operator"
    },
    trust_tiers: {
      "T-Advisor": { can_apply_allowed: false, can_stage_requires_confirmation: true },
      "T-Conditional": { can_apply_allowed: true, can_stage_requires_confirmation: true },
      "T-Autonomous": { can_apply_allowed: true, can_stage_requires_confirmation: true }
    },
    operation_catalog: DEFAULT_OPERATION_CATALOG,
  };
}

export async function loadPermissionState(workspace) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  if (!fsSync.existsSync(statePath(workspace))) return defaultPermissionState(workspace);
  try {
    return JSON.parse(await fs.readFile(statePath(workspace), "utf8"));
  } catch {
    return defaultPermissionState(workspace);
  }
}

export async function savePermissionState(workspace, state) {
  await fs.mkdir(stateDir(workspace), { recursive: true });
  const stamped = { ...defaultPermissionState(workspace), ...(state || {}), updated_at: new Date().toISOString() };
  await fs.writeFile(statePath(workspace), JSON.stringify(stamped, null, 2));
  return stamped;
}

export function classifyOperation(kind, permissionState = defaultPermissionState(".")) {
  const catalog = permissionState.operation_catalog || DEFAULT_OPERATION_CATALOG;
  if ((catalog.restricted_operations || []).includes(kind)) return "restricted";
  if ((catalog.requires_confirmation || []).includes(kind)) return "requires_confirmation";
  if ((catalog.allowed_operations || []).includes(kind)) return "allowed";
  return "catalog_gap";
}

export function evaluateMutationPermission(mutation, { permissionState, actor = {} } = {}) {
  const kind = mutation?.kind || "";
  const tier = actor.trust_tier || "T-Conditional";
  const catalogClass = classifyOperation(kind, permissionState);
  if (catalogClass === "restricted") {
    return { ok: false, disposition: "blocked", reason: `restricted operation: ${kind}`, catalogClass };
  }
  if (catalogClass === "catalog_gap") {
    return { ok: false, disposition: "quarantine", reason: `permission catalog gap: ${kind}`, catalogClass };
  }
  if (catalogClass === "requires_confirmation") {
    return { ok: false, disposition: "stage_for_confirmation", reason: `operator confirmation required: ${kind}`, catalogClass };
  }
  const tierRules = (permissionState.trust_tiers || {})[tier] || {};
  if (!tierRules.can_apply_allowed) {
    return { ok: false, disposition: "propose_only", reason: `${tier} cannot apply mutations`, catalogClass };
  }
  return { ok: true, disposition: "apply", reason: "allowed", catalogClass };
}
