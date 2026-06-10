import path from "node:path";
import { dataRoot, repoRoot } from "../lib/core.ts";

export const k3Root = path.join(dataRoot, "v3", "k3");
export const k3DbPath = path.join(k3Root, "memory.db");
export const k3ReceiptRoot = path.join(k3Root, "receipts");
export const k3BenchRoot = path.join(k3Root, "benchmarks");

export const defaultIndexRoots = {
  receipts: path.join(dataRoot, "receipts"),
  primers: path.join(dataRoot, "primers"),
  soulGenome: path.join(repoRoot, "config", "soul_genome.json"),
  v3Ledger: path.join(repoRoot, "orangebox-v3", "docs", "V3_MASTER_LEDGER.md"),
  atomSmasherDoc: path.join(repoRoot, "docs", "ATOMSMASHER_MODULE_INTAKE_2026-05-28.md"),
  strongarmReadme: path.join(repoRoot, "integrations", "strongarm_easy_v0_4", "README.md"),
  chatBackup: path.join(repoRoot, "scripts", "v4", "chatbackup-status.mjs"),
  triLane: path.join(repoRoot, "scripts", "v4", "trilane-model-router-doctor.mjs"),
};
