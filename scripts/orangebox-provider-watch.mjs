#!/usr/bin/env node
/* ============================================================================
   ORANGEBOX Provider Watch

   Source-backed awareness lane for AI provider announcements.

   This is not autonomous fine-tuning and does not silently rewrite system
   behavior. It stores compact deltas, links to canonical sources, emits a
   receipt, and refreshes the ORANGEBOX knowledge lattice.
   ============================================================================ */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function arg(flag, fallback = null) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const ORANGE_ROOT = path.resolve(
  process.env.ORANGEBOX_DATA_ROOT
    || process.env.ORANGEBOX_ROOT
    || arg("--root")
    || path.join(os.homedir(), "OrangeBox-Data")
);
const LIMIT = Number(arg("--limit", 30));
const REBUILD = !hasFlag("--no-rebuild");
const EMIT_PARTY_LINE = hasFlag("--party-line");

const SOURCES = [
  {
    id: "openai-news-rss",
    provider: "OpenAI",
    type: "rss",
    url: "https://openai.com/news/rss.xml",
    trust: "official",
    note: "OpenAI News RSS.",
  },
  {
    id: "openai-api-changelog",
    provider: "OpenAI",
    type: "htmlDigest",
    url: "https://developers.openai.com/api/docs/changelog",
    trust: "official",
    note: "OpenAI API docs changelog page.",
  },
  {
    id: "openai-codex-changelog",
    provider: "OpenAI",
    type: "htmlDigest",
    url: "https://developers.openai.com/codex/changelog",
    trust: "official",
    note: "OpenAI Codex changelog page.",
  },
  {
    id: "anthropic-platform-release-notes",
    provider: "Anthropic",
    type: "htmlDigest",
    url: "https://platform.claude.com/docs/en/release-notes/overview",
    trust: "official",
    note: "Anthropic Claude Platform release notes.",
  },
  {
    id: "anthropic-claude-code-releases",
    provider: "Anthropic",
    type: "atom",
    url: "https://github.com/anthropics/claude-code/releases.atom",
    trust: "official-github-org",
    note: "Official anthropics/claude-code GitHub releases Atom feed.",
  },
];

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function slug(value) {
  return String(value || "untitled")
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "untitled";
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function stripHtml(value) {
  return decodeEntities(decodeEntities(String(value || ""))
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function tagText(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? stripHtml(m[1]) : "";
}

function tagRaw(block, tag) {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return m ? decodeEntities(m[1]).trim() : "";
}

function atomLink(block) {
  const links = [...block.matchAll(/<link\b([^>]*)>/gi)];
  for (const match of links) {
    const attrs = match[1] || "";
    const rel = attrs.match(/\brel=["']([^"']+)["']/i)?.[1] || "alternate";
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (href && rel === "alternate") return decodeEntities(href);
  }
  return links[0]?.[1]?.match(/\bhref=["']([^"']+)["']/i)?.[1] || "";
}

function parseRss(xml, source) {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].slice(0, LIMIT).map((m) => {
    const block = m[0];
    const title = tagText(block, "title") || "(untitled)";
    const link = tagText(block, "link");
    const published = tagText(block, "pubDate") || tagText(block, "dc:date");
    const summary = stripHtml(tagRaw(block, "description") || tagRaw(block, "content:encoded")).slice(0, 2200);
    const guid = tagText(block, "guid") || link || title;
    return normalizeItem(source, { title, link, published, summary, id: guid, rawHash: hash(block) });
  });
}

function parseAtom(xml, source) {
  return [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].slice(0, LIMIT).map((m) => {
    const block = m[0];
    const title = tagText(block, "title") || "(untitled)";
    const link = atomLink(block);
    const published = tagText(block, "published") || tagText(block, "updated");
    const summary = stripHtml(tagRaw(block, "summary") || tagRaw(block, "content")).slice(0, 2200);
    const id = tagText(block, "id") || link || title;
    return normalizeItem(source, { title, link, published, summary, id, rawHash: hash(block) });
  });
}

function classify(text) {
  const hay = String(text || "").toLowerCase();
  const tags = [];
  const rules = [
    ["model", /\b(gpt|claude|sonnet|opus|haiku|model|snapshot)\b/],
    ["agent", /\b(agent|agents|codex|claude code|computer use|background|workflow)\b/],
    ["api", /\b(api|responses|messages|sdk|endpoint|webhook|tool call|schema)\b/],
    ["tooling", /\b(tool|mcp|connector|code execution|sandbox|retrieval|file search)\b/],
    ["context-memory", /\b(context|memory|cache|caching|compaction|long context|token)\b/],
    ["creative-media", /\b(image|video|audio|voice|realtime|sora|music)\b/],
    ["training-eval", /\b(fine-tun|reinforcement|rft|eval|grader|optimization)\b/],
    ["cost-limits", /\b(price|pricing|cost|rate limit|quota|batch|flex)\b/],
    ["safety-policy", /\b(safety|policy|guardrail|abuse|security|risk|deprecat)\b/],
  ];
  for (const [tag, rx] of rules) if (rx.test(hay)) tags.push(tag);
  return tags.length ? tags : ["provider-update"];
}

function normalizeItem(source, item) {
  const title = item.title || "(untitled)";
  const body = `${title}\n${item.summary || ""}`;
  const id = item.id || item.link || `${source.id}:${title}:${item.published || ""}`;
  return {
    schema: "orangebox-provider-watch-delta/v1",
    source_id: source.id,
    provider: source.provider,
    trust: source.trust,
    source_type: source.type,
    source_url: source.url,
    title,
    url: item.link || source.url,
    published: item.published || null,
    detected_at: iso(),
    summary: item.summary || "",
    tags: classify(body),
    item_id: id,
    hash: hash(`${source.id}\n${id}\n${title}\n${item.summary || ""}\n${item.rawHash || ""}`),
  };
}

function htmlDigestItem(html, source) {
  const text = stripHtml(html).replace(/\s+/g, " ").trim();
  const lines = text
    .split(/(?=(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}|Claude|GPT|Codex|API)\b)/)
    .map((x) => x.trim())
    .filter(Boolean);
  const excerpt = (lines.slice(0, 12).join("\n\n") || text).slice(0, 5000);
  return normalizeItem(source, {
    title: `${source.provider} source digest changed: ${source.note}`,
    link: source.url,
    published: null,
    summary: excerpt,
    id: `${source.id}:${hash(text)}`,
    rawHash: hash(text),
  });
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "ORANGEBOX-Provider-Watch/1.0 (+local source-backed knowledge)",
      "Accept": "application/rss+xml, application/atom+xml, text/html, application/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeDeltaMarkdown(item, outDir) {
  const date = (item.published ? new Date(item.published) : new Date());
  const day = Number.isNaN(date.getTime()) ? iso().slice(0, 10) : date.toISOString().slice(0, 10);
  const file = path.join(outDir, `${day}_${slug(item.provider)}_${slug(item.title)}_${item.hash.slice(0, 10)}.md`);
  const md = [
    `# ${item.title}`,
    "",
    "Kind: Provider Watch Delta",
    `Source: [${item.provider} - ${item.source_id}](${item.url})`,
    `Canonical feed/page: [${item.source_url}](${item.source_url})`,
    `Trust: ${item.trust}`,
    `Published: ${item.published || "unknown"}`,
    `Detected: ${item.detected_at}`,
    `Hash: ${item.hash}`,
    "",
    "## Title",
    item.title,
    "",
    "## Compact Source Excerpt",
    item.summary || "(no excerpt supplied by feed)",
    "",
    "## ORANGEBOX Impact Tags",
    ...item.tags.map((tag) => `- ${tag}`),
    "",
    "## Activation Policy",
    "- Use as source-backed retrieval context immediately after Knowledge v2 rebuild.",
    "- Do not silently change model lanes, provider settings, cost policy, security posture, or system prompts.",
    "- Promote behavior changes only through a candidate patch, receipt, rollback path, and verification run.",
  ].join("\n");
  await fs.writeFile(file, md + "\n", "utf8");
  return file;
}

async function appendJsonl(file, rows) {
  if (!rows.length) return;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, rows.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
}

async function rebuildKnowledge() {
  const script = path.join(APP_ROOT, "scripts", "orangebox-knowledge-v2.mjs");
  try {
    const { stdout, stderr } = await execFileAsync("node", [script, "--root", ORANGE_ROOT], { timeout: 180000 });
    return {
      status: "VERIFIED",
      stdout_tail: String(stdout || "").slice(-1600),
      stderr_tail: String(stderr || "").slice(-800),
    };
  } catch (e) {
    return { status: "FAILED", error: String(e?.message || e), stdout_tail: String(e?.stdout || "").slice(-1600), stderr_tail: String(e?.stderr || "").slice(-800) };
  }
}

async function emitPartyLine(summary, receiptPath) {
  const dir = path.join(ORANGE_ROOT, "party-line", "orangebox");
  await fs.mkdir(dir, { recursive: true });
  const entry = {
    ts: iso(),
    project: "orangebox",
    from: "provider-watch",
    to: "operator",
    status: "info",
    message: summary,
    receipt: receiptPath,
    confidence: "high",
  };
  await fs.appendFile(path.join(dir, "messages.jsonl"), JSON.stringify(entry) + "\n", "utf8");
}

async function main() {
  const statePath = path.join(ORANGE_ROOT, "memory", "provider-watch", "state.json");
  const outDir = path.join(ORANGE_ROOT, "knowledge", "provider-watch");
  const rawPath = path.join(outDir, "provider-watch-deltas.jsonl");
  const receiptDir = path.join(ORANGE_ROOT, "receipts");
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(receiptDir, { recursive: true });

  const state = await readJson(statePath, { schema: "orangebox-provider-watch-state/v1", seen_hashes: {}, source_hashes: {}, updated_at: null });
  const newItems = [];
  const sourceResults = [];

  for (const source of SOURCES) {
    try {
      const text = await fetchText(source.url);
      const sourceHash = hash(text);
      let items = [];
      if (source.type === "rss") items = parseRss(text, source);
      else if (source.type === "atom") items = parseAtom(text, source);
      else if (state.source_hashes[source.id] !== sourceHash) items = [htmlDigestItem(text, source)];

      let accepted = 0;
      for (const item of items) {
        if (state.seen_hashes[item.hash]) continue;
        const file = await writeDeltaMarkdown(item, outDir);
        newItems.push({ ...item, markdown_path: file });
        state.seen_hashes[item.hash] = { first_seen_at: item.detected_at, source_id: source.id, title: item.title, url: item.url };
        accepted += 1;
      }
      state.source_hashes[source.id] = sourceHash;
      sourceResults.push({ source_id: source.id, provider: source.provider, status: "VERIFIED", type: source.type, items_seen: items.length, new_items: accepted });
    } catch (e) {
      sourceResults.push({ source_id: source.id, provider: source.provider, status: "FAILED", error: String(e?.message || e) });
    }
  }

  state.updated_at = iso();
  await fs.writeFile(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  await appendJsonl(rawPath, newItems);

  const knowledge = REBUILD ? await rebuildKnowledge() : { status: "SKIPPED", reason: "--no-rebuild" };
  const receipt = {
    status: sourceResults.some((r) => r.status === "FAILED") ? "PARTIAL" : "VERIFIED",
    kind: "provider-watch",
    generated_at: iso(),
    root: ORANGE_ROOT,
    policy: {
      mode: "source-backed awareness and retrieval",
      auto_fine_tune: false,
      autonomous_behavior_mutation: false,
      promotion_gate: "candidate patch + receipt + verification + rollback",
    },
    sources: sourceResults,
    new_items: newItems.length,
    outputs: {
      state: statePath,
      markdown_dir: outDir,
      raw_jsonl: rawPath,
    },
    knowledge_rebuild: knowledge,
  };
  const receiptPath = path.join(receiptDir, `provider-watch-${stamp()}.json`);
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");

  if (EMIT_PARTY_LINE) {
    await emitPartyLine(`Provider Watch: ${newItems.length} new provider deltas. Knowledge: ${knowledge.status}.`, receiptPath);
  }

  console.log(JSON.stringify({ status: receipt.status, new_items: newItems.length, receipt: receiptPath, knowledge: knowledge.status, sources: sourceResults }, null, 2));
}

main().catch((e) => {
  console.error("[provider-watch] FATAL", e);
  process.exit(1);
});
