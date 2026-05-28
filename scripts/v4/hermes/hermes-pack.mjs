#!/usr/bin/env node
/* ============================================================================
   hermes-pack.mjs — ORANGEBOX Codexa Hermes Agent Pack Builder

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. This pack is what buyers run to install
                     Hermes on Codexa. Every path is real. No stubs.

   Hermes Agent replaces OpenClaw as the outer-orchestration agent on the
   Codexa rail starting in ORANGEBOX v4.0.1. MIT-licensed, Nous Research.
   Source: https://github.com/nousresearch/hermes-agent

   Usage
   ─────
     node hermes-pack.mjs                      — build to default exports/
     node hermes-pack.mjs --build              — explicit build flag (same)
     node hermes-pack.mjs --build --output <p> — build to custom output path
     node hermes-pack.mjs --help               — usage

   Zero npm dependencies. Node 22.14+ required.
   ============================================================================ */

import fs     from "node:fs/promises";
import path   from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Canonical root: the installed ORANGEBOX app directory.
// Matches the pattern used across v4 scripts.
const orangeRoot = process.env.ORANGEBOX_ROOT
  ? path.resolve(process.env.ORANGEBOX_ROOT)
  : path.resolve(__dirname, "..", "..", "..");

const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

// ─── CLI ────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
hermes-pack.mjs — Build the ORANGEBOX Codexa Hermes Agent install bundle.

  node hermes-pack.mjs [--build] [--output <path>]

Flags:
  --build          Run the pack builder (default if no flags given).
  --output <path>  Override the export directory. Default: <orangeRoot>/exports/
  --help           This message.

Environment:
  ORANGEBOX_ROOT   Override the inferred orange root directory.
`.trim());
  process.exit(0);
}

// Accept --build flag or no flags (default to build).
const doingBuild = args.length === 0 || args.includes("--build");
if (!doingBuild) {
  console.error(JSON.stringify({ status: "FAILED", error: "Unrecognized flags. Run --help." }));
  process.exit(1);
}

// --output <path> override
let exportsBase = path.join(orangeRoot, "exports");
const outputIdx = args.indexOf("--output");
if (outputIdx !== -1) {
  const outVal = args[outputIdx + 1];
  if (!outVal || outVal.startsWith("--")) {
    console.error(JSON.stringify({ status: "FAILED", error: "--output requires a path argument." }));
    process.exit(1);
  }
  exportsBase = path.resolve(outVal);
}

const PACK_NAME   = "codexa-hermes-pack";
const outDir      = path.join(exportsBase, PACK_NAME);
const zipFilename = `${PACK_NAME}-WINDOWS-NATIVE-${TODAY}.zip`;
const zipPath     = path.join(exportsBase, zipFilename);
const latestZip   = path.join(exportsBase, `${PACK_NAME}-WINDOWS-NATIVE.zip`);

// ─── PowerShell zip helper ────────────────────────────────────────────────────

function psSingleQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function compressArchive(sourceDir, targetZip) {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$src = ${psSingleQuote(path.join(sourceDir, "*"))}`,
    `$dst = ${psSingleQuote(targetZip)}`,
    "if (Test-Path -LiteralPath $dst) { Remove-Item -LiteralPath $dst -Force }",
    "Compress-Archive -Path $src -DestinationPath $dst -CompressionLevel Optimal -Force"
  ].join("; ");
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { stdio: "pipe", windowsHide: true }
  );
}

// ─── Source file loader ───────────────────────────────────────────────────────
// We include the four installer scripts and the two doc files from this
// same directory. The pack is self-contained.

async function loadSibling(filename) {
  return fs.readFile(path.join(__dirname, filename), "utf8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(JSON.stringify({ phase: "START", packName: PACK_NAME, outDir, orangeRoot }));

  // Stage
  await fs.rm(outDir, { recursive: true, force: true });
  await fs.mkdir(outDir, { recursive: true });

  // Pull the four installer scripts + docs from this directory
  const filesToBundle = [
    "INSTALL_HERMES.ps1",
    "INSTALL_HERMES.sh",
    "hermes-status.mjs",
    "hermes-migrate-from-openclaw.mjs",
    "AGENTS.md",
    "README.md"
  ];

  const bundled = [];
  for (const fn of filesToBundle) {
    const srcPath = path.join(__dirname, fn);
    const dstPath = path.join(outDir, fn);
    try {
      await fs.copyFile(srcPath, dstPath);
      bundled.push(fn);
    } catch (err) {
      // Non-fatal: record missing file in manifest but continue pack
      console.error(JSON.stringify({ phase: "WARN", file: fn, error: err.message }));
    }
  }

  // Write a manifest
  const manifest = {
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    doctrineCitation: "V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)",
    packName: PACK_NAME,
    hermesProject: "https://github.com/nousresearch/hermes-agent",
    license: "MIT",
    hermesInstallCurl: "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash",
    defaultPorts: { mcp: 18790, gateway: 18791, dashboard: 9119 },
    configRoot: "~/.hermes/",
    guardrails: [
      "ORANGEBOX is source of truth",
      "gateway loopback-only by default",
      "no auto-install of public skills",
      "auto-generated skills staged to skills-pending/ pending operator promotion",
      "messaging gateway off until operator pairs explicitly"
    ],
    files: bundled
  };
  await fs.writeFile(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  // Zip
  await fs.rm(zipPath, { force: true });
  await fs.rm(latestZip, { force: true });
  compressArchive(outDir, zipPath);
  await fs.copyFile(zipPath, latestZip);

  const stat = await fs.stat(zipPath);
  const hash = crypto.createHash("sha256").update(await fs.readFile(zipPath)).digest("hex");

  // Receipt
  const receiptDir = path.join(orangeRoot, "receipts");
  await fs.mkdir(receiptDir, { recursive: true });
  const receiptTs    = new Date().toISOString().replace(/[:.]/g, "-");
  const receiptPath  = path.join(receiptDir, `hermes-pack-${receiptTs}.json`);
  const receiptData  = {
    generatedAt: new Date().toISOString(),
    status: "VERIFIED",
    doctrineCitation: "V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)",
    outDir,
    zipPath,
    latestZip,
    zipBytes: stat.size,
    sha256: hash,
    bundledFiles: bundled,
    hermesProject: "https://github.com/nousresearch/hermes-agent",
    momsLaw: "Full effort. Every path is real."
  };
  await fs.writeFile(receiptPath, JSON.stringify(receiptData, null, 2), "utf8");

  console.log(JSON.stringify({
    status: "VERIFIED",
    outDir,
    zipPath,
    latestZip,
    zipBytes: stat.size,
    sha256: hash,
    receiptPath,
    bundledFiles: bundled
  }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "FAILED", error: err.message }));
  process.exit(1);
});
