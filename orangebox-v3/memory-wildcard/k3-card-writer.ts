import { Database } from "bun:sqlite";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { ensureDir, readText, repoRoot, safeId, sha256 } from "../lib/core.ts";
import { K3_INDEX_VERSION, k3Config } from "./k3-config.ts";
import { chunkTextPointerOnly } from "./k3-chunker.ts";
import { fileHash } from "./k3-hash.ts";
import { k3DbPath, k3Root } from "./k3-paths.ts";
import type { K3Card } from "./k3-types.ts";

export async function openK3Db() {
  await ensureDir(k3Root);
  const db = new Database(k3DbPath);
  db.run("PRAGMA busy_timeout = 10000");
  db.run("PRAGMA journal_mode = WAL");
  const schema = readText(path.join(repoRoot, "orangebox-v3", "memory-wildcard", "schema.sql"));
  for (const statement of schema.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) {
    db.run(statement);
  }
  ensureK3Migrations(db);
  return db;
}

function hasColumn(db: Database, table: string, column: string) {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === column);
}

function ensureColumn(db: Database, table: string, column: string, definition: string) {
  if (!hasColumn(db, table, column)) {
    try {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (!/duplicate column/i.test(String((error as Error)?.message || error))) throw error;
    }
  }
}

function ensureK3Migrations(db: Database) {
  ensureColumn(db, "memory_card", "repo_root", "TEXT");
  ensureColumn(db, "memory_card", "active", "INTEGER DEFAULT 1");
  ensureColumn(db, "memory_card", "last_indexed_at", "TEXT");
}

export async function makeCard(input: {
  source_path: string;
  source_type: string;
  title: string;
  authority_level: number;
  aliases?: string[];
  symbols?: string[];
  tags?: string[];
  receipt_id?: string | null;
  soul_genome_ref?: string | null;
  atom_smasher_ref?: string | null;
}): Promise<K3Card> {
  const stat = await fsp.stat(input.source_path).catch(() => null);
  const hash = await fileHash(input.source_path);
  const aliases = input.aliases || [];
  const symbols = input.symbols || [];
  const tags = input.tags || [];
  const title = input.title || path.basename(input.source_path);
  const searchText = [title, path.basename(input.source_path), input.source_type, ...aliases, ...symbols, ...tags].join(" ");
  return {
    card_id: `card_${sha256(`${input.source_path}:${title}`).slice(0, 16)}`,
    source_path: input.source_path,
    source_type: input.source_type,
    source_hash: hash,
    source_size: stat?.size || 0,
    source_mtime: stat?.mtime?.toISOString() || null,
    authority_level: input.authority_level,
    title,
    repo_root: repoRoot,
    symbols,
    aliases,
    tags,
    receipt_id: input.receipt_id || null,
    soul_genome_ref: input.soul_genome_ref || null,
    atom_smasher_ref: input.atom_smasher_ref || null,
    index_version: K3_INDEX_VERSION,
    embedding_model: k3Config().embedModel,
    search_text: searchText,
  };
}

export async function upsertCard(db: Database, card: K3Card) {
  const now = new Date().toISOString();
  db.query(`INSERT OR REPLACE INTO memory_card (
    card_id, source_path, source_type, source_hash, source_size, source_mtime, authority_level, title,
    repo_root, symbols_json, aliases_json, tags_json, receipt_id, soul_genome_ref, atom_smasher_ref,
    created_at, updated_at, index_version, embedding_model, chunk_count, active, last_indexed_at, search_text
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM memory_card WHERE card_id = ?), ?), ?, ?, ?, ?, ?, ?, ?)`).run(
    card.card_id,
    card.source_path,
    card.source_type,
    card.source_hash,
    card.source_size,
    card.source_mtime,
    card.authority_level,
    card.title,
    card.repo_root,
    JSON.stringify(card.symbols),
    JSON.stringify(card.aliases),
    JSON.stringify(card.tags),
    card.receipt_id,
    card.soul_genome_ref,
    card.atom_smasher_ref,
    card.card_id,
    now,
    now,
    card.index_version,
    card.embedding_model,
    0,
    1,
    now,
    card.search_text,
  );
  db.query("DELETE FROM k3_fts WHERE card_id = ?").run(card.card_id);
  try {
    db.query("INSERT INTO k3_fts(card_id, search_text) VALUES (?, ?)").run(card.card_id, card.search_text);
  } catch {}
  const text = fs.existsSync(card.source_path) ? readText(card.source_path) : "";
  const chunks = chunkTextPointerOnly(text);
  db.query("DELETE FROM memory_chunk_pointer WHERE card_id = ?").run(card.card_id);
  for (const chunk of chunks) {
    db.query(`INSERT OR REPLACE INTO memory_chunk_pointer (
      chunk_id, card_id, chunk_index, source_path, byte_start, byte_end, line_start, line_end,
      chunk_hash, heading_path, symbols_json, aliases_json, authority_level, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `chunk_${safeId(card.card_id)}_${chunk.chunk_index}`,
      card.card_id,
      chunk.chunk_index,
      card.source_path,
      chunk.byte_start,
      chunk.byte_end,
      chunk.line_start,
      chunk.line_end,
      chunk.chunk_hash,
      chunk.heading_path,
      JSON.stringify(card.symbols),
      JSON.stringify(card.aliases),
      card.authority_level,
      now,
    );
  }
  db.query("UPDATE memory_card SET chunk_count = ? WHERE card_id = ?").run(chunks.length, card.card_id);
  return { card_id: card.card_id, chunks: chunks.length };
}

export function seedConcepts() {
  return [
    {
      title: "AtomSmasher",
      source_type: "coldtruth",
      source_path: path.join(repoRoot, "docs", "ATOMSMASHER_MODULE_INTAKE_2026-05-28.md"),
      authority_level: 3,
      aliases: ["heavy memory compiler", "memory compiler", "context compressor", "work compiler", "Cold Truth compressor", "receipt compressor", "memory physics engine", "compression lane", "primer compiler", "mid-session compression"],
      symbols: ["AtomSmasher", "SavedWorkCertificate", "Only smart work is done"],
      tags: ["compression", "memory", "work"],
      atom_smasher_ref: "self",
    },
    {
      title: "STRONGARM",
      source_type: "tool",
      source_path: path.join(repoRoot, "integrations", "strongarm_easy_v0_4", "README.md"),
      authority_level: 3,
      aliases: ["pressure gate", "risk gate", "hard stop", "architecture brake", "force validator", "safety valve", "high-risk adjudicator"],
      symbols: ["STRONGARM", "PASS", "REWRITE", "ESCALATE", "BLOCK"],
      tags: ["judge", "pressure", "gate"],
    },
    {
      title: "TriLane",
      source_type: "router",
      source_path: path.join(repoRoot, "scripts", "v4", "trilane-model-router-doctor.mjs"),
      authority_level: 3,
      aliases: ["router", "model router", "lane selector", "decision spine", "orchestration rail", "routing spine"],
      symbols: ["TriLane", "qwen3:4b", "mistral-small:24b", "deepseek-r1:32b"],
      tags: ["routing", "models"],
    },
    {
      title: "Chronos",
      source_type: "v3_module",
      source_path: path.join(repoRoot, "orangebox-v3", "docs", "V3_MASTER_LEDGER.md"),
      authority_level: 2,
      aliases: ["visual time travel", "scrubber", "timeline restore", "iteration restore", "screenshot history", "UI rollback"],
      symbols: ["Chronos", "chronos_iteration"],
      tags: ["visual", "timeline", "rollback"],
    },
    {
      title: "Omni-Vision",
      source_type: "v3_module",
      source_path: path.join(repoRoot, "orangebox-v3", "vision", "inspect-page.ts"),
      authority_level: 2,
      aliases: ["Retina Loop", "screenshot inspector", "visual QA", "CSSOM eye", "A11y eye", "source mapped screenshot", "source mapped screenshot inspection"],
      symbols: ["Omni-Vision", "CSSOM", "accessibility snapshot"],
      tags: ["visual", "inspection"],
    },
    {
      title: "Ghost Worktree",
      source_type: "v3_module",
      source_path: path.join(repoRoot, "orangebox-v3", "ghost", "README.md"),
      authority_level: 3,
      aliases: ["shadow branch", "safe edit workspace", "hidden worktree", "sandbox branch", "agent branch", "rollback workspace", "safe hidden branch"],
      symbols: ["GhostEnvelope", "git worktree"],
      tags: ["git", "rollback", "safety"],
    },
    {
      title: "ChatBackup",
      source_type: "backend_ops",
      source_path: path.join(repoRoot, "scripts", "v4", "chatbackup-status.mjs"),
      authority_level: 3,
      aliases: ["chat compaction", "chat mirror", "account independence", "restore packet", "screenplay backup"],
      symbols: ["ChatBackup", "chat-mirror", "restore-packet"],
      tags: ["memory", "backup"],
    },
    {
      title: "MCP Context7",
      source_type: "candidate_lane",
      source_path: path.join(repoRoot, "scripts", "v4", "mcp-doctor.mjs"),
      authority_level: 2,
      aliases: ["fresh documentation lane", "docs hydration", "Context7", "MCP docs", "versioned docs"],
      symbols: ["MCP", "Context7"],
      tags: ["docs", "mcp"],
    },
    {
      title: "NO_REWRITE / Option F",
      source_type: "architecture_rule",
      source_path: path.join(repoRoot, "orangebox-v3", "docs", "V3_MASTER_LEDGER.md"),
      authority_level: 4,
      aliases: ["known bad full rewrite", "full rewrite ghost", "V3-F Ghost", "rewrite quarantine", "no rewrite"],
      symbols: ["Option F", "V3-F", "NO_REWRITE"],
      tags: ["authority", "rewrite"],
    },
  ];
}
