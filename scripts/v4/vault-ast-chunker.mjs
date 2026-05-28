/* vault-ast-chunker.mjs — v6.0.2 function/class-boundary chunking
   (claude-context pattern, but regex-based — no tree-sitter dep so we keep
   binary size flat. Quality ~85% of AST splitter for our supported set.)

   Each chunk: { file, lang, kind, name, start_line, end_line, content } */
import fs   from "node:fs";
import path from "node:path";

const LANG_BY_EXT = {
  ".js": "js", ".mjs": "js", ".cjs": "js",
  ".ts": "ts", ".tsx": "ts",
  ".py": "py",
  ".rs": "rust",
  ".go": "go",
  ".java": "java",
  ".rb": "ruby",
  ".php": "php",
  ".swift": "swift",
  ".kt": "kotlin",
  ".md": "md",
};

// Per-language top-level binding regexps
const BINDINGS = {
  js: [
    { kind: "function", re: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(/ },
    { kind: "function", re: /^(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/ },
    { kind: "class",    re: /^(?:export\s+)?class\s+(\w+)/ },
    { kind: "function", re: /^(?:export\s+)?(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/ },
  ],
  ts: [
    { kind: "function",  re: /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*[<(]/ },
    { kind: "function",  re: /^(?:export\s+)?const\s+(\w+)\s*[:=]/ },
    { kind: "class",     re: /^(?:export\s+)?(?:abstract\s+)?class\s+(\w+)/ },
    { kind: "interface", re: /^(?:export\s+)?interface\s+(\w+)/ },
    { kind: "type",      re: /^(?:export\s+)?type\s+(\w+)/ },
  ],
  py: [
    { kind: "function", re: /^(?:async\s+)?def\s+(\w+)\s*\(/ },
    { kind: "class",    re: /^class\s+(\w+)/ },
  ],
  rust: [
    { kind: "function", re: /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/ },
    { kind: "struct",   re: /^(?:pub\s+)?struct\s+(\w+)/ },
    { kind: "enum",     re: /^(?:pub\s+)?enum\s+(\w+)/ },
    { kind: "impl",     re: /^impl(?:<[^>]+>)?\s+(\w+)/ },
    { kind: "trait",    re: /^(?:pub\s+)?trait\s+(\w+)/ },
  ],
  go: [
    { kind: "function", re: /^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/ },
    { kind: "type",     re: /^type\s+(\w+)\s+(?:struct|interface)/ },
  ],
};

const FALLBACK_CHARS = 800;

export function chunkFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const ext = path.extname(filePath).toLowerCase();
  const lang = LANG_BY_EXT[ext] || null;
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  if (!lang || !BINDINGS[lang]) return charFallback(filePath, raw, lang || "txt");

  const bindings = BINDINGS[lang];
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    for (const b of bindings) {
      const m = b.re.exec(ln);
      if (m) {
        hits.push({ idx: i, kind: b.kind, name: m[1] });
        break;
      }
    }
  }
  if (hits.length === 0) return charFallback(filePath, raw, lang);

  const chunks = [];
  for (let h = 0; h < hits.length; h++) {
    const start = hits[h].idx;
    const end = h + 1 < hits.length ? hits[h + 1].idx : lines.length;
    const content = lines.slice(start, end).join("\n");
    chunks.push({
      file: filePath,
      lang,
      kind: hits[h].kind,
      name: hits[h].name,
      start_line: start + 1,
      end_line: end,
      content,
    });
  }
  return chunks;
}

function charFallback(filePath, raw, lang) {
  const chunks = [];
  let i = 0, n = 0;
  while (i < raw.length) {
    const slice = raw.slice(i, i + FALLBACK_CHARS);
    chunks.push({
      file: filePath,
      lang,
      kind: "block",
      name: `chunk_${n}`,
      start_line: raw.slice(0, i).split(/\r?\n/).length,
      end_line: raw.slice(0, i + slice.length).split(/\r?\n/).length,
      content: slice,
    });
    i += FALLBACK_CHARS;
    n += 1;
  }
  return chunks;
}
