#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const repoRoot = "C:\\AtomEons\\orangebox";
const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const mirrorRoot = path.join(dataRoot, "chat-mirror");
const archiveRoot = path.join(dataRoot, "chat-archives");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
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

function ageMs(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? Date.now() - parsed : null;
}

function main() {
  const heartbeatPath = path.join(mirrorRoot, "listener-heartbeat.json");
  const latestMirrorPath = path.join(mirrorRoot, "latest-chat-mirror.json");
  const statePath = path.join(mirrorRoot, "mirror-state.json");
  const startupShortcut = path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Orangebox ChatBackup Listener.lnk");
  const heartbeat = readJson(heartbeatPath);
  const latestMirror = readJson(latestMirrorPath);
  const mirrorState = readJson(statePath);
  const latestArchive = newestDir(archiveRoot);
  const heartbeatAge = ageMs(heartbeat?.last_finished);
  const fresh = heartbeat?.ok === true && heartbeatAge !== null && heartbeatAge < 10 * 60 * 1000;
  const result = {
    ok: fresh && fs.existsSync(startupShortcut) && Boolean(mirrorState),
    version: "orangebox-chatbackup-status/v0",
    checked_at: new Date().toISOString(),
    status: fresh ? "CHATBACKUP_LISTENER_FRESH" : "CHATBACKUP_LISTENER_STALE_OR_MISSING",
    listener: {
      heartbeat_path: heartbeatPath,
      heartbeat_age_ms: heartbeatAge,
      heartbeat,
      startup_shortcut: startupShortcut,
      startup_shortcut_exists: fs.existsSync(startupShortcut),
    },
    mirror: {
      root: mirrorRoot,
      latest_mirror_path: latestMirrorPath,
      state_path: statePath,
      latest_mirror_exists: fs.existsSync(latestMirrorPath),
      state_exists: fs.existsSync(statePath),
      latest_summary: latestMirror?.summary || latestMirror?.counts || null,
      tracked_files: mirrorState?.files ? Object.keys(mirrorState.files).length : null,
    },
    archive: {
      root: archiveRoot,
      latest_archive: latestArchive,
      latest_archive_has_duplicate: latestArchive ? fs.existsSync(path.join(latestArchive, "chat-duplicate.md")) : false,
      latest_archive_has_screenplay: latestArchive ? fs.existsSync(path.join(latestArchive, "chat-screenplay.md")) : false,
    },
  };
  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-chatbackup-status-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }
  console.log(json ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

main();
