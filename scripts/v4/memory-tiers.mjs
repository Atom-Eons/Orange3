/* memory-tiers.mjs — v6.0.2 4-tier memory consolidation (agentmemory pattern)
   Working → Episodic → Semantic → Procedural.
   Working = raw tool_result snapshots (24h)
   Episodic = session summaries
   Semantic = extracted facts with provenance
   Procedural = workflow patterns
*/
import fs   from "node:fs";
import fsp  from "node:fs/promises";
import path from "node:path";
import os   from "node:os";

function memRoot() {
  const root = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
  return path.join(root, "memory");
}

const TIERS = ["working", "episodic", "semantic", "procedural"];

export function ensureDirs() {
  for (const t of TIERS) fs.mkdirSync(path.join(memRoot(), t), { recursive: true });
  return memRoot();
}

export function write(tier, doc) {
  if (!TIERS.includes(tier)) throw new Error("unknown tier: " + tier);
  ensureDirs();
  const id = doc.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const file = path.join(memRoot(), tier, `${id}.json`);
  const stamped = { id, tier, ts: new Date().toISOString(), access_count: 0, last_accessed: null, score: 1.0, ...doc };
  fs.writeFileSync(file, JSON.stringify(stamped, null, 2));
  return { id, file, tier };
}

export function read(tier, id) {
  const file = path.join(memRoot(), tier, `${id}.json`);
  if (!fs.existsSync(file)) return null;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  doc.access_count = (doc.access_count || 0) + 1;
  doc.last_accessed = new Date().toISOString();
  doc.score = Math.min(1.0, (doc.score || 0.5) + 0.3);
  fs.writeFileSync(file, JSON.stringify(doc, null, 2));
  return doc;
}

export function list(tier, { limit = 100 } = {}) {
  ensureDirs();
  const dir = path.join(memRoot(), tier);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith(".json"))
    .sort().reverse().slice(0, limit)
    .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
}

// Ebbinghaus decay step: score *= 0.95^days_since_access. Below 0.05 = evict.
export function decayStep(tier, { evictThreshold = 0.05 } = {}) {
  ensureDirs();
  const dir = path.join(memRoot(), tier);
  if (!fs.existsSync(dir)) return { tier, examined: 0, evicted: 0 };
  let examined = 0, evicted = 0;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".json"))) {
    const full = path.join(dir, f);
    try {
      const doc = JSON.parse(fs.readFileSync(full, "utf8"));
      examined++;
      const last = new Date(doc.last_accessed || doc.ts || Date.now()).getTime();
      const days = (Date.now() - last) / 86_400_000;
      const k = Math.pow(0.95, days);
      doc.score = (doc.score || 1.0) * k;
      if (doc.score < evictThreshold && tier === "working") {
        fs.unlinkSync(full);
        evicted++;
      } else {
        fs.writeFileSync(full, JSON.stringify(doc, null, 2));
      }
    } catch { /* skip */ }
  }
  return { tier, examined, evicted };
}

// Consolidation pass: working ≥24h old → episodic summary, episodic patterns → semantic.
// (Heavy synthesis is intentionally deferred to caller-side LLM. This module
// only moves docs across tiers based on age + simple aggregation.)
export function consolidate() {
  ensureDirs();
  const moved = { working_to_episodic: 0, episodic_to_semantic: 0 };

  // Working → Episodic (age > 24h)
  const workingDir = path.join(memRoot(), "working");
  for (const f of fs.readdirSync(workingDir).filter(f => f.endsWith(".json"))) {
    const full = path.join(workingDir, f);
    try {
      const doc = JSON.parse(fs.readFileSync(full, "utf8"));
      const age = Date.now() - new Date(doc.ts).getTime();
      if (age < 86_400_000) continue; // <24h, keep
      const epId = `${doc.id}_ep`;
      const summary = (doc.summary || (doc.content || "").slice(0, 200));
      const epDoc = {
        id: epId,
        tier: "episodic",
        ts: new Date().toISOString(),
        from_working: doc.id,
        session_id: doc.session_id || null,
        topic: doc.topic || doc.title || null,
        summary,
        entities: doc.entities || [],
        score: 0.8,
        access_count: 0,
        last_accessed: null,
      };
      fs.writeFileSync(path.join(memRoot(), "episodic", `${epId}.json`), JSON.stringify(epDoc, null, 2));
      fs.unlinkSync(full);
      moved.working_to_episodic++;
    } catch { /* skip */ }
  }

  // Episodic → Semantic: extract recurring topics (≥3 occurrences) as semantic facts.
  const epDir = path.join(memRoot(), "episodic");
  const topicCounts = new Map();
  const topicProvenance = new Map();
  for (const f of fs.readdirSync(epDir).filter(f => f.endsWith(".json"))) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(epDir, f), "utf8"));
      if (!doc.topic) continue;
      topicCounts.set(doc.topic, (topicCounts.get(doc.topic) || 0) + 1);
      const arr = topicProvenance.get(doc.topic) || [];
      arr.push(doc.id);
      topicProvenance.set(doc.topic, arr);
    } catch { /* skip */ }
  }
  const semDir = path.join(memRoot(), "semantic");
  for (const [topic, n] of topicCounts) {
    if (n < 3) continue;
    const semFile = path.join(semDir, `topic_${topic.replace(/[^a-z0-9]/gi, "_").slice(0, 40)}.json`);
    const existing = fs.existsSync(semFile) ? JSON.parse(fs.readFileSync(semFile, "utf8")) : null;
    const newCount = (existing?.episode_count || 0);
    if (n > newCount) {
      const semDoc = {
        id: `sem_${topic.replace(/[^a-z0-9]/gi, "_").slice(0, 40)}`,
        tier: "semantic",
        ts: new Date().toISOString(),
        topic,
        episode_count: n,
        provenance: (topicProvenance.get(topic) || []).slice(-10),
        score: Math.min(1.0, 0.6 + n * 0.05),
        access_count: 0,
        last_accessed: null,
      };
      fs.writeFileSync(semFile, JSON.stringify(semDoc, null, 2));
      moved.episodic_to_semantic++;
    }
  }

  return moved;
}

export function summary() {
  ensureDirs();
  const out = {};
  for (const t of TIERS) {
    const dir = path.join(memRoot(), t);
    out[t] = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith(".json")).length : 0;
  }
  return out;
}
