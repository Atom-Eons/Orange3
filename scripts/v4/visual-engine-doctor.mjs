#!/usr/bin/env node
/* visual-engine-doctor.mjs - ORANGEBOX AIGUI/Lumina visual engine doctor.
 *
 * This is source-level proof for the Bluebird visual guidance: living visuals
 * must be calm, event-driven, reduced-motion aware, and wired to Silent Canvas
 * state instead of decorative-only animation.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const VISUAL_ENGINE_DOCTOR_VERSION = "orangebox-aigui-visual-engine/v1";

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function readRel(rel) {
  return await fs.readFile(path.join(ROOT, rel), "utf8");
}

function check(name, ok, evidence = {}, recovery = "") {
  return {
    name,
    ok: !!ok,
    status: ok ? "pass" : "fail",
    evidence,
    recovery,
  };
}

function missingSnippets(src, snippets) {
  return snippets.filter((snippet) => !src.includes(snippet));
}

function numericSeconds(css, selector, prop = "animation") {
  const idx = css.indexOf(selector);
  if (idx < 0) return null;
  const sample = css.slice(idx, idx + 260);
  const rx = new RegExp(`${prop}:[^;]*?([0-9]+(?:\\.[0-9]+)?)s`);
  const match = sample.match(rx);
  return match ? Number(match[1]) : null;
}

async function writeReceipt(result) {
  const dir = path.join(ROOT, "receipts");
  await fs.mkdir(dir, { recursive: true });
  const receiptPath = path.join(dir, `orangebox-visual-engine-doctor-${stampForFile()}.json`);
  await fs.writeFile(receiptPath, JSON.stringify(result, null, 2), "utf8");
  return receiptPath;
}

export async function runVisualEngineDoctor({ writeReceipt: shouldWriteReceipt = false } = {}) {
  const startedAt = new Date().toISOString();
  const [
    lumina,
    native,
    css,
    js,
    settingsHtml,
    settingsCss,
    settingsJs,
    cli,
    routes,
  ] = await Promise.all([
    readRel(path.join("src-tauri", "src", "visual_lumina.rs")),
    readRel(path.join("src-tauri", "src", "bin", "native.rs")),
    readRel(path.join("src", "v4", "see-suite.css")),
    readRel(path.join("src", "v4", "see-suite.js")),
    readRel(path.join("src", "v4", "onboarding", "settings.html")),
    readRel(path.join("src", "v4", "onboarding", "settings.css")),
    readRel(path.join("src", "v4", "onboarding", "settings.js")),
    readRel(path.join("scripts", "obx.mjs")),
    readRel(path.join("scripts", "v4", "v4-server-routes.mjs")),
  ]);

  const primitiveSnippets = [
    "pub struct AnimatedRect",
    "pub fn lerp_rect",
    "pub fn draw_breathing_panel",
    "pub fn draw_soft_bloom",
    "pub fn draw_lumina_rim",
    "pub struct AmbientOrbs",
    "pub fn draw_flowing_trace",
  ];
  const eventSnippets = [
    "pub enum VisualEventKind",
    "BloomAt",
    "PhaseShift",
    "AttractParticles",
    "LightTrail",
    "BreathingIntensity",
    "CompletionPulse",
    "pub struct VisualEventQueue",
    "pub fn draw_visual_events",
  ];
  const qualitySnippets = [
    "pub enum LuminaQuality",
    "Low",
    "Medium",
    "High",
    "Focus",
    "reduced_motion",
    "effective_orb_config",
  ];
  const phaseSnippets = [
    "pub enum PipelinePhase",
    "Creative",
    "Fast",
    "pub fn phase_color",
  ];

  const primitiveMissing = missingSnippets(lumina, primitiveSnippets);
  const eventMissing = missingSnippets(lumina, eventSnippets);
  const qualityMissing = missingSnippets(lumina, qualitySnippets);
  const phaseMissing = missingSnippets(lumina, phaseSnippets);

  const nativeSnippets = [
    "render_visual_telemetry",
    "mod visual_lumina",
    "visual_lumina::soft_pulse",
    "visual_lumina::draw_flowing_trace",
    "visual_lumina::apply_lumina_mutation",
    "visual_lumina::draw_soft_bloom",
    "sc_visual_events",
    "sc_ambient_orbs",
    "visual_lumina::AmbientOrbs::new",
    "visual_lumina::draw_visual_events",
    "CanvasAnimationState",
    "visual_rect",
    "vt_draw_wire",
    "vt_draw_node",
    "render_snapshot_scrubber",
    "AIGUI visual engine",
    "sc_snapshot_replay_mode",
  ];
  const nativeMissing = missingSnippets(native, nativeSnippets);
  const webLivingSnippets = [
    "living-visual-layer",
    "living-bloom-field",
    "syncLivingVisuals",
    "emitLivingBloom",
    "lastMutationSignature",
    "lastObservatorySignature",
    "lastBoardSignature",
    "route-plan-start",
    "pipeline-observatory",
    "freeze-engaged",
    "prefers-reduced-motion",
  ];
  const webLivingSource = [css, js].join("\n");
  const webLivingMissing = missingSnippets(webLivingSource, webLivingSnippets);
  const operationsLivingSnippets = [
    "operations-living-layer",
    "operations-bloom-field",
    "syncOperationsLiving",
    "emitOperationsBloom",
    "operationsActivityFromBoard",
    "final-green-board",
    "closeout-plan",
    "ethereal-doctor",
    "prefers-reduced-motion",
  ];
  const operationsLivingSource = [settingsHtml, settingsCss, settingsJs].join("\n");
  const operationsLivingMissing = missingSnippets(operationsLivingSource, operationsLivingSnippets);

  const maxParticle = [...css.matchAll(/\.home-particles \.p:nth-child\((\d+)\)/g)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite)
    .reduce((max, n) => Math.max(max, n), 0);
  const hasParticleCap = css.includes(".home-particles .p:nth-child(n+16) { display: none; }");
  const nodePulseSeconds = numericSeconds(css, ".workspace-live-node.is-active::after");
  const wireFlowSeconds = numericSeconds(css, ".workspace-live-wire {");

  const checks = [
    check("living_primitives_source", primitiveMissing.length === 0, {
      file: path.join(ROOT, "src-tauri", "src", "visual_lumina.rs"),
      checked: primitiveSnippets,
      missing: primitiveMissing,
    }, "Implement the missing egui living primitive in visual_lumina.rs."),
    check("visual_event_protocol_source", eventMissing.length === 0, {
      file: path.join(ROOT, "src-tauri", "src", "visual_lumina.rs"),
      checked: eventSnippets,
      missing: eventMissing,
    }, "Add the AIGPU visual event protocol types and queue helpers."),
    check("phase_and_quality_controls", qualityMissing.length === 0 && phaseMissing.length === 0, {
      file: path.join(ROOT, "src-tauri", "src", "visual_lumina.rs"),
      missing_quality: qualityMissing,
      missing_phase: phaseMissing,
    }, "Add quality presets, Focus mode, reduced-motion behavior, and Creative/Fast/Idle phase tinting."),
    check("calm_motion_defaults", lumina.includes("rim_pulse_speed: 0.35") && lumina.includes("drift_speed_max: 0.35") && lumina.includes("mote_count: 15"), {
      rim_pulse_hz: lumina.includes("rim_pulse_speed: 0.35") ? 0.35 : null,
      mote_speed_max_px_frame: lumina.includes("drift_speed_max: 0.35") ? 0.35 : null,
      high_quality_mote_cap: lumina.includes("mote_count: 15") ? 15 : null,
    }, "Keep motion inside the guide: 0.32-0.42Hz rim, <=15 motes, <=0.35px/frame drift."),
    check("native_visual_canvas_wired", nativeMissing.length === 0 && !native.includes("alpha.2 stub"), {
      file: path.join(ROOT, "src-tauri", "src", "bin", "native.rs"),
      missing: nativeMissing,
      stale_stub_copy_present: native.includes("alpha.2 stub"),
    }, "Wire graph-backed visual telemetry and remove product-facing stub copy."),
    check("web_motion_guardrails", hasParticleCap && maxParticle >= 15 && nodePulseSeconds >= 2.2 && wireFlowSeconds >= 1.8 && wireFlowSeconds <= 2.5 && css.includes("@media (prefers-reduced-motion: reduce)"), {
      file: path.join(ROOT, "src", "v4", "see-suite.css"),
      max_particle_rule: maxParticle,
      particle_cap_hidden_after: 15,
      node_pulse_seconds: nodePulseSeconds,
      wire_flow_seconds: wireFlowSeconds,
      reduced_motion: css.includes("@media (prefers-reduced-motion: reduce)"),
    }, "Cap ambient motes to 8-15, slow node pulses, and keep reduced-motion fallbacks."),
    check("silent_canvas_product_hooks", [
      "renderWorkspaceLiveCanvas",
      "renderWorkspaceReplayInspector",
      "observatoryState",
      "relevance",
      "freezeState",
    ].every((snippet) => js.includes(snippet)), {
      file: path.join(ROOT, "src", "v4", "see-suite.js"),
    }, "Expose live canvas, replay inspector, observatory, relevance, and Freeze-All state in the product UI."),
    check("see_suite_living_layer_over_existing_state", webLivingMissing.length === 0, {
      files: [
        path.join(ROOT, "src", "v4", "index.html"),
        path.join(ROOT, "src", "v4", "see-suite.css"),
        path.join(ROOT, "src", "v4", "see-suite.js"),
      ],
      checked: webLivingSnippets,
      missing: webLivingMissing,
    }, "Wire the living layer to actual See-Suite route, workspace, observatory, board, and Freeze-All state."),
    check("operations_living_layer_over_existing_state", operationsLivingMissing.length === 0, {
      files: [
        path.join(ROOT, "src", "v4", "onboarding", "settings.html"),
        path.join(ROOT, "src", "v4", "onboarding", "settings.css"),
        path.join(ROOT, "src", "v4", "onboarding", "settings.js"),
      ],
      checked: operationsLivingSnippets,
      missing: operationsLivingMissing,
    }, "Wire AE Operations living feedback to Final Green Board, closeout, doctors, and Ethereal state."),
    check("cli_and_api_exposed", cli.includes("visual-engine-doctor") && routes.includes("/api/v4/silent-canvas/visual-engine-doctor"), {
      files: [
        path.join(ROOT, "scripts", "obx.mjs"),
        path.join(ROOT, "scripts", "v4", "v4-server-routes.mjs"),
      ],
      cli: cli.includes("visual-engine-doctor"),
      api: routes.includes("/api/v4/silent-canvas/visual-engine-doctor"),
    }, "Expose obx silent-canvas visual-engine-doctor and /api/v4/silent-canvas/visual-engine-doctor."),
  ];

  const failures = checks.filter((item) => !item.ok);
  const result = {
    ok: failures.length === 0,
    doctor: "visual-engine",
    doctor_version: VISUAL_ENGINE_DOCTOR_VERSION,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    root: ROOT,
    summary: {
      checks: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
    },
    checks,
    failures,
    receipt_path: null,
  };

  if (shouldWriteReceipt) {
    result.receipt_path = await writeReceipt(result);
  }
  return result;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const write = process.argv.includes("--receipt");
  const result = await runVisualEngineDoctor({ writeReceipt: write });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(4);
}
