import { Bell } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import { ProductDrawerShell } from "./SurfaceShell";

export function NotificationsDrawer() {
  const eventToasts = useAppStore((s) => s.eventToasts);
  const timeline = useAppStore((s) => s.timeline);
  const items = eventToasts.length
    ? eventToasts.map((toast) => ({ id: toast.id, title: toast.title, description: toast.description, severity: toast.severity, label: "toast" }))
    : timeline.slice(-8).reverse().map((event) => ({ id: event.id, title: event.title, description: event.description, severity: event.severity, label: event.type }));

  return (
    <ProductDrawerShell title="Notifications" subtitle="Alerts, task completions, tool results, and workspace events" icon={<Bell size={18} />}>
      <div className="surface-card-list">
        {items.map((item) => (
          <article key={item.id} className={`surface-card surface-card--${item.severity}`}>
            <i>{item.label}</i>
            <strong>{item.title}</strong>
            {item.description ? <span>{item.description}</span> : null}
          </article>
        ))}
      </div>
    </ProductDrawerShell>
  );
}
