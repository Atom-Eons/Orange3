import type { ReactNode } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";
import type { ModalId } from "../../types/app";

export function ProductDrawerShell({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);

  return (
    <motion.aside
      className="product-surface-drawer glass neon-edge"
      role="dialog"
      aria-modal="false"
      aria-label={title}
      initial={{ opacity: 0, x: 42, filter: "blur(10px)" }}
      animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, x: 42, filter: "blur(10px)" }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <header className="product-surface__header">
        <span className="product-surface__icon">{icon}</span>
        <div>
          <strong>{title}</strong>
          <em>{subtitle}</em>
        </div>
        <button type="button" aria-label="Close drawer" onClick={() => setDrawerOpen(undefined)}>
          <X size={18} />
        </button>
      </header>
      <div className="product-surface__body">{children}</div>
    </motion.aside>
  );
}

export function ProductModalShell({
  modalId,
  title,
  subtitle,
  icon,
  children,
}: {
  modalId: ModalId;
  title: string;
  subtitle: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const setModalOpen = useAppStore((s) => s.setModalOpen);

  return (
    <motion.section
      className={`product-surface-modal product-surface-modal--${modalId ?? "unknown"} glass neon-edge`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0, y: 20, scale: 0.94, filter: "blur(10px)" }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: 20, scale: 0.94, filter: "blur(10px)" }}
      transition={{ type: "spring", stiffness: 260, damping: 30 }}
    >
      <header className="product-surface__header">
        <span className="product-surface__icon">{icon}</span>
        <div>
          <strong>{title}</strong>
          <em>{subtitle}</em>
        </div>
        <button type="button" aria-label="Close modal" onClick={() => setModalOpen(undefined)}>
          <X size={18} />
        </button>
      </header>
      <div className="product-surface__body">{children}</div>
    </motion.section>
  );
}
