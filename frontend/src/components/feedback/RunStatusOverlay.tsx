import { Activity, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "../../store/useAppStore";

export function RunStatusOverlay() {
  const tasks = useAppStore((s) => s.tasks);
  const mode = useAppStore((s) => s.mode);
  const activeTasks = tasks.filter((task) => ["queued", "planning", "running", "waiting"].includes(task.status));
  const active = activeTasks.length > 0 || ["thinking", "generating", "deploying"].includes(mode);
  return (
    <AnimatePresence>
      {active ? (
        <motion.div className="run-status-overlay glass neon-edge" initial={{ opacity: 0, y: -12, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12, scale: 0.96 }}>
          <Loader2 size={16} className="run-status-overlay__spinner" />
          <div><strong>{mode}</strong><span>{activeTasks.length} active task{activeTasks.length === 1 ? "" : "s"}</span></div>
          <Activity size={15} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
