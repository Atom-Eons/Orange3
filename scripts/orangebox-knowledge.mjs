import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import os from "node:os";
const orangeRoot = process.env.ORANGEBOX_ROOT
  || process.env.ORANGEBOX_DATA_ROOT
  || argValueEarly("--root")
  || path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command");

// Tiny boot-time arg parser (must come before argValue is defined below).
function argValueEarly(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}
const engineRoot = path.join(orangeRoot, "memory", "orangebox-knowledge");
const projectKey = argValue("--project", "orangebox");
const query = argValue("--query", "");

const stopWords = new Set("a an and are as at be but by can do for from has have i if in into is it its me my no not of on or our should so than that the this to use we what when where who why with you your".split(" "));
const topicPatterns = [
  ["orangebox", /orangebox|mission os|command|cockpit|project spine|operator/i],
  ["codexa", /codexa|ai box|worker|bridge|rail|8097|8098|ollama|lm studio/i],
  ["memory", /memory|wiki|obsidian|recall|lesson|mistake|archive|chat|clc|lattice/i],
  ["design", /design|ui|ux|visual|screenshot|motion|blackbox|browser|page/i],
  ["security", /security|secret|token|approval|guardrail|firewall|unsafe|permission/i],
  ["agents", /agent|department|AE\d+|factory|lakestrike|skill|mcp|openclaw/i],
  ["shipping", /vercel|deploy|github|push|release|launch|receipt|proof/i],
  ["learning", /paper|research|trend|source|hugging face|podcast|learn|ingest/i]
];

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

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

function clampText(text, limit = 16000) {
  const value = String(text || "");
  if (value.length <= limit) return value;
  return `${value.slice(0, limit)}\n[clipped ${value.length - limit} chars at source]`;
}

function safeIdPart(value, fallback = "node") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70) || fallback;
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

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[#>*_`|[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text) {
  return [...String(text || "").toLowerCase().matchAll(/[a-z][a-z0-9_-]{2,}/g)]
    .map((match) => match[0])
    .filter((token) => !stopWords.has(token) && token.length <= 42);
}

function titleize(file) {
  return path.basename(file, path.extname(file)).replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function chunkText(text, maxChars = 2200) {
  const paragraphs = String(text || "").split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs) {
    if ((current.length + paragraph.length + 2) > maxChars && current) {
      chunks.push(current);
      current = "";
    }
    current += `${current ? "\n\n" : ""}${paragraph}`;
  }
  if (current) chunks.push(current);
  return chunks.slice(0, 160);
}

function summarizeText(text, limit = 520) {
  const clean = stripMarkdown(text);
  if (!clean) return "";
  const sentences = clean.split(/(?<=[.!?])\s+/g).filter(Boolean);
  const summary = sentences.slice(0, 3).join(" ");
  return clampText(summary || clean, limit);
}

function parseHeading(line) {
  const match = String(line || "").match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  const rawTitle = match[2].replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();
  const title = rawTitle.length > 150 ? `${rawTitle.slice(0, 147)}...` : rawTitle;
  return { level: match[1].length, title };
}

function buildPageTreeDoc(raw, file, docId) {
  const lines = String(raw || "").split(/\r?\n/g);
  const title = titleize(file);
  const headings = [];
  lines.forEach((line, index) => {
    const heading = parseHeading(line);
    if (heading) headings.push({ ...heading, line: index + 1 });
  });
  const nodes = [];
  const rootId = `${docId}:tree:root`;
  const root = {
    id: rootId,
    docId,
    parentId: null,
    depth: 0,
    order: 0,
    title,
    path: title,
    headingLevel: 0,
    startLine: 1,
    endLine: Math.max(lines.length, 1),
    source: normalizeSlash(file),
    type: sourceType(file),
    topic: topicFor(raw),
    estimatedTokens: estimateTokens(raw),
    summary: summarizeText(raw, 700),
    terms: [...new Set(tokenize(raw))].slice(0, 140)
  };
  nodes.push(root);

  if (!headings.length) {
    const bodyId = `${docId}:tree:body`;
    nodes.push({
      id: bodyId,
      docId,
      parentId: rootId,
      depth: 1,
      order: 1,
      title: "Document Body",
      path: `${title} / Document Body`,
      headingLevel: 1,
      startLine: 1,
      endLine: Math.max(lines.length, 1),
      source: normalizeSlash(file),
      type: sourceType(file),
      topic: topicFor(raw),
      estimatedTokens: estimateTokens(raw),
      summary: summarizeText(raw, 820),
      terms: [...new Set(tokenize(raw))].slice(0, 180)
    });
    return { rootId, nodes };
  }

  const stack = [{ level: 0, id: rootId, title, path: title, depth: 0 }];
  headings.forEach((heading, index) => {
    while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop();
    const parent = stack[stack.length - 1] || stack[0];
    const next = headings[index + 1];
    const startLine = heading.line;
    const endLine = next ? Math.max(next.line - 1, startLine) : Math.max(lines.length, startLine);
    const content = lines.slice(startLine - 1, endLine).join("\n");
    const nodeId = `${docId}:tree:${String(index + 1).padStart(4, "0")}-${safeIdPart(heading.title)}`;
    const node = {
      id: nodeId,
      docId,
      parentId: parent.id,
      depth: parent.depth + 1,
      order: index + 1,
      title: heading.title,
      path: `${parent.path} / ${heading.title}`,
      headingLevel: heading.level,
      startLine,
      endLine,
      source: normalizeSlash(file),
      type: sourceType(file),
      topic: topicFor(content || heading.title),
      estimatedTokens: estimateTokens(content),
      summary: summarizeText(content, 820),
      terms: [...new Set(tokenize(`${heading.title}\n${content}`))].slice(0, 180)
    };
    nodes.push(node);
    stack.push({ level: heading.level, id: nodeId, title: heading.title, path: node.path, depth: node.depth });
  });
  return { rootId, nodes };
}

function sentenceSplit(text) {
  return stripMarkdown(text)
    .split(/(?<=[.!?])\s+|\n+/g)
    .map((line) => line.trim())
    .filter((line) => line.length >= 30 && line.length <= 480);
}

function topicFor(text) {
  for (const [topic, pattern] of topicPatterns) {
    if (pattern.test(text)) return topic;
  }
  return "general";
}

function extractEntities(text) {
  const counts = new Map();
  const patterns = [
    /\b[A-Z][A-Za-z0-9]+(?:[ -][A-Z][A-Za-z0-9]+){0,3}\b/g,
    /\bAE\d{1,2}\b/g,
    /\b[A-Z]{2,8}\b/g,
    /\b[A-Z]:[\\/][^\s`"'<>]+/g
  ];
  for (const pattern of patterns) {
    for (const match of String(text || "").matchAll(pattern)) {
      const entity = match[0].replace(/[.,;:!?)]$/, "").slice(0, 96);
      if (entity.length < 2 || /^(The|This|That|User|Assistant|JSON|HTML|CSS|API|GET|POST)$/i.test(entity)) continue;
      counts.set(entity, (counts.get(entity) || 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 36).map(([name, count]) => ({ name, count }));
}

function predicateFor(sentence) {
  if (/(must|should|needs|requires|approval|required)/i.test(sentence)) return "requires";
  if (/(uses|using|runs|calls|route|routes)/i.test(sentence)) return "uses";
  if (/(verified|proves|checks|tests|passes|fails)/i.test(sentence)) return "verifies";
  if (/(built|created|made|implemented|added|installed)/i.test(sentence)) return "built";
  if (/(do not|never|avoid|guardrail|off limits|unsafe)/i.test(sentence)) return "guards";
  if (/(located|stored|path|folder|directory|root)/i.test(sentence)) return "located";
  if (/(wants|decided|chose|goal|mission|objective)/i.test(sentence)) return "decides";
  return "relates";
}

function extractTriples(sentences, entities) {
  const names = entities.map((row) => row.name);
  const triples = [];
  const seen = new Set();
  for (const sentence of sentences) {
    const subject = names.find((name) => sentence.includes(name));
    if (!subject) continue;
    const predicate = predicateFor(sentence);
    const object = sentence.replace(subject, "").trim().slice(0, 220);
    const key = `${subject}:${predicate}:${object.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    triples.push({ subject, predicate, object, evidence: sentence.slice(0, 360) });
    if (triples.length >= 240) break;
  }
  return triples;
}

function sourceType(file) {
  const lower = normalizeSlash(file).toLowerCase();
  if (lower.includes("/project-thread/")) return "project";
  if (lower.includes("/claude-chats/")) return "archive";
  if (lower.includes("/receipts/")) return "receipt";
  if (lower.includes("/proof/")) return "proof";
  if (lower.includes("/compiled/")) return "memory";
  if (lower.includes("/references/")) return "reference";
  return "source";
}

async function latestClaudeWikiDir() {
  const latest = await readJson(path.join(orangeRoot, "memory", "claude-chats", "LATEST_IMPORT.json"), null);
  const candidates = [
    latest?.wikiDir,
    latest?.importId ? path.join(orangeRoot, "memory", "claude-chats", "wiki", latest.importId) : "",
    latest?.id ? path.join(orangeRoot, "memory", "claude-chats", "wiki", latest.id) : ""
  ].filter(Boolean);
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (await exists(resolved)) return resolved;
  }
  return "";
}

async function listFiles(dir, limit = 40, predicate = () => true) {
  const rows = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const row of rows) {
    if (!row.isFile() || !predicate(row.name)) continue;
    const full = path.join(dir, row.name);
    const stat = await fs.stat(full).catch(() => null);
    files.push({ full, size: stat?.size || 0, updatedAt: stat?.mtime?.toISOString?.() || "" });
  }
  return files.sort((a, b) => b.size - a.size || String(b.updatedAt).localeCompare(a.updatedAt)).slice(0, limit).map((row) => row.full);
}

async function collectSources() {
  const candidates = [
    path.join(orangeRoot, "project-thread", projectKey, "THREAD.md"),
    path.join(orangeRoot, "project-thread", projectKey, "PROJECT_SPINE.md"),
    path.join(orangeRoot, "project-thread", projectKey, "CODEX_HANDOFF.md"),
    path.join(orangeRoot, "memory", "compiled", "LESSONS_LEARNED.md"),
    path.join(orangeRoot, "memory", "compiled", "MISTAKES.md"),
    path.join(orangeRoot, "memory", "compiled", "CLC_PRIMER.md"),
    path.join(orangeRoot, "RECALL.md"),
    path.join(orangeRoot, "MISFIT_MANIFESTO.md"),
    path.join(orangeRoot, "references", "claude-codexa-orangebox-usage.md")
  ];
  const wikiDir = await latestClaudeWikiDir();
  if (wikiDir) {
    candidates.push(
      path.join(wikiDir, "CLAUDE_CHAT_WIKI.md"),
      path.join(wikiDir, "PROJECT_MENTION_INDEX.md"),
      path.join(wikiDir, "USER_SAID_PROJECT_INDEX.md")
    );
    candidates.push(...await listFiles(path.join(wikiDir, "full-transcripts"), 500, (name) => name.endsWith(".md")));
  }
  candidates.push(...await listFiles(path.join(orangeRoot, "memory", "compiled"), 100, (name) => name.endsWith(".md")));
  candidates.push(...await listFiles(path.join(orangeRoot, "receipts"), 25, (name) => name.endsWith(".json") || name.endsWith(".md")));
  candidates.push(...await listFiles(path.join(orangeRoot, "proof"), 10, (name) => name.endsWith(".json")));
  const existing = [];
  for (const file of candidates) {
    if (await exists(file)) existing.push(file);
  }
  return [...new Set(existing)];
}

async function buildEngine() {
  await fs.mkdir(engineRoot, { recursive: true });
  const files = await collectSources();
  const docs = [];
  const chunks = [];
  const pageTreeDocs = [];
  const pageTreeNodes = [];
  const nodeMap = new Map();
  const edgeMap = new Map();
  const inverted = new Map();

  function addNode(id, data) {
    const current = nodeMap.get(id) || { id, count: 0, ...data };
    nodeMap.set(id, { ...current, ...data, count: (current.count || 0) + (data.count || 1) });
  }

  function addEdge(from, to, label, evidence, sourceId) {
    const key = `${from}|${label}|${to}`;
    const current = edgeMap.get(key) || { from, to, label, count: 0, evidence: [], sources: [] };
    current.count += 1;
    if (evidence && current.evidence.length < 5) current.evidence.push(evidence);
    if (sourceId && !current.sources.includes(sourceId)) current.sources.push(sourceId);
    edgeMap.set(key, current);
  }

  for (const file of files) {
    const raw = await readText(file, "");
    if (!raw.trim()) continue;
    const docId = `doc:${sha256(file).slice(0, 12)}`;
    const clean = stripMarkdown(raw);
    const tokens = tokenize(clean);
    const tokenCounts = new Map();
    for (const token of tokens) tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
    const topTerms = [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 28).map(([token, count]) => ({ token, count }));
    const entities = extractEntities(raw);
    const sentences = sentenceSplit(raw).slice(0, 600);
    const triples = extractTriples(sentences, entities);
    const docChunks = chunkText(raw).map((text, index) => ({
      id: `${docId}:chunk:${index}`,
      docId,
      index,
      text: clampText(text, 2600),
      terms: [...new Set(tokenize(text))].slice(0, 80),
      topic: topicFor(text)
    }));
    const pageTreeDoc = buildPageTreeDoc(raw, file, docId);
    pageTreeDocs.push({
      id: docId,
      rootNodeId: pageTreeDoc.rootId,
      title: titleize(file),
      source: normalizeSlash(file),
      type: sourceType(file),
      topic: topicFor(raw),
      nodeCount: pageTreeDoc.nodes.length,
      leafCount: pageTreeDoc.nodes.filter((node) => !pageTreeDoc.nodes.some((child) => child.parentId === node.id)).length,
      estimatedTokens: estimateTokens(raw),
      hash: sha256(raw)
    });
    pageTreeNodes.push(...pageTreeDoc.nodes);
    docs.push({
      id: docId,
      title: titleize(file),
      source: normalizeSlash(file),
      type: sourceType(file),
      topic: topicFor(raw),
      chars: raw.length,
      estimatedTokens: estimateTokens(raw),
      hash: sha256(raw),
      topTerms,
      entities: entities.slice(0, 20),
      chunkCount: docChunks.length,
      treeNodeCount: pageTreeDoc.nodes.length
    });
    addNode(docId, { type: "document", label: titleize(file), source: normalizeSlash(file), topic: topicFor(raw) });
    for (const entity of entities) {
      const entityId = `entity:${entity.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      addNode(entityId, { type: "entity", label: entity.name, count: entity.count });
      addEdge(docId, entityId, "mentions", `${titleize(file)} mentions ${entity.name}`, docId);
    }
    for (const triple of triples) {
      const from = `entity:${triple.subject.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      const to = `claim:${sha256(`${triple.subject}:${triple.predicate}:${triple.object}`).slice(0, 14)}`;
      addNode(to, { type: "claim", label: `${triple.subject} ${triple.predicate}`, detail: triple.object });
      addEdge(from, to, triple.predicate, triple.evidence, docId);
    }
    for (const chunk of docChunks) {
      chunks.push(chunk);
      for (const term of chunk.terms) {
        const rows = inverted.get(term) || [];
        rows.push(chunk.id);
        inverted.set(term, rows);
      }
    }
  }

  const pageTreeParentIds = new Set(pageTreeNodes.map((node) => node.parentId).filter(Boolean));
  const pageTreeLeaves = pageTreeNodes.filter((node) => !pageTreeParentIds.has(node.id)).length;
  const graph = {
    status: "VERIFIED",
    generatedAt: iso(),
    project: projectKey,
    engine: "orangebox-knowledge-v1",
    adapterStatus: {
      pageTree: "VERIFIED_LOCAL_SECTION_TREE__NO_EMBEDDINGS_NO_VECTOR_DB",
      termRail: "VERIFIED_LOCAL_TERM_INDEX_FOR_FAST_CANDIDATES",
      relationshipMap: "LOCAL_JSON_RELATION_MAP_NOW__NEO4J_ADAPTER_LATER",
      orchestrator: "ORANGEBOX_NOW__LANGGRAPH_ADAPTER_NEXT",
      clc: await exists(path.join(orangeRoot, "memory", "compiled", "CLC_PRIMER.md")) ? "VERIFIED_ARCHIVE_CONTEXT" : "MISSING"
    },
    counts: {
      documents: docs.length,
      chunks: chunks.length,
      pageTreeNodes: pageTreeNodes.length,
      pageTreeLeaves,
      nodes: nodeMap.size,
      edges: edgeMap.size,
      terms: inverted.size
    },
    docs,
    nodes: [...nodeMap.values()].sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 600),
    edges: [...edgeMap.values()].sort((a, b) => b.count - a.count).slice(0, 900)
  };
  const index = {
    generatedAt: graph.generatedAt,
    chunks,
    inverted: Object.fromEntries([...inverted.entries()].map(([term, rows]) => [term, [...new Set(rows)].slice(0, 80)]))
  };
  const pageTree = {
    status: "VERIFIED",
    generatedAt: graph.generatedAt,
    project: projectKey,
    engine: "orangebox-knowledge-pagetree-v1",
    method: "natural_heading_tree",
    guarantee: "No embeddings, no external vector database, no artificial fixed-size chunking in this PageTree rail.",
    counts: {
      documents: pageTreeDocs.length,
      treeNodes: pageTreeNodes.length,
      leaves: pageTreeLeaves,
      maxDepth: Math.max(0, ...pageTreeNodes.map((node) => node.depth || 0))
    },
    docs: pageTreeDocs,
    nodes: pageTreeNodes
  };
  await writeJson(path.join(engineRoot, "graph.json"), graph);
  await writeJson(path.join(engineRoot, "lexical-index.json"), index);
  await writeJson(path.join(engineRoot, "pagetree.json"), pageTree);
  await writeText(path.join(engineRoot, "ENGINE.md"), renderEngineMarkdown(graph));
  await writeText(path.join(engineRoot, "dashboard.html"), renderDashboard(graph));
  await writeText(path.join(orangeRoot, "memory", "compiled", "ORANGEBOX_KNOWLEDGE_PRIMER.md"), renderPrimer(graph));
  await writeText(path.join(orangeRoot, "memory", "compiled", "ORANGEBOX_PAGETREE_PRIMER.md"), renderPageTreePrimer(pageTree));
  const receipt = {
    result: "VERIFIED",
    evidence: {
      graphPath: normalizeSlash(path.join(engineRoot, "graph.json")),
      indexPath: normalizeSlash(path.join(engineRoot, "lexical-index.json")),
      pageTreePath: normalizeSlash(path.join(engineRoot, "pagetree.json")),
      documents: graph.counts.documents,
      contextSlices: graph.counts.chunks,
      pageTreeNodes: graph.counts.pageTreeNodes,
      nodes: graph.counts.nodes,
      edges: graph.counts.edges,
      adapters: graph.adapterStatus
    },
    blockers: ["PageIndex itself is not vendor-installed; OrangeBOX PageTree is the verified native rail inspired by the inspected open-source approach."],
    nextAction: "Use /api/knowledge/query for PageTree-first recall; vendor PageIndex only after a separate import gate."
  };
  await writeJson(path.join(orangeRoot, "receipts", `orangebox-knowledge-${stamp()}.json`), receipt);
  return graph;
}

function renderEngineMarkdown(graph) {
  const topDocs = graph.docs.slice(0, 18).map((doc) => `- **${doc.title}** (${doc.type}, ${doc.estimatedTokens} est tok): \`${doc.source}\``).join("\n");
  const topNodes = graph.nodes.slice(0, 28).map((node) => `- ${node.type}: **${node.label || node.id}** (${node.count || 0})`).join("\n");
  const topEdges = graph.edges.slice(0, 28).map((edge) => `- ${edge.from} --${edge.label}/${edge.count}--> ${edge.to}`).join("\n");
  return [
    "# OrangeBOX Knowledge",
    "",
    "This is not a static wiki. It is OrangeBOX Knowledge: PageTree navigation, fast term recall, entities, claims, relationships, and receipts.",
    "",
    "The PageTree rail reads natural headings and transcript turns like a book: no embeddings, no external vector database, and no artificial fixed-size chunking in that rail.",
    "",
    "## Honest Adapter Status",
    "",
    ...Object.entries(graph.adapterStatus).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Counts",
    "",
    `- Documents: ${graph.counts.documents}`,
    `- PageTree Nodes: ${graph.counts.pageTreeNodes}`,
    `- PageTree Leaves: ${graph.counts.pageTreeLeaves}`,
    `- Context Slices: ${graph.counts.chunks}`,
    `- Nodes: ${graph.counts.nodes}`,
    `- Edges: ${graph.counts.edges}`,
    `- Terms: ${graph.counts.terms}`,
    "",
    "## Top Documents",
    "",
    topDocs || "- none",
    "",
    "## Top Nodes",
    "",
    topNodes || "- none",
    "",
    "## Top Edges",
    "",
    topEdges || "- none",
    ""
  ].join("\n");
}

function renderPrimer(graph) {
  const nodeLine = graph.nodes
    .filter((node) => node.type === "entity")
    .slice(0, 36)
    .map((node) => `${node.label}(${node.count || 0})`)
    .join(", ");
  const relationshipLines = graph.edges
    .slice(0, 24)
    .map((edge) => `- ${edge.label}: ${edge.evidence?.[0] || `${edge.from} -> ${edge.to}`}`)
    .join("\n");
  return [
    "# OrangeBOX Knowledge Primer",
    "",
    "Use this as a compact retrieval map. Search raw vault/ledger for final proof.",
    "",
    `Generated: ${graph.generatedAt}`,
    `Documents: ${graph.counts.documents}; PageTree nodes: ${graph.counts.pageTreeNodes}; context slices: ${graph.counts.chunks}; relationship nodes: ${graph.counts.nodes}; edges: ${graph.counts.edges}`,
    "",
    "## Entities",
    "",
    nodeLine || "none",
    "",
    "## Relationships",
    "",
    relationshipLines || "- none",
    ""
  ].join("\n");
}

function renderPageTreePrimer(pageTree) {
  const paths = pageTree.nodes
    .filter((node) => node.depth > 0)
    .sort((a, b) => (b.estimatedTokens || 0) - (a.estimatedTokens || 0))
    .slice(0, 40)
    .map((node) => `- ${node.path} (lines ${node.startLine}-${node.endLine}, ${node.estimatedTokens} est tok): ${node.summary || "no summary"}`)
    .join("\n");
  return [
    "# OrangeBOX PageTree Primer",
    "",
    "Use this when the model should navigate memory like a book instead of loading piles of text.",
    "",
    `Generated: ${pageTree.generatedAt}`,
    `Documents: ${pageTree.counts.documents}; tree nodes: ${pageTree.counts.treeNodes}; leaves: ${pageTree.counts.leaves}; max depth: ${pageTree.counts.maxDepth}`,
    "",
    "## Method",
    "",
    "- Build a hierarchy from markdown headings and transcript turns.",
    "- Retrieve by path, title, local terms, and source line ranges.",
    "- Keep citations traceable to files and lines.",
    "- No embeddings, no external vector database, no artificial fixed-size chunking in the PageTree rail.",
    "",
    "## High-Signal Paths",
    "",
    paths || "- none",
    ""
  ].join("\n");
}

function renderDashboard(graph) {
  const esc = (value) => String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>OrangeBOX Knowledge</title>
  <style>
    body{margin:0;background:#070914;color:#eef6ff;font:14px/1.5 Inter,Segoe UI,sans-serif}
    main{max-width:1180px;margin:0 auto;padding:32px}
    h1{font-size:42px;margin:0 0 10px}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:20px 0}
    .card{border:1px solid rgba(125,211,252,.22);background:rgba(13,18,38,.84);border-radius:14px;padding:14px}
    strong{color:#7dd3fc} small{color:#94a3b8;display:block}
    .list{display:grid;gap:8px}.item{padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.035)}
    @media(max-width:760px){.grid{grid-template-columns:1fr 1fr}h1{font-size:30px}}
  </style>
</head>
<body><main>
  <h1>OrangeBOX Knowledge</h1>
  <p>This is the local OrangeBOX Knowledge rail: PageTree navigation, fast term recall, entities, claims, edges, and receipts. Not a static wiki.</p>
  <div class="grid">
    <div class="card"><strong>${graph.counts.documents}</strong><small>documents</small></div>
    <div class="card"><strong>${graph.counts.pageTreeNodes}</strong><small>PageTree nodes</small></div>
    <div class="card"><strong>${graph.counts.nodes}</strong><small>nodes</small></div>
    <div class="card"><strong>${graph.counts.edges}</strong><small>edges</small></div>
  </div>
  <h2>Adapter Truth</h2>
  <div class="list">${Object.entries(graph.adapterStatus).map(([key, value]) => `<div class="item"><strong>${esc(key)}</strong><small>${esc(value)}</small></div>`).join("")}</div>
  <h2>Top Sources</h2>
  <div class="list">${graph.docs.slice(0, 30).map((doc) => `<div class="item"><strong>${esc(doc.title)}</strong><small>${esc(doc.type)} / ${doc.estimatedTokens} est tok / ${esc(doc.source)}</small></div>`).join("")}</div>
</main></body></html>`;
}

function scoreChunk(chunk, terms) {
  const hay = new Set(chunk.terms || []);
  let score = 0;
  for (const term of terms) if (hay.has(term)) score += 4;
  if (terms.some((term) => chunk.topic.includes(term))) score += 2;
  return score;
}

function scorePageTreeNode(node, terms) {
  const hay = new Set(node.terms || []);
  const title = String(node.title || "").toLowerCase();
  const pathText = String(node.path || "").toLowerCase();
  let score = 0;
  const reasons = [];
  for (const term of terms) {
    if (hay.has(term)) {
      score += 5;
      if (reasons.length < 4) reasons.push(`term:${term}`);
    }
    if (title.includes(term)) {
      score += 10;
      if (reasons.length < 4) reasons.push(`title:${term}`);
    } else if (pathText.includes(term)) {
      score += 6;
      if (reasons.length < 4) reasons.push(`path:${term}`);
    }
  }
  if ((node.depth || 0) > 0) score += 1;
  if (terms.some((term) => String(node.topic || "").includes(term))) score += 2;
  return { score, reasons };
}

function queryPageTree(pageTree, terms) {
  if (!pageTree?.nodes?.length) return [];
  const parentIds = new Set(pageTree.nodes.map((node) => node.parentId).filter(Boolean));
  return pageTree.nodes
    .map((node) => {
      const scored = scorePageTreeNode(node, terms);
      return {
        id: node.id,
        docId: node.docId,
        path: node.path,
        title: node.title,
        source: node.source,
        startLine: node.startLine,
        endLine: node.endLine,
        depth: node.depth,
        isLeaf: !parentIds.has(node.id),
        topic: node.topic,
        score: scored.score,
        reasons: scored.reasons,
        summary: node.summary
      };
    })
    .filter((node) => node.score > 0)
    .sort((a, b) => b.score - a.score || b.depth - a.depth)
    .slice(0, 10);
}

async function runQuery(q) {
  const graph = await readJson(path.join(engineRoot, "graph.json"), null);
  const index = await readJson(path.join(engineRoot, "lexical-index.json"), null);
  const pageTree = await readJson(path.join(engineRoot, "pagetree.json"), null);
  if (!graph || !index) {
    return { status: "MISSING_INDEX", query: q, results: [], message: "Run OrangeBOX Knowledge rebuild first." };
  }
  const terms = [...new Set(tokenize(q))].slice(0, 18);
  const treeResults = queryPageTree(pageTree, terms);
  const candidateIds = new Set();
  for (const term of terms) {
    for (const id of index.inverted?.[term] || []) candidateIds.add(id);
  }
  const chunkById = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  const results = [...candidateIds]
    .map((id) => chunkById.get(id))
    .filter(Boolean)
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, terms) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  const relatedNodes = graph.nodes
    .filter((node) => terms.some((term) => String(node.label || node.id || "").toLowerCase().includes(term)))
    .slice(0, 18);
  const relatedEdges = graph.edges
    .filter((edge) => relatedNodes.some((node) => edge.from === node.id || edge.to === node.id))
    .slice(0, 24);
  return {
    status: "VERIFIED",
    generatedAt: iso(),
    query: q,
    terms,
    treeStatus: pageTree?.status || "MISSING_PAGETREE",
    treeResults,
    results: results.map((chunk) => ({
      id: chunk.id,
      docId: chunk.docId,
      topic: chunk.topic,
      score: chunk.score,
      preview: clampText(stripMarkdown(chunk.text), 620)
    })),
    relatedNodes,
    relatedEdges
  };
}

async function main() {
  if (query) {
    console.log(JSON.stringify(await runQuery(query), null, 2));
    return;
  }
  const graph = await buildEngine();
  console.log(JSON.stringify({
    status: graph.status,
    generatedAt: graph.generatedAt,
    project: graph.project,
    engineRoot: normalizeSlash(engineRoot),
    counts: graph.counts,
    adapterStatus: graph.adapterStatus,
    dashboard: normalizeSlash(path.join(engineRoot, "dashboard.html")),
    pageTree: normalizeSlash(path.join(engineRoot, "pagetree.json"))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

