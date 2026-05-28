# ORANGEBOX v4 — GitHub PR Review Agent

**Doctrine:** ATOM-OBX-V4-MOAT-2026-0516 · P1.6 · Milestone v3.6  
**File:** `scripts/v4/pr/github-pr-review.mjs`  
**Zero npm deps. Pure Node ES module. Receipts on every run.**

---

## What it does

Fetches a GitHub pull request (metadata + diff + changed files + existing comments),
builds a full context bundle, calls Anthropic Sonnet 4.5 with prompt caching,
and posts a structured review back to GitHub with inline comments tied to
specific file paths and diff positions.

Competitive surface: matches and exceeds Codex PR review by adding:

- Full file content (not just diff) fetched via GitHub Contents API
- Operator knowledge vault grounding (ground the review in your own docs)
- Prompt caching (`cache_control: ephemeral`) — repo context is cached across
  repeated reviews on the same repo, reducing token cost by up to 90%
- Structured receipt on every run — every review is logged with token usage,
  cost, recommendation, and comment count
- `--dry-run` mode — preview without posting a single byte to GitHub

---

## Requirements

- Node.js 18+ (uses built-in `fetch`, `node:fs/promises`, `node:path`, `node:crypto`)
- GitHub PAT with `repo` + `pull_requests` scopes
- Anthropic API key

---

## Installation

No install step. The script is a single self-contained ES module.

```
cd C:\AtomEons\ship\orangebox-os\scripts\v4\pr
node github-pr-review.mjs --help
```

---

## Usage

```
node github-pr-review.mjs \
  --repo=<owner/name> \
  --pr=<number> \
  [--token=<gh_pat>] \
  [--anthropic-key=<key>] \
  [--vault-path=<dir>] \
  [--data-root=<dir>] \
  [--dry-run]
```

### Flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--repo=owner/name` | yes | — | GitHub repository |
| `--pr=<number>` | yes | — | PR number |
| `--token=<pat>` | if env not set | `GITHUB_TOKEN` env | GitHub PAT |
| `--anthropic-key=<key>` | if env not set | `ANTHROPIC_API_KEY` env | Anthropic key |
| `--vault-path=<dir>` | no | — | Operator knowledge vault (`.md`/`.txt` files) |
| `--data-root=<dir>` | no | `~/OrangeBox-Data` | Receipt output root |
| `--dry-run` | no | false | Print what would post; do not write to GitHub |
| `--help` | no | — | Print usage and exit |

### Environment variables

```
GITHUB_TOKEN          GitHub PAT
ANTHROPIC_API_KEY     Anthropic API key
ORANGEBOX_DATA_ROOT   Data root for receipts (default: ~/OrangeBox-Data)
```

---

## Examples

### Full live review

```
node github-pr-review.mjs \
  --repo=AtomEons/orangebox-os \
  --pr=42
```

Assumes `GITHUB_TOKEN` and `ANTHROPIC_API_KEY` are set in the environment.

### Dry run — preview without posting

```
node github-pr-review.mjs \
  --repo=AtomEons/orangebox-os \
  --pr=42 \
  --dry-run
```

Calls Anthropic (real API call, real tokens), builds the full GitHub review
payload, prints it to stdout, and writes a receipt — but does not post
anything to GitHub.

### Ground review in operator vault

```
node github-pr-review.mjs \
  --repo=AtomEons/orangebox-os \
  --pr=42 \
  --vault-path="C:/Users/atom/OrangeBox-Data/knowledge"
```

All `.md` and `.txt` files under `--vault-path` are read and prepended to
the system prompt as grounding context. The model uses them when evaluating
whether the PR aligns with your conventions.

### Pass credentials inline

```
node github-pr-review.mjs \
  --repo=AtomEons/orangebox-os \
  --pr=42 \
  --token=ghp_xxxx \
  --anthropic-key=sk-ant-xxxx
```

---

## Output

### Console

```
[orangebox-pr-review] repo=AtomEons/orangebox-os pr=#42
[1/6] Fetching PR metadata + diff + files + comments…
[2/6] Fetching file content for up to 20 changed files…
[3/6] Loading operator vault…
[4/6] Building context and calling Anthropic…
[5/6] Parsing model response…
[6/6] Posting review (REQUEST_CHANGES) to GitHub…

────────────────────────────────────────────────────────────
ORANGEBOX PR Review — POSTED
Repo:           AtomEons/orangebox-os  #42
Recommendation: REQUEST_CHANGES
Concerns:       3  |  Inline comments: 2
Tokens in/out:  8241/892  (cached: 7100)
Est. cost:      $0.00647
Receipt:        C:\Users\atom\OrangeBox-Data\receipts\pr\AtomEons-orangebox-os-42-2026-05-16T...json
────────────────────────────────────────────────────────────
```

### Receipt schema

Written to `<data_root>/receipts/pr/<owner>-<repo>-<pr>-<timestamp>.json`.

```json
{
  "schema": "orangebox-pr-review-v1",
  "ts": "2026-05-16T14:30:00.000Z",
  "agent_version": "1.0.0",
  "repo": "AtomEons/orangebox-os",
  "pr": 42,
  "pr_title": "Add tab autocomplete via Haiku 4.5",
  "pr_author": "atomdev",
  "dry_run": false,
  "model": "claude-sonnet-4-5",
  "recommendation": "REQUEST_CHANGES",
  "summary": "This PR adds inline tab autocomplete using Haiku 4.5...",
  "concern_count": 3,
  "concern_breakdown": { "critical": 1, "minor": 2 },
  "strength_count": 2,
  "inline_comment_count": 2,
  "confidence": 0.87,
  "github_review_id": 1234567890,
  "usage": {
    "input_tokens": 8241,
    "output_tokens": 892,
    "cache_creation_input_tokens": 7100,
    "cache_read_input_tokens": 0
  },
  "estimated_cost_usd": 0.006470,
  "vault_loaded": false,
  "changed_files_fetched": 5,
  "diff_chars": 14200,
  "diff_truncated": false,
  "blockers": [],
  "residual_risk": [
    "Inline comment positions depend on GitHub's diff position indexing...",
    "Context window limits may truncate large diffs...",
    "Model confidence is self-reported; treat as a signal, not a guarantee."
  ]
}
```

---

## Prompt caching

The system prompt (repo info + vault content) is sent with `cache_control: ephemeral`.
When you run multiple reviews on the same repo in quick succession, Anthropic's API
returns the second call's repo context from cache — cutting input token cost by up to 90%.

The `usage.cache_read_input_tokens` field in the receipt tells you how many tokens
were served from cache.

---

## Inline comment placement

The agent builds a position map from the unified diff:

- For each concern/strength with a non-null `file` and `line`, it resolves the
  diff position (GitHub's 1-indexed offset within the hunk block).
- If a line cannot be resolved (e.g., context-only line or line outside the diff),
  the comment appears in the top-level review body instead.
- Up to 50 inline comments per review (GitHub API limit).

---

## Limits and behaviour at scale

| Parameter | Value |
|---|---|
| Max diff size fed to model | 120,000 chars (rest truncated; `diff_truncated` flag set in receipt) |
| Max file content per file | 32,000 bytes |
| Max files with full content | 20 (by file count from GitHub API) |
| Max inline comments per review | 50 (GitHub API limit) |

---

## Syntax check

```
node --check scripts/v4/pr/github-pr-review.mjs
```

---

## Doctrine notes

- **Local-first:** credentials stay on your machine; only your PAT and API key
  leave the machine (to GitHub and Anthropic respectively). No ORANGEBOX server
  call is made.
- **Receipts everywhere:** every run (including failures) writes a receipt.
- **Mom's Law:** full effort. The review is a real review, not a lint pass.

---

*ORANGEBOX v4 · ATOM-OBX-V4-MOAT-2026-0516*
