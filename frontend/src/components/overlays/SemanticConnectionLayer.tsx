import { useMemo } from "react";
import { usePanelRects } from "../../hooks/usePanelRects";
import { useAppStore } from "../../store/useAppStore";

function center(rect?: DOMRect) {
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
}

export function SemanticConnectionLayer() {
  const focusPanelId = useAppStore((s) => s.focusPanelId);
  const panels = useAppStore((s) => s.panels);
  const rects = usePanelRects();
  const paths = useMemo(() => {
    if (!focusPanelId) return [];
    const panel = panels.find((item) => item.id === focusPanelId);
    const from = center(rects[focusPanelId]);
    if (!panel || !from) return [];
    return panel.connectedTo
      .map((id) => {
        const to = center(rects[id]);
        if (!to) return undefined;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2 - 54;
        return { id, d: `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}` };
      })
      .filter(Boolean) as Array<{ id: string; d: string }>;
  }, [focusPanelId, panels, rects]);

  return (
    <svg className="semantic-connection-layer" aria-hidden="true">
      {paths.map((path) => <path key={path.id} d={path.d} />)}
    </svg>
  );
}
