# ORANGEBOX v6.0 — Quickstart (Native)

Two install paths. Pick one.

## Path A — Portable zip (recommended, easiest)

1. Download `orangebox-v6.0.0-portable.zip`.
2. Right-click → **Extract All** → pick any folder (Desktop, Documents, USB stick — anywhere).
3. Double-click **`orangebox.exe`**.

That's it. The cockpit window appears in 2-3 seconds. No installer. No admin. No PowerShell. No Node install. Nothing to configure.

## Path B — NSIS installer (Start menu shortcut)

1. Download `ORANGEBOX-Setup-6.0.0-x64.exe`.
2. Double-click. (Per-user install — no UAC prompt.)
3. Find **ORANGEBOX** in the Start menu or on the Desktop.

---

## API keys (optional but recommended)

Open Settings (Ctrl+`,`) and paste the keys you have:

| Provider | What it unlocks |
|---|---|
| **Anthropic** | Claude Haiku / Sonnet / Opus — the default cockpit brain |
| **OpenAI** | GPT-5 — trilane architect leg |
| **Google** | Gemini 1.5 Pro — trilane consigliere leg |
| **Groq** | Llama-3.3-70B on LPUs — sub-300ms quick replies (NEW in v6) |
| **Ollama** | Local Qwen / Llama — air-gap privacy (NEW in v6) |

You only need one. We recommend starting with Anthropic + Groq for the best speed/quality mix.

## Air-gap mode (zero egress)

To run with zero remote model calls — every token stays on your machine:

```
set ORANGEBOX_LOCAL_MODE=1
orangebox.exe
```

(Requires Ollama installed locally with `qwen2.5:7b` pulled: `ollama pull qwen2.5:7b`.)

The router automatically swaps every routable task to local Ollama. Synthesis, architecture, and pr_review still call remote (no viable local equivalent).

## Keyboard shortcuts

| Key | Lane |
|---|---|
| Ctrl+1 | Cockpit |
| Ctrl+2 | IDE |
| Ctrl+3 | Terminal |
| Ctrl+4 | Trilane |
| Ctrl+5 | Voice |
| Ctrl+6 | 𝕏 Feed |
| Ctrl+7 | Vault |
| Ctrl+8 | Receipts |
| Ctrl+9 | Privacy |
| Ctrl+0 | Skils |
| Ctrl+, | Settings |
| ? | Show all shortcuts |

## Skil.Ski (skills marketplace)

Open the **Skils** lane (Ctrl+0). The lane shows the single MCP config snippet:

```json
{
  "mcpServers": {
    "skilski": {
      "type": "url",
      "url": "https://skil.ski/api/mcp"
    }
  }
}
```

Paste it into any MCP-compatible client. That's the whole integration.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Window doesn't appear within 5s | Check `%APPDATA%\com.atomeons.orangebox.command\orangebox-startup.log` |
| Status pills all red | Sidecar isn't binding port 8787 — restart `orangebox.exe` |
| "GROQ_API_KEY missing" | Set it in Settings or `set GROQ_API_KEY=...` then relaunch |
| "Ollama unreachable" | `ollama serve` in a separate terminal, or set `OLLAMA_HOST` |

## More

- `docs/RELEASE_NOTES_v6.0.0.md` — what's new in v6.0
- `docs/V6_POSITION_2026_STACK.md` — full 2026 stack evaluation
- `docs/OPERATOR_MANUAL.md` — exhaustive reference
