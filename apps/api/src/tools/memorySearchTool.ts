import type { ToolDefinition } from "../types/tools.js";
import { prisma } from "../db/client.js";

export const memorySearchTool: ToolDefinition = {
  name: "memory.search",
  label: "Search Memory",
  description: "Search workspace memory items.",
  permissions: ["read"],
  async invoke(input) {
    const query = typeof input.args === "object" && input.args && "query" in input.args ? String((input.args as { query: unknown }).query) : "";
    if (!input.context.workspaceId) return { callId: input.callId, toolName: input.toolName, ok: true, result: { query, matches: [] } };
    const matches = await prisma.memoryItem.findMany({
      where: { workspaceId: input.context.workspaceId, OR: [{ title: { contains: query, mode: "insensitive" } }, { content: { contains: query, mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }).catch(() => []);
    return { callId: input.callId, toolName: input.toolName, ok: true, result: { query, matches } };
  },
};
