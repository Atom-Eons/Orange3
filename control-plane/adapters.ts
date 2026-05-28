import type { Step } from "./engine.ts";

export type AdapterLane = "mock" | "subscription_cli" | "local_endpoint" | "disabled";
export type AdapterStatus = "READY" | "PLANNED" | "MISSING" | "DISABLED";

export interface NodeExecutionRequest {
  orderId: string;
  stepId: string;
  step: Step;
  explicitContext: string;
  attempt: number;
  mockMode: boolean;
}

export interface NodeExecutionResult {
  ok: boolean;
  adapter_id: string;
  lane: AdapterLane;
  output?: string;
  error?: string;
}

export interface AdapterDoctorResult {
  adapter_id: string;
  label: string;
  lane: AdapterLane;
  status: AdapterStatus;
  executable?: string;
  endpoint?: string;
  nodes: string[];
  notes: string[];
}

export interface NodeAdapter {
  id: string;
  label: string;
  lane: AdapterLane;
  nodes: string[];
  matches(node: string): boolean;
  execute(request: NodeExecutionRequest): Promise<NodeExecutionResult>;
  doctor(): Promise<AdapterDoctorResult>;
}

interface JsonProbeResult {
  ok: boolean;
  status: number;
  ms: number;
  json?: any;
  body?: string;
  error?: string;
}

function hash(value: string) {
  return String(Bun.hash(value));
}

function nodeMatches(node: string, patterns: string[]) {
  const lower = String(node || "").toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.endsWith("*")) return lower.startsWith(pattern.slice(0, -1).toLowerCase());
    return lower === pattern.toLowerCase();
  });
}

export function mockOutputForSchema(request: NodeExecutionRequest) {
  const contextHash = hash(request.explicitContext);
  const base = {
    ok: true,
    step_id: request.stepId,
    node: request.step.assigned_node,
    schema: request.step.output_schema,
    context_hash: contextHash,
    adapter_id: "mock-local-deterministic",
    mock_mode: true,
  };
  if (request.step.output_schema === "ReactComponentStrict") {
    return JSON.stringify({
      ...base,
      componentName: "OrangeboxMockPanel",
      tsx: "export function OrangeboxMockPanel(){return <aside data-obx-control-plane=\"mock\" />;}",
    });
  }
  if (request.step.output_schema === "LuminanceReport") {
    return JSON.stringify({ ...base, passed: true, validation_hash: contextHash });
  }
  if (request.step.output_schema === "TerminalTrace") {
    return JSON.stringify({ ...base, exit_code: 0, stdout: "mock execution disabled", stderr: "", mutation: false });
  }
  if (request.step.output_schema === "DeadlockHint") {
    return JSON.stringify({ ...base, hint: "Reduce context and retry with deterministic validator output attached." });
  }
  return JSON.stringify(base);
}

class MockAdapter implements NodeAdapter {
  id = "mock-local-deterministic";
  label = "Mock deterministic local adapter";
  lane: AdapterLane = "mock";
  nodes = ["*"];

  matches() {
    return true;
  }

  async execute(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    return {
      ok: true,
      adapter_id: this.id,
      lane: this.lane,
      output: mockOutputForSchema(request),
    };
  }

  async doctor(): Promise<AdapterDoctorResult> {
    return {
      adapter_id: this.id,
      label: this.label,
      lane: this.lane,
      status: "READY",
      nodes: this.nodes,
      notes: ["Always available. Used by default until real node bindings are explicitly enabled."],
    };
  }
}

class PlannedAdapter implements NodeAdapter {
  constructor(
    public id: string,
    public label: string,
    public lane: AdapterLane,
    public nodes: string[],
    private probe: () => Promise<Pick<AdapterDoctorResult, "status" | "executable" | "endpoint" | "notes">>,
  ) {}

  matches(node: string) {
    return nodeMatches(node, this.nodes);
  }

  async execute(): Promise<NodeExecutionResult> {
    return {
      ok: false,
      adapter_id: this.id,
      lane: this.lane,
      error: `${this.label} execution is planned but not wired into the deterministic control plane yet.`,
    };
  }

  async doctor(): Promise<AdapterDoctorResult> {
    const probe = await this.probe();
    return {
      adapter_id: this.id,
      label: this.label,
      lane: this.lane,
      status: probe.status,
      executable: probe.executable,
      endpoint: probe.endpoint,
      nodes: this.nodes,
      notes: probe.notes,
    };
  }
}

class DisabledAdapter implements NodeAdapter {
  id = "real-node-bindings-disabled";
  label = "Real node bindings disabled";
  lane: AdapterLane = "disabled";
  nodes = ["*"];

  matches() {
    return true;
  }

  async execute(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    return {
      ok: false,
      adapter_id: this.id,
      lane: this.lane,
      error: `Real node binding is not enabled for ${request.step.assigned_node}.`,
    };
  }

  async doctor(): Promise<AdapterDoctorResult> {
    return {
      adapter_id: this.id,
      label: this.label,
      lane: this.lane,
      status: "DISABLED",
      nodes: this.nodes,
      notes: ["Set ORANGEBOX_CONTROL_PLANE_REAL_NODES=1 only after adapter validators and write gates are installed."],
    };
  }
}

async function commandProbe(command: string, aliases: string[] = []) {
  const names = [command, ...aliases];
  if (process.platform === "win32") {
    for (const name of names) {
      const ps = [
        "$ErrorActionPreference='SilentlyContinue'",
        `$cmd = Get-Command '${name.replace(/'/g, "''")}'`,
        "if ($cmd) { $cmd.Source }",
      ].join("; ");
      const result = Bun.spawnSync({
        cmd: ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        stdout: "pipe",
        stderr: "pipe",
      });
      const source = new TextDecoder().decode(result.stdout).trim();
      if (result.exitCode === 0 && source) return source;
    }
    return null;
  }

  for (const name of names) {
    const result = Bun.spawnSync({ cmd: ["which", name], stdout: "pipe", stderr: "pipe" });
    const source = new TextDecoder().decode(result.stdout).trim();
    if (result.exitCode === 0 && source) return source;
  }
  return null;
}

async function endpointProbe(url: string, timeoutMs = 1500) {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ready: response.ok,
      code: response.status,
      ms: Math.round(performance.now() - started),
    };
  } catch (error) {
    return {
      ready: false,
      code: 0,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonProbe(url: string, init: RequestInit = {}, timeoutMs = 5000): Promise<JsonProbeResult> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - started),
      ...(json ? { json } : { body: text.slice(0, 1200) }),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      ms: Math.round(performance.now() - started),
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function terminalTraceOutput(payload: {
  exit_code: number;
  stdout: unknown;
  stderr?: string;
  adapter_id: string;
  mutation?: boolean;
}) {
  return JSON.stringify({
    exit_code: payload.exit_code,
    stdout: typeof payload.stdout === "string" ? payload.stdout : JSON.stringify(payload.stdout, null, 2),
    stderr: payload.stderr || "",
    adapter_id: payload.adapter_id,
    mutation: payload.mutation === true,
  });
}

class LocalLlamaCppListenerAdapter implements NodeAdapter {
  id = "local-llama-cpp-listener";
  label = "Local llama.cpp CPU listener";
  lane: AdapterLane = "local_endpoint";
  nodes = ["llama.cpp*", "llama-cpp*", "local_llama*", "local-llama*", "orangebox-n150-cpu-listener"];

  constructor(private baseUrl = Bun.env.LLAMA_CPP_BASE_URL || "http://127.0.0.1:8080") {}

  matches(node: string) {
    return nodeMatches(node, this.nodes);
  }

  async execute(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    if (request.step.output_schema !== "TerminalTrace") {
      return {
        ok: false,
        adapter_id: this.id,
        lane: this.lane,
        error: `${this.label} is wired only for TerminalTrace health/model-list proof in v0.3.`,
      };
    }
    const base = this.baseUrl.replace(/\/+$/, "");
    const [health, models] = await Promise.all([
      jsonProbe(`${base}/health`, {}, 5000),
      jsonProbe(`${base}/v1/models`, {}, 8000),
    ]);
    if (!health.ok || !models.ok) {
      return {
        ok: false,
        adapter_id: this.id,
        lane: this.lane,
        error: `llama.cpp listener proof failed: health=${health.status || health.error}; models=${models.status || models.error}`,
      };
    }
    const modelIds = Array.isArray(models.json?.data)
      ? models.json.data.map((item: any) => item.id || item.model || item.name).filter(Boolean)
      : Array.isArray(models.json?.models)
        ? models.json.models.map((item: any) => item.model || item.name).filter(Boolean)
        : [];
    return {
      ok: true,
      adapter_id: this.id,
      lane: this.lane,
      output: terminalTraceOutput({
        exit_code: 0,
        adapter_id: this.id,
        mutation: false,
        stdout: {
          endpoint: base,
          health: health.json || health.body,
          model_count: modelIds.length,
          model_ids: modelIds,
          no_model_generation_call: true,
          no_gpu_required: true,
          request_context_hash: hash(request.explicitContext),
        },
      }),
    };
  }

  async doctor(): Promise<AdapterDoctorResult> {
    const base = this.baseUrl.replace(/\/+$/, "");
    const health = await jsonProbe(`${base}/health`, {}, 1800);
    const models = health.ok ? await jsonProbe(`${base}/v1/models`, {}, 2500) : null;
    return {
      adapter_id: this.id,
      label: this.label,
      lane: this.lane,
      status: health.ok && models?.ok ? "READY" : "MISSING",
      endpoint: base,
      nodes: this.nodes,
      notes: health.ok && models?.ok
        ? [`llama.cpp listener is reachable; /health ${health.status} in ${health.ms}ms and /v1/models ${models.status} in ${models.ms}ms. Real execution is health/model-list proof only.`]
        : [`llama.cpp listener missing or unhealthy at ${base}; health=${health.status || health.error}.`],
    };
  }
}

class AiBoxTriadReadOnlyAdapter implements NodeAdapter {
  id = "ai-box-triad-readonly";
  label = "AI Box triad read-only model proof";
  lane: AdapterLane = "local_endpoint";
  nodes = ["ai-box-readonly", "ai-box-model-probe", "ai-box-ollama-probe", "ollama-readonly"];

  constructor(private sidecarUrl = Bun.env.ORANGEBOX_CONTROL_PLANE_SIDECAR_URL || "http://127.0.0.1:8787") {}

  matches(node: string) {
    return nodeMatches(node, this.nodes);
  }

  async execute(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    if (request.step.output_schema !== "TerminalTrace") {
      return {
        ok: false,
        adapter_id: this.id,
        lane: this.lane,
        error: `${this.label} is wired only for TerminalTrace proof in v0.3.`,
      };
    }
    const base = this.sidecarUrl.replace(/\/+$/, "");
    const probe = await jsonProbe(`${base}/api/triad?project=orangebox&probe=1`, {}, 45000);
    const stdout = String(probe.json?.modelProbe?.result?.response?.stdout || "");
    const routeStatus = probe.json?.route?.status || probe.json?.status || null;
    const modelProbeStatus = probe.json?.modelProbe?.result?.status || probe.json?.modelProbe?.status || null;
    const proven = probe.ok && /ollama version/i.test(stdout) && /qwen2\.5-coder:32b-instruct/i.test(stdout);
    if (!proven) {
      return {
        ok: false,
        adapter_id: this.id,
        lane: this.lane,
        error: `AI Box triad proof failed: http=${probe.status || probe.error}; route=${routeStatus}; modelProbe=${modelProbeStatus}.`,
      };
    }
    return {
      ok: true,
      adapter_id: this.id,
      lane: this.lane,
      output: terminalTraceOutput({
        exit_code: 0,
        adapter_id: this.id,
        mutation: false,
        stdout: {
          endpoint: `${base}/api/triad?project=orangebox&probe=1`,
          route_status: routeStatus,
          model_probe_status: modelProbeStatus,
          ai_box_hosts: [probe.json?.route?.directIp, probe.json?.route?.ethernetIp].filter(Boolean),
          stdout,
          no_repository_write: true,
          read_only_probe: true,
          request_context_hash: hash(request.explicitContext),
        },
      }),
    };
  }

  async doctor(): Promise<AdapterDoctorResult> {
    const base = this.sidecarUrl.replace(/\/+$/, "");
    const probe = await jsonProbe(`${base}/api/triad?project=orangebox`, {}, 4000);
    const routeStatus = probe.json?.route?.status || probe.json?.status || null;
    return {
      adapter_id: this.id,
      label: this.label,
      lane: this.lane,
      status: probe.ok && routeStatus === "VERIFIED" ? "READY" : "MISSING",
      endpoint: `${base}/api/triad`,
      nodes: this.nodes,
      notes: probe.ok
        ? [`Sidecar triad route responded in ${probe.ms}ms with route=${routeStatus}. Execution path uses probe=1 and returns TerminalTrace only.`]
        : [`Sidecar triad route is not reachable at ${base}; ${probe.error || probe.status}.`],
    };
  }
}

class AiBoxAllowlistedCommandAdapter implements NodeAdapter {
  id = "ai-box-allowlisted-command";
  label = "AI Box allowlisted command contract";
  lane: AdapterLane = "local_endpoint";
  nodes = ["ai-box-command-proof", "ai-box-readonly-command", "ai-box-runtime-proof", "ai-box-worker-proof"];

  constructor(private sidecarUrl = Bun.env.ORANGEBOX_CONTROL_PLANE_SIDECAR_URL || "http://127.0.0.1:8787") {}

  matches(node: string) {
    return nodeMatches(node, this.nodes);
  }

  private contractFor(request: NodeExecutionRequest) {
    const selector = `${request.step.task_type} ${request.step.assigned_node}`.toLowerCase();
    if (selector.includes("ollama")) {
      return {
        id: "ai_box_ollama_inventory_readonly",
        command: [
          "$ErrorActionPreference = 'Continue'",
          "hostname",
          "ollama --version",
          "ollama list",
          "ollama ps",
        ].join("; "),
        cwd: "C:/AtomEons",
        timeoutMs: 45000,
        evidence: [/ollama version/i, /NAME\s+ID\s+SIZE/i],
      };
    }
    return {
      id: "ai_box_runtime_identity_readonly",
      command: "hostname; whoami; Get-Date",
      cwd: "C:/AtomEons",
      timeoutMs: 30000,
      evidence: [/AI Box/i, /\\|AI Box\\atom|AI Box\\\\atom|atom/i],
    };
  }

  async execute(request: NodeExecutionRequest): Promise<NodeExecutionResult> {
    if (request.step.output_schema !== "TerminalTrace") {
      return {
        ok: false,
        adapter_id: this.id,
        lane: this.lane,
        error: `${this.label} is wired only for TerminalTrace proof in v0.4.`,
      };
    }
    const contract = this.contractFor(request);
    const base = this.sidecarUrl.replace(/\/+$/, "");
    const probe = await jsonProbe(`${base}/api/codexa/command`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        shell: "powershell",
        cwd: contract.cwd,
        command: contract.command,
        timeoutMs: contract.timeoutMs,
        checkmateLevel: "light",
      }),
    }, contract.timeoutMs + 15000);
    const stdout = String(probe.json?.result?.response?.stdout || "");
    const stderr = String(probe.json?.result?.response?.stderr || "");
    const checkmateStatus = probe.json?.checkmateGate?.status || null;
    const commandStatus = probe.json?.status || null;
    const railStatus = probe.json?.result?.response?.status || probe.json?.result?.status || null;
    const evidenceOk = contract.evidence.every((pattern) => pattern.test(stdout));
    const verified = probe.ok && commandStatus === "VERIFIED" && railStatus === "VERIFIED" && evidenceOk;
    if (!verified) {
      return {
        ok: false,
        adapter_id: this.id,
        lane: this.lane,
        error: `AI Box allowlisted command failed: http=${probe.status || probe.error}; command=${commandStatus}; rail=${railStatus}; checkmate=${checkmateStatus}; evidence=${evidenceOk}.`,
      };
    }
    return {
      ok: true,
      adapter_id: this.id,
      lane: this.lane,
      output: terminalTraceOutput({
        exit_code: Number(probe.json?.result?.response?.exitCode ?? 0),
        adapter_id: this.id,
        mutation: false,
        stdout: {
          endpoint: `${base}/api/codexa/command`,
          contract_id: contract.id,
          command_hash: probe.json?.result?.response?.commandHash || null,
          sidecar_status: commandStatus,
          rail_status: railStatus,
          checkmate_status: checkmateStatus,
          ai_box_receipt_path: probe.json?.result?.response?.receiptPath || null,
          controller_artifact_path: probe.json?.checkmateGate?.artifactPath || null,
          controller_gate_receipt_path: probe.json?.checkmateGate?.receiptPath || null,
          stdout,
          stderr,
          read_only_contract: true,
          arbitrary_command_allowed: false,
          repository_mutation: false,
          remote_receipt_written: true,
          request_context_hash: hash(request.explicitContext),
        },
      }),
    };
  }

  async doctor(): Promise<AdapterDoctorResult> {
    const base = this.sidecarUrl.replace(/\/+$/, "");
    const probe = await jsonProbe(`${base}/api/status?fast=1`, {}, 5000);
    const ready = probe.ok && probe.json?.commandRail?.auth?.command_execution_ready === true;
    const url = probe.json?.commandRail?.url || `${base}/api/codexa/command`;
    return {
      adapter_id: this.id,
      label: this.label,
      lane: this.lane,
      status: ready ? "READY" : "MISSING",
      endpoint: url,
      nodes: this.nodes,
      notes: ready
        ? [`Sidecar reports AI Box command execution ready. Runtime execution is fixed to read-only command contracts and Checkmate light receipts.`]
        : [`AI Box command execution is not ready through sidecar status; ${probe.error || probe.status}.`],
    };
  }
}

export class AdapterRegistry {
  constructor(
    private realAdapters: NodeAdapter[],
    private mockAdapter: NodeAdapter = new MockAdapter(),
    private disabledAdapter: NodeAdapter = new DisabledAdapter(),
  ) {}

  resolve(node: string, mockMode: boolean) {
    if (mockMode) return this.mockAdapter;
    return this.realAdapters.find((adapter) => adapter.matches(node)) || this.disabledAdapter;
  }

  async doctor() {
    const adapters = [this.mockAdapter, ...this.realAdapters, this.disabledAdapter];
    const results = [];
    for (const adapter of adapters) results.push(await adapter.doctor());
    return results;
  }
}

export function createDefaultAdapterRegistry() {
  const aiBoxDirectIp = Bun.env.ORANGEBOX_AI_BOX_DIRECT_IP || "10.0.99.1";
  return new AdapterRegistry([
    new LocalLlamaCppListenerAdapter(),
    new AiBoxTriadReadOnlyAdapter(),
    new AiBoxAllowlistedCommandAdapter(),
    new PlannedAdapter(
      "claude-code-subscription",
      "Claude Code subscription CLI",
      "subscription_cli",
      ["claude-code", "opus*", "claude*"],
      async () => {
        const executable = await commandProbe("claude");
        return {
          status: executable ? "PLANNED" : "MISSING",
          executable: executable || undefined,
          notes: executable
            ? ["CLI detected. Execution remains disabled until subscription-safe prompt/file gates are installed."]
            : ["Claude Code CLI was not found on PATH."],
        };
      },
    ),
    new PlannedAdapter(
      "openai-codex-subscription",
      "OpenAI Codex subscription CLI",
      "subscription_cli",
      ["codex", "openai-codex", "codex-cli"],
      async () => {
        const executable = await commandProbe("codex");
        return {
          status: executable ? "PLANNED" : "MISSING",
          executable: executable || undefined,
          notes: executable
            ? ["CLI detected. Execution remains disabled until worktree and patch gates are installed."]
            : ["Codex CLI was not found on PATH."],
        };
      },
    ),
    new PlannedAdapter(
      "google-agy-antigravity",
      "Google AGY / Antigravity CLI",
      "subscription_cli",
      ["agy", "agy-cli", "antigravity", "gemini*", "gemini_contrarian*"],
      async () => {
        const executable = await commandProbe("agy", ["antigravity", "gemini"]);
        return {
          status: executable ? "PLANNED" : "MISSING",
          executable: executable || undefined,
          notes: executable
            ? ["CLI detected. Execution remains disabled until model selector and contrarian prompt gates are installed."]
            : ["AGY, Antigravity, and Gemini CLIs were not found on PATH."],
        };
      },
    ),
    new PlannedAdapter(
      "ai-box-command-rail",
      "AI Box command rail and local model bridge",
      "local_endpoint",
      ["qwen*", "qwen3*", "qwen2.5*", "ai-box*", "ollama*", "pod-alpha-swarm", "bonsai*"],
      async () => {
        const endpoint = `http://${aiBoxDirectIp}:8097/health`;
        const probe = await endpointProbe(endpoint);
        return {
          status: probe.ready ? "PLANNED" : "MISSING",
          endpoint,
          notes: probe.ready
            ? [`Health endpoint reachable in ${probe.ms}ms. Execution remains disabled until command allowlists and receipt gates are installed.`]
            : [`Health endpoint not reachable for no-token probe. HTTP ${probe.code}.`],
        };
      },
    ),
  ]);
}

export async function runAdapterDoctor() {
  const registry = createDefaultAdapterRegistry();
  const adapters = await registry.doctor();
  const ready = adapters.filter((adapter) => adapter.status === "READY").length;
  const planned = adapters.filter((adapter) => adapter.status === "PLANNED").length;
  const missing = adapters.filter((adapter) => adapter.status === "MISSING").length;
  const disabled = adapters.filter((adapter) => adapter.status === "DISABLED").length;
  return {
    ok: ready >= 1 && disabled >= 1,
    version: "orangebox-control-plane-adapter-doctor/v0.4",
    project: "ORANGEBOX",
    created_at: new Date().toISOString(),
    no_token_calls: true,
    real_execution_enabled: Bun.env.ORANGEBOX_CONTROL_PLANE_REAL_NODES === "1",
    summary: {
      adapters: adapters.length,
      ready,
      planned,
      missing,
      disabled,
    },
    adapters,
    next_action: "Next adapter expansion is schema-specific validators and model-generation micro-smoke; subscription CLI execution stays planned until worktree and write gates are installed.",
  };
}
