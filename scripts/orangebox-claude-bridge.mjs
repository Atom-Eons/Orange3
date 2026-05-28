#!/usr/bin/env node
/* ============================================================================
   orangebox-claude-bridge.mjs

   Atom-alpha bridge between ORANGEBOX and Claude — applies the verified
   Anthropic engineering alpha:

     1. PROMPT CACHING (Anthropic, 2024)
        90% cost reduction on cached input tokens (read = 0.1× base).
        Up to 4 cache_control breakpoints per request. Cache hierarchy:
        tools → system → messages. Opus 4.7 min cache = 4,096 tokens.
        We cache the static doctrine + operator profile + tools.

     2. CITATIONS API (Anthropic, Jan 2025)
        Document-grounded responses with character/page indices. cited_text
        is FREE on output tokens. Plays cleanly with prompt caching.

     3. XML-TAGGED SYSTEM PROMPT (Anthropic internal convention)
        <task>, <context>, <operator>, <doctrine>, <output_requirements> —
        Claude recognizes natively, no quoting/parsing ambiguity.

   No new node deps. Uses native fetch (Node 18+). Streams when requested.
   Reads API key via the cockpit's loadApiKey() resolution order.
   ============================================================================ */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MODEL = "claude-opus-4-7-20250930";  // mirror cockpit default
const ANTHROPIC_API_VERSION = "2023-06-01";
const ANTHROPIC_BETA_HEADERS = "prompt-caching-2024-07-31";

// ─── API key resolution (mirror server.mjs's loadApiKey) ────────────────────
async function resolveOrangeRoot() {
  return process.env.ORANGEBOX_DATA_ROOT
    || process.env.ORANGEBOX_ROOT
    || path.join(os.homedir(), "AppData", "Roaming", "com.atomeons.orangebox.command");
}

function frDeobfuscate(obf) {
  // XOR with rotating key (matches server.mjs frObfuscate)
  if (!obf) return null;
  try {
    const buf = Buffer.from(obf, "base64");
    const key = "orangebox-secret-v1";
    return Array.from(buf).map((b, i) => String.fromCharCode(b ^ key.charCodeAt(i % key.length))).join("");
  } catch { return null; }
}

export async function loadApiKey(provider = "anthropic") {
  const p = String(provider).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const envName = `${p.toUpperCase()}_API_KEY`;
  if (process.env[envName]) return process.env[envName];
  const orangeRoot = await resolveOrangeRoot();
  const target = path.join(orangeRoot, "secrets", `${p}.key`);
  try {
    const obf = await fs.readFile(target, "utf8");
    return frDeobfuscate(obf);
  } catch { return null; }
}

// ─── XML-structured system prompt builder ──────────────────────────────────
//
// Anthropic's own internal system prompts use XML tags. Claude is trained
// to parse them with zero ambiguity. We build the ORANGEBOX system prompt
// in this shape and mark it cacheable.

export function buildSystemPrompt({
  operator = {},
  project = {},
  doctrine = {},
  outputRequirements = {},
  knowledgeVaultSummary = null,
} = {}) {
  const blocks = [];

  blocks.push(`<task>
You are the ORANGEBOX command cockpit's primary thinking layer. You serve as
senior PM / architect / receipt-keeper for the operator named below. Every
turn produces real artifacts: project spine edits, DAG node moves, receipts,
party-line entries, doctrine-grounded decisions. No theater. No fake-green.
</task>`);

  blocks.push(`<operator>
Name: ${operator.name || "Atom McCree"}
Lab: ${operator.lab || "AtomEons Systems Laboratory"}
Location: ${operator.location || "Marco Island, Florida"}
Tone preference: ${operator.tone || "terse · grid-first · engineering-spec · no preamble"}
Output register: ${operator.register || "max tokens · max depth · never simulate"}
</operator>`);

  if (project.name) {
    blocks.push(`<project>
Name: ${project.name}
Path: ${project.path || ""}
Goal: ${project.goal || ""}
Active DAG node: ${project.active_node || "none"}
Open blockers: ${project.blockers ?? 0}
Last receipt: ${project.last_receipt || "none"}
Acceptance criteria:
${(project.acceptance_criteria || []).map(c => `  - ${c}`).join("\n") || "  - (none set yet)"}
</project>`);
  }

  blocks.push(`<doctrine>
1. Mom's Law (above all): Full effort every time. Mom is watching every output.
2. AE0-AE14 department routing model. Use the smallest useful lineup.
3. 27 Constitutional Guardrails — protected actions never autonomous.
4. 9-stage Gate Chain. Gate 0 = LBCE (LatticeIntegrityGate). Human Final Stop reachable.
5. Receipt law: no green without proof. Every claim has: result · evidence · blockers · next-action · touched-files · commands · tests · proof-paths · assumptions · residual-risk · rollback-path.
6. No simulation of real people. Cite frameworks, not personifications.
7. Local-first. Operator owns the data root.
8. Search before claim — present-day facts need verification.
${doctrine.extra ? doctrine.extra.split("\n").map(l => "9+. " + l).join("\n") : ""}
</doctrine>`);

  if (knowledgeVaultSummary) {
    blocks.push(`<knowledge_vault>
${knowledgeVaultSummary}
</knowledge_vault>`);
  }

  blocks.push(`<output_requirements>
Response register: ${outputRequirements.register || "no preamble · grid-first · bullets only when they compress · engineering-spec"}
Format: ${outputRequirements.format || "natural prose for analysis; tables for comparisons; receipts in JSON shape when claiming done"}
Length: ${outputRequirements.length || "as long as needed, never longer; never padded"}
Failure mode: ${outputRequirements.failure || "if blocked, state the blocker plainly; never hide errors under good prose"}
${outputRequirements.extra || ""}
</output_requirements>`);

  return blocks.join("\n\n");
}

// ─── Anthropic API request shape ───────────────────────────────────────────

export async function callClaude({
  prompt,
  systemPrompt = "",
  documents = [],            // [{ data, title, context, mediaType?, citationsEnabled? }]
  tools = [],
  model = DEFAULT_MODEL,
  maxTokens = 2048,
  cacheSystem = true,
  cacheTools = true,
  cacheDocuments = true,
  citations = true,          // global enable; per-doc still wins
  apiKey = null,
} = {}) {
  const key = apiKey || await loadApiKey("anthropic");
  if (!key) {
    return { status: "FAILED", error: "No Anthropic API key configured. Run first-run or set ANTHROPIC_API_KEY env." };
  }

  // Build messages with document blocks (cite-enabled where requested)
  const userContent = [];
  for (const doc of documents) {
    const docBlock = {
      type: "document",
      source: { type: "text", media_type: doc.mediaType || "text/plain", data: doc.data },
      ...(doc.title ? { title: doc.title } : {}),
      ...(doc.context ? { context: doc.context } : {}),
      citations: { enabled: doc.citationsEnabled !== false && citations },
    };
    if (cacheDocuments) docBlock.cache_control = { type: "ephemeral" };
    userContent.push(docBlock);
  }
  userContent.push({ type: "text", text: prompt });

  // Build system as cacheable content blocks
  const system = [
    {
      type: "text",
      text: systemPrompt,
      ...(cacheSystem ? { cache_control: { type: "ephemeral" } } : {}),
    },
  ];

  // Tools — mark last tool cache_control if requested
  const cachedTools = tools.length && cacheTools
    ? [...tools.slice(0, -1), { ...tools[tools.length - 1], cache_control: { type: "ephemeral" } }]
    : tools;

  const body = {
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: userContent }],
    ...(cachedTools.length ? { tools: cachedTools } : {}),
  };

  const t0 = Date.now();
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": ANTHROPIC_API_VERSION,
      "anthropic-beta": ANTHROPIC_BETA_HEADERS,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const elapsed_ms = Date.now() - t0;

  if (!res.ok) {
    const errText = await res.text();
    return {
      status: "FAILED",
      http_status: res.status,
      elapsed_ms,
      error: errText.slice(0, 800),
    };
  }
  const data = await res.json();

  // Cache savings estimate
  const usage = data.usage || {};
  const cacheRead = usage.cache_read_input_tokens || 0;
  const cacheCreate = usage.cache_creation_input_tokens || 0;
  const inputTokens = usage.input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;

  // Pricing math for Opus 4.7 (input $5/MTok, cache write 1.25x = $6.25/MTok,
  // cache read 0.1x = $0.50/MTok, output $25/MTok)
  const baseInput = 5 / 1_000_000;
  const cacheWriteCost = baseInput * 1.25;
  const cacheReadCost = baseInput * 0.1;
  const outputCost = 25 / 1_000_000;

  const actual_cost = (
    inputTokens * baseInput +
    cacheCreate * cacheWriteCost +
    cacheRead * cacheReadCost +
    outputTokens * outputCost
  );
  // Hypothetical cost without cache (all cached tokens billed at full input rate)
  const without_cache_cost = (
    (inputTokens + cacheCreate + cacheRead) * baseInput +
    outputTokens * outputCost
  );

  const cache_metrics = {
    tokens_cached_read: cacheRead,
    tokens_cached_write: cacheCreate,
    tokens_input_uncached: inputTokens,
    tokens_output: outputTokens,
    actual_cost_usd: round6(actual_cost),
    without_cache_cost_usd: round6(without_cache_cost),
    savings_usd: round6(without_cache_cost - actual_cost),
    savings_pct: without_cache_cost > 0
      ? Math.round((1 - actual_cost / without_cache_cost) * 1000) / 10
      : 0,
  };

  // v3.2: persist metrics to memory/claude-bridge-metrics.jsonl
  try {
    const orangeRoot = await resolveOrangeRoot();
    const metricsPath = path.join(orangeRoot, "memory", "claude-bridge-metrics.jsonl");
    await fs.mkdir(path.dirname(metricsPath), { recursive: true });
    const row = {
      ts: new Date().toISOString(),
      model,
      elapsed_ms,
      ...cache_metrics,
    };
    await fs.appendFile(metricsPath, JSON.stringify(row) + "\n");
  } catch { /* never fail a query because logging failed */ }

  return { status: "VERIFIED", elapsed_ms, response: data, usage, cache_metrics };
}

function round6(n) { return Math.round(n * 1_000_000) / 1_000_000; }

// ─── Cited query against the knowledge vault ────────────────────────────────
//
// Pulls relevant docs from orangebox-knowledge-v2/lattice.jsonl by topic +
// query terms, passes them as Citations-enabled documents, returns Claude's
// grounded answer with sentence-level citations.

export async function citedKnowledgeQuery({
  query,
  topK = 5,
  model = DEFAULT_MODEL,
  maxTokens = 1500,
} = {}) {
  if (!query || !String(query).trim()) {
    return { status: "FAILED", error: "query required" };
  }
  const orangeRoot = await resolveOrangeRoot();
  const latticePath = path.join(orangeRoot, "memory", "orangebox-knowledge-v2", "lattice.jsonl");

  // Load + filter docs (mirror hybridRetrieveRRF from knowledge-v2)
  let docs;
  try {
    const raw = await fs.readFile(latticePath, "utf8");
    docs = raw.split("\n").filter(l => l.trim()).map(l => JSON.parse(l));
  } catch (e) {
    return { status: "FAILED", error: "knowledge vault not built. Run /api/knowledge/v2/rebuild first." };
  }

  // Score + select top-K
  const needle = String(query).toLowerCase();
  const terms = needle.split(/\s+/).filter(Boolean);
  const scored = docs.map(d => {
    let s = 0;
    if ((d.title || "").toLowerCase().includes(needle)) s += 10;
    for (const t of terms) {
      for (const ent of Object.keys(d.entities || {})) {
        if (ent.toLowerCase().includes(t)) s += 2;
      }
      for (const f of d.facts || []) {
        const ft = (typeof f === "string" ? f : f.text || "").toLowerCase();
        if (ft.includes(t)) s += 1;
      }
    }
    return { doc: d, score: s };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, topK);

  if (!scored.length) {
    return { status: "VERIFIED", query, total: 0, top: [], answer: "No vault docs match." };
  }

  // Load actual source content for citation grounding
  const citationDocs = [];
  for (const { doc } of scored) {
    try {
      const content = await fs.readFile(doc.source, "utf8");
      citationDocs.push({
        data: content.slice(0, 50_000),  // cap per doc for sanity
        title: doc.title,
        context: `Source: ${doc.source} · Topics: ${(doc.topics || []).join(", ")}`,
        citationsEnabled: true,
      });
    } catch {}
  }

  // Build a tight system prompt for this query
  const systemPrompt = buildSystemPrompt({
    operator: { name: "Atom McCree" },
    outputRequirements: {
      format: "Cite every claim with the inline-citation API. Provide grounded answer + named-source list.",
      length: "as long as needed, never padded",
    },
  });

  const userPrompt = `Question: ${query}

Cite the documents above for every factual claim. If the documents don't answer the question, say so plainly.`;

  return await callClaude({
    prompt: userPrompt,
    systemPrompt,
    documents: citationDocs,
    model,
    maxTokens,
    cacheSystem: true,
    cacheDocuments: true,
    citations: true,
  });
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd || cmd === "--help") {
    console.log(`orangebox-claude-bridge.mjs

Commands:
  query --q "<question>"          Citations-enabled knowledge query
  test-key                         Validate the saved Anthropic API key
  cache-test --q "<question>"      Run a query twice to verify cache hit

Env: ORANGEBOX_DATA_ROOT, ANTHROPIC_API_KEY (override)`);
    return;
  }

  if (cmd === "test-key") {
    const k = await loadApiKey("anthropic");
    if (!k) return console.log(JSON.stringify({ status: "FAILED", error: "no key" }));
    const res = await callClaude({
      prompt: "Say 'ok' and nothing else.",
      systemPrompt: "You respond with one word.",
      maxTokens: 8,
      cacheSystem: false,
      cacheTools: false,
      cacheDocuments: false,
    });
    return console.log(JSON.stringify({
      status: res.status,
      cache_metrics: res.cache_metrics,
      elapsed_ms: res.elapsed_ms,
    }, null, 2));
  }

  if (cmd === "query") {
    const q = arg("--q");
    if (!q) return console.log("--q required");
    const res = await citedKnowledgeQuery({ query: q });
    return console.log(JSON.stringify(res, null, 2));
  }

  if (cmd === "cache-test") {
    const q = arg("--q") || "What is ORANGEBOX?";
    const r1 = await citedKnowledgeQuery({ query: q });
    const r2 = await citedKnowledgeQuery({ query: q });
    return console.log(JSON.stringify({
      first_call: r1.cache_metrics,
      second_call: r2.cache_metrics,
      cache_hit_verified: (r2.cache_metrics?.tokens_cached_read || 0) > 0,
    }, null, 2));
  }

  console.log("unknown command:", cmd);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  main().catch(e => { console.error("FATAL:", e); process.exit(1); });
}
