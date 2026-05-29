import { AnimatePresence } from "motion/react";
import { useAppStore } from "../../store/useAppStore";
import { SettingsDrawer } from "../surfaces/SettingsDrawer";
import { NotificationsDrawer } from "../surfaces/NotificationsDrawer";
import { ArtifactInspectorDrawer } from "../surfaces/ArtifactInspectorDrawer";
import { ProductModalStack } from "../surfaces/ProductModalStack";

const productDrawers = new Set(["settings", "notifications", "artifact-inspector"]);
const productModals = new Set(["add-widget", "context-picker", "model-selector", "export", "approval", "shortcuts", "compare", "stop-confirm"]);

export function isProductSurfaceDrawer(drawer?: string) {
  return Boolean(drawer && productDrawers.has(drawer));
}

export function isProductSurfaceModal(modal?: string) {
  return Boolean(modal && productModals.has(modal));
}

export function ProductSurfaceOverlay() {
  const activeDrawer = useAppStore((s) => s.activeDrawer);
  const activeModal = useAppStore((s) => s.activeModal);

  return (
    <>
      <AnimatePresence>
        {activeDrawer === "settings" ? <SettingsDrawer /> : null}
        {activeDrawer === "notifications" ? <NotificationsDrawer /> : null}
        {activeDrawer === "artifact-inspector" ? <ArtifactInspectorDrawer /> : null}
      </AnimatePresence>
      <AnimatePresence>{isProductSurfaceModal(activeModal) ? <ProductModalStack modalId={activeModal} /> : null}</AnimatePresence>
    </>
  );
}
