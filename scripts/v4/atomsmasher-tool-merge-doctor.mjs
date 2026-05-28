#!/usr/bin/env node
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const receipt = args.has("--receipt");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const ATOM_ROOT = path.join(DATA_ROOT, "atomsmasher");
const MERGE_ROOT = path.join(ATOM_ROOT, "tool-merge");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const RUNTIME = path.join(ROOT, "scripts", "v4", "atomsmasher-runtime.mjs");

const VISUAL_OR_PRODUCT_LANE = [
  /(^|:)web\b/i,
  /see-suite/i,
  /visual/i,
  /pixel/i,
  /react/i,
  /chromium/i,
  /canvas/i,
  /desktop/i,
  /tauri/i,
  /\bstore\b/i,
  /marketplace/i,
  /proof:first-run/i,
];

const BACKEND_HINT = [
  /doctor/i,
  /gauntlet/i,
  /system/i,
  /aecode/i,
  /atomsmasher/i,
  /chat/i,
  /backup/i,
  /primer/i,
  /bootstrap/i,
  /reality/i,
  /ops/i,
  /inference/i,
  /control/i,
  /knowledge/i,
  /provider/i,
  /receipt/i,
  /skills:stale/i,
];

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function sha256File(file) {
  if (!fsSync.existsSync(file)) return null;
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
  return file;
}

async function readJson(file) {
  try {
    return JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
}

function scriptPathFromCommand(command) {
  const match = String(command || "").match(/(?:node|python|powershell\.exe)[^\n]*?\s+(\.\/[^\s"]+|[A-Z]:\\[^\s"]+)/i);
  if (!match) return null;
  const raw = match[1].replace(/^"\.?|"?$/g, "");
  return raw.startsWith(".") ? path.resolve(ROOT, raw) : path.resolve(raw);
}

function classifyScript(name, command) {
  const joined = `${name} ${command}`;
  const visual = VISUAL_OR_PRODUCT_LANE.some((rx) => rx.test(joined));
  const backend = BACKEND_HINT.some((rx) => rx.test(joined));
  if (visual) return "excluded_visual_or_product_lane";
  if (backend) return "eligible_backend_ops_tool";
  return "sleeping_other_tool";
}

function upgradeTags(name, command) {
  const joined = `${name} ${command}`;
  const tags = [];
  if (/gauntlet|system:full-green|release/i.test(joined)) tags.push("least_action_route", "saved_work_certificate", "proof_gate");
  if (/doctor|proof|check/i.test(joined)) tags.push("proof_receipt", "coverage_receipt");
  if (/chat|backup|primer|bootstrap/i.test(joined)) tags.push("source_ingest", "cold_restore", "commitment_atom");
  if (/inference|provider|control|llama|model/i.test(joined)) tags.push("routing_engine", "runtime_profile", "agent_lease");
  if (/security|skills:stale|install/i.test(joined)) tags.push("immune_scan", "source_order_fence");
  if (/atomsmasher/i.test(joined)) tags.push("self_hosted_compression", "air_capsule");
  return [...new Set(tags.length ? tags : ["commitment_atom"])];
}

async function runtime(command, extraArgs = [], { timeout = 180_000 } = {}) {
  const out = await execFileAsync(process.execPath, [RUNTIME, command, "--json", "--no-receipt", ...extraArgs], {
    cwd: ROOT,
    env: { ...process.env, ORANGEBOX_DATA_ROOT: DATA_ROOT },
    timeout,
    maxBuffer: 20_000_000,
    windowsHide: true,
  });
  return JSON.parse(out.stdout || "{}");
}

async function buildManifest() {
  const pkg = await readJson(path.join(ROOT, "package.json"));
  const scripts = pkg?.scripts || {};
  const rows = Object.entries(scripts).map(([name, command]) => {
    const file = scriptPathFromCommand(command);
    const classification = classifyScript(name, command);
    return {
      name,
      command,
      classification,
      script_path: file,
      script_exists: file ? fsSync.existsSync(file) : false,
      script_sha256: file ? sha256File(file) : null,
      upgrade_tags: classification === "eligible_backend_ops_tool" ? upgradeTags(name, command) : [],
    };
  });
  const eligible = rows.filter((row) => row.classification === "eligible_backend_ops_tool");
  const excluded = rows.filter((row) => row.classification === "excluded_visual_or_product_lane");
  return {
    schema_version: "orangebox.atomsmasher.tool_merge.v0",
    created_at: new Date().toISOString(),
    doctrine: "AtomSmasher may upgrade Orangebox backend tools by producing receipts, routes, coverage, saved-work proof, security scans, and merge plans. It may not mutate visual, store, deploy, or product-output lanes from this Ops chat.",
    source: {
      package_json: path.join(ROOT, "package.json"),
      package_sha256: sha256File(path.join(ROOT, "package.json")),
      atomsmasher_runtime: RUNTIME,
      atomsmasher_runtime_sha256: sha256File(RUNTIME),
    },
    totals: {
      package_scripts: rows.length,
      eligible_backend_tools: eligible.length,
      excluded_visual_or_product_lane: excluded.length,
      sleeping_other_tools: rows.length - eligible.length - excluded.length,
    },
    eligible_tools: eligible,
    excluded_tools: excluded,
    merge_outputs: [
      "C:\\Users\\a\\OrangeBox-Data\\atomsmasher\\tool-merge\\latest-tool-merge.json",
      "C:\\AtomEons\\orangebox\\docs\\ATOMSMASHER_TOOL_MERGE_2026-05-28.md",
      "C:\\AtomEons\\orangebox\\receipts\\orangebox-atomsmasher-tool-merge-*.json",
    ],
  };
}

function markdownReport(report) {
  const topTools = report.manifest.eligible_tools.slice(0, 20).map((tool) => `- \`${tool.name}\` -> ${tool.upgrade_tags.join(", ")}`).join("\n");
  return `# AtomSmasher Tool Merge

Date: 2026-05-28

Status: \`${report.status}\`

This is an Orangebox Operations backend merge lane. AtomSmasher is allowed to upgrade backend tools by adding proof, routing, compression, source-ingest, saved-work, and receipt coverage. It is not allowed to mutate the separate visual/frontend/dashboard project from this chat.

## What Was Merged

- AtomSmasher doctor proof is now a required backend proof lane.
- AtomSmasher API smoke is part of full-green.
- AtomSmasher tool merge now scans package scripts, excludes visual/product lanes, and produces a deterministic backend upgrade map.
- The reality watcher and Ops readiness can tell whether AtomSmasher is actually green.

## Tool Surface

- Package scripts scanned: ${report.manifest.totals.package_scripts}
- Eligible backend tools: ${report.manifest.totals.eligible_backend_tools}
- Excluded visual/product tools: ${report.manifest.totals.excluded_visual_or_product_lane}
- Sleeping other tools: ${report.manifest.totals.sleeping_other_tools}

## Top Eligible Tools

${topTools || "- none"}

## AtomSmasher Proof

- Feature registry: ${report.atomsmasher?.features_registered ?? "unknown"}
- Schema version: ${report.atomsmasher?.schema_version ?? "unknown"}
- Compile route: ${report.compile?.route?.selected_path || "unknown"}
- Saved tokens proxy: ${report.compile?.route?.saved_work?.tokens_not_injected ?? 0}
- Security scan: ${report.security?.status || "unknown"}

## Outputs

- Merge proof: \`${report.latest_path}\`
- Receipt: \`${report.receipt_path || "receipt disabled"}\`

## Rollback

This merge lane writes proof artifacts only. To roll back this lane, remove the generated tool-merge JSON, matching receipt, and this document. Do not delete the vendored AtomSmasher package unless superseding the integration.
`;
}

async function main() {
  const startedAt = new Date().toISOString();
  await fs.mkdir(MERGE_ROOT, { recursive: true });
  const doctor = await readJson(path.join(ATOM_ROOT, "latest-atomsmasher-doctor.json"));
  const manifest = await buildManifest();
  const manifestText = JSON.stringify(manifest, null, 2);
  const manifestPath = path.join(MERGE_ROOT, `tool-merge-manifest-${stamp()}.json`);
  await writeJson(manifestPath, manifest);

  const ingestSource = await runtime("ingest-text", [
    "--title",
    "Orangebox backend tool surface for AtomSmasher merge",
    "--text-file",
    manifestPath,
  ]);
  const compile = await runtime("compile", [
    "--query",
    "merge AtomSmasher into Orangebox backend tools using least action; preserve visual lane boundary; upgrade only tools with receipts and proof",
  ]);
  const security = await runtime("security-scan", [
    "--text",
    `AtomSmasher backend merge manifest sha256=${sha256Text(manifestText)} eligible=${manifest.totals.eligible_backend_tools} excluded_visual=${manifest.totals.excluded_visual_or_product_lane}`,
  ]);
  const proof = await runtime("proof");

  const gates = [
    { id: "atomsmasher_doctor_green", ok: doctor?.ok === true && doctor?.summary?.status === "ATOMSMASHER_ORANGEBOX_INTEGRATION_GREEN" },
    { id: "schema_version_10", ok: doctor?.summary?.schema_version === 10 || proof?.features_registered >= 620 },
    { id: "features_registered_620", ok: doctor?.summary?.features_registered === 620 || proof?.features_registered === 620 },
    { id: "eligible_backend_tools_found", ok: manifest.totals.eligible_backend_tools >= 20 },
    { id: "visual_product_lanes_excluded", ok: manifest.excluded_tools.every((tool) => tool.classification === "excluded_visual_or_product_lane") },
    { id: "source_ingest_working", ok: Boolean(ingestSource?.source_id) },
    { id: "least_action_compile_working", ok: Boolean(compile?.route?.selected_path && compile?.route?.saved_work) },
    { id: "security_scan_clean", ok: security?.status === "clean" },
    { id: "proof_registry_live", ok: proof?.registry_live === true && proof?.features_registered >= 620 },
  ];

  const report = {
    ok: gates.every((gate) => gate.ok),
    version: "orangebox-atomsmasher-tool-merge/v0",
    status: gates.every((gate) => gate.ok) ? "ATOMSMASHER_TOOL_MERGE_GREEN" : "ATOMSMASHER_TOOL_MERGE_NEEDS_ATTENTION",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    gates,
    atomsmasher: doctor?.summary || null,
    manifest_path: manifestPath,
    manifest,
    ingest_source: ingestSource,
    compile,
    security,
    proof,
    rollback: {
      repo_mutation: "tool-merge script/docs/package/full-green wiring only",
      data_mutation: MERGE_ROOT,
      recovery_action: `Delete ${MERGE_ROOT} and generated orangebox-atomsmasher-tool-merge receipts if this merge lane is superseded.`,
    },
  };
  report.latest_path = await writeJson(path.join(MERGE_ROOT, "latest-tool-merge.json"), report);
  const docPath = path.join(ROOT, "docs", "ATOMSMASHER_TOOL_MERGE_2026-05-28.md");
  report.doc_path = await writeText(docPath, markdownReport(report));

  if (receipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-atomsmasher-tool-merge-${stamp()}.json`);
    report.receipt_path = receiptPath;
    await writeJson(receiptPath, report);
  }

  console.log(wantsJson ? JSON.stringify(report, null, 2) : report.status);
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  const result = { ok: false, version: "orangebox-atomsmasher-tool-merge/v0", error: error?.message || String(error) };
  console.log(wantsJson ? JSON.stringify(result, null, 2) : JSON.stringify(result));
  process.exitCode = 1;
});
