#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const exportsRoot = path.join(dataRoot, "exports");
const outDir = path.join(exportsRoot, "codexa-rail-recovery-pack");
const receiptsDir = path.join(dataRoot, "receipts");
const zipPath = path.join(exportsRoot, "codexa-rail-recovery-pack-WINDOWS-NATIVE.zip");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256File(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function runNodeScript(script) {
  const started = Date.now();
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [script], {
      cwd: repoRoot,
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 10_000_000,
    });
    return {
      ok: true,
      command: `node ${script}`,
      duration_ms: Date.now() - started,
      stdout_tail: String(stdout || "").slice(-4000),
      stderr_tail: String(stderr || "").slice(-4000),
    };
  } catch (error) {
    return {
      ok: false,
      command: `node ${script}`,
      duration_ms: Date.now() - started,
      exit_code: error.code ?? null,
      stdout_tail: String(error.stdout || "").slice(-4000),
      stderr_tail: String(error.stderr || error.message || "").slice(-4000),
    };
  }
}

async function copyRequiredFiles() {
  await fsp.rm(outDir, { recursive: true, force: true });
  await fsp.mkdir(outDir, { recursive: true });

  const files = [
    [path.join(repoRoot, "scripts", "START_CODEXA_RAIL.ps1"), path.join(outDir, "START_CODEXA_RAIL.ps1")],
    [path.join(exportsRoot, "codexa-command-rail-pack", "codexa-command-rail-server.mjs"), path.join(outDir, "codexa-command-rail-server.mjs")],
    [path.join(exportsRoot, "codexa-bridge-pack", "codexa-bridge-server.mjs"), path.join(outDir, "codexa-bridge-server.mjs")],
    [path.join(exportsRoot, "codexa-command-rail-pack", "SET_CONTROLLER_COMMAND_TOKEN.cmd"), path.join(outDir, "SET_CONTROLLER_COMMAND_TOKEN.cmd")],
    [path.join(exportsRoot, "codexa-bridge-pack", "SET_COCKPIT_TOKEN.cmd"), path.join(outDir, "SET_BRIDGE_TOKEN.cmd")],
  ];

  const copied = [];
  const missing = [];
  for (const [src, dest] of files) {
    if (!fs.existsSync(src)) {
      missing.push(src);
      continue;
    }
    await fsp.copyFile(src, dest);
    copied.push({ src, dest, sha256: sha256File(dest) });
  }

  await fsp.writeFile(path.join(outDir, "RUN_ON_CODEXA_AS_ADMIN.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0START_CODEXA_RAIL.ps1\" -EnableRdp",
    "pause",
    "",
  ].join("\r\n"), "utf8");

  await fsp.writeFile(path.join(outDir, "RUN_ON_CODEXA_AS_ADMIN_WITH_MODEL_PULLS.cmd"), [
    "@echo off",
    "cd /d %~dp0",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -File \"%~dp0START_CODEXA_RAIL.ps1\" -EnableRdp -PullModels",
    "pause",
    "",
  ].join("\r\n"), "utf8");

  await fsp.writeFile(path.join(outDir, "README_CODEXA_RECOVERY.md"), `# Codexa Rail Recovery Pack

Run this pack on Codexa / AI Box, not on Cockpit.

## Fast recovery

Right-click \`RUN_ON_CODEXA_AS_ADMIN.cmd\` and choose Run as administrator.

Expected success line:

\`\`\`text
READY
\`\`\`

This starts:

- command rail: \`0.0.0.0:8097\`
- bridge rail: \`0.0.0.0:8098\`

It also writes receipts under:

\`\`\`text
C:\\AtomEons\\ai-box\\receipts
\`\`\`

## Model pulls

Use \`RUN_ON_CODEXA_AS_ADMIN_WITH_MODEL_PULLS.cmd\` only when you want Ollama model pulls to start in the background. \`READY\` means the rail is up; model downloads can continue after that.

## Controller token

If this pack generated or repaired tokens, run this on Cockpit after Codexa reports READY:

\`\`\`text
C:\\AtomEons\\ai-box\\SET_CONTROLLER_ORANGEBOX_TOKENS.cmd
\`\`\`

If you cannot access that file from Cockpit, copy it from Codexa after the starter runs.
`, "utf8");

  return { copied, missing };
}

async function zipOutput() {
  await fsp.rm(zipPath, { force: true });
  const ps = [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    `Compress-Archive -Path '${outDir.replace(/'/g, "''")}\\*' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
  ];
  await execFileAsync("powershell.exe", ps, { windowsHide: true, timeout: 120_000 });
}

async function main() {
  await fsp.mkdir(exportsRoot, { recursive: true });
  const steps = [
    await runNodeScript(path.join(repoRoot, "scripts", "codexa-command-rail-pack.mjs")),
    await runNodeScript(path.join(repoRoot, "scripts", "codexa-bridge-pack.mjs")),
  ];

  const fileResult = await copyRequiredFiles();
  await zipOutput();
  const zipStat = fs.statSync(zipPath);
  const result = {
    ok: steps.every((step) => step.ok) && fileResult.missing.length === 0 && fs.existsSync(zipPath),
    version: "orangebox-codexa-rail-recovery-pack/v0",
    created_at: new Date().toISOString(),
    out_dir: outDir,
    zip_path: zipPath,
    zip_bytes: zipStat.size,
    steps,
    files: fileResult.copied,
    missing: fileResult.missing,
    next_action: "Copy the recovery pack folder or zip to Codexa, then run RUN_ON_CODEXA_AS_ADMIN.cmd as Administrator.",
  };

  if (receipt) {
    await fsp.mkdir(receiptsDir, { recursive: true });
    const receiptPath = path.join(receiptsDir, `codexa-rail-recovery-pack-${stamp()}.json`);
    await fsp.writeFile(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  console.log(json ? JSON.stringify(result, null, 2) : result.ok ? "CODEXA_RAIL_RECOVERY_PACK_GREEN" : "CODEXA_RAIL_RECOVERY_PACK_FAILED");
  if (!result.ok) process.exitCode = 1;
}

await main();
