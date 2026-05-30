import {
  Bell,
  Box,
  BrainCircuit,
  Command,
  Crosshair,
  GitBranch,
  Orbit,
  Plus,
  Radio,
  Rocket,
} from "lucide-react";
import type { SystemMode } from "../../types/app";
import { useAppStore } from "../../store/useAppStore";

const items: Array<{ label: string; mode: SystemMode; composer: "fast" | "deep" | "creative" | "agent"; icon: typeof Orbit }> = [
  { label: "Observe", mode: "calm", composer: "fast", icon: Crosshair },
  { label: "Understand", mode: "analyzing", composer: "deep", icon: GitBranch },
  { label: "Build", mode: "generating", composer: "creative", icon: Box },
  { label: "Deploy", mode: "deploying", composer: "agent", icon: Rocket },
  { label: "Evolve", mode: "thinking", composer: "agent", icon: Orbit },
];

export function TopModeRail() {
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const setSelectedMode = useAppStore((s) => s.setSelectedMode);
  const setDrawerOpen = useAppStore((s) => s.setDrawerOpen);
  const setModalOpen = useAppStore((s) => s.setModalOpen);
  const setCommandPaletteOpen = useAppStore((s) => s.setCommandPaletteOpen);
  const agents = useAppStore((s) => s.agents);
  const activeAgents = agents.filter((agent) => ["thinking", "working", "blocked"].includes(agent.state)).length;

  return (
    <>
      <header className="top-mode-rail glass">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <button
              key={item.mode}
              type="button"
              className={mode === item.mode ? "is-active" : ""}
              onClick={() => {
                setMode(item.mode);
                setSelectedMode(item.composer);
              }}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </header>

      <aside className="top-command-cluster">
        <button type="button" className="top-command-cluster__shortcut glass" onClick={() => setCommandPaletteOpen(true)}>
          <Command size={15} />
          <span>K</span>
        </button>
        <button type="button" className="top-command-cluster__icon glass" aria-label="Live stream" onClick={() => setModalOpen("context-picker")}>
          <Radio size={17} />
        </button>
        <button type="button" className="top-command-cluster__queue glass" onClick={() => setDrawerOpen("agent-queue")}>
          <BrainCircuit size={17} />
          <span>Agent Queue</span>
          <b>{Math.max(4, activeAgents)}</b>
        </button>
        <button type="button" className="top-command-cluster__icon glass" aria-label="Notifications" onClick={() => setDrawerOpen("notifications")}>
          <Bell size={17} />
          <b>8</b>
        </button>
        <button type="button" className="top-command-cluster__create glass" aria-label="Create" onClick={() => setModalOpen("add-widget")}>
          <Plus size={20} />
        </button>
      </aside>
    </>
  );
}
