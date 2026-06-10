import { argValue, git, isMain } from "../lib/core.ts";
import { loadGhost } from "./ghost-store.ts";

export async function ghostStatus(rawArgs = process.argv.slice(2)) {
  const ghostId = argValue(rawArgs, "--ghost", argValue(rawArgs, "--ghost-id", rawArgs[0] || ""));
  const ghost = loadGhost(ghostId);
  if (!ghost) return { ok: false, status: "GHOST_NOT_FOUND", ghost_id: ghostId };
  const worktreeStatus = await git(["-C", ghost.worktree_path, "status", "--short"], { timeoutMs: 30_000 });
  const head = await git(["-C", ghost.worktree_path, "rev-parse", "HEAD"], { timeoutMs: 30_000 });
  const diffStat = await git(["-C", ghost.worktree_path, "diff", "--stat"], { timeoutMs: 30_000 });
  return {
    ok: worktreeStatus.ok,
    status: worktreeStatus.ok ? "GHOST_STATUS_READY" : "GHOST_WORKTREE_UNREACHABLE",
    ghost,
    head: head.stdout?.trim() || null,
    git_status_short: worktreeStatus.stdout || worktreeStatus.stderr || "",
    diff_stat: diffStat.stdout || diffStat.stderr || "",
  };
}

if (isMain(import.meta.url)) {
  ghostStatus().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GHOST_STATUS_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
