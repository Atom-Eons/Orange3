CREATE TABLE IF NOT EXISTS memory_card (
  card_id TEXT PRIMARY KEY,
  source_path TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_hash TEXT,
  source_size INTEGER DEFAULT 0,
  source_mtime TEXT,
  authority_level INTEGER DEFAULT 0,
  title TEXT,
  symbols_json TEXT DEFAULT '[]',
  aliases_json TEXT DEFAULT '[]',
  tags_json TEXT DEFAULT '[]',
  receipt_id TEXT,
  soul_genome_ref TEXT,
  atom_smasher_ref TEXT,
  created_at TEXT,
  updated_at TEXT,
  index_version TEXT,
  embedding_model TEXT,
  chunk_count INTEGER DEFAULT 0,
  search_text TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS memory_chunk_pointer (
  chunk_id TEXT PRIMARY KEY,
  card_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  source_path TEXT NOT NULL,
  byte_start INTEGER DEFAULT 0,
  byte_end INTEGER DEFAULT 0,
  line_start INTEGER DEFAULT 0,
  line_end INTEGER DEFAULT 0,
  chunk_hash TEXT,
  heading_path TEXT,
  symbols_json TEXT DEFAULT '[]',
  aliases_json TEXT DEFAULT '[]',
  authority_level INTEGER DEFAULT 0,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_embedding (
  chunk_id TEXT PRIMARY KEY,
  vector_json TEXT,
  dimensions INTEGER DEFAULT 0,
  model TEXT,
  created_at TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS k3_fts USING fts5(card_id UNINDEXED, search_text);
