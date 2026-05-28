#!/usr/bin/env node
/* glyphspeak-doctor.mjs - deterministic bridge packet proof.
 *
 * GlyphSpeak is treated here as a compact inter-model packet discipline, not
 * a production model-native language. The doctor consumes temporal-sync
 * current_state.json and emits a typed packet that future model lanes can read
 * without raw transcript history.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GLYPHSPEAK_DOCTOR_VERSION = "orangebox-glyphspeak-doctor/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const TEMPORAL_ROOT = path.join(DATA_ROOT, "temporal-sync");
const GLYPH_ROOT = path.join(DATA_ROOT, "glyphspeak");
const TEMPORAL_STATE_PATH = path.join(TEMPORAL_ROOT, "current_state.json");

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function canonicalStringify(value) {
  return JSON.stringify(stable(value));
}

function estimateTokens(value) {
  return Math.max(1, Math.ceil(String(value || "").length / 4));
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return file;
}

async function readJson(file) {
  try {
    return { ok: true, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, data: null, error: error?.message || String(error) };
  }
}

function buildPacket(state) {
  const temporal = state.orangebox_temporal_sync || {};
  const stateHash = sha256(canonicalStringify(state));
  const packet = {
    glyphspeak_version: "0.1-deterministic-bridge",
    status: "DRAFT_PACKET_PROTOCOL_NOT_MODEL_NATIVE",
    source: {
      current_state_path: TEMPORAL_STATE_PATH,
      current_state_sha256: stateHash,
      temporal_sync_version: temporal.version || null,
    },
    lexicon: [
      { token: "T_DELTA", type: "temporal", meaning: "state displacement horizon and recency contract" },
      { token: "FOLD", type: "compression", meaning: "replace raw historical tail with typed current state" },
      { token: "VOID", type: "boundary", meaning: "negative-space constraints that must survive handoff" },
      { token: "TREE_STOP", type: "control", meaning: "halt repeated identical failure branches" },
      { token: "ESCALATE", type: "routing", meaning: "wake larger command model only when intervention flag is true" },
    ],
    frames: [
      {
        token: "T_DELTA",
        payload: {
          state_drift_horizon_ms: temporal.state_drift_horizon_ms ?? null,
          latency_drift_factor: temporal.latency_drift_factor_from_sop || null,
          hierarchy_factor: temporal.command_execution_hierarchy_factor_from_sop || null,
        },
      },
      {
        token: "FOLD",
        payload: {
          raw_tail_sha256: temporal.raw_execution_tail_sha256 || null,
          raw_tail_receipts: temporal.raw_execution_tail_receipts || 0,
          token_fold: temporal.token_fold || null,
        },
      },
      {
        token: "VOID",
        payload: {
          clc_status: temporal.clc_status || "UNKNOWN",
          no_raw_history_to_cloud: temporal.cloud_payload_rule || null,
          no_visual_mutation: true,
          no_paid_api_calls: true,
        },
      },
      {
        token: "TREE_STOP",
        payload: temporal.tree_non_repetition || null,
      },
      {
        token: "ESCALATE",
        payload: {
          requiresCommandIntervention: state.requiresCommandIntervention === true,
          interventionReason: state.interventionReason || null,
        },
      },
    ],
    decoded_contract: {
      recipient_instruction: "Use the frames as current operating state. Do not infer old transcript history from missing content.",
      allowed_use: "inter-model handoff, route summary, escalation packet, memory injection seed",
      forbidden_use: "claim model-native GlyphSpeak, claim CLC production readiness, replace deterministic validators",
    },
  };
  packet.integrity = {
    deterministic_key_ordering: true,
    sha256: sha256(canonicalStringify(packet)),
  };
  return packet;
}

async function runGlyphSpeakDoctor({ receipt = false } = {}) {
  const startedAt = new Date().toISOString();
  const stateRead = await readJson(TEMPORAL_STATE_PATH);
  const blockers = [];
  if (!stateRead.ok) blockers.push({ severity: "hard", id: "temporal_state_missing", detail: stateRead.error || "Run npm.cmd run temporal:doctor first." });

  const state = stateRead.ok ? stateRead.data : {};
  const packet = buildPacket(state);
  const packetTokens = estimateTokens(canonicalStringify(packet));
  const stateTokens = estimateTokens(canonicalStringify(state));
  const gates = [
    { id: "temporal_state_available", ok: stateRead.ok },
    { id: "packet_has_lexicon", ok: packet.lexicon.length >= 5 },
    { id: "packet_has_frames", ok: packet.frames.length >= 5 },
    { id: "packet_integrity_hash", ok: /^[a-f0-9]{64}$/.test(packet.integrity.sha256) },
    { id: "not_model_native_overclaim", ok: packet.status === "DRAFT_PACKET_PROTOCOL_NOT_MODEL_NATIVE" },
    { id: "carries_clc_boundary", ok: packet.frames.some((frame) => frame.token === "VOID" && String(frame.payload?.clc_status || "").endsWith("NOT_PRODUCTION")) },
  ];

  const report = {
    ok: gates.every((gate) => gate.ok) && !blockers.some((item) => item.severity === "hard"),
    version: GLYPHSPEAK_DOCTOR_VERSION,
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    boundaries: {
      no_llm_calls: true,
      no_paid_api_calls: true,
      no_credentials_read: true,
      no_visual_mutation: true,
    },
    gates,
    blockers,
    metrics: {
      source_state_tokens_estimated: stateTokens,
      glyph_packet_tokens_estimated: packetTokens,
      packet_to_state_ratio: Number((packetTokens / Math.max(1, stateTokens)).toFixed(4)),
      note: "Smaller is useful, but this is not an optimization claim until benchmarked across real multi-model handoffs.",
    },
    packet,
    outputs: {
      glyph_root: GLYPH_ROOT,
      latest_packet_path: path.join(GLYPH_ROOT, "latest-glyph-packet.json"),
      latest_report_path: path.join(GLYPH_ROOT, "latest-glyphspeak-doctor.json"),
    },
    rollback: {
      repo_mutation: "glyphspeak doctor/package/docs only",
      data_mutation: GLYPH_ROOT,
      recovery_action: `Delete ${GLYPH_ROOT} and any orangebox-glyphspeak-doctor receipt if this protocol is superseded.`,
    },
    receipt_path: null,
  };

  await fs.mkdir(GLYPH_ROOT, { recursive: true });
  await writeJson(path.join(GLYPH_ROOT, `glyph-packet-${stamp()}.json`), packet);
  await writeJson(path.join(GLYPH_ROOT, "latest-glyph-packet.json"), packet);
  await writeJson(path.join(GLYPH_ROOT, "latest-glyphspeak-doctor.json"), report);
  if (receipt) {
    await fs.mkdir(RECEIPTS_DIR, { recursive: true });
    const receiptPath = path.join(RECEIPTS_DIR, `orangebox-glyphspeak-doctor-${stamp()}.json`);
    report.receipt_path = receiptPath;
    await writeJson(receiptPath, report);
  }
  return report;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const result = await runGlyphSpeakDoctor({ receipt: args.has("--receipt") });
  if (args.has("--json")) {
    console.log(JSON.stringify({
      ok: result.ok,
      version: result.version,
      gates: result.gates,
      metrics: result.metrics,
      packet_sha256: result.packet.integrity.sha256,
      latest_packet_path: result.outputs.latest_packet_path,
      receipt_path: result.receipt_path || null,
    }, null, 2));
  } else {
    console.log(`[glyphspeak:doctor] ok=${result.ok} packet_sha256=${result.packet.integrity.sha256}`);
    if (result.receipt_path) console.log(`[glyphspeak:doctor] receipt=${result.receipt_path}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  });
}

export { runGlyphSpeakDoctor };
