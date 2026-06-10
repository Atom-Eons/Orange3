import { isMain, writeReceipt } from "../lib/core.ts";

export async function openJarvisEvalDoctor() {
  const report = {
    ok: true,
    status: "OPENJARVIS_EVAL_HARNESS_CONTRACT_READY",
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
    planned_specs: ["gremlin-spec.toml", "misfits-spec.toml", "model-efficiency.toml", "executor-comparison.toml"],
    scorecard_fields: ["latency", "energy_proxy", "tool_trace", "receipt", "oracle_grade", "budget"],
    promotion_rule: "Candidate router/executor/model must beat baseline before default promotion.",
    hard_guard: "OpenJarvis/OBOX Jarvis may recommend spec edits; TriLane remains the strategy authority until a receipt-backed bakeoff says otherwise.",
  };
  const receipt = await writeReceipt("openjarvis-eval-doctor", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  openJarvisEvalDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "OPENJARVIS_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
