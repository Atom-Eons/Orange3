import type { ModelAdapter } from "./modelAdapter.js";

export const providerModelAdapter: ModelAdapter = {
  async *stream() {
    yield {
      type: "token",
      token: "Remote model adapter is not configured yet. Set MODEL_PROVIDER=mock or implement providerModelAdapter.",
    };
  },
};
