import { WandSparkles } from "lucide-react";
import { handleSubmitCommand } from "../../engine/taskRunner";
import { useAppStore } from "../../store/useAppStore";

export function SmartSuggestionsPanel() {
  const activeCausalPath = useAppStore((s) => s.activeCausalPath);
  const suggestions = activeCausalPath
    ? [
        { title: "Optimize inference service", subtitle: "Potential latency reduction", value: "32%", tone: "info" },
        { title: "Retrain churn model", subtitle: "Data drift impact high", value: "High", tone: "warning" },
        { title: "Shift traffic east", subtitle: "Gateway pressure relief", value: "18%", tone: "success" },
      ]
    : [
        { title: "Analyze workspace state", subtitle: "Map active dependencies", value: "Ready", tone: "info" },
        { title: "Generate deployment report", subtitle: "Create artifact branch", value: "New", tone: "success" },
        { title: "Review model drift", subtitle: "Compare current to canary", value: "8m", tone: "warning" },
      ];
  return (
    <div className="suggestion-list">
      {suggestions.map((suggestion) => (
        <button key={suggestion.title} type="button" className={`suggestion-card suggestion-card--${suggestion.tone}`} onClick={() => handleSubmitCommand(suggestion.title)}>
          <span><WandSparkles size={14} /></span>
          <strong>{suggestion.title}</strong>
          <em>{suggestion.subtitle}</em>
          <b>{suggestion.value}</b>
        </button>
      ))}
      <button type="button" className="suggestion-apply" onClick={() => handleSubmitCommand("Apply recommended remediation plan")}>
        Apply All
      </button>
    </div>
  );
}
