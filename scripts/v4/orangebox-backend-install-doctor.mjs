#!/usr/bin/env node
import { spawn, execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const json = args.has("--json");
const receipt = args.has("--receipt");
const install = args.has("--install");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const backendInstallRoot = path.join(dataRoot, "backend-install");
const toolBin = process.env.ORANGEBOX_TOOL_BIN || "C:\\AtomEons\\tools\\bin";
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const nodeBin = process.execPath;

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function exists(file) {
  return fs.existsSync(file);
}

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function redactedOutput(text) {
  return String(text || "")
    .replace(/(DATABASE_URL=)[^\s]+/gi, "$1[redacted]")
    .replace(/(TOKEN|KEY|SECRET|PASSWORD)=([^\s]+)/gi, "$1=[redacted]")
    .slice(-5000);
}

async function runStep(name, command, commandArgs, options = {}) {
  const started = Date.now();
  const cwd = options.cwd || repoRoot;
  const execCommand = process.platform === "win32" && command.toLowerCase().endsWith(".cmd") ? "cmd.exe" : command;
  const execArgs = execCommand === "cmd.exe" ? ["/d", "/c", command, ...commandArgs] : commandArgs;
  try {
    const { stdout, stderr } = await execFileAsync(execCommand, execArgs, {
      cwd,
      env: { ...process.env, ...options.env },
      timeout: options.timeout || 180_000,
      maxBuffer: options.maxBuffer || 20_000_000,
      windowsHide: true,
    });
    return {
      name,
      ok: true,
      command: [command, ...commandArgs].join(" "),
      cwd,
      duration_ms: Date.now() - started,
      stdout_tail: redactedOutput(stdout),
      stderr_tail: redactedOutput(stderr),
    };
  } catch (error) {
    return {
      name,
      ok: false,
      command: [command, ...commandArgs].join(" "),
      cwd,
      duration_ms: Date.now() - started,
      exit_code: error.code ?? null,
      stdout_tail: redactedOutput(error.stdout),
      stderr_tail: redactedOutput(error.stderr || error.message),
    };
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function fetchJson(url, timeoutMs = 12_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return {
      ok: response.ok,
      status_code: response.status,
      url,
      body_preview: text.slice(0, 600),
      json: parsed,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForUrl(url, timeoutMs = 90_000) {
  const started = Date.now();
  let latest = null;
  while (Date.now() - started < timeoutMs) {
    try {
      latest = await fetchJson(url, 6000);
      if (latest.ok) return latest;
    } catch (error) {
      latest = { ok: false, url, error: error.message };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timed out waiting for ${url}: ${JSON.stringify(latest)}`);
}

function spawnServer(name, command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, {
    cwd: options.cwd || repoRoot,
    env: { ...process.env, ...options.env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const log = [];
  child.stdout.on("data", (chunk) => log.push({ stream: "stdout", text: redactedOutput(chunk.toString()) }));
  child.stderr.on("data", (chunk) => log.push({ stream: "stderr", text: redactedOutput(chunk.toString()) }));
  return { name, child, log };
}

function psLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function stopServer(server) {
  if (!server?.child || server.child.killed) return;
  server.child.kill();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (!server.child.killed) {
    try { server.child.kill("SIGKILL"); } catch {}
  }
}

function scriptTextBackend() {
  return `param(
  [int]$Port = 8787,
  [string]$HostName = "127.0.0.1"
)
$ErrorActionPreference = "Stop"
$repo = ${psLiteral(repoRoot)}
Set-Location -LiteralPath $repo
$env:ORANGEBOX_REPO_ROOT = $repo
if (-not $env:ORANGEBOX_DATA_ROOT) { $env:ORANGEBOX_DATA_ROOT = Join-Path $env:USERPROFILE "OrangeBox-Data" }
node .\\scripts\\orangebox-command-server.mjs --host $HostName --port $Port
`;
}

function scriptTextApi() {
  return `param(
  [int]$Port = 8797
)
$ErrorActionPreference = "Stop"
$repo = ${psLiteral(repoRoot)}
Set-Location -LiteralPath (Join-Path $repo "apps\\api")
$env:API_PORT = [string]$Port
if (-not $env:NODE_ENV) { $env:NODE_ENV = "development" }
if (-not $env:WEB_ORIGIN) { $env:WEB_ORIGIN = "http://127.0.0.1:8787" }
node .\\dist\\server.js
`;
}

function scriptTextProof() {
  return `$ErrorActionPreference = "Stop"
$repo = ${psLiteral(repoRoot)}
Set-Location -LiteralPath $repo
npm.cmd run backend:proof
`;
}

async function installLaunchers(result) {
  await fsp.mkdir(toolBin, { recursive: true });
  const files = [
    [path.join(toolBin, "orangebox-delta-backend.ps1"), scriptTextBackend()],
    [path.join(toolBin, "orangebox-delta-api.ps1"), scriptTextApi()],
    [path.join(toolBin, "orangebox-delta-backend-proof.ps1"), scriptTextProof()],
  ];
  for (const [file, text] of files) {
    await fsp.writeFile(file, text, "utf8");
  }

  const config = {
    version: "orangebox-delta-backend-install/v1",
    status: "INSTALLED",
    repo_root: repoRoot,
    data_root: dataRoot,
    tool_bin: toolBin,
    launchers: files.map(([file, text]) => ({ file, sha256: sha256(text) })),
    frontend_required_for_backend: false,
    backend_commands: {
      command_server: "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\AtomEons\\tools\\bin\\orangebox-delta-backend.ps1",
      api_server: "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\AtomEons\\tools\\bin\\orangebox-delta-api.ps1",
      proof: "powershell -NoProfile -ExecutionPolicy Bypass -File C:\\AtomEons\\tools\\bin\\orangebox-delta-backend-proof.ps1",
    },
    installed_at: new Date().toISOString(),
  };
  const configPath = path.join(backendInstallRoot, "backend-runtime.json");
  await writeJson(configPath, config);
  result.install = { ok: true, config_path: configPath, launchers: config.launchers };
}

async function smokeServers(result) {
  const commandPort = await freePort();
  const tunnelPort = await freePort();
  const apiPort = await freePort();
  const servers = [];
  try {
    const commandServer = spawnServer("orangebox-command-server", nodeBin, [
      "scripts/orangebox-command-server.mjs",
      "--host", "127.0.0.1",
      "--port", String(commandPort),
      "--no-start-receipt",
    ], {
      env: {
        ORANGEBOX_NO_START_RECEIPT: "1",
        ORANGEBOX_TUNNEL_PORT: String(tunnelPort),
        ORANGEBOX_DATA_ROOT: dataRoot,
      },
    });
    servers.push(commandServer);

    const apiServer = spawnServer("ae-see-suite-api", nodeBin, ["dist/server.js"], {
      cwd: path.join(repoRoot, "apps", "api"),
      env: {
        NODE_ENV: "test",
        API_PORT: String(apiPort),
        WEB_ORIGIN: `http://127.0.0.1:${commandPort}`,
        MODEL_PROVIDER: "mock",
      },
    });
    servers.push(apiServer);

    const commandStatus = await waitForUrl(`http://127.0.0.1:${commandPort}/api/status?fast=1`);
    const realtimeHealth = await waitForUrl(`http://127.0.0.1:${commandPort}/api/realtime/health`);
    const apiHealth = await waitForUrl(`http://127.0.0.1:${apiPort}/api/health`);

    result.server_smoke = {
      ok: true,
      command_port: commandPort,
      tunnel_port: tunnelPort,
      api_port: apiPort,
      probes: [commandStatus, realtimeHealth, apiHealth].map((probe) => ({
        ok: probe.ok,
        status_code: probe.status_code,
        url: probe.url,
        status: probe.json?.status || null,
        service: probe.json?.service || null,
      })),
      note: "Only backend/API endpoints were probed. No frontend route or web build was required.",
    };
  } catch (error) {
    result.server_smoke = {
      ok: false,
      error: error.message,
      logs: servers.map((server) => ({ name: server.name, log: server.log.slice(-12) })),
    };
  } finally {
    await Promise.all(servers.map(stopServer));
  }
}

async function main() {
  const startedAt = new Date();
  const packageJson = JSON.parse(await fsp.readFile(path.join(repoRoot, "package.json"), "utf8"));
  const backendScripts = {
    primer_sync: packageJson.scripts?.["primer:sync"],
    chatbackup_install: packageJson.scripts?.["chatbackup:install"],
    reality_watcher_install: packageJson.scripts?.["reality:watcher:install"],
    ops_services: packageJson.scripts?.["ops:services"],
    check: packageJson.scripts?.check,
    build_api: packageJson.scripts?.["build:api"],
    test_api: packageJson.scripts?.["test:api"],
    atomsmasher_api_smoke: packageJson.scripts?.["atomsmasher:api-smoke"],
    atomsmasher_doctor: packageJson.scripts?.["atomsmasher:doctor"],
    strongarm_doctor: packageJson.scripts?.["strongarm:doctor"],
    gremlin_doctor: packageJson.scripts?.["gremlin:doctor"],
    trilane_doctor: packageJson.scripts?.["trilane:doctor"],
    soul_doctor: packageJson.scripts?.["soul:doctor"],
    knowledge_improvements: packageJson.scripts?.["knowledge:improvements"],
    research_scout: packageJson.scripts?.["research:scout"],
    harness_benchmark: packageJson.scripts?.["harness:benchmark"],
    codexa_alert: packageJson.scripts?.["codexa:alert"],
    codexa_smb_stage: packageJson.scripts?.["codexa:smb-stage"],
    mcp_doctor: packageJson.scripts?.["mcp:doctor"],
    action_doctor: packageJson.scripts?.["action:doctor"],
    skills_lifecycle: packageJson.scripts?.["skills:lifecycle"],
    ops_readiness: packageJson.scripts?.["ops:readiness"],
  };
  const backendScriptText = Object.values(backendScripts).join("\n");
  const visualLeak = /\b(build:web|frontend:proof|@ae-see-suite\/web|frontend\/scripts)\b/.test(backendScriptText);

  const result = {
    ok: false,
    version: "orangebox-delta-backend-install-doctor/v1",
    status: "RUNNING",
    repo_root: repoRoot,
    data_root: dataRoot,
    started_at: startedAt.toISOString(),
    frontend_required_for_backend: false,
    backend_scripts: backendScripts,
    checks: {
      frontend_dependency_leak: {
        ok: !visualLeak,
        detail: visualLeak ? "Backend-only script set references frontend/web proof." : "Backend-only script set has no frontend/web build dependency.",
      },
      required_paths: {
        ok: exists(path.join(repoRoot, "apps", "api", "package.json"))
          && exists(path.join(repoRoot, "scripts", "orangebox-command-server.mjs"))
          && exists(path.join(repoRoot, "scripts", "v4", "orangebox-ops-readiness-doctor.mjs")),
      },
    },
    commands: [],
    install: null,
    server_smoke: null,
    completed_at: null,
    receipt_path: null,
  };

  if (install) {
    await installLaunchers(result);
    const primerSync = await runStep("primer:sync", npmBin, ["run", "primer:sync"], { timeout: 180_000 });
    result.commands.push(primerSync);
    if (primerSync.ok) {
      const chatbackupInstall = await runStep("chatbackup:install", npmBin, ["run", "chatbackup:install"], { timeout: 180_000 });
      result.commands.push(chatbackupInstall);
    }
    if (result.commands.every((step) => step.ok)) {
      const realityWatcherInstall = await runStep("reality:watcher:install", npmBin, ["run", "reality:watcher:install"], { timeout: 180_000 });
      result.commands.push(realityWatcherInstall);
    }
  }

  const commandPlan = [
    ["check", npmBin, ["run", "check"], { timeout: 180_000 }],
    ["build:api", npmBin, ["run", "build:api"], { timeout: 240_000 }],
    ["test:api", npmBin, ["run", "test:api"], { timeout: 240_000 }],
    ["atomsmasher:api-smoke", npmBin, ["run", "atomsmasher:api-smoke"], { timeout: 240_000 }],
    ["atomsmasher:doctor", npmBin, ["run", "atomsmasher:doctor"], { timeout: 240_000 }],
    ["strongarm:doctor", npmBin, ["run", "strongarm:doctor"], { timeout: 180_000 }],
    ["gremlin:doctor", npmBin, ["run", "gremlin:doctor"], { timeout: 240_000 }],
    ["trilane:doctor", npmBin, ["run", "trilane:doctor"], { timeout: 120_000 }],
    ["soul:doctor", npmBin, ["run", "soul:doctor"], { timeout: 120_000 }],
    ["knowledge:improvements", npmBin, ["run", "knowledge:improvements"], { timeout: 120_000 }],
    ["codexa:alert", npmBin, ["run", "codexa:alert"], { timeout: 60_000 }],
    ["codexa:smb-stage", npmBin, ["run", "codexa:smb-stage"], { timeout: 60_000 }],
    ["mcp:doctor", npmBin, ["run", "mcp:doctor"], { timeout: 120_000 }],
    ["action:doctor", npmBin, ["run", "action:doctor"], { timeout: 60_000 }],
    ["skills:lifecycle", npmBin, ["run", "skills:lifecycle"], { timeout: 60_000 }],
    ["harness:benchmark", npmBin, ["run", "harness:benchmark"], { timeout: 60_000, env: { ORANGEBOX_BACKEND_PROOF_IN_PROGRESS: "1" } }],
  ];

  for (const [name, command, commandArgs, options] of commandPlan) {
    const step = await runStep(name, command, commandArgs, options);
    result.commands.push(step);
    if (!step.ok) break;
  }

  if (result.commands.every((step) => step.ok)) {
    await smokeServers(result);
  }

  if (result.commands.every((step) => step.ok) && result.server_smoke?.ok) {
    if (packageJson.scripts?.["ops:services"]) {
      const services = await runStep("ops:services", npmBin, ["run", "ops:services"], { timeout: 360_000 });
      result.commands.push(services);
    }
  }

  if (result.commands.every((step) => step.ok) && result.server_smoke?.ok) {
    const readiness = await runStep("ops:readiness", npmBin, ["run", "ops:readiness"], { timeout: 180_000 });
    result.commands.push(readiness);
  }

  const commandOk = result.commands.every((step) => step.ok);
  const checksOk = Object.values(result.checks).every((check) => check.ok);
  result.ok = commandOk && checksOk && result.server_smoke?.ok === true && (!install || result.install?.ok === true);
  result.status = result.ok ? "ORANGEBOX_DELTA_BACKEND_INSTALLED_GREEN" : "ORANGEBOX_DELTA_BACKEND_NOT_GREEN";
  result.completed_at = new Date().toISOString();

  await fsp.mkdir(backendInstallRoot, { recursive: true });
  await writeJson(path.join(backendInstallRoot, "latest-backend-install.json"), result);
  if (receipt) {
    const receiptPath = path.join(repoRoot, "receipts", `orangebox-backend-install-${stamp()}.json`);
    await writeJson(receiptPath, result);
    result.receipt_path = receiptPath;
    await writeJson(path.join(backendInstallRoot, "latest-backend-install.json"), result);
  }

  if (json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
