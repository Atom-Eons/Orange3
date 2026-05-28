#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const repoRoot = "C:\\AtomEons\\orangebox";
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const archiveRoot = path.join(dataRoot, "chat-archives");
const compactRoot = path.join(dataRoot, "chat-compact");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function readText(file, fallback = "") {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch {
    return null;
  }
}

function archiveDirs() {
  if (!fs.existsSync(archiveRoot)) return [];
  return fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(archiveRoot, entry.name);
      return { full, name: entry.name, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function tail(text, maxChars = 2400) {
  const value = String(text || "").trim();
  return value.length <= maxChars ? value : value.slice(value.length - maxChars);
}

function main() {
  const archives = archiveDirs();
  const items = archives.slice(0, 50).map((archive) => {
    const manifest = readJson(path.join(archive.full, "manifest.json")) || {};
    const screenplayTail = tail(readText(path.join(archive.full, "chat-screenplay.md")), 1600);
    return {
      archive_dir: archive.full,
      name: archive.name,
      modified_at: new Date(archive.mtimeMs).toISOString(),
      source: manifest.source || null,
      counts: manifest.counts || null,
      source_sha256: manifest.source_sha256 || manifest.integrity?.source_sha256 || null,
      screenplay_tail_sha256: sha256(screenplayTail),
      screenplay_tail: screenplayTail,
      restore_files: {
        raw_session: path.join(archive.full, "raw-session.jsonl"),
        duplicate: path.join(archive.full, "chat-duplicate.md"),
        screenplay: path.join(archive.full, "chat-screenplay.md"),
        manifest: path.join(archive.full, "manifest.json"),
      },
    };
  });
  const result = {
    ok: true,
    version: "orangebox-chatbackup-compact-index/v0",
    created_at: new Date().toISOString(),
    archive_root: archiveRoot,
    archive_count_seen: archives.length,
    indexed_count: items.length,
    doctrine: "Raw archives remain cold truth. This compact index is a restore map, not a replacement for source.",
    items,
  };
  fs.mkdirSync(compactRoot, { recursive: true });
  const latest = path.join(compactRoot, "latest-chat-compact-index.json");
  fs.writeFileSync(latest, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  result.latest = latest;
  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-chatbackup-compact-index-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }
  console.log(json ? JSON.stringify(result, null, 2) : `Compact index: ${latest}`);
}

main();
