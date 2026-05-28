import type { PanelAnchor, PanelId } from "../types/app";
import type { ViewportProfile } from "../hooks/useViewportProfile";
import { seedPanels } from "../data/seed";

export function getAnchorForProfile(panelId: PanelId, profile: ViewportProfile): PanelAnchor {
  const base = seedPanels.find((panel) => panel.id === panelId)?.anchor ?? {
    xPct: 50,
    yPct: 50,
    depth: 0.5,
    rotateDeg: 0,
    scale: 1,
  };

  if (profile === "compact") {
    const compact: Partial<Record<PanelId, PanelAnchor>> = {
      "system-health": { xPct: 30, yPct: 28, depth: 0.7, rotateDeg: -2, scale: 0.86 },
      "project-nexus": { xPct: 64, yPct: 24, depth: 0.7, rotateDeg: 1, scale: 0.86 },
      "realtime-insights": { xPct: 70, yPct: 50, depth: 0.8, rotateDeg: 2, scale: 0.88 },
      "model-performance": { xPct: 68, yPct: 72, depth: 0.6, rotateDeg: -1, scale: 0.84 },
      "data-stream": { xPct: 30, yPct: 56, depth: 0.6, rotateDeg: 2, scale: 0.86 },
      "pipeline-orchestrator": { xPct: 32, yPct: 77, depth: 0.55, rotateDeg: -1, scale: 0.82 },
      "activity-feed": { xPct: 22, yPct: 83, depth: 0.4, rotateDeg: -2, scale: 0.78 },
      "smart-suggestions": { xPct: 76, yPct: 82, depth: 0.4, rotateDeg: 2, scale: 0.78 },
      causality: { xPct: 50, yPct: 47, depth: 0.95, rotateDeg: 0, scale: 0.9 },
    };
    return compact[panelId] ?? base;
  }

  if (profile === "wide") {
    return {
      ...base,
      xPct: base.xPct < 50 ? base.xPct - 3 : base.xPct > 50 ? base.xPct + 3 : base.xPct,
      scale: base.scale * 1.02,
    };
  }

  return base;
}
