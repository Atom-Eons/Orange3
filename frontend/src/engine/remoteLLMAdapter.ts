import type { LLMAdapter, LLMStreamEvent } from "../types/llm";
import { useAppStore } from "../store/useAppStore";
import { serializeWorkspaceForLLM } from "./workspaceSerializer";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

export const remoteLLMAdapter: LLMAdapter = {
  async *run(input) {
    const state = useAppStore.getState();
    const lastUser = [...input.messages].reverse().find((message) => message.role === "user");
    const base = API_BASE_URL || window.location.origin;
    const response = await fetch(`${base}/api/v4/see-suite/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspaceId: state.workspaceId,
        sessionId: "session-local-dev",
        command: lastUser?.content ?? "",
        messages: input.messages,
        workspace: serializeWorkspaceForLLM(state),
      }),
      signal: input.abortSignal,
    });

    if (!response.ok || !response.body) {
      yield { type: "error", error: `Remote run failed: ${response.status}` };
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
          yield { type: "error", error: "Failed to parse stream event." };
        }
      }
    }
  },
};
