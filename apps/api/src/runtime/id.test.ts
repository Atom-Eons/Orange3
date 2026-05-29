import { describe, expect, it } from "vitest";
import { createId } from "./id.js";

describe("createId", () => {
  it("creates a prefixed unique-looking id", () => {
    const id = createId("task");
    expect(id.startsWith("task-")).toBe(true);
    expect(id.length).toBeGreaterThan("task-".length + 10);
  });

  it("keeps different prefixes visible", () => {
    expect(createId("memory").startsWith("memory-")).toBe(true);
    expect(createId("artifact").startsWith("artifact-")).toBe(true);
  });
});
