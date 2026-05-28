import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAppStore } from "../../store/useAppStore";
import { ArtifactCanvas } from "../canvas/ArtifactCanvas";

export function LivingCanvas() {
  const workspaceView = useAppStore((s) => s.workspaceView);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  const sourceStateClass = activeMockupStateId ? `living-canvas--state-${activeMockupStateId}` : "";

  return (
    <AnimatePresence>
      {workspaceView === "canvas" ? (
        <motion.section className={`living-canvas ${sourceStateClass} glass neon-edge`} initial={{ opacity: 0, scale: 0.96, y: 18 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 18 }}>
          <header className="living-canvas__header">
            <div><strong>Living Canvas</strong><span>Artifacts, branches, reports, and generated work</span></div>
            <button type="button" aria-label="Return to dashboard" onClick={() => setWorkspaceView("dashboard")}><X size={18} /></button>
          </header>
          <ArtifactCanvas />
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
