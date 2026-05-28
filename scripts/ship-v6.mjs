#!/usr/bin/env node
/* ============================================================================
   ship-v6.mjs — one command, full v6.0 ship pipeline.
     1. verify orangebox.exe exists (built by cargo)
     2. (optional) smoke-launch + status probe
     3. pack portable zip
     4. write build receipt
     5. (optional) hand off NSIS via tauri build (separate, see DOCs)
   ============================================================================ */
import fs    from "node:fs";
import path  from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, "")), "..");
const EXE  = path.join(ROOT, "src-tauri", "target", "release", "orangebox.exe");

function step(name, fn) {
  process.stdout.write(`▶ ${name}... `);
  const t0 = Date.now();
  try {
    fn();
    console.log(`OK (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`FAIL`);
    console.error(e.message || e);
    process.exit(1);
  }
}

step("1. verify native binary exists", () => {
  if (!fs.existsSync(EXE)) throw new Error(`missing ${EXE}`);
  const stat = fs.statSync(EXE);
  console.log(`(${(stat.size/1024/1024).toFixed(2)} MB)`);
});

step("2. pack portable zip", () => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "pack-v6-portable.mjs")], { stdio: "inherit" });
});

step("3. write build receipt", () => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts", "write-build-receipt.mjs")], { stdio: "inherit" });
});

console.log("");
console.log("SHIP READY — v6.0.0");
console.log("Deliverables:");
console.log(`  ${path.resolve(ROOT, "..", "orangebox-v6.0.0-portable.zip")}`);
console.log(`  ${path.join(ROOT, "receipts", "BUILD_v6.0.0.json")}`);
