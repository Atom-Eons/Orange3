import { Line } from "@react-three/drei";
import { useMemo } from "react";
import { useAppStore } from "../../store/useAppStore";

export function EnergyStreams() {
  const mode = useAppStore((s) => s.mode);
  const curves = useMemo(
    () =>
      Array.from({ length: 22 }, (_, i) => {
        const a = (i / 22) * Math.PI * 2;
        const r = 3.2 + (i % 5) * 0.42;
        return {
          id: i,
          color: i % 3 === 0 ? "#2ffcff" : i % 3 === 1 ? "#8b5cff" : "#ffbf48",
          points: Array.from({ length: 48 }, (_, j) => {
            const p = j / 47;
            const angle = a + p * Math.PI * (mode === "generating" || mode === "deploying" ? 1.95 : 1.32);
            const taper = 1 - p * 0.72;
            const wave = Math.sin(p * Math.PI * 3 + i) * 0.18;
            return [Math.cos(angle) * (r + wave) * taper, Math.sin(angle) * (r + wave) * taper, -0.65 + p * 1.15] as [number, number, number];
          }),
        };
      }),
    [mode],
  );

  return (
    <group>
      {curves.map((curve) => (
        <Line key={curve.id} points={curve.points} color={mode === "alert" ? "#ff8a32" : curve.color} lineWidth={1.45} transparent opacity={mode === "alert" ? 0.66 : 0.42} />
      ))}
    </group>
  );
}
