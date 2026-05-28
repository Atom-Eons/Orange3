# ORANGEBOX UX Scope — full spec for v6 native cockpit

**Disclosure ID:** `ATOM-OBX-V6-UX-SCOPE-2026-0517`
**Author:** Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
**Mom's Law:** Every button / switch / input / label / chip is real, named, wired, and tested. No fill cards. No mystery toggles. No "Coming in v6.X" placeholders.
**Method:** receipts-pass — single artifact, every interactive element listed, every state covered, every microcopy line frozen.
**Research input:** uxpilot.ai (98K+ users), Garry Tan / gstack (98K stars), agentmemory (R@5=95.2%), claude-context (Zilliz), trending Apr–May 2026.

---

## 0 — Scope at a glance

| Surface | Count |
|---|---|
| Global chrome rows | 4 (top bar / left rail / center panel / footer) |
| Lanes | 11 (Cockpit / IDE / Terminal / Trilane / Voice / 𝕏 Feed / Vault / Receipts / Privacy / Skils / Settings) |
| Named interactive elements | 79 |
| Distinct microcopy lines | 142 |
| Keyboard shortcuts | 13 global + ~22 lane-local |
| Receipt source kinds | 18 |
| Color tokens | 13 brand + 4 semantic |
| State variants per element type | 5 (default / hover / active / loading / disabled) + 4 result states (empty / error / success / warning) |

---

# 1 — Design tokens (frozen, do not drift)

## 1.1 Color tokens

| Token | Hex | Role | Used where |
|---|---|---|---|
| `C_BG_0` | `#0A0A0C` | Page background (CentralPanel fill) | Every lane backdrop |
| `C_BG_1` | `#0F1014` | Card / panel fill | All `section_card` frames + section panels |
| `C_BG_2` | `#15171D` | Sub-card / list-row fill | Receipt cards, skill rows, hit rows, leg-output frames |
| `C_BG_3` | `#1C1F27` | Active/hover fill, disabled-button fill | Button hover state, loading button background |
| `C_LINE` | `#2B2F3A` | Card border (1px) | All `Frame::none().stroke(...)` |
| `C_LINE_SOFT` | `#1F2330` | Horizontal rules | Cockpit section dividers |
| `C_TEXT` | `#E8EAF0` | Primary text | Body, h2 titles, primary card content |
| `C_TEXT_SOFT` | `#9CA3B5` | Secondary text | Sub-card text, summaries, hints |
| `C_TEXT_MUTED` | `#6B7180` | Labels / hints | Microcopy, timestamps |
| `C_TEXT_DIM` | `#4A4F5E` | Disabled / decorative | UUIDs in receipts, hairlines |
| `C_ORANGE` | `#FF6900` | Brand primary | Sprint kind, primary CTA, eyebrow accents |
| `C_ORANGE_SOFT` | `#FF8533` | Brand hover | Reserved for hover-elevation pass |
| `C_CYAN` | `#22F0D5` | Brand secondary | Skill kind, cost meter, source-driven badge |
| `C_GREEN` | `#34D399` | Success / agent kind / safe | Agent skill kind, save-success microcopy, vault count |
| `C_YELLOW` | `#FBBF24` | Warning / rule kind / cost-over-50¢ / incident | Rule kind, freeze warning, update-available |
| `C_RED` | `#F87171` | Danger / FROZEN / destructive / apply-button | Run+Apply button, FROZEN badge, careful-block label |

### Semantic mapping (consistency rules)
- **Orange** = "do" action (primary CTA, sprint-firing, scaffold)
- **Cyan** = "see" data (info chips, skill kind, cost meter, eyebrows)
- **Green** = "ok" state (success, safe, present, agent kind)
- **Yellow** = "watch" (warning, update available, freeze-protected zone, rule kind)
- **Red** = "stop" (block, destructive, freeze active, apply-without-confirm)

## 1.2 Typography

| Token | Family | Size | Role |
|---|---|---|---|
| `eyebrow` | Monospace | 11pt strong | Section section_label above h2 |
| `h1` | Proportional | 40pt strong | Cockpit hero only (not used in v6.0.9 layout) |
| `h2` | Proportional | 28pt strong | Lane title at top |
| `body` | Proportional | 14pt | p() paragraph below h2 |
| `card-title` | Proportional | 13–16pt strong | Card section titles |
| `card-body` | Proportional | 11–12pt | Card content |
| `microcopy` | Proportional | 10pt | Hints, tooltips, error reasons |
| `mono-label` | Monospace | 9–11pt | Paths, IDs, env vars, hashes, dates |
| `mono-code` | Monospace | 10–11pt code_editor | TextEdit::multiline in IDE editor |
| `stat-large` | Proportional | 22–32pt strong | Big stats (counts, cost-cents) |

**Hard rule:** Never use Proportional for paths, IDs, command output, code, JSON, hex, timestamps. Never use Monospace for prose body.

## 1.3 Spacing

Allowed values only: `2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 40`. No arbitrary numbers.

## 1.4 Border-radius
Buttons 6 · Cards 8 outer / 6 inner / 4 rows · Pills 4 · Hero cards 12.

## 1.5 Strokes
Card outline 1.0px C_LINE · Hover-active 1.0px C_ORANGE · FROZEN 1.0px C_RED · Reasoning 1.0px C_CYAN · Receipt detail 1.0px C_ORANGE.

---

# 2 — Global chrome (visible on every lane)

## 2.1 Top bar (48px exact height)

1. **Brand dot** (orange circle 8×8) — decorative
2. **Wordmark** `ORANGEBOX` (13pt strong) — click → Cockpit lane
3. **Version chip** `v6.0.9` (10pt muted mono) — click → release notes
4. **Vertical separator**
5. **PROJECT** label + project name (or `[no project]` + cyan `Open project →`)
6. (right-to-left from here)
7. **Status pill: VAULT** — chip_led, tooltip = real label
8. **Status pill: ROUTER**
9. **Status pill: 0 EGRESS / 24H**
10. **Status pill: QUEUE 0**
11. **Status pill: CODEXA**
12. **Cost meter** `$X.XXXX / 24H` (mono 11pt) — color thresholds: <$0.01 muted · $0.01-$0.50 soft · $0.50+ yellow · $5.00+ red
13. **·** decorative separator
14. **FROZEN badge** (conditional, 62×18 red) — visible iff freeze.active
15. **LOCAL ▲** (cyan if local-mode active, muted otherwise)
16. **NO TELEMETRY** label
17. **? help button** (28×28) — toggles shortcut overlay

## 2.2 Left rail (220px fixed)

11 lane buttons in this order:

| # | Lane | Glyph | Shortcut | Tagline (40-char max) |
|---|---|---|---|---|
| 1 | Cockpit | `⌖` | Ctrl+1 | Home, DAG, party-line, Now panel. |
| 2 | IDE | `{ }` | Ctrl+2 | Code editor + AI inline edit + multi-file Composer. |
| 3 | Terminal | `›_` | Ctrl+3 | Real shell + Ctrl+K agent overlay + streamed receipts. |
| 4 | Trilane | `△` | Ctrl+4 | Claude + GPT + Gemini debate in parallel. You vote. |
| 5 | Voice | `◉` | Ctrl+5 | Local Whisper. Speak intent, get code. |
| separator | | | | |
| 6 | 𝕏 Feed | `𝕏` | Ctrl+6 | Live X via Hermes. No incumbent has this. |
| 7 | Vault | `⬡` | Ctrl+7 | Compounding lattice. Smarter every session. |
| 8 | Receipts | `▤` | Ctrl+8 | Proof of work. Shareable as artifact. |
| 9 | Privacy | `◆` | Ctrl+9 | Every API call audited. Air-gap on demand. |
| separator | | | | |
| 10 | Skils | `✦` | Ctrl+0 | Skil.Ski marketplace via one MCP endpoint. |
| 11 | Settings | `⚙` | Ctrl+, | Cockpit pin · keys · privacy · language · a11y. |

### Lane-button states

| State | Background | Glyph | Label | Border |
|---|---|---|---|---|
| Default | transparent | muted | soft | none |
| Hover | C_BG_3 | orange | primary | none |
| Active | C_BG_3 | orange | orange | 1.0px C_ORANGE |

## 2.3 Center panel
Fill C_BG_0 · 40px top space · vertical ScrollArea · lane content via `match self.active`.

## 2.4 Bottom footer (28px exact)
`MOM'S LAW` pill · lane mirror · push right · `local-first · receipts everywhere · v6.0.9`

## 2.5 Keyboard shortcut overlay (`?` toggles)

```
GLOBAL
  ?            Toggle this overlay
  Esc          Close any overlay
  Ctrl+,       Settings

LANES
  Ctrl+1..0    Lanes 1–10 (Cockpit through Skils)

LANE-LOCAL (in IDE)
  Ctrl+S       Save buffer
  Ctrl+Enter   Run composer

LANE-LOCAL (in Terminal)
  Enter        Send command
  Ctrl+L       Clear scrollback

LANE-LOCAL (in Trilane)
  Ctrl+Enter   Fire trilane/quadlane

LANE-LOCAL (in Vault)
  Ctrl+Enter   Run keyword search
  Alt+Enter    Run cited stream (needs ANTHROPIC_API_KEY)

LANE-LOCAL (in Receipts)
  Ctrl+F       Focus filter
  Esc          Close detail panel

LANE-LOCAL (in Settings)
  Ctrl+S       Save all settings
```

---

# 3 — Lane specs (every button / input / chip / state)

## Lane 1 — Cockpit (Home)

**Goal:** glance entire system in ≤3 seconds. Max-width 1700.

### 3.1.1 Frame chrome (top of lane)
Traffic-light trio (decorative) · path bar `ORANGEBOX::COCKPIT · V6.0.9 · SESSION 0x<hex>` · right side: cost meter · FROZEN (cond) · LOCAL ▲ · NO TELEMETRY.

### 3.1.2 Three gradient progress cards
3-column. Each: eyebrow (mono cyan) · big % top-right (28pt strong) · gradient bar orange→cyan · title 16pt · sublabel mono 10pt muted.

| Card | Eyebrow | Title | Sublabel | % source |
|---|---|---|---|---|
| 1 | VISION_RAIL | Vision Rail | DAG · MISSION SPINE | `count(status.*.ok)/5` |
| 2 | PARTY_LINE | Party Line | JSONL · STATUS BUS | `min(50, receipts.len())/50` |
| 3 | TRIAD_LANES | Triad Lanes | STRATEGY / ENG / XP | `providers_active/5` |

### 3.1.3 Party-line LIVE row
Eyebrow `::PARTY_LINE · LIVE` · source-badge cyan 56×24 (first 8 chars of latest receipt.source, or `IDLE`) · `RECEIPT` orange mono · `<title> · <ts.slice(0,19)>` mono 12pt.

Empty: `(no receipts yet — run any action)` muted.

### 3.1.4 Six-stat bottom strip (LIVE — NO hardcoded values)

| Cell | Source | Format |
|---|---|---|
| RECEIPTS | `receipts.len()` | decimal |
| TODAY | count where `ts.startsWith(today)` | decimal |
| SPRINTS | count where source ∈ {sprint, sprint-runner} | decimal |
| COMPOSER | count where source ∈ {composer, composer-auto} | decimal |
| PROVIDERS | `providers_active/5` | `N/5` |
| UPTIME | OnceLock<Instant> since start | `1m` / `12h 03m` / `2d 14h` |

### 3.1.5 Conditional info lines

| Condition | Text | Color |
|---|---|---|
| `freeze.active && root.is_some()` | `🔒 edits restricted to: <root>` | red mono 10pt |
| `incident_count > 0` | `⚠ N incident(s) intaken this session` | yellow mono 10pt |

### 3.1.6 Auto-refresh
10s stale-poll → `/api/v4/receipts/list?limit=500`, `/api/v4/freeze/status`, `/api/v4/privacy/summary`.

### 3.1.7 Receipts emitted
None (read-only view).

---

## Lane 2 — IDE (Composer + Single-file)

**Goal:** edit one file OR fan a multi-file change through LLM. Max-width 1400.

### 3.2.1 Composer block (TOP)

Section card "COMPOSER · multi-file plan":
- Instruction (TextEdit::multiline 2 rows)
- Files (multiline 3 rows mono — newline-split paths)
- **Scaffold ▶** (dark) — POST `/api/v4/composer/scaffold`, no LLM call
- **Run ▶** (orange) — POST `/api/v4/composer/run` `auto_apply=false`
- **Run + Apply ▶** (red, destructive) — `auto_apply=true`
- **Copy plan** — clipboard
- Plan output 320px ScrollArea with +/− color-coded diff per file

### 3.2.2 Composer diff renderer
Per change sub-card:
- Kind badge: `CREATE` green / `MODIFY` orange
- File path mono 10pt
- Diff lines colored:
  - `+++/---` muted
  - `@@` cyan
  - `+` green
  - `-` red
  - context soft

### 3.2.3 Single-file editor (BOTTOM)
Eyebrow `SINGLE-FILE EDITOR`. Path input · **Load** · **Save** (orange) · save message · code_editor TextEdit::multiline 28 rows.

### 3.2.4 Microcopy

| Trigger | Message |
|---|---|
| Empty path hint | `Absolute path, e.g. C:\AtomEons\orangebox\README.md` |
| Load OK | `Loaded.` |
| Load error | `Load error: <reason>` |
| Save OK | `Saved ✓` |
| Save workspace-denied | `Save error: Access denied: path outside allowed root` |
| Save freeze-denied | `Save error: FROZEN: edits restricted to <root>, attempted <path>` |
| Composer no key | result JSON: `ANTHROPIC_API_KEY missing — set it in Settings (Ctrl+,)` |
| LLM JSON invalid | `LLM did not return valid JSON: <parser error>` |

### 3.2.5 Receipts emitted
- Save → `source:"fs-write"`, title `File write: <basename>`
- Run+Apply → `source:"composer-auto"`, title `Composer one-shot: N/M files`

### 3.2.6 Keyboard
- `Ctrl+S` → Save
- `Ctrl+Enter` (in Composer) → Run

---

## Lane 3 — Terminal

**Goal:** persistent pwsh session, no console flash. Max-width 1300.

### 3.3.1 Controls
- Command input (singleline 1000px mono, Enter triggers Run)
- **Run ▶** orange 80×24
- Scrollback area 500px sticky-bottom green mono
- **Clear** button (doesn't kill session)

### 3.3.2 Microcopy

| Trigger | Message |
|---|---|
| Empty input | `> e.g. dir, where node, echo %APPDATA%` |
| Empty scrollback | `(no output yet)` |
| Command echoed | `\n> <command>\n` |
| Destructive blocked | `[CAREFUL] BLOCKED: <reason> — set ORANGEBOX_CAREFUL=0 to override.\n` |
| Exit 0 silent | `(exit 0)` |
| Non-zero exit | `(exit <code>)` |
| Exec error | `(error: <message>)` |

### 3.3.3 Destructive patterns blocked
`rm -rf` / `DROP TABLE` / `TRUNCATE` / `git push -f` / `git reset --hard` / `git checkout .` / `git restore .` / `kubectl delete` / `docker rm -f` / `docker system prune` / `shred` / `srm` / `fdisk` / `mkfs`.

Safe exceptions: `node_modules .next dist __pycache__ .cache build .turbo coverage target .venv venv out .pytest_cache`.

### 3.3.4 No-flash guarantee
Every spawn uses `windowsHide:true` + `-WindowStyle Hidden` + `detached:true` (Node) or `CREATE_NO_WINDOW 0x08000000` (Rust).

---

## Lane 4 — Trilane / Quadlane

**Goal:** fan one prompt across 3 or 4 models. Max-width 1500.

### 3.4.1 Mode + toggles row
`Mode:` label · radio `Trilane (3)` / `Quadlane (4 + Grok)` · checkbox `Adversarial` · checkbox `Show reasoning`.

### 3.4.2 Prompt + fire
Prompt input 1100px · **Fire trilane ▶** or **Fire quadlane ▶** orange 160×22.

### 3.4.3 Output grid

| Leg | Trilane | Quadlane |
|---|---|---|
| 1 | CLAUDE · COMPILER (orange) | OPUS 4.7 · COMPILER-DEEP (orange) |
| 2 | GPT-5 · ARCHITECT (cyan) | GPT-5 · ARCHITECT (cyan) |
| 3 | GEMINI · CONSIGLIERE (green) | GEMINI CLI · CONSIGLIERE (green) |
| 4 | — | GROK-2 · WILDCARD (yellow) |

Each card: eyebrow + stream area 500px sticky-bottom. Empty: `(awaiting)`.

### 3.4.4 Reasoning panel (when checkbox on)
Cyan-outlined card below columns · `REASONING · adaptive thinking` header · Clear button · ScrollArea 240px mono 10pt soft.
Empty: `(thinking blocks appear here when synthesis includes adaptive-thinking output)`.

### 3.4.5 Adversarial prompt wrapping
Each leg's prompt prefixed: `You are the <role> in an adversarial multi-model debate. Argue against the consensus. Find what others might miss. Answer in <250 words.\n\nQUESTION: <prompt>`.

### 3.4.6 Receipts emitted
None per leg (egress logged in privacy/summary). v6.1: composite `trilane-fire` receipt with vote outcome.

---

## Lane 5 — Voice

**Goal:** transcript→intent OR WAV→transcription→intent. Max-width 1000.

### 3.5.1 Section A — Upload .wav
Section card "UPLOAD .wav" cyan. Path input 680px · **Transcribe ▶** orange.
Hint: `Needs whisper.cpp installed for actual STT — the endpoint returns a 400 with install hints when not present.`

### 3.5.2 Section B — Manual transcript
Multiline 3 rows · **Classify intent ▶** orange.

### 3.5.3 Section C — Output
Section card "INTENT" orange. Pretty JSON. Empty: `(awaiting intent)`.

### 3.5.4 Microcopy

| Trigger | Message |
|---|---|
| Empty wav hint | `Absolute path to a .wav file (mono 16kHz preferred)` |
| Empty transcript hint | `e.g. open the file v4-server-routes.mjs and find every TODO` |
| Read error | `(read error: <message>)` |
| Transcribe error | `(transcribe error: <message>)` |

### 3.5.5 Receipts emitted
- Transcribe → `source:"voice-transcribe"`
- Classify intent → `source:"voice-intent"`

---

## Lane 6 — 𝕏 Feed (Hermes + AE Alpha News)

**Goal:** real-time X from your follows; AE Alpha News curates AI-link cards from your anchor list. Max-width 1100.

### 3.6.1 Mode toggle row (v6.0.10)
`Mode:` · radio `Hermes stream` (default) · radio `AE Alpha News`.

### 3.6.2 Controls
**↻ Refresh** · **Install Hermes ↗** (opens https://github.com/NousResearch/hermes-agent).

### 3.6.3 Branch — Hermes not installed
Section card "Hermes not installed" with reason + hint `Run: scripts/v4/hermes/INSTALL_HERMES.ps1`.

### 3.6.4 Branch — Hermes installed but errored
Section card "feed not ready" + hint `Run: hermes claw status`.

### 3.6.5 Branch — Ready (Hermes mode)
Post cards in ScrollArea 560px:
- Author `@handle` cyan mono 11pt
- Timestamp mono muted 10pt right-aligned
- Body 12pt primary
- Likes `♡ N`, Reposts `↻ N`, `Open ↗` cyan link

Empty: `(feed empty)`.

### 3.6.6 Branch — AE ALPHA NEWS mode (v6.0.10)
Same card layout PLUS:
- AI score badge (orange 0–100) per card
- Link chip cyan extracted from body
- Source-anchor pill: `Æ @<handle>`

Footer:
- Anchor management text-area (handles, one per line)
- **Save anchors** button → POST `/api/v4/ae-alpha-news/anchors`

### 3.6.7 Microcopy

| Trigger | Message |
|---|---|
| Loading | `(loading…)` |
| No anchors | `No anchors yet. Add X handles below to seed your alpha feed.` |
| AI filter empty | `(no AI-relevant posts in last 24h from your anchors)` |
| Premium required | `X Premium required for full timeline access. Hermes uses your existing X Premium tier.` |

### 3.6.8 Receipts emitted
- Anchors saved → `source:"ae-alpha-anchors"`

### 3.6.9 AE Alpha News architecture (v6.0.10)
- Sources: ONLY accounts you follow on X (`~/.orangebox/ae-alpha-news.json`)
- Pull: through Hermes (uses your X Premium tier — no new API spend)
- Filter: post body contains `http(s)://` URL AND ≥1 AI signal token (`gpt|llm|claude|gemini|grok|opus|sonnet|haiku|inference|model|agent|rag|moe|sparse|distillation|fine-tun|finetune|tokens|reasoning|chain-of-thought|cot`)
- Score: 0–100 based on signal density + recency
- Cache: daily-dedup'd by tweet id; ≤1 fetch/follow/day stays inside Premium quota
- Glyph: `Æ` (U+00C6) — `ae` autocompletes to `Æ` in native TextEdit inputs

---

## Lane 7 — Vault

**Goal:** explore + search + cited-stream. Max-width 1200.

### 3.7.1 Path A — Keyword search (NO API key)
Section card "KEYWORD SEARCH · no LLM, no API key" cyan.
Query 820px · **Search ▶** orange 120×22.
Results 240px ScrollArea per-hit sub-card: `score=N` + file path + 300-char excerpt.
Empty: `(no hits)`.

### 3.7.2 Path B — Cited query stream (needs key)
Eyebrow `CITED QUERY · streaming (needs ANTHROPIC_API_KEY)` orange.
Query · **Query vault ▶** · **Clear**.
Stream area 540px ScrollArea mono soft. Empty: `(awaiting query)`.
Source: SSE from POST `/api/v4/vault/stream`.

### 3.7.3 Path C — Vault inventory
Section card "Vault inventory". Stat row `<N> entries · <N> files · <N.N> KB` · **Refresh** right.
By-source breakdown table.
Source: `GET /api/v4/vault/summary` (reads lattice.jsonl directly, no key needed).

### 3.7.4 Microcopy

| Trigger | Message |
|---|---|
| Keyword hint | `e.g. orangebox doctrine receipts` |
| Cited hint | `e.g. What's the OrangeBox v5 doctrine on receipts?` |
| Cited no key | `(vault error: ANTHROPIC_API_KEY missing)` |
| Empty inventory | `Vault is empty. Run /api/v4/compound/build or write via /api/v4/memory/write.` |

### 3.7.5 Receipts emitted
- Cited query → `source:"vault-cited-query"`
- Keyword search → none (free + read-only)

---

## Lane 8 — Receipts

**Goal:** browse + filter + drill. Max-width 1100.

### 3.8.1 Controls
**↻ Refresh** · `filter:` label · filter input 220px · **✕** (conditional) · `N receipt(s)` muted right-aligned.

Filter matches `source` OR `title` substring (case-insensitive).

### 3.8.2 Receipt card
Source badge orange mono · Title 12pt primary · Timestamp right-aligned · Summary 11pt soft · UUID 9pt dim mono.
Hover: orange outline. Click: opens detail panel.

### 3.8.3 Detail panel (when clicked)
Orange-outlined card. Header `DETAIL` + title + `✕ close` right.
Grid: id / source / timestamp / summary.
Buttons: **Copy id** · **Open receipt file** (opens `%APPDATA%\com.atomeons.orangebox.command\receipts`).

### 3.8.4 Receipt source taxonomy

| Source | Emitted by | Title example |
|---|---|---|
| `fs-write` | `/api/v4/fs/write` | `File write: <basename>` |
| `composer` | composer apply | `Composer apply: N files` |
| `composer-auto` | composer run auto_apply | `Composer one-shot: N/M files` |
| `sprint` | sprint/run | `Sprint plan: <project>` |
| `sprint-runner` | sprint phases | `Sprint phase <id>: <agent>` |
| `mistakes-ledger` | appendMistake() | `Mistake logged: <task>` |
| `telemetry` | telemetry on/off | `Telemetry enabled` / `disabled` |
| `dep-updater` | deps/update | `Deps update: node, hermes` |
| `voice-intent` | voice/intent | `Voice intent: <transcript prefix>` |
| `voice-transcribe` | voice/transcribe | `WAV transcribe: <basename>` |
| `longmemeval` | benchmark run | `LongMemEval-S: R@5=X%` |
| `incident-intake` | incident webhook | `Incident: <alert_id>` |
| `vault-cited-query` | vault cited | `Cited query: <q prefix>` |
| `careful-block` | careful (v6.1) | `Destructive blocked: <pattern>` |
| `terminal-exec` | shell exec (v6.1) | `Shell: <cmd prefix>` |
| `freeze-set` | freeze (v6.1) | `Freeze active: <root>` |
| `ae-alpha-anchors` | anchors save (v6.0.10) | `AE anchors: N handles` |
| `v4-server` | catch-all | `<custom>` |

### 3.8.5 Microcopy

| Trigger | Message |
|---|---|
| Empty list | `No receipts yet. Run any action.` |
| Filter hint | `source contains…` |
| No matches | `(no receipts match filter)` |

### 3.8.6 Keyboard
- `Ctrl+F` focuses filter
- `Esc` (detail open) closes detail

---

## Lane 9 — Privacy

**Goal:** transparent egress + mode visibility. Max-width 1100.

### 3.9.1 TOTALS card (left)
Big `<calls>` 32pt strong · `API calls` muted · Big `<cents.4>¢` 22pt strong orange · `total cost` muted · Token row `<in> ↑  <out> ↓  <cached> cached` mono 11pt soft.

### 3.9.2 MODE card (right)
Row `Air-gap (LOCAL_MODE)` 13pt + right `ON` green or `OFF` muted strong.
`Ollama: <host>` mono 10pt muted.
Hint `Toggle in Settings (Ctrl+,)` 10pt dim.

### 3.9.3 BY PROVIDER card (full-width)
Per provider: name cyan mono 120px · `N calls` 11pt soft · right-aligned `<cents>¢` orange mono.
Empty: `No egress recorded.`

### 3.9.4 Receipts emitted
None (read-only).

---

## Lane 10 — Skils

**Goal:** browse + fire every capability. Max-width 1300.

### 3.10.1 Controls
Filter input 720px · **↻ Refresh** · `N total` right-aligned mono.

Filter matches `name` OR `title` OR `description`.

### 3.10.2 Skill list
ScrollArea 540px. Per item sub-card:
- Kind badge 64×20: `INTERNAL` orange / `SKILL` cyan / `AGENT` green / `RULE` yellow
- Title 13pt strong primary
- **Fire ▶** right-aligned 56×18 orange
- Name mono 10pt muted (right of Fire)
- Description 11pt soft (single line)

### 3.10.3 Fire
POST `/api/v4/skills/fire` with `{name, prompt:""}`. Returns suggested_call. v6.0.9: discards response. v6.1: result toast.

### 3.10.4 Bottom — Skil.Ski MCP
Section card "Skil.Ski marketplace MCP endpoint" with pre-formatted JSON snippet · **Copy MCP snippet** · **Open Skil.Ski ↗**.

### 3.10.5 Microcopy

| Trigger | Message |
|---|---|
| Filter hint | `filter: name, title, or description…` |
| No matches | `No skills match.` |

---

## Lane 11 — Settings

**Goal:** every operator-configurable surface in one screen. Max-width 760.

### 3.11.1 Section — API keys
Section card "API keys (saved to data root, never displayed)".
Per row: label 200px mono · password TextEdit::singleline 440px · ✓/—.

5 rows: `ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `GOOGLE_API_KEY` · `GROQ_API_KEY` · `OPENROUTER_API_KEY`.

### 3.11.2 Section — Air-gap (LOCAL_MODE)
Checkbox `Force local Ollama for routable tasks` · right `ACTIVE` green / `OFF` muted.
Sub-hint `Ollama host: <host>` mono 10pt muted.
Footnote `Excludes synthesis · architecture · pr_review`.

### 3.11.3 Section — Budget mode
Radio `strict` / `balanced` / `quality`.

### 3.11.4 Save row
**Save all settings ▶** orange 180×28 · result label `Saved.` green or `Error: <reason>` red.
POST `/api/v4/settings/api-keys` with delta object.

### 3.11.5 Section — Dependencies (v6.0.9 NEW)
Auto-fetch `/api/v4/deps/status`.
For node and hermes:
- Label 80px mono strong
- `current: <version>` soft mono 10pt
- `latest: <version>` cyan mono 10pt
- Right pill `UPDATE AVAILABLE` yellow or `UP TO DATE` green

Buttons: **Update Node ▶** · **Update Hermes ▶** · **Refresh status**.
POST `/api/v4/deps/update` with `{which}`.

### 3.11.6 Section — Router combos
Multiline JSON editor pre-loaded from `~/.orangebox/router/combos.json`.
**Save combos** · **Reload from disk**.
Client-side JSON validation; red error on invalid.

### 3.11.7 Section — About
`ORANGEBOX v6.0.9` · brand strapline · `Sidecar reachable: yes/no`.

### 3.11.8 Microcopy

| Trigger | Message |
|---|---|
| Save success | `Saved.` green |
| Save error | `Error: <reason>` red |
| Deps loading | `Fetching latest versions…` muted |
| Combos save success | `Saved ✓` green |
| Combos invalid | `Invalid JSON: <reason>` red |
| Air-gap on | right-side `ACTIVE` green |
| Air-gap off | right-side `OFF` muted |

### 3.11.9 Receipts emitted
- Save all → `source:"settings-write"` (v6.1)
- Update Node/Hermes → `source:"dep-updater"`
- Combos save → `source:"combos-write"` (v6.1)

### 3.11.10 Hot-reload
POST settings hot-sets `process.env.*` in sidecar. No restart needed. LOCAL_MODE swap takes effect on next router decision.

---

# 4 — State machine catalog

## 4.1 Composer state machine
```
[idle] → Scaffold → [scaffolding] → ok → [has-prompt]
[idle] → Run → [running] → ok → [has-plan] / err → [error]
[has-plan] → Apply → [applying] → ok → [applied] / err → [partial]
[any] → Copy plan → (no transition; clipboard set)
```

## 4.2 Trilane state machine
```
[idle] → Fire → [running] (N legs spawn concurrent)
  per-leg [streaming] → DONE → [leg-done] / err → [leg-error]
  Watcher: when all legs leg-done|leg-error → [done]
[done] → Fire → [idle] → [running] (clears each leg sink)
```

## 4.3 Freeze state machine
```
[off] → POST /freeze/set active=true → [active]
[active] → POST /freeze/set active=false → [off]
[active] + write outside root → 403 FROZEN response
```

## 4.4 Shell session state machine
```
[start] → spawn pwsh → [alive] (PID, listeners)
[alive] → exec command → stdin written, stdout streams
[alive] → destructive cmd → careful-block, NOT exec
[alive] → kill → [dead]
[any] → pwsh crash → [dead] + 'exit' event
```

## 4.5 Settings save flow
```
[clean] → edit → [dirty]
[dirty] → Save → [saving]
[saving] → POST ok → [saved] green → 3s → [clean]
[saving] → POST err → [error] red → next edit → [dirty]
```

---

# 5 — API call catalog (every endpoint touched by UI)

| Endpoint | Method | Lane | Request shape | Response shape |
|---|---|---|---|---|
| `/api/v4/cockpit/status` | GET | Cockpit | none | `{project,vault,router,privacy,queue,codexa,v6}` |
| `/api/v4/receipts/list?limit=N` | GET | Cockpit, Receipts | none | `{items:[{id,source,title,ts,summary,evidence}]}` |
| `/api/v4/receipts/emit` | POST | (any) | `{source,title,summary,evidence}` | `{id, path}` |
| `/api/v4/privacy/summary` | GET | Cockpit, Privacy | none | `{totals:{calls,costCents,...},byProvider}` |
| `/api/v4/freeze/status` | GET | Cockpit | none | `{active, root, scope, projects}` |
| `/api/v4/freeze/set` | POST | Settings | `{active,root,scope,project?}` | same |
| `/api/v4/careful/check` | POST | Terminal | `{command}` | `{destructive,reason,pattern}` |
| `/api/v4/sprint/run` | POST | Skils Fire | `{prompt,project}` | full sprint plan |
| `/api/v4/router/route` | POST | Trilane | `{task,hint,budget,prefer,conversationTurns}` | full routing decision |
| `/api/v4/router/combos` | GET/POST | Settings | combos JSON | same |
| `/api/v4/model/stream` | POST SSE | Trilane, Vault | `{messages,routed:{provider,model}}` | SSE `data: {delta}` |
| `/api/v4/composer/scaffold` | POST | IDE | `{prompt,files[]}` | `{llm_prompt,file_count}` |
| `/api/v4/composer/run` | POST | IDE | `{prompt,files,auto_apply,model?}` | `{ok,plan,applied?}` |
| `/api/v4/composer/plan` | POST | (workflow) | `{llm_json}` | `{ok,plan_id,proposed[]}` |
| `/api/v4/composer/apply` | POST | (workflow) | `{plan,accept_ids}` | `{ok,results[]}` |
| `/api/v4/shell/start` | POST | Terminal | `{id?}` | `{id,pid,alive}` |
| `/api/v4/shell/exec` | POST | Terminal | `{id,command,wait_ms,careful}` | `{ok,stdout,stderr,exit,blocked?}` |
| `/api/v4/shell/kill` | POST | Terminal | `{id}` | `{killed}` |
| `/api/v4/shell/list` | GET | (admin) | none | `{sessions[]}` |
| `/api/v4/vault/cited-query` | POST | (legacy) | `{question,topN}` | `{citations,answer}` |
| `/api/v4/vault/stream` | POST SSE | Vault | `{question}` | SSE tokens |
| `/api/v4/vault/summary` | GET | Vault | none | `{exists,entries,files,bytes,by_source,recent}` |
| `/api/v4/vault/search` | POST | Vault | `{query,limit}` | `{ok,hits[{score,file,excerpt}]}` |
| `/api/v4/memory/summary` | GET | (admin) | none | `{working,episodic,semantic,procedural}` |
| `/api/v4/memory/consolidate` | POST | (cron) | none | tier counts |
| `/api/v4/memory/decay` | POST | (cron) | `{tiers}` | per-tier results |
| `/api/v4/skills/list` | GET | Skils | none | `{skills[],agents[],rules[],internal[],counts}` |
| `/api/v4/skills/fire` | POST | Skils | `{name,prompt}` | `{ok,skill,suggested_call}` |
| `/api/v4/hermes/feed?limit=N` | GET | 𝕏 Feed | none | `{ok,installed,items[],reason?,hint?}` |
| `/api/v4/ae-alpha-news/feed` | GET | 𝕏 Feed (v6.0.10) | none | `{ok,items[],last_pulled_at}` |
| `/api/v4/ae-alpha-news/anchors` | GET/POST | 𝕏 Feed (v6.0.10) | `{anchors:[]}` | same |
| `/api/v4/incident/intake` | POST | (webhook) | webhook payload | `{incident,plan_id,slack?}` |
| `/api/v4/benchmark/longmemeval/run` | POST | Settings | `{dataset?,topk?}` | `{n,R5,R10,MRR,detail[]}` |
| `/api/v4/settings/api-keys` | GET/POST | Settings | partial deltas | `{keys,v6}` / `{ok,saved_to,presence}` |
| `/api/v4/deps/status` | GET | Settings | none | `{node,hermes}` |
| `/api/v4/deps/update` | POST | Settings | `{which}` | `{<dep>:{ok,version,bytes}}` |
| `/api/v4/reasoning/extract` | POST | (manual) | `{rawContent[]}` | `{thinking_text,text,blocks[]}` |
| `/api/v4/caveman` | POST | (admin) | `{text,level}` | `{text,original,compressed,savings_pct}` |
| `/api/v4/context/{save,list,restore}` | POST/GET | (admin) | various | various |
| `/api/v4/handoff/{compose,list,read}` | POST/GET | (admin) | various | various |
| `/api/v4/zoom-out` | POST | (admin) | `{root,workspace?,maxFiles}` | `{entry_points,top_hubs,exports}` |
| `/api/v4/cost/today` | GET | Cockpit chrome | none | `{total_cents,by_provider}` |
| `/api/v4/checkpoint/{save,restore,list}` | POST/GET | (cron) | various | various |

---

# 6 — Error catalog (every visible error)

## 6.1 Composer
| Error | Source | Remediation |
|---|---|---|
| `ANTHROPIC_API_KEY missing — set it in Settings (Ctrl+,)` | server 502 | open Settings, paste key |
| `LLM did not return valid JSON: <parser error>` | server 502 | adjust prompt, retry |
| `Access denied: path outside allowed root or blocked pattern` | server 403 | move file inside `ORANGEBOX_WORKSPACE_ROOT` |
| `FROZEN: edits restricted to <root>, attempted <path>` | freeze 403 | unfreeze or write to locked dir |
| `prompt + files[] required` | server 400 | fill both |

## 6.2 Terminal
| Error | Remediation |
|---|---|
| `[CAREFUL] BLOCKED: <reason> — set ORANGEBOX_CAREFUL=0 to override.` | rephrase or override |
| `(error: <message>)` | system-level error |
| `(exit <code>)` | non-zero exit; inspect output |

## 6.3 Trilane
| Per-leg error | Remediation |
|---|---|
| `[ANTHROPIC_API_KEY missing]` | Settings → key |
| `[OPENAI_API_KEY missing]` | same |
| `[GOOGLE_API_KEY missing]` | same |
| `[GROQ_API_KEY missing]` | same |
| `[XAI_API_KEY missing]` | same |
| `[<provider> stream error: <message>]` | network / quota |

## 6.4 Vault
| Error | Remediation |
|---|---|
| `(vault error: ANTHROPIC_API_KEY missing)` | Settings → key |
| `vault/lattice.jsonl missing` | seed via `/api/v4/memory/write` |

## 6.5 Settings
| Error | Remediation |
|---|---|
| `Invalid JSON: <details>` | fix combos |
| `Error: <reason>` | retry save |
| `Manifest fetch failed` | network issue |

## 6.6 IDE / fs
| Error | Remediation |
|---|---|
| `Load error: ENOENT, no such file or directory` | check path |
| `Save error: <message>` | check workspace + freeze |

---

# 7 — Receipt schema

```jsonc
{
  "id":      "<uuid-v4>",                    // unique
  "source":  "<source-kind>",                // see Lane 8 taxonomy
  "title":   "<short, max 200 chars>",
  "summary": "<one-line, optional>",
  "evidence": { /* domain-specific keys */ },
  "ts": "2026-05-17T13:00:00.000Z"           // ISO-8601 UTC
}
```

Stored: `<dataRoot>/receipts/<id>.json`. Read via `GET /api/v4/receipts/list?limit=N`. Share via `POST /api/v4/receipts/share`.

---

# 8 — Privacy guarantees per lane

| Lane | LOCAL_MODE behavior | Default-mode egress |
|---|---|---|
| Cockpit | All local | `/cockpit/status` polls only |
| IDE single-file | All local | None |
| IDE Composer | LLM hits Anthropic | Anthropic (logged) |
| Terminal | Local cmd exec | None |
| Trilane | LOCAL_MODE swaps to Ollama (excl. synthesis/architecture/pr_review) | Anthropic + OpenAI + Google + xAI |
| Voice | WAV stays local | None (whisper.cpp local) |
| 𝕏 Feed | Hermes is your local X access | X API via Hermes |
| Vault keyword | Local lattice.jsonl | None |
| Vault cited | Anthropic stream | Anthropic |
| Receipts | All local | None |
| Privacy | All local | None |
| Skils browse | All local | None |
| Settings | Local file write | None |

**Air-gap (`ORANGEBOX_LOCAL_MODE=1`):** routable tasks (autocomplete, inline_edit, multi_file_edit, vault_query, chat, voice_intent, quick_reply) → Ollama. Excluded: synthesis, architecture, pr_review.

---

# 9 — Accessibility (WCAG 2.1 AA)

| Criterion | v6.0.9 status |
|---|---|
| Contrast (primary text) | ✓ E8EAF0 on 0A0A0C = 17.3:1 (AAA) |
| Contrast (muted text) | ✓ 9CA3B5 on 0A0A0C = 9.2:1 (AAA) |
| Contrast (orange button) | ✓ FF6900 on 0A0A0C = 5.9:1 (AA) |
| Keyboard nav | ✓ Ctrl+1..0 covers every lane |
| Focus indicator | ✓ egui orange outline |
| Screen reader | ✗ egui→AccessKit deferred to v6.2 |
| Reduced motion | ✓ no animations in v6.0.9 |
| Text resize 200% | partial — egui zoom_factor manual |

---

# 10 — Microcopy library (every visible string, frozen)

## 10.1 Hints (placeholders)
- IDE path: `Absolute path, e.g. C:\AtomEons\orangebox\README.md`
- Composer instruction: `e.g. Add a `--dry-run` flag to all CLI entry points; print the planned action and exit 0.`
- Composer files: `C:\path\to\file1.mjs\nC:\path\to\file2.mjs`
- Terminal: `> e.g. dir, where node, echo %APPDATA%`
- Trilane prompt: `Ask all legs… e.g. 'Best path for auth in our stack?'`
- Vault keyword: `e.g. orangebox doctrine receipts`
- Vault cited: `e.g. What's the OrangeBox v5 doctrine on receipts?`
- Voice WAV: `Absolute path to a .wav file (mono 16kHz preferred)`
- Voice transcript: `e.g. open the file v4-server-routes.mjs and find every TODO`
- Receipts filter: `source contains…`
- Skills filter: `filter: name, title, or description…`
- API key empty: `paste key here`
- API key set: `[saved ✓] enter new value to replace`
- Combos JSON: `{ "my-combo": [ {"provider":"anthropic","model":"claude-opus-4-7-20250930"} ] }`

## 10.2 Empty states
- `No receipts yet. Run any action.`
- `(no receipts match filter)`
- `(no hits)` (vault)
- `(awaiting query)` (vault cited)
- `(awaiting)` (trilane leg)
- `(awaiting intent)` (voice)
- `(no output yet)` (terminal)
- `(loading…)` (X feed)
- `(feed empty)` (X feed)
- `No anchors yet. Add X handles below to seed your alpha feed.` (AE Alpha)
- `(no changes proposed)` (composer)
- `(thinking blocks appear here when synthesis includes adaptive-thinking output)` (reasoning)
- `No skills match.`
- `No egress recorded.` (Privacy)
- `Vault is empty. Run /api/v4/compound/build or write via /api/v4/memory/write.`

## 10.3 Success states
- `Saved.` (Settings)
- `Saved ✓` (combos, IDE)
- `Loaded.` (IDE)
- `Composer one-shot: N/M files`

## 10.4 Action-required
- `Open project →` (top bar)
- `Install Hermes ↗`
- `Open Skil.Ski ↗`
- `Toggle in Settings (Ctrl+,)`
- `Each command runs via persistent pwsh; safe within current user.`
- `Needs whisper.cpp installed for actual STT.`

## 10.5 Warning
- `UPDATE AVAILABLE` (deps pill — yellow)
- `🔒 edits restricted to: <root>` (cockpit — red)
- `⚠ N incident(s) intaken this session` (cockpit — yellow)
- `(no AI-relevant posts in last 24h from your anchors)` (AE Alpha)
- `X Premium required for full timeline access.`

## 10.6 Disabled / busy
- Busy button labels: `working…` / `running…` / `applying…` / `scaffolding…` / `querying…`
- Disabled: greyed (egui), no extra text

---

# 11 — Lane-readiness checklist (v6.0.9 honest)

| Lane | Functional% | Hardcoded? | Zero-config? | v6.1 deferral |
|---|---|---|---|---|
| Cockpit | 100% | none | Yes | density toggle |
| IDE single-file | 95% | none | Yes (with workspace) | syntax highlighting |
| IDE Composer | 80% | none | Needs ANTHROPIC_API_KEY | result-toast |
| Terminal | 80% | none | Yes | full ANSI/PTY |
| Trilane | 85% | none | Needs ≥1 provider key | vote/decision capture |
| Voice | 50% | none | Manual transcript yes | native mic capture |
| 𝕏 Feed (Hermes) | 70% | none | Needs Hermes install | — |
| 𝕏 Feed (AE Alpha) | 0% (v6.0.10) | n/a | n/a | this is the next build |
| Vault keyword | 90% | none | Yes | tree-sitter |
| Vault cited | 70% | none | Needs ANTHROPIC_API_KEY | inline citations |
| Receipts | 95% | none | Yes | export to PDF |
| Privacy | 95% | none | Yes | provider quotas |
| Skils browse | 90% | none | Yes | result-toast on Fire |
| Settings | 95% | none | Yes | density, language |

Weighted average across 14 surfaces: **~83%**.

What's left to hit 100%:
1. AE Alpha News tab (v6.0.10) — ~250 LOC server + native
2. Streaming reasoning during Trilane fire (not on-demand) — ~120 LOC
3. Settings density + zoom — ~80 LOC
4. Composer apply diff hash chain — ~50 LOC
5. Receipts export markdown bundle — ~80 LOC

---

# 12 — Onboarding flow (first run)

1. Sidecar spawns windowsHide on `127.0.0.1:8787` + tunnel `8788`
2. Cockpit lane opens 1500×960 centered
3. Status pills initialize: VAULT yellow / ROUTER green / EGRESS green / QUEUE green / CODEXA yellow
4. Cost meter `$0.00 / 24H`
5. LOCAL muted, no FROZEN

### First-use prompts
- No `ANTHROPIC_API_KEY`: top-of-Cockpit banner `Set an API key in Settings (Ctrl+,) to unlock LLM-driven lanes.`
- No `ORANGEBOX_WORKSPACE_ROOT`: when clicking `Open project →` → IDE banner `Set ORANGEBOX_WORKSPACE_ROOT to enable file ops.`

### Recommended path
1. Ctrl+, → Settings → paste ≥1 API key
2. Ctrl+0 → Skils → browse capabilities
3. Ctrl+4 → Trilane → first parallel fire
4. Ctrl+8 → Receipts → see proof

---

# 13 — UX principles (locked, no drift)

1. **One direction per lane** — ONE primary CTA orange. Secondary actions darker.
2. **Hierarchy + density** — eyebrow (mono cyan/orange) → h2 (Proportional 28pt) → body (14pt). Eyebrows scannable; bodies readable.
3. **State coverage** — every interactive element: loading / empty / error / success / disabled. No silent voids.
4. **Keyboard journey** — Ctrl+1..0 + Ctrl+, covers every lane. `?` overlay. Esc closes.
5. **Receipt for every action** — every mutating click emits `source: <action>` receipt.
6. **No-key safe paths** — Vault search + inventory, Skils, Privacy, Receipts, Settings read, Cockpit, Terminal cmd, Voice manual all work zero-key.
7. **No flash** — no console windows visible on any operation.
8. **Auto-update** — Node + Hermes versions visible in Settings; one-click update no PS flash.
9. **Local-first** — every primitive works without remote calls when possible.
10. **Receipts are the contract** — claims without receipts don't count.

---

# 14 — Component primitives (egui implementation)

| Primitive | Signature | Used for |
|---|---|---|
| `chip_led(label, ok, reachable)` | top-bar status pills | 5 pills + future custom |
| `lane_button(lane, active)` | left rail | 11 buttons |
| `section_card(label, body)` | wrapper | every card |
| `gradient_card(key, title, sub, pct)` | Cockpit 3-up | 3 instances |
| `stat_cell(label, value)` | Cockpit bottom strip | 6 cells |
| `eyebrow(text)` | mono 11pt orange strong | every lane top |
| `h1/h2/p` | typography helpers | every lane |
| `open_url(url)` | `cmd /C start "" <url>` + CREATE_NO_WINDOW | external links |

---

# 15 — Pass-document policy

This file is the **v6 UX contract**. Every element listed is enforceable.

When operator UX mockups land, every visible item should map to a named row OR represent a v6.1+ extension named in Section 11.

**Drift policy:** an element that appears in UI but isn't in this doc AND isn't labeled v6.1+ is a **Mom's Law violation** and must be closed before ship.

**Update policy:** when this doc is amended, increment version footer and add a row in Section 16.

---

# 16 — Changelog

| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-05-17 | Initial UX scope passed (v6.0.9 baseline) |
| 1.1 | 2026-05-17 | Expanded with full microcopy library, state machines, API call catalog, receipt taxonomy, error catalog, accessibility, AE Alpha News surface scoped (v6.0.10), onboarding flow, error catalog, design tokens fully enumerated, component primitives documented. Roughly doubled in depth. |
| 1.2 | 2026-05-17 | v6.0.11 precision pass: locked microcopy for Trilane vote panel, Reasoning live-stream button, Receipts export button, Vault cited query button + citation map, Settings density/zoom/project-name sections, Voice whisper banner, Cockpit Today bar chart, X-Feed AI threshold slider + keyboard nav, Onboarding banner. 18/18 receipt sources now emitted (was 13/18). Composer apply receipt evidence extended with SHA-256 chain. 50/50 smoke audit passed live (`docs/SMOKE_v6.0.11_*.md`). |

---

# 17 — v6.0.11 microcopy additions (additive to §10)

## 17.1 Trilane vote panel
- Eyebrow: `VOTE · which leg wins?` (orange, mono 10pt)
- Radio labels: `CLAUDE` / `OPUS` (quad) / `GPT` / `GEMINI` / `GROK` (quad) / `MERGE (no single winner)`
- Reasons label: `Why this leg won (optional, captured as receipt evidence):`
- Reasons placeholder: `e.g. 'GPT caught the migration ordering risk the others missed'`
- Button: `Record vote`
- Success: `vote recorded: <uuid> · <iso-ts>`
- Error: `error: <message>`

## 17.2 Reasoning panel (Trilane lane)
- Live header: `REASONING · live synthesis stream` (orange when streaming)
- Idle header: `REASONING · synthesis rationale` (cyan)
- Button: `Stream synthesis`
- Button: `Clear`
- Empty: `(click 'Stream synthesis' after legs return — live rationale appears here)`

## 17.3 Receipts lane export
- Button: `⬇ Export markdown` (cyan)
- In-progress: `exporting…`
- Success: `exported N receipt(s) → <abs-path>`
- Error: `error: <message>`

## 17.4 Vault cited query
- Button: `Cited [1] ➤` (cyan, alongside existing `Stream ➤`)
- Eyebrow: `CITED ANSWER · [N] markers tie to source map below` (cyan, mono 10pt)
- Sources header: `SOURCES` (muted, mono 10pt strong)
- Source cell: `[N]` (cyan strong) + document_title + cited_text in `“…”`

## 17.5 Settings — Display
- Section title: `Display · density + zoom`
- Density label: `Density`
- Density options: `compact` / `comfortable` / `spacious`
- Zoom label: `Zoom`
- Zoom slider suffix: `×`
- Zoom reset button: `Reset`
- Note: `Applies to all lanes on next render. Persisted in settings file.`

## 17.6 Settings — Project name
- Section title: `Project name (shown in footer)`
- Field label: `Name`
- Placeholder: `e.g. AtomEons / orangebox / skil.ski`
- Note: `Empty = shows '[no project]'. Stored locally in settings.`

## 17.7 Voice whisper banner
- Eyebrow (ready): `WHISPER ✓` (green) · body `local STT ready · <path>`
- Eyebrow (missing): `WHISPER ⚠` (yellow) · body `whisper.cpp not detected — STT will fall back to cloud (needs key) or return a clear error.`
- Action: `Install hint ↗` (only when missing)
- Detail (when missing): `Releases page: github.com/ggerganov/whisper.cpp/releases. After install, ensure whisper-cli is on PATH or at ./bin/whisper-cli.`

## 17.8 Cockpit Today bar chart
- Header: `TODAY · BY SOURCE` (orange, mono 10pt strong)
- Right: `N receipt(s) today` (muted, mono 10pt)
- Empty: `(no activity yet today — run any action and reload)`
- Bars: orange fill, cyan source label, count on right

## 17.9 X-Feed AI threshold + kbd nav
- Label: `AI ≥`
- Right hint: `J/K next/prev · Enter open link · 24h cache` (dim, mono 10pt)
- Empty filter: `(no cards pass AI score ≥ N — lower the threshold)`

## 17.10 Onboarding banner (cockpit, first-run)
- Header: `👋 WELCOME` (orange, mono 11pt strong)
- Body: `OrangeBox runs without keys (vault search, terminal, Æ Alpha if Hermes is set). For Composer + Trilane + Vault citation, add a key in Settings.`
- Buttons: `Add ANTHROPIC_API_KEY ↗` (orange-filled) · `OpenAI key ↗` · `Google AI key ↗`
- Footer: `· then press Ctrl+, to paste into Settings`
- Action: `Dismiss` (per-session)

---

End of spec. **v1.2**
