export interface SystemMetrics {
  cpu: number;
  memory: number;
  gpu: number;
  network: number;
  latencyMs: number;
  throughputTbs: number;
  eventsPerSecondM: number;
  modelAccuracy: number;
  precision: number;
  recall: number;
  f1: number;
  activeStreams: number;
  pipelineSuccess: number;
}

export interface MetricSnapshot {
  timestamp: number;
  system: SystemMetrics;
}
