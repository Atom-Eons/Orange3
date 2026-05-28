#!/usr/bin/env node
/* ae-see-suite-visual-proof.mjs - screenshot proof for AE See-Suite.
 *
 * This is the creation-facing visual gate. It proves the top surface renders as
 * AE See-Suite with the Bluebird creation command, Mission Spine, Silent Canvas,
 * Pipeline Observatory, Artifact Library, proof language, and AE Operations path.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  captureChromiumShot,
  chromiumExecutable as resolveChromiumExecutable,
  dumpChromiumDom,
} from "./chromium-proof-runner.mjs";

export const AE_SEE_SUITE_VISUAL_PROOF_VERSION = "orangebox-ae-see-suite-visual-proof/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const PROOF_DIR = path.join(ROOT, "proof");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const SERVER_SCRIPT = path.join(ROOT, "scripts", "orangebox-command-server.mjs");
const VISUAL_DIRECTION_DOC = path.join(ROOT, "docs", "AE_SEE_SUITE_INTERFACE_DIRECTION.md");
const VISUAL_DIRECTION_SOURCE_PDF = process.env.ORANGEBOX_VISUAL_DIRECTION_PDF ||
  "C:\\Users\\a\\Downloads\\AE-See-Suite-Interface-Direction-v1.pdf";

const REQUIRED_DOM_TEXT = [
  /<title>\s*AE See-Suite[\s\S]*ORANGEBOX\s*<\/title>/i,
  /<span class="lane-label">\s*AE See-Suite\s*<\/span>/i,
  /A living canvas for serious creation/i,
  /without falling into chat scroll/i,
  /<h2 class="bluebird-title">\s*What are we building\?\s*<\/h2>/i,
  /Start Creating/i,
  /Build App/i,
  /Design Workflow/i,
  /Create Dashboard/i,
  /Set Up AI Computer/i,
  /data-setup-ai-computer="true"/i,
  /Review Project/i,
  /Package Release/i,
  /Import References/i,
  /Release Handoff/i,
  /Current build/i,
  /Latest Proof/i,
  /Advanced AI Computer path/i,
  /Recent Missions/i,
  /route packet, proof gates, and artifacts/i,
  /Freeze-All/i,
  /Mission Spine/i,
  /Artifact Library/i,
  /Silent Canvas/i,
  /Live Canvas/i,
  /Project graph nodes and wires/i,
  /Diff proof/i,
  /Mutation Replay/i,
  /Replay Inspector/i,
  /workspaceReplayRange/i,
  /workspaceInspectorStatus/i,
  /Pipeline Observatory/i,
  /Relevance Controller/i,
  /Proof Promise/i,
  /AE Operations/i,
  /ORANGEBOX v6\.3\.0-alpha\.7/i,
];

const FORBIDDEN_DOM_TEXT = [
  /BLUEB0X/i,
  /<title>[^<]*Cockpit[^<]*<\/title>/i,
  />\s*Cockpit\s*</i,
  /Cockpit \(Ctrl/i,
  /Welcome to ORANGEBOX v6\.3 alpha\.7/i,
  /private AI operations cockpit/i,
  /Could not reach the cockpit/i,
  /inside the cockpit/i,
  /Back to cockpit/i,
  /Open in cockpit/i,
  /aria-label="Codexa status"/i,
  /<span class="chip-label">codexa<\/span>/i,
  />\s*Codexa\s*</i,
  /Codexa Cloud/i,
  /Codexa Probe/i,
  /â|Â|Ã|�/,
];

const REQUIRED_VISUAL_DIRECTION_TEXT = [
  { id: "emotional_target", pattern: /slow[\s\S]*mellow[\s\S]*fun[\s\S]*chill[\s\S]*awe/i },
  { id: "front_back_model", pattern: /AE See-Suite is the front side[\s\S]*AE Operations is the back side/i },
  { id: "creation_surface", pattern: /Creation Surface Pattern[\s\S]*Mission input[\s\S]*Silent Canvas/i },
  { id: "silent_canvas_direction", pattern: /Silent Canvas Direction[\s\S]*HSMP mutations[\s\S]*Pipeline Observatory/i },
  { id: "state_backed_living_layer", pattern: /Every living effect should be backed by real state/i },
  { id: "cyan_as_accent", pattern: /Use teal and cyan as accents, not the dominant mood/i },
  { id: "motion_pacing", pattern: /Prefer 250-450ms layout motion[\s\S]*Prefer 1\.2-2\.0s fades/i },
];

const REQUIRED_VISUAL_CSS_TEXT = [
  { id: "warm_workbench_background", pattern: /radial-gradient\(circle at 18% 0%, rgba\(255,178,89,0\.16\)/i },
  { id: "lavender_warmth", pattern: /#D8B4FE/i },
  { id: "gold_warmth", pattern: /#FFB86B/i },
  { id: "slow_breathing", pattern: /see-workbench-breathe 11s/i },
  { id: "reduced_motion", pattern: /prefers-reduced-motion:\s*reduce/i },
];

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function safeStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function compact(value, max = 1200) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function inspectVisualDirectionContract() {
  const [docText, cssText] = await Promise.all([
    fs.readFile(VISUAL_DIRECTION_DOC, "utf8").catch(() => null),
    fs.readFile(path.join(ROOT, "src", "v4", "see-suite.css"), "utf8").catch(() => null),
  ]);
  const missing = [];
  if (!docText) {
    missing.push({ source: "doc", id: "visual_direction_doc", path: VISUAL_DIRECTION_DOC });
  } else {
    for (const item of REQUIRED_VISUAL_DIRECTION_TEXT) {
      if (!item.pattern.test(docText)) missing.push({ source: "doc", id: item.id, pattern: item.pattern.source });
    }
  }
  if (!cssText) {
    missing.push({ source: "css", id: "see_suite_css", path: path.join(ROOT, "src", "v4", "see-suite.css") });
  } else {
    for (const item of REQUIRED_VISUAL_CSS_TEXT) {
      if (!item.pattern.test(cssText)) missing.push({ source: "css", id: item.id, pattern: item.pattern.source });
    }
  }
  const sourcePdfExists = fsSync.existsSync(VISUAL_DIRECTION_SOURCE_PDF);
  const sourcePdfStat = sourcePdfExists ? fsSync.statSync(VISUAL_DIRECTION_SOURCE_PDF) : null;
  return {
    ok: missing.length === 0,
    source: "operator-provided visual guide",
    source_pdf: {
      path: VISUAL_DIRECTION_SOURCE_PDF,
      exists: sourcePdfExists,
      bytes: sourcePdfStat?.size || 0,
    },
    compiled_doc: {
      path: VISUAL_DIRECTION_DOC,
      exists: Boolean(docText),
      bytes: docText ? Buffer.byteLength(docText, "utf8") : 0,
      sha256: docText ? sha256Text(docText) : null,
    },
    css_contract: {
      path: path.join(ROOT, "src", "v4", "see-suite.css"),
      exists: Boolean(cssText),
      bytes: cssText ? Buffer.byteLength(cssText, "utf8") : 0,
      sha256: cssText ? sha256Text(cssText) : null,
    },
    required_direction_count: REQUIRED_VISUAL_DIRECTION_TEXT.length,
    required_css_count: REQUIRED_VISUAL_CSS_TEXT.length,
    missing,
  };
}

function requestJson(baseUrl, endpoint, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const url = new URL(endpoint, baseUrl);
    const req = http.request(url, { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(data || "{}") });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `invalid JSON: ${err.message}`, raw: compact(data) });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err?.message || String(err) }));
    req.end();
  });
}

function postJson(baseUrl, endpoint, body = {}, timeoutMs = 8000) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body);
    const url = new URL(endpoint, baseUrl);
    const req = http.request(url, {
      method: "POST",
      timeout: timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: JSON.parse(data || "{}") });
        } catch (err) {
          resolve({ ok: false, status: res.statusCode, error: `invalid JSON: ${err.message}`, raw: compact(data) });
        }
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (err) => resolve({ ok: false, status: 0, error: err?.message || String(err) }));
    req.write(payload);
    req.end();
  });
}

function requestTextUrl(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.request(new URL(url), { method: "GET", timeout: timeoutMs }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`HTTP ${res.statusCode} while fetching ${url}: ${compact(data, 600)}`));
      });
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

async function seedSilentCanvasFixture(baseUrl) {
  const result = await postJson(baseUrl, "/api/v4/surfaces/create", {
    name: "Visual Proof Active Canvas",
    template_id: "core-v1",
    description: "Temporary AE See-Suite visual proof fixture with real Silent Canvas graph nodes and wires.",
    overwrite: true,
  }, 60000);
  if (!result.ok) {
    throw new Error(`failed to seed Silent Canvas visual fixture: HTTP ${result.status} ${result.error || compact(JSON.stringify(result.body || result.raw || {}), 800)}`);
  }
  const surface = result.body?.surface || {};
  const graph = result.body?.graph || {};
  let workspaceState = null;
  if (surface.workspace) {
    const endpoint = `/api/v4/silent-canvas/workspace-state?workspace=${encodeURIComponent(surface.workspace)}`;
    const expectedNodes = Number(graph.nodes || 0);
    for (let attempt = 1; attempt <= 8; attempt += 1) {
      const state = await requestJson(baseUrl, endpoint, 10000);
      const latestMutations = Array.isArray(state.body?.latest_mutations) ? state.body.latest_mutations : [];
      const proofLinkedMutations = latestMutations.filter((mutation) => mutation?.proof_link?.kind === "receipt");
      const proofLinks = Array.isArray(state.body?.proof_links) ? state.body.proof_links : [];
      workspaceState = {
        attempt,
        ok: state.ok,
        status: state.status,
        counts: state.body?.counts || null,
        recovery_state: state.body?.recovery_state || null,
        latest_mutations: {
          count: latestMutations.length,
          with_receipt_proof: proofLinkedMutations.length,
          latest_proof_title: proofLinkedMutations[proofLinkedMutations.length - 1]?.proof_link?.title || null,
          proof_links: proofLinks.length,
        },
        visual_sample: state.body?.visual_sample ? {
          strategy: state.body.visual_sample.strategy || null,
          nodes: Array.isArray(state.body.visual_sample.nodes) ? state.body.visual_sample.nodes.length : 0,
          wires: Array.isArray(state.body.visual_sample.wires) ? state.body.visual_sample.wires.length : 0,
        } : null,
        error: state.error || null,
      };
      if (state.ok && Number(state.body?.counts?.nodes || 0) >= expectedNodes) break;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  return {
    ok: true,
    surface_id: surface.surface_id || null,
    workspace: surface.workspace || null,
    graph,
    workspace_state_after_seed: workspaceState,
  };
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function startTemporaryServer() {
  const port = await freePort();
  const tunnelPort = await freePort();
  const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "orangebox-ae-see-suite-data-"));
  const child = spawn(process.execPath, [
    SERVER_SCRIPT,
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--root",
    dataRoot,
    "--no-start-receipt",
  ], {
    cwd: ROOT,
    env: {
      ...process.env,
      ORANGEBOX_DATA_ROOT: dataRoot,
      ORANGEBOX_NO_START_RECEIPT: "1",
      ORANGEBOX_TUNNEL_PORT: String(tunnelPort),
      ORANGEBOX_TUNNEL_HOST: "127.0.0.1",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const probe = await requestJson(baseUrl, "/api/status?fast=1", 2000);
    if (probe.ok) {
      return {
        baseUrl,
        dataRoot,
        started: true,
        stop: async () => {
          if (!child.killed) child.kill();
          await new Promise((resolve) => setTimeout(resolve, 350));
        },
        output: () => ({ stdout_tail: compact(stdout, 1800), stderr_tail: compact(stderr, 1800) }),
      };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  if (!child.killed) child.kill();
  throw new Error(`temporary ORANGEBOX server did not become ready on ${baseUrl}: ${compact(stderr || stdout)}`);
}

async function chromiumExecutable() {
  return resolveChromiumExecutable("AE See-Suite visual proof");
}

async function captureShot(browser, url, shot, profileBase) {
  return captureChromiumShot(browser, url, shot, profileBase, { cwd: ROOT, timeoutMs: 45000 });
}

async function dumpDom(browser, url, profile) {
  const dom = await dumpChromiumDom(browser, url, profile, { cwd: ROOT });
  return dom || requestTextUrl(url, 10000);
}

async function writeAeSeeSuiteVisualReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-ae-see-suite-visual-proof-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runAeSeeSuiteVisualProof({
  writeReceipt = false,
  startServer = true,
  baseUrl = null,
  forceTempServer = false,
  seedFixture = false,
  keepTemp = false,
  proofDir = PROOF_DIR,
} = {}) {
  await fs.mkdir(proofDir, { recursive: true });
  const id = `${safeStamp()}-ae-see-suite`;
  const desktop = path.join(proofDir, `${id}-desktop.png`);
  const compactShot = path.join(proofDir, `${id}-compact.png`);
  const silentCanvasShot = path.join(proofDir, `${id}-silent-canvas.png`);
  let runtime = {
    baseUrl: baseUrl || `http://127.0.0.1:${process.env.ORANGEBOX_PORT || 8787}`,
    started: false,
    stop: async () => {},
    output: () => ({}),
  };
  let seededSilentCanvas = null;
  const startedAt = new Date().toISOString();
  try {
    const probe = forceTempServer
      ? { ok: false, error: "temporary server forced for current-file proof" }
      : await requestJson(runtime.baseUrl, "/api/status?fast=1", 3000);
    if (!probe.ok) {
      if (!startServer) throw new Error(probe.error || `ORANGEBOX server unavailable at ${runtime.baseUrl}`);
      runtime = await startTemporaryServer();
    }
    if (runtime.started || forceTempServer || seedFixture) {
      seededSilentCanvas = await seedSilentCanvasFixture(runtime.baseUrl);
    }
    const browser = await chromiumExecutable();
    const url = `${runtime.baseUrl}/v4/`;
    const silentCanvasUrl = `${runtime.baseUrl}/v4/#workspaceStatePanel`;
    const profileBase = path.join(os.tmpdir(), `orangebox-ae-see-suite-proof-${id}`);
    const dom = await dumpDom(browser, url, `${profileBase}-dom`);
    const desktopResult = await captureShot(browser, url, { name: "desktop", width: 1440, height: 1000, path: desktop }, profileBase);
    const compactResult = await captureShot(browser, url, { name: "compact", width: 390, height: 920, path: compactShot }, profileBase);
    const silentCanvasResult = await captureShot(browser, silentCanvasUrl, { name: "silent-canvas", width: 1440, height: 1000, path: silentCanvasShot }, profileBase);
    if (!keepTemp) {
      await fs.rm(`${profileBase}-dom`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-desktop`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-compact`, { recursive: true, force: true }).catch(() => {});
      await fs.rm(`${profileBase}-silent-canvas`, { recursive: true, force: true }).catch(() => {});
    }
    const missingText = REQUIRED_DOM_TEXT.filter((pattern) => !pattern.test(dom)).map((pattern) => pattern.source);
    const forbiddenTextHits = FORBIDDEN_DOM_TEXT.filter((pattern) => pattern.test(dom)).map((pattern) => pattern.source);
    const screenshots = [desktopResult, compactResult, silentCanvasResult];
    const visualDirection = await inspectVisualDirectionContract();
    const receiptCouplingMissing = Boolean(seededSilentCanvas?.ok) &&
      Number(seededSilentCanvas?.workspace_state_after_seed?.latest_mutations?.with_receipt_proof || 0) <= 0;
    const failures = [
      ...missingText.map((pattern) => ({ type: "missing_dom_text", pattern })),
      ...forbiddenTextHits.map((pattern) => ({ type: "forbidden_dom_text", pattern })),
      ...screenshots.filter((shot) => !shot.ok).map((shot) => ({ type: "screenshot", shot: shot.name, path: shot.path, bytes: shot.bytes })),
      ...visualDirection.missing.map((missing) => ({ type: "visual_direction_contract", ...missing })),
      ...(receiptCouplingMissing ? [{ type: "silent_canvas_receipt_coupling", message: "Seeded Silent Canvas replay events have no receipt proof link." }] : []),
    ];
    const result = {
      ok: failures.length === 0,
      version: AE_SEE_SUITE_VISUAL_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      id,
      proof_dir: proofDir,
      base_url: runtime.baseUrl,
      url,
      silent_canvas_url: silentCanvasUrl,
      browser,
      product_language: {
        top_surface: "AE See-Suite",
        operations_surface: "AE Operations",
      },
      seeded_silent_canvas: seededSilentCanvas,
      proof_contract: {
        creation_command_present: !missingText.includes("<h2 class=\"bluebird-title\">\\s*What are we building\\?\\s*<\\/h2>"),
        creation_modes_present: ["Build App", "Design Workflow", "Create Dashboard", "Set Up AI Computer", "Package Release"].every((text) => !missingText.includes(text)),
        mission_spine_present: !missingText.includes("Mission Spine"),
        silent_canvas_present: !missingText.includes("Silent Canvas"),
        silent_canvas_replay_controls_present: !missingText.includes("Mutation Replay") && !missingText.includes("workspaceReplayRange"),
        silent_canvas_replay_inspector_present: !missingText.includes("Replay Inspector") && !missingText.includes("workspaceInspectorStatus"),
        silent_canvas_receipt_coupling_present: Number(seededSilentCanvas?.workspace_state_after_seed?.latest_mutations?.with_receipt_proof || 0) > 0,
        pipeline_observatory_present: !missingText.includes("Pipeline Observatory"),
        artifact_library_present: !missingText.includes("Artifact Library"),
        operations_path_present: !missingText.includes("AE Operations"),
        visual_direction_source_locked: visualDirection.ok,
        stale_product_language_absent: forbiddenTextHits.length === 0,
        remote_ai_box_required: false,
        silent_canvas_active_fixture_seeded: Boolean(seededSilentCanvas?.ok),
      },
      visual_direction: visualDirection,
      screenshots,
      dom: {
        sha256: sha256Text(dom),
        bytes: Buffer.byteLength(dom, "utf8"),
        missing_required_text: missingText,
        forbidden_text_hits: forbiddenTextHits,
      },
      runtime_output: runtime.output(),
      failures,
      summary: {
        checks: 7,
        passed: failures.length === 0 ? 7 : Math.max(0, 7 - failures.length),
        failed: failures.length,
        warnings: 0,
      },
      receipt_path: null,
    };
    if (writeReceipt) result.receipt_path = await writeAeSeeSuiteVisualReceipt(result);
    return result;
  } catch (err) {
    const result = {
      ok: false,
      version: AE_SEE_SUITE_VISUAL_PROOF_VERSION,
      project: "ORANGEBOX",
      created_at: new Date().toISOString(),
      started_at: startedAt,
      proof_dir: proofDir,
      base_url: runtime.baseUrl,
      error: err?.message || String(err),
      stack: err?.stack ? compact(err.stack, 2000) : null,
      runtime_output: runtime.output(),
      failures: [{ type: "exception", message: err?.message || String(err) }],
      summary: { checks: 1, passed: 0, failed: 1, warnings: 0 },
      receipt_path: null,
    };
    if (writeReceipt) result.receipt_path = await writeAeSeeSuiteVisualReceipt(result);
    return result;
  } finally {
    await runtime.stop();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const out = await runAeSeeSuiteVisualProof({
    writeReceipt: argv.includes("--receipt"),
    startServer: !argv.includes("--no-start-server"),
    forceTempServer: argv.includes("--isolated") || argv.includes("--force-temp-server"),
    seedFixture: argv.includes("--seed-fixture"),
    keepTemp: argv.includes("--keep-temp"),
    baseUrl: argv.find((arg) => arg.startsWith("--base-url="))?.slice("--base-url=".length) || null,
    proofDir: argv.find((arg) => arg.startsWith("--proof-dir="))?.slice("--proof-dir=".length) || PROOF_DIR,
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`${out.ok ? "PASS" : "FAIL"} AE See-Suite visual proof ${out.summary.passed}/${out.summary.checks}`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures || []) console.log(`failure: ${failure.type} ${failure.message || failure.pattern || failure.path || ""}`);
  }
  if (!out.ok) process.exit(4);
}
