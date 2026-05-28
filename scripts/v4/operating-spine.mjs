#!/usr/bin/env node
/* operating-spine.mjs - ORANGEBOX route spine.
 *
 * The operating spine is the API/CLI/AE See-Suite handoff object. It wraps the
 * Department OS route with macro-actions, coordination, clarification, model
 * lane, proof gates, rollback, and Claude Code export guidance.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { routeGoal } from "./dept-router.mjs";

export const OPERATING_SPINE_VERSION = "orangebox-operating-spine/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

export const MACRO_ACTIONS = [
  {
    id: "inspect",
    label: "Inspect",
    purpose: "Read current files, receipts, API contracts, and project state before choosing edits.",
    default_owner: "AE0",
    proof: "repo/status/source evidence is captured before mutation",
  },
  {
    id: "scope",
    label: "Scope",
    purpose: "Lock objective, constraints, acceptance criteria, non-goals, and approval lines.",
    default_owner: "AE1",
    proof: "route packet names assumptions and approval boundaries",
  },
  {
    id: "route",
    label: "Route",
    purpose: "Assign lead, specialists, reviewers, dissent lane, model lane, and proof gate.",
    default_owner: "AE0",
    proof: "Department OS route and coordination profile exist",
  },
  {
    id: "patch",
    label: "Patch",
    purpose: "Apply the smallest coherent implementation set while preserving user work.",
    default_owner: "AE6",
    proof: "touched files are known and unrelated changes are not reverted",
  },
  {
    id: "verify",
    label: "Verify",
    purpose: "Run syntax, doctors, API smoke, browser/native proof, and route-specific gates.",
    default_owner: "AE14",
    proof: "commands and pass/fail outputs are recorded",
  },
  {
    id: "package",
    label: "Package",
    purpose: "Refresh portable or release artifacts only when the changed surface requires it.",
    default_owner: "AE8",
    proof: "manifest, hashes, and package doctor are present",
  },
  {
    id: "receipt",
    label: "Receipt",
    purpose: "Write evidence with touched files, commands, assumptions, residual risk, and rollback.",
    default_owner: "AE14",
    proof: "receipt path is present",
  },
  {
    id: "promote",
    label: "Promote",
    purpose: "Move work from candidate to accepted only after proof gates and rollback data exist.",
    default_owner: "ORANGE",
    proof: "promotion criteria are explicit; no fake green",
  },
];

export const MODEL_PROFILES = [
  {
    id: "codex-execution",
    label: "Codex execution lane",
    owner: "codex",
    use_when: "local file edits, commands, tests, receipts, package proof, rollback evidence",
    default_effort: "medium",
    constraints: ["do not fake green", "do not revert unrelated user work", "use project doctors"],
  },
  {
    id: "claude-code-deep",
    label: "Claude Code / Opus deep synthesis lane",
    owner: "claude-code",
    use_when: "large repo understanding, architecture synthesis, handoff compression, long-context review",
    default_effort: "configurable",
    constraints: ["export route packet first", "keep execution gated through ORANGEBOX receipts"],
  },
  {
    id: "local-worker",
    label: "Local worker lane",
    owner: "local-model",
    use_when: "read-only extraction, low-risk summarization, cheap repeated transforms",
    default_effort: "low",
    constraints: ["no promotion without Checkmate proof", "keep provenance visible"],
  },
];

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function compactGoal(goal) {
  return String(goal || "").replace(/\s+/g, " ").trim();
}

function spineId(objective, date = new Date()) {
  const digest = crypto.createHash("sha256").update(`${objective}\n${date.toISOString()}`).digest("hex").slice(0, 10);
  return `obx-spine-${stampForFile(date)}-${digest}`;
}

function routeDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "operating-spine", "routes");
}

function exportDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "operating-spine", "exports");
}

function macroPlan(deptRoute) {
  const active = new Set((deptRoute.departments || []).map((dept) => dept.id));
  return MACRO_ACTIONS.map((action, index) => {
    let owner = action.default_owner;
    if (action.id === "patch" && !active.has("AE6")) owner = deptRoute.primary_dept || "AE0";
    if (action.id === "package" && !active.has("AE8")) owner = "AE8-on-demand";
    return {
      ...action,
      order: index + 1,
      owner,
      status: index < 3 ? "ready" : "pending",
    };
  });
}

function proofGates(deptRoute) {
  const gates = [
    {
      id: "api-doctor",
      label: "OpenAPI contract doctor",
      command: "node scripts/obx.mjs api doctor --json --receipt",
      required: true,
    },
    {
      id: "route-doctor",
      label: "Operating spine route doctor",
      command: "node scripts/obx.mjs route doctor --json --receipt",
      required: true,
    },
    {
      id: "dept-doctor",
      label: "Department OS doctor",
      command: "node scripts/obx.mjs dept doctor --json --receipt",
      required: true,
    },
    {
      id: "mcp-doctor",
      label: "MCP bridge doctor",
      command: "node scripts/obx.mjs mcp doctor --json --receipt",
      required: true,
    },
  ];
  if ((deptRoute.departments || []).some((dept) => dept.id === "AE3")) {
    gates.push({
      id: "browser-visual-proof",
      label: "AE See-Suite browser/native visual proof",
      command: "run local browser screenshot after UI mutation",
      required: true,
    });
  }
  if ((deptRoute.departments || []).some((dept) => dept.id === "AE8")) {
    gates.push({
      id: "alpha7-full-doctor",
      label: "Alpha.7 full doctor",
      command: "node scripts/obx.mjs silent-canvas alpha7-doctor --full --json --receipt",
      required: true,
    });
  }
  return gates;
}

function modelLane(deptRoute) {
  const hasUx = (deptRoute.departments || []).some((dept) => dept.id === "AE3");
  const hasEngineering = (deptRoute.departments || []).some((dept) => dept.id === "AE6");
  const hasResearch = (deptRoute.departments || []).some((dept) => dept.id === "AE2");
  const profile = hasEngineering ? "codex-execution" : hasResearch || hasUx ? "claude-code-deep" : "codex-execution";
  return {
    primary_profile: profile,
    available_profiles: MODEL_PROFILES,
    routing_note: "Codex owns execution and proof; Claude Code owns deep synthesis/handoff when exported.",
  };
}

function rollbackPath(route) {
  return {
    principle: "never revert unrelated operator work",
    git: "inspect `git diff -- <touched-file>` and reverse only the current route's changes if needed",
    files: [
      route.route_file || null,
      "receipts/orangebox-operating-spine-*.json",
    ].filter(Boolean),
    state: "route files are additive under operating-spine/routes and can be ignored or superseded by a later route",
  };
}

async function writeSpineRoute(route, dataRoot) {
  await fs.mkdir(routeDir(dataRoot), { recursive: true });
  const file = path.join(routeDir(dataRoot), `${route.route_id}.json`);
  route.route_file = file;
  await fs.writeFile(file, JSON.stringify(route, null, 2) + "\n", "utf8");
  return file;
}

async function writeRepoReceipt(route, receiptDir = path.join(ROOT, "receipts")) {
  await fs.mkdir(receiptDir, { recursive: true });
  const stamp = stampForFile();
  const file = path.join(receiptDir, `orangebox-operating-spine-${stamp}.json`);
  const receipt = {
    ok: true,
    source: "orangebox-operating-spine",
    title: "Operating spine route packet",
    summary: `${route.route_id}: ${route.objective.slice(0, 160)}`,
    route_id: route.route_id,
    route_file: route.route_file,
    macro_actions: route.macro_actions.map((action) => action.id),
    coordination_profile: route.coordination_profile,
    clarification_policy: route.clarification_policy,
    proof_gates: route.proof_gates.map((gate) => gate.id),
    created_at: new Date().toISOString(),
    evidence: route,
  };
  await fs.writeFile(file, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  route.receipt_id = `orangebox-operating-spine-${stamp}`;
  route.receipt = { path: file };
  return file;
}

export async function planOperatingRoute({
  objective,
  project = "orangebox",
  dataRoot = defaultDataRoot(),
  maxDepartments = 6,
  writeRoute = false,
  writeReceipt = false,
  receiptDir = path.join(ROOT, "receipts"),
  emitReceipt = null,
} = {}) {
  const cleanObjective = compactGoal(objective);
  if (!cleanObjective) throw new Error("objective is required");
  const created = new Date();
  const deptRoute = await routeGoal({
    goal: cleanObjective,
    project,
    dataRoot,
    maxDepartments,
    writeRoute,
    writeReceipt: false,
  });
  const route = {
    ok: true,
    version: OPERATING_SPINE_VERSION,
    route_id: spineId(cleanObjective, created),
    objective: cleanObjective,
    project,
    created_at: created.toISOString(),
    source: "operator_goal",
    macro_actions: macroPlan(deptRoute),
    department_route: deptRoute,
    department_route_id: deptRoute.route_id,
    coordination_profile: deptRoute.coordination_profile,
    clarification_policy: deptRoute.clarification_policy,
    model_lane: modelLane(deptRoute),
    proof_gates: proofGates(deptRoute),
    rollback_path: null,
    route_file: null,
    receipt_id: null,
    receipt: null,
    candidate_intel_policy: {
      status: "advisory_only",
      rule: "Research and Grok inputs can inspire backlog pressure, but do not become project law until verified, implemented, and receipted.",
    },
  };
  route.rollback_path = rollbackPath(route);
  if (writeRoute) await writeSpineRoute(route, dataRoot);
  if (emitReceipt) {
    route.receipt = await emitReceipt({
      source: "orangebox-operating-spine",
      title: "Operating spine route packet",
      summary: `${route.route_id}: ${cleanObjective.slice(0, 160)}`,
      evidence: {
        route_id: route.route_id,
        route_file: route.route_file,
        macro_actions: route.macro_actions.map((action) => action.id),
        department_route_id: route.department_route_id,
        proof_gates: route.proof_gates.map((gate) => gate.id),
      },
    });
    route.receipt_id = route.receipt?.id || null;
  } else if (writeReceipt) {
    await writeRepoReceipt(route, receiptDir);
  }
  return route;
}

export function listModelProfiles() {
  return {
    ok: true,
    version: OPERATING_SPINE_VERSION,
    profiles: MODEL_PROFILES,
  };
}

export async function exportClaudeRoute({
  objective,
  route = null,
  project = "orangebox",
  dataRoot = defaultDataRoot(),
  writeFile = false,
  writeReceipt = false,
  receiptDir = path.join(ROOT, "receipts"),
} = {}) {
  const spine = route || await planOperatingRoute({
    objective,
    project,
    dataRoot,
    writeRoute: true,
    writeReceipt: false,
  });
  const packet = {
    ok: true,
    version: "orangebox-claude-route-export/v1",
    created_at: new Date().toISOString(),
    audience: "Claude Code / Opus",
    route_id: spine.route_id,
    objective: spine.objective,
    project: spine.project,
    operating_law: [
      "Use this packet as the route contract.",
      "Do not merge EIDOS or other product engines into ORANGEBOX.",
      "Codex owns execution, mutation, verification, receipts, and rollback evidence.",
      "Claude Code owns architecture, synthesis, compression, and deep repo understanding.",
      "Ask only when clarification value is high; otherwise log assumptions and proceed.",
      "No fake green: every completion claim needs tests, doctors, screenshots, receipts, or explicit proof.",
    ],
    gather_act_verify: {
      gather: spine.macro_actions.filter((action) => ["inspect", "scope", "route"].includes(action.id)),
      act: spine.macro_actions.filter((action) => ["patch", "package"].includes(action.id)),
      verify: spine.macro_actions.filter((action) => ["verify", "receipt", "promote"].includes(action.id)),
    },
    worktree_isolation_guidance: {
      default: "Use one isolated worktree or candidate workspace per parallel implementation lane.",
      rules: [
        "Do not let two workers write the same file set.",
        "Treat existing user changes as owned by the operator unless explicitly reassigned.",
        "Merge only after proof gates and rollback notes exist.",
      ],
    },
    sub_agent_delegation_guidance: {
      default: "Delegate only bounded, non-overlapping sidecar work with explicit file ownership and proof output.",
      specialist_lanes: spine.coordination_profile?.specialist_lanes || [],
      review_lane: spine.coordination_profile?.review_lane || "AE14",
      dissent_lane: spine.coordination_profile?.dissent_lane || "MIRRORS",
    },
    proof_checklist: [
      "node --check or native syntax check for touched executable files",
      "project doctors relevant to the route",
      "screenshot/browser/native proof for visible UI",
      "receipt path for every serious build or doctor step",
      "package manifest and hash when release artifacts change",
    ],
    rollback_checklist: [
      "name every touched file",
      "preserve previous package or manifest when packaging changes",
      "record recovery command or manual recovery step",
      "do not delete data, receipts, or operator files without explicit approval",
    ],
    coordination_profile: spine.coordination_profile,
    clarification_policy: spine.clarification_policy,
    model_lane: spine.model_lane,
    proof_gates: spine.proof_gates,
    rollback_path: spine.rollback_path,
    department_packets: spine.department_route?.packets || [],
    openapi_contract: "docs/api/orangebox-openapi.yaml",
  };
  if (writeFile) {
    await fs.mkdir(exportDir(dataRoot), { recursive: true });
    packet.export_path = path.join(exportDir(dataRoot), `${spine.route_id}-claude-export.json`);
    await fs.writeFile(packet.export_path, JSON.stringify(packet, null, 2) + "\n", "utf8");
  }
  if (writeReceipt) {
    await fs.mkdir(receiptDir, { recursive: true });
    const file = path.join(receiptDir, `orangebox-claude-route-export-${stampForFile()}.json`);
    await fs.writeFile(file, JSON.stringify({
      ok: true,
      source: "orangebox-claude-export",
      title: "Claude Code route export",
      summary: `${spine.route_id}: ${spine.objective.slice(0, 160)}`,
      evidence: packet,
      created_at: new Date().toISOString(),
    }, null, 2) + "\n", "utf8");
    packet.receipt_path = file;
  }
  return packet;
}

async function gate(name, fn, { required = true } = {}) {
  const started = Date.now();
  try {
    const evidence = await fn();
    const ok = evidence?.ok !== false;
    return {
      name,
      required,
      ok,
      status: ok ? "pass" : (required ? "fail" : "warning"),
      duration_ms: Date.now() - started,
      evidence,
    };
  } catch (err) {
    return {
      name,
      required,
      ok: false,
      status: required ? "fail" : "warning",
      duration_ms: Date.now() - started,
      error: err?.message || String(err),
    };
  }
}

async function sourceProbe() {
  const files = [
    path.join(ROOT, "scripts", "obx.mjs"),
    path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs"),
    path.join(ROOT, "scripts", "v4", "route-state.mjs"),
    path.join(ROOT, "scripts", "v4", "proof-gates.mjs"),
    path.join(ROOT, "scripts", "v4", "route-package.mjs"),
    path.join(ROOT, "src", "v4", "index.html"),
    path.join(ROOT, "src", "v4", "see-suite.js"),
    path.join(ROOT, "src", "v4", "see-suite.css"),
  ];
  const [cli, routes, routeState, proofGates, routePackage, index, js, css] = await Promise.all(files.map((file) => fs.readFile(file, "utf8").catch(() => "")));
  const required = {
    cli: ["async function cmdRoute", "async function cmdClaude", "obx route plan", "obx route current", "obx route history", "obx route show", "obx route replay", "obx route artifact", "obx route progress", "obx route verify-gates", "obx route package", "obx route receipt", "obx route promote", "obx route state-doctor", "obx claude export-route"],
    routes: ["/api/v4/route/plan", "/api/v4/route/current", "/api/v4/route/rail", "/api/v4/route/history", "/api/v4/route/detail", "/api/v4/route/replay", "/api/v4/route/artifact", "/api/v4/route/progress", "/api/v4/route/verify-gates", "/api/v4/route/package", "/api/v4/route/receipt", "/api/v4/route/promote", "/api/v4/route/state-doctor", "/api/v4/route/doctor", "/api/v4/claude/export-route"],
    routeState: ["ROUTE_STATE_VERSION", "saveCurrentRoute", "loadCurrentRoute", "loadRouteHistory", "loadRouteDetail", "loadRouteReplay", "loadRouteArtifact", "updateCurrentRouteProgress", "completeCurrentRoute", "runRouteStateDoctor"],
    proofGates: ["PROOF_GATES_VERSION", "runCurrentRouteProofGates", "proof gate command is outside allow-list"],
    routePackage: ["ROUTE_PACKAGE_VERSION", "packageCurrentRoute", "synthesizeRouteReceipt", "promoteCurrentRoute"],
    index: ["missionSpinePanel", "missionObjectiveInput", "missionMacroList", "missionCoordinationList", "missionHistoryList"],
    js: ["routeState", "function renderMissionSpine", "function refreshMissionSpineCurrent", "function refreshMissionRouteReplay", "function refreshMissionRouteArtifact", "function verifyMissionProofGates", "function runMissionRouteAction", "/api/v4/route/plan", "/api/v4/route/current", "/api/v4/route/history", "/api/v4/route/replay", "/api/v4/route/artifact", "/api/v4/route/rail", "/api/v4/route/doctor"],
    css: [".mission-spine-panel", ".mission-macro-list", ".mission-coordination-list", ".mission-history-list", ".now-route-card"],
  };
  const src = { cli, routes, routeState, proofGates, routePackage, index, js, css };
  const missing = Object.fromEntries(Object.entries(required).map(([key, snippets]) => [
    key,
    snippets.filter((snippet) => !src[key].includes(snippet)),
  ]));
  const missingTotal = Object.values(missing).reduce((sum, list) => sum + list.length, 0);
  return { ok: missingTotal === 0, files, missing };
}

async function writeDoctorReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-route-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runRouteDoctor({ writeReceipt = false, keepTemp = false } = {}) {
  const dataRoot = path.join(os.tmpdir(), `obx-route-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
  await fs.mkdir(dataRoot, { recursive: true });
  const checks = [];
  checks.push(await gate("macro_actions_shape", async () => ({
    ok: MACRO_ACTIONS.length === 8 && MACRO_ACTIONS.every((action) => action.id && action.proof),
    macro_actions: MACRO_ACTIONS.map((action) => action.id),
  })));
  checks.push(await gate("operating_route_packet", async () => {
    const route = await planOperatingRoute({
      objective: "Build ORANGEBOX operating spine, luxury AE See-Suite UX, OpenAPI contract, MCP code mode, Claude export, and proof doctors.",
      project: "orangebox-doctor",
      dataRoot,
      writeRoute: true,
    });
    const routeFileExists = !!(await fs.stat(route.route_file).catch(() => null));
    return {
      ok: route.ok
        && routeFileExists
        && route.macro_actions.length === 8
        && route.coordination_profile?.dissent_lane
        && route.clarification_policy?.late_clarification_rule
        && route.proof_gates.some((gateItem) => gateItem.id === "api-doctor"),
      route_id: route.route_id,
      route_file: route.route_file,
      macro_actions: route.macro_actions.map((action) => action.id),
      coordination_profile: route.coordination_profile,
      clarification_policy: route.clarification_policy,
      proof_gates: route.proof_gates.map((gateItem) => gateItem.id),
      route_file_exists: routeFileExists,
    };
  }));
  checks.push(await gate("claude_export_packet", async () => {
    const packet = await exportClaudeRoute({
      objective: "Prepare Claude Code handoff for the ORANGEBOX operating spine build.",
      project: "orangebox-doctor",
      dataRoot,
      writeFile: true,
    });
    const exportExists = !!(await fs.stat(packet.export_path).catch(() => null));
    return {
      ok: packet.ok
        && exportExists
        && packet.gather_act_verify?.gather?.length
        && packet.operating_law.some((line) => line.includes("No fake green")),
      export_path: packet.export_path,
      route_id: packet.route_id,
      export_exists: exportExists,
    };
  }));
  checks.push(await gate("see_suite_cli_api_source_probe", sourceProbe));

  const failures = checks.filter((check) => check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    version: "orangebox-route-doctor/v1",
    created_at: new Date().toISOString(),
    data_root: dataRoot,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: checks.filter((check) => !check.required && !check.ok).length,
    },
    checks,
    failures,
    receipt_path: null,
  };
  if (writeReceipt) result.receipt_path = await writeDoctorReceipt(result);
  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const writeReceipt = process.argv.includes("--receipt");
  const out = await runRouteDoctor({ writeReceipt });
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} operating spine checks`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
