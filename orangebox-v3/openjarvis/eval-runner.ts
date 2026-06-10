import { isMain, writeReceipt } from "../lib/core.ts";

export async function openJarvisEvalDoctor() {
  const report = {
    ok: true,
    status: "OPENJARVIS_EVAL_HARNESS_CONTRACT_READY",
    role: "evaluation/spec harness only",
    not_role: "TriLane replacement",
    planned_specs: ["gremlin-spec.toml", "misfits-spec.toml", "model-efficiency.toml", "executor-comparison.toml"],
    scorecard_fields: ["latency", "energy_proxy", "tool_trace", "receipt", "oracle_grade", "budget"],
    promotion_rule: "Candidate router/executor/model must beat baseline before default promotion.",
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
