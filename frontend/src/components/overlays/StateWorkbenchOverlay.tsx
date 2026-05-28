import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { getMockupStateSpec } from "../../engine/mockupStateBank";
import { useAppStore } from "../../store/useAppStore";

const drawerTitles: Record<string, string> = {
  settings: "Settings",
  notifications: "Notifications",
  "artifact-inspector": "Artifact Inspector",
  performance: "Performance Overlay",
};

const modalTitles: Record<string, string> = {
  "add-widget": "Add Widget",
  "context-picker": "Context Picker",
  "model-selector": "Model Selector",
  export: "Export Workspace",
  approval: "Deployment Approval",
  shortcuts: "Keyboard Shortcuts",
  compare: "Artifact Branch Compare",
  "stop-confirm": "Stop Active Run?",
};

function linesForSurface(label: string) {
  if (label.includes("Settings")) return ["Motion intensity", "Memory scope", "Backend: mock / remote", "Visual priority tuning"];
  if (label.includes("Notifications")) return ["Critical latency", "Tool result returned", "Artifact created", "Agent task completed"];
  if (label.includes("Artifact")) return ["Deployment Report", "Primary branch", "Related panels: pipeline, model, causality", "Export ready"];
  if (label.includes("Context")) return ["System Health", "Project Nexus", "Causal Insights", "Temporal Memory"];
  if (label.includes("Model")) return ["GPT-5.5 frontier", "Deep mode", "Latency budget: medium", "Tool policy: approved"];
  if (label.includes("Approval")) return ["Canary 5%", "Risk: medium", "Rollback gate: ready", "Human approval required"];
  if (label.includes("Shortcuts")) return ["Cmd/Ctrl+K command palette", "Cmd/Ctrl+L composer focus", "Cmd/Ctrl+Enter run", "Escape closes overlays"];
  if (label.includes("Compare")) return ["Branch A: concise", "Branch B: evidence-rich", "Branch C: deployment-safe", "Recommended: Branch B"];
  return ["Workspace snapshot", "Timeline range", "Artifacts and memory", "Ready"];
}

export function StateWorkbenchOverlay() {
  const activeDrawer = useAppStore((s) => s.activeDrawer);
  const activeModal = useAppStore((s) => s.activeModal);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const setModalOpen = useAppStore((s) => s.setModalOpen);

  const mockup = getMockupStateSpec(activeMockupStateId);
  const drawerTitle = activeDrawer ? drawerTitles[activeDrawer] : undefined;
  const modalTitle = activeModal ? modalTitles[activeModal] : undefined;

  return (
    <>
      <AnimatePresence>
        {drawerTitle ? (
          <motion.aside
            className="state-workbench-drawer glass neon-edge"
            initial={{ opacity: 0, x: 42, filter: "blur(10px)" }}
            animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, x: 42, filter: "blur(10px)" }}
          >
            <header>
              <div>
                <strong>{drawerTitle}</strong>
                <span>{mockup.subtitle}</span>
              </div>
              <button type="button" aria-label="Close drawer" onClick={() => setDrawerOpen(undefined)}>
                <X size={17} />
              </button>
            </header>
            <div className="state-workbench-list">
              {linesForSurface(drawerTitle).map((line, index) => (
                <article key={line}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <div>
                    <strong>{line}</strong>
                    <span>{index % 2 === 0 ? "ready" : "linked"}</span>
                  </div>
                  <button type="button">Explain</button>
                </article>
              ))}
            </div>
          </motion.aside>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {modalTitle ? (
          <motion.section
            className={`state-workbench-modal state-workbench-modal--${activeModal} state-workbench-modal--state-${mockup.id} glass neon-edge`}
            initial={{ opacity: 0, scale: 0.92, y: 18, filter: "blur(10px)" }}
            animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, scale: 0.92, y: 18, filter: "blur(10px)" }}
          >
            <header>
              <div>
                <strong>{modalTitle}</strong>
                <span>{mockup.title}</span>
              </div>
              <button type="button" aria-label="Close modal" onClick={() => setModalOpen(undefined)}>
                <X size={17} />
              </button>
            </header>
            <div className="state-workbench-list state-workbench-list--modal">
              {linesForSurface(modalTitle).map((line, index) => (
                <article key={line}>
                  <i>{String(index + 1).padStart(2, "0")}</i>
                  <div>
                    <strong>{line}</strong>
                    <span>{mockup.focus.join(" / ") || "global"}</span>
                  </div>
                </article>
              ))}
            </div>
            <footer>
              <button type="button">Cancel</button>
              <button type="button">Apply State</button>
            </footer>
          </motion.section>
        ) : null}
      </AnimatePresence>
    </>
  );
}
