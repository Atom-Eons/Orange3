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
  "codex", "hooks", "skills", "sandbox", "supply chain", "prompt injection",
  "automation bias", "complacency", "vigilance", "situation awareness",
  "operator", "human factors", "long-horizon", "judge", "verification",
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
    id: "anthropic_claude_code_hooks",
    tier: "T0_VENDOR_DOCS",
    source_family: "anthropic",
    url: "https://code.claude.com/docs/en/hooks",
    reason: "Claude Code hooks map directly to Orangebox doer/watcher alerts, deterministic guardrails, and stale-session prevention.",
  },
  {
    id: "anthropic_agent_sdk_hooks",
    tier: "T0_VENDOR_DOCS",
    source_family: "anthropic",
    url: "https://code.claude.com/docs/en/agent-sdk/hooks",
    reason: "Agent SDK hook semantics inform Orangebox tool telemetry, MCP call logging, and watcher receipt callbacks.",
  },
  {
    id: "openai_codex_ide",
    tier: "T0_VENDOR_ENGINEERING",
    source_family: "openai",
    url: "https://developers.openai.com/codex/ide",
    reason: "Codex IDE read/edit/run-code workflows inform Orangebox primers, skill commands, shell-action receipts, and cross-agent handoffs.",
  },
  {
    id: "openai_local_shell_tool",
    tier: "T0_VENDOR_ENGINEERING",
    source_family: "openai",
    url: "https://platform.openai.com/docs/guides/tools-local-shell",
    reason: "Local shell tool orchestration informs Orangebox control-plane law: the model proposes shell actions, the local harness executes, receipts prove.",
  },
  {
    id: "mcp_latest_spec",
    tier: "T0_STANDARD",
    source_family: "mcp",
    url: "https://modelcontextprotocol.io/specification/latest",
    reason: "Protocol-level changes decide what Orangebox should expose to Codex, Claude, Antigravity, and local tools.",
  },
  {
    id: "ox_mcp_stdio_supply_chain",
    tier: "T1_SECURITY_RESEARCH",
    source_family: "mcp_security",
    url: "https://www.ox.security/blog/the-mother-of-all-ai-supply-chains-critical-systemic-vulnerability-at-the-core-of-the-mcp/",
    reason: "MCP STDIO command-execution risk directly validates Orangebox MCP quarantine, metadata-only stdio probes, fixed command templates, and operator approval gates.",
  },
  {
    id: "csa_mcp_rce_design_note",
    tier: "T1_SECURITY_RESEARCH",
    source_family: "mcp_security",
    url: "https://labs.cloudsecurityalliance.org/research/csa-research-note-mcp-rce-design-vulnerability-20260423-csa/",
    reason: "CSA notes on MCP STDIO RCE and local-server exposure strengthen Orangebox MCP transport policy and 127.0.0.1 binding checks.",
  },
  {
    id: "nih_ai_assurance_lab",
    tier: "T0_GOVERNMENT_RESEARCH",
    source_family: "nih",
    url: "https://datascience.nih.gov/artificial-intelligence/initiatives/nih-ai-assurance-lab-insights",
    reason: "AI assurance lab patterns map directly to Orangebox proof, benchmark, and approval gates.",
  },
  {
    id: "nih_automation_overreliance",
    tier: "T0_HUMAN_FACTORS",
    source_family: "nih_pmc",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6534180/",
    reason: "Automation over-reliance research informs Orangebox reality checks, doer/watcher split, operator accountability, and failure-exposure drills.",
  },
  {
    id: "nih_automation_complacency_scale",
    tier: "T0_HUMAN_FACTORS",
    source_family: "nih_pmc",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6389673/",
    reason: "Automation-induced complacency research maps to Orangebox watcher cadence, proof transparency, and no-theater monitoring gates.",
  },
  {
    id: "nih_agent_transparency_situation_awareness",
    tier: "T0_HUMAN_FACTORS",
    source_family: "nih_pmc",
    url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10756021/",
    reason: "Agent transparency and situation-awareness research informs Orangebox health reports, visible rail state, and operator trust calibration.",
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
  {
    id: "arxiv_tool_orchestration_agents",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2603.22862",
    reason: "Multi-tool orchestration research maps to Orangebox MCP quarantine, tool budgets, execution feedback, and verifiable trajectories.",
  },
  {
    id: "arxiv_llm_judge_reflect",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2605.19196",
    reason: "LLM-judge unreliability research supports Orangebox deterministic gates before AI review and STRONGARM/Mirror/Judgement separation.",
  },
  {
    id: "arxiv_roadmapbench_long_horizon",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2605.15846",
    reason: "Long-horizon version-upgrade benchmarks inform Orangebox acceptance matrices, receipts, and multi-target system proof.",
  },
  {
    id: "arxiv_featurebench_agentic_features",
    tier: "T0_RESEARCH",
    source_family: "arxiv",
    url: "https://arxiv.org/abs/2602.10975",
    reason: "Feature-oriented coding benchmarks reinforce Orangebox end-to-end feature proof instead of single-issue bug-fix theater.",
  },
];

const ARXIV_QUERIES = [
  {
    id: "agent_memory_context",
    query: "\"agent memory\" OR \"context compression\" OR \"memory control\"",
    required_any: ["agent memory", "memory control", "context compression", "long context", "retrieval", "memory"],
    source_family: "arxiv",
    tier: "T0_RESEARCH",
    reason: "Memory/context control is the AtomSmasher and Knowledge Engine frontier.",
  },
  {
    id: "software_agents_eval",
    query: "\"software engineering agents\" OR \"coding agents\" OR \"agent benchmark\"",
    required_any: ["software engineering agent", "coding agent", "agent benchmark", "program repair", "repository", "code generation", "software"],
    source_family: "arxiv",
    tier: "T0_RESEARCH",
    reason: "Agent evals decide which Orangebox features should graduate.",
  },
  {
    id: "llm_judges_evidence_verification",
    query: "\"LLM judge\" OR \"evidence verification\" OR \"research agents\"",
    required_any: ["llm judge", "judge", "evidence verification", "verifier", "factual", "evaluation", "research agent", "reflect"],
    source_family: "arxiv",
    tier: "T0_RESEARCH",
    reason: "Judge reliability research decides when Orangebox should trust model review versus deterministic receipts.",
  },
  {
    id: "long_horizon_agentic_development",
    query: "\"long-horizon\" \"software\" \"agent\" OR \"version upgrades\" \"agentic\"",
    required_any: ["long-horizon", "long horizon", "version upgrade", "roadmap", "feature development", "agentic software", "software agent"],
    source_family: "arxiv",
    tier: "T0_RESEARCH",
    reason: "Long-horizon development research maps to Orangebox project proof and rollback gates.",
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
  {
    id: "human_automation_operator_awareness",
    query: "((automation bias[Title/Abstract]) OR (automation complacency[Title/Abstract]) OR (situation awareness[Title/Abstract]) OR (human automation interaction[Title/Abstract])) AND (operator OR monitoring OR decision support)",
    source_family: "nih_pubmed",
    tier: "T0_HUMAN_FACTORS",
    reason: "Human-automation research keeps Orangebox from becoming invisible automation theater.",
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
  {
    id: "reddit_claude_code_hooks_skills",
    tier: "T3_WEAK_SOCIAL",
    source_family: "reddit",
    url: "https://www.reddit.com/r/ClaudeCode/search.rss?q=hooks%20skills%20mcp%20memory&restrict_sr=1&sort=new&t=month",
    reason: "Weak-signal operator pain around Claude Code hooks, skills, MCP, stale memory, and setup drift.",
  },
  {
    id: "reddit_codex_agents_md_skills",
    tier: "T3_WEAK_SOCIAL",
    source_family: "reddit",
    url: "https://www.reddit.com/r/codex/search.rss?q=AGENTS.md%20skills%20MCP%20context&restrict_sr=1&sort=new&t=month",
    reason: "Weak-signal Codex pain around AGENTS.md, skills, MCP, compaction, and cross-agent portability.",
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function looksBlockedPage(html) {
  const title = titleFromHtml(html, "");
  const text = stripTags(html);
  return /checking your browser|recaptcha|access denied|verify you are human/i.test(`${title} ${text.slice(0, 800)}`);
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
  if (/automation bias|automation complacency|over-reliance|overreliance|vigilance|situation awareness|human factors|operator performance|mental workload/.test(haystack)) {
    return {
      area: "operator_situation_awareness",
      proposed_action: "Convert into Orangebox watcher/health-report rules: visible status, failure drills, calibrated trust, no silent automation, and operator accountability prompts.",
    };
  }
  if (/\brce\b|remote code execution|\bstdio\b|supply chain|prompt injection|command execution|localhost|dns rebinding|\bcors\b/.test(haystack)) {
    return {
      area: "mcp_supply_chain_security",
      proposed_action: "Strengthen MCP quarantine: metadata-only STDIO, fixed command templates, localhost binding proof, output caps, and explicit operator approval before executable tools.",
    };
  }
  if (/codex|agent loop|responses api|computer environment|shell tool|compaction|hosted runtime/.test(haystack)) {
    return {
      area: "codex_harness_and_compaction",
      proposed_action: "Map Codex loop mechanics into Orangebox primers, compaction restore packets, shell-action receipts, and cross-agent handoff checks.",
    };
  }
  if (/llm judge|judge|evidence verification|reflect|factual accuracy|tool-use failures|report-quality failures/.test(haystack)) {
    return {
      area: "judge_reliability_and_strongarm",
      proposed_action: "Keep deterministic gates ahead of AI judgement; add STRONGARM/Mirror tests where model judges must cite receipts and cannot overrule failed checks.",
    };
  }
  if (/roadmapbench|featurebench|long-horizon|version upgrade|feature development|multi-target/.test(haystack)) {
    return {
      area: "long_horizon_feature_proof",
      proposed_action: "Use roadmap-style acceptance matrices: feature contract, changed-file proof, tests, rollback, receipt, and no completion claim without end-to-end evidence.",
    };
  }
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
  if (/sandbox|filesystem isolation|network isolation|credential|exfiltrat|permission boundary|tool permission|network permission|filesystem permission|file permission/.test(haystack)) {
    return {
      area: "sandbox_and_permission_law",
      proposed_action: "Translate sandbox findings into Orangebox path/network policy fixtures for MCP servers, Codexa rails, and installer checks.",
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

function evidenceWeight(tier) {
  const value = String(tier || "");
  if (value.startsWith("T0")) return 1.0;
  if (value.startsWith("T1")) return 0.82;
  if (value.startsWith("T2")) return 0.55;
  return 0.22;
}

function buildFocusedSynthesis(candidates) {
  const groups = new Map();
  for (const candidate of candidates) {
    if (!groups.has(candidate.area)) groups.set(candidate.area, []);
    groups.get(candidate.area).push(candidate);
  }
  return [...groups.entries()]
    .map(([area, items]) => {
      const score = Math.round(items.reduce((sum, item) => sum + evidenceWeight(item.tier) * (item.orangebox_score || 0), 0) / Math.max(1, items.length));
      const top = [...items].sort((a, b) => b.orangebox_score - a.orangebox_score)[0];
      const evidence_tiers = [...new Set(items.map((item) => item.tier))].sort();
      const source_families = [...new Set(items.map((item) => item.source_family))].sort();
      const approval = score >= 55 && items.some((item) => String(item.tier || "").startsWith("T0"))
        ? "APPROVAL_CANDIDATE"
        : "HOLD_FOR_CORROBORATION";
      return {
        area,
        approval_status: approval,
        score,
        source_count: items.length,
        evidence_tiers,
        source_families,
        synthesis: top.proposed_action,
        why_orangebox_cares: top.reason,
        strongest_signal: {
          title: top.title,
          url: top.url,
          tier: top.tier,
        },
        promotion_gate: {
          required: true,
          required_evidence: [
            "task contract",
            "operator approval",
            "doctor/proof receipt",
            "rollback path",
            "no frontend mutation from Ops lane",
          ],
        },
      };
    })
    .sort((a, b) => b.score - a.score || b.source_count - a.source_count)
    .slice(0, 12);
}

function itemFromSource({ id, tier, source_family, url, reason, title, summary, published_at = null }) {
  const sourceBoost =
    (tier.startsWith("T0") ? 20 : 0)
    + (/HUMAN_FACTORS/i.test(tier) || /nih_pmc/i.test(source_family) ? 24 : 0)
    + (/SECURITY/i.test(tier) || /mcp_security/i.test(source_family) ? 18 : 0);
  const scoring = scoreText(`${title} ${summary} ${reason}`, sourceBoost);
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
    const blocked = looksBlockedPage(fetched.body);
    const title = blocked ? target.id : titleFromHtml(fetched.body, target.id);
    const text = blocked
      ? `Static fetch appears blocked by a browser challenge. Source pointer retained for manual/API corroboration. ${target.reason}`
      : compact(stripTags(fetched.body), 900);
    if (blocked) fetches[fetches.length - 1].blocked_by_browser_challenge = true;
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

function matchesAnyText(text, needles = []) {
  const haystack = String(text || "").toLowerCase();
  return needles.some((needle) => haystack.includes(String(needle).toLowerCase()));
}

function arxivEntryRelevant(query, entry) {
  if (!Array.isArray(query.required_any) || !query.required_any.length) return true;
  return matchesAnyText(`${entry.title} ${entry.summary}`, query.required_any);
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
    const fetchRecord = { id: query.id, ok: fetched.ok, status: fetched.status, url, error: fetched.error || null, accepted: 0, dropped_irrelevant: 0 };
    fetches.push(fetchRecord);
    if (!fetched.ok) continue;
    for (const entry of parseArxivEntries(fetched.body)) {
      if (!entry.url || !entry.title) continue;
      if (!arxivEntryRelevant(query, entry)) {
        fetchRecord.dropped_irrelevant += 1;
        continue;
      }
      fetchRecord.accepted += 1;
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

function pubmedTitleRelevant(query, title) {
  if (query.id === "human_automation_operator_awareness") {
    return /(automation bias|automation complacency|situation awareness|human automation|operator|monitoring|decision support|vigilance|over-?reliance)/i.test(title);
  }
  return /(agentic|large language model|llm|artificial intelligence|ai agent|multiagent|multi-agent)/i.test(title);
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
    await sleep(450);
    const summaryUrl = pubmedSummaryUrl(ids);
    let summarized = await fetchText(summaryUrl);
    if (summarized.status === 429) {
      await sleep(1250);
      summarized = await fetchText(summaryUrl);
    }
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
      if (!pubmedTitleRelevant(query, title)) continue;
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
  const candidates = items.filter((item) => item.orangebox_score >= 30).slice(0, 48);
  const focusedSynthesis = buildFocusedSynthesis(candidates);
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
    focused_synthesis: focusedSynthesis,
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
