import type { ComponentType } from "react";
import type { PanelId } from "../../types/app";
import { SystemHealthPanel } from "./SystemHealthPanel";
import { ProjectNexusPanel } from "./ProjectNexusPanel";
import { RealtimeInsightsPanel } from "./RealtimeInsightsPanel";
import { ModelPerformancePanel } from "./ModelPerformancePanel";
import { DataStreamPanel } from "./DataStreamPanel";
import { PipelineOrchestratorPanel } from "./PipelineOrchestratorPanel";
import { ActivityFeedPanel } from "./ActivityFeedPanel";
import { SmartSuggestionsPanel } from "./SmartSuggestionsPanel";
import { CausalityPanel } from "./CausalityPanel";

export const panelComponents: Record<PanelId, ComponentType> = {
  "system-health": SystemHealthPanel,
  "project-nexus": ProjectNexusPanel,
  "realtime-insights": RealtimeInsightsPanel,
  "model-performance": ModelPerformancePanel,
  "data-stream": DataStreamPanel,
  "pipeline-orchestrator": PipelineOrchestratorPanel,
  "activity-feed": ActivityFeedPanel,
  "smart-suggestions": SmartSuggestionsPanel,
  causality: CausalityPanel,
  "memory-ribbon": () => null,
};
