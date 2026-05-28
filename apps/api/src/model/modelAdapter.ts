import { env } from "../env.js";
import type { StreamPlan } from "../types/events.js";
import type { AgentContext } from "../runtime/contextBuilder.js";
import { mockModelAdapter } from "./mockModelAdapter.js";
import { providerModelAdapter } from "./providerModelAdapter.js";

export type ModelStreamEvent = { type: "token"; token: string } | { type: "tool-call"; callId: string; toolName: string; args: unknown };

export interface ModelRunInput {
  command: string;
  context: AgentContext;
  plan: StreamPlan;
}

export interface ModelAdapter {
  stream(input: ModelRunInput): AsyncIterable<ModelStreamEvent>;
}

export const modelAdapter: ModelAdapter = env.MODEL_PROVIDER === "remote" ? providerModelAdapter : mockModelAdapter;
