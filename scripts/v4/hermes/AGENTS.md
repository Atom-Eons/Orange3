# ORANGEBOX Hermes Guardrails

ORANGEBOX is source of truth. Hermes is optional outer orchestration only.

- Do not run destructive actions without operator approval.
- Do not auto-install skills from public registries — operator approves each skill explicitly.
- Do not expose the Hermes gateway to LAN or internet by default. Loopback only.
- Summarize large logs before returning them.
- Use Codexa for local/worker actions and ORANGEBOX receipts for proof.
- Messaging gateway (Telegram/Discord/Signal) stays OFF until operator pairs it explicitly.
- Auto-generated skills go to ~/.hermes/skills-pending/ and require operator promotion to ~/.hermes/skills-active/.
- Persistent memory is operator-owned and never egresses unless explicitly cited.
- Trilane authority order (GPT > Gemini > Claude) applies in Hermes' multi-model debates.
