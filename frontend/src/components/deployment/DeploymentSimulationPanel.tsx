import { Rocket, ShieldAlert } from "lucide-react";
import { RiskMeter } from "./RiskMeter";
import type { DeploymentSimulationResult } from "../../engine/deploymentSimulation";

export function DeploymentSimulationPanel({ result }: { result: DeploymentSimulationResult }) {
  return (
    <article className="deployment-simulation">
      <header><span><Rocket size={17} /></span><div><strong>Deployment Simulation</strong><em>{String(result.recommended)}</em></div></header>
      <RiskMeter risk={result.risk} />
      <div className="deployment-simulation__stats">
        <div><em>Latency Impact</em><strong>{result.estimatedLatencyChange ?? "unknown"}</strong></div>
        <div><em>Recommendation</em><strong>{String(result.recommended)}</strong></div>
      </div>
      <section><h4><ShieldAlert size={15} />Rollout guidance</h4><p>{result.suggestedRollout ?? "No rollout guidance returned."}</p></section>
    </article>
  );
}
