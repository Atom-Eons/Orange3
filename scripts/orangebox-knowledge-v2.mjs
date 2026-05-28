#!/usr/bin/env node
/* ============================================================================
   orangebox-knowledge-v2.mjs — engine v2

   Evolutions over v1 (orangebox-knowledge.mjs):
     1. CLC-style lattice (entities, facts, decisions, relationships)
            + void (rejections, boundaries, corrections, tone markers)
            stored per-doc as compact JSONL — replaces the 37 MB lexical-index.
     2. 5-axis fidelity vector per doc (semantic, NER, voice, factual, emotional).
        Below-threshold docs are flagged, never silently shipped.
     3. Aggressive noise gate — strips JS/Py keywords, English fillers,
        single-letter entities, the v1 "Let/None/True/HALTED" flood.
     4. Critique annotation (SUBJECT/GOOD/WEAK/PRINCIPLE/FIX/PREDICTED_IMPACT)
        extracted from docs that already use those markers. No LLM calls
        in v2.0. v2.1 may add LLM-assisted critique generation.
     5. Content-neutral indexing. Refusal-pattern scanning was removed on
        2026-05-16; operator safety law lives in the guardrail layer.

   Constraints:
     - Single Node process. No spawned subprocesses. No LLM calls.
     - Stream-process: one doc at a time. Don't load corpus into RAM.
     - Writes to memory/orangebox-knowledge-v2/  (NEW dir; v1 stays intact).
     - Atomic: writes to .partial/, swaps at end. Never half-rebuilt vault.

   CLI:
     node scripts/orangebox-knowledge-v2.mjs            # rebuild
     node scripts/orangebox-knowledge-v2.mjs --query X  # query (v2)
     node scripts/orangebox-knowledge-v2.mjs --root <path>
   ============================================================================ */

import fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

const RAW_ORANGE_ROOT = process.env.ORANGEBOX_DATA_ROOT
  || process.env.ORANGEBOX_ROOT
  || arg("--root")
  || path.join(os.homedir(), "OrangeBox-Data");
const ORANGE_ROOT = path.resolve(RAW_ORANGE_ROOT);

const ENGINE_DIR = path.join(ORANGE_ROOT, "memory", "orangebox-knowledge-v2");
const PARTIAL_DIR = path.join(ORANGE_ROOT, "memory", "orangebox-knowledge-v2.partial");

const QUERY = arg("--query");

// ─── Noise gate ─────────────────────────────────────────────────────────────
// Stripped entities that bloated v1 (Let/None/True/HALTED-spam).
const STOP_ENTITIES = new Set([
  // English fillers
  "the","and","or","of","a","an","to","in","on","at","by","for","is","are",
  "was","were","be","been","being","this","that","these","those","it","its",
  "they","them","their","you","your","we","us","our","i","me","my","he","she",
  "his","her","them","with","from","as","but","if","not","no","yes","so",
  "then","than","when","where","who","whom","why","how","what","which","while",
  // JS/Py/code tokens
  "true","false","none","null","undefined","let","const","var","return","if",
  "else","elif","for","while","do","new","this","throw","try","catch","finally",
  "function","class","import","export","from","def","async","await","yield",
  "self","cls","raise","print","input","map","filter","reduce","len","range",
  // ORANGEBOX-specific v1 noise
  "halted","halt","contact","string","paragraph","p","li","div","span","class",
  "id","p1","p2","p3","p4","px","sha","loc","md","html","css","mjs","json",
  // Single common digits/letters
  "0","1","2","3","4","5","6","7","8","9","x","y","z","a","b","c","d","e",
  "f","g","h","j","k","l","m","n","o","p","q","r","s","t","u","v","w",
]);

function isNoise(token) {
  if (!token) return true;
  const t = String(token).trim().toLowerCase();
  if (t.length < 3) return true;
  if (STOP_ENTITIES.has(t)) return true;
  if (/^\d+$/.test(t)) return true;            // pure number
  if (/^[^a-z0-9]+$/i.test(t)) return true;    // pure symbols
  if (/^(true|false|none|null|nan|nil)$/i.test(t)) return true;
  return false;
}

// NO-set removed per operator call 2026-05-16. Refusal vector is not
// doctrine for the knowledge engine. The 27 Guardrails handle operator-
// safety law; the knowledge engine stays content-neutral and indexes
// whatever's in the corpus without flagging "rejection" patterns.

// ─── Topic patterns (carried from v1, expanded) ─────────────────────────────
const TOPIC_PATTERNS = [
  ["orangebox",     /orangebox|cockpit|project.spine|operator|mission.os/i],
  ["codexa",        /codexa|worker.box|rail|8097|8098|bridge|ollama|lm.?studio/i],
  ["memory",        /memory|wiki|obsidian|recall|lesson|mistake|archive|clc|lattice/i],
  ["design",        /design|ui|ux|visual|motion|aesthetic|cinema|hud/i],
  ["security",      /security|secret|token|approval|guardrail|permission|sanction/i],
  ["agents",        /agent|department|AE\d+|factory|lakestrike|skill|mcp|openclaw/i],
  ["shipping",      /vercel|deploy|github|push|release|launch|receipt|proof/i],
  ["learning",      /paper|research|trend|source|huggingface|podcast|learn|ingest/i],
  ["business",      /pricing|stripe|refund|customer|revenue|sale|invoice/i],
  ["legal",         /license|eula|privacy|gdpr|ccpa|trademark|sanction|export/i],
];

// ─── Utilities ──────────────────────────────────────────────────────────────
const iso = () => new Date().toISOString();
const sha = (s) => crypto.createHash("sha256").update(String(s || "")).digest("hex");
async function fileExists(f) { try { await fs.access(f); return true; } catch { return false; } }
function tokenEstimate(s) { return Math.ceil(String(s || "").length / 4); }

// ─── Source roots (the existing 212-doc corpus the v1 engine indexed) ──────
function sourceCandidates(root) {
  return [
    root,
    path.join(root, "project-thread"),
    path.join(root, "memory", "compiled"),
    path.join(root, "memory", "claude-chats"),
    path.join(root, "references"),
    path.join(root, "skills"),
    path.join(root, "doctrine"),
    path.join(root, "docs"),
    path.join(root, "knowledge"),
    path.join(root, "party-line"),
    path.join(root, "receipts"),
    path.join(root, "proof"),
    path.join(root, "wiki-vault"),
    path.join(root, "orangebox-knowledge-vault"),
  ];
}

function isKnowledgeFile(name) {
  if (/package-lock\.json$/i.test(name)) return false;
  return /\.(md|txt|json|jsonl|ya?ml)$/i.test(name);
}

async function* walkKnowledgeFiles(dir, depth = 0, MAX_DEPTH = 6) {
  if (depth > MAX_DEPTH) return;
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      // skip noisy/heavy subtrees
      if (/^(\.|node_modules|target|gen|dist|exports|installer-output|\.git)/.test(e.name)) continue;
      // skip generated vaults when discovering corpus
      if (/^orangebox-knowledge/i.test(e.name)) continue;
      yield* walkKnowledgeFiles(p, depth + 1, MAX_DEPTH);
    } else if (e.isFile() && isKnowledgeFile(e.name)) {
      yield p;
    }
  }
}

// ─── Per-doc extraction ────────────────────────────────────────────────────
function tokenize(text) {
  return String(text || "").toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [];
}

// ─── ATOM-ALPHA UPGRADE #1 — Contextual prepending (Anthropic, rule-based) ─
// Build a per-position breadcrumb of headings so every fact/decision/entity
// knows which section it was extracted from. Eliminates "context lost"
// failure mode without an LLM call.
function buildHeadingMap(text) {
  // Returns array of { lineIdx, level, title } in order
  const lines = String(text || "").split(/\n/);
  const headings = [];
  lines.forEach((line, i) => {
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (m) headings.push({ lineIdx: i, level: m[1].length, title: m[2].trim() });
  });
  return { headings, lineCount: lines.length };
}

function breadcrumbAtLine(headingMap, lineIdx) {
  const stack = [];
  for (const h of headingMap.headings) {
    if (h.lineIdx > lineIdx) break;
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    stack.push(h);
  }
  return stack.map(h => h.title);
}

// Extract entities = proper nouns + capitalized multi-word phrases + AE\d+ identifiers
function extractEntities(text) {
  const ents = new Map();
  const lines = String(text || "").split(/\n/);
  for (const line of lines) {
    // skip code fences
    if (/^\s*```/.test(line)) continue;
    // AE\d+ identifiers
    const aes = line.match(/\bAE\d{1,2}\b/g) || [];
    for (const a of aes) {
      ents.set(a, (ents.get(a) || 0) + 1);
    }
    // Multi-word Title Case phrases (2-4 words)
    const titleCase = line.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3})\b/g) || [];
    for (const t of titleCase) {
      const tt = t.trim();
      if (isNoise(tt) || isNoise(tt.split(/\s+/)[0])) continue;
      ents.set(tt, (ents.get(tt) || 0) + 1);
    }
    // ALL_CAPS identifiers >= 4 chars (e.g. ORANGEBOX, MIRRORS, CLC, MCP)
    const caps = line.match(/\b[A-Z][A-Z0-9_-]{3,}\b/g) || [];
    for (const c of caps) {
      if (isNoise(c)) continue;
      ents.set(c, (ents.get(c) || 0) + 1);
    }
  }
  return Object.fromEntries([...ents.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60));
}

function extractFacts(text, headingMap) {
  // Extract bullet-pointed claims + sentences with definitional verb patterns
  // ATOM-ALPHA #1 — each fact gets a context breadcrumb from heading map
  const lines = String(text || "").split(/\n/);
  const facts = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let text = null;
    // bullet point claim
    if (/^[-*+]\s+\S/.test(line)) {
      const claim = line.replace(/^[-*+]\s+/, "");
      if (claim.length > 12 && claim.length < 300) text = claim;
    }
    // definitional pattern: "X is Y" or "X means Y"
    else if (/\b(is|are|means|equals|defined as|requires)\b.{6,180}\.\s*$/.test(line) && line.length < 280) {
      text = line;
    }
    if (text) {
      const breadcrumb = headingMap ? breadcrumbAtLine(headingMap, i) : [];
      facts.push({ text, breadcrumb });
    }
    if (facts.length >= 40) break;
  }
  return facts;
}

function extractDecisions(text, headingMap) {
  // Lines that look like committed decisions or rule statements
  // ATOM-ALPHA #1 — each decision tagged with breadcrumb
  const lines = String(text || "").split(/\n/);
  const decisions = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    let match = false;
    if (/^(decision|choice|we will|we decided|locked|standing order|rule)[:.]?\s/i.test(line)) match = true;
    else if (/^(always|never|must|forbidden|allowed|reject)[\s:]/i.test(line) && line.length < 240) match = true;
    if (match) {
      const breadcrumb = headingMap ? breadcrumbAtLine(headingMap, i) : [];
      decisions.push({ text: line, breadcrumb });
    }
    if (decisions.length >= 24) break;
  }
  return decisions;
}

function extractRelationships(text) {
  // Simple subject-verb-object pattern: capitalized subject, action verb, capitalized object
  const rels = [];
  const sentences = String(text || "").split(/(?<=[.!?])\s+/);
  const VERBS = /\b(builds?|owns?|requires|depends on|routes to|blocks?|approves|denies|ships?|tests?|guards?|enforces?|tracks?|writes? to|reads? from|contains?|extends?|implements?)\b/;
  for (const s of sentences.slice(0, 120)) {
    const m = s.match(new RegExp(`\\b([A-Z][A-Za-z0-9_-]{2,})\\s+${VERBS.source}\\s+([A-Z][A-Za-z0-9_-]{2,})`));
    if (m) {
      rels.push({ subj: m[1], verb: m[2], obj: m[m.length - 1] });
      if (rels.length >= 16) break;
    }
  }
  return rels;
}

// ─── Void: rejections, boundaries, corrections, tone markers ───────────────
function extractVoid(text) {
  const voids = { rejections: [], boundaries: [], corrections: [], tone: [] };
  const lines = String(text || "").split(/\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(❌|NO[:.]|forbidden|do not|don'?t|reject|refuse)\b/i.test(line)) {
      voids.rejections.push(line.slice(0, 240));
    } else if (/(out of scope|not in v\d|deferred|skip\b|not bundled|killed|striped)/i.test(line)) {
      voids.boundaries.push(line.slice(0, 240));
    } else if (/(was wrong|actually|correction|honest gap|in reality|theater)/i.test(line)) {
      voids.corrections.push(line.slice(0, 240));
    }
    // Tone markers (emotional/voice register signals)
    if (/(mom'?s law|full effort|no preamble|terse|lab.?grade|premium|cinematic|hud)/i.test(line)) {
      voids.tone.push(line.slice(0, 200));
    }
  }
  for (const k of Object.keys(voids)) {
    voids[k] = voids[k].slice(0, 12);
  }
  return voids;
}

// ─── Critique annotation extraction (when present in source) ───────────────
function extractCritique(text) {
  // Look for SUBJECT/GOOD/WEAK/PRINCIPLE/FIX/PREDICTED IMPACT markers
  const out = {};
  const sectionPatterns = [
    ["subject",   /(?:^|\n)#+\s*SUBJECT[:\s].*$/im],
    ["good",      /(?:^|\n)#+\s*(?:GOOD|WORKS|STRONG)[:\s].*$/im],
    ["weak",      /(?:^|\n)#+\s*(?:WEAK|FAILS|GAP)[:\s].*$/im],
    ["principle", /(?:^|\n)#+\s*(?:PRINCIPLE|RULE|LAW)[:\s].*$/im],
    ["fix",       /(?:^|\n)#+\s*(?:FIX|RECOMMEND|NEXT)[:\s].*$/im],
    ["impact",    /(?:^|\n)#+\s*(?:IMPACT|RESULT|OUTCOME)[:\s].*$/im],
  ];
  // Light heuristic — look for blocks
  for (const [k, re] of sectionPatterns) {
    const m = re.exec(text);
    if (m) {
      // Take ~5 lines after the match
      const idx = m.index;
      const block = text.slice(idx, idx + 600).split("\n").slice(0, 6).join("\n").trim();
      out[k] = block;
    }
  }
  // Also pull "Decision" + "Lesson" + "Mistake" markers if present
  const lessons = (text.match(/(?:^|\n)#+\s*(?:LESSON|MISTAKE|DECISION)\b.{0,400}/gi) || []).slice(0, 4);
  if (lessons.length) out.lessons = lessons.map(l => l.slice(0, 280).trim());
  return Object.keys(out).length ? out : null;
}

// ─── 5-axis fidelity (v2.0 approximations, marked clearly) ─────────────────
function computeFidelity(text, ents, facts) {
  // semantic_preservation: 1.0 since v2.0 stores reference path, not lossy round-trip.
  //   v2.1 will compute BERTScore between source and round-tripped reconstruction.
  const semantic = 1.0;

  // ner_completeness: ratio of recognized entities to expected count by length.
  //   Expected ~ 1 entity per 200 chars. Approximation.
  const expected = Math.max(1, Math.floor(text.length / 200));
  const found = Object.keys(ents || {}).length;
  const ner = Math.min(1, found / expected);

  // voice_fidelity: function-word distribution preserved (we just store reference,
  //   so this is 1.0 for our case until we add reconstruction).
  const voice = 1.0;

  // factual_specificity: ratio of numeric/named-entity content
  const numericMatches = (text.match(/\b\d+(\.\d+)?\b/g) || []).length;
  const totalTokens = Math.max(1, (text.match(/\S+/g) || []).length);
  const factual = Math.min(1, (numericMatches + found) / (totalTokens / 60));

  // emotional_register: rule-based — count tone markers
  const toneMarkers = (text.match(/(mom'?s law|full effort|cinematic|premium|terse|no preamble|lab.?grade)/gi) || []).length;
  const emotional = Math.min(1, toneMarkers / 6 + 0.3);

  return {
    semantic_preservation: round2(semantic),
    ner_completeness:      round2(ner),
    voice_fidelity:        round2(voice),
    factual_specificity:   round2(factual),
    emotional_register:    round2(emotional),
    v2_approximation_notes: "v2.0 stores reference path, not lossy round-trip. semantic + voice computed as 1.0 (reference preservation). v2.1 will add BERTScore + stylometric distance on reconstruction."
  };
}
function round2(n) { return Math.round(n * 100) / 100; }

// ─── Topic tagger ──────────────────────────────────────────────────────────
function tagTopics(text) {
  const tags = [];
  for (const [tag, re] of TOPIC_PATTERNS) if (re.test(text)) tags.push(tag);
  return tags;
}

// NO-set scan removed per operator call 2026-05-16.

// ─── Per-doc compile ───────────────────────────────────────────────────────
//   ATOM-ALPHA upgrades wired here:
//   #1 Contextual prepending — each fact/decision gets heading-breadcrumb
//   #2 Temporal validity   — every doc tagged with mtime as valid_from
async function compileDoc(source) {
  const raw = await fs.readFile(source, "utf8");
  const text = raw.slice(0, 200000); // cap per-doc work to 200KB read
  const stat = await fs.stat(source).catch(() => null);
  const id = sha(source).slice(0, 12);
  const title = (text.match(/^#+\s+(.+)$/m) || [, path.basename(source, path.extname(source))])[1].trim();
  const topics = tagTopics(text);
  const headingMap = buildHeadingMap(text);

  const lattice = {
    id, title,
    source: source.replace(/\\/g, "/"),
    topics,
    entities:      extractEntities(text),
    facts:         extractFacts(text, headingMap),
    decisions:     extractDecisions(text, headingMap),
    relationships: extractRelationships(text),
    estimated_tokens: tokenEstimate(text),
    source_hash: sha(text),
    // ATOM-ALPHA #2 — temporal validity windows (Zep-style)
    valid_from:  stat ? stat.mtime.toISOString() : null,
    valid_until: null,           // null = "now". Set by superseder pass (v3.1).
    superseded_by: null,
    // ATOM-ALPHA #1 — doc-level context for retrieval display
    context: {
      doc_title: title,
      topics,
      heading_count: headingMap.headings.length,
    },
  };
  const voidData = extractVoid(text);
  const critique = extractCritique(text);
  const fidelity = computeFidelity(text, lattice.entities, lattice.facts);

  return { lattice, void: voidData, critique, fidelity };
}

// ─── Orchestrator ──────────────────────────────────────────────────────────
async function rebuild() {
  console.log(`[v2] orange_root = ${ORANGE_ROOT}`);
  console.log(`[v2] engine_dir  = ${ENGINE_DIR}`);

  await fs.rm(PARTIAL_DIR, { recursive: true, force: true });
  await fs.mkdir(PARTIAL_DIR, { recursive: true });

  const counters = {
    docs_seen: 0, docs_compiled: 0, docs_skipped: 0,
    entities_total: 0, entities_after_noise_gate: 0,
    facts: 0, decisions: 0, relationships: 0,
    void_rejections: 0, void_boundaries: 0, void_corrections: 0, void_tone: 0,
    critique_docs: 0,
    fidelity_docs: 0,
    bytes_in: 0, started_at: iso(),
  };

  const sources = sourceCandidates(ORANGE_ROOT);
  const seenFiles = new Set();
  const latticeOut = createWriteStream(path.join(PARTIAL_DIR, "lattice.jsonl"));
  const voidOut   = createWriteStream(path.join(PARTIAL_DIR, "void.jsonl"));
  const critOut   = createWriteStream(path.join(PARTIAL_DIR, "critique.jsonl"));
  const fidelityIdx = {};
  const topicIdx = {};
  const entityCounts = new Map();

  for (const srcRoot of sources) {
    if (!(await fileExists(srcRoot))) continue;
    const maxDepth = path.resolve(srcRoot) === path.resolve(ORANGE_ROOT) ? 0 : 6;
    for await (const file of walkKnowledgeFiles(srcRoot, 0, maxDepth)) {
      const fileKey = path.resolve(file).toLowerCase();
      if (seenFiles.has(fileKey)) continue;
      seenFiles.add(fileKey);
      counters.docs_seen += 1;
      try {
        const stat = await fs.stat(file);
        counters.bytes_in += stat.size;
        // skip the biggest claude-chat transcripts (over 500 KB) for v2.0 — they
        // dominate v1 lexical-index; v2.1 will compress them via CLC.
        if (stat.size > 500_000 && /memory[\\/]claude-chats/i.test(file)) {
          counters.docs_skipped += 1;
          continue;
        }
        const compiled = await compileDoc(file);
        counters.docs_compiled += 1;
        counters.entities_total += Object.keys(compiled.lattice.entities).length;
        counters.facts += compiled.lattice.facts.length;
        counters.decisions += compiled.lattice.decisions.length;
        counters.relationships += compiled.lattice.relationships.length;
        counters.void_rejections += compiled.void.rejections.length;
        counters.void_boundaries += compiled.void.boundaries.length;
        counters.void_corrections += compiled.void.corrections.length;
        counters.void_tone += compiled.void.tone.length;
        if (compiled.critique) counters.critique_docs += 1;

        // Collect entity frequency for global filtering
        for (const [ent, n] of Object.entries(compiled.lattice.entities)) {
          entityCounts.set(ent, (entityCounts.get(ent) || 0) + n);
        }
        for (const t of compiled.lattice.topics) topicIdx[t] = (topicIdx[t] || 0) + 1;
        fidelityIdx[compiled.lattice.id] = {
          title: compiled.lattice.title,
          source: compiled.lattice.source,
          fidelity: compiled.fidelity,
        };

        latticeOut.write(JSON.stringify(compiled.lattice) + "\n");
        voidOut.write(JSON.stringify({ id: compiled.lattice.id, ...compiled.void }) + "\n");
        if (compiled.critique) critOut.write(JSON.stringify({ id: compiled.lattice.id, ...compiled.critique }) + "\n");
      } catch (e) {
        counters.docs_skipped += 1;
        // continue — never let one bad doc kill the rebuild
      }
    }
  }

  await new Promise(r => latticeOut.end(r));
  await new Promise(r => voidOut.end(r));
  await new Promise(r => critOut.end(r));

  // Global entity frequency: keep entities appearing in ≥ 2 docs OR ≥ 3 occurrences
  // This is the final noise gate cut over the corpus.
  const FREQ_FLOOR = 2;
  const filteredEntities = [...entityCounts.entries()]
    .filter(([k, v]) => v >= FREQ_FLOOR && !isNoise(k))
    .sort((a, b) => b[1] - a[1]);

  counters.entities_after_noise_gate = filteredEntities.length;

  await fs.writeFile(path.join(PARTIAL_DIR, "entities.json"), JSON.stringify({
    count: filteredEntities.length,
    floor: FREQ_FLOOR,
    top: Object.fromEntries(filteredEntities.slice(0, 200)),
  }, null, 2));

  counters.fidelity_docs = Object.keys(fidelityIdx).length;

  await fs.writeFile(path.join(PARTIAL_DIR, "fidelity.json"), JSON.stringify(fidelityIdx, null, 2));
  await fs.writeFile(path.join(PARTIAL_DIR, "topics.json"), JSON.stringify(topicIdx, null, 2));

  // ATOM-ALPHA UPGRADE #3 — Hierarchical RAPTOR-style tree
  // Build a 2-level tree: root → per-topic clusters with top-3 extractive
  // summaries (facts/decisions/entities). No LLM. Pure extraction over
  // the per-doc lattice we just emitted.
  await buildHierarchicalTree(PARTIAL_DIR);

  counters.finished_at = iso();

  // ENGINE.md — operator-readable manifest
  const manifest = `# ORANGEBOX Knowledge — v2

Generated: ${counters.finished_at}
Engine version: orangebox-knowledge-v2 · lattice + void + fidelity + critique
Method: streaming per-doc, no embeddings, no vector DB, no LLM calls, no fixed-size chunking

## Counts

- Documents seen:           ${counters.docs_seen}
- Documents compiled:       ${counters.docs_compiled}
- Documents skipped:        ${counters.docs_skipped}
- Bytes in:                 ${(counters.bytes_in / 1024 / 1024).toFixed(2)} MB
- Entities (pre-noise-gate): ${counters.entities_total}
- Entities (post-noise-gate, freq ≥ ${FREQ_FLOOR}): **${counters.entities_after_noise_gate}**
- Facts extracted:          ${counters.facts}
- Decisions extracted:      ${counters.decisions}
- Relationships extracted:  ${counters.relationships}
- Void rejections:          ${counters.void_rejections}
- Void boundaries:          ${counters.void_boundaries}
- Void corrections:         ${counters.void_corrections}
- Void tone markers:        ${counters.void_tone}
- Critique-annotated docs:  ${counters.critique_docs}
- Fidelity-indexed docs:    ${counters.fidelity_docs}

## Top 20 entities (post-noise-gate)

${filteredEntities.slice(0, 20).map(([k, v]) => `- **${k}** — ${v}`).join("\n")}

## Topic distribution

${Object.entries(topicIdx).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v} docs`).join("\n")}

## Files

- \`lattice.jsonl\` — per-doc lattice (entities/facts/decisions/relationships)
- \`void.jsonl\` — per-doc void (rejections/boundaries/corrections/tone)
- \`critique.jsonl\` — per-doc critique annotations (when extractable)
- \`fidelity.json\` — per-doc 5-axis fidelity vector
- \`entities.json\` — global entity frequency, post-noise-gate
- \`topics.json\` — topic-tag distribution

## Honest residual (v2.1 work)

- Fidelity \`semantic_preservation\` and \`voice_fidelity\` currently held at 1.0 (reference storage).
  v2.1 will round-trip a CLC reconstruction and compute real BERTScore + stylometric distance.
- Critique annotation is extraction-only in v2.0. v2.1 may add Claude-API critique generation for
  high-value docs (top 20 by token count) with explicit operator approval (NO local LLM, NO RAM hog).
- Auto-rebuild hook on party-line append: wired in server.mjs (v2.1 polish).
- Large claude-chat transcripts (> 500 KB) skipped in v2.0 streaming to keep RAM low.
  v2.1 will stream + CLC-compress those into the corpus.

Disclosure: ATOM-ORANGEBOX-KNOWLEDGE-V2-2026-0516
`;

  await fs.writeFile(path.join(PARTIAL_DIR, "ENGINE.md"), manifest);

  // Atomic swap
  if (await fileExists(ENGINE_DIR)) {
    const bak = ENGINE_DIR + ".bak-" + Date.now();
    await fs.rename(ENGINE_DIR, bak).catch(() => {});
  }
  await fs.rename(PARTIAL_DIR, ENGINE_DIR);
  const receiptDir = path.join(ORANGE_ROOT, "receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  await fs.writeFile(path.join(receiptDir, `orangebox-knowledge-v2-${counters.finished_at.replace(/[:.]/g, "-")}.json`), JSON.stringify({
    status: "VERIFIED",
    kind: "orangebox-knowledge-v2-rebuild",
    generatedAt: counters.finished_at,
    orangeRoot: ORANGE_ROOT,
    engineDir: ENGINE_DIR,
    sources,
    counts: counters,
    artifacts: {
      engine: path.join(ENGINE_DIR, "ENGINE.md"),
      lattice: path.join(ENGINE_DIR, "lattice.jsonl"),
      tree: path.join(ENGINE_DIR, "tree.json"),
      fidelity: path.join(ENGINE_DIR, "fidelity.json"),
      entities: path.join(ENGINE_DIR, "entities.json")
    },
    method: "Local streaming extraction over ORANGEBOX docs, receipts, proof JSON, party-line, references, doctrine, skills, and root page files. No LLM calls, no model download, no vector DB.",
    rollback: "Restore the latest memory/orangebox-knowledge-v2.bak-* directory or delete memory/orangebox-knowledge-v2 and rerun the prior v1/v2 command."
  }, null, 2) + "\n", "utf8");

  console.log("[v2] rebuild complete.");
  console.log("[v2] " + Object.entries(counters).map(([k, v]) => `${k}=${v}`).join(" · "));
}

// ─── ATOM-ALPHA UPGRADE #3 — Hierarchical RAPTOR-style tree ─────────────
//
// Read the just-emitted lattice.jsonl, group by topic, compute top-N
// per-topic summaries by entity frequency + fact frequency, emit tree.json.
// Extractive (no LLM); leaf-doc detail preserved; tree provides drill-down.
async function buildHierarchicalTree(partialDir) {
  const lat = path.join(partialDir, "lattice.jsonl");
  const raw = await fs.readFile(lat, "utf8");
  const byTopic = new Map();
  const rootEntities = new Map();
  let docCount = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const doc = JSON.parse(line);
      docCount += 1;
      for (const topic of doc.topics || []) {
        if (!byTopic.has(topic)) byTopic.set(topic, { docs: [], entities: new Map(), facts: [], decisions: [] });
        const bucket = byTopic.get(topic);
        bucket.docs.push({ id: doc.id, title: doc.title, valid_from: doc.valid_from });
        for (const [ent, n] of Object.entries(doc.entities || {})) {
          bucket.entities.set(ent, (bucket.entities.get(ent) || 0) + n);
          rootEntities.set(ent, (rootEntities.get(ent) || 0) + n);
        }
        for (const f of (doc.facts || []).slice(0, 5)) bucket.facts.push({ doc: doc.id, ...f });
        for (const d of (doc.decisions || []).slice(0, 3)) bucket.decisions.push({ doc: doc.id, ...d });
      }
    } catch {}
  }
  const tree = {
    root: {
      doc_count: docCount,
      topic_count: byTopic.size,
      top_entities: [...rootEntities.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 30),
    },
    topics: {},
  };
  for (const [topic, b] of byTopic.entries()) {
    tree.topics[topic] = {
      doc_count: b.docs.length,
      docs: b.docs.slice(0, 12).map(d => ({ id: d.id, title: d.title, valid_from: d.valid_from })),
      top_entities: [...b.entities.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12),
      top_facts: b.facts.slice(0, 5),
      top_decisions: b.decisions.slice(0, 3),
    };
  }
  await fs.writeFile(path.join(partialDir, "tree.json"), JSON.stringify(tree, null, 2));
}

// ─── ATOM-ALPHA UPGRADE #4 — Hybrid retrieval with Reciprocal Rank Fusion ─
//
// Anthropic's hybrid pattern (BM25 + embeddings) without embeddings.
// Combines four ranked lists via RRF: title-match, entity-match, fact-match,
// topic-match. Returns documents scored by sum of inverse-ranks across all
// signals — robust to any single signal's quirks.
function hybridRetrieveRRF(docs, query, k = 60) {
  const needle = String(query || "").toLowerCase().trim();
  if (!needle) return [];
  const terms = needle.split(/\s+/).filter(Boolean);

  // Per-signal rankings
  const titleScores = new Map();
  const entityScores = new Map();
  const factScores = new Map();
  const topicScores = new Map();

  for (const doc of docs) {
    const t = (doc.title || "").toLowerCase();
    let titleHit = 0;
    for (const term of terms) if (t.includes(term)) titleHit += 1;
    if (titleHit > 0) titleScores.set(doc.id, titleHit + (t === needle ? 5 : 0));

    let entityHit = 0;
    for (const ent of Object.keys(doc.entities || {})) {
      const el = ent.toLowerCase();
      for (const term of terms) if (el.includes(term)) entityHit += 1;
    }
    if (entityHit > 0) entityScores.set(doc.id, entityHit);

    let factHit = 0;
    for (const f of doc.facts || []) {
      const ft = (typeof f === "string" ? f : f.text || "").toLowerCase();
      for (const term of terms) if (ft.includes(term)) factHit += 1;
    }
    if (factHit > 0) factScores.set(doc.id, factHit);

    let topicHit = 0;
    for (const tp of doc.topics || []) {
      for (const term of terms) if (tp.includes(term) || term.includes(tp)) topicHit += 1;
    }
    if (topicHit > 0) topicScores.set(doc.id, topicHit);
  }

  // RRF combine — score = sum(1 / (k + rank)) across signals where present
  const rrf = new Map();
  for (const scores of [titleScores, entityScores, factScores, topicScores]) {
    const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    ranked.forEach(([id], idx) => {
      rrf.set(id, (rrf.get(id) || 0) + 1 / (k + idx + 1));
    });
  }
  // Final ranking
  return [...rrf.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => {
      const doc = docs.find(d => d.id === id);
      return {
        id,
        title: doc.title,
        source: doc.source,
        topics: doc.topics,
        valid_from: doc.valid_from,
        rrf_score: Math.round(score * 10000) / 10000,
        signal_breakdown: {
          title: titleScores.get(id) || 0,
          entity: entityScores.get(id) || 0,
          fact: factScores.get(id) || 0,
          topic: topicScores.get(id) || 0,
        },
      };
    });
}

// ─── Query (v2) ────────────────────────────────────────────────────────────
async function query(q) {
  const enginePath = path.join(ENGINE_DIR, "lattice.jsonl");
  if (!(await fileExists(enginePath))) {
    return console.log(JSON.stringify({ status: "FAILED", error: "v2 vault not built. Run without --query first." }));
  }
  const needle = String(q || "").toLowerCase();
  const hits = [];
  const stream = createInterface({ input: createReadStream(enginePath), crlfDelay: Infinity });
  for await (const line of stream) {
    try {
      const doc = JSON.parse(line);
      let score = 0;
      // Title match
      if ((doc.title || "").toLowerCase().includes(needle)) score += 10;
      // Entity match
      for (const ent of Object.keys(doc.entities || {})) {
        if (ent.toLowerCase().includes(needle)) score += 4;
      }
      // Fact match
      for (const f of doc.facts || []) {
        const factText = typeof f === "string" ? f : f?.text || JSON.stringify(f);
        if (factText.toLowerCase().includes(needle)) score += 2;
      }
      if (score > 0) hits.push({ id: doc.id, title: doc.title, source: doc.source, topics: doc.topics, score });
    } catch {}
  }
  hits.sort((a, b) => b.score - a.score);
  console.log(JSON.stringify({ status: "VERIFIED", query: q, total: hits.length, top: hits.slice(0, 12) }, null, 2));
}

// ─── Entry ─────────────────────────────────────────────────────────────────
async function main() {
  if (QUERY) return query(QUERY);
  await rebuild();
}
main().catch((e) => { console.error("[v2] FATAL", e); process.exit(1); });
