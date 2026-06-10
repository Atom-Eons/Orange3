import { writeReceipt } from "../lib/core.ts";

export async function writeK3Receipt(kind: string, payload: Record<string, unknown>) {
  return writeReceipt(`k3-${kind}`, {
    ...payload,
    doctrine: "K3 is a pointer index. Cold Truth files, receipts, SOUL GENOME, and AtomSmasher remain authoritative.",
  }, { repoToo: true });
}
