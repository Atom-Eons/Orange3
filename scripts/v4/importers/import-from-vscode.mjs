#!/usr/bin/env node
/* ============================================================================
   import-from-vscode.mjs — ORANGEBOX v4 VS Code Importer Wizard

   Doctrine anchor: docs/V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)
   Phase slot:      v3.5 — Importer wizards (P0 gap plug)
   Author:          Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date:            2026-05-16
   Mom's Law:       Full effort. No stubs. No TODOs.

   Purpose
   ───────
   One-click migration from VS Code to ORANGEBOX. Reads .vscode/ workspace
   config and optionally the global extensions snapshot NON-DESTRUCTIVELY,
   then emits translated artifacts into the ORANGEBOX data root.

   What is imported
   ────────────────
   1. .vscode/settings.json (workspace)
      → <target>/settings/imported-vscode-settings.json
      (only portable editor/UI keys; VS Code-internal keys are discarded)

   2. .vscode/extensions.json (recommended extensions list)
      → <target>/marketplace/imported-vscode-extensions.json
      (informational; maps extension IDs so you can find ORANGEBOX equivalents)

   3. ~/.vscode/extensions/*  (installed extension snapshot)
      → <target>/marketplace/vscode-extensions-snapshot.json
      (optional; only with --include-extensions flag)

   Safety guarantee
   ────────────────
   This importer NEVER writes to the source directory. All operations are
   read-only on source. Writes go exclusively to <target>.

   Usage
   ─────
   node import-from-vscode.mjs [--source=<path>] [--target=<path>]
                               [--dry-run] [--include-extensions] [--help]

   Flags
   ─────
   --source=<path>          Root of the VS Code project (contains .vscode/).
                            Default: current working directory.
   --target=<path>          ORANGEBOX data root.
                            Default: $HOME/.orangebox
   --dry-run                Print what would be written; write nothing.
   --include-extensions     Also snapshot ~/.vscode/extensions/ (installed).
   --help                   Print this help and exit.

   Zero npm dependencies. Node 18+ required.
   ============================================================================ */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import process from "node:process";

// ─── Constants ───────────────────────────────────────────────────────────────

const SOURCE_NAME = "vscode";
const VERSION = "1.0.0";

// VS Code global extensions directory by platform
const VSCODE_EXTENSIONS_PATHS = {
  darwin: path.join(os.homedir(), ".vscode", "extensions"),
  win32: path.join(os.homedir(), ".vscode", "extensions"),
  linux: path.join(os.homedir(), ".vscode", "extensions"),
};

// Settings keys safe to translate from VS Code workspace settings.json.
// VS Code-specific integration keys (telemetry, update, remote, etc.) are not
// portable and are not imported.
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
  "editor.linkedEditing",
  "editor.suggest.showWords",
  "editor.quickSuggestions",
  "editor.snippetSuggestions",
  "editor.codeActionsOnSave",
  "editor.defaultFormatter",
  "editor.detectIndentation",
  "editor.trimAutoWhitespace",
  "editor.wrappingIndent",
  "files.autoSave",
  "files.autoSaveDelay",
  "files.trimTrailingWhitespace",
  "files.insertFinalNewline",
  "files.trimFinalNewlines",
  "files.encoding",
  "files.eol",
  "files.exclude",
  "files.watcherExclude",
  "search.exclude",
  "search.useIgnoreFiles",
  "terminal.integrated.fontSize",
  "terminal.integrated.fontFamily",
  "terminal.integrated.shell.windows",
  "terminal.integrated.shell.linux",
  "terminal.integrated.shell.osx",
  "terminal.integrated.defaultProfile.windows",
  "terminal.integrated.defaultProfile.linux",
  "terminal.integrated.defaultProfile.osx",
  "workbench.colorTheme",
  "workbench.iconTheme",
  "workbench.editor.enablePreview",
  "workbench.startupEditor",
  "css.validate",
  "html.validate.scripts",
  "html.validate.styles",
  "javascript.updateImportsOnFileMove.enabled",
  "typescript.updateImportsOnFileMove.enabled",
  "typescript.preferences.quoteStyle",
  "typescript.preferences.importModuleSpecifier",
  "eslint.enable",
  "eslint.format.enable",
  "prettier.singleQuote",
  "prettier.semi",
  "prettier.tabWidth",
  "prettier.trailingComma",
  "prettier.printWidth",
  "git.autofetch",
  "git.confirmSync",
  "git.enableSmartCommit",
  "diffEditor.renderSideBySide",
  "extensions.ignoreRecommendations",
]);

// ─── Argument parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    source: process.cwd(),
    target: path.join(os.homedir(), ".orangebox"),
    dryRun: false,
    includeExtensions: false,
    help: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--include-extensions") {
      args.includeExtensions = true;
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
ORANGEBOX v4 — VS Code Importer Wizard v${VERSION}
Doctrine: ATOM-OBX-V4-MOAT-2026-0516

Safely migrates your VS Code workspace configuration to ORANGEBOX format.
Source files are NEVER modified. All writes go to --target only.

Usage:
  node import-from-vscode.mjs [options]

Options:
  --source=<path>          Root of VS Code project (dir containing .vscode/).
                           Default: current working directory
  --target=<path>          ORANGEBOX data root.
                           Default: $HOME/.orangebox
  --dry-run                Show what would be imported without writing anything.
  --include-extensions     Also snapshot ~/.vscode/extensions/ (installed list).
  --help                   Print this message and exit.

Examples:
  node import-from-vscode.mjs --source=/projects/myapp
  node import-from-vscode.mjs --source=. --target=/data/orangebox --dry-run
  node import-from-vscode.mjs --source=. --include-extensions

What is imported:
  .vscode/settings.json        → <target>/settings/imported-vscode-settings.json
    (portable editor/UI keys only; VS Code-specific keys discarded)
  .vscode/extensions.json      → <target>/marketplace/imported-vscode-extensions.json
    (recommended extension list, informational — ORANGEBOX has its own plugin system)
  ~/.vscode/extensions/*       → <target>/marketplace/vscode-extensions-snapshot.json
    (installed extension snapshot, only with --include-extensions)

What is NOT imported:
  .vscode/launch.json      (debugger config is VS Code-specific)
  .vscode/tasks.json       (task runner config is VS Code-specific)
  .vscode/keybindings.json (keybindings are VS Code-specific)
  VS Code extensions       (ORANGEBOX has its own plugin architecture;
                            the snapshot is informational only)
  VS Code API keys / tokens (bring your own keys to ORANGEBOX)
  VS Code account / sync state (not portable)
  Workspace state (.history/, etc.)
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
  // VS Code settings.json can contain comments (JSONC) — strip them before parsing
  const stripped = raw
    .replace(/\/\/.*$/gm, "")        // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, ""); // block comments
  return JSON.parse(stripped);
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

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

// ─── Import tasks ─────────────────────────────────────────────────────────────

/**
 * Import .vscode/settings.json.
 * Filters to SETTINGS_ALLOWLIST. VS Code-internal keys are discarded.
 * Handles JSONC (JSON with Comments) gracefully.
 */
async function importWorkspaceSettings(source, targetDir, dryRun, rows) {
  const srcPath = path.join(source, ".vscode", "settings.json");

  if (!(await exists(srcPath))) {
    rows.push({
      item: ".vscode/settings.json",
      status: "NOT FOUND",
      reason: "no settings.json in .vscode/",
    });
    return null;
  }

  let raw;
  try {
    raw = await readJson(srcPath);
  } catch (err) {
    rows.push({
      item: ".vscode/settings.json",
      status: "SKIPPED",
      reason: `parse error (JSONC): ${err.message}`,
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
      importedFrom: "vscode",
      importedAt: new Date().toISOString(),
      sourcePath: srcPath,
      importer: `import-from-vscode.mjs v${VERSION}`,
      translatedKeys: Object.keys(translated).length,
      skippedKeys: skippedKeys.length,
      note: "Only portable editor/UI keys were imported. VS Code-specific keys were discarded.",
    },
    settings: translated,
  };

  const outPath = path.join(
    targetDir,
    "settings",
    "imported-vscode-settings.json"
  );
  await writeFile(outPath, output, dryRun);

  rows.push({
    item: ".vscode/settings.json",
    status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
    reason: `${Object.keys(translated).length} keys imported, ${skippedKeys.length} VS Code-specific keys skipped → settings/imported-vscode-settings.json`,
  });

  if (skippedKeys.length > 0) {
    const preview = skippedKeys.slice(0, 8).join(", ") +
      (skippedKeys.length > 8 ? ` …+${skippedKeys.length - 8} more` : "");
    rows.push({
      item: `  (skipped VS Code-specific keys)`,
      status: "SKIPPED",
      reason: preview,
    });
  }

  return { outPath, output };
}

/**
 * Import .vscode/extensions.json (recommended extensions list).
 * This is informational: ORANGEBOX has its own plugin system. The import
 * preserves the list so the operator can look up ORANGEBOX equivalents.
 */
async function importExtensionsJson(source, targetDir, dryRun, rows) {
  const srcPath = path.join(source, ".vscode", "extensions.json");

  if (!(await exists(srcPath))) {
    rows.push({
      item: ".vscode/extensions.json",
      status: "NOT FOUND",
      reason: "no extensions.json in .vscode/",
    });
    return null;
  }

  let raw;
  try {
    raw = await readJson(srcPath);
  } catch (err) {
    rows.push({
      item: ".vscode/extensions.json",
      status: "SKIPPED",
      reason: `parse error: ${err.message}`,
    });
    return null;
  }

  const recommendations = raw.recommendations || [];
  const unwantedRecommendations = raw.unwantedRecommendations || [];

  const output = {
    _orangebox: {
      importedFrom: "vscode",
      importedAt: new Date().toISOString(),
      sourcePath: srcPath,
      importer: `import-from-vscode.mjs v${VERSION}`,
      purpose: "Informational only. ORANGEBOX has its own plugin system. Use this list to find ORANGEBOX plugin equivalents.",
      note: "Extensions are NOT auto-installed. Open marketplace/imported-vscode-extensions.json to review and find ORANGEBOX equivalents.",
    },
    recommendations,
    unwantedRecommendations,
    totalRecommended: recommendations.length,
    totalUnwanted: unwantedRecommendations.length,
  };

  const outPath = path.join(
    targetDir,
    "marketplace",
    "imported-vscode-extensions.json"
  );
  await writeFile(outPath, output, dryRun);

  rows.push({
    item: ".vscode/extensions.json",
    status: dryRun ? "DRY-RUN (would import)" : "IMPORTED",
    reason: `${recommendations.length} recommended extensions listed (informational) → marketplace/imported-vscode-extensions.json`,
  });

  return { outPath, output };
}

/**
 * Snapshot ~/.vscode/extensions/ (installed extensions directory).
 * Does NOT copy extension files — only records names and metadata.
 * This is optional and only runs with --include-extensions.
 */
async function snapshotInstalledExtensions(targetDir, dryRun, rows) {
  const platform = process.platform;
  const extDir =
    VSCODE_EXTENSIONS_PATHS[platform] || VSCODE_EXTENSIONS_PATHS.linux;

  if (!(await exists(extDir))) {
    rows.push({
      item: `~/.vscode/extensions/ (${platform})`,
      status: "NOT FOUND",
      reason: `directory not found at ${extDir}`,
    });
    return null;
  }

  let entries;
  try {
    entries = await fs.readdir(extDir, { withFileTypes: true });
  } catch (err) {
    rows.push({
      item: `~/.vscode/extensions/`,
      status: "SKIPPED",
      reason: `readdir error: ${err.message}`,
    });
    return null;
  }

  const extensionDirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  // Parse publisher.name-version pattern from directory names
  const parsed = extensionDirs.map((name) => {
    // Pattern: publisher.extensionname-semver
    const match = name.match(/^([^.]+)\.([^-]+)-(.+)$/);
    if (match) {
      return {
        directoryName: name,
        publisher: match[1],
        name: match[2],
        version: match[3],
        id: `${match[1]}.${match[2]}`,
      };
    }
    return { directoryName: name, publisher: null, name: null, version: null, id: null };
  });

  const output = {
    _orangebox: {
      importedFrom: "vscode",
      importedAt: new Date().toISOString(),
      sourcePath: extDir,
      importer: `import-from-vscode.mjs v${VERSION}`,
      purpose: "Installed VS Code extension snapshot. Informational only. Extensions are NOT copied. Use this to find ORANGEBOX plugin equivalents.",
      note: "ORANGEBOX has its own plugin architecture. This snapshot is a reference list.",
    },
    snapshotPath: extDir,
    totalInstalled: extensionDirs.length,
    extensions: parsed,
  };

  const outPath = path.join(
    targetDir,
    "marketplace",
    "vscode-extensions-snapshot.json"
  );
  await writeFile(outPath, output, dryRun);

  rows.push({
    item: `~/.vscode/extensions/ (${platform})`,
    status: dryRun ? "DRY-RUN (would snapshot)" : "IMPORTED",
    reason: `${extensionDirs.length} installed extensions snapshotted (informational) → marketplace/vscode-extensions-snapshot.json`,
  });

  return { outPath, output };
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

async function emitReceipt(targetDir, args, rows, allResults, dryRun) {
  const ts = timestamp();
  const receipt = {
    importer: `import-from-vscode.mjs v${VERSION}`,
    doctrine: "ATOM-OBX-V4-MOAT-2026-0516",
    timestamp: new Date().toISOString(),
    dryRun,
    source: path.resolve(args.source),
    target: path.resolve(args.target),
    includeExtensions: args.includeExtensions,
    summary: rows,
    artifacts: allResults
      .filter(Boolean)
      .filter((r) => r && r.outPath)
      .map((r) => ({ path: r.outPath })),
  };

  const receiptDir = path.join(targetDir, "receipts", "importer");
  const receiptPath = path.join(receiptDir, `vscode-${ts}.json`);

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
      row.item.length > COL1 ? "…" + row.item.slice(-(COL1 - 1)) : row.item;
    const status =
      row.status.length > COL2
        ? row.status.slice(0, COL2 - 1) + "…"
        : row.status;
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
  const { dryRun, includeExtensions } = args;

  console.log(`\nORANGEBOX v4 — VS Code Importer Wizard v${VERSION}`);
  console.log(`Doctrine: ATOM-OBX-V4-MOAT-2026-0516`);
  if (dryRun) {
    console.log(`[DRY RUN] No files will be written.`);
  }
  console.log(`Source : ${source}`);
  console.log(`Target : ${target}`);
  if (includeExtensions) {
    const platform = process.platform;
    console.log(
      `Ext dir: ${VSCODE_EXTENSIONS_PATHS[platform] || VSCODE_EXTENSIONS_PATHS.linux}`
    );
  }
  console.log();

  if (!(await exists(source))) {
    console.error(`[ERROR] Source path does not exist: ${source}`);
    process.exit(1);
  }

  const rows = [];
  const allResults = [];

  // 1. .vscode/settings.json
  const r1 = await importWorkspaceSettings(source, target, dryRun, rows);
  allResults.push(r1);

  // 2. .vscode/extensions.json (recommended list)
  const r2 = await importExtensionsJson(source, target, dryRun, rows);
  allResults.push(r2);

  // 3. ~/.vscode/extensions/ snapshot (optional)
  if (includeExtensions) {
    const r3 = await snapshotInstalledExtensions(target, dryRun, rows);
    allResults.push(r3);
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
  const { receiptPath } = await emitReceipt(
    target,
    args,
    rows,
    allResults,
    dryRun
  );
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
