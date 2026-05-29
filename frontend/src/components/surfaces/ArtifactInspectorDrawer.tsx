import { Download, FileText, Layers } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { PanelId } from "../../types/app";
import { ProductDrawerShell } from "./SurfaceShell";

function panelLabel(id: PanelId) {
  const labels: Record<PanelId, string> = {
    "system-health": "System Health",
    "project-nexus": "Project Nexus",
    "realtime-insights": "Real-Time Insights",
    "model-performance": "Model Performance",
    "data-stream": "Data Stream",
    "pipeline-orchestrator": "Pipeline",
    "activity-feed": "Activity",
    "smart-suggestions": "Suggestions",
    causality: "Causality",
    "memory-ribbon": "Temporal Memory",
  };
  return labels[id] ?? id;
}

export function ArtifactInspectorDrawer() {
  const artifacts = useAppStore((s) => s.artifacts);
  const activeArtifactId = useAppStore((s) => s.activeArtifactId);
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  const setActiveArtifact = useAppStore((s) => s.setActiveArtifact);
  const artifact = artifacts.find((item) => item.id === activeArtifactId) ?? artifacts[artifacts.length - 1];

  return (
    <ProductDrawerShell title="Artifact Inspector" subtitle="Generated work, source context, branches, and export readiness" icon={<FileText size={18} />}>
      {artifact ? (
        <>
          <article className="surface-hero-card">
            <em>{artifact.kind}</em>
            <strong>{artifact.title}</strong>
            <span>{artifact.content.slice(0, 360)}</span>
          </article>
          <div className="surface-chip-row">
            {artifact.relatedPanelIds.map((panelId) => (
              <button key={panelId} type="button">{panelLabel(panelId)}</button>
            ))}
          </div>
          <div className="surface-action-list">
            <button type="button" onClick={() => { setActiveArtifact(artifact.id); setWorkspaceView("canvas"); }}>
              <Layers size={15} /> Open on canvas
            </button>
            <button type="button"><Download size={15} /> Prepare export</button>
          </div>
        </>
      ) : (
        <div className="surface-empty">No artifact yet. Run a generate command to create a canvas object.</div>
      )}
    </ProductDrawerShell>
  );
}
