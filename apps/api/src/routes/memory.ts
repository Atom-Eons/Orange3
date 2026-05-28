import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createId } from "../runtime/id.js";

export const memoryRouter = Router();

memoryRouter.get("/", async (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? "");
  const q = String(req.query.q ?? "");
  if (!workspaceId) {
    res.status(400).json({ ok: false, error: "workspaceId is required" });
    return;
  }
  const memory = await prisma.memoryItem.findMany({
    where: { workspaceId, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }] } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });
  res.json({ ok: true, memory });
});

memoryRouter.post("/", async (req, res) => {
  const schema = z.object({ workspaceId: z.string(), scope: z.enum(["session", "workspace", "user"]).default("workspace"), title: z.string(), content: z.string(), tags: z.array(z.string()).default([]), relatedPanelIds: z.array(z.string()).default([]), metadata: z.record(z.string(), z.unknown()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const memory = await prisma.memoryItem.create({
    data: {
      id: createId("memory"),
      workspaceId: parsed.data.workspaceId,
      scope: parsed.data.scope,
      title: parsed.data.title,
      content: parsed.data.content,
      tags: parsed.data.tags,
      relatedPanelIds: parsed.data.relatedPanelIds,
      metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  res.json({ ok: true, memory });
});
