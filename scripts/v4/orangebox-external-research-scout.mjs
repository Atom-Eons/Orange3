#!/usr/bin/env node
/*
  orangebox-external-research-scout.mjs

  Low-bandwidth external research scout for Orangebox Ops. It checks current
  public sources, scores them by Orangebox relevance, and writes candidate
  research signals. It does not promote changes, call paid models, use
  credentials, scrape private pages, or mutate frontend/visual work.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const outRoot = path.join(dataRoot, "research-scout");
const receiptDir = path.join(repoRoot, "receipts");

const FETCH_TIMEOUT_MS = 12000;
const BODY_LIMIT = 350_000;
const USER_AGENT = "OrangeboxResearchScout/1.0 (+local-first; evidence-candidate-only)";

const ORANGEBOX_TERMS = [
  "agent", "agents", "memory", "context", "compression", "mcp", "tool", "tools",
  "evaluation", "eval", "benchmark", "coding", "software", "safety", "assurance",
  "receipt", "provenance", "retrieval", "workflow", "autonomous", "biomedical",
  "scientific", "claude code", "anthropic", "ollama", "local", "json schema",
];

const SOURCE_TARGETS = [
  {
    id: "anthropic_claude_code_cli",
    tier: "T0_VENDOR_DOCS",
    source_family: "anthropic",
    url: "https://code.claude.com/docs/en/cli-usage",
    reason: "Claude Code CLI/session/background/structured-output behavior affects Orangebox primers and handoffs.",
  },
  {
    id: "anthropic_claude_code_mcp",
    tier: "T0_VENDOR_DOCS",
    source_family: "anthropic",
    url: "https://code.claude.com/docs/en/mcp",
    reason: "MCP scope, output limits, resources, plugins, and tool search shape the Orangebox MCP quarantine gateway.",
  },
  {
    id: "anthropic_long_running_harnesses",
    tier: "T0_VENDOR_ENGINEERING",
    source_family: "anthropic",
    url: "https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents",
    reason: "Long-running agent handoff, initializer state, progress files, and incremental proof loops shape Orangebox always-on work.",
  },
  {
    id: "anthropic_managed_agents_brain_hands_session",
    tier: "T0_VENDOR_ENGINEERING",
    source_family: "anthropic",
    url: "https://www.anthropic.com/engineering/managed-agents",
    reason: "Brain/hands/session decoupling maps directly to Orangebox doer/watcher, Codexa rails, durable receipts, and recoverable sessions.",
  },
  {
    id: "anthropic_claude_code_sandboxing",
    tier: "T0_VENDOR_ENGINEERING",
    source_family: "anthropic",
    url: "https://www.anthropic.com/engineering/claude-code-sandboxing",
    reason: "Sandboxed filesystem and network boundaries inform Orangebox MCP/tool quarantine and Codexa execution rails.",
  },
  {
    id: "anthropic_agent_skills",
    tier: "T0_VENDOR_ENGINEERING",
    source_family: "anthropic",
    url: "https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills",
    reason: "Agent Skills lifecycle and composability inform Orangebox primer/skill portability across Codex, Claude, Antigravity, and local tools.",
  },
  {
    id: "mcp_latest_spec",
    tier: "T0_STANDARD",
    source_family: "mcp",
    url: "https://modelcontextprotocol.io/specification/latest",
    reason: "Protocol-level changes decide what Orangebox should expose to Codex, Claude, Antigravity, and local tools.",
  },
  {
    id: "nih_ai_assurance_lab",
    tier: "T0_GOVERNMENT_RESEARCH",
    source_family: "nih",
    url: "https://datascience.nih.gov/artificial-intelligence/initiatives/nih-ai-assurance-lab-insights",
    reason: "AI assurance lab patterns map directly to Orangebox proof, benchmark, and approval gates.",
  },
  {
    id: "arxiv_memory_autonomous_agents_survey",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2603.07670",
    reason: "Agent memory survey maps mechanism families and evaluation gaps for Orangebox Knowledge Engine and AtomSmasher.",
  },
  {
    id: "arxiv_memory_control_more_context",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2601.11653",
    reason: "Memory control addresses constraint loss, error accumulation, and memory-induced drift in long workflows.",
  },
  {
    id: "arxiv_active_context_compression",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2601.07190",
    reason: "Active context compression aligns with Orangebox least-action, workset, and expansion-warrant doctrine.",
  },
  {
    id: "arxiv_field_theoretic_memory",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2602.21220",
    reason: "Field-theoretic memory is a candidate model for decay, coupling, and importance-aware memory dynamics.",
  },
  {
    id: "arxiv_experience_compression_spectrum",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2604.15877",
    reason: "Experience compression spectrum unifies memory, skills, and rules; directly informs AtomSmasher cartridge/AIR/commitment layering.",
  },
];

const ARXIV_QUERIES = [
  {
    id: "agent_memory_context",
    query: "\"agent memory\" OR \"context compression\" OR \"memory control\"",
    source_family: "arxiv",
    tier: "T0_RESEARCH",
    reason: "Memory/context control is the AtomSmasher and Knowledge Engine frontier.",
  },
  {
    id: "software_agents_eval",
    query: "\"software engineering agents\" OR \"coding agents\" OR \"agent benchmark\"",
    source_family: "arxiv",
    tier: "T0_RESEARCH",
    reason: "Agent evals decide which Orangebox features should graduate.",
  },
];

const PUBMED_QUERIES = [
  {
    id: "biomedical_agentic_ai",
    query: "((agentic AI[Title/Abstract]) OR (agentic artificial intelligence[Title/Abstract]) OR (LLM agent*[Title/Abstract]) OR (large language model agent*[Title/Abstract]) OR (artificial intelligence agent*[Title/Abstract])) AND (biomedical OR bioinformatics OR healthcare OR clinical OR genomics)",
    source_family: "nih_pubmed",
    tier: "T0_BIOMED_RESEARCH",
    reason: "Biomedical agent work stress-tests assurance, provenance, tool reliability, and multi-agent scientific workflows.",
  },
];

const REDDIT_TARGETS = [
  {
    id: "reddit_ai_agents_memory",
    tier: "T3_WEAK_SOCIAL",
    source_family: "reddit",
    url: "https://www.reddit.com/r/AI_Agents/search.rss?q=agent%20memory%20context%20engineering&restrict_sr=1&sort=new&t=month",
    reason: "Weak-signal pain around memory drift, context junk, and retrieval failures.",
  },
  {
    id: "reddit_localllama_agents",
    tier: "T3_WEAK_SOCIAL",
    source_family: "reddit",
    url: "https://www.reddit.com/r/LocalLLaMA/search.rss?q=agent%20memory%20benchmark&restrict_sr=1&sort=new&t=month",
    reason: "Weak-signal local model and benchmark pain useful for Codexa/AI Box setup priorities.",
  },
  {
    id: "reddit_local_agents_learn_over_time",
    tier: "T3_WEAK_SOCIAL",
    source_family: "reddit",
    url: "https://www.reddit.com/r/LocalLLaMA/search.rss?q=agents%20learn%20over%20time%20memory&restrict_sr=1&sort=new&t=month",
    reason: "Weak-signal reports on whether local agents actually improve or only retrieve stale memory.",
  },
  {
    id: "reddit_local_agent_setup_2026",
    tier: "T3_WEAK_SOCIAL",
    source_family: "reddit",
    url: "https://www.reddit.com/r/LocalLLaMA/search.rss?q=local%20agent%20setup%202026%20ollama%20vllm&restrict_sr=1&sort=new&t=month",
    reason: "Weak-signal practical local inference patterns for Codexa model/router installation priorities.",
  },
];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function compact(text, max = 520) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}...[truncated]` : cleaned;
}

function stripTags(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchText(url, { allowFailure = true } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/json, application/atom+xml, application/xml, text/html, text/plain;q=0.8",
      },
    });
    const raw = await response.text();
    const body = raw.length > BODY_LIMIT ? raw.slice(0, BODY_LIMIT) : raw;
    return {
      ok: response.ok,
      status: response.status,
      url,
      content_type: response.headers.get("content-type") || null,
      truncated: raw.length > BODY_LIMIT,
      body,
    };
  } catch (error) {
    if (!allowFailure) throw error;
    return { ok: false, status: 0, url, error: error?.message || String(error), body: "" };
  } finally {
    clearTimeout(timer);
  }
}

function titleFromHtml(html, fallback) {
  const title = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return compact(stripTags(title || fallback || "untitled"), 160);
}

function scoreText(text, extra = 0) {
  const haystack = String(text || "").toLowerCase();
  const hits = ORANGEBOX_TERMS.filter((term) => haystack.includes(term.toLowerCase()));
  return {
    score: Math.min(100, extra + hits.length * 6),
    hits,
  };
}

function mapCandidate(text, sourceFamily) {
  const haystack = String(text || "").toLowerCase();
  if (/biomedical|nih|assurance|health|clinical|bioinformatics|scientific|research lifecycle/.test(haystack)) {
    return {
      area: "assurance_lab",
      proposed_action: "Adapt NIH-style assurance lab patterns into Orangebox: playbooks, benchmark methods, validation receipts, and real-world-use-case gates.",
    };
  }
  if (/mcp|tool search|tool output|tool limit|resources|prompt injection/.test(haystack)) {
    return {
      area: "mcp_quarantine_gateway",
      proposed_action: "Update MCP quarantine/test fixtures for scope, output limits, tool search, resources, and prompt-injection handling.",
    };
  }
  if (/sandbox|filesystem isolation|network isolation|credential|exfiltrat|permission/.test(haystack)) {
    return {
      area: "sandbox_and_permission_law",
      proposed_action: "Translate sandbox findings into Orangebox path/network policy fixtures for MCP servers, Codexa rails, and installer checks.",
    };
  }
  if (/brain|hands|session|durable|event log|harness|wake|time-to-first-token|ttft/.test(haystack)) {
    return {
      area: "doer_watcher_session_spine",
      proposed_action: "Model Orangebox as durable session log + replaceable harness + remote hands; add checks for resumability and tool-rail failure recovery.",
    };
  }
  if (/skill|skills|procedural|rules|experience compression|compression spectrum/.test(haystack)) {
    return {
      area: "skill_lifecycle_compression",
      proposed_action: "Score Orangebox skills as compressed procedures: promote only if they reduce repeated work and pass stale-skill/vendor gates.",
    };
  }
  if (/memory|context|compression|retrieval|implicit|drift|longmemeval|compaction/.test(haystack)) {
    return {
      area: "knowledge_engine_atomsmasher",
      proposed_action: "Add or refresh memory-control evals: compaction-boundary tests, implicit-context probes, and retrieval-noise checks.",
    };
  }
  if (/benchmark|eval|score|agentic process|reproducibility/.test(haystack)) {
    return {
      area: "checkmate_eval_lane",
      proposed_action: "Convert this into a CHECKMATE eval candidate before changing prompts, models, or routing.",
    };
  }
  if (/reddit/.test(sourceFamily)) {
    return {
      area: "weak_signal_backlog",
      proposed_action: "Keep as weak social signal until corroborated by docs, research, or Orangebox receipts.",
    };
  }
  return {
    area: "general_research_candidate",
    proposed_action: "Park as a research candidate; require source corroboration and a task contract before promotion.",
  };
}

function itemFromSource({ id, tier, source_family, url, reason, title, summary, published_at = null }) {
  const scoring = scoreText(`${title} ${summary} ${reason}`, tier.startsWith("T0") ? 20 : 0);
  const mapped = mapCandidate(`${title} ${summary} ${reason}`, source_family);
  return {
    id: `research_${hashText(`${id}:${url}:${title}`).slice(0, 16)}`,
    source_id: id,
    tier,
    source_family,
    url,
    title: compact(title, 180),
    summary: compact(summary, 700),
    published_at,
    orangebox_score: scoring.score,
    orangebox_terms: scoring.hits,
    area: mapped.area,
    proposed_action: mapped.proposed_action,
    reason: compact(reason, 360),
    promotion_gate: {
      required: true,
      required_evidence: [
        "source URL and date",
        "Orangebox scope fit",
        "task contract",
        "doctor/proof receipt",
        "rollback path",
        "operator approval",
      ],
    },
  };
}

async function collectStaticTargets() {
  const items = [];
  const fetches = [];
  for (const target of SOURCE_TARGETS) {
    const fetched = await fetchText(target.url);
    fetches.push({ id: target.id, ok: fetched.ok, status: fetched.status, url: target.url, error: fetched.error || null });
    if (!fetched.ok) continue;
    const title = titleFromHtml(fetched.body, target.id);
    const text = compact(stripTags(fetched.body), 900);
    items.push(itemFromSource({ ...target, title, summary: text }));
  }
  return { items, fetches };
}

function arxivUrl(query) {
  const params = new URLSearchParams({
    search_query: query,
    start: "0",
    max_results: "8",
    sortBy: "submittedDate",
    sortOrder: "descending",
  });
  return `https://export.arxiv.org/api/query?${params}`;
}

function parseArxivEntries(xml) {
  return [...String(xml || "").matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1];
    const text = (tag) => stripTags(entry.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"))?.[1] || "");
    const id = text("id");
    return {
      url: id,
      title: compact(text("title"), 180),
      summary: compact(text("summary"), 900),
      published_at: compact(text("published"), 80),
    };
  });
}

function parseFeedEntries(xml, max = 8) {
  const text = String(xml || "");
  const atom = [...text.matchAll(/<entry[\s\S]*?>([\s\S]*?)<\/entry>/g)].map((match) => {
    const entry = match[1];
    const tag = (name) => stripTags(entry.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
    const href = entry.match(/<link[^>]+href="([^"]+)"/i)?.[1] || tag("id");
    return {
      url: href,
      title: compact(tag("title"), 180),
      summary: compact(tag("summary") || tag("content"), 900),
      published_at: compact(tag("updated") || tag("published"), 80),
    };
  });
  if (atom.length) return atom.slice(0, max);
  return [...text.matchAll(/<item[\s\S]*?>([\s\S]*?)<\/item>/g)].slice(0, max).map((match) => {
    const item = match[1];
    const tag = (name) => stripTags(item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"))?.[1] || "");
    return {
      url: tag("link"),
      title: compact(tag("title"), 180),
      summary: compact(tag("description"), 900),
      published_at: compact(tag("pubDate"), 80),
    };
  });
}

async function collectArxiv() {
  const items = [];
  const fetches = [];
  for (const query of ARXIV_QUERIES) {
    const url = arxivUrl(query.query);
    const fetched = await fetchText(url);
    fetches.push({ id: query.id, ok: fetched.ok, status: fetched.status, url, error: fetched.error || null });
    if (!fetched.ok) continue;
    for (const entry of parseArxivEntries(fetched.body)) {
      if (!entry.url || !entry.title) continue;
      items.push(itemFromSource({ ...query, url: entry.url, title: entry.title, summary: entry.summary, published_at: entry.published_at }));
    }
  }
  return { items, fetches };
}

function pubmedSearchUrl(query) {
  const params = new URLSearchParams({
    db: "pubmed",
    term: query,
    retmode: "json",
    datetype: "pdat",
    reldate: "365",
    retmax: "8",
    sort: "pub+date",
  });
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?${params}`;
}

function pubmedSummaryUrl(ids) {
  const params = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "json",
  });
  return `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?${params}`;
}

async function collectPubMed() {
  const items = [];
  const fetches = [];
  for (const query of PUBMED_QUERIES) {
    const searchUrl = pubmedSearchUrl(query.query);
    const searched = await fetchText(searchUrl);
    fetches.push({ id: `${query.id}_search`, ok: searched.ok, status: searched.status, url: searchUrl, error: searched.error || null });
    if (!searched.ok) continue;
    let ids = [];
    try {
      ids = JSON.parse(searched.body)?.esearchresult?.idlist || [];
    } catch {}
    if (!ids.length) continue;
    const summaryUrl = pubmedSummaryUrl(ids);
    const summarized = await fetchText(summaryUrl);
    fetches.push({ id: `${query.id}_summary`, ok: summarized.ok, status: summarized.status, url: summaryUrl, error: summarized.error || null });
    if (!summarized.ok) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(summarized.body);
    } catch {}
    const result = parsed?.result || {};
    for (const id of result.uids || []) {
      const row = result[id];
      if (!row) continue;
      const title = row.title || `PubMed ${id}`;
      if (!/(agentic|large language model|llm|artificial intelligence|ai agent|multiagent|multi-agent)/i.test(title)) continue;
      const journal = row.fulljournalname || row.source || "PubMed";
      const summary = `${journal}. ${row.pubdate || ""}. ${Array.isArray(row.authors) ? row.authors.slice(0, 5).map((a) => a.name).join(", ") : ""}`;
      items.push(itemFromSource({
        ...query,
        url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        title,
        summary,
        published_at: row.pubdate || null,
      }));
    }
  }
  return { items, fetches };
}

async function collectReddit() {
  const items = [];
  const fetches = [];
  for (const target of REDDIT_TARGETS) {
    const fetched = await fetchText(target.url);
    fetches.push({ id: target.id, ok: fetched.ok, status: fetched.status, url: target.url, error: fetched.error || null });
    if (!fetched.ok) continue;
    let parsed = null;
    try {
      parsed = JSON.parse(fetched.body);
    } catch {}
    const children = parsed?.data?.children || [];
    if (children.length) {
      for (const child of children) {
        const data = child.data || {};
        const url = data.url_overridden_by_dest || `https://www.reddit.com${data.permalink || ""}`;
        items.push(itemFromSource({
          ...target,
          url,
          title: data.title || "Reddit weak signal",
          summary: compact(data.selftext || data.title || "", 700),
          published_at: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : null,
        }));
      }
      continue;
    }
    for (const entry of parseFeedEntries(fetched.body, 8)) {
      if (!entry.title) continue;
      items.push(itemFromSource({
        ...target,
        url: entry.url,
        title: entry.title,
        summary: entry.summary,
        published_at: entry.published_at,
      }));
    }
  }
  return { items, fetches };
}

function dedupeItems(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.url}|${item.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out.sort((a, b) => b.orangebox_score - a.orangebox_score || a.tier.localeCompare(b.tier));
}

async function main() {
  const startedAt = new Date().toISOString();
  const collections = [];
  collections.push(await collectStaticTargets());
  collections.push(await collectArxiv());
  collections.push(await collectPubMed());
  collections.push(await collectReddit());

  const fetches = collections.flatMap((collection) => collection.fetches);
  const items = dedupeItems(collections.flatMap((collection) => collection.items));
  const candidates = items.filter((item) => item.orangebox_score >= 30).slice(0, 24);
  const primaryCandidateCount = candidates.filter((item) => item.tier.startsWith("T0")).length;
  const fetchOkCount = fetches.filter((fetch) => fetch.ok).length;
  const status = candidates.length && primaryCandidateCount
    ? "EXTERNAL_RESEARCH_SCOUT_READY"
    : fetchOkCount
      ? "EXTERNAL_RESEARCH_SCOUT_DEGRADED"
      : "EXTERNAL_RESEARCH_SCOUT_OFFLINE";

  const result = {
    ok: status !== "EXTERNAL_RESEARCH_SCOUT_OFFLINE",
    version: "orangebox-external-research-scout/v1",
    status,
    started_at: startedAt,
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Scout public signals. Tier evidence. Promote nothing without operator approval, proof receipts, and rollback.",
    network_policy: {
      low_bandwidth: true,
      body_limit_bytes: BODY_LIMIT,
      timeout_ms: FETCH_TIMEOUT_MS,
      credentials_used: false,
      paid_model_calls: false,
      private_scraping: false,
      social_signal_is_weak: true,
    },
    source_targets: {
      static_public_pages: SOURCE_TARGETS.length,
      arxiv_queries: ARXIV_QUERIES.length,
      pubmed_queries: PUBMED_QUERIES.length,
      reddit_targets: REDDIT_TARGETS.length,
    },
    fetches,
    candidate_count: candidates.length,
    primary_candidate_count: primaryCandidateCount,
    candidates,
    top_actions: [...new Map(candidates.map((item) => [item.area, item.proposed_action])).entries()]
      .map(([area, proposed_action]) => ({ area, proposed_action }))
      .slice(0, 10),
    not_autonomous: true,
  };

  const latestPath = path.join(outRoot, "latest-external-research-scout.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-external-research-scout-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }
  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (status === "EXTERNAL_RESEARCH_SCOUT_OFFLINE") process.exitCode = 1;
}

await main();
