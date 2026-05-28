import { useSvgId } from "../../hooks/useSvgId";
import { useAppStore } from "../../store/useAppStore";

export function DataStreamPanel() {
  const id = useSvgId("data-stream");
  const metrics = useAppStore((s) => s.metrics);
  const paths = [
    "M0 42 C 26 8, 48 68, 82 38 S 142 7, 184 40 S 232 72, 260 24",
    "M0 30 C 30 54, 56 16, 96 30 S 156 62, 198 28 S 232 12, 260 36",
    "M0 52 C 36 38, 60 48, 96 50 S 150 22, 188 34 S 224 58, 260 44",
  ];
  return (
    <div className="panel-stack">
      <svg className="data-wave" viewBox="0 0 260 70" aria-hidden="true">
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.05" />
            <stop offset="35%" stopColor="var(--cyan)" stopOpacity="0.95" />
            <stop offset="70%" stopColor="var(--magenta)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--gold)" stopOpacity="0.72" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="260" height="70" rx="16" />
        {paths.map((path, index) => (
          <path key={path} className={`data-wave__path data-wave__path--${index}`} d={path} stroke={`url(#${id})`} />
        ))}
        {[28, 62, 108, 146, 196, 232].map((x, index) => (
          <circle key={x} cx={x} cy={index % 2 === 0 ? 30 : 46} r={index % 3 === 0 ? 2.8 : 2.2} />
        ))}
      </svg>
      <div className="stat-grid stat-grid--three">
        <div><span>Active Streams</span><strong>{metrics.activeStreams}</strong></div>
        <div><span>Throughput</span><strong>{metrics.throughputTbs.toFixed(1)}Tb/s</strong></div>
        <div><span>Events / sec</span><strong>{metrics.eventsPerSecondM.toFixed(1)}M</strong></div>
      </div>
    </div>
  );
}
