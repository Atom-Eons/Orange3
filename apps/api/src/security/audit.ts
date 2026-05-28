import { prisma } from "../db/client.js";
import { createId } from "../runtime/id.js";
import { redactSecrets } from "./sanitize.js";

export async function auditToolCall(input: { workspaceId?: string; sessionId?: string; toolName: string; args: unknown; ok: boolean; result?: unknown; error?: string }) {
  if (!input.workspaceId) return;
  await prisma.toolCall.create({
    data: {
      id: createId("toolcall"),
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      toolName: input.toolName,
      args: redactSecrets(input.args) as object,
      result: redactSecrets(input.result) as object,
      ok: input.ok,
      error: input.error,
    },
  });
}
