/* project-manager.mjs — v6.2.0 project state for the daily-driver IDE surface.
   Stores recent projects, per-project open tabs, per-project conversation history.
   File layout:
     <dataRoot>/projects/recent.json                — array of {root, name, last_opened_ms}
     <dataRoot>/projects/<sha256(root)>/state.json  — { open_tabs, active_tab, chat }

   Project root is identified by SHA-256 of the absolute path so renaming /
   moving keeps a stable key. Recent list keeps the last 20.
*/
import fs   from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os   from "node:os";
import crypto from "node:crypto";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function projectsDir() { return path.join(dataRoot(), "projects"); }
function recentPath()  { return path.join(projectsDir(), "recent.json"); }
function projectHash(root) {
  return crypto.createHash("sha256").update(path.resolve(root)).digest("hex").slice(0, 16);
}
function projectStatePath(root) {
  return path.join(projectsDir(), projectHash(root), "state.json");
}

// ── Recent projects list ────────────────────────────────────────────────────
export async function listRecent({ limit = 20 } = {}) {
  await fs.mkdir(projectsDir(), { recursive: true });
  if (!fsSync.existsSync(recentPath())) return { items: [] };
  try {
    const txt = await fs.readFile(recentPath(), "utf8");
    const arr = JSON.parse(txt);
    return { items: Array.isArray(arr) ? arr.slice(0, limit) : [] };
  } catch {
    return { items: [] };
  }
}

export async function addRecent({ root }) {
  if (!root) throw new Error("root required");
  const abs = path.resolve(root);
  const name = path.basename(abs);
  await fs.mkdir(projectsDir(), { recursive: true });
  const { items } = await listRecent({ limit: 50 });
  // Dedupe by abs root; bump to top
  const filtered = items.filter(it => path.resolve(it.root) !== abs);
  filtered.unshift({ root: abs, name, last_opened_ms: Date.now() });
  const out = filtered.slice(0, 20);
  await fs.writeFile(recentPath(), JSON.stringify(out, null, 2));
  return { ok: true, count: out.length, added: { root: abs, name } };
}

export async function removeRecent({ root }) {
  const abs = path.resolve(root || "");
  const { items } = await listRecent({ limit: 50 });
  const filtered = items.filter(it => path.resolve(it.root) !== abs);
  await fs.writeFile(recentPath(), JSON.stringify(filtered, null, 2));
  return { ok: true, count: filtered.length };
}

// ── File tree walker (depth-aware, .gitignore-lite) ─────────────────────────
const SKIP_DIRS = new Set([
  "node_modules", ".git", "target", "dist", "build", ".next", ".nuxt",
  "__pycache__", ".venv", "venv", "out", ".angular", "bin", "obj",
]);

const SKIP_EXTS = new Set([
  ".exe", ".dll", ".so", ".dylib", ".lib", ".a", ".o", ".obj",
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".psd",
  ".mp3", ".mp4", ".wav", ".webm", ".mov", ".avi", ".flac",
  ".zip", ".tar", ".gz", ".rar", ".7z", ".pdf", ".pdb",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
]);

/** treeListing({ root, dir, depth })
 * Returns a flat list of entries for ONE directory level (lazy expansion).
 * UI calls this each time a folder is expanded.
 */
export async function treeListing({ root, dir = "" }) {
  if (!root) throw new Error("root required");
  const absRoot = path.resolve(root);
  const target = dir ? path.resolve(absRoot, dir) : absRoot;
  // Security: target must be inside root
  if (!target.startsWith(absRoot)) {
    return { ok: false, error: "path outside project" };
  }
  let entries;
  try { entries = await fs.readdir(target, { withFileTypes: true }); }
  catch (e) { return { ok: false, error: e.message }; }
  const items = [];
  for (const e of entries) {
    if (e.name.startsWith(".") && !["env.example", ".gitignore", ".env.example"].includes(e.name)) continue;
    if (SKIP_DIRS.has(e.name)) continue;
    const isDir = e.isDirectory();
    const ext = isDir ? "" : path.extname(e.name).toLowerCase();
    if (!isDir && SKIP_EXTS.has(ext)) continue;
    items.push({
      name:     e.name,
      type:     isDir ? "dir" : "file",
      ext,
      rel_path: path.relative(absRoot, path.join(target, e.name)).replace(/\\/g, "/"),
    });
  }
  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return { ok: true, root: absRoot, dir, items };
}

// ── Per-project state (open tabs, active tab, chat history) ─────────────────
export async function getState({ root }) {
  if (!root) throw new Error("root required");
  const p = projectStatePath(root);
  if (!fsSync.existsSync(p)) {
    return { ok: true, root: path.resolve(root), open_tabs: [], active_tab: 0, chat: [] };
  }
  try {
    const txt = await fs.readFile(p, "utf8");
    return { ok: true, ...JSON.parse(txt), root: path.resolve(root) };
  } catch (e) {
    return { ok: false, error: e.message, root: path.resolve(root), open_tabs: [], active_tab: 0, chat: [] };
  }
}

export async function saveState({ root, open_tabs, active_tab, chat }) {
  if (!root) throw new Error("root required");
  const p = projectStatePath(root);
  await fs.mkdir(path.dirname(p), { recursive: true });
  const doc = {
    root: path.resolve(root),
    saved_at: new Date().toISOString(),
    open_tabs: Array.isArray(open_tabs) ? open_tabs : [],
    active_tab: Number.isInteger(active_tab) ? active_tab : 0,
    chat: Array.isArray(chat) ? chat : [],
  };
  await fs.writeFile(p, JSON.stringify(doc, null, 2));
  return { ok: true, saved_to: p };
}

// ── Append a chat message (idempotent, lightweight) ─────────────────────────
export async function appendChatMessage({ root, message }) {
  const st = await getState({ root });
  const chat = Array.isArray(st.chat) ? st.chat : [];
  chat.push({ ts: new Date().toISOString(), ...message });
  // Cap at 500 messages
  const trimmed = chat.slice(-500);
  await saveState({ root, open_tabs: st.open_tabs, active_tab: st.active_tab, chat: trimmed });
  return { ok: true, count: trimmed.length };
}

// ── Git branch detection (read-only, no shell-out) ──────────────────────────
export async function gitBranch({ root }) {
  if (!root) return { ok: false, error: "root required" };
  const headPath = path.join(root, ".git", "HEAD");
  if (!fsSync.existsSync(headPath)) return { ok: false, error: "not a git repo" };
  try {
    const txt = (await fs.readFile(headPath, "utf8")).trim();
    if (txt.startsWith("ref: refs/heads/")) {
      return { ok: true, branch: txt.slice("ref: refs/heads/".length) };
    }
    return { ok: true, branch: txt.slice(0, 7), detached: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}
