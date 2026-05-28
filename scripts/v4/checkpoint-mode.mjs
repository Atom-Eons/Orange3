/* checkpoint-mode.mjs — v6.0.2 continuous checkpoint commits (gstack pattern)
   When ORANGEBOX_CHECKPOINT_MODE=continuous, every receipt also produces a WIP
   commit with an [orangebox-context] body block capturing decisions, remaining
   work, and especially TRIED-AND-FAILED approaches. /context/restore parses
   these. */
import fs    from "node:fs";
import path  from "node:path";
import os    from "node:os";
import { spawnSync } from "node:child_process";

function isContinuous() {
  const v = (process.env.ORANGEBOX_CHECKPOINT_MODE || "off").toLowerCase();
  return v === "continuous" || v === "on" || v === "1";
}

function gitTopLevel(cwd) {
  const r = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

function buildBody(opts) {
  const lines = [];
  lines.push("[orangebox-context]");
  if (opts.decisions) lines.push("Decisions: " + opts.decisions);
  if (opts.remaining) lines.push("Remaining: " + opts.remaining);
  if (opts.tried)     lines.push("Tried: "     + opts.tried);
  if (opts.skill)     lines.push("Skill: "     + opts.skill);
  lines.push("[/orangebox-context]");
  return lines.join("\n");
}

export function maybeCheckpoint(receipt, opts = {}) {
  if (!isContinuous()) return { wrote: false };
  const cwd = opts.cwd || process.cwd();
  const repoRoot = gitTopLevel(cwd);
  if (!repoRoot) return { wrote: false, reason: "not a git repo" };
  // Don't checkpoint if there are no changes
  const status = spawnSync("git", ["-C", repoRoot, "status", "--porcelain"], { encoding: "utf8" });
  if (status.status !== 0 || !status.stdout.trim()) return { wrote: false, reason: "no changes to checkpoint" };

  const title = String(receipt?.title || "WIP").slice(0, 80);
  const summary = String(receipt?.summary || "").slice(0, 200);
  const tried = opts.tried || receipt?.evidence?.tried || "";

  const subject = "WIP: " + title;
  const body = buildBody({
    decisions: opts.decisions || summary,
    remaining: opts.remaining || receipt?.evidence?.next_steps || "",
    tried,
    skill: opts.skill || receipt?.source || "",
  });

  const addRes = spawnSync("git", ["-C", repoRoot, "add", "-A"], { encoding: "utf8" });
  if (addRes.status !== 0) return { wrote: false, reason: "git add failed: " + addRes.stderr };
  // Use stdin for commit message to preserve newlines without escaping
  const commit = spawnSync("git", ["-C", repoRoot, "commit", "-m", subject, "-m", body, "--no-verify"], { encoding: "utf8" });
  if (commit.status !== 0) return { wrote: false, reason: "git commit failed: " + commit.stderr };
  return { wrote: true, repoRoot, subject };
}

export function listRecentCheckpoints({ cwd = process.cwd(), limit = 20 } = {}) {
  const repoRoot = gitTopLevel(cwd);
  if (!repoRoot) return { ok: false, reason: "not a git repo", items: [] };
  const log = spawnSync("git", ["-C", repoRoot, "log", `--pretty=format:%H%n%s%n%b%n----END----`, `-n`, String(limit), "--all"], { encoding: "utf8", maxBuffer: 1024*1024*4 });
  if (log.status !== 0) return { ok: false, reason: log.stderr, items: [] };
  const items = [];
  const entries = log.stdout.split("----END----").map(s => s.trim()).filter(Boolean);
  for (const entry of entries) {
    const [sha, subject, ...rest] = entry.split("\n");
    if (!subject?.startsWith("WIP:")) continue;
    const body = rest.join("\n");
    const m = body.match(/\[orangebox-context\]([\s\S]*?)\[\/orangebox-context\]/);
    const ctx = {};
    if (m) {
      for (const ln of m[1].split("\n")) {
        const kv = ln.match(/^(Decisions|Remaining|Tried|Skill):\s*(.*)$/);
        if (kv) ctx[kv[1].toLowerCase()] = kv[2].trim();
      }
    }
    items.push({ sha, subject, ctx });
  }
  return { ok: true, repoRoot, items };
}

export function restorePrompt({ cwd = process.cwd(), limit = 5 } = {}) {
  const { items, ok, reason } = listRecentCheckpoints({ cwd, limit });
  if (!ok) return { ok: false, reason };
  if (items.length === 0) return { ok: true, prompt: "(no checkpoints to restore)" };
  const lines = ["## Session restore from continuous-checkpoint commits", ""];
  for (const it of items) {
    lines.push(`### ${it.subject}  (\`${it.sha.slice(0, 8)}\`)`);
    if (it.ctx.decisions) lines.push(`- Decisions: ${it.ctx.decisions}`);
    if (it.ctx.remaining) lines.push(`- Remaining: ${it.ctx.remaining}`);
    if (it.ctx.tried)     lines.push(`- Tried (do not repeat): ${it.ctx.tried}`);
    if (it.ctx.skill)     lines.push(`- Skill: ${it.ctx.skill}`);
    lines.push("");
  }
  return { ok: true, prompt: lines.join("\n"), count: items.length };
}
