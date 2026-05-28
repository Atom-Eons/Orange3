#!/usr/bin/env node
/* api-doctor.mjs - OpenAPI contract proof for ORANGEBOX.
 *
 * The canonical OpenAPI artifact is JSON-in-YAML: valid YAML, parseable by
 * Node without adding a dependency. The doctor proves documented routes exist
 * in the local v4 router and reports undocumented /api/v4 routes as drift.
 */

import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import os from "node:os";
import { fileURLToPath } from "node:url";

export const API_DOCTOR_VERSION = "orangebox-openapi-contract-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SPEC_PATH = path.join(ROOT, "docs", "api", "orangebox-openapi.yaml");
const KNOWN_UNDOCUMENTED_COMPATIBILITY_ROUTES = new Set([
  // Generic local v4 dispatch sentinel. This is not a product endpoint.
  "/api/v4/*",
  // Legacy AI-box tenant aliases. Keep them out of the product OpenAPI contract
  // while old clients migrate to /api/v4/ai-box/tenant/*.
  "/api/v4/codexa/tenant/*",
  "/api/v4/cockpit/status",
  "/api/v4/codexa/tenant/issue",
  "/api/v4/codexa/tenant/revoke",
  "/api/v4/codexa/tenant/list",
]);

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

export async function loadOpenApiSpec() {
  const raw = await fs.readFile(SPEC_PATH, "utf8");
  const spec = JSON.parse(raw);
  return { raw, spec, path: SPEC_PATH };
}

function routeLiterals(source) {
  const values = new Set();
  for (const match of source.matchAll(/pathname\s*===\s*"([^"]+)"/g)) values.add(match[1]);
  for (const match of source.matchAll(/pathname\.startsWith\("([^"]+)"/g)) values.add(`${match[1]}*`);
  return values;
}

function documentedOperations(spec) {
  const out = [];
  for (const [pathKey, methods] of Object.entries(spec.paths || {})) {
    for (const method of Object.keys(methods || {})) {
      out.push({
        method: method.toUpperCase(),
        path: pathKey,
        operationId: methods[method]?.operationId || null,
      });
    }
  }
  return out;
}

function specPathToSourceNeedle(pathKey) {
  if (pathKey.includes("{")) return `${pathKey.replace(/\{[^}]+\}/g, "")}*`;
  return pathKey;
}

function hasKeys(obj, keys) {
  return keys.filter((key) => !Object.prototype.hasOwnProperty.call(obj || {}, key));
}

function shape(name, value, requiredKeys, extra = {}) {
  const missing = hasKeys(value, requiredKeys);
  return {
    name,
    ok: missing.length === 0,
    missing,
    observed_keys: Object.keys(value || {}).sort(),
    ...extra,
  };
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

async function writeDoctorReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `orangebox-api-doctor-${stampForFile()}.json`);
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runApiDoctor({ writeReceipt = false } = {}) {
  const checks = [];
  let loaded = null;
  let sourceRoutes = null;

  checks.push(await gate("openapi_spec_parses", async () => {
    loaded = await loadOpenApiSpec();
    const operations = documentedOperations(loaded.spec);
    return {
      ok: loaded.spec.openapi?.startsWith("3.")
        && loaded.spec.info?.title
        && operations.length >= 20,
      path: loaded.path,
      sha256: crypto.createHash("sha256").update(loaded.raw).digest("hex"),
      openapi: loaded.spec.openapi,
      title: loaded.spec.info?.title,
      operation_count: operations.length,
    };
  }));

  checks.push(await gate("documented_routes_map_to_source", async () => {
    if (!loaded) loaded = await loadOpenApiSpec();
    const routePaths = [
      path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs"),
      path.join(ROOT, "scripts", "orangebox-command-server.mjs"),
    ];
    const sources = await Promise.all(routePaths.map((routePath) => fs.readFile(routePath, "utf8")));
    const source = sources.join("\n");
    sourceRoutes = new Set();
    for (const text of sources) {
      for (const route of routeLiterals(text)) sourceRoutes.add(route);
    }
    const operations = documentedOperations(loaded.spec);
    const missing = operations.filter((op) => {
      const needle = specPathToSourceNeedle(op.path);
      return !sourceRoutes.has(needle) && !source.includes(op.path) && !source.includes(needle.replace("*", ""));
    });
    return {
      ok: missing.length === 0,
      routes_paths: routePaths,
      documented_operation_count: operations.length,
      source_route_count: sourceRoutes.size,
      missing,
    };
  }));

  checks.push(await gate("cli_contract_surface", async () => {
    const cliPath = path.join(ROOT, "scripts", "obx.mjs");
    const cli = await fs.readFile(cliPath, "utf8");
    const required = [
      "async function cmdApi",
      "obx api doctor",
      "async function cmdRoute",
      "obx route plan",
      "obx route current",
      "obx route history",
      "obx route show",
      "obx route replay",
      "obx route artifact",
      "obx route progress",
      "obx route verify-gates",
      "obx route package",
      "obx route receipt",
      "obx route promote",
      "obx route state-doctor",
      "async function cmdClaude",
      "obx claude export-route",
    ];
    const missing = required.filter((snippet) => !cli.includes(snippet));
    return { ok: missing.length === 0, cli_path: cliPath, missing };
  }));

  checks.push(await gate("mission_spine_response_shapes", async () => {
    const dataRoot = path.join(os.tmpdir(), `obx-api-shape-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
    await fs.mkdir(dataRoot, { recursive: true });
    const spine = await import("./operating-spine.mjs");
    const state = await import("./route-state.mjs");
    const route = await spine.planOperatingRoute({
      objective: "API doctor fixture: validate Mission Spine response shapes.",
      project: "orangebox-api-doctor",
      dataRoot,
      writeRoute: true,
    });
    await state.saveCurrentRoute({ route, dataRoot });
    const current = await state.loadCurrentRoute({ dataRoot });
    const history = await state.loadRouteHistory({ dataRoot, limit: 4 });
    const detail = await state.loadRouteDetail({ dataRoot, routeId: route.route_id });
    const replay = await state.loadRouteReplay({ dataRoot, routeId: route.route_id });
    const artifact = await state.loadRouteArtifact({ dataRoot, routeId: route.route_id, artifact: "route" });
    const blockedArtifact = await state.loadRouteArtifact({ dataRoot, routeId: route.route_id, artifact: "not_allowed" });
    const shapes = [
      shape("route_current", current, ["ok", "version", "current", "projection", "current_route_path"], {
        route_id: current.current?.route_id || null,
        rail_count: current.projection?.vision_rail?.length || 0,
      }),
      shape("route_history", history, ["ok", "version", "history_path", "count", "items", "current_route_id"], {
        count: history.count || 0,
        item_keys_missing: hasKeys(history.items?.[0] || {}, ["route_id", "status", "package_ok", "promotion_ok"]),
      }),
      shape("route_detail", detail, ["ok", "version", "route_id", "status", "paths", "route", "route_packet", "artifact_summary", "proof_links"], {
        route_file: detail.paths?.route_file || null,
      }),
      shape("route_replay", replay, ["ok", "version", "replay_version", "route_id", "event_count", "events", "cursors", "initial_macro_statuses", "final_macro_statuses"], {
        event_count: replay.event_count || 0,
        cursor_count: replay.cursors?.length || 0,
        first_event: replay.events?.[0]?.type || null,
      }),
      shape("route_artifact", artifact, ["ok", "version", "artifact_version", "route_id", "artifact", "selected", "available", "meta", "content"], {
        artifact: artifact.artifact || null,
        bytes: artifact.meta?.bytes || 0,
      }),
      shape("route_artifact_blocked", blockedArtifact, ["ok", "version", "route_id", "artifact", "error", "available"], {
        blocked: blockedArtifact.ok === false,
        available_count: blockedArtifact.available?.length || 0,
      }),
    ];
    const semanticFailures = [];
    if (current.current?.route_id !== route.route_id) semanticFailures.push("current route_id mismatch");
    if ((current.projection?.vision_rail?.length || 0) !== 8) semanticFailures.push("current projection must expose 8 macro actions");
    if ((history.items || []).length < 1) semanticFailures.push("history must include planned route");
    if (!detail.ok || detail.route_id !== route.route_id) semanticFailures.push("detail route mismatch");
    if (!replay.ok || (replay.events || []).length < 2 || replay.events?.[0]?.type !== "route_planned") semanticFailures.push("replay must start with route_planned and include events");
    if (!artifact.ok || !String(artifact.content || "").includes(route.route_id)) semanticFailures.push("route artifact preview must include route_id");
    if (blockedArtifact.ok !== false || !blockedArtifact.error) semanticFailures.push("blocked artifact must fail closed with an error");
    const shapeFailures = shapes.filter((item) => !item.ok || (item.item_keys_missing && item.item_keys_missing.length));
    return {
      ok: shapeFailures.length === 0 && semanticFailures.length === 0,
      data_root: dataRoot,
      route_id: route.route_id,
      shapes,
      shape_failures: shapeFailures.map((item) => item.name),
      semantic_failures: semanticFailures,
    };
  }));

  checks.push(await gate("undocumented_public_routes_reported", async () => {
    if (!loaded) loaded = await loadOpenApiSpec();
    if (!sourceRoutes) {
      const source = await fs.readFile(path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs"), "utf8");
      sourceRoutes = routeLiterals(source);
    }
    const documented = new Set(documentedOperations(loaded.spec).map((op) => specPathToSourceNeedle(op.path)));
    const candidates = [...sourceRoutes]
      .filter((route) => route.startsWith("/api/v4/"))
      .filter((route) => !documented.has(route))
      .sort();
    const knownCompatibility = candidates.filter((route) => KNOWN_UNDOCUMENTED_COMPATIBILITY_ROUTES.has(route));
    const undocumented = candidates.filter((route) => !KNOWN_UNDOCUMENTED_COMPATIBILITY_ROUTES.has(route));
    return {
      ok: true,
      status: "reported",
      documented_count: documented.size,
      known_compatibility_count: knownCompatibility.length,
      known_compatibility_routes: knownCompatibility,
      undocumented_count: undocumented.length,
      undocumented_sample: undocumented.slice(0, 80),
      note: "Drift report is informational. Known legacy aliases stay undocumented so the active OpenAPI contract remains product-clean.",
    };
  }, { required: false }));

  const failures = checks.filter((check) => check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    version: API_DOCTOR_VERSION,
    created_at: new Date().toISOString(),
    spec_path: SPEC_PATH,
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
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const writeReceipt = process.argv.includes("--receipt");
  const out = await runApiDoctor({ writeReceipt });
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} OpenAPI contract checks`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.name} ${failure.error || ""}`);
  }
  if (!out.ok) process.exit(4);
}
