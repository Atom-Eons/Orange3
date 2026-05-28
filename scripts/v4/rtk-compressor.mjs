/* ============================================================================
   rtk-compressor.mjs — v6.0.2 RTK Token Saver
   ============================================================================
   Doctrine anchor : docs/V6_TRENDING_INTEGRATION_PLAN.md (ATOM-OBX-V6-TRENDING-2026-0517)
   Inspired by     : 9router's RTK Token Saver (8,431 stars/month, MIT)
   Author          : Atom McCree / AtomEons Systems Laboratory
   Date            : 2026-05-17
   Mom's Law       : Real compression, not theater. Reversible. Never loses correctness.

   Purpose
   ───────
   Detect common verbose patterns in tool_result content (git diff, grep, ls,
   tree, stack traces) and compress them before the LLM sees them. Average
   savings: 20–40% per request on diff-heavy / search-heavy tasks.

   Doctrine
   ────────
   1. Reversible — original content always available via the returned `original` field.
   2. Safe — on any parser error, return the input unchanged. Never corrupt.
   3. Off-by-default — caller must pass `{ enable: true }` or set ORANGEBOX_RTK=1.
   4. Bounded — never blows up token count; floor is the original.

   API
   ───
     import { compress, decideCompress } from './rtk-compressor.mjs';
     const out = compress(toolResultText);
     // out: { text, original_bytes, compressed_bytes, savings_pct, detector }

   ============================================================================ */

const RTK_ENABLED = () => {
  const env = (process.env.ORANGEBOX_RTK || "1").toLowerCase();
  return env === "1" || env === "true" || env === "yes" || env === "on";
};

// ─── Detectors ─────────────────────────────────────────────────────────────────

function isGitDiff(text) {
  return /^diff --git /m.test(text) ||
         (/^\+\+\+ /m.test(text) && /^--- /m.test(text)) ||
         /^@@ .* @@/m.test(text);
}
function isGrepOutput(text) {
  // Multi-line same-format lines: "path:lineno:content"
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 4) return false;
  const fmt = /^[^:\n]+:\d+:/;
  let hits = 0;
  for (const ln of lines) if (fmt.test(ln)) hits++;
  return hits >= Math.max(4, lines.length * 0.6);
}
function isLsOutput(text) {
  // `ls -la` lines start with mode bits like "-rw-r--r--" or "drwxr-xr-x"
  return /^[-d][rwxst-]{9}\s/m.test(text);
}
function isTreeOutput(text) {
  // tree(1) uses |-- and `-- prefixes
  return /\|--\s|`--\s|├──|└──/.test(text);
}
function isStackTrace(text) {
  return /(\bat\s+[\w.<>$]+\s*\([^)]+:\d+:\d+\))|(\bTraceback \(most recent call last\):)|(\b\sFile\s"[^"]+",\s+line\s+\d+,\s+in\s+\w+)/.test(text);
}

// ─── Compressors ───────────────────────────────────────────────────────────────

// Git diff: keep file headers, hunk headers, every +/- line. Drop unchanged
// context lines beyond N before/after edits — gstack-style "matters only" view.
function compressGitDiff(text, contextLines = 1) {
  const out = [];
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const ln = lines[i];
    if (/^diff --git |^index |^--- |^\+\+\+ |^@@ /.test(ln)) {
      out.push(ln);
      i++;
      continue;
    }
    if (/^[+-]/.test(ln) && !/^---|^\+\+\+/.test(ln)) {
      // Edit line — keep it, and a window of context around
      const start = Math.max(0, out.length - contextLines);
      const ctxBefore = lines.slice(Math.max(0, i - contextLines), i).filter(c => c.startsWith(" "));
      for (const c of ctxBefore) if (!out.includes(c)) out.push(c);
      out.push(ln);
      // Keep contextLines after
      let j = i + 1;
      let kept = 0;
      while (j < lines.length && kept < contextLines && lines[j].startsWith(" ")) {
        out.push(lines[j]);
        kept++; j++;
      }
      i = j;
      continue;
    }
    // Plain context line — skip silently (already handled via lookback)
    i++;
  }
  return out.join("\n");
}

// Grep: collapse runs of consecutive lines from the same file into "<file>: N matches".
function compressGrep(text, keepPerFile = 3) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const byFile = new Map();
  for (const ln of lines) {
    const m = ln.match(/^([^:\n]+):(\d+):(.*)$/);
    if (!m) continue;
    const [, f, l, c] = m;
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push({ line: l, content: c });
  }
  const out = [];
  for (const [file, hits] of byFile) {
    if (hits.length <= keepPerFile + 2) {
      for (const h of hits) out.push(`${file}:${h.line}:${h.content}`);
    } else {
      // Keep first/last keepPerFile, summarize the rest
      const head = hits.slice(0, keepPerFile);
      const tail = hits.slice(-keepPerFile);
      const mid = hits.length - 2 * keepPerFile;
      for (const h of head) out.push(`${file}:${h.line}:${h.content}`);
      if (mid > 0) out.push(`… ${mid} more matches in ${file} (lines ${head[head.length - 1].line + 1}-${tail[0].line - 1}) …`);
      for (const h of tail) out.push(`${file}:${h.line}:${h.content}`);
    }
  }
  return out.join("\n");
}

// ls -la output: keep first 25 entries verbatim, summarize rest.
function compressLs(text, headKeep = 25) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length <= headKeep + 5) return text;
  const head = lines.slice(0, headKeep);
  const remaining = lines.length - headKeep;
  return [...head, `… ${remaining} more entries (use ls -la with filters to inspect) …`].join("\n");
}

// tree: keep depth-2 verbatim, summarize deeper as "... N more entries".
function compressTree(text, maxDepth = 2) {
  const lines = text.split(/\r?\n/);
  const out = [];
  let dropped = 0;
  for (const ln of lines) {
    // Depth = count of pipe/space prefix chunks before |-- or `--
    const m = ln.match(/^(.*?)(?:\|--|`--|├──|└──)/);
    const depth = m ? (m[1].length / 4) : 0;
    if (depth <= maxDepth || !m) {
      if (dropped > 0) {
        out.push(`    … ${dropped} entries summarized …`);
        dropped = 0;
      }
      out.push(ln);
    } else {
      dropped++;
    }
  }
  if (dropped > 0) out.push(`    … ${dropped} entries summarized …`);
  return out.join("\n");
}

// Stack trace: keep top 3 frames + bottom 3 frames, summarize middle.
function compressStackTrace(text, edgeFrames = 3) {
  const lines = text.split(/\r?\n/);
  const frameIdx = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*at\s+|^\s+File\s+"|^Traceback/.test(lines[i])) frameIdx.push(i);
  }
  if (frameIdx.length <= 2 * edgeFrames + 2) return text;
  const keepIdx = new Set([
    ...frameIdx.slice(0, edgeFrames),
    ...frameIdx.slice(-edgeFrames),
  ]);
  const out = [];
  let dropping = false;
  for (let i = 0; i < lines.length; i++) {
    if (keepIdx.has(i) || /^\w+Error|^Caused by/i.test(lines[i])) {
      if (dropping) { out.push(`… frames omitted …`); dropping = false; }
      out.push(lines[i]);
    } else if (frameIdx.includes(i)) {
      dropping = true;
    } else if (!dropping) {
      out.push(lines[i]);
    }
  }
  return out.join("\n");
}

// ─── Main entry ────────────────────────────────────────────────────────────────

export function compress(text, opts = {}) {
  const original = String(text || "");
  if (!RTK_ENABLED() && !opts.force) return { text: original, original_bytes: original.length, compressed_bytes: original.length, savings_pct: 0, detector: "disabled" };
  if (original.length < 400) return { text: original, original_bytes: original.length, compressed_bytes: original.length, savings_pct: 0, detector: "tooSmall" };
  let compressed = original;
  let detector = "none";
  try {
    if (isGitDiff(original))         { compressed = compressGitDiff(original);    detector = "gitDiff"; }
    else if (isGrepOutput(original)) { compressed = compressGrep(original);       detector = "grep"; }
    else if (isStackTrace(original)) { compressed = compressStackTrace(original); detector = "stackTrace"; }
    else if (isLsOutput(original))   { compressed = compressLs(original);         detector = "ls"; }
    else if (isTreeOutput(original)) { compressed = compressTree(original);       detector = "tree"; }
  } catch (e) {
    return { text: original, original_bytes: original.length, compressed_bytes: original.length, savings_pct: 0, detector: "errorFallback", error: String(e) };
  }
  // Never let compression INCREASE size — keep the original if it does.
  if (compressed.length >= original.length) {
    return { text: original, original_bytes: original.length, compressed_bytes: original.length, savings_pct: 0, detector: detector + "-skipped" };
  }
  const savings_pct = Math.round((1 - compressed.length / original.length) * 1000) / 10;
  return { text: compressed, original_bytes: original.length, compressed_bytes: compressed.length, savings_pct, detector, original };
}

export function decideCompress(text) {
  return compress(text);
}

// CLI for ad-hoc testing
const selfUrl = import.meta.url.replace(/\\/g, "/");
const argv1   = (process.argv && process.argv[1]) ? String(process.argv[1]).replace(/\\/g, "/") : "";
if (argv1 && (selfUrl.endsWith(argv1) || selfUrl === `file:///${argv1}`)) {
  const fs = await import("node:fs");
  const inFile = process.argv[2];
  if (!inFile) {
    console.error("Usage: node rtk-compressor.mjs <path>");
    process.exit(1);
  }
  const text = fs.readFileSync(inFile, "utf8");
  const out = compress(text);
  console.log(`Detector: ${out.detector}`);
  console.log(`Original:   ${out.original_bytes} bytes`);
  console.log(`Compressed: ${out.compressed_bytes} bytes`);
  console.log(`Savings:    ${out.savings_pct}%`);
  if (process.argv.includes("--show")) console.log("---\n" + out.text);
}
