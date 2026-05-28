import type { SystemMetrics } from "../types/metrics";

export const initialMetrics: SystemMetrics = {
  cpu: 68,
  memory: 74,
  gpu: 61,
  network: 82,
  latencyMs: 42,
  throughputTbs: 2.4,
  eventsPerSecondM: 1.8,
  modelAccuracy: 94.2,
  precision: 93.1,
  recall: 94.8,
  f1: 93.9,
  activeStreams: 24,
  pipelineSuccess: 98.7,
};

export function jitterMetric(value: number, amount: number, min: number, max: number) {
  const next = value + (Math.random() - 0.5) * amount;
  return Math.max(min, Math.min(max, next));
}
