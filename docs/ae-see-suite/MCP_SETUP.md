# AE See-Suite MCP Setup

This repo now includes a dedicated AE See-Suite MCP lane for build/proof control of the living dashboard.

## Server

```bash
node ./scripts/ae-see-suite-mcp-server.mjs
```

The server registers a focused AE See-Suite tool pack. It does not replace the broader OrangeBOX MCP server; it gives Claude Code/Codex a smaller surface specifically for the living dashboard work.

## Tools

- `ae_see_suite_help`
- `ae_see_suite_build_frontend`
- `ae_see_suite_proof_anchors`
- `ae_see_suite_proof_72`
- `ae_see_suite_state_open_command`

## Product law encoded in MCP

- One AppShell.
- Many semantic states.
- Do not build 72 pages.
- Do not use mockup images as UI.
- Use the 72-state atlas as proof/QA, not production logic.

## Anchor state proof target

The canonical anchor states are:

- `01` Calm Overview
- `06` Alert / Critical Latency
- `22` Temporal Memory Expanded
- `26` Command Palette
- `37` Agent Queue
- `61` Living Canvas

Run anchor proof through MCP with:

```txt
ae_see_suite_proof_anchors
```

Equivalent shell path:

```bash
npm run build:web
npm run frontend:proof:visual -- --states=01,06,22,26,37,61 --label=anchor-pass
npm run frontend:proof:pixel -- --states=01,06,22,26,37,61
```

Run the full atlas proof with:

```txt
ae_see_suite_proof_72
```

Equivalent shell path:

```bash
npm run build:web
npm run frontend:proof:visual:72
```

## Example Claude Desktop / MCP config shape

Use the local repo path that exists on the machine running the MCP client.

```json
{
  "mcpServers": {
    "ae-see-suite": {
      "command": "node",
      "args": ["C:/AtomEons/orangebox-delta/scripts/ae-see-suite-mcp-server.mjs"],
      "env": {
        "ORANGEBOX_URL": "http://127.0.0.1:8787"
      }
    }
  }
}
```

## Operating note

The MCP tools call the existing OrangeBOX receipted executor for builds/proofs. The OrangeBOX service must be running at `ORANGEBOX_URL` for build/proof tools to execute. The state URL helper does not require execution; it returns direct browser URLs and acceptance checks.
