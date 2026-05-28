import type { SystemMode } from "../types/app";

export interface ModeMotionProfile {
  corePulse: number;
  coreRotation: number;
  particleVelocity: number;
  streamVelocity: number;
  panelDrift: number;
  semanticLineOpacity: number;
  causalityOpacity: number;
  backgroundSaturation: number;
  textSharpness: number;
  glowIntensity: number;
  agentEnergy: number;
  transitionMs: number;
}

export const modeMotionProfiles: Record<SystemMode, ModeMotionProfile> = {
  calm: { corePulse: 0.45, coreRotation: 0.06, particleVelocity: 0.35, streamVelocity: 0.28, panelDrift: 0.45, semanticLineOpacity: 0.16, causalityOpacity: 0, backgroundSaturation: 1, textSharpness: 0.82, glowIntensity: 0.55, agentEnergy: 0.46, transitionMs: 700 },
  listening: { corePulse: 0.62, coreRotation: 0.08, particleVelocity: 0.42, streamVelocity: 0.36, panelDrift: 0.32, semanticLineOpacity: 0.2, causalityOpacity: 0, backgroundSaturation: 1.08, textSharpness: 0.88, glowIntensity: 0.72, agentEnergy: 0.6, transitionMs: 420 },
  thinking: { corePulse: 0.88, coreRotation: 0.13, particleVelocity: 0.65, streamVelocity: 0.78, panelDrift: 0.25, semanticLineOpacity: 0.3, causalityOpacity: 0.22, backgroundSaturation: 1.18, textSharpness: 0.9, glowIntensity: 0.9, agentEnergy: 0.86, transitionMs: 360 },
  generating: { corePulse: 1, coreRotation: 0.16, particleVelocity: 0.88, streamVelocity: 0.98, panelDrift: 0.5, semanticLineOpacity: 0.26, causalityOpacity: 0.16, backgroundSaturation: 1.35, textSharpness: 0.86, glowIntensity: 1, agentEnergy: 0.96, transitionMs: 320 },
  analyzing: { corePulse: 0.82, coreRotation: 0.11, particleVelocity: 0.58, streamVelocity: 0.72, panelDrift: 0.24, semanticLineOpacity: 0.38, causalityOpacity: 0.34, backgroundSaturation: 1.16, textSharpness: 0.96, glowIntensity: 0.84, agentEnergy: 0.8, transitionMs: 380 },
  alert: { corePulse: 1, coreRotation: 0.18, particleVelocity: 0.95, streamVelocity: 1, panelDrift: 0.14, semanticLineOpacity: 0.18, causalityOpacity: 1, backgroundSaturation: 1.42, textSharpness: 0.98, glowIntensity: 1, agentEnergy: 1, transitionMs: 240 },
  deploying: { corePulse: 0.9, coreRotation: 0.14, particleVelocity: 0.72, streamVelocity: 0.9, panelDrift: 0.34, semanticLineOpacity: 0.28, causalityOpacity: 0.18, backgroundSaturation: 1.22, textSharpness: 0.9, glowIntensity: 0.92, agentEnergy: 0.9, transitionMs: 360 },
  reviewing: { corePulse: 0.56, coreRotation: 0.04, particleVelocity: 0.22, streamVelocity: 0.22, panelDrift: 0.1, semanticLineOpacity: 0.24, causalityOpacity: 0.12, backgroundSaturation: 0.94, textSharpness: 1, glowIntensity: 0.62, agentEnergy: 0.52, transitionMs: 520 },
};

export function getModeMotionProfile(mode: SystemMode) {
  return modeMotionProfiles[mode] ?? modeMotionProfiles.calm;
}
