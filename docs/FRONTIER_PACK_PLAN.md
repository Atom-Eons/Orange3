# ORANGEBOX v1.1 Frontier Pack — Multi-Session Plan

**Goal:** raise ORANGEBOX Command from "Tauri-wrapped local site" (v1.0) to "Linear × Raycast × Arc × Cursor × Zed-class command cockpit" (v1.1 Frontier).

**Bar set by operator:** the 25 named reference apps (Linear, Raycast, Arc, Warp, Cursor, Krea, Magnific, Spline, Zed, Linear, Amie, Superlist, Cron, Family, Screen Studio, CleanShot, Descript, Opal, Obsidian, Muse, etc.).

**Total estimate:** ~78 hours across 7 sessions (vanilla-first saves rework vs. 120h spec).

---

## Session arc

### S1 — Strike Slice (this session, ~2h)
**Lands as `v1.1.0-strike-slice`.**

- Design tokens layer (CSS variables, no build): dark obsidian + restrained orange + state colors + type scale + spacing scale + motion scale
- Cmd+K command palette (vanilla ESM): fuzzy search across projects/DAG nodes/receipts/actions
- Spring-motion system (Web Animations API): list reorders, chip insertions, panel transitions
- Premium visual refresh applied to shell + command-hub + system-strip
- Rebuild MSI+NSIS, ship as v1.1.0
- Receipt + ledger row

**Reference bars hit (partial):** Linear (Cmd+K, motion polish), Family (premium aesthetic).

### S2 — Foundation (~8h)
**Lands as `v1.2.0-foundation`.**

- Vite + TypeScript migration (`src/` → `src/main.ts`, `vite build` → `dist/`)
- Tauri config: `frontendDist: "../dist"`
- framer-motion successor (motion.dev) for spring physics
- cmdk for production-grade palette (replace S1 vanilla)
- Inter font with proper subsetting
- Design token export for both runtime CSS and TS

**Reference bars cleared:** Linear (motion), Cron (palette).

### S3 — Ambient (~8h)
**Lands as `v1.3.0-ambient`.**

- Global hotkey (`Ctrl+Shift+O`) — Tauri global-shortcut plugin, spawns cockpit overlay
- Menu-bar / system-tray ambient — Tauri tray plugin, shows active project + blocker count
- Floating overlay mode (Raycast-style "summon")

**Reference bars cleared:** Raycast (keyboard summon), CleanShot/Opal (menu bar ambient).

### S4 — Real-Time (~10h)
**Lands as `v1.4.0-realtime`.**

- SSE / WebSocket party-line: server-pushed updates replace polling
- Sub-100ms feel on every status change
- 60fps render scheduler: virtualized party-line feed, virtualized receipt list
- Cancel work when off-viewport

**Reference bars cleared:** Krea (real-time loop), Zed (perf).

### S5 — Predictive (~10h)
**Lands as `v1.5.0-predictive`.**

- Predictive next-action bar: uses live DAG + MCP context to suggest the next command
- Tab-to-accept, Cmd+Enter to run
- Codebase-aware Q&A via MCP (Cursor-class "ask anything about this project")

**Reference bars cleared:** Cursor (predictive + codebase Q&A).

### S6 — Output (~12h)
**Lands as `v1.6.0-output`.**

- Cinematic visual proof: Codexa screenshot/recording rail auto-zooms to cursor, smooth camera, Screen-Studio-style output via ffmpeg
- Boosts: per-view customization (theme any panel, hide chips, reorder rows). Persisted in local vault.
- Magnific-grade progress states on long jobs (before/after, satisfying state transitions)

**Reference bars cleared:** Screen Studio (cinematic output), Arc (Boosts), Magnific (progress polish).

### S7 + S8 — Spatial Canvas (~20h)
**Lands as `v2.0.0-spatial`.**

- Muse/Spline-style spatial canvas for projects + DAGs
- 2D pan/zoom, nested-board UX
- Spline-style 3D project orb (optional advanced mode)
- "Tidy Tabs"-style AI organization of project space

**Reference bars cleared:** Muse (spatial canvas), Spline (3D feel), Arc (Tidy Tabs AI organization).

---

## Pickup points between sessions

Every session ends with:
1. A bump version (`1.x.y`)
2. A rebuilt MSI + NSIS in `installer-output/`
3. A receipt in `receipts/BUILD_v1.x.y.json`
4. A ledger row in `receipts/LEDGER.md`
5. A pushed commit on private repo
6. A named pickup point for the next session

Anyone can resume the work from a commit hash.

---

## What stays preserved from v1.0

- Commercial license + EULA + MFG (unchanged)
- AE0–AE14 doctrine (unchanged)
- 27 Guardrails + Gate Chains (unchanged)
- ÆoNs Skill Suite manifest (unchanged)
- AI Box Worker Rail wire-up (unchanged)
- Local-first data model, AppData root (unchanged)
- Receipt + proof contract (unchanged)

What changes is the **interface layer** — how the operator experiences the cockpit. Doctrine is forever; interface evolves to the bar.

---

## Pricing arc across the frontier pack

The price card (`PRICING.md`) **does not change** during v1.1–v2.0. Anyone who buys v1.0 at $9,999 gets all v1.x updates free (per LICENSE.txt §4). v2.0 (spatial canvas) is the major-version upgrade gate: $4,000 upgrade fee.

The Frontier Pack is the *justification* for the v1.0 price defending itself against the 25 references. Not a separate SKU.

---

## Failure modes to avoid

- **Polish-without-doctrine drift** — every visual move must preserve the receipt contract. No fake-green animations.
- **Build pipeline that buyers can't reproduce** — every artifact must rebuild from `git clone && npm install && npm run desktop:build`. No magic build server.
- **Native-feature creep that breaks Tauri portability** — stick to Tauri plugins or operator-approved native code. No Windows-only Win32 calls without macOS/Linux roadmap.
- **Polish that hides honesty** — receipts still show blockers. CHECKMATE still blocks promotion. Mom's Law still binds.

---

*Authored 2026-05-13 by Ætom ÆoNs + Claude Opus. Disclosure: `ATOM-ORANGEBOX-FRONTIER-2026-0513`.*
