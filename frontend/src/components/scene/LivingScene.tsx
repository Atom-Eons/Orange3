import { Canvas } from "@react-three/fiber";
import { CoreOrb } from "./CoreOrb";
import { ParticleField } from "./ParticleField";
import { EnergyStreams } from "./EnergyStreams";
import { AgentOrbitals } from "./AgentOrbitals";
import { NebulaPlane } from "./NebulaPlane";
import { SynestheticStream } from "./SynestheticStream";

export function LivingScene() {
  return (
    <div className="living-scene">
      <Canvas
        camera={{ position: [0, 0, 9], fov: 46 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.35} />
        <pointLight position={[0, 0, 4]} intensity={2.4} color="#2ffcff" />
        <pointLight position={[-4, 2, 3]} intensity={1.1} color="#8b5cff" />
        <pointLight position={[4, -2, 2]} intensity={1.2} color="#ffbf48" />
        <NebulaPlane />
        <ParticleField />
        <EnergyStreams />
        <CoreOrb />
        <AgentOrbitals />
        <SynestheticStream />
      </Canvas>
    </div>
  );
}
