import fs from "node:fs";
import path from "node:path";
import { readJson, v3Root } from "../lib/core";
import type { ToolCard, ToolMeshLab } from "./tool-card.schema";

export const toolmeshRoot = path.join(v3Root, "free-alpha-toolmesh");
export const toolCardsRoot = path.join(toolmeshRoot, "tool-cards");
export const registriesRoot = path.join(toolmeshRoot, "registries");
export const benchmarksRoot = path.join(toolmeshRoot, "benchmarks");
export const freeToolStackRegistryPath = path.join(registriesRoot, "free-tool-stack.registry.json");
export const v3WaveRegistryPath = path.join(registriesRoot, "v3-wave-registry.json");

export type ToolStackRegistry = {
  schema_version: string;
  name: string;
  doctrine: string[];
  waves: string[];
  required_first_batch_tool_ids: string[];
  promotion_law: string[];
};

export type V3WaveRegistry = {
  schema_version: string;
  preserved_v3_waves: { id: string; title: string; status: string }[];
  toolmesh_waves: { id: string; title: string; status: string }[];
};

export function loadToolRegistry(): ToolStackRegistry {
  return readJson<ToolStackRegistry>(freeToolStackRegistryPath, {
    schema_version: "missing",
    name: "missing",
    doctrine: [],
    waves: [],
    required_first_batch_tool_ids: [],
    promotion_law: [],
  });
}

export function loadWaveRegistry(): V3WaveRegistry {
  return readJson<V3WaveRegistry>(v3WaveRegistryPath, {
    schema_version: "missing",
    preserved_v3_waves: [],
    toolmesh_waves: [],
  });
}

export function loadToolCards(): ToolCard[] {
  if (!fs.existsSync(toolCardsRoot)) return [];
  const cards: ToolCard[] = [];
  for (const fileName of fs.readdirSync(toolCardsRoot).sort()) {
    if (!fileName.endsWith(".tool.json")) continue;
    const raw = readJson<ToolCard | { cards: ToolCard[] }>(path.join(toolCardsRoot, fileName), { cards: [] });
    if ("cards" in raw && Array.isArray(raw.cards)) {
      cards.push(...raw.cards);
    } else {
      cards.push(raw as ToolCard);
    }
  }
  return cards;
}

export function listCardsByLab(lab?: ToolMeshLab): ToolCard[] {
  const cards = loadToolCards();
  return lab ? cards.filter((card) => card.lab === lab) : cards;
}

export function findCardById(id: string): ToolCard | undefined {
  return loadToolCards().find((card) => card.id === id);
}
