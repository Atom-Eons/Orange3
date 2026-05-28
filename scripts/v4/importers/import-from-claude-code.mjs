#!/usr/bin/env node
/* ============================================================================
   import-from-claude-code.mjs — ORANGEBOX v4 Claude Code Importer Wizard

   Doctrine anchor: docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot:      v3.5 — Importer wizards (P0 gap plug)
   Author:          Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date:            2026-05-16
   Mom's Law:       Full effort. No stubs. No TODOs.

   Purpose
   ───────
   One-click migration from Claude Code to ORANGEBOX. Reads the .claude/
   directory NON-DESTRUCTIVELY and emits translated artifacts into the
   ORANGEBOX data root.

   What is imported
   ────────────────
   1. .claude/CLAUDE.md (project)
      → <target>/operator/imported-claude-md.md
   2. .claude/rules/*.md
      → <target>/rules/<filename>.md  (one file per source file)
   3. .claude/agents/*.md
      → <target>/agents/<filename>.md  (one file per source file)
   4. .claude/skills/*  (any file type)
      → <target>/skills/<filename>  (one file per source file)
   5. .claude/settings.local.json
      → <target>/settings/imported-claude-code-settings.json
   6. ~/.claude/CLAUDE.md  (global)
      → <target>/operator/imported-claude-global-md.md
      (only when --include-global is passed)

   Safety guarantee
   ────────────────
   This importer NEVER writes to the source directory. All operations are
   read-only on source. Writes go exclusively to <target>.

   Usage
   ─────
   node import-from-claude-code.mjs [--source=<path>] [--target=<path>]
                                    [--dry-run] [--include-global] [--help]

   Flags
   ─────
   --source=<path>      Root of the Claude Code project (contains .claude/).
                        Default: current working directory.
   --target=<path>      ORANGEBOX data root.
                        Default: $HOME/.orangebox
   --dry-run            Print what would be written; write nothing.
   --include-global     Also import ~/.claude/CLAUDE.md (global).
   --help               Print this help and exit.

   Zero npm dependencies. Node 18+ required.
   ============================================================================ */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import process from "node:process";

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_NAME = "claude-code";
const VERSION = "1.0.0";

// Settings keys from Claude Code / Anthropic settings.local.json that translate
// to ORANGEBOX settings. Keys not in this list are discarded (they are
// Claude Code internals that do not apply to ORANGEBOX architecture).
const SETTINGS_ALLOWLIST = new Set([
  "permissions",
  "env",
  "apiKeyHelper",
  "cleanupPeriodDays",
  "includeCoAuthoredBy",
  "preferredNotifChannel",
  "model",
  "smallFastModel",
  "theme",
  "verbose",
  "disableNonessentialTraffic",
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
    } else {
      console.warn(`[WARN] Unknown flag ignored: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`
ORANGEBOX v4 — Claude Code Importer Wizard v${VERSION}
Doctrine: ATOM-OBX-V4-MOAT-2026-0516

Safely migrates your Claude Code configuration to ORANGEBOX format.
Source files are NEVER modified. All writes go to --target only.

Usage:
  node import-from-claude-code.mjs [options]

Options:
  --source=<path>      Root of Claude Code project (dir containing .claude/).
                       Default: current working directory
  --target=<path>      ORANGEBOX data root.
                       Default: $HOME/.orangebox
  --dry-run            Show what would be imported without writing anything.
  --include-global     Also import ~/.claude/CLAUDE.md (global user config).
  --help               Print this message and exit.

Examples:
  node import-from-claude-code.mjs --source=/projects/myapp
  node import-from-claude-code.mjs --source=. --target=/data/orangebox --dry-run
  node import-from-claude-code.mjs --source=. --include-global

What is imported:
  .claude/CLAUDE.md              → <target>/operator/imported-claude-md.md
  .claude/rules/*.md             → <target>/rules/<filename>.md
  .claude/agents/*.md            → <target>/agents/<filename>.md
  .claude/skills/*               → <target>/skills/<filename>
  .claude/settings.local.json    → <target>/settings/imported-claude-code-settings.json
  ~/.claude/CLAUDE.md (global)   → <target>/operator/imported-claude-global-md.md
    (only with --include-global)

What is NOT imported:
  .claude/todos/         (session state, not configuration)
  .claude/cache/         (ephemeral cache, not portable)
  Anthropic API keys     (you bring your own keys to ORANGEBOX)
  Claude session history (not a portable format)
  .git/ or any workspace state
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

async function readDirSafe(p) {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
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

async function copyFileSafe(srcPath, destPath, dryRun) {
  if (!dryRun) {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(srcPath, destPath);
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
 * Import a single markdown file (CLAUDE.md) into the operator directory.
 */
async function importClaudeMd(srcPath, destFilename, targetDir, label, dryRun, rows) {
  if (!(await exists(srcPath))) {
    rows.push({
      item: label,
      status: "NOT FOUND",
      reason: `not found at ${srcPath}`,
    });
    return null;
  }

  let content;
  try {
    content = await readText(srcPath);
  } catch (err) {
    rows.push({ item: label, status: "SKIPPED", reason: `read error: ${err.message}` });
    return null;
  }

  const header = `<!-- ORANGEBOX v4 importer: import-from-claude-code.mjs -->
<!-- Source: ${srcPath} -->
<!-- Imported: ${new Date().toISOString()} -->
<!-- This file is auto-generated. Edit the source and re-run the importer. -->

`;
  const outContent = header + content;
  const outPath = path.join(targetDir, "operator", destFilename);

  await writeFile(outPath, outContent, dryRun);

  rows.push({
    item: label,
    status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
    reason: `→ operator/${destFilename}`,
  });

  return { outPath, content: outContent };
}

/**
 * Import all .md files from a source directory into a target subdirectory.
 * One-to-one mapping, preserving filenames.
 */
async function importMarkdownDir(srcDir, targetSubdir, label, targetDir, dryRun, rows) {
  if (!(await exists(srcDir))) {
    rows.push({
      item: label,
      status: "NOT FOUND",
      reason: `directory not found: ${srcDir}`,
    });
    return [];
  }

  const entries = await readDirSafe(srcDir);
  const mdFiles = entries.filter((e) => e.endsWith(".md")).sort();

  if (mdFiles.length === 0) {
    rows.push({
      item: label,
      status: "NOT FOUND",
      reason: `directory exists but contains no .md files`,
    });
    return [];
  }

  const imported = [];

  for (const file of mdFiles) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(targetDir, targetSubdir, file);

    try {
      let content = await readText(srcPath);
      const header = `<!-- ORANGEBOX v4 importer: import-from-claude-code.mjs -->\n<!-- Source: ${srcPath} -->\n<!-- Imported: ${new Date().toISOString()} -->\n\n`;
      content = header + content;
      await writeFile(destPath, content, dryRun);
      rows.push({
        item: `${label}/${file}`,
        status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
        reason: `→ ${targetSubdir}/${file}`,
      });
      imported.push({ outPath: destPath });
    } catch (err) {
      rows.push({
        item: `${label}/${file}`,
        status: "SKIPPED",
        reason: `error: ${err.message}`,
      });
    }
  }

  return imported;
}

/**
 * Import all files from .claude/skills/ into <target>/skills/.
 * Preserves all file types (not just .md — skills can be .mjs, .yaml, etc.).
 */
async function importSkillsDir(srcDir, targetDir, dryRun, rows) {
  if (!(await exists(srcDir))) {
    rows.push({
      item: ".claude/skills",
      status: "NOT FOUND",
      reason: `directory not found: ${srcDir}`,
    });
    return [];
  }

  let entries;
  try {
    entries = await fs.readdir(srcDir, { withFileTypes: true });
  } catch (err) {
    rows.push({
      item: ".claude/skills",
      status: "SKIPPED",
      reason: `readdir error: ${err.message}`,
    });
    return [];
  }

  // Only import files (not subdirectories — we keep it flat for safety)
  const files = entries.filter((e) => e.isFile()).map((e) => e.name).sort();

  if (files.length === 0) {
    rows.push({
      item: ".claude/skills",
      status: "NOT FOUND",
      reason: `directory exists but contains no files`,
    });
    return [];
  }

  const imported = [];

  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(targetDir, "skills", file);

    try {
      await copyFileSafe(srcPath, destPath, dryRun);
      rows.push({
        item: `.claude/skills/${file}`,
        status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
        reason: `→ skills/${file}`,
      });
      imported.push({ outPath: destPath });
    } catch (err) {
      rows.push({
        item: `.claude/skills/${file}`,
        status: "SKIPPED",
        reason: `copy error: ${err.message}`,
      });
    }
  }

  return imported;
}

/**
 * Import .claude/settings.local.json → <target>/settings/imported-claude-code-settings.json.
 * Filters to SETTINGS_ALLOWLIST; Claude Code-internal keys are discarded.
 */
async function importSettings(srcPath, targetDir, dryRun, rows) {
  if (!(await exists(srcPath))) {
    rows.push({
      item: ".claude/settings.local.json",
      status: "NOT FOUND",
      reason: `not found at ${srcPath}`,
    });
    return null;
  }

  let raw;
  try {
    raw = await readJson(srcPath);
  } catch (err) {
    rows.push({
      item: ".claude/settings.local.json",
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
      importedFrom: "claude-code",
      importedAt: new Date().toISOString(),
      sourcePath: srcPath,
      importer: `import-from-claude-code.mjs v${VERSION}`,
      translatedKeys: Object.keys(translated).length,
      skippedKeys: skippedKeys.length,
      note: "Only portable keys were imported. Claude Code-specific keys were discarded.",
    },
    settings: translated,
  };

  const outPath = path.join(
    targetDir,
    "settings",
    "imported-claude-code-settings.json"
  );
  await writeFile(outPath, output, dryRun);

  rows.push({
    item: ".claude/settings.local.json",
    status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
    reason: `${Object.keys(translated).length} keys imported, ${skippedKeys.length} Claude-specific keys skipped → settings/imported-claude-code-settings.json`,
  });

  if (skippedKeys.length > 0) {
    rows.push({
      item: `  (skipped Claude Code-specific keys)`,
      status: "SKIPPED",
      reason: skippedKeys.slice(0, 8).join(", ") + (skippedKeys.length > 8 ? ` …+${skippedKeys.length - 8} more` : ""),
    });
  }

  return { outPath, output };
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

async function emitReceipt(targetDir, args, rows, allResults, dryRun) {
  const ts = timestamp();
  const receipt = {
    importer: `import-from-claude-code.mjs v${VERSION}`,
    doctrine: "ATOM-OBX-V4-MOAT-2026-0516",
    timestamp: new Date().toISOString(),
    dryRun,
    source: path.resolve(args.source),
    target: path.resolve(args.target),
    includeGlobal: args.includeGlobal,
    summary: rows,
    artifacts: allResults
      .flat()
      .filter(Boolean)
      .filter((r) => r && r.outPath)
      .map((r) => ({ path: r.outPath })),
  };

  const receiptDir = path.join(targetDir, "receipts", "importer");
  const receiptPath = path.join(receiptDir, `claude-code-${ts}.json`);

  if (!dryRun) {
    await fs.mkdir(receiptDir, { recursive: true });
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  }

  return { receiptPath };
}

// ─── Table printer ────────────────────────────────────────────────────────────

function printTable(rows) {
  const COL1 = 52;
  const COL2 = 28;
  const hr = "─".repeat(COL1 + COL2 + 5);

  console.log(`\n${hr}`);
  console.log(`  ${"ITEM".padEnd(COL1)}  ${"STATUS".padEnd(COL2)}`);
  console.log(hr);

  for (const row of rows) {
    const item =
      row.item.length > COL1
        ? "…" + row.item.slice(-(COL1 - 1))
        : row.item;
    const status =
      row.status.length > COL2 ? row.status.slice(0, COL2 - 1) + "…" : row.status;
    console.log(`  ${item.padEnd(COL1)}  ${status.padEnd(COL2)}`);
    if (
      row.reason &&
      row.status !== "IMPORTED" &&
      !row.status.startsWith("DRY")
    ) {
      const maxReason = COL1 + COL2 - 4;
      const reason =
        row.reason.length > maxReason
          ? row.reason.slice(0, maxReason - 3) + "..."
          : row.reason;
      console.log(`      ${reason}`);
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
  const claudeDir = path.join(source, ".claude");

  console.log(`\nORANGEBOX v4 — Claude Code Importer Wizard v${VERSION}`);
  console.log(`Doctrine: ATOM-OBX-V4-MOAT-2026-0516`);
  if (dryRun) {
    console.log(`[DRY RUN] No files will be written.`);
  }
  console.log(`Source : ${source}`);
  console.log(`Target : ${target}`);
  if (includeGlobal) {
    console.log(`Global : ${path.join(os.homedir(), ".claude", "CLAUDE.md")}`);
  }
  console.log();

  if (!(await exists(source))) {
    console.error(`[ERROR] Source path does not exist: ${source}`);
    process.exit(1);
  }

  const rows = [];
  const allResults = [];

  // 1. .claude/CLAUDE.md (project)
  const claudeMdSrc = path.join(claudeDir, "CLAUDE.md");
  const r1 = await importClaudeMd(
    claudeMdSrc,
    "imported-claude-md.md",
    target,
    ".claude/CLAUDE.md",
    dryRun,
    rows
  );
  allResults.push(r1 ? [r1] : []);

  // 2. .claude/rules/*.md
  const r2 = await importMarkdownDir(
    path.join(claudeDir, "rules"),
    "rules",
    ".claude/rules",
    target,
    dryRun,
    rows
  );
  allResults.push(r2);

  // 3. .claude/agents/*.md
  const r3 = await importMarkdownDir(
    path.join(claudeDir, "agents"),
    "agents",
    ".claude/agents",
    target,
    dryRun,
    rows
  );
  allResults.push(r3);

  // 4. .claude/skills/*
  const r4 = await importSkillsDir(
    path.join(claudeDir, "skills"),
    target,
    dryRun,
    rows
  );
  allResults.push(r4);

  // 5. .claude/settings.local.json
  const r5 = await importSettings(
    path.join(claudeDir, "settings.local.json"),
    target,
    dryRun,
    rows
  );
  allResults.push(r5 ? [r5] : []);

  // 6. ~/.claude/CLAUDE.md (global) — only with --include-global
  if (includeGlobal) {
    const globalClaudeMd = path.join(os.homedir(), ".claude", "CLAUDE.md");
    const r6 = await importClaudeMd(
      globalClaudeMd,
      "imported-claude-global-md.md",
      target,
      "~/.claude/CLAUDE.md (global)",
      dryRun,
      rows
    );
    allResults.push(r6 ? [r6] : []);
  }

  // Print summary table
  printTable(rows);

  const imported = rows.filter(
    (r) => r.status === "IMPORTED" || r.status.startsWith("DRY-RUN")
  ).length;
  const skipped = rows.filter(
    (r) => r.status === "SKIPPED" || r.status === "NOT FOUND"
  ).length;
  console.log(`\n  Imported: ${imported}   Skipped/Not found: ${skipped}`);

  // Emit receipt
  const { receiptPath } = await emitReceipt(target, args, rows, allResults, dryRun);
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
