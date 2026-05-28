#!/usr/bin/env node
/* pre-pack-fresh-deps.mjs — v6.0.9
   Run BEFORE pack-v6-portable.mjs / NSIS build to refresh bundled Node + Hermes
   to the latest official upstream releases. Writes:
     src-tauri/binaries/node-x86_64-pc-windows-msvc.exe   ← latest Node LTS
     src-tauri/binaries/hermes.exe                         ← latest Hermes (if win asset)
*/
import fs   from "node:fs";
import path from "node:path";
import os   from "node:os";
import { spawnSync } from "node:child_process";
import * as du from "./v4/dep-updater.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const BIN_DIR = path.join(ROOT, "src-tauri", "binaries");
const NODE_DEST = path.join(BIN_DIR, "node-x86_64-pc-windows-msvc.exe");
const HERMES_DEST = path.join(BIN_DIR, "hermes.exe");

async function main() {
  console.log("[pre-pack] checking upstream versions…");
  const status = await du.status();
  console.log("[pre-pack] node current:", status.node?.current, "latest LTS:", status.node?.latest_lts);
  console.log("[pre-pack] hermes latest:", status.hermes?.latest, "windows asset:", status.hermes?.windows_asset_name || "(none)");

  fs.mkdirSync(BIN_DIR, { recursive: true });

  // Pull node directly to the bundled binaries dir
  if (status.node?.latest_lts) {
    const lts = status.node.latest_lts;
    const url = `https://nodejs.org/dist/${lts}/node-${lts}-win-x64.zip`;
    const tmpZip = path.join(os.tmpdir(), `obx_prepack_node_${lts}.zip`);
    console.log("[pre-pack] downloading node from", url);
    // Reuse downloader from dep-updater (private; replicate via direct https)
    const https = await import("node:https");
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpZip);
      const req = https.get(url, { headers: { "User-Agent": "obx-prepack/6.0.9" }, timeout: 180000 }, (res) => {
        if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      });
      req.on("error", reject);
    });
    const extractDir = path.join(os.tmpdir(), `obx_prepack_node_${lts}_x`);
    try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
    fs.mkdirSync(extractDir, { recursive: true });
    const r = spawnSync("powershell", [
      "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
      "-Command", `Expand-Archive -Path "${tmpZip}" -DestinationPath "${extractDir}" -Force`,
    ], { encoding: "utf8", windowsHide: true });
    if (r.status !== 0) { console.error("[pre-pack] node extract failed:", r.stderr || r.stdout); }
    else {
      // Find node.exe
      let found = null;
      function walk(d) {
        if (found) return;
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          if (found) return;
          if (e.name.toLowerCase() === "node.exe" && e.isFile()) { found = path.join(d, e.name); return; }
          if (e.isDirectory()) walk(path.join(d, e.name));
        }
      }
      walk(extractDir);
      if (found) {
        fs.copyFileSync(found, NODE_DEST);
        console.log(`[pre-pack] node ${lts} → ${NODE_DEST} (${fs.statSync(NODE_DEST).size} bytes)`);
      } else {
        console.error("[pre-pack] node.exe not found in zip");
      }
    }
  }

  // Hermes — only if a Windows asset exists
  if (status.hermes?.windows_asset) {
    console.log("[pre-pack] downloading hermes from", status.hermes.windows_asset);
    const https = await import("node:https");
    const isZip = /\.zip$/i.test(status.hermes.windows_asset_name || "");
    const target = isZip ? path.join(os.tmpdir(), "obx_prepack_hermes.zip") : HERMES_DEST;
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(target);
      const reqFn = (u) => https.get(u, { headers: { "User-Agent": "obx-prepack/6.0.9" }, timeout: 180000 }, (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode)) return reqFn(res.headers.location);
        if (res.statusCode !== 200) { reject(new Error("HTTP " + res.statusCode)); return; }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      });
      reqFn(status.hermes.windows_asset).on("error", reject);
    });
    if (isZip) {
      const r = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command",
        `Expand-Archive -Path "${target}" -DestinationPath "${path.dirname(HERMES_DEST)}" -Force`],
        { encoding: "utf8", windowsHide: true });
      if (r.status !== 0) console.error("[pre-pack] hermes extract:", r.stderr);
    }
    console.log(`[pre-pack] hermes → ${HERMES_DEST}`);
  } else {
    console.log("[pre-pack] no Windows asset for Hermes; bundle ships dep-updater so buyer can pull at first run");
  }

  console.log("[pre-pack] done.");
}

main().catch(e => { console.error("[pre-pack] FATAL:", e.message); process.exit(1); });
