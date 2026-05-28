import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const receiptsRoot = path.join(orangeRoot, "receipts");
const readinessRoot = path.join(orangeRoot, "readiness");
const baseUrl = process.env.BLUEB0X_URL || "http://127.0.0.1:8787";

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

async function fetchJson(url, options = {}, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, code: res.status, text, json };
  } finally {
    clearTimeout(timeout);
  }
}

function renderMarkdown(report) {
  return [
    "# BLUEB0X DAG Runner Gate",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- ${check.pass ? "PASS" : "FAIL"}: ${check.name}${check.detail ? ` - ${check.detail}` : ""}`),
    "",
    "## Evidence",
    "",
    `- Decision status: ${report.decisionStatus}`,
    `- Dry-run status: ${report.dryRunStatus}`,
    `- Dry-run receipt: ${report.dryRunReceipt || "missing"}`,
    "",
    "## Files",
    "",
    `- JSON: ${report.jsonPath}`,
    `- Receipt: ${report.receiptPath}`
  ].join("\n");
}

async function main() {
  const generatedAt = iso();
  const runStamp = stamp();
  const serverSource = await fs.readFile(path.join(appRoot, "scripts", "orangebox-command-server.mjs"), "utf8");
  const appSource = await fs.readFile(path.join(appRoot, "src", "app.js"), "utf8");
  const gates = await fetchJson(`${baseUrl}/api/decision-gates?project=orangebox`);
  const dry = await fetchJson(`${baseUrl}/api/project-dag/run`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ project: "orangebox", mode: "dry-run", maxNodes: 1 })
  });
  const checks = [
    { name: "decision gates endpoint verified", pass: gates.ok && Boolean(gates.json?.status), detail: gates.json?.status || `HTTP ${gates.code}` },
    { name: "DAG dry-run endpoint verified", pass: dry.ok && Boolean(dry.json?.status), detail: dry.json?.status || `HTTP ${dry.code}` },
    { name: "dry-run did not dispatch mutating work", pass: dry.json?.mode === "dry-run" || (dry.json?.events || []).some((event) => event.status === "PAUSED" || event.status === "DRY_RUN") },
    { name: "server dispatch path checks decisionGateStatus", pass: /mode\s*===\s*"dispatch"[\s\S]{0,500}decisionGateStatus\(project\)/.test(serverSource) },
    { name: "server dispatch path can return NEEDS_APPROVAL", pass: serverSource.includes('status: "NEEDS_APPROVAL"') && serverSource.includes("Decision Gates are waiting") },
    { name: "frontend runner renders returned decision gates", pass: appSource.includes("payload.decisionGates") && appSource.includes("renderDecisionGates(payload.decisionGates)") }
  ];
  const status = checks.every((check) => check.pass) ? "VERIFIED" : "FAILED";
  const jsonPath = path.join(readinessRoot, `blueb0x-dag-runner-gate-${runStamp}.json`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-dag-runner-gate-${runStamp}.md`);
  const report = {
    status,
    generatedAt,
    checks,
    decisionStatus: gates.json?.status || "UNKNOWN",
    dryRunStatus: dry.json?.status || "UNKNOWN",
    dryRunReceipt: dry.json?.receipt_path || "",
    jsonPath,
    receiptPath
  };
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(receiptPath, renderMarkdown(report));
  console.log(JSON.stringify({
    status,
    checks: checks.map((check) => ({ name: check.name, pass: check.pass })),
    jsonPath,
    receiptPath
  }, null, 2));
  if (status !== "VERIFIED") process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
