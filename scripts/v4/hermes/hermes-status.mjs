#!/usr/bin/env node
/* ============================================================================
   hermes-status.mjs — ORANGEBOX Hermes Agent Health Probe

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. This health check is real; every probe path
                     is exercised against a live socket or real binary. No
                     theater.

   Hermes Agent (Nous Research, MIT-licensed, free forever).
   Source: https://github.com/nousresearch/hermes-agent

   Usage
   ─────
     node hermes-status.mjs             — text output (default)
     node hermes-status.mjs --text      — explicit text mode
     node hermes-status.mjs --json      — machine-readable JSON, exit 0=VERIFIED
     node hermes-status.mjs --help      — this message

   Environment
   ───────────
     ORANGEBOX_CODEXA_IP   — if set, also probes Hermes on the remote
                             Codexa worker at that IP (same ports).
     HERMES_HOME           — override ~/.hermes/ root (default: ~/.hermes)
     ORANGEBOX_DATA_ROOT   — write receipt here (default: ~/.orangebox)

   Returns
   ───────
     {
       status          : "VERIFIED" | "DEGRADED" | "FAILED",
       version         : string | null,
       mcpReady        : bool,
       dashboardReady  : bool,
       gatewayHealth   : "UP" | "DOWN" | "SKIP",
       memoryEntries   : number,
       skillsCount     : number,
       configPath      : string,
       configExists    : bool,
       lastActivity    : string | null,
       probeTs         : string,
       remoteProbe     : object | null
     }

   Exit codes: 0 = VERIFIED, 1 = DEGRADED or FAILED.
   Zero npm dependencies. Node 22.14+ required.
   ============================================================================ */

import fs           from "node:fs/promises";
import fssync       from "node:fs";
import path         from "node:path";
import os           from "node:os";
import http         from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
hermes-status.mjs — Probe Hermes Agent health from ORANGEBOX.

  node hermes-status.mjs [--text | --json]

Flags:
  --text   Human-readable output (default).
  --json   JSON output. Exit 0 on VERIFIED, 1 on DEGRADED/FAILED.
  --help   This message.

Environment:
  ORANGEBOX_CODEXA_IP   Remote Codexa worker IP to also probe.
  HERMES_HOME           Override ~/.hermes/ directory.
  ORANGEBOX_DATA_ROOT   Directory for receipt write.
`.trim());
  process.exit(0);
}

const jsonMode = args.includes("--json");

// ─── Paths ────────────────────────────────────────────────────────────────────

const hermesHome = process.env.HERMES_HOME
  ? path.resolve(process.env.HERMES_HOME)
  : path.join(os.homedir(), ".hermes");

const configPath = path.join(hermesHome, "config.yaml");

const dataRoot = process.env.ORANGEBOX_DATA_ROOT
  ? path.resolve(process.env.ORANGEBOX_DATA_ROOT)
  : path.join(os.homedir(), ".orangebox");

// ─── HTTP probe ───────────────────────────────────────────────────────────────

function httpGet(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ ok: res.statusCode < 400, status: res.statusCode, body }));
    });
    req.on("error", () => resolve({ ok: false, status: null, body: "" }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, status: null, body: "" }); });
  });
}

// ─── Hermes binary version ────────────────────────────────────────────────────

async function getHermesVersion() {
  try {
    const { stdout } = await execFileAsync("hermes", ["--version"], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

// ─── Count directory entries ──────────────────────────────────────────────────

async function countDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return entries.length;
  } catch {
    return 0;
  }
}

// ─── Config existence ─────────────────────────────────────────────────────────

async function configExists() {
  try {
    await fs.access(configPath);
    return true;
  } catch {
    return false;
  }
}

// ─── Last activity from logs ──────────────────────────────────────────────────

async function getLastActivity() {
  const logsDir = path.join(hermesHome, "logs");
  try {
    const entries = await fs.readdir(logsDir);
    if (entries.length === 0) return null;
    // Get the most recently modified log file
    let latest = null;
    let latestMtime = 0;
    for (const entry of entries) {
      try {
        const stat = await fs.stat(path.join(logsDir, entry));
        if (stat.mtimeMs > latestMtime) {
          latestMtime = stat.mtimeMs;
          latest = stat.mtime.toISOString();
        }
      } catch { /* skip */ }
    }
    return latest;
  } catch {
    return null;
  }
}

// ─── Single-host probe ────────────────────────────────────────────────────────

async function probeHost(host) {
  const mcpUrl       = `http://${host}:18790/mcp/health`;
  const dashUrl      = `http://${host}:9119/`;
  const gatewayUrl   = `http://${host}:18791/health`;

  const [mcpRes, dashRes, gwRes] = await Promise.all([
    httpGet(mcpUrl),
    httpGet(dashUrl),
    httpGet(gatewayUrl)
  ]);

  return {
    mcpReady:      mcpRes.ok,
    dashboardReady: dashRes.ok,
    gatewayHealth: gwRes.ok ? "UP" : "DOWN"
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const probeTs = new Date().toISOString();

  // Parallel: binary version + local port probes + filesystem probes
  const [
    version,
    localPortProbe,
    cfgExists,
    memoryEntries,
    skillsActive,
    skillsPending,
    lastActivity
  ] = await Promise.all([
    getHermesVersion(),
    probeHost("127.0.0.1"),
    configExists(),
    countDir(path.join(hermesHome, "memories")),
    countDir(path.join(hermesHome, "skills-active")),
    countDir(path.join(hermesHome, "skills-pending")),
    getLastActivity()
  ]);

  const skillsCount = skillsActive + skillsPending;

  // Remote Codexa probe (optional)
  let remoteProbe = null;
  const codexaIp = process.env.ORANGEBOX_CODEXA_IP;
  if (codexaIp) {
    try {
      remoteProbe = await probeHost(codexaIp);
      remoteProbe.host = codexaIp;
    } catch (err) {
      remoteProbe = { host: codexaIp, error: err.message, mcpReady: false, dashboardReady: false, gatewayHealth: "DOWN" };
    }
  }

  // Determine composite status
  const coreOk = version !== null && localPortProbe.mcpReady;
  const degraded = (version !== null) !== localPortProbe.mcpReady; // binary found but MCP down (or vice versa)

  let status;
  if (coreOk) {
    status = "VERIFIED";
  } else if (version !== null || localPortProbe.mcpReady) {
    status = "DEGRADED";
  } else {
    status = "FAILED";
  }

  const result = {
    status,
    version,
    mcpReady:       localPortProbe.mcpReady,
    dashboardReady: localPortProbe.dashboardReady,
    gatewayHealth:  localPortProbe.gatewayHealth,
    memoryEntries,
    skillsCount,
    skillsActive,
    skillsPending,
    configPath,
    configExists:   cfgExists,
    lastActivity,
    probeTs,
    remoteProbe
  };

  // Write receipt
  try {
    const receiptDir = path.join(dataRoot, "receipts", "hermes-status");
    await fs.mkdir(receiptDir, { recursive: true });
    const receiptPath = path.join(receiptDir, `${probeTs.replace(/[:.]/g, "-")}.json`);
    await fs.writeFile(receiptPath, JSON.stringify(result, null, 2), "utf8");
  } catch { /* non-fatal */ }

  if (jsonMode) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Human-readable
    const icon = { VERIFIED: "VERIFIED", DEGRADED: "DEGRADED", FAILED: "FAILED" }[status];
    console.log(`\nHermes Agent Status — ${probeTs}`);
    console.log(`  Status          : ${icon}`);
    console.log(`  Version         : ${version ?? "(not found)"}`);
    console.log(`  MCP :18790      : ${result.mcpReady ? "UP" : "DOWN"}`);
    console.log(`  Dashboard :9119 : ${result.dashboardReady ? "UP" : "DOWN"}`);
    console.log(`  Gateway :18791  : ${result.gatewayHealth}`);
    console.log(`  Config          : ${cfgExists ? configPath : "(missing)"}`);
    console.log(`  Memory entries  : ${memoryEntries}`);
    console.log(`  Skills          : ${skillsActive} active, ${skillsPending} pending`);
    console.log(`  Last activity   : ${lastActivity ?? "(unknown)"}`);
    if (remoteProbe) {
      console.log(`  Remote Codexa   : MCP=${remoteProbe.mcpReady ? "UP" : "DOWN"} Dashboard=${remoteProbe.dashboardReady ? "UP" : "DOWN"}`);
    }
    console.log();
    if (status === "FAILED") {
      console.log("  NEXT STEPS:");
      if (!version) console.log("    - Hermes binary not found. Run: bash INSTALL_HERMES.sh");
      if (!localPortProbe.mcpReady) console.log("    - MCP not reachable. Run: hermes mcp serve");
    }
  }

  process.exit(status === "VERIFIED" ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "FAILED", error: err.message }));
  process.exit(1);
});
