import fs from "node:fs/promises";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const base = process.env.BLUEB0X_URL || "http://127.0.0.1:8787";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");

async function timed(name, fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { name, status: "VERIFIED", ms: Date.now() - started, value };
  } catch (error) {
    return { name, status: "FAILED", ms: Date.now() - started, error: error.message };
  }
}

async function getJson(pathname, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${pathname}`, { signal: controller.signal });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(json?.error || text || res.statusText);
    return json || text;
  } finally {
    clearTimeout(timer);
  }
}

async function postJson(pathname, body, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${pathname}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(json?.error || text || res.statusText);
    return json || text;
  } finally {
    clearTimeout(timer);
  }
}

async function exists(file) {
  try {
    const stat = await fs.stat(file);
    return { path: file, exists: true, size: stat.size, mtime: stat.mtime.toISOString() };
  } catch {
    return { path: file, exists: false };
  }
}

const artifacts = [
  path.join(appRoot, "src-tauri", "target", "release", "blueb0x-command.exe"),
  path.join(appRoot, "src-tauri", "target", "release", "bundle", "msi", "BLUEB0X.AI Command_0.2.0_x64_en-US.msi"),
  path.join(appRoot, "src-tauri", "target", "release", "bundle", "nsis", "BLUEB0X.AI Command_0.2.0_x64-setup.exe")
];

const checks = [];
checks.push(await timed("root-html", async () => {
  const res = await fetch(`${base}/`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  if (!text.includes("BLUEB0X")) throw new Error("Root HTML missing BLUEB0X marker.");
  return { bytes: text.length };
}));
checks.push(await timed("fast-status", async () => {
  const payload = await getJson("/api/status", 8000);
  return { mode: payload.statusMode || "unknown", rail: payload.commandRail?.status || "UNKNOWN", learning: payload.departmentLearning?.status || "UNKNOWN" };
}));
checks.push(await timed("buildout", async () => {
  const payload = await getJson("/api/comprehensive-buildout?project=orangebox", 8000);
  return { status: payload.status, percent: payload.percent, blockers: payload.blockers?.length || 0 };
}));
checks.push(await timed("department-learning", async () => {
  const payload = await getJson("/api/department-learning?project=orangebox", 8000);
  return { status: payload.status, sources: payload.sourceCount, trainingExamples: payload.trainingExamples };
}));
checks.push(await timed("checkmate-fast", async () => {
  const payload = await getJson("/api/checkmate", 8000);
  return { status: payload.status, cache: payload.cache || "MISS", tools: payload.tools?.length || 0 };
}));
checks.push(await timed("desktop-artifacts", async () => {
  const rows = await Promise.all(artifacts.map(exists));
  return { present: rows.filter((row) => row.exists).length, artifacts: rows };
}));
checks.push(await timed("codexa-readonly-command", async () => {
  const payload = await postJson("/api/codexa/command", {
    shell: "powershell",
    cwd: "C:/AtomEons",
    command: "hostname; whoami; Get-Date",
    timeoutMs: 30000,
    checkmateLevel: "light"
  }, 40000);
  return { status: payload.status, totalMs: payload.totalMs, resultStatus: payload.result?.status || payload.result?.response?.status || "UNKNOWN" };
}));

const failed = checks.filter((check) => check.status !== "VERIFIED");
const payload = {
  status: failed.length ? "CONFIGURED_WITH_GAPS" : "VERIFIED",
  generatedAt: new Date().toISOString(),
  base,
  checks,
  failed: failed.map((check) => ({ name: check.name, error: check.error })),
  nextAction: failed.length
    ? "Fix failed smoke checks before claiming fully live."
    : "System is live enough for next build dispatch; keep deep verification and approval gates for risky work."
};

const receiptDir = path.join(orangeRoot, "receipts");
await fs.mkdir(receiptDir, { recursive: true });
const receiptPath = path.join(receiptDir, `blueb0x-live-smoke-${stamp}.json`);
await fs.writeFile(receiptPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...payload, receiptPath }, null, 2));
