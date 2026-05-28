import { useEffect, useState } from "react";

export interface PerformanceSnapshot {
  fps: number;
  frameMs: number;
  memoryMb?: number;
}

export function usePerformanceMonitor(enabled: boolean) {
  const [snapshot, setSnapshot] = useState<PerformanceSnapshot>({ fps: 0, frameMs: 0 });

  useEffect(() => {
    if (!enabled) return;
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      frames += 1;
      if (now - last >= 1000) {
        const frameMs = (now - last) / Math.max(1, frames);
        const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        setSnapshot({ fps: Math.round((frames * 1000) / (now - last)), frameMs: Number(frameMs.toFixed(2)), memoryMb: memory ? Math.round(memory.usedJSHeapSize / 1024 / 1024) : undefined });
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return snapshot;
}
