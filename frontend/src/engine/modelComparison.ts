export interface ModelComparisonMetric {
  label: string;
  current: number | string;
  candidate: number | string;
  delta?: number | string;
  winner?: "current" | "candidate" | "tie";
}

export interface ModelComparison {
  currentLabel: string;
  candidateLabel: string;
  metrics: ModelComparisonMetric[];
  recommendation: string;
}

export function createMockModelComparison(): ModelComparison {
  return {
    currentLabel: "Model v2.3",
    candidateLabel: "Model v2.4",
    metrics: [
      { label: "Accuracy", current: "93.8%", candidate: "94.2%", delta: "+0.4%", winner: "candidate" },
      { label: "Latency p95", current: "71ms", candidate: "118ms", delta: "+47ms", winner: "current" },
      { label: "Cost / 1k", current: "$0.042", candidate: "$0.049", delta: "+16.6%", winner: "current" },
      { label: "Stability", current: "High", candidate: "Medium", winner: "current" },
    ],
    recommendation:
      "v2.4 improves accuracy but increases latency and cost. Use v2.4 only after gateway pressure is resolved or canary it behind traffic shaping.",
  };
}
