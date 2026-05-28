#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const json = args.includes("--json");
const receipt = args.includes("--receipt");

const userRoot = process.env.USERPROFILE || "C:\\Users\\a";
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] || fallback : fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function exists(file) {
  return fs.existsSync(file);
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

function statusLine(label, value) {
  return `- ${label}: ${value || "unknown"}`;
}

function main() {
  const sourceName = argValue("--name", "Fresh Chat");
  const title = `${sourceName.replace(/\s+OB0X ON$/i, "").trim()} OB0X ON`;
  const primerRoot = path.join(dataRoot, "primers");
  const titleProtocolPath = path.join(primerRoot, "OB0X_ON_TITLE_PROTOCOL.json");
  const primerPath = path.join(primerRoot, "ORANGEBOX_MID_SESSION_PRIMER.md");
  const zeroMemoryPrimerPath = path.join(primerRoot, "ORANGEBOX_ZERO_MEMORY_CHAT_PRIMER.md");

  const fullGreenReceipt = latestReceipt("orangebox-gauntlet-orangebox-full-green-");
  const opsReceipt = latestReceipt("orangebox-ops-readiness-");
  const realityReceipt = latestReceipt("orangebox-reality-watch-");
  const sourceLockPath = path.join(dataRoot, "orangebox-source-of-truth.json");
  const restartLockPath = path.join(dataRoot, "restart", "latest-restart-lock.json");
  const codexaConfigPath = path.join(dataRoot, "codexa-sync", "latest-codexa-config.json");

  const fullGreen = readJson(path.join(dataRoot, "gauntlet", "latest-orangebox-full-green.json")) || readJson(fullGreenReceipt || "");
  const ops = readJson(opsReceipt || "");
  const reality = readJson(path.join(dataRoot, "watcher", "latest-reality-watch.json")) || readJson(realityReceipt || "");
  const sourceLock = readJson(sourceLockPath);
  const codexa = readJson(codexaConfigPath);

  const body = `# Orangebox Mid-Session Primer

Created: ${new Date().toISOString()}

Rename this chat/session to:

\`\`\`text
${title}
\`\`\`

If the host app cannot be renamed by tool, use the title above manually. The proof marker for a successfully primed chat is the literal suffix \`OB0X ON\`.

## Immediate System Check

Before coding or planning, the assistant must verify the local Orangebox lane:

\`\`\`powershell
cd ${repoRoot}
npm.cmd run ops:readiness
npm.cmd run reality:watch
npm.cmd run system:full-green
\`\`\`

If those commands are unavailable, read this file, the zero-memory primer, and the newest receipts named below. Do not invent live status from memory.

## Current Orangebox Identity

- Orangebox is a governed local-first software factory and operations system, not a single website, store, dashboard, or visual app.
- This chat lane is Orangebox Operations backend: primers, ChatBackup, watcher rails, Codexa/AI Box config, AECode contracts, gauntlets, receipts, control plane, model routing, compression, and module intake.
- Visual/frontend/product outputs are valid Orangebox products, but this specific Ops chat must not edit the separate living visual dashboard, website, shop, or media lanes.
- AECode is the middle voice for writing software-output contracts. It does not replace React, Flutter, Slint, ImGui, Wails/Tauri, docs, tests, screenshots, or deployment packages; those are output targets.
- AtomSmasher is the compression super-pack lane. It should be received, validated, and merged into Orangebox operations without rebuilding Orangebox from scratch.

## Operational Laws

- Evidence beats claims: receipts, probes, tests, heartbeats, and Git status are truth.
- Models are workers, not global controllers.
- Codex owns execution, mutation, installation, automation control, receipts, and promotion gates.
- Claude Code owns deep reasoning, synthesis, compression, repo understanding, and research packaging.
- Local watchers should be cheap, deterministic, and always honest. Local LLM review can watch anomalies without burning paid credits.
- Do not promote stale skills, vendor packages, or automation bundles without a gate and receipt.
- Do not call something green unless tests pass, protected metrics hold, and rollback data exists.

## Latest Local Evidence

${statusLine("source lock", sourceLock?.status)}
${statusLine("full green", fullGreen?.summary?.status || fullGreen?.status)}
${statusLine("ops readiness", ops?.status)}
${statusLine("reality watch", reality?.status)}
${statusLine("Codexa sync", codexa?.status)}

## Important Paths

- Orangebox repo: \`${repoRoot}\`
- Data root: \`${dataRoot}\`
- Zero-memory primer: \`${zeroMemoryPrimerPath}\`
- Mid-session primer: \`${primerPath}\`
- Source-of-truth lock: \`${sourceLockPath}\`
- Restart lock: \`${restartLockPath}\`
- Codexa sync config: \`${codexaConfigPath}\`
- Receipts: \`${receiptDir}\`

## Startup Behavior

After restart, the assistant must treat \`${repoRoot}\` as the active source of truth and should run the system check before making claims. If another project has not been primed, use this primer first and rename it to \`<Name> OB0X ON\` after the check.
`;

  const titleProtocol = {
    ok: true,
    version: "orangebox-ob0x-title-protocol/v0",
    created_at: new Date().toISOString(),
    requested_title: title,
    suffix: "OB0X ON",
    can_force_rename: false,
    rename_instruction:
      "Codex/Claude/Antigravity sessions do not expose a universal chat-title mutation API here. Rename manually when available, and use this JSON as the proof marker.",
    primer_path: primerPath,
    zero_memory_primer_path: zeroMemoryPrimerPath,
  };

  ensureDir(primerRoot);
  fs.writeFileSync(primerPath, body, "utf8");
  fs.writeFileSync(titleProtocolPath, `${JSON.stringify(titleProtocol, null, 2)}\n`, "utf8");

  const result = {
    ok: true,
    version: "orangebox-mid-session-primer/v0",
    status: "OB0X_MID_SESSION_PRIMER_READY",
    created_at: new Date().toISOString(),
    title,
    primer_path: primerPath,
    title_protocol_path: titleProtocolPath,
    source_lock_path: sourceLockPath,
    restart_lock_path: restartLockPath,
    evidence: {
      full_green_receipt: fullGreenReceipt,
      ops_receipt: opsReceipt,
      reality_receipt: realityReceipt,
      source_lock_status: sourceLock?.status || null,
      codexa_sync_status: codexa?.status || null,
    },
  };

  if (receipt) {
    ensureDir(receiptDir);
    const receiptPath = path.join(receiptDir, `orangebox-mid-session-primer-${stamp}.json`);
    fs.writeFileSync(receiptPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    result.receipt_path = receiptPath;
  }

  console.log(json ? JSON.stringify(result, null, 2) : `Mid-session primer ready: ${primerPath}`);
}

main();
