#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = process.argv[2];
if (!script) {
  console.error("Usage: node control-plane/run-bun.mjs <script.ts> [...args]");
  process.exit(2);
}

const exeName = process.platform === "win32" ? "bun.exe" : "bun";
const candidates = [
  process.env.BUN_EXE,
  path.join(os.homedir(), ".bun", "bin", exeName),
  "bun",
].filter(Boolean);

let lastError = null;
for (const candidate of candidates) {
  if (path.isAbsolute(candidate) && !fs.existsSync(candidate)) continue;
  const result = spawnSync(candidate, ["run", script, ...process.argv.slice(3)], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
  });
  if (!result.error) process.exit(result.status ?? 0);
  lastError = result.error;
}

console.error(`Bun executable not found. Install Bun or set BUN_EXE. Last error: ${lastError?.message || "none"}`);
process.exit(127);
