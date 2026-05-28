/* context-store.mjs — v6.0.2 markdown-file checkpoints (gstack /context-save) */
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";

function projectsRoot() {
  const root = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  return path.join(root, "projects");
}

function slug(s) { return String(s || "default").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 60) || "default"; }
function stamp() { return new Date().toISOString().replace(/[:.]/g, "-"); }

export function saveContext({ project = "default", branch = "main", title = "checkpoint", summary = "", decisions = "", remaining = "", notes = "", files_modified = [], duration_s = null }) {
  const dir = path.join(projectsRoot(), slug(project), "checkpoints");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${stamp()}-${slug(title)}.md`);
  const fm = [
    "---",
    "status: in-progress",
    `branch: ${branch}`,
    `timestamp: ${new Date().toISOString()}`,
    duration_s != null ? `session_duration_s: ${duration_s}` : null,
    "files_modified:",
    ...(files_modified || []).map(f => `  - ${f}`),
    "---",
    "",
  ].filter(Boolean).join("\n");
  const body = [
    `## Working on: ${title}`,
    "",
    "### Summary",
    summary || "(none)",
    "",
    "### Decisions Made",
    decisions || "(none)",
    "",
    "### Remaining Work",
    remaining || "(none)",
    "",
    "### Notes",
    notes || "(none)",
    "",
  ].join("\n");
  fs.writeFileSync(file, fm + body);
  return { file, project: slug(project) };
}

export function listContexts({ project = "default", branch = null } = {}) {
  const dir = path.join(projectsRoot(), slug(project), "checkpoints");
  if (!fs.existsSync(dir)) return { items: [] };
  const entries = fs.readdirSync(dir).filter(f => f.endsWith(".md")).sort().reverse();
  const items = [];
  for (const f of entries) {
    const full = path.join(dir, f);
    const txt = fs.readFileSync(full, "utf8");
    const fm = txt.match(/^---\n([\s\S]*?)\n---/);
    const meta = {};
    if (fm) {
      for (const line of fm[1].split("\n")) {
        const kv = line.match(/^([a-z_]+):\s*(.*)$/);
        if (kv) meta[kv[1]] = kv[2].trim();
      }
    }
    if (branch && meta.branch !== branch) continue;
    const titleMatch = txt.match(/## Working on: (.+)$/m);
    items.push({ path: full, title: titleMatch?.[1] || f, ...meta });
  }
  return { items };
}

export function restoreContext({ path: p }) {
  if (!fs.existsSync(p)) return { ok: false, error: "not found" };
  const txt = fs.readFileSync(p, "utf8");
  return { ok: true, path: p, content: txt };
}
