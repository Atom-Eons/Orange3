import { applyStatePreset } from "./applyStatePreset";
import { statePresets } from "./statePresets";
import { useAppStore } from "../store/useAppStore";

export function StatePresetSwitcher() {
  const activeMockupStateId = useAppStore((state) => state.activeMockupStateId);

  if (!import.meta.env.DEV) return null;

  return (
    <label className="state-preset-switcher">
      <span>State Atlas</span>
      <select
        value={activeMockupStateId ?? ""}
        onChange={(event) => {
          if (event.target.value) applyStatePreset(event.target.value);
        }}
      >
        <option value="">State presets</option>
        {statePresets.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.id}. {preset.title}
          </option>
        ))}
      </select>
    </label>
  );
}
