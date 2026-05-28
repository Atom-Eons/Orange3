import type { CSSProperties } from "react";
import { MiniSparkline } from "../primitives/MiniSparkline";
import { useAppStore } from "../../store/useAppStore";

function Gauge({ label, value }: { label: string; value: number }) {
  return (
    <div className="health-gauge" style={{ "--value": `${Math.max(0, Math.min(100, value)) * 3.6}deg` } as CSSProperties}>
      <span><strong>{value.toFixed(0)}%</strong></span>
      <em>{label}</em>
    </div>
  );
}

export function SystemHealthPanel() {
  const metrics = useAppStore((s) => s.metrics);
  const history = useAppStore((s) => s.metricHistory);
  const values = history.slice(-16).map((item) => item.system.cpu);
  return (
    <div className="panel-stack">
      <div className="health-gauge-grid">
        <Gauge label="CPU" value={metrics.cpu} />
        <Gauge label="Memory" value={metrics.memory} />
        <Gauge label="GPU" value={metrics.gpu} />
        <Gauge label="Network" value={metrics.network} />
      </div>
      <MiniSparkline values={values.length ? values : [40, 52, 62, 58, 68]} tone={metrics.cpu > 86 ? "red" : "cyan"} />
      <p className="panel-note">Uptime 99.98% · No critical issues</p>
    </div>
  );
}
