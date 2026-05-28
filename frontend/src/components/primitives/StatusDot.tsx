export function StatusDot({ tone = "idle" }: { tone?: "idle" | "success" | "warning" | "critical" }) {
  return <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />;
}
