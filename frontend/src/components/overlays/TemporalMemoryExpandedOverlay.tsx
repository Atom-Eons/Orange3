import { AnimatePresence, motion } from "motion/react";
import { Clock, FastForward, Play, RotateCcw, Search, X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

export function TemporalMemoryExpandedOverlay() {
  const memoryPanel = useAppStore((s) => s.panels.find((panel) => panel.id === "memory-ribbon"));
  const timeline = useAppStore((s) => s.timeline);
  const focusPanel = useAppStore((s) => s.focusPanel);
  const setContextPanels = useAppStore((s) => s.setContextPanels);
  const setComposerValue = useAppStore((s) => s.setComposerValue);
  const expandPanel = useAppStore((s) => s.expandPanel);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);

  const open = Boolean(memoryPanel?.expanded);
  const events = timeline.slice(-12).reverse();

  return (
    <AnimatePresence>
      {open ? (
        <motion.section
          className={`temporal-expanded glass neon-edge ${activeMockupStateId === "22" ? "temporal-expanded--state-22" : ""}`}
          initial={{ opacity: 0, y: 24, scale: 0.96, filter: "blur(10px)" }}
          animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: 24, scale: 0.96, filter: "blur(10px)" }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          aria-label="Expanded temporal memory"
        >
          <header className="temporal-expanded__header">
            <div>
              <strong><Clock size={17} /> Temporal Memory</strong>
              <span>Timeline scrub, snapshots, rewind, and event replay</span>
            </div>
            <button type="button" aria-label="Close temporal memory" onClick={() => expandPanel("memory-ribbon", false)}>
              <X size={18} />
            </button>
          </header>

          <div className="temporal-expanded__search">
            <Search size={15} />
            <span>Search memory, timeline, decisions, artifacts...</span>
          </div>

          <div className="temporal-expanded__scrub">
            <button type="button"><RotateCcw size={14} /> Rewind</button>
            <button type="button"><Play size={14} /> Replay</button>
            <button type="button"><FastForward size={14} /> Forward</button>
          </div>

          <div className="temporal-expanded__track" aria-label="Memory events">
            {events.map((event, index) => (
              <button
                key={event.id}
                type="button"
                className={`temporal-expanded__event temporal-expanded__event--${event.severity}`}
                onClick={() => {
                  setContextPanels(event.relatedPanelIds);
                  focusPanel(event.relatedPanelIds[0]);
                  setComposerValue(`/timeline explain "${event.title}"`);
                }}
                style={{ "--event-index": index } as React.CSSProperties}
              >
                <i>{event.timeLabel}</i>
                <strong>{event.title}</strong>
                {event.description ? <span>{event.description}</span> : null}
                <em>{event.relatedPanelIds.slice(0, 3).join(" / ") || "global"}</em>
              </button>
            ))}
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
