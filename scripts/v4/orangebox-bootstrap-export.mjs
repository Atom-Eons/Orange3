#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
const exportRoot = path.join(dataRoot, "bootstrap", `orangebox-bootstrap-${stamp}`);

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function copyIfExists(source, destination) {
  if (!fs.existsSync(source)) return null;
  ensureDir(path.dirname(destination));
  const stat = fs.statSync(source);
  if (stat.isDirectory()) {
    fs.cpSync(source, destination, { recursive: true, force: true });
  } else {
    fs.copyFileSync(source, destination);
  }
  return { source, destination };
}

function sha256File(file) {
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function main() {
  ensureDir(exportRoot);
  const copied = [];
  const candidates = [
    [path.join(userRoot, ".codex", "skills", "orangebox-primer"), path.join(exportRoot, "skills", "orangebox-primer")],
    [path.join(dataRoot, "primers", "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md"), path.join(exportRoot, "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md")],
    [path.join(dataRoot, "restore-packets", "ORANGEBOX_RESTORE_PACKET.latest.md"), path.join(exportRoot, "ORANGEBOX_RESTORE_PACKET.latest.md")],
    [path.join(dataRoot, "chat-compact", "latest-chat-compact-index.json"), path.join(exportRoot, "latest-chat-compact-index.json")],
    [path.join(dataRoot, "incoming", "atomsmasher-module-intake.json"), path.join(exportRoot, "atomsmasher-module-intake.json")],
    [path.join(dataRoot, "watcher", "latest-reality-watch.json"), path.join(exportRoot, "latest-reality-watch.json")],
    [path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json"), path.join(exportRoot, "latest-orangebox-full-green.json")],
  ];
  for (const [source, destination] of candidates) {
    const result = copyIfExists(source, destination);
    if (result) copied.push(result);
  }
  const readme = `# Orangebox Bootstrap Pack

Created: ${new Date().toISOString()}

Use this pack to teach a zero-memory AI account or fresh machine what Orangebox is before it starts coding.

## Order

1. Read \`ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md\`.
2. Load \`skills/orangebox-primer/SKILL.md\` if the tool supports skills.
3. Read \`ORANGEBOX_RESTORE_PACKET.latest.md\`.
4. Check \`latest-reality-watch.json\` and \`latest-orangebox-full-green.json\` if present.
5. Keep the active lane as Orangebox Ops backend unless the operator explicitly opens another lane.

## Current Lane Truth

- Visual/website/shop output lanes are on hold in this backend Ops chat, not removed from Orangebox.
- Stale skill scanning is on-demand only.
- ChatBackup is local, incremental, and byte-capped.
- AtomSmasher is incoming as a completed compression super-pack; receive the zip/spec, validate, then integrate.
`;
  const readmePath = path.join(exportRoot, "README_BOOTSTRAP.md");
  fs.writeFileSync(readmePath, readme, "utf8");
  copied.push({ source: "generated", destination: readmePath });

  const manifest = {
    ok: true,
    version: "orangebox-bootstrap-export/v0",
    created_at: new Date().toISOString(),
    export_root: exportRoot,
    copied,
    file_hashes: copied
      .filter((item) => item.source !== "generated")
      .map((item) => ({ path: item.destination, sha256: sha256File(item.destination) }))
      .filter((item) => item.sha256),
  };
  const manifestPath = path.join(exportRoot, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  manifest.manifest_path = manifestPath;
  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-bootstrap-export-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifest.receipt_path = receiptPath;
  }
  console.log(json ? JSON.stringify(manifest, null, 2) : `Bootstrap export: ${exportRoot}`);
}

main();
