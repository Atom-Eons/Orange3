#!/usr/bin/env node
/* wire-path-gate.mjs - Visual Telemetry wire path accuracy gate.
 *
 * The native egui renderer currently draws graph wires as center-to-center
 * straight paths. This gate verifies that graph wire declarations match that
 * render contract, and it fails if a stored HSMP/details.path says the wire
 * should follow a different path than the renderer will show.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadOrInit } from "./project-graph.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
export const WIRE_PATH_GATE_VERSION = "wire-path-accuracy/v1";

function stampForFile(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pointFrom(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const x = numberOrNull(value[0]);
    const y = numberOrNull(value[1]);
    return x === null || y === null ? null : { x, y };
  }
  if (value && typeof value === "object") {
    const x = numberOrNull(value.x);
    const y = numberOrNull(value.y);
    return x === null || y === null ? null : { x, y };
  }
  return null;
}

function nodeCenter(node) {
  return {
    x: Number(node.x || 0) + Number(node.w || 0) / 2,
    y: Number(node.y || 0) + Number(node.h || 0) / 2,
  };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

function polylineLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

function samplePolyline(points, count) {
  if (!points.length) return [];
  if (points.length === 1 || count <= 1) return [points[0]];
  const total = polylineLength(points);
  if (total <= 0) return Array.from({ length: count }, () => points[0]);
  const out = [];
  for (let s = 0; s < count; s++) {
    const target = (total * s) / (count - 1);
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const segment = dist(a, b);
      if (walked + segment >= target || i === points.length - 1) {
        const t = segment <= 0 ? 0 : (target - walked) / segment;
        out.push(lerpPoint(a, b, Math.max(0, Math.min(1, t))));
        break;
      }
      walked += segment;
    }
  }
  return out;
}

function declaredPath(wire, fromCenter, toCenter) {
  const raw = wire?.details?.path;
  if (!Array.isArray(raw) || raw.length < 2) {
    return { source: "native-straight-default", points: [fromCenter, toCenter] };
  }
  const points = raw.map(pointFrom);
  if (points.some((p) => !p)) {
    return { source: "invalid-details-path", points: [fromCenter, toCenter], invalid: true };
  }
  return { source: "details.path", points };
}

function checkWire(wire, nodesById, { tolerancePx, samples }) {
  const fromNode = nodesById.get(wire.from);
  const toNode = nodesById.get(wire.to);
  if (!fromNode || !toNode) {
    return {
      wire_id: wire.id || null,
      ok: false,
      reason: "missing_endpoint_node",
      from: wire.from || null,
      to: wire.to || null,
    };
  }
  const fromCenter = nodeCenter(fromNode);
  const toCenter = nodeCenter(toNode);
  const expected = declaredPath(wire, fromCenter, toCenter);
  const nativePath = [fromCenter, toCenter];
  const expectedSamples = samplePolyline(expected.points, samples);
  const nativeSamples = samplePolyline(nativePath, samples);
  const sampleErrors = expectedSamples.map((point, index) => dist(point, nativeSamples[index]));
  const maxError = sampleErrors.length ? Math.max(...sampleErrors) : 0;
  const startError = dist(expected.points[0], fromCenter);
  const endError = dist(expected.points[expected.points.length - 1], toCenter);
  const ok = !expected.invalid && maxError <= tolerancePx && startError <= tolerancePx && endError <= tolerancePx;
  return {
    wire_id: wire.id || null,
    ok,
    reason: ok ? "wire_path_accuracy_pass" : "wire_path_accuracy_fail",
    kind: wire.kind || wire.details?.wire_kind || "wire",
    from: wire.from,
    to: wire.to,
    declared_path_source: expected.source,
    tolerance_px: tolerancePx,
    samples,
    max_error_px: Math.round(maxError * 1000) / 1000,
    start_error_px: Math.round(startError * 1000) / 1000,
    end_error_px: Math.round(endError * 1000) / 1000,
  };
}

export async function runWirePathGate({
  workspace = process.cwd(),
  tolerancePx = 1,
  samples = 9,
  writeReceipt = false,
} = {}) {
  const graph = await loadOrInit(workspace);
  const nodesById = new Map((graph.nodes || []).map((node) => [node.id, node]));
  const checks = (graph.wires || []).map((wire) => checkWire(wire, nodesById, { tolerancePx, samples }));
  const failures = checks.filter((check) => !check.ok);
  const result = {
    ok: failures.length === 0,
    gate: "wire-path-accuracy",
    gate_version: WIRE_PATH_GATE_VERSION,
    workspace: graph.workspace,
    graph_schema_version: graph.graph_schema_version,
    workspace_version: graph.workspace_version,
    counts: {
      nodes: graph.nodes?.length || 0,
      wires: graph.wires?.length || 0,
      checked_wires: checks.length,
      failures: failures.length,
    },
    tolerance_px: tolerancePx,
    samples,
    checks,
    failures,
  };

  if (writeReceipt) {
    const receiptDir = path.join(ROOT, "receipts");
    await fs.mkdir(receiptDir, { recursive: true });
    const stamp = stampForFile();
    const receiptPath = path.join(receiptDir, `orangebox-wire-path-accuracy-${stamp}.json`);
    await fs.writeFile(receiptPath, JSON.stringify({
      receipt_id: `orangebox-wire-path-accuracy-${stamp}`,
      project: "ORANGEBOX",
      scope: "Visual Telemetry wire path accuracy gate",
      timestamp: new Date().toISOString(),
      summary: result.ok
        ? `Wire path accuracy passed for ${checks.length} wire(s).`
        : `Wire path accuracy failed for ${failures.length} wire(s).`,
      result,
    }, null, 2));
    result.receipt_path = receiptPath;
  }

  return result;
}

function readFlag(argv, name, fallback = null) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  return argv.includes(`--${name}`) ? true : fallback;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const result = await runWirePathGate({
    workspace: readFlag(argv, "workspace", process.cwd()),
    tolerancePx: parseFloat(readFlag(argv, "tolerance-px", "1")),
    samples: parseInt(readFlag(argv, "samples", "9"), 10),
    writeReceipt: argv.includes("--receipt"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
}
