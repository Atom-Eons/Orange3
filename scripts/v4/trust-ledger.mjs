/* trust-ledger.mjs - ORANGEBOX Department OS trust ledger.
 *
 * Trust is local state, not vibes. Department routes can recommend work, but
 * every department starts as advisor-only until a later explicit promotion flow
 * proves it can mutate scoped state safely.
 */

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { DEPARTMENTS, DEPT_OS_VERSION, TRUST_TIERS } from "./dept-registry.mjs";

export const TRUST_LEDGER_VERSION = "orangebox-trust-ledger/v1";

const TRUST_ORDER = ["T-Advisor", "T-Conditional", "T-Autonomous"];

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), ".orangebox");
}

export function trustLedgerPath(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "dept-os", "trust-ledger.json");
}

function rank(tier) {
  const idx = TRUST_ORDER.indexOf(tier);
  return idx < 0 ? 0 : idx;
}

function capTier(requested, ceiling) {
  const req = TRUST_TIERS[requested] ? requested : "T-Advisor";
  const cap = TRUST_TIERS[ceiling] ? ceiling : "T-Advisor";
  return rank(req) > rank(cap) ? cap : req;
}

function defaultLedger() {
  const departments = {};
  for (const dept of DEPARTMENTS) {
    departments[dept.id] = {
      dept_id: dept.id,
      current_tier: "T-Advisor",
      ceiling: dept.trust_ceiling,
      can_mutate: TRUST_TIERS["T-Advisor"].can_mutate,
      can_spend_usd: TRUST_TIERS["T-Advisor"].can_spend_usd,
      reason: "default advisor-only posture until promoted by verified receipts",
      updated_at: null,
    };
  }
  return {
    ok: true,
    version: TRUST_LEDGER_VERSION,
    dept_os_version: DEPT_OS_VERSION,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    departments,
    events: [],
    law: [
      "Trust starts at T-Advisor.",
      "Promotion requires receipts and explicit operator policy.",
      "Human final stop overrides every trust tier.",
      "Destructive actions, production deploys, and spend above cap require approval.",
    ],
  };
}

function normalizeLedger(raw) {
  const ledger = raw && typeof raw === "object" ? raw : defaultLedger();
  ledger.version = ledger.version || TRUST_LEDGER_VERSION;
  ledger.dept_os_version = ledger.dept_os_version || DEPT_OS_VERSION;
  ledger.created_at = ledger.created_at || new Date().toISOString();
  ledger.updated_at = ledger.updated_at || new Date().toISOString();
  ledger.departments = ledger.departments && typeof ledger.departments === "object" ? ledger.departments : {};
  ledger.events = Array.isArray(ledger.events) ? ledger.events : [];

  for (const dept of DEPARTMENTS) {
    const existing = ledger.departments[dept.id] || {};
    const tier = capTier(existing.current_tier || "T-Advisor", dept.trust_ceiling);
    const spec = TRUST_TIERS[tier] || TRUST_TIERS["T-Advisor"];
    ledger.departments[dept.id] = {
      dept_id: dept.id,
      current_tier: tier,
      ceiling: dept.trust_ceiling,
      can_mutate: !!spec.can_mutate,
      can_spend_usd: Number(spec.can_spend_usd || 0),
      reason: existing.reason || "default advisor-only posture until promoted by verified receipts",
      updated_at: existing.updated_at || null,
    };
  }
  return ledger;
}

export async function loadTrustLedger({ dataRoot = defaultDataRoot(), create = true } = {}) {
  const file = trustLedgerPath(dataRoot);
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    return normalizeLedger(parsed);
  } catch (err) {
    if (!create && err?.code === "ENOENT") throw err;
    const ledger = defaultLedger();
    await saveTrustLedger(ledger, { dataRoot });
    return ledger;
  }
}

export async function saveTrustLedger(ledger, { dataRoot = defaultDataRoot() } = {}) {
  const normalized = normalizeLedger(ledger);
  normalized.updated_at = new Date().toISOString();
  const file = trustLedgerPath(dataRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  return { ok: true, path: file, ledger: normalized };
}

export async function getTrustTier(deptId, { dataRoot = defaultDataRoot() } = {}) {
  const ledger = await loadTrustLedger({ dataRoot });
  const key = String(deptId || "").toUpperCase();
  return ledger.departments[key] || null;
}

export async function trustSummary({ dataRoot = defaultDataRoot() } = {}) {
  const ledger = await loadTrustLedger({ dataRoot });
  const byTier = {};
  for (const entry of Object.values(ledger.departments)) {
    byTier[entry.current_tier] = (byTier[entry.current_tier] || 0) + 1;
  }
  return {
    ok: true,
    version: ledger.version,
    dept_os_version: ledger.dept_os_version,
    path: trustLedgerPath(dataRoot),
    department_count: Object.keys(ledger.departments).length,
    by_tier: byTier,
    departments: ledger.departments,
    events_tail: ledger.events.slice(-20),
    law: ledger.law,
  };
}

export async function recordTrustEvent({
  deptId,
  event,
  reason,
  requestedTier = null,
  evidence = {},
  dataRoot = defaultDataRoot(),
} = {}) {
  const key = String(deptId || "").toUpperCase();
  const dept = DEPARTMENTS.find((item) => item.id === key);
  if (!dept) throw new Error(`unknown department: ${deptId}`);
  const ledger = await loadTrustLedger({ dataRoot });
  const previous = ledger.departments[key]?.current_tier || "T-Advisor";
  const next = requestedTier ? capTier(requestedTier, dept.trust_ceiling) : previous;
  const spec = TRUST_TIERS[next] || TRUST_TIERS["T-Advisor"];
  ledger.departments[key] = {
    dept_id: key,
    current_tier: next,
    ceiling: dept.trust_ceiling,
    can_mutate: !!spec.can_mutate,
    can_spend_usd: Number(spec.can_spend_usd || 0),
    reason: reason || event || "trust event",
    updated_at: new Date().toISOString(),
  };
  ledger.events.push({
    ts: new Date().toISOString(),
    dept_id: key,
    event: event || "trust_event",
    previous_tier: previous,
    current_tier: next,
    reason: reason || "",
    evidence,
  });
  await saveTrustLedger(ledger, { dataRoot });
  return { ok: true, dept_id: key, previous_tier: previous, current_tier: next };
}
