/**
 * ORANGEBOX v4 — GitHub PR Review Agent
 *
 * Doctrine: ATOM-OBX-V4-MOAT-2026-0516
 * Gap plug: P1.6 — GitHub PR review agent (v3.6 milestone)
 * Competitive target: matches / exceeds Codex PR review with:
 *   - full repo file context (not just diff)
 *   - private vault grounding (operator knowledge base)
 *   - inline GitHub comments tied to specific paths + positions
 *   - prompt caching (cache_control: ephemeral) on repo context
 *   - structured receipt on every run
 *   - zero npm deps — pure Node ES module
 *
 * Rules this file lives under:
 *   - Local-first by default. No data leaves the machine unless operator passes --token + --anthropic-key.
 *   - Receipts everywhere. Every run writes a receipt to <data_root>/receipts/pr/.
 *   - Mom's Law applies. Full effort. No theater.
 *
 * Usage:
 *   node github-pr-review.mjs --repo=owner/name --pr=42 [--dry-run] [--help]
 *
 * Env vars honoured (override with CLI flags):
 *   GITHUB_TOKEN         GitHub personal access token (needs repo + pull_requests scope)
 *   ANTHROPIC_API_KEY    Anthropic API key
 *   ORANGEBOX_DATA_ROOT  Where receipts land (default: ~/OrangeBox-Data)
 */

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import crypto from "node:crypto";

// ─── Constants ────────────────────────────────────────────────────────────────

const AGENT_VERSION = "1.0.0";
const RECEIPT_SCHEMA = "orangebox-pr-review-v1";
const MODEL = "claude-sonnet-4-5";          // Sonnet 4.5 per spec
const GITHUB_API = "https://api.github.com";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_BETA = "prompt-caching-2024-07-31";

// Max chars of diff to feed in a single context bundle.
// GitHub diffs can be enormous; we keep the useful head.
const DIFF_CHAR_LIMIT = 120_000;

// Max repo file bytes to include for any single file fetched from Contents API.
const FILE_BYTE_LIMIT = 32_000;

// Max number of changed files for which we attempt to fetch full file content.
const FILE_CONTENT_FETCH_LIMIT = 20;

// Anthropic input-token cost estimate (Sonnet 4.5, cached vs uncached)
const COST_PER_1K_INPUT_UNCACHED = 0.003;   // $0.003 / 1K input tokens
const COST_PER_1K_INPUT_CACHED   = 0.0003;  // $0.0003 / 1K cached read tokens
const COST_PER_1K_OUTPUT         = 0.015;   // $0.015 / 1K output tokens

// ─── CLI parsing ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {};
  for (const raw of argv.slice(2)) {
    if (raw === "--help" || raw === "-h") { args.help = true; continue; }
    if (raw === "--dry-run")              { args.dryRun = true; continue; }
    const m = raw.match(/^--([a-z0-9-]+)(?:=(.*))?$/i);
    if (m) args[m[1]] = m[2] ?? true;
  }
  return args;
}

function printHelp() {
  console.log(`
ORANGEBOX v4 — GitHub PR Review Agent  v${AGENT_VERSION}

USAGE
  node github-pr-review.mjs --repo=<owner/name> --pr=<number> [options]

REQUIRED
  --repo=<owner/name>       GitHub repository, e.g. AtomEons/orangebox-os
  --pr=<number>             Pull-request number

AUTHENTICATION (CLI overrides env)
  --token=<gh_pat>          GitHub PAT  (env: GITHUB_TOKEN)
  --anthropic-key=<key>     Anthropic API key  (env: ANTHROPIC_API_KEY)

OPTIONAL
  --vault-path=<dir>        Path to operator knowledge vault dir.
                            Markdown + text files there are prepended to the
                            review context as grounding material.
  --data-root=<dir>         Where receipts land  (env: ORANGEBOX_DATA_ROOT,
                            default: ~/OrangeBox-Data)
  --dry-run                 Build context + call Anthropic, but do NOT post
                            the review to GitHub. Prints what would be posted.
  --help                    Print this message and exit.

RECEIPT
  Written to <data_root>/receipts/pr/<owner>-<name>-<pr>-<timestamp>.json
  Schema: ${RECEIPT_SCHEMA}

EXAMPLES
  # Full live review
  node github-pr-review.mjs --repo=AtomEons/orangebox-os --pr=17

  # Dry run — preview without posting
  node github-pr-review.mjs --repo=AtomEons/orangebox-os --pr=17 --dry-run

  # Ground in operator vault
  node github-pr-review.mjs --repo=AtomEons/orangebox-os --pr=17 \\
    --vault-path=/Users/atom/OrangeBox-Data/knowledge-vault

DOCTRINE
  ATOM-OBX-V4-MOAT-2026-0516  (P1.6 — GitHub PR review agent, v3.6 milestone)
`);
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function ghFetch(path, token, { method = "GET", body = null } = {}) {
  const url = path.startsWith("http") ? path : `${GITHUB_API}${path}`;
  const headers = {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": `orangebox-pr-review/${AGENT_VERSION}`
  };
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  if (!res.ok) {
    throw new Error(`GitHub ${method} ${url} → ${res.status}: ${text.slice(0, 400)}`);
  }
  return json ?? text;
}

async function anthropicMessages(payload, apiKey) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": ANTHROPIC_BETA,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok) {
    throw new Error(`Anthropic API → ${res.status}: ${text.slice(0, 600)}`);
  }
  return json;
}

// ─── GitHub data fetchers ──────────────────────────────────────────────────────

async function fetchPR(owner, repo, prNumber, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
}

async function fetchPRDiff(owner, repo, prNumber, token) {
  const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}`;
  const res = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github.diff",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": `orangebox-pr-review/${AGENT_VERSION}`
    }
  });
  if (!res.ok) {
    throw new Error(`GitHub diff fetch → ${res.status}: ${await res.text().then(t => t.slice(0, 200))}`);
  }
  return res.text();
}

async function fetchPRFiles(owner, repo, prNumber, token) {
  return ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`, token);
}

async function fetchPRComments(owner, repo, prNumber, token) {
  const [reviewComments, issueComments] = await Promise.all([
    ghFetch(`/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`, token),
    ghFetch(`/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`, token)
  ]);
  return { reviewComments, issueComments };
}

async function fetchFileContent(owner, repo, filePath, ref, token) {
  try {
    const data = await ghFetch(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${encodeURIComponent(ref)}`,
      token
    );
    if (data.encoding === "base64" && data.content) {
      const decoded = Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
      return decoded.slice(0, FILE_BYTE_LIMIT);
    }
    return null;
  } catch {
    return null; // File may not exist on that ref, or be binary — skip silently
  }
}

async function fetchRepoInfo(owner, repo, token) {
  return ghFetch(`/repos/${owner}/${repo}`, token);
}

// ─── Vault loader ─────────────────────────────────────────────────────────────

async function loadVault(vaultPath) {
  if (!vaultPath) return null;
  let stat;
  try { stat = await fs.stat(vaultPath); } catch { return null; }
  if (!stat.isDirectory()) return null;

  const chunks = [];
  const walk = async (dir) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      if (/\.(md|txt|mdx|rst)$/i.test(e.name)) {
        try {
          const content = await fs.readFile(full, "utf-8");
          chunks.push(`--- vault: ${path.relative(vaultPath, full)} ---\n${content.slice(0, 8_000)}`);
        } catch { /* skip unreadable */ }
      }
    }
  };
  await walk(vaultPath);
  return chunks.length ? chunks.join("\n\n") : null;
}

// ─── Diff position mapping ─────────────────────────────────────────────────────
// GitHub review comments need a `position` integer = line number within the
// unified diff hunk (1-indexed from the start of the diff for that file).
// We build a map: filename → Map<lineNumber, diffPosition>
// so the model can specify a target line and we can resolve its diff position.

function buildLineToPositionMap(diff) {
  // Returns: Map<string (filename), Map<number (right-side line), number (diff position)>>
  const fileMap = new Map();
  let currentFile = null;
  let diffPosition = 0;  // resets per file per GitHub's spec
  let rightLine = 0;

  for (const rawLine of diff.split("\n")) {
    const fileMark = rawLine.match(/^\+\+\+ b\/(.+)$/);
    if (fileMark) {
      currentFile = fileMark[1];
      diffPosition = 0;
      fileMap.set(currentFile, new Map());
      continue;
    }
    if (rawLine.match(/^--- /)) continue;
    if (rawLine.match(/^diff --git /)) {
      currentFile = null;
      diffPosition = 0;
      continue;
    }

    if (!currentFile) continue;

    const hunkHeader = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkHeader) {
      diffPosition++;
      rightLine = parseInt(hunkHeader[1], 10) - 1;
      continue;
    }

    if (rawLine.startsWith("+")) {
      diffPosition++;
      rightLine++;
      fileMap.get(currentFile)?.set(rightLine, diffPosition);
    } else if (rawLine.startsWith("-")) {
      diffPosition++;
      // removed lines do not advance rightLine
    } else {
      // context line
      diffPosition++;
      rightLine++;
      fileMap.get(currentFile)?.set(rightLine, diffPosition);
    }
  }

  return fileMap;
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(repoInfo, vaultContent) {
  const repoSection = `## Repository context
Name: ${repoInfo.full_name}
Description: ${repoInfo.description || "none"}
Language: ${repoInfo.language || "unknown"}
Default branch: ${repoInfo.default_branch}
Stars: ${repoInfo.stargazers_count}
License: ${repoInfo.license?.spdx_id || "none"}
Topics: ${(repoInfo.topics || []).join(", ") || "none"}`;

  const vaultSection = vaultContent
    ? `## Operator knowledge vault (ground your review in this)\n${vaultContent.slice(0, 60_000)}`
    : "";

  return [repoSection, vaultSection].filter(Boolean).join("\n\n");
}

function buildUserPrompt(pr, diff, files, existingComments) {
  const filesSection = files
    .slice(0, FILE_CONTENT_FETCH_LIMIT)
    .map(f => {
      const status = f.status; // added/modified/removed/renamed
      const lines = `+${f.additions}/-${f.deletions}`;
      const body = f.fileContent
        ? `\`\`\`\n${f.fileContent}\n\`\`\``
        : `(content unavailable)`;
      return `### ${f.filename}  [${status}, ${lines}]\n${body}`;
    })
    .join("\n\n");

  const existingSection = (() => {
    const rc = existingComments.reviewComments;
    if (!rc || rc.length === 0) return "";
    const preview = rc.slice(0, 10).map(c =>
      `- @${c.user?.login} on \`${c.path}\` line ${c.original_line ?? c.line}: ${c.body.slice(0, 200)}`
    ).join("\n");
    return `## Existing review comments (${rc.length} total — first 10 shown)\n${preview}`;
  })();

  const diffSnippet = diff.length > DIFF_CHAR_LIMIT
    ? diff.slice(0, DIFF_CHAR_LIMIT) + `\n\n[diff truncated — ${diff.length - DIFF_CHAR_LIMIT} chars omitted]`
    : diff;

  return `# Pull Request Review Task

## PR metadata
Title: ${pr.title}
Number: #${pr.number}
Author: @${pr.user?.login}
Base branch: ${pr.base?.label}  →  Head branch: ${pr.head?.label}
State: ${pr.state}
Draft: ${pr.draft ? "yes" : "no"}
Mergeable: ${pr.mergeable ?? "unknown"}
Changed files: ${pr.changed_files}  |  +${pr.additions}/-${pr.deletions}

## PR description
${pr.body || "(no description provided)"}

${existingSection}

## Full unified diff
\`\`\`diff
${diffSnippet}
\`\`\`

## Changed files with full content (up to ${FILE_CONTENT_FETCH_LIMIT} files)
${filesSection}

---

## Your task

Produce a structured JSON review of this pull request. Your response MUST be valid JSON matching this schema exactly — no markdown fences, no prose outside the JSON:

{
  "summary": "<1-3 sentence plain-English summary of what this PR does>",
  "recommendation": "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  "review_body": "<Concise overall review comment — will appear as the top-level PR review body on GitHub. May use GitHub-flavoured markdown. 2-6 sentences.>",
  "concerns": [
    {
      "severity": "critical" | "major" | "minor" | "nit",
      "category": "bug" | "security" | "performance" | "style" | "correctness" | "maintainability",
      "file": "<filename relative to repo root>",
      "line": <integer line number on the right-side (new) file, or null if file-level>,
      "title": "<short concern title>",
      "body": "<explanation — what the problem is and how to fix it. Cite the specific line. GitHub markdown OK.>"
    }
  ],
  "strengths": [
    {
      "file": "<filename or null for PR-level>",
      "line": <integer or null>,
      "title": "<short strength title>",
      "body": "<what is good here and why it matters>"
    }
  ],
  "suggested_followups": [
    "<one actionable follow-up per string — things the author should consider but that should not block merge>"
  ],
  "confidence": <0.0–1.0 float — how confident are you in the review given the context available>
}

Rules:
- If you cannot resolve a file+line to a real line in the diff, set line to null.
- Do not hallucinate function names, variable names, or line numbers. Only cite what appears in the diff or file content above.
- severity=critical means: merge this and something breaks or leaks.
- Do not add concerns for purely stylistic preferences unless the codebase has an obvious enforced style you can cite.
- Strengths are not optional flattery — cite concrete patterns worth preserving.
- The recommendation must follow from the concerns: any critical or ≥2 major concerns → REQUEST_CHANGES; no concerns or only nits → APPROVE; otherwise → COMMENT.
`;
}

// ─── Review posting ───────────────────────────────────────────────────────────

function resolveCommentPosition(lineToPositionMap, filename, line) {
  if (line === null || line === undefined) return null;
  const fileMap = lineToPositionMap.get(filename);
  if (!fileMap) return null;
  // Find exact or nearest prior position
  if (fileMap.has(line)) return fileMap.get(line);
  // Walk back up to 10 lines to find a mappable position
  for (let delta = 1; delta <= 10; delta++) {
    if (fileMap.has(line - delta)) return fileMap.get(line - delta);
  }
  return null;
}

function buildGitHubReviewPayload(reviewResult, files, lineToPositionMap) {
  const comments = [];

  const addComment = (item) => {
    if (!item.file || item.line === null || item.line === undefined) return;
    const position = resolveCommentPosition(lineToPositionMap, item.file, item.line);
    if (position === null) return; // Can't place inline — skip; body will appear in review_body
    comments.push({
      path: item.file,
      position,
      body: item.body
    });
  };

  for (const c of (reviewResult.concerns || [])) addComment(c);
  for (const s of (reviewResult.strengths || [])) addComment(s);

  // Build a rich review body that includes all concerns + strengths,
  // regardless of whether inline placement succeeded.
  const concernsBlock = (reviewResult.concerns || []).map(c =>
    `**[${c.severity.toUpperCase()} / ${c.category}]** ${c.title}\n` +
    (c.file ? `_${c.file}${c.line ? `:${c.line}` : ""}_\n` : "") +
    c.body
  ).join("\n\n---\n\n");

  const strengthsBlock = (reviewResult.strengths || []).map(s =>
    `**Strength:** ${s.title}\n` +
    (s.file ? `_${s.file}${s.line ? `:${s.line}` : ""}_\n` : "") +
    s.body
  ).join("\n\n");

  const followupsBlock = (reviewResult.suggested_followups || [])
    .map(f => `- ${f}`).join("\n");

  const reviewBody = [
    reviewResult.review_body,
    concernsBlock ? `\n\n## Concerns\n\n${concernsBlock}` : "",
    strengthsBlock ? `\n\n## Strengths\n\n${strengthsBlock}` : "",
    followupsBlock ? `\n\n## Suggested follow-ups\n\n${followupsBlock}` : "",
    `\n\n---\n_ORANGEBOX v4 PR Review Agent v${AGENT_VERSION} · Model: ${MODEL} · Confidence: ${reviewResult.confidence ?? "?"}_ `
  ].filter(Boolean).join("");

  return {
    body: reviewBody,
    event: reviewResult.recommendation, // APPROVE | REQUEST_CHANGES | COMMENT
    comments: comments.slice(0, 50) // GitHub caps inline comments per review
  };
}

// ─── Receipt writer ───────────────────────────────────────────────────────────

function estimateCost(usage) {
  const { input_tokens = 0, output_tokens = 0, cache_read_input_tokens = 0, cache_creation_input_tokens = 0 } = usage;
  const uncachedInput = input_tokens - cache_read_input_tokens;
  return (
    (uncachedInput / 1000) * COST_PER_1K_INPUT_UNCACHED +
    (cache_read_input_tokens / 1000) * COST_PER_1K_INPUT_CACHED +
    (output_tokens / 1000) * COST_PER_1K_OUTPUT
  );
}

async function writeReceipt(dataRoot, owner, repo, prNumber, payload) {
  const dir = path.join(dataRoot, "receipts", "pr");
  await fs.mkdir(dir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("Z", "Z");
  const filename = `${owner}-${repo}-${prNumber}-${ts}.json`;
  const fullPath = path.join(dir, filename);
  await fs.writeFile(fullPath, JSON.stringify(payload, null, 2), "utf-8");
  return fullPath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  // Validate required args
  const repoArg = args.repo;
  const prArg = args.pr;
  if (!repoArg || !prArg) {
    console.error("ERROR: --repo=<owner/name> and --pr=<number> are required. Pass --help for usage.");
    process.exit(1);
  }
  const [owner, repo] = repoArg.split("/");
  if (!owner || !repo) {
    console.error("ERROR: --repo must be in the format owner/name, e.g. AtomEons/orangebox-os");
    process.exit(1);
  }
  const prNumber = parseInt(prArg, 10);
  if (isNaN(prNumber) || prNumber < 1) {
    console.error("ERROR: --pr must be a positive integer.");
    process.exit(1);
  }

  const ghToken = args.token || process.env.GITHUB_TOKEN;
  const anthropicKey = args["anthropic-key"] || process.env.ANTHROPIC_API_KEY;
  const vaultPath = args["vault-path"] || null;
  const dataRoot = args["data-root"] || process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
  const dryRun = !!args.dryRun;

  if (!ghToken) {
    console.error("ERROR: GitHub token required. Pass --token=<pat> or set GITHUB_TOKEN env var.");
    process.exit(1);
  }
  if (!anthropicKey) {
    console.error("ERROR: Anthropic API key required. Pass --anthropic-key=<key> or set ANTHROPIC_API_KEY env var.");
    process.exit(1);
  }

  const startedAt = new Date().toISOString();
  console.log(`[orangebox-pr-review] ${dryRun ? "[DRY-RUN] " : ""}repo=${repoArg} pr=#${prNumber}`);

  // ── 1. Fetch GitHub data ──────────────────────────────────────────────────
  console.log("[1/6] Fetching PR metadata + diff + files + comments…");
  const [prData, diff, prFiles, prComments, repoInfo] = await Promise.all([
    fetchPR(owner, repo, prNumber, ghToken),
    fetchPRDiff(owner, repo, prNumber, ghToken),
    fetchPRFiles(owner, repo, prNumber, ghToken),
    fetchPRComments(owner, repo, prNumber, ghToken),
    fetchRepoInfo(owner, repo, ghToken)
  ]);

  // ── 2. Fetch full file content for changed files ──────────────────────────
  console.log(`[2/6] Fetching file content for up to ${FILE_CONTENT_FETCH_LIMIT} changed files…`);
  const headRef = prData.head?.sha || prData.head?.ref || "HEAD";
  const filesToFetch = prFiles.slice(0, FILE_CONTENT_FETCH_LIMIT);
  const fileContents = await Promise.all(
    filesToFetch.map(f =>
      f.status === "removed"
        ? Promise.resolve(null)
        : fetchFileContent(owner, repo, f.filename, headRef, ghToken)
    )
  );
  const enrichedFiles = filesToFetch.map((f, i) => ({
    ...f,
    fileContent: fileContents[i]
  }));

  // ── 3. Load operator vault ────────────────────────────────────────────────
  console.log("[3/6] Loading operator vault…");
  const vaultContent = await loadVault(vaultPath);
  if (vaultContent) {
    console.log(`[3/6] Vault loaded — ${vaultContent.length} chars`);
  } else {
    console.log("[3/6] No vault (--vault-path not set or empty).");
  }

  // ── 4. Build prompt + call Anthropic ─────────────────────────────────────
  console.log("[4/6] Building context and calling Anthropic…");
  const systemPrompt = buildSystemPrompt(repoInfo, vaultContent);
  const userPrompt = buildUserPrompt(prData, diff, enrichedFiles, prComments);

  // Repo context + vault go in a cache_control: ephemeral block so that
  // repeated reviews on the same repo amortize the token cost.
  const payload = {
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" }
      }
    ],
    messages: [
      {
        role: "user",
        content: userPrompt
      }
    ]
  };

  const anthropicResponse = await anthropicMessages(payload, anthropicKey);
  const usage = anthropicResponse.usage || {};
  const rawContent = anthropicResponse.content?.[0]?.text || "";

  // ── 5. Parse model response ───────────────────────────────────────────────
  console.log("[5/6] Parsing model response…");
  let reviewResult;
  try {
    // Strip markdown fences if the model wrapped its JSON
    const cleaned = rawContent.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
    reviewResult = JSON.parse(cleaned);
  } catch (parseErr) {
    console.error("ERROR: Model did not return valid JSON. Raw response:");
    console.error(rawContent.slice(0, 1000));
    // Emit an emergency receipt so the operator has a trace
    const emergencyReceipt = {
      schema: RECEIPT_SCHEMA,
      ts: startedAt,
      agent_version: AGENT_VERSION,
      repo: repoArg,
      pr: prNumber,
      dry_run: dryRun,
      model: MODEL,
      usage,
      estimated_cost_usd: estimateCost(usage),
      status: "PARSE_FAILED",
      raw_response_head: rawContent.slice(0, 2000),
      error: parseErr.message
    };
    const rpath = await writeReceipt(dataRoot, owner, repo, prNumber, emergencyReceipt);
    console.log(`Receipt (emergency): ${rpath}`);
    process.exit(1);
  }

  // ── 6. Post to GitHub (or dry-run) ────────────────────────────────────────
  const lineToPositionMap = buildLineToPositionMap(diff);
  const ghPayload = buildGitHubReviewPayload(reviewResult, enrichedFiles, lineToPositionMap);

  if (dryRun) {
    console.log("\n[DRY-RUN] Would POST this to GitHub Reviews API:");
    console.log(JSON.stringify(ghPayload, null, 2));
  } else {
    console.log(`[6/6] Posting review (${reviewResult.recommendation}) to GitHub…`);
    const ghReview = await ghFetch(
      `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`,
      ghToken,
      { method: "POST", body: ghPayload }
    );
    console.log(`[6/6] Review posted — id=${ghReview.id} state=${ghReview.state}`);
    var postedReviewId = ghReview.id;
  }

  // ── Receipt ───────────────────────────────────────────────────────────────
  const costUsd = estimateCost(usage);
  const concernCount = (reviewResult.concerns || []).length;
  const inlineCommentCount = ghPayload.comments.length;

  const receipt = {
    schema: RECEIPT_SCHEMA,
    ts: startedAt,
    agent_version: AGENT_VERSION,
    repo: repoArg,
    pr: prNumber,
    pr_title: prData.title,
    pr_author: prData.user?.login,
    dry_run: dryRun,
    model: MODEL,
    recommendation: reviewResult.recommendation,
    summary: reviewResult.summary,
    concern_count: concernCount,
    concern_breakdown: (reviewResult.concerns || []).reduce((acc, c) => {
      acc[c.severity] = (acc[c.severity] || 0) + 1;
      return acc;
    }, {}),
    strength_count: (reviewResult.strengths || []).length,
    inline_comment_count: inlineCommentCount,
    confidence: reviewResult.confidence ?? null,
    github_review_id: postedReviewId ?? null,
    usage: {
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0
    },
    estimated_cost_usd: parseFloat(costUsd.toFixed(6)),
    vault_loaded: !!vaultContent,
    changed_files_fetched: enrichedFiles.length,
    diff_chars: diff.length,
    diff_truncated: diff.length > DIFF_CHAR_LIMIT,
    blockers: [],
    residual_risk: [
      "Inline comment positions depend on GitHub's diff position indexing — positions may misalign on very large or binary-adjacent diffs.",
      "Context window limits may truncate large diffs; diff_truncated flag indicates this.",
      "Model confidence is self-reported; treat as a signal, not a guarantee."
    ]
  };

  const receiptPath = await writeReceipt(dataRoot, owner, repo, prNumber, receipt);
  console.log(`\nReceipt: ${receiptPath}`);

  // Final summary
  const sep = "─".repeat(60);
  console.log(`\n${sep}`);
  console.log(`ORANGEBOX PR Review — ${dryRun ? "DRY RUN" : "POSTED"}`);
  console.log(`Repo:           ${repoArg}  #${prNumber}`);
  console.log(`Recommendation: ${reviewResult.recommendation}`);
  console.log(`Concerns:       ${concernCount}  |  Inline comments: ${inlineCommentCount}`);
  console.log(`Tokens in/out:  ${usage.input_tokens ?? "?"}/${usage.output_tokens ?? "?"}  (cached: ${usage.cache_read_input_tokens ?? 0})`);
  console.log(`Est. cost:      $${costUsd.toFixed(5)}`);
  console.log(`Receipt:        ${receiptPath}`);
  console.log(sep);
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
