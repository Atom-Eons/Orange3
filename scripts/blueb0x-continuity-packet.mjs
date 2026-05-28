import fs from "node:fs/promises";
import path from "node:path";

const orangeRoot = process.env.ORANGEBOX_ROOT || "C:/AtomEons/aeskills/orangebox";
const project = safeSegment(process.argv[2] || process.env.BLUEB0X_PROJECT || "orangebox");
const projectRoot = path.join(orangeRoot, "project-thread", project);
const receiptsRoot = path.join(orangeRoot, "receipts");
const continuityRoot = path.join(orangeRoot, "continuity");

function iso() {
  return new Date().toISOString();
}

function stamp() {
  return iso().replace(/[:.]/g, "-");
}

function safeSegment(value) {
  return String(value || "orangebox").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "orangebox";
}

async function readText(file, fallback = "") {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return fallback;
  }
}

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeText(file, text) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text, "utf8");
}

async function latestFiles(dir, predicate = () => true, limit = 8) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      if (!entry.isFile() || !predicate(entry.name)) continue;
      const file = path.join(dir, entry.name);
      const stat = await fs.stat(file);
      files.push({ name: entry.name, path: file, size: stat.size, mtime: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs });
    }
    return files.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, limit);
  } catch {
    return [];
  }
}

function doneStatus(status) {
  return ["VERIFIED", "DONE", "PASSED", "COMPLETE"].includes(String(status || "").toUpperCase());
}

function compactThread(text) {
  const lines = String(text || "").split(/\r?\n/).filter(Boolean);
  return lines.slice(-80).join("\n");
}

function decisionGateStatus(dagNodes, dynamicScope) {
  const approvalQueue = dagNodes.filter((node) => ["awaiting_approval", "awaiting_operator_arbitration", "blocked_by_security"].includes(String(node.status || "").toLowerCase()));
  const pendingScope = dynamicScope.filter((step) => !doneStatus(step.liveStatus || step.status));
  const waiting = [
    ...approvalQueue.map((node) => ({
      id: node.node_id || node.id,
      kind: "dag_approval",
      title: node.node_name || node.title,
      status: node.status,
      owner: node.owner_department || node.department || "AE0",
      reason: node.validation_command || node.execution_payload || "Approval required before this node can continue."
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
  return {
    status: waiting.length ? "NEEDS_APPROVAL" : "AUTONOMOUS_READY",
    counts: {
      waiting: waiting.length,
      dagApprovals: approvalQueue.length,
      pendingScope: pendingScope.length
    },
    waiting,
    rules: [
      "Autonomous coding may continue inside approved project workspace.",
      "Pause for scope/path, broad architecture, destructive operations, production release, money/customer/data, network/permission/secrets, vendor installs, Checkmate final gate, or LIPS overrule.",
      "No model handoff may bypass Decision Gates."
    ],
    nextAction: waiting.length ? `Resolve ${waiting[0].id}: ${waiting[0].title}` : "Autonomous coding may continue inside the approved workspace."
  };
}

function renderMarkdown(report) {
  const nextStep = report.spine.nextStep;
  const currentNode = report.dag.currentNode;
  return [
    "# BLUEB0X Continuity Packet",
    "",
    `Generated: ${report.generatedAt}`,
    `Project: ${report.project}`,
    `Status: ${report.status}`,
    "",
    "## Use This First",
    "",
    "Paste or load this packet before any model continues the project. It is the model-neutral project state. Do not reset scope, rename the product, skip the spine, or claim work without receipts.",
    "",
    "## Current Position",
    "",
    report.position.currentPosition || "No current position captured.",
    "",
    "## Progress",
    "",
    `- Spine: ${report.spine.doneCount}/${report.spine.count} (${report.spine.percent}%).`,
    `- DAG: ${report.dag.completeNodes}/${report.dag.totalNodes} (${report.dag.percent}% weighted).`,
    `- Next spine step: ${nextStep ? `${nextStep.id} ${nextStep.title} / ${nextStep.department}` : "none"}`,
    `- Current DAG node: ${currentNode ? `${currentNode.node_id || currentNode.id} ${currentNode.node_name || currentNode.title || ""}` : "none"}`,
    `- Dynamic scope additions: ${report.scopeLedger.verified}/${report.scopeLedger.total} verified.`,
    "",
    "## Dynamic Scope Ledger",
    "",
    ...(report.scopeLedger.steps.length
      ? report.scopeLedger.steps.map((step) => `- ${step.id || ""} ${step.title || step.key}: ${step.liveStatus || step.status} / ${step.department || "AE0"} / ${step.sourceText || step.gate || ""}`)
      : ["- No dynamic scope additions recorded."]),
    "",
    "## Decision Gates",
    "",
    `- Status: ${report.decisionGates.status}.`,
    `- Waiting: ${report.decisionGates.counts.waiting}. DAG approvals: ${report.decisionGates.counts.dagApprovals}. Pending scope: ${report.decisionGates.counts.pendingScope}.`,
    `- Next action: ${report.decisionGates.nextAction}`,
    ...(report.decisionGates.waiting.length
      ? report.decisionGates.waiting.map((gate) => `- ${gate.id} ${gate.kind}: ${gate.title} / ${gate.status} / ${gate.owner} / ${gate.reason}`)
      : ["- No decision gates waiting."]),
    "",
    "## Active Files",
    "",
    ...report.activeFiles.map((item) => `- ${item.label}: ${item.path}`),
    "",
    "## Local Gates",
    "",
    report.latestLocalGate
      ? `Latest local gates receipt: ${report.latestLocalGate.path}`
      : "Latest local gates receipt: missing",
    "",
    "## Next Actions",
    "",
    ...report.nextActions.map((item) => `- ${item}`),
    "",
    "## Rules",
    "",
    "- Keep one project thread alive for the project.",
    "- Use BLUEB0X Knowledge for recall; do not haul full logs into model context.",
    "- Opus/Claude handles hard reasoning and architecture. Codex handles execution. Codexa handles heavy local execution when explicitly approved.",
    "- Human approval is required for destructive actions, deploys, database writes, payments, customer messages, firewall changes, third-party installs, and scope/path changes.",
    "- Checkmate/Atom Standard must review before completion claims.",
    "- Provider token telemetry is UNKNOWN unless the adapter proves real counts.",
    "",
    "## Latest Receipts",
    "",
    ...(report.latestReceipts.length ? report.latestReceipts.map((item) => `- ${item.name} / ${item.mtime}`) : ["- none"]),
    "",
    "## Recent Thread Slice",
    "",
    report.recentThread || "(empty)",
    "",
    "## Files Written",
    "",
    `- JSON: ${report.jsonPath}`,
    `- Markdown: ${report.markdownPath}`
  ].join("\n");
}

async function main() {
  const generatedAt = iso();
  const runStamp = stamp();
  const spine = await readJson(path.join(projectRoot, "PROJECT_SPINE.json"), {});
  const dag = await readJson(path.join(projectRoot, "DAG_MASTER.json"), {});
  const scopeLedger = await readJson(path.join(projectRoot, "project-scope-expansions.json"), { steps: [] });
  const position = await readJson(path.join(projectRoot, "project-position.json"), {});
  const thread = await readText(path.join(projectRoot, "THREAD.md"), "");
  const spineSteps = Array.isArray(spine.steps) ? spine.steps : [];
  const doneCount = spineSteps.filter((step) => doneStatus(step.status)).length;
  const nextStep = spineSteps.find((step) => !doneStatus(step.status)) || null;
  const dagNodes = Array.isArray(dag.nodes) ? dag.nodes : [];
  const scopeSteps = Array.isArray(scopeLedger.steps) ? scopeLedger.steps : [];
  const liveByKey = new Map(spineSteps.map((step) => [step.key, step]));
  const dynamicScope = scopeSteps.map((step) => {
    const live = liveByKey.get(step.key) || {};
    return {
      ...step,
      ...live,
      sourceText: step.sourceText || live.sourceText || "",
      liveStatus: live.status || step.status || "QUEUED"
    };
  });
  const completeNodes = dagNodes.filter((node) => doneStatus(node.status)).length;
  const currentNode = dagNodes.find((node) => !doneStatus(node.status) && node.status !== "blocked") || null;
  const gates = decisionGateStatus(dagNodes, dynamicScope);
  const latestReceipts = await latestFiles(receiptsRoot, (name) => /\.(md|json)$/i.test(name), 10);
  const latestLocalGate = (await latestFiles(receiptsRoot, (name) => name.startsWith("blueb0x-local-gates-") && name.endsWith(".md"), 1))[0] || null;
  const latestKnowledge = (await latestFiles(receiptsRoot, (name) => name.startsWith("orangebox-knowledge-") && name.endsWith(".json"), 1))[0] || null;
  const missing = [];
  if (!spineSteps.length) missing.push("PROJECT_SPINE.json has no steps.");
  if (!dagNodes.length) missing.push("DAG_MASTER.json has no nodes.");
  if (!latestLocalGate) missing.push("No local gates receipt found.");
  const markdownPath = path.join(projectRoot, "CONTINUITY_PACKET.md");
  const jsonPath = path.join(continuityRoot, `${project}-continuity-${runStamp}.json`);
  const report = {
    status: missing.length ? "READY_WITH_GAPS" : "VERIFIED",
    generatedAt,
    project,
    position,
    spine: {
      count: spineSteps.length,
      doneCount,
      percent: spineSteps.length ? Math.round((doneCount / spineSteps.length) * 100) : 0,
      nextStep
    },
    dag: {
      totalNodes: dagNodes.length,
      completeNodes,
      percent: dag?.progress?.percent ?? (dagNodes.length ? Math.round((completeNodes / dagNodes.length) * 100) : 0),
      currentNode
    },
    activeFiles: [
      { label: "command app", path: "C:/AtomEons/aeskills/orangebox-command" },
      { label: "data root", path: orangeRoot },
      { label: "thread", path: path.join(projectRoot, "THREAD.md") },
      { label: "spine", path: path.join(projectRoot, "PROJECT_SPINE.md") },
      { label: "dag", path: path.join(projectRoot, "DAG_MASTER.json") },
      { label: "scope ledger", path: path.join(projectRoot, "project-scope-expansions.json") },
      { label: "knowledge", path: path.join(orangeRoot, "memory", "orangebox-knowledge") }
    ],
    scopeLedger: {
      total: dynamicScope.length,
      verified: dynamicScope.filter((step) => doneStatus(step.liveStatus || step.status)).length,
      queued: dynamicScope.filter((step) => !doneStatus(step.liveStatus || step.status)).length,
      steps: dynamicScope
    },
    decisionGates: gates,
    nextActions: [
      gates.status !== "AUTONOMOUS_READY" ? gates.nextAction : null,
      nextStep ? `Advance spine ${nextStep.id}: ${nextStep.title}` : "Create or refresh the project spine.",
      currentNode ? `Advance DAG ${currentNode.node_id || currentNode.id}: ${currentNode.node_name || currentNode.title || "current node"}` : "Refresh DAG current node.",
      "Run Local Gates after UI/API changes.",
      "Run visual proof before calling UI work ready.",
      "Write receipts for every promoted change."
    ].filter(Boolean),
    missing,
    latestLocalGate,
    latestKnowledge,
    latestReceipts,
    recentThread: compactThread(thread),
    jsonPath,
    markdownPath
  };
  const markdown = renderMarkdown(report);
  report.markdown = markdown;
  await writeText(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeText(markdownPath, markdown);
  console.log(JSON.stringify({
    status: report.status,
    project,
    spine: report.spine,
    dag: report.dag,
    decisionGates: report.decisionGates,
    missing,
    jsonPath,
    markdownPath,
    estimatedTokens: Math.ceil(markdown.length / 4)
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
