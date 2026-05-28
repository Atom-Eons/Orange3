import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { createId } from "../runtime/id.js";

export const metricsRouter = Router();

metricsRouter.post("/snapshot", async (req, res) => {
  const schema = z.object({ workspaceId: z.string(), metrics: z.record(z.string(), z.unknown()) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const snapshot = await prisma.metricSnapshot.create({
    data: {
      id: createId("metric"),
      workspaceId: parsed.data.workspaceId,
      metrics: parsed.data.metrics as Prisma.InputJsonValue,
    },
  });
  res.json({ ok: true, snapshot });
});

metricsRouter.get("/recent", async (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? "");
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  if (!workspaceId) {
    res.status(400).json({ ok: false, error: "workspaceId is required" });
    return;
  }
  const snapshots = await prisma.metricSnapshot.findMany({ where: { workspaceId }, orderBy: { timestamp: "desc" }, take: limit });
  res.json({ ok: true, snapshots });
});

metricsRouter.get("/stream", async (req, res) => {
  const workspaceId = String(req.query.workspaceId ?? "");
  if (!workspaceId) {
    res.status(400).json({ ok: false, error: "workspaceId is required" });
    return;
  }
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  const interval = setInterval(async () => {
    const latest = await prisma.metricSnapshot.findFirst({ where: { workspaceId }, orderBy: { timestamp: "desc" } });
    if (latest) res.write(`data: ${JSON.stringify({ type: "metrics.snapshot", snapshot: latest })}\n\n`);
  }, 2000);
  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});
