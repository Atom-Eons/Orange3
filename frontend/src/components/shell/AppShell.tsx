import { useAppStore } from "../../store/useAppStore";
import { useTaskSimulation } from "../../hooks/useTaskSimulation";
import { useMetricSimulation } from "../../hooks/useMetricSimulation";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { usePersistentStore } from "../../hooks/usePersistentStore";
import { useWorkspaceBootstrap } from "../../hooks/useWorkspaceBootstrap";
import { useStartupStateCleanup } from "../../hooks/useStartupStateCleanup";
import { usePresetFromUrl } from "../../dev/usePresetFromUrl";
import { StatePresetSwitcher } from "../../dev/StatePresetSwitcher";
import { LivingScene } from "../scene/LivingScene";
import { LeftRail } from "./LeftRail";
import { TopModeRail } from "./TopModeRail";
import { FloatingPanel } from "../panels/FloatingPanel";
import { SemanticConnectionLayer } from "../overlays/SemanticConnectionLayer";
import { CausalityLayer } from "../overlays/CausalityLayer";
import { FocusHalo } from "../overlays/FocusHalo";
import { FlowFieldOverlay } from "../overlays/FlowFieldOverlay";
import { StateChoreographyOverlay } from "../overlays/StateChoreographyOverlay";
import { StateWorkbenchOverlay } from "../overlays/StateWorkbenchOverlay";
import { AgentConstellation } from "../overlays/AgentConstellation";
import { TemporalMemoryRibbon } from "../overlays/TemporalMemoryRibbon";
import { TemporalMemoryExpandedOverlay } from "../overlays/TemporalMemoryExpandedOverlay";
import { LivingCanvas } from "../overlays/LivingCanvas";
import { AmbientAssistantBubble } from "../overlays/AmbientAssistantBubble";
import { ChatDock } from "../chat/ChatDock";
import { AgentQueueDrawer } from "../drawers/AgentQueueDrawer";
import { MemoryBrowserDrawer } from "../drawers/MemoryBrowserDrawer";
import { ToolApprovalDrawer } from "../drawers/ToolApprovalDrawer";
import { CommandPalette } from "../command/CommandPalette";
import { EventToastLayer } from "../feedback/EventToastLayer";
import { RunStatusOverlay } from "../feedback/RunStatusOverlay";
import { PerformanceOverlay } from "../qa/PerformanceOverlay";
import { ErrorBoundary } from "../primitives/ErrorBoundary";

export function AppShell() {
  useTaskSimulation();
  useMetricSimulation();
  useKeyboardShortcuts();
  usePersistentStore();
  useWorkspaceBootstrap();
  useStartupStateCleanup();
  usePresetFromUrl();

  const mode = useAppStore((s) => s.mode);
  const panels = useAppStore((s) => s.panels);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const shellClass = `app-shell app-shell--${mode}${activeMockupStateId ? ` app-shell--state-${activeMockupStateId}` : ""}`;

  return (
    <main className={shellClass}>
      <ErrorBoundary fallback={<div className="scene-fallback">Scene unavailable</div>}>
        <LivingScene />
      </ErrorBoundary>
      <FlowFieldOverlay />
      <SemanticConnectionLayer />
      <CausalityLayer />
      <FocusHalo />
      <StateChoreographyOverlay />
      <AgentConstellation />
      <LeftRail />
      <TopModeRail />
      <RunStatusOverlay />
      <section className={`floating-panel-layer ${workspaceView !== "dashboard" ? "floating-panel-layer--recessed" : ""}`} aria-label="Living system panels">
        {panels
          .filter((panel) => panel.visible && panel.id !== "memory-ribbon")
          .map((panel) => (
            <FloatingPanel key={panel.id} panel={panel} />
          ))}
      </section>
      <TemporalMemoryRibbon />
      <TemporalMemoryExpandedOverlay />
      <LivingCanvas />
      <AmbientAssistantBubble />
      <ChatDock />
      <AgentQueueDrawer />
      <MemoryBrowserDrawer />
      <ToolApprovalDrawer />
      <StateWorkbenchOverlay />
      <CommandPalette />
      <EventToastLayer />
      <PerformanceOverlay />
      <StatePresetSwitcher />
    </main>
  );
}
