#!/usr/bin/env node
/* ============================================================================
   pack-v6-portable.mjs — ORANGEBOX v6 portable zip builder
   ============================================================================
   Produces a single zip that ships:
     - orangebox.exe              (native v6 binary)
     - node.exe                   (sidecar runtime)
     - scripts/                   (Node sidecar + smart router)
     - src/                       (HTML assets used by v6.1+ iframe lanes)
     - docs/                      (curated buyer docs + API contract)
     - data-template/             (seed receipts / project spine)
     - README.txt                 (one-paragraph install instructions)

   The buyer's experience:
     1. Download the zip
     2. Unzip anywhere
     3. Double-click orangebox.exe

   Zero install. Zero admin. Zero PowerShell. Zero pain.
   ============================================================================ */

import fs        from "node:fs";
import fsp       from "node:fs/promises";
import path      from "node:path";
import crypto    from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { buildEtherealLinkPack } from "./v4/ai-box-network.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const REL  = path.join(ROOT, "src-tauri", "target", "release");
const EXE  = path.join(REL, "orangebox.exe");
const NODE = path.join(REL, "node.exe");
// Ship directory canon: C:\AtomEons\ship\ (matches v1.0..v5.2 archive)
const SHIP_DIR = process.env.ORANGEBOX_SHIP_DIR || path.resolve(ROOT, "..", "ship");
fs.mkdirSync(SHIP_DIR, { recursive: true });
const BUILD_VERSION = process.env.ORANGEBOX_BUILD_VERSION || "6.3.0-alpha.7";
const OUT   = path.join(SHIP_DIR, `orangebox-v${BUILD_VERSION}-portable.zip`);
const STAGE = path.join(SHIP_DIR, `orangebox-v${BUILD_VERSION}-portable`);

console.log("[pack-v6] root:", ROOT);
console.log("[pack-v6] exe :", EXE);
console.log("[pack-v6] out :", OUT);

// ── 1. Sanity: native binary must exist ─────────────────────────────────────
if (!fs.existsSync(EXE)) {
  console.error("[pack-v6] FATAL: orangebox.exe not found at", EXE);
  console.error("[pack-v6] run: cargo build --release --bin orangebox");
  process.exit(1);
}

// ── 2. Locate node.exe ──────────────────────────────────────────────────────
// Tauri puts the sidecar at ../binaries/node-x86_64-pc-windows-msvc.exe.
// Cargo's release dir may not have it copied yet. Resolve robustly.
let nodeSource = null;
const nodeCandidates = [
  NODE,
  path.join(ROOT, "src-tauri", "binaries", "node-x86_64-pc-windows-msvc.exe"),
  path.join(ROOT, "src-tauri", "binaries", "node.exe"),
];
for (const c of nodeCandidates) {
  if (fs.existsSync(c)) { nodeSource = c; break; }
}
if (!nodeSource) {
  console.error("[pack-v6] FATAL: node.exe not found in:", nodeCandidates);
  process.exit(1);
}

// ── 3. Stage the directory tree ─────────────────────────────────────────────
if (fs.existsSync(STAGE)) {
  fs.rmSync(STAGE, { recursive: true, force: true });
}
fs.mkdirSync(STAGE, { recursive: true });

// Top-level files
const copies = [
  [EXE,        path.join(STAGE, "orangebox.exe")],
  [nodeSource, path.join(STAGE, "node.exe")],
];
for (const [src, dst] of copies) {
  fs.copyFileSync(src, dst);
  console.log(`[pack-v6] copy ${path.basename(src)} (${fs.statSync(src).size} bytes)`);
}

// Recursive copy helper
function copyDir(src, dst, opts = {}) {
  const { skip = [] } = opts;
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, opts);
    } else if (entry.isFile()) {
      fs.copyFileSync(s, d);
    }
  }
}

copyDir(path.join(ROOT, "scripts"),       path.join(STAGE, "scripts"),       { skip: ["node_modules", ".git"] });
copyDir(path.join(ROOT, "src"),           path.join(STAGE, "src"),           { skip: ["node_modules", ".git"] });
copyDir(path.join(ROOT, "data-template"), path.join(STAGE, "data-template"), { skip: ["node_modules", ".git"] });
copyDir(path.join(ROOT, "references"),    path.join(STAGE, "references"),    { skip: ["node_modules", ".git"] });
copyDir(path.join(ROOT, "prompts"),       path.join(STAGE, "prompts"),       { skip: ["node_modules", ".git"] });

// Curated buyer docs only. Historical planning docs remain in the source repo,
// but the portable package should not make buyers dig through stale naming or
// old architecture debates to find the current AE See-Suite/AE Operations path.
const buyerDocs = [
  "QUICKSTART.md",
  "OPERATOR_MANUAL.md",
  "VALUE_JUSTIFICATION.md",
  "AE_SEE_SUITE_INTERFACE_DIRECTION.md",
  "AI_BOX_WORKER_RAIL.md",
  "AI_COMPUTER_BUYING_GUIDE.md",
  "AI_BOX_NETWORK_PRIORITY.md",
  "ALPHA7_READINESS_DOCTOR.md",
  "FINAL_GREEN_BOARD.md",
  "SILENT_CANVAS_DOCTRINE.md",
  "SURFACE_FACTORY.md",
  "MCP_BRIDGE_AND_VERIFIER.md",
  "VAULT_RECOVERY.md",
  "ROLLBACK.md",
  "THIRD-PARTY.md",
];
for (const rel of buyerDocs) {
  const src = path.join(ROOT, "docs", rel);
  const dst = path.join(STAGE, "docs", rel);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}
copyDir(path.join(ROOT, "docs", "api"), path.join(STAGE, "docs", "api"), { skip: ["node_modules", ".git"] });

// Ship the Ethereal AI Link installer payload as a real tool module. The
// generated local socket token is intentionally excluded from the portable zip;
// each installation creates its own token with RUN_CREATE_SOCKET_TOKEN.cmd.
console.log("[pack-v6] building Ethereal AI Link installer payload...");
const etherealBuild = await buildEtherealLinkPack({ storageMode: "Auto", writeReceipt: false });
const etherealPayloadDir = path.join(STAGE, "tools", "ethereal-ai-link");
copyDir(etherealBuild.pack_dir, etherealPayloadDir, { skip: ["ETHEREAL_SOCKET_TOKEN.txt"] });
fs.writeFileSync(path.join(etherealPayloadDir, "INSTALLER_PAYLOAD_NOTE.txt"), [
  "ORANGEBOX Ethereal AI Link installer payload",
  "",
  "This payload is generated during ORANGEBOX portable packaging.",
  "ETHEREAL_SOCKET_TOKEN.txt is not shipped; run RUN_CREATE_SOCKET_TOKEN.cmd on the install machine before starting the socket daemon.",
  "Applying adapter, firewall, MTU, SMB, or storage settings still requires explicit Administrator execution.",
  "",
].join("\r\n"));

// Minimal native provenance needed by the packaged alpha.7 doctor source probe.
// Do not copy target/ or build artifacts back into the portable; this is tiny
// proof material, not a source distribution.
const nativeProofFiles = [
  ["src-tauri/src/lib.rs", "src-tauri/src/lib.rs"],
  ["src-tauri/src/main.rs", "src-tauri/src/main.rs"],
  ["src-tauri/src/bin/native.rs", "src-tauri/src/bin/native.rs"],
  ["src-tauri/Cargo.toml", "src-tauri/Cargo.toml"],
  ["src-tauri/Cargo.lock", "src-tauri/Cargo.lock"],
  ["src-tauri/tauri.conf.json", "src-tauri/tauri.conf.json"],
  ["package.json", "package.json"],
];
for (const [srcRel, dstRel] of nativeProofFiles) {
  const src = path.join(ROOT, srcRel);
  const dst = path.join(STAGE, dstRel);
  if (!fs.existsSync(src)) continue;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

// Buyer-facing top-level guides. These ship beside the executable so Basic
// Install vs Advanced AI Box is clear before the first launch.
const topLevelGuides = [
  "0-START-HERE.txt",
  "INSTALL-FIRST.txt",
  "README.md",
  "LICENSE.txt",
  "EULA.txt",
];
for (const rel of topLevelGuides) {
  const src = path.join(ROOT, rel);
  const dst = path.join(STAGE, rel);
  if (!fs.existsSync(src)) continue;
  fs.copyFileSync(src, dst);
}

// ── 4. Write README.txt (buyer-facing) ──────────────────────────────────────
const README = `ORANGEBOX v${BUILD_VERSION} - AE See-Suite / AE Operations
================================

Private local-first command suite. Single executable. Native shell, local
sidecar, Silent Canvas proof surfaces, receipts, and alpha.7 readiness doctor.

Install
-------
1. Unzip this folder anywhere — Desktop, Documents, USB stick, anywhere.
2. Double-click orangebox.exe.
3. Pick Basic Install unless you already have a second AI computer to connect.
4. That's it.

The first launch spins up the local sidecar in the background (handled by the
included node.exe — no system Node required). The ORANGEBOX window appears
within 2-3 seconds.

Air-gap mode
------------
To run fully offline with local Ollama models:

  set ORANGEBOX_LOCAL_MODE=1
  orangebox.exe

(Requires Ollama installed locally with qwen2.5:7b or llama3.2:3b pulled.)

Updates
-------
Auto-update endpoint: https://atomeons.com/orangebox/update-manifest.json
You will be notified inside ORANGEBOX when the next signed build ships.

Privacy
-------
Zero telemetry by default. Every egress call is audited in the Privacy lane.
Air-gap toggle hard-blocks all remote model calls.

Support
-------
0-START-HERE.txt - what to read first
INSTALL-FIRST.txt - Basic vs Advanced install path
docs/QUICKSTART.md - five-minute operator orientation
docs/OPERATOR_MANUAL.md - full operating manual
docs/ALPHA7_READINESS_DOCTOR.md - one-command alpha.7 proof bundle
docs/SILENT_CANVAS_DOCTRINE.md - product doctrine

AI Box Networking
-----------------
Basic Install is one computer. Advanced AI Box is controller + AI computer over
router LAN, Thunderbolt-class direct networking, or Ethereal Ethernet.

docs/AI_COMPUTER_BUYING_GUIDE.md - what an AI computer is and how to choose one
docs/AI_BOX_WORKER_RAIL.md - Basic vs Advanced AI Box setup
tools/ethereal-ai-link/README.md - direct-cable Ethereal AI Link module
tools/ethereal-ai-link/RUN_CREATE_SOCKET_TOKEN.cmd - creates a per-install socket token
tools/ethereal-ai-link/RUN_AS_ADMIN_DRY_RUN.cmd - read-only adapter/storage preview
tools/ethereal-ai-link/RUN_AS_ADMIN_APPLY_HOST.cmd - apply host-side direct link
tools/ethereal-ai-link/RUN_AS_ADMIN_APPLY_PEER.cmd - apply peer-side direct link

— Atom McCree / AtomEons Systems Laboratory
  Disclosure: ATOM-OBX-V6-RELEASE-2026-0517
`;
fs.writeFileSync(path.join(STAGE, "README.txt"), README);

// ── 5. Zip it (use PowerShell Compress-Archive — Windows-native, no deps) ───
if (fs.existsSync(OUT)) fs.unlinkSync(OUT);

console.log("[pack-v6] compressing...");
const startCompress = Date.now();
const compressResult = spawnSync("powershell", [
  "-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden",
  "-Command", `Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${OUT}' -CompressionLevel Optimal -Force`,
], { stdio: "inherit", windowsHide: true });
if (compressResult.status !== 0) {
  console.error("[pack-v6] Compress-Archive failed exit", compressResult.status);
  process.exit(1);
}
console.log(`[pack-v6] compressed in ${((Date.now() - startCompress) / 1000).toFixed(1)}s`);

// ── 6. SHA-256 the archive ──────────────────────────────────────────────────
const buf  = fs.readFileSync(OUT);
const hash = crypto.createHash("sha256").update(buf).digest("hex");
const size = buf.length;
console.log(`[pack-v6] OK: ${OUT}`);
console.log(`[pack-v6] size  : ${size} bytes (${(size / 1024 / 1024).toFixed(2)} MB)`);
console.log(`[pack-v6] sha256: ${hash}`);

// ── 7. Emit a JSON manifest beside the zip for receipt generation ───────────
const manifest = {
  version:    BUILD_VERSION,
  codename:   "Native",
  timestamp:  new Date().toISOString(),
  stage_dir:  STAGE,
  zip_path:   OUT,
  zip_size:   size,
  zip_sha256: hash,
  exe_path:   path.join(STAGE, "orangebox.exe"),
  exe_size:   fs.statSync(path.join(STAGE, "orangebox.exe")).size,
  exe_sha256: crypto.createHash("sha256").update(fs.readFileSync(path.join(STAGE, "orangebox.exe"))).digest("hex"),
  node_size:  fs.statSync(path.join(STAGE, "node.exe")).size,
  ethereal_ai_link: {
    included: true,
    payload_dir: path.join(STAGE, "tools", "ethereal-ai-link"),
    zip_relative_dir: "tools/ethereal-ai-link",
    generated_from: etherealBuild.pack_dir,
    token_file_shipped: fs.existsSync(path.join(etherealPayloadDir, "ETHEREAL_SOCKET_TOKEN.txt")),
    create_token_command: "tools/ethereal-ai-link/RUN_CREATE_SOCKET_TOKEN.cmd",
    socket_daemon: "tools/ethereal-ai-link/ETHEREAL_SOCKET.py",
    approval_required_for_apply: true,
  },
};
fs.writeFileSync(OUT + ".manifest.json", JSON.stringify(manifest, null, 2));
console.log(`[pack-v6] manifest: ${OUT}.manifest.json`);
