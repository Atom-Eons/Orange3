#!/usr/bin/env node
/* alpha7-doctor.mjs - ORANGEBOX Silent Canvas alpha.7 readiness doctor.
 *
 * This is intentionally sidecar-free by default. It creates an isolated temp
 * data root, instantiates a real Surface Factory workspace, exercises the
 * proof gates, and source-probes native UI locks that are hard to test without
 * launching egui.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { runPromptEval } from "./prompt-eval.mjs";
import { runBenefitsGate } from "./benefits.mjs";
import { runVisualEngineDoctor } from "./visual-engine-doctor.mjs";
import { runWirePathGate } from "./wire-path-gate.mjs";
import { createSurface } from "./surface-factory.mjs";
import {
  applyMutation,
  getActiveBoundingBox,
  listSnapshots,
  loadOrInit,
  loadSnapshotFile,
  restoreSnapshot,
  snapshot,
  workspaceState,
} from "./project-graph.mjs";
import {
  FREEZE_ALL_ROOT,
  checkPathAllowed,
  dispatchAllowed,
  getFreezeState,
  setFreeze,
} from "./freeze-guard.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const ALPHA7_DOCTOR_VERSION = "orangebox-alpha7-readiness/v1";

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function tempRoot() {
  return path.join(os.tmpdir(), `obx-alpha7-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
}

function restoreDataRoot(value) {
  if (value === undefined) delete process.env.ORANGEBOX_DATA_ROOT;
  else process.env.ORANGEBOX_DATA_ROOT = value;
}

function compactText(value, max = 3000) {
  const text = String(value || "");
  return text.length > max ? text.slice(0, max) + "\n...[truncated]" : text;
}

function isPortableRoot() {
  const base = path.basename(ROOT).toLowerCase();
  return base.includes("portable")
    && fsSync.existsSync(path.join(ROOT, "orangebox.exe"))
    && fsSync.existsSync(path.join(ROOT, "node.exe"));
}

function sha256FileSync(file) {
  return crypto.createHash("sha256").update(fsSync.readFileSync(file)).digest("hex");
}

async function portableNativeBinaryProbe() {
  const exe = path.join(ROOT, "orangebox.exe");
  const node = path.join(ROOT, "node.exe");
  const cargoToml = path.join(ROOT, "src-tauri", "Cargo.toml");
  const cargoLock = path.join(ROOT, "src-tauri", "Cargo.lock");
  const libRs = path.join(ROOT, "src-tauri", "src", "lib.rs");
  const mainRs = path.join(ROOT, "src-tauri", "src", "main.rs");
  const nativeRs = path.join(ROOT, "src-tauri", "src", "bin", "native.rs");
  const required = [exe, node, cargoToml, cargoLock, libRs, mainRs, nativeRs];
  const missing = required.filter((file) => !fsSync.existsSync(file));
  return {
    ok: missing.length === 0,
    portable_root: ROOT,
    reason: "portable packages prove the shipped native binary plus native source/provenance files; source-root cargo check remains the compile gate",
    files: {
      orangebox_exe: fsSync.existsSync(exe) ? {
        path: exe,
        size: fsSync.statSync(exe).size,
        sha256: sha256FileSync(exe),
      } : null,
      node_exe: fsSync.existsSync(node) ? {
        path: node,
        size: fsSync.statSync(node).size,
      } : null,
      cargo_toml: cargoToml,
      cargo_lock: cargoLock,
      lib_rs: libRs,
      main_rs: mainRs,
      native_rs: nativeRs,
    },
    missing,
  };
}

async function writeSyntheticRunReceipt(dataRoot) {
  const dir = path.join(dataRoot, "receipts", "v4");
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, "silent-canvas-run-alpha7-doctor-fixture.json");
  const now = new Date().toISOString();
  await fs.writeFile(fp, JSON.stringify({
    id: "silent-canvas-run-alpha7-doctor-fixture",
    source: "silent-canvas-run",
    ts: now,
    title: "Alpha.7 doctor synthetic Silent Canvas run",
    summary: "Fixture receipt proving benefits gate parsing without model/API calls.",
    evidence: {
      benefit_reduced_api_expenses: { total_cost_usd: 0 },
      benefit_lower_latency: {
        latency_ms_objective: 900,
        latency_ms_roadmap: 2100,
        latency_ms_first_mutation: 3200,
        latency_ms_summary: 500,
        latency_ms_total: 4200,
      },
      benefit_consistent_formatting: {
        parse_success: true,
        schema_valid: true,
        parse_attempt: 1,
      },
    },
  }, null, 2));
  return fp;
}

async function runCommand(command, { cwd, timeoutMs = 180000 } = {}) {
  const started = Date.now();
  return await new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        command,
        cwd,
        duration_ms: Date.now() - started,
        stdout_tail: compactText(stdout),
        stderr_tail: compactText(stderr),
      });
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      done({ ok: false, exit_code: null, error: "timeout" });
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", (err) => done({ ok: false, exit_code: null, error: err.message }));
    child.on("close", (code) => done({ ok: code === 0, exit_code: code, error: code === 0 ? null : `exit ${code}` }));
  });
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

async function nativeSourceProbe() {
  const nativePath = path.join(ROOT, "src-tauri", "src", "bin", "native.rs");
  const src = await fs.readFile(nativePath, "utf8");
  const requiredSnippets = [
    "sc_snapshot_replay_mode",
    "sc_snapshot_replay_last_step",
    "sc_snapshot_morph_started_at",
    "sc_snapshot_morph_label",
    "render_snapshot_scrubber",
    "vt_draw_rewind_morph",
    "Z-AXIS REWIND",
    "\"REPLAY\"",
    "chat_dispatch_locked",
    "render_send_lock_pulse",
    "elapsed_ms > 2500",
    "sc_last_viewport_json",
    "\"native_visual_telemetry_fit\"",
    "\"viewport\"",
    "alpha7_readiness_json",
    "render_alpha7_readiness_card",
    "/api/v4/silent-canvas/alpha7-doctor",
    "ALPHA.7 READINESS",
    "toggle_freeze_all",
    "egui::Key::Period",
    "egui::Key::B",
    "FREEZE",
  ];
  const missing = requiredSnippets.filter((snippet) => !src.includes(snippet));
  return {
    ok: missing.length === 0,
    file: nativePath,
    checked: requiredSnippets,
    missing,
  };
}

async function routeSourceProbe() {
  const routesPath = path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs");
  const cliPath = path.join(ROOT, "scripts", "obx.mjs");
  const routes = await fs.readFile(routesPath, "utf8");
  const cli = await fs.readFile(cliPath, "utf8");
  const requiredRoutes = [
    "/api/v4/silent-canvas/benefits",
    "/api/v4/silent-canvas/wire-gate",
    "/api/v4/silent-canvas/active-bbox",
    "/api/v4/silent-canvas/workspace-state",
    "/api/v4/freeze/set",
    "/api/v4/silent-canvas/relevance-doctor",
    "/api/v4/silent-canvas/visual-engine-doctor",
    "freezeAllBlock(\"silent-canvas-run\")",
  ];
  const requiredCli = [
    "prompt-eval",
    "benefits-gate",
    "wire-gate",
    "active-bbox",
    "workspace-state",
    "relevance-doctor",
    "visual-engine-doctor",
  ];
  const missingRoutes = requiredRoutes.filter((snippet) => !routes.includes(snippet));
  const missingCli = requiredCli.filter((snippet) => !cli.includes(snippet));
  return {
    ok: missingRoutes.length === 0 && missingCli.length === 0,
    files: [routesPath, cliPath],
    missing_routes: missingRoutes,
    missing_cli: missingCli,
  };
}

async function webCockpitSourceProbe() {
  const indexPath = path.join(ROOT, "src", "v4", "index.html");
  const jsPath = path.join(ROOT, "src", "v4", "see-suite.js");
  const cssPath = path.join(ROOT, "src", "v4", "see-suite.css");
  const index = await fs.readFile(indexPath, "utf8");
  const js = await fs.readFile(jsPath, "utf8");
  const css = await fs.readFile(cssPath, "utf8");
  const requiredIndex = [
    "alpha7ReadinessPanel",
    "Alpha.7 Readiness",
    "alpha7RefreshBtn",
    "relevanceDoctorBtn",
    "alpha7Score",
    "alpha7CheckList",
  ];
  const requiredJs = [
    "readinessState",
    "function alpha7Check",
    "function renderAlpha7Readiness",
    "async function refreshAlpha7Readiness",
    "async function refreshRelevanceDoctor",
    "/api/v4/silent-canvas/alpha7-doctor",
    "/api/v4/silent-canvas/relevance-doctor",
    "setInterval(refreshAlpha7Readiness, 30000)",
  ];
  const requiredCss = [
    ".alpha7-readiness-panel",
    ".alpha7-refresh-btn",
    ".alpha7-secondary-btn",
    ".alpha7-score-card",
    ".alpha7-check-card",
  ];
  const missingIndex = requiredIndex.filter((snippet) => !index.includes(snippet));
  const missingJs = requiredJs.filter((snippet) => !js.includes(snippet));
  const missingCss = requiredCss.filter((snippet) => !css.includes(snippet));
  return {
    ok: missingIndex.length === 0 && missingJs.length === 0 && missingCss.length === 0,
    files: [indexPath, jsPath, cssPath],
    checked: {
      index: requiredIndex,
      js: requiredJs,
      css: requiredCss,
    },
    missing_index: missingIndex,
    missing_js: missingJs,
    missing_css: missingCss,
  };
}

async function freezeAllProbe(dataRoot, workspace) {
  const previous = process.env.ORANGEBOX_DATA_ROOT;
  process.env.ORANGEBOX_DATA_ROOT = dataRoot;
  try {
    setFreeze({ active: true, root: FREEZE_ALL_ROOT, scope: "global" });
    const state = getFreezeState();
    const dispatch = dispatchAllowed("alpha7-doctor");
    const writeCheck = checkPathAllowed(path.join(workspace, "README.md"));
    setFreeze({ active: false, root: null, scope: "global" });
    const cleared = getFreezeState();
    return {
      ok: state.freeze_all === true && dispatch.allowed === false && writeCheck.allowed === false && cleared.active === false,
      state,
      dispatch,
      write_check: writeCheck,
      cleared,
    };
  } finally {
    restoreDataRoot(previous);
  }
}

async function snapshotProbe(workspace) {
  const first = await snapshot(workspace, "alpha7-doctor-a");
  const second = await snapshot(workspace, "alpha7-doctor-b");
  const listed = await listSnapshots(workspace, { limit: 10 });
  const loaded = await loadSnapshotFile(workspace, second.file);
  const restored = await restoreSnapshot(workspace, { file: first.file, reason: "alpha7-doctor" });
  return {
    ok: listed.items.length >= 2 && loaded?.workspace && restored.ok === true,
    first,
    second,
    listed_count: listed.items.length,
    loaded_nodes: loaded.nodes?.length || 0,
    restored,
  };
}

export async function runAlpha7Doctor({
  writeReceipt = false,
  full = false,
  keepTemp = false,
} = {}) {
  const dataRoot = tempRoot();
  const startedAt = new Date().toISOString();
  const checks = [];
  let surfaceResult = null;
  let workspace = null;
  const previousDataRoot = process.env.ORANGEBOX_DATA_ROOT;

  await fs.mkdir(dataRoot, { recursive: true });
  process.env.ORANGEBOX_DATA_ROOT = dataRoot;

  checks.push(await gate("prompt_eval", async () => {
    const out = await runPromptEval({ writeReceipt: false });
    return {
      ok: out.ok,
      creative_version: out.prompts?.creative?.version,
      interpreter_version: out.prompts?.interpreter?.version,
      success: out.fewshots?.valid_success_cases,
      success_total: out.fewshots?.success_cases,
      repairs: out.fewshots?.valid_failure_repairs,
      repairs_total: out.fewshots?.failure_cases,
      failures: out.failures || [],
    };
  }));

  checks.push(await gate("surface_factory_fixture", async () => {
    surfaceResult = await createSurface({
      name: "alpha7 doctor fixture",
      description: "Isolated ORANGEBOX alpha.7 readiness fixture",
      dataRoot,
    });
    workspace = surfaceResult.surface.workspace;
    for (let i = 0; i < 12; i++) {
      await applyMutation(workspace, "alpha7-doctor:offscreen-fixtures", {
        id: `alpha7-offscreen-${i}`,
        kind: "node_create",
        target: `alpha7-offscreen-${i}`,
        details: {
          element_kind: "fixture",
          label: `Offscreen Fixture ${i}`,
          x: 1600 + (i % 4) * 180,
          y: 1200 + Math.floor(i / 4) * 120,
          w: 150,
          h: 80,
        },
      });
    }
    const g = await loadOrInit(workspace);
    return {
      ok: surfaceResult.ok && g.nodes.length >= 18 && g.wires.length >= 3,
      surface_id: surfaceResult.surface.surface_id,
      workspace,
      graph: {
        nodes: g.nodes.length,
        wires: g.wires.length,
        regions: g.regions.length,
        annotations: g.annotations.length,
      },
      registry_path: surfaceResult.registry_path,
    };
  }));

  checks.push(await gate("wire_path_gate", async () => {
    if (!workspace) throw new Error("surface fixture not available");
    const out = await runWirePathGate({ workspace, tolerancePx: 1, samples: 9, writeReceipt: false });
    return {
      ok: out.ok && out.counts.checked_wires >= 3,
      counts: out.counts,
      tolerance_px: out.tolerance_px,
      failures: out.failures,
    };
  }));

  checks.push(await gate("active_bbox_projection", async () => {
    if (!workspace) throw new Error("surface fixture not available");
    const out = await getActiveBoundingBox(workspace, {
      viewport: { x: 0, y: 0, w: 900, h: 520 },
      maxNodes: 8,
      padding: 60,
    });
    return {
      ok: out.ok && out.strategy === "viewport" && out.totals.nodes_included > 0 && out.totals.nodes_included < out.totals.nodes_total,
      strategy: out.strategy,
      bbox: out.bbox,
      totals: out.totals,
    };
  }));

  checks.push(await gate("workspace_state_isolation", async () => {
    if (!workspace) throw new Error("surface fixture not available");
    const out = await workspaceState(workspace);
    return {
      ok: out.ok && out.counts.nodes >= 6 && Number.isFinite(Number(out.workspace_version)),
      workspace_version: out.workspace_version,
      state_fingerprint: out.state_fingerprint,
      counts: out.counts,
    };
  }));

  checks.push(await gate("snapshot_replay_data_path", async () => {
    if (!workspace) throw new Error("surface fixture not available");
    return await snapshotProbe(workspace);
  }));

  checks.push(await gate("benefits_gate_fixture", async () => {
    const fixture = await writeSyntheticRunReceipt(dataRoot);
    const out = await runBenefitsGate({
      dataRoot,
      minRuns: 1,
      limit: 20,
      writeReceipt: false,
      requireLatency: true,
      requireFormatting: true,
      requireCost: false,
    });
    return {
      ok: out.ok && out.gate?.status === "pass",
      fixture,
      gate: out.gate,
      aggregate: {
        run_count: out.aggregate?.run_count,
        consistent_formatting: out.aggregate?.consistent_formatting,
        lower_latency: out.aggregate?.lower_latency,
        reduced_api_expenses: out.aggregate?.reduced_api_expenses,
      },
    };
  }));

  checks.push(await gate("freeze_all_guard", async () => {
    if (!workspace) throw new Error("surface fixture not available");
    return await freezeAllProbe(dataRoot, workspace);
  }));

  checks.push(await gate("native_ui_source_probe", nativeSourceProbe));
  checks.push(await gate("web_see_suite_source_probe", webCockpitSourceProbe));
  checks.push(await gate("route_and_cli_source_probe", routeSourceProbe));
  checks.push(await gate("aigui_visual_engine_doctor", async () => {
    return await runVisualEngineDoctor({ writeReceipt: false });
  }));

  if (full) {
    checks.push(await gate("npm_check", async () => {
      const out = await runCommand("npm.cmd run check", { cwd: ROOT, timeoutMs: 180000 });
      return { ok: out.ok, ...out };
    }));
    checks.push(await gate("cargo_check_native", async () => {
      if (isPortableRoot()) return await portableNativeBinaryProbe();
      const out = await runCommand("cargo check --bin orangebox", { cwd: path.join(ROOT, "src-tauri"), timeoutMs: 300000 });
      return { ok: out.ok, ...out };
    }));
  }

  const failures = checks.filter((check) => check.required && !check.ok);
  const warnings = checks.filter((check) => !check.required && !check.ok);
  const result = {
    ok: failures.length === 0,
    doctor: "alpha7-readiness",
    doctor_version: ALPHA7_DOCTOR_VERSION,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    root: ROOT,
    isolated_data_root: dataRoot,
    temp_retained: keepTemp,
    full,
    surface: surfaceResult?.surface || null,
    workspace,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
      warnings: warnings.length,
    },
    checks,
    failures,
    warnings,
  };

  if (writeReceipt) {
    const receiptDir = path.join(ROOT, "receipts");
    await fs.mkdir(receiptDir, { recursive: true });
    const stamp = stampForFile();
    const receiptPath = path.join(receiptDir, `orangebox-alpha7-readiness-doctor-${stamp}.json`);
    await fs.writeFile(receiptPath, JSON.stringify({
      receipt_id: `orangebox-alpha7-readiness-doctor-${stamp}`,
      project: "ORANGEBOX",
      scope: "Silent Canvas alpha.7 readiness doctor",
      timestamp: new Date().toISOString(),
      summary: result.ok
        ? `Alpha.7 readiness passed ${result.summary.passed}/${result.summary.checks} checks.`
        : `Alpha.7 readiness failed ${result.summary.failed} required check(s).`,
      result,
    }, null, 2));
    result.receipt_path = receiptPath;
  }

  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  restoreDataRoot(previousDataRoot);

  return result;
}

function readFlag(argv, name, fallback = null) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return argv.includes(`--${name}`) ? true : fallback;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runAlpha7Doctor({
    writeReceipt: argv.includes("--receipt"),
    full: argv.includes("--full"),
    keepTemp: argv.includes("--keep-temp"),
  });
  if (readFlag(argv, "json", false) || argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "[ok]" : "[fail]"} ORANGEBOX alpha.7 readiness`);
    console.log(`  checks:   ${result.summary.passed}/${result.summary.checks}`);
    console.log(`  failures: ${result.summary.failed}`);
    console.log(`  full:     ${result.full}`);
    if (result.workspace) console.log(`  fixture:  ${result.workspace}`);
    if (result.receipt_path) console.log(`  receipt:  ${result.receipt_path}`);
    for (const failure of result.failures.slice(0, 8)) {
      console.log(`  failure:  ${failure.name} ${failure.error || failure.evidence?.error || ""}`);
    }
  }
  if (!result.ok) process.exit(1);
}
