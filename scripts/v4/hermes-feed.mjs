/* hermes-feed.mjs — v6.0.8 parse Hermes Agent feed status into structured items.
   Hermes is the X (Twitter) feed integration we shipped in v5. This module
   normalizes its CLI output / JSON into renderable cards.
   Graceful degradation: if Hermes not installed, returns { ok: false, install_url }. */
import fs   from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

function workspaceRoot() {
  return process.env.ORANGEBOX_WORKSPACE_ROOT ||
         process.env.ORANGEBOX_APP_ROOT      ||
         process.cwd();
}

function hermesStatusScript() {
  const candidates = [
    path.join(workspaceRoot(), "scripts", "v4", "hermes", "hermes-status.mjs"),
    path.join(workspaceRoot(), "..", "scripts", "v4", "hermes", "hermes-status.mjs"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

export async function fetchFeed({ limit = 20 } = {}) {
  const script = hermesStatusScript();
  if (!script) {
    return {
      ok: false,
      installed: false,
      reason: "Hermes status script not found",
      install_url: "https://github.com/NousResearch/hermes-agent",
      hint: "Run: scripts/v4/hermes/INSTALL_HERMES.ps1",
    };
  }
  const out = await new Promise((resolve) => {
    const proc = spawn(process.execPath, [script, "--json", "--limit", String(limit)], {
      cwd: workspaceRoot(), env: process.env, stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => stdout += d.toString("utf8"));
    proc.stderr.on("data", d => stderr += d.toString("utf8"));
    proc.on("close", code => resolve({ code, stdout, stderr }));
    proc.on("error", e => resolve({ code: -1, stdout, stderr: e.message }));
  });
  if (out.code !== 0) {
    return { ok: false, installed: true, reason: out.stderr || `exit ${out.code}`, hint: "Run: hermes claw status" };
  }
  let parsed;
  try { parsed = JSON.parse(out.stdout); } catch { parsed = { raw: out.stdout }; }
  // Try to normalize common Hermes-output shapes
  const items = Array.isArray(parsed?.tweets) ? parsed.tweets
              : Array.isArray(parsed?.items)  ? parsed.items
              : Array.isArray(parsed?.feed)   ? parsed.feed
              : Array.isArray(parsed)         ? parsed
              : [];
  const cards = items.slice(0, limit).map(it => ({
    id:       it.id || it.url || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    author:   it.author || it.user || it.handle || "@?",
    text:     it.text || it.body || it.content || JSON.stringify(it).slice(0, 200),
    ts:       it.ts || it.created_at || it.date || null,
    url:      it.url || null,
    likes:    it.likes ?? it.like_count ?? null,
    reposts:  it.reposts ?? it.retweet_count ?? null,
  }));
  return {
    ok: true,
    installed: true,
    count: cards.length,
    items: cards,
    raw_keys: Object.keys(parsed || {}),
    fetched_at: new Date().toISOString(),
  };
}
