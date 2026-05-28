import { GitCompare } from "lucide-react";
import type { ModelComparison } from "../../engine/modelComparison";

export function ModelComparisonView({ comparison }: { comparison: ModelComparison }) {
  return (
    <article className="model-comparison-view">
      <header><GitCompare size={17} /><div><strong>Model Comparison</strong><span>{comparison.currentLabel} vs {comparison.candidateLabel}</span></div></header>
      <table>
        <thead><tr><th>Metric</th><th>{comparison.currentLabel}</th><th>{comparison.candidateLabel}</th><th>Delta</th></tr></thead>
        <tbody>
          {comparison.metrics.map((metric) => (
            <tr key={metric.label}>
              <td>{metric.label}</td>
              <td className={metric.winner === "current" ? "is-winner" : ""}>{metric.current}</td>
              <td className={metric.winner === "candidate" ? "is-winner" : ""}>{metric.candidate}</td>
              <td>{metric.delta ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section><strong>Recommendation</strong><p>{comparison.recommendation}</p></section>
    </article>
  );
}
