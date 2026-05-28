# Alpha Intake - XDK and Claude Code Reliability - 2026-05-27

## Scope

This note captures the 2026-05-27 Alpha intake from:

- X Developer Community post supplied by the operator: `https://devcommunity.x.com/t/announcing-the-python-and-typescript-xdks-for-the-x-api-v2/250860`
- X official docs and GitHub repositories.
- Operator-supplied ClaudeDevs screenshots about Claude Code reliability updates.
- Anthropic Claude Code docs and changelog for corroborating release-note themes.

Boundary: this is a non-visual alpha intake. It does not install the XDK, request X API credentials, mutate host MCP configuration, or call paid/frontier APIs.

## Source Verification

Verified from X official docs:

- X now documents official X API SDKs in Python and TypeScript, plus `xurl`, the API playground, agent resources, XMCP, `llms.txt`, and community libraries.
- TypeScript XDK is documented as the official TypeScript/JavaScript SDK for X API v2 with type safety, automatic pagination, event-driven streaming, and support for multiple auth methods.
- Python XDK is documented as the official Python client library for X API v2 with OAuth, automatic pagination, streaming, and OpenAPI-generated coverage.
- X documents `llms.txt` and `llms-full.txt` for agent-readable docs, including section-specific indexes for the XDKs.
- X maintains public GitHub repos for `xdk-typescript`, `xdk-python`, and `xmcp`.

Primary source URLs:

- `https://docs.x.com/tools-and-libraries`
- `https://docs.x.com/xdks/typescript/overview`
- `https://docs.x.com/xdks/python/overview`
- `https://docs.x.com/tools/llms-txt`
- `https://github.com/xdevplatform/xdk-typescript`
- `https://github.com/xdevplatform/xdk-python`
- `https://github.com/xdevplatform/xmcp`

The supplied forum URL could not be fetched by the automated browser in this run, so the post itself remains an operator-supplied lead. The underlying XDK substance is accepted because X's own docs and official GitHub org corroborate it.

## Accepted

1. XDK replaces raw HTTP as the preferred future X API integration layer.
   ORANGEBOX should prefer the official TypeScript XDK for any first-class X API lane because the control plane is TypeScript/Bun.

2. Python XDK is accepted for analysis notebooks, data science, and offline research scripts.
   It is not the default cockpit integration because it would create a second runtime lane for the same X API surface.

3. X `llms.txt` becomes the correct agent documentation entry point.
   Any future X API coding task should pack the smallest relevant docs page or section index, not an entire web scrape.

4. X API Playground is the preferred test target before real X API calls.
   ORANGEBOX should prove route shape, pagination, and stream handlers against the playground or mocks before using production API credits.

5. XMCP is a real MCP lead, but it starts read-only and behind the existing ORANGEBOX MCP verifier.
   Official does not mean safe. OAuth scope, tool list, rate limits, output caps, and receipts must be proven first.

6. Claude Code reliability updates reduce some operator pain but do not replace ORANGEBOX receipts.
   Compaction, streaming tool-call visibility, better MCP reliability, and clearer errors are useful; deterministic receipts still remain the source of truth.

## Corrected

1. Do not treat X XDK as subscription-native.
   X API usage may involve developer-account access, quotas, paid plans, or credentials. It belongs in a metered/external-data lane unless the operator explicitly configures credentials.

2. Do not install XDK globally or into the product package yet.
   The current alpha step is architecture and proof intake. Implementation waits for a credential policy and a playground-backed smoke.

3. Do not let XMCP bypass the ORANGEBOX MCP gate.
   XMCP is a tool provider, not a trusted authority. Tool discovery and invocation need the same MCP guard as other connectors.

4. Do not treat ClaudeDevs screenshots alone as primary docs.
   The screenshots are high-signal operator evidence. Promotion into policy should be grounded in Anthropic docs/changelog where possible and recorded as screenshot-derived where not.

## Claude Code Alpha Signals

From the operator screenshots:

- Compaction now shows progress and should avoid prior prompt-too-long compaction failures.
- MCP reliability was improved for connection failures, OAuth flows, and proxy rate-limiting.
- Large or unreadable images/media are detected and sessions recover automatically.
- Feedback can include the last day or week of sessions.
- A new full-screen renderer can be toggled with `/tui feedback`.
- Thinking and tool calls stream while Claude works, reducing apparent hangs.
- Errors such as `tool result does not match tool use` are now clearer.

Corroborating Anthropic docs/changelog themes:

- Claude Code docs describe `/compact`, `/context`, MCP disabling, and auto-compaction for prompt-too-long recovery.
- Claude Code docs describe MCP OAuth behavior, output limits, and large MCP output controls.
- Claude Code changelog entries include fixes around `/compact` prompt-too-long behavior, MCP OAuth/header helper flows, terminal flicker/rendering, self-healing stale `rg`, binary/MCP output handling, long-session memory usage, and clearer error surfaces.

## ORANGEBOX Policy Impact

Immediate non-visual changes:

- Add this note as an Alpha source intake.
- Add a no-network `alpha:sources` doctor that proves the source note and docs wiring exist.
- Update the LLM status and process book to record XDK as accepted but not installed.

Future implementation tickets:

1. `alpha-xdk-playground-smoke`
   Build a Bun smoke that uses an X API playground/mock, not production credentials, to prove pagination, rate-limit handling, and streaming parser shape.

2. `alpha-xdk-credential-policy`
   Define where X API credentials live, how scopes are minimized, how OAuth tokens are scrubbed from receipts, and how API usage is rate-capped.

3. `alpha-xmcp-readonly-gate`
   Register XMCP as a candidate MCP connector only after verifier proof: health, tool list, OAuth scope, read-only mode, max output, timeout, and rollback posture.

4. `alpha-claude-context-health`
   Add a Claude Code lane checklist: keep auto-compaction enabled, use `/context`, disable unused MCP servers, cap MCP output, and preserve ORANGEBOX receipts across compaction.

5. `alpha-tool-call-pairing-validator`
   Add a deterministic transcript validator that catches mismatched tool-use/tool-result pairs in local receipts before handoff.

## Current Decision

Accepted for architecture:

- Official XDKs are the preferred future X API integration surface.
- X `llms.txt` is the preferred docs-entry surface for agents.
- Claude Code reliability improvements should simplify operator workflow.

Held from installation:

- `@xdevplatform/xdk`
- Python `xdk`
- XMCP host registration
- Any production X API call

Done condition for this intake:

- This note exists.
- The status and process docs reference it.
- `npm.cmd run alpha:sources` passes and emits a receipt.
