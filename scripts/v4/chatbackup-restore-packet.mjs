#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const rawArgs = process.argv.slice(2);
const args = new Set(rawArgs);
const json = args.has("--json");
const receipt = args.has("--receipt");

const repoRoot = "C:\\AtomEons\\orangebox";
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const archiveRoot = path.join(dataRoot, "chat-archives");
const restoreRoot = path.join(dataRoot, "restore-packets");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function flagValue(flag, fallback = null) {
  const index = rawArgs.indexOf(flag);
  return index >= 0 && index + 1 < rawArgs.length ? rawArgs[index + 1] : fallback;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
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

function newestDir(root) {
  if (!fs.existsSync(root)) return null;
  const dirs = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(root, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return dirs[0]?.full || null;
}

function tailLines(text, maxLines = 180) {
  const lines = String(text || "").split(/\r?\n/);
  return lines.slice(Math.max(0, lines.length - maxLines)).join("\n");
}

function main() {
  const archiveDir = flagValue("--archive-dir", newestDir(archiveRoot));
  if (!archiveDir || !fs.existsSync(archiveDir)) {
    throw new Error("No chat archive found. Run npm.cmd run chat:archive first.");
  }
  const manifest = readJson(path.join(archiveDir, "manifest.json")) || {};
  const primer = readText(path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md"), "Orangebox primer missing; run npm.cmd run primer:sync.");
  const screenplay = readText(path.join(archiveDir, "chat-screenplay.md"));
  const duplicate = readText(path.join(archiveDir, "chat-duplicate.md"));
  const opsReadiness = readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json")) || readJson(path.join(dataRoot, "incoming", "atomsmasher-module-intake.json")) || {};
  const packet = `# ORANGEBOX RESTORE PACKET

Created: ${new Date().toISOString()}
Archive: ${archiveDir}

## Use This First

Paste this packet into a brand-new Codex, Claude, Antigravity, or other AI coding chat when the account has zero memory.

The new chat must:

1. Treat local files and receipts as truth.
2. Load or follow the Orangebox primer.
3. Keep the active lane as Orangebox Ops backend unless the operator explicitly opens another lane.
4. Remember that visual/website/shop work is on hold for this backend lane, not removed from Orangebox.
5. Use ChatBackup archives to restore project continuity.
6. Use AtomSmasher only after the incoming zip/spec is received and validated.

## Primer

${primer}

## Archive Manifest

\`\`\`json
${JSON.stringify(manifest, null, 2)}
\`\`\`

## Current Backend Reality Snapshot

\`\`\`json
${JSON.stringify(opsReadiness, null, 2)}
\`\`\`

## Latest Screenplay Tail

This is an adaptation for restoration, not a verbatim transcript. Full source remains in \`chat-duplicate.md\` and \`raw-session.jsonl\`.

${tailLines(screenplay, 180)}

## Latest Duplicate Tail

${tailLines(duplicate, 180)}

## Local Truth Files

- Raw session: ${path.join(archiveDir, "raw-session.jsonl")}
- Duplicate Markdown: ${path.join(archiveDir, "chat-duplicate.md")}
- Screenplay Markdown: ${path.join(archiveDir, "chat-screenplay.md")}
- Manifest: ${path.join(archiveDir, "manifest.json")}
- Orangebox repo: ${repoRoot}
- Orangebox data: ${dataRoot}

## Integrity

- packet_sha256 is written in the receipt.
- Source raw JSONL remains the cold truth.
- This packet is a compact restore aid, not a replacement for source truth.
`;

  fs.mkdirSync(restoreRoot, { recursive: true });
  const output = path.join(restoreRoot, `ORANGEBOX_RESTORE_PACKET-${stamp}.md`);
  const latest = path.join(restoreRoot, "ORANGEBOX_RESTORE_PACKET.latest.md");
  fs.writeFileSync(output, packet, "utf8");
  fs.copyFileSync(output, latest);

  const result = {
    ok: true,
    version: "orangebox-chatbackup-restore-packet/v0",
    created_at: new Date().toISOString(),
    archive_dir: archiveDir,
    output,
    latest,
    packet_sha256: sha256(packet),
    source_truth: {
      raw_session: path.join(archiveDir, "raw-session.jsonl"),
      duplicate: path.join(archiveDir, "chat-duplicate.md"),
      screenplay: path.join(archiveDir, "chat-screenplay.md"),
      manifest: path.join(archiveDir, "manifest.json"),
    },
  };
  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-chatbackup-restore-packet-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }
  console.log(json ? JSON.stringify(result, null, 2) : `Restore packet: ${output}`);
}

main();
