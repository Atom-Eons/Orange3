#!/usr/bin/env bun
/*
  orangebox-elysia-rail-latency-bakeoff.mjs

  Measures the current live Bun rails against the V3 Bun/Elysia sidecar without
  promoting the sidecar to default. This is a proof gate, not an installer.
*/

import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const wantsReceipt = args.has("--receipt");

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.env.ORANGEBOX_REPO_ROOT || path.resolve(here, "..", "..");
const dataRoot = process.env.ORANGEBOX_DATA_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const outDir = path.join(dataRoot, "api-bakeoff");
const receiptDir = path.join(repoRoot, "receipts");

function stamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\..+$/, "Z");
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function exists(file) {
  return fs.existsSync(file);
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return fallback;
  }
}

async function writeJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function percentile(values, pct) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return Number(sorted[index].toFixed(3));
}

function stats(samples) {
  const okSamples = samples.filter((sample) => sample.ok);
  const values = okSamples.map((sample) => sample.ms);
  const sum = values.reduce((total, value) => total + value, 0);
  return {
    attempted: samples.length,
    ok_count: okSamples.length,
    failed_count: samples.length - okSamples.length,
    ok_rate: samples.length ? Number((okSamples.length / samples.length).toFixed(4)) : 0,
    min_ms: values.length ? Number(Math.min(...values).toFixed(3)) : null,
    avg_ms: values.length ? Number((sum / values.length).toFixed(3)) : null,
    p50_ms: percentile(values, 50),
    p95_ms: percentile(values, 95),
    max_ms: values.length ? Number(Math.max(...values).toFixed(3)) : null,
    status_codes: [...new Set(okSamples.map((sample) => sample.status).filter(Boolean))],
    bytes_avg: okSamples.length
      ? Number((okSamples.reduce((total, sample) => total + (sample.bytes || 0), 0) / okSamples.length).toFixed(1))
      : null,
  };
}

function findOpenPort(host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close(() => {
        if (port) resolve(port);
        else reject(new Error("No open port returned"));
      });
    });
  });
}

async function timedFetch(url, timeoutMs = 1800) {
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      ms: Number((performance.now() - started).toFixed(3)),
      bytes: Buffer.byteLength(text),
      body_sample: text.slice(0, 160),
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      ms: Number((performance.now() - started).toFixed(3)),
      bytes: 0,
      error: String(error?.message || error),
    };
  }
}

async function sampleEndpoint(endpoint, samples = 25, warmups = 3) {
  const warmup = [];
  for (let index = 0; index < warmups; index += 1) {
    warmup.push(await timedFetch(endpoint.url, endpoint.timeout_ms || 1800));
  }
  const measured = [];
  for (let index = 0; index < samples; index += 1) {
    measured.push(await timedFetch(endpoint.url, endpoint.timeout_ms || 1800));
  }
  return {
    ...endpoint,
    warmup: stats(warmup),
    measured: stats(measured),
    sample_count: samples,
  };
}

async function waitFor(url, attempts = 25) {
  for (let index = 0; index < attempts; index += 1) {
    const probe = await timedFetch(url, 1000);
    if (probe.ok) return probe;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return timedFetch(url, 1000);
}

async function startElysiaSidecar() {
  const bridgePath = path.join(repoRoot, "orangebox-v3", "api", "elysia-bridge.ts");
  const { createV3ApiApp } = await import(pathToFileURL(bridgePath).href);
  const host = "127.0.0.1";
  const port = await findOpenPort(host);
  const app = createV3ApiApp();
  app.listen({ hostname: host, port });
  const baseUrl = `http://${host}:${port}`;
  const health = await waitFor(`${baseUrl}/health`);
  return {
    app,
    baseUrl,
    host,
    port,
    health,
    stop() {
      try {
        app.server?.stop?.(true);
      } catch {
        // The bakeoff is allowed to finish even if Bun already released the server.
      }
    },
  };
}

async function main() {
  const startedAt = new Date();
  const sidecar = await startElysiaSidecar();

  try {
    const endpoints = [
      {
        id: "current_command_rail_health",
        family: "current",
        url: "http://127.0.0.1:8787/api/realtime/health",
      },
      {
        id: "current_api_server_health",
        family: "current",
        url: "http://127.0.0.1:8797/api/health",
      },
      {
        id: "elysia_sidecar_health",
        family: "elysia",
        url: `${sidecar.baseUrl}/health`,
      },
      {
        id: "elysia_sidecar_v3_status",
        family: "elysia",
        url: `${sidecar.baseUrl}/api/v3/status`,
        samples: 12,
        warmups: 2,
        timeout_ms: 2600,
      },
    ];

    const results = [];
    for (const endpoint of endpoints) {
      results.push(await sampleEndpoint(endpoint, endpoint.samples || 25, endpoint.warmups || 3));
    }

    const byId = Object.fromEntries(results.map((result) => [result.id, result]));
    const commandP95 = byId.current_command_rail_health?.measured?.p95_ms ?? Number.POSITIVE_INFINITY;
    const apiP95 = byId.current_api_server_health?.measured?.p95_ms ?? Number.POSITIVE_INFINITY;
    const sidecarP95 = byId.elysia_sidecar_health?.measured?.p95_ms ?? Number.POSITIVE_INFINITY;
    const statusOk = byId.elysia_sidecar_v3_status?.measured?.ok_rate === 1;
    const currentComparisonP95 = Math.max(commandP95, apiP95);
    const parityLimitMs = Number((currentComparisonP95 * 1.25 + 10).toFixed(3));
    const latencyParityGreen =
      sidecar.health.ok === true &&
      byId.elysia_sidecar_health?.measured?.ok_rate === 1 &&
      sidecarP95 <= parityLimitMs &&
      statusOk;

    const packageJson = readJson(path.join(repoRoot, "package.json"), {});
    const failures = [];
    if (!packageJson?.dependencies?.elysia && !packageJson?.devDependencies?.elysia) failures.push("elysia_dependency_missing");
    if (!sidecar.health.ok) failures.push("elysia_sidecar_health_not_green");
    if (byId.current_command_rail_health?.measured?.ok_rate !== 1) failures.push("current_command_rail_not_green");
    if (byId.current_api_server_health?.measured?.ok_rate !== 1) failures.push("current_api_server_not_green");
    if (byId.elysia_sidecar_health?.measured?.ok_rate !== 1) failures.push("elysia_sidecar_samples_not_green");
    if (!statusOk) failures.push("elysia_status_route_not_green");
    if (sidecarP95 > parityLimitMs) failures.push("elysia_sidecar_p95_over_parity_limit");

    const report = {
      ok: failures.length === 0 && latencyParityGreen,
      schema_version: "orangebox.elysia_rail_latency_bakeoff.v1",
      generated_at: new Date().toISOString(),
      status: failures.length === 0 && latencyParityGreen
        ? "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN"
        : "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_NEEDS_WORK",
      doctrine: [
        "Measure before promotion.",
        "Sidecar speed is not default authority.",
        "Default rail replacement still requires route parity, rollback, and operator approval.",
      ],
      sidecar: {
        host: sidecar.host,
        port: sidecar.port,
        base_url: sidecar.baseUrl,
        health: sidecar.health,
        mode: "temporary_sidecar_only",
      },
      benchmark: {
        samples_per_health_endpoint: 25,
        parity_limit_ms: parityLimitMs,
        current_comparison_p95_ms: Number(currentComparisonP95.toFixed(3)),
        elysia_health_p95_ms: Number(sidecarP95.toFixed(3)),
        elysia_vs_current_p95_delta_ms: Number((sidecarP95 - currentComparisonP95).toFixed(3)),
        latency_parity_green: latencyParityGreen,
        results,
      },
      promotion: {
        sidecar_candidate_green: failures.length === 0 && latencyParityGreen,
        default_api_replacement_approved: false,
        default_api_replacement_blockers: [
          "Needs route-by-route parity beyond health/status.",
          "Needs rollback plan for default transport switch.",
          "Needs operator approval before ORANGEBOX_API_ENGINE default changes.",
        ],
      },
      constraints: {
        frontend_touched: false,
        host_mcp_config_mutated: false,
        paid_api_called: false,
        production_deploy_attempted: false,
        default_transport_changed: false,
      },
      failures,
      report_hash: sha256(JSON.stringify({ results, failures, latencyParityGreen })),
      rollback: {
        repo_mutation: "none; benchmark doctor only unless package script wiring is added",
        data_mutation: outDir,
        recovery_action: "Delete generated api-bakeoff receipts if superseded. No rail defaults were changed.",
      },
      duration_ms: Date.now() - startedAt.getTime(),
    };

    const latestPath = path.join(outDir, "latest-elysia-rail-latency-bakeoff.json");
    report.latest_path = latestPath;
    if (wantsReceipt) {
      report.receipt_path = path.join(receiptDir, `orangebox-elysia-rail-latency-bakeoff-${stamp()}.json`);
    }
    await writeJson(latestPath, report);

    if (wantsReceipt) {
      await writeJson(report.receipt_path, report);
    }

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } finally {
    sidecar.stop();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    status: "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_FATAL",
    error: String(error?.stack || error),
  }, null, 2));
  process.exit(1);
});
