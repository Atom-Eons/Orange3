#!/usr/bin/env node
/* dept-doctor.mjs - Department OS proof gate.
 *
 * Builds an isolated trust ledger and route store, then proves the Department
 * OS can route representative ORANGEBOX work without model calls or sidecar
 * dependencies.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { registrySummary } from "./dept-registry.mjs";
import { routeGoal } from "./dept-router.mjs";
import { trustSummary } from "./trust-ledger.mjs";

export const DEPT_DOCTOR_VERSION = "orangebox-department-os-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function tempRoot() {
  return path.join(os.tmpdir(), `obx-dept-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
}

function compactText(value, max = 2400) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
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
      stack: err?.stack ? compactText(err.stack, 1600) : null,
    };
  }
}

function hasDept(route, id) {
  return route.departments.some((dept) => dept.id === id);
}

function hasGate(route, id) {
  return route.review_gates.some((gate) => gate.id === id);
}

async function expectRoute({ dataRoot, goal, expectedDepartments = [], expectedGates = [], expectApproval = null }) {
  const route = await routeGoal({
    goal,
    project: "orangebox-doctor",
    dataRoot,
    writeRoute: true,
    maxDepartments: 5,
  });
  const missingDepartments = expectedDepartments.filter((id) => !hasDept(route, id));
  const missingGates = expectedGates.filter((id) => !hasGate(route, id));
  let routeFileExists = false;
  try {
    const st = await fs.stat(route.route_file);
    routeFileExists = st.isFile();
  } catch {}
  const approvalOk = expectApproval === null ? true : route.approval_required === expectApproval;
  return {
    ok: missingDepartments.length === 0
      && missingGates.length === 0
      && route.active_department_count <= 5
      && routeFileExists
      && approvalOk,
    route_id: route.route_id,
    route_file: route.route_file,
    active_departments: route.departments.map((dept) => dept.id),
    review_gates: route.review_gates.map((gate) => gate.id),
    approval_required: route.approval_required,
    risk: route.risk,
    missing_departments: missingDepartments,
    missing_gates: missingGates,
    route_file_exists: routeFileExists,
  };
}

async function cockpitSourceProbe() {
  const indexPath = path.join(ROOT, "src", "v4", "index.html");
  const jsPath = path.join(ROOT, "src", "v4", "see-suite.js");
  const cssPath = path.join(ROOT, "src", "v4", "see-suite.css");
  const routesPath = path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs");
  const cliPath = path.join(ROOT, "scripts", "obx.mjs");
  const [index, js, css, routes, cli] = await Promise.all([
    fs.readFile(indexPath, "utf8"),
    fs.readFile(jsPath, "utf8"),
    fs.readFile(cssPath, "utf8"),
    fs.readFile(routesPath, "utf8"),
    fs.readFile(cliPath, "utf8"),
  ]);
  const required = {
    index: ["deptOsPanel", "deptRouteForm", "deptDoctorBtn", "deptRouteOutput"],
    js: ["deptState", "function renderDeptOs", "/api/v4/dept/registry", "/api/v4/dept/route", "/api/v4/dept/doctor"],
    css: [".dept-os-panel", ".dept-route-form", ".dept-route-card"],
    routes: ["/api/v4/dept/registry", "/api/v4/dept/trust", "/api/v4/dept/route", "/api/v4/dept/doctor"],
    cli: ["async function cmdDept", "obx dept route", "case \"dept\""],
  };
  const missing = {};
  for (const [key, snippets] of Object.entries(required)) {
    const src = { index, js, css, routes, cli }[key];
    missing[key] = snippets.filter((snippet) => !src.includes(snippet));
  }
  const missingTotal = Object.values(missing).reduce((n, arr) => n + arr.length, 0);
  return {
    ok: missingTotal === 0,
    files: { indexPath, jsPath, cssPath, routesPath, cliPath },
    missing,
  };
}

async function writeDoctorReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-dept-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runDeptDoctor({ writeReceipt = false, keepTemp = false } = {}) {
  const dataRoot = tempRoot();
  const checks = [];

  checks.push(await gate("registry_shape", async () => {
    const registry = registrySummary();
    const ids = registry.departments.map((dept) => dept.id);
    const expected = Array.from({ length: 15 }, (_, i) => `AE${i}`);
    const missing = expected.filter((id) => !ids.includes(id));
    return {
      ok: registry.ok && registry.department_count === 15 && missing.length === 0 && registry.review_identity_count >= 6,
      department_count: registry.department_count,
      review_identity_count: registry.review_identity_count,
      missing,
      by_lane: registry.by_lane,
    };
  }));

  checks.push(await gate("trust_defaults_advisor_only", async () => {
    const trust = await trustSummary({ dataRoot });
    const entries = Object.values(trust.departments);
    const nonAdvisor = entries.filter((entry) => entry.current_tier !== "T-Advisor" || entry.can_mutate !== false);
    return {
      ok: entries.length === 15 && nonAdvisor.length === 0,
      path: trust.path,
      by_tier: trust.by_tier,
      non_advisor: nonAdvisor.map((entry) => entry.dept_id),
    };
  }));

  checks.push(await gate("engineering_route", async () => expectRoute({
    dataRoot,
    goal: "Implement the Department OS API route, run syntax checks, write receipts, and prove it with a doctor.",
    expectedDepartments: ["AE0", "AE6", "AE14"],
    expectedGates: ["CHECKMATE", "ORANGE"],
  })));

  checks.push(await gate("design_route", async () => expectRoute({
    dataRoot,
    goal: "Design the luxury Silent Canvas telemetry surface with LIPS review, motion, UI, and visual proof.",
    expectedDepartments: ["AE0", "AE3"],
    expectedGates: ["LIPS", "CHECKMATE"],
  })));

  checks.push(await gate("automation_security_route", async () => expectRoute({
    dataRoot,
    goal: "Build hidden watchdog automation with retry queue, runtime continuity, auth token safety, and delete nothing.",
    expectedDepartments: ["AE0", "AE10", "AE11", "AE13"],
    expectedGates: ["MIRRORS", "CHECKMATE"],
    expectApproval: true,
  })));

  checks.push(await gate("legal_route", async () => expectRoute({
    dataRoot,
    goal: "Review privacy, copyright, licensing, rights claims, and compliance language before public release.",
    expectedDepartments: ["AE0", "AE9"],
    expectedGates: ["CHECKMATE", "ORANGE"],
  })));

  checks.push(await gate("see_suite_cli_api_source_probe", cockpitSourceProbe));

  const failed = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failed.length === 0,
    version: DEPT_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    data_root: dataRoot,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failed.length,
      warnings: warnings.length,
    },
    checks,
    failures: failed,
    receipt_path: null,
  };

  if (writeReceipt) result.receipt_path = await writeDoctorReceipt(result);
  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const write = process.argv.includes("--receipt");
  const json = process.argv.includes("--json");
  runDeptDoctor({ writeReceipt: write }).then((out) => {
    if (json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} Department OS checks`);
      if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
      for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
    }
    process.exit(out.ok ? 0 : 4);
  }).catch((err) => {
    console.error(err?.stack || err?.message || String(err));
    process.exit(1);
  });
}
