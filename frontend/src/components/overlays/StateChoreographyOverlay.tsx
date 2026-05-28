import { useMemo, type CSSProperties } from "react";
import { getMockupStateSpec, type MockupTheme } from "../../engine/mockupStateBank";
import { useAppStore } from "../../store/useAppStore";
import type { SystemMode } from "../../types/app";

interface StateSpec {
  id: string;
  title: string;
  subtitle: string;
  theme: "cyan" | "violet" | "magenta" | "red" | "green" | "gold" | "blue";
  core: string;
  coreSub: string;
  focus: string[];
  file?: string;
}

interface FocusFrame {
  id: string;
  label: string;
  detail: string;
}

interface InspectionPayload {
  eyebrow: string;
  title: string;
  summary: string;
  rows: Array<{ label: string; value: string; tone?: "cyan" | "violet" | "green" | "gold" | "red" }>;
  metrics: Array<{ label: string; value: string }>;
}

interface ScenarioCallout {
  label: string;
  x: number;
  y: number;
  tone?: "cyan" | "violet" | "green" | "gold" | "red" | "magenta";
  align?: "left" | "center" | "right";
}

interface ScenarioPayload {
  eyebrow: string;
  title: string;
  action: string;
  steps: string[];
  callouts: ScenarioCallout[];
}

const modeSpecs: Record<SystemMode, StateSpec> = {
  calm: {
    id: "01",
    title: "Calm Overview",
    subtitle: "Default live operating state - stable, readable, breathing",
    theme: "cyan",
    core: "CALM",
    coreSub: "OVERVIEW",
    focus: ["core", "timeline"],
  },
  listening: {
    id: "02",
    title: "Listening / Composer Active",
    subtitle: "Chat IDE bar becomes the command surface",
    theme: "cyan",
    core: "VOICE",
    coreSub: "INPUT ACTIVE",
    focus: ["chat", "core"],
  },
  thinking: {
    id: "03",
    title: "Thinking / Deep Analysis",
    subtitle: "Context panels lock while the core reasons inward",
    theme: "violet",
    core: "THINKING",
    coreSub: "DEEP MODE",
    focus: ["chat", "core", "causality"],
  },
  analyzing: {
    id: "04",
    title: "Analyzing / Causality Scan",
    subtitle: "System resolves live dependencies and evidence paths",
    theme: "blue",
    core: "ANALYSIS",
    coreSub: "SCAN",
    focus: ["causality", "model", "stream", "system"],
  },
  generating: {
    id: "05",
    title: "Generating / Artifact Build",
    subtitle: "Builder agent creates branchable workspace output",
    theme: "magenta",
    core: "ARTIFACT",
    coreSub: "BUILDING",
    focus: ["chat", "suggestions", "core"],
  },
  alert: {
    id: "06",
    title: "Alert / Critical Latency",
    subtitle: "Urgent causal path with impacted panels and response plan",
    theme: "red",
    core: "ALERT",
    coreSub: "CRITICAL",
    focus: ["causality", "activity", "stream", "system"],
  },
  deploying: {
    id: "07",
    title: "Deploying / Release Flow",
    subtitle: "Pipeline and rollout gates become primary",
    theme: "green",
    core: "DEPLOY",
    coreSub: "CANARY",
    focus: ["pipeline", "activity", "model", "timeline"],
  },
  reviewing: {
    id: "08",
    title: "Reviewing / Comparison Mode",
    subtitle: "Motion slows while evidence and comparisons sharpen",
    theme: "gold",
    core: "REVIEW",
    coreSub: "EVIDENCE",
    focus: ["model", "causality", "timeline"],
  },
};

const themeColor: Record<MockupTheme, StateSpec["theme"]> = {
  calm: "cyan",
  listening: "cyan",
  thinking: "violet",
  analyzing: "blue",
  generating: "magenta",
  alert: "red",
  deploying: "green",
  reviewing: "gold",
  lowlight: "violet",
  highcontrast: "cyan",
  offline: "gold",
  red: "red",
  magenta: "magenta",
  gold: "gold",
  green: "green",
};

function specFromMockupState(id: string): StateSpec {
  const mockup = getMockupStateSpec(id);
  const parts = mockup.title.split("/");
  return {
    id: mockup.id,
    title: mockup.title,
    subtitle: mockup.subtitle,
    theme: themeColor[mockup.theme],
    core: (parts[0] ?? mockup.title).trim().split(" ")[0]?.toUpperCase() ?? "STATE",
    coreSub: (parts[1] ?? mockup.focus[0] ?? "ACTIVE").trim().toUpperCase(),
    focus: mockup.focus,
    file: mockup.file,
  };
}

const focusLabels: Record<string, { label: string; detail: string }> = {
  activity: { label: "ACTIVITY", detail: "event stream" },
  agents: { label: "AGENTS", detail: "swarm active" },
  canvas: { label: "CANVAS", detail: "artifact surface" },
  causality: { label: "CAUSALITY", detail: "cause trail primary" },
  chat: { label: "CHAT", detail: "command surface" },
  core: { label: "CORE", detail: "state brain" },
  global: { label: "GLOBAL", detail: "workspace action" },
  insights: { label: "INSIGHTS", detail: "anomaly target" },
  model: { label: "MODEL", detail: "comparison focus" },
  pipeline: { label: "PIPELINE", detail: "execution flow" },
  project: { label: "PROJECT", detail: "dependency map" },
  stream: { label: "STREAM", detail: "live telemetry" },
  suggestions: { label: "SUGGESTIONS", detail: "next action" },
  system: { label: "SYSTEM HEALTH", detail: "resource pressure" },
  timeline: { label: "TIMELINE", detail: "memory ribbon" },
};

function focusFramesForSpec(spec: StateSpec): FocusFrame[] {
  return spec.focus.slice(0, 5).map((focus) => ({
    id: focus,
    label: focusLabels[focus]?.label ?? focus.toUpperCase(),
    detail: focusLabels[focus]?.detail ?? "state focus",
  }));
}

const composerStateIds = new Set(["02", "25", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "70", "72"]);
const planStateIds = new Set(["03", "27", "28", "29", "30", "54"]);
const alertStateIds = new Set(["06", "49", "51", "53", "55", "58", "59"]);
const pipelineStateIds = new Set(["07", "18", "52"]);
const scenarioStateIds = new Set(["49", "50", "51", "52", "53", "54", "55", "56", "57", "58", "59", "60", "70", "72"]);

const inspectionPayloads: Record<string, InspectionPayload> = {
  "13": {
    eyebrow: "Resource Pressure Map",
    title: "System Health Inspection",
    summary: "CPU, memory, GPU and network pressure resolved into a live capacity map.",
    rows: [
      { label: "CPU pressure", value: "stable 71%", tone: "cyan" },
      { label: "GPU thermal band", value: "watch 62%", tone: "violet" },
      { label: "Network edge", value: "elevated 88%", tone: "gold" },
    ],
    metrics: [
      { label: "Uptime", value: "99.98%" },
      { label: "Critical", value: "0" },
      { label: "Watchers", value: "3" },
    ],
  },
  "14": {
    eyebrow: "Dependency Topology",
    title: "Project Nexus Inspection",
    summary: "Service graph, node health and dependency routes locked to the core.",
    rows: [
      { label: "Services", value: "42 online", tone: "cyan" },
      { label: "Nodes", value: "128 mapped", tone: "green" },
      { label: "Connections", value: "312 traced", tone: "violet" },
    ],
    metrics: [
      { label: "Health", value: "98.7%" },
      { label: "Edges", value: "312" },
      { label: "Depth", value: "4" },
    ],
  },
  "15": {
    eyebrow: "Anomaly Stack",
    title: "Real-Time Insights Inspection",
    summary: "Predictions, drift and usage spikes ranked by causal urgency.",
    rows: [
      { label: "Data Stream 24", value: "anomaly", tone: "red" },
      { label: "Churn Model", value: "prediction drift", tone: "violet" },
      { label: "Inference Service", value: "usage spike", tone: "gold" },
    ],
    metrics: [
      { label: "Signals", value: "18" },
      { label: "Live", value: "yes" },
      { label: "Risk", value: "high" },
    ],
  },
  "16": {
    eyebrow: "Model Evidence",
    title: "Model Performance Deep Dive",
    summary: "Accuracy, precision, recall and latency comparison flatten into review mode.",
    rows: [
      { label: "Accuracy", value: "94.2%", tone: "cyan" },
      { label: "Recall", value: "94.8%", tone: "green" },
      { label: "Latency", value: "42ms", tone: "gold" },
    ],
    metrics: [
      { label: "F1", value: "93.9%" },
      { label: "Drift", value: "low" },
      { label: "Version", value: "v2.4" },
    ],
  },
  "17": {
    eyebrow: "Stream Telemetry",
    title: "Live Data Stream Inspection",
    summary: "Throughput wave, active streams and gateway pressure shown as one flow.",
    rows: [
      { label: "Throughput", value: "2.4 TB/s", tone: "cyan" },
      { label: "Events/sec", value: "1.8M", tone: "violet" },
      { label: "Active streams", value: "24", tone: "green" },
    ],
    metrics: [
      { label: "P95", value: "42ms" },
      { label: "Drop", value: "0.01%" },
      { label: "Region", value: "us-e1" },
    ],
  },
  "18": {
    eyebrow: "Execution Flow",
    title: "Pipeline Drill-Down",
    summary: "Ingest, process, validate and deploy stages are inspected with live logs.",
    rows: [
      { label: "Ingest", value: "running", tone: "green" },
      { label: "Process", value: "running", tone: "cyan" },
      { label: "Deploy", value: "queued", tone: "gold" },
    ],
    metrics: [
      { label: "Success", value: "98.7%" },
      { label: "Avg", value: "42ms" },
      { label: "Last", value: "2m" },
    ],
  },
  "19": {
    eyebrow: "Event Ledger",
    title: "Activity Feed Inspection",
    summary: "Recent deployment, dataset and alert events become timeline evidence.",
    rows: [
      { label: "Model v2.4", value: "deployed", tone: "cyan" },
      { label: "Dataset", value: "updated", tone: "green" },
      { label: "Latency", value: "alert", tone: "gold" },
    ],
    metrics: [
      { label: "Events", value: "22" },
      { label: "Alerts", value: "3" },
      { label: "Span", value: "3h" },
    ],
  },
  "20": {
    eyebrow: "Recommendation Engine",
    title: "Smart Suggestions Inspection",
    summary: "Impact, confidence and agent ownership rank the next actions.",
    rows: [
      { label: "Optimize inference", value: "32% gain", tone: "cyan" },
      { label: "Retrain churn", value: "high impact", tone: "violet" },
      { label: "Shift traffic", value: "ready", tone: "green" },
    ],
    metrics: [
      { label: "Ready", value: "3" },
      { label: "Owner", value: "agent" },
      { label: "Impact", value: "high" },
    ],
  },
  "21": {
    eyebrow: "Causal Evidence",
    title: "Causal Insights Full Analysis",
    summary: "High latency trail, gateway saturation and impact chain are primary.",
    rows: [
      { label: "High latency", value: "detected", tone: "red" },
      { label: "API gateway", value: "saturated", tone: "gold" },
      { label: "User impact", value: "slow response", tone: "red" },
    ],
    metrics: [
      { label: "Conf", value: "89%" },
      { label: "Nodes", value: "5" },
      { label: "Path", value: "active" },
    ],
  },
  "22": {
    eyebrow: "Temporal Memory",
    title: "Memory Ribbon Inspection",
    summary: "Timeline scrub, snapshots and event replay connect to recall.",
    rows: [
      { label: "Data ingested", value: "09:16", tone: "green" },
      { label: "Canary deployed", value: "09:42", tone: "cyan" },
      { label: "Alert triggered", value: "10:11", tone: "gold" },
    ],
    metrics: [
      { label: "Events", value: "8" },
      { label: "Saved", value: "3" },
      { label: "Recall", value: "on" },
    ],
  },
  "23": {
    eyebrow: "Agent Network",
    title: "Agent Communication Flow",
    summary: "Ambient agents, capabilities and tasks route through the central core.",
    rows: [
      { label: "Builder", value: "generating", tone: "violet" },
      { label: "Watcher", value: "monitoring", tone: "cyan" },
      { label: "Deploy", value: "preparing", tone: "green" },
    ],
    metrics: [
      { label: "Online", value: "5" },
      { label: "Tasks", value: "4" },
      { label: "Queue", value: "2" },
    ],
  },
  "24": {
    eyebrow: "Resource Allocation",
    title: "Capacity + Cost Inspection",
    summary: "Pressure, cost and allocation controls are ranked for remediation.",
    rows: [
      { label: "Network", value: "critical", tone: "red" },
      { label: "GPU", value: "elevated", tone: "gold" },
      { label: "Optimize", value: "available", tone: "green" },
    ],
    metrics: [
      { label: "Cost", value: "+18%" },
      { label: "P95", value: "230ms" },
      { label: "Action", value: "scale" },
    ],
  },
};

const scenarioPayloads: Record<string, ScenarioPayload> = {
  "49": {
    eyebrow: "Live Incident Chain",
    title: "Latency diagnosis from signal to remediation",
    action: "Scale gateway pool and shift 22% traffic to us-east-1c.",
    steps: ["Anomaly detected", "Gateway saturated", "Model pressure", "User impact"],
    callouts: [
      { label: "INSIGHTS", x: 14, y: 51, tone: "red" },
      { label: "STREAM", x: 84, y: 4, tone: "red", align: "center" },
      { label: "CAUSALITY", x: 31, y: 52, tone: "red" },
      { label: "ROOT CAUSE: GATEWAY", x: 66, y: 51, tone: "gold" },
      { label: "ACTION: SCALE SERVICE", x: 84, y: 72, tone: "red" },
    ],
  },
  "50": {
    eyebrow: "Dataset Shift",
    title: "Model confidence drops as churn data diverges",
    action: "Retrain churn model with latest segmented sample.",
    steps: ["Drift detected", "Confidence down", "Feature skew", "Retrain queued"],
    callouts: [
      { label: "DRIFT DETECTED", x: 22, y: 45, tone: "magenta" },
      { label: "ACCURACY -2.1%", x: 70, y: 18, tone: "magenta" },
      { label: "MODEL CONFIDENCE", x: 63, y: 32, tone: "violet" },
      { label: "RETRAIN MODEL", x: 84, y: 68, tone: "magenta" },
    ],
  },
  "51": {
    eyebrow: "Recovery Flow",
    title: "Validation failed; rollback and rerun controls armed",
    action: "Rerun validate stage from clean checkpoint.",
    steps: ["Validation failed", "Deploy held", "Rollback ready", "Rerun from stage"],
    callouts: [
      { label: "VALIDATION FAILED", x: 66, y: 28, tone: "red" },
      { label: "RERUN FROM STAGE", x: 77, y: 36, tone: "gold" },
      { label: "PIPELINE", x: 68, y: 48, tone: "red" },
      { label: "ACTIVITY", x: 87, y: 49, tone: "red" },
    ],
  },
  "52": {
    eyebrow: "Canary Simulation",
    title: "Rollout risk is simulated before deployment",
    action: "Hold canary at 5% until gateway p95 stays under 80ms.",
    steps: ["5% canary", "Risk meter", "Gate checks", "Rollback ready"],
    callouts: [
      { label: "CANARY 5%", x: 56, y: 30, tone: "green" },
      { label: "RISK 58%", x: 68, y: 37, tone: "gold" },
      { label: "GATES READY", x: 74, y: 48, tone: "green" },
      { label: "ROLLBACK ARMED", x: 83, y: 64, tone: "green" },
    ],
  },
  "53": {
    eyebrow: "Regression",
    title: "Model v2.4 improves accuracy but harms latency",
    action: "Compare v2.3 and v2.4 before promotion.",
    steps: ["Accuracy drop", "Latency increase", "Cause traced", "Compare models"],
    callouts: [
      { label: "ACCURACY DROP", x: 70, y: 18, tone: "red" },
      { label: "COMPARE V2.3 ⇄ V2.4", x: 30, y: 73, tone: "gold" },
      { label: "LATENCY +47ms", x: 82, y: 34, tone: "red" },
      { label: "CAUSALITY", x: 30, y: 61, tone: "red" },
    ],
  },
  "54": {
    eyebrow: "Dataset Sync",
    title: "Ingestion queue and source sync are actively reasoning",
    action: "Keep watcher active until queue depth normalizes.",
    steps: ["12 sources", "Queue depth 128", "Pipeline warm", "Sync complete"],
    callouts: [
      { label: "SYNCING 12 SOURCES", x: 80, y: 23, tone: "cyan" },
      { label: "QUEUE DEPTH 128", x: 74, y: 43, tone: "violet" },
      { label: "THINKING", x: 50, y: 43, tone: "cyan", align: "center" },
      { label: "DATASET SYNC", x: 30, y: 75, tone: "cyan" },
    ],
  },
  "55": {
    eyebrow: "Security Signal",
    title: "Suspicious access pattern locks watcher and activity feed",
    action: "Escalate security audit and freeze deploy actions.",
    steps: ["Watcher locked", "Access spike", "Agent escalation", "Deploy freeze"],
    callouts: [
      { label: "WATCHER LOCKED", x: 58, y: 28, tone: "red" },
      { label: "SECURITY SIGNAL", x: 82, y: 57, tone: "red" },
      { label: "AGENT ESCALATION", x: 45, y: 63, tone: "gold" },
      { label: "ACTIVITY", x: 86, y: 36, tone: "red" },
    ],
  },
  "56": {
    eyebrow: "Cost Pressure",
    title: "Inference resource spike becomes optimization work",
    action: "Apply inference optimization and cap burst routing.",
    steps: ["Cost +18%", "GPU pressure", "Optimize inference", "Savings queued"],
    callouts: [
      { label: "COST +18%", x: 32, y: 20, tone: "gold" },
      { label: "OPTIMIZE INFERENCE", x: 83, y: 66, tone: "gold" },
      { label: "SUGGESTIONS", x: 82, y: 54, tone: "gold" },
      { label: "RESOURCE COST", x: 22, y: 49, tone: "gold" },
    ],
  },
  "57": {
    eyebrow: "Throughput Surge",
    title: "Stream spike triggers autoscale readiness",
    action: "Autoscale ingestion while keeping p95 latency guarded.",
    steps: ["Throughput surge", "Autoscale ready", "Stream primary", "System watch"],
    callouts: [
      { label: "AUTOSCALE READY", x: 24, y: 30, tone: "cyan" },
      { label: "THROUGHPUT SURGE", x: 83, y: 22, tone: "cyan" },
      { label: "STREAM", x: 84, y: 10, tone: "cyan" },
      { label: "SYSTEM WATCH", x: 28, y: 74, tone: "green" },
    ],
  },
  "58": {
    eyebrow: "Resource Exhaustion",
    title: "GPU and network pressure are critical",
    action: "Throttle non-critical inference and route overflow.",
    steps: ["GPU 96%", "Network 89%", "User impact high", "Throttle active"],
    callouts: [
      { label: "GPU 96% / NETWORK 89%", x: 48, y: 25, tone: "red", align: "center" },
      { label: "USER IMPACT HIGH", x: 84, y: 61, tone: "red" },
      { label: "CRITICAL", x: 51, y: 47, tone: "red", align: "center" },
      { label: "ACTIVITY", x: 86, y: 34, tone: "red" },
    ],
  },
  "59": {
    eyebrow: "Rollback Gate",
    title: "Health regression requires a controlled rollback",
    action: "Restore last good snapshot and hold v2.4 promotion.",
    steps: ["v2.4 regression", "Rollback required", "Snapshot found", "Timeline marked"],
    callouts: [
      { label: "v2.4", x: 60, y: 42, tone: "red" },
      { label: "ROLLBACK REQUIRED", x: 78, y: 59, tone: "red" },
      { label: "LAST GOOD SNAPSHOT", x: 58, y: 74, tone: "gold" },
      { label: "TIMELINE", x: 31, y: 75, tone: "gold" },
    ],
  },
  "60": {
    eyebrow: "Resolution",
    title: "Incident settled; archive and restore point created",
    action: "Archive causal path and persist recovery memory.",
    steps: ["Incident resolved", "Path archived", "Timeline updated", "Snapshot saved"],
    callouts: [
      { label: "ARCHIVED CAUSAL PATH", x: 33, y: 58, tone: "green" },
      { label: "INCIDENT RESOLVED", x: 50, y: 77, tone: "green", align: "center" },
      { label: "ACTIVITY", x: 88, y: 31, tone: "green" },
      { label: "TIMELINE", x: 29, y: 69, tone: "green" },
    ],
  },
};

function getStateSpec(): StateSpec {
  const state = useAppStore.getState();

  if (state.activeMockupStateId) return specFromMockupState(state.activeMockupStateId);

  if (state.layoutEditMode) {
    return {
      id: "44",
      title: "Customization / Edit Layout",
      subtitle: "No-grid spatial editor with resize handles and add-widget slot",
      theme: "blue",
      core: "EDIT",
      coreSub: "LAYOUT",
      focus: ["global"],
    };
  }

  if (state.workspaceView === "canvas") {
    return {
      id: "61",
      title: "Living Canvas / Artifact View",
      subtitle: "Generated outputs branch into editable artifacts",
      theme: "magenta",
      core: "CANVAS",
      coreSub: "ARTIFACT",
      focus: ["canvas"],
    };
  }

  if (state.activeDrawer === "agent-queue") {
    return {
      id: "37",
      title: "Agent Swarm / Queue Active",
      subtitle: "Operational agents become inspectable and task-driven",
      theme: "cyan",
      core: "AGENT",
      coreSub: "SWARM",
      focus: ["agents", "core"],
    };
  }

  if (state.activeDrawer === "memory") {
    return {
      id: "38",
      title: "Memory Explorer",
      subtitle: "Detailed recall drawer connected to the temporal ribbon",
      theme: "violet",
      core: "MEMORY",
      coreSub: "RECALL",
      focus: ["timeline"],
    };
  }

  if (state.activeDrawer === "tool-approval") {
    return {
      id: "39",
      title: "Tool Approval",
      subtitle: "Write, execute and deploy permissions become explicit",
      theme: "green",
      core: "APPROVE",
      coreSub: "TOOLS",
      focus: ["chat", "pipeline"],
    };
  }

  if (state.performanceOverlayOpen || state.activeDrawer === "performance") {
    return {
      id: "48",
      title: "Performance Debug Overlay",
      subtitle: "FPS, memory, render cost and stream health are visible",
      theme: "blue",
      core: "DEBUG",
      coreSub: "PERF",
      focus: ["core"],
    };
  }

  return modeSpecs[state.mode];
}

export function StateChoreographyOverlay() {
  const mode = useAppStore((s) => s.mode);
  const composerFocused = useAppStore((s) => s.composer.isFocused);
  const activeDrawer = useAppStore((s) => s.activeDrawer);
  const activeModal = useAppStore((s) => s.activeModal);
  const workspaceView = useAppStore((s) => s.workspaceView);
  const layoutEditMode = useAppStore((s) => s.layoutEditMode);
  const performanceOverlayOpen = useAppStore((s) => s.performanceOverlayOpen);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const activeTasks = useAppStore((s) => s.tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status)).length);

  const spec = useMemo(
    () => getStateSpec(),
    [mode, composerFocused, activeDrawer, activeModal, workspaceView, layoutEditMode, performanceOverlayOpen, activeMockupStateId],
  );
  const focusFrames = useMemo(() => focusFramesForSpec(spec), [spec]);
  const explicitMockupState = Boolean(activeMockupStateId);
  const showComposerFrame = explicitMockupState ? composerStateIds.has(spec.id) : composerFocused || mode === "listening";
  const showPlanCard = explicitMockupState ? planStateIds.has(spec.id) : mode === "thinking";
  const showAlertLayer = explicitMockupState ? alertStateIds.has(spec.id) : mode === "alert";
  const showPipelineDrilldown = explicitMockupState ? pipelineStateIds.has(spec.id) : mode === "deploying";
  const showSystemTags = !["26", "38", "39", "41", "42", "43", "45", "46"].includes(spec.id);
  const inspectionPayload = inspectionPayloads[spec.id];
  const scenarioPayload = scenarioPayloads[spec.id];
  const showScenarioStrip = !scenarioPayload && (explicitMockupState ? scenarioStateIds.has(spec.id) : ["alert", "deploying", "reviewing"].includes(mode));

  const stateClass = [
    "state-choreography",
    `state-choreography--${spec.theme}`,
    `state-choreography--mode-${mode}`,
    composerFocused ? "state-choreography--composer" : "",
    activeTasks ? "state-choreography--running" : "",
    activeDrawer ? "state-choreography--drawer" : "",
    layoutEditMode ? "state-choreography--layout" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={stateClass} aria-hidden="true">
      <section className="state-choreography__banner">
        <span>{spec.id}</span>
        <div>
          <strong>{spec.title}</strong>
          <em>{spec.subtitle}</em>
        </div>
      </section>

      <div className="state-choreography__source-pill">
        <b>STATE {spec.id}</b>
        <span>{spec.subtitle}</span>
      </div>

      <div className="state-choreography__focus-frames">
        {focusFrames.map((frame, index) => (
          <span key={`${frame.id}-${index}`} className={`state-choreography__focus-frame focus-${frame.id}`}>
            <b>{frame.label}</b>
            <em>{frame.detail}</em>
          </span>
        ))}
      </div>

      <div className="state-choreography__core-frame">
        <span />
        <strong>{spec.core}</strong>
        <em>{spec.coreSub}</em>
      </div>

      {showSystemTags ? (
        <div className="state-choreography__system-tags">
          {mode === "alert" || spec.theme === "red" ? (
            <>
              <span>P95 LATENCY 230ms</span>
              <span>API GATEWAY SATURATED</span>
              <span>WATCHER + ANALYST ACTIVE</span>
            </>
          ) : ["60", "72"].includes(spec.id) ? (
            <>
              <span>SNAPSHOT SAVED</span>
              <span>RESTORE POINT CREATED</span>
            </>
          ) : mode === "deploying" ? (
            <>
              <span>CANARY 5% ACTIVE</span>
              <span>ROLLBACK GATE READY</span>
            </>
          ) : mode === "generating" || workspaceView === "canvas" || spec.theme === "magenta" ? (
            <>
              <span>BUILDER AGENT ACTIVE</span>
              <span>ARTIFACT BRANCHING</span>
            </>
          ) : (
            <>
              <span>ALL SYSTEMS NOMINAL</span>
              <span>3 AGENTS WATCHING</span>
            </>
          )}
        </div>
      ) : null}

      {showComposerFrame ? (
        <div className="state-choreography__composer-frame">
          <b>LISTENING</b>
          <p>Describe the architectural dependencies for Phase 4...</p>
          <div className="state-choreography__voice-wave">{Array.from({ length: 22 }, (_, index) => <i key={index} />)}</div>
          <footer>
            <span>Context: Project Nexus</span>
            <span>Files attached</span>
            <span>Memory on</span>
            <span>Tools ready</span>
          </footer>
        </div>
      ) : null}

      {showPlanCard ? (
        <div className="state-choreography__plan-card">
          <strong>Active Reasoning Plan</strong>
          <em>Deep analysis run - context locking and causal reasoning</em>
          <div>
            <span style={{ width: "64%" }} />
            <span style={{ width: "78%" }} />
            <span style={{ width: "42%" }} />
            <span style={{ width: "28%" }} />
          </div>
        </div>
      ) : null}

      {showAlertLayer ? (
        <>
          <div className="state-choreography__alert-triangle">!</div>
          <div className="state-choreography__causal-strike" />
        </>
      ) : null}

      {showScenarioStrip ? (
        <div className="state-choreography__scenario-strip">
          <strong>{spec.title}</strong>
          <span>{spec.subtitle}</span>
          <i>{spec.id === "72" ? "snapshot saved" : spec.theme === "red" ? "operator attention" : "workflow state"}</i>
        </div>
      ) : null}

      {scenarioPayload ? (
        <>
          <div className="state-choreography__scenario-callouts">
            {scenarioPayload.callouts.map((callout) => (
              <span
                key={callout.label}
                className={`scenario-callout scenario-callout--${callout.tone ?? spec.theme} scenario-callout--${callout.align ?? "left"}`}
                style={
                  {
                    "--callout-x": `${callout.x}%`,
                    "--callout-y": `${callout.y}%`,
                  } as CSSProperties
                }
              >
                {callout.label}
              </span>
            ))}
          </div>

          <section className={`state-choreography__scenario-board state-choreography__scenario-board--${spec.id}`}>
            <header>
              <span>{scenarioPayload.eyebrow}</span>
              <strong>{scenarioPayload.title}</strong>
            </header>
            <div>
              {scenarioPayload.steps.map((step, index) => (
                <i key={step} style={{ "--scenario-step-index": index } as CSSProperties}>
                  {step}
                </i>
              ))}
            </div>
            <footer>{scenarioPayload.action}</footer>
          </section>
        </>
      ) : null}

      {showPipelineDrilldown ? <div className="state-choreography__pipeline-drilldown" /> : null}

      {inspectionPayload ? (
        <section className={`state-choreography__inspection-hud state-choreography__inspection-hud--${spec.id}`}>
          <header>
            <span>{inspectionPayload.eyebrow}</span>
            <strong>{inspectionPayload.title}</strong>
            <em>{inspectionPayload.summary}</em>
          </header>
          <div className="state-choreography__inspection-rows">
            {inspectionPayload.rows.map((row) => (
              <div key={row.label} className={`inspection-row inspection-row--${row.tone ?? spec.theme}`}>
                <b>{row.label}</b>
                <i>{row.value}</i>
              </div>
            ))}
          </div>
          <footer>
            {inspectionPayload.metrics.map((metric) => (
              <span key={metric.label}>
                <b>{metric.value}</b>
                <em>{metric.label}</em>
              </span>
            ))}
          </footer>
        </section>
      ) : null}

      {layoutEditMode ? (
        <div className="state-choreography__layout-grid">
          <span className="box box--system">System Health</span>
          <span className="box box--project">Project Nexus</span>
          <span className="box box--model">Model</span>
          <span className="box box--stream">Data Stream</span>
          <span className="box box--causal">Causality</span>
          <span className="box box--pipeline">Pipeline</span>
          <span className="state-choreography__add-widget">Add Widget</span>
        </div>
      ) : null}
    </div>
  );
}
