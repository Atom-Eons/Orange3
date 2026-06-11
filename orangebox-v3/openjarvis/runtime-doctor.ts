import fs from "node:fs";
import path from "node:path";
import {
  dataRoot,
  ensureDir,
  isMain,
  repoRoot,
  run,
  sha256,
  writeJson,
  writeReceipt,
} from "../lib/core.ts";

type Probe = {
  kind: string;
  id: string;
  found: boolean;
  path?: string | null;
  ok?: boolean;
  exit_code?: number | null;
  sample?: string | null;
};

async function whereFirst(binary: string): Promise<string | null> {
  const result = await run("where.exe", [binary], { timeoutMs: 5000 });
  if (!result.ok) return null;
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || null;
}

function existingConfigCandidates(): Probe[] {
  const candidates = [
    "openjarvis.toml",
    "openjarvis.yaml",
    "openjarvis.yml",
    path.join("orangebox-v3", "openjarvis", "openjarvis.toml"),
    path.join("orangebox-v3", "openjarvis", "openjarvis.yaml"),
  ];
  return candidates.map((relative) => {
    const full = path.join(repoRoot, relative);
    return {
      kind: "config",
      id: relative.replace(/\\/g, "/"),
      found: fs.existsSync(full),
      path: full,
    };
  });
}

async function binaryProbe(binary: string): Promise<Probe> {
  const foundPath = await whereFirst(binary);
  if (!foundPath) return { kind: "binary", id: binary, found: false, path: null };
  const help = await run(foundPath, ["--help"], { timeoutMs: 15_000 });
  return {
    kind: "binary",
    id: binary,
    found: true,
    path: foundPath,
    ok: help.ok,
    exit_code: help.exit_code,
    sample: `${help.stdout}\n${help.stderr}`.slice(0, 800),
  };
}

async function pythonImportProbe(): Promise<Probe> {
  const python = await whereFirst("python") || await whereFirst("py");
  if (!python) return { kind: "python_module", id: "openjarvis", found: false, path: null };
  const probe = await run(python, ["-c", "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('openjarvis') else 3)"], { timeoutMs: 15_000 });
  return {
    kind: "python_module",
    id: "openjarvis",
    found: probe.ok,
    path: python,
    ok: probe.ok,
    exit_code: probe.exit_code,
    sample: `${probe.stdout}\n${probe.stderr}`.slice(0, 800),
  };
}

export async function openJarvisRuntimeDoctor() {
  const outRoot = path.join(dataRoot, "openjarvis", "runtime");
  const candidateRoot = path.join(dataRoot, "openjarvis", "runtime-candidate", "same-task-bakeoff");
  await ensureDir(outRoot);
  await ensureDir(candidateRoot);

  const configProbes = existingConfigCandidates();
  const binaryProbes = await Promise.all(["openjarvis", "oj", "jarvis"].map(binaryProbe));
  const pythonProbe = await pythonImportProbe();
  const probes = [...configProbes, ...binaryProbes, pythonProbe];
  const configFound = configProbes.some((probe) => probe.found);
  const binaryFound = binaryProbes.some((probe) => probe.found);
  const binaryHelpOk = binaryProbes.some((probe) => probe.found && probe.ok);
  const pythonModuleFound = pythonProbe.found === true;
  const runtimeFound = configFound || binaryFound || pythonModuleFound;

  const triLaneBaselinePath = path.join(dataRoot, "models", "latest-local-model-lane-eval.json");
  const openJarvisEvalPath = path.join(dataRoot, "openjarvis", "latest-openjarvis-eval.json");
  const strongarmPath = path.join(dataRoot, "strongarm", "latest-strongarm-doctor.json");
  const checkmatePath = path.join(dataRoot, "checkmate", "latest-checkmate-eval-lane.json");

  const sameTaskBakeoffManifest = {
    schema_version: "orangebox.openjarvis.same_task_bakeoff_manifest.v1",
    task_id: "obox-jarvis-same-task-routing-proof",
    created_at: new Date().toISOString(),
    candidate_workspace: candidateRoot,
    objective: "Compare existing TriLane routing against an OpenJarvis runtime candidate on the same bounded task before any router promotion.",
    bounded_task: {
      user_request: "Route this small Orangebox Ops request to the correct lane and return one JSON decision card.",
      required_output_shape: ["selected_lane", "model_or_agent", "why", "receipts_needed", "human_approval_required"],
      forbidden_actions: ["repo mutation", "frontend edit", "provider config mutation", "paid API call", "deployment", "startup registration"],
    },
    baseline_inputs: {
      trilane_receipt: triLaneBaselinePath,
      openjarvis_eval_receipt: openJarvisEvalPath,
      strongarm_receipt: strongarmPath,
      checkmate_receipt: checkmatePath,
    },
    metrics: ["latency_ms", "energy_proxy", "tool_trace_quality", "receipt_quality", "oracle_grade", "rollback_quality"],
    pass_gate: [
      "TriLane baseline receipt exists and is green",
      "OpenJarvis runtime receipt exists",
      "Both runners receive the same task input",
      "No repo/frontend/provider/startup mutation occurs",
      "STRONGARM and Checkmate receipts are cited",
      "OpenJarvis beats or explains baseline without losing authority boundaries",
      "Operator approval is recorded before promotion",
    ],
  };
  const manifestPath = path.join(candidateRoot, "same-task-bakeoff-manifest.json");
  await writeJson(manifestPath, sameTaskBakeoffManifest);

  const candidateSpec = {
    schema_version: "orangebox.obox_jarvis_candidate_spec.v1",
    name: "OBOX Jarvis candidate runtime spec",
    role: "efficiency/runtime candidate only",
    not_role: "TriLane replacement or hidden router",
    primitives: {
      intelligence: "Orangebox model registry and active council",
      engine: "Codexa/Ollama/Bun runtime rail",
      agents: "STRONGARM, Gremlin/Misfits, Mirror, Checkmate, Judgement",
      tools_memory: "ToolMesh, K3/AtomSmasher memory, receipts",
      learning: "research radar, saved receipts, promotion gates",
    },
    authority_boundary: "TriLane remains strategy authority until a same-task bakeoff beats baseline and operator approval is recorded.",
  };
  const candidateSpecPath = path.join(candidateRoot, "obox-jarvis-candidate-spec.json");
  await writeJson(candidateSpecPath, candidateSpec);

  const status = runtimeFound
    ? binaryFound
      ? "OBOX_JARVIS_RUNTIME_BINARY_FOUND_GATED"
      : "OBOX_JARVIS_RUNTIME_CONFIG_OR_MODULE_FOUND_GATED"
    : "OBOX_JARVIS_RUNTIME_NOT_INSTALLED_GATED";

  const report = {
    ok: true,
    status,
    schema_version: "orangebox.openjarvis_runtime.v1",
    checked_at: new Date().toISOString(),
    orangebox_name: "OBOX Jarvis",
    role: "runtime reality gate and same-task bakeoff staging",
    not_role: "installed default router",
    runtime_truth: {
      runtime_found: runtimeFound,
      config_found: configFound,
      binary_found: binaryFound,
      binary_help_ok: binaryHelpOk,
      python_module_found: pythonModuleFound,
      live_runtime_execution_attempted: false,
      direct_runtime_bakeoff_completed: false,
      default_router_promoted: false,
      provider_config_mutated: false,
      startup_registered: false,
    },
    probes,
    same_task_bakeoff: {
      manifest_ready: true,
      manifest_path: manifestPath,
      manifest_sha256: sha256(JSON.stringify(sameTaskBakeoffManifest)),
      candidate_workspace: candidateRoot,
      candidate_spec_path: candidateSpecPath,
      candidate_spec_sha256: sha256(JSON.stringify(candidateSpec)),
      baseline_receipts_required: sameTaskBakeoffManifest.baseline_inputs,
      metrics: sameTaskBakeoffManifest.metrics,
    },
    constraints: {
      frontend_touched: false,
      repo_mutated_by_openjarvis: false,
      provider_config_mutated: false,
      paid_api_attempted: false,
      live_runtime_execution_attempted: false,
      default_router_promoted: false,
      hidden_startup_registered: false,
    },
    promotion: {
      promotable_now: false,
      reason: runtimeFound
        ? "A runtime/config surface may exist, but Orangebox still requires the same-task bakeoff before any router or executor promotion."
        : "No OpenJarvis runtime/config/module is proven on this machine. OBOX Jarvis remains an eval/spec layer plus staged bakeoff manifest.",
      next_gate: "Run one same-task TriLane-vs-OpenJarvis runtime bakeoff in the isolated candidate workspace, then compare latency, energy proxy, trace quality, receipt quality, oracle grade, rollback, and authority preservation.",
    },
    rollback: {
      data_mutation: outRoot,
      candidate_workspace: candidateRoot,
      recovery_action: "Delete generated OpenJarvis runtime receipts/candidate manifests if superseded; no repo/frontend/provider/startup mutation was performed.",
    },
  };

  const latestPath = path.join(outRoot, "latest-openjarvis-runtime.json");
  await writeJson(latestPath, report);
  const receipt = await writeReceipt("openjarvis-runtime-doctor", report);
  const withReceipt = { ...report, latest_path: latestPath, receipt_path: receipt.receipt_path, report_hash: sha256(JSON.stringify(report)) };
  await writeJson(latestPath, withReceipt);
  return withReceipt;
}

if (isMain(import.meta.url)) {
  openJarvisRuntimeDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "OBOX_JARVIS_RUNTIME_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
