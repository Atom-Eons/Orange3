import { Copy, Download, GitBranch, RefreshCcw, SplitSquareHorizontal } from "lucide-react";
import { useMemo } from "react";
import { buildArtifactBranches, summarizeArtifact } from "../../engine/artifactGraph";
import { getMockupStateSpec } from "../../engine/mockupStateBank";
import { handleSubmitCommand } from "../../engine/taskRunner";
import { useAppStore } from "../../store/useAppStore";
import type { Artifact } from "../../types/artifacts";

function previewLinesForArtifact(artifact: Artifact | undefined, stateId: string) {
  if (stateId === "61" || stateId === "63") {
    return [
      "Executive summary of current workspace state",
      stateId === "63" ? "Causal evidence and system impact" : "Causal evidence and risk posture",
      "Recommended remediation sequence",
      "Next actions and task owners",
    ];
  }

  if (stateId === "64") {
    return [
      "export async function runDeploymentCanary(workspace) {",
      "  const risk = await simulateGatewayPressure(workspace.metrics);",
      "  if (risk.p95Latency > 180) return rollbackPlan(workspace);",
      "  return promoteCanary({ percent: 5, guardrail: 'gateway-p95' });",
      "}",
      "",
      "tests: latency guard, rollback gate, memory snapshot",
    ];
  }

  if (stateId === "65") {
    return [
      "Visual asset board",
      "4 candidate states linked to deployment memory",
      "A. release command center",
      "B. causal alert composition",
      "C. memory ribbon close-up",
      "D. agent queue inspection",
    ];
  }

  if (stateId === "69") {
    return [
      "Critic review",
      "Strength: strong operational hierarchy and artifact branches.",
      "Concern: rollout risk language needs sharper rollback criteria.",
      "Edit request: add p95 latency threshold and owner handoff.",
      "Verdict: revise before export.",
    ];
  }

  return (artifact?.content ?? "Generated artifact preview")
    .split("\n")
    .filter(Boolean)
    .slice(0, 9);
}

function stateBoardRows(stateId: string) {
  if (stateId === "62") {
    return [
      { label: "Branch A", value: "original", width: 72 },
      { label: "Branch B", value: "improved", width: 86 },
      { label: "Diff", value: "12 changes", width: 78 },
      { label: "Recommendation", value: "accept branch B", width: 92 },
    ];
  }

  if (stateId === "64") {
    return [
      { label: "Component", value: "AgentQueueDrawer.tsx", width: 74 },
      { label: "Tests", value: "3 generated", width: 82 },
      { label: "Build", value: "pending", width: 58 },
      { label: "Apply patch", value: "ready", width: 94 },
    ];
  }

  if (stateId === "69") {
    return [
      { label: "Readability", value: "fix", width: 76 },
      { label: "Causality", value: "pass", width: 88 },
      { label: "Motion spec", value: "revise", width: 66 },
      { label: "Implementation", value: "pass", width: 92 },
    ];
  }

  return [];
}

function shouldUseStateBoard(stateId: string) {
  return ["62", "64", "69"].includes(stateId);
}

function canvasBranchLabels(stateId: string) {
  if (stateId === "63") {
    return ["Draft A", "Draft B", "Review", "Export"];
  }

  if (stateId === "61") {
    return ["Draft A", "Draft B", "Review", "Export"];
  }

  return undefined;
}

function reportOutlineSections() {
  return [
    { title: "Executive Summary", meta: "ready" },
    { title: "Causal Evidence", meta: "ready" },
    { title: "Remediation Plan", meta: "draft" },
    { title: "Appendix", meta: "metrics" },
  ];
}

export function ArtifactCanvas() {
  const artifacts = useAppStore((s) => s.artifacts);
  const activeArtifactId = useAppStore((s) => s.activeArtifactId);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const setActiveArtifact = useAppStore((s) => s.setActiveArtifact);
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const branches = useMemo(() => buildArtifactBranches(artifacts), [artifacts]);
  const activeArtifact = artifacts.find((artifact) => artifact.id === activeArtifactId) ?? artifacts[artifacts.length - 1];
  const stateSpec = getMockupStateSpec(activeMockupStateId);
  const stateId = stateSpec.id;
  const previewLines = previewLinesForArtifact(activeArtifact, stateId);
  const boardRows = stateBoardRows(stateId);
  const branchLabels = canvasBranchLabels(stateId);
  const canvasClass = `artifact-canvas artifact-canvas--state-${stateId} artifact-canvas--${activeArtifact?.kind ?? "empty"}`;
  const previewTitle = stateId === "61" || stateId === "63" ? "Generated Artifact Preview" : stateId === "64" ? "Code Artifact" : stateId === "65" ? "Generated Asset Preview" : activeArtifact?.title;
  const orbLabel = stateId === "61" ? "ARTIFACT" : stateId === "69" ? "CRITIC" : stateId === "64" ? "CODE" : stateId === "65" ? "ASSET" : "GENERATING";

  return (
    <section className={canvasClass}>
      <aside className="artifact-canvas__branches">
        <span className="artifact-canvas__source-label">Branches</span>
        <header><GitBranch size={16} /><strong>Branches</strong><span>{branches.length}</span></header>
        <div className="artifact-branch-list">
          {branches.length === 0 && !branchLabels ? <div className="artifact-empty">Generated artifacts appear here.</div> : null}
          {(branchLabels ?? branches.map((branch) => branch.title)).map((label, index) => {
            const branch = branches[index] ?? branches[0];

            return (
            <button key={`${label}-${branch?.id ?? index}`} type="button" className={index === 0 ? "is-active" : ""} onClick={() => branch ? setActiveArtifact(branch.id) : undefined}>
              <span>{branch?.kind ?? "branch"}</span>
              <strong>{label}</strong>
              <em>{stateId === "63" ? "report section branch" : branch ? summarizeArtifact(branch.artifact) : "Generated branch"}</em>
            </button>
            );
          })}
        </div>
      </aside>
      <main className="artifact-canvas__preview">
        <span className="artifact-canvas__source-label">Artifact Preview</span>
        {activeArtifact ? (
          <>
            <header>
              <div><span>{stateId >= "61" ? stateSpec.title : activeArtifact.kind}</span><h3>{activeArtifact.title}</h3></div>
              <div className="artifact-canvas__actions">
                <button type="button" onClick={() => navigator.clipboard?.writeText(activeArtifact.content)}><Copy size={15} />Copy</button>
                <button type="button" onClick={() => setComposerValue(`/compare artifact "${activeArtifact.title}"`)}><SplitSquareHorizontal size={15} />Compare</button>
                <button type="button" onClick={() => handleSubmitCommand(`/generate improved version of "${activeArtifact.title}"`)}><RefreshCcw size={15} />Regenerate</button>
                <button type="button"><Download size={15} />Export</button>
              </div>
            </header>
            <article className="artifact-preview">
              <section className="artifact-stage">
                <div className="artifact-stage__orb">
                  <span>{orbLabel}</span>
                </div>
                <div className="artifact-stage__document">
                  <header>
                    <strong>{previewTitle}</strong>
                    <em>{stateId === "63" ? "Report outline ready" : stateSpec.subtitle}</em>
                  </header>
                  <div className="artifact-stage__lines">
                    {shouldUseStateBoard(stateId)
                      ? boardRows.map((row) => (
                          <span key={row.label} className="artifact-stage__row" style={{ width: `${row.width}%` }}>
                            <b>{row.label}</b>
                            <em>{row.value}</em>
                          </span>
                        ))
                      : previewLines.map((line, index) => (
                          <span key={`${line}-${index}`} style={{ width: `${Math.max(38, Math.min(96, 42 + line.length * 1.3))}%` }}>
                            {line}
                          </span>
                        ))}
                  </div>
                  {stateId === "65" ? (
                    <div className="artifact-stage__asset-grid">
                      <i />
                      <i />
                      <i />
                      <i />
                    </div>
                  ) : null}
                </div>
              </section>
            </article>
            {stateId === "63" ? (
              <aside className="artifact-report-outline" aria-label="Report outline">
                <header>
                  <strong>Report Outline</strong>
                  <span>Generated document sections</span>
                </header>
                <div className="artifact-report-outline__sections">
                  {reportOutlineSections().map((section) => (
                    <div key={section.title}>
                      <i />
                      <span>
                        <strong>{section.title}</strong>
                        <em>{section.meta}</em>
                      </span>
                      <b aria-hidden="true">&#10003;</b>
                    </div>
                  ))}
                </div>
                <footer>
                  <span>kind: report</span>
                  <span>context: 4 panels</span>
                  <span>version: v2</span>
                  <span>status: ready</span>
                </footer>
              </aside>
            ) : null}
          </>
        ) : (
          <div className="artifact-canvas__empty-state">
            <div className="artifact-canvas__empty-orb" />
            <strong>No active artifact</strong>
            <p>Run /generate deployment report or use the chat dock to create a canvas artifact.</p>
            <button type="button" onClick={() => handleSubmitCommand("/generate deployment report")}>Generate sample report</button>
          </div>
        )}
      </main>
      <aside className="artifact-canvas__inspector">
        <span className="artifact-canvas__source-label">Inspector</span>
        <header><strong>{stateId === "69" ? "Critic Review" : "Inspector"}</strong><span>{stateId === "69" ? "Quality checks and revisions" : "Context + metadata"}</span></header>
        {activeArtifact ? (
          stateId === "69" ? (
            <div className="artifact-inspector-list artifact-inspector-list--critic">
              {stateBoardRows("69").map((row) => (
                <div key={row.label}>
                  <em>{row.label}</em>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
          ) : stateId === "61" ? (
            <div className="artifact-inspector-list artifact-inspector-list--source">
              <p><span>kind:</span><strong>report</strong></p>
              <p><span>context:</span><strong>4 panels</strong></p>
              <p><span>version:</span><strong>v2</strong></p>
              <p><span>status:</span><strong>ready</strong></p>
            </div>
          ) : (
            <div className="artifact-inspector-list">
              <div><em>Kind</em><strong>{activeArtifact.kind}</strong></div>
              <div><em>Updated</em><strong>{new Date(activeArtifact.updatedAt).toLocaleTimeString()}</strong></div>
              <div><em>Panels</em><div className="artifact-panel-tags">{activeArtifact.relatedPanelIds.map((panelId) => <span key={panelId}>{panelId}</span>)}</div></div>
            </div>
          )
        ) : <p>No artifact selected.</p>}
      </aside>
    </section>
  );
}
