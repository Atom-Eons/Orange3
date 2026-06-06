#!/usr/bin/env node
/*
  action-classifier-doctor.mjs

  Proves the Orangebox command/action gate can distinguish safe diagnostics
  from review bypasses, credential hunts, exfiltration patterns, and state
  changes before a tool or rail executes them.
*/

import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ACTION_CLASSIFIER_FIXTURES, classifyShellAction } from "./action-classifier.mjs";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const outRoot = path.join(dataRoot, "action-classifier");
const receiptDir = path.join(repoRoot, "receipts");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function evaluateFixture(fixture) {
  const actual = classifyShellAction(fixture.command, {
    cwd: repoRoot,
    autonomy: "autonomous_coding_with_decision_gates",
    approvedWorkspacePrefixes: [
      repoRoot,
      "C:/AtomEons/orangebox/finals/Orangebox Delta Final",
      "C:/Users/a/OrangeBox-Data/workspaces",
    ],
  });
  const expected = fixture.expect || {};
  const failures = [];
  for (const [key, value] of Object.entries(expected)) {
    if (actual[key] !== value) failures.push(`${key} expected ${value} got ${actual[key]}`);
  }
  return {
    name: fixture.name,
    ok: failures.length === 0,
    command: fixture.command,
    expected,
    actual,
    failures,
  };
}

async function main() {
  const cases = ACTION_CLASSIFIER_FIXTURES.map(evaluateFixture);
  const blocked = cases.filter((item) => item.actual.blocked).length;
  const staged = cases.filter((item) => item.actual.disposition === "stage_for_confirmation").length;
  const allowed = cases.filter((item) => item.actual.disposition === "allow").length;
  const failed = cases.filter((item) => !item.ok);
  const result = {
    ok: failed.length === 0,
    version: "orangebox-action-classifier-doctor/v1",
    status: failed.length === 0 ? "ORANGEBOX_ACTION_CLASSIFIER_GREEN" : "ORANGEBOX_ACTION_CLASSIFIER_NOT_GREEN",
    checked_at: new Date().toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Classify before execution. Safe diagnostics pass; state changes stage; credential hunts, exfiltration, and review bypasses block.",
    source_of_truth: path.join(repoRoot, "scripts", "v4", "action-classifier.mjs"),
    cases_run: cases.length,
    allowed_count: allowed,
    staged_count: staged,
    blocked_count: blocked,
    failures: failed,
    cases,
    command_server_contract: {
      imported_classifier: path.join(repoRoot, "scripts", "orangebox-command-server.mjs"),
      compatibility_fields: ["class", "requiresApproval", "approved", "projectScoped", "matched", "normalizedPreview"],
    },
  };

  const latestPath = path.join(outRoot, "latest-action-classifier-doctor.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-action-classifier-${stamp()}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();

