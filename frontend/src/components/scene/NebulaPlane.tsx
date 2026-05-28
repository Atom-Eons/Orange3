import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useAppStore } from "../../store/useAppStore";

export function NebulaPlane() {
  const mesh = useRef<THREE.Mesh>(null);
  const mode = useAppStore((s) => s.mode);
  const energy = useAppStore((s) => s.energy);

  useFrame(({ clock }) => {
    if (!mesh.current) return;
    const t = clock.elapsedTime;
    mesh.current.rotation.z = Math.sin(t * 0.035) * 0.05;
    const scale = mode === "generating" ? 1.18 : mode === "alert" ? 1.12 : mode === "listening" ? 1.08 : 1.04 + energy * 0.04;
    mesh.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={mesh} position={[0, 0, -2.8]}>
      <planeGeometry args={[13, 8, 1, 1]} />
      <meshBasicMaterial transparent opacity={0.24} depthWrite={false} blending={THREE.AdditiveBlending} color={mode === "alert" ? "#ff8a32" : mode === "generating" ? "#f044ff" : "#2ffcff"} />
    </mesh>
  );
}
