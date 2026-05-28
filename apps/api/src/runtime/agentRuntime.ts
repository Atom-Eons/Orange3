import type { AgentRunRequest } from "../types/api.js";
import type { AgentStreamEvent } from "../types/events.js";
import { buildContext } from "./contextBuilder.js";
import { buildRunPlan } from "./runPlanner.js";
import { modelAdapter } from "../model/modelAdapter.js";
import { toolRegistry } from "../tools/toolRegistry.js";
import { maybeBuildCausalPath } from "./causalityRuntime.js";
import { maybeCreateArtifact } from "./artifactRuntime.js";
import { createTimelineEvent } from "./timelineRuntime.js";
import { createId } from "./id.js";

interface RunAgentInput {
  input: AgentRunRequest;
  send: (event: AgentStreamEvent) => void;
  isClosed: () => boolean;
}

export async function runAgent({ input, send, isClosed }: RunAgentInput) {
  const command = input.command.trim();
  const context = await buildContext(input);
  const plan = buildRunPlan(command, context);
  const taskId = createId("task");
  const assignedAgentId = inferAgent(command);

  send({ type: "state", mode: plan.mode, energy: plan.mode === "alert" ? 1 : 0.86, focusPanelIds: plan.relatedPanelIds.slice(0, 1), contextPanelIds: plan.relatedPanelIds.slice(0, 4) });
  send({ type: "plan", plan: plan.plan });
  send({ type: "task", action: "created", task: { id: taskId, title: command.length > 64 ? `${command.slice(0, 64)}...` : command, status: "running", assignedAgentId, progress: 8, relatedPanelIds: plan.relatedPanelIds } });
  send({ type: "agent", agentId: assignedAgentId, state: "working", taskId, energy: 0.92, connectedPanel: plan.relatedPanelIds[0] });
  send({ type: "timeline", event: createTimelineEvent({ title: "Agent run started", description: command, type: "chat", severity: "info", relatedPanelIds: plan.relatedPanelIds }) });

  const causalPath = maybeBuildCausalPath(command, context);
  if (causalPath) {
    send({ type: "causality", path: causalPath });
    send({ type: "timeline", event: createTimelineEvent({ title: "Causal path generated", description: causalPath.title, type: "alert", severity: "warning", relatedPanelIds: plan.relatedPanelIds }) });
  }

  let accumulated = "";
  for await (const event of modelAdapter.stream({ command, context, plan: plan.plan })) {
    if (isClosed()) return;
    if (event.type === "token") {
      accumulated += event.token;
      send({ type: "token", token: event.token });
    }
    if (event.type === "tool-call") {
      send(event);
      const result = await toolRegistry.invoke({ callId: event.callId, toolName: event.toolName, args: event.args, context });
      send({ type: "tool-result", callId: event.callId, toolName: event.toolName, ok: result.ok, result: result.result, error: result.error });
    }
  }

  const artifact = maybeCreateArtifact(command, accumulated, plan.relatedPanelIds);
  if (artifact) {
    send({ type: "state", mode: "generating", energy: 0.95, focusPanelIds: ["smart-suggestions"], contextPanelIds: plan.relatedPanelIds.slice(0, 4) });
    send({ type: "artifact", artifact });
    send({ type: "timeline", event: createTimelineEvent({ title: "Artifact created", description: artifact.title, type: "memory", severity: "success", relatedPanelIds: plan.relatedPanelIds }) });
    send({ type: "state", mode: "reviewing", energy: 0.62 });
  }

  send({ type: "task", action: "completed", task: { id: taskId, title: command.length > 64 ? `${command.slice(0, 64)}...` : command, status: "complete", assignedAgentId, progress: 100, relatedPanelIds: plan.relatedPanelIds } });
  send({ type: "agent", agentId: assignedAgentId, state: "complete", taskId, energy: 0.68, connectedPanel: plan.relatedPanelIds[0] });
  send({ type: "timeline", event: createTimelineEvent({ title: "Agent run completed", description: command, type: "task", severity: "success", relatedPanelIds: plan.relatedPanelIds }) });
}

function inferAgent(command: string) {
  const lower = command.toLowerCase();
  if (lower.includes("deploy") || lower.includes("release")) return "deploy";
  if (lower.includes("memory") || lower.includes("timeline") || lower.includes("history")) return "memory";
  if (lower.includes("build") || lower.includes("generate") || lower.includes("create")) return "builder";
  if (lower.includes("alert") || lower.includes("latency") || lower.includes("slow")) return "watcher";
  return "analyst";
}
