/* intent-classifier.mjs - v6.3.0-alpha.8
 * Deterministic first-pass classifier for Silent Canvas relevance projection.
 * No model call here: this is fast, auditable, and safe to run before the Brain.
 */

const STOP = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "do", "for", "from",
  "get", "go", "have", "i", "in", "into", "is", "it", "make", "me", "my", "of",
  "on", "or", "our", "that", "the", "this", "to", "up", "we", "with", "you",
]);

const RULES = [
  { type: "build_feature", risk: "medium", departments: ["AE1", "AE3", "AE6", "AE14"], terms: ["build", "create", "implement", "add", "ship", "finish", "make"] },
  { type: "visual_design", risk: "low", departments: ["AE3", "LIPS"], terms: ["ux", "ui", "visual", "canvas", "design", "motion", "telemetry", "luxury", "screen"] },
  { type: "debug_repair", risk: "medium", departments: ["AE6", "AE7", "AE14"], terms: ["bug", "error", "failed", "fix", "broken", "debug", "repair"] },
  { type: "security_permission", risk: "high", departments: ["AE11", "AE7", "AE14"], terms: ["secret", "permission", "auth", "oauth", "token", "security", "delete", "destructive", "vault"] },
  { type: "automation_orchestration", risk: "medium", departments: ["AE0", "AE10", "AE13", "AE14"], terms: ["automation", "workflow", "n8n", "orchestrator", "agent", "department", "route"] },
  { type: "research_scope", risk: "low", departments: ["AE2", "AE7"], terms: ["research", "source", "docs", "learn", "evaluate", "review", "scope"] },
  { type: "solidify_production", risk: "high", departments: ["AE6", "AE8", "AE11", "AE14"], terms: ["solidify", "production", "deploy", "release", "publish", "installer"] },
];

export function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9_./:-]+/g, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1 && !STOP.has(x))
    .slice(0, 80);
}

export function classifyIntent({ goal = "", selected_node = null, route = null } = {}) {
  const tokens = tokenize(goal);
  const tokenSet = new Set(tokens);
  let winner = { type: "general_canvas_change", risk: "medium", departments: ["AE0", "AE6", "AE14"], score: 0, terms: [] };
  for (const rule of RULES) {
    const hits = rule.terms.filter((term) => tokenSet.has(term) || String(goal).toLowerCase().includes(term));
    if (hits.length > winner.score) {
      winner = { ...rule, score: hits.length, terms: hits };
    }
  }
  if (selected_node) {
    winner = { ...winner, selected_node };
  }
  if (route) {
    winner = { ...winner, route };
  }
  const risk = String(goal).match(/\b(delete|deploy|publish|secret|token|billing|payment|auth|production)\b/i)
    ? "high"
    : winner.risk;
  return {
    intent_type: winner.type,
    risk,
    departments: winner.departments,
    focus_terms: [...new Set([...tokens.slice(0, 24), ...(winner.terms || [])])],
    selected_node,
    route,
    confidence: winner.score > 0 ? Math.min(0.95, 0.55 + winner.score * 0.12) : 0.42,
  };
}
