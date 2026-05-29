import { Clock, FastForward, Play, RotateCcw } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

export function TemporalMemoryRibbon() {
  const timeline = useAppStore((s) => s.timeline);
  const expandPanel = useAppStore((s) => s.expandPanel);
  const setMode = useAppStore((s) => s.setMode);
  const setContextPanels = useAppStore((s) => s.setContextPanels);
  const events = timeline.slice(-7);

  return (
    <button
      type="button"
      className="temporal-memory-ribbon glass"
      onClick={() => {
        expandPanel("memory-ribbon", true);
        setMode("reviewing");
        setContextPanels(["memory-ribbon", "activity-feed", "causality"]);
      }}
    >
      <span className="temporal-memory-ribbon__label"><Clock size={15} /> Temporal Memory</span>
      <span className="temporal-memory-ribbon__track">
        {events.map((event) => (
          <span key={event.id} className={`memory-tick memory-tick--${event.severity}`}>
            <i />
            <strong>{event.title}</strong>
            <em>{event.timeLabel}</em>
          </span>
        ))}
      </span>
      <span className="temporal-memory-ribbon__controls">
        <RotateCcw size={12} /> Rewind
        <Play size={12} /> Play
        <FastForward size={12} /> Fast Forward
      </span>
    </button>
  );
}
