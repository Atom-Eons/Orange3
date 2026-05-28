import { usePerformanceMonitor } from "../../hooks/usePerformanceMonitor";
import { useAppStore } from "../../store/useAppStore";

export function PerformanceOverlay() {
  const open = useAppStore((s) => s.performanceOverlayOpen);
  const snapshot = usePerformanceMonitor(open);
  if (!open) return null;
  return (
    <aside className="performance-overlay glass">
      <strong>Performance</strong>
      <span>FPS: {snapshot.fps}</span>
      <span>Frame: {snapshot.frameMs}ms</span>
      {snapshot.memoryMb ? <span>Memory: {snapshot.memoryMb}MB</span> : null}
    </aside>
  );
}
