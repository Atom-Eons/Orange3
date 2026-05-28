import { AlertTriangle, Activity, BrainCircuit, Flame } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

export function RealtimeInsightsPanel() {
  const metrics = useAppStore((s) => s.metrics);
  const triggerLatencyScenario = useAppStore((s) => s.triggerLatencyScenario);
  const rows = [
    {
      icon: AlertTriangle,
      title: "Anomaly detected",
      subtitle: "Data Stream 24",
      value: `${metrics.latencyMs.toFixed(0)}ms`,
      tone: "warning",
      path: "M0 24 C 18 18, 28 30, 46 22 S 76 12, 98 24 S 132 31, 150 18",
    },
    {
      icon: BrainCircuit,
      title: "Prediction drift",
      subtitle: "Churn model",
      value: "8m",
      tone: "info",
      path: "M0 30 C 16 20, 28 22, 42 28 S 70 36, 86 25 S 126 16, 150 22",
    },
    {
      icon: Flame,
      title: "Usage spike",
      subtitle: "Inference service",
      value: "15m",
      tone: "success",
      path: "M0 34 C 22 28, 30 18, 52 24 S 84 36, 104 22 S 132 12, 150 18",
    },
  ];
  return (
    <div className="panel-stack">
      {rows.map((row, index) => {
        const Icon = row.icon;
        return (
          <button key={row.title} type="button" className={`insight-alert insight-alert--${row.tone}`} onClick={index === 0 ? triggerLatencyScenario : undefined}>
            <span className="insight-alert__icon"><Icon size={16} /></span>
            <span>
              <strong>{row.title}</strong>
              <em>{row.subtitle}</em>
            </span>
            <svg viewBox="0 0 150 42" aria-hidden="true">
              <path d={row.path} />
            </svg>
            <b>{row.value}</b>
          </button>
        );
      })}
      <div className="insight-row"><Activity size={16} /> {metrics.eventsPerSecondM.toFixed(1)}M events/sec under active watch</div>
    </div>
  );
}
