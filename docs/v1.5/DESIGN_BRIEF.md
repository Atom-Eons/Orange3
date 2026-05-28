# ORANGEBOX v1.5 — Design Brief

**Captured:** 2026-05-16
**Status:** brief only — operator will signal when to start building
**Disclosure stub:** `ATOM-ORANGEBOX-V1-5-BOX-OF-ORANGEBOX-BRIEF-2026-0516`

---

## The single line

> **"orangebox the box of orangebox"**

The product IS a cinematic command instrument. Not a dashboard. Not a Linear clone. A **box of orange-tech** — dense, instrumental, vibe-coded, alive.

---

## The top-bar (always-visible header strip)

Captured 2026-05-16. The header above center-chat / left-rail / right-panel. Skinny strip, monospace data, no decoration.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  PROJECT-NAME    PROJECT-PATH    [━━━━━━━━━━━━━━━━░░] 73%  ⬢ local  🌐 priv │
└──────────────────────────────────────────────────────────────────────────┘
```

| Element | Spec |
|---|---|
| **Project name** | Slug · monospace · bold · left-anchored · 14 px · orange tint |
| **Project path** | Resolved filesystem root for this project · monospace · muted tertiary · 11 px · ellipsis at width clip |
| **Progress bar** | To the RIGHT of project name. Small (~120 px wide × 6 px tall, "small but always visible"). **Green fill** = % project complete (counted from DAG nodes). No labels next to it, just the bar. Percent number floats at the right edge of the bar. |
| **GitHub local check** | Hexagon icon (⬢). Green = repo cloned locally + clean working tree. Amber = local exists, dirty. Red = not cloned. Click → opens path in Explorer. |
| **GitHub private web** | Globe icon (🌐) + "priv" or "pub" tag. Green = private GitHub repo reachable + Atom is logged in. Amber = repo reachable but not private. Red = unreachable or no remote. Click → opens GitHub repo URL. |

The top-bar is always there. It's the operator's continuous answer to "where am I and how far in am I."

---

## What the cockpit MUST NOT have (kill list, locked)

**This is not a developer tool. It is a product-making instrument.** Operator's exact words: *"I don't care about code I care about function and use at end of production cycle and making amazing products."*

| Killed | Why |
|---|---|
| **Bypass / Danger / Override toggle** | We always bypass. Don't ask. No toggle needed. |
| **Model picker / max-model switch** | Always Claude Opus 4.7 max. Strip the dropdown. Strip the "fallback to Sonnet" logic from view. |
| **"Create PR" buttons** | Operator doesn't care about PRs. Hide. |
| **"View code" links / "Open in IDE" / file-path-click-to-open-source** | Not a dev tool. Functions are what matter, not the code behind them. |
| **`/git commit`, `/git push`, `/branch` slash-skills surfaced in chat suggestion** | Skill works in background if needed, but never proactively suggested to operator. |
| **Diff viewer / file tree / inline code panels** | Not in this product. Anything code-shaped runs invisibly. |
| **"Run tests" / "Lint" / engineering-CTAs** | Same — runs invisibly via skills. Not surfaced. |
| **Repo / commit / SHA-tree visualizations** | Top-bar has the two GitHub indicators. That's all the operator sees. |

Filter rule: **every CTA the cockpit shows the operator must be about THE PRODUCT, not about how the product is built.**

---

## The thesis (captured 2026-05-16 mid-vent)

> *"claudecode is central comms then rest runs as skills so you need to make the main page like this but not ugly like this. no design taste at all in the whole industry of ai apps. get better. its a 45% of 100% as far a seamless flow and experience."*

**The product is not a separate operator tool. The product is the operator's Claude chat — with the rest of ORANGEBOX functionality available as skills.**

This is a positioning shift. v1.0–v1.4 framed ORANGEBOX as "the cockpit you switch into." That was wrong. The operator already lives in Claude. The job is to give them their Claude chat, on their own machine, with every ORANGEBOX feature one slash-skill away — and NOT ugly.

### The architecture this implies

```
┌──────────────────────────────────────────────────────────────┐
│  LEFT RAIL              CENTER                  RIGHT PANEL  │
│  ─────────              ─────────               ───────────  │
│  Project status         Claude-style chat       Active node  │
│  + progress chips       (clean, focused,        + receipts   │
│  (NO text walls)        Anthropic-grade UX)     + proof      │
│                                                  + details    │
└──────────────────────────────────────────────────────────────┘
              ↑                  ↑                    ↑
       VISUAL ONLY        CENTRAL COMMS         CONTEXTUAL
       (dots, rings,      (Claude Code MCP =    (replaces
        bars, LEDs)        the brain)            current right)
```

- **Center = the chat.** Looks like Claude.ai's chat (clean, focused, conversational). NOT the current cluttered project surface. NOT ugly like Claude's UI is either — we hit the design bar Anthropic hasn't.
- **Left = at-a-glance project state.** Progress dials, status LEDs, blocker chips, DAG-progress ring. Visual only. Zero paragraphs.
- **Right = details, not the current right rail.** When operator clicks something in chat or hovers a project, the right panel populates with: active DAG node, last receipt, proof paths, party-line tail, departments-in-flight. Contextual, not constant.
- **Every ORANGEBOX capability runs as a skill** invokable from chat (`/status`, `/proof`, `/route ae6`, `/receipts`, `/spine`, `/dag`, `/mission`, etc.). Skills are the API surface. The chat is the entry point.

### The anti-patterns to kill

1. **Wall of text on left rail.** No more 8-line section descriptions. Dots and dials.
2. **Right rail of "knowledge primer / pagetree / CLC primer" buttons.** Replace with contextual details on what the operator is actually looking at.
3. **"PM Router" eyebrow language anywhere.** Insider-speak.
4. **The current Commander chat surface** which the operator just named: *"sucks. it's not pulling this feed."* — gone. Replaced by a real Claude-grade chat that talks to Claude Code MCP and ALSO routes to cockpit skills.
5. **Linear-premium aesthetic for v1.5.** Linear has good taste but it's the wrong frame for this — the cockpit is a HUD command center, not a project-management tool.

### The new measurement

Operator graded the current state: **45 / 100 on seamless flow and experience.**

v1.5 ship target: **80 / 100** — daily-driver quality. Operator can leave Claude.ai and live in ORANGEBOX for project work.

v1.6 target: **95 / 100** — better than Claude.ai for the operator's job.

---

## Three problems v1.5 fixes

### 1. Installer is fragile

> *"it took claude to fix the installer. kid got mad because the html doesn't show up"*

**Symptom:** Buyer runs MSI/NSIS. App launches. Webview opens to `http://127.0.0.1:8787/` → blank "can't connect" page. The Node server never started. Because Node.js isn't on PATH on the buyer's machine.

**The audit (AE8) flagged this exact failure mode in v1.3.1.** We deferred the real fix to "v1.4 roadmap" then folded that to v1.4.1. Time to land it.

**v1.5 fix:** Bundle Node.js + the cockpit dependencies INSIDE the installer. The buyer never installs anything separately. The Tauri Rust side spawns `bundled-node.exe` from the resource dir instead of system Node. Zero dependency chain. Zero "html doesn't show up" failures.

Approach options:
- **(A)** Ship `node.exe` as a sidecar binary inside `src-tauri/binaries/`. Tauri 2.x supports this. ~30–50 MB add to installer size. Worth it.
- **(B)** Compile the server.mjs to a single executable via `pkg` or `bun build --compile` or `nexe`. Then the installer doesn't even need Node — it ships a 50 MB self-contained `orangebox-server.exe`. **This is the right answer.** Modern bun compilation produces ~50 MB single-binary servers.
- Hybrid: bundle node sidecar in v1.5.0; migrate to bun-compiled in v1.5.1 once bun's edge cases are verified for our server.mjs.

### 2. UI is functional but not cool

> *"you seem to not have built the dashboard, function is great. but it needs to be cool"*

**Symptom:** Current cockpit is "Linear premium" — dark obsidian, single orange accent, glass panels, clean type. That's GOOD design but not the operator's vision. The operator's vision is **cinematic HUD command center** — dense instrumental aesthetic.

**The reference images (saved to docs/v1.5/refs/) split across TWO targets:**

### COCKPIT (what the buyer sees inside the running app)

> [HUD-REF-1]: Wide command panel. Dual circular dials (orange) flanking a central network-graph display + waveform readout. Sub-panels with monospaced data, RGB-grid backgrounds, copper-orange + teal-cyan accents on near-black teal base.

> [HUD-REF-3]: Full-screen command surface. Top-left: pulsing radial dial. Top-center: 3D node-graph (cyan with orange highlights). Top-right: data readouts + world map mini. Bottom: percentage bars + ID/status table + sub-panel labels. The reference for "what the cockpit looks like at rest."

These two are the **interior view** — the working surface the operator lives in. Functional density. Real data wired to real panels.

### WEBSITE (the public sales page, once the cockpit hits the bar)

> [HUD-REF-2]: Close-cinematic. Tilted angle of orange node-graph + chart panels + teal pulse indicators + numerical readouts. Bokeh + lens DoF. Feels like a control rack viewed through a movie camera.

This is the **marketing version** — the dramatized hero shot. Same visual language as the cockpit, but lit + framed like a movie still. Use this aesthetic for:
- The orangebox.atomeons.com hero
- Social/OG cards
- Press kit imagery
- Demo loop video stills

The website is the **cinematic** of the cockpit. The cockpit is the **functional**. Same vocabulary, different register.

**Ship order:** cockpit visual refresh lands first. Once it actually looks like HUD-REF-1/3, the website inherits the aesthetic via screenshots + HUD-REF-2-styled cinematic stills. Don't build the website-style first.

**Visual targets:**
- Color: **expand from single-orange to orange + teal-cyan dual-accent.** Orange = active, primary action. Teal-cyan = data, live signal, network.
- Base: stays dark, but introduce subtle dark-teal undertones (away from pure obsidian).
- Texture: subtle RGB-grid background pattern. Not full retro CRT, but a hint of "command surface."
- Type: monospace data readouts everywhere. Numerical values, IDs, status codes in mono. Headings stay Inter.
- Panel chrome: thin bracket frames around panels (sci-fi instrument feel). Top-bracket + bottom-bracket bookends on key surfaces.
- Live animation: pulsing dials. Animated waveform on party-line. Network graph that breathes. State LEDs are always doing something subtle.
- Glow: cyan glow on live data, orange glow on user-actionable. Never both on the same element.
- Cinematic intro: cockpit-boot is a 1.2-second instrument-bring-up sequence (panels reveal, LEDs sync, "ALL SYSTEMS NOMINAL" sweep).

### 3. Commander chat sucks and isn't pulling the right feed

> *"commander chat sucks. it's not pulling this feed."*
> *"claudecode is central comms then rest runs as skills"*
> *"i can't [use orangebox to command]. now"*

**Symptom:** The current Commander chat surface in the cockpit is broken in spirit. It doesn't talk to Claude Code MCP cleanly. It doesn't route to the ORANGEBOX skills. It feels like a fake chat bolted onto a dashboard.

**v1.5 fix: replace the entire center surface with a real Claude-grade chat that has Claude Code MCP as its brain and every ORANGEBOX capability as a slash-skill.**

Spec:
- Center pane is the chat. Full-height, focused, no clutter, no project-management chrome stuck inside it.
- Input is monospace, always-focusable, generous (multiline, paste-friendly, big drop target).
- Slash-skills surface (`/status`, `/proof`, `/route ae6`, `/receipts`, `/spine`, `/dag`, `/next`, `/mission`, etc.). Auto-complete on `/`. Each skill is a real action wired to the server.
- Claude Code MCP is the brain — the chat hits the operator's Claude Code session via the MCP server we already ship. Operator's API key (collected in first-run) authenticates.
- Streaming responses, code blocks, attachments, file-drag — same affordances Claude.ai has, on the operator's machine.
- Cmd+K palette stays as the universal overlay (fuzzy-find any project / node / skill / doc). But the chat is the primary work surface, not the palette.

### 4. Left rail is a text wall

> *"i need project status on left but i just want like progress indicators. i don't need all that text in obox side."*

**v1.5 fix: left rail is visual-only.**

- Active project chip (one line, the slug).
- DAG progress ring (visual: percent complete, blocker count as a red dot if >0).
- Department LEDs (15 small dots, lit if active in last 5 min).
- Receipt count (compact number + last-receipt timestamp).
- Memory ring (Layer 2 vault freshness — how stale the compiled knowledge is).
- The rail-btn-text-stack from v1.0–v1.4 dies. Anyone who wants to navigate sections uses Cmd+K. The rail is for *seeing*, not for *clicking*.

### 5. Right rail is the wrong content

> *"all i need is a copy of this app sitting on main with no right bar like this one but instead details."*

**v1.5 fix: right panel is contextual details, populated by what the operator is looking at in the chat.**

- When operator pastes a DAG node ID → right shows that node's full record + last receipt + proof links + party-line tail.
- When operator runs `/proof` → right shows the proof artifact preview.
- When operator hovers a project chip on the left → right shows that project's spine + recent receipts.
- When nothing specific is in focus → right shows the active project's pulse: last 5 party-line messages, current node, next-3-actions predictor.

The current right-rail buttons (Knowledge Primer / PageTree / CLC Primer / Obsidian Vault Home / Recall Packet) — gone. Those were operator-personal canon that the buyer doesn't have on a fresh install anyway. Replaced by dynamic context.

---

## Tagline doctrine

> **"ORANGEBOX — the box of orangebox."**

Meta. Self-referential. Mysterious. Doesn't try to explain itself; it just is. The kind of line that lives on a sticker.

Pair with the existing "An AI builder for all" — that's the SALES line. "the box of orangebox" is the BRAND koan. Different surfaces.

---

## Scope summary

| Layer | What | Effort |
|---|---|---|
| **Bundled runtime** | Node sidecar OR bun-compiled server.mjs inside installer (no buyer Node install) | 8–14 h |
| **Visual refresh** | Orange + teal-cyan dual-accent · monospace data type · bracket panel chrome · pulsing dials · cinematic boot · waveform party-line | 16–24 h |
| **Command lane** | Persistent bottom strip · inputmouth + predictive + verbs · Cmd+number fires verbs · Cmd+K overlay still works | 6–10 h |
| **Reference assets** | Capture screenshots, build the OG-card, demo GIF | 3–4 h |
| **Tauri Rust** | Sidecar config, spawn-from-resource, hardening | 2–4 h |
| **Tests + smoke** | Cold-VM install test (the one we've been deferring) | 2 h |

**Total estimate: 37–58 hours.**

Realistic ship: **3 sessions** with intermediate checkpoints at v1.5.0-alpha (sidecar lands), v1.5.0-beta (visual refresh lands), v1.5.0 (command lane + polish).

---

## What stays untouched

- AE0–AE14 doctrine ✓
- 27 Guardrails ✓
- ÆoNs Skill Suite manifest ✓
- 4-layer memory model ✓
- Codexa Local/Remote modes (v1.4) ✓
- Day-0 Proof Pack ✓
- LICENSE / EULA / PRIVACY / refund clauses ✓
- $49 pricing ✓
- First-run wizard flow (visual refresh applies to it, structure stays)

The doctrine doesn't change. The interface gets cinematic.

---

## Reference image notes (for memory)

The operator shared:
1. A Midjourney "Global V7/V8 Profile" example screen (NOT the target — this was the catalog frame the operator was browsing through).
2. **HUD-REF-1** — wide command-rack with dual orange dials + central network graph + waveform sub-panel.
3. **HUD-REF-2** — close cinematic angle of orange node-graph + teal pulse indicators + bokeh lens feel.
4. **HUD-REF-3** — full command-center HUD: radial dial top-left, central 3D node graph (cyan + orange), data readouts top-right, percentage bars + ID table bottom.

Save these to `docs/v1.5/refs/` when the operator drops them again (chat images aren't auto-saved to disk).

---

## When the operator says go

1. Re-confirm scope.
2. Branch from `c8e7330` (v1.3.1 commit) OR latest v1.4.0 ship state — operator picks.
3. Octolane: dispatch parallel builders for sidecar / visual / command-lane.
4. Synthesize. Build. Smoke. Ship as v1.5.0.

Hold position until operator green-lights the start.
