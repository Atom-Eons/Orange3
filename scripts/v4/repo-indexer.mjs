/* repo-indexer.mjs — v6.1.0 lightweight workspace index.
   Walks the workspace, captures: file path, size, sha256(first 64KB), top-level
   symbols (function/class/struct/etc.), and 200-char preview. Stored in-memory
   per-workspace; rebuilt on demand. Token-cheap proxy for Cursor's repo index.

   This is NOT a vector embedding store (that's v6.2 with a real sqlite-vec
   integration). It's a fast keyword index suitable for grep / "where is X
   defined" / file-relevance ranking.
*/
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const EXT_TO_LANG = {
  ".js": "javascript", ".mjs": "javascript", ".ts": "typescript", ".tsx": "typescript",
  ".jsx": "javascript", ".rs": "rust", ".py": "python", ".go": "go", ".java": "java",
  ".rb": "ruby", ".php": "php", ".cs": "csharp", ".c": "c", ".cpp": "cpp", ".h": "c",
  ".md": "markdown", ".json": "json", ".toml": "toml", ".yaml": "yaml", ".yml": "yaml",
  ".sh": "shell", ".ps1": "powershell", ".bash": "shell", ".mjs": "javascript",
};

// Symbol extractors (cheap regex; not AST)
const SYMBOL_PATTERNS = {
  javascript: [
    { re: /^export\s+(?:async\s+)?function\s+(\w+)/gm,        kind: "fn" },
    { re: /^export\s+(?:default\s+)?class\s+(\w+)/gm,         kind: "class" },
    { re: /^export\s+const\s+(\w+)\s*=/gm,                    kind: "const" },
    { re: /^(?:async\s+)?function\s+(\w+)/gm,                 kind: "fn" },
    { re: /^class\s+(\w+)/gm,                                 kind: "class" },
  ],
  typescript: [
    { re: /^export\s+(?:async\s+)?function\s+(\w+)/gm,        kind: "fn" },
    { re: /^export\s+(?:default\s+)?class\s+(\w+)/gm,         kind: "class" },
    { re: /^export\s+interface\s+(\w+)/gm,                    kind: "interface" },
    { re: /^export\s+type\s+(\w+)/gm,                         kind: "type" },
    { re: /^export\s+const\s+(\w+)/gm,                        kind: "const" },
  ],
  rust: [
    { re: /^(?:pub\s+)?fn\s+(\w+)/gm,                         kind: "fn" },
    { re: /^(?:pub\s+)?struct\s+(\w+)/gm,                     kind: "struct" },
    { re: /^(?:pub\s+)?enum\s+(\w+)/gm,                       kind: "enum" },
    { re: /^(?:pub\s+)?trait\s+(\w+)/gm,                      kind: "trait" },
    { re: /^impl(?:\s*<[^>]+>)?\s+(?:\w+\s+for\s+)?(\w+)/gm,  kind: "impl" },
  ],
  python: [
    { re: /^def\s+(\w+)/gm,                                   kind: "fn" },
    { re: /^class\s+(\w+)/gm,                                 kind: "class" },
    { re: /^async\s+def\s+(\w+)/gm,                           kind: "fn" },
  ],
  go: [
    { re: /^func\s+(?:\([^)]+\)\s+)?(\w+)/gm,                 kind: "fn" },
    { re: /^type\s+(\w+)\s+struct/gm,                         kind: "struct" },
  ],
};

const INDEX = new Map(); // workspace -> { built_at, files: [...] }

function extractSymbols(lang, content) {
  const patterns = SYMBOL_PATTERNS[lang] || [];
  const symbols = [];
  for (const { re, kind } of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(content)) !== null) {
      symbols.push({ name: m[1], kind, line: content.slice(0, m.index).split("\n").length });
      if (symbols.length > 200) break; // cap per file
    }
  }
  return symbols;
}

const SKIP_DIRS = new Set([
  "node_modules", ".git", "target", "dist", "build", ".next", ".nuxt",
  "__pycache__", ".venv", "venv", ".cargo", ".rustup", "out", ".angular",
]);

const SKIP_EXTS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".lib", ".a", ".o", ".obj",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp",
  ".mp3", ".mp4", ".wav", ".webm", ".mov", ".avi",
  ".zip", ".tar", ".gz", ".rar", ".7z",
  ".pdf", ".pdb",
]);

export async function buildIndex({ workspace, max_files = 5000, max_bytes_per_file = 200_000 }) {
  const t0 = Date.now();
  const files = [];
  async function walk(dir) {
    if (files.length >= max_files) return;
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (files.length >= max_files) return;
      if (e.name.startsWith(".") && e.name !== ".env.example") continue;
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (SKIP_EXTS.has(ext)) continue;
        try {
          const stat = await fs.stat(full);
          if (stat.size > max_bytes_per_file) {
            files.push({ path: full, size: stat.size, lang: EXT_TO_LANG[ext] || "text", symbols: [], preview: "(too large for full index)", sha256: null });
            continue;
          }
          const content = await fs.readFile(full, "utf8");
          const lang = EXT_TO_LANG[ext] || "text";
          const symbols = extractSymbols(lang, content);
          const preview = content.slice(0, 200).replace(/\s+/g, " ").trim();
          const sha = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
          files.push({ path: full, size: stat.size, lang, symbols, preview, sha256: sha });
        } catch { /* binary or unreadable */ }
      }
    }
  }
  await walk(workspace);
  const index = { built_at: Date.now(), workspace, files, took_ms: Date.now() - t0 };
  INDEX.set(workspace, index);
  return index;
}

export function getIndex(workspace) {
  return INDEX.get(workspace) || null;
}

export function summary(workspace) {
  const ix = INDEX.get(workspace);
  if (!ix) return { ok: false, error: "no index — call build first" };
  const langs = {};
  let totalSymbols = 0;
  for (const f of ix.files) {
    langs[f.lang] = (langs[f.lang] || 0) + 1;
    totalSymbols += (f.symbols || []).length;
  }
  return {
    ok: true,
    workspace,
    built_at: ix.built_at,
    file_count: ix.files.length,
    total_symbols: totalSymbols,
    langs,
    took_ms: ix.took_ms,
  };
}

export function findSymbol(workspace, name) {
  const ix = INDEX.get(workspace);
  if (!ix) return { ok: false, error: "no index" };
  const hits = [];
  for (const f of ix.files) {
    for (const s of (f.symbols || [])) {
      if (s.name === name || s.name.toLowerCase() === name.toLowerCase()) {
        hits.push({ file: f.path, lang: f.lang, name: s.name, kind: s.kind, line: s.line });
      }
    }
  }
  return { ok: true, hits, count: hits.length };
}

export function searchSymbolPrefix(workspace, prefix, limit = 20) {
  const ix = INDEX.get(workspace);
  if (!ix) return { ok: false, error: "no index" };
  const lp = prefix.toLowerCase();
  const hits = [];
  for (const f of ix.files) {
    for (const s of (f.symbols || [])) {
      if (s.name.toLowerCase().startsWith(lp)) {
        hits.push({ file: f.path, lang: f.lang, name: s.name, kind: s.kind, line: s.line });
        if (hits.length >= limit) return { ok: true, hits };
      }
    }
  }
  return { ok: true, hits };
}
