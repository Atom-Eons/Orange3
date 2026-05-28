import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const srcRoot = path.join(appRoot, "src");
const receiptsRoot = path.join(orangeRoot, "receipts");
const readinessRoot = path.join(orangeRoot, "readiness");

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return { exists: true, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { exists: false, size: 0, mtime: null };
  }
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

function buttonIds(html) {
  const ids = [];
  const buttonRe = /<button\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(buttonRe)) ids.push(match[1]);
  return [...new Set(ids)].sort();
}

function interactiveIds(html) {
  const ids = [];
  const re = /<(button|select|textarea|input|a)\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi;
  for (const match of html.matchAll(re)) ids.push({ tag: match[1].toLowerCase(), id: match[2] });
  return ids;
}

function listenerIds(js) {
  const ids = new Set();
  const patterns = [
    /\$\(["']([^"']+)["']\)\??\.addEventListener/g,
    /document\.getElementById\(["']([^"']+)["']\)\??\.addEventListener/g
  ];
  for (const pattern of patterns) {
    for (const match of js.matchAll(pattern)) ids.add(match[1]);
  }
  return ids;
}

function referencedIds(js) {
  const ids = new Set();
  for (const match of js.matchAll(/\$\(["']([^"']+)["']\)/g)) ids.add(match[1]);
  return ids;
}

async function endpoint(url, timeoutMs = 5000) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    return { url, status: res.ok ? "VERIFIED" : "FAILED", code: res.status, ms: Date.now() - started, bytes: text.length };
  } catch (error) {
    return { url, status: "FAILED", code: null, ms: Date.now() - started, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

function statusFromFindings(findings) {
  const red = findings.filter((item) => item.severity === "red").length;
  const amber = findings.filter((item) => item.severity === "amber").length;
  if (red > 0) return "FAILED";
  if (amber > 0) return "READY_WITH_GAPS";
  return "VERIFIED";
}

function renderMarkdown(report) {
  return [
    "# BLUEB0X Desktop Readiness Audit",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Summary",
    "",
    `- Buttons: ${report.counts.buttons}`,
    `- Buttons with listeners: ${report.counts.buttonsWithListeners}`,
    `- Buttons without listeners: ${report.counts.buttonsMissingListeners}`,
    `- Endpoint checks: ${report.endpoints.filter((item) => item.status === "VERIFIED").length}/${report.endpoints.length} verified`,
    `- Desktop artifacts: ${report.desktopArtifacts.filter((item) => item.exists).length}/${report.desktopArtifacts.length} present`,
    "",
    "## Findings",
    "",
    ...(report.findings.length ? report.findings.map((item) => `- ${item.severity.toUpperCase()}: ${item.message}`) : ["- None"]),
    "",
    "## Dead-Control Check",
    "",
    ...(report.deadButtons.length ? report.deadButtons.map((id) => `- ${id}`) : ["- No button ids missing listeners."]),
    "",
    "## Endpoint Evidence",
    "",
    ...report.endpoints.map((item) => `- ${item.status}: ${item.url} / ${item.code || "n/a"} / ${item.ms}ms`),
    "",
    "## Files",
    "",
    `- JSON: ${report.jsonPath}`,
    `- Receipt: ${report.receiptPath}`
  ].join("\n");
}

async function main() {
  const generatedAt = iso();
  const [html, js] = await Promise.all([
    readText(path.join(srcRoot, "index.html")),
    readText(path.join(srcRoot, "app.js"))
  ]);
  const buttons = buttonIds(html);
  const listeners = listenerIds(js);
  const refs = referencedIds(js);
  const interactives = interactiveIds(html);
  const deadButtons = buttons.filter((id) => !listeners.has(id) && !refs.has(id));
  const weakButtons = buttons.filter((id) => !listeners.has(id) && refs.has(id));
  const requiredIds = [
    "v4Goal",
    "v4RunLoop",
    "v4FullScope",
    "v4Buildout",
    "v4Mirage",
    "invokeDesignModel",
    "invokeDepartmentModel",
    "v4DecisionGates",
    "decisionGateCard",
    "chatgptHandoff",
    "sendChatGpt",
    "threadMessage",
    "departmentModelSelect",
    "rebuildKnowledge",
    "askKnowledge"
  ];
  const missingRequiredIds = requiredIds.filter((id) => !interactives.some((item) => item.id === id) && !html.includes(`id="${id}"`));
  const endpoints = await Promise.all([
    endpoint("http://127.0.0.1:8787/"),
    endpoint("http://127.0.0.1:8787/api/status"),
    endpoint("http://127.0.0.1:8787/api/comprehensive-buildout"),
    endpoint("http://127.0.0.1:8787/api/checkmate"),
    endpoint("http://127.0.0.1:8787/api/decision-gates"),
    endpoint("http://127.0.0.1:8787/api/mirage/status")
  ]);
  const desktopArtifacts = await Promise.all([
    "C:/AtomEons/aeskills/orangebox-command/src-tauri/target/release/blueb0x-command.exe",
    "C:/AtomEons/aeskills/orangebox-command/src-tauri/target/release/bundle/msi/BLUEB0X.AI Command_0.2.0_x64_en-US.msi",
    "C:/AtomEons/aeskills/orangebox-command/src-tauri/target/release/bundle/nsis/BLUEB0X.AI Command_0.2.0_x64-setup.exe"
  ].map(async (artifact) => ({ path: artifact, ...await exists(artifact) })));

  const findings = [];
  if (deadButtons.length) findings.push({ severity: "red", message: `${deadButtons.length} button ids have no listener or JS reference.` });
  if (weakButtons.length) findings.push({ severity: "amber", message: `${weakButtons.length} button ids are JS-referenced but do not have direct listeners; verify delegated/indirect behavior.` });
  if (missingRequiredIds.length) findings.push({ severity: "red", message: `Missing required controls: ${missingRequiredIds.join(", ")}` });
  const failedEndpoints = endpoints.filter((item) => item.status !== "VERIFIED");
  if (failedEndpoints.length) findings.push({ severity: "red", message: `${failedEndpoints.length} required local endpoints failed.` });
  const missingArtifacts = desktopArtifacts.filter((item) => !item.exists);
  if (missingArtifacts.length) findings.push({ severity: "amber", message: `${missingArtifacts.length} desktop artifacts missing.` });

  const runStamp = stamp();
  const jsonPath = path.join(readinessRoot, `blueb0x-readiness-${runStamp}.json`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-readiness-${runStamp}.md`);
  const report = {
    status: statusFromFindings(findings),
    generatedAt,
    counts: {
      buttons: buttons.length,
      buttonsWithListeners: buttons.filter((id) => listeners.has(id)).length,
      buttonsMissingListeners: deadButtons.length,
      weakButtons: weakButtons.length,
      interactiveIds: interactives.length
    },
    deadButtons,
    weakButtons,
    missingRequiredIds,
    endpoints,
    desktopArtifacts,
    findings,
    jsonPath,
    receiptPath
  };
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(receiptPath, renderMarkdown(report));
  console.log(JSON.stringify({
    status: report.status,
    buttons: report.counts.buttons,
    deadButtons: report.deadButtons.length,
    weakButtons: report.weakButtons.length,
    endpoints: `${report.endpoints.filter((item) => item.status === "VERIFIED").length}/${report.endpoints.length}`,
    artifacts: `${report.desktopArtifacts.filter((item) => item.exists).length}/${report.desktopArtifacts.length}`,
    jsonPath,
    receiptPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
