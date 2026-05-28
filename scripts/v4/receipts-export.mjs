/* receipts-export.mjs — v6.0.11 export receipts to a single markdown bundle.
   Used by Receipts lane Export button. Writes to ~/.orangebox/exports/<timestamp>.md
   and returns the path. Optionally filters by source / date / id-prefix. */
import fs   from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os   from "node:os";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function receiptsDir() { return path.join(dataRoot(), "receipts"); }
function exportsDir()  { return path.join(dataRoot(), "exports"); }

export async function exportMarkdown({ source = null, since = null, limit = 500 } = {}) {
  const rdir = receiptsDir();
  if (!fsSync.existsSync(rdir)) return { ok: false, error: "no receipts directory yet" };
  const sourceFilter = source ? String(source).toLowerCase() : null;
  const sinceTs = since ? new Date(since).getTime() : null;

  // Walk top-level + 1-deep subdirs (composer/, sprint-runner/, etc.)
  const candidates = [];
  for (const e of await fs.readdir(rdir, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith(".json")) candidates.push(path.join(rdir, e.name));
    else if (e.isDirectory()) {
      try {
        for (const f of await fs.readdir(path.join(rdir, e.name))) {
          if (f.endsWith(".json")) candidates.push(path.join(rdir, e.name, f));
        }
      } catch { /* skip */ }
    }
  }
  candidates.sort().reverse();

  const matched = [];
  for (const p of candidates) {
    if (matched.length >= limit) break;
    try {
      const doc = JSON.parse(await fs.readFile(p, "utf8"));
      if (sourceFilter && String(doc.source || "").toLowerCase() !== sourceFilter) continue;
      if (sinceTs && new Date(doc.ts).getTime() < sinceTs) continue;
      matched.push(doc);
    } catch { /* skip */ }
  }

  const out = [];
  out.push(`# OrangeBox Receipts Export`);
  out.push(``);
  out.push(`**Exported:** ${new Date().toISOString()}`);
  out.push(`**Count:** ${matched.length}`);
  if (sourceFilter) out.push(`**Source filter:** \`${sourceFilter}\``);
  if (sinceTs)      out.push(`**Since:** ${since}`);
  out.push(``);
  out.push(`---`);
  out.push(``);

  for (const r of matched) {
    out.push(`## ${r.title || "(no title)"}`);
    out.push(``);
    out.push(`- **Source:** \`${r.source}\``);
    out.push(`- **Timestamp:** ${r.ts}`);
    out.push(`- **ID:** \`${r.id}\``);
    if (r.summary) {
      out.push(``);
      out.push(`${r.summary}`);
    }
    if (r.evidence && Object.keys(r.evidence).length) {
      out.push(``);
      out.push(`### Evidence`);
      out.push(``);
      out.push("```json");
      out.push(JSON.stringify(r.evidence, null, 2));
      out.push("```");
    }
    out.push(``);
    out.push(`---`);
    out.push(``);
  }

  const dir = exportsDir();
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `receipts-${Date.now()}.md`);
  await fs.writeFile(file, out.join("\n"));
  return { ok: true, file, count: matched.length, bytes: (await fs.stat(file)).size };
}
