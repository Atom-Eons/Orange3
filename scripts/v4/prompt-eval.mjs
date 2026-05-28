#!/usr/bin/env node
/* prompt-eval.mjs - local regression gate for Silent Canvas prompt assets.
 *
 * This does not call models. It makes prompt drift visible by validating the
 * versioned prompt files, success few-shots, and failure repair examples
 * against the live HSMP schema.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadSilentCanvasPrompts, promptEvidence } from "./prompt-registry.mjs";
import { HSMP_SCHEMA_VERSION, validateHSMP } from "./hsmp-schema.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const FEWSHOT_ROOT = path.join(ROOT, "prompts", "silent-canvas", "fewshots");

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

async function readJsonl(file) {
  const text = await fs.readFile(file, "utf8");
  return text.split(/\r?\n/)
    .map((line, index) => ({ line, index: index + 1 }))
    .filter(({ line }) => line.trim())
    .map(({ line, index }) => {
      try {
        return { ok: true, index, value: JSON.parse(line) };
      } catch (error) {
        return { ok: false, index, error: error.message, raw: line.slice(0, 240) };
      }
    });
}

function versionsMatch(row, prompts) {
  const versions = row.prompt_versions || {};
  return versions.creative === prompts.creative.version
    && versions.interpreter === prompts.interpreter.version;
}

function repairWrapper(row) {
  const mutation = row.corrected_mutation || {};
  return {
    schema_version: HSMP_SCHEMA_VERSION,
    objective: `Repair ${row.case_id || "failure case"} into a safe HSMP mutation.`,
    milestones: [
      {
        id: mutation.milestone_id || "ms-1",
        text: "Apply failure repair rule",
        state: "planned",
      },
    ],
    state_mutations: [mutation],
    summary_template: row.repair_rule || "Failure repair applied.",
    summary_checklist: ["Failure has a schema-valid corrected mutation"],
  };
}

export async function runPromptEval({ writeReceipt = false } = {}) {
  const prompts = await loadSilentCanvasPrompts();
  const successPath = path.join(FEWSHOT_ROOT, "hsmp-success.jsonl");
  const failurePath = path.join(FEWSHOT_ROOT, "hsmp-failures.jsonl");
  const successRows = await readJsonl(successPath);
  const failureRows = await readJsonl(failurePath);
  const failures = [];

  const success = successRows.map((row) => {
    if (!row.ok) {
      failures.push({ file: successPath, line: row.index, reason: "json-parse", error: row.error });
      return { line: row.index, ok: false };
    }
    const caseId = row.value.case_id || `success-${row.index}`;
    const versionOk = versionsMatch(row.value, prompts);
    const validation = validateHSMP(row.value.hsmp);
    if (!versionOk) failures.push({ file: successPath, line: row.index, case_id: caseId, reason: "prompt-version-mismatch", prompt_versions: row.value.prompt_versions });
    if (!validation.valid) failures.push({ file: successPath, line: row.index, case_id: caseId, reason: "hsmp-invalid", errors: validation.errors });
    return { line: row.index, case_id: caseId, ok: versionOk && validation.valid, validation_errors: validation.errors };
  });

  const repairs = failureRows.map((row) => {
    if (!row.ok) {
      failures.push({ file: failurePath, line: row.index, reason: "json-parse", error: row.error });
      return { line: row.index, ok: false };
    }
    const caseId = row.value.case_id || `failure-${row.index}`;
    const versionOk = versionsMatch(row.value, prompts);
    const repairRuleOk = typeof row.value.repair_rule === "string" && row.value.repair_rule.trim().length >= 12;
    const validation = validateHSMP(repairWrapper(row.value));
    if (!versionOk) failures.push({ file: failurePath, line: row.index, case_id: caseId, reason: "prompt-version-mismatch", prompt_versions: row.value.prompt_versions });
    if (!repairRuleOk) failures.push({ file: failurePath, line: row.index, case_id: caseId, reason: "missing-repair-rule" });
    if (!validation.valid) failures.push({ file: failurePath, line: row.index, case_id: caseId, reason: "repair-mut-invalid", errors: validation.errors });
    return { line: row.index, case_id: caseId, ok: versionOk && repairRuleOk && validation.valid, validation_errors: validation.errors };
  });

  const result = {
    ok: failures.length === 0,
    gate: "silent-canvas-prompt-eval",
    hsmp_schema_version: HSMP_SCHEMA_VERSION,
    prompts: promptEvidence(prompts),
    fewshots: {
      success_path: successPath,
      failure_path: failurePath,
      success_cases: success.length,
      failure_cases: repairs.length,
      valid_success_cases: success.filter((x) => x.ok).length,
      valid_failure_repairs: repairs.filter((x) => x.ok).length,
    },
    failures,
  };

  if (writeReceipt) {
    const receiptDir = path.join(ROOT, "receipts");
    await fs.mkdir(receiptDir, { recursive: true });
    const stamp = stampForFile();
    const receiptPath = path.join(receiptDir, `orangebox-silent-canvas-prompt-eval-${stamp}.json`);
    await fs.writeFile(receiptPath, JSON.stringify({
      receipt_id: `orangebox-silent-canvas-prompt-eval-${stamp}`,
      project: "ORANGEBOX",
      scope: "Silent Canvas prompt regression gate",
      timestamp: new Date().toISOString(),
      summary: result.ok
        ? "Prompt assets and few-shot corpus passed the local HSMP regression gate."
        : "Prompt assets or few-shot corpus failed the local HSMP regression gate.",
      result,
    }, null, 2));
    result.receipt_path = receiptPath;
  }

  return result;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const flags = new Set(process.argv.slice(2));
  const result = await runPromptEval({ writeReceipt: flags.has("--receipt") });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
