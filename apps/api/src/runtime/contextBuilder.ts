import type { AgentRunRequest } from "../types/api.js";
import { prisma } from "../db/client.js";

export interface AgentContext {
  workspaceId?: string;
  sessionId?: string;
  userId?: string;
  command: string;
  messages: AgentRunRequest["messages"];
  workspace: AgentRunRequest["workspace"];
  recentArtifacts: Array<{ id: string; title: string; kind: string; contentPreview: string }>;
  recentMemory: Array<{ id: string; title: string; content: string; scope: string }>;
}

export async function buildContext(input: AgentRunRequest): Promise<AgentContext> {
  const recentArtifacts = input.workspaceId
    ? await prisma.artifact.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true, kind: true, content: true },
      }).catch(() => [])
    : [];
  const recentMemory = input.workspaceId
    ? await prisma.memoryItem.findMany({
        where: { workspaceId: input.workspaceId },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, title: true, content: true, scope: true },
      }).catch(() => [])
    : [];
  return {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    userId: input.userId,
    command: input.command,
    messages: input.messages,
    workspace: input.workspace,
    recentArtifacts: recentArtifacts.map((artifact) => ({
      id: artifact.id,
      title: artifact.title,
      kind: artifact.kind,
      contentPreview: artifact.content.slice(0, 1200),
    })),
    recentMemory,
  };
}
