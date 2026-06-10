import fs from "node:fs";
import { openK3Db } from "./k3-card-writer.ts";
import { k3Config } from "./k3-config.ts";
import { k3DbPath } from "./k3-paths.ts";
import { ollamaEmbed } from "./k3-ollama-embed.ts";

export async function k3Doctor() {
  const db = await openK3Db();
  const cfg = k3Config();
  const dbOk = fs.existsSync(k3DbPath);
  let cardTableOk = true;
  let ftsOk = true;
  let chunkTableOk = true;
  let embeddingTableOk = true;
  let insertQueryOk = true;
  try {
    db.query("SELECT count(*) AS c FROM k3_fts").get();
  } catch {
    ftsOk = false;
  }
  try {
    db.query("SELECT count(*) AS c FROM memory_card").get();
  } catch {
    cardTableOk = false;
  }
  try {
    db.query("SELECT count(*) AS c FROM memory_chunk_pointer").get();
  } catch {
    chunkTableOk = false;
  }
  try {
    db.query("SELECT count(*) AS c FROM memory_embedding").get();
  } catch {
    embeddingTableOk = false;
  }
  try {
    db.query("SELECT card_id, source_path FROM memory_card LIMIT 1").all();
  } catch {
    insertQueryOk = false;
  }
  const embed = await ollamaEmbed("Orangebox K3 local pointer memory doctor");
  const cardCount = db.query("SELECT count(*) AS c FROM memory_card").get() as any;
  const rawColumns = (db.query("PRAGMA table_info(memory_card)").all() as Array<{ name?: string }>)
    .map((row) => String(row.name || "").toLowerCase())
    .filter((name) => ["body", "raw_body", "raw_text", "content", "excerpt"].includes(name));
  const checks = [
    { id: "db_exists", ok: dbOk },
    { id: "card_table_queryable", ok: cardTableOk },
    { id: "chunk_pointer_table_queryable", ok: chunkTableOk },
    { id: "embedding_table_queryable", ok: embeddingTableOk },
    { id: "fts5_queryable", ok: ftsOk },
    { id: "insert_query_path_ready", ok: insertQueryOk },
    { id: "vector_or_fallback_available", ok: Boolean((embed as any).ok || (embed as any).degraded) },
    { id: "no_raw_truth_columns", ok: rawColumns.length === 0, detail: rawColumns },
    { id: "chat_archives_disabled_w1", ok: !cfg.indexChatArchives },
    { id: "cold_truth_gate_required", ok: cfg.requireColdTruthGate },
  ];
  const ok = checks.every((check) => check.ok);
  return {
    ok,
    status: ok ? "K3_DOCTOR_GREEN" : "K3_DOCTOR_NEEDS_WORK",
    db_path: k3DbPath,
    db_exists: dbOk,
    adapter: (embed as any).ok ? "ollama-local-embeddings" : "lexical-alias-fallback",
    degraded_recall: !(embed as any).ok,
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
    chat_archive_indexing_enabled: cfg.indexChatArchives,
    checks,
  };
}
