import { writeReceipt } from "../lib/core.ts";

export async function writeK3Receipt(kind: string, payload: Record<string, unknown>) {
  return writeReceipt(`k3-${kind}`, {
    ...payload,
    doctrine: "K3 is a pointer index. Cold Truth files, receipts, SOUL GENOME, and AtomSmasher remain authoritative.",
    source_truth_policy: "Vector/lexical rows locate files only. Physical source must pass Cold Truth Gate before model context.",
    raw_database_truth_allowed: false,
    chat_archive_indexing_w1: false,
  }, { repoToo: true });
}
