import { motion } from "motion/react";
import clsx from "clsx";
import type { SemanticPanel } from "../../types/app";
import { useLivingPanelMotion } from "../../hooks/useLivingPanelMotion";
import { useViewportProfile } from "../../hooks/useViewportProfile";
import { useWindowSize } from "../../hooks/useWindowSize";
import { getAnchorForProfile } from "../../engine/semanticLayout";
import { useAppStore } from "../../store/useAppStore";
import { panelComponents } from "./panelRegistry";

interface Props {
  panel: SemanticPanel;
}

export function FloatingPanel({ panel }: Props) {
  const focusPanel = useAppStore((s) => s.focusPanel);
  const expandPanel = useAppStore((s) => s.expandPanel);
  const focusPanelId = useAppStore((s) => s.focusPanelId);
  const profile = useViewportProfile();
  const viewport = useWindowSize();
  const responsiveAnchor = getAnchorForProfile(panel.id, profile);
  const motionWidth = panel.expanded ? Math.min(viewport.width * 0.58, panel.width * 1.55) : panel.width;
  const motionHeight = panel.expanded ? Math.min(viewport.height * 0.56, panel.height * 1.45) : panel.height;
  const livingStyle = useLivingPanelMotion({ id: panel.id, anchor: responsiveAnchor, width: motionWidth, height: motionHeight, priority: panel.priority, dimmed: panel.dimmed, expanded: panel.expanded });
  const focused = focusPanelId === panel.id;
  const PanelComponent = panelComponents[panel.id];

  return (
    <div
      className="floating-panel-frame"
      data-panel-id={panel.id}
      style={livingStyle}
      onPointerEnter={() => focusPanel(panel.id)}
      onPointerLeave={() => {
        if (!panel.expanded) focusPanel(undefined);
      }}
    >
      <motion.article
        className={clsx("floating-panel glass neon-edge", focused && "is-focused", panel.highlighted && "is-highlighted", panel.dimmed && "is-dimmed", panel.expanded && "is-expanded", panel.severity && `severity-${panel.severity}`)}
        aria-label={panel.title}
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: panel.dimmed ? 0.34 : 1, scale: focused ? 1.018 : 1 }}
        whileHover={{ scale: panel.expanded ? 1.01 : 1.025 }}
        whileTap={{ scale: 0.992 }}
        transition={{ type: "spring", stiffness: 260, damping: 30 }}
        onDoubleClick={() => expandPanel(panel.id, !panel.expanded)}
      >
        <header className="floating-panel__header">
          <div>
            <p className="floating-panel__eyebrow">{panel.kind}</p>
            <h2>{panel.title}</h2>
          </div>
          <button
            className="panel-icon-button"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              expandPanel(panel.id, !panel.expanded);
            }}
            aria-label={panel.expanded ? "Collapse panel" : "Expand panel"}
          >
            {panel.expanded ? "x" : "+"}
          </button>
        </header>
        <div className="floating-panel__body"><PanelComponent /></div>
      </motion.article>
    </div>
  );
}
