# ORANGEBOX v4 — Importer Wizards

Doctrine anchor: `docs/V4_MOAT_DOCTRINE.md` (ATOM-OBX-V4-MOAT-2026-0516)
Phase slot: v3.5 (P0 gap plug — "Importer wizards")
Author: Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory

---

## Overview

Three one-click importer wizards let buyers switch from Cursor, Claude Code,
or VS Code to ORANGEBOX without losing their rules, settings, agents, or skills.

All three importers share the same safety contract:

**The source directory is NEVER modified. All writes go exclusively to `--target`.**

---

## Prerequisites

- Node.js 18 or higher
- The ORANGEBOX data root initialized (default: `$HOME/.orangebox`)
- No npm install required — zero external dependencies

---

## Common flags (all three importers)

| Flag | Default | Purpose |
|---|---|---|
| `--source=<path>` | `cwd` | Root of the source project (or settings dir) |
| `--target=<path>` | `$HOME/.orangebox` | ORANGEBOX data root |
| `--dry-run` | off | Show what would happen; write nothing |
| `--help` | — | Print usage and exit |

---

## 1. import-from-cursor.mjs

Migrates Cursor project configuration to ORANGEBOX.

### What is imported

| Source | Destination | Notes |
|---|---|---|
| `.cursor/rules/*.md` | `<target>/skills/imported-cursor-rules.skill.md` | All rule files merged into one skill file |
| `.cursorrules` | `<target>/skills/imported-cursor-rules.skill.md` | Legacy flat-file format; merged with above |
| `.cursor/mcp.json` | `<target>/mcp/cursor-imported.json` | Wrapped in ORANGEBOX MCP envelope; review before enabling |
| `Cursor/User/settings.json` (global) | `<target>/settings/imported-cursor-settings.json` | Portable editor/UI keys only |

Cursor settings.json path by platform:
- Mac: `~/Library/Application Support/Cursor/User/settings.json`
- Windows: `%APPDATA%/Cursor/User/settings.json`
- Linux: `~/.config/Cursor/User/settings.json`

### Extra flags

| Flag | Purpose |
|---|---|
| `--include-global` | Include global Cursor user settings (settings.json import is already attempted by default) |

### What is NOT imported (and why)

| Item | Reason |
|---|---|
| Cursor AI keybindings | Cursor-specific hotkey surface; not portable to ORANGEBOX cockpit |
| Cursor extension marketplace data | ORANGEBOX has its own plugin architecture |
| Cursor model/API keys | ORANGEBOX uses BYO keys — you supply them directly |
| Cursor chat/composer history | Proprietary format; not portable |
| Cursor workspace state (`.history/`, etc.) | Ephemeral session state; not meaningful outside Cursor |
| Cursor tab autocomplete model config | ORANGEBOX uses its own smart model router for inline completion |

### Examples

```sh
# Import from current project directory
node scripts/v4/importers/import-from-cursor.mjs

# Explicit source and target
node scripts/v4/importers/import-from-cursor.mjs --source=/projects/myapp --target=/data/orangebox

# Preview without writing
node scripts/v4/importers/import-from-cursor.mjs --source=. --dry-run

# Include global Cursor settings
node scripts/v4/importers/import-from-cursor.mjs --source=. --include-global
```

---

## 2. import-from-claude-code.mjs

Migrates Claude Code project configuration to ORANGEBOX.

### What is imported

| Source | Destination | Notes |
|---|---|---|
| `.claude/CLAUDE.md` | `<target>/operator/imported-claude-md.md` | Project-level operator instructions |
| `.claude/rules/*.md` | `<target>/rules/<filename>.md` | One file per source file; filenames preserved |
| `.claude/agents/*.md` | `<target>/agents/<filename>.md` | One file per source file; filenames preserved |
| `.claude/skills/*` | `<target>/skills/<filename>` | All file types; flat copy; filenames preserved |
| `.claude/settings.local.json` | `<target>/settings/imported-claude-code-settings.json` | Portable keys only |
| `~/.claude/CLAUDE.md` (global) | `<target>/operator/imported-claude-global-md.md` | Only with `--include-global` |

### Imported settings keys

Only the following keys from `settings.local.json` are translated:

`permissions`, `env`, `apiKeyHelper`, `cleanupPeriodDays`, `includeCoAuthoredBy`,
`preferredNotifChannel`, `model`, `smallFastModel`, `theme`, `verbose`,
`disableNonessentialTraffic`

### Extra flags

| Flag | Purpose |
|---|---|
| `--include-global` | Also import `~/.claude/CLAUDE.md` (global user instructions) |

### What is NOT imported (and why)

| Item | Reason |
|---|---|
| `.claude/todos/` | Session state; not configuration |
| `.claude/cache/` | Ephemeral cache; not portable |
| Anthropic API keys | ORANGEBOX uses BYO keys |
| Claude session/conversation history | Not a portable format |
| `.git/` or any workspace state | Not relevant to ORANGEBOX operator config |
| Hook scripts (pre/post) | Execution environment is different; review and re-add manually |

### Examples

```sh
# Import from current project
node scripts/v4/importers/import-from-claude-code.mjs

# Explicit source and target
node scripts/v4/importers/import-from-claude-code.mjs --source=/projects/myapp --target=/data/orangebox

# Preview without writing
node scripts/v4/importers/import-from-claude-code.mjs --source=. --dry-run

# Include global ~/.claude/CLAUDE.md
node scripts/v4/importers/import-from-claude-code.mjs --source=. --include-global
```

---

## 3. import-from-vscode.mjs

Migrates VS Code workspace configuration to ORANGEBOX.

### What is imported

| Source | Destination | Notes |
|---|---|---|
| `.vscode/settings.json` | `<target>/settings/imported-vscode-settings.json` | Portable editor/UI keys only; JSONC (comments) handled |
| `.vscode/extensions.json` | `<target>/marketplace/imported-vscode-extensions.json` | Recommended extension list; informational only |
| `~/.vscode/extensions/*` | `<target>/marketplace/vscode-extensions-snapshot.json` | Installed extension snapshot; only with `--include-extensions` |

### Imported settings keys (allowlist)

The importer passes through a curated set of portable keys including:
- `editor.*` — font, tabs, formatting, minimap, rulers, cursor, suggestions
- `files.*` — autosave, encoding, EOL, trimming, exclude patterns
- `search.exclude`, `search.useIgnoreFiles`
- `terminal.integrated.*` — font, shell, default profile
- `workbench.colorTheme`, `workbench.iconTheme`, `workbench.editor.*`
- Common formatter configs: `eslint.*`, `prettier.*`
- `typescript.*`, `javascript.*` import behavior keys
- `git.*` autofetch, confirmSync, smartCommit

VS Code-specific integration keys (telemetry, remote, update, extension host, etc.) are discarded.

### Extension snapshot format

The snapshot at `marketplace/vscode-extensions-snapshot.json` lists installed
extensions with parsed fields: `publisher`, `name`, `version`, `id` (e.g.
`esbenp.prettier-vscode`). No extension files are copied. This is a reference
list to help you find ORANGEBOX plugin equivalents.

### Extra flags

| Flag | Purpose |
|---|---|
| `--include-extensions` | Snapshot `~/.vscode/extensions/` (installed list; no files copied) |

### What is NOT imported (and why)

| Item | Reason |
|---|---|
| `.vscode/launch.json` | Debugger configuration is VS Code-specific |
| `.vscode/tasks.json` | VS Code task runner; ORANGEBOX has its own DAG and job queue |
| `.vscode/keybindings.json` | Keybindings are VS Code-specific surface |
| VS Code extensions (files) | ORANGEBOX has its own plugin architecture; snapshot is informational |
| VS Code account / sync state | Not portable |
| Telemetry / update / remote settings | Not applicable to ORANGEBOX |
| Extension host config | VS Code-internal process model |

### Examples

```sh
# Import from current project
node scripts/v4/importers/import-from-vscode.mjs

# Explicit source and target
node scripts/v4/importers/import-from-vscode.mjs --source=/projects/myapp --target=/data/orangebox

# Preview without writing
node scripts/v4/importers/import-from-vscode.mjs --source=. --dry-run

# Include installed extension snapshot
node scripts/v4/importers/import-from-vscode.mjs --source=. --include-extensions
```

---

## Output structure (inside `<target>`)

After running all three importers against a project, the target directory will contain:

```
<target>/
  operator/
    imported-claude-md.md              (from claude-code importer)
    imported-claude-global-md.md       (from claude-code --include-global)
  rules/
    <rule-file>.md  ...                (from claude-code importer)
  agents/
    <agent-file>.md  ...               (from claude-code importer)
  skills/
    imported-cursor-rules.skill.md     (from cursor importer)
    <skill-file>  ...                  (from claude-code importer)
  mcp/
    cursor-imported.json               (from cursor importer)
  settings/
    imported-cursor-settings.json      (from cursor importer)
    imported-claude-code-settings.json (from claude-code importer)
    imported-vscode-settings.json      (from vscode importer)
  marketplace/
    imported-vscode-extensions.json    (from vscode importer)
    vscode-extensions-snapshot.json    (from vscode --include-extensions)
  receipts/
    importer/
      cursor-<timestamp>.json
      claude-code-<timestamp>.json
      vscode-<timestamp>.json
```

---

## Receipt format

Every run (including dry runs that do not write) emits a receipt at:

```
<target>/receipts/importer/<source>-<timestamp>.json
```

The receipt contains:

```json
{
  "importer": "import-from-cursor.mjs v1.0.0",
  "doctrine": "ATOM-OBX-V4-MOAT-2026-0516",
  "timestamp": "2026-05-16T...",
  "dryRun": false,
  "source": "/absolute/path/to/project",
  "target": "/absolute/path/to/.orangebox",
  "summary": [ { "item": "...", "status": "IMPORTED", "reason": "..." } ],
  "artifacts": [ { "path": "/absolute/path/to/output/file" } ]
}
```

Receipts are append-only. Re-running the importer does not delete previous receipts.

---

## Safety guarantee

All three importers enforce the same read-only contract on source:

1. Source files are opened with `fs.readFile` only — never `fs.writeFile`, `fs.unlink`, or any mutation.
2. `--dry-run` skips all `fs.mkdir` and `fs.writeFile` calls. Nothing is written anywhere.
3. Write targets are restricted to the path passed as `--target`. Importers do not write to `process.cwd()`, the source path, or any system directory.
4. No network calls. No spawned processes. No environment mutation.
5. Zero npm dependencies — no supply-chain risk beyond Node.js stdlib.

---

## Acceptance criteria

- `node --check scripts/v4/importers/import-from-cursor.mjs` passes (syntax valid)
- `node --check scripts/v4/importers/import-from-claude-code.mjs` passes
- `node --check scripts/v4/importers/import-from-vscode.mjs` passes
- `--help` prints usage and exits 0 on all three
- `--dry-run` runs without writing any files
- Receipt JSON written to `<target>/receipts/importer/` on every non-dry-run

---

*This module is part of ORANGEBOX v4. Doctrine: ATOM-OBX-V4-MOAT-2026-0516.*
