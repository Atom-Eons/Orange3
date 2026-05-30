import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { getMockupStateSpec } from "../../engine/mockupStateBank";
import { useAppStore } from "../../store/useAppStore";
import { isProductSurfaceDrawer, isProductSurfaceModal } from "./ProductSurfaceOverlay";

const drawerTitles: Record<string, string> = {
  performance: "Performance Overlay",
};

const modalTitles: Record<string, string> = {};

function linesForSurface(label: string) {
  if (label.includes("Performance")) return ["FPS", "Memory", "Render cost", "Stream health"];
  return ["Workspace snapshot", "Timeline range", "Artifacts and memory", "Ready"];
}

export function StateWorkbenchOverlay() {
  const activeDrawer = useAppStore((s) => s.activeDrawer);
  const activeModal = useAppStore((s) => s.activeModal);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const setModalOpen = useAppStore((s) => s.setModalOpen);

  const mockup = getMockupStateSpec(activeMockupStateId);
  const drawerTitle = activeDrawer && !isProductSurfaceDrawer(activeDrawer) ? drawerTitles[activeDrawer] : undefined;
  const modalTitle = activeModal && !isProductSurfaceModal(activeModal) ? modalTitles[activeModal] : undefined;

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
