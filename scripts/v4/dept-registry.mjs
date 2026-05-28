/* dept-registry.mjs - ORANGEBOX Department OS canonical registry.
 *
 * Departments are routing identities and proof obligations, not theater.
 * This registry gives the PM surface a stable contract for route packets,
 * trust limits, model lanes, gates, and department ownership.
 */

export const DEPT_OS_VERSION = "orangebox-department-os/v1";

export const DEPARTMENTS = [
  {
    id: "AE0",
    name: "Factory / PM",
    lane: "strategy",
    owns: "mission graph, routing, receipts, escalation law",
    default_model_lane: "opus-brain-or-sonnet-subscription",
    trust_ceiling: "T-Conditional",
    keywords: ["route", "plan", "scope", "pm", "mission", "orchestrate", "priority", "sequence", "receipt"],
    outputs: ["route decision", "acceptance criteria", "receipt obligations"],
  },
  {
    id: "AE1",
    name: "Product",
    lane: "strategy",
    owns: "objective, audience, scope, acceptance criteria",
    default_model_lane: "sonnet-subscription",
    trust_ceiling: "T-Autonomous",
    keywords: ["product", "scope", "ux flow", "acceptance", "user", "feature", "workflow", "done"],
    outputs: ["product brief", "acceptance criteria", "subtraction notes"],
  },
  {
    id: "AE2",
    name: "Research",
    lane: "strategy",
    owns: "source inventory, evidence synthesis, knowledge",
    default_model_lane: "gemini-or-perplexity-research",
    trust_ceiling: "T-Autonomous",
    keywords: ["research", "source", "evidence", "docs", "learn", "benchmark", "verify current", "citation"],
    outputs: ["source ledger", "evidence brief", "open questions"],
  },
  {
    id: "AE3",
    name: "Design / LIPS",
    lane: "experience",
    owns: "UX, taste, visual proof, motion, interface quality",
    default_model_lane: "sonnet-subscription-plus-v0-figma",
    trust_ceiling: "T-Conditional",
    keywords: ["design", "ui", "ux", "luxury", "motion", "glass", "canvas", "visual", "taste", "lips", "interface"],
    outputs: ["surface brief", "visual acceptance gates", "motion notes"],
  },
  {
    id: "AE4",
    name: "Marketing",
    lane: "strategy",
    owns: "positioning, copy, launch messaging",
    default_model_lane: "sonnet-subscription",
    trust_ceiling: "T-Autonomous",
    keywords: ["marketing", "copy", "position", "launch", "seo", "brand", "campaign", "ad", "ads"],
    outputs: ["positioning", "launch copy", "channel notes"],
  },
  {
    id: "AE5",
    name: "Sales",
    lane: "strategy",
    owns: "offer model, buyer value, onboarding promise",
    default_model_lane: "sonnet-subscription",
    trust_ceiling: "T-Autonomous",
    keywords: ["sales", "pricing", "offer", "buyer", "checkout", "conversion", "onboarding", "deal"],
    outputs: ["offer brief", "objection map", "value proof"],
  },
  {
    id: "AE6",
    name: "Engineering",
    lane: "engineering",
    owns: "implementation, APIs, tests, builds, code quality",
    default_model_lane: "codex-cli-plus-sonnet-fallback",
    trust_ceiling: "T-Conditional",
    keywords: ["code", "implement", "build", "api", "route", "test", "script", "compile", "cargo", "npm", "fix", "bug"],
    outputs: ["patch plan", "touched files", "test commands", "rollback"],
  },
  {
    id: "AE7",
    name: "Review / Mirrors",
    lane: "review",
    owns: "review, reality contact, claim pressure",
    default_model_lane: "sonnet-routine-opus-ship-gate",
    trust_ceiling: "T-Conditional",
    keywords: ["review", "risk", "mirrors", "truth", "claim", "regression", "critique", "senior review"],
    outputs: ["findings", "open questions", "ship/no-ship pressure"],
  },
  {
    id: "AE8",
    name: "Launch",
    lane: "ops",
    owns: "release plan, smoke checks, installer/deploy handoff",
    default_model_lane: "sonnet-subscription-plus-n8n",
    trust_ceiling: "T-Conditional",
    keywords: ["release", "ship", "deploy", "portable", "installer", "smoke", "package", "solidify", "launch"],
    outputs: ["release checklist", "smoke proof", "rollback pack"],
  },
  {
    id: "AE9",
    name: "Legal",
    lane: "strategy",
    owns: "claims, licensing, privacy, data handling",
    default_model_lane: "sonnet-subscription",
    trust_ceiling: "T-Advisor",
    keywords: ["legal", "license", "privacy", "copyright", "terms", "claim", "compliance", "rights", "policy"],
    outputs: ["risk note", "claim language", "approval gates"],
  },
  {
    id: "AE10",
    name: "Ops + Memory",
    lane: "engineering",
    owns: "AI-box ops, continuity, logs, reliability",
    default_model_lane: "sonnet-subscription-plus-local-batch",
    trust_ceiling: "T-Conditional",
    keywords: ["ops", "memory", "continuity", "logs", "backup", "watchdog", "restore", "heartbeat", "reboot", "runtime"],
    outputs: ["ops plan", "continuity state", "restore/rollback"],
  },
  {
    id: "AE11",
    name: "Security",
    lane: "engineering",
    owns: "secrets, permissions, supply chain, destructive action risk",
    default_model_lane: "sonnet-sweep-opus-security-gate",
    trust_ceiling: "T-Conditional",
    keywords: ["security", "secret", "token", "permission", "auth", "supply chain", "destructive", "delete", "vault", "cyber"],
    outputs: ["security gate", "permission ruling", "secret-handling proof"],
  },
  {
    id: "AE12",
    name: "Data",
    lane: "engineering",
    owns: "stored state, schemas, memory contracts",
    default_model_lane: "sonnet-subscription-plus-local-batch",
    trust_ceiling: "T-Autonomous",
    keywords: ["data", "schema", "database", "analytics", "events", "ledger", "state", "migration", "json"],
    outputs: ["schema notes", "state contract", "migration risk"],
  },
  {
    id: "AE13",
    name: "Automation",
    lane: "ops",
    owns: "job queues, retries, n8n, idempotence",
    default_model_lane: "sonnet-subscription-plus-n8n",
    trust_ceiling: "T-Conditional",
    keywords: ["automation", "automate", "n8n", "queue", "retry", "schedule", "watchdog", "cron", "background", "job"],
    outputs: ["automation packet", "idempotence guard", "human approval line"],
  },
  {
    id: "AE14",
    name: "Bench / Checkmate",
    lane: "review",
    owns: "benchmarks, proof, drift checks, failure patterns",
    default_model_lane: "sonnet-subscription-plus-local-bench",
    trust_ceiling: "T-Conditional",
    keywords: ["bench", "benchmark", "checkmate", "doctor", "test", "tests", "proof", "prove", "verify", "checks", "drift", "failure", "receipt", "receipts"],
    outputs: ["proof gate", "doctor result", "failure pattern"],
  },
];

export const REVIEW_IDENTITIES = [
  { id: "LIPS", name: "Taste Authority", maps_to: ["AE3", "AE4"], owns: "UX voice, copy, surface quality, emotional landing" },
  { id: "MIRRORS", name: "Reality Contact", maps_to: ["AE7"], owns: "observed facts vs inference, contradictions" },
  { id: "CHECKMATE", name: "Verification Gate", maps_to: ["AE14"], owns: "proof pressure and final green/blocked status" },
  { id: "ORANGE", name: "Priority Judgment", maps_to: ["AE0", "AE1"], owns: "priority, subtraction, sequencing, product coherence" },
  { id: "MISFITS", name: "Frontier Exploration", maps_to: ["AE13"], owns: "unusual high-upside options" },
  { id: "HACK_THE_PLANET", name: "Unblock Lane", maps_to: ["AE10", "AE13"], owns: "execution bottleneck breaking" },
];

export const TRUST_TIERS = {
  "T-Advisor": {
    can_mutate: false,
    can_spend_usd: 0,
    description: "Recommend, summarize, draft. Cannot mutate state, deploy, or spend.",
  },
  "T-Conditional": {
    can_mutate: true,
    can_spend_usd: 0.5,
    description: "Can mutate allowed scoped state with receipts. Cannot deploy, delete, or spend above cap.",
  },
  "T-Autonomous": {
    can_mutate: true,
    can_spend_usd: 2.0,
    description: "Can run routine scoped tasks inside budget. Human final stop and gates still bind.",
  },
};

export function listDepartments() {
  return DEPARTMENTS.map((dept) => ({ ...dept }));
}

export function listReviewIdentities() {
  return REVIEW_IDENTITIES.map((identity) => ({ ...identity }));
}

export function getDepartment(id) {
  const key = String(id || "").toUpperCase();
  return DEPARTMENTS.find((dept) => dept.id === key) || null;
}

export function registrySummary() {
  const byLane = {};
  for (const dept of DEPARTMENTS) byLane[dept.lane] = (byLane[dept.lane] || 0) + 1;
  return {
    ok: true,
    version: DEPT_OS_VERSION,
    department_count: DEPARTMENTS.length,
    review_identity_count: REVIEW_IDENTITIES.length,
    by_lane: byLane,
    departments: listDepartments(),
    review_identities: listReviewIdentities(),
    trust_tiers: TRUST_TIERS,
    routing_law: [
      "Use the smallest useful lineup.",
      "More than five active departments requires operator approval.",
      "Model output is not proof; receipts are proof.",
      "Human final stop overrides every trust tier.",
    ],
  };
}
