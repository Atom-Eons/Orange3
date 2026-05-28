import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/client.js";
import { createId } from "../runtime/id.js";

export const workspacesRouter = Router();

workspacesRouter.post("/", async (req, res) => {
  const schema = z.object({ userId: z.string().optional(), name: z.string().min(1), description: z.string().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const workspace = await prisma.workspace.create({ data: { id: createId("workspace"), userId: parsed.data.userId, name: parsed.data.name, description: parsed.data.description } });
  res.json({ ok: true, workspace });
});

workspacesRouter.get("/:workspaceId", async (req, res) => {
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.params.workspaceId },
    include: { artifacts: { orderBy: { updatedAt: "desc" }, take: 10 }, memoryItems: { orderBy: { updatedAt: "desc" }, take: 10 }, events: { orderBy: { timestamp: "desc" }, take: 20 } },
  });
  if (!workspace) {
    res.status(404).json({ ok: false, error: "Workspace not found" });
    return;
  }
  res.json({ ok: true, workspace });
});
