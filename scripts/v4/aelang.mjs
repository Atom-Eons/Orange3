#!/usr/bin/env node
/* aelang.mjs - AELang parser, validator, and route-packet bridge.
 *
 * AELang is an operator-facing language for turning agentic intent into
 * ORANGEBOX route packets. This module is deliberately small and deterministic:
 * it parses the current v0.1 grammar subset, validates Department OS targets,
 * maps the result into the Operating Spine shape, and writes receipts when
 * requested. It does not execute model calls, mutate projects, or perform
 * rollback by itself.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AELANG_VERSION = "orangebox-aelang/v0.1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SPEC_PATH = path.join(ROOT, "docs", "AELANG_SPEC.md");

const VALID_DEPARTMENTS = new Set(Array.from({ length: 15 }, (_, i) => `AE${i}`));

export const HIGH_SAMPLE = `mission "Ethereal AI Link Installer" {
  objective: "One-click Basic + Advanced AI Computer setup with full network proof"

  route {
    departments: [AE6.Code, AE3.Design, AE10.Ops, AE11.Security]
    proof_gates: [hash_verification, rollback_test, security_scan]
  }

  parallel {
    AE6.Code implements installer
    AE3.Design generates silent_canvas_ui
    AE10.Ops runs network_diagnostics
    AE11.Security runs audit
  }

  mutate silent_canvas {
    add_node "Ethereal Link" with status: healthy
    wire to Installer
    record_mutation_proof
  }

  verify full_proof
  release "v0.1.0"

  on_failure {
    rollback to last_green_state
    notify operator with exact_recovery_steps
  }
}`;

export const CORE_SAMPLE = `route_packet {
  id: "ethereal-installer-001"
  objective: "One-click Basic + Advanced AI Computer setup with full network proof"
  departments: ["AE6", "AE3", "AE10", "AE11"]
  actions: [
    { type: "implement", target: "installer", department: "AE6" },
    { type: "generate_ui", target: "silent_canvas", department: "AE3" }
  ]
  proof_gates: ["hash_verification", "rollback_test"]
  recovery: "last_green_state"
  receipt_policy: "generate_on_every_action"
}`;

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text)).digest("hex");
}

function stripComments(source) {
  return String(source || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|\s)(\/\/|#).*$/, ""))
    .join("\n");
}

function normalizeLegacyProductLanguage(source) {
  const warnings = [];
  let text = String(source || "");
  if (/Orangeb0x|OrangeBox|orangebox/i.test(text) && !/ORANGEBOX/.test(text)) {
    warnings.push({
      id: "legacy-product-spelling-normalized",
      detail: "AELang normalizes Orangeb0x/OrangeBox spellings to ORANGEBOX in generated metadata.",
    });
    text = text.replace(/Orangeb0x|OrangeBox|orangebox/g, "ORANGEBOX");
  }
  return { text, warnings };
}

function stripQuotes(value) {
  return String(value || "").trim().replace(/^"|"$/g, "");
}

function slug(value) {
  const compact = String(value || "aelang-route")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return compact || "aelang-route";
}

function parseListValue(raw) {
  return String(raw || "")
    .split(",")
    .map((item) => stripQuotes(item.trim()))
    .filter(Boolean);
}

function normalizeDepartment(value) {
  const match = String(value || "").match(/^(AE\d{1,2})(?:\.[A-Za-z_][A-Za-z0-9_]*)?$/);
  return match ? match[1] : String(value || "").trim();
}

function parseBracketList(body, key) {
  const re = new RegExp(`${key}\\s*:\\s*\\[([\\s\\S]*?)\\]`, "i");
  const match = body.match(re);
  if (!match) return [];
  return parseListValue(match[1]);
}

function parseStringField(body, key) {
  const re = new RegExp(`${key}\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`, "i");
  const match = body.match(re);
  return match ? match[1].replace(/\\"/g, "\"") : "";
}

function extractNamedBlock(source, keyword) {
  const re = new RegExp(`${keyword}\\s*\\{`, "i");
  const match = re.exec(source);
  if (!match) return "";
  let depth = 0;
  let start = -1;
  for (let i = match.index; i < source.length; i++) {
    if (source[i] === "{") {
      depth += 1;
      if (start === -1) start = i + 1;
    } else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, i);
    }
  }
  return "";
}

function parseParallelActions(block) {
  const actions = [];
  for (const line of String(block || "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(AE\d{1,2})(?:\.[A-Za-z_][A-Za-z0-9_]*)?\s+([A-Za-z_][A-Za-z0-9_]*)\s+(.+)$/);
    if (!match) continue;
    const [, dept, verb, rest] = match;
    actions.push({
      type: verb,
      target: rest.trim().replace(/\s+/g, "_"),
      department: dept,
    });
  }
  return actions;
}

function parseCoreActions(block) {
  const actionsField = block.match(/actions\s*:\s*\[([\s\S]*?)\]\s*(?:proof_gates|recovery|receipt_policy|$)/i);
  if (!actionsField) return [];
  const actions = [];
  for (const objectMatch of actionsField[1].matchAll(/\{([\s\S]*?)\}/g)) {
    const raw = objectMatch[1];
    const action = {
      type: parseStringField(raw, "type") || parseBareField(raw, "type"),
      target: parseStringField(raw, "target") || parseBareField(raw, "target"),
      department: normalizeDepartment(parseStringField(raw, "department") || parseBareField(raw, "department")),
    };
    if (action.type || action.target || action.department) actions.push(action);
  }
  return actions;
}

function parseBareField(body, key) {
  const re = new RegExp(`${key}\\s*:\\s*([A-Za-z0-9_.-]+)`, "i");
  const match = body.match(re);
  return match ? match[1] : "";
}

function parseMutations(source) {
  const mutations = [];
  const re = /mutate\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{/ig;
  let match;
  while ((match = re.exec(source))) {
    const target = match[1];
    const block = extractBlockAt(source, source.indexOf("{", match.index));
    mutations.push({
      target,
      operations: block
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    });
  }
  return mutations;
}

function extractBlockAt(source, braceIndex) {
  if (braceIndex < 0 || source[braceIndex] !== "{") return "";
  let depth = 0;
  for (let i = braceIndex; i < source.length; i++) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(braceIndex + 1, i);
    }
  }
  return "";
}

export function detectAELangTier(source) {
  const text = stripComments(source);
  if (/\bmission\s+"/i.test(text)) return "high";
  if (/\broute_packet\s*\{/i.test(text)) return "core";
  return "unknown";
}

export function parseAELangHigh(source) {
  const normalized = normalizeLegacyProductLanguage(source);
  const text = stripComments(normalized.text);
  const missionMatch = text.match(/\bmission\s+"((?:[^"\\]|\\.)*)"\s*\{/i);
  if (!missionMatch) throw new Error("AELang-High requires `mission \"...\" { ... }`.");
  const missionName = missionMatch[1].replace(/\\"/g, "\"");
  const missionBlock = extractBlockAt(text, text.indexOf("{", missionMatch.index));
  const objective = parseStringField(missionBlock, "objective");
  const routeBlock = extractNamedBlock(missionBlock, "route");
  const departments = parseBracketList(routeBlock, "departments").map(normalizeDepartment);
  const proofGates = parseBracketList(routeBlock, "proof_gates").map(stripQuotes);
  const parallelBlock = extractNamedBlock(missionBlock, "parallel");
  const actions = parseParallelActions(parallelBlock);
  const mutations = parseMutations(missionBlock);
  const verify = (missionBlock.match(/\bverify\s+([A-Za-z_][A-Za-z0-9_-]*)/i) || [])[1] || "";
  const release = (missionBlock.match(/\brelease\s+"((?:[^"\\]|\\.)*)"/i) || [])[1] || "";
  const failureBlock = extractNamedBlock(missionBlock, "on_failure");
  const recovery = (failureBlock.match(/\brollback\s+to\s+([A-Za-z_][A-Za-z0-9_-]*)/i) || [])[1] || "";
  const routePacket = {
    id: `${slug(missionName)}-001`,
    objective,
    departments,
    actions,
    proof_gates: proofGates,
    receipt_policy: "generate_on_every_action",
    recovery,
    source_tier: "AELang-High",
    source_mission: missionName,
    verify,
    release,
    mutations,
  };
  return validateRoutePacket(routePacket, normalized.warnings);
}

export function parseAELangCore(source) {
  const normalized = normalizeLegacyProductLanguage(source);
  const text = stripComments(normalized.text);
  const packetMatch = text.match(/\broute_packet\s*\{/i);
  if (!packetMatch) throw new Error("AELang-Core requires `route_packet { ... }`.");
  const block = extractBlockAt(text, text.indexOf("{", packetMatch.index));
  const routePacket = {
    id: parseStringField(block, "id"),
    objective: parseStringField(block, "objective"),
    departments: parseBracketList(block, "departments").map(normalizeDepartment),
    actions: parseCoreActions(block),
    proof_gates: parseBracketList(block, "proof_gates").map(stripQuotes),
    receipt_policy: parseStringField(block, "receipt_policy") || parseBareField(block, "receipt_policy"),
    recovery: parseStringField(block, "recovery") || parseBareField(block, "recovery"),
    source_tier: "AELang-Core",
  };
  return validateRoutePacket(routePacket, normalized.warnings);
}

export function validateRoutePacket(routePacket, inheritedWarnings = []) {
  const failures = [];
  const warnings = [...inheritedWarnings];
  if (!routePacket.id) failures.push({ id: "missing-id", detail: "route_packet.id is required." });
  if (!routePacket.objective) failures.push({ id: "missing-objective", detail: "route_packet.objective is required." });
  if (!Array.isArray(routePacket.departments) || routePacket.departments.length === 0) {
    failures.push({ id: "missing-departments", detail: "At least one Department OS lane is required." });
  }
  for (const dept of routePacket.departments || []) {
    if (!VALID_DEPARTMENTS.has(dept)) failures.push({ id: "invalid-department", detail: `${dept} is not AE0-AE14.` });
  }
  for (const action of routePacket.actions || []) {
    if (action.department && !VALID_DEPARTMENTS.has(action.department)) {
      failures.push({ id: "invalid-action-department", detail: `${action.department} is not AE0-AE14.` });
    }
  }
  if (!routePacket.recovery) {
    warnings.push({ id: "missing-recovery", detail: "Critical route packets should name a recovery target." });
  }
  if (!routePacket.receipt_policy) {
    warnings.push({ id: "missing-receipt-policy", detail: "Receipt policy defaulted to generate_on_every_action." });
    routePacket.receipt_policy = "generate_on_every_action";
  }
  return {
    ok: failures.length === 0,
    route_packet: routePacket,
    failures,
    warnings,
  };
}

export function routePacketToOperatingSpine(routePacket) {
  const departments = (routePacket.departments || []).map((id) => ({ id }));
  return {
    objective: routePacket.objective,
    project: "ORANGEBOX",
    macro_actions: ["inspect", "scope", "route", "patch", "verify", "package", "receipt", "promote"],
    department_route: {
      primary_dept: routePacket.departments?.[0] || "AE0",
      departments,
    },
    coordination_profile: {
      lead_lane: routePacket.departments?.[0] || "AE0",
      specialist_lanes: (routePacket.departments || []).slice(1),
      review_lane: routePacket.departments?.includes("AE7") ? "AE7" : "AE14",
      dissent_sovereignty_check: true,
      arbitration_rule: "AE0 PM / Factory arbitrates after AE7 or AE14 review evidence.",
      escalation_rule: "Ask the operator only when blocker evidence exists or approval lines are crossed.",
      proof_owner: routePacket.departments?.includes("AE14") ? "AE14" : "AE10",
    },
    clarification_policy: {
      goal_clarification: "ask early when objective is ambiguous",
      input_clarification: "ask while missing inputs still change the route materially",
      late_question_rule: "late questions require blocker evidence; otherwise proceed with logged assumptions",
    },
    model_lane: {
      source: "Running Brain switchboard",
      default_preference: "active profile unless route overrides it",
    },
    proof_gates: routePacket.proof_gates || [],
    rollback_path: {
      target: routePacket.recovery || "last_green_receipt",
      note: "AELang names rollback intent; ORANGEBOX doctors and operator approval perform rollback actions.",
    },
    receipt_id: null,
    source_route_packet_id: routePacket.id,
  };
}

export function renderAELangCore(routePacket) {
  const quoteList = (items) => `[${(items || []).map((item) => `"${item}"`).join(", ")}]`;
  const actionLines = (routePacket.actions || []).map((action) =>
    `    { type: "${action.type}", target: "${action.target}", department: "${action.department}" }`
  );
  return [
    "route_packet {",
    `  id: "${routePacket.id}"`,
    `  objective: "${routePacket.objective}"`,
    `  departments: ${quoteList(routePacket.departments)}`,
    "  actions: [",
    actionLines.join(",\n"),
    "  ]",
    `  proof_gates: ${quoteList(routePacket.proof_gates)}`,
    `  recovery: "${routePacket.recovery || "last_green_receipt"}"`,
    `  receipt_policy: "${routePacket.receipt_policy || "generate_on_every_action"}"`,
    "}",
  ].join("\n");
}

export async function compileAELang({ source, tier = "auto", writeReceipt = false } = {}) {
  const input = source || HIGH_SAMPLE;
  const detected = tier === "auto" ? detectAELangTier(input) : tier;
  let parsed;
  if (detected === "high") parsed = parseAELangHigh(input);
  else if (detected === "core") parsed = parseAELangCore(input);
  else throw new Error("Unable to detect AELang tier. Use mission {...} or route_packet {...}.");
  const out = {
    ok: parsed.ok,
    version: AELANG_VERSION,
    created_at: new Date().toISOString(),
    detected_tier: detected,
    source_sha256: sha256(input),
    route_packet: parsed.route_packet,
    aelang_core: renderAELangCore(parsed.route_packet),
    operating_spine: routePacketToOperatingSpine(parsed.route_packet),
    failures: parsed.failures,
    warnings: parsed.warnings,
    receipt_path: null,
  };
  if (writeReceipt) out.receipt_path = await writeAELangReceipt("compile", out);
  return out;
}

async function writeAELangReceipt(kind, payload) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-aelang-${kind}-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify({
    ok: payload.ok,
    source: "orangebox-aelang",
    version: AELANG_VERSION,
    title: `AELang ${kind}`,
    summary: payload.summary || payload.route_packet?.objective || "AELang receipt",
    ...payload,
  }, null, 2) + "\n", "utf8");
  return file;
}

async function checkSpecDocument() {
  const text = await fs.readFile(SPEC_PATH, "utf8");
  const required = ["# AELang", "AELang-High", "AELang-Core", "ORANGEBOX", "Route Packet", "Silent Canvas"];
  const missing = required.filter((token) => !text.includes(token));
  const stale = [];
  if (/Orangeb0x/.test(text)) stale.push("Orangeb0x");
  if (/signed receipts/i.test(text)) stale.push("signed receipts");
  if (/automatic rollback/i.test(text)) stale.push("automatic rollback");
  return {
    ok: missing.length === 0 && stale.length === 0,
    path: SPEC_PATH,
    missing,
    stale,
    sha256: sha256(text),
  };
}

export async function runAELangDoctor({ writeReceipt = false } = {}) {
  const checks = [];
  const add = (name, result, required = true) => {
    checks.push({
      name,
      required,
      ok: result.ok === true,
      status: result.ok === true ? "pass" : required ? "fail" : "watch",
      evidence: result,
    });
  };

  try {
    add("spec_document_normalized", await checkSpecDocument());
  } catch (error) {
    add("spec_document_normalized", { ok: false, error: error?.message || String(error), path: SPEC_PATH });
  }

  try {
    const high = await compileAELang({ source: HIGH_SAMPLE, tier: "high" });
    add("high_compiles_to_core", {
      ok: high.ok && high.detected_tier === "high" && high.route_packet.departments.includes("AE6"),
      route_packet_id: high.route_packet.id,
      departments: high.route_packet.departments,
      proof_gates: high.route_packet.proof_gates,
      warnings: high.warnings,
      failures: high.failures,
    });
  } catch (error) {
    add("high_compiles_to_core", { ok: false, error: error?.message || String(error) });
  }

  try {
    const core = await compileAELang({ source: CORE_SAMPLE, tier: "core" });
    add("core_validates_route_packet", {
      ok: core.ok && core.route_packet.recovery === "last_green_state",
      route_packet_id: core.route_packet.id,
      actions: core.route_packet.actions,
      warnings: core.warnings,
      failures: core.failures,
    });
  } catch (error) {
    add("core_validates_route_packet", { ok: false, error: error?.message || String(error) });
  }

  try {
    const compiled = await compileAELang({ source: HIGH_SAMPLE, tier: "high" });
    add("route_packet_maps_to_operating_spine", {
      ok: compiled.ok &&
        compiled.operating_spine.macro_actions.includes("verify") &&
        compiled.operating_spine.coordination_profile.dissent_sovereignty_check === true &&
        compiled.operating_spine.rollback_path.target === "last_green_state",
      operating_spine: compiled.operating_spine,
    });
  } catch (error) {
    add("route_packet_maps_to_operating_spine", { ok: false, error: error?.message || String(error) });
  }

  const failures = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const out = {
    ok: failures.length === 0,
    version: AELANG_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: warnings.length,
    },
    checks,
    failures,
    warnings,
    boundaries: {
      no_model_calls: true,
      no_execution_side_effects: true,
      rollback_is_declared_not_automatic: true,
      receipt_integrity: "sha256 receipts now; cryptographic signing requires a future key-management gate",
    },
    receipt_path: null,
  };
  if (writeReceipt) out.receipt_path = await writeAELangReceipt("doctor", out);
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const source = file ? await fs.readFile(path.resolve(file), "utf8") : HIGH_SAMPLE;
  const out = await compileAELang({ source, tier: "auto", writeReceipt: process.argv.includes("--receipt") });
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.ok ? 0 : 4);
}
