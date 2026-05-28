import { AlertTriangle, Box, CheckCircle2, Database, Rocket } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { TimelineEvent } from "../../types/app";

function iconForEvent(event: TimelineEvent) {
  if (event.severity === "warning" || event.severity === "critical") return AlertTriangle;
  if (event.type === "deployment") return Rocket;
  if (event.type === "pipeline") return Database;
  if (event.type === "memory") return Box;
  return CheckCircle2;
}

export function ActivityFeedPanel() {
  const timeline = useAppStore((s) => s.timeline);
  return (
    <div className="feed-list">
      {timeline.slice(-5).reverse().map((event) => {
        const Icon = iconForEvent(event);
        return (
          <article key={event.id} className={`feed-item feed-item--${event.severity}`}>
            <span className="feed-item__icon"><Icon size={15} /></span>
            <div>
              <strong>{event.title}</strong>
              <em>{event.description ?? event.type}</em>
            </div>
            <span>{event.timeLabel}</span>
          </article>
        );
      })}
    </div>
  );
}
