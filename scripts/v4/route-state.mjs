#!/usr/bin/env node
/* route-state.mjs - durable ORANGEBOX Mission Spine state.
 *
 * The Operating Spine creates a route packet. Route State makes the newest
 * accepted packet durable and projects it into the AE See-Suite rail: macro-actions,
 * coordination, proof gates, artifacts, and party-line status.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

import { planOperatingRoute } from "./operating-spine.mjs";

export const ROUTE_STATE_VERSION = "orangebox-route-state/v1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

function defaultDataRoot() {
  return process.env.ORANGEBOX_DATA_ROOT ||
    path.join(os.homedir(), "OrangeBox-Data");
}

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function stateDir(dataRoot = defaultDataRoot()) {
  return path.join(dataRoot, "operating-spine");
}

export function currentRoutePath(dataRoot = defaultDataRoot()) {
  return path.join(stateDir(dataRoot), "current-route.json");
}

function historyPath(dataRoot = defaultDataRoot()) {
  return path.join(stateDir(dataRoot), "route-history.jsonl");
}

export function routeHistoryPath(dataRoot = defaultDataRoot()) {
  return historyPath(dataRoot);
}

function repoReceiptDir() {
  return path.join(ROOT, "receipts");
}

function shortObjective(route) {
  return String(route?.objective || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

function pickNextMacro(macros) {
  return macros.find((action) => action.status === "active")
    || macros.find((action) => action.status === "pending")
    || macros.find((action) => action.status === "ready")
    || macros.find((action) => action.status === "blocked")
    || null;
}

export function projectRouteState(route) {
  const macros = Array.isArray(route?.macro_actions) ? route.macro_actions : [];
  const gates = Array.isArray(route?.proof_gates) ? route.proof_gates : [];
  const next = pickNextMacro(macros);
  const complete = macros.length > 0 && macros.every((action) => ["done", "skipped"].includes(action.status || ""));
  return {
    ok: !!route?.route_id,
    version: ROUTE_STATE_VERSION,
    generated_at: new Date().toISOString(),
    route_id: route?.route_id || null,
    project: route?.project || "orangebox",
    objective: route?.objective || null,
    current_macro: next ? {
      id: next.id,
      label: next.label || next.id,
      owner: next.owner || next.default_owner || "AE0",
      status: next.status || "pending",
      proof: next.proof || "",
    } : complete ? {
      id: "complete",
      label: "Complete",
      owner: "ORANGE",
      status: "done",
      proof: "all Mission Spine macro-actions are done or skipped",
    } : null,
    vision_rail: macros.map((action, index) => ({
      order: action.order || index + 1,
      id: action.id,
      label: action.label || action.id,
      owner: action.owner || action.default_owner || "AE0",
      status: action.status || "pending",
      pulse: action.id === next?.id ? "active" : (action.status === "done" ? "done" : (action.status === "ready" ? "warm" : "dim")),
      proof: action.proof || "",
    })),
    proof_gates: gates.map((gate) => ({
      id: gate.id,
      label: gate.label || gate.id,
      command: gate.command || "",
      required: gate.required !== false,
      status: route?.proof_gate_results?.[gate.id]?.status || "pending",
    })),
    proof_gate_results: route?.proof_gate_results || {},
    coordination: route?.coordination_profile || null,
    clarification: route?.clarification_policy || null,
    model_lane: route?.model_lane?.primary_profile || null,
    artifacts: {
      route_file: route?.route_file || null,
      receipt_path: route?.receipt?.path || null,
      department_route_id: route?.department_route_id || route?.department_route?.route_id || null,
      rollback: route?.rollback_path || null,
    },
    counts: {
      macro_actions: macros.length,
      proof_gates: gates.length,
      specialists: route?.coordination_profile?.specialist_lanes?.length || 0,
      review_lanes: route?.coordination_profile?.review_lanes?.length || 0,
    },
  };
}

export async function loadCurrentRoute({ dataRoot = defaultDataRoot() } = {}) {
  const file = currentRoutePath(dataRoot);
  if (!fsSync.existsSync(file)) {
    return {
      ok: true,
      version: ROUTE_STATE_VERSION,
      current: null,
      projection: null,
      current_route_path: file,
    };
  }
  try {
    const current = JSON.parse(await fs.readFile(file, "utf8"));
    return {
      ok: true,
      version: ROUTE_STATE_VERSION,
      current,
      projection: projectRouteState(current),
      current_route_path: file,
    };
  } catch (err) {
    return {
      ok: false,
      version: ROUTE_STATE_VERSION,
      current: null,
      projection: null,
      current_route_path: file,
      error: err?.message || String(err),
    };
  }
}

async function latestFileInDir(dir, predicate = () => true) {
  if (!fsSync.existsSync(dir)) return null;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await latestFileInDir(file, predicate);
      if (nested) {
        try {
          const stat = await fs.stat(nested);
          files.push({ file: nested, mtime: stat.mtimeMs });
        } catch {}
      }
    } else if (entry.isFile() && predicate(file)) {
      const stat = await fs.stat(file);
      files.push({ file, mtime: stat.mtimeMs });
    }
  }
  files.sort((a, b) => b.mtime - a.mtime);
  return files[0]?.file || null;
}

async function readJsonIf(file) {
  if (!file || !fsSync.existsSync(file)) return null;
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; }
}

export async function loadRouteHistory({ dataRoot = defaultDataRoot(), limit = 25 } = {}) {
  const file = historyPath(dataRoot);
  const current = await loadCurrentRoute({ dataRoot });
  if (!fsSync.existsSync(file)) {
    return {
      ok: true,
      version: ROUTE_STATE_VERSION,
      history_path: file,
      count: 0,
      items: [],
      current_route_id: current.current?.route_id || null,
    };
  }
  const lines = (await fs.readFile(file, "utf8")).split(/\r?\n/).filter(Boolean);
  const byRoute = new Map();
  for (const line of lines) {
    try {
      const item = JSON.parse(line);
      byRoute.set(item.route_id, item);
    } catch {}
  }
  const items = [];
  for (const item of [...byRoute.values()].reverse().slice(0, Math.max(1, Math.min(limit, 200)))) {
    const routeFile = path.join(stateDir(dataRoot), "routes", `${item.route_id}.json`);
    const packageManifest = await latestFileInDir(path.join(stateDir(dataRoot), "packages"), (candidate) =>
      candidate.endsWith("route-package-manifest.json") && candidate.includes(item.route_id)
    );
    const promotionRecord = await latestFileInDir(path.join(stateDir(dataRoot), "promotions"), (candidate) =>
      candidate.endsWith(".json") && candidate.includes(item.route_id)
    );
    let status = item.route_id === current.current?.route_id ? current.projection?.current_macro?.id || "current" : "planned";
    let promotion = null;
    let manifest = null;
    try {
      promotion = promotionRecord ? JSON.parse(await fs.readFile(promotionRecord, "utf8")) : null;
    } catch {}
    try {
      manifest = packageManifest ? JSON.parse(await fs.readFile(packageManifest, "utf8")) : null;
    } catch {}
    if (promotion?.ok) status = "promoted";
    else if (manifest?.ok) status = "packaged";
    items.push({
      ...item,
      status,
      is_current: item.route_id === current.current?.route_id,
      route_file: fsSync.existsSync(routeFile) ? routeFile : null,
      package_manifest: packageManifest,
      promotion_record: promotionRecord,
      package_ok: !!manifest?.ok,
      promotion_ok: !!promotion?.ok,
    });
  }
  return {
    ok: true,
    version: ROUTE_STATE_VERSION,
    history_path: file,
    count: items.length,
    items,
    current_route_id: current.current?.route_id || null,
  };
}

export async function loadRouteDetail({ dataRoot = defaultDataRoot(), routeId = "current" } = {}) {
  const current = await loadCurrentRoute({ dataRoot });
  const targetId = routeId === "current" || !routeId ? current.current?.route_id : String(routeId);
  if (!targetId) {
    return {
      ok: false,
      version: ROUTE_STATE_VERSION,
      error: "route_id is required and no current route exists",
    };
  }

  const history = await loadRouteHistory({ dataRoot, limit: 200 });
  const historyItem = (history.items || []).find((item) => item.route_id === targetId) || null;
  const routeFile = historyItem?.route_file || path.join(stateDir(dataRoot), "routes", `${targetId}.json`);
  const packageManifestPath = historyItem?.package_manifest || await latestFileInDir(path.join(stateDir(dataRoot), "packages"), (candidate) =>
    candidate.endsWith("route-package-manifest.json") && candidate.includes(targetId)
  );
  const promotionRecordPath = historyItem?.promotion_record || await latestFileInDir(path.join(stateDir(dataRoot), "promotions"), (candidate) =>
    candidate.endsWith(".json") && candidate.includes(targetId)
  );

  const routePacket = await readJsonIf(routeFile);
  const route = targetId === current.current?.route_id && current.current ? current.current : routePacket;
  const packageManifest = await readJsonIf(packageManifestPath);
  const promotionRecord = await readJsonIf(promotionRecordPath);
  const closeoutReceiptPath = promotionRecord?.closeout_receipt || packageManifest?.closeout_receipt || null;
  const closeoutReceipt = await readJsonIf(closeoutReceiptPath);
  const routeProjection = route ? projectRouteState(route) : null;
  const browserProofs = Array.isArray(packageManifest?.browser_proofs) ? packageManifest.browser_proofs : [];
  const evidenceFiles = Array.isArray(packageManifest?.files) ? packageManifest.files : [];
  const proofGateFiles = evidenceFiles.filter((file) => String(file.kind || "").startsWith("proof_gate:"));
  const browserScreenshotFiles = evidenceFiles.filter((file) => file.kind === "browser_proof_screenshot");

  return {
    ok: !!route,
    version: ROUTE_STATE_VERSION,
    route_id: targetId,
    status: promotionRecord?.ok ? "promoted" : packageManifest?.ok ? "packaged" : historyItem?.status || (route ? "planned" : "missing"),
    is_current: targetId === current.current?.route_id,
    data_root: dataRoot,
    history_item: historyItem,
    paths: {
      route_file: fsSync.existsSync(routeFile) ? routeFile : null,
      current_route_state: targetId === current.current?.route_id ? current.current_route_path : null,
      package_manifest: packageManifestPath,
      promotion_record: promotionRecordPath,
      closeout_receipt: closeoutReceiptPath,
    },
    route,
    route_packet: routePacket,
    projection: routeProjection,
    package_manifest: packageManifest,
    promotion_record: promotionRecord,
    closeout_receipt: closeoutReceipt,
    artifact_summary: {
      package_ok: !!packageManifest?.ok,
      promotion_ok: !!promotionRecord?.ok,
      rollback_present: !!(packageManifest?.rollback_path || route?.rollback_path),
      browser_proofs: browserProofs.length,
      browser_screenshots: browserScreenshotFiles.length,
      evidence_files: evidenceFiles.length,
      proof_gate_files: proofGateFiles.length,
      failures: [
        ...(packageManifest?.failures || []),
        ...(promotionRecord?.failures || []),
        ...(closeoutReceipt?.failures || []),
      ],
    },
    proof_links: {
      browser: browserProofs,
      browser_screenshots: browserScreenshotFiles.map((file) => ({
        kind: file.kind,
        path: file.path,
        sha256: file.sha256 || null,
        bytes: file.bytes || null,
        modified_at: file.modified_at || null,
      })),
      proof_gates: proofGateFiles.map((file) => ({
        kind: file.kind,
        path: file.path,
        sha256: file.sha256 || null,
      })),
    },
    error: route ? null : `route file not found for ${targetId}`,
  };
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function fileTimestamp(file) {
  if (!file || !fsSync.existsSync(file)) return null;
  try {
    return (await fs.stat(file)).mtime.toISOString();
  } catch {
    return null;
  }
}

function routeMacroMap(route) {
  return new Map((Array.isArray(route?.macro_actions) ? route.macro_actions : []).map((action) => [action.id, action]));
}

function baseMacroStatuses(routePacket, route) {
  const packetMacros = routeMacroMap(routePacket);
  const liveMacros = Array.isArray(route?.macro_actions) ? route.macro_actions : [];
  return liveMacros.map((action, index) => {
    const initial = packetMacros.get(action.id);
    return {
      order: action.order || index + 1,
      id: action.id,
      label: action.label || action.id,
      owner: action.owner || action.default_owner || initial?.owner || initial?.default_owner || "AE0",
      status: initial?.status || "pending",
    };
  });
}

function pushReplayEvent(events, event) {
  const ts = validIso(event.ts);
  if (!ts) return;
  const normalized = {
    event_id: crypto.createHash("sha1").update(JSON.stringify({
      ts,
      type: event.type,
      macro_id: event.macro_id || "",
      title: event.title || "",
      artifact_path: event.artifact_path || "",
    })).digest("hex").slice(0, 16),
    ts,
    type: event.type || "event",
    macro_id: event.macro_id || null,
    title: event.title || event.type || "event",
    actor: event.actor || null,
    status: event.status || null,
    previous_status: event.previous_status || null,
    note: event.note || event.proof_note || "",
    artifact_path: event.artifact_path || null,
    artifact_kind: event.artifact_kind || null,
    duration_ms: Number.isFinite(event.duration_ms) ? event.duration_ms : null,
    source: event.source || "route-state",
  };
  events.push(normalized);
}

function eventSortKey(event) {
  const time = new Date(event.ts).getTime();
  const weights = {
    route_planned: 0,
    route_saved: 1,
    browser_proof: 2,
    macro_transition: 3,
    proof_gate: 4,
    route_packaged: 5,
    route_receipted: 6,
    route_promoted: 7,
  };
  return [time, weights[event.type] ?? 50, event.event_id];
}

function buildReplayCursors({ events, initialStatuses }) {
  const statusByMacro = new Map(initialStatuses.map((macro) => [macro.id, { ...macro }]));
  return events.map((event, index) => {
    if (event.type === "macro_transition" && event.macro_id && statusByMacro.has(event.macro_id)) {
      const macro = statusByMacro.get(event.macro_id);
      macro.status = event.status || macro.status;
      macro.updated_at = event.ts;
      macro.updated_by = event.actor || macro.updated_by || null;
      macro.proof_note = event.note || macro.proof_note || "";
    }
    return {
      index,
      event_id: event.event_id,
      ts: event.ts,
      focus_macro_id: event.macro_id,
      title: event.title,
      statuses: [...statusByMacro.values()].map((macro) => ({ ...macro })),
    };
  });
}

export async function loadRouteReplay({ dataRoot = defaultDataRoot(), routeId = "current" } = {}) {
  const detail = await loadRouteDetail({ dataRoot, routeId });
  if (!detail.ok) {
    return {
      ok: false,
      version: ROUTE_STATE_VERSION,
      route_id: detail.route_id || routeId,
      error: detail.error || "route replay unavailable",
      detail,
    };
  }

  const route = detail.route || {};
  const routePacket = detail.route_packet || route;
  const events = [];
  const routeFile = detail.paths?.route_file || route.route_file || null;
  const routeStartIso = validIso(routePacket.created_at || route.created_at || await fileTimestamp(routeFile));
  const routeStartMs = routeStartIso ? new Date(routeStartIso).getTime() : 0;
  const routeSavedAt = validIso(route.current_route_saved_at) || await fileTimestamp(detail.paths?.current_route_state);

  pushReplayEvent(events, {
    ts: routeStartIso,
    type: "route_planned",
    title: "Route planned",
    actor: routePacket.source || route.source || "operator_goal",
    status: "planned",
    note: route.objective || routePacket.objective || "",
    artifact_path: routeFile,
    artifact_kind: "route_packet",
    source: "route_packet",
  });

  pushReplayEvent(events, {
    ts: routeSavedAt,
    type: "route_saved",
    title: "Route saved to Mission Spine",
    actor: "route-state",
    status: "saved",
    note: "Durable current route state written for AE See-Suite hydration.",
    artifact_path: detail.paths?.current_route_state,
    artifact_kind: "current_route_state",
    source: "current_route",
  });

  for (const event of Array.isArray(route.progress_events) ? route.progress_events : []) {
    pushReplayEvent(events, {
      ts: event.ts,
      type: "macro_transition",
      macro_id: event.macro_id,
      title: `${event.macro_id || "macro"} ${event.previous_status || "?"} -> ${event.status || "?"}`,
      actor: event.actor,
      status: event.status,
      previous_status: event.previous_status,
      note: event.proof_note || "",
      source: "progress_events",
    });
  }

  for (const [gateId, result] of Object.entries(route.proof_gate_results || {})) {
    pushReplayEvent(events, {
      ts: await fileTimestamp(result?.receipt_path) || route.macro_actions?.find((action) => action.id === "verify")?.updated_at,
      type: "proof_gate",
      macro_id: "verify",
      title: `Proof gate: ${gateId}`,
      actor: "proof-gate-runner",
      status: result?.status || (result?.ok ? "pass" : "unknown"),
      note: result?.summary ? `${result.summary.passed || 0}/${result.summary.checks || 0} checks` : "",
      artifact_path: result?.receipt_path || null,
      artifact_kind: `proof_gate:${gateId}`,
      duration_ms: result?.duration_ms,
      source: "proof_gate_results",
    });
  }

  for (const proof of detail.proof_links?.browser || []) {
    const proofTs = validIso(proof.checked_at || await fileTimestamp(proof.report_path || proof.file));
    if (routeStartMs && proofTs && new Date(proofTs).getTime() < routeStartMs) continue;
    pushReplayEvent(events, {
      ts: proofTs,
      type: "browser_proof",
      macro_id: "verify",
      title: "Browser proof captured",
      actor: "browser-proof",
      status: "proof",
      note: proof.report_path || proof.file || "",
      artifact_path: proof.report_path || proof.file || null,
      artifact_kind: "browser_proof",
      source: "package_manifest.browser_proofs",
    });
  }

  pushReplayEvent(events, {
    ts: detail.package_manifest?.created_at,
    type: "route_packaged",
    macro_id: "package",
    title: "Route package manifest written",
    actor: "route-package",
    status: detail.package_manifest?.ok ? "ok" : "unknown",
    note: detail.paths?.package_manifest || "",
    artifact_path: detail.paths?.package_manifest || null,
    artifact_kind: "package_manifest",
    source: "package_manifest",
  });

  pushReplayEvent(events, {
    ts: detail.closeout_receipt?.created_at,
    type: "route_receipted",
    macro_id: "receipt",
    title: "Route closeout receipt written",
    actor: "route-closeout",
    status: detail.closeout_receipt?.ok ? "ok" : "unknown",
    note: detail.paths?.closeout_receipt || "",
    artifact_path: detail.paths?.closeout_receipt || null,
    artifact_kind: "closeout_receipt",
    source: "closeout_receipt",
  });

  pushReplayEvent(events, {
    ts: detail.promotion_record?.created_at,
    type: "route_promoted",
    macro_id: "promote",
    title: "Route promoted",
    actor: "route-promote",
    status: detail.promotion_record?.ok ? "ok" : "blocked",
    note: detail.paths?.promotion_record || "",
    artifact_path: detail.paths?.promotion_record || null,
    artifact_kind: "promotion_record",
    source: "promotion_record",
  });

  events.sort((a, b) => {
    const ak = eventSortKey(a);
    const bk = eventSortKey(b);
    return ak[0] - bk[0] || ak[1] - bk[1] || String(ak[2]).localeCompare(String(bk[2]));
  });
  const firstTs = events[0]?.ts || null;
  for (let i = 0; i < events.length; i += 1) {
    events[i].index = i;
    events[i].relative_ms = firstTs ? Math.max(0, new Date(events[i].ts).getTime() - new Date(firstTs).getTime()) : 0;
  }

  const initialStatuses = baseMacroStatuses(routePacket, route);
  const cursors = buildReplayCursors({ events, initialStatuses });
  const lastTs = events.at(-1)?.ts || null;

  return {
    ok: true,
    version: ROUTE_STATE_VERSION,
    replay_version: "orangebox-route-replay/v1",
    route_id: detail.route_id,
    status: detail.status,
    is_current: detail.is_current,
    objective: route.objective || routePacket.objective || "",
    data_root: dataRoot,
    paths: detail.paths,
    event_count: events.length,
    first_ts: firstTs,
    last_ts: lastTs,
    duration_ms: firstTs && lastTs ? Math.max(0, new Date(lastTs).getTime() - new Date(firstTs).getTime()) : 0,
    initial_macro_statuses: initialStatuses,
    final_macro_statuses: projectRouteState(route).vision_rail || [],
    events,
    cursors,
    artifact_summary: detail.artifact_summary,
  };
}

function artifactKeyForProofGate(kind = "") {
  return String(kind).replace(/^proof_gate:/, "proof_gate_").replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function collectRouteArtifacts(detail) {
  const artifacts = new Map();
  const add = (key, label, file, kind = key) => {
    if (!file) return;
    artifacts.set(key, { key, label, path: file, kind });
  };
  add("current_state", "Current route state", detail.paths?.current_route_state, "current_route_state");
  add("route", "Route packet", detail.paths?.route_file, "route_packet");
  add("package", "Package manifest", detail.paths?.package_manifest, "package_manifest");
  add("promotion", "Promotion record", detail.paths?.promotion_record, "promotion_record");
  add("closeout", "Closeout receipt", detail.paths?.closeout_receipt, "closeout_receipt");
  const firstBrowser = detail.proof_links?.browser?.[0] || null;
  add("browser_report", "Browser proof report", firstBrowser?.report_path || firstBrowser?.file, "browser_proof_report");
  add("browser_screenshot", "Browser proof screenshot", firstBrowser?.screenshot_path || firstBrowser?.screenshot, "browser_proof_screenshot");
  for (const proof of detail.proof_links?.proof_gates || []) {
    add(artifactKeyForProofGate(proof.kind), `Proof gate ${proof.kind || ""}`.trim(), proof.path, proof.kind || "proof_gate");
  }
  return artifacts;
}

function allowedTextArtifact(file) {
  const ext = path.extname(file || "").toLowerCase();
  return new Set([".json", ".md", ".txt", ".yaml", ".yml", ".log", ".csv"]).has(ext);
}

export async function loadRouteArtifact({
  dataRoot = defaultDataRoot(),
  routeId = "current",
  artifact = "package",
  maxBytes = 262144,
} = {}) {
  const detail = await loadRouteDetail({ dataRoot, routeId });
  if (!detail.ok) {
    return {
      ok: false,
      version: ROUTE_STATE_VERSION,
      route_id: detail.route_id || routeId,
      artifact,
      error: detail.error || "route artifact unavailable",
    };
  }
  const artifacts = collectRouteArtifacts(detail);
  const key = String(artifact || "package").trim() || "package";
  const selected = artifacts.get(key);
  if (!selected) {
    return {
      ok: false,
      version: ROUTE_STATE_VERSION,
      route_id: detail.route_id,
      artifact: key,
      error: `artifact is not allow-listed for this route: ${key}`,
      available: [...artifacts.values()].map(({ key, label, kind, path: file }) => ({ key, label, kind, path: file })),
    };
  }
  if (!fsSync.existsSync(selected.path)) {
    return {
      ok: false,
      version: ROUTE_STATE_VERSION,
      route_id: detail.route_id,
      artifact: key,
      selected,
      error: "artifact path does not exist",
    };
  }
  const stat = await fs.stat(selected.path);
  const textAllowed = allowedTextArtifact(selected.path);
  const tooLarge = stat.size > maxBytes;
  const result = {
    ok: textAllowed && !tooLarge,
    version: ROUTE_STATE_VERSION,
    artifact_version: "orangebox-route-artifact/v1",
    route_id: detail.route_id,
    artifact: key,
    selected,
    available: [...artifacts.values()].map(({ key: itemKey, label, kind, path: file }) => ({ key: itemKey, label, kind, path: file })),
    meta: {
      bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      text_allowed: textAllowed,
      max_bytes: maxBytes,
      too_large: tooLarge,
    },
    content: null,
    json: null,
    error: null,
  };
  if (!textAllowed) {
    result.error = "artifact is binary or unsupported for inline preview";
    return result;
  }
  if (tooLarge) {
    result.error = "artifact exceeds inline preview byte limit";
    return result;
  }
  result.content = await fs.readFile(selected.path, "utf8");
  if (path.extname(selected.path).toLowerCase() === ".json") {
    try { result.json = JSON.parse(result.content); } catch {}
  }
  result.ok = true;
  return result;
}

async function writeRouteStateReceipt(saved, receiptDir = repoReceiptDir()) {
  await fs.mkdir(receiptDir, { recursive: true });
  const file = path.join(receiptDir, `orangebox-route-state-current-${stampForFile()}.json`);
  const receipt = {
    ok: true,
    source: "orangebox-route-state",
    title: "Current Mission Spine route saved",
    summary: `${saved.route_id}: ${shortObjective(saved.current)}`,
    created_at: new Date().toISOString(),
    evidence: {
      route_id: saved.route_id,
      current_route_path: saved.current_route_path,
      projection: saved.projection,
    },
  };
  await fs.writeFile(file, JSON.stringify(receipt, null, 2) + "\n", "utf8");
  return file;
}

export async function saveCurrentRoute({
  route,
  dataRoot = defaultDataRoot(),
  emitReceipt = null,
  writeRepoReceipt = false,
  postPartyLine = null,
} = {}) {
  if (!route?.route_id) throw new Error("route.route_id is required");
  await fs.mkdir(stateDir(dataRoot), { recursive: true });
  const current = {
    ...route,
    current_route_saved_at: new Date().toISOString(),
  };
  const projection = projectRouteState(current);
  const file = currentRoutePath(dataRoot);
  await fs.writeFile(file, JSON.stringify(current, null, 2) + "\n", "utf8");
  await fs.appendFile(historyPath(dataRoot), JSON.stringify({
    ts: new Date().toISOString(),
    route_id: current.route_id,
    project: current.project,
    objective: current.objective,
    fingerprint: crypto.createHash("sha256").update(JSON.stringify({
      route_id: current.route_id,
      objective: current.objective,
      macro_actions: current.macro_actions,
      proof_gates: current.proof_gates,
    })).digest("hex"),
  }) + "\n", "utf8");

  const saved = {
    ok: true,
    version: ROUTE_STATE_VERSION,
    route_id: current.route_id,
    current,
    projection,
    current_route_path: file,
    history_path: historyPath(dataRoot),
    receipt: null,
    party_line_message: null,
  };

  if (emitReceipt) {
    saved.receipt = await emitReceipt({
      source: "orangebox-route-state",
      title: "Current Mission Spine route saved",
      summary: `${current.route_id}: ${shortObjective(current)}`,
      evidence: {
        route_id: current.route_id,
        current_route_path: file,
        current_macro: projection.current_macro,
        proof_gates: projection.proof_gates.map((gate) => gate.id),
      },
    });
  } else if (writeRepoReceipt) {
    saved.receipt = { path: await writeRouteStateReceipt(saved) };
  }

  if (postPartyLine) {
    saved.party_line_message = postPartyLine(
      `Mission Spine planned ${current.route_id}: ${shortObjective(current)} | next=${projection.current_macro?.id || "none"} | gates=${projection.counts.proof_gates}`
    );
  }

  return saved;
}

export async function updateCurrentRouteProgress({
  macroId = "next",
  status = "done",
  proofNote = "",
  actor = "operator",
  dataRoot = defaultDataRoot(),
  emitReceipt = null,
  writeRepoReceipt = false,
  postPartyLine = null,
} = {}) {
  const allowed = new Set(["ready", "pending", "active", "done", "blocked", "skipped"]);
  const nextStatus = String(status || "done").toLowerCase();
  if (!allowed.has(nextStatus)) throw new Error(`unsupported macro status: ${status}`);

  const loaded = await loadCurrentRoute({ dataRoot });
  if (!loaded.current?.route_id) throw new Error("no current Mission Spine route to update");
  const route = structuredClone(loaded.current);
  const macros = Array.isArray(route.macro_actions) ? route.macro_actions : [];
  const target = macroId === "next" ? pickNextMacro(macros) : macros.find((action) => action.id === macroId);
  if (!target?.id) throw new Error(`macro not found: ${macroId}`);

  const previousStatus = target.status || "pending";
  target.status = nextStatus;
  target.updated_at = new Date().toISOString();
  target.updated_by = actor;
  if (proofNote) target.proof_note = proofNote;

  route.progress_events = Array.isArray(route.progress_events) ? route.progress_events : [];
  route.progress_events.push({
    ts: new Date().toISOString(),
    macro_id: target.id,
    previous_status: previousStatus,
    status: nextStatus,
    proof_note: proofNote || "",
    actor,
  });

  const saved = await saveCurrentRoute({
    route,
    dataRoot,
    emitReceipt: emitReceipt ? async (receipt) => emitReceipt({
      ...receipt,
      title: "Mission Spine macro progress updated",
      summary: `${route.route_id}: ${target.id} ${previousStatus} -> ${nextStatus}`,
      evidence: {
        ...(receipt.evidence || {}),
        macro_id: target.id,
        previous_status: previousStatus,
        status: nextStatus,
        proof_note: proofNote || "",
      },
    }) : null,
    writeRepoReceipt,
  });

  if (postPartyLine) {
    saved.party_line_message = postPartyLine(
      `Mission Spine ${route.route_id}: ${target.id} ${previousStatus}->${nextStatus} | next=${saved.projection.current_macro?.id || "none"}`
    );
  }

  return {
    ok: true,
    version: ROUTE_STATE_VERSION,
    route_id: route.route_id,
    macro_id: target.id,
    previous_status: previousStatus,
    status: nextStatus,
    proof_note: proofNote || "",
    current: saved.current,
    projection: saved.projection,
    current_route_path: saved.current_route_path,
    receipt: saved.receipt,
    party_line_message: saved.party_line_message,
  };
}

export async function completeCurrentRoute({
  dataRoot = defaultDataRoot(),
  proofNote = "route promotion closed remaining macro-actions",
  actor = "route-promote",
  postPartyLine = null,
} = {}) {
  const loaded = await loadCurrentRoute({ dataRoot });
  if (!loaded.current?.route_id) throw new Error("no current Mission Spine route to complete");
  const route = structuredClone(loaded.current);
  const macros = Array.isArray(route.macro_actions) ? route.macro_actions : [];
  route.progress_events = Array.isArray(route.progress_events) ? route.progress_events : [];
  const changed = [];
  for (const action of macros) {
    const previousStatus = action.status || "pending";
    if (["done", "skipped"].includes(previousStatus)) continue;
    action.status = "done";
    action.updated_at = new Date().toISOString();
    action.updated_by = actor;
    action.proof_note = proofNote;
    route.progress_events.push({
      ts: new Date().toISOString(),
      macro_id: action.id,
      previous_status: previousStatus,
      status: "done",
      proof_note: proofNote,
      actor,
    });
    changed.push({ id: action.id, previous_status: previousStatus, status: "done" });
  }
  const saved = await saveCurrentRoute({ route, dataRoot });
  if (postPartyLine && changed.length) {
    saved.party_line_message = postPartyLine(
      `Mission Spine ${route.route_id}: complete | closed=${changed.map((item) => item.id).join(",")}`
    );
  }
  return {
    ok: true,
    version: ROUTE_STATE_VERSION,
    route_id: route.route_id,
    changed,
    current: saved.current,
    projection: saved.projection,
    current_route_path: saved.current_route_path,
    party_line_message: saved.party_line_message,
  };
}

export async function runRouteStateDoctor({ writeReceipt = false, keepTemp = false } = {}) {
  const dataRoot = path.join(os.tmpdir(), `obx-route-state-doctor-${stampForFile()}-${crypto.randomBytes(3).toString("hex")}`);
  const route = await planOperatingRoute({
    objective: "Prove durable Mission Spine route state and Vision Rail projection.",
    project: "orangebox-route-state-doctor",
    dataRoot,
    writeRoute: true,
  });
  const saved = await saveCurrentRoute({ route, dataRoot });
  const progress = await updateCurrentRouteProgress({
    macroId: "patch",
    status: "done",
    proofNote: "route-state doctor progress mutation",
    actor: "route-state-doctor",
    dataRoot,
  });
  const loaded = await loadCurrentRoute({ dataRoot });
  const checks = [
    {
      name: "current_route_file",
      ok: fsSync.existsSync(saved.current_route_path),
      evidence: { current_route_path: saved.current_route_path, route_id: saved.route_id },
    },
    {
      name: "vision_rail_projection",
      ok: loaded.projection?.vision_rail?.length === 8 && !!loaded.projection?.current_macro?.id,
      evidence: {
        rail_count: loaded.projection?.vision_rail?.length || 0,
        current_macro: loaded.projection?.current_macro || null,
      },
    },
    {
      name: "artifacts_projection",
      ok: !!loaded.projection?.artifacts?.route_file && loaded.projection?.proof_gates?.length >= 4,
      evidence: loaded.projection?.artifacts || null,
    },
    {
      name: "macro_progress_update",
      ok: progress.ok && progress.macro_id === "patch" && progress.status === "done" && loaded.projection?.current_macro?.id === "verify",
      evidence: {
        macro_id: progress.macro_id,
        previous_status: progress.previous_status,
        status: progress.status,
        current_macro: loaded.projection?.current_macro || null,
        events: loaded.current?.progress_events?.length || 0,
      },
    },
  ];
  const failures = checks.filter((check) => !check.ok);
  const result = {
    ok: failures.length === 0,
    version: "orangebox-route-state-doctor/v1",
    created_at: new Date().toISOString(),
    data_root: dataRoot,
    summary: {
      checks: checks.length,
      passed: checks.filter((check) => check.ok).length,
      failed: failures.length,
    },
    checks,
    failures,
    receipt_path: null,
  };
  if (writeReceipt) {
    await fs.mkdir(repoReceiptDir(), { recursive: true });
    result.receipt_path = path.join(repoReceiptDir(), `orangebox-route-state-doctor-${stampForFile()}.json`);
    await fs.writeFile(result.receipt_path, JSON.stringify(result, null, 2) + "\n", "utf8");
  }
  if (!keepTemp) {
    try { await fs.rm(dataRoot, { recursive: true, force: true }); } catch {}
  }
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes("--json");
  const writeReceipt = process.argv.includes("--receipt");
  const out = await runRouteStateDoctor({ writeReceipt });
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`${out.ok ? "PASS" : "FAIL"} ${out.summary.passed}/${out.summary.checks} route-state checks`);
    if (out.receipt_path) console.log(`receipt: ${out.receipt_path}`);
    for (const failure of out.failures) console.log(`failure: ${failure.name}`);
  }
  if (!out.ok) process.exit(4);
}
