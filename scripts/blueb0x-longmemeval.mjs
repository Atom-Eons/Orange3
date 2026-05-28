import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const engineRoot = path.join(orangeRoot, "memory", "orangebox-knowledge");
const benchmarkRoot = path.join(orangeRoot, "benchmarks", "longmemeval");
const officialDataFile = path.join(orangeRoot, "benchmarks", "longmemeval-official", "data", "longmemeval_oracle.json");
const receiptsRoot = path.join(orangeRoot, "receipts");

const stopWords = new Set("a an and are as at be but by can do for from has have i if in into is it its me my no not of on or our should so than that the this to use we what when where who why with you your".split(" "));

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

function tokenize(text) {
  return [...String(text || "").toLowerCase().matchAll(/[a-z][a-z0-9_-]{2,}/g)]
    .map((match) => match[0])
    .filter((token) => !stopWords.has(token) && token.length <= 42);
}

function stripMarkdown(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, " "))
    .replace(/[#>*_`|~[\](){}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clampText(text, limit = 520) {
  const value = String(text || "");
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

function scoreChunk(chunk, terms) {
  const hay = new Set(chunk.terms || []);
  let score = 0;
  for (const term of terms) if (hay.has(term)) score += 4;
  if (terms.some((term) => String(chunk.topic || "").includes(term))) score += 2;
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

function queryPageTree(pageTree, terms, topK = 8) {
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
    .slice(0, topK);
}

function queryLexical(index, terms, topK = 8) {
  if (!index?.chunks?.length) return [];
  const candidateIds = new Set();
  for (const term of terms) {
    for (const id of index.inverted?.[term] || []) candidateIds.add(id);
  }
  const chunkById = new Map(index.chunks.map((chunk) => [chunk.id, chunk]));
  return [...candidateIds]
    .map((id) => chunkById.get(id))
    .filter(Boolean)
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, terms) }))
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((chunk) => ({
      id: chunk.id,
      docId: chunk.docId,
      topic: chunk.topic,
      score: chunk.score,
      preview: clampText(stripMarkdown(chunk.text), 900)
    }));
}

function expectedTermScore(resultsText, expectedTerms) {
  const normalized = stripMarkdown(resultsText).toLowerCase();
  const found = [];
  const missing = [];
  for (const term of expectedTerms) {
    if (normalized.includes(String(term).toLowerCase())) found.push(term);
    else missing.push(term);
  }
  const score = expectedTerms.length ? found.length / expectedTerms.length : 0;
  return { score, found, missing };
}

function localCases() {
  return [
    {
      id: "bbx_memory_one_chat",
      ability: "Information Extraction",
      question: "What is the top-level chat model BLUEB0X should use for project continuity?",
      expectedTerms: ["one endless project chat", "full history", "current position"]
    },
    {
      id: "bbx_codexa_role",
      ability: "Information Extraction",
      question: "What role does Codexa play versus the cockpit machine?",
      expectedTerms: ["Codexa", "worker", "cockpit", "execution"]
    },
    {
      id: "bbx_ports",
      ability: "Information Extraction",
      question: "Which bridge or command rail ports matter for Codexa control?",
      expectedTerms: ["8097", "8098", "bridge", "rail"]
    },
    {
      id: "bbx_checkmate_fake_green",
      ability: "Knowledge Updates",
      question: "What failure should Checkmate prevent before completion claims?",
      expectedTerms: ["fake green", "Checkmate", "receipt", "verified"]
    },
    {
      id: "bbx_page_tree",
      ability: "Multi-Session Reasoning",
      question: "What retrieval style did BLUEB0X Knowledge adopt instead of vector-only search?",
      expectedTerms: ["PageTree", "No embeddings", "No vector", "fixed-size chunking"]
    },
    {
      id: "bbx_party_line",
      ability: "Information Extraction",
      question: "What is FATCAT or the party line supposed to coordinate?",
      expectedTerms: ["FATCAT", "party line", "departments", "CLIs"]
    },
    {
      id: "bbx_hot_swap",
      ability: "Temporal Reasoning",
      question: "How should department models use Codexa RAM?",
      expectedTerms: ["hot-swap", "keep_alive", "release", "Ollama"]
    },
    {
      id: "bbx_human_approval",
      ability: "Abstention/Control",
      question: "When should autonomous coding stop for human approval?",
      expectedTerms: ["approval", "destructive", "scope", "decision"]
    },
    {
      id: "bbx_visual_proof",
      ability: "Information Extraction",
      question: "What does the visual proof loop need to verify for UI work?",
      expectedTerms: ["screenshots", "blank", "overflow", "dead buttons"]
    },
    {
      id: "bbx_learning_crawl",
      ability: "Knowledge Updates",
      question: "What continuous learning limit did the operator set?",
      expectedTerms: ["daily", "10%", "internet bandwidth", "learning"]
    },
    {
      id: "bbx_project_progress",
      ability: "Multi-Session Reasoning",
      question: "How should project progress be represented in the app?",
      expectedTerms: ["1A", "1B", "DAG", "progress"]
    },
    {
      id: "bbx_cost_truth",
      ability: "Abstention/Control",
      question: "What must BLUEB0X avoid pretending about subscription token telemetry?",
      expectedTerms: ["UNKNOWN", "fake telemetry", "token", "usage"]
    }
  ];
}

async function officialStatus() {
  const raw = await readText(officialDataFile, "");
  if (!raw) return { status: "MISSING", path: officialDataFile, sizeBytes: 0, sampleCount: 0 };
  try {
    const parsed = JSON.parse(raw);
    return {
      status: "READY",
      path: officialDataFile,
      sizeBytes: Buffer.byteLength(raw),
      sampleCount: Array.isArray(parsed) ? parsed.length : 0,
      sampleFields: Array.isArray(parsed) && parsed[0] ? Object.keys(parsed[0]) : []
    };
  } catch (error) {
    return {
      status: "PARTIAL_OR_INVALID_JSON",
      path: officialDataFile,
      sizeBytes: Buffer.byteLength(raw),
      sampleCount: 0,
      error: error.message,
      tailHash: sha256(raw.slice(-4000))
    };
  }
}

async function main() {
  const generatedAt = iso();
  const runStamp = stamp();
  const [pageTree, index, graph] = await Promise.all([
    readJson(path.join(engineRoot, "pagetree.json"), null),
    readJson(path.join(engineRoot, "lexical-index.json"), null),
    readJson(path.join(engineRoot, "graph.json"), null)
  ]);

  if (!pageTree || !index || !graph) {
    throw new Error(`Missing BLUEB0X Knowledge index under ${engineRoot}. Run npm run knowledge first.`);
  }

  const cases = localCases();
  const results = cases.map((testCase) => {
    const terms = [...new Set(tokenize(testCase.question))].slice(0, 18);
    const treeResults = queryPageTree(pageTree, terms, 8);
    const lexicalResults = queryLexical(index, terms, 8);
    const evidenceText = [
      ...treeResults.map((result) => `${result.title}\n${result.summary || ""}\n${result.source || ""}`),
      ...lexicalResults.map((result) => result.preview)
    ].join("\n\n");
    const termScore = expectedTermScore(evidenceText, testCase.expectedTerms);
    const passed = termScore.score >= 0.6;
    return {
      ...testCase,
      status: passed ? "PASS" : "FAIL",
      score: Number(termScore.score.toFixed(3)),
      found: termScore.found,
      missing: termScore.missing,
      queryTerms: terms,
      topTree: treeResults.slice(0, 3).map((result) => ({
        title: result.title,
        score: result.score,
        source: result.source,
        reasons: result.reasons,
        summary: clampText(result.summary || "", 260)
      })),
      topLexical: lexicalResults.slice(0, 3)
    };
  });

  const passed = results.filter((result) => result.status === "PASS").length;
  const failed = results.length - passed;
  const official = await officialStatus();
  const status = failed === 0 ? "PASS" : passed / results.length >= 0.8 ? "PARTIAL_PASS" : "FAIL";
  const report = {
    status,
    generatedAt,
    benchmark: "LongMemEval-style local memory retrieval",
    officialLongMemEval: official,
    note: "This run tests BLUEB0X Knowledge retrieval against project-memory questions using LongMemEval ability categories. Full official QA scoring requires the complete official dataset and an answer-generation/judge lane.",
    engine: {
      root: engineRoot,
      pageTreeStatus: pageTree.status,
      method: pageTree.method,
      guarantee: pageTree.guarantee,
      documents: pageTree.counts?.documents,
      treeNodes: pageTree.counts?.treeNodes,
      lexicalChunks: index.chunks?.length || 0,
      graphNodes: graph.nodes?.length || 0,
      graphEdges: graph.edges?.length || 0
    },
    metrics: {
      cases: results.length,
      passed,
      failed,
      passRate: Number((passed / results.length).toFixed(3)),
      averageExpectedTermRecall: Number((results.reduce((sum, result) => sum + result.score, 0) / results.length).toFixed(3))
    },
    results
  };

  const jsonPath = path.join(benchmarkRoot, `blueb0x-longmemeval-${runStamp}.json`);
  const mdPath = path.join(benchmarkRoot, `blueb0x-longmemeval-${runStamp}.md`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-longmemeval-${runStamp}.md`);
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

  const markdown = [
    `# BLUEB0X LongMemEval Receipt`,
    ``,
    `Generated: ${generatedAt}`,
    `Status: ${status}`,
    ``,
    `## Scope`,
    ``,
    `Ran a LongMemEval-style memory retrieval check against BLUEB0X Knowledge. Ability labels follow the official benchmark categories, but the questions are project-native so the test measures whether our memory engine remembers our actual work.`,
    ``,
    `Official dataset status: ${official.status}`,
    official.error ? `Official dataset note: ${official.error}` : ``,
    ``,
    `## Engine`,
    ``,
    `- PageTree status: ${pageTree.status}`,
    `- Method: ${pageTree.method}`,
    `- Documents: ${pageTree.counts?.documents}`,
    `- Tree nodes: ${pageTree.counts?.treeNodes}`,
    `- Lexical chunks: ${index.chunks?.length || 0}`,
    `- Graph nodes: ${graph.nodes?.length || 0}`,
    ``,
    `## Results`,
    ``,
    `- Cases: ${results.length}`,
    `- Passed: ${passed}`,
    `- Failed: ${failed}`,
    `- Pass rate: ${Math.round((passed / results.length) * 100)}%`,
    `- Average expected-term recall: ${Math.round(report.metrics.averageExpectedTermRecall * 100)}%`,
    ``,
    `## Failed Or Weak Cases`,
    ``,
    ...results
      .filter((result) => result.status !== "PASS")
      .map((result) => `- ${result.id}: score ${result.score}; missing ${result.missing.join(", ") || "none"}`),
    results.every((result) => result.status === "PASS") ? `- None` : ``,
    ``,
    `## Evidence Files`,
    ``,
    `- JSON: ${jsonPath}`,
    `- Report: ${mdPath}`,
    `- Receipt: ${receiptPath}`,
    ``,
    `## Next Gate`,
    ``,
    `Download a complete official LongMemEval dataset, ingest each instance's timestamped sessions into a temporary BLUEB0X Knowledge namespace, generate answers with the selected reader lane, then run the official evaluator.`
  ].filter((line) => line !== undefined).join("\n");

  await writeText(mdPath, markdown);
  await writeText(receiptPath, markdown);
  console.log(JSON.stringify({
    status,
    passRate: report.metrics.passRate,
    averageExpectedTermRecall: report.metrics.averageExpectedTermRecall,
    officialDataset: official.status,
    jsonPath,
    mdPath,
    receiptPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
