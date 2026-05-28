import { Router } from "express";
import { z } from "zod";
import { setupSse } from "../runtime/eventStream.js";
import { runAgent } from "../runtime/agentRuntime.js";
import { simpleRateLimit } from "../security/rateLimit.js";

export const agentRunRouter = Router();

const AgentRunRequestSchema = z.object({
  workspaceId: z.string().optional(),
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  command: z.string().min(1),
  messages: z.array(z.object({ id: z.string().optional(), role: z.enum(["user", "assistant", "system", "tool"]), content: z.string(), createdAt: z.number().optional() })),
  workspace: z.record(z.string(), z.unknown()),
});

agentRunRouter.post("/run", simpleRateLimit({ windowMs: 60_000, max: 30 }), async (req, res) => {
  const parsed = AgentRunRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: parsed.error.flatten() });
    return;
  }
  const stream = setupSse(res);
  let closed = false;
  req.on("close", () => {
    closed = true;
  });
  try {
    await runAgent({ input: parsed.data as never, send: (event) => { if (!closed) stream.send(event); }, isClosed: () => closed });
    if (!closed) stream.send({ type: "done" });
  } catch (error) {
    if (!closed) stream.send({ type: "error", error: error instanceof Error ? error.message : "Agent run failed", code: "AGENT_RUN_FAILED" });
  } finally {
    if (!closed) stream.close();
  }
});
