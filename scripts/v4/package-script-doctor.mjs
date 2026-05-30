#!/usr/bin/env node
/*
  package-script-doctor.mjs

  Backend/Ops consistency check for Orangebox Delta package scripts.

  It parses root package.json and workspace package.json files, extracts obvious
  local file references from npm scripts, and reports missing files. It is a
  doctor only: no mutation, no install, no execution of project scripts.
*/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const receiptDir = path.join(root, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function exists(file) {
  return fs.existsSync(file);
}

function normalizePathToken(token) {
  return token
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\/g, path.sep)
    .replace(/\//g, path.sep);
}

function cleanShellToken(raw) {
  return normalizePathToken(String(raw || "")
    .trim()
    .replace(/^[({[]+/, "")
    .replace(/[)}\],]+$/, "")
    .replace(/^['"]|['"]$/g, ""));
}

function isLocalFileRef(ref) {
  if (!ref) return false;
  if (/^[A-Za-z]:/.test(ref)) return false; // external absolute Windows path
  if (ref.startsWith("http")) return false;
  if (ref.startsWith("--")) return false;
  if (!/\.(mjs|js|ts|json|ps1|sh|prisma)$/i.test(ref)) return false;
  // Require an actual path separator. This prevents false positives such as
  // `.example.json` being extracted from `MANIFEST.example.json`.
  return ref.includes(path.sep);
}

function extractLocalRefs(script) {
  const refs = [];
  const text = String(script || "");
  const patterns = [
    /(?:node|tsx|tauri|prisma)\s+([^&|;\n]+?\.(?:mjs|js|ts|json|prisma))(?:\s|$)/gi,
    /(?:-File|--file)\s+([^&|;\n]+?\.(?:ps1|mjs|js|ts))(?:\s|$)/gi,
    /(?:^|\s)(\.{1,2}[\\/][A-Za-z0-9_./\\-]+\.(?:mjs|js|ts|json|ps1|sh|prisma))(?:\s|$)/g,
    /(?:^|\s)([A-Za-z0-9_-]+[\\/][A-Za-z0-9_./\\-]+\.(?:mjs|js|ts|json|ps1|sh|prisma))(?:\s|$)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[1] || match[0];
      const token = cleanShellToken(String(raw).trim().split(/\s+/)[0]);
      if (isLocalFileRef(token)) refs.push(token);
    }
  }
  return [...new Set(refs)];
}

function scriptRows(pkgFile, workspaceRoot) {
  const pkg = readJson(pkgFile);
  const scripts = pkg.scripts || {};
  const rows = [];
  for (const [name, script] of Object.entries(scripts)) {
    const refs = extractLocalRefs(String(script));
    for (const ref of refs) {
      const target = path.resolve(workspaceRoot, ref);
      rows.push({ package: pkg.name || path.basename(workspaceRoot), script: name, ref, target, exists: exists(target) });
    }
  }
  return rows;
}

function workspacePackageFiles(rootPkg) {
  const files = [path.join(root, "package.json")];
  for (const workspace of rootPkg.workspaces || []) {
    const pkgFile = path.join(root, workspace, "package.json");
    if (exists(pkgFile)) files.push(pkgFile);
  }
  return files;
}

function main() {
  const rootPkg = readJson(path.join(root, "package.json"));
  const packageFiles = workspacePackageFiles(rootPkg);
  const rows = packageFiles.flatMap((pkgFile) => scriptRows(pkgFile, path.dirname(pkgFile)));
  const missing = rows.filter((row) => !row.exists);
  const result = {
    ok: missing.length === 0,
    version: "orangebox-package-script-doctor/v2",
    checked_at: new Date().toISOString(),
    packages_checked: packageFiles.map((file) => path.relative(root, file).replace(/\\/g, "/")),
    local_refs_checked: rows.length,
    missing_count: missing.length,
    missing: missing.map((row) => ({
      package: row.package,
      script: row.script,
      ref: row.ref,
      target: path.relative(root, row.target).replace(/\\/g, "/"),
    })),
    status: missing.length === 0 ? "PACKAGE_SCRIPT_REFS_GREEN" : "PACKAGE_SCRIPT_REFS_NOT_GREEN",
  };

  if (receipt) {
    fs.mkdirSync(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `orangebox-package-script-doctor-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  console.log(json ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

main();
