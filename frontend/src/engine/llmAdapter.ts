import type { LLMAdapter } from "../types/llm";
import { mockLLMAdapter } from "./mockLLMAdapter";
import { remoteLLMAdapter } from "./remoteLLMAdapter";

export const llmAdapter: LLMAdapter =
  import.meta.env.VITE_AGENT_BACKEND === "remote" ? remoteLLMAdapter : mockLLMAdapter;
