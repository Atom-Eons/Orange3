import fs from "node:fs";
import path from "node:path";
import { runV3Baseline } from "./baseline.ts";
import { createGhost } from "./ghost/create-ghost.ts";
import { destroyGhost } from "./ghost/destroy-ghost.ts";
import { ghostStatus } from "./ghost/ghost-status.ts";
import { listGhostsCommand } from "./ghost/list-ghosts.ts";
import { promoteGhost } from "./ghost/promote-ghost.ts";
import {
  dataRoot,
  parseFlags,
  printResult,
  readJson,
  repoRoot,
  run,
  v3Root,
  writeReceipt,
  isMain,
} from "./lib/core.ts";

type Check = { id: string; ok: boolean; detail?: unknown };

const expectedFiles = [
  "V3_FLAGS.env",
  "docs/V3_MASTER_LEDGER.md",
  "ghost/create-ghost.ts",
  "ghost/list-ghosts.ts",
  "ghost/destroy-ghost.ts",
  "ghost/promote-ghost.ts",
  "ghost/ghost-status.ts",
  "memory-wildcard/k3-cli.ts",
  "toolmesh/toolmesh-cli.ts",
  "toolmesh/adapter-doctor.ts",
  "toolmesh/hardware-manager.ts",
  "free-alpha-toolmesh/TOOLMESH_SCOPE.md",
  "free-alpha-toolmesh/HARDWARE_ARTIFACT_PROTOCOL.md",
  "free-alpha-toolmesh/registries/free-tool-stack.registry.json",
  "free-alpha-toolmesh/registries/v3-wave-registry.json",
];

const phaseFiles: Record<string, string[]> = {
  api: ["api/elysia-bridge.ts"],
  chatbus: ["chatbus/session-store.ts"],
  vision: ["vision/inspect-page.ts"],
  context: ["context/skeletonize.ts"],
  chronos: ["chronos/record-iteration.ts"],
  voice: ["voice/voice-packet.ts"],
  inference: ["inference/speculative-sidecar.ts"],
  gpu: ["gpu/gpu-budget.ts"],
  mcp: ["mcp/docs-lane.ts"],
  openjarvis: ["openjarvis/eval-runner.ts", "openjarvis/runtime-doctor.ts"],
  theater: ["theater/theater-manifest.ts"],
  forge: ["forge/predict-next-actions.ts"],
  goose: ["goose/goose-envelope.ts"],
  vite: ["vite/allocate-port.ts"],
  toolmesh: [
    "toolmesh/tool-card.schema.ts",
    "toolmesh/tool-registry.ts",
    "toolmesh/capability-router.ts",
    "toolmesh/hardware-manager.ts",
    "toolmesh/toolmesh-cli.ts",
    "free-alpha-toolmesh/tool-cards/first-batch.tool.json",
  ],
};

function exists(rel: string) {
  return fs.existsSync(path.join(v3Root, rel));
}

async function doctor() {
  const flags = parseFlags();
  const checks: Check[] = [
    { id: "v3_flag_present", ok: flags.ORANGEBOX_V3 === "1" },
    ...expectedFiles.map((file) => ({ id: `file:${file}`, ok: exists(file), detail: file })),
  ];
  for (const [phase, files] of Object.entries(phaseFiles)) {
    checks.push({ id: `phase:${phase}:files`, ok: files.every(exists), detail: files });
  }
  const baseline = readJson(path.join(v3Root, "docs", "baselines", "latest-baseline.json"), null);
  checks.push({ id: "baseline_recorded", ok: Boolean(baseline), detail: baseline ? "latest-baseline.json" : "missing" });
  const k3Bench = readJson(path.join(dataRoot, "v3", "k3", "latest-benchmark.json"), null);
  checks.push({ id: "k3_benchmark_available_or_pending", ok: Boolean(k3Bench) || flags.ORANGEBOX_V3_MEMORY_WILDCARD === "0", detail: k3Bench ? "latest-benchmark.json" : "wildcard still off" });
  const toolmeshDoctor = readJson(path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json"), null);
  checks.push({
    id: "toolmesh_doctor_available_when_enabled",
    ok: Boolean(toolmeshDoctor) || flags.ORANGEBOX_FREE_ALPHA_TOOLMESH !== "1",
    detail: toolmeshDoctor ? "latest-toolmesh-doctor.json" : "run npm run toolmesh:doctor",
  });
  const packageCheck = await run("bun", ["orangebox-v3/v3-cli.ts", "flags"], { cwd: repoRoot, timeoutMs: 30_000 });
  checks.push({ id: "v3_cli_bun_smoke", ok: packageCheck.ok, detail: packageCheck.stderr || packageCheck.stdout });
  const ok = checks.every((check) => check.ok);
  const report = {
    ok,
    version: "orangebox-v3-doctor/v0",
    status: ok ? "ORANGEBOX_V3_DOCTOR_GREEN" : "ORANGEBOX_V3_DOCTOR_NEEDS_WORK",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    v3_root: v3Root,
    flags,
    checks,
    doctrine: "V3 is additive and feature-flagged. V2 remains baseline until a V3 lane proves parity with receipts.",
  };
  const receipt = await writeReceipt("doctor", report, { repoToo: true });
  return { ...report, receipt_path: receipt.receipt_path };
}

async function main() {
  const args = process.argv.slice(2);
  const domain = args[0] || "doctor";
  const verb = args[1] || "";
  let out: unknown;
  if (domain === "baseline") out = await runV3Baseline();
  else if (domain === "doctor") out = await doctor();
  else if (domain === "flags") out = { ok: true, status: "V3_FLAGS_READY", flags: parseFlags() };
  else if (domain === "ghost" && verb === "create") out = await createGhost(args.slice(2));
  else if (domain === "ghost" && verb === "list") out = await listGhostsCommand();
  else if (domain === "ghost" && verb === "status") out = await ghostStatus(args.slice(2));
  else if (domain === "ghost" && verb === "destroy") out = await destroyGhost(args.slice(2));
  else if (domain === "ghost" && verb === "promote") out = await promoteGhost(args.slice(2));
  else out = {
    ok: false,
    status: "UNKNOWN_V3_COMMAND",
    usage: [
      "bun orangebox-v3/v3-cli.ts baseline",
      "bun orangebox-v3/v3-cli.ts doctor",
      "bun orangebox-v3/v3-cli.ts flags",
      "bun orangebox-v3/v3-cli.ts ghost create --task NAME",
      "bun orangebox-v3/v3-cli.ts ghost list",
      "bun orangebox-v3/v3-cli.ts ghost status --ghost ID",
      "bun orangebox-v3/v3-cli.ts ghost promote --ghost ID",
      "bun orangebox-v3/v3-cli.ts ghost destroy --ghost ID",
    ],
  };
  printResult(out, true);
  if ((out as any)?.ok === false) process.exitCode = 1;
}

if (isMain(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_V3_CLI_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
