import type { LLMAdapter } from "../types/llm";
import { createId } from "./id";

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function makeResponse(input: string) {
  const lower = input.toLowerCase();
  if (lower.includes("latency") || lower.includes("gateway") || lower.includes("slow")) {
    return [
      "I traced the latency anomaly through the active workspace.",
      "",
      "Cause trail:",
      "High latency detected -> API Gateway saturation -> Model v2.4 deployment pressure -> resource spike -> user-facing slow responses.",
      "",
      "Recommended actions:",
      "1. Scale API gateway capacity in us-east-1a.",
      "2. Enable connection pooling on the inference route.",
      "3. Shift 18-24% of traffic to us-east-1c temporarily.",
      "4. Compare model v2.4 p95 latency against v2.3.",
      "5. Keep watcher and analyst agents active until latency normalizes.",
      "",
      "Confidence: 89%. The causal trail is highlighted.",
    ].join("\n");
  }
  if (lower.includes("generate") || lower.includes("report")) {
    return [
      "Generation context loaded.",
      "",
      "I created a deployment report branch on the living canvas using the active workspace, timeline, metrics, and selected tool context.",
    ].join("\n");
  }
  return [
    "I analyzed the current workspace context.",
    "",
    "The relevant panels are attached, a task is running, and the agent queue is active. The system is ready for deeper inspection or execution.",
  ].join("\n");
}

export const mockLLMAdapter: LLMAdapter = {
  async *run(input) {
    const lastUser = [...input.messages].reverse().find((message) => message.role === "user");
    const command = lastUser?.content ?? "";
    const lower = command.toLowerCase();

    if (lower.includes("deploy") || lower.includes("simulate")) {
      yield { type: "tool-call", callId: createId("call"), toolName: "deployment.simulate", args: { command } };
    }

    const response = makeResponse(command);
    const chunks = response.match(/.{1,9}/g) ?? [response];
    for (const chunk of chunks) {
      if (input.abortSignal?.aborted) {
        yield { type: "error", error: "Aborted" };
        return;
      }
      await sleep(24 + Math.random() * 24);
      yield { type: "token", token: chunk };
    }
    yield { type: "done" };
  },
};
