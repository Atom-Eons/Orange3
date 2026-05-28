/* vault-explorer.mjs — v6.0.9 inspect the CLC lattice WITHOUT needing an API key.
   Reads vault/lattice.jsonl (NDJSON) + vault/index.json (if present) and returns
   stats + recent entries + file-by-file density. */
import fs   from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os   from "node:os";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function vaultDir() { return path.join(dataRoot(), "vault"); }

export async function summary() {
  const dir = vaultDir();
  const out = { exists: fsSync.existsSync(dir), dir, entries: 0, files: 0, bytes: 0, latest_ts: null, by_source: {}, recent: [] };
  if (!out.exists) return out;
  const lattice = path.join(dir, "lattice.jsonl");
  if (fsSync.existsSync(lattice)) {
    const stat = fsSync.statSync(lattice);
    out.bytes = stat.size;
    let raw;
    try {
      raw = await fs.readFile(lattice, "utf8");
    } catch { raw = ""; }
    const lines = raw.split(/\r?\n/).filter(Boolean);
    out.entries = lines.length;
    for (const ln of lines.slice(-50).reverse()) {
      try {
        const obj = JSON.parse(ln);
        out.recent.push({
          ts:     obj.ts || obj.at || null,
          source: obj.source || obj.kind || "?",
          file:   obj.file || obj.path || obj.title || "(no path)",
          tokens: obj.tokens || obj.length || null,
        });
        const src = obj.source || obj.kind || "?";
        out.by_source[src] = (out.by_source[src] || 0) + 1;
        if (!out.latest_ts || (obj.ts || "") > out.latest_ts) out.latest_ts = obj.ts || null;
      } catch { /* skip */ }
    }
  }
  // Count files in vault tree
  function walk(d) {
    let n = 0;
    let entries;
    try { entries = fsSync.readdirSync(d, { withFileTypes: true }); } catch { return 0; }
    for (const e of entries) {
      if (e.isDirectory()) n += walk(path.join(d, e.name));
      else if (e.isFile()) n++;
    }
    return n;
  }
  out.files = walk(dir);
  return out;
}

export async function search(query, { limit = 20 } = {}) {
  const dir = vaultDir();
  const lattice = path.join(dir, "lattice.jsonl");
  if (!fsSync.existsSync(lattice)) return { ok: false, error: "vault/lattice.jsonl missing", hits: [] };
  let raw;
  try { raw = await fs.readFile(lattice, "utf8"); } catch (e) { return { ok: false, error: String(e.message), hits: [] }; }
  const q = String(query || "").toLowerCase();
  const queryTerms = q.split(/\W+/).filter(t => t.length > 2);
  const hits = [];
  for (const ln of raw.split(/\r?\n/).filter(Boolean)) {
    let obj;
    try { obj = JSON.parse(ln); } catch { continue; }
    const text = String(obj.content || obj.text || obj.body || obj.title || "").toLowerCase();
    if (!text) continue;
    let score = 0;
    for (const t of queryTerms) {
      const m = text.match(new RegExp("\\b" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "gi"));
      if (m) score += m.length;
    }
    if (score > 0) {
      hits.push({
        score,
        ts:     obj.ts || obj.at || null,
        source: obj.source || obj.kind || "?",
        file:   obj.file || obj.path || obj.title || "?",
        excerpt: String(obj.content || obj.text || "").slice(0, 300),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score);
  return { ok: true, hits: hits.slice(0, limit), total_scanned: raw.split(/\r?\n/).filter(Boolean).length };
}
