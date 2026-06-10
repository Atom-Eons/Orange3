import { isMain, printResult } from "../lib/core";
import { dryRunToolAction } from "./adapter-runner";
import { runToolMeshDoctor } from "./adapter-doctor";
import { routeCapability } from "./capability-router";
import { loadToolCards, loadWaveRegistry } from "./tool-registry";
import { runPhysicalRuntimeDoctor } from "./physical-runtime-doctor";

function usage() {
  return {
    commands: [
      "doctor [lab]",
      "list [lab-or-category]",
      "route <intent>",
      "dry-run <tool-id> <task>",
      "physical-doctor",
      "waves",
    ],
  };
}

export async function runToolMeshCli(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (!command || command === "help" || command === "--help") {
    printResult(usage());
    return;
  }

  if (command === "doctor") {
    printResult(await runToolMeshDoctor(rest[0]));
    return;
  }

  if (command === "list") {
    const filter = rest[0]?.toLowerCase();
    const cards = loadToolCards().filter((card) => !filter || card.lab === filter || card.category === filter);
    printResult({
      count: cards.length,
      cards: cards.map((card) => ({
        id: card.id,
        name: card.name,
        lab: card.lab,
        category: card.category,
        status: card.status,
        local: card.local,
        cloud: card.cloud,
        canTouchRepo: card.canTouchRepo,
        requiresSTRONGARM: card.requiresSTRONGARM,
      })),
    });
    return;
  }

  if (command === "route") {
    printResult(routeCapability(rest.join(" ")));
    return;
  }

  if (command === "dry-run") {
    const [toolId, ...taskWords] = rest;
    printResult(dryRunToolAction({ toolId, task: taskWords.join(" ") }));
    return;
  }

  if (command === "physical-doctor") {
    printResult(await runPhysicalRuntimeDoctor());
    return;
  }

  if (command === "waves") {
    printResult(loadWaveRegistry());
    return;
  }

  printResult({ ok: false, error: `Unknown ToolMesh command: ${command}`, usage: usage() });
}

if (isMain(import.meta.url)) {
  await runToolMeshCli();
}
