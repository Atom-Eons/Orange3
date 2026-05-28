export type MockupTheme =
  | "calm"
  | "listening"
  | "thinking"
  | "analyzing"
  | "generating"
  | "alert"
  | "deploying"
  | "reviewing"
  | "lowlight"
  | "highcontrast"
  | "offline"
  | "red"
  | "magenta"
  | "gold"
  | "green";

export interface MockupStateSpec {
  id: string;
  title: string;
  subtitle: string;
  theme: MockupTheme;
  focus: string[];
  file: string;
}

const rawSpecs: Array<[string, string, string, MockupTheme, string[]]> = [
  ["01", "Calm Overview", "Default living dashboard, all systems breathing slowly", "calm", ["core", "timeline"]],
  ["02", "Listening / Composer Active", "User focuses LLM IDE bar; context locks to chat", "listening", ["chat", "core"]],
  ["03", "Thinking / Deep Work", "Command submitted; plan created and assistant streaming", "thinking", ["chat", "core", "causality"]],
  ["04", "Analyzing / Causality Scan", "System resolves relationships between panels", "analyzing", ["causality", "model", "stream", "system"]],
  ["05", "Generating / Artifact Build", "Builder agent creates canvas artifact from prompt", "generating", ["chat", "suggestions", "core"]],
  ["06", "Alert / Critical Latency", "Urgent causal path with impacted panels and response plan", "alert", ["causality", "activity", "stream", "system"]],
  ["07", "Deploying / Release Flow", "Deployment mode; pipeline and rollout gates become primary", "deploying", ["pipeline", "activity", "model", "timeline"]],
  ["08", "Reviewing / Comparison Mode", "Motion slows; model comparison and evidence review surface", "reviewing", ["model", "causality", "timeline"]],
  ["09", "Low Light Minimal", "Ultra-low light mode for long monitoring sessions", "lowlight", ["chat", "model", "stream"]],
  ["10", "High Contrast Accessibility", "Increased text contrast and stronger focus boundaries", "highcontrast", ["system", "chat", "causality"]],
  ["11", "Offline / Local Cache", "Backend disconnected; local workspace cache stays usable", "offline", ["chat", "timeline"]],
  ["12", "First Load / Skeleton", "Initial system boot before metrics and agents hydrate", "calm", ["global"]],
  ["13", "System Health Expanded", "CPU, memory, GPU, network and pressure details in inspection mode", "analyzing", ["system"]],
  ["14", "Project Nexus Expanded", "Service graph, node health, dependencies and topology focus", "analyzing", ["project", "core"]],
  ["15", "Real-Time Insights Expanded", "Anomaly list and prediction drift details", "alert", ["insights", "causality"]],
  ["16", "Model Performance Deep Dive", "Metrics, distribution, confidence matrix and regression notes", "reviewing", ["model"]],
  ["17", "Data Stream Expanded", "Throughput, event rate, stream health and gateway saturation", "analyzing", ["stream"]],
  ["18", "Pipeline Orchestrator Expanded", "Ingest, process, validate and deploy stage timing", "deploying", ["pipeline"]],
  ["19", "Activity Feed Expanded", "Recent deployments, data updates, alerts and drift history", "reviewing", ["activity", "timeline"]],
  ["20", "Smart Suggestions Expanded", "Recommendations ranked by impact and confidence", "generating", ["suggestions"]],
  ["21", "Causal Insights Full Analysis", "High-latency chain, confidence and evidence expansion", "alert", ["causality"]],
  ["22", "Temporal Memory Expanded", "Timeline scrub, snapshots, rewind and event replay", "reviewing", ["timeline"]],
  ["23", "Agent Network Expanded", "Ambient agents, capabilities, tasks and communication flow", "thinking", ["agents", "core"]],
  ["24", "Resource Utilization Expanded", "Capacity prediction, cost pressure and allocation controls", "alert", ["system", "suggestions"]],
  ["25", "Slash Command Menu", "Composer shows available commands and command templates", "listening", ["chat"]],
  ["26", "Command Palette Open", "Global command surface for navigation and actions", "listening", ["global"]],
  ["27", "Plan Preview Before Run", "Agent previews steps, risk and related panels before execution", "thinking", ["chat", "timeline"]],
  ["28", "Run In Progress Streaming", "Assistant response streams while tasks progress", "thinking", ["chat", "agents"]],
  ["29", "Tool Call Running", "Tool execution appears in transcript and agent queue", "thinking", ["chat", "pipeline"]],
  ["30", "Tool Result Returned", "Tool result integrated into plan, timeline and response", "reviewing", ["chat", "timeline"]],
  ["31", "Multimodal Attachment", "Files, images and context attached to command", "listening", ["chat"]],
  ["32", "Voice Dictation Active", "Voice waveform and transcription mode in composer", "listening", ["chat", "core"]],
  ["33", "Context Picker Open", "Panel, file, memory and artifact context selector", "listening", ["chat", "causality"]],
  ["34", "Model Selector Open", "Model, mode, cost and latency selector", "reviewing", ["chat"]],
  ["35", "Stop / Cancel Confirmation", "User stops an active agent run safely", "alert", ["chat"]],
  ["36", "Error Response / Retry", "Model/tool stream failed; retry and fallback controls appear", "red", ["chat"]],
  ["37", "Agent Queue Drawer", "Inspect running, blocked and completed agent tasks", "thinking", ["agents"]],
  ["38", "Memory Browser Drawer", "Search timeline, conversation and saved workspace memory", "reviewing", ["timeline"]],
  ["39", "Tool Approval Drawer", "Review write, execute and deploy permissions before action", "deploying", ["chat", "pipeline"]],
  ["40", "Artifact Inspector Drawer", "Inspect generated report metadata, context and branches", "generating", ["canvas", "chat"]],
  ["41", "Settings Drawer", "Model, motion, theme, memory and backend configuration", "reviewing", ["global"]],
  ["42", "Notifications Center", "System events, alerts, task completions and tool failures", "alert", ["activity"]],
  ["43", "Add Widget Modal", "Create a new semantic panel from command or metric", "generating", ["global"]],
  ["44", "Layout Edit Mode", "Drag, resize, hide and save floating semantic panels", "reviewing", ["global"]],
  ["45", "Keyboard Shortcuts Overlay", "Global shortcuts for command, composer, run and stop", "reviewing", ["global"]],
  ["46", "Export Report Modal", "Export artifact, workspace snapshot or timeline as document", "generating", ["global"]],
  ["47", "Deployment Approval Gate", "Approve canary rollout with risk and rollback conditions", "deploying", ["pipeline"]],
  ["48", "Performance Debug Overlay", "FPS, memory, render cost and stream health shown for QA", "analyzing", ["core"]],
  ["49", "Latency Diagnosis Flow", "Full diagnostic flow from anomaly to remediation", "alert", ["insights", "causality", "stream", "system"]],
  ["50", "Data Drift Detected", "Dataset shift impacts model confidence and retraining recommendation", "magenta", ["insights", "model", "suggestions"]],
  ["51", "Pipeline Failure Recovery", "Validation failure with rollback and rerun controls", "red", ["pipeline", "activity"]],
  ["52", "Canary Deployment Simulation", "Simulated rollout with risk meter and gates", "deploying", ["pipeline", "model"]],
  ["53", "Model Regression Detected", "Accuracy drop and latency increase after model version change", "alert", ["model", "causality"]],
  ["54", "Dataset Sync In Progress", "Data ingestion and sync status across sources", "thinking", ["stream", "pipeline"]],
  ["55", "Security Anomaly", "Suspicious access pattern detected by watcher agent", "alert", ["activity", "agents"]],
  ["56", "Cost Spike Optimization", "Resource and inference cost spike; suggestions prioritize savings", "gold", ["system", "suggestions"]],
  ["57", "Throughput Surge", "Live data stream spike and autoscaling response", "analyzing", ["stream", "system"]],
  ["58", "Resource Exhaustion", "GPU and network pressure critical with degraded response", "red", ["system", "activity"]],
  ["59", "Rollback Required", "Deployment rollback recommended after health regression", "alert", ["pipeline", "activity", "timeline"]],
  ["60", "Incident Resolved", "Alert settled; causal path archived and timeline updated", "green", ["timeline", "activity"]],
  ["61", "Living Canvas Artifact View", "Generated artifact opens as primary creation surface", "generating", ["canvas"]],
  ["62", "Artifact Branch Compare", "Compare regenerated output branches side by side", "reviewing", ["global"]],
  ["63", "Report Generation Preview", "Deployment report draft generated from workspace state", "generating", ["canvas"]],
  ["64", "Code Generation Workspace", "Code artifact, test plan and terminal-like result view", "generating", ["global"]],
  ["65", "Image / Visual Asset Board", "Generated visual assets connected to project memory", "generating", ["global"]],
  ["66", "Prompt Version History", "Prompt branches, model outputs and evaluation notes", "reviewing", ["chat", "timeline"]],
  ["67", "Memory Search Results", "Semantic memory search returns relevant prior decisions", "reviewing", ["timeline"]],
  ["68", "Timeline Scrub Playback", "Workspace reconstructs historical state from memory ribbon", "reviewing", ["timeline", "core"]],
  ["69", "AI Critic Review", "Critic agent evaluates generated artifact and suggests edits", "reviewing", ["canvas"]],
  ["70", "Suggested Next Actions Applied", "Smart suggestions converted into queued agent tasks", "deploying", ["suggestions", "agents", "chat"]],
  ["71", "Custom Widget Builder", "User creates a new panel from prompt and metric source", "generating", ["global"]],
  ["72", "Saved Workspace Snapshot", "Current layout, memory and artifacts saved as restorable snapshot", "green", ["timeline", "chat"]],
];

const fileOverrides: Record<string, string> = {
  "15": "mockups/15_real-time_insights_expanded.jpg",
};

export const mockupStateBank: MockupStateSpec[] = rawSpecs.map(([id, title, subtitle, theme, focus]) => ({
  id,
  title,
  subtitle,
  theme,
  focus,
  file:
    fileOverrides[id] ??
    `mockups/${id}_${title.toLowerCase().replace(/ \/ /g, "_").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}.jpg`,
}));

export function getMockupStateSpec(id?: string | number) {
  const normalized = String(id ?? "01").padStart(2, "0");
  return mockupStateBank.find((state) => state.id === normalized) ?? mockupStateBank[0];
}
