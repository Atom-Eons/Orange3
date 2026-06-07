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
const verifyInstall = args.has("--verify-install") || args.has("--verify");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..", "..");
const finalRoot = process.env.ORANGEBOX_FINAL_ROOT || "C:\\AtomEons\\orangebox\\finals\\Orangebox Delta Final";
const finalsRoot = path.dirname(finalRoot);
const receiptsDir = path.join(repoRoot, "receipts");

const ROOT_ITEMS = [
  "0-START-HERE.txt",
  "AGENTS.md",
  "Addons",
  "INSTALL-FIRST.txt",
  "README.md",
  "apps",
  "config",
  "control-plane",
  "data-template",
  "docs",
  "integrations",
  "references",
  "schemas",
  "scripts",
  "skills",
  "src",
];

const SKIP_DIRS = new Set([
  ".git",
  ".missions",
  ".worktrees",
  "dist",
  "frontend",
  "node_modules",
  "proof",
  "receipts",
]);

const SKIP_FILES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "package-lock.json",
]);

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(file) {
  if (!fs.existsSync(file)) return null;
  return sha256Buffer(fs.readFileSync(file));
}

function safeRelative(from, to) {
  return path.relative(from, to).replace(/\\/g, "/");
}

function assertFinalPathSafe() {
  const resolvedFinal = path.resolve(finalRoot);
  const resolvedFinals = path.resolve(finalsRoot);
  if (!resolvedFinal.toLowerCase().startsWith(`${resolvedFinals.toLowerCase()}${path.sep}`)) {
    throw new Error(`Refusing to package outside finals root: ${resolvedFinal}`);
  }
  if (path.basename(resolvedFinal) !== "Orangebox Delta Final") {
    throw new Error(`Final folder must be named Orangebox Delta Final: ${resolvedFinal}`);
  }
}

function shouldCopy(src) {
  const base = path.basename(src);
  if (SKIP_FILES.has(base)) return false;
  if (SKIP_DIRS.has(base) && fs.statSync(src).isDirectory()) return false;
  const rel = safeRelative(repoRoot, src);
  if (/^apps\/[^/]+/.test(rel) && !rel.startsWith("apps/api")) return false;
  return true;
}

async function runStep(name, command, commandArgs, options = {}) {
  const started = Date.now();
  const execCommand = process.platform === "win32" && command.toLowerCase().endsWith(".cmd") ? "cmd.exe" : command;
  const execArgs = execCommand === "cmd.exe" ? ["/d", "/c", command, ...commandArgs] : commandArgs;
  try {
    const { stdout, stderr } = await execFileAsync(execCommand, execArgs, {
      cwd: options.cwd || finalRoot,
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 180_000,
      maxBuffer: options.maxBuffer || 20_000_000,
      windowsHide: true,
    });
    return {
      name,
      ok: true,
      command: [command, ...commandArgs].join(" "),
      cwd: options.cwd || finalRoot,
      duration_ms: Date.now() - started,
      stdout_tail: String(stdout || "").slice(-5000),
      stderr_tail: String(stderr || "").slice(-5000),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...commandArgs].join(" "),
      cwd: options.cwd || finalRoot,
      duration_ms: Date.now() - started,
      exit_code: error.code ?? null,
      stdout_tail: String(error.stdout || "").slice(-5000),
      stderr_tail: String(error.stderr || error.message || "").slice(-5000),
    };
  }
}

async function rotateExistingFinal() {
  if (!fs.existsSync(finalRoot)) return null;
  const backupRoot = path.join(finalsRoot, ".backups");
  await fsp.mkdir(backupRoot, { recursive: true });
  const backupPath = path.join(backupRoot, `Orangebox Delta Final-${stamp()}`);
  try {
    await fsp.rename(finalRoot, backupPath);
    return { backup_path: backupPath, in_place_refresh: false, warning: null };
  } catch (error) {
    if (error?.code !== "EBUSY" && error?.code !== "EPERM") throw error;
    return {
      backup_path: null,
      in_place_refresh: true,
      warning: `Existing final folder was busy; refreshed files in place instead of rotating backup (${error.code}).`,
    };
  }
}

async function stopFinalRuntimeHolders() {
  if (process.platform !== "win32") return { ok: true, skipped: true, reason: "not_windows" };
  const script = `
$ErrorActionPreference = "SilentlyContinue"
$final = ${JSON.stringify(finalRoot)}
$ids = @()
$matches = Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and (
    $_.CommandLine -like "*$final*" -or
    $_.CommandLine -like "*orangebox-delta-api.ps1*"
  )
}
$ids += $matches.ProcessId
$portOwners = Get-NetTCPConnection -LocalPort 8797 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
$ids += $portOwners
$ids = $ids | Where-Object { $_ -and $_ -ne $PID } | Select-Object -Unique
$stopped = @()
foreach ($targetPid in $ids) {
  try {
    $proc = Get-Process -Id $targetPid -ErrorAction Stop
    Stop-Process -Id $targetPid -Force -ErrorAction Stop
    $stopped += [pscustomobject]@{ pid = $targetPid; name = $proc.ProcessName }
  } catch {
    $stopped += [pscustomobject]@{ pid = $targetPid; skipped = $true; error = $_.Exception.Message }
  }
}
[pscustomobject]@{ ok = $true; stopped = $stopped } | ConvertTo-Json -Depth 4
`;
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
      timeout: 30_000,
      maxBuffer: 512_000,
      windowsHide: true,
    });
    return JSON.parse(stdout || "{}");
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

async function copyTree() {
  await fsp.mkdir(finalRoot, { recursive: true });
  for (const item of ROOT_ITEMS) {
    const src = path.join(repoRoot, item);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(finalRoot, item);
    await fsp.cp(src, dest, {
      recursive: true,
      force: true,
      filter: (candidate) => shouldCopy(candidate),
    });
  }
}

function backendPackageJson() {
  const sourcePkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  return {
    name: "orangebox-version-1",
    version: "1.0.0",
    private: true,
    type: "module",
    description: "Orangebox Version 1 backend and operations final package.",
    workspaces: ["apps/api"],
    scripts: {
      start: "node ./scripts/orangebox-command-server.mjs",
      "backend:install": "node ./scripts/v4/orangebox-backend-install-doctor.mjs --install --json --receipt",
      "backend:proof": "node ./scripts/v4/orangebox-backend-install-doctor.mjs --json --receipt",
      "backend:start": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\AtomEons\\tools\\bin\\orangebox-delta-backend.ps1",
      "backend:api": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File C:\\AtomEons\\tools\\bin\\orangebox-delta-api.ps1",
      check: sourcePkg.scripts?.check || "node --check ./scripts/orangebox-command-server.mjs && node --check ./scripts/orangebox-mcp-server.mjs && node --check ./src/app.js && node --check ./src/first-run.js",
      "build:api": "npm.cmd run build -w @ae-see-suite/api",
      "test:api": "npm.cmd run test -w @ae-see-suite/api",
      "atomsmasher:api-smoke": "node ./scripts/v4/atomsmasher-api-smoke.mjs --json --receipt",
      "atomsmasher:doctor": "node ./scripts/v4/atomsmasher-runtime.mjs doctor --json --receipt",
      "atomsmasher:init": "node ./scripts/v4/atomsmasher-runtime.mjs init --json --receipt",
      "atomsmasher:proof": "node ./scripts/v4/atomsmasher-runtime.mjs proof --json --receipt",
      "atomsmasher:compile": "node ./scripts/v4/atomsmasher-runtime.mjs compile --query \"continue AtomSmasher without losing orders\" --json --receipt",
      "strongarm:doctor": "node ./scripts/v4/strongarm-doctor.mjs --json --receipt",
      "strongarm:demo": "python ./integrations/strongarm_easy_v0_4/strongarm.py demo --heuristic",
      "strongarm:server": "python ./integrations/strongarm_easy_v0_4/strongarm.py server --host 127.0.0.1 --port 8094",
      "strongarm:start": "node ./scripts/v4/strongarm-doctor.mjs --json --receipt --start",
      "gremlin:doctor": "node ./scripts/v4/gremlin-misfits-doctor.mjs --json --receipt",
      "misfits:doctor": "node ./scripts/v4/gremlin-misfits-doctor.mjs --json --receipt",
      "trilane:doctor": "node ./scripts/v4/trilane-model-router-doctor.mjs --json --receipt",
      "model:lane-eval": "node ./scripts/v4/local-model-lane-eval-doctor.mjs --json --receipt",
      "model:inventory": "node ./scripts/v4/orangebox-model-inventory-report.mjs --json --receipt",
      "obox2:pack": "node ./scripts/v4/obox2-internal-setup-pack.mjs --json --receipt",
      "obox2:doctor": "node ./scripts/v4/obox2-package-doctor.mjs --json --receipt",
      "soul:doctor": "node ./scripts/v4/soul-genome-doctor.mjs --json --receipt",
      "knowledge:improvements": "node ./scripts/v4/orangebox-knowledge-improvement-queue.mjs --json --receipt",
      "research:scout": "node ./scripts/v4/orangebox-external-research-scout.mjs --json --receipt",
      "research:radar": "node ./scripts/v4/orangebox-research-radar.mjs --json --receipt",
      "assurance:doctor": "node ./scripts/v4/orangebox-assurance-lab-doctor.mjs --json --receipt",
      "ipi:doctor": "node ./scripts/v4/indirect-prompt-injection-doctor.mjs --json --receipt",
      "memory:doctor": "node ./scripts/v4/memory-source-truth-doctor.mjs --json --receipt",
      "harness:benchmark": "node ./scripts/v4/orangebox-harness-benchmark-doctor.mjs --json --receipt",
      "tool:ergonomics": "node ./scripts/v4/orangebox-tool-ergonomics-doctor.mjs --json --receipt",
      "checkmate:doctor": "node ./scripts/v4/checkmate-eval-lane-doctor.mjs --json --receipt",
      "signal:hygiene": "node ./scripts/v4/orangebox-operator-signal-hygiene-doctor.mjs --json --receipt",
      "session:spine": "node ./scripts/v4/orangebox-doer-watcher-session-spine-doctor.mjs --json --receipt",
      "feature:proof": "node ./scripts/v4/orangebox-feature-acceptance-matrix-doctor.mjs --json --receipt",
      "openclaw:retire": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/v4/retire-openclaw-startup.ps1 -Apply -StopProcesses -Popup",
      "openclaw:retire:dry": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/v4/retire-openclaw-startup.ps1",
      "primer:sync": "node ./scripts/v4/orangebox-primer-skill-sync.mjs --json --receipt",
      "codexa:rail-pack": "node ./scripts/v4/codexa-rail-recovery-pack.mjs --json --receipt",
      "codexa:alert": "node ./scripts/v4/orangebox-codexa-alert-doctor.mjs --json --receipt",
      "codexa:alert:popup": "node ./scripts/v4/orangebox-codexa-alert-doctor.mjs --json --receipt --popup",
      "codexa:smb-stage": "node ./scripts/v4/codexa-smb-stage-doctor.mjs --json --receipt",
      "codexa:handoff": "node ./scripts/v4/orangebox-codexa-handoff-doctor.mjs --json --receipt",
      "mcp:doctor": "node ./scripts/v4/mcp-doctor.mjs --json --receipt",
      "action:doctor": "node ./scripts/v4/action-classifier-doctor.mjs --json --receipt",
      "health:report": "node ./scripts/v4/orangebox-health-report.mjs --json --receipt",
      "project:report": "node ./scripts/v4/orangebox-project-report.mjs --json --receipt",
      "skills:lifecycle": "node ./scripts/v4/orangebox-skill-lifecycle-doctor.mjs --json --receipt",
      "chatbackup:install": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/v4/install-chat-mirror-task.ps1",
      "chatbackup:status": "node ./scripts/v4/chatbackup-status.mjs --json --receipt",
      "chatbackup:restore": "node ./scripts/v4/chatbackup-restore-packet.mjs --json --receipt",
      "ops:services": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/v4/orangebox-ops-service-manager.ps1",
      "reality:watch": "node ./scripts/v4/orangebox-reality-watch.mjs --json --receipt",
      "reality:watcher:install": "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ./scripts/v4/install-reality-watcher.ps1",
      "ops:readiness": "node ./scripts/v4/orangebox-ops-readiness-doctor.mjs --json --receipt",
      "ops:green": "node ./scripts/v4/orangebox-local-ops-green.mjs --json --receipt",
      "ops:green:deep": "node ./scripts/v4/orangebox-local-ops-green.mjs --deep --json --receipt",
      "ops:gaps": "node ./scripts/v4/orangebox-ops-gap-ledger.mjs --json --receipt",
      "install:doctor": "node ./scripts/obx.mjs install doctor --json --receipt",
      "package-script-doctor": "node ./scripts/v4/package-script-doctor.mjs --json --receipt",
      "pack:portable": "node ./scripts/v4/orangebox-delta-final-packager.mjs --json --receipt",
      "final:package": "node ./scripts/v4/orangebox-delta-final-packager.mjs --json --receipt",
      "final:verify": "node ./scripts/v4/orangebox-delta-final-packager.mjs --json --receipt --verify-install",
      "final:zip": "node ./scripts/v4/orangebox-final-download-zip.mjs --json --receipt"
    },
    engines: sourcePkg.engines || undefined,
  };
}

async function writeFinalFiles() {
  await fsp.writeFile(path.join(finalRoot, "package.json"), `${JSON.stringify(backendPackageJson(), null, 2)}\n`, "utf8");
  await fsp.writeFile(path.join(finalRoot, "README-FIRST.md"), `# Orangebox Version 1

This is the backend and operations final package.

Local folder name: Orangebox Delta Final
Public-facing name: Orangebox Version 1

## First touch

Run:

\`\`\`powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\\INSTALL_ORANGEBOX_DELTA_FINAL.ps1
\`\`\`

The installer proves the backend path without requiring the visual/frontend lane.

## Backend proof

\`\`\`powershell
npm install
npm run backend:install
npm run backend:proof
npm run install:doctor
\`\`\`

Basic Install is the default. Advanced AI Box is optional.
`, "utf8");

  await fsp.writeFile(path.join(finalRoot, "INSTALL_ORANGEBOX_DELTA_FINAL.ps1"), `param(
  [switch]$SkipPause
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $root

function Write-Orange($Text) { Write-Host $Text -ForegroundColor DarkYellow }
function Write-Green($Text) { Write-Host $Text -ForegroundColor Green }
function Write-Muted($Text) { Write-Host $Text -ForegroundColor DarkGray }
function Run-Step($Label, $Arguments) {
  Write-Orange $Label
  & npm.cmd @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Orangebox Version 1 installer failed at $Label (exit $LASTEXITCODE): npm.cmd $($Arguments -join ' ')"
  }
}

Write-Orange "============================================================"
Write-Orange "  ORANGEBOX VERSION 1"
Write-Orange "  Orangebox Delta Final backend installer"
Write-Orange "============================================================"
Write-Muted  "Basic Install is default. Advanced AI Box is optional."
Write-Muted  "No frontend build is required for this backend install."

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw "Node.js is required before installing Orangebox Version 1." }
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw "npm.cmd is required before installing Orangebox Version 1." }

Run-Step "[1/4] Installing package dependencies" @("install")
Run-Step "[2/4] Installing and proving backend launchers" @("run", "backend:install")
Run-Step "[3/4] Checking package script references" @("run", "package-script-doctor")
Run-Step "[4/4] Proving install clarity" @("run", "install:doctor")

Write-Green "ORANGEBOX VERSION 1 INSTALL GREEN"
Write-Muted  "Run backend: npm run backend:start"
Write-Muted  "Run API:     npm run backend:api"
Write-Muted  "Proof again: npm run backend:proof"

if (-not $SkipPause) {
  Write-Host ""
  Read-Host "Press Enter to close"
}
`, "utf8");

  await fsp.writeFile(path.join(finalRoot, "RUN_BACKEND.ps1"), `Set-Location -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)
npm.cmd run backend:start
`, "utf8");
  await fsp.writeFile(path.join(finalRoot, "RUN_API.ps1"), `Set-Location -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)
npm.cmd run backend:api
`, "utf8");
  await fsp.writeFile(path.join(finalRoot, "RUN_BACKEND_PROOF.ps1"), `Set-Location -LiteralPath (Split-Path -Parent $MyInvocation.MyCommand.Path)
npm.cmd run backend:proof
`, "utf8");
}

async function countFiles(dir) {
  let count = 0;
  let bytes = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = await fsp.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(full);
      }
      else if (entry.isFile()) {
        if (SKIP_FILES.has(entry.name)) continue;
        count += 1;
        bytes += (await fsp.stat(full)).size;
      }
    }
  }
  return { count, bytes };
}

async function gitMetadata() {
  async function git(args) {
    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: repoRoot,
        timeout: 15_000,
        maxBuffer: 256_000,
        windowsHide: true,
      });
      return String(stdout || "").trim() || null;
    } catch {
      return null;
    }
  }
  const source_commit = await git(["rev-parse", "HEAD"]);
  const source_branch = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const source_remote = await git(["remote", "get-url", "origin"]);
  const status = await git(["status", "--porcelain"]);
  return {
    source_root: repoRoot,
    source_commit,
    source_branch,
    source_remote,
    source_dirty: Boolean(status),
  };
}

async function runVerification() {
  const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
  const steps = [];
  for (const step of [
    ["npm-install", npmBin, ["install"], { timeout: 900_000 }],
    ["backend-install", npmBin, ["run", "backend:install"], { timeout: 900_000 }],
    ["package-script-doctor", npmBin, ["run", "package-script-doctor"], { timeout: 120_000 }],
    ["install-doctor", npmBin, ["run", "install:doctor"], { timeout: 600_000 }],
  ]) {
    const result = await runStep(step[0], step[1], step[2], step[3]);
    steps.push(result);
    if (!result.ok) break;
  }
  return {
    ok: steps.every((step) => step.ok),
    steps,
  };
}

async function main() {
  assertFinalPathSafe();
  await fsp.mkdir(finalsRoot, { recursive: true });
  const stopped_runtime_holders = verifyInstall ? await stopFinalRuntimeHolders() : null;
  const rotation = await rotateExistingFinal();
  await copyTree();
  await writeFinalFiles();
  const packageStats = await countFiles(finalRoot);
  const source = await gitMetadata();
  const verification = verifyInstall ? await runVerification() : null;
  const manifest = {
    ok: verification ? verification.ok : true,
    version: "orangebox-delta-final-packager/v1",
    public_name: "Orangebox Version 1",
    package_name: "Orangebox Delta Final",
    final_root: finalRoot,
    ...source,
    created_at: new Date().toISOString(),
    previous_final_backup: rotation?.backup_path || null,
    in_place_refresh: Boolean(rotation?.in_place_refresh),
    packaging_warning: rotation?.warning || null,
    frontend_included: false,
    frontend_required_for_backend: false,
    package_stats: packageStats,
    stopped_runtime_holders,
    entry_hashes: {
      install_script: sha256File(path.join(finalRoot, "INSTALL_ORANGEBOX_DELTA_FINAL.ps1")),
      package_json: sha256File(path.join(finalRoot, "package.json")),
      start_here: sha256File(path.join(finalRoot, "0-START-HERE.txt")),
      install_first: sha256File(path.join(finalRoot, "INSTALL-FIRST.txt")),
    },
    verification,
    status: verification ? (verification.ok ? "ORANGEBOX_DELTA_FINAL_VERIFIED_GREEN" : "ORANGEBOX_DELTA_FINAL_VERIFY_FAILED") : "ORANGEBOX_DELTA_FINAL_PACKAGED",
  };
  const manifestPath = path.join(finalRoot, "orangebox-delta-final-manifest.json");
  manifest.manifest_path = manifestPath;
  if (receipt) {
    await fsp.mkdir(receiptsDir, { recursive: true });
    const receiptPath = path.join(receiptsDir, `orangebox-delta-final-package-${stamp()}.json`);
    manifest.receipt_path = receiptPath;
    await fsp.writeFile(receiptPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  await fsp.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(json ? JSON.stringify(manifest, null, 2) : manifest.status);
  if (!manifest.ok) process.exit(1);
}

main().catch((error) => {
  const out = {
    ok: false,
    version: "orangebox-delta-final-packager/v1",
    status: "ORANGEBOX_DELTA_FINAL_PACKAGE_FAILED",
    error: error?.message || String(error),
    final_root: finalRoot,
  };
  console.log(json ? JSON.stringify(out, null, 2) : `${out.status}: ${out.error}`);
  process.exit(1);
});
