/* freeze-guard.mjs - v6.0.2 OS-level edit-scope enforcement plus Freeze-All dispatch pause. */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const FREEZE_ALL_ROOT = "C:\\__ORANGEBOX_FREEZE_ALL__";

function lockPath() {
  const root = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  return path.join(root, "freeze.json");
}

function samePath(a, b) {
  try {
    return path.resolve(String(a || "")).toLowerCase() === path.resolve(String(b || "")).toLowerCase();
  } catch {
    return String(a || "").toLowerCase() === String(b || "").toLowerCase();
  }
}

export function isFreezeAll(state = getFreezeState()) {
  return !!(state?.active && state?.scope === "global" && samePath(state?.root, FREEZE_ALL_ROOT));
}

export function getFreezeState() {
  try {
    const p = lockPath();
    if (!fs.existsSync(p)) return { active: false, freeze_all: false };
    const raw = JSON.parse(fs.readFileSync(p, "utf8").replace(/^\uFEFF/, ""));
    const state = {
      active: !!raw.active,
      root: raw.root || null,
      scope: raw.scope || "global",
      projects: raw.projects || {},
    };
    return { ...state, freeze_all: isFreezeAll(state) };
  } catch {
    return { active: false, freeze_all: false };
  }
}

export function setFreeze({ active, root, scope = "global", project = null } = {}) {
  const cur = getFreezeState();
  const next = { ...cur, active: !!active };
  if (scope === "per-project" && project) {
    next.scope = "per-project";
    next.projects = { ...(cur.projects || {}), [project]: { active: !!active, root: root || null } };
  } else {
    next.scope = "global";
    next.root = root || null;
  }
  next.freeze_all = isFreezeAll(next);
  const p = lockPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(next, null, 2));
  return next;
}

export function dispatchAllowed(operation = "operation") {
  const state = getFreezeState();
  if (!isFreezeAll(state)) return { allowed: true, state };
  return {
    allowed: false,
    status: "FROZEN",
    error: "ORANGEBOX Freeze-All is active. New dispatches, agent runs, rule engines, and mutations are paused until the operator unfreezes.",
    operation,
    freeze: state,
  };
}

// Returns { allowed, reason }. allowed=true means caller may write. allowed=false means block.
export function checkPathAllowed(absPath, { project = null } = {}) {
  const s = getFreezeState();
  if (!s.active) return { allowed: true };
  let lockedRoot = s.root;
  if (s.scope === "per-project" && project && s.projects[project]?.active) {
    lockedRoot = s.projects[project].root;
  }
  if (!lockedRoot) return { allowed: true };
  const norm = path.resolve(absPath);
  const root = path.resolve(lockedRoot);
  const sep = path.sep;
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  const ok = norm === root || norm.startsWith(rootWithSep);
  if (ok) return { allowed: true };
  return { allowed: false, reason: `FROZEN: edits restricted to ${root}, attempted ${norm}` };
}
