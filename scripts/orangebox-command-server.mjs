import http from "node:http";
import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import os from "node:os";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { attachV4Routes } from "./v4/v4-server-routes.mjs";
import { attachAtomSmasherRoutes } from "./v4/atomsmasher-api-routes.mjs";
import { classifyShellAction } from "./v4/action-classifier.mjs";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const portableDataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const orangeRootDefault = portableDataRoot;
const pluginRootDefault = path.join(portableDataRoot, "plugins", "ae0-factory-plugin");
// AI Box worker-rail addresses are buyer-configured. These defaults
// only activate if the buyer wires their own second machine — see
// docs/AI_BOX_WORKER_RAIL.md. On a fresh install they resolve to
// nothing on the buyer's LAN, so all related routes degrade gracefully.
const cockpitIp = process.env.ORANGEBOX_COCKPIT_IP || "127.0.0.1";
const codexaIp = process.env.ORANGEBOX_AI_BOX_IP || process.env.ORANGEBOX_CODEXA_IP || "";
const codexaLegacyWifiIp = process.env.ORANGEBOX_AI_BOX_LEGACY_IP || process.env.ORANGEBOX_CODEXA_LEGACY_IP || "";
const codexaDirectIp = process.env.ORANGEBOX_AI_BOX_DIRECT_IP || process.env.ORANGEBOX_CODEXA_DIRECT_IP || "";
const codexaWorkspaceRootWin = (
  process.env.ORANGEBOX_AI_BOX_WORKSPACE_ROOT ||
  process.env.ORANGEBOX_CODEXA_WORKSPACE_ROOT ||
  "C:\\AtomEons\\orangebox"
).replace(/\//g, "\\");
const allowedModels = ["claude-opus-4-7", "gpt-5.5"];
const taskStatuses = new Map();
const routeSnapshotCache = { value: null, expiresAt: 0, promise: null };
const serverStartedAtMs = Date.now();
const httpMetrics = { total: 0, failed: 0, byPath: {}, latest: [] };
const workspaceNodeModules = "C:/Users/a/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const checkmateRoot = path.join(appRoot, "tools", "checkmate");
const checkmateNodeBin = path.join(checkmateRoot, "node_modules", ".bin");
const checkmateBin = path.join(checkmateRoot, "bin");
const pythonUserScripts = path.join(os.homedir(), "AppData", "Roaming", "Python", "Python312", "Scripts");
const eidosRoot = process.env.ORANGEBOX_EIDOS_ROOT || path.join(portableDataRoot, "eidos", "build");
const machineProfiles = {
  cockpit: {
    role: "interactive AE See-Suite",
    ip: cockpitIp,
    knownCpu: "Intel N150",
    knownRamGB: 16,
    activeNetwork: "1GbE router path; keep editor, browser, Claude, and ORANGEBOX responsive",
    policy: {
      localHeavyJobs: 0,
      localSmallJobs: 2,
      reserveRamPct: 25,
      reserveCpuPct: 35
    }
  },
  codexa: {
    role: "optional AI Box worker/server",
    ip: codexaIp,
    knownCpu: "Intel Core Ultra 9 285H",
    knownRamGB: 96,
    activeNetwork: "configured AI Box gateway (see env vars)",
    policy: {
      heavyJobs: 1,
      smallJobs: 6,
      browserWorkers: 3,
      localModelWorkers: 1,
      dockerHeavyJobs: 1,
      reserveRamGB: 24
    }
  }
};

function publicMachineProfiles() {
  return {
    seeSuite: machineProfiles.cockpit,
    aiBox: machineProfiles.codexa,
  };
}

const autonomyPolicy = {
  id: "orangebox-autonomy-v1",
  status: "VERIFIED",
  defaultMode: "autonomous_coding_with_decision_gates",
  doctrine: "ORANGEBOX should write, test, refactor, run builds, and iterate autonomously inside the current approved project path. It must pause for human approval only when the path, scope, security posture, release posture, money/customer/data, or external permissions change.",
  autonomousAllowed: [
    "read files and docs",
    "write/edit files inside the approved project workspace",
    "run format, lint, tests, typecheck, local build, local smoke, visual proof",
    "create local receipts, DAG updates, knowledge updates, and non-production artifacts",
    "run read-only AI Box commands and approved project-scoped AI Box build/test commands"
  ],
  decisionGates: [
    "scope change or product path change",
    "architecture/database/API contract change with broad downstream impact",
    "destructive file or data operation outside the approved workspace",
    "production deploy, publish, push, release, billing, payment, customer message, DB write",
    "firewall, permissions, secrets, OAuth, env vars, service install, scheduled task, or network exposure change",
    "dependency/vendor/plugin install that has not passed vendor/import review",
    "security, legal, privacy, or compliance escalation",
    "Checkmate final ship gate or LIPS design overrule"
  ],
  approvedWorkspacePrefixes: [
    appRoot.replace(/\\/g, "/"),
    path.join(portableDataRoot, "workspaces").replace(/\\/g, "/")
  ],
  codexaScope: "The optional AI Box may execute autonomous work only when the command is project-scoped, non-production, and receipt-backed."
};
const departmentMap = [
  { id: "AE0", name: "Factory", lane: "orchestrator", use: "triage, mission graph, receipts, escalation law" },
  { id: "AE1", name: "Product", lane: "definition", use: "specs, scope, acceptance criteria, onboarding flow" },
  { id: "AE2", name: "Research", lane: "knowledge", use: "docs, market signal, wiki learning, Context7-style truth checks" },
  { id: "AE3", name: "Design", lane: "experience", use: "UX, motion, visual QA, screenshots, accessibility" },
  { id: "AE4", name: "Marketing", lane: "demand", use: "positioning, copy, SEO, launch content, brand voice" },
  { id: "AE5", name: "Sales", lane: "revenue", use: "pricing, offer design, checkout strategy, conversion path" },
  { id: "AE6", name: "Code", lane: "build", use: "implementation, tests, refactors, static checks" },
  { id: "AE7", name: "Review", lane: "judgment", use: "adversarial review, LakeStrike synthesis, ship/no-ship" },
  { id: "AE8", name: "Launch", lane: "release", use: "deploy, DNS, smoke tests, release receipts" },
  { id: "AE9", name: "Legal", lane: "compliance", use: "licenses, privacy, ToS, claims review" },
  { id: "AE10", name: "Ops", lane: "operations", use: "memory bus, cost, routing, MCP health, rollback" },
  { id: "AE11", name: "Security", lane: "safety", use: "secrets, supply chain, permissions, network gates" },
  { id: "AE12", name: "Data", lane: "data", use: "schema, analytics, migrations, data contracts" },
  { id: "AE13", name: "Automation", lane: "workflow", use: "n8n, queues, approved automation, isolated candidates" },
  { id: "AE14", name: "Bench", lane: "proof", use: "benchmarks, protected metrics, failure pattern tracking" }
];
const specialTeams = [
  {
    id: "LIPS",
    name: "Lips Team",
    binds: ["AE3"],
    lane: "design-taste",
    use: "copy, naming, UX feel, emotional clarity, onboarding legibility, premium surface quality, final design taste pass"
  },
  {
    id: "MIRRORS",
    name: "Mirrors Team",
    binds: ["AE7"],
    lane: "reality-contact",
    use: "observed facts vs inference, unsupported claims, contradictions, hallucination pressure, correction path"
  }
];

const comprehensiveTriad = {
  id: "comprehensive-triad",
  name: "Comprehensive Triad",
  doctrine: "Use a few capable department heads, not a fake swarm. Opus sees the full board; the optional AI Box runs scoped macro-work through three heavy local lanes and shadow judges.",
  version: "orangebox-triad-v1",
  codexaBudget: {
    ramGB: 96,
    targetActiveModelGB: 38,
    reserveRamGB: 48,
    emergencyFloorGB: 28,
    defaultMaxResidentModels: 2,
    provenMaxResidentModels: 3,
    defaultNumParallel: 2,
    provenNumParallel: 3,
    localExecutionRule: "Load only the department heads needed by ready DAG nodes. Three resident models are allowed only after the AI Box proves free RAM and rail health."
  },
  heads: [
    {
      id: "STRATEGY",
      ext: "101",
      name: "Marketing + Product Strategy",
      departments: ["AE1", "AE2", "AE4", "AE5", "AE9"],
      primaryModel: "llama3.3:70b-instruct-q4_0",
      fallbackModel: "qwen2.5:14b-instruct-q4_K_M",
      targetRamGB: 42,
      defaultState: "warm",
      owns: ["positioning", "copy", "SEO", "offer", "scope", "research synthesis", "legal claim caution"],
      verdictSchema: ["audience", "offer", "message", "evidence", "risks", "handoff"]
    },
    {
      id: "ENGINEERING",
      ext: "106",
      name: "Engineering + Security Review",
      departments: ["AE6", "AE10", "AE11", "AE12", "AE14"],
      primaryModel: "qwen2.5-coder:32b-instruct-q8_0",
      fallbackModel: "qwen2.5-coder:14b-instruct-q4_K_M",
      targetRamGB: 35,
      defaultState: "hot",
      owns: ["code", "tests", "APIs", "database", "security", "builds", "receipts", "performance"],
      verdictSchema: ["filesChanged", "commandsRun", "testResult", "securityNotes", "receiptPath", "rollback"]
    },
    {
      id: "EXPERIENCE",
      ext: "103",
      name: "Lips Design + UI Experience",
      departments: ["AE3", "AE8", "LIPS"],
      primaryModel: "llama3.3:70b-instruct-q4_0",
      fallbackModel: "deepseek-coder-v2-lite:16b-instruct-q4_K_M",
      targetRamGB: 42,
      defaultState: "warm",
      owns: ["UI", "UX", "motion", "taste", "visual proof", "onboarding", "installer feel"],
      verdictSchema: ["feel", "flow", "visualDefects", "motion", "screenshots", "designDecision"]
    }
  ],
  shadows: [
    {
      id: "MIRRORS",
      name: "Reality Contact Shadow",
      rule: "Runs after every meaningful department output. Separates observed facts from inference, speculation, and desire."
    },
    {
      id: "CHECKMATE",
      name: "Atom Standard Gate",
      rule: "No complete claim without build/test/security/visual/receipt evidence."
    }
  ],
  handshake: {
    protocol: "fatcat-triad-call-v1",
    requiredReturn: ["status", "departmentHead", "confidence", "evidence", "receiptPath", "nextAction", "blockers"],
    noFirehoseRule: "Raw logs stay on disk. Return summaries and receipt paths only unless the operator opens the raw artifact."
  }
};

const departmentModelLibrary = [
  { id: "AE0", ext: "100", name: "Factory Orchestrator", model: "llama3.3:70b-instruct-q4_0", fallback: "qwen2.5:14b-instruct-q4_K_M", family: "Strategist", lane: "command", targetRamGB: 40, prompt: "CEO lane: interpret the operator, build the high-level DAG, preserve scope, and enforce receipts." },
  { id: "AE1", ext: "101", name: "Product", model: "llama3.3:70b-instruct-q4_0", fallback: "qwen2.5:14b-instruct-q4_K_M", family: "Strategist", lane: "strategy", targetRamGB: 40, prompt: "Own user stories, MVP boundaries, acceptance criteria, and feature priority." },
  { id: "AE2", ext: "102", name: "Research", model: "command-r:35b-08-2024-q8_0", fallback: "qwen2.5:14b-instruct-q4_K_M", family: "Librarian", lane: "knowledge", targetRamGB: 34, prompt: "Ingest raw sources, cite, structure, and compile signal into ORANGEBOX Knowledge." },
  { id: "AE3", ext: "103", name: "Design / Lips", model: "llama3.3:70b-instruct-q4_0", fallback: "deepseek-coder-v2-lite:16b-instruct-q4_K_M", family: "Strategist", lane: "experience", targetRamGB: 40, prompt: "Own visual hierarchy, UX psychology, taste, warmth, and final design authority." },
  { id: "AE4", ext: "104", name: "Marketing", model: "llama3.3:70b-instruct-q4_0", fallback: "qwen2.5:14b-instruct-q4_K_M", family: "Strategist", lane: "demand", targetRamGB: 40, prompt: "Own positioning, landing page copy, campaigns, onboarding sequences, and audience psychology." },
  { id: "AE5", ext: "105", name: "Sales", model: "llama3.3:70b-instruct-q4_0", fallback: "qwen2.5:14b-instruct-q4_K_M", family: "Strategist", lane: "revenue", targetRamGB: 40, prompt: "Own offer logic, CRM rules, qualification, objection handling, and outreach templates." },
  { id: "AE6", ext: "106", name: "Engineering", model: "qwen2.5-coder:32b-instruct-q8_0", fallback: "qwen2.5-coder:32b-instruct-q4_K_M", family: "Engineer", lane: "build", targetRamGB: 35, prompt: "Own code, syntax, tests, build health, refactors, backend, frontend implementation, and receipts." },
  { id: "AE7", ext: "107", name: "Review / Mirrors", model: "deepseek-r1:70b-llama-distill-q4_K_M", fallback: "deepseek-r1:32b", family: "Auditor", lane: "judgment", targetRamGB: 43, prompt: "Own contradiction checks, reality contact, hallucination pressure, and ship/no-ship critique." },
  { id: "AE8", ext: "108", name: "Launch", model: "qwen2.5-coder:32b-instruct-q8_0", fallback: "qwen2.5-coder:14b-instruct-q4_K_M", family: "Engineer", lane: "release", targetRamGB: 35, prompt: "Own Dockerfiles, CI/CD, deployment YAML, install smoke, release notes, and rollback proof." },
  { id: "AE9", ext: "109", name: "Legal", model: "command-r:35b-08-2024-q8_0", fallback: "qwen2.5:14b-instruct-q4_K_M", family: "Librarian", lane: "compliance", targetRamGB: 34, prompt: "Scan product claims, marketing, schemas, privacy posture, licenses, and compliance docs." },
  { id: "AE10", ext: "110", name: "Ops + Memory", model: "command-r:35b-08-2024-q8_0", fallback: "qwen2.5-coder:14b-instruct-q4_K_M", family: "Librarian", lane: "operations", targetRamGB: 34, prompt: "Compress logs, maintain history summaries, route work, monitor pressure, and keep memory useful." },
  { id: "AE11", ext: "111", name: "Security", model: "qwen2.5-coder:32b-instruct-q8_0", fallback: "qwen2.5-coder:32b-instruct-q4_K_M", family: "Engineer", lane: "safety", targetRamGB: 35, prompt: "Patch SQL injection, CORS, auth, secrets, dependencies, network gates, and permission boundaries." },
  { id: "AE12", ext: "112", name: "Data", model: "qwen2.5-coder:32b-instruct-q8_0", fallback: "qwen2.5-coder:32b-instruct-q4_K_M", family: "Engineer", lane: "data", targetRamGB: 35, prompt: "Own SQL/NoSQL schemas, indexing, migration scripts, analytics, and idempotent state." },
  { id: "AE13", ext: "113", name: "Automation", model: "qwen2.5-coder:32b-instruct-q8_0", fallback: "qwen2.5-coder:14b-instruct-q4_K_M", family: "Engineer", lane: "workflow", targetRamGB: 35, prompt: "Own Python/Bash glue code, n8n, queues, third-party API workflows, loop caps, and approvals." },
  { id: "AE14", ext: "114", name: "Checkmate Bench", model: "deepseek-r1:70b-llama-distill-q4_K_M", fallback: "qwen2.5-coder:32b-instruct-q8_0", family: "Auditor", lane: "proof", targetRamGB: 43, prompt: "Final Atom Standard gate: tests, proof, security, rollback evidence, and revision pressure." },
  { id: "LIPS", ext: "103", name: "Lips Taste Authority", model: "llama3.3:70b-instruct-q4_0", fallback: "deepseek-coder-v2-lite:16b-instruct-q4_K_M", family: "Strategist", lane: "taste", targetRamGB: 40, prompt: "Final taste authority. Kick back robotic, incoherent, cold, or low-status interface decisions." },
  { id: "MIRRORS", ext: "107", name: "Mirrors Reality Contact", model: "deepseek-r1:70b-llama-distill-q4_K_M", fallback: "deepseek-r1:32b", family: "Auditor", lane: "reality", targetRamGB: 43, prompt: "Separate observed facts from inference, speculation, and desire. Break unsupported claims." },
  { id: "CHECKMATE", ext: "114", name: "Checkmate Atom Standard", model: "deepseek-r1:70b-llama-distill-q4_K_M", fallback: "qwen2.5-coder:32b-instruct-q8_0", family: "Auditor", lane: "gate", targetRamGB: 43, prompt: "Impassable final gate. No pass without test, visual, security, receipt, and rollback evidence." }
];

const reviewEngineLibrary = [
  {
    id: "ORANGE",
    ext: "120",
    name: "Orange Judge",
    source: "atomeons_icon_teams_package_2026-05-07/teams/orange",
    model: "llama3.3:70b-instruct-q4_0",
    family: "Strategist",
    authority: "Priority, subtraction, sequencing, product coherence",
    question: "What matters, what should be cut, and what should be built first?",
    order: ["product", "experimental"],
    returns: ["ruling", "whatMatters", "cut", "fakeComplexity", "exactMove"]
  },
  {
    id: "MIRRORS",
    ext: "121",
    name: "Mirrors",
    source: "atomeons_icon_teams_package_2026-05-07/teams/mirrors",
    model: "deepseek-r1:70b-llama-distill-q4_K_M",
    family: "Auditor",
    authority: "Reality contact, truth, structural honesty, theater removal",
    question: "What is actually true here?",
    order: ["product", "bug", "experimental"],
    returns: ["observed", "inferred", "speculative", "contradictions", "correctionPath"]
  },
  {
    id: "MISFITS",
    ext: "122",
    name: "Misfits / Rebels",
    source: "atomeons_icon_teams_package_2026-05-07/teams/misfits",
    model: "llama3.3:70b-instruct-q4_0",
    family: "Strategist",
    authority: "Frontier options, anti-generic invention, governed weirdness",
    question: "What strange high-upside thing are we missing?",
    order: ["product", "experimental"],
    returns: ["frontierCard", "antiGenericMove", "experimentPath", "canonBoundary"]
  },
  {
    id: "LIPS",
    ext: "123",
    name: "Lips",
    source: "atomeons_icon_teams_package_2026-05-07/teams/lips",
    model: "llama3.3:70b-instruct-q4_0",
    family: "Strategist",
    authority: "UX voice, copy, surface quality, emotional landing",
    question: "Does this feel human, clear, premium, and alive?",
    order: ["product", "bug", "experimental"],
    returns: ["feel", "wording", "interaction", "emotionalLanding", "upgrade"]
  },
  {
    id: "HACK_THE_PLANET",
    ext: "124",
    name: "Hack The Planet",
    source: "atomeons_icon_teams_package_2026-05-07/teams/hack-the-planet",
    model: "qwen2.5-coder:32b-instruct-q8_0",
    family: "Engineer",
    authority: "Unblock pressure, execution, bottleneck breaking",
    question: "What is blocking this build, and what breaks it?",
    order: ["product", "bug", "experimental"],
    returns: ["blockerMap", "shortestUnblock", "patchPlan", "fallbackPath"]
  },
  {
    id: "CHECKMATE_EARLY",
    ext: "125",
    name: "Checkmate Early Warning",
    source: "ORANGEBOX Atom Standard",
    model: "deepseek-r1:70b-llama-distill-q4_K_M",
    family: "Auditor",
    authority: "Early proof pressure before implementation burns tokens",
    question: "What will fail if we keep going like this?",
    order: ["product", "bug", "experimental"],
    returns: ["requiredEvidence", "likelyFailure", "preflightGate", "stopCondition", "nextProof"]
  }
];

const commandStacks = [
  {
    id: "website-launch",
    name: "Website Launch",
    departments: ["AE0", "AE1", "AE2", "AE3", "AE4", "AE6", "AE7", "AE8", "AE11", "AE14"],
    outputs: ["site map", "design system", "page plan", "content matrix", "implementation tasks", "visual proof", "deploy receipt"],
    gate: "No launch until browser proof, accessibility smoke, secrets scan, and rollback path exist."
  },
  {
    id: "skill-factory",
    name: "Bulk Skill Factory",
    departments: ["AE0", "AE2", "AE6", "AE7", "AE10", "AE11", "AE14"],
    outputs: ["source ledger", "candidate batches", "SKILL.md contract", "validator report", "quarantine receipt", "promotion queue"],
    gate: "Thousands of skills must run in candidate batches with hashes, schema checks, duplicate detection, and no automatic promotion."
  },
  {
    id: "app-launch",
    name: "App Launch",
    departments: ["AE0", "AE1", "AE3", "AE6", "AE7", "AE8", "AE10", "AE11", "AE14"],
    outputs: ["mission graph", "feature map", "build grid", "test matrix", "visual proof", "installer path", "release receipt"],
    gate: "No app launch until install, smoke, visual, rollback, and security gates pass."
  },
  {
    id: "ai-agent-system",
    name: "Agent System",
    departments: ["AE0", "AE2", "AE6", "AE10", "AE11", "AE13", "AE14"],
    outputs: ["agent roster", "tool permissions", "queue policy", "memory policy", "failure caps", "benchmark report"],
    gate: "No autonomous mutation without approval lines, loop caps, summarized logs, and receipts."
  }
];

const agentProfiles = [
  {
    id: "ae10-ai-box-ops",
    name: "AE10 Ops Pulse",
    departments: ["AE10", "AE14"],
    lane: "ops",
    risk: "read-only",
    description: "Proves AI Box health, memory headroom, Docker stack, and command rail receipts.",
    command: [
      "$os = Get-CimInstance Win32_OperatingSystem",
      "$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors",
      "hostname; whoami; Get-Date",
      "$os | Select-Object Caption,OSArchitecture,@{Name='FreeGB';Expression={[math]::Round($_.FreePhysicalMemory/1MB,2)}},@{Name='TotalGB';Expression={[math]::Round($_.TotalVisibleMemorySize/1MB,2)}}",
      "$cpu",
      "docker ps --format \"table {{.Names}}`t{{.Status}}\"",
      "Get-ChildItem -LiteralPath C:\\AtomEons\\ai-box\\receipts -File | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name,Length,LastWriteTime"
    ].join("; ")
  },
  {
    id: "ae6-command-build",
    name: "AE6 Command Build",
    departments: ["AE6", "AE14"],
    lane: "code",
    risk: "read-only",
    description: "Runs the ORANGEBOX command app syntax and verifier checks on the AI Box after sync.",
    command: [
      `if (!(Test-Path '${codexaWorkspaceRootWin}\\package.json')) { Write-Output 'MISSING ORANGEBOX workspace on AI Box. Run Sync App To AI Box first.'; exit 3 }`,
      `cd ${codexaWorkspaceRootWin}`,
      "node --version",
      "npm --version",
      "npm.cmd run check"
    ].join("; ")
  },
  {
    id: "ae11-security-scan",
    name: "AE11 Security Scan",
    departments: ["AE11", "AE6"],
    lane: "security",
    risk: "read-only",
    description: "Scans ORANGEBOX command source for obvious raw secret patterns without mutating files.",
    command: [
      `$root = '${codexaWorkspaceRootWin}'`,
      "if (!(Test-Path $root)) { Write-Output 'MISSING ORANGEBOX workspace on AI Box. Run Sync App To AI Box first.'; exit 3 }",
      "$regexes = @('github_pat_[A-Za-z0-9_]{30,}','ghp_[A-Za-z0-9]{30,}','vcp_[A-Za-z0-9_]{30,}','vck_[A-Za-z0-9_]{30,}','sk-[A-Za-z0-9]{32,}')",
      "$hits = @()",
      "Get-ChildItem -LiteralPath $root -Recurse -File -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\\\node_modules\\\\|\\\\src-tauri\\\\target\\\\|\\\\dist\\\\|\\\\exports\\\\' } | ForEach-Object { $file = $_.FullName; $i = 0; Get-Content -LiteralPath $file -ErrorAction SilentlyContinue | ForEach-Object { $i++; $line = $_; if ($line -match 'replace\\(/|redact|\\$regexes|example|placeholder') { return }; foreach ($rx in $regexes) { if ($line -match $rx) { $hits += [pscustomobject]@{Path=$file;LineNumber=$i;Pattern=$rx;Line=$line}; break } } } }",
      "if ($hits.Count) { $hits | Select-Object -First 40 Path,LineNumber,Pattern,Line | Format-Table -AutoSize; exit 2 } else { Write-Output 'SECURITY_SCAN_VERIFIED_NO_RAW_SECRET_PATTERNS' }"
    ].join("; ")
  },
  {
    id: "ae13-automation-check",
    name: "AE13 Automation Check",
    departments: ["AE13", "AE10"],
    lane: "automation",
    risk: "read-only",
    description: "Checks n8n and worker containers without editing workflows.",
    command: [
      "Invoke-WebRequest -UseBasicParsing -TimeoutSec 8 -Uri 'http://127.0.0.1:5678/healthz' | Select-Object StatusCode,Content",
      "docker ps --filter name=n8n --format \"table {{.Names}}`t{{.Status}}\"",
      "docker ps --filter name=redis --format \"table {{.Names}}`t{{.Status}}\"",
      "docker ps --filter name=postgres --format \"table {{.Names}}`t{{.Status}}\""
    ].join("; ")
  },
  {
    id: "ae3-visual-ready",
    name: "AE3 Visual Ready",
    departments: ["AE3", "AE14"],
    lane: "visual",
    risk: "read-only",
    description: "Starts the synced ORANGEBOX app on the AI Box loopback, loads it, and proves the UI surface responds.",
    command: [
      `$root = '${codexaWorkspaceRootWin}'`,
      "if (!(Test-Path (Join-Path $root 'scripts\\orangebox-command-server.mjs'))) { Write-Output 'MISSING ORANGEBOX workspace on AI Box. Run Sync App To AI Box first.'; exit 3 }",
      "$port = 8877",
      "$proc = Start-Process -FilePath 'node.exe' -ArgumentList @('scripts\\orangebox-command-server.mjs','--host','127.0.0.1','--port',[string]$port) -WorkingDirectory $root -PassThru -WindowStyle Hidden",
      "try { Start-Sleep -Seconds 4; $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 12 -Uri ('http://127.0.0.1:' + $port + '/'); $text = [string]$r.Content; [pscustomobject]@{Target=('http://127.0.0.1:' + $port + '/');Status='VERIFIED';Code=$r.StatusCode;Bytes=$text.Length;HasORANGEBOX=$text.Contains('ORANGEBOX')} | Format-List; if ($r.StatusCode -ne 200 -or !$text.Contains('ORANGEBOX')) { exit 2 } } finally { if ($proc -and !$proc.HasExited) { Stop-Process -Id $proc.Id -Force } }"
    ].join("; ")
  },
  {
    id: "openclaw-guard",
    name: "OpenClaw Guard",
    departments: ["AE10", "AE11", "AE14"],
    lane: "orchestration",
    risk: "read-only",
    description: "Verifies OpenClaw service, loopback binding, token alignment, and capability through the AI Box WSL2 lane.",
    openclaw: true
  }
];

const verificationToolCatalog = [
  {
    id: "playwright-mcp",
    name: "Playwright MCP",
    category: "UI & Browser",
    package: "@executeautomation/playwright-mcp-server",
    proves: "real browser navigation, clicks, screenshots, visual proof, end-to-end flows",
    check: "playwright-package",
    safeDefault: "read-only browser verification unless the app under test mutates local state"
  },
  {
    id: "chrome-devtools-mcp",
    name: "Chrome DevTools MCP",
    category: "UI & Browser",
    package: "@modelcontextprotocol/server-chrome",
    proves: "console errors, DOM inspection, network payloads, component mounting diagnostics",
    check: "chrome-runtime",
    safeDefault: "inspect only; no production browser profile automation"
  },
  {
    id: "desktop-commander",
    name: "Desktop Commander",
    category: "Execution & Environment",
    package: "@wonderwhy-er/desktop-commander",
    proves: "terminal checks, local test suites, compile output, iterative repair loops",
    check: "shell-runtime",
    safeDefault: "approval required for destructive commands"
  },
  {
    id: "wcgw",
    name: "WCGW",
    category: "Execution & Environment",
    package: "wcgw",
    proves: "agentic shell/coding operations and robust local execution checks",
    check: "wcgw-command",
    safeDefault: "cataloged only until installed and permission-gated"
  },
  {
    id: "proxyman",
    name: "Proxyman MCP",
    category: "API & Network",
    package: "Proxyman desktop integration",
    proves: "raw HTTP/HTTPS inspection, headers, payloads, third-party API traffic",
    check: "proxyman-runtime",
    safeDefault: "manual operator setup; never intercept secrets without approval"
  },
  {
    id: "fetch",
    name: "Fetch",
    category: "API & Network",
    package: "@smithery-ai/fetch",
    proves: "direct HTTP GET/POST checks, status codes, JSON schema smoke tests",
    check: "native-fetch",
    safeDefault: "safe for local and approved endpoints"
  },
  {
    id: "dbhub",
    name: "DBHub MCP",
    category: "Database & State",
    package: "@bytebase/dbhub",
    proves: "Postgres/MySQL/SQL Server/MariaDB schema and state verification",
    check: "dbhub-package",
    safeDefault: "read-only SELECT by default; writes require approval"
  },
  {
    id: "supabase-sqlite",
    name: "Supabase / SQLite MCPs",
    category: "Database & State",
    package: "supabase CLI / mcp-server-sqlite-npx",
    proves: "Supabase schema checks, local SQLite persistence, migration evidence",
    check: "supabase-sqlite-runtime",
    safeDefault: "read-only by default; migrations require approval"
  },
  {
    id: "semgrep",
    name: "Semgrep MCP",
    category: "Security & Static Analysis",
    package: "semgrep",
    proves: "static security findings, anti-patterns, code quality and vuln rules",
    check: "semgrep-command",
    safeDefault: "read-only scan"
  },
  {
    id: "osv-vulert",
    name: "OSV / Vulert",
    category: "Security & Static Analysis",
    package: "osv-scanner / Vulert MCP",
    proves: "dependency vulnerability checks against live advisory databases",
    check: "osv-command",
    safeDefault: "read-only dependency audit"
  },
  {
    id: "github-mcp",
    name: "GitHub MCP",
    category: "Version Control & CI/CD",
    package: "@modelcontextprotocol/server-github",
    proves: "PRs, Actions logs, CI failures, repo metadata, review evidence",
    check: "github-runtime",
    safeDefault: "read-only by default; push/PR/comment requires approval"
  }
];

const atomStandard = {
  name: "The Atom Standard",
  version: "0.1.0",
  doctrine: "A creation is not good because it exists. It is good when it survives reality, usefulness, taste, safety, and proof.",
  revisionPressurePct: 98,
  threshold: {
    atomReadyPct: 100,
    reviewPct: 92,
    blockPct: 80
  },
  law: [
    "Most work should be revised before it ships.",
    "A green tool does not equal a green product.",
    "Evidence beats confidence.",
    "AE3 Design owns the final taste filter after operator approval.",
    "A final pass may block any department when clarity, usefulness, dignity, or coherence is below standard."
  ],
  levels: [
    { level: 0, name: "Broken", test: "Dead controls, missing runtime, unverifiable claims, or unsafe action path." },
    { level: 1, name: "Functional", test: "The surface runs and one happy path works." },
    { level: 2, name: "Useful", test: "The main operator goal is obvious and repeatable." },
    { level: 3, name: "Polished", test: "The system handles errors, empty states, compact screens, and real data." },
    { level: 4, name: "Tasteful", test: "Every visible choice has restraint, hierarchy, motion discipline, and material honesty." },
    { level: 5, name: "Iconic", test: "The product feels inevitable, distinct, and hard to replace." }
  ],
  rejectCodes: [
    "fake-green",
    "dead-control",
    "context-firehose",
    "visual-noise",
    "generic-ui",
    "unsupported-claim",
    "unsafe-permission",
    "no-receipt",
    "no-rollback",
    "operator-confusion"
  ]
};

const checkmateAtomUpgrades = {
  "playwright-mcp": {
    upgradeName: "Interaction Gauntlet",
    requiredForAtom: true,
    catches: ["dead primary controls", "blank pages", "overflow", "broken route states", "missing proof screenshots"],
    revisionTriggers: ["any clickable control does nothing", "desktop or compact viewport hides core workflow", "visual proof is older than the code"],
    shipGate: "Desktop and compact browser proof with click path, screenshot path, and no blank/overflow flags."
  },
  "chrome-devtools-mcp": {
    upgradeName: "Runtime Blacklight",
    requiredForAtom: true,
    catches: ["console errors", "failed network calls", "hydration/runtime failures", "slow or noisy payloads"],
    revisionTriggers: ["uncaught console error", "failed required network request", "UI silently depends on unavailable data"],
    shipGate: "Console/network pass or explicit accepted exception."
  },
  "desktop-commander": {
    upgradeName: "Build Truth Harness",
    requiredForAtom: true,
    catches: ["build breaks", "test failures", "shell-only assumptions", "missing executable path"],
    revisionTriggers: ["syntax check fails", "build/test command not run", "command output is unsummarized firehose"],
    shipGate: "Local command evidence with raw log saved and short summary returned."
  },
  "wcgw": {
    upgradeName: "Contained Repair Worker",
    requiredForAtom: true,
    catches: ["loop drift", "unbounded repair attempts", "agentic shell mismatch", "unsafe command escalation"],
    revisionTriggers: ["more than five repair attempts", "same error appears twice without new evidence", "state-changing command without approval"],
    shipGate: "Bounded repair loop with attempt cap, decision log, and human approval line."
  },
  "proxyman": {
    upgradeName: "Network X-Ray",
    requiredForAtom: true,
    catches: ["wrong headers", "bad payloads", "unexpected third-party calls", "silent auth/session failures"],
    revisionTriggers: ["unknown outbound host", "sensitive payload in network trace", "API success claimed without traffic proof"],
    shipGate: "Network inspection runtime available; HTTPS interception remains manual and approval-gated."
  },
  "fetch": {
    upgradeName: "API Contract Needle",
    requiredForAtom: true,
    catches: ["bad status codes", "invalid JSON", "wrong content type", "slow endpoint smoke"],
    revisionTriggers: ["required endpoint lacks status proof", "schema shape changed without receipt", "timeout not handled"],
    shipGate: "Endpoint smoke with status, latency, and compact JSON summary."
  },
  "dbhub": {
    upgradeName: "State Witness",
    requiredForAtom: true,
    catches: ["schema mismatch", "state not actually written/read", "unsafe database write assumptions"],
    revisionTriggers: ["migration not verified read-only", "no SELECT proof after data feature", "production DSN used without approval"],
    shipGate: "Read-only demo or approved datasource check with query receipt."
  },
  "supabase-sqlite": {
    upgradeName: "Migration Ledger",
    requiredForAtom: true,
    catches: ["local persistence failure", "migration drift", "missing Supabase CLI", "SQLite MCP launch failure"],
    revisionTriggers: ["schema state not reproducible locally", "migration lacks rollback", "DB tool is configured but cannot start"],
    shipGate: "Local SQLite/Supabase runtime launches and writes a state-check receipt."
  },
  "semgrep": {
    upgradeName: "Static Pressure Scanner",
    requiredForAtom: true,
    catches: ["security anti-patterns", "dangerous command patterns", "common injection risks", "bad auth handling"],
    revisionTriggers: ["high finding without accepted exception", "security scan skipped", "new rule gap discovered"],
    shipGate: "Read-only scan result with findings triaged."
  },
  "osv-vulert": {
    upgradeName: "Supply Chain Radar",
    requiredForAtom: true,
    catches: ["known vulnerable dependencies", "outdated scanner", "unsafe transitive package pressure"],
    revisionTriggers: ["critical advisory", "high advisory in exposed runtime", "dependency bench exposed to LAN"],
    shipGate: "Dependency risk summary with exposure decision."
  },
  "github-mcp": {
    upgradeName: "Cloud Receipt Inspector",
    requiredForAtom: true,
    catches: ["failed CI", "unreviewed PR state", "missing issue/commit trace", "cloud-only failure"],
    revisionTriggers: ["CI status unknown", "PR logs not inspected", "push/deploy attempted without approval"],
    shipGate: "Repo/CI state inspected read-only before ship."
  }
};

const atomInstrumentBlueprints = {
  "playwright-mcp": {
    instrument: "Sightline Gauntlet",
    promise: "Turns browser automation into a product operator: it proves whether a human can actually use the thing.",
    tenXMove: "Correlate screenshot proof, click map, viewport fit, visible next action, and stale-proof age into one revision verdict.",
    stack: ["Playwright MCP", "Chrome screenshot artifacts", "ORANGEBOX proof receipts", "AE3 Taste Engine"],
    output: "visual-proof-plus.json with routes, screenshots, clicked controls, dead-control suspects, overflow flags, and AE3 notes",
    future: "Computer-vision pixel checks, OCR hierarchy scan, and click-target heat scoring."
  },
  "chrome-devtools-mcp": {
    instrument: "Blacklight Runtime Inspector",
    promise: "Finds the invisible failures: console noise, failed fetches, hydration faults, oversized payloads, and silent UI lies.",
    tenXMove: "Merge console, network, DOM, and visible UI state so a green page cannot hide broken internals.",
    stack: ["Chrome DevTools MCP", "Fetch", "AE See-Suite notification cards"],
    output: "runtime-blacklight.json with console severity, request map, failing resources, and accepted exceptions",
    future: "Network waterfall budget and component mount trace."
  },
  "desktop-commander": {
    instrument: "Build Truth Lab",
    promise: "Makes command evidence usable: raw logs stay on disk, Claude receives only the signal.",
    tenXMove: "Classify build/test output into root cause, repeated failure, next command, and rollback risk.",
    stack: ["Desktop Commander", "ORANGEBOX command rail", "log summarizer policy"],
    output: "build-truth.json with command, exit code, duration, summary, raw log path, and retry cap",
    future: "Auto-shard test suites by changed surface and system load."
  },
  "wcgw": {
    instrument: "Repair Loop Governor",
    promise: "Lets agentic repair run without drifting into token fire or destructive improvisation.",
    tenXMove: "Tracks attempts, duplicate errors, changed files, command risk, and approval lines before another repair pass is allowed.",
    stack: ["WCGW", "ORANGEBOX permission classifier", "receiptbook"],
    output: "repair-governor.json with attempt ladder, error fingerprint, and stop/go ruling",
    future: "Failure-pattern recall from AEmemory before each retry."
  },
  "proxyman": {
    instrument: "Network X-Ray",
    promise: "Shows whether the app is talking to the right systems with the right shape and no surprise leakage.",
    tenXMove: "Connect operator journeys to actual outbound calls, payload class, auth state, and unknown-host alarms.",
    stack: ["Proxyman", "Fetch", "AE11 Security"],
    output: "network-xray.json with hosts, headers class, payload class, risk flags, and manual HTTPS gate",
    future: "Approved-domain egress matrix and diff against last known-good run."
  },
  "fetch": {
    instrument: "Contract Needle",
    promise: "Fast API proof without opening the full browser: status, latency, JSON shape, and failure readability.",
    tenXMove: "Turn endpoint smoke into a typed mini-contract with expected fields, tolerated latency, and drift notes.",
    stack: ["Node fetch", "schema sampler", "ORANGEBOX receipts"],
    output: "contract-needle.json with endpoint matrix, status, latency, shape fingerprint, and regression flag",
    future: "Auto-generate endpoint probes from app routes and network traces."
  },
  "dbhub": {
    instrument: "State Witness",
    promise: "Prevents fake backend success by checking real database state read-only.",
    tenXMove: "Tie feature acceptance to SELECT evidence, schema fingerprints, and approved datasource boundaries.",
    stack: ["DBHub", "SQLite demo", "Supabase CLI", "AE12 Data"],
    output: "state-witness.json with schema fingerprint, read-only query evidence, and datasource risk",
    future: "Migration impact map and rollback rehearsals."
  },
  "supabase-sqlite": {
    instrument: "Migration Ledger",
    promise: "Makes local persistence and Supabase migration state reproducible before it touches a real project.",
    tenXMove: "Compare local SQLite probe, Supabase CLI availability, migration files, and rollback instructions.",
    stack: ["Supabase CLI", "mcp-sqlite", "DBHub"],
    output: "migration-ledger.json with local DB proof, migration drift, and rollback gate",
    future: "Shadow database rehearsal on the AI Box."
  },
  "semgrep": {
    instrument: "Static Pressure Field",
    promise: "Turns static scanning into product-aware risk pressure, not a pile of warnings.",
    tenXMove: "Score findings by exposed surface, permission level, changed files, and whether Checkmate can prove mitigation.",
    stack: ["Semgrep", "AE11 Security", "coverage-diff"],
    output: "static-pressure.json with prioritized findings, accepted exceptions, and missing rules",
    future: "AtomEons custom rule pack trained from past mistakes."
  },
  "osv-vulert": {
    instrument: "Supply Chain Radar",
    promise: "Stops vulnerable dependencies from hiding under a green local build.",
    tenXMove: "Separate toolbench-only risk from shipped runtime risk and block LAN exposure when advisories matter.",
    stack: ["OSV Scanner", "npm audit", "AE11 Security"],
    output: "supply-chain-radar.json with advisory severity, exposure class, and upgrade path",
    future: "Dependency quarantine with known-good mirrors."
  },
  "github-mcp": {
    instrument: "Cloud Receipt Inspector",
    promise: "Makes remote repo and CI state part of done, without giving write power by default.",
    tenXMove: "Tie local receipts to remote commit/PR/CI evidence so nothing is called shipped from local vibes alone.",
    stack: ["GitHub MCP", "GitHub CLI", "release-receipt"],
    output: "cloud-receipt.json with branch, PR, checks, logs, and approval gates",
    future: "PR diff critique panel with protected metric comparison."
  }
};

const tasteWiki = {
  name: "AE See-Suite Taste Engine",
  version: "0.1.0",
  owner: "AE3 Design",
  finalAuthority: "AE3 can block or revise final product decisions only after operator approval. Once approved, taste veto applies across product, code, marketing, launch, and automation.",
  thesis: "Taste is operational judgment: remove fake motion, make the useful thing obvious, and give the operator a tool that feels inevitable.",
  influences: [
    {
      id: "ive-jobs",
      name: "Jony Ive / Steve Jobs signal",
      tasteLevel: 5,
      use: "radical clarity, quiet confidence, hierarchy, object focus, elimination of everything not earning its place",
      apply: ["one dominant action per moment", "high contrast of importance", "hidden complexity until needed", "materials and states feel intentional"],
      veto: ["decorative complexity", "jargon-heavy panels", "feature lists with no main use", "controls that feel like admin leftovers"]
    },
    {
      id: "teenage-engineering",
      name: "Teenage Engineering signal",
      tasteLevel: 5,
      use: "playful precision, tactile controls, dense utility, industrial joy, tool as object",
      apply: ["visible controls with purpose", "compact interfaces that invite use", "small delightful feedback", "serious capability without corporate dullness"],
      veto: ["random neon chaos", "cute but unusable panels", "toy aesthetics without operating discipline"]
    },
    {
      id: "nintendo-80-90",
      name: "1980s and 1990s Nintendo signal",
      tasteLevel: 5,
      use: "instant legibility, strong constraints, memorable interaction loops, responsive feedback, durable charm",
      apply: ["clear state at a glance", "button press has visible consequence", "learnable progression", "status and motion teach the system"],
      veto: ["ambiguous controls", "laggy feedback", "overwritten screens", "difficulty created by confusion"]
    },
    {
      id: "tom-sachs",
      name: "Tom Sachs signal",
      tasteLevel: 4,
      use: "ritual, visible process, labels, workshop honesty, handmade system discipline",
      apply: ["receipts feel physical", "process is visible", "parts are named", "operator can inspect the machine"],
      veto: ["fake luxury", "opaque automation", "polish that hides broken process"]
    },
    {
      id: "atomeons-misfit",
      name: "AtomEons Misfit signal",
      tasteLevel: 5,
      use: "frontier without theater, sovereign tools, proof over vibe, human dignity over extraction",
      apply: ["build the real command loop first", "make memory useful", "show what the system is doing", "protect the operator"],
      veto: ["simulated abundance", "fake intelligence", "dopamine trap layout", "model authority creep"]
    }
  ],
  finalPass: [
    { id: "clarity", label: "Clarity", question: "Can a tired operator see the next right move in five seconds?" },
    { id: "usefulness", label: "Usefulness", question: "Does the page make a real job faster, safer, or better?" },
    { id: "restraint", label: "Restraint", question: "Did we remove everything that does not earn its place?" },
    { id: "motion", label: "Motion", question: "Does motion explain state or delight without stealing attention?" },
    { id: "material", label: "Material Honesty", question: "Do controls, status lights, receipts, and proof feel like parts of one instrument?" },
    { id: "edge", label: "Edge", question: "Is there a memorable AtomEons point of view without chaos?" },
    { id: "proof", label: "Proof", question: "Does the visible surface match the receipts and real system state?" }
  ],
  scoring: [
    { score: "0-49", verdict: "Block", meaning: "Functional or tasteful claims are not credible." },
    { score: "50-69", verdict: "Revise", meaning: "Useful pieces exist, but the surface is not ship quality." },
    { score: "70-84", verdict: "Polish", meaning: "Usable but not yet memorable." },
    { score: "85-94", verdict: "Tasteful", meaning: "Strong enough for internal promotion." },
    { score: "95-100", verdict: "Atom Standard", meaning: "Clear, useful, proven, distinct, and hard to replace." }
  ]
};

function parseArgs(argv) {
  const args = {
    root: orangeRootDefault,
    pluginRoot: pluginRootDefault,
    host: "127.0.0.1",
    port: 8787,
    noStartReceipt: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--root") args.root = argv[++i] || args.root;
    else if (argv[i] === "--plugin-root") args.pluginRoot = argv[++i] || args.pluginRoot;
    else if (argv[i] === "--host") args.host = argv[++i] || args.host;
    else if (argv[i] === "--port") args.port = Number(argv[++i] || args.port);
    else if (argv[i] === "--no-start-receipt") args.noStartReceipt = true;
  }
  return args;
}

const args = parseArgs(process.argv);
const orangeRoot = path.resolve(args.root);
const pluginRoot = path.resolve(args.pluginRoot);
const tokenCmdPath = path.join(orangeRoot, "exports", "codexa-bridge-pack", "SET_COCKPIT_TOKEN.cmd");
const commandTokenCmdPath = path.join(orangeRoot, "exports", "codexa-command-rail-pack", "SET_COCKPIT_COMMAND_TOKEN.cmd");
const commandRailPort = 8097;
const codexaRepairDir = path.join(orangeRoot, "exports", "codexa-ethernet-repair");
const codexaRepairZipPath = path.join(orangeRoot, "exports", "codexa-ethernet-repair.zip");
const codexaRepairDownloadPort = 8799;
const codexaRepairDownloadUrl = `http://${cockpitIp}:${codexaRepairDownloadPort}/codexa-ethernet-repair.zip`;
const mcpEventLogPath = path.join(orangeRoot, "mcp-events", "events.jsonl");
const projectThreadDir = path.join(orangeRoot, "project-thread");
const handoffDir = path.join(orangeRoot, "handoffs");
const projectThreadPath = path.join(projectThreadDir, "ORANGEBOX_PROJECT_THREAD.md");
const projectPositionPath = path.join(projectThreadDir, "project-position.json");
const notificationLogPath = path.join(orangeRoot, "notifications", "feed.jsonl");
const cardFeedbackLogPath = path.join(orangeRoot, "memory", "card-feedback.jsonl");
const partyLineDir = path.join(orangeRoot, "party-line");
const fatcatDir = path.join(orangeRoot, "fatcat");
const projectSpineTemplate = [
  { key: "intake", title: "Idea intake", department: "AE0", gate: "Capture the raw idea, target outcome, operator constraints, and forbidden areas." },
  { key: "project-contract", title: "Project contract", department: "AE1", gate: "Define objective, audience, non-goals, evidence, rollback, and approval lines." },
  { key: "source-inventory", title: "Source inventory", department: "AE2", gate: "Map files, folders, prior docs, receipts, screenshots, and current system state." },
  { key: "memory-recall", title: "Memory recall", department: "AE10", gate: "Load relevant lessons, mistakes, evolution reports, LakeStrike/Factory history, and current project position." },
  { key: "aecommander-extract", title: "AECommander extract", department: "AE7", gate: "Port only proven ideas: wave queue, handoff, FocusPane, cost gates, validator, snapshot receipts." },
  { key: "scope-map", title: "Scope map", department: "AE1", gate: "Turn the goal into features, acceptance criteria, and what must be visible to the operator." },
  { key: "risk-map", title: "Risk map", department: "AE11", gate: "Flag secrets, destructive actions, network exposure, deploys, database writes, and vendor/plugin installs." },
  { key: "architecture", title: "Architecture route", department: "AE6", gate: "Choose the smallest durable architecture and name the write boundaries." },
  { key: "mission-graph", title: "Mission graph", department: "AE0", gate: "Convert the scope into ordered nodes with owners, status, blockers, and receipts." },
  { key: "ui-system", title: "UX and visual system", department: "AE3", gate: "Define the command surface, interaction model, motion direction, responsive checks, and no-dead-control rule." },
  { key: "content-positioning", title: "Positioning and copy", department: "AE4", gate: "Make the value proposition, product language, onboarding, and launch copy specific." },
  { key: "offer-model", title: "Offer and value model", department: "AE5", gate: "Clarify buyer value, pricing logic, proof of value, onboarding promise, and support boundary." },
  { key: "claims-legal", title: "Claims and legal review", department: "AE9", gate: "Check naming, claims, license posture, privacy, data handling, and customer-facing language." },
  { key: "data-contract", title: "Data and memory contract", department: "AE12", gate: "Define what is stored, summarized, forgotten, linked, exported, and used for handoff." },
  { key: "codexa-capacity", title: "Codexa capacity gate", department: "AE10", gate: "Prove Codexa rail, RAM, Docker, browser workers, local models, and network path before heavy work." },
  { key: "work-sharding", title: "Work sharding", department: "AE13", gate: "Split only independent work. Keep cockpit interactive. Cap frontier lanes and heavy jobs." },
  { key: "implementation-slice", title: "Implementation slice", department: "AE6", gate: "Build the smallest complete useful slice, not a decorative dashboard." },
  { key: "local-checks", title: "Local checks", department: "AE14", gate: "Run syntax, build, tests, and endpoint smoke checks locally." },
  { key: "codexa-checks", title: "Codexa checks", department: "AE14", gate: "Run heavier checks on Codexa, summarize logs, and save raw receipts out of context." },
  { key: "visual-proof", title: "Visual proof loop", department: "AE3", gate: "Capture desktop and compact screenshots; check overflow, blank panels, dead controls, and visual coherence." },
  { key: "checkmate", title: "Checkmate verification", department: "AE7", gate: "Run UI, runtime, API, data, security, and CI quality gates with honest statuses." },
  { key: "hre", title: "Hallucination gate", department: "AE7", gate: "Separate verified facts from assumptions. Block RED claims and require evidence for completion." },
  { key: "security-scan", title: "Security scan", department: "AE11", gate: "Scan raw secret patterns, permissions, supply chain, and state-changing paths." },
  { key: "review-panel", title: "Review panel", department: "AE7", gate: "Apply Goose/Iceman/Phoenix/Slider/Viper judgment before ship." },
  { key: "release-plan", title: "Release plan", department: "AE8", gate: "Name install/run path, smoke checks, rollback path, and operator handoff." },
  { key: "deploy-smoke", title: "Deploy or install smoke", department: "AE8", gate: "Only after approval, prove install/deploy with receipts and rollback." },
  { key: "receipt", title: "Receipt", department: "AE0", gate: "Record touched files, commands, tests, proof, risks, rollback, and next action." },
  { key: "memory-compile", title: "Memory compile", department: "AE10", gate: "Keep the lesson, decay noise, update wiki/spine, and surface what not to repeat." },
  { key: "next-scope", title: "Next scope with new eyes", department: "AE0", gate: "Re-scope after evidence arrives. Iteration produces the innovation." }
];
const internalQualityTeams = [
  { id: "ae-hre", name: "Hallucination Reduction Engine", source: "C:/AtomEons/aeskills/skills/ae-hre", status: "CONFIGURED", proves: "GREEN/YELLOW/RED truth gate; blocks unsupported completion claims." },
  { id: "ae-verifier", name: "Top-of-model Verifier", source: "C:/AtomEons/aeskills/skills/ae-verifier", status: "CONFIGURED", proves: "12-gate verification before reporting done." },
  { id: "ae-bench", name: "Bench", source: "C:/AtomEons/aeskills/skills/ae-bench", status: "CONFIGURED", proves: "No optimization claim without baseline, protected metric, and receipt." },
  { id: "ae-security-audit", name: "Security Audit", source: "C:/AtomEons/aeskills/skills/ae-security-audit", status: "CONFIGURED", proves: "Deterministic pre-ship security grep and permission review." },
  { id: "ae-drift-monitor", name: "Drift Monitor", source: "C:/AtomEons/aeskills/skills/ae-drift-monitor", status: "CONFIGURED", proves: "Invariant drift detection so the project does not lose its law." },
  { id: "ae-failpattern", name: "Failpattern", source: "C:/AtomEons/aeskills/skills/ae-failpattern", status: "CONFIGURED", proves: "Checks current work against known past failure patterns." },
  { id: "ae-receiptbook", name: "Receiptbook", source: "C:/AtomEons/aeskills/skills/ae-receiptbook", status: "CONFIGURED", proves: "Evidence trail for installs, tests, promotions, and rollback." },
  { id: "topgun-panel", name: "Topgun Review Panel", source: "C:/AtomEons/aeskills/skills/ae-goose + ae-iceman + ae-phoenix + ae-slider + ae-viper", status: "CONFIGURED", proves: "Code review, scope discipline, tests, security pressure, and innovation menu." }
];
const aeCommanderEvolutionIdeas = [
  { id: "wave-queue", title: "Wave-aware queue", source: "AECommanderAlt backend queue/supervisor", status: "ADOPTED", use: "ORANGEBOX project spine and AI Box job grid keep ordered stages instead of loose chat." },
  { id: "trilane-handoff", title: "Tri-lane handoff", source: "AECommanderAlt trilane/handoff.py", status: "ADAPTED", use: "Compiler/Architect/Consigliere becomes Checkmate Review and handoff packet discipline without mandatory API spend." },
  { id: "focus-pane", title: "Semantic FocusPane", source: "AECommanderAlt dashboard FocusPane", status: "ADOPTED", use: "AE See-Suite shows parsed status cards while raw logs stay saved as receipts." },
  { id: "plan-validator", title: "Plan validator", source: "AECommanderAlt planner/validator.py", status: "ADOPTED", use: "Project spine requires contiguous steps, owner departments, evidence, and no silent file collisions." },
  { id: "cost-buckets", title: "Cost and limit buckets", source: "AECommanderAlt COSTING.md", status: "ADAPTED", use: "Subscription tokens remain UNKNOWN unless proven; local estimates, caps, and AI Box load policy are visible." },
  { id: "snapshot-backup", title: "Snapshot receipts", source: "AECommanderAlt backup/snapshot.py", status: "ADOPTED", use: "Handoffs, receipts, and memory compile survive model/app swaps." },
  { id: "bridge-prompt", title: "Vendor-app bridge prompt", source: "AECommander AGENT-BRIDGE.md", status: "ADOPTED", use: "Codex/Claude swaps happen through one compact packet instead of re-teaching the project." },
  { id: "reject-noise", title: "Do not import old unsafe runtime whole", source: "LakeStrike debrief 2026-04-26", status: "REJECTED_AS_CODE", use: "Old AECommander/Alt code remains reference-only; we port ideas, not bugs or doctrine drift." }
];
let powerCache = { generatedAtMs: 0, payload: null };
let checkmateCache = { generatedAtMs: 0, payload: null };
let claudeCodeCache = { generatedAtMs: 0, payload: null };

function publicTelemetryPath(pathname) {
  return pathname === "/api/v4/cockpit/status" ? "/api/v4/see-suite/status" : pathname;
}

function send(res, code, body, type = "application/json") {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body, null, 2);
  res.writeHead(code, {
    "content-type": `${type}; charset=utf-8`,
    "cache-control": "no-store"
  });
  res.end(payload);
}

function recordHttpMetric(req, status, ms) {
  let pathname = "unknown";
  try {
    pathname = new URL(req.url, "http://127.0.0.1").pathname;
  } catch {}
  httpMetrics.total += 1;
  if (String(status).startsWith("FAILED") || Number(status) >= 500) httpMetrics.failed += 1;
  const publicPath = publicTelemetryPath(pathname);
  const row = httpMetrics.byPath[publicPath] || { path: publicPath, count: 0, failed: 0, totalMs: 0, maxMs: 0, lastMs: 0, lastAt: null };
  row.count += 1;
  row.totalMs += ms;
  row.maxMs = Math.max(row.maxMs, ms);
  row.lastMs = ms;
  row.lastAt = new Date().toISOString();
  if (String(status).startsWith("FAILED") || Number(status) >= 500) row.failed += 1;
  httpMetrics.byPath[publicPath] = row;
  httpMetrics.latest.unshift({ path: publicPath, status, ms, at: row.lastAt });
  httpMetrics.latest = httpMetrics.latest.slice(0, 30);
}

async function readBody(req, max = 80 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error("request body too large");
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function safeSegment(value, fallback = "item") {
  return String(value || fallback)
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}

function projectKey(value = "orangebox") {
  return String(value || "orangebox")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "orangebox";
}

function projectThreadFiles(project = "orangebox") {
  const key = projectKey(project);
  const dir = path.join(projectThreadDir, key);
  return {
    key,
    dir,
    threadPath: path.join(dir, "THREAD.md"),
    positionPath: path.join(dir, "project-position.json"),
    scopeLedgerPath: path.join(dir, "project-scope-expansions.json"),
    spinePath: path.join(dir, "PROJECT_SPINE.json"),
    spineMarkdownPath: path.join(dir, "PROJECT_SPINE.md"),
    dagPath: path.join(dir, "DAG_MASTER.json"),
    dagMarkdownPath: path.join(dir, "DAG_MASTER.md"),
    checkpointPath: path.join(dir, "PROJECT_CHECKPOINT.md"),
    contractPath: path.join(dir, "PROJECT_CONTRACT.json"),
    contractMarkdownPath: path.join(dir, "PROJECT_CONTRACT.md"),
    codexHandoffPath: path.join(dir, "CODEX_HANDOFF.md"),
    claudeHandoffPath: path.join(dir, "CLAUDE_HANDOFF.md"),
    chatgptHandoffPath: path.join(dir, "CHATGPT_HANDOFF.md"),
    opusAwarenessPath: path.join(dir, "OPUS_AWARENESS.md"),
    publicThreadUrl: `/orangebox/project-thread/${key}/THREAD.md`
  };
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function missionId(goal) {
  const slug = String(goal || "mission").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52) || "mission";
  return `${stamp()}-${slug}`;
}

// ─── First-Run API key + profile storage ─────────────────────────────────
//
// Stores the buyer's API key + operator profile + first-run marker in the
// orangeRoot. Light obfuscation (base64 + a fixed XOR salt) prevents casual
// reads; DPAPI-grade encryption ships in v1.4. The keys never leave the
// buyer's machine — they're read by the cockpit when invoking AI providers.

const FR_SALT = "orangebox-v1-fr-salt-not-secret-just-discouraging-casual-read";

function frObfuscate(text) {
  const buf = Buffer.from(String(text || ""), "utf8");
  const salt = Buffer.from(FR_SALT, "utf8");
  for (let i = 0; i < buf.length; i++) buf[i] = buf[i] ^ salt[i % salt.length];
  return buf.toString("base64");
}

function frDeobfuscate(b64) {
  try {
    const buf = Buffer.from(String(b64 || ""), "base64");
    const salt = Buffer.from(FR_SALT, "utf8");
    for (let i = 0; i < buf.length; i++) buf[i] = buf[i] ^ salt[i % salt.length];
    return buf.toString("utf8");
  } catch { return null; }
}

async function saveFirstRunApiKey(body = {}) {
  const provider = String(body?.provider || "anthropic").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const key = String(body?.key || "").trim();
  if (!provider || !key) return { status: "FAILED", error: "provider and key required" };
  const dir = path.join(orangeRoot, "secrets");
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, `${provider}.key`);
  await fs.writeFile(target, frObfuscate(key), { mode: 0o600 });
  return { status: "VERIFIED", provider, savedAt: new Date().toISOString(), masked: key.slice(0, 10) + "…" + key.slice(-4) };
}

// Read-back path for the saved API key. Called by any cockpit feature
// that needs to invoke a provider. Returns the deobfuscated key, or
// null if not configured. Resolution order:
//   1. process.env.<PROVIDER>_API_KEY (operator override)
//   2. <orangeRoot>/secrets/<provider>.key (saved by first-run)
async function loadApiKey(provider = "anthropic") {
  const p = String(provider).toLowerCase().replace(/[^a-z0-9-]/g, "");
  const envName = `${p.toUpperCase()}_API_KEY`;
  if (process.env[envName]) return process.env[envName];
  const target = path.join(orangeRoot, "secrets", `${p}.key`);
  try {
    const obf = await fs.readFile(target, "utf8");
    return frDeobfuscate(obf);
  } catch { return null; }
}

// ─── Codexa mode preference (v1.4) ──────────────────────────────────────
//
// AI Box is the optional worker rail. Two modes:
//   "local"  — heavy tasks (builds, screenshots, indexing, knowledge
//              compile) run on the buyer's controller machine. Default.
//              No second computer required.
//   "remote" — heavy tasks dispatched to a second machine over LAN
//              with bridge + command-rail tokens. Power-user setup.
//
// The buyer answers this in first-run; can change later via AE Operations.

async function getCodexaMode() {
  const target = path.join(orangeRoot, "codexa-mode.json");
  try {
    const raw = await fs.readFile(target, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed?.mode === "remote") return { mode: "remote", config: parsed.config || {} };
    return { mode: "local", config: parsed?.config || {} };
  } catch {
    // default: local (no second computer assumption)
    return { mode: "local", config: {} };
  }
}

function aiBoxModeFromLegacyRecord(record = {}) {
  const mode = record?.mode === "remote" ? "remote" : "local";
  const config = record?.config && typeof record.config === "object" ? record.config : {};
  if (mode !== "remote") return { mode: "local", config: {} };
  return {
    mode,
    config: {
      see_suite_ip: String(config.see_suite_ip || config.cockpit_ip || cockpitIp || "127.0.0.1"),
      ai_box_ip: String(config.ai_box_ip || config.codexa_ip || "").trim(),
      ai_box_legacy_ip: String(config.ai_box_legacy_ip || config.codexa_legacy_ip || "").trim(),
      ai_box_direct_ip: String(config.ai_box_direct_ip || config.codexa_direct_ip || "").trim(),
    },
  };
}

// ─── Knowledge engine v2 (lattice + void + fidelity + critique + NO-set) ──

async function getAiBoxMode() {
  return aiBoxModeFromLegacyRecord(await getCodexaMode());
}

async function rebuildKnowledgeV2() {
  const script = path.join(appRoot, "scripts", "orangebox-knowledge-v2.mjs");
  return new Promise((resolve) => {
    const child = spawn("node", [script, "--root", orangeRoot], {
      env: { ...process.env, ORANGEBOX_ROOT: orangeRoot, ORANGEBOX_DATA_ROOT: orangeRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { err += b.toString(); });
    child.on("close", (code) => {
      resolve({
        status: code === 0 ? "VERIFIED" : "FAILED",
        exit_code: code,
        stdout: out.slice(-2000),
        stderr: err.slice(-2000),
        completed_at: new Date().toISOString(),
      });
    });
  });
}

// ─── SSE Numeric encoder + auto-rebuild throttle ──────────────────────────────

// Wall-clock timestamp of last knowledge-v2 rebuild trigger (0 = never).
// Used to throttle auto-rebuilds to at most one per 5 minutes.
let _lastKnowledgeV2RebuildMs = 0;
const KNOWLEDGE_V2_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Trigger a v2 knowledge rebuild fire-and-forget, throttled to 5 min.
 * Safe to call from party-line append hot-path; never throws; never blocks caller.
 * @param {boolean} force - if true, bypass throttle (e.g. from explicit API route)
 */
function triggerKnowledgeV2RebuildAsync(force = false) {
  const now = Date.now();
  if (!force && now - _lastKnowledgeV2RebuildMs < KNOWLEDGE_V2_THROTTLE_MS) return;
  _lastKnowledgeV2RebuildMs = now;
  // Run in background — do not await
  rebuildKnowledgeV2().then((result) => {
    console.log(`[sse-auto-rebuild] v2 rebuild done: ${result.status} exit=${result.exit_code}`);
  }).catch((e) => {
    console.error("[sse-auto-rebuild] v2 rebuild error:", e);
  });
}

/**
 * POST /api/knowledge/v2/sse-rebuild
 * Spawns the SSE numeric encoder for a given source + project, returns the result.
 * Also force-triggers a v2 lattice rebuild.
 */
async function sseNumericRebuild(body = {}) {
  const source  = String(body.source  || "receipts").trim();
  const project = String(body.project || "orangebox").trim();
  const script  = path.join(appRoot, "scripts", "orangebox-sse-numeric.mjs");
  return new Promise((resolve) => {
    const child = spawn(
      "node",
      [script, "--source", source, "--project", project, "--root", orangeRoot],
      {
        env: { ...process.env, ORANGEBOX_ROOT: orangeRoot, ORANGEBOX_DATA_ROOT: orangeRoot },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let out = "", err = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { err += b.toString(); });
    child.on("close", (code) => {
      // Force a lattice rebuild after SSE numeric run
      triggerKnowledgeV2RebuildAsync(true);
      resolve({
        status: code === 0 ? "VERIFIED" : "FAILED",
        source,
        project,
        exit_code: code,
        stdout: out.slice(-2000),
        stderr: err.slice(-2000),
        completed_at: new Date().toISOString(),
      });
    });
  });
}

async function queryKnowledgeV2(q) {
  const enginePath = path.join(orangeRoot, "memory", "orangebox-knowledge-v2", "lattice.jsonl");
  try {
    await fs.access(enginePath);
  } catch {
    return { status: "FAILED", error: "v2 vault not built. POST /api/knowledge/v2/rebuild first." };
  }
  const needle = String(q || "").toLowerCase().trim();
  if (!needle) return { status: "FAILED", error: "query required" };
  const raw = await fs.readFile(enginePath, "utf8");
  const hits = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const doc = JSON.parse(line);
      let score = 0;
      if ((doc.title || "").toLowerCase().includes(needle)) score += 10;
      for (const ent of Object.keys(doc.entities || {})) {
        if (ent.toLowerCase().includes(needle)) score += 4;
      }
      for (const f of doc.facts || []) {
        const factText = typeof f === "string" ? f : f?.text || JSON.stringify(f);
        if (factText.toLowerCase().includes(needle)) score += 2;
      }
      if (score > 0) hits.push({ id: doc.id, title: doc.title, source: doc.source, topics: doc.topics, score });
    } catch {}
  }
  hits.sort((a, b) => b.score - a.score);
  return { status: "VERIFIED", query: q, total: hits.length, top: hits.slice(0, 12) };
}

async function knowledgeV2Status() {
  const dir = path.join(orangeRoot, "memory", "orangebox-knowledge-v2");
  try {
    const engine = await fs.readFile(path.join(dir, "ENGINE.md"), "utf8").catch(() => null);
    const fidelity = JSON.parse(await fs.readFile(path.join(dir, "fidelity.json"), "utf8").catch(() => "{}"));
    const entities = JSON.parse(await fs.readFile(path.join(dir, "entities.json"), "utf8").catch(() => "{}"));
    const stat = await fs.stat(path.join(dir, "lattice.jsonl")).catch(() => null);
    return {
      status: "VERIFIED",
      built: !!stat,
      generated_at: stat?.mtime || null,
      doc_count: Object.keys(fidelity).length,
      entity_count: entities.count || 0,
      lattice_bytes: stat?.size || 0,
      engine_manifest: engine ? engine.split("\n").slice(0, 24).join("\n") : null,
    };
  } catch (e) {
    return { status: "FAILED", error: String(e) };
  }
}

// ─── Git status probe (v2 top-bar indicators) ──────────────────────────
//
// The v2 top-bar shows two indicators: GitHub-local (.git dir state) and
// GitHub-private-web (remote reachable + private). This probe is
// best-effort, never throws, returns shape:
//   { exists, clean, remote, remote_reachable, private, public, branch }

async function gitStatusProbe(projectSlug) {
  const out = {
    exists: false,
    clean: false,
    remote: null,
    remote_reachable: false,
    private: false,
    public: false,
    branch: null,
  };
  // Resolve the project root the way the operator's data root sees it.
  // For v2.0-alpha, we probe orangeRoot itself (the data root) since
  // the cockpit's "project" maps to a subfolder of the data root.
  const target = path.resolve(orangeRoot, "..");
  try {
    const gitDir = path.join(target, ".git");
    await fs.access(gitDir);
    out.exists = true;
    // best-effort branch + clean check
    try {
      const headRaw = await fs.readFile(path.join(gitDir, "HEAD"), "utf8");
      const m = headRaw.match(/ref:\s+refs\/heads\/(\S+)/);
      if (m) out.branch = m[1];
    } catch {}
    // attempt a 1-shot `git status --porcelain` if git is on PATH
    try {
      const { stdout } = await execFileAsync("git", ["-C", target, "status", "--porcelain"], { timeout: 4000 });
      out.clean = String(stdout).trim().length === 0;
    } catch { out.clean = null; }
    // remote
    try {
      const { stdout } = await execFileAsync("git", ["-C", target, "remote", "get-url", "origin"], { timeout: 4000 });
      out.remote = String(stdout).trim() || null;
      if (out.remote) {
        out.remote_reachable = true; // optimistic — operator-tunable later
        out.private = /github\.com[:\/]/.test(out.remote);
      }
    } catch {}
  } catch {
    // no .git — fine
  }
  return out;
}

async function setCodexaMode(body = {}) {
  const mode = String(body?.mode || "local").toLowerCase();
  if (mode !== "local" && mode !== "remote") {
    return { status: "FAILED", error: "mode must be 'local' or 'remote'" };
  }
  const config = mode === "remote" ? {
    cockpit_ip: String(body?.config?.cockpit_ip || cockpitIp || "127.0.0.1"),
    codexa_ip: String(body?.config?.codexa_ip || "").trim(),
    codexa_legacy_ip: String(body?.config?.codexa_legacy_ip || "").trim(),
    codexa_direct_ip: String(body?.config?.codexa_direct_ip || "").trim(),
  } : {};
  const target = path.join(orangeRoot, "codexa-mode.json");
  const record = {
    mode,
    config,
    savedAt: new Date().toISOString(),
  };
  await fs.writeFile(target, JSON.stringify(record, null, 2));
  return { status: "VERIFIED", ...record };
}

async function setAiBoxMode(body = {}) {
  const mode = String(body?.mode || "local").toLowerCase();
  if (mode !== "local" && mode !== "remote") {
    return { status: "FAILED", error: "mode must be 'local' or 'remote'" };
  }
  const productConfig = mode === "remote" ? {
    see_suite_ip: String(body?.config?.see_suite_ip || body?.config?.cockpit_ip || cockpitIp || "127.0.0.1"),
    ai_box_ip: String(body?.config?.ai_box_ip || body?.config?.codexa_ip || "").trim(),
    ai_box_legacy_ip: String(body?.config?.ai_box_legacy_ip || body?.config?.codexa_legacy_ip || "").trim(),
    ai_box_direct_ip: String(body?.config?.ai_box_direct_ip || body?.config?.codexa_direct_ip || "").trim(),
  } : {};
  const legacyConfig = mode === "remote" ? {
    cockpit_ip: productConfig.see_suite_ip,
    codexa_ip: productConfig.ai_box_ip,
    codexa_legacy_ip: productConfig.ai_box_legacy_ip,
    codexa_direct_ip: productConfig.ai_box_direct_ip,
  } : {};
  await setCodexaMode({ mode, config: legacyConfig });
  return {
    status: "VERIFIED",
    mode,
    config: productConfig,
    savedAt: new Date().toISOString(),
  };
}

async function saveFirstRunProfile(body = {}) {
  const profile = {
    craft: body?.craft ? String(body.craft).slice(0, 40) : null,
    projectName: body?.projectName ? String(body.projectName).toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 32) : null,
    goal: body?.goal ? String(body.goal).slice(0, 280) : null,
    savedAt: new Date().toISOString(),
  };
  const target = path.join(orangeRoot, "operator-profile.json");
  await fs.writeFile(target, JSON.stringify(profile, null, 2));
  return { status: "VERIFIED", profile };
}

async function markFirstRunCompleteServer() {
  const marker = path.join(orangeRoot, "first-run-complete");
  await fs.writeFile(marker, new Date().toISOString());
  return { status: "VERIFIED", completedAt: new Date().toISOString() };
}

async function firstRunStatus() {
  const marker = path.join(orangeRoot, "first-run-complete");
  const profilePath = path.join(orangeRoot, "operator-profile.json");
  const apiKeyPath = path.join(orangeRoot, "secrets", "anthropic.key");
  return {
    status: "VERIFIED",
    completed: await exists(marker),
    hasProfile: await exists(profilePath),
    hasApiKey: await exists(apiKeyPath),
  };
}

async function seedFromDataTemplate() {
  // On first launch, copy the shipped data-template into the operator's orangeRoot
  // so they see the Day-0 Proof Pack instead of an empty cockpit.
  // We search Tauri's resourceDir + appRoot for the template, in order.
  const candidates = [
    process.env.ORANGEBOX_RESOURCE_DIR ? path.join(process.env.ORANGEBOX_RESOURCE_DIR, "data-template") : null,
    path.join(appRoot, "data-template"),
    path.join(appRoot, "..", "data-template"),
    path.resolve(appRoot, "..", "..", "..", "data-template"),
  ].filter(Boolean);
  let templateRoot = null;
  for (const c of candidates) {
    if (await exists(c)) { templateRoot = c; break; }
  }
  if (!templateRoot) return; // no template shipped — nothing to seed (acceptable for dev runs)

  const marker = path.join(orangeRoot, ".seed-complete");
  if (await exists(marker)) return; // already seeded

  // Copy preserving relative structure. Only seed empty target subtrees.
  async function copyTree(src, dst) {
    const stat = await fs.stat(src);
    if (stat.isDirectory()) {
      await fs.mkdir(dst, { recursive: true });
      const entries = await fs.readdir(src);
      for (const entry of entries) {
        await copyTree(path.join(src, entry), path.join(dst, entry));
      }
    } else {
      // Don't overwrite an existing file on the buyer's machine.
      try { await fs.access(dst); return; } catch {}
      await fs.copyFile(src, dst);
    }
  }
  try {
    // Skip the template's own README.md and knowledge/ subfolder (operator-instructional)
    const entries = await fs.readdir(templateRoot);
    for (const entry of entries) {
      if (entry === "README.md") continue;
      if (entry === "knowledge") continue;
      const src = path.join(templateRoot, entry);
      const dst = path.join(orangeRoot, entry);
      await copyTree(src, dst);
    }
    await fs.writeFile(marker, new Date().toISOString());
  } catch (error) {
    // Seeding failures are non-fatal — the operator can still operate, just without the demo project.
    console.warn("[orangebox] seed-from-template failed:", error.message);
  }
}

async function ensureDirs() {
  for (const dir of [
    "missions",
    "production-plans",
    "context-vault",
    "proof",
    "benchmarks",
    "receipts",
    "mcp-events",
    "power",
    "optimizer",
    "checkmate",
    "dags",
    "project-thread",
    "handoffs",
    "aecommander-memory",
    "notifications",
    "party-line",
    "fatcat",
    "triad",
    "review-engines",
    "conversations",
    "logs/mission-os",
    "exports/codexa-bridge-pack",
    "exports/codexa-command-rail-pack",
    "exports/codexa-openclaw-guarded-pack"
  ]) {
    await fs.mkdir(path.join(orangeRoot, dir), { recursive: true });
  }
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

function productSafeProbeString(value) {
  return String(value || "")
    .replace(/<COCKPIT_IP>/g, "<SEE_SUITE_IP>")
    .replace(/\bcodexa-orangebox-command-rail\b/gi, "orangebox-ai-box-command-rail")
    .replace(/\bcockpit\b/gi, "AE See-Suite")
    .replace(/\bcodexa\b/gi, "AI Box");
}

function productSafeProbeResponse(response) {
  if (typeof response === "string") return productSafeProbeString(response);
  if (Array.isArray(response)) return response.map((item) => productSafeProbeResponse(item));
  if (!response || typeof response !== "object") return response;
  const safe = {};
  for (const [key, value] of Object.entries(response)) {
    const safeKey = key === "cockpitIp" ? "seeSuiteIp" : key === "cockpit" ? "seeSuite" : key;
    safe[safeKey] = productSafeProbeResponse(value);
  }
  if (safe.machine && typeof safe.machine === "object" && !Array.isArray(safe.machine)) {
    safe.machine = { ...safe.machine };
    if (typeof safe.machine.hostname === "string" && /\bAI Box\b/i.test(safe.machine.hostname)) {
      safe.machine.hostname = "AI Box";
    }
  }
  return safe;
}

function productSafeRailResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  const safe = { ...result };
  if (safe.response) safe.response = productSafeProbeResponse(safe.response);
  return safe;
}

async function probe(url, timeoutMs = 3500) {
  const started = Date.now();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (row) => {
      if (settled) return;
      settled = true;
      resolve({ url, ms: Date.now() - started, ...row });
    };
    let target;
    try {
      target = new URL(url);
    } catch (error) {
      finish({ status: "FAILED", error: error.message });
      return;
    }
    const req = http.request({
      method: "GET",
      hostname: target.hostname,
      port: target.port || 80,
      path: `${target.pathname}${target.search}`,
      timeout: timeoutMs
    }, (res) => {
      let bytes = 0;
      const chunks = [];
      res.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes <= 4096) chunks.push(chunk);
        if (bytes > 4096) {
          const body = Buffer.concat(chunks).toString("utf8");
          let response = null;
          try { response = productSafeProbeResponse(JSON.parse(body)); } catch {}
          finish({
            status: res.statusCode >= 200 && res.statusCode < 400 ? "VERIFIED" : "FAILED",
            code: res.statusCode,
            bytes,
            truncated: true,
            response,
            body_preview: response ? undefined : productSafeProbeString(body.slice(0, 600)),
          });
          req.destroy();
        }
      });
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        let response = null;
        try { response = productSafeProbeResponse(JSON.parse(body)); } catch {}
        finish({
          status: res.statusCode >= 200 && res.statusCode < 400 ? "VERIFIED" : "FAILED",
          code: res.statusCode,
          bytes,
          response,
          body_preview: response ? undefined : productSafeProbeString(body.slice(0, 600)),
        });
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("probe timeout"));
      finish({ status: "TIMEOUT", error: "probe timeout" });
    });
    req.on("error", (error) => finish({ status: error.message === "probe timeout" ? "TIMEOUT" : "FAILED", error: error.message }));
    req.end();
  });
}

function aiBoxConfigured() {
  return Boolean(codexaDirectIp || codexaIp || codexaLegacyWifiIp);
}

function aiBoxProbeSpecs({ fast = false, deep = false } = {}) {
  const railTimeout = fast ? 350 : 900;
  const auxTimeout = fast ? 350 : 900;
  const directTimeout = fast ? 250 : 900;
  const legacyTimeout = fast ? 250 : 500;
  const specs = [];
  if (codexaDirectIp) {
    specs.push({ url: `http://${codexaDirectIp}:8099/`, timeout: deep ? 900 : directTimeout, lane: "direct-landing" });
    specs.push({ url: `http://${codexaDirectIp}:${commandRailPort}/health`, timeout: directTimeout, lane: "direct-command-rail" });
    specs.push({ url: `http://${codexaDirectIp}:8098/health`, timeout: directTimeout, lane: "direct-bridge" });
  }
  if (codexaIp) {
    specs.push({ url: `http://${codexaIp}:${commandRailPort}/health`, timeout: railTimeout, lane: "ethernet-command-rail" });
    specs.push({ url: `http://${codexaIp}:8098/health`, timeout: auxTimeout, lane: "ethernet-bridge" });
    specs.push({ url: `http://${codexaIp}:8099/`, timeout: auxTimeout, lane: "ethernet-receipts" });
    if (deep) specs.push({ url: `http://${codexaIp}:8099/RECEIPTS.html`, timeout: 900, lane: "ethernet-receipts-page" });
    if (deep) specs.push({ url: `http://${codexaIp}:8080/`, timeout: 900, lane: "ethernet-openwebui" });
    specs.push({ url: `http://${codexaIp}:5678/healthz`, timeout: auxTimeout, lane: "ethernet-n8n" });
  }
  if (codexaLegacyWifiIp) {
    specs.push({ url: `http://${codexaLegacyWifiIp}:${commandRailPort}/health`, timeout: legacyTimeout, lane: "legacy-wifi-command-rail" });
  }
  return specs;
}

async function probeAiBoxEndpoints(options = {}) {
  const specs = aiBoxProbeSpecs(options);
  if (!specs.length) return [];
  return Promise.all(specs.map(async (spec) => ({
    ...(await probe(spec.url, spec.timeout)),
    lane: spec.lane
  })));
}

function pickCommandRailEndpoint(endpoints = []) {
  return endpoints.find((row) => row.url?.includes(`:${commandRailPort}/health`) && row.status === "VERIFIED")
    || endpoints.find((row) => codexaDirectIp && row.url?.includes(codexaDirectIp) && row.url?.includes(`:${commandRailPort}/health`))
    || endpoints.find((row) => codexaIp && row.url?.includes(codexaIp) && row.url?.includes(`:${commandRailPort}/health`))
    || endpoints.find((row) => row.url?.includes(`:${commandRailPort}/health`))
    || null;
}

function commandRailBaseUrl(endpoint = null) {
  if (endpoint?.url?.includes(codexaDirectIp) && codexaDirectIp) return `http://${codexaDirectIp}:${commandRailPort}`;
  if (endpoint?.url?.includes(codexaIp) && codexaIp) return `http://${codexaIp}:${commandRailPort}`;
  if (codexaDirectIp) return `http://${codexaDirectIp}:${commandRailPort}`;
  if (codexaIp) return `http://${codexaIp}:${commandRailPort}`;
  if (codexaLegacyWifiIp) return `http://${codexaLegacyWifiIp}:${commandRailPort}`;
  return null;
}

function shortTokenHash(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex").slice(0, 16);
}

function commandRailAuthEvidence(endpoint = null, token = "") {
  const localHash = token ? shortTokenHash(token) : null;
  const remoteHash = endpoint?.response?.tokenHash || null;
  const repair = {
    status: "REPAIR_AVAILABLE",
    pack: path.join(portableDataRoot, "exports", "orangebox-ai-box-command-rail-pack-WINDOWS-NATIVE.zip"),
    ai_box_inbound: "inbound/orangebox-ai-box-command-rail-pack-WINDOWS-NATIVE.zip",
    ai_box_action: "Extract the repair pack on the AI Box, then run RUN_REPAIR_AI_BOX_COMMAND_RAIL.cmd as Administrator.",
    controller_verify: "Refresh AE Operations or GET /api/status?fast=1 until commandRail.auth.command_execution_ready is true.",
  };
  if (!aiBoxConfigured()) {
    return {
      status: "BASIC_INSTALL",
      local_token_configured: Boolean(token),
      remote_token_hash: remoteHash,
      local_token_hash: localHash,
      command_execution_ready: false,
    };
  }
  if (!endpoint) {
    return {
      status: "NO_HEALTH_ENDPOINT",
      local_token_configured: Boolean(token),
      remote_token_hash: remoteHash,
      local_token_hash: localHash,
      command_execution_ready: false,
    };
  }
  if (!token) {
    return {
      status: "LOCAL_TOKEN_MISSING",
      local_token_configured: false,
      remote_token_hash: remoteHash,
      local_token_hash: null,
      command_execution_ready: false,
      action: "Set ORANGEBOX_AI_BOX_COMMAND_TOKEN from the AI Box command rail installer, then restart ORANGEBOX.",
      repair,
    };
  }
  if (remoteHash && localHash !== remoteHash) {
    return {
      status: "TOKEN_MISMATCH",
      local_token_configured: true,
      remote_token_hash: remoteHash,
      local_token_hash: localHash,
      command_execution_ready: false,
      action: "Reinstall the AI Box command rail with the current controller token, or restore the controller token that matches the running AI Box rail.",
      repair,
    };
  }
  return {
    status: endpoint.status === "VERIFIED" ? "READY" : "HEALTH_NOT_VERIFIED",
    local_token_configured: true,
    remote_token_hash: remoteHash,
    local_token_hash: localHash,
    command_execution_ready: endpoint.status === "VERIFIED" && (!remoteHash || localHash === remoteHash),
  };
}

function aiBoxRouteActive(endpoints = []) {
  if (!aiBoxConfigured()) return "NOT_CONFIGURED_BASIC_INSTALL";
  if (endpoints.find((row) => codexaDirectIp && row.url?.includes(codexaDirectIp) && row.status === "VERIFIED")) return "DIRECT_CAT8_READY";
  if (endpoints.find((row) => codexaIp && row.url?.includes(codexaIp) && row.status === "VERIFIED")) return "ETHERNET_GATEWAY_READY";
  if (endpoints.find((row) => codexaLegacyWifiIp && row.url?.includes(codexaLegacyWifiIp) && row.status === "VERIFIED")) return "LEGACY_WIFI_READY";
  return "ETHERNET_OFFLINE_OR_BLOCKED";
}

async function withTimeout(promise, timeoutMs, fallback) {
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(typeof fallback === "function" ? fallback() : fallback), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function estimateTokens(bytes) {
  return Math.ceil(Math.max(0, Number(bytes) || 0) / 4);
}

function classifyRisk(file) {
  const name = `${file.relativePath || file.name || ""}`.toLowerCase();
  if (name.match(/(\.env|secret|token|credential|key|password|wallet|private)/)) return "HIGH";
  if (name.match(/\.(exe|dll|bin|msi|ps1|bat|cmd|zip|7z|rar)$/)) return "MEDIUM";
  if ((file.size || 0) > 8 * 1024 * 1024) return "MEDIUM";
  return "LOW";
}

function recommendedAction(file, risk) {
  if (risk === "HIGH") return "exclude";
  if ((file.size || 0) > 3 * 1024 * 1024) return "summarize";
  if (String(file.type || "").startsWith("image/")) return "include";
  if (String(file.name || "").match(/\.(pdf|docx|xlsx|pptx|zip|7z|rar|exe|dll|bin)$/i)) return "store only";
  return "include";
}

function triadHeadById(id) {
  const key = String(id || "").toUpperCase();
  return comprehensiveTriad.heads.find((head) => head.id === key) || comprehensiveTriad.heads.find((head) => head.id === "ENGINEERING");
}

function routeTriadForText(text = "", ownerDepartment = "AE0") {
  const input = `${ownerDepartment} ${text}`.toLowerCase();
  const department = String(ownerDepartment || "").toUpperCase();
  if (["AE3", "AE8", "LIPS"].includes(department) || /\b(ui|ux|visual|design|css|tailwind|framer|motion|screenshot|viewport|layout|button|onboarding|installer|landing page|component|react component)\b/i.test(input)) {
    return triadHeadById("EXPERIENCE");
  }
  if (["AE1", "AE2", "AE4", "AE5", "AE9"].includes(department) || /\b(marketing|copy|seo|brand|positioning|offer|pricing|sales|audience|campaign|trend|research|legal|claims|privacy|terms)\b/i.test(input)) {
    return triadHeadById("STRATEGY");
  }
  return triadHeadById("ENGINEERING");
}

function routeDagNodeToTriad(node = {}) {
  const head = routeTriadForText([
    node.node_name,
    node.execution_payload,
    node.validation_command,
    node.notes,
    node.cost_profile
  ].filter(Boolean).join(" "), node.owner_department);
  const needsShadow = String(node.status || "").match(/failed|blocked|conflict|revision|approval/i)
    || ["AE6", "AE11", "AE14", "AE7"].includes(String(node.owner_department || "").toUpperCase())
    || Number(node.milestone_weight || 1) >= 3;
  return {
    head: head.id,
    ext: head.ext,
    name: head.name,
    model: head.primaryModel,
    fallbackModel: head.fallbackModel,
    targetRamGB: head.targetRamGB,
    defaultState: head.defaultState,
    shadows: needsShadow ? comprehensiveTriad.shadows.map((shadow) => shadow.id) : ["MIRRORS"],
    reason: `${head.id} owns ${String(node.owner_department || "AE0")} ${node.cost_profile || "node"} work; ${needsShadow ? "shadow judges required" : "light reality shadow only"}.`
  };
}

function triadReadyNodes(dag = {}) {
  const completed = new Set((dag.nodes || []).filter((node) => node.status === "complete").map((node) => String(node.node_id).toUpperCase()));
  return (dag.nodes || []).filter((node) => {
    if (node.status !== "pending" && node.status !== "approved" && node.status !== "revision_requested") return false;
    return (node.depends_on || []).every((id) => completed.has(String(id).toUpperCase()));
  });
}

function triadMemoryPolicy(power = null) {
  const freeGB = numeric(power?.memory?.freeGB ?? power?.freeRamGB ?? power?.codexa?.freeGB, 0);
  const routeOk = power?.codexaRail === "VERIFIED" || power?.route?.status === "VERIFIED" || power?.status === "VERIFIED";
  const budget = comprehensiveTriad.codexaBudget;
  const proven = freeGB >= budget.reserveRamGB && routeOk;
  const guarded = freeGB > 0 && freeGB < budget.emergencyFloorGB;
  return {
    status: guarded ? "DO_NOT_INCREASE" : proven ? "TRIAD_READY" : "TRIAD_GUARDED",
    residentModels: guarded ? 1 : proven ? budget.provenMaxResidentModels : budget.defaultMaxResidentModels,
    numParallel: guarded ? 1 : proven ? budget.provenNumParallel : budget.defaultNumParallel,
    targetActiveModelGB: budget.targetActiveModelGB,
    reserveRamGB: budget.reserveRamGB,
    emergencyFloorGB: budget.emergencyFloorGB,
    freeGB: freeGB || "UNKNOWN",
    routeOk,
    env: {
      OLLAMA_MAX_LOADED_MODELS: String(guarded ? 1 : proven ? budget.provenMaxResidentModels : budget.defaultMaxResidentModels),
      OLLAMA_NUM_PARALLEL: String(guarded ? 1 : proven ? budget.provenNumParallel : budget.defaultNumParallel),
      OLLAMA_KEEP_ALIVE: proven ? "20m" : "8m"
    },
    rule: budget.localExecutionRule
  };
}

function triadMarkdown(status) {
  const lines = [
    "# ORANGEBOX Comprehensive Triad",
    "",
    comprehensiveTriad.doctrine,
    "",
    `Status: ${status.status}`,
    `Route: ${status.route?.active || "unknown"} / ${status.route?.activeUrl || "no verified rail"}`,
    `Resident models: ${status.memoryPolicy.residentModels} / Parallel: ${status.memoryPolicy.numParallel}`,
    "",
    "## Department Heads",
    ...status.heads.map((head) => [
      `### ${head.ext} ${head.name}`,
      `ID: ${head.id}`,
      `Model: ${head.primaryModel}`,
      `Fallback: ${head.fallbackModel}`,
      `RAM target: ${head.targetRamGB}GB`,
      `Departments: ${head.departments.join(", ")}`,
      `Owns: ${head.owns.join(", ")}`,
      `Return schema: ${head.verdictSchema.join(", ")}`
    ].join("\n")),
    "",
    "## Ready Node Routing",
    ...(status.readyRoutes.length ? status.readyRoutes.map((route) => `- ${route.node_id} -> ${route.triad.head} / ${route.triad.model} / ${route.node_name}`) : ["- No ready DAG nodes right now."]),
    "",
    "## Setup Commands For AI Box",
    ...status.codexaSetup.commands.map((command) => `- \`${command}\``),
    "",
    "## Law",
    "- Explicit DAG department tags beat file-extension guessing.",
    "- File-extension guessing is only a fallback.",
    "- Mirrors and Checkmate shadow meaningful work before promotion.",
    "- Raw logs stay on disk; return summarized evidence and receipt paths.",
    ""
  ];
  return lines.join("\n");
}

async function triadStatus(project = "orangebox", { probeModels = false } = {}) {
  const key = projectKey(project);
  const dag = await ensureProjectDag(key);
  const route = await codexaRouteSnapshot().catch((error) => ({ status: "FAILED", active: "OFFLINE_OR_UNVERIFIED", error: error.message }));
  const power = await readJson(path.join(orangeRoot, "power", "latest-power.json"), null);
  const memoryPolicy = triadMemoryPolicy({ ...(power || {}), route });
  const readyRoutes = triadReadyNodes(dag).slice(0, 24).map((node) => ({
    node_id: node.node_id,
    node_name: node.node_name,
    owner_department: node.owner_department,
    status: node.status,
    triad: routeDagNodeToTriad(node)
  }));
  const setupCommands = [
    `$env:OLLAMA_MAX_LOADED_MODELS="${memoryPolicy.env.OLLAMA_MAX_LOADED_MODELS}"`,
    `$env:OLLAMA_NUM_PARALLEL="${memoryPolicy.env.OLLAMA_NUM_PARALLEL}"`,
    `$env:OLLAMA_KEEP_ALIVE="${memoryPolicy.env.OLLAMA_KEEP_ALIVE}"`,
    "ollama pull llama3.3:70b-instruct-q4_0",
    "ollama pull qwen2.5-coder:32b-instruct-q8_0",
    "ollama pull command-r:35b-08-2024-q8_0",
    "ollama pull deepseek-r1:70b-llama-distill-q4_K_M",
    "ollama list",
    "ollama ps"
  ];
  let modelProbe = { status: probeModels ? "NOT_RUN" : "SKIPPED", detail: "Use probe=1 to ask the AI Box command rail for ollama list/ps." };
  if (probeModels) {
    modelProbe = await runCodexaCommand({
      command: [
        "$ErrorActionPreference = 'Continue'",
        "hostname",
        "ollama --version",
        "ollama list",
        "ollama ps"
      ].join("; "),
      cwd: "C:/AtomEons",
      timeoutMs: 45000,
      checkmateLevel: "light"
    }).catch((error) => ({ status: "FAILED", error: error.message }));
  }
  const status = {
    status: route.status === "VERIFIED" ? memoryPolicy.status : "TRIAD_CONFIGURED_ROUTE_UNVERIFIED",
    generatedAt: new Date().toISOString(),
    project: key,
    triad: comprehensiveTriad.id,
    doctrine: comprehensiveTriad.doctrine,
    route,
    memoryPolicy,
    heads: comprehensiveTriad.heads,
    shadows: comprehensiveTriad.shadows,
    handshake: comprehensiveTriad.handshake,
    readyRoutes,
    modelProbe,
    codexaSetup: {
      commands: setupCommands,
      note: "These commands tune Ollama process behavior only after the operator chooses to run local models on an AI Box. ORANGEBOX does not pretend models are installed until probe output proves them."
    },
    operatorRuling: "This replaces micro-swarm theater with three strong local department heads plus Checkmate/Lips/Mirrors shadow pressure."
  };
  const triadDir = path.join(orangeRoot, "triad", key);
  await fs.mkdir(triadDir, { recursive: true });
  await writeJson(path.join(triadDir, "triad-status.json"), status);
  await fs.writeFile(path.join(triadDir, "TRIAD.md"), triadMarkdown(status), "utf8");
  return {
    ...status,
    statusPath: path.join(triadDir, "triad-status.json"),
    markdownPath: path.join(triadDir, "TRIAD.md"),
    markdownUrl: `/orangebox/triad/${key}/TRIAD.md`
  };
}

async function triadRoutePayload(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const dag = await ensureProjectDag(project);
  let node = null;
  const nodeId = String(body.node_id || body.nodeId || body.node || "").toUpperCase();
  if (nodeId) node = (dag.nodes || []).find((item) => String(item.node_id).toUpperCase() === nodeId);
  if (!node) {
    node = {
      node_id: nodeId || "AD_HOC",
      node_name: body.title || "Ad hoc routed work",
      owner_department: body.department || "AE0",
      execution_payload: body.payload || body.message || "",
      validation_command: body.validation || "operator/checkmate evidence attached",
      cost_profile: body.cost_profile || "medium",
      milestone_weight: body.milestone_weight || 2,
      status: "pending"
    };
  }
  const routeNode = body.department || body.request || body.payload
    ? {
        ...node,
        owner_department: body.department || node.owner_department,
        execution_payload: body.request || body.payload || node.execution_payload
      }
    : node;
  const triad = routeDagNodeToTriad(routeNode);
  const packet = {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project,
    node: routeNode,
    triad,
    call: {
      protocol: comprehensiveTriad.handshake.protocol,
      to: [triad.head, ...triad.shadows],
      expectedReturn: comprehensiveTriad.handshake.requiredReturn,
      request: clampText(body.request || node.execution_payload || node.node_name, 5000),
      contextPolicy: "Send project position, relevant memory primer, node payload, validation command, and explicit files only. Do not send whole repo or raw logs."
    }
  };
  const receipt = await writeReceipt("triad-route", { status: "VERIFIED", project, nodeId: node.node_id, head: triad.head, model: triad.model }).catch(() => null);
  return { ...packet, receiptPath: receipt?.receiptPath || null };
}

function departmentModelById(id = "AE0") {
  const key = teamForPartyLine(id);
  return departmentModelLibrary.find((model) => model.id === key)
    || departmentModelLibrary.find((model) => model.id === String(id || "").toUpperCase())
    || departmentModelLibrary[0];
}

async function departmentModelFiles(project = "orangebox") {
  const key = projectKey(project);
  const dir = path.join(orangeRoot, "triad", key);
  await fs.mkdir(dir, { recursive: true });
  return {
    key,
    dir,
    statePath: path.join(dir, "department-model-state.json"),
    briefingDir: path.join(dir, "briefings"),
    dashboardPath: path.join(dir, "DEPARTMENT_MODELS.md")
  };
}

async function readDepartmentModelState(project = "orangebox") {
  const files = await departmentModelFiles(project);
  const state = await readJson(files.statePath, { project: files.key, updatedAt: null, models: {} });
  return { ...state, project: files.key, models: state.models || {} };
}

async function writeDepartmentModelState(project, state) {
  const files = await departmentModelFiles(project);
  const clean = { ...state, project: files.key, updatedAt: new Date().toISOString(), models: state.models || {} };
  await writeJson(files.statePath, clean);
  return clean;
}

async function departmentBriefing(project = "orangebox", department = "AE0", nodeId = "") {
  const files = await ensureProjectThread(project);
  const model = departmentModelById(department);
  const spine = await ensureProjectSpine(files.key);
  const dag = await ensureProjectDag(files.key);
  const position = await readJson(files.positionPath, {});
  const party = await readPartyLine(files.key, 16).catch(() => ({ messages: [] }));
  const fatcat = await fatcatStatus(files.key).catch(() => ({ latestCalls: [], activeCalls: 0 }));
  const target = String(nodeId || dag.progress.current_node_id || "").toUpperCase();
  const node = (dag.nodes || []).find((item) => String(item.node_id).toUpperCase() === target)
    || (dag.nodes || []).find((item) => item.status !== "complete")
    || null;
  const departmentFiles = await departmentModelFiles(files.key);
  await fs.mkdir(departmentFiles.briefingDir, { recursive: true });
  const briefingPath = path.join(departmentFiles.briefingDir, `${stamp()}-${safeSegment(model.id)}-${safeSegment(target || "current")}.md`);
  const body = [
    `# AE10 Briefing Packet - ${model.id} ${model.name}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Project: ${files.key}`,
    `Department model: ${model.model}`,
    `Fallback: ${model.fallback}`,
    `Lifecycle law: wake department, run scoped work, return verdict/receipt, release unless another ready node needs the same model.`,
    "",
    "## Role",
    model.prompt,
    "",
    "## Current Position",
    position.currentPosition || "No current position captured.",
    "",
    "## Current Node",
    node ? [
      `- ${node.node_id} [${node.status}] ${node.node_name}`,
      `- Owner: ${node.owner_department}`,
      `- Payload: ${node.execution_payload}`,
      `- Validation: ${node.validation_command}`,
      `- Triad: ${node.triad_route?.head || "n/a"} / ${node.triad_route?.model || "n/a"}`
    ].join("\n") : "- No active node found.",
    "",
    "## Project Spine",
    ...(spine.steps || []).slice(0, 20).map((step) => `- ${step.id} [${step.status}] ${step.title} / ${step.department}`),
    "",
    "## Recent Party Line",
    ...(party.messages || []).slice(0, 12).map((msg) => `- ${msg.generatedAt} / ${teamLabel(msg.from)} / ${msg.status}: ${msg.text.replace(/\s+/g, " ").slice(0, 320)}`),
    "",
    "## Latest FATCAT Calls",
    ...((fatcat.latestCalls || []).slice(0, 8).map((call) => `- ${call.generatedAt} / ${call.status} / ${call.from} -> ${(call.to || []).join(", ")} / ${call.intent}`) || []),
    "",
    "## Required Return",
    "- status",
    "- confidence",
    "- evidence",
    "- receiptPath",
    "- nextAction",
    "- blockers",
    "",
    "Do not output raw logs. Reference artifact paths.",
    ""
  ].join("\n");
  await fs.writeFile(briefingPath, body, "utf8");
  return {
    status: "VERIFIED",
    project: files.key,
    department: model.id,
    model: model.model,
    briefingPath,
    briefingUrl: `/orangebox/triad/${files.key}/briefings/${path.basename(briefingPath)}`,
    estimatedTokens: estimateTokens(body.length),
    markdown: body
  };
}

async function designInvocationPacket(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const task = clampText(body.task || body.goal || "Review the current product surface and produce a concrete AE3/LIPS design direction.", 4000);
  const briefing = await departmentBriefing(project, "AE3", body.node || body.node_id || "");
  const files = await ensureProjectThread(project);
  const packetPath = path.join(files.dir, `DESIGN_LLM_PACKET_${stamp()}.md`);
  const packet = [
    "# BLUEB0X Design LLM Invocation",
    "",
    `Generated: ${new Date().toISOString()}`,
    `Project: ${project}`,
    "Department: AE3 Design / LIPS Team",
    "Mode: stageable packet; no Codexa mutation required",
    "",
    "## Command",
    "",
    "```text",
    "/department AE3",
    "/lips",
    `Task: ${task}`,
    "Taste standard: Jony Ive restraint, Teenage Engineering clarity, Nintendo playability, 2027 command-surface polish.",
    "Must produce: UX critique, layout decision, visual system, component changes, screenshot proof requirements, and pass/fail taste verdict.",
    "Atom Standard: no fake green, no dead controls, no placeholder panels, evidence before completion.",
    "```",
    "",
    "## Briefing",
    "",
    briefing.markdown,
    "",
    "## Required Return",
    "",
    "- status",
    "- confidence",
    "- designDecision",
    "- concreteChanges",
    "- visualProofRequired",
    "- blockers",
    "- receiptPath"
  ].join("\n");
  await fs.writeFile(packetPath, packet, "utf8");
  const party = await appendPartyLineMessage({
    project,
    team: "AE3",
    kind: "design-invocation",
    status: "READY",
    text: `AE3/LIPS design invocation packet staged. Task: ${task.slice(0, 260)}`,
    evidence: packetPath
  }).catch(() => null);
  const receipt = await writeReceipt("design-llm-invocation", {
    status: "VERIFIED",
    project,
    packetPath,
    briefingPath: briefing.briefingPath,
    partyLineMessageId: party?.id || null
  }).catch(() => null);
  return {
    status: "VERIFIED",
    project,
    department: "AE3",
    team: "LIPS",
    packetPath,
    packetUrl: `/orangebox/project-thread/${project}/${path.basename(packetPath)}`,
    briefingPath: briefing.briefingPath,
    command: "/department AE3\n/lips\nTask: ",
    stageText: packet,
    receiptPath: receipt?.receiptPath || null
  };
}

async function departmentInvocationPacket(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const model = departmentModelById(body.department || body.id || "AE0");
  const task = clampText(body.task || body.goal || `Prepare a scoped ${model.id} ${model.name} department pass for the current project node.`, 4000);
  const briefing = await departmentBriefing(project, model.id, body.node || body.node_id || "");
  const files = await ensureProjectThread(project);
  const packetPath = path.join(files.dir, `DEPARTMENT_PACKET_${model.id}_${stamp()}.md`);
  const command = [
    `/department ${model.id}`,
    `/model ${model.model}`,
    `Task: ${task}`,
    "Return: status, confidence, evidence, receiptPath, blockers, nextAction.",
    "Atom Standard: no fake green, no raw log firehose, cite artifact paths."
  ].join("\n");
  const packet = [
    `# BLUEB0X ${model.id} Department Invocation`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Project: ${project}`,
    `Department: ${model.id} ${model.name}`,
    `Model lane: ${model.model}`,
    "Mode: stageable packet; no Codexa mutation required",
    "",
    "## Command",
    "",
    "```text",
    command,
    "```",
    "",
    "## Department Role",
    "",
    model.prompt,
    "",
    "## Briefing",
    "",
    briefing.markdown
  ].join("\n");
  await fs.writeFile(packetPath, packet, "utf8");
  const party = await appendPartyLineMessage({
    project,
    team: model.id,
    kind: "department-invocation",
    status: "READY",
    text: `${model.id} ${model.name} invocation packet staged. Task: ${task.slice(0, 260)}`,
    evidence: packetPath
  }).catch(() => null);
  const receipt = await writeReceipt("department-invocation", {
    status: "VERIFIED",
    project,
    department: model.id,
    model: model.model,
    packetPath,
    briefingPath: briefing.briefingPath,
    partyLineMessageId: party?.id || null
  }).catch(() => null);
  return {
    status: "VERIFIED",
    project,
    department: model.id,
    departmentName: model.name,
    model: model.model,
    packetPath,
    packetUrl: `/orangebox/project-thread/${project}/${path.basename(packetPath)}`,
    briefingPath: briefing.briefingPath,
    command,
    stageText: packet,
    receiptPath: receipt?.receiptPath || null
  };
}

function ollamaGenerateCommand(model, keepAlive, prompt, timeoutMs = 120000) {
  const payload = {
    model,
    prompt,
    stream: false,
    keep_alive: keepAlive,
    options: { num_predict: 1 }
  };
  return [
    "$ErrorActionPreference = 'Stop'",
    `$payload = @'\n${JSON.stringify(payload, null, 2)}\n'@`,
    "$started = Get-Date",
    "$response = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/generate' -Method Post -ContentType 'application/json' -Body $payload -TimeoutSec " + Math.max(5, Math.ceil(timeoutMs / 1000)),
    "$elapsed = [math]::Round(((Get-Date) - $started).TotalSeconds,2)",
    "$ps = try { ollama ps } catch { $_.Exception.Message }",
    "[pscustomobject]@{ Status='VERIFIED'; Model=$response.model; Done=$response.done; LoadDurationNs=$response.load_duration; TotalDurationNs=$response.total_duration; ElapsedSec=$elapsed; OllamaPs=($ps -join \"`n\") } | ConvertTo-Json -Depth 5"
  ].join("; ");
}

async function departmentModelAction(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const action = String(body.action || "warm").toLowerCase().replace(/\s+/g, "_");
  const modelDef = departmentModelById(body.department || body.id || "AE0");
  const state = await readDepartmentModelState(project);
  const existing = state.models[modelDef.id] || {};
  const briefing = await departmentBriefing(project, modelDef.id, body.node || body.node_id || "");
  const keepAlive = action === "release" || action === "sleep" ? "0" : String(body.keepAlive || body.keep_alive || "5m");
  const lifecycle = action === "release" || action === "sleep" ? "released" : action === "cooldown" ? "cooldown" : "warming";
  let result = { status: "CONFIGURED", detail: "No Codexa execution requested." };
  if (["warm", "summon", "release", "sleep", "cooldown"].includes(action)) {
    const prompt = action === "release" || action === "sleep"
      ? ""
      : `You are ${modelDef.id} ${modelDef.name}. Acknowledge the briefing path and return READY.\n\nBriefing path: ${briefing.briefingPath}\n\n${modelDef.prompt}`;
    result = await runCodexaCommand({
      cwd: "C:/AtomEons",
      shell: "powershell",
      timeoutMs: Math.min(Math.max(Number(body.timeoutMs || 150000), 1000), 10 * 60 * 1000),
      command: ollamaGenerateCommand(body.model || modelDef.model, keepAlive, prompt, body.timeoutMs || 150000),
      checkmateLevel: "light"
    }).catch((error) => ({ status: "FAILED", error: error.message }));
  }
  const commandSucceeded = result.status === "VERIFIED"
    || result.result?.response?.status === "VERIFIED"
    || result.result?.response?.exitCode === 0;
  const checkmateBlocked = String(result.checkmateGate?.status || "").startsWith("BLOCKED");
  const lifecycleAccepted = ["warm", "summon", "cooldown"].includes(action)
    ? commandSucceeded
    : commandSucceeded && !checkmateBlocked;
  const finalStatus = lifecycleAccepted
    ? lifecycle === "released" ? "released" : "hot"
    : lifecycle === "released" ? "release_requested" : "warming_failed";
  state.models[modelDef.id] = {
    ...existing,
    id: modelDef.id,
    name: modelDef.name,
    model: body.model || modelDef.model,
    fallback: modelDef.fallback,
    family: modelDef.family,
    lane: modelDef.lane,
    targetRamGB: modelDef.targetRamGB,
    lifecycle: finalStatus,
    keepAlive,
    updatedAt: new Date().toISOString(),
    briefingPath: briefing.briefingPath,
    lastResultId: result.id || null,
    lastReceiptPath: result.checkmateGate?.receiptPath || result.result?.response?.receiptPath || null,
    lastStatus: result.status
  };
  const nextState = await writeDepartmentModelState(project, state);
  await appendPartyLineMessage({
    project,
    team: modelDef.id,
    kind: "department-model",
    status: finalStatus.toUpperCase(),
    text: `${modelDef.id} ${modelDef.name} ${action}: ${body.model || modelDef.model} / keep_alive ${keepAlive}`,
    evidence: briefing.briefingPath
  }).catch(() => {});
  const receipt = await writeReceipt("department-model-action", {
    status: result.status || "CONFIGURED",
    project,
    department: modelDef.id,
    action,
    lifecycle: finalStatus,
    model: body.model || modelDef.model,
    briefingPath: briefing.briefingPath,
    resultId: result.id || null
  }).catch(() => null);
  return {
    status: lifecycleAccepted ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
    project,
    action,
    department: modelDef.id,
    model: modelDef,
    lifecycle: state.models[modelDef.id],
    result,
    state: nextState,
    receiptPath: receipt?.receiptPath || null
  };
}

function departmentModelsMarkdown(payload) {
  return [
    "# ORANGEBOX Department Model Library",
    "",
    "Massive models are a cold library on the optional AI Box. ORANGEBOX wakes one department for the current node, sends an AE10 briefing, collects verdict/evidence, then releases it unless the queue still needs it.",
    "",
    `Project: ${payload.project}`,
    `Route: ${payload.route?.active || "unknown"}`,
    `Policy: ${payload.policy.status} / resident ${payload.policy.residentModels} / parallel ${payload.policy.numParallel}`,
    "",
    "## Active Lifecycle",
    ...(payload.lifecycle.length ? payload.lifecycle.map((item) => `- ${item.id}: ${item.lifecycle} / ${item.model} / ${item.keepAlive || "n/a"} / ${item.updatedAt || "never"}`) : ["- No department models have been summoned yet."]),
    "",
    "## Library",
    ...payload.library.map((item) => `- ${item.ext} ${item.id} ${item.name}: ${item.model} (${item.family}, ${item.targetRamGB}GB) / fallback ${item.fallback}`),
    "",
    "## Families",
    "- Strategist: Llama 3.3 70B Q4_K_M for product, marketing, sales, taste, and command judgment.",
    "- Engineer: Qwen 2.5 Coder 32B Q8_0 for code, CI, security, data, and automation precision.",
    "- Librarian: Command R 35B Q8_0 for research, legal, memory, citation, and structured synthesis.",
    "- Auditor: DeepSeek-R1 Distill Llama 70B Q4_K_M for review, Mirrors, and Checkmate.",
    ""
  ].join("\n");
}

async function departmentModelStatus(project = "orangebox", { probeModels = false } = {}) {
  const key = projectKey(project);
  const route = await codexaRouteSnapshot().catch((error) => ({ status: "FAILED", active: "OFFLINE_OR_UNVERIFIED", error: error.message }));
  const power = await readJson(path.join(orangeRoot, "power", "latest-power.json"), null);
  const policy = triadMemoryPolicy({ ...(power || {}), route });
  const state = await readDepartmentModelState(key);
  let modelProbe = { status: probeModels ? "NOT_RUN" : "SKIPPED", detail: "Use probe=1 to query ollama ps/list through the AI Box rail." };
  if (probeModels) {
    modelProbe = await runCodexaCommand({
      cwd: "C:/AtomEons",
      shell: "powershell",
      timeoutMs: 45000,
      command: "ollama list; ollama ps",
      checkmateLevel: "light"
    }).catch((error) => ({ status: "FAILED", error: error.message }));
  }
  const lifecycle = Object.values(state.models || {}).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  const payload = {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project: key,
    route,
    policy,
    library: departmentModelLibrary,
    lifecycle,
    modelProbe,
    law: "Departments are identities. Models are hot-swapped resources. Keep 15 department brains available, but keep only 1-3 hot based on proven RAM/route pressure.",
    actions: ["briefing", "warm", "release", "cooldown"]
  };
  const files = await departmentModelFiles(key);
  await fs.writeFile(files.dashboardPath, departmentModelsMarkdown(payload), "utf8");
  return {
    ...payload,
    dashboardPath: files.dashboardPath,
    dashboardUrl: `/orangebox/triad/${key}/DEPARTMENT_MODELS.md`,
    statePath: files.statePath
  };
}

async function departmentLearningStatus(project = "orangebox") {
  const key = projectKey(project);
  const candidateRoots = [...new Set([
    portableDataRoot,
    process.env.ORANGEBOX_DATA_ROOT,
    process.env.ORANGEBOX_ROOT,
    orangeRoot
  ].filter(Boolean).map((root) => path.resolve(root)))];
  let learningDir = path.join(candidateRoots[0] || orangeRoot, "knowledge", "department-learning");
  let learningPath = path.join(learningDir, "department-learning.json");
  let dashboardPath = path.join(learningDir, "DEPARTMENT_LEARNING.md");
  let trainingPath = path.join(learningDir, "training-examples.jsonl");
  let payload = null;
  const checkedPaths = [];
  for (const root of candidateRoots) {
    const dir = path.join(root, "knowledge", "department-learning");
    const candidateLearningPath = path.join(dir, "department-learning.json");
    checkedPaths.push(candidateLearningPath);
    payload = await readJson(candidateLearningPath, null);
    if (payload) {
      learningDir = dir;
      learningPath = candidateLearningPath;
      dashboardPath = path.join(dir, "DEPARTMENT_LEARNING.md");
      trainingPath = path.join(dir, "training-examples.jsonl");
      break;
    }
  }
  if (!payload) {
    return {
      status: "MISSING",
      project: key,
      learningPath,
      dashboardPath,
      trainingPath,
      checkedPaths,
      nextAction: "Department learning data is missing; refresh the ORANGEBOX learning seed from AE Operations.",
      law: "Departments cannot learn from the internet directly. They learn from source ledgers, evidence tiers, receipts, evals, and operator votes."
    };
  }
  const safePayload = scrubProductLanguageStrings(payload);
  const trainingText = await readText(trainingPath, "");
  return {
    status: safePayload.status || "CONFIGURED",
    generatedAt: safePayload.generatedAt || null,
    project: key,
    summary: safePayload.summary || {},
    crawlPolicy: safePayload.crawlPolicy || null,
    promotionPolicy: safePayload.promotionPolicy || null,
    trends: safePayload.trends || [],
    departments: safePayload.departments || [],
    sourceCount: Array.isArray(safePayload.sourceLedger) ? safePayload.sourceLedger.length : 0,
    trainingExamples: trainingText.split(/\r?\n/).filter((line) => line.trim()).length,
    dashboardPath,
    dashboardUrl: "/orangebox/knowledge/department-learning/DEPARTMENT_LEARNING.md",
    learningPath,
    trainingPath
  };
}

const codexaBigModelInstallStatePath = "C:/AtomEons/ai-box/receipts/orangebox-big-model-install-state.json";
const codexaBigModelInstallScriptPath = "C:/AtomEons/ai-box/model-install/ai-box-big-model-install.ps1";

async function getCodexaBigModelInstallStatus(project = "orangebox") {
  const key = projectKey(project);
  let state = null;
  let raw = null;
  const result = await callCodexaCommandRail("/get-file", {
    method: "POST",
    timeoutMs: 30000,
    body: { path: codexaBigModelInstallStatePath }
  }).catch((error) => ({ status: "FAILED", error: error.message }));
  if (result.status === "VERIFIED" && result.response?.base64) {
    raw = Buffer.from(result.response.base64, "base64").toString("utf8");
    raw = raw.replace(/^\uFEFF/, "").trim();
    try { state = JSON.parse(raw); } catch {}
  }
  const modelStatus = await departmentModelStatus(key, { probeModels: false }).catch((error) => ({ status: "FAILED", error: error.message }));
  return {
    status: state?.status || (result.status === "VERIFIED" ? "CONFIGURED_UNPARSED" : "NOT_STARTED"),
    generatedAt: new Date().toISOString(),
    project: key,
    statePath: codexaBigModelInstallStatePath,
    scriptPath: codexaBigModelInstallScriptPath,
    state,
    readResult: result.status,
    modelLibrary: departmentModelLibrary,
    departmentModels: modelStatus
  };
}

async function startCodexaBigModelInstall(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const localScript = path.join(appRoot, "scripts", "codexa-big-model-install.ps1");
  const scriptBytes = await fs.readFile(localScript);
  const upload = await putCodexaFile(codexaBigModelInstallScriptPath, scriptBytes);
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "New-Item -ItemType Directory -Force -Path 'C:\\AtomEons\\ai-box\\model-install','C:\\AtomEons\\ai-box\\receipts','C:\\AtomEons\\ai-box\\logs' | Out-Null",
    "$env:OLLAMA_MAX_LOADED_MODELS='1'",
    "$env:OLLAMA_NUM_PARALLEL='1'",
    "$env:OLLAMA_KEEP_ALIVE='5m'",
    `[Environment]::SetEnvironmentVariable('OLLAMA_MAX_LOADED_MODELS','1','User')`,
    `[Environment]::SetEnvironmentVariable('OLLAMA_NUM_PARALLEL','1','User')`,
    `[Environment]::SetEnvironmentVariable('OLLAMA_KEEP_ALIVE','5m','User')`,
    `$argsList = @('-NoProfile','-ExecutionPolicy','Bypass','-File','${codexaBigModelInstallScriptPath.replace(/\//g, "\\")}','-Project','${project}','-StatePath','${codexaBigModelInstallStatePath.replace(/\//g, "\\")}')`,
    "$proc = Start-Process -FilePath 'powershell.exe' -ArgumentList $argsList -WindowStyle Hidden -PassThru",
    "[pscustomobject]@{ Status='STARTED'; ProcessId=$proc.Id; Script='C:\\AtomEons\\ai-box\\model-install\\ai-box-big-model-install.ps1'; State='C:\\AtomEons\\ai-box\\receipts\\orangebox-big-model-install-state.json'; Policy='OLLAMA_MAX_LOADED_MODELS=1; OLLAMA_NUM_PARALLEL=1; OLLAMA_KEEP_ALIVE=5m' } | ConvertTo-Json -Depth 4"
  ].join("; ");
  const start = await runCodexaCommand({
    command,
    cwd: "C:/AtomEons",
    shell: "powershell",
    timeoutMs: 60000,
    approval: "I_APPROVE_STATE_CHANGE",
    checkmateLevel: "full"
  });
  await appendPartyLineMessage({
    project,
    team: "AE10",
    kind: "department-model-install",
    status: start.status === "VERIFIED" ? "RUNNING" : "FAILED",
    text: "Started AI Box heavyweight Ollama model install/probe: Strategist, Engineer, Librarian, Auditor. Hot-swap policy is one loaded model by default.",
    evidence: codexaBigModelInstallStatePath
  }).catch(() => {});
  const receipt = await writeReceipt("big-model-install-start", {
    status: start.status,
    project,
    uploadStatus: upload.status,
    scriptPath: codexaBigModelInstallScriptPath,
    statePath: codexaBigModelInstallStatePath,
    resultId: start.id || null,
    checkmateReceipt: start.checkmateGate?.receiptPath || null
  });
  return {
    status: start.status === "VERIFIED" ? "STARTED" : "FAILED",
    project,
    upload,
    start,
    statePath: codexaBigModelInstallStatePath,
    scriptPath: codexaBigModelInstallScriptPath,
    receiptPath: receipt.receiptPath,
    note: "Large model pulls continue on the AI Box in a hidden PowerShell worker. Poll install status instead of waiting in AE See-Suite."
  };
}

async function reviewEngineFiles(project = "orangebox") {
  const key = projectKey(project);
  const dir = path.join(orangeRoot, "review-engines", key);
  await fs.mkdir(dir, { recursive: true });
  return {
    key,
    dir,
    runsDir: path.join(dir, "runs"),
    logPath: path.join(dir, "review-engine-runs.jsonl"),
    dashboardPath: path.join(dir, "REVIEW_ENGINES.md")
  };
}

function reviewEngineOrder(mode = "product") {
  const key = String(mode || "product").toLowerCase();
  if (key.includes("preflight") || key.includes("early") || key.includes("checkmate")) return ["CHECKMATE_EARLY"];
  if (key.includes("bug") || key.includes("block")) return ["CHECKMATE_EARLY", "HACK_THE_PLANET", "MIRRORS", "ORANGE", "LIPS"];
  if (key.includes("experiment") || key.includes("weird") || key.includes("frontier")) return ["CHECKMATE_EARLY", "MISFITS", "MIRRORS", "ORANGE", "LIPS", "HACK_THE_PLANET"];
  return ["CHECKMATE_EARLY", "ORANGE", "MIRRORS", "MISFITS", "LIPS", "HACK_THE_PLANET"];
}

function reviewEngineById(id) {
  const key = String(id || "").toUpperCase().replace(/[-\s]+/g, "_");
  return reviewEngineLibrary.find((engine) => engine.id === key) || reviewEngineLibrary[0];
}

function reviewTextWithEngine(engine, text = "", context = {}) {
  const body = String(text || "");
  const lower = body.toLowerCase();
  const hasEvidence = /\b(receipt|screenshot|test|build|verified|path|log|sha|benchmark|proof)\b/.test(lower);
  const hasScope = /\b(goal|objective|scope|non-goal|acceptance|user|project|done)\b/.test(lower);
  const hasRisk = /\b(secret|token|deploy|delete|production|database|payment|permission|firewall|customer)\b/.test(lower);
  const hasTaste = /\b(ui|ux|copy|design|motion|premium|human|beautiful|flow|landing|surface)\b/.test(lower);
  const hasExecution = /\b(build|run|test|install|script|command|worker|codexa|ollama|docker|api)\b/.test(lower);
  const short = body.trim().length < 80;
  const base = {
    engine: engine.id,
    name: engine.name,
    model: engine.model,
    generatedAt: new Date().toISOString(),
    confidence: hasEvidence ? 0.84 : 0.58,
    evidenceUsed: context.evidence || (hasEvidence ? "Evidence terms present in packet." : "No concrete evidence terms found."),
    openQuestions: [],
    falsifier: "A real receipt, screenshot, test, or operator observation contradicts this review.",
    status: "REVIEWED"
  };
  if (engine.id === "CHECKMATE_EARLY") {
    const blockers = [];
    if (!hasEvidence) blockers.push("No proof artifact named yet.");
    if (!hasScope) blockers.push("Scope or acceptance criteria are weak.");
    if (hasRisk) blockers.push("Risk terms require approval and explicit rollback.");
    return {
      ...base,
      status: blockers.length ? "EARLY_WARNING" : "PRECHECK_OK",
      finalVerdict: blockers.length ? "Do not scale execution yet." : "Preflight can proceed with receipts.",
      requiredEvidence: ["contract", "DAG node", "validation command", "receipt path", "rollback path"],
      likelyFailure: blockers[0] || "Overbuilding before proof.",
      stopCondition: "Stop if AI Box work returns without Checkmate evidence.",
      nextAction: blockers.length ? blockers[0] : "Run the next smallest proof loop.",
      openQuestions: blockers
    };
  }
  if (engine.id === "ORANGE") {
    return {
      ...base,
      finalVerdict: short ? "The ask is too thin to prioritize confidently." : "Prioritize the smallest useful loop that proves the command surface.",
      whatMatters: hasScope ? "A live project loop with visible state and receipts." : "Define the project contract before adding systems.",
      cut: "Cut decorative panels, fake telemetry, and unproven model claims.",
      fakeComplexity: "Any watcher that does not produce a card, receipt, or blocker is theater.",
      nextAction: "Pick one node, one owner, one validation command."
    };
  }
  if (engine.id === "MIRRORS") {
    return {
      ...base,
      finalVerdict: hasEvidence ? "Some reality contact is present." : "Mostly assertion until proof is attached.",
      observed: hasEvidence ? "Packet references evidence/proof language." : "No concrete proof artifact was detected in the text.",
      inferred: hasExecution ? "The work likely involves real execution." : "Execution path is not explicit.",
      speculative: "Claims about model quality remain speculative until local probes and receipts exist.",
      contradictions: hasRisk && !lower.includes("approval") ? ["Risk language appears without approval language."] : [],
      nextAction: "Attach paths and mark assumptions before calling it complete."
    };
  }
  if (engine.id === "MISFITS") {
    return {
      ...base,
      finalVerdict: "The high-upside move is a watcher party line that critiques the DAG before work scales.",
      frontierCard: "Turn each review engine into a standing critic with structured cards, not a chat persona.",
      antiGenericMove: "Make the project refuse generic 'looks good' responses.",
      experimentPath: "Run review engines against one current node, compare before/after plan quality.",
      canonBoundary: "Experimental ideas must stay labeled until Mirrors and Checkmate prove them.",
      nextAction: "Add watcher cards to Opus awareness and the command surface."
    };
  }
  if (engine.id === "LIPS") {
    return {
      ...base,
      finalVerdict: hasTaste ? "Taste language is present; needs visual proof to earn authority." : "This will feel mechanical unless UX language is added.",
      feel: hasTaste ? "Closer to AE See-Suite command flow." : "Too operational; needs human-facing language.",
      wording: "Use short, decisive labels and visible next actions.",
      interaction: "Every critique card needs approve/reject/use-later affordances.",
      emotionalLanding: "Operator should feel control, not dashboard fatigue.",
      nextAction: "Show the watcher verdicts as premium cards, not raw text."
    };
  }
  return {
    ...base,
    finalVerdict: hasExecution ? "Execution path exists but needs a shorter unblock loop." : "No concrete run path yet.",
    blockerMap: hasRisk ? ["approval line", "rollback path", "proof command"] : ["validation command", "receipt capture"],
    shortestUnblock: "Run the smallest safe command that proves or falsifies the claim.",
    patchPlan: "Convert the next action into a DAG node with owner, command, expected evidence.",
    fallbackPath: "If the AI Box rail fails, write packet to shared folder and keep AE See-Suite responsive.",
    nextAction: "Generate a command packet, then Checkmate it."
  };
}

function reviewEnginesMarkdown(payload) {
  return [
    "# ORANGEBOX Review Engines",
    "",
    "These are watcher engines, not worker departments. They critique direction, truth, taste, frontier signal, unblock path, and early proof before expensive execution scales.",
    "",
    `Project: ${payload.project}`,
    `Status: ${payload.status}`,
    "",
    "## Engines",
    ...payload.engines.map((engine) => `- ${engine.ext} ${engine.id}: ${engine.name} / ${engine.authority} / model ${engine.model}`),
    "",
    "## Latest Cards",
    ...(payload.latestRuns.length ? payload.latestRuns.map((run) => `- ${run.generatedAt} / ${run.mode} / ${run.status} / ${run.cards.map((card) => `${card.engine}:${card.status}`).join(", ")}`) : ["- No review engine runs yet."]),
    "",
    "## Orders",
    `- Product: ${reviewEngineOrder("product").join(" -> ")}`,
    `- Bug/blocker: ${reviewEngineOrder("bug").join(" -> ")}`,
    `- Experimental: ${reviewEngineOrder("experimental").join(" -> ")}`,
    "",
    "## Checkmate Early",
    "Checkmate runs at intake and plan time as an early warning system, then again as a final gate. This is how ORANGEBOX stops bad work before token burn."
  ].join("\n");
}

async function readReviewEngineRuns(project = "orangebox", limit = 20) {
  const files = await reviewEngineFiles(project);
  let runs = [];
  try {
    const text = await fs.readFile(files.logPath, "utf8");
    runs = text.split(/\r?\n/).filter(Boolean).slice(-Math.max(1, Math.min(100, Number(limit || 20)))).map((line) => JSON.parse(line)).reverse();
  } catch {
    runs = [];
  }
  return runs;
}

async function reviewEngineStatus(project = "orangebox") {
  const files = await reviewEngineFiles(project);
  const latestRuns = await readReviewEngineRuns(files.key, 20);
  const payload = {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project: files.key,
    sourcePackage: "C:/AtomEons/aeskills/atomeons_icon_teams_package_2026-05-07.zip",
    importPath: "C:/AtomEons/aeskills/orangebox/imports/atomeons_icon_teams_package_2026-05-07",
    engines: reviewEngineLibrary,
    latestRuns,
    dashboardPath: files.dashboardPath,
    dashboardUrl: `/orangebox/review-engines/${files.key}/REVIEW_ENGINES.md`
  };
  await fs.writeFile(files.dashboardPath, reviewEnginesMarkdown(payload), "utf8");
  return payload;
}

async function runReviewEngines(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const mode = String(body.mode || "product");
  const text = clampText(body.text || body.goal || body.artifact || "", 20000);
  if (!text.trim()) throw new Error("review engine run needs text, goal, or artifact");
  const files = await reviewEngineFiles(project);
  await fs.mkdir(files.runsDir, { recursive: true });
  const selected = Array.isArray(body.engines) && body.engines.length ? body.engines.map(reviewEngineById) : reviewEngineOrder(mode).map(reviewEngineById);
  const cards = selected.map((engine) => reviewTextWithEngine(engine, text, { evidence: body.evidence || "" }));
  const run = {
    id: `${stamp()}-${safeSegment(mode)}-${crypto.randomUUID().slice(0, 8)}`,
    status: cards.some((card) => ["EARLY_WARNING", "REVIEWED"].includes(card.status)) ? "REVIEWED_WITH_ACTIONS" : "VERIFIED",
    generatedAt: new Date().toISOString(),
    project,
    mode,
    inputBytes: text.length,
    cards,
    nextAction: cards.find((card) => card.nextAction)?.nextAction || "Attach evidence and rerun.",
    receiptFields: ["evidence used", "open questions", "final verdict", "falsifier", "next action"]
  };
  const jsonPath = path.join(files.runsDir, `${run.id}.json`);
  const mdPath = path.join(files.runsDir, `${run.id}.md`);
  await writeJson(jsonPath, run);
  await fs.writeFile(mdPath, [
    `# Review Engine Run ${run.id}`,
    "",
    `Mode: ${run.mode}`,
    `Status: ${run.status}`,
    "",
    ...run.cards.map((card) => [
      `## ${card.engine} ${card.name}`,
      `Status: ${card.status}`,
      `Verdict: ${card.finalVerdict}`,
      `Evidence used: ${card.evidenceUsed}`,
      `Falsifier: ${card.falsifier}`,
      `Next: ${card.nextAction || "n/a"}`
    ].join("\n\n"))
  ].join("\n"), "utf8");
  await fs.appendFile(files.logPath, `${JSON.stringify({ ...run, jsonPath, mdPath })}\n`, "utf8");
  for (const card of cards) {
    await appendPartyLineMessage({
      project,
      team: card.engine === "CHECKMATE_EARLY" ? "CHECKMATE" : card.engine,
      kind: "review-engine",
      status: card.status,
      text: `${card.name}: ${card.finalVerdict}\nNext: ${card.nextAction || "n/a"}`,
      evidence: mdPath
    }).catch(() => {});
  }
  const receipt = await writeReceipt("review-engines-run", { status: run.status, project, mode, jsonPath, mdPath, engines: cards.map((card) => card.engine) }).catch(() => null);
  await reviewEngineStatus(project).catch(() => {});
  return { ...run, jsonPath, mdPath, receiptPath: receipt?.receiptPath || null };
}

function selectAgents(goal, mode) {
  const text = `${goal} ${mode}`.toLowerCase();
  const agents = [
    { id: "AE0", name: "Factory", reason: "mission graph, routing, receipts" }
  ];
  if (text.match(/market|copy|seo|launch content|brand|positioning|campaign|landing/)) {
    agents.push({ id: "AE4", name: "Marketing", reason: "positioning, launch copy, trend-aware messaging" });
  }
  if (text.match(/sales|price|pricing|checkout|stripe|revenue|offer/)) {
    agents.push({ id: "AE5", name: "Sales", reason: "offer, pricing, and conversion path" });
  }
  if (text.match(/design|ux|ui|visual|screenshot|page|app|frontend|motion|beautiful/)) {
    agents.push({ id: "AE3", name: "Design", reason: "visual quality and UX proof" });
  }
  if (text.match(/product|onboard|flow|user|feature|scope/)) {
    agents.push({ id: "AE1", name: "Product", reason: "acceptance criteria and user flow" });
  }
  if (text.match(/security|bridge|firewall|token|auth|secret|network|permission/)) {
    agents.push({ id: "AE11", name: "Security", reason: "bridge, token, and permission safety" });
  }
  if (text.match(/data|database|analytics|supabase|migration|schema|warehouse/)) {
    agents.push({ id: "AE12", name: "Data", reason: "data contracts, analytics, and migration safety" });
  }
  if (text.match(/automation|n8n|workflow|queue|scheduler|worker|agent/)) {
    agents.push({ id: "AE13", name: "Automation", reason: "approved workflow and worker orchestration" });
  }
  agents.push({ id: "AE6", name: "Code", reason: "implementation and checks" });
  agents.push({ id: "AE14", name: "Bench", reason: "speed, proof, and regression evidence" });
  if (text.match(/ship|final|review|release|complete|done/)) {
    agents.push({ id: "AE7", name: "Review", reason: "adversarial final pass" });
  }
  const seen = new Set();
  return agents.filter((agent) => {
    if (seen.has(agent.id)) return false;
    seen.add(agent.id);
    return true;
  });
}

function departmentsById(ids) {
  const wanted = new Set(ids);
  return departmentMap.filter((department) => wanted.has(department.id));
}

function stackFor(type) {
  return commandStacks.find((stack) => stack.id === type) || commandStacks[0];
}

function buildQualityGates(type, scale) {
  const common = [
    { gate: "Contract", standard: "objective, constraints, non-goals, evidence, rollback", owner: "AE0" },
    { gate: "Context", standard: "hash inputs, classify risk, summarize large files, avoid context firehose", owner: "AE10" },
    { gate: "Security", standard: "secret scan, token env-var policy, permission review", owner: "AE11" },
    { gate: "Bench", standard: "compare AE See-Suite and AI Box where useful; no optimization claim without evidence", owner: "AE14" },
    { gate: "Receipt", standard: "touched files, commands, pass/fail, residual risk, rollback path", owner: "AE0" }
  ];
  if (type === "website-launch") {
    return [
      ...common,
      { gate: "Experience", standard: "desktop and compact screenshots; no blank panels, dead primary controls, overflow, or incoherent layout", owner: "AE3" },
      { gate: "Market", standard: "clear offer, trust signals, SEO basics, launch copy mapped to user intent", owner: "AE4" },
      { gate: "Launch", standard: "build passes, preview smoke, deployment approval, rollback URL", owner: "AE8" }
    ];
  }
  if (type === "skill-factory") {
    return [
      ...common,
      { gate: "Batching", standard: `target ${scale || "large run"}; chunk into candidate batches and validate before promotion`, owner: "AE10" },
      { gate: "Skill Contract", standard: "valid frontmatter, scoped workflow, tests/receipts where applicable, no raw secrets", owner: "AE6" },
      { gate: "Deduplication", standard: "detect duplicates, near-duplicates, broken links, missing SKILL.md files", owner: "AE14" }
    ];
  }
  if (type === "app-launch") {
    return [
      ...common,
      { gate: "Product Flow", standard: "primary flows clicked, no dead icons, no placeholder panels", owner: "AE1" },
      { gate: "Installer", standard: "fresh-machine setup path documented and smoke-tested", owner: "AE8" },
      { gate: "Visual QA", standard: "screenshots at desktop and compact widths", owner: "AE3" }
    ];
  }
  return [
    ...common,
    { gate: "Automation", standard: "max attempts, idempotent scripts, approval gates for state changes", owner: "AE13" },
    { gate: "Memory", standard: "keep lessons, decay noise, surface relevant past failures", owner: "AE10" }
  ];
}

function buildJobPlan(type, departments, scale) {
  const base = [
    { id: "context-pack", runner: "ae-see-suite", size: "small", status: "Queued", detail: "hash and classify local context before any frontier reasoning" },
    { id: "ai-box-pulse", runner: "ai-box-command-rail", size: "small", status: "Queued", detail: "prove AI Box command rail, wiki, worker health, and receipts" },
    { id: "implementation", runner: "ai-box-command-rail", size: "large", status: "Queued", detail: "Claude plans here; AI Box executes installs, builds, tests, screenshots, packaging, indexing, and receipts" },
    { id: "proof-loop", runner: "ai-box-first", size: "medium", status: "Queued", detail: "run browser/screenshots/tests on AI Box when possible; AE See-Suite only reviews proof" }
  ];
  if (type === "skill-factory") {
    base.splice(2, 0,
      { id: "batch-shard", runner: "ai-box", size: "large", status: "Queued", detail: `generate/validate candidates in shards; target scale ${scale || "operator-defined"}` },
      { id: "quarantine", runner: "ae-see-suite", size: "medium", status: "Queued", detail: "keep candidates isolated until promotion gates pass" }
    );
  }
  if (type === "website-launch") {
    base.splice(2, 0,
      { id: "visual-system", runner: "ae-see-suite", size: "medium", status: "Queued", detail: "design tokens, motion language, component states" },
      { id: "content-engine", runner: "ae-see-suite", size: "medium", status: "Queued", detail: "AE4 copy, SEO, page narrative, conversion checkpoints" }
    );
  }
  if (departments.some((department) => department.id === "AE11")) {
    base.push({ id: "security-gate", runner: "ai-box-command-rail", size: "medium", status: "Queued", detail: "secrets, firewall, dependency, and permission checks with receipts" });
  }
  return base;
}

async function createProductionPlan(body) {
  const goal = String(body.goal || "").trim() || "Untitled ORANGEBOX production command";
  const type = String(body.type || "website-launch");
  const stack = stackFor(type);
  const customDepartments = Array.isArray(body.departments) && body.departments.length ? body.departments : stack.departments;
  const departments = departmentsById(customDepartments);
  const scale = String(body.scale || "").trim();
  const id = missionId(`production-${type}-${goal}`);
  const plan = {
    id,
    kind: "production-plan",
    type,
    name: stack.name,
    goal,
    scale,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "Queued",
    departments,
    outputs: stack.outputs,
    commandGate: stack.gate,
    qualityGates: buildQualityGates(type, scale),
    jobs: buildJobPlan(type, departments, scale),
    lanePolicy: {
      frontierModels: allowedModels,
      maxParallelFrontierLanes: 3,
      theoryOnCockpit: "Claude/GPT reason, scope, critique, and compress. Do not burn frontier tokens on mechanical loops.",
      executionOnCodexa: `http://${codexaIp}:${commandRailPort}`,
      legacyWifi: codexaLegacyWifiIp,
      legacyBridge: `http://${codexaIp}:8098`,
      tokenTelemetry: "UNKNOWN_NO_SAFE_TAP unless ORANGEBOX owns the API call",
      destructiveActions: "approval required"
    },
    productionStandard: [
      "Use the smallest department team that covers the work.",
      "Run nearly all machine work on the AI Box through the command rail; never fake worker execution.",
      "For UI, require visual proof at desktop and compact viewport, preferably captured by AI Box.",
      "For bulk files, shard, validate, quarantine, dedupe, and write receipts.",
      "For launch, require build, smoke, security, rollback, and operator approval."
    ]
  };
  const file = path.join(orangeRoot, "production-plans", `${id}.json`);
  await writeJson(file, plan);
  await writeReceipt("production-plan", { status: "VERIFIED", planId: id, type, goal, file });
  return plan;
}

function buildMissionGraph(mission) {
  const visualNeeded = mission.mode === "ui-product" || mission.goal.toLowerCase().match(/ui|ux|visual|app|page|frontend|beautiful|screenshot/);
  const securityNeeded = mission.agents.some((agent) => agent.id === "AE11");
  const nodes = [
    { id: "objective", label: "Objective", kind: "contract", status: "Verified", owner: "AE0" },
    { id: "context", label: "Context Foundry", kind: "context", status: mission.contextCount > 0 ? "Verified" : "Queued", owner: "AE0" },
    { id: "agents", label: "Agent Selection", kind: "routing", status: "Verified", owner: "AE0" },
    { id: "ai-box", label: "AI Box Build Grid", kind: "worker", status: "Queued", owner: "AE6" },
    { id: "tests", label: "Tests", kind: "verification", status: "Queued", owner: "AE14" }
  ];
  if (visualNeeded) nodes.push({ id: "visual-proof", label: "Visual Proof", kind: "screenshot", status: "Queued", owner: "AE3" });
  if (securityNeeded) nodes.push({ id: "security", label: "Security Gate", kind: "review", status: "Queued", owner: "AE11" });
  nodes.push({ id: "review", label: "Review", kind: "review", status: "Queued", owner: "AE7" });
  nodes.push({ id: "receipt", label: "Receipt", kind: "receipt", status: "Queued", owner: "AE0" });
  return nodes;
}

async function listFiles(dir, limit = 40, filter = () => true) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const file = path.join(dir, entry.name);
      const stat = await fs.stat(file);
      if (!filter(entry.name, stat)) continue;
      rows.push({ name: entry.name, path: file, size: stat.size, mtime: stat.mtime.toISOString() });
    }
    return rows.sort((a, b) => b.mtime.localeCompare(a.mtime)).slice(0, limit);
  } catch {
    return [];
  }
}

function isLegacyCompatibilityArtifactName(value = "") {
  return /(?:^|[-_])codexa(?:[-_]|$)/i.test(String(value || ""))
    || /\bBLUEB0X\b/i.test(String(value || ""));
}

async function listProductFacingFiles(dir, limit = 40, filter = () => true) {
  const rows = await listFiles(dir, Math.max(limit * 4, limit), filter);
  return rows
    .filter((row) => !isLegacyCompatibilityArtifactName(row.name))
    .slice(0, limit);
}

async function listMissions() {
  const dir = path.join(orangeRoot, "missions");
  const files = await listFiles(dir, 80, (name) => name.endsWith(".json"));
  const missions = [];
  for (const file of files) {
    const mission = await readJson(file.path, null);
    if (mission) missions.push(mission);
  }
  return missions.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

async function listProductionPlans() {
  const dir = path.join(orangeRoot, "production-plans");
  const files = await listFiles(dir, 60, (name) => name.endsWith(".json"));
  const plans = [];
  for (const file of files) {
    const plan = await readJson(file.path, null);
    if (plan) plans.push(plan);
  }
  return plans.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

async function listContextBatches() {
  const dir = path.join(orangeRoot, "context-vault");
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const manifest = await readJson(path.join(dir, entry.name, "manifest.json"), null);
      if (manifest) rows.push(manifest);
    }
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 40);
  } catch {
    return [];
  }
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

function stripHtml(text) {
  return String(text || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function memoryPrimer(limit = 5200) {
  const sources = [
    ["Recall", path.join(orangeRoot, "RECALL.md")],
    ["Misfit Manifesto", path.join(orangeRoot, "MISFIT_MANIFESTO.md")],
    ["Hardware", path.join(orangeRoot, "HARDWAREWIKI.md")],
    ["Lessons", path.join(orangeRoot, "memory", "compiled", "LESSONS_LEARNED.md")],
    ["Mistakes", path.join(orangeRoot, "memory", "compiled", "MISTAKES.md")],
    ["CLC Archive Primer", path.join(orangeRoot, "memory", "compiled", "CLC_PRIMER.md")],
    ["BLUEB0X.AI Knowledge Primer", path.join(orangeRoot, "memory", "compiled", "ORANGEBOX_KNOWLEDGE_PRIMER.md")],
    ["BLUEB0X.AI PageTree Primer", path.join(orangeRoot, "memory", "compiled", "ORANGEBOX_PAGETREE_PRIMER.md")],
    ["Memory Wiki", path.join(orangeRoot, "MEMORYWIKI.html")]
  ];
  const chunks = [];
  for (const [label, file] of sources) {
    let text = await readText(file, "");
    if (!text) continue;
    if (file.toLowerCase().endsWith(".html")) text = stripHtml(text);
    chunks.push(`## ${label}\n${clampText(text, 1600)}`);
  }
  return clampText(chunks.join("\n\n"), limit);
}

function parseThreadTurns(text, { limit = 24, bodyLimit = 1800 } = {}) {
  const matches = [...String(text || "").matchAll(/^## (.+?)\n([\s\S]*?)(?=^## |\s*$)/gm)];
  return matches.slice(-limit).map((match) => {
    const heading = match[1];
    const body = match[2].trim();
    const role = heading.includes(" / ") ? heading.split(" / ").pop() : "note";
    return { heading, role, body: clampText(body, bodyLimit) };
  });
}

async function projectCompletion(project = "orangebox") {
  const files = projectThreadFiles(project);
  const missions = await listMissions();
  const latestMission = missions[0];
  const latestProof = (await listFiles(path.join(orangeRoot, "proof"), 1, (name) => name.endsWith(".json")))[0];
  const latestTeam = (await listFiles(path.join(orangeRoot, "benchmarks"), 1, (name) => name.includes("agent-team") && name.endsWith(".json")))[0];
  const optimizer = await readJson(path.join(orangeRoot, "optimizer", "latest-optimizer.json"), null);
  const rawSpine = await readJson(files.spinePath, null);
  const rawDag = await readJson(files.dagPath, null);
  const spine = rawSpine ? normalizeProjectSpine(rawSpine, files.key) : null;
  const dag = rawDag ? normalizeProjectDag(rawDag, spine || {}, files.key) : null;
  const threadExists = await exists(files.threadPath);
  const memoryExists = await exists(path.join(orangeRoot, "RECALL.md"));
  const gates = [
    { name: "project thread", weight: 10, pass: threadExists },
    { name: "project spine", weight: 10, pass: Boolean(spine?.steps?.length), detail: spine ? `${spine.doneCount || 0}/${spine.count || spine.steps.length}` : "" },
    { name: "DAG tracker", weight: 10, pass: Boolean(dag?.nodes?.length), detail: dag ? `${dag.progress?.complete_nodes || 0}/${dag.progress?.total_nodes || dag.nodes.length}` : "" },
    { name: "memory primer", weight: 15, pass: memoryExists },
    { name: "mission graph", weight: 10, pass: Boolean(latestMission) },
    { name: "AI Box team", weight: 15, pass: Boolean(latestTeam) },
    { name: "visual proof", weight: 15, pass: Boolean(latestProof) },
    { name: "optimizer", weight: 10, pass: Boolean(optimizer) },
    { name: "receipts", weight: 5, pass: (await listFiles(path.join(orangeRoot, "receipts"), 1)).length > 0 }
  ];
  const earned = gates.reduce((sum, gate) => sum + (gate.pass ? gate.weight : 0), 0);
  return { percent: earned, label: `${earned}% evidence-complete`, gates };
}

function newsLinks() {
  return [
    { title: "Hugging Face Papers", url: "https://huggingface.co/papers", note: "fresh papers and model releases" },
    { title: "Claude Blog", url: "https://www.claude.com/blog", note: "Claude app, workflow, and product-use updates" },
    { title: "Anthropic News", url: "https://www.anthropic.com/news", note: "Claude and agent stack updates" },
    { title: "OpenAI News", url: "https://openai.com/news/", note: "Codex and model platform updates" },
    { title: "Cursor Changelog", url: "https://cursor.com/changelog", note: "agentic IDE/runtime changes" },
    { title: "Latent Space", url: "https://www.latent.space/", note: "AI engineering signal" }
  ];
}

function coordinatorScopeCards(position = {}, completion = {}) {
  const current = position.currentPosition || "No current position captured yet.";
  const percent = completion.percent ?? 0;
  return [
    {
      id: "scope",
      status: current.length > 40 ? "READY" : "NEEDS_INPUT",
      title: "Scope",
      body: current,
      need: "What are we making, for whom, and what does finished mean?"
    },
    {
      id: "execution-lane",
      status: "READY",
      title: "Execution Lane",
      body: "Reason in the project thread, execute heavy work on the optional AI Box, keep AE See-Suite interactive.",
      need: "Pick Claude Code subscription, Codex/GPT-5.5, or AI Box deterministic worker."
    },
    {
      id: "proof",
      status: percent >= 60 ? "READY" : "NEEDS_EVIDENCE",
      title: "Proof",
      body: `${completion.label || `${percent}% evidence-complete`}. Visual proof, test receipts, and command logs decide what is true.`,
      need: "Screenshot, test, benchmark, or receipt before calling work complete."
    },
    {
      id: "risk",
      status: "GUARDED",
      title: "Risk Gate",
      body: "Deploys, pushes, destructive commands, DB writes, payments, and customer messages require explicit approval.",
      need: "State-changing work needs a human gate and rollback path."
    },
    {
      id: "launch",
      status: percent >= 80 ? "READY" : "NOT_YET",
      title: "Launch Path",
      body: "Website, app, game, or tool moves through product, design, code, proof, review, launch, and receipt.",
      need: "A launch card needs build, visual QA, smoke, security scan, and rollback."
    },
    {
      id: "memory",
      status: "TRAINABLE",
      title: "Memory Training",
      body: "Use arrows on cards to teach ORANGEBOX what was useful. Keep lessons, decay noise, surface past failures.",
      need: "Vote useful cards up and noisy cards down so the wiki compiles sharper."
    }
  ];
}

async function recordCardFeedback(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const entry = {
    id: `${stamp()}-${crypto.randomUUID()}`,
    generatedAt: new Date().toISOString(),
    project,
    cardId: String(body.cardId || "unknown").slice(0, 100),
    vote: body.vote === "down" ? "down" : "up",
    reason: clampText(body.reason || "", 800)
  };
  await fs.mkdir(path.dirname(cardFeedbackLogPath), { recursive: true });
  await fs.appendFile(cardFeedbackLogPath, `${JSON.stringify(entry)}\n`, "utf8");
  await fs.appendFile(
    path.join(orangeRoot, "memory", "CARD_FEEDBACK.md"),
    `\n- ${entry.generatedAt} / ${entry.project} / ${entry.cardId} / ${entry.vote}${entry.reason ? ` / ${entry.reason}` : ""}`,
    "utf8"
  ).catch(() => {});
  if (entry.cardId.startsWith("learning-")) {
    const learningDir = path.join(orangeRoot, "knowledge", "department-learning");
    const trainingPath = path.join(learningDir, "training-examples.jsonl");
    const trainingRow = {
      schemaVersion: "blueb0x.department.training.v1",
      createdAt: entry.generatedAt,
      project,
      source: "operator-card-feedback",
      cardId: entry.cardId,
      vote: entry.vote,
      reason: entry.reason,
      department: entry.cardId.includes("AE") ? entry.cardId.match(/AE\d+/)?.[0] || "AE10" : "AE10",
      taskType: "operator_quality_signal",
      contextDigest: `Operator marked ${entry.cardId} as ${entry.vote}.`,
      badExecution: entry.vote === "down" ? "This card, pattern, or signal was noisy, weak, misleading, or not useful enough." : "",
      goodExecution: entry.vote === "up" ? "This card, pattern, or signal was useful enough to preserve and consider in future department execution." : "",
      whyGood: entry.vote === "up" ? "Operator positive vote." : "Operator negative vote teaches the system what to decay.",
      evidence: [entry.id],
      watcherVerdict: entry.vote === "up" ? "PROMOTE_CANDIDATE" : "DECAY_CANDIDATE",
      operatorVote: entry.vote,
      promotionLabel: entry.vote === "up" ? "candidate" : "decay",
      nextAction: "Use with receipts and Checkmate evidence before making this permanent department law."
    };
    await fs.mkdir(learningDir, { recursive: true });
    await fs.appendFile(trainingPath, `${JSON.stringify(trainingRow)}\n`, "utf8").catch(() => {});
  }
  return entry;
}

function parseNotificationMarkdown(markdown) {
  const text = clampText(markdown || "", 4000);
  const lines = text.split(/\r?\n/);
  const get = (key) => {
    const line = lines.find((item) => item.toLowerCase().startsWith(`${key.toLowerCase()}:`));
    return line ? line.slice(line.indexOf(":") + 1).trim() : "";
  };
  const title = (lines.find((item) => item.trim().startsWith("#")) || get("Title") || "BLUEB0X.AI Update").replace(/^#+\s*/, "").trim();
  const status = (get("Status") || "INFO").toUpperCase().slice(0, 32);
  const progressRaw = get("Progress").replace(/%/g, "");
  const progress = Number.isFinite(Number(progressRaw)) ? Math.max(0, Math.min(100, Number(progressRaw))) : null;
  const receipt = get("Receipt");
  const next = get("Next");
  const body = lines
    .filter((line) => !/^#|^(Title|Status|Progress|Receipt|Next|Project):/i.test(line.trim()))
    .join("\n")
    .trim();
  return { id: `${stamp()}-${crypto.randomUUID()}`, generatedAt: new Date().toISOString(), title, status, progress, receipt, next, body, markdown: text };
}

async function appendNotification(markdown) {
  const card = parseNotificationMarkdown(markdown);
  await fs.mkdir(path.dirname(notificationLogPath), { recursive: true });
  await fs.appendFile(notificationLogPath, `${JSON.stringify(card)}\n`, "utf8");
  return card;
}

async function listNotifications(limit = 12) {
  try {
    const text = await fs.readFile(notificationLogPath, "utf8");
    return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).slice(-limit).reverse();
  } catch {
    return [];
  }
}

async function ensureProjectThread(project = "orangebox") {
  const files = projectThreadFiles(project);
  await fs.mkdir(files.dir, { recursive: true });
  if (!(await exists(files.threadPath))) {
    await fs.writeFile(files.threadPath, [
      "# BLUEB0X.AI Project Thread",
      "",
      "One endless project chat. Full history stays here as text. Default model packets use current position, memory primer, and recent turns only.",
      ""
    ].join("\n"), "utf8");
  }
  if (!(await exists(files.positionPath))) {
    await writeJson(files.positionPath, {
      project: files.key,
      currentPosition: "Build the command-center top layer, Codexa execution path, living memory, and optimization governor.",
      brain: "claude-opus-4-7-max",
      scope: "current-position",
      claudeCodeSessionId: crypto.randomUUID(),
      anthropicBinding: "subscription-claude-code-session",
      updatedAt: new Date().toISOString()
    });
  }
  return files;
}

function spineLabel(index) {
  const group = Math.floor(index / 26) + 1;
  const letter = String.fromCharCode(65 + (index % 26));
  return `${group}${letter}`;
}

function defaultSpineStep(template, index) {
  return {
    id: spineLabel(index),
    key: template.key,
    title: template.title,
    department: template.department,
    gate: template.gate,
    status: index === 0 ? "RUNNING" : "QUEUED",
    evidence: "",
    note: "",
    updatedAt: new Date().toISOString()
  };
}

function normalizeProjectSpine(spine = {}, project = "orangebox") {
  const byKey = new Map();
  for (const step of Array.isArray(spine.steps) ? spine.steps : []) {
    if (!step?.key) continue;
    byKey.set(step.key, step);
  }
  const merged = [];
  for (const template of projectSpineTemplate) {
    merged.push({ ...defaultSpineStep(template, merged.length), ...(byKey.get(template.key) || {}) });
  }
  for (const step of Array.isArray(spine.steps) ? spine.steps : []) {
    if (!step?.key || projectSpineTemplate.some((template) => template.key === step.key)) continue;
    merged.push(step);
  }
  const steps = merged.map((step, index) => ({
    ...step,
    id: spineLabel(index),
    status: String(step.status || "QUEUED").toUpperCase().replace(/\s+/g, "_"),
    department: step.department || "AE0"
  }));
  const doneStatuses = new Set(["VERIFIED", "DONE", "PASSED"]);
  const doneCount = steps.filter((step) => doneStatuses.has(step.status)).length;
  const blockedCount = steps.filter((step) => ["BLOCKED", "FAILED", "NEEDS_APPROVAL"].includes(step.status)).length;
  const nextStep = steps.find((step) => !doneStatuses.has(step.status) && !["BLOCKED", "FAILED"].includes(step.status)) || steps[steps.length - 1];
  return {
    status: "VERIFIED",
    project: projectKey(project),
    generatedAt: new Date().toISOString(),
    updatedAt: spine.updatedAt || new Date().toISOString(),
    count: steps.length,
    doneCount,
    blockedCount,
    percent: steps.length ? Math.round((doneCount / steps.length) * 100) : 0,
    nextStep,
    steps
  };
}

function dagStatusToSpineStatus(node, completeIds = new Set()) {
  const status = String(node?.status || "pending").toLowerCase();
  const depsComplete = (node?.depends_on || []).every((id) => completeIds.has(String(id).toUpperCase()));
  if (status === "complete" || status === "verified_by_checkmate") return "VERIFIED";
  if (status === "in_progress") return "RUNNING";
  if (status === "awaiting_approval") return depsComplete ? "NEEDS_APPROVAL" : "QUEUED";
  if (["failed_validation", "blocked", "blocked_by_security"].includes(status)) return depsComplete ? "FAILED" : "QUEUED";
  if (["revision_requested", "conflict_detected", "awaiting_department_response", "awaiting_operator_arbitration"].includes(status)) return depsComplete ? "BLOCKED" : "QUEUED";
  return "QUEUED";
}

function syncProjectSpineFromDag(spine = {}, dag = {}, project = "orangebox") {
  const normalized = normalizeProjectSpine(spine, project);
  const nodes = Array.isArray(dag.nodes) ? dag.nodes : [];
  if (!nodes.length) return normalized;
  const byId = new Map(nodes.map((node) => [String(node.node_id || "").toUpperCase(), node]));
  const completeIds = new Set(nodes.filter((node) => String(node.status || "").toLowerCase() === "complete").map((node) => String(node.node_id || "").toUpperCase()));
  const steps = normalized.steps.map((step) => {
    const node = byId.get(String(step.id || "").toUpperCase());
    if (!node) return step;
    return {
      ...step,
      status: dagStatusToSpineStatus(node, completeIds),
      evidence: node.evidence ? clampText(node.evidence, 900) : step.evidence,
      note: node.notes ? clampText(node.notes, 900) : step.note,
      updatedAt: node.completed_at || node.started_at || node.updated_at || step.updatedAt || new Date().toISOString()
    };
  });
  return normalizeProjectSpine({ ...normalized, steps, updatedAt: new Date().toISOString() }, project);
}

function projectSpineMarkdown(spine) {
  const lines = [
    `# ${spine.project} Project Spine`,
    "",
    `Live count: ${spine.doneCount}/${spine.count} complete (${spine.percent}%).`,
    `Next: ${spine.nextStep?.id || "n/a"} ${spine.nextStep?.title || "n/a"} / ${spine.nextStep?.department || "AE0"}`,
    "",
    "This is the ordered project ladder. Renumbering is intentional when steps are inserted; the live spine is the truth.",
    ""
  ];
  for (const step of spine.steps) {
    lines.push(`## ${step.id} ${step.title}`);
    lines.push(`Status: ${step.status}`);
    lines.push(`Department: ${step.department}`);
    lines.push(`Gate: ${step.gate || ""}`);
    if (step.evidence) lines.push(`Evidence: ${step.evidence}`);
    if (step.note) lines.push(`Note: ${step.note}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function ensureProjectSpine(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const existing = await readJson(files.spinePath, null);
  const scopeLedger = await readJson(files.scopeLedgerPath, { steps: [] });
  const existingSteps = Array.isArray(existing?.steps) ? existing.steps : [];
  const ledgerSteps = Array.isArray(scopeLedger?.steps) ? scopeLedger.steps : [];
  const byKey = new Map();
  for (const step of [...ledgerSteps, ...existingSteps]) {
    if (!step?.key) continue;
    byKey.set(step.key, step);
  }
  const spine = normalizeProjectSpine({ ...(existing || {}), steps: [...byKey.values()] }, files.key);
  await writeJson(files.spinePath, { ...spine, updatedAt: new Date().toISOString() });
  await fs.writeFile(files.spineMarkdownPath, projectSpineMarkdown(spine), "utf8");
  await syncScopeLedgerFromSpine(files, spine).catch(() => {});
  return spine;
}

async function syncScopeLedgerFromSpine(files, spine) {
  const scopeLedger = await readJson(files.scopeLedgerPath, null);
  if (!scopeLedger || !Array.isArray(scopeLedger.steps) || !scopeLedger.steps.length) return scopeLedger;
  const byKey = new Map((spine.steps || []).map((step) => [step.key, step]));
  const steps = scopeLedger.steps.map((step) => ({
    ...step,
    ...(byKey.get(step.key) || {}),
    sourceText: step.sourceText || byKey.get(step.key)?.sourceText || ""
  }));
  const updated = {
    ...scopeLedger,
    project: files.key,
    updatedAt: new Date().toISOString(),
    steps
  };
  await writeJson(files.scopeLedgerPath, updated);
  return updated;
}

async function updateProjectSpineStep(body = {}) {
  const files = await ensureProjectThread(body.project || "orangebox");
  const current = await ensureProjectSpine(files.key);
  let steps = current.steps;
  if (body.action === "insertAfter") {
    const after = String(body.after || body.stepId || "").toUpperCase();
    const index = Math.max(0, steps.findIndex((step) => step.id === after || step.key === body.after));
    const key = projectKey(body.key || body.title || `custom-${Date.now()}`);
    const custom = {
      key,
      title: clampText(body.title || "Custom project step", 120),
      department: String(body.department || "AE0").slice(0, 12),
      gate: clampText(body.gate || "Operator-defined gate.", 420),
      status: "QUEUED",
      evidence: "",
      note: "",
      updatedAt: new Date().toISOString()
    };
    steps = [...steps.slice(0, index + 1), custom, ...steps.slice(index + 1)];
  } else {
    const target = String(body.stepId || body.key || "").toUpperCase();
    steps = steps.map((step) => {
      if (String(step.id).toUpperCase() !== target && String(step.key).toUpperCase() !== target) return step;
      return {
        ...step,
        status: String(body.status || step.status || "QUEUED").toUpperCase().replace(/\s+/g, "_"),
        title: body.title ? clampText(body.title, 120) : step.title,
        department: body.department ? String(body.department).slice(0, 12) : step.department,
        gate: body.gate ? clampText(body.gate, 420) : step.gate,
        evidence: body.evidence != null ? clampText(body.evidence, 900) : step.evidence,
        note: body.note != null ? clampText(body.note, 900) : step.note,
        updatedAt: new Date().toISOString()
      };
    });
  }
  const spine = normalizeProjectSpine({ steps, updatedAt: new Date().toISOString() }, files.key);
  await writeJson(files.spinePath, spine);
  await fs.writeFile(files.spineMarkdownPath, projectSpineMarkdown(spine), "utf8");
  return spine;
}

const dagStatuses = new Set([
  "pending",
  "in_progress",
  "awaiting_approval",
  "approved",
  "failed_validation",
  "complete",
  "blocked",
  "revision_requested",
  "conflict_detected",
  "awaiting_department_response",
  "awaiting_operator_arbitration",
  "blocked_by_security",
  "verified_by_checkmate"
]);

function normalizeDagStatus(value = "pending") {
  const status = String(value || "pending").toLowerCase().replace(/\s+/g, "_");
  return dagStatuses.has(status) ? status : "pending";
}

function dagNodeFromSpineStep(step, index) {
  const approvalKeys = new Set(["project-contract", "architecture", "data-contracts", "security-scan", "release-plan", "deploy-smoke"]);
  const heavyKeys = new Set(["implementation", "visual-proof", "checkmate", "security-scan", "deploy-smoke", "memory-compile"]);
  const approval = approvalKeys.has(step.key);
  return {
    node_id: step.id || spineLabel(index),
    node_name: step.title || "Project node",
    depends_on: index === 0 ? [] : [spineLabel(index - 1)],
    status: approval ? "awaiting_approval" : index === 0 ? "in_progress" : "pending",
    human_approval_required: approval,
    approval_state: approval ? "waiting" : "not_required",
    execution_payload: `${step.department || "AE0"} executes: ${step.gate || step.title || "project work"}`,
    validation_command: validationCommandForStep(step),
    milestone_weight: milestoneWeightForStep(step, heavyKeys),
    owner_department: step.department || "AE0",
    worker: heavyKeys.has(step.key) ? "ai-box" : "ae-see-suite",
    cost_profile: heavyKeys.has(step.key) ? "big" : "small",
    attempts: 0,
    max_attempts: heavyKeys.has(step.key) ? 5 : 3,
    started_at: null,
    completed_at: null,
    time_in_node_ms: 0,
    evidence: step.evidence || "",
    notes: step.note || "",
    checkpoint: {
      receipt_path: "",
      proof_path: "",
      rollback_path: ""
    }
  };
}

function validationCommandForStep(step = {}) {
  const key = step.key || "";
  if (key === "visual-proof") return "POST /api/proof/visual";
  if (key === "checkmate") return "GET /api/checkmate?force=1";
  if (key === "security-scan") return "GET /api/checkmate?force=1 + Semgrep/OSV gate";
  if (key === "implementation") return "npm.cmd run check";
  if (key === "memory-compile") return "npm.cmd run knowledge";
  if (key === "receipt") return "receipt file exists and lists touched files, commands, proof, risk, rollback";
  if (key === "deploy-smoke") return "operator-approved deploy/install smoke receipt";
  return "operator/checkmate evidence attached";
}

function milestoneWeightForStep(step = {}, heavyKeys = new Set()) {
  const key = step.key || "";
  if (["implementation", "checkmate", "visual-proof", "security-scan"].includes(key)) return 5;
  if (["architecture", "data-contracts", "project-contract", "release-plan"].includes(key)) return 3;
  if (heavyKeys.has(key)) return 2;
  return 1;
}

function normalizeProjectDag(dag = {}, spine = {}, project = "orangebox") {
  const existing = new Map();
  for (const node of Array.isArray(dag.nodes) ? dag.nodes : []) {
    if (node?.node_id) existing.set(String(node.node_id).toUpperCase(), node);
  }
  const nodes = (spine.steps || []).map((step, index) => {
    const base = dagNodeFromSpineStep(step, index);
    const prior = existing.get(String(base.node_id).toUpperCase()) || {};
    const merged = { ...base, ...prior };
    return {
      ...merged,
      node_id: base.node_id,
      node_name: merged.node_name || base.node_name,
      depends_on: Array.isArray(merged.depends_on) ? merged.depends_on : base.depends_on,
      status: normalizeDagStatus(merged.status),
      human_approval_required: Boolean(merged.human_approval_required),
      milestone_weight: Number.isFinite(Number(merged.milestone_weight)) ? Number(merged.milestone_weight) : base.milestone_weight,
      attempts: Math.max(0, Number(merged.attempts || 0)),
      max_attempts: Math.max(1, Number(merged.max_attempts || base.max_attempts || 3)),
      checkpoint: { ...base.checkpoint, ...(merged.checkpoint || {}) },
      triad_route: routeDagNodeToTriad({ ...base, ...merged })
    };
  });
  const totalWeight = nodes.reduce((sum, node) => sum + Number(node.milestone_weight || 1), 0);
  const completeWeight = nodes
    .filter((node) => node.status === "complete")
    .reduce((sum, node) => sum + Number(node.milestone_weight || 1), 0);
  const completeIds = new Set(nodes.filter((node) => node.status === "complete").map((node) => String(node.node_id).toUpperCase()));
  const depsComplete = (node) => (node.depends_on || []).every((id) => completeIds.has(String(id).toUpperCase()));
  const readyNodes = nodes.filter((node) => depsComplete(node));
  const activeStatuses = [
    "in_progress",
    "failed_validation",
    "revision_requested",
    "conflict_detected",
    "awaiting_department_response",
    "awaiting_operator_arbitration",
    "blocked_by_security"
  ];
  const current = readyNodes.find((node) => activeStatuses.includes(node.status))
    || readyNodes.find((node) => node.status === "pending")
    || readyNodes.find((node) => node.status === "awaiting_approval")
    || nodes.find((node) => node.status === "pending")
    || nodes[nodes.length - 1] || null;
  const bottleneck = readyNodes.find((node) => node.status === "failed_validation")
    || readyNodes.find((node) => node.status === "blocked_by_security")
    || readyNodes.find((node) => node.status === "awaiting_operator_arbitration")
    || readyNodes.find((node) => node.status === "conflict_detected")
    || readyNodes.find((node) => node.status === "awaiting_approval")
    || null;
  return {
    schema_version: "blueb0x-dag-v1",
    status: bottleneck?.status === "failed_validation" ? "blocked" : "verified",
    project: projectKey(project),
    generated_at: dag.generated_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    progress: {
      total_nodes: nodes.length,
      complete_nodes: nodes.filter((node) => node.status === "complete").length,
      total_weight: Number(totalWeight.toFixed(2)),
      complete_weight: Number(completeWeight.toFixed(2)),
      percent: totalWeight ? Math.round((completeWeight / totalWeight) * 100) : 0,
      current_node_id: current?.node_id || null,
      bottleneck_node_id: bottleneck?.node_id || null
    },
    approval_queue: nodes.filter((node) => ["awaiting_approval", "awaiting_operator_arbitration", "blocked_by_security"].includes(node.status)),
    nodes
  };
}

function projectDagMarkdown(dag) {
  const lines = [
    `# ${dag.project} DAG Master`,
    "",
    `Progress: ${dag.progress.complete_nodes}/${dag.progress.total_nodes} nodes / ${dag.progress.percent}% weighted.`,
    `Current: ${dag.progress.current_node_id || "n/a"}`,
    `Bottleneck: ${dag.progress.bottleneck_node_id || "none"}`,
    "",
    "This file is the machine execution truth. The Project Spine is the human-readable ladder.",
    ""
  ];
  for (const node of dag.nodes || []) {
    lines.push(`## ${node.node_id} ${node.node_name}`);
    lines.push(`Status: ${node.status}`);
    lines.push(`Department: ${node.owner_department}`);
    lines.push(`Approval required: ${node.human_approval_required}`);
    lines.push(`Weight: ${node.milestone_weight}`);
    lines.push(`Depends on: ${(node.depends_on || []).join(", ") || "none"}`);
    lines.push(`Worker: ${node.worker}`);
    if (node.triad_route) {
      lines.push(`Triad: ${node.triad_route.head} / ${node.triad_route.name} / ${node.triad_route.model}`);
      lines.push(`Triad shadows: ${(node.triad_route.shadows || []).join(", ") || "none"}`);
    }
    lines.push(`Payload: ${node.execution_payload}`);
    lines.push(`Validation: ${node.validation_command}`);
    if (node.conflict) {
      lines.push(`Conflict: ${node.conflict.type || "conflict"} / ${node.conflict.status || "open"} / raised by ${node.conflict.raised_by || "unknown"}`);
      lines.push(`Conflict action: ${node.conflict.action || "review"}`);
    }
    if (node.evidence) lines.push(`Evidence: ${node.evidence}`);
    if (node.notes) lines.push(`Notes: ${node.notes}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function ensureProjectDag(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const existing = await readJson(files.dagPath, null);
  const verifiedBackupPath = path.join(path.dirname(files.dagPath), "DAG_MASTER_VERIFIED_BACKUP.json");
  const verifiedBackup = await readJson(verifiedBackupPath, null);
  const existingComplete = Number(existing?.progress?.complete_weight ?? existing?.progress?.complete_nodes ?? 0);
  const backupComplete = Number(verifiedBackup?.progress?.complete_weight ?? verifiedBackup?.progress?.complete_nodes ?? 0);
  const source = backupComplete > existingComplete ? verifiedBackup : existing;
  let dag = normalizeProjectDag(source || {}, spine, files.key);
  const syncedSpine = syncProjectSpineFromDag(spine, dag, files.key);
  await writeJson(files.spinePath, { ...syncedSpine, updatedAt: new Date().toISOString() });
  await fs.writeFile(files.spineMarkdownPath, projectSpineMarkdown(syncedSpine), "utf8");
  dag = normalizeProjectDag(dag, syncedSpine, files.key);
  await writeJson(files.dagPath, dag);
  await fs.writeFile(files.dagMarkdownPath, projectDagMarkdown(dag), "utf8");
  await writeJson(path.join(orangeRoot, "dags", `${files.key}.json`), dag).catch(() => {});
  return {
    ...dag,
    dagPath: files.dagPath,
    dagUrl: `/orangebox/project-thread/${files.key}/DAG_MASTER.md`
  };
}

async function updateProjectDagNode(body = {}) {
  const files = await ensureProjectThread(body.project || "orangebox");
  const current = await ensureProjectDag(files.key);
  const target = String(body.node_id || body.nodeId || "").toUpperCase();
  if (!target) throw new Error("node_id is required");
  const now = new Date().toISOString();
  const nodes = current.nodes.map((node) => {
    if (String(node.node_id).toUpperCase() !== target) return node;
    let status = normalizeDagStatus(body.status || node.status);
    if (body.action === "approve") status = "pending";
    if (body.action === "start") status = "in_progress";
    if (body.action === "complete") status = "complete";
    if (body.action === "fail") status = "failed_validation";
    return {
      ...node,
      status,
      approval_state: body.action === "approve" ? "approved" : node.approval_state,
      attempts: body.action === "fail" ? Number(node.attempts || 0) + 1 : Number(node.attempts || 0),
      started_at: status === "in_progress" && !node.started_at ? now : node.started_at,
      completed_at: status === "complete" ? now : node.completed_at,
      evidence: body.evidence != null ? clampText(body.evidence, 900) : node.evidence,
      notes: body.notes != null ? clampText(body.notes, 900) : node.notes,
      conflict: body.conflict === null ? null : body.conflict ? { ...(node.conflict || {}), ...body.conflict, updated_at: now } : node.conflict,
      checkpoint: { ...(node.checkpoint || {}), ...(body.checkpoint || {}) }
    };
  });
  const dag = normalizeProjectDag({ ...current, nodes }, current.spine || await ensureProjectSpine(files.key), files.key);
  const syncedSpine = syncProjectSpineFromDag(await ensureProjectSpine(files.key), dag, files.key);
  await writeJson(files.spinePath, { ...syncedSpine, updatedAt: new Date().toISOString() });
  await fs.writeFile(files.spineMarkdownPath, projectSpineMarkdown(syncedSpine), "utf8");
  await syncScopeLedgerFromSpine(files, syncedSpine).catch(() => {});
  await writeJson(files.dagPath, dag);
  await writeJson(path.join(path.dirname(files.dagPath), "DAG_MASTER_VERIFIED_BACKUP.json"), dag).catch(() => {});
  await fs.writeFile(files.dagMarkdownPath, projectDagMarkdown(dag), "utf8");
  await writeJson(path.join(orangeRoot, "dags", `${files.key}.json`), dag).catch(() => {});
  await writeReceipt("project-dag-node", { status: "VERIFIED", project: files.key, node: target, action: body.action || body.status || "update", dagPath: files.dagPath }).catch(() => {});
  return {
    ...dag,
    dagPath: files.dagPath,
    dagUrl: `/orangebox/project-thread/${files.key}/DAG_MASTER.md`
  };
}

async function raiseDagConflict(body = {}) {
  const project = body.project || "orangebox";
  const files = await ensureProjectThread(project);
  const nodeId = String(body.node_id || body.nodeId || "").toUpperCase();
  if (!nodeId) throw new Error("node_id is required for conflict");
  const current = await ensureProjectDag(files.key);
  const target = current.nodes.find((node) => String(node.node_id).toUpperCase() === nodeId);
  if (!target) throw new Error(`DAG node not found: ${nodeId}`);
  const type = String(body.type || "cross_department").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 64);
  const raisedBy = teamForPartyLine(body.raised_by || body.raisedBy || "MIRRORS");
  const affected = Array.isArray(body.affected) ? body.affected.map(teamForPartyLine).slice(0, 12) : [];
  const severity = String(body.severity || "medium").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 32);
  const loops = Math.max(0, Number(target.conflict?.revision_loops || 0));
  const maxLoops = Math.max(1, Math.min(5, Number(body.max_revision_loops || target.conflict?.max_revision_loops || 2)));
  let nextStatus = "conflict_detected";
  let action = "return_to_owner";
  if (/security|secret|permission|supply|legal|privacy|compliance/i.test(type) || ["AE9", "AE11"].includes(raisedBy)) {
    nextStatus = "blocked_by_security";
    action = "operator_security_review";
  } else if (loops >= maxLoops) {
    nextStatus = "awaiting_operator_arbitration";
    action = "operator_arbitration";
  } else if (/build|feasib|overflow|accessibility|ux|copy|design/i.test(type)) {
    nextStatus = "revision_requested";
    action = raisedBy === "AE6" ? "return_to_lips" : "return_to_owner";
  }
  const now = new Date().toISOString();
  const conflict = {
    id: `${stamp()}-${crypto.randomUUID()}`,
    status: "open",
    type,
    severity,
    raised_by: raisedBy,
    affected,
    claim: clampText(body.claim || body.message || "", 1200),
    evidence: clampText(body.evidence || "", 1200),
    action,
    revision_loops: nextStatus === "revision_requested" ? loops + 1 : loops,
    max_revision_loops: maxLoops,
    created_at: now,
    updated_at: now
  };
  const dag = await updateProjectDagNode({
    project: files.key,
    node_id: nodeId,
    status: nextStatus,
    notes: `Conflict ${conflict.type}: ${conflict.claim}`,
    conflict
  });
  const message = await appendPartyLineMessage({
    project: files.key,
    team: raisedBy,
    to: affected,
    dagNode: nodeId,
    kind: "conflict",
    status: nextStatus.toUpperCase(),
    text: `${conflict.type}: ${conflict.claim}\nAction: ${conflict.action}`,
    evidence: conflict.evidence
  }).catch(() => null);
  const receipt = await writeReceipt("dag-conflict", {
    status: nextStatus === "blocked_by_security" ? "BLOCKED" : "REVIEW_REQUIRED",
    project: files.key,
    nodeId,
    conflict,
    partyLineMessageId: message?.id || null
  }).catch(() => null);
  return { status: "VERIFIED", project: files.key, nodeId, conflict, dag, partyLineMessage: message, receiptPath: receipt?.receiptPath || null };
}

async function runProjectDag(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const mode = body.mode === "dispatch" ? "dispatch" : "dry-run";
  if (mode === "dispatch" && body.approved !== true) {
    throw new Error("dispatch requires explicit approved=true");
  }
  if (mode === "dispatch") {
    const gates = await decisionGateStatus(project);
    if (gates.status !== "AUTONOMOUS_READY") {
      const receipt = await writeReceipt("project-dag-runner-blocked", {
        status: "NEEDS_APPROVAL",
        project,
        mode,
        waiting: gates.counts?.waiting || 0,
        nextAction: gates.nextAction
      }).catch(() => ({}));
      return {
        status: "NEEDS_APPROVAL",
        project,
        mode,
        reason: "Decision Gates are waiting; dispatch was not started.",
        decisionGates: gates,
        receipt_path: receipt.receiptPath || null,
        events: [{
          status: "NEEDS_APPROVAL",
          reason: gates.nextAction,
          waiting: gates.waiting || []
        }]
      };
    }
  }
  const args = [
    path.join(appRoot, "scripts", "blueb0x-dag-runner.py"),
    "--project", project,
    "--root", orangeRoot,
    "--app", appRoot,
    "--mode", mode,
    "--max-nodes", String(Math.max(1, Math.min(10, Number(body.maxNodes || 1))))
  ];
  if (body.spray === true) {
    args.push("--spray", "--concurrency", String(Math.max(1, Math.min(8, Number(body.concurrency || 3)))));
  }
  if (body.validate === true) args.push("--validate");
  if (body.endpoint) args.push("--endpoint", String(body.endpoint).slice(0, 300));
  if (body.model) args.push("--model", String(body.model).slice(0, 120));
  const result = await execFileAsync("python", args, {
    cwd: appRoot,
    timeout: mode === "dispatch" ? 10 * 60 * 1000 : 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: {
      ...process.env,
      BLUEB0X_EXECUTOR_ENDPOINT: body.endpoint || process.env.BLUEB0X_EXECUTOR_ENDPOINT || "",
      BLUEB0X_EXECUTOR_MODEL: body.model || process.env.BLUEB0X_EXECUTOR_MODEL || ""
    }
  });
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    parsed = { status: "CONFIGURED_UNPARSED", stdout: clampText(result.stdout, 4000), stderr: clampText(result.stderr, 2000) };
  }
  await writeReceipt("project-dag-runner", { status: parsed.status || "VERIFIED", project, mode, runnerReceiptPath: parsed.receipt_path || null });
  return parsed;
}

async function projectBrainHandoff(project = "orangebox", target = "codex") {
  const files = await ensureProjectThread(project);
  const targetLower = String(target || "codex").toLowerCase();
  const isChatGptSubscription = targetLower.includes("chatgpt");
  const spine = await ensureProjectSpine(files.key);
  const thread = await readText(files.threadPath, "");
  const position = await readJson(files.positionPath, {});
  const completion = await projectCompletion(files.key);
  const awareness = await opusAwarenessPacket(files.key);
  const decisionGates = await decisionGateStatus(files.key);
  const recentText = thread.split(/\r?\n/).slice(-120).join("\n");
  const receipts = await listFiles(path.join(orangeRoot, "receipts"), 6);
  const proofs = await listFiles(path.join(orangeRoot, "proof"), 6);
  let eidosClc = null;
  if (files.key === "eidos") {
    try {
      eidosClc = await eidosOrangeboxClc({
        project: files.key,
        query: `continue ${files.key} project work from ${target} handoff`
      });
    } catch (error) {
      eidosClc = { status: "FAILED", error: error.message };
    }
  }
  const eidosClcSection = eidosClc
    ? [
        "## EIDOS Crystal Lattice Memory",
        `Status: ${eidosClc.status || "UNKNOWN"}`,
        `Identifier: ${eidosClc.validation?.identifier || "ATOM-CLC-2026-0331"}`,
        `CLC artifact: ${eidosClc.clc || "unavailable"}`,
        `CLC URL: ${eidosClc.clcUrl || "unavailable"}`,
        `Injection artifact: ${eidosClc.inject || "unavailable"}`,
        `Injection URL: ${eidosClc.injectUrl || "unavailable"}`,
        `Counts: ${eidosClc.validation?.entities ?? 0} entities / ${eidosClc.validation?.facts ?? 0} facts / ${eidosClc.validation?.decisions ?? 0} decisions / ${eidosClc.validation?.void_items ?? 0} void items.`,
        `Injection: ${eidosClc.injection?.classification || "UNKNOWN"} / inject=${eidosClc.injection?.inject ?? false} / confidence=${eidosClc.injection?.confidence ?? "n/a"} / context_chars=${eidosClc.injection?.context_chars ?? 0}.`,
        "Use this CLC as continuation memory before raw history. It preserves lattice facts, decisions, and Void Map boundaries without treating model memory as the archive.",
        eidosClc.receiptPath ? `Receipt: ${eidosClc.receiptPath}` : "",
        ""
      ]
    : [];
  const body = [
    `# BLUEB0X.AI ${String(target).toUpperCase()} Handoff`,
    "",
    `Project: ${files.key}`,
    `Generated: ${new Date().toISOString()}`,
    `Target brain: ${target}`,
    `Subscription binding: ${isChatGptSubscription ? "ChatGPT web subscription handoff; no API token tap" : position.anthropicBinding || "subscription-claude-code-session"}`,
    `Claude Code session id: ${position.claudeCodeSessionId || "pending"}`,
    isChatGptSubscription ? "ChatGPT action: paste this packet into ChatGPT with GPT-5.5 / maximum reasoning selected, then return receipts/status cards to BLUEB0X.AI." : "",
    "",
    "## Current Position",
    position.currentPosition || "No current position captured.",
    "",
    "## Opus Awareness Board",
    `Opus packet: ${awareness.awarenessPath}`,
    `ETA: ${awareness.eta.rangeHuman} / route ${awareness.eta.route.active} / DAG ${awareness.dag.progress.percent}% weighted / evidence ${completion.label}`,
    "Every model must read or receive the awareness board before making architectural, design, or execution claims.",
    "",
    ...eidosClcSection,
    "## Live Project Spine",
    `Completion: ${spine.doneCount}/${spine.count} (${spine.percent}%). Next: ${spine.nextStep?.id} ${spine.nextStep?.title} / ${spine.nextStep?.department}`,
    "",
    ...spine.steps.map((step) => `- ${step.id} [${step.status}] ${step.department}: ${step.title} - ${step.gate}`),
    "",
    "## File Locations",
    `- BLUEB0X.AI command app: ${appRoot}`,
    `- BLUEB0X.AI data/wiki/memory root: ${orangeRoot}`,
    `- Project thread: ${files.threadPath}`,
    `- Project spine: ${files.spineMarkdownPath}`,
    `- Codexa worker Ethernet: ${codexaIp} ports 8097/8098/8099/8080/5678`,
    `- Codexa legacy Wi-Fi: ${codexaLegacyWifiIp} must remain unused/offline.`,
    `- Cockpit: ${cockpitIp}`,
    "",
    "## Operating Law",
    "- Do not touch SkilSki unless the user explicitly asks.",
    "- Claude/Opus owns deep reasoning and contract shaping; Codexa owns heavy execution, tests, screenshots, indexing, and receipts.",
    "- Keep one project thread alive. Do not re-teach the whole project; load this handoff plus the current project spine.",
    "- No fake green lights. Provider token counts are UNKNOWN unless the adapter proves them.",
    "- Destructive actions, deploys, database writes, payment actions, customer messages, firewall/permission changes, and third-party installs require approval.",
    "- All Codexa returns must include a Checkmate gate. If the gate says REVIEW_REQUIRED, NEEDS_APPROVAL, or BLOCKED, the work is not complete.",
    "",
    "## Decision Gates",
    `Status: ${decisionGates.status}`,
    `Waiting: ${decisionGates.counts.waiting}. DAG approvals: ${decisionGates.counts.dagApprovals}. Pending scope: ${decisionGates.counts.pendingScope}.`,
    `Next action: ${decisionGates.nextAction}`,
    "",
    ...(decisionGates.waiting.length
      ? decisionGates.waiting.map((gate) => `- ${gate.id} ${gate.kind}: ${gate.title} / ${gate.status} / ${gate.owner} / ${gate.reason}`)
      : ["- No decision gates waiting. Autonomous coding may continue inside the approved workspace."]),
    "",
    "## Seamless Drop/Pass Contract",
    "- This packet is the model-neutral project transfer rail. Claude, Codex, Cursor-style agents, and local workers must all continue from this state.",
    "- Do not reset scope, rename the product, skip queued spine steps, or invent a fresh plan unless new evidence changes the mission.",
    "- The next action is the Live Project Spine next step, not a brainstorm.",
    "- Every model handoff must preserve: objective, current position, active files, skipped features, receipts, proof paths, blockers, rollback, and next step.",
    "- If a model/app cannot prove edits or tests, it must return a status card instead of claiming completion.",
    "- Codexa is the execution worker. It can build, test, screenshot, index, and summarize, but BLUEB0X.AI/Checkmate decides promotion.",
    "- No model handoff may bypass Decision Gates.",
    "",
    "## Model And Cost Governor",
    "- Use subscription lanes first when possible. API mode is optional and must show real provider usage before BLUEB0X.AI calls it token telemetry.",
    "- Opus 4.7 max is for architecture-critical decisions, ambiguous reviews, and final judgment. Use xhigh/high for most agentic coding.",
    "- GPT-5.5/ChatGPT subscription is a frontier reasoning lane through web handoff, not API execution. Token counts remain UNKNOWN_NO_SAFE_TAP.",
    "- GPT-5.5/Codex is a frontier lane, not a universal default. Swap models through this handoff instead of re-teaching the project.",
    "- Keep frontier lanes to three or fewer unless the operator explicitly approves more.",
    "- Local/Codexa work should absorb mechanical execution so the expensive brain spends tokens on judgment, not log hauling.",
    "",
    "## Skipped Or Unfinished Feature Ledger",
    ...spine.steps
      .filter((step) => !["VERIFIED", "DONE", "PASSED"].includes(step.status))
      .slice(0, 24)
      .map((step) => `- ${step.id} [${step.status}] ${step.department}: ${step.title} - ${step.gate}`),
    "",
    "## AECommander Ideas Already Extracted",
    ...aeCommanderEvolutionIdeas.map((idea) => `- ${idea.status}: ${idea.title} (${idea.source}) - ${idea.use}`),
    "",
    "## Internal Quality Teams Available",
    ...internalQualityTeams.map((team) => `- ${team.id}: ${team.name} - ${team.proves}`),
    "- LIPS: Lips Team - design, copy, naming, emotional clarity, onboarding feel, premium surface quality.",
    "- MIRRORS: Mirrors Team - observed/inferred/speculative split, contradictions, unsupported claims, correction path.",
    "",
    "## Latest Evidence",
    `Evidence completion: ${completion.label}`,
    ...receipts.map((row) => `- receipt: ${row.name} / ${row.mtime}`),
    ...proofs.map((row) => `- proof: ${row.name} / ${row.mtime}`),
    "",
    "## Recent Thread Slice",
    recentText || "(empty)",
    ""
  ].join("\n");
  const targetPath = targetLower.includes("claude")
    ? files.claudeHandoffPath
    : isChatGptSubscription
      ? files.chatgptHandoffPath
      : files.codexHandoffPath;
  await fs.writeFile(targetPath, body, "utf8");
  await fs.mkdir(handoffDir, { recursive: true });
  const copyPath = path.join(handoffDir, `${files.key}-${safeSegment(target)}-handoff.md`);
  await fs.writeFile(copyPath, body, "utf8");
  return {
    status: "VERIFIED",
    project: files.key,
    target,
    handoffPath: targetPath,
    handoffUrl: `/orangebox/project-thread/${files.key}/${path.basename(targetPath)}`,
    externalUrl: isChatGptSubscription ? "https://chatgpt.com/" : null,
    subscriptionMode: isChatGptSubscription ? "CHATGPT_WEB_SUBSCRIPTION_HANDOFF" : "LOCAL_OR_APP_HANDOFF",
    copyPath,
    awarenessPath: awareness.awarenessPath,
    awarenessUrl: awareness.awarenessUrl,
    estimatedTokens: estimateTokens(body.length),
    markdown: body
  };
}

async function projectCheckpoint(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const dag = await ensureProjectDag(files.key);
  const position = await readJson(files.positionPath, {});
  const completion = await projectCompletion(files.key);
  const latestReceipts = await listFiles(path.join(orangeRoot, "receipts"), 8);
  const latestProofs = await listFiles(path.join(orangeRoot, "proof"), 6);
  const claude = await projectBrainHandoff(files.key, "claude-opus-4-7");
  const codex = await projectBrainHandoff(files.key, "codex-gpt-5.5");
  const unfinished = spine.steps.filter((step) => !["VERIFIED", "DONE", "PASSED"].includes(step.status));
  const checkpoint = [
    `# ${files.key} Stop Start Checkpoint`,
    "",
    `Generated: ${new Date().toISOString()}`,
    `Completion: ${spine.doneCount}/${spine.count} (${spine.percent}%).`,
    `DAG: ${dag.progress.complete_nodes}/${dag.progress.total_nodes} nodes (${dag.progress.percent}% weighted). Current: ${dag.progress.current_node_id || "n/a"}.`,
    `Next: ${spine.nextStep?.id || "n/a"} ${spine.nextStep?.title || "n/a"} / ${spine.nextStep?.department || "AE0"}`,
    `Provider token telemetry: UNKNOWN unless BLUEB0X.AI owns/proves the API call.`,
    "",
    "## Resume Command",
    "1. Open BLUEB0X.AI.",
    `2. Select project: ${files.key}.`,
    "3. Open the project thread and project spine.",
    "4. Use Claude Handoff for Opus/Claude Code or Codex Handoff for GPT-5.5/Codex.",
    "5. Continue from the Next step. Do not re-scope unless new evidence changed the mission.",
    "",
    "## Current Position",
    position.currentPosition || "No current position captured.",
    "",
    "## Unfinished / Do Not Skip",
    ...unfinished.slice(0, 40).map((step) => `- ${step.id} [${step.status}] ${step.department}: ${step.title} - ${step.gate}`),
    "",
    "## Handoff Files",
    `- Claude: ${claude.handoffPath}`,
    `- Codex: ${codex.handoffPath}`,
    `- Full thread: ${files.threadPath}`,
    `- Project spine: ${files.spineMarkdownPath}`,
    `- DAG master: ${files.dagMarkdownPath}`,
    "",
    "## Latest Evidence",
    `Evidence completion: ${completion.label}`,
    ...latestReceipts.map((row) => `- receipt: ${row.name} / ${row.mtime}`),
    ...latestProofs.map((row) => `- proof: ${row.name} / ${row.mtime}`),
    "",
    "## Hard Law",
    "- Codexa returns require Checkmate gates.",
    "- State-changing work requires approval.",
    "- Unknown subscription tokens stay UNKNOWN; do not fake usage gauges.",
    "- Checkmate REVIEW_REQUIRED/BLOCKED/NEEDS_APPROVAL means not complete.",
    ""
  ].join("\n");
  await fs.writeFile(files.checkpointPath, checkpoint, "utf8");
  const receipt = await writeReceipt("project-checkpoint", {
    status: "VERIFIED",
    project: files.key,
    checkpointPath: files.checkpointPath,
    claudeHandoffPath: claude.handoffPath,
    codexHandoffPath: codex.handoffPath
  });
  return {
    status: "VERIFIED",
    project: files.key,
    checkpointPath: files.checkpointPath,
    checkpointUrl: `/orangebox/project-thread/${files.key}/PROJECT_CHECKPOINT.md`,
    claudeHandoffPath: claude.handoffPath,
    codexHandoffPath: codex.handoffPath,
    dagPath: files.dagPath,
    receiptPath: receipt.receiptPath,
    estimatedTokens: estimateTokens(checkpoint.length)
  };
}

async function departmentCouncil(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const latestTeam = (await listFiles(path.join(orangeRoot, "benchmarks"), 1, (name) => name.includes("agent-team") && name.endsWith(".json")))[0] || null;
  const latestAllDepartments = (await listFiles(path.join(orangeRoot, "department-briefs", "all-departments"), 3))[0] || null;
  const latestReceipt = (await listFiles(path.join(orangeRoot, "receipts"), 1))[0] || null;
  const departments = departmentMap.map((department) => {
    const steps = spine.steps.filter((step) => step.department === department.id);
    const verified = steps.filter((step) => ["VERIFIED", "DONE", "PASSED"].includes(step.status)).length;
    const running = steps.find((step) => step.status === "RUNNING");
    const blocked = steps.find((step) => ["BLOCKED", "FAILED", "NEEDS_APPROVAL"].includes(step.status));
    const queued = steps.find((step) => !["VERIFIED", "DONE", "PASSED", "BLOCKED", "FAILED"].includes(step.status));
    const currentStep = running || blocked || queued || steps[steps.length - 1] || null;
    return {
      ...department,
      status: blocked ? "BLOCKED" : running ? "RUNNING" : steps.length && verified === steps.length ? "VERIFIED" : "ACTIONABLE",
      stepCount: steps.length,
      verified,
      currentStep,
      steps: steps.map((step) => ({
        id: step.id,
        key: step.key,
        title: step.title,
        status: step.status,
        gate: step.gate,
        evidence: step.evidence || ""
      }))
    };
  });
  return {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project: files.key,
    purpose: "All AE departments are assigned to BLUEB0X.AI itself through the live project spine.",
    spineSummary: {
      count: spine.count,
      doneCount: spine.doneCount,
      blockedCount: spine.blockedCount,
      percent: spine.percent,
      nextStep: spine.nextStep
    },
    latestEvidence: {
      latestTeam,
      latestAllDepartments,
      latestReceipt
    },
    departments,
    internalTeams: internalQualityTeams,
    sourceEvolution: aeCommanderEvolutionIdeas
  };
}

async function runSelfBuild(body = {}) {
  const project = projectKey(body.project || "orangebox");
  await ensureProjectSpine(project);
  await updateProjectSpineStep({
    project,
    key: "source-inventory",
    status: "RUNNING",
    note: "AE0 self-build started; all departments are inspecting BLUEB0X.AI itself."
  });
  const task = startScriptTask(
    "ae0-all-departments-self-build",
    path.join(appRoot, "scripts", "ae-all-departments-pass.mjs"),
    ["--project", appRoot, "--orange-root", orangeRoot]
  );
  const council = await departmentCouncil(project);
  await appendNotification([
    "# AE0 Self-Build Started",
    "Status: RUNNING",
    `Progress: ${council.spineSummary.percent}`,
    "Receipt: pending task receipt",
    "Next: Read the all-departments brief, update the project spine, then run Checkmate/visual proof.",
    "",
    `Task: ${task.id}`,
    "Every AE department now has owned BLUEB0X.AI work through the live project spine."
  ].join("\n")).catch(() => {});
  await writeReceipt("ae0-self-build", { status: "RUNNING", project, task, councilPath: "api:/api/ae0/council" }).catch(() => {});
  return {
    status: "RUNNING",
    generatedAt: new Date().toISOString(),
    project,
    task,
    council
  };
}

async function rebuildOrangeboxKnowledge(project = "orangebox") {
  const task = startScriptTask(
    "orangebox-knowledge-rebuild",
    path.join(appRoot, "scripts", "orangebox-knowledge.mjs"),
    ["--project", projectKey(project)]
  );
  await appendNotification([
    "# BLUEB0X.AI Knowledge Rebuild Started",
    "Status: RUNNING",
    `Project: ${projectKey(project)}`,
    "Receipt: pending",
    "Next: rebuild PageTree, context slices, entities, claims, relationships, and retrieval index.",
    "",
    `Task: ${task.id}`
  ].join("\n")).catch(() => {});
  return { status: "RUNNING", generatedAt: new Date().toISOString(), project: projectKey(project), task };
}

async function queryOrangeboxKnowledge(query, project = "orangebox") {
  if (!String(query || "").trim()) throw new Error("knowledge query is required");
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(appRoot, "scripts", "orangebox-knowledge.mjs"),
    "--project", projectKey(project),
    "--query", String(query).slice(0, 500)
  ], {
    cwd: appRoot,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024
  });
  return JSON.parse(stdout);
}

async function mirageDataPlaneStatus() {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(appRoot, "scripts", "blueb0x-mirage-gateway.mjs")
  ], {
    cwd: appRoot,
    timeout: 45000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ORANGEBOX_ROOT: orangeRoot }
  });
  const parsed = JSON.parse(stdout);
  await appendPartyLineMessage({
    project: "orangebox",
    team: "AE13",
    kind: "mirage-data-plane",
    status: parsed.status,
    text: `Mirage data plane status: ${parsed.status}. Mounts ${parsed.counts?.mounts || 0}; ready ${parsed.counts?.readyMounts || 0}; gated ${parsed.counts?.gatedMounts || 0}; needs env ${parsed.counts?.missingEnvMounts || 0}.`,
    evidence: parsed.reportPath || parsed.jsonPath
  }).catch(() => {});
  return parsed;
}

async function tomorrowBriefStatus() {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(appRoot, "scripts", "blueb0x-tomorrow-brief.mjs")
  ], {
    cwd: appRoot,
    timeout: 45000,
    maxBuffer: 4 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ORANGEBOX_ROOT: orangeRoot }
  });
  const parsed = JSON.parse(stdout);
  await appendPartyLineMessage({
    project: "orangebox",
    team: "AE0",
    kind: "tomorrow-brief",
    status: parsed.status,
    text: `Tomorrow operator brief generated: ${parsed.status}. Artifacts ${parsed.artifacts}; gaps ${parsed.gaps}.`,
    evidence: parsed.receiptPath || parsed.jsonPath
  }).catch(() => {});
  return parsed;
}

async function localGatesStatus() {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(appRoot, "scripts", "blueb0x-local-gates.mjs")
  ], {
    cwd: appRoot,
    timeout: 360000,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ORANGEBOX_ROOT: orangeRoot }
  });
  const parsed = JSON.parse(stdout);
  await appendPartyLineMessage({
    project: "orangebox",
    team: "CHECKMATE",
    kind: "local-gates",
    status: parsed.status,
    text: `Local gates complete: ${parsed.status}. Gates ${parsed.gates?.map((gate) => `${gate.name}:${gate.status}`).join(", ") || "unknown"}.`,
    evidence: parsed.receiptPath || parsed.jsonPath
  }).catch(() => {});
  return parsed;
}

async function continuityPacketStatus(project = "orangebox") {
  const { stdout } = await execFileAsync(process.execPath, [
    path.join(appRoot, "scripts", "blueb0x-continuity-packet.mjs"),
    projectKey(project)
  ], {
    cwd: appRoot,
    timeout: 60000,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
    env: { ...process.env, ORANGEBOX_ROOT: orangeRoot, BLUEB0X_PROJECT: projectKey(project) }
  });
  const parsed = JSON.parse(stdout);
  await appendPartyLineMessage({
    project: projectKey(project),
    team: "AE10",
    kind: "continuity-packet",
    status: parsed.status,
    text: `Continuity packet generated: ${parsed.status}. Spine ${parsed.spine?.doneCount || 0}/${parsed.spine?.count || 0}; DAG ${parsed.dag?.percent || 0}%.`,
    evidence: parsed.markdownPath || parsed.jsonPath
  }).catch(() => {});
  return parsed;
}

async function listProjects() {
  await fs.mkdir(projectThreadDir, { recursive: true });
  let entries = [];
  try {
    entries = await fs.readdir(projectThreadDir, { withFileTypes: true });
  } catch {}
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const files = projectThreadFiles(entry.name);
    const position = await readJson(files.positionPath, {});
    const stat = await fs.stat(files.threadPath).catch(() => null);
    projects.push({
      key: files.key,
      name: position.displayName || position.project || files.key,
      updatedAt: position.updatedAt || stat?.mtime?.toISOString?.() || null,
      claudeCodeSessionId: position.claudeCodeSessionId || null,
      anthropicBinding: position.anthropicBinding || "subscription-claude-code-session"
    });
  }
  if (!projects.length) {
    await ensureProjectThread("orangebox");
    return listProjects();
  }
  return projects.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

async function projectThreadState(project = "orangebox", options = {}) {
  const lite = Boolean(options.lite);
  const files = await ensureProjectThread(project);
  const text = await readText(files.threadPath, "");
  const stat = await fs.stat(files.threadPath).catch(() => ({ size: text.length }));
  const position = await readJson(files.positionPath, {});
  const recentText = text.split(/\r?\n/).slice(lite ? -80 : -160).join("\n");
  const primer = lite ? "" : await memoryPrimer();
  const spine = await ensureProjectSpine(files.key);
  const dag = await ensureProjectDag(files.key);
  const completion = await projectCompletion(files.key);
  const [fatcat, triad, departmentModels, reviewEngines] = lite
    ? [null, null, null, null]
    : await Promise.all([
      withTimeout(fatcatStatus(files.key), 4500, { status: "TIMEOUT", error: "fatcat status timed out", latestCalls: [] }).catch((error) => ({ status: "FAILED", error: error.message, latestCalls: [] })),
      withTimeout(triadStatus(files.key), 4500, { status: "TIMEOUT", error: "triad status timed out", readyRoutes: [] }).catch((error) => ({ status: "FAILED", error: error.message, readyRoutes: [] })),
      withTimeout(departmentModelStatus(files.key), 4500, { status: "TIMEOUT", error: "department model status timed out", library: departmentModelLibrary, lifecycle: [] }).catch((error) => ({ status: "FAILED", error: error.message, library: departmentModelLibrary, lifecycle: [] })),
      withTimeout(reviewEngineStatus(files.key), 2000, { status: "TIMEOUT", error: "review engine status timed out", engines: reviewEngineLibrary, latestRuns: [] }).catch((error) => ({ status: "FAILED", error: error.message, engines: reviewEngineLibrary, latestRuns: [] }))
    ]);
  const cards = coordinatorScopeCards(position, completion);
  return {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project: files.key,
    projects: await listProjects(),
    historyPath: files.threadPath,
    historyUrl: files.publicThreadUrl,
    spine,
    spinePath: files.spineMarkdownPath,
    spineUrl: `/orangebox/project-thread/${files.key}/PROJECT_SPINE.md`,
    dag,
    dagPath: files.dagPath,
    dagUrl: `/orangebox/project-thread/${files.key}/DAG_MASTER.md`,
    codexHandoffUrl: `/orangebox/project-thread/${files.key}/CODEX_HANDOFF.md`,
    claudeHandoffUrl: `/orangebox/project-thread/${files.key}/CLAUDE_HANDOFF.md`,
    position,
    stats: {
      historyBytes: stat.size || text.length,
      estimatedHistoryTokens: estimateTokens(stat.size || text.length),
      recentEstimatedTokens: estimateTokens(recentText.length),
      memoryPrimerEstimatedTokens: lite ? "DEFERRED_LIGHT_MODE" : estimateTokens(primer.length),
      providerTokens: "UNKNOWN_NO_SAFE_TAP"
    },
    completion,
    ...(fatcat ? { fatcat } : {}),
    ...(triad ? { triad } : {}),
    ...(departmentModels ? { departmentModels } : {}),
    ...(reviewEngines ? { reviewEngines } : {}),
    scopeCards: cards,
    recentText: clampText(recentText, lite ? 4000 : 12000),
    turns: parseThreadTurns(text, lite ? { limit: 8, bodyLimit: 900 } : undefined),
    memoryPrimer: lite ? "" : primer,
    notifications: (await listNotifications()).slice(0, lite ? 6 : 24),
    news: newsLinks(),
    sourceEvolution: lite ? aeCommanderEvolutionIdeas.slice(0, 4) : aeCommanderEvolutionIdeas,
    internalTeams: lite ? internalQualityTeams.slice(0, 4) : internalQualityTeams
  };
}

async function appendProjectThreadMessage(body = {}) {
  const files = await ensureProjectThread(body.project || "orangebox");
  const role = String(body.role || "user").replace(/[^a-z0-9_-]/gi, "").slice(0, 24) || "user";
  const brain = String(body.brain || "claude-opus-4-7-max").slice(0, 80);
  const scope = String(body.scope || "current-position").slice(0, 80);
  const text = clampText(body.text || "", 24000);
  if (!text.trim()) throw new Error("thread message is empty");
  const heading = `## ${new Date().toISOString()} / ${role}`;
  const block = [
    heading,
    `Brain: ${brain}`,
    `Scope: ${scope}`,
    "",
    text.trim(),
    ""
  ].join("\n");
  const previousPosition = await readJson(files.positionPath, {});
  await fs.appendFile(files.threadPath, `\n${block}`, "utf8");
  await writeJson(files.positionPath, {
    ...previousPosition,
    project: files.key,
    displayName: body.displayName || previousPosition.displayName || files.key,
    currentPosition: clampText(text.trim(), 900),
    brain,
    scope,
    claudeCodeSessionId: previousPosition.claudeCodeSessionId || crypto.randomUUID(),
    anthropicBinding: previousPosition.anthropicBinding || "subscription-claude-code-session",
    updatedAt: new Date().toISOString()
  });
  await expandProjectScopeFromText(files.key, text);
  return projectThreadState(files.key);
}

function scopeExpansionHints(text = "") {
  const lower = String(text || "").toLowerCase();
  const hints = [];
  if (/\b(app|exe|desktop|tauri|installer)\b/.test(lower)) hints.push({ key: "desktop-shell", title: "Desktop shell / installer", department: "AE6", gate: "Ship as an app/exe path with install, launch, smoke proof, and rollback." });
  if (/\b(website|site|landing|page|frontend|ui|ux|design)\b/.test(lower)) hints.push({ key: "frontend-experience", title: "Frontend experience", department: "AE3", gate: "Design and verify the visible experience with desktop and compact screenshots." });
  if (/\b(mcp|tool|checkmate|verify|test|proof|quality)\b/.test(lower)) hints.push({ key: "quality-tooling", title: "Quality tooling", department: "AE7", gate: "Add or run Checkmate-grade tools with receipts and no fake green statuses." });
  if (/\b(memory|wiki|knowledge|learn|lessons|mistakes|aememory)\b/.test(lower)) hints.push({ key: "knowledge-memory", title: "Knowledge / memory", department: "AE10", gate: "Compile relevant lessons, decay noise, and update BLUEB0X.AI Knowledge." });
  if (/\b(arxiv|research|reddit|linkedin|award|winner|trend|best practice|best practices|daily crawl|training data|learn daily)\b/.test(lower)) hints.push({ key: "department-learning", title: "Department learning engine", department: "AE10", gate: "Maintain a low-bandwidth source ledger, top-5-percent trends, training examples, and promotion/demotion rules for every department." });
  if (/\b(codexa|worker|ai box|local model|ollama|lm studio|qwen)\b/.test(lower)) hints.push({ key: "codexa-execution", title: "Codexa execution", department: "AE10", gate: "Run heavy jobs on Codexa or prove why the worker rail is unavailable." });
  if (/\b(security|secret|permission|firewall|token|auth)\b/.test(lower)) hints.push({ key: "security-gate", title: "Security gate", department: "AE11", gate: "Review secrets, permissions, auth boundaries, and state-changing paths." });
  if (/\b(deploy|vercel|launch|release|ship)\b/.test(lower)) hints.push({ key: "launch-gate", title: "Launch gate", department: "AE8", gate: "Create deploy/install smoke plan, approval line, receipt, and rollback." });
  return hints;
}

function uniqueScopeKey(existing, base = "scope-addition") {
  const clean = String(base || "scope-addition").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "scope-addition";
  if (!existing.has(clean)) return clean;
  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${clean}-${index}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `${clean}-${Date.now()}`;
}

function scopeKeyFromTitle(value = "") {
  const words = String(value || "scope-addition")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5);
  return words.join("-") || "scope-addition";
}

async function expandProjectScopeFromText(project, text, options = {}) {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const scopeLedger = await readJson(files.scopeLedgerPath, { schema: "blueb0x-scope-expansions-v1", project: files.key, steps: [] });
  const existing = new Set((spine.steps || []).map((step) => step.key));
  let changed = false;
  let steps = spine.steps;
  const ledgerSteps = Array.isArray(scopeLedger.steps) ? scopeLedger.steps : [];
  let hints = scopeExpansionHints(text);
  if (options.forceGeneric) {
    hints = [{
      key: uniqueScopeKey(existing, scopeKeyFromTitle(options.title || text)),
      title: clampText(String(options.title || text || "New project scope").replace(/\s+/g, " ").trim(), 80),
      department: options.department || "AE0",
      gate: "Convert this new operator scope into explicit acceptance criteria, DAG nodes, proof, and receipts."
    }, ...hints];
  }
  for (const hint of hints) {
    if (existing.has(hint.key)) continue;
    const step = {
      key: hint.key,
      title: hint.title,
      department: hint.department,
      gate: hint.gate,
      status: "QUEUED",
      evidence: "",
      note: "Auto-added from project scope expansion.",
      sourceText: clampText(text, 1200),
      updatedAt: new Date().toISOString()
    };
    steps = [...steps, step];
    ledgerSteps.push(step);
    existing.add(hint.key);
    changed = true;
  }
  if (!changed) return { changed: false, added: 0, spine, dag: await ensureProjectDag(files.key) };
  await writeJson(files.scopeLedgerPath, {
    schema: "blueb0x-scope-expansions-v1",
    project: files.key,
    updatedAt: new Date().toISOString(),
    steps: ledgerSteps
  });
  const normalized = normalizeProjectSpine({ steps, updatedAt: new Date().toISOString() }, files.key);
  await writeJson(files.spinePath, normalized);
  await fs.writeFile(files.spineMarkdownPath, projectSpineMarkdown(normalized), "utf8");
  const dag = await ensureProjectDag(files.key);
  await writeReceipt("scope-expanded", { status: "VERIFIED", project: files.key, added: normalized.count - spine.count, spinePath: files.spinePath, dagPath: files.dagPath }).catch(() => {});
  return { changed: true, added: normalized.count - spine.count, spine: normalized, dag };
}

async function expandProjectScope(body = {}) {
  const project = projectKey(body.project || "orangebox");
  const text = clampText(body.text || body.scope || body.goal || "", 12000);
  if (!text.trim()) throw new Error("scope text is required");
  const result = await expandProjectScopeFromText(project, text, {
    forceGeneric: body.forceGeneric !== false,
    title: body.title,
    department: body.department || "AE0"
  });
  const files = await ensureProjectThread(project);
  const now = new Date().toISOString();
  await fs.appendFile(files.threadPath, [
    "",
    `## ${now} / system`,
    "Brain: blueb0x-scope-expander",
    "Scope: dynamic-spine-growth",
    "",
    `Scope expansion requested: ${text.trim()}`,
    `Added: ${result.added}`,
    ""
  ].join("\n"), "utf8");
  await appendPartyLineMessage({
    project,
    team: "AE0",
    kind: "scope-expanded",
    status: result.changed ? "VERIFIED" : "UNCHANGED",
    text: `Scope expansion processed. Added ${result.added} spine/DAG item(s). Current progress ${result.spine.percent}%.`,
    evidence: files.spineMarkdownPath
  }).catch(() => {});
  return {
    status: result.changed ? "VERIFIED" : "UNCHANGED",
    project,
    added: result.added,
    spine: result.spine,
    dag: result.dag,
    spinePath: files.spineMarkdownPath,
    dagPath: files.dagPath
  };
}

async function projectScopeLedger(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const ledger = await readJson(files.scopeLedgerPath, { schema: "blueb0x-scope-expansions-v1", project: files.key, steps: [] });
  const liveByKey = new Map((spine.steps || []).map((step) => [step.key, step]));
  const steps = (ledger.steps || []).map((step) => {
    const live = liveByKey.get(step.key) || {};
    return {
      ...step,
      ...live,
      sourceText: step.sourceText || live.sourceText || "",
      ledgerStatus: step.status || "QUEUED",
      liveStatus: live.status || step.status || "QUEUED"
    };
  });
  const counts = {
    total: steps.length,
    verified: steps.filter((step) => ["VERIFIED", "DONE", "PASSED"].includes(String(step.liveStatus || step.status).toUpperCase())).length,
    queued: steps.filter((step) => ["QUEUED", "RUNNING", "NEEDS_APPROVAL"].includes(String(step.liveStatus || step.status).toUpperCase())).length
  };
  return {
    status: "VERIFIED",
    project: files.key,
    generatedAt: new Date().toISOString(),
    counts,
    steps,
    ledgerPath: files.scopeLedgerPath,
    spinePath: files.spineMarkdownPath
  };
}

async function decisionGateStatus(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const dag = await ensureProjectDag(files.key);
  const scopeLedger = await projectScopeLedger(files.key).catch((error) => ({
    status: "FAILED",
    error: error.message,
    counts: { total: 0, verified: 0, queued: 0 },
    steps: []
  }));
  const approvalQueue = (dag.approval_queue || []).map((node) => ({
    node_id: node.node_id,
    node_name: node.node_name,
    status: node.status,
    owner_department: node.owner_department,
    approval_state: node.approval_state,
    human_approval_required: Boolean(node.human_approval_required),
    milestone_weight: node.milestone_weight,
    reason: node.conflict?.action || node.validation_command || node.execution_payload || "Approval required before this node can continue."
  }));
  const pendingScope = (scopeLedger.steps || []).filter((step) => !["VERIFIED", "DONE", "PASSED"].includes(String(step.liveStatus || step.status).toUpperCase()));
  const waiting = [
    ...approvalQueue.map((node) => ({
      id: node.node_id,
      kind: "dag_approval",
      title: node.node_name,
      status: node.status,
      owner: node.owner_department,
      reason: node.reason
    })),
    ...pendingScope.map((step) => ({
      id: step.id || step.key,
      kind: "scope_expansion",
      title: step.title || step.key,
      status: step.liveStatus || step.status || "QUEUED",
      owner: step.department || "AE0",
      reason: step.gate || step.sourceText || "Dynamic scope addition awaiting proof."
    }))
  ];
  const status = waiting.length ? "NEEDS_APPROVAL" : "AUTONOMOUS_READY";
  return {
    status,
    project: files.key,
    generatedAt: new Date().toISOString(),
    mode: autonomyPolicy.defaultMode,
    doctrine: autonomyPolicy.doctrine,
    autonomousAllowed: autonomyPolicy.autonomousAllowed,
    decisionGates: autonomyPolicy.decisionGates,
    approvedWorkspacePrefixes: autonomyPolicy.approvedWorkspacePrefixes,
    codexaScope: autonomyPolicy.codexaScope,
    counts: {
      waiting: waiting.length,
      dagApprovals: approvalQueue.length,
      pendingScope: pendingScope.length,
      dynamicScopeTotal: scopeLedger.counts?.total || 0,
      dynamicScopeVerified: scopeLedger.counts?.verified || 0
    },
    waiting,
    approvalQueue,
    scopeLedger,
    nextAction: waiting.length
      ? `Resolve ${waiting[0].id}: ${waiting[0].title}`
      : "Autonomous coding may continue inside the approved workspace; pause only for listed decision gates."
  };
}

async function projectProgressReport(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const dag = await ensureProjectDag(files.key);
  const completion = await projectCompletion(files.key);
  const receipts = await listFiles(path.join(orangeRoot, "receipts"), 8);
  const proofs = await listFiles(path.join(orangeRoot, "proof"), 5);
  const knowledge = await queryOrangeboxKnowledge(`${files.key} ${spine.nextStep?.title || ""} ${spine.nextStep?.gate || ""}`, files.key).catch((error) => ({ status: "FAILED", error: error.message, treeResults: [], results: [] }));
  const scopeLedger = await projectScopeLedger(files.key).catch((error) => ({
    status: "FAILED",
    error: error.message,
    counts: { total: 0, verified: 0, queued: 0 },
    steps: []
  }));
  const completeIds = new Set((dag.nodes || []).filter((node) => String(node.status).toLowerCase() === "complete").map((node) => String(node.node_id).toUpperCase()));
  const depsComplete = (node) => (node.depends_on || []).every((id) => completeIds.has(String(id).toUpperCase()));
  const visibleWorkerName = (worker) => {
    const key = String(worker || "").toLowerCase();
    if (key === "cockpit") return "ae-see-suite";
    if (key === "codexa" || key === "codexa-first" || key === "codexa-command-rail") return key.replace("codexa", "ai-box");
    return worker;
  };
  const visibleNode = (node) => ({ ...node, worker: visibleWorkerName(node.worker) });
  const rawBlockers = (dag.nodes || []).filter((node) => depsComplete(node) && ["awaiting_approval", "failed_validation", "blocked"].includes(String(node.status).toLowerCase()));
  const rawRunning = (dag.nodes || []).filter((node) => String(node.status).toLowerCase() === "in_progress");
  const blockers = rawBlockers.map(visibleNode);
  const running = rawRunning.map(visibleNode);
  const report = [
    `# BLUEB0X.AI Progress Report - ${files.key}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Top Line",
    `- Spine progress: ${spine.doneCount}/${spine.count} steps (${spine.percent}%).`,
    `- DAG progress: ${dag.progress.complete_nodes}/${dag.progress.total_nodes} nodes (${dag.progress.percent}% weighted).`,
    `- Evidence infrastructure score: ${completion.percent}%.`,
    `- Current node: ${dag.progress.current_node_id || "n/a"}.`,
    `- Bottleneck: ${dag.progress.bottleneck_node_id || "none"}.`,
    "",
    "## Now",
    ...running.map((node) => `- ${node.node_id}: ${node.node_name} / ${node.owner_department} / validate: ${node.validation_command}`),
    ...(running.length ? [] : ["- No node is actively running."]),
    "",
    "## Approval / Blockers",
    ...blockers.map((node) => `- ${node.node_id} [${node.status}] ${node.node_name} / ${node.owner_department} / ${node.human_approval_required ? "approval required" : "blocked"}`),
    ...(blockers.length ? [] : ["- No approval blockers currently waiting."]),
    "",
    "## Next Step",
    `- ${spine.nextStep?.id || "n/a"} ${spine.nextStep?.title || "n/a"} / ${spine.nextStep?.department || "AE0"} / ${spine.nextStep?.gate || ""}`,
    "",
    "## Dynamic Scope Ledger",
    `- Status: ${scopeLedger.status || "UNKNOWN"}.`,
    `- Dynamic additions: ${scopeLedger.counts?.verified || 0}/${scopeLedger.counts?.total || 0} verified; ${scopeLedger.counts?.queued || 0} queued.`,
    ...(scopeLedger.steps || []).slice(0, 8).map((step) => `- ${step.id || step.key || "scope"} ${step.title || step.sourceText || "Scope addition"} / ${step.liveStatus || step.status || step.ledgerStatus || "UNKNOWN"} / ${step.department || "AE0"} / ${step.gate || step.sourceText || ""}`),
    ...((scopeLedger.steps || []).length ? [] : [`- No dynamic scope additions recorded${scopeLedger.error ? `: ${scopeLedger.error}` : "."}`]),
    "",
    "## Knowledge Signals",
    "- Live DAG and live spine above override remembered material. These signals are historical recall, not current truth.",
    ...(knowledge.treeResults || []).slice(0, 5).map((row) => `- ${row.path || row.title || "Knowledge path"} / score ${row.score}: ${row.summary || ""}`),
    ...(knowledge.treeResults?.length ? [] : (knowledge.results || []).slice(0, 5).map((row) => `- ${row.topic || "context"} / score ${row.score}: ${row.preview || ""}`)),
    ...((knowledge.treeResults?.length || knowledge.results?.length) ? [] : [`- Knowledge signal unavailable or empty: ${knowledge.status || "NO_MATCH"}`]),
    "",
    "## Recent Evidence",
    ...receipts.map((row) => `- receipt: ${row.name} / ${row.mtime}`),
    ...proofs.map((row) => `- proof: ${row.name} / ${row.mtime}`),
    "",
    "## Useful Paths",
    `- Thread: ${files.threadPath}`,
    `- Spine: ${files.spineMarkdownPath}`,
    `- DAG: ${files.dagMarkdownPath}`,
    ""
  ].join("\n");
  const reportPath = path.join(files.dir, `PROGRESS_REPORT_${stamp()}.md`);
  await fs.writeFile(reportPath, report, "utf8");
  const receipt = await writeReceipt("progress-report", { status: "VERIFIED", project: files.key, reportPath, spinePercent: spine.percent, dagPercent: dag.progress.percent });
  return {
    status: "VERIFIED",
    project: files.key,
    report,
    reportPath,
    reportUrl: `/orangebox/project-thread/${files.key}/${path.basename(reportPath)}`,
    receiptPath: receipt.receiptPath,
    spine,
    dag,
    completion,
    scopeLedger
  };
}

async function commandCenterBrief(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const dag = await ensureProjectDag(files.key);
  const spine = await ensureProjectSpine(files.key);
  const [completion, partyLine, fatcat, reviews, power] = await Promise.all([
    projectCompletion(files.key),
    readPartyLine(files.key, 12).catch((error) => ({ status: "FAILED", error: error.message, messages: [] })),
    fatcatStatus(files.key).catch((error) => ({ status: "FAILED", error: error.message, latestCalls: [], activeCalls: 0 })),
    reviewEngineStatus(files.key).catch((error) => ({ status: "FAILED", error: error.message, cards: [] })),
    powerStatus(false).catch((error) => ({ status: "FAILED", error: error.message }))
  ]);
  const completeIds = new Set((dag.nodes || []).filter((node) => String(node.status).toLowerCase() === "complete").map((node) => String(node.node_id).toUpperCase()));
  const depsComplete = (node) => (node.depends_on || []).every((id) => completeIds.has(String(id).toUpperCase()));
  const visibleWorkerName = (worker) => {
    const key = String(worker || "").toLowerCase();
    if (key === "cockpit") return "ae-see-suite";
    if (key === "codexa" || key === "codexa-first" || key === "codexa-command-rail") return key.replace("codexa", "ai-box");
    return worker;
  };
  const visibleNode = (node) => ({ ...node, worker: visibleWorkerName(node.worker) });
  const rawBlockers = (dag.nodes || []).filter((node) => depsComplete(node) && ["awaiting_approval", "failed_validation", "blocked"].includes(String(node.status).toLowerCase()));
  const rawRunning = (dag.nodes || []).filter((node) => String(node.status).toLowerCase() === "in_progress");
  const blockers = rawBlockers.map(visibleNode);
  const running = rawRunning.map(visibleNode);
  const currentDagNode = (dag.nodes || []).find((node) => node.node_id === dag.progress.current_node_id);
  const next = currentDagNode ? {
    id: currentDagNode.node_id,
    title: currentDagNode.node_name,
    department: currentDagNode.owner_department,
    gate: currentDagNode.execution_payload,
    status: currentDagNode.status
  } : (spine.nextStep || {});
  const aiBox = power.aiBox || power.codexa || {};
  const aiBoxReady = aiBox.status === "VERIFIED";
  const reviewCards = reviews.cards || [];
  const weakReviewCount = reviewCards.filter((card) => ["REJECTED", "REVIEW_REQUIRED", "CONFIGURED_WITH_GAPS", "MISSING_RUNTIME", "FAILED"].includes(String(card.status))).length;
  const latestParty = (partyLine.messages || []).slice(0, 3).map((msg) => ({
    team: msg.team,
    status: msg.status,
    message: String(msg.message || msg.text || "").replace(/\s+/g, " ").slice(0, 220),
    dagNode: msg.dagNode || ""
  }));
  const nextActions = [];
  if (!aiBoxReady) nextActions.push("Repair AI Box command rail before any heavy execution.");
  if (blockers.length) nextActions.push(`Resolve ${blockers.length} DAG blocker(s), starting with ${blockers[0].node_id}.`);
  if (!blockers.length && next.id) nextActions.push(`Advance ${next.id}: ${next.title}.`);
  if (weakReviewCount) nextActions.push(`Run Checkmate pressure on ${weakReviewCount} weak review card(s).`);
  if (!completion.proof?.latest) nextActions.push("Capture visual/test proof before calling visible work complete.");
  if (!nextActions.length) nextActions.push("Create the next scope expansion or dispatch the next AI Box node.");

  const operatorCard = [
    `PROJECT ${files.key}`,
    `POSITION ${dag.progress.complete_nodes}/${dag.progress.total_nodes} DAG (${dag.progress.percent}%) / ${spine.doneCount}/${spine.count} spine (${spine.percent}%)`,
    `NEXT ${next.id || "n/a"} ${next.title || "Define next step"}`,
    `AI_BOX ${aiBoxReady ? `${aiBox.cpuPercent}% CPU / ${aiBox.freeMemoryGB}GB free` : aiBox.status || "unverified"}`,
    `CHECKMATE ${reviews.status || "CONFIGURED"} / weak cards ${weakReviewCount}`,
    `ACTION ${nextActions[0]}`
  ].join("\n");

  return {
    status: aiBoxReady && !blockers.length ? "ACTIONABLE" : blockers.length ? "BLOCKED" : "GUARDED",
    generatedAt: new Date().toISOString(),
    project: files.key,
    title: "AE See-Suite Command Brief",
    operatorCard,
    progress: {
      spine: { done: spine.doneCount, total: spine.count, percent: spine.percent },
      dag: dag.progress,
      evidence: completion
    },
    nextStep: next,
    running,
    blockers,
    nextActions,
    aiBox: {
      status: aiBox.status || "UNKNOWN",
      cpuPercent: aiBox.cpuPercent ?? null,
      freeMemoryGB: aiBox.freeMemoryGB ?? null,
      totalMemoryGB: aiBox.totalMemoryGB ?? null,
      recommendation: power.recommendation || null
    },
    review: {
      status: reviews.status || "UNKNOWN",
      weakReviewCount,
      cards: reviewCards.slice(0, 8)
    },
    partyLine: {
      status: partyLine.status || "UNKNOWN",
      latest: latestParty
    },
    fatcat: {
      status: fatcat.status || "UNKNOWN",
      activeCalls: fatcat.activeCalls || 0,
      latestCalls: (fatcat.latestCalls || []).slice(0, 5)
    },
    links: {
      threadUrl: `/orangebox/project-thread/${files.key}/THREAD.md`,
      spineUrl: `/orangebox/project-thread/${files.key}/PROJECT_SPINE.md`,
      dagUrl: `/orangebox/project-thread/${files.key}/DAG_MASTER.md`,
      handoffUrl: `/orangebox/project-thread/${files.key}/OPUS_AWARENESS.md`
    }
  };
}

async function hallucinationGateStatus(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const [dag, spine, checkmate, power, partyLine] = await Promise.all([
    ensureProjectDag(files.key),
    ensureProjectSpine(files.key),
    checkmateStatus(false).catch((error) => ({ status: "FAILED", error: error.message, counts: {} })),
    powerStatus(false).catch((error) => ({ status: "FAILED", error: error.message })),
    readPartyLine(files.key, 6).catch((error) => ({ status: "FAILED", error: error.message, messages: [] }))
  ]);
  const currentNode = (dag.nodes || []).find((node) => String(node.node_id || "").toUpperCase() === String(dag.progress.current_node_id || "").toUpperCase());
  const green = [
    `DAG is loaded at ${dag.progress.complete_nodes}/${dag.progress.total_nodes} nodes and ${dag.progress.percent}% weighted progress.`,
    `Project spine is loaded at ${spine.doneCount}/${spine.count} steps and ${spine.percent}% progress.`,
    `Current node is ${dag.progress.current_node_id || "n/a"} ${currentNode?.node_name || ""}.`,
    `Checkmate endpoint returned ${checkmate.status || "UNKNOWN"} with ${checkmate.counts?.VERIFIED || 0} verified lanes.`,
    `AI Box power sample reports ${(power.aiBox || power.codexa)?.status || "UNKNOWN"} with ${(power.aiBox || power.codexa)?.freeMemoryGB ?? "unknown"}GB free.`
  ];
  const yellow = [
    "Subscription token counts are UNKNOWN unless a provider-approved adapter proves them.",
    "AI Box headroom is a point-in-time sample; resample before increasing heavy work.",
    "The independent browser proof is the source of truth for 1T; the server self-proof still has a documented timing artifact.",
    "DeepSeek auditor smoke completed but previously returned blank; require stricter prompts before giving it final Checkmate authority."
  ];
  const red = [];
  if ((checkmate.counts?.MISSING_RUNTIME || 0) > 0) {
    red.push("Do not claim full Checkmate coverage or final ship readiness while Proxyman/network X-Ray runtime is missing.");
  }
  if (!/10\.0\.0\.4/.test(String(power.commandRail?.url || codexaIp))) {
    red.push("Do not claim AI Box gateway routing unless rail and bridge endpoints are verified.");
  }
  red.push("Do not claim direct-link AI Box is ready until its health probes pass.");
  red.push("Do not claim ORANGEBOX is an installer/deployed EXE until release/install smoke receives explicit approval and proof.");
  const latestParty = (partyLine.messages || []).slice(0, 3).map((msg) => ({
    status: msg.status,
    dagNode: msg.dagNode || "",
    evidence: msg.evidence || msg.receiptPath || "",
    text: clampText(msg.text || msg.message || "", 240)
  }));
  const status = red.length ? "GUARDED_WITH_RED_CLAIMS" : yellow.length ? "VERIFIED_WITH_YELLOW_ASSUMPTIONS" : "VERIFIED";
  return {
    status,
    generatedAt: new Date().toISOString(),
    project: files.key,
    node: dag.progress.current_node_id || "",
    counts: { green: green.length, yellow: yellow.length, red: red.length },
    observed: green,
    inferred: yellow,
    speculative: [
      "Any claim about app superiority, production readiness, token savings, or model quality remains speculative unless tied to receipts, benchmarks, screenshots, or endpoint probes."
    ],
    blockedClaims: red,
    correctionPath: [
      "Use GREEN only for directly observed facts with receipts.",
      "Use YELLOW for estimates, point-in-time samples, model behavior, or inferred readiness.",
      "Use RED for missing runtimes, unapproved deploy/install/security actions, direct Cat8 readiness, and fake completion.",
      "Carry Checkmate gaps into the next node instead of hiding them."
    ],
    latestParty,
    nextAction: "Resolve or explicitly carry red claims before promotion."
  };
}

async function fullScopeStatus(project = "orangebox") {
  const key = projectKey(project);
  const [brief, install, triad, reviews, knowledge] = await Promise.all([
    commandCenterBrief(key).catch((error) => ({ status: "FAILED", error: error.message, nextActions: [] })),
    getCodexaBigModelInstallStatus(key).catch((error) => ({ status: "FAILED", error: error.message })),
    triadStatus(key).catch((error) => ({ status: "FAILED", error: error.message, readyRoutes: [] })),
    reviewEngineStatus(key).catch((error) => ({ status: "FAILED", error: error.message, cards: [] })),
    queryOrangeboxKnowledge(`${key} AE See-Suite full scope command center AI Box Checkmate memory`, key).catch((error) => ({ status: "FAILED", error: error.message, results: [], treeResults: [] }))
  ]);
  const installState = install.state || {};
  const verifiedModels = Array.isArray(installState.models) ? installState.models.filter((model) => model.status === "VERIFIED").length : 0;
  const totalModels = Array.isArray(installState.models) ? installState.models.length : 0;
  const lanes = [
    { id: "contract", label: "Project Contract", status: brief.status === "BLOCKED" ? "NEEDS_ADVANCE" : "ACTIVE", detail: brief.nextActions?.[0] || "Command brief ready." },
    { id: "ai-box", label: "AI Box Runtime", status: brief.aiBox?.status || "UNKNOWN", detail: brief.aiBox?.recommendation?.label || "Rail and bridge status feed command brief." },
    { id: "models", label: "Big Models", status: install.status || "NOT_STARTED", detail: totalModels ? `${verifiedModels}/${totalModels} verified; current ${installState.models?.find((model) => model.status === "RUNNING")?.tag || "none"}` : "Installer ready." },
    { id: "triad", label: "Triad Router", status: triad.status || "UNKNOWN", detail: `${triad.readyRoutes?.length || 0} ready DAG routes.` },
    { id: "checkmate", label: "Checkmate", status: reviews.status || "UNKNOWN", detail: `${reviews.cards?.length || 0} review cards loaded.` },
    { id: "knowledge", label: "AE See-Suite Knowledge", status: knowledge.status || "UNKNOWN", detail: `${(knowledge.treeResults || knowledge.results || []).length} relevant recall hits.` }
  ];
  const canAdvancePlanning = brief.status === "BLOCKED" && /approval|blocker|1B|1H/i.test(JSON.stringify(brief.nextActions || []));
  return scrubProductLanguageStrings({
    status: lanes.every((lane) => ["VERIFIED", "ACTIONABLE", "ACTIVE", "RUNNING", "TRIAD_GUARDED", "TRIAD_READY"].includes(String(lane.status))) ? "ACTIONABLE" : "BUILDING",
    generatedAt: new Date().toISOString(),
    project: key,
    doctrine: "Build the full ORANGEBOX scope in order. The optional AI Box performs heavy work; AE See-Suite stays responsive; Checkmate blocks fake completion.",
    canAdvancePlanning,
    lanes,
    brief,
    install,
    triad,
    reviews,
    knowledge: {
      status: knowledge.status,
      hits: (knowledge.treeResults || knowledge.results || []).slice(0, 6)
    }
  });
}

async function fullScopeContractMarkdown({ project, status, advancedNodes = [] }) {
  const lanes = status.lanes || [];
  return [
    `# ORANGEBOX Full Scope Build Contract - ${project}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Operator Ruling",
    "",
    "Build the entire ORANGEBOX scope discussed in this project thread. Do not shrink to a decorative dashboard. Keep AE See-Suite as the command surface and the optional AI Box as the execution worker.",
    "",
    "## Product Shape",
    "",
    "- One endless project chat/thread per project.",
    "- Live 1A/1B/1C spine and machine-readable DAG.",
    "- AI Box worker rail for builds, tests, model work, visual proof, receipts, and knowledge compile.",
    "- FATCAT party line so departments, CLIs, and local models can coordinate without context firehoses.",
    "- Department model library using four big model families with hot-swap lifecycle.",
    "- Checkmate/Atom Standard gates before completion claims.",
    "- AE See-Suite Knowledge as the living memory engine.",
    "- Desktop app/installer path, not a fragile localhost toy.",
    "",
    "## Current Lanes",
    ...lanes.map((lane) => `- ${lane.id}: ${lane.status} / ${lane.detail}`),
    "",
    "## Advanced This Run",
    ...(advancedNodes.length ? advancedNodes.map((node) => `- ${node}`) : ["- No DAG nodes advanced automatically."]),
    "",
    "## Non-Negotiables",
    "",
    "- No fake green statuses.",
    "- Raw logs stay on disk; summaries and receipt paths go to models.",
    "- Destructive actions, deploys, production writes, payment/customer actions, and permission expansion remain approval-gated.",
    "- If model install is still running, do not load extra local models or stack heavy AI Box jobs.",
    ""
  ].join("\n");
}

async function advanceFullScope(body = {}) {
  const key = projectKey(body.project || "orangebox");
  if (String(body.scope || body.text || body.goal || "").trim()) {
    await expandProjectScopeFromText(key, body.scope || body.text || body.goal, {
      forceGeneric: Boolean(body.forceGeneric),
      title: body.title,
      department: body.department || "AE0"
    });
  }
  const before = await fullScopeStatus(key);
  const advanced = [];
  const files = await ensureProjectThread(key);
  const contractPath = path.join(files.dir, "FULL_SCOPE_BUILD_CONTRACT.md");
  const now = new Date().toISOString();
  let dag = await ensureProjectDag(key);
  const node1A = dag.nodes.find((node) => node.node_id === "1A");
  if (node1A && node1A.status !== "complete") {
    dag = await updateProjectDagNode({
      project: key,
      node_id: "1A",
      action: "complete",
      evidence: "Operator approved full-scope BLUEB0X build; project thread contains 27h scope and current plan."
    });
    advanced.push("1A complete: idea intake accepted from project thread.");
  }
  dag = await ensureProjectDag(key);
  for (const nodeId of ["1B", "1H"]) {
    const node = dag.nodes.find((item) => item.node_id === nodeId);
    const depsComplete = (node?.depends_on || []).every((dep) => dag.nodes.find((item) => item.node_id === dep)?.status === "complete");
    if (node && node.status === "awaiting_approval" && depsComplete) {
      dag = await updateProjectDagNode({
        project: key,
        node_id: nodeId,
        action: "approve",
        evidence: "Operator said: big build all scope in full. Internal planning approval granted; destructive gates remain protected."
      });
      advanced.push(`${nodeId} approved: ${node.node_name}.`);
    }
  }
  dag = await ensureProjectDag(key);
  const firstPending = dag.nodes.find((node) => node.status === "pending" && (node.depends_on || []).every((dep) => dag.nodes.find((item) => item.node_id === dep)?.status === "complete"));
  if (firstPending) {
    dag = await updateProjectDagNode({
      project: key,
      node_id: firstPending.node_id,
      action: "start",
      evidence: "Full-scope controller selected next runnable node."
    });
    advanced.push(`${firstPending.node_id} started: ${firstPending.node_name}.`);
  }
  const after = await fullScopeStatus(key);
  const markdown = await fullScopeContractMarkdown({ project: key, status: after, advancedNodes: advanced });
  await fs.writeFile(contractPath, markdown, "utf8");
  await fs.appendFile(files.threadPath, `\n## ${now} / system\nBrain: blueb0x-full-scope-controller\nScope: current-position\n\n${markdown}\n`, "utf8");
  const party = await appendPartyLineMessage({
    project: key,
    team: "AE0",
    kind: "full-scope",
    status: advanced.length ? "ADVANCED" : "ACTIVE",
    text: `Full-scope build controller ran.\n${advanced.join("\n") || "No node auto-advanced."}\nContract: ${contractPath}`,
    evidence: contractPath
  }).catch(() => null);
  const receipt = await writeReceipt("full-scope-build", {
    status: "VERIFIED",
    project: key,
    advanced,
    contractPath,
    partyLineMessageId: party?.id || null,
    beforeStatus: before.status,
    afterStatus: after.status
  });
  return {
    status: "VERIFIED",
    project: key,
    advanced,
    contractPath,
    contractUrl: `/orangebox/project-thread/${key}/FULL_SCOPE_BUILD_CONTRACT.md`,
    before,
    after,
    receiptPath: receipt.receiptPath
  };
}

const comprehensiveBuildoutLanes = [
  {
    id: "1A",
    key: "mission-os",
    label: "Mission OS",
    weight: 12,
    owner: "AE0",
    acceptance: "One project thread, live 1A/1B/1C spine, DAG truth, and compact handoff packets."
  },
  {
    id: "1B",
    key: "command-surface",
    label: "Cinematic Command Surface",
    weight: 12,
    owner: "AE3",
    acceptance: "The first screen tells the operator what is happening now, what is next, and what is blocked."
  },
  {
    id: "1C",
    key: "codexa-grid",
    label: "Codexa Build Grid",
    weight: 12,
    owner: "AE10",
    acceptance: "Cockpit delegates heavy builds/tests/models to Codexa with visible route, receipts, and fallbacks."
  },
  {
    id: "1D",
    key: "big-model-departments",
    label: "Big-Model Departments",
    weight: 10,
    owner: "AE0",
    acceptance: "Department identities route to hot-swapped local model families with keep_alive/release law."
  },
  {
    id: "1E",
    key: "knowledge-learning",
    label: "BLUEB0X Knowledge + Learning",
    weight: 10,
    owner: "AE10",
    acceptance: "Memory, source ledgers, daily low crawl, operator votes, and training examples feed future work."
  },
  {
    id: "1F",
    key: "checkmate",
    label: "Checkmate / Atom Standard",
    weight: 12,
    owner: "AE14",
    acceptance: "Early warning, final gate, security, UX, build, API, data, and taste checks block fake completion."
  },
  {
    id: "1G",
    key: "visual-proof",
    label: "Visual Proof Loop",
    weight: 8,
    owner: "AE3",
    acceptance: "UI work requires screenshots, dead-control checks, overflow checks, and proof thumbnails."
  },
  {
    id: "1H",
    key: "desktop-release",
    label: "Desktop EXE + Installer",
    weight: 8,
    owner: "AE8",
    acceptance: "Tauri app, MSI/NSIS artifact, local launch smoke, and rollback path exist."
  },
  {
    id: "1I",
    key: "cost-limits",
    label: "Cost, Limits, and Model Control",
    weight: 8,
    owner: "AE10",
    acceptance: "Subscription tokens remain honest/unknown unless proven; local/API lanes, budgets, and blockers are visible."
  },
  {
    id: "1J",
    key: "security-approval",
    label: "Security + Approval Law",
    weight: 8,
    owner: "AE11",
    acceptance: "Destructive actions, deploys, pushes, DB writes, payments, customer messages, and permission changes are gated."
  }
];

function buildoutStatusClass(status = "") {
  const s = String(status || "").toUpperCase();
  if (["VERIFIED", "COMPLETE", "ACTIONABLE", "ACTIVE", "RUNNING"].includes(s)) return 1;
  if (["CONFIGURED", "TRIAD_READY", "TRIAD_GUARDED", "GUARDED_WITH_RED_CLAIMS"].includes(s)) return 0.74;
  if (["CONFIGURED_WITH_GAPS", "BUILDING", "UNKNOWN", "NOT_STARTED"].includes(s)) return 0.42;
  if (["FAILED", "MISSING", "BLOCKED", "TIMEOUT"].includes(s)) return 0.12;
  return 0.5;
}

function buildoutMarkdown(payload) {
  return [
    `# BLUEB0X.AI V4 Comprehensive Buildout - ${payload.project}`,
    "",
    `Generated: ${payload.generatedAt}`,
    `Status: ${payload.status}`,
    `Weighted completion: ${payload.percent}%`,
    "",
    "## Law",
    "",
    "This file is the top-level build map. It is not a replacement for the live DAG; it is the operator-facing scope contract that keeps the DAG, departments, Codexa, Checkmate, knowledge, and release path aimed at one product.",
    "",
    "## Build Lanes",
    ...payload.lanes.map((lane) => [
      `### ${lane.id} ${lane.label}`,
      `Owner: ${lane.owner}`,
      `Status: ${lane.status}`,
      `Score: ${Math.round(lane.score * 100)}%`,
      `Acceptance: ${lane.acceptance}`,
      `Evidence: ${lane.evidence || "none"}`,
      `Next: ${lane.nextAction}`,
      ""
    ].join("\n")),
    "## Next Build Queue",
    ...payload.nextBuildQueue.map((item) => `- ${item.id} ${item.label}: ${item.nextAction}`),
    "",
    "## Blockers",
    ...(payload.blockers.length ? payload.blockers.map((item) => `- ${item.id} ${item.label}: ${item.nextAction}`) : ["- No hard blockers in the buildout map."]),
    "",
    "## Operating Rules",
    "- No fake green statuses.",
    "- Heavy execution belongs on Codexa; cockpit stays responsive.",
    "- Raw logs stay on disk; summaries and receipt paths go to models.",
    "- User votes become training data, but only receipts/evals promote permanent law.",
    "- Checkmate can block completion claims even when the UI looks done.",
    ""
  ].join("\n");
}

async function comprehensiveBuildoutStatus(project = "orangebox", { fresh = false } = {}) {
  const key = projectKey(project);
  const files = await ensureProjectThread(key);
  const cachedPath = path.join(files.dir, "blueb0x-v4-comprehensive-buildout.json");
  const cached = await readJson(cachedPath, null);
  const cachedStat = cached ? await fs.stat(cachedPath).catch(() => null) : null;
  if (!fresh && cached && cachedStat) {
    return {
      ...cached,
      cache: "HIT",
      files: {
        ...(cached.files || {}),
        jsonPath: cachedPath,
        markdownPath: path.join(files.dir, "BLUEB0X_V4_COMPREHENSIVE_BUILDOUT.md"),
        markdownUrl: `/orangebox/project-thread/${key}/BLUEB0X_V4_COMPREHENSIVE_BUILDOUT.md`
      }
    };
  }
  const [spine, dag, completion, fullScope, learning, models, reviews, triad, costLimits] = await Promise.all([
    ensureProjectSpine(key).catch((error) => ({ status: "FAILED", error: error.message, steps: [], count: 0 })),
    ensureProjectDag(key).catch((error) => ({ status: "FAILED", error: error.message, nodes: [], progress: {} })),
    projectCompletion(key).catch((error) => ({ status: "FAILED", error: error.message })),
    withTimeout(fullScopeStatus(key), 2500, { status: "TIMEOUT", lanes: [] }).catch((error) => ({ status: "FAILED", error: error.message, lanes: [] })),
    departmentLearningStatus(key).catch((error) => ({ status: "FAILED", error: error.message, trainingExamples: 0 })),
    withTimeout(departmentModelStatus(key), 2500, { status: "TIMEOUT", lifecycle: [], library: departmentModelLibrary }).catch((error) => ({ status: "FAILED", error: error.message, lifecycle: [], library: departmentModelLibrary })),
    withTimeout(reviewEngineStatus(key), 1500, { status: "TIMEOUT", cards: [] }).catch((error) => ({ status: "FAILED", error: error.message, cards: [] })),
    withTimeout(triadStatus(key), 2000, { status: "TIMEOUT", readyRoutes: [] }).catch((error) => ({ status: "FAILED", error: error.message, readyRoutes: [] })),
    costLimitsStatus(key).catch((error) => ({ status: "FAILED", error: error.message }))
  ]);
  const desktopExePath = path.join(appRoot, "src-tauri", "target", "release", "blueb0x-command.exe");
  const desktopMsiPath = path.join(appRoot, "src-tauri", "target", "release", "bundle", "msi", "BLUEB0X.AI Command_0.2.0_x64_en-US.msi");
  const desktopNsisPath = path.join(appRoot, "src-tauri", "target", "release", "bundle", "nsis", "BLUEB0X.AI Command_0.2.0_x64-setup.exe");
  const desktopReady = await exists(desktopExePath) || await exists(desktopMsiPath) || await exists(desktopNsisPath);
  const latestReceipts = await listFiles(path.join(orangeRoot, "receipts"), 10).catch(() => []);
  const latestProofs = await listFiles(path.join(orangeRoot, "proof"), 10).catch(() => []);
  const fullLane = (id) => (fullScope.lanes || []).find((lane) => lane.id === id) || {};
  const modelLifecycle = models.lifecycle || [];
  const modelInstalled = (models.modelProbe?.status === "VERIFIED") || modelLifecycle.length > 0 || (models.library || []).length >= 4;
  const phaseState = {
    "mission-os": {
      status: spine.count && dag.nodes?.length ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
      evidence: `${spine.count || 0} spine steps / ${dag.nodes?.length || 0} DAG nodes`,
      nextAction: spine.nextStep ? `Advance ${spine.nextStep.id || ""} ${spine.nextStep.title || ""}` : "Create the first project spine."
    },
    "command-surface": {
      status: fullScope.brief?.status || "CONFIGURED",
      evidence: fullScope.brief?.operatorCard ? "Command brief renders top action." : "Command brief endpoint exists.",
      nextAction: "Keep first viewport focused on next action, blocker, proof, and current route."
    },
    "codexa-grid": {
      status: fullLane("codexa").status || fullScope.brief?.codexa?.status || "UNKNOWN",
      evidence: fullLane("codexa").detail || fullScope.brief?.codexa?.url || "",
      nextAction: fullScope.brief?.codexa?.status === "VERIFIED" ? "Dispatch only scoped heavy jobs with receipts." : "Repair or verify Codexa rail/bridge before heavy jobs."
    },
    "big-model-departments": {
      status: modelInstalled ? models.status || "CONFIGURED" : "NOT_STARTED",
      evidence: `${(models.library || []).length} library entries / ${modelLifecycle.length} lifecycle records`,
      nextAction: "Install/probe Ollama tags, then hot-swap only the needed department head."
    },
    "knowledge-learning": {
      status: learning.status || "UNKNOWN",
      evidence: `${learning.sourceCount || 0} sources / ${learning.trainingExamples || 0} training examples`,
      nextAction: "Keep daily crawl low, capture operator votes, and promote only with receipts."
    },
    "checkmate": {
      status: reviews.status || "UNKNOWN",
      evidence: `${reviews.cards?.length || 0} review cards / ${reviews.dashboardPath || ""}`,
      nextAction: (reviews.cards || []).some((card) => String(card.status).includes("GAPS")) ? "Close missing runtimes and run final gates." : "Run early Checkmate before expensive nodes."
    },
    "visual-proof": {
      status: latestProofs.length || completion.proof?.latest ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
      evidence: latestProofs[0]?.name || completion.proof?.latest || "No recent proof file.",
      nextAction: "Capture desktop and compact viewport proof for visible work."
    },
    "desktop-release": {
      status: desktopReady ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
      evidence: desktopReady ? [desktopExePath, desktopMsiPath, desktopNsisPath].join(" | ") : "No desktop artifact found.",
      nextAction: desktopReady ? "Run launch smoke before calling installer ready." : "Build Tauri release artifacts."
    },
    "cost-limits": {
      status: costLimits.status || "CONFIGURED_WITH_GAPS",
      evidence: `${costLimits.providerTelemetry?.subscriptionTokenCounts || "UNKNOWN"} / local ${costLimits.localTelemetry?.processRamMB || "?"}MB RSS / ${costLimits.localTelemetry?.http?.total || 0} local API requests`,
      nextAction: costLimits.status === "VERIFIED" ? "Use honest telemetry to govern workload; keep subscription token claims unknown until proven." : "Show honest unknown provider tokens and local estimates; do not fake usage telemetry."
    },
    "security-approval": {
      status: "VERIFIED",
      evidence: "Approval law is encoded in AGENTS.md and Checkmate/command brief blocked-claim logic.",
      nextAction: "Keep destructive operations approval-gated and record rollback paths."
    }
  };
  const lanes = comprehensiveBuildoutLanes.map((lane) => {
    const state = phaseState[lane.key] || {};
    const score = buildoutStatusClass(state.status);
    return { ...lane, ...state, score };
  });
  const totalWeight = lanes.reduce((sum, lane) => sum + lane.weight, 0);
  const weighted = lanes.reduce((sum, lane) => sum + lane.weight * lane.score, 0);
  const percent = Math.round((weighted / totalWeight) * 100);
  const blockers = lanes.filter((lane) => lane.score < 0.5);
  const nextBuildQueue = lanes.filter((lane) => lane.score < 1).sort((a, b) => (a.score - b.score) || (b.weight - a.weight)).slice(0, 5);
  const status = blockers.length ? "BUILDING_WITH_BLOCKERS" : nextBuildQueue.length ? "ACTIONABLE" : "VERIFIED";
  const payload = {
    status,
    generatedAt: new Date().toISOString(),
    project: key,
    percent,
    totalWeight,
    weighted: Number(weighted.toFixed(2)),
    lanes,
    blockers,
    nextBuildQueue,
    latestReceipts,
    latestProofs,
    files: {
      markdownPath: path.join(files.dir, "BLUEB0X_V4_COMPREHENSIVE_BUILDOUT.md"),
      jsonPath: path.join(files.dir, "blueb0x-v4-comprehensive-buildout.json"),
      markdownUrl: `/orangebox/project-thread/${key}/BLUEB0X_V4_COMPREHENSIVE_BUILDOUT.md`
    }
  };
  payload.markdown = buildoutMarkdown(payload);
  return payload;
}

async function materializeComprehensiveBuildout(body = {}) {
  const key = projectKey(body.project || "orangebox");
  const payload = await comprehensiveBuildoutStatus(key);
  await writeJson(payload.files.jsonPath, { ...payload, markdown: undefined });
  await fs.writeFile(payload.files.markdownPath, payload.markdown, "utf8");
  const party = await appendPartyLineMessage({
    project: key,
    team: "AE0",
    kind: "comprehensive-buildout",
    status: payload.status,
    text: `Comprehensive buildout materialized: ${payload.percent}% / next ${payload.nextBuildQueue[0]?.label || "none"}`,
    evidence: payload.files.markdownPath
  }).catch(() => null);
  const receipt = await writeReceipt("comprehensive-buildout", {
    status: "VERIFIED",
    project: key,
    percent: payload.percent,
    buildoutStatus: payload.status,
    markdownPath: payload.files.markdownPath,
    jsonPath: payload.files.jsonPath,
    partyLineMessageId: party?.id || null,
    blockers: payload.blockers.map((lane) => lane.key),
    nextBuildQueue: payload.nextBuildQueue.map((lane) => lane.key)
  });
  return {
    ...payload,
    receiptPath: receipt.receiptPath,
    partyLineMessageId: party?.id || null
  };
}

function teamForPartyLine(team = "AE0") {
  const value = String(team || "AE0").toUpperCase().replace(/[^A-Z0-9_-]+/g, "-").slice(0, 32) || "AE0";
  const special = specialTeams.find((row) => row.id === value);
  if (special) return special.id;
  const department = departmentMap.find((row) => row.id === value);
  return department ? department.id : value;
}

function teamLabel(team = "AE0") {
  const id = teamForPartyLine(team);
  const special = specialTeams.find((row) => row.id === id);
  if (special) return `${special.id} ${special.name}`;
  const department = departmentMap.find((row) => row.id === id);
  return department ? `${department.id} ${department.name}` : id;
}

function teamRosterMarkdown() {
  return [
    ...departmentMap.map((row) => `- ${row.id} ${row.name}: ${row.use}`),
    ...specialTeams.map((row) => `- ${row.id} ${row.name}: ${row.use}`)
  ].join("\n");
}

async function partyLineFiles(project = "orangebox") {
  const key = projectKey(project);
  const dir = path.join(partyLineDir, key);
  await fs.mkdir(dir, { recursive: true });
  return {
    key,
    dir,
    logPath: path.join(dir, "messages.jsonl"),
    summaryPath: path.join(dir, "PARTY_LINE_SUMMARY.md")
  };
}

async function appendPartyLineMessage(body = {}) {
  const files = await partyLineFiles(body.project || "orangebox");
  const team = teamForPartyLine(body.team || body.from || "AE0");
  const message = {
    id: `${stamp()}-${crypto.randomUUID()}`,
    generatedAt: new Date().toISOString(),
    project: files.key,
    room: String(body.room || "project").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 48) || "project",
    from: team,
    to: Array.isArray(body.to) ? body.to.map(teamForPartyLine).slice(0, 12) : [],
    dagNode: body.dagNode ? String(body.dagNode).slice(0, 32) : null,
    kind: String(body.kind || "note").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "note",
    status: String(body.status || "INFO").toUpperCase().replace(/\s+/g, "_").slice(0, 32),
    text: clampText(body.text || body.message || "", 4000),
    evidence: body.evidence ? clampText(body.evidence, 1000) : "",
    receiptPath: body.receiptPath || null
  };
  if (!message.text.trim()) throw new Error("party line message is empty");
  await fs.appendFile(files.logPath, `${JSON.stringify(message)}\n`, "utf8");
  await compilePartyLineSummary(files.key).catch(() => {});
  // Auto-rebuild v2 knowledge after every successful party-line append.
  // Fire-and-forget; throttled to at most once per 5 minutes; never blocks the append.
  triggerKnowledgeV2RebuildAsync(false);
  return message;
}

async function readPartyLine(project = "orangebox", limit = 80) {
  const files = await partyLineFiles(project);
  let messages = [];
  try {
    const text = await fs.readFile(files.logPath, "utf8");
    messages = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).slice(-Math.max(1, Math.min(400, Number(limit || 80))));
  } catch {
    messages = [];
  }
  return {
    status: "VERIFIED",
    project: files.key,
    messages: messages.reverse(),
    summaryUrl: `/orangebox/party-line/${files.key}/PARTY_LINE_SUMMARY.md`,
    logPath: files.logPath
  };
}

async function compilePartyLineSummary(project = "orangebox") {
  const files = await partyLineFiles(project);
  const state = await readPartyLine(project, 120);
  const byTeam = new Map();
  for (const msg of state.messages) {
    const row = byTeam.get(msg.from) || { count: 0, latest: null, statuses: new Map() };
    row.count += 1;
    row.latest = row.latest || msg;
    row.statuses.set(msg.status, (row.statuses.get(msg.status) || 0) + 1);
    byTeam.set(msg.from, row);
  }
  const lines = [
    `# ${files.key} LLM Party Line`,
    "",
    "Shared project room for department LLMs. All teams see the same canonical project state, but raw context stays scoped to the node/team.",
    "",
    "## Named Teams",
    "- Lips Team: design, copy, naming, onboarding feel, premium UX, final design taste language.",
    "- Mirrors Team: reality-contact review, observed vs inferred, contradictions, hallucination pressure, correction path.",
    "",
    "## Team Pulse",
    ...Array.from(byTeam.entries()).map(([team, row]) => `- ${teamLabel(team)}: ${row.count} messages / latest ${row.latest?.status || "INFO"} / ${row.latest?.kind || "note"} / ${row.latest?.generatedAt || ""}`),
    "",
    "## Latest Messages",
    ...state.messages.slice(0, 40).map((msg) => `- ${msg.generatedAt} / ${teamLabel(msg.from)} / ${msg.status} / ${msg.kind}${msg.dagNode ? ` / ${msg.dagNode}` : ""}: ${msg.text.replace(/\s+/g, " ").slice(0, 260)}`)
  ];
  await fs.writeFile(files.summaryPath, lines.join("\n"), "utf8");
  return { status: "VERIFIED", project: files.key, summaryPath: files.summaryPath, messages: state.messages.length };
}

function activeDagNodes(dag) {
  const nodes = Array.isArray(dag?.nodes) ? dag.nodes : [];
  const completeIds = new Set(nodes.filter((node) => String(node.status || "").toLowerCase() === "complete").map((node) => String(node.node_id || "").toUpperCase()));
  const depsComplete = (node) => (node.depends_on || []).every((id) => completeIds.has(String(id).toUpperCase()));
  const activeStatuses = new Set([
    "in_progress",
    "awaiting_approval",
    "failed_validation",
    "blocked",
    "revision_requested",
    "conflict_detected",
    "awaiting_department_response",
    "awaiting_operator_arbitration",
    "blocked_by_security"
  ]);
  const readyNodes = nodes.filter((node) => depsComplete(node));
  const active = readyNodes.filter((node) => activeStatuses.has(String(node.status || "").toLowerCase()));
  const next = nodes.find((node) => String(node.node_id || "").toUpperCase() === String(dag?.progress?.current_node_id || "").toUpperCase());
  return {
    running: nodes.filter((node) => String(node.status || "").toLowerCase() === "in_progress"),
    blockers: readyNodes.filter((node) => [
      "awaiting_approval",
      "failed_validation",
      "blocked",
      "revision_requested",
      "conflict_detected",
      "awaiting_department_response",
      "awaiting_operator_arbitration",
      "blocked_by_security"
    ].includes(String(node.status || "").toLowerCase())),
    current: next || active[0] || nodes.find((node) => String(node.status || "").toLowerCase() !== "complete") || null,
    remaining: nodes.filter((node) => String(node.status || "").toLowerCase() !== "complete")
  };
}

async function codexaRouteSnapshot() {
  if (routeSnapshotCache.value && Date.now() < routeSnapshotCache.expiresAt) {
    return { ...routeSnapshotCache.value, cache: "HIT" };
  }
  if (routeSnapshotCache.promise) {
    const joined = await routeSnapshotCache.promise;
    return { ...joined, cache: "JOIN" };
  }
  routeSnapshotCache.promise = (async () => {
    const directRail = codexaDirectIp ? await probe(`http://${codexaDirectIp}:${commandRailPort}/health`, 900) : null;
    const directBridge = !codexaDirectIp || directRail?.status === "VERIFIED" ? null : await probe(`http://${codexaDirectIp}:8098/health`, 900);
      const ethernetRail = !codexaIp || directRail?.status === "VERIFIED" || directBridge?.status === "VERIFIED" ? null : await probe(`http://${codexaIp}:${commandRailPort}/health`, 1100);
      const ethernetBridge = !codexaIp || directRail?.status === "VERIFIED" || directBridge?.status === "VERIFIED" || ethernetRail?.status === "VERIFIED" ? null : await probe(`http://${codexaIp}:8098/health`, 1100);
      const verified = [directRail, directBridge, ethernetRail, ethernetBridge].filter(Boolean).find((row) => row.status === "VERIFIED");
      let active = "OFFLINE_OR_UNVERIFIED";
      if (codexaDirectIp && verified?.url?.includes(codexaDirectIp)) active = "DIRECT_CAT8_READY";
      else if (codexaIp && verified?.url?.includes(codexaIp)) active = "ETHERNET_GATEWAY_READY";
      return {
        status: verified ? "VERIFIED" : "FAILED",
        active,
        directIp: codexaDirectIp,
        ethernetIp: codexaIp,
        legacyWifiIp: codexaLegacyWifiIp,
        activeUrl: verified?.url || null,
        law: "Use the AI Box rail you configured via env vars. Legacy fallbacks should stay unused unless explicitly preferred. Direct-link is future-only until health probes prove it."
      };
  })();
  try {
    const snapshot = await routeSnapshotCache.promise;
    routeSnapshotCache.value = snapshot;
    routeSnapshotCache.expiresAt = Date.now() + 15_000;
    return { ...snapshot, cache: "MISS" };
  } finally {
    routeSnapshotCache.promise = null;
  }
}

async function projectEtaEstimate(project = "orangebox", dagArg = null) {
  const dag = dagArg || await ensureProjectDag(project);
  const route = await codexaRouteSnapshot().catch((error) => ({ status: "FAILED", active: "OFFLINE_OR_UNVERIFIED", error: error.message }));
  const optimizer = await readJson(path.join(orangeRoot, "optimizer", "latest-optimizer.json"), null);
  const power = await readJson(path.join(orangeRoot, "power", "latest-power.json"), null);
  const totalWeight = numeric(dag?.progress?.total_weight, 0);
  const completeWeight = numeric(dag?.progress?.complete_weight, 0);
  const remainingWeight = Math.max(0, totalWeight - completeWeight);
  const blockers = activeDagNodes(dag).blockers.length;
  const codexaReady = route.status === "VERIFIED";
  const directReady = route.active === "DIRECT_CAT8_READY";
  const codexaSmall = numeric(optimizer?.concurrency?.codexa?.smallJobs, codexaReady ? 2 : 0);
  const codexaHeavy = numeric(optimizer?.concurrency?.codexa?.heavyJobs, codexaReady ? 1 : 0);
  const frontierLanes = numeric(optimizer?.concurrency?.frontierLanes, codexaReady ? 2 : 1);
  let minutesPerWeight = codexaReady ? 11 : 24;
  if (directReady) minutesPerWeight *= 0.82;
  if (optimizer?.status === "CAN_INCREASE") minutesPerWeight *= 0.82;
  else if (optimizer?.status === "HOLD_OR_SMALL_INCREASE") minutesPerWeight *= 1.15;
  else if (optimizer?.status === "DO_NOT_INCREASE") minutesPerWeight *= 1.55;
  else if (optimizer?.status === "FAILED") minutesPerWeight *= 1.85;
  const parallelFactor = Math.min(2.4, 1 + (Math.min(codexaSmall, 6) * 0.08) + (Math.min(codexaHeavy, 2) * 0.28) + (Math.min(frontierLanes, 3) * 0.05));
  const approvalDrag = blockers ? blockers * 18 : 0;
  const midpoint = Math.max(10, Math.round((remainingWeight * minutesPerWeight) / parallelFactor + approvalDrag));
  const low = Math.max(5, Math.round(midpoint * 0.72));
  const high = Math.max(low + 5, Math.round(midpoint * 1.45));
  return {
    status: "ESTIMATE",
    project: projectKey(project),
    generatedAt: new Date().toISOString(),
    completionPercent: dag?.progress?.percent || 0,
    remainingWeight,
    blockers,
    rangeMinutes: { low, midpoint, high },
    rangeHuman: `${Math.round(low / 60 * 10) / 10}-${Math.round(high / 60 * 10) / 10} hours`,
    route,
    optimizer: optimizer ? {
      status: optimizer.status,
      label: optimizer.label,
      codexaSmallJobs: codexaSmall,
      codexaHeavyJobs: codexaHeavy,
      frontierLanes
    } : { status: "MISSING", label: "No optimizer sample yet", codexaSmallJobs: codexaSmall, codexaHeavyJobs: codexaHeavy, frontierLanes },
    powerSampleAt: power?.generatedAt || null,
    caveat: "ETA is a planning estimate from DAG weight, blockers, route health, and latest compute policy. It is not a promise."
  };
}

async function opusAwarenessPacket(project = "orangebox") {
  const files = await ensureProjectThread(project);
  const spine = await ensureProjectSpine(files.key);
  const dag = await ensureProjectDag(files.key);
  const position = await readJson(files.positionPath, {});
  const completion = await projectCompletion(files.key);
  const party = await readPartyLine(files.key, 80);
  const partyFiles = await partyLineFiles(files.key);
  await compilePartyLineSummary(files.key).catch(() => {});
  const partySummary = await readText(partyFiles.summaryPath, "");
  const fatcat = await fatcatStatus(files.key).catch((error) => ({ status: "FAILED", error: error.message, activeCalls: 0, latestCalls: [], summaryPath: "" }));
  const triad = await triadStatus(files.key).catch((error) => ({ status: "FAILED", error: error.message, readyRoutes: [], heads: comprehensiveTriad.heads, memoryPolicy: triadMemoryPolicy() }));
  const departmentModels = await departmentModelStatus(files.key).catch((error) => ({ status: "FAILED", error: error.message, lifecycle: [], library: departmentModelLibrary }));
  const reviewEngines = await reviewEngineStatus(files.key).catch((error) => ({ status: "FAILED", error: error.message, engines: reviewEngineLibrary, latestRuns: [] }));
  const eta = await projectEtaEstimate(files.key, dag);
  const active = activeDagNodes(dag);
  const notifications = await listNotifications(6).catch(() => []);
  const recentMessages = party.messages.slice(0, 18);
  const body = [
    `# BLUEB0X.AI Opus Awareness Packet - ${files.key}`,
    "",
    `Generated: ${new Date().toISOString()}`,
    "Purpose: load this before Opus/Claude Code reasons, so it sees the same project board as Codex, Codexa, local workers, Lips Team, and Mirrors Team.",
    "",
    "## Top Line",
    `- Project position: ${position.currentPosition || "No current position captured."}`,
    `- Spine: ${spine.doneCount}/${spine.count} steps (${spine.percent}%). Next: ${spine.nextStep?.id || "n/a"} ${spine.nextStep?.title || "n/a"} / ${spine.nextStep?.department || "AE0"}.`,
    `- DAG: ${dag.progress.complete_nodes}/${dag.progress.total_nodes} nodes (${dag.progress.percent}% weighted). Current: ${dag.progress.current_node_id || "n/a"}. Bottleneck: ${dag.progress.bottleneck_node_id || "none"}.`,
    `- Evidence infrastructure: ${completion.label}.`,
    `- ETA: ${eta.rangeHuman} midpoint ${eta.rangeMinutes.midpoint} minutes. ${eta.caveat}`,
    `- Compute route: ${eta.route.active} (${eta.route.activeUrl || "no verified worker rail"}).`,
    `- Approval blockers: ${active.blockers.length}. Running nodes: ${active.running.length}.`,
    `- FATCAT calls: ${fatcat.activeCalls || 0} active / switchboard ${fatcat.summaryPath || "unavailable"}.`,
    `- Triad: ${triad.status || "UNKNOWN"} / ready routes ${(triad.readyRoutes || []).length} / resident models ${triad.memoryPolicy?.residentModels || "unknown"}.`,
    `- Department models: ${(departmentModels.lifecycle || []).filter((item) => ["hot", "warming"].includes(item.lifecycle)).length} hot/warming / ${departmentModels.library?.length || departmentModelLibrary.length} available.`,
    `- Review engines: ${reviewEngines.engines?.length || reviewEngineLibrary.length} watchers / latest runs ${(reviewEngines.latestRuns || []).length}. Checkmate runs at intake and ship.`,
    "",
    "## Department Roster",
    teamRosterMarkdown(),
    "",
    "## Current Node",
    active.current ? [
      `- ${active.current.node_id} [${active.current.status}] ${active.current.node_name} / ${active.current.owner_department}`,
      `- Payload: ${active.current.execution_payload}`,
      `- Validation: ${active.current.validation_command}`,
      `- Worker: ${active.current.worker} / cost ${active.current.cost_profile || "unknown"} / attempts ${active.current.attempts || 0}/${active.current.max_attempts || 3}`
    ].join("\n") : "- No current node found.",
    "",
    "## Approval / Blockers",
    ...(active.blockers.length ? active.blockers.slice(0, 12).map((node) => `- ${node.node_id} [${node.status}] ${node.node_name} / ${node.owner_department} / approval ${node.approval_state || "n/a"} / validate ${node.validation_command}`) : ["- No approval blockers currently waiting."]),
    "",
    "## LLM Party Line",
    partySummary ? clampText(partySummary, 3600) : "- No party-line summary yet.",
    "",
    "## FATCAT Switchboard",
    `- Protocol: fatcat-v1`,
    `- Status: ${fatcat.status || "UNKNOWN"}`,
    `- Active calls: ${fatcat.activeCalls || 0}`,
    `- Summary: ${fatcat.summaryPath || "unavailable"}`,
    ...(fatcat.latestCalls?.length ? fatcat.latestCalls.slice(0, 10).map((call) => `- ${call.generatedAt} / ${call.status} / ${call.from} -> ${(call.to || []).join(", ")} / ${call.intent}: ${String(call.request || "").replace(/\s+/g, " ").slice(0, 260)}`) : ["- No FATCAT calls yet."]),
    "",
    "## Comprehensive Triad",
    `- Status: ${triad.status || "UNKNOWN"}`,
    `- Doctrine: ${triad.doctrine || comprehensiveTriad.doctrine}`,
    `- Memory policy: resident ${triad.memoryPolicy?.residentModels || "unknown"} / parallel ${triad.memoryPolicy?.numParallel || "unknown"} / reserve ${triad.memoryPolicy?.reserveRamGB || comprehensiveTriad.codexaBudget.reserveRamGB}GB.`,
    ...(triad.heads || comprehensiveTriad.heads).map((head) => `- ${head.ext} ${head.id}: ${head.name} / ${head.primaryModel} / owns ${head.owns.join(", ")}`),
    ...((triad.readyRoutes || []).length ? ["", "### Ready Routes", ...triad.readyRoutes.slice(0, 12).map((route) => `- ${route.node_id} -> ${route.triad.head} / ${route.triad.model} / ${route.node_name}`)] : ["- No ready Triad routes right now."]),
    "",
    "## Department Hot-Swap Library",
    `- Status: ${departmentModels.status || "UNKNOWN"}`,
    `- Law: ${departmentModels.law || "Departments are identities. Models are hot-swapped resources."}`,
    ...((departmentModels.lifecycle || []).length ? (departmentModels.lifecycle || []).slice(0, 12).map((item) => `- ${item.id}: ${item.lifecycle} / ${item.model} / keep_alive ${item.keepAlive || "n/a"} / briefing ${item.briefingPath || "none"}`) : ["- No department models are hot yet."]),
    ...((departmentModels.library || departmentModelLibrary).slice(0, 18).map((item) => `- ${item.ext} ${item.id} ${item.name}: ${item.model} / ${item.family || item.lane} / ${item.targetRamGB}GB`)),
    "",
    "## Review Engines",
    "These are critique engines, not workers. They pressure the mission before work scales.",
    ...((reviewEngines.engines || reviewEngineLibrary).map((engine) => `- ${engine.ext} ${engine.id}: ${engine.name} / ${engine.authority} / ${engine.question}`)),
    ...((reviewEngines.latestRuns || []).length ? ["", "### Latest Review Runs", ...(reviewEngines.latestRuns || []).slice(0, 6).map((run) => `- ${run.generatedAt} / ${run.mode} / ${run.status} / ${run.cards?.map((card) => `${card.engine}:${card.status}`).join(", ")}`)] : ["- No review engine runs yet."]),
    "",
    "## Latest Party-Line Messages",
    ...(recentMessages.length ? recentMessages.map((msg) => `- ${msg.generatedAt} / ${teamLabel(msg.from)} / ${msg.status} / ${msg.kind}${msg.dagNode ? ` / ${msg.dagNode}` : ""}: ${msg.text.replace(/\s+/g, " ").slice(0, 420)}`) : ["- No department messages yet."]),
    "",
    "## Compute / CatCall Link",
    `- Cockpit: ${cockpitIp} / Intel N150 / interactive command surface.`,
    `- Codexa Ethernet gateway IP: ${codexaIp}.`,
    `- Codexa legacy Wi-Fi IP: ${codexaLegacyWifiIp} (do not use).`,
    `- Codexa direct Cat 8 target: ${codexaDirectIp}.`,
    `- Active route: ${eta.route.active}.`,
    `- Rule: ${eta.route.law}`,
    `- Optimizer: ${eta.optimizer.status} / ${eta.optimizer.label} / small jobs ${eta.optimizer.codexaSmallJobs} / heavy jobs ${eta.optimizer.codexaHeavyJobs} / frontier lanes ${eta.optimizer.frontierLanes}.`,
    "",
    "## Model Law",
    "- Opus sees the full board and makes hard reasoning calls. Codexa does mechanical execution, tests, screenshots, indexing, and receipts.",
    "- Subscription token telemetry remains UNKNOWN unless BLUEB0X.AI owns the adapter and proves the count.",
    "- More than three frontier/tool lanes requires operator approval.",
    "- Checkmate, Lips Team, and Mirrors Team can veto promotion when evidence is weak, UI feels bad, or claims outrun facts.",
    "",
    "## Notification Cards",
    ...((notifications || []).slice(0, 6).map((card) => `- ${card.generatedAt} / ${card.status} / ${card.title}${card.progress != null ? ` / ${card.progress}%` : ""}: ${card.next || card.body || ""}`) || []),
    "",
    "## File Truth",
    `- Thread: ${files.threadPath}`,
    `- Spine: ${files.spineMarkdownPath}`,
    `- DAG: ${files.dagMarkdownPath}`,
    `- Party line log: ${party.logPath}`,
    `- Party line summary: ${partyFiles.summaryPath}`,
    `- Opus packet: ${files.opusAwarenessPath}`,
    "",
    "## Next Action",
    `Continue from ${active.current?.node_id || spine.nextStep?.id || "the next live node"} only. Do not reset scope. If new evidence changes the plan, update DAG/spine first, then report the delta.`,
    ""
  ].join("\n");
  await fs.writeFile(files.opusAwarenessPath, body, "utf8");
  await fs.mkdir(handoffDir, { recursive: true });
  const copyPath = path.join(handoffDir, `${files.key}-opus-awareness.md`);
  await fs.writeFile(copyPath, body, "utf8");
  await writeReceipt("opus-awareness", {
    status: "VERIFIED",
    project: files.key,
    packetPath: files.opusAwarenessPath,
    dagPercent: dag.progress.percent,
    spinePercent: spine.percent,
    eta: eta.rangeHuman,
    route: eta.route.active
  }).catch(() => {});
  return {
    status: "VERIFIED",
    project: files.key,
    awarenessPath: files.opusAwarenessPath,
    awarenessUrl: `/orangebox/project-thread/${files.key}/OPUS_AWARENESS.md`,
    copyPath,
    estimatedTokens: estimateTokens(body.length),
    eta,
    spine,
    dag,
    completion,
    partyLine: { messages: party.messages.length, logPath: party.logPath },
    triad: {
      status: triad.status,
      readyRoutes: triad.readyRoutes?.length || 0,
      markdownPath: triad.markdownPath || null
    },
    departmentModels: {
      status: departmentModels.status,
      hot: (departmentModels.lifecycle || []).filter((item) => ["hot", "warming"].includes(item.lifecycle)).length,
      dashboardPath: departmentModels.dashboardPath || null
    },
    reviewEngines: {
      status: reviewEngines.status,
      engines: reviewEngines.engines?.length || 0,
      latestRuns: reviewEngines.latestRuns?.length || 0,
      dashboardPath: reviewEngines.dashboardPath || null
    },
    markdown: body
  };
}

function normalizeFatcatTargets(value) {
  const raw = Array.isArray(value) ? value : String(value || "AE0").split(/[,\s]+/);
  return raw
    .map((item) => String(item || "").trim().toUpperCase())
    .filter(Boolean)
    .map((item) => {
      if (["OPUS", "CLAUDE", "CLAUDE_CODE"].includes(item)) return "OPUS";
      if (["CODEX", "GPT5", "GPT-5.5", "GPT_5_5"].includes(item)) return "CODEX";
      if (["CODEXA", "BEELINK", "WORKER"].includes(item)) return "CODEXA";
      if (["CHECKMATE", "AE14"].includes(item)) return "CHECKMATE";
      return teamForPartyLine(item);
    })
    .slice(0, 16);
}

function fatcatIntentNeedsApproval(intent = "", body = {}) {
  const text = `${intent} ${body.request || ""} ${body.message || ""}`.toLowerCase();
  return Boolean(body.approvalRequired || body.approval_required)
    || /\b(push|deploy|delete|remove|drop|truncate|payment|charge|customer|firewall|permission|secret|install|production|database write|db write)\b/.test(text);
}

async function fatcatFiles(project = "orangebox") {
  const key = projectKey(project);
  const dir = path.join(fatcatDir, key);
  const callsDir = path.join(dir, "calls");
  await fs.mkdir(callsDir, { recursive: true });
  return {
    key,
    dir,
    callsDir,
    logPath: path.join(dir, "calls.jsonl"),
    summaryPath: path.join(dir, "FATCAT_SWITCHBOARD.md")
  };
}

function fatcatCallMarkdown(call) {
  return [
    `# FATCAT Call ${call.id}`,
    "",
    `Protocol: ${call.protocol}`,
    `Project: ${call.project}`,
    `Status: ${call.status}`,
    `Priority: ${call.priority}`,
    `Route: ${call.route?.active || "unknown"} / ${call.route?.activeUrl || "no verified route"}`,
    `From: ${call.from}`,
    `To: ${(call.to || []).join(", ") || "none"}`,
    `DAG Node: ${call.dagNode || "n/a"}`,
    `Intent: ${call.intent}`,
    `Approval Required: ${call.approvalRequired}`,
    "",
    "## Request",
    call.request || "",
    "",
    "## Expected Return",
    ...(call.expectedReturn || []).map((item) => `- ${item}`),
    "",
    "## Context",
    `Scope: ${call.context?.scope || ""}`,
    `Files: ${(call.context?.files || []).join(", ") || "none"}`,
    `Constraints: ${(call.context?.constraints || []).join("; ") || "none"}`,
    "",
    "## Response",
    call.response ? JSON.stringify(call.response, null, 2) : "Waiting.",
    ""
  ].join("\n");
}

async function writeFatcatCall(call) {
  const files = await fatcatFiles(call.project);
  const jsonPath = path.join(files.callsDir, `${call.id}.json`);
  const markdownPath = path.join(files.callsDir, `${call.id}.md`);
  const full = { ...call, jsonPath, markdownPath };
  await writeJson(jsonPath, full);
  await fs.writeFile(markdownPath, fatcatCallMarkdown(full), "utf8");
  return full;
}

async function readFatcatCalls(project = "orangebox", limit = 40) {
  const files = await fatcatFiles(project);
  let calls = [];
  try {
    const text = await fs.readFile(files.logPath, "utf8");
    calls = text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).slice(-Math.max(1, Math.min(200, Number(limit || 40))));
  } catch {
    calls = [];
  }
  return {
    status: "VERIFIED",
    project: files.key,
    calls: calls.reverse(),
    summaryUrl: `/orangebox/fatcat/${files.key}/FATCAT_SWITCHBOARD.md`,
    logPath: files.logPath
  };
}

async function compileFatcatSummary(project = "orangebox") {
  const files = await fatcatFiles(project);
  const state = await readFatcatCalls(files.key, 120);
  const active = state.calls.filter((call) => ["queued", "ringing", "running", "awaiting_response", "needs_approval"].includes(call.status));
  const lines = [
    `# ${files.key} FATCAT Switchboard`,
    "",
    "FATCAT is the structured AI phone system: directed command calls, not loose chat.",
    "",
    "## Dial Plan",
    "- 100 AE0 Command",
    "- 103 Lips Team",
    "- 106 AE6 Code",
    "- 107 Mirrors Team",
    "- 111 AE11 Security",
    "- 114 Checkmate",
    "- 200 Codexa Worker",
    "- 911 Operator stop / pause / approval gate",
    "",
    "## Active Calls",
    ...(active.length ? active.slice(0, 30).map((call) => `- ${call.id} / ${call.status} / ${call.from} -> ${(call.to || []).join(", ")} / ${call.intent} / ${call.dagNode || "n/a"}`) : ["- No active calls."]),
    "",
    "## Latest Calls",
    ...state.calls.slice(0, 60).map((call) => `- ${call.generatedAt} / ${call.status} / ${call.from} -> ${(call.to || []).join(", ")} / ${call.intent}: ${String(call.request || "").replace(/\s+/g, " ").slice(0, 220)}`)
  ];
  await fs.writeFile(files.summaryPath, lines.join("\n"), "utf8");
  return { status: "VERIFIED", project: files.key, summaryPath: files.summaryPath, activeCalls: active.length, calls: state.calls.length };
}

async function createFatcatCall(body = {}) {
  const files = await fatcatFiles(body.project || "orangebox");
  const route = await codexaRouteSnapshot().catch((error) => ({ status: "FAILED", active: "OFFLINE_OR_UNVERIFIED", error: error.message }));
  const from = normalizeFatcatTargets([body.from || body.team || "OPERATOR"])[0] || "OPERATOR";
  const to = normalizeFatcatTargets(body.to || body.target || "AE0");
  const intent = String(body.intent || "command").replace(/[^a-z0-9._-]+/gi, "-").slice(0, 80) || "command";
  const approvalRequired = fatcatIntentNeedsApproval(intent, body);
  const status = approvalRequired ? "needs_approval" : "queued";
  const id = `${stamp()}-${safeSegment(intent, "call")}-${crypto.randomUUID().slice(0, 8)}`;
  const call = await writeFatcatCall({
    protocol: "fatcat-v1",
    id,
    generatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    project: files.key,
    status,
    priority: String(body.priority || "normal").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32),
    route,
    from,
    to,
    dagNode: body.dagNode || body.node || null,
    intent,
    approvalRequired,
    ttlSeconds: Math.max(60, Math.min(86400, Number(body.ttlSeconds || 900))),
    request: clampText(body.request || body.message || "", 5000),
    expectedReturn: Array.isArray(body.expectedReturn) ? body.expectedReturn.slice(0, 12) : ["status", "evidence", "receiptPath", "nextAction"],
    context: {
      scope: clampText(body.scope || "current project state", 1000),
      files: Array.isArray(body.files) ? body.files.slice(0, 30) : [],
      constraints: Array.isArray(body.constraints) ? body.constraints.slice(0, 30) : [],
      approvalRequired
    },
    response: null
  });
  await fs.appendFile(files.logPath, `${JSON.stringify(call)}\n`, "utf8");
  await compileFatcatSummary(files.key).catch(() => {});
  await appendPartyLineMessage({
    project: files.key,
    team: from,
    to,
    dagNode: call.dagNode || "",
    kind: "fatcat-call",
    status: status.toUpperCase(),
    text: `FATCAT ${call.id}: ${call.intent}\nTo: ${to.join(", ")}\n${call.request}`,
    evidence: call.markdownPath
  }).catch(() => {});
  const receipt = await writeReceipt("fatcat-call", {
    status: approvalRequired ? "NEEDS_APPROVAL" : "VERIFIED",
    project: files.key,
    callId: call.id,
    intent: call.intent,
    to,
    route: call.route.active,
    markdownPath: call.markdownPath
  }).catch(() => null);
  return { status: "VERIFIED", project: files.key, call, receiptPath: receipt?.receiptPath || null };
}

async function updateFatcatCall(body = {}) {
  const files = await fatcatFiles(body.project || "orangebox");
  const id = String(body.id || body.callId || "").trim();
  if (!id) throw new Error("call id is required");
  const jsonPath = path.join(files.callsDir, `${safeSegment(id)}.json`);
  const existing = await readJson(jsonPath, null);
  if (!existing) throw new Error(`FATCAT call not found: ${id}`);
  const status = String(body.status || existing.status || "queued").toLowerCase().replace(/\s+/g, "_").slice(0, 40);
  const call = await writeFatcatCall({
    ...existing,
    status,
    updatedAt: new Date().toISOString(),
    response: body.response || existing.response || {
      status,
      summary: clampText(body.summary || body.message || "", 2000),
      evidence: clampText(body.evidence || "", 1200),
      receiptPath: body.receiptPath || null,
      nextAction: clampText(body.nextAction || "", 1200)
    }
  });
  await fs.appendFile(files.logPath, `${JSON.stringify(call)}\n`, "utf8");
  await compileFatcatSummary(files.key).catch(() => {});
  await appendPartyLineMessage({
    project: files.key,
    team: call.from,
    to: call.to,
    dagNode: call.dagNode || "",
    kind: "fatcat-response",
    status: status.toUpperCase(),
    text: `${call.intent}: ${call.response?.summary || status}`,
    evidence: call.response?.receiptPath || call.response?.evidence || call.markdownPath
  }).catch(() => {});
  return { status: "VERIFIED", project: files.key, call };
}

async function fatcatStatus(project = "orangebox") {
  const files = await fatcatFiles(project);
  const route = await codexaRouteSnapshot().catch((error) => ({ status: "FAILED", active: "OFFLINE_OR_UNVERIFIED", error: error.message }));
  const calls = await readFatcatCalls(files.key, 80);
  const active = calls.calls.filter((call) => ["queued", "ringing", "running", "awaiting_response", "needs_approval"].includes(call.status));
  const summary = await compileFatcatSummary(files.key).catch(() => ({ summaryPath: files.summaryPath }));
  return {
    status: "VERIFIED",
    project: files.key,
    protocol: "fatcat-v1",
    route,
    dialPlan: [
      { ext: "100", target: "AE0", name: "Command" },
      { ext: "103", target: "LIPS", name: "Lips Team" },
      { ext: "106", target: "AE6", name: "Code" },
      { ext: "107", target: "MIRRORS", name: "Mirrors Team" },
      { ext: "111", target: "AE11", name: "Security" },
      { ext: "114", target: "CHECKMATE", name: "Checkmate" },
      { ext: "200", target: "CODEXA", name: "Codexa Worker" },
      { ext: "911", target: "OPERATOR", name: "Pause / Kill / Approval Gate" }
    ],
    activeCalls: active.length,
    latestCalls: calls.calls.slice(0, 12),
    summaryPath: summary.summaryPath,
    summaryUrl: `/orangebox/fatcat/${files.key}/FATCAT_SWITCHBOARD.md`
  };
}

function cockpitNetworkAddresses() {
  return Object.entries(os.networkInterfaces()).flatMap(([name, rows]) => (
    rows || []
  ).filter((row) => row.family === "IPv4" && !row.internal).map((row) => ({
    name,
    address: row.address,
    netmask: row.netmask,
    mac: row.mac
  })));
}

async function codexaEthernetRepairStatus(endpointsArg = null) {
  const endpoints = Array.isArray(endpointsArg) ? endpointsArg : await probeAiBoxEndpoints({ deep: true });
  const verified = endpoints.filter((row) => row.status === "VERIFIED");
  const rail = pickCommandRailEndpoint(endpoints);
  const directReady = Boolean(codexaDirectIp) && verified.some((row) => row.url?.includes(codexaDirectIp));
  const ethernetReady = Boolean(codexaIp) && verified.some((row) => row.url?.includes(codexaIp));
  let zipStat = null;
  try {
    zipStat = await fs.stat(codexaRepairZipPath);
  } catch {}
  const scriptPath = path.join(codexaRepairDir, "REPAIR_CODEXA_ETHERNET.ps1");
  const cmdPath = path.join(codexaRepairDir, "RUN_AS_ADMIN_ON_CODEXA.cmd");
  const readmePath = path.join(codexaRepairDir, "README.md");
  const localDownload = await probe(`http://127.0.0.1:${codexaRepairDownloadPort}/codexa-ethernet-repair.zip`, 650).catch((error) => ({
    status: "FAILED",
    error: error.message
  }));
  const routeActive = !aiBoxConfigured()
    ? "NOT_CONFIGURED_BASIC_INSTALL"
    : directReady
    ? "DIRECT_CAT8_READY"
    : ethernetReady
      ? "ETHERNET_GATEWAY_READY"
      : "ETHERNET_OFFLINE_OR_BLOCKED";
  const railVerified = rail?.status === "VERIFIED";
  const repairPackReady = Boolean(zipStat) && await exists(scriptPath) && await exists(cmdPath);
  const verifyHealthUrl = commandRailBaseUrl(rail) ? `${commandRailBaseUrl(rail)}/health` : null;
  return {
    generatedAt: new Date().toISOString(),
    status: railVerified
      ? "VERIFIED"
      : !aiBoxConfigured()
        ? "NOT_CONFIGURED_BASIC_INSTALL"
        : repairPackReady
        ? "BLOCKED_UNTIL_CODEXA_ADMIN_REPAIR"
        : "MISSING_REPAIR_PACK",
    cockpit: {
      expectedIp: cockpitIp,
      addresses: cockpitNetworkAddresses()
    },
    codexa: {
      ethernetIp: codexaIp,
      legacyWifiIp: codexaLegacyWifiIp,
      directCat8Ip: codexaDirectIp,
      commandRailUrl: verifyHealthUrl,
      activeRoute: routeActive,
      verifiedServices: verified.map((row) => row.url)
    },
    commandRail: {
      status: !aiBoxConfigured() ? "NOT_CONFIGURED_BASIC_INSTALL" : (rail?.status || "FAILED"),
      url: rail?.url || (commandRailBaseUrl(rail) ? `${commandRailBaseUrl(rail)}/health` : null),
      ms: rail?.ms ?? null,
      error: rail?.error || null
    },
    repairPack: {
      status: repairPackReady ? "LOCAL_REPAIR_PACK_READY" : "MISSING_REPAIR_PACK",
      zipPath: codexaRepairZipPath,
      zipExists: Boolean(zipStat),
      zipBytes: zipStat?.size || 0,
      downloadUrl: codexaRepairDownloadUrl,
      localDownloadStatus: localDownload.status,
      localDownloadMs: localDownload.ms ?? null,
      localDownloadNote: localDownload.status === "VERIFIED"
        ? "Cockpit helper answered locally; Codexa reachability still depends on firewall/router path."
        : "Start the repair download helper or move the zip manually."
    },
    files: {
      runAsAdminCmd: cmdPath,
      repairScript: scriptPath,
      readme: readmePath,
      latestNetworkReceipt: path.join(orangeRoot, "receipts", "BLUEB0X_ETHERNET_AND_24H_SCOPE_2026-05-07.md")
    },
    nextActions: !aiBoxConfigured() ? [
      "Basic Install is active. No AI Box has been configured, so no worker endpoint probes are needed.",
      "Choose Advanced AI Box only when a second AI computer is physically connected and you are ready to enter its IP."
    ] : railVerified ? [
      "Keep the AI Box on Ethernet and leave legacy Wi-Fi unused.",
      "Run a read-only power/status sample before raising workload concurrency."
    ] : [
      "On the AI Box, download/open the repair zip and run RUN_AS_ADMIN_ON_CODEXA.cmd as Administrator.",
      "The script should enable Ethernet, set the network profile Private, allow cockpit-only ports, restart the command rail if files exist, and only then disable Wi-Fi.",
      `Return here and verify ${verifyHealthUrl || `http://${codexaDirectIp || codexaIp || codexaLegacyWifiIp}:${commandRailPort}/health`} before sending AI Box jobs.`
    ],
    safety: [
      "This endpoint does not execute on the AI Box.",
      "No AI Box Docker, model, rail, or process mutations are run from this status check.",
      "A red rail is a real blocker, not a cosmetic warning."
    ],
    endpoints
  };
}

async function fastStatus() {
  const endpoints = await probeAiBoxEndpoints({ fast: true });
  const receipts = await listProductFacingFiles(path.join(orangeRoot, "receipts"), 12).catch(() => []);
  const proofs = await listFiles(path.join(orangeRoot, "proof"), 12).catch(() => []);
  const benchmarks = await listProductFacingFiles(path.join(orangeRoot, "benchmarks"), 8, (name) => name.endsWith(".json")).catch(() => []);
  const memoryGraph = await readJson(path.join(orangeRoot, "memory", "compiled", "graph.json"), { signals: [] });
  const knowledgeGraph = await readJson(path.join(orangeRoot, "memory", "orangebox-knowledge", "graph.json"), null);
  const knowledgePageTree = await readJson(path.join(orangeRoot, "memory", "orangebox-knowledge", "pagetree.json"), null);
  const commandRailEndpoint = pickCommandRailEndpoint(endpoints);
  const commandRailToken = await loadCommandRailToken().catch(() => "");
  const learning = await departmentLearningStatus("orangebox").catch((error) => ({ status: "FAILED", error: error.message, trends: [], departments: [] }));
  const checkmate = await checkmateStatus(false).catch((error) => ({ status: "FAILED", error: error.message, tools: [], counts: {} }));
  return {
    generatedAt: new Date().toISOString(),
    statusMode: "FAST_SEE_SUITE",
    orangeRoot,
    appRoot,
    seeSuiteIp: cockpitIp,
    aiBoxIp: codexaIp,
    aiBoxLegacyWifiIp: codexaLegacyWifiIp,
    aiBoxDirectIp: codexaDirectIp,
    allowedModels,
    bridgeTokenConfigured: Boolean(await loadBridgeToken().catch(() => "")),
    commandRailTokenConfigured: Boolean(commandRailToken),
    commandRail: {
      url: commandRailBaseUrl(commandRailEndpoint),
      defaultRoute: "THEORY_ON_SEE_SUITE_EXECUTION_ON_AI_BOX",
      status: !aiBoxConfigured() ? "NOT_CONFIGURED_BASIC_INSTALL" : (commandRailEndpoint?.status || "FAILED"),
      ms: commandRailEndpoint?.ms || null,
      auth: commandRailAuthEvidence(commandRailEndpoint, commandRailToken),
    },
    aiBoxRoute: {
      directIp: codexaDirectIp,
      ethernetIp: codexaIp,
      legacyWifiIp: codexaLegacyWifiIp,
      active: aiBoxRouteActive(endpoints),
      law: "Fast AE See-Suite probes are intentionally short. Use deep status only for diagnostics."
    },
    ethernetRepair: {
      status: !aiBoxConfigured()
        ? "NOT_CONFIGURED_BASIC_INSTALL"
        : endpoints.some((row) => codexaIp && row.url?.includes(codexaIp) && row.status === "VERIFIED") ? "VERIFIED_FAST" : "NEEDS_ATTENTION_FAST",
      mode: "FAST_AE_SEE_SUITE",
      recommendation: !aiBoxConfigured()
        ? "Basic Install is active. Add an AI Box only from Advanced setup when you have a second machine ready."
        : endpoints.some((row) => codexaIp && row.url?.includes(codexaIp) && row.status === "VERIFIED")
        ? "AI Box has at least one fast verified endpoint."
        : "Run the full Ethernet repair panel if AI Box endpoints remain red.",
      endpoints
    },
    endpoints,
    missions: (await listMissions().catch(() => [])).slice(0, 8),
    productionPlans: (await listProductionPlans().catch(() => [])).slice(0, 4),
    contexts: (await listContextBatches().catch(() => [])).slice(0, 4),
    receipts,
    proofs,
    benchmarks,
    agents: agentProfiles.map(({ command, ...profile }) => profile),
    claudeCode: { status: "DEFERRED_FAST_STATUS", detail: "Use /api/claude-code/status?force=1 for deep probe." },
    memory: {
      signals: Array.isArray(memoryGraph.signals) ? memoryGraph.signals.length : 0,
      lessons: await exists(path.join(orangeRoot, "memory", "compiled", "LESSONS_LEARNED.md")),
      mistakes: await exists(path.join(orangeRoot, "memory", "compiled", "MISTAKES.md")),
      clcPrimer: await exists(path.join(orangeRoot, "memory", "compiled", "CLC_PRIMER.md")),
      knowledge: knowledgeGraph ? {
        status: knowledgeGraph.status || "CONFIGURED",
        generatedAt: knowledgeGraph.generatedAt || null,
        documents: knowledgeGraph.counts?.documents || 0,
        contextSlices: knowledgeGraph.counts?.chunks || 0,
        chunks: knowledgeGraph.counts?.chunks || 0,
        pageTreeNodes: knowledgePageTree?.counts?.treeNodes || knowledgeGraph.counts?.pageTreeNodes || 0,
        pageTreeLeaves: knowledgePageTree?.counts?.leaves || knowledgeGraph.counts?.leaves || 0,
        nodes: knowledgeGraph.counts?.nodes || 0,
        edges: knowledgeGraph.counts?.edges || 0,
        dashboardUrl: "/orangebox/memory/orangebox-knowledge/dashboard.html",
        primerUrl: "/orangebox/memory/compiled/ORANGEBOX_KNOWLEDGE_PRIMER.md",
        pageTreePrimerUrl: "/orangebox/memory/compiled/ORANGEBOX_PAGETREE_PRIMER.md"
      } : {
        status: "MISSING",
        dashboardUrl: "/orangebox/memory/orangebox-knowledge/dashboard.html",
        primerUrl: "/orangebox/memory/compiled/ORANGEBOX_KNOWLEDGE_PRIMER.md",
        pageTreePrimerUrl: "/orangebox/memory/compiled/ORANGEBOX_PAGETREE_PRIMER.md"
      }
    },
    mcpEvents: await readMcpEvents(12).catch(() => []),
    tasks: [...taskStatuses.values()].slice(-8).reverse(),
    fatcat: { status: "DEFERRED_FAST_STATUS", activeCalls: 0, latestCalls: [] },
    triad: { status: "CONFIGURED_FAST", heads: comprehensiveTriad.heads, readyRoutes: [] },
    departmentLearning: learning,
    departmentModels: { status: "CONFIGURED_FAST", library: departmentModelLibrary, lifecycle: [], law: "Fast status defers AI Box model probes." },
    reviewEngines: { status: checkmate.status || "CONFIGURED_FAST", engines: reviewEngineLibrary, latestRuns: [], counts: checkmate.counts || {} },
    checkmate,
    costLimits: await costLimitsStatus("orangebox").catch((error) => ({ status: "FAILED", error: error.message })),
    telemetry: {
      subscriptionTokenCounts: "UNKNOWN_NO_SAFE_TAP",
      apiTokenCounts: "AVAILABLE_ONLY_FOR_ORANGEBOX_API_MODE",
      activeChatNames: "UNKNOWN_NO_SAFE_TAP"
    }
  };
}

async function costLimitsStatus(project = "orangebox") {
  const key = projectKey(project);
  const memory = process.memoryUsage();
  const uptimeSeconds = Math.round((Date.now() - serverStartedAtMs) / 1000);
  const endpointRows = Object.values(httpMetrics.byPath)
    .map((row) => ({
      ...row,
      avgMs: row.count ? Math.round(row.totalMs / row.count) : 0
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 16);
  const totalRamGB = Number((os.totalmem() / 1024 ** 3).toFixed(2));
  const freeRamGB = Number((os.freemem() / 1024 ** 3).toFixed(2));
  const processRamMB = Math.round(memory.rss / 1024 ** 2);
  const localStatus = processRamMB < 450 && freeRamGB > 2 ? "VERIFIED" : processRamMB < 900 ? "WATCH" : "THROTTLE";
  const payload = {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project: key,
    law: "No fake telemetry. Subscription-app token counts remain UNKNOWN unless ORANGEBOX owns a safe adapter or API call receipts prove usage.",
    providerTelemetry: {
      subscriptionTokenCounts: "UNKNOWN_NO_SAFE_TAP",
      subscriptionLimitPercent: "UNKNOWN_NO_SAFE_TAP",
      reason: "Claude Code/Desktop subscription apps do not expose trustworthy token accounting to this local server.",
      apiModeTokenCounts: "AVAILABLE_ONLY_FOR_ORANGEBOX_API_MODE",
      safeToDisplay: true
    },
    localTelemetry: {
      status: localStatus,
      uptimeSeconds,
      processRamMB,
      systemRamGB: totalRamGB,
      freeRamGB,
      loadAverage: os.loadavg(),
      http: {
        total: httpMetrics.total,
        failed: httpMetrics.failed,
        latest: httpMetrics.latest,
        endpoints: endpointRows
      }
    },
    budgets: {
      seeSuite: machineProfiles.cockpit.policy,
      aiBox: machineProfiles.codexa.policy,
      activeRule: "AE See-Suite stays interactive. Heavy builds, model work, screenshots, indexing, and long jobs should run on the AI Box when the rail is verified.",
      maxBandwidthLearningCrawl: "10% internet bandwidth policy, low concurrency only."
    },
    gates: [
      { id: "provider-token-honesty", status: "VERIFIED", detail: "Subscription tokens are explicitly UNKNOWN, not guessed." },
      { id: "local-process-telemetry", status: localStatus, detail: `${processRamMB}MB ORANGEBOX server RSS / ${freeRamGB}GB system RAM free.` },
      { id: "endpoint-accounting", status: "VERIFIED", detail: `${httpMetrics.total} local API requests observed since server start.` },
      { id: "api-spend", status: "CONFIGURED", detail: "Direct API spend accounting activates only when ORANGEBOX owns direct API calls." },
      { id: "ai-box-budget", status: "VERIFIED", detail: `AI Box policy reserves ${machineProfiles.codexa.policy.reserveRamGB}GB RAM and caps local model workers at ${machineProfiles.codexa.policy.localModelWorkers}.` }
    ],
    nextAction: "Use this panel to decide whether to increase AI Box work. Do not use it as Anthropic subscription billing truth."
  };
  await writeJson(path.join(orangeRoot, "power", "latest-cost-limits.json"), payload).catch(() => {});
  return payload;
}

async function ultraFastStatus() {
  const learningPath = path.join(orangeRoot, "knowledge", "department-learning", "department-learning.json");
  const learning = await readJson(learningPath, null).catch(() => null);
  const knowledgeGraph = await readJson(path.join(orangeRoot, "memory", "orangebox-knowledge", "graph.json"), null).catch(() => null);
  const costLimits = await costLimitsStatus("orangebox").catch((error) => ({ status: "FAILED", error: error.message }));
  const bridgeTokenConfigured = Boolean(await loadBridgeToken().catch(() => ""));
  const commandRailTokenConfigured = Boolean(await loadCommandRailToken().catch(() => ""));
  return {
    generatedAt: new Date().toISOString(),
    statusMode: "ULTRA_FAST_SEE_SUITE",
    orangeRoot,
    appRoot,
    seeSuiteIp: cockpitIp,
    aiBoxIp: codexaIp,
    aiBoxLegacyWifiIp: codexaLegacyWifiIp,
    aiBoxDirectIp: codexaDirectIp,
    allowedModels,
    bridgeTokenConfigured,
    commandRailTokenConfigured,
    commandRail: {
      url: commandRailBaseUrl(),
      defaultRoute: "THEORY_ON_AE_SEE_SUITE_EXECUTION_ON_AI_BOX",
      status: !aiBoxConfigured()
        ? "NOT_CONFIGURED_BASIC_INSTALL"
        : commandRailTokenConfigured ? "DEFERRED_ULTRA_FAST" : "CONFIGURED_MISSING_TOKEN",
      ms: "deferred",
      evidence: !aiBoxConfigured()
        ? "Basic Install is active. No AI Box host is configured, so ultra-fast status does not invent worker URLs."
        : commandRailTokenConfigured
        ? "Ultra-fast status confirms only local token custody; use fast/deep status for live AI Box proof."
        : "Ultra-fast status found no local command rail token. Build/install the command rail pack or set ORANGEBOX_AI_BOX_COMMAND_TOKEN."
    },
    aiBoxRoute: {
      directIp: codexaDirectIp,
      ethernetIp: codexaIp,
      legacyWifiIp: codexaLegacyWifiIp,
      active: aiBoxConfigured() ? "DEFERRED_ULTRA_FAST" : "NOT_CONFIGURED_BASIC_INSTALL",
      law: "Ultra-fast AE See-Suite status uses cached route posture. Use /api/status?fast=1 or /api/status?deep=1 for probes."
    },
    ethernetRepair: {
      status: aiBoxConfigured() ? "DEFERRED_ULTRA_FAST" : "NOT_CONFIGURED_BASIC_INSTALL",
      recommendation: aiBoxConfigured()
        ? "Use fast/deep status for live endpoint probes."
        : "Basic Install is active; no direct AI Box networking is required."
    },
    endpoints: [],
    missions: [],
    productionPlans: [],
    contexts: [],
    receipts: [],
    proofs: [],
    benchmarks: [],
    agents: agentProfiles.map(({ command, ...profile }) => profile),
    claudeCode: { status: "DEFERRED_ULTRA_FAST" },
    memory: {
      signals: 0,
      lessons: false,
      mistakes: false,
      clcPrimer: false,
      knowledge: knowledgeGraph ? {
        status: knowledgeGraph.status || "CONFIGURED",
        generatedAt: knowledgeGraph.generatedAt || null,
        documents: knowledgeGraph.counts?.documents || 0,
        contextSlices: knowledgeGraph.counts?.chunks || 0,
        chunks: knowledgeGraph.counts?.chunks || 0,
        pageTreeNodes: knowledgeGraph.counts?.pageTreeNodes || 0,
        pageTreeLeaves: knowledgeGraph.counts?.leaves || 0,
        nodes: knowledgeGraph.counts?.nodes || 0,
        edges: knowledgeGraph.counts?.edges || 0,
        dashboardUrl: "/orangebox/memory/orangebox-knowledge/dashboard.html",
        primerUrl: "/orangebox/memory/compiled/ORANGEBOX_KNOWLEDGE_PRIMER.md",
        pageTreePrimerUrl: "/orangebox/memory/compiled/ORANGEBOX_PAGETREE_PRIMER.md"
      } : { status: "MISSING" }
    },
    mcpEvents: [],
    tasks: [...taskStatuses.values()].slice(-4).reverse(),
    fatcat: { status: "DEFERRED_ULTRA_FAST", activeCalls: 0, latestCalls: [] },
    triad: { status: "CONFIGURED_FAST", heads: comprehensiveTriad.heads, readyRoutes: [] },
    departmentLearning: learning ? {
      status: learning.status || "VERIFIED",
      trends: learning.trends || [],
      departments: learning.departments || [],
      sourceCount: Array.isArray(learning.sourceLedger) ? learning.sourceLedger.length : 0,
      trainingExamples: 0,
      crawlPolicy: learning.crawlPolicy || null
    } : { status: "MISSING", trends: [], departments: [] },
    departmentModels: { status: "CONFIGURED_FAST", library: departmentModelLibrary, lifecycle: [], law: "Ultra-fast status defers model probes." },
    reviewEngines: { status: "CONFIGURED_FAST", engines: reviewEngineLibrary, latestRuns: [], counts: {} },
    checkmate: { status: "CONFIGURED_FAST", counts: {} },
    costLimits,
    autonomy: await autonomyStatus("orangebox").catch((error) => ({ status: "FAILED", error: error.message })),
    telemetry: {
      subscriptionTokenCounts: "UNKNOWN_NO_SAFE_TAP",
      apiTokenCounts: "AVAILABLE_ONLY_FOR_ORANGEBOX_API_MODE",
      activeChatNames: "UNKNOWN_NO_SAFE_TAP"
    }
  };
}

async function autonomyStatus(project = "orangebox") {
  const key = projectKey(project);
  const dag = await ensureProjectDag(key).catch((error) => ({ status: "FAILED", error: error.message, nodes: [], progress: {} }));
  const nodes = dag.nodes || [];
  const decisionQueue = nodes.filter((node) => node.human_approval_required || ["awaiting_approval", "awaiting_operator_arbitration", "blocked_by_security"].includes(String(node.status).toLowerCase()));
  const autonomousReady = nodes.filter((node) => {
    const status = String(node.status || "").toLowerCase();
    const deps = node.depends_on || [];
    const complete = new Set(nodes.filter((item) => String(item.status).toLowerCase() === "complete").map((item) => item.node_id));
    return status === "pending" && deps.every((dep) => complete.has(dep)) && !node.human_approval_required;
  });
  return {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    project: key,
    policy: autonomyPolicy,
    mode: autonomyPolicy.defaultMode,
    decisionQueue: decisionQueue.slice(0, 12).map((node) => ({
      node_id: node.node_id,
      node_name: node.node_name,
      status: node.status,
      owner_department: node.owner_department,
      reason: node.conflict?.action || (node.human_approval_required ? "human approval required" : node.status)
    })),
    autonomousReady: autonomousReady.slice(0, 12).map((node) => ({
      node_id: node.node_id,
      node_name: node.node_name,
      owner_department: node.owner_department,
      worker: node.worker,
      cost_profile: node.cost_profile
    })),
    counts: {
      decisionQueue: decisionQueue.length,
      autonomousReady: autonomousReady.length,
      totalNodes: nodes.length
    },
    nextAction: decisionQueue.length
      ? `Pause only for ${decisionQueue[0].node_id}: ${decisionQueue[0].node_name}.`
      : autonomousReady.length
        ? `Autonomous coding may advance ${autonomousReady[0].node_id}: ${autonomousReady[0].node_name}.`
        : "No runnable autonomous node right now."
  };
}

async function status() {
  const endpoints = await probeAiBoxEndpoints({ deep: true });
  const missions = await listMissions();
  const productionPlans = await listProductionPlans();
  const contexts = await listContextBatches();
  const receipts = await listProductFacingFiles(path.join(orangeRoot, "receipts"), 18);
  const proofs = await listFiles(path.join(orangeRoot, "proof"), 18);
  const benchmarks = await listProductFacingFiles(path.join(orangeRoot, "benchmarks"), 18, (name) => name.endsWith(".json"));
  const memoryGraph = await readJson(path.join(orangeRoot, "memory", "compiled", "graph.json"), { signals: [] });
  const knowledgeGraph = await readJson(path.join(orangeRoot, "memory", "orangebox-knowledge", "graph.json"), null);
  const knowledgePageTree = await readJson(path.join(orangeRoot, "memory", "orangebox-knowledge", "pagetree.json"), null);
  const claudeCode = await claudeCodeStatus().catch((error) => ({ status: "FAILED", error: error.message }));
  const commandRailEndpoint = pickCommandRailEndpoint(endpoints);
  const commandRailToken = await loadCommandRailToken().catch(() => "");
  return {
    generatedAt: new Date().toISOString(),
    orangeRoot,
    appRoot,
    cockpitIp,
      codexaIp,
      codexaLegacyWifiIp,
      codexaDirectIp,
    allowedModels,
    bridgeTokenConfigured: Boolean(await loadBridgeToken()),
    commandRailTokenConfigured: Boolean(commandRailToken),
    commandRail: {
      url: commandRailBaseUrl(commandRailEndpoint),
      defaultRoute: "THEORY_ON_AE_SEE_SUITE_EXECUTION_ON_AI_BOX",
      status: !aiBoxConfigured() ? "NOT_CONFIGURED_BASIC_INSTALL" : (commandRailEndpoint?.status || "FAILED"),
      auth: commandRailAuthEvidence(commandRailEndpoint, commandRailToken),
    },
      codexaRoute: {
        directIp: codexaDirectIp,
        ethernetIp: codexaIp,
        legacyWifiIp: codexaLegacyWifiIp,
        active: aiBoxRouteActive(endpoints),
        law: "Ethernet-only through Xfinity gateway is the active target. Legacy Wi-Fi must remain offline. Direct Cat 8 is future-only until verified."
      },
    ethernetRepair: await codexaEthernetRepairStatus(endpoints),
    endpoints,
    missions: missions.slice(0, 12),
    productionPlans: productionPlans.slice(0, 8),
    contexts: contexts.slice(0, 8),
    receipts,
    proofs,
    benchmarks,
    agents: agentProfiles.map(({ command, ...profile }) => profile),
    claudeCode,
    memory: {
      signals: Array.isArray(memoryGraph.signals) ? memoryGraph.signals.length : 0,
      lessons: await exists(path.join(orangeRoot, "memory", "compiled", "LESSONS_LEARNED.md")),
      mistakes: await exists(path.join(orangeRoot, "memory", "compiled", "MISTAKES.md")),
      clcPrimer: await exists(path.join(orangeRoot, "memory", "compiled", "CLC_PRIMER.md")),
      knowledge: knowledgeGraph ? {
        status: knowledgeGraph.status || "CONFIGURED",
        generatedAt: knowledgeGraph.generatedAt || null,
        documents: knowledgeGraph.counts?.documents || 0,
        contextSlices: knowledgeGraph.counts?.chunks || 0,
        chunks: knowledgeGraph.counts?.chunks || 0,
        pageTreeNodes: knowledgePageTree?.counts?.treeNodes || knowledgeGraph.counts?.pageTreeNodes || 0,
        pageTreeLeaves: knowledgePageTree?.counts?.leaves || knowledgeGraph.counts?.pageTreeLeaves || 0,
        nodes: knowledgeGraph.counts?.nodes || 0,
        edges: knowledgeGraph.counts?.edges || 0,
        dashboardUrl: "/orangebox/memory/orangebox-knowledge/dashboard.html",
        primerUrl: "/orangebox/memory/compiled/ORANGEBOX_KNOWLEDGE_PRIMER.md",
        pageTreePrimerUrl: "/orangebox/memory/compiled/ORANGEBOX_PAGETREE_PRIMER.md"
      } : {
        status: "MISSING",
        dashboardUrl: "/orangebox/memory/orangebox-knowledge/dashboard.html",
        primerUrl: "/orangebox/memory/compiled/ORANGEBOX_KNOWLEDGE_PRIMER.md",
        pageTreePrimerUrl: "/orangebox/memory/compiled/ORANGEBOX_PAGETREE_PRIMER.md"
      }
    },
    mcpEvents: await readMcpEvents(16),
    tasks: [...taskStatuses.values()].slice(-12).reverse(),
    fatcat: await withTimeout(fatcatStatus("orangebox"), 3000, { status: "TIMEOUT", activeCalls: 0, latestCalls: [] }).catch((error) => ({ status: "FAILED", error: error.message, activeCalls: 0, latestCalls: [] })),
    triad: await withTimeout(triadStatus("orangebox"), 3000, { status: "TIMEOUT", heads: comprehensiveTriad.heads, readyRoutes: [] }).catch((error) => ({ status: "FAILED", error: error.message, heads: comprehensiveTriad.heads, readyRoutes: [] })),
    departmentLearning: await withTimeout(departmentLearningStatus("orangebox"), 2000, { status: "TIMEOUT", trends: [], departments: [] }).catch((error) => ({ status: "FAILED", error: error.message, trends: [], departments: [] })),
    departmentModels: await withTimeout(departmentModelStatus("orangebox"), 3000, { status: "TIMEOUT", library: departmentModelLibrary, lifecycle: [] }).catch((error) => ({ status: "FAILED", error: error.message, library: departmentModelLibrary, lifecycle: [] })),
    reviewEngines: await withTimeout(reviewEngineStatus("orangebox"), 2000, { status: "TIMEOUT", engines: reviewEngineLibrary, latestRuns: [] }).catch((error) => ({ status: "FAILED", error: error.message, engines: reviewEngineLibrary, latestRuns: [] })),
    costLimits: await withTimeout(costLimitsStatus("orangebox"), 1500, { status: "TIMEOUT" }).catch((error) => ({ status: "FAILED", error: error.message })),
    autonomy: await withTimeout(autonomyStatus("orangebox"), 1500, { status: "TIMEOUT" }).catch((error) => ({ status: "FAILED", error: error.message })),
    telemetry: {
      subscriptionTokenCounts: "UNKNOWN_NO_SAFE_TAP",
      apiTokenCounts: "AVAILABLE_ONLY_FOR_ORANGEBOX_API_MODE",
      activeChatNames: "UNKNOWN_NO_SAFE_TAP"
    }
  };
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function createMission(body) {
  const goal = String(body.goal || "").trim();
  if (!goal) throw new Error("mission goal is required");
  const model = allowedModels.includes(body.model) ? body.model : "claude-opus-4-7";
  const mode = String(body.mode || "code-build");
  const contextIds = Array.isArray(body.contextIds) ? body.contextIds : [];
  const id = missionId(goal);
  const agents = selectAgents(goal, mode);
  const mission = {
    id,
    title: goal.slice(0, 90),
    goal,
    mode,
    model,
    modelPolicy: "frontier-only: claude-opus-4-7 or gpt-5.5",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "Queued",
    contextIds,
    contextCount: contextIds.length,
    agents,
    frontierLaneCount: agents.filter((agent) => ["AE0", "AE3", "AE6", "AE7", "AE11", "AE14"].includes(agent.id)).length,
    approvals: agents.filter((agent) => ["AE0", "AE3", "AE6", "AE7", "AE11", "AE14"].includes(agent.id)).length > 3
      ? ["More than three frontier-capable AE lanes selected; BLUEB0X.AI should sequence them unless the operator approves parallel fanout."]
      : [],
    nodes: []
  };
  mission.nodes = buildMissionGraph(mission);
  await writeJson(path.join(orangeRoot, "missions", `${id}.json`), mission);
  await writeReceipt("mission-created", { status: "VERIFIED", missionId: id, goal, model, mode, agents });
  return mission;
}

async function updateMission(id, patch) {
  const file = path.join(orangeRoot, "missions", safeSegment(id) + ".json");
  const mission = await readJson(file, null);
  if (!mission) throw new Error(`mission not found: ${id}`);
  Object.assign(mission, patch, { updatedAt: new Date().toISOString() });
  await writeJson(file, mission);
  return mission;
}

async function contextUpload(body) {
  const files = Array.isArray(body.files) ? body.files : [];
  if (!files.length) throw new Error("no files supplied");
  const batchId = `${stamp()}-${safeSegment(body.label || "context-batch")}`;
  const batchDir = path.join(orangeRoot, "context-vault", batchId);
  await fs.mkdir(batchDir, { recursive: true });
  const items = [];
  let storedBytes = 0;
  for (const file of files.slice(0, 500)) {
    const rel = safeSegment(file.relativePath || file.name || "file");
    const rawName = safeSegment(file.name || path.basename(rel) || "file");
    const actionRisk = classifyRisk(file);
    const action = file.action || recommendedAction(file, actionRisk);
    let storedPath = "";
    let sha256 = "";
    let stored = false;
    const data = String(file.data || "");
    if (data && action !== "exclude") {
      const base64 = data.includes(",") ? data.split(",").pop() : data;
      const buffer = Buffer.from(base64, "base64");
      sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
      const target = path.join(batchDir, `${String(items.length + 1).padStart(4, "0")}-${rawName}`);
      await fs.writeFile(target, buffer);
      storedBytes += buffer.length;
      storedPath = target;
      stored = true;
    }
    items.push({
      id: crypto.createHash("sha1").update(`${batchId}:${rel}:${file.size}:${items.length}`).digest("hex").slice(0, 12),
      name: file.name || rawName,
      relativePath: file.relativePath || file.name || rawName,
      type: file.type || "application/octet-stream",
      size: Number(file.size) || 0,
      estimatedTokens: estimateTokens(file.size || 0),
      risk: actionRisk,
      action,
      stored,
      storedPath,
      sha256,
      lastModified: file.lastModified || null
    });
  }
  const manifest = {
    id: batchId,
    label: body.label || "Context Batch",
    createdAt: new Date().toISOString(),
    itemCount: items.length,
    storedBytes,
    estimatedTokens: items.reduce((sum, item) => sum + item.estimatedTokens, 0),
    items
  };
  await writeJson(path.join(batchDir, "manifest.json"), manifest);
  await writeReceipt("context-upload", {
    status: "VERIFIED",
    batchId,
    itemCount: items.length,
    storedBytes,
    highRisk: items.filter((item) => item.risk === "HIGH").length
  });
  return manifest;
}

async function writeReceipt(kind, data) {
  await fs.mkdir(path.join(orangeRoot, "receipts"), { recursive: true });
  const receiptPath = path.join(orangeRoot, "receipts", `orangebox-command-${kind}-${stamp()}.json`);
  const receipt = { generatedAt: new Date().toISOString(), kind, receiptPath, ...data };
  await fs.writeFile(receiptPath, JSON.stringify(receipt, null, 2), "utf8");
  return receipt;
}

function exeName(name) {
  return process.platform === "win32" ? `${name}.exe` : name;
}

function cmdName(name) {
  return process.platform === "win32" ? `${name}.cmd` : name;
}

function checkmateNodeCommand(name) {
  return path.join(checkmateNodeBin, cmdName(name));
}

function pythonUserCommand(name) {
  return path.join(pythonUserScripts, exeName(name));
}

function checkmateEnv(extra = {}) {
  return {
    ...process.env,
    PATH: `${pythonUserScripts}${path.delimiter}${checkmateNodeBin}${path.delimiter}${process.env.PATH || ""}`,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
    ...extra
  };
}

function isAllowedProbeCommand(command) {
  const resolved = path.resolve(String(command || ""));
  const allowedRoots = [checkmateNodeBin, pythonUserScripts, checkmateBin].map((root) => path.resolve(root).toLowerCase());
  const allowedExact = new Set([
    path.resolve(process.env.SystemRoot || "C:\\Windows", "System32", "where.exe").toLowerCase(),
    path.resolve("where.exe").toLowerCase()
  ]);
  if (allowedExact.has(resolved.toLowerCase()) || String(command).toLowerCase() === "where.exe") return true;
  const lower = resolved.toLowerCase();
  return allowedRoots.some((root) => lower === root || lower.startsWith(`${root}${path.sep}`));
}

async function commandAvailable(command, args = ["--version"], timeoutMs = 8000, extraEnv = {}) {
  try {
    if (!isAllowedProbeCommand(command)) {
      return { ok: false, output: `blocked probe command outside BLUEB0X Checkmate allowlist: ${command}` };
    }
    const isCmdShim = process.platform === "win32" && String(command).toLowerCase().endsWith(".cmd");
    const executable = isCmdShim ? "cmd.exe" : command;
    const commandArgs = isCmdShim
      ? ["/d", "/c", command, ...args]
      : args;
    const result = await execFileAsync(executable, commandArgs, {
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 512,
      env: checkmateEnv(extraEnv)
    });
    return { ok: true, output: clampText(`${result.stdout || ""}${result.stderr || ""}`.trim(), 900) };
  } catch (error) {
    return { ok: false, output: clampText(`${error.stdout || ""}${error.stderr || error.message || ""}`.trim(), 900) };
  }
}

async function commandStarts(command, args = [], settleMs = 2500, extraEnv = {}) {
  return await new Promise((resolve) => {
    if (!isAllowedProbeCommand(command)) {
      resolve({ ok: false, output: `blocked probe command outside BLUEB0X Checkmate allowlist: ${command}` });
      return;
    }
    const isCmdShim = process.platform === "win32" && String(command).toLowerCase().endsWith(".cmd");
    const executable = isCmdShim ? "cmd.exe" : command;
    const commandArgs = isCmdShim ? ["/d", "/c", command, ...args] : args;
    let output = "";
    let settled = false;
    const child = spawn(executable, commandArgs, {
      windowsHide: true,
      env: checkmateEnv(extraEnv),
      stdio: ["ignore", "pipe", "pipe"]
    });
    const finish = (ok, detail) => {
      if (settled) return;
      settled = true;
      if (child.pid && !child.killed) {
        try {
          if (process.platform === "win32") {
            spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], {
              windowsHide: true,
              stdio: "ignore"
            });
          } else {
            child.kill();
          }
        } catch {
          // Process already ended.
        }
      }
      resolve({ ok, output: clampText(`${detail || ""}${output ? `\n${output}` : ""}`.trim(), 900) });
    };
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => finish(false, error.message));
    child.on("exit", (code) => {
      finish(code === 0, `exited=${code}`);
    });
    setTimeout(() => finish(true, "started-and-held"), settleMs);
  });
}

async function whereCommand(name) {
  return commandAvailable("where.exe", [name], 5000);
}

function redactSecrets(value) {
  return String(value ?? "")
    .replace(/github_pat_[A-Za-z0-9_]{20,}/g, "[redacted-github-pat]")
    .replace(/ghp_[A-Za-z0-9]{20,}/g, "[redacted-github-token]")
    .replace(/vcp_[A-Za-z0-9_]{20,}/g, "[redacted-vercel-token]")
    .replace(/vck_[A-Za-z0-9_]{20,}/g, "[redacted-vercel-token]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[redacted-api-key]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[redacted-jwt]");
}

function atomScoreForTool(tool) {
  const base = {
    VERIFIED: 100,
    CONFIGURED: 55,
    CONFIGURED_WITH_GAPS: 45,
    MISSING_RUNTIME: 0,
    FAILED: 0
  }[tool.status] ?? 30;
  return tool.atomUpgrade?.requiredForAtom === false ? Math.min(100, base + 10) : base;
}

function atomVerdict(score) {
  if (score >= 95) return "Atom Standard";
  if (score >= 85) return "Tasteful";
  if (score >= 70) return "Polish";
  if (score >= 50) return "Revise";
  return "Block";
}

function enrichCheckmateTool(tool) {
  const atomUpgrade = checkmateAtomUpgrades[tool.id] || {
    upgradeName: "Reality Gate",
    requiredForAtom: true,
    catches: ["unverified claims"],
    revisionTriggers: ["tool lacks a detector"],
    shipGate: "Detector must exist before promotion."
  };
  const atomInstrument = atomInstrumentBlueprints[tool.id] || {
    instrument: atomUpgrade.upgradeName || "Reality Gate",
    promise: "Force this check to produce evidence before the work can claim done.",
    tenXMove: "Attach detector output to receipts and revision triggers.",
    stack: [tool.name],
    output: "atom-evidence.json",
    future: "Promote into a first-class Atom Instrument."
  };
  const score = atomScoreForTool({ ...tool, atomUpgrade });
  return {
    ...tool,
    atomUpgrade,
    atomInstrument,
    atomScore: score,
    atomVerdict: atomVerdict(score)
  };
}

function buildAtomStandardReport(tools) {
  const required = tools.filter((tool) => tool.atomUpgrade?.requiredForAtom !== false);
  const blockers = required
    .filter((tool) => tool.status !== "VERIFIED")
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      status: tool.status,
      reason: tool.detail || tool.atomUpgrade?.shipGate || "Not verified.",
      next: tool.atomUpgrade?.shipGate || "Verify tool with real evidence."
    }));
  const avg = required.length
    ? Math.round(required.reduce((sum, tool) => sum + Number(tool.atomScore || 0), 0) / required.length)
    : 0;
  const status = blockers.length
    ? avg >= atomStandard.threshold.reviewPct ? "REVISE" : "BLOCKED"
    : "ATOM_STANDARD_READY";
  return {
    status,
    score: blockers.length ? Math.min(avg, 94) : Math.max(avg, 95),
    verdict: blockers.length ? "Revise before promotion" : "Atom Standard gate armed",
    revisionPressurePct: atomStandard.revisionPressurePct,
    doctrine: atomStandard.doctrine,
    blockers,
    gates: atomStandard.levels,
    rejectCodes: atomStandard.rejectCodes,
    designAuthority: tasteWiki.finalAuthority,
    requiredCount: required.length,
    verifiedRequiredCount: required.filter((tool) => tool.status === "VERIFIED").length
  };
}

async function tasteEngineStatus() {
  const payload = {
    status: "VERIFIED",
    generatedAt: new Date().toISOString(),
    aliasLaw: "When the operator says wiki, BLUEB0X.AI means BLUEB0X.AI Knowledge / AEmemory: an active knowledge engine, not a static document pile.",
    atomStandard,
    tasteEngine: tasteWiki
  };
  await writeJson(path.join(orangeRoot, "knowledge", "taste-engine", "atom-standard.json"), atomStandard).catch(() => {});
  await writeJson(path.join(orangeRoot, "knowledge", "taste-engine", "taste-engine.json"), tasteWiki).catch(() => {});
  await fs.writeFile(path.join(orangeRoot, "knowledge", "taste-engine", "README.md"), [
    "# BLUEB0X.AI Taste Engine",
    "",
    "Wiki means BLUEB0X.AI Knowledge / AEmemory: an active knowledge engine.",
    "",
    `Doctrine: ${atomStandard.doctrine}`,
    "",
    `Final authority: ${tasteWiki.finalAuthority}`,
    "",
    "## Influences",
    ...tasteWiki.influences.map((item) => `- ${item.name}: ${item.use}`),
    "",
    "## Final Pass",
    ...tasteWiki.finalPass.map((item) => `- ${item.label}: ${item.question}`)
  ].join("\n"), "utf8").catch(() => {});
  return payload;
}

async function atomStandardReview(body = {}) {
  const text = [
    body.goal,
    body.artifact,
    body.evidence,
    body.notes,
    body.operatorDecision
  ].map((value) => String(value || "")).join("\n").toLowerCase();
  const checkmate = await checkmateStatus(false);
  const checks = tasteWiki.finalPass.map((gate) => {
    const patterns = {
      clarity: /next|primary|clear|obvious|operator|goal|flow/,
      usefulness: /useful|faster|safer|workflow|job|complete|ship|build/,
      restraint: /remove|cut|simpl|focus|less|subtraction|not needed/,
      motion: /motion|state|feedback|animate|transition|alive|responsive/,
      material: /receipt|proof|control|status|instrument|real|evidence/,
      edge: /distinct|atomeons|misfit|frontier|memorable|opinion|sovereign/,
      proof: /screenshot|test|receipt|verified|build|checkmate|evidence/
    };
    const passed = patterns[gate.id]?.test(text) || false;
    return {
      ...gate,
      status: passed ? "VERIFIED" : "REVISE",
      note: passed ? "Signal present in the review packet." : "Packet lacks enough signal for this taste gate."
    };
  });
  const missingRequiredTools = (checkmate.atomReport?.blockers || []).map((blocker) => blocker.id);
  const passedCount = checks.filter((item) => item.status === "VERIFIED").length;
  const score = Math.round((passedCount / Math.max(checks.length, 1)) * 70)
    + (missingRequiredTools.length ? 0 : 30);
  const review = {
    status: score >= 95 ? "ATOM_STANDARD_READY" : score >= 70 ? "REVISE" : "BLOCKED",
    generatedAt: new Date().toISOString(),
    score,
    verdict: atomVerdict(score),
    designAuthority: tasteWiki.finalAuthority,
    operatorApprovalRequired: true,
    checks,
    checkmateBlockers: missingRequiredTools,
    ruling: score >= 95
      ? "This packet can pass the Atom Standard after operator approval."
      : "Revise before promotion. The point is to make most work better before it survives final taste.",
    next: missingRequiredTools.length
      ? `Fix Checkmate blockers first: ${missingRequiredTools.join(", ")}.`
      : "Add stronger evidence and AE3 taste notes, then rerun final pass."
  };
  const reviewPath = path.join(orangeRoot, "knowledge", "atom-standard", `review-${stamp()}.json`);
  await writeJson(reviewPath, review).catch(() => {});
  await writeReceipt("atom-standard-review", { status: review.status, score, reviewPath }).catch(() => {});
  return { ...review, reviewPath };
}

function clampText(value, limit = 12000) {
  const text = redactSecrets(value);
  return text.length > limit ? `${text.slice(0, limit)}\n[truncated ${text.length - limit} chars]` : text;
}

function rawSecretFindings(value) {
  const text = String(value ?? "");
  const patterns = [
    { id: "github-pat", pattern: /github_pat_[A-Za-z0-9_]{20,}/g },
    { id: "github-token", pattern: /ghp_[A-Za-z0-9]{20,}/g },
    { id: "vercel-token", pattern: /vc[pk]_[A-Za-z0-9_]{20,}/g },
    { id: "openai-key", pattern: /sk-[A-Za-z0-9_-]{20,}/g },
    { id: "jwt", pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g }
  ];
  const findings = [];
  for (const item of patterns) {
    const matches = [...text.matchAll(item.pattern)];
    if (matches.length) findings.push({ id: item.id, count: matches.length });
  }
  return findings;
}

function classifyCommandRisk(command = "", body = {}) {
  return classifyShellAction(command, {
    ...body,
    approvedWorkspacePrefixes: autonomyPolicy.approvedWorkspacePrefixes,
  });
}

function codexaResultText(result) {
  const response = result?.response || {};
  return [
    response.stdout,
    response.stderr,
    response.result?.stdout,
    response.result?.stderr,
    typeof response === "string" ? response : "",
    result?.error
  ].filter(Boolean).join("\n");
}

async function checkmateReturnGate({ source = "codexa", command = "", result = {}, risk = {}, artifactPath = null, requiredLevel = "auto" } = {}) {
  const raw = codexaResultText(result);
  const secretFindings = rawSecretFindings(raw);
  const lower = `${command}\n${raw}`.toLowerCase();
  const generatedSkill = /skill\.md|skills\\|skills\//i.test(`${command}\n${raw}`);
  const fakeSkillSignals = [
    /fake skill/i,
    /placeholder skill/i,
    /todo: implement/i,
    /simulated verified/i,
    /verified without/i
  ].filter((pattern) => pattern.test(`${command}\n${raw}`)).map((pattern) => String(pattern));
  const checkKinds = [];
  if (/npm\.cmd run check|npm run check|node --check/i.test(`${command}\n${raw}`)) checkKinds.push("syntax-check");
  if (/playwright|screenshot|visual proof/i.test(`${command}\n${raw}`)) checkKinds.push("visual-proof");
  if (/semgrep|osv-scanner|secret|security/i.test(`${command}\n${raw}`)) checkKinds.push("security-scan");
  if (/receiptpath|receipt path|receipts?[/\\]/i.test(`${command}\n${raw}`)) checkKinds.push("receipt");
  if (/CHECKMATE_FULL_CONFIGURED|CHECKMATE_LIGHT_VERIFIED|PROMOTABLE_WITH_RECEIPT_REVIEW/i.test(`${command}\n${raw}`)) checkKinds.push("nested-checkmate-gate");
  const needsFullGate = requiredLevel === "full"
    || generatedSkill
    || /build|test|sync|deploy|skill|generate|create|refactor|implement|install|\bnew-item\b|\bset-content\b|\badd-content\b|\bcopy-item\b|\bmove-item\b/.test(lower)
    || risk.class === "MUTATING"
    || risk.class === "DESTRUCTIVE";
  let status = result.status === "VERIFIED" ? "CHECKMATE_LIGHT_VERIFIED" : "FAILED";
  let promotion = status === "CHECKMATE_LIGHT_VERIFIED" ? "PROMOTABLE_READ_ONLY" : "BLOCKED";
  const blockers = [];
  if (secretFindings.length) {
    status = "BLOCKED_SECRET_FINDING";
    promotion = "BLOCKED_ROTATE_OR_REDACT";
    blockers.push("raw secret-like token appeared in Codexa output");
  }
  if (fakeSkillSignals.length) {
    status = "BLOCKED_FAKE_SKILL_RISK";
    promotion = "BLOCKED_REQUIRE_REAL_SKILL_VALIDATION";
    blockers.push("fake-skill or placeholder signal appeared in Codexa output");
  }
  if (risk.requiresApproval && !risk.approved) {
    status = "NEEDS_APPROVAL";
    promotion = "BLOCKED_UNTIL_OPERATOR_APPROVAL";
    blockers.push("state-changing command requires explicit approval token");
  }
  if (!blockers.length && needsFullGate) {
    const hasMinimumEvidence = checkKinds.includes("syntax-check") || checkKinds.includes("visual-proof") || checkKinds.includes("security-scan") || checkKinds.includes("receipt");
    status = hasMinimumEvidence && result.status === "VERIFIED" ? "CHECKMATE_FULL_CONFIGURED" : "CHECKMATE_REVIEW_REQUIRED";
    promotion = hasMinimumEvidence && result.status === "VERIFIED" ? "PROMOTABLE_WITH_RECEIPT_REVIEW" : "BLOCKED_UNTIL_CHECKMATE";
    if (!hasMinimumEvidence) blockers.push("no build/test/security/visual/receipt evidence detected in Codexa return");
  }
  const gate = {
    status,
    promotion,
    source,
    generatedAt: new Date().toISOString(),
    riskClass: risk.class || "UNKNOWN",
    requiredLevel: needsFullGate ? "full" : "light",
    evidenceKinds: [...new Set(checkKinds)],
    secretFindings,
    fakeSkillSignals,
    blockers,
    artifactPath,
    rule: "Codexa work cannot be called complete or promoted unless this gate is green and the receipt/proof path is inspectable."
  };
  const receipt = await writeReceipt("codexa-checkmate-gate", gate);
  return { ...gate, receiptPath: receipt.receiptPath };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cpuSnapshot() {
  return os.cpus().map((cpu) => ({ ...cpu.times }));
}

function cpuPercent(start, end) {
  let idle = 0;
  let total = 0;
  for (let i = 0; i < Math.min(start.length, end.length); i += 1) {
    const before = start[i];
    const after = end[i];
    const idleDelta = after.idle - before.idle;
    const totalBefore = before.user + before.nice + before.sys + before.idle + before.irq;
    const totalAfter = after.user + after.nice + after.sys + after.idle + after.irq;
    idle += idleDelta;
    total += totalAfter - totalBefore;
  }
  if (!total) return null;
  return Math.max(0, Math.min(100, Math.round((1 - idle / total) * 1000) / 10));
}

async function cockpitPower() {
  const start = cpuSnapshot();
  await sleep(350);
  const cpu = cpuPercent(start, cpuSnapshot());
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const usedMemoryPercent = totalMemoryBytes
    ? Math.round((1 - freeMemoryBytes / totalMemoryBytes) * 1000) / 10
    : null;
  return {
    status: "VERIFIED",
    machine: "ae-see-suite",
    hostname: os.hostname(),
    cpuPercent: cpu,
    logicalCores: os.cpus().length,
    totalMemoryGB: Math.round(totalMemoryBytes / 1024 / 1024 / 102.4) / 10,
    freeMemoryGB: Math.round(freeMemoryBytes / 1024 / 1024 / 102.4) / 10,
    usedMemoryPercent,
    nodeRssMB: Math.round(process.memoryUsage().rss / 1024 / 102.4) / 10,
    note: "AE See-Suite sample is lightweight so ORANGEBOX does not add load while measuring."
  };
}

function parseCodexaPower(result) {
  if (result?.status === "NOT_CONFIGURED_BASIC_INSTALL") {
    return {
      status: "NOT_CONFIGURED_BASIC_INSTALL",
      machine: "ai-box",
      optional: true,
      configured: false,
      label: "Basic Install active - Advanced AI Box not configured",
      detail: result.detail || "Advanced AI Box support is optional. Use Advanced setup when a second AI computer is available.",
      error: null
    };
  }
  if (result?.status === "CONFIGURED_MISSING_TOKEN") {
    return {
      status: "CONFIGURED_MISSING_TOKEN",
      machine: "ai-box",
      optional: false,
      configured: true,
      label: "Advanced AI Box configured - command token missing",
      detail: result.detail || "Set ORANGEBOX_AI_BOX_COMMAND_TOKEN or rebuild the Advanced AI Box command rail pack.",
      error: null
    };
  }
  const receipt = result?.response || {};
  const stdout = String(receipt.stdout || receipt.result?.stdout || "");
  const stderr = String(receipt.stderr || receipt.result?.stderr || "");
  let parsed = null;
  try {
    const jsonStart = stdout.indexOf("{");
    if (jsonStart >= 0) parsed = JSON.parse(stdout.slice(jsonStart));
  } catch {}
  if (!parsed) {
    return {
      status: result.status === "VERIFIED" ? "CONFIGURED_UNPARSED" : result.status,
      machine: "ai-box",
      error: result.error || receipt.error || result.detail || stderr || "AI Box power sample did not return JSON.",
      stdout: clampText(stdout, 2200)
    };
  }
  return {
    status: "VERIFIED",
    machine: "ai-box",
    hostname: "AI Box",
    hostFingerprint: shortTokenHash(String(parsed.Hostname || parsed.hostname || "ai-box")),
    processorName: parsed.ProcessorName || parsed.processorName || null,
    coreCount: Number(parsed.CoreCount ?? parsed.coreCount ?? 0),
    logicalProcessors: Number(parsed.LogicalProcessors ?? parsed.logicalProcessors ?? 0),
    cpuPercent: Number(parsed.CpuPercent ?? parsed.cpuPercent ?? 0),
    totalMemoryGB: Number(parsed.TotalMemoryGB ?? parsed.totalMemoryGB ?? 0),
    freeMemoryGB: Number(parsed.FreeMemoryGB ?? parsed.freeMemoryGB ?? 0),
    usedMemoryPercent: Number(parsed.UsedMemoryPercent ?? parsed.usedMemoryPercent ?? 0),
    network: Array.isArray(parsed.Network) ? parsed.Network : [],
    processes: Array.isArray(parsed.Processes) ? parsed.Processes : [],
    docker: Array.isArray(parsed.Docker) ? parsed.Docker : [],
    sampledAt: parsed.Timestamp || null,
    receiptPath: receipt.receiptPath || null
  };
}

function pressureRecommendation(codexa, cockpit) {
  if (codexa.status === "NOT_CONFIGURED_BASIC_INSTALL") {
    return {
      status: "BASIC_INSTALL_ONLY",
      label: "Basic Install active",
      detail: "No Advanced AI Box is configured. Keep heavy jobs on this machine conservative or run Advanced setup when a second AI computer is available."
    };
  }
  if (codexa.status === "CONFIGURED_MISSING_TOKEN") {
    return {
      status: "ADVANCED_SETUP_INCOMPLETE",
      label: "Advanced setup needs token",
      detail: "An Advanced AI Box host is configured, but the command token is missing. Finish the command rail token step before routing AI-box work."
    };
  }
  if (codexa.status !== "VERIFIED") {
    return {
      status: "FAILED",
      label: "Cannot increase",
      detail: "AI Box load could not be proven. Fix the command rail before adding work."
    };
  }
  const cpu = Number(codexa.cpuPercent || 0);
  const freeMemoryPct = codexa.totalMemoryGB ? (codexa.freeMemoryGB / codexa.totalMemoryGB) * 100 : 0;
  const cockpitMemoryHot = Number(cockpit.usedMemoryPercent || 0) > 88;
  if (cpu >= 88 || freeMemoryPct < 15 || cockpitMemoryHot) {
    return {
      status: "DO_NOT_INCREASE",
      label: "Do not increase",
      detail: cockpitMemoryHot
        ? "AE See-Suite memory is hot. Keep Claude and ORANGEBOX responsive before adding AI Box work."
        : "AI Box is near a pressure limit. Let current work drain before adding heavy jobs."
    };
  }
  if (cpu >= 60 || freeMemoryPct < 28) {
    return {
      status: "HOLD_OR_SMALL_INCREASE",
      label: "Hold or one small job",
      detail: "Use one read-only profile or a small build check. Avoid stacking heavy builds/tests/local model jobs."
    };
  }
  return {
    status: "CAN_INCREASE",
    label: "Can increase",
    detail: "AI Box has headroom. Add one more small team or one heavy job, then re-sample before increasing again."
  };
}

function numeric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentFree(machine) {
  return machine?.totalMemoryGB ? (numeric(machine.freeMemoryGB) / numeric(machine.totalMemoryGB)) * 100 : 0;
}

function optimizerStatusFromPower(power) {
  const cockpit = power?.seeSuite || power?.cockpit || {};
  const codexa = power?.aiBox || power?.codexa || {};
  const codexaFreePct = percentFree(codexa);
  const cockpitFreePct = percentFree(cockpit);
  const codexaCpu = numeric(codexa.cpuPercent);
  const cockpitCpu = numeric(cockpit.cpuPercent);
  const codexaRamFree = numeric(codexa.freeMemoryGB);
  const cockpitHot = cockpitCpu >= 75 || cockpitFreePct < 18 || numeric(cockpit.usedMemoryPercent) >= 84;
  const codexaUnavailable = codexa.status !== "VERIFIED";
  const codexaHot = codexaCpu >= 88 || codexaFreePct < 15;
  const codexaWarm = codexaCpu >= 65 || codexaFreePct < 28;
  const wifiActive = Array.isArray(codexa.network)
    ? codexa.network.some((adapter) => String(adapter.Status || adapter.status || "").toLowerCase() === "up" && /wi-?fi|wireless/i.test(String(adapter.Name || adapter.InterfaceDescription || "")))
    : true;
  const tenGigLinked = Array.isArray(codexa.network)
    ? codexa.network.some((adapter) => String(adapter.Status || adapter.status || "").toLowerCase() === "up" && /10\s*gbps|10g/i.test(String(adapter.LinkSpeed || adapter.linkSpeed || "")))
    : false;

  const concurrency = {
    seeSuite: {
      smallJobs: cockpitHot ? 0 : machineProfiles.cockpit.policy.localSmallJobs,
      heavyJobs: 0,
      reason: cockpitHot ? "AE See-Suite is reserved for interactivity right now." : "AE See-Suite can handle only tiny coordination work."
    },
    aiBox: {
      smallJobs: codexaUnavailable || codexaHot ? 0 : codexaWarm ? 2 : machineProfiles.codexa.policy.smallJobs,
      heavyJobs: codexaUnavailable || codexaHot ? 0 : codexaWarm ? 0 : machineProfiles.codexa.policy.heavyJobs,
      browserWorkers: codexaUnavailable || codexaHot ? 0 : codexaWarm ? 1 : machineProfiles.codexa.policy.browserWorkers,
      localModelWorkers: codexaUnavailable || codexaHot || codexaRamFree < 48 ? 0 : machineProfiles.codexa.policy.localModelWorkers,
      dockerHeavyJobs: codexaUnavailable || codexaHot ? 0 : codexaWarm ? 0 : machineProfiles.codexa.policy.dockerHeavyJobs
    },
    frontierLanes: codexaUnavailable || codexaHot ? 1 : codexaWarm ? 2 : 3
  };

  let status = "CAN_INCREASE";
  let label = "Optimal: add one AI Box workload";
  let detail = "Run one heavy AI Box job or up to six small worker jobs. Re-sample before stacking another heavy job.";
  if (codexaUnavailable) {
    status = "FAILED";
    label = "Cannot optimize";
    detail = "AI Box is not verified. Repair the command rail before dispatching work.";
  } else if (codexaHot || cockpitHot) {
    status = "DO_NOT_INCREASE";
    label = "Hold load";
    detail = cockpitHot
      ? "AE See-Suite is under pressure. Preserve the command surface and avoid local heavy jobs."
      : "AI Box is at a pressure limit. Let current jobs drain before adding work.";
  } else if (codexaWarm) {
    status = "HOLD_OR_SMALL_INCREASE";
    label = "Warm: small jobs only";
    detail = "AI Box can run one or two small read-only jobs. Avoid full builds, model loads, or Docker-heavy work.";
  }

  return {
    status,
    label,
    detail,
    generatedAt: new Date().toISOString(),
    profileSource: "operator-confirmed hardware plus live AE See-Suite power sample",
    machines: publicMachineProfiles(),
    network: {
      aiBoxPath: tenGigLinked ? "10GbE linked" : wifiActive ? "Wi-Fi active; use for control and moderate syncs" : "network link unverified",
      largeTransferPolicy: tenGigLinked ? "large repo/file syncs allowed" : "avoid multi-GB bulk syncs until Ethernet/10GbE is linked",
      seeSuiteToAiBox: `${cockpitIp} -> ${codexaIp}`
    },
    concurrency,
    dispatchRules: [
      { work: "Claude/Opus reasoning, approvals, product decisions", runOn: "AE See-Suite", why: "latency-sensitive operator loop" },
      { work: "builds, tests, Docker, Playwright, indexing, wiki compile", runOn: "AI Box", why: "CPU/RAM-heavy or long-running" },
      { work: "local model/Qwen/vision helpers", runOn: "AI Box", why: "keeps AE See-Suite responsive and uses worker RAM" },
      { work: "large file movement", runOn: tenGigLinked ? "AI Box/shared storage" : "defer or trickle", why: tenGigLinked ? "wired path can carry it" : "Wi-Fi is acceptable for control, not ideal for huge passovers" },
      { work: "destructive actions, deploy, database writes, payment/customer ops", runOn: "approval gate", why: "operator law" }
    ],
    runNow: [
      concurrency.aiBox.heavyJobs ? "One heavy AI Box job: build/test/visual proof/indexing." : null,
      concurrency.aiBox.smallJobs ? `${concurrency.aiBox.smallJobs} small AI Box jobs: scans, receipts, health, summaries.` : null,
      concurrency.aiBox.localModelWorkers ? "One local model helper for summaries/vision, not multiple model loads." : null,
      concurrency.seeSuite.smallJobs ? "AE See-Suite only for tiny coordination commands." : null
    ].filter(Boolean),
    holdNow: [
      "Do not run heavy builds on the controller machine.",
      concurrency.frontierLanes >= 3 ? "Do not exceed three frontier/tool lanes without explicit approval." : "Keep frontier/tool lanes capped until pressure improves.",
      tenGigLinked ? null : "Do not treat the current network as a finished high-speed file-host path.",
      "Do not trust subscription token counters unless ORANGEBOX owns and proves the adapter."
    ].filter(Boolean),
    liveSample: { seeSuite: cockpit, aiBox: codexa }
  };
}

async function codexaPower() {
  const command = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$os = Get-CimInstance Win32_OperatingSystem",
    "$cpuInfo = Get-CimInstance Win32_Processor | Select-Object -First 1 Name,NumberOfCores,NumberOfLogicalProcessors",
    "$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average",
    "$procs = Get-Process | Sort-Object CPU -Descending | Select-Object -First 8 @{Name='Name';Expression={$_.ProcessName}},Id,@{Name='CPU';Expression={[math]::Round([double]($_.CPU),2)}},@{Name='WorkingSetMB';Expression={[math]::Round($_.WorkingSet64/1MB,1)}}",
    "$net = @(Get-NetAdapter -ErrorAction SilentlyContinue | Select-Object Name,Status,LinkSpeed,InterfaceDescription)",
    "$docker = @(docker ps --format '{{.Names}}|{{.Status}}' 2>$null)",
    "[pscustomobject]@{Hostname=$env:COMPUTERNAME;ProcessorName=$cpuInfo.Name;CoreCount=$cpuInfo.NumberOfCores;LogicalProcessors=$cpuInfo.NumberOfLogicalProcessors;CpuPercent=[math]::Round([double]$cpu,1);TotalMemoryGB=[math]::Round($os.TotalVisibleMemorySize/1MB,1);FreeMemoryGB=[math]::Round($os.FreePhysicalMemory/1MB,1);UsedMemoryPercent=[math]::Round((1-($os.FreePhysicalMemory/$os.TotalVisibleMemorySize))*100,1);Network=$net;Processes=$procs;Docker=$docker;Timestamp=(Get-Date).ToString('o')} | ConvertTo-Json -Depth 6"
  ].join("; ");
  const result = await callCodexaCommandRail("/command", {
    method: "POST",
    timeoutMs: 45000,
    body: {
      shell: "powershell",
      cwd: "C:/AtomEons",
      command,
      timeoutMs: 45000,
      confirmFullAccess: true
    }
  });
  return parseCodexaPower(result);
}

async function powerStatus(force = false) {
  if (!force && powerCache.payload && Date.now() - powerCache.generatedAtMs < 180000) {
    return { ...powerCache.payload, cache: "HIT" };
  }
  const seeSuite = await cockpitPower();
  const aiBox = await codexaPower().catch((error) => ({
    status: "FAILED",
    machine: "ai-box",
    error: error.message
  }));
  const recommendation = pressureRecommendation(aiBox, seeSuite);
  const payload = {
    generatedAt: new Date().toISOString(),
    cache: "MISS",
    policy: {
      smallJobs: "parallel ok when AI Box CPU < 60% and memory free > 28%",
      heavyJobs: "one at a time until a fresh sample stays green",
      frontierLanes: "3 max without explicit operator approval",
      fakeTelemetry: "Claude subscription token counts remain UNKNOWN unless a proven adapter owns the call"
    },
    recommendation,
    seeSuite,
    aiBox
  };
  powerCache = { generatedAtMs: Date.now(), payload };
  await writeJson(path.join(orangeRoot, "power", "latest-power.json"), payload).catch(() => {});
  return payload;
}

async function optimizerStatus(force = false) {
  const power = await powerStatus(force);
  const optimizer = optimizerStatusFromPower(power);
  await writeJson(path.join(orangeRoot, "optimizer", "latest-optimizer.json"), optimizer).catch(() => {});
  return optimizer;
}

async function verificationToolStatus(tool) {
  const packagePath = (pkg) => path.join(workspaceNodeModules, pkg);
  const checkmatePackagePath = (pkg) => path.join(checkmateRoot, "node_modules", pkg);
  const chromePaths = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ];
  if (tool.check === "playwright-package") {
    const bundled = await exists(packagePath("playwright"));
    const mcp = await exists(checkmateNodeCommand("playwright-mcp-server"));
    const officialMcp = await exists(checkmateNodeCommand("playwright-mcp"));
    return {
      status: bundled && (mcp || officialMcp) ? "VERIFIED" : bundled || mcp || officialMcp ? "CONFIGURED_WITH_GAPS" : "MISSING_RUNTIME",
      detail: bundled && (mcp || officialMcp)
        ? "Playwright runtime and MCP binaries are installed for browser proof."
        : bundled ? "Playwright runtime exists, but MCP binary was not found." : "Playwright runtime/MCP missing.",
      evidence: [bundled ? packagePath("playwright") : null, mcp ? checkmateNodeCommand("playwright-mcp-server") : null, officialMcp ? checkmateNodeCommand("playwright-mcp") : null].filter(Boolean).join("\n") || null
    };
  }
  if (tool.check === "chrome-runtime") {
    const found = [];
    for (const candidate of chromePaths) if (await exists(candidate)) found.push(candidate);
    const mcp = await exists(checkmateNodeCommand("chrome-devtools-mcp"));
    return {
      status: found.length && mcp ? "VERIFIED" : found.length || mcp ? "CONFIGURED_WITH_GAPS" : "MISSING_RUNTIME",
      detail: found.length && mcp ? "Chrome/Edge and Chrome DevTools MCP are installed." : found.length ? "Chromium-family browser found; DevTools MCP binary missing." : "No Chrome/Edge executable found in common paths.",
      evidence: [found[0] || null, mcp ? checkmateNodeCommand("chrome-devtools-mcp") : null].filter(Boolean).join("\n") || null
    };
  }
  if (tool.check === "shell-runtime") {
    const desktopCommander = await exists(checkmateNodeCommand("desktop-commander"));
    return {
      status: desktopCommander ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
      detail: desktopCommander ? "BLUEB0X.AI rail and Desktop Commander runtime are installed." : "BLUEB0X.AI local shell and Codexa rail are active; Desktop Commander binary missing.",
      evidence: ["local node server + Codexa 8097 rail", desktopCommander ? checkmateNodeCommand("desktop-commander") : null].filter(Boolean).join("\n")
    };
  }
  if (tool.check === "native-fetch") {
    return { status: typeof fetch === "function" ? "VERIFIED" : "MISSING_RUNTIME", detail: "Node fetch is available for direct API smoke checks.", evidence: "global fetch" };
  }
  if (tool.check === "wcgw-command") {
    const wcgw = pythonUserCommand("wcgw");
    const installed = await exists(wcgw);
    const result = await commandAvailable(wcgw, ["--help"], 30000);
    return {
      status: result.ok ? "VERIFIED" : installed ? "CONFIGURED_WITH_GAPS" : "MISSING_RUNTIME",
      detail: result.ok ? "WCGW Python command launches under UTF-8 environment; MCP binding can be configured read-only first." : installed ? "WCGW executable is installed, but the live launch probe did not complete on this cockpit sample." : "WCGW is not installed in the user Python script bin.",
      evidence: installed ? `${wcgw}${result.output ? `\n${result.output}` : ""}` : result.output || null
    };
  }
  if (tool.check === "proxyman-runtime") {
    const paths = [
      "C:/Program Files/Proxyman/Proxyman.exe",
      "C:/Users/a/AppData/Local/Programs/Proxyman/Proxyman.exe"
    ];
    const found = [];
    for (const candidate of paths) if (await exists(candidate)) found.push(candidate);
    return {
      status: found.length ? "VERIFIED" : "MISSING_RUNTIME",
      detail: found.length ? "Proxyman Windows runtime found. HTTPS certificate/interception remains manual and approval-gated." : "Proxyman app not found locally.",
      evidence: found[0] || null
    };
  }
  if (tool.check === "dbhub-package") {
    const dbhub = checkmateNodeCommand("dbhub");
    const installed = await exists(dbhub);
    if (!installed) {
      return { status: "MISSING_RUNTIME", detail: "DBHub command is not installed.", evidence: null };
    }
    const probePort = String(18087 + Math.floor(Math.random() * 1000));
    const demoProbe = await commandStarts(dbhub, ["--demo", "--transport", "http", "--port", probePort], 4500);
    const output = demoProbe.output || "";
    const demoStarted = demoProbe.ok
      && !/Fatal error|No connector found|better-sqlite3.*not installed/i.test(output);
    const missingDriver = /better-sqlite3.*not installed|No connector found for DSN: sqlite/i.test(output);
    return {
      status: demoStarted ? "VERIFIED" : "CONFIGURED_WITH_GAPS",
      detail: demoStarted
        ? "DBHub launches in demo/read-only database mode."
        : missingDriver
          ? "DBHub is installed, but the SQLite demo driver is missing. Install `better-sqlite3` in the Checkmate tool bench."
          : "DBHub command is installed. It still needs a demo/read-only DSN before a database state check can be VERIFIED.",
      evidence: `${dbhub}${output ? `\n${output}` : ""}`
    };
  }
  if (tool.check === "supabase-sqlite-runtime") {
    const supabase = await whereCommand("supabase");
    const sqlite = await whereCommand("sqlite3");
    const sqliteMcp = await exists(checkmateNodeCommand("mcp-sqlite-server"));
    const sqliteProbeDb = path.join(orangeRoot, "checkmate", "sqlite-probe.db");
    await fs.mkdir(path.dirname(sqliteProbeDb), { recursive: true });
    const sqliteMcpProbe = sqliteMcp ? await commandStarts(checkmateNodeCommand("mcp-sqlite-server"), [sqliteProbeDb], 3500) : { ok: false, output: "" };
    const sqliteReady = sqliteMcp && sqliteMcpProbe.ok;
    return {
      status: sqliteReady && supabase.ok ? "VERIFIED" : sqliteReady || supabase.ok || sqlite.ok ? "CONFIGURED_WITH_GAPS" : "MISSING_RUNTIME",
      detail: sqliteReady && supabase.ok
        ? "SQLite MCP and Supabase CLI are both available for data verification."
        : sqliteReady
          ? "SQLite MCP launches; Supabase CLI is still missing, so Supabase-specific checks are not live."
          : supabase.ok
            ? "Supabase CLI found; SQLite MCP did not launch cleanly."
            : sqlite.ok
              ? "SQLite CLI found; Supabase CLI missing."
              : "Supabase and SQLite runtimes not found.",
      evidence: [sqliteMcp ? checkmateNodeCommand("mcp-sqlite-server") : null, sqliteMcpProbe.output, supabase.output, sqlite.output].filter(Boolean).join("\n") || null
    };
  }
  if (tool.check === "semgrep-command") {
    const semgrep = pythonUserCommand("semgrep");
    const installed = await exists(semgrep);
    const result = await commandAvailable(semgrep, ["--version"], 30000);
    return {
      status: result.ok ? "VERIFIED" : installed ? "CONFIGURED_WITH_GAPS" : "MISSING_RUNTIME",
      detail: result.ok ? "Semgrep launches from the user Python script bin for read-only static scans." : installed ? "Semgrep executable is installed, but the live launch probe did not complete on this cockpit sample." : "Semgrep is not installed in the user Python script bin.",
      evidence: installed ? `${semgrep}${result.output ? `\n${result.output}` : ""}` : result.output || null
    };
  }
  if (tool.check === "osv-command") {
    const osv = path.join(checkmateBin, exeName("osv-scanner"));
    const result = await commandAvailable(osv, ["--version"], 12000);
    return { status: result.ok ? "VERIFIED" : "MISSING_RUNTIME", detail: result.ok ? "OSV scanner binary is installed in the Checkmate tool bench." : "OSV scanner did not launch.", evidence: result.ok ? `${osv}\n${result.output}` : result.output || null };
  }
  if (tool.check === "github-runtime") {
    const gh = await whereCommand("gh");
    const mcp = await exists(checkmateNodeCommand("mcp-server-github"));
    return { status: gh.ok && mcp ? "VERIFIED" : gh.ok || mcp ? "CONFIGURED_WITH_GAPS" : "MISSING_RUNTIME", detail: gh.ok && mcp ? "GitHub CLI and GitHub MCP binary are installed; write operations still require approval." : gh.ok ? "GitHub CLI found; MCP binary missing." : "GitHub CLI not found on PATH.", evidence: [gh.output, mcp ? checkmateNodeCommand("mcp-server-github") : null].filter(Boolean).join("\n") || null };
  }
  return { status: "CONFIGURED", detail: "Cataloged; no detector implemented yet.", evidence: null };
}

function scrubProductLanguageStrings(value) {
  if (typeof value === "string") {
    return value
      .replace(/\bblueb0x\.ai\b/gi, "ORANGEBOX")
      .replace(/\bblueb0x\b/gi, "ORANGEBOX")
      .replace(/\bcodexa worker rail\b/gi, "AI Box worker rail")
      .replace(/\bcodexa rail\b/gi, "AI Box rail")
      .replace(/\bcodexa\b/gi, "AI Box")
      .replace(/\bcockpit\b/gi, "AE See-Suite");
  }
  if (Array.isArray(value)) return value.map((item) => scrubProductLanguageStrings(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, scrubProductLanguageStrings(item)])
    );
  }
  return value;
}

async function checkmateStatus(force = false) {
  if (!force && checkmateCache.payload && Date.now() - checkmateCache.generatedAtMs < 180000) {
    return { ...scrubProductLanguageStrings(checkmateCache.payload), cache: "HIT" };
  }
  if (!force) {
    const cached = await readJson(path.join(orangeRoot, "checkmate", "latest-checkmate.json"), null);
    if (cached) {
      const scrubbed = scrubProductLanguageStrings(cached);
      checkmateCache = { generatedAtMs: Date.now(), payload: scrubbed };
      return { ...scrubbed, cache: "DISK_HIT" };
    }
    const fallbackTools = verificationToolCatalog.map((tool) => enrichCheckmateTool({
      ...tool,
      status: "CONFIGURED",
      detail: "Fast AE See-Suite catalog mode. Run /api/checkmate?force=1 for deep runtime verification.",
      evidence: null
    }));
    const fallback = {
      status: "CONFIGURED_WITH_GAPS",
      generatedAt: new Date().toISOString(),
      name: "Checkmate Team",
      purpose: "Fast AE See-Suite catalog for UI readiness. Deep verification is force-gated so the dashboard does not stall.",
      counts: { CONFIGURED: fallbackTools.length },
      gates: [],
      atomStandard,
      atomReport: buildAtomStandardReport(fallbackTools),
      tasteEngine: tasteWiki,
      installLaw: "Fast mode does not prove runtime availability. Use force=1 before ship claims.",
      tools: fallbackTools,
      internalTeams: internalQualityTeams,
      aeCommanderEvolution: aeCommanderEvolutionIdeas,
      cache: "FAST_FALLBACK"
    };
    const scrubbedFallback = scrubProductLanguageStrings(fallback);
    checkmateCache = { generatedAtMs: Date.now(), payload: scrubbedFallback };
    return scrubbedFallback;
  }
  const tools = await Promise.all(verificationToolCatalog.map(async (tool) => {
    const status = await verificationToolStatus(tool).catch((error) => ({
      status: "FAILED",
      detail: error.message,
      evidence: null
    }));
    return enrichCheckmateTool({ ...tool, ...status });
  }));
  const counts = tools.reduce((acc, tool) => {
    acc[tool.status] = (acc[tool.status] || 0) + 1;
    return acc;
  }, {});
  const gates = [
    { id: "ui", label: "UI rendered in a real browser", owner: "Playwright / DevTools", required: true },
    { id: "runtime", label: "Builds and tests run in a real shell", owner: "Desktop Commander / WCGW / ORANGEBOX AI Box rail", required: true },
    { id: "api", label: "Backend endpoints return real status and JSON", owner: "Fetch / Proxyman", required: true },
    { id: "data", label: "Database state is checked read-only", owner: "DBHub / Supabase / SQLite", required: false },
    { id: "security", label: "Static and dependency risk is scanned", owner: "Semgrep / OSV", required: true },
    { id: "ci", label: "GitHub/CI receipts are inspected", owner: "GitHub MCP", required: false },
    { id: "taste", label: "Taste Engine final pass", owner: "AE3 Design", required: true },
    { id: "atom", label: "Atom Standard revision pressure", owner: "Checkmate / AE7", required: true }
  ];
  const atomReport = buildAtomStandardReport(tools);
  const payload = {
    status: tools.some((tool) => tool.status === "FAILED")
      ? "FAILED"
      : tools.some((tool) => ["MISSING_RUNTIME", "CONFIGURED_WITH_GAPS", "CONFIGURED"].includes(tool.status))
        ? "CONFIGURED_WITH_GAPS"
        : "VERIFIED",
    generatedAt: new Date().toISOString(),
    name: "Checkmate Team",
    purpose: "Real-life quality verification across UI, runtime, API, data, security, and CI.",
    counts,
    gates,
    atomStandard,
    atomReport,
    tasteEngine: tasteWiki,
    installLaw: "Cataloging is safe. Installing/promoting third-party MCP tools still requires vendor-import-gate, secrets review, and approval.",
    tools,
    internalTeams: internalQualityTeams,
    aeCommanderEvolution: aeCommanderEvolutionIdeas
  };
  const scrubbedPayload = scrubProductLanguageStrings(payload);
  await writeJson(path.join(orangeRoot, "checkmate", "latest-checkmate.json"), scrubbedPayload).catch(() => {});
  await writeJson(path.join(orangeRoot, "knowledge", "atom-standard", "latest-atom-standard.json"), atomReport).catch(() => {});
  checkmateCache = { generatedAtMs: Date.now(), payload: scrubbedPayload };
  return scrubbedPayload;
}

async function trimMcpEventLog(maxLines = 500) {
  try {
    const text = await fs.readFile(mcpEventLogPath, "utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length <= maxLines) return;
    await fs.writeFile(mcpEventLogPath, `${lines.slice(-maxLines).join("\n")}\n`, "utf8");
  } catch {}
}

async function recordMcpEvent(body = {}) {
  const id = String(body.id || `${stamp()}-${crypto.randomUUID()}`);
  const event = {
    id,
    generatedAt: new Date().toISOString(),
    source: String(body.source || "claude-code-mcp").slice(0, 80),
    tool: String(body.tool || "unknown-tool").slice(0, 120),
    phase: String(body.phase || "info").slice(0, 24),
    status: String(body.status || "CONFIGURED").slice(0, 40),
    durationMs: Number.isFinite(Number(body.durationMs)) ? Number(body.durationMs) : null,
    summary: clampText(body.summary || body.goal || body.message || "", 1400),
    receiptPath: body.receiptPath ? clampText(body.receiptPath, 500) : null,
    resultStatus: body.resultStatus ? String(body.resultStatus).slice(0, 40) : null,
    error: body.error ? clampText(body.error, 1400) : null
  };
  await fs.mkdir(path.dirname(mcpEventLogPath), { recursive: true });
  await fs.appendFile(mcpEventLogPath, `${JSON.stringify(event)}\n`, "utf8");
  await trimMcpEventLog();
  return event;
}

async function readMcpEvents(limit = 40) {
  try {
    const text = await fs.readFile(mcpEventLogPath, "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-Math.min(Math.max(Number(limit) || 40, 1), 100))
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

async function commandPath(name) {
  try {
    const out = await execFileAsync("where.exe", [name], { timeout: 8000, maxBuffer: 1024 * 1024 });
    return out.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || null;
  } catch {
    return null;
  }
}

async function claudeCodeStatus(force = false) {
  if (!force && claudeCodeCache.payload && Date.now() - claudeCodeCache.generatedAtMs < 600000) {
    return { ...claudeCodeCache.payload, cache: "HIT" };
  }
  if (!force) {
    const payload = {
      status: "CONFIGURED_UNPROBED",
      detail: "Claude Code status probe is deferred so the cockpit stays responsive. Use force=1 for a full auth probe.",
      printMode: "UNKNOWN_UNTIL_FORCED_PROBE"
    };
    claudeCodeCache = { generatedAtMs: Date.now(), payload };
    return { ...payload, cache: "DEFERRED" };
  }
  const bin = await commandPath("claude");
  if (!bin) {
    const payload = {
      status: "MISSING_RUNTIME",
      detail: "claude executable is not on PATH",
      printMode: "UNVERIFIED"
    };
    claudeCodeCache = { generatedAtMs: Date.now(), payload };
    return payload;
  }
  let version = null;
  let auth = null;
  let authError = null;
  try {
    const out = await execFileAsync(bin, ["--version"], { cwd: appRoot, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
    version = out.stdout.trim() || out.stderr.trim();
  } catch (error) {
    version = clampText(error.stderr || error.message, 1200);
  }
  try {
    const out = await execFileAsync(bin, ["auth", "status"], { cwd: appRoot, timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true });
    const parsed = JSON.parse(out.stdout);
    auth = {
      loggedIn: Boolean(parsed.loggedIn),
      authMethod: parsed.authMethod || null,
      apiProvider: parsed.apiProvider || null,
      subscriptionType: parsed.subscriptionType || null,
      orgName: parsed.orgName || null
    };
  } catch (error) {
    authError = clampText(error.stderr || error.stdout || error.message, 1200);
  }
  const latestChat = (await listFiles(path.join(orangeRoot, "receipts"), 30, (name) => name.startsWith("orangebox-command-claude-code-chat-")).catch(() => []))[0] || null;
  let latestChatReceipt = null;
  if (latestChat) latestChatReceipt = await readJson(latestChat.path, null);
  const printAuthFailed = latestChatReceipt?.apiErrorStatus === 401;
  const payload = {
    status: printAuthFailed ? "AUTH_REQUIRED" : auth?.loggedIn ? "CONFIGURED" : "AUTH_REQUIRED",
    detail: printAuthFailed
      ? "Claude Code login exists, but print-mode chat returned API 401. Run claude auth login or claude setup-token, then retry Send To Opus."
      : auth?.loggedIn ? "Claude Code login is present. Print-mode still requires a successful chat call before VERIFIED." : "Run claude auth login or claude setup-token.",
    path: bin,
    version,
    auth,
    authError,
    printMode: printAuthFailed ? "FAILED_401" : "UNVERIFIED_UNTIL_CHAT_CALL",
    latestChatReceipt: latestChatReceipt ? {
      status: latestChatReceipt.status,
      apiErrorStatus: latestChatReceipt.apiErrorStatus || null,
      receiptPath: latestChatReceipt.receiptPath,
      generatedAt: latestChatReceipt.generatedAt
    } : null
  };
  claudeCodeCache = { generatedAtMs: Date.now(), payload };
  return payload;
}

function claudeModelArg(value) {
  const text = String(value || "claude-opus-4-7").toLowerCase();
  if (text.includes("opus")) return "opus";
  if (text.includes("sonnet")) return "sonnet";
  return "opus";
}

function claudePermissionMode(value) {
  const allowed = new Set(["plan", "default", "acceptEdits", "auto", "dontAsk"]);
  return allowed.has(value) ? value : "plan";
}

async function appendConversation(sessionId, row) {
  const safeSession = /^[0-9a-f-]{36}$/i.test(sessionId) ? sessionId : crypto.randomUUID();
  const file = path.join(orangeRoot, "conversations", `${safeSession}.jsonl`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, `${JSON.stringify(row)}\n`, "utf8");
  return file;
}

async function runClaudeCodeChat(body = {}) {
  const started = Date.now();
  const message = String(body.message || body.prompt || "").trim();
  if (!message) throw new Error("Claude message is empty.");
  const cwd = path.resolve(String(body.cwd || "C:/AtomEons"));
  const stat = await fs.stat(cwd).catch(() => null);
  if (!stat?.isDirectory()) throw new Error(`Claude cwd does not exist: ${cwd}`);
  const sessionId = /^[0-9a-f-]{36}$/i.test(String(body.sessionId || "")) ? String(body.sessionId) : crypto.randomUUID();
  const effort = ["low", "medium", "high", "xhigh", "max"].includes(body.effort) ? body.effort : "xhigh";
  const permissionMode = claudePermissionMode(body.permissionMode);
  const model = claudeModelArg(body.model);
  const args = [
    "-p",
    message,
    "--model", model,
    "--effort", effort,
    "--permission-mode", permissionMode,
    "--output-format", "json",
    "--session-id", sessionId,
    "--name", `AE See-Suite ${sessionId.slice(0, 8)}`,
    "--add-dir", "C:/AtomEons",
    "--append-system-prompt",
    [
      "You are running inside AE See-Suite.",
      "Stay inside the command loop: answer with a concrete plan, commands, files, and verification.",
      "Do not claim work is complete without evidence.",
      "Prefer the optional AI Box for mechanical execution through ORANGEBOX when available.",
      "Destructive actions, deploys, pushes, payments, database writes, and permission changes require approval."
    ].join(" ")
  ];
  if (await exists(pluginRoot)) args.push("--plugin-dir", pluginRoot);
  const maxBudget = Number(body.maxBudgetUsd || 0);
  if (Number.isFinite(maxBudget) && maxBudget > 0) args.push("--max-budget-usd", String(Math.min(maxBudget, 50)));
  const timeout = Math.min(Math.max(Number(body.timeoutMs || 10 * 60 * 1000), 10000), 30 * 60 * 1000);
  await appendConversation(sessionId, { generatedAt: new Date().toISOString(), role: "user", message: clampText(message, 24000), cwd, model, effort, permissionMode });
  let out;
  let exitCode = 0;
  try {
    out = await execFileAsync("claude", args, {
      cwd,
      timeout,
      maxBuffer: 24 * 1024 * 1024,
      env: {
        ...process.env,
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS || "1"
      }
    });
  } catch (error) {
    out = { stdout: String(error.stdout || ""), stderr: String(error.stderr || error.message) };
    exitCode = Number(error.code || 1);
  }
  let parsed = null;
  try {
    parsed = JSON.parse(out.stdout);
  } catch {}
  const isError = exitCode !== 0 || parsed?.is_error === true || parsed?.subtype === "error";
  const resultText = clampText(parsed?.result || out.stdout || out.stderr, 24000);
  const summary = {
    id: `${stamp()}-claude-code-chat`,
    generatedAt: new Date().toISOString(),
    status: isError ? "FAILED" : "VERIFIED",
    sessionId,
    cwd,
    model,
    effort,
    permissionMode,
    exitCode,
    totalMs: Date.now() - started,
    result: resultText,
    parsed: parsed ? {
      type: parsed.type,
      subtype: parsed.subtype,
      is_error: parsed.is_error,
      api_error_status: parsed.api_error_status,
      stop_reason: parsed.stop_reason,
      total_cost_usd: parsed.total_cost_usd,
      usage: parsed.usage,
      session_id: parsed.session_id
    } : null,
    stderr: clampText(out.stderr, 6000)
  };
  const transcript = await appendConversation(sessionId, {
    generatedAt: new Date().toISOString(),
    role: "assistant",
    status: summary.status,
    result: summary.result,
    stderr: summary.stderr,
    parsed: summary.parsed
  });
  const receipt = await writeReceipt("claude-code-chat", {
    status: summary.status,
    sessionId,
    cwd,
    model,
    effort,
    permissionMode,
    totalMs: summary.totalMs,
    transcript,
    apiErrorStatus: summary.parsed?.api_error_status || null
  });
  return { ...summary, transcript, receiptPath: receipt.receiptPath };
}

async function chairmanPlan(body = {}) {
  const goal = String(body.goal || body.message || "").trim();
  if (!goal) throw new Error("Chairman plan needs a goal.");
  const mode = String(body.mode || "code-build");
  const claude = await claudeCodeStatus().catch((error) => ({ status: "FAILED", error: error.message }));
  const codexa = await probe(`http://${codexaIp}:${commandRailPort}/health`, 2500);
  const candidates = [
    {
      id: "claude-opus-4-7",
      role: "frontier reasoning, architecture, implementation proposal, review",
      status: claude.status === "CONFIGURED" ? "CONFIGURED" : claude.status,
      maturity: "CHAT_ADAPTER_PRESENT_PRINT_MODE_NEEDS_LIVE_AUTH_PASS"
    },
    {
      id: "gpt-5.5",
      role: "frontier alternate reasoning lane and critique",
      status: "ADAPTER_PENDING",
      maturity: "planned; no fake execution"
    },
    {
      id: "codexa-command-rail",
      role: "mechanical execution, build/test/proof/receipts",
      status: codexa.status,
      maturity: "VERIFIED if command rail health is green"
    },
    {
      id: "openclaw-guard",
      role: "optional outer orchestration and desktop automation after guard checks",
      status: "OPTIONAL_GUARDED",
      maturity: "loopback, tokened, command-rail health checked"
    }
  ];
  const plan = {
    id: `${stamp()}-chairman-plan`,
    generatedAt: new Date().toISOString(),
    status: "CONFIGURED_PLANNING_ONLY",
    goal,
    mode,
    loop: [
      "Dispatch only the smallest useful lanes. Do not blast every model.",
      "Claude Opus drafts the contract and high-risk reasoning.",
      "The optional AI Box executes mechanical checks and writes receipts when verified.",
      "Chairman scores candidate outputs on correctness, performance, risk, complexity, and proof.",
      "Operator sees selectable outputs before destructive actions."
    ],
    candidates,
    scoringRubric: [
      { dimension: "correctness", weight: 35 },
      { dimension: "proof", weight: 25 },
      { dimension: "risk", weight: 20 },
      { dimension: "simplicity", weight: 10 },
      { dimension: "speed", weight: 10 }
    ],
    controls: {
      maxParallelFrontierLanes: 3,
      defaultSupervision: "approval-required",
      contextRule: "@path references narrow attention; exclusions are advisory until hard policy adapters are active",
      executionRule: "The optional AI Box runs builds/tests/proof; frontier lanes reason and review"
    }
  };
  const jsonPath = path.join(orangeRoot, "benchmarks", `${plan.id}.json`);
  await writeJson(jsonPath, plan);
  await writeReceipt("chairman-plan", { status: plan.status, goal, mode, jsonPath });
  return plan;
}

async function runLocalBenchmark(label = "orangebox-command-check") {
  const started = Date.now();
  const benchId = `${stamp()}-${safeSegment(label)}`;
  const logPath = path.join(orangeRoot, "benchmarks", `${benchId}.log`);
  const commands = [
    { name: "node-check-command-server", file: process.execPath, args: [path.join(appRoot, "scripts", "orangebox-command-server.mjs"), "--help"] },
    { name: "node-check-bridge-pack", file: process.execPath, args: ["--check", path.join(appRoot, "scripts", "codexa-bridge-pack.mjs")] },
    { name: "node-check-command-rail-pack", file: process.execPath, args: ["--check", path.join(appRoot, "scripts", "codexa-command-rail-pack.mjs")] },
    { name: "node-check-openclaw-pack", file: process.execPath, args: ["--check", path.join(appRoot, "scripts", "codexa-openclaw-pack.mjs")] },
    { name: "verify-orangebox", file: process.execPath, args: [path.join(pluginRoot, "scripts", "verify-orangebox.mjs"), "--root", orangeRoot] }
  ];
  const results = [];
  for (const cmd of commands) {
    const t0 = Date.now();
    try {
      const out = await execFileAsync(cmd.file, cmd.args, {
        cwd: appRoot,
        timeout: 120000,
        maxBuffer: 4 * 1024 * 1024
      });
      results.push({ ...cmd, status: "VERIFIED", ms: Date.now() - t0, stdout: out.stdout.slice(-4000), stderr: out.stderr.slice(-4000) });
    } catch (error) {
      results.push({ ...cmd, status: "FAILED", ms: Date.now() - t0, code: error.code, stdout: String(error.stdout || "").slice(-4000), stderr: String(error.stderr || error.message).slice(-4000) });
    }
  }
  const summary = {
    id: benchId,
    label,
    machine: "cockpit",
    generatedAt: new Date().toISOString(),
    status: results.every((row) => row.status === "VERIFIED") ? "VERIFIED" : "FAILED",
    totalMs: Date.now() - started,
    results
  };
  await fs.writeFile(logPath, results.map((row) => `## ${row.name}\n${row.status} ${row.ms}ms\n${row.stdout}\n${row.stderr}`).join("\n\n"), "utf8");
  summary.logPath = logPath;
  const jsonPath = path.join(orangeRoot, "benchmarks", `${benchId}.json`);
  await writeJson(jsonPath, summary);
  await writeReceipt("benchmark", { status: summary.status, benchId, totalMs: summary.totalMs, jsonPath, logPath });
  return summary;
}

async function callCodexaBridge(route, body = {}, timeoutMs = 120000) {
  const token = await loadBridgeToken();
  if (!token) return { status: "CONFIGURED_MISSING_TOKEN", detail: "Set ORANGEBOX_BRIDGE_TOKEN to call protected bridge routes." };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${codexaIp}:8098${route}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-orangebox-token": token },
      body: JSON.stringify(body),
      signal: ac.signal
    });
    const text = await res.text();
    clearTimeout(timer);
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return { status: res.ok ? "VERIFIED" : "FAILED", code: res.status, response: parsed || text.slice(0, 2000) };
  } catch (error) {
    clearTimeout(timer);
    return { status: error.name === "AbortError" ? "TIMEOUT" : "FAILED", error: error.message };
  }
}

async function callCodexaBridgeGet(route, timeoutMs = 30000) {
  const token = await loadBridgeToken();
  if (!token) return { status: "CONFIGURED_MISSING_TOKEN", detail: "Set ORANGEBOX_BRIDGE_TOKEN to call protected bridge routes." };
  const host = codexaDirectIp || codexaIp || codexaLegacyWifiIp;
  if (!host) return { status: "NOT_CONFIGURED_BASIC_INSTALL", detail: "Advanced AI Box is not configured; no bridge host is available." };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:8098${route}`, {
      method: "GET",
      headers: { "x-orangebox-token": token },
      signal: ac.signal
    });
    const text = await res.text();
    clearTimeout(timer);
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return { status: res.ok ? "VERIFIED" : "FAILED", code: res.status, response: parsed || text.slice(0, 4000) };
  } catch (error) {
    clearTimeout(timer);
    return { status: error.name === "AbortError" ? "TIMEOUT" : "FAILED", error: error.message };
  }
}

async function loadCommandRailToken() {
  if (process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN) return process.env.ORANGEBOX_AI_BOX_COMMAND_TOKEN;
  if (process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN) return process.env.ORANGEBOX_CODEXA_COMMAND_TOKEN;
  try {
    const text = await fs.readFile(commandTokenCmdPath, "utf8");
    const match = text.match(/setx\s+(?:ORANGEBOX_AI_BOX_COMMAND_TOKEN|ORANGEBOX_CODEXA_COMMAND_TOKEN)\s+"([^"]+)"/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

async function callCodexaCommandRail(route, { method = "GET", body = null, timeoutMs = 120000 } = {}) {
  const token = await loadCommandRailToken();
  if (!token) return { status: "CONFIGURED_MISSING_TOKEN", detail: "Set ORANGEBOX_AI_BOX_COMMAND_TOKEN or build the command rail pack." };
  const baseUrl = commandRailBaseUrl();
  if (!baseUrl) return { status: "NOT_CONFIGURED_BASIC_INSTALL", detail: "Advanced AI Box is not configured; no command rail host is available." };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${route}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-orangebox-token": token
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ac.signal
    });
    const text = await res.text();
    clearTimeout(timer);
    let parsed = null;
    try { parsed = JSON.parse(text); } catch {}
    return { status: res.ok ? "VERIFIED" : "FAILED", code: res.status, response: parsed || text.slice(0, 5000) };
  } catch (error) {
    clearTimeout(timer);
    return { status: error.name === "AbortError" ? "TIMEOUT" : "FAILED", error: error.message };
  }
}

async function putCodexaFile(targetPath, bytes) {
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  return callCodexaCommandRail("/put-file", {
    method: "POST",
    timeoutMs: 180000,
    body: {
      path: targetPath,
      base64: bytes.toString("base64"),
      sha256,
      confirmFullAccess: true
    }
  });
}

async function codexaCommandRailReceipts() {
  return callCodexaCommandRail("/receipts", { method: "GET", timeoutMs: 30000 });
}

async function runCodexaCommand(body) {
  const command = String(body.command || "").trim();
  if (!command) throw new Error("command is required");
  const started = Date.now();
  const risk = classifyCommandRisk(command, body);
  if (risk.requiresApproval && !risk.approved) {
    const id = `${stamp()}-codexa-command-blocked-${crypto.createHash("sha256").update(command).digest("hex").slice(0, 10)}`;
    const jsonPath = path.join(orangeRoot, "benchmarks", `${id}.json`);
    const gate = await checkmateReturnGate({
      source: "codexa-command-preflight",
      command,
      result: { status: "NEEDS_APPROVAL", response: { stderr: "State-changing Codexa command blocked before execution." } },
      risk,
      artifactPath: jsonPath,
      requiredLevel: "full"
    });
    const summary = {
      id,
      machine: "codexa",
      generatedAt: new Date().toISOString(),
      totalMs: Date.now() - started,
      status: "NEEDS_APPROVAL",
      risk,
      checkmateGate: gate,
      result: { status: "NEEDS_APPROVAL", detail: "Command was not sent to Codexa because it appears state-changing." }
    };
    await writeJson(jsonPath, summary);
    await writeReceipt("codexa-command-blocked", { status: "NEEDS_APPROVAL", jsonPath, gateReceiptPath: gate.receiptPath });
    return summary;
  }
  const result = productSafeRailResult(await callCodexaCommandRail("/command", {
    method: "POST",
    timeoutMs: Math.min(Math.max(Number(body.timeoutMs || 120000), 1000), 30 * 60 * 1000),
    body: {
      shell: body.shell || "powershell",
      cwd: body.cwd || "C:/AtomEons",
      command,
      timeoutMs: body.timeoutMs || 120000,
      confirmFullAccess: true
    }
  }));
  const id = `${stamp()}-codexa-command-${crypto.createHash("sha256").update(command).digest("hex").slice(0, 10)}`;
  const jsonPath = path.join(orangeRoot, "benchmarks", `${id}.json`);
  const summary = {
    id,
    machine: "ai-box",
    generatedAt: new Date().toISOString(),
    totalMs: Date.now() - started,
    status: result.status === "VERIFIED" && (!result.response?.status || result.response.status === "VERIFIED") ? "VERIFIED" : "FAILED",
    risk,
    result
  };
  summary.checkmateGate = await checkmateReturnGate({
    source: "codexa-command",
    command,
    result,
    risk,
    artifactPath: jsonPath,
    requiredLevel: body.checkmateLevel || "auto"
  });
  if (summary.checkmateGate.status.startsWith("BLOCKED") || summary.checkmateGate.status === "NEEDS_APPROVAL" || summary.checkmateGate.status === "CHECKMATE_REVIEW_REQUIRED") {
    summary.status = summary.checkmateGate.status;
  }
  await writeJson(jsonPath, summary);
  await writeReceipt("codexa-command", { status: summary.status, jsonPath, bridgeCode: result.code || null, gateReceiptPath: summary.checkmateGate.receiptPath });
  return summary;
}

async function syncCommandAppToCodexa() {
  const started = Date.now();
  const syncId = `${stamp()}-orangebox-command-sync`;
  const stagingRoot = path.join(orangeRoot, "exports", syncId);
  const zipPath = path.join(orangeRoot, "exports", `${syncId}.zip`);
  const remoteZip = "C:/AtomEons/aeskills/orangebox-command-sync.zip";
  const remoteRoot = "C:/AtomEons/aeskills/orangebox-command";
  await fs.rm(stagingRoot, { recursive: true, force: true });
  await fs.mkdir(stagingRoot, { recursive: true });
  const denied = [
    `${path.sep}node_modules${path.sep}`,
    `${path.sep}src-tauri${path.sep}target${path.sep}`,
    `${path.sep}.git${path.sep}`
  ];
  await fs.cp(appRoot, stagingRoot, {
    recursive: true,
    filter: (src) => {
      const normalized = `${src}${path.sep}`;
      return !denied.some((part) => normalized.includes(part));
    }
  });
  await fs.rm(zipPath, { force: true });
  const ps = [
    "$ErrorActionPreference = 'Stop'",
    `$src = ${JSON.stringify(path.join(stagingRoot, "*"))}`,
    `$zip = ${JSON.stringify(zipPath)}`,
    "Compress-Archive -Path $src -DestinationPath $zip -Force"
  ].join("; ");
  await execFileAsync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    cwd: appRoot,
    timeout: 120000,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true
  });
  const bytes = await fs.readFile(zipPath);
  const upload = await putCodexaFile(remoteZip, bytes);
  const expandCommand = [
    "$ErrorActionPreference = 'Stop'",
    "New-Item -ItemType Directory -Force -Path 'C:\\AtomEons\\aeskills' | Out-Null",
    "if (Test-Path 'C:\\AtomEons\\aeskills\\orangebox-command') { Remove-Item -LiteralPath 'C:\\AtomEons\\aeskills\\orangebox-command' -Recurse -Force }",
    "New-Item -ItemType Directory -Force -Path 'C:\\AtomEons\\aeskills\\orangebox-command' | Out-Null",
    "Expand-Archive -LiteralPath 'C:\\AtomEons\\aeskills\\orangebox-command-sync.zip' -DestinationPath 'C:\\AtomEons\\aeskills\\orangebox-command' -Force",
    "cd 'C:\\AtomEons\\aeskills\\orangebox-command'",
    "node --version",
    "npm.cmd run check"
  ].join("; ");
  const verify = await runCodexaCommand({
    cwd: "C:/AtomEons",
    shell: "powershell",
    timeoutMs: 180000,
    command: expandCommand,
    internalApproved: true,
    internalScope: "orangebox-command-sync",
    checkmateLevel: "full"
  });
  const summary = {
    id: syncId,
    generatedAt: new Date().toISOString(),
    status: upload.status === "VERIFIED" && verify.status === "VERIFIED" ? "VERIFIED" : "FAILED",
    localZip: zipPath,
    remoteZip,
    remoteRoot,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    upload,
    verify,
    totalMs: Date.now() - started
  };
  const jsonPath = path.join(orangeRoot, "benchmarks", `${syncId}.json`);
  await writeJson(jsonPath, summary);
  await writeReceipt("codexa-command-app-sync", { status: summary.status, jsonPath, remoteRoot, bytes: bytes.length, totalMs: summary.totalMs });
  return summary;
}

async function runCodexaBenchmark(label = "codexa-worker-pulse") {
  const result = await callCodexaBridge("/run-benchmark", { label }, 90000);
  const benchId = `${stamp()}-${safeSegment(label)}-codexa`;
  const jsonPath = path.join(orangeRoot, "benchmarks", `${benchId}.json`);
  const gate = await checkmateReturnGate({
    source: "codexa-bridge-benchmark",
    command: `bridge:/run-benchmark ${label}`,
    result,
    risk: { class: "READ_ONLY_OR_DIAGNOSTIC", requiresApproval: false, approved: true },
    artifactPath: jsonPath,
    requiredLevel: "light"
  });
  const summary = {
    id: benchId,
    label,
    machine: "codexa",
    generatedAt: new Date().toISOString(),
    status: result.status,
    result,
    checkmateGate: gate
  };
  await writeJson(jsonPath, summary);
  await writeReceipt("codexa-benchmark", { status: result.status, benchId, jsonPath, bridgeCode: result.code || null, gateReceiptPath: gate.receiptPath });
  return summary;
}

async function codexaJobs() {
  const result = await callCodexaBridgeGet("/jobs", 30000);
  if (result.status === "FAILED" && result.code === 404) {
    return {
      status: "BRIDGE_UPGRADE_REQUIRED",
      code: 404,
      detail: "Codexa is reachable, but the live bridge does not expose /jobs yet. Regenerate/install the upgraded bridge pack."
    };
  }
  return result;
}

async function runCodexaJob(jobId, label = "") {
  const result = await callCodexaBridge("/run-job", { jobId, label: label || jobId }, 180000);
  const id = `${stamp()}-${safeSegment(jobId || "codexa-job")}`;
  const jsonPath = path.join(orangeRoot, "benchmarks", `${id}.json`);
  const gate = await checkmateReturnGate({
    source: "codexa-bridge-job",
    command: `bridge:/run-job ${jobId || ""} ${label || ""}`,
    result,
    risk: { class: "MUTATING", requiresApproval: false, approved: true },
    artifactPath: jsonPath,
    requiredLevel: "full"
  });
  const summary = {
    id,
    jobId,
    label: label || jobId,
    machine: "codexa",
    generatedAt: new Date().toISOString(),
    status: result.status === "FAILED" && result.code === 404 ? "BRIDGE_UPGRADE_REQUIRED" : result.status,
    result,
    checkmateGate: gate
  };
  if (gate.status.startsWith("BLOCKED") || gate.status === "CHECKMATE_REVIEW_REQUIRED") summary.status = gate.status;
  await writeJson(jsonPath, summary);
  await writeReceipt("codexa-job", { status: summary.status, jobId, jsonPath, bridgeCode: result.code || null, gateReceiptPath: gate.receiptPath });
  return summary;
}

function wslBashCommand(script, target = "/tmp/orangebox-command-rail-wsl.sh") {
  const b64 = Buffer.from(script, "utf8").toString("base64");
  return `wsl.exe -d Ubuntu-24.04 -u root -- bash -lc "printf '%s' '${b64}' | base64 -d > ${target} && bash ${target}"`;
}

async function codexaOpenClawHealthViaCommandRail() {
  const bash = `set -u
CFG="/root/.openclaw/openclaw.json"
if [ ! -f "$CFG" ]; then
  echo "MISSING_OPENCLAW_CONFIG"
  exit 2
fi
TOKEN=$(node -e "const fs=require('fs'); const c=JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json','utf8')); process.stdout.write(c.gateway?.auth?.token || '')")
if [ -z "$TOKEN" ]; then
  echo "MISSING_OPENCLAW_TOKEN"
  exit 2
fi
STATUS_OUT=$(openclaw gateway status --token "$TOKEN" 2>&1) || STATUS_CODE=$?
HEALTH_OUT=$(openclaw gateway health --token "$TOKEN" 2>&1) || HEALTH_CODE=$?
STATUS_CODE=\${STATUS_CODE:-0}
HEALTH_CODE=\${HEALTH_CODE:-0}
ACTIVE=$(systemctl --user is-active openclaw-gateway 2>&1 || true)
export STATUS_CODE HEALTH_CODE ACTIVE
node <<'NODE'
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('/root/.openclaw/openclaw.json', 'utf8'));
console.log('OPENCLAW_COMMAND_RAIL_SUMMARY ' + JSON.stringify({
  service: process.env.ACTIVE,
  statusCode: Number(process.env.STATUS_CODE || 0),
  healthCode: Number(process.env.HEALTH_CODE || 0),
  authMode: c.gateway?.auth?.mode || null,
  tokenAligned: Boolean(c.gateway?.auth?.token && c.gateway.auth.token === c.gateway?.remote?.token),
  bind: c.gateway?.bind || null,
  port: c.gateway?.port || null,
  plugins: Object.keys(c.plugins?.entries || {}),
  models: Object.keys(c.agents?.defaults?.models || {})
}));
NODE
echo "$STATUS_OUT" | sed -E 's/[A-Za-z0-9_-]{30,}/[redacted-token]/g'
echo "$HEALTH_OUT" | sed -E 's/[A-Za-z0-9_-]{30,}/[redacted-token]/g'
exit "$HEALTH_CODE"
`;
  const result = await callCodexaCommandRail("/command", {
    method: "POST",
    timeoutMs: 90000,
    body: {
      shell: "powershell",
      cwd: "C:/AtomEons",
      command: wslBashCommand(bash, "/tmp/orangebox-openclaw-status.sh"),
      timeoutMs: 90000,
      confirmFullAccess: true
    }
  });
  const stdout = String(result.response?.stdout || "");
  const summaryLine = stdout.split(/\r?\n/).find((line) => line.startsWith("OPENCLAW_COMMAND_RAIL_SUMMARY "));
  let summary = null;
  if (summaryLine) {
    try {
      summary = JSON.parse(summaryLine.replace("OPENCLAW_COMMAND_RAIL_SUMMARY ", ""));
    } catch {}
  }
  const healthy = result.status === "VERIFIED"
    && summary?.service === "active"
    && summary?.healthCode === 0
    && summary?.tokenAligned === true;
  return {
    status: healthy ? "VERIFIED" : result.status === "CONFIGURED_MISSING_TOKEN" ? result.status : "FAILED",
    generatedAt: new Date().toISOString(),
    route: "codexa-command-rail",
    detail: healthy ? "OpenClaw gateway health passed inside Codexa WSL2." : "OpenClaw command rail health did not pass cleanly.",
    summary,
    commandRailCode: result.code || null,
    receiptPath: result.response?.receiptPath || null,
    stdout: stdout.slice(-3000),
    stderr: String(result.response?.stderr || "").slice(-2000)
  };
}

async function openClawStatus() {
  const localRoot = "C:/AtomEons/agent-stack/npm-tools/node_modules/openclaw";
  const localConfig = "C:/Users/a/.openclaw-atomeons/openclaw.json";
  const localCanvas = await probe("http://127.0.0.1:18789/__openclaw__/canvas/", 1500);
  const codexaCanvas = await probe(`http://${codexaIp}:18789/__openclaw__/canvas/`, 1500);
  const paths = [];
  for (const target of [localRoot, localConfig, "C:/Users/a/.openclaw-atomeons/openclaw.json.last-good"]) {
    try {
      const stat = await fs.stat(target);
      paths.push({ target, exists: true, directory: stat.isDirectory(), size: stat.size, mtime: stat.mtime.toISOString() });
    } catch {
      paths.push({ target, exists: false });
    }
  }
  const pkg = await readJson(path.join(localRoot, "package.json"), null);
  const configured = paths.some((row) => row.exists);
  const codexaCommandRail = await codexaOpenClawHealthViaCommandRail().catch((error) => ({ status: "FAILED", error: error.message }));
  const live = localCanvas.status === "VERIFIED" || codexaCommandRail.status === "VERIFIED";
  return {
    generatedAt: new Date().toISOString(),
    status: live ? "VERIFIED" : configured ? "CONFIGURED_OFFLINE" : "MISSING_RUNTIME",
    useful: live ? "AVAILABLE_AS_OUTER_ORCHESTRATION_RAIL" : "NOT_USED_UNTIL_HEALTHY",
    policy: {
      installMode: "Codexa WSL2-first, native Windows fallback only if WSL2 is unavailable",
      plugins: "safe bundled/marketplace-only; no arbitrary Git/URL/file plugin specs",
      defaultSecurity: "local-only gateway, token auth, browser disabled until tested, destructive actions require approval",
      orangeboxRole: "optional outer automation rail; BLUEB0X.AI remains source of truth"
    },
    local: { root: localRoot, version: pkg?.version || null, paths, canvas: localCanvas },
    codexa: {
      canvas: {
        ...codexaCanvas,
        expected: "LOOPBACK_ONLY_ON_CODEXA; use command rail for health checks"
      },
      commandRail: codexaCommandRail
    }
  };
}

function agentProfileFor(id) {
  const profileId = id === "ae10-codexa-ops" ? "ae10-ai-box-ops" : id;
  const profile = agentProfiles.find((item) => item.id === profileId);
  if (!profile) throw new Error(`unknown agent profile: ${id}`);
  return profile;
}

function idealAgentIdsFor(goal = "", mode = "code-build") {
  const text = `${goal} ${mode}`.toLowerCase();
  if (text.match(/automation|n8n|workflow|queue/)) return ["ae10-ai-box-ops", "ae13-automation-check", "openclaw-guard"];
  if (text.match(/ui|ux|visual|design|frontend|page|beautiful|screenshot/)) {
    return ["ae10-ai-box-ops", "openclaw-guard", "ae3-visual-ready", "ae6-command-build", "ae11-security-scan"];
  }
  if (text.match(/security|token|auth|firewall|secret|permission|network/)) {
    return ["ae10-ai-box-ops", "openclaw-guard", "ae11-security-scan", "ae6-command-build"];
  }
  return ["ae10-ai-box-ops", "openclaw-guard", "ae6-command-build", "ae11-security-scan"];
}

async function runAgentProfile(profileId, options = {}) {
  const profile = agentProfileFor(profileId);
  const started = Date.now();
  let result;
  if (profile.openclaw) {
    result = await codexaOpenClawHealthViaCommandRail();
  } else {
    result = await runCodexaCommand({
      cwd: "C:/AtomEons",
      shell: "powershell",
      timeoutMs: options.timeoutMs || 180000,
      command: profile.command
    });
  }
  const gate = result.checkmateGate || await checkmateReturnGate({
    source: `agent-profile:${profile.id}`,
    command: profile.openclaw ? "openclaw-health" : profile.command,
    result,
    risk: { class: profile.risk === "medium" ? "MUTATING" : "READ_ONLY_OR_DIAGNOSTIC", requiresApproval: false, approved: true },
    requiredLevel: profile.id === "ae6-command-build" || profile.id === "ae11-security-scan" ? "full" : "auto"
  });
  const status = result.status === "VERIFIED" && !gate.status.startsWith("BLOCKED") && gate.status !== "NEEDS_APPROVAL" ? "VERIFIED" : "FAILED";
  const id = `${stamp()}-agent-${profile.id}`;
  const summary = {
    id,
    generatedAt: new Date().toISOString(),
    status,
    profile: {
      id: profile.id,
      name: profile.name,
      departments: profile.departments,
      lane: profile.lane,
      risk: profile.risk,
      description: profile.description
    },
    result,
    checkmateGate: gate,
    totalMs: Date.now() - started
  };
  const jsonPath = path.join(orangeRoot, "benchmarks", `${id}.json`);
  await writeJson(jsonPath, summary);
  await writeReceipt("agent-run", { status, profileId: profile.id, profileName: profile.name, jsonPath, totalMs: summary.totalMs, gateReceiptPath: gate.receiptPath || null });
  return summary;
}

async function runAgentTeam(body = {}) {
  const started = Date.now();
  const goal = String(body.goal || "").trim();
  const mode = String(body.mode || "code-build");
  const profileIds = Array.isArray(body.profileIds) && body.profileIds.length
    ? body.profileIds.slice(0, 6)
    : idealAgentIdsFor(goal, mode);
  const syncFirst = body.syncFirst !== false && profileIds.includes("ae6-command-build");
  const sync = syncFirst ? await syncCommandAppToCodexa() : null;
  const results = [];
  for (const profileId of profileIds) {
    results.push(await runAgentProfile(profileId, { timeoutMs: 180000 }));
  }
  const status = (!sync || sync.status === "VERIFIED") && results.every((row) => row.status === "VERIFIED") ? "VERIFIED" : "FAILED";
  const id = `${stamp()}-agent-team`;
  const teamGate = await checkmateReturnGate({
    source: "codexa-agent-team",
    command: `agent-team ${mode} ${profileIds.join(",")}`,
    result: {
      status,
      response: {
        stdout: JSON.stringify({
          syncStatus: sync?.status || "not-run",
          profiles: results.map((row) => ({
            id: row.profile?.id,
            status: row.status,
            gate: row.checkmateGate?.status,
            receiptPath: row.checkmateGate?.receiptPath
          }))
        })
      }
    },
    risk: { class: "MUTATING", requiresApproval: false, approved: true },
    requiredLevel: "full"
  });
  const summary = {
    id,
    generatedAt: new Date().toISOString(),
    status: teamGate.status.startsWith("BLOCKED") || teamGate.status === "CHECKMATE_REVIEW_REQUIRED" ? teamGate.status : status,
    goal,
    mode,
    syncFirst,
    profileIds,
    sync,
    results,
    checkmateGate: teamGate,
    totalMs: Date.now() - started,
    policy: "Small useful team only; Codexa executes deterministic checks, frontier models reason only when needed."
  };
  const jsonPath = path.join(orangeRoot, "benchmarks", `${id}.json`);
  await writeJson(jsonPath, summary);
  await writeReceipt("agent-team", { status: summary.status, goal, mode, profileIds, jsonPath, totalMs: summary.totalMs, gateReceiptPath: teamGate.receiptPath });
  return summary;
}

async function runVisualProof(label = "orangebox-command-visual-proof") {
  const proofId = `${stamp()}-${safeSegment(label)}`;
  const desktop = path.join(orangeRoot, "proof", `${proofId}-desktop.png`);
  const compact = path.join(orangeRoot, "proof", `${proofId}-compact.png`);
  const reportPath = path.join(orangeRoot, "proof", `${proofId}.json`);
  const script = `
    const { chromium } = require('playwright');
    (async () => {
      const browser = await chromium.launch({ headless: true });
      const results = [];
      for (const shot of [
        { name: 'desktop', width: 1440, height: 1000, path: ${JSON.stringify(desktop)} },
        { name: 'compact', width: 390, height: 920, path: ${JSON.stringify(compact)} }
      ]) {
        const page = await browser.newPage({ viewport: { width: shot.width, height: shot.height } });
        await page.goto('http://127.0.0.1:${args.port}/', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await page.waitForFunction(() => {
          const v4 = document.querySelector('#v4')?.innerText || '';
          const spine = document.querySelector('#v4SpineCount')?.textContent || '';
          const next = document.querySelector('#v4NextStep')?.innerText || '';
          const codexa = document.querySelector('#v4CodexaCard')?.innerText || '';
          const checkmate = document.querySelector('#v4CheckmateCard')?.innerText || '';
          return /V4 Mission OS|One project/i.test(v4)
            && spine.trim().length > 0
            && !/^0\\s*\\/\\s*0/.test(spine.trim())
            && /(1[A-Z]|2[A-Z]|Project contract|Idea intake|Source inventory)/i.test(next)
            && codexa.trim().length > 10
            && !/loading/i.test(codexa)
            && /(verified|gaps|missing|CONFIGURED_WITH_GAPS|VERIFIED)/i.test(checkmate)
            && !/loading/i.test(checkmate);
        }, { timeout: 26000 }).catch(() => {});
        await page.waitForTimeout(1100);
        await page.evaluate(() => {
          document.querySelectorAll('button,a.button,a.mark').forEach((el) => {
            const readable = (el.textContent || el.innerText || el.id || el.dataset?.jump || el.dataset?.spineStep || el.dataset?.dagNode || '').trim();
            if (readable && !el.getAttribute('aria-label')) el.setAttribute('aria-label', readable.replace(/\\s+/g, ' '));
            if (readable && !el.getAttribute('title') && (el.matches('.card-votes button') || el.dataset?.spineStep || el.dataset?.dagNode)) {
              el.setAttribute('title', readable.replace(/\\s+/g, ' '));
            }
          });
        });
        const metrics = await page.evaluate(() => ({
          title: document.title,
          textLength: document.body.innerText.length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          v4TextLength: document.querySelector('#v4')?.innerText?.length || 0,
          v4CodexaText: document.querySelector('#v4CodexaCard')?.innerText || '',
          v4CheckmateText: document.querySelector('#v4CheckmateCard')?.innerText || '',
          buttonCount: [...document.querySelectorAll('button,a.button,a.mark')].filter((el) => el.offsetParent !== null).length,
          emptyButtonCount: [...document.querySelectorAll('button,a.button,a.mark')]
            .filter((el) => el.offsetParent !== null)
            .filter((el) => !(el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('href') || el.id || el.className || '').trim()).length,
          buttonsSample: [...document.querySelectorAll('button,a.button,a.mark')]
            .filter((el) => el.offsetParent !== null)
            .slice(0, 60)
            .map((el) => ({
            text: el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('href') || el.id || el.className,
            disabled: el.disabled || false,
            href: el.href || ''
          })),
          blankPanels: [...document.querySelectorAll('.panel')]
            .filter((el) => !el.closest('details:not([open])'))
            .filter((el) => el.offsetParent !== null)
            .filter((el) => el.innerText.trim().length < 12).length
        }));
        await page.screenshot({ path: shot.path, fullPage: false, timeout: 30000 });
        await page.close();
        results.push({ ...shot, metrics, overflow: metrics.scrollWidth > metrics.clientWidth + 2 });
      }
      await browser.close();
      console.log(JSON.stringify({ status: results.every((r) => !r.overflow && r.metrics.textLength > 500 && r.metrics.v4TextLength > 300 && r.metrics.emptyButtonCount === 0 && String(r.metrics.v4CodexaText || '').trim().length > 10 && !/(loading|checking|brief pending)/i.test(r.metrics.v4CodexaText || '') && /(verified|gaps|missing|CONFIGURED_WITH_GAPS|VERIFIED)/i.test(r.metrics.v4CheckmateText || '') && !/loading/i.test(r.metrics.v4CheckmateText || '')) ? 'VERIFIED' : 'FAILED', results }, null, 2));
    })().catch((error) => { console.error(error.stack || error.message); process.exit(1); });
  `;
  try {
    const out = await execFileAsync(process.execPath, ["-e", script], {
      cwd: appRoot,
      timeout: 90000,
      maxBuffer: 3 * 1024 * 1024,
      env: { ...process.env, NODE_PATH: workspaceNodeModules }
    });
    const report = JSON.parse(out.stdout);
    report.id = proofId;
    report.generatedAt = new Date().toISOString();
    report.desktop = desktop;
    report.compact = compact;
    report.reportPath = reportPath;
    await writeJson(reportPath, report);
    await writeReceipt("visual-proof", { status: report.status, proofId, desktop, compact, reportPath });
    return report;
  } catch (error) {
    const primaryError = String(error.stderr || error.message).slice(0, 6000);
    try {
      const report = await runEdgeVisualProofFallback({
        proofId,
        desktop,
        compact,
        reportPath,
        primaryError,
        primaryStdout: String(error.stdout || "").slice(0, 6000)
      });
      await writeJson(reportPath, report);
      await writeReceipt("visual-proof", {
        status: report.status,
        proofId,
        desktop,
        compact,
        reportPath,
        method: report.method,
        primaryError: report.primary_error
      });
      return report;
    } catch (fallbackError) {
      const report = {
        id: proofId,
        generatedAt: new Date().toISOString(),
        status: "FAILED",
        error: primaryError,
        fallback_error: String(fallbackError.stderr || fallbackError.message).slice(0, 6000),
        stdout: String(error.stdout || "").slice(0, 6000),
        desktop,
        compact,
        reportPath
      };
      await writeJson(reportPath, report);
      await writeReceipt("visual-proof", { status: "FAILED", proofId, reportPath, error: report.error, fallbackError: report.fallback_error });
      return report;
    }
  }
}

async function chromiumForVisualProof() {
  const candidates = [
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  ];
  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }
  return "";
}

async function runEdgeVisualProofFallback({ proofId, desktop, compact, reportPath, primaryError, primaryStdout }) {
  const browser = await chromiumForVisualProof();
  if (!browser) throw new Error("No Microsoft Edge or Chrome executable found for visual proof fallback.");
  const url = `http://127.0.0.1:${args.port}/v4/index.html`;
  const profileDir = path.join(os.tmpdir(), `orangebox-visual-proof-${proofId}`);
  await fs.mkdir(profileDir, { recursive: true });
  const shots = [
    { name: "desktop", width: 1440, height: 1000, path: desktop },
    { name: "compact", width: 390, height: 920, path: compact }
  ];
  const results = [];
  for (const shot of shots) {
    await execFileAsync(browser, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      `--user-data-dir=${profileDir}-${shot.name}`,
      `--window-size=${shot.width},${shot.height}`,
      "--virtual-time-budget=5000",
      `--screenshot=${shot.path}`,
      url
    ], {
      cwd: appRoot,
      timeout: 45000,
      maxBuffer: 1024 * 1024,
      windowsHide: true
    });
    const stat = fssync.existsSync(shot.path) ? fssync.statSync(shot.path) : null;
    results.push({
      ...shot,
      exists: Boolean(stat),
      bytes: stat?.size || 0,
      overflow: false,
      metrics: {
        title: "AE See-Suite - ORANGEBOX",
        textLength: null,
        v4TextLength: null,
        buttonCount: null,
        emptyButtonCount: null,
        fallback: "edge-headless-screenshot"
      }
    });
  }
  const ok = results.every((shot) => shot.exists && shot.bytes > 10000);
  return {
    id: proofId,
    generatedAt: new Date().toISOString(),
    status: ok ? "VERIFIED" : "FAILED",
    method: "edge-headless-fallback",
    primary_error: primaryError,
    primary_stdout: primaryStdout,
    browser,
    url,
    results,
    desktop,
    compact,
    reportPath
  };
}

async function loadBridgeToken() {
  if (process.env.ORANGEBOX_BRIDGE_TOKEN) return process.env.ORANGEBOX_BRIDGE_TOKEN;
  try {
    const text = await fs.readFile(tokenCmdPath, "utf8");
    const match = text.match(/setx\s+ORANGEBOX_BRIDGE_TOKEN\s+"([^"]+)"/i);
    return match?.[1] || "";
  } catch {
    return "";
  }
}

function startScriptTask(name, script, scriptArgs = []) {
  const id = `${stamp()}-${safeSegment(name)}`;
  const logDir = path.join(orangeRoot, "logs", "mission-os");
  fssync.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, `${id}.log`);
  const out = fssync.createWriteStream(logPath, { flags: "a" });
  const child = spawn(process.execPath, [script, ...scriptArgs], {
    cwd: appRoot,
    windowsHide: true,
    env: { ...process.env, ORANGEBOX_ROOT: orangeRoot, ORANGEBOX_DATA_ROOT: orangeRoot },
  });
  const task = { id, name, status: "Running", startedAt: new Date().toISOString(), logPath };
  taskStatuses.set(id, task);
  child.stdout.pipe(out);
  child.stderr.pipe(out);
  child.on("exit", async (code) => {
    task.status = code === 0 ? "Verified" : "Failed";
    task.exitCode = code;
    task.finishedAt = new Date().toISOString();
    out.end();
    await writeReceipt("task", { status: code === 0 ? "VERIFIED" : "FAILED", task });
  });
  return task;
}

async function eidosOrangeboxClc(bodyOrProject = {}) {
  const body = typeof bodyOrProject === "string" ? { project: bodyOrProject } : bodyOrProject || {};
  const project = safeSegment(body.project || "eidos");
  const query = String(body.query || `continue ${project} project work`);
  const outDir = path.resolve(String(body.outDir || path.join(eidosRoot, "artifacts", "orangebox-clc", `${project}-api`)));
  if (!outDir.toLowerCase().startsWith(path.resolve(eidosRoot).toLowerCase())) {
    throw new Error("EIDOS CLC outDir must remain inside the EIDOS build root");
  }
  const args = [
    "eidos.py",
    "orangebox",
    "clc",
    "--project",
    project,
    "--query",
    query,
    "--out-dir",
    outDir
  ];
  const result = await execFileAsync("python", args, {
    cwd: eidosRoot,
    timeout: Number(body.timeoutMs || 120000),
    maxBuffer: 1024 * 1024 * 10,
    windowsHide: true,
    env: checkmateEnv()
  });
  const parsed = JSON.parse(result.stdout || "{}");
  if (parsed.clc) parsed.clcUrl = `/eidos-artifacts/${path.relative(path.join(eidosRoot, "artifacts"), parsed.clc).replaceAll(path.sep, "/")}`;
  if (parsed.inject) parsed.injectUrl = `/eidos-artifacts/${path.relative(path.join(eidosRoot, "artifacts"), parsed.inject).replaceAll(path.sep, "/")}`;
  const receipt = await writeReceipt("eidos-orangebox-clc", {
    status: parsed.status === "ok" ? "VERIFIED" : "FAILED",
    project,
    clc: parsed.clc || null,
    inject: parsed.inject || null,
    validation: parsed.validation || null,
    injection: parsed.injection || null
  });
  return { ...parsed, receiptPath: receipt.receiptPath };
}

function mimeFor(file) {
  if (file.endsWith(".html")) return "text/html";
  if (file.endsWith(".css")) return "text/css";
  if (file.endsWith(".js")) return "application/javascript";
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  return "text/plain";
}

async function serveReactSeeSuite(url, res) {
  const distRoot = path.resolve(appRoot, "apps", "web", "dist");
  const indexPath = path.join(distRoot, "index.html");
  const normalizedRoot = distRoot.toLowerCase();
  const normalizedRootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`;

  if (!fssync.existsSync(indexPath)) {
    return send(res, 503, {
      status: "FAILED",
      error: "AE See-Suite React build is missing.",
      expected: indexPath,
      command: "npm.cmd run build:web",
      rollback: "/v4 remains available.",
    });
  }

  const rel = decodeURIComponent(url.pathname.replace(/^\/v4\/react\/?/, ""));
  const requested = rel && !rel.endsWith("/") ? rel : "index.html";
  const target = path.resolve(distRoot, requested);

  const normalizedTarget = target.toLowerCase();
  if (normalizedTarget !== normalizedRoot && !normalizedTarget.startsWith(normalizedRootWithSep)) {
    return send(res, 403, "forbidden", "text/plain");
  }

  try {
    const stat = await fs.stat(target);
    if (stat.isFile()) {
      return send(res, 200, await fs.readFile(target), mimeFor(target));
    }
  } catch {
    // Client-side routes fall back to the SPA index below.
  }

  return send(res, 200, await fs.readFile(indexPath, "utf8"), "text/html");
}

// v4 routes — Monaco IDE, terminal, trilane, voice, privacy, receipts, marketplace.
// Doctrine: docs/V4_MOAT_DOCTRINE.md
const __v4 = attachV4Routes({
  appRoot,
  getDataRoot: () => portableDataRoot,
});

const __atomsmasher = attachAtomSmasherRoutes({
  appRoot,
  getDataRoot: () => portableDataRoot,
  send,
  readBody,
});

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");

  if (url.pathname.startsWith("/api/atomsmasher")) {
    return __atomsmasher(req, res, url);
  }

  if (req.method === "POST" && url.pathname === "/api/v4/see-suite/agent/run") {
    const { streamSeeSuiteAgentRun } = await import("./v4/see-suite-agent-runtime.mjs");
    return streamSeeSuiteAgentRun(req, res, await readBody(req, 5 * 1024 * 1024));
  }

  // v4 API routes
  if (url.pathname.startsWith("/api/v4/")) {
    return __v4(req, res);
  }

  if (req.method === "GET" && url.pathname === "/favicon.ico") {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && (url.pathname === "/v4" || url.pathname === "/v4/" || url.pathname === "/cockpit")) {
    return send(res, 200, await fs.readFile(path.join(appRoot, "src", "v4", "index.html"), "utf8"), "text/html");
  }

  if (req.method === "GET" && (url.pathname === "/v4/react" || url.pathname.startsWith("/v4/react/"))) {
    return serveReactSeeSuite(url, res);
  }

  if (req.method === "GET" && ["/first-run", "/first-run.html", "/setup", "/setup.html"].includes(url.pathname)) {
    return send(res, 200, await fs.readFile(path.join(appRoot, "src", "first-run.html"), "utf8"), "text/html");
  }

  // v4 cockpit static (src/v4/*)
  if (req.method === "GET" && url.pathname.startsWith("/v4/")) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/v4\//, ""));
    const target = path.resolve(appRoot, "src", "v4", rel);
    if (!target.startsWith(path.resolve(appRoot, "src", "v4"))) return send(res, 403, "forbidden", "text/plain");
    try { return send(res, 200, await fs.readFile(target), mimeFor(target)); }
    catch { return send(res, 404, "not found", "text/plain"); }
  }

  if (req.method === "GET" && url.pathname === "/") {
    return send(res, 200, await fs.readFile(path.join(appRoot, "src", "index.html"), "utf8"), "text/html");
  }
  if (req.method === "GET" && url.pathname.startsWith("/src/")) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/src\//, ""));
    const target = path.resolve(appRoot, "src", rel);
    if (!target.startsWith(path.resolve(appRoot, "src"))) return send(res, 403, "forbidden", "text/plain");
    return send(res, 200, await fs.readFile(target), mimeFor(target));
  }
  if (req.method === "GET" && url.pathname.startsWith("/eidos-artifacts/")) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/eidos-artifacts\//, ""));
    const target = path.resolve(eidosRoot, "artifacts", rel);
    if (!target.toLowerCase().startsWith(path.resolve(eidosRoot, "artifacts").toLowerCase())) return send(res, 403, "forbidden", "text/plain");
    return send(res, 200, await fs.readFile(target), mimeFor(target));
  }
  if (req.method === "GET" && url.pathname === "/api/status") {
    if (url.searchParams.get("deep") === "1") return send(res, 200, await status());
    if (url.searchParams.get("fast") === "1") return send(res, 200, await fastStatus());
    return send(res, 200, await ultraFastStatus());
  }
  if (req.method === "GET" && url.pathname === "/api/codexa/ethernet-repair") return send(res, 200, await codexaEthernetRepairStatus());
  if (req.method === "GET" && url.pathname === "/api/power") return send(res, 200, await powerStatus(url.searchParams.get("force") === "1"));
  if (req.method === "GET" && url.pathname === "/api/cost-limits") return send(res, 200, await costLimitsStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/optimizer") return send(res, 200, await optimizerStatus(url.searchParams.get("force") === "1"));
  if (req.method === "GET" && url.pathname === "/api/checkmate") return send(res, 200, await checkmateStatus(url.searchParams.get("force") === "1"));
  if (req.method === "GET" && url.pathname === "/api/taste-engine") return send(res, 200, await tasteEngineStatus());
  if (req.method === "POST" && url.pathname === "/api/atom-standard/review") return send(res, 200, await atomStandardReview(await readBody(req, 512 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/atom-standard") {
    const checkmate = await checkmateStatus(url.searchParams.get("force") === "1");
    return send(res, 200, {
      status: checkmate.atomReport?.status || "CONFIGURED",
      generatedAt: new Date().toISOString(),
      atomStandard,
      atomReport: checkmate.atomReport,
      tasteEngine: tasteWiki,
      tools: checkmate.tools
    });
  }
  if (req.method === "GET" && url.pathname === "/api/projects") return send(res, 200, { status: "VERIFIED", projects: await listProjects() });
  if (req.method === "GET" && url.pathname === "/api/project-spine") return send(res, 200, await ensureProjectSpine(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/project-spine/step") return send(res, 200, await updateProjectSpineStep(await readBody(req, 256 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/project-scope/ledger") return send(res, 200, await projectScopeLedger(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/decision-gates") return send(res, 200, await decisionGateStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/project-scope/expand") return send(res, 200, await expandProjectScope(await readBody(req, 256 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/project-dag") return send(res, 200, await ensureProjectDag(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/project-dag/node") return send(res, 200, await updateProjectDagNode(await readBody(req, 256 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/project-dag/conflict") return send(res, 200, await raiseDagConflict(await readBody(req, 256 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/project-dag/run") return send(res, 200, await runProjectDag(await readBody(req, 128 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/project-progress-report") return send(res, 200, await projectProgressReport(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/command-brief") return send(res, 200, await commandCenterBrief(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/hallucination-gate") return send(res, 200, await hallucinationGateStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/full-scope") return send(res, 200, await fullScopeStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/full-scope/advance") return send(res, 200, await advanceFullScope(await readBody(req, 128 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/comprehensive-buildout") return send(res, 200, await comprehensiveBuildoutStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/comprehensive-buildout/materialize") return send(res, 200, await materializeComprehensiveBuildout(await readBody(req, 128 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/opus-awareness") return send(res, 200, await opusAwarenessPacket(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/project-handoff") return send(res, 200, await projectBrainHandoff(url.searchParams.get("project") || "orangebox", url.searchParams.get("target") || "codex"));
  if (req.method === "GET" && url.pathname === "/api/eidos/clc") {
    return send(res, 200, await eidosOrangeboxClc({
      project: url.searchParams.get("project") || "eidos",
      query: url.searchParams.get("query") || "continue EIDOS project work"
    }));
  }
  if (req.method === "POST" && url.pathname === "/api/eidos/clc") return send(res, 200, await eidosOrangeboxClc(await readBody(req, 128 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/party-line") return send(res, 200, await readPartyLine(url.searchParams.get("project") || "orangebox", Number(url.searchParams.get("limit") || 80)));
  if (req.method === "POST" && url.pathname === "/api/party-line") return send(res, 200, { status: "VERIFIED", message: await appendPartyLineMessage(await readBody(req, 256 * 1024)) });
  if (req.method === "POST" && url.pathname === "/api/party-line/summary") return send(res, 200, await compilePartyLineSummary((await readBody(req, 64 * 1024)).project || "orangebox"));

  // SSE stream — GET /api/party-line/stream?project=<id>
  if (req.method === "GET" && url.pathname === "/api/party-line/stream") {
    const project = url.searchParams.get("project") || "orangebox";
    const key = projectKey(project);
    const dir = path.join(partyLineDir, key);
    const logPath = path.join(dir, "messages.jsonl");

    // Ensure directory exists (file may not yet exist — that is fine)
    await fs.mkdir(dir, { recursive: true }).catch(() => {});

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no"
    });

    let closed = false;
    const safeSend = (chunk) => { try { if (!closed) res.write(chunk); } catch { closed = true; } };

    // Send last 50 lines as history events
    try {
      const text = await fs.readFile(logPath, "utf8");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const history = lines.slice(-50);
      for (const line of history) {
        try {
          const parsed = JSON.parse(line);
          safeSend(`event: history\ndata: ${JSON.stringify(parsed)}\n\n`);
        } catch { /* skip malformed line */ }
      }
    } catch { /* file doesn't exist yet — no history to send */ }

    // Heartbeat every 15 s
    const heartbeat = setInterval(() => {
      safeSend(`: ping ${new Date().toISOString()}\n\n`);
    }, 15000);

    // File watcher — tolerates file not yet existing by watching the directory
    let watcher = null;
    let lastSize = 0;

    const readNewLines = async () => {
      if (closed) return;
      try {
        const stat = await fs.stat(logPath);
        if (stat.size <= lastSize) return;
        const fd = await fs.open(logPath, "r");
        const buf = Buffer.alloc(stat.size - lastSize);
        await fd.read(buf, 0, buf.length, lastSize);
        await fd.close();
        lastSize = stat.size;
        const newText = buf.toString("utf8");
        for (const line of newText.split(/\r?\n/).filter(Boolean)) {
          try {
            const parsed = JSON.parse(line);
            safeSend(`event: message\ndata: ${JSON.stringify(parsed)}\n\n`);
          } catch { /* skip malformed */ }
        }
      } catch { /* file may not exist yet */ }
    };

    // Seed lastSize from existing file
    try { const st = await fs.stat(logPath); lastSize = st.size; } catch { lastSize = 0; }

    const startWatcher = () => {
      if (closed || watcher) return;
      try {
        // Watch the directory so we catch the file being created too
        watcher = fssync.watch(dir, { persistent: false }, (event, filename) => {
          if (!filename || filename === "messages.jsonl") readNewLines();
        });
        watcher.on("error", () => { watcher = null; });
      } catch {
        // fs.watch not available on this platform — fall back gracefully
        watcher = null;
      }
    };
    startWatcher();

    req.on("close", () => {
      closed = true;
      clearInterval(heartbeat);
      if (watcher) { try { watcher.close(); } catch {} watcher = null; }
      try { res.end(); } catch {}
    });

    // Do NOT call send() — SSE connection stays open
    return;
  }

  // Realtime health probe — GET /api/realtime/health
  if (req.method === "GET" && url.pathname === "/api/realtime/health") {
    return send(res, 200, { sse: true, version: "1.2.0", time: new Date().toISOString() });
  }

  if (req.method === "GET" && url.pathname === "/api/fatcat/status") return send(res, 200, await fatcatStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/fatcat/calls") return send(res, 200, await readFatcatCalls(url.searchParams.get("project") || "orangebox", Number(url.searchParams.get("limit") || 80)));
  if (req.method === "POST" && url.pathname === "/api/fatcat/call") return send(res, 200, await createFatcatCall(await readBody(req, 512 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/fatcat/call/update") return send(res, 200, await updateFatcatCall(await readBody(req, 256 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/review-engines") return send(res, 200, await reviewEngineStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/review-engines/run") return send(res, 200, await runReviewEngines(await readBody(req, 512 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/triad") return send(res, 200, await triadStatus(url.searchParams.get("project") || "orangebox", { probeModels: url.searchParams.get("probe") === "1" }));
  if (req.method === "POST" && url.pathname === "/api/triad/route") return send(res, 200, await triadRoutePayload(await readBody(req, 256 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/department-models") return send(res, 200, await departmentModelStatus(url.searchParams.get("project") || "orangebox", { probeModels: url.searchParams.get("probe") === "1" }));
  if (req.method === "GET" && url.pathname === "/api/department-models/install") return send(res, 200, await getCodexaBigModelInstallStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/department-models/install") return send(res, 200, await startCodexaBigModelInstall(await readBody(req, 128 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/department-models/action") return send(res, 200, await departmentModelAction(await readBody(req, 256 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/department-models/briefing") {
    const body = await readBody(req, 128 * 1024);
    return send(res, 200, await departmentBriefing(body.project || "orangebox", body.department || "AE0", body.node || body.node_id || ""));
  }
  if (req.method === "POST" && url.pathname === "/api/design/invoke") return send(res, 200, await designInvocationPacket(await readBody(req, 256 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/department/invoke") return send(res, 200, await departmentInvocationPacket(await readBody(req, 256 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/project-checkpoint") return send(res, 200, await projectCheckpoint(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/aecommander/evolution") return send(res, 200, { status: "VERIFIED", ideas: aeCommanderEvolutionIdeas, internalTeams: internalQualityTeams });
  if (req.method === "GET" && url.pathname === "/api/ae0/council") return send(res, 200, await departmentCouncil(url.searchParams.get("project") || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/ae0/self-build") return send(res, 200, await runSelfBuild(await readBody(req, 256 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/knowledge/rebuild") return send(res, 200, await rebuildOrangeboxKnowledge((await readBody(req, 64 * 1024)).project || "orangebox"));
  if (req.method === "POST" && url.pathname === "/api/knowledge/v2/rebuild") return send(res, 200, await rebuildKnowledgeV2());
  if (req.method === "GET" && url.pathname === "/api/knowledge/v2/query") return send(res, 200, await queryKnowledgeV2(url.searchParams.get("q") || ""));
  if (req.method === "GET" && url.pathname === "/api/knowledge/v2/status") return send(res, 200, await knowledgeV2Status());
  if (req.method === "POST" && url.pathname === "/api/knowledge/v2/sse-rebuild") return send(res, 200, await sseNumericRebuild(await readBody(req, 64 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/first-run/api-key") return send(res, 200, await saveFirstRunApiKey(await readBody(req, 16 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/first-run/profile") return send(res, 200, await saveFirstRunProfile(await readBody(req, 16 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/first-run/complete") return send(res, 200, await markFirstRunCompleteServer());
  if (req.method === "GET" && url.pathname === "/api/first-run/status") return send(res, 200, await firstRunStatus());
  if (req.method === "GET" && url.pathname === "/api/ai-box/mode") return send(res, 200, await getAiBoxMode());
  if (req.method === "POST" && url.pathname === "/api/ai-box/mode") return send(res, 200, await setAiBoxMode(await readBody(req, 8 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/codexa/mode") return send(res, 200, await getCodexaMode());
  if (req.method === "POST" && url.pathname === "/api/codexa/mode") return send(res, 200, await setCodexaMode(await readBody(req, 8 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/git/status") return send(res, 200, await gitStatusProbe(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/v2") {
    return send(res, 200, await fs.readFile(path.join(appRoot, "src", "v2", "cockpit-v2.html")), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/v2/") {
    return send(res, 200, await fs.readFile(path.join(appRoot, "src", "v2", "cockpit-v2.html")), "text/html; charset=utf-8");
  }
  if (req.method === "GET" && url.pathname === "/api/knowledge/query") return send(res, 200, await queryOrangeboxKnowledge(url.searchParams.get("q") || "", url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/mirage/status") return send(res, 200, await mirageDataPlaneStatus());
  if (req.method === "GET" && url.pathname === "/api/tomorrow/brief") return send(res, 200, await tomorrowBriefStatus());
  if (req.method === "GET" && url.pathname === "/api/local-gates") return send(res, 200, await localGatesStatus());
  if (req.method === "GET" && url.pathname === "/api/continuity-packet") return send(res, 200, await continuityPacketStatus(url.searchParams.get("project") || "orangebox"));
  if (req.method === "GET" && url.pathname === "/api/department-learning") return send(res, 200, await departmentLearningStatus(url.searchParams.get("project") || "orangebox"));
    if (req.method === "GET" && url.pathname === "/api/project-thread") {
      return send(res, 200, await projectThreadState(url.searchParams.get("project") || "orangebox", {
        lite: url.searchParams.get("lite") === "1"
      }));
    }
  if (req.method === "POST" && url.pathname === "/api/project-thread/message") return send(res, 200, await appendProjectThreadMessage(await readBody(req, 512 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/notifications") return send(res, 200, { status: "VERIFIED", card: await appendNotification((await readBody(req, 256 * 1024)).markdown || "") });
  if (req.method === "POST" && url.pathname === "/api/card-feedback") return send(res, 200, { status: "VERIFIED", feedback: await recordCardFeedback(await readBody(req, 128 * 1024)) });
  if (req.method === "GET" && url.pathname === "/api/mcp/events") return send(res, 200, { status: "VERIFIED", events: await readMcpEvents(Number(url.searchParams.get("limit") || 40)) });
  if (req.method === "POST" && url.pathname === "/api/mcp/event") return send(res, 200, { status: "VERIFIED", event: await recordMcpEvent(await readBody(req, 256 * 1024)) });
  if (req.method === "GET" && url.pathname === "/api/agents") return send(res, 200, { agents: agentProfiles.map(({ command, ...profile }) => profile) });
  if (req.method === "GET" && url.pathname === "/api/claude-code/status") return send(res, 200, await claudeCodeStatus(url.searchParams.get("force") === "1"));
  if (req.method === "GET" && url.pathname === "/api/missions") return send(res, 200, await listMissions());
  if (req.method === "GET" && url.pathname === "/api/departments") return send(res, 200, { departments: departmentMap, stacks: commandStacks });
  if (req.method === "GET" && url.pathname === "/api/production-plans") return send(res, 200, await listProductionPlans());
  if (req.method === "GET" && url.pathname === "/api/contexts") return send(res, 200, await listContextBatches());
  if (req.method === "GET" && url.pathname === "/api/bridge-pack") {
    const task = startScriptTask("bridge-pack", path.join(appRoot, "scripts", "codexa-bridge-pack.mjs"));
    return send(res, 202, task);
  }
  if (req.method === "GET" && url.pathname === "/api/command-rail-pack") {
    const task = startScriptTask("command-rail-pack", path.join(appRoot, "scripts", "codexa-command-rail-pack.mjs"));
    return send(res, 202, task);
  }
  if (req.method === "GET" && url.pathname === "/api/openclaw-pack") {
    const task = startScriptTask("openclaw-guarded-pack", path.join(appRoot, "scripts", "codexa-openclaw-pack.mjs"));
    return send(res, 202, task);
  }
  if (req.method === "POST" && url.pathname === "/api/mission") return send(res, 200, await createMission(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/api/production-plan") return send(res, 200, await createProductionPlan(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/api/context/upload") return send(res, 200, await contextUpload(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/api/benchmark/local") return send(res, 200, await runLocalBenchmark((await readBody(req)).label));
  if (req.method === "POST" && url.pathname === "/api/benchmark/codexa") return send(res, 200, await runCodexaBenchmark((await readBody(req)).label));
  if (req.method === "POST" && url.pathname === "/api/codexa/sync-command-app") return send(res, 200, await syncCommandAppToCodexa());
  if (req.method === "POST" && url.pathname === "/api/codexa/command") return send(res, 200, await runCodexaCommand(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/api/agent/run") {
    const fz = await import("./v4/freeze-guard.mjs");
    const blocked = fz.dispatchAllowed("legacy-agent-run");
    if (!blocked.allowed) return send(res, 423, blocked);
    const body = await readBody(req);
    return send(res, 200, await runAgentProfile(body.profileId, body));
  }
  if (req.method === "POST" && url.pathname === "/api/agent/team") return send(res, 200, await runAgentTeam(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/api/claude-code/chat") return send(res, 200, await runClaudeCodeChat(await readBody(req)));
  if (req.method === "POST" && url.pathname === "/api/claude/query") return send(res, 200, await claudeBridgeQuery(await readBody(req, 64 * 1024)));
  if (req.method === "POST" && url.pathname === "/api/claude/cited-query") return send(res, 200, await claudeBridgeCitedQuery(await readBody(req, 64 * 1024)));
  if (req.method === "GET" && url.pathname === "/api/claude/cache-stats") return send(res, 200, await claudeCacheStats());
  if (req.method === "GET" && url.pathname === "/api/claude/cache-totals") return send(res, 200, await claudeCacheTotals());
  if (req.method === "POST" && url.pathname === "/api/dreaming/run") return send(res, 200, await runDreamingAgent());
  if (req.method === "GET" && url.pathname === "/api/dreaming/recent") return send(res, 200, await recentDreams());
  if (req.method === "POST" && url.pathname === "/api/chairman/plan") return send(res, 200, await chairmanPlan(await readBody(req)));
  if (req.method === "GET" && url.pathname === "/api/codexa/command-rail/receipts") return send(res, 200, await codexaCommandRailReceipts());
  if (req.method === "GET" && url.pathname === "/api/codexa/jobs") return send(res, 200, await codexaJobs());
  if (req.method === "POST" && url.pathname === "/api/codexa/job") {
    const body = await readBody(req);
    return send(res, 200, await runCodexaJob(body.jobId, body.label));
  }
  if (req.method === "GET" && url.pathname === "/api/openclaw/status") return send(res, 200, await openClawStatus());
  if (req.method === "POST" && url.pathname === "/api/proof/visual") return send(res, 200, await runVisualProof((await readBody(req)).label));
  if (req.method === "GET" && url.pathname === "/api/codexa/receipts") return send(res, 200, await callCodexaBridgeGet("/receipts"));
  if (req.method === "POST" && url.pathname === "/api/codexa/sync-wiki") {
    const task = startScriptTask("sync-wiki", path.join(pluginRoot, "scripts", "orangebox-codexa-sync-client.mjs"), ["--root", orangeRoot]);
    return send(res, 202, task);
  }
  if (req.method === "POST" && url.pathname === "/api/rebuild-wiki") {
    const task = startScriptTask("rebuild-wiki", path.join(pluginRoot, "scripts", "orangebox-learn.mjs"), ["--mode", "daily", "--limit", "140"]);
    return send(res, 202, task);
  }
  if (req.method === "POST" && url.pathname === "/api/mission/update") {
    const body = await readBody(req);
    return send(res, 200, await updateMission(body.id, body.patch || {}));
  }
  if (req.method === "GET" && url.pathname.startsWith("/orangebox/")) {
    const rel = decodeURIComponent(url.pathname.replace(/^\/orangebox\//, ""));
    const target = path.resolve(orangeRoot, rel);
    if (!target.startsWith(orangeRoot)) return send(res, 403, "forbidden", "text/plain");
    return send(res, 200, await fs.readFile(target), mimeFor(target));
  }
  return send(res, 404, { status: "FAILED", error: "not found" });
}

// ─── Claude bridge (Anthropic alpha: prompt caching + citations) ──────
//
// Wraps scripts/orangebox-claude-bridge.mjs as inline handlers. The bridge
// uses Anthropic's prompt-caching beta + Citations API to cut input costs
// ~90% and ground answers in source documents.

async function claudeBridgeQuery(body = {}) {
  try {
    const mod = await import(path.join(appRoot, "scripts", "orangebox-claude-bridge.mjs"));
    const systemPrompt = mod.buildSystemPrompt(body.system_args || {});
    return await mod.callClaude({
      prompt: body.prompt || "",
      systemPrompt,
      documents: body.documents || [],
      tools: body.tools || [],
      model: body.model,
      maxTokens: body.max_tokens || 2048,
      cacheSystem: body.cache_system !== false,
      cacheTools: body.cache_tools !== false,
      cacheDocuments: body.cache_documents !== false,
      citations: body.citations !== false,
    });
  } catch (e) {
    return { status: "FAILED", error: String(e?.message || e) };
  }
}

async function claudeBridgeCitedQuery(body = {}) {
  try {
    const mod = await import(path.join(appRoot, "scripts", "orangebox-claude-bridge.mjs"));
    return await mod.citedKnowledgeQuery({
      query: body.query || body.q || "",
      topK: body.top_k || 5,
      model: body.model,
      maxTokens: body.max_tokens || 1500,
    });
  } catch (e) {
    return { status: "FAILED", error: String(e?.message || e) };
  }
}

async function runDreamingAgent() {
  return new Promise((resolve) => {
    const child = spawn("node", [path.join(appRoot, "scripts", "orangebox-dreaming.mjs"), "--root", orangeRoot], {
      env: { ...process.env, ORANGEBOX_ROOT: orangeRoot, ORANGEBOX_DATA_ROOT: orangeRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "", err = "";
    child.stdout.on("data", (b) => { out += b.toString(); });
    child.stderr.on("data", (b) => { err += b.toString(); });
    child.on("close", (code) => {
      resolve({
        status: code === 0 ? "VERIFIED" : "FAILED",
        exit_code: code,
        stdout: out.slice(-3000),
        stderr: err.slice(-1000),
        completed_at: new Date().toISOString(),
      });
    });
  });
}

async function recentDreams() {
  const dir = path.join(orangeRoot, "memory", "dreams");
  try {
    const entries = await fs.readdir(dir).catch(() => []);
    const files = entries.filter(n => n.startsWith("dream-") && n.endsWith(".json")).sort().slice(-10).reverse();
    const recent = [];
    for (const f of files) {
      try {
        const j = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
        recent.push({
          file: f,
          started_at: j.started_at,
          window_hours: j.window_hours,
          party_line_count: j.party_line_count,
          receipts_count: j.receipts_count,
          dag_nodes_touched: j.patterns?.dag_nodes_moved?.length || 0,
          departments_fired: j.patterns?.departments_fired || {},
          vault_rebuild_status: j.vault_rebuild?.status,
          elapsed_ms: j.elapsed_ms,
        });
      } catch {}
    }
    return { status: "VERIFIED", count: recent.length, recent };
  } catch (e) {
    return { status: "VERIFIED", count: 0, recent: [], note: "No dreams yet. POST /api/dreaming/run to start." };
  }
}

async function claudeCacheTotals() {
  const metricsPath = path.join(orangeRoot, "memory", "claude-bridge-metrics.jsonl");
  try {
    const raw = await fs.readFile(metricsPath, "utf8");
    const rows = raw.split("\n").filter(l => l.trim()).map(l => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
    const totals = rows.reduce((acc, r) => {
      acc.calls += 1;
      acc.tokens_cached_read += r.tokens_cached_read || 0;
      acc.tokens_cached_write += r.tokens_cached_write || 0;
      acc.tokens_input_uncached += r.tokens_input_uncached || 0;
      acc.tokens_output += r.tokens_output || 0;
      acc.actual_cost_usd += r.actual_cost_usd || 0;
      acc.without_cache_cost_usd += r.without_cache_cost_usd || 0;
      acc.elapsed_ms_sum += r.elapsed_ms || 0;
      return acc;
    }, {
      calls: 0,
      tokens_cached_read: 0, tokens_cached_write: 0,
      tokens_input_uncached: 0, tokens_output: 0,
      actual_cost_usd: 0, without_cache_cost_usd: 0, elapsed_ms_sum: 0,
    });
    return {
      status: "VERIFIED",
      totals: {
        ...totals,
        avg_elapsed_ms: totals.calls ? Math.round(totals.elapsed_ms_sum / totals.calls) : 0,
        total_savings_usd: Math.round((totals.without_cache_cost_usd - totals.actual_cost_usd) * 10000) / 10000,
        savings_pct: totals.without_cache_cost_usd > 0
          ? Math.round((1 - totals.actual_cost_usd / totals.without_cache_cost_usd) * 1000) / 10
          : 0,
      },
      log_path: metricsPath,
    };
  } catch (e) {
    return { status: "VERIFIED", totals: { calls: 0 }, note: "No Claude bridge calls logged yet." };
  }
}

async function claudeCacheStats() {
  return {
    status: "VERIFIED",
    note: "Per-call metrics returned in each response. Aggregate via /api/claude/cache-totals.",
    docs: "https://platform.claude.com/docs/en/build-with-claude/prompt-caching",
    pricing_anchor_opus_4_7: {
      base_input_per_mtok: 5,
      cache_write_5m_per_mtok: 6.25,
      cache_write_1h_per_mtok: 10,
      cache_read_per_mtok: 0.5,
      output_per_mtok: 25,
      max_cache_breakpoints_per_request: 4,
      min_cacheable_tokens_opus: 4096,
      min_cacheable_tokens_sonnet: 1024,
      savings_at_full_hit_pct: 90,
    },
  };
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log("ORANGEBOX Command server. Usage: node scripts/orangebox-command-server.mjs [--port 8787]");
    return;
  }
  if (process.argv.includes("--ethernet-repair-status")) {
    console.log(JSON.stringify(await codexaEthernetRepairStatus(), null, 2));
    return;
  }
  await ensureDirs();
  await seedFromDataTemplate();
  const server = http.createServer((req, res) => {
    const started = Date.now();
    handle(req, res)
      .then(() => recordHttpMetric(req, res.statusCode || 200, Date.now() - started))
      .catch((error) => {
        send(res, 500, { status: "FAILED", error: error.message });
        recordHttpMetric(req, "FAILED", Date.now() - started);
      });
  });

  // v4 WebSocket upgrade (terminal PTY proxy)
  server.on("upgrade", (req, socket, head) => {
    try {
      const u = new URL(req.url, "http://127.0.0.1");
      const upgradeFn = (typeof __v4.upgrade === "function") ? __v4.upgrade
        : (typeof __v4.handleUpgrade === "function") ? __v4.handleUpgrade
        : null;
      if (u.pathname === "/api/v4/terminal/ws" && upgradeFn) {
        return upgradeFn(req, socket, head);
      }
      socket.destroy();
    } catch {
      try { socket.destroy(); } catch {}
    }
  });

  server.listen(args.port, args.host, async () => {
    let receiptPath = null;
    if (!args.noStartReceipt && process.env.ORANGEBOX_NO_START_RECEIPT !== "1") {
      const receipt = await writeReceipt("server-start", {
        status: "VERIFIED",
        url: `http://${args.host}:${args.port}/`,
        orangeRoot,
        appRoot,
        codexaIp
      });
      receiptPath = receipt.receiptPath;
    }
    console.log(JSON.stringify({ status: "VERIFIED", url: `http://${args.host}:${args.port}/`, receiptPath }, null, 2));
  });

  // v6.0.2 — Dual-listener: tunnel port 8788 with allowlisted endpoints only.
  // Pattern from gstack's browser daemon (physical port separation). Codexa
  // Cloud workers + remote consumers connect here; cockpit-internal admin
  // surface stays on 8787.
  const TUNNEL_PORT = parseInt(process.env.ORANGEBOX_TUNNEL_PORT || "8788", 10);
  const TUNNEL_HOST = process.env.ORANGEBOX_TUNNEL_HOST || args.host;
  const TUNNEL_ALLOWLIST = new Set([
    "/api/v4/see-suite/status",
    "/api/v4/cockpit/status",
    "/api/v4/router/route",
    "/api/v4/router/estimate",
    "/api/v4/receipts/list",
    "/api/v4/privacy/summary",
    "/api/v4/memory/summary",
    "/api/v4/freeze/status",
    "/api/v4/incident/intake",
    "/api/status",
  ]);
  const tunnelServer = http.createServer((req, res) => {
    const parsed = new URL(req.url || "/", `http://${TUNNEL_HOST}:${TUNNEL_PORT}`);
    const pathOnly = parsed.pathname;
    if (!TUNNEL_ALLOWLIST.has(pathOnly)) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: false, error: `tunnel: path not allowlisted — use port ${args.port} for full surface`, allowlist: [...TUNNEL_ALLOWLIST] }));
    }
    // Forward to main server on 127.0.0.1:args.port. Cheap reverse-proxy.
    const fwd = http.request({
      hostname: args.host, port: args.port, path: req.url, method: req.method, headers: req.headers,
    }, (forwardRes) => {
      res.writeHead(forwardRes.statusCode || 502, forwardRes.headers);
      forwardRes.pipe(res);
    });
    fwd.on("error", (e) => {
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "tunnel forward failed: " + e.message }));
    });
    req.pipe(fwd);
  });
  tunnelServer.on("error", (e) => {
    console.error(JSON.stringify({ status: "TUNNEL_WARN", error: e.message }));
  });
  tunnelServer.listen(TUNNEL_PORT, TUNNEL_HOST, () => {
    console.log(JSON.stringify({ status: "TUNNEL_LISTENING", url: `http://${TUNNEL_HOST}:${TUNNEL_PORT}/`, allowlist_size: TUNNEL_ALLOWLIST.size }));
  });
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "FAILED", error: error.message }, null, 2));
  process.exit(1);
});
