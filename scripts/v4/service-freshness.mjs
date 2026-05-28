#!/usr/bin/env node
/* service-freshness.mjs - read-only live sidecar freshness proof.
 *
 * Static UI files can update on disk while an already-running Node sidecar
 * still holds old route code in memory. This doctor proves the live service
 * has the routes the current AE Operations screen expects.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const SERVICE_FRESHNESS_VERSION = "orangebox-service-freshness/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DEFAULT_BASE_URL = `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`;
const ROUTE_SOURCE_FILE = path.join(HERE, "v4-server-routes.mjs");

const REQUIRED_ROUTES = [
  {
    id: "status",
    method: "GET",
    path: "/api/status?fast=1",
    expect_json_key: "generatedAt",
    purpose: "Basic sidecar liveness.",
  },
  {
    id: "openapi",
    method: "GET",
    path: "/api/v4/openapi.json",
    expect_json_key: "openapi",
    purpose: "Current API contract available to agents and doctors.",
  },
  {
    id: "recovery-guide",
    method: "GET",
    path: "/api/v4/install/recovery-guide",
    expect_version: "orangebox-recovery-guide/v1",
    purpose: "AE Operations Repair / Recovery lane.",
  },
  {
    id: "install-rehearsal-latest",
    method: "GET",
    path: "/api/v4/install/rehearsal/latest",
    allow_statuses: [200, 404],
    purpose: "Persisted Clean Install Rehearsal visibility.",
  },
  {
    id: "finish-latest",
    method: "GET",
    path: "/api/v4/finish/latest",
    allow_statuses: [200, 404],
    purpose: "Latest Final Green Board visibility.",
  },
  {
    id: "finish-closeout-plan",
    method: "GET",
    path: "/api/v4/finish/closeout-plan?summary=1",
    expect_json_key: "curation_plan",
    purpose: "Release closeout and staging-decision visibility.",
    timeout_ms: 20000,
  },
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function compact(value, max = 900) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function readJsonFile(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

function fileMeta(file) {
  try {
    const stat = fsSync.statSync(file);
    return {
      path: file,
      exists: true,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    };
  } catch {
    return { path: file, exists: false, bytes: 0, modified_at: null };
  }
}

let routeSourceText = null;
function sourceRouteProof(route) {
  if (!route?.path?.startsWith("/api/v4/")) {
    return {
      checked: false,
      present: null,
      reason: "non-v4 route",
      file: ROUTE_SOURCE_FILE,
    };
  }
  if (routeSourceText == null) {
    try {
      routeSourceText = fsSync.readFileSync(ROUTE_SOURCE_FILE, "utf8");
    } catch {
      routeSourceText = "";
    }
  }
  const routePath = route.path.split("?")[0];
  const present = routeSourceText.includes(`pathname === "${routePath}"`) ||
    routeSourceText.includes(`pathname === '${routePath}'`) ||
    routeSourceText.includes(routePath);
  return {
    checked: true,
    present,
    file: ROUTE_SOURCE_FILE,
    route: routePath,
    diagnosis: present ? "source_route_installed" : "source_route_missing",
  };
}

function summarizeServiceFreshness(result, source = {}) {
  if (!result || typeof result !== "object") return null;
  const failures = Array.isArray(result.failures) ? result.failures : [];
  return {
    ok: result.ok === true,
    service_ok: result.ok === true,
    version: result.version || SERVICE_FRESHNESS_VERSION,
    project: result.project || "ORANGEBOX",
    created_at: result.created_at || null,
    started_at: result.started_at || null,
    base_url: result.base_url || null,
    status: result.status || (result.ok ? "fresh" : "review"),
    read_only: result.read_only !== false,
    mutates_machine: result.mutates_machine === true,
    summary: result.summary || {
      routes: Array.isArray(result.probes) ? result.probes.length : 0,
      passed: Array.isArray(result.probes) ? result.probes.filter((probe) => probe.ok).length : 0,
      failed: failures.length,
      restart_required: failures.some((failure) => failure.diagnosis === "route_missing_or_stale_sidecar"),
    },
    failures: failures.map((failure) => ({
      id: failure.id || null,
      method: failure.method || "GET",
      path: failure.path || null,
      purpose: failure.purpose || null,
      status: failure.status ?? null,
      diagnosis: failure.diagnosis || null,
      expected_version: failure.expected_version || null,
      version_observed: failure.version_observed || null,
      source_route: failure.source_route || null,
    })),
    source_routes: result.source_routes || null,
    recovery: result.recovery || null,
    recovery_action: result.recovery_action || "Run Service Freshness again before trusting live AE Operations routes.",
    safe_commands: Array.isArray(result.safe_commands) ? result.safe_commands : [
      "obx install service-freshness --json --receipt",
      "obx install operations-proof --json --receipt --isolated",
      "obx finish green-board --json --receipt --full",
    ],
    receipt_path: result.receipt_path || source.receipt_path || null,
    source,
  };
}

async function latestServiceFreshnessReceipts(limit = 12) {
  const rows = [];
  let entries = [];
  try {
    entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true });
  } catch {
    return rows;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !/^orangebox-service-freshness-.*\.json$/i.test(entry.name)) continue;
    const receiptPath = path.join(RECEIPTS_DIR, entry.name);
    const meta = fileMeta(receiptPath);
    const receipt = await readJsonFile(receiptPath);
    const summary = summarizeServiceFreshness(receipt, {
      kind: "receipt",
      receipt_path: receiptPath,
      modified_at: meta.modified_at,
      bytes: meta.bytes,
    });
    if (summary) {
      rows.push({
        ...summary,
        sort_time: Date.parse(meta.modified_at || summary.created_at || summary.started_at || 0) || 0,
      });
    }
  }
  rows.sort((a, b) => b.sort_time - a.sort_time);
  return rows.slice(0, limit).map(({ sort_time, ...row }) => row);
}

function requestJson(baseUrl, route, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const url = new URL(route.path, baseUrl);
    const req = http.request(url, { method: route.method || "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        let body = null;
        let parse_error = null;
        try {
          body = data ? JSON.parse(data) : null;
        } catch (err) {
          parse_error = err?.message || String(err);
        }
        resolve({
          id: route.id,
          method: route.method || "GET",
          path: route.path,
          purpose: route.purpose,
          status: res.statusCode,
          ok_http: res.statusCode >= 200 && res.statusCode < 300,
          body,
          parse_error,
          raw_tail: body ? null : compact(data),
        });
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({
      id: route.id,
      method: route.method || "GET",
      path: route.path,
      purpose: route.purpose,
      status: 0,
      ok_http: false,
      error: err?.message || String(err),
    }));
    req.end();
  });
}

function evaluateProbe(route, probe) {
  const allowedStatuses = route.allow_statuses || [200];
  const statusOk = allowedStatuses.includes(probe.status);
  const missingKey = route.expect_json_key && !Object.prototype.hasOwnProperty.call(probe.body || {}, route.expect_json_key);
  const versionMismatch = route.expect_version && probe.body?.version !== route.expect_version;
  const ok = statusOk && !probe.parse_error && !missingKey && !versionMismatch;
  const source_route = sourceRouteProof(route);
  return {
    ...probe,
    ok,
    expected_statuses: allowedStatuses,
    expected_version: route.expect_version || null,
    missing_key: missingKey ? route.expect_json_key : null,
    version_observed: route.expect_version ? (probe.body?.version || null) : null,
    source_route,
    diagnosis: ok
      ? "fresh"
      : probe.status === 404
        ? "route_missing_or_stale_sidecar"
        : probe.status === 0
          ? "sidecar_unreachable"
          : "route_mismatch",
  };
}

async function writeServiceFreshnessReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-service-freshness-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runServiceFreshnessDoctor({
  baseUrl = DEFAULT_BASE_URL,
  writeReceipt = false,
  timeoutMs = 5000,
} = {}) {
  const startedAt = new Date().toISOString();
  const probes = [];
  for (const route of REQUIRED_ROUTES) {
    const probe = await requestJson(baseUrl, route, route.timeout_ms || timeoutMs);
    probes.push(evaluateProbe(route, probe));
  }

  const failures = probes.filter((probe) => !probe.ok);
  const routeMissing = failures.filter((probe) => probe.diagnosis === "route_missing_or_stale_sidecar");
  const staleInstalledRoutes = routeMissing.filter((probe) => probe.source_route?.present === true);
  const sourceRoutes = probes
    .filter((probe) => probe.source_route?.checked)
    .map((probe) => ({
      id: probe.id,
      path: probe.source_route.route,
      present: probe.source_route.present,
      diagnosis: probe.source_route.diagnosis,
      file: probe.source_route.file,
    }));
  const unreachable = failures.filter((probe) => probe.diagnosis === "sidecar_unreachable");
  const statusProbeFailed = failures.some((probe) => probe.id === "status");
  const allFailuresUnreachable = failures.length > 0 && unreachable.length === failures.length;
  const status = statusProbeFailed || allFailuresUnreachable
    ? "unavailable"
    : routeMissing.length
      ? "restart_required"
      : failures.length
        ? "review"
        : "fresh";

  const result = {
    ok: failures.length === 0,
    version: SERVICE_FRESHNESS_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    started_at: startedAt,
    base_url: baseUrl,
    root: ROOT,
    status,
    read_only: true,
    mutates_machine: false,
    summary: {
      routes: probes.length,
      passed: probes.filter((probe) => probe.ok).length,
      failed: failures.length,
      restart_required: routeMissing.length > 0,
      source_routes_checked: sourceRoutes.length,
      source_routes_present: sourceRoutes.filter((route) => route.present).length,
      stale_installed_routes: staleInstalledRoutes.length,
    },
    source_routes: sourceRoutes,
    probes,
    failures,
    recovery: {
      status: status === "restart_required" ? "restart_required" : status === "fresh" ? "clear" : status,
      read_only: true,
      no_data_deletion_required: true,
      restart_is_operator_action: true,
      stale_installed_routes: staleInstalledRoutes.map((probe) => ({
        id: probe.id,
        path: probe.path,
        source_file: probe.source_route?.file || null,
      })),
      action: status === "restart_required"
        ? "Close and reopen ORANGEBOX so the Node sidecar reloads the current route table, then rerun Service and Final Green Board."
        : status === "fresh"
          ? "No service reload needed."
          : "Review failed service probes before trusting live operations controls.",
    },
    recovery_action: status === "fresh"
      ? "Live sidecar routes match the current AE Operations expectations."
      : status === "restart_required"
        ? "Restart ORANGEBOX so the running Node sidecar reloads the current route table. Do not delete data or receipts."
        : status === "unavailable"
          ? "Start ORANGEBOX, then rerun Service Freshness."
          : "Review failed probes before trusting the live operations board.",
    safe_commands: [
      "obx install service-freshness --json --receipt",
      "obx install operations-proof --json --receipt --isolated",
      "obx finish green-board --json --receipt --full",
    ],
    receipt_path: null,
  };
  if (writeReceipt) await writeServiceFreshnessReceipt(result);
  return result;
}

export async function getLatestServiceFreshnessProof({ limit = 8 } = {}) {
  const receiptRuns = await latestServiceFreshnessReceipts(limit);
  const latest = receiptRuns[0] || null;
  return {
    ok: !!latest,
    version: `${SERVICE_FRESHNESS_VERSION}.latest`,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    found: !!latest,
    latest,
    receipt_runs: receiptRuns,
    summary: latest?.summary || { routes: 0, passed: 0, failed: 0, restart_required: false },
    recovery_action: latest
      ? latest.service_ok
        ? "Latest persisted Service Freshness proof says the live sidecar routes were fresh. Rerun with receipt after route changes."
        : latest.status === "restart_required"
          ? "Latest persisted Service Freshness proof says the running sidecar needed a normal app restart to reload routes. No data deletion is required."
          : "Latest persisted Service Freshness proof needs review. Rerun after checking failed probes."
      : "No persisted Service Freshness proof was found. Run obx install service-freshness --json --receipt.",
    safety: {
      read_only: true,
      mutates_machine: false,
      restart_is_operator_action: true,
      data_deletion_required: false,
      safe_command: "obx install service-freshness --json --receipt",
    },
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseArg = process.argv.find((arg) => arg.startsWith("--base-url="));
  const timeoutArg = process.argv.find((arg) => arg.startsWith("--timeout="));
  const out = await runServiceFreshnessDoctor({
    baseUrl: baseArg ? baseArg.slice("--base-url=".length) : DEFAULT_BASE_URL,
    writeReceipt: process.argv.includes("--receipt"),
    timeoutMs: timeoutArg ? Number(timeoutArg.slice("--timeout=".length)) : 5000,
  });
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exit(4);
}
