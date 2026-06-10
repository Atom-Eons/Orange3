import path from "node:path";
import { argValue, currentBranch, currentHead, git, isMain, safeId, sha256, stamp } from "../lib/core.ts";
import { ghostWorktreeRoot, initGhostStore, saveGhost } from "./ghost-store.ts";
import { writeGhostReceipt } from "./ghost-receipt.ts";
import type { GhostEnvelope } from "./ghost-types.ts";

export async function createGhost(rawArgs = process.argv.slice(2)) {
  await initGhostStore();
  const task = argValue(rawArgs, "--task", argValue(rawArgs, "--task-id", "v3-ghost-task"));
  const chatId = argValue(rawArgs, "--chat-id", "") || null;
  const ideContextId = argValue(rawArgs, "--ide-context-id", "") || null;
  const modelLane = argValue(rawArgs, "--model-lane", "trilane-default");
  const riskScore = Number(argValue(rawArgs, "--risk", "0.2"));
  const sourceTargets = rawArgs
    .filter((item, i) => rawArgs[i - 1] === "--target")
    .filter(Boolean);
  const baseHead = await currentHead();
  const baseBranch = await currentBranch();
  if (!baseHead) throw new Error("Cannot create ghost: git HEAD is unavailable.");

  const id = `ghost_${stamp().toLowerCase()}_${safeId(task).slice(0, 28)}`;
  const branch = `v3/ghost/${safeId(task).slice(0, 32)}-${stamp().toLowerCase()}`;
  const worktreePath = path.join(ghostWorktreeRoot, id);
  const create = await git(["worktree", "add", "-b", branch, worktreePath, baseHead], { timeoutMs: 120_000 });
  const now = new Date().toISOString();
  const ghost: GhostEnvelope = {
    ghost_id: id,
    task_id: task,
    chat_id: chatId,
    ide_context_id: ideContextId,
    base_head_sha: baseHead,
    branch_name: branch,
    worktree_path: worktreePath,
    source_targets: sourceTargets,
    ast_hash: sourceTargets.length ? sha256(sourceTargets.join("\n")) : null,
    memory_snapshot_hash: sha256(JSON.stringify({ flags: "V3_FLAGS.env", baseHead, baseBranch })).slice(0, 32),
    model_lane: modelLane,
    risk_score: Number.isFinite(riskScore) ? riskScore : 0.2,
    status: create.ok ? "active" : "failed",
    created_at: now,
    updated_at: now,
    invalidation_rules: [
      "base HEAD mismatch",
      "source target AST hash mismatch",
      "user input conflict",
      "worktree missing",
      "proof gate failure",
    ],
    promotion_rules: [
      "explicit promote command",
      "current repo HEAD equals base_head_sha unless override is approved",
      "patch applies cleanly",
      "tests/proof commands pass or are explicitly accepted",
      "receipt and rollback pointer exist",
    ],
    rollback_pointer: {
      remove_worktree: `git worktree remove "${worktreePath}"`,
      delete_branch: `git branch -D ${branch}`,
    },
    receipts: [],
  };
  const receipt = await writeGhostReceipt("create", ghost, {
    ok: create.ok,
    status: create.ok ? "GHOST_CREATED" : "GHOST_CREATE_FAILED",
    command: create.command,
    stdout: create.stdout,
    stderr: create.stderr,
    base_branch: baseBranch,
  });
  ghost.receipts.push(String(receipt.receipt_path));
  await saveGhost(ghost);
  if (!create.ok) process.exitCode = 1;
  return { ok: create.ok, status: create.ok ? "GHOST_CREATED" : "GHOST_CREATE_FAILED", ghost, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  createGhost().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GHOST_CREATE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
