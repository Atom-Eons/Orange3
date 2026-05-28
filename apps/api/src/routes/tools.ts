import { Router } from "express";
import { toolRegistry } from "../tools/toolRegistry.js";

export const toolsRouter = Router();

toolsRouter.get("/", (_req, res) => {
  res.json({ ok: true, tools: toolRegistry.list() });
});
