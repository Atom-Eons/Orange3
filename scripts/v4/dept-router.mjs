/* dept-router.mjs - deterministic ORANGEBOX Department OS route packets.
 *
 * This is the PM/router layer for AE See-Suite / AE Operations. It does not call models and it
 * does not claim proof. It turns an operator goal into a bounded department
 * lineup, trust posture, review gates, receipt obligations, and route file.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import {
  DEPARTMENTS,
  DEPT_OS_VERSION,
  REVIEW_IDENTITIES,
  TRUST_TIERS,
  getDepartment,
  registrySummary,
} from "./dept-registry.mjs";
import { trustSummary } from "./trust-ledger.mjs";

export const DEPT_ROUTER_VERSION = "orangebox-dept-router/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function routeId(goal, date = new Date()) {
  const digest = crypto.createHash("sha256").update(String(goal || "") + date.toISOString()).digest("hex").slice(0, 10);
  return `obx-route-${stampForFile(date)}-${digest}`;
}

function routeDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "dept-os", "routes");
}

export function routePath(id, dataRoot = defaultDataRoot()) {
  return path.join(routeDir(dataRoot), `${id}.json`);
}

function compactGoal(goal) {
  return String(goal || "").replace(/\s+/g, " ").trim();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text, term) {
  const key = String(term || "").toLowerCase();
  if (!key) return false;
  if (key.includes(" ")) return text.includes(key);
  return new RegExp(`(^|[^a-z0-9+#.-])${escapeRegex(key)}([^a-z0-9+#.-]|$)`, "i").test(text);
}

function hasAny(text, terms) {
  return terms.some((term) => containsTerm(text, term));
}

function wordish(text) {
  return new Set(String(text || "").toLowerCase().split(/[^a-z0-9+#.-]+/).filter(Boolean));
}

function scoreDepartment(goalText, tokens, dept) {
  let score = 0;
  const hits = [];
  for (const keyword of dept.keywords || []) {
    const key = String(keyword).toLowerCase();
    if (!key) continue;
    if (key.includes(" ")) {
      if (goalText.includes(key)) {
        score += 5;
        hits.push(key);
      }
    } else if (tokens.has(key)) {
      score += 3;
      hits.push(key);
    }
  }
  return { dept, score, hits };
}

function forcedDepartments(goalText) {
  const forced = new Map();
  const add = (id, reason, bonus = 20) => {
    const existing = forced.get(id);
    forced.set(id, { reason: existing ? `${existing.reason}; ${reason}` : reason, bonus: Math.max(existing?.bonus || 0, bonus) });
  };

  add("AE0", "PM brain coordinates every ORANGEBOX route", 12);
  if (hasAny(goalText, ["code", "implement", "build", "api", "route", "script", "compile", "bug", "fix", "patch", "cargo", "npm"])) add("AE6", "implementation or API/code work detected");
  if (hasAny(goalText, ["doctor", "test", "tests", "proof", "prove", "verify", "checks", "benchmark", "receipt", "receipts", "gate", "green"])) add("AE14", "proof or verification gate detected");
  if (hasAny(goalText, ["design", "ui", "ux", "luxury", "motion", "visual", "canvas", "telemetry", "egui", "lips"])) add("AE3", "experience or visual quality work detected");
  if (hasAny(goalText, ["automation", "automate", "n8n", "queue", "retry", "schedule", "watchdog", "background", "job"])) add("AE13", "automation or retry/job system detected");
  if (hasAny(goalText, ["memory", "continuity", "backup", "restore", "runtime", "logs", "reboot", "heartbeat"])) add("AE10", "ops, memory, or continuity concern detected");
  if (hasAny(goalText, ["security", "secret", "token", "auth", "permission", "destructive", "delete", "vault", "cyber"])) add("AE11", "security or destructive-action risk detected");
  if (hasAny(goalText, ["legal", "license", "privacy", "copyright", "compliance", "terms", "rights", "policy"])) add("AE9", "legal/privacy/claims concern detected");
  if (hasAny(goalText, ["ship", "release", "portable", "installer", "deploy", "launch"])) add("AE8", "release or packaging concern detected");
  if (hasAny(goalText, ["schema", "database", "ledger", "state", "migration", "json", "data"])) add("AE12", "data/state/schema concern detected");
  if (hasAny(goalText, ["research", "source", "evidence", "current", "docs", "learn", "citation"])) add("AE2", "research/evidence concern detected");
  if (hasAny(goalText, ["product", "scope", "feature", "acceptance", "workflow", "done"])) add("AE1", "product/scope concern detected");
  if (hasAny(goalText, ["marketing", "copy", "position", "brand", "campaign", "ads"])) add("AE4", "marketing/positioning concern detected");
  if (hasAny(goalText, ["sales", "pricing", "offer", "buyer", "checkout", "conversion"])) add("AE5", "sales/offer concern detected");
  return forced;
}

function inferRisk(goalText, selectedIds) {
  const highTerms = ["delete", "destructive", "production", "prod deploy", "secret", "token", "payment", "billing", "bank", "private crawling", "paid api"];
  const medTerms = ["deploy", "auth", "vault", "credential", "backup", "automation", "mcp", "connector", "security"];
  const high = hasAny(goalText, highTerms) || selectedIds.includes("AE11");
  const medium = high || hasAny(goalText, medTerms) || selectedIds.includes("AE13") || selectedIds.includes("AE8");
  const risk = high ? "high" : medium ? "medium" : "low";
  return {
    level: risk,
    triggers: [
      ...highTerms.filter((term) => goalText.includes(term)),
      ...medTerms.filter((term) => goalText.includes(term)),
    ],
  };
}

function reviewGates(selectedIds, riskLevel) {
  const gates = new Set(["CHECKMATE", "ORANGE"]);
  if (selectedIds.includes("AE3") || selectedIds.includes("AE4")) gates.add("LIPS");
  if (selectedIds.includes("AE7") || riskLevel !== "low") gates.add("MIRRORS");
  if (selectedIds.includes("AE11")) gates.add("CHECKMATE");
  return [...gates].map((id) => REVIEW_IDENTITIES.find((item) => item.id === id)).filter(Boolean);
}

function buildCoordinationProfile(departments, gates, risk) {
  const ids = departments.map((dept) => dept.id);
  const lead = ids.includes("AE0") ? "AE0" : departments[0]?.id || "AE0";
  const reviewers = gates.map((gate) => gate.id);
  const specialists = ids.filter((id) => id !== lead && id !== "AE14");
  return {
    version: "orangebox-coordination-profile/v1",
    topology: specialists.length > 2 ? "lead-specialist-review" : "lead-pair-review",
    lead_lane: lead,
    specialist_lanes: specialists,
    review_lanes: reviewers,
    dissent_lane: reviewers.includes("MIRRORS") ? "MIRRORS" : "CHECKMATE",
    sovereignty_check: {
      required: risk.level !== "low" || specialists.length >= 3,
      rule: "Reviewer lanes must preserve independent objections before convergence.",
      evidence: "route receipt must list unresolved dissent or state none observed",
    },
    arbitration_rule: risk.level === "high"
      ? "operator approval required before mutation, external write, spend, deploy, or destructive action"
      : "AE0 resolves routine tradeoffs; CHECKMATE can block green claims",
    escalation_rule: "escalate to operator only for blocked approval lines, missing sources, destructive risk, paid/API spend, or contradictory proof",
    proof_owner: ids.includes("AE14") ? "AE14" : "CHECKMATE",
  };
}

function buildClarificationPolicy(goalText, risk) {
  const needsGoalClarification = hasAny(goalText, ["maybe", "something", "whatever", "unclear", "not sure"]);
  const needsInputClarification = hasAny(goalText, ["upload", "file", "secret", "credential", "account", "browser", "colab"]);
  return {
    version: "orangebox-clarification-policy/v1",
    state: needsGoalClarification ? "needs_early_goal_clarification" : "proceed_with_assumptions",
    goal_clarification_window: "before macro-action:patch",
    input_clarification_window: "valid until 50% route execution or first irreversible action",
    late_clarification_rule: "late questions require blocker evidence; otherwise log assumptions and continue",
    ask_now: needsGoalClarification || (risk.level === "high" && needsInputClarification),
    blocked_questions: [],
    assumptions: [
      "No paid APIs, production deploys, model downloads, destructive cleanup, or external writes unless explicitly approved.",
      "Candidate research is advisory until verified, implemented, and receipted.",
      "ORANGEBOX is the AE See-Suite / AE Operations PM layer and does not absorb independent product engines.",
    ],
  };
}

function roleFor(deptId) {
  const roles = {
    AE0: "route owner and mission control",
    AE1: "product contract and acceptance criteria",
    AE2: "source and evidence scout",
    AE3: "UX/taste/motion authority",
    AE4: "positioning and launch language",
    AE5: "offer and buyer-value pressure",
    AE6: "implementation owner",
    AE7: "senior review and reality pressure",
    AE8: "release and smoke owner",
    AE9: "legal/privacy/claims advisor",
    AE10: "ops, continuity, and restore owner",
    AE11: "security and permission gate",
    AE12: "state/schema owner",
    AE13: "automation and retry owner",
    AE14: "doctor/proof/checkmate owner",
  };
  return roles[deptId] || "department contributor";
}

function packetFor(dept, riskLevel) {
  const base = {
    dept_id: dept.id,
    name: dept.name,
    role: roleFor(dept.id),
    objective: `${dept.name} handles ${dept.owns}.`,
    acceptance_criteria: [
      "Output is tied to the operator goal.",
      "Claims are separated from verified evidence.",
      "Rollback or next action is explicit.",
    ],
    evidence_required: [
      "touched files or state paths when mutation occurs",
      "commands or route endpoints actually exercised",
      "receipt path or reason no receipt was needed",
    ],
    rollback_line: "Do not delete or revert unrelated operator work; name the rollback path before risky mutation.",
  };
  if (dept.id === "AE6") base.acceptance_criteria.push("Code path runs through syntax checks or a doctor.");
  if (dept.id === "AE14") base.acceptance_criteria.push("Final green requires explicit pass/fail evidence.");
  if (dept.id === "AE11") base.acceptance_criteria.push("Secrets, auth, destructive actions, and supply-chain changes are gated.");
  if (dept.id === "AE3") base.acceptance_criteria.push("Visual changes must be observable in AE See-Suite or screenshot/browser proof.");
  if (riskLevel !== "low") base.evidence_required.push("human approval line for deploy, destructive, spend, or external write actions");
  return base;
}

async function writeRouteFile(route, dataRoot) {
  await fs.mkdir(routeDir(dataRoot), { recursive: true });
  const file = routePath(route.route_id, dataRoot);
  await fs.writeFile(file, JSON.stringify(route, null, 2) + "\n", "utf8");
  return file;
}

async function writeRepoReceipt(route, receiptDir = path.join(ROOT, "receipts")) {
  await fs.mkdir(receiptDir, { recursive: true });
  const file = path.join(receiptDir, `orangebox-dept-route-${stampForFile()}.json`);
  const receipt = {
    ok: true,
    source: "orangebox-department-os",
    title: "Department OS route packet",
    summary: `route ${route.route_id}: ${route.goal.slice(0, 140)}`,
    route_id: route.route_id,
    primary_dept: route.primary_dept,
    active_departments: route.departments.map((dept) => dept.id),
    review_gates: route.review_gates.map((gate) => gate.id),
    approval_required: route.approval_required,
    route_file: route.route_file || null,
    evidence: route,
    created_at: new Date().toISOString(),
  };
  await fs.writeFile(file, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return file;
}

export async function routeGoal({
  goal,
  project = "orangebox",
  dataRoot = defaultDataRoot(),
  maxDepartments = 5,
  writeRoute = false,
  writeReceipt = false,
  receiptDir = path.join(ROOT, "receipts"),
  emitReceipt = null,
  postPartyLine = null,
} = {}) {
  const cleanGoal = compactGoal(goal);
  if (!cleanGoal) throw new Error("goal is required");

  const tokens = wordish(cleanGoal);
  const goalText = cleanGoal.toLowerCase();
  const forced = forcedDepartments(goalText);
  const scored = DEPARTMENTS.map((dept) => {
    const row = scoreDepartment(goalText, tokens, dept);
    if (forced.has(dept.id)) {
      row.score += forced.get(dept.id).bonus;
      row.hits.push(forced.get(dept.id).reason);
    }
    return row;
  }).filter((row) => row.score > 0);

  scored.sort((a, b) => b.score - a.score || a.dept.id.localeCompare(b.dept.id));
  const selected = [];
  const seen = new Set();
  for (const row of scored) {
    if (selected.length >= maxDepartments) break;
    if (seen.has(row.dept.id)) continue;
    selected.push(row);
    seen.add(row.dept.id);
  }
  if (!seen.has("AE0")) {
    const ae0 = getDepartment("AE0");
    selected.unshift({ dept: ae0, score: 12, hits: ["PM brain coordinates every ORANGEBOX route"] });
    seen.add("AE0");
    if (selected.length > maxDepartments) selected.pop();
  }

  const selectedIds = selected.map((row) => row.dept.id);
  const risk = inferRisk(goalText, selectedIds);
  const trust = await trustSummary({ dataRoot });
  const routeCreatedAt = new Date();
  const id = routeId(cleanGoal, routeCreatedAt);

  const departments = selected.map((row, index) => {
    const trustEntry = trust.departments[row.dept.id] || { current_tier: "T-Advisor" };
    const trustSpec = TRUST_TIERS[trustEntry.current_tier] || TRUST_TIERS["T-Advisor"];
    return {
      id: row.dept.id,
      name: row.dept.name,
      role: index === 0 ? "primary" : "support",
      route_role: roleFor(row.dept.id),
      lane: row.dept.lane,
      owns: row.dept.owns,
      score: row.score,
      matched_signals: row.hits,
      model_lane: row.dept.default_model_lane,
      trust_tier: trustEntry.current_tier,
      trust_ceiling: row.dept.trust_ceiling,
      can_mutate: !!trustSpec.can_mutate,
      can_spend_usd: Number(trustSpec.can_spend_usd || 0),
      outputs: row.dept.outputs,
    };
  });

  const gates = reviewGates(selectedIds, risk.level);
  const coordinationProfile = buildCoordinationProfile(departments, gates, risk);
  const clarificationPolicy = buildClarificationPolicy(goalText, risk);
  const approvalRequired = risk.level === "high" || scored.length > maxDepartments || departments.some((dept) => dept.can_spend_usd > 0.5);
  const route = {
    ok: true,
    version: DEPT_ROUTER_VERSION,
    dept_os_version: DEPT_OS_VERSION,
    route_id: id,
    project,
    goal: cleanGoal,
    created_at: routeCreatedAt.toISOString(),
    primary_dept: departments[0]?.id || null,
    active_department_count: departments.length,
    overflow_department_count: Math.max(0, scored.length - departments.length),
    approval_required: approvalRequired,
    approval_reasons: [
      ...(risk.level === "high" ? ["high-risk route"] : []),
      ...(scored.length > maxDepartments ? [`${scored.length} departments matched; capped at ${maxDepartments}`] : []),
      ...(departments.some((dept) => dept.can_spend_usd > 0.5) ? ["department trust tier allows spend above default cap"] : []),
    ],
    risk,
    departments,
    review_gates: gates,
    coordination_profile: coordinationProfile,
    clarification_policy: clarificationPolicy,
    packets: departments.map((dept) => packetFor(getDepartment(dept.id), risk.level)),
    budget_guard: {
      max_departments_without_approval: maxDepartments,
      estimated_internal_cost_usd: 0,
      external_spend_allowed_without_operator: false,
      paid_api_allowed_without_operator: false,
    },
    route_law: registrySummary().routing_law,
    route_file: null,
    receipt: null,
    party_line_message: null,
  };

  if (writeRoute) route.route_file = await writeRouteFile(route, dataRoot);

  if (postPartyLine) {
    const line = `Department route ${route.route_id}: primary ${route.primary_dept}, active ${departments.map((dept) => dept.id).join(", ")}, gates ${gates.map((gate) => gate.id).join(", ")}`;
    route.party_line_message = await postPartyLine(line);
  }

  if (emitReceipt) {
    route.receipt = await emitReceipt({
      source: "orangebox-department-os",
      title: "Department OS route packet",
      summary: `${route.primary_dept || "AE0"} route for ${cleanGoal.slice(0, 120)}`,
      evidence: {
        route_id: route.route_id,
        route_file: route.route_file,
        active_departments: departments.map((dept) => dept.id),
        review_gates: gates.map((gate) => gate.id),
        approval_required: route.approval_required,
        risk: route.risk,
      },
    });
  } else if (writeReceipt) {
    route.receipt = { path: await writeRepoReceipt(route, receiptDir) };
  }

  return route;
}
