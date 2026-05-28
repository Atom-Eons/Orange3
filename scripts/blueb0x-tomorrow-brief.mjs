import fs from "node:fs/promises";
import path from "node:path";

const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const receiptsRoot = path.join(orangeRoot, "receipts");
const briefRoot = path.join(orangeRoot, "readiness");
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

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function latestFile(dir, predicate = () => true) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !predicate(entry.name)) continue;
      const file = path.join(dir, entry.name);
      const stat = await fs.stat(file);
      files.push({ file, name: entry.name, mtime: stat.mtimeMs, size: stat.size });
    }
    return files.sort((a, b) => b.mtime - a.mtime)[0] || null;
  } catch {
    return null;
  }
}

async function endpoint(url, timeoutMs = 8000) {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    return { status: res.ok ? "VERIFIED" : "FAILED", code: res.status, ms: Date.now() - started, bytes: text.length, json };
  } catch (error) {
    return { status: "FAILED", code: null, ms: Date.now() - started, error: error.message };
  } finally {
    clearTimeout(timeout);
  }
}

async function artifact(file) {
  try {
    const stat = await fs.stat(file);
    return { path: file, exists: true, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { path: file, exists: false, size: 0, mtime: null };
  }
}

function latestReceiptLine(file) {
  return file ? `${file.name} (${Math.round(file.size / 1024)}KB)` : "missing";
}

function renderMarkdown(report) {
  return [
    "# BLUEB0X Tomorrow Operator Brief",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Use Tomorrow",
    "",
    report.useTomorrow.map((item) => `- ${item}`).join("\n"),
    "",
    "## Verified Gates",
    "",
    `- App endpoint: ${report.endpoints.app.status} / ${report.endpoints.app.ms}ms`,
    `- Fast status: ${report.endpoints.status.status} / ${report.endpoints.status.ms}ms`,
    `- Mirage status: ${report.endpoints.mirage.status} / ${report.mirageStatus}`,
    `- Readiness receipt: ${latestReceiptLine(report.latest.readiness)}`,
    `- Visual proof receipt: ${latestReceiptLine(report.latest.visualProof)}`,
    `- Live smoke receipt: ${latestReceiptLine(report.latest.liveSmoke)}`,
    `- Long memory receipt: ${latestReceiptLine(report.latest.longMemory)}`,
    "",
    "## Desktop Artifacts",
    "",
    ...report.desktopArtifacts.map((item) => `- ${item.exists ? "VERIFIED" : "MISSING"}: ${item.path} (${item.size} bytes)`),
    "",
    "## Known Gaps",
    "",
    ...(report.knownGaps.length ? report.knownGaps.map((gap) => `- ${gap}`) : ["- None"]),
    "",
    "## Commands",
    "",
    "```powershell",
    "cd C:\\AtomEons\\aeskills\\orangebox-command",
    "npm.cmd run readiness",
    "npm.cmd run proof:readiness",
    "npm.cmd run live-smoke",
    "npm.cmd run mirage:status",
    "```",
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
  const [app, status, mirage] = await Promise.all([
    endpoint(`${baseUrl}/`),
    endpoint(`${baseUrl}/api/status`),
    endpoint(`${baseUrl}/api/mirage/status`, 15000)
  ]);
  const desktopArtifacts = await Promise.all([
    artifact("C:/AtomEons/aeskills/orangebox-command/src-tauri/target/release/blueb0x-command.exe"),
    artifact("C:/AtomEons/aeskills/orangebox-command/src-tauri/target/release/bundle/msi/BLUEB0X.AI Command_0.2.0_x64_en-US.msi"),
    artifact("C:/AtomEons/aeskills/orangebox-command/src-tauri/target/release/bundle/nsis/BLUEB0X.AI Command_0.2.0_x64-setup.exe")
  ]);
  const latest = {
    readiness: await latestFile(receiptsRoot, (name) => name.startsWith("blueb0x-readiness-") && name.endsWith(".md")),
    visualProof: await latestFile(receiptsRoot, (name) => name.startsWith("blueb0x-visual-proof-readiness-") && name.endsWith(".md")),
    liveSmoke: await latestFile(receiptsRoot, (name) => name.startsWith("blueb0x-live-smoke-") && name.endsWith(".json")),
    longMemory: await latestFile(receiptsRoot, (name) => name.startsWith("blueb0x-longmemeval-") && name.endsWith(".md"))
  };
  const knowledge = await readJson(path.join(orangeRoot, "memory", "orangebox-knowledge", "graph.json"), {});
  const knownGaps = [];
  if (mirage.json?.counts?.missingEnvMounts > 0) knownGaps.push(`Mirage external mounts need env/OAuth: ${mirage.json.counts.missingEnvMounts} mounts.`);
  const checkmateStatus = status.json?.checkmate?.status || status.json?.reviewEngines?.status || "UNKNOWN";
  if (String(checkmateStatus).includes("GAPS")) knownGaps.push(`Checkmate external checker suite is ${checkmateStatus}; do not call full external QA complete.`);
  if (desktopArtifacts.some((item) => !item.exists)) knownGaps.push("One or more desktop installer artifacts are missing.");
  const statusValue = app.status === "VERIFIED"
    && status.status === "VERIFIED"
    && mirage.status === "VERIFIED"
    && desktopArtifacts.every((item) => item.exists)
    && latest.readiness
    && latest.visualProof
    ? "READY_LOCAL"
    : "READY_WITH_GAPS";
  const jsonPath = path.join(briefRoot, `blueb0x-tomorrow-brief-${runStamp}.json`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-tomorrow-brief-${runStamp}.md`);
  const report = {
    status: statusValue,
    generatedAt,
    baseUrl,
    endpoints: { app, status, mirage },
    mirageStatus: mirage.json?.status || "UNKNOWN",
    knowledge: {
      status: knowledge.status || "UNKNOWN",
      documents: knowledge.counts?.documents || 0,
      pageTreeNodes: knowledge.counts?.pageTreeNodes || 0,
      edges: knowledge.counts?.edges || 0
    },
    desktopArtifacts,
    latest,
    knownGaps,
    useTomorrow: [
      "Open the desktop app or http://127.0.0.1:8787.",
      "Use V4 Mission OS for top-level project control.",
      "Use Stage Dept for safe department packets while Codexa is busy.",
      "Use Invoke Design for AE3/LIPS design passes.",
      "Run readiness and proof:readiness before treating UI work as ready."
    ],
    jsonPath,
    receiptPath
  };
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(receiptPath, renderMarkdown(report));
  console.log(JSON.stringify({
    status: report.status,
    app: app.status,
    fastStatus: status.status,
    mirage: report.mirageStatus,
    artifacts: `${desktopArtifacts.filter((item) => item.exists).length}/${desktopArtifacts.length}`,
    gaps: knownGaps.length,
    jsonPath,
    receiptPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
