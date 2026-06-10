import fs from "node:fs";
import { openK3Db } from "./k3-card-writer.ts";
import { k3DbPath } from "./k3-paths.ts";
import { ollamaEmbed } from "./k3-ollama-embed.ts";

export async function k3Doctor() {
  const db = await openK3Db();
  const dbOk = fs.existsSync(k3DbPath);
  let ftsOk = true;
  try {
    db.query("SELECT count(*) AS c FROM k3_fts").get();
  } catch {
    ftsOk = false;
  }
  const embed = await ollamaEmbed("Orangebox K3 local pointer memory doctor");
  const cardCount = db.query("SELECT count(*) AS c FROM memory_card").get() as any;
  return {
    ok: dbOk && ftsOk,
    status: dbOk && ftsOk ? "K3_DOCTOR_GREEN" : "K3_DOCTOR_NEEDS_WORK",
    db_path: k3DbPath,
    db_exists: dbOk,
    fts5_ok: ftsOk,
    cards: Number(cardCount?.c || 0),
    embedding_probe: {
      ok: embed.ok,
      degraded: (embed as any).degraded || false,
      model: embed.model,
      dimensions: embed.dimensions,
      error: (embed as any).error || null,
    },
    no_raw_truth_db_default: true,
    cold_truth_gate_required: true,
  };
}
