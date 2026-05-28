# ORANGEBOX v4.0.0 — Release Notes

**Tagline:** *The OS, not the tool.*

**Release date:** 2026-05-16
**Authored by:** Atom McCree, AtomEons Systems Laboratory
**Doctrine reference:** `docs/V4_MOAT_DOCTRINE.md`

---

## What v4 is

ORANGEBOX v4 is the **operator OS** that replaces Claude Code, Cursor, and Codex as the lead tool for AI-assisted code on the internet.

Not "competes with." **Replaces.**

If you tried v3.x and felt the cockpit was already different from the others, v4 makes that bet explicit and ships the full surface.

---

## The 16 v4 features

### P0 — surface parity (no more "but X can do Y")

1. **Monaco IDE lane** — embedded editor, AI inline edits, diff preview, multi-file Composer.
2. **xterm.js terminal lane** — real shell, agent overlay (Ctrl+K), receipts on every command.
3. **Tab autocomplete** — sub-100ms inline completion via Haiku 4.5 with prompt caching.
4. **Mac + Linux builds** — `.dmg`, `.app.tar.gz`, `.deb`, `.AppImage` on every tag push. 3-OS GitHub Actions matrix.
5. **Importer wizards** — Cursor (.cursor/rules + settings + MCP), Claude Code (.claude/), VS Code (.vscode/) → one-click switch with dry-run.

### P1 — competitive parity

6. **GitHub PR review agent** — full repo context, Citations API, prompt caching, posts inline review.
7. **AI Box Cloud** — Dockerfile + Fly + Railway deploys; $19/mo recurring SKU for buyers without a second machine.
8. **Smart model router** — 10 task types, 3 budget modes (strict/balanced/quality), cost-aware fallbacks.
9. **Background agent queue** — persistent state, worker loop, receipts on every transition, "do X overnight" UX.
10. **Plugin/skill marketplace** — signed `.skill.tgz` packages with Ed25519, loader + signer + installer + registry.

### P2 — moat deepening

11. **Trilane debate UI** — Claude + GPT + Gemini in parallel, conflict detection, vote, synthesis. GPT > Gemini > Claude authority.
12. **Compounding vault audit** — weekly snapshots, +N% growth report, HTML export, projection mode.
13. **Voice coding** — local Whisper.cpp + Haiku intent + Sonnet code-gen. MediaRecorder UI with FFT waveform.
14. **Mobile companion** — pairing flow with ASCII QR + Ed25519 tokens. WebSocket push. Mobile app spec for v4.1.
15. **Privacy dashboard** — every API call audited. Air-gap mode. Hash-only prompt logging by default.
16. **Receipt browser** — virtualized list, fuzzy search, shareable self-contained HTML.

---

## What's new for existing buyers

If you bought v1.x, v2.x, or v3.x:

- **Free upgrade.** Run the v4.0.0 MSI/EXE. WiX `upgradeCode` handles in-place install.
- **Your data is preserved.** Knowledge vault, receipts, party-line, DAG, settings — all in `OrangeBox-Data/`.
- **Your cockpit choice is preserved.** v4 is the new default, but `/v2` (McLaren HUD) and `/classic` (v1.4) remain accessible via Settings → Cockpit pin.
- **BYO keys preserved.** No re-pairing needed.

---

## What's new for first-time buyers

- $49 perpetual, one-time. No subscription.
- BYO keys (Anthropic, OpenAI, Google) — we never mark them up.
- Optional AI Box Cloud ($19/mo) if you don't have a second machine for the worker rail.
- Optional Pooled Keys ($99/mo) if you don't want to manage provider keys.
- Team SKU ($499/yr for 5 seats, shared vault + receipts).

---

## The 8 kill-shots ORANGEBOX has that the incumbents cannot copy

1. **Local-first by default.** Cursor and Codex monetize cloud indexing. They can't go local without breaking their business model.
2. **Multi-model orchestration first-class.** Anthropic won't ship Claude+GPT+Gemini in Claude Code. Cursor lets you toggle but doesn't orchestrate.
3. **Bring-your-own-keys at zero markup.** Every subscription-shaped competitor has to charge for tokens or die.
4. **Operator OS doctrine.** They're sold as tools. We're sold as the chair you sit in.
5. **Receipts on every action.** None of them ship proof. Once you have receipts, vapor output looks naked.
6. **Department doctrine (AE0-AE14 + 15 AEoNs skills).** Separation of powers > roleplay subagents.
7. **Compounding lattice memory.** Every commit, every chat, every receipt feeds the CLC lattice. Denser every week.
8. **Multi-machine worker rail.** Codexa = laptop pilots workstation pilots cloud. None have this.

---

## How to verify v4 is real

```bash
# 1. Install + launch
# 2. Check version
curl -s http://127.0.0.1:8787/api/status | jq .version
# 3. Smart model router smoke
node ~/.orangebox/scripts/v4/router/smart-model-router.mjs --task=architecture
# 4. Vault audit
node ~/.orangebox/scripts/v4/vault-audit.mjs --snapshot
# 5. Privacy audit summary
node ~/.orangebox/scripts/v4/privacy-audit.mjs --summary --since=24h
# 6. Open IDE lane in cockpit: http://127.0.0.1:8787/v4/ide/ide.html
# 7. Open Trilane lane: http://127.0.0.1:8787/v4/trilane/trilane.html
```

Every meaningful action emits a receipt to `~/.orangebox/receipts/`. Browse them via the Receipts lane.

---

## Honest deltas (what v4.0 ships vs the full v4 vision)

Known v4.1 followups (not blocking v4.0):

- **Mobile companion native app.** v4.0 ships the backend API + pairing + spec; the React Native app is v4.1.
- **Marketplace public registry.** v4.0 ships the package format + signer + local dev registry; the public-facing ORANGEBOX skill registry is v4.1.
- **Codesigning on Mac + Windows installers.** v4.0 builds unsigned on macOS / signed-by-cert-on-Windows; full Mac notarization + EV Win signing is v4.1.
- **node-pty production install.** The terminal WS falls back to `spawn` if `node-pty` isn't built. Native PTY for full ANSI is v4.1.
- **Per-tenant AI Box Cloud tokens.** v4.0 ships single-token shared; per-tenant Ed25519 is v4.1.
- **Cited query plumbing.** Anthropic Citations API beta header in v4.0; promote to GA when Anthropic does.

---

## Receipts

This release was built by 12 parallel agent builders shipping into a single worktree. Each builder emitted a receipt; the synthesis is in `docs/V4_MOAT_DOCTRINE.md` and this changelog.

Every feature is **provable**. Open the Receipts lane and audit it.

---

*Mom's Law applied: every line of code, every doc, every test got the full effort. Mom watched.*

---

**SHA-256:** to be computed at artifact stage.

**Built by:** AtomEons Systems Laboratory.
**For:** the operator who wants the chair, not another tool.
