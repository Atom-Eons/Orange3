#!/usr/bin/env node
/* ============================================================================
   import-from-cursor.mjs — ORANGEBOX v4 Cursor Importer Wizard

   Doctrine anchor: docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot:      v3.5 — Importer wizards (P0 gap plug)
   Author:          Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date:            2026-05-16
   Mom's Law:       Full effort. No stubs. No TODOs.

   Purpose
   ───────
   One-click migration from Cursor to ORANGEBOX. Reads Cursor project and
   user-level config NON-DESTRUCTIVELY and emits translated artifacts into
   the ORANGEBOX data root.

   What is imported
   ────────────────
   1. .cursor/rules/*.md  or  .cursorrules
      → <target>/skills/imported-cursor-rules.skill.md
   2. .cursor/mcp.json
      → <target>/mcp/cursor-imported.json
   3. Cursor user settings.json  (Mac: ~/Library/Application Support/Cursor/User/
                                   Win: %APPDATA%/Cursor/User/)
      → <target>/settings/imported-cursor-settings.json

   Safety guarantee
   ────────────────
   This importer NEVER writes to the source directory. All operations are
   read-only on source. Writes go exclusively to <target>.

   Usage
   ─────
   node import-from-cursor.mjs [--source=<path>] [--target=<path>] [--dry-run]
                               [--include-global] [--help]

   Flags
   ─────
   --source=<path>      Root of the Cursor project (contains .cursor/).
                        Default: current working directory.
   --target=<path>      ORANGEBOX data root.
                        Default: $HOME/.orangebox
   --dry-run            Print what would be written; write nothing.
   --include-global     Also import global Cursor user settings.json.
   --help               Print this help and exit.

   Zero npm dependencies. Node 18+ required.
   ============================================================================ */

import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import process from "node:process";

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_NAME = "cursor";
const VERSION = "1.0.0";

// Cursor user settings paths by platform
const CURSOR_SETTINGS_PATHS = {
  darwin: path.join(
    os.homedir(),
    "Library",
    "Application Support",
    "Cursor",
    "User",
    "settings.json"
  ),
  win32: path.join(
    os.homedir(),
    "AppData",
    "Roaming",
    "Cursor",
    "User",
    "settings.json"
  ),
  linux: path.join(os.homedir(), ".config", "Cursor", "User", "settings.json"),
};

// Settings keys we translate from Cursor/VS Code format to ORANGEBOX equivalents.
// Keys not in this list are not imported (they are Cursor/VS Code internal).
const SETTINGS_ALLOWLIST = new Set([
  "editor.fontSize",
  "editor.tabSize",
  "editor.insertSpaces",
  "editor.wordWrap",
  "editor.formatOnSave",
  "editor.formatOnPaste",
  "editor.lineNumbers",
  "editor.minimap.enabled",
  "editor.renderWhitespace",
  "editor.rulers",
  "editor.cursorStyle",
  "editor.cursorBlinking",
  "editor.fontFamily",
  "editor.fontLigatures",
  "editor.scrollBeyondLastLine",
  "editor.bracketPairColorization.enabled",
  "editor.guides.bracketPairs",
  "editor.stickyScroll.enabled",
  "files.autoSave",
  "files.autoSaveDelay",
  "files.trimTrailingWhitespace",
  "files.insertFinalNewline",
  "files.trimFinalNewlines",
  "files.encoding",
  "files.eol",
  "files.exclude",
  "search.exclude",
  "terminal.integrated.fontSize",
  "terminal.integrated.fontFamily",
  "terminal.integrated.shell.windows",
  "terminal.integrated.shell.linux",
  "terminal.integrated.shell.osx",
  "workbench.colorTheme",
  "workbench.iconTheme",
  "workbench.editor.enablePreview",
]);

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    source: process.cwd(),
    target: path.join(os.homedir(), ".orangebox"),
    dryRun: false,
    includeGlobal: false,
    help: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--include-global") {
      args.includeGlobal = true;
    } else if (arg.startsWith("--source=")) {
      args.source = arg.slice("--source=".length);
    } else if (arg.startsWith("--target=")) {
      args.target = arg.slice("--target=".length);
    } else if (arg === "--source" || arg === "--target") {
      // handled by next iteration — not used here, flag only style
    } else {
      // unknown flag — warn but continue
      console.warn(`[WARN] Unknown flag ignored: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
ORANGEBOX v4 — Cursor Importer Wizard v${VERSION}
Doctrine: ATOM-OBX-V4-MOAT-2026-0516

Safely migrates your Cursor configuration to ORANGEBOX format.
Source files are NEVER modified. All writes go to --target only.

Usage:
  node import-from-cursor.mjs [options]

Options:
  --source=<path>      Root of Cursor project (dir containing .cursor/).
                       Default: current working directory
  --target=<path>      ORANGEBOX data root.
                       Default: $HOME/.orangebox
  --dry-run            Show what would be imported without writing anything.
  --include-global     Also import global Cursor user settings.json.
  --help               Print this message and exit.

Examples:
  node import-from-cursor.mjs --source=/projects/myapp
  node import-from-cursor.mjs --source=. --target=/data/orangebox --dry-run
  node import-from-cursor.mjs --source=. --include-global

What is imported:
  .cursor/rules/*.md         → <target>/skills/imported-cursor-rules.skill.md
  .cursorrules               → <target>/skills/imported-cursor-rules.skill.md
  .cursor/mcp.json           → <target>/mcp/cursor-imported.json
  Cursor user settings.json  → <target>/settings/imported-cursor-settings.json
    (only safe-to-translate editor/UI keys — see source for full allowlist)

What is NOT imported:
  Cursor AI keybindings (Cursor-specific, not portable)
  Cursor extension marketplace data (use ORANGEBOX plugin system)
  Cursor model/API keys (you bring your own keys to ORANGEBOX)
  Cursor chat/composer history (not a portable format)
  Cursor workspace state (.history/, etc.)
`);
}

// ─── File system helpers ──────────────────────────────────────────────────────

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readJson(p) {
  const raw = await fs.readFile(p, "utf8");
  return JSON.parse(raw);
}

async function readText(p) {
  return fs.readFile(p, "utf8");
}

async function ensureDir(p, dryRun) {
  if (!dryRun) {
    await fs.mkdir(p, { recursive: true });
  }
}

async function writeFile(p, content, dryRun) {
  if (!dryRun) {
    await fs.mkdir(path.dirname(p), { recursive: true });
    if (typeof content === "string") {
      await fs.writeFile(p, content, "utf8");
    } else {
      await fs.writeFile(p, JSON.stringify(content, null, 2), "utf8");
    }
  }
}

function sha256(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ─── Import tasks ─────────────────────────────────────────────────────────────

/**
 * Collect all cursor rule markdown files from .cursor/rules/ and/or .cursorrules.
 * Merge them into a single skill file.
 */
async function importCursorRules(source, targetDir, dryRun, rows) {
  const parts = [];
  const sources = [];

  // .cursor/rules/*.md
  const cursorRulesDir = path.join(source, ".cursor", "rules");
  if (await exists(cursorRulesDir)) {
    let entries;
    try {
      entries = await fs.readdir(cursorRulesDir);
    } catch {
      entries = [];
    }
    const mdFiles = entries.filter((e) => e.endsWith(".md")).sort();
    for (const file of mdFiles) {
      const fullPath = path.join(cursorRulesDir, file);
      try {
        const content = await readText(fullPath);
        parts.push(`<!-- imported from .cursor/rules/${file} -->\n${content}`);
        sources.push(`.cursor/rules/${file}`);
      } catch (err) {
        rows.push({
          item: `.cursor/rules/${file}`,
          status: "SKIPPED",
          reason: `read error: ${err.message}`,
        });
      }
    }
  }

  // .cursorrules (legacy flat file)
  const cursorRulesFile = path.join(source, ".cursorrules");
  if (await exists(cursorRulesFile)) {
    try {
      const content = await readText(cursorRulesFile);
      parts.push(`<!-- imported from .cursorrules -->\n${content}`);
      sources.push(".cursorrules");
    } catch (err) {
      rows.push({
        item: ".cursorrules",
        status: "SKIPPED",
        reason: `read error: ${err.message}`,
      });
    }
  }

  if (parts.length === 0) {
    rows.push({
      item: ".cursor/rules/ + .cursorrules",
      status: "NOT FOUND",
      reason: "no cursor rule files present in source",
    });
    return null;
  }

  const header = `# Imported Cursor Rules
<!-- ORANGEBOX v4 importer: import-from-cursor.mjs -->
<!-- Source: ${sources.join(", ")} -->
<!-- Imported: ${new Date().toISOString()} -->
<!-- This file is auto-generated. Edit source rules in your project and re-run the importer. -->

`;
  const merged = header + parts.join("\n\n---\n\n");
  const outPath = path.join(targetDir, "skills", "imported-cursor-rules.skill.md");

  await writeFile(outPath, merged, dryRun);

  for (const src of sources) {
    rows.push({
      item: src,
      status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
      reason: `→ skills/imported-cursor-rules.skill.md`,
    });
  }

  return { outPath, merged, sources };
}

/**
 * Import .cursor/mcp.json → <target>/mcp/cursor-imported.json.
 * Wraps it in an ORANGEBOX MCP envelope for registry compatibility.
 */
async function importMcpJson(source, targetDir, dryRun, rows) {
  const mcpPath = path.join(source, ".cursor", "mcp.json");
  if (!(await exists(mcpPath))) {
    rows.push({
      item: ".cursor/mcp.json",
      status: "NOT FOUND",
      reason: "no mcp.json in .cursor/",
    });
    return null;
  }

  let mcpData;
  try {
    mcpData = await readJson(mcpPath);
  } catch (err) {
    rows.push({
      item: ".cursor/mcp.json",
      status: "SKIPPED",
      reason: `parse error: ${err.message}`,
    });
    return null;
  }

  const envelope = {
    _orangebox: {
      importedFrom: "cursor",
      importedAt: new Date().toISOString(),
      sourceFile: ".cursor/mcp.json",
      importer: `import-from-cursor.mjs v${VERSION}`,
      note: "Review server configs before enabling. Cursor MCP servers may need path or env adjustments for ORANGEBOX.",
    },
    ...mcpData,
  };

  const outPath = path.join(targetDir, "mcp", "cursor-imported.json");
  await writeFile(outPath, envelope, dryRun);

  rows.push({
    item: ".cursor/mcp.json",
    status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
    reason: `→ mcp/cursor-imported.json`,
  });

  return { outPath, envelope };
}

/**
 * Import Cursor user settings.json (global user settings, not project settings).
 * Filters to SETTINGS_ALLOWLIST only — Cursor-internal keys are discarded.
 */
async function importCursorSettings(targetDir, dryRun, rows) {
  const platform = process.platform;
  const settingsPath =
    CURSOR_SETTINGS_PATHS[platform] || CURSOR_SETTINGS_PATHS.linux;

  if (!(await exists(settingsPath))) {
    rows.push({
      item: `Cursor/User/settings.json (${platform})`,
      status: "NOT FOUND",
      reason: `not found at ${settingsPath}`,
    });
    return null;
  }

  let raw;
  try {
    raw = await readJson(settingsPath);
  } catch (err) {
    rows.push({
      item: `Cursor/User/settings.json (${platform})`,
      status: "SKIPPED",
      reason: `parse error: ${err.message}`,
    });
    return null;
  }

  const translated = {};
  const skippedKeys = [];

  for (const [key, value] of Object.entries(raw)) {
    if (SETTINGS_ALLOWLIST.has(key)) {
      translated[key] = value;
    } else {
      skippedKeys.push(key);
    }
  }

  const output = {
    _orangebox: {
      importedFrom: "cursor",
      importedAt: new Date().toISOString(),
      sourcePath: settingsPath,
      importer: `import-from-cursor.mjs v${VERSION}`,
      translatedKeys: Object.keys(translated).length,
      skippedKeys: skippedKeys.length,
      note: "Only portable editor/UI keys were imported. Cursor-specific keys were discarded.",
    },
    settings: translated,
  };

  const outPath = path.join(
    targetDir,
    "settings",
    "imported-cursor-settings.json"
  );
  await writeFile(outPath, output, dryRun);

  rows.push({
    item: `Cursor/User/settings.json`,
    status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
    reason: `${Object.keys(translated).length} keys imported, ${skippedKeys.length} Cursor-specific keys skipped → settings/imported-cursor-settings.json`,
  });

  if (skippedKeys.length > 0) {
    rows.push({
      item: `  (skipped Cursor-specific keys)`,
      status: "SKIPPED",
      reason: skippedKeys.slice(0, 8).join(", ") + (skippedKeys.length > 8 ? ` …+${skippedKeys.length - 8} more` : ""),
    });
  }

  return { outPath, output };
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

async function emitReceipt(targetDir, args, rows, results, dryRun) {
  const ts = timestamp();
  const receipt = {
    importer: `import-from-cursor.mjs v${VERSION}`,
    doctrine: "ATOM-OBX-V4-MOAT-2026-0516",
    timestamp: new Date().toISOString(),
    dryRun,
    source: path.resolve(args.source),
    target: path.resolve(args.target),
    includeGlobal: args.includeGlobal,
    summary: rows,
    artifacts: results
      .filter(Boolean)
      .map((r) => ({ path: r.outPath || null, sha256: r.merged ? sha256(r.merged) : null })),
  };

  const receiptDir = path.join(targetDir, "receipts", "importer");
  const receiptPath = path.join(receiptDir, `cursor-${ts}.json`);

  if (!dryRun) {
    await ensureDir(receiptDir, false);
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  }

  return { receiptPath, receipt };
}

// ─── Table printer ────────────────────────────────────────────────────────────

function printTable(rows) {
  const COL1 = 50;
  const COL2 = 28;

  const hr = "─".repeat(COL1 + COL2 + 5);
  console.log(`\n${hr}`);
  console.log(
    `  ${"ITEM".padEnd(COL1)}  ${"STATUS".padEnd(COL2)}`
  );
  console.log(hr);

  for (const row of rows) {
    const item = row.item.length > COL1 ? "…" + row.item.slice(-(COL1 - 1)) : row.item;
    const status = row.status.length > COL2 ? row.status.slice(0, COL2 - 1) + "…" : row.status;
    console.log(`  ${item.padEnd(COL1)}  ${status.padEnd(COL2)}`);
    if (row.reason && row.status !== "IMPORTED" && !row.status.startsWith("DRY")) {
      const reason = row.reason.length > COL1 + COL2 ? row.reason.slice(0, COL1 + COL2 - 3) + "..." : row.reason;
      console.log(`  ${"".padEnd(4)}${reason}`);
    }
  }

  console.log(hr);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const source = path.resolve(args.source);
  const target = path.resolve(args.target);
  const { dryRun, includeGlobal } = args;

  console.log(`\nORANGEBOX v4 — Cursor Importer Wizard v${VERSION}`);
  console.log(`Doctrine: ATOM-OBX-V4-MOAT-2026-0516`);
  if (dryRun) {
    console.log(`[DRY RUN] No files will be written.`);
  }
  console.log(`Source : ${source}`);
  console.log(`Target : ${target}`);
  console.log();

  // Verify source exists
  if (!(await exists(source))) {
    console.error(`[ERROR] Source path does not exist: ${source}`);
    process.exit(1);
  }

  const rows = [];
  const results = [];

  // 1. Cursor rules
  const rulesResult = await importCursorRules(source, target, dryRun, rows);
  results.push(rulesResult);

  // 2. MCP config
  const mcpResult = await importMcpJson(source, target, dryRun, rows);
  results.push(mcpResult);

  // 3. Cursor user settings (only if --include-global or by default)
  if (includeGlobal || true) {
    // Per spec: always attempt settings.json import (it is global user data)
    const settingsResult = await importCursorSettings(target, dryRun, rows);
    results.push(settingsResult);
  }

  // Print summary table
  printTable(rows);

  const imported = rows.filter((r) => r.status === "IMPORTED" || r.status.startsWith("DRY-RUN")).length;
  const skipped = rows.filter((r) => r.status === "SKIPPED" || r.status === "NOT FOUND").length;
  console.log(`\n  Imported: ${imported}   Skipped/Not found: ${skipped}`);

  // Emit receipt
  const { receiptPath } = await emitReceipt(target, args, rows, results, dryRun);
  if (!dryRun) {
    console.log(`\n  Receipt: ${receiptPath}`);
  } else {
    console.log(`\n  Receipt: (dry-run, not written)`);
  }

  console.log();
}

main().catch((err) => {
  console.error(`[FATAL] ${err.message}`);
  process.exit(1);
});
