function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferPanels(command) {
  const lower = String(command || "").toLowerCase();
  if (lower.includes("latency") || lower.includes("gateway") || lower.includes("slow")) {
    return ["realtime-insights", "data-stream", "model-performance", "system-health", "causality", "smart-suggestions"];
  }
  if (lower.includes("deploy") || lower.includes("release") || lower.includes("pipeline")) {
    return ["pipeline-orchestrator", "activity-feed", "model-performance", "memory-ribbon"];
  }
  return ["project-nexus", "system-health", "realtime-insights"];
}

function inferMode(command) {
  const lower = String(command || "").toLowerCase();
  if (lower.includes("latency") || lower.includes("alert") || lower.includes("slow")) return "alert";
  if (lower.includes("generate") || lower.includes("report")) return "generating";
  if (lower.includes("deploy") || lower.includes("release")) return "deploying";
  return "thinking";
}

function inferAgent(command) {
  const lower = String(command || "").toLowerCase();
  if (lower.includes("deploy") || lower.includes("release")) return "deploy";
  if (lower.includes("generate") || lower.includes("create")) return "builder";
  if (lower.includes("latency") || lower.includes("slow")) return "watcher";
  return "analyst";
}

function latencyPath() {
  return {
    id: `latency-path-${Date.now()}`,
    title: "High latency in us-east-1",
    confidence: 0.89,
    activeNodeId: "api-gateway",
    nodes: [
      { id: "high-latency", label: "High Latency Detected", panelId: "realtime-insights", severity: "warning", confidence: 0.93 },
      { id: "api-gateway", label: "API Gateway Saturation", panelId: "data-stream", severity: "warning", confidence: 0.88 },
      { id: "model-v24", label: "Model v2.4 Pressure", panelId: "model-performance", severity: "info", confidence: 0.81 },
      { id: "resource-spike", label: "Resource Spike", panelId: "system-health", severity: "critical", confidence: 0.86 },
      { id: "user-impact", label: "Slow Responses", panelId: "activity-feed", severity: "critical", confidence: 0.9 },
    ],
    edges: [
      { from: "high-latency", to: "api-gateway", weight: 0.9 },
      { from: "api-gateway", to: "model-v24", weight: 0.7 },
      { from: "model-v24", to: "resource-spike", weight: 0.76 },
      { from: "resource-spike", to: "user-impact", weight: 0.92 },
    ],
  };
}

function responseText(command) {
  const lower = String(command || "").toLowerCase();
  if (lower.includes("latency") || lower.includes("gateway") || lower.includes("slow")) {
    return [
      "I traced the latency anomaly through the active workspace.",
      "",
      "Cause trail:",
      "High latency detected -> API Gateway saturation -> Model v2.4 deployment pressure -> resource spike -> user-facing slow responses.",
      "",
      "Recommended actions:",
      "1. Scale the API gateway in us-east-1a.",
      "2. Enable connection pooling on the inference route.",
      "3. Shift 18-24% of traffic to us-east-1c for 10 minutes.",
      "4. Compare model v2.4 p95 latency against v2.3.",
      "5. Keep watcher and analyst agents active until latency normalizes.",
      "",
      "Confidence: 89%.",
    ].join("\n");
  }
  if (lower.includes("generate") || lower.includes("report")) {
    return "Deployment report generated.\n\nSummary: canary release is recommended only after latency pressure drops. Watch p95 latency, gateway queue depth, error rate, and rollback readiness.";
  }
  return "I analyzed the current workspace context.\n\nThe relevant panels are attached and the agent queue is active.";
}

function timelineEvent({ title, description, type = "task", severity = "info", relatedPanelIds = [] }) {
  return {
    id: createId("timeline"),
    timestamp: Date.now(),
    timeLabel: "Now",
    title,
    description,
    type,
    severity,
    relatedPanelIds,
  };
}

export async function streamSeeSuiteAgentRun(req, res, body = {}) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let closed = false;
  req.on("close", () => {
    closed = true;
  });

  const send = (event) => {
    if (!closed) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const command = String(body.command || body.messages?.at?.(-1)?.content || "Analyze current workspace state");
  const relatedPanelIds = inferPanels(command);
  const mode = inferMode(command);
  const taskId = createId("task");
  const assignedAgentId = inferAgent(command);
  const plan = {
    id: createId("plan"),
    userCommand: command,
    summary: mode === "alert" ? "Inspect live latency signal, generate causal path, compare deployment and resource pressure, and recommend remediation." : "Analyze workspace context and stream an operational response.",
    risk: mode === "alert" || mode === "deploying" ? "medium" : "low",
    relatedPanelIds,
    steps: [
      { id: createId("step"), label: "Resolve intent", status: "pending" },
      { id: createId("step"), label: "Gather context", status: "pending" },
      { id: createId("step"), label: mode === "alert" ? "Trace causality" : "Run agent reasoning", status: "pending" },
      { id: createId("step"), label: "Stream result", status: "pending" },
    ],
  };

  send({ type: "state", mode, energy: mode === "alert" ? 1 : 0.86, focusPanelIds: relatedPanelIds.slice(0, 1), contextPanelIds: relatedPanelIds.slice(0, 4) });
  send({ type: "plan", plan });
  send({ type: "task", action: "created", task: { id: taskId, title: command.slice(0, 64), status: "running", assignedAgentId, progress: 8, relatedPanelIds } });
  send({ type: "agent", agentId: assignedAgentId, state: "working", taskId, energy: 0.92, connectedPanel: relatedPanelIds[0] });
  send({ type: "timeline", event: timelineEvent({ title: "Agent run started", description: command, type: "chat", severity: "info", relatedPanelIds }) });

  if (mode === "alert") {
    const path = latencyPath();
    send({ type: "causality", path });
    send({ type: "timeline", event: timelineEvent({ title: "Causal path generated", description: path.title, type: "alert", severity: "warning", relatedPanelIds }) });
  }

  if (/simulate|deploy/i.test(command)) {
    const callId = createId("call");
    send({ type: "tool-call", callId, toolName: "deployment.simulate", args: { command } });
    send({ type: "tool-result", callId, toolName: "deployment.simulate", ok: true, result: { risk: "medium", recommended: "canary-only", estimatedLatencyChange: "+8%" } });
  }

  const text = responseText(command);
  for (const chunk of text.match(/.{1,10}/g) || [text]) {
    if (closed) return;
    await sleep(18);
    send({ type: "token", token: chunk });
  }

  if (/generate|report|export/i.test(command)) {
    send({ type: "artifact", artifact: { id: createId("artifact"), kind: /deploy/i.test(command) ? "deployment-plan" : "report", title: command.replace(/^\/[a-z-]+\s*/i, "") || "Generated Artifact", content: text, relatedPanelIds } });
    send({ type: "state", mode: "reviewing", energy: 0.62 });
  }

  send({ type: "task", action: "completed", task: { id: taskId, title: command.slice(0, 64), status: "complete", assignedAgentId, progress: 100, relatedPanelIds } });
  send({ type: "agent", agentId: assignedAgentId, state: "complete", taskId, energy: 0.68, connectedPanel: relatedPanelIds[0] });
  send({ type: "timeline", event: timelineEvent({ title: "Agent run completed", description: command, type: "task", severity: "success", relatedPanelIds }) });
  send({ type: "done" });
  res.end();
}
