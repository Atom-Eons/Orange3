import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

interface Props {
  drawerId: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  width?: number;
}

export function DrawerShell({ drawerId, title, subtitle, children, width = 440 }: Props) {
  const activeDrawer = useAppStore((s) => s.activeDrawer);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const open = activeDrawer === drawerId;
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside className="drawer-shell glass neon-edge" style={{ width }} role="dialog" aria-modal="false" aria-label={title} initial={{ opacity: 0, x: 36 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 36 }}>
          <header className="drawer-shell__header"><div><strong>{title}</strong>{subtitle ? <span>{subtitle}</span> : null}</div><button type="button" aria-label="Close drawer" onClick={() => setDrawerOpen(undefined)}><X size={18} /></button></header>
          <div className="drawer-shell__body">{children}</div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
