import {
  Bell,
  Bot,
  Box,
  CloudMoon,
  Database,
  FileText,
  Folder,
  GitBranch,
  Home,
  LayoutDashboard,
  PackageCheck,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

const navItems = [
  { label: "Home", icon: Home, action: "dashboard" },
  { label: "Projects", icon: Folder, action: "dashboard" },
  { label: "Datasets", icon: Database, action: "dashboard" },
  { label: "Models", icon: Box, action: "model-selector" },
  { label: "Pipelines", icon: GitBranch, action: "dashboard" },
  { label: "Deployments", icon: PackageCheck, action: "approval" },
  { label: "Monitoring", icon: ShieldCheck, action: "dashboard" },
  { label: "Agents", icon: Bot, action: "agent-queue" },
  { label: "Memory", icon: Database, action: "memory" },
  { label: "Alerts", icon: Bell, action: "notifications", badge: 3 },
  { label: "Reports", icon: FileText, action: "artifact-inspector" },
  { label: "Settings", icon: Settings, action: "settings" },
] as const;

export function LeftRail() {
  const setWorkspaceView = useAppStore((s) => s.setWorkspaceView);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const workspaceView = useAppStore((s) => s.workspaceView);

  const runAction = (action: (typeof navItems)[number]["action"]) => {
    if (action === "dashboard") {
      setWorkspaceView(action);
      return;
    }

    if (["agent-queue", "memory", "notifications", "artifact-inspector", "settings"].includes(action)) {
      setDrawerOpen(action as never);
      return;
    }

    setModalOpen(action as never);
  };

  return (
    <nav className="left-rail glass" aria-label="Primary">
      <header className="left-rail__brand">
        <span className="left-rail__logo"><Sparkles size={24} /></span>
        <div>
          <strong>AE See-Suite</strong>
          <em><span /> System Online</em>
        </div>
      </header>

      <div className="left-rail__nav">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.action === "dashboard" && workspaceView === "dashboard" && item.label === "Home";

          return (
            <button
              key={item.label}
              type="button"
              className={active ? "is-active" : ""}
              aria-label={item.label}
              onClick={() => runAction(item.action)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {"badge" in item ? <b>{item.badge}</b> : null}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        className="left-rail__command"
        aria-label="Open command palette"
        onClick={() => useAppStore.getState().setCommandPaletteOpen(true)}
      >
        <LayoutDashboard size={17} />
        <span>Command</span>
      </button>

      <footer className="left-rail__footer">
        <div className="left-rail__user">
          <span>A</span>
          <div>
            <strong>Aetherion</strong>
            <em>Platform Admin</em>
          </div>
        </div>
        <div className="left-rail__weather">
          <CloudMoon size={24} />
          <div>
            <span>San Francisco, US</span>
            <strong>18°C</strong>
          </div>
        </div>
      </footer>
    </nav>
  );
}
