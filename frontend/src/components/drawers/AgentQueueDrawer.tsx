import { Bot, CheckCircle2, Clock, PauseCircle, XCircle } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { StatusDot } from "../primitives/StatusDot";
import { DrawerShell } from "./DrawerShell";

type SourceQueueAgent = {
  id: string;
  label: string;
  subtitle: string;
  state: "working" | "watching" | "thinking" | "blocked" | "complete";
  progress: number;
  status: string;
};

function iconForStatus(status: string) {
  if (status === "complete") return CheckCircle2;
  if (status === "cancelled" || status === "failed") return XCircle;
  if (status === "waiting") return PauseCircle;
  return Clock;
}

export function AgentQueueDrawer() {
  const tasks = useAppStore((s) => s.tasks);
  const agents = useAppStore((s) => s.agents);
  const focusPanel = useAppStore((s) => s.focusPanel);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const sourceQueue = activeMockupStateId === "37";
  const sourceAgents: SourceQueueAgent[] = [
    { id: "builder", label: "Builder Agent", subtitle: "Generating artifact", state: "working", progress: 96, status: "96%" },
    { id: "watcher", label: "Watcher Agent", subtitle: "Monitoring latency", state: "watching", progress: 72, status: "active" },
    { id: "analyst", label: "Analyst Agent", subtitle: "Triaging causality", state: "thinking", progress: 81, status: "81%" },
    { id: "deploy", label: "Deploy Agent", subtitle: "Waiting approval", state: "blocked", progress: 42, status: "blocked" },
    { id: "memory", label: "Memory Agent", subtitle: "Storing context", state: "complete", progress: 100, status: "done" },
  ];
  const activeCount = agents.filter((agent) =>
    ["working", "thinking", "watching", "blocked"].includes(agent.state),
  ).length;
  const queuedCount = tasks.filter((task) =>
    ["queued", "planning", "running", "waiting"].includes(task.status),
  ).length;

  return (
    <DrawerShell
      drawerId="agent-queue"
      title="Agent Queue"
      subtitle={sourceQueue ? "Live operational tasks" : "Live operational tasks and assignments"}
      width={sourceQueue ? 420 : 480}
    >
      <div className={`agent-drawer__summary ${sourceQueue ? "agent-drawer__summary--hidden" : ""}`}>
        <strong>{activeCount} agents active</strong>
        <span>{queuedCount || tasks.length} tasks queued</span>
      </div>

      <section className={`agent-drawer__agents ${sourceQueue ? "agent-drawer__agents--source-list" : ""}`}>
        {sourceQueue
          ? sourceAgents.map((agent) => (
              <article key={agent.id} className={`agent-card agent-card--${agent.state} agent-card--source-list`}>
                <div className="agent-card__orb"><Bot size={18} /></div>
                <div className="agent-card__copy">
                  <strong>{agent.label}</strong>
                  <span>{agent.subtitle}</span>
                  <i><b style={{ width: `${agent.progress}%` }} /></i>
                </div>
                <em>{agent.status}</em>
                <StatusDot tone={agent.state === "blocked" ? "warning" : agent.state === "working" || agent.state === "thinking" ? "success" : "idle"} />
              </article>
            ))
          : agents.map((agent, index) => {
              const relatedTask = tasks.find((task) => task.assignedAgentId === agent.id);
              const progress = Math.round(relatedTask?.progress ?? Math.min(96, agent.energy * 100 || 42 + index * 9));
              const statusLabel =
                agent.state === "blocked"
                  ? "blocked"
                  : agent.state === "complete"
                    ? "done"
                    : agent.state === "idle"
                      ? index === 3
                        ? "queued"
                        : "idle"
                      : `${progress}%`;

              return (
                <article key={agent.id} className={`agent-card agent-card--${agent.state}`}>
                  <div className="agent-card__orb"><Bot size={18} /></div>
                  <div className="agent-card__copy">
                    <strong>{agent.label}</strong>
                    <span>{relatedTask?.title ?? agent.state}</span>
                    <i><b style={{ width: `${progress}%` }} /></i>
                  </div>
                  <em>{statusLabel}</em>
                  <StatusDot tone={agent.state === "blocked" ? "warning" : agent.state === "working" || agent.state === "thinking" ? "success" : "idle"} />
                </article>
              );
            })}
      </section>

      <section className={`agent-drawer__tasks ${sourceQueue ? "agent-drawer__tasks--hidden" : ""}`}>
        <header><strong>Tasks</strong><span>{tasks.length} total</span></header>
        {tasks.length === 0 ? <div className="drawer-empty">No tasks yet. Run a command to activate agents.</div> : null}
        {[...tasks].reverse().map((task) => {
          const Icon = iconForStatus(task.status);
          return (
            <article key={task.id} className={`task-card task-card--${task.status}`}>
              <header><span className="task-card__icon"><Icon size={16} /></span><div><strong>{task.title}</strong><em>{task.assignedAgentId} - {task.status}</em></div></header>
              <div className="task-card__progress"><span style={{ width: `${Math.round(task.progress)}%` }} /></div>
              <footer>{task.relatedPanelIds.slice(0, 3).map((panelId) => <button key={panelId} type="button" onClick={() => focusPanel(panelId)}>{panelId}</button>)}</footer>
            </article>
          );
        })}
      </section>
    </DrawerShell>
  );
}
