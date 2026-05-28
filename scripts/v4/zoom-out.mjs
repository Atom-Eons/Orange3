/* zoom-out.mjs — v6.0.3 higher-level perspective on unfamiliar code sections.
   Inspired by mattpocock/skills/zoom-out. Given a file or directory, produce
   a single-paragraph structural summary: what role this plays, what depends
   on it, what it depends on, and where to start reading. */
import fs   from "node:fs";
import fsp  from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set(["node_modules", "target", ".git", "dist", "build", ".next", "coverage", ".cache", "__pycache__", ".venv", "venv"]);

export async function zoomOut({ root, workspace = null, maxFiles = 80 } = {}) {
  if (!root || !fs.existsSync(root)) return { error: "root not found", root };
  const stat = fs.statSync(root);
  const repo = workspace || (stat.isDirectory() ? root : path.dirname(root));

  const files = stat.isDirectory() ? await listFiles(root, maxFiles) : [root];

  // Light-weight import-graph extraction (regex-based; covers ES modules + CJS)
  const importers = new Map();   // target → who imports it
  const imports   = new Map();   // file → list of imports it has
  for (const f of files) {
    let text;
    try { text = await fsp.readFile(f, "utf8"); } catch { continue; }
    const found = [];
    for (const m of text.matchAll(/(?:import\s+(?:[^"';]+?from\s+)?|require\s*\()\s*["']([^"']+)["']/g)) {
      found.push(m[1]);
      if (m[1].startsWith(".")) {
        const resolved = path.resolve(path.dirname(f), m[1]);
        const arr = importers.get(resolved) || [];
        arr.push(f); importers.set(resolved, arr);
      }
    }
    imports.set(f, found);
  }

  // Pick "entry points": files in this set that nothing else in this set imports
  const inSet = new Set(files.map(f => path.resolve(f)));
  const entryPoints = files.filter(f => {
    const imp = importers.get(path.resolve(f));
    // Heuristic: file is an entry if it has imports but nothing in our set imports it
    if (!imp) return imports.get(f)?.length;
    return false;
  });

  // Pick "hubs": files most-imported within the set
  const hubScores = [];
  for (const [k, v] of importers) {
    if (inSet.has(k)) hubScores.push({ file: k, refs: v.length });
  }
  hubScores.sort((a, b) => b.refs - a.refs);
  const topHubs = hubScores.slice(0, 5);

  // Map exports per file (rough — names of exported symbols)
  const exportsMap = {};
  for (const f of files.slice(0, 30)) {
    try {
      const text = await fsp.readFile(f, "utf8");
      const names = [];
      for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class|interface|type)\s+(\w+)/g)) names.push(m[1]);
      for (const m of text.matchAll(/export\s+\{\s*([^}]+)\s*\}/g)) names.push(...m[1].split(",").map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean));
      if (names.length) exportsMap[path.relative(repo, f)] = [...new Set(names)].slice(0, 20);
    } catch { /* skip */ }
  }

  return {
    root,
    files_scanned: files.length,
    entry_points: entryPoints.slice(0, 5).map(f => path.relative(repo, f)),
    top_hubs:     topHubs.map(h => ({ file: path.relative(repo, h.file), referenced_by: h.refs })),
    exports:      exportsMap,
    read_order: [
      ...entryPoints.slice(0, 3),
      ...topHubs.slice(0, 3).map(h => h.file),
    ].filter(Boolean).map(f => path.relative(repo, f)),
    summary: summarize({ root, files: files.length, entryPoints: entryPoints.length, hubs: topHubs.length }),
  };
}

function summarize({ root, files, entryPoints, hubs }) {
  return `${path.basename(root)} contains ${files} source files. Start with ${entryPoints} entry point(s) and ${hubs} hub(s). Read entry points first to learn the surface; read hubs to learn the shared primitives.`;
}

async function listFiles(dir, max) {
  const out = [];
  async function walk(d) {
    if (out.length >= max) return;
    let entries;
    try { entries = await fsp.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= max) return;
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        await walk(path.join(d, e.name));
      } else if (e.isFile()) {
        if (/\.(?:js|mjs|cjs|ts|tsx|jsx|py|rs|go|java|rb|php|swift|kt|md|json|toml)$/.test(e.name)) {
          out.push(path.join(d, e.name));
        }
      }
    }
  }
  await walk(dir);
  return out;
}
