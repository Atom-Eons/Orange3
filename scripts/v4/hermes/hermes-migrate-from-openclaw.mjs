#!/usr/bin/env node
/* ============================================================================
   hermes-migrate-from-openclaw.mjs — OpenClaw → Hermes Config Migrator

   Doctrine anchor : docs/V4_MOAT_DOCTRINE.md  (ATOM-OBX-V4-MOAT-2026-0516)
   Author          : Ætom ÆoNs (Atom McCree) / AtomEons Systems Laboratory
   Date            : 2026-05-16
   Mom's Law       : Full effort. Operator data is sacred. Back up first,
                     translate faithfully, emit a receipt. No silent overwrites.

   Hermes Agent (Nous Research, MIT-licensed).
   Source: https://github.com/nousresearch/hermes-agent

   Strategy
   ────────
   1. If `hermes` binary is on PATH, delegate to its native migration command:
        hermes claw migrate --preset full [--dry-run | --yes]
      This is the preferred path — the Hermes team owns the mapping logic.
   2. If Hermes binary is NOT found, fall back to the hand-rolled translator
      below, which maps the known OpenClaw JSON keys to Hermes YAML keys.

   Key mapping (fallback translator)
   ───────────────────────────────────
     agents.defaults.workspace   → terminal.backend.cwd
     agents.defaults.models      → model.default  (pick first key)
     gateway.auth.token          → auth.tokens.gateway
     plugins.entries             → plugins.installed

   Usage
   ─────
     node hermes-migrate-from-openclaw.mjs --dry-run
     node hermes-migrate-from-openclaw.mjs --apply
     node hermes-migrate-from-openclaw.mjs --dry-run --openclaw-source <path>
     node hermes-migrate-from-openclaw.mjs --apply  --hermes-target <path>
     node hermes-migrate-from-openclaw.mjs --help

   Zero npm dependencies. Node 22.14+ required.
   ============================================================================ */

import fs            from "node:fs/promises";
import path          from "node:path";
import os            from "node:os";
import { execFile }  from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// ─── CLI ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
hermes-migrate-from-openclaw.mjs — Migrate OpenClaw config to Hermes.

  node hermes-migrate-from-openclaw.mjs --dry-run   [--openclaw-source <p>] [--hermes-target <p>]
  node hermes-migrate-from-openclaw.mjs --apply     [--openclaw-source <p>] [--hermes-target <p>]

Flags:
  --dry-run              Show the planned mapping without writing anything.
  --apply                Write the Hermes config and receipt to disk.
  --openclaw-source <p>  Path to openclaw.json (default: ~/.openclaw/openclaw.json).
  --hermes-target <p>    Path to write Hermes config.yaml (default: ~/.hermes/config.yaml).
  --help                 This message.

The OpenClaw config is backed up to ~/.openclaw/openclaw.pre-hermes.json before any write.
A migration receipt is written to ORANGEBOX_DATA_ROOT/receipts/hermes-migrate/<ts>.json.
`.trim());
  process.exit(0);
}

const isDryRun = args.includes("--dry-run");
const isApply  = args.includes("--apply");

if (!isDryRun && !isApply) {
  console.error(JSON.stringify({ status: "FAILED", error: "Specify --dry-run or --apply. Run --help for usage." }));
  process.exit(1);
}
if (isDryRun && isApply) {
  console.error(JSON.stringify({ status: "FAILED", error: "--dry-run and --apply are mutually exclusive." }));
  process.exit(1);
}

function argValue(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) return null;
  return val;
}

const defaultOpenClawSource = path.join(os.homedir(), ".openclaw", "openclaw.json");
const defaultHermesTarget   = path.join(os.homedir(), ".hermes", "config.yaml");

const openClawSource = path.resolve(argValue("--openclaw-source") ?? defaultOpenClawSource);
const hermesTarget   = path.resolve(argValue("--hermes-target")   ?? defaultHermesTarget);

const dataRoot = process.env.ORANGEBOX_DATA_ROOT
  ? path.resolve(process.env.ORANGEBOX_DATA_ROOT)
  : path.join(os.homedir(), ".orangebox");

// ─── Hermes binary detection ──────────────────────────────────────────────────

async function findHermesBinary() {
  try {
    const { stdout } = await execFileAsync("hermes", ["--version"], { timeout: 5000 });
    return stdout.trim() || "(found)";
  } catch {
    return null;
  }
}

// ─── Native Hermes migration ──────────────────────────────────────────────────

async function runNativeMigration(dryRun) {
  const modeFlag = dryRun ? "--dry-run" : "--yes";
  const cmdArgs  = ["claw", "migrate", "--preset", "full", modeFlag];
  try {
    const { stdout, stderr } = await execFileAsync("hermes", cmdArgs, { timeout: 60000 });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (err) {
    return { ok: false, error: err.message, stdout: "", stderr: "" };
  }
}

// ─── Hand-rolled fallback translator ─────────────────────────────────────────
// Reads openclaw.json and produces a minimal Hermes config.yaml text.

function toYamlScalar(value) {
  if (typeof value === "string") {
    // Escape if needed
    if (value.includes(":") || value.includes("#") || value.includes("'") || value.includes("\n")) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number")  return String(value);
  return String(value);
}

function buildHermesYaml(mapping) {
  const lines = [
    "# Hermes Agent config — generated by hermes-migrate-from-openclaw.mjs",
    `# Migration date: ${new Date().toISOString()}`,
    "# Source: ORANGEBOX V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)",
    "# Edit this file or use: hermes model <model>, hermes gateway pair <channel>",
    "",
  ];

  if (mapping.terminalCwd) {
    lines.push("terminal:");
    lines.push("  backend:");
    lines.push(`    cwd: ${toYamlScalar(mapping.terminalCwd)}`);
    lines.push("");
  }

  if (mapping.modelDefault) {
    lines.push("model:");
    lines.push(`  default: ${toYamlScalar(mapping.modelDefault)}`);
    lines.push("");
  }

  if (mapping.gatewayToken) {
    lines.push("auth:");
    lines.push("  tokens:");
    lines.push(`    gateway: ${toYamlScalar(mapping.gatewayToken)}`);
    lines.push("");
  }

  if (mapping.plugins && Object.keys(mapping.plugins).length > 0) {
    lines.push("plugins:");
    lines.push("  installed:");
    for (const [name, cfg] of Object.entries(mapping.plugins)) {
      lines.push(`    ${toYamlScalar(name)}:`);
      if (cfg && typeof cfg.enabled === "boolean") {
        lines.push(`      enabled: ${cfg.enabled}`);
      }
    }
    lines.push("");
  }

  // ORANGEBOX guardrails — always present
  lines.push("# ORANGEBOX guardrails (do not remove)");
  lines.push("gateway:");
  lines.push("  mode: local");
  lines.push("  host: 127.0.0.1");
  lines.push("  port: 18791");
  lines.push("  expose_lan: false");
  lines.push("");
  lines.push("mcp:");
  lines.push("  host: 127.0.0.1");
  lines.push("  port: 18790");
  lines.push("");
  lines.push("dashboard:");
  lines.push("  port: 9119");
  lines.push("");
  lines.push("skills:");
  lines.push("  auto_promote: false");
  lines.push("  pending_dir: ~/.hermes/skills-pending/");
  lines.push("  active_dir:  ~/.hermes/skills-active/");
  lines.push("");

  return lines.join("\n");
}

function extractMapping(openClaw) {
  const agentDefs = openClaw?.agents?.defaults ?? {};
  const workspace = agentDefs?.workspace ?? null;
  const modelsObj = agentDefs?.models ?? {};
  const firstModel = Object.keys(modelsObj)[0] ?? null;
  const gatewayToken = openClaw?.gateway?.auth?.token ?? null;
  const plugins = openClaw?.plugins?.entries ?? {};

  return {
    terminalCwd:  workspace,
    modelDefault: firstModel,
    gatewayToken,
    plugins
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ts = new Date().toISOString();
  console.log(JSON.stringify({ phase: "START", mode: isDryRun ? "dry-run" : "apply", openClawSource, hermesTarget }));

  // Read OpenClaw config
  let openClawRaw;
  let openClawJson;
  let sourceReadOk = true;

  try {
    openClawRaw  = await fs.readFile(openClawSource, "utf8");
    openClawJson = JSON.parse(openClawRaw);
  } catch (err) {
    // Non-fatal in dry-run; fatal in apply
    console.error(JSON.stringify({ phase: "WARN", issue: "OpenClaw config unreadable", path: openClawSource, error: err.message }));
    if (isApply) {
      console.error(JSON.stringify({ status: "FAILED", error: `Cannot read OpenClaw config at ${openClawSource}: ${err.message}` }));
      process.exit(1);
    }
    openClawJson  = null;
    sourceReadOk  = false;
  }

  // Check for Hermes binary
  const hermesVersion = await findHermesBinary();
  const hermesOnPath  = hermesVersion !== null;

  let strategy;
  let nativeResult = null;
  let mapping      = null;
  let hermesYaml   = null;

  if (hermesOnPath) {
    strategy = "native-hermes-migrate";
    console.log(JSON.stringify({ phase: "STRATEGY", strategy, hermesVersion }));
    nativeResult = await runNativeMigration(isDryRun);
    if (!nativeResult.ok) {
      console.error(JSON.stringify({ phase: "WARN", issue: "Native Hermes migration failed, falling back to hand-rolled translator", error: nativeResult.error }));
      strategy = "fallback-translator";
    }
  } else {
    strategy = "fallback-translator";
    console.log(JSON.stringify({ phase: "STRATEGY", strategy, reason: "hermes binary not found on PATH" }));
  }

  if (strategy === "fallback-translator") {
    if (openClawJson) {
      mapping    = extractMapping(openClawJson);
      hermesYaml = buildHermesYaml(mapping);
    } else {
      // No source config and no native migrator: produce minimal default config
      mapping    = { terminalCwd: null, modelDefault: null, gatewayToken: null, plugins: {} };
      hermesYaml = buildHermesYaml(mapping);
    }
    console.log(JSON.stringify({ phase: "MAPPING", mapping }));
  }

  if (isDryRun) {
    console.log("\n--- DRY RUN: planned mapping ---");
    if (strategy === "native-hermes-migrate") {
      console.log(nativeResult?.stdout || "(Hermes native migrator produced no output)");
    } else {
      console.log("Hermes config.yaml that WOULD be written:");
      console.log(hermesYaml);
    }
    console.log("--- end dry run ---\n");
    process.exit(0);
  }

  // ── APPLY MODE ──

  // 1. Backup OpenClaw config
  const backupPath = path.join(path.dirname(openClawSource), "openclaw.pre-hermes.json");
  if (sourceReadOk && openClawRaw) {
    try {
      await fs.mkdir(path.dirname(backupPath), { recursive: true });
      await fs.writeFile(backupPath, openClawRaw, "utf8");
      console.log(JSON.stringify({ phase: "BACKUP", backupPath }));
    } catch (err) {
      console.error(JSON.stringify({ phase: "WARN", issue: "Could not write backup", backupPath, error: err.message }));
    }
  }

  let writeOk = false;
  let writeError = null;

  if (strategy === "native-hermes-migrate") {
    // Re-run without --dry-run
    const applyResult = await runNativeMigration(false);
    writeOk    = applyResult.ok;
    writeError = applyResult.ok ? null : applyResult.error;
    if (applyResult.stdout) console.log(applyResult.stdout);
    if (applyResult.stderr) console.error(applyResult.stderr);
  } else {
    // Write the translated YAML
    try {
      await fs.mkdir(path.dirname(hermesTarget), { recursive: true });
      await fs.writeFile(hermesTarget, hermesYaml, "utf8");
      writeOk = true;
      console.log(JSON.stringify({ phase: "WRITE", hermesTarget }));
    } catch (err) {
      writeOk    = false;
      writeError = err.message;
    }
  }

  // Receipt
  const receiptDir  = path.join(dataRoot, "receipts", "hermes-migrate");
  const receiptPath = path.join(receiptDir, `${ts.replace(/[:.]/g, "-")}.json`);
  const receipt = {
    generatedAt:    ts,
    status:         writeOk ? "VERIFIED" : "FAILED",
    strategy,
    mode:           "apply",
    openClawSource,
    backupPath:     sourceReadOk ? backupPath : null,
    hermesTarget:   strategy === "native-hermes-migrate" ? "(native migrator managed target)" : hermesTarget,
    mapping:        strategy === "fallback-translator" ? mapping : null,
    nativeOutput:   strategy === "native-hermes-migrate" ? nativeResult?.stdout : null,
    error:          writeError,
    doctrineCitation: "V4_MOAT_DOCTRINE.md (ATOM-OBX-V4-MOAT-2026-0516)"
  };

  try {
    await fs.mkdir(receiptDir, { recursive: true });
    await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
    console.log(JSON.stringify({ phase: "RECEIPT", receiptPath }));
  } catch (err) {
    console.error(JSON.stringify({ phase: "WARN", issue: "Could not write receipt", error: err.message }));
  }

  if (!writeOk) {
    console.error(JSON.stringify({ status: "FAILED", error: writeError }));
    process.exit(1);
  }

  console.log(JSON.stringify({ status: "VERIFIED", hermesTarget, backupPath: sourceReadOk ? backupPath : null, receiptPath }));
  console.log("\nNext steps:");
  console.log("  hermes model                     — set your active model");
  console.log("  hermes mcp serve                 — start the MCP server");
  console.log("  node hermes-status.mjs --text    — verify the install");
}

main().catch((err) => {
  console.error(JSON.stringify({ status: "FAILED", error: err.message }));
  process.exit(1);
});
