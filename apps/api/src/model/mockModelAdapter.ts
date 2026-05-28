import type { ModelAdapter } from "./modelAdapter.js";
import { createId } from "../runtime/id.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createResponse(command: string) {
  const lower = command.toLowerCase();
  if (lower.includes("latency") || lower.includes("gateway") || lower.includes("slow")) {
    return [
      "I traced the latency anomaly through the active workspace.",
      "",
      "Cause trail:",
      "High latency detected -> API Gateway saturation -> Model v2.4 deployment pressure -> resource spike -> user-facing slow responses.",
      "",
      "The strongest signal is gateway saturation after deployment pressure increased inference load. Network and CPU pressure are also elevated.",
      "",
      "Recommended actions:",
      "1. Scale the API gateway in us-east-1a.",
      "2. Enable connection pooling on the inference route.",
      "3. Shift 18-24% of traffic to us-east-1c for 10 minutes.",
      "4. Compare model v2.4 p95 latency against v2.3.",
      "5. Keep watcher and analyst agents active until latency normalizes.",
      "",
      "Confidence: 89%.",
    ].join("\n");
  }
  if (lower.includes("deploy") || lower.includes("release")) {
    return "Deployment context loaded.\n\nRun a simulation before release because current latency volatility increases rollback risk.\n\nRecommended: canary to 5%, watch p95 latency and gateway queue depth.";
  }
  if (lower.includes("generate") || lower.includes("create")) {
    return "Generation context loaded.\n\nI created a builder task and prepared an artifact branch on the living canvas. The output uses current workspace state, memory, and selected tools.";
  }
  return "I analyzed the current workspace context.\n\nThe relevant panels are attached, the agent queue is active, and the system is ready for deeper inspection or execution.";
}

export const mockModelAdapter: ModelAdapter = {
  async *stream(input) {
    const lower = input.command.toLowerCase();
    if (lower.includes("search memory")) {
      yield { type: "tool-call", callId: createId("call"), toolName: "memory.search", args: { query: input.command } };
    }
    if (lower.includes("simulate") || lower.includes("deploy")) {
      yield { type: "tool-call", callId: createId("call"), toolName: "deployment.simulate", args: { command: input.command } };
    }
    const response = createResponse(input.command);
    const chunks = response.match(/.{1,10}/g) ?? [response];
    for (const chunk of chunks) {
      await sleep(18 + Math.random() * 22);
      yield { type: "token", token: chunk };
    }
  },
};
