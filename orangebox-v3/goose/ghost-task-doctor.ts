import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  dataRoot,
  ensureDir,
  isMain,
  repoRoot,
  run,
  sha256,
  userRoot,
  writeJson,
  writeReceipt,
} from "../lib/core.ts";

function existingFile(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}

async function whereFirst(binary: string): Promise<string | null> {
  const where = await run("where.exe", [binary], { timeoutMs: 5000 });
  if (!where.ok) return null;
  return where.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || null;
}

function readJson<T = any>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as T;
  } catch {
    return fallback;
  }
}

function pathInside(candidate: string, root: string): boolean {
  const resolved = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

function pathAllowed(candidate: string, allowedRoot: string): boolean {
  const deniedParts = new Set([".git", "node_modules", "secrets"]);
  const resolved = path.resolve(candidate);
  const parts = resolved.split(/[\\/]+/);
  if (parts.some((part) => deniedParts.has(part))) return false;
  if (/\.env(?:\.local)?$/i.test(path.basename(resolved))) return false;
  return pathInside(resolved, allowedRoot);
}

function commandAllowed(command: string): boolean {
  const denied = [
    /git\s+reset\s+--hard/i,
    /git\s+checkout\s+--/i,
    /Remove-Item\s+.+-Recurse/i,
    /\brm\s+-rf\b/i,
    /\bdel\s+\/s\b/i,
    /\bformat\b/i,
    /\bInvoke-WebRequest\b/i,
    /\bcurl\b.+https?:\/\//i,
  ];
  return !denied.some((rx) => rx.test(command));
}

function commandSummary(result: Awaited<ReturnType<typeof run>> | null) {
  if (!result) return null;
  return {
    command: result.command,
    ok: result.ok,
    exit_code: result.exit_code,
    duration_ms: result.duration_ms,
    stdout_hash: sha256(result.stdout || ""),
    stderr_hash: sha256(result.stderr || ""),
    stdout_sample: (result.stdout || "").slice(0, 600),
    stderr_sample: (result.stderr || "").slice(0, 600),
  };
}

export async function gooseGhostTaskDoctor() {
  const ghostRoot = path.join(dataRoot, "goose", "ghost-worktrees", "goose-bounded-task-proof");
  const artifactRoot = path.join(dataRoot, "goose", "ghost-task");
  await ensureDir(ghostRoot);
  await ensureDir(artifactRoot);

  const fallbackGoose = path.join(userRoot, ".local", "bin", "goose.exe");
  const goosePath = existingFile([
    process.env.GOOSE_BIN || "",
    fallbackGoose,
    await whereFirst("goose") || "",
  ]);

  const runtimeReceiptPath = path.join(dataRoot, "goose", "runtime", "latest-goose-runtime.json");
  const strongarmPath = path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json");
  const checkmatePath = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");
  const runtime = readJson(runtimeReceiptPath, null);
  const strongarm = readJson(strongarmPath, null);
  const checkmate = readJson(checkmatePath, null);

  const task = {
    task_id: "goose-bounded-task-proof",
    title: "Goose bounded ghost-task proof",
    doctrine: "Goose may be inspected as executor hands only inside a ghost workspace until provider, STRONGARM, Checkmate, diff, rollback, and operator gates are green.",
    allowed_root: ghostRoot,
    forbidden_roots: [repoRoot, path.join(repoRoot, ".git"), path.join(repoRoot, "frontend"), path.join(repoRoot, "node_modules")],
    allowed_commands: ["goose --version", "goose info", "goose run --help"],
    denied_commands: ["git reset --hard", "git checkout --", "Remove-Item -Recurse", "rm -rf", "network fetch/install"],
    live_agent_execution: false,
    default_executor_promotion: false,
    frontend_touch_allowed: false,
    required_evidence: {
      strongarm: strongarmPath,
      checkmate: checkmatePath,
      goose_runtime: runtimeReceiptPath,
    },
  };
  const taskPath = path.join(ghostRoot, "GOOSE_GHOST_TASK_BOUNDED.json");
  const taskMarkdownPath = path.join(ghostRoot, "TASK.md");
  await writeJson(taskPath, task);
  await Bun.write(taskMarkdownPath, [
    "# Goose Bounded Ghost Task Proof",
    "",
    "This workspace proves Goose command surfaces and Orangebox guards only.",
    "",
    `Allowed root: ${ghostRoot}`,
    "",
    "Allowed commands:",
    "- goose --version",
    "- goose info",
    "- goose run --help",
    "",
    "Denied:",
    "- production repo writes",
    "- frontend edits",
    "- live agent execution",
    "- provider config mutation",
    "- network install/fetch",
    "- destructive git or recursive delete commands",
    "",
  ].join("\n"));

  const version = goosePath ? await run(goosePath, ["--version"], { timeoutMs: 30_000 }) : null;
  const info = goosePath ? await run(goosePath, ["info"], { timeoutMs: 30_000 }) : null;
  const runHelp = goosePath ? await run(goosePath, ["run", "--help"], { timeoutMs: 30_000 }) : null;

  const runSurfaceReady = Boolean(runHelp?.ok && /--provider\s+<PROVIDER>/i.test(runHelp.stdout) && /--no-session/i.test(runHelp.stdout));
  const providerConfigured = Boolean(runtime?.runtime?.provider_configured);
  const providerMissingExpectedGate = runtime?.runtime?.provider_missing_expected_gate === true || providerConfigured === false;
  const strongarmGreen = strongarm?.ok === true && strongarm?.status === "STRONGARM_ORANGEBOX_GATE_GREEN";
  const checkmateGreen = checkmate?.ok === true && checkmate?.status === "CHECKMATE_EVAL_LANE_GREEN";

  const guards = {
    allowed_path_accepts_task_json: pathAllowed(taskPath, ghostRoot),
    allowed_path_accepts_task_markdown: pathAllowed(taskMarkdownPath, ghostRoot),
    denied_path_rejects_repo_root: !pathAllowed(path.join(repoRoot, "package.json"), ghostRoot),
    denied_path_rejects_frontend: !pathAllowed(path.join(repoRoot, "frontend", "src", "App.tsx"), ghostRoot),
    denied_path_rejects_repo_git: !pathAllowed(path.join(repoRoot, ".git", "config"), ghostRoot),
    denied_path_rejects_parent_escape: !pathAllowed(path.resolve(ghostRoot, "..", "..", "outside.txt"), ghostRoot),
    denied_path_rejects_env: !pathAllowed(path.join(ghostRoot, ".env"), ghostRoot),
    allowed_command_accepts_version: commandAllowed("goose --version"),
    allowed_command_accepts_info: commandAllowed("goose info"),
    allowed_command_accepts_run_help: commandAllowed("goose run --help"),
    denied_command_rejects_git_reset: !commandAllowed("git reset --hard"),
    denied_command_rejects_git_checkout: !commandAllowed("git checkout -- ."),
    denied_command_rejects_recursive_delete: !commandAllowed("Remove-Item C:\\ -Recurse -Force"),
    denied_command_rejects_network_fetch: !commandAllowed("curl https://example.com/install.ps1"),
  };
  const guardsGreen = Object.values(guards).every(Boolean);

  const transcript = {
    task_path: taskPath,
    task_markdown_path: taskMarkdownPath,
    commands: {
      version: commandSummary(version),
      info: commandSummary(info),
      run_help: commandSummary(runHelp),
    },
  };
  const transcriptPath = path.join(artifactRoot, "goose-ghost-task-transcript.json");
  await writeJson(transcriptPath, transcript);

  const commandSurfacesGreen = Boolean(goosePath && version?.ok && info?.ok && runSurfaceReady);
  const evidenceGreen = strongarmGreen && checkmateGreen;
  const ok = commandSurfacesGreen && guardsGreen && evidenceGreen && Boolean(runtime?.ok);
  const status = ok
    ? "GOOSE_GHOST_TASK_BOUNDED_PROOF_GREEN"
    : goosePath
      ? "GOOSE_GHOST_TASK_BOUNDED_PROOF_NEEDS_WORK"
      : "GOOSE_GHOST_TASK_GOOSE_MISSING";

  const report = {
    ok,
    status,
    schema_version: "orangebox.goose_ghost_task.v1",
    checked_at: new Date().toISOString(),
    executor: "goose",
    runtime: {
      binary_path: goosePath,
      version: version?.stdout.trim() || null,
      provider_configured: providerConfigured,
      provider_missing_expected_gate: providerMissingExpectedGate,
      run_surface_ready: runSurfaceReady,
      command_surfaces_green: commandSurfacesGreen,
    },
    ghost_task: {
      root: ghostRoot,
      task_path: taskPath,
      task_markdown_path: taskMarkdownPath,
      task_hash: sha256(JSON.stringify(task)),
      transcript_path: transcriptPath,
      transcript_hash: sha256(JSON.stringify(transcript)),
      ready_for_bounded_live_task_after_provider_config: commandSurfacesGreen && guardsGreen && evidenceGreen,
    },
    guards,
    evidence: {
      strongarm: {
        path: strongarmPath,
        status: strongarm?.status || null,
        ok: strongarmGreen,
      },
      checkmate: {
        path: checkmatePath,
        status: checkmate?.status || null,
        ok: checkmateGreen,
      },
      goose_runtime: {
        path: runtimeReceiptPath,
        status: runtime?.status || null,
        ok: runtime?.ok === true,
      },
    },
    constraints: {
      frontend_touched: false,
      repo_mutated_by_goose: false,
      provider_config_mutated: false,
      live_agent_execution_attempted: false,
      paid_api_attempted: false,
      production_deploy_attempted: false,
      default_executor_promoted: false,
      platform: os.platform(),
    },
    promotion: {
      promotable_now: false,
      default_executor_promoted: false,
      next_gate: providerConfigured
        ? "Run a true live Goose task in this ghost root with STRONGARM, Checkmate, diff, rollback, and operator approval."
        : "Configure a Goose provider/model through an approved local/subscription rail, then run one true live Goose ghost task.",
    },
    rollback: {
      data_mutation: artifactRoot,
      ghost_root: ghostRoot,
      remove_data_command: `Remove-Item -LiteralPath '${artifactRoot.replace(/'/g, "''")}' -Recurse -Force`,
      disable_action: "Remove v3:goose:ghost-task from proof refresh if Goose is removed.",
    },
  };

  const latestPath = path.join(artifactRoot, "latest-goose-ghost-task.json");
  await writeJson(latestPath, report);
  const receipt = await writeReceipt("goose-ghost-task-doctor", report);
  return { ...report, latest_path: latestPath, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  gooseGhostTaskDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GOOSE_GHOST_TASK_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
