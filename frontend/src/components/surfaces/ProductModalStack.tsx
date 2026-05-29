import {
  Boxes,
  ClipboardCheck,
  Cpu,
  Download,
  GitCompare,
  Keyboard,
  Plus,
  ShieldAlert,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { ModalId, PanelId } from "../../types/app";
import { ProductModalShell } from "./SurfaceShell";

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

function AddWidgetModal() {
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const templates = ["Latency causes", "Model drift", "Pipeline stage timing", "Cost pressure", "Agent work queue"];

  return (
    <ProductModalShell modalId="add-widget" title="Add Widget" subtitle="Create a semantic panel from a metric, memory, or command" icon={<Plus size={18} />}>
      <div className="surface-card-list surface-card-list--grid">
        {templates.map((template) => (
          <button key={template} type="button" className="surface-template-card" onClick={() => { setComposerValue(`/generate widget: ${template}`); setModalOpen(undefined); }}>
            <Sparkles size={16} />
            <strong>{template}</strong>
            <span>Create a floating semantic cluster from this idea.</span>
          </button>
        ))}
      </div>
    </ProductModalShell>
  );
}

function ContextPickerModal() {
  const panels = useAppStore((s) => s.panels);
  const contextPanelIds = useAppStore((s) => s.composer.contextPanelIds);
  const setContextPanels = useAppStore((s) => s.setContextPanels);
  const focusPanel = useAppStore((s) => s.focusPanel);

  function toggle(panelId: PanelId) {
    const next = contextPanelIds.includes(panelId)
      ? contextPanelIds.filter((id) => id !== panelId)
      : [...contextPanelIds, panelId].slice(0, 6);
    setContextPanels(next);
  }

  return (
    <ProductModalShell modalId="context-picker" title="Context Picker" subtitle="Attach panels, memory, and artifacts to the next command" icon={<Boxes size={18} />}>
      <div className="surface-card-list surface-card-list--grid">
        {panels.map((panel) => (
          <button key={panel.id} type="button" className={`surface-template-card ${contextPanelIds.includes(panel.id) ? "is-active" : ""}`} onClick={() => { toggle(panel.id); focusPanel(panel.id); }}>
            <strong>{panel.title}</strong>
            <span>{panel.kind} / {panel.connectedTo.length} links</span>
          </button>
        ))}
      </div>
    </ProductModalShell>
  );
}

function ModelSelectorModal() {
  const composer = useAppStore((s) => s.composer);
  const setSelectedModel = useAppStore((s) => s.setSelectedModel);
  const setSelectedMode = useAppStore((s) => s.setSelectedMode);
  const models = ["GPT-5.5", "Local DeepSeek", "Qwen Coder", "Fast Router"];
  const modes: Array<typeof composer.selectedMode> = ["fast", "deep", "creative", "code", "agent"];

  return (
    <ProductModalShell modalId="model-selector" title="Model Selector" subtitle="Choose intelligence, latency budget, and run behavior" icon={<Cpu size={18} />}>
      <div className="surface-section-title">Models</div>
      <div className="surface-pill-grid">
        {models.map((model) => <button key={model} type="button" className={composer.selectedModel === model ? "is-active" : ""} onClick={() => setSelectedModel(model)}>{model}</button>)}
      </div>
      <div className="surface-section-title">Modes</div>
      <div className="surface-pill-grid">
        {modes.map((mode) => <button key={mode} type="button" className={composer.selectedMode === mode ? "is-active" : ""} onClick={() => setSelectedMode(mode)}>{mode}</button>)}
      </div>
    </ProductModalShell>
  );
}

function ExportModal() {
  const artifacts = useAppStore((s) => s.artifacts);
  const timeline = useAppStore((s) => s.timeline);

  return (
    <ProductModalShell modalId="export" title="Export Workspace" subtitle="Package artifacts, timeline, and current state into a portable object" icon={<Download size={18} />}>
      <div className="surface-stat-grid">
        <article><em>Artifacts</em><strong>{artifacts.length}</strong></article>
        <article><em>Timeline events</em><strong>{timeline.length}</strong></article>
        <article><em>Format</em><strong>Report bundle</strong></article>
      </div>
      <div className="surface-action-list"><button type="button"><ClipboardCheck size={15} /> Prepare export package</button></div>
    </ProductModalShell>
  );
}

function ApprovalModal() {
  const metrics = useAppStore((s) => s.metrics);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);

  return (
    <ProductModalShell modalId="approval" title="Deployment Approval" subtitle="Canary risk, rollback gate, and human checkpoint" icon={<ShieldAlert size={18} />}>
      <div className="surface-stat-grid">
        <article><em>Latency</em><strong>{Math.round(metrics.latencyMs)}ms</strong></article>
        <article><em>Pipeline</em><strong>{Math.round(metrics.pipelineSuccess)}%</strong></article>
        <article><em>Risk</em><strong>{metrics.latencyMs > 110 ? "high" : "medium"}</strong></article>
      </div>
      <div className="surface-action-list">
        <button type="button" onClick={() => { setModalOpen(undefined); setDrawerOpen("tool-approval"); }}><ShieldAlert size={15} /> Open tool approval drawer</button>
      </div>
    </ProductModalShell>
  );
}

function ShortcutsModal() {
  const shortcuts = [
    ["Cmd/Ctrl + K", "Command palette"],
    ["Cmd/Ctrl + L", "Focus composer"],
    ["Cmd/Ctrl + Enter", "Run command"],
    ["Escape", "Close overlays / collapse panels"],
  ];
  return (
    <ProductModalShell modalId="shortcuts" title="Keyboard Shortcuts" subtitle="Fast control surface for the living workspace" icon={<Keyboard size={18} />}>
      <div className="surface-card-list">
        {shortcuts.map(([key, label]) => <article key={key} className="surface-card"><i>{key}</i><strong>{label}</strong></article>)}
      </div>
    </ProductModalShell>
  );
}

function CompareModal() {
  const artifacts = useAppStore((s) => s.artifacts);
  const first = artifacts[0];
  const second = artifacts[1] ?? artifacts[0];

  return (
    <ProductModalShell modalId="compare" title="Branch Compare" subtitle="Compare generated branches and evidence quality" icon={<GitCompare size={18} />}>
      <div className="surface-compare-grid">
        {[first, second].map((artifact, index) => (
          <article key={artifact?.id ?? index}>
            <em>Branch {index + 1}</em>
            <strong>{artifact?.title ?? "No branch"}</strong>
            <span>{artifact?.content.slice(0, 300) ?? "Generate an artifact to compare branches."}</span>
          </article>
        ))}
      </div>
    </ProductModalShell>
  );
}

function StopConfirmModal() {
  const cancelActiveTasks = useAppStore((s) => s.cancelActiveTasks);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const tasks = useAppStore((s) => s.tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status)));

  return (
    <ProductModalShell modalId="stop-confirm" title="Stop Active Run?" subtitle="Cancel active agent work and preserve current workspace state" icon={<Square size={18} />}>
      <article className="surface-hero-card"><em>Active tasks</em><strong>{tasks.length}</strong><span>Stopping cancels running work while preserving timeline, artifacts, and context.</span></article>
      <div className="surface-action-list"><button type="button" onClick={() => { cancelActiveTasks(); setModalOpen(undefined); }}><X size={15} /> Stop active run</button></div>
    </ProductModalShell>
  );
}

export function ProductModalStack({ modalId }: { modalId: ModalId }) {
  if (modalId === "add-widget") return <AddWidgetModal />;
  if (modalId === "context-picker") return <ContextPickerModal />;
  if (modalId === "model-selector") return <ModelSelectorModal />;
  if (modalId === "export") return <ExportModal />;
  if (modalId === "approval") return <ApprovalModal />;
  if (modalId === "shortcuts") return <ShortcutsModal />;
  if (modalId === "compare") return <CompareModal />;
  if (modalId === "stop-confirm") return <StopConfirmModal />;
  return null;
}
