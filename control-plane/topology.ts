import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const CONTROL_PLANE_TOPOLOGY_VERSION = "orangebox-control-plane-topology/v0.3";

const DATA_ROOT = Bun.env.ORANGEBOX_DATA_ROOT || Bun.env.ORANGEBOX_ROOT || path.join(os.homedir(), "OrangeBox-Data");
const CODEXA_MODE_PATH = path.join(DATA_ROOT, "codexa-mode.json");
const TRIAD_STATUS_PATH = path.join(DATA_ROOT, "triad", "orangebox", "triad-status.json");
const LLAMA_BASE_URL = Bun.env.LLAMA_CPP_BASE_URL || "http://127.0.0.1:8080";
const SIDECAR_BASE_URL = Bun.env.ORANGEBOX_CONTROL_PLANE_SIDECAR_URL || "http://127.0.0.1:8787";

export interface TopologyProbeOptions {
  probeModels?: boolean;
}

interface HttpProbe {
  ok: boolean;
  url: string;
  status: number;
  ms: number;
  json?: any;
  body?: string;
  error?: string;
}

async function readJson(file: string) {
  try {
    const text = await fs.readFile(file, "utf8");
    return { ok: true, path: file, data: JSON.parse(text.replace(/^\uFEFF/, "")), error: null };
  } catch (error) {
    return { ok: false, path: file, data: null, error: error instanceof Error ? error.message : String(error) };
  }
}

async function httpJson(url: string, timeoutMs = 3000): Promise<HttpProbe> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      url,
      status: response.status,
      ms: Math.round(performance.now() - started),
      ...(json ? { json } : { body: text.slice(0, 1200) }),
    };
  } catch (error) {
    return {
      ok: false,
      url,
      status: 0,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function configuredAiBoxHosts(mode: any) {
  const config = mode?.data?.config || {};
  return [...new Set([
    Bun.env.ORANGEBOX_AI_BOX_DIRECT_IP,
    Bun.env.ORANGEBOX_AI_BOX_IP,
    config.ai_box_direct_ip,
    config.ai_box_ip,
    config.codexa_direct_ip,
    config.codexa_ip,
  ].filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}

function nvidiaProbe() {
  try {
    const result = Bun.spawnSync({
      cmd: ["nvidia-smi", "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"],
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new TextDecoder().decode(result.stdout).trim();
    const stderr = new TextDecoder().decode(result.stderr).trim();
    return {
      ok: result.exitCode === 0,
      stdout,
      stderr,
      exit_code: result.exitCode,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      exit_code: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractModelStdout(triad: any) {
  return String(triad?.modelProbe?.result?.response?.stdout || "");
}

function aiBoxOllamaProven(triad: any) {
  const stdout = extractModelStdout(triad);
  return /ollama version/i.test(stdout)
    && /qwen2\.5-coder:32b-instruct/i.test(stdout)
    && /llama3\.3:70b-instruct/i.test(stdout);
}

async function probeAiBoxRails(hosts: string[]) {
  const rails = [];
  for (const host of hosts) {
    for (const port of [8097, 8098, 8099]) {
      const probePath = port === 8099 ? "/" : "/health";
      rails.push({
        host,
        port,
        probe_contract: port === 8099 ? "knowledge_receipts_root" : "health_json",
        ...(await httpJson(`http://${host}:${port}${probePath}`, 2500)),
      });
    }
  }
  return rails;
}

export async function probeControlPlaneTopology(options: TopologyProbeOptions = {}) {
  const startedAt = new Date().toISOString();
  const [codexaMode, triadFile, llamaHealth, llamaModels] = await Promise.all([
    readJson(CODEXA_MODE_PATH),
    readJson(TRIAD_STATUS_PATH),
    httpJson(`${LLAMA_BASE_URL.replace(/\/+$/, "")}/health`, 2500),
    httpJson(`${LLAMA_BASE_URL.replace(/\/+$/, "")}/v1/models`, 3500),
  ]);
  const hosts = configuredAiBoxHosts(codexaMode);
  const rails = await probeAiBoxRails(hosts);
  const sidecarTriad = options.probeModels
    ? await httpJson(`${SIDECAR_BASE_URL.replace(/\/+$/, "")}/api/triad?project=orangebox&probe=1`, 45000)
    : await httpJson(`${SIDECAR_BASE_URL.replace(/\/+$/, "")}/api/triad?project=orangebox`, 5000);
  const triad = sidecarTriad.ok && sidecarTriad.json ? sidecarTriad.json : triadFile.data;
  const gpu = nvidiaProbe();
  const directCommandRailOk = rails.some((rail) => rail.port === 8097 && rail.ok);
  const partyLineOk = rails.some((rail) => rail.port === 8098 && rail.ok);
  const llamaModelIds = Array.isArray(llamaModels.json?.data)
    ? llamaModels.json.data.map((model: any) => model.id || model.model || model.name).filter(Boolean)
    : [];
  const noGpuAdaptiveMode = !gpu.ok && hosts.length > 0;
  const blockers = [
    !llamaHealth.ok ? "local_llama_health_missing" : null,
    !llamaModels.ok ? "local_llama_models_missing" : null,
    !directCommandRailOk ? "ai_box_command_rail_missing" : null,
    !partyLineOk ? "ai_box_party_line_missing" : null,
    !aiBoxOllamaProven(triad) ? "ai_box_ollama_model_proof_missing" : null,
    !noGpuAdaptiveMode && !gpu.ok ? "gpu_or_adaptive_topology_required" : null,
  ].filter(Boolean);

  return {
    ok: blockers.length === 0,
    version: CONTROL_PLANE_TOPOLOGY_VERSION,
    project: "ORANGEBOX",
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    summary: {
      status: blockers.length === 0 ? "TWO_DEVICE_CONTROL_PLANE_READY" : "TOPOLOGY_BLOCKED",
      topology: noGpuAdaptiveMode ? "two_device_adaptive" : "single_host_or_gpu",
      command_host: noGpuAdaptiveMode ? "command-n150" : null,
      worker_host: noGpuAdaptiveMode ? "codexa-ai-box" : null,
      nvidia_gpu_detected: gpu.ok,
      gpu_acceleration_deferred: noGpuAdaptiveMode,
      llama_listener_reachable: llamaHealth.ok && llamaModels.ok,
      llama_model_ids: llamaModelIds,
      ai_box_hosts: hosts,
      ai_box_command_rail_reachable: directCommandRailOk,
      ai_box_party_line_reachable: partyLineOk,
      ai_box_ollama_proven: aiBoxOllamaProven(triad),
      blocker_count: blockers.length,
    },
    blockers,
    codexa_mode: codexaMode,
    triad_status: {
      path: TRIAD_STATUS_PATH,
      file_ok: triadFile.ok,
      sidecar_probe_url: sidecarTriad.url,
      sidecar_probe_ok: sidecarTriad.ok,
      route_status: triad?.route?.status || triad?.status || null,
      model_probe_status: triad?.modelProbe?.result?.status || triad?.modelProbe?.status || null,
      ai_box_ollama_proven: aiBoxOllamaProven(triad),
    },
    llama_cpp: {
      base_url: LLAMA_BASE_URL,
      health: llamaHealth,
      models: llamaModels,
    },
    ai_box_rails: rails,
    gpu,
    policy: {
      no_paid_api_call_made: true,
      model_generation_call_made: false,
      ai_box_probe_is_read_only: true,
      gpu_only_acceleration_profiles: noGpuAdaptiveMode ? "deferred_until_gpu_endpoint_exists" : "available_if_runtime_proves_it",
    },
  };
}
