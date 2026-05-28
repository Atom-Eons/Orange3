import type { PanelId } from "./app";

export type ArtifactKind =
  | "report"
  | "code"
  | "image"
  | "workflow"
  | "timeline"
  | "analysis"
  | "deployment-plan";

export interface Artifact {
  id: string;
  kind: ArtifactKind | string;
  title: string;
  createdAt: number;
  updatedAt: number;
  content: string;
  metadata?: Record<string, unknown>;
  relatedPanelIds: PanelId[];
}
