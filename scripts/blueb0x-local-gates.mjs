import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const receiptsRoot = path.join(orangeRoot, "receipts");
const gatesRoot = path.join(orangeRoot, "readiness");

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

async function runNodeScript(name, script, timeout = 180000) {
  const started = Date.now();
  try {
    const out = await execFileAsync(process.execPath, [path.join(appRoot, "scripts", script)], {
      cwd: appRoot,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, ORANGEBOX_ROOT: orangeRoot }
    });
    let parsed = null;
    try { parsed = JSON.parse(out.stdout); } catch {}
    return {
      name,
      status: parsed?.status || "VERIFIED",
      ms: Date.now() - started,
      stdout: out.stdout.slice(-4000),
      stderr: out.stderr.slice(-2000),
      parsed
    };
  } catch (error) {
    return {
      name,
      status: "FAILED",
      ms: Date.now() - started,
      stdout: String(error.stdout || "").slice(-4000),
      stderr: String(error.stderr || error.message).slice(-4000),
      parsed: null
    };
  }
}

function renderMarkdown(report) {
  return [
    "# BLUEB0X Local Gates",
    "",
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    "",
    "## Gates",
    "",
    ...report.gates.map((gate) => `- ${gate.status}: ${gate.name} / ${gate.ms}ms`),
    "",
    "## Evidence",
    "",
    ...report.gates.map((gate) => {
      const receipt = gate.parsed?.receiptPath || gate.parsed?.jsonPath || "see stdout";
      return `- ${gate.name}: ${receipt}`;
    }),
    "",
    "## Known Limits",
    "",
    "- This is local/cockpit readiness. It does not prove external Mirage OAuth mounts or full Checkmate third-party runtimes.",
    "- It does not mutate Codexa.",
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
  const gates = [];
  gates.push(await runNodeScript("readiness", "blueb0x-readiness-audit.mjs", 120000));
  gates.push(await runNodeScript("visual-proof-readiness", "blueb0x-visual-proof-readiness.mjs", 180000));
  gates.push(await runNodeScript("live-smoke", "blueb0x-live-smoke.mjs", 120000));
  gates.push(await runNodeScript("tomorrow-brief", "blueb0x-tomorrow-brief.mjs", 120000));
  gates.push(await runNodeScript("progress-report", "blueb0x-progress-report-gate.mjs", 120000));
  gates.push(await runNodeScript("dag-runner", "blueb0x-dag-runner-gate.mjs", 120000));
  gates.push(await runNodeScript("continuity", "blueb0x-continuity-packet.mjs", 120000));
  const hardFailures = gates.filter((gate) => gate.status === "FAILED");
  const status = hardFailures.length ? "FAILED" : "VERIFIED";
  const jsonPath = path.join(gatesRoot, `blueb0x-local-gates-${runStamp}.json`);
  const receiptPath = path.join(receiptsRoot, `blueb0x-local-gates-${runStamp}.md`);
  const report = {
    status,
    generatedAt,
    gates,
    jsonPath,
    receiptPath
  };
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(receiptPath, renderMarkdown(report));
  console.log(JSON.stringify({
    status,
    gates: gates.map((gate) => ({ name: gate.name, status: gate.status, ms: gate.ms })),
    jsonPath,
    receiptPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
