import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const departments = [
  ["AE0", "Factory", "orchestrate mission graph, routing, receipts, and escalation law"],
  ["AE1", "Product", "define user value, scope, acceptance criteria, and workflow clarity"],
  ["AE2", "Research", "ground decisions in docs, trends, prior evolution reports, and living wiki"],
  ["AE3", "Design", "raise UX, motion, layout, accessibility, and visual proof standards"],
  ["AE4", "Marketing", "shape positioning, onboarding, conversion, and launch voice"],
  ["AE5", "Sales", "clarify offer, pricing path, proof of value, and buyer workflow"],
  ["AE6", "Code", "implement safely, test, refactor, and keep project structure clean"],
  ["AE7", "Review", "adversarial review, LakeStrike synthesis, ship/no-ship judgment"],
  ["AE8", "Launch", "prepare deploy, smoke tests, release receipts, and rollback path"],
  ["AE9", "Legal", "license, privacy, claims, terms, and compliance review"],
  ["AE10", "Ops", "machine health, routing, memory bus, cost/load, and rollback"],
  ["AE11", "Security", "secrets, permissions, supply chain, network gates, and destructive-action guardrails"],
  ["AE12", "Data", "schemas, analytics, event contracts, migrations, and retention"],
  ["AE13", "Automation", "n8n, job queues, idempotence, retries, and human approval lines"],
  ["AE14", "Bench", "benchmarks, visual proof, drift checks, failure patterns, and receipts"]
];

function arg(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safe(value) {
  return String(value || "")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[redacted-github-pat]")
    .replace(/ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]")
    .replace(/vcp_[A-Za-z0-9_]{20,}/g, "[redacted-vercel-token]")
    .replace(/vck_[A-Za-z0-9_]{20,}/g, "[redacted-vercel-token]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[redacted-api-key]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function walk(root, limit = 1400) {
  const skip = new Set(["node_modules", ".git", "target", "dist", "exports", ".turbo", ".next"]);
  const files = [];
  async function visit(dir) {
    if (files.length >= limit) return;
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (skip.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) {
        const stat = await fs.stat(full).catch(() => null);
        files.push({
          path: full,
          rel: path.relative(root, full),
          ext: path.extname(entry.name).toLowerCase() || "[none]",
          size: stat?.size || 0
        });
      }
    }
  }
  await visit(root);
  return files;
}

async function latestFiles(dir, count = 8) {
  let entries = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const rows = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const full = path.join(dir, entry.name);
    const stat = await fs.stat(full).catch(() => null);
    if (stat) rows.push({ name: entry.name, path: full, size: stat.size, mtime: stat.mtime.toISOString() });
  }
  return rows.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, count);
}

async function runCheck(projectRoot) {
  if (!(await exists(path.join(projectRoot, "package.json")))) {
    return { status: "MISSING_RUNTIME", detail: "package.json not found" };
  }
  try {
    const command = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "npm";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm.cmd run check"] : ["run", "check"];
    const result = await execFileAsync(command, args, {
      cwd: projectRoot,
      timeout: 180000,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 3
    });
    return { status: "VERIFIED", stdout: safe(result.stdout).slice(-2400), stderr: safe(result.stderr).slice(-1200) };
  } catch (error) {
    return {
      status: "FAILED",
      stdout: safe(error.stdout || "").slice(-2400),
      stderr: safe(error.stderr || error.message || "").slice(-1600)
    };
  }
}

function countsByExt(files) {
  const counts = new Map();
  for (const file of files) counts.set(file.ext, (counts.get(file.ext) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
}

function sectionForDepartment(id, name, use, evidence) {
  const checksOk = evidence.check.status === "VERIFIED";
  const proofOk = evidence.latestProof.length > 0;
  const optimizerOk = evidence.optimizerStatus !== "missing";
  const base = {
    AE0: ["Make the persistent project-thread the top command layer.", "Keep Operator Console as the action selector beneath the thread.", "Every job needs receipt path and rollback note."],
    AE1: ["Reduce first-screen decisions to outcome, project position, brain, and run mode.", "Make each mission produce acceptance criteria before execution."],
    AE2: ["Compile RECALL, MEMORYWIKI, evolution reports, and latest receipts into a small primer.", "Never send full history by default; send current position plus recent slice."],
    AE3: ["Keep diagnostics collapsed.", "Add visual proof thumbnails beside decisions.", "Make the top layer feel like a cockpit, not a server monitor."],
    AE4: ["Position OrangeBOX as a mission command system, not another AI chat UI.", "Onboarding should show one successful Codexa-powered outcome in under five minutes."],
    AE5: ["Package buyer value around saved token burn, faster builds, and proof receipts.", "Future $1k offer needs installer, health check, and supportable defaults."],
    AE6: ["Build project-thread endpoints and model-swap prompt packets.", "Run checks on Codexa before local report.", "Keep app dependency-free until it needs a real runtime."],
    AE7: ["Reject fake multi-agent claims.", "Ship only if a screenshot, command result, or receipt proves the claim."],
    AE8: ["Codexa must auto-start command rail, wiki, Open WebUI, n8n, and health pages.", "Release path needs one-click installer plus rollback pack."],
    AE9: ["Keep provider tokens out of files.", "Subscription limits must be UNKNOWN unless proven by official/provider-visible counters."],
    AE10: ["Use the Optimization Governor for workload admission.", "Cockpit never runs heavy builds.", "Codexa runs heavy work with fresh samples."],
    AE11: ["Keep full-access command rail token-gated and cockpit-scoped.", "Approvals required for deploy, push, DB writes, destructive commands, payment/customer actions."],
    AE12: ["Store thread history as append-only text plus compact JSON position.", "Treat receipts and proofs as queryable project facts."],
    AE13: ["Automations must be idempotent and capped.", "Use shared job packets for Codexa execution and resume after reboot."],
    AE14: ["Bench before optimization claims.", "Track cockpit vs Codexa speed delta and visual proof status on every major run."]
  };
  return {
    id,
    name,
    use,
    status: checksOk || ["AE0", "AE1", "AE2", "AE3", "AE10", "AE14"].includes(id) ? "ACTIONABLE" : "NEEDS_EVIDENCE",
    recommendations: base[id] || ["No recommendation generated."],
    evidence: {
      check: evidence.check.status,
      proof: proofOk ? "present" : "missing",
      optimizer: optimizerOk ? evidence.optimizerStatus : "missing"
    }
  };
}

const projectRoot = path.resolve(arg("project", process.cwd()));
const orangeRoot = path.resolve(arg("orange-root", "C:/AtomEons/aeskills/orangebox"));
const outDir = path.join(orangeRoot, "department-briefs", "all-departments");
await fs.mkdir(outDir, { recursive: true });

const files = await walk(projectRoot);
const packageJson = await fs.readFile(path.join(projectRoot, "package.json"), "utf8").then(JSON.parse).catch(() => null);
const check = await runCheck(projectRoot);
const latestProof = await latestFiles(path.join(orangeRoot, "proof"), 6);
const latestReceipts = await latestFiles(path.join(orangeRoot, "receipts"), 8);
const latestBenchmarks = await latestFiles(path.join(orangeRoot, "benchmarks"), 8);
const optimizer = await fs.readFile(path.join(orangeRoot, "optimizer", "latest-optimizer.json"), "utf8").then(JSON.parse).catch(() => null);
const recallExists = await exists(path.join(orangeRoot, "RECALL.md"));
const memoryExists = await exists(path.join(orangeRoot, "MEMORYWIKI.html"));
const evidence = {
  check,
  latestProof,
  latestReceipts,
  latestBenchmarks,
  optimizerStatus: optimizer?.status || "missing"
};
const departmentResults = departments.map(([id, name, use]) => sectionForDepartment(id, name, use, evidence));
const generatedAt = new Date().toISOString();
const id = `${stamp()}-orangebox-all-departments`;
const jsonPath = path.join(outDir, `${id}.json`);
const mdPath = path.join(outDir, `${id}.md`);
const summary = {
  status: check.status === "VERIFIED" ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
  generatedAt,
  projectRoot,
  orangeRoot,
  fileCount: files.length,
  topExtensions: countsByExt(files),
  packageScripts: packageJson?.scripts || {},
  memory: { recallExists, memoryExists },
  optimizer: optimizer ? {
    status: optimizer.status,
    label: optimizer.label,
    concurrency: optimizer.concurrency,
    network: optimizer.network
  } : null,
  check,
  latestProof,
  latestReceipts,
  latestBenchmarks,
  departments: departmentResults
};

const md = [
  `# AE0-AE14 All Departments Project Pass`,
  ``,
  `Generated: ${generatedAt}`,
  `Project: ${projectRoot}`,
  `Status: ${summary.status}`,
  ``,
  `## Evidence`,
  ``,
  `- File count sampled: ${files.length}`,
  `- Top extensions: ${summary.topExtensions.map(([ext, count]) => `${ext}=${count}`).join(", ") || "none"}`,
  `- npm check: ${check.status}`,
  `- Latest proof: ${latestProof[0]?.name || "missing"}`,
  `- Optimizer: ${optimizer?.label || "missing"}`,
  `- Memory: RECALL.md=${recallExists ? "yes" : "no"}, MEMORYWIKI.html=${memoryExists ? "yes" : "no"}`,
  ``,
  `## Department Work Orders`,
  ``,
  ...departmentResults.flatMap((department) => [
    `### ${department.id} ${department.name}`,
    ``,
    `Role: ${department.use}`,
    `Status: ${department.status}`,
    ``,
    `Recommendations:`,
    ...department.recommendations.map((item) => `- ${item}`),
    ``,
    `Evidence: check=${department.evidence.check}, proof=${department.evidence.proof}, optimizer=${department.evidence.optimizer}`,
    ``
  ]),
  `## Next Command`,
  ``,
  `Build the persistent project-thread top layer: append-only full history on disk, compact current-position packet by default, model swap between Opus 4.7 max and Codex/GPT-5.5, and Codexa execution for heavy work.`,
  ``
].join("\n");

await fs.writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");
await fs.writeFile(mdPath, md, "utf8");

console.log(JSON.stringify({ status: summary.status, generatedAt, mdPath, jsonPath, fileCount: files.length, check: check.status }, null, 2));
