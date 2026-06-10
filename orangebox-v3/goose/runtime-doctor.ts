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

function pathInside(candidate: string, root: string): boolean {
  const resolved = path.resolve(candidate);
  const resolvedRoot = path.resolve(root);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

function commandAllowed(command: string): boolean {
  const denied = [
    /git\s+reset\s+--hard/i,
    /git\s+checkout\s+--/i,
    /Remove-Item\s+.+-Recurse/i,
    /\brm\s+-rf\b/i,
    /\bdel\s+\/s\b/i,
    /\bformat\b/i,
  ];
  return !denied.some((rx) => rx.test(command));
}

export async function gooseRuntimeDoctor() {
  const ghostRoot = path.join(dataRoot, "goose", "ghost-worktrees", "goose-runtime-smoke");
  const artifactRoot = path.join(dataRoot, "goose", "runtime");
  await ensureDir(ghostRoot);
  await ensureDir(artifactRoot);

  const fallbackGoose = path.join(userRoot, ".local", "bin", "goose.exe");
  const goosePath = existingFile([
    process.env.GOOSE_BIN || "",
    fallbackGoose,
    await whereFirst("goose") || "",
  ]);

  const version = goosePath ? await run(goosePath, ["--version"], { timeoutMs: 30_000 }) : null;
  const info = goosePath ? await run(goosePath, ["info"], { timeoutMs: 30_000 }) : null;
  const doctor = goosePath ? await run(goosePath, ["doctor"], { timeoutMs: 30_000 }) : null;
  const runHelp = goosePath ? await run(goosePath, ["run", "--help"], { timeoutMs: 30_000 }) : null;

  const providerMissing = Boolean(doctor && !doctor.ok && /No provider configured/i.test(`${doctor.stdout}\n${doctor.stderr}`));
  const providerConfigured = Boolean(doctor?.ok);
  const runSurfaceReady = Boolean(runHelp?.ok && /--provider\s+<PROVIDER>/i.test(runHelp.stdout) && /--no-session/i.test(runHelp.stdout));

  const ghostTask = {
    task_id: "goose-runtime-smoke",
    role: "bounded executor candidate proof",
    allowed_root: ghostRoot,
    denied_roots: [".git", "node_modules", ".env", ".env.local", "secrets"],
    allowed_commands: ["goose --version", "goose info", "goose run --help"],
    denied_commands: ["git reset --hard", "git checkout --", "Remove-Item -Recurse", "rm -rf"],
    live_agent_execution: false,
    live_agent_execution_blocked_because: providerConfigured
      ? "Orangebox still requires a ghost-worktree STRONGARM/Checkmate task before promotion."
      : "Goose provider/model is not configured through an Orangebox-approved rail.",
  };
  const ghostTaskPath = path.join(ghostRoot, "GOOSE_GHOST_TASK.json");
  await writeJson(ghostTaskPath, ghostTask);

  const guardProbe = {
    allowed_path_accepts_ghost_root: pathInside(path.join(ghostRoot, "GOOSE_GHOST_TASK.json"), ghostRoot),
    denied_path_rejects_repo_git: !pathInside(path.join(repoRoot, ".git", "config"), ghostRoot),
    denied_path_rejects_parent_escape: !pathInside(path.resolve(ghostRoot, "..", "..", "outside.txt"), ghostRoot),
    denied_command_rejects_git_reset: !commandAllowed("git reset --hard"),
    denied_command_rejects_recursive_delete: !commandAllowed("Remove-Item C:\\ -Recurse -Force"),
    allowed_command_accepts_version: commandAllowed("goose --version"),
  };
  const guardsGreen = Object.values(guardProbe).every(Boolean);

  const installed = Boolean(goosePath && version?.ok && runSurfaceReady);
  const ok = installed && guardsGreen && (providerMissing || providerConfigured);
  const status = !goosePath
    ? "GOOSE_RUNTIME_MISSING"
    : !installed
      ? "GOOSE_RUNTIME_PRESENT_BUT_UNVERIFIED"
      : providerConfigured
        ? "GOOSE_RUNTIME_CONFIGURED_GATED"
        : "GOOSE_RUNTIME_INSTALLED_UNCONFIGURED_GATED";

  const report = {
    ok,
    status,
    schema_version: "orangebox.goose_runtime.v1",
    checked_at: new Date().toISOString(),
    executor: "goose",
    runtime: {
      binary_path: goosePath,
      version: version?.stdout.trim() || null,
      version_exit_code: version?.exit_code ?? null,
      info_exit_code: info?.exit_code ?? null,
      doctor_exit_code: doctor?.exit_code ?? null,
      provider_configured: providerConfigured,
      provider_missing_expected_gate: providerMissing,
      run_surface_ready: runSurfaceReady,
      command_surface: [
        "configure",
        "doctor",
        "info",
        "run",
        "review",
        "recipe",
        "skills",
        "mcp",
        "serve",
        "session",
      ],
    },
    ghost_task: {
      path: ghostTaskPath,
      sha256: sha256(JSON.stringify(ghostTask)),
      live_agent_execution_attempted: false,
      ready_for_bounded_live_task: installed && guardsGreen,
    },
    guards: guardProbe,
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
    next_promotion_gate: providerConfigured
      ? "Run one bounded ghost-worktree Goose task with STRONGARM/Checkmate, diff, tests, receipt, and rollback before promotion."
      : "Configure Goose through an approved local/subscription rail, then run one bounded ghost-worktree task before promotion.",
    rollback: {
      installed_binary: goosePath,
      remove_command: goosePath ? `Remove-Item -LiteralPath '${goosePath.replace(/'/g, "''")}' -Force` : null,
      data_mutation: artifactRoot,
      disable_action: "Remove v3:goose:runtime from proof refresh if Goose is removed.",
    },
    outputs: {
      info_sample: info?.stdout.slice(0, 800) || info?.stderr.slice(0, 800) || null,
      doctor_sample: doctor?.stdout.slice(0, 800) || doctor?.stderr.slice(0, 800) || null,
      run_help_hash: runHelp?.ok ? sha256(runHelp.stdout) : null,
    },
  };

  const latestPath = path.join(artifactRoot, "latest-goose-runtime.json");
  await writeJson(latestPath, report);
  const receipt = await writeReceipt("goose-runtime-doctor", report);
  return { ...report, latest_path: latestPath, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  gooseRuntimeDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GOOSE_RUNTIME_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
