import path from "node:path";
import { listFiles, readText } from "../lib/core.ts";
import { makeCard, openK3Db, upsertCard } from "./k3-card-writer.ts";
import { defaultIndexRoots } from "./k3-paths.ts";

export async function indexPrimers(limit = 100) {
  const db = await openK3Db();
  const files = (await listFiles(defaultIndexRoots.primers, { max: limit, exts: /\.(md|txt|json)$/i, depth: 4 })).slice(0, limit);
  let indexed = 0;
  for (const file of files) {
    const text = readText(file);
    const headings = [...text.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => m[1]).slice(0, 16);
    const card = await makeCard({
      source_path: file,
      source_type: "primer",
      title: path.basename(file, path.extname(file)),
      authority_level: 2,
      aliases: [path.basename(file), ...headings],
      symbols: ["Orangebox", "primer", "zero memory"],
      tags: ["primer", "continuity", "memory"],
    });
    await upsertCard(db, card);
    indexed++;
  }
  return { ok: true, status: "K3_PRIMERS_INDEXED", indexed, root: defaultIndexRoots.primers };
}
