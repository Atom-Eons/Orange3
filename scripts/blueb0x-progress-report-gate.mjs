import fs from "node:fs/promises";
import path from "node:path";

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

async function fetchJson(url, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
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
    "# BLUEB0X Progress Report Gate",
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
    `- Endpoint: ${report.endpoint}`,
    `- Report: ${report.reportPath || "missing"}`,
    `- Receipt: ${report.receiptPath}`,
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
  const endpoint = `${baseUrl}/api/project-progress-report?project=orangebox`;
  const response = await fetchJson(endpoint);
  const payload = response.json || {};
  const reportText = String(payload.report || "");
  const counts = payload.scopeLedger?.counts || {};
  const checks = [
    { name: "endpoint returned HTTP 200", pass: response.ok, detail: `HTTP ${response.code}` },
    { name: "progress payload status verified", pass: payload.status === "VERIFIED", detail: payload.status || "missing" },
    { name: "markdown contains Dynamic Scope Ledger", pass: reportText.includes("## Dynamic Scope Ledger") },
    { name: "markdown contains dynamic addition counts", pass: /Dynamic additions:\s+\d+\/\d+/.test(reportText) },
    { name: "json includes scopeLedger", pass: Boolean(payload.scopeLedger && payload.scopeLedger.status), detail: payload.scopeLedger?.status || "missing" },
    { name: "scope ledger has coherent counts", pass: Number.isFinite(Number(counts.total)) && Number(counts.verified || 0) <= Number(counts.total || 0), detail: `${counts.verified || 0}/${counts.total || 0}` },
    { name: "report file path returned", pass: Boolean(payload.reportPath), detail: payload.reportPath || "missing" }
  ];
  const status = checks.every((check) => check.pass) ? "VERIFIED" : "FAILED";
  const jsonPath = path.join(readinessRoot, `blueb0x-progress-report-gate-${runStamp}.json`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-progress-report-gate-${runStamp}.md`);
  const report = {
    status,
    generatedAt,
    endpoint,
    checks,
    reportPath: payload.reportPath || "",
    receiptPath,
    jsonPath,
    scopeLedger: payload.scopeLedger || null
  };
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(receiptPath, renderMarkdown(report));
  console.log(JSON.stringify({
    status,
    checks: checks.map((check) => ({ name: check.name, pass: check.pass })),
    reportPath: report.reportPath,
    jsonPath,
    receiptPath
  }, null, 2));
  if (status !== "VERIFIED") process.exit(1);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
