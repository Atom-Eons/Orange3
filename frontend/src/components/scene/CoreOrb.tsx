import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { getModeMotionProfile } from "../../engine/motionTokens";
import { useAppStore } from "../../store/useAppStore";

export function CoreOrb() {
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Mesh>(null);
  const ringA = useRef<THREE.Mesh>(null);
  const ringB = useRef<THREE.Mesh>(null);
  const ringC = useRef<THREE.Mesh>(null);
  const mode = useAppStore((s) => s.mode);
  const energy = useAppStore((s) => s.energy);
  const activeMockupStateId = useAppStore((s) => s.activeMockupStateId);

  useFrame(({ clock }) => {
    const profile = getModeMotionProfile(mode);
    const t = clock.elapsedTime;
    const sourceRaisedCore = activeMockupStateId === "06" || activeMockupStateId === "37";
    if (group.current) {
      group.current.rotation.z = t * profile.coreRotation * 0.82;
      const s = 1 + Math.sin(t * (1.8 + profile.corePulse)) * 0.06 * energy;
      group.current.position.set(sourceRaisedCore ? -0.06 : 0, sourceRaisedCore ? 1.42 : 0, 0);
      group.current.scale.setScalar(s * (sourceRaisedCore ? 0.72 : 1));
    }
    if (ringA.current) ringA.current.rotation.z = t * (0.2 + profile.coreRotation);
    if (ringB.current) ringB.current.rotation.y = t * (0.16 + profile.coreRotation);
    if (ringC.current) ringC.current.rotation.x = t * (0.13 + profile.coreRotation);
    if (inner.current) {
      const material = inner.current.material as THREE.MeshBasicMaterial;
      material.opacity = 0.72 + energy * 0.2;
      material.color.set(mode === "alert" ? "#ff8a32" : mode === "deploying" ? "#38ffb3" : "#2ffcff");
    }
  });

  return (
    <group ref={group}>
      <pointLight intensity={mode === "alert" ? 3.2 : 2.6 + energy * 1.2} distance={7} color={mode === "alert" ? "#ff8a32" : "#2ffcff"} />
      <mesh rotation={[0, 0, 0]}>
        <circleGeometry args={[1.18, 96]} />
        <meshBasicMaterial color={mode === "alert" ? "#ff8a32" : "#2ffcff"} transparent opacity={0.04 + energy * 0.045} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh rotation={[0, 0, 0]}>
        <circleGeometry args={[0.68, 96]} />
        <meshBasicMaterial color={mode === "generating" ? "#f044ff" : "#8b5cff"} transparent opacity={0.13 + energy * 0.05} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={inner}>
        <sphereGeometry args={[0.18, 64, 64]} />
        <meshBasicMaterial transparent opacity={0.85} color="#2ffcff" depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.38, 64, 64]} />
        <meshBasicMaterial color={mode === "alert" ? "#ff3b5f" : "#8b5cff"} transparent opacity={0.2} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.68, 64, 64]} />
        <meshBasicMaterial color={mode === "deploying" ? "#38ffb3" : "#f044ff"} transparent opacity={0.055} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringA} rotation={[0.55, 0.1, 0]}>
        <torusGeometry args={[0.92, 0.012, 12, 180]} />
        <meshBasicMaterial color={mode === "deploying" ? "#38ffb3" : "#2ffcff"} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringB} rotation={[-0.35, 0.75, 0]}>
        <torusGeometry args={[1.28, 0.009, 12, 180]} />
        <meshBasicMaterial color={mode === "alert" ? "#ffbf48" : "#8b5cff"} transparent opacity={0.36} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={ringC} rotation={[0.2, -0.65, 0.85]}>
        <torusGeometry args={[1.58, 0.007, 12, 180]} />
        <meshBasicMaterial color={mode === "alert" ? "#ff8a32" : "#f044ff"} transparent opacity={0.26} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      {Array.from({ length: 10 }, (_, index) => {
        const angle = (index / 10) * Math.PI * 2;
        const radius = index % 2 === 0 ? 1.18 : 1.48;
        return (
          <mesh key={index} position={[Math.cos(angle) * radius, Math.sin(angle) * radius * 0.66, (index % 3) * 0.12 - 0.12]}>
            <sphereGeometry args={[0.025 + (index % 3) * 0.006, 12, 12]} />
            <meshBasicMaterial color={index % 2 === 0 ? "#2ffcff" : "#f044ff"} transparent opacity={0.75} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        );
      })}
    </group>
  );
}
