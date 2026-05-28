import type { CSSProperties } from "react";
import { MiniSparkline } from "../primitives/MiniSparkline";
import { useAppStore } from "../../store/useAppStore";

export function ModelPerformancePanel() {
  const metrics = useAppStore((s) => s.metrics);
  const history = useAppStore((s) => s.metricHistory);
  return (
    <div className="panel-stack">
      <div className="model-score-row">
        <div className="model-score-dial" style={{ "--value": `${metrics.modelAccuracy * 3.6}deg` } as CSSProperties}>
          <span>{metrics.modelAccuracy.toFixed(1)}%</span>
          <em>Accuracy</em>
        </div>
        <div className="model-score-metrics">
          <span><i /> Precision <strong>{metrics.precision.toFixed(1)}%</strong></span>
          <span><i /> Recall <strong>{metrics.recall.toFixed(1)}%</strong></span>
          <span><i /> F1 Score <strong>{metrics.f1.toFixed(1)}%</strong></span>
          <span><i /> Latency <strong>{metrics.latencyMs.toFixed(0)}ms</strong></span>
        </div>
      </div>
      <MiniSparkline values={history.slice(-18).map((item) => item.system.modelAccuracy)} tone="green" />
    </div>
  );
}
