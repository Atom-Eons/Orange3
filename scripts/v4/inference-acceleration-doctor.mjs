#!/usr/bin/env node
/* inference-acceleration-doctor.mjs - read-only proof for the mandatory
 * accelerated local inference lane.
 *
 * This doctor does not install packages or generate model tokens. It proves
 * whether this host already has an SGLang/vLLM-class backend, reachable
 * OpenAI-compatible accelerated endpoint, GPU capacity, and launch flags for
 * speculative decoding/prefix caching.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

export const INFERENCE_ACCELERATION_DOCTOR_VERSION = "orangebox-inference-acceleration-doctor/v1";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const RECEIPTS_DIR = path.join(ROOT, "receipts");
const DATA_ROOT = process.env.ORANGEBOX_DATA_ROOT || process.env.ORANGEBOX_ROOT || path.join(process.env.USERPROFILE || process.env.HOME || ROOT, "OrangeBox-Data");
const CODEXA_MODE_PATH = path.join(DATA_ROOT, "codexa-mode.json");
const TRIAD_STATUS_PATH = path.join(DATA_ROOT, "triad", "orangebox", "triad-status.json");
const SIDECAR_TRIAD_URL = `${(process.env.ORANGEBOX_CONTROL_PLANE_SIDECAR_URL || "http://127.0.0.1:8787").replace(/\/+$/, "")}/api/triad?project=orangebox&probe=1`;
const MANAGED_LLAMA_HOME = process.env.ORANGEBOX_LLAMA_CPP_HOME || "C:\\AtomEons\\tools\\llama.cpp\\b9360";
const MANAGED_BIN_DIR = process.env.ORANGEBOX_MANAGED_BIN || "C:\\AtomEons\\tools\\bin";

const DEFAULT_ENDPOINTS = [
  { id: "sglang_default", kind: "sglang", url: process.env.SGLANG_BASE_URL || "http://127.0.0.1:30000" },
  { id: "vllm_default", kind: "vllm", url: process.env.VLLM_BASE_URL || "http://127.0.0.1:8000" },
  { id: "llama_cpp_default", kind: "llama.cpp-cpu-listener", url: process.env.LLAMA_CPP_BASE_URL || "http://127.0.0.1:8080" },
  { id: "orangebox_accelerated", kind: "accelerated-openai-compatible", url: process.env.ORANGEBOX_ACCELERATED_INFERENCE_URL || "" },
  { id: "ollama_legacy", kind: "ollama-legacy-fallback", url: process.env.OLLAMA_HOST || "http://127.0.0.1:11434" },
].filter((endpoint, index, endpoints) => endpoint.url && endpoints.findIndex((item) => item.url === endpoint.url && item.id === endpoint.id) === index);

function stamp(date = new Date()) {
  const z = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${z(date.getMonth() + 1)}${z(date.getDate())}T${z(date.getHours())}${z(date.getMinutes())}${z(date.getSeconds())}`;
}

function compact(value, max = 1800) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max)}...[truncated]` : text;
}

async function execProbe(file, args = [], { timeout = 15000, maxBuffer = 2 * 1024 * 1024 } = {}) {
  try {
    const out = await execFileAsync(file, args, {
      cwd: ROOT,
      timeout,
      maxBuffer,
      windowsHide: true,
    });
    return {
      ok: true,
      file,
      args,
      stdout: compact(out.stdout, 4000),
      stderr: compact(out.stderr, 1600),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      file,
      args,
      stdout: compact(error?.stdout, 4000),
      stderr: compact(error?.stderr, 1600),
      error: error?.message || String(error),
      code: error?.code || null,
    };
  }
}

async function whereCommand(binary) {
  const result = await execProbe(process.platform === "win32" ? "where.exe" : "which", [binary], { timeout: 8000 });
  return {
    binary,
    found: result.ok,
    paths: result.ok ? String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean) : [],
    error: result.ok ? null : result.error,
  };
}

function managedCommandCandidates(binary) {
  const names = process.platform === "win32"
    ? [binary, `${binary}.cmd`, `${binary}.exe`]
    : [binary];
  const roots = [MANAGED_BIN_DIR, MANAGED_LLAMA_HOME].filter(Boolean);
  return roots.flatMap((root) => names.map((name) => path.join(root, name)));
}

async function locateCommand(binary) {
  const found = await whereCommand(binary);
  const managed = managedCommandCandidates(binary).filter((candidate) => fsSync.existsSync(candidate));
  return {
    ...found,
    managed_paths: managed,
    found: found.found || managed.length > 0,
    paths: [...found.paths, ...managed].filter((item, index, list) => list.indexOf(item) === index),
  };
}

async function readJsonFile(file) {
  try {
    return { ok: true, path: file, data: JSON.parse((await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "")) };
  } catch (error) {
    return { ok: false, path: file, data: null, error: error?.message || String(error) };
  }
}

function configuredAiBoxHosts(codexaMode) {
  const config = codexaMode?.data?.config || {};
  const values = [
    process.env.ORANGEBOX_AI_BOX_DIRECT_IP,
    process.env.ORANGEBOX_AI_BOX_IP,
    config.ai_box_direct_ip,
    config.ai_box_ip,
    config.codexa_direct_ip,
    config.codexa_ip,
  ].filter(Boolean);
  return [...new Set(values.map((item) => String(item).trim()).filter(Boolean))];
}

async function probeAiBoxRails(hosts) {
  const ports = [8097, 8098, 8099];
  const probes = [];
  for (const host of hosts) {
    for (const port of ports) {
      const probePath = port === 8099 ? "/" : "/health";
      const url = `http://${host}:${port}${probePath}`;
      const result = await httpJson(url, 2500);
      probes.push({
        host,
        port,
        url,
        probe_contract: port === 8099 ? "knowledge_receipts_root" : "health_json",
        reachable: result.ok,
        status: result.status,
        response_keys: result.json && typeof result.json === "object" ? Object.keys(result.json).slice(0, 10) : [],
        error: result.error || null,
      });
    }
  }
  return probes;
}

function hasAiBoxOllamaProof(triadStatus) {
  const stdout = String(triadStatus?.data?.modelProbe?.result?.response?.stdout || "");
  return /ollama version/i.test(stdout)
    && /qwen2\.5-coder:32b-instruct/i.test(stdout)
    && /llama3\.3:70b-instruct/i.test(stdout);
}

async function pythonPackageVersions() {
  const code = [
    "import importlib.metadata as md, json",
    "names=['vllm','sglang','torch','flashinfer-python','tilelang','tile-kernels','dflash','transformers']",
    "out={}",
    "for name in names:",
    "    try: out[name]=md.version(name)",
    "    except Exception as e: out[name]=None",
    "print(json.dumps(out))",
  ].join("\n");
  const result = await execProbe("python", ["-c", code], { timeout: 20000 });
  if (!result.ok) return { ok: false, packages: {}, error: result.error, stdout: result.stdout, stderr: result.stderr };
  try {
    return { ok: true, packages: JSON.parse(result.stdout || "{}"), error: null };
  } catch (error) {
    return { ok: false, packages: {}, error: error?.message || String(error), stdout: result.stdout };
  }
}

async function videoControllers() {
  if (process.platform !== "win32") return [];
  const script = [
    "$ErrorActionPreference='Stop'",
    "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion,PNPDeviceID | ConvertTo-Json -Depth 4",
  ].join("; ");
  const result = await execProbe("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 20000 });
  if (!result.ok || !String(result.stdout || "").trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

async function matchingProcesses() {
  if (process.platform !== "win32") return [];
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "$rx='sglang|vllm|ollama|llama-server|llama\\.cpp|text-generation-webui'",
    "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match $rx } | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Depth 4",
  ].join("; ");
  const result = await execProbe("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
  if (!result.ok || !String(result.stdout || "").trim()) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return (Array.isArray(parsed) ? parsed : [parsed])
      .filter((proc) => !String(proc.CommandLine || "").includes("inference-acceleration-doctor.mjs"))
      .map((proc) => ({
        pid: Number(proc.ProcessId || 0),
        name: proc.Name || "",
        command_line: compact(proc.CommandLine || "", 1400),
      }));
  } catch {
    return [];
  }
}

function httpJson(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => {
        let json = null;
        try { json = body ? JSON.parse(body) : null; } catch {}
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: res.headers,
          json,
          body: json ? null : compact(body, 1000),
        });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: "timeout" });
    });
    req.on("error", (error) => resolve({ ok: false, status: 0, error: error?.message || String(error) }));
  });
}

async function probeEndpoint(endpoint) {
  const base = endpoint.url.replace(/\/+$/, "");
  const pathSuffix = endpoint.kind === "ollama-legacy-fallback"
    ? "/api/tags"
    : endpoint.kind.startsWith("llama.cpp")
      ? "/health"
      : "/v1/models";
  const probeUrl = `${base}${pathSuffix}`;
  const result = await httpJson(probeUrl);
  return {
    ...endpoint,
    probe_url: probeUrl,
    reachable: result.ok,
    status: result.status,
    error: result.error || null,
    model_count: Array.isArray(result.json?.data)
      ? result.json.data.length
      : Array.isArray(result.json?.models)
        ? result.json.models.length
        : null,
    response_keys: result.json && typeof result.json === "object" ? Object.keys(result.json).slice(0, 10) : [],
    server: result.headers?.server || null,
  };
}

function hasAccelerationFlags(commandLine) {
  const text = String(commandLine || "").toLowerCase();
  return {
    speculative: /speculative|eagle|draft|mtp|ngram|nextn/.test(text),
    prefix_cache: /prefix[-_ ]?cach|radix/.test(text),
  };
}

function buildRequiredActions({ packages, endpoints, hardware, processes, codexaMode }) {
  const actions = [];
  const hasSglang = Boolean(packages.sglang);
  const hasVllm = Boolean(packages.vllm);
  const llamaCppMtpProcess = processes.find((proc) => /llama-server|llama\.cpp/i.test(proc.command_line) && hasAccelerationFlags(proc.command_line).speculative);
  const acceleratedEndpoint = endpoints.find((endpoint) => endpoint.reachable && !endpoint.kind.startsWith("llama.cpp") && endpoint.kind !== "ollama-legacy-fallback");
  const prefixEndpoint = endpoints.find((endpoint) => endpoint.reachable && (endpoint.kind === "sglang" || endpoint.kind === "vllm" || endpoint.kind === "accelerated-openai-compatible"));
  const hasNvidia = hardware.has_nvidia_gpu;
  const configuredAiBox = Boolean(codexaMode?.data?.config?.codexa_ip || codexaMode?.data?.config?.codexa_direct_ip || process.env.ORANGEBOX_AI_BOX_IP || process.env.ORANGEBOX_AI_BOX_DIRECT_IP);

  if (!hasSglang && !hasVllm && !llamaCppMtpProcess && !acceleratedEndpoint) {
    actions.push({
      id: "install-accelerated-runtime",
      severity: "blocker",
      required: true,
      detail: "Install SGLang or vLLM on a GPU-capable AI Box/WSL2 host, build llama.cpp with MTP support for Qwen3.6 GGUF, or expose an OpenAI-compatible accelerated endpoint via ORANGEBOX_ACCELERATED_INFERENCE_URL.",
      preferred_path: "vLLM first for baseline serving, SGLang for repeated agent prompts and RadixAttention/prefix-cache workloads, llama.cpp MTP for Qwen3.6 GGUF benchmarking.",
    });
  }
  if (!hasSglang && !hasVllm && !prefixEndpoint && !processes.some((proc) => hasAccelerationFlags(proc.command_line).prefix_cache)) {
    actions.push({
      id: "prefix-cache-lane-unproven",
      severity: "blocker",
      required: true,
      detail: "The full mandate requires a prefix/prompt caching lane. llama.cpp MTP can satisfy a speculative profile, but SGLang or vLLM-class prefix caching still needs proof.",
    });
  }
  if (!hasNvidia && !acceleratedEndpoint && !configuredAiBox) {
    actions.push({
      id: "gpu-or-ai-box-required",
      severity: "blocker",
      required: true,
      detail: "This Windows host only proves an integrated/non-NVIDIA display adapter. The mandatory lane needs a CUDA-capable host or configured remote AI Box endpoint.",
    });
  }
  if (!processes.some((proc) => {
    const flags = hasAccelerationFlags(proc.command_line);
    return flags.speculative && flags.prefix_cache;
  }) && !acceleratedEndpoint) {
    actions.push({
      id: "launch-flags-unproven",
      severity: "blocker",
      required: true,
      detail: "No running backend process proves both speculative decoding and prefix/prompt caching flags. Do not mark the upgrade green until a receipt captures those flags or endpoint metadata.",
    });
  }
  if (endpoints.some((endpoint) => endpoint.reachable && endpoint.kind === "ollama-legacy-fallback") && !acceleratedEndpoint) {
    actions.push({
      id: "ollama-is-fallback-only",
      severity: "watch",
      required: false,
      detail: "Ollama can remain a convenience fallback, but it does not satisfy the non-negotiable accelerated inference mandate by itself.",
    });
  }
  return actions;
}

function buildAdaptiveActions({ packages, endpoints, hardware, processes, codexaMode, triadStatus, aiBoxRailProbes, llamaServerWhere }) {
  const actions = [];
  const reachableLlama = endpoints.find((endpoint) => endpoint.reachable && endpoint.kind.startsWith("llama.cpp"));
  const aiBoxHosts = configuredAiBoxHosts(codexaMode);
  const aiBoxRailReachable = aiBoxRailProbes.some((probe) => probe.reachable && probe.port === 8097);
  const aiBoxOllamaProven = hasAiBoxOllamaProof(triadStatus);
  const noGpu = !hardware.has_nvidia_gpu;
  const adaptiveMode = noGpu && aiBoxHosts.length > 0;

  if (!llamaServerWhere.found) {
    actions.push({
      id: "install-llama-cpp-cpu-runtime",
      severity: "blocker",
      required: true,
      detail: "Install the managed CPU llama.cpp runtime on the command N150 so the controller has a local listener path.",
    });
  }
  if (!reachableLlama) {
    actions.push({
      id: "start-llama-cpp-listener",
      severity: "blocker",
      required: true,
      detail: "Start llama-server on the command N150 and prove /health plus /v1/models.",
    });
  }
  if (!adaptiveMode && !hardware.has_nvidia_gpu) {
    actions.push({
      id: "configure-two-device-topology",
      severity: "blocker",
      required: true,
      detail: "No local NVIDIA GPU was detected. Configure the AI Box direct/Ethernet route or add a GPU-capable inference host.",
    });
  }
  if (adaptiveMode && !aiBoxRailReachable) {
    actions.push({
      id: "ai-box-rail-not-listening",
      severity: "blocker",
      required: true,
      detail: "The AI Box is configured, but the direct command rail health endpoint did not answer.",
    });
  }
  if (adaptiveMode && !aiBoxOllamaProven) {
    actions.push({
      id: "ai-box-model-lane-unproven",
      severity: "blocker",
      required: true,
      detail: "The AI Box model lane must prove Ollama and the installed department-head models through the triad probe.",
    });
  }
  if (adaptiveMode) {
    actions.push({
      id: "gpu-acceleration-deferred-until-hardware",
      severity: "deferred",
      required: false,
      detail: "No GPU is present in the declared two-device topology. vLLM/SGLang/speculative GPU profiles stay in the benchmark queue, not the current green gate.",
    });
  }
  if (!packages.sglang && !packages.vllm && adaptiveMode) {
    actions.push({
      id: "vllm-sglang-deferred-until-gpu-or-remote-endpoint",
      severity: "deferred",
      required: false,
      detail: "SGLang/vLLM remain the upgrade target for repeated-prefix and accelerated serving once a GPU-capable endpoint exists.",
    });
  }
  if (processes.some((proc) => /llama-server/i.test(proc.name || proc.command_line || "")) && !processes.some((proc) => hasAccelerationFlags(proc.command_line).speculative)) {
    actions.push({
      id: "llama-speculation-not-enabled-on-n150",
      severity: "watch",
      required: false,
      detail: "The N150 listener is CPU-safe and intentionally not running speculative draft models. Keep speculation for benchmark-capable hardware.",
    });
  }
  return actions;
}

function buildKernelAccelerationLane({ packages, hardware, noGpuAdaptiveMode }) {
  const tilelangInstalled = Boolean(packages.tilelang);
  const tileKernelsInstalled = Boolean(packages["tile-kernels"]);
  const dflashInstalled = Boolean(packages.dflash);
  const vllmInstalled = Boolean(packages.vllm);
  const sglangInstalled = Boolean(packages.sglang);

  const recommendations = [];
  recommendations.push({
    id: "tilert",
    status: "not_orangebox_local_lane",
    decision: "Do not install TileRT into Orangebox Version 1 local/Codexa Ops by default.",
    reason: "TileRT is pinned to a full 8x NVIDIA B200 Linux node and exact CUDA/PyTorch ABI. It is not the consumer AI-box path.",
    gate: "Only reconsider if Codexa is replaced by a Linux 8x B200 node and the operator explicitly chooses that enterprise lane.",
  });
  recommendations.push({
    id: "tilelang",
    status: tilelangInstalled ? "installed_candidate" : "candidate_not_installed",
    decision: "Keep TileLang as the local kernel DSL candidate for future measured acceleration work.",
    reason: "TileLang is the practical way to experiment with tiled/pipelined kernel methods on smaller GPU setups.",
    gate: "Promotion requires a Codexa benchmark receipt proving correctness, hardware target, latency/tokens-per-second delta, and rollback.",
  });
  recommendations.push({
    id: "tilekernels",
    status: tileKernelsInstalled ? "installed_candidate" : "candidate_not_installed",
    decision: "Treat TileKernels as a narrow DeepSeek/TileLang kernel library candidate, not a universal consumer install.",
    reason: "The current public requirements are SM90/SM100 and CUDA 13.1+, so it is not automatically valid for every RTX/Windows AI box.",
    gate: "Only activate when Codexa hardware and CUDA stack match the library requirements or a verified fork supports the installed GPU.",
  });
  recommendations.push({
    id: "dflash",
    status: dflashInstalled ? "installed_candidate" : "candidate_not_installed",
    decision: "Prioritize DFlash only after vLLM or SGLang is proven on Codexa.",
    reason: "DFlash is a runtime-level speculative decoding lane with vLLM/SGLang integration, so it belongs behind measured serving benchmarks.",
    gate: "Promotion requires baseline vLLM/SGLang benchmark, DFlash benchmark, quality parity check, and STRONGARM/Mirror verification on real Orangebox prompt classes.",
  });

  const readyToBenchmark = hardware.has_nvidia_gpu && (vllmInstalled || sglangInstalled) && (dflashInstalled || tilelangInstalled || tileKernelsInstalled);
  const deferredReason = noGpuAdaptiveMode
    ? "This command host is in two-device adaptive mode. Kernel acceleration should be installed and tested on Codexa, not the N150 controller."
    : hardware.has_nvidia_gpu
      ? "No TileLang/DFlash candidate package is installed yet."
      : "No local NVIDIA GPU was detected.";

  return {
    version: "orangebox-kernel-acceleration-lane/v1",
    status: readyToBenchmark ? "KERNEL_ACCELERATION_READY_TO_BENCHMARK" : "KERNEL_ACCELERATION_CANDIDATE_DEFERRED",
    doctrine: "TileRT-style ideas enter Orangebox through measured kernels and serving benchmarks, not claims. No acceleration lane is promoted without receipts.",
    packages: {
      tilelang: packages.tilelang || null,
      tile_kernels: packages["tile-kernels"] || null,
      dflash: packages.dflash || null,
      vllm: packages.vllm || null,
      sglang: packages.sglang || null,
      torch: packages.torch || null,
    },
    claims_checked: {
      tilert_consumer_downsize_exists: false,
      tilert_default_orangebox_candidate: false,
      tilelang_consumer_gpu_candidate: true,
      tilekernels_universal_consumer_candidate: false,
      dflash_serving_candidate: true,
    },
    ready_to_benchmark: readyToBenchmark,
    deferred_reason: readyToBenchmark ? null : deferredReason,
    promotion_gate: [
      "Run on Codexa or another GPU host, not the N150 controller.",
      "Capture baseline vLLM/SGLang or llama.cpp throughput and latency.",
      "Capture accelerated TileLang/TileKernels/DFlash throughput and latency.",
      "Prove output quality does not regress on Orangebox prompt classes.",
      "Write receipt with install versions, hardware target, command lines, model ids, rollback path, and benchmark deltas.",
      "Only then update routing weights or model lane policy.",
    ],
    recommended_order: [
      "DFlash over proven vLLM/SGLang serving for immediate decode-speed experiments.",
      "TileLang microbenchmarks for custom kernel learning and future optimization lanes.",
      "TileKernels only when Codexa hardware/CUDA matches current requirements.",
      "TileRT only for an enterprise 8x B200 Linux node.",
    ],
    recommendations,
  };
}

async function writeReceipt(result) {
  await fs.mkdir(RECEIPTS_DIR, { recursive: true });
  const file = path.join(RECEIPTS_DIR, `orangebox-inference-acceleration-doctor-${stamp()}.json`);
  result.receipt_path = file;
  await fs.writeFile(file, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return file;
}

export async function runInferenceAccelerationDoctor({ writeReceipt: shouldWriteReceipt = false } = {}) {
  const startedAt = new Date().toISOString();
  const [
    nvidiaSmi,
    pythonWhere,
    vllmWhere,
    sglangWhere,
    llamaServerWhere,
    ollamaWhere,
    bunWhere,
    packageProbe,
    controllers,
    processes,
    codexaMode,
    triadStatus,
  ] = await Promise.all([
    execProbe("nvidia-smi", ["--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], { timeout: 15000 }),
    locateCommand("python"),
    locateCommand("vllm"),
    locateCommand("sglang"),
    locateCommand("llama-server"),
    locateCommand("ollama"),
    locateCommand("bun"),
    pythonPackageVersions(),
    videoControllers(),
    matchingProcesses(),
    readJsonFile(CODEXA_MODE_PATH),
    readJsonFile(TRIAD_STATUS_PATH),
  ]);

  const endpoints = await Promise.all(DEFAULT_ENDPOINTS.map((endpoint) => probeEndpoint(endpoint)));
  const aiBoxHosts = configuredAiBoxHosts(codexaMode);
  const aiBoxRailProbes = await probeAiBoxRails(aiBoxHosts);
  const sidecarTriadProbe = hasAiBoxOllamaProof(triadStatus)
    ? null
    : await httpJson(SIDECAR_TRIAD_URL, 45000);
  const effectiveTriadStatus = hasAiBoxOllamaProof(triadStatus)
    ? triadStatus
    : {
        ok: Boolean(sidecarTriadProbe?.ok && sidecarTriadProbe?.json),
        path: SIDECAR_TRIAD_URL,
        data: sidecarTriadProbe?.json || null,
        error: sidecarTriadProbe?.error || null,
      };
  const packages = packageProbe.packages || {};
  const hardware = {
    nvidia_smi_ok: nvidiaSmi.ok,
    nvidia_smi_stdout: nvidiaSmi.ok ? compact(nvidiaSmi.stdout, 1200) : "",
    nvidia_smi_error: nvidiaSmi.ok ? null : nvidiaSmi.error,
    video_controllers: controllers,
    has_nvidia_gpu: nvidiaSmi.ok || controllers.some((item) => /nvidia|rtx|geforce|quadro|tesla|ada/i.test(String(item.Name || ""))),
  };
  const processFlagSummary = processes.map((proc) => ({ pid: proc.pid, name: proc.name, ...hasAccelerationFlags(proc.command_line) }));
  const llamaCppEndpoint = endpoints.find((endpoint) => endpoint.reachable && endpoint.kind.startsWith("llama.cpp")) || null;
  const acceleratedEndpoint = endpoints.find((endpoint) => endpoint.reachable && !endpoint.kind.startsWith("llama.cpp") && endpoint.kind !== "ollama-legacy-fallback") || null;
  const llamaCppMtpProcess = processes.find((proc) => /llama-server|llama\.cpp/i.test(proc.command_line) && hasAccelerationFlags(proc.command_line).speculative) || null;
  const strictActions = buildRequiredActions({ packages, endpoints, hardware, processes, codexaMode });
  const adaptiveActions = buildAdaptiveActions({ packages, endpoints, hardware, processes, codexaMode, triadStatus: effectiveTriadStatus, aiBoxRailProbes, llamaServerWhere });
  const noGpuAdaptiveMode = !hardware.has_nvidia_gpu && aiBoxHosts.length > 0;
  const actions = noGpuAdaptiveMode ? adaptiveActions : strictActions;
  const kernelAccelerationLane = buildKernelAccelerationLane({ packages, hardware, noGpuAdaptiveMode });
  const blockers = actions.filter((action) => action.severity === "blocker");
  const installedRuntime = Boolean(packages.sglang || packages.vllm || llamaCppMtpProcess || llamaServerWhere.found || llamaCppEndpoint);
  const runningAcceleratedWithFlags = processes.some((proc) => {
    const flags = hasAccelerationFlags(proc.command_line);
    return flags.speculative && flags.prefix_cache;
  });

  const result = {
    ok: blockers.length === 0,
    version: INFERENCE_ACCELERATION_DOCTOR_VERSION,
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    policy: {
      status: noGpuAdaptiveMode ? "TWO_DEVICE_ADAPTIVE" : "MANDATORY",
      local_inference_backend: noGpuAdaptiveMode
        ? "Command N150 requires a CPU-safe llama.cpp listener plus a proven AI Box Ollama/model rail. GPU-only vLLM/SGLang profiles are deferred until suitable hardware exists."
        : "vLLM/SGLang-class backend required for production local LLM lane; llama.cpp MTP is accepted as a measured Qwen3.6 GGUF acceleration profile",
      required_features: [
        "prefix/prompt caching for repeated agent prompts and tool definitions",
        "speculative decoding or native multi-token prediction where model/backend supports it",
        "OpenAI-compatible endpoint or explicit control-plane adapter contract",
        "receipt proving launch flags, endpoint, hardware, and rollback path",
      ],
      ollama_policy: noGpuAdaptiveMode
        ? "AI Box Ollama is accepted as the current two-device model lane when proven over the rail; local N150 llama.cpp is the controller listener."
        : "fallback/watch only; not green for the mandatory acceleration lane",
      no_model_generation_calls: true,
      no_installation_attempted: true,
    },
    summary: {
      status: blockers.length
        ? (noGpuAdaptiveMode ? "BLOCKED_TWO_DEVICE_ADAPTIVE_LANE" : "BLOCKED_ACCELERATION_BACKEND_NOT_PROVEN")
        : (noGpuAdaptiveMode ? "TWO_DEVICE_ADAPTIVE_LANE_GREEN" : "ACCELERATION_BACKEND_PROVEN"),
      topology: noGpuAdaptiveMode ? "two_device_adaptive" : "single_host_or_gpu_required",
      command_host: noGpuAdaptiveMode ? "command-n150" : null,
      worker_host: noGpuAdaptiveMode ? "codexa-ai-box" : null,
      no_gpu_adaptive_mode: noGpuAdaptiveMode,
      sglang_installed: Boolean(packages.sglang),
      vllm_installed: Boolean(packages.vllm),
      llama_cpp_mtp_process_detected: Boolean(llamaCppMtpProcess),
      llama_cpp_installed: llamaServerWhere.found,
      llama_cpp_listener_reachable: endpoints.some((endpoint) => endpoint.reachable && endpoint.kind.startsWith("llama.cpp")),
      torch_installed: Boolean(packages.torch),
      nvidia_gpu_detected: hardware.has_nvidia_gpu,
      accelerated_endpoint_reachable: Boolean(acceleratedEndpoint),
      ai_box_hosts: aiBoxHosts,
      ai_box_rail_reachable: aiBoxRailProbes.some((probe) => probe.reachable),
      ai_box_ollama_proven: hasAiBoxOllamaProof(effectiveTriadStatus),
      gpu_acceleration_deferred: noGpuAdaptiveMode,
      kernel_acceleration_status: kernelAccelerationLane.status,
      tilelang_installed: Boolean(packages.tilelang),
      tile_kernels_installed: Boolean(packages["tile-kernels"]),
      dflash_installed: Boolean(packages.dflash),
      installed_runtime_available: installedRuntime,
      running_backend_with_speculative_and_prefix_flags: runningAcceleratedWithFlags,
      blocker_count: blockers.length,
      action_count: actions.length,
    },
    kernel_acceleration_lane: kernelAccelerationLane,
    binaries: {
      python: pythonWhere,
      vllm: vllmWhere,
      sglang: sglangWhere,
      llama_server: llamaServerWhere,
      ollama: ollamaWhere,
      bun: bunWhere,
    },
    python_packages: packageProbe,
    hardware,
    endpoints,
    ai_box_rails: aiBoxRailProbes,
    processes,
    process_flag_summary: processFlagSummary,
    codexa_mode: {
      path: CODEXA_MODE_PATH,
      ok: codexaMode.ok,
      data: codexaMode.ok ? codexaMode.data : null,
      error: codexaMode.ok ? null : codexaMode.error,
    },
    triad_status: {
      path: TRIAD_STATUS_PATH,
      ok: triadStatus.ok,
      route_status: triadStatus.data?.route?.status || null,
      model_probe_status: triadStatus.data?.modelProbe?.result?.status || triadStatus.data?.modelProbe?.status || null,
      ai_box_ollama_proven: hasAiBoxOllamaProof(triadStatus),
      effective_source: hasAiBoxOllamaProof(triadStatus) ? "file" : "sidecar_probe",
      effective_route_status: effectiveTriadStatus.data?.route?.status || effectiveTriadStatus.data?.status || null,
      effective_model_probe_status: effectiveTriadStatus.data?.modelProbe?.result?.status || effectiveTriadStatus.data?.modelProbe?.status || null,
      effective_ai_box_ollama_proven: hasAiBoxOllamaProof(effectiveTriadStatus),
      sidecar_probe_url: hasAiBoxOllamaProof(triadStatus) ? null : SIDECAR_TRIAD_URL,
      sidecar_probe_status: sidecarTriadProbe?.status || null,
      error: triadStatus.ok ? null : triadStatus.error,
    },
    actions_required: actions,
    blockers,
    references: [
      {
        title: "TileRT installation hard requirements",
        url: "https://github.com/tile-ai/TileRT",
      },
      {
        title: "TileLang tested devices and install",
        url: "https://github.com/tile-ai/tilelang",
      },
      {
        title: "DeepSeek TileKernels requirements",
        url: "https://github.com/deepseek-ai/TileKernels",
      },
      {
        title: "DFlash vLLM/SGLang integration",
        url: "https://github.com/z-lab/dflash",
      },
      {
        title: "vLLM Speculative Decoding",
        url: "https://docs.vllm.ai/en/v0.20.1/features/speculative_decoding/",
      },
      {
        title: "SGLang Prefix Caching",
        url: "https://sgl-project-sglang-93.mintlify.app/concepts/prefix-caching",
      },
      {
        title: "SGLang Speculative Decoding",
        url: "https://sgl-project.github.io/advanced_features/speculative_decoding.html",
      },
      {
        title: "JarvisLabs Qwen3.6 MTP with llama.cpp",
        url: "https://jarvislabs.ai/blog/qwen36-mtp-llamacpp-rtxpro6000",
      },
    ],
    rollback: {
      repo_mutation: "none",
      data_mutation: shouldWriteReceipt ? "receipt only" : "none",
      recovery_action: shouldWriteReceipt ? "Delete the generated inference-acceleration receipt if superseded by a newer proof." : "No rollback needed.",
    },
    receipt_path: null,
  };

  if (shouldWriteReceipt) await writeReceipt(result);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runInferenceAccelerationDoctor({ writeReceipt: process.argv.includes("--receipt") }).then((result) => {
    if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`[INFERENCE] ${result.summary.status}`);
      console.log(`  sglang: ${result.summary.sglang_installed ? "installed" : "missing"}`);
      console.log(`  vllm: ${result.summary.vllm_installed ? "installed" : "missing"}`);
      console.log(`  llama.cpp MTP: ${result.summary.llama_cpp_mtp_process_detected ? "running" : "missing"}`);
      console.log(`  nvidia_gpu: ${result.summary.nvidia_gpu_detected ? "yes" : "no"}`);
      console.log(`  accelerated_endpoint: ${result.summary.accelerated_endpoint_reachable ? "reachable" : "missing"}`);
      if (result.receipt_path) console.log(`  receipt: ${result.receipt_path}`);
    }
    if (!result.ok) process.exit(4);
  }).catch((error) => {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  });
}
