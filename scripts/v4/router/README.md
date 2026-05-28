# ORANGEBOX v4 Smart Model Router

**File:** `scripts/v4/router/smart-model-router.mjs`  
**Phase slot:** v3.8 (P1 gap plug)  
**Doctrine anchor:** `docs/V4_MOAT_DOCTRINE.md` (ATOM-OBX-V4-MOAT-2026-0516)

Routes tasks to the right model based on task type, budget mode, and optional overrides.
Zero dependencies. Pure ES module. Node 18+ required.

---

## Exported API

```js
import { route, routeAll, listTasks, estimateForTask } from './smart-model-router.mjs';
```

### `route({ task, hint, budget, prefer })`

Returns a routing decision.

| Param   | Type     | Required | Description |
|---------|----------|----------|-------------|
| task    | string   | yes      | Task type — see table below |
| hint    | string   | no       | Guidance string (informational, appended to reasoning) |
| budget  | number   | no       | Max cost ceiling in cents; triggers downgrade if exceeded |
| prefer  | object   | no       | Override any field in the returned decision |

**Returns:**

```json
{
  "provider":           "anthropic",
  "model":              "claude-sonnet-4-5-20251015",
  "reasoning":          "...",
  "costEstimateCents":  0.0726,
  "fallbacks":          [...],
  "features":           ["streaming"],
  "budgetMode":         "balanced",
  "task":               "chat",
  "hint":               null,
  "budgetCeilingCents": null,
  "trilane":            null,
  "timestamp":          "2026-05-16T00:00:00.000Z"
}
```

For `synthesis` tasks, `trilane` is populated with all three legs.

---

## Known task types

| Task           | Default model (balanced) | Key features |
|----------------|--------------------------|--------------|
| autocomplete   | Haiku 4.5                | streaming |
| inline_edit    | Sonnet 4.5               | streaming |
| multi_file_edit| Sonnet 4.5               | prompt_caching, streaming |
| architecture   | Opus 4.7                 | prompt_caching |
| pr_review      | Sonnet 4.5               | prompt_caching, citations_api |
| chat           | Sonnet 4.5               | streaming |
| synthesis      | trilane (all 3)          | trilane |
| voice_intent   | Haiku 4.5                | streaming |
| vault_query    | Sonnet 4.5               | prompt_caching, citations_api |
| dream          | Sonnet 4.5               | streaming |

---

## Budget modes

Set via `ORANGEBOX_BUDGET_MODE` environment variable.

| Mode     | Behavior |
|----------|----------|
| strict   | Haiku wherever feasible; Sonnet capped; Opus avoided |
| balanced | Haiku for trivial, Sonnet for code, Opus for architecture (default) |
| quality  | Sonnet for most tasks; Opus escalated liberally |

---

## Usage examples

### Example 1 — autocomplete (tab completion in Monaco editor)

```bash
node scripts/v4/router/smart-model-router.mjs --task=autocomplete
```

Expected output:
```json
{
  "provider": "anthropic",
  "model": "claude-haiku-4-5-20251001",
  "reasoning": "Autocomplete requires sub-100ms latency; Haiku 4.5 is the only model fast enough for inline streaming. All budget modes use Haiku — latency beats depth here.",
  "costEstimateCents": 0.0002,
  "fallbacks": [
    {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20251015",
      "note": "Haiku quota exhausted — Sonnet at higher cost, expect latency increase"
    }
  ],
  "features": ["streaming"],
  "budgetMode": "balanced",
  "task": "autocomplete",
  "hint": null,
  "budgetCeilingCents": null,
  "trilane": null
}
```

### Example 2 — architecture (heaviest reasoning, with budget ceiling)

```bash
ORANGEBOX_BUDGET_MODE=quality node scripts/v4/router/smart-model-router.mjs --task=architecture --hint="microservices vs monolith for Codexa worker rail"
```

Expected output:
```json
{
  "provider": "anthropic",
  "model": "claude-opus-4-7-20250930",
  "reasoning": "Architecture tasks demand the deepest available reasoning. Opus 4.7 in balanced/quality mode. Strict mode falls to Sonnet to cap cost — operator accepts reduced depth trade-off. Hint: microservices vs monolith for Codexa worker rail",
  "costEstimateCents": 42.0,
  "fallbacks": [
    {
      "provider": "openai",
      "model": "gpt-5",
      "note": "Opus quota exhausted — GPT-5 is a peer-tier alternative for architecture"
    },
    {
      "provider": "anthropic",
      "model": "claude-sonnet-4-5-20251015",
      "note": "Both Opus and GPT-5 unavailable — Sonnet as degraded fallback"
    }
  ],
  "features": ["prompt_caching"],
  "budgetMode": "quality",
  "task": "architecture"
}
```

With a budget ceiling that forces a downgrade:

```bash
node scripts/v4/router/smart-model-router.mjs --task=architecture --budget=0.5
```

Routing will downgrade from Opus to Haiku when estimated Opus cost exceeds the 0.5-cent ceiling.

### Example 3 — synthesis (trilane: Claude + GPT-5 + Gemini)

```bash
node scripts/v4/router/smart-model-router.mjs --task=synthesis --hint="should ORANGEBOX ship a JetBrains plugin for v4?"
```

Expected output:
```json
{
  "provider": "anthropic",
  "model": "claude-sonnet-4-5-20251015",
  "reasoning": "Synthesis fires the trilane: Claude (compiler), GPT-5 (architect, highest authority), Gemini (consigliere). Three independent passes; caller merges with authority order GPT > Gemini > Claude. Hint: should ORANGEBOX ship a JetBrains plugin for v4?",
  "costEstimateCents": 0.1125,
  "fallbacks": [
    {
      "provider": "openai",
      "model": "gpt-5",
      "role": "architect",
      "authority": 1,
      "note": "GPT-5 — highest authority in trilane; architect leg"
    },
    {
      "provider": "google",
      "model": "gemini-1.5-pro-002",
      "role": "consigliere",
      "authority": 2,
      "note": "Gemini 1.5 Pro — consigliere leg; critique not decision"
    }
  ],
  "features": ["trilane"],
  "trilane": {
    "authority_order": "GPT-5 (architect) > Gemini (consigliere) > Claude (compiler)",
    "legs": [
      { "provider": "openai",    "model": "gpt-5",                   "role": "architect",    "authority": 1 },
      { "provider": "google",    "model": "gemini-1.5-pro-002",       "role": "consigliere",  "authority": 2 },
      { "provider": "anthropic", "model": "claude-sonnet-4-5-20251015","role": "compiler",    "authority": 3 }
    ]
  },
  "task": "synthesis"
}
```

---

## Programmatic usage

```js
import { route, routeAll, listTasks, estimateForTask } from './smart-model-router.mjs';

// Single task
const decision = route({ task: 'inline_edit' });
console.log(decision.provider, decision.model);

// Batch (useful for pre-flight cost estimation)
const batch = routeAll([
  { task: 'autocomplete' },
  { task: 'architecture', budget: 20 },
  { task: 'pr_review', hint: 'security-focused review' },
]);

// Estimate cost without full routing
const cents = estimateForTask({ task: 'multi_file_edit', budgetMode: 'quality' });

// List all task types
console.log(listTasks());
```

---

## Prefer overrides

```js
// Force a specific model regardless of budget mode or task defaults
const decision = route({
  task: 'chat',
  prefer: {
    provider: 'openai',
    model: 'gpt-5',
    reasoning: 'Operator prefers GPT-5 for this session',
  },
});
```

---

## Environment variables

| Variable               | Values                       | Default  |
|------------------------|------------------------------|----------|
| ORANGEBOX_BUDGET_MODE  | strict / balanced / quality  | balanced |

---

## Pricing reference (2026 best-known estimates)

Prices are coded as constants in `smart-model-router.mjs`. Verify current rates
at console.anthropic.com/pricing and platform.openai.com/docs/pricing before
integrating into billing logic.

| Model             | Input $/MTok | Output $/MTok |
|-------------------|-------------|---------------|
| Haiku 4.5         | $1.00       | $5.00         |
| Sonnet 4.5        | $3.00       | $15.00        |
| Opus 4.7          | $15.00      | $75.00        |
| GPT-5             | $10.00      | $30.00        |
| Gemini 1.5 Pro    | $3.50       | $10.50        |

---

## CLI reference

```
node smart-model-router.mjs --task=<type>     Route a task and print JSON decision
node smart-model-router.mjs --task=<type> --budget=<cents>  With budget ceiling
node smart-model-router.mjs --task=<type> --hint=<string>   With hint appended to reasoning
node smart-model-router.mjs --list            Print all known task types
node smart-model-router.mjs --help            Print usage
```

---

## Fallback behavior

Every routing decision includes a `fallbacks` array. Callers should attempt the
primary `{ provider, model }` first, then walk the fallbacks in order on:

- HTTP 429 (quota exceeded)
- HTTP 5xx (provider error)
- Network timeout after configured threshold
- Provider API down (health-check failure)

The router does not perform retries — it provides the priority list; the caller
owns retry logic.

---

## Receipts

This router emits no side effects. Callers are responsible for logging the
routing decision as a receipt row (per ORANGEBOX receipt law):
`result · evidence · blockers · next-action · touched-files · commands · tests · proof-paths · assumptions · residual-risk · rollback-path`
