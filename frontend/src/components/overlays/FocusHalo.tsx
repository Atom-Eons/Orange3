import { usePanelRects } from "../../hooks/usePanelRects";
import { useAppStore } from "../../store/useAppStore";

export function FocusHalo() {
  const focusPanelId = useAppStore((s) => s.focusPanelId);
  const rects = usePanelRects();
  const rect = focusPanelId ? rects[focusPanelId] : undefined;
  if (!rect) return null;
  return <div className="focus-halo" style={{ left: rect.left - 10, top: rect.top - 10, width: rect.width + 20, height: rect.height + 20 }} />;
}
