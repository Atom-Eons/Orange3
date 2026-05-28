import { Box, CheckCircle2, Hexagon, Rocket, ShieldCheck } from "lucide-react";
import { useAppStore } from "../../store/useAppStore";

export function PipelineOrchestratorPanel() {
  const metrics = useAppStore((s) => s.metrics);
  const setMode = useAppStore((s) => s.setMode);
  return (
    <div className="panel-stack">
      <div className="pipeline-flow">
        <span><Hexagon size={15} />Ingest<em>Running</em></span>
        <span><Box size={15} />Process<em>Running</em></span>
        <span><ShieldCheck size={15} />Validate<em>Running</em></span>
        <span><Rocket size={15} />Deploy<em>Queued</em></span>
      </div>
      <div className="pipeline-stats">
        <div><span>Success Rate</span><strong>{metrics.pipelineSuccess.toFixed(1)}%</strong></div>
        <div><span>Avg Latency</span><strong>{metrics.latencyMs.toFixed(0)}ms</strong></div>
        <div><span>Last Run</span><strong>2m ago</strong></div>
      </div>
      <div className="pipeline-step is-active"><CheckCircle2 size={15} /> Canary model v2.4</div>
      <button type="button" className="panel-command" onClick={() => setMode("deploying")}>Prime deploy mode</button>
    </div>
  );
}
