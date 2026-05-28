import { useEffect, useState } from "react";
import type { PanelId } from "../types/app";
import { useAppStore } from "../store/useAppStore";

export function usePanelRects() {
  const panels = useAppStore((s) => s.panels);
  const [rects, setRects] = useState<Partial<Record<PanelId, DOMRect>>>({});

  useEffect(() => {
    const collect = () => {
      const next: Partial<Record<PanelId, DOMRect>> = {};
      panels.forEach((panel) => {
        const el = document.querySelector<HTMLElement>(`[data-panel-id="${panel.id}"]`);
        if (el) next[panel.id] = el.getBoundingClientRect();
      });
      setRects(next);
    };
    collect();
    const interval = window.setInterval(collect, 350);
    window.addEventListener("resize", collect);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("resize", collect);
    };
  }, [panels]);

  return rects;
}
