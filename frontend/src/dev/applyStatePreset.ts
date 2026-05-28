import { getStatePreset, statePresets } from "./statePresets";

export function applyStatePreset(id: string | number) {
  const preset = getStatePreset(id);
  preset.apply();
  return preset;
}

export function getStatePresetRegistry() {
  return statePresets;
}
