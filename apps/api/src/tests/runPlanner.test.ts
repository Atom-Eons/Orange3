import { describe, expect, it } from "vitest";
import { buildRunPlan } from "../runtime/runPlanner.js";

describe("buildRunPlan", () => {
  it("routes latency command to alert mode and relevant panels", () => {
    const plan = buildRunPlan("Why is latency high in us-east-1?", {} as never);
    expect(plan.mode).toBe("alert");
    expect(plan.relatedPanelIds).toContain("realtime-insights");
    expect(plan.relatedPanelIds).toContain("causality");
  });

  it("routes generate command to generating mode", () => {
    const plan = buildRunPlan("/generate deployment report", {} as never);
    expect(plan.mode).toBe("generating");
    expect(plan.plan.risk).toBe("medium");
  });
});
