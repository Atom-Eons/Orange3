#!/usr/bin/env node
import childProcess from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");

const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(file) {
  return fs.existsSync(file);
}

function run(command, argsList, options = {}) {
  try {
    const stdout = childProcess.execFileSync(command, argsList, {
      cwd: options.cwd || repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs || 8000,
    });
    return { ok: true, stdout: stdout.trim() };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout?.toString?.().trim?.() || "",
      stderr: error.stderr?.toString?.().trim?.() || error.message,
    };
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function latestReceipt(prefix) {
  if (!exists(receiptDir)) return null;
  const files = fs
    .readdirSync(receiptDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(prefix) && entry.name.endsWith(".json"))
    .map((entry) => {
      const full = path.join(receiptDir, entry.name);
      return { full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files[0]?.full || null;
}

function main() {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const pkg = readJson(packageJsonPath);
  const githubOwnerRepo =
    process.env.ORANGEBOX_GITHUB_REPO ||
    pkg?.homepage?.match(/github\.com\/([^/]+\/[^/#?]+)/)?.[1]?.replace(/\.git$/i, "") ||
    "AtomEons/orangebox-delta";
  const gitRemote = run("git", ["remote", "get-url", "origin"]);
  const gitBranch = run("git", ["branch", "--show-current"]);
  const gitSha = run("git", ["rev-parse", "HEAD"]);
  const gitStatus = run("git", ["status", "--short", "--untracked-files=no"]);
  const ghRepo = run("gh", ["repo", "view", githubOwnerRepo, "--json", "nameWithOwner,isPrivate,visibility,url,defaultBranchRef"]);
  let gh = null;
  try {
    gh = ghRepo.ok ? JSON.parse(ghRepo.stdout) : null;
  } catch {
    gh = null;
  }

  const startupDir = path.join(userRoot, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const chatBackupStartup = path.join(startupDir, "Orangebox ChatBackup Listener.lnk");
  const checks = {
    repo_root_exists: { ok: exists(repoRoot), path: repoRoot },
    package_private: { ok: pkg?.private === true, path: packageJsonPath },
    full_green_includes_control: {
      ok: Boolean(pkg?.scripts?.["system:full-green"]) && !pkg.scripts["system:full-green"].includes("--skip-control"),
      script: pkg?.scripts?.["system:full-green"] || null,
    },
    github_remote: { ok: gitRemote.ok && gitRemote.stdout.toLowerCase().includes(githubOwnerRepo.toLowerCase()), remote: gitRemote.stdout },
    github_private: { ok: gh?.isPrivate === true && gh?.visibility === "PRIVATE", repo: gh },
    chatbackup_startup: { ok: exists(chatBackupStartup), path: chatBackupStartup },
    primer_skill_codex: { ok: exists(path.join(userRoot, ".codex", "skills", "orangebox-primer", "SKILL.md")) },
    primer_skill_claude: { ok: exists(path.join(userRoot, ".claude", "skills", "orangebox-primer", "SKILL.md")) },
    primer_skill_antigravity: {
      ok: exists(path.join(userRoot, ".gemini", "config", "plugins", "orangebox-plugin", "skills", "orangebox-primer", "SKILL.md")),
    },
  };
  const ok = Object.values(checks).every((check) => check.ok);
  const sourceOfTruth = {
    ok,
    version: "orangebox-source-of-truth/v0",
    status: ok ? "ORANGEBOX_RESTART_LOCK_GREEN" : "ORANGEBOX_RESTART_LOCK_NOT_GREEN",
    written_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    github: {
      owner_repo: githubOwnerRepo,
      private: gh?.isPrivate === true,
      visibility: gh?.visibility || null,
      url: gh?.url || `https://github.com/${githubOwnerRepo}`,
      default_branch: gh?.defaultBranchRef?.name || "main",
      active_branch: gitBranch.stdout || null,
      head_sha: gitSha.stdout || null,
      remote: gitRemote.stdout || null,
    },
    restart_rule:
      `After restart, use ${repoRoot} as the active Orangebox Ops backend source. Run ops:readiness, reality:watch, and system:full-green before claiming live status.`,
    active_lane: "Orangebox Operations backend",
    no_touch_lane:
      "This Ops chat does not mutate the separate living visual dashboard, website, shop, or media/product lanes unless the operator explicitly opens that lane.",
    scripts: {
      ops_readiness: "npm.cmd run ops:readiness",
      reality_watch: "npm.cmd run reality:watch",
      full_green: "npm.cmd run system:full-green",
      primer_sync: "npm.cmd run primer:sync",
      mid_session_primer: "npm.cmd run primer:mid -- --name \"Project Name\"",
      codexa_sync: "npm.cmd run codexa:sync-config",
    },
    latest_receipts: {
      full_green: latestReceipt("orangebox-gauntlet-orangebox-full-green-"),
      ops_readiness: latestReceipt("orangebox-ops-readiness-"),
      reality_watch: latestReceipt("orangebox-reality-watch-"),
      primer_sync: latestReceipt("orangebox-primer-skill-sync-"),
      mid_session_primer: latestReceipt("orangebox-mid-session-primer-"),
      codexa_sync: latestReceipt("orangebox-codexa-config-sync-"),
    },
    checks,
    dirty_modified_files: gitStatus.stdout ? gitStatus.stdout.split(/\r?\n/).filter(Boolean) : [],
  };

  const restartRoot = path.join(dataRoot, "restart");
  ensureDir(restartRoot);
  const sourcePath = path.join(dataRoot, "orangebox-source-of-truth.json");
  const restartPath = path.join(restartRoot, "latest-restart-lock.json");
  fs.writeFileSync(sourcePath, `${JSON.stringify(sourceOfTruth, null, 2)}\n`, "utf8");
  fs.writeFileSync(restartPath, `${JSON.stringify(sourceOfTruth, null, 2)}\n`, "utf8");

  const result = {
    ...sourceOfTruth,
    source_of_truth_path: sourcePath,
    restart_lock_path: restartPath,
  };
  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-restart-lock-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  console.log(json ? JSON.stringify(result, null, 2) : result.status);
  if (!ok) process.exitCode = 1;
}

main();
