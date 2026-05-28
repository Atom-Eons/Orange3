import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useAppStore } from "../../store/useAppStore";

function iconForSeverity(severity: string) {
  if (severity === "success") return CheckCircle2;
  if (severity === "warning") return AlertTriangle;
  if (severity === "critical") return XCircle;
  return Info;
}

export function EventToastLayer() {
  const eventToasts = useAppStore((s) => s.eventToasts);
  const dismissEventToast = useAppStore((s) => s.dismissEventToast);
  useEffect(() => {
    const timers = eventToasts.map((toast) => window.setTimeout(() => dismissEventToast(toast.id), 4600));
    return () => timers.forEach(window.clearTimeout);
  }, [eventToasts, dismissEventToast]);
  return (
    <div className="event-toast-layer">
      <AnimatePresence>
        {eventToasts.map((toast) => {
          const Icon = iconForSeverity(toast.severity);
          return (
            <motion.article key={toast.id} className={`event-toast event-toast--${toast.severity}`} initial={{ opacity: 0, x: 24, scale: 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 24, scale: 0.96 }}>
              <span><Icon size={16} /></span>
              <div><strong>{toast.title}</strong>{toast.description ? <p>{toast.description}</p> : null}</div>
            </motion.article>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
