import { Cpu, Settings, SlidersHorizontal } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ProductDrawerShell } from "./SurfaceShell";

export function SettingsDrawer() {
  const mode = useAppStore((s) => s.mode);
  const composer = useAppStore((s) => s.composer);
  const performanceOverlayOpen = useAppStore((s) => s.performanceOverlayOpen);
  const setPerformanceOverlayOpen = useAppStore((s) => s.setPerformanceOverlayOpen);
  const layoutEditMode = useAppStore((s) => s.layoutEditMode);
  const setLayoutEditMode = useAppStore((s) => s.setLayoutEditMode);

  const rows = [
    ["System mode", mode],
    ["Selected model", composer.selectedModel],
    ["Run mode", composer.selectedMode],
    ["Tools", composer.selectedTools.join(" / ")],
  ];

  return (
    <ProductDrawerShell title="Settings" subtitle="Motion, memory, backend, and operator preferences" icon={<Settings size={18} />}>
      <div className="surface-stat-grid">
        {rows.map(([label, value]) => (
          <article key={label}>
            <em>{label}</em>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="surface-action-list">
        <button type="button" onClick={() => setLayoutEditMode(!layoutEditMode)}>
          <SlidersHorizontal size={15} />
          {layoutEditMode ? "Disable" : "Enable"} layout edit mode
        </button>
        <button type="button" onClick={() => setPerformanceOverlayOpen(!performanceOverlayOpen)}>
          <Cpu size={15} />
          {performanceOverlayOpen ? "Hide" : "Show"} performance overlay
        </button>
      </div>
    </ProductDrawerShell>
  );
}
