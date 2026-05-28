import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const deflateAsync = promisify(zlib.deflate);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const clcRoot = path.join(orangeRoot, "memory", "clc");
const compiledRoot = path.join(orangeRoot, "memory", "compiled");
const projectKey = argValue("--project", "orangebox");
const sourceArg = argValue("--source", "");

const canonicalPredicates = {
  HAS: 0,
  IS: 1,
  USES: 2,
  BUILT: 3,
  REQUIRES: 4,
  TRIGGERS: 5,
  POWERS: 6,
  REPORTS: 7,
  VERIFIES: 8,
  LOCATED: 9,
  PART: 10,
  REL: 11
};

const entityHints = [
  "OrangeBOX", "Codexa", "Claude", "Claude Code", "Codex", "GPT", "Opus", "OpenClaw", "Obsidian",
  "Hermes", "AE0", "AE1", "AE2", "AE3", "AE4", "AE5", "AE6", "AE7", "AE8", "AE9", "AE10",
  "AE11", "AE12", "AE13", "AE14", "MCP", "LSP", "Playwright", "Context7", "GitHub", "Vercel",
  "n8n", "LakeStrike", "AECommander", "Crystal Lattice", "CLC"
];

const stopEntities = new Set([
  "The", "This", "That", "What", "When", "Where", "Why", "How", "For", "And", "But", "With", "From",
  "User", "Assistant", "Thinking", "Message", "Output", "Return", "JSON", "Markdown", "Windows"
]);

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

function normalizeSlash(value) {
  return String(value || "").replace(/\\/g, "/");
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function clampText(text, limit) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[clipped ${value.length - limit} chars]`;
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

async function writeJson(file, data) {
  await writeText(file, `${JSON.stringify(data, null, 2)}\n`);
}

function sentenceSplit(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/(?<=[.!?])\s+|\n{2,}|(?=^[-*]\s+)/gm)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 24 && line.length <= 900);
}

function scoreSentence(sentence, entities) {
  let score = 0;
  if (/[A-Z][A-Za-z0-9]+/.test(sentence)) score += 1;
  if (/(must|should|requires?|uses?|is|are|has|verified|failed|works|needs|decided|chose|blocked|proof|receipt)/i.test(sentence)) score += 2;
  for (const entity of entities.slice(0, 30)) {
    if (sentence.includes(entity)) score += 1;
  }
  return score;
}

function extractEntities(text) {
  const counts = new Map();
  for (const hint of entityHints) {
    const matches = String(text).match(new RegExp(`\\b${hint.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi")) || [];
    if (matches.length) counts.set(hint, (counts.get(hint) || 0) + matches.length + 4);
  }
  const patterns = [
    /\b[A-Z][A-Za-z0-9]+(?:[ -][A-Z][A-Za-z0-9]+){0,3}\b/g,
    /\b[A-Z]{2,8}\d{0,3}\b/g,
    /\b[a-z0-9_.-]+:\/\/[^\s)]+/gi,
    /\b[A-Z]:[\\/][^\s`"'<>]+/g
  ];
  for (const pattern of patterns) {
    for (const match of String(text).matchAll(pattern)) {
      const entity = match[0].replace(/[.,;:!?)]$/, "").slice(0, 90);
      if (entity.length < 2 || stopEntities.has(entity)) continue;
      counts.set(entity, (counts.get(entity) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 80)
    .map(([name, count], id) => ({ id, name, count }));
}

function predicateFor(sentence) {
  if (/(has|have|contains|owns|includes)/i.test(sentence)) return canonicalPredicates.HAS;
  if (/(is|are|means|becomes|equals)/i.test(sentence)) return canonicalPredicates.IS;
  if (/(uses|use|using|runs on|calls)/i.test(sentence)) return canonicalPredicates.USES;
  if (/(built|build|created|made|implemented|added)/i.test(sentence)) return canonicalPredicates.BUILT;
  if (/(requires|needs|must|should|has to)/i.test(sentence)) return canonicalPredicates.REQUIRES;
  if (/(triggers|starts|fires|routes)/i.test(sentence)) return canonicalPredicates.TRIGGERS;
  if (/(powers|enables|optimizes)/i.test(sentence)) return canonicalPredicates.POWERS;
  if (/(reports|shows|displays|emits)/i.test(sentence)) return canonicalPredicates.REPORTS;
  if (/(verifies|proves|checks|tests|passes|fails)/i.test(sentence)) return canonicalPredicates.VERIFIES;
  if (/(located|stored|path|folder|directory)/i.test(sentence)) return canonicalPredicates.LOCATED;
  if (/(part of|belongs|component|department)/i.test(sentence)) return canonicalPredicates.PART;
  return canonicalPredicates.REL;
}

function extractFacts(sentences, entities) {
  const entityNames = entities.map((row) => row.name);
  const entityByName = new Map(entityNames.map((name, id) => [name, id]));
  const facts = [];
  const seen = new Set();
  const ranked = sentences
    .map((sentence) => ({ sentence, score: scoreSentence(sentence, entityNames) }))
    .filter((row) => row.score >= 2 && !/(thinking|signature|token truncated|base64|sha256)/i.test(row.sentence))
    .sort((a, b) => b.score - a.score)
    .slice(0, 120);
  for (const row of ranked) {
    const subjectName = entityNames.find((entity) => row.sentence.includes(entity));
    if (!subjectName) continue;
    const subject = entityByName.get(subjectName);
    const object = row.sentence.replace(subjectName, "").replace(/\s+/g, " ").trim().slice(0, 220);
    const key = `${subject}:${object.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push([subject, predicateFor(row.sentence), object]);
    if (facts.length >= 72) break;
  }
  return facts;
}

function extractDecisions(sentences) {
  const seen = new Set();
  const decisions = [];
  for (const sentence of sentences) {
    if (!/(decided|chose|approved|go with|we want|i want|must|do not|don't|never|ship|rollback|preserve|install|use Codexa|use Obsidian|OrangeBOX)/i.test(sentence)) continue;
    const canonical = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    decisions.push(sentence.slice(0, 320));
    if (decisions.length >= 80) break;
  }
  return decisions;
}

function extractVoid(sentences) {
  const categories = {
    rejections: [],
    corrections: [],
    boundaries: [],
    tone: []
  };
  for (const sentence of sentences) {
    if (/(no |not |don't|never|refuse|avoid|reject|disregard|rollback|do not)/i.test(sentence)) categories.rejections.push(sentence);
    if (/(wrong|mistake|fix|glitch|failed|timeout|broken|issue|correction|actually)/i.test(sentence)) categories.corrections.push(sentence);
    if (/(approval|required|do not touch|manual approval|destructive|secrets|unsafe|guardrail)/i.test(sentence)) categories.boundaries.push(sentence);
    if (/(frustrated|tired|good|amazing|bad|sketch|love|hate|worried|trust|careful)/i.test(sentence)) categories.tone.push(sentence);
  }
  const allVoid = Object.values(categories).flat().join("\n");
  return {
    rc: categories.rejections.length,
    cc: categories.corrections.length,
    bc: categories.boundaries.length,
    tc: categories.tone.length,
    sh: sha256(allVoid).slice(0, 16),
    samples: {
      rejections: categories.rejections.slice(0, 5),
      corrections: categories.corrections.slice(0, 5),
      boundaries: categories.boundaries.slice(0, 5),
      tone: categories.tone.slice(0, 5)
    }
  };
}

function topicFor(sentence) {
  const tests = [
    ["orangebox", /orangebox|command|mission|project spine|cockpit/i],
    ["codexa", /codexa|ai box|worker|bridge|rail|8097|8098/i],
    ["memory", /memory|wiki|obsidian|recall|lesson|mistake|archive|chat/i],
    ["security", /security|secret|token|approval|firewall|guardrail|unsafe/i],
    ["ui", /ui|design|browser|visual|screenshot|page|button|scroll/i],
    ["agents", /agent|department|AE\d+|factory|lakestrike|skills/i],
    ["deployment", /vercel|deploy|github|push|release|launch/i]
  ];
  for (const [name, pattern] of tests) if (pattern.test(sentence)) return name;
  return "general";
}

function extractTopics(sentences) {
  const counts = new Map();
  for (const sentence of sentences) {
    const topic = topicFor(sentence);
    counts.set(topic, (counts.get(topic) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([topic, count]) => ({ topic, count }));
}

function contextForAi(sourceName, lattice) {
  const entityLine = lattice.E.slice(0, 36).map((entity, index) => `${index}:${entity}`).join(", ");
  const topicLine = lattice.T.map((row) => `${row.topic}(${row.count})`).join(", ");
  const factLines = lattice.f.slice(0, 24).map(([subject, predicate, object]) => {
    const subjectName = lattice.E[subject] || `E${subject}`;
    const pred = Object.entries(canonicalPredicates).find(([, id]) => id === predicate)?.[0] || "REL";
    return `- ${subjectName} ${pred}: ${object}`;
  }).join("\n");
  const decisionLines = lattice.D.slice(0, 24).map((decision) => `- ${decision}`).join("\n");
  const voidLines = [
    `rejections=${lattice.V.rc}`,
    `corrections=${lattice.V.cc}`,
    `boundaries=${lattice.V.bc}`,
    `tone=${lattice.V.tc}`,
    `void_hash=${lattice.V.sh}`
  ].join(" / ");
  return [
    `[OrangeBOX CLC archive lattice: ${sourceName}]`,
    `Source hash: ${lattice.h}`,
    `Topics: ${topicLine}`,
    `Entities: ${entityLine}`,
    "",
    "Facts:",
    factLines || "- none",
    "",
    "Decisions:",
    decisionLines || "- none",
    "",
    `Void: ${voidLines}`,
    "",
    "Use this as archive context only. If stakes are high, open the raw source receipt/thread."
  ].join("\n");
}

function rawSecretFindings(text) {
  const patterns = [
    ["github_pat", /github_pat_[A-Za-z0-9_]{20,}/],
    ["ghp", /\bghp_[A-Za-z0-9]{20,}/],
    ["vercel", /\bvcp_[A-Za-z0-9]{20,}|\bvck_[A-Za-z0-9]{20,}/],
    ["openai", /\bsk-[A-Za-z0-9_-]{20,}/],
    ["jwt", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/]
  ];
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
}

async function encodeSource(file) {
  const text = await readText(file, "");
  const sourceName = path.basename(file);
  const sentences = sentenceSplit(text);
  const entities = extractEntities(text);
  const facts = extractFacts(sentences, entities);
  const decisions = extractDecisions(sentences);
  const lattice = {
    i: `OBX-CLC-${iso().slice(0, 10)}-${sourceName.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`,
    v: "orangebox-clc1",
    E: entities.map((row) => row.name),
    D: decisions,
    f: facts,
    T: extractTopics(sentences),
    V: extractVoid(sentences),
    h: sha256(text).slice(0, 16)
  };
  const context = contextForAi(sourceName, lattice);
  const json = JSON.stringify(lattice);
  const packed = `OBX-CLC1::${(await deflateAsync(Buffer.from(json, "utf8"), { level: 9 })).toString("base64url")}`;
  const sourceTokens = estimateTokens(text);
  const contextTokens = estimateTokens(context);
  const packedTokens = estimateTokens(packed);
  const bestTokens = Math.min(contextTokens, packedTokens);
  const result = {
    status: "CONFIGURED",
    source: normalizeSlash(file),
    sourceName,
    sourceChars: text.length,
    sourceTokens,
    sentenceCount: sentences.length,
    entityCount: lattice.E.length,
    factCount: lattice.f.length,
    decisionCount: lattice.D.length,
    voidCount: lattice.V.rc + lattice.V.cc + lattice.V.bc + lattice.V.tc,
    contextChars: context.length,
    contextTokens,
    packedChars: packed.length,
    packedTokens,
    contextCompressionRatio: Number((sourceTokens / Math.max(contextTokens, 1)).toFixed(2)),
    packedCompressionRatio: Number((sourceTokens / Math.max(packedTokens, 1)).toFixed(2)),
    bestCompressionRatio: Number((sourceTokens / Math.max(bestTokens, 1)).toFixed(2)),
    sourceHash: sha256(text),
    latticeHash: sha256(json),
    secretFindings: [...new Set([...rawSecretFindings(context), ...rawSecretFindings(packed)])],
    lattice,
    context,
    packed
  };
  result.status = result.secretFindings.length
    ? "FAILED_SECRET_PATTERN"
    : result.sourceTokens >= 1000 && result.bestCompressionRatio >= 3 && result.decisionCount > 0
      ? "VERIFIED"
      : "FAILED_THRESHOLD";
  return result;
}

async function latestClaudeWikiDir() {
  const latest = await readJson(path.join(orangeRoot, "memory", "claude-chats", "LATEST_IMPORT.json"), null);
  const importId = latest?.importId || latest?.id || "";
  const candidate = importId ? path.join(orangeRoot, "memory", "claude-chats", "wiki", importId) : "";
  return candidate && await exists(candidate) ? candidate : "";
}

async function candidateSources() {
  if (sourceArg) return [path.resolve(sourceArg)];
  const candidates = [
    path.join(orangeRoot, "project-thread", projectKey, "THREAD.md"),
    path.join(orangeRoot, "project-thread", projectKey, "CODEX_HANDOFF.md"),
    path.join(orangeRoot, "memory", "compiled", "LESSONS_LEARNED.md")
  ];
  const wikiDir = await latestClaudeWikiDir();
  if (wikiDir) {
    candidates.push(path.join(wikiDir, "CLAUDE_CHAT_WIKI.md"));
    const fullDir = path.join(wikiDir, "full-transcripts");
    const rows = await fs.readdir(fullDir, { withFileTypes: true }).catch(() => []);
    const transcriptRows = [];
    for (const row of rows) {
      if (!row.isFile() || !row.name.endsWith(".md")) continue;
      const full = path.join(fullDir, row.name);
      const stat = await fs.stat(full).catch(() => null);
      transcriptRows.push({ full, size: stat?.size || 0 });
    }
    transcriptRows.sort((a, b) => b.size - a.size);
    candidates.push(...transcriptRows.slice(0, 3).map((row) => row.full));
  }
  const existing = [];
  for (const file of candidates) {
    if (await exists(file)) existing.push(file);
  }
  return [...new Set(existing)];
}

async function promoteBest(best) {
  const primer = [
    "# CLC Primer",
    "",
    "Status: VERIFIED archive-context compression candidate.",
    "",
    "This is not a replacement for raw history. It is a compact archive context layer for OrangeBOX memory retrieval.",
    "",
    "## Metrics",
    "",
    `- Source: \`${best.source}\``,
    `- Source tokens: ${best.sourceTokens}`,
    `- Context tokens: ${best.contextTokens}`,
    `- Packed tokens: ${best.packedTokens}`,
    `- Best compression ratio: ${best.bestCompressionRatio}x`,
    `- Entities: ${best.entityCount}`,
    `- Facts: ${best.factCount}`,
    `- Decisions: ${best.decisionCount}`,
    `- Void signals: ${best.voidCount}`,
    `- Source SHA-256: ${best.sourceHash}`,
    `- Lattice SHA-256: ${best.latticeHash}`,
    "",
    "## AI Context",
    "",
    "```text",
    best.context,
    "```"
  ].join("\n");
  await writeText(path.join(compiledRoot, "CLC_PRIMER.md"), primer);
  await writeJson(path.join(clcRoot, "latest-clc-lattice.json"), {
    ...best,
    context: undefined,
    packed: undefined
  });
}

async function main() {
  await fs.mkdir(clcRoot, { recursive: true });
  await fs.mkdir(compiledRoot, { recursive: true });
  await fs.mkdir(path.join(orangeRoot, "benchmarks"), { recursive: true });
  await fs.mkdir(path.join(orangeRoot, "receipts"), { recursive: true });
  const sources = await candidateSources();
  const results = [];
  for (const source of sources) {
    const result = await encodeSource(source);
    results.push(result);
  }
  results.sort((a, b) => b.bestCompressionRatio - a.bestCompressionRatio);
  const verified = results.filter((row) => row.status === "VERIFIED");
  const best = verified[0] || results[0] || null;
  if (best?.status === "VERIFIED") await promoteBest(best);
  const summary = {
    status: best?.status === "VERIFIED" ? "VERIFIED" : "FAILED",
    generatedAt: iso(),
    project: projectKey,
    rule: "CLC is allowed only for archived/completed context, never active live chat.",
    sourcesTested: results.length,
    best: best ? {
      source: best.source,
      status: best.status,
      sourceTokens: best.sourceTokens,
      contextTokens: best.contextTokens,
      packedTokens: best.packedTokens,
      bestCompressionRatio: best.bestCompressionRatio,
      entityCount: best.entityCount,
      factCount: best.factCount,
      decisionCount: best.decisionCount,
      voidCount: best.voidCount,
      secretFindings: best.secretFindings
    } : null,
    results: results.map((row) => ({
      source: row.source,
      status: row.status,
      sourceTokens: row.sourceTokens,
      contextTokens: row.contextTokens,
      packedTokens: row.packedTokens,
      bestCompressionRatio: row.bestCompressionRatio,
      entityCount: row.entityCount,
      factCount: row.factCount,
      decisionCount: row.decisionCount,
      voidCount: row.voidCount,
      secretFindings: row.secretFindings
    })),
    output: {
      primer: normalizeSlash(path.join(compiledRoot, "CLC_PRIMER.md")),
      lattice: normalizeSlash(path.join(clcRoot, "latest-clc-lattice.json"))
    }
  };
  const mark = stamp();
  await writeJson(path.join(orangeRoot, "benchmarks", `orangebox-clc-reality-${mark}.json`), summary);
  await writeJson(path.join(orangeRoot, "receipts", `orangebox-clc-reality-${mark}.json`), {
    result: summary.status,
    evidence: summary,
    blockers: summary.status === "VERIFIED" ? [] : ["CLC did not clear the measured threshold on available archived inputs."],
    nextAction: summary.status === "VERIFIED"
      ? "Use CLC_PRIMER.md as an archive memory source under OrangeBOX, while keeping raw ledger in Obsidian."
      : "Keep CLC experimental and do not wire into active memory."
  });
  console.log(JSON.stringify(summary, null, 2));
  if (summary.status !== "VERIFIED") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
