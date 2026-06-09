#!/usr/bin/env node
/*
  orangebox-final-download-zip.mjs

  Builds the verified Downloads zip from the already-verified backend final
  folder. This intentionally avoids PowerShell Compress-Archive because it can
  hang or leave an invalid archive when runtime holders are busy.
*/

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const finalRoot = process.env.ORANGEBOX_FINAL_ROOT || "C:\\AtomEons\\orangebox\\finals\\Orangebox Delta Final";
const downloadsRoot = process.env.ORANGEBOX_DOWNLOADS_ROOT || path.join(userRoot, "Downloads");
const receiptDir = path.join(repoRoot, "receipts");

const REQUIRED_ENTRIES = [
  "package.json",
  "scripts/v4/mcp-doctor.mjs",
  "scripts/v4/mcp-bridge.mjs",
  "scripts/v4/orangebox-health-report.mjs",
  "scripts/v4/orangebox-project-report.mjs",
  "scripts/v4/orangebox-harness-benchmark-doctor.mjs",
  "orangebox-delta-final-manifest.json",
];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function fileStamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}_${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function exists(file) {
  return Boolean(file) && fs.existsSync(file);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function latestReceipt(prefix, root = receiptDir) {
  if (!exists(root)) return null;
  const files = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

async function run(command, commandArgs, options = {}) {
  const { stdout, stderr } = await execFileAsync(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    timeout: options.timeout || 300_000,
    maxBuffer: options.maxBuffer || 50_000_000,
    windowsHide: true,
  });
  return { stdout: String(stdout || ""), stderr: String(stderr || "") };
}

async function gitValue(commandArgs, fallback = null) {
  try {
    const out = await run("git", commandArgs, { cwd: repoRoot, timeout: 20_000, maxBuffer: 256_000 });
    return out.stdout.trim() || fallback;
  } catch {
    return fallback;
  }
}

function assertFinalFolder() {
  if (!exists(finalRoot)) throw new Error(`Final folder not found: ${finalRoot}`);
  const manifestPath = path.join(finalRoot, "orangebox-delta-final-manifest.json");
  const manifest = readJson(manifestPath);
  if (!manifest) throw new Error(`Final manifest missing or invalid: ${manifestPath}`);
  if (manifest.frontend_included !== false) throw new Error("Final manifest does not prove frontend_included=false");
  if (manifest.frontend_required_for_backend !== false) throw new Error("Final manifest does not prove frontend_required_for_backend=false");
  return { manifestPath, manifest };
}

function normalizeEntryName(name) {
  return String(name || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
}

async function buildArchive(zipPath) {
  await fsp.mkdir(path.dirname(zipPath), { recursive: true });
  if (exists(zipPath)) await fsp.rm(zipPath, { force: true });
  if (process.platform !== "win32") {
    throw new Error("final:zip currently expects Windows tar.exe for the local release pack");
  }
  await run("tar.exe", [
    "-a",
    "-cf",
    zipPath,
    "--exclude=node_modules",
    "--exclude=*/node_modules",
    "--exclude=.git",
    "--exclude=.worktrees",
    "*",
  ], { cwd: finalRoot, timeout: 900_000, maxBuffer: 2_000_000 });
}

async function verifyArchive(zipPath) {
  const listed = await run("tar.exe", ["-tf", zipPath], { cwd: finalRoot, timeout: 120_000, maxBuffer: 50_000_000 });
  const entries = listed.stdout.split(/\r?\n/).map(normalizeEntryName).filter(Boolean);
  const entrySet = new Set(entries);
  const missing = REQUIRED_ENTRIES.filter((entry) => !entrySet.has(entry));
  return {
    ok: missing.length === 0 && entries.length > 500,
    entries: entries.length,
    missing,
  };
}

async function main() {
  const startedAt = new Date();
  const final = assertFinalFolder();
  const shortCommit = await gitValue(["rev-parse", "--short=7", "HEAD"], "unknown");
  const sourceCommit = await gitValue(["rev-parse", "HEAD"], final.manifest.source_commit || "unknown");
  const sourceBranch = await gitValue(["rev-parse", "--abbrev-ref", "HEAD"], final.manifest.source_branch || "unknown");
  const zipPath = path.join(downloadsRoot, `Orangebox_Delta_Final_VERIFIED_${fileStamp(startedAt)}_${shortCommit}.zip`);
  await buildArchive(zipPath);
  const archive = await verifyArchive(zipPath);
  if (!archive.ok) {
    throw new Error(`Archive verification failed: missing=${archive.missing.join(",") || "none"} entries=${archive.entries}`);
  }
  const stat = fs.statSync(zipPath);
  const finalVerifyReceipt = latestReceipt("orangebox-delta-final-package-");
  const result = {
    ok: true,
    status: "ORANGEBOX_DELTA_FINAL_DOWNLOAD_ZIP_GREEN",
    version: "orangebox-final-download-zip/v1",
    public_name: "Orangebox Version 1",
    package_name: "Orangebox Delta Final",
    source_commit: sourceCommit,
    source_branch: sourceBranch,
    final_root: finalRoot,
    zip_path: zipPath,
    sha256: sha256File(zipPath),
    bytes: stat.size,
    entries: archive.entries,
    frontend_included: false,
    frontend_required_for_backend: false,
    archive_verified: true,
    required_entries: REQUIRED_ENTRIES,
    missing_entries: archive.missing,
    final_manifest_path: final.manifestPath,
    final_verify_receipt: finalVerifyReceipt,
    created_at: new Date().toISOString(),
    receipt_path: null,
  };

  const dataDir = path.join(dataRoot, "downloads");
  await writeJson(path.join(dataDir, "latest-orangebox-delta-final-download.json"), result);
  await writeJson(path.join(dataDir, "latest-orangebox-delta-final-download-zip.json"), result);
  await writeJson(path.join(dataDir, `orangebox-delta-final-download-${fileStamp(startedAt)}.json`), result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-final-download-zip-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(path.join(dataDir, "latest-orangebox-delta-final-download.json"), result);
    await writeJson(path.join(dataDir, "latest-orangebox-delta-final-download-zip.json"), result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : `${result.status} ${result.zip_path}`);
}

main().catch((error) => {
  const out = {
    ok: false,
    status: "ORANGEBOX_DELTA_FINAL_DOWNLOAD_ZIP_NOT_GREEN",
    version: "orangebox-final-download-zip/v1",
    error: error?.message || String(error),
    created_at: new Date().toISOString(),
  };
  console.log(wantsJson ? JSON.stringify(out, null, 2) : `${out.status}: ${out.error}`);
  process.exitCode = 1;
});
