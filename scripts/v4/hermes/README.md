# ORANGEBOX Hermes Agent Pack

## What Hermes Agent is

Hermes Agent is an open-source, MIT-licensed autonomous AI agent built by Nous Research. It runs fully self-hosted on your machine (or Codexa worker) with a native MCP server, persistent operator-owned memory, and multi-LLM routing via Nous Portal, OpenRouter, OpenAI, and Anthropic. It auto-generates reusable skills from past sessions and supports parallel subagents for concurrent work. Source: https://github.com/nousresearch/hermes-agent.

## Why ORANGEBOX uses it

Hermes replaces OpenClaw as the primary outer-orchestration agent on the Codexa rail starting in v4.0.1. It fits the ORANGEBOX operator-OS doctrine exactly: local-first by default, loopback-only gateway, BYO keys, no subscription, MIT license. Its native MCP server plugs directly into the ORANGEBOX MCP host without a shim layer. Persistent memory compounds across sessions — consistent with the CLC lattice principle in V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516).

## Install via Codexa (one command)

Run the pack from your ORANGEBOX cockpit:

```powershell
node C:\AtomEons\ship\orangebox-os\scripts\v4\hermes\hermes-pack.mjs
```

This generates the staged install bundle under `exports/codexa-hermes-pack/` and a zip. Then on Codexa (WSL2/Linux):

```bash
bash install-hermes.sh
```

Or on Windows native:

```powershell
powershell -ExecutionPolicy Bypass -File .\INSTALL_HERMES.ps1
```

## Install on Windows native

The PowerShell installer (`INSTALL_HERMES.ps1`) handles Windows native (no WSL required). It checks for Node 22.14+, installs Hermes via the PowerShell one-liner from Nous Research, writes the default config to `~/.hermes/config.json`, places `AGENTS.md` in the workspace, and starts Hermes on port 18790 (MCP) and 18791 (gateway health).

If you are running Codexa as a dedicated Linux/WSL2 worker, use `install-hermes.sh` instead — it installs Node 24 via nodesource if needed, runs the curl one-liner installer, and registers a systemd user service.

## Migrate from OpenClaw

If you were running OpenClaw, run the migration script once to carry your workspace, models, and gateway token forward:

```bash
node C:\AtomEons\ship\orangebox-os\scripts\v4\hermes\hermes-migrate-from-openclaw.mjs
```

Dry-run first to see the planned config diff without writing anything:

```bash
node C:\AtomEons\ship\orangebox-os\scripts\v4\hermes\hermes-migrate-from-openclaw.mjs --dry-run
```

Your OpenClaw config is backed up to `~/.openclaw/openclaw.pre-hermes.json` before any writes.

## Health check

```bash
node C:\AtomEons\ship\orangebox-os\scripts\v4\hermes\hermes-status.mjs --json
```

Returns JSON with `status: VERIFIED | DEGRADED | FAILED`, version, MCP endpoint, active model, memory entries, skills generated, last activity, and gateway health. Exit code 0 on VERIFIED, 1 on DEGRADED/FAILED.

## How to switch models

Hermes uses a single CLI command to swap the active model — no config file edits required:

```bash
hermes model anthropic/claude-sonnet-4-5
hermes model openai/gpt-4o
hermes model openrouter/meta-llama/llama-3.1-405b-instruct
```

The ORANGEBOX trilane authority order applies in multi-model debates: GPT is Architect (highest authority), Gemini is Consigliere, Claude is Compiler/Syntax Lead.

## Messaging gateway pairing

The Hermes messaging gateway (Telegram, Discord, Slack, WhatsApp, Signal, CLI) is OFF by default in the ORANGEBOX guardrails config. The gateway stays loopback-only until the operator explicitly pairs a channel:

```bash
hermes gateway pair telegram
hermes gateway pair discord
```

Pairing requires a bot token from the respective platform. Do not expose port 18791 to LAN or internet without a firewall rule. The AGENTS.md guardrail enforces this constraint at the agent level.

## Privacy model

Hermes Agent is self-hosted. All memory (`~/.hermes/state.json`), skills (`~/.hermes/skills-active/`, `~/.hermes/skills-pending/`), and config (`~/.hermes/config.json`) live on the operator's machine. No data egresses to Nous Research servers unless the operator explicitly opts into Nous Portal routing. When using Nous Portal or OpenRouter, only the prompt content for those specific requests leaves the machine — consistent with ORANGEBOX's local-first vault doctrine. The privacy dashboard in ORANGEBOX surfaces every API call; Hermes calls are included.

## Troubleshooting

**Node version too old (`requires Node 22.14+`)**
The installer checks automatically. If running manually: `node --version`. To upgrade on Ubuntu/WSL2:
```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt-get install -y nodejs
```

**Port conflicts (18790 or 18791 already in use)**
Check what's using the port:
```bash
# Linux/WSL2
ss -tlnp | grep 1879
```
On Windows:
```powershell
netstat -ano | Select-String "1879"
```
Kill the process or update `~/.hermes/config.json` to use alternate ports, then restart: `hermes restart`.

**Gateway not starting (systemd user service)**
```bash
systemctl --user status hermes-gateway
journalctl --user -u hermes-gateway -n 50
```
If the service unit is missing, re-run `install-hermes.sh` — it writes the service file to `~/.config/systemd/user/hermes-gateway.service`.

**`hermes: command not found` after install**
The Nous Research installer places the binary in `~/.hermes/bin/`. Ensure it is on PATH:
```bash
export PATH="$HOME/.hermes/bin:$PATH"
# Add to ~/.bashrc or ~/.zshrc to persist
```

**MCP endpoint not reachable from ORANGEBOX**
Verify Hermes is running: `hermes status`. Confirm the MCP port matches your ORANGEBOX Hermes connector config (default `http://127.0.0.1:18790/mcp/`). Confirm no firewall rule is blocking loopback on that port.

**OpenClaw migration receipt shows FAILED**
Ensure `~/.openclaw/openclaw.json` exists and is valid JSON. Run with `--dry-run` to inspect the planned mapping before committing. If the OpenClaw config is corrupt, the migration script skips it and writes a fresh Hermes config with defaults.
