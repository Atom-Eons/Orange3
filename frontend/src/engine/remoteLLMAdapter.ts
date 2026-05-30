import type { LLMAdapter, LLMStreamEvent } from "../types/llm";
import { useAppStore } from "../store/useAppStore";
import { serializeWorkspaceForLLM } from "./workspaceSerializer";
import { mockLLMAdapter } from "./mockLLMAdapter";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const ORANGEBOX_RUN_PATH = "/api/v4/see-suite/agent/run";

async function* fallbackToAelidVisualMode(input: Parameters<LLMAdapter["run"]>[0], reason: string): AsyncIterable<LLMStreamEvent> {
  yield {
    type: "state",
    mode: "reviewing",
    energy: 0.62,
    contextPanelIds: ["project-nexus", "system-health", "memory-ribbon"],
  };

  yield {
    type: "token",
    token: `OrangeBOX is not connected (${reason}). AELID is running in visual/local mode. `,
  };

  for await (const event of mockLLMAdapter.run(input)) {
    yield event;
  }
}

export const remoteLLMAdapter: LLMAdapter = {
  async *run(input) {
    const state = useAppStore.getState();
    const lastUser = [...input.messages].reverse().find((message) => message.role === "user");
    const base = API_BASE_URL || window.location.origin;

    let response: Response;

    try {
      response = await fetch(`${base}${ORANGEBOX_RUN_PATH}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          module: "AELID",
          moduleName: "AtomEons Living Intelligence Dashboard",
          workspaceId: state.workspaceId,
          sessionId: "session-local-dev",
          command: lastUser?.content ?? "",
          messages: input.messages,
          workspace: serializeWorkspaceForLLM(state),
        }),
        signal: input.abortSignal,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "fetch failed";
      yield* fallbackToAelidVisualMode(input, reason);
      return;
    }

    if (!response.ok || !response.body) {
      yield* fallbackToAelidVisualMode(input, `HTTP ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (part.startsWith(":")) continue;
        const line = part.split("\n").find((entry) => entry.startsWith("data:"));
        if (!line) continue;
        try {
          yield JSON.parse(line.replace(/^data:\s*/, "")) as LLMStreamEvent;
        } catch {
          yield { type: "error", error: "Failed to parse OrangeBOX stream event." };
        }
      }
    }
  },
};
