#!/usr/bin/env node
/* alpha-source-doctor.mjs - no-network Alpha source wiring proof.
 *
 * This doctor verifies that the current manually verified Alpha source notes are
 * present and wired into the non-visual ORANGEBOX docs. It intentionally makes
 * no web, model, credential, or MCP calls.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ALPHA_SOURCE_DOCTOR_VERSION = "orangebox-alpha-source-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");

const REQUIRED_FILES = [
  {
    id: "xdk-claude-alpha-note",
    file: "docs/ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
    mustContain: [
      "@xdevplatform/xdk",
      "xdk-typescript",
      "xdk-python",
      "xmcp",
      "llms.txt",
      "Claude Code Alpha Signals",
      "tool result does not match tool use",
      "alpha-xdk-playground-smoke",
    ],
  },
  {
    id: "alpha-bookmark-review-wiring",
    file: "docs/ALPHA_BOOKMARK_REVIEW_2026-05-27.md",
    mustContain: [
      "XDK and Claude Code Reliability Addendum",
      "ALPHA_XDK_CLAUDE_CODE_INTAKE_2026-05-27.md",
    ],
  },
  {
    id: "llm-status-wiring",
    file: "docs/ORANGEBOX_LLM_SYSTEM_STATUS_2026-05-27.md",
    mustContain: [
      "XDK Alpha Lane",
      "alpha:sources",
      "Claude Code Reliability Alpha",
    ],
  },
  {
    id: "process-book-wiring",
    file: "docs/ORANGEBOX_PROCESS_BOOK_2026-05-27.md",
    mustContain: [
      "Chapter 10 - Alpha Source Intake: XDK and Claude Code Reliability",
      "no production X API calls",
    ],
  },
];

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function readText(relativePath) {
  const file = path.join(ROOT, relativePath);
  const text = await fs.readFile(file, "utf8");
  return { file, text, sha256: sha256(text) };
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-alpha-source-doctor-${stampForFile()}.json`);
  await writeJson(file, { ...result, receipt_path: file });
  return file;
}

export async function runAlphaSourceDoctor({ writeReceipt: shouldWriteReceipt = false } = {}) {
  const startedAt = new Date().toISOString();
  const checks = [];

  for (const spec of REQUIRED_FILES) {
    try {
      const { file, text, sha256: digest } = await readText(spec.file);
      const missingTerms = spec.mustContain.filter((term) => !text.includes(term));
      checks.push({
        id: spec.id,
        file,
        state: missingTerms.length === 0 ? "PASS" : "FAIL",
        sha256: digest,
        required_terms: spec.mustContain.length,
        missing_terms: missingTerms,
      });
    } catch (error) {
      checks.push({
        id: spec.id,
        file: path.join(ROOT, spec.file),
        state: "FAIL",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const failures = checks.filter((check) => check.state !== "PASS");
  const result = {
    ok: failures.length === 0,
    version: ALPHA_SOURCE_DOCTOR_VERSION,
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    no_network_calls: true,
    no_model_calls: true,
    no_mcp_calls: true,
    no_credential_reads: true,
    checks,
    summary: {
      total: checks.length,
      passed: checks.length - failures.length,
      failed: failures.length,
    },
    source_boundaries: {
      x_forum_url_status: "operator_supplied_lead; automated fetch not required for this no-network doctor",
      production_x_api_calls: false,
      xdk_installation: false,
      xmcp_registration: false,
      visual_work: false,
    },
    recommendations: [
      "Use the official TypeScript XDK only after a playground-backed smoke and credential policy exist.",
      "Keep XMCP read-only until ORANGEBOX MCP verifier proves health, OAuth scope, output limits, and receipts.",
      "Treat Claude Code reliability improvements as helpful operator ergonomics; preserve ORANGEBOX receipts as the control truth.",
    ],
    rollback: {
      repo_mutation: "docs and this doctor script only",
      data_mutation: shouldWriteReceipt ? "receipt only" : "none",
      recovery_action: "Revert the alpha source doc, doc wiring, package script, and this doctor if the intake is superseded.",
    },
    receipt_path: null,
  };

  if (shouldWriteReceipt) result.receipt_path = await writeReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runAlphaSourceDoctor({ writeReceipt: argv.includes("--receipt") });
  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "PASS" : "FAIL"} alpha source doctor: ${result.summary.passed}/${result.summary.total} passed`);
    if (result.receipt_path) console.log(`receipt: ${result.receipt_path}`);
  }
  if (!result.ok) process.exit(4);
}
