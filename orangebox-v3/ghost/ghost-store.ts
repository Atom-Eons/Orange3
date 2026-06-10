import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ensureDir, readJson, v3DataRoot, writeJson } from "../lib/core.ts";
import type { GhostEnvelope } from "./ghost-types.ts";

export const ghostRoot = path.join(v3DataRoot, "ghosts");
export const ghostWorktreeRoot = path.join(v3DataRoot, "ghost-worktrees");
export const ghostPatchRoot = path.join(v3DataRoot, "ghost-patches");

export function ghostMetaPath(ghostId: string) {
  return path.join(ghostRoot, `${ghostId}.json`);
}

export async function initGhostStore() {
  await ensureDir(ghostRoot);
  await ensureDir(ghostWorktreeRoot);
  await ensureDir(ghostPatchRoot);
}

export function loadGhost(ghostId: string): GhostEnvelope | null {
  const file = ghostMetaPath(ghostId);
  if (!fs.existsSync(file)) return null;
  return readJson<GhostEnvelope | null>(file, null);
}

export async function saveGhost(ghost: GhostEnvelope) {
  await initGhostStore();
  await writeJson(ghostMetaPath(ghost.ghost_id), ghost);
  await writeJson(path.join(ghostRoot, "latest-ghost.json"), ghost);
}

export async function listGhosts(): Promise<GhostEnvelope[]> {
  await initGhostStore();
  const files = await fsp.readdir(ghostRoot).catch(() => []);
  const ghosts = files
    .filter((file) => /^ghost_.*\.json$/.test(file))
    .map((file) => readJson<GhostEnvelope | null>(path.join(ghostRoot, file), null))
    .filter(Boolean) as GhostEnvelope[];
  return ghosts.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at));
}
