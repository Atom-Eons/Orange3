import { GitBranch, Layers, Sparkles } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

export function ProjectNexusPanel() {
  const tasks = useAppStore((s) => s.tasks);
  const artifacts = useAppStore((s) => s.artifacts);
  return (
    <div className="panel-stack">
      <div className="project-map" aria-hidden="true">
        {Array.from({ length: 9 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div className="nexus-ring">
        <span><Sparkles size={15} /> Core active</span>
        <span><GitBranch size={15} /> {tasks.length} tasks</span>
        <span><Layers size={15} /> {artifacts.length} artifacts</span>
      </div>
      <p className="panel-note">Project Nexus binds active panels, agents, memory, and generated artifacts into one command surface.</p>
    </div>
  );
}
