import { describe, expect, it } from "vitest";
import { toolRegistry } from "../tools/toolRegistry.js";

describe("toolRegistry", () => {
  it("lists tools", () => {
    expect(toolRegistry.list().length).toBeGreaterThan(0);
  });

  it("returns error for missing tool", async () => {
    const result = await toolRegistry.invoke({
      callId: "call-test",
      toolName: "missing.tool",
      args: {},
      context: { command: "", messages: [], workspace: {}, recentArtifacts: [], recentMemory: [] },
    } as never);
    expect(result.ok).toBe(false);
  });
});
