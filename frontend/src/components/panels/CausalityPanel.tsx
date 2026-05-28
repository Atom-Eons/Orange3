import { useAppStore } from "../../store/useAppStore";

export function CausalityPanel() {
  const path = useAppStore((s) => s.activeCausalPath);
  if (!path) {
    return <p className="panel-note">No active causal path. Trigger an anomaly or ask about latency to reveal the chain.</p>;
  }
  const confidence = Math.round(path.confidence * 100);
  return (
    <div className="causal-investigation">
      <header>
        <div>
          <strong>{path.title}</strong>
          <span>Why is latency high in us-east-1?</span>
        </div>
        <button type="button">View full analysis</button>
      </header>

      <div className="causal-list">
        {path.nodes.map((node, index) => (
          <div key={node.id} className={`causal-node causal-node--${node.severity}`}>
            <span>{index + 1}</span>
            <p>{node.label}</p>
          </div>
        ))}
      </div>

      <footer>
        <span>Confidence</span>
        <div><i style={{ width: `${confidence}%` }} /></div>
        <strong>{confidence}%</strong>
      </footer>
    </div>
  );
}
