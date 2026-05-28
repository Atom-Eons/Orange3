#!/usr/bin/env node
// memory-tool-handler.mjs
/* ============================================================================
   ORANGEBOX v4 — Anthropic Memory Tool Client-Side Handler

   Tool ID        : memory_20250818
   Doctrine anchor: docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md § 10
   Doctrine ID    : ATOM-OBX-V4-ALPHA-2026-0517
   Author         : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date           : 2026-05-16
   Mom's Law      : Full effort. No stubs. No coasting.

   SECURITY BOUNDARY — PATH MAPPING
   ─────────────────────────────────
   Claude addresses paths as /memories/...
   This handler maps them to <dataRoot>/memory/...
   Any attempt to escape the sandbox returns an "Error:" string — no throw.

   CALLER INTERFACE
   ─────────────────
   import { handleMemoryCommand } from "./memory-tool-handler.mjs";
   const result = await handleMemoryCommand({ command, dataRoot, ...args });
   // result is always a string. "Error:" prefix = failure.

   COMMANDS
   ─────────
   view       { path, view_range? }
   create     { path, file_text }
   str_replace { path, old_str, new_str }
   insert     { path, insert_line, insert_text }
   delete     { path }
   rename     { old_path, new_path }

   RECEIPTS
   ─────────
   Every successful write / delete / rename emits a JSON receipt to
   <dataRoot>/receipts/memory/<ts>-<command>-<safe-name>.json
   Receipt NEVER contains file content.

   ZERO NPM DEPS — Node 18+ stdlib only.
   ============================================================================ */

import fs     from "node:fs/promises";
import fssync from "node:fs";
import path   from "node:path";

// ── Path-security helpers ─────────────────────────────────────────────────────

/**
 * Decode a single round of percent-encoding (case-insensitive) so that
 * strings like %2e%2e%2f are caught before path.resolve sees them.
 */
function decodeOnce(s) {
  try { return decodeURIComponent(s.replace(/\+/g, " ")); }
  catch { return s; }
}

/**
 * validateAndMap — the ONE path-to-disk translator for this module.
 *
 * Accepts a Claude-supplied path (must start with /memories).
 * Returns { ok: true, abs } on success.
 * Returns { ok: false, error: string } on any violation.
 *
 * Checks (in order):
 *   1. Null bytes
 *   2. Not starting with /memories (case-sensitive)
 *   3. Raw ".." segment sequences
 *   4. URL-encoded traversal patterns before decoding
 *   5. After decode: raw ".." again
 *   6. After path.resolve: must be inside <dataRoot>/memory/
 */
function validateAndMap(claudePath, dataRoot) {
  if (typeof claudePath !== "string") {
    return { ok: false, error: "Error: path must be a string." };
  }

  // 1. Null bytes
  if (claudePath.includes("\x00")) {
    return { ok: false, error: "Error: path contains null byte — refused." };
  }

  // 2. Must start with /memories (case-sensitive)
  if (!claudePath.startsWith("/memories")) {
    return { ok: false, error: `Error: path "${claudePath}" does not start with /memories — refused.` };
  }

  // 3. Raw ".." traversal
  if (/\.\.[\\/]|[\\/]\.\./.test(claudePath) || claudePath === "..") {
    return { ok: false, error: `Error: path "${claudePath}" contains directory traversal — refused.` };
  }

  // 4. URL-encoded traversal before decoding
  //    Patterns: %2e%2e%2f  %2e%2e/  ..%2f  %2e%2e%5c  ..%5c
  const lc = claudePath.toLowerCase();
  const encodedTraversalPatterns = [
    "%2e%2e%2f", "%2e%2e/", "..%2f",
    "%2e%2e%5c", "..%5c",
    "%2e%2e\\",
  ];
  for (const pat of encodedTraversalPatterns) {
    if (lc.includes(pat)) {
      return { ok: false, error: `Error: path "${claudePath}" contains URL-encoded traversal — refused.` };
    }
  }

  // 5. Decode once and re-check ".."
  const decoded = decodeOnce(claudePath);
  if (/\.\.[\\/]|[\\/]\.\./.test(decoded) || decoded === "..") {
    return { ok: false, error: `Error: path "${claudePath}" contains directory traversal after decode — refused.` };
  }

  // 6. Build absolute path and verify containment
  //    Strip leading /memories prefix, replace with <dataRoot>/memory
  const relative = decoded.slice("/memories".length); // may be "" or "/foo/bar"
  const sandboxRoot = path.resolve(dataRoot, "memory");
  const abs = path.resolve(sandboxRoot, "." + (relative || "/"));

  // rel must NOT start with ".." (would mean outside sandboxRoot)
  const rel = path.relative(sandboxRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    return { ok: false, error: `Error: path "${claudePath}" resolves outside the memory sandbox — refused.` };
  }

  return { ok: true, abs };
}

/**
 * validateAndMapPair — for rename: validates both source and destination.
 */
function validateAndMapPair(oldPath, newPath, dataRoot) {
  const src = validateAndMap(oldPath, dataRoot);
  if (!src.ok) return { ok: false, error: src.error };
  const dst = validateAndMap(newPath, dataRoot);
  if (!dst.ok) return { ok: false, error: dst.error };
  return { ok: true, srcAbs: src.abs, dstAbs: dst.abs };
}

// ── Receipt emitter ───────────────────────────────────────────────────────────

/**
 * Emit a JSON receipt for every successful write/delete/rename.
 * NEVER includes file content. Fire-and-forget — errors are swallowed so
 * a receipt failure does not break the command response.
 */
async function emitReceipt(dataRoot, command, claudePath, extraArgs) {
  try {
    const ts       = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "T");
    const safeName = String(claudePath || "")
      .replace(/^\/memories\/?/, "")
      .replace(/[^a-zA-Z0-9_\-]/g, "_")
      .slice(0, 80) || "root";
    const filename = `${ts}-${command}-${safeName}.json`;
    const dir      = path.resolve(dataRoot, "receipts", "memory");

    await fs.mkdir(dir, { recursive: true });

    const receipt = {
      ts:      new Date().toISOString(),
      command,
      path:    claudePath,
      args:    extraArgs || {},
      source:  "memory-tool",
      ok:      true,
    };
    await fs.writeFile(path.join(dir, filename), JSON.stringify(receipt, null, 2), "utf8");
  } catch {
    // Receipt write failure must never crash the command.
  }
}

// ── Human-readable file size ──────────────────────────────────────────────────

function humanSize(bytes) {
  if (bytes < 1024)             return `${bytes}B`;
  if (bytes < 1024 * 1024)     return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
}

// ── Line-number formatter (6-char right-aligned + TAB) ────────────────────────

function fmtLine(n, text) {
  return `${String(n).padStart(6)}\t${text}`;
}

// ── Directory listing (2 levels deep, exclude hidden + node_modules) ──────────

async function listDir(abs, claudeBase, currentDepth) {
  const rows = [];
  let entries;
  try {
    entries = await fs.readdir(abs, { withFileTypes: true });
  } catch {
    return rows;
  }

  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    if (ent.name === "node_modules") continue;

    const entAbs   = path.join(abs, ent.name);
    const entClaude = claudeBase + "/" + ent.name;

    let stat;
    try { stat = await fs.stat(entAbs); } catch { continue; }

    rows.push(`${humanSize(stat.size)}\t${entClaude}`);

    if (ent.isDirectory() && currentDepth < 2) {
      const sub = await listDir(entAbs, entClaude, currentDepth + 1);
      rows.push(...sub);
    }
  }
  return rows;
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function cmdView({ path: claudePath, view_range }, dataRoot) {
  const mapped = validateAndMap(claudePath, dataRoot);
  if (!mapped.ok) return mapped.error;

  const { abs } = mapped;

  let stat;
  try { stat = await fs.stat(abs); }
  catch { return `Error: The path ${claudePath} does not exist.`; }

  if (stat.isDirectory()) {
    const rows = await listDir(abs, claudePath.replace(/\/$/, ""), 1);
    const header = `Here's the files and directories up to 2 levels deep in ${claudePath}, excluding hidden items and node_modules:\n`;
    return header + rows.join("\n");
  }

  // File
  let content;
  try { content = await fs.readFile(abs, "utf8"); }
  catch (e) { return `Error: Cannot read file ${claudePath}: ${e.message}`; }

  const lines = content.split("\n");

  if (lines.length > 999_999) {
    return `File ${claudePath} exceeds maximum line limit of 999,999 lines.`;
  }

  let start = 1;
  let end   = lines.length;

  if (view_range) {
    if (!Array.isArray(view_range) || view_range.length !== 2) {
      return `Error: view_range must be [start, end] (1-indexed inclusive).`;
    }
    start = view_range[0];
    end   = view_range[1];
    if (
      typeof start !== "number" || typeof end !== "number" ||
      start < 1 || end < start || end > lines.length
    ) {
      return `Error: view_range [${start}, ${end}] is out of bounds for file with ${lines.length} lines.`;
    }
  }

  const header = `Here's the content of ${claudePath} with line numbers:\n`;
  const body   = lines
    .slice(start - 1, end)
    .map((l, i) => fmtLine(start + i, l))
    .join("\n");

  return header + body;
}

async function cmdCreate({ path: claudePath, file_text }, dataRoot) {
  const mapped = validateAndMap(claudePath, dataRoot);
  if (!mapped.ok) return mapped.error;

  const { abs } = mapped;

  // Refuse if already exists
  try {
    await fs.stat(abs);
    return `Error: File ${claudePath} already exists`;
  } catch {
    // stat threw → does not exist → proceed
  }

  try {
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, file_text ?? "", "utf8");
  } catch (e) {
    return `Error: Cannot create file ${claudePath}: ${e.message}`;
  }

  await emitReceipt(dataRoot, "create", claudePath, {});
  return `File created successfully at: ${claudePath}`;
}

async function cmdStrReplace({ path: claudePath, old_str, new_str }, dataRoot) {
  const mapped = validateAndMap(claudePath, dataRoot);
  if (!mapped.ok) return mapped.error;

  const { abs } = mapped;

  // Must exist and be a file
  let stat;
  try { stat = await fs.stat(abs); }
  catch { return `Error: The path ${claudePath} does not exist. Please provide a valid path.`; }
  if (stat.isDirectory()) {
    return `Error: The path ${claudePath} does not exist. Please provide a valid path.`;
  }

  let content;
  try { content = await fs.readFile(abs, "utf8"); }
  catch (e) { return `Error: Cannot read file ${claudePath}: ${e.message}`; }

  // Find all occurrences
  const lines    = content.split("\n");
  const searchStr = old_str ?? "";

  // Count occurrences
  let occurrences = 0;
  let idx         = content.indexOf(searchStr);
  const positions = [];
  while (idx !== -1) {
    occurrences++;
    // Calculate 1-indexed line number at this offset
    const lineNum = content.slice(0, idx).split("\n").length;
    positions.push(lineNum);
    idx = content.indexOf(searchStr, idx + searchStr.length);
  }

  if (occurrences === 0) {
    return `No replacement was performed, old_str \`${old_str}\` did not appear verbatim in ${claudePath}.`;
  }
  if (occurrences > 1) {
    return `No replacement was performed. Multiple occurrences of old_str \`${old_str}\` in lines: ${positions.join(", ")}. Please ensure it is unique`;
  }

  // Single match — perform replacement
  const newContent = content.replace(searchStr, new_str ?? "");

  try { await fs.writeFile(abs, newContent, "utf8"); }
  catch (e) { return `Error: Cannot write file ${claudePath}: ${e.message}`; }

  await emitReceipt(dataRoot, "str_replace", claudePath, { old_str_length: searchStr.length });

  // Build a 6-line snippet centred on the replacement
  const newLines    = newContent.split("\n");
  const replaceLine = content.slice(0, content.indexOf(searchStr)).split("\n").length;
  const snippetStart = Math.max(1, replaceLine - 2);
  const snippetEnd   = Math.min(newLines.length, replaceLine + 3);
  const snippet = newLines
    .slice(snippetStart - 1, snippetEnd)
    .map((l, i) => fmtLine(snippetStart + i, l))
    .join("\n");

  return `The memory file has been edited.\n${snippet}`;
}

async function cmdInsert({ path: claudePath, insert_line, insert_text }, dataRoot) {
  const mapped = validateAndMap(claudePath, dataRoot);
  if (!mapped.ok) return mapped.error;

  const { abs } = mapped;

  // Must exist
  try { await fs.stat(abs); }
  catch { return `Error: The path ${claudePath} does not exist`; }

  let content;
  try { content = await fs.readFile(abs, "utf8"); }
  catch (e) { return `Error: Cannot read file ${claudePath}: ${e.message}`; }

  const lines   = content.split("\n");
  const nLines  = lines.length;
  const lineNum = Number(insert_line);

  if (!Number.isInteger(lineNum) || lineNum < 0 || lineNum > nLines) {
    return `Error: Invalid \`insert_line\` parameter: ${insert_line}. It should be within the range of lines of the file: [0, ${nLines}]`;
  }

  // Insert AFTER insert_line (0 = start of file)
  const insertLines = (insert_text ?? "").split("\n");
  lines.splice(lineNum, 0, ...insertLines);

  try { await fs.writeFile(abs, lines.join("\n"), "utf8"); }
  catch (e) { return `Error: Cannot write file ${claudePath}: ${e.message}`; }

  await emitReceipt(dataRoot, "insert", claudePath, { insert_line: lineNum });
  return `The file ${claudePath} has been edited.`;
}

async function cmdDelete({ path: claudePath }, dataRoot) {
  const mapped = validateAndMap(claudePath, dataRoot);
  if (!mapped.ok) return mapped.error;

  const { abs } = mapped;

  let stat;
  try { stat = await fs.stat(abs); }
  catch { return `Error: The path ${claudePath} does not exist`; }

  try {
    if (stat.isDirectory()) {
      await fs.rm(abs, { recursive: true, force: true });
    } else {
      await fs.unlink(abs);
    }
  } catch (e) {
    return `Error: Cannot delete ${claudePath}: ${e.message}`;
  }

  await emitReceipt(dataRoot, "delete", claudePath, {});
  return `Successfully deleted ${claudePath}`;
}

async function cmdRename({ old_path, new_path }, dataRoot) {
  const mapped = validateAndMapPair(old_path, new_path, dataRoot);
  if (!mapped.ok) return mapped.error;

  const { srcAbs, dstAbs } = mapped;

  // Source must exist
  try { await fs.stat(srcAbs); }
  catch { return `Error: The path ${old_path} does not exist`; }

  // Destination must NOT exist
  try {
    await fs.stat(dstAbs);
    return `Error: The destination ${new_path} already exists`;
  } catch {
    // stat threw → does not exist → proceed
  }

  try {
    await fs.mkdir(path.dirname(dstAbs), { recursive: true });
    await fs.rename(srcAbs, dstAbs);
  } catch (e) {
    return `Error: Cannot rename ${old_path} to ${new_path}: ${e.message}`;
  }

  await emitReceipt(dataRoot, "rename", old_path, { new_path });
  return `Successfully renamed ${old_path} to ${new_path}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * handleMemoryCommand — top-level dispatcher.
 *
 * @param {object} params
 * @param {string} params.command    "view"|"create"|"str_replace"|"insert"|"delete"|"rename"
 * @param {string} params.dataRoot   Absolute path to the operator data root on disk.
 * @param {*}      params...          Command-specific args (forwarded verbatim).
 *
 * @returns {Promise<string>}  Exact response string for Anthropic's memory tool.
 *                             Never throws. "Error:" prefix signals failure.
 */
export async function handleMemoryCommand({ command, dataRoot, ...args }) {
  if (!dataRoot || typeof dataRoot !== "string") {
    return "Error: dataRoot is required and must be a string.";
  }

  try {
    switch (command) {
      case "view":        return await cmdView(args,        dataRoot);
      case "create":      return await cmdCreate(args,      dataRoot);
      case "str_replace": return await cmdStrReplace(args,  dataRoot);
      case "insert":      return await cmdInsert(args,      dataRoot);
      case "delete":      return await cmdDelete(args,      dataRoot);
      case "rename":      return await cmdRename(args,      dataRoot);
      default:
        return `Error: Unknown memory command "${command}". Valid: view, create, str_replace, insert, delete, rename.`;
    }
  } catch (err) {
    // Last-resort catch — surface as error string, never propagate exception to caller.
    return `Error: Unexpected failure in memory command "${command}": ${err?.message ?? String(err)}`;
  }
}
