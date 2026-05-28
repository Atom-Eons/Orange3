import { useMemo } from "react";
import { usePanelRects } from "../../hooks/usePanelRects";
import { useAppStore } from "../../store/useAppStore";

function center(rect?: DOMRect) {
  return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : undefined;
}

export function CausalityLayer() {
  const path = useAppStore((s) => s.activeCausalPath);
  const rects = usePanelRects();
  const edges = useMemo(() => {
    if (!path) return [];
    return path.edges
      .map((edge) => {
        const fromNode = path.nodes.find((node) => node.id === edge.from);
        const toNode = path.nodes.find((node) => node.id === edge.to);
        const from = center(fromNode?.panelId ? rects[fromNode.panelId] : undefined);
        const to = center(toNode?.panelId ? rects[toNode.panelId] : undefined);
        if (!from || !to) return undefined;
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2 + 40;
        return { id: `${edge.from}-${edge.to}`, d: `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`, weight: edge.weight };
      })
      .filter(Boolean) as Array<{ id: string; d: string; weight: number }>;
  }, [path, rects]);

  return (
    <svg className="causality-layer" aria-hidden="true">
      {edges.map((edge) => <path key={edge.id} d={edge.d} style={{ opacity: 0.35 + edge.weight * 0.5 }} />)}
    </svg>
  );
}
