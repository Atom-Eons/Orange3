export interface DeploymentSimulationResult {
  risk: "low" | "medium" | "high" | string;
  recommended: boolean | string;
  estimatedLatencyChange?: string;
  suggestedRollout?: string;
  reasons?: string[];
}

export function createMockDeploymentSimulation(): DeploymentSimulationResult {
  return {
    risk: "medium",
    recommended: "canary-only",
    estimatedLatencyChange: "+8%",
    suggestedRollout: "Canary at 5%, monitor p95 latency and gateway queue depth for 10 minutes.",
    reasons: ["Current latency volatility is elevated.", "Gateway pressure is correlated with recent model deployment."],
  };
}
