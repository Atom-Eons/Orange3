import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDir, run, sha256, writeJson } from "../lib/core";
import { benchmarksRoot, loadToolCards, loadToolRegistry, toolmeshRoot } from "./tool-registry";
import { REQUIRED_FIRST_BATCH_TOOL_IDS, TOOLMESH_LABS, validateToolCard, type ToolMeshLab } from "./tool-card.schema";
import { validateWaveRegistry } from "./wave-registry";
import { writeToolMeshReceipt } from "./tool-receipt";
import { summarizeHardware } from "./hardware-manager";

const REQUIRED_BENCHMARKS = [
  "image-lab-benchmark.md",
  "video-lab-benchmark.md",
  "audio-lab-benchmark.md",
  "design-lab-benchmark.md",
  "coding-lab-benchmark.md",
  "automation-lab-benchmark.md",
  "analytics-lab-benchmark.md",
  "public-agent-lab-benchmark.md",
  "observability-lab-benchmark.md",
  "security-lab-benchmark.md",
  "releaseops-lab-benchmark.md",
  "alpha-watchlist-benchmark.md",
];

export const latestToolmeshDoctorPath = path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json");

function latestDoctorPathForScope(scope?: ToolMeshLab): string {
  return scope ? path.join(dataRoot, "v3", "toolmesh", `latest-${scope}-doctor.json`) : latestToolmeshDoctorPath;
}

type BinaryProbe = {
  id: string;
  binaryNames: string[];
  installed: boolean;
  firstFound: string | null;
};

async function probeBinaries(id: string, names: string[] = []): Promise<BinaryProbe> {
  for (const name of names) {
    const result = await run("where.exe", [name], { timeoutMs: 3000 });
    if (result.code === 0) {
      return { id, binaryNames: names, installed: true, firstFound: name };
    }
  }
  return { id, binaryNames: names, installed: false, firstFound: null };
}

function labFromArg(arg?: string): ToolMeshLab | undefined {
  if (!arg) return undefined;
  return (TOOLMESH_LABS as readonly string[]).includes(arg) ? (arg as ToolMeshLab) : undefined;
}

export async function runToolMeshDoctor(scopeArg?: string) {
  const scope = labFromArg(scopeArg);
  const registry = loadToolRegistry();
  const cards = loadToolCards();
  const cardsInScope = scope ? cards.filter((card) => card.lab === scope) : cards;
  const cardValidations = cardsInScope.map(validateToolCard);
  const invalidCards = cardValidations.filter((validation) => !validation.ok);
  const ids = new Set(cards.map((card) => card.id));
  const missingRequiredFirstBatch = REQUIRED_FIRST_BATCH_TOOL_IDS.filter((id) => !ids.has(id));
  const waveValidation = validateWaveRegistry();

  const missingLabDirs = (scope ? [scope] : [...TOOLMESH_LABS]).filter((lab) => !fs.existsSync(path.join(toolmeshRoot, lab)));
  const missingBenchmarks = REQUIRED_BENCHMARKS.filter((fileName) => {
    if (scope && !fileName.startsWith(scope)) return false;
    return !fs.existsSync(path.join(benchmarksRoot, fileName));
  });

  const binaryProbes: BinaryProbe[] = [];
  for (const card of cardsInScope) {
    binaryProbes.push(await probeBinaries(card.id, card.binaryNames ?? []));
  }
  const hardwareSummary = summarizeHardware(cardsInScope);
  const cardsWithPointerPolicy = cardsInScope.filter((card) => card.artifactPolicy?.returnsPointersOnly === true && card.artifactPolicy?.maxInlineBytes === 0).length;
  const cardsWithExecutionMode = cardsInScope.filter((card) => Boolean(card.executionMode)).length;
  const immutableTemplateCards = cardsInScope.filter((card) => card.templatePolicy?.immutableTemplateRequired === true).length;

  const installedCount = binaryProbes.filter((probe) => probe.installed).length;
  const checks = {
    registry_present: registry.schema_version === "orangebox.toolmesh.registry.v1",
    cards_present: cardsInScope.length > 0,
    cards_valid: invalidCards.length === 0,
    first_batch_registered: scope ? true : missingRequiredFirstBatch.length === 0,
    lab_dirs_present: missingLabDirs.length === 0,
    benchmarks_present: missingBenchmarks.length === 0,
    v3_waves_preserved: waveValidation.ok,
    execution_blocked_until_promoted: true,
    hardware_profiles_declared: cardsInScope.every((card) => Boolean(card.hardwareProfile?.concurrencyLock)),
    artifact_pointer_policy_declared: cardsWithPointerPolicy === cardsInScope.length,
    execution_modes_declared: cardsWithExecutionMode === cardsInScope.length,
    immutable_templates_for_workflow_tools: cardsInScope
      .filter((card) => card.capabilities.includes("workflow"))
      .every((card) => card.templatePolicy?.immutableTemplateRequired === true),
  };
  const ok = Object.values(checks).every(Boolean);

  const report = {
    schema_version: "orangebox.toolmesh.doctor.v1",
    generated_at: new Date().toISOString(),
    scope: scope ?? "all",
    status: ok ? "GREEN" : "NEEDS_ATTENTION",
    ok,
    summary: {
      cards_total: cards.length,
      cards_in_scope: cardsInScope.length,
      installed_probe_count: installedCount,
      installed_probe_note: "Binary probes are informational in Y0; missing tools do not fail registry control-plane proof.",
      registry_hash: sha256(JSON.stringify(registry)),
      hardwareSummary,
      cardsWithPointerPolicy,
      cardsWithExecutionMode,
      immutableTemplateCards,
    },
    checks,
    invalidCards,
    missingRequiredFirstBatch,
    missingLabDirs,
    missingBenchmarks,
    waveValidation,
    binaryProbes,
    doctrine: registry.doctrine,
    nextAction: ok
      ? "Proceed to candidate installs per lab only after benchmark and STRONGARM promotion gates."
      : "Fix missing registry/cards/benchmarks/waves before installing or executing tools.",
  };

  const latestPath = latestDoctorPathForScope(scope);
  await ensureDir(path.dirname(latestPath));
  await writeJson(latestPath, report);
  const receiptPath = await writeToolMeshReceipt(scope ? `${scope}-doctor` : "doctor", report, ok ? "GREEN" : "NEEDS_ATTENTION");
  return { ...report, receiptPath };
}
