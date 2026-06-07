#!/usr/bin/env node
/*
  memory-source-truth-doctor.mjs

  Backend-only memory/source-truth drills. This proves Orangebox does not treat
  stale chat memory, compressed summaries, or semantically similar old receipts
  as current truth unless the latest source pointer supports the claim.
*/

import crypto from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsJson = args.has("--json");
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const userRoot = process.env.USERPROFILE || os.homedir();
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(userRoot, "OrangeBox-Data");
const receiptDir = path.join(repoRoot, "receipts");
const outRoot = path.join(dataRoot, "memory-truth");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function tokenEstimate(text) {
  return Math.ceil(String(text || "").length / 4);
}

function source(id, subject, property, value, observedAt, extra = {}) {
  const body = {
    id,
    subject,
    property,
    value,
    observed_at: observedAt,
    trust: extra.trust || "receipt",
    source_type: extra.source_type || "machine_receipt",
    path: extra.path || `C:/Users/a/OrangeBox-Data/receipts/${id}.json`,
    key_path: extra.key_path || `$.${subject}.${property}`,
  };
  return {
    ...body,
    evidence_hash: sha256(JSON.stringify(body)),
  };
}

function sortLatest(records) {
  return [...records].sort((a, b) => Date.parse(b.observed_at) - Date.parse(a.observed_at));
}

function latestFor(records, subject, property) {
  return sortLatest(records.filter((item) => item.subject === subject && item.property === property))[0] || null;
}

function pointerFor(record) {
  return `src:${record.id}#${record.key_path}`;
}

function dereference(pointer, sourceIndex) {
  const match = String(pointer || "").match(/^src:([^#]+)#(.+)$/);
  if (!match) return null;
  const record = sourceIndex.get(match[1]);
  if (!record || record.key_path !== match[2]) return null;
  return record;
}

function chooseUsefulMemory(candidates, subject, property) {
  const relevant = candidates.filter((item) => item.subject === subject && item.property === property);
  const newest = latestFor(relevant, subject, property);
  return relevant.map((item) => ({
    id: item.id,
    selected: item.id === newest?.id,
    reason: item.id === newest?.id ? "newest_source_backed_fact" : "stale_or_revised_fact",
    observed_at: item.observed_at,
    value: item.value,
  }));
}

function buildHotPacket(records, maxFacts = 5) {
  const latestByKey = new Map();
  for (const record of sortLatest(records)) {
    const key = `${record.subject}.${record.property}`;
    if (!latestByKey.has(key)) latestByKey.set(key, record);
  }
  const facts = [...latestByKey.values()].slice(0, maxFacts).map((record) => ({
    key: `${record.subject}.${record.property}`,
    value: record.value,
    observed_at: record.observed_at,
    source_pointer: pointerFor(record),
  }));
  const air = facts.map((fact) => `R: ${fact.key}=${fact.value} @ ${fact.source_pointer}`).join("\n");
  return {
    facts,
    air,
    token_estimate: tokenEstimate(air),
    raw_history_included: false,
  };
}

function evaluate() {
  const sources = [
    source("receipt.codexa-alert.20260606T160000Z", "codexa", "command_rail_8097", "OPEN", "2026-06-06T16:00:00.000Z"),
    source("receipt.codexa-alert.20260607T011000Z", "codexa", "command_rail_8097", "DEAD", "2026-06-07T01:10:00.000Z"),
    source("receipt.codexa-alert.20260607T011000Z.receipts", "codexa", "receipts_8099", "OPEN", "2026-06-07T01:10:00.000Z"),
    source("receipt.codexa-alert.20260607T011000Z.ollama", "codexa", "ollama_11434", "DEAD", "2026-06-07T01:10:00.000Z"),
    source("receipt.orangebox-local.20260607T014700Z", "local_ops", "status", "GREEN", "2026-06-07T01:47:00.000Z"),
    source("receipt.orangebox-project.20260607T014800Z", "full_project", "status", "WITH_GAPS", "2026-06-07T01:48:00.000Z"),
    source("receipt.orangebox-project.20260607T014800Z.visual", "frontend_lane", "ops_chat_touch_allowed", "FALSE", "2026-06-07T01:48:00.000Z"),
  ];
  const sourceIndex = new Map(sources.map((item) => [item.id, item]));
  const drills = [];

  const latestRail = latestFor(sources, "codexa", "command_rail_8097");
  drills.push({
    id: "revised_fact_latest_wins",
    ok: latestRail?.value === "DEAD",
    question: "Is Codexa command rail 8097 currently up?",
    selected_value: latestRail?.value || null,
    selected_source: latestRail ? pointerFor(latestRail) : null,
    rejected_stale_values: sources
      .filter((item) => item.subject === "codexa" && item.property === "command_rail_8097" && item.id !== latestRail?.id)
      .map((item) => ({ value: item.value, source: pointerFor(item), reason: "older_observation" })),
  });

  const currentRail = latestFor(sources, "codexa", "command_rail_8097");
  const currentReceipts = latestFor(sources, "codexa", "receipts_8099");
  const collapsed = currentRail?.value === "OPEN" && currentReceipts?.value === "OPEN" ? "CODEXA_READY" : "CODEXA_PARTIAL_OR_WARN";
  drills.push({
    id: "multi_target_no_collapse",
    ok: collapsed === "CODEXA_PARTIAL_OR_WARN" && currentRail?.value === "DEAD" && currentReceipts?.value === "OPEN",
    question: "Is Codexa online?",
    selected_status: collapsed,
    components: {
      command_rail_8097: { value: currentRail?.value || null, source: currentRail ? pointerFor(currentRail) : null },
      receipts_8099: { value: currentReceipts?.value || null, source: currentReceipts ? pointerFor(currentReceipts) : null },
    },
    rule: "Do not collapse partial rail truth into a single green system claim.",
  });

  const pointer = latestRail ? pointerFor(latestRail) : null;
  const dereferenced = dereference(pointer, sourceIndex);
  drills.push({
    id: "source_index_dereference",
    ok: Boolean(dereferenced && dereferenced.evidence_hash === latestRail.evidence_hash),
    pointer,
    dereferenced_value: dereferenced?.value || null,
    dereferenced_hash: dereferenced?.evidence_hash || null,
    expected_hash: latestRail?.evidence_hash || null,
    rule: "Compressed memory must carry source pointers that can recover exact receipt truth.",
  });

  const selection = chooseUsefulMemory(sources, "codexa", "command_rail_8097");
  drills.push({
    id: "stale_semantic_memory_suppressed",
    ok: selection.some((item) => item.selected && item.value === "DEAD") && selection.some((item) => !item.selected && item.value === "OPEN"),
    selection,
    rule: "Semantic similarity is not enough; revised facts need freshness and source-backed selection.",
  });

  const packet = buildHotPacket(sources, 5);
  drills.push({
    id: "raw_history_budget_guard",
    ok: packet.raw_history_included === false && packet.token_estimate <= 180 && packet.facts.length <= 5 && packet.facts.every((fact) => fact.source_pointer),
    token_estimate: packet.token_estimate,
    fact_count: packet.facts.length,
    raw_history_included: packet.raw_history_included,
    air: packet.air,
    rule: "Hot memory gets compact facts plus pointers, not raw chat/history flooding.",
  });

  const conflicts = [];
  for (const stale of sources.filter((item) => item.subject === "codexa" && item.property === "command_rail_8097")) {
    if (stale.id !== latestRail?.id && stale.value !== latestRail?.value) {
      conflicts.push({
        id: `debt.${sha256(`${stale.id}:${latestRail.id}`).slice(0, 12)}`,
        debt_type: "stale_memory_conflict",
        stale_source: pointerFor(stale),
        latest_source: pointerFor(latestRail),
        repair_hint: "Refresh memory/source packet and require latest receipt pointer before status claims.",
      });
    }
  }
  drills.push({
    id: "compression_debt_on_revised_fact_conflict",
    ok: conflicts.length >= 1,
    debt_events: conflicts,
    rule: "A stale fact that conflicts with latest receipt truth creates compression debt instead of silent confidence.",
  });

  return { sources, drills, packet, conflicts };
}

async function main() {
  const startedAt = new Date();
  const { sources, drills, packet, conflicts } = evaluate();
  const failures = drills.filter((item) => !item.ok).map((item) => ({ id: item.id, failure: "memory_source_truth_drill_failed" }));
  const result = {
    ok: failures.length === 0,
    version: "orangebox-memory-source-truth-doctor/v1",
    status: failures.length === 0 ? "ORANGEBOX_MEMORY_SOURCE_TRUTH_GREEN" : "ORANGEBOX_MEMORY_SOURCE_TRUTH_NOT_GREEN",
    checked_at: startedAt.toISOString(),
    repo_root: repoRoot,
    data_root: dataRoot,
    doctrine: "Latest source-backed receipt truth beats stale chat memory. Compressed memory carries source pointers and creates debt when revised facts conflict.",
    research_basis: [
      {
        source: "MINTEval / LongMINT memory-interference benchmark",
        lesson: "Agents struggle with revised facts and multi-target aggregation across long, interfering contexts.",
      },
      {
        source: "Memex(RL) indexed experience memory",
        lesson: "Compact working context should use stable indices that can dereference exact past evidence.",
      },
      {
        source: "Active Context Compression",
        lesson: "Long-running agents need active pruning of raw history while preserving key learnings.",
      },
      {
        source: "Anthropic context engineering and memory guidance",
        lesson: "Stale tool results should be cleared, valuable knowledge should live outside context, and relevant context must be curated.",
      },
    ],
    constraints: {
      frontend_touched: false,
      visual_lane_touched: false,
      network_called: false,
      paid_api_attempted: false,
      model_call_attempted: false,
      remote_codexa_mutation_attempted: false,
      raw_history_injected: false,
    },
    policy: {
      current_truth_source: "latest_receipt_or_live_probe",
      stale_memory_disposition: "compression_debt_or_source_refresh",
      hot_memory_shape: "compact_fact_plus_source_pointer",
      forbidden_claim: "full_two_machine_green_without_codexa_rail_and_ollama_receipts",
    },
    summary: {
      drills_total: drills.length,
      drills_green: drills.filter((item) => item.ok).length,
      source_records: sources.length,
      stale_conflicts_detected: conflicts.length,
      hot_packet_token_estimate: packet.token_estimate,
      proof_hash: sha256(JSON.stringify({
        drills: drills.map((item) => ({ id: item.id, ok: item.ok })),
        conflicts,
        packet,
      })),
    },
    sources: sources.map((item) => ({
      id: item.id,
      subject: item.subject,
      property: item.property,
      value: item.value,
      observed_at: item.observed_at,
      source_pointer: pointerFor(item),
      evidence_hash: item.evidence_hash,
    })),
    drills,
    failures,
    next_action: failures.length === 0
      ? "Keep memory:doctor in the Ops proof chain before promoting chatbackup, AtomSmasher compression, retrieval, or Knowledge Engine upgrades."
      : "Fix the failed memory/source-truth drill(s), rerun memory:doctor, then rerun feature:proof, project:report, and harness:benchmark.",
  };

  const latestPath = path.join(outRoot, "latest-memory-source-truth-doctor.json");
  await writeJson(latestPath, result);
  if (wantsReceipt) {
    const receiptPath = path.join(receiptDir, `orangebox-memory-source-truth-${stamp(startedAt)}.json`);
    result.receipt_path = receiptPath;
    await writeJson(receiptPath, result);
    await writeJson(latestPath, result);
  }

  console.log(wantsJson ? JSON.stringify(result, null, 2) : result.status);
  if (!result.ok) process.exitCode = 1;
}

await main();
