import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";

export function useTaskSimulation() {
  const taskCount = useAppStore((s) => s.tasks.length);
  const updateTask = useAppStore((s) => s.updateTask);
  const completeTask = useAppStore((s) => s.completeTask);
  const updateAgent = useAppStore((s) => s.updateAgent);
  const setEnergy = useAppStore((s) => s.setEnergy);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);

  useEffect(() => {
    if (activeMockupStateId) return;

    const interval = window.setInterval(() => {
      const state = useAppStore.getState();
      const activeTasks = state.tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status));
      activeTasks.forEach((task) => {
        const increment = task.status === "queued" ? 8 : task.status === "planning" ? 6 : task.status === "waiting" ? 3 : 5 + Math.random() * 8;
        const nextProgress = Math.min(100, task.progress + increment);
        let nextStatus = task.status;
        if (task.status === "queued" && nextProgress > 10) nextStatus = "planning";
        if (task.status === "planning" && nextProgress > 28) nextStatus = "running";
        if (task.status === "running" && nextProgress > 84 && Math.random() > 0.72) nextStatus = "waiting";
        if (task.status === "waiting" && Math.random() > 0.58) nextStatus = "running";
        updateTask(task.id, { progress: nextProgress, status: nextStatus });
        updateAgent(task.assignedAgentId, {
          state: nextStatus === "planning" ? "thinking" : nextStatus === "waiting" ? "blocked" : "working",
          taskId: task.id,
          energy: 0.72 + nextProgress / 360,
        });
        if (nextProgress >= 100) completeTask(task.id);
      });
      const stillActive = useAppStore.getState().tasks.some((task) => ["queued", "planning", "running", "waiting"].includes(task.status));
      if (stillActive) setEnergy(0.78 + Math.random() * 0.16);
    }, 900);
    return () => window.clearInterval(interval);
  }, [activeMockupStateId, taskCount, updateTask, completeTask, updateAgent, setEnergy]);
}
