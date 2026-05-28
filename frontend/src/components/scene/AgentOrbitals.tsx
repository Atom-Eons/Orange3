import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { useAppStore } from "../../store/useAppStore";

export function AgentOrbitals() {
  const group = useRef<THREE.Group>(null);
  const agents = useAppStore((s) => s.agents);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.children.forEach((child, index) => {
      const agent = agents[index];
      if (!agent) return;
      const speed = agent.state === "working" ? 0.5 : agent.state === "thinking" ? 0.34 : 0.16;
      const angle = agent.orbitAngle + clock.elapsedTime * speed;
      child.position.set(Math.cos(angle) * agent.orbitRadius, Math.sin(angle) * agent.orbitRadius, 0.5 + Math.sin(angle * 2) * 0.18);
      child.scale.setScalar(0.7 + agent.energy * 0.55);
    });
  });

  return (
    <group ref={group}>
      {agents.map((agent) => (
        <mesh key={agent.id}>
          <sphereGeometry args={[0.075, 16, 16]} />
          <meshBasicMaterial color={agent.state === "blocked" ? "#ffbf48" : agent.state === "complete" ? "#38ffb3" : "#2ffcff"} transparent opacity={0.88} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
      ))}
    </group>
  );
}
