import { useAppStore } from "../store/useAppStore";
import type { AgentId, AgentTask, CommandPlan } from "../types/app";
import { parseCommand } from "./commandParser";
import { createLatencyCausalPath } from "./causalityEngine";
import { createId } from "./id";
import { llmAdapter } from "./llmAdapter";
import { abortActiveRun, setActiveAbortController } from "./runtime";
import { toolRegistry } from "./toolRegistry";
import { createTimelineEvent } from "./timelineEngine";
import { serializeWorkspaceForLLM } from "./workspaceSerializer";

function inferAgent(command: string): AgentId {
  const lower = command.toLowerCase();
  if (lower.includes("deploy") || lower.includes("release")) return "deploy";
  if (lower.includes("memory") || lower.includes("timeline") || lower.includes("history")) return "memory";
  if (lower.includes("build") || lower.includes("generate") || lower.includes("create")) return "builder";
  if (lower.includes("alert") || lower.includes("latency") || lower.includes("slow")) return "watcher";
  return "analyst";
}

function buildPlan(command: string, relatedPanelIds: CommandPlan["relatedPanelIds"]): CommandPlan {
  const lower = command.toLowerCase();
  return {
    id: createId("plan"),
    userCommand: command,
    summary: lower.includes("latency")
      ? "Inspect live latency, generate causal path, compare deployment and resource pressure, and recommend remediation."
      : lower.includes("generate") || lower.includes("report")
        ? "Gather workspace context, generate the requested artifact, and attach it to the living canvas."
        : "Analyze workspace context and stream an operational response.",
    risk: lower.includes("deploy") || lower.includes("latency") ? "medium" : "low",
    relatedPanelIds,
    steps: [
      { id: createId("step"), label: "Resolve intent", description: "Classify command and bind workspace context.", status: "active" },
      { id: createId("step"), label: "Gather context", description: "Read panels, memory, metrics, and timeline tail.", status: "pending" },
      { id: createId("step"), label: lower.includes("latency") ? "Trace causality" : "Run agent reasoning", status: "pending" },
      { id: createId("step"), label: "Stream result", status: "pending" },
    ],
  };
}

export function cancelActiveRun() {
  abortActiveRun();
  useAppStore.getState().cancelActiveTasks();
}

export function handleSubmitCommand(command: string) {
  const trimmed = command.trim();
  if (!trimmed) return;

  const parsed = parseCommand(trimmed);
  const state = useAppStore.getState();
  const assignedAgentId = inferAgent(trimmed);
  const taskId = createId("task");
  const assistantId = createId("assistant");
  const plan = buildPlan(trimmed, parsed.relatedPanelIds);
  const task: AgentTask = {
    id: taskId,
    title: trimmed.length > 68 ? `${trimmed.slice(0, 68)}...` : trimmed,
    status: "queued",
    assignedAgentId,
    progress: 4,
    startedAt: Date.now(),
    relatedPanelIds: parsed.relatedPanelIds,
  };

  state.addMessage({ id: createId("user"), role: "user", content: trimmed, createdAt: Date.now(), status: "complete", relatedPanelIds: parsed.relatedPanelIds });
  state.addMessage({ id: assistantId, role: "assistant", content: "", createdAt: Date.now(), status: "streaming", relatedPanelIds: parsed.relatedPanelIds });
  state.setComposerValue("");
  state.setSlashMenuOpen(false);
  state.setMode(parsed.inferredMode);
  state.setEnergy(parsed.inferredMode === "alert" ? 1 : 0.86);
  state.setContextPanels(parsed.relatedPanelIds.slice(0, 4));
  state.setPlanPreview(plan);
  state.addTask(task);
  state.updateAgent(assignedAgentId, { state: "working", taskId, energy: 0.92, connectedPanel: parsed.relatedPanelIds[0] });
  state.addTimelineEvent(createTimelineEvent({ title: "Agent run started", description: trimmed, type: "chat", severity: "info", relatedPanelIds: parsed.relatedPanelIds }));

  if (parsed.inferredMode === "alert") {
    const path = createLatencyCausalPath();
    state.setActiveCausalPath(path);
    state.addEventToast({ title: "Causal path generated", description: path.title, severity: "warning" });
  }

  void runLLMForCommand({ assistantId, taskId, command: trimmed, plan });
}

async function runLLMForCommand({ assistantId, taskId, command, plan }: { assistantId: string; taskId: string; command: string; plan: CommandPlan }) {
  const controller = new AbortController();
  setActiveAbortController(controller);
  let content = "";

  try {
    for await (const event of llmAdapter.run({
      messages: useAppStore.getState().messages,
      context: {
        selectedModel: useAppStore.getState().composer.selectedModel,
        selectedMode: useAppStore.getState().composer.selectedMode,
        selectedTools: useAppStore.getState().composer.selectedTools,
        contextPanelIds: useAppStore.getState().composer.contextPanelIds,
        visiblePanelData: serializeWorkspaceForLLM(useAppStore.getState()),
        activeCausalPath: useAppStore.getState().activeCausalPath,
        timelineTail: useAppStore.getState().timeline.slice(-8),
        metricTail: useAppStore.getState().metricHistory.slice(-12),
        activeTasks: useAppStore.getState().tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status)),
      },
      abortSignal: controller.signal,
    })) {
      const current = useAppStore.getState();

      if (event.type === "token") {
        content += event.token;
        current.updateMessage(assistantId, { content, status: "streaming" });
      }

      if (event.type === "plan") current.setPlanPreview(event.plan);

      if (event.type === "state") {
        if (event.mode) current.setMode(event.mode);
        if (event.energy) current.setEnergy(event.energy);
        if (event.focusPanelIds?.[0]) current.focusPanel(event.focusPanelIds[0]);
        if (event.contextPanelIds) current.setContextPanels(event.contextPanelIds);
      }

      if (event.type === "task") {
        if (event.action === "created") {
          current.addTask({
            id: event.task.id,
            title: event.task.title,
            status: event.task.status as AgentTask["status"],
            assignedAgentId: event.task.assignedAgentId as AgentId,
            progress: event.task.progress,
            relatedPanelIds: event.task.relatedPanelIds,
            startedAt: Date.now(),
          });
        } else {
          current.updateTask(event.task.id, {
            status: event.task.status as AgentTask["status"],
            progress: event.task.progress,
            completedAt: ["completed", "failed", "cancelled"].includes(event.action) ? Date.now() : undefined,
          });
        }
      }

      if (event.type === "agent") {
        current.updateAgent(event.agentId as AgentId, {
          state: event.state as never,
          taskId: event.taskId,
          energy: event.energy,
          connectedPanel: event.connectedPanel,
        });
      }

      if (event.type === "timeline") current.addTimelineEvent(event.event);

      if (event.type === "causality") {
        current.setActiveCausalPath(event.path);
        current.addEventToast({ title: "Causal path generated", description: event.path.title, severity: "warning" });
      }

      if (event.type === "artifact") {
        current.addArtifact(event.artifact);
        current.addEventToast({ title: "Artifact created", description: event.artifact.title, severity: "success" });
      }

      if (event.type === "tool-call") {
        current.addMessage({ id: `tool-${event.callId}`, role: "tool", content: `Running ${event.toolName}...`, createdAt: Date.now(), status: "streaming" });
        const result = await toolRegistry.invoke({ callId: event.callId, toolName: event.toolName, args: event.args });
        current.updateMessage(`tool-${event.callId}`, {
          content: result.ok ? `${event.toolName} completed.` : `${event.toolName} failed: ${result.error}`,
          status: result.ok ? "complete" : "error",
        });
        if (!result.ok) current.addEventToast({ title: "Tool failed", description: result.error, severity: "critical" });
      }

      if (event.type === "tool-result" && event.ok === false) {
        current.addEventToast({ title: "Tool failed", description: event.error, severity: "critical" });
      }

      if (event.type === "error") {
        current.updateMessage(assistantId, { content: content || event.error, status: "error" });
        current.addTimelineEvent(createTimelineEvent({ title: "Agent run failed", description: event.error, type: "task", severity: "critical", relatedPanelIds: plan.relatedPanelIds }));
        current.addEventToast({ title: "Agent run failed", description: event.error, severity: "critical" });
        current.cancelActiveTasks();
        return;
      }

      if (event.type === "done") {
        finishRun(assistantId, taskId, command, content, plan);
        return;
      }
    }

    finishRun(assistantId, taskId, command, content, plan);
  } catch (error) {
    const current = useAppStore.getState();
    const message = error instanceof Error ? error.message : "LLM stream failed.";
    current.updateMessage(assistantId, { content: content || message, status: "error" });
    current.addEventToast({ title: "Agent run failed", description: message, severity: "critical" });
    current.cancelActiveTasks();
  } finally {
    setActiveAbortController(undefined);
  }
}

function finishRun(assistantId: string, taskId: string, command: string, content: string, plan: CommandPlan) {
  const current = useAppStore.getState();
  current.updateMessage(assistantId, { content, status: "complete" });
  current.completeTask(taskId);
  current.setEnergy(current.activeCausalPath ? 0.82 : 0.58);
  if (!current.activeCausalPath) current.setMode("calm");
  current.addTimelineEvent(createTimelineEvent({ title: "Agent run completed", description: command, type: "task", severity: "success", relatedPanelIds: plan.relatedPanelIds }));

  if (/generate|report|export/i.test(command)) {
    current.addArtifact({
      id: createId("artifact"),
      kind: /deploy/i.test(command) ? "deployment-plan" : "report",
      title: command.replace(/^\/[a-zA-Z-]+\s*/, "") || "Generated Artifact",
      content,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      relatedPanelIds: plan.relatedPanelIds,
    });
    current.setMode("reviewing");
    current.addEventToast({ title: "Artifact created", description: command, severity: "success" });
  }
}
