#!/usr/bin/env node
/* Summarize latest frontend visual and pixel receipts for handoff clarity. */
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(HERE, "..");
const PROOF_DIR = path.join(FRONTEND_ROOT, "proof");

async function findLatest(suffix, receiptName) {
  const entries = await fs.readdir(PROOF_DIR, { withFileTypes: true }).catch(() => []);
  const dirs = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !entry.name.endsWith(suffix)) continue;
    const file = path.join(PROOF_DIR, entry.name, receiptName);
    if (!fsSync.existsSync(file)) continue;
    const stat = await fs.stat(file);
    dirs.push({ dir: path.join(PROOF_DIR, entry.name), file, mtime: stat.mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  if (!dirs[0]) return null;
  return JSON.parse(await fs.readFile(dirs[0].file, "utf8"));
}

const visual = await findLatest("-frontend-visual-proof", "visual-proof-receipt.json");
const pixel = await findLatest("-frontend-pixel-compare", "pixel-compare-receipt.json");
const summary = {
  generated_at: new Date().toISOString(),
  frontend_root: FRONTEND_ROOT,
  visual: visual ? {
    status: visual.status,
    ok: visual.ok,
    run_id: visual.run_id,
    states: visual.states_requested,
    captures: visual.captures?.filter?.((item) => item.state !== "console").length ?? 0,
    receipt: path.relative(FRONTEND_ROOT, path.join(visual.run_dir, "visual-proof-receipt.json")).replace(/\\/g, "/"),
  } : null,
  pixel: pixel ? {
    status: pixel.status,
    ok: pixel.ok,
    run_id: pixel.run_id,
    states: pixel.states_requested,
    summary: pixel.summary,
    receipt: path.relative(FRONTEND_ROOT, path.join(pixel.run_dir, "pixel-compare-receipt.json")).replace(/\\/g, "/"),
  } : null,
};

console.log(JSON.stringify(summary, null, 2));
