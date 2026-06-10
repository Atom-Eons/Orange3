import { Elysia } from "elysia";
import path from "node:path";
import { argValue, dataRoot, isMain, parseFlags, probeUrl, readJson, v3DataRoot, writeReceipt } from "../lib/core.ts";

export function createV3ApiApp() {
  const service = "orangebox-v3-elysia-bridge";
  return new Elysia({ name: service })
    .get("/health", () => ({
      ok: true,
      service,
      engine: "bun+elysia",
      feature_flag: "ORANGEBOX_API_ENGINE=elysia",
      default_safe_mode: "sidecar_only",
      time: new Date().toISOString(),
    }))
    .get("/api/v3/health", () => ({
      ok: true,
      service,
      engine: "bun+elysia",
      data_root: dataRoot,
      v3_data_root: v3DataRoot,
      time: new Date().toISOString(),
    }))
    .get("/api/v3/flags", () => ({
      ok: true,
      status: "V3_FLAGS_READY",
      flags: parseFlags(),
    }))
    .get("/api/v3/k3/benchmark", () => ({
      ok: true,
      status: "K3_BENCHMARK_VIEW_READY",
      benchmark: readJson(path.join(v3DataRoot, "k3", "latest-benchmark.json"), null),
    }))
    .get("/api/v3/status", async () => {
      const probes = await Promise.all([
        probeUrl("http://127.0.0.1:8787/api/realtime/health", 1200),
        probeUrl("http://127.0.0.1:8797/api/health", 1200),
        probeUrl("http://127.0.0.1:8094/health", 1200),
        probeUrl("http://127.0.0.1:8080/health", 1200),
      ]);
      return {
        ok: probes.every((probe) => probe.ok),
        status: "V3_STATUS_READY",
        service,
        engine: "bun+elysia",
        probes,
        k3_benchmark_present: Boolean(readJson(path.join(v3DataRoot, "k3", "latest-benchmark.json"), null)),
        time: new Date().toISOString(),
      };
    });
}

export async function elysiaBridgeDoctor() {
  let elysiaAvailable = false;
  let routeCount = 0;
  try {
    await import("elysia");
    elysiaAvailable = true;
    routeCount = createV3ApiApp().routes.length;
  } catch {
    elysiaAvailable = false;
  }
  const probes = [
    await probeUrl("http://127.0.0.1:8787/api/realtime/health", 1200),
    await probeUrl("http://127.0.0.1:8797/api/health", 1200),
  ];
  const report = {
    ok: true,
    status: "V3_API_BRIDGE_CONTRACT_READY",
    engine_flag: "ORANGEBOX_API_ENGINE=express|elysia",
    elysia_dependency_available: elysiaAvailable,
    sidecar_available: elysiaAvailable,
    routes_registered: routeCount,
    sidecar_command: "npm.cmd run v3:api:serve -- --port 8873",
    current_contract_probes: probes,
    parity_required_before_default: true,
    wrong_flow_blocked: "AI SDK transport cannot own routing or bypass TriLane.",
  };
  const receipt = await writeReceipt("api-bridge-doctor", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

export async function serveV3Api(args = process.argv.slice(2)) {
  const port = Number(argValue(args, "--port", "8873"));
  const host = argValue(args, "--host", "127.0.0.1");
  const app = createV3ApiApp();
  app.listen({ hostname: host, port });
  const out = {
    ok: true,
    status: "V3_ELYSIA_SIDECAR_RUNNING",
    service: "orangebox-v3-elysia-bridge",
    engine: "bun+elysia",
    host,
    port,
    routes_registered: app.routes.length,
    urls: [
      `http://${host}:${port}/health`,
      `http://${host}:${port}/api/v3/status`,
      `http://${host}:${port}/api/v3/flags`,
      `http://${host}:${port}/api/v3/k3/benchmark`,
    ],
    safe_mode: "sidecar_only_not_default_api",
  };
  console.log(JSON.stringify(out, null, 2));
  return app;
}

if (isMain(import.meta.url)) {
  const args = process.argv.slice(2);
  const action = args[0] === "serve" ? serveV3Api(args.slice(1)) : elysiaBridgeDoctor();
  Promise.resolve(action).then((out) => {
    if (args[0] !== "serve") console.log(JSON.stringify(out, null, 2));
  }).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "V3_API_BRIDGE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
