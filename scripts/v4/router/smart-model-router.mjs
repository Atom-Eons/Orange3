#!/usr/bin/env node
// v6.0.0 — Groq + Ollama providers + Gemma pre-classifier + Agent Teams advisory
//          (preserves v5.0.1 alpha: adaptive thinking + effort + advisor + multi-breakpoint).
//          See docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md and docs/V6_POSITION_2026_STACK.md.
/* ============================================================================
   smart-model-router.mjs — ORANGEBOX v4 Smart Model Router

   Doctrine anchor: docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Alpha applied:   docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md sections 3, 4, 11
                    (ATOM-OBX-V4-ALPHA-2026-0517)
   Phase slot:      v5.0.1 — adaptive thinking + effort + advisor + multi-breakpoint
   Author:          Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date:            2026-05-16
   Mom's Law:       Full effort. No stubs. No TODOs.

   Purpose
   ───────
   Decides which model (provider + model id) handles a given task, based on:
     - task type (autocomplete / inline_edit / multi_file_edit / architecture /
                  pr_review / chat / synthesis / voice_intent / vault_query / dream)
     - budget mode (strict | balanced | quality) from ORANGEBOX_BUDGET_MODE env
     - optional hint (string guidance)
     - optional budget ceiling (max cost in cents, float)
     - optional prefer object (explicit overrides for any routing field)
     - optional conversationTurns (integer, used for breakpoint_strategy)

   API
   ───
   import { route } from './smart-model-router.mjs';
   const decision = await route({ task, hint, budget, prefer, conversationTurns });
   // returns: { provider, model, reasoning, costEstimateCents, fallbacks, features,
   //            thinking, effort, breakpoint_strategy, advisor, timestamp }

   Pricing constants (best-known 2026 estimates — verify at console.anthropic.com/pricing
   and platform.openai.com/docs/pricing before billing integrations)
   ──────────────────────────────────────────────────────────────────────────────
   Anthropic Haiku 4.5:   $1.00/MTok input  |  $5.00/MTok output
   Anthropic Sonnet 4.5:  $3.00/MTok input  | $15.00/MTok output
   Anthropic Opus 4.7:   $15.00/MTok input  | $75.00/MTok output
   OpenAI GPT-5:         $10.00/MTok input  | $30.00/MTok output  (estimate)
   Google Gemini 1.5 Pro: $3.50/MTok input  | $10.50/MTok output  (estimate)

   Trilane tasks (synthesis) call all three providers and return all three
   decisions; callers orchestrate the debate with formal authority order:
     GPT-5 (architect) > Gemini 1.5 Pro (consigliere) > Claude Sonnet (compiler)

   Zero dependencies. Pure Node ES module. Node 18+ required (native fetch, URL).
   ============================================================================ */

// ─── Pricing table (dollars per million tokens, 2026 best-known estimates) ──

const PRICING = {
  // Anthropic
  "anthropic:claude-haiku-4-5":  { inputPerMTok: 1.00,  outputPerMTok:  5.00 },
  "anthropic:claude-sonnet-4-5": { inputPerMTok: 3.00,  outputPerMTok: 15.00 },
  "anthropic:claude-opus-4-7":   { inputPerMTok: 15.00, outputPerMTok: 75.00 },
  // OpenAI
  "openai:gpt-5":                { inputPerMTok: 10.00, outputPerMTok: 30.00 },
  // Google
  "google:gemini-1.5-pro":       { inputPerMTok: 3.50,  outputPerMTok: 10.50 },
  // Groq (LPU inference — Llama 3.3 70B Versatile is the speed/quality sweet spot).
  // Estimates from console.groq.com/pricing as of 2026-05; verify before billing.
  "groq:llama-3.3-70b-versatile": { inputPerMTok: 0.59, outputPerMTok: 0.79 },
  "groq:gemma2-9b-it":            { inputPerMTok: 0.20, outputPerMTok: 0.20 },
  // Ollama — local inference, $0 cost. Pricing kept at zero so cost ceilings
  // route to it cleanly when ORANGEBOX_LOCAL_MODE=1.
  "ollama:qwen2.5:7b":            { inputPerMTok: 0.00, outputPerMTok: 0.00 },
  "ollama:llama3.2:3b":           { inputPerMTok: 0.00, outputPerMTok: 0.00 },
  // v6.0.2 — six new providers (from 9router trending-month scan)
  // xAI Grok (4th Trilane leg, big personality, real-time data via X)
  "xai:grok-2":                   { inputPerMTok: 2.00, outputPerMTok: 10.00 },
  "xai:grok-2-mini":              { inputPerMTok: 0.30, outputPerMTok: 1.50 },
  // Cerebras (LPU-class inference, OpenAI-compatible)
  "cerebras:llama-3.3-70b":       { inputPerMTok: 0.85, outputPerMTok: 1.20 },
  // DeepSeek (cheapest frontier-tier — flagship for cost-sensitive ops)
  "deepseek:deepseek-chat":       { inputPerMTok: 0.27, outputPerMTok: 1.10 },
  "deepseek:deepseek-reasoner":   { inputPerMTok: 0.55, outputPerMTok: 2.19 },
  // Mistral (best non-Anthropic for code via Codestral)
  "mistral:codestral-latest":     { inputPerMTok: 0.30, outputPerMTok: 0.90 },
  "mistral:mistral-large-latest": { inputPerMTok: 2.00, outputPerMTok: 6.00 },
  // Together AI (open-weights gateway)
  "together:meta-llama/Llama-4-70b-instruct": { inputPerMTok: 0.88, outputPerMTok: 0.88 },
  // Kimi / Moonshot (long-context cheap)
  "kimi:moonshot-v1-128k":        { inputPerMTok: 0.60, outputPerMTok: 0.60 },
};

// ─── Model identifiers (canonical strings sent to provider APIs) ─────────────

const MODELS = {
  HAIKU:   { provider: "anthropic", model: "claude-haiku-4-5-20251001"    },
  SONNET:  { provider: "anthropic", model: "claude-sonnet-4-5-20251015"   },
  OPUS:    { provider: "anthropic", model: "claude-opus-4-7-20250930"     },
  GPT5:    { provider: "openai",    model: "gpt-5"                        },
  GEMINI:  { provider: "google",    model: "gemini-1.5-pro-002"           },
  // Groq LPUs — 18× inference throughput vs GPU. Use for sub-300ms quick reply,
  // tool-call dispatch, and the optional Gemma-4 pre-classifier.
  GROQ_LLAMA: { provider: "groq", model: "llama-3.3-70b-versatile" },
  GROQ_GEMMA: { provider: "groq", model: "gemma2-9b-it"           },
  // Ollama local inference — air-gapped Privacy lane + offline path.
  OLLAMA_QWEN:  { provider: "ollama", model: "qwen2.5:7b"  },
  OLLAMA_LLAMA: { provider: "ollama", model: "llama3.2:3b" },
  // v6.0.2 — six new providers + Grok-as-trilane-leg
  GROK:         { provider: "xai",      model: "grok-2"                          },
  GROK_MINI:    { provider: "xai",      model: "grok-2-mini"                     },
  CEREBRAS:     { provider: "cerebras", model: "llama-3.3-70b"                   },
  DEEPSEEK:     { provider: "deepseek", model: "deepseek-chat"                   },
  DEEPSEEK_R:   { provider: "deepseek", model: "deepseek-reasoner"               },
  MISTRAL_CODE: { provider: "mistral",  model: "codestral-latest"                },
  MISTRAL_LRG:  { provider: "mistral",  model: "mistral-large-latest"            },
  TOGETHER:     { provider: "together", model: "meta-llama/Llama-4-70b-instruct" },
  KIMI:         { provider: "kimi",     model: "moonshot-v1-128k"                },
  // Gemini CLI mode (operator preference for ideas/solutions — uses google CLI path
  // when GEMINI_API_KEY missing but `gemini` CLI is in PATH; otherwise same as GEMINI)
  GEMINI_CLI:   { provider: "google",   model: "gemini-1.5-pro-002", _mode: "cli" },
};

// ─── Budget modes ────────────────────────────────────────────────────────────
//
// strict:   prefer Haiku wherever feasible; cap Sonnet; avoid Opus unless
//           task demands it
// balanced: Haiku for trivial, Sonnet for code, Opus only for architecture
// quality:  prefer Sonnet for most tasks; escalate to Opus liberally

const BUDGET_MODES = new Set(["strict", "balanced", "quality"]);

function resolveBudgetMode() {
  const env = (process.env.ORANGEBOX_BUDGET_MODE || "balanced").toLowerCase();
  return BUDGET_MODES.has(env) ? env : "balanced";
}

// ─── Cost estimate (returns cents as a float) ────────────────────────────────

function estimateCostCents(providerKey, modelKey, inputTokens, outputTokens) {
  const pricingKey = `${providerKey}:${modelKey}`;
  // Normalize model ID to pricing table key (strip date suffix for lookup)
  let entry = PRICING[pricingKey];
  if (!entry) {
    // Try stripping date suffix from model ID (e.g. "claude-haiku-4-5-20251001" → "claude-haiku-4-5")
    for (const [k, v] of Object.entries(PRICING)) {
      const [prov, mod] = k.split(":");
      if (prov === providerKey && modelKey.startsWith(mod)) {
        entry = v;
        break;
      }
    }
  }
  if (!entry) return null; // unknown model — caller handles gracefully

  const inputCostDollars  = (inputTokens  / 1_000_000) * entry.inputPerMTok;
  const outputCostDollars = (outputTokens / 1_000_000) * entry.outputPerMTok;
  // Convert to cents, round to 4 decimals
  return Math.round((inputCostDollars + outputCostDollars) * 100 * 10_000) / 10_000;
}

// ─── Feature flags supported by this router ─────────────────────────────────

const FEATURES = {
  PROMPT_CACHING: "prompt_caching",   // Anthropic cache_control breakpoints
  CITATIONS:      "citations_api",    // Anthropic Citations API (grounded refs)
  STREAMING:      "streaming",        // SSE streaming
  TRILANE:        "trilane",          // all-three-model debate
};

// ─── Adaptive thinking config builder ────────────────────────────────────────
//
// Anthropic Opus 4.7 ONLY supports thinking: {type: "adaptive"}.
// Sending thinking: {type: "enabled", budget_tokens: N} returns HTTP 400.
// Effort parameter gives the model a soft hint on how much to think.
//
// Budget mode → effort mapping:
//   strict   → "low"
//   balanced → "medium"
//   quality  → "high"
//
// Special overrides (applied per task):
//   architecture @ quality, model=Opus 4.7 → "xhigh"
//   synthesis    @ quality                 → "max"
//
// Haiku 4.5 (autocomplete, voice_intent): thinking disabled; display omitted
// for lowest possible streaming latency.

const EFFORT_MAP = {
  strict:   "low",
  balanced: "medium",
  quality:  "high",
};

/**
 * buildThinkingConfig(provider, model, task, budgetMode)
 *
 * Returns { thinking, effort, output_config } to merge into the routing decision.
 * Non-Anthropic providers: all fields null (they have their own reasoning APIs).
 */
function buildThinkingConfig(provider, model, task, budgetMode) {
  if (provider !== "anthropic") {
    return { thinking: null, effort: null, output_config: null };
  }

  const isHaiku = model.startsWith("claude-haiku");
  const isOpus  = model.startsWith("claude-opus");

  // Haiku: fastest path — disable thinking, omit display
  if (isHaiku) {
    return {
      thinking: { type: "disabled" },
      effort:   null,
      output_config: { thinking: { display: "omitted" } },
    };
  }

  // All other Anthropic models: adaptive thinking
  let effort = EFFORT_MAP[budgetMode] || "medium";

  // Task-specific effort escalations
  if (task === "architecture" && budgetMode === "quality" && isOpus) {
    effort = "xhigh";
  }
  if (task === "synthesis" && budgetMode === "quality") {
    effort = "max";
  }

  return {
    thinking: { type: "adaptive" },
    effort,
    output_config: { effort },
  };
}

// ─── Advisor tool wiring ──────────────────────────────────────────────────────
//
// When executor is Sonnet and task is one of the IDE code tasks at balanced/quality
// budget, attach Opus 4.7 as server-side advisor. Architecture@quality keeps Opus
// as executor and skips advisor (executor IS the top model).
//
// Trigger conditions:
//   task in ["inline_edit", "multi_file_edit", "pr_review"]
//   AND budgetMode in ["balanced", "quality"]
//
// Advisor doctrine block is pasted verbatim from Anthropic docs (section 4).

const ADVISOR_DOCTRINE = `<advisor-doctrine>
You have access to an advisor tool backed by a stronger reviewer model. It takes NO parameters — when you call advisor(), your entire conversation history is automatically forwarded.

Call advisor BEFORE substantive work — before writing, before committing to an interpretation, before building on an assumption. Orientation (finding files, fetching sources, reading what's there) is not substantive work. Writing, editing, and declaring an answer are.

Also call advisor:
- When you believe the task is complete (BEFORE this call, make your deliverable durable: write the file, save the result).
- When stuck — errors recurring, approach not converging.
- When considering a change of approach.

Give the advice serious weight. If you follow a step and it fails empirically, or you have primary-source evidence that contradicts it, adapt. A passing self-test is not evidence the advice is wrong.
</advisor-doctrine>`;

const ADVISOR_TASKS    = new Set(["inline_edit", "multi_file_edit", "pr_review"]);
const ADVISOR_BUDGETS  = new Set(["balanced", "quality"]);

/**
 * buildAdvisorWiring(task, budgetMode, selectedModel)
 *
 * Returns advisor sub-object if wiring applies, null otherwise.
 * Caller merges into routing decision.
 */
function buildAdvisorWiring(task, budgetMode, selectedModel) {
  if (!ADVISOR_TASKS.has(task) || !ADVISOR_BUDGETS.has(budgetMode)) {
    return null;
  }
  // Architecture@quality keeps Opus as executor — no advisor needed
  if (task === "architecture" && budgetMode === "quality") {
    return null;
  }

  return {
    executor:      selectedModel,          // Sonnet 4.5 (caller's primary model)
    advisor_model: MODELS.OPUS.model,
    beta_headers:  ["advisor-tool-2026-03-01"],
    tools_prepend: [
      {
        type:     "advisor_20260301",
        name:     "advisor",
        model:    MODELS.OPUS.model,
        caching:  { type: "ephemeral", ttl: "5m" },
        max_uses: 5,
      },
    ],
    system_prepend: ADVISOR_DOCTRINE,
    user_prepend:   "(Advisor: please keep your guidance under 80 words — I need a focused starting point, not a comprehensive plan.)\n\n",
  };
}

// ─── Multi-breakpoint cache strategy ─────────────────────────────────────────
//
// "auto"  — caller uses a single top-level cache_control; fine for shallow turns
// "multi" — caller places up to 4 breakpoints:
//             (1) tool definitions
//             (2) system prompt
//             (3) memory tool result
//             (4) last user message
//
// Applied when task in ["chat", "synthesis"] and conversationTurns > 10.

const MULTI_BREAKPOINT_TASKS = new Set(["chat", "synthesis"]);

function resolveBreakpointStrategy(task, conversationTurns) {
  if (
    MULTI_BREAKPOINT_TASKS.has(task) &&
    typeof conversationTurns === "number" &&
    conversationTurns > 10
  ) {
    return "multi";
  }
  return "auto";
}

// ─── Task routing table ──────────────────────────────────────────────────────
//
// Each entry: default model selection per budget mode, typical token budgets,
// active features, and a short reasoning string.

const TASK_TABLE = {
  /**
   * autocomplete — tab-completion in Monaco editor.
   * Must be sub-100ms perceived latency. Haiku 4.5 is the only Anthropic model
   * fast enough for inline streaming. Input is prefix context (~80 tokens),
   * output is 1-3 lines (~40 tokens). Quality mode stays on Haiku — speed
   * matters more than depth for autocomplete.
   * Thinking: disabled + display omitted for fastest token-out.
   */
  autocomplete: {
    strict:   MODELS.HAIKU,
    balanced: MODELS.HAIKU,
    quality:  MODELS.HAIKU,
    inputTokens:  80,
    outputTokens: 40,
    features: [FEATURES.STREAMING],
    reasoning: "Autocomplete requires sub-100ms latency; Haiku 4.5 is the only model fast enough for inline streaming. All budget modes use Haiku — latency beats depth here. Thinking disabled + display omitted for fastest token-out.",
    fallbacks: [
      { ...MODELS.SONNET, note: "Haiku quota exhausted — Sonnet at higher cost, expect latency increase" },
    ],
  },

  /**
   * inline_edit — single-file AI edit from Monaco editor.
   * Requires good code reasoning and diff awareness. Medium context (~800 tokens),
   * medium output (~600 tokens). Sonnet is the right tier. Strict mode stays
   * Sonnet because Haiku produces too many code errors on edit tasks.
   * Advisor wiring: balanced/quality → Sonnet executor + Opus 4.7 advisor.
   */
  inline_edit: {
    strict:   MODELS.SONNET,
    balanced: MODELS.SONNET,
    quality:  MODELS.SONNET,
    inputTokens:  800,
    outputTokens: 600,
    features: [FEATURES.STREAMING],
    reasoning: "Inline edits need reliable code reasoning and accurate diff generation. Sonnet 4.5 is the minimum viable tier; Haiku makes too many edit errors on non-trivial code. Balanced/quality budget: Sonnet executor + Opus 4.7 advisor via advisor-tool beta.",
    fallbacks: [
      { ...MODELS.HAIKU,  note: "Sonnet quota exhausted — Haiku fallback; expect edit quality drop" },
      { ...MODELS.GPT5,   note: "Anthropic API down — route to OpenAI GPT-5" },
    ],
  },

  /**
   * multi_file_edit — Composer-style multi-file refactor.
   * Large context (multiple files). Prompt caching critical to hold cost.
   * Sonnet 4.5 + caching is the sweet spot. Quality mode may escalate to Opus.
   * Advisor wiring: balanced/quality → Sonnet executor + Opus 4.7 advisor.
   */
  multi_file_edit: {
    strict:   MODELS.SONNET,
    balanced: MODELS.SONNET,
    quality:  MODELS.OPUS,
    inputTokens:  12_000,
    outputTokens: 4_000,
    features: [FEATURES.PROMPT_CACHING, FEATURES.STREAMING],
    reasoning: "Multi-file edits carry large context. Prompt caching amortizes cost across turns. Sonnet 4.5 in balanced mode; Opus 4.7 in quality mode for highest reasoning depth. Balanced: Sonnet executor + Opus 4.7 advisor via advisor-tool beta.",
    fallbacks: [
      { ...MODELS.SONNET, note: "Quality mode Opus fallback — Sonnet if Opus quota exhausted" },
      { ...MODELS.GPT5,   note: "Anthropic API down — route to GPT-5 (no caching benefit)" },
    ],
  },

  /**
   * architecture — design decisions, system design, tradeoff analysis.
   * Heaviest task type. Requires deep reasoning. Opus 4.7 preferred; GPT-5
   * accepted as peer. Strict mode uses Sonnet to cap cost — operator accepts
   * lower depth. Budget ceiling check applied before Opus.
   * Effort: quality → "xhigh" on Opus 4.7. No advisor (executor IS top model).
   */
  architecture: {
    strict:   MODELS.SONNET,
    balanced: MODELS.OPUS,
    quality:  MODELS.OPUS,
    inputTokens:  8_000,
    outputTokens: 4_000,
    features: [FEATURES.PROMPT_CACHING],
    reasoning: "Architecture tasks demand the deepest available reasoning. Opus 4.7 in balanced/quality mode. Strict mode falls to Sonnet to cap cost — operator accepts reduced depth trade-off. Quality mode on Opus 4.7 uses effort: xhigh for extended exploration. No advisor — executor is already the top model.",
    fallbacks: [
      { ...MODELS.GPT5,    note: "Opus quota exhausted — GPT-5 is a peer-tier alternative for architecture" },
      { ...MODELS.SONNET,  note: "Both Opus and GPT-5 unavailable — Sonnet as degraded fallback" },
    ],
  },

  /**
   * pr_review — GitHub PR review with repo context.
   * Needs grounded citations to point at specific file/line evidence.
   * Citations API turns every finding into a verifiable claim. Sonnet 4.5
   * is the right cost/quality tier. All modes use Sonnet.
   * Advisor wiring: balanced/quality → Sonnet executor + Opus 4.7 advisor.
   */
  pr_review: {
    strict:   MODELS.SONNET,
    balanced: MODELS.SONNET,
    quality:  MODELS.SONNET,
    inputTokens:  15_000,
    outputTokens: 3_000,
    features: [FEATURES.PROMPT_CACHING, FEATURES.CITATIONS],
    reasoning: "PR review must cite specific code locations as grounded evidence. Citations API is mandatory. Sonnet 4.5 covers the reasoning depth needed; Opus adds cost with diminishing PR-specific return. Balanced/quality: Sonnet executor + Opus 4.7 advisor via advisor-tool beta.",
    fallbacks: [
      { ...MODELS.OPUS,   note: "Sonnet quota exhausted — Opus fallback at 5x cost" },
      { ...MODELS.GPT5,   note: "Anthropic API down — GPT-5 without Citations API (grounding degrades)" },
    ],
  },

  /**
   * chat — general conversational turn in the cockpit.
   * Variable context. Sonnet is the right default — Haiku feels thin for
   * substantive exchanges. Strict mode drops to Haiku.
   * Multi-breakpoint: applied when conversationTurns > 10.
   */
  chat: {
    strict:   MODELS.HAIKU,
    balanced: MODELS.SONNET,
    quality:  MODELS.SONNET,
    inputTokens:  2_000,
    outputTokens: 1_000,
    features: [FEATURES.STREAMING],
    reasoning: "General chat benefits from Sonnet's reasoning depth for substantive operator exchanges. Strict mode uses Haiku to minimize cost on lightweight interactions. Multi-breakpoint cache strategy applied at >10 conversation turns.",
    fallbacks: [
      { ...MODELS.HAIKU,  note: "Sonnet quota exhausted — Haiku fallback at lower depth" },
      { ...MODELS.GPT5,   note: "Anthropic API down — GPT-5 for chat" },
    ],
  },

  /**
   * synthesis — trilane formal debate (Claude + GPT + Gemini).
   * All three models run. Authority order: GPT-5 architect > Gemini consigliere
   * > Claude Sonnet compiler. Caller orchestrates debate; router returns all
   * three legs. Budget mode affects Claude leg only.
   * Effort: quality → "max". Multi-breakpoint applied at >10 turns.
   */
  synthesis: {
    strict:   MODELS.HAIKU,
    balanced: MODELS.SONNET,
    quality:  MODELS.SONNET,
    inputTokens:  5_000,
    outputTokens: 2_000,
    features: [FEATURES.TRILANE],
    reasoning: "Synthesis fires the trilane: Claude (compiler), GPT-5 (architect, highest authority), Gemini (consigliere). Three independent passes; caller merges with authority order GPT > Gemini > Claude. Quality budget: effort max on Claude leg. Multi-breakpoint cache at >10 turns.",
    fallbacks: [
      // Trilane fallback: if any leg fails, return partial debate with degraded flag
      { provider: "anthropic", model: MODELS.SONNET.model, note: "GPT-5 down — bilateral Claude+Gemini debate" },
    ],
  },

  /**
   * voice_intent — Whisper-local → intent → structured command.
   * Input is a short transcribed phrase (~30 tokens), output is a structured
   * command object (~60 tokens). Haiku is fast enough; Sonnet overkill.
   * Thinking: disabled + display omitted for lowest latency.
   */
  voice_intent: {
    strict:   MODELS.HAIKU,
    balanced: MODELS.HAIKU,
    quality:  MODELS.HAIKU,
    inputTokens:  30,
    outputTokens: 60,
    features: [FEATURES.STREAMING],
    reasoning: "Voice intent input is a short transcription (<30 tokens). Haiku parses intent and returns structured output; all budget modes use Haiku — latency and cost both favor it. Thinking disabled + display omitted.",
    fallbacks: [
      { ...MODELS.SONNET, note: "Haiku quota exhausted — Sonnet fallback at higher cost" },
    ],
  },

  /**
   * vault_query — query the CLC lattice (local knowledge vault).
   * Retrieval-augmented, so context comes from vault docs. Citations API
   * provides sentence-level grounding back to vault sources. Sonnet handles
   * reasoning over retrieved context well.
   */
  vault_query: {
    strict:   MODELS.SONNET,
    balanced: MODELS.SONNET,
    quality:  MODELS.SONNET,
    inputTokens:  6_000,
    outputTokens: 1_500,
    features: [FEATURES.PROMPT_CACHING, FEATURES.CITATIONS],
    reasoning: "Vault queries use the Citations API to ground answers in CLC lattice documents. Sonnet 4.5 at all budget modes — vault retrieval covers the context gap that would justify Opus.",
    fallbacks: [
      { ...MODELS.OPUS,  note: "High-complexity vault query — Opus escalation if Sonnet returns low confidence" },
    ],
  },

  /**
   * quick_reply — sub-300ms first-token chat turns, tool selection, MCP fan-out.
   * Defaults to Groq Llama-3.3 70B Versatile (LPU inference, ~18× GPU throughput).
   * Quality tier still routes here — speed IS the quality bar for this task.
   * Falls through to Haiku 4.5 when Groq quota is exhausted.
   */
  quick_reply: {
    strict:   MODELS.GROQ_LLAMA,
    balanced: MODELS.GROQ_LLAMA,
    quality:  MODELS.GROQ_LLAMA,
    inputTokens:  600,
    outputTokens: 300,
    features: [FEATURES.STREAMING],
    reasoning: "Quick-reply requires sub-300ms first-token. Groq Llama-3.3 70B Versatile on LPU is ~18× faster than GPU-served Llama at comparable quality. All budget modes use Groq — latency is the quality bar. Fallback: Haiku 4.5.",
    fallbacks: [
      { ...MODELS.HAIKU,  note: "Groq quota exhausted — Haiku 4.5 fallback at higher latency" },
      { ...MODELS.SONNET, note: "Both Groq and Haiku unavailable — Sonnet at higher cost" },
    ],
  },

  /**
   * route_dispatch — internal classifier: given a user turn, decide which task
   * type it actually maps to. Cheap, deterministic, fast. Used by the cockpit
   * server to short-circuit task routing before the heavy router runs.
   * Optional layer — opt-in via ORANGEBOX_ROUTE_TIER=gemma.
   */
  route_dispatch: {
    strict:   MODELS.GROQ_GEMMA,
    balanced: MODELS.GROQ_GEMMA,
    quality:  MODELS.GROQ_GEMMA,
    inputTokens:  120,
    outputTokens: 40,
    features: [FEATURES.STREAMING],
    reasoning: "Route-dispatch pre-classifier. Gemma2-9B on Groq LPU returns a task label in ~80ms. Opt-in via ORANGEBOX_ROUTE_TIER=gemma; default cockpit path uses deterministic heuristics.",
    fallbacks: [
      { ...MODELS.HAIKU,  note: "Groq quota exhausted — Haiku fallback at higher cost" },
    ],
  },

  /**
   * offline_chat — local Ollama inference. Used when ORANGEBOX_LOCAL_MODE=1,
   * when network is unreachable, or when Privacy lane is set to "air-gap".
   * Zero cost, zero egress. Quality is lower than Sonnet; explicit trade-off.
   */
  offline_chat: {
    strict:   MODELS.OLLAMA_LLAMA,
    balanced: MODELS.OLLAMA_QWEN,
    quality:  MODELS.OLLAMA_QWEN,
    inputTokens:  1500,
    outputTokens: 600,
    features: [FEATURES.STREAMING],
    reasoning: "Offline chat via local Ollama. Llama3.2-3B at strict (low VRAM), Qwen2.5-7B at balanced/quality. Zero cost, zero egress — Privacy lane air-gap promise. Quality trades against Sonnet for total locality.",
    fallbacks: [
      { ...MODELS.HAIKU,  note: "Local model unreachable — Anthropic Haiku fallback (BREAKS air-gap; caller must consent)" },
    ],
  },

  /**
   * dream — speculative / creative synthesis in the ORANGEBOX dreaming lane.
   * Unstructured generation. Sonnet is the right creative depth. Quality mode
   * stays Sonnet; Opus is overkill for generative dreaming.
   */
  dream: {
    strict:   MODELS.HAIKU,
    balanced: MODELS.SONNET,
    quality:  MODELS.SONNET,
    inputTokens:  1_500,
    outputTokens: 2_000,
    features: [FEATURES.STREAMING],
    reasoning: "Dream lane generates speculative artifacts. Sonnet 4.5 provides the right creative depth in balanced/quality mode. Strict mode uses Haiku to cap cost on non-critical creative output.",
    fallbacks: [
      { ...MODELS.HAIKU,  note: "Sonnet quota exhausted — Haiku fallback; creative depth reduced" },
    ],
  },
};

// Known task types (for validation)
const KNOWN_TASKS = new Set(Object.keys(TASK_TABLE));

// ─── Local-mode override (Privacy lane "air-gap" / Ollama) ───────────────────
//
// When ORANGEBOX_LOCAL_MODE=1 is set, any task that would normally route to a
// remote provider is swapped to its local Ollama equivalent. This is the
// runtime contract behind the Privacy lane's "Air-gap" toggle.
//
// Tasks excluded from auto-swap (still call remote on purpose):
//   - synthesis  (trilane is multi-model by definition)
//   - architecture (no local equivalent of Opus 4.7 reasoning)
//   - pr_review    (Citations API is Anthropic-only)
//
// All other tasks: route → offline_chat semantics (Ollama Qwen/Llama).

const LOCAL_MODE_EXCLUDE = new Set(["synthesis", "architecture", "pr_review"]);

function localModeEnabled() {
  const v = (process.env.ORANGEBOX_LOCAL_MODE || "").toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

function selectLocalEquivalent(task, budgetMode) {
  // Lightweight tasks → smallest local model
  if (task === "autocomplete" || task === "voice_intent" || task === "route_dispatch") {
    return MODELS.OLLAMA_LLAMA;
  }
  // Code edits + vault queries + chat → Qwen2.5-7B (best local code model in tier)
  return budgetMode === "strict" ? MODELS.OLLAMA_LLAMA : MODELS.OLLAMA_QWEN;
}

// ─── Agent Teams advisory (Claude 4.6 parallel orchestration hint) ───────────
//
// When the task is `synthesis` AND the executor is Claude 4.6 (Sonnet/Opus),
// we attach an Agent Teams hint that the caller can use to fire the legs in
// parallel via the Anthropic Agent Teams beta API. Cross-vendor synthesis
// still uses our local fan-out wrapper; this hint only applies to the Claude
// side of the trilane debate.

const AGENT_TEAMS_BETA_HEADER = "agent-teams-2026-04-01";

function buildAgentTeamsAdvisory(task, executorProvider, executorModel) {
  if (task !== "synthesis") return null;
  if (executorProvider !== "anthropic") return null;
  // Only Claude 4.6 family (Sonnet 4.5+ / Opus 4.7+) supports the beta.
  const isModernClaude =
    executorModel.startsWith("claude-sonnet-4") ||
    executorModel.startsWith("claude-opus-4");
  if (!isModernClaude) return null;

  return {
    enabled: true,
    beta_headers: [AGENT_TEAMS_BETA_HEADER],
    parallelism: 3,
    lead_role: "compiler",
    note: "Use anthropic.beta.agent_teams.create() to fan out the synthesis legs in parallel on the Claude side. GPT-5 and Gemini legs remain in the local trilane wrapper.",
  };
}

// ─── Trilane leg builder ─────────────────────────────────────────────────────
//
// v6.0.2 — Quadlane mode adds xAI Grok-2 as a 4th adversarial leg + Gemini-CLI
// as alternative Gemini access. Operator preference: "trilane grok, geminicli,
// opus 4.7 for ideas and solutions ideally" — Opus 4.7 + GPT-5 + Gemini CLI +
// Grok-2 in quadlane.
//
// trilane mode (3-leg, default): Claude Sonnet + GPT-5 + Gemini 1.5 Pro
// quadlane mode (4-leg, opt-in via TRILANE_MODE=quadlane or task=synthesis@quality):
//   Claude Opus 4.7 + GPT-5 + Gemini CLI + Grok-2

function buildTrilaneFallbacks(mode = "trilane") {
  if (mode === "quadlane") {
    return [
      {
        provider: "anthropic",
        model:    MODELS.OPUS.model,
        role:     "compiler-deep",
        authority: 1,
        note: "Claude Opus 4.7 — deep-reasoning compiler leg (operator pref for ideas/solutions)",
      },
      {
        provider: "openai",
        model:    MODELS.GPT5.model,
        role:     "architect",
        authority: 2,
        note: "GPT-5 — architect leg, cross-vendor adversarial",
      },
      {
        provider: "google",
        model:    MODELS.GEMINI_CLI.model,
        role:     "consigliere",
        authority: 3,
        note: "Gemini CLI mode — consigliere leg, falls back to API if CLI unavailable",
        _mode: "cli",
      },
      {
        provider: "xai",
        model:    MODELS.GROK.model,
        role:     "wildcard",
        authority: 4,
        note: "xAI Grok-2 — wildcard leg, real-time data + non-consensus framing",
      },
    ];
  }
  // Default 3-leg trilane (back-compat with v6.0.1)
  return [
    {
      provider: "openai",
      model:    MODELS.GPT5.model,
      role:     "architect",
      authority: 1,
      note: "GPT-5 — highest authority in trilane; architect leg",
    },
    {
      provider: "google",
      model:    MODELS.GEMINI.model,
      role:     "consigliere",
      authority: 2,
      note: "Gemini 1.5 Pro — consigliere leg; critique not decision",
    },
    {
      provider: "anthropic",
      model:    MODELS.SONNET.model,
      role:     "compiler",
      authority: 3,
      note: "Claude Sonnet 4.5 — compiler leg; syntax and implementation lead",
    },
  ];
}

// ─── Core router ─────────────────────────────────────────────────────────────

/**
 * route({ task, hint, budget, prefer, conversationTurns }) → decision object
 *
 * @param {string}  task              - task type from KNOWN_TASKS
 * @param {string}  [hint]            - optional guidance string (informational, not binding)
 * @param {number}  [budget]          - optional max cost ceiling in cents (float)
 * @param {Object}  [prefer]          - optional explicit overrides (any field in decision)
 * @param {number}  [conversationTurns] - optional turn count; used for breakpoint_strategy
 *
 * @returns {Object} {
 *   provider:           string,
 *   model:              string,
 *   reasoning:          string,
 *   costEstimateCents:  number|null,
 *   fallbacks:          Array<{provider, model, note, ...}>,
 *   features:           string[],
 *   budgetMode:         string,
 *   task:               string,
 *   hint:               string|null,
 *   budgetCeilingCents: number|null,
 *   trilane:            Object|null,   // only present for synthesis task
 *   thinking:           Object|null,   // Anthropic-only: {type: "adaptive"|"disabled"}
 *   effort:             string|null,   // "low"|"medium"|"high"|"xhigh"|"max"|null
 *   output_config:      Object|null,   // {effort} or {thinking:{display:"omitted"}}
 *   breakpoint_strategy: string,       // "auto" | "multi"
 *   advisor:            Object|null,   // advisor wiring when applicable
 *   timestamp:          string,
 * }
 */
export function route({ task, hint = null, budget = null, prefer = {}, conversationTurns = null } = {}) {
  const budgetMode = resolveBudgetMode();
  const timestamp  = new Date().toISOString();

  // ── Validate task ──────────────────────────────────────────────────────────
  const normalizedTask = String(task || "").toLowerCase().trim().replace(/[^a-z_]/g, "_");
  if (!KNOWN_TASKS.has(normalizedTask)) {
    return {
      provider:            null,
      model:               null,
      reasoning:           `Unknown task type "${task}". Known tasks: ${[...KNOWN_TASKS].join(", ")}.`,
      costEstimateCents:   null,
      fallbacks:           [],
      features:            [],
      budgetMode,
      task:                normalizedTask,
      hint,
      budgetCeilingCents:  budget,
      trilane:             null,
      thinking:            null,
      effort:              null,
      output_config:       null,
      breakpoint_strategy: "auto",
      advisor:             null,
      timestamp,
      error:               "UNKNOWN_TASK",
    };
  }

  const entry = TASK_TABLE[normalizedTask];

  // ── Select model for this budget mode ─────────────────────────────────────
  let selected = entry[budgetMode] || entry.balanced;

  // ── Local-mode air-gap swap ────────────────────────────────────────────────
  // ORANGEBOX_LOCAL_MODE=1 (Privacy lane) — swap remote → Ollama where viable.
  let _localSwap = null;
  if (localModeEnabled() && !LOCAL_MODE_EXCLUDE.has(normalizedTask)) {
    if (selected.provider !== "ollama") {
      const before = selected.model;
      selected = selectLocalEquivalent(normalizedTask, budgetMode);
      _localSwap = `${before} → ${selected.model} (LOCAL_MODE air-gap)`;
    }
  }

  // ── Budget ceiling guard ───────────────────────────────────────────────────
  // If a ceiling is provided, check whether the selected model's estimated cost
  // exceeds it. If so, walk down to the cheapest viable option.
  let _budgetWarning = null;
  if (budget !== null && typeof budget === "number" && budget > 0) {
    const estimate = estimateCostCents(
      selected.provider,
      selected.model,
      entry.inputTokens,
      entry.outputTokens
    );
    if (estimate !== null && estimate > budget) {
      // Try Haiku as cheapest Anthropic option first
      const haiku = MODELS.HAIKU;
      const haikuEstimate = estimateCostCents(
        haiku.provider,
        haiku.model,
        entry.inputTokens,
        entry.outputTokens
      );
      if (haikuEstimate !== null && haikuEstimate <= budget) {
        selected = {
          ...haiku,
          _budgetDowngrade: true,
          _originalModel: selected.model,
        };
      } else {
        // Even Haiku exceeds budget ceiling — proceed with original selection,
        // surface a budget-exceeded warning. Task cannot be completed within budget.
        _budgetWarning = `[BUDGET EXCEEDED: estimated ${estimate}c for ${selected.model}, even Haiku (${haikuEstimate ?? "unknown"}c) exceeds ceiling of ${budget}c — proceeding with original selection; caller should confirm or abort]`;
      }
    }
  }

  // ── Features for this task ─────────────────────────────────────────────────
  const features = [...(entry.features || [])];

  // Trilane: synthesis task gets multi-leg.
  //
  // v6.0.2 — TRILANE_MODE env switch OR budgetMode==="quality" → quadlane (4 legs).
  // Quadlane adds xAI Grok-2 as wildcard + uses Opus 4.7 instead of Sonnet.
  let trilane = null;
  if (normalizedTask === "synthesis") {
    const triMode = (process.env.TRILANE_MODE || "").toLowerCase() === "quadlane" || budgetMode === "quality"
      ? "quadlane"
      : "trilane";
    const claudeLeg = selected;
    const legs = buildTrilaneFallbacks(triMode).map(leg => {
      if (leg.role === "compiler") {
        return { ...leg, model: claudeLeg.model, provider: claudeLeg.provider };
      }
      const legInputTokens  = entry.inputTokens;
      const legOutputTokens = entry.outputTokens;
      const costCents = estimateCostCents(leg.provider, leg.model, legInputTokens, legOutputTokens);
      return { ...leg, costEstimateCents: costCents };
    });
    trilane = {
      mode: triMode,
      authority_order: triMode === "quadlane"
        ? "Opus 4.7 (compiler-deep) > GPT-5 (architect) > Gemini CLI (consigliere) > Grok-2 (wildcard)"
        : "GPT-5 (architect) > Gemini (consigliere) > Claude (compiler)",
      legs,
      adversarial_mode: (process.env.TRILANE_ADVERSARIAL || "").toLowerCase() === "1",
    };
    selected = { provider: "anthropic", model: triMode === "quadlane" ? MODELS.OPUS.model : MODELS.SONNET.model };
  }

  // ── Cost estimate ──────────────────────────────────────────────────────────
  const costEstimateCents = estimateCostCents(
    selected.provider,
    selected.model,
    entry.inputTokens,
    entry.outputTokens
  );

  // ── Adaptive thinking + effort ─────────────────────────────────────────────
  const thinkingConfig = buildThinkingConfig(
    selected.provider,
    selected.model,
    normalizedTask,
    budgetMode
  );

  // ── Advisor wiring ─────────────────────────────────────────────────────────
  const advisorWiring = buildAdvisorWiring(normalizedTask, budgetMode, selected.model);

  // ── Breakpoint strategy ────────────────────────────────────────────────────
  const breakpoint_strategy = resolveBreakpointStrategy(
    normalizedTask,
    conversationTurns
  );

  // ── Agent Teams advisory ───────────────────────────────────────────────────
  const agentTeams = buildAgentTeamsAdvisory(
    normalizedTask,
    selected.provider,
    selected.model
  );

  // ── Compose reasoning string ───────────────────────────────────────────────
  let reasoning = entry.reasoning;
  if (selected._budgetDowngrade) {
    reasoning = `[BUDGET DOWNGRADE: ${selected._originalModel} → Haiku] ${reasoning}`;
  }
  if (_localSwap) {
    reasoning = `[LOCAL_MODE: ${_localSwap}] ${reasoning}`;
  }
  if (_budgetWarning) {
    reasoning = `${_budgetWarning} ${reasoning}`;
  }
  if (hint) {
    reasoning = `${reasoning} Hint: ${hint}`;
  }

  // ── Apply prefer overrides (caller wins) ───────────────────────────────────
  const preferSafe = prefer && typeof prefer === "object" ? prefer : {};

  // Build fallbacks — include trilane fallbacks if synthesis
  const fallbacks = normalizedTask === "synthesis"
    ? buildTrilaneFallbacks().filter(l => l.role !== "compiler") // architect + consigliere as alternates
    : (entry.fallbacks || []).map(fb => ({ ...fb }));

  // ── Final decision ─────────────────────────────────────────────────────────
  const decision = {
    provider:            preferSafe.provider            ?? selected.provider,
    model:               preferSafe.model               ?? selected.model,
    reasoning:           preferSafe.reasoning           ?? reasoning,
    costEstimateCents:   preferSafe.costEstimateCents   ?? costEstimateCents,
    fallbacks:           preferSafe.fallbacks           ?? fallbacks,
    features:            preferSafe.features            ?? features,
    budgetMode,
    task:                normalizedTask,
    hint,
    budgetCeilingCents:  budget,
    trilane:             normalizedTask === "synthesis" ? (preferSafe.trilane ?? trilane) : null,
    thinking:            preferSafe.thinking            ?? thinkingConfig.thinking,
    effort:              preferSafe.effort              ?? thinkingConfig.effort,
    output_config:       preferSafe.output_config       ?? thinkingConfig.output_config,
    breakpoint_strategy: preferSafe.breakpoint_strategy ?? breakpoint_strategy,
    advisor:             preferSafe.advisor             ?? advisorWiring,
    agent_teams:         preferSafe.agent_teams         ?? agentTeams,
    local_mode:          preferSafe.local_mode          ?? (localModeEnabled() ? { enabled: true, swap: _localSwap } : null),
    timestamp,
  };

  return decision;
}

// ─── Batch router ─────────────────────────────────────────────────────────────

/**
 * routeAll(tasks) → Array of decisions (parallel-safe; each call is synchronous)
 *
 * @param {Array<Object>} tasks - array of { task, hint, budget, prefer, conversationTurns }
 * @returns {Array<Object>}
 */
export function routeAll(tasks) {
  if (!Array.isArray(tasks)) throw new TypeError("routeAll: tasks must be an array");
  return tasks.map(t => route(t));
}

// ─── List available tasks ─────────────────────────────────────────────────────

/**
 * listTasks() → Array of task type strings
 */
export function listTasks() {
  return [...KNOWN_TASKS];
}

// ─── Pricing estimate (standalone helper) ─────────────────────────────────────

/**
 * estimateForTask({ task, budgetMode, inputTokens, outputTokens })
 *
 * Returns a cost estimate in cents for a given task and optional token counts.
 * If inputTokens/outputTokens are not provided, uses the table defaults.
 */
export function estimateForTask({
  task,
  budgetMode = null,
  inputTokens = null,
  outputTokens = null,
} = {}) {
  const mode = budgetMode || resolveBudgetMode();
  const t    = String(task || "").toLowerCase().trim();
  if (!KNOWN_TASKS.has(t)) return null;
  const entry    = TASK_TABLE[t];
  const selected = entry[mode] || entry.balanced;
  const iTok     = inputTokens  ?? entry.inputTokens;
  const oTok     = outputTokens ?? entry.outputTokens;
  return estimateCostCents(selected.provider, selected.model, iTok, oTok);
}

// ─── CLI runner ───────────────────────────────────────────────────────────────
//
// Usage:
//   node scripts/v4/router/smart-model-router.mjs --task=autocomplete
//   node scripts/v4/router/smart-model-router.mjs --task=architecture --budget=5
//   node scripts/v4/router/smart-model-router.mjs --task=synthesis --hint="compare auth strategies"
//   node scripts/v4/router/smart-model-router.mjs --list
//   node scripts/v4/router/smart-model-router.mjs --task=architecture --budget=quality --json
//   node scripts/v4/router/smart-model-router.mjs --task=inline_edit --budget=balanced --json
//   node scripts/v4/router/smart-model-router.mjs --task=chat --conversation-turns=15 --json

function parseCliArgs(argv) {
  const args = {};
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([a-zA-Z_-]+)(?:=(.*))?$/);
    if (m) {
      args[m[1].replace(/-/g, "_")] = m[2] !== undefined ? m[2] : true;
    }
  }
  return args;
}

function printHelp() {
  console.log(`
ORANGEBOX v4 Smart Model Router — CLI (v5.0.1 alpha)
=====================================================

Usage:
  node smart-model-router.mjs --task=<task_type> [options]

Options:
  --task=<type>               Task type (required). See --list for all types.
  --hint=<string>             Optional guidance hint (informational).
  --budget=<cents>            Optional max cost ceiling in cents (float).
  --prefer=<json>             JSON object of override fields (url-safe, wrap in single quotes).
  --conversation-turns=<n>   Turn count for multi-breakpoint strategy (integer).
  --json                      Alias for --json output (always JSON; kept for scripting compat).
  --list                      Print all known task types and exit.
  --help                      Print this help and exit.

Environment:
  ORANGEBOX_BUDGET_MODE   strict | balanced | quality (default: balanced)

Examples:
  node smart-model-router.mjs --task=autocomplete
  node smart-model-router.mjs --task=architecture --budget=50
  node smart-model-router.mjs --task=architecture --budget=quality --json
  node smart-model-router.mjs --task=inline_edit --budget=balanced --json
  node smart-model-router.mjs --task=synthesis --hint="compare auth strategies"
  node smart-model-router.mjs --task=chat --conversation-turns=15 --json
  ORANGEBOX_BUDGET_MODE=quality node smart-model-router.mjs --task=multi_file_edit
`.trim());
}

async function main() {
  const args = parseCliArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.list) {
    const tasks = listTasks();
    console.log(JSON.stringify({ tasks, count: tasks.length }, null, 2));
    process.exit(0);
  }

  const task   = args.task   || null;
  const hint   = args.hint   || null;
  const budget = args.budget ? parseFloat(args.budget) : null;
  const conversationTurns = args.conversation_turns ? parseInt(args.conversation_turns, 10) : null;
  let prefer = {};
  if (args.prefer) {
    try {
      prefer = JSON.parse(args.prefer);
    } catch {
      console.error("ERROR: --prefer must be valid JSON");
      process.exit(1);
    }
  }

  // --budget=quality shorthand: treat non-numeric budget strings as budget mode override
  // (CLI convenience — does not affect the budget ceiling guard, which expects cents)
  if (args.budget && isNaN(budget)) {
    const bm = String(args.budget).toLowerCase();
    if (BUDGET_MODES.has(bm)) {
      process.env.ORANGEBOX_BUDGET_MODE = bm;
    }
  }

  if (!task) {
    console.error("ERROR: --task is required. Use --list to see all task types, or --help for usage.");
    process.exit(1);
  }

  const decision = route({
    task,
    hint,
    budget: isNaN(budget) ? null : budget,
    prefer,
    conversationTurns,
  });
  console.log(JSON.stringify(decision, null, 2));

  // Non-zero exit if unknown task
  if (decision.error) {
    process.exit(1);
  }
}

// Standard ES module main guard — handles Windows path prefix differences.
// Defensive against `node -e` and dynamic-import contexts where argv[1] is undefined.
const selfUrl   = import.meta.url.replace(/\\/g, "/");
const argv1     = (process.argv && process.argv[1]) ? String(process.argv[1]).replace(/\\/g, "/") : "";
const argUrl    = argv1 ? `file:///${argv1}` : "";
const argUrlAlt = argv1 ? `file://${argv1}`  : "";

if (argv1 && (selfUrl === argUrl || selfUrl === argUrlAlt)) {
  main().catch(e => {
    console.error("FATAL:", e.message || e);
    process.exit(1);
  });
}
