import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

export function useMetricSimulation() {
  const tickMetrics = useAppStore((s) => s.tickMetrics);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);

  useEffect(() => {
    if (activeMockupStateId) return;

    const interval = window.setInterval(() => tickMetrics(), 1200);
    return () => window.clearInterval(interval);
  }, [activeMockupStateId, tickMetrics]);
}
