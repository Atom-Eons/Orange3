export function RiskMeter({ risk }: { risk: "low" | "medium" | "high" | string }) {
  const value = risk === "high" ? 92 : risk === "medium" ? 58 : 24;
  return (
    <div className={`risk-meter risk-meter--${risk}`}>
      <div className="risk-meter__dial"><span style={{ transform: `rotate(${value * 1.8 - 90}deg)` }} /></div>
      <div><em>Risk</em><strong>{risk}</strong></div>
    </div>
  );
}
