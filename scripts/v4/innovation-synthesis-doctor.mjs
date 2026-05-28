#!/usr/bin/env node
/* innovation-synthesis-doctor.mjs - no-network ORANGEBOX innovation queue proof.
 *
 * Reads local Alpha/research artifacts, verifies source coverage, emits a
 * ranked innovation queue, and optionally writes a receipt. It intentionally
 * makes no model, network, credential, MCP, or visual calls.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const INNOVATION_SYNTHESIS_VERSION = "orangebox-innovation-synthesis/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

const SOURCE_FILES = [
  "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
  "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
  "docs/JARVISLABS_LLM_UPGRADE_ALPHA_2026-05-27.md",
  "docs/JARVISLABS_FULL_BLOG_SWEEP_2026-05-27.md",
  "docs/AtomEons_Manifest_Runtime_Manual_v0.2_Implementation_Spec.md",
  "docs/ORANGEBOX_LLM_SYSTEM_STATUS_2026-05-27.md",
  "docs/ORANGEBOX_PROCESS_BOOK_2026-05-27.md",
  "docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md",
  "docs/v3.1/ANTHROPIC-ALPHA-APPLIED.md",
  "docs/V6_TRENDING_INTEGRATION_PLAN.md",
  "docs/DEPT_LLM_ARCHITECTURE_2026-05-18.md",
  "docs/SCOPE_ADD_ORCHESTRATORS_2026-05-18.md",
  "docs/SCOPE_4100_DAYS.md",
  "docs/SILENT_CANVAS_BIG_BUILD_ADDENDUM_2026-05-18.md",
  "docs/WARBOOK_LIVING_SYSTEM_2026-05-18.md",
  "docs/AELANG_SPEC.md",
  "docs/AELANG_RESILIENCY_MODULE.md",
  "4-MEMORY-AND-KNOWLEDGE.md",
  "memory/orangebox-knowledge-v2/ENGINE.md",
];

const OPTIONAL_DATA_ARTIFACTS = [
  path.join(os.homedir(), "OrangeBox-Data", "alpha-intake", "source-verification-queue.json"),
  path.join(os.homedir(), "OrangeBox-Data", "alpha-intake", "jarvislabs-blog-sweep-20260527.json"),
];

const INNOVATIONS = [
  {
    id: "OBX-INNOV-001",
    priority: "P0",
    title: "Delta Context Ledger",
    class: "knowledge_freshness",
    thesis: "Incremental source hashing and freshness receipts for knowledge-v2 so stale context and full rebuild waste stop being invisible.",
    evidence_terms: ["CocoIndex", "incremental", "Merkle", "stale", "knowledge-v2"],
    source_files: [
      "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
      "docs/V6_TRENDING_INTEGRATION_PLAN.md",
      "memory/orangebox-knowledge-v2/ENGINE.md",
    ],
    first_build: [
      "Add a content-hash ledger for knowledge sources.",
      "Emit changed/unchanged/deleted source counts in rebuild receipts.",
      "Add a freshness age field to context packs.",
    ],
    proof_gate: "Two rebuilds with no source changes skip unchanged docs; one edited file produces a one-file delta receipt.",
    risk: "Incorrect hashing could skip changed files.",
    rollback: "Disable incremental mode and fall back to full streaming rebuild.",
  },
  {
    id: "OBX-INNOV-002",
    priority: "P0",
    title: "Four-Tier Memory Governor",
    class: "memory_lifecycle",
    thesis: "Convert memory from static layers into governed working, episodic, semantic, and procedural stores with contradiction and decay receipts.",
    evidence_terms: ["MemFactory", "delta-mem", "4-tier", "Ebbinghaus", "procedural"],
    source_files: [
      "4-MEMORY-AND-KNOWLEDGE.md",
      "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
      "docs/V6_TRENDING_INTEGRATION_PLAN.md",
    ],
    first_build: [
      "Create tier directories under the ORANGEBOX data root.",
      "Consolidate synthetic receipts into all four tiers.",
      "Record contradiction receipts instead of silent overwrite.",
    ],
    proof_gate: "Synthetic receipts create working, episodic, semantic, and procedural entries with provenance.",
    risk: "Premature summarization may erase useful detail.",
    rollback: "Keep raw working receipts as Layer 1 truth and rebuild tiers.",
  },
  {
    id: "OBX-INNOV-003",
    priority: "P0",
    title: "Claude/Codex Session Health Governor",
    class: "session_resilience",
    thesis: "Make compaction pressure, MCP output size, media artifacts, and tool-call pairing locally checkable before handoff.",
    evidence_terms: ["compaction", "MCP", "tool result", "self-healing", "resume"],
    source_files: [
      "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
      "docs/V4_ALPHA_FROM_ANTHROPIC_DOCS.md",
      "docs/AELANG_RESILIENCY_MODULE.md",
    ],
    first_build: [
      "Add transcript fixtures for tool_use/tool_result pairing.",
      "Route large MCP output to artifacts with output caps.",
      "Emit session-health receipts before handoff.",
    ],
    proof_gate: "A mismatched tool result fixture fails and a large MCP output fixture is capped.",
    risk: "Validator may reject valid provider transcript variants.",
    rollback: "Keep governor advisory-only until fixture coverage expands.",
  },
  {
    id: "OBX-INNOV-004",
    priority: "P0",
    title: "Department Router Dry Run",
    class: "department_os",
    thesis: "Ship AE1-AE14 routing, trust tiers, budget metadata, and receipts without opening autonomous mutation.",
    evidence_terms: ["AE14", "trust tier", "Department", "route_packet", "budget"],
    source_files: [
      "docs/DEPT_LLM_ARCHITECTURE_2026-05-18.md",
      "docs/AELANG_SPEC.md",
      "docs/AtomEons_Manifest_Runtime_Manual_v0.2_Implementation_Spec.md",
    ],
    first_build: [
      "Create a canonical department registry.",
      "Add route-only receipts.",
      "Add fixtures for code, research, security, launch, and benchmark tasks.",
    ],
    proof_gate: "Route fixtures select expected departments and prove no dispatch or mutation occurred.",
    risk: "Routing confidence may be overstated before real dispatch data.",
    rollback: "Keep router as advisory metadata; operator remains final route authority.",
  },
  {
    id: "OBX-INNOV-005",
    priority: "P0",
    title: "MCP Quarantine Gateway",
    class: "mcp_security",
    thesis: "All MCPs, including XMCP, enter as candidates and prove health, tools, scopes, risk, caps, and receipts before write use.",
    evidence_terms: ["MCP", "XMCP", "read-only", "tool-list", "OAuth"],
    source_files: [
      "docs/SILENT_CANVAS_BIG_BUILD_ADDENDUM_2026-05-18.md",
      "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
      "docs/SCOPE_4100_DAYS.md",
    ],
    first_build: [
      "Add candidate, verified_read, verified_write_guarded, disabled, and blocked states.",
      "Classify mock MCP tools by risk.",
      "Refuse write tools until promotion.",
    ],
    proof_gate: "A mock write tool cannot run from candidate state and must produce a blocked receipt.",
    risk: "Too much friction can slow useful read-only integrations.",
    rollback: "Allow local-only trusted read tools after explicit operator promotion.",
  },
  {
    id: "OBX-INNOV-006",
    priority: "P0",
    title: "Agent Bench Arena",
    class: "benchmarks",
    thesis: "A local benchmark lane that rewards long-horizon coherence and structural progress while punishing shallow knob-twiddling.",
    evidence_terms: ["NanoGPT-Bench", "YC-Bench", "LongMemEval", "hyperparameter", "benchmark"],
    source_files: [
      "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
      "docs/V6_TRENDING_INTEGRATION_PLAN.md",
      "docs/ORANGEBOX_PROCESS_BOOK_2026-05-27.md",
    ],
    first_build: [
      "Add deterministic no-model fixtures.",
      "Score scratchpad use, structural improvement, and receipt completeness.",
      "Emit promotion verdicts.",
    ],
    proof_gate: "A structural solution fixture beats a repeated trivial-parameter fixture.",
    risk: "Benchmarks can become gameable if too small.",
    rollback: "Keep scores internal until benchmark family is stable.",
  },
  {
    id: "OBX-INNOV-007",
    priority: "P0",
    title: "Hardware-Aware Inference Matrix",
    class: "inference",
    thesis: "Treat no-GPU controller, AI Box Ollama, future vLLM, SGLang, speculative, MTP, and quantization as gated profiles, not one install step.",
    evidence_terms: ["vLLM", "SGLang", "speculative", "MTP", "no GPU"],
    source_files: [
      "docs/JARVISLABS_FULL_BLOG_SWEEP_2026-05-27.md",
      "docs/JARVISLABS_LLM_UPGRADE_ALPHA_2026-05-27.md",
      "docs/ORANGEBOX_PROCESS_BOOK_2026-05-27.md",
    ],
    first_build: [
      "Extend inference doctor profile output.",
      "Keep GPU-only profiles deferred on N150.",
      "Require quality and latency receipts for future accelerated profiles.",
    ],
    proof_gate: "Current hardware returns two-device adaptive green with GPU lanes deferred.",
    risk: "Future GPU profile naming can drift as backends change.",
    rollback: "Profile aliases remain runtime-configurable and proof-gated.",
  },
  {
    id: "OBX-INNOV-008",
    priority: "P1",
    title: "X Alpha Feed Typed Lane",
    class: "external_data",
    thesis: "Use the official TypeScript XDK shape through mocks/playground first, with X llms.txt docs packing and zero credentials by default.",
    evidence_terms: ["XDK", "TypeScript", "llms.txt", "playground", "pagination"],
    source_files: [
      "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
      "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
    ],
    first_build: [
      "Create mock timeline and search payload fixtures.",
      "Add typed extraction for post, author, media, and links.",
      "Record rate-limit and credential policy placeholders.",
    ],
    proof_gate: "Mock paginated X timeline parses without network, credentials, or package install.",
    risk: "API plan or auth scope may limit production usefulness.",
    rollback: "Keep feed in Alpha source-intake lane until credentials are explicitly configured.",
  },
  {
    id: "OBX-INNOV-009",
    priority: "P1",
    title: "Receipt Intelligence Miner",
    class: "failure_patterns",
    thesis: "Mine receipts for repeated misses and propose regression guards before failures become folklore.",
    evidence_terms: ["receipts", "failpattern", "mistakes", "regression", "guard"],
    source_files: [
      "4-MEMORY-AND-KNOWLEDGE.md",
      "docs/AELANG_RESILIENCY_MODULE.md",
      "docs/WARBOOK_LIVING_SYSTEM_2026-05-18.md",
    ],
    first_build: [
      "Cluster fixture receipts by symptom.",
      "Name likely common cause.",
      "Generate suggested regression guard.",
    ],
    proof_gate: "Fixture receipts produce at least three named failure clusters and guard suggestions.",
    risk: "Low-quality clustering can create noisy tickets.",
    rollback: "Keep miner suggestions dormant until operator accepts them.",
  },
  {
    id: "OBX-INNOV-010",
    priority: "P1",
    title: "AELang Resilience Kernel",
    class: "continuity",
    thesis: "Turn planned checkpointed missions into the first runtime slice: heartbeat, stall, resume ticket, and artifact delivery proof.",
    evidence_terms: ["heartbeat", "stall", "resume ticket", "artifact", "checkpointed"],
    source_files: [
      "docs/AELANG_SPEC.md",
      "docs/AELANG_RESILIENCY_MODULE.md",
    ],
    first_build: [
      "Add simulated heartbeat receipt.",
      "Add simulated stall receipt.",
      "Add resume ticket generator from last green receipt.",
    ],
    proof_gate: "Simulated stall writes a complete resume ticket with recovery command.",
    risk: "Resume tickets can be misleading if last green receipt is incomplete.",
    rollback: "Require operator approval before any resume ticket triggers work.",
  },
  {
    id: "OBX-INNOV-011",
    priority: "P1",
    title: "Research Provenance Graph",
    class: "research_to_runtime",
    thesis: "Track source -> claim -> decision -> ticket -> touched file -> receipt so Alpha becomes buildable memory.",
    evidence_terms: ["source", "claim", "decision", "receipt", "Accepted"],
    source_files: [
      "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
      "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
      "docs/JARVISLABS_LLM_UPGRADE_ALPHA_2026-05-27.md",
    ],
    first_build: [
      "Create local provenance node schema.",
      "Import XDK and JarvisLabs source decisions.",
      "Link accepted, corrected, held, and approval-needed labels.",
    ],
    proof_gate: "XDK and JarvisLabs sources each appear with decisions and promotion states.",
    risk: "Graph may duplicate existing docs if not treated as an index.",
    rollback: "Rebuild graph from source docs and receipts.",
  },
  {
    id: "OBX-INNOV-012",
    priority: "P1",
    title: "Night Watch Spore Queue",
    class: "background_synthesis",
    thesis: "Budget-capped background proposal engine that creates dormant suggestions only, never mutations.",
    evidence_terms: ["night watch", "spore", "suggestions", "budget cap", "Dream Mode"],
    source_files: [
      "docs/WARBOOK_LIVING_SYSTEM_2026-05-18.md",
      "docs/DEPT_LLM_ARCHITECTURE_2026-05-18.md",
    ],
    first_build: [
      "Read recent receipts and Alpha queues.",
      "Generate no-model dormant suggestions by default.",
      "Attach source evidence and proof gates.",
    ],
    proof_gate: "A no-network run creates dormant suggestions and proves zero mutations.",
    risk: "Background suggestions can become clutter.",
    rollback: "Disable the queue and archive dormant suggestions.",
  },
];

function dataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readSource(relativePath) {
  const file = path.join(ROOT, relativePath);
  const text = await fs.readFile(file, "utf8");
  return {
    relative_path: relativePath,
    path: file,
    bytes: Buffer.byteLength(text, "utf8"),
    sha256: sha256(text),
    text,
  };
}

function countTermHits(text, terms) {
  const lower = text.toLowerCase();
  return terms.map((term) => ({
    term,
    hits: (lower.match(new RegExp(term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length,
  })).filter((item) => item.hits > 0);
}

function summarizeByClass(items) {
  const out = {};
  for (const item of items) out[item.class] = (out[item.class] || 0) + 1;
  return out;
}

async function readOptionalArtifact(file) {
  if (!fsSync.existsSync(file)) return { path: file, exists: false };
  const raw = await fs.readFile(file);
  let parsed = null;
  try {
    parsed = JSON.parse(raw.toString("utf8"));
  } catch {
    parsed = null;
  }
  return {
    path: file,
    exists: true,
    bytes: raw.length,
    sha256: sha256(raw),
    summary: parsed?.summary || parsed?.priority_counts || null,
  };
}

async function writeReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-innovation-synthesis-${stampForFile()}.json`);
  await writeJson(file, { ...result, receipt_path: file });
  return file;
}

export async function runInnovationSynthesis({ writeReceipt: shouldWriteReceipt = false, writeQueue = true, dataRootPath = dataRoot() } = {}) {
  const startedAt = new Date().toISOString();
  const sourceReads = [];
  const failures = [];

  for (const relativePath of SOURCE_FILES) {
    try {
      sourceReads.push(await readSource(relativePath));
    } catch (error) {
      failures.push({
        id: "missing-source",
        source: relativePath,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const corpus = sourceReads.map((source) => source.text).join("\n\n");
  const optionalArtifacts = [];
  for (const file of OPTIONAL_DATA_ARTIFACTS) {
    optionalArtifacts.push(await readOptionalArtifact(file));
  }

  const innovations = INNOVATIONS.map((candidate, index) => {
    const missingSources = candidate.source_files.filter((source) => !sourceReads.some((read) => read.relative_path === source));
    const term_hits = countTermHits(corpus, candidate.evidence_terms);
    const evidence_score = Math.min(100, term_hits.reduce((sum, item) => sum + item.hits, 0) * 5 + (candidate.priority === "P0" ? 20 : 10));
    return {
      rank: index + 1,
      ...candidate,
      evidence_score,
      term_hits,
      source_state: missingSources.length ? "PARTIAL" : "SUPPORTED",
      missing_sources: missingSources,
      promotion_state: "candidate",
      constraints: {
        no_visual_work: true,
        no_paid_api_call_required_for_first_proof: true,
        no_credential_required_for_first_proof: true,
      },
    };
  });

  const candidateFailures = innovations
    .filter((candidate) => candidate.missing_sources.length || candidate.term_hits.length === 0)
    .map((candidate) => ({
      id: "candidate-source-support",
      candidate_id: candidate.id,
      missing_sources: candidate.missing_sources,
      term_hits: candidate.term_hits.length,
    }));

  const queueRoot = path.join(dataRootPath, "innovation");
  const latestQueuePath = path.join(queueRoot, "latest-innovation-queue.json");
  const stampedQueuePath = path.join(queueRoot, `innovation-queue-${stampForFile()}.json`);

  const result = {
    ok: failures.length === 0 && candidateFailures.length === 0,
    version: INNOVATION_SYNTHESIS_VERSION,
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    no_network_calls: true,
    no_model_calls: true,
    no_mcp_calls: true,
    no_credential_reads: true,
    no_visual_work: true,
    inputs: {
      source_files: sourceReads.map((source) => ({
        relative_path: source.relative_path,
        path: source.path,
        bytes: source.bytes,
        sha256: source.sha256,
      })),
      optional_artifacts: optionalArtifacts,
    },
    summary: {
      sources_expected: SOURCE_FILES.length,
      sources_read: sourceReads.length,
      source_failures: failures.length,
      innovations_total: innovations.length,
      p0: innovations.filter((item) => item.priority === "P0").length,
      p1: innovations.filter((item) => item.priority === "P1").length,
      by_class: summarizeByClass(innovations),
      first_build_order: innovations.slice(0, 6).map((item) => item.id),
    },
    failures: [...failures, ...candidateFailures],
    innovation_queue: innovations,
    outputs: {
      data_root: dataRootPath,
      latest_queue_path: writeQueue ? latestQueuePath : null,
      stamped_queue_path: writeQueue ? stampedQueuePath : null,
      queue_written: false,
    },
    recommendations: [
      "Build Delta Context Ledger first because every model lane depends on fresh context.",
      "Build Session Health Governor before wiring more subscription/frontier adapters.",
      "Build Department Router in dry-run mode before any autonomous department dispatch.",
      "Build MCP Quarantine Gateway before XMCP or external MCP promotion.",
      "Use Agent Bench Arena before calling any later change an optimization.",
    ],
    rollback: {
      repo_mutation: "innovation doc, package script, and synthesis doctor",
      data_mutation: writeQueue ? "innovation queue JSON under data root plus optional receipt" : shouldWriteReceipt ? "receipt only" : "none",
      recovery_action: writeQueue ? `Delete ${queueRoot} if this synthesis is superseded, or revert the repo files.` : "Revert repo files if this synthesis is superseded.",
    },
    receipt_path: null,
  };

  if (writeQueue) {
    await writeJson(latestQueuePath, result);
    await writeJson(stampedQueuePath, result);
    result.outputs.queue_written = true;
  }
  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runInnovationSynthesis({
    writeReceipt: argv.includes("--receipt"),
    writeQueue: !argv.includes("--no-write-queue"),
  });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FAIL"} innovation synthesis: ${result.summary.innovations_total} innovations, ${result.summary.p0} P0, ${result.summary.p1} P1`);
    if (result.outputs.latest_queue_path) console.log(`queue: ${result.outputs.latest_queue_path}`);
    if (result.receipt_path) console.log(`receipt: ${result.receipt_path}`);
  }
  if (!result.ok) process.exit(4);
}
