#!/usr/bin/env node
/* alpha-bookmark-intake.mjs - no-browse Alpha intake doctor for X bookmark exports.
 *
 * Reads a local X bookmarks export, scores every bookmark, writes a data-root
 * source-verification queue for high-confidence leads, and optionally emits a
 * repo receipt. This is intentionally no-network and no-model by default.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALPHA_BOOKMARK_INTAKE_VERSION = "orangebox-alpha-bookmark-intake/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

const CATEGORY_RULES = [
  {
    id: "knowledge-memory",
    label: "Knowledge and memory",
    weight: 20,
    terms: ["cocoindex", "memory", "memfactory", "delta-mem", "δ-mem", "knowledge base", "obsidian", "semantic code search", "context", "wiki", "stale data", "scratchpad"],
  },
  {
    id: "agent-execution-security",
    label: "Agent execution and security",
    weight: 20,
    terms: ["sandbox", "mcp tunnel", "managed agents", "command rail", "hermes", "agent", "agents", "skills", "stainless", "api is the ui", "headless"],
  },
  {
    id: "bench-evals-proof",
    label: "Benchmarks and proof",
    weight: 18,
    terms: ["benchmark", "bench", "eval", "yc-bench", "nanogpt", "world record", "human progress", "performance summary", "record", "score"],
  },
  {
    id: "models-compute-infra",
    label: "Models, compute, and infra",
    weight: 14,
    terms: ["gpu", "kv", "cache", "self-pruning", "subq", "context window", "gemma", "open-weight", "supercomputer", "architecture", "sparse", "inference", "local open", "model", "sglang", "vllm", "radixattention", "prefix caching", "speculative decoding", "multi-token prediction", "mtp", "eagle"],
  },
  {
    id: "frontier-routing-subscriptions",
    label: "Frontier routing and subscriptions",
    weight: 14,
    terms: ["claude", "codex", "cursor", "gemini", "antigravity", "grok", "subscription", "composer", "opus", "google", "openai", "anthropic", "xai"],
  },
  {
    id: "ux-visual-interaction",
    label: "UX, visual, and interaction",
    weight: 8,
    terms: ["interface", "touchdesigner", "voice", "hand", "visual", "browser", "ui", "patterns", "artifact", "frontend"],
  },
  {
    id: "science-bio-alpha",
    label: "Science and bio alpha",
    weight: 7,
    terms: ["dna", "carbon", "polaritons", "bioelectric", "light code", "neurotransmitter", "cancer", "aging", "coconut", "protein"],
  },
  {
    id: "market-compliance",
    label: "Market and compliance",
    weight: 6,
    terms: ["startup", "compliance", "eu ai act", "salesforce", "github repos", "bot detection", "tokens", "ci"],
  },
];

const OFFICIAL_OR_HIGH_SIGNAL_HANDLES = new Set([
  "AnthropicAI",
  "ClaudeDevs",
  "OpenAIDevs",
  "Google",
  "xai",
  "ClementDelangue",
  "PrimeIntellect",
  "GoodfireAI",
  "cocoindex_io",
  "intology",
  "Teknium",
]);

const BAIT_TERMS = [
  "bookmark this",
  "course",
  "masterclass",
  "tonight",
  "nobody talks about",
  "will change the way",
  "thread",
];

const STRATEGIC_CATEGORIES = new Set([
  "knowledge-memory",
  "agent-execution-security",
  "bench-evals-proof",
  "models-compute-infra",
  "frontier-routing-subscriptions",
]);

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Text(value) {
  return sha256(Buffer.from(String(value || ""), "utf8"));
}

function compact(value, max = 320) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

function argValue(argv, name) {
  const prefix = `${name}=`;
  const exact = argv.indexOf(name);
  if (exact !== -1) return argv[exact + 1] || null;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}

async function findDefaultExport() {
  const downloads = path.join(os.homedir(), "Downloads");
  if (!fsSync.existsSync(downloads)) return null;
  const entries = await fs.readdir(downloads, { withFileTypes: true }).catch(() => []);
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!/^x-bkmarks-.*\.json$/i.test(entry.name)) continue;
    const file = path.join(downloads, entry.name);
    const stat = await fs.stat(file);
    candidates.push({ file, mtime: stat.mtimeMs });
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.file || null;
}

function normalizeDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function expandedLinks(bookmark) {
  const links = [];
  for (const link of bookmark.links || []) {
    if (link.expandedUrl) links.push({ url: link.expandedUrl, kind: "expanded_link", short_url: link.shortUrl || null });
  }
  for (const link of bookmark.quote_status?.links || []) {
    if (link.expandedUrl) links.push({ url: link.expandedUrl, kind: "quote_expanded_link", short_url: link.shortUrl || null });
  }
  const seen = new Set();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function sourceTargets(bookmark) {
  const targets = expandedLinks(bookmark).map((link) => ({
    kind: link.kind,
    url: link.url,
    domain: normalizeDomain(link.url),
  }));
  if (bookmark.url) {
    targets.push({
      kind: "x_post",
      url: bookmark.url,
      domain: normalizeDomain(bookmark.url),
    });
  }
  if (bookmark.quote_status?.url) {
    targets.push({
      kind: "quote_x_post",
      url: bookmark.quote_status.url,
      domain: normalizeDomain(bookmark.quote_status.url),
    });
  }
  const seen = new Set();
  return targets.filter((target) => {
    if (!target.url || seen.has(target.url)) return false;
    seen.add(target.url);
    return true;
  });
}

function combinedText(bookmark) {
  return [
    bookmark.text,
    bookmark.user?.handle,
    bookmark.user?.name,
    bookmark.quote_status?.text,
    bookmark.quote_status?.user?.handle,
    ...expandedLinks(bookmark).map((link) => link.url),
  ].filter(Boolean).join(" ");
}

function categoryHits(bookmark) {
  const text = combinedText(bookmark).toLowerCase();
  return CATEGORY_RULES.map((rule) => {
    const hits = rule.terms.filter((term) => text.includes(term.toLowerCase()));
    return hits.length ? { id: rule.id, label: rule.label, weight: rule.weight, hits } : null;
  }).filter(Boolean);
}

function evidenceScore(bookmark) {
  const links = expandedLinks(bookmark);
  const targets = sourceTargets(bookmark);
  const domains = new Set(targets.map((target) => target.domain).filter(Boolean));
  let score = 0;
  const reasons = [];

  if (links.length > 0) {
    score += Math.min(14, 8 + links.length * 2);
    reasons.push("expanded links present");
  }
  const primaryDomains = ["github.com", "anthropic.com", "openai.com", "google.com", "developers.google.com", "x.ai", "intology.ai", "huggingface.co"];
  const matchedDomains = [...domains].filter((domain) => primaryDomains.some((primary) => domain === primary || domain.endsWith(`.${primary}`)));
  if (matchedDomains.length) {
    score += Math.min(14, matchedDomains.length * 7);
    reasons.push(`primary/high-signal domains: ${matchedDomains.join(", ")}`);
  }
  const handle = bookmark.user?.handle || "";
  if (OFFICIAL_OR_HIGH_SIGNAL_HANDLES.has(handle)) {
    score += 8;
    reasons.push(`high-signal handle: ${handle}`);
  }
  if (bookmark.quote_status?.user?.handle && OFFICIAL_OR_HIGH_SIGNAL_HANDLES.has(bookmark.quote_status.user.handle)) {
    score += 5;
    reasons.push(`high-signal quoted handle: ${bookmark.quote_status.user.handle}`);
  }
  const textLength = String(bookmark.text || "").length;
  if (textLength > 1500) {
    score += 6;
    reasons.push("long-form source text");
  } else if (textLength > 700) {
    score += 4;
    reasons.push("substantial source text");
  }
  if ((bookmark.media || []).length > 0) {
    score += 2;
    reasons.push("media evidence present");
  }
  return { score, reasons };
}

function penaltyScore(bookmark) {
  const text = combinedText(bookmark).toLowerCase();
  let penalty = 0;
  const reasons = [];
  if ((bookmark.user?.handle || "") === "AtomMccree") {
    penalty += 6;
    reasons.push("self-authored item needs outside verification");
  }
  if (BAIT_TERMS.some((term) => text.includes(term))) {
    penalty += 8;
    reasons.push("course/thread-style engagement bait language");
  }
  if (/polaritons|light code|coconut|coherence theory|living light/i.test(text) && expandedLinks(bookmark).length === 0) {
    penalty += 8;
    reasons.push("speculative science claim without expanded source link");
  }
  if (/^https:\/\/t\.co\//i.test(String(bookmark.text || "").trim()) && expandedLinks(bookmark).length === 0) {
    penalty += 10;
    reasons.push("bare unresolved short link");
  }
  return { penalty, reasons };
}

function scoreBookmark(bookmark, index) {
  const categories = categoryHits(bookmark);
  const categoryScore = Math.min(72, categories.reduce((sum, category) => sum + category.weight, 0));
  const evidence = evidenceScore(bookmark);
  const penalty = penaltyScore(bookmark);
  const strategic = categories.some((category) => STRATEGIC_CATEGORIES.has(category.id));
  const score = Math.max(0, Math.min(100, categoryScore + evidence.score - penalty.penalty));
  const alphaGrade = score >= 58 && strategic
    ? "high"
    : score >= 38 && categories.length > 0
      ? "medium"
      : "watch";

  return {
    n: index + 1,
    id: String(bookmark.id || ""),
    date: bookmark.date || null,
    handle: bookmark.user?.handle || null,
    name: bookmark.user?.name || null,
    url: bookmark.url || null,
    alpha_grade: alphaGrade,
    alpha_score: score,
    categories: categories.map((category) => ({
      id: category.id,
      label: category.label,
      hits: category.hits,
    })),
    evidence_reasons: evidence.reasons,
    penalty_reasons: penalty.reasons,
    source_targets: sourceTargets(bookmark),
    summary: compact(bookmark.text, 420),
    quote: bookmark.quote_status ? {
      id: bookmark.quote_status.id || null,
      handle: bookmark.quote_status.user?.handle || null,
      url: bookmark.quote_status.url || null,
      summary: compact(bookmark.quote_status.text, 220),
    } : null,
  };
}

function countBy(items, keyFn) {
  const out = {};
  for (const item of items) {
    const key = keyFn(item);
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function categoryCounts(items) {
  const out = {};
  for (const item of items) {
    for (const category of item.categories) out[category.id] = (out[category.id] || 0) + 1;
  }
  return out;
}

function topHandles(items, limit = 20) {
  return Object.entries(countBy(items, (item) => item.handle || "unknown"))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([handle, count]) => ({ handle, count }));
}

function buildVerificationQueue(scoredItems) {
  return scoredItems
    .filter((item) => item.alpha_grade === "high")
    .map((item) => ({
      queue_id: `alpha-${item.id || item.n}`,
      status: "QUEUED",
      priority: item.alpha_score >= 80 ? "P0" : item.alpha_score >= 68 ? "P1" : "P2",
      source: "x-bookmark-export",
      bookmark_id: item.id,
      handle: item.handle,
      date: item.date,
      alpha_score: item.alpha_score,
      categories: item.categories.map((category) => category.id),
      summary: item.summary,
      source_targets: item.source_targets,
      verification_contract: [
        "Resolve expanded links and X post context.",
        "Prefer primary docs, papers, repositories, official posts, or benchmark pages.",
        "Do not promote architecture from social claims alone.",
        "Record accept/correct/approval-needed decision in a receipt.",
      ],
    }))
    .sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority] || b.alpha_score - a.alpha_score;
    });
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-alpha-bookmark-intake-${stampForFile()}.json`);
  await writeJson(file, { ...result, receipt_path: file });
  return file;
}

export async function runAlphaBookmarkIntake({
  inputPath = null,
  writeReceipt: shouldWriteReceipt = false,
  writeQueue = true,
  dataRootPath = dataRoot(),
} = {}) {
  const startedAt = new Date().toISOString();
  const resolvedInput = inputPath ? path.resolve(inputPath) : await findDefaultExport();
  if (!resolvedInput) throw new Error("No input export found. Pass --input C:\\path\\x-bkmarks-*.json.");
  const raw = await fs.readFile(resolvedInput);
  const fileText = raw.toString("utf8").replace(/^\uFEFF/, "");
  const parsed = JSON.parse(fileText);
  const bookmarks = Array.isArray(parsed.data) ? parsed.data : [];
  const ids = bookmarks.map((item) => String(item.id || "")).filter(Boolean);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const invalidDates = bookmarks
    .map((item, index) => ({ index: index + 1, date: item.date }))
    .filter((item) => Number.isNaN(new Date(item.date).getTime()));
  const declaredCountMismatch = parsed.totalBookmarks !== undefined && Number(parsed.totalBookmarks) !== bookmarks.length;
  const scoredItems = bookmarks.map((bookmark, index) => scoreBookmark(bookmark, index));
  const queue = buildVerificationQueue(scoredItems);
  const alphaRoot = path.join(dataRootPath, "alpha-intake");
  const latestPath = path.join(alphaRoot, "latest-bookmark-intake.json");
  const queuePath = path.join(alphaRoot, "source-verification-queue.json");
  const counts = {
    total: bookmarks.length,
    high: scoredItems.filter((item) => item.alpha_grade === "high").length,
    medium: scoredItems.filter((item) => item.alpha_grade === "medium").length,
    watch: scoredItems.filter((item) => item.alpha_grade === "watch").length,
    queued_for_verification: queue.length,
  };
  const result = {
    ok: bookmarks.length > 0 && duplicateIds.length === 0 && invalidDates.length === 0 && !declaredCountMismatch,
    version: ALPHA_BOOKMARK_INTAKE_VERSION,
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    no_network_calls: true,
    no_model_calls: true,
    input: {
      path: resolvedInput,
      bytes: raw.length,
      sha256: sha256(raw),
      export_date: parsed.exportDate || null,
      owner: parsed.owner ? {
        id: parsed.owner.id || null,
        handle: parsed.owner.handle || null,
        name: parsed.owner.name || null,
      } : null,
      total_bookmarks_declared: parsed.totalBookmarks ?? null,
      total_bookmarks_observed: bookmarks.length,
    },
    summary: {
      ...counts,
      declared_matches_observed: parsed.totalBookmarks === undefined || Number(parsed.totalBookmarks) === bookmarks.length,
      category_counts: categoryCounts(scoredItems),
      top_handles: topHandles(scoredItems),
    },
    validation: {
      duplicate_ids: [...new Set(duplicateIds)],
      invalid_dates: invalidDates,
      declared_count_mismatch: declaredCountMismatch ? {
        declared: Number(parsed.totalBookmarks),
        observed: bookmarks.length,
      } : null,
      failures: [
        ...(bookmarks.length ? [] : [{ id: "no-bookmarks", detail: "Export contains no data rows." }]),
        ...(duplicateIds.length ? [{ id: "duplicate-ids", detail: `${new Set(duplicateIds).size} duplicate IDs observed.` }] : []),
        ...(invalidDates.length ? [{ id: "invalid-dates", detail: `${invalidDates.length} invalid dates observed.` }] : []),
        ...(declaredCountMismatch ? [{ id: "declared-count-mismatch", detail: `Declared ${Number(parsed.totalBookmarks)} bookmarks but observed ${bookmarks.length}.` }] : []),
      ],
    },
    outputs: {
      data_root: dataRootPath,
      latest_intake_path: writeQueue ? latestPath : null,
      source_verification_queue_path: writeQueue ? queuePath : null,
      queue_written: false,
    },
    source_verification_queue: queue,
    scored_items: scoredItems,
    recommendations: [
      "Verify queued high-confidence leads against primary sources before architecture changes.",
      "Promote knowledge/memory, sandbox/rail, and benchmark leads first.",
      "Keep speculative science and engagement-bait threads in watch lanes until independently sourced.",
    ],
    rollback: {
      repo_mutation: shouldWriteReceipt ? "receipt only" : "none",
      data_mutation: writeQueue ? "alpha-intake latest JSON and source-verification queue under data root" : "none",
      recovery_action: writeQueue ? `Delete ${alphaRoot} if this intake is superseded.` : "No data rollback needed.",
    },
    receipt_path: null,
  };

  if (writeQueue) {
    result.outputs.queue_written = true;
    const latest = {
      ...result,
      scored_items: scoredItems,
      source_verification_queue: queue,
    };
    await writeJson(latestPath, latest);
    await writeJson(queuePath, {
      version: "orangebox-alpha-source-verification-queue/v1",
      generated_at: new Date().toISOString(),
      source_intake: {
        input_path: resolvedInput,
        input_sha256: result.input.sha256,
        intake_version: result.version,
      },
      summary: counts,
      queue,
    });
  }
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runAlphaBookmarkIntake({
    inputPath: argValue(argv, "--input"),
    writeReceipt: argv.includes("--receipt"),
    writeQueue: !argv.includes("--no-write-queue"),
    dataRootPath: argValue(argv, "--data-root") || dataRoot(),
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FAIL"} alpha bookmark intake: ${result.summary.total} total, ${result.summary.high} high, ${result.summary.queued_for_verification} queued`);
    if (result.outputs.source_verification_queue_path) console.log(`queue: ${result.outputs.source_verification_queue_path}`);
    if (result.receipt_path) console.log(`receipt: ${result.receipt_path}`);
  }
  if (!result.ok) process.exit(4);
}
