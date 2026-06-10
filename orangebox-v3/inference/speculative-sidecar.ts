import { isMain, writeReceipt } from "../lib/core.ts";

export async function speculativeDoctor() {
  const report = {
    ok: true,
    status: "SPECULATIVE_SIDECAR_CONTRACT_READY",
    feature_flag: "ORANGEBOX_SPECULATIVE_SIDECAR=0|1",
    draft_model: "qwen3:4b",
    verifier_candidates: ["deepseek-r1:32b", "mistral-small:24b"],
    runtime_candidate: "llama.cpp speculative sidecar first",
    allowed_initial_use: ["implementation drafting", "boilerplate", "local fast chat", "code suggestions"],
    forbidden_initial_use: ["high-risk architecture", "final judgement", "STRONGARM decisions", "legal/financial/medical", "visual model tasks"],
    required_benchmarks: ["tokens/sec", "TTFT", "acceptance rate", "quality comparison", "memory usage", "GPU stability"],
  };
  const receipt = await writeReceipt("speculative-sidecar-doctor", report);
  return { ...report, receipt_path: receipt.receipt_path };
}

if (isMain(import.meta.url)) {
  speculativeDoctor().then((out) => console.log(JSON.stringify(out, null, 2))).catch((error) => {
    console.error(JSON.stringify({ ok: false, status: "SPECULATIVE_FATAL", error: String(error?.stack || error) }, null, 2));
    process.exit(1);
  });
}
