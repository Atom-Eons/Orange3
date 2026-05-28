/* dep-updater.mjs — v6.0.9 keep node.exe + Hermes fresh.
   status() compares bundled versions to latest. update() downloads + installs in-place.
   Pure Node ESM; no native deps. Atomic via tmp + rename. */
import fs    from "node:fs";
import path  from "node:path";
import os    from "node:os";
import https from "node:https";
import { spawnSync } from "node:child_process";

const NODE_INDEX_URL    = "https://nodejs.org/dist/index.json";
const HERMES_API        = "https://api.github.com/repos/NousResearch/hermes-agent/releases/latest";

function appRoot() {
  return process.env.ORANGEBOX_APP_ROOT
      || process.env.ORANGEBOX_WORKSPACE_ROOT
      || path.dirname(process.execPath);
}
function installRoot() {
  return process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "ORANGEBOX") : appRoot();
}
function nodeExePath() {
  const cands = [
    path.join(installRoot(), "node.exe"),
    path.join(appRoot(),     "node.exe"),
    path.join(appRoot(),     "src-tauri", "binaries", "node-x86_64-pc-windows-msvc.exe"),
    path.join(appRoot(),     "src-tauri", "target", "release", "node.exe"),
  ];
  for (const c of cands) if (fs.existsSync(c)) return c;
  return cands[0];
}
function hermesExePath() {
  return path.join(installRoot(), "bin", "hermes.exe");
}

function httpsGetJSON(url, depth = 0) {
  if (depth > 6) return Promise.reject(new Error("too many redirects"));
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "orangebox-dep-updater/6.0.9", "Accept": "application/json" },
      timeout: 20000,
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        res.resume();
        return httpsGetJSON(res.headers.location, depth + 1).then(resolve, reject);
      }
      let body = "";
      res.on("data", d => body += d);
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("invalid JSON: " + e.message + " (body starts: " + body.slice(0, 60) + ")")); } });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function httpsDownload(url, destPath, depth = 0) {
  if (depth > 6) return Promise.reject(new Error("too many redirects"));
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    const tmp = destPath + ".tmp";
    const file = fs.createWriteStream(tmp);
    const req = https.get(url, {
      headers: { "User-Agent": "orangebox-dep-updater/6.0.9" },
      timeout: 180000,
    }, (res) => {
      if ([301, 302, 307, 308].includes(res.statusCode)) {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
        return httpsDownload(res.headers.location, destPath, depth + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(tmp); } catch {}
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close(() => {
          try { fs.renameSync(tmp, destPath); resolve({ path: destPath, bytes: fs.statSync(destPath).size }); }
          catch (e) { reject(e); }
        });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function currentNodeVersion() {
  const exe = nodeExePath();
  if (!fs.existsSync(exe)) return null;
  try {
    const r = spawnSync(exe, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return r.stdout.trim();
  } catch { /* ignore */ }
  return null;
}

function compareSemver(a, b) {
  const pa = String(a || "").replace(/^v/, "").split(/[.+-]/).map(s => parseInt(s, 10) || 0);
  const pb = String(b || "").replace(/^v/, "").split(/[.+-]/).map(s => parseInt(s, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

export async function status() {
  const out = {
    node:   { path: nodeExePath(),   exists: fs.existsSync(nodeExePath()) },
    hermes: { path: hermesExePath(), exists: fs.existsSync(hermesExePath()) },
  };
  out.node.current = currentNodeVersion();
  try {
    const index = await httpsGetJSON(NODE_INDEX_URL);
    const lts = (Array.isArray(index) ? index : []).find(v => v.lts);
    if (lts) {
      out.node.latest_lts = lts.version;
      out.node.codename   = lts.lts;
      out.node.update_available = out.node.current
        ? compareSemver(out.node.current, lts.version) < 0
        : true;
    }
  } catch (e) {
    out.node.fetch_error = String(e.message || e);
  }
  try {
    const rel = await httpsGetJSON(HERMES_API);
    if (rel?.tag_name) {
      out.hermes.latest          = rel.tag_name;
      out.hermes.published_at    = rel.published_at;
      const asset = (rel.assets || []).find(a => /win.*\.(exe|zip)$/i.test(a.name));
      out.hermes.windows_asset   = asset?.browser_download_url || null;
      out.hermes.windows_asset_name = asset?.name || null;
      out.hermes.update_available = !out.hermes.exists; // No way to introspect Hermes version offline yet
    }
  } catch (e) {
    out.hermes.fetch_error = String(e.message || e);
  }
  return out;
}

export async function update({ which = "all" } = {}) {
  const results = {};
  const want = (k) => which === "all" || which === k;

  if (want("node")) {
    try {
      const index = await httpsGetJSON(NODE_INDEX_URL);
      const lts = (Array.isArray(index) ? index : []).find(v => v.lts);
      if (!lts) throw new Error("no LTS in nodejs.org/dist/index.json");
      const url = `https://nodejs.org/dist/${lts.version}/node-${lts.version}-win-x64.zip`;
      const tmpZip = path.join(os.tmpdir(), `obx_node_${lts.version}.zip`);
      const dl = await httpsDownload(url, tmpZip);
      const extractDir = path.join(os.tmpdir(), `obx_node_${lts.version}_extract`);
      try { fs.rmSync(extractDir, { recursive: true, force: true }); } catch {}
      fs.mkdirSync(extractDir, { recursive: true });
      const r = spawnSync("powershell", [
        "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
        "-Command", `Expand-Archive -Path "${tmpZip}" -DestinationPath "${extractDir}" -Force`,
      ], { encoding: "utf8", windowsHide: true });
      if (r.status !== 0) throw new Error("extract failed: " + (r.stderr || r.stdout));
      const found = findFile(extractDir, "node.exe");
      if (!found) throw new Error("node.exe not found in zip");
      const dest = nodeExePath();
      if (fs.existsSync(dest)) {
        try { fs.renameSync(dest, dest + ".bak-" + Date.now()); } catch {}
      }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(found, dest);
      results.node = { ok: true, version: lts.version, dest, bytes: dl.bytes, source: url };
    } catch (e) {
      results.node = { ok: false, error: String(e.message || e) };
    }
  }

  if (want("hermes")) {
    try {
      const rel = await httpsGetJSON(HERMES_API);
      const asset = (rel.assets || []).find(a => /win.*\.(exe|zip)$/i.test(a.name));
      if (!asset) {
        results.hermes = { ok: false, error: "no Windows asset in latest Hermes release; build from source: https://github.com/NousResearch/hermes-agent" };
      } else {
        const dest = hermesExePath();
        const isZip = /\.zip$/i.test(asset.name);
        if (isZip) {
          const tmpZip = path.join(os.tmpdir(), "obx_hermes_" + Date.now() + ".zip");
          const dl = await httpsDownload(asset.browser_download_url, tmpZip);
          const extractDir = path.join(os.tmpdir(), "obx_hermes_extract_" + Date.now());
          fs.mkdirSync(extractDir, { recursive: true });
          const r = spawnSync("powershell", [
            "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
            "-Command", `Expand-Archive -Path "${tmpZip}" -DestinationPath "${extractDir}" -Force`,
          ], { encoding: "utf8", windowsHide: true });
          if (r.status !== 0) throw new Error("hermes extract failed: " + r.stderr);
          const found = findFile(extractDir, "hermes.exe");
          if (!found) throw new Error("hermes.exe not in zip");
          if (fs.existsSync(dest)) { try { fs.renameSync(dest, dest + ".bak-" + Date.now()); } catch {} }
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(found, dest);
          results.hermes = { ok: true, version: rel.tag_name, dest, bytes: dl.bytes, source: asset.browser_download_url };
        } else {
          if (fs.existsSync(dest)) { try { fs.renameSync(dest, dest + ".bak-" + Date.now()); } catch {} }
          const dl = await httpsDownload(asset.browser_download_url, dest);
          results.hermes = { ok: true, version: rel.tag_name, dest, bytes: dl.bytes, source: asset.browser_download_url };
        }
      }
    } catch (e) {
      results.hermes = { ok: false, error: String(e.message || e) };
    }
  }
  return results;
}

function findFile(rootDir, name) {
  let result = null;
  function walk(d) {
    if (result) return;
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (result) return;
      if (e.name.toLowerCase() === name.toLowerCase() && e.isFile()) { result = path.join(d, e.name); return; }
      if (e.isDirectory()) walk(path.join(d, e.name));
    }
  }
  walk(rootDir);
  return result;
}

// CLI
const selfUrl = import.meta.url.replace(/\\/g, "/");
const argv1   = (process.argv && process.argv[1]) ? String(process.argv[1]).replace(/\\/g, "/") : "";
if (argv1 && (selfUrl.endsWith(argv1) || selfUrl === `file:///${argv1}`)) {
  const cmd = process.argv[2] || "status";
  if (cmd === "status") {
    const s = await status();
    console.log(JSON.stringify(s, null, 2));
  } else if (cmd === "update") {
    const which = process.argv[3] || "all";
    const r = await update({ which });
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.error("Usage: node dep-updater.mjs status|update [node|hermes|all]");
    process.exit(1);
  }
}
