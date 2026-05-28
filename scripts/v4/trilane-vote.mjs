/* trilane-vote.mjs — v6.0.11 capture vote/decision outcomes from Trilane fires.
   The operator votes for one leg (or merges) after seeing the parallel responses.
   We persist the vote + emit a `trilane-fire` composite receipt. */
import fs   from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os   from "node:os";
import crypto from "node:crypto";

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
         path.join(process.env.APPDATA || os.homedir(), "com.atomeons.orangebox.command");
}
function voteDir() { return path.join(dataRoot(), "trilane-votes"); }

export async function recordVote({ prompt, mode, winner, legs, reasons = "", adversarial = false }) {
  if (!prompt) throw new Error("prompt required");
  if (!winner) throw new Error("winner required");
  if (!Array.isArray(legs)) throw new Error("legs[] required");
  const dir = voteDir();
  await fs.mkdir(dir, { recursive: true });
  const id = crypto.randomUUID();
  const ts = new Date().toISOString();
  const doc = {
    id, ts,
    prompt,
    mode:    mode || "trilane",
    winner:  String(winner),
    adversarial: !!adversarial,
    legs:    legs.map(l => ({
      role:     l.role || "",
      provider: l.provider || "",
      model:    l.model || "",
      excerpt:  String(l.text || "").slice(0, 1500),
    })),
    reasons: String(reasons).slice(0, 1000),
  };
  const file = path.join(dir, `${ts.replace(/[:.]/g, "-")}_${id}.json`);
  await fs.writeFile(file, JSON.stringify(doc, null, 2));
  return { id, file, ts };
}

export async function listVotes({ limit = 50 } = {}) {
  const dir = voteDir();
  if (!fsSync.existsSync(dir)) return { items: [] };
  const entries = (await fs.readdir(dir)).filter(f => f.endsWith(".json")).sort().reverse().slice(0, limit);
  const items = [];
  for (const f of entries) {
    try {
      const doc = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
      items.push({ id: doc.id, ts: doc.ts, prompt: doc.prompt.slice(0, 200), mode: doc.mode, winner: doc.winner });
    } catch { /* skip */ }
  }
  return { items };
}
