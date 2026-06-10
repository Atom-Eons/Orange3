import fs from "node:fs";
import path from "node:path";
import { argValue, currentHead, git, hasArg, isMain, sha256, stamp, writeJson } from "../lib/core.ts";
import { ghostPatchRoot, loadGhost, saveGhost } from "./ghost-store.ts";
import { writeGhostReceipt } from "./ghost-receipt.ts";

export async function promoteGhost(rawArgs = process.argv.slice(2)) {
  const ghostId = argValue(rawArgs, "--ghost", argValue(rawArgs, "--ghost-id", rawArgs[0] || ""));
  const apply = hasArg(rawArgs, "--apply");
  const allowHeadMismatch = hasArg(rawArgs, "--allow-head-mismatch");
  const ghost = loadGhost(ghostId);
  if (!ghost) return { ok: false, status: "GHOST_NOT_FOUND", ghost_id: ghostId };

  const diff = await git(["-C", ghost.worktree_path, "diff", "--binary"], { timeoutMs: 120_000 });
  const patchText = diff.stdout || "";
  const patchHash = sha256(patchText);
  const patchFile = path.join(ghostPatchRoot, `${ghost.ghost_id}-${stamp()}.patch`);
  await fs.promises.mkdir(path.dirname(patchFile), { recursive: true });
  await fs.promises.writeFile(patchFile, patchText, "utf8");

  const head = await currentHead();
  const headMatches = head === ghost.base_head_sha;
  const checks = [
    { id: "ghost_exists", ok: true },
    { id: "patch_written", ok: fs.existsSync(patchFile), detail: patchFile },
    { id: "head_matches_base_or_override", ok: headMatches || allowHeadMismatch, detail: { current: head, base: ghost.base_head_sha } },
  ];

  let applyCheck: Awaited<ReturnType<typeof git>> | null = null;
  let applyResult: Awaited<ReturnType<typeof git>> | null = null;
  if (patchText.trim()) {
    applyCheck = await git(["apply", "--check", patchFile], { timeoutMs: 120_000 });
    checks.push({ id: "patch_apply_check", ok: applyCheck.ok, detail: applyCheck.stderr || applyCheck.stdout });
    if (apply && (headMatches || allowHeadMismatch) && applyCheck.ok) {
      applyResult = await git(["apply", patchFile], { timeoutMs: 120_000 });
      checks.push({ id: "patch_applied_to_main", ok: applyResult.ok, detail: applyResult.stderr || applyResult.stdout });
    }
  } else {
    checks.push({ id: "patch_empty_noop", ok: true, detail: "Ghost has no diff; promotion is a verified no-op." });
  }

  const ok = checks.every((check) => check.ok);
  ghost.status = apply && ok ? "promoted" : ok ? "promotion_candidate" : "failed";
  ghost.updated_at = new Date().toISOString();
  ghost.rollback_pointer.patch_file = patchFile;
  ghost.rollback_pointer.reverse_patch = patchText.trim()
    ? `git apply -R "${patchFile}"`
    : "No-op promotion has no reverse patch.";

  const receipt = await writeGhostReceipt("promote", ghost, {
    ok,
    status: ghost.status === "promoted" ? "GHOST_PROMOTED" : ghost.status === "promotion_candidate" ? "GHOST_PROMOTION_CANDIDATE_READY" : "GHOST_PROMOTION_FAILED",
    apply_requested: apply,
    allow_head_mismatch: allowHeadMismatch,
    patch_file: patchFile,
    patch_hash: patchHash,
    patch_bytes: Buffer.byteLength(patchText),
    checks,
    applyCheck,
    applyResult,
  });
  ghost.receipts.push(String(receipt.receipt_path));
  await saveGhost(ghost);
  await writeJson(path.join(ghostPatchRoot, "latest-promotion.json"), { ghost_id: ghost.ghost_id, patch_file: patchFile, receipt_path: receipt.receipt_path });
  if (!ok) process.exitCode = 1;
  return { ok, status: ghost.status, ghost, checks, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  promoteGhost().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "GHOST_PROMOTE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
