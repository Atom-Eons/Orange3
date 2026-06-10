import { loadWaveRegistry } from "./tool-registry";

export const REQUIRED_V3_WAVE_IDS = [
  "phase-0",
  "phase-1",
  "phase-2",
  "phase-3",
  "phase-4",
  "phase-5",
  "phase-6",
  "phase-7",
  "phase-8",
  "phase-9",
  "phase-10",
  "phase-11",
  "phase-12",
  "phase-13",
  "phase-14",
  "phase-15",
] as const;

export const REQUIRED_TOOLMESH_WAVE_IDS = ["y0", "y1", "y2", "y3", "y4", "y5", "y6", "y7", "y8", "y9"] as const;

export function validateWaveRegistry() {
  const registry = loadWaveRegistry();
  const v3Ids = new Set(registry.preserved_v3_waves.map((wave) => wave.id));
  const toolmeshIds = new Set(registry.toolmesh_waves.map((wave) => wave.id));
  const missingV3 = REQUIRED_V3_WAVE_IDS.filter((id) => !v3Ids.has(id));
  const missingToolmesh = REQUIRED_TOOLMESH_WAVE_IDS.filter((id) => !toolmeshIds.has(id));
  return {
    ok: missingV3.length === 0 && missingToolmesh.length === 0,
    preservedV3Count: registry.preserved_v3_waves.length,
    toolmeshCount: registry.toolmesh_waves.length,
    missingV3,
    missingToolmesh,
  };
}
