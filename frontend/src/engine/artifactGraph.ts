import type { Artifact } from "../types/artifacts";

export interface ArtifactBranchNode {
  id: string;
  title: string;
  kind: string;
  depth: number;
  parentId?: string;
  artifact: Artifact;
}

export function buildArtifactBranches(artifacts: Artifact[]): ArtifactBranchNode[] {
  return artifacts.map((artifact, index) => ({
    id: artifact.id,
    title: artifact.title,
    kind: artifact.kind,
    depth: index,
    parentId: index > 0 ? artifacts[index - 1]?.id : undefined,
    artifact,
  }));
}

export function summarizeArtifact(artifact?: Artifact) {
  if (!artifact) return "No artifact selected.";
  const cleaned = (artifact.content ?? "").replace(/\s+/g, " ").trim();
  return cleaned.length > 220 ? `${cleaned.slice(0, 220)}...` : cleaned;
}
