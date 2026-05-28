# privacy-audit.mjs — ORANGEBOX v4 Privacy Audit Engine

**Version:** 4.0.0
**Location:** `scripts/v4/privacy-audit.mjs`
**Node:** 18+ (uses native `fetch`, `crypto`, `http`)

---

## What it does

Every outbound API call the ORANGEBOX cockpit makes gets a row in `egress.jsonl`.
The dashboard reads from this log and displays it in real time.
The moat claim — "your code stays on your machine" — is verifiable here.

---

## Data root

Rows are written to:

```
<ORANGEBOX_DATA_ROOT>/privacy/egress.jsonl
```

Default data root (Windows):

```
%APPDATA%\com.atomeons.orangebox.command\
```

Override with env var `ORANGEBOX_DATA_ROOT`.

---

## Egress row schema

Every row is a JSON object on one line:

```json
{
  "ts":            "2026-05-16T14:22:01.234Z",
  "provider":      "anthropic",
  "endpoint":      "https://api.anthropic.com/v1/messages",
  "model":         "claude-opus-4-7-20250930",
  "inputTokens":   1240,
  "outputTokens":  380,
  "cached":        true,
  "costCents":     0.0184,
  "callerScript":  "scripts/orangebox-claude-bridge.mjs",
  "prompt_hash":   "sha256 of input (NOT the input itself)",
  "response_hash": "sha256 of response",
  "air_gap_violation": true
}
```

`prompt_hash` and `response_hash` are always SHA-256 hex.
`air_gap_violation` is only present (and `true`) when a call was attempted while air-gap was active.

Plaintext fields (`prompt_text`, `response_text`) are **never written** unless the operator explicitly enables
debug logging via the dashboard toggle or `--plaintext-logging-on` flag.

---

## CLI usage

```bash
# Summary — totals by provider, total cost
node scripts/v4/privacy-audit.mjs --summary --since=24h

# Detail — every call in time window
node scripts/v4/privacy-audit.mjs --detail --since=7d

# Serve — local JSON API for the dashboard (auto-refresh)
node scripts/v4/privacy-audit.mjs --serve --port=8782

# Status — check air-gap + plaintext flag states
node scripts/v4/privacy-audit.mjs --status

# Air-gap controls
node scripts/v4/privacy-audit.mjs --air-gap-on
node scripts/v4/privacy-audit.mjs --air-gap-off
```

`--since` values: `1h`, `24h`, `7d`, `30d`, `2h`, etc.

---

## HTTP API (--serve)

All routes return JSON. CORS is open for localhost dashboard use.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/privacy/egress?since=24h` | Array of egress rows |
| GET | `/privacy/summary?since=24h` | Aggregate totals by provider |
| GET | `/privacy/status` | Air-gap flag, plaintext flag, version |
| GET | `/privacy/export?since=30d` | NDJSON download (Content-Disposition) |
| GET | `/privacy/test-egress` | Writes a tagged test row; verifies pipeline |
| POST | `/privacy/air-gap` | Body: `{"enabled": bool}` |
| POST | `/privacy/plaintext-logging` | Body: `{"enabled": bool}` |
| POST | `/privacy/revoke-key` | Body: `{"provider": "anthropic"}` — deletes key file |

---

## Importing the logger in other scripts

```js
import { recordEgress } from "./v4/privacy-audit.mjs";

// After your API call completes:
await recordEgress({
  provider:     "anthropic",
  endpoint:     "https://api.anthropic.com/v1/messages",
  model:        "claude-opus-4-7-20250930",
  inputTokens:  usage.input_tokens,
  outputTokens: usage.output_tokens,
  cached:       usage.cache_read_input_tokens > 0,
  costCents:    computedCostCents,
  callerScript: import.meta.url,
  promptText:   thePromptString,   // hashed only; plaintext only stored if debug flag on
  responseText: rawResponseText,   // same
});
```

`recordEgress` never throws. If the file write fails, the error is silently swallowed —
never let logging break a query.

---

## Privacy guarantees enforced at write time

1. `prompt_text` / `response_text` only appear in the row if `isPlaintextLoggingEnabled()` returns true.
2. If air-gap is active and a call is logged, `air_gap_violation: true` is added to the row.
3. Vault contents never enter the egress log — only the caller script path.
4. The log file lives entirely on the local machine in the operator's data root.

---

## Integration with orangebox-claude-bridge.mjs

`orangebox-claude-bridge.mjs` already writes to `memory/claude-bridge-metrics.jsonl`.
To hook `recordEgress` in, add at the end of the `callClaude` function after the
existing metrics append:

```js
import { recordEgress } from "./v4/privacy-audit.mjs";

// inside callClaude, after `const actual_cost = ...`
await recordEgress({
  provider:     "anthropic",
  endpoint:     "https://api.anthropic.com/v1/messages",
  model,
  inputTokens,
  outputTokens,
  cached:       cacheRead > 0,
  costCents:    actual_cost * 100,
  callerScript: String(import.meta.url),
  promptText:   prompt,
  responseText: data?.content?.[0]?.text || "",
});
```

---

## Config files written

| File | Purpose |
|------|---------|
| `<data_root>/privacy/egress.jsonl` | Append-only egress log |
| `<data_root>/config/air-gap.json` | Air-gap state (`{enabled, ts}`) |
| `<data_root>/config/plaintext-logging.json` | Plaintext flag + session key |

---

## Unresolved risk / followups

- **Bridge integration**: `orangebox-claude-bridge.mjs` needs the `recordEgress` call added manually (see above). This file is a library not owned by the privacy dashboard.
- **Other callers**: `orangebox-command-server.mjs`, `orangebox-mcp-server.mjs`, and Codexa scripts make outbound calls and do not yet import `recordEgress`. Each must be instrumented separately.
- **Token count for non-Anthropic providers**: OpenAI and Google return token counts in different shapes. Callers should normalize before passing to `recordEgress`.
- **Log rotation**: `egress.jsonl` grows unbounded. A rotation / truncation pass for entries older than 90 days is recommended before v4.0 ship.
- **Test coverage**: Unit tests for `recordEgress`, `loadEgress`, and the HTTP routes are not yet written.
