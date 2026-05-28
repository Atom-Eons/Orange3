import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createId } from "../runtime/id.js";

export const artifactsRouter = Router();

artifactsRouter.get("/", async (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? "");
  if (!workspaceId) {
    res.status(400).json({ ok: false, error: "workspaceId is required" });
    return;
  }
  const artifacts = await prisma.artifact.findMany({ where: { workspaceId }, orderBy: { updatedAt: "desc" }, take: 50 });
  res.json({ ok: true, artifacts });
});

artifactsRouter.post("/", async (req, res) => {
  const schema = z.object({ workspaceId: z.string(), kind: z.string(), title: z.string(), content: z.string(), relatedPanelIds: z.array(z.string()).default([]), metadata: z.record(z.string(), z.unknown()).optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const artifact = await prisma.artifact.create({
    data: {
      id: createId("artifact"),
      workspaceId: parsed.data.workspaceId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      content: parsed.data.content,
      relatedPanelIds: parsed.data.relatedPanelIds,
      metadata: parsed.data.metadata as Prisma.InputJsonValue | undefined,
    },
  });
  res.json({ ok: true, artifact });
});

artifactsRouter.get("/:artifactId", async (req, res) => {
  const artifact = await prisma.artifact.findUnique({ where: { id: req.params.artifactId } });
  if (!artifact) {
    res.status(404).json({ ok: false, error: "Artifact not found" });
    return;
  }
  res.json({ ok: true, artifact });
});
