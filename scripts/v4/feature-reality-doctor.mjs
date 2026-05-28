#!/usr/bin/env node
/* feature-reality-doctor.mjs - ORANGEBOX Bluebird feature reality matrix.
 *
 * This is the anti-theater gate. It maps the promised Bluebird product surface
 * to concrete source, command, API, receipt, screenshot, package, and blocker
 * evidence. It does not mutate the repo, stage files, commit, delete, publish,
 * or restart services.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const FEATURE_REALITY_DOCTOR_VERSION = "orangebox-feature-reality-doctor/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const PROOF_DIR = path.join(ROOT, "proof");
const SHIP_MANIFEST = path.resolve(ROOT, "..", "ship", "orangebox-v6.3.0-alpha.7-portable.zip.manifest.json");

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function readRel(rel) {
  const file = path.join(ROOT, rel);
  try {
    return { ok: true, file, text: await fs.readFile(file, "utf8") };
  } catch (error) {
    return { ok: false, file, text: "", error: error?.message || String(error) };
  }
}

async function readJson(file) {
  try {
    return JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    return { error: error?.message || String(error), path: file };
  }
}

async function latestFileMatching(dir, regex) {
  if (!fsSync.existsSync(dir)) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const candidates = [];
  for (const entry of entries) {
    if (!entry.isFile() || !regex.test(entry.name)) continue;
    const file = path.join(dir, entry.name);
    const stat = await fs.stat(file);
    candidates.push({
      path: file,
      name: entry.name,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      age_hours: Number(((Date.now() - stat.mtimeMs) / 3_600_000).toFixed(2)),
      mtime_ms: stat.mtimeMs,
    });
  }
  candidates.sort((a, b) => b.mtime_ms - a.mtime_ms);
  const latest = candidates[0] || null;
  if (latest) delete latest.mtime_ms;
  return latest;
}

function normalizeProofSpec(spec) {
  if (typeof spec === "string") return { prefix: spec, failure_is_watch: false };
  return {
    prefix: spec?.prefix || String(spec || ""),
    failure_is_watch: spec?.failure_is_watch === true,
  };
}

async function latestReceipt(spec) {
  const proofPolicy = normalizeProofSpec(spec);
  const prefix = proofPolicy.prefix;
  const escaped = String(prefix).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let meta = await latestFileMatching(RECEIPTS_DIR, new RegExp(`^${escaped}-\\d{8}T\\d{6}\\.json$`, "i"));
  if (!meta) meta = await latestFileMatching(RECEIPTS_DIR, new RegExp(`^${escaped}.*\\.json$`, "i"));
  if (!meta?.path) return { found: false, prefix, proof_policy: proofPolicy };
  const json = await readJson(meta.path);
  const evidence = json?.evidence && typeof json.evidence === "object" ? json.evidence : {};
  const result = json?.result && typeof json.result === "object" ? json.result : {};
  const ok = json?.ok === true || evidence?.ok === true || result?.ok === true || json?.result === "VERIFIED";
  const failures = Array.isArray(json?.failures)
    ? json.failures
    : Array.isArray(evidence?.failures)
      ? evidence.failures
      : Array.isArray(result?.failures)
        ? result.failures
        : [];
  const gitOnlyFailure = failures.length > 0 && failures.every((failure) => {
    const id = String(failure?.id || failure?.name || failure?.check || "").toLowerCase();
    return id === "git_state" || id === "git-state";
  });
  return {
    found: true,
    prefix,
    proof_policy: proofPolicy,
    ...meta,
    ok,
    json_error: json?.error || null,
    summary: json?.summary || evidence?.summary || result?.summary || {},
    blockers: Array.isArray(json?.blockers) ? json.blockers : Array.isArray(evidence?.blockers) ? evidence.blockers : [],
    warnings: Array.isArray(json?.warnings) ? json.warnings : Array.isArray(evidence?.warnings) ? evidence.warnings : [],
    failures,
    git_only_failure: gitOnlyFailure,
    receipt_version: json?.version || evidence?.version || result?.doctor_version || result?.version || null,
  };
}

function proofWarningCount(receipt) {
  if (!receipt?.found) return 0;
  const summaryWarnings = Number(receipt.summary?.warnings || 0);
  const advisoryWarnings = Number(receipt.summary?.advisory_warnings || 0);
  return summaryWarnings + advisoryWarnings + (receipt.warnings?.length || 0) + (receipt.blockers?.length || 0);
}

const FEATURE_MATRIX = [
  {
    id: "product_identity_navigation",
    title: "AE See-Suite / AE Operations product identity",
    promise: "Operator-facing surfaces use AE See-Suite and AE Operations while legacy names are compatibility-only.",
    sources: [
      { file: "src/v4/index.html", tokens: ["AE See-Suite", "AE Operations", "What are we building?"] },
      { file: "src/v4/onboarding/settings.html", tokens: ["AE Operations", "Advanced AI Box"] },
      { file: "scripts/v4/product-language-doctor.mjs", tokens: ["SOURCE_BLOCKERS", "AE See-Suite product-language proof"] },
    ],
    commands: ["obx api language-doctor"],
    routes: ["/api/v4/product-language/doctor"],
    proofs: ["orangebox-product-language-doctor"],
  },
  {
    id: "see_suite_creation_surface",
    title: "AE See-Suite creation surface",
    promise: "The first screen is the creation surface with mission input, creation chips, route preview, artifacts, and proof promise.",
    sources: [
      { file: "src/v4/index.html", tokens: ["bluebirdObjectiveInput", "Build App", "Design Workflow", "Create Dashboard", "Artifact Library", "Mission Spine"] },
      { file: "src/v4/see-suite.js", tokens: ["planMissionRoute", "refreshMissionRouteDetail", "renderWorkspaceLiveCanvas"] },
    ],
    commands: ["obx install see-suite-proof"],
    routes: ["/api/v4/install/see-suite-proof", "/api/v4/see-suite/status"],
    proofs: ["orangebox-ae-see-suite-visual-proof"],
  },
  {
    id: "silent_canvas_differentiation",
    title: "Silent Canvas as real creation mode",
    promise: "Project graph, mutations, replay, Observatory, Relevance, proof links, Freeze-All, and recovery are visible and receipted.",
    sources: [
      { file: "src/v4/index.html", tokens: ["Workspace State", "Pipeline Observatory", "Mutation Replay", "Freeze-All"] },
      { file: "src/v4/see-suite.js", tokens: ["renderWorkspaceReplayInspector", "renderPipelineObservatory", "setFreezeAll", "latest_mutations"] },
      { file: "scripts/v4/alpha7-doctor.mjs", tokens: ["workspaceState", "restoreSnapshot", "alpha7-readiness"] },
    ],
    commands: ["obx silent-canvas alpha7-doctor", "obx silent-canvas visual-engine-doctor"],
    routes: ["/api/v4/silent-canvas/workspace-state", "/api/v4/silent-canvas/observatory", "/api/v4/silent-canvas/desync-recover"],
    proofs: ["orangebox-ae-see-suite-visual-proof", "orangebox-alpha7-readiness-doctor"],
  },
  {
    id: "living_visual_engine",
    title: "AIGUI / Lumina living visual engine",
    promise: "Living motion is event-driven by real route, mutation, Observatory, board, and Ethereal state, with reduced-motion controls.",
    sources: [
      { file: "src-tauri/src/visual_lumina.rs", tokens: ["AnimatedRect", "VisualEventQueue", "LuminaQuality", "PipelinePhase"] },
      { file: "src/v4/see-suite.js", tokens: ["syncLivingVisuals", "emitLivingBloom", "lastMutationSignature", "lastBoardSignature"] },
      { file: "src/v4/onboarding/settings.js", tokens: ["syncOperationsLiving", "emitOperationsBloom", "operationsActivityFromBoard"] },
      { file: "src/v4/see-suite.css", tokens: ["prefers-reduced-motion", "living-visual-layer"] },
    ],
    commands: ["obx silent-canvas visual-engine-doctor"],
    routes: ["/api/v4/silent-canvas/visual-engine-doctor"],
    proofs: ["orangebox-visual-engine-doctor"],
  },
  {
    id: "ae_operations_control_board",
    title: "AE Operations proof/install/recovery back side",
    promise: "AE Operations explains final board, install, Advanced AI Computer, Ethereal, receipts, release, rollback, and recovery in plain English.",
    sources: [
      { file: "src/v4/onboarding/settings.html", tokens: ["Final Green Board", "Basic Install", "Advanced AI Computer", "Ethereal AI Link", "Rollback"] },
      { file: "src/v4/onboarding/settings.js", tokens: ["renderFinalGreenBoard", "refreshCloseoutPlan", "runOpsDoctor", "refreshEtherealDoctor"] },
    ],
    commands: ["obx install operations-proof", "obx finish green-board"],
    routes: ["/api/v4/install/operations-proof", "/api/v4/finish/latest", "/api/v4/finish/green-board"],
    proofs: [
      "orangebox-ae-operations-visual-proof",
      { prefix: "orangebox-final-green-board", failure_is_watch: true },
    ],
  },
  {
    id: "basic_advanced_install",
    title: "Basic vs Advanced install clarity",
    promise: "First-run asks whether the operator has an AI computer, Basic works alone, Advanced degrades gracefully.",
    sources: [
      { file: "src/first-run.html", tokens: ["Do you have an AI computer", "Basic", "Advanced"] },
      { file: "scripts/v4/install-clarity-doctor.mjs", tokens: ["Basic Install", "Advanced AI Box"] },
      { file: "docs/AI_COMPUTER_BUYING_GUIDE.md", tokens: ["What Is an AI Computer?", "If you are unsure, start with **Basic Install**"] },
    ],
    commands: ["obx install doctor", "obx install visual-proof"],
    routes: ["/api/v4/install/doctor", "/api/v4/install/first-run-proof", "/api/v4/install/rehearsal"],
    proofs: ["orangebox-install-clarity-doctor", "orangebox-first-run-visual-proof", "orangebox-install-rehearsal"],
  },
  {
    id: "ethereal_ai_link",
    title: "Ethereal AI Link Advanced AI Computer module",
    promise: "Topology, adapter/IP, bandwidth, socket, storage tiers, traffic-priority recommendations, rollback, and package payload are real and honest.",
    sources: [
      { file: "scripts/v4/ai-box-network.mjs", tokens: ["runEtherealLinkDoctor", "topology", "SMB", "NVMe/TCP"] },
      { file: "scripts/pack-v6-portable.mjs", tokens: ["tools/ethereal-ai-link", "RUN_CREATE_SOCKET_TOKEN.cmd"] },
      { file: "docs/AI_BOX_NETWORK_PRIORITY.md", tokens: ["Ethereal AI Link", "AI Box Network Priority"] },
    ],
    commands: ["obx ethereal doctor", "obx ethereal pack"],
    routes: ["/api/v4/ai-box-network/ethereal/doctor", "/api/v4/ai-box-network/ethereal/pack"],
    proofs: ["orangebox-ai-box-network"],
    watch_when_warnings: true,
  },
  {
    id: "operating_spine",
    title: "Operating Spine route object",
    promise: "Route packets share objective, macro-actions, departments, coordination, clarification, model lane, proof gates, rollback, and receipt id.",
    sources: [
      { file: "scripts/v4/operating-spine.mjs", tokens: ["MACRO_ACTIONS", "coordination_profile", "clarification_policy", "rollback"] },
      { file: "scripts/v4/route-state.mjs", tokens: ["proof_gates", "promote", "Mission Spine"] },
    ],
    commands: ["obx route plan", "obx route doctor"],
    routes: ["/api/v4/route/plan", "/api/v4/route/doctor", "/api/v4/route/package"],
    proofs: ["orangebox-route-doctor", "orangebox-route-state-doctor"],
  },
  {
    id: "department_os",
    title: "Department OS coordination layer",
    promise: "AE0-AE14 lanes, lead/specialist/review/dissent/arbitration/escalation/proof owner fields are product behavior.",
    sources: [
      { file: "scripts/v4/dept-registry.mjs", tokens: ["AE0", "AE14", "proof obligations"] },
      { file: "scripts/v4/dept-router.mjs", tokens: ["dissent", "arbitration", "escalation"] },
      { file: "src/v4/index.html", tokens: ["Department OS", "Route a goal through AE0-AE14"] },
    ],
    commands: ["obx dept doctor"],
    routes: ["/api/v4/dept/doctor", "/api/v4/dept/route"],
    proofs: ["orangebox-dept-doctor"],
  },
  {
    id: "openapi_mcp_spine",
    title: "OpenAPI and code-mode MCP spine",
    promise: "OpenAPI is the contract source of truth, API doctor reports drift, MCP exposes compact search_docs/execute with allow-list receipts.",
    sources: [
      { file: "docs/api/orangebox-openapi.yaml", tokens: ["/api/v4/openapi.json", "/api/v4/mcp/code-search"] },
      { file: "scripts/v4/code-mode-mcp.mjs", tokens: ["search_docs", "execute", "allow"] },
      { file: "scripts/v4/mcp-doctor.mjs", tokens: ["code_mode"] },
    ],
    commands: ["obx api doctor", "obx mcp doctor"],
    routes: ["/api/v4/openapi.json", "/api/v4/mcp/code-search", "/api/v4/mcp/code-execute"],
    proofs: ["orangebox-api-doctor", "orangebox-mcp-doctor"],
  },
  {
    id: "model_switchboard",
    title: "Running Brain model switchboard",
    promise: "GPT, Opus, Grok, Gemini, and Grok Superheavy are selectable model lanes with CLI/API readiness, skill reporting, route preference, doctor, and receipts.",
    sources: [
      { file: "scripts/v4/model-switchboard.mjs", tokens: ["MODEL_SWITCH_PROFILES", "grok-superheavy", "no_model_call_made"] },
      { file: "scripts/obx.mjs", tokens: ["obx model", "cmdModel", "grok-superheavy"] },
      { file: "src/v4/onboarding/settings.html", tokens: ["Running Brain", "Grok Superheavy", "modelSwitchGrid"] },
      { file: "src/v4/onboarding/settings.js", tokens: ["refreshModelSwitchboard", "selectModelSwitchboardProfile"] },
    ],
    commands: ["obx model status", "obx model switch", "obx model doctor"],
    routes: ["/api/v4/model-switch/status", "/api/v4/model-switch/select", "/api/v4/model-switch/doctor"],
    proofs: ["orangebox-model-switchboard-doctor"],
  },
  {
    id: "aelang_route_language",
    title: "AELang route language",
    promise: "AELang-High and AELang-Core compile into ORANGEBOX route packets and Operating Spine handoff objects with receipts and no execution side effects.",
    sources: [
      { file: "docs/AELANG_SPEC.md", tokens: ["AELang-High", "AELang-Core", "ORANGEBOX", "Route Packet"] },
      { file: "scripts/v4/aelang.mjs", tokens: ["parseAELangHigh", "parseAELangCore", "routePacketToOperatingSpine", "runAELangDoctor"] },
      { file: "scripts/obx.mjs", tokens: ["obx aelang", "cmdAELang"] },
    ],
    commands: ["obx aelang doctor", "obx aelang compile"],
    routes: ["/api/v4/aelang/doctor", "/api/v4/aelang/compile"],
    proofs: ["orangebox-aelang-doctor"],
  },
  {
    id: "gap_analysis_feature_intake",
    title: "Bluebird gap analysis feature intake",
    promise: "Gap Analysis and Grok-share ideas are captured as planned/partial/implemented feature scope without being counted as completed product behavior.",
    sources: [
      { file: "docs/BLUEBIRD_GAP_FEATURE_LEDGER.md", tokens: ["Critical Daily-Driver Gaps", "Artifact Delivery Contract", "API Resilience + Agent Continuity"] },
      { file: "docs/BLUEBIRD_GAP_FEATURE_LEDGER.json", tokens: ["feature_intake_not_completion_claim", "deep_codebase_indexing_semantic_search", "api_resilience_agent_continuity"] },
      { file: "docs/AELANG_RESILIENCY_MODULE.md", tokens: ["aelang-resiliency/v0.1-plan", "checkpointed missions", "Artifact Delivery Contract"] },
    ],
    commands: [],
    routes: [],
    proofs: [],
    proof_optional: true,
  },
  {
    id: "grok_upgrades_feature_intake",
    title: "Grok ORANGEBOX upgrades intake",
    promise: "The Grok share and GROK-ORANGBOXUPGRADES bundle are captured as candidate feature scope with explicit accepted, planned, rejected, and proof-gated items.",
    sources: [
      { file: "docs/GROK_ORANGEBOX_UPGRADES_INTAKE.md", tokens: ["GROK ORANGEBOX Upgrades Intake", "Semantic Cache Vectors", "Hybrid Exact + Semantic Lookup", "OpenTelemetry Trace Bridge", "Perfect GitHub System"] },
      { file: "docs/GROK_ORANGEBOX_UPGRADES_LEDGER.json", tokens: ["orangebox-grok-upgrades-ledger/v1", "semantic_cache_vectors", "hybrid_exact_semantic_lookup", "opentelemetry_trace_bridge", "perfect_github_system"] },
    ],
    commands: [],
    routes: [],
    proofs: [],
    proof_optional: true,
  },
  {
    id: "claude_export",
    title: "Claude / Opus route handoff",
    promise: "Claude export produces a route packet with Gather/Act/Verify, worktree isolation, sub-agent guidance, proof and rollback checklist.",
    sources: [
      { file: "scripts/v4/operating-spine.mjs", tokens: ["orangebox-claude-route-export", "gather_act_verify", "worktree_isolation_guidance", "sub_agent_delegation_guidance"] },
      { file: "scripts/obx.mjs", tokens: ["obx claude export-route"] },
    ],
    commands: ["obx claude export-route"],
    routes: ["/api/v4/claude/export-route"],
    proofs: ["orangebox-claude-route-export"],
    proof_optional: true,
  },
  {
    id: "receipts_release_package",
    title: "Receipts, proof, package, rollback, release packet",
    promise: "Every green claim points to command output, doctor result, screenshot, package manifest, decision card, or rollback evidence.",
    sources: [
      { file: "scripts/v4/final-green-board.mjs", tokens: ["proof_output", "portable_package_manifest", "git_state"] },
      { file: "scripts/v4/release-closeout.mjs", tokens: ["promotion closeout", "rollback", "stage_paths"] },
      { file: "scripts/pack-v6-portable.mjs", tokens: ["zip_sha256", "manifest"] },
    ],
    commands: ["obx finish green-board", "obx finish release-packet"],
    routes: ["/api/v4/finish/green-board", "/api/v4/finish/release-packet"],
    proofs: ["orangebox-final-green-board", "orangebox-release-closeout"],
    watch_when_blockers: true,
    proof_failure_is_watch: true,
  },
];

const CORE_SOURCE_FILES = [
  "src/v4/index.html",
  "src/v4/see-suite.css",
  "src/v4/see-suite.js",
  "src/v4/onboarding/settings.html",
  "src/v4/onboarding/settings.css",
  "src/v4/onboarding/settings.js",
  "src/first-run.html",
  "src/first-run.js",
  "scripts/obx.mjs",
  "scripts/v4/v4-server-routes.mjs",
  "scripts/v4/silent-canvas.mjs",
  "scripts/v4/aelang.mjs",
  "scripts/v4/ai-box-network.mjs",
  "scripts/v4/operating-spine.mjs",
  "scripts/v4/model-switchboard.mjs",
  "scripts/v4/dept-router.mjs",
  "scripts/v4/code-mode-mcp.mjs",
  "docs/AELANG_SPEC.md",
  "src-tauri/src/visual_lumina.rs",
  "src-tauri/src/bin/native.rs",
];

const THEATER_PATTERNS = [
  { id: "hardcoded-success-json", severity: "fail", pattern: /res\.json\(\s*\{\s*enabled:\s*true\s*\}\s*\)/i },
  { id: "not-implemented", severity: "fail", pattern: /\bnot implemented\b/i },
  { id: "fake-green", severity: "fail", pattern: /\bfake green\b|\bfake-green\b/i, invertDoctrine: true },
  { id: "todo-or-fixme", severity: "watch", pattern: /\bTODO\b|\bFIXME\b/i },
  { id: "stub-or-placeholder", severity: "watch", pattern: /\bstub\b|\bplaceholder\b/i },
  { id: "coming-soon", severity: "watch", pattern: /\bcoming soon\b/i },
];

function allowedTheaterLine(line) {
  return /No stubs|no stubs|not a stub|No theater|no theater|not theater|no fake green|not fake|placeholder=|::placeholder|prompt scaffolding|prompt scaffold|Mom's Law|compatibility|scaffold → LLM|Composer mode|legacy/i.test(line);
}

async function gitSummary() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: ROOT, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    return {
      ok: true,
      dirty_count: lines.length,
      modified_count: lines.filter((line) => line.startsWith(" M") || line.startsWith("M ")).length,
      untracked_count: lines.filter((line) => line.startsWith("??")).length,
      deleted_count: lines.filter((line) => line.includes("D ")).length,
      sample: lines.slice(0, 20),
    };
  } catch (error) {
    return { ok: false, error: error?.message || String(error) };
  }
}

function routeSourceProof(route, sourceText, openapiText) {
  const sourcePresent = sourceText.includes(route);
  const openapiPresent = openapiText.includes(`"${route}"`) || openapiText.includes(`'${route}'`) || openapiText.includes(`${route}:`) || openapiText.includes(route);
  return { route, source_present: sourcePresent, openapi_present: openapiPresent, ok: sourcePresent && openapiPresent };
}

function commandProof(command, obxText) {
  const parts = command.split(/\s+/).filter(Boolean);
  const ok = parts.every((part) => obxText.includes(part));
  return { command, ok };
}

function sourceProof(source, files) {
  const found = files.get(source.file);
  const missingTokens = (source.tokens || []).filter((token) => !found?.text?.includes(token));
  return {
    file: path.join(ROOT, source.file),
    exists: found?.ok === true,
    missing_tokens: missingTokens,
    ok: found?.ok === true && missingTokens.length === 0,
    error: found?.error || null,
  };
}

function statusForFeature(feature, sourceChecks, commandChecks, routeChecks, proofChecks) {
  const sourceOk = sourceChecks.every((item) => item.ok);
  const commandOk = commandChecks.every((item) => item.ok);
  const routeOk = routeChecks.every((item) => item.ok);
  const requiredProofs = feature.proof_optional ? [] : proofChecks;
  const proofMissing = requiredProofs.some((item) => !item.found);
  const proofFailedStrict = requiredProofs.some((item) => item.found && !item.ok && item.proof_policy?.failure_is_watch !== true);
  const proofFailedWatch = requiredProofs.some((item) => item.found && !item.ok && item.proof_policy?.failure_is_watch === true);
  const warningCount = proofChecks.reduce((sum, item) => sum + proofWarningCount(item), 0);
  const blockerCount = proofChecks.reduce((sum, item) => sum + (item.blockers?.length || 0), 0);

  if (!sourceOk || !commandOk || !routeOk || (!feature.proof_failure_is_watch && proofFailedStrict) || (!feature.proof_optional && proofMissing)) {
    return "fail";
  }
  if ((feature.proof_failure_is_watch && proofFailedStrict) || proofFailedWatch || (feature.watch_when_warnings && warningCount > 0) || (feature.watch_when_blockers && blockerCount > 0)) {
    return "watch";
  }
  if (feature.proof_optional && proofChecks.length > 0 && !proofChecks.some((item) => item.found && item.ok)) {
    return "watch";
  }
  return "pass";
}

async function theaterScan(files) {
  const hits = [];
  for (const rel of CORE_SOURCE_FILES) {
    const found = files.get(rel) || await readRel(rel);
    if (!found.ok) continue;
    const lines = found.text.split(/\r?\n/);
    lines.forEach((line, idx) => {
      for (const pattern of THEATER_PATTERNS) {
        if (!pattern.pattern.test(line)) continue;
        if (allowedTheaterLine(line)) continue;
        hits.push({
          id: pattern.id,
          severity: pattern.severity,
          file: path.join(ROOT, rel),
          line: idx + 1,
          text: line.trim().slice(0, 220),
        });
      }
    });
  }
  return hits;
}

async function packageEvidence() {
  const manifest = await readJson(SHIP_MANIFEST);
  const zipPath = manifest?.zip_path || null;
  return {
    manifest_path: SHIP_MANIFEST,
    manifest_exists: fsSync.existsSync(SHIP_MANIFEST),
    zip_path: zipPath,
    zip_exists: !!zipPath && fsSync.existsSync(zipPath),
    zip_sha256: manifest?.zip_sha256 || null,
    ethereal_ai_link_included: manifest?.ethereal_ai_link?.included === true,
    token_file_shipped: manifest?.ethereal_ai_link?.token_file_shipped === true,
    error: manifest?.error || null,
  };
}

async function writeReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-feature-reality-doctor-${stampForFile()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, JSON.stringify(result, null, 2) + "\n", "utf8");
  return file;
}

export async function runFeatureRealityDoctor({ writeReceipt: shouldWriteReceipt = false } = {}) {
  const startedAt = new Date().toISOString();
  const sourceRels = Array.from(new Set([
    ...CORE_SOURCE_FILES,
    "docs/api/orangebox-openapi.yaml",
    ...FEATURE_MATRIX.flatMap((feature) => (feature.sources || []).map((source) => source.file)),
  ]));
  const reads = await Promise.all(sourceRels.map(async (rel) => [rel, await readRel(rel)]));
  const files = new Map(reads);
  const obxText = files.get("scripts/obx.mjs")?.text || "";
  const routesText = files.get("scripts/v4/v4-server-routes.mjs")?.text || "";
  const openapiText = files.get("docs/api/orangebox-openapi.yaml")?.text || "";

  const features = [];
  for (const feature of FEATURE_MATRIX) {
    const sourceChecks = (feature.sources || []).map((source) => sourceProof(source, files));
    const commandChecks = (feature.commands || []).map((command) => commandProof(command, obxText));
    const routeChecks = (feature.routes || []).map((route) => routeSourceProof(route, routesText, openapiText));
    const proofChecks = await Promise.all((feature.proofs || []).map((prefix) => latestReceipt(prefix)));
    const status = statusForFeature(feature, sourceChecks, commandChecks, routeChecks, proofChecks);
    features.push({
      id: feature.id,
      title: feature.title,
      promise: feature.promise,
      status,
      ok: status !== "fail",
      source_checks: sourceChecks,
      command_checks: commandChecks,
      route_checks: routeChecks,
      proof_checks: proofChecks,
      recovery: status === "fail"
        ? "Add the missing implementation/proof path, rerun the related doctor, then rerun `obx finish feature-reality --receipt`."
        : status === "watch"
          ? "Feature exists but has warning/blocker/stale-proof conditions that must remain visible until resolved."
          : "No recovery needed.",
    });
  }

  const theaterHits = await theaterScan(files);
  const packageInfo = await packageEvidence();
  const git = await gitSummary();
  const proofImages = await Promise.all([
    latestFileMatching(PROOF_DIR, /ae-see-suite-desktop\.png$/i),
    latestFileMatching(PROOF_DIR, /ae-see-suite-silent-canvas\.png$/i),
    latestFileMatching(PROOF_DIR, /ae-operations-lane-desktop\.png$/i),
    latestFileMatching(PROOF_DIR, /ae-operations-lane-ethereal\.png$/i),
    latestFileMatching(PROOF_DIR, /first-run-ai-box-choice-desktop\.png$/i),
  ]);

  const failedFeatures = features.filter((feature) => feature.status === "fail");
  const watchFeatures = features.filter((feature) => feature.status === "watch");
  const criticalTheaterHits = theaterHits.filter((hit) => hit.severity === "fail");
  const watchTheaterHits = theaterHits.filter((hit) => hit.severity === "watch");
  const ok = failedFeatures.length === 0 && criticalTheaterHits.length === 0 && packageInfo.zip_exists === true;
  const result = {
    ok,
    release_grade: ok && watchFeatures.length === 0 && watchTheaterHits.length === 0 && git.dirty_count === 0,
    version: FEATURE_REALITY_DOCTOR_VERSION,
    project: "ORANGEBOX",
    product_surface: "AE See-Suite / AE Operations / Ethereal AI Link",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    root: ROOT,
    summary: {
      features: features.length,
      pass: features.filter((feature) => feature.status === "pass").length,
      watch: watchFeatures.length,
      fail: failedFeatures.length,
      critical_theater_hits: criticalTheaterHits.length,
      watch_theater_hits: watchTheaterHits.length,
      package_ready: packageInfo.zip_exists === true && !!packageInfo.zip_sha256,
      dirty_count: git.dirty_count ?? null,
    },
    features,
    theater_scan: {
      files_checked: CORE_SOURCE_FILES.map((rel) => path.join(ROOT, rel)),
      critical_hits: criticalTheaterHits,
      watch_hits: watchTheaterHits,
      recovery: criticalTheaterHits.length
        ? "Replace hardcoded or unimplemented paths with real behavior before claiming green."
        : watchTheaterHits.length
          ? "Review watch hits. Keep only compatibility/technical-language hits, or convert user-facing placeholders into real behavior."
          : "No theater/stub hits found in the Bluebird core source scan.",
    },
    package: packageInfo,
    git,
    proof_images: proofImages.filter(Boolean),
    blockers: [
      ...failedFeatures.map((feature) => ({ id: `feature-${feature.id}`, detail: `${feature.title} is missing required implementation/proof evidence.` })),
      ...criticalTheaterHits.map((hit) => ({ id: `theater-${hit.id}`, detail: `${hit.file}:${hit.line} ${hit.text}` })),
      ...(packageInfo.zip_exists ? [] : [{ id: "package-missing", detail: "Portable package is missing or manifest is unreadable." }]),
    ],
    warnings: [
      ...watchFeatures.map((feature) => ({ id: `watch-${feature.id}`, detail: `${feature.title} is implemented but still carries watch-level evidence.` })),
      ...watchTheaterHits.slice(0, 20).map((hit) => ({ id: `watch-${hit.id}`, detail: `${hit.file}:${hit.line} ${hit.text}` })),
      ...(git.dirty_count > 0 ? [{ id: "dirty-repo", detail: `${git.dirty_count} git entries require stage/hold review before pristine release.` }] : []),
    ],
    rollback: {
      repo_mutation: shouldWriteReceipt ? "receipt only" : "none",
      recovery_action: shouldWriteReceipt
        ? "Delete this feature-reality receipt if it is superseded, then rerun the doctor."
        : "No rollback needed; this run was read-only.",
    },
    next_action: failedFeatures.length
      ? "Fix failed feature evidence first; no release claim should say 100% until these pass."
      : watchFeatures.length || watchTheaterHits.length || git.dirty_count > 0
        ? "Resolve watch items and approve the release staging/hold split before calling this pristine."
        : "Feature reality matrix is green; rerun final board with --require-clean before promotion.",
  };
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result);
  return result;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const args = new Set(process.argv.slice(2));
  const result = await runFeatureRealityDoctor({ writeReceipt: args.has("--receipt") });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(4);
}
