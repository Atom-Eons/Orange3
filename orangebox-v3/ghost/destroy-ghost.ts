import { argValue, git, hasArg, isMain } from "../lib/core.ts";
import { loadGhost, saveGhost } from "./ghost-store.ts";
import { writeGhostReceipt } from "./ghost-receipt.ts";

export async function destroyGhost(rawArgs = process.argv.slice(2)) {
  const ghostId = argValue(rawArgs, "--ghost", argValue(rawArgs, "--ghost-id", rawArgs[0] || ""));
  const deleteBranch = hasArg(rawArgs, "--delete-branch");
  const ghost = loadGhost(ghostId);
  if (!ghost) return { ok: false, status: "GHOST_NOT_FOUND", ghost_id: ghostId };
  const remove = await git(["worktree", "remove", "--force", ghost.worktree_path], { timeoutMs: 120_000 });
  const branchDelete = deleteBranch
    ? await git(["branch", "-D", ghost.branch_name], { timeoutMs: 60_000 })
    : { ok: true, stdout: "branch preserved", stderr: "", command: "branch delete skipped" };
  ghost.status = remove.ok && branchDelete.ok ? "destroyed" : "failed";
  ghost.updated_at = new Date().toISOString();
  const receipt = await writeGhostReceipt("destroy", ghost, {
    ok: remove.ok && branchDelete.ok,
    status: remove.ok && branchDelete.ok ? "GHOST_DESTROYED" : "GHOST_DESTROY_FAILED",
    remove,
    branchDelete,
    branch_deleted: deleteBranch,
  });
  ghost.receipts.push(String(receipt.receipt_path));
  await saveGhost(ghost);
  if (!remove.ok || !branchDelete.ok) process.exitCode = 1;
  return { ok: remove.ok && branchDelete.ok, status: ghost.status, ghost, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  destroyGhost().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GHOST_DESTROY_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
