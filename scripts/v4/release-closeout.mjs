#!/usr/bin/env node
/* release-closeout.mjs - read-only ORANGEBOX promotion closeout plan.
 *
 * This turns the final "dirty repo" blocker into an operator-readable release
 * decision. It never stages, commits, deletes, or mutates project files except
 * for an optional receipt requested by the operator.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const RELEASE_CLOSEOUT_VERSION = "orangebox-release-closeout/v1";

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

async function readJson(file) {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw.replace(/^\uFEFF/, ""));
}

async function maybeReadJson(file) {
  try {
    if (!file || !fsSync.existsSync(file)) return null;
    return await readJson(file);
  } catch (error) {
    return { error: error?.message || String(error), path: file };
  }
}

async function fileMeta(file) {
  try {
    const stat = await fs.stat(file);
    return {
      path: file,
      exists: true,
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
    };
  } catch {
    return { path: file, exists: false };
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
      mtimeMs: stat.mtimeMs,
    });
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const latest = candidates[0] || null;
  if (!latest) return null;
  delete latest.mtimeMs;
  return latest;
}

async function latestReceipt(regex) {
  return latestFileMatching(RECEIPTS_DIR, regex);
}

async function latestProof(regex) {
  return latestFileMatching(PROOF_DIR, regex);
}

async function latestReleasePathLists(pack = {}) {
  const meta = await latestReceipt(/^orangebox-release-path-lists-\d{8}T\d{6}\.json$/i);
  if (!meta?.path) return { present: false };
  const data = await maybeReadJson(meta.path);
  const files = data?.files || {};
  return {
    present: true,
    summary_path: meta.path,
    modified_at: meta.modified_at,
    bytes: meta.bytes,
    ok: data?.ok === true,
    package_sha256: data?.package?.zip_sha256 || null,
    current_package_match: !!pack?.zip_sha256 && data?.package?.zip_sha256 === pack.zip_sha256,
    counts: data?.counts || {},
    files: {
      stage_paths: files.stage_paths || null,
      hold_paths: files.hold_paths || null,
      guide: files.guide || null,
      summary_json: files.summary_json || meta.path,
    },
    blockers: data?.blockers || [],
    warnings: data?.warnings || [],
    next_action: data?.next_action || "Review the stage and hold path lists before staging.",
  };
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const handle = await fs.open(file, "r");
  try {
    const stream = handle.createReadStream();
    for await (const chunk of stream) hash.update(chunk);
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

export function plannedReleaseDecisionCardPath(date = new Date()) {
  return path.join(RECEIPTS_DIR, `orangebox-release-decision-card-${stampForFile(date)}.md`);
}

export function plannedReleasePacketPaths(stamp = stampForFile()) {
  const base = `orangebox-release-path-lists-${stamp}`;
  return {
    stamp,
    closeout_receipt: path.join(RECEIPTS_DIR, `orangebox-release-closeout-${stamp}.json`),
    decision_card: path.join(RECEIPTS_DIR, `orangebox-release-decision-card-${stamp}.md`),
    stage_paths: path.join(RECEIPTS_DIR, `${base}-stage.txt`),
    hold_paths: path.join(RECEIPTS_DIR, `${base}-hold.txt`),
    guide: path.join(RECEIPTS_DIR, `${base}-guide.md`),
    summary_json: path.join(RECEIPTS_DIR, `${base}.json`),
  };
}

async function canonicalEvidence({ boards, pack, plannedCloseoutReceiptPath = null, plannedDecisionCardPath = null }) {
  const [
    firstRunDesktop,
    firstRunCompact,
    seeSuiteDesktop,
    seeSuiteCompact,
    seeSuiteSilentCanvas,
    operationsDesktop,
    operationsCompact,
    operationsEthereal,
    firstRunReceipt,
    seeSuiteReceipt,
    operationsReceipt,
    installClarityReceipt,
    installReceipt,
    apiReceipt,
    processReceipt,
    closeoutReceipt,
    decisionCardReceipt,
  ] = await Promise.all([
    latestProof(/first-run-ai-box-choice-desktop\.png$/i),
    latestProof(/first-run-ai-box-choice-compact\.png$/i),
    latestProof(/ae-see-suite-desktop\.png$/i),
    latestProof(/ae-see-suite-compact\.png$/i),
    latestProof(/ae-see-suite-silent-canvas\.png$/i),
    latestProof(/ae-operations-lane-desktop\.png$/i),
    latestProof(/ae-operations-lane-compact\.png$/i),
    latestProof(/ae-operations-lane-ethereal\.png$/i),
    latestReceipt(/^orangebox-first-run-visual-proof-\d{8}T\d{6}\.json$/i),
    latestReceipt(/^orangebox-ae-see-suite-visual-proof-\d{8}T\d{6}\.json$/i),
    latestReceipt(/^orangebox-ae-operations-visual-proof-\d{8}T\d{6}\.json$/i),
    latestReceipt(/^orangebox-install-clarity-doctor-\d{8}T\d{6}\.json$/i),
    latestReceipt(/^orangebox-install-rehearsal-\d{8}T\d{6}\.json$/i),
    latestReceipt(/^orangebox-api-doctor-\d{8}T\d{6}\.json$/i),
    latestReceipt(/^orangebox-process-doctor-\d{8}T\d{6}\.json$/i),
    plannedCloseoutReceiptPath ? Promise.resolve({
      path: plannedCloseoutReceiptPath,
      name: path.basename(plannedCloseoutReceiptPath),
      present: true,
      pending_write: true,
    }) : latestReceipt(/^orangebox-release-closeout-\d{8}T\d{6}\.json$/i),
    plannedDecisionCardPath ? Promise.resolve({
      path: plannedDecisionCardPath,
      name: path.basename(plannedDecisionCardPath),
      present: true,
      pending_write: true,
    }) : latestReceipt(/^orangebox-release-decision-card-\d{8}T\d{6}\.md$/i),
  ]);

  const items = [
    { id: "package_zip", label: "Portable package", path: pack.zip_path || null, sha256: pack.zip_sha256 || null, bytes: pack.zip_size || null, present: pack.zip_exists === true },
    { id: "package_manifest", label: "Package manifest", path: pack.manifest_path || null, present: !!pack.manifest_path && fsSync.existsSync(pack.manifest_path) },
    { id: "standard_final_board", label: "Standard Final Green Board", path: boards.latest_standard?.receipt_path || null, present: !!boards.latest_standard?.receipt_path, ok: boards.latest_standard?.ok === true },
    { id: "clean_final_board", label: "Clean Final Green Board", path: boards.latest_clean_required?.receipt_path || null, present: !!boards.latest_clean_required?.receipt_path, ok: boards.latest_clean_required?.ok === true, git_only_blocker: boards.latest_clean_required?.failures?.length === 1 && boards.latest_clean_required.failures[0] === "git_state" },
    { id: "first_run_desktop", label: "Basic/Advanced first-run desktop screenshot", ...(firstRunDesktop || { present: false }) },
    { id: "first_run_compact", label: "Basic/Advanced first-run compact screenshot", ...(firstRunCompact || { present: false }) },
    { id: "see_suite_desktop", label: "AE See-Suite desktop screenshot", ...(seeSuiteDesktop || { present: false }) },
    { id: "see_suite_compact", label: "AE See-Suite compact screenshot", ...(seeSuiteCompact || { present: false }) },
    { id: "see_suite_silent_canvas", label: "Silent Canvas active screenshot", ...(seeSuiteSilentCanvas || { present: false }) },
    { id: "operations_desktop", label: "AE Operations desktop screenshot", ...(operationsDesktop || { present: false }) },
    { id: "operations_compact", label: "AE Operations compact screenshot", ...(operationsCompact || { present: false }) },
    { id: "operations_ethereal", label: "Ethereal AI Link status screenshot", ...(operationsEthereal || { present: false }) },
    { id: "first_run_receipt", label: "First-run proof receipt", ...(firstRunReceipt || { present: false }) },
    { id: "see_suite_receipt", label: "AE See-Suite proof receipt", ...(seeSuiteReceipt || { present: false }) },
    { id: "operations_receipt", label: "AE Operations proof receipt", ...(operationsReceipt || { present: false }) },
    { id: "install_clarity_receipt", label: "Basic/Advanced install clarity receipt", ...(installClarityReceipt || { present: false }) },
    { id: "install_rehearsal_receipt", label: "Clean install rehearsal receipt", ...(installReceipt || { present: false }) },
    { id: "api_receipt", label: "OpenAPI doctor receipt", ...(apiReceipt || { present: false }) },
    { id: "process_receipt", label: "Process hygiene receipt", ...(processReceipt || { present: false }) },
    { id: "closeout_receipt", label: "Release closeout receipt", ...(closeoutReceipt || { present: false }) },
    { id: "decision_card", label: "Plain-English release decision card", ...(decisionCardReceipt || { present: false }) },
  ].map((item) => ({ present: item.present !== false && !!item.path, ...item }));

  const missing = items.filter((item) => !item.present).map((item) => item.id);
  return {
    version: "orangebox-release-evidence-manifest/v1",
    ready: missing.length === 0 && pack.ok === true && boards.latest_standard?.ok === true,
    item_count: items.length,
    present_count: items.length - missing.length,
    missing,
    items,
    operator_copy: missing.length
      ? `${items.length - missing.length}/${items.length} release evidence artifacts are present. Missing: ${missing.slice(0, 5).join(", ")}.`
      : "Canonical release evidence is complete: package, boards, screenshots, receipts, and rollback proof are present.",
  };
}

async function gitStatusEntries() {
  try {
    const out = await execFileAsync("git", ["status", "--short", "--untracked-files=all"], {
      cwd: ROOT,
      timeout: 30000,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const lines = String(out.stdout || "").split(/\r?\n/).filter(Boolean);
    return {
      ok: true,
      lines,
      entries: lines.map(parseStatusLine),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      lines: [],
      entries: [],
      error: error?.message || String(error),
    };
  }
}

function parseStatusLine(line) {
  const status = line.slice(0, 2);
  const file = line.slice(3).trim();
  return {
    raw: line,
    status,
    path: file,
    is_untracked: status === "??",
    is_modified: status.includes("M"),
    is_deleted: status.includes("D"),
    is_renamed: status.includes("R") || file.includes(" -> "),
  };
}

function groupForPath(filePath) {
  const p = filePath.replace(/\\/g, "/");
  const lower = p.toLowerCase();

  if (lower.includes(".bak-") || lower.startsWith("artifacts/pwc-inspect/")) return "candidate-backups-and-inspection";
  if (lower === "docs/api/orangebox-openapi.yaml") return "api-contract";
  if (lower.startsWith("src/") || lower.startsWith("src-tauri/")) return "product-ui";
  if (lower === "package.json" || lower === "package-lock.json" || lower.startsWith("scripts/")) return "engine-and-cli";
  if (lower.startsWith("docs/")) return "operator-docs";
  if (lower.startsWith("receipts/") || lower.startsWith("proof/")) return "proof-and-receipts";
  if (lower.startsWith("artifacts/install-rehearsals/")) return "install-rehearsal-proof";
  if (lower.startsWith("memory/") || lower.startsWith("knowledge/") || lower.startsWith("power/")) return "generated-memory-and-intel";
  if (lower.startsWith("dept-os/") || lower.startsWith("party-line/") || lower.startsWith("project-thread/") || lower.startsWith("dags/") || lower.startsWith("triad/") || lower.startsWith("operating-spine/")) return "operating-state";
  if (lower.startsWith("review-engines/")) return "review-engine-state";
  return "misc-review";
}

const GROUP_LABELS = {
  "api-contract": "API contract",
  "product-ui": "AE See-Suite / AE Operations UI",
  "engine-and-cli": "ORANGEBOX engine, CLI, package scripts",
  "operator-docs": "Operator docs and guides",
  "proof-and-receipts": "Proof images and receipts",
  "install-rehearsal-proof": "Install rehearsal proof",
  "generated-memory-and-intel": "Generated memory, intel, and power snapshots",
  "candidate-backups-and-inspection": "Candidate backups and inspection artifacts",
  "operating-state": "Operating spine, DAG, party-line, department state",
  "review-engine-state": "Review engine state",
  "misc-review": "Miscellaneous review",
};

const GROUP_ACTIONS = {
  "api-contract": "Review contract drift and include with any route/API changes.",
  "product-ui": "Review visually, then stage as product-facing Bluebird UI work.",
  "engine-and-cli": "Run targeted checks before staging engine or command changes.",
  "operator-docs": "Read for wording accuracy before staging.",
  "proof-and-receipts": "Keep as release evidence or archive noisy duplicates before promotion.",
  "install-rehearsal-proof": "Hold local rehearsal artifact trees by default; release proof is carried by receipts/screenshots unless explicitly approved.",
  "generated-memory-and-intel": "Review whether generated state belongs in the release commit or only in local data.",
  "candidate-backups-and-inspection": "Do not promote blindly; archive or remove only with explicit approval.",
  "operating-state": "Review as runtime project state, then decide whether it is release material.",
  "review-engine-state": "Keep latest run evidence if it supports the release claim.",
  "misc-review": "Inspect manually before any stage/commit decision.",
};

const RECOMMENDED_STAGE_GROUPS = [
  "engine-and-cli",
  "product-ui",
  "api-contract",
  "operator-docs",
  "operating-state",
  "review-engine-state",
  "proof-and-receipts",
];

const HOLD_OR_ARCHIVE_GROUPS = [
  "install-rehearsal-proof",
  "generated-memory-and-intel",
  "candidate-backups-and-inspection",
  "misc-review",
];

function normalizeRepoPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\/+/, "");
}

function repoRelativePath(file) {
  if (!file) return null;
  const rel = path.relative(ROOT, file);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return normalizeRepoPath(rel);
}

function evidenceRepoPaths(evidenceManifest) {
  const paths = new Set();
  for (const item of evidenceManifest?.items || []) {
    const rel = repoRelativePath(item.path);
    if (rel) paths.add(rel);
  }
  return paths;
}

function curationDecisionForGroup(groupId) {
  if (RECOMMENDED_STAGE_GROUPS.includes(groupId)) return "stage-candidate";
  if (HOLD_OR_ARCHIVE_GROUPS.includes(groupId)) return "hold-or-archive";
  return "manual-review";
}

function buildCurationPlan({ git, groups, evidenceManifest }) {
  const evidencePaths = evidenceRepoPaths(evidenceManifest);
  const stagePaths = new Set();
  const holdPaths = new Set();

  for (const entry of git.entries) {
    const rel = normalizeRepoPath(entry.path);
    const groupId = groupForPath(rel);

    if (groupId === "proof-and-receipts" || groupId === "install-rehearsal-proof") {
      if (evidencePaths.has(rel)) {
        stagePaths.add(rel);
      } else {
        holdPaths.add(rel);
      }
      continue;
    }

    if (RECOMMENDED_STAGE_GROUPS.includes(groupId)) {
      stagePaths.add(rel);
    } else {
      holdPaths.add(rel);
    }
  }

  for (const rel of evidencePaths) {
    if ((rel.startsWith("proof/") || rel.startsWith("receipts/")) && !holdPaths.has(rel)) {
      stagePaths.add(rel);
    }
  }

  const stageExactPaths = Array.from(stagePaths).sort();
  const holdExactPaths = Array.from(holdPaths).sort();

  return {
    version: "orangebox-release-curation-plan/v1",
    read_only: true,
    mutates_repo: false,
    stages_files: false,
    exact_stage_path_count: stageExactPaths.length,
    exact_hold_or_archive_path_count: holdExactPaths.length,
    latest_evidence_path_count: evidencePaths.size,
    exact_stage_paths: stageExactPaths,
    exact_hold_or_archive_paths: holdExactPaths,
    latest_evidence_paths: Array.from(evidencePaths).sort(),
    group_decisions: groups.map((group) => ({
      id: group.id,
      label: group.label,
      count: group.count,
      modified: group.modified,
      untracked: group.untracked,
      deleted: group.deleted,
      decision: curationDecisionForGroup(group.id),
      action: group.action,
    })),
    safe_sequence: [
      "Review exact_stage_paths and exact_hold_or_archive_paths before any git add.",
      "The path lists are generated from `git status --short --untracked-files=all` so untracked directories are expanded to file-level entries.",
      "Stage only approved exact_stage_paths; keep hold/archive paths untouched until separately approved.",
      "Rerun npm run check, package, proof screens, and clean Final Green Board after staging.",
      "Commit only after the clean board passes and rollback/package evidence is present.",
    ],
    operator_copy: stageExactPaths.length
      ? `${stageExactPaths.length} exact release-candidate paths are ready for operator review; ${holdExactPaths.length} paths are held for archive/local-data decision.`
      : "No release-candidate paths were selected for staging; inspect git status before promotion.",
  };
}

function buildGroups(entries) {
  const map = new Map();
  for (const entry of entries) {
    const id = groupForPath(entry.path);
    if (!map.has(id)) {
      map.set(id, {
        id,
        label: GROUP_LABELS[id] || id,
        count: 0,
        modified: 0,
        untracked: 0,
        deleted: 0,
        samples: [],
        action: GROUP_ACTIONS[id] || GROUP_ACTIONS["misc-review"],
        requires_operator_review: true,
      });
    }
    const group = map.get(id);
    group.count += 1;
    if (entry.is_untracked) group.untracked += 1;
    if (entry.is_modified) group.modified += 1;
    if (entry.is_deleted) group.deleted += 1;
    if (group.samples.length < 12) group.samples.push(entry.raw);
  }

  return Array.from(map.values()).sort((a, b) => {
    const order = [
      "engine-and-cli",
      "product-ui",
      "api-contract",
      "operator-docs",
      "operating-state",
      "review-engine-state",
      "proof-and-receipts",
      "install-rehearsal-proof",
      "generated-memory-and-intel",
      "candidate-backups-and-inspection",
      "misc-review",
    ];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });
}

async function loadFinalBoards() {
  if (!fsSync.existsSync(RECEIPTS_DIR)) {
    return {
      receipts_dir: RECEIPTS_DIR,
      latest: null,
      latest_standard: null,
      latest_clean_required: null,
      count: 0,
    };
  }

  const entries = await fs.readdir(RECEIPTS_DIR, { withFileTypes: true });
  const boards = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^orangebox-final-green-board-\d{8}T\d{6}\.json$/i.test(entry.name)) continue;
    const file = path.join(RECEIPTS_DIR, entry.name);
    try {
      const stat = await fs.stat(file);
      const board = await readJson(file);
      boards.push({ file, modified_at: stat.mtime.toISOString(), mtimeMs: stat.mtimeMs, board });
    } catch {
      // Ignore malformed old receipts here; the green-board doctor owns detailed receipt parsing.
    }
  }
  boards.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const summarize = (item) => {
    if (!item) return null;
    const board = item.board || {};
    return {
      receipt_path: item.file,
      modified_at: item.modified_at,
      ok: board.ok === true,
      full: !!board.full,
      require_clean: !!board.require_clean,
      summary: board.summary || null,
      failures: Array.isArray(board.failures) ? board.failures.map((failure) => failure.name || failure.error || "failure").slice(0, 12) : [],
      warnings: Array.isArray(board.warnings) ? board.warnings.map((warning) => warning.name || warning.error || "warning").slice(0, 12) : [],
      package_manifest: board.rollback?.package_manifest || null,
    };
  };

  return {
    receipts_dir: RECEIPTS_DIR,
    latest: summarize(boards[0]),
    latest_standard: summarize(boards.find((item) => item.board?.require_clean !== true)),
    latest_clean_required: summarize(boards.find((item) => item.board?.require_clean === true)),
    count: boards.length,
  };
}

async function packageSummary() {
  const manifest = await maybeReadJson(SHIP_MANIFEST);
  if (!manifest) {
    return {
      ok: false,
      manifest_path: SHIP_MANIFEST,
      error: "Portable package manifest not found.",
    };
  }
  if (manifest.error) {
    return {
      ok: false,
      manifest_path: SHIP_MANIFEST,
      error: manifest.error,
    };
  }

  const zipMeta = await fileMeta(manifest.zip_path);
  let hash_ok = null;
  let computed_sha256 = null;
  if (zipMeta.exists && manifest.zip_sha256) {
    try {
      computed_sha256 = await sha256File(manifest.zip_path);
      hash_ok = computed_sha256 === manifest.zip_sha256;
    } catch (error) {
      hash_ok = false;
      computed_sha256 = `error: ${error?.message || String(error)}`;
    }
  }

  return {
    ok: zipMeta.exists === true && hash_ok !== false,
    manifest_path: SHIP_MANIFEST,
    version: manifest.version || null,
    timestamp: manifest.timestamp || null,
    zip_path: manifest.zip_path || null,
    zip_exists: zipMeta.exists === true,
    zip_size: manifest.zip_size || zipMeta.bytes || null,
    zip_sha256: manifest.zip_sha256 || null,
    computed_zip_sha256: computed_sha256,
    hash_ok,
    exe_path: manifest.exe_path || null,
    exe_sha256: manifest.exe_sha256 || null,
    ethereal_ai_link: manifest.ethereal_ai_link ? {
      included: !!manifest.ethereal_ai_link.included,
      zip_relative_dir: manifest.ethereal_ai_link.zip_relative_dir || null,
      token_file_shipped: !!manifest.ethereal_ai_link.token_file_shipped,
      approval_required_for_apply: manifest.ethereal_ai_link.approval_required_for_apply !== false,
      create_token_command: manifest.ethereal_ai_link.create_token_command || null,
    } : null,
  };
}

function releaseInterpretation({ git, boards, pack, groups }) {
  const blockers = [];
  const warnings = [];

  if (!git.ok) blockers.push({ id: "git-status-unavailable", detail: git.error });
  if (!pack.ok) blockers.push({ id: "package-unverified", detail: pack.error || "Portable zip or hash is not verified." });
  if (!boards.latest_standard?.ok) blockers.push({ id: "standard-board-not-green", detail: "Run obx finish green-board --full --receipt." });

  const cleanBoard = boards.latest_clean_required;
  const cleanBoardGitOnly = cleanBoard
    && cleanBoard.ok === false
    && Array.isArray(cleanBoard.failures)
    && cleanBoard.failures.length === 1
    && cleanBoard.failures[0] === "git_state";

  if (!cleanBoard) {
    warnings.push({ id: "clean-board-missing", detail: "Run obx finish green-board --full --require-clean --receipt after staging decisions." });
  } else if (!cleanBoardGitOnly && !cleanBoard.ok) {
    blockers.push({ id: "clean-board-has-non-git-failures", detail: cleanBoard.failures.join(", ") || "Unknown clean-board failure." });
  }

  if (git.entries.length > 0) {
    blockers.push({
      id: "operator-stage-decision-required",
      detail: `${git.entries.length} git status entries require review before promotion.`,
    });
  }

  const backupGroup = groups.find((group) => group.id === "candidate-backups-and-inspection");
  if (backupGroup?.count) {
    warnings.push({
      id: "backup-artifacts-present",
      detail: `${backupGroup.count} backup/inspection entries should be archived or explicitly kept before release-candidate commit.`,
    });
  }

  return {
    can_promote_now: blockers.length === 0,
    clean_board_git_only: !!cleanBoardGitOnly,
    blockers,
    warnings,
  };
}

async function writeCloseoutReceipt(result, file = null) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  file ||= path.join(RECEIPTS_DIR, `orangebox-release-closeout-${stampForFile()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, JSON.stringify(result, null, 2), "utf8");
  return file;
}

function itemPath(evidenceManifest, id) {
  const item = (evidenceManifest?.items || []).find((candidate) => candidate.id === id);
  return item?.path || null;
}

export function renderReleaseDecisionCard(result) {
  const summary = result?.summary || {};
  const pack = result?.package || {};
  const curation = result?.curation_plan || {};
  const evidence = result?.evidence_manifest || {};
  const latestStandard = result?.boards?.latest_standard || null;
  const latestClean = result?.boards?.latest_clean_required || null;
  const stageGroups = new Set(result?.recommended_stage_groups || []);
  const holdGroups = new Set(result?.hold_or_archive_groups || []);
  const stageGroupRows = (result?.groups || []).filter((group) => stageGroups.has(group.id));
  const holdGroupRows = (result?.groups || []).filter((group) => holdGroups.has(group.id));
  const countPathsByGroup = (paths = []) => {
    const counts = new Map();
    for (const candidate of paths) {
      const groupId = groupForPath(candidate);
      counts.set(groupId, (counts.get(groupId) || 0) + 1);
    }
    return counts;
  };
  const selectedByGroup = countPathsByGroup(curation.exact_stage_paths || []);
  const heldByGroup = countPathsByGroup(curation.exact_hold_or_archive_paths || []);
  const blockers = result?.blockers || [];
  const warnings = result?.warnings || [];

  const line = (label, value) => `- ${label}: ${value ?? "unknown"}`;
  const stageGroupLine = (group) => `- ${group.label}: ${selectedByGroup.get(group.id) || 0} selected of ${group.count} total paths (${group.modified} modified, ${group.untracked} untracked)`;
  const holdGroupLine = (group) => `- ${group.label}: ${heldByGroup.get(group.id) || 0} held of ${group.count} total paths (${group.modified} modified, ${group.untracked} untracked)`;
  const evidenceLine = (id, label) => {
    const value = itemPath(evidence, id);
    return value ? line(label, value) : line(label, "missing");
  };

  return [
    "verdict",
    "",
    result?.ok
      ? "ORANGEBOX can move to release promotion after operator approval of package publication."
      : "ORANGEBOX Bluebird is package-ready and standard-board green, but release promotion is intentionally blocked by the git staging/hold decision.",
    "",
    "evidence",
    "",
    line("package", pack.zip_path),
    line("package sha256", pack.zip_sha256),
    line("package hash verified", pack.hash_ok === true ? "yes" : pack.hash_ok === false ? "no" : "unknown"),
    line("standard Final Green Board", latestStandard?.receipt_path),
    line("standard board status", summary.standard_board_ok ? "green" : "not green"),
    line("clean-required Final Green Board", latestClean?.receipt_path),
    line("clean-required board status", summary.clean_board_ok ? "green" : summary.clean_board_git_only ? "blocked by git state only" : "needs review"),
    line("release evidence", `${summary.evidence_present_count || 0}/${summary.evidence_item_count || 0} artifacts present`),
    evidenceLine("first_run_desktop", "Basic/Advanced first-run desktop screenshot"),
    evidenceLine("see_suite_desktop", "AE See-Suite desktop screenshot"),
    evidenceLine("see_suite_silent_canvas", "Silent Canvas active screenshot"),
    evidenceLine("operations_desktop", "AE Operations desktop screenshot"),
    evidenceLine("operations_ethereal", "Ethereal AI Link screenshot"),
    line("closeout receipt", result?.receipt_path),
    "",
    "operator decision",
    "",
    line("dirty repo entries", summary.dirty_count),
    line("stage-candidate exact paths", curation.exact_stage_path_count),
    line("hold/archive exact paths", curation.exact_hold_or_archive_path_count),
    "",
    "Stage-candidate groups:",
    ...(stageGroupRows.length ? stageGroupRows.map(stageGroupLine) : ["- none"]),
    "",
    "Hold/archive groups:",
    ...(holdGroupRows.length ? holdGroupRows.map(holdGroupLine) : ["- none"]),
    "",
    "blockers",
    "",
    ...(blockers.length ? blockers.map((blocker) => `- ${blocker.id}: ${blocker.detail || "review required"}`) : ["- none"]),
    "",
    "warnings",
    "",
    ...(warnings.length ? warnings.map((warning) => `- ${warning.id}: ${warning.detail || "review warning"}`) : ["- none"]),
    "",
    "rollback / recovery note",
    "",
    "- No staging, commit, deletion, process cleanup, package publication, or production deploy was performed by this card.",
    "- The standard board warning is a live-sidecar reload issue: close and reopen ORANGEBOX so the Node sidecar reloads current routes, then rerun service freshness and final board.",
    "- If the decision card is wrong, discard this markdown receipt and rerun `obx finish decision-card --receipt` after inspecting git status.",
    "",
    "next action",
    "",
    "- Operator approves the exact staging/hold plan or asks for revisions.",
    "- After approval: stage only approved paths, handle hold/archive paths explicitly, rerun `npm run check`, rerun package, rerun visual proof as needed, then run `obx finish green-board --full --require-clean --receipt`.",
    "",
  ].join("\n");
}

export async function writeReleaseDecisionCard(result, file = null) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  file ||= path.join(RECEIPTS_DIR, `orangebox-release-decision-card-${stampForFile()}.md`);
  const markdown = renderReleaseDecisionCard(result);
  await fs.writeFile(file, markdown, "utf8");
  return file;
}

function renderOperatorStagingGuide(result, files) {
  const summary = result?.summary || {};
  const pack = result?.package || {};
  return [
    "verdict",
    "",
    "This is a review-only release staging guide. It does not stage, commit, delete, archive, publish, or deploy anything.",
    "The generated lists are file-level paths from `git status --short --untracked-files=all`; untracked directories are expanded before review.",
    "",
    "evidence",
    "",
    `- package: ${pack.zip_path || "unknown"}`,
    `- package sha256: ${pack.zip_sha256 || "unknown"}`,
    `- standard board green: ${summary.standard_board_ok ? "yes" : "no"}`,
    `- clean board status: ${summary.clean_board_ok ? "green" : summary.clean_board_git_only ? "blocked by git state only" : "needs review"}`,
    `- stage list: ${files.stage_paths}`,
    `- hold/archive list: ${files.hold_paths}`,
    `- machine summary: ${files.summary_json}`,
    "",
    "operator decision",
    "",
    `- stage-candidate exact paths: ${summary.curation_stage_path_count || 0}`,
    `- hold/archive exact paths: ${summary.curation_hold_path_count || 0}`,
    "- Review the two path lists before any git action.",
    "- Stage only the approved stage list.",
    "- Do not delete or archive held paths without explicit approval.",
    "",
    "safe command pattern",
    "",
    "Use this only after approving the stage list:",
    "",
    "```powershell",
    "$paths = Get-Content 'PATH_TO_STAGE_LIST_TXT'",
    "git add -- $paths",
    "```",
    "",
    "blockers",
    "",
    ...(result?.blockers?.length ? result.blockers.map((blocker) => `- ${blocker.id}: ${blocker.detail || "review required"}`) : ["- none"]),
    "",
    "rollback / recovery note",
    "",
    "- If a path was staged accidentally, use `git restore --staged -- <path>` before any commit.",
    "- If this guide is stale, discard these receipt artifacts and rerun `obx finish path-lists --receipt`.",
    "- Package and proof artifacts are untouched by this guide.",
    "",
    "next action",
    "",
    "- Operator approves, revises, or rejects the stage/hold split.",
    "",
  ].join("\n");
}

export async function writeReleasePathLists(result, { stamp = stampForFile(), files: plannedFiles = null, includeSelf = true } = {}) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const base = `orangebox-release-path-lists-${stamp}`;
  const files = plannedFiles || {
    stage_paths: path.join(RECEIPTS_DIR, `${base}-stage.txt`),
    hold_paths: path.join(RECEIPTS_DIR, `${base}-hold.txt`),
    guide: path.join(RECEIPTS_DIR, `${base}-guide.md`),
    summary_json: path.join(RECEIPTS_DIR, `${base}.json`),
  };
  const stageSet = new Set(result?.curation_plan?.exact_stage_paths || []);
  const holdSet = new Set(result?.curation_plan?.exact_hold_or_archive_paths || []);
  const selfPaths = includeSelf
    ? Object.values(files).map((file) => repoRelativePath(file)).filter(Boolean)
    : [];
  for (const rel of selfPaths) {
    holdSet.delete(rel);
    stageSet.add(rel);
  }
  const stagePaths = Array.from(stageSet).sort();
  const holdPaths = Array.from(holdSet).sort();
  if (result?.curation_plan) {
    result.curation_plan.exact_stage_paths = stagePaths;
    result.curation_plan.exact_hold_or_archive_paths = holdPaths;
    result.curation_plan.exact_stage_path_count = stagePaths.length;
    result.curation_plan.exact_hold_or_archive_path_count = holdPaths.length;
    result.curation_plan.path_list_artifact_paths = selfPaths;
  }
  if (result?.summary) {
    result.summary.curation_stage_path_count = stagePaths.length;
    result.summary.curation_hold_path_count = holdPaths.length;
  }
  const summary = {
    ok: false,
    version: "orangebox-release-path-lists/v1",
    project: "ORANGEBOX",
    product_surface: "AE See-Suite / AE Operations",
    created_at: new Date().toISOString(),
    read_only_plan: true,
    stages_files: false,
    commits_files: false,
    deletes_files: false,
    package: {
      zip_path: result?.package?.zip_path || null,
      zip_sha256: result?.package?.zip_sha256 || null,
      hash_ok: result?.package?.hash_ok ?? null,
    },
    boards: {
      standard_final_board: result?.boards?.latest_standard?.receipt_path || null,
      clean_final_board: result?.boards?.latest_clean_required?.receipt_path || null,
      clean_board_git_only: result?.summary?.clean_board_git_only === true,
    },
    counts: {
      dirty: result?.summary?.dirty_count || 0,
      stage_paths: stagePaths.length,
      hold_paths: holdPaths.length,
    },
    files,
    release_packet: result?.release_packet || null,
    blockers: result?.blockers || [],
    warnings: result?.warnings || [],
    rollback: {
      repo_mutation: "none",
      recovery_action: "Discard these path-list receipts and rerun `obx finish path-lists --receipt` if the stage/hold split is stale.",
    },
    next_action: "Review the stage and hold path lists, then approve or revise the release staging decision.",
  };
  summary.ok = stagePaths.length > 0 && result?.summary?.package_ready === true && result?.summary?.standard_board_ok === true;
  await fs.writeFile(files.stage_paths, `${stagePaths.join("\n")}\n`, "utf8");
  await fs.writeFile(files.hold_paths, `${holdPaths.join("\n")}\n`, "utf8");
  await fs.writeFile(files.guide, renderOperatorStagingGuide(result, files), "utf8");
  await fs.writeFile(files.summary_json, JSON.stringify(summary, null, 2), "utf8");
  return summary;
}

export async function writeReleasePacket({ stamp = stampForFile() } = {}) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const paths = plannedReleasePacketPaths(stamp);
  const listFiles = {
    closeout_receipt: paths.closeout_receipt,
    decision_card: paths.decision_card,
    stage_paths: paths.stage_paths,
    hold_paths: paths.hold_paths,
    guide: paths.guide,
    summary_json: paths.summary_json,
  };
  const result = await runReleaseCloseoutPlan({
    writeReceipt: false,
    plannedCloseoutReceiptPath: paths.closeout_receipt,
    plannedDecisionCardPath: paths.decision_card,
  });
  result.release_packet = {
    version: "orangebox-release-packet/v1",
    stamp,
    files: listFiles,
    read_only_plan: true,
    stages_files: false,
    commits_files: false,
    deletes_files: false,
  };
  result.receipt_path = paths.closeout_receipt;
  const lists = await writeReleasePathLists(result, { stamp, files: listFiles, includeSelf: true });
  const cardPath = await writeReleaseDecisionCard(result, paths.decision_card);
  const closeoutReceiptPath = await writeCloseoutReceipt(result, paths.closeout_receipt);
  return {
    ok: lists.ok === true && result?.summary?.package_ready === true && result?.summary?.standard_board_ok === true,
    version: "orangebox-release-packet/v1",
    project: "ORANGEBOX",
    product_surface: "AE See-Suite / AE Operations",
    created_at: new Date().toISOString(),
    stamp,
    read_only_plan: true,
    stages_files: false,
    commits_files: false,
    deletes_files: false,
    package: {
      zip_path: result?.package?.zip_path || null,
      zip_sha256: result?.package?.zip_sha256 || null,
      hash_ok: result?.package?.hash_ok ?? null,
    },
    boards: {
      standard_final_board: result?.boards?.latest_standard?.receipt_path || null,
      clean_final_board: result?.boards?.latest_clean_required?.receipt_path || null,
      clean_board_git_only: result?.summary?.clean_board_git_only === true,
    },
    counts: {
      dirty: result?.summary?.dirty_count || 0,
      stage_paths: result?.summary?.curation_stage_path_count || 0,
      hold_paths: result?.summary?.curation_hold_path_count || 0,
    },
    files: {
      closeout_receipt: closeoutReceiptPath,
      decision_card: cardPath,
      stage_paths: paths.stage_paths,
      hold_paths: paths.hold_paths,
      guide: paths.guide,
      summary_json: paths.summary_json,
    },
    blockers: result?.blockers || [],
    warnings: result?.warnings || [],
    rollback: {
      repo_mutation: "none",
      recovery_action: "Discard this packet's receipt artifacts and rerun `obx finish release-packet --receipt` if the stage/hold split is stale.",
    },
    next_action: "Review the packet guide, then approve, revise, or reject the release staging split.",
  };
}

export async function runReleaseCloseoutPlan({ writeReceipt = false, plannedCloseoutReceiptPath = null, plannedDecisionCardPath = null } = {}) {
  const plannedReceiptPath = writeReceipt
    ? (plannedCloseoutReceiptPath || path.join(RECEIPTS_DIR, `orangebox-release-closeout-${stampForFile()}.json`))
    : null;
  const [git, boards, pack] = await Promise.all([
    gitStatusEntries(),
    loadFinalBoards(),
    packageSummary(),
  ]);
  const groups = buildGroups(git.entries);
  const evidenceCloseoutPath = plannedCloseoutReceiptPath || plannedReceiptPath;
  const evidenceManifest = await canonicalEvidence({ boards, pack, plannedCloseoutReceiptPath: evidenceCloseoutPath, plannedDecisionCardPath });
  const latestPathLists = await latestReleasePathLists(pack);
  const curationPlan = buildCurationPlan({ git, groups, evidenceManifest });
  const interpretation = releaseInterpretation({ git, boards, pack, groups });

  const result = {
    ok: interpretation.can_promote_now,
    version: RELEASE_CLOSEOUT_VERSION,
    project: "ORANGEBOX",
    product_surface: "AE See-Suite / AE Operations",
    created_at: new Date().toISOString(),
    read_only: true,
    mutates_repo: false,
    stages_files: false,
    commits_files: false,
    summary: {
      dirty_count: git.entries.length,
      modified_count: git.entries.filter((entry) => entry.is_modified).length,
      untracked_count: git.entries.filter((entry) => entry.is_untracked).length,
      deleted_count: git.entries.filter((entry) => entry.is_deleted).length,
      review_groups: groups.length,
      package_ready: pack.ok === true,
      standard_board_ok: boards.latest_standard?.ok === true,
      clean_board_ok: boards.latest_clean_required?.ok === true,
      clean_board_git_only: interpretation.clean_board_git_only,
      can_promote_now: interpretation.can_promote_now,
      evidence_ready: evidenceManifest.ready === true,
      evidence_present_count: evidenceManifest.present_count,
      evidence_item_count: evidenceManifest.item_count,
      curation_stage_path_count: curationPlan.exact_stage_path_count,
      curation_hold_path_count: curationPlan.exact_hold_or_archive_path_count,
    },
    package: pack,
    boards,
    evidence_manifest: evidenceManifest,
    latest_path_lists: latestPathLists,
    curation_plan: curationPlan,
    git: {
      ok: git.ok,
      error: git.error,
      status_count: git.entries.length,
      status_sample: git.lines.slice(0, 80),
    },
    groups,
    blockers: interpretation.blockers,
    warnings: interpretation.warnings,
    approvals_required: [
      "Approve which dirty groups belong in the release-candidate commit.",
      "Approve archive/removal decisions for generated backups, duplicate proof, or local-only memory state.",
      "Approve any process cleanup, package promotion, or production deploy separately.",
    ],
    recommended_stage_groups: RECOMMENDED_STAGE_GROUPS,
    hold_or_archive_groups: HOLD_OR_ARCHIVE_GROUPS,
    proof_commands: [
      "node --check scripts/v4/release-closeout.mjs",
      "node --check scripts/obx.mjs",
      "node --check scripts/v4/v4-server-routes.mjs",
      "npm run check",
      "node scripts/obx.mjs finish green-board --full --receipt",
      "node scripts/obx.mjs finish green-board --full --require-clean --receipt",
    ],
    rollback: {
      read_only: true,
      repo_mutation: "none",
      package_manifest: pack.manifest_path || SHIP_MANIFEST,
      recovery_action: "If the closeout plan is wrong, discard only its receipt and rerun after inspecting git status.",
    },
    next_action: interpretation.can_promote_now
      ? "Promotion can proceed after operator approval of package publication."
      : "Review the dirty groups, approve a staging/cleanup decision, then rerun the clean final board.",
    receipt_path: plannedReceiptPath,
  };

  if (writeReceipt) await writeCloseoutReceipt(result, plannedReceiptPath);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const writeReceipt = process.argv.includes("--receipt");
  const json = process.argv.includes("--json");
  runReleaseCloseoutPlan({ writeReceipt }).then((result) => {
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`${result.ok ? "ok" : "blocked"} ${RELEASE_CLOSEOUT_VERSION}`);
      console.log(`dirty: ${result.summary.dirty_count}`);
      console.log(`package: ${result.package.ok ? "verified" : "needs review"}`);
      console.log(`standard board: ${result.summary.standard_board_ok ? "green" : "not green"}`);
      console.log(`clean board: ${result.summary.clean_board_ok ? "green" : result.summary.clean_board_git_only ? "git-only blocker" : "needs review"}`);
      if (result.receipt_path) console.log(`receipt: ${result.receipt_path}`);
    }
    process.exit(0);
  }).catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
