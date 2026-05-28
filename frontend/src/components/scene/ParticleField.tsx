import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { getModeMotionProfile } from "../../engine/motionTokens";
import { useAppStore } from "../../store/useAppStore";

export function ParticleField() {
  const points = useRef<THREE.Points>(null);
  const mode = useAppStore((s) => s.mode);
  const energy = useAppStore((s) => s.energy);
  const positions = useMemo(() => {
    const count = 1500;
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 1.8 + Math.random() * 6.2;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      array[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      array[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      array[i * 3 + 2] = radius * Math.cos(phi) * 0.45;
    }
    return array;
  }, []);

  useFrame(({ clock }) => {
    if (!points.current) return;
    const profile = getModeMotionProfile(mode);
    points.current.rotation.z = clock.elapsedTime * 0.015 * profile.particleVelocity * (1 + energy);
    points.current.rotation.x = Math.sin(clock.elapsedTime * 0.08) * 0.06;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={mode === "alert" ? "#ffbf48" : "#8ee3ff"} size={0.02} transparent opacity={0.78} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}
