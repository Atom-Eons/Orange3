# ORANGEBOX MCP Bridge + Verifier

Status: v0.1 implemented.

The MCP bridge is ORANGEBOX's own registry and verification layer for external MCP servers. It does not mutate the host Claude Code/Cursor MCP config, does not install packages by itself, and does not enable write-capable tools by default.

## Operating Law

Official does not mean safe.

Every MCP begins as read-only metadata until ORANGEBOX proves:

- endpoint health or local command metadata
- tool-list availability
- auth posture
- auth spec version
- permission mode
- receipt logging
- rollback/disable path

Write-capable MCPs require operator confirmation and a receipt before promotion.

## Built-In Candidates

The bridge ships candidate registrations for:

- Meta Ads MCP
- TikTok Ads MCP
- Google Ads MCP
- Pipeboard Meta/Google/TikTok/Snap/Reddit Ads MCP endpoints
- Firecrawl MCP
- Claude Flow
- Repomix MCP
- StackGen MCP

StackGen stays `verification_required`. Stdio/package-backed entries are metadata-only until the operator approves dependency installation or spawn probing.

## Routes

`GET /api/v4/mcp/servers`

Lists built-in and custom servers with last probe evidence.

`GET /api/v4/mcp/doctor`

Runs the MCP bridge doctor. It uses a temporary local mock MCP server to prove HTTP registration, health probing, JSON-RPC `tools/list`, read-only/write-confirmation posture, metadata-only stdio behavior, and disable overrides. It does not install packages, mutate host MCP config, or call paid APIs. Add `?receipt=1` to write a proof receipt.

`POST /api/v4/mcp/register`

Registers a custom HTTP or stdio MCP entry in `<dataRoot>/mcp/bridge-servers.json`.

`POST /api/v4/mcp/probe/:server_id`

For HTTP MCP entries, probes endpoint health and attempts a JSON-RPC `tools/list`. For stdio entries, records metadata-only proof and refuses to spawn packages without approval.

`GET /api/v4/mcp/tools/:server_id`

Returns the last observed tool list from probe evidence.

`POST /api/v4/mcp/disable/:server_id`

Writes an operator-controlled registry override that disables a server.

## CLI

```powershell
node C:\AtomEons\orangebox\scripts\obx.mjs mcp servers
node C:\AtomEons\orangebox\scripts\obx.mjs mcp probe meta-ads-mcp
node C:\AtomEons\orangebox\scripts\obx.mjs mcp tools meta-ads-mcp
node C:\AtomEons\orangebox\scripts\obx.mjs mcp register "My MCP" --url=https://example.com/mcp
node C:\AtomEons\orangebox\scripts\obx.mjs mcp disable meta-ads-mcp
node C:\AtomEons\orangebox\scripts\obx.mjs mcp doctor --json --receipt
```

## Stored Files

- Registry: `<dataRoot>\mcp\bridge-servers.json`
- Probe evidence: `<dataRoot>\mcp\probes\<server_id>.json`
- Route receipts: `<dataRoot>\receipts\v4\*.json`

## Auth Spec Version

Every server returned by the bridge includes:

```json
{
  "auth_spec_version": "mcp-auth-spec/v1"
}
```

Custom registry entries may provide a future `auth_spec_version`, but v1 is the default. This keeps OAuth, API-key, local, and vendor-aggregator auth envelopes replayable as the registry grows.

## Security Notes

- The bridge does not store raw secrets in registry entries.
- HTTP probes send no auth headers.
- Stdio entries are not executed by default.
- Tool calls are intentionally not wired as autonomous write actions in v0.1.
- Ads MCPs can affect spend, so they must remain read-only until simulation, caps, approval, and receipt gates exist.
