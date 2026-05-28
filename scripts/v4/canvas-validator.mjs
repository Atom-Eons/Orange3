/* canvas-validator.mjs - v6.3.0-alpha.8
 * Five-schema semantic validator above HSMP structural validation.
 */

import { validateHSMP, ELEMENT_TYPES, WIRE_TYPES } from "./hsmp-schema.mjs";
import { loadPermissionState, evaluateMutationPermission } from "./permission-state.mjs";
import * as graph from "./project-graph.mjs";

export async function validatePatch({ patch, workspace, contextPackage = null, actor = {} } = {}) {
  const errors = [];
  const fix_hints = [];
  const structural = validateHSMP(patch);
  if (!structural.valid) {
    for (const e of structural.errors) errors.push({ schema: "hsmp", ...e });
    fix_hints.push("Return a valid HSMP object before semantic validation can run.");
    return { ok: false, errors, fix_hints };
  }

  const g = await graph.loadOrInit(workspace);
  const permissionState = contextPackage?.context?.permission_state || await loadPermissionState(workspace);
  const nodeIds = new Set((g.nodes || []).map((n) => n.id));
  const wireIds = new Set((g.wires || []).map((w) => w.id));
  const regionIds = new Set((g.regions || []).map((r) => r.id));
  const futureNodeIds = new Set(nodeIds);
  for (const sm of patch.state_mutations || []) {
    if (sm.kind === "node_create" && sm.target) futureNodeIds.add(sm.target);
  }

  for (const sm of patch.state_mutations || []) {
    const perm = evaluateMutationPermission(sm, { permissionState, actor });
    if (!perm.ok && sm.kind !== "needs_more_context") {
      errors.push({ schema: "permission", path: `$.state_mutations.${sm.id}`, reason: perm.reason, disposition: perm.disposition });
      fix_hints.push(`Stage or remove ${sm.kind}; ${perm.reason}.`);
    }

    if (sm.kind === "node_create") {
      const elementKind = sm.details?.element_kind || "file";
      if (!ELEMENT_TYPES[elementKind]) {
        errors.push({ schema: "component", path: `$.state_mutations.${sm.id}.details.element_kind`, reason: `unknown element kind: ${elementKind}` });
        fix_hints.push(`Use one of: ${Object.keys(ELEMENT_TYPES).join(", ")}.`);
      }
      if (nodeIds.has(sm.target)) {
        errors.push({ schema: "layout", path: `$.state_mutations.${sm.id}.target`, reason: `node already exists: ${sm.target}` });
        fix_hints.push(`Use node_edit for ${sm.target}, or choose a new node id.`);
      }
    }
    if (["node_edit", "node_delete"].includes(sm.kind) && !nodeIds.has(sm.target)) {
      errors.push({ schema: "component", path: `$.state_mutations.${sm.id}.target`, reason: `target node does not exist: ${sm.target}` });
      fix_hints.push(`Create ${sm.target} first or target an existing node.`);
    }
    if (sm.kind === "wire_create") {
      const from = sm.details?.from;
      const to = sm.details?.to;
      const wireKind = sm.details?.wire_kind || "function_call";
      if (!from || !to || !futureNodeIds.has(from) || !futureNodeIds.has(to)) {
        errors.push({ schema: "workflow", path: `$.state_mutations.${sm.id}.details`, reason: "wire endpoints must reference existing nodes" });
        fix_hints.push("Create both nodes before wiring them, or emit needs_more_context.");
      }
      if (!WIRE_TYPES[wireKind]) {
        errors.push({ schema: "action", path: `$.state_mutations.${sm.id}.details.wire_kind`, reason: `unknown wire kind: ${wireKind}` });
        fix_hints.push(`Use one of: ${Object.keys(WIRE_TYPES).join(", ")}.`);
      }
    }
    if (sm.kind === "wire_delete" && !wireIds.has(sm.target)) {
      errors.push({ schema: "workflow", path: `$.state_mutations.${sm.id}.target`, reason: `wire does not exist: ${sm.target}` });
      fix_hints.push("Do not delete wires that are not present in canvas_state.");
    }
    if (sm.kind === "region_resize" && !regionIds.has(sm.target)) {
      errors.push({ schema: "layout", path: `$.state_mutations.${sm.id}.target`, reason: `region does not exist: ${sm.target}` });
      fix_hints.push("Use region_create first, then region_resize later.");
    }
    if (sm.kind === "needs_more_context") {
      const req = sm.details?.data_request || sm.data_request;
      if (!req?.type || !req?.reason) {
        errors.push({ schema: "workflow", path: `$.state_mutations.${sm.id}.details.data_request`, reason: "needs_more_context requires data_request.type and reason" });
        fix_hints.push("Describe the missing data instead of guessing.");
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    fix_hints: [...new Set(fix_hints)].slice(0, 12),
    schema_families: ["component", "layout", "workflow", "action", "permission"],
  };
}
