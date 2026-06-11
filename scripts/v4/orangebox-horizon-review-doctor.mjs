#!/usr/bin/env bun
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "horizon-review");
const receiptDir = path.join(repoRoot, "receipts");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

function readText(file, fallback = "") {
  try {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function loadToolCards() {
  const file = path.join(repoRoot, "orangebox-v3", "free-alpha-toolmesh", "tool-cards", "first-batch.tool.json");
  const raw = readJson(file, []);
  const cards = Array.isArray(raw) ? raw : raw.tools || raw.cards || [];
  return { file, cards };
}

function cardStatus(cards, id) {
  const card = cards.find((item) => item.id === id);
  return card ? { id: card.id, name: card.name, status: card.status, lab: card.lab, role: card.orangeboxRole } : null;
}

function packageFacts() {
  const file = path.join(repoRoot, "package.json");
  const pkg = readJson(file, {});
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return { file, deps, scripts: pkg.scripts || {} };
}

function receiptStatus(file) {
  const value = readJson(file, null);
  return value ? { path: file, ok: value.ok === true, status: value.status || null, receipt_id: value.receipt_id || null } : { path: file, ok: false, status: "missing" };
}

function latestReceiptStatus(fragment) {
  let matches = [];
  try {
    matches = fs.readdirSync(path.join(dataRoot, "v3", "receipts"))
      .filter((name) => name.includes(fragment) && name.endsWith(".json"))
      .sort();
  } catch {
    matches = [];
  }
  if (!matches.length) return { path: path.join(dataRoot, "v3", "receipts", `*${fragment}*.json`), ok: false, status: "missing" };
  return receiptStatus(path.join(dataRoot, "v3", "receipts", matches[matches.length - 1]));
}

async function main() {
  const args = process.argv.slice(2);
  const { file: cardsFile, cards } = loadToolCards();
  const pkg = packageFacts();
  const evidence = {
    elysia_bridge: latestReceiptStatus("api-bridge-doctor"),
    goose_envelope: latestReceiptStatus("goose-envelope"),
    openjarvis_eval: latestReceiptStatus("openjarvis-eval-doctor"),
    openjarvis_runtime: latestReceiptStatus("openjarvis-runtime-doctor"),
    mcp_context7_docs_lane: latestReceiptStatus("mcp-context7-docs-lane"),
  };
  const hermesDir = path.join(repoRoot, "scripts", "v4", "hermes");
  const openclawRetirement = readJson(path.join(dataRoot, "openclaw-retirement", "latest-openclaw-retirement.json"), null);
  const visualReadiness = readJson(path.join(dataRoot, "visual-production-readiness", "latest-visual-production-readiness.json"), null);
  const openJarvisRuntime = readJson(path.join(dataRoot, "openjarvis", "runtime", "latest-openjarvis-runtime.json"), null);
  const ledgerText = readText(path.join(repoRoot, "orangebox-v3", "docs", "V3_MASTER_LEDGER.md"));
  const candidates = [
    {
      id: "bun_elysia_api_bridge",
      name: "Bun + Elysia API Bridge",
      horizon_decision: "ACTIVE_CONTRACT_KEEP_AND_BENCH",
      orangebox_state: pkg.deps.elysia ? "dependency_present_sidecar_contract_ready" : "missing_dependency",
      installed_or_present: Boolean(pkg.deps.elysia),
      current_role: "low-latency V3 sidecar API bridge; not yet default replacement for existing command rails",
      promotion_blocker: "Needs parity benchmark against existing rails before default promotion.",
      next_action: "Run v3:api:doctor, optionally serve sidecar, then benchmark rail latency under the same request mix.",
      proof_command: "npm.cmd run v3:api:doctor",
      primary_sources: ["https://elysiajs.com/", "https://bun.com/docs/guides/ecosystem/elysia"],
    },
    {
      id: "goose_executor",
      name: "Goose executor",
      horizon_decision: "CANDIDATE_KEEP_AS_HANDS_NOT_BRAIN",
      orangebox_state: evidence.goose_envelope.ok ? "envelope_ready_not_installed_or_promoted" : "envelope_missing",
      installed_or_present: Boolean(cardStatus(cards, "goose")),
      toolmesh_card: cardStatus(cards, "goose"),
      current_role: "possible local executor behind ghost worktree/path/command/receipt envelope",
      promotion_blocker: "Must not replace TriLane strategy. Needs actual Goose install proof, task benchmark, allowed-path envelope, STRONGARM gate, and rollback proof.",
      next_action: "Benchmark Goose inside a ghost worktree on one bounded repo task only.",
      proof_command: "npm.cmd run v3:goose:envelope",
      primary_sources: ["https://github.com/aaif-goose/goose", "https://goose-docs.ai/"],
    },
    {
      id: "openjarvis_eval",
      name: "OpenJarvis / OBOX Jarvis eval harness",
      horizon_decision: "CANDIDATE_EVALUATE_ROUTING_EFFICIENCY",
      orangebox_state: evidence.openjarvis_eval.ok && evidence.openjarvis_runtime.ok
        ? "eval_harness_ready_runtime_reality_gated"
        : evidence.openjarvis_eval.ok
          ? "eval_harness_ready_runtime_reality_missing"
          : "eval_harness_missing",
      installed_or_present: Boolean(openJarvisRuntime?.runtime_truth?.runtime_found),
      current_role: "evaluate efficiency, latency, energy proxy, budget, trace quality, spec-search ideas, and runtime readiness for local agents",
      promotion_blocker: "OpenJarvis/OBOX Jarvis is not strategy authority. Runtime/config discovery and same-task bakeoff must be green before any router promotion.",
      next_action: "Keep the spec/eval harness green, then run the runtime-reality gate and same-task bakeoff manifest before any direct runtime comparison.",
      proof_command: "npm.cmd run v3:openjarvis:doctor && npm.cmd run v3:openjarvis:runtime",
      primary_sources: ["https://scalingintelligence.stanford.edu/blogs/openjarvis/", "https://github.com/open-jarvis/OpenJarvis", "https://arxiv.org/abs/2605.17172"],
      orangebox_mapping: {
        intelligence: "TriLane model registry and council lanes",
        engine: "Ollama/llama.cpp/vLLM-compatible Codexa execution layer",
        agents: "STRONGARM, Gremlin/Misfits, Mirror, Checkmate, Judgement packets",
        tools_memory: "ToolMesh, K3/AtomSmasher memory, receipts, source pointers",
        learning: "research radar, saved receipts, lane evals, promotion gates",
      },
    },
    {
      id: "hermes_agent_outer_orchestration",
      name: "Hermes Agent",
      horizon_decision: "CANDIDATE_OUTER_ORCHESTRATOR_REPLACES_OPENCLAW_STARTUP",
      orangebox_state: fs.existsSync(hermesDir) ? "integration_pack_present_not_hidden_authority" : "integration_pack_missing",
      installed_or_present: fs.existsSync(hermesDir),
      current_role: "possible outer personal-agent shell for channels, memory, scheduling, and isolated delegates",
      promotion_blocker: "Hermes may replace OpenClaw as a personal-agent wrapper, but must not become hidden authority over TriLane, STRONGARM, receipts, or Orangebox permissions. Needs local install proof, sandbox proof, and no hidden startup loop.",
      next_action: "Keep Hermes as optional outer orchestration; run Hermes doctor/status only after install proof exists.",
      proof_command: "future hermes doctor/status receipt or existing scripts/v4/hermes status probe",
      primary_sources: ["https://hermes-agent.nousresearch.com/", "https://arxiv.org/abs/2605.17172"],
      orangebox_mapping: {
        allowed: ["optional channels", "scheduled briefs", "delegated non-authority workers", "live feed if operator-configured"],
        forbidden: ["hidden ruler", "unguarded repo mutation", "startup replacement for Orangebox services", "bypass of STRONGARM/Judgement"],
      },
    },
    {
      id: "openclaw_retired_path",
      name: "OpenClaw legacy path",
      horizon_decision: "RETIRED_STARTUP_RECOVERY_ONLY",
      orangebox_state: openclawRetirement?.status === "OPENCLAW_STARTUP_RETIRED" ? "startup_retired_receipt_present" : "retirement_receipt_missing_or_dry_run",
      installed_or_present: false,
      current_role: "legacy reference and surgical retirement target only",
      promotion_blocker: "OpenClaw must not reappear as an active startup agent, router, or command surface except retirement/recovery tooling.",
      next_action: "If OpenClaw starts on any machine, run the surgical retirement command and preserve rollback receipt.",
      proof_command: "npm.cmd run openclaw:retire:dry",
      primary_sources: ["https://arxiv.org/abs/2605.17172"],
    },
    {
      id: "context7_mcp_docs_lane",
      name: "Context7 MCP docs hydration",
      horizon_decision: "CANDIDATE_PROMOTE_AFTER_MCP_QUARANTINE",
      orangebox_state: evidence.mcp_context7_docs_lane.ok ? "docs_lane_contract_ready_not_installed" : "docs_lane_receipt_missing",
      installed_or_present: false,
      current_role: "fresh docs hydration lane for coding without broad web/context flooding",
      promotion_blocker: "Needs MCP quarantine, output cap, source pointer receipts, and no repo mutation.",
      next_action: "Install only as read-only docs lane after MCP quarantine doctor stays green.",
      proof_command: "npm.cmd run v3:mcp:doctor && npm.cmd run mcp:doctor",
      primary_sources: ["https://github.com/upstash/context7", "https://github.com/modelcontextprotocol/typescript-sdk"],
    },
    {
      id: "ai_sdk_ollama_transport",
      name: "AI SDK + Ollama transport",
      horizon_decision: "CANDIDATE_TRANSPORT_ONLY",
      orangebox_state: "not_installed_not_authority",
      installed_or_present: Boolean(pkg.deps.ai || pkg.deps["ai-sdk-ollama"] || pkg.deps["ollama-ai-provider-v2"]),
      current_role: "possible local streaming transport for LittleOrange or cockpit surfaces",
      promotion_blocker: "Transport cannot own routing, permissions, or judgement. Community Ollama providers must be benchmarked before use.",
      next_action: "Prototype as a replaceable transport under TriLane, not as a control plane.",
      proof_command: "future transport benchmark doctor",
      primary_sources: ["https://ai-sdk.dev/providers/community-providers/ollama", "https://ai-sdk.dev/docs/foundations/providers-and-models"],
    },
    {
      id: "littleorange_cortex_surface",
      name: "LittleOrange / Cortex IDE surface",
      horizon_decision: "ACTIVE_SEPARATE_VISUAL_SURFACE_VERIFY_ONLY",
      orangebox_state: pkg.scripts["littleorange:doctor"] ? "doctor_present_separate_visual_lane" : "missing_doctor",
      installed_or_present: Boolean(pkg.scripts["littleorange:doctor"]),
      current_role: "custom Orangebox AI code chat surface with recent projects, large chat scroll controls, backend rail probes, route spine, receipts, file tree, model lane, and upgrade radar",
      promotion_blocker: "Ops may verify receipts and backend connectivity, but frontend edits and release-grade visual proof stay in the separate visual project lane.",
      next_action: "Run littleorange:doctor and the visual lane proof stack before calling the surface release-ready.",
      proof_command: "npm.cmd run littleorange:doctor",
      primary_sources: ["orangebox-v3/docs/V3_MASTER_LEDGER.md", "scripts/v4/littleorange-doctor.mjs"],
    },
    {
      id: "void_editor_reference",
      name: "Void IDE reference",
      horizon_decision: "REFERENCE_ARCHITECTURE_NOT_BASE_FORK_YET",
      orangebox_state: "not_installed_reference_for_littleorange_patterns",
      installed_or_present: false,
      current_role: "open-source Cursor-style IDE reference for provider architecture, streamed diffs, checkpoints, and local-host model control",
      promotion_blocker: "A full VS Code fork is too heavy for the current Ops lane. Use ideas, not a base migration, unless LittleOrange separately chooses that path.",
      next_action: "Steal proven patterns into LittleOrange design docs only; keep Ops backend focused on receipts, routes, and proof surfaces.",
      proof_command: "npm.cmd run littleorange:doctor",
      primary_sources: ["https://github.com/voideditor/void", "https://voideditor.com/"],
    },
    {
      id: "continue_ai_checks",
      name: "Continue CLI / AI checks",
      horizon_decision: "CANDIDATE_FOR_CI_STYLE_AI_CHECKS",
      orangebox_state: "not_installed_overlap_with_checkmate",
      installed_or_present: Boolean(cardStatus(cards, "continue")),
      toolmesh_card: cardStatus(cards, "continue"),
      current_role: "possible source-controlled AI checks lane for PR/code review after Checkmate parity bakeoff",
      promotion_blocker: "Continue overlaps Checkmate/STRONGARM. It must prove local/no-auth mode, receipt output, and lower false confidence before adoption.",
      next_action: "Keep as coding-lab candidate; run a ghost-worktree bakeoff against Checkmate when needed.",
      proof_command: "npm.cmd run coding-lab:doctor",
      primary_sources: ["https://github.com/continuedev/continue", "https://docs.continue.dev/ide-extensions/agent/model-setup"],
    },
    {
      id: "libsql_vector_memory",
      name: "libSQL local vector memory",
      horizon_decision: "CANDIDATE_FOR_MEMORY_ACCELERATION",
      orangebox_state: "not_installed_current_k3_memory_remains_source_truth",
      installed_or_present: Boolean(pkg.deps["@libsql/client"] || pkg.deps.libsql),
      current_role: "candidate semantic recall layer over receipt/cold-truth pointers",
      promotion_blocker: "Must not replace raw ledger truth. Needs eval proving recall improves without stale hallucination.",
      next_action: "Add as optional index under K3/AtomSmasher after recall benchmark.",
      proof_command: "future k3 vector benchmark doctor",
      primary_sources: ["https://docs.turso.tech/libsql", "https://docs.turso.tech/features/ai-and-embeddings"],
    },
    {
      id: "mastra_agent_framework",
      name: "Mastra",
      horizon_decision: "CANDIDATE_NOT_FIRST_SPEED_FIX",
      orangebox_state: "not_installed_overlap_with_trilane",
      installed_or_present: Boolean(pkg.deps.mastra || pkg.deps["@mastra/core"]),
      current_role: "possible TypeScript workflow/agent framework if it beats custom V3 lanes",
      promotion_blocker: "Overlaps existing TriLane and receipt gates. Must prove lower complexity and better evals.",
      next_action: "Keep in watchlist, do not add dependency until benchmark case exists.",
      proof_command: "future agent-framework bakeoff doctor",
      primary_sources: ["https://mastra.ai/docs", "https://github.com/mastra-ai/mastra"],
    },
    {
      id: "tilelang_tilekernels_dflash",
      name: "TileLang / TileKernels / DFlash acceleration lane",
      horizon_decision: "CODEXA_GPU_ALPHA_ONLY",
      orangebox_state: "not_installed_not_n150_lane",
      installed_or_present: false,
      current_role: "future Codexa GPU inference acceleration benchmark, not default Orangebox runtime",
      promotion_blocker: "Requires GPU/CUDA/kernel correctness benchmark and model-specific serving path. Not for N150/dev CPU.",
      next_action: "Park as Codexa GPU benchmark candidate behind inference acceleration doctor.",
      proof_command: "future codexa gpu acceleration benchmark",
      primary_sources: ["https://github.com/tile-ai/tilelang", "https://github.com/deepseek-ai/TileKernels", "https://arxiv.org/html/2602.06036v1"],
    },
    {
      id: "visual_runtime_toolmesh",
      name: "Visual runtime ToolMesh",
      horizon_decision: visualReadiness?.visual_ready === true ? "CONTROL_PLANE_GREEN_BASELINE_RUNTIME_READY_AI_GENERATORS_GATED" : "CONTROL_PLANE_GREEN_RUNTIME_NOT_PROMOTED",
      orangebox_state: visualReadiness?.visual_ready === true
        ? "baseline_visual_runtime_ready_ai_generators_gated"
        : visualReadiness?.summary?.visual_artifact_pipeline_ready === true
          ? "artifact_pipeline_ready_runtime_tools_candidate"
          : "artifact_pipeline_incomplete",
      installed_or_present: visualReadiness?.summary?.visual_artifact_pipeline_ready === true,
      current_role: "image/video/audio/design capability registry with artifact vault, deterministic baseline runtime proofs, hardware locks, and promotion gates",
      promotion_blocker: visualReadiness?.visual_ready === true
        ? "Baseline visual runtime is ready; ComfyUI, FLUX, Wan, LTX, Whisper, Blender, Krita, GIMP, Resolve, and related AI/GUI tools still need install proof plus sample artifact receipts before default use."
        : "Visual control plane is not fully ready until artifact vault, smoke proof, and baseline runtime receipts are green.",
      next_action: "Promote one local image runtime first, then design, audio, and video in that order; keep living frontend edits in the separate visual lane.",
      proof_command: "npm.cmd run visual:artifact-vault && npm.cmd run visual:artifact-smoke && npm.cmd run visual:readiness",
      primary_sources: ["orangebox-v3/free-alpha-toolmesh/tool-cards/first-batch.tool.json", "scripts/v4/orangebox-visual-production-readiness-doctor.mjs"],
    },
  ];

  const promoted = candidates.filter((candidate) => candidate.horizon_decision.startsWith("ACTIVE")).length;
  const generatedAt = new Date().toISOString();
  const report = {
    ok: true,
    schema_version: "orangebox.horizon_review.v1",
    generated_at: generatedAt,
    status: "ORANGEBOX_HORIZON_REVIEW_READY",
    doctrine: [
      "Review frontier/open candidates, but do not promote them from hype.",
      "TriLane remains strategy authority.",
      "Goose can be hands only after envelope proof.",
      "OpenJarvis can score efficiency before it can route by default.",
      "Hermes can be an optional outer agent, but Orangebox remains the authority chain.",
      "OpenClaw is a retired legacy path, not an active lane.",
      "Visual tools become real only after artifact receipts, not cards.",
    ],
    source_files: {
      package_json: pkg.file,
      tool_cards: cardsFile,
      v3_ledger: path.join(repoRoot, "orangebox-v3", "docs", "V3_MASTER_LEDGER.md"),
    },
    local_evidence: evidence,
    summary: {
      candidates_reviewed: candidates.length,
      active_contracts: promoted,
      dependency_or_registry_present: candidates.filter((candidate) => candidate.installed_or_present).length,
      goose_card_present: Boolean(cardStatus(cards, "goose")),
      elysia_dependency_present: Boolean(pkg.deps.elysia),
      hermes_pack_present: fs.existsSync(hermesDir),
      openclaw_retired: openclawRetirement?.status === "OPENCLAW_STARTUP_RETIRED",
      littleorange_doctor_present: Boolean(pkg.scripts["littleorange:doctor"]),
      visual_artifact_pipeline_ready: visualReadiness?.summary?.visual_artifact_pipeline_ready === true,
      visual_ready: visualReadiness?.visual_ready === true,
      visual_runtime_ready_lanes: visualReadiness?.summary?.runtime_ready_lanes ?? null,
      openjarvis_runtime_status: openJarvisRuntime?.status || null,
      openjarvis_runtime_found: openJarvisRuntime?.runtime_truth?.runtime_found ?? null,
      openjarvis_same_task_manifest_ready: openJarvisRuntime?.same_task_bakeoff?.manifest_ready ?? null,
      ledger_mentions_v3_phases: ["Elysia API Bridge", "MCP + Context7", "Goose Executor", "OpenJarvis Eval Harness"].every((text) => ledgerText.includes(text)),
      package_hash: sha256(JSON.stringify(pkg.deps)),
    },
    external_review: {
      reviewed_at: generatedAt,
      scope: "Backend/Ops adoption review for current open agent, docs-hydration, IDE, visual-runtime, and inference-acceleration candidates.",
      confirmed_facts: [
        "OpenJarvis is real and useful to Orangebox mainly as a five-primitive efficiency/spec-eval harness, not as a router replacement.",
        "Goose is a real local agent with CLI/API/Desktop and MCP extensions; Orangebox should use it only behind the ghost-worktree envelope until benchmarks pass.",
        "Context7 is real and useful as a read-only docs hydration lane; its setup may use CLI/skills or MCP and may involve API-key/rate-limit choices.",
        "Hermes Agent is real, MIT/open-source, and stronger than OpenClaw as an optional outer personal-agent wrapper, but must not become hidden authority.",
        "Void is a real open-source Cursor-style IDE fork; it is a reference path for LittleOrange, not a low-cost base migration today.",
        "Continue remains useful as a source-controlled AI checks idea, but it overlaps Checkmate/STRONGARM and needs a bakeoff.",
        "libSQL vector search is a credible local semantic-memory candidate; raw receipt/ledger truth remains primary.",
        "TileLang/TileKernels/DFlash are Codexa GPU alpha candidates, not default N150/dev runtime.",
      ],
    },
    candidates,
    hard_truth: [
      "Bun is the execution standard in package scripts now.",
      "Elysia is present and has a sidecar contract.",
      "Goose is a registered candidate and envelope, not a promoted executor.",
      "OpenJarvis is an eval/spec harness, not the active router.",
      "Hermes integration files exist, but Hermes is not allowed to bypass Orangebox authority or receipts.",
      "OpenClaw may appear only in retirement/recovery surfaces.",
      "Context7 is a docs-lane candidate, not installed as an always-on MCP lane.",
      "LittleOrange/Cortex has a doctor and separate visual-surface boundary; Ops verifies it but does not edit its frontend lane here.",
      "Void and Continue are useful references/candidates, not promoted Orangebox bases.",
      "AI SDK/Ollama, libSQL vectors, Mastra, TileLang, TileKernels, and DFlash are not active dependencies in this repo right now.",
      visualReadiness?.visual_ready === true
        ? `Visual runtime ToolMesh baseline is ready across ${visualReadiness?.summary?.runtime_ready_lanes ?? 0} runtime lanes; AI generators, external codecs, GUI tools, and transcription/editing tools remain separately gated.`
        : "Visual runtime ToolMesh control plane exists, but baseline visual runtime is not yet fully ready.",
    ],
    next_actions_ranked: [
      "Run visual:readiness whenever ToolMesh cards or lab doctors change.",
      "Benchmark Elysia sidecar against current rails before making it default.",
      "Run Goose only inside a ghost worktree with the existing envelope and one bounded task.",
      "Use OpenJarvis to evaluate TriLane efficiency, not to replace it.",
      "Keep Hermes optional and receipt-gated; OpenClaw remains retirement-only.",
      "Run littleorange:doctor and visual proof in the visual lane before calling LittleOrange release-ready.",
      "Promote Context7 as read-only docs hydration only after MCP quarantine proof.",
      "Keep TileLang/TileKernels/DFlash as Codexa GPU alpha, not N150/dev runtime.",
    ],
  };

  const latestPath = path.join(outDir, "latest-horizon-review.json");
  await writeJson(latestPath, report);
  if (args.includes("--receipt")) {
    const receiptPath = path.join(receiptDir, `orangebox-horizon-review-${stamp()}.json`);
    await writeJson(receiptPath, { ...report, receipt_path: receiptPath, latest_path: latestPath });
    report.receipt_path = receiptPath;
  }
  report.latest_path = latestPath;
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "ORANGEBOX_HORIZON_REVIEW_FATAL", error: String(error?.stack || error) }, null, 2));
  process.exit(1);
});
