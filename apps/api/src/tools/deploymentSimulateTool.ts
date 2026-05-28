import { z } from "zod";
import type { ToolDefinition } from "../types/tools.js";

const DeploymentSimulateArgsSchema = z.object({ target: z.string().optional(), trafficPercent: z.number().min(0).max(100).optional(), command: z.string().optional() });

export const deploymentSimulateTool: ToolDefinition = {
  name: "deployment.simulate",
  label: "Simulate Deployment",
  description: "Run a mock deployment simulation and return risk/impact.",
  permissions: ["read", "execute"],
  async invoke(input) {
    const parsed = DeploymentSimulateArgsSchema.safeParse(input.args);
    if (!parsed.success) return { callId: input.callId, toolName: input.toolName, ok: false, error: "Invalid deployment simulation args" };
    const metrics = input.context.workspace.metrics as { latencyMs?: number; cpu?: number; network?: number } | undefined;
    const latency = Number(metrics?.latencyMs ?? 42);
    const cpu = Number(metrics?.cpu ?? 68);
    const network = Number(metrics?.network ?? 82);
    const risk = latency > 120 || cpu > 86 || network > 90 ? "high" : latency > 80 || cpu > 78 ? "medium" : "low";
    return {
      callId: input.callId,
      toolName: input.toolName,
      ok: true,
      result: {
        risk,
        recommended: risk === "low" ? true : risk === "medium" ? "canary-only" : false,
        estimatedLatencyChange: risk === "high" ? "+12%" : "-8%",
        suggestedRollout: risk === "high" ? "Delay deployment and resolve latency first." : risk === "medium" ? "Canary at 5%, monitor p95 latency." : "Proceed with staged rollout.",
      },
    };
  },
};
