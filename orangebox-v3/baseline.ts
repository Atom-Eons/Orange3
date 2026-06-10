import fs from "node:fs";
import path from "node:path";
import {
  currentBranch,
  currentHead,
  dataRoot,
  git,
  parseFlags,
  probeUrl,
  readJson,
  repoRoot,
  run,
  stamp,
  v3Root,
  writeJson,
  writeReceipt,
  isMain,
} from "./lib/core.ts";

const ports = [
  { id: "orangebox_command_8787", url: "http://127.0.0.1:8787/api/realtime/health" },
  { id: "orangebox_status_8787", url: "http://127.0.0.1:8787/api/status?fast=1" },
  { id: "see_suite_api_8797", url: "http://127.0.0.1:8797/api/health" },
  { id: "strongarm_8094", url: "http://127.0.0.1:8094/health" },
  { id: "llama_cpp_listener_8080", url: "http://127.0.0.1:8080/v1/models" },
  { id: "codexa_command_8097", url: "http://10.0.99.1:8097/health" },
  { id: "codexa_wiki_8098", url: "http://10.0.99.1:8098/health" },
];

function latestJson(file: string) {
  return fs.existsSync(file) ? readJson(file, null) : null;
}

export async function runV3Baseline() {
  const started = new Date();
  const [branch, head, status, worktrees, remote] = await Promise.all([
    currentBranch(),
    currentHead(),
    git(["status", "--short", "--branch"], { timeoutMs: 30_000 }),
    git(["worktree", "list", "--porcelain"], { timeoutMs: 30_000 }),
    git(["remote", "-v"], { timeoutMs: 30_000 }),
  ]);
  const portProbes = [];
  for (const port of ports) {
    portProbes.push({ id: port.id, ...(await probeUrl(port.url, 1800)) });
  }
  const pkg = readJson<any>(path.join(repoRoot, "package.json"), {});
  const scripts = Object.keys(pkg.scripts || {}).filter((name) =>
    /v3|ghost|knowledge|k3|elysia|chatbus|vision|chronos|voice|mcp|speculative|goose|openjarvis|gpu|littleorange|atomsmasher|memory|model|trilane|strongarm|gremlin|health|project|harness|toolmesh|image-lab|video-lab|audio-lab|design-lab|coding-lab|automation-lab|analytics-lab|public-agent|observability|security|releaseops|alpha-watchlist/.test(name)
  );
  const latest = {
    memory_truth: latestJson(path.join(dataRoot, "memory-truth", "latest-memory-source-truth-doctor.json")),
    health: latestJson(path.join(dataRoot, "reports", "health", "latest-health-report.json")),
    project: latestJson(path.join(dataRoot, "reports", "project", "latest-project-report.json")),
    atomsmasher: latestJson(path.join(dataRoot, "atomsmasher", "latest-atomsmasher-doctor.json")),
    feature_matrix: latestJson(path.join(dataRoot, "feature-proof", "latest-feature-acceptance-matrix.json")),
    model_inventory: latestJson(path.join(dataRoot, "reports", "models", "latest-model-inventory.json")),
    toolmesh: latestJson(path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json")),
  };
  const report = {
    ok: true,
    version: "orangebox-v3-baseline/v0",
    status: "ORANGEBOX_V3_BASELINE_RECORDED",
    started_at: started.toISOString(),
    finished_at: new Date().toISOString(),
    repo_root: repoRoot,
    v3_root: v3Root,
    branch,
    head,
    git_status: status.stdout || status.stderr,
    git_worktrees: worktrees.stdout || worktrees.stderr,
    git_remotes: remote.stdout || remote.stderr,
    flags: parseFlags(),
    port_probes: portProbes,
    relevant_scripts: scripts,
    latest_receipt_truth: latest,
    rollback: {
      v3_repo_changes: "Revert orangebox-v3 files and package scripts before merge if superseded.",
      branch: "git checkout main",
      ghost_data: `Review or delete ${path.join(dataRoot, "v3")} only if the V3 trial is intentionally discarded.`,
    },
  };
  const file = path.join(v3Root, "docs", "baselines", `baseline-${stamp(started)}.json`);
  await writeJson(file, report);
  const receipt = await writeReceipt("baseline", { ...report, baseline_path: file }, { repoToo: true });
  await writeJson(path.join(v3Root, "docs", "baselines", "latest-baseline.json"), { ...report, receipt_path: receipt.receipt_path });
  return { ...report, baseline_path: file, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  runV3Baseline().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_V3_BASELINE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
