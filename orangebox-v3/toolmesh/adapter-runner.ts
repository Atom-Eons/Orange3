import { findCardById } from "./tool-registry";
import { authPolicyForTool } from "./auth-vault";

export type ToolActionRequest = {
  toolId: string;
  task: string;
  execute?: boolean;
};

export type ToolActionResult = {
  ok: boolean;
  executed: false;
  status: string;
  toolId: string;
  reason: string;
  authPolicy: ReturnType<typeof authPolicyForTool> | null;
};

export function dryRunToolAction(request: ToolActionRequest): ToolActionResult {
  const card = findCardById(request.toolId);
  if (!card) {
    return {
      ok: false,
      executed: false,
      status: "TOOL_NOT_REGISTERED",
      toolId: request.toolId,
      reason: "No ToolMesh card exists for this tool id.",
      authPolicy: null,
    };
  }

  return {
    ok: true,
    executed: false,
    status: "TOOLMESH_EXECUTION_NOT_PROMOTED",
    toolId: card.id,
    reason: "Y0 ToolMesh validates registry and routing only. Real execution requires the lab doctor, STRONGARM gate when risky, and a tool receipt.",
    authPolicy: authPolicyForTool(card.id, card.cloud),
  };
}
