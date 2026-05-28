import { mockupStateBank } from "../engine/mockupStateBank";
import { applyMockupState } from "../engine/mockupStateRuntime";

export type StatePresetGroup =
  | "core-mode"
  | "panel-focus"
  | "chat"
  | "drawer-modal"
  | "scenario"
  | "canvas-memory";

export interface StatePreset {
  id: string;
  title: string;
  group: StatePresetGroup;
  mockupFile: string;
  file: string;
  description: string;
  apply: () => void;
  acceptance: string[];
}

function groupForState(id: string): StatePresetGroup {
  const numericId = Number(id);

  if (numericId <= 12) return "core-mode";
  if (numericId <= 24) return "panel-focus";
  if (numericId <= 36) return "chat";
  if (numericId <= 48) return "drawer-modal";
  if (numericId <= 60) return "scenario";
  return "canvas-memory";
}

function acceptanceForState(id: string, focus: string[]) {
  const group = groupForState(id);
  const base = [
    "Same AppShell remains mounted",
    "Mockup state is reachable by Zustand/app state",
    "No mockup image is rendered as UI",
  ];

  if (group === "core-mode") {
    return [
      ...base,
      "System mode, core energy, panel priority, and chat surface reflect the preset",
      "Ambient motion stays state-driven",
    ];
  }

  if (group === "panel-focus") {
    return [
      ...base,
      "Focused or expanded panel becomes primary",
      "Connected/context panels remain secondary",
      "Composer context chips reflect the focused panel family",
    ];
  }

  if (group === "chat") {
    return [
      ...base,
      "Composer, slash menu, command palette, messages, plan preview, or modal state matches the preset",
      "Keyboard-triggered surfaces remain usable",
    ];
  }

  if (group === "drawer-modal") {
    return [
      ...base,
      "Drawer or modal floats above the dashboard without replacing it",
      "Underlying dashboard remains recessed and readable",
    ];
  }

  if (group === "scenario") {
    return [
      ...base,
      "Operational scenario is reachable from stream-like state events",
      "Agents, causality, timeline, and action surfaces tell one story",
    ];
  }

  return [
    ...base,
    "Canvas, artifact, memory, or creation surface becomes primary",
    "Chat dock remains available as command surface",
    `Focus targets active: ${focus.join(", ") || "global"}`,
  ];
}

function applyPresetById(id: string) {
  applyMockupState(id);
}

export const statePresets: StatePreset[] = mockupStateBank.map((state) => ({
  id: state.id,
  title: state.title,
  group: groupForState(state.id),
  mockupFile: state.file,
  file: state.file,
  description: state.subtitle,
  apply: () => applyPresetById(state.id),
  acceptance: acceptanceForState(state.id, state.focus),
}));

export function getStatePreset(id?: string | number) {
  const normalized = String(id ?? "01").padStart(2, "0");
  return statePresets.find((preset) => preset.id === normalized) ?? statePresets[0];
}
