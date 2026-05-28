/* skills-enumerator.mjs — v6.0.7 enumerate + fire skills/agents/rules
   Reads .claude/skills, .claude/agents, .claude/rules from the workspace
   root (or fallback to install root). Returns a flat catalog the UI can
   render as a searchable list. */
import fs   from "node:fs";
import fsp  from "node:fs/promises";
import path from "node:path";
import os   from "node:os";

function workspaceRoot() {
  return process.env.ORANGEBOX_WORKSPACE_ROOT ||
         process.env.ORANGEBOX_APP_ROOT      ||
         process.cwd();
}

function safeRead(p, limit = 4000) {
  try { return fs.readFileSync(p, "utf8").slice(0, limit); } catch { return ""; }
}

function extractTitle(md) {
  const m = md.match(/^---[\s\S]*?\nname:\s*(.+?)\n[\s\S]*?---/m) ||
            md.match(/^#\s+(.+?)$/m);
  return m ? m[1].trim() : null;
}

function extractDescription(md) {
  const fm = md.match(/^---[\s\S]*?\ndescription:\s*([^\n]+)/m);
  if (fm) return fm[1].trim();
  const lines = md.split(/\r?\n/).filter(Boolean);
  for (const l of lines) {
    if (l.startsWith("#") || l.startsWith("---") || l.startsWith(">")) continue;
    return l.length > 200 ? l.slice(0, 200) + "…" : l;
  }
  return "";
}

async function scanDir(rootDir, kind) {
  if (!fs.existsSync(rootDir)) return [];
  const entries = await fsp.readdir(rootDir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
    const full = path.join(rootDir, e.name);
    if (e.isDirectory()) {
      const skillFile = ["SKILL.md", "skill.md", "README.md", "index.md"].find(n => fs.existsSync(path.join(full, n)));
      if (!skillFile) continue;
      const md = safeRead(path.join(full, skillFile));
      out.push({
        kind,
        name:        e.name,
        title:       extractTitle(md) || e.name,
        description: extractDescription(md),
        path:        path.join(full, skillFile),
        slash:       kind === "skill" ? `/${e.name}` : null,
      });
    } else if (e.isFile() && /\.(md|json)$/.test(e.name)) {
      const md = safeRead(full);
      out.push({
        kind,
        name:        e.name.replace(/\.(md|json)$/, ""),
        title:       extractTitle(md) || e.name,
        description: extractDescription(md),
        path:        full,
        slash:       null,
      });
    }
  }
  return out;
}

export async function listAll() {
  const root = workspaceRoot();
  const dotClaude = path.join(root, ".claude");
  const [skills, agents, rules] = await Promise.all([
    scanDir(path.join(dotClaude, "skills"), "skill"),
    scanDir(path.join(dotClaude, "agents"), "agent"),
    scanDir(path.join(dotClaude, "rules"),  "rule"),
  ]);
  // Also pull our v6.0.2 internal "skill-equivalent" endpoints
  const internal = [
    { kind: "internal", name: "sprint",       title: "Sprint", description: "Think → Plan → Build → Review → Test → Ship composite", path: "/api/v4/sprint/run", slash: "/sprint" },
    { kind: "internal", name: "freeze",       title: "Freeze", description: "Lock fs writes to a directory", path: "/api/v4/freeze/set", slash: "/freeze" },
    { kind: "internal", name: "careful",      title: "Careful", description: "Destructive-command pre-check", path: "/api/v4/careful/check", slash: "/careful" },
    { kind: "internal", name: "context-save", title: "Context save", description: "Markdown checkpoint", path: "/api/v4/context/save", slash: "/context-save" },
    { kind: "internal", name: "checkpoint",   title: "Checkpoint", description: "Continuous WIP commit", path: "/api/v4/checkpoint/save", slash: "/checkpoint" },
    { kind: "internal", name: "memory",       title: "Memory tiers", description: "Working/Episodic/Semantic/Procedural", path: "/api/v4/memory/summary", slash: "/memory" },
    { kind: "internal", name: "incident",     title: "Incident intake", description: "Webhook intake → sprint", path: "/api/v4/incident/intake", slash: "/incident" },
    { kind: "internal", name: "handoff",      title: "Handoff", description: "Agent-to-agent handoff doc", path: "/api/v4/handoff/compose", slash: "/handoff" },
    { kind: "internal", name: "zoom-out",     title: "Zoom out", description: "Higher-level code summary", path: "/api/v4/zoom-out", slash: "/zoom-out" },
    { kind: "internal", name: "caveman",      title: "Caveman", description: "Output token compression", path: "/api/v4/caveman", slash: "/caveman" },
    { kind: "internal", name: "trilane",      title: "Trilane / Quadlane", description: "Multi-model parallel synthesis", path: "/api/v4/router/route", slash: "/trilane" },
    { kind: "internal", name: "composer",     title: "Composer", description: "Multi-file diff plan + apply", path: "/api/v4/composer/plan", slash: "/composer" },
  ];
  return { skills, agents, rules, internal, workspace: root, counts: { skills: skills.length, agents: agents.length, rules: rules.length, internal: internal.length } };
}

export async function fireSkill({ name, prompt = "" }) {
  // We do NOT call LLMs here — we return a structured plan the cockpit can
  // hand to its existing /api/v4/sprint or /api/v4/model/stream pipelines.
  const all = await listAll();
  const found = [...all.skills, ...all.internal, ...all.agents].find(s => s.name === name || s.slash === name);
  if (!found) return { ok: false, error: `skill not found: ${name}` };
  return {
    ok: true,
    skill: found,
    suggested_call: found.kind === "internal" ? {
      method: "POST",
      url:    `http://127.0.0.1:8787${found.path}`,
      body:   { prompt },
    } : {
      method: "POST",
      url:    "http://127.0.0.1:8787/api/v4/sprint/run",
      body:   { prompt: prompt || `Apply skill: ${found.name}\n\n${found.description}`, project: found.name },
    },
  };
}
