import fs from "node:fs";
import path from "node:path";
import { listFiles, readJson } from "../lib/core.ts";
import { makeCard, openK3Db, upsertCard } from "./k3-card-writer.ts";
import { defaultIndexRoots } from "./k3-paths.ts";

export async function indexReceipts(limit = 250) {
  const db = await openK3Db();
  const files = (await listFiles(defaultIndexRoots.receipts, { max: limit, exts: /\.json$/i, depth: 7 })).slice(0, limit);
  let indexed = 0;
  for (const file of files) {
    const json = readJson<any>(file, {});
    const title = json.status || json.receipt_id || json.kind || path.basename(file, ".json");
    const card = await makeCard({
      source_path: file,
      source_type: "receipt",
      title: String(title),
      authority_level: 3,
      aliases: [path.basename(file), String(json.status || ""), String(json.kind || ""), String(json.summary?.status || "")].filter(Boolean),
      symbols: [String(json.receipt_id || ""), String(json.version || ""), String(json.status || "")].filter(Boolean),
      tags: ["receipt", ...(Array.isArray(json.tags) ? json.tags : [])],
      receipt_id: json.receipt_id || path.basename(file, ".json"),
    });
    await upsertCard(db, card);
    indexed++;
  }
  return { ok: true, status: "K3_RECEIPTS_INDEXED", indexed, root: defaultIndexRoots.receipts };
}
