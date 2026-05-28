import { describe, expect, it } from "vitest";
import { maybeBuildCausalPath } from "../runtime/causalityRuntime.js";

describe("maybeBuildCausalPath", () => {
  it("returns path for latency command", () => {
    const path = maybeBuildCausalPath("latency is high", {} as never);
    expect(path).toBeDefined();
    expect(path?.nodes.length).toBeGreaterThan(2);
  });

  it("does not return path for unrelated command", () => {
    const path = maybeBuildCausalPath("generate a report", {} as never);
    expect(path).toBeUndefined();
  });
});
