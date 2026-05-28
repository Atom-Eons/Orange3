import { Bot, BrainCircuit, Rocket, ShieldCheck, Sparkles } from "lucide-react";
import type { CSSProperties } from "react";
import type { AgentId } from "../../types/app";
import { useAppStore } from "../../store/useAppStore";

const agentMeta: Record<AgentId, { position: { x: number; y: number }; icon: typeof Bot; caption: string }> = {
  builder: { position: { x: 47, y: 22 }, icon: Sparkles, caption: "Generating assets" },
  watcher: { position: { x: 36, y: 35 }, icon: ShieldCheck, caption: "Monitoring systems" },
  analyst: { position: { x: 63, y: 41 }, icon: BrainCircuit, caption: "Detecting patterns" },
  memory: { position: { x: 38, y: 53 }, icon: Bot, caption: "Storing context" },
  deploy: { position: { x: 63, y: 58 }, icon: Rocket, caption: "Preparing release" },
};

const state37AgentMeta: Record<AgentId, { position: { x: number; y: number }; icon: typeof Bot; caption: string }> = {
  builder: { position: { x: 46.2, y: 13.3 }, icon: Sparkles, caption: "Generating assets" },
  watcher: { position: { x: 34.2, y: 28.8 }, icon: ShieldCheck, caption: "Monitoring systems" },
  analyst: { position: { x: 61.8, y: 38.5 }, icon: BrainCircuit, caption: "Detecting patterns" },
  memory: { position: { x: 34.3, y: 44.4 }, icon: Bot, caption: "Storing context" },
  deploy: { position: { x: 62.2, y: 51.4 }, icon: Rocket, caption: "Preparing release" },
};

export function AgentConstellation() {
  const agents = useAppStore((s) => s.agents);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);
  const metaByAgent = activeMockupStateId === "06" || activeMockupStateId === "37" ? state37AgentMeta : agentMeta;

  return (
    <div className="agent-constellation" aria-hidden="true">
      {agents.map((agent) => {
        const meta = metaByAgent[agent.id];
        const Icon = meta.icon;

        return (
          <div
            key={agent.id}
            className={`agent-constellation__node agent-constellation__node--${agent.state}`}
            style={{ left: `${meta.position.x}%`, top: `${meta.position.y}%`, "--agent-energy": agent.energy } as CSSProperties}
          >
            <span><Icon size={18} /></span>
            <div>
              <strong>{agent.label} Agent</strong>
              <em>{meta.caption}</em>
            </div>
          </div>
        );
      })}
    </div>
  );
}
