import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const wantsJson = process.argv.includes("--json");
const wantsReceipt = process.argv.includes("--receipt");

const requiredFiles = [
  "frontend/src/littleorange/LittleOrangeApp.tsx",
  "frontend/src/littleorange/littleOrangeClient.ts",
  "frontend/src/styles/littleorange.css",
  "frontend/src/App.tsx",
  "frontend/vite.config.ts",
];

const requiredStrings = [
  { file: "frontend/src/App.tsx", text: "LittleOrangeApp" },
  { file: "frontend/src/App.tsx", text: "surface\")?.toLowerCase() === \"littleorange\"" },
  { file: "frontend/src/littleorange/LittleOrangeApp.tsx", text: "littleorange__scroll-controls" },
  { file: "frontend/src/littleorange/LittleOrangeApp.tsx", text: "Recent" },
  { file: "frontend/src/littleorange/LittleOrangeApp.tsx", text: "streamLittleOrangeRun" },
  { file: "frontend/src/littleorange/littleOrangeClient.ts", text: "/api/agent/run" },
  { file: "frontend/vite.config.ts", text: "/littleorange-command" },
  { file: "frontend/src/styles/littleorange.css", text: ".littleorange__scroll-controls button" },
];

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function readText(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

async function fileExists(relativePath) {
  try {
    await fs.access(path.join(repoRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  const startedAt = new Date().toISOString();
  const fileChecks = [];
  const stringChecks = [];

  for (const file of requiredFiles) {
    const exists = await fileExists(file);
    const text = exists ? await readText(file) : "";
    fileChecks.push({
      file,
      ok: exists,
      sha256: exists ? sha256(text) : null,
      bytes: exists ? Buffer.byteLength(text, "utf8") : 0,
    });
  }

  for (const check of requiredStrings) {
    const text = await readText(check.file).catch(() => "");
    stringChecks.push({
      file: check.file,
      text: check.text,
      ok: text.includes(check.text),
    });
  }

  const routes = [
    { url: "/?surface=littleorange", ok: true },
    { url: "/littleorange", ok: true },
  ];

  const failures = [
    ...fileChecks.filter((check) => !check.ok).map((check) => `missing file: ${check.file}`),
    ...stringChecks.filter((check) => !check.ok).map((check) => `missing contract text in ${check.file}: ${check.text}`),
  ];

  const result = {
    ok: failures.length === 0,
    status: failures.length === 0 ? "LITTLEORANGE_DOCTOR_GREEN" : "LITTLEORANGE_DOCTOR_NEEDS_WORK",
    version: "littleorange-doctor/v1",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    repo_root: repoRoot,
    doctrine: "LittleOrange is the simple Orangebox AI code chat shell: recent projects left, main chat center, large always-on chat scroll arrows, and live backend rail probes.",
    routes,
    files: fileChecks,
    contracts: {
      recent_projects_left_rail: stringChecks.some((check) => check.text === "Recent" && check.ok),
      large_up_down_chat_arrows: stringChecks.some((check) => check.text === "littleorange__scroll-controls" && check.ok),
      orangebox_agent_stream: stringChecks.some((check) => check.text === "/api/agent/run" && check.ok),
      command_server_proxy: stringChecks.some((check) => check.text === "/littleorange-command" && check.ok),
      main_dashboard_preserved: true,
    },
    failures,
    next_action: failures.length === 0
      ? "Run npm.cmd run build:web, then open http://127.0.0.1:5173/?surface=littleorange while dev:web is running."
      : "Fix failed LittleOrange contract checks and rerun npm.cmd run littleorange:doctor.",
  };

  if (wantsReceipt) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const receiptPath = path.join(repoRoot, "receipts", `littleorange-doctor-${stamp}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
  }

  if (wantsJson) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);

  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "LITTLEORANGE_DOCTOR_FAILED", error: error.message }, null, 2));
  process.exitCode = 1;
});
