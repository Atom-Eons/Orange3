import fs from "node:fs";
import { makeCard, openK3Db, seedConcepts, upsertCard } from "./k3-card-writer.ts";

export async function indexColdTruth() {
  const db = await openK3Db();
  let indexed = 0;
  const missing = [];
  for (const concept of seedConcepts()) {
    const card = await makeCard(concept);
    await upsertCard(db, card);
    indexed++;
    if (!fs.existsSync(concept.source_path)) missing.push({ title: concept.title, source_path: concept.source_path });
  }
  return { ok: true, status: "K3_COLDTRUTH_INDEXED", indexed, missing_sources: missing };
}
