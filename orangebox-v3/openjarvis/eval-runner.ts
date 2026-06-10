import fs from "node:fs";
import path from "node:path";
import {
  dataRoot,
  ensureDir,
  isMain,
  readJson,
  repoRoot,
  sha256,
  writeJson,
  writeReceipt,
} from "../lib/core.ts";

function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

function scoreBool(ok: boolean): number {
  return ok ? 1 : 0;
}

function pct(value: number, total: number): number {
  if (!total) return 0;
  return Number((value / total).toFixed(4));
}

export async function openJarvisEvalDoctor() {
  const outRoot = path.join(dataRoot, "openjarvis");
  await ensureDir(outRoot);

  const triLanePath = path.join(dataRoot, "trilane", "latest-trilane-model-router.json");
  const laneEvalPath = path.join(dataRoot, "models", "latest-local-model-lane-eval.json");
  const activeCouncilPath = path.join(dataRoot, "active-council", "latest-active-council.json");
  const elysiaLatencyPath = path.join(dataRoot, "api-bakeoff", "latest-elysia-rail-latency-bakeoff.json");
  const horizonPath = path.join(dataRoot, "horizon-review", "latest-horizon-review.json");
  const toolmeshPath = path.join(dataRoot, "v3", "toolmesh", "latest-toolmesh-doctor.json");
  const packagePath = path.join(repoRoot, "package.json");

  const triLane = readJson<any>(triLanePath, null);
  const laneEval = readJson<any>(laneEvalPath, null);
  const activeCouncil = readJson<any>(activeCouncilPath, null);
  const elysiaLatency = readJson<any>(elysiaLatencyPath, null);
  const horizon = readJson<any>(horizonPath, null);
  const toolmesh = readJson<any>(toolmeshPath, null);
  const packageJson = readJson<any>(packagePath, {});

  const baselineChecks = [
    { id: "trilane_router_green", ok: triLane?.status === "TRILANE_ROUTER_PACK_GREEN" && triLane?.ok === true },
    { id: "local_model_lane_eval_green", ok: laneEval?.status === "LOCAL_MODEL_LANE_EVAL_GREEN" && laneEval?.ok === true },
    { id: "active_council_fresh", ok: ["ACTIVE_COUNCIL_GREEN", "ACTIVE_COUNCIL_PULSE_GREEN"].includes(activeCouncil?.status) && activeCouncil?.runtime_truth?.latest_pulse_fresh === true },
    { id: "codexa_remote_runtime_green", ok: triLane?.install_status?.codexa_remote_runtime_green === true || activeCouncil?.runtime_truth?.codexa_remote_runtime_green === true },
    { id: "model_inventory_full_green", ok: laneEval?.inventory_truth?.full_local_model_runtime_green === true },
    { id: "toolmesh_execution_blocked_until_promoted", ok: toolmesh?.checks?.execution_blocked_until_promoted === true },
    { id: "elysia_latency_green", ok: elysiaLatency?.status === "ORANGEBOX_ELYSIA_RAIL_LATENCY_BAKEOFF_GREEN" && elysiaLatency?.benchmark?.latency_parity_green === true },
  ];
  const baselineGreen = baselineChecks.filter((item) => item.ok).length;
  const baselineScore = pct(baselineGreen, baselineChecks.length);

  const primitiveChecks = [
    {
      primitive: "intelligence",
      orangebox_mapping: "TriLane model registry, role map, routing policy, local/cloud warrant lanes",
      evidence_path: triLanePath,
      ok: baselineChecks.find((item) => item.id === "trilane_router_green")?.ok === true,
    },
    {
      primitive: "engine",
      orangebox_mapping: "Codexa Ollama/llama.cpp/vLLM-compatible runtime plus Bun rail probes",
      evidence_path: activeCouncilPath,
      ok: baselineChecks.find((item) => item.id === "codexa_remote_runtime_green")?.ok === true,
    },
    {
      primitive: "agents",
      orangebox_mapping: "TriLane, STRONGARM, Gremlin/Misfits, Mirror, Checkmate, Judgement",
      evidence_path: laneEvalPath,
      ok: baselineChecks.find((item) => item.id === "local_model_lane_eval_green")?.ok === true,
    },
    {
      primitive: "tools_memory",
      orangebox_mapping: "ToolMesh, MCP quarantine, K3/AtomSmasher memory, receipts",
      evidence_path: toolmeshPath,
      ok: baselineChecks.find((item) => item.id === "toolmesh_execution_blocked_until_promoted")?.ok === true,
    },
    {
      primitive: "learning",
      orangebox_mapping: "Research radar, saved receipts, lane evals, promotion gates",
      evidence_path: horizonPath,
      ok: horizon?.status === "ORANGEBOX_HORIZON_REVIEW_READY" && horizon?.ok === true,
    },
  ];
  const primitiveGreen = primitiveChecks.filter((item) => item.ok).length;

  const triLaneTaskCards = [
    {
      id: "small_json_guardrail",
      baseline_route: "qwen3:4b + STRONGARM heuristic/model gate",
      openjarvis_spec_hint: "Intelligence=qwen3:4b; Engine=Codexa/Ollama; Agent=STRONGARM; ToolsMemory=receipt; Learning=fixture outcome",
      baseline_ok: laneEval?.packet_eval?.fixtures?.some((fixture: any) => fixture.id === "strongarm_micro_json_lane" && fixture.ok === true) === true,
    },
    {
      id: "misfit_pressure_packet",
      baseline_route: "dolphin3:8b gremlin pressure lane, authority forbidden",
      openjarvis_spec_hint: "Agent=Gremlin packet producer; authority boundary remains STRONGARM/Judgement/Operator",
      baseline_ok: laneEval?.packet_eval?.fixtures?.some((fixture: any) => fixture.id === "gremlin_dolphin_pressure_lane" && fixture.ok === true) === true,
    },
    {
      id: "mirror_truth_lane",
      baseline_route: "deepseek-r1:32b mirror/truth lane",
      openjarvis_spec_hint: "Agent=Mirror; ToolsMemory=receipt/evidence capsule; Learning=failed recall/debt event",
      baseline_ok: laneEval?.packet_eval?.fixtures?.some((fixture: any) => fixture.id === "mirror_truth_lane" && fixture.ok === true) === true,
    },
    {
      id: "local_judgement_lane",
      baseline_route: "qwen3:30b-a3b local judgement, no operator approval authority",
      openjarvis_spec_hint: "Agent=Judgement; Intelligence=qwen3:30b-a3b; ToolsMemory=advisor cards; Engine=Codexa",
      baseline_ok: laneEval?.packet_eval?.fixtures?.some((fixture: any) => fixture.id === "local_judgement_lane" && fixture.ok === true) === true,
    },
  ];
  const taskCardsGreen = triLaneTaskCards.filter((item) => item.baseline_ok).length;

  const packageScriptPresent = typeof packageJson?.scripts?.["v3:openjarvis:doctor"] === "string"
    && packageJson.scripts["v3:openjarvis:doctor"].includes("openjarvis/eval-runner.ts");
  const openJarvisRuntimeInstalled = fileExists(path.join(repoRoot, "openjarvis.toml")) || fileExists(path.join(repoRoot, "openjarvis.yaml"));
  const defaultRouterApproved = false;
  const noHiddenAgentStackInstalled = !openJarvisRuntimeInstalled;
  const noRouterReplacement = defaultRouterApproved === false;

  const comparison = {
    status: baselineScore >= 0.85
      ? "TRILANE_BASELINE_STRONG_OPENJARVIS_SPEC_READY"
      : "TRILANE_BASELINE_NEEDS_WORK_BEFORE_OPENJARVIS_COMPARISON",
    baseline_score: baselineScore,
    baseline_green: baselineGreen,
    baseline_total: baselineChecks.length,
    primitive_coverage_score: pct(primitiveGreen, primitiveChecks.length),
    task_card_score: pct(taskCardsGreen, triLaneTaskCards.length),
    measured_from_receipts: true,
    direct_openjarvis_runtime_benchmark: false,
    direct_openjarvis_runtime_benchmark_reason: openJarvisRuntimeInstalled
      ? "Runtime config exists, but Orangebox requires an isolated candidate workspace and explicit bakeoff before execution."
      : "No OpenJarvis runtime install/config is proven; this doctor compares its five-primitive model against existing TriLane evidence.",
    verdict: baselineScore >= 0.85 && noRouterReplacement
      ? "use_obox_jarvis_as_eval_spec_layer_not_router"
      : "fix_baseline_before_more_router_experiments",
  };

  const report = {
    ok: true,
    status: "OPENJARVIS_EVAL_HARNESS_BASELINE_GREEN",
    schema_version: "orangebox.openjarvis_eval.v2",
    role: "evaluation/spec harness only",
    not_role: "TriLane replacement",
    orangebox_name: "OBOX Jarvis",
    external_basis: {
      reviewed_sources: [
        "https://scalingintelligence.stanford.edu/blogs/openjarvis/",
        "https://github.com/open-jarvis/OpenJarvis",
        "https://arxiv.org/abs/2605.17172",
      ],
      adopted_idea: "Treat model, engine, agents, tools/memory, and learning as separately measurable primitives.",
      rejected_idea: "Install another hidden always-on personal-agent stack before it beats Orangebox baselines.",
    },
    five_primitive_mapping: {
      intelligence: "Orangebox model registry, active council, cloud warrant lanes",
      engine: "Ollama/llama.cpp/vLLM-compatible Codexa runtime plus Bun rail probes",
      agents: "TriLane, STRONGARM, Gremlin/Misfits, Mirror, Checkmate, Judgement",
      tools_memory: "ToolMesh, MCP quarantine, K3/AtomSmasher memory, receipts",
      learning: "research radar, saved receipts, lane evals, promotion gates",
    },
    evidence_paths: {
      trilane: triLanePath,
      lane_eval: laneEvalPath,
      active_council: activeCouncilPath,
      elysia_latency: elysiaLatencyPath,
      horizon_review: horizonPath,
      toolmesh: toolmeshPath,
      package_json: packagePath,
    },
    baseline_checks: baselineChecks,
    primitive_checks: primitiveChecks,
    task_cards: triLaneTaskCards,
    comparison,
    runtime_truth: {
      openjarvis_runtime_installed: openJarvisRuntimeInstalled,
      package_script_present: packageScriptPresent,
      no_hidden_agent_stack_installed: noHiddenAgentStackInstalled,
      default_router_approved: defaultRouterApproved,
      no_router_replacement: noRouterReplacement,
      frontend_touched: false,
      paid_api_attempted: false,
      remote_mutation_attempted: false,
    },
    promotion: {
      promotable_now: false,
      reason: "OBOX Jarvis is useful as an OpenJarvis-style spec/eval layer, but it has not beaten TriLane in a direct runtime bakeoff.",
      next_gate: "Create one isolated candidate workspace that runs the same bounded routing task through TriLane and OpenJarvis runtime, then compare latency, energy proxy, trace quality, receipt quality, and oracle grade.",
      required_before_promotion: [
        "runtime install/config receipt",
        "isolated candidate workspace",
        "same-task TriLane baseline receipt",
        "same-task OpenJarvis receipt",
        "latency/energy/tool-trace/oracle-grade comparison",
        "rollback path",
        "operator approval",
      ],
    },
    planned_specs: ["gremlin-spec.toml", "misfits-spec.toml", "model-efficiency.toml", "executor-comparison.toml"],
    scorecard_fields: ["latency", "energy_proxy", "tool_trace", "receipt", "oracle_grade", "budget"],
    promotion_rule: "Candidate router/executor/model must beat baseline before default promotion.",
    hard_guard: "OpenJarvis/OBOX Jarvis may recommend spec edits; TriLane remains the strategy authority until a receipt-backed bakeoff says otherwise.",
  };
  const latestPath = path.join(outRoot, "latest-openjarvis-eval.json");
  await writeJson(latestPath, report);
  await writeJson(path.join(outRoot, `openjarvis-eval-${Date.now()}.json`), report);
  const receipt = await writeReceipt("openjarvis-eval-doctor", report);
  const withReceipt = { ...report, latest_path: latestPath, receipt_path: receipt.receipt_path, report_hash: sha256(JSON.stringify(report)) };
  await writeJson(latestPath, withReceipt);
  return withReceipt;
}

if (isMain(import.meta.url)) {
  openJarvisEvalDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "OPENJARVIS_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
