import type { ToolDefinition } from "../types/tools.js";
import { prisma } from "../db/client.js";
import { createId } from "../runtime/id.js";

export const artifactWriteTool: ToolDefinition = {
  name: "artifact.write",
  label: "Write Artifact",
  description: "Create an artifact in the active workspace.",
  permissions: ["write"],
  async invoke(input) {
    if (!input.context.workspaceId) return { callId: input.callId, toolName: input.toolName, ok: false, error: "No workspaceId provided" };
    const args = input.args as Partial<{ title: string; kind: string; content: string; relatedPanelIds: string[] }>;
    const artifact = await prisma.artifact.create({
      data: {
        id: createId("artifact"),
        workspaceId: input.context.workspaceId,
        kind: args.kind ?? "analysis",
        title: args.title ?? "Generated Artifact",
        content: args.content ?? "",
        relatedPanelIds: args.relatedPanelIds ?? [],
      },
    });
    return { callId: input.callId, toolName: input.toolName, ok: true, result: artifact };
  },
};
