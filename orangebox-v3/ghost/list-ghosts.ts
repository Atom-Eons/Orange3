import { git, isMain } from "../lib/core.ts";
import { listGhosts } from "./ghost-store.ts";

export async function listGhostsCommand() {
  const ghosts = await listGhosts();
  const enriched = [];
  for (const ghost of ghosts) {
    const status = ghost.status === "active"
      ? await git(["-C", ghost.worktree_path, "status", "--short"], { timeoutMs: 30_000 })
      : null;
    enriched.push({
      ...ghost,
      git_status_short: status?.stdout || status?.stderr || null,
      worktree_reachable: status ? status.ok : ghost.status !== "active" ? null : false,
    });
  }
  return {
    ok: true,
    status: "GHOST_LIST_READY",
    count: enriched.length,
    ghosts: enriched,
  };
}

if (isMain(import.meta.url)) {
  listGhostsCommand().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GHOST_LIST_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
