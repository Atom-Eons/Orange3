import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const receiptsRoot = path.join(orangeRoot, "receipts");
const proofRoot = path.join(orangeRoot, "proof-readiness");
const baseUrl = process.env.BLUEB0X_BASE_URL || "http://127.0.0.1:8787";

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

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return { exists: true, path: file, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { exists: false, path: file, size: 0, mtime: null };
  }
}

async function endpoint(url, options = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 10000);
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.ok ? "VERIFIED" : "FAILED", code: res.status, ms: Date.now() - started, bytes: text.length, json, text: text.slice(0, 1000) };
  } catch (error) {
    return { status: "FAILED", code: null, ms: Date.now() - started, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function renderMarkdown(report) {
  return [
    "# BLUEB0X Visual Proof Readiness",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Checks",
    "",
    `- App root: ${report.app.status} / ${report.app.code || "n/a"} / ${report.app.ms}ms`,
    `- Proof endpoint: ${report.proof.status} / ${report.proof.code || "n/a"} / ${report.proof.ms}ms`,
    `- Desktop screenshot: ${report.artifacts.desktop.exists ? report.artifacts.desktop.path : "missing"}`,
    `- Compact screenshot: ${report.artifacts.compact.exists ? report.artifacts.compact.path : "missing"}`,
    `- Proof report: ${report.artifacts.report.exists ? report.artifacts.report.path : "missing"}`,
    "",
    "## Proof Result",
    "",
    `- Proof status: ${report.proofResult.status || "UNKNOWN"}`,
    `- Desktop overflow: ${report.proofResult.desktopOverflow}`,
    `- Compact overflow: ${report.proofResult.compactOverflow}`,
    `- Empty visible controls: ${report.proofResult.emptyButtonCount}`,
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
  const app = await endpoint(`${baseUrl}/`);
  const proof = await endpoint(`${baseUrl}/api/proof/visual`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ label: `blueb0x-proof-readiness-${runStamp}` }),
    timeoutMs: 120000
  });
  const proofJson = proof.json || {};
  const desktopPath = proofJson.desktop || "";
  const compactPath = proofJson.compact || "";
  const reportPath = proofJson.reportPath || "";
  const artifacts = {
    desktop: await exists(desktopPath),
    compact: await exists(compactPath),
    report: await exists(reportPath)
  };
  const results = proofJson.results || [];
  const desktop = results.find((item) => item.name === "desktop") || {};
  const compact = results.find((item) => item.name === "compact") || {};
  const emptyButtonCount = Math.max(
    Number(desktop.metrics?.emptyButtonCount || 0),
    Number(compact.metrics?.emptyButtonCount || 0)
  );
  const status = app.status === "VERIFIED"
    && proof.status === "VERIFIED"
    && proofJson.status === "VERIFIED"
    && artifacts.desktop.exists
    && artifacts.compact.exists
    && artifacts.report.exists
    ? "VERIFIED"
    : "FAILED";
  const jsonPath = path.join(proofRoot, `blueb0x-visual-proof-readiness-${runStamp}.json`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-visual-proof-readiness-${runStamp}.md`);
  const report = {
    status,
    generatedAt,
    baseUrl,
    app,
    proof,
    proofResult: {
      status: proofJson.status || "UNKNOWN",
      desktopOverflow: Boolean(desktop.overflow),
      compactOverflow: Boolean(compact.overflow),
      emptyButtonCount
    },
    artifacts,
    jsonPath,
    receiptPath
  };
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(receiptPath, renderMarkdown(report));
  console.log(JSON.stringify({
    status,
    app: app.status,
    proof: proofJson.status || proof.status,
    desktop: artifacts.desktop.exists,
    compact: artifacts.compact.exists,
    report: artifacts.report.exists,
    jsonPath,
    receiptPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
