import { writeReceipt } from "../lib/core.ts";
import type { GhostEnvelope } from "./ghost-types.ts";

export async function writeGhostReceipt(kind: string, ghost: GhostEnvelope | null, payload: Record<string, unknown>) {
  const receipt = await writeReceipt(`ghost-${kind}`, {
    status: payload.status || (payload.ok === false ? "FAILED" : "VERIFIED"),
    ghost_id: ghost?.ghost_id || payload.ghost_id || null,
    ghost,
    ...payload,
    doctrine: "Ghost worktrees protect the main repo. Promotion is explicit, receipted, and rollback-aware.",
  }, { repoToo: true });
  return receipt;
}
