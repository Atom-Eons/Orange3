import path from "node:path";
import { dataRoot, ensureDir, sha256, writeJson, writeReceipt } from "../lib/core";

export type ToolMeshReceiptPayload = {
  kind: string;
  status: string;
  evidence: unknown;
  blockers?: string[];
  nextAction?: string;
};

export async function writeToolMeshReceipt(kind: string, evidence: unknown, status = "GREEN"): Promise<string> {
  const payload: ToolMeshReceiptPayload = {
    kind,
    status,
    evidence,
    blockers: [],
    nextAction: "Use this receipt as the promotion/audit source for the next ToolMesh gate.",
  };
  const receipt = await writeReceipt(`toolmesh-${kind}`, payload, { repoToo: true });

  const mirrorRoot = path.join(dataRoot, "v3", "toolmesh", "receipts");
  await ensureDir(mirrorRoot);
  const mirrorPath = path.join(mirrorRoot, `${Date.now()}-${kind}-${sha256(JSON.stringify(evidence)).slice(0, 10)}.json`);
  await writeJson(mirrorPath, {
    ...payload,
    receiptPath: receipt.receipt_path,
    repoReceiptPath: receipt.repo_receipt_path,
    receiptHash: sha256(JSON.stringify(receipt)),
  });
  return receipt.receipt_path;
}
